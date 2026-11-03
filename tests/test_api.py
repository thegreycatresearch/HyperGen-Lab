import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import main
from backend.app.services import ncbi


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    test_session = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", test_engine)
    monkeypatch.setattr(main, "SessionLocal", test_session)

    def override_get_db():
        yield from _test_db(test_session)

    main.app.dependency_overrides[main.get_db] = override_get_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()
    test_engine.dispose()


def _test_db(session_factory):
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


def test_health_and_seeded_candidate_list(client):
    health = client.get("/api/health")
    genes = client.get("/api/genes")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert len(genes.json()) == 25
    assert all(gene["evidence_status"] == "candidate" for gene in genes.json())


def test_hypothesis_and_evidence_preserve_direction_and_source(client):
    created = client.post("/api/hypotheses", json={
        "title": "Exploratory mechanism", "question": "Can this mechanism be tested?",
    })
    assert created.status_code == 201
    hypothesis_id = created.json()["id"]
    response = client.post(f"/api/hypotheses/{hypothesis_id}/evidence", json={
        "direction": "opposes",
        "dimension": "functional",
        "description": "A test entry used only for API validation.",
        "source_name": "Test source",
        "source_id": "TEST-1",
        "source_url": "https://example.org/study",
        "limitations": "Synthetic test fixture; not scientific data.",
    })
    evidence = client.get(f"/api/hypotheses/{hypothesis_id}/evidence")
    assert response.status_code == 201
    assert evidence.json()[0]["direction"] == "opposes"
    assert evidence.json()[0]["source_id"] == "TEST-1"
    assert "Synthetic test fixture" in evidence.json()[0]["limitations"]


def test_gene_duplicate_is_explicit_conflict(client):
    result = client.post("/api/genes", json={"symbol": "TNXB"})
    assert result.status_code == 409


def test_pubmed_search_uses_ncbi_contract_and_caches_response(client, monkeypatch):
    calls = []

    async def fake_get_json(url, params):
        calls.append((url, params))
        if url.endswith("/esearch.fcgi"):
            return {"esearchresult": {"idlist": ["12345678"]}}
        return {
            "result": {
                "uids": ["12345678"],
                "12345678": {
                    "title": "A test publication.",
                    "pubdate": "2024 Jan",
                    "fulljournalname": "Example Journal",
                    "authors": [{"name": "Researcher A"}],
                    "articleids": [{"idtype": "doi", "value": "10.1000/example"}],
                },
            },
        }

    async def fake_get_text(url, params):
        assert url.endswith("/efetch.fcgi")
        return (
            "<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345678</PMID>"
            "<Article><Abstract><AbstractText Label='RESULTS'>Observed in a test record.</AbstractText>"
            "</Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>"
        )

    monkeypatch.setattr(ncbi, "_get_json", fake_get_json)
    monkeypatch.setattr(ncbi, "_get_text", fake_get_text)
    first = client.get("/api/literature/search", params={"q": "hEDS test"})
    second = client.get("/api/literature/search", params={"q": "hEDS test"})

    assert first.status_code == 200
    article = first.json()["results"][0]
    assert article["pmid"] == "12345678"
    assert article["doi"] == "10.1000/example"
    assert article["authors"] == ["Researcher A"]
    assert article["abstract"] == "RESULTS: Observed in a test record."
    assert second.json() == first.json()
    assert len(calls) == 2
    assert calls[0][1]["term"] == "hEDS[Title/Abstract] AND test[Title/Abstract]"


def test_gene_symbol_search_uses_exact_human_term_and_rejects_other_gene(client, monkeypatch):
    calls = []

    async def fake_get_json(url, params):
        calls.append((url, params))
        if url.endswith("/esearch.fcgi"):
            return {"esearchresult": {"idlist": ["7148", "7422"]}}
        return {
            "result": {
                "uids": ["7148", "7422"],
                "7148": {
                    "name": "TNXB",
                    "nomenclaturesymbol": "TNXB",
                    "nomenclaturename": "tenascin XB",
                    "description": "tenascin XB",
                    "organism": {"taxid": 9606},
                    "summary": "Tenascin-X summary.",
                },
                "7422": {
                    "name": "VEGFA",
                    "nomenclaturesymbol": "VEGFA",
                    "nomenclaturename": "vascular endothelial growth factor A",
                    "description": "vascular endothelial growth factor A",
                    "organism": {"taxid": 9606},
                    "summary": "Unrelated gene summary.",
                },
            },
        }

    monkeypatch.setattr(ncbi, "_get_json", fake_get_json)
    response = client.get("/api/external/genes", params={"q": "TNXB"})

    assert response.status_code == 200
    assert [gene["symbol"] for gene in response.json()["results"]] == ["TNXB"]
    assert calls[0][1]["term"] == "TNXB[Gene Name] AND 9606[Taxonomy ID]"


