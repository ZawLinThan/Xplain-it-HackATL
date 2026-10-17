"""Instructor view of sessions, including the look-away flags that students never see."""

import hmac
import json

from fastapi import Header

from . import config, db, scoring
from .errors import AppError
from .schemas import (
    TOTAL_QUESTIONS,
    LookawayEvent,
    LookawayDuration,
    ProfessorLookaway,
    ProfessorQuestion,
    ProfessorSession,
    ProfessorSessionRow,
    ProfessorSessions,
)


def require_professor(x_professor_token: str | None = Header(default=None)) -> None:
    """Shared-token check. Off (404) when no token is configured, unless DEMO_MODE=1."""
    expected = config.professor_token()
    if not expected:
        raise AppError(404, "not_found", "Not found.")
    given = x_professor_token or ""
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise AppError(401, "unauthorized", "That token is not accepted.")


def _lookaway(row, threshold: int) -> ProfessorLookaway:
    if row is None or not row["tracked"]:
        return ProfessorLookaway(tracked=False, count=0, flagged=False, events=[])
    events = [LookawayEvent(**e) for e in json.loads(row["events_json"])]
    return ProfessorLookaway(
        tracked=True,
        count=row["count"],
        flagged=scoring.lookaway_flag(row["count"], threshold),
        events=events,
        duration_log=[LookawayDuration(**event) for event in json.loads(row["duration_log_json"])],
    )


def list_sessions(limit: int) -> ProfessorSessions:
    threshold = config.lookaway_threshold()
    rows: list[ProfessorSessionRow] = []
    for s in db.list_recent_sessions(max(1, min(limit, 200))):
        answers = db.list_answers(s["id"])
        look = db.list_lookaways(s["id"])
        saved = db.get_scores(s["id"])
        counts = [r["count"] for r in look.values() if r["tracked"]]
        worst = max(((r["count"], n) for n, r in look.items() if r["tracked"]), default=(0, None))
        rows.append(
            ProfessorSessionRow(
                session_id=s["id"],
                created_at=s["created_at"],
                title=s["title"],
                answered=len(answers),
                completed=len(answers) >= TOTAL_QUESTIONS,
                final_score=None if saved is None else saved["final_score"],
                review_flag=bool(saved and saved["review_flag"]),
                voice_flagged=bool(db.list_voice_flags(s["id"])),
                lookaway_flagged=scoring.session_flagged(counts, threshold),
                lookaway_max=worst[0],
                lookaway_max_question=worst[1] if worst[0] else None,
                lookaway_tracked_all=bool(answers)
                and all(a["question_idx"] in look and look[a["question_idx"]]["tracked"] for a in answers),
            )
        )
    return ProfessorSessions(sessions=rows, lookaway_threshold=threshold)


def session_detail(session_id: str) -> ProfessorSession:
    from . import service  # local import: service imports nothing from here

    session = db.get_session(session_id)
    if session is None:
        raise AppError(404, "session_not_found", "No such session.")
    threshold = config.lookaway_threshold()
    answers = {a["question_idx"]: a for a in db.list_answers(session_id)}
    look = db.list_lookaways(session_id)
    saved = db.get_scores(session_id)

    questions: list[ProfessorQuestion] = []
    for q in db.list_questions(session_id):
        a = answers.get(q["idx"])
        questions.append(
            ProfessorQuestion(
                n=q["idx"],
                text=q["text"],
                answered=a is not None,
                transcript=a["transcript"] if a else "",
                score=a["score"] if a else None,
                late=bool(a["late"]) if a else False,
                seconds_used=a["seconds_used"] if a else 0.0,
                voice_flags=db.list_voice_flags(session_id).get(q["idx"], []),
                lookaway=_lookaway(look.get(q["idx"]), threshold),
            )
        )

    assessment = service.load_assessment()
    p = scoring.problem_score(assessment["problem_points_earned"], assessment["problem_points_total"])
    e = saved["explanation_score"] if saved else None
    return ProfessorSession(
        session_id=session_id,
        created_at=session["created_at"],
        title=session["title"],
        problem_score=round(saved["problem_score"] if saved else p, 4),
        explanation_score=None if e is None else round(e, 4),
        final_score=None if saved is None else saved["final_score"],
        gap=None if e is None else round(p - e, 4),
        review_flag=bool(saved and saved["review_flag"]),
        review_threshold=config.review_threshold(),
        lookaway_threshold=threshold,
        lookaway_flagged=any(x.lookaway.flagged for x in questions),
        questions=questions,
    )
