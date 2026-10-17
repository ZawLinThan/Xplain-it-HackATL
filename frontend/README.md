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
| `VITE_MOCK_FAST=1` | Makes mock mode instant (used by tests) |

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
- `/?dev=recorder` opens a bare recorder page for testing.

## Browser end-to-end check

Run the backend with `DEMO_MODE=1` and the dev server, then drive Chromium with a fake
microphone and camera (`--use-fake-device-for-media-stream`,
`--use-fake-ui-for-media-stream`) using Playwright. It walks start, three answers and the report.
Playwright is not a project dependency; install it separately if you want to repeat the check.
