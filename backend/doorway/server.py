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
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import ParseResult, parse_qs, unquote, urlparse

from doorway.app import App, Download, Response, Upload
from doorway.db import Database

# A body bigger than this is refused unread. The JavaScript destroyed the socket
# at the same size; the point is that an unbounded read is a way to exhaust the
# service with one request.
MAX_BODY = 1_000_000

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
QUERY_KEYS = ("run", "agreement")
MAX_QUERY_FIELDS = 20

MIME = {
    ".html": "text/html; charset=utf-8",
    ".jsx": "text/babel; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
}


def _reject_non_finite_json(value: str) -> None:
    raise ValueError(f"{value} is not a JSON number")


class Handler(BaseHTTPRequestHandler):
    # Set by serve() before the server starts.
    app: App = None  # type: ignore[assignment]
    static_root: Path | None = None

    server_version = "clausewerk"
    sys_version = ""

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)

    # ── The request ─────────────────────────────────────────────────────────

    def do_GET(self) -> None:  # noqa: N802 — the base class names it
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
        parsed, refused = self._parse_target(self.path)
        if refused is not None:
            self._respond(refused)
            return
        assert parsed is not None

        if self._content_type_is_ambiguous():
            self._respond(Response(400, {"error": "content type is ambiguous"}))
            return

        if self._is_document():
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
            upload, refused = self._read_document()
            if refused is not None:
                self._respond(refused)
                return
            self._respond(self.app.handle("POST", self._endpoint(parsed.path),
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
        try:
            return urlparse(target), None
        except ValueError:
            return None, Response(400, {"error": "the request target is malformed"})

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
            parsed = json.loads(raw or b"null", parse_constant=_reject_non_finite_json)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError, RecursionError):
            # Malformed JSON is the caller's mistake, not a refusal. Saying
            # "refused" here would send somebody to argue about permissions.
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
        return len(self.headers.get_all("content-type", [])) > 1

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
        marker = "filename="
        at = header.lower().find(marker)
        if at < 0:
            return None
        value = header[at + len(marker):].strip()
        if value.startswith('"'):
            closing = value.find('"', 1)
            value = value[1:closing] if closing > 0 else value[1:]
        else:
            value = value.split(";")[0].strip()
        return value or None

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

        content = target.read_bytes()
        kind = MIME.get(target.suffix) or (
            mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_response(200)
        self.send_header("content-type", kind)
        self.send_header("content-length", str(len(content)))
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
        origin = os.environ.get("CW_ORIGIN")
        if origin:
            self.send_header("access-control-allow-origin", origin)
        self.send_header("access-control-allow-headers", "authorization, content-type")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")

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
        if (not download.filename
                or any(ord(char) < 32 or ord(char) > 126
                       for char in download.filename)
                or '"' in download.filename
                or "\\" in download.filename):
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
        sys.stderr.write(f"{self.address_string()} {fmt % args}\n")


def serve(
    database_url: str,
    port: int = 8787,
    static: str | None = None,
) -> ThreadingHTTPServer:
    """Build the server. Does not start serving — the caller decides that, so a
    test can start it on a thread and stop it again."""
    db = Database(database_url)
    Handler.app = App(db)
    Handler.static_root = Path(static).resolve() if static else None

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
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
