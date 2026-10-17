from helpers import PROF, answer, answer_all, grades, new_session, professor_session

LIST = "/api/v1/professor/sessions"


def test_401_without_or_with_wrong_token(client):
    assert client.get(LIST).status_code == 401
    r = client.get(LIST, headers={"X-Professor-Token": "wrong"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_404_when_no_token_configured_outside_demo(client, monkeypatch):
    monkeypatch.delenv("PROFESSOR_TOKEN")
    assert client.get(LIST, headers=PROF).status_code == 404


def test_demo_mode_defaults_token_to_demo(client, monkeypatch):
    monkeypatch.delenv("PROFESSOR_TOKEN")
    monkeypatch.setenv("DEMO_MODE", "1")
    assert client.get(LIST, headers={"X-Professor-Token": "demo"}).status_code == 200
    assert client.get(LIST, headers={"X-Professor-Token": "nope"}).status_code == 401


def test_list_and_detail_with_flags(client, llm, stt):
    sid = new_session(client, llm)
    answer_all(client, sid, stt)
    llm.push(grades(1, 1, 0))
    client.get(f"/api/v1/sessions/{sid}/report")
    rows = client.get(LIST, headers=PROF).json()
    assert rows["lookaway_threshold"] == 4
    row = rows["sessions"][0]
    assert row["session_id"] == sid and row["completed"] and row["answered"] == 3
    assert row["final_score"] == 49.3 and row["review_flag"] is True
    assert row["lookaway_max"] == 0 and row["lookaway_max_question"] is None
    d = professor_session(client, sid)
    assert d["problem_score"] == 0.7333 and d["gap"] > 0.4 and d["review_flag"] is True
    assert [q["transcript"] for q in d["questions"]] == ["one", "two", "three"]


def test_detail_before_report_and_unknown_session(client, llm):
    sid = new_session(client, llm)
    d = professor_session(client, sid)
    assert d["final_score"] is None and d["questions"][0]["answered"] is False
    assert client.get("/api/v1/professor/sessions/nope", headers=PROF).status_code == 404


def test_no_expected_answers_in_professor_responses(client, llm, stt):
    sid = new_session(client, llm)
    answer_all(client, sid, stt)
    text = client.get(f"/api/v1/professor/sessions/{sid}", headers=PROF).text.lower()
    for leaked in ("key_ideas", "model_answer", "idea 1a", "model answer 1"):
        assert leaked not in text


def test_cors_allows_the_token_header(client):
    r = client.options(
        LIST,
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-professor-token",
        },
    )
    assert r.status_code == 200
