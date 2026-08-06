"""The ported reads answer the way the JavaScript answered.

THE THREE THINGS THESE TESTS ARE HERE TO CATCH

  1. A statement nobody can answer. A typo in a column name does not look like
     a bug — it looks like an endpoint nobody has clicked yet. Every statement is
     run against the real schema as two different roles, and a broken one fails
     outright. While the JavaScript service existed these were also compared
     against it character for character; that half went with it in WP-P5.

  2. A refusal softened into an empty list. "Nothing is waiting on you" and "You
     may not see this" are opposite sentences. Every read is run as a role that
     may not use it, and the outcome must be a refusal with words in it.

  3. A permission check that appeared in the Python. There is not one in the
     JavaScript. If a check ever seems necessary here, the database is missing a
     rule and the fix belongs there.

The JavaScript service was retired in WP-P5 and the comparison half of this file
went with it, as its own docstring said it would. What remains is the half that
does not depend on a second implementation existing.
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

# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def people(db: Database, owner_url: str):
    """Two roles with genuinely different sight: an Administrator who runs the
    machine, and a requester who sees their own work and little else.

    Two, not one, because a suite that checks every endpoint as the most
    privileged role proves only that the endpoints parse.
    """
    with psycopg.connect(owner_url, autocommit=True) as owner:
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


def test_the_read_count_moves_only_on_purpose():
    """Twenty-five came across from the JavaScript service. Four were added
    afterwards for read models built while this workstream was paused — the
    reading room (0017) and the library and ladder boards (0018). Three more
    for assembly runs: GET /runs, GET /runs/decisions and GET /runs/findings.

    Asserted so the number moves deliberately. An endpoint appearing without
    anybody noticing is how a surface grows past what was reviewed.
    """
    assert len(READS) == 69, (
        f"{len(READS)} reads are registered; 25 ported, 4 added for the reading "
        "room and the library boards, 3 for assembly runs, 1 for the metrics "
        "board that shows the measurement beside the AI estimate (NC-25), "
        "3 for notifications (OB-08/09): the waiting-on-you panel, the outbox, "
        "and the unreachable-person gap, 8 for reporting and routing "
        "(RP-01…RP-04): five report views, the policy-shift worklist, the "
        "vendor friction scorecard, and the ticket route, 4 for the "
        "negotiation record (NC-08): rounds, current positions, revivals and "
        "the renewal drift report, 3 for the edit-quality cuts (NC-13): "
        "library-wide, by category, per contract, 4 for obligations "
        "(OB-07): the book, the coverage gaps, the unowned-defect surface, "
        "and close eligibility, 2 for the portfolio's certain half "
        "(NC-16): positions and unresolved, 2 for round analysis and "
        "risk estimates (NC-17/NC-26), 2 more for the negotiate screens "
        "(2026-08-05): the negotiation header list, without which a screen "
        "could show what was happening inside a negotiation it could not "
        "list, and the position movements behind each current rung, and 3 "
        "for the governed Legal-admin "
        "acts (D-5, NC-21/22/23): the rule catalogue, the records "
        "delegations, and the disposal review queue, and 1 for the envelope "
        "strip (OB-15), 2 for the intake question set's coverage (IN-2, "
        "0063) — the per-question gaps and the one-line summary — and 2 for "
        "the notice record (NT-2, 0064): what was raised, and the route "
        "table that says who may raise what to whom. If that changed "
        "deliberately, move this number with it."
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


def test_run_history_reads_share_one_bounded_recent_run_window():
    summary = READS["GET /runs"].sql.lower()
    decisions = READS["GET /runs/decisions"].sql.lower()
    findings = READS["GET /runs/findings"].sql.lower()

    assert "order by created_at desc, run_id desc limit 500" in summary
    for children in (decisions, findings):
        assert "select run_id from cw.run" in children
        assert "order by created_at desc, run_id desc limit 500" in children


@pytest.mark.parametrize("key", sorted(READS))
def test_no_read_is_a_write_in_disguise(key: str):
    """A GET that changes something turns a link into an action, and a browser
    prefetching links would then perform it. Carried over from the JavaScript
    suite (`db/test/endpoints.test.mjs`), which is where this check was written."""
    assert key.startswith("GET "), f"{key} is registered as a read but is not a GET"

    mutating = re.findall(
        r"\b(insert|update|delete|truncate|create|drop|alter|grant|revoke)\b",
        READS[key].sql, flags=re.IGNORECASE)
    assert not mutating, (
        f"{key} is served as a read but its statement contains {mutating}"
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


# ── The run reads, for every one of the six roles ───────────────────────────
#
# SIX, and the count is the schema's own: 0013_administrator.sql:57-59 comments
# cw as 'Six application roles'. The sweeps above use two — an administrator and
# a requester — which is enough to catch a broken statement and not enough to
# describe who may see a run. These three endpoints get all six by name.
#
# WHAT IS NOT TESTED HERE, and where it is. Whether a requester sees only THEIR
# runs is a property of the view's own WHERE clause, and it is proved against
# real rows in db/test/run-store.test.mjs ('four roles are scoped by the view,
# and see exactly their own runs'). Rebuilding a full run — library, snapshot,
# ruleset, decisions, findings — inside this suite would be a second fixture
# for one assertion that already has a home.

RUN_READS = ("GET /runs", "GET /runs/decisions", "GET /runs/findings")

# Written out by hand, one row per pair, with the reason. NOT generated: the
# administrator's three outcomes are not uniform, and a generator would have to
# be told that anyway — in code, where it would read as a rule rather than as a
# fact about the schema.
RUN_READ_OUTCOMES = {
    # A viewer holds no grant on either run view, and none on cw.run_finding
    # (0005_run_store.sql:288-297 names the requester, both Legal roles and the
    # auditor, and nobody else). Refused, in the database's own words.
    ("viewer", "GET /runs"): "refused",
    ("viewer", "GET /runs/decisions"): "refused",
    ("viewer", "GET /runs/findings"): "refused",

    ("requester", "GET /runs"): "rows",
    ("requester", "GET /runs/decisions"): "rows",
    ("requester", "GET /runs/findings"): "rows",

    ("legal_reviewer", "GET /runs"): "rows",
    ("legal_reviewer", "GET /runs/decisions"): "rows",
    ("legal_reviewer", "GET /runs/findings"): "rows",

    ("legal_admin", "GET /runs"): "rows",
    ("legal_admin", "GET /runs/decisions"): "rows",
    ("legal_admin", "GET /runs/findings"): "rows",

    ("auditor", "GET /runs"): "rows",
    ("auditor", "GET /runs/decisions"): "rows",
    ("auditor", "GET /runs/findings"): "rows",

    # CHANGED ON PURPOSE, 2026-07-27, by owner decision (migration 0026).
    #
    # These two read "refused" until today, and the contradiction was written up
    # as docs/open-questions.md §11: the administrator could read every FINDING
    # on every assembly (0013:296 grants the base tables, 0013:321 gives the read
    # policy) and neither SUMMARY, because the two views predate the role and
    # 0005:293-297 named the roles that existed at the time.
    #
    # The owner's answer: "seeing an alarm you can't investigate is worse than
    # either alternative." 0026 grants both views AND admits the role to their
    # scoping clauses — the grant alone would have answered zero rows, which is
    # the misleading-empty-list failure §9 already records for legal holds.
    ("administrator", "GET /runs"): "rows",
    ("administrator", "GET /runs/decisions"): "rows",
    ("administrator", "GET /runs/findings"): "rows",
}


@pytest.fixture
def six(db: Database, schema: str, owner_url: str):
    """All six signed-in people, seeded as the demo does it — including the
    countersign the Legal grants genuinely need."""
    from doorway.seed_demo import PEOPLE, seed

    seed(owner_url=owner_url, app_url=schema)
    return {role: Caller(person=person, role=role)
            for person, _display, _unit, role in PEOPLE}


@pytest.mark.parametrize("role,key", sorted(RUN_READ_OUTCOMES))
def test_the_run_reads_answer_for_every_signed_in_role(six, db: Database,
                                                       role: str, key: str):
    kind, detail = outcome(db, six[role], key)
    want = RUN_READ_OUTCOMES[(role, key)]

    assert kind != "broken", f"{key} cannot run as {role}: {detail}"
    assert kind == want, (
        f"{role} was expected to be {want} on {key} and was {kind} instead: "
        f"{detail}. If that is a deliberate schema change, move this table with "
        f"it — every entry in it names the grant it rests on.")


def test_a_viewer_is_refused_the_run_reads_and_never_gets_an_empty_list(
    six, db: Database
):
    """The failure this whole module exists to prevent, on the newest three.
    "No runs are waiting on you" and "you may not see runs" are opposite
    sentences to the person reading them."""
    for key in RUN_READS:
        shaped = answer(db, six["viewer"], key)
        assert shaped.refused, (
            f"{key} refused a viewer at the database and then answered "
            f"{shaped.body!r}")
        assert shaped.body.get("reason", "").strip()


def test_an_administrator_reads_all_three_and_never_an_empty_list(six, db: Database):
    """Owner decision, migration 0026 — and the half that is easy to get wrong.

    Granting the two views WITHOUT admitting the role to their scoping clauses
    would leave every call succeeding and answering nothing. That is not a
    smaller refusal, it is a different sentence: the screen would tell the one
    person who can see every finding in the company that no contract has ever
    been assembled.

    docs/open-questions.md §9 records the identical shape on legal holds, where
    an inert grant made row-level security filter instead of refuse and an
    administrator was shown "No holds are open" while a hold was open. So this
    asserts the ROWS, not merely the absence of a refusal.
    """
    for key in RUN_READS:
        shaped = answer(db, six["administrator"], key)
        assert not shaped.refused, (
            f"{key} refused an administrator; 0026 grants it. {shaped.body}")
        assert "rows" in shaped.body

    # Non-vacuity: with no runs recorded, every one of these is honestly empty
    # and the test above cannot tell "scoped in" from "filtered out". Record one
    # and prove the administrator can see it.
    legal = six["legal_admin"]
    with db.as_person(legal.person, legal.role) as request:
        request.write(
            "insert into cw.agreement (agreement_id, counterparty, requester) "
            "values ('AG-ADMIN', 'Contoso', %s)", (legal.person,))
        request.write(
            "insert into cw.snapshot (snapshot_id) values (%s)", ("a" * 64,))
        request.write(
            "insert into cw.ruleset (ruleset_id) values (%s)", ("c" * 64,))
        request.write(
            """insert into cw.run (run_id, agreement_id, vendor, manifest,
                                   manifest_source, snapshot_id, ruleset_id,
                                   result_hash, engine_version, gate_open,
                                   created_by)
               values ('RUN-ADMIN', 'AG-ADMIN', 'Contoso', '{}', 'llm', %s, %s,
                       %s, 'clausewerk-engine/3', true, %s)""",
            ("a" * 64, "c" * 64, "d" * 64, legal.person))

    seen = run(db, six["administrator"], "GET /runs")
    assert [r["run_id"] for r in seen] == ["RUN-ADMIN"], (
        "the administrator holds the grant and was answered an empty list — "
        "the scoping clause does not admit the role, which is the misleading "
        "empty state docs/open-questions.md §9 describes")


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


# ── The negotiation reads, for every one of the six roles (NC-08) ───────────
#
# The same shape as the run reads above, for the same reason: the sweeps catch
# a broken statement, and only a role-by-role table describes who may see a
# negotiation. Whether a requester sees only THEIR deals' rows is the views'
# own WHERE clause (0027) and the tables' read policies (0011), proved against
# real rows in db/test/negotiation.test.mjs — not rebuilt here.

NEGOTIATION_READS = ("GET /negotiations", "GET /negotiations/rounds",
                     "GET /negotiations/positions", "GET /negotiations/movements",
                     "GET /negotiations/revivals", "GET /negotiations/drift")

NEGOTIATION_READ_OUTCOMES = {
    # A viewer holds no negotiation grant of any kind — 0011 records the
    # absence as deliberate, matching cw.concession. Refused, with words.
    ("viewer", "GET /negotiations"): "refused",
    ("viewer", "GET /negotiations/rounds"): "refused",
    ("viewer", "GET /negotiations/positions"): "refused",
    ("viewer", "GET /negotiations/movements"): "refused",
    ("viewer", "GET /negotiations/revivals"): "refused",
    ("viewer", "GET /negotiations/drift"): "refused",

    ("requester", "GET /negotiations"): "rows",
    ("requester", "GET /negotiations/movements"): "rows",
    ("requester", "GET /negotiations/rounds"): "rows",
    ("requester", "GET /negotiations/positions"): "rows",
    ("requester", "GET /negotiations/revivals"): "rows",
    ("requester", "GET /negotiations/drift"): "rows",

    ("legal_reviewer", "GET /negotiations"): "rows",
    ("legal_reviewer", "GET /negotiations/movements"): "rows",
    ("legal_reviewer", "GET /negotiations/rounds"): "rows",
    ("legal_reviewer", "GET /negotiations/positions"): "rows",
    ("legal_reviewer", "GET /negotiations/revivals"): "rows",
    ("legal_reviewer", "GET /negotiations/drift"): "rows",

    ("legal_admin", "GET /negotiations"): "rows",
    ("legal_admin", "GET /negotiations/movements"): "rows",
    ("legal_admin", "GET /negotiations/rounds"): "rows",
    ("legal_admin", "GET /negotiations/positions"): "rows",
    ("legal_admin", "GET /negotiations/revivals"): "rows",
    ("legal_admin", "GET /negotiations/drift"): "rows",

    ("auditor", "GET /negotiations"): "rows",
    ("auditor", "GET /negotiations/movements"): "rows",
    ("auditor", "GET /negotiations/rounds"): "rows",
    ("auditor", "GET /negotiations/positions"): "rows",
    ("auditor", "GET /negotiations/revivals"): "rows",
    ("auditor", "GET /negotiations/drift"): "rows",

    # The administrator holds no grant on the three views, and 0027 records
    # leaving that boundary to the owner ON PURPOSE — the same non-decision
    # 0025 made on the run views, later settled by the owner as 0026. If the
    # owner settles this one the same way, these three entries move with the
    # migration that does it.
    ("administrator", "GET /negotiations/positions"): "refused",
    ("administrator", "GET /negotiations/revivals"): "refused",
    ("administrator", "GET /negotiations/drift"): "refused",

    # The two reads added for the negotiate screens (2026-08-05) sat on TABLES
    # rather than on the three views, so they inherited the silent-zero shape
    # rather than the views' honest refusal. Asserting "refused" here failed
    # for half a day — the grant was real — and 0065 then removed it. Both
    # answers were right in turn, which is why this is a table and not a guess.
    ("administrator", "GET /negotiations"): "refused",
    ("administrator", "GET /negotiations/movements"): "refused",

    # SETTLED 2026-08-05 (migration 0065). This said "rows" — meaning ZERO
    # rows, always — because 0013:324 granted the table, no policy admitted the
    # role, and the database filtered instead of refusing. The owner settled it
    # the way U13 settled the identical shape on legal holds: revoke the inert
    # grant, so the answer is at least honest.
    ("administrator", "GET /negotiations/rounds"): "refused",
}


@pytest.mark.parametrize("role,key", sorted(NEGOTIATION_READ_OUTCOMES))
def test_the_negotiation_reads_answer_for_every_signed_in_role(
    six, db: Database, role: str, key: str
):
    kind, detail = outcome(db, six[role], key)
    want = NEGOTIATION_READ_OUTCOMES[(role, key)]

    assert kind != "broken", f"{key} cannot run as {role}: {detail}"
    assert kind == want, (
        f"{role} was expected to be {want} on {key} and was {kind} instead: "
        f"{detail}. If that is a deliberate schema change, move this table with "
        f"it — every entry in it names the grant it rests on.")


def test_the_negotiation_reads_take_no_parameters_and_add_no_scoping():
    """The scoping lives in the views' own WHERE clauses (0027) and the rounds
    table's read policy (0011). A parameter here is a caller choosing what it
    may see, and a WHERE here is a second copy of the permission model — the
    two anti-patterns this file's other sections already name. The absence is
    the control, so it is asserted rather than assumed."""
    for key in NEGOTIATION_READS:
        statement = READS[key].sql
        assert "%s" not in statement and "%(" not in statement, (
            f"{key} takes a parameter. What a caller may see is not something "
            "a request gets to ask for.")
        assert "where" not in statement.lower(), (
            f"{key} carries its own WHERE clause; the view or the table's own "
            "policy does the scoping")


def test_a_viewer_is_refused_the_negotiation_reads_and_never_an_empty_list(
    six, db: Database
):
    """The module's critical failure mode, on the four newest reads. "No
    positions are moving" and "you may not see the negotiation record" are
    opposite sentences to the person reading them."""
    for key in NEGOTIATION_READS:
        shaped = answer(db, six["viewer"], key)
        assert shaped.refused, (
            f"{key} refused a viewer at the database and then answered "
            f"{shaped.body!r}")
        assert shaped.body.get("reason", "").strip()


def test_the_administrator_is_refused_the_negotiation_record(six, db: Database):
    """SETTLED 2026-08-05 — this test used to assert the opposite.

    cw_administrator held 0013's grant on the negotiation tables and no policy
    admitted the role, so row-level security FILTERED instead of refusing: the
    one person who runs the machine was told a negotiation had no rounds while
    a round was on record. NC-08 reported that gap and left it open, correctly
    — widening a role's read is an owner decision, never a read package's.

    The owner settled it on 2026-08-05, the same way U13 settled the identical
    shape on legal holds (0024): revoke the inert grant rather than widen the
    policy, so the answer is at least honest. Migration 0065.

    The fixture below still creates a real negotiation with a real round, and
    that is the point — the refusal has to be a refusal WHILE THERE IS
    SOMETHING TO SEE, or it proves nothing.
    """
    legal = six["legal_admin"]
    with db.as_person(legal.person, legal.role) as request:
        request.write(
            "insert into cw.agreement (agreement_id, counterparty, requester) "
            "values ('AG-NEG-ADMIN', 'Fabrikam', %s)", (legal.person,))
        request.write(
            "insert into cw.negotiation (agreement_id, paper, opened_by, "
            "baseline_chosen_by) values ('AG-NEG-ADMIN', 'ours', %s, %s)",
            (legal.person, legal.person))
        request.write(
            """insert into cw.negotiation_round (negotiation_id, round_no,
                 direction, document_sha256, storage_uri, sent_on, actor)
               select negotiation_id, 1, 'received', %s, 'memory://r1',
                      current_date, %s
               from cw.negotiation where agreement_id = 'AG-NEG-ADMIN'""",
            ("e" * 64, legal.person))

    # Non-vacuity: it is genuinely visible to a role the policy admits.
    seen_by_legal = run(db, legal, "GET /negotiations/rounds")
    assert any(r["storage_uri"] == "memory://r1" for r in seen_by_legal), (
        "the fixture round never landed; the assertions below would pass "
        "vacuously")
    assert any(n["agreement_id"] == "AG-NEG-ADMIN"
               for n in run(db, legal, "GET /negotiations")), (
        "the fixture negotiation never landed")

    # And the administrator is told so, in words, on all three.
    for key in ("GET /negotiations", "GET /negotiations/rounds",
                "GET /negotiations/movements"):
        shaped = answer(db, six["administrator"], key)
        assert shaped.refused, (
            f"{key} answered an administrator {shaped.body!r} instead of "
            "refusing. Either 0065's revoke was undone or a policy now admits "
            "the role — either way an owner decision landed, and this test "
            "moves with the migration that made it.")
        assert shaped.body.get("reason", "").strip(), (
            f"{key} refused an administrator with no words, which is the one "
            "thing worse than the empty list this replaced")


# ── 5. A view does not inherit the rules underneath it ──────────────────────
#
# These two were written on 2026-07-26 as strict-xfail: cw.override_status had no
# scoping of its own and ran with its owner's rights, so it handed every override
# request to anybody granted select on it — a requester saw other requesters', and
# a viewer told about nothing saw all of them, justification text included.
#
# The xfail was strict deliberately, so it would FAIL the moment the leak closed
# rather than sit passing forever. It failed within the hour:
# 0019_override_views_scoped.sql put the scoping in the view's own WHERE clause,
# in the same words as the read_scoped policy. They are ordinary tests now, and
# they stay — a guarantee that was once broken is the one worth watching.


@pytest.fixture
def two_requesters_and_a_viewer(people, db: Database, owner_url: str):
    """Two requesters with an override request each, and a viewer told about
    neither. The smallest arrangement in which "sees their own" means anything."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute(
            "insert into cw.account (person,display_name,unit,role,created_by) "
            "values ('ben@clausewerk','Ben Buyer','Procurement','requester','admin@clausewerk'),"
            "       ('sam@clausewerk','Sam Supplier','Supplier','viewer','admin@clausewerk')")
        owner.execute(
            "insert into cw.role_grant (action,person,role,acted_by,reason) "
            "values ('granted','ben@clausewerk','requester','admin@clausewerk','x'),"
            "       ('granted','sam@clausewerk','viewer','admin@clausewerk','x')")
        owner.execute("insert into cw.category (key,label,short) values ('data','Data Privacy','DP')")
        owner.execute("insert into cw.agreement (agreement_id,counterparty,requester) "
                      "values ('AG-1','Northwind','rita@clausewerk')")
        owner.execute("insert into cw.snapshot (snapshot_id) values (%s)", ("1" * 64,))
        owner.execute("insert into cw.ruleset (ruleset_id) values (%s)", ("2" * 64,))
        for n, who in ((1, "rita@clausewerk"), (2, "ben@clausewerk")):
            owner.execute(
                "insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,"
                "snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by) "
                "values (%s,'AG-1','Northwind','{}','manual',%s,%s,%s,'1.0.0',false,%s)",
                (f"RUN-{n}", "1" * 64, "2" * 64, str(n) * 64, who))
            owner.execute(
                "insert into cw.override_request (run_id,agreement_id,requested_by,justification) "
                "values (%s,'AG-1',%s,'a justification long enough to clear the floor')",
                (f"RUN-{n}", who))
    return db


