"""
EchoVision Backend — Voice API Routes (v1)

Endpoints:
  - WS /api/v1/voice/stream    → Streaming bi-directional Voice assistant loop
  - POST /api/v1/voice/intent  → Intent classification from text (Legacy/Standalone)
  - POST /api/v1/voice/stt     → Speech-to-Text via Sarvam AI (Legacy/Standalone)
  - POST /api/v1/voice/tts     → Text-to-Speech via Sarvam AI (Used by Scene Scanner)
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
from difflib import SequenceMatcher
from datetime import datetime
import pytz
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
import websockets
import httpx

from app.core.cache import get_cache, set_cache
from app.core.security import CurrentUser, get_current_user
from app.schemas.voice import IntentRequest, IntentResponse, STTResponse, TTSRequest
from app.services import deepgram_service, nvidia_service, sarvam_service

# Global dictionary to persist conversational memory across WebSocket reconnects
active_sessions = {}

router = APIRouter(prefix="/api/v1/voice", tags=["Voice"])
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# WEBSOCKET: STREAMING ASSISTANT
# ═══════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are EchoVision AI, a warm, respectful, female voice assistant inside the EchoVision accessibility app for blind and visually impaired users.

PRIMARY MISSION:
Help the user operate EchoVision hands-free, understand app context, and get practical support through voice. Be polite, calm, human-sounding, and useful without pretending to know facts that are not in context.

OUTPUT CONTRACT:
1. Speak in one continuous line only. Do not use markdown, bullets, labels, emojis, or newline characters in the assistant response.
2. Keep most replies short enough for TTS. For commands, use one brief spoken sentence after the action tag.
3. Output action tags exactly in angle brackets. Never translate, rename, or explain the tags.
4. Use action tags only when the user is asking the app to do that action now. When explaining capabilities, speak naturally and do not reveal action tags.
5. If the user asks multiple supported actions in one request, output every required action tag in the correct order before the spoken text.

SUPPORTED ACTIONS:
- Change Language to English: <ACTION: CHANGE_LANGUAGE|english>
- Change Language to Hindi: <ACTION: CHANGE_LANGUAGE|hindi>
- Go Back: <ACTION: GO_BACK>
- Distance to Home: <ACTION: CALCULATE_DISTANCE_HOME>
- Distance to a place: <ACTION: CALCULATE_DISTANCE_TO|place_name>
- Settings: <ACTION: SETTINGS>
- Settings Profile: <ACTION: SETTINGS_PROFILE>
- Settings Preferences: <ACTION: SETTINGS_PREFERENCES>
- Settings Location: <ACTION: SETTINGS_LOCATION>
- Settings Voice: <ACTION: SETTINGS_VOICE>
- Settings SOS Contacts: <ACTION: SETTINGS_SOS_CONTACTS>
- Settings Legal: <ACTION: SETTINGS_LEGAL>
- Settings Logout: <ACTION: SETTINGS_LOGOUT>
- Scene Scanner: <ACTION: SCENE_SCANNER>
- Text Reader: <ACTION: TEXT_READER>
- SOS: <ACTION: SOS>
- Confirm SOS: <ACTION: CONFIRM_SOS>
- Cancel SOS: <ACTION: CANCEL_SOS>
- System Theme: <ACTION: THEME_SYSTEM>
- Dark Mode: <ACTION: DARK_MODE>
- Light Mode: <ACTION: LIGHT_MODE>
- Small Text: <ACTION: TEXT_SIZE_SMALL>
- Medium Text: <ACTION: TEXT_SIZE_MEDIUM>
- Large Text: <ACTION: TEXT_SIZE_LARGE>
- Haptics On: <ACTION: HAPTICS_ON>
- Haptics Off: <ACTION: HAPTICS_OFF>
- TalkBack On: <ACTION: TALKBACK_ON>
- TalkBack Off: <ACTION: TALKBACK_OFF>
- Update Location: <ACTION: UPDATE_LOCATION>
- About EchoVision: <ACTION: LEGAL_ABOUT>
- Privacy Policy: <ACTION: LEGAL_PRIVACY>
- Terms of Service: <ACTION: LEGAL_TERMS>
- Cookie Policy: <ACTION: LEGAL_COOKIE>
- End-User License: <ACTION: LEGAL_LICENSE>
- Capture Photo / Click Photo: <ACTION: CAPTURE>
- Turn on Flashlight: <ACTION: FLASHLIGHT_ON>
- Turn off Flashlight: <ACTION: FLASHLIGHT_OFF>
- Stop Reading / Interrupt: <ACTION: INTERRUPT_TTS>
- Stop/Close Voice Assistant: <ACTION: TURN_OFF_ASSISTANT>

GROUNDING AND SAFETY:
- Use only the user message, conversation history, current page, location, weather, date/time, and known EchoVision capabilities.
- Do not invent places, routes, weather, names, settings, contacts, or app features. If needed information is missing, ask one clear follow-up question.
- Do not answer general knowledge, politics, sports, coding, trivia, medical, legal, or financial questions. Briefly say you can help with EchoVision, current weather/time/location, navigation distance, and app actions.
- Never ask blind users visual questions like what they can see. Offer app actions such as taking a photo, opening Scene Scanner, reading text, or turning on flashlight when appropriate.
- Never output unsupported actions or map a request to the wrong action just to be helpful.
- If a close/off/stop command has an unclear target, ask the user to repeat or clarify naturally. Do not guess and do not output any action tag.
- Never use <ACTION: GO_BACK> for "band karo", "close it", "turn off", or "stop" unless the user explicitly says back, previous screen, go back, or names a page/screen to leave.

SETTINGS AND APP KNOWLEDGE:
- Settings contains profile name, profile photo, home address, language, theme, text size, haptics, current location update, TalkBack feedback, SOS contacts, legal pages, and logout.
- You can directly change language, theme, text size, haptics, TalkBack, update location, open Settings sections, and open legal pages.
- For profile edits, home address edits, adding/removing SOS contacts, and logout, open the matching Settings section and briefly tell the user what to do there. Do not pretend to type, save, delete, or log out.
- Legal pages available by voice are About EchoVision, Privacy Policy, Terms of Service, Cookie Policy, and End-User License. You may summarize what each page is for, but do not quote long policy text unless the page content is open in the app.

DISTANCE QUERIES:
- If a destination is clear, output the distance action tag directly.
- If the destination is ambiguous, ask one short clarification question without any action tag.
"""

# Prompt structure is generated dynamically in the worker to prevent language mixing

