# Explain-It (vDemo) — project spec

Explain-It checks whether students understand the code they submitted. In this demo a
preloaded extracted text (the assessment's questions plus the student's answers) is sent to an
LLM, which writes exactly three questions and expected answers. The student answers each
question out loud on camera, one at a time, 40 seconds maximum. The audio is transcribed, an
LLM compares the transcripts with the expected answers, the score is saved in SQLite and
returned to the front end.

## Demo scope

No file upload, no parsing, no test runner. The problem score P is preset in
`backend/app/data/assessment.json`. Exactly three questions. Two LLM calls and three
transcriptions per student.

## Rules

- All score math lives in `backend/app/scoring.py` and never calls an LLM.
- The LLM has no tools and only returns JSON validated against a Pydantic schema.
- Expected answers, key ideas and model answers never leave the server.
- The extracted text and the transcripts reach the LLM only inside quoted data tags and are
  described as data, never instructions.
- The 40-second cap is enforced in the browser, on the server by reading the real audio
  duration, and by a server-side question start time.
- The LLM and speech-to-text sit behind provider interfaces so a free service can be swapped.
- No face or emotion analysis. Audio is deleted after transcription unless `RETAIN_AUDIO=1`.
  Never log transcripts at INFO level.
- The API contract lives in `backend/app/schemas.py`. The front end never hand-writes API types.
- Backend: Python 3.10+, all routes under `/api/v1`. Front end: TypeScript with
  `erasableSyntaxOnly`, so no enums, namespaces or constructor parameter properties.

## Scoring

- P = problem_points_earned / problem_points_total (preset)
- E = mean(question scores) / 5
- final = 100 * (wp * P + we * E), defaults wp 0.6, we 0.4
- gap = P - E; review flag when gap > 0.40. The flag is a prompt for a human, never a verdict.
- Question scores are integers 0 to 5.

## Tables

sessions, questions, answers, scores.

## Endpoints

- `GET /api/v1/health` (exists)
- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{session_id}/questions/{n}` (n is 1 to 3 and stamps the start time)
- `POST /api/v1/sessions/{session_id}/questions/{n}/answer`
- `GET /api/v1/sessions/{session_id}/report`

## Commands

`make dev-backend`, `make dev-frontend`, `make test`, `make gen-openapi`, `make gen-types`.
