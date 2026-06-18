"""
EchoVision Backend — Authentication Schemas
"""

from pydantic import BaseModel, Field


class PhoneVerifyRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    phone_number: str = Field(..., min_length=10, max_length=15)


class TokenResponse(BaseModel):
    uid: str
    message: str
