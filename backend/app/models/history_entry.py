from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import datetime


class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    entry_type = Column(String, nullable=False)  # upload, task_added, task_changed, task_addressed, edit, delete
    description = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # For undo support
    related_type = Column(String, nullable=True)   # "utility_bill" or "appraisal"
    related_id = Column(Integer, nullable=True)     # ID of the record that was changed/deleted
    snapshot = Column(JSON, nullable=True)           # Full previous state for undo
    undone = Column(String, nullable=True)           # Set to "yes" if this action was undone

    parish = relationship("Parish", back_populates="history_entries")