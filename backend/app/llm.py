"""LLM provider layer. Nothing here knows about sessions or scoring.

Providers return validated Pydantic models. Prompts and responses are never logged.
Choose a provider with LLM_PROVIDER: groq, fake, demo or none (the default without a key).
"""

import hashlib
import json
import os
import time
from abc import ABC, abstractmethod
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from . import config, db

T = TypeVar("T", bound=BaseModel)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-20b"


class LLMError(Exception):
    """The provider failed or returned output that does not match the schema."""


class LLMProvider(ABC):
    name = "base"
    model = "none"
    max_attempts = 2  # one retry when the output is not valid JSON for the schema

    @abstractmethod
    def _raw(self, system: str, user: str, temperature: float) -> str:
        """Return the model's text output (expected to be a JSON object)."""

    def complete_json(self, system: str, user: str, schema: type[T], temperature: float = 0.0) -> T:
        last_error: Exception | None = None
        for _ in range(self.max_attempts):
            text = self._raw(system, user, temperature)
            try:
                return schema.model_validate(json.loads(_strip_fences(text)))
            except (ValueError, ValidationError) as exc:  # JSONDecodeError is a ValueError
                last_error = exc
        raise LLMError(f"model output did not match {schema.__name__}") from last_error


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return text.strip()


class NoProvider(LLMProvider):
    """Used when no key is configured. Callers fall back to stored content."""

    name = "none"

    def _raw(self, system: str, user: str, temperature: float) -> str:
        raise LLMError("no LLM provider configured (set GROQ_API_KEY)")


class GroqProvider(LLMProvider):
    name = "groq"

    def __init__(self, api_key: str, model: str | None = None, backoff_seconds: float = 2.0):
        self.api_key = api_key
        self.model = model or os.getenv("LLM_MODEL", DEFAULT_MODEL)
        self.backoff_seconds = backoff_seconds

    def _raw(self, system: str, user: str, temperature: float) -> str:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        for attempt in range(2):  # a single retry on HTTP 429
            try:
                response = httpx.post(GROQ_URL, json=body, headers=headers, timeout=45.0)
            except httpx.HTTPError as exc:
                raise LLMError(f"LLM request failed: {type(exc).__name__}") from exc
            if response.status_code == 429 and attempt == 0:
                time.sleep(self._retry_delay(response))
                continue
            if response.status_code != 200:
                raise LLMError(f"LLM returned HTTP {response.status_code}")
            try:
                return response.json()["choices"][0]["message"]["content"] or ""
            except (KeyError, IndexError, ValueError) as exc:
                raise LLMError("unexpected LLM response shape") from exc
        raise LLMError("LLM rate limit (HTTP 429)")

    def _retry_delay(self, response: httpx.Response) -> float:
        try:
            return min(float(response.headers.get("retry-after", "")), 10.0)
        except ValueError:
            return self.backoff_seconds


class GeminiProvider(LLMProvider):
    name = "gemini"

    def _raw(self, system: str, user: str, temperature: float) -> str:
        raise NotImplementedError("TODO: Gemini provider")


class OllamaProvider(LLMProvider):
    name = "ollama"

    def _raw(self, system: str, user: str, temperature: float) -> str:
        raise NotImplementedError("TODO: Ollama provider")


class FakeProvider(LLMProvider):
    """Test double. Queue strings (raw output), dicts (JSON-encoded) or exceptions."""

    name = "fake"
    model = "fake"

    def __init__(self, *responses: object):
        self.queue: list[object] = list(responses)
        self.calls: list[tuple[str, str]] = []

    def push(self, *responses: object) -> None:
        self.queue.extend(responses)

    def _raw(self, system: str, user: str, temperature: float) -> str:
        self.calls.append((system, user))
        if not self.queue:
            raise LLMError("FakeProvider queue is empty")
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item if isinstance(item, str) else json.dumps(item)


class CachedProvider(LLMProvider):
    """Wraps another provider with an SQLite cache. A cache hit makes no network call."""

    def __init__(self, inner: LLMProvider):
        self.inner = inner
        self.name = f"cached-{inner.name}"
        self.model = inner.model

    def _raw(self, system: str, user: str, temperature: float) -> str:  # pragma: no cover
        raise NotImplementedError

    def complete_json(self, system: str, user: str, schema: type[T], temperature: float = 0.0) -> T:
        key = hashlib.sha256(
            json.dumps([self.inner.model, system, user, schema.__name__, temperature]).encode()
        ).hexdigest()
        hit = db.cache_get(key)
        if hit is not None:
            try:
                return schema.model_validate_json(hit)
            except ValidationError:
                pass  # stale or corrupt entry: ask again
        result = self.inner.complete_json(system, user, schema, temperature)
        db.cache_put(key, result.model_dump_json())
        return result


def get_provider() -> LLMProvider:
    """Build the provider chosen by LLM_PROVIDER (default: groq when a key exists, else none)."""
    choice = os.getenv("LLM_PROVIDER", "").strip().lower()
    key = os.getenv("GROQ_API_KEY", "").strip()
    if config.demo_mode():
        choice = "demo"
    if not choice:
        choice = "groq" if key else "none"
    if choice == "groq":
        if not key:
            return NoProvider()
        return CachedProvider(GroqProvider(key))
    if choice == "demo":
        from .demo import DemoProvider

        return DemoProvider()
    if choice == "gemini":
        return GeminiProvider()
    if choice == "ollama":
        return OllamaProvider()
    if choice == "fake":
        return FakeProvider()
    return NoProvider()
