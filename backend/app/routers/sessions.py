"""The four session endpoints. See CLAUDE.md for the flow."""

import json
import logging
import shutil
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile

from .. import config, db, service, voice
from ..deps import get_llm, get_stt
from ..errors import AppError
from ..llm import LLMProvider
from ..prompts import looks_like_injection
from ..schemas import (
    MAX_ANSWER_SECONDS,
    TOTAL_QUESTIONS,
    AnswerResult,
    AppConfig,
    LookawayIn,
    QuestionPublic,
    Report,
    SessionCreated,
    SessionStart,
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
    return AppConfig(
        demo_mode=config.demo_mode(),
        gaze_tracking=config.gaze_tracking(),
        debug_borders=config.debug_borders(),
    )


@router.post("/sessions", response_model=SessionCreated, status_code=201)
def create_session(
    body: SessionStart | None = None, llm: LLMProvider = Depends(get_llm)
) -> SessionCreated:
    """Start a session and write the three questions.

    Uses the preloaded sample assessment, or the student's uploaded file content when an
    `upload_id` is given. The problem score P is always the preset
    one in this demo: no code is run.
    """
    used_upload = bool(body is not None and body.upload_id)
    if used_upload:
        upload = db.get_upload(body.upload_id)
        if upload is None:
            raise AppError(404, "upload_not_found", "No such upload.")
        if not upload["text_used"] or not upload["extracted_text"].strip():
            raise AppError(422, "upload_requires_text", "Please upload your files again so their content can be read.")
        title, text = "Your uploaded assessment", upload["extracted_text"]
    else:
        assessment = service.load_assessment()
        title, text = assessment["title"], assessment["extracted_text"]
    if body and body.voice_enrollment_id:
        voice.reference(body.voice_enrollment_id)
    questions, source = service.make_questions(llm, text, allow_fallback=not used_upload)
    session_id = db.create_session(title, questions)
    voice.bind(session_id, body.voice_enrollment_id if body else None)
    log.info("session %s created with %s questions", session_id, source)
    return SessionCreated(session_id=session_id, title=title, used_upload=used_upload)


@router.get("/sessions/{session_id}/questions/{n}", response_model=QuestionPublic)
def get_question(session_id: str, n: int) -> QuestionPublic:
    """Return question n and start its timer the first time it is asked for."""
    _require_session(session_id)
    question = _require_question(session_id, n)
    db.stamp_started(session_id, n)
    return QuestionPublic(
        index=n, total=TOTAL_QUESTIONS, text=question["text"], max_seconds=MAX_ANSWER_SECONDS
    )


@router.post("/sessions/{session_id}/questions/{n}/read-aloud", status_code=200)
def question_read_aloud(session_id: str, n: int) -> dict[str, bool]:
    """Log the expected answer after the browser reports completed question playback."""
    _require_session(session_id)
    question = _require_question(session_id, n)
    if question["started_at"] is None:
        raise AppError(409, "question_not_started", "Ask for the question before reading it aloud.")
    print("[model-answer] " + json.dumps({
        "session_id": session_id,
        "question": n,
        "text": question["text"],
        "model_answer": question["model_answer"],
    }), flush=True)
    return {"ok": True}


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


def _save_lookaway(session_id: str, n: int, raw: str | None) -> None:
    """Store the browser's look-away events. Never fails the answer: tracking is optional.

    Only counts and times are accepted. Bad or missing data is stored as not tracked.
    """
    tracked, events, duration_log = False, [], []
    if raw:
        try:
            parsed = LookawayIn.model_validate_json(raw)
            tracked, events = parsed.tracked, [e.model_dump() for e in parsed.events]
            duration_log = [e.model_dump() for e in parsed.duration_log]
        except ValueError:
            log.warning("ignored malformed look-away data for %s/%s", session_id, n)
    if not config.gaze_tracking():
        tracked, events, duration_log = False, [], []
    db.save_lookaway(session_id, n, tracked, events, duration_log)
    print("[look-away] Saved for professor: " + json.dumps({
        "session_id": session_id, "question": n, "tracked": tracked,
        "count": len(events) if tracked else 0,
        "events": events if tracked else [], "duration_log": duration_log if tracked else [],
    }), flush=True)


@router.post(
    "/sessions/{session_id}/questions/{n}/answer", response_model=AnswerResult, status_code=201
)
def submit_answer(
    session_id: str,
    n: int,
    audio: UploadFile = File(...),
    consent: bool = Form(False),
    video: UploadFile | None = File(None),
    lookaway: str | None = Form(None),
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
    _save_lookaway(session_id, n, lookaway)
    return AnswerResult(transcript=transcript, seconds_used=seconds, late=late)


@router.get("/sessions/{session_id}/report", response_model=Report)
def get_report(session_id: str, llm: LLMProvider = Depends(get_llm)) -> Report:
    """Grade the three answers (one LLM call), save the scores and return the report."""
    result = service.build_report(session_id, llm)
    if len(db.list_answers(session_id)) >= TOTAL_QUESTIONS:
        voice.forget(session_id)
    return result
