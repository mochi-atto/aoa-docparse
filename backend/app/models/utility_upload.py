"""Atomic receipts for client-keyed utility upload retries."""
from sqlalchemy import Column, Integer, String, ForeignKey, JSON, UniqueConstraint
from app.database import Base


class UtilityUpload(Base):
    __tablename__ = 'utility_uploads'
    __table_args__ = (UniqueConstraint('parish_id', 'upload_key'),)
    id = Column(Integer, primary_key=True)
    parish_id = Column(Integer, ForeignKey('parishes.id', ondelete='CASCADE'), nullable=False)
    upload_key = Column(String(100), nullable=False)
    fingerprint = Column(String(64), nullable=False)
    response = Column(JSON, nullable=False)
