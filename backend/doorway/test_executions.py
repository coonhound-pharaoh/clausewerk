"""Filing an executed agreement, through the doorway, with its three gates.

WHAT IS BEING PROVED

  · who may file is decided by the DATABASE, not by this endpoint
  · a run recorded against a different deal cannot be filed against this one
  · a run carrying a clause the library would no longer select is refused —
    AND ONLY such a run: a run-off predecessor still in force executes fine,
    which is the direction that tells a real gate from one that refuses
    everything
  · a blocked run is refused unless every blocking finding is covered by an
    approved override — and IS filed when they all are
  · every gate runs before the insert that freezes the record
  · the reading room returns rows for the first time

NOTHING FILED HERE CAN BE UNFILED. Every table this endpoint writes to carries
freeze triggers. That is safe only because each test rebuilds the schema from
the migrations; it is not safe anywhere else.
"""

from __future__ import annotations

import json

import pytest

from doorway import executions
from doorway.test_runs import (  # noqa: F401 — `library` and `running` are fixtures
    ADMIN, DANA, DEAL, LEGAL_ADMIN, REVIEWER, SAM, TUNDE, Client, as_person,
    library, manifest, running,
)

SHA = "b" * 64


def filing(run_id: str, **overrides) -> dict:
    body = {
        "agreement_id": DEAL,
        "run_id": run_id,
        "executed_on": "2026-07-27",
        "effective_on": "2026-08-01",
        "filename": "northwind-msa.docx",
        "byte_size": 24000,
        "sha256": SHA,
        # A DEVELOPMENT REFERENCE, and obviously one. The column is NOT NULL and
        # no document store exists yet, so the caller supplies this and the
        # system writes it down verbatim rather than inventing a location that
        # would look real to every later reader.
        "storage_uri": "placeholder://not-a-store/northwind-msa.docx",
        "signed_on": "2026-07-27",
        "signatories": [
            {"name": "Rae Vance", "party": "ours", "method": "electronic",
             "signed_on": "2026-07-27", "title": "General Counsel"},
            {"name": "N. Wind", "party": "theirs", "method": "electronic",
             "signed_on": "2026-07-27"},
        ],
    }
    body.update(overrides)
    return body


def a_clean_run(base: str, *, agreement_id: str = DEAL, person: str = DANA) -> str:
    """A run whose gate is open: 'Liability' alone carries no tagged clause, so
    no conflict rule fires."""
    status, body = Client(base).sign_in(person).call(
        "POST", "/api/runs", manifest("Liability", agreement_id=agreement_id))
    assert status == 200, body
    assert body["gate_open"] is True, "the fixture's clean run is not clean"
    return body["run_id"]


def a_blocked_run(base: str) -> dict:
    """A run the engine blocks: 'Data Privacy' selects the tagged clause, which
    fires the High rule."""
    status, body = Client(base).sign_in(DANA).call(
        "POST", "/api/runs", manifest("Data Privacy", "Liability"))
    assert status == 200, body
    assert body["gate_open"] is False, "the fixture's blocked run is not blocked"
    return body


def chain(base: str, event: str) -> list[dict]:
    _, body = Client(base).sign_in(ADMIN).call("GET", "/api/record")
    return [row for row in body["rows"] if row["event_type"] == event]


def count(schema: str, table: str) -> int:
    with as_person(schema, TUNDE, "auditor") as request:
        return request.one(f"select count(*) from {table}")[0]


# ── Who may file is the database's answer ───────────────────────────────────


@pytest.mark.parametrize("person", [DANA, SAM, TUNDE])
def test_a_role_that_may_not_file_is_refused_by_the_database(library, schema, person):
    """A requester, a viewer and an auditor. None of them is named anywhere in
    executions.py — the 0006 grants and policies decide, and their words come
    back unchanged."""
    run_id = a_clean_run(library)
    status, body = Client(library).sign_in(person).call(
        "POST", "/api/agreements/execute", filing(run_id))

    assert status in (403, 409), f"{person} filed an execution: {body}"
    assert body["error"] == "refused"
    assert body["reason"].strip()
    assert count(schema, "cw.executed_agreement") == 0


