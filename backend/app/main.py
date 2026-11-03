from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.config import get_settings
from backend.app.database import Base, SessionLocal, engine, get_db
from backend.app.models import ApiCache, Evidence, Gene, Hypothesis
from backend.app.schemas import (
    ClinVarSearchResponse, EvidenceCreate, EvidenceRead, GeneCreate, GeneRead, GeneSearchResponse,
    HypothesisCreate, HypothesisRead, LiteratureSearchResponse, ProteinSearchResponse,
    VariantAnnotationResponse,
)
from backend.app.seed import seed_candidate_genes
from backend.app.services.ncbi import (
    annotate_hgvs, search_clinvar_variants, search_genes, search_pubmed, search_uniprot,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_candidate_genes(db)
    yield


app = FastAPI(
    title=settings.app_name,
    description="Herramienta local de organización de evidencia; no determina causalidad ni ofrece consejo clínico.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict[str, int | datetime | None]:
    last_update = db.scalar(select(func.max(ApiCache.fetched_at)))
    return {
        "candidate_genes": db.scalar(select(func.count(Gene.id))) or 0,
        "variants": 0,
        "proteins": 0,
        "interactions": 0,
        "publications": 0,
        "hypotheses": db.scalar(select(func.count(Hypothesis.id))) or 0,
        "analyses": 0,
        "last_external_update": last_update,
    }


@app.get("/api/genes", response_model=list[GeneRead])
def list_genes(q: str | None = Query(default=None, max_length=120), db: Session = Depends(get_db)) -> list[Gene]:
    statement = select(Gene).order_by(Gene.symbol)
    if q:
        needle = f"%{q.strip()}%"
        statement = statement.where((Gene.symbol.ilike(needle)) | (Gene.full_name.ilike(needle)) | (Gene.description.ilike(needle)))
    return list(db.scalars(statement))


@app.post("/api/genes", response_model=GeneRead, status_code=201)
def create_gene(payload: GeneCreate, db: Session = Depends(get_db)) -> Gene:
    symbol = payload.symbol.upper()
    existing = db.scalar(select(Gene).where(Gene.symbol == symbol))
    if existing:
        raise HTTPException(status_code=409, detail=f"{symbol} ya existe en el catálogo local.")
    gene = Gene(
        symbol=symbol,
        full_name=payload.full_name,
        evidence_status="candidate",
        source="added locally by user; not an established hEDS causal association",
    )
    db.add(gene)
    db.commit()
    db.refresh(gene)
    return gene


@app.get("/api/external/genes", response_model=GeneSearchResponse)
async def external_gene_search(
    q: str = Query(min_length=1, max_length=120), db: Session = Depends(get_db),
) -> GeneSearchResponse:
    fetched_at, results = await search_genes(db, q)
    return GeneSearchResponse(source="NCBI Gene via Entrez E-utilities", fetched_at=fetched_at, results=results)


@app.get("/api/literature/search", response_model=LiteratureSearchResponse)
async def literature_search(
    q: str = Query(min_length=1, max_length=500), db: Session = Depends(get_db),
) -> LiteratureSearchResponse:
    fetched_at, results = await search_pubmed(db, q)
    return LiteratureSearchResponse(source="PubMed via NCBI Entrez E-utilities", fetched_at=fetched_at, results=results)


@app.get("/api/variants/annotate", response_model=VariantAnnotationResponse)
async def variant_annotation(
    hgvs: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db),
) -> VariantAnnotationResponse:
    fetched_at, request_url, results = await annotate_hgvs(db, hgvs)
    return VariantAnnotationResponse(
        source="Ensembl Variant Effect Predictor (VEP)",
        fetched_at=fetched_at,
        request_url=request_url,
        notice=(
            "Anotación de consecuencias computacional. No equivale a clasificación clínica, "
            "patogenicidad ni causalidad de enfermedad."
        ),
        results=results,
    )


@app.get("/api/variants/search", response_model=ClinVarSearchResponse)
async def clinvar_variant_search(
    gene: str = Query(min_length=1, max_length=32), db: Session = Depends(get_db),
) -> ClinVarSearchResponse:
    fetched_at, results = await search_clinvar_variants(db, gene)
    return ClinVarSearchResponse(
        source="NCBI ClinVar via Entrez E-utilities",
        fetched_at=fetched_at,
        query=gene.strip().upper(),
        results=results,
    )


@app.get("/api/proteins/search", response_model=ProteinSearchResponse)
async def protein_search(
    gene: str = Query(min_length=1, max_length=32), db: Session = Depends(get_db),
) -> ProteinSearchResponse:
    fetched_at, request_url, results = await search_uniprot(db, gene)
    return ProteinSearchResponse(
        source="UniProtKB REST API",
        fetched_at=fetched_at,
        request_url=request_url,
        results=results,
    )


@app.get("/api/hypotheses", response_model=list[HypothesisRead])
def list_hypotheses(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Hypothesis).order_by(Hypothesis.created_at.desc())).all()
    return [{
        "id": row.id, "title": row.title, "question": row.question, "rationale": row.rationale,
        "status": row.status, "created_at": row.created_at, "evidence_count": len(row.evidence),
    } for row in rows]


@app.post("/api/hypotheses", response_model=HypothesisRead, status_code=201)
def create_hypothesis(payload: HypothesisCreate, db: Session = Depends(get_db)) -> dict:
    hypothesis = Hypothesis(title=payload.title, question=payload.question, rationale=payload.rationale, status="exploratory")
    db.add(hypothesis)
    db.commit()
    db.refresh(hypothesis)
    return {
        "id": hypothesis.id, "title": hypothesis.title, "question": hypothesis.question,
        "rationale": hypothesis.rationale, "status": hypothesis.status,
        "created_at": hypothesis.created_at, "evidence_count": 0,
    }


@app.get("/api/hypotheses/{hypothesis_id}/evidence", response_model=list[EvidenceRead])
def list_evidence(hypothesis_id: int, db: Session = Depends(get_db)) -> list[Evidence]:
    if db.get(Hypothesis, hypothesis_id) is None:
        raise HTTPException(status_code=404, detail="Hipótesis no encontrada.")
    return list(db.scalars(select(Evidence).where(Evidence.hypothesis_id == hypothesis_id).order_by(Evidence.created_at.desc())))


@app.post("/api/hypotheses/{hypothesis_id}/evidence", response_model=EvidenceRead, status_code=201)
def add_evidence(hypothesis_id: int, payload: EvidenceCreate, db: Session = Depends(get_db)) -> Evidence:
    if db.get(Hypothesis, hypothesis_id) is None:
        raise HTTPException(status_code=404, detail="Hipótesis no encontrada.")
    evidence = Evidence(hypothesis_id=hypothesis_id, **payload.model_dump(mode="json"))
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return evidence
