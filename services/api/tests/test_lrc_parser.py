from app.domain.lrc_parser import parse_lrc, parse_single_lrc


def test_parse_lrc_handles_offset_and_translation() -> None:
    lines = parse_lrc(
        "[offset:500]\n[00:01.00]Hello\n[00:02.20]World",
        "[00:01.50]你好\n[00:02.70]世界",
    )

    assert [line.time_ms for line in lines] == [1500, 2700]
    assert lines[0].translation == "你好"
    assert lines[1].translation == "世界"


def test_parse_lrc_keeps_repeated_timestamps() -> None:
    lines = parse_single_lrc("[00:03.00]First\n[00:03.00]Second")

    assert [(line.time_ms, line.text) for line in lines] == [
        (3000, "First"),
        (3000, "Second"),
    ]


def test_parse_lrc_handles_multiple_timestamps_on_one_line() -> None:
    lines = parse_single_lrc("[00:01.00][00:02.00]Echo")

    assert [(line.time_ms, line.text) for line in lines] == [
        (1000, "Echo"),
        (2000, "Echo"),
    ]


def test_parse_lrc_handles_untimed_text_and_empty_lyrics() -> None:
    assert parse_single_lrc("") == []

    lines = parse_single_lrc("Plain line\nAnother line")

    assert [(line.time_ms, line.text) for line in lines] == [
        (0, "Plain line"),
        (0, "Another line"),
    ]
