"""TEMPORARY asset document storage: files on the local disk of the API server.

Replace before production. Local disk is lost on redeploy/scale-out and is not
backed up. Swap this module for object storage (S3/GCS/etc.) keeping the same
three functions: save_upload, open_path, delete_path.
"""
import os
import re
import uuid
from pathlib import Path
from fastapi import UploadFile
from app.config import settings

TEMPORARY = True
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class FileTooLarge(Exception):
    pass



class InvalidFile(Exception):
    pass

def safe_filename(name):
    name = (name or "document").replace("\\", "/").rsplit("/", 1)[-1]
    return re.sub(r"[\x00-\x1f\x7f]", "", name)[:180] or "document"

def validate_upload(file):
    suffix = Path(safe_filename(file.filename)).suffix.lower()
    head = file.file.read(16)
    file.file.seek(0)
    valid = ((suffix == ".pdf" and head.startswith(b"%PDF-")) or
             (suffix == ".png" and head.startswith(b"\x89PNG\r\n\x1a\n")) or
             (suffix in {".jpg", ".jpeg"} and head.startswith(b"\xff\xd8\xff")) or
             (suffix == ".txt" and b"\x00" not in head))
    if not valid:
        raise InvalidFile()

def _root() -> Path:
    root = Path(settings.asset_upload_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_upload(asset_id: int, file: UploadFile) -> tuple[str, int]:
    """Write the upload to disk under a random name. Returns (relative path, size)."""
    validate_upload(file)
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