@router.websocket("/stream")
async def voice_stream_endpoint(
    websocket: WebSocket,
    language: str = "hindi",
    current_location: str = "",
    current_lat: str = "",
    current_lon: str = "",
    home_location: str = "",
    active_page: str = "Home",
    user_name: str = "User",
    emergency_contact: str = "Emergency Services",
    client_timezone: str = "Asia/Kolkata",
):
    selected_language = "english" if language.lower() == "english" else "hindi"
    user_name = user_name.split()[0] if user_name else "User"
    dg_lang = "en-IN" if selected_language == "english" else "hi"
    url = f"wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language={dg_lang}&endpointing=300&utterance_end_ms=1000&vad_events=true&interim_results=true&smart_format=true&filler_words=false"
    
    deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "")
    nvidia_key = os.environ.get("NVIDIA_API_KEY", "")
    sarvam_key = os.environ.get("SARVAM_API_KEY", "")

    await websocket.accept()
    session_id = hashlib.sha1(f"{time.time_ns()}:{id(websocket)}".encode()).hexdigest()[:12]
    telemetry = {
        "actions": 0,
        "audio_chunks": 0,
        "capture_fallbacks": 0,
        "stt_final_transcripts": 0,
        "tts_failures": 0,
    }

    def log_voice_event(event: str, **fields):
        payload = {
            "session_id": session_id,
            "event": event,
            "language": selected_language,
            "active_page": active_page,
            **fields,
        }
        logger.info("voice_session %s", json.dumps(payload, ensure_ascii=False, default=str))

    log_voice_event("session_start")

    try:
        user_tz = pytz.timezone(client_timezone)
    except Exception:
        user_tz = pytz.timezone("Asia/Kolkata")

    weather_context = ""
    weather_last_fetched = 0.0

    async def refresh_weather_context():
        nonlocal weather_context
        nonlocal weather_last_fetched
        if current_lat and current_lon:
            try:
                async with httpx.AsyncClient(timeout=5.0) as weather_client:
                    weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={current_lat}&longitude={current_lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto"
                    weather_resp = await weather_client.get(weather_url)
                    if weather_resp.status_code == 200:
                        data = weather_resp.json()
                        c = data.get("current", {})
                        temp = round(float(c.get("temperature_2m", 0)))
                        feels_like = round(float(c.get("apparent_temperature", 0)))
                        precip = round(float(c.get("precipitation", 0)))
                        wmo = c.get("weather_code", 0)
                        
                        weather_desc = "Clear/Cloudy"
                        if wmo in [0, 1]: weather_desc = "Clear sky"
                        elif wmo in [2, 3]: weather_desc = "Partly cloudy"
                        elif wmo in [45, 48]: weather_desc = "Fog"
                        elif wmo in [51, 53, 55]: weather_desc = "Drizzle" if precip > 0 else "Cloudy"
                        elif wmo in [61, 63, 65, 80, 81, 82]: weather_desc = "Rain" if precip > 0 else "Cloudy"
                        elif wmo in [71, 73, 75, 77, 85, 86]: weather_desc = "Snow"
                        elif wmo in [95, 96, 99]: weather_desc = "Thunderstorm"
                        
                        loc_str = f" in {current_location}" if current_location else ""
                        weather_context = (
                            f"\n\n[CONTEXT] CURRENT WEATHER{loc_str}:\n"
                            f"Temperature: {temp}°C (Feels like {feels_like}°C). Condition: {weather_desc}. Precipitation (Rain): {precip}mm.\n"
                            f"WEATHER RULE: ONLY mention the weather, temperature, or rain if the user EXPLICITLY asks about it. DO NOT randomly bring up the weather. When answering weather queries, naturally mention the user's city exactly as provided (e.g., '{current_location}'). CRITICAL: NEVER guess, hallucinate, or assume the state, country, or region (like 'Gujarat' or 'India') based on the city name! Only speak the exact location name provided in this context. You MUST strictly state exactly what is provided in this context. If Precipitation is 0mm, do NOT say it is raining."
                        )
                        weather_last_fetched = time.time()
                        log_voice_event("weather_context_refreshed")
            except Exception as e:
                logger.error(f"Failed to fetch weather: {type(e).__name__} - {e}")
                log_voice_event("weather_context_failed", error=type(e).__name__)
                
    # Fetch weather completely in the background so it doesn't delay STT connection
    asyncio.create_task(refresh_weather_context())

    audio_ingest_queue = asyncio.Queue()
    llm_trigger_queue = asyncio.Queue()
    tts_queue = asyncio.Queue()

    async def client_receive_worker():
        first_audio = True
        try:
            while True:
                message = await websocket.receive()
                if "bytes" in message:
                    telemetry["audio_chunks"] += 1
                    if first_audio:
                        logger.info("🎤 First audio chunk received from client")
                        log_voice_event("first_audio_chunk")
                        first_audio = False
                    await audio_ingest_queue.put(message["bytes"])
                elif "text" in message:
                    try:
                        data = json.loads(message["text"])
                        if data.get("type") == "event" and data.get("text"):
                            logger.info(f"⚡ System Event Received: {data['text']}")
                            log_voice_event("client_event", text_hash=hashlib.sha256(data["text"].encode()).hexdigest()[:12])
                            await llm_trigger_queue.put(data["text"])
                        elif data.get("type") == "update_context":
                            nonlocal active_page, current_location, current_lat, current_lon, weather_context, weather_last_fetched
                            if data.get("active_page"):
                                active_page = data.get("active_page")
                                logger.info(f"🔄 Context Updated: active_page = {active_page}")
                            if data.get("current_location") is not None:
                                current_location = data.get("current_location") or current_location
                            if data.get("current_lat") is not None:
                                current_lat = data.get("current_lat") or current_lat
                            if data.get("current_lon") is not None:
                                current_lon = data.get("current_lon") or current_lon
                            if data.get("current_lat") or data.get("current_lon"):
                                weather_context = ""
                                weather_last_fetched = 0
                            log_voice_event("context_updated")
                    except Exception as e:
                        logger.error(f"Error parsing text frame: {e}")
        except (WebSocketDisconnect, RuntimeError):
            logger.info("Client disconnected gracefully.")

    # Start receiving client audio instantly to prevent TCP buffer full / packet drops
    client_task = asyncio.create_task(client_receive_worker())

    async def connect_deepgram_with_retries():
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            logger.info("🔌 Connecting to Deepgram STT... attempt %s/%s", attempt, max_attempts)
            log_voice_event("deepgram_connect_attempt", attempt=attempt)
            try:
                connection = await asyncio.wait_for(
                    websockets.connect(url, additional_headers={"Authorization": f"Token {deepgram_key}"}),
                    timeout=20.0,
                )
                logger.info("✅ Deepgram connected successfully")
                log_voice_event("deepgram_connected", attempt=attempt)
                return connection
            except asyncio.TimeoutError as exc:
                logger.warning("❌ Deepgram connection timed out on attempt %s/%s", attempt, max_attempts)
                last_error = exc
            except Exception as exc:
                logger.warning("❌ Deepgram connection failed on attempt %s/%s: %s", attempt, max_attempts, exc)
                last_error = exc

            if attempt < max_attempts:
                await asyncio.sleep(0.75 * attempt)

        raise last_error

    try:
        dg_ws = await connect_deepgram_with_retries()
    except Exception as connection_error:
        log_voice_event("deepgram_connect_failed", error=type(connection_error).__name__)
        client_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass
        return

    def has_devanagari_text(text: str) -> bool:
        return bool(re.search(r"[\u0900-\u097F]", text))

    async def normalize_stt_transcript(transcript: str) -> str:
        if selected_language != "hindi":
            return transcript
        if has_devanagari_text(transcript) or not re.search(r"[A-Za-z]", transcript):
            return transcript

        system_text = (
            "Convert this speech transcript into natural Devanagari Hindi for a voice assistant. "
            "It may be Romanized Hindi, misspelled Hindi, or a short app command. "
            "Preserve the user's intent exactly, do not answer it, do not add facts, "
            "do not add punctuation beyond what is natural, and output only the converted transcript."
        )
        try:
            async with httpx.AsyncClient(timeout=4.0) as normalize_client:
                result = await normalize_client.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    json={
                        "model": "meta/llama-3.1-8b-instruct",
                        "messages": [
                            {"role": "system", "content": system_text},
                            {"role": "user", "content": transcript},
                        ],
                        "stream": False,
                        "temperature": 0.1,
                        "max_tokens": 80,
                    },
                    headers={"Authorization": f"Bearer {nvidia_key}"},
                )
            result.raise_for_status()
            normalized = result.json()["choices"][0]["message"]["content"].strip()
            if normalized:
                log_voice_event(
                    "stt_transcript_normalized",
                    original_hash=hashlib.sha256(transcript.encode()).hexdigest()[:12],
                    normalized_hash=hashlib.sha256(normalized.encode()).hexdigest()[:12],
                )
                return normalized
        except Exception as normalize_error:
            log_voice_event("stt_transcript_normalize_failed", error=type(normalize_error).__name__)
        return transcript

    async def audio_ingest_worker():
        has_interrupted_current_turn = False
        async def listen_deepgram():
            nonlocal has_interrupted_current_turn
            try:
                async for message in dg_ws:
                    data = json.loads(message)
                    
                    if data.get("is_final") is False:
                        interim_transcript = data.get("channel", {}).get("alternatives", [{}])[0].get("transcript", "").strip()
                        # Higher threshold: Only interrupt if transcript length >= 5 to filter out small background noise/breaths
                        if len(interim_transcript) >= 5 and not has_interrupted_current_turn:
                            has_interrupted_current_turn = True
                            try:
                                await websocket.send_text(json.dumps({"type": "action", "command": "INTERRUPT_TTS"}))
                            except Exception:
                                pass

                    if data.get("is_final") and data.get("speech_final"):
                        has_interrupted_current_turn = False
                        transcript = data["channel"]["alternatives"][0]["transcript"].strip()
                        if transcript and len(transcript) >= 2:
                            telemetry["stt_final_transcripts"] += 1
                            logger.info(f"🗣️ Deepgram Heard: '{transcript}'")
                            log_voice_event(
                                "stt_final_transcript",
                                transcript_hash=hashlib.sha256(transcript.encode()).hexdigest()[:12],
                                transcript_len=len(transcript),
                            )
                            
                            # Only interrupt current TTS and clear queues if it's a significant phrase
                            if len(transcript) >= 5:
                                try:
                                    await websocket.send_text(json.dumps({"type": "action", "command": "INTERRUPT_TTS"}))
                                except Exception:
                                    pass
                                    
                                # Clear the backend TTS queue so we don't stream outdated sentences
                                while not tts_queue.empty():
                                    try:
                                        tts_queue.get_nowait()
                                        tts_queue.task_done()
                                    except asyncio.QueueEmpty:
                                        break
                                        
                            normalized_transcript = await normalize_stt_transcript(transcript)
                            await llm_trigger_queue.put(normalized_transcript)
            except websockets.exceptions.ConnectionClosed as exc:
                log_voice_event("deepgram_listen_closed", code=getattr(exc, "code", None))
                try:
                    await websocket.close(code=1011)
                except Exception:
                    pass
            except Exception as e:
                logger.error(f"Deepgram Listen Error: {e}")
                log_voice_event("deepgram_listen_error", error=type(e).__name__)
                try:
                    await websocket.close(code=1011)
                except Exception:
                    pass

        asyncio.create_task(listen_deepgram())
        
        first_forward = True
        while True:
            try:
                chunk = await asyncio.wait_for(audio_ingest_queue.get(), timeout=3.0)
            except asyncio.TimeoutError:
                try:
                    await dg_ws.send(json.dumps({"type": "KeepAlive"}))
                except Exception as e:
                    logger.warning("Deepgram KeepAlive failed: %s", e)
                    log_voice_event("deepgram_keepalive_failed", error=type(e).__name__)
                    try:
                        await websocket.close(code=1011)
                    except Exception:
                        pass
                    break
                continue
                
            if chunk is None:
                try:
                    await dg_ws.send(json.dumps({"type": "CloseStream"}))
                except Exception:
                    pass
                break
            if first_forward:
                logger.info("📡 First audio chunk forwarded to Deepgram")
                log_voice_event("first_audio_forwarded")
                first_forward = False
            try:
                await dg_ws.send(chunk)
            except Exception as e:
                logger.warning("Deepgram audio send failed: %s", e)
                log_voice_event("deepgram_audio_send_failed", error=type(e).__name__)
                try:
                    await websocket.close(code=1011)
                except Exception:
                    pass
                break

    async def llm_stream_worker():
        if selected_language == "hindi":
            sys_lang = (
                "LANGUAGE RULE:\n"
                "1. The selected app language is Hindi. Reply in Devanagari Hindi only, while keeping app feature names readable in English alphabets when needed: Settings, Scene Scanner, Text Reader, SOS, Camera, Photo, Flashlight, TalkBack.\n"
                "2. Never answer in English sentences when the selected language is Hindi, except for short app feature names listed above.\n"
                "3. You are female. Always use feminine first-person grammar in Hindi, such as 'रही हूँ' and 'कर सकती हूँ'. Never use masculine first-person grammar.\n"
                "4. Your name is EchoVision. Say it only when the user asks your name or identity.\n"
                "5. Speak in extremely short phrases with no newline characters.\n\n"
                "ACTION PATTERNS, NOT SCRIPTS:\n"
                "- Settings request: output <ACTION: SETTINGS> and a short natural confirmation.\n"
                "- Scanner plus photo request: output <ACTION: SCENE_SCANNER> <ACTION: CAPTURE> and a short natural confirmation.\n"
                "- Never say you are doing an action unless the matching action tag is present.\n"
                "- For Flashlight, use <ACTION: FLASHLIGHT_ON> for on/chalu and <ACTION: FLASHLIGHT_OFF> for off/band. Do not use a generic toggle when the user said on or off.\n"
                "- If the user says something like 'band karo' but the object is unclear, ask them to repeat naturally. Do not guess GO_BACK."
            )
        else:
            sys_lang = (
                "LANGUAGE RULE:\n"
                "1. The selected app language is English. Reply entirely in clean conversational English.\n"
                "2. Never output Hindi or Devanagari when the selected language is English, except if repeating a user-provided name or place exactly.\n"
                "3. Use a warm female assistant tone without gendered Hindi grammar.\n"
                "4. Speak in extremely short phrases with no newline characters.\n\n"
                "ACTION PATTERNS, NOT SCRIPTS:\n"
                "- Settings request: output <ACTION: SETTINGS> and a short natural confirmation.\n"
                "- Scanner plus photo request: output <ACTION: SCENE_SCANNER> <ACTION: CAPTURE> and a short natural confirmation.\n"
                "- Never say you are doing an action unless the matching action tag is present.\n"
                "- For Flashlight, use <ACTION: FLASHLIGHT_ON> for on and <ACTION: FLASHLIGHT_OFF> for off. Do not use a generic toggle when the user said on or off.\n"
                "- If the user says something like 'turn it off' but the object is unclear, ask them to repeat naturally. Do not guess GO_BACK."
            )

        location_context = f"\n\nCURRENT PAGE CONTEXT:\nThe user is currently on the '{active_page}' page of the app."
        if current_location:
            location_context += f"\n\nCURRENT LOCATION:\n{current_location}"
        if home_location:
            location_context += f"\n\nHOME LOCATION:\n{home_location}"
        if location_context:
            location_context = "\nLOCATION CONTEXT (use this to answer location questions accurately):" + location_context

        language_override = (
            f"\n\nCURRENT SELECTED LANGUAGE: {selected_language}\n"
            "This is the user's current app language setting and it overrides examples, old memory, and previous turns. "
            "If it is english, every spoken word must be English only. "
            "If it is hindi, every spoken word must be Devanagari Hindi except short app feature names such as Settings, Scene Scanner, Text Reader, SOS, Camera, Photo, Flashlight, and TalkBack. "
            "Action tags must stay exactly as tags and do not count as spoken language."
        )

        if selected_language == "hindi":
            user_context = (
                f"\n\nUSER INFO:\n"
                f"The user's name is '{user_name}'. Use it rarely, at most once, and only when it feels natural. Do not place the name at the end of a sentence.\n"
                f"CONVERSATION STYLE: Be warm, respectful, calm, and human-like. Use 'आप' style respect in Hindi. Do not use Sir, Ma'am, Sahab, or overly formal titles. Do not greet on every turn; greet only when the user greets you or the conversation naturally starts.\n"
                f"FEMININE PERSONA: The assistant voice is female. In Hindi, always use feminine first-person grammar. Never use masculine first-person forms.\n"
                f"EMPATHY: If the user sounds worried, confused, sad, or stressed, acknowledge that briefly before helping. For direct commands, execute the command without unnecessary follow-up.\n"
                f"SOS FLOW: If the user asks for SOS or emergency help, output <ACTION: SOS> and ask clearly whether to alert {emergency_contact}. If the user confirms while SOS is pending, output <ACTION: CONFIRM_SOS>. If the user cancels while SOS is pending, output <ACTION: CANCEL_SOS>. Do not confuse assistant shutdown with SOS.\n"
                f"CAPABILITIES: EchoVision helps blind and visually impaired users with Scene Scanner for surroundings, Text Reader for written text, SOS emergency alerts, Settings, language, haptics, TalkBack, theme, text size, profile/home address settings, SOS contacts, legal pages, location update, weather/time/location answers from provided context, and OSRM distance checks. Explain these in plain speech when asked, without exposing action tags.\n"
                f"SETTINGS ACTIONS: You can directly open Settings sections, change language, switch system/light/dark theme, set small/medium/large text size, toggle haptics, toggle TalkBack, refresh current location, and open legal pages. For profile, home address, SOS contact edits, and logout, open the matching Settings section and guide briefly.\n"
                f"SETTINGS SECTION ROUTING: Use <ACTION: SETTINGS_PROFILE> for profile/name/photo/home address, <ACTION: SETTINGS_PREFERENCES> for language/theme/text size/haptics, <ACTION: SETTINGS_LOCATION> for current location, <ACTION: SETTINGS_VOICE> for TalkBack or voice feedback, <ACTION: SETTINGS_SOS_CONTACTS> for SOS contacts, <ACTION: SETTINGS_LEGAL> for legal list, and <ACTION: SETTINGS_LOGOUT> for logout.\n"
                f"OUT OF SCOPE: If asked to open unsupported apps, answer external facts, or perform unsupported work, do not guess an action. Politely say that you cannot do that yet and offer an EchoVision action you can help with.\n"
                f"CLARIFICATION: If speech is broken, random, or missing required details, ask one short clarification. If the user says scar, score, or scale in an app-opening context, treat it as Scene Scanner.\n"
                f"ACTION ANNOUNCEMENT: Every action tag must be followed by a brief spoken confirmation in the selected language, except <IGNORE>. Never execute silently, never repeat the same sentence twice, and never mention raw tags unless executing them.\n"
                f"STARTUP ECHO: If the exact user input is only 'Assistant चालू है' or 'Assistant is on', output exactly <IGNORE> and nothing else."
            )
        else:
            user_context = (
                f"\n\nUSER INFO:\n"
                f"The user's name is '{user_name}'. Use it rarely, at most once, and only when it feels natural. Do not place the name at the end of a sentence.\n"
                f"CONVERSATION STYLE: Be warm, respectful, calm, and human-like. Do not use Sir, Ma'am, or overly formal titles. Do not greet on every turn; greet only when the user greets you or the conversation naturally starts.\n"
                f"LANGUAGE STRICTNESS: The selected language is English. Do not output Hindi or Devanagari in spoken text. Previous non-English examples are behavior references only and must not be copied.\n"
                f"EMPATHY: If the user sounds worried, confused, sad, or stressed, acknowledge that briefly before helping. For direct commands, execute the command without unnecessary follow-up.\n"
                f"SOS FLOW: If the user asks for SOS or emergency help, output <ACTION: SOS> and ask clearly whether to alert {emergency_contact}. If the user confirms while SOS is pending, output <ACTION: CONFIRM_SOS>. If the user cancels while SOS is pending, output <ACTION: CANCEL_SOS>. Do not confuse assistant shutdown with SOS.\n"
                f"CAPABILITIES: EchoVision helps blind and visually impaired users with Scene Scanner for surroundings, Text Reader for written text, SOS emergency alerts, Settings, language, haptics, TalkBack, theme, text size, profile/home address settings, SOS contacts, legal pages, location update, weather/time/location answers from provided context, and OSRM distance checks. Explain these in plain speech when asked, without exposing action tags.\n"
                f"SETTINGS ACTIONS: You can directly open Settings sections, change language, switch system/light/dark theme, set small/medium/large text size, toggle haptics, toggle TalkBack, refresh current location, and open legal pages. For profile, home address, SOS contact edits, and logout, open the matching Settings section and guide briefly.\n"
                f"SETTINGS SECTION ROUTING: Use <ACTION: SETTINGS_PROFILE> for profile/name/photo/home address, <ACTION: SETTINGS_PREFERENCES> for language/theme/text size/haptics, <ACTION: SETTINGS_LOCATION> for current location, <ACTION: SETTINGS_VOICE> for TalkBack or voice feedback, <ACTION: SETTINGS_SOS_CONTACTS> for SOS contacts, <ACTION: SETTINGS_LEGAL> for legal list, and <ACTION: SETTINGS_LOGOUT> for logout.\n"
                f"OUT OF SCOPE: If asked to open unsupported apps, answer external facts, or perform unsupported work, do not guess an action. Politely say that you cannot do that yet and offer an EchoVision action you can help with.\n"
                f"CLARIFICATION: If speech is broken, random, or missing required details, ask one short clarification. If the user says scar, score, or scale in an app-opening context, treat it as Scene Scanner.\n"
                f"ACTION ANNOUNCEMENT: Every action tag must be followed by a brief spoken confirmation in English, except <IGNORE>. Never execute silently, never repeat the same sentence twice, and never mention raw tags unless executing them.\n"
                f"STARTUP ECHO: If the exact user input is only 'Assistant is on', output exactly <IGNORE> and nothing else."
            )

        # full_system is assembled dynamically inside process_query so it always has the correct active_page

        async with httpx.AsyncClient(timeout=60.0) as client:
            buffer = ""
            full_response = ""
            chat_history = active_sessions.setdefault(user_name, [])

            async def process_query(query: str):
                nonlocal buffer
                nonlocal full_response
                nonlocal active_page
                
                # Track actions emitted by LLM for this query
                emitted_actions = []
                photo_keywords = ["photo", "फोटो", "capture", "click", "तस्वीर", "तसवीर", "pic", "picture", "छवि"]
                query_wants_photo = any(kw in query.lower() for kw in photo_keywords)
                is_first_chunk = True
                suppress_llm_speech = False

                def localized_text(english_text: str, hindi_text: str) -> str:
                    if selected_language == "english":
                        return english_text
                    return hindi_text

                def user_asked_weather(text: str) -> bool:
                    lowered = text.lower()
                    weather_terms = [
                        "weather",
                        "temperature",
                        "rain",
                        "raining",
                        "forecast",
                        "मौसम",
                        "तापमान",
                        "बारिश",
                        "बरसात",
                    ]
                    return any(term in lowered or term in text for term in weather_terms)

                def clarification_text(text: str) -> str:
                    if selected_language == "english":
                        options = [
                            "I did not catch what you want me to turn off. Could you repeat that?",
                            "I am not sure what you want turned off. Please say it once more.",
                            "I missed the exact command. Please repeat what you want me to close or turn off.",
                        ]
                    else:
                        options = [
                            "मैं ठीक से समझ नहीं पाई कि क्या बंद करना है। कृपया एक बार फिर दोहराएँ।",
                            "मुझे साफ़ नहीं सुनाई दिया कि आप क्या बंद करना चाहते हैं। कृपया फिर से बोलें।",
                            "मैं कमांड पूरी तरह नहीं समझ पाई। कृपया बताइए, क्या बंद करना है?",
                        ]
                    idx = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16) % len(options)
                    return options[idx]

                def intent_tokens(text: str) -> list[str]:
                    return re.findall(r"[a-z]+|[\u0900-\u097F]+", text.lower())

                def roman_skeleton(token: str) -> str:
                    return re.sub(r"[aeiou]", "", token.lower())

                def fuzzy_token_match(tokens: list[str], targets: list[str], threshold: float = 0.78) -> bool:
                    for token in tokens:
                        if not re.fullmatch(r"[a-z]+", token) or len(token) < 3:
                            continue
                        for target in targets:
                            if token == target or target in token or token in target:
                                return True
                            if SequenceMatcher(None, token, target).ratio() >= threshold:
                                return True
                    return False

                def contains_any(text: str, terms: list[str]) -> bool:
                    lowered = text.lower()
                    return any(term in lowered or term in text for term in terms)

                def has_close_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    skeletons = {roman_skeleton(token) for token in tokens if re.fullmatch(r"[a-z]+", token)}
                    return (
                        contains_any(text, ["turn off", "switch off", "close", "shut", "stop", "बंद", "रोक"])
                        or "off" in tokens
                        or roman_skeleton("band") in skeletons
                    )

                def has_open_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    skeletons = {roman_skeleton(token) for token in tokens if re.fullmatch(r"[a-z]+", token)}
                    return (
                        contains_any(text, ["turn on", "switch on", "चालू", "जलाओ", "जला"])
                        or any(token in tokens for token in ["on", "open", "start"])
                        or bool({roman_skeleton("chalu"), roman_skeleton("chalao")} & skeletons)
                    )

                def has_flashlight_target(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return (
                        fuzzy_token_match(tokens, ["flashlight", "flash", "torch", "light"])
                        or contains_any(text, ["फ़्लैश", "फ्लैश", "लाइट", "टॉर्च"])
                    )

                def has_known_close_target(text: str) -> bool:
                    tokens = intent_tokens(text)
                    if has_flashlight_target(text):
                        return True
                    if fuzzy_token_match(
                        tokens,
                        [
                            "assistant",
                            "voice",
                            "audio",
                            "reading",
                            "reader",
                            "scanner",
                            "camera",
                            "sos",
                            "scene",
                            "back",
                            "previous",
                        ],
                    ):
                        return True
                    return contains_any(
                        text,
                        [
                            "असिस्टेंट",
                            "आवाज़",
                            "ऑडियो",
                            "रीडर",
                            "स्कैनर",
                            "कैमरा",
                            "पीछे",
                            "पिछली",
                        ],
                    )

                def unclear_close_command(text: str) -> bool:
                    return has_close_intent(text) and not has_known_close_target(text)

                def flashlight_requested_state(text: str) -> str | None:
                    if not has_flashlight_target(text):
                        return None
                    if has_close_intent(text):
                        return "off"
                    if has_open_intent(text):
                        return "on"
                    return "unknown"

                def flashlight_ack_text(state: str, text: str) -> str:
                    if selected_language == "english":
                        options = {
                            "on": [
                                "Turning the flashlight on.",
                                "Okay, turning on the flashlight.",
                                "I am turning the flashlight on now.",
                            ],
                            "off": [
                                "Turning the flashlight off.",
                                "Okay, turning off the flashlight.",
                                "I am turning the flashlight off now.",
                            ],
                        }
                    else:
                        options = {
                            "on": [
                                "फ़्लैशलाइट चालू कर रही हूँ।",
                                "ठीक है, फ़्लैशलाइट चालू कर रही हूँ।",
                                "मैं अभी फ़्लैशलाइट चालू कर रही हूँ।",
                            ],
                            "off": [
                                "फ़्लैशलाइट बंद कर रही हूँ।",
                                "ठीक है, फ़्लैशलाइट बंद कर रही हूँ।",
                                "मैं अभी फ़्लैशलाइट बंद कर रही हूँ।",
                            ],
                        }
                    choices = options[state]
                    idx = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16) % len(choices)
                    return choices[idx]

                async def send_direct_action(command: str) -> bool:
                    try:
                        await websocket.send_text(json.dumps({"type": "action", "command": command}))
                        log_voice_event("action_sent", command=command, source="deterministic_guard")
                        return True
                    except Exception as send_err:
                        logger.warning(f"Could not send deterministic action to websocket: {send_err}")
                        log_voice_event(
                            "action_send_failed",
                            command=command,
                            source="deterministic_guard",
                            error=type(send_err).__name__,
                        )
                        return False

                def has_back_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return (
                        contains_any(text, ["go back", "previous", "back", "पीछे", "पिछली"])
                        or (
                            has_close_intent(text)
                            and contains_any(text, ["screen", "page", "settings", "स्क्रीन", "पेज", "Settings"])
                        )
                        or fuzzy_token_match(tokens, ["back", "previous"])
                    )

                def has_assistant_target(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return fuzzy_token_match(tokens, ["assistant", "voice", "listening", "audio"]) or contains_any(
                        text,
                        ["असिस्टेंट", "आवाज़", "सुनना", "वॉइस"],
                    )

                def has_sos_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return fuzzy_token_match(tokens, ["sos", "emergency", "help", "ambulance", "police"]) or contains_any(
                        text,
                        ["मदद", "आपात", "आपातकाल", "एम्बुलेंस", "पुलिस"],
                    )

                def has_language_intent(text: str, command: str) -> bool:
                    tokens = intent_tokens(text)
                    requested_language = "english" if "ENGLISH" in command.upper() else "hindi"
                    language_named = requested_language in tokens or (
                        requested_language == "hindi" and contains_any(text, ["हिंदी", "हिन्दी"])
                    )
                    return language_named and (
                        fuzzy_token_match(tokens, ["language", "speak", "reply", "answer"])
                        or contains_any(text, ["भाषा", "बोल", "जवाब"])
                    )

                def has_settings_intent(text: str, command: str) -> bool:
                    tokens = intent_tokens(text)
                    upper_command = command.upper()
                    section_targets = {
                        "SETTINGS_PROFILE": ["profile", "name", "photo", "address", "home"],
                        "SETTINGS_PREFERENCES": ["preferences", "language", "theme", "text", "font", "haptics"],
                        "SETTINGS_LOCATION": ["location", "current"],
                        "SETTINGS_VOICE": ["voice", "talkback", "feedback"],
                        "SETTINGS_SOS_CONTACTS": ["sos", "contact", "emergency"],
                        "SETTINGS_LEGAL": ["legal", "privacy", "terms", "cookie", "license", "about"],
                        "SETTINGS_LOGOUT": ["logout", "signout", "sign"],
                    }
                    if upper_command == "SETTINGS":
                        return fuzzy_token_match(tokens, ["settings", "preference"]) or contains_any(text, ["Settings", "सेटिंग"])
                    for action_name, targets in section_targets.items():
                        if action_name in upper_command:
                            return fuzzy_token_match(tokens, targets + ["settings"]) or contains_any(
                                text,
                                ["Settings", "सेटिंग", "प्रोफाइल", "लोकेशन", "कानूनी", "संपर्क", "लॉग आउट"],
                            )
                    return False

                def has_theme_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return fuzzy_token_match(tokens, ["theme", "mode", "screen", "display"]) or contains_any(
                        text,
                        ["dark mode", "light mode", "system theme", "थीम", "डार्क", "लाइट"],
                    )

                def has_text_size_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return fuzzy_token_match(tokens, ["text", "font", "size", "small", "medium", "large"]) or contains_any(
                        text,
                        ["टेक्स्ट", "फ़ॉन्ट", "फॉन्ट", "छोटा", "बड़ा", "मध्यम"],
                    )

                def has_haptics_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return fuzzy_token_match(tokens, ["haptic", "haptics", "vibration", "vibrate"]) or contains_any(
                        text,
                        ["वाइब्रेशन", "कंपन", "हैप्टिक"],
                    )

                def has_talkback_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return fuzzy_token_match(tokens, ["talkback", "feedback", "voice"]) or contains_any(
                        text,
                        ["टॉकबैक", "फीडबैक", "आवाज़"],
                    )

                def has_feature_intent(text: str, command: str) -> bool:
                    tokens = intent_tokens(text)
                    upper_command = command.upper()
                    if "SCENE_SCANNER" in upper_command:
                        return query_wants_photo or fuzzy_token_match(tokens, ["scene", "scanner", "camera", "scan"]) or contains_any(text, ["स्कैन", "कैमरा", "फोटो"])
                    if "TEXT_READER" in upper_command:
                        return fuzzy_token_match(tokens, ["text", "reader", "read", "ocr"]) or contains_any(text, ["टेक्स्ट", "पढ़", "रीडर"])
                    return False

                def has_location_update_intent(text: str) -> bool:
                    tokens = intent_tokens(text)
                    return (
                        fuzzy_token_match(tokens, ["location", "current", "update", "refresh"])
                        or contains_any(text, ["लोकेशन", "स्थान", "अपडेट"])
                    )

                def legal_action_matches_query(text: str, command: str) -> bool:
                    tokens = intent_tokens(text)
                    upper_command = command.upper()
                    legal_targets = {
                        "LEGAL_ABOUT": ["about", "app", "echovision"],
                        "LEGAL_PRIVACY": ["privacy", "policy"],
                        "LEGAL_TERMS": ["terms", "service"],
                        "LEGAL_COOKIE": ["cookie", "cookies"],
                        "LEGAL_LICENSE": ["license", "licence"],
                    }
                    for action_name, targets in legal_targets.items():
                        if action_name in upper_command:
                            return fuzzy_token_match(tokens, targets + ["legal"]) or contains_any(
                                text,
                                ["कानूनी", "प्राइवेसी", "शर्तें", "कुकी", "लाइसेंस", "बारे"],
                            )
                    return False

                def action_safety_gate(command: str, user_text: str) -> tuple[bool, str | None, list[str]]:
                    upper_command = command.upper()
                    camera_pages = ["Scene Scanner", "Text Reader"]

                    if upper_command == "INTERRUPT_TTS":
                        return True, None, []

                    if "FLASHLIGHT" in upper_command:
                        if active_page in camera_pages:
                            return True, None, []
                        return False, localized_text(
                            "The flashlight is available on the scanner or reader camera screen.",
                            "फ़्लैशलाइट स्कैनर या रीडर कैमरा स्क्रीन पर उपलब्ध है।",
                        ), []

                    if upper_command == "CAPTURE":
                        if active_page in camera_pages:
                            return True, None, []
                        if query_wants_photo:
                            return True, None, ["SCENE_SCANNER"]
                        return False, localized_text(
                            "Please open the scanner or reader camera first.",
                            "कृपया पहले scanner या reader camera खोलें।",
                        ), []

                    if upper_command == "GO_BACK":
                        if has_back_intent(user_text):
                            return True, None, []
                        return False, clarification_text(user_text), []

                    if upper_command == "TURN_OFF_ASSISTANT":
                        if has_close_intent(user_text) and has_assistant_target(user_text):
                            return True, None, []
                        return False, clarification_text(user_text), []

                    if upper_command == "SOS":
                        if has_sos_intent(user_text):
                            return True, None, []
                        return False, localized_text(
                            "I did not hear an emergency request clearly. Please say SOS if you need emergency help.",
                            "मुझे emergency request साफ़ नहीं सुनाई दी। अगर मदद चाहिए तो कृपया SOS बोलें।",
                        ), []

                    if upper_command in {"CONFIRM_SOS", "CANCEL_SOS"}:
                        if active_page == "SOSConfirmation":
                            return True, None, []
                        return False, localized_text(
                            "There is no SOS confirmation pending right now.",
                            "अभी कोई SOS confirmation pending नहीं है।",
                        ), []

                    if upper_command.startswith("CHANGE_LANGUAGE"):
                        if has_language_intent(user_text, command):
                            return True, None, []
                        return False, localized_text(
                            "Which language should I switch to, English or Hindi?",
                            "आप कौन सी भाषा चाहती हैं, English या Hindi?",
                        ), []

                    if upper_command in {"THEME_SYSTEM", "DARK_MODE", "LIGHT_MODE"}:
                        return (True, None, []) if has_theme_intent(user_text) else (False, clarification_text(user_text), [])

                    if upper_command in {"TEXT_SIZE_SMALL", "TEXT_SIZE_MEDIUM", "TEXT_SIZE_LARGE"}:
                        return (True, None, []) if has_text_size_intent(user_text) else (False, clarification_text(user_text), [])

                    if upper_command in {"HAPTICS_ON", "HAPTICS_OFF"}:
                        return (True, None, []) if has_haptics_intent(user_text) else (False, clarification_text(user_text), [])

                    if upper_command in {"TALKBACK_ON", "TALKBACK_OFF"}:
                        return (True, None, []) if has_talkback_intent(user_text) else (False, clarification_text(user_text), [])

                    if upper_command == "UPDATE_LOCATION":
                        return (True, None, []) if has_location_update_intent(user_text) else (False, clarification_text(user_text), [])

                    if upper_command.startswith("LEGAL_"):
                        return (True, None, []) if legal_action_matches_query(user_text, command) else (False, clarification_text(user_text), [])

                    if upper_command.startswith("SETTINGS"):
                        return (True, None, []) if has_settings_intent(user_text, command) else (False, clarification_text(user_text), [])

                    if upper_command in {"SCENE_SCANNER", "TEXT_READER"}:
                        return (True, None, []) if has_feature_intent(user_text, command) else (False, clarification_text(user_text), [])

                    return False, localized_text(
                        "I cannot do that action yet.",
                        "मैं अभी यह action नहीं कर सकती।",
                    ), []

                def has_devanagari(text: str) -> bool:
                    return bool(re.search(r"[\u0900-\u097F]", text))

                def language_safe_history(history: list[dict]) -> list[dict]:
                    safe_history = []
                    for item in history[-10:]:
                        role = item.get("role")
                        content = item.get("content", "")
                        if role == "assistant":
                            if selected_language == "english" and has_devanagari(content):
                                continue
                            if selected_language == "hindi" and not has_devanagari(content):
                                continue
                        safe_history.append(item)
                    return safe_history[-6:]

                async def enforce_spoken_language(sentence: str) -> str:
                    clean = sentence.strip()
                    if not clean:
                        return clean

                    needs_repair = (
                        selected_language == "english" and has_devanagari(clean)
                    ) or (
                        selected_language == "hindi"
                        and not has_devanagari(clean)
                        and bool(re.search(r"[A-Za-z]", clean))
                    )
                    if not needs_repair:
                        return clean

                    target = "English" if selected_language == "english" else "Hindi in Devanagari script"
                    system_text = (
                        f"Convert the user's sentence to {target}. "
                        "Preserve the meaning, keep it short and natural for text-to-speech, "
                        "do not add facts, do not add markdown, and output only the converted sentence."
                    )
                    try:
                        repair_payload = {
                            "model": "meta/llama-3.1-8b-instruct",
                            "messages": [
                                {"role": "system", "content": system_text},
                                {"role": "user", "content": clean},
                            ],
                            "stream": False,
                            "temperature": 0.1,
                            "max_tokens": 120,
                        }
                        res = await client.post(
                            "https://integrate.api.nvidia.com/v1/chat/completions",
                            json=repair_payload,
                            headers={"Authorization": f"Bearer {nvidia_key}"},
                        )
                        res.raise_for_status()
                        repaired = res.json()["choices"][0]["message"]["content"].strip()
                        if repaired:
                            log_voice_event("language_repaired", target=selected_language)
                            return repaired
                    except Exception as repair_error:
                        logger.warning("Language repair failed: %s", repair_error)
                        log_voice_event("language_repair_failed", error=type(repair_error).__name__)

                    return clean
                
                # Assemble system prompt with the LATEST active_page
                if unclear_close_command(query):
                    await tts_queue.put(clarification_text(query))
                    log_voice_event(
                        "clarified_unclear_close_command",
                        transcript_hash=hashlib.sha256(query.encode()).hexdigest()[:12],
                    )
                    return

                flashlight_state = flashlight_requested_state(query)
                if flashlight_state in {"on", "off"}:
                    if active_page in ["Scene Scanner", "Text Reader"]:
                        command = "FLASHLIGHT_ON" if flashlight_state == "on" else "FLASHLIGHT_OFF"
                        await send_direct_action(command)
                        await tts_queue.put(flashlight_ack_text(flashlight_state, query))
                        log_voice_event(
                            "direct_flashlight_command",
                            command=command,
                            transcript_hash=hashlib.sha256(query.encode()).hexdigest()[:12],
                        )
                    else:
                        await tts_queue.put(localized_text(
                            "The flashlight is available on the scanner or reader camera screen.",
                            "फ़्लैशलाइट स्कैनर या रीडर कैमरा स्क्रीन पर उपलब्ध है।",
                        ))
                        log_voice_event(
                            "direct_flashlight_blocked",
                            active_page=active_page,
                            transcript_hash=hashlib.sha256(query.encode()).hexdigest()[:12],
                        )
                    return
                if flashlight_state == "unknown":
                    await tts_queue.put(localized_text(
                        "Should I turn the flashlight on or off?",
                        "क्या मैं फ़्लैशलाइट चालू करूँ या बंद करूँ?",
                    ))
                    log_voice_event(
                        "clarified_flashlight_state",
                        transcript_hash=hashlib.sha256(query.encode()).hexdigest()[:12],
                    )
                    return

                if user_asked_weather(query) and current_lat and current_lon and (
                    not weather_context or time.time() - weather_last_fetched > 180
                ):
                    try:
                        await asyncio.wait_for(refresh_weather_context(), timeout=5.5)
                    except Exception as weather_wait_error:
                        log_voice_event("weather_context_wait_failed", error=type(weather_wait_error).__name__)

                query_now = datetime.now(user_tz)
                effective_time_context = (
                    f"\n\n[CONTEXT] CURRENT DATE & TIME:\n"
                    f"Today is {query_now.strftime('%A, %B %d, %Y')}. "
                    f"The current time is {query_now.strftime('%I:%M %p')}. "
                    "TIME & DATE RULE: ONLY state the time or date if the user EXPLICITLY asks for it. "
                    "When answering date or day queries, state it simply and directly. "
                    "Do not correct an imagined wrong day; just give the direct answer naturally."
                )
                if weather_context:
                    effective_time_context += weather_context

                current_system = SYSTEM_PROMPT + "\n" + sys_lang + language_override + location_context + effective_time_context + "\n" + user_context
                current_system += f"\n\nCURRENT PAGE: {active_page}\n"
                if active_page not in ["Scene Scanner", "Text Reader"]:
                    current_system += "CRITICAL: You are NOT on a camera page. If the user asks to take a photo or scan, you MUST output <ACTION: SCENE_SCANNER> BEFORE <ACTION: CAPTURE>. If the user asks to turn the flashlight on or off, DO NOT output a flashlight action. Instead, tell the user that the flashlight can only be used on scanner or reader camera screens."
                else:
                    current_system += "CRITICAL: You are ALREADY on a camera page. If the user asks to take a photo, you MUST ONLY output <ACTION: CAPTURE>. DO NOT output <ACTION: SCENE_SCANNER>. If they ask to turn the flashlight on, output <ACTION: FLASHLIGHT_ON>. If they ask to turn it off, output <ACTION: FLASHLIGHT_OFF>."
                
                
                messages = [{"role": "system", "content": current_system}]
                messages.extend(language_safe_history(chat_history))
                messages.append({"role": "user", "content": query})
                
                payload = {
                    "model": "meta/llama-3.1-8b-instruct", 
                    "messages": messages, 
                    "stream": True,
                    "max_tokens": 300
                }
                
                try:
                    start_time = time.time()
                    logger.info(f"🧠 LLM Stream started for: '{query}'")
                    async with client.stream("POST", "https://integrate.api.nvidia.com/v1/chat/completions", json=payload, headers={"Authorization": f"Bearer {nvidia_key}"}) as r:
                        first_token = True
                        async for chunk in r.aiter_lines():
                            if first_token and chunk.startswith("data: "):
                                ttfb = (time.time() - start_time) * 1000
                                logger.info(f"⏱️ LLM TTFB (Time to First Byte): {ttfb:.0f}ms")
                                first_token = False
                                
                            if chunk.startswith("data: "):
                                data_str = chunk[6:]
                                if data_str == "[DONE]":
                                    final_text = buffer.strip()
                                    if final_text and "<IGNORE>" not in final_text and not suppress_llm_speech:
                                        if "<ACTION" not in final_text:
                                            await tts_queue.put(await enforce_spoken_language(final_text))
                                            
                                    if full_response.strip() and "<IGNORE>" not in full_response and not suppress_llm_speech:
                                        chat_history.append({"role": "user", "content": query})
                                        chat_history.append({"role": "assistant", "content": full_response.strip()})
                                        
                                        # Keep memory manageable (last 10 interactions = 20 messages)
                                        if len(chat_history) > 20:
                                            active_sessions[user_name] = chat_history[-20:]
                                            
                                    buffer = ""
                                    full_response = ""
                                    break
                                
                                try:
                                    data_json = json.loads(data_str)
                                    if not data_json.get("choices"): continue
                                    delta = data_json["choices"][0].get("delta", {})
                                    token = delta.get("content", "")
                                except Exception:
                                    continue
                                
                                buffer += token
                                full_response += token
                                
                                action_match = re.search(r"<ACTION:\s*([^>]+)>", buffer)
                                while action_match:
                                    action_tag = action_match.group(0)
                                    command = action_match.group(1).strip()
                                    buffer = buffer.replace(action_tag, "").lstrip()
                                    emitted_actions.append(command)
                                    telemetry["actions"] += 1
                                    log_voice_event("llm_action", command=command)
                                    
                                    if "CALCULATE_DISTANCE" in command:
                                        target_address = home_location if "HOME" in command else (command.split("|")[1] if "|" in command else "")
                                        if not current_location or not target_address:
                                            await tts_queue.put(localized_text(
                                                "Please update your location in Settings.",
                                                "कृपया Settings में अपना स्थान अपडेट करें।",
                                            ))
                                        else:
                                            try:
                                                from app.services.osrm_service import calculate_distance_between_addresses, calculate_distance_from_coords
                                                if current_lat and current_lon:
                                                    result = await calculate_distance_from_coords(float(current_lat), float(current_lon), target_address, near_location=current_location)
                                                else:
                                                    result = await calculate_distance_between_addresses(current_location, target_address)
                                                if result is not None:
                                                    km = result["distance_km"]
                                                    mins = result["duration_min"]
                                                    await tts_queue.put(localized_text(
                                                        f"{target_address} is approximately {km:.1f} kilometers away, about {int(mins)} minutes by car.",
                                                        f"{target_address} लगभग {km:.1f} किलोमीटर दूर है, गाड़ी से करीब {int(mins)} मिनट लगेंगे।",
                                                    ))
                                                else:
                                                    await tts_queue.put(localized_text(
                                                        f"I couldn't find the exact location of {target_address}. Can you provide a pincode or a nearby landmark?",
                                                        f"{target_address} का सटीक स्थान नहीं मिल पा रहा है। क्या आप पिनकोड या आसपास की कोई मशहूर जगह बता सकते हैं?",
                                                    ))
                                            except Exception as e:
                                                logger.error(f"OSRM error: {e}")
                                                await tts_queue.put(localized_text(
                                                    "There was an error calculating the distance.",
                                                    "दूरी निकालने में त्रुटि हुई।",
                                                ))
                                    else:
                                        allowed, corrective_text, prerequisite_actions = action_safety_gate(command, query)
                                        if not allowed:
                                            suppress_llm_speech = True
                                            log_voice_event("action_blocked", command=command)
                                            if corrective_text:
                                                await tts_queue.put(await enforce_spoken_language(corrective_text))
                                        else:
                                            try:
                                                for prerequisite in prerequisite_actions:
                                                    await websocket.send_text(json.dumps({"type": "action", "command": prerequisite}))
                                                    log_voice_event("action_sent", command=prerequisite, source="safety_gate_prerequisite")
                                                    if "SCENE_SCANNER" in prerequisite:
                                                        active_page = "Scene Scanner"
                                                    elif "TEXT_READER" in prerequisite:
                                                        active_page = "Text Reader"

                                                await websocket.send_text(json.dumps({"type": "action", "command": command}))
                                                log_voice_event("action_sent", command=command)
                                                # Track page changes for context
                                                if "SCENE_SCANNER" in command:
                                                    active_page = "Scene Scanner"
                                                elif "TEXT_READER" in command:
                                                    active_page = "Text Reader"
                                                elif command == "SOS":
                                                    active_page = "SOSConfirmation"
                                                elif command == "CANCEL_SOS":
                                                    active_page = "Home"
                                                elif command.startswith("SETTINGS"):
                                                    active_page = "Settings"
                                                elif command.startswith("LEGAL_"):
                                                    active_page = "LegalViewer"
                                                elif "GO_BACK" in command:
                                                    active_page = "Home"
                                            except Exception as send_err:
                                                logger.warning(f"Could not send action to websocket: {send_err}")
                                                log_voice_event("action_send_failed", command=command, error=type(send_err).__name__)
                                    
                                    action_match = re.search(r"<ACTION:\s*([^>]+)>", buffer)

                                buffer_stripped = buffer.strip()
                                # Check for end-of-sentence punctuation or comma with length constraints
                                puncts = [".", "?", "!", "।", "\n"]
                                split_idx = -1
                                
                                if any(p in token for p in puncts):
                                    split_idx = max(buffer.rfind(p) for p in puncts)
                                elif "," in token and len(buffer_stripped) > (20 if is_first_chunk else 45):
                                    split_idx = buffer.rfind(",")
                                
                                if split_idx != -1:
                                    sentence = buffer[:split_idx+1].strip()
                                    remainder = buffer[split_idx+1:]
                                    
                                    # Prevent tiny fragments (e.g., "Akash.") from becoming their own TTS request.
                                    # If the chunk is too short, keep it in buffer and let it merge with the next tokens.
                                    clean_check = sentence.strip(".,?!। \n\t")
                                    if len(clean_check) < 10 and not is_first_chunk:
                                        # Too short — don't flush, let it merge with subsequent tokens
                                        continue
                                    
                                    buffer = remainder # Commit the split
                                    
                                    if sentence:
                                        # Fix Llama stuttering duplicate phrases.
                                        half = len(sentence) // 2
                                        if len(sentence) > 10 and sentence[:half].strip() == sentence[half:].strip():
                                            sentence = sentence[:half].strip()
                                        
                                        # Only send to TTS if it contains actual words (not just punctuation)
                                        if clean_check and "<IGNORE>" not in sentence and not suppress_llm_speech:
                                            # Ensure we aren't sending a partial action tag
                                            if "<ACTION" not in sentence:
                                                is_first_chunk = False
                                                await tts_queue.put(await enforce_spoken_language(sentence))
                    
                    # ── DETERMINISTIC FALLBACK ──
                    # If user asked for photo AND LLM opened scanner but forgot CAPTURE → inject it
                    has_scanner = any("SCENE_SCANNER" in a for a in emitted_actions)
                    has_capture = any("CAPTURE" in a for a in emitted_actions)
                    if query_wants_photo and has_scanner and not has_capture:
                        logger.info("⚡ Auto-injecting CAPTURE action (LLM forgot it)")
                        telemetry["capture_fallbacks"] += 1
                        log_voice_event("capture_fallback_injected", reason="scanner_without_capture")
                        try:
                            await websocket.send_text(json.dumps({"type": "action", "command": "CAPTURE"}))
                            log_voice_event("action_sent", command="CAPTURE")
                        except Exception:
                            log_voice_event("action_send_failed", command="CAPTURE")
                    # If user asked for photo and we're ALREADY on scanner but LLM didn't emit CAPTURE
                    elif query_wants_photo and active_page == "Scene Scanner" and not has_capture:
                        logger.info("⚡ Auto-injecting CAPTURE action (already on scanner)")
                        telemetry["capture_fallbacks"] += 1
                        log_voice_event("capture_fallback_injected", reason="already_on_scanner")
                        try:
                            await websocket.send_text(json.dumps({"type": "action", "command": "CAPTURE"}))
                            log_voice_event("action_sent", command="CAPTURE")
                        except Exception:
                            log_voice_event("action_send_failed", command="CAPTURE")
                            
                except Exception as e:
                    logger.error(f"LLM Worker Error: {e}")
                    log_voice_event("llm_worker_error", error=type(e).__name__)

            while True:
                transcript = await llm_trigger_queue.get()
                if transcript is None: break
                
                asyncio.create_task(process_query(transcript))

    async def tts_pipeline_worker():
        sarvam_lang = "en-IN" if selected_language == "english" else "hi-IN"
        import aiohttp
        tts_headers = {"api-subscription-key": sarvam_key, "Content-Type": "application/json"}
        tts_url = "https://api.sarvam.ai/text-to-speech"

        async with aiohttp.ClientSession() as tts_session:
            # ── Pre-warm: pay the DNS+TCP+TLS cost upfront ──
            try:
                async with tts_session.post(
                    tts_url,
                    json={"inputs": ["."], "target_language_code": sarvam_lang, "speaker": "simran", "model": "bulbul:v3"},
                    headers=tts_headers
                ) as _:
                    pass  # We don't care about the result, just warming the connection pool
                logger.info("🔥 TTS connection pre-warmed")
            except Exception:
                pass  # Non-fatal, first real request will just be slightly slower

            # ── Parallel download, ordered delivery ──
            # Each TTS chunk is downloaded concurrently, but sent to the
            # client in strict FIFO order using an asyncio.Event chain.
            # This ensures audio never overlaps or arrives out of order.
            prev_ready = asyncio.Event()
            prev_ready.set()  # First chunk has no predecessor to wait for

            async def fetch_and_send(sentence: str, my_turn: asyncio.Event, next_turn: asyncio.Event):
                """Download TTS audio, then wait for my_turn before sending to client."""
                clean_sentence = re.sub(r'[*_#`]', '', sentence).strip()
                if not clean_sentence:
                    await my_turn.wait()  # Still need to signal next
                    next_turn.set()
                    return

                audio_b64 = None
                max_tts_attempts = 3
                for attempt in range(1, max_tts_attempts + 1):
                    try:
                        logger.info("🎙️ TTS Fetching attempt %s/%s: '%s'", attempt, max_tts_attempts, clean_sentence)
                        tts_start = time.time()
                        async with tts_session.post(
                            tts_url,
                            json={"inputs": [clean_sentence], "target_language_code": sarvam_lang, "speaker": "simran", "model": "bulbul:v3"},
                            headers=tts_headers,
                        ) as res:
                            if res.status == 200:
                                data = await res.json()
                                if "audios" in data and len(data["audios"]) > 0:
                                    tts_duration = (time.time() - tts_start) * 1000
                                    logger.info(f"⏱️ TTS TTFAB (Time to First Audio Byte): {tts_duration:.0f}ms")
                                    log_voice_event("tts_fetched", attempt=attempt, chars=len(clean_sentence), ttfab_ms=round(tts_duration))
                                    audio_b64 = data["audios"][0]
                                    break

                                logger.warning("TTS API returned 200 without audio")
                                log_voice_event("tts_empty_audio", attempt=attempt)
                            else:
                                error_text = await res.text()
                                logger.error(f"TTS API Error: {res.status} - {error_text}")
                                log_voice_event("tts_api_error", attempt=attempt, status=res.status)
                                if res.status < 500 and res.status != 429:
                                    break
                    except Exception as e:
                        logger.error(f"TTS Fetch Error on attempt {attempt}: {e}")
                        log_voice_event("tts_fetch_error", attempt=attempt, error=type(e).__name__)

                    if attempt < max_tts_attempts:
                        await asyncio.sleep(0.35 * attempt)

                if not audio_b64:
                    telemetry["tts_failures"] += 1
                    log_voice_event("tts_failed", chars=len(clean_sentence))

                # Wait for previous chunk to finish sending before we send ours
                await my_turn.wait()

                if audio_b64:
                    try:
                        await websocket.send_text(json.dumps({"type": "audio", "data": audio_b64}))
                        log_voice_event("audio_sent", chars=len(clean_sentence))
                    except Exception as ws_err:
                        logger.warning(f"Could not send audio to websocket: {ws_err}")
                        log_voice_event("audio_send_failed", error=type(ws_err).__name__)

                # Signal the next chunk that it's their turn
                next_turn.set()

            active_tasks = []
            while True:
                sentence = await tts_queue.get()
                if sentence is None:
                    break

                # Chain: this chunk waits for prev_ready, then signals its own next_ready
                my_turn = prev_ready
                next_ready = asyncio.Event()
                task = asyncio.create_task(fetch_and_send(sentence, my_turn, next_ready))
                active_tasks.append(task)
                prev_ready = next_ready

            # Wait for all in-flight TTS tasks to complete before exiting
            if active_tasks:
                await asyncio.gather(*active_tasks, return_exceptions=True)

    try:
        ingest_task = asyncio.create_task(audio_ingest_worker())
        llm_task = asyncio.create_task(llm_stream_worker())
        tts_task = asyncio.create_task(tts_pipeline_worker())
        
        logger.info("🚀 All pipeline workers launched — ready to process audio")
        
        await asyncio.gather(
            client_task,
            ingest_task,
            llm_task,
            tts_task,
            return_exceptions=True
        )
    except Exception as e:
        logger.error(f"Core pipeline exception caught: %s", e)
        log_voice_event("pipeline_exception", error=type(e).__name__)
    finally:
        log_voice_event("session_end", **telemetry)
        await audio_ingest_queue.put(None)
        await llm_trigger_queue.put(None)
        await tts_queue.put(None)
        try:
            if 'dg_ws' in locals():
                await dg_ws.close()
        except Exception:
            pass
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════════════
# REST ENDPOINTS: INTENT, STT, TTS (Required for Scene Scanner & Fallbacks)
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/intent",
    response_model=IntentResponse,
    summary="Conversational Loop & Intent Classification",
)
async def classify_voice_intent(
    body: IntentRequest,
    user: CurrentUser = Depends(get_current_user),
) -> IntentResponse:
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
        return IntentResponse(
            target="None",
            replyText="I'm having trouble processing your request due to a poor connection. Please try again.",
            requiresResponse=False,
        )

    target = result["target"]
    action = result.get("action")
    reply_text = result.get("replyText")

    await set_cache(
        cache_key,
        {"target": target, "action": action, "replyText": reply_text},
        expire_seconds=86400,
    )

    return IntentResponse(target=target, action=action, replyText=reply_text)

