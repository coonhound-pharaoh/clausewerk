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
