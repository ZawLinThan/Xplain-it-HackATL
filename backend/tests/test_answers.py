import os
import json

from app import db
from app.transcribe import TranscriptionError
from helpers import answer, make_wav, new_session, set_started


def test_model_answers_print_only_after_read_aloud(client, llm, capsys):
    sid = new_session(client, llm)
    for n in (1, 2, 3):
        client.get(f"/api/v1/sessions/{sid}/questions/{n}")
        assert "[model-answer]" not in capsys.readouterr().out
        response = client.post(f"/api/v1/sessions/{sid}/questions/{n}/read-aloud")
        assert response.status_code == 200
        lines = [line for line in capsys.readouterr().out.splitlines()
                 if line.startswith("[model-answer] ")]
        assert len(lines) == 1
        entry = json.loads(lines[0].removeprefix("[model-answer] "))
        assert entry["question"] == n
        assert entry["model_answer"] == f"model answer {n}"
        assert "model_answer" not in response.json()
        assert answer(client, sid, n, start=False).status_code == 201
        assert "[model-answer]" not in capsys.readouterr().out


def test_normal_answer(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("I used a set because membership checks are fast.")
    response = answer(client, sid, 1, seconds=3.0)
    assert response.status_code == 201
    body = response.json()
    assert body["transcript"].startswith("I used a set")
    assert 2.9 <= body["seconds_used"] <= 3.1
    assert body["late"] is False
    saved = db.get_answer(sid, 1)
    assert saved["transcript"] == body["transcript"] and saved["score"] is None


def test_consent_is_required(client, llm):
    sid = new_session(client, llm)
    response = answer(client, sid, 1, consent=False)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "consent_required"
    assert db.get_answer(sid, 1) is None


def test_question_must_be_started_first(client, llm):
    sid = new_session(client, llm)
    response = answer(client, sid, 1, start=False)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "question_not_started"


def test_duplicate_submission_is_409(client, llm):
    sid = new_session(client, llm)
    assert answer(client, sid, 1).status_code == 201
    response = answer(client, sid, 1, start=False)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_answered"


def test_late_answer_is_marked(client, llm):
    sid = new_session(client, llm)
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    set_started(sid, 1, seconds_ago=40 + 30 + 5)
    body = answer(client, sid, 1, start=False).json()
    assert body["late"] is True


def test_answer_inside_the_grace_window_is_not_late(client, llm):
    sid = new_session(client, llm)
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    set_started(sid, 1, seconds_ago=40 + 20)
    assert answer(client, sid, 1, start=False).json()["late"] is False


def test_grace_window_is_configurable(client, llm, monkeypatch):
    monkeypatch.setenv("ANSWER_GRACE_SECONDS", "3")
    sid = new_session(client, llm)
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    set_started(sid, 1, seconds_ago=50)
    assert answer(client, sid, 1, start=False).json()["late"] is True


def test_overlong_audio_is_trimmed_to_40(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("long answer")
    body = answer(client, sid, 1, seconds=41.5).json()
    assert body["seconds_used"] == 40.0
    assert db.get_answer(sid, 1)["seconds_used"] == 40.0


def test_audio_far_over_the_limit_is_rejected(client, llm):
    sid = new_session(client, llm)
    response = answer(client, sid, 1, seconds=75)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "audio_too_long"
    assert db.get_answer(sid, 1) is None


def test_forged_duration_is_ignored(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("hello")
    response = answer(client, sid, 1, seconds=2.0, extra={"seconds_used": "1", "duration": "1"})
    assert 1.9 <= response.json()["seconds_used"] <= 2.1


def test_empty_audio_is_stored_with_empty_transcript(client, llm, stt):
    sid = new_session(client, llm)
    response = answer(client, sid, 1, seconds=0.1)
    assert response.status_code == 201
    assert response.json()["transcript"] == ""
    assert stt.calls == 0


def test_not_audio_is_rejected(client, llm):
    sid = new_session(client, llm)
    response = answer(client, sid, 1, wav=b"this is not audio at all")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "bad_audio"


def test_provider_failure_can_be_retried(client, llm, stt):
    sid = new_session(client, llm)
    stt.push(TranscriptionError("HTTP 429"), "second try works")
    first = answer(client, sid, 1)
    assert first.status_code == 503
    assert first.json()["error"]["code"] == "transcription_unavailable"
    assert db.get_answer(sid, 1) is None
    second = answer(client, sid, 1, start=False)
    assert second.status_code == 201 and second.json()["transcript"] == "second try works"


def test_audio_is_deleted_after_transcription(client, llm, tmp_path):
    sid = new_session(client, llm)
    assert answer(client, sid, 1).status_code == 201
    audio_dir = tmp_path / "audio"
    assert not audio_dir.exists() or not os.listdir(audio_dir)
    assert db.get_answer(sid, 1)["audio_path"] is None


def test_audio_is_kept_only_when_asked(client, llm, tmp_path, monkeypatch):
    monkeypatch.setenv("RETAIN_AUDIO", "1")
    sid = new_session(client, llm)
    assert answer(client, sid, 1).status_code == 201
    kept = db.get_answer(sid, 1)["audio_path"]
    assert kept and os.path.exists(kept)


def test_video_is_discarded_by_default(client, llm, tmp_path):
    sid = new_session(client, llm)
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    files = {
        "audio": ("a.wav", make_wav(1.0), "audio/wav"),
        "video": ("v.webm", b"fake video bytes", "video/webm"),
    }
    response = client.post(
        f"/api/v1/sessions/{sid}/questions/1/answer", data={"consent": "true"}, files=files
    )
    assert response.status_code == 201
    assert db.get_answer(sid, 1)["video_path"] is None


def test_unknown_question_or_session(client, llm):
    sid = new_session(client, llm)
    assert answer(client, sid, 4, start=False).status_code == 404
    assert answer(client, "missing", 1, start=False).status_code == 404
