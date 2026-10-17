"""All score math. Pure functions: no I/O, no LLM calls.

P = problem points earned / total (preset in this demo)
E = mean(question scores) / 5
final = 100 * (wp * P + we * E)
review flag when P - E > threshold (a prompt for a human, never a verdict)
"""

import math
from collections.abc import Sequence

DEFAULT_WP = 0.6
DEFAULT_WE = 0.4
DEFAULT_THRESHOLD = 0.40


def clamp_score(score: float) -> int:
    """Force a question score into the integers 0..5."""
    return max(0, min(5, int(round(score))))


def problem_score(earned: float, total: float) -> float:
    if total <= 0:
        return 0.0
    return max(0.0, min(1.0, earned / total))


def explanation_score(question_scores: Sequence[float]) -> float:
    if not question_scores:
        return 0.0
    return sum(clamp_score(s) for s in question_scores) / (5 * len(question_scores))


def normalize_weights(wp: float, we: float) -> tuple[float, float]:
    wp, we = max(wp, 0.0), max(we, 0.0)
    total = wp + we
    if total <= 0:
        return DEFAULT_WP, DEFAULT_WE
    return wp / total, we / total


def final_score(p: float, e: float, wp: float = DEFAULT_WP, we: float = DEFAULT_WE) -> float:
    wp, we = normalize_weights(wp, we)
    raw = 100 * (wp * p + we * e)
    # round half up to one decimal, immune to binary float noise
    return math.floor(raw * 10 + 0.5 + 1e-9) / 10


def review_flag(p: float, e: float, threshold: float = DEFAULT_THRESHOLD) -> bool:
    # round first so 0.8 - 0.4 is not read as 0.4000000000000001
    return round(p - e, 9) > threshold