def test_a_requester_sees_only_their_own_overrides(two_requesters_and_a_viewer, db):
    """GET /overrides claims "a requester sees their own". This is that claim."""
    rows = run(db, REQUESTER, "GET /overrides")
    others = [r["requested_by"] for r in rows if r["requested_by"] != REQUESTER.person]
    assert not others, (
        f"GET /overrides handed a requester {len(others)} other people's override "
        f"request(s): {others}. The endpoint's own note says they see their own."
    )


def test_a_viewer_sees_only_the_overrides_they_were_told_about(
    two_requesters_and_a_viewer, db
):
    viewer = Caller(person="sam@clausewerk", role="viewer")
    rows = run(db, viewer, "GET /overrides")
    assert rows == [], (
        f"GET /overrides handed a viewer who was notified about nothing "
        f"{len(rows)} override request(s), justification text included"
    )


# ── The four added after the port ───────────────────────────────────────────


def test_the_reading_room_takes_no_parameters(people, db: Database):
    """The scoping is "this share, this person", and it comes from the connection.

    An `agreement_id` parameter is precisely how a viewer's render ends up
    fetched through something broader than the one share they were given —
    WP-U14's critical anti-pattern. The absence is the control, so it is asserted
    rather than assumed.
    """
    for key in ("GET /reading-room", "GET /reading-room/clauses"):
        statement = READS[key].sql
        assert "%s" not in statement and "%(" not in statement, (
            f"{key} takes a parameter. What a viewer may see is not something a "
            "request gets to ask for.")
        assert "where" not in statement.lower(), (
            f"{key} carries its own WHERE clause; the view does the scoping")


