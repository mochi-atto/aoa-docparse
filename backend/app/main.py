from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.config import settings
from app.routers import parishes, upload, data, templates, parish_data

# Import all models so create_all picks them up
from app.models.parish import Parish  # noqa
from app.models.utility_bill import UtilityBill  # noqa
from app.models.appraisal import Appraisal  # noqa
from app.models.extraction_template import ExtractionTemplate  # noqa
from app.models.todo import Todo  # noqa
from app.models.history_entry import HistoryEntry  # noqa
from app.models.building import Building  # noqa

# Create all tables
Base.metadata.create_all(bind=engine)

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


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}