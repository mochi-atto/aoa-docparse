from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
import datetime

from app.database import get_db
from app.auth import parish_access, parish_admin_access, parish_editor_access
from app.models.asset import Asset, AssetDocument
from app.models.history_entry import HistoryEntry
from app.services import temp_asset_storage, temp_manual_lookup

router = APIRouter()


# ── Schemas ──

class AssetCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1)
    asset_type: Optional[str] = None
    location: str = Field(min_length=1)
    manufacturer: Optional[str] = None
    year_installed: int = Field(ge=1800, le=2200)
    expected_life: int = Field(ge=1, le=500)
    initial_cost: float = Field(ge=0)
    accrual_override: Optional[float] = Field(default=None, ge=0)
    # TEMPORARY manual lookup: catalog names the user chose to attach on save
    catalog_manuals: List[str] = Field(default_factory=list, max_length=30)


class AssetUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    name: Optional[str] = Field(default=None, min_length=1)
    asset_type: Optional[str] = None
    location: Optional[str] = Field(default=None, min_length=1)
    manufacturer: Optional[str] = None
    year_installed: Optional[int] = Field(default=None, ge=1800, le=2200)
    expected_life: Optional[int] = Field(default=None, ge=1, le=500)
    initial_cost: Optional[float] = Field(default=None, ge=0)
    # Send null to reset to initial_cost / expected_life; omit to leave unchanged
    accrual_override: Optional[float] = Field(default=None, ge=0)

    @field_validator("name", "location", "year_installed", "expected_life", "initial_cost")
    @classmethod
    def not_null(cls, value):
        if value is None:
            raise ValueError("This field cannot be null")
        return value


class DocumentResponse(BaseModel):
    id: int
    filename: str
    source: str  # "upload" | "catalog"
    has_file: bool
    size_bytes: Optional[int]
    created_at: datetime.datetime


class AssetResponse(BaseModel):
    id: int
    parish_id: int
    name: str
    asset_type: Optional[str]
    location: str
    manufacturer: Optional[str]
    year_installed: int
    expected_life: int
    initial_cost: float
    accrual_override: Optional[float]
    remaining_life: int  # derived: expected_life - (this year - year_installed), floored at 0
    annual_accrual: float  # derived: accrual_override, else initial_cost / expected_life
    documents: List[DocumentResponse]
    created_at: datetime.datetime


class CatalogAttach(BaseModel):
    filenames: List[str] = Field(min_length=1, max_length=30)


class ManualLookupResponse(BaseModel):
    temporary: bool = True  # lookup is a stand-in catalog, not a real search
    manuals: List[str]


def _doc(d: AssetDocument) -> DocumentResponse:
    return DocumentResponse(id=d.id, filename=d.filename, source=d.source, has_file=d.storage_path is not None,
                            size_bytes=d.size_bytes, created_at=d.created_at)


def _asset(a: Asset) -> AssetResponse:
    remaining = max(0, a.expected_life - max(0, datetime.date.today().year - a.year_installed))
    accrual = a.accrual_override if a.accrual_override is not None else a.initial_cost / a.expected_life
    return AssetResponse(
        id=a.id, parish_id=a.parish_id, name=a.name, asset_type=a.asset_type, location=a.location,
        manufacturer=a.manufacturer, year_installed=a.year_installed, expected_life=a.expected_life,
        initial_cost=a.initial_cost, accrual_override=a.accrual_override, remaining_life=remaining,
        annual_accrual=accrual, documents=[_doc(d) for d in sorted(a.documents, key=lambda d: d.id)],
        created_at=a.created_at,
    )


def _get_asset(db: Session, parish_id: int, asset_id: int) -> Asset:
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.parish_id == parish_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


def _log(db: Session, parish_id: int, entry_type: str, description: str, actor: str):
    db.add(HistoryEntry(parish_id=parish_id, entry_type=entry_type, description=description, snapshot={"actor_sub": actor}))


# ── Asset endpoints ──

@router.get("/{parish_id}/assets", response_model=List[AssetResponse])
def list_assets(parish_id: int, db: Session = Depends(get_db), membership=Depends(parish_access)):
    assets = db.query(Asset).options(selectinload(Asset.documents)).filter(Asset.parish_id == parish_id).order_by(Asset.created_at.asc()).all()
    return [_asset(a) for a in assets]


@router.post("/{parish_id}/assets", response_model=AssetResponse)
def create_asset(parish_id: int, data: AssetCreate, db: Session = Depends(get_db), membership=Depends(parish_admin_access)):
    asset = Asset(parish_id=parish_id, **data.model_dump(exclude={"catalog_manuals"}))
    db.add(asset)
    for name in dict.fromkeys(data.catalog_manuals):
        asset.documents.append(AssetDocument(filename=name, source="catalog"))
    _log(db, parish_id, "asset", f'Asset added: "{asset.name}" ({asset.location})', membership.account.auth0_sub)
    db.commit()
    db.refresh(asset)
    return _asset(asset)


