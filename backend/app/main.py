"""FastAPI application entry point."""

import asyncio
import time
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from . import db, voice as voice_service
from .errors import install_handlers
from .schemas import LookawayIn
from .routers import professor, sessions, uploads, voice, speech

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logging.getLogger("httpx").setLevel(logging.WARNING)  # request URLs are noise


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    async def expire_voice_references():
        while True:
            await asyncio.sleep(60)
            with voice_service.state_lock:
                voice_service.expire(time.monotonic())

    cleanup = asyncio.create_task(expire_voice_references())
    try:
        yield
    finally:
        cleanup.cancel()
        try:
            await cleanup
        except asyncio.CancelledError:
            pass
        voice_service.engine.close()
        with voice_service.state_lock:
            voice_service.references.clear()
            voice_service.checks.clear()


app = FastAPI(title="vDemo API", version="0.1.0", lifespan=lifespan)
install_handlers(app)
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
    allow_headers=["Content-Type", "Authorization", "X-Professor-Token"],
)


def custom_openapi() -> dict:
    """Add the look-away payload to the contract. It travels as a JSON string in a form field,
    so FastAPI would not otherwise publish it and the front end could not generate its type."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    model = LookawayIn.model_json_schema(ref_template="#/components/schemas/{model}")
    defs = model.pop("$defs", {})
    schemas = schema.setdefault("components", {}).setdefault("schemas", {})
    schemas.update(defs)
    schemas["LookawayIn"] = model
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi  # type: ignore[method-assign]
app.include_router(sessions.router)
app.include_router(uploads.router)
app.include_router(professor.router)
app.include_router(voice.router)
app.include_router(speech.router)


@app.get("/api/v1/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
