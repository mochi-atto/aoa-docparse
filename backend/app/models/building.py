from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import datetime


class Building(Base):
    __tablename__ = "buildings"

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    name = Column(String, nullable=False)  # e.g., "Main Church", "Rectory", "Parish Hall"

    # Account numbers mapped to this building, keyed by utility type
    # e.g., {"electric": "ACCT-001", "water": "ACCT-002", "gas": "ACCT-003"}
    account_numbers = Column(JSON, nullable=True, default=dict)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    parish = relationship("Parish", back_populates="buildings")