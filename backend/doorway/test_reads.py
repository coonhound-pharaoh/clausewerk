"""The ported reads answer the way the JavaScript answered.

THE THREE THINGS THESE TESTS ARE HERE TO CATCH

  1. A statement that drifted during the port. Twenty-five endpoints copied by
     hand is exactly where a typo lives, and a typo in a column name does not
     look like a bug — it looks like an endpoint nobody has clicked yet. So the
     statements are compared against the JavaScript character for character
     (whitespace aside), and every one is then run against the real schema.

  2. A refusal softened into an empty list. "Nothing is waiting on you" and "You
     may not see this" are opposite sentences. Every read is run as a role that
     may not use it, and the outcome must be a refusal with words in it.

  3. A permission check that appeared in the Python. There is not one in the
     JavaScript. If a check ever seems necessary here, the database is missing a
     rule and the fix belongs there.

The JavaScript service is still running and still the specification. These tests
compare against it directly; when it is deleted in WP-P5 the comparison tests go
with it, and what remains is the running-against-the-schema half.
"""

from __future__ import annotations

import io
import re
import tokenize
from pathlib import Path

import psycopg
import pytest

from doorway import reads
from doorway.db import Database
from doorway.identity import Caller
from doorway.reads import READS, NoSuchRead, answer, run
from doorway.setup import OWNER_URL

# SQLSTATEs that mean the statement itself is broken — a column that does not
# exist, a view that does not exist, a syntax error. These are NOT refusals, and
# a port that produces one has copied something wrong. This is the exact failure
# `GET /waiting/tickets` shipped with in the JavaScript and nobody noticed,
# because the seeded system had no tickets for the endpoint to fail on.
BROKEN_STATEMENT = {
    "42601",  # syntax error
    "42703",  # undefined column
    "42P01",  # undefined table or view
    "42883",  # undefined function
    "42P10",  # invalid column reference
}