@router.put("/{parish_id}/assets/{asset_id}", response_model=AssetResponse)
def update_asset(parish_id: int, asset_id: int, data: AssetUpdate, db: Session = Depends(get_db), membership=Depends(parish_admin_access)):
    asset = _get_asset(db, parish_id, asset_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is None and field not in ("accrual_override", "asset_type", "manufacturer"):
            continue
        setattr(asset, field, value)
    if changes:
        _log(db, parish_id, "asset", f'Asset updated: "{asset.name}" ({", ".join(sorted(changes))})', membership.account.auth0_sub)
    db.commit()
    db.refresh(asset)
    return _asset(asset)


@router.delete("/{parish_id}/assets/{asset_id}")
def delete_asset(parish_id: int, asset_id: int, db: Session = Depends(get_db), membership=Depends(parish_admin_access)):
    asset = _get_asset(db, parish_id, asset_id)
    paths = [d.storage_path for d in asset.documents]
    _log(db, parish_id, "asset", f'Asset removed: "{asset.name}"', membership.account.auth0_sub)
    db.delete(asset)
    db.commit()
    for p in paths:
        temp_asset_storage.delete_path(p)
    return {"detail": "Asset deleted"}


# ── TEMPORARY manual lookup (stand-in catalog; see services/temp_manual_lookup.py) ──

@router.get("/{parish_id}/assets/manual-lookup", response_model=ManualLookupResponse)
def manual_lookup(parish_id: int, asset_type: Optional[str] = None, manufacturer: Optional[str] = None, membership=Depends(parish_access)):
    return ManualLookupResponse(manuals=temp_manual_lookup.find_manuals(asset_type, manufacturer))


# ── Document endpoints (file bytes go through TEMPORARY local storage) ──

@router.post("/{parish_id}/assets/{asset_id}/documents", response_model=AssetResponse)
def upload_documents(parish_id: int, asset_id: int, files: List[UploadFile] = File(...), db: Session = Depends(get_db), membership=Depends(parish_editor_access)):
    asset = _get_asset(db, parish_id, asset_id)
    if not 1 <= len(files) <= 10:
        raise HTTPException(status_code=422, detail="Attach between 1 and 10 files per request")
    saved = []
    try:
        for f in files:
            try:
                path, size = temp_asset_storage.save_upload(asset.id, f)
            except temp_asset_storage.InvalidFile:
                raise HTTPException(status_code=422, detail="Only valid PDF, PNG, JPEG, or plain text documents are supported")
            except temp_asset_storage.FileTooLarge:
                raise HTTPException(status_code=413, detail=f"{f.filename} exceeds the 25 MB limit")
            saved.append(path)
            asset.documents.append(AssetDocument(filename=temp_asset_storage.safe_filename(f.filename), source="upload",
                                                 storage_path=path, content_type="application/octet-stream", size_bytes=size))
        _log(db, parish_id, "asset", f'Documents attached to "{asset.name}": {", ".join(f.filename or "document" for f in files)}', membership.account.auth0_sub)
        db.commit()
    except Exception:
        db.rollback()
        for p in saved:
            temp_asset_storage.delete_path(p)
        raise
    db.refresh(asset)
    return _asset(asset)


@router.post("/{parish_id}/assets/{asset_id}/documents/catalog", response_model=AssetResponse)
def attach_catalog_manuals(parish_id: int, asset_id: int, data: CatalogAttach, db: Session = Depends(get_db), membership=Depends(parish_editor_access)):
    asset = _get_asset(db, parish_id, asset_id)
    have = {d.filename for d in asset.documents}
    new = [n for n in dict.fromkeys(data.filenames) if n not in have]
    for name in new:
        asset.documents.append(AssetDocument(filename=name, source="catalog"))
    if new:
        _log(db, parish_id, "asset", f'Manuals attached to "{asset.name}": {", ".join(new)}', membership.account.auth0_sub)
    db.commit()
    db.refresh(asset)
    return _asset(asset)


@router.get("/{parish_id}/assets/{asset_id}/documents/{doc_id}/file")
def download_document(parish_id: int, asset_id: int, doc_id: int, db: Session = Depends(get_db), membership=Depends(parish_access)):
    asset = _get_asset(db, parish_id, asset_id)
    doc = next((d for d in asset.documents if d.id == doc_id), None)
    path = temp_asset_storage.open_path(doc.storage_path) if doc and doc.storage_path else None
    if not doc or not path:
        raise HTTPException(status_code=404, detail="Document file not found")
    return FileResponse(path, media_type="application/octet-stream", filename=temp_asset_storage.safe_filename(doc.filename), headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.delete("/{parish_id}/assets/{asset_id}/documents/{doc_id}", response_model=AssetResponse)
def delete_document(parish_id: int, asset_id: int, doc_id: int, db: Session = Depends(get_db), membership=Depends(parish_editor_access)):
    asset = _get_asset(db, parish_id, asset_id)
    doc = next((d for d in asset.documents if d.id == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = doc.storage_path
    asset.documents.remove(doc)
    _log(db, parish_id, "asset", f'Document removed from "{asset.name}": {doc.filename}', membership.account.auth0_sub)
    db.commit()
    temp_asset_storage.delete_path(path)
    db.refresh(asset)
    return _asset(asset)
