import secrets
import hashlib
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError
import smtplib
from email.message import EmailMessage
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
import re
from sqlalchemy.orm import Session
from app.auth import current_account, parish_access, parish_admin_access, verify_token, security, authenticated_email
from app.config import settings
from app.database import get_db
from app.models.account import Account
from app.models.parish_member import ParishMember
from app.models.parish import Parish
from app.models.history_entry import HistoryEntry
from typing import Literal
from urllib.parse import urlparse

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
    role: Literal["editor", "viewer"] = "viewer"

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("A valid email address is required")
        return value


def send_invitation(email: str, parish_name: str, token: str):
    if not settings.smtp_host or not settings.smtp_from:
        raise HTTPException(status_code=503, detail="Email delivery is not configured")
    message = EmailMessage()
    message["Subject"] = f"Invitation to join {parish_name}"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        f"You have been invited to join {parish_name}.\n\n"
        f"Create or sign in to your account here:\n"
        f"{settings.frontend_url}/invite/{token}\n"
    )
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise HTTPException(status_code=502, detail="Invitation email could not be sent; please try again") from error


@router.get("/me")
def me(account=Depends(current_account)):
    return {"email": account.email, "role": account.role}


def member_response(member):
    return {"id": member.id, "email": member.email, "role": member.role,
            "account_id": member.account_id,
            "status": "pending" if member.invitation_token else "active"}


@router.get("/parishes/{parish_id}/me")
def parish_me(membership=Depends(parish_access)):
    return member_response(membership)


