import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.auth import current_account
from app.database import get_db
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.services.parish_export import XLSX_MEDIA_TYPE, build_parish_workbook, export_filename

router = APIRouter()


@router.get("/{parish_id}/export")
def export_parish(parish_id: int, db: Session = Depends(get_db), account=Depends(current_account)):
    # Unlike parish_access, tell "doesn't exist" apart from "not a member" for a clearer error.
    parish = db.query(Parish).filter(Parish.id == parish_id).first()
    if not parish:
        raise HTTPException(status_code=404, detail="Parish not found")
    membership = db.query(ParishMember).filter(
        ParishMember.parish_id == parish_id, ParishMember.account_id == account.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="You don't have access to this parish")

    today = datetime.datetime.utcnow().date()
    # The Access sheet lists member emails, so only parish admins receive it.
    content = build_parish_workbook(db, parish, include_access=membership.role == "admin", today=today)
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{export_filename(parish.name, today)}"'},
    )
