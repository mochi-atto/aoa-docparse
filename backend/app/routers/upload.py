from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import parish_admin_access, parish_access, current_account
from app.schemas.documents import UploadResponse
from app.parsers.utility_parser import parse_utility_bill
from app.parsers.appraisal_parser import parse_appraisal
from app.models.utility_bill import UtilityBill
from app.models.appraisal import Appraisal
from app.models.history_entry import HistoryEntry
import tempfile
import os

router = APIRouter()
MAX_PDF_BYTES = 25 * 1024 * 1024


def _serialize_for_json(data: dict) -> dict:
    """Convert dates, including nested appraisal section dates, for JSON storage."""
    return jsonable_encoder(data)


def upload_admin_access(parish_id: int = Form(...), account=Depends(current_account), db: Session = Depends(get_db)):
    return parish_admin_access(parish_access(parish_id, account, db))


@router.post("/", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    parish_id: int = Form(...),
    doc_type: str = Form(...),  # "utility" or "appraisal"
    extracted_text: str | None = Form(None),
    db: Session = Depends(get_db),
    membership=Depends(upload_admin_access),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    if doc_type not in ("utility", "appraisal"):
        raise HTTPException(status_code=400, detail="doc_type must be 'utility' or 'appraisal'")

    content = await file.read(MAX_PDF_BYTES + 1)
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds the 25 MB limit")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a PDF")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if doc_type == "utility":
            # Parser now returns a LIST of bills
            bills = parse_utility_bill(tmp_path, extracted_text=extracted_text)

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
                    service_address=bill.get("service_address"),
                    building_name=bill.get("building_name"),
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

            db.add(HistoryEntry(
                parish_id=parish_id, entry_type="upload",
                description=f"Utility upload: {file.filename} ({records_created} records)",
                snapshot={"actor_sub": membership.account.auth0_sub},
            ))
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

        else:  # appraisal: local PDF parsing only; never sent to an AI service
            # Fetch the active template (default first, then any)
            from app.models.extraction_template import ExtractionTemplate
            template_record = (
                db.query(ExtractionTemplate)
                .filter(ExtractionTemplate.is_default == True, ExtractionTemplate.parish_id == parish_id)
                .first()
            )
            if not template_record:
                # Fall back to any template
                template_record = (
                    db.query(ExtractionTemplate)
                    .filter(ExtractionTemplate.parish_id == parish_id)
                    .order_by(ExtractionTemplate.updated_at.desc())
                    .first()
                )

            template_dict = None
            if template_record:
                template_dict = {
                    "name": template_record.name,
                    "field_patterns": template_record.field_patterns,
                    "table_config": template_record.table_config,
                }

            extracted = parse_appraisal(tmp_path, template=template_dict)

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
            db.add(HistoryEntry(
                parish_id=parish_id, entry_type="upload",
                description=f"Appraisal upload: {file.filename}",
                snapshot={"actor_sub": membership.account.auth0_sub},
            ))
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
