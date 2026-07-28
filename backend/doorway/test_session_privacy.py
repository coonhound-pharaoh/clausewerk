"""A session key is a credential, and only sign-in may reach one.

AUDIT FINDING A-1.

`cw.session` holds live session tokens. Migration 0032 granted the table to
`cw_viewer` with a policy of `using (true)`, on the reasoning that cw_viewer is
"the lookup role". It is — on the sign-in path. It is also one of the six real
application roles, the one held by outside suppliers, and `db.py` binds any
person whose effective role is `viewer` to exactly that database role. The table
could not tell the two apart.

These tests are the audit's own probe, kept: sign somebody in, then read the
table as an ordinary viewer and assert nothing comes back.

WHY THIS IS WORTH A TEST OF ITS OWN
A stolen session key is indistinguishable from its real holder and leaves no
audit trail, so this is the difference between reading data about somebody and
being able to act as them. Nothing in the suite asserted what the policy did;
the finding was found by reading the migration, and the suite would not have
caught its reintroduction.

Everything here asserts row counts, exceptions and identity — never wording.
"""

from __future__ import annotations

import psycopg
import pytest

from doorway.db import Database
from doorway.sessions import LOOKUP_ACTOR, LOOKUP_ROLE, Sessions

ADMIN = "admin@clausewerk"
LEGAL = "leah@clausewerk"
SUPPLIER = "sam@clausewerk"


@pytest.fixture
def library(schema: str, owner_url: str):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      (ADMIN, ADMIN, "The Administrator", LEGAL, "Leah Legal", "Legal"))

    database = Database(schema, min_size=1, max_size=6)
    with database.as_person(ADMIN, "administrator") as request:
        request.write(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values (%s, 'Sam Reed', 'Supplier', 'viewer', %s) on conflict do nothing",
            (SUPPLIER, ADMIN))
    yield database
    database.close()


def test_a_viewer_cannot_read_a_session_key(library):
    """The finding, exactly as the audit demonstrated it."""
    issued = Sessions(library).issue(ADMIN, 3600.0)

    with library.as_person(SUPPLIER, "viewer") as request:
        rows = request.rows("select token, person from cw.session")

    assert rows == [], "a viewer read live session keys"
    # And the row really is there — otherwise this passes for the wrong reason.
    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        assert request.rows(
            "select token from cw.session where token = %s", (issued.token,))


def test_a_viewer_cannot_sign_everybody_out(library):
    """`delete` was granted too, which made this a one-statement outage."""
    Sessions(library).issue(ADMIN, 3600.0)
    Sessions(library).issue(LEGAL, 3600.0)

    with library.as_person(SUPPLIER, "viewer") as request:
        request.write("delete from cw.session")

    with library.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:
        surviving = request.one("select count(*) from cw.session")[0]
    assert surviving == 2, "a viewer deleted sessions belonging to other people"


def test_a_viewer_cannot_plant_a_session(library):
    """Insert is the same hole facing the other way: minting a session for
    somebody else is signing in as them."""
    with library.as_person(SUPPLIER, "viewer") as request:
        with pytest.raises(psycopg.Error):
            request.write(
                "insert into cw.session (token, person, expires_at) "
                "values ('forged', %s, 99999999999)", (ADMIN,))


def test_sign_in_itself_still_works(library):
    """The guard is worthless if it also stops the one path that must pass.

    Covered incidentally by the rest of the suite; asserted here so a failure
    points at the policy rather than at whatever else broke.
    """
    sessions = Sessions(library)
    issued = sessions.issue(ADMIN, 3600.0)

    assert sessions.person_for(issued.token) == ADMIN
    assert len(sessions) == 1
    sessions.end(issued.token)
    assert sessions.person_for(issued.token) is None


def test_the_actor_the_policy_trusts_cannot_be_taken_by_an_account(library):
    """Without this the policy above is forgeable.

    The policy trusts the actor name `__signin__`. `cw.account.person` is an
    unconstrained text primary key and POST /accounts takes it from the request
    body, so an administrator could otherwise create an account with that name
    and a viewer role, satisfy the policy, and read every session key — through
    the front door, with no error anywhere.
    """
    with library.as_person(ADMIN, "administrator") as request:
        with pytest.raises(psycopg.Error):
            request.write(
                "insert into cw.account (person, display_name, unit, role, created_by) "
                "values (%s, 'Forged', 'Supplier', 'viewer', %s)",
                (LOOKUP_ACTOR, ADMIN))


def test_an_ordinary_person_is_unaffected_by_the_reserved_namespace(library):
    """The constraint must reserve system names without touching real ones."""
    with library.as_person(ADMIN, "administrator") as request:
        request.write(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values (%s, 'Ordinary', 'Procurement', 'requester', %s)",
            ("d.buyer@clausewerk", ADMIN))
        assert request.one(
            "select count(*) from cw.account where person = %s",
            ("d.buyer@clausewerk",))[0] == 1
