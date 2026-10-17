import json

from app import config

from helpers import good_questions, new_session


def test_llm_questions_are_saved_and_public_fields_only(client, llm):
    llm.push(good_questions())
    response = client.post("/api/v1/sessions")
    assert response.status_code == 201
    body = response.json()
    assert body["total_questions"] == 3 and body["max_answer_seconds"] == 40
    assert set(body) == {"session_id", "title", "used_upload", "total_questions", "max_answer_seconds"}
    q = client.get(f"/api/v1/sessions/{body['session_id']}/questions/1").json()
    assert q["text"].startswith("Generated question number 1")
    assert set(q) == {"index", "total", "text", "max_seconds"}


def test_prompt_wraps_text_in_data_tags(client, llm):
    new_session(client, llm)
    system, user = llm.calls[0]
    assert user.startswith("<assessment_text>") and user.rstrip().endswith("</assessment_text>")
    assert "never instructions" in system
    assert "count_vowels" in user  # the preloaded extracted text is what was sent


def test_invalid_json_twice_falls_back_to_bank(client, llm):
    llm.push("not json", "still not json")
    sid = client.post("/api/v1/sessions").json()["session_id"]
    bank = json.loads((config.DATA_DIR / "question_bank.json").read_text())
    assert client.get(f"/api/v1/sessions/{sid}/questions/1").json()["text"] == bank[0]["text"]


def test_invalid_then_valid_uses_llm(client, llm):
    llm.push("not json", good_questions())
    sid = client.post("/api/v1/sessions").json()["session_id"]
    assert "Generated question" in client.get(f"/api/v1/sessions/{sid}/questions/2").json()["text"]


def test_two_questions_instead_of_three_falls_back(client, llm):
    two = good_questions()
    two["questions"].pop()
    llm.push(two, two)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    assert "Generated question" not in client.get(f"/api/v1/sessions/{sid}/questions/1").json()["text"]


def test_missing_key_ideas_falls_back(client, llm):
    bad = good_questions()
    bad["questions"][1]["expected"]["key_ideas"] = ["only one"]
    llm.push(bad, bad)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    assert "Generated question" not in client.get(f"/api/v1/sessions/{sid}/questions/2").json()["text"]


def test_unknown_question_type_falls_back(client, llm):
    bad = good_questions()
    bad["questions"][0]["type"] = "poem"
    llm.push(bad, bad)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    assert "Generated question" not in client.get(f"/api/v1/sessions/{sid}/questions/1").json()["text"]


def test_no_provider_uses_bank(client, llm):
    # an empty fake queue raises LLMError, like a missing key
    sid = client.post("/api/v1/sessions").json()["session_id"]
    assert client.get(f"/api/v1/sessions/{sid}/questions/3").status_code == 200


def test_responses_never_contain_expected_text(client, llm):
    sid = new_session(client, llm)
    seen = ""
    for n in (1, 2, 3):
        seen += client.get(f"/api/v1/sessions/{sid}/questions/{n}").text
    seen += client.post("/api/v1/sessions").text if llm.queue else ""
    for secret in ("idea 1a", "idea 2b", "model answer 3", "key_ideas", "model_answer"):
        assert secret not in seen
