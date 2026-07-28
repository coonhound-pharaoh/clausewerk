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


def test_cross_origin_read_access_is_not_granted_by_default(monkeypatch):
    monkeypatch.delenv("CW_ORIGIN", raising=False)
    handler = handler_with_headers()
    sent = []
    handler.send_header = lambda name, value: sent.append((name.lower(), value))

    handler._cors()

    assert not any(name == "access-control-allow-origin" for name, _ in sent)


def test_an_explicit_development_origin_is_granted(monkeypatch):
    monkeypatch.setenv("CW_ORIGIN", "http://127.0.0.1:5173")
    handler = handler_with_headers()
    sent = []
    handler.send_header = lambda name, value: sent.append((name.lower(), value))

    handler._cors()

    assert ("access-control-allow-origin", "http://127.0.0.1:5173") in sent


def test_duplicate_document_selectors_are_refused():
    handler = handler_with_headers()

    query, refused = handler._query("run=RUN-1&run=RUN-2")

    assert query == {}
    assert refused is not None
    assert refused.status == 400


def test_pathologically_long_content_length_is_a_caller_error_not_a_crash():
    handler = handler_with_headers(("Content-Length", "9" * 5000), body=b"")

    body, refused = handler._read_body()

    assert body is None
    assert refused is not None
    assert refused.status == 400


def test_ignored_query_fields_cannot_grow_without_bound():
    handler = handler_with_headers()
    raw = "&".join(f"ignored{i}=x" for i in range(100))

    query, refused = handler._query(raw)

    assert query == {}
    assert refused is not None
    assert refused.status == 400


def test_malformed_percent_escape_is_not_treated_as_a_filename():
    handler = handler_with_headers()

    relative, refused = handler._static_relative("/assets/%ZZ/app.js")

    assert relative is None
    assert refused is not None
    assert refused.status == 400


def test_invalid_utf8_path_is_not_replaced_into_another_filename():
    handler = handler_with_headers()

    relative, refused = handler._static_relative("/assets/%FF.js")

    assert relative is None
    assert refused is not None
    assert refused.status == 400


def test_malformed_absolute_request_target_is_a_400_not_a_crash():
    handler = handler_with_headers()

    parsed, refused = handler._parse_target("http://[bad/")

    assert parsed is None
    assert refused is not None
    assert refused.status == 400
