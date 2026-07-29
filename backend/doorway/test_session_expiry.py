"""An expired session is refused by the LOOKUP, not by the housekeeping.

AUDIT FINDING A-3.

`person_for` deletes expired rows and then selects by fingerprint. Before this
fix the select carried no expiry condition of its own, so whether an expired
session was honoured depended entirely on that preceding DELETE — a statement
whose stated purpose, in its own comment, is housekeeping: sweeping abandoned
rows so the table does not grow.

Two statements, one of which quietly held the whole expiry guarantee while
describing itself as tidying up. The sweep is an unindexed sequential scan on
every single request, so moving it to a scheduled job is a change somebody will
propose for perfectly good reasons — and doing so would have silently turned
every expired session back on.

WHY THE TESTS LOOK LIKE THIS, because it is the point and not an oddity.

The guarantee is ONLY OBSERVABLE WHEN THE SWEEP HAS NOT RUN. With the sweep, the
row is gone either way and a test passes whether or not the predicate exists —
the same trap that left the "an outage is blamed on the caller" check guarding
nothing for who knows how long. So the tests below execute `LIVE_SESSION_SQL`
directly against a row the sweep has not touched. That is only honest because it
is the same statement the doorway itself runs; it is a module constant for
exactly this reason.

Assertions are on rows returned and identity. Never on wording.
"""

from __future__ import annotations

import psycopg
import pytest

from doorway.db import Database
from doorway.sessions import (
    LIVE_SESSION_SQL,
    LOOKUP_ACTOR,
    LOOKUP_ROLE,
    Sessions,
    fingerprint,
)

ADMIN = "admin@clausewerk"
LEGAL = "leah@clausewerk"

LIVE = 9_999_999_999.0
DEAD = 1_000.0
NOW = 2_000.0


@pytest.fixture
def library(schema: str, owner_url: str):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      (ADMIN, ADMIN, "The Administrator", LEGAL, "Leah Legal", "Legal"))
    database = Database(schema, min_size=1, max_size=6)
    yield database
    database.close()


def _plant(library, person: str, key: str, expires_at: float) -> None:
    """A session row the sweep has never seen."""
    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        request.write(
            "insert into cw.session (token_sha256, person, expires_at) "
            "values (%s, %s, %s)",
            (fingerprint(key), person, expires_at))


def _lookup(library, key: str, now: float):
    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        return request.one(LIVE_SESSION_SQL, (fingerprint(key), now))


def test_the_lookup_refuses_an_expired_row_with_no_sweep_involved(library):
    """THE FINDING. Nothing has deleted this row; the query must still refuse it."""
    _plant(library, ADMIN, "a-dead-session", DEAD)

    assert _lookup(library, "a-dead-session", NOW) is None, (
        "an expired session was honoured; expiry is resting on the sweep")


def test_the_lookup_still_returns_a_live_row(library):
    """The other half — otherwise the test above passes on a query that refuses
    everything."""
    _plant(library, ADMIN, "a-live-session", LIVE)

    row = _lookup(library, "a-live-session", NOW)
    assert row is not None and row[0] == ADMIN


def test_the_boundary_second_is_expired_not_live(library):
    """`>` and not `>=`: a session expiring exactly now is over.

    Pinned because the two read alike and the wrong one would keep a session
    alive for one extra second at every boundary — invisible, and the kind of
    thing that only ever shows up as an argument about clocks.
    """
    _plant(library, ADMIN, "expiring-exactly-now", NOW)

    assert _lookup(library, "expiring-exactly-now", NOW) is None


# ── Controls ────────────────────────────────────────────────────────────────
#
# THESE TWO ARE NOT GUARDS, AND SAY SO. Both go through `person_for`, so the
# sweep deletes the row before the lookup ever sees it and both pass whether or
# not the expiry predicate exists — verified by neutering the predicate and
# watching them stay green.
#
# They are here because "expiry works, end to end" is worth pinning and they
# pin it. They are labelled because a test that looks like it guards the
# predicate and does not is precisely how the outage check sat in the harness
# for months guarding nothing. The guards are the three above.


def test_control_expiry_holds_through_the_whole_doorway_path(library):
    """End to end. Passes on the sweep alone — see the note above."""
    clock = {"t": 1000.0}
    sessions = Sessions(library, now=lambda: clock["t"])

    issued = sessions.issue(ADMIN, 10.0)
    assert sessions.person_for(issued.token) == ADMIN

    clock["t"] = 1011.0
    assert sessions.person_for(issued.token) is None


def test_control_a_planted_expired_row_is_refused_end_to_end(library):
    """A row the doorway never issued is still refused. Passes on the sweep
    alone — see the note above."""
    _plant(library, LEGAL, "planted-and-dead", DEAD)
    sessions = Sessions(library, now=lambda: NOW)

    assert sessions.person_for("planted-and-dead") is None
