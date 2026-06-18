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
   - Valid actions: toggle_haptics_off, toggle_haptics_on, set_language_english, set_language_hindi, toggle_dark_mode, toggle_light_mode, calculate_distance, start_navigation, turn_off_assistant
   - If the user asks to shut down, stop listening, or turn off the assistant, set "action": "turn_off_assistant", "target": "None".
   - If the user asks for the distance to a place, or how far a place is, set "action": "calculate_distance", "target": "None", and set "destination" to the EXACT place name (e.g. "police station", "home").
   - If the user asks to guide them to a place, or navigate to a place, set "action": "start_navigation", "target": "None", and set "destination" to the EXACT place name.
   - If the user asks who you are or what you can do, set "target": "None" and provide a polite, helpful introduction in "replyText".
2. The target value MUST be exactly one of: SceneScanner, TextReader, SOS, Dashboard, Settings, None
3. Do NOT include any explanation, markdown formatting, or extra text. ONLY raw JSON.
4. CONVERSATIONAL RULE: You are a friendly AI. If the user asks a general question, greets you, or says something off-topic, politely and concisely respond to them in `replyText` and set target="None". Do not say "Sorry I didn't get it" unless the input is complete gibberish.
5. For Hindi/Hinglish responses, ALWAYS use the male persona (e.g., use 'raha hu' instead of 'rahi hu', 'karunga' instead of 'karungi').

Examples:
- "mujhe scene dikhao" → {"target": "SceneScanner", "replyText": "Opening Scanner"}
- "who are you?" → {"target": "None", "replyText": "I am EchoVision AI, here to help you navigate and explore the world."}
- "settings kholo" → {"target": "Settings", "replyText": "Opening Settings"}
"""

_VALID_TARGETS = {"SceneScanner", "TextReader", "SOS", "Dashboard", "Settings", "None"}


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
        "hindi": "CRITICAL: You are FORBIDDEN from using English words in the `replyText`. You MUST write it strictly in conversational Hindi using actual Devanagari script. IMPORTANT: You MUST use male pronouns/verbs (e.g. 'मैं आपकी मदद कर रहा हूँ', NOT 'कर रही हूँ').",
        "hinglish": "CRITICAL: You MUST generate the `replyText` ONLY in Hinglish (Hindi written in English alphabet). Do NOT use Devanagari. IMPORTANT: You MUST use male pronouns/verbs (e.g. 'Main aapki madad kar raha hoon', NOT 'kar rahi hoon').",
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


def get_scene_prompt() -> str:
    return """You are a helpful scene description assistant for visually-impaired users of the EchoVision app.

Given an image, provide a descriptive scene summary that a blind person would find extremely useful.

RULES:
1. Describe the scene in a maximum of 3 sentences.
2. You MUST write the response ONLY in English. Do NOT use any other language.
3. Focus on the most important and safety-relevant details first (obstacles, people, vehicles, etc.).
4. Do NOT use technical jargon, markdown, bullet points, or formal language.
5. Respond with ONLY the description text — no JSON, no labels, no prefixes. Do NOT refuse to describe the image.
6. CRITICAL: Do NOT use conversational filler like "Here is a concise summary of the scene" or "The image depicts". Just start directly describing the scene (e.g. "The image shows...", or simply "There is a...").
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
    scene_prompt = get_scene_prompt()

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

        translation_prompt = f"""You are an expert translator for a visually-impaired user's accessibility app.
Translate the following scene description into the requested language.
{lang_instruction}

Description to translate:
"{english_description}"

Return ONLY the translated text. No quotes, no markdown, no prefixes."""

        try:
            trans_response = await _client.chat.completions.create(
                model=_TEXT_MODEL,
                messages=[{"role": "user", "content": translation_prompt}],
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
