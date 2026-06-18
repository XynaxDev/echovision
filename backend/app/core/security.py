"""
EchoVision Backend — Security Layer

Provides a ``get_current_user`` FastAPI dependency that verifies Firebase
Authentication JWTs sent by the mobile app in the Authorization header.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated

import firebase_admin
from fastapi import Header, HTTPException, status
from firebase_admin import auth, credentials

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Firebase App Initialization (Lazy Singleton)
# ---------------------------------------------------------------------------
_firebase_app: firebase_admin.App | None = None


def get_firebase_app() -> firebase_admin.App:
    global _firebase_app
    if _firebase_app is None:
        try:
            # Prevent double initialization if already loaded in context
            _firebase_app = firebase_admin.get_app()
        except ValueError:
            settings = get_settings()
            cred_path = Path(settings.firebase_credentials_path)

            if not cred_path.is_absolute():
                cred_path = Path(__file__).resolve().parent.parent.parent / cred_path

            if not cred_path.exists():
                logger.warning(
                    f"Firebase credentials not found at {cred_path}. "
                    "Auth will fail unless application default credentials are used."
                )
                _firebase_app = firebase_admin.initialize_app()
            else:
                cred = credentials.Certificate(str(cred_path))
                _firebase_app = firebase_admin.initialize_app(cred)
                logger.info("Firebase Admin SDK initialized successfully.")

    return _firebase_app


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class CurrentUser:
    """Represents the authenticated user context from Firebase."""

    uid: str
    phone_number: str | None = None
    email: str | None = None
    display_name: str | None = None
    roles: set[str] = field(default_factory=set)


async def get_current_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> CurrentUser:
    """
    Resolve and verify the current user from the incoming Firebase JWT.

    Raises 401 Unauthorized if the token is missing, malformed, or invalid.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Must be Bearer.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]

    # Ensure Firebase is initialized
    get_firebase_app()

    try:
        # verify_id_token is synchronous and makes a network request to Google's cert endpoint
        # if the certs are not cached. By default, it caches them for 1 hour.
        decoded_token = auth.verify_id_token(token)
    except auth.ExpiredIdTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.InvalidIdTokenError as e:
        logger.error(f"Invalid auth token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Firebase token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Return the populated user object based on the JWT claims
    return CurrentUser(
        uid=decoded_token.get("uid"),
        phone_number=decoded_token.get("phone_number"),
        email=decoded_token.get("email"),
        display_name=decoded_token.get("name"),
    )
