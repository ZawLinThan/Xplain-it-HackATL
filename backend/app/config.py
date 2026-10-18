"""Settings read from the environment at call time, so tests can change them."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(__file__).resolve().parent / "data"


def env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes"}


def database_path() -> str:
    return os.getenv("DATABASE_PATH", str(_storage_dir() / "vdemo.db"))


def _storage_dir() -> Path:
    # Function bundles are read-only; /tmp is writable but instance-local and ephemeral.
    return Path("/tmp/vdemo") if os.getenv("VERCEL") == "1" else BACKEND_DIR


def audio_dir() -> Path:
    return Path(os.getenv("AUDIO_DIR", str(_storage_dir() / "audio")))


def retain_audio() -> bool:
    return env_flag("RETAIN_AUDIO")


def demo_mode() -> bool:
    return env_flag("DEMO_MODE")


def weights() -> tuple[float, float]:
    return env_float("WP", 0.6), env_float("WE", 0.4)


def review_threshold() -> float:
    return env_float("REVIEW_THRESHOLD", 0.40)


def answer_grace_seconds() -> float:
    """Time allowed on top of 40 s for reading the question, pressing record and uploading."""
    return env_float("ANSWER_GRACE_SECONDS", 30.0)


def session_ttl_hours() -> float:
    return env_float("SESSION_TTL_HOURS", 24.0)


def upload_dir() -> Path:
    return Path(os.getenv("UPLOAD_DIR", str(_storage_dir() / "uploads")))


def max_upload_bytes() -> int:
    return int(env_float("MAX_UPLOAD_BYTES", 2 * 1024 * 1024))


def lookaway_threshold() -> int:
    return max(1, int(env_float("LOOKAWAY_THRESHOLD", 4)))


def gaze_tracking() -> bool:
    return os.getenv("GAZE_TRACKING", "1").strip().lower() not in {"0", "false", "no"}


def debug_borders() -> bool:
    return env_flag("DEBUG_BORDERS")


def professor_token() -> str:
    """Shared token for the professor routes. Empty means the routes are off (404), except that
    DEMO_MODE=1 falls back to the token `demo`."""
    token = os.getenv("PROFESSOR_TOKEN", "").strip()
    if token:
        return token
    return "demo" if demo_mode() else ""