@pytest.mark.parametrize("person", [REVIEWER, LEGAL_ADMIN])
def test_legal_can_file(library, schema, person):
    """The control. Without it every refusal test above would pass while the
    endpoint filed nothing for anybody."""
    run_id = a_clean_run(library)
    status, body = Client(library).sign_in(person).call(
        "POST", "/api/agreements/execute", filing(run_id))

    assert status == 200, f"{person} could not file: {body}"
    assert body["filed"] is True
    assert count(schema, "cw.executed_agreement") == 1
    assert count(schema, "cw.executed_signatory") == 2


def test_the_insert_set_matches_what_the_hand_written_row_inserted(library, schema):
    run_id = a_clean_run(library)
    assert Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))[0] == 200

    with as_person(schema, TUNDE, "auditor") as request:
        document = request.rows(
            "select doc_seq, kind, filename, byte_size, sha256, storage_uri "
            "from cw.executed_document where agreement_id = %s", (DEAL,))
    assert len(document) == 1
    assert document[0]["doc_seq"] == 0
    assert document[0]["kind"] == "agreement", (
        "the schema requires exactly one document to BE the agreement, at seq 0")
    assert document[0]["sha256"] == SHA


def test_a_certificate_in_the_body_is_refused_with_the_reason(library):
    """Not silently ignored. Somebody who sends one and hears nothing believes
    it was filed."""
    run_id = a_clean_run(library)
    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute",
        filing(run_id, certificate="ZmFrZS1jZXJ0"))

    assert status == 400, body
    assert body["kind"] == "rejected"
    assert "certificate" in body["reason"]


def test_a_filing_that_names_nobody_is_refused(library):
    run_id = a_clean_run(library)
    reviewer = Client(library).sign_in(REVIEWER)
    for wrong in ([], None, [{"name": "X"}]):
        status, body = reviewer.call("POST", "/api/agreements/execute",
                                     filing(run_id, signatories=wrong))
        assert status == 400, f"{wrong!r} answered {status}: {body}"
        assert body["kind"] == "rejected"


def test_signatory_row_fan_out_is_bounded_before_database_work():
    one = filing("RUN-BOUNDARY")["signatories"][0]
    body = filing(
        "RUN-BOUNDARY",
        signatories=[one] * (executions.MAX_SIGNATORIES + 1))

    answered = executions.execute(None, None, body)

    assert answered.status == 400


@pytest.mark.parametrize(("field", "wrong"), [
    ("name", {"nested": "name"}),
    ("party", ["ours"]),
    ("method", True),
    ("title", {"nested": "title"}),
])
def test_structured_signatory_fields_are_boundary_errors(field, wrong):
    signatory = {**filing("RUN-BOUNDARY")["signatories"][0], field: wrong}

    answered = executions.execute(
        None, None, filing("RUN-BOUNDARY", signatories=[signatory]))

    assert answered.status == 400


@pytest.mark.parametrize(("field", "wrong"), [
    ("filename", {"nested": "name"}),
    ("byte_size", True),
    ("storage_uri", ["not", "a", "uri"]),
    ("signature_evidence", {"nested": "envelope"}),
])
def test_structured_execution_fields_are_boundary_errors(field, wrong):
    answered = executions.execute(
        None, None, filing("RUN-BOUNDARY", **{field: wrong}))

    assert answered.status == 400


@pytest.mark.parametrize(("field", "wrong"), [
    ("executed_on", 20260731),
    ("filename", 42),
    ("byte_size", "24000"),
    ("term_end", 20270801),
])
def test_wrong_execution_scalar_types_are_boundary_errors(field, wrong):
    answered = executions.execute(
        None, None, filing("RUN-BOUNDARY", **{field: wrong}))

    assert answered.status == 400


# ── Gate 1 · the deal binding ───────────────────────────────────────────────


