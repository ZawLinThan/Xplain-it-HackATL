# Explain-It (vDemo) — project spec

Explain-It checks whether students understand the code they submitted. In this demo a
preloaded extracted text (the assessment's questions plus the student's answers) is sent to an
LLM, which writes exactly three questions and expected answers. The student answers each
question out loud on camera, one at a time, 40 seconds maximum. The audio is transcribed, an
LLM compares the transcripts with the expected answers, the score is saved in SQLite and
returned to the front end.

## Demo scope

The student can upload two files (the quiz questions and their answers). Plain text files
(.txt, .md, .py) are read and used to write the questions; PDF and Word files are stored but not
parsed, and the sample text in `backend/app/data/assessment.json` is used instead. There is a
"use the sample quiz" checkbox, on by default. No test runner: the problem score P is preset in
`assessment.json`. Exactly three questions. Two LLM calls and three transcriptions per student.

## Rules

- All score math lives in `backend/app/scoring.py` and never calls an LLM.
- The LLM has no tools and only returns JSON validated against a Pydantic schema.
- Expected answers, key ideas and model answers never leave the server.
- The extracted text and the transcripts reach the LLM only inside quoted data tags and are
  described as data, never instructions.
- The 40-second cap is enforced in the browser, on the server by reading the real audio
  duration, and by a server-side question start time.
- The LLM and speech-to-text sit behind provider interfaces so a free service can be swapped.
- No emotion, identity or face-recognition analysis. The only camera signal is the on-device
  look-away count (head and eye direction while the student answers). No frame, image or video
  leaves the browser, only `{tracked, events:[{t_ms, side}]}`. The count is a prompt for a human,
  is shown only in the instructor view, and is never an input to any score. Not tracked is never
  shown as zero. In the UI and code it is the "look-away detector", never "eye tracking".
- Flags (the look-away flag and the score-gap review flag) never appear in a student-facing
  response or screen. They live behind the instructor token (`X-Professor-Token`, env
  `PROFESSOR_TOKEN`; off with 404 when empty, except `demo` in DEMO_MODE).
- Uploads: stored under random names, never executed or imported, content-checked, 2 MB each,
  text only is read, and uploaded text reaches the LLM only inside the data tag.
- Audio is deleted after transcription unless `RETAIN_AUDIO=1`.
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

sessions, questions, answers, scores, uploads, lookaways (plus llm_cache).

## Endpoints

- `GET /api/v1/health` (exists)
- `GET /api/v1/config` (`demo_mode`, `gaze_tracking`, `debug_borders`)
- `POST /api/v1/uploads` (multipart `questions_file`, `answers_file`)
- `POST /api/v1/sessions` (optional JSON `{upload_id}`)
- `GET /api/v1/sessions/{session_id}/questions/{n}` (n is 1 to 3 and stamps the start time)
- `POST /api/v1/sessions/{session_id}/questions/{n}/answer`
- `GET /api/v1/sessions/{session_id}/report`
- `GET /api/v1/professor/sessions`, `GET /api/v1/professor/sessions/{session_id}` (instructor token)

The answer endpoint also takes an optional form field `lookaway` (JSON). It never fails an answer.

## Commands

`make dev-backend`, `make dev-frontend`, `make test`, `make gen-openapi`, `make gen-types`.
