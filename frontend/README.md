# Explain-It front end

Vite 8, React 19, TypeScript 6. One screen at a time: start (device check and consent), three
questions, report. No router; the flow is a reducer in `src/flow.ts`, saved to `sessionStorage`
so a refresh resumes.

## Run

```sh
npm install
cp .env.example .env
npm run dev          # http://localhost:5173, expects the backend on VITE_API_URL
```

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | Backend address (default http://localhost:8000) |
| `VITE_MOCK=1` | Canned data from `src/api/mocks`, no backend. Try `?mock=weak` or `?mock=partial` |
| `VITE_FAKE_GAZE=<n>` | Scripted look-aways (n per answer) for demos and tests; no camera model needed |
| `VITE_MOCK_FAST=1` | Makes mock mode instant (used by tests) |

## Look-away detector

The detector runs in the browser with MediaPipe Face Landmarker. Fetch the model and wasm files once
(they are not committed; about 45 MB):

```sh
npm run setup-gaze
```

Without them (or with no camera) the detector reports "not tracked" and the quiz still works. The
gaze estimate uses fixed gains in `src/lookaway/gaze.ts`; tune them with `DEBUG_BORDERS=1` on the
backend, which draws the red borders and a gaze dot, on the real webcam you will demo with.

After **Check devices**, choose **Calibrate look-away detector**. Keep your head still and
look at each of five targets, followed by a separate center check (about 13 seconds). The
browser fits horizontal/vertical sensitivity, offsets, and axis coupling to those samples.
Calibration is rejected when the targets cannot be distinguished or the center check fails.
The mapping stays only in memory for this page; recalibrate after moving the camera or
changing seating. Without this step, the detector uses its approximate fixed-gain mapping.

The real tracker filters isolated spikes and smooths horizontal samples over about 100 ms,
vertical samples over 160 ms, with a cap on vertical jumps. Closing/reopening eye frames
are excluded from tracking and calibration, including 180 ms after a detected blink. Brief
blinks hold the dot; after 400 ms without a reliable gaze sample the tracker reports unknown. Raw values
remain unclipped until calibration is applied. This is still an approximate webcam look-away
detector; a fitted debug dot is not a guarantee of accurate screen coordinates.

## Instructor view

`/?view=professor` asks for the instructor token (`PROFESSOR_TOKEN` on the backend, `demo` in demo
mode). It lists sessions with flags and shows each answer's transcript and look-away timeline.

## Scripts

```sh
npm run gen-types    # regenerate src/api/schema.d.ts from ../docs/openapi.json (uses npx openapi-typescript)
npm test             # vitest
npx tsc -b && npx eslint . && npm run build
```

Never hand-write API types; run the backend's `make gen-openapi`, then `npm run gen-types`.

## Notes for contributors

- `erasableSyntaxOnly` is on: no enums, namespaces or constructor parameter properties.
- `src/Recorder.tsx` records the audio track only (the camera is a preview). Its timer uses
  `performance.now()`, so a throttled background tab cannot run past 40 s.
- `src/features.ts` lists what is Working, Simulated or Planned. The `Badge` component reads it,
  and shows Simulated automatically when the backend reports `demo_mode`.
- `src/lookaway/counter.ts` is pure (no DOM) and holds the border rules; `gaze.ts` turns face landmarks into a screen point.
- `/?dev=recorder` opens a bare recorder page for testing.

## Browser end-to-end check

Run the backend with `DEMO_MODE=1` and the dev server, then drive Chromium with a fake
microphone and camera (`--use-fake-device-for-media-stream`,
`--use-fake-ui-for-media-stream`) using Playwright. It walks start, three answers and the report.
Playwright is not a project dependency; install it separately if you want to repeat the check.


## Interface presentation

The UI uses the supplied frontend ZIP's light landing/setup and results design, plus its
animated dark assessment stage. The existing API client, session reducer, recorder, screen
sharing, uploads, gaze calibration, report data, and instructor authorization remain in place.
**Submit assignment** opens setup; **Start** keeps the original readiness requirements.
Closing setup releases its camera/microphone preview and requires checking devices again.
The assessment's **Reduce motion** control also respects the OS motion preference.
Presentation tokens and source styles live in `src/styles/`; `migration.css` adapts the
current feature components. The supplied ZIP's API/controller implementation is not used.


## Voice calibration and instructor flags

The mouth movement heuristic is replaced by session-only voice comparison. After checking
devices, consent and read the calibration passage aloud for 15 seconds, then start. Live
speech is compared with that reference using SpeechBrain ECAPA. More than 3 seconds of
continuous confident mismatch creates an instructor flag and displays the temporary testing
notice: “Your voice appears to have changed and has been flagged for your instructor.”
Silence, uncertain comparisons, service errors and gaps reset the timer. Three-second rolling
audio windows and inference add detection latency; this is a review prompt, not identity proof,
and never changes scores. Microphone quality and noise can affect accuracy.

Install the optional worker from the repository root (Python 3.13):

```sh
python3.13 -m venv backend/.venv-voice
backend/.venv-voice/bin/python -m pip install -r backend/requirements-voice.txt
backend/.venv-voice/bin/python backend/app/voice_worker.py --warmup
```

The backend starts the worker automatically; no third terminal is needed. Restart the backend
after setup. Use a single backend process because references are in memory. Without a ready
worker, setup explains that verification is unavailable and allows an unverified assessment.
`VOICE_VERIFICATION_ENABLED=0` disables it; `VOICE_PYTHON` overrides the worker interpreter.
`VOICE_SIMILARITY_THRESHOLD` defaults to 0.25, with a 0.05 uncertainty band above it.
References are deleted after completion or within a minute of their one-hour expiry, and on
backend shutdown. Neither embeddings nor comparison audio are saved. Existing answer audio
submission remains unchanged. Instructor flags persist behind instructor authorization.


## Look-away logs and submission prints

The dedicated corner log is removed. Normal look-away events/counts remain unchanged. The
`duration_log` records each continuous visit to a boundary, including corners, with `t_ms`,
`duration_ms`, and `side`. Returning to center, changing the dominant boundary side, face loss,
or a camera gap over 450 ms ends a duration entry. A single sample may produce a zero-duration
entry; elapsed time without observed frames is never fabricated. Neither log changes grading.
Debug mode shows the count and latest four entries of each log. The professor detail shows the
complete event and duration logs, submitted automatically with each answer.

At the end of each answer, open browser Developer Tools → Console and expand
`[look-away] Question N completed`. It prints the event table, durations (also in seconds),
POST destination, and exact JSON in the multipart `lookaway` field. A subsequent message
confirms acceptance or reports that submission is unconfirmed. Mock mode explicitly says
`not sent`. The backend terminal prints `[look-away] Saved for professor:` with the validated
stored JSON, so you can compare sent data with saved data. No audio, frames, or transcripts
are printed by these diagnostics. Old corner-only database rows are left untouched but are
no longer used as an active log; old sessions have empty general duration logs.
