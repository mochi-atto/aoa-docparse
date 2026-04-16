from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

# --- Building ---
class BuildingCreate(BaseModel):
    name: str
    account_numbers: Optional[dict] = None  # {"electric": "ACCT-001", ...}

class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    account_numbers: Optional[dict] = None

class BuildingResponse(BaseModel):
    id: int
    name: str
    account_numbers: Optional[dict] = None
    class Config:
        from_attributes = True

# --- Parish ---
class ParishCreate(BaseModel):
    name: str
    diocese: Optional[str] = None
    address: Optional[str] = None
    buildings: Optional[List[str]] = None  # List of building names on creation

class ParishUpdate(BaseModel):
    name: Optional[str] = None
    diocese: Optional[str] = None
    address: Optional[str] = None
    image_data: Optional[str] = None

class ParishResponse(BaseModel):
    id: int
    name: str
    diocese: Optional[str]
    address: Optional[str]
    image_data: Optional[str] = None
    buildings: Optional[List[BuildingResponse]] = None
    class Config:
        from_attributes = True

# --- Upload Response ---
class UploadResponse(BaseModel):
    success: bool
    message: str
    extracted_data: dict

# --- Chart Data ---
class UtilityChartPoint(BaseModel):
    id: Optional[int] = None
    bill_date: date
    total_amount: float
    utility_type: Optional[str] = None
    provider_name: Optional[str] = None
    service_address: Optional[str] = None
    building_name: Optional[str] = None
    account_number: Optional[str] = None
    original_filename: Optional[str] = None
    usage_quantity: Optional[float] = None
    usage_unit: Optional[str] = None

class AppraisalChartPoint(BaseModel):
    id: Optional[int] = None
    original_filename: Optional[str] = None
    valuation_number: Optional[str] = None
    building_name: Optional[str] = None
    building_value: Optional[float] = None
    content_value: Optional[float] = None
    total_valuation: Optional[float] = None
    gross_sq_ft: Optional[float] = None
    entity_name: Optional[str] = None
    appraisal_date: Optional[str] = None
    property_address: Optional[str] = None
    appraiser_firm: Optional[str] = None
    expiration_date: Optional[str] = None