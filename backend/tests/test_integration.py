"""Synthetic parish isolation, work-order lifecycle and asset document regressions."""
import tempfile
import unittest
from unittest.mock import patch
import test_rbac as rbac
from app.routers import assets, work_orders, templates
from app.models.building import Building
from app.models.todo import Todo
from app.models.work_order import WorkOrder
from app.models.user_profile import UserProfile
from app.models.history_entry import HistoryEntry
from app.services import temp_asset_storage


class IntegrationTests(unittest.TestCase):
    login = rbac.PermissionsTests.login
    tearDown = rbac.PermissionsTests.tearDown

    def setUp(self):
        rbac.PermissionsTests.setUp(self)
        self.app.include_router(assets.router, prefix="/parishes")
        self.app.include_router(work_orders.router, prefix="/parishes")
        self.app.include_router(templates.router, prefix="/templates")
        self.directory = tempfile.TemporaryDirectory()
        self.storage = patch.object(assets.temp_asset_storage.settings, "asset_upload_dir", self.directory.name)
        self.storage.start()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.storage.stop)
        with self.sessions() as db:
            db.add(Building(id=1, parish_id=2, name="Other parish"))
            db.add(Todo(id=1, parish_id=2, text="Other task", building="Other parish"))
            db.add(UserProfile(sub="user2", display_name="Synthetic Technician"))
            db.commit()

    def asset(self):
        return self.client.post("/parishes/1/assets", json={"name": "Synthetic boiler", "location": "Hall", "year_installed": 2020, "expected_life": 20, "initial_cost": 20000})

    def order(self):
        return self.client.post("/parishes/1/work-orders", json={"title": "Synthetic roof repair"})

    def test_work_order_membership_and_creation_roles(self):
        for user, read, write in [(1, 200, 200), (2, 200, 200), (3, 200, 403), (4, 404, 404)]:
            self.login(user)
            self.assertEqual(self.client.get("/parishes/1/work-orders").status_code, read)
            self.assertEqual(self.order().status_code, write)

    def test_full_lifecycle_assignee_and_admin_review(self):
        order = self.order().json()["id"]
        path = f"/parishes/1/work-orders/{order}"
        self.login(2)
        self.assertEqual(self.client.post(path + "/start").status_code, 403)
        claimed = self.client.post(path + "/claim")
        self.assertEqual(claimed.status_code, 200, claimed.text)
        self.assertEqual(claimed.json()["technician_name"], "Synthetic Technician")
        self.assertEqual(self.client.post(path + "/claim").status_code, 409)
        for action, state in [("hold", "on_hold"), ("resume", "assigned"), ("start", "in_progress"), ("hold", "on_hold"), ("resume", "in_progress")]:
            response = self.client.post(path + "/" + action)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["status"], state)
        self.assertEqual(self.client.post(path + "/submit", json={"completion_notes": " "}).status_code, 422)
        response = self.client.post(path + "/submit", json={"completion_notes": "Synthetic repair complete"})
        self.assertEqual(response.json()["status"], "ready_for_review")
        self.assertEqual(self.client.post(path + "/close").status_code, 403)
        self.login(1)
        closed = self.client.post(path + "/close")
        self.assertEqual(closed.status_code, 200, closed.text)
        self.assertIsNotNone(closed.json()["closed_at"])
        self.assertEqual(self.client.post(path + "/close").status_code, 409)
        with self.sessions() as db:
            self.assertEqual(db.query(HistoryEntry).filter_by(related_type="work_order", related_id=order).count(), 9)

    def test_work_order_foreign_links_and_other_parish_denied(self):
        for field in ["building_id", "todo_id"]:
            self.assertEqual(self.client.post("/parishes/1/work-orders", json={"title": "Test", field: 1}).status_code, 400)
        order = self.order().json()["id"]
        self.login(4)
        for action in ["claim", "start", "hold", "resume", "submit", "close"]:
            response = self.client.post(f"/parishes/1/work-orders/{order}/{action}", json={"completion_notes": "Test"})
            self.assertEqual(response.status_code, 404, action)

    def test_corrupt_resume_state_is_rejected(self):
        order = self.order().json()["id"]
        with self.sessions() as db:
            record = db.get(WorkOrder, order)
            record.status = "on_hold"
            record.status_before_hold = None
            db.commit()
        self.assertEqual(self.client.post(f"/parishes/1/work-orders/{order}/resume").status_code, 409)

    def test_asset_roles_and_cross_parish_document_isolation(self):
        asset = self.asset().json()["id"]
        path = f"/parishes/1/assets/{asset}"
        response = self.client.post(path + "/documents", files={"files": ("../../synthetic.pdf", b"%PDF-1.4\nsynthetic", "application/pdf")})
        self.assertEqual(response.status_code, 200, response.text)
        doc = response.json()["documents"][0]
        self.assertEqual(doc["filename"], "synthetic.pdf")
        for user, read, create in [(1, 200, 200), (2, 200, 403), (3, 200, 403), (4, 404, 404)]:
            self.login(user)
            self.assertEqual(self.client.get("/parishes/1/assets").status_code, read)
            self.assertEqual(self.asset().status_code, create)
            self.assertEqual(self.client.get(path + f"/documents/{doc['id']}/file").status_code, read)
            self.assertEqual(self.client.get("/parishes/1/assets/manual-lookup").status_code, read)
        self.login(3)
        self.assertEqual(self.client.delete(path).status_code, 403)
        self.assertEqual(self.client.post(path + "/documents", files={"files": ("s.pdf", b"%PDF-1.4", "application/pdf")}).status_code, 403)
        self.login(2)
        self.assertEqual(self.client.post(path + "/documents", files={"files": ("s.pdf", b"%PDF-1.4", "application/pdf")}).status_code, 200)

    def test_asset_validation_file_limits_and_download_headers(self):
        asset = self.asset().json()["id"]
        path = f"/parishes/1/assets/{asset}/documents"
        for name, data in [("evil.html", b"<script>bad</script>"), ("fake.pdf", b"not a PDF")]:
            self.assertEqual(self.client.post(path, files={"files": (name, data, "application/pdf")}).status_code, 422)
        with patch.object(temp_asset_storage, "MAX_UPLOAD_BYTES", 8):
            self.assertEqual(self.client.post(path, files={"files": ("large.pdf", b"%PDF-1.4\ntoo large", "application/pdf")}).status_code, 413)
        response = self.client.post(path, files={"files": ("test.pdf", b"%PDF-1.4", "application/pdf")})
        doc = response.json()["documents"][0]["id"]
        response = self.client.get(path + f"/{doc}/file")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertIsNone(temp_asset_storage.open_path("../../not-allowed"))
        self.assertEqual(self.client.put(f"/parishes/1/assets/{asset}", json={"expected_life": 0}).status_code, 422)
        self.assertEqual(self.client.put(f"/parishes/1/assets/{asset}", json={"name": "  "}).status_code, 422)

    def test_other_technician_cannot_change_assigned_order(self):
        from app.models.parish_member import ParishMember
        with self.sessions() as db:
            db.add(ParishMember(parish_id=1, account_id=4, email="user4@example.com", role="editor"))
            db.commit()
        order = self.order().json()["id"]
        path = f"/parishes/1/work-orders/{order}"
        self.login(2)
        self.assertEqual(self.client.post(path + "/claim").status_code, 200)
        self.login(4)
        for action in ["start", "hold", "resume", "submit"]:
            self.assertEqual(self.client.post(path + "/" + action, json={"completion_notes": "Test"}).status_code, 403)

    def test_nonmember_asset_mutations_are_all_denied(self):
        asset = self.asset().json()["id"]
        path = f"/parishes/1/assets/{asset}"
        self.login(4)
        self.assertEqual(self.client.put(path, json={"name": "Denied"}).status_code, 404)
        self.assertEqual(self.client.delete(path).status_code, 404)
        self.assertEqual(self.client.post(path + "/documents", files={"files": ("s.pdf", b"%PDF-test", "application/pdf")}).status_code, 404)
        self.assertEqual(self.client.post(path + "/documents/catalog", json={"filenames": ["test.pdf"]}).status_code, 404)
        self.assertEqual(self.client.delete(path + "/documents/1").status_code, 404)

    def test_shared_parser_normalization_and_service_deduplication(self):
        from app.parsers.utility_parser import _deduplicate_bills
        from app.routers.data import _normalize_util_type
        self.assertEqual(_normalize_util_type("sewer"), "water")
        self.assertEqual(_normalize_util_type("unrecognized"), "other")
        bills = [{"service_address": "Synthetic", "bill_date": "2026-01-01", "total_amount": 10, "utility_type": kind} for kind in ["water", "waste"]]
        self.assertEqual(len(_deduplicate_bills(bills)), 2)

    def test_asset_cost_and_install_year_edge_cases(self):
        import datetime
        asset = self.asset().json()["id"]
        path = f"/parishes/1/assets/{asset}"
        response = self.client.put(path, json={"accrual_override": 0, "year_installed": datetime.date.today().year + 1})
        self.assertEqual(response.json()["annual_accrual"], 0)
        self.assertEqual(response.json()["remaining_life"], response.json()["expected_life"])
        self.assertEqual(self.client.put(path, json={"expected_life": None}).status_code, 422)

    def test_pdf_upload_content_and_size_validation(self):
        from app.routers import upload
        for content, expected in [(b"not-pdf", 400), (b"%PDF-larger-than-test-limit", 413)]:
            with patch.object(upload, "MAX_PDF_BYTES", 16):
                result = self.client.post("/upload/", data={"parish_id": "1", "doc_type": "appraisal"}, files={"file": ("synthetic.pdf", content, "application/pdf")})
            self.assertEqual(result.status_code, expected, result.text)

    def test_templates_are_scoped_by_parish(self):
        body = {"parish_id": 1, "name": "Synthetic private template", "field_patterns": []}
        created = self.client.post("/templates/", json=body)
        self.assertEqual(created.status_code, 200, created.text)
        template = created.json()["id"]
        self.login(2)
        self.assertEqual(self.client.put(f"/templates/{template}", json={"name": "Denied"}).status_code, 403)
        second = self.client.post("/templates/", json={**body, "parish_id": 2}).json()["id"]
        self.assertEqual(self.client.post(f"/templates/{second}/set-default").status_code, 200)
        self.login(1)
        self.assertEqual(self.client.get(f"/templates/{second}").status_code, 404)
        self.assertEqual(self.client.post(f"/templates/{template}/set-default").status_code, 200)
        with self.sessions() as db:
            from app.models.extraction_template import ExtractionTemplate
            self.assertTrue(db.get(ExtractionTemplate, second).is_default)
        self.login(4)
        self.assertEqual(self.client.get("/templates/?parish_id=1").status_code, 404)
        self.assertEqual(self.client.get(f"/templates/{template}").status_code, 404)
        self.assertEqual(self.client.delete(f"/templates/{template}").status_code, 404)


if __name__ == "__main__":
    unittest.main()
