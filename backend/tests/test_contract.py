import json
from pathlib import Path

from app import config
from app.main import app
from app.schemas import AnswerResult, QuestionPublic, Report, SessionCreated

STUB = config.DATA_DIR / "stub"
ROOT = Path(__file__).resolve().parents[2]


def test_stub_fixtures_validate_against_models():
    SessionCreated.model_validate_json((STUB / "session_created.json").read_text())
    QuestionPublic.model_validate_json((STUB / "question.json").read_text())
    AnswerResult.model_validate_json((STUB / "answer_result.json").read_text())
    for name in ("report", "report_weak", "report_partial"):
        Report.model_validate_json((STUB / f"{name}.json").read_text())


def test_nothing_secret_in_stubs_or_openapi():
    text = " ".join(p.read_text() for p in STUB.glob("*.json")) + json.dumps(app.openapi())
    for word in ("key_ideas", "model_answer", "expected"):
        assert word not in text


def test_committed_openapi_is_current():
    committed = json.loads((ROOT / "docs" / "openapi.json").read_text())
    assert committed == json.loads(json.dumps(app.openapi())), "run: make gen-openapi"


def test_error_shape_for_unknown_route(client):
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    assert set(response.json()) == {"error"}
    assert set(response.json()["error"]) == {"code", "message"}
