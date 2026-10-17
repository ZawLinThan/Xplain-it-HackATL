"""Run the full pipeline offline for the two canned students and print their scores.

Run from backend/:  python scripts/seed_demo.py
Uses DEMO_MODE=1 (canned LLM output and transcripts) and a throwaway database.
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

os.environ["DEMO_MODE"] = "1"
os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.mkdtemp()) / "demo.db"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from helpers import make_wav  # noqa: E402


def run(student: str) -> dict:
    os.environ["DEMO_STUDENT"] = student
    client = TestClient(app)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    for n in (1, 2, 3):
        client.get(f"/api/v1/sessions/{sid}/questions/{n}")
        files = {"audio": ("a.wav", make_wav(2.0), "audio/wav")}
        client.post(f"/api/v1/sessions/{sid}/questions/{n}/answer", data={"consent": "true"}, files=files)
    return client.get(f"/api/v1/sessions/{sid}/report").json()


if __name__ == "__main__":
    for student in ("strong", "weak"):
        r = run(student)
        scores = [q["score"] for q in r["questions"]]
        print(
            f"{student:6} P={r['problem_score']:.3f} E={r['explanation_score']:.3f} "
            f"final={r['final_score']} review_flag={r['review_flag']} question scores={scores}"
        )
