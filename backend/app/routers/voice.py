from fastapi import APIRouter, Body, Query
from starlette.concurrency import run_in_threadpool

from .. import db, voice
from ..errors import AppError
from ..schemas import VoiceEnrollment, VoiceCheckResult, VoiceStatus

router = APIRouter(prefix='/api/v1', tags=['voice verification'])


@router.get('/voice/status', response_model=VoiceStatus)
def status():
    return {'available': voice.engine.available}


@router.post('/voice/enroll', response_model=VoiceEnrollment)
async def enroll(consent: bool = Query(False), pcm: bytes = Body(media_type='application/octet-stream', max_length=640000)):
    if not consent:
        raise AppError(422, 'voice_consent_required', 'Explicit voice verification consent is required.')
    if len(pcm) < 160000 or len(pcm) % 2:
        raise AppError(422, 'voice_audio_invalid', 'Supply at least 5 seconds of 16 kHz mono PCM16 audio.')
    return await run_in_threadpool(voice.enroll, pcm)


@router.post('/sessions/{session_id}/questions/{n}/voice-check', response_model=VoiceCheckResult)
async def check(session_id: str, n: int, sequence: int = Query(ge=0), pcm: bytes = Body(media_type='application/octet-stream', max_length=128000)):
    if not db.get_session(session_id) or not db.get_question(session_id, n):
        raise AppError(404, 'session_not_found', 'No such session/question.')
    if n in db.list_answers(session_id):
        raise AppError(409, 'voice_answer_finished', 'This answer has already finished.')
    if not pcm or len(pcm) % 2:
        raise AppError(422, 'voice_audio_invalid', 'Supply 16 kHz mono PCM16 audio.')
    return await run_in_threadpool(voice.verify, session_id, n, pcm, sequence)
