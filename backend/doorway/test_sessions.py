"""The session store, now backed by the database.

These tests prove the store correctly persists sessions, sweeps expired ones,
and survives parallel traffic without crashing.
"""

from __future__ import annotations

import threading
import pytest

from doorway.sessions import Sessions
from doorway.db import Database


@pytest.fixture
def db(schema: str, owner_url: str):
    import psycopg
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      ("owner@clausewerk", "admin@clausewerk", "The Administrator",
                       "leah@clausewerk", "Leah Legal", "Legal"))
        
    database = Database(schema, min_size=1, max_size=15)
    
    with database.as_person("admin@clausewerk", "administrator") as request:
        # Create users for all tests
        users = ["rita@clausewerk", "leah@clausewerk"]
        for i in range(50):
            users.append(f"p{i}@clausewerk")
        for i in range(8):
            users.append(f"w{i}@clausewerk")
            
        for user in users:
            request.write(
                "insert into cw.account (person, display_name, unit, role, created_by) "
                "values (%s, 'Test User', 'Test', 'requester', 'admin@clausewerk') "
                "on conflict do nothing",
                (user,)
            )
            
    yield database
    database.close()


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


def test_the_store_survives_genuinely_parallel_traffic(db: Database):
    """Sign-ins, presentations of expiring tokens, and revocations, all at
    once. Proves the database correctly handles concurrent modifications."""
    clock = {"t": 0.0}
    sessions = Sessions(db, now=lambda: clock["t"])
    failures: list[BaseException] = []

    tokens = [sessions.issue(f"p{i}@clausewerk", 0.5).token for i in range(50)]
    clock["t"] = 1.0  # every token above is now expired

    def hammer(worker: int) -> None:
        try:
            for i in range(50):
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
