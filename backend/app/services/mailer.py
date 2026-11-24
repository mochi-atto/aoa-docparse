import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    if settings.smtp_host and settings.smtp_from:
        return True
    return False


def send_email(to: str, subject: str, body: str) -> None:
    """Send one plain-text email. Raises OSError or SMTPException on failure."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from
    message["To"] = to
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)