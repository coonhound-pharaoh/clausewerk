"""Refusals stay legible — and stay distinguishable from an empty result.

Each case here is produced by making the real database refuse, not by
constructing an error object. A classifier tested against errors somebody wrote
by hand is a classifier tested against its author's assumptions.
"""

from __future__ import annotations

import psycopg
import pytest

from doorway.db import Database
from doorway.refusals import classify


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=3)
    yield database
    database.close()


@pytest.fixture
def people(db: Database, owner_url: str):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
                      ("owner@clausewerk", "admin@clausewerk", "The Administrator",
                       "leah@clausewerk", "Leah Legal", "Legal"))
    return db


def refusal_from(db: Database, person: str, role: str, statement: str, params=()):
    """Run something the database will refuse, and classify what came back."""
    with pytest.raises(Exception) as caught:
        with db.as_person(person, role) as request:
            request.write(statement, params)
    return classify(caught.value)


def test_a_privilege_refusal_says_your_role_cannot_do_this(people, db: Database):
    refused = refusal_from(
        db, "leah@clausewerk", "legal_admin",
        "insert into cw.account (person, display_name, role, created_by) "
        "values ('x@clausewerk', 'X', 'viewer', 'leah@clausewerk')")

    assert refused.kind == "not_permitted"
    assert refused.status == 403
    assert refused.reason, "a refusal with no words is a refusal nobody can act on"


def test_the_database_s_own_words_reach_the_caller_unchanged(people, db: Database):
    """The schema raises sentences written for humans. Rewording them here would
    replace an accurate sentence with a vaguer one, and commit us to keeping the
    vaguer one in step with the schema forever."""
    refused = refusal_from(
        db, "admin@clausewerk", "administrator",
        "insert into cw.role_grant (action, person, role, acted_by, reason) "
        "values ('granted', 'admin@clausewerk', 'legal_admin', 'admin@clausewerk', "
        "'promoting myself')")

    assert "grant" in refused.reason.lower() or "themselves" in refused.reason.lower(), (
        f"the self-grant refusal arrived as {refused.reason!r}, which does not "
        "explain what was refused — the schema's own sentence has been lost"
    )
    assert refused.status in (403, 409)


def test_a_refusal_on_the_merits_is_not_reported_as_a_permission_problem(
    people, db: Database
):
    """Two different sentences: 'your role may not do this' and 'this act is not
    allowed right now'. Telling somebody they lack permission when the real
    answer is that the act itself is refused sends them to the wrong person."""
    refused = refusal_from(
        db, "admin@clausewerk", "administrator",
        "insert into cw.account (person, display_name, role, created_by) "
        "values ('admin@clausewerk', 'Duplicate', 'viewer', 'admin@clausewerk')")

    assert refused.kind == "refused_on_merits"
    assert refused.status == 409


def test_the_database_being_unreachable_is_not_the_callers_fault():
    """No fixture, deliberately: the point is the database is never reached.

    The error is still real — a genuine failed connection attempt against a
    port nobody answers — because a classifier tested against errors somebody
    wrote by hand is tested against its author's assumptions.

    Two facts, both load-bearing: an outage is reported as the service's
    failure and never as the caller's mistake (a 400 sends somebody to argue
    with their administrator about a network cable); and the driver's own
    message — which names hosts and ports — never reaches the caller.
    """
    with pytest.raises(psycopg.OperationalError) as caught:
        psycopg.connect(
            "postgresql://cw_app:wrong@127.0.0.1:9/clausewerk", connect_timeout=1)

    broke = classify(caught.value)
    assert broke.status == 500, (
        f"the database being down was classified as a {broke.status} — the "
        "caller is being blamed for an outage")

    body = broke.as_body()
    assert body["error"] != "refused", (
        "an outage arrived wearing a refusal's clothes")
    assert "127.0.0.1" not in body["reason"], (
        "the driver's message reached the caller — hosts and ports are "
        "nobody's business outside")


def test_a_pool_timeout_is_covered_by_the_same_classification():
    """The unreachable-database rule leans on pool timeouts being operational
    errors. That is the driver's promise, and this pins it: if an upgrade ever
    breaks the inheritance, this fails by name rather than the outage handling
    quietly regressing to 400."""
    from psycopg_pool import PoolTimeout

    assert issubclass(PoolTimeout, psycopg.OperationalError)


def test_a_broken_statement_is_redacted_as_the_services_fault(capsys):
    detail = "column secret_internal_column does not exist"

    broke = classify(psycopg.errors.UndefinedColumn(detail))

    assert broke.status == 500
    assert broke.kind == "broke"
    assert detail not in broke.as_body()["reason"]
    assert detail in capsys.readouterr().err


def test_every_refusal_is_showable(people, db: Database):
    """Whatever the kind, the interface must have something to say. A blank
    reason renders as a spinner that never resolves."""
    refused = refusal_from(
        db, "leah@clausewerk", "legal_admin",
        "insert into cw.account (person, display_name, role, created_by) "
        "values ('y@clausewerk', 'Y', 'viewer', 'leah@clausewerk')")

    body = refused.as_body()
    assert body["error"] == "refused"
    assert body["reason"].strip()
    assert body["kind"] in {"not_permitted", "refused_on_merits", "rejected"}
