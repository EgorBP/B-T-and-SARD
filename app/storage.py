import os
import shutil
import uuid

from fastapi import HTTPException
from fastapi import UploadFile

from .context import MEDIA_PATH, MEDIA_SUBDIRS, ensure_media_dirs


ALLOWED_EXTENSIONS_BY_PREFIX = {
    "track": {".mp3", ".wav", ".ogg"},
    "cover": {".jpg", ".jpeg", ".png", ".webp", ".gif"},
    "avatar": {".jpg", ".jpeg", ".png", ".webp", ".gif"},
}

ALLOWED_MIME_PREFIX_BY_PREFIX = {
    "track": "audio/",
    "cover": "image/",
    "avatar": "image/",
}


def validate_uploaded_file(file: UploadFile, prefix: str) -> None:
    allowed_ext = ALLOWED_EXTENSIONS_BY_PREFIX.get(prefix, set())
    ext = os.path.splitext(file.filename or "")[1].lower()
    if allowed_ext and ext not in allowed_ext:
        if prefix == "track":
            raise HTTPException(status_code=422, detail="Можно загружать только аудиофайлы (mp3/wav/ogg)")
        raise HTTPException(status_code=422, detail="Можно загружать только изображения (jpg/jpeg/png/webp/gif)")

    expected_mime_prefix = ALLOWED_MIME_PREFIX_BY_PREFIX.get(prefix)
    content_type = (file.content_type or "").lower()
    if expected_mime_prefix and content_type and not content_type.startswith(expected_mime_prefix):
        if prefix == "track":
            raise HTTPException(status_code=422, detail="Некорректный тип файла: нужен аудиофайл")
        raise HTTPException(status_code=422, detail="Некорректный тип файла: нужно изображение")


def save_uploaded_file(file: UploadFile, prefix: str) -> str:
    ensure_media_dirs()
    ext = os.path.splitext(file.filename or "")[1].lower()
    safe_ext = ext if ext in ALLOWED_EXTENSIONS_BY_PREFIX.get(prefix, set()) else ""
    filename = f"{prefix}-{uuid.uuid4().hex}{safe_ext}"
    subdir = MEDIA_SUBDIRS.get(prefix, "")
    rel_path = f"{subdir}/{filename}" if subdir else filename
    file_path = os.path.join(MEDIA_PATH, *rel_path.split("/"))
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return rel_path
