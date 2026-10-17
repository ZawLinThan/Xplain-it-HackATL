from fastapi import APIRouter, File, UploadFile

from .. import uploads
from ..schemas import UploadCreated

router = APIRouter(prefix="/api/v1", tags=["uploads"])


@router.post("/uploads", response_model=UploadCreated, status_code=201)
def create_upload(
    questions_file: UploadFile = File(...), answers_file: UploadFile = File(...)
) -> UploadCreated:
    """Store the assessment questions file and the student's answers file."""
    return uploads.store_uploads(questions_file, answers_file)
