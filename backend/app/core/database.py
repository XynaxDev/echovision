"""
EchoVision Backend — Database Layer

Provides a Firestore client singleton and asynchronous helper methods to
interact with Firebase Firestore. We run synchronous Firebase operations
inside a threadpool to prevent blocking the FastAPI event loop.
"""

from __future__ import annotations

import asyncio
from typing import Any

from firebase_admin import firestore
from google.cloud.firestore import Client

from app.core.security import get_firebase_app

_db_client: Client | None = None


def get_db() -> Client:
    """Get or initialize the Firestore client."""
    global _db_client
    if _db_client is None:
        # Ensure firebase is initialized first
        app = get_firebase_app()
        _db_client = firestore.client(app=app)
    return _db_client


async def get_user_profile(uid: str) -> dict[str, Any] | None:
    """Fetch a user's profile from Firestore asynchronously."""
    db = get_db()

    def _fetch() -> dict[str, Any] | None:
        doc_ref = db.collection("users").document(uid)
        doc = doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None

    return await asyncio.to_thread(_fetch)


async def update_user_profile(uid: str, data: dict[str, Any]) -> None:
    """Create or update a user's profile in Firestore asynchronously."""
    db = get_db()

    def _update() -> None:
        doc_ref = db.collection("users").document(uid)
        doc_ref.set(data, merge=True)

    await asyncio.to_thread(_update)
