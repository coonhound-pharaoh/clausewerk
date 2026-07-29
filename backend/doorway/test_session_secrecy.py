"""What the session table stores must not be usable to sign in.

AUDIT FINDING A-2.

A session key is a bearer credential: whoever presents it IS the person, with no
second factor and nothing in the audit trail distinguishing them from the real
holder. The table used to hold that key verbatim, which made it durable — into
every backup, every replica and every database console session for the rest of
its eight-hour life. Anyone holding a copy of the table held working credentials
for everyone signed in.

A-1 (migration 0033) stopped the wrong ROLE reading this table. It could do
nothing about a COPY of the table, and a backup is a copy. The two findings look
alike and are not: one is about who may read the row, this is about what the row
is worth once read.

THE TEST THAT MATTERS MOST is the third one below. Hashing is pointless if the
stored value is itself accepted as a key — that would simply rename the
credential. So the interesting assertion is not "the column differs from the
token", it is "presenting the column's contents does not sign you in".

Assertions are on identity, row contents and authentication outcomes. Never on
wording.
"""

from __future__ import annotations

import hashlib

import psycopg
import pytest

from doorway.db import Database
from doorway.sessions import LOOKUP_ACTOR, LOOKUP_ROLE, Sessions, fingerprint

ADMIN = "admin@clausewerk"
LEGAL = "leah@clausewerk"


@pytest.fixture
def library(schema: str, owner_url: str):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      (ADMIN, ADMIN, "The Administrator", LEGAL, "Leah Legal", "Legal"))
    database = Database(schema, min_size=1, max_size=6)
    yield database
    database.close()


def _stored(library) -> list[str]:
    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        return [row["token_sha256"]
                for row in request.rows("select token_sha256 from cw.session")]


def test_the_key_itself_is_never_written_down(library):
    issued = Sessions(library).issue(ADMIN, 3600.0)
    stored = _stored(library)

    assert stored, "no session row was written"
    assert issued.token not in stored, "the session key is stored verbatim"


def test_what_is_stored_is_the_fingerprint_of_the_key(library):
    issued = Sessions(library).issue(ADMIN, 3600.0)
    assert _stored(library) == [hashlib.sha256(issued.token.encode()).hexdigest()]


def test_the_stored_value_cannot_be_presented_as_a_key(library):
    """THE POINT. Hashing that left the stored value usable would just rename
    the credential — a backup would still be a set of working logins."""
    sessions = Sessions(library)
    issued = sessions.issue(ADMIN, 3600.0)
    held = _stored(library)[0]

    assert sessions.person_for(issued.token) == ADMIN, "the real key stopped working"
    assert sessions.person_for(held) is None, (
        "the stored fingerprint was accepted as a session key; anyone with a "
        "copy of the table can sign in as anybody")


def test_two_sessions_for_one_person_are_distinct_rows(library):
    """A digest of a per-session secret, not of the person. Signing in twice
    must not collapse to one row, or ending one session ends both."""
    sessions = Sessions(library)
    first = sessions.issue(ADMIN, 3600.0)
    second = sessions.issue(ADMIN, 3600.0)

    assert first.token != second.token
    assert len(set(_stored(library))) == 2

    sessions.end(first.token)
    assert sessions.person_for(first.token) is None
    assert sessions.person_for(second.token) == ADMIN


def test_the_whole_sign_in_lifecycle_still_works(library):
    """Issue, present, expire, end — the guarantees the change must not cost."""
    clock = {"t": 1000.0}
    sessions = Sessions(library, now=lambda: clock["t"])

    issued = sessions.issue(ADMIN, 10.0)
    assert sessions.person_for(issued.token) == ADMIN

    clock["t"] = 1011.0
    assert sessions.person_for(issued.token) is None, "an expired key was honoured"

    clock["t"] = 2000.0
    again = sessions.issue(LEGAL, 10.0)
    assert sessions.person_for(again.token) == LEGAL
    sessions.end(again.token)
    assert sessions.person_for(again.token) is None


def test_a_key_from_before_the_migration_still_signs_in(library, owner_url):
    """Nobody is signed out by this change.

    A browser holding a key issued before the migration presents it; the doorway
    fingerprints what was presented and matches the row the migration rewrote.
    Simulated by writing a row the way the migration leaves one — this is the
    property that made doing it now cheap rather than a forced sign-out.
    """
    legacy_key = "a-key-issued-before-the-column-was-hashed"
    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        request.write(
            "insert into cw.session (token_sha256, person, expires_at) "
            "values (%s, %s, %s)",
            (fingerprint(legacy_key), ADMIN, 9_999_999_999.0))

    assert Sessions(library).person_for(legacy_key) == ADMIN


def test_the_database_refuses_a_raw_key_in_that_column(library):
    """Belt and braces at the schema, so a future writer that forgot to
    fingerprint fails loudly at the insert rather than storing a live
    credential that looks fine."""
    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        with pytest.raises(psycopg.Error):
            request.write(
                "insert into cw.session (token_sha256, person, expires_at) "
                "values (%s, %s, %s)",
                ("a-raw-token-not-a-digest", ADMIN, 9_999_999_999.0))
