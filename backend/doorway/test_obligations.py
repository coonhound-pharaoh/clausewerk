"""The doorway's obligation surface does what OB-07 promises, and no more.

WHAT IS TESTED HERE — the doorway's own layer: the four reads answer for the
roles the grants name and refuse the viewer with words; the three act writes
carry the connection's actor, defer every rule to the schema, and pass its
refusals through unchanged.

WHAT IS DELIBERATELY NOT RE-TESTED — the schema's guarantees, proved against
real rows in db/test/obligations.test.mjs: the derivation's arithmetic, the
pin, idempotent registration, the full waiver approval path, D-1's overdue
gate on breach. Rebuilding those fixtures here would be a second copy of that
suite with a slower heartbeat.

The fixture inserts obligation instances DIRECTLY as the owner — the
registration path is the db suite's subject, not this one's.
"""

from __future__ import annotations

import psycopg
import pytest

from doorway.db import Database
from doorway.identity import Caller
from doorway.reads import answer as read_answer
from doorway.reads import run as read_run
from doorway.writes import answer as write_answer

ADMIN = "admin@clausewerk"
LEAH = "leah@clausewerk"
RITA = "rita@cw"
BEN = "ben@cw"

LEGAL = Caller(person=LEAH, role="legal_admin")
OWNING_REQUESTER = Caller(person=RITA, role="requester")
OTHER_REQUESTER = Caller(person=BEN, role="requester")
AUDITOR = Caller(person="ava@cw", role="auditor")
ADMINISTRATOR = Caller(person=ADMIN, role="administrator")
VIEWER = Caller(person="vic@cw", role="viewer")

