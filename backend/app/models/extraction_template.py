from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean
from app.database import Base
import datetime


class ExtractionTemplate(Base):
    __tablename__ = "extraction_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)                  # e.g., "Broward County Insurance Appraisal"
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    is_default = Column(Boolean, default=False)            # If true, used as fallback

    # The field mappings — list of {field_name, label, regex_pattern, context_before, context_after}
    field_patterns = Column(JSON, nullable=False)

    # Optional: table extraction config
    table_config = Column(JSON, nullable=True)