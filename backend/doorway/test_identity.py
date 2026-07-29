"""Sign-in, and the rules it must not walk around.

These are the tests the plan names as the bar for this workstream. Each one is
written so that it fails if the doorway takes the convenient route rather than
the correct one.
"""

from __future__ import annotations

import pytest

from doorway.db import Database
from doorway.identity import (
    Caller,
    NoEffectiveRole,
    NoSession,
    caller_for,
    effective_role,
    session_length,
    sign_in,
)
from doorway.sessions import Sessions


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def people(db: Database, owner_url: str):
    """The bootstrap ceremony, plus the people these tests need.

    Bootstrapping needs the owner, because it happens before any Administrator
    exists — that is the ceremony's whole point. Everything after it is done as
    the Administrator, through the same doorway everybody else uses.
    """
    import psycopg

    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      ("owner@clausewerk", "admin@clausewerk", "The Administrator",
                       "leah@clausewerk", "Leah Legal", "Legal"))

    with db.as_person("admin@clausewerk", "administrator") as request:
        # A plain role the Administrator may grant alone.
        request.write_one(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values ('rita@clausewerk', 'Rita Requester', 'Procurement', 'requester', "
            "'admin@clausewerk')")
        request.write_one(
            "insert into cw.role_grant (action, person, role, acted_by, reason) "
            "values ('granted', 'rita@clausewerk', 'requester', 'admin@clausewerk', "
            "'runs intake')")

        # A LEGAL role, proposed and deliberately NOT countersigned. This person
        # is the whole point of test 4 below.
        request.write_one(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values ('luke@clausewerk', 'Luke Lawyer', 'Legal', 'legal_reviewer', "
            "'admin@clausewerk')")
        request.write_one(
            "insert into cw.role_grant (action, person, role, acted_by, reason) "
            "values ('granted', 'luke@clausewerk', 'legal_reviewer', "
            "'admin@clausewerk', 'awaiting countersign')")
    return db


# ── The critical join ───────────────────────────────────────────────────────


def test_a_pending_countersign_confers_nothing(people, db: Database):
    """B.8 test 4, and the one that proves the doorway honoured the countersign
    rule instead of walking around it.

    Luke has an account whose `role` column says legal_reviewer, and a grant that
    no Legal admin has countersigned. `cw.account.role` therefore says
    'legal_reviewer' and `cw.effective_role` says nothing at all.

    IF THIS TEST PASSES WHILE THE DOORWAY READS cw.account.role, THE TEST IS
    WRONG, NOT THE CODE. The assertion below reads the declared column itself and
    insists the two genuinely disagree, so the test cannot quietly become
    tautological.
    """
    with db.as_person("admin@clausewerk", "administrator") as request:
        declared = request.one(
            "select role from cw.account where person = 'luke@clausewerk'")[0]

    assert declared == "legal_reviewer", (
        "the fixture no longer sets up the disagreement this test exists to "
        "detect — the declared column must say legal_reviewer for the check below "
        "to mean anything"
    )

    assert effective_role(db, "luke@clausewerk") is None, (
        "an uncountersigned grant of a Legal role conferred a role — the doorway "
        "is reading cw.account.role (the administrative record) instead of "
        "cw.effective_role (the authority), and decision U6 has been bypassed"
    )


def test_a_person_with_no_effective_role_gets_no_session(people, db: Database):
    """Failing closed. Not a viewer session, not a degraded one — none."""
    sessions = Sessions(db)
    with pytest.raises(NoEffectiveRole):
        sign_in(db, sessions, "luke@clausewerk")
    assert len(sessions) == 0, "a refused sign-in still issued a session"


def test_countersigning_turns_the_grant_on(people, db: Database):
    """The other half, so the test above is proving the rule and not just that
    Luke cannot sign in for some unrelated reason."""
    with db.as_person("admin@clausewerk", "administrator") as request:
        grant_id = request.one(
            "select grant_id from cw.role_grant where person = 'luke@clausewerk' "
            "and action = 'granted'")[0]

    with db.as_person("leah@clausewerk", "legal_admin") as request:
        request.write_one(
            "insert into cw.role_grant (action, person, role, grant_ref, acted_by) "
            "values ('countersigned', 'luke@clausewerk', 'legal_reviewer', %s, "
            "'leah@clausewerk')", (grant_id,))

    assert effective_role(db, "luke@clausewerk") == "legal_reviewer"
    issued = sign_in(db, Sessions(db), "luke@clausewerk")
    assert issued.token


def test_an_unknown_person_gets_no_session(people, db: Database):
    with pytest.raises(NoEffectiveRole):
        sign_in(db, Sessions(db), "nobody@clausewerk")


# ── Revocation ──────────────────────────────────────────────────────────────


def test_a_revoked_person_is_out_on_their_next_request(people, db: Database):
    """B.8 test 3. Not their next sign-in — which for an eight-hour session could
    be never."""
    sessions = Sessions(db)
    issued = sign_in(db, sessions, "rita@clausewerk")
    assert caller_for(db, sessions, issued.token) == Caller("rita@clausewerk", "requester")

    with db.as_person("admin@clausewerk", "administrator") as request:
        grant_id = request.one(
            "select grant_id from cw.role_grant where person = 'rita@clausewerk' "
            "and action = 'granted'")[0]
        request.write_one(
            "insert into cw.role_grant (action, person, role, grant_ref, acted_by, reason) "
            "values ('revoked', 'rita@clausewerk', 'requester', %s, 'admin@clausewerk', "
            "'left the company')", (grant_id,))

    with pytest.raises(NoEffectiveRole):
        caller_for(db, sessions, issued.token)


def test_the_session_ends_when_the_role_goes(people, db: Database):
    """Somebody whose authority is withdrawn is signed out rather than left
    holding a token that is refused on every request without explanation."""
    sessions = Sessions(db)
    issued = sign_in(db, sessions, "rita@clausewerk")

    with db.as_person("admin@clausewerk", "administrator") as request:
        grant_id = request.one(
            "select grant_id from cw.role_grant where person = 'rita@clausewerk' "
            "and action = 'granted'")[0]
        request.write_one(
            "insert into cw.role_grant (action, person, role, grant_ref, acted_by, reason) "
            "values ('revoked', 'rita@clausewerk', 'requester', %s, 'admin@clausewerk', 'x')",
            (grant_id,))

    with pytest.raises(NoEffectiveRole):
        caller_for(db, sessions, issued.token)
    assert len(sessions) == 0, "the doomed session was left in place"


# ── Sign-ins expire ─────────────────────────────────────────────────────────


def test_a_session_expires_on_the_length_the_administrator_sets(people, db: Database):
    """The length comes from the operational setting, not from a constant."""
    clock = {"t": 1000.0}
    sessions = Sessions(db, now=lambda: clock["t"])

    with db.as_person("admin@clausewerk", "administrator") as request:
        request.write_one(
            "update cw.governance_setting set value = '2h' where key = 'session_length'")

    assert session_length(db) == 2 * 3600.0

    issued = sign_in(db, sessions, "rita@clausewerk")
    clock["t"] += 2 * 3600.0 - 1
    assert caller_for(db, sessions, issued.token).person == "rita@clausewerk"

    clock["t"] += 2
    with pytest.raises(NoSession):
        caller_for(db, sessions, issued.token)


def test_a_nonsense_session_length_falls_back_rather_than_to_zero(people, db: Database):
    """A zero-length session would sign everybody out instantly and look like a
    broken product. Falling back looks like the setting was ignored, which is
    both true and recoverable."""
    with db.as_person("admin@clausewerk", "administrator") as request:
        request.write_one(
            "update cw.governance_setting set value = 'whenever' "
            "where key = 'session_length'")

    assert session_length(db) == 8 * 3600.0


def test_signing_out_ends_the_session(people, db: Database):
    sessions = Sessions(db)
    issued = sign_in(db, sessions, "rita@clausewerk")
    sessions.end(issued.token)
    with pytest.raises(NoSession):
        caller_for(db, sessions, issued.token)


def test_no_token_is_no_session(people, db: Database):
    sessions = Sessions(db)
    for token in (None, "", "made-up-token"):
        with pytest.raises(NoSession):
            caller_for(db, sessions, token)
