from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
from functools import lru_cache
from app.config import settings

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