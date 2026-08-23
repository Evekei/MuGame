SENSITIVE_COOKIE_NAMES = {
    "MUSIC_U",
    "MUSIC_A",
    "MUSIC_R_T",
    "MUSIC_R_I",
    "__csrf",
    "NMTID",
}


def redact_value(value: str) -> str:
    if not value:
        return "[REDACTED]"

    if len(value) <= 4:
        return "[REDACTED]"

    return f"[REDACTED:{value[-4:]}]"


def redact_cookie_map(cookies: dict[str, str]) -> dict[str, str]:
    return {name: redact_value(value) for name, value in cookies.items()}


def redact_cookie_header(header: str) -> str:
    redacted_parts: list[str] = []
    for raw_part in header.split(";"):
        part = raw_part.strip()
        if not part:
            continue

        name, separator, value = part.partition("=")
        if separator and name in SENSITIVE_COOKIE_NAMES:
            redacted_parts.append(f"{name}={redact_value(value)}")
        elif separator:
            redacted_parts.append(f"{name}=[REDACTED]")
        else:
            redacted_parts.append("[REDACTED]")

    return "; ".join(redacted_parts)
