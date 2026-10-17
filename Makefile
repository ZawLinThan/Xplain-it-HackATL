.PHONY: dev-backend dev-frontend test test-backend test-frontend gen-openapi gen-types

PY ?= backend/.venv/bin/python

dev-backend:
	cd backend && .venv/bin/python -m uvicorn app.main:app --reload --env-file .env

dev-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/python -m pytest -q

test-frontend:
	cd frontend && npx tsc -b && npx eslint . && npm test --silent

gen-openapi:
	cd backend && .venv/bin/python scripts/gen_openapi.py

gen-types:
	cd frontend && npm run gen-types
