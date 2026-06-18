import logging
import os

import httpx

logger = logging.getLogger(__name__)

# Persistent client with connection pooling — avoids repeated TLS handshakes
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _client


async def speech_to_text(
    audio_data: bytes, language: str = "hi"
) -> dict:
    """
    Convert speech audio bytes into text using Deepgram's Nova-2 model.
    Uses a persistent httpx client with connection pooling for speed.
    """
    api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not api_key:
        raise ValueError("DEEPGRAM_API_KEY is not set in environment.")

    url = (
        f"https://api.deepgram.com/v1/listen"
        f"?model=nova-3&language={language}"
        f"&smart_format=true&punctuate=true"
    )

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "audio/wav",
    }

    logger.info(
        "Deepgram STT HTTP request: %d bytes, lang=%s",
        len(audio_data),
        language,
    )

    client = _get_client()

    # Retry up to 2 times on connection issues
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.post(
                url, content=audio_data, headers=headers
            )
            response.raise_for_status()
            data = response.json()
            break
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            logger.warning(
                "Deepgram attempt %d/%d timed out: %s",
                attempt + 1,
                3,
                exc,
            )
            if attempt == 2:
                raise last_exc  # type: ignore[misc]
        except httpx.HTTPStatusError:
            raise
    else:
        raise last_exc  # type: ignore[misc]

    # Extract transcript
    try:
        results = data["results"]["channels"][0]["alternatives"][0]
        transcript = results["transcript"]
        detected_language = language
    except (KeyError, IndexError, TypeError) as e:
        logger.error("Deepgram parsing error: %s. Response: %s", e, data)
        transcript = ""
        detected_language = language

    logger.info("Deepgram STT transcript length: %d chars", len(transcript))

    return {
        "transcript": transcript,
        "language_code": detected_language,
    }
