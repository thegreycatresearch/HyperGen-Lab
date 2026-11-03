from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class GeneCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9-]+$")
    full_name: str | None = Field(default=None, max_length=300)


class GeneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    symbol: str
    full_name: str | None
    ncbi_gene_id: str | None
    ensembl_gene_id: str | None
    chromosome: str | None
    description: str | None
    evidence_status: str
    source: str
    updated_at: datetime


class HypothesisCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    question: str = Field(min_length=5, max_length=2000)
    rationale: str | None = Field(default=None, max_length=5000)


class HypothesisRead(BaseModel):
    id: int
    title: str
    question: str | None
    rationale: str | None
    status: str
    created_at: datetime
    evidence_count: int


class EvidenceCreate(BaseModel):
    direction: Literal["supports", "opposes", "indirect", "unknown"]
    dimension: Literal[
        "association", "biological_plausibility", "functional",
        "genetic_causality", "hEDS_relevance", "pharmacogenomics",
    ]
    description: str = Field(min_length=5, max_length=5000)
    study_design: str | None = Field(default=None, max_length=200)
    source_name: str = Field(min_length=1, max_length=300)
    source_id: str | None = Field(default=None, max_length=120)
    source_url: HttpUrl | None = None
    limitations: str | None = Field(default=None, max_length=3000)


class EvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    direction: str
    dimension: str
    description: str
    study_design: str | None
    source_name: str
    source_id: str | None
    source_url: str | None
    limitations: str | None
    created_at: datetime


class ExternalGene(BaseModel):
    id: str
    symbol: str
    name: str
    description: str


class GeneSearchResponse(BaseModel):
    source: str
    fetched_at: datetime
    results: list[ExternalGene]


class VariantTranscriptConsequence(BaseModel):
    gene_id: str | None = None
    gene_symbol: str | None = None
    transcript_id: str | None = None
    biotype: str | None = None
    consequence_terms: list[str] = Field(default_factory=list)
    amino_acids: str | None = None
    codons: str | None = None
    protein_start: int | None = None
    protein_end: int | None = None


class VariantAnnotation(BaseModel):
    input: str
    id: str | None = None
    seq_region_name: str | None = None
    start: int | None = None
    end: int | None = None
    allele_string: str | None = None
    most_severe_consequence: str | None = None
    transcript_consequences: list[VariantTranscriptConsequence] = Field(default_factory=list)


class VariantAnnotationResponse(BaseModel):
    source: str
    fetched_at: datetime
    request_url: str
    notice: str
    results: list[VariantAnnotation]


class ClinVarVariant(BaseModel):
    uid: str
    accession: str | None = None
    gene_symbol: str
    title: str
    variant_type: str | None = None
    hgvs: list[str] = Field(default_factory=list)
    protein_change: str | None = None
    molecular_consequences: list[str] = Field(default_factory=list)
    clinical_significance: str | None = None
    review_status: str | None = None
    last_evaluated: str | None = None
    chromosome: str | None = None
    position_grch38: str | None = None


class ClinVarSearchResponse(BaseModel):
    source: str
    fetched_at: datetime
    query: str
    results: list[ClinVarVariant]


class ProteinRecord(BaseModel):
    accession: str
    protein_name: str
    gene_symbol: str
    reviewed: bool
    length: int | None = None
    sequence: str | None = None
    function: list[str] = Field(default_factory=list)


class ProteinSearchResponse(BaseModel):
    source: str
    fetched_at: datetime
    request_url: str
    results: list[ProteinRecord]


class Article(BaseModel):
    pmid: str
    title: str
    journal: str | None
    year: str | None
    authors: list[str]
    doi: str | None
    abstract: str | None = None
    url: str


class LiteratureSearchResponse(BaseModel):
    source: str
    fetched_at: datetime
    results: list[Article]
