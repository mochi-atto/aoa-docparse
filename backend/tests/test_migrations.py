import unittest
from sqlalchemy import create_engine, inspect, text
from app.migrations import migrate


class MigrationTests(unittest.TestCase):
    def test_readiness_detects_unmigrated_database_without_changing_it(self):
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        from sqlalchemy.pool import StaticPool
        from app.main import app
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        self.addCleanup(engine.dispose)
        with patch("app.main.engine", engine), TestClient(app) as client:
            self.assertEqual(client.get("/api/ready").status_code, 503)
            self.assertEqual(inspect(engine).get_table_names(), [])
            migrate(engine, apply=True)
            self.assertEqual(client.get("/api/ready").status_code, 200)

    def test_empty_schema_and_repeat_are_safe(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        self.assertIn("assets", migrate(engine)["new_tables"])
        self.assertEqual(inspect(engine).get_table_names(), [])
        migrate(engine, apply=True)
        self.assertEqual(migrate(engine)["new_tables"], [])
        self.assertEqual(migrate(engine)["additive_statements"], [])
        migrate(engine, apply=True)

    def test_legacy_schema_keeps_rows_and_adds_columns(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE parishes (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL UNIQUE, diocese VARCHAR, address VARCHAR, image_data TEXT, created_at DATETIME)"))
            connection.execute(text("INSERT INTO parishes (id, name) VALUES (7, 'Synthetic existing parish')"))
            connection.execute(text("CREATE TABLE todos (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE work_orders (id INTEGER PRIMARY KEY)"))
        self.assertEqual(len(migrate(engine)["additive_statements"]), 3)
        migrate(engine, apply=True)
        with engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT name FROM parishes WHERE id=7")).scalar(), "Synthetic existing parish")
            self.assertIsNone(connection.execute(text("SELECT owner_account_id FROM parishes WHERE id=7")).scalar())
        self.assertIn("todo_id", {c["name"] for c in inspect(engine).get_columns("work_orders")})
        self.assertIn("status_before_hold", {c["name"] for c in inspect(engine).get_columns("work_orders")})
