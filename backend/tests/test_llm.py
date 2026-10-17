import httpx
import pytest
from pydantic import BaseModel

from app import llm as llm_module
from app.llm import CachedProvider, FakeProvider, GroqProvider, LLMError


class Out(BaseModel):
    n: int


def test_valid_json():
    assert FakeProvider({"n": 1}).complete_json("s", "u", Out).n == 1


def test_fenced_json_is_accepted():
    assert FakeProvider('```json\n{"n": 4}\n```').complete_json("s", "u", Out).n == 4


def test_invalid_then_valid_retries_once():
    p = FakeProvider("not json", {"n": 2})
    assert p.complete_json("s", "u", Out).n == 2
    assert len(p.calls) == 2


def test_invalid_twice_raises():
    p = FakeProvider("nope", {"wrong": "shape"})
    with pytest.raises(LLMError):
        p.complete_json("s", "u", Out)


def test_cache_hit_skips_provider():
    inner = FakeProvider({"n": 7})
    cached = CachedProvider(inner)
    assert cached.complete_json("s", "u", Out).n == 7
    assert cached.complete_json("s", "u", Out).n == 7
    assert len(inner.calls) == 1


def test_cache_key_depends_on_prompt():
    inner = FakeProvider({"n": 1}, {"n": 2})
    cached = CachedProvider(inner)
    assert cached.complete_json("s", "a", Out).n == 1
    assert cached.complete_json("s", "b", Out).n == 2


class _Resp:
    def __init__(self, status, body=None, headers=None):
        self.status_code = status
        self._body = body or {}
        self.headers = headers or {}

    def json(self):
        return self._body


def _ok(content):
    return _Resp(200, {"choices": [{"message": {"content": content}}]})


def test_groq_retries_once_on_429(monkeypatch):
    monkeypatch.setattr(llm_module.time, "sleep", lambda _: None)
    responses = [_Resp(429, headers={"retry-after": "0"}), _ok('{"n": 5}')]
    monkeypatch.setattr(httpx, "post", lambda *a, **k: responses.pop(0))
    assert GroqProvider("key", backoff_seconds=0).complete_json("s", "u", Out).n == 5


def test_groq_gives_up_after_repeated_429(monkeypatch):
    monkeypatch.setattr(llm_module.time, "sleep", lambda _: None)
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _Resp(429, headers={"retry-after": "0"}))
    with pytest.raises(LLMError):
        GroqProvider("key", backoff_seconds=0).complete_json("s", "u", Out)


def test_groq_http_error_is_llm_error(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _Resp(500))
    with pytest.raises(LLMError):
        GroqProvider("key").complete_json("s", "u", Out)


def test_groq_sends_json_mode_and_key(monkeypatch):
    seen = {}

    def fake_post(url, json, headers, timeout):
        seen.update(url=url, body=json, headers=headers)
        return _ok('{"n": 1}')

    monkeypatch.setattr(httpx, "post", fake_post)
    GroqProvider("secret").complete_json("sys", "usr", Out, temperature=0.0)
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert seen["headers"]["Authorization"] == "Bearer secret"
    assert seen["body"]["messages"][0]["content"].startswith("sys\n")
    assert '"required": ["n"]' in seen["body"]["messages"][0]["content"]


def test_provider_choice(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert llm_module.get_provider().name == "none"
    monkeypatch.setenv("GROQ_API_KEY", "k")
    assert llm_module.get_provider().name == "cached-groq"
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    assert llm_module.get_provider().name == "fake"


def test_no_provider_raises():
    monkeypatch_free = llm_module.NoProvider()
    with pytest.raises(LLMError):
        monkeypatch_free.complete_json("s", "u", Out)


def test_retry_wait_honors_provider_reset_window():
    p = GroqProvider('key')
    assert p._retry_delay(_Resp(429, headers={'retry-after': '45'})) == 60
    assert p._retry_delay(_Resp(429)) == 60
