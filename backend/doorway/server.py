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

Ported from `backend/service/server.mjs` on 2026-07-26.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from doorway.app import App, Response
from doorway.db import Database

# A body bigger than this is refused unread. The JavaScript destroyed the socket
# at the same size; the point is that an unbounded read is a way to exhaust the
# service with one request.
MAX_BODY = 1_000_000

MIME = {
    ".html": "text/html; charset=utf-8",
    ".jsx": "text/babel; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
}


class Handler(BaseHTTPRequestHandler):
    # Set by serve() before the server starts.
    app: App = None  # type: ignore[assignment]
    static_root: Path | None = None

    server_version = "clausewerk"
    sys_version = ""

    # ── The request ─────────────────────────────────────────────────────────

    def do_GET(self) -> None:  # noqa: N802 — the base class names it
        parsed = urlparse(self.path)

        # Static first, and only for GET. An API path always wins if it exists,
        # because App.handle is the thing that knows what an endpoint is.
        if self.static_root and not parsed.path.startswith("/api/"):
            if self._serve_static(parsed.path):
                return

        self._respond(self.app.handle("GET", self._endpoint(parsed.path),
                                      token=self._token()))

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
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

    def _token(self) -> str | None:
        header = self.headers.get("authorization") or ""
        return header[7:] if header.startswith("Bearer ") else None

    def _read_body(self) -> tuple[dict | None, Response | None]:
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            return None, Response(400, {"error": "unreadable request"})
        if length > MAX_BODY:
            return None, Response(413, {"error": "that request is too large"})
        if length <= 0:
            return None, None
        try:
            parsed = json.loads(self.rfile.read(length) or b"null")
        except (json.JSONDecodeError, UnicodeDecodeError):
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

    def _serve_static(self, path: str) -> bool:
        """Serve a file from the static root, or report that there is none.

        Path traversal is closed by construction: the resolved path must still
        sit under the root. A check, not a filter — a filter that strips `..` can
        be defeated by writing it differently.
        """
        root = self.static_root.resolve()
        relative = unquote(path).lstrip("/") or "index.html"
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
        self.end_headers()
        self.wfile.write(content)
        return True

    def _cors(self) -> None:
        # The screens are served from elsewhere during development. No
        # credentials flag: the session is a bearer token the client holds, not a
        # cookie the browser attaches on its own, so there is no cross-site
        # request forgery surface to open here by accident.
        origin = os.environ.get("CW_ORIGIN", "*")
        self.send_header("access-control-allow-origin", origin)
        self.send_header("access-control-allow-headers", "authorization, content-type")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")

    def _respond(self, response: Response) -> None:
        payload = json.dumps(response.body, default=str).encode("utf-8")
        self.send_response(response.status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
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
