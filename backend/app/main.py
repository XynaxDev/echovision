"""
EchoVision Backend — FastAPI Application Entry Point

Configures the FastAPI application with:
  - CORS middleware for cross-origin requests from the mobile client
  - Lifespan handler for startup/shutdown resource management
  - All API v1 routers mounted under their respective prefixes
  - Health check endpoint at the root

Run with::

    uv run uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, vision, voice
from app.core.cache import close_redis, init_redis
from app.core.config import get_settings
from app.core.security import get_firebase_app
from app.services import sarvam_service

# ═══════════════════════════════════════════════════════════════════════════
# Logging
# ═══════════════════════════════════════════════════════════════════════════

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("echovision")


# ═══════════════════════════════════════════════════════════════════════════
# Lifespan — manages startup & shutdown
# ═══════════════════════════════════════════════════════════════════════════


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler.

    - **Startup**: Logs configuration summary.
    - **Shutdown**: Gracefully closes shared HTTP clients.
    """
    settings = get_settings()
    logger.info("╔══════════════════════════════════════════════════════════╗")
    logger.info("║          EchoVision Backend — Starting Up               ║")
    logger.info("╠══════════════════════════════════════════════════════════╣")
    logger.info("║  Host       : %s", settings.host)
    logger.info("║  Port       : %s", settings.port)
    logger.info("║  Debug      : %s", settings.debug)
    logger.info("║  NVIDIA NIM : meta/llama-3.3-70b-instruct")
    logger.info("║  Sarvam URL : %s", settings.sarvam_base_url)
    logger.info("║  NVIDIA Key : %s", "✓ loaded" if settings.nvidia_api_key else "✗ MISSING")
    logger.info("║  Sarvam Key : %s", "✓ loaded" if settings.sarvam_api_key else "✗ MISSING")
    logger.info("╚══════════════════════════════════════════════════════════╝")

    # Startup: Initialize Cache and Firebase
    await init_redis()
    get_firebase_app()

    yield

    # Shutdown: close persistent HTTP clients and cache
    logger.info("Shutting down — closing HTTP clients and cache...")
    await sarvam_service.close_client()
    await close_redis()
    logger.info("EchoVision Backend shut down cleanly.")


# ═══════════════════════════════════════════════════════════════════════════
# Application Instance
# ═══════════════════════════════════════════════════════════════════════════

settings = get_settings()

app = FastAPI(
    title="EchoVision API",
    description=(
        "Accessibility platform backend providing voice intent classification, "
        "speech-to-text, text-to-speech, and AI-powered scene description "
        "for visually impaired users."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS Middleware ───────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount API Routers ────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(voice.router)
app.include_router(vision.router)


# ═══════════════════════════════════════════════════════════════════════════
# Health Check
# ═══════════════════════════════════════════════════════════════════════════


@app.get(
    "/",
    tags=["Health"],
    summary="Health check",
    description="Returns a simple status message confirming the API is running.",
)
async def health_check() -> dict[str, str]:
    """Root health check endpoint."""
    return {
        "status": "healthy",
        "service": "EchoVision API",
        "version": "1.0.0",
    }


@app.get(
    "/health",
    tags=["Health"],
    summary="Detailed health check",
    description="Returns detailed health status including configuration state.",
)
async def detailed_health_check() -> dict[str, object]:
    """Detailed health check with configuration status."""
    current_settings = get_settings()
    return {
        "status": "healthy",
        "service": "EchoVision API",
        "version": "1.0.0",
        "config": {
            "nvidia_key_loaded": bool(current_settings.nvidia_api_key),
            "sarvam_key_loaded": bool(current_settings.sarvam_api_key),
            "debug": current_settings.debug,
        },
    }
