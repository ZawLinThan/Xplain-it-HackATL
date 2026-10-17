"""Business logic: question generation, grading and the report. Routers stay thin."""

import json
import logging

from . import config, db, scoring
from .errors import AppError
from .llm import LLMError, LLMProvider
from .prompts import build_grading_prompt, build_question_prompt
from .schemas import (
    TOTAL_QUESTIONS,
    GradeOut,
    QuestionGen,
    QuestionResult,
    Report,
    Weights,
)

log = logging.getLogger("vdemo")

NO_SPEECH = "No speech was detected in this answer."
LATE = "This answer was submitted after the time limit."


# ----------------------------------------------------------------- sample data


def load_assessment() -> dict:
    return json.loads((config.DATA_DIR / "assessment.json").read_text())


def load_bank() -> list[dict]:
    return json.loads((config.DATA_DIR / "question_bank.json").read_text())


# ------------------------------------------------------------------- questions


def make_questions(llm: LLMProvider, extracted_text: str) -> tuple[list[dict], str]:
    """Ask the LLM for three questions. Falls back to the stored bank so the demo never stalls."""
    system, user = build_question_prompt(extracted_text)
    try:
        generated = llm.complete_json(system, user, QuestionGen, temperature=0.2)
    except LLMError as exc:
        log.warning("question generation failed (%s); using the stored question bank", exc)
        return load_bank()[:TOTAL_QUESTIONS], "bank"
    rows = [
        {
            "type": q.type,
            "text": q.text.strip(),
            "key_ideas": q.expected.key_ideas,
            "model_answer": q.expected.model_answer.strip(),
        }
        for q in generated.questions
    ]
    return rows, "llm"


# --------------------------------------------------------------------- report


def _result_rows(questions, answers) -> list[QuestionResult]:
    return [
        QuestionResult(
            index=q["idx"],
            text=q["text"],
            transcript=answers[q["idx"]]["transcript"],
            score=answers[q["idx"]]["score"],
            feedback=answers[q["idx"]]["feedback"],
        )
        for q in questions
    ]


def _grade_with_llm(llm: LLMProvider, session_id: str, questions, answers) -> None:
    """Grade every answer that needs the LLM with ONE call. Failures leave answers ungraded."""
    to_grade: list[dict] = []
    for q in questions:
        answer = answers[q["idx"]]
        if answer["score"] is not None:
            continue
        if answer["late"]:
            db.set_grade(session_id, q["idx"], 0, LATE)
        elif not answer["transcript"].strip():
            db.set_grade(session_id, q["idx"], 0, NO_SPEECH)
        else:
            to_grade.append(
                {
                    "index": q["idx"],
                    "question": q["text"],
                    "key_ideas": json.loads(q["key_ideas"]),
                    "model_answer": q["model_answer"],
                    "transcript": answer["transcript"],
                }
            )
    if not to_grade:
        return
    system, user = build_grading_prompt(to_grade)
    try:
        graded = llm.complete_json(system, user, GradeOut, temperature=0.0)
    except LLMError as exc:
        log.warning("grading failed for session %s (%s); report will be partial", session_id, exc)
        return
    wanted = {item["index"] for item in to_grade}
    seen: set[int] = set()
    for grade in graded.grades:
        if grade.index in wanted and grade.index not in seen:
            seen.add(grade.index)
            db.set_grade(
                session_id,
                grade.index,
                scoring.clamp_score(grade.score),
                grade.feedback.strip()[:400],
            )


def build_report(session_id: str, llm: LLMProvider) -> Report:
    session = db.get_session(session_id)
    if session is None:
        raise AppError(404, "session_not_found", "No such session.")
    questions = db.list_questions(session_id)
    answers = {a["question_idx"]: a for a in db.list_answers(session_id)}
    if any(q["idx"] not in answers for q in questions):
        raise AppError(409, "not_finished", "Answer all three questions before asking for the report.")

    assessment = load_assessment()
    p = scoring.problem_score(
        assessment["problem_points_earned"], assessment["problem_points_total"]
    )
    wp, we = scoring.normalize_weights(*config.weights())

    saved = db.get_scores(session_id)
    if saved is None or saved["partial"]:
        _grade_with_llm(llm, session_id, questions, answers)
        answers = {a["question_idx"]: a for a in db.list_answers(session_id)}
        ungraded = [q for q in questions if answers[q["idx"]]["score"] is None]
        if ungraded:
            db.save_scores(session_id, p, None, None, None, True, wp, we)
        else:
            e = scoring.explanation_score([answers[q["idx"]]["score"] for q in questions])
            db.save_scores(
                session_id,
                p,
                e,
                scoring.final_score(p, e, wp, we),
                scoring.review_flag(p, e, config.review_threshold()),
                False,
                wp,
                we,
            )
        saved = db.get_scores(session_id)

    partial = bool(saved["partial"])
    return Report(
        title=session["title"],
        problem_score=round(saved["problem_score"], 4),
        explanation_score=None if partial else round(saved["explanation_score"], 4),
        final_score=None if partial else saved["final_score"],
        review_flag=None if partial else bool(saved["review_flag"]),
        partial=partial,
        weights=Weights(problem=round(saved["weight_problem"], 4), explanation=round(saved["weight_explanation"], 4)),
        questions=_result_rows(questions, answers),
    )
