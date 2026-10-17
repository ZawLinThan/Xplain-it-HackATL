from fastapi import APIRouter, Depends

from .. import professor
from ..professor import require_professor
from ..schemas import ProfessorSession, ProfessorSessions

router = APIRouter(
    prefix="/api/v1/professor", tags=["professor"], dependencies=[Depends(require_professor)]
)


@router.get("/sessions", response_model=ProfessorSessions)
def list_sessions(limit: int = 50) -> ProfessorSessions:
    """Recent sessions with their flags. Needs the X-Professor-Token header."""
    return professor.list_sessions(limit)


@router.get("/sessions/{session_id}", response_model=ProfessorSession)
def get_session(session_id: str) -> ProfessorSession:
    return professor.session_detail(session_id)
