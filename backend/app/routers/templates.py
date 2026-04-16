from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_token
from pydantic import BaseModel
from typing import Optional, List
from app.models.extraction_template import ExtractionTemplate

router = APIRouter()


# --- Schemas ---

class FieldPattern(BaseModel):
    field_name: str           # e.g., "cost_of_replacement_new"
    label: str                # e.g., "Cost of Replacement New"
    regex_pattern: str        # e.g., r"Cost of Replacement New[:\s]*\$?([\d,]+)"
    context_before: str       # Text that appeared before the value
    context_after: str        # Text that appeared after the value


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    field_patterns: List[FieldPattern]
    table_config: Optional[dict] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    field_patterns: Optional[List[FieldPattern]] = None
    table_config: Optional[dict] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    field_patterns: list
    table_config: Optional[dict]
    is_default: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# --- Endpoints ---

@router.get("/", response_model=List[TemplateResponse])
def list_templates(db: Session = Depends(get_db), user=Depends(verify_token)):
    templates = db.query(ExtractionTemplate).order_by(ExtractionTemplate.updated_at.desc()).all()
    return [_to_response(t) for t in templates]


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    template = db.query(ExtractionTemplate).filter(ExtractionTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return _to_response(template)


@router.post("/", response_model=TemplateResponse)
def create_template(data: TemplateCreate, db: Session = Depends(get_db), user=Depends(verify_token)):
    template = ExtractionTemplate(
        name=data.name,
        description=data.description,
        field_patterns=[fp.model_dump() for fp in data.field_patterns],
        table_config=data.table_config,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _to_response(template)


@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: Session = Depends(get_db),
    user=Depends(verify_token),
):
    template = db.query(ExtractionTemplate).filter(ExtractionTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if data.name is not None:
        template.name = data.name
    if data.description is not None:
        template.description = data.description
    if data.field_patterns is not None:
        template.field_patterns = [fp.model_dump() for fp in data.field_patterns]
    if data.table_config is not None:
        template.table_config = data.table_config

    db.commit()
    db.refresh(template)
    return _to_response(template)


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    template = db.query(ExtractionTemplate).filter(ExtractionTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
    return {"detail": "Template deleted"}


@router.post("/{template_id}/set-default")
def set_default_template(template_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    # Unset all defaults
    db.query(ExtractionTemplate).update({ExtractionTemplate.is_default: False})
    # Set new default
    template = db.query(ExtractionTemplate).filter(ExtractionTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_default = True
    db.commit()
    return {"detail": f"'{template.name}' is now the default template"}


def _to_response(t: ExtractionTemplate) -> TemplateResponse:
    return TemplateResponse(
        id=t.id,
        name=t.name,
        description=t.description,
        field_patterns=t.field_patterns,
        table_config=t.table_config,
        is_default=t.is_default,
        created_at=t.created_at.isoformat() if t.created_at else "",
        updated_at=t.updated_at.isoformat() if t.updated_at else "",
    )