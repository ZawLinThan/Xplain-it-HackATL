import time

from app import db

from helpers import new_session


def test_health_still_works(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_questions_one_to_three(client, llm):
    sid = new_session(client, llm)
    for n in (1, 2, 3):
        body = client.get(f"/api/v1/sessions/{sid}/questions/{n}").json()
        assert body["index"] == n and body["total"] == 3 and body["max_seconds"] == 40


def test_out_of_range_questions_rejected(client, llm):
    sid = new_session(client, llm)
    for n in (0, 4, -1):
        response = client.get(f"/api/v1/sessions/{sid}/questions/{n}")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "question_not_found"


def test_unknown_session(client):
    response = client.get("/api/v1/sessions/nope/questions/1")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "session_not_found"


def test_started_at_is_stamped_once(client, llm):
    sid = new_session(client, llm)
    assert db.get_question(sid, 1)["started_at"] is None
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    first = db.get_question(sid, 1)["started_at"]
    assert first is not None
    time.sleep(0.02)
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    assert db.get_question(sid, 1)["started_at"] == first
    assert db.get_question(sid, 2)["started_at"] is None


def test_non_numeric_question_is_an_error_shape(client, llm):
    sid = new_session(client, llm)
    response = client.get(f"/api/v1/sessions/{sid}/questions/abc")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_config_reports_demo_mode(client, monkeypatch):
    assert client.get("/api/v1/config").json()["demo_mode"] is False
    monkeypatch.setenv("DEMO_MODE", "1")
    assert client.get("/api/v1/config").json()["demo_mode"] is True
