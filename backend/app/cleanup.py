"""Delete sessions (and any kept recordings) older than SESSION_TTL_HOURS.

Run from backend/:  python -m app.cleanup
"""

import os

from . import config, db


def purge() -> tuple[int, int]:
    """Return (sessions deleted, files deleted)."""
    before = _count()
    paths = db.purge_old_sessions(config.session_ttl_hours())
    removed = 0
    for path in paths:
        try:
            os.remove(path)
            removed += 1
        except OSError:
            pass
    return before - _count(), removed


def _count() -> int:
    with db.connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]


if __name__ == "__main__":
    sessions, files = purge()
    print(f"deleted {sessions} session(s) and {files} file(s)")
