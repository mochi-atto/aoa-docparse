"""Identity compatibility for saved profiles. Parish permissions live in app.auth."""
from dataclasses import dataclass
from fastapi import Depends
from app.auth import verify_token

@dataclass
class CurrentUser:
    sub: str
    name: str | None = None

def get_current_user(payload=Depends(verify_token)):
    return CurrentUser(sub=payload["sub"], name=payload.get("name"))
