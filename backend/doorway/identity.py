"""From a person to a database role — the critical join.

    Bind the session to `cw.effective_role`, never to `cw.account.role`.

This is the single most important line in this workstream, so it is the first
thing in the file that implements it.

`cw.account.role` is the administrative RECORD of what somebody is supposed to
hold. `cw.effective_role` is what they ACTUALLY hold, and it is the only one that
applies the countersign rule: a grant of either Legal role confers nothing until
a Legal admin countersigns it (owner decision U6).

A doorway reading `cw.account.role` would confer Legal roles the moment an
Administrator typed them, and a whole migration of care would be walked around by
the front door on day one. The two columns are named and documented differently
on purpose — record versus authority — and the test that proves this file
honoured the distinction is written so that it FAILS if the wrong column is read.

A PERSON WITH NO EFFECTIVE ROLE GETS NO SESSION

Not a viewer session. Not a degraded one. None. Failing closed here costs a
support ticket; failing open costs the guarantee.

WHAT SIGN-IN IS, AND WHAT IT IS NOT, TODAY

There is no password here. Sign-in names a person and the database says what that
person may do. This is the seam an identity provider plugs into, and it is left
marked as a seam rather than dressed up as authentication.

Said plainly, because the difference matters and the audit history depends on it:
until an identity provider is connected, this establishes WHICH KNOWN PERSON is
acting, and does not yet prove they are that person. What it already fixes is the
half that was wrong before — the role now comes from the database rather than
from the caller, so nobody can award themselves authority they were not granted.

WHEN A PROVIDER IS CONNECTED, ONE RULE SURVIVES IT

The provider asserts identity only, never role. If a customer's directory carries
groups that look like our roles, they are ignored. A directory group is not a
countersigned grant.
"""

from __future__ import annotations

from dataclasses import dataclass

from doorway.db import Database
from doorway.sessions import EIGHT_HOURS, Sessions, parse_duration

# The role sign-in reads as, before any role is known. This is the one genuine
# chicken-and-egg in the serving path, and it is NOT resolved by using the owner.
#
# cw_viewer is the least-privileged role in the system. It holds select on
# cw.account and cw.effective_role — access is not a secret, both carry role
# names and no contract content — and can do nothing else at all. So the worst a
# bug on this path can do is read the staff list.
LOOKUP_ROLE = "viewer"

# A name, not a person: it is what appears as the actor on a connection that is
# only reading the staff list to find out who somebody is. Nothing is audited
# under it, because looking somebody up is not a governed act.
LOOKUP_ACTOR = "__signin__"


class NoSession(Exception):
    """No sign-in, or one that has expired."""


class NoEffectiveRole(Exception):
    """A known person who may currently do nothing.

    Two causes, and the message deliberately names both rather than guessing:
    the account was revoked, or a grant of a Legal role is still waiting to be
    countersigned. To the system they mean the same thing — this person holds
    nothing right now — and claiming to know which one it was would be inventing
    detail the view does not return.
    """

    MESSAGE = (
        "this account holds no effective role — it has been revoked, or its grant "
        "of a Legal role is still waiting to be countersigned"
    )

    def __init__(self) -> None:
        super().__init__(self.MESSAGE)


@dataclass(frozen=True)
class Caller:
    """Who is making this request, and with what authority — resolved fresh."""

    person: str
    role: str


def effective_role(db: Database, person: str) -> str | None:
    """What this person may do RIGHT NOW, or None.

    Reads cw.effective_role. Never cw.account.role. See the top of this file.
    """
    with db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        row = request.one(
            "select role from cw.effective_role where person = %s", (person,)
        )
    return row[0] if row else None


def session_length(db: Database) -> float:
    """How long a sign-in lasts, from the setting an Administrator controls.

    Read every time it is needed rather than at start-up: an Administrator who
    shortens the session length expects it to apply to the next person who signs
    in, not to the next deployment.
    """
    with db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        row = request.one(
            "select value from cw.governance_setting where key = 'session_length'"
        )
    return parse_duration(row[0] if row else None, EIGHT_HOURS)


def sign_in(db: Database, sessions: Sessions, person: str):
    """Sign a person in, or refuse.

    Refuses anybody with no effective role, which includes somebody who has been
    revoked and somebody whose Legal grant has not been countersigned yet.
    """
    person = (person or "").strip()
    if not person:
        raise NoEffectiveRole()

    if effective_role(db, person) is None:
        raise NoEffectiveRole()

    return sessions.issue(person, session_length(db))


def caller_for(db: Database, sessions: Sessions, token: str | None) -> Caller:
    """Resolve a request's caller: session → person → the role held right now.

    Every request, every time, with nothing cached. That is what makes a
    revocation bite at the next click rather than the next sign-in.

    The cost is one small query per request against a view. It is the right place
    to spend it: caching this is how a revoked person keeps working, and any cache
    added here needs to be dropped on every grant, revocation and countersign —
    three places to remember, against one query to not.
    """
    person = sessions.person_for(token)
    if person is None:
        raise NoSession("no session")

    role = effective_role(db, person)
    if role is None:
        # Their authority has gone while they were signed in. End the session
        # rather than leave them holding a token that will be refused on every
        # request without explanation.
        sessions.end_all_for(person)
        raise NoEffectiveRole()

    return Caller(person=person, role=role)
