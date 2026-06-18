"""
EchoVision Backend — Sarvam AI Service

Provides async wrappers around the Sarvam AI REST API for:
  1. Speech-to-Text (STT) — converts audio binary to transcribed text.
  2. Text-to-Speech (TTS) — converts text to audio binary stream.

All external HTTP calls use async ``httpx`` to prevent blocking the
FastAPI event loop.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import wave

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# Module-level configuration
# ═══════════════════════════════════════════════════════════════════════════

_settings = get_settings()

_SARVAM_HEADERS = {
    "api-subscription-key": _settings.sarvam_api_key,
}

_STT_URL = f"{_settings.sarvam_base_url}/speech-to-text"
_TTS_URL = f"{_settings.sarvam_base_url}/text-to-speech"

# Shared async HTTP client — reuses connections across requests
_http_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    """Lazy-initialize and return the shared async HTTP client."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
        )
    return _http_client


async def close_client() -> None:
    """Gracefully close the shared HTTP client.

    Should be called during application shutdown (e.g., in a FastAPI
    lifespan handler).
    """
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None
        logger.info("Sarvam HTTP client closed.")


# ═══════════════════════════════════════════════════════════════════════════
# Speech-to-Text
# ═══════════════════════════════════════════════════════════════════════════


async def speech_to_text(
    audio_data: bytes,
    language_code: str = "hi-IN",
    model: str = "saarika:v2",
) -> dict[str, str]:
    """Transcribe audio binary data using Sarvam AI STT.

    Parameters
    ----------
    audio_data:
        Raw audio bytes (WAV, MP3, or similar format supported by Sarvam).
    language_code:
        BCP-47 language code for the expected audio language.
    model:
        Sarvam AI STT model identifier.

    Returns
    -------
    dict
        Dictionary with ``"transcript"`` and ``"language_code"`` keys.

    Raises
    ------
    httpx.HTTPStatusError
        If the Sarvam API returns a non-2xx response.
    """
    client = await _get_client()

    logger.info(
        "Sarvam STT request: %d bytes, lang=%s, model=%s",
        len(audio_data),
        language_code,
        model,
    )

    # Sarvam expects the audio as a file upload in multipart form
    audio_base64 = base64.b64encode(audio_data).decode("utf-8")

    payload = {
        "input": audio_base64,
        "language_code": language_code,
        "model": model,
        "with_timestamps": False,
    }

    response = await client.post(
        _STT_URL,
        json=payload,
        headers={
            **_SARVAM_HEADERS,
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()

    data = response.json()
    logger.info("Sarvam STT response: %s", str(data)[:200])

    transcript = data.get("transcript", "")
    detected_language = data.get("language_code", language_code)

    return {
        "transcript": transcript,
        "language_code": detected_language,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Text-to-Speech
# ═══════════════════════════════════════════════════════════════════════════


async def text_to_speech(
    text: str,
    language_code: str = "hi-IN",
    speaker: str = "ashutosh",
    model: str = "bulbul:v3",
) -> bytes:
    """Synthesize speech audio from text using Sarvam AI TTS.

    Parameters
    ----------
    text:
        The text content to synthesize into speech.
    language_code:
        BCP-47 language code for TTS voice selection.
    speaker:
        Sarvam AI speaker voice identifier.
    model:
        Sarvam AI TTS model identifier.

    Returns
    -------
    bytes
        Raw audio bytes (WAV format) of the synthesized speech.

    Raises
    ------
    httpx.HTTPStatusError
        If the Sarvam API returns a non-2xx response.
    """
    client = await _get_client()

    logger.info(
        "Sarvam TTS request: %d chars, lang=%s, speaker=%s",
        len(text),
        language_code,
        speaker,
    )

    # Sarvam has a 500 char limit. We must chunk the text.

    sentences = re.split(r"(?<=[.!?|।])\s+", text)
    chunks = []
    current_chunk = ""
    for s in sentences:
        if len(current_chunk) + len(s) < 400:
            current_chunk += " " + s if current_chunk else s
        else:
            if current_chunk:
                chunks.append(current_chunk)
            if len(s) > 400:
                for i in range(0, len(s), 400):
                    chunks.append(s[i : i + 400])
                current_chunk = ""
            else:
                current_chunk = s
    if current_chunk:
        chunks.append(current_chunk)

    wav_bytes_list = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        payload = {
            "inputs": [chunk],
            "target_language_code": language_code,
            "speaker": speaker,
            "model": model,
            "enable_preprocessing": True,
        }

        response = await client.post(
            _TTS_URL,
            json=payload,
            headers={
                **_SARVAM_HEADERS,
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()

        data = response.json()
        audios = data.get("audios", [])
        if audios:
            audio_base64 = audios[0]
            wav_bytes_list.append(base64.b64decode(audio_base64))

    if not wav_bytes_list:
        raise RuntimeError("Sarvam TTS returned no audio data.")

    if len(wav_bytes_list) == 1:
        return wav_bytes_list[0]

    # Concatenate WAV bytes safely
    out_io = io.BytesIO()
    try:
        first_wav = wave.open(io.BytesIO(wav_bytes_list[0]), "rb")
        params = first_wav.getparams()
        out_wav = wave.open(out_io, "wb")
        out_wav.setparams(params)
        out_wav.writeframes(first_wav.readframes(first_wav.getnframes()))

        for wav_bytes in wav_bytes_list[1:]:
            try:
                w = wave.open(io.BytesIO(wav_bytes), "rb")
                out_wav.writeframes(w.readframes(w.getnframes()))
            except Exception as e:
                logger.error("Failed to concatenate wav chunk: %s", e)
        out_wav.close()
    except Exception as e:
        logger.error("WAV concatenation failed: %s", e)
        return wav_bytes_list[0]

    final_bytes = out_io.getvalue()
    logger.info("Sarvam TTS: decoded %d total audio bytes", len(final_bytes))
    return final_bytes
