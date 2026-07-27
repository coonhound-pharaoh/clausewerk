"""Sign-ins: who is holding this session, and for how long.

THE ONE IDEA

A session stores a PERSON and nothing else about their authority. The role is
resolved from `cw.effective_role` on every request, never captured at sign-in.

That is what makes revocation mean anything. If the role were captured when the
session was issued, revoking somebody would take effect at their next SIGN-IN —
which, for a session that lasts a working day, means "tomorrow, if they bother to
sign out". The screen would say revoked while the person went on working, which
is worse than not having the button at all.

What is promised, exactly, and it is what the console must say: **revocation is
honoured at the next request.** A request already in flight completes. That gap
is real and it is small; promising more would mean interrupting work in progress,
and promising what the code does not do is the failure class this whole effort is
paying down.

THE OTHER CLOCK

This is the sign-in, which lasts hours. It is not the identity stamp that travels
with each individual request, which lasts one request and is handled in db.py.
One word was doing both jobs and it misled people, so the two never share a name
in this codebase.
"""

from __future__ import annotations

import re
import secrets
import threading
from dataclasses import dataclass
from typing import Callable

EIGHT_HOURS = 8 * 3600.0

_DURATION = re.compile(r"^\s*(\d+)\s*([smhd])\s*$")
_UNIT_SECONDS = {"s": 1.0, "m": 60.0, "h": 3600.0, "d": 86400.0}


def parse_duration(text: str | None, fallback: float = EIGHT_HOURS) -> float:
    """"8h", "30d", "45m" → seconds.

    Falls back rather than failing, and falls back to a WORKING VALUE rather than
    to zero. A misconfigured setting that silently produced a zero-length session
    would sign everybody out instantly and look like a broken product; falling
    back to the default looks like the setting was ignored, which is both true
    and recoverable.
    """
    match = _DURATION.match(text or "")
    if not match:
        return fallback
    return int(match.group(1)) * _UNIT_SECONDS[match.group(2)]


@dataclass(frozen=True)
class Issued:
    token: str
    expires_at: float


class Sessions:
    """Live sign-ins, held in memory.

    In memory is a deliberate limit and worth naming: restarting the service
    signs everybody out. That is the honest trade for this stage — it is safe
    (nothing is lost but a sign-in) and it avoids inventing a session store
    before there is a second instance to share one.
    """

    def __init__(self, now: Callable[[], float] | None = None):
        # Time is injected so expiry can be tested without waiting. A test that
        # proves expiry by sleeping for eight hours is a test nobody runs.
        import time

        self._now = now or time.monotonic
        self._by_token: dict[str, tuple[str, float]] = {}
        # The server is threaded ON PURPOSE (see server.py), so two requests
        # really do read and write this dict at the same moment. Every method
        # holds this lock; without it, two presentations of one expired token
        # race their removals and the loser crashes the request.
        self._lock = threading.RLock()

    def issue(self, person: str, length_seconds: float) -> Issued:
        # secrets, not a general-purpose random source: this string is the only
        # thing standing between a stranger and somebody else's session.
        token = secrets.token_urlsafe(32)
        with self._lock:
            now = self._now()
            # Sweep the dead before admitting the new. An expired session is
            # otherwise only removed when its exact token is presented again —
            # which for an abandoned browser is never — and sign-in is the one
            # unauthenticated door, so unswept growth is a way for a stranger
            # to fill the process's memory one sign-in at a time.
            self._by_token = {
                t: held for t, held in self._by_token.items() if held[1] > now}
            expires_at = now + length_seconds
            self._by_token[token] = (person, expires_at)
        return Issued(token=token, expires_at=expires_at)

    def person_for(self, token: str | None) -> str | None:
        """The person, or None.

        Deliberately returns no role. The caller must go and ask the database
        what this person may do right now — see identity.py.
        """
        if not token:
            return None
        with self._lock:
            found = self._by_token.get(token)
            if not found:
                return None
            person, expires_at = found
            if self._now() >= expires_at:
                # pop, not del: the entry may already be gone — removed by a
                # parallel request holding the same expired token, or by a
                # revocation — and "already gone" is the outcome we wanted,
                # not an error.
                self._by_token.pop(token, None)
                return None
            return person

    def end(self, token: str) -> None:
        with self._lock:
            self._by_token.pop(token, None)

    def end_all_for(self, person: str) -> None:
        """Drop every session a person holds, used when they are revoked.

        Belt and braces: resolving the role on every request already refuses a
        revoked person, so this only shortens the window in which a doomed token
        is still being presented. It is not the control — the per-request lookup
        is the control.
        """
        with self._lock:
            self._by_token = {
                t: held for t, held in self._by_token.items() if held[0] != person}

    def __len__(self) -> int:
        with self._lock:
            return len(self._by_token)
