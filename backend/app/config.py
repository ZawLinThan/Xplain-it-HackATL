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
    return os.getenv("DATABASE_PATH", str(BACKEND_DIR / "vdemo.db"))


def audio_dir() -> Path:
    return Path(os.getenv("AUDIO_DIR", str(BACKEND_DIR / "audio")))


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
