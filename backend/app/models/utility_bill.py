from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import datetime

class UtilityBill(Base):
    __tablename__ = "utility_bills"

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    # Document metadata
    original_filename = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Extracted fields
    provider_name = Column(String, nullable=True)        # e.g., "Georgia Power"
    utility_type = Column(String, nullable=True)          # electric, gas, water, sewer, etc.
    service_address = Column(String, nullable=True)       # Specific address this bill is for
    building_name = Column(String, nullable=True)         # Short label: "Rectory", "Church", etc.
    bill_date = Column(Date, nullable=False)              # The date ON the bill
    due_date = Column(Date, nullable=True)
    billing_period_start = Column(Date, nullable=True)
    billing_period_end = Column(Date, nullable=True)
    account_number = Column(String, nullable=True)

    # Financial
    total_amount = Column(Float, nullable=False)
    usage_quantity = Column(Float, nullable=True)         # e.g., 1200 kWh
    usage_unit = Column(String, nullable=True)            # kWh, therms, gallons, etc.
    rate = Column(Float, nullable=True)                   # cost per unit if available

    # Raw extraction for debugging
    raw_extracted = Column(JSON, nullable=True)           # Full LLM response

    parish = relationship("Parish", back_populates="utility_bills")