"""What the doorway must never do, written as tests because that is how they
will be enforced.

These correspond to the plan's prohibitions. Each is cheap, and each catches a
mistake that is far more likely to arrive in an innocent-looking change than in
an obviously wrong one.
"""

from __future__ import annotations

import psycopg
import pytest

from doorway.db import Database, SilentlyRefused, UnknownRole
from doorway.identity import LOOKUP_ROLE, effective_role


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def people(db: Database, owner_url: str):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      ("owner@clausewerk", "admin@clausewerk", "The Administrator",
                       "leah@clausewerk", "Leah Legal", "Legal"))
    with db.as_person("admin@clausewerk", "administrator") as request:
        request.write_one(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values ('rita@clausewerk', 'Rita Requester', 'Procurement', 'requester', "
            "'admin@clausewerk')")
        request.write_one(
            "insert into cw.role_grant (action, person, role, acted_by, reason) "
            "values ('granted', 'rita@clausewerk', 'requester', 'admin@clausewerk', 'x')")
    return db


# ── No privileged connection ────────────────────────────────────────────────


def test_the_pool_does_not_log_in_as_an_owner_or_superuser(db: Database):
    """B.8 test 5. The cheapest test in the suite and the one most likely to
    matter: it catches the "just for this one endpoint" shortcut in review rather
    than in production.

    A privileged connection does not merely leak the thing it fetched. It
    disables every row-by-row rule on that path, and it will look like a
    performance fix.
    """
    with db.borrow_bare() as bare:
        login, superuser, bypass = bare.execute(
            "select current_user, "
            "       (select rolsuper from pg_roles where rolname = current_user), "
            "       (select rolbypassrls from pg_roles where rolname = current_user)"
        ).fetchone()

    assert not superuser, (
        f"the doorway connects as {login}, which is a superuser — every row-by-row "
        "rule in the schema is bypassed on every request"
    )
    assert not bypass, (
        f"the doorway connects as {login}, which bypasses row-level security"
    )
    assert login == "cw_app", (
        f"the doorway connects as {login}; it must connect as cw_app, the login "
        "that holds no application role until a request binds one"
    )


def test_the_doorway_s_login_does_not_inherit_the_roles_it_may_become(db: Database):
    """The single word that makes membership of six roles safe.

    cw_app is a member of all six application roles. NOINHERIT is what stops that
    membership handing it the SUM of their privileges on every connection, before
    any request has said who it is.

    ASSERTED DIRECTLY, AND TWO MISSES WORTH RECORDING.

    First attempt: set the live role to `inherit` by hand and expect a test to
    notice. Nothing did — the fixture rebuilds the schema, and migration 0016
    re-asserts NOINHERIT before any test looks. The protection was intact and the
    check was worthless. That is trap 4.3 exactly: key a mutation on what is live
    after all migrations run, never on a value something else repairs first.

    Second attempt: remove `noinherit` from 0016 itself. That does not fail this
    test either — it stops the entire suite at setup, because `prepare()` refuses
    to ready a database whose doorway login would hold all six roles at once.
    That is the right behaviour and it is deliberately kept: a deployment with
    this property broken must not proceed to run tests that then pass. The named
    check for that refusal is
    `test_a_deployment_refuses_if_the_login_would_inherit_its_roles` below.

    What remains here is the plain statement of the property, which is what a
    reader comes looking for.
    """
    with db.borrow_bare() as bare:
        inherits = bare.execute(
            "select rolinherit from pg_roles where rolname = current_user"
        ).fetchone()[0]

    assert inherits is False, (
        "the doorway's login inherits the six application roles, so every "
        "connection holds all six roles' privileges at once — an administrator's "
        "writes and a legal admin's authority available before any request has "
        "said who it is"
    )


def test_a_deployment_refuses_if_the_login_would_inherit_its_roles(
    schema: str, owner_url: str
):
    """The guard that makes the rule above survive a hand-edited database.

    Migration 0016 sets NOINHERIT, but roles are cluster-wide and outlive any
    schema rebuild, so somebody with database access can change this role without
    touching a migration. `prepare()` therefore re-reads the property every time
    it readies a database and refuses rather than proceeding — because the
    failure it prevents is silent, and a system that has quietly handed every
    connection all six roles looks entirely healthy.
    """
    from doorway.setup import prepare

    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("alter role cw_app inherit")
    try:
        with pytest.raises(RuntimeError, match="inherit"):
            prepare(owner_url=owner_url)
    finally:
        with psycopg.connect(owner_url, autocommit=True) as owner:
            owner.execute("alter role cw_app noinherit")


def test_an_idle_connection_can_do_nothing(db: Database):
    """The consequence of the rule above, observed rather than reasoned about."""
    with db.borrow_bare() as bare:
        role = bare.execute("select cw.app_role()").fetchone()[0]
        assert role is None, (
            f"an unbound connection reports the application role {role!r} — it "
            "should hold none at all until a request binds one"
        )

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            bare.execute("select count(*) from cw.account").fetchone()


def test_the_doorway_offers_no_way_to_reach_a_privileged_connection(db: Database):
    """Structural, not a matter of care. `Database` exposes exactly two ways to
    reach the database and both are unprivileged; applying the schema lives in a
    different module that a request handler never touches."""
    reachable = {name for name in dir(db) if not name.startswith("_")}
    assert reachable == {"as_person", "borrow_bare", "close"}, (
        f"Database has grown a new way to reach the database: "
        f"{reachable - {'as_person', 'borrow_bare', 'close'}}. Every one of them "
        "must bind a person's role before the first statement."
    )


# ── No role claimed by the caller ───────────────────────────────────────────


def test_a_role_that_is_not_one_of_the_six_is_refused(db: Database):
    """A doorway that quietly picks a role when it does not recognise one is a
    doorway that grants access on a typo. Refused, never defaulted."""
    for made_up in ("superuser", "postgres", "cw_legal_admin", "admin", ""):
        with pytest.raises(UnknownRole):
            with db.as_person("someone@clausewerk", made_up):
                pass


def test_the_role_comes_from_the_database_not_from_the_caller(people, db: Database):
    """B.8 test 2, at the layer where it is decided.

    There is no argument, header or field anywhere in the doorway by which a
    caller supplies their own role. The role is resolved by asking the database
    about the person, and this test states the resolution and its source
    together so that a future change which starts trusting the caller has to
    delete an assertion to do it.
    """
    assert effective_role(db, "rita@clausewerk") == "requester"

    # And the person themselves cannot vote on it: asking the database about a
    # person is the only route, and it answers from the grant record.
    with db.as_person("rita@clausewerk", "requester") as request:
        claimed = request.one("select cw.app_role()")[0]
    assert claimed == "requester", (
        "the acting role did not match the role the database granted"
    )


def test_a_requester_cannot_act_with_an_administrator_s_authority(people, db: Database):
    """The consequence, stated as an attack. Even holding a live session, a
    requester's requests run as a requester — the database refuses the rest."""
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with db.as_person("rita@clausewerk", "requester") as request:
            request.write(
                "insert into cw.account (person, display_name, role, created_by) "
                "values ('mallory@clausewerk', 'Mallory', 'legal_admin', "
                "'rita@clausewerk')")


# ── The silent no-op ────────────────────────────────────────────────────────


def test_a_change_that_changes_nothing_is_a_failure(people, db: Database):
    """B.8 test 6, mirroring the database suite's `mustNotWrite`.

    A write that a rule declines to apply does not raise. It affects zero rows
    and reports success — finding D1's exact shape, which survived a full test
    suite once because the tests ran as the owner, who bypasses everything.

    WHAT THIS TEST FOUND WHILE BEING WRITTEN, worth keeping:

    The first version tried to reproduce the no-op by having a requester update
    `cw.account`. It raised instead, because a requester holds no update
    privilege on that table at all — table privileges are the second line
    underneath the row-by-row rules, and here the second line catches it first.
    A sweep of the migrated schema then showed that EVERY table granting UPDATE
    to a role also has an update rule for that role, so D1's original shape —
    privilege granted, no rule at all — no longer exists anywhere.

    What does still exist is the row-scoped kind: `cw.concession`'s "promote
    once" rule, which matches only while a concession has not been promoted.
    Update an already-promoted one and PostgreSQL says nothing at all.

    The guard counts rows and cannot tell why there were none, so the plain case
    below proves exactly the behaviour that matters: a statement that changed
    nothing is never reported as done.
    """
    with db.as_person("admin@clausewerk", "administrator") as request:
        # Allowed, valid, and matches no row.
        changed = request.write(
            "update cw.account set display_name = 'Renamed' "
            "where person = 'nobody@clausewerk'")
        assert changed == 0

        with pytest.raises(SilentlyRefused):
            request.write_one(
                "update cw.account set display_name = 'Renamed' "
                "where person = 'nobody@clausewerk'")


def test_a_refusal_and_an_empty_result_are_different_sentences(people, db: Database):
    """Prohibition 4, at the layer where it is decided.

    "Nothing is waiting on you" and "You cannot see this" mean opposite things to
    the person reading them. The doorway must hand the interface two
    distinguishable outcomes, so that collapsing them into one is a decision
    somebody has to make on purpose rather than one that happens by default.
    """
    # An allowed read that happens to find nothing: an ordinary empty list.
    with db.as_person("rita@clausewerk", "requester") as request:
        empty = request.all(
            "select person from cw.account where person = 'nobody@clausewerk'")
    assert empty == []

    # A refusal: raised, and never expressible as an empty list.
    with pytest.raises(psycopg.errors.InsufficientPrivilege) as refused:
        with db.as_person("rita@clausewerk", "requester") as request:
            request.all("select * from cw.retention_due")

    assert refused.value.sqlstate == "42501", (
        "the refusal did not arrive as a privilege error, so the interface cannot "
        "tell it apart from an empty result"
    )


# ── Two people, one query, different answers ────────────────────────────────


def test_two_people_two_roles_same_query_different_data(people, db: Database):
    """B.8 test 1 — the plan's done-bar for this phase.

    The same statement, run by two people, returns what each of their roles is
    allowed to see. Nothing in the doorway filters anything: the difference is
    produced entirely by the database.
    """
    with db.as_person("admin@clausewerk", "administrator") as request:
        as_admin = request.all("select seq from cw.audit_event order by seq")

    with db.as_person("rita@clausewerk", "requester") as request:
        as_requester = request.all("select seq from cw.audit_event order by seq")

    assert as_admin, "the administrator should see the acts recorded so far"
    assert len(as_requester) < len(as_admin), (
        "a requester saw as much of the audit chain as an administrator — the "
        "scoping policy is not being applied, which happens when something in "
        "the path is running with more authority than the person has"
    )


def test_sign_in_reads_as_the_least_privileged_role(people, db: Database):
    """The one genuine chicken-and-egg in the serving path — reading the staff
    list before any role is known — is resolved with the WEAKEST role, not the
    owner. So the worst a bug on that path can do is read the staff list."""
    assert LOOKUP_ROLE == "viewer"

    with db.as_person("__signin__", LOOKUP_ROLE) as request:
        # It can read who people are…
        assert request.one("select count(*) from cw.account")[0] >= 3
        # …and nothing else of consequence.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            request.write(
                "insert into cw.audit_event (event_type, actor, subject) "
                "values ('forged', 'x', 'y')")
