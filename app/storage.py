import os
import shutil
import uuid

from fastapi import UploadFile

from .context import MEDIA_PATH


def save_uploaded_file(file: UploadFile, prefix: str) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    safe_ext = ext if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp3", ".wav", ".ogg"} else ""
    filename = f"{prefix}-{uuid.uuid4().hex}{safe_ext}"
    file_path = os.path.join(MEDIA_PATH, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return filename

