"""Permission regression tests; no local PostgreSQL data is accessed."""
import unittest
from datetime import date
from unittest.mock import patch, Mock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.auth import verify_token
from app.models.account import Account
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.models.building import Building
from app.models.todo import Todo
from app.models.history_entry import HistoryEntry
from app.models.utility_bill import UtilityBill
from app.models.appraisal import Appraisal
from app.routers import account, parish_data, parishes, data, upload
from app.models.extraction_template import ExtractionTemplate

class PermissionsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            db.add_all([Account(id=i, auth0_sub=f"user{i}", email=f"user{i}@example.com", role="admin" if i == 1 else "viewer") for i in range(1, 5)])
            db.add_all([Parish(id=1, name="One", owner_account_id=1), Parish(id=2, name="Two", owner_account_id=2)])
            db.flush()
            db.add_all([ParishMember(id=i, parish_id=1, account_id=i, email=f"user{i}@example.com", role=role) for i, role in [(1, "admin"), (2, "editor"), (3, "viewer")]])
            db.add(ParishMember(id=4, parish_id=2, account_id=2, email="user2@example.com", role="admin"))
            db.add(UtilityBill(id=1, parish_id=2, original_filename="test.pdf", bill_date=date(2026, 1, 1), total_amount=10))
            db.commit()
        self.app = FastAPI()
        for router, prefix in [(account.router, "/account"), (parish_data.router, "/parishes"), (parishes.router, "/parishes"), (data.router, "/data"), (upload.router, "/upload")]:
            self.app.include_router(router, prefix=prefix)
        def database():
            with self.sessions() as db:
                yield db
        self.app.dependency_overrides[get_db] = database
        self.login(1)
        self.client = TestClient(self.app, headers={"Authorization": "Bearer test-token"})

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def login(self, user):
        self.app.dependency_overrides[verify_token] = lambda: {"sub": f"user{user}", "email": f"user{user}@example.com", "email_verified": True}

    def test_task_permissions_and_status_history(self):
        for user, expected in [(1, 200), (2, 200), (3, 403), (4, 404)]:
            self.login(user)
            result = self.client.post("/parishes/1/todos", json={"text": "Repair roof", "building": "Church", "priority": "red"})
            self.assertEqual(result.status_code, expected, result.text)
            if expected == 200:
                task = result.json()["id"]
                result = self.client.put(f"/parishes/1/todos/{task}", json={"done": True})
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(result.json()["priority"], "blue")
                self.assertEqual(self.client.put(f"/parishes/1/todos/{task}", json={"done": False}).json()["priority"], "red")
                self.assertEqual(self.client.delete(f"/parishes/1/todos/{task}").status_code, 200 if user == 1 else 403)
        self.login(1)
        task = self.client.post("/parishes/1/todos", json={"text": "Paint", "building": "Hall"}).json()["id"]
        self.login(3)
        self.assertEqual(self.client.get("/parishes/1/todos").status_code, 200)
        self.assertEqual(self.client.put(f"/parishes/1/todos/{task}", json={"text": "Denied"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/parishes/1/todos/{task}").status_code, 403)

    def test_parish_roles_override_global_role_and_scope_data(self):
        self.login(2)
        self.assertEqual(self.client.get("/account/parishes/1/me").json()["role"], "editor")
        self.assertEqual(self.client.get("/account/parishes/2/me").json()["role"], "admin")
        self.assertEqual(self.client.get("/account/parishes/1/members").status_code, 403)
        self.assertEqual(self.client.get("/account/parishes/2/members").status_code, 200)
        self.assertEqual(self.client.put("/parishes/2", json={"address": "Updated"}).status_code, 200)
        self.assertEqual(self.client.put("/parishes/1", json={"address": "Denied"}).status_code, 403)
        self.assertEqual(self.client.put("/data/utility/1", json={"total_amount": 20}).status_code, 200)
        self.login(1)
        self.assertEqual(self.client.put("/data/utility/1", json={"total_amount": 30}).status_code, 404)
        self.assertEqual(self.client.delete("/data/utility/1").status_code, 404)

    def test_member_changes_and_last_admin(self):
        self.assertEqual(len(self.client.get("/account/parishes/1/members").json()), 3)
        for path, role, expected in [("1", "viewer", 409), ("2", "owner", 422), ("4", "viewer", 404), ("2", "admin", 200), ("1", "viewer", 200)]:
            self.assertEqual(self.client.patch(f"/account/parishes/1/members/{path}", json={"role": role}).status_code, expected)
        self.assertEqual(self.client.get("/account/parishes/1/members").status_code, 403)
        self.login(2)
        self.assertEqual(self.client.delete("/account/parishes/1/members/1").status_code, 200)
        self.assertEqual(self.client.delete("/account/parishes/1/members/2").status_code, 409)

    def test_invitation_email_matching_replay_and_no_implicit_acceptance(self):
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "http://localhost:5173"):
            response = self.client.post("/account/parishes/1/invitations", json={"email": "USER4@example.com", "role": "editor"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["email_sent"])
        token = response.json()["invitation_url"].rsplit("/", 1)[1]
        self.assertNotIn(token, self.client.get("/account/parishes/1/members").text)
        self.assertEqual(self.client.post("/account/parishes/1/invitations", json={"email": "user4@example.com"}).status_code, 409)
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 403)
        self.login(4)
        self.assertEqual(self.client.get("/account/parishes/1/me").status_code, 404)
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 200)
        self.assertEqual(self.client.get("/account/parishes/1/me").json()["role"], "editor")
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 404)
        self.assertEqual(self.client.post("/account/invitations/invalid/accept").status_code, 404)

    def test_acceptance_preserves_admin_elsewhere(self):
        self.login(2)
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "http://localhost:5173"):
            response = self.client.post("/account/parishes/2/invitations", json={"email": "user1@example.com"})
        token = response.json()["invitation_url"].rsplit("/", 1)[1]
        self.login(1)
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 200)
        self.assertEqual(self.client.get("/account/me").json()["role"], "admin")
        self.assertEqual(self.client.get("/account/parishes/1/me").json()["role"], "admin")
        self.assertEqual(self.client.get("/account/parishes/2/me").json()["role"], "viewer")

    def test_unauthenticated_and_nonmembers_denied(self):
        self.client.headers.clear()
        self.assertEqual(self.client.post("/account/invitations/token/accept").status_code, 403)
        self.app.dependency_overrides.pop(verify_token)
        self.assertEqual(self.client.get("/account/parishes/1/members").status_code, 403)
        self.client.headers["Authorization"] = "Bearer test-token"
        self.login(4)
        for endpoint in ["/parishes/1", "/parishes/1/todos", "/parishes/1/history", "/account/parishes/1/me", "/data/utility/1", "/data/appraisal/1"]:
            self.assertEqual(self.client.get(endpoint).status_code, 404, endpoint)

    def test_invitation_auth0_userinfo_fallback(self):
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "http://localhost:5173"):
            response = self.client.post("/account/parishes/1/invitations", json={"email": "user4@example.com"})
        token = response.json()["invitation_url"].rsplit("/", 1)[1]
        self.app.dependency_overrides[verify_token] = lambda: {"sub": "user4"}
        profile = Mock()
        profile.json.return_value = {"sub": "wrong-user", "email": "user4@example.com", "email_verified": True}
        with patch("app.auth.httpx.get", return_value=profile):
            self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 403)
            profile.json.return_value["sub"] = "user4"
            self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 200)

    def test_signup_does_not_consume_pending_invitation(self):
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "http://localhost:5173"):
            response = self.client.post("/account/parishes/1/invitations", json={"email": "user5@example.com", "role": "editor"})
        token = response.json()["invitation_url"].rsplit("/", 1)[1]
        self.login(5)
        self.assertEqual(self.client.get("/account/me").status_code, 200)
        self.assertEqual(self.client.get("/account/parishes/1/me").status_code, 404)
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 200)
        self.assertEqual(self.client.get("/account/parishes/1/me").json()["role"], "editor")

    def test_selection_roles_and_strict_invitation_validation(self):
        self.login(2)
        self.assertEqual({p["id"]: p["role"] for p in self.client.get("/parishes/").json()}, {1: "editor", 2: "admin"})
        self.login(1)
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "https://example.com"):
            self.assertEqual(self.client.post("/account/parishes/1/invitations", json={"email": "new@example.com"}).status_code, 503)
        self.assertEqual(self.client.post("/account/parishes/1/invitations", json={"email": "new@example.com", "role": "admin"}).status_code, 422)
        self.assertEqual(self.client.post("/account/parishes/1/invitations", json={"email": "invalid"}).status_code, 422)
        with self.assertRaises(ValueError):
            ParishMember(parish_id=1, email="test@example.com", role="invalid")

    def test_upload_permissions_reject_before_parsing(self):
        with patch.object(upload, "parse_utility_bill") as parser:
            for user, expected in [(2, 403), (3, 403), (4, 404)]:
                self.login(user)
                response = self.client.post("/upload/", data={"parish_id": "1", "doc_type": "utility"}, files={"file": ("synthetic.pdf", b"%PDF-synthetic", "application/pdf")})
                self.assertEqual(response.status_code, expected, response.text)
        parser.assert_not_called()

    def test_appraisal_upload_saves_nested_dates_without_ai(self):
        with patch.object(upload, "parse_appraisal", return_value={
            "appraisal_date": date(2026, 1, 1),
            "sections": [{"appraisal_date": date(2026, 1, 2)}],
        }), patch.object(upload, "parse_utility_bill", side_effect=AssertionError("Utility AI must not run")):
            response = self.client.post("/upload/", data={"parish_id": "1", "doc_type": "appraisal"}, files={"file": ("synthetic.pdf", b"%PDF-synthetic", "application/pdf")})
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            stored = db.query(Appraisal).one()
            self.assertEqual(stored.parish_id, 1)
            self.assertEqual(stored.raw_extracted["sections"][0]["appraisal_date"], "2026-01-02")

    def test_invitation_expiry_and_hashed_token_storage(self):
        import hashlib
        from datetime import datetime, timedelta
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "http://localhost:5173"):
            response = self.client.post("/account/parishes/1/invitations", json={"email": "user4@example.com"})
        token = response.json()["invitation_url"].rsplit("/", 1)[1]
        with self.sessions() as db:
            member = db.query(ParishMember).filter_by(email="user4@example.com").one()
            self.assertEqual(member.invitation_token, hashlib.sha256(token.encode()).hexdigest())
            member.created_at = datetime.utcnow() - timedelta(days=8)
            db.commit()
        self.login(4)
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 410)
        self.assertEqual(self.client.get("/account/parishes/1/me").status_code, 404)

    def test_identity_email_collision_is_not_a_server_error(self):
        self.app.dependency_overrides[verify_token] = lambda: {"sub": "different-identity", "email": "user1@example.com", "email_verified": True}
        self.assertEqual(self.client.get("/account/me").status_code, 409)

    def test_unverified_invitation_identity_cannot_accept(self):
        with patch.object(account.settings, "smtp_host", ""), patch.object(account.settings, "frontend_url", "http://localhost:5173"):
            response = self.client.post("/account/parishes/1/invitations", json={"email": "user4@example.com"})
        token = response.json()["invitation_url"].rsplit("/", 1)[1]
        self.app.dependency_overrides[verify_token] = lambda: {"sub": "user4", "email": "user4@example.com", "email_verified": False}
        self.assertEqual(self.client.post(f"/account/invitations/{token}/accept").status_code, 403)

    def test_unverified_email_cannot_reserve_another_identity(self):
        self.app.dependency_overrides[verify_token] = lambda: {"sub": "unverified-user", "email": "user1@example.com", "email_verified": False}
        response = self.client.get("/account/me")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["email"], "auth0:unverified-user")
        self.login(1)
        self.assertEqual(self.client.get("/account/parishes/1/me").json()["role"], "admin")

if __name__ == "__main__":
    unittest.main()
