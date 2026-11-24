import logging
import smtplib

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.config import settings
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.models.work_order import WorkOrder
from app.services.mailer import email_configured, send_email

logger = logging.getLogger(__name__)

EVENT_TEXT = {
    "created": "was created",
    "claimed": "was claimed",
    "started": "was started",
    "on_hold": "was put on hold",
    "resumed": "was resumed",
    "submitted": "was submitted for review",
    "closed": "was closed",
}


def admin_emails(db: Session, parish_id: int, actor_email: str | None) -> list[str]:
    members = (
        db.query(ParishMember)
        .filter(
            ParishMember.parish_id == parish_id,
            ParishMember.role == "admin",
            ParishMember.invitation_token.is_(None),  # skip pending invites
        )
        .all()
    )
    emails = []
    for member in members:
        if actor_email and member.email.lower() == actor_email.lower():
            continue
        emails.append(member.email)
    return emails


def deliver(recipients: list[str], subject: str, body: str) -> None:
    # Runs after the response is sent, so a slow or broken mail server
    # never delays or fails the work order request itself.
    if not email_configured():
        print(f"[email not configured] To: {', '.join(recipients)}\nSubject: {subject}\n\n{body}")
        return
    for to in recipients:
        try:
            send_email(to, subject, body)
        except (OSError, smtplib.SMTPException):
            logger.exception("Could not send work order email to %s", to)


def notify_admins(
    background_tasks: BackgroundTasks,
    db: Session,
    parish_id: int,
    order: WorkOrder,
    event: str,
    actor_name: str | None,
    actor_email: str | None,
) -> None:
    recipients = admin_emails(db, parish_id, actor_email)
    if not recipients:
        return

    parish = db.query(Parish).filter(Parish.id == parish_id).first()
    parish_name = "your parish"
    if parish is not None:
        parish_name = parish.name

    action = EVENT_TEXT.get(event, "was updated")
    actor = actor_name or "someone"

    subject = f"[{parish_name}] Work order {order.display_number} {action}"
    body = (
        f"Work order {order.display_number} {action} by {actor}.\n\n"
        f"Title: {order.title}\n"
        f"Priority: {order.priority.capitalize()}\n"
        f"Status: {order.status.replace('_', ' ')}\n\n"
        f"View it in the app: {settings.frontend_url}\n"
    )

    background_tasks.add_task(deliver, recipients, subject, body)