from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.parish import Parish
from app.schemas.documents import ParishCreate, ParishResponse
from app.auth import verify_token
from typing import List

router = APIRouter()

@router.get("/", response_model=List[ParishResponse])
def list_parishes(db: Session = Depends(get_db), user=Depends(verify_token)):
    return db.query(Parish).all()

@router.post("/", response_model=ParishResponse)
def create_parish(parish: ParishCreate, db: Session = Depends(get_db), user=Depends(verify_token)):
    existing = db.query(Parish).filter(Parish.name == parish.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Parish already exists")
    db_parish = Parish(**parish.model_dump())
    db.add(db_parish)
    db.commit()
    db.refresh(db_parish)
    return db_parish