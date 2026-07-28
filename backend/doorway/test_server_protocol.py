"""Fast protocol tests that do not need a database or a listening socket."""

from __future__ import annotations

from email.message import Message
from io import BytesIO

from doorway.server import Handler


def handler_with_headers(*pairs: tuple[str, str], body: bytes = b"") -> Handler:
    handler = object.__new__(Handler)
    handler.headers = Message()
    for name, value in pairs:
        handler.headers.add_header(name, value)
    handler.rfile = BytesIO(body)
    return handler


def test_duplicate_content_lengths_are_refused_as_ambiguous():
    handler = handler_with_headers(
        ("Content-Length", "2"),
        ("Content-Length", "3"),
        body=b"{}x",
    )

    body, refused = handler._read_body()

    assert body is None
    assert refused is not None
    assert refused.status == 400
    assert handler.rfile.tell() == 0


def test_content_length_accepts_only_the_http_ascii_decimal_grammar():
    for ambiguous in ("+2", " 2", "2 ", "٢"):
        handler = handler_with_headers(("Content-Length", ambiguous), body=b"{}")

        body, refused = handler._read_body()

        assert body is None, ambiguous
        assert refused is not None, ambiguous
        assert refused.status == 400, ambiguous
        assert handler.rfile.tell() == 0, ambiguous


def test_duplicate_authorization_fields_never_select_an_identity():
    handler = handler_with_headers(
        ("Authorization", "Bearer attacker"),
        ("Authorization", "Bearer victim"),
    )

    assert handler._token() is None
