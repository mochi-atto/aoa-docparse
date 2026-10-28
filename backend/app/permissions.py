from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException
from app.auth import verify_token


@dataclass
class CurrentUser:
    sub: str
    name: Optional[str]
    role: str


def get_current_user(payload: dict = Depends(verify_token)) -> CurrentUser:
    return CurrentUser(
        sub=payload["sub"],
        name=payload.get("name"),
        role="admin", # placeholder until roles are completed
    )

ROLE_PERMISSIONS = {
    "admin": {
        "work_orders.create",
        "work_orders.claim",
        "work_orders.start",
        "work_orders.hold",
        "work_orders.resume",
        "work_orders.submit",
        "work_orders.close",
    },
}

def require(user: CurrentUser, action: str):
    allowed = ROLE_PERMISSIONS.get(user.role, set())
    if action not in allowed:
        raise HTTPException(status_code=403, detail="Forbidden")
