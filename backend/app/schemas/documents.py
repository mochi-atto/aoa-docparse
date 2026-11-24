from pydantic import BaseModel, Field, ConfigDict
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
    role: Optional[str] = None
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
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    usage_note: Optional[str] = None
    energy_per_sq_ft: Optional[float] = None
    energy_unit: str = "kBtu/ft²"
    valuation_sq_ft: Optional[float] = None
    valuation_date: Optional[str] = None

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

class ManualUtilityBill(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    parish_id: int
    building_name: str | None = None
    provider_name: str | None = None
    account_number: str | None = None
    utility_type: str
    bill_date: date
    total_amount: float
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    usage_quantity: float | None = Field(None, ge=0)
    usage_unit: str | None = None
    usage_note: str | None = Field(None, max_length=2000)
