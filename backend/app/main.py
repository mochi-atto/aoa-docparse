from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
from app.routers import parishes, upload, data

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

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}