import asyncio
import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.models import ApiCache
from backend.app.schemas import Article, ClinVarVariant, ExternalGene, ProteinRecord, VariantAnnotation

NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
ENSEMBL_VEP_BASE = "https://rest.ensembl.org/vep/human/hgvs"
UNIPROT_SEARCH_URL = "https://rest.uniprot.org/uniprotkb/search"
USER_AGENT = "HYPERGEN-LAB/0.1 (local research tool)"
_request_lock = asyncio.Lock()
_last_request_started = 0.0


async def _throttle_ncbi() -> None:
    global _last_request_started
    async with _request_lock:
        delay = 0.34 - (time.monotonic() - _last_request_started)
        if delay > 0:
            await asyncio.sleep(delay)
        _last_request_started = time.monotonic()


async def _request(url: str, params: dict[str, str]) -> httpx.Response:
    settings = get_settings()
    query_params = {**params, "tool": settings.ncbi_tool}
    if settings.ncbi_email:
        query_params["email"] = settings.ncbi_email
    retryable_statuses = {429, 500, 502, 503, 504}
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": USER_AGENT}) as client:
        for attempt in range(3):
            await _throttle_ncbi()
            try:
                response = await client.get(url, params=query_params)
            except httpx.TransportError as exc:
                if attempt < 2:
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                raise HTTPException(status_code=502, detail=f"NCBI E-utilities no disponible: {exc}") from exc
            if response.status_code in retryable_statuses and attempt < 2:
                try:
                    retry_after = min(float(response.headers.get("Retry-After", "")), 5.0)
                except ValueError:
                    retry_after = 0.5 * (2**attempt)
                await asyncio.sleep(max(retry_after, 0))
                continue
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"NCBI E-utilities devolvió HTTP {exc.response.status_code}.",
                ) from exc
            return response
    raise HTTPException(status_code=502, detail="NCBI E-utilities no respondió tras los reintentos permitidos.")


def _cache_read(db: Session, provider: str, query_key: str) -> ApiCache | None:
    row = db.scalar(select(ApiCache).where(ApiCache.provider == provider, ApiCache.query_key == query_key))
    if not row:
        return None
    age = (datetime.now(timezone.utc) - row.fetched_at.replace(tzinfo=timezone.utc)).total_seconds()
    if age > get_settings().cache_ttl_seconds:
        return None
    return row


def _cache_write(
    db: Session,
    provider: str,
    query_key: str,
    request_url: str,
    response: object,
    *,
    api_version: str,
    raw_responses: list[dict[str, object] | str],
) -> ApiCache:
    row = db.scalar(select(ApiCache).where(ApiCache.provider == provider, ApiCache.query_key == query_key))
    if row is None:
        row = ApiCache(provider=provider, query_key=query_key, request_url=request_url, response_json="{}")
        db.add(row)
    row.request_url = request_url
    row.response_json = json.dumps(
        {"results": response, "raw_responses": raw_responses},
        ensure_ascii=False,
    )
    row.fetched_at = datetime.now(timezone.utc)
    row.api_version = api_version
    db.commit()
    db.refresh(row)
    return row


async def _get_json(url: str, params: dict[str, str]) -> dict:
    try:
        response = await _request(url, params)
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"NCBI E-utilities no disponible o respuesta no válida: {exc}") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="NCBI devolvió una estructura JSON inesperada.")
    return payload


async def _get_text(url: str, params: dict[str, str]) -> str:
    response = await _request(url, params)
    return response.text


async def _get_service_json(url: str, *, params: dict[str, str] | None = None) -> object:
    try:
        async with httpx.AsyncClient(
            timeout=30,
            headers={"Accept": "application/json", "User-Agent": USER_AGENT},
        ) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"La fuente externa devolvió HTTP {exc.response.status_code}.",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar la fuente externa: {exc}") from exc


def _normalize_label(value: object) -> str:
    return " ".join(str(value or "").casefold().split())


