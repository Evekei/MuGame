import re

from app.schemas.lyrics import LyricLine

OFFSET_PATTERN = re.compile(r"\[offset:([+-]?\d+)]", re.IGNORECASE)
TIMESTAMP_PATTERN = re.compile(r"\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?]")


def parse_lrc(original_lrc: str, translated_lrc: str | None = None) -> list[LyricLine]:
    original_lines = parse_single_lrc(original_lrc)
    translation_lines = parse_single_lrc(translated_lrc or "")
    translations = {line.time_ms: line.text for line in translation_lines if line.text}

    return [
        LyricLine(
            time_ms=line.time_ms,
            text=line.text,
            translation=translations.get(line.time_ms),
        )
        for line in original_lines
    ]


def parse_single_lrc(lrc: str) -> list[LyricLine]:
    stripped_lines = [line.strip() for line in lrc.splitlines() if line.strip()]
    if not stripped_lines:
        return []

    offset = parse_offset(lrc)
    parsed: list[tuple[int, int, str]] = []
    untimed: list[str] = []

    for index, line in enumerate(stripped_lines):
        timestamps = list(TIMESTAMP_PATTERN.finditer(line))
        text = TIMESTAMP_PATTERN.sub("", line).strip()
        if not timestamps:
            if not line.lower().startswith("[offset:"):
                untimed.append(line)
            continue
        for timestamp in timestamps:
            parsed.append((timestamp_to_ms(timestamp) + offset, index, text))

    if parsed:
        return [
            LyricLine(time_ms=max(0, time_ms), text=text)
            for time_ms, _index, text in sorted(parsed, key=lambda item: (item[0], item[1]))
        ]

    return [LyricLine(time_ms=0, text=line) for line in untimed]


def parse_offset(lrc: str) -> int:
    match = OFFSET_PATTERN.search(lrc)
    if not match:
        return 0
    return int(match.group(1))


def timestamp_to_ms(match: re.Match[str]) -> int:
    minutes = int(match.group(1))
    seconds = int(match.group(2))
    fraction = match.group(3) or "0"
    milliseconds = int(fraction.ljust(3, "0")[:3])
    return ((minutes * 60) + seconds) * 1000 + milliseconds