def test_there_is_no_export_endpoint_on_the_viewer_s_surface():
    """ADR-0008 gave the viewer no export, deliberately: the reading room shows a
    contract to somebody outside the deal, and letting them take a copy away is a
    different act nobody has decided.

    Checked here as well as in the schema's own suite, because this is the layer
    where a convenience would be added."""
    suspicious = [key for key in READS
                  if any(word in key.lower()
                         for word in ("export", "download", "csv", "pdf", "print"))]
    assert not suspicious, (
        f"an export-shaped read endpoint exists: {suspicious}. If a screen needs "
        "one, that is a decision for the owner rather than an endpoint.")


def test_the_empty_ladder_row_is_not_filtered_away(people, db: Database):
    """A ladder with no rungs appears as ONE row with a null rung and
    ladder_status 'empty'. That row is the whole point of the view: an inner join
    would drop exactly the broken ladders, and the screen would report a
    configuration fault as a healthy short list.

    So the endpoint adds no WHERE and no ordering of its own — the view's
    `nulls last` is what keeps the empty ladder visible where somebody will see
    it.
    """
    statement = READS["GET /ladders"].sql.lower()
    assert "where" not in statement, (
        f"GET /ladders filters rows: {statement!r}. A null rung is a finding, not "
        "untidiness.")
    assert "order by" not in statement, (
        "GET /ladders re-sorts. cw.ladder_board orders itself with `nulls last` "
        "so the empty ladder lands where it is noticed; a second ordering here "
        "can undo that.")


# ── 6. No permission logic arrived in the Python ────────────────────────────


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