def _pubmed_term(query: str) -> str:
    parts = re.findall(r'"([^"]+)"|([\w][\w./-]*)', query, flags=re.UNICODE)
    terms = [phrase.strip() if phrase else token for phrase, token in parts]
    terms = [term for term in terms if term]
    if not terms:
        raise HTTPException(status_code=422, detail="Incluye al menos un término de búsqueda válido.")
    clauses = []
    for term in terms:
        escaped = term.replace('"', "")
        clauses.append(f'"{escaped}"[Title/Abstract]' if " " in escaped else f"{escaped}[Title/Abstract]")
    return " AND ".join(clauses)


async def search_genes(db: Session, query: str) -> tuple[datetime, list[ExternalGene]]:
    query = " ".join(query.strip().split())
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 -]{0,119}", query):
        raise HTTPException(
            status_code=422,
            detail="Busca por símbolo oficial, Gene ID de NCBI o nombre exacto; no se admiten consultas amplias.",
        )
    query_key = query.casefold()
    cache_provider = "ncbi_gene_search_exact_v2"
    cached = _cache_read(db, cache_provider, query_key)
    if cached:
        parsed = json.loads(cached.response_json)
        return cached.fetched_at, [ExternalGene.model_validate(item) for item in parsed["results"]]

    search_url = f"{NCBI_BASE}/esearch.fcgi"
    symbol_query = bool(re.fullmatch(r"[A-Za-z0-9-]+", query)) and not query.isdecimal()
    if query.isdecimal():
        ids = [query]
        search_payload: dict = {"exact_gene_id": query}
        request_url = f"{NCBI_BASE}/esummary.fcgi?{urlencode({'db': 'gene', 'id': query, 'retmode': 'json'})}"
    else:
        exact_term = f"{query}[Gene Name]" if symbol_query else f'"{query}"[Gene Name]'
        search_payload = await _get_json(search_url, {
            "db": "gene", "term": f"{exact_term} AND 9606[Taxonomy ID]",
            "retmode": "json", "retmax": "20",
        })
        try:
            ids = search_payload["esearchresult"]["idlist"]
        except (KeyError, TypeError) as exc:
            raise HTTPException(status_code=502, detail="NCBI Gene devolvió una estructura de búsqueda inesperada.") from exc
        request_url = f"{search_url}?{urlencode({'db': 'gene', 'term': exact_term + ' AND 9606[Taxonomy ID]', 'retmode': 'json'})}"
    results: list[ExternalGene] = []
    raw_responses: list[dict[str, object] | str] = [{"endpoint": "esearch", "response": search_payload}]
    if ids:
        summary_url = f"{NCBI_BASE}/esummary.fcgi"
        summary = await _get_json(summary_url, {"db": "gene", "id": ",".join(ids), "retmode": "json"})
        raw_responses.append({"endpoint": "esummary", "response": summary})
        try:
            records = summary["result"]
            for gene_id in ids:
                record = records[gene_id]
                organism = record.get("organism") or {}
                if str(organism.get("taxid", "")) != "9606":
                    continue
                symbol = str(record.get("nomenclaturesymbol") or record.get("name") or "")
                if symbol_query and symbol.casefold() != query.casefold():
                    continue
                if not symbol_query and not query.isdecimal():
                    official_name = record.get("nomenclaturename") or record.get("description") or ""
                    if _normalize_label(official_name) != _normalize_label(query):
                        continue
                results.append(ExternalGene(
                    id=str(gene_id),
                    symbol=symbol,
                    name=str(record.get("description") or record.get("name") or ""),
                    description=str(record.get("summary") or ""),
                ))
        except (KeyError, TypeError) as exc:
            raise HTTPException(status_code=502, detail="NCBI Gene devolvió una estructura de resumen inesperada.") from exc
    cached = _cache_write(
        db, cache_provider, query_key, request_url, [item.model_dump() for item in results],
        api_version="NCBI E-utilities; exact human Gene Name query",
        raw_responses=raw_responses,
    )
    return cached.fetched_at, results


