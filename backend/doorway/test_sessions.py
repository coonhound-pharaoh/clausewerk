"""The session store, now backed by the database.

These tests prove the store correctly persists sessions, sweeps expired ones,
and survives parallel traffic without crashing.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import threading
import pytest

from doorway.sessions import MAX_LIVE_SESSIONS_PER_PERSON, Sessions
from doorway.db import Database


def test_an_invalid_token_lookup_is_read_only():
    class LookupOnly:
        @contextmanager
        def as_person(self, _person, _role):
            yield self

        def one(self, statement, parameters):
            assert "expires_at > %s" in statement
            assert len(parameters) == 2
            return None

    sessions = Sessions(LookupOnly(), now=lambda: 100.0)

    assert sessions.person_for("attacker-chosen-token") is None


@pytest.fixture
def db(schema: str, owner_url: str):
    import psycopg
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      ("owner@clausewerk", "admin@clausewerk", "The Administrator",
                       "leah@clausewerk", "Leah Legal", "Legal"))
        
    database = Database(schema, min_size=1, max_size=15)
    
    # The two people every test here needs, and nobody else. The 58 accounts the
    # parallel-traffic test wants are created BY that test — see accounts()
    # below and finding D-2. A fixture that quietly provisions for one test
    # while claiming to serve all of them is how the next person to need `p50`
    # ends up debugging this file instead of their own.
    _accounts(database, "rita@clausewerk", "leah@clausewerk")

    yield database
    database.close()


def _accounts(database: Database, *people: str) -> None:
    with database.as_person("admin@clausewerk", "administrator") as request:
        for person in people:
            request.write(
                "insert into cw.account (person, display_name, unit, role, created_by) "
                "values (%s, 'Test User', 'Test', 'requester', 'admin@clausewerk') "
                "on conflict do nothing",
                (person,)
            )


def test_expired_sessions_are_swept_when_a_new_one_is_issued(db: Database):
    """Abandoned sign-ins must not accumulate in the database."""
    clock = {"t": 0.0}
    sessions = Sessions(db, now=lambda: clock["t"])

    for _ in range(5):
        sessions.issue("rita@clausewerk", 10.0)
    assert len(sessions) == 5

    clock["t"] = 11.0  # all five are now expired
    sessions.issue("leah@clausewerk", 10.0)
    assert len(sessions) == 1, "expired sessions were kept until presented"


def test_repeated_sign_in_cannot_grow_one_persons_live_sessions_without_bound(
        db: Database):
    sessions = Sessions(db, now=lambda: 0.0)
    newest = None

    for _ in range(MAX_LIVE_SESSIONS_PER_PERSON + 7):
        newest = sessions.issue("rita@clausewerk", 3600.0)

    assert len(sessions) == MAX_LIVE_SESSIONS_PER_PERSON
    assert newest is not None
    assert sessions.person_for(newest.token) == "rita@clausewerk"


def test_concurrent_sign_in_keeps_one_persons_session_cap(db: Database):
    sessions = Sessions(db, now=lambda: 0.0)
    for _ in range(MAX_LIVE_SESSIONS_PER_PERSON - 1):
        sessions.issue("rita@clausewerk", 3600.0)

    workers = 12
    start = threading.Barrier(workers)

    def issue_together(_worker):
        start.wait()
        return sessions.issue("rita@clausewerk", 3600.0)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        issued = list(pool.map(issue_together, range(workers)))

    with db.as_person("__signin__", "viewer") as request:
        count = request.one(
            "select count(*) from cw.session where person = %s",
            ("rita@clausewerk",))[0]

    assert count == MAX_LIVE_SESSIONS_PER_PERSON
    assert all(sessions.person_for(item.token) == "rita@clausewerk"
               for item in issued), (
        "a concurrent sign-in returned a token that trimming already removed")


def test_the_store_survives_genuinely_parallel_traffic(db: Database):
    """Sign-ins, presentations of expiring tokens, and revocations, all at once.

    WHAT THIS HUNTS, named rather than left as "handles concurrency". A test
    that does not say what failure it is looking for cannot be reviewed, and
    cannot tell you whether it is still looking for the right thing.

    When the store was a dictionary this hunted an unguarded read-check-remove,
    surfacing as a KeyError or a dictionary-changed-size error on some thread.
    Those two cannot happen now — the dictionary is gone — and the docstring was
    rewritten to a generic sentence at the same time, which is finding D-2.

    In the database the equivalents are:

      · a deadlock between one connection's expiry sweep and another's insert,
        both touching the same rows in a different order
      · a unique violation on token_sha256 when the sweep and an insert race
      · "tuple concurrently updated" from contended catalogue or row state
      · any connection returned to the pool still inside a transaction, which
        surfaces on whichever unlucky thread borrows it next

    THE ITERATION COUNT IS 200 AND IT MATTERS. It was cut to 50 with no note
    explaining why, which quartered the chance of hitting the interleaving this
    exists to catch — a concurrency test made a quarter as likely to fire, while
    still reporting green, is worse than one that was deleted, because the row
    in the report says it is still watching. Restored, and timed: the body costs
    about six seconds, so the reduction bought nothing worth having.
    """
    clock = {"t": 0.0}
    sessions = Sessions(db, now=lambda: clock["t"])
    failures: list[BaseException] = []

    # Created here, by the test that wants them, rather than in the shared
    # fixture. Fifty to hold expiring tokens, eight to be signed in and revoked.
    _accounts(db,
              *(f"p{i}@clausewerk" for i in range(50)),
              *(f"w{n}@clausewerk" for n in range(8)))

    tokens = [sessions.issue(f"p{i}@clausewerk", 0.5).token for i in range(50)]
    clock["t"] = 1.0  # every token above is now expired

    def hammer(worker: int) -> None:
        try:
            for i in range(200):
                sessions.person_for(tokens[i % len(tokens)])
                if i % 5 == 0:
                    sessions.issue(f"w{worker}@clausewerk", 0.001)
                if i % 7 == 0:
                    sessions.end_all_for(f"w{worker}@clausewerk")
        except BaseException as broke:  # noqa: BLE001 — the test IS the catch
            failures.append(broke)

    threads = [threading.Thread(target=hammer, args=(n,)) for n in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not failures, f"parallel traffic crashed the store: {failures[:3]}"


def test_sessions_are_dropped_by_token(db: Database):
    """A session ended explicitly by its token is gone immediately."""
    sessions = Sessions(db, now=lambda: 0.0)
    issued = sessions.issue("rita@clausewerk", 10.0)
    assert sessions.person_for(issued.token) == "rita@clausewerk"

    sessions.end(issued.token)
    assert sessions.person_for(issued.token) is None


def test_sessions_are_dropped_by_person(db: Database):
    """Ending all sessions for a person drops every token they hold."""
    sessions = Sessions(db, now=lambda: 0.0)
    t1 = sessions.issue("rita@clausewerk", 10.0).token
    t2 = sessions.issue("rita@clausewerk", 10.0).token
    t3 = sessions.issue("leah@clausewerk", 10.0).token

    sessions.end_all_for("rita@clausewerk")
    assert sessions.person_for(t1) is None
    assert sessions.person_for(t2) is None
    assert sessions.person_for(t3) == "leah@clausewerk"
