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

import hashlib
import re
import secrets
from dataclasses import dataclass
from typing import Callable

from doorway.db import Database

EIGHT_HOURS = 8 * 3600.0

# The role sign-in reads as, before any role is known. This is the one genuine
# chicken-and-egg in the serving path, and it is NOT resolved by using the owner.
#
# cw_viewer is the least-privileged role in the system. It holds select on
# cw.account and cw.effective_role — access is not a secret, both carry role
# names and no contract content — and can do nothing else at all. So the worst a
# bug on this path can do is read the staff list.
#
# These live here, not in identity.py, because identity.py already imports this
# module: naming them there and importing them back would close a cycle.
LOOKUP_ROLE = "viewer"

# A name, not a person: it is what appears as the actor on a connection that is
# only reading the staff list to find out who somebody is. Nothing is audited
# under it, because looking somebody up is not a governed act.
LOOKUP_ACTOR = "__signin__"


# THE EXPIRY CONTROL. Named, so it can be pointed at and tested.
#
# `and expires_at > %s` is the whole of finding A-3. Before it, whether an
# expired session was honoured depended ENTIRELY on the DELETE that runs just
# above this query in person_for — and that DELETE's stated purpose, in its own
# comment, is housekeeping: sweeping abandoned rows so the table does not grow.
#
# Two statements, one of which quietly held the entire expiry guarantee while
# describing itself as tidying up. Someone moving that sweep to a scheduled job
# for perfectly good performance reasons — it is an unindexed sequential scan on
# every request — would silently turn every expired session back on, and no test
# would have noticed. Verified before the fix: with the sweep skipped, an
# expired row came back as a live session.
#
# Now the sweep is housekeeping and this is the control, which is what each of
# them already claimed to be.
#
# WHY THIS IS A MODULE CONSTANT rather than an inline string. The guarantee is
# only observable when the sweep has NOT run — with it, the row is gone either
# way and a test passes whether or not the predicate is here. So the test
# executes THIS statement directly against an expired row, which is only honest
# if it is the same statement the doorway uses. One copy, named, and the
# mutation harness points at it.
LIVE_SESSION_SQL = (
    "select person from cw.session where token_sha256 = %s and expires_at > %s")


def fingerprint(token: str) -> str:
    """What gets STORED for a session key. Never the key itself.

    THE ONE COPY OF THIS. Every place a key is written down or looked up goes
    through here, because a single site that forgot would put a live credential
    back in the table and nothing would look wrong.

    A session key is a bearer credential: whoever holds it IS the person, with
    no second factor and no audit trail distinguishing them from the real
    holder. Held in memory that was defensible. Held in a table it is durable —
    it survives into every backup, every replica and every console session for
    the rest of its life, and a copy of the table would be a copy of everyone's
    credentials.

    A fingerprint can confirm a key that a caller presents and cannot produce
    one. So the table stops being worth stealing, and lookup stays a single
    indexed equality.

    No salt, deliberately, and this is the one place that reasoning belongs. A
    salt defends against a guessable secret being found in a rainbow table. This
    secret is 256 bits from the OS entropy source, so there is nothing to guess
    and nothing to look up; a per-row salt would only mean the lookup could no
    longer be a single equality. This is not a password.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

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
    """Live sign-ins, held in the database.
    
    A service restart no longer signs everybody out, because sessions are now
    persisted.
    """

    def __init__(self, db: Database, now: Callable[[], float] | None = None):
        # Time is injected so expiry can be tested without waiting. A test that
        # proves expiry by sleeping for eight hours is a test nobody runs.
        import time

        self._db = db
        # time.time() instead of time.monotonic(), since monotonic rests on machine
        # uptime and would expire sessions immediately on server restart if stored.
        self._now = now or time.time

    def issue(self, person: str, length_seconds: float) -> Issued:
        # secrets, not a general-purpose random source: this string is the only
        # thing standing between a stranger and somebody else's session.
        token = secrets.token_urlsafe(32)
        now = self._now()
        expires_at = now + length_seconds

        with self._db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
            # Sweep the dead before admitting the new. An expired session is
            # otherwise only removed when its exact token is presented again —
            # which for an abandoned browser is never — and sign-in is the one
            # unauthenticated door, so unswept growth is a way for a stranger
            # to fill the database one sign-in at a time.
            request.write("delete from cw.session where expires_at <= %s", (now,))
            # The FINGERPRINT is stored; the key itself is returned below and
            # then forgotten. This is the only moment the doorway ever holds a
            # key it could write down, and it does not.
            request.write(
                "insert into cw.session (token_sha256, person, expires_at) "
                "values (%s, %s, %s)",
                (fingerprint(token), person, expires_at)
            )

        return Issued(token=token, expires_at=expires_at)

    def person_for(self, token: str | None) -> str | None:
        """The person, or None.

        Deliberately returns no role. The caller must go and ask the database
        what this person may do right now — see identity.py.
        """
        if not token:
            return None
            
        now = self._now()
        
        with self._db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
            # HOUSEKEEPING, not the control. See LIVE_SESSION_SQL.
            request.write("delete from cw.session where expires_at <= %s", (now,))
            row = request.one(LIVE_SESSION_SQL, (fingerprint(token), now))
            return row[0] if row else None

    def end(self, token: str) -> None:
        with self._db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
            request.write(
                "delete from cw.session where token_sha256 = %s",
                (fingerprint(token),))

    def end_all_for(self, person: str) -> None:
        """Drop every session a person holds, used when they are revoked.

        Belt and braces: resolving the role on every request already refuses a
        revoked person, so this only shortens the window in which a doomed token
        is still being presented. It is not the control — the per-request lookup
        is the control.
        """
        with self._db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
            request.write("delete from cw.session where person = %s", (person,))

    def __len__(self) -> int:
        with self._db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
            row = request.one("select count(*) from cw.session")
            return row[0] if row else 0
