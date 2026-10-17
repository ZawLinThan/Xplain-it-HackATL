# vDemo Backend

Python FastAPI backend for Explain-It. Requires Python 3.10+. `ffmpeg` and `ffprobe` must be on
the PATH for real recordings (they convert audio and read its true length); not needed for
`DEMO_MODE=1` or the tests.

## Setup

From this directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env
python -m uvicorn app.main:app --reload --env-file .env
```

On Windows, activate with `.venv\Scripts\activate`.

- Health endpoint: http://localhost:8000/api/v1/health
- Interactive API docs: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json

Set `CORS_ORIGINS` in `.env` to a comma-separated list of allowed frontend
origins. Defaults allow Vite on port 5173. The `--env-file` option loads `.env`.
Keep secrets out of `.env.example`.

## Environment variables

See `.env.example` for the full list.

| Variable | Meaning |
| --- | --- |
| `GROQ_API_KEY` | Free key for the LLM and Whisper. Empty: stored question bank, no grading |
| `DEMO_MODE=1` | Offline: canned LLM output and transcripts. Pick the canned student with `DEMO_STUDENT=strong` or `weak` |
| `LLM_PROVIDER`, `STT_PROVIDER` | `groq`, `demo`, `fake`, `none` (STT also `local`) |
| `WP`, `WE`, `REVIEW_THRESHOLD` | Score weights (default 0.6 / 0.4) and the review gap (0.40) |
| `ANSWER_GRACE_SECONDS` | Time allowed on top of 40 s for reading and uploading (30). Later answers score 0 |
| `UPLOAD_DIR`, `MAX_UPLOAD_BYTES` | Where uploaded files go and the per-file limit (2 MB) |
| `LOOKAWAY_THRESHOLD`, `GAZE_TRACKING`, `DEBUG_BORDERS` | Flag at this many look-aways in one answer (4); turn the detector off; draw the red borders for developers |
| `PROFESSOR_TOKEN` | Shared token for the instructor routes. Empty: 404 (demo mode uses `demo`) |
| `DATABASE_PATH`, `AUDIO_DIR` | Where SQLite and temporary audio live |
| `RETAIN_AUDIO`, `SESSION_TTL_HOURS` | Keep audio (off by default); age at which `python -m app.cleanup` deletes sessions |

## Endpoints

All under `/api/v1`. Errors look like `{"error": {"code": "...", "message": "..."}}`.

- `GET /health`, `GET /config` (`demo_mode`, `gaze_tracking`, `debug_borders`)
- `POST /uploads` (multipart `questions_file` and `answers_file`; .txt .md .py are read, .pdf .docx are stored only)
- `POST /sessions` (optional JSON `{upload_id}`)
- `GET /sessions/{id}/questions/{n}` (n is 1 to 3; the first call starts that question's clock)
- `POST /sessions/{id}/questions/{n}/answer` (multipart: `audio`, `consent`, optional `video`)
- `GET /sessions/{id}/report`
- `GET /professor/sessions`, `GET /professor/sessions/{id}` (header `X-Professor-Token`): scores, transcripts, look-away counts and flags. Students never receive these.

Regenerate the contract for the front end with `make gen-openapi`, then `make gen-types`.

## Free-tier limits (checked 2026-10-16, confirm before demo day)

Groq's free plan rate-limits both the chat model and Whisper. One student uses 2 LLM calls and 3
transcriptions, so Whisper's per-hour audio allowance is the tighter limit, roughly 60 students an
hour. Answers to identical inputs are cached in SQLite (`llm_cache`), so rehearsing costs little.
If a limit is hit the API returns a clear error and the screen offers to try again.

## Offline check

`python scripts/seed_demo.py` runs the whole pipeline for the strong and the weak canned student
against a throwaway database and prints their scores (81.3 and 49.3 with the review note).

## Frontend example

```ts
const response = await fetch('http://localhost:8000/api/v1/health')
if (!response.ok) throw new Error('API request failed')
const health = await response.json()
```

## Verify

```sh
python -m pytest -q
```

## Production

Install `requirements.txt`, set `CORS_ORIGINS` to the deployed frontend origin,
and run:

```sh
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## GitHub

This folder belongs to the Git repository in the parent directory. Virtual environments, caches,
databases, audio and local `.env` files are ignored.
