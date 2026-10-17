"""Store the two uploaded assessment files and read them when they are plain text.

Files are only stored and decoded as text. They are never executed, imported or opened by any
other program. The client's filename is never used on disk.
"""

import logging
import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from . import config, db
from .errors import AppError
from .prompts import looks_like_injection
from .schemas import UploadCreated, UploadedFile

log = logging.getLogger("vdemo")

TEXT_EXTS = {".txt", ".md", ".py"}
BINARY_EXTS = {".pdf", ".docx"}
ALLOWED_EXTS = TEXT_EXTS | BINARY_EXTS
PER_FILE_CHARS = 6000

NOTE_TEXT = "Your text files will be used to write the questions."
NOTE_SAMPLE = "PDF and Word files are saved but not read in this demo, so the sample quiz is used."


def display_name(raw: str | None) -> str:
    """A safe label for the screen: no path, no control characters, at most 100 characters."""
    name = (raw or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return (name or "file")[:100]


def _read_limited(upload: UploadFile, limit: int) -> bytes:
    """Read at most limit+1 bytes so an oversize body is never loaded into memory."""
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise AppError(413, "file_too_large", f"Each file must be {limit // 1024} KB or smaller.")
    if not data:
        raise AppError(422, "empty_file", "One of the files is empty.")
    return data


def _check(role: str, upload: UploadFile) -> tuple[str, str, bytes]:
    name = display_name(upload.filename)
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise AppError(
            415, "unsupported_file_type", "Use a .txt, .md, .py, .pdf or .docx file."
        )
    data = _read_limited(upload, config.max_upload_bytes())
    if ext == ".pdf" and not data.startswith(b"%PDF"):
        raise AppError(415, "unsupported_file_type", f"The {role} file is not a real PDF.")
    if ext == ".docx" and not data.startswith(b"PK"):
        raise AppError(415, "unsupported_file_type", f"The {role} file is not a real Word file.")
    if ext in TEXT_EXTS and b"\x00" in data:
        raise AppError(415, "unsupported_file_type", f"The {role} file is not a text file.")
    return name, ext, data


def store_uploads(questions_file: UploadFile, answers_file: UploadFile) -> UploadCreated:
    q_name, q_ext, q_data = _check("questions", questions_file)
    a_name, a_ext, a_data = _check("answers", answers_file)

    upload_id = str(uuid.uuid4())
    folder = config.upload_dir() / upload_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"questions{q_ext}").write_bytes(q_data)
    (folder / f"answers{a_ext}").write_bytes(a_data)

    text_used = q_ext in TEXT_EXTS and a_ext in TEXT_EXTS
    extracted = ""
    if text_used:
        q_text = q_data.decode("utf-8", errors="replace")[:PER_FILE_CHARS]
        a_text = a_data.decode("utf-8", errors="replace")[:PER_FILE_CHARS]
        extracted = f"QUESTIONS FILE:\n{q_text}\n\nSTUDENT ANSWERS FILE:\n{a_text}"
        if looks_like_injection(extracted):
            # ids only: never log what the file says
            log.warning("instruction-like text flagged in upload %s", upload_id)

    db.create_upload(upload_id, q_name, a_name, q_ext, a_ext, text_used, extracted)
    return UploadCreated(
        upload_id=upload_id,
        files=[
            UploadedFile(role="questions", name=q_name, size_bytes=len(q_data)),
            UploadedFile(role="answers", name=a_name, size_bytes=len(a_data)),
        ],
        text_used=text_used,
        note=NOTE_TEXT if text_used else NOTE_SAMPLE,
    )
