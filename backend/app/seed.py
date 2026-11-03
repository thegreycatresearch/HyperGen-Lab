from sqlalchemy.orm import Session

from backend.app.models import Gene

CANDIDATE_GENES = (
    "TNXB", "TNXA", "COL5A1", "COL5A2", "COL3A1", "COL1A1", "COL1A2",
    "PLOD1", "FKBP14", "ADAMTS2", "AEBP1", "B3GALT6", "B4GALT7",
    "SLC39A13", "ZNF469", "LTBP2", "FBN1", "FLNA", "TGFBR1", "TGFBR2",
    "SMAD2", "SMAD3", "SMAD4", "TGFB2", "TGFB3",
)


def seed_candidate_genes(db: Session) -> None:
    existing = {symbol for (symbol,) in db.query(Gene.symbol).all()}
    for symbol in CANDIDATE_GENES:
        if symbol not in existing:
            db.add(Gene(
                symbol=symbol,
                evidence_status="candidate",
                source="user-defined starting list; not an established hEDS causal association",
            ))
    db.commit()