@router.get("/parishes/{parish_id}/members")
def list_members(parish_id: int, membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    return [member_response(m) for m in db.query(ParishMember).filter(
        ParishMember.parish_id == parish_id).order_by(ParishMember.id).all()]


@router.post("/parishes/{parish_id}/invitations")
@router.post("/parishes/{parish_id}/viewers")
def invite_member(parish_id: int, data: InviteRequest,
                  membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    db.query(Parish).filter(Parish.id == parish_id).with_for_update().one()
    existing = db.query(ParishMember).filter(
        ParishMember.parish_id == parish_id, ParishMember.email == data.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="This email already has access or an invitation")
    token = secrets.token_urlsafe(32)
    member = ParishMember(parish_id=parish_id, email=data.email,
                          role=data.role, invitation_token=hashlib.sha256(token.encode()).hexdigest())
    # Local development can deliver a link without SMTP. Production still requires SMTP.
    local = urlparse(settings.frontend_url).hostname in {"localhost", "127.0.0.1", "::1"}
    email_sent = False
    if settings.smtp_host and settings.smtp_from:
        send_invitation(data.email, membership.parish.name, token)
        email_sent = True
    elif not local:
        raise HTTPException(status_code=503, detail="Email delivery is not configured")
    db.add(member)
    db.add(HistoryEntry(parish_id=parish_id, entry_type="member_invited", description="Parish membership invitation generated", snapshot={"actor_sub": membership.account.auth0_sub}))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This email already has access or an invitation")
    return {"detail": "Invitation email sent" if email_sent else "Invitation generated; email was not sent",
            "invitation_url": f"{settings.frontend_url.rstrip('/')}/invite/{token}",
            "email_sent": email_sent, "member": member_response(member)}


@router.get("/parishes/{parish_id}/viewers")
def list_viewers(parish_id: int, membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    return [member_response(m) for m in db.query(ParishMember).filter(
        ParishMember.parish_id == parish_id, ParishMember.role == "viewer").all()]


class RoleUpdate(BaseModel):
    role: Literal["admin", "editor", "viewer"]


def locked_member(parish_id, member_id, membership, db):
    # Serialize administrator changes per parish, including concurrent requests.
    db.query(Parish).filter(Parish.id == parish_id).with_for_update().one()
    membership = db.query(ParishMember).filter(ParishMember.id == membership.id).populate_existing().first()
    if not membership or membership.role != "admin":
        raise HTTPException(status_code=403, detail="Parish administrator access required")
    member = db.query(ParishMember).filter(
        ParishMember.id == member_id, ParishMember.parish_id == parish_id).populate_existing().first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def protect_last_admin(member, db):
    if member.role == "admin" and member.account_id is not None:
        count = db.query(ParishMember).filter(
            ParishMember.parish_id == member.parish_id, ParishMember.role == "admin",
            ParishMember.account_id.isnot(None)).count()
        if count <= 1:
            raise HTTPException(status_code=409, detail="The last parish administrator cannot be removed or demoted")


@router.patch("/parishes/{parish_id}/members/{member_id}")
def change_role(parish_id: int, member_id: int, data: RoleUpdate,
                membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    member = locked_member(parish_id, member_id, membership, db)
    if member.invitation_token and data.role == "admin":
        raise HTTPException(status_code=400, detail="Accept the invitation before assigning administrator access")
    if data.role != "admin":
        protect_last_admin(member, db)
    member.role = data.role
    db.add(HistoryEntry(parish_id=parish_id, entry_type="member_role_changed", description=f"Parish member role changed to {data.role}", snapshot={"actor_sub": membership.account.auth0_sub, "member_id": member.id}))
    db.commit()
    return member_response(member)


@router.delete("/parishes/{parish_id}/members/{member_id}")
def remove_member(parish_id: int, member_id: int,
                  membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    member = locked_member(parish_id, member_id, membership, db)
    protect_last_admin(member, db)
    db.add(HistoryEntry(parish_id=parish_id, entry_type="member_removed", description="Parish membership removed", snapshot={"actor_sub": membership.account.auth0_sub, "member_id": member.id}))
    db.delete(member)
    db.commit()
    return {"detail": "Member removed"}


@router.delete("/parishes/{parish_id}/viewers/{member_id}")
def remove_viewer(parish_id: int, member_id: int,
                  membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    member = locked_member(parish_id, member_id, membership, db)
    if member.role != "viewer":
        raise HTTPException(status_code=404, detail="Viewer not found")
    db.add(HistoryEntry(parish_id=parish_id, entry_type="member_removed", description="Parish membership removed", snapshot={"actor_sub": membership.account.auth0_sub, "member_id": member.id}))
    db.delete(member)
    db.commit()
    return {"detail": "Viewer removed"}


@router.post("/invitations/{token}/accept")
def accept_invitation(token: str, user=Depends(verify_token), credentials=Depends(security),
                      db: Session = Depends(get_db)):
    member = db.query(ParishMember).filter(
        ParishMember.invitation_token.in_([token, hashlib.sha256(token.encode()).hexdigest()])).with_for_update().first()
    if not member:
        raise HTTPException(status_code=404, detail="Invitation not found or already accepted")
    if not member.created_at or member.created_at + timedelta(days=7) <= datetime.utcnow():
        raise HTTPException(status_code=410, detail="Invitation expired; ask the parish administrator for a new invitation")
    email = authenticated_email(user, credentials)
    if email != member.email:
        raise HTTPException(status_code=403, detail="Sign in with the invited email address")
    account = db.query(Account).filter(Account.auth0_sub == user["sub"]).first()
    email_account = db.query(Account).filter(Account.email == email).first()
    if email_account and (not account or email_account.id != account.id):
        raise HTTPException(status_code=409, detail="This email belongs to another account; sign in with that account")
    if not account:
        account = Account(auth0_sub=user["sub"], email=email, role="viewer")
        db.add(account)
        db.flush()
    elif account.email.startswith("auth0:"):
        account.email = email
    elif account.email != email:
        raise HTTPException(status_code=403, detail="Authenticated email does not match invitation")
    existing_membership = db.query(ParishMember).filter(
        ParishMember.parish_id == member.parish_id, ParishMember.account_id == account.id,
        ParishMember.id != member.id).first()
    if existing_membership:
        raise HTTPException(status_code=409, detail="This account already belongs to the parish")
    # Account.role is legacy metadata: accepting another parish never changes it.
    member.account_id = account.id
    member.invitation_token = None
    db.add(HistoryEntry(parish_id=member.parish_id, entry_type="invitation_accepted", description="Parish invitation accepted", snapshot={"actor_sub": account.auth0_sub, "member_id": member.id}))
    db.commit()
    return {"detail": "Invitation accepted", "parish_id": member.parish_id, "role": member.role}
