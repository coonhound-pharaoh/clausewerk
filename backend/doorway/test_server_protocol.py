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


def test_duplicate_content_types_are_refused_as_ambiguous():
    handler = handler_with_headers(
        ("Host", "localhost"),
        ("Content-Type", "application/json"),
        ("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        body=b"{}",
    )
    handler.path = "/api/sign-in"
    answered = []
    handler._respond = answered.append

    handler.do_POST()

    assert answered[0].status == 400
    assert handler.rfile.tell() == 0


def test_http_11_requires_one_unambiguous_host():
    for headers in (
        (),
        (("Host", ""),),
        (("Host", "first"), ("Host", "second")),
        (("Host", "first, second"),),
        (("Host", "host:not-a-port"),),
        (("Host", "user@host"),),
        (("Host", "host/path"),),
        (("Host", "host with-space"),),
        (("Host", "[::1"),),
    ):
        handler = handler_with_headers(*headers)
        handler.request_version = "HTTP/1.1"
        assert handler._host_is_ambiguous(), headers

    handler = handler_with_headers(("Host", "127.0.0.1:8787"))
    handler.request_version = "HTTP/1.1"
    assert not handler._host_is_ambiguous()

    ipv6 = handler_with_headers(("Host", "[::1]:8787"))
    ipv6.request_version = "HTTP/1.1"
    assert not ipv6._host_is_ambiguous()


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

    for raw in ("run=RUN-1&run=RUN-2", "run=&run=RUN-2"):
        query, refused = handler._query(raw)

        assert query == {}, raw
        assert refused is not None, raw
        assert refused.status == 400, raw


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


def test_invalid_utf8_query_selector_is_not_replaced_into_another_identifier():
    handler = handler_with_headers()

    query, refused = handler._query("run=%FF")

    assert query == {}
    assert refused is not None
    assert refused.status == 400


def test_malformed_percent_escape_is_not_treated_as_a_query_identifier():
    handler = handler_with_headers()

    query, refused = handler._query("run=%ZZ")

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


def test_null_byte_path_is_refused_before_filesystem_resolution():
    handler = handler_with_headers()

    relative, refused = handler._static_relative("/assets/app%00.js")

    assert relative is None
    assert refused is not None
    assert refused.status == 400


def test_malformed_absolute_request_target_is_a_400_not_a_crash():
    handler = handler_with_headers()

    parsed, refused = handler._parse_target("http://[bad/")

    assert parsed is None
    assert refused is not None
    assert refused.status == 400


def test_only_origin_form_request_targets_are_accepted():
    handler = handler_with_headers()

    for ambiguous in (
        "http://example.test/api/me",
        "//example.test/api/me",
        "/api/me#different-resource",
        "api/me",
    ):
        parsed, refused = handler._parse_target(ambiguous)
        assert parsed is None, ambiguous
        assert refused is not None and refused.status == 400, ambiguous

    parsed, refused = handler._parse_target("/api/me?run=RUN-1")
    assert refused is None
    assert parsed is not None and parsed.path == "/api/me"