async def search_pubmed(db: Session, query: str) -> tuple[datetime, list[Article]]:
    query_key = query.strip().casefold()
    cache_provider = "pubmed_search_title_abstract_and_v2"
    cached = _cache_read(db, cache_provider, query_key)
    if cached:
        parsed = json.loads(cached.response_json)
        return cached.fetched_at, [Article.model_validate(item) for item in parsed["results"]]

    pubmed_term = _pubmed_term(query)
    search_url = f"{NCBI_BASE}/esearch.fcgi"
    search_payload = await _get_json(search_url, {
        "db": "pubmed", "term": pubmed_term, "retmode": "json", "retmax": "15",
        "sort": "relevance",
    })
    try:
        ids = search_payload["esearchresult"]["idlist"]
    except (KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="PubMed devolvió una estructura de búsqueda inesperada.") from exc
    articles: list[Article] = []
    raw_responses: list[dict[str, object] | str] = [{"endpoint": "esearch", "response": search_payload}]
    if ids:
        summary_url = f"{NCBI_BASE}/esummary.fcgi"
        summary = await _get_json(summary_url, {"db": "pubmed", "id": ",".join(ids), "retmode": "json"})
        raw_responses.append({"endpoint": "esummary", "response": summary})
        try:
            records = summary["result"]
            for pmid in ids:
                item = records[pmid]
                authors = [author.get("name", "") for author in item.get("authors", []) if author.get("name")]
                doi = next((identifier.get("value") for identifier in item.get("articleids", []) if identifier.get("idtype") == "doi"), None)
                articles.append(Article(
                    pmid=str(pmid),
                    title=str(item.get("title") or "").rstrip("."),
                    journal=item.get("fulljournalname") or item.get("source"),
                    year=str(item.get("pubdate", ""))[:4] or None,
                    authors=authors,
                    doi=doi,
                    url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                ))
        except (KeyError, TypeError, AttributeError) as exc:
            raise HTTPException(status_code=502, detail="PubMed devolvió una estructura de resumen inesperada.") from exc
        abstract_url = f"{NCBI_BASE}/efetch.fcgi"
        abstract_xml = await _get_text(abstract_url, {"db": "pubmed", "id": ",".join(ids), "retmode": "xml"})
        raw_responses.append({"endpoint": "efetch", "response": abstract_xml})
        try:
            root = ET.fromstring(abstract_xml)
        except ET.ParseError as exc:
            raise HTTPException(status_code=502, detail="PubMed devolvió XML de abstracts no válido.") from exc
        abstracts: dict[str, str] = {}
        for article_node in root.findall(".//PubmedArticle"):
            pmid_node = article_node.find("./MedlineCitation/PMID")
            abstract_parts = article_node.findall("./MedlineCitation/Article/Abstract/AbstractText")
            if pmid_node is not None and pmid_node.text and abstract_parts:
                paragraphs = []
                for part in abstract_parts:
                    text = " ".join("".join(part.itertext()).split())
                    if text:
                        label = part.get("Label")
                        paragraphs.append(f"{label}: {text}" if label else text)
                abstracts[pmid_node.text] = "\n\n".join(paragraphs)
        articles = [article.model_copy(update={"abstract": abstracts.get(article.pmid)}) for article in articles]
    request_url = f"{search_url}?{urlencode({'db': 'pubmed', 'term': pubmed_term, 'retmode': 'json'})}"
    cached = _cache_write(
        db, cache_provider, query_key, request_url, [item.model_dump() for item in articles],
        api_version="NCBI E-utilities; Title/Abstract AND query",
        raw_responses=raw_responses,
    )
    return cached.fetched_at, articles


