from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_token
from app.schemas.documents import UploadResponse
from app.parsers.utility_parser import parse_utility_bill
from app.parsers.appraisal_parser import parse_appraisal
from app.models.utility_bill import UtilityBill
from app.models.appraisal import Appraisal
import tempfile
import os

router = APIRouter()


def _serialize_for_json(data: dict) -> dict:
    """Convert date objects to strings for JSON storage."""
    result = {**data}
    for key, val in result.items():
        if hasattr(val, "isoformat"):
            result[key] = val.isoformat()
    return result


@router.post("/", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    parish_id: int = Form(...),
    doc_type: str = Form(...),  # "utility" or "appraisal"
    db: Session = Depends(get_db),
    user=Depends(verify_token),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    if doc_type not in ("utility", "appraisal"):
        raise HTTPException(status_code=400, detail="doc_type must be 'utility' or 'appraisal'")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if doc_type == "utility":
            # Parser now returns a LIST of bills
            bills = parse_utility_bill(tmp_path)

            if not bills:
                return UploadResponse(
                    success=False,
                    message="No utility bill data could be extracted from this document.",
                    extracted_data={},
                )

            records_created = 0
            all_extracted = []

            for bill in bills:
                raw_for_json = _serialize_for_json(bill)
                all_extracted.append(raw_for_json)

                record = UtilityBill(
                    parish_id=parish_id,
                    original_filename=file.filename,
                    provider_name=bill.get("provider_name"),
                    utility_type=bill.get("utility_type"),
                    bill_date=bill.get("bill_date"),
                    due_date=bill.get("due_date"),
                    billing_period_start=bill.get("billing_period_start"),
                    billing_period_end=bill.get("billing_period_end"),
                    account_number=bill.get("account_number"),
                    total_amount=bill.get("total_amount", 0),
                    usage_quantity=bill.get("usage_quantity"),
                    usage_unit=bill.get("usage_unit"),
                    rate=bill.get("rate"),
                    raw_extracted=raw_for_json,
                )
                db.add(record)
                records_created += 1

            db.commit()

            # Build a descriptive message
            if records_created == 1:
                b = bills[0]
                addr = b.get("service_address") or b.get("building_name") or ""
                addr_str = f" ({addr})" if addr else ""
                message = (
                    f"Utility bill parsed: ${b.get('total_amount', 0):.2f} "
                    f"from {b.get('provider_name', 'Unknown')}{addr_str}"
                )
            else:
                total_sum = sum(b.get("total_amount", 0) for b in bills)
                # Summarize by building if multiple
                buildings = set()
                for b in bills:
                    addr = b.get("service_address") or b.get("building_name")
                    if addr:
                        buildings.add(addr)
                building_str = (
                    f" across {len(buildings)} building{'s' if len(buildings) > 1 else ''}"
                    if buildings
                    else ""
                )
                message = (
                    f"Extracted {records_created} billing records{building_str} "
                    f"— total: ${total_sum:,.2f}"
                )

            return UploadResponse(
                success=True,
                message=message,
                extracted_data={
                    "records_created": records_created,
                    "bills": all_extracted,
                },
            )

        else:  # appraisal
            extracted = parse_appraisal(tmp_path)

            raw_for_json = _serialize_for_json(extracted)

            record = Appraisal(
                parish_id=parish_id,
                original_filename=file.filename,
                entity_name=extracted.get("entity_name"),
                property_address=extracted.get("property_address"),
                county=extracted.get("county"),
                appraisal_date=extracted.get("appraisal_date"),
                cost_of_replacement_new=extracted.get("cost_of_replacement_new"),
                total_exclusions=extracted.get("total_exclusions"),
                cost_less_exclusions=extracted.get("cost_less_exclusions"),
                flood_value=extracted.get("flood_value"),
                year_built=extracted.get("year_built"),
                num_stories=extracted.get("num_stories"),
                gross_sq_ft=extracted.get("gross_sq_ft"),
                construction_type=extracted.get("construction_type"),
                appraiser_firm=extracted.get("appraiser_firm"),
                appraiser_name=extracted.get("appraiser_name"),
                building_breakdown=extracted.get("building_breakdown"),
                raw_extracted=raw_for_json,
            )
            db.add(record)
            db.commit()

            cost = extracted.get("cost_of_replacement_new")
            cost_str = f"${cost:,.2f}" if cost else "N/A"
            return UploadResponse(
                success=True,
                message=f"Appraisal parsed: {extracted.get('entity_name', 'Unknown')} — Replacement Cost: {cost_str}",
                extracted_data=raw_for_json,
            )

    finally:
        os.unlink(tmp_path)  # Clean up temp file