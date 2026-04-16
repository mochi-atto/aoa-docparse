from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from app.database import Base
import datetime

class Parish(Base):
    __tablename__ = "parishes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    diocese = Column(String, nullable=True)
    address = Column(String, nullable=True)
    image_data = Column(Text, nullable=True)  # Base64 data URL for parish photo
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    utility_bills = relationship("UtilityBill", back_populates="parish", cascade="all, delete-orphan")
    appraisals = relationship("Appraisal", back_populates="parish", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="parish", cascade="all, delete-orphan")
    history_entries = relationship("HistoryEntry", back_populates="parish", cascade="all, delete-orphan")
    buildings = relationship("Building", back_populates="parish", cascade="all, delete-orphan")