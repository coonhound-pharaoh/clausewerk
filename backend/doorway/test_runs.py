"""The engine assembling a contract, through the doorway, storing nothing.

WHAT IS BEING PROVED

  · the refusal boundary — who is refused, and WHERE they are refused, before
    any engine answer exists to leak
  · the engine's own sentences, unchanged, and identical to the sentence the
    pre-flight gives for the same body
  · the request shape, fixed here so persistence cannot change it later
  · that NOTHING lands in cw.run

WHY IT MATTERS THAT NOTHING LANDS

Persistence is the next package. Proving the refusals now, with no rows to hide
behind, is what makes the persistence package about persistence — rather than
about a permission model discovered while debugging an insert.

ON THE LIBRARY BELOW: it is synthetic, and deliberately so. Whether these are
the right categories, the right wording or the right rules is a judgement about
the library, and this suite makes none. It builds a library that EXERCISES the
machinery, which is a different thing.
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path

import pytest

from doorway import runs
from doorway.db import Database
from doorway.seed_demo import seed
from doorway.server import serve

SCREENS = Path(__file__).resolve().parents[2] / "prototype" / "v4"

ADMIN = "a.okafor@clausewerk"
LEGAL_ADMIN = "r.vance@clausewerk"
REVIEWER = "p.nkemi@clausewerk"
DANA = "d.buyer@clausewerk"
TUNDE = "t.imani@clausewerk"
SAM = "s.reed@clausewerk"

DEAL = "AG-0001"


def test_content_addressed_pin_mismatch_is_refused():
    snapshot = {
        "snapshot": [{"snapshot_id": "hash", "taken_on": "2026-07-31"}],
        "snapshot_member": [{"snapshot_id": "hash", "clause_id": "C-1",
                             "version": 1, "selectable": True}],
        "snapshot_ladder_rung": [],
    }
    ruleset = {
        "ruleset": [{"ruleset_id": "rules"}],
        "ruleset_member": [],
    }

    class PoisonedPin:
        def rows(self, statement, _params):
            table = statement.split("from cw.", 1)[1].split(" ", 1)[0]
            rows = {**snapshot, **ruleset}[table]
            if table == "snapshot_member":
                return [{**rows[0], "selectable": False}]
            return rows

    with pytest.raises(runs.SharedContentMismatch, match="snapshot_member"):
        runs._verify_shared_content(PoisonedPin(), snapshot, ruleset)


class Client:
    def __init__(self, base: str):
        self.base = base
        self.token: str | None = None

    def call(self, method: str, path: str, body=None):
        request = urllib.request.Request(
            self.base + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"content-type": "application/json",
                     **({"authorization": f"Bearer {self.token}"} if self.token else {})})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read() or b"null")
        except urllib.error.HTTPError as refused:
            return refused.code, json.loads(refused.read() or b"null")

    def sign_in(self, person: str):
        status, body = self.call("POST", "/api/sign-in", {"person": person})
        assert status == 200, f"{person} could not sign in: {body}"
        self.token = body["token"]
        return self


@pytest.fixture
def running(schema: str, owner_url: str):
    """A seeded system with a category vocabulary and no clauses at all."""
    seed(owner_url=owner_url, app_url=schema)
    server = serve(schema, port=0, static=str(SCREENS))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    legal = Client(base).sign_in(LEGAL_ADMIN)
    for key, label, short in (("data", "Data Privacy", "DP"),
                              ("liab", "Liability", "LB")):
        status, body = legal.call("POST", "/api/categories",
                                  {"key": key, "label": label, "short": short})
        assert status == 200, body

    # A real deal, opened by the requester as themselves. Since the run-scoping
    # migration a requester may only record a run against a deal they own, so a
    # made-up agreement id no longer stands in for one.
    status, body = Client(base).sign_in(DANA).call(
        "POST", "/api/deals", {"agreement_id": DEAL, "counterparty": "Northwind"})
    assert status == 200, body
    try:
        yield base
    finally:
        server.shutdown()
        server.server_close()
        server.database.close()
        thread.join(timeout=5)


@contextmanager
def as_person(url: str, person: str, role: str):
    """One unit of work, as somebody, on a connection of its own."""
    db = Database(url)
    try:
        with db.as_person(person, role) as request:
            yield request
    finally:
        db.close()


@pytest.fixture
def library(running, schema):
    """A synthetic catalogue, built by the Legal admin as themselves.

    It lives HERE and not in seed_demo.py: that file's stated promise is that it
    creates no deals, no tickets and no clauses, and a fixture that quietly
    makes the seeded system look busy would break the one honest first
    impression the product has.

    The Legal admin holds insert on the ladder tables (0003) and on
    cw.conflict_rule and cw.clause_tag (0004), so every row below is written by
    somebody who may write it — never by the owner, who bypasses everything.
    """
    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        for clause_id, category_key in (("DP-A-001", "data"), ("LB-A-001", "liab")):
            request.write(
                "insert into cw.clause (clause_id, category_key, severity) "
                "values (%s, %s, 'Standard')", (clause_id, category_key))
            request.write(
                "insert into cw.clause_version "
                "  (clause_id, version, title, body, approved_on, expires_on) "
                "values (%s, 1, %s, %s, current_date - 30, current_date + 365)",
                (clause_id, f"{clause_id} title", f"{clause_id} body text"))

        # The tag the High rule below asks about. Tags are how a conflict rule
        # sees a contract at all — it never reads the wording.
        request.write(
            "insert into cw.clause_tag (clause_id, version, tag, tagged_by) "
            "values ('DP-A-001', 1, 'data_transfer', %s)", (LEGAL_ADMIN,))

        for category_key, clause_id in (("data", "DP-A-001"), ("liab", "LB-A-001")):
            row = request.one(
                "insert into cw.ladder (category_key, severity, owner) "
                "values (%s, 'Standard', %s) returning ladder_id",
                (category_key, LEGAL_ADMIN))
            request.write(
                "insert into cw.ladder_rung "
                "  (ladder_id, rung, clause_id, version, is_floor) "
                "values (%s, 0, %s, 1, true)", (row[0], clause_id))

        # Two rules. One fires on this contract and blocks it; the other asks
        # about a tag nothing carries and stays silent — so "two consulted" and
        # "one fired" are visibly different numbers.
        request.write(
            "insert into cw.conflict_rule "
            "  (rule_id, version, name, severity, title, detail, predicate, "
            "   approved_by) "
            "values ('CR-001', 1, 'transfer_needs_review', 'High', "
            "        'Cross-border transfer', 'A transfer clause was selected.', "
            "        %s::jsonb, %s)",
            (json.dumps({"all_present": ["data_transfer"]}), LEGAL_ADMIN))
        request.write(
            "insert into cw.conflict_rule "
            "  (rule_id, version, name, severity, title, detail, predicate, "
            "   approved_by) "
            "values ('CR-002', 1, 'never_fires', 'Standard', "
            "        'Quiet rule', 'Asks about a tag nothing carries.', "
            "        %s::jsonb, %s)",
            (json.dumps({"all_present": ["no_clause_carries_this"]}), LEGAL_ADMIN))
    return running


def manifest(*categories: str, **overrides) -> dict:
    body = {
        "agreement_id": DEAL,
        "vendor": "Northwind",
        "value": "250000",
        "source": "llm",
        "risks": [{"category": category, "severity": "Standard",
                   "justification": "assembled from the vendor's paper"}
                  for category in categories],
    }
    body.update(overrides)
    return body


def chain(base: str, event: str) -> list[dict]:
    _, body = Client(base).sign_in(ADMIN).call("GET", "/api/record")
    return [row for row in body["rows"] if row["event_type"] == event]


# ── Who is refused, and where ───────────────────────────────────────────────


def test_a_viewer_is_refused_by_the_database_before_the_engine_answers(library):
    """The attempt row is the FIRST statement in the transaction, so the audit
    grant decides who may use this endpoint — uniformly, and in the database's
    own words. A viewer cannot write to the chain, so a viewer is stopped there.

    The proof that it happened FIRST is what is missing from the answer: no
    decisions, no snapshot id, no findings. Move the audit write below the
    engine call and this test sees an engine answer inside a refusal.
    """
    status, body = Client(library).sign_in(SAM).call(
        "POST", "/api/runs", manifest("Data Privacy"))

    assert status in (403, 409), f"a viewer got {status}: {body}"
    assert body["error"] == "refused"
    assert body["reason"].strip(), "the refusal carries no sentence"
    for leaked in ("decisions", "snapshot_id", "findings", "result_hash"):
        assert leaked not in body, (
            f"the refusal carried {leaked} — the engine answered before the "
            f"database was asked whether this person may ask")


def test_an_administrator_is_refused_at_the_rule_catalogue(library):
    """And NOT at the audit chain, which this role may write to, and NOT at the
    clause library, which this role now reads.

    CORRECTED AGAINST THE SCHEMA. The obvious answer — 'the administrator
    cannot see the library' — was true until owner decision U11:
    0022_owner_decisions_u9_u11.sql:24-31 grants cw_administrator select on
    cw.clause_version_state and on cw.ladder_health, closing the gap
    0018:170-190 had recorded and refused to close on its own authority.

    What U11 did NOT relax is cw.active_conflict_rule, still granted at
    0004_conflict_rules.sql:237-238 to five roles and not to this one. So the
    loader gets clauses, gets ladders, and is refused the rules — which is
    still before the engine is consulted, so no engine sentence exists to leak.

    Whoever grants the administrator the rule catalogue has to change this test
    on purpose, and should read WP-002's note before doing so.
    """
    status, body = Client(library).sign_in(ADMIN).call(
        "POST", "/api/runs", manifest("Data Privacy"))

    assert status == 403, f"an administrator got {status}: {body}"
    assert body["kind"] == "not_permitted"
    assert body["reason"].strip()
    for leaked in ("decisions", "snapshot_id", "findings", "result_hash"):
        assert leaked not in body, (
            f"the refusal carried {leaked}: the engine was consulted for a "
            f"caller who may not read the library it read")


def test_a_requester_and_legal_can_both_assemble(library):
    """The control. If everything were refused, every test above would pass
    while the endpoint did no work at all."""
    for person in (DANA, REVIEWER, LEGAL_ADMIN):
        status, body = Client(library).sign_in(person).call(
            "POST", "/api/runs", manifest("Data Privacy"))
        assert status == 200, f"{person} was refused: {body}"


# ── The request shape, fixed here ───────────────────────────────────────────


def test_a_run_without_an_agreement_is_a_400_naming_the_field(library):
    """Required from this package onwards, though nothing is stored yet, so
    that the request contract is set by the package that introduces the route.

    This checks PRESENCE. Whose deal it is, is a rule for the database."""
    dana = Client(library).sign_in(DANA)

    for wrong in (None, "", "   ", 7):
        body = manifest("Data Privacy")
        if wrong is None:
            body.pop("agreement_id")
        else:
            body["agreement_id"] = wrong
        status, answered = dana.call("POST", "/api/runs", body)
        assert status == 400, f"{wrong!r} answered {status}: {answered}"
        assert "agreement_id" in answered["reason"]
        assert answered["kind"] == "rejected"

    status, answered = dana.call("POST", "/api/runs", manifest("Data Privacy"))
    assert status == 200, (
        f"the same body with agreement_id supplied was refused: {answered}")


def test_a_manifest_source_outside_the_three_is_a_400_naming_the_field(library):
    """A 400, not a late 409. The database's check constraint would refuse it
    as an IntegrityError, which reads as 'refused on its merits' — telling
    somebody their contract was rejected when they mistyped a field."""
    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy", source="guesswork"))

    assert status == 400, body
    assert body["kind"] == "rejected"
    assert "manifest_source" in body["reason"]


def test_the_preflight_still_accepts_an_unusual_source(library):
    """The temptation is to tighten manifest_from instead, which would silently
    change POST /manifests/check — a pre-flight over anything a model emits."""
    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/manifests/check", manifest("Data Privacy", source="guesswork"))

    assert status == 200, f"the pre-flight was tightened: {body}"
    assert body["source"] == "guesswork"


def test_a_body_that_is_not_a_manifest_is_the_caller_s_mistake(library):
    dana = Client(library).sign_in(DANA)
    for wrong in ({"agreement_id": DEAL},
                  {"agreement_id": DEAL, "vendor": "Northwind"},
                  {"agreement_id": DEAL, "vendor": "N", "risks": [{"severity": "High"}]}):
        status, body = dana.call("POST", "/api/runs", wrong)
        assert status == 400, f"{wrong} answered {status} {body}"
        assert body["kind"] == "rejected"


# ── The engine's own sentences ──────────────────────────────────────────────


def test_a_dropped_category_refuses_with_the_engine_s_own_sentence(library):
    """Character for character the sentence the pre-flight gives for the same
    body. Two endpoints refusing the same manifest with two different sentences
    would send the same person to two different conclusions."""
    dana = Client(library).sign_in(DANA)
    body = manifest("Data Privacy", "Quantum Indemnity")

    status, run = dana.call("POST", "/api/runs", body)
    _, preflight = dana.call("POST", "/api/manifests/check", body)

    assert status == 409, run
    assert run["kind"] == "unknown_category"
    assert run["dropped"] == ["Quantum Indemnity"]
    assert run["reason"] == preflight["reason"], (
        f"the enforcement says {run['reason']!r}; the pre-flight says "
        f"{preflight['reason']!r}")


def test_an_empty_library_reports_a_coverage_gap_and_invents_nothing(running):
    """A 200 report, NOT a refusal, and the distinction is the point.

    An empty library is not a caller error and not a permission problem. The
    engine builds a snapshot from no clauses quite happily and reports, for
    every risk, that it has nothing to offer — in its own words. Refusing here
    would hide a library gap behind something that reads like a system fault.
    """
    status, body = Client(running).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy", "Liability"))

    assert status == 200, f"an empty library was treated as a failure: {body}"
    assert body["unresolved"] == 2
    assert body["rules_consulted"] == 0
    for decision in body["decisions"]:
        assert decision["clause_id"] is None, "a clause was invented"
        assert decision["body"] is None
        assert decision["reason"] == "No clause available in Ledger"


def test_zero_rules_reads_as_zero(running):
    """A run against no rules is not a clean run, it is an unchecked one, and
    the screen must be able to tell them apart."""
    _, body = Client(running).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy"))
    assert body["rules_consulted"] == 0
    assert body["gate_open"] is True, (
        "no rules fired because there were none, which is not the same as "
        "passing — but the gate is honestly open")


def test_seeded_rules_are_counted_and_can_fire(library):
    """Two consulted, one fired, and the High one closes the gate."""
    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy", "Liability"))

    assert status == 200, body
    assert body["rules_consulted"] == 2
    fired = [f for f in body["findings"]]
    assert len(fired) == 1, f"expected one rule to fire, got {fired}"
    assert fired[0]["severity"] == "High"
    assert fired[0]["rule_version"] == "CR-001@v1"
    assert body["gate_open"] is False, "a High finding did not close the gate"
    assert body["unresolved"] == 0
    assert body["snapshot_id"] and body["ruleset_id"] and body["result_hash"]


# ── The record ──────────────────────────────────────────────────────────────


def test_a_run_is_recorded_whole(library, schema):
    """Snapshot, rule set, run, decisions and findings — all of it, one act."""
    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy", "Liability"))
    assert status == 200, body
    assert body["recorded"] is True
    run_id = body["run_id"]
    assert run_id

    with as_person(schema, TUNDE, "auditor") as request:
        run = request.rows("select * from cw.run where run_id = %s", (run_id,))
        assert len(run) == 1, "the answer named a run that is not there"
        assert run[0]["agreement_id"] == DEAL
        assert run[0]["created_by"] == DANA
        assert run[0]["snapshot_id"] == body["snapshot_id"]
        assert run[0]["result_hash"] == body["result_hash"]
        assert run[0]["gate_open"] is False

        decisions = request.one(
            "select count(*) from cw.run_decision where run_id = %s", (run_id,))[0]
        findings = request.one(
            "select count(*) from cw.run_finding where run_id = %s", (run_id,))[0]
        assert decisions == len(body["decisions"])
        assert findings == len(body["findings"]) == 1


def test_the_recorded_run_names_the_engine_that_produced_the_hash(library, schema):
    """A stored hash that no longer reproduces is indistinguishable from a
    tampered one unless the record says which engine wrote it. The column is
    NOT NULL with no default, deliberately, so nothing can guess."""
    from engine.model import ENGINE_VERSION

    _, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy"))
    with as_person(schema, TUNDE, "auditor") as request:
        stored = request.one(
            "select engine_version from cw.run where run_id = %s",
            (body["run_id"],))[0]
    assert stored == ENGINE_VERSION


def test_exactly_one_run_recorded_event_exists_and_it_is_the_trigger_s(library):
    """cw.audit_run() emits run_recorded on insert. An endpoint copy would put
    two entries per act into a chain with no UPDATE and no DELETE grant, free
    to disagree with each other forever."""
    _, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy"))

    recorded = chain(library, "run_recorded")
    assert len(recorded) == 1, f"expected one run_recorded event, got {len(recorded)}"
    assert recorded[0]["subject"] == body["run_id"]
    assert recorded[0]["actor"] == DANA


def test_two_runs_against_an_unchanged_library_share_one_snapshot(library, schema):
    """Content-addressed ids repeat by design. A naive second insert produces a
    unique violation, which reads as 'your contract was refused on its merits'
    — a refusal that is not a refusal."""
    dana = Client(library).sign_in(DANA)
    first = dana.call("POST", "/api/runs", manifest("Data Privacy"))
    second = dana.call("POST", "/api/runs", manifest("Data Privacy"))

    assert first[0] == 200 and second[0] == 200, (first, second)
    assert first[1]["snapshot_id"] == second[1]["snapshot_id"]
    assert first[1]["run_id"] != second[1]["run_id"]

    with as_person(schema, TUNDE, "auditor") as request:
        assert request.one("select count(*) from cw.snapshot")[0] == 1
        assert request.one("select count(*) from cw.ruleset")[0] == 1
        assert request.one("select count(*) from cw.run")[0] == 2


def test_the_member_tables_repeat_without_colliding(library, schema):
    """The half the obvious fix does not reach, and the reason there is one
    rule on five tables rather than one rule on two.

    Handling the repeat on the two PARENT tables alone moves the collision one
    table along: the second run's snapshot row becomes a no-op, and its very
    next statement writes a snapshot_member row the first run already wrote.
    Same unique violation, same false 'refused on its merits', one table over —
    which is exactly where nobody looks.
    """
    dana = Client(library).sign_in(DANA)
    assert dana.call("POST", "/api/runs", manifest("Data Privacy", "Liability"))[0] == 200

    with as_person(schema, TUNDE, "auditor") as request:
        before = {t: request.one(f"select count(*) from cw.{t}")[0]
                  for t in ("snapshot_member", "snapshot_ladder_rung",
                            "ruleset_member")}
    assert all(count > 0 for count in before.values()), (
        f"the fixture wrote no member rows at all, so this proves nothing: {before}")

    status, body = dana.call("POST", "/api/runs", manifest("Data Privacy", "Liability"))
    assert status == 200, f"the second run was refused: {body}"
    assert body.get("kind") != "refused_on_merits"

    with as_person(schema, TUNDE, "auditor") as request:
        after = {t: request.one(f"select count(*) from cw.{t}")[0] for t in before}
    assert after == before, (
        f"the member tables grew on a repeat: {before} became {after}")


def test_a_failure_part_way_through_leaves_no_half_written_run(library, schema,
                                                              monkeypatch):
    """The run tables have no DELETE grant, so a half-written run could never
    be tidied up. One transaction, or the record grows something nobody can
    remove."""
    import psycopg

    from doorway import runs as runs_module

    real_insert = runs_module._insert

    def fail_on_findings(request, table, rows, **kwargs):
        if table == "run_finding":
            raise psycopg.errors.UniqueViolation("simulated failure mid-run")
        return real_insert(request, table, rows, **kwargs)

    monkeypatch.setattr(runs_module, "_insert", fail_on_findings)

    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy"))
    assert status == 409, body

    monkeypatch.undo()
    with as_person(schema, TUNDE, "auditor") as request:
        assert request.one("select count(*) from cw.run")[0] == 0, (
            "a run survived a failure part way through recording it")
        assert request.one("select count(*) from cw.run_decision")[0] == 0


def test_a_snapshot_that_cannot_be_stored_refuses_with_the_engine_s_sentence(
    library, schema, monkeypatch
):
    """A ladder hashed into the snapshot's fingerprint with no row to be stored
    in. It cannot arrive from the registry — LADDER_SQL inner-joins the rungs —
    so the sentence is taken from the engine itself and the wiring is what is
    proved: a ValueError becomes a 409, never a 500 with a stack trace.
    """
    from engine.manifest import CategoryMap
    from engine.model import Ladder
    from engine.run import snapshot_rows
    from engine.snapshot import Snapshot

    rungless = Snapshot.build(
        clauses=[],
        ladders=[Ladder(category="Data Privacy", severity="Standard",
                        rungs=(), floor_rung=-1)])
    engine_says = None
    try:
        snapshot_rows(rungless,
                      CategoryMap.from_rows([{"key": "data", "label": "Data Privacy"}]))
    except ValueError as would_not_rebuild:
        engine_says = str(would_not_rebuild)
    assert engine_says, "the engine no longer refuses a ladder it cannot store"

    from doorway import runs as runs_module

    def refuse(*_args, **_kwargs):
        raise ValueError(engine_says)

    monkeypatch.setattr(runs_module.engine_run, "snapshot_rows", refuse)

    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy"))
    assert status == 409, f"a snapshot that would not rebuild answered {status}: {body}"
    assert body["reason"] == engine_says
    assert body["kind"] == "refused_on_merits"

    monkeypatch.undo()
    with as_person(schema, TUNDE, "auditor") as request:
        assert request.one("select count(*) from cw.run")[0] == 0


# ── Whose deal it is, decided by the database ───────────────────────────────


def test_a_requester_cannot_record_a_run_against_another_requesters_deal(
    library, schema
):
    """The rule the run-scoping migration added, through the endpoint. Before
    it, any requester could record a run against any deal in the system —
    permanently, into a table with no DELETE grant."""
    # A deal belonging to somebody else. Opened by the Legal admin, so its
    # requester is Rae and not Dana — cw.owns_agreement resolves to
    # `requester = cw.app_actor()`, which is the whole rule being tested.
    status, body = Client(library).sign_in(LEGAL_ADMIN).call(
        "POST", "/api/deals", {"agreement_id": "AG-0002",
                               "counterparty": "Southwind"})
    assert status == 200, body

    status, body = Client(library).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy", agreement_id="AG-0002"))
    assert status in (403, 409), f"a run landed on somebody else's deal: {body}"
    assert body["error"] == "refused"

    with as_person(schema, TUNDE, "auditor") as request:
        assert request.one(
            "select count(*) from cw.run where agreement_id = 'AG-0002'")[0] == 0


def test_legal_may_record_against_a_deal_they_do_not_own(library):
    """The other direction, and it must be tested or the rule reads as 'nobody
    may'. Legal never appears in cw.agreement.requester, so a single-condition
    rule would have locked them out of every deal in the system."""
    for person in (REVIEWER, LEGAL_ADMIN):
        status, body = Client(library).sign_in(person).call(
            "POST", "/api/runs", manifest("Data Privacy"))
        assert status == 200, f"{person} could not record on Dana's deal: {body}"
        assert body["recorded"] is True


def test_every_call_is_recorded_whether_it_succeeded_or_not(library):
    """What crossed the boundary and what the engine made of it is exactly what
    an auditor would want and could not reconstruct from refusals alone."""
    dana = Client(library).sign_in(DANA)
    dana.call("POST", "/api/runs", manifest("Data Privacy"))
    dana.call("POST", "/api/runs", manifest("Data Privacy", "Quantum Indemnity"))

    attempted = chain(library, "run_attempted")
    refused = chain(library, "run_refused")

    assert len(attempted) == 2, (
        f"both calls should have been attempted on the record, got {len(attempted)}")
    assert len(refused) == 1, "the dropped category left no refusal on the record"
    for row in attempted + refused:
        assert row["actor"] == DANA, (
            f"recorded against {row['actor']}; {DANA} made the call")
        assert row["subject"] == DEAL

    payload = attempted[0]["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    assert payload["checked_by"] == "engine.resolution.resolve"
    assert payload["agreement_id"] == DEAL
    assert payload["source"] == "llm"


def test_no_session_reaches_the_engine_at_all(library):
    status, body = Client(library).call("POST", "/api/runs", manifest("Data Privacy"))
    assert status == 401
    assert body["error"] == "no session"
