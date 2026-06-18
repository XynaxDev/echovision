"""
EchoVision Backend — Authentication API Routes (v1)

Endpoints:
  - POST /api/v1/auth/phone/verify  → Verifies phone token and creates Firestore user
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import update_user_profile
from app.core.security import CurrentUser, get_current_user
from app.schemas.auth import PhoneVerifyRequest, TokenResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/auth/phone/verify
# ═══════════════════════════════════════════════════════════════════════════


@router.post(
    "/phone/verify",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Verify Phone and commit User to Database",
    description="Validates that the authenticated Firebase session matches the provided phone number. On success, writes the profile to Firestore.",
)
async def verify_phone_auth(
    body: PhoneVerifyRequest,
    user: CurrentUser = Depends(get_current_user),
) -> TokenResponse:
    """
    The Strict Database Gate.
    The frontend has already verified the OTP via Firebase and sent the session token.
    We verify the token cryptographically and ensure the phone number matches.
    """
    # 1. Ensure the JWT actually contained a phone number (it should if they used Phone Auth)
    if not user.phone_number:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated session does not contain a verified phone number.",
        )

    # 2. Normalize and compare phone numbers
    token_phone = user.phone_number.replace(" ", "").replace("-", "")
    body_phone = body.phone_number.replace(" ", "").replace("-", "")

    # We allow exact matches or matches where the body lacks the country code for convenience
    if token_phone != body_phone and not token_phone.endswith(body_phone):
        logger.warning(f"Phone mismatch: Token({token_phone}) vs Body({body_phone})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The provided phone number does not match the authenticated session.",
        )

    # 3. Write strict metadata to Firestore
    try:
        await update_user_profile(
            uid=user.uid,
            data={"name": body.name, "phone": token_phone, "role": "user", "status": "verified"},
        )
    except Exception as e:
        logger.error(f"Failed to write user to DB: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database commit failed. Registration aborted.",
        )

    logger.info(f"Phone verification complete for {token_phone} (UID: {user.uid})")

    return TokenResponse(
        uid=user.uid, message="Phone verification successful. Welcome to EchoVision."
    )
