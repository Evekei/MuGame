from dataclasses import dataclass
from typing import Any

import httpx

from app.schemas.account import NeteaseAccountProfile

ALLOWED_NETEASE_COOKIE_NAMES = {
    "MUSIC_U",
    "MUSIC_A",
    "MUSIC_R_T",
    "MUSIC_R_I",
    "__csrf",
    "NMTID",
}

AUTH_COOKIE_NAMES = {"MUSIC_U", "MUSIC_A"}


class NeteaseSessionExpired(Exception):
    pass


class NeteaseAccountUnavailable(Exception):
    pass


@dataclass(frozen=True)
class NeteaseAccountClient:
    profile_url: str
    timeout_seconds: float

    def verify_session(self, cookies: dict[str, str]) -> NeteaseAccountProfile:
        filtered_cookies = filter_netease_cookies(cookies)
        if not has_auth_cookie(filtered_cookies):
            raise NeteaseSessionExpired()

        try:
            response = httpx.get(
                self.profile_url,
                cookies=filtered_cookies,
                headers={
                    "Referer": "https://music.163.com/",
                    "User-Agent": "MuGame Mobile",
                },
                timeout=self.timeout_seconds,
            )
        except httpx.HTTPError as error:
            raise NeteaseAccountUnavailable() from error

        if response.status_code in {301, 401, 403}:
            raise NeteaseSessionExpired()
        if response.status_code >= 400:
            raise NeteaseAccountUnavailable()

        try:
            payload = response.json()
        except ValueError as error:
            raise NeteaseAccountUnavailable() from error

        return parse_profile_response(payload)


def filter_netease_cookies(cookies: dict[str, str]) -> dict[str, str]:
    return {
        name: value
        for name, value in cookies.items()
        if name in ALLOWED_NETEASE_COOKIE_NAMES and value
    }


def has_auth_cookie(cookies: dict[str, str]) -> bool:
    return any(name in cookies for name in AUTH_COOKIE_NAMES)


def parse_profile_response(payload: dict[str, Any]) -> NeteaseAccountProfile:
    if payload.get("code") in {301, 401, 403}:
        raise NeteaseSessionExpired()

    profile = payload.get("profile")
    if not isinstance(profile, dict):
        raise NeteaseSessionExpired()

    user_id = profile.get("userId")
    nickname = profile.get("nickname")
    if user_id is None or not nickname:
        raise NeteaseSessionExpired()

    avatar_url = profile.get("avatarUrl")
    return NeteaseAccountProfile(
        user_id=str(user_id),
        nickname=str(nickname),
        avatar_url=str(avatar_url) if avatar_url else None,
    )
