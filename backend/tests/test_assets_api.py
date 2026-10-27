"""Asset API tests. Run from backend/: python -m pytest tests/test_assets_api.py

Uses an in-memory SQLite DB and a temp upload dir; no Postgres or Auth0 needed.
"""
import datetime
import os
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["ASSET_UPLOAD_DIR"] = tempfile.mkdtemp(prefix="asset-test-")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import verify_token
from app.database import Base, get_db
from app.main import app
from app.models.parish import Parish

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with Session() as db:
        db.add(Parish(name="Test Parish"))
        db.commit()

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[verify_token] = lambda: {"sub": "test"}
    yield TestClient(app)
    app.dependency_overrides.clear()


THIS_YEAR = datetime.date.today().year
BODY = {"name": "Admin HVAC #4", "asset_type": "HVAC unit", "location": "Admin Building",
        "manufacturer": "Trane", "year_installed": THIS_YEAR - 5, "expected_life": 15, "initial_cost": 15000}


def test_create_derives_remaining_life_and_accrual(client):
    r = client.post("/api/parishes/1/assets", json=BODY)
    assert r.status_code == 200
    a = r.json()
    assert a["remaining_life"] == 10
    assert a["annual_accrual"] == 1000
    assert a["accrual_override"] is None


def test_remaining_life_floors_at_zero(client):
    r = client.post("/api/parishes/1/assets", json={**BODY, "year_installed": THIS_YEAR - 40})
    assert r.json()["remaining_life"] == 0


def test_accrual_override_and_reset(client):
    aid = client.post("/api/parishes/1/assets", json=BODY).json()["id"]
    a = client.put(f"/api/parishes/1/assets/{aid}", json={"accrual_override": 1200}).json()
    assert a["annual_accrual"] == 1200
    a = client.put(f"/api/parishes/1/assets/{aid}", json={"accrual_override": None}).json()
    assert a["annual_accrual"] == 1000


def test_update_leaves_unsent_fields_alone(client):
    aid = client.post("/api/parishes/1/assets", json=BODY).json()["id"]
    a = client.put(f"/api/parishes/1/assets/{aid}", json={"location": "Church"}).json()
    assert a["location"] == "Church" and a["name"] == BODY["name"]


def test_validation(client):
    assert client.post("/api/parishes/1/assets", json={**BODY, "expected_life": 0}).status_code == 422
    assert client.post("/api/parishes/1/assets", json={**BODY, "name": ""}).status_code == 422


def test_assets_scoped_to_parish(client):
    aid = client.post("/api/parishes/1/assets", json=BODY).json()["id"]
    assert client.get("/api/parishes/2/assets").json() == []
    assert client.delete(f"/api/parishes/2/assets/{aid}").status_code == 404


def test_catalog_manuals_attach_on_create_and_dedupe(client):
    a = client.post("/api/parishes/1/assets", json={**BODY, "catalog_manuals": ["a.pdf", "a.pdf", "b.pdf"]}).json()
    assert [d["filename"] for d in a["documents"]] == ["a.pdf", "b.pdf"]
    assert all(d["source"] == "catalog" and not d["has_file"] for d in a["documents"])
    a = client.post(f"/api/parishes/1/assets/{a['id']}/documents/catalog", json={"filenames": ["b.pdf", "c.pdf"]}).json()
    assert [d["filename"] for d in a["documents"]] == ["a.pdf", "b.pdf", "c.pdf"]


def test_manual_lookup_is_flagged_temporary(client):
    r = client.get("/api/parishes/1/assets/manual-lookup", params={"asset_type": "HVAC unit", "manufacturer": "Trane"}).json()
    assert r["temporary"] is True
    assert "Trane-installation-manual.pdf" in r["manuals"]
    assert client.get("/api/parishes/1/assets/manual-lookup").json()["manuals"] == []


def test_upload_download_delete_document(client):
    aid = client.post("/api/parishes/1/assets", json=BODY).json()["id"]
    r = client.post(f"/api/parishes/1/assets/{aid}/documents", files=[("files", ("manual.pdf", b"%PDF-fake", "application/pdf"))])
    doc = r.json()["documents"][0]
    assert doc["filename"] == "manual.pdf" and doc["has_file"] and doc["size_bytes"] == 9
    f = client.get(f"/api/parishes/1/assets/{aid}/documents/{doc['id']}/file")
    assert f.status_code == 200 and f.content == b"%PDF-fake"
    r = client.delete(f"/api/parishes/1/assets/{aid}/documents/{doc['id']}")
    assert r.json()["documents"] == []
    assert client.get(f"/api/parishes/1/assets/{aid}/documents/{doc['id']}/file").status_code == 404


def test_delete_asset_removes_files_and_logs_history(client):
    aid = client.post("/api/parishes/1/assets", json=BODY).json()["id"]
    client.post(f"/api/parishes/1/assets/{aid}/documents", files=[("files", ("m.pdf", b"x", "application/pdf"))])
    assert client.delete(f"/api/parishes/1/assets/{aid}").status_code == 200
    assert client.get("/api/parishes/1/assets").json() == []
    types = [h["entry_type"] for h in client.get("/api/parishes/1/history").json()]
    assert types.count("asset") == 3 and set(types) == {"asset"}
