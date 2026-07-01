"""
EchoVision Backend — Voice Endpoint Schemas

Pydantic models for request validation and response serialization
across all ``/api/v1/voice/*`` endpoints.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

# ═══════════════════════════════════════════════════════════════════════════
# Intent Classification
# ═══════════════════════════════════════════════════════════════════════════


class IntentTarget(str, Enum):
    """Valid navigation targets returned by the intent classifier."""

    SCANNER = "Scanner"
    TEXT_READER = "TextReader"
    SOS = "SOS"
    DASHBOARD = "Dashboard"
    SETTINGS = "Settings"


class IntentRequest(BaseModel):
    """Request body for ``POST /api/v1/voice/intent``."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="Transcribed Hinglish voice command string from the client.",
        examples=["mujhe scene dikhao", "yeh kya likha hai", "emergency help chahiye"],
    )
    language: str = Field(
        default="hindi",
        description="User language preference (english, hindi, hinglish)",
    )
    username: str | None = Field(
        default=None,
        description="User's display name to personalize greetings.",
    )
    is_first_message: bool = Field(
        default=False,
        description="Whether this is the first message in the session.",
    )
    home_location: str | None = Field(
        default=None,
        description="The user's saved home address.",
    )
    current_location: str | None = Field(
        default=None,
        description="The user's current GPS location string.",
    )


class IntentResponse(BaseModel):
    """Response body for ``POST /api/v1/voice/intent``."""

    target: Literal["SceneScanner", "TextReader", "SOS", "Dashboard", "Settings", "None"] = Field(
        ...,
        description="The classified navigation target.",
        examples=["SceneScanner"],
    )
    action: str | None = Field(
        default=None,
        description="Optional system action to execute (e.g. toggle_haptics_off, set_language_english).",
        examples=["toggle_haptics_off", "set_language_english"],
    )
    reply_text: str | None = Field(
        default=None,
        alias="replyText",
        description="Optional conversational reply text to speak back to the user.",
    )
    requires_response: bool = Field(
        default=False,
        alias="requiresResponse",
        description="If true, the client should re-open the mic for a follow-up.",
    )

    class Config:
        populate_by_name = True


# ═══════════════════════════════════════════════════════════════════════════
# Text-to-Speech
# ═══════════════════════════════════════════════════════════════════════════


class TTSRequest(BaseModel):
    """Request body for ``POST /api/v1/voice/tts``."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Plain text to be synthesized into speech audio.",
        examples=["Yeh ek sundar park hai jahan bachche khel rahe hain."],
    )
    language_code: str = Field(
        default="hi-IN",
        description="BCP-47 language code for TTS voice selection.",
        examples=["hi-IN", "en-IN"],
    )
    speaker: str = Field(
        default="simran",
        description="Speaker voice to use (e.g., simran, arvind).",
        examples=["simran", "arvind"],
    )
    model: str = Field(
        default="bulbul:v3",
        description="Sarvam AI TTS model identifier.",
        examples=["bulbul:v3"],
    )


# ═══════════════════════════════════════════════════════════════════════════
# Speech-to-Text
# ═══════════════════════════════════════════════════════════════════════════


class STTResponse(BaseModel):
    """Response body for ``POST /api/v1/voice/stt``."""

    transcript: str = Field(
        ...,
        description="The transcribed text from the submitted audio.",
        examples=["mujhe scene scanner kholna hai"],
    )
    language_code: str = Field(
        default="hi-IN",
        description="Detected language of the audio.",
        examples=["hi-IN"],
    )
