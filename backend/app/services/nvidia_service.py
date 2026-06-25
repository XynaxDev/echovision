"""
EchoVision Backend — NVIDIA NIM API Service

Provides async wrappers around the NVIDIA API Catalog for:
  1. Intent classification / Conversational Brain via Llama 3.3 70B
  2. Scene description generation via Llama 3.2 11B Vision

All network calls use the official `openai` SDK pointing to NVIDIA's base URL.
"""

from __future__ import annotations

import json
import logging
import re

from openai import AsyncOpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# Module-level SDK initialization
# ═══════════════════════════════════════════════════════════════════════════

_settings = get_settings()

_client = AsyncOpenAI(
    base_url="https://integrate.api.nvidia.com/v1", api_key=_settings.nvidia_api_key
)

_TEXT_MODEL = "meta/llama-3.1-8b-instruct"
_VISION_MODEL = "meta/llama-3.2-11b-vision-instruct"

# ═══════════════════════════════════════════════════════════════════════════
# Conversational Brain (Intent Classification & Text Response)
# ═══════════════════════════════════════════════════════════════════════════

_INTENT_SYSTEM_PROMPT = """You are "EchoVision AI", a helpful, empathetic, and intelligent voice assistant built for the EchoVision app. You help visually impaired users navigate the app and use its features. If a user asks who you are or what you can do, proudly state your identity and mention you can help with Scene Scanning, Text Reading, Emergency SOS, routing, and app settings.

Given a transcribed voice command from the user, classify it into EXACTLY ONE of the following navigation targets:

- "SceneScanner"   → User wants to scan their surroundings, see what's in front of them, describe a scene, or identify objects.
- "TextReader" → User wants to read text, read a document, read a sign, OCR, or identify written content.
- "SOS"       → User needs emergency help, wants to call someone, is in danger, feels unsafe, or needs urgent assistance.
- "Settings"  → User wants to open settings, change preferences, toggle haptics, change language, adjust app configuration, or change themes.
- "Dashboard" → User wants to go home, go to the main screen, see the dashboard.
- "None"      → User asks for general knowledge, conversational chatter, or wants an action executed.

RULES:
1. Respond with ONLY a valid JSON object matching this exact schema:
   {
      "target": "<value>",
      "action": "<optional_system_action>",
      "destination": "<optional_destination_for_routing>",
      "replyText": "<reply_to_speak>"
   }
   - If the user wants a SYSTEM ACTION (like turning off haptics, changing language), include: "action": "<action_name>"
   - Valid actions: toggle_flashlight, toggle_haptics_off, toggle_haptics_on, set_language_english, set_language_hindi, toggle_dark_mode, toggle_light_mode, calculate_distance, start_navigation, turn_off_assistant
   - If the user asks to shut down, stop listening, or turn off the assistant, set "action": "turn_off_assistant", "target": "None".
   - If the user asks for the distance to a place, or how far a place is, set "action": "calculate_distance", "target": "None", and set "destination" to the EXACT place name (e.g. "police station", "home").
   - If the user asks to guide them to a place, or navigate to a place, set "action": "start_navigation", "target": "None", and set "destination" to the EXACT place name.
   - If the user asks who you are or what you can do, set "target": "None" and provide a polite, helpful introduction in "replyText".
2. The target value MUST be exactly one of: SceneScanner, TextReader, SOS, Dashboard, Settings, None, CONFIRM_SOS
6. If the user is answering "yes", "haan", or "confirm" in response to an SOS confirmation prompt, set "action": "CONFIRM_SOS", "target": "CONFIRM_SOS" and do NOT generate conversational text.
7. If the user is answering "no", "cancel", "turn off sos" or "band karo" in response to an SOS prompt, set "action": "CANCEL_SOS", "target": "CANCEL_SOS" and do NOT generate conversational text.
8. Do NOT include any explanation, markdown formatting, or extra text. ONLY raw JSON.
9. CONVERSATIONAL RULE: You are a friendly AI. If the user asks a general question, greets you, or says something off-topic, politely and concisely respond to them in `replyText` and set target="None". Do not say "Sorry I didn't get it" unless the input is complete gibberish.
10. For Hindi/Hinglish responses, ALWAYS use the male persona (e.g., use 'raha hu' instead of 'rahi hu', 'karunga' instead of 'karungi').

11. If the user asks to trigger SOS or emergency, set "target": "SOS" and in "replyText" ALWAYS ask the user for confirmation (e.g., "Are you sure you want to trigger SOS? Say yes to confirm or cancel to abort.").

Examples:
- "mujhe scene dikhao" → {"target": "SceneScanner", "replyText": "Opening Scanner"}
- "who are you?" → {"target": "None", "replyText": "I am EchoVision AI, here to help you navigate and explore the world."}
- "settings kholo" → {"target": "Settings", "replyText": "Opening Settings"}
- "call sos" → {"target": "SOS", "replyText": "क्या आप वाकई SOS चालू करना चाहते हैं? पुष्टि करने के लिए हाँ बोलें, या रद्द करने के लिए मना करें।"}
"""

