from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
import datetime


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    parish_id = Column(Integer, ForeignKey("parishes.id"), nullable=False)

    name = Column(String, nullable=False)
    asset_type = Column(String, nullable=True)  # e.g. "HVAC unit"; drives suggestions + manual lookup
    location = Column(String, nullable=False)
    manufacturer = Column(String, nullable=True)
    year_installed = Column(Integer, nullable=False)
    expected_life = Column(Integer, nullable=False)  # years
    initial_cost = Column(Float, nullable=False)
    # Manually edited annual accrual; NULL means "use initial_cost / expected_life"
    accrual_override = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    parish = relationship("Parish", back_populates="assets")
    documents = relationship("AssetDocument", back_populates="asset", cascade="all, delete-orphan")


class AssetDocument(Base):
    __tablename__ = "asset_documents"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)

    filename = Column(String, nullable=False)
    source = Column(String, nullable=False, default="upload")  # "upload" | "catalog"
    # TEMPORARY: path under the local upload dir. NULL for catalog entries (name only, no file).
    storage_path = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    asset = relationship("Asset", back_populates="documents")
