"""Shared test helpers."""

import io
import math
import struct
import wave

from app import db


def make_wav(seconds: float, rate: int = 8000, freq: int = 440, silent: bool = False) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = int(seconds * rate)
        amp = 0 if silent else 8000
        w.writeframes(
            b"".join(
                struct.pack("<h", int(amp * math.sin(2 * math.pi * freq * i / rate)))
                for i in range(frames)
            )
        )
    return buf.getvalue()


def good_questions() -> dict:
    kinds = ["why", "trace", "change"]
    return {
        "questions": [
            {
                "type": kinds[i],
                "text": f"Generated question number {i + 1}: explain this part of your code.",
                "expected": {
                    "key_ideas": [f"idea {i + 1}a", f"idea {i + 1}b"],
                    "model_answer": f"model answer {i + 1}",
                },
            }
            for i in range(3)
        ]
    }


def grades(*scores, feedback="ok") -> dict:
    return {
        "grades": [
            {"index": i + 1, "score": s, "feedback": feedback} for i, s in enumerate(scores)
        ]
    }


def new_session(client, llm, questions: dict | None = None) -> str:
    llm.push(questions or good_questions())
    response = client.post("/api/v1/sessions")
    assert response.status_code == 201, response.text
    return response.json()["session_id"]


def answer(client, session_id, n, seconds=2.0, consent=True, start=True, extra=None, wav=None):
    """Ask for question n (starts its timer), then upload a spoken answer."""
    if start:
        assert client.get(f"/api/v1/sessions/{session_id}/questions/{n}").status_code == 200
    data = {"consent": "true" if consent else "false", **(extra or {})}
    files = {"audio": ("answer.wav", wav if wav is not None else make_wav(seconds), "audio/wav")}
    return client.post(f"/api/v1/sessions/{session_id}/questions/{n}/answer", data=data, files=files)


def answer_all(client, session_id, stt, transcripts=("one", "two", "three")):
    stt.push(*transcripts)
    for n in (1, 2, 3):
        assert answer(client, session_id, n).status_code == 201


def set_started(session_id: str, n: int, seconds_ago: float) -> None:
    import time

    with db.connect() as conn:
        conn.execute(
            "UPDATE questions SET started_at = ? WHERE session_id = ? AND idx = ?",
            (time.time() - seconds_ago, session_id, n),
        )
