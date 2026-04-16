from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_token
from app.models.utility_bill import UtilityBill
from app.models.appraisal import Appraisal
from app.models.building import Building
from app.models.history_entry import HistoryEntry
from app.schemas.documents import UtilityChartPoint, AppraisalChartPoint
from typing import List

router = APIRouter()

# ── Utility type normalization ──
# The LLM may return "trash", "sewer", "sewage", etc. — normalize to canonical types.
UTIL_TYPE_MAP = {
    "electric": "electric", "electricity": "electric", "power": "electric",
    "water": "water",
    "gas": "gas", "natural gas": "gas",
    "waste": "waste", "trash": "waste", "garbage": "waste", "refuse": "waste", "solid waste": "waste",
    "sewer": "waste", "sewage": "waste", "wastewater": "waste",
    "internet": "internet", "phone": "phone", "other": "other",
}

def _normalize_util_type(raw: str | None) -> str:
    if not raw:
        return "other"
    return UTIL_TYPE_MAP.get(raw.lower().strip(), raw.lower().strip())


def _build_account_map(parish_id: int, db: Session) -> dict[str, str]:
    buildings = db.query(Building).filter(Building.parish_id == parish_id).all()
    acct_map: dict[str, str] = {}
    for b in buildings:
        if b.account_numbers and isinstance(b.account_numbers, dict):
            for _util_type, acct_num in b.account_numbers.items():
                if acct_num:
                    acct_map[str(acct_num).strip()] = b.name
    return acct_map


@router.get("/utility/{parish_id}", response_model=List[UtilityChartPoint])
def get_utility_data(
    parish_id: int,
    utility_type: str = Query(None),
    building_name: str = Query(None),
    db: Session = Depends(get_db),
    user=Depends(verify_token),
):
    query = db.query(UtilityBill).filter(UtilityBill.parish_id == parish_id)
    if utility_type:
        query = query.filter(UtilityBill.utility_type == utility_type)
    if building_name:
        query = query.filter(UtilityBill.building_name == building_name)
    records = query.order_by(UtilityBill.bill_date.asc()).all()

    acct_map = _build_account_map(parish_id, db)

    results = []
    for r in records:
        resolved_building = r.building_name
        if not resolved_building and r.account_number:
            resolved_building = acct_map.get(str(r.account_number).strip())
        if not resolved_building:
            resolved_building = r.service_address

        results.append(UtilityChartPoint(
            id=r.id,
            bill_date=r.bill_date,
            total_amount=r.total_amount,
            utility_type=_normalize_util_type(r.utility_type),
            provider_name=r.provider_name,
            service_address=r.service_address,
            building_name=resolved_building,
            account_number=r.account_number,
            original_filename=r.original_filename,
            usage_quantity=r.usage_quantity,
            usage_unit=r.usage_unit,
        ))

    return results


