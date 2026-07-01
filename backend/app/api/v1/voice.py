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
- Scene Scanner: <ACTION: SCENE_SCANNER>
- Text Reader: <ACTION: TEXT_READER>
- SOS: <ACTION: SOS>
- Confirm SOS: <ACTION: CONFIRM_SOS>
- Cancel SOS: <ACTION: CANCEL_SOS>
- Dark Mode: <ACTION: DARK_MODE>
- Light Mode: <ACTION: LIGHT_MODE>
- Haptics On: <ACTION: HAPTICS_ON>
- Haptics Off: <ACTION: HAPTICS_OFF>
- TalkBack On: <ACTION: TALKBACK_ON>
- TalkBack Off: <ACTION: TALKBACK_OFF>
- Update Location: <ACTION: UPDATE_LOCATION>
- Capture Photo / Click Photo: <ACTION: CAPTURE>
- Turn on/off Flashlight: <ACTION: FLASHLIGHT>
- Stop Reading / Interrupt: <ACTION: INTERRUPT_TTS>
- Stop/Close Voice Assistant: <ACTION: TURN_OFF_ASSISTANT>

GROUNDING AND SAFETY:
- Use only the user message, conversation history, current page, location, weather, date/time, and known EchoVision capabilities.
- Do not invent places, routes, weather, names, settings, contacts, or app features. If needed information is missing, ask one clear follow-up question.
- Do not answer general knowledge, politics, sports, coding, trivia, medical, legal, or financial questions. Briefly say you can help with EchoVision, current weather/time/location, navigation distance, and app actions.
- Never ask blind users visual questions like what they can see. Offer app actions such as taking a photo, opening Scene Scanner, reading text, or turning on flashlight when appropriate.
- Never output unsupported actions or map a request to the wrong action just to be helpful.

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
    emergency_contact: str = "Emergency Services"
):
    user_name = user_name.split()[0] if user_name else "User"
    dg_lang = "en-IN" if language.lower() == "english" else "hi"
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
            "language": "english" if language.lower() == "english" else "hindi",
            "active_page": active_page,
            **fields,
        }
        logger.info("voice_session %s", json.dumps(payload, ensure_ascii=False, default=str))

    log_voice_event("session_start")

    weather_context = ""
    async def fetch_weather_bg():
        nonlocal weather_context
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
            except Exception as e:
                logger.error(f"Failed to fetch weather: {type(e).__name__} - {e}")
                
    # Fetch weather completely in the background so it doesn't delay STT connection
    asyncio.create_task(fetch_weather_bg())

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
                            nonlocal active_page
                            if data.get("active_page"):
                                active_page = data.get("active_page")
                                logger.info(f"🔄 Context Updated: active_page = {active_page}")
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
                                        
                            await llm_trigger_queue.put(transcript)
            except websockets.exceptions.ConnectionClosed as exc:
                log_voice_event("deepgram_listen_closed", code=getattr(exc, "code", None))
            except Exception as e:
                logger.error(f"Deepgram Listen Error: {e}")
                log_voice_event("deepgram_listen_error", error=type(e).__name__)

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
                break

    async def llm_stream_worker():
        if language.lower() != "english":
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
                "- Never say you are doing an action unless the matching action tag is present."
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
                "- Never say you are doing an action unless the matching action tag is present."
            )

        location_context = f"\n\nCURRENT PAGE CONTEXT:\nThe user is currently on the '{active_page}' page of the app."
        if current_location:
            location_context += f"\n\nCURRENT LOCATION:\n{current_location}"
        if home_location:
            location_context += f"\n\nHOME LOCATION:\n{home_location}"
        if location_context:
            location_context = "\nLOCATION CONTEXT (use this to answer location questions accurately):" + location_context

        # Get current date and time in IST
        tz = pytz.timezone('Asia/Kolkata')
        now = datetime.now(tz)
        time_context = f"\n\n[CONTEXT] CURRENT DATE & TIME:\nToday is {now.strftime('%A, %B %d, %Y')}. The current time is {now.strftime('%I:%M %p')}. TIME & DATE RULE: ONLY state the time or date if the user EXPLICITLY asks for it. When answering date or day queries, state it simply and directly (e.g., 'आज बुधवार है' or 'आज 01 जुलाई है'). DO NOT say things like 'मंगलवार नहीं, बल्कि बुधवार है' (not tuesday, but wednesday). Just give the direct answer naturally."
        
        if weather_context:
            time_context += weather_context

        selected_language = "english" if language.lower() == "english" else "hindi"
        language_override = (
            f"\n\nCURRENT SELECTED LANGUAGE: {selected_language}\n"
            "This is the user's current app language setting and it overrides examples, old memory, and previous turns. "
            "If it is english, every spoken word must be English only. "
            "If it is hindi, every spoken word must be Devanagari Hindi except short app feature names such as Settings, Scene Scanner, Text Reader, SOS, Camera, Photo, Flashlight, and TalkBack. "
            "Action tags must stay exactly as tags and do not count as spoken language."
        )

        if language.lower() != "english":
            user_context = (
                f"\n\nUSER INFO:\n"
                f"The user's name is '{user_name}'. Use it rarely, at most once, and only when it feels natural. Do not place the name at the end of a sentence.\n"
                f"CONVERSATION STYLE: Be warm, respectful, calm, and human-like. Use 'आप' style respect in Hindi. Do not use Sir, Ma'am, Sahab, or overly formal titles. Do not greet on every turn; greet only when the user greets you or the conversation naturally starts.\n"
                f"FEMININE PERSONA: The assistant voice is female. In Hindi, always use feminine first-person grammar. Never use masculine first-person forms.\n"
                f"EMPATHY: If the user sounds worried, confused, sad, or stressed, acknowledge that briefly before helping. For direct commands, execute the command without unnecessary follow-up.\n"
                f"SOS FLOW: If the user asks for SOS or emergency help, output <ACTION: SOS> and ask clearly whether to alert {emergency_contact}. If the user confirms while SOS is pending, output <ACTION: CONFIRM_SOS>. If the user cancels while SOS is pending, output <ACTION: CANCEL_SOS>. Do not confuse assistant shutdown with SOS.\n"
                f"CAPABILITIES: EchoVision helps blind and visually impaired users with Scene Scanner for surroundings, Text Reader for written text, SOS emergency alerts, Settings, language, haptics, TalkBack, theme, location update, weather/time/location answers from provided context, and OSRM distance checks. Explain these in plain speech when asked, without exposing action tags.\n"
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
                f"CAPABILITIES: EchoVision helps blind and visually impaired users with Scene Scanner for surroundings, Text Reader for written text, SOS emergency alerts, Settings, language, haptics, TalkBack, theme, location update, weather/time/location answers from provided context, and OSRM distance checks. Explain these in plain speech when asked, without exposing action tags.\n"
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

                def localized_text(english_text: str, hindi_text: str) -> str:
                    if language.lower() == "english":
                        return english_text
                    return hindi_text
                
                # Assemble system prompt with the LATEST active_page
                current_system = SYSTEM_PROMPT + "\n" + sys_lang + language_override + location_context + time_context + "\n" + user_context
                current_system += f"\n\nCURRENT PAGE: {active_page}\n"
                if active_page not in ["Scene Scanner", "Text Reader"]:
                    current_system += "CRITICAL: You are NOT on a camera page. If the user asks to take a photo or scan, you MUST output <ACTION: SCENE_SCANNER> BEFORE <ACTION: CAPTURE>. If the user asks to turn on the flashlight, DO NOT output <ACTION: FLASHLIGHT>. Instead, tell the user that the flashlight can only be used on the scanner screens."
                else:
                    current_system += "CRITICAL: You are ALREADY on a camera page. If the user asks to take a photo, you MUST ONLY output <ACTION: CAPTURE>. DO NOT output <ACTION: SCENE_SCANNER>. If they ask to turn on the flashlight, you may output <ACTION: FLASHLIGHT>."
                
                
                messages = [{"role": "system", "content": current_system}]
                messages.extend(chat_history[-6:]) # Keep last 6 messages
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
                                    if final_text and "<IGNORE>" not in final_text: 
                                        if "<ACTION" not in final_text:
                                            await tts_queue.put(final_text)
                                            
                                    if full_response.strip() and "<IGNORE>" not in full_response:
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
                                        try:
                                            await websocket.send_text(json.dumps({"type": "action", "command": command}))
                                            log_voice_event("action_sent", command=command)
                                            # Track page changes for context
                                            if "SCENE_SCANNER" in command:
                                                active_page = "Scene Scanner"
                                            elif "TEXT_READER" in command:
                                                active_page = "Text Reader"
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
                                        if clean_check and "<IGNORE>" not in sentence:
                                            # Ensure we aren't sending a partial action tag
                                            if "<ACTION" not in sentence:
                                                is_first_chunk = False
                                                await tts_queue.put(sentence)
                    
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
        sarvam_lang = "en-IN" if language.lower() == "english" else "hi-IN"
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
