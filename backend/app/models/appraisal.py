from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import datetime

class Appraisal(Base):
    __tablename__ = "appraisals"

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    # Document metadata
    original_filename = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Extracted fields (adjust based on your actual appraisal documents)
    property_address = Column(String, nullable=True)
    parcel_id = Column(String, nullable=True)
    tax_year = Column(Integer, nullable=True)
    appraisal_date = Column(Date, nullable=True)

    # Values
    land_value = Column(Float, nullable=True)
    building_value = Column(Float, nullable=True)
    total_appraised_value = Column(Float, nullable=True)
    assessed_value = Column(Float, nullable=True)
    tax_amount = Column(Float, nullable=True)
    millage_rate = Column(Float, nullable=True)
    exemptions = Column(Float, nullable=True)             # e.g., religious exemption amount

    # Raw extraction for debugging
    raw_extracted = Column(JSON, nullable=True)

    parish = relationship("Parish", back_populates="appraisals")