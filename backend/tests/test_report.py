from app import db
from helpers import answer, answer_all, good_questions, grades, new_session, set_started


def finished(client, llm, stt, transcripts=("one", "two", "three")):
    sid = new_session(client, llm)
    answer_all(client, sid, stt, transcripts)
    return sid


def test_worked_example_through_the_api(client, llm, stt):
    sid = finished(client, llm, stt)
    llm.push(grades(5, 3, 2, feedback="covers some ideas"))
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert report["problem_score"] == 0.7333
    assert report["explanation_score"] == 0.6667
    assert report["final_score"] == 70.7
    assert report["review_flag"] is False
    assert report["partial"] is False
    assert report["weights"] == {"problem": 0.6, "explanation": 0.4}
    assert [q["score"] for q in report["questions"]] == [5, 3, 2]
    assert report["questions"][0]["transcript"] == "one"


def test_review_flag_for_big_gap(client, llm, stt):
    sid = finished(client, llm, stt)
    llm.push(grades(1, 1, 0))
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert report["final_score"] == 49.3 and report["review_flag"] is True


def test_exactly_one_llm_call_for_grading(client, llm, stt):
    sid = finished(client, llm, stt)
    before = len(llm.calls)
    llm.push(grades(4, 4, 4))
    client.get(f"/api/v1/sessions/{sid}/report")
    assert len(llm.calls) - before == 1


def test_second_request_makes_no_llm_call(client, llm, stt):
    sid = finished(client, llm, stt)
    llm.push(grades(4, 4, 4))
    first = client.get(f"/api/v1/sessions/{sid}/report").json()
    calls = len(llm.calls)
    second = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert len(llm.calls) == calls and second == first
    assert db.get_scores(sid)["final_score"] == first["final_score"]


def test_empty_transcripts_score_zero_without_llm(client, llm, stt):
    sid = finished(client, llm, stt, transcripts=("", "  ", ""))
    calls = len(llm.calls)
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert len(llm.calls) == calls
    assert [q["score"] for q in report["questions"]] == [0, 0, 0]
    assert report["questions"][0]["feedback"] == "No speech was detected in this answer."
    assert report["explanation_score"] == 0.0 and report["partial"] is False


def test_only_spoken_answers_are_sent_to_the_llm(client, llm, stt):
    sid = finished(client, llm, stt, transcripts=("", "I have an answer", ""))
    llm.push({"grades": [{"index": 2, "score": 4, "feedback": "good"}]})
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert [q["score"] for q in report["questions"]] == [0, 4, 0]
    user = llm.calls[-1][1]
    assert 'index="2"' in user and 'index="1"' not in user


def test_late_answer_scores_zero(client, llm, stt):
    sid = new_session(client, llm)
    stt.push("late but fine", "two", "three")
    client.get(f"/api/v1/sessions/{sid}/questions/1")
    set_started(sid, 1, seconds_ago=500)
    assert answer(client, sid, 1, start=False).json()["late"] is True
    for n in (2, 3):
        answer(client, sid, n)
    llm.push({"grades": [{"index": 2, "score": 5, "feedback": "x"}, {"index": 3, "score": 5, "feedback": "x"}]})
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert report["questions"][0]["score"] == 0
    assert "time limit" in report["questions"][0]["feedback"]


def test_out_of_range_scores_are_clamped(client, llm, stt):
    sid = finished(client, llm, stt)
    llm.push(grades(9, -3, 4))
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert [q["score"] for q in report["questions"]] == [5, 0, 4]


def test_invalid_json_twice_gives_partial_then_recovers(client, llm, stt):
    sid = finished(client, llm, stt)
    llm.push("garbage", "more garbage")
    partial = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert partial["partial"] is True
    assert partial["final_score"] is None and partial["explanation_score"] is None
    assert partial["review_flag"] is None
    assert all(q["score"] is None for q in partial["questions"])
    llm.push(grades(3, 3, 3))
    full = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert full["partial"] is False and full["final_score"] is not None


def test_missing_item_in_llm_output_is_partial(client, llm, stt):
    sid = finished(client, llm, stt)
    llm.push({"grades": [{"index": 1, "score": 4, "feedback": "x"}, {"index": 2, "score": 4, "feedback": "x"}]})
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert report["partial"] is True
    assert [q["score"] for q in report["questions"]] == [4, 4, None]


def test_report_before_all_answers_is_409(client, llm, stt):
    sid = new_session(client, llm)
    answer(client, sid, 1)
    response = client.get(f"/api/v1/sessions/{sid}/report")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "not_finished"


def test_unknown_session_report(client):
    assert client.get("/api/v1/sessions/none/report").status_code == 404


def test_weights_come_from_env(client, llm, stt, monkeypatch):
    monkeypatch.setenv("WP", "1")
    monkeypatch.setenv("WE", "1")
    sid = finished(client, llm, stt)
    llm.push(grades(5, 5, 5))
    report = client.get(f"/api/v1/sessions/{sid}/report").json()
    assert report["weights"] == {"problem": 0.5, "explanation": 0.5}
    assert report["final_score"] == 86.7
