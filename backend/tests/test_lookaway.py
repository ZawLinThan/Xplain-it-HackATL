import json

from app import scoring
from helpers import PROF, answer, answer_all, good_questions, grades, new_session, professor_session


def events(n):
    return [{"t_ms": 1000 * (i + 1), "side": "left"} for i in range(n)]


def send(client, sid, n, tracked=True, count=0, raw=None):
    payload = raw if raw is not None else json.dumps({"tracked": tracked, "events": events(count)})
    return answer(client, sid, n, extra={"lookaway": payload})


def test_flag_rule():
    assert not scoring.lookaway_flag(3, 4)
    assert scoring.lookaway_flag(4, 4)
    assert scoring.session_flagged([0, 3, 4], 4)
    assert not scoring.session_flagged([0, 3, 1], 4)


def test_three_events_no_flag_four_flag(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("a", "b", "c")
    assert send(client, sid, 1, count=3).status_code == 201
    assert send(client, sid, 2, count=4).status_code == 201
    d = professor_session(client, sid)
    first, second = d["questions"][0]["lookaway"], d["questions"][1]["lookaway"]
    assert (first["count"], first["flagged"]) == (3, False)
    assert (second["count"], second["flagged"]) == (4, True)
    assert d["lookaway_flagged"] is True


def test_threshold_is_configurable(client, llm, stt, monkeypatch):
    monkeypatch.setenv("LOOKAWAY_THRESHOLD", "2")
    sid = new_session(client, llm)
    stt.push("a")
    send(client, sid, 1, count=2)
    assert professor_session(client, sid)["questions"][0]["lookaway"]["flagged"] is True


def test_not_tracked_is_not_flagged_and_not_zero(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("a", "b")
    assert answer(client, sid, 1).status_code == 201  # no field at all
    assert send(client, sid, 2, tracked=False, count=0).status_code == 201
    d = professor_session(client, sid)
    for q in d["questions"][:2]:
        assert q["lookaway"] == {"tracked": False, "count": 0, "flagged": False, "events": []}
    rows = client.get("/api/v1/professor/sessions", headers=PROF).json()["sessions"]
    assert rows[0]["lookaway_tracked_all"] is False and rows[0]["lookaway_flagged"] is False


def test_invalid_data_never_fails_the_answer(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("a", "b", "c")
    assert send(client, sid, 1, raw="not json").status_code == 201
    assert send(client, sid, 2, raw=json.dumps({"tracked": True, "events": [{"t_ms": -5, "side": "up"}]})).status_code == 201
    big = json.dumps({"tracked": True, "events": events(201)})
    assert send(client, sid, 3, raw=big).status_code == 201
    assert all(not q["lookaway"]["tracked"] for q in professor_session(client, sid)["questions"])


def test_gaze_tracking_off_ignores_events(client, llm, stt, monkeypatch):
    monkeypatch.setenv("GAZE_TRACKING", "0")
    sid = new_session(client, llm)
    stt.push("a")
    send(client, sid, 1, count=9)
    assert professor_session(client, sid)["questions"][0]["lookaway"]["tracked"] is False


def test_students_never_see_look_away_or_review(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("a", "b", "c")
    texts = []
    for n in (1, 2, 3):
        r = send(client, sid, n, count=9)
        texts.append(r.text)
    llm.push(grades(1, 1, 0))
    texts.append(client.get(f"/api/v1/sessions/{sid}/report").text)
    joined = " ".join(texts).lower()
    assert "lookaway" not in joined and "look_away" not in joined and "review" not in joined
    assert "flag" not in joined


def test_score_identical_with_0_and_50_events(client, llm, stt):
    finals = []
    for count in (0, 50):
        sid = new_session(client, llm)
        stt.push("a", "b", "c")
        for n in (1, 2, 3):
            send(client, sid, n, count=count if count <= 200 else 0)
        llm.push(grades(5, 3, 2))
        finals.append(client.get(f"/api/v1/sessions/{sid}/report").json()["final_score"])
    assert finals[0] == finals[1] == 70.7


def test_config_has_dev_toggles(client, monkeypatch):
    c = client.get("/api/v1/config").json()
    assert c == {"demo_mode": False, "gaze_tracking": True, "debug_borders": False}
    monkeypatch.setenv("DEBUG_BORDERS", "1")
    monkeypatch.setenv("GAZE_TRACKING", "0")
    c = client.get("/api/v1/config").json()
    assert c["debug_borders"] is True and c["gaze_tracking"] is False