async def annotate_hgvs(db: Session, hgvs: str) -> tuple[datetime, str, list[VariantAnnotation]]:
    hgvs = hgvs.strip()
    if not hgvs or len(hgvs) > 200 or any(char in hgvs for char in "\r\n"):
        raise HTTPException(status_code=422, detail="Introduce una notación HGVS válida (máximo 200 caracteres).")
    if not re.match(r"^(?:[A-Za-z0-9_.-]+:)?(?:[0-9]+:)?(?:g|c|n|r|p|m)\.", hgvs):
        raise HTTPException(
            status_code=422,
            detail="Ensembl VEP requiere una variante en notación HGVS (por ejemplo, NM_000000.0:c.123A>G). Para buscar variantes por gen, usa el buscador de ClinVar.",
        )
    cache_provider = "ensembl_vep_hgvs_v1"
    query_key = hgvs.casefold()
    cached = _cache_read(db, cache_provider, query_key)
    encoded_hgvs = quote(hgvs, safe="")
    request_url = f"{ENSEMBL_VEP_BASE}/{encoded_hgvs}?content-type=application/json"
    if cached:
        parsed = json.loads(cached.response_json)
        return cached.fetched_at, cached.request_url, [VariantAnnotation.model_validate(item) for item in parsed["results"]]

    payload = await _get_service_json(request_url)
    if not isinstance(payload, list):
        raise HTTPException(status_code=502, detail="Ensembl VEP devolvió una estructura inesperada.")
    try:
        annotations = [VariantAnnotation.model_validate(item) for item in payload]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="No se pudo validar la respuesta de Ensembl VEP.") from exc
    cached = _cache_write(
        db, cache_provider, query_key, request_url, [item.model_dump() for item in annotations],
        api_version="Ensembl VEP REST API",
        raw_responses=[payload],
    )
    return cached.fetched_at, request_url, annotations


async def search_clinvar_variants(
    db: Session, gene_symbol: str,
) -> tuple[datetime, list[ClinVarVariant]]:
    gene_symbol = gene_symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9-]{1,32}", gene_symbol):
        raise HTTPException(status_code=422, detail="Introduce un símbolo génico oficial válido.")

    cache_provider = "ncbi_clinvar_gene_search_exact_v1"
    query_key = gene_symbol.casefold()
    cached = _cache_read(db, cache_provider, query_key)
    if cached:
        parsed = json.loads(cached.response_json)
        return cached.fetched_at, [ClinVarVariant.model_validate(item) for item in parsed["results"]]

    search_url = f"{NCBI_BASE}/esearch.fcgi"
    term = f"{gene_symbol}[gene] AND 9606[Taxonomy ID]"
    search_payload = await _get_json(search_url, {
        "db": "clinvar", "term": term, "retmode": "json", "retmax": "50",
        "sort": "relevance",
    })
    try:
        ids = search_payload["esearchresult"]["idlist"]
    except (KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="ClinVar devolvió una estructura de búsqueda inesperada.") from exc

    raw_responses: list[dict[str, object] | str] = [{"endpoint": "esearch", "response": search_payload}]
    variants: list[ClinVarVariant] = []
    if ids:
        summary_url = f"{NCBI_BASE}/esummary.fcgi"
        summary = await _get_json(summary_url, {
            "db": "clinvar", "id": ",".join(ids), "retmode": "json",
        })
        raw_responses.append({"endpoint": "esummary", "response": summary})
        try:
            records = summary["result"]
            for uid in ids:
                record = records[uid]
                matching_genes = [
                    item for item in record.get("genes", [])
                    if str(item.get("symbol", "")).casefold() == gene_symbol.casefold()
                ]
                if not matching_genes:
                    continue
                variation_set = record.get("variation_set") or []
                locations = [
                    location
                    for variation in variation_set
                    for location in variation.get("variation_loc", [])
                    if location.get("assembly_name") == "GRCh38"
                    and location.get("status") == "current"
                ]
                location = locations[0] if locations else {}
                classification = record.get("germline_classification") or {}
                hgvs = [
                    str(variation.get("variation_name"))
                    for variation in variation_set
                    if variation.get("variation_name")
                ]
                variants.append(ClinVarVariant(
                    uid=str(uid),
                    accession=record.get("accession"),
                    gene_symbol=gene_symbol,
                    title=str(record.get("title") or ""),
                    variant_type=(variation_set[0].get("variant_type") if variation_set else record.get("obj_type")),
                    hgvs=hgvs,
                    protein_change=record.get("protein_change") or None,
                    molecular_consequences=[
                        str(consequence)
                        for consequence in record.get("molecular_consequence_list", [])
                    ],
                    clinical_significance=classification.get("description") or None,
                    review_status=classification.get("review_status") or None,
                    last_evaluated=classification.get("last_evaluated") or None,
                    chromosome=location.get("chr") or None,
                    position_grch38=location.get("display_start") or None,
                ))
        except (KeyError, TypeError, AttributeError) as exc:
            raise HTTPException(status_code=502, detail="ClinVar devolvió un resumen de variantes inesperado.") from exc

    request_url = f"{search_url}?{urlencode({'db': 'clinvar', 'term': term, 'retmode': 'json'})}"
    cached = _cache_write(
        db, cache_provider, query_key, request_url, [item.model_dump() for item in variants],
        api_version="NCBI E-utilities ClinVar",
        raw_responses=raw_responses,
    )
    return cached.fetched_at, variants


