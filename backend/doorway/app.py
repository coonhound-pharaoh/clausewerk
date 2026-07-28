"""The service. Identity in, rows out, and no opinions in between.

WHAT THIS LAYER DOES, and it is a shorter list than it looks:

  1. Work out WHO is calling, from the session.
  2. Ask the database what that person may do RIGHT NOW.
  3. Run their statement on a connection bound to that role and that name.
  4. Report what the database said, including its refusals, unchanged.

WHY THIS IS SEPARATE FROM server.py

Everything that decides anything lives here. `server.py` turns a socket into a
method, a path and a body, and turns the result back into a response. That split
is not tidiness: it is why sign-in, sessions, revocation, expiry and every
endpoint can be tested without opening a port, and a test that needs a listening
socket is a test that gets skipped.

THREE THINGS THE BROWSER CANNOT INFLUENCE, ever:

  · the role  — it comes from cw.effective_role, keyed on the session
  · the actor — it comes from the session, never from a header or a body
  · the rows  — they come from a policy, never from a WHERE clause added here

NOTHING IS CACHED

The caller's role is resolved on every single request. That is what makes
revocation bite at the next click rather than the next sign-in. The cost is one
small query against a view; the alternative is a cache that must be dropped on
every grant, revocation and countersign — three places to remember, against one
query to not.

Ported from `backend/service/app.mjs` on 2026-07-26.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from doorway import advisory, documents, executions, manifests, reads, runs, writes
from doorway.db import Database
from doorway.identity import (
    Caller, NoEffectiveRole, NoSession, caller_for, identity_of, session_length,
)
from doorway.sessions import Sessions


@dataclass(frozen=True)
class Response:
    status: int
    body: dict


@dataclass(frozen=True)
class Download:
    """A reply that is bytes rather than a record.

    Deliberately a SECOND type rather than a wider `Response`. `Response.body`
    stays annotated `dict`, so no existing endpoint's typing moves and nothing
    downstream has to ask "is this body a document or a record?" — `isinstance`
    already knows. `server.py` branches on the type and on nothing else.
    """
    status: int
    body: bytes
    content_type: str
    filename: str


# THE ONLY SPELLING OF THIS STRING IN THE REPOSITORY. It lives here because
# this file owns the Download type; server.py never learns what Word is, it
# reads `download.content_type`. Two copies of one constant in two files is
# how the two quietly stop agreeing.
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class App:
    """The whole service, minus the socket."""

    def __init__(self, db: Database, now: Callable[[], float] | None = None):
        self._db = db
        self._sessions = Sessions(now=now)

    @property
    def sessions(self) -> Sessions:
        return self._sessions

    # ── Sign in ─────────────────────────────────────────────────────────────
    # No password. This is the seam an identity provider plugs into, and it is
    # marked as a seam rather than dressed up as authentication. What is real
    # here, and what the rest of the system rests on, is that the ROLE is never
    # taken from the request: the person names themselves, and the database says
    # what that person may do.
    def sign_in(self, person: str | None) -> Response:
        if not person or not str(person).strip():
            return Response(400, {"error": "name yourself"})

        who = identity_of(self._db, str(person).strip())
        if who is None:
            return Response(403, {
                "error": "refused",
                "reason": "no active account with an effective role for that person",
            })

        length = session_length(self._db)
        issued = self._sessions.issue(who["person"], length)
        return Response(200, {
            "token": issued.token,
            # Seconds from now, deliberately NOT a timestamp. The session
            # clock is the service's own monotonic clock, whose zero point is
            # arbitrary — the old field exported that raw value under the
            # name "expiresAt", a "timestamp" of roughly January 1970. No
            # screen consumed it yet, which is exactly why no test caught it;
            # the first one to render it would have misbehaved silently.
            "expiresInSeconds": length,
            "person": who["person"],
            "role": who["role"],
            "display_name": who["display_name"],
            "unit": who["unit"],
        })

    # ── Every other request ─────────────────────────────────────────────────
    def handle(
        self,
        method: str,
        path: str,
        token: str | None = None,
        body: dict | None = None,
        query: dict[str, str] | None = None,
    ) -> Response | Download:
        # What the browser named in the query string, already narrowed to the
        # keys server.py will carry (server.QUERY_KEYS). Its one consumer is
        # GET /runs/contract, which has to say WHICH run to build.
        selector = dict(query or {})

        if method == "POST" and path == "/sign-in":
            return self.sign_in((body or {}).get("person"))

        if method == "POST" and path == "/sign-out":
            if token:
                self._sessions.end(token)
            return Response(200, {"ok": True})

        try:
            caller: Caller = caller_for(self._db, self._sessions, token)
        except NoSession:
            return Response(401, {"error": "no session"})
        except NoEffectiveRole as gone:
            # Revoked, or a Legal grant still waiting on its countersign. Both
            # mean the same thing and the message says so rather than guessing.
            return Response(403, {"error": "refused", "reason": str(gone)})

        key = f"{method} {path}"

        if key in reads.READS:
            answered = reads.answer(self._db, caller, key)
            return Response(answered.status, answered.body)

        if key in writes.WRITES:
            answered = writes.answer(self._db, caller, key, body or {})
            return Response(answered.status, answered.body)

        # The contract engine's one connection to the outside, and the pattern
        # every further one follows: adapt on this side, call the engine
        # unchanged, pass its own words back out. See manifests.py.
        if key == "POST /manifests/check":
            answered = manifests.check(self._db, caller, body)
            return Response(answered.status, answered.body)

        # Not a writes.WRITES entry, and that is not an oversight: a Write
        # holds exactly one SQL statement, and assembling a contract is a
        # library read, an engine call and a chain entry. Filing it under
        # Write would make that file's one promise untrue.
        if key == "POST /runs":
            answered = runs.run(self._db, caller, body)
            return Response(answered.status, answered.body)

        # Returns whatever documents.py built rather than re-wrapping a body: a
        # Download carries bytes, a content type and a filename, none of which a
        # Response can hold. See the Download type above.
        if key == "GET /runs/contract":
            return documents.contract(self._db, caller, selector)

        # The first endpoint that asks a model for an opinion. Not a Write for
        # the same reason POST /runs is not: it reads two frozen texts, calls
        # out to a model, and records what came back — or records that nothing
        # did. A Write holds one statement, and this is three acts.
        if key == "POST /advisory/semantic-difference":
            answered = advisory.semantic_difference(self._db, caller, body)
            return Response(answered.status, answered.body)

        if key == "POST /agreements/execute":
            answered = executions.execute(self._db, caller, body or {})
            return Response(answered.status, answered.body)

        return Response(404, {"error": "no such endpoint", "path": path})
