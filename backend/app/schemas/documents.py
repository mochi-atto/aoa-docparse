from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

# --- Parish ---
class ParishCreate(BaseModel):
    name: str
    diocese: Optional[str] = None
    address: Optional[str] = None

class ParishResponse(BaseModel):
    id: int
    name: str
    diocese: Optional[str]
    address: Optional[str]

    class Config:
        from_attributes = True

# --- Utility Bill ---
class UtilityBillResponse(BaseModel):
    id: int
    provider_name: Optional[str]
    utility_type: Optional[str]
    service_address: Optional[str]
    building_name: Optional[str]
    bill_date: date
    total_amount: float
    usage_quantity: Optional[float]
    usage_unit: Optional[str]
    uploaded_at: datetime

    class Config:
        from_attributes = True

# --- Appraisal ---
class AppraisalResponse(BaseModel):
    id: int
    entity_name: Optional[str]
    appraisal_date: Optional[date]
    property_address: Optional[str]
    cost_of_replacement_new: Optional[float]
    total_exclusions: Optional[float]
    cost_less_exclusions: Optional[float]
    flood_value: Optional[float]
    year_built: Optional[int]
    num_stories: Optional[int]
    gross_sq_ft: Optional[int]
    construction_type: Optional[str]
    uploaded_at: datetime

    class Config:
        from_attributes = True

# --- Upload Response ---
class UploadResponse(BaseModel):
    success: bool
    message: str
    extracted_data: dict

# --- Chart Data ---
class UtilityChartPoint(BaseModel):
    bill_date: date
    total_amount: float
    utility_type: Optional[str]
    provider_name: Optional[str]
    service_address: Optional[str]
    building_name: Optional[str]

class AppraisalChartPoint(BaseModel):
    appraisal_date: Optional[date]
    entity_name: Optional[str]
    cost_of_replacement_new: Optional[float]
    total_exclusions: Optional[float]
    cost_less_exclusions: Optional[float]
    flood_value: Optional[float]