def test_ensembl_vep_hgvs_annotation_is_cached_and_not_called_clinical(client, monkeypatch):
    calls = []

    async def fake_service_json(url, params=None):
        calls.append((url, params))
        return [{
            "input": "ENST00000366667:c.803C>T",
            "id": "rs1228544607",
            "seq_region_name": "1",
            "start": 230710021,
            "end": 230710021,
            "allele_string": "C/T",
            "most_severe_consequence": "missense_variant",
            "transcript_consequences": [{
                "gene_id": "ENSG00000000001",
                "gene_symbol": "TEST1",
                "transcript_id": "ENST00000366667",
                "consequence_terms": ["missense_variant"],
                "amino_acids": "A/V",
                "codons": "Gct/Gtt",
            }],
        }]

    monkeypatch.setattr(ncbi, "_get_service_json", fake_service_json)
    first = client.get("/api/variants/annotate", params={"hgvs": "ENST00000366667:c.803C>T"})
    second = client.get("/api/variants/annotate", params={"hgvs": "ENST00000366667:c.803C>T"})

    assert first.status_code == 200
    assert first.json()["results"][0]["transcript_consequences"][0]["gene_symbol"] == "TEST1"
    assert "No equivale a clasificación clínica" in first.json()["notice"]
    assert "rest.ensembl.org/vep/human/hgvs/" in first.json()["request_url"]
    assert second.json() == first.json()
    assert len(calls) == 1


def test_vep_rejects_gene_symbol_with_helpful_hgvs_error(client):
    response = client.get("/api/variants/annotate", params={"hgvs": "TNXB"})
    assert response.status_code == 422
    assert "buscador de ClinVar" in response.json()["detail"]


def test_clinvar_search_by_gene_returns_only_exact_gene_associations(client, monkeypatch):
    calls = []

    async def fake_get_json(url, params):
        calls.append((url, params))
        if url.endswith("/esearch.fcgi"):
            return {"esearchresult": {"idlist": ["1001", "1002"]}}
        return {
            "result": {
                "uids": ["1001", "1002"],
                "1001": {
                    "accession": "VCV000000001",
                    "title": "NM_000000.0(TNXB):c.1A>G",
                    "obj_type": "single nucleotide variant",
                    "variation_set": [{
                        "variation_name": "NM_000000.0(TNXB):c.1A>G",
                        "variant_type": "single nucleotide variant",
                        "variation_loc": [{
                            "assembly_name": "GRCh38", "status": "current",
                            "chr": "6", "display_start": "32082201",
                        }],
                    }],
                    "genes": [{"symbol": "TNXB", "geneid": "7148"}],
                    "germline_classification": {
                        "description": "Uncertain significance",
                        "review_status": "criteria provided, single submitter",
                        "last_evaluated": "2026/06/17",
                    },
                    "molecular_consequence_list": ["missense variant"],
                    "protein_change": "V1191I",
                },
                "1002": {
                    "accession": "VCV000000002",
                    "title": "VEGFA variant",
                    "genes": [{"symbol": "VEGFA", "geneid": "7422"}],
                },
            },
        }

    monkeypatch.setattr(ncbi, "_get_json", fake_get_json)
    response = client.get("/api/variants/search", params={"gene": "TNXB"})

    assert response.status_code == 200
    assert response.json()["query"] == "TNXB"
    assert len(response.json()["results"]) == 1
    variant = response.json()["results"][0]
    assert variant["gene_symbol"] == "TNXB"
    assert variant["clinical_significance"] == "Uncertain significance"
    assert variant["position_grch38"] == "32082201"
    assert calls[0][1]["db"] == "clinvar"
    assert calls[0][1]["term"] == "TNXB[gene] AND 9606[Taxonomy ID]"


def test_uniprot_gene_search_filters_symbol_and_human_organism(client, monkeypatch):
    async def fake_service_json(url, params=None):
        return {
            "results": [
                {
                    "entryType": "UniProtKB reviewed (Swiss-Prot)",
                    "primaryAccession": "P22105",
                    "organism": {"taxonId": 9606},
                    "genes": [{"geneName": {"value": "TNXB"}}],
                    "proteinDescription": {"recommendedName": {"fullName": {"value": "Tenascin-X"}}},
                    "sequence": {"length": 4245, "value": "MPEPTIDE"},
                    "comments": [{"commentType": "FUNCTION", "texts": [{"value": "Example function statement."}]}],
                },
                {
                    "entryType": "UniProtKB reviewed (Swiss-Prot)",
                    "primaryAccession": "Q00000",
                    "organism": {"taxonId": 9606},
                    "genes": [{"geneName": {"value": "VEGFA"}}],
                    "proteinDescription": {"recommendedName": {"fullName": {"value": "VEGFA"}}},
                },
                {
                    "entryType": "UniProtKB reviewed (Swiss-Prot)",
                    "primaryAccession": "Q00001",
                    "organism": {"taxonId": 10090},
                    "genes": [{"geneName": {"value": "TNXB"}}],
                },
            ]
        }

    monkeypatch.setattr(ncbi, "_get_service_json", fake_service_json)
    response = client.get("/api/proteins/search", params={"gene": "TNXB"})

    assert response.status_code == 200
    records = response.json()["results"]
    assert [record["accession"] for record in records] == ["P22105"]
    assert records[0]["reviewed"] is True
    assert records[0]["function"] == ["Example function statement."]