JAVASCRIPT_SERVICE = Path(__file__).resolve().parents[1] / "service" / "app.mjs"


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def people(db: Database):
    """Two roles with genuinely different sight: an Administrator who runs the
    machine, and a requester who sees their own work and little else.

    Two, not one, because a suite that checks every endpoint as the most
    privileged role proves only that the endpoints parse.
    """
    with psycopg.connect(OWNER_URL, autocommit=True) as owner:
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            ("owner@clausewerk", "admin@clausewerk", "The Administrator",
             "leah@clausewerk", "Leah Legal", "Legal"),
        )
    with db.as_person("admin@clausewerk", "administrator") as request:
        request.write_one(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values ('rita@clausewerk', 'Rita Requester', 'Procurement', 'requester', "
            "'admin@clausewerk')")
        request.write_one(
            "insert into cw.role_grant (action, person, role, acted_by, reason) "
            "values ('granted', 'rita@clausewerk', 'requester', 'admin@clausewerk', "
            "'so there is a second pair of eyes to test with')")
    return db


ADMINISTRATOR = Caller(person="admin@clausewerk", role="administrator")
REQUESTER = Caller(person="rita@clausewerk", role="requester")


# ── 1. The port carried the JavaScript across unchanged ─────────────────────


def javascript_reads() -> dict[str, str]:
    """The read endpoints as the JavaScript service declares them.

    Read from the file rather than from a copy kept here, because a copy kept
    here would be the second thing to drift.
    """
    source = JAVASCRIPT_SERVICE.read_text(encoding="utf-8")
    found = re.findall(r"'(GET [^']+)':\s*\{\s*sql:\s*`([^`]*)`", source)
    assert found, (
        f"no read endpoints could be read out of {JAVASCRIPT_SERVICE.name}; the "
        "comparison tests below would pass while comparing nothing"
    )
    return {key: sql for key, sql in found}


def squashed(sql: str) -> str:
    """Whitespace collapsed. Indentation differs between the two files by
    necessity; anything else differing is a change made during a port."""
    return " ".join(sql.split())


def test_every_javascript_read_exists_in_python():
    missing = sorted(set(javascript_reads()) - set(READS))
    assert not missing, (
        f"{len(missing)} read endpoint(s) were not ported: {missing}. Each one is "
        "a screen that goes blank when the JavaScript service is retired."
    )


def test_python_invented_no_read_the_javascript_does_not_have():
    """An endpoint that appeared during the port is an untested change wearing a
    port's clothes. New endpoints are welcome — after the port, on their own."""
    invented = sorted(set(READS) - set(javascript_reads()))
    assert not invented, f"read endpoint(s) added during the port: {invented}"


@pytest.mark.parametrize("key", sorted(javascript_reads()))
def test_each_statement_matches_the_javascript_word_for_word(key: str):
    assert squashed(READS[key].sql) == squashed(javascript_reads()[key]), (
        f"{key} does not run the statement the JavaScript runs. The JavaScript is "
        "the specification until it is deleted; a difference here is either a "
        "typo or an improvement, and both must be made deliberately rather than "
        "during a port."
    )


def test_the_port_carried_all_twenty_five():
    assert len(READS) == 25, (
        f"{len(READS)} reads are registered; the JavaScript service has 25. If an "
        "endpoint has been added or removed on purpose, this count moves with it "
        "deliberately."
    )


# ── 2. Every read names the rule that decides who sees it ───────────────────


@pytest.mark.parametrize("key", sorted(READS))
def test_every_read_names_the_rule_that_decides_who_sees_it(key: str):
    """The note is a named deliverable, not a comment. It is the map from the
    endpoint to the database rule, and it is the answer to "why can this person
    see this?" without reading the whole schema."""
    rule = READS[key].rule
    assert rule and rule.strip(), f"{key} names no governing rule"
    assert "cw." in rule or "granted to" in rule, (
        f"{key} names its rule as {rule!r}, which points at nothing in the "
        "database. The note has to name the object or the grant that decides, or "
        "it is a reassurance rather than a map."
    )


# ── 3. Every statement runs against the real schema ─────────────────────────


def outcome(db: Database, caller: Caller, key: str):
    """Run a read and report which of the three things happened: rows came back,
    the database refused, or the statement itself is broken."""
    try:
        return "rows", run(db, caller, key)
    except psycopg.Error as error:
        code = getattr(error, "sqlstate", None)
        if code in BROKEN_STATEMENT:
            return "broken", error
        return "refused", error


@pytest.mark.parametrize("key", sorted(READS))
def test_every_read_runs_as_an_administrator(people, db: Database, key: str):
    """Not "returns rows" — an empty system returns nothing, correctly. What is
    checked is that the statement is one this schema can actually answer."""
    kind, detail = outcome(db, ADMINISTRATOR, key)
    assert kind != "broken", (
        f"{key} cannot run against the migrated schema: {detail}. This endpoint "
        "would fail for the first person who has data to see."
    )


@pytest.mark.parametrize("key", sorted(READS))
def test_every_read_runs_as_a_requester(people, db: Database, key: str):
    """The second pair of eyes. A requester is refused several of these, which is
    correct and is checked below — what must not happen is a broken statement
    hiding behind a role that never reaches it."""
    kind, detail = outcome(db, REQUESTER, key)
    assert kind != "broken", (
        f"{key} cannot run against the migrated schema as a requester: {detail}"
    )


# ── 4. A refusal is a refusal, and never an empty list ──────────────────────


def refused_for(db: Database, caller: Caller) -> dict[str, psycopg.Error]:
    """Every read this caller is refused."""
    out = {}
    for key in READS:
        kind, detail = outcome(db, caller, key)
        if kind == "refused":
            out[key] = detail
    return out


def test_a_requester_is_refused_at_least_one_read(people, db: Database):
    """A guard on the tests below. If a schema change ever granted a requester
    everything, the refusal checks would pass while checking nothing."""
    refused = refused_for(db, REQUESTER)
    assert refused, (
        "a requester was refused none of the 25 reads. Either the schema now "
        "grants them everything — which is a finding — or these tests are no "
        "longer reaching the database."
    )


def test_health_refuses_a_requester_by_name(people, db: Database):
    """One endpoint checked by name, so the property above cannot quietly become
    vacuous. /health is granted to administrator and auditor only."""
    kind, _ = outcome(db, REQUESTER, "GET /health")
    assert kind == "refused", (
        f"a requester got {kind} from GET /health, which is granted to "
        "administrator and auditor only"
    )


def test_a_refusal_never_arrives_as_an_empty_list(people, db: Database):
    """THE critical failure mode of this package. A refusal turned into `[]`
    renders as "nothing here" on a screen that should say "you may not see this",
    and the person believes the system rather than the sentence it swallowed."""
    for key in refused_for(db, REQUESTER):
        shaped = answer(db, REQUESTER, key)
        assert shaped.refused, (
            f"{key} refused a requester at the database and then answered "
            f"{shaped.body!r} — a refusal has been rendered as an ordinary result"
        )
        assert shaped.body.get("error") == "refused"
        assert shaped.body.get("reason", "").strip(), (
            f"{key} refused a requester with no words. A refusal nobody can read "
            "is indistinguishable from a broken screen."
        )


def test_a_permitted_read_and_a_refused_read_do_not_look_alike(people, db: Database):
    """The two outcomes side by side, which is how a screen meets them."""
    permitted = answer(db, ADMINISTRATOR, "GET /health")
    refused = answer(db, REQUESTER, "GET /health")

    assert permitted.status == 200 and "rows" in permitted.body
    assert refused.status == 403 and "rows" not in refused.body, (
        "the same endpoint answered a permitted caller and a refused one in "
        "shapes an interface could confuse"
    )


def test_an_empty_result_is_not_dressed_up_as_a_refusal(people, db: Database):
    """The mistake in the other direction, which is rarer and just as wrong. A
    freshly seeded system holds no deals; an Administrator asking must be told
    "none", not "you may not"."""
    shaped = answer(db, ADMINISTRATOR, "GET /deals")
    assert shaped.status == 200
    assert shaped.body["rows"] == [], (
        "this test assumes a system with no deals in it; if seeding changed, "
        "the assertion should move rather than be deleted"
    )


def test_an_unknown_read_is_not_reported_as_a_refusal(people, db: Database):
    """A route that does not exist and a role that may not pass are different
    problems for different people. Confusing them sends somebody to ask for
    permission they already have."""
    with pytest.raises(NoSuchRead):
        run(db, ADMINISTRATOR, "GET /no-such-thing")

    shaped = answer(db, ADMINISTRATOR, "GET /no-such-thing")
    assert shaped.status == 404
    assert shaped.body.get("error") != "refused"


# ── 5. No permission logic arrived in the Python ────────────────────────────


def executable_source(path: Path) -> str:
    """The file with its comments and docstrings removed.

    Necessary, not fussy: this module's own docstring says "there is not one
    `if role == ...` in this file", and a check that read the raw text would
    trip on the sentence explaining the ban.
    """
    kept = []
    with path.open("rb") as handle:
        for token in tokenize.tokenize(handle.readline):
            if token.type in (tokenize.COMMENT, tokenize.STRING):
                continue
            kept.append(token.string)
    return "\n".join(kept)


def test_no_permission_check_lives_in_the_reads():
    """WP-P2's other critical failure mode. There is not one `if (role === 'X')`
    in the JavaScript and there must not be one here. A check in this file is a
    second copy of the permission model, and the copy is the vulnerability — both
    keep working, they simply stop agreeing.

    If a check ever looks necessary, the database is missing a rule.
    """
    source = executable_source(Path(reads.__file__))

    compared = re.findall(r"\brole\b\s*(?:==|!=|<|>)", source)
    assert not compared, (
        f"the reads compare a role {len(compared)} time(s). The database decides "
        "who may read what; a comparison here is a second set of rules."
    )

    for role_name in ("viewer", "requester", "legal_reviewer", "legal_admin",
                      "auditor", "administrator"):
        assert role_name not in source, (
            f"the reads name the role {role_name!r} in executable code. Role names "
            "belong in the schema's policies and in db.py's role map — an endpoint "
            "that knows a role name is an endpoint about to decide something."
        )
