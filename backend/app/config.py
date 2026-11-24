import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    openai_api_key: str = ""  # Used for utility bill extraction only
    auth0_domain: str = ""
    auth0_api_audience: str = ""
    auth0_algorithms: str = "RS256"
    allowed_origins: str = "http://localhost:5173"  # Vite dev server
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    frontend_url: str = "http://localhost:5173"

    asset_upload_dir: str = "uploads/assets"
    initialize_database: bool = False

    class Config:
        env_file = os.environ.get("AOA_ENV_FILE", ".env")

settings = Settings()