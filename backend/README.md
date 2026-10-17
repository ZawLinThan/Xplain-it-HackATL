# vDemo Backend

Python FastAPI backend for the React/Vite frontend. Requires Python 3.10+.

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

This folder belongs to the Git repository in the parent directory. From that
directory, include it in your next commit with `git add backend`.
Virtual environments, caches, and local `.env` files are ignored.
