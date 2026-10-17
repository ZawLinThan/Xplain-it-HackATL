"""API contract. The front end generates its types from the OpenAPI schema built from this file.

Public models never contain expected answers, key ideas or model answers.
The internal models at the bottom describe LLM output and are never returned by the API.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

TOTAL_QUESTIONS = 3
MAX_ANSWER_SECONDS = 40


# ---------------------------------------------------------------- public models


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorBody(BaseModel):
    error: ErrorDetail


class AppConfig(BaseModel):
    demo_mode: bool = Field(
        description="True when the server returns canned LLM output and transcripts (DEMO_MODE=1)"
    )
    gaze_tracking: bool = Field(description="False turns the look-away detector off (GAZE_TRACKING=0)")
    debug_borders: bool = Field(
        description="Developer toggle (DEBUG_BORDERS=1): the front end draws the red look-away borders"
    )


class UploadedFile(BaseModel):
    role: Literal["questions", "answers"]
    name: str
    size_bytes: int


class UploadCreated(BaseModel):
    upload_id: str
    files: list[UploadedFile]
    text_used: bool = Field(description="True when the files were read to write the questions")
    note: str


class SessionStart(BaseModel):
    upload_id: str | None = Field(default=None, description="From POST /uploads; omit for the sample quiz")


class SessionCreated(BaseModel):
    session_id: str
    title: str
    used_upload: bool = False
    total_questions: int = TOTAL_QUESTIONS
    max_answer_seconds: int = MAX_ANSWER_SECONDS


class QuestionPublic(BaseModel):
    index: int = Field(description="1-based position of the question")
    total: int
    text: str
    max_seconds: int


class AnswerResult(BaseModel):
    transcript: str
    seconds_used: float
    late: bool


class QuestionResult(BaseModel):
    index: int
    text: str
    transcript: str
    score: int | None = Field(description="Integer 0 to 5, or null when not graded yet")
    feedback: str | None


class Weights(BaseModel):
    problem: float
    explanation: float


class Report(BaseModel):
    title: str
    problem_score: float = Field(description="P, 0 to 1. Preset in this demo, never set by an LLM")
    explanation_score: float | None = Field(description="E, 0 to 1, or null when partial")
    final_score: float | None = Field(description="0 to 100, or null when partial")
    partial: bool = Field(description="True when some answers could not be graded")
    weights: Weights
    questions: list[QuestionResult]


# ------------------------------------------------------------ look-away and professor

LOOKAWAY_SIDES = ("left", "right", "top", "bottom", "lost")


class LookawayEvent(BaseModel):
    t_ms: int = Field(ge=0, le=60000)
    side: Literal["left", "right", "top", "bottom", "lost"]


class LookawayIn(BaseModel):
    """What the browser sends with an answer: counts and times only, never images."""

    tracked: bool
    events: list[LookawayEvent] = Field(default_factory=list, max_length=200)


class ProfessorLookaway(BaseModel):
    tracked: bool
    count: int
    flagged: bool
    events: list[LookawayEvent]


class ProfessorQuestion(BaseModel):
    n: int
    text: str
    answered: bool
    transcript: str
    score: int | None
    late: bool
    seconds_used: float
    lookaway: ProfessorLookaway


class ProfessorSessionRow(BaseModel):
    session_id: str
    created_at: float
    title: str
    answered: int
    completed: bool
    final_score: float | None
    review_flag: bool
    lookaway_flagged: bool
    lookaway_tracked_all: bool
    lookaway_max: int = Field(description="Most look-aways in any one question")
    lookaway_max_question: int | None = Field(description="Which question had the most")


class ProfessorSessions(BaseModel):
    sessions: list[ProfessorSessionRow]
    lookaway_threshold: int


class ProfessorSession(BaseModel):
    session_id: str
    created_at: float
    title: str
    problem_score: float
    explanation_score: float | None
    final_score: float | None
    gap: float | None
    review_flag: bool
    review_threshold: float
    lookaway_threshold: int
    lookaway_flagged: bool
    questions: list[ProfessorQuestion]


# ------------------------------------------------- internal models (LLM output)


class Expected(BaseModel):
    key_ideas: list[str] = Field(min_length=2, max_length=4)
    model_answer: str = Field(min_length=1)

    @field_validator("key_ideas")
    @classmethod
    def _non_empty(cls, value: list[str]) -> list[str]:
        cleaned = [v.strip() for v in value]
        if any(not v for v in cleaned):
            raise ValueError("key ideas must not be empty")
        return cleaned


class GenQuestion(BaseModel):
    type: Literal["why", "trace", "change"]
    text: str = Field(min_length=10, max_length=400)
    expected: Expected


class QuestionGen(BaseModel):
    questions: list[GenQuestion] = Field(min_length=TOTAL_QUESTIONS, max_length=TOTAL_QUESTIONS)


class GradeItem(BaseModel):
    index: int
    score: int
    feedback: str = ""


class GradeOut(BaseModel):
    grades: list[GradeItem]