_VALID_TARGETS = {"SceneScanner", "TextReader", "SOS", "Dashboard", "Settings", "None", "CONFIRM_SOS", "CANCEL_SOS"}


async def generate_text_response(
    text: str,
    language: str = "hindi",
    username: str | None = None,
    is_first_message: bool = False,
    home_location: str | None = None,
    current_location: str | None = None,
) -> dict:
    """Classify a Hinglish voice command and generate a text response.

    Parameters
    ----------
    text:
        The transcribed user voice command in Hinglish.

    Returns
    -------
    dict
        ``{"target": str, "action": str | None, "replyText": str | None}``

    Raises
    ------
    ValueError
        If NVIDIA NIM returns an unparseable or invalid response.
    """
    logger.info("Generating text response for: %s", text[:100])

    lang_rules = {
        "english": "CRITICAL: You MUST generate the `replyText` ONLY in clean, conversational English.",
        "hindi": "CRITICAL: You are FORBIDDEN from using English words in the `replyText`. You MUST write it strictly in conversational Hindi using actual Devanagari script. IMPORTANT: You MUST use male pronouns/verbs (e.g. 'मैं आपकी मदद कर रहा हूँ', NOT 'कर रही हूँ'). CRITICAL GRAMMAR: Always use 'मैंने' instead of 'मैं' when using past tense transitive verbs (e.g., 'मैंने SOS चालू कर दिया है' NOT 'मैं SOS चालू कर दिया है').",
        "hinglish": "CRITICAL: You MUST generate the `replyText` ONLY in Hinglish (Hindi written in English alphabet). Do NOT use Devanagari. IMPORTANT: You MUST use male pronouns/verbs (e.g. 'Main aapki madad kar raha hoon', NOT 'kar rahi hoon'). CRITICAL GRAMMAR: Always use 'maine' instead of 'main' for past tense transitive verbs (e.g., 'maine SOS chalu kar diya hai' NOT 'main SOS chalu kar diya hai').",
    }
    lang_instruction = lang_rules.get(language.lower(), lang_rules["hindi"])

    greeting_instruction = ""
    if is_first_message and username:
        greeting_instruction = f"\n6. The user's name is {username}. You MUST start your response by greeting them warmly by name."

    location_instruction = ""
    if home_location or current_location:
        location_instruction = f"\n7. LOCATION CONTEXT: The user's current location is '{current_location or 'Unknown'}'. The user's saved home location is '{home_location or 'Unknown'}'. If the user asks about distances or their current location, use this information to respond naturally. To trigger actual distance calculation, you must set action='calculate_distance' and destination='[Destination]'."

    system_prompt = f"{_INTENT_SYSTEM_PROMPT}\n\n5. {lang_instruction}{greeting_instruction}{location_instruction}"

    try:
        response = await _client.chat.completions.create(
            model=_TEXT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=256,
        )
    except Exception as e:
        logger.exception("NVIDIA text generation failed: %s", e)
        raise e

    raw_text = response.choices[0].message.content.strip()

    logger.debug("NVIDIA raw response: %s", raw_text)

    # Parse the JSON response
    cleaned = raw_text
    if "```" in cleaned:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1)

    action = None
    reply_text = None
    try:
        parsed = json.loads(cleaned)
        target = parsed.get("target", "Dashboard")
        action = parsed.get("action", None)
        reply_text = parsed.get("replyText", None)
    except (json.JSONDecodeError, AttributeError):
        logger.warning("Failed to parse JSON response: %s", raw_text)
        target = "Dashboard"
        for valid_target in _VALID_TARGETS:
            if valid_target.lower() in raw_text.lower():
                target = valid_target
                break

    if target not in _VALID_TARGETS:
        logger.warning("Invalid target '%s', defaulting to Dashboard", target)
        target = "Dashboard"

    logger.info("NVIDIA Response: target=%s action=%s", target, action)
    return {"target": target, "action": action, "replyText": reply_text}


