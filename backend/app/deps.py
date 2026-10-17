"""Dependencies that tests replace with fakes through app.dependency_overrides."""

from functools import lru_cache

from .llm import LLMProvider, get_provider
from .transcribe import Transcriber, get_transcriber


@lru_cache(maxsize=1)
def get_llm() -> LLMProvider:
    return get_provider()


@lru_cache(maxsize=1)
def get_stt() -> Transcriber:
    return get_transcriber()
