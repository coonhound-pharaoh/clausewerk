"""The first test, written before the doorway it tests.

THE LEAK, REPRODUCED DELIBERATELY

Run a request as one role. Hand the connection back. Take it out again. It must
carry no role and no name.

This is the whole identity scheme in one assertion. If a connection can come back
out of the pool still remembering who used it last, then every audited act after
that moment can be attributed to the wrong person, and the countersign rule, the
self-grant refusal and the access history all rest on a value that is quietly
wrong. The handoff names this as the test to write before any of the code, and
the reason is that it is the one failure the rest of the design cannot survive.

WHY IT COULD NOT BE WRITTEN BEFORE

The previous database allowed one connection, so there was no second checkout to
observe. The JavaScript doorway it replaced was honest about this in its own
comments: its clean-up was "a second line, not the mechanism", and no test could
prove otherwise. Now the pool is real and the question is answerable.

WHAT MAKES IT PASS

Not clean-up code. The identity is attached in the form PostgreSQL removes by
itself when the request's unit of work closes — `set local role` and
`set_config(..., true)`, both unwound at COMMIT, before the pool ever gets the
connection back. There is deliberately no clean-up step, because a clean-up step
is something that can fail to run.

THE MUTATION, AND WHAT IT TAUGHT

Swapping both settings for their session-lasting forms (`set role`,
`set_config(..., false)`) fails the first test here and only the first test.
That is a precise hit — the mutation is caught by the check that names it — and
the three that survive are worth understanding rather than "fixing":

  · The failure and refusal cases still pass, because PostgreSQL unwinds even a
    session-lasting `set role` when a transaction ROLLS BACK. Only the path that
    succeeds leaks. That is the counter-intuitive part: the leak appears on the
    happy path, which is the one nobody thinks to check.
  · The two-people-in-turn case still passes, because every request binds both
    values before reading anything, so a stale value is always overwritten
    rather than used.

So the leak is invisible from every angle except the one the first test takes.
It is the only check standing between the design and a silent
cross-attribution, and it should be treated accordingly.
"""

from __future__ import annotations

import pytest

from doorway.db import Database


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=1)
    yield database
    database.close()


def test_a_request_runs_as_the_role_it_was_opened_with(db: Database):
    """The other half of the scheme, and it needed its own test.

    Every check below proves the identity does not OUTLIVE the request. This
    one proves it is attached in the first place — and it is deliberately
    written to need no seeded people and touch no table, only
    `current_user` and the actor setting.

    That is the whole point of it. Until 2026-07-27 the "role is not bound"
    mutation was scored by a server test whose FIXTURE seeds the demo people
    through the doorway; with no role bound, the seeding is refused with
    `permission denied for table account`, so the test ERRORED before running
    a single assertion. pytest exited non-zero, the harness read that as
    caught, and the guarantee was never evaluated. A test that cannot reach
    its own assertion is not watching anything.
    """
    with db.as_person("ada@clausewerk", "legal_admin") as request:
        role = request.one("select current_user")[0]
        actor = request.one("select current_setting('cw.actor', true)")[0]

    assert role == "cw_legal_admin", (
        f"the request ran as {role} rather than the role it was opened with — "
        "with no application role bound, every policy in the schema fails "
        "closed and the doorway can do nothing at all"
    )
    assert actor == "ada@clausewerk", (
        f"the request ran under the name {actor!r} — every audited act would "
        "be recorded against nobody"
    )


def test_a_returned_connection_carries_no_role_and_no_actor(db: Database):
    """The named test. One connection in the pool, so the connection handed back
    is provably the same one taken out next — the strictest possible reading,
    and the only one that actually proves anything."""
    with db.as_person("ada@clausewerk", "legal_admin") as request:
        assert request.one("select current_user")[0] == "cw_legal_admin"
        assert request.one("select current_setting('cw.actor', true)")[0] == "ada@clausewerk"

    # Handed back. Now take it out again with no identity attached at all.
    with db.borrow_bare() as bare:
        role = bare.execute("select current_user").fetchone()[0]
        actor = bare.execute("select current_setting('cw.actor', true)").fetchone()[0]

    assert role != "cw_legal_admin", (
        f"the connection came back out still acting as {role} — "
        "the identity outlived its request, which is the leak this whole scheme exists to prevent"
    )
    assert not actor, (
        f"the connection came back out still named {actor!r} — "
        "the next person's audited acts would be recorded under that name"
    )


def test_the_role_does_not_survive_even_when_the_request_fails(db: Database):
    """A request that raises must leave nothing behind either.

    This is the case clean-up code gets wrong, and it is why the identity is
    attached in a self-expiring form instead: PostgreSQL unwinds it on ROLLBACK
    exactly as it does on COMMIT, with no cooperation from us."""
    with pytest.raises(RuntimeError):
        with db.as_person("ada@clausewerk", "legal_admin") as request:
            request.one("select 1")
            raise RuntimeError("the request failed halfway")

    with db.borrow_bare() as bare:
        role = bare.execute("select current_user").fetchone()[0]
        actor = bare.execute("select current_setting('cw.actor', true)").fetchone()[0]

    assert role != "cw_legal_admin", "a failed request left its role on the connection"
    assert not actor, "a failed request left its person's name on the connection"


def test_a_database_refusal_also_leaves_nothing_behind(db: Database):
    """The most likely way a request ends badly is the database refusing it.

    A refusal is the system working, so it must not also be the thing that
    poisons the next request."""
    with pytest.raises(Exception):
        with db.as_person("vic@clausewerk", "viewer") as request:
            # A viewer holds no insert privilege on the audit log.
            request.one(
                "insert into cw.audit_event (event_type, actor, subject) "
                "values ('forged', 'vic@clausewerk', 'x') returning seq"
            )

    with db.borrow_bare() as bare:
        role = bare.execute("select current_user").fetchone()[0]
        actor = bare.execute("select current_setting('cw.actor', true)").fetchone()[0]

    assert role != "cw_viewer", "a refused request left its role on the connection"
    assert not actor, "a refused request left its person's name on the connection"


def test_two_people_in_turn_do_not_borrow_each_other_s_name(db: Database):
    """The leak's actual consequence, stated as the business cares about it.

    One pooled connection, two people in sequence. The second must see their own
    name, never the first's — this is the assertion that would have caught the
    ADR-0008 residual if it had ever been reachable."""
    with db.as_person("ada@clausewerk", "legal_admin") as request:
        first = request.one("select current_setting('cw.actor', true)")[0]

    with db.as_person("bob@clausewerk", "requester") as request:
        second = request.one("select current_setting('cw.actor', true)")[0]
        role = request.one("select current_user")[0]

    assert first == "ada@clausewerk"
    assert second == "bob@clausewerk", (
        f"the second person was seen as {second!r} — one person's identity "
        "reached another person's request"
    )
    assert role == "cw_requester", (
        f"the second request ran as {role}, carrying the first person's authority"
    )