# ═══════════════════════════════════════════════════════════════════════════
# Scene Description (Vision)
# ═══════════════════════════════════════════════════════════════════════════


def get_scene_prompt(language: str = "hindi") -> str:
    lang_rules = {
        "english": "You MUST write the response ONLY in clean, conversational English. Start the description exactly with: 'In the captured photo, '",
        "hindi": "CRITICAL: You MUST write the response ONLY in conversational Hindi using Devanagari script. Do NOT use English. Start the description exactly with: 'ली गई तस्वीर में, '",
        "hinglish": "CRITICAL: You MUST write the response ONLY in Hinglish (Hindi written in English alphabet). Do NOT use Devanagari. Start the description exactly with: 'Li gayi tasveer me, '",
    }
    lang_instruction = lang_rules.get(language.lower(), lang_rules["hindi"])

    return f"""You are a professional scene description assistant for visually impaired users.

Given a photo taken by a phone camera, describe what is visible clearly and accurately.

RULES:
1. Maximum 4 short sentences. Be direct, precise, and comprehensive. Provide a clear mental image.
2. {lang_instruction}
3. NEVER use "left" or "right" (or "बाएं" / "दाएं"). Phone cameras mirror directions. Use terms like "in the foreground", "in the background", "in the center", "towards the edge", "next to".
4. ONLY describe what you can CLEARLY see. DO NOT GUESS or make assumptions about blurry objects, contexts, or things outside the frame. If you are not 100% sure what an object is, do not name it specifically.
5. Do NOT use markdown, bullet points, or technical jargon.
6. Respond with ONLY the description text — no JSON, no labels.
"""


async def scan_scene_with_nvidia(
    image_base64: str, mime_type: str = "image/jpeg", language: str = "hindi"
) -> str:
    """Generate a Hindi/Hinglish scene description from a base64-encoded image using Llama Vision.

    Parameters
    ----------
    image_base64:
        Raw base64 string of the image (no data URI prefix).
    mime_type:
        The MIME type of the image (default: ``image/jpeg``).

    Returns
    -------
    str
        A natural spoken description of the scene.
    """
    logger.info("Generating scene description via NVIDIA (mime_type=%s)", mime_type)

    data_uri = f"data:{mime_type};base64,{image_base64}"
    scene_prompt = get_scene_prompt("english")

    try:
        response = await _client.chat.completions.create(
            model=_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": scene_prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            temperature=0.5,
            max_tokens=256,
        )
    except Exception as e:
        logger.exception("NVIDIA vision scan failed: %s", e)
        raise e

    english_description = response.choices[0].message.content.strip()

    # Step 2: Translate if the user requested a non-English language
    if language.lower() != "english":
        lang_rules = {
            "hindi": "CRITICAL: You are FORBIDDEN from using English words. Translate the text strictly into conversational Hindi using actual Devanagari script.",
            "hinglish": "CRITICAL: Translate the text strictly into Hinglish (Hindi written in English alphabet). Do NOT use Devanagari.",
        }
        lang_instruction = lang_rules.get(language.lower(), lang_rules["hindi"])

        try:
            trans_response = await _client.chat.completions.create(
                model=_TEXT_MODEL,
                messages=[
                    {"role": "system", "content": f"You are a strict translation engine. Translate to {language}. {lang_instruction} NO CONVERSATIONAL FILLER. Output ONLY the translated text."},
                    {"role": "user", "content": english_description}
                ],
                temperature=0.1,
                max_tokens=256,
            )
            description = trans_response.choices[0].message.content.strip()
        except Exception as e:
            logger.exception("NVIDIA translation failed: %s", e)
            description = english_description
    else:
        description = english_description

    # Ensure we don't exceed 3 sentences
    import re
    sentences = re.split(r"(?<=[।.!?])\s+", description)
    if len(sentences) > 3:
        description = " ".join(sentences[:3])
        if not description.endswith((".", "।", "!", "?")):
            description += "।"

    logger.info("Scene description generated: %s", description[:100])
    return description

from typing import AsyncGenerator