def test_a_run_recorded_against_another_deal_cannot_be_filed_here(library, schema):
    """cw.executed_agreement.run_id is a plain foreign key with nothing tying it
    to the agreement being filed, and Legal may record a run against any deal.
    Without this gate, Legal could file one deal citing another's assembly —
    permanently, with the audit trigger calling it legitimate."""
    status, body = Client(library).sign_in(LEGAL_ADMIN).call(
        "POST", "/api/deals", {"agreement_id": "AG-0007",
                               "counterparty": "Elsewhere"})
    assert status == 200, body
    other_run = a_clean_run(library, agreement_id="AG-0007", person=LEGAL_ADMIN)

    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(other_run))

    assert status == 409, body
    assert "AG-0007" in body["reason"] and DEAL in body["reason"], (
        f"the refusal must name both deals; it said {body['reason']!r}")
    assert count(schema, "cw.executed_agreement") == 0


def test_a_run_with_no_deal_cannot_be_filed(library, schema):
    """The fixture inserts the run directly as a legal_reviewer, because since
    the run-scoping migration that is the ONLY way a run with no deal can come
    into existence: POST /runs has required an agreement since the endpoint was
    introduced, and the migration's requester branch demands ownership."""
    run_id = a_clean_run(library)
    with as_person(schema, REVIEWER, "legal_reviewer") as request:
        source = request.rows(
            "select snapshot_id, ruleset_id, result_hash, engine_version, manifest "
            "from cw.run where run_id = %s", (run_id,))[0]
        request.write(
            """insert into cw.run (run_id, agreement_id, vendor, manifest,
                                   manifest_source, snapshot_id, ruleset_id,
                                   result_hash, engine_version, gate_open,
                                   created_by)
               values ('RUN-ORPHAN', null, 'Northwind', %(manifest)s,
                       'llm', %(snapshot_id)s, %(ruleset_id)s, %(result_hash)s,
                       %(engine_version)s, true, %(who)s)""",
            {**source, "manifest": json.dumps(source["manifest"]), "who": REVIEWER})

    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing("RUN-ORPHAN"))

    assert status == 409, body
    assert "not tied to a deal" in body["reason"]
    assert count(schema, "cw.executed_agreement") == 0


# ── Gate 2 · currency ───────────────────────────────────────────────────────


def test_a_run_carrying_a_retired_clause_is_refused_naming_the_clause(library, schema):
    run_id = a_clean_run(library)
    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write(
            "update cw.clause_version set retired = true, "
            "retired_reason = 'withdrawn after review' "
            "where clause_id = 'LB-A-001' and version = 1")

    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))

    assert status == 409, body
    assert "LB-A-001@v1" in body["reason"]
    assert "retired" in body["reason"]
    assert count(schema, "cw.executed_agreement") == 0


def test_a_hard_supersession_is_refused_naming_the_clause(library, schema):
    """`retire_now`: the predecessor stops being usable the moment the
    replacement lands."""
    run_id = a_clean_run(library)
    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write(
            "insert into cw.clause_version (clause_id, version, title, body) "
            "values ('LB-A-001', 2, 'replacement', 'replacement body')")
        request.write(
            """insert into cw.supersession
                 (clause_id, predecessor_version, successor_version,
                  predecessor_disposition, reason, approver)
               values ('LB-A-001', 1, 2, 'retire_now',
                       'replaced outright', %s)""", (LEGAL_ADMIN,))

    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))

    assert status == 409, body
    assert "LB-A-001@v1" in body["reason"]
    assert count(schema, "cw.executed_agreement") == 0


