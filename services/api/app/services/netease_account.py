from datetime import UTC, datetime
import logging

from app.core.errors import AppError
from app.core.redaction import redact_cookie_map
from app.integrations.netease.account_client import (
    NeteaseAccountClient,
    NeteaseAccountUnavailable,
    NeteaseSessionExpired,
    filter_netease_cookies,
)
from app.repositories.account_session_repository import AccountSessionRepository
from app.schemas.account import (
    NeteaseAccountProfile,
    NeteaseAccountSessionResponse,
    NeteaseSessionSnapshot,
)

logger = logging.getLogger(__name__)


class NeteaseAccountService:
    def __init__(
        self,
        repository: AccountSessionRepository,
        account_client: NeteaseAccountClient,
    ):
        self.repository = repository
        self.account_client = account_client

    def read_session(self) -> NeteaseAccountSessionResponse:
        record = self.repository.get_netease_session()
        if record is None:
            return self._response("logged_out")

        try:
            profile = self.account_client.verify_session(record.cookies)
        except NeteaseSessionExpired:
            self.repository.clear_netease_session()
            return self._response("expired")
        except NeteaseAccountUnavailable as error:
            raise AppError(
                "netease_account_unavailable",
                "Unable to verify NetEase account session.",
                502,
            ) from error

        self.repository.save_netease_session(record.cookies, profile)
        return self._response("logged_in", profile)

    def save_session(
        self, snapshot: NeteaseSessionSnapshot
    ) -> NeteaseAccountSessionResponse:
        cookies = filter_netease_cookies(
            {cookie.name: cookie.value for cookie in snapshot.cookies}
        )
        logger.info(
            "Saving NetEase session cookies: %s",
            redact_cookie_map(cookies),
        )

        try:
            profile = self.account_client.verify_session(cookies)
        except NeteaseSessionExpired:
            self.repository.clear_netease_session()
            return self._response("expired")
        except NeteaseAccountUnavailable as error:
            raise AppError(
                "netease_account_unavailable",
                "Unable to verify NetEase account session.",
                502,
            ) from error

        self.repository.save_netease_session(cookies, profile)
        return self._response("logged_in", profile)

    def clear_session(self) -> NeteaseAccountSessionResponse:
        self.repository.clear_netease_session()
        return self._response("logged_out")

    def _response(
        self,
        status: str,
        profile: NeteaseAccountProfile | None = None,
    ) -> NeteaseAccountSessionResponse:
        return NeteaseAccountSessionResponse(
            status=status, profile=profile, checked_at=datetime.now(UTC)
        )