@router.put("/utility/{bill_id}")
def update_utility_bill(
    bill_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(verify_token),
):
    record = db.query(UtilityBill).filter(UtilityBill.id == bill_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Utility bill not found")

    changes = []
    editable_str = {"provider_name", "utility_type", "service_address", "building_name", "account_number", "usage_unit"}
    editable_float = {"total_amount", "usage_quantity", "rate"}
    editable_date = {"bill_date", "due_date", "billing_period_start", "billing_period_end"}

    for key, val in data.items():
        if key in editable_str and val is not None:
            old = getattr(record, key)
            new_val = str(val).strip() if val else None
            # Normalize utility type on edit
            if key == "utility_type" and new_val:
                new_val = _normalize_util_type(new_val)
            setattr(record, key, new_val)
            if str(old) != str(new_val):
                changes.append(f"{key}: {old} → {new_val}")
        elif key in editable_float and val is not None:
            old = getattr(record, key)
            try:
                new_val = float(str(val).replace("$", "").replace(",", ""))
                setattr(record, key, new_val)
                if old != new_val:
                    changes.append(f"{key}: {old} → {new_val}")
            except ValueError:
                pass
        elif key in editable_date and val is not None:
            from datetime import date as date_type
            old = getattr(record, key)
            try:
                new_val = date_type.fromisoformat(str(val))
                setattr(record, key, new_val)
                if old != new_val:
                    changes.append(f"{key}: {old} → {new_val}")
            except ValueError:
                pass

    if changes:
        desc = f"Edited utility bill ({_normalize_util_type(record.utility_type)}, {record.bill_date}): {'; '.join(changes)}"
        db.add(HistoryEntry(parish_id=record.parish_id, entry_type="task_changed", description=desc))

    db.commit()
    return {"detail": "Utility bill updated", "changes": changes}


@router.delete("/utility/{bill_id}")
def delete_utility_bill(bill_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    record = db.query(UtilityBill).filter(UtilityBill.id == bill_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Utility bill not found")
    desc = f"Deleted utility bill: {_normalize_util_type(record.utility_type)} ${record.total_amount:.2f} ({record.bill_date})"
    db.add(HistoryEntry(parish_id=record.parish_id, entry_type="task_changed", description=desc))
    db.delete(record)
    db.commit()
    return {"detail": "Utility bill deleted"}


# ── Appraisal endpoints ──

@router.get("/appraisal/{parish_id}", response_model=List[AppraisalChartPoint])
def get_appraisal_data(parish_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    records = db.query(Appraisal).filter(Appraisal.parish_id == parish_id).order_by(Appraisal.appraisal_date.asc()).all()
    results = []
    for r in records:
        doc_fields = {
            "entity_name": r.entity_name,
            "appraisal_date": str(r.appraisal_date) if r.appraisal_date else None,
            "property_address": r.property_address,
            "appraiser_firm": r.appraiser_firm,
        }
        expiration = None
        if r.raw_extracted and isinstance(r.raw_extracted, dict):
            expiration = r.raw_extracted.get("expiration_date")
        doc_fields["expiration_date"] = str(expiration) if expiration else None

        sections = None
        if r.raw_extracted and isinstance(r.raw_extracted, dict):
            sections = r.raw_extracted.get("sections")

        if sections and isinstance(sections, list):
            for sec in sections:
                results.append(AppraisalChartPoint(
                    id=r.id, original_filename=r.original_filename,
                    valuation_number=sec.get("valuation_number"),
                    building_name=sec.get("building_name"),
                    building_value=_to_float(sec.get("building_value")),
                    content_value=_to_float(sec.get("content_value")),
                    total_valuation=_to_float(sec.get("total_valuation")),
                    gross_sq_ft=_to_float(sec.get("gross_sq_ft")),
                    **doc_fields,
                ))
        else:
            results.append(AppraisalChartPoint(
                id=r.id, original_filename=r.original_filename,
                valuation_number=None, building_name=r.entity_name,
                building_value=_to_float(r.cost_of_replacement_new),
                content_value=None,
                total_valuation=_to_float(r.cost_less_exclusions),
                gross_sq_ft=_to_float(r.gross_sq_ft),
                **doc_fields,
            ))
    return results


@router.delete("/appraisal/{appraisal_id}")
def delete_appraisal(appraisal_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    record = db.query(Appraisal).filter(Appraisal.id == appraisal_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Appraisal not found")
    desc = f"Deleted appraisal: {record.entity_name or 'Unknown'} ({record.appraisal_date})"
    db.add(HistoryEntry(parish_id=record.parish_id, entry_type="task_changed", description=desc))
    db.delete(record)
    db.commit()
    return {"detail": "Appraisal deleted"}


@router.post("/appraisal/manual")
def create_appraisal_manual(data: dict, db: Session = Depends(get_db), user=Depends(verify_token)):
    from datetime import date as date_type

    parish_id = data.get("parish_id")
    if not parish_id:
        raise HTTPException(status_code=400, detail="parish_id is required")

    appraisal_date = None
    if data.get("appraisal_date"):
        try: appraisal_date = date_type.fromisoformat(str(data["appraisal_date"]))
        except ValueError: pass

    buildings_data = data.get("buildings", [])
    building_breakdown = []
    sections = []
    for b in buildings_data:
        building_breakdown.append({
            "name": b.get("name", ""),
            "cost_of_reproduction_new": _to_float(b.get("building_value")),
            "gross_sq_ft": _to_float(b.get("gross_sq_ft")),
        })
        sections.append({
            "building_name": b.get("name", ""),
            "building_value": b.get("building_value"),
            "total_valuation": b.get("building_value"),  # same as building value for simple entry
            "valuation_number": b.get("valuation_number"),
            "gross_sq_ft": b.get("gross_sq_ft"),
        })

    total_replacement = sum(b.get("cost_of_reproduction_new", 0) or 0 for b in building_breakdown)

    raw_extracted = {
        "sections": sections,
        "expiration_date": data.get("expiration_date"),
        "entry_method": "manual",
    }

    record = Appraisal(
        parish_id=parish_id,
        original_filename=data.get("filename", "manual_entry"),
        entity_name=data.get("entity_name"),
        property_address=data.get("property_address"),
        appraisal_date=appraisal_date,
        cost_of_replacement_new=total_replacement or _to_float(data.get("cost_of_replacement_new")),
        appraiser_firm=data.get("appraiser_firm"),
        gross_sq_ft=int(str(data["gross_sq_ft"]).replace(",", "")) if data.get("gross_sq_ft") else None,
        building_breakdown=building_breakdown,
        raw_extracted=raw_extracted,
    )
    db.add(record)
    db.add(HistoryEntry(
        parish_id=parish_id, entry_type="upload",
        description=f"Appraisal entered: {data.get('entity_name', 'Unknown')} ({data.get('filename', 'manual')})"
    ))
    db.commit()
    return {"detail": "Appraisal saved", "id": record.id}


# ── Mark history as removed ──

@router.post("/history/{entry_id}/mark-removed")
def mark_history_removed(entry_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    """Mark a history entry as 'removed' (data was deleted) without deleting the entry itself."""
    entry = db.query(HistoryEntry).filter(HistoryEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    entry.undone = "removed"
    db.commit()
    return {"detail": "Marked as removed"}


def _to_float(val) -> float | None:
    if val is None: return None
    try:
        if isinstance(val, str): return float(val.replace(",", "").replace("$", ""))
        return float(val)
    except (ValueError, TypeError): return None