async def search_uniprot(db: Session, gene_symbol: str) -> tuple[datetime, str, list[ProteinRecord]]:
    gene_symbol = gene_symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9-]{1,32}", gene_symbol):
        raise HTTPException(status_code=422, detail="Introduce un símbolo de gen válido.")
    cache_provider = "uniprot_gene_search_v1"
    query_key = gene_symbol.casefold()
    cached = _cache_read(db, cache_provider, query_key)
    params = {
        "query": f"gene:{gene_symbol} AND organism_id:9606",
        "format": "json",
        "size": "20",
    }
    request_url = f"{UNIPROT_SEARCH_URL}?{urlencode(params)}"
    if cached:
        parsed = json.loads(cached.response_json)
        return cached.fetched_at, cached.request_url, [ProteinRecord.model_validate(item) for item in parsed["results"]]

    payload = await _get_service_json(UNIPROT_SEARCH_URL, params=params)
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise HTTPException(status_code=502, detail="UniProt devolvió una estructura de búsqueda inesperada.")
    records: list[ProteinRecord] = []
    for item in payload["results"]:
        if not isinstance(item, dict):
            continue
        genes = item.get("genes") or []
        exact_gene = any(
            str((gene.get("geneName") or {}).get("value", "")).casefold() == gene_symbol.casefold()
            for gene in genes if isinstance(gene, dict)
        )
        organism = item.get("organism") or {}
        if not exact_gene or str(organism.get("taxonId", "")) != "9606":
            continue
        recommended = (item.get("proteinDescription") or {}).get("recommendedName") or {}
        protein_name = (recommended.get("fullName") or {}).get("value")
        if not protein_name:
            protein_name = (((item.get("proteinDescription") or {}).get("submissionNames") or [{}])[0].get("fullName") or {}).get("value", "")
        sequence = item.get("sequence") or {}
        functions = []
        for comment in item.get("comments") or []:
            if comment.get("commentType") == "FUNCTION":
                for text in comment.get("texts") or []:
                    value = text.get("value")
                    if value:
                        functions.append(value)
        records.append(ProteinRecord(
            accession=str(item.get("primaryAccession") or ""),
            protein_name=str(protein_name),
            gene_symbol=gene_symbol,
            reviewed=str(item.get("entryType", "")).startswith("UniProtKB reviewed"),
            length=sequence.get("length"),
            sequence=sequence.get("value"),
            function=functions,
        ))
    cached = _cache_write(
        db, cache_provider, query_key, request_url, [item.model_dump() for item in records],
        api_version="UniProtKB REST API",
        raw_responses=[payload],
    )
    return cached.fetched_at, request_url, records
