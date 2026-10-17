"""Store uploaded assessment files and extract their text for question and expected-answer generation.

Text, PDF and Word content is extracted as text. They are never executed, imported or opened by any
other program. The client's filename is never used on disk.
"""

import io
import logging
import re
import uuid
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from fastapi import UploadFile
from pypdf import PdfReader

from . import config, db
from .errors import AppError
from .prompts import looks_like_injection
from .schemas import UploadCreated, UploadedFile

log = logging.getLogger("vdemo")

CODE_EXTS = {'.c', '.js', '.php', '.swift', '.bash', '.mm', '.cc', '.kts', '.kt', '.sql', '.ipynb', '.java', '.rb', '.py', '.ts', '.scss', '.css', '.tsx', '.h', '.hpp', '.cs', '.lua', '.m', '.go', '.html', '.r', '.cxx', '.json', '.hh', '.dart', '.rs', '.scala', '.sh', '.jsx', '.hxx', '.cpp'}
TEXT_EXTS = {".txt", ".md"} | CODE_EXTS
BINARY_EXTS = {".pdf", ".docx"}
ALLOWED_EXTS = TEXT_EXTS | BINARY_EXTS
PER_FILE_CHARS = 60000
MAX_TOTAL_CHARS = 120000

NOTE_TEXT = "Your uploaded files will be used to generate the questions and expected answers."


def extract_text(name: str, ext: str, data: bytes) -> str:
    try:
        if ext in TEXT_EXTS:
            text = data.decode("utf-8-sig")
        elif ext == ".pdf":
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise AppError(422, "unreadable_file", f"{name}: upload an unencrypted PDF.")
            parts = []
            length = 0
            for page in reader.pages:
                part = page.extract_text() or ""
                length += len(part)
                if length > PER_FILE_CHARS:
                    raise AppError(413, "text_too_large", f"{name}: too much extracted text; split the assessment.")
                parts.append(part)
            text = "\n".join(parts)
        else:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                info = archive.getinfo("word/document.xml")
                if info.file_size > 8 * 1024 * 1024:
                    raise AppError(413, "text_too_large", f"{name}: Word document is too large to read.")
                root = ElementTree.fromstring(archive.read(info))
            ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            text = "\n".join(
                "".join(node.text or "" for node in paragraph.iter(ns + "t"))
                for paragraph in root.iter(ns + "p")
            )
    except AppError:
        raise
    except Exception as exc:
        raise AppError(422, "unreadable_file", f"Could not read {name}. Upload a valid text, PDF or Word document.") from exc
    if not text.strip():
        raise AppError(422, "no_readable_text", f"{name} contains no readable text. For scanned documents, use OCR or upload a text version.")
    if len(text) > PER_FILE_CHARS:
        raise AppError(413, "text_too_large", f"{name}: too much extracted text; split the assessment.")
    return text


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
            415, "unsupported_file_type", "Use a source-code file (such as .java, .cpp or .py), or a .txt, .md, .pdf or .docx document."
        )
    data = _read_limited(upload, config.max_upload_bytes())
    if ext == ".pdf" and not data.startswith(b"%PDF"):
        raise AppError(415, "unsupported_file_type", f"The {role} file is not a real PDF.")
    if ext == ".docx" and not data.startswith(b"PK"):
        raise AppError(415, "unsupported_file_type", f"The {role} file is not a real Word file.")
    if ext in TEXT_EXTS and b"\x00" in data:
        raise AppError(415, "unsupported_file_type", f"The {role} file is not a text file.")
    return name, ext, data


def store_uploads(questions_file: UploadFile, answers_file: list[UploadFile]) -> UploadCreated:
    q_name, q_ext, q_data = _check("questions", questions_file)
    answers = [_check("answers", file) for file in answers_file]
    a_name = ", ".join(name for name, _, _ in answers)
    a_ext = ",".join(ext for _, ext, _ in answers)

    q_text = extract_text(q_name, q_ext, q_data)
    answer_texts = [extract_text(name, ext, data) for name, ext, data in answers]
    if len(q_text) + sum(map(len, answer_texts)) > MAX_TOTAL_CHARS:
        raise AppError(413, "text_too_large", "The assessment contains too much text. Upload a smaller assessment.")
    a_text = "\n\n".join(
        f"ANSWER FILE {i + 1} ({name}):\n{text}"
        for i, ((name, _, _), text) in enumerate(zip(answers, answer_texts))
    )
    extracted = f"QUESTIONS FILE ({q_name}):\n{q_text}\n\nSTUDENT ANSWERS FILES:\n{a_text}"
    text_used = True
    upload_id = str(uuid.uuid4())
    if looks_like_injection(extracted):
        log.warning("instruction-like text flagged in upload %s", upload_id)
    folder = config.upload_dir() / upload_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"questions{q_ext}").write_bytes(q_data)
    for i, (_, ext, data) in enumerate(answers):
        suffix = "" if len(answers) == 1 else f"_{i + 1}"
        (folder / f"answers{suffix}{ext}").write_bytes(data)

    db.create_upload(upload_id, q_name, a_name, q_ext, a_ext, text_used, extracted)
    return UploadCreated(
        upload_id=upload_id,
        files=[
            UploadedFile(role="questions", name=q_name, size_bytes=len(q_data)),
            *[UploadedFile(role="answers", name=name, size_bytes=len(data)) for name, _, data in answers],
        ],
        text_used=text_used,
        note=NOTE_TEXT,
    )
