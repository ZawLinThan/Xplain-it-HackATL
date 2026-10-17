"""SQLite storage (stdlib sqlite3). Parameterized queries only; no student names are stored."""

import json
import sqlite3
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    key_ideas TEXT NOT NULL,
    model_answer TEXT NOT NULL,
    started_at REAL,
    UNIQUE(session_id, idx)
);
CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_idx INTEGER NOT NULL,
    transcript TEXT NOT NULL,
    seconds_used REAL NOT NULL,
    late INTEGER NOT NULL DEFAULT 0,
    audio_path TEXT,
    video_path TEXT,
    score INTEGER,
    feedback TEXT,
    flagged INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    UNIQUE(session_id, question_idx)
);
CREATE TABLE IF NOT EXISTS scores (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    problem_score REAL NOT NULL,
    explanation_score REAL,
    final_score REAL,
    review_flag INTEGER,
    partial INTEGER NOT NULL,
    weight_problem REAL NOT NULL,
    weight_explanation REAL NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at REAL NOT NULL
);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = Path(config.database_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connect():
        pass


# ------------------------------------------------------------------ sessions


def create_session(title: str, questions: list[dict]) -> str:
    session_id = str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)",
            (session_id, title, time.time()),
        )
        for idx, q in enumerate(questions, start=1):
            conn.execute(
                "INSERT INTO questions (session_id, idx, type, text, key_ideas, model_answer)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (
                    session_id,
                    idx,
                    q["type"],
                    q["text"],
                    json.dumps(q["key_ideas"]),
                    q["model_answer"],
                ),
            )
    return session_id


def get_session(session_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()


# ----------------------------------------------------------------- questions


def get_question(session_id: str, idx: int) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM questions WHERE session_id = ? AND idx = ?", (session_id, idx)
        ).fetchone()


def list_questions(session_id: str) -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM questions WHERE session_id = ? ORDER BY idx", (session_id,)
        ).fetchall()


def stamp_started(session_id: str, idx: int) -> None:
    """Record when the question was first shown. Only the first call counts."""
    with connect() as conn:
        conn.execute(
            "UPDATE questions SET started_at = ? "
            "WHERE session_id = ? AND idx = ? AND started_at IS NULL",
            (time.time(), session_id, idx),
        )


# ------------------------------------------------------------------- answers


def get_answer(session_id: str, idx: int) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM answers WHERE session_id = ? AND question_idx = ?", (session_id, idx)
        ).fetchone()


def list_answers(session_id: str) -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM answers WHERE session_id = ? ORDER BY question_idx", (session_id,)
        ).fetchall()


def insert_answer(
    session_id: str,
    idx: int,
    transcript: str,
    seconds_used: float,
    late: bool,
    audio_path: str | None,
    video_path: str | None,
    flagged: bool,
) -> bool:
    """Insert one answer. Returns False if the question already has an answer."""
    with connect() as conn:
        try:
            conn.execute(
                "INSERT INTO answers (session_id, question_idx, transcript, seconds_used, late,"
                " audio_path, video_path, flagged, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    session_id,
                    idx,
                    transcript,
                    seconds_used,
                    int(late),
                    audio_path,
                    video_path,
                    int(flagged),
                    time.time(),
                ),
            )
        except sqlite3.IntegrityError:
            return False
    return True


def set_grade(session_id: str, idx: int, score: int, feedback: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE answers SET score = ?, feedback = ? WHERE session_id = ? AND question_idx = ?",
            (score, feedback, session_id, idx),
        )


# -------------------------------------------------------------------- scores


def get_scores(session_id: str) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM scores WHERE session_id = ?", (session_id,)).fetchone()


def save_scores(
    session_id: str,
    problem_score: float,
    explanation_score: float | None,
    final_score: float | None,
    review_flag: bool | None,
    partial: bool,
    weight_problem: float,
    weight_explanation: float,
) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO scores (session_id, problem_score, explanation_score,"
            " final_score, review_flag, partial, weight_problem, weight_explanation, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                session_id,
                problem_score,
                explanation_score,
                final_score,
                None if review_flag is None else int(review_flag),
                int(partial),
                weight_problem,
                weight_explanation,
                time.time(),
            ),
        )


# ----------------------------------------------------------------- llm cache


def cache_get(key: str) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT value FROM llm_cache WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def cache_put(key: str, value: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO llm_cache (key, value, created_at) VALUES (?, ?, ?)",
            (key, value, time.time()),
        )


# ------------------------------------------------------------------- cleanup


def purge_old_sessions(max_age_hours: float) -> list[str]:
    """Delete sessions older than the limit (answers, scores and questions go with them).

    Returns the audio and video paths that were stored so the caller can delete the files.
    """
    cutoff = time.time() - max_age_hours * 3600
    with connect() as conn:
        ids = [
            r["id"]
            for r in conn.execute("SELECT id FROM sessions WHERE created_at < ?", (cutoff,))
        ]
        paths: list[str] = []
        for session_id in ids:
            for r in conn.execute(
                "SELECT audio_path, video_path FROM answers WHERE session_id = ?", (session_id,)
            ):
                paths.extend(p for p in (r["audio_path"], r["video_path"]) if p)
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    return paths
