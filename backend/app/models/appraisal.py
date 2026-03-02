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

    # Identification
    entity_name = Column(String, nullable=True)
    property_address = Column(String, nullable=True)
    county = Column(String, nullable=True)
    appraisal_date = Column(Date, nullable=True)

    # Key values
    cost_of_replacement_new = Column(Float, nullable=True)
    total_exclusions = Column(Float, nullable=True)
    cost_less_exclusions = Column(Float, nullable=True)
    flood_value = Column(Float, nullable=True)

    # Building details
    year_built = Column(Integer, nullable=True)
    num_stories = Column(Integer, nullable=True)
    gross_sq_ft = Column(Integer, nullable=True)
    construction_type = Column(String, nullable=True)

    # Appraiser info
    appraiser_firm = Column(String, nullable=True)
    appraiser_name = Column(String, nullable=True)

    # Building breakdown stored as JSON array
    building_breakdown = Column(JSON, nullable=True)

    # Raw extraction for debugging
    raw_extracted = Column(JSON, nullable=True)

    parish = relationship("Parish", back_populates="appraisals")