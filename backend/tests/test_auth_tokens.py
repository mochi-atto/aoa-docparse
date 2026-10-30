"""Exercise real JWT validation with synthetic RSA keys; no Auth0 traffic."""
import time
import unittest
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from jose import jwt, jwk
from app import auth


class AuthTokenTests(unittest.TestCase):
    def setUp(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.private = key.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        public = key.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        self.jwks = {"keys": [{**jwk.construct(public, "RS256").to_dict(), "kid": "synthetic", "use": "sig"}]}
        self.claims = {"sub": "synthetic-admin", "exp": int(time.time()) + 60,
            "aud": "https://synthetic-api", "iss": "https://synthetic.auth0.com/"}
        app = FastAPI()

        @app.get("/private")
        def private(user=Depends(auth.verify_token)):
            return {"sub": user["sub"]}

        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        for name, value in [("auth0_domain", "synthetic.auth0.com"), ("auth0_api_audience", "https://synthetic-api")]:
            context = patch.object(auth.settings, name, value)
            context.start()
            self.addCleanup(context.stop)
        self.keys = patch.object(auth, "get_signing_key", return_value=self.jwks).start()
        self.addCleanup(patch.stopall)

    def request(self, claims):
        token = jwt.encode(claims, self.private, algorithm="RS256", headers={"kid": "synthetic"})
        return self.client.get("/private", headers={"Authorization": f"Bearer {token}"})

    def test_signed_identity_is_validated(self):
        self.assertEqual(self.request(self.claims).json(), {"sub": "synthetic-admin"})

    def test_expired_wrong_audience_issuer_and_missing_claims_are_denied(self):
        for changes in [{"exp": 1}, {"aud": "wrong"}, {"iss": "https://wrong/"}, {"exp": None}, {"sub": None}]:
            claims = {**self.claims, **changes}
            claims = {k: v for k, v in claims.items() if v is not None}
            self.assertEqual(self.request(claims).status_code, 401, changes)

    def test_rotated_key_refreshes_cached_jwks(self):
        self.keys.side_effect = [{"keys": []}, self.jwks]
        self.assertEqual(self.request(self.claims).status_code, 200)
        self.keys.cache_clear.assert_called_once()

    def test_missing_configuration_returns_service_unavailable(self):
        with patch.object(auth.settings, "auth0_domain", ""):
            self.assertEqual(self.request(self.claims).status_code, 503)
