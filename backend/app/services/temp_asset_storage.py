"""TEMPORARY asset document storage: files on the local disk of the API server.

Replace before production. Local disk is lost on redeploy/scale-out and is not
backed up. Swap this module for object storage (S3/GCS/etc.) keeping the same
three functions: save_upload, open_path, delete_path.
"""
import os
import uuid
from pathlib import Path
from fastapi import UploadFile
from app.config import settings

TEMPORARY = True
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class FileTooLarge(Exception):
    pass


def _root() -> Path:
    root = Path(settings.asset_upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_upload(asset_id: int, file: UploadFile) -> tuple[str, int]:
    """Write the upload to disk under a random name. Returns (relative path, size)."""
    rel = f"{asset_id}/{uuid.uuid4().hex}"
    dest = _root() / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with open(dest, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise FileTooLarge()
                out.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return rel, size


def open_path(rel: str) -> Path | None:
    """Resolve a stored relative path, refusing anything outside the upload dir."""
    root = _root().resolve()
    path = (root / rel).resolve()
    if root not in path.parents or not path.is_file():
        return None
    return path


def delete_path(rel: str | None) -> None:
    if rel and (path := open_path(rel)):
        os.remove(path)