def test_a_run_off_supersession_does_not_refuse_execution(library, schema):
    """THE MANDATORY OTHER DIRECTION. Without it this gate is indistinguishable
    from one that refuses every superseded clause.

    A run-off predecessor is SUPERSEDED and still SELECTABLE — the schema says
    so in its own words, beside the expression: a run-off predecessor is
    superseded but still usable until it expires on its own. The library would
    still choose it, so refusing to execute a contract that pinned it would be
    a false refusal on the one act that cannot be undone.

    A later author 'tightening' the predicate from selectable to state makes
    this test go red, which is the entire point of it.
    """
    run_id = a_clean_run(library)
    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write(
            "insert into cw.clause_version (clause_id, version, title, body) "
            "values ('LB-A-001', 2, 'newer wording', 'newer body')")
        request.write(
            """insert into cw.supersession
                 (clause_id, predecessor_version, successor_version,
                  predecessor_disposition, reason, approver)
               values ('LB-A-001', 1, 2, 'run_off',
                       'existing contracts run off on their own dates', %s)""",
            (LEGAL_ADMIN,))

        state = request.rows(
            "select state, selectable from cw.clause_version_state "
            "where clause_id = 'LB-A-001' and version = 1")[0]
    assert state["state"] == "superseded" and state["selectable"] is True, (
        f"the fixture did not produce a run-off predecessor: {state}")

    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))

    assert status == 200, (
        f"a run-off predecessor was refused at signature, which the library "
        f"itself would still select: {body}")
    assert count(schema, "cw.executed_agreement") == 1


# ── Gate 3 · validation ─────────────────────────────────────────────────────


def open_and_approve(base: str, schema: str, run: dict, *, approve: list[str]):
    """Raise an override on a blocked run and approve the named findings.

    The review window is set to nothing first, by the Administrator, because
    deciding inside the window is refused by the database and the point of that
    rule is not under test here.
    """
    with as_person(schema, ADMIN, "administrator") as request:
        request.write(
            "update cw.governance_setting set value = '0h' "
            "where key = 'override_review_window'")

    findings = [{"finding_ref": f"{f['rule_version']}",
                 "severity": f["severity"], "summary": f["title"]}
                for f in run["findings"] if f["severity"] == "High"]

    with as_person(schema, DANA, "requester") as request:
        request_id = request.one(
            "select cw.open_override_request(%s, %s, %s::jsonb)",
            (run["run_id"], "the counterparty will not move on this",
             json.dumps(findings)))[0]

    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write("select cw.socialise_override_request(%s)", (request_id,))

    with as_person(schema, REVIEWER, "legal_reviewer") as request:
        for ref in approve:
            request.write(
                "select cw.decide_override_finding(%s, %s, 'approved', %s)",
                (request_id, ref, "accepted with the deal's owner"))
    return request_id


def test_a_closed_gate_with_no_override_is_refused(library, schema):
    run = a_blocked_run(library)
    status, body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run["run_id"]))

    assert status == 409, body
    assert "CR-001@v1" in body["reason"], body["reason"]
    assert count(schema, "cw.executed_agreement") == 0


def test_a_closed_gate_with_every_blocking_finding_approved_is_admitted_and_filed(
    library, schema
):
    """THE POSITIVE DIRECTION, without which the gate is a dead end and the
    whole override workflow terminates in nothing.

    The last assertion is the one that matters most: cw.run.overridden is still
    false. That column is written once and can never change, so a gate written
    against it would keep every engine-blocked run unfileable no matter what
    Legal approved. The gate reads the override tables, and this proves it.
    """
    run = a_blocked_run(library)
    open_and_approve(library, schema, run, approve=["CR-001@v1"])

    status, body = Client(library).sign_in(LEGAL_ADMIN).call(
        "POST", "/api/agreements/execute", filing(run["run_id"]))

    assert status == 200, f"an approved override did not admit the run: {body}"
    assert count(schema, "cw.executed_agreement") == 1

    with as_person(schema, TUNDE, "auditor") as request:
        overridden = request.one(
            "select overridden from cw.run where run_id = %s", (run["run_id"],))[0]
    assert overridden is False, (
        "cw.run.overridden moved, which the schema makes impossible — the gate "
        "must be reading the override tables, not this column")


