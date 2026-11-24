"""Parish Excel export (AOA-39); runs against in-memory SQLite, no local PostgreSQL data is accessed."""
import datetime
import io
import unittest
from datetime import date
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook
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
from app.models.history_entry import HistoryEntry  # noqa
from app.models.utility_bill import UtilityBill
from app.models.appraisal import Appraisal
from app.models.extraction_template import ExtractionTemplate  # noqa
from app.models.work_order import WorkOrder
from app.models.work_order_note import WorkOrderNote
from app.models.user_profile import UserProfile  # noqa
from app.models.asset import Asset, AssetDocument
from app.routers import export
from app.services.parish_export import export_filename

ALL_SHEETS = ["Buildings", "Appraisals", "Utilities", "Assets", "Work Orders", "Access"]
TRICKY = 'Hall, "east" wing\nline two 🙏⛪ — São José'
CREATED = datetime.datetime(2026, 3, 4, 15, 30)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            db.add_all([Account(id=i, auth0_sub=f"user{i}", email=f"user{i}@example.com", role="viewer") for i in range(1, 6)])
            db.add_all([Parish(id=1, name="St. Mary's Church", owner_account_id=1),
                        Parish(id=2, name="Empty Parish", owner_account_id=1)])
            db.flush()
            for i, role in [(1, "admin"), (2, "editor"), (3, "viewer")]:
                db.add(ParishMember(parish_id=1, account_id=i, email=f"user{i}@example.com", role=role))
            db.add(ParishMember(parish_id=1, account_id=None, email="pending@example.com", role="viewer", invitation_token="t"))
            db.add(ParishMember(parish_id=2, account_id=1, email="user1@example.com", role="admin"))
            db.commit()
        self.app = FastAPI()
        self.app.include_router(export.router, prefix="/parishes")

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

    def export(self, parish_id=1):
        result = self.client.get(f"/parishes/{parish_id}/export")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        return result, load_workbook(io.BytesIO(result.content))

    @staticmethod
    def rows(ws):
        headers = [c.value for c in ws[1]]
        return [dict(zip(headers, row)) for row in ws.iter_rows(min_row=2, values_only=True)]

    def seed_full(self, count=1):
        with self.sessions() as db:
            hall = Building(parish_id=1, name="Parish Hall", account_numbers={"electric": "E-1", "water": "W-1"}, created_at=CREATED)
            church = Building(parish_id=1, name=TRICKY, created_at=CREATED)
            db.add_all([hall, church])
            db.flush()
            todo = Todo(parish_id=1, text="Fix roof", building="Parish Hall")
            db.add(todo)
            db.flush()
            for n in range(count):
                db.add(UtilityBill(parish_id=1, original_filename=f"bill{n}.pdf", provider_name="Georgia Power", utility_type="Electricity",
                                   building_name="parish hall", bill_date=date(2026, 1, 1), billing_period_start=date(2025, 12, 1),
                                   billing_period_end=date(2025, 12, 31), total_amount=1234.5, usage_quantity=1200, usage_unit="kWh",
                                   rate=0.1234, uploaded_at=CREATED))
                db.add(UtilityBill(parish_id=1, original_filename=f"gas{n}.pdf", utility_type="gas", account_number="W-1",
                                   bill_date=date(2026, 2, 1), total_amount=50, usage_quantity=30, usage_unit="therms"))
                asset = Asset(parish_id=1, name=f"Boiler {n}", location="Parish Hall", year_installed=2020, expected_life=20,
                              initial_cost=10000, created_at=CREATED, updated_at=CREATED)
                asset.documents = [AssetDocument(filename="manual.pdf", source="upload"), AssetDocument(filename="Spec sheet", source="catalog")]
                db.add(asset)
                order = WorkOrder(parish_id=1, display_number=f"WO-{n + 1}", building_id=hall.id, todo_id=todo.id, title="Leak",
                                  description=TRICKY, status="in_progress", priority="high", requester_sub="user1",
                                  requester_name="Ann", created_at=CREATED, updated_at=CREATED)
                order.notes = [WorkOrderNote(author_sub="user1", author_name="Ann", body="Called plumber", created_at=CREATED)]
                db.add(order)
            db.add(Appraisal(parish_id=1, original_filename="appraisal.pdf", entity_name="St. Mary's", appraisal_date=date(2025, 6, 1),
                             raw_extracted={"expiration_date": "2028-06-01", "sections": [
                                 {"valuation_number": "1", "building_name": "Parish Hall", "building_value": "$1,000,000"},
                                 {"valuation_number": "2", "building_name": "Garage", "building_value": 5000}]}))
            db.commit()

    def test_empty_parish_has_every_sheet_with_formatted_headers(self):
        result, wb = self.export(parish_id=2)
        self.assertEqual(wb.sheetnames, ALL_SHEETS)
        for name in ALL_SHEETS[:-1]:
            ws = wb[name]
            self.assertEqual(ws.freeze_panes, "A2")
            self.assertTrue(all(c.font.bold for c in ws[1]))
            self.assertTrue(any("(UTC)" in c.value for c in ws[1]), name)
            self.assertEqual(ws.max_row, 1, name)
        [member] = self.rows(wb["Access"])
        self.assertEqual((member["Email"], member["Role"], member["Status"], member["Parish owner"]),
                         ("user1@example.com", "Admin", "Active", "Yes"))
        self.assertIsInstance(member["Added (UTC)"], datetime.datetime)
        today = datetime.datetime.utcnow().date().isoformat()
        self.assertIn(f'filename="Empty_Parish_export_{today}.xlsx"', result.headers["content-disposition"])

    def test_full_export_links_records_and_uses_real_dates_and_currency(self):
        self.seed_full()
        _, wb = self.export()
        hall_id = self.rows(wb["Buildings"])[0]["Building ID"]
        self.assertEqual(self.rows(wb["Buildings"])[0]["Account # (electric)"], "E-1")

        bills = self.rows(wb["Utilities"])
        self.assertIn("Usage (kWh)", bills[0])
        self.assertIn("Usage (therms)", bills[0])
        self.assertEqual((bills[0]["Building"], bills[0]["Building ID"], bills[0]["Usage (kWh)"], bills[0]["Usage (therms)"]),
                         ("parish hall", hall_id, 1200, None))
        self.assertEqual((bills[1]["Building"], bills[1]["Building ID"], bills[1]["Usage (therms)"]), ("Parish Hall", hall_id, 30))
        ws = wb["Utilities"]
        headers = [c.value for c in ws[1]]
        cost = ws.cell(row=2, column=headers.index("Total cost") + 1)
        self.assertEqual((cost.value, cost.number_format), (1234.5, '"$"#,##0.00'))
        bill_date = ws.cell(row=2, column=headers.index("Bill date") + 1)
        self.assertIsInstance(bill_date.value, datetime.datetime)  # Excel date cell, not text
        self.assertEqual(ws.cell(row=2, column=headers.index("Created (UTC)") + 1).value, CREATED)

        appraisals = self.rows(wb["Appraisals"])
        self.assertEqual([(a["Building"], a["Building ID"], a["Building value"]) for a in appraisals],
                         [("Parish Hall", hall_id, 1000000), ("Garage", None, 5000)])
        self.assertEqual(appraisals[0]["Expiration date"], datetime.datetime(2028, 6, 1))

        asset = self.rows(wb["Assets"])[0]
        self.assertEqual((asset["Building ID"], asset["Annual accrual"], asset["Document count"], asset["Documents"]),
                         (hall_id, 500, 2, "manual.pdf\nSpec sheet (catalog)"))
        self.assertEqual((asset["Created (UTC)"], asset["Updated (UTC)"]), (CREATED, CREATED))

        order = self.rows(wb["Work Orders"])[0]
        self.assertEqual((order["Status"], order["Priority"], order["Building"], order["Building ID"], order["Backlog item"]),
                         ("In Progress", "High", "Parish Hall", hall_id, "Fix roof"))
        self.assertEqual((order["Note count"], order["Notes"]), (1, "2026-03-04 15:30 UTC — Ann: Called plumber"))

        access = {r["Email"]: r for r in self.rows(wb["Access"])}
        self.assertEqual(access["pending@example.com"]["Status"], "Pending invitation")
        self.assertEqual(access["user2@example.com"]["Role"], "Editor")
        self.assertNotIn("invitation_token", [c.value for c in wb["Access"][1]])

    def test_many_records(self):
        self.seed_full(count=500)
        _, wb = self.export()
        self.assertEqual(wb["Utilities"].max_row, 1001)
        self.assertEqual(wb["Assets"].max_row, 501)
        self.assertEqual(wb["Work Orders"].max_row, 501)
        self.assertLessEqual(wb["Work Orders"].column_dimensions["D"].width, 62)

    def test_commas_line_breaks_emoji_and_formula_text_round_trip(self):
        self.seed_full()
        with self.sessions() as db:
            db.add(Asset(parish_id=1, name="=HYPERLINK(\"http://evil\")", location="Hall\x07", manufacturer="+1-555",
                         year_installed=2020, expected_life=10, initial_cost=1))
            db.commit()
        _, wb = self.export()
        self.assertEqual(self.rows(wb["Buildings"])[1]["Name"], TRICKY)
        self.assertEqual(self.rows(wb["Work Orders"])[0]["Description"], TRICKY)
        self.assertTrue(wb["Work Orders"]["D2"].alignment.wrap_text)
        ws = wb["Assets"]
        self.assertEqual((ws["B3"].value, ws["B3"].data_type), ('=HYPERLINK("http://evil")', "s"))
        self.assertEqual((ws["D3"].value, ws["F3"].value), ("Hall", "+1-555"))  # control character stripped

    def test_missing_values_stay_blank(self):
        with self.sessions() as db:
            db.add(UtilityBill(parish_id=1, original_filename="x.pdf", bill_date=date(2026, 1, 1), total_amount=0, usage_quantity=5))
            db.add(Appraisal(parish_id=1, original_filename="a.pdf"))
            db.add(WorkOrder(parish_id=1, display_number="WO-1", title="T", requester_sub="user1"))
            db.commit()
        _, wb = self.export()
        bill = self.rows(wb["Utilities"])[0]
        self.assertEqual((bill["Building"], bill["Building ID"], bill["Due date"], bill["Usage (unit not recorded)"], bill["Total cost"]),
                         (None, None, None, 5, 0))
        self.assertEqual(self.rows(wb["Appraisals"])[0]["Building"], None)
        order = self.rows(wb["Work Orders"])[0]
        self.assertEqual((order["Building"], order["Notes"], order["Note count"], order["Closed (UTC)"]), (None, None, 0, None))

    def test_access_sheet_only_for_admins(self):
        for user in (2, 3):
            self.login(user)
            _, wb = self.export()
            self.assertEqual(wb.sheetnames, ALL_SHEETS[:-1])

    def test_refuses_non_members_and_unknown_parishes(self):
        self.login(4)
        result = self.client.get("/parishes/1/export")
        self.assertEqual((result.status_code, result.json()["detail"]), (403, "You don't have access to this parish"))
        result = self.client.get("/parishes/999/export")
        self.assertEqual((result.status_code, result.json()["detail"]), (404, "Parish not found"))

    def test_filename_is_safe(self):
        self.assertEqual(export_filename("St. Mary's Church", date(2026, 11, 16)), "St_Marys_Church_export_2026-11-16.xlsx")
        self.assertEqual(export_filename("São José / \"East\"", date(2026, 1, 2)), "Sao_Jose_East_export_2026-01-02.xlsx")
        self.assertEqual(export_filename("⛪", date(2026, 1, 2)), "parish_export_2026-01-02.xlsx")


if __name__ == "__main__":
    unittest.main()
