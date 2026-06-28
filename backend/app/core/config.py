"""
EchoVision Backend — Application Configuration

Loads environment variables from .env and exposes them as typed settings.
Uses pydantic-style manual loading via python-dotenv for zero extra dependencies.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Locate and load the .env file from the backend root directory
# ---------------------------------------------------------------------------
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = _BACKEND_ROOT / ".env"
load_dotenv(dotenv_path=_ENV_PATH)


def _get_env(key: str, default: str | None = None, required: bool = False) -> str:
    """Retrieve an environment variable with optional enforcement."""
    value = os.getenv(key, default)
    if required and not value:
        raise RuntimeError(
            f"Missing required environment variable: {key}. "
            f"Copy .env.example to .env and fill in your keys."
        )
    return value or ""


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable application settings loaded once at startup."""

    # ── API Keys ──────────────────────────────────────────────────────────
    nvidia_api_key: str = field(default_factory=lambda: _get_env("NVIDIA_API_KEY", required=True))
    sarvam_api_key: str = field(default_factory=lambda: _get_env("SARVAM_API_KEY", required=True))

    # ── Server ────────────────────────────────────────────────────────────
    host: str = field(default_factory=lambda: _get_env("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(_get_env("PORT", "8000")))
    debug: bool = field(default_factory=lambda: _get_env("DEBUG", "false").lower() == "true")

    # ── Firebase & Redis ──────────────────────────────────────────────────
    firebase_credentials_path: str = field(
        default_factory=lambda: _get_env("FIREBASE_CREDENTIALS_PATH", "serviceAccountKey.json")
    )
    firebase_credentials_json: str = field(
        default_factory=lambda: _get_env("FIREBASE_CREDENTIALS_JSON", "")
    )
    redis_url: str = field(default_factory=lambda: _get_env("REDIS_URL", "redis://localhost:6379"))

    # ── External Service URLs ─────────────────────────────────────────────
    sarvam_base_url: str = "https://api.sarvam.ai"



    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: list[str] = field(default_factory=lambda: ["*"])


def get_settings() -> Settings:
    """Factory function that creates a fresh Settings instance.

    In production you'd cache this with ``@lru_cache``, but during development
    a fresh read on each import makes hot-reloading .env changes seamless.
    """
    return Settings()