def test_a_partially_approved_override_is_still_refused(library, schema):
    """Two blocking findings, one approved. The refusal names the other."""
    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write(
            "insert into cw.clause_tag (clause_id, version, tag, tagged_by) "
            "values ('LB-A-001', 1, 'uncapped_liability', %s)", (LEGAL_ADMIN,))
        request.write(
            "insert into cw.conflict_rule "
            "  (rule_id, version, name, severity, title, detail, predicate, "
            "   approved_by) "
            "values ('CR-003', 1, 'uncapped', 'High', 'Uncapped liability', "
            "        'A liability clause with no cap was selected.', %s::jsonb, %s)",
            (json.dumps({"all_present": ["uncapped_liability"]}), LEGAL_ADMIN))

    run = a_blocked_run(library)
    blocking = [f["rule_version"] for f in run["findings"] if f["severity"] == "High"]
    assert len(blocking) == 2, f"the fixture produced {blocking}"

    open_and_approve(library, schema, run, approve=[blocking[0]])

    status, body = Client(library).sign_in(LEGAL_ADMIN).call(
        "POST", "/api/agreements/execute", filing(run["run_id"]))

    assert status == 409, body
    assert blocking[1] in body["reason"], body["reason"]
    assert count(schema, "cw.executed_agreement") == 0


# ── The gates all run before the record is frozen ───────────────────────────


def test_every_refusal_leaves_the_agreement_untouched(library, schema):
    """Inserting the executed agreement moves the deal to 'executed' by trigger.
    A gate evaluated after that insert would pass vacuously forever, and nothing
    would ever show it."""
    run = a_blocked_run(library)
    status, _body = Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run["run_id"]))
    assert status == 409

    with as_person(schema, TUNDE, "auditor") as request:
        status_now = request.one(
            "select status from cw.agreement where agreement_id = %s", (DEAL,))[0]
    assert status_now != "executed", "a refused filing moved the deal anyway"
    assert count(schema, "cw.executed_agreement") == 0


def test_the_status_moves_by_the_trigger_and_never_by_the_endpoint(library, schema):
    from pathlib import Path

    source = Path(__file__).with_name("executions.py").read_text(encoding="utf-8")
    assert "update cw.agreement" not in source, (
        "the endpoint moves the deal's status itself. cw.agreement_execute() "
        "owns that, and cw.agreement has no update policy for any role")

    run_id = a_clean_run(library)
    assert Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))[0] == 200

    with as_person(schema, TUNDE, "auditor") as request:
        assert request.one(
            "select status from cw.agreement where agreement_id = %s",
            (DEAL,))[0] == "executed"


def test_the_endpoint_writes_only_its_own_two_events(library):
    run_id = a_clean_run(library)
    assert Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))[0] == 200

    executed = chain(library, "agreement_executed")
    assert len(executed) == 1, (
        f"expected exactly one agreement_executed event, got {len(executed)} — "
        "the endpoint is writing a copy of the trigger's")
    assert chain(library, "execution_attempted"), "the attempt left no trace"
    assert chain(library, "document_frozen"), "the trigger did not record the freeze"


# ── What it all unlocks ─────────────────────────────────────────────────────


def test_the_reading_room_returns_rows_for_the_first_time(library, schema):
    """The real precondition, not a shortcut: an executed agreement whose
    run_id is set — because the reading room joins on it — PLUS a live share
    for a viewer. The run is made by POST /runs; nothing here fakes one.
    """
    run_id = a_clean_run(library)
    assert Client(library).sign_in(REVIEWER).call(
        "POST", "/api/agreements/execute", filing(run_id))[0] == 200

    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write(
            """insert into cw.agreement_share
                 (agreement_id, shared_with, shared_by, purpose)
               values (%s, %s, %s, 'the counterparty is reviewing what they signed')""",
            (DEAL, SAM, LEGAL_ADMIN))

    sam = Client(library).sign_in(SAM)
    status, room = sam.call("GET", "/api/reading-room")
    assert status == 200, room
    assert room["rows"], "the share is live and the reading room is still empty"

    status, clauses = sam.call("GET", "/api/reading-room/clauses")
    assert status == 200, clauses
    assert clauses["rows"], (
        "the reading room shows the agreement and none of its wording — the "
        "join to the run found nothing")
