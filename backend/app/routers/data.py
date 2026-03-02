from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_token
from app.models.utility_bill import UtilityBill
from app.models.appraisal import Appraisal
from app.schemas.documents import UtilityChartPoint, AppraisalChartPoint
from typing import List

router = APIRouter()

@router.get("/utility/{parish_id}", response_model=List[UtilityChartPoint])
def get_utility_data(
    parish_id: int,
    utility_type: str = Query(None, description="Filter by type: electric, gas, water, etc."),
    building_name: str = Query(None, description="Filter by building name"),
    db: Session = Depends(get_db),
    user=Depends(verify_token),
):
    query = db.query(UtilityBill).filter(UtilityBill.parish_id == parish_id)
    if utility_type:
        query = query.filter(UtilityBill.utility_type == utility_type)
    if building_name:
        query = query.filter(UtilityBill.building_name == building_name)
    records = query.order_by(UtilityBill.bill_date.asc()).all()
    return [
        UtilityChartPoint(
            bill_date=r.bill_date,
            total_amount=r.total_amount,
            utility_type=r.utility_type,
            provider_name=r.provider_name,
            service_address=r.service_address,
            building_name=r.building_name,
        )
        for r in records
    ]

@router.get("/appraisal/{parish_id}", response_model=List[AppraisalChartPoint])
def get_appraisal_data(
    parish_id: int,
    db: Session = Depends(get_db),
    user=Depends(verify_token),
):
    records = (
        db.query(Appraisal)
        .filter(Appraisal.parish_id == parish_id)
        .order_by(Appraisal.appraisal_date.asc())
        .all()
    )
    return [
        AppraisalChartPoint(
            appraisal_date=r.appraisal_date,
            entity_name=r.entity_name,
            cost_of_replacement_new=r.cost_of_replacement_new,
            total_exclusions=r.total_exclusions,
            cost_less_exclusions=r.cost_less_exclusions,
            flood_value=r.flood_value,
        )
        for r in records
    ]