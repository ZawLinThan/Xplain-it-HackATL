"""FastAPI application entry point."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="vDemo API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/v1/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
