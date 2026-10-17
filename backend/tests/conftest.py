import pytest
from fastapi.testclient import TestClient

from app import deps
from app.llm import FakeProvider
from app.main import app
from app.transcribe import FakeTranscriber


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("AUDIO_DIR", str(tmp_path / "audio"))
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("PROFESSOR_TOKEN", "test-token")
    for name in (
        "RETAIN_AUDIO",
        "RETAIN_VIDEO",
        "DEMO_MODE",
        "WP",
        "WE",
        "ANSWER_GRACE_SECONDS",
        "LOOKAWAY_THRESHOLD",
        "GAZE_TRACKING",
        "DEBUG_BORDERS",
        "MAX_UPLOAD_BYTES",
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def llm():
    return FakeProvider()


@pytest.fixture
def stt():
    return FakeTranscriber()


@pytest.fixture
def client(llm, stt):
    app.dependency_overrides[deps.get_llm] = lambda: llm
    app.dependency_overrides[deps.get_stt] = lambda: stt
    yield TestClient(app)
    app.dependency_overrides.clear()
