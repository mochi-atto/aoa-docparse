"""Explicit, idempotent additive integration migration; never runs on import.

Review: python -m app.migrations
Apply only to an approved target: python -m app.migrations --apply
No records are assigned to users and no constraints/tables/data are dropped.
"""
import argparse
from sqlalchemy import inspect, text
from app.database import Base, engine


def load_models():
    from app.models import account, appraisal, asset, building, extraction_template
    from app.models import history_entry, parish, parish_member, todo, user_profile, utility_bill, work_order


def pending(connection):
    schema = inspect(connection)
    tables = set(schema.get_table_names())
    changes = []
    if "parishes" in tables and "owner_account_id" not in {c["name"] for c in schema.get_columns("parishes")}:
        changes.append("ALTER TABLE parishes ADD COLUMN owner_account_id INTEGER REFERENCES accounts(id)")
    if "work_orders" in tables and "todo_id" not in {c["name"] for c in schema.get_columns("work_orders")}:
        changes.append("ALTER TABLE work_orders ADD COLUMN todo_id INTEGER REFERENCES todos(id) ON DELETE SET NULL")
    if "work_orders" in tables and "status_before_hold" not in {c["name"] for c in schema.get_columns("work_orders")}:
        changes.append("ALTER TABLE work_orders ADD COLUMN status_before_hold VARCHAR")
    if "extraction_templates" in tables and "parish_id" not in {c["name"] for c in schema.get_columns("extraction_templates")}:
        changes.append("ALTER TABLE extraction_templates ADD COLUMN parish_id INTEGER REFERENCES parishes(id)")
    return changes


def migrate(target, apply=False):
    load_models()
    with target.begin() as connection:
        changes = pending(connection)
        missing = sorted(set(Base.metadata.tables) - set(inspect(connection).get_table_names()))
        if apply:
            # Create referenced tables before adding foreign keys to legacy tables.
            # create_all leaves existing tables and their records untouched.
            Base.metadata.create_all(connection)
            for statement in changes:
                connection.execute(text(statement))
            Base.metadata.create_all(connection)
        return {"new_tables": missing, "additive_statements": changes, "applied": apply}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(migrate(engine, args.apply))
