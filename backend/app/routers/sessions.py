"""The four session endpoints. See CLAUDE.md for the flow."""

import logging
import shutil
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile

from .. import config, db, service
from ..deps import get_llm, get_stt
from ..errors import AppError
from ..llm import LLMProvider
from ..prompts import looks_like_injection
from ..schemas import (
    MAX_ANSWER_SECONDS,
    TOTAL_QUESTIONS,
    AnswerResult,
    AppConfig,
    QuestionPublic,
    Report,
    SessionCreated,
)
from ..transcribe import (
    AudioError,
    Transcriber,
    TranscriptionError,
    convert_to_wav,
    trim_wav,
    wav_duration,
)

log = logging.getLogger("vdemo")
router = APIRouter(prefix="/api/v1", tags=["sessions"])

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
TOLERANCE_SECONDS = 0.5  # recorder overhead allowed above 40 s before trimming
HARD_LIMIT_SECONDS = 60.0  # anything longer is rejected


def _require_session(session_id: str):
    session = db.get_session(session_id)
    if session is None:
        raise AppError(404, "session_not_found", "No such session.")
    return session


def _require_question(session_id: str, n: int):
    question = db.get_question(session_id, n) if 1 <= n <= TOTAL_QUESTIONS else None
    if question is None:
        raise AppError(404, "question_not_found", f"Questions are numbered 1 to {TOTAL_QUESTIONS}.")
    return question


@router.get("/config", response_model=AppConfig, tags=["config"])
def get_config() -> AppConfig:
    """Lets the front end label canned (Simulated) output honestly in demo mode."""
    return AppConfig(demo_mode=config.demo_mode())


@router.post("/sessions", response_model=SessionCreated, status_code=201)
def create_session(llm: LLMProvider = Depends(get_llm)) -> SessionCreated:
    """Start a session from the preloaded sample assessment and write the three questions."""
    assessment = service.load_assessment()
    questions, source = service.make_questions(llm, assessment["extracted_text"])
    session_id = db.create_session(assessment["title"], questions)
    log.info("session %s created with %s questions", session_id, source)
    return SessionCreated(session_id=session_id, title=assessment["title"])


@router.get("/sessions/{session_id}/questions/{n}", response_model=QuestionPublic)
def get_question(session_id: str, n: int) -> QuestionPublic:
    """Return question n and start its timer the first time it is asked for."""
    _require_session(session_id)
    question = _require_question(session_id, n)
    db.stamp_started(session_id, n)
    return QuestionPublic(
        index=n, total=TOTAL_QUESTIONS, text=question["text"], max_seconds=MAX_ANSWER_SECONDS
    )


def _save_upload(upload: UploadFile, dest: Path) -> None:
    size = 0
    with dest.open("wb") as handle:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise AppError(413, "upload_too_large", "The recording is too large.")
            handle.write(chunk)
    if size == 0:
        raise AppError(422, "bad_audio", "The recording is empty.")


@router.post(
    "/sessions/{session_id}/questions/{n}/answer", response_model=AnswerResult, status_code=201
)
def submit_answer(
    session_id: str,
    n: int,
    audio: UploadFile = File(...),
    consent: bool = Form(False),
    video: UploadFile | None = File(None),
    stt: Transcriber = Depends(get_stt),
) -> AnswerResult:
    _require_session(session_id)
    question = _require_question(session_id, n)
    if not consent:
        raise AppError(400, "consent_required", "Recording needs the student's consent.")
    if question["started_at"] is None:
        raise AppError(409, "question_not_started", "Ask for the question before answering it.")
    if db.get_answer(session_id, n) is not None:
        raise AppError(409, "already_answered", "This question already has an answer.")

    elapsed = time.time() - question["started_at"]
    late = elapsed > MAX_ANSWER_SECONDS + config.answer_grace_seconds()

    with tempfile.TemporaryDirectory(prefix="vdemo-") as tmp:
        tmp_dir = Path(tmp)
        raw, wav = tmp_dir / "upload.bin", tmp_dir / "answer.wav"
        _save_upload(audio, raw)
        try:
            convert_to_wav(raw, wav, max_seconds=HARD_LIMIT_SECONDS + 1)
            seconds = wav_duration(wav)  # read from the file; the client's claim is ignored
            if seconds > HARD_LIMIT_SECONDS:
                raise AppError(422, "audio_too_long", "The recording is much longer than 40 seconds.")
            if seconds > MAX_ANSWER_SECONDS + TOLERANCE_SECONDS:
                trimmed = tmp_dir / "trimmed.wav"
                trim_wav(wav, trimmed, MAX_ANSWER_SECONDS)
                wav, seconds = trimmed, float(MAX_ANSWER_SECONDS)
        except AudioError as exc:
            raise AppError(422, "bad_audio", str(exc)) from exc

        transcript = ""
        if seconds >= 0.3:
            try:
                transcript = stt.transcribe(wav).text.strip()
            except TranscriptionError as exc:
                log.warning("transcription failed for %s/%s: %s", session_id, n, exc)
                raise AppError(
                    503, "transcription_unavailable", "Could not transcribe the recording. Try again."
                ) from exc

        audio_path = None
        if config.retain_audio():
            config.audio_dir().mkdir(parents=True, exist_ok=True)
            audio_path = str(config.audio_dir() / f"{session_id}_{n}.wav")
            shutil.copyfile(wav, audio_path)

        video_path = None
        if video is not None and config.env_flag("RETAIN_VIDEO"):
            config.audio_dir().mkdir(parents=True, exist_ok=True)
            video_path = str(config.audio_dir() / f"{session_id}_{n}.video")
            _save_upload(video, Path(video_path))

    flagged = looks_like_injection(transcript)
    if flagged:
        # ids only: never log what the student said
        log.warning("instruction-like speech flagged in session %s question %s", session_id, n)
    seconds = round(min(seconds, float(MAX_ANSWER_SECONDS)), 1)
    saved = db.insert_answer(session_id, n, transcript, seconds, late, audio_path, video_path, flagged)
    if not saved:
        raise AppError(409, "already_answered", "This question already has an answer.")
    return AnswerResult(transcript=transcript, seconds_used=seconds, late=late)


@router.get("/sessions/{session_id}/report", response_model=Report)
def get_report(session_id: str, llm: LLMProvider = Depends(get_llm)) -> Report:
    """Grade the three answers (one LLM call), save the scores and return the report."""
    return service.build_report(session_id, llm)
