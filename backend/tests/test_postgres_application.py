"""Full application flow with real JWT signatures and disposable PostgreSQL.

Only JWKS discovery is mocked; JWT verification, permissions, persistence,
appraisal editing, asset files and work-order transitions run normally.
"""
import io
import os
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch

import fitz
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt, jwk
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app import auth
from app.database import get_db
from app.migrations import migrate
from app.routers import account, assets, data, parishes, upload, work_orders


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Disposable PostgreSQL URL not supplied")
class PostgresApplicationTests(unittest.TestCase):
    def test_signed_sessions_across_all_modules(self):
        url = make_url(os.environ["TEST_POSTGRES_URL"])
        self.assertIn(url.host, {"localhost", "127.0.0.1"})
        self.assertEqual(url.port, 55432)
        schema = "aoa_app_" + uuid.uuid4().hex
        bootstrap = create_engine(url)
        try:
            with bootstrap.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        finally:
            bootstrap.dispose()
        engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
        self.addCleanup(engine.dispose)
        migrate(engine, apply=True)
        # Legacy installs keep their global parish-name constraint.
        with engine.begin() as connection:
            connection.execute(text("CREATE UNIQUE INDEX legacy_global_parish_name ON parishes(name)"))
        sessions = sessionmaker(bind=engine)

        def database():
            with sessions() as db:
                yield db

        app = FastAPI()
        for router, prefix in [(account.router, "/api/account"), (parishes.router, "/api/parishes"),
                (assets.router, "/api/parishes"), (work_orders.router, "/api/parishes"),
                (data.router, "/api/data"), (upload.router, "/api/upload")]:
            app.include_router(router, prefix=prefix)
        app.dependency_overrides[get_db] = database
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption())
        public = key.public_key().public_bytes(serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo)
        keys = {"keys": [{**jwk.construct(public, "RS256").to_dict(), "kid": "app-test", "use": "sig"}]}

        def login(client, subject):
            token = jwt.encode({"sub": subject, "email": subject + "@example.invalid",
                "email_verified": True, "exp": int(time.time()) + 120,
                "aud": "https://synthetic-api", "iss": "https://synthetic.auth0.com/"},
                private, algorithm="RS256", headers={"kid": "app-test"})
            client.headers["Authorization"] = "Bearer " + token

        with tempfile.TemporaryDirectory() as storage, TestClient(app) as client, \
                patch.object(auth.settings, "auth0_domain", "synthetic.auth0.com"), \
                patch.object(auth.settings, "auth0_api_audience", "https://synthetic-api"), \
                patch.object(auth, "get_signing_key", return_value=keys), \
                patch.object(auth.settings, "asset_upload_dir", storage), \
                patch.object(auth.settings, "frontend_url", "http://localhost:5173"), \
                patch.object(auth.settings, "smtp_host", ""):
            login(client, "admin")
            result = client.post("/api/parishes/", json={"name": "Synthetic signed parish", "buildings": ["Hall"]})
            self.assertEqual(result.status_code, 200, result.text)
            parish = result.json()["id"]
            path = f"/api/parishes/{parish}"
            invitations = {}
            for role in ["editor", "viewer"]:
                result = client.post(f"/api/account/parishes/{parish}/invitations",
                    json={"email": role + "@example.invalid", "role": role})
                self.assertEqual(result.status_code, 200, result.text)
                invitations[role] = result.json()["invitation_url"].rsplit("/", 1)[1]

            appraisal = client.post("/api/data/appraisal/manual", json={"parish_id": parish,
                "entity_name": "Synthetic signed parish", "buildings": [{"name": "Hall", "building_value": 12000}]}).json()["id"]
            result = client.put(f"/api/data/appraisal/{appraisal}", json={"building_name": "Hall", "building_value": 15000})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(client.get(f"/api/data/appraisal/{parish}").json()[0]["building_value"], 15000)

            # Generate a real synthetic PDF and use the local appraisal parser.
            with fitz.open() as pdf:
                pdf.new_page().insert_text((72, 72), "Synthetic appraisal - Building Value: $15,000")
                content = pdf.tobytes()
            result = client.post("/api/upload/", data={"parish_id": str(parish), "doc_type": "appraisal"},
                files={"file": ("synthetic.pdf", io.BytesIO(content), "application/pdf")})
            self.assertEqual(result.status_code, 200, result.text)

            result = client.post(path + "/assets", json={"name": "Boiler", "location": "Hall",
                "year_installed": 2020, "expected_life": 20, "initial_cost": 20000})
            self.assertEqual(result.status_code, 200, result.text)
            asset = result.json()["id"]
            self.assertEqual(result.json()["annual_accrual"], 1000)
            order = client.post(path + "/work-orders", json={"title": "Inspect boiler"}).json()["id"]
            order_path = path + f"/work-orders/{order}"

            for role in ["editor", "viewer"]:
                login(client, role)
                self.assertEqual(client.post(f"/api/account/invitations/{invitations[role]}/accept").status_code, 200)
                self.assertEqual(client.get(path + "/assets").status_code, 200)
                self.assertEqual(client.put(path + f"/assets/{asset}", json={"initial_cost": 1}).status_code, 403)
                self.assertEqual(client.delete(f"/api/data/appraisal/{appraisal}").status_code, 403)
            self.assertEqual(client.post(order_path + "/claim").status_code, 403)
            login(client, "outsider")
            self.assertEqual(client.get(path + "/assets").status_code, 404)
            conflict = client.post("/api/parishes/", json={"name": "Synthetic signed parish", "buildings": ["Hall"]})
            self.assertEqual(conflict.status_code, 409, conflict.text)
            login(client, "editor")
            for action in ["claim", "start", "hold", "resume", "submit"]:
                result = client.post(order_path + "/" + action, json={"completion_notes": "Synthetic inspection complete"})
                self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(client.post(order_path + "/close").status_code, 403)
            document_path = path + f"/assets/{asset}/documents"
            result = client.post(document_path, files={"files": ("synthetic.pdf", content, "application/pdf")})
            self.assertEqual(result.status_code, 200, result.text)
            document = result.json()["documents"][0]["id"]
            self.assertEqual(client.get(document_path + f"/{document}/file").content, content)
            self.assertEqual(client.delete(document_path + f"/{document}").status_code, 200)
            login(client, "admin")
            self.assertEqual(client.post(order_path + "/close").json()["status"], "closed")
            self.assertEqual(client.delete(path + f"/assets/{asset}").status_code, 200)
            self.assertEqual(client.delete(f"/api/data/appraisal/{appraisal}").status_code, 200)
