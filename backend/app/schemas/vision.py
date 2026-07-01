"""
EchoVision Backend — Vision Endpoint Schemas

Pydantic models for request validation and response serialization
across all ``/api/v1/vision/*`` endpoints.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    """Request body for ``POST /api/v1/vision/scan``."""

    image_base64: str = Field(
        ...,
        min_length=100,
        description=(
            "Base64-encoded image string (JPEG or PNG). "
            "Do NOT include the ``data:image/...;base64,`` prefix — send raw base64 only."
        ),
    )
    mime_type: str = Field(
        default="image/jpeg",
        description="MIME type of the encoded image.",
        examples=["image/jpeg", "image/png"],
    )
    language: str = Field(
        default="hindi",
        description="The language to generate the description in. e.g. english or hindi.",
        examples=["hindi", "english"],
    )


class ScanResponse(BaseModel):
    """Response body for ``POST /api/v1/vision/scan``."""

    description: str = Field(
        ...,
        description=(
            "Natural spoken Hindi or English scene summary of the image content, "
            "limited to a maximum of 3 sentences."
        ),
        examples=[
            "यह एक पार्क है जहाँ बच्चे खेल रहे हैं। "
            "पेड़ के नीचे एक बेंच है और कुछ लोग बैठे हैं। "
            "मौसम साफ और धूप वाला लग रहा है।"
        ],
    )

class FormatOCRRequest(BaseModel):
    """Request body for ``POST /api/v1/vision/format-ocr``."""

    raw_text: str = Field(
        ...,
        min_length=1,
        description="Raw text extracted via on-device ML Kit OCR.",
    )

class FormatOCRResponse(BaseModel):
    """Response body for ``POST /api/v1/vision/format-ocr``."""

    cleaned_text: str = Field(
        ...,
        description="The cleaned, formatted text safe for TTS.",
    )
    language_code: Literal["hi-IN", "en-IN"] = Field(
        ...,
        description="The detected dominant language code for Sarvam TTS.",
    )
