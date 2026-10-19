from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
from functools import lru_cache
from app.config import settings
from app.models.account import Account
from app.models.parish_member import ParishMember
from app.database import get_db
from sqlalchemy.orm import Session

security = HTTPBearer()

@lru_cache()
def get_signing_key():
    """Fetch Auth0 JWKS (cached)."""
    jwks_url = f"https://{settings.auth0_domain}/.well-known/jwks.json"
    response = httpx.get(jwks_url)
    return response.json()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify the Auth0 JWT and return the decoded payload."""
    token = credentials.credentials
    try:
        jwks = get_signing_key()
        unverified_header = jwt.get_unverified_header(token)

        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"],
                }

        if not rsa_key:
            raise HTTPException(status_code=401, detail="Unable to find signing key")

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=[settings.auth0_algorithms],
            audience=settings.auth0_api_audience,
            issuer=f"https://{settings.auth0_domain}/",
        )
        return payload

    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {str(e)}")


def current_account(user=Depends(verify_token), db: Session = Depends(get_db), credentials=Depends(security)):
    sub = user.get("sub")
    email = (user.get("email") or "").strip().lower()
    if not sub:
        raise HTTPException(status_code=401, detail="Authenticated user ID is missing")
    account = db.query(Account).filter(Account.auth0_sub == sub).first()
    if not email and (not account or account.email.startswith("auth0:")):
        try:
            email = authenticated_email(user, credentials)
        except HTTPException:
            pass  # Preserve sign-in when the access token has no profile scopes.
    identity = email or f"auth0:{sub}"
    if account:
        if email and account.email.startswith("auth0:"):
            account.email = email
            db.query(ParishMember).filter(
                ParishMember.account_id == account.id,
                ParishMember.email == f"auth0:{sub}",
            ).update({ParishMember.email: email})
            db.commit()
        return account
    pending = db.query(ParishMember).filter(
        ParishMember.email == email, ParishMember.account_id.is_(None),
    ).first() if email else None
    account = Account(auth0_sub=sub, email=identity, role="viewer" if pending else "admin")
    db.add(account)
    db.flush()
    db.commit()
    db.refresh(account)
    return account


def require_admin_account(account=Depends(current_account), db: Session = Depends(get_db)):
    memberships = db.query(ParishMember).filter(ParishMember.account_id == account.id).all()
    # Global creation/settings use actual admin memberships; new accounts can bootstrap.
    if not any(m.role == "admin" for m in memberships) and (memberships or account.role != "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return account


def parish_access(parish_id: int, account=Depends(current_account), db: Session = Depends(get_db)):
    member = db.query(ParishMember).filter(
        ParishMember.parish_id == parish_id,
        ParishMember.account_id == account.id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Parish not found")
    return member


def parish_admin_access(member=Depends(parish_access)):
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Parish administrator access required")
    return member


def parish_editor_access(member=Depends(parish_access)):
    """Reusable maintenance/work-order write permission."""
    if member.role not in {"admin", "editor"}:
        raise HTTPException(status_code=403, detail="Parish administrator or editor access required")
    return member


parish_viewer_access = parish_access


def authenticated_email(user, credentials):
    """Resolve email from a signed claim or Auth0's authenticated userinfo."""
    email = user.get("email")
    if user.get("email_verified") is False:
        raise HTTPException(status_code=403, detail="Verify your email address before accepting an invitation")
    if not email:
        try:
            response = httpx.get(
                f"https://{settings.auth0_domain}/userinfo",
                headers={"Authorization": f"Bearer {credentials.credentials}"}, timeout=10,
            )
            response.raise_for_status()
            profile = response.json()
            if profile.get("sub") != user.get("sub"):
                raise HTTPException(status_code=403, detail="Authenticated identity does not match")
            if profile.get("email_verified") is False:
                raise HTTPException(status_code=403, detail="Verify your email address before accepting an invitation")
            email = profile.get("email")
        except (httpx.HTTPError, ValueError):
            raise HTTPException(status_code=400, detail="Unable to verify your email with Auth0")
    if not email:
        raise HTTPException(status_code=400, detail="An authenticated email address is required")
    return email.strip().lower()
