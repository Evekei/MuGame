from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class NeteaseSessionCookie(BaseModel):
    name: str = Field(min_length=1)
    value: str = Field(min_length=1)
    domain: str | None = None
    path: str | None = None


class NeteaseSessionSnapshot(BaseModel):
    cookies: list[NeteaseSessionCookie]
    captured_at: datetime | None = None


class NeteaseAccountProfile(BaseModel):
    user_id: str
    nickname: str
    avatar_url: str | None = None


class NeteaseAccountSessionResponse(BaseModel):
    status: Literal["logged_in", "logged_out", "expired"]
    profile: NeteaseAccountProfile | None = None
    checked_at: datetime