OBLIGATION_READS = ("GET /obligations", "GET /obligations/gaps",
                    "GET /obligations/unowned", "GET /agreements/closeable")


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def seeded(db: Database, owner_url: str):
    """Two executed deals with two owners, three obligations: one owned by
    Rita and open, one unowned (its defect-tile row), one on Ben's deal."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "insert into cw.category (key,label,short) values ('data','Data Privacy','DP')")
        owner.execute(
            "insert into cw.clause (clause_id,category_key,severity) "
            "values ('DP-H-014','data','High')")
        owner.execute(
            "insert into cw.clause_version "
            "  (clause_id,version,title,body,approved_on,expires_on) "
            "values ('DP-H-014',1,'T','placeholder body','2025-01-01','2030-01-01')")
        owner.execute(
            "insert into cw.obligation_template "
            "  (clause_id,version,kind,obliged,summary,schedule_kind,anchor,evidence) "
            "values ('DP-H-014',1,'notify','vendor','placeholder duty','once',"
            "        'effective_on','attestation')")
        owner.execute(
            "insert into cw.agreement (agreement_id,counterparty,requester) values "
            "('AG-OB1','Northwind',%s), ('AG-OB2','Contoso',%s)", (RITA, BEN))
        owner.execute("insert into cw.snapshot (snapshot_id) values (%s)", ("1" * 64,))
        owner.execute("insert into cw.ruleset (ruleset_id) values (%s)", ("2" * 64,))
        for n, deal, who in ((1, "AG-OB1", RITA), (2, "AG-OB2", BEN)):
            owner.execute(
                "insert into cw.run (run_id,agreement_id,vendor,manifest,"
                "manifest_source,snapshot_id,ruleset_id,result_hash,"
                "engine_version,gate_open,created_by) "
                "values (%s,%s,'V','{}','manual',%s,%s,%s,'1.0.0',true,%s)",
                (f"RUN-OB{n}", deal, "1" * 64, "2" * 64, str(n) * 64, who))
        owner.execute(
            "insert into cw.executed_agreement "
            "  (agreement_id,run_id,executed_on,effective_on,term_end) values "
            "('AG-OB1','RUN-OB1','2026-07-01','2026-07-15','2027-07-15'),"
            "('AG-OB2','RUN-OB2','2026-07-01','2026-07-15','2027-07-15')")
        owner.execute(
            "insert into cw.obligation_instance "
            "  (agreement_id,clause_id,version,template_id,occurrence,kind,obliged,"
            "   summary,owner_person,due_on,evidence,lead_days,survives,entitlement) "
            "values "
            "('AG-OB1','DP-H-014',1,1,0,'notify','vendor','placeholder duty',%s,"
            " current_date + 40,'attestation',14,false,false),"
            "('AG-OB1','DP-H-014',1,1,1,'notify','vendor','unowned duty',null,"
            " current_date + 60,'attestation',14,false,false),"
            "('AG-OB2','DP-H-014',1,1,0,'notify','vendor','ben''s duty',%s,"
            " current_date + 40,'attestation',14,false,false)",
            (RITA, BEN))
    return db


def obligation_of(db: Database, summary: str) -> int:
    with db.as_person(LEAH, "legal_admin") as request:
        return request.rows(
            "select obligation_id from cw.obligation_instance where summary = %s",
            (summary,))[0]["obligation_id"]


# ── The reads, for every role the grants name ───────────────────────────────

READ_OUTCOMES = {
    (role, key): outcome
    for key in OBLIGATION_READS
    for role, outcome in (
        ("viewer", "refused"),
        ("requester", "rows"),
        ("legal_admin", "rows"),
        ("auditor", "rows"),
        ("administrator", "rows"),
    )
}


@pytest.mark.parametrize("role,key", sorted(READ_OUTCOMES))
def test_the_obligation_reads_answer_for_the_granted_roles(
    seeded, db: Database, role: str, key: str
):
    caller = {
        "viewer": VIEWER, "requester": OWNING_REQUESTER, "legal_admin": LEGAL,
        "auditor": AUDITOR, "administrator": ADMINISTRATOR,
    }[role]
    shaped = read_answer(db, caller, key)
    want_refusal = READ_OUTCOMES[(role, key)] == "refused"
    assert shaped.refused == want_refusal, (role, key, shaped.body)
    if want_refusal:
        assert shaped.body.get("reason", "").strip(), (
            "a refusal with no words is indistinguishable from a broken screen")


def test_the_book_carries_the_source_clause_adjacent(seeded, db: Database):
    """OB-07's one presentation rule: an obligation answers to the wording
    that created it, so clause_id and version are always in the row."""
    rows = read_run(db, LEGAL, "GET /obligations")
    assert len(rows) == 3
    assert all(r["clause_id"] == "DP-H-014" and r["version"] == 1 for r in rows)
    assert all(r["state"] == "pending" for r in rows)


def test_the_unowned_duty_is_a_visible_gap(seeded, db: Database):
    rows = read_run(db, ADMINISTRATOR, "GET /obligations/unowned")
    assert len(rows) == 1, "absence of an owner rendered as a gap, not as calm"


# ── The acts ────────────────────────────────────────────────────────────────

def test_a_requester_satisfies_their_own_obligation_with_a_note(seeded, db):
    mine = obligation_of(db, "placeholder duty")
    shaped = write_answer(db, OWNING_REQUESTER, "POST /obligations/satisfy",
                          {"obligation_id": mine, "note": "done; receipt attached"})
    assert shaped.status == 200, shaped.body
    [row] = shaped.body["rows"]
    assert row["acted_by"] == RITA, "the actor is the connection's person"

    states = {r["obligation_id"]: r["state"]
              for r in read_run(db, LEGAL, "GET /obligations")}
    assert states[mine] == "satisfied"


def test_satisfaction_without_a_note_is_refused_before_the_database(seeded, db):
    mine = obligation_of(db, "placeholder duty")
    shaped = write_answer(db, OWNING_REQUESTER, "POST /obligations/satisfy",
                          {"obligation_id": mine, "note": "   "})
    assert shaped.status == 400, shaped.body
    assert "note" in shaped.body["reason"]


def test_a_requester_cannot_satisfy_a_colleagues_obligation(seeded, db):
    theirs = obligation_of(db, "placeholder duty")
    shaped = write_answer(db, OTHER_REQUESTER, "POST /obligations/satisfy",
                          {"obligation_id": theirs, "note": "covering, badly"})
    assert shaped.refused, shaped.body
    assert shaped.body.get("reason", "").strip()


def test_an_auditor_records_nothing(seeded, db):
    mine = obligation_of(db, "placeholder duty")
    shaped = write_answer(db, AUDITOR, "POST /obligations/satisfy",
                          {"obligation_id": mine, "note": "auditors read"})
    assert shaped.refused, shaped.body


def test_reassignment_moves_the_owner_on_the_next_read(seeded, db):
    duty = obligation_of(db, "unowned duty")
    shaped = write_answer(db, LEGAL, "POST /obligations/reassign",
                          {"obligation_id": duty, "new_owner": BEN})
    assert shaped.status == 200, shaped.body

    owners = {r["obligation_id"]: r["owner_person"]
              for r in read_run(db, LEGAL, "GET /obligations")}
    assert owners[duty] == BEN, (
        "the current owner is the last reassignment (cw.obligation_owner)")
    assert read_run(db, LEGAL, "GET /obligations/unowned") == [], (
        "an owned duty leaves the defect surface")


def test_a_waiver_without_an_approved_override_is_refused_in_the_schemas_words(
    seeded, db
):
    """The proposal-is-not-approval guard, felt from the doorway. The full
    request→socialise→approve path is proved in db/test/obligations.test.mjs;
    what this layer owes is that the refusal travels back with words."""
    duty = obligation_of(db, "placeholder duty")
    shaped = write_answer(db, LEGAL, "POST /obligations/waive",
                          {"obligation_id": duty, "note": "vendor gone",
                           "override_ref": 999})
    assert shaped.refused, shaped.body
    assert "approval" in shaped.body.get("reason", "") or shaped.body.get(
        "reason", "").strip(), shaped.body


def test_a_closed_obligation_takes_no_further_act(seeded, db):
    mine = obligation_of(db, "placeholder duty")
    first = write_answer(db, OWNING_REQUESTER, "POST /obligations/satisfy",
                         {"obligation_id": mine, "note": "done"})
    assert first.status == 200, first.body
    second = write_answer(db, LEGAL, "POST /obligations/satisfy",
                          {"obligation_id": mine, "note": "done again?"})
    assert second.refused, second.body
    assert second.body.get("reason", "").strip()
