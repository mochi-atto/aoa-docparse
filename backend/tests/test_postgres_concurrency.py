"""Optional real PostgreSQL locking tests, restricted to disposable port 55432.

Set TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55432/postgres.
Tests create a unique schema; no preexisting schema is dropped or cleared.
"""
import os
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from app.auth import verify_token, security
from app.database import get_db
from app.migrations import migrate
from app.models.account import Account
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.routers import account, work_orders


@unittest.skipUnless(os.environ.get("TEST_POSTGRES_URL"), "Disposable PostgreSQL URL not supplied")
class PostgresConcurrencyTests(unittest.TestCase):
    def setUp(self):
        url = make_url(os.environ["TEST_POSTGRES_URL"])
        if url.host not in {"localhost", "127.0.0.1"} or url.port != 55432:
            self.fail("These tests only allow the disposable local PostgreSQL port 55432")
        schema = "aoa_test_" + uuid.uuid4().hex
        bootstrap = create_engine(url)
        with bootstrap.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        bootstrap.dispose()
        self.engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
        self.addCleanup(self.engine.dispose)
        migrate(self.engine, apply=True)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            for i in range(1, 5):
                db.add(Account(id=i, auth0_sub=f"synthetic{i}", email=f"synthetic{i}@example.invalid", role="admin"))
            db.add(Parish(id=1, name="Synthetic concurrency parish", owner_account_id=1))
            db.flush()
            for i in range(1, 5):
                db.add(ParishMember(id=i, parish_id=1, account_id=i, email=f"synthetic{i}@example.invalid", role="admin" if i < 3 else "editor"))
            db.commit()
            db.execute(text("SELECT setval(pg_get_serial_sequence('accounts', 'id'), 4)"))
            db.commit()
        app = FastAPI()
        app.include_router(account.router, prefix="/account")
        app.include_router(work_orders.router, prefix="/parishes")

        def database():
            with self.sessions() as db:
                yield db

        def identity(credentials=Depends(security)):
            return {"sub": credentials.credentials, "email": credentials.credentials + "@example.invalid", "email_verified": True}

        app.dependency_overrides[get_db] = database
        app.dependency_overrides[verify_token] = identity
        self.app = app

    def concurrent(self, operation):
        barrier = Barrier(2)

        def run(user):
            with TestClient(self.app, headers={"Authorization": f"Bearer synthetic{user}"}) as client:
                barrier.wait(timeout=10)
                return operation(client, user)

        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(run, [1, 2]))

    def test_concurrent_admin_demotions_leave_an_administrator(self):
        results = self.concurrent(lambda client, user: client.patch(f"/account/parishes/1/members/{3-user}", json={"role": "viewer"}).status_code)
        self.assertEqual(sorted(results), [200, 403])
        with self.sessions() as db:
            self.assertEqual(db.query(ParishMember).filter_by(parish_id=1, role="admin").count(), 1)

    def test_concurrent_claim_has_one_winner(self):
        with TestClient(self.app, headers={"Authorization": "Bearer synthetic1"}) as client:
            result = client.post("/parishes/1/work-orders", json={"title": "Concurrent synthetic claim"})
            self.assertEqual(result.status_code, 200, result.text)
            order = result.json()["id"]
        results = self.concurrent(lambda client, user: client.post(f"/parishes/1/work-orders/{order}/claim").status_code)
        self.assertEqual(sorted(results), [200, 409])

    def test_concurrent_creation_has_distinct_display_numbers(self):
        results = self.concurrent(lambda client, user: client.post("/parishes/1/work-orders", json={"title": "Concurrent synthetic order"}))
        self.assertEqual([response.status_code for response in results], [200, 200])
        self.assertEqual(len({response.json()["display_number"] for response in results}), 2)

    def test_concurrent_first_signin_creates_one_identity(self):
        results = self.concurrent(lambda client, user: client.get("/account/me", headers={"Authorization": "Bearer synthetic5"}).status_code)
        self.assertEqual(results, [200, 200])
        with self.sessions() as db:
            self.assertEqual(db.query(Account).filter_by(auth0_sub="synthetic5").count(), 1)
