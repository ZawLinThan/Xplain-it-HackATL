"""Server-side ElevenLabs narration; credentials never reach the browser."""

import os

import httpx
from fastapi import APIRouter
from fastapi.responses import Response

from ..errors import AppError
from ..schemas import QuestionSpeechIn

router = APIRouter(prefix="/api/v1", tags=["speech"])


@router.post("/speech", response_class=Response,
             responses={200: {"content": {"audio/mpeg": {}}}})
async def question_speech(body: QuestionSpeechIn) -> Response:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise AppError(503, "speech_unavailable", "Question narration is not configured.")
    voice = os.getenv("ELEVENLABS_VOICE_ID", "kLhAstPcnnPxqzk6gS5i")
    try:
        async with httpx.AsyncClient(timeout=35) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
                params={"output_format": "mp3_44100_128"},
                headers={"xi-api-key": key, "Accept": "audio/mpeg"},
                json={"text": body.text, "model_id": os.getenv("ELEVENLABS_MODEL_ID", "eleven_v4")},
            )
            response.raise_for_status()
    except httpx.HTTPError:
        raise AppError(502, "speech_failed", "Question narration is unavailable. Please retry.") from None
    return Response(response.content, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
