"""Create synthetic demo data in a NEW isolated SQLite file, never PostgreSQL.

Run from backend after setting DATABASE_URL to a new SQLite file under .demo.
--identity-env optionally reads a local development backend .env to copy an
existing administrator's sign-in identity only. No parish records are copied.
"""
import argparse
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from dotenv import dotenv_values
from app.database import engine, SessionLocal
from app.migrations import migrate
from app.models.account import Account
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.models.building import Building
from app.models.todo import Todo
from app.models.asset import Asset
from app.models.work_order import WorkOrder
from app.models.user_profile import UserProfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--identity-env", type=Path)
    args = parser.parse_args()
    if engine.url.get_backend_name() != "sqlite" or not engine.url.database:
        raise SystemExit("Demo preparation requires an isolated file-backed SQLite database")
    destination = Path(engine.url.database).resolve()
    if destination.parent.name != ".demo" or destination.exists():
        raise SystemExit("Use a NEW file inside .demo; existing databases are never overwritten")
    destination.parent.mkdir(parents=True, exist_ok=True)
    subject, email = "synthetic-admin", "admin@example.invalid"
    if args.identity_env:
        source_url = make_url(dotenv_values(args.identity_env)["DATABASE_URL"])
        if source_url.host not in {"localhost", "127.0.0.1", "::1"}:
            raise SystemExit("Identity source must be a local development database")
        source = create_engine(source_url)
        try:
            with source.connect() as connection:
                row = connection.execute(text("SELECT a.auth0_sub, a.email FROM accounts a JOIN parish_members m ON m.account_id=a.id WHERE m.role='admin' ORDER BY a.id LIMIT 1")).first()
                if row:
                    subject, email = row
        finally:
            source.dispose()
    migrate(engine, apply=True)
    with SessionLocal() as db:
        db.add(Account(id=1, auth0_sub=subject, email=email, role="admin"))
        db.add(Parish(id=1, name="Synthetic Demo Parish", owner_account_id=1))
        db.flush()
        db.add(ParishMember(parish_id=1, account_id=1, email=email, role="admin"))
        db.add(Building(id=1, parish_id=1, name="Demo Hall"))
        db.add(Todo(id=1, parish_id=1, text="Inspect synthetic boiler", building="Demo Hall", priority="green"))
        db.add(Asset(parish_id=1, name="Synthetic Boiler", asset_type="HVAC unit", location="Demo Hall", manufacturer="Trane", year_installed=2020, expected_life=20, initial_cost=20000))
        db.add(WorkOrder(parish_id=1, display_number="WO-0001", title="Synthetic boiler inspection", building_id=1, todo_id=1, priority="medium", status="unassigned", requester_sub=subject, requester_name="Demo administrator"))
        db.add(UserProfile(sub=subject, display_name="Demo administrator"))
        db.commit()
    import fitz
    with fitz.open() as document:
        document.new_page().insert_text((72, 72), "SYNTHETIC TEST DOCUMENT - NOT REAL PARISH DATA\nBuilding: Demo Hall\nAppraisal Date: 2026-01-01\nBuilding Value: $12,345")
        document.save(destination.parent / "synthetic-appraisal.pdf")
    print("Prepared isolated synthetic demo; source database was read-only. No credentials printed.")


if __name__ == "__main__":
    main()
