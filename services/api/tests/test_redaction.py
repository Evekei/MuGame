import logging

from app.core.redaction import redact_cookie_header, redact_cookie_map


def test_redacts_cookie_values_from_maps() -> None:
    redacted = redact_cookie_map({"MUSIC_U": "very-secret-cookie"})

    assert redacted == {"MUSIC_U": "[REDACTED:okie]"}
    assert "very-secret-cookie" not in str(redacted)


def test_redacts_cookie_values_from_headers() -> None:
    header = "MUSIC_U=very-secret-cookie; __csrf=csrf-token"

    redacted = redact_cookie_header(header)

    assert "very-secret-cookie" not in redacted
    assert "csrf-token" not in redacted
    assert "MUSIC_U=" in redacted


def test_logged_cookie_message_does_not_include_full_secret(caplog) -> None:
    logger = logging.getLogger("test-redaction")

    with caplog.at_level(logging.INFO):
        logger.info("cookies=%s", redact_cookie_map({"MUSIC_U": "secret-cookie"}))

    assert "secret-cookie" not in caplog.text
    assert "[REDACTED:okie]" in caplog.text
