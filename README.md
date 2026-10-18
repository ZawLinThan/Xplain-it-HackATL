# Xplain-it (vDemo)

Checks whether a student understands the code they submitted. A preloaded quiz (its questions and
the student's answers) goes to an LLM, which writes exactly **three** questions. The student
answers each one out loud, on camera, in **40 seconds or less**. The answers are transcribed, an
LLM grades them against expected answers, the score is saved in SQLite and shown on screen.

- Backend: [backend/README.md](backend/README.md) (FastAPI, SQLite)
- Frontend: [frontend/README.md](frontend/README.md) (Vite, React, TypeScript)
- Spec for contributors and Claude Code: [CLAUDE.md](CLAUDE.md)

## Quick start (offline, no keys)

Two terminals, from this folder.

```sh
# 1. backend, canned LLM output and transcripts
cd backend
python3 -m venv .venv && source .venv/bin/activate
python -m pip install -r requirements-dev.txt
cp .env.example .env            # then set DEMO_MODE=1 in .env
python -m uvicorn app.main:app --reload --reload-dir app --env-file .env

# 2. frontend
cd frontend
npm install
cp .env.example .env
npm run dev                     # http://localhost:5173
```

No backend at all? Set `VITE_MOCK=1` in `frontend/.env` and the front end uses canned data.
Add `?mock=weak` or `?mock=partial` to the URL for the other outcomes. 

For real questions and real transcription, get a free key at https://console.groq.com and put it
in `backend/.env` as `GROQ_API_KEY`. Leave `DEMO_MODE=0`.

## What is real and what is not

| Part | Status |
| --- | --- |
| Three spoken questions, one at a time, 40 s cap (browser, audio length, server clock) | Working |
| Question writing, transcription, grading | Working with a Groq key; Simulated with `DEMO_MODE=1` |
| Problem score P (22 of 30) | Simulated: preset in `backend/app/data/assessment.json`, no code is run |
| File upload | Simulated: text files (.txt, .md, .py) are read to write the questions; PDF and Word are stored but not parsed (the sample is used) |
| Look-away count (head and eye direction while answering, on the device) | Working, shown only to the instructor |
| Instructor view at `/?view=professor` | Working, needs the instructor token |
| Typed answers | Planned |

The screen shows the same Working / Simulated / Planned labels, and switches to Simulated by
itself when the server is in demo mode.

## How the score works 

- P = problem points earned / total (preset, never from an LLM)
- E = mean of the three question scores (0 to 5 each) / 5
- final = 100 × (0.6 P + 0.4 E); weights are `WP` and `WE`
- If P − E is above 0.40 the report shows a review note. It is a prompt for a person to talk to the
  student, not a verdict.

Examples: scores 5, 5, 4 give 81.3; scores 1, 1, 0 give 49.3 with the review note.

## 90-second demo script

1. (10 s) "A student passed a coding quiz. Did they write it, or understand it?" Open the start
   screen. Point at the Working / Simulated / Planned labels: we say what is real. Show the upload
   box (or leave the sample quiz on).
2. (10 s) **Check devices**, tick consent, **Start**.
3. (35 s) Each question appears word by word; when the last word lands the 40 s timer starts by
   itself. Answer aloud, show the transcript, and let the app move on by itself after 5 s.
   Let one answer run toward zero to show the 40 s cap.
4. (15 s) The student report: final score, P against E, a card per question. No flags here.
5. (20 s) Open `/?view=professor` (token `demo` in demo mode): the flagged student, "Looked away 4
   times in question 3 (limit 4)", the timeline, and the line that a flag is a reason to talk, not
   proof. Weak student: restart the backend with `DEMO_STUDENT=weak`.

Rehearsal tips: `VITE_FAKE_GAZE=4` makes the detector report four look-aways per answer without
anyone moving; `DEBUG_BORDERS=1` on the backend draws the red borders and a gaze dot so you can
check the detector is working.

Tip: record the screen once beforehand as a fallback in case the venue Wi-Fi fails.

## Vercel services deployment

Import this repository as one Vercel project with the repository root as the Root Directory.
The root `vercel.json` builds `backend` (FastAPI, `app.main:app`) and `frontend` (Vite).
Public `/api/*` requests reach FastAPI with the original path intact; everything else
reaches the frontend. Existing backend routes already use `/api/v1`.

No service bindings are needed: the frontend runs in the browser, calls the public
same-origin API, and has no server function that can consume a runtime binding. The backend
only calls external Groq/ElevenLabs APIs and a local subprocess, not another deployed service.
Never put private binding URLs or API keys in `VITE_*` variables.

Leave `VITE_API_URL` unset (or empty) in Vercel. Set server credentials such as
`GROQ_API_KEY`, `ELEVENLABS_API_KEY`, and `PROFESSOR_TOKEN` in project environment settings
as needed; see `backend/.env.example`. Do not copy local storage path overrides to Vercel.
For local integration testing, run `vercel dev` from the repository root (or
`vercel dev -L` without cloud authentication). Check `/api/v1/health` and the browser's
session, upload, and speech requests. Running Vite directly instead proxies `/api` to
the backend on port 8000. An existing `frontend/.env` with `VITE_API_URL` overrides this.

Deployment limitations: Vercel uses `/tmp/vdemo` for the existing SQLite database,
audio, and uploads by default. These files are ephemeral and are not shared between
function instances; sessions can disappear or be unavailable on later requests.
Durable deployment requires replacing local storage with shared persistence.
Audio processing also requires packaged `ffmpeg` and `ffprobe`; this configuration does
not supply them. Optional voice verification requires its separate Python environment,
model files, and in-memory reference state, so it is not configured for distributed
Functions. Do not treat this routing setup as a production-ready assessment backend.

## Tests

```sh
make test        # backend pytest + frontend tsc, eslint, vitest
```

The browser end-to-end check (Playwright with a fake microphone and camera) is described in
[frontend/README.md](frontend/README.md).

## Privacy and safety defaults

- Audio is deleted right after transcription (`RETAIN_AUDIO=1` keeps it). Video is never stored.
  Transcripts are not written to logs. `python -m app.cleanup` deletes old sessions.
- Expected answers, key ideas and model answers never leave the server.
- The quiz text and transcripts reach the LLM only inside quoted data tags. Text that looks like a
  prompt injection is flagged and logged; it never changes a score.
- No emotion, identity or face recognition. While answering, the browser estimates head and eye
  direction and counts how often the student looks away. Only the count and its times leave the
  device (never a frame). It is shown only to the instructor, never changes a score, and is
  described to the student on the start screen. It can be wrong: a second monitor, notes, camera
  angle or a disability can all cause a count, so it is a prompt for a conversation, not proof.
  `GAZE_TRACKING=0` turns it off. Not tracked is never shown as zero.
- Uploaded files are stored under random names, never run, limited to 2 MB, content-checked, and
  read only as text. Instructor routes need `PROFESSOR_TOKEN` (a shared secret, not real accounts).
- No code from the student is run in this demo, so no sandbox is needed. Add one before accepting
  uploaded code.
