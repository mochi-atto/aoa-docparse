from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.parish import Parish
from app.models.building import Building
from app.schemas.documents import (
    ParishCreate, ParishUpdate, ParishResponse,
    BuildingCreate, BuildingUpdate, BuildingResponse,
)
from app.auth import verify_token
from typing import List

router = APIRouter()


@router.get("/", response_model=List[ParishResponse])
def list_parishes(db: Session = Depends(get_db), user=Depends(verify_token)):
    return db.query(Parish).all()


@router.post("/", response_model=ParishResponse)
def create_parish(data: ParishCreate, db: Session = Depends(get_db), user=Depends(verify_token)):
    existing = db.query(Parish).filter(Parish.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Parish already exists")
    parish = Parish(name=data.name, diocese=data.diocese, address=data.address)
    db.add(parish)
    db.flush()  # Get the parish ID before adding buildings

    # Create buildings if provided
    if data.buildings:
        for bname in data.buildings:
            if bname.strip():
                db.add(Building(parish_id=parish.id, name=bname.strip()))

    db.commit()
    db.refresh(parish)
    return parish


@router.get("/{parish_id}", response_model=ParishResponse)
def get_parish(parish_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    parish = db.query(Parish).filter(Parish.id == parish_id).first()
    if not parish:
        raise HTTPException(status_code=404, detail="Parish not found")
    return parish


@router.put("/{parish_id}", response_model=ParishResponse)
def update_parish(parish_id: int, data: ParishUpdate, db: Session = Depends(get_db), user=Depends(verify_token)):
    parish = db.query(Parish).filter(Parish.id == parish_id).first()
    if not parish:
        raise HTTPException(status_code=404, detail="Parish not found")
    if data.name is not None:
        parish.name = data.name
    if data.diocese is not None:
        parish.diocese = data.diocese
    if data.address is not None:
        parish.address = data.address
    if data.image_data is not None:
        parish.image_data = data.image_data
    db.commit()
    db.refresh(parish)
    return parish


@router.delete("/{parish_id}")
def delete_parish(parish_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    parish = db.query(Parish).filter(Parish.id == parish_id).first()
    if not parish:
        raise HTTPException(status_code=404, detail="Parish not found")
    db.delete(parish)
    db.commit()
    return {"detail": "Parish deleted"}


# ── Building CRUD ──

@router.get("/{parish_id}/buildings", response_model=List[BuildingResponse])
def list_buildings(parish_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    return db.query(Building).filter(Building.parish_id == parish_id).order_by(Building.id.asc()).all()


@router.post("/{parish_id}/buildings", response_model=BuildingResponse)
def create_building(parish_id: int, data: BuildingCreate, db: Session = Depends(get_db), user=Depends(verify_token)):
    building = Building(parish_id=parish_id, name=data.name, account_numbers=data.account_numbers or {})
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.put("/{parish_id}/buildings/{building_id}", response_model=BuildingResponse)
def update_building(parish_id: int, building_id: int, data: BuildingUpdate, db: Session = Depends(get_db), user=Depends(verify_token)):
    building = db.query(Building).filter(Building.id == building_id, Building.parish_id == parish_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if data.name is not None:
        building.name = data.name
    if data.account_numbers is not None:
        building.account_numbers = data.account_numbers
    db.commit()
    db.refresh(building)
    return building


@router.delete("/{parish_id}/buildings/{building_id}")
def delete_building(parish_id: int, building_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    building = db.query(Building).filter(Building.id == building_id, Building.parish_id == parish_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    db.delete(building)
    db.commit()
    return {"detail": "Building deleted"}