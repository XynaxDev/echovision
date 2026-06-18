"""
EchoVision Backend — Voice API Routes (v1)

Endpoints:
  - POST /api/v1/voice/intent  → Intent classification from Hinglish text
  - POST /api/v1/voice/stt     → Speech-to-Text via Sarvam AI
  - POST /api/v1/voice/tts     → Text-to-Speech via Sarvam AI
"""

from __future__ import annotations

import base64
import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from app.core.cache import get_cache, set_cache
from app.core.security import CurrentUser, get_current_user
from app.schemas.voice import IntentRequest, IntentResponse, STTResponse, TTSRequest
from app.services import deepgram_service, nvidia_service, sarvam_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/voice", tags=["Voice"])


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/voice/intent
# ═══════════════════════════════════════════════════════════════════════════


@router.post(
    "/intent",
    response_model=IntentResponse,
    summary="Conversational Loop & Intent Classification",
    description=(
        "Receives a transcribed Hinglish string and routes it to NVIDIA Llama 3.3 70B "
        "for intent classification and conversational text generation."
    ),
)
async def classify_voice_intent(
    body: IntentRequest,
    user: CurrentUser = Depends(get_current_user),
) -> IntentResponse:
    """Classify a transcribed Hinglish voice command and generate a text reply.

    The NVIDIA Llama model analyzes the text and returns a strict JSON response
    indicating which screen the user should be navigated to and a reply text for TTS.
    """
    logger.info("Intent request from user=%s: '%s'", user.uid, body.text[:80])

    cache_raw = f"{body.text}:{body.current_location}:{body.home_location}"
    cache_key = f"voice:intent:{hashlib.sha256(cache_raw.encode('utf-8')).hexdigest()}"
    cached_data = await get_cache(cache_key)
    if cached_data and "target" in cached_data:
        logger.info("Intent cache hit for user=%s", user.uid)
        return IntentResponse(target=cached_data["target"], action=cached_data.get("action"))

    try:
        result = await nvidia_service.generate_text_response(
            text=body.text,
            language=body.language,
            username=body.username,
            is_first_message=body.is_first_message,
            home_location=body.home_location,
            current_location=body.current_location,
        )
    except Exception as exc:
        logger.exception("NVIDIA text generation failed: %s", exc)
        error_str = str(exc).lower()
        if "429" in error_str or "quota" in error_str or "exhausted" in error_str:
            return IntentResponse(
                target="None",
                replyText="I am experiencing unusually high network traffic right now. Please try your request again in a few moments.",
                requiresResponse=False,
            )
        return IntentResponse(
            target="None",
            replyText="I'm having trouble processing your request due to a poor connection. Please try again.",
            requiresResponse=False,
        )

    target = result["target"]
    action = result.get("action")
    reply_text = result.get("replyText")

    logger.info("Intent result for user=%s: target=%s action=%s", user.uid, target, action)

    await set_cache(
        cache_key,
        {"target": target, "action": action, "replyText": reply_text},
        expire_seconds=86400,
    )

    return IntentResponse(target=target, action=action, replyText=reply_text)


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/voice/stt
# ═══════════════════════════════════════════════════════════════════════════


@router.post(
    "/stt",
    response_model=STTResponse,
    summary="Speech-to-Text via Sarvam AI",
    description=(
        "Accepts raw audio binary data in the request body and forwards it "
        "asynchronously to the Sarvam AI Speech-to-Text endpoint."
    ),
)
async def speech_to_text(
    request: Request,
    language: str = "hi",
    user: CurrentUser = Depends(get_current_user),
) -> STTResponse:
    """Convert uploaded audio binary data to transcribed text.

    The client should send the raw audio bytes as the request body
    with an appropriate Content-Type (e.g., ``audio/wav``, ``audio/m4a``).
    """
    audio_data = await request.body()

    if not audio_data:
        raise HTTPException(
            status_code=400,
            detail="Request body is empty. Send raw audio bytes.",
        )

    if len(audio_data) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(
            status_code=413,
            detail="Audio file too large. Maximum size is 10 MB.",
        )

    logger.info(
        "STT request from user=%s: %d bytes",
        user.uid,
        len(audio_data),
    )

    try:
        # 2. Transcribe Audio via Deepgram
        deepgram_lang = "en" if language.lower() == "english" else "hi"
        result = await deepgram_service.speech_to_text(audio_data, language=deepgram_lang)
        transcript = result.get("transcript", "")
        # language_code is available in result.get("language_code", "hi")
    except Exception as exc:
        logger.exception("Deepgram STT failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Speech-to-text service is temporarily unavailable.",
        ) from exc

    logger.info("STT result for user=%s: '%s'", user.uid, transcript[:80])
    return STTResponse(
        transcript=result["transcript"],
        language_code=result["language_code"],
    )


# ═══════════════════════════════════════════════════════════════════════════
# POST /api/v1/voice/tts
# ═══════════════════════════════════════════════════════════════════════════


@router.post(
    "/tts",
    summary="Text-to-Speech via Sarvam AI",
    description=(
        "Accepts a text string and returns the raw audio byte stream "
        "from the Sarvam AI Text-to-Speech endpoint."
    ),
    responses={
        200: {
            "content": {"audio/wav": {}},
            "description": "Raw WAV audio bytes of synthesized speech.",
        }
    },
)
async def text_to_speech(
    body: TTSRequest,
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Synthesize speech audio from the provided text string.

    Returns raw WAV audio bytes with ``Content-Type: audio/wav``.
    The client can play this directly or save it to a file.
    """
    logger.info(
        "TTS request from user=%s: '%s' (lang=%s, speaker=%s)",
        user.uid,
        body.text[:80],
        body.language_code,
        body.speaker,
    )

    cache_str = f"{body.text}:{body.language_code}:{body.speaker}:{body.model}"
    cache_key = f"voice:tts:{hashlib.sha256(cache_str.encode('utf-8')).hexdigest()}"

    cached_data = await get_cache(cache_key)
    if cached_data and "audio_b64" in cached_data:
        logger.info("TTS cache hit for user=%s", user.uid)
        audio_bytes = base64.b64decode(cached_data["audio_b64"])
    else:
        try:
            audio_bytes = await sarvam_service.text_to_speech(
                text=body.text,
                language_code=body.language_code,
                speaker=body.speaker,
                model=body.model,
            )
            # Cache the response for 24h
            await set_cache(
                cache_key,
                {"audio_b64": base64.b64encode(audio_bytes).decode("utf-8")},
                expire_seconds=86400,
            )
        except Exception as exc:
            logger.exception("Sarvam TTS failed: %s", exc)
            raise HTTPException(
                status_code=502,
                detail="Text-to-speech service is temporarily unavailable.",
            ) from exc

    logger.info("TTS response for user=%s: %d audio bytes", user.uid, len(audio_bytes))
    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": 'inline; filename="echovision_tts.wav"',
        },
    )
