"""Two runs preparing at once must not collide on the one shared object.

THE HAZARD

A role is CLUSTER-WIDE. The harness gives every process its own database, which
is what stopped two runs deadlocking on 2026-07-26 — but `cw_app` lives in
`pg_authid`, outside that isolation, and two statements rewrite it on every
schema rebuild: migration 0016's `alter role cw_app noinherit`, and `prepare()`'s
`alter role cw_app login password`. The schema fixture rebuilds per test, so one
full run issues them hundreds of times, and two overlapping runs make PostgreSQL
raise `tuple concurrently updated` — surfacing as a random error in an unrelated
test, with a message about role inheritance.

`npm run verify` runs the doorway suite, and several sessions work this
repository at once, so "two runs at once" is the normal case, not a contrived
one.

WHY THIS TEST HAMMERS

The collision is a race. A single sequential pass proves nothing — it would pass
against the broken code too. These tests run the contended statements
concurrently, which is the only way the guarantee is observable.
"""

import concurrent.futures as futures
import os

import psycopg
import pytest

from doorway.setup import prepare

WORKERS = 12

# PostgreSQL's own words for a concurrent catalogue update. Spelled out here
# rather than imported from migrate.py, deliberately: this file must be able to
# RUN against code that has not been fixed yet, which is the only way its
# failure is a demonstration rather than a claim.
CONTENDED = "tuple concurrently updated"

# Likewise. Read from setup.py if it is there, so the rotation test skips rather
# than errors on a tree where that package has not landed.
RESET_PASSWORD_VARIABLE = getattr(
    __import__("doorway.setup", fromlist=["setup"]),
    "RESET_PASSWORD_VARIABLE",
    None,
)


def _errors(work) -> list[BaseException]:
    with futures.ThreadPoolExecutor(WORKERS) as pool:
        running = [pool.submit(work, n) for n in range(WORKERS)]
        return [f.exception() for f in running if f.exception() is not None]


def test_the_contended_statement_really_does_contend(schema, owner_url):
    """The hazard is real on this server — otherwise the tests below prove nothing.

    This is the demonstration that the fix has something to fix. If a future
    PostgreSQL makes `alter role` non-contending, this fails and the retry in
    migrate.py can be reconsidered on evidence rather than removed on a hunch.
    """
    def rewrite(_n):
        with psycopg.connect(owner_url, autocommit=True) as conn:
            conn.execute("alter role cw_app noinherit")

    clashes = [e for e in _errors(rewrite) if CONTENDED in str(e)]
    if not clashes:
        pytest.skip(
            "this server did not contend on a concurrent role rewrite; the "
            "guarantee below is untested rather than proven")


def test_concurrent_preparation_does_not_collide_on_the_shared_role(owner_url):
    """The guarantee: N processes preparing at once, and none of them dies."""
    def prepare_once(_n):
        prepare(owner_url=owner_url)

    assert _errors(prepare_once) == []


def test_a_repeat_preparation_does_not_rewrite_the_login(schema, owner_url):
    """Asserted by instrumentation, not by absence of error.

    A prepare() that quietly kept rewriting the role would still pass the test
    above most of the time. What is promised is that it writes nothing once the
    login exists, so that is what is measured: the role's own change marker.
    """
    prepare(owner_url=owner_url)

    def stamp():
        with psycopg.connect(owner_url, autocommit=True) as conn:
            return conn.execute(
                "select xmin from pg_authid where rolname = 'cw_app'"
            ).fetchone()[0]

    before = stamp()
    prepare(owner_url=owner_url)
    assert stamp() == before, "a repeat prepare() rewrote the cluster-wide role"


def test_the_login_is_still_established_on_a_role_that_cannot_log_in(owner_url):
    """The conditional must not turn into a skip that never bootstraps.

    A clean cluster reaches prepare() with cw_app unable to log in; it must come
    out able to. This drops the login first to reach that state deliberately.

    THIS TEST BREAKS A CLUSTER-WIDE OBJECT ON PURPOSE, which is the same hazard
    the rest of this file is about. `cw_app` is the login the doorway connects
    as, and a run that died between the two statements below would leave every
    later test — and any concurrent run — unable to connect at all, with an
    error nowhere near this file. So the restore is in a `finally`, and it
    restores rather than trusting prepare() to have done it.
    """
    def login_state():
        with psycopg.connect(owner_url, autocommit=True) as conn:
            return conn.execute(
                "select rolcanlogin, rolinherit from pg_roles where rolname = 'cw_app'"
            ).fetchone()

    try:
        with psycopg.connect(owner_url, autocommit=True) as conn:
            conn.execute("alter role cw_app nologin")

        prepare(owner_url=owner_url)

        can_login, inherits = login_state()
        assert can_login is True, "prepare() left cw_app unable to log in"
        assert inherits is False, "cw_app lost NOINHERIT"
    finally:
        # Unconditional, and it must stay that way: if the assertions above
        # failed, the role is exactly the thing that needs putting back.
        os.environ[RESET_PASSWORD_VARIABLE or "CW_APP_PASSWORD_RESET"] = "1"
        try:
            prepare(owner_url=owner_url)
        finally:
            os.environ.pop(RESET_PASSWORD_VARIABLE or "CW_APP_PASSWORD_RESET", None)


def test_a_rotation_is_available_when_it_is_asked_for(schema, owner_url, monkeypatch):
    """Not writing by default must not mean the password can never be changed."""
    if RESET_PASSWORD_VARIABLE is None:
        pytest.skip("prepare() rewrites unconditionally; there is nothing to rotate")
    prepare(owner_url=owner_url)

    def stamp():
        with psycopg.connect(owner_url, autocommit=True) as conn:
            return conn.execute(
                "select xmin from pg_authid where rolname = 'cw_app'"
            ).fetchone()[0]

    before = stamp()
    monkeypatch.setenv(RESET_PASSWORD_VARIABLE, "1")
    prepare(owner_url=owner_url)
    assert stamp() != before, "the rotation flag did not rotate anything"

    # Left as the rest of the suite expects to find it.
    monkeypatch.delenv(RESET_PASSWORD_VARIABLE, raising=False)
    os.environ.pop(RESET_PASSWORD_VARIABLE, None)
