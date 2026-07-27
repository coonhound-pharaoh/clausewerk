"""The session store, alone — no database, no socket.

The server is threaded on purpose (see server.py), which means the sign-in
ledger is shared state. These tests prove the two failures that shape allowed:

  · two requests presenting the same expired token raced their removals, and
    the loser crashed its request with a KeyError the user saw as "we broke";
  · an expired session was only removed when its exact token came back, so an
    abandoned browser left its entry behind forever — and sign-in is the one
    unauthenticated door, so that was memory a stranger could fill.
"""

from __future__ import annotations

import threading

from doorway.sessions import Sessions


def test_an_entry_removed_mid_check_is_no_session_not_a_crash():
    """The exact interleaving the threaded server produces: the token is found,
    and by the time this request goes to remove it as expired, another request
    has already removed it. The clock callback stands in for the other thread —
    it runs between the lookup and the removal, exactly where the other request
    would."""
    sessions = Sessions(now=lambda: 0.0)
    issued = sessions.issue("rita@clausewerk", 10.0)

    def racing_clock() -> float:
        # Another request got here first: the entry is already gone.
        sessions._by_token.pop(issued.token, None)
        return 1_000_000.0  # long past expiry

    sessions._now = racing_clock
    assert sessions.person_for(issued.token) is None


def test_expired_sessions_are_swept_when_a_new_one_is_issued():
    """Abandoned sign-ins must not accumulate: the store is in process memory
    and sign-in needs no credential, so growth without bound is a door."""
    clock = {"t": 0.0}
    sessions = Sessions(now=lambda: clock["t"])

    for _ in range(5):
        sessions.issue("rita@clausewerk", 10.0)
    assert len(sessions) == 5

    clock["t"] = 11.0  # all five are now expired, none ever presented again
    sessions.issue("leah@clausewerk", 10.0)
    assert len(sessions) == 1, "expired sessions were kept until presented"


def test_the_store_survives_genuinely_parallel_traffic():
    """Sign-ins, presentations of expiring tokens, and revocations, all at
    once. Any unguarded read-check-remove in the store surfaces here as a
    KeyError or a dictionary-changed-size error on some thread."""
    clock = {"t": 0.0}
    sessions = Sessions(now=lambda: clock["t"])
    failures: list[BaseException] = []

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
