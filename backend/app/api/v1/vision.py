"""
EchoVision Backend — Vision API Routes (v1)

Endpoints:
  - POST /api/v1/vision/scan → Scene description from base64 image via NVIDIA Llama 3.2 11B Vision
"""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.cache import get_cache, set_cache
from app.core.security import CurrentUser, get_current_user
from app.schemas.vision import ScanRequest, ScanResponse, FormatOCRRequest, FormatOCRResponse
from app.services import nvidia_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/vision", tags=["Vision"])


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/vision/scan
# ═══════════════════════════════════════════════════════════════════════════


@router.post(
    "/scan",
    response_model=ScanResponse,
    summary="Describe a scene from an image",
    description=(
        "Accepts a base64-encoded image string, prompts NVIDIA Llama 3.2 Vision for "
        "a descriptive scene summary in natural spoken Hindi/Hinglish "
        "(maximum 3 sentences), and returns the raw text string."
    ),
)
async def scan_scene(
    body: ScanRequest,
    user: CurrentUser = Depends(get_current_user),
) -> ScanResponse:
    """Analyze an image and produce a Hindi/Hinglish scene description.

    The image should be sent as a raw base64 string (no ``data:`` URI prefix).
    The NVIDIA Llama vision model will analyze the image and produce a concise,
    spoken-style description suitable for text-to-speech playback.
    """
    logger.info(
        "Vision scan request from user=%s: %d base64 chars, mime=%s",
        user.uid,
        len(body.image_base64),
        body.mime_type,
    )

    # Basic validation — a minimal JPEG is at least ~100 base64 chars
    if len(body.image_base64) < 100:
        raise HTTPException(
            status_code=400,
            detail="Image data appears to be too small or malformed.",
        )

    # Guard against excessively large images (rough ~20 MB unencoded limit)
    if len(body.image_base64) > 27_000_000:
        raise HTTPException(
            status_code=413,
            detail="Image is too large. Maximum encoded size is ~20 MB.",
        )

    # Cache Check
    cache_key = f"vision:scan:{hashlib.sha256((body.image_base64 + body.language).encode('utf-8')).hexdigest()}"
    cached_data = await get_cache(cache_key)
    if cached_data and "description" in cached_data:
        logger.info("Vision scan cache hit for user=%s", user.uid)
        return ScanResponse(description=cached_data["description"])

    try:
        description = await nvidia_service.scan_scene_with_nvidia(
            image_base64=body.image_base64,
            mime_type=body.mime_type,
            language=body.language,
        )
    except Exception as exc:
        logger.exception("NVIDIA scene scan failed: %s", exc)
        error_str = str(exc).lower()
        if "429" in error_str or "quota" in error_str or "exhausted" in error_str:
            return ScanResponse(
                description="I'm sorry, I am experiencing high network traffic right now and cannot see the scene clearly. Please try again in a few moments.",
                confidence=1.0,
            )
        return ScanResponse(
            description="I'm having trouble connecting to my vision sensors right now. Please check your internet connection.",
            confidence=1.0,
        )

    logger.info("Vision scan result for user=%s: '%s'", user.uid, description[:100])

    # Store in cache for 1 hour
    await set_cache(cache_key, {"description": description}, expire_seconds=3600)

    return ScanResponse(description=description)

# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/vision/format-ocr
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/format-ocr",
    response_model=FormatOCRResponse,
    summary="Clean and detect language of OCR text",
    description="Uses NVIDIA Llama to clean up OCR text and detect if it is Hindi or English.",
)
async def format_ocr(
    body: FormatOCRRequest,
    user: CurrentUser = Depends(get_current_user),
) -> FormatOCRResponse:
    logger.info("Format OCR request from user=%s: %d chars", user.uid, len(body.raw_text))
    
    # Avoid unnecessary LLM calls for tiny strings
    if len(body.raw_text.strip()) < 2:
        return FormatOCRResponse(cleaned_text=body.raw_text, language_code="en-IN")
        
    result = await nvidia_service.format_ocr_text(body.raw_text)
    
    return FormatOCRResponse(
        cleaned_text=result["cleaned_text"],
        language_code=result["language_code"]
    )
