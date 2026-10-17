"""Speech to text behind a small interface, plus audio helpers built on ffmpeg.

Choose a provider with STT_PROVIDER: groq, local, fake, demo or none.
Transcripts are never logged.
"""

import os
import re
import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import httpx

from . import config

GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
STT_MODEL = "whisper-large-v3-turbo"


class TranscriptionError(Exception):
    """Transcription failed (provider down, rate limited, or not configured)."""


class AudioError(Exception):
    """The uploaded file is not usable audio."""


@dataclass
class Transcript:
    text: str


class Transcriber(ABC):
    @abstractmethod
    def transcribe(self, path: Path) -> Transcript:
        """Return the spoken text of a short audio file (16 kHz mono wav)."""


class NoTranscriber(Transcriber):
    def transcribe(self, path: Path) -> Transcript:
        raise TranscriptionError("no speech-to-text provider configured (set GROQ_API_KEY)")


class GroqWhisperTranscriber(Transcriber):
    def __init__(self, api_key: str, backoff_seconds: float = 2.0):
        self.api_key = api_key
        self.backoff_seconds = backoff_seconds

    def transcribe(self, path: Path) -> Transcript:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        data = {
            "model": os.getenv("STT_MODEL", STT_MODEL),
            "language": "en",
            "response_format": "json",
            "temperature": "0",
        }
        for attempt in range(2):  # a single retry on HTTP 429
            try:
                with path.open("rb") as handle:
                    response = httpx.post(
                        GROQ_STT_URL,
                        headers=headers,
                        data=data,
                        files={"file": (path.name, handle, "audio/wav")},
                        timeout=60.0,
                    )
            except httpx.HTTPError as exc:
                raise TranscriptionError(f"STT request failed: {type(exc).__name__}") from exc
            if response.status_code == 429 and attempt == 0:
                time.sleep(self.backoff_seconds)
                continue
            if response.status_code != 200:
                raise TranscriptionError(f"STT returned HTTP {response.status_code}")
            try:
                return Transcript(text=str(response.json().get("text", "")).strip())
            except ValueError as exc:
                raise TranscriptionError("unexpected STT response") from exc
        raise TranscriptionError("STT rate limit (HTTP 429)")


class LocalWhisperTranscriber(Transcriber):
    """faster-whisper on this machine. Install it with: pip install faster-whisper"""

    def __init__(self) -> None:
        self._model = None

    def transcribe(self, path: Path) -> Transcript:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise TranscriptionError("faster-whisper is not installed") from exc
        if self._model is None:
            self._model = WhisperModel(os.getenv("WHISPER_MODEL", "base.en"), compute_type="int8")
        segments, _ = self._model.transcribe(str(path), language="en")
        return Transcript(text=" ".join(s.text.strip() for s in segments).strip())


class FakeTranscriber(Transcriber):
    """Test double. Queue strings or exceptions; falls back to `default` when the queue is empty."""

    def __init__(self, *responses: object, default: str = "this is a fake transcript"):
        self.queue: list[object] = list(responses)
        self.default = default
        self.calls = 0

    def push(self, *responses: object) -> None:
        self.queue.extend(responses)

    def transcribe(self, path: Path) -> Transcript:
        self.calls += 1
        item = self.queue.pop(0) if self.queue else self.default
        if isinstance(item, Exception):
            raise item
        return Transcript(text=str(item))


def get_transcriber() -> Transcriber:
    choice = os.getenv("STT_PROVIDER", "").strip().lower()
    key = os.getenv("GROQ_API_KEY", "").strip()
    if config.demo_mode():
        choice = "demo"
    if not choice:
        choice = "groq" if key else "none"
    if choice == "groq":
        return GroqWhisperTranscriber(key) if key else NoTranscriber()
    if choice == "local":
        return LocalWhisperTranscriber()
    if choice == "demo":
        from .demo import DemoTranscriber

        return DemoTranscriber()
    if choice == "fake":
        return FakeTranscriber()
    return NoTranscriber()


# ------------------------------------------------------------- audio helpers


def convert_to_wav(src: Path, dest: Path, max_seconds: float = 61.0) -> None:
    """Convert any browser recording to 16 kHz mono wav, reading at most `max_seconds`."""
    cmd = [
        "ffmpeg", "-y", "-v", "error", "-i", str(src), "-vn", "-t", str(max_seconds),
        "-ac", "1", "-ar", "16000", str(dest),
    ]  # fmt: skip
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AudioError("could not run ffmpeg") from exc
    if result.returncode != 0 or not dest.exists():
        raise AudioError("the upload is not readable audio")


def trim_wav(src: Path, dest: Path, seconds: float) -> None:
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-t", str(seconds), str(dest)]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode != 0:
        raise AudioError("could not trim audio")


def wav_duration(path: Path) -> float:
    """Real duration of a wav file in seconds, read from the file and not from the client."""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path),
    ]  # fmt: skip
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout.strip()
        return float(out)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        pass
    # fall back to decoding and reading the last timestamp
    try:
        err = subprocess.run(
            ["ffmpeg", "-i", str(path), "-f", "null", "-"], capture_output=True, text=True, timeout=60
        ).stderr
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AudioError("could not measure audio length") from exc
    times = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", err)
    if not times:
        raise AudioError("could not measure audio length")
    h, m, s = times[-1]
    return int(h) * 3600 + int(m) * 60 + float(s)