@router.post(
    "/stt",
    response_model=STTResponse,
    summary="Speech-to-Text via Sarvam AI",
)
async def speech_to_text(
    request: Request,
    language: str = "hi",
    user: CurrentUser = Depends(get_current_user),
) -> STTResponse:
    audio_data = await request.body()
    if not audio_data:
        raise HTTPException(status_code=400, detail="Request body is empty.")

    try:
        deepgram_lang = "en" if language.lower() == "english" else "hi"
        result = await deepgram_service.speech_to_text(audio_data, language=deepgram_lang)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="STT service unavailable.") from exc

    return STTResponse(
        transcript=result["transcript"],
        language_code=result["language_code"],
    )

@router.post(
    "/tts",
    summary="Text-to-Speech via Sarvam AI",
)
async def text_to_speech(
    body: TTSRequest,
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    logger.info("TTS request from user=%s: '%s'", user.uid, body.text[:80])

    cache_str = f"{body.text}:{body.language_code}:{body.speaker}:{body.model}"
    cache_key = f"voice:tts:{hashlib.sha256(cache_str.encode('utf-8')).hexdigest()}"

    cached_data = await get_cache(cache_key)
    if cached_data and "audio_b64" in cached_data:
        audio_bytes = base64.b64decode(cached_data["audio_b64"])
    else:
        try:
            audio_bytes = await sarvam_service.text_to_speech(
                text=body.text,
                language_code=body.language_code,
                speaker=body.speaker,
                model=body.model,
            )
            await set_cache(
                cache_key,
                {"audio_b64": base64.b64encode(audio_bytes).decode("utf-8")},
                expire_seconds=86400,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="TTS service unavailable.") from exc

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="echovision_tts.wav"'},
    )
