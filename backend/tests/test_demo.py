import pytest
from fastapi.testclient import TestClient

from app import deps
from app.main import app
from helpers import answer


@pytest.fixture
def demo_client(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "1")
    deps.get_llm.cache_clear()
    deps.get_stt.cache_clear()
    yield TestClient(app)
    deps.get_llm.cache_clear()
    deps.get_stt.cache_clear()


def run(client, student, monkeypatch):
    monkeypatch.setenv("DEMO_STUDENT", student)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    for n in (1, 2, 3):
        assert answer(client, sid, n).status_code == 201
    return client.get(f"/api/v1/sessions/{sid}/report").json()


def test_strong_student(demo_client, monkeypatch):
    report = run(demo_client, "strong", monkeypatch)
    assert report["final_score"] == 81.3 and report["review_flag"] is False


def test_weak_student_triggers_review_flag(demo_client, monkeypatch):
    report = run(demo_client, "weak", monkeypatch)
    assert report["final_score"] == 49.3 and report["review_flag"] is True
    assert [q["score"] for q in report["questions"]] == [1, 1, 0]


def test_demo_needs_no_keys(demo_client, monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert demo_client.post("/api/v1/sessions").status_code == 201
