from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Gene(Base):
    __tablename__ = "genes"
    __table_args__ = (UniqueConstraint("symbol", name="uq_gene_symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    full_name: Mapped[str | None] = mapped_column(String(300))
    ncbi_gene_id: Mapped[str | None] = mapped_column(String(32), index=True)
    ensembl_gene_id: Mapped[str | None] = mapped_column(String(32), index=True)
    chromosome: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)
    evidence_status: Mapped[str] = mapped_column(String(40), default="candidate")
    source: Mapped[str] = mapped_column(String(200), default="user-defined candidate list")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Hypothesis(Base):
    __tablename__ = "hypotheses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(180))
    question: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="exploratory")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    evidence: Mapped[list["Evidence"]] = relationship(back_populates="hypothesis", cascade="all, delete-orphan")


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hypothesis_id: Mapped[int] = mapped_column(ForeignKey("hypotheses.id", ondelete="CASCADE"), index=True)
    direction: Mapped[str] = mapped_column(String(20))
    dimension: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text)
    study_design: Mapped[str | None] = mapped_column(String(200))
    source_name: Mapped[str] = mapped_column(String(300))
    source_id: Mapped[str | None] = mapped_column(String(120), index=True)
    source_url: Mapped[str | None] = mapped_column(Text)
    limitations: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    hypothesis: Mapped[Hypothesis] = relationship(back_populates="evidence")


class ApiCache(Base):
    __tablename__ = "api_cache"
    __table_args__ = (UniqueConstraint("provider", "query_key", name="uq_api_cache_provider_query"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(80), index=True)
    query_key: Mapped[str] = mapped_column(String(500))
    request_url: Mapped[str] = mapped_column(Text)
    response_json: Mapped[str] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    api_version: Mapped[str | None] = mapped_column(String(80))
