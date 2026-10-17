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
