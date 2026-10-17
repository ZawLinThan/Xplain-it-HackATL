"""DEMO_MODE=1: canned LLM output and canned transcripts, so the whole flow runs offline.

Everything here is Simulated. It exists so the demo cannot stall on a network or quota problem.
Pick the canned student with DEMO_STUDENT=strong (default) or DEMO_STUDENT=weak.
"""

import json
import os
import re
from pathlib import Path

from . import config
from .llm import LLMError, LLMProvider
from .transcribe import Transcriber, Transcript

_CACHE: dict | None = None


def cache() -> dict:
    global _CACHE
    if _CACHE is None:
        _CACHE = json.loads((config.DATA_DIR / "demo_cache.json").read_text())
    return _CACHE


def demo_student() -> str:
    name = os.getenv("DEMO_STUDENT", "strong").strip().lower()
    return name if name in cache()["students"] else "strong"


_ITEM = re.compile(r'<item index="(\d+)">(.*?)</item>', re.DOTALL)


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z']+", text.lower()) if len(w) > 3}


class DemoProvider(LLMProvider):
    name = "demo"
    model = "demo"

    def _raw(self, system: str, user: str, temperature: float) -> str:
        if "<assessment_text>" in user:
            return json.dumps(cache()["questions"])
        if "<answers>" in user:
            return json.dumps({"grades": self._grade(user)})
        raise LLMError("demo provider does not know this prompt")

    def _grade(self, user: str) -> list[dict]:
        canned = {
            t: g
            for s in cache()["students"].values()
            for t, g in zip(s["transcripts"], s["grades"])
        }
        grades = []
        for index, body in _ITEM.findall(user):
            transcript = re.search(r"<transcript>(.*?)</transcript>", body, re.DOTALL)
            text = (transcript.group(1) if transcript else "").strip()
            if text in canned:
                grades.append({**canned[text], "index": int(index)})
                continue
            # live speech in demo mode: a crude overlap check against the key ideas
            ideas = re.search(r"<key_ideas>(.*?)</key_ideas>", body, re.DOTALL)
            lines = [ln[2:] for ln in (ideas.group(1) if ideas else "").splitlines() if ln.startswith("- ")]
            hit = sum(1 for ln in lines if len(_words(ln) & _words(text)) >= max(1, len(_words(ln)) // 3))
            score = 1 if lines and hit == 0 else min(5, 2 + hit) if lines else 1
            grades.append({"index": int(index), "score": score, "feedback": "Demo grading (keyword overlap)."})
        return grades


class DemoTranscriber(Transcriber):
    """Returns the canned transcripts in order: question 1, 2, 3, then starts over."""

    def __init__(self) -> None:
        self.count = 0
        self.student = demo_student()

    def transcribe(self, path: Path) -> Transcript:
        current = demo_student()
        if current != self.student:
            self.student, self.count = current, 0
        texts = cache()["students"][self.student]["transcripts"]
        text = texts[self.count % len(texts)]
        self.count += 1
        return Transcript(text=text)
