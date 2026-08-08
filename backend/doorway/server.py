"""The HTTP wrapper. Deliberately thin, and deliberately separate from app.py.

    python -m doorway.server [--port 8787] [--static ../prototype/v4]

Everything that decides anything lives in `App`. This file turns a socket into a
method, a path and a body, and turns a result back into a response.

The bearer token is read from the Authorization header. That is the ONLY thing
this file takes from the request that influences identity, and it names a
SESSION — not a person and not a role. Everything else the browser sends is data.

NO WEB FRAMEWORK, DELIBERATELY

The standard library, as the JavaScript used Node's built-in server. This layer
is a router and a JSON encoder; a framework would add a dependency, a
configuration surface and a set of conventions to the one part of the system that
must stay easy to read in full. The contract engine has no dependencies at all
and the doorway has one — the database driver — and that is worth keeping.

THREADED, AND THAT IS NOT A PERFORMANCE CHOICE

`ThreadingHTTPServer`, so requests genuinely overlap. The entire identity scheme
rests on a connection being handed out, used for exactly one unit of work and
handed back carrying nothing. Served one request at a time, that promise would
never actually be exercised — and the leak it guards against is the one failure
the design cannot survive.

SAME ORIGIN FOR THE SCREENS

Serving the screens from here is not a convenience. Served from somewhere else,
the browser needs cross-origin permission for every call, and the usual way to
make that go away is to relax it until it does — which is how a permissive rule
reaches production because it was easier during development. One origin means no
such rule is ever needed.

NOT EVERYTHING THAT LEAVES HERE IS JSON

A contract leaves as a .docx — bytes, with a content type and a filename. That
is one branch in `_respond` and one writer beneath it, and it is deliberately
the whole of the change: `app.Download` carries what the file IS, so this file
never learns what Word is.

AND NOT EVERYTHING THAT ARRIVES HERE IS JSON EITHER

The mirror of the paragraph above, and the whole of this file's inbound change.
A POST whose content type is not JSON is a DOCUMENT: the bytes are read once,
measured against their own limit, wrapped in `app.Upload` and handed on
untouched. This file never learns what a .docx is on the way in either. The
JSON path is chosen by the same header and is otherwise exactly as it was.

Nothing is stored here. Receiving and storing are separate acts on purpose —
see `app.Upload`.

WHY THE DOCUMENT SELECTOR TRAVELS IN THE URL, and what the alternative was

Asking for a document is a READ, and `GET /runs/contract?run=…` says so. The
write path cannot carry it without lying about what it is: `writes.Write` holds
exactly one SQL statement and one set of body fields, so filing a document read
under it would erase the single distinction reads.py and writes.py exist to
draw.

The live alternative, recorded so nobody has to rediscover it: a body-carried
selector already works elsewhere — `POST /health-checks/rebuild` and `POST
/health-checks/document` take a run or an agreement through a write's fields.
If a later owner prefers that, `QUERY_KEYS`, the `parse_qs` capture below and
`App.handle`'s `query` parameter all come out, and the bytes half stays exactly
as it is.

Ported from `backend/service/server.mjs` on 2026-07-26.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import threading
from email.message import Message
from email.utils import collapse_rfc2231_value
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import ParseResult, parse_qs, unquote, urlparse

from doorway.app import App, Download, Response, Upload, transportable_filename
from doorway.db import Database

# A body bigger than this is refused unread. The JavaScript destroyed the socket
# at the same size; the point is that an unbounded read is a way to exhaust the
# service with one request.
MAX_BODY = 1_000_000
MAX_INFLIGHT_CONNECTIONS = 64

# THE LARGEST DOCUMENT THE SYSTEM WILL ACCEPT, and it is a PRODUCT FACT, not a
# technical detail: it decides which real contracts can be filed and which are
# turned away at the door.
#
# THE OWNER ANSWERED: one gigabyte (U15, 2026-07-29 — docs/open-questions.md
# §13). "Any size" as a requirement, made honest as a ceiling no real contract
# reaches: a 300-page scanned contract runs 100–300 MB. The ceiling exists so
# one upload cannot exhaust the service, not as a claim about typical size.
#
# The number lives twice, deliberately and tied together: here, where an
# oversized upload is refused UNREAD from its content-length header, and as
# the governance row `max_document_bytes` (0047), which
# cw.bind_received_document consults again where the bytes land.
# test_paper.py::test_the_ceiling_here_matches_the_recorded_decision holds the
# two equal, so they cannot drift apart silently. Change one, change both —
# a new migration for the row, this line beside it.
MAX_DOCUMENT_BYTES = 1_073_741_824

# One incomplete client must not own one server thread forever. This covers
# request headers and bodies as well as a client that stops reading a response.
REQUEST_TIMEOUT_SECONDS = 30

# The COMPLETE list of what a browser may name in a query string, in the same
# spirit as reads.READS: one greppable line, so adding a second key is a visible
# act rather than a condition buried in a handler. Anything else the browser
# sends is dropped before App.handle is called.
QUERY_KEYS = ("run", "agreement", "negotiation", "round")
MAX_QUERY_FIELDS = 20

# Routes whose body is bytes rather than a JSON record. This decision must be
# made before reading: otherwise any unknown or JSON-only route can make an
# unauthenticated worker consume a document-sized body before returning 404.
DOCUMENT_ENDPOINTS = frozenset({"/paper/ingest", "/negotiations/redline"})

# THE SET OF THINGS THE SCREENS ARE MADE OF — and, since 2026-08-07, the GATE
# on what may be served rather than a lookup table consulted after the decision.
#
# WHY IT HAD TO BECOME A GATE. Static files are served BEFORE the session is
# established, necessarily: the shell has to load before anybody can sign in. So
# every file under the static root is readable by anyone who can open a socket.
# The suffix was previously used only to choose a content type, with a guess and
# then application/octet-stream behind it — so `_serve_static` handed out
# whatever it found. Verified against a running server: a Python utility in the
# fonts folder was served in full as text/x-python, with no session.
#
# Nothing in there is sensitive today. The point is that it is an ordinary
# directory in the repository that people add files to, and the day a database
# dump, a .env or a page of notes lands in it, that file is published and
# nothing says so.
#
# `.woff2` IS IN THIS LIST FOR A REASON WORTH KEEPING. Eighteen font files were
# being served through the guess path. Making the table a gate without adding
# them would have refused every font and broken every screen — the one real risk
# in the change, closed by naming the type rather than by leaving the gate open.
MIME = {
    ".html": "text/html; charset=utf-8",
    ".jsx": "text/babel; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
}


def _reject_non_finite_json(value: str) -> None:
    raise ValueError(f"{value} is not a JSON number")


def _object_without_duplicate_keys(pairs) -> dict:
    answer = {}
    for key, value in pairs:
        if key in answer:
            raise ValueError(f"duplicate JSON key: {key}")
        answer[key] = value
    return answer


def _has_non_finite_number(value) -> bool:
    """JSON may spell infinity indirectly as an overflowing exponent."""
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, float) and not math.isfinite(current):
            return True
        if isinstance(current, dict):
            pending.extend(current.values())
        elif isinstance(current, list):
            pending.extend(current)
    return False


def _has_unrepresentable_text(value) -> bool:
    """Reject text JSON accepts but UTF-8/PostgreSQL text cannot carry."""
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, str):
            if "\0" in current or any(
                    0xD800 <= ord(char) <= 0xDFFF for char in current):
                return True
        elif isinstance(current, dict):
            pending.extend(current.keys())
            pending.extend(current.values())
        elif isinstance(current, list):
            pending.extend(current)
    return False


class Handler(BaseHTTPRequestHandler):
    # Set by serve() before the server starts.
    app: App = None  # type: ignore[assignment]
    static_root: Path | None = None
    allowed_hostnames: frozenset[str] | None = None

    server_version = "clausewerk"
    sys_version = ""

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)

    # ── The request ─────────────────────────────────────────────────────────

    def do_GET(self) -> None:  # noqa: N802 — the base class names it
        if self._host_is_ambiguous():
            self._respond(Response(400, {"error": "host is ambiguous"}))
            return
        parsed, refused = self._parse_target(self.path)
        if refused is not None:
            self._respond(refused)
            return
        assert parsed is not None

        # Static first, and only for GET. An API path always wins if it exists,
        # because App.handle is the thing that knows what an endpoint is.
        if self.static_root and not parsed.path.startswith("/api/"):
            if self._serve_static(parsed.path):
                return

        selector, refused = self._query(parsed.query)
        if refused is not None:
            self._respond(refused)
            return

        self._respond(self.app.handle("GET", self._endpoint(parsed.path),
                                      token=self._token(), query=selector))

    def do_POST(self) -> None:  # noqa: N802
        if self._host_is_ambiguous():
            self._respond(Response(400, {"error": "host is ambiguous"}))
            return
        parsed, refused = self._parse_target(self.path)
        if refused is not None:
            self._respond(refused)
            return
        assert parsed is not None

        if self._content_type_is_ambiguous():
            self._respond(Response(400, {"error": "content type is ambiguous"}))
            return

        if self._content_type_is_malformed():
            self._respond(Response(400, {"error": "content type is malformed"}))
            return

        if self._content_disposition_is_ambiguous():
            self._respond(Response(400, {
                "error": "content disposition is ambiguous"}))
            return

        if self._upload_filename_is_malformed():
            self._respond(Response(400, {
                "error": "document filename is malformed"}))
            return

        if self._is_document():
            endpoint = self._endpoint(parsed.path)
            if endpoint not in DOCUMENT_ENDPOINTS:
                self._respond(Response(415, {
                    "error": "that endpoint does not accept a document"}))
                return
            # The selector travels WITH the document. A document POST names its
            # deal in the query string (?agreement=…) because its body IS the
            # document — there is no JSON record to carry the name. This branch
            # dropped the query until NC-09, so every upload arrived addressed
            # to nobody and the recording act refused it; only the app-level
            # tests passed, because they hand the query to App.handle directly.
            # The query is parsed BEFORE the body so a malformed one is refused
            # unread, the same order the size check argues for.
            selector, refused = self._query(parsed.query)
            if refused is not None:
                self._respond(refused)
                return
            refused = self.app.preflight_session(self._token())
            if refused is not None:
                self._respond(refused)
                return
            upload, refused = self._read_document()
            if refused is not None:
                self._respond(refused)
                return
            self._respond(self.app.handle("POST", endpoint,
                                          token=self._token(), query=selector,
                                          upload=upload))
            return

        body, refused = self._read_body()
        if refused is not None:
            self._respond(refused)
            return
        self._respond(self.app.handle("POST", self._endpoint(parsed.path),
                                      token=self._token(), body=body))

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self._host_is_ambiguous():
            self._respond(Response(400, {"error": "host is ambiguous"}))
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ── The pieces ──────────────────────────────────────────────────────────

    def _endpoint(self, path: str) -> str:
        """The shell calls /api/… so that static paths and endpoints can never
        collide. The prefix is stripped here and nowhere else: App knows nothing
        about it, and the test suites address endpoints by their real names."""
        return path[4:] if path.startswith("/api/") else path

    def _parse_target(self, target: str) -> tuple[ParseResult | None, Response | None]:
        # HTTP request-target syntax is ASCII. Raw controls, DEL and raw
        # non-ASCII bytes are interpreted inconsistently across servers; NUL is
        # especially dangerous because native components may truncate at it.
        # UTF-8 data remains available through ordinary percent encoding, but
        # an encoded NUL is still not a representable path or database value.
        if (any(ord(char) < 33 or ord(char) > 126 for char in target)
                or re.search(r"%00", target, re.IGNORECASE)):
            return None, Response(400, {"error": "the request target is malformed"})
        try:
            parsed = urlparse(target)
        except ValueError:
            return None, Response(400, {"error": "the request target is malformed"})
        # This is an origin server, not a forward proxy. Accept only origin-form
        # targets. Absolute/network-path forms and fragments let intermediaries
        # disagree about the authority or resource while this server silently
        # routes only the path.
        if (not parsed.path.startswith("/") or parsed.scheme or parsed.netloc
                or parsed.fragment):
            return None, Response(400, {"error": "the request target is malformed"})
        # Backslash is not a URI path separator, but Windows treats it as one
        # after the static path is decoded. Encoded slash/backslash creates the
        # same cross-hop ambiguity: a proxy may decode it before routing while
        # this origin decides whether `/api/` is present on the encoded form.
        # Refuse all three spellings before either API or static dispatch.
        if "\\" in parsed.path or re.search(r"%(?:2[fF]|5[cC])", parsed.path):
            return None, Response(400, {"error": "the request target is malformed"})
        if re.search(r"%(?:3[fF]|23)", parsed.path):
            return None, Response(400, {"error": "the request target is malformed"})
        for segment in parsed.path.split("/"):
            dotted = re.sub(r"%2[eE]", ".", segment)
            if dotted in (".", ".."):
                return None, Response(400, {
                    "error": "the request target is malformed"})
        return parsed, None

    def _query(self, raw: str) -> tuple[dict[str, str], Response | None]:
        if re.search(r"%(?![0-9A-Fa-f]{2})", raw):
            return {}, Response(400, {"error": "the query string is malformed"})
        try:
            parsed = parse_qs(
                raw, keep_blank_values=True, errors="strict",
                max_num_fields=MAX_QUERY_FIELDS)
        except ValueError:
            return {}, Response(400, {"error": "the query string is malformed"})
        for key in QUERY_KEYS:
            if len(parsed.get(key, [])) > 1:
                return {}, Response(400, {"error": f"{key} was supplied more than once"})
        return {
            key: values[0]
            for key, values in parsed.items()
            if key in QUERY_KEYS and values
        }, None

    def _token(self) -> str | None:
        values = self.headers.get_all("authorization", [])
        # Two credentials make identity depend on which HTTP hop chooses which
        # field. Refuse the ambiguity instead of authenticating either one.
        if len(values) != 1:
            return None
        header = values[0]
        scheme, separator, credentials = header.partition(" ")
        token = credentials.strip()
        return token if separator and scheme.casefold() == "bearer" and token else None

    def _host_is_ambiguous(self) -> bool:
        values = self.headers.get_all("host", [])
        if len(values) > 1:
            return True
        invalid = bool(values and not self._valid_host_authority(values[0]))
        if getattr(self, "request_version", "HTTP/1.1") == "HTTP/1.1":
            return len(values) != 1 or invalid
        return invalid

    def _valid_host_authority(self, value: str) -> bool:
        if (not value or value != value.strip() or "," in value
                or any(ord(char) < 33 or ord(char) > 126 for char in value)):
            return False
        try:
            parsed = urlparse("//" + value)
            _ = parsed.port
        except ValueError:
            return False
        syntactically_valid = bool(
            parsed.netloc == value
            and parsed.hostname
            and parsed.username is None
            and parsed.password is None
            and not parsed.path
            and not parsed.params
            and not parsed.query
            and not parsed.fragment
        )
        if not syntactically_valid:
            return False
        if self.allowed_hostnames is None:
            return True
        if parsed.hostname.casefold() not in self.allowed_hostnames:
            return False
        listening_port = self.server.server_address[1]
        return parsed.port is None or parsed.port == listening_port

    def _content_length(self) -> tuple[int | None, Response | None]:
        """Return one unambiguous request length.

        Multiple Content-Length fields are refused even when their values agree.
        An intermediary is allowed to combine or choose between them differently
        from this server; accepting either spelling would make the request
        boundary depend on which hop was asked.
        """
        values = self.headers.get_all("content-length", [])
        if len(values) > 1:
            return None, Response(400, {"error": "content length is ambiguous"})
        raw = values[0] if values else "0"
        if re.fullmatch(r"-?[0-9]+", raw) is None:
            return None, Response(400, {"error": "unreadable request"})
        # Keep conversion itself bounded. Python deliberately refuses
        # pathologically long decimal strings; allowing that ValueError to
        # escape would turn an invalid request into a 500.
        if len(raw) > 20:
            return None, Response(400, {"error": "unreadable request"})
        length = int(raw)
        if length < 0:
            return None, Response(400, {"error": "content length cannot be negative"})
        return length, None

    def _read_body(self) -> tuple[dict | None, Response | None]:
        if self.headers.get("transfer-encoding"):
            return None, Response(400, {"error": "transfer encoding is not supported"})
        length, refused = self._content_length()
        if refused is not None:
            return None, refused
        assert length is not None
        if length > MAX_BODY:
            return None, Response(413, {"error": "that request is too large"})
        if length <= 0:
            return None, None
        raw = self.rfile.read(length)
        if len(raw) != length:
            return None, Response(400, {"error": "that request arrived incomplete"})
        try:
            parsed = json.loads(
                raw or b"null",
                parse_constant=_reject_non_finite_json,
                object_pairs_hook=_object_without_duplicate_keys,
            )
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError, RecursionError):
            # Malformed JSON is the caller's mistake, not a refusal. Saying
            # "refused" here would send somebody to argue about permissions.
            return None, Response(400, {"error": "that request was not valid JSON"})
        if _has_non_finite_number(parsed):
            return None, Response(400, {"error": "that request was not valid JSON"})
        if _has_unrepresentable_text(parsed):
            return None, Response(400, {"error": "that request was not valid JSON"})
        if parsed is not None and not isinstance(parsed, dict):
            # Valid JSON is not the same as a valid request: a list or a bare
            # number parses happily, and every handler downstream reads named
            # fields off the body. Left through, it crashes a handler into the
            # last-resort 500 — "we broke" — when the truth is the caller sent
            # the wrong shape, which is a 400 by this file's own rules.
            return None, Response(400, {"error": "the request body must be a JSON object"})
        return parsed, None

    # ── Bytes in ────────────────────────────────────────────────────────────

    def _content_type(self) -> str:
        """The media type alone, lowercased, without its parameters."""
        return (self.headers.get("content-type") or "").split(";")[0].strip().lower()

    def _content_type_is_ambiguous(self) -> bool:
        """Two media-type fields must never choose two different request paths."""
        values = self.headers.get_all("content-type", [])
        if len(values) > 1:
            return True
        # A recipient may combine repeated fields into one comma-separated
        # value. Content-Type is not a list-valued field, and choosing the first
        # or treating the whole string as a document can route the same bytes
        # through different handlers at different HTTP hops. A comma in a
        # quoted parameter is harmless to routing; only the media-type portion
        # before the first semicolon decides JSON versus document.
        return bool(values and "," in values[0].split(";", 1)[0])

    def _content_type_is_malformed(self) -> bool:
        """A media type copied into provenance must be representable text."""
        values = self.headers.get_all("content-type", [])
        return bool(values and any(
            (ord(char) < 32 and char != "\t") or ord(char) == 127
            or 0xD800 <= ord(char) <= 0xDFFF
            for char in values[0]))

    def _is_document(self) -> bool:
        """Is this POST carrying a document rather than a record?

        Stated as "not JSON" rather than as a list of document types, and that
        is deliberate in both directions. A missing content type is JSON, which
        is what every existing caller and every existing test relies on; and a
        caller sending a .docx, a PDF or plain bytes does not have to be added
        to a list here before the system will take their paper. What the bytes
        ARE is the receiving act's question, not the transport's.
        """
        kind = self._content_type()
        return bool(kind) and kind != "application/json"

    def _read_document(self) -> tuple[Upload | None, Response | None]:
        """Bytes in, measured, named, and not touched on the way.

        Every refusal here is a 400 that names the problem or the 413 that says
        the document is too large. None of them is a 500: a caller sending a
        malformed upload made a mistake, and "we broke" would send them to
        argue with somebody about a bug that is not there.
        """
        if self.headers.get("transfer-encoding"):
            return None, Response(400, {"error": "transfer encoding is not supported"})
        length, refused = self._content_length()
        if refused is not None:
            return None, refused
        assert length is not None
        if length > MAX_DOCUMENT_BYTES:
            # Refused UNREAD, which is the entire point of checking the header
            # first: a service that reads a gigabyte before deciding it did not
            # want it can be exhausted by one request.
            return None, Response(413, {"error": "that document is too large"})
        if length <= 0:
            return None, Response(400, {"error": "that request carried no document"})

        body = self.rfile.read(length)
        if len(body) != length:
            # A short read is a truncated upload. Passed on, it would be stored
            # and hashed as though it were the whole document — a provenance
            # record of a file nobody ever sent.
            return None, Response(400, {"error": "that document arrived incomplete"})

        return Upload(body=body, content_type=self._content_type(),
                      filename=self._upload_filename()), None

    def _upload_filename(self) -> str | None:
        """What the caller said the file is called, or nothing.

        NOT SANITISED HERE, on the same principle as the outbound path: a name
        is the caller's claim about their own document, and a transport that
        rewrites it is a transport that can be argued with about what the name
        was. Whichever act records the document refuses the names it cannot
        accept.
        """
        header = self.headers.get("content-disposition") or ""
        parsed = Message()
        parsed["content-disposition"] = header
        value = parsed.get_param(
            "filename", header="content-disposition", unquote=True)
        if isinstance(value, tuple):
            value = collapse_rfc2231_value(value)
        return (str(value).strip() or None) if value is not None else None

    def _content_disposition_is_ambiguous(self) -> bool:
        values = self.headers.get_all("content-disposition", [])
        if len(values) > 1:
            return True
        if not values:
            return False
        # Content-Disposition is one disposition, not a comma-list. Some hops
        # combine repeated fields, and accepting that spelling would let them
        # disagree with this parser about which filename was claimed. A comma
        # inside a quoted parameter is data and does not affect the disposition
        # type, so only inspect the portion before the first semicolon here.
        if "," in values[0].split(";", 1)[0]:
            return True
        parsed = Message()
        parsed["content-disposition"] = values[0]
        parameters = parsed.get_params(
            header="content-disposition", unquote=True) or []
        return sum(1 for name, _value in parameters
                   if name.casefold() == "filename") > 1

    def _upload_filename_is_malformed(self) -> bool:
        """Refuse provenance text that HTTP or PostgreSQL cannot represent.

        A quoted header value can carry NUL and other control characters even
        though they are not legal field-value data. Letting one through reads
        the entire upload before PostgreSQL rejects the filename, turning a
        malformed request into a database failure instead of a caller error.
        Unicode filenames remain valid; only controls and lone surrogates are
        unrepresentable here.
        """
        filename = self._upload_filename()
        return filename is not None and any(
            ord(char) < 32 or ord(char) == 127
            or 0xD800 <= ord(char) <= 0xDFFF
            for char in filename)

    def _static_relative(self, path: str) -> tuple[str | None, Response | None]:
        """Decode one static path without accepting malformed percent escapes."""
        if re.search(r"%(?![0-9A-Fa-f]{2})", path):
            return None, Response(400, {"error": "the path is not valid URL encoding"})
        try:
            decoded = unquote(path, errors="strict")
        except UnicodeDecodeError:
            return None, Response(400, {"error": "the path is not valid UTF-8"})
        if "\0" in decoded:
            return None, Response(400, {"error": "the path contains a null byte"})
        return decoded.lstrip("/") or "index.html", None

    def _serve_static(self, path: str) -> bool:
        """Serve a file from the static root, or report that there is none.

        Path traversal is closed by construction: the resolved path must still
        sit under the root. A check, not a filter — a filter that strips `..` can
        be defeated by writing it differently.
        """
        root = self.static_root.resolve()
        relative, refused = self._static_relative(path)
        if refused is not None:
            self._respond(refused)
            return True
        assert relative is not None
        target = (root / relative).resolve()

        if target != root and root not in target.parents:
            self._respond(Response(403, {"error": "no"}))
            return True

        if not target.is_file():
            return False

        # THE GATE, and it is checked BEFORE the bytes are read. A file whose
        # suffix the screens are not made of is not served at all — see MIME
        # above for why this is a gate rather than a lookup.
        #
        # `return False` — not served — rather than a 403. What the caller then
        # gets is whatever the ordinary routing gives that path: 401 for an
        # anonymous caller, because the fall-through reaches the session gate,
        # and 404 for a signed-in one. Both are better than a 403, which would
        # confirm to somebody probing that a file EXISTS at that path — the
        # precise fact this refusal exists to withhold. The anonymous 401 is the
        # stronger of the two: it is the same answer every unknown path gives,
        # so it distinguishes nothing at all.
        kind = MIME.get(target.suffix)
        if kind is None:
            return False

        content = target.read_bytes()
        self.send_response(200)
        self.send_header("content-type", kind)
        self.send_header("content-length", str(len(content)))
        # The shell carries the API contract and keeps a bearer token in
        # memory. Do not let a browser or intermediary retain an older client
        # after request or authorization behavior changes.
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("x-frame-options", "DENY")
        self.end_headers()
        self.wfile.write(content)
        return True

    def _cors(self) -> None:
        # The screens are served from elsewhere during development. No
        # credentials flag: the session is a bearer token the client holds, not a
        # cookie the browser attaches on its own, so there is no cross-site
        # request forgery surface to open here by accident.
        # Cross-origin access is opt-in. The development sign-in does not prove
        # the user owns the named account, so a wildcard would let any website
        # acquire its own token from localhost and read the resulting records.
        origin = self._allowed_origin(os.environ.get("CW_ORIGIN"))
        if origin:
            self.send_header("access-control-allow-origin", origin)
            self.send_header("vary", "Origin")
        self.send_header("access-control-allow-headers", "authorization, content-type")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")

    @staticmethod
    def _allowed_origin(configured: str | None) -> str | None:
        """One exact browser origin, never a wildcard or header syntax."""
        if not configured:
            return None
        try:
            parsed = urlparse(configured)
            # Accessing port also validates malformed/non-numeric port text.
            _ = parsed.port
        except ValueError:
            return None
        if (parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path
                or parsed.params
                or parsed.query
                or parsed.fragment):
            return None
        return configured

    def _send_download(self, download: Download) -> None:
        """Bytes out, named, measured, and not touched on the way.

        THE FILENAME IS NOT SANITISED HERE, ON PURPOSE. It is quoted into a
        content-disposition header, so a name carrying a quote or a newline
        would break that header — and the answer to that is for the CALLER to
        refuse such a name, not for this file to quietly rewrite what somebody
        asked for. A transport that edits its payload's name is a transport
        that can be argued with about what the name was.
        """
        # A Download is an internal value, but the filename crosses an HTTP
        # syntax boundary here. Validate it here as well as at today's sole
        # producer so a future producer cannot turn a quote or control byte
        # into a second header (or make http.server abort mid-response).
        # THE RULE IS ASKED FOR, NOT RESTATED (app.transportable_filename). It
        # was spelled out here until 2026-08-08 while the producers spelled a
        # laxer version of it themselves, and the two disagreed: a stored
        # document with an accent in its name was answered 500 rather than
        # handed back. This stays a 500 and stays a backstop — a producer that
        # did not ask is our bug, and must not reach the wire.
        if not transportable_filename(download.filename):
            self._respond(Response(500, {"error": "the service failed"}))
            return

        self.send_response(download.status)
        self.send_header("content-type", download.content_type)
        self.send_header("content-disposition",
                         f'attachment; filename="{download.filename}"')
        self.send_header("content-length", str(len(download.body)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("x-frame-options", "DENY")
        # Kept, and it matters: the JSON path calls it, and a download that
        # skipped it would fail cross-origin during development in a way no
        # test covers and every browser reports differently.
        self._cors()
        self.end_headers()
        self.wfile.write(download.body)

    def _respond(self, response: Response | Download) -> None:
        if isinstance(response, Download):
            self._send_download(response)
            return

        payload = json.dumps(response.body, default=str).encode("utf-8")
        self.send_response(response.status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("x-frame-options", "DENY")
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def handle_one_request(self) -> None:
        """One request, and an unexpected failure reported as what it is.

        A 500 must never be reported as a refusal: "you may not do that" and "we
        broke" are different facts, and conflating them sends somebody to argue
        with their administrator about a bug.
        """
        try:
            super().handle_one_request()
        except Exception:  # noqa: BLE001 — last resort, and it says so
            # The detail goes to the log, not to the browser. What an unexpected
            # failure says about the insides of the service is exactly the kind
            # of thing a stranger probing the port is hoping to read.
            import traceback
            traceback.print_exc(file=sys.stderr)
            try:
                self._respond(Response(500, {"error": "the service failed"}))
            except Exception:
                pass

    def log_message(self, fmt: str, *args) -> None:
        rendered = fmt % args
        # requestline is caller-controlled even when _parse_target refuses it.
        # Render controls visibly so ESC, CR, DEL and friends cannot rewrite a
        # terminal or forge a second operational log line.
        safe = "".join(
            char if ord(char) >= 32 and ord(char) != 127
            else f"\\x{ord(char):02x}"
            for char in rendered)
        sys.stderr.write(f"{self.address_string()} {safe}\n")


def _bound_inflight_connections(server, limit: int = MAX_INFLIGHT_CONNECTIONS):
    """Prevent ThreadingHTTPServer from creating unbounded slow-client threads."""
    slots = threading.BoundedSemaphore(limit)
    start_thread = server.process_request
    run_request = server.process_request_thread

    def bounded_thread(request, client_address):
        try:
            run_request(request, client_address)
        finally:
            slots.release()

    def bounded_start(request, client_address):
        if not slots.acquire(blocking=False):
            server.shutdown_request(request)
            return
        try:
            start_thread(request, client_address)
        except Exception:
            slots.release()
            raise

    server.process_request_thread = bounded_thread
    server.process_request = bounded_start
    server._connection_slots = slots
    return server


def serve(
    database_url: str,
    port: int = 8787,
    static: str | None = None,
) -> ThreadingHTTPServer:
    """Build the server. Does not start serving — the caller decides that, so a
    test can start it on a thread and stop it again."""
    db = Database(database_url)
    try:
        app = App(db)
        static_root = Path(static).resolve() if static else None
        # Keep these assignments as the existing inspection seam, but do not make
        # a live server depend on shared class state. Each server gets a private
        # subclass whose attributes cannot be overwritten by a later serve().
        Handler.app = app
        Handler.static_root = static_root

        class BoundHandler(Handler):
            pass

        BoundHandler.app = app
        BoundHandler.static_root = static_root
        # CORS cannot stop DNS rebinding: once an attacker-controlled hostname
        # resolves to loopback, their page and this service appear same-origin
        # to the browser. Accept only the names this loopback server owns.
        BoundHandler.allowed_hostnames = frozenset({"localhost", "127.0.0.1"})

        server = _bound_inflight_connections(
            ThreadingHTTPServer(("127.0.0.1", port), BoundHandler))
    except Exception:
        db.close()
        raise
    server.daemon_threads = True
    server.database = db  # type: ignore[attr-defined]
    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="The Clausewerk doorway.")
    parser.add_argument("--port", type=int,
                        default=int(os.environ.get("PORT", 8787)))
    parser.add_argument("--static", default=None,
                        help="a directory of screens to serve on the same origin")
    parser.add_argument("--database-url", default=os.environ.get(
        "CW_DATABASE_URL",
        "postgresql://cw_app:clausewerk-dev@localhost:5432/clausewerk"))
    args = parser.parse_args(argv)

    server = serve(args.database_url, port=args.port, static=args.static)
    print(f"clausewerk doorway listening on http://localhost:{args.port}")
    if args.static:
        print(f"serving the screens from {args.static} on the same origin")
    print("the pool holds no application role; every request binds its own.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping.")
    finally:
        server.server_close()
        server.database.close()  # type: ignore[attr-defined]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
