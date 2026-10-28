from app.logging_filters import configure_access_logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.config import settings
from app.routers import parishes, upload, data, templates, parish_data, work_orders, users, assets, account

# Import all models so create_all picks them up
from app.models.parish import Parish  # noqa
from app.models.utility_bill import UtilityBill  # noqa
from app.models.appraisal import Appraisal  # noqa
from app.models.extraction_template import ExtractionTemplate  # noqa
from app.models.todo import Todo  # noqa
from app.models.history_entry import HistoryEntry  # noqa
from app.models.building import Building  # noqa
from app.models.work_order import WorkOrder  # noqa
from app.models.user_profile import UserProfile  # noqa
from app.models.asset import Asset, AssetDocument  # noqa

from app.models.account import Account  # noqa
from app.models.parish_member import ParishMember  # noqa

# Schema changes are explicit; production/development PostgreSQL is never migrated on import.
if settings.initialize_database:
    Base.metadata.create_all(bind=engine)

configure_access_logging()

app = FastAPI(title="Parish Document Parser API", version="0.1.0")

# CORS — allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(parishes.router, prefix="/api/parishes", tags=["Parishes"])
app.include_router(upload.router, prefix="/api/upload", tags=["Upload"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
app.include_router(parish_data.router, prefix="/api/parishes", tags=["Parish Data"])
app.include_router(work_orders.router, prefix="/api/parishes", tags=["Work Orders"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(assets.router, prefix="/api/parishes", tags=["Assets"])


app.include_router(account.router, prefix="/api/account", tags=["Account"])


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/ready")
def readiness_check():
    from app.migrations import migrate
    from sqlalchemy.exc import SQLAlchemyError
    try:
        plan = migrate(engine)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database is temporarily unavailable")
    if plan["new_tables"] or plan["additive_statements"]:
        raise HTTPException(status_code=503, detail="Database schema requires an explicit reviewed migration")
    return {"status": "ready"}