async def translate_sentence(english_sentence: str, language: str) -> str:
    lang_rules = {
        "hindi": "CRITICAL: You are FORBIDDEN from using English words or Latin alphabet letters. Translate the text strictly into conversational Hindi using actual pure Devanagari script. Ensure male pronouns/verbs are used. Do NOT output Hinglish.",
        "hinglish": "CRITICAL: Translate the text strictly into Hinglish (Hindi written in English alphabet). Do NOT use Devanagari. Ensure male pronouns/verbs are used.",
    }
    lang_instruction = lang_rules.get(language.lower(), lang_rules["hindi"])
    
    try:
        res = await _client.chat.completions.create(
            model=_TEXT_MODEL,
            messages=[
                {"role": "system", "content": f"You are a strict translation engine. Translate to {language}. {lang_instruction} NO CONVERSATIONAL FILLER. Output ONLY the translated text."},
                {"role": "user", "content": english_sentence}
            ],
            temperature=0.1,
            max_tokens=128,
        )
        return res.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return english_sentence

async def stream_scene_with_nvidia(
    image_base64: str, mime_type: str = "image/jpeg", language: str = "hindi"
) -> AsyncGenerator[str, None]:
    """Stream a Hindi/Hinglish scene description chunk by chunk from a base64-encoded image."""
    logger.info("Streaming scene description via NVIDIA (mime_type=%s)", mime_type)

    data_uri = f"data:{mime_type};base64,{image_base64}"
    scene_prompt = get_scene_prompt("english")

    try:
        response = await _client.chat.completions.create(
            model=_VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": scene_prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            temperature=0.5,
            max_tokens=256,
            stream=True
        )
        
        buffer = ""
        sentence_count = 0
        async for chunk in response:
            token = chunk.choices[0].delta.content
            if token:
                buffer += token
                if any(punct in token for punct in [".", "?", "!", "\n"]):
                    sentence = buffer.strip()
                    if sentence:
                        sentence_count += 1
                        if language.lower() == "english":
                            yield sentence
                        else:
                            translated = await translate_sentence(sentence, language)
                            yield translated
                        
                        if sentence_count >= 3:
                            break
                    buffer = ""
                    
        if buffer.strip() and sentence_count < 3:
            sentence = buffer.strip()
            if language.lower() == "english":
                yield sentence
            else:
                translated = await translate_sentence(sentence, language)
                yield translated
                
    except Exception as e:
        logger.exception("NVIDIA vision stream failed: %s", e)
        raise e

# ═══════════════════════════════════════════════════════════════════════════
# OCR Formatting (Vision)
# ═══════════════════════════════════════════════════════════════════════════

async def format_ocr_text(raw_text: str) -> dict:
    """Clean raw OCR text and detect its language using NVIDIA Llama.

    Parameters
    ----------
    raw_text:
        Raw, unformatted text from ML Kit.

    Returns
    -------
    dict
        A dictionary with ``cleaned_text`` and ``language_code`` ('hi-IN' or 'en-IN').
    """
    logger.info("Formatting OCR text via NVIDIA")
    
    system_prompt = '''You are a text cleanup and language detection assistant.
The user provides raw OCR text extracted from an image.
YOUR TASK:
1. Clean the text: fix obvious typos, remove random garbage characters, and combine broken lines into proper sentences.
2. Detect language: If the text is predominantly Hindi or Devanagari, the language_code is "hi-IN". Otherwise, it is "en-IN".
3. Return ONLY a JSON object and absolutely no other text.
Format: { "cleaned_text": "...", "language_code": "..." }'''

    try:
        response = await _client.chat.completions.create(
            model=_TEXT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": raw_text[:2000]} # Limit input length
            ],
            temperature=0.1,
            max_tokens=512,
        )
        
        raw_response = response.choices[0].message.content.strip()
        
        # Clean JSON if wrapped in markdown
        cleaned = raw_response
        if "```" in cleaned:
            import re
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1)
                
        import json
        parsed = json.loads(cleaned)
        
        cleaned_text = parsed.get("cleaned_text", raw_text).strip()
        language_code = parsed.get("language_code", "en-IN")
        
        if language_code not in ["hi-IN", "en-IN"]:
            language_code = "en-IN"
            
        # Ensure we don't return an excessively long text that breaks TTS (5000 chars is fine for TTS limits if chunked)
        return {
            "cleaned_text": cleaned_text[:2500],
            "language_code": language_code
        }
    except Exception as e:
        logger.error("Failed to format OCR text: %s", e)
        # Fallback to raw text and default to english
        return {
            "cleaned_text": raw_text[:2500],
            "language_code": "en-IN"
        }
