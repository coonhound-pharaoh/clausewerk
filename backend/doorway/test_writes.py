"""The ported writes obey the three rules, and the rules are checked rather than
stated.

WHAT THESE TESTS ARE FOR

  1. ONE ACT PER ENDPOINT — counted, not asserted in a comment. An endpoint that
     performed two governed acts would let an auditor read the chain and be
     unable to tell which of them the person actually looked at.

  2. NO RETRY, EVER — checked by walking the module's own syntax tree for a
     refusal being caught and the statement being run again. This is the single
     most damaging line anybody could add, and it would arrive looking like a
     kindness.

  3. NO PERMISSION CHECKS — the same source scan as the reads, for the same
     reason: a second copy of the permission model is the vulnerability, because
     both copies keep working and simply stop agreeing.

And the one that underwrites the audit record:

  4. THE NAME ON A WRITE IS THE SIGNED-IN PERSON'S — verified by reading the
     audit chain afterwards, never by believing the endpoint's own response. A
     handler that reported the right name while recording the wrong one would
     pass any test that asked the handler.
"""

from __future__ import annotations

import ast
import re
import tokenize
from pathlib import Path

import psycopg
import pytest

from doorway import writes as writes_module
from doorway.db import Database, SilentlyRefused
from doorway.identity import Caller
from doorway.reads import READS
from doorway.writes import (
    NEVER_FROM_THE_BODY, WRITES, Field, Missing, NoSuchWrite, Write, WrongShape,
    answer, run,
)

ADMINISTRATOR = Caller(person="admin@clausewerk", role="administrator")
LEGAL_ADMIN = Caller(person="leah@clausewerk", role="legal_admin")
REQUESTER = Caller(person="rita@clausewerk", role="requester")
VIEWER = Caller(person="sam@clausewerk", role="viewer")


# A plausible, complete body for every write. These exist so a refusal test
# refuses for the RIGHT reason: an empty body would be rejected by the doorway
# for a missing field and would prove nothing about who may perform the act.
# None of these need to name real rows — a role that holds no grant on the table
# is refused before any foreign key is looked at.
BODIES: dict[str, dict] = {
    "POST /deals": {"agreement_id": "AG-9", "counterparty": "Northwind"},
    "POST /categories": {"key": "data", "label": "Data Privacy", "short": "DP"},
    "POST /tickets": {
        "category_key": "data", "severity": "high", "reason_code": "gap",
        "provenance_badge": "vendor_paper", "proposed_text": "some proposed words",
    },
    "POST /tickets/claim": {"ticket_id": 1},
    "POST /tickets/claim/release": {"ticket_id": 1},
    "POST /tickets/verify": {
        "ticket_id": 1, "approved_text": "the approved words", "new_clause_id": "C-9",
        "title": "A Title", "rationale": "why this clause exists",
    },
    "POST /tickets/reject": {"ticket_id": 1, "note": "not suitable, because"},
    "POST /concessions": {
        "agreement_id": "AG-1", "category_key": "data", "standard_clause_id": "C-1",
        "standard_version": 1, "reason": "the counterparty pushed back",
    },
    "POST /concessions/approve": {"concession_id": 1, "approver_kind": "requester"},
    "POST /overrides": {
        "run_id": "RUN-1", "justification": "a justification long enough to clear it",
        "findings": [{"finding_ref": "F-1"}],
    },
    "POST /overrides/socialise": {"request_id": 1},
    "POST /overrides/decide": {
        "request_id": 1, "finding_ref": "F-1", "decision": "approved",
    },
    "POST /overrides/gate": {"request_id": 1, "finding_ref": "F-1"},
    "POST /holds": {"agreement_id": "AG-1", "matter_ref": "MATTER-1"},
    "POST /accounts": {
        "person": "new@clausewerk", "display_name": "New Person",
        "unit": "Procurement", "role": "requester",
    },
    "POST /accounts/revoke": {"person": "rita@clausewerk"},
    "POST /grants": {"person": "rita@clausewerk", "role": "requester", "reason": "x"},
    "POST /grants/countersign": {"grant_id": 1},
    "POST /grants/revoke": {"grant_id": 1, "reason": "no longer needed"},
    "POST /settings": {"key": "session_length", "value": "4h"},
    "POST /settings/decide": {
        "key": "session_length", "value": "4h", "rationale": "shorter is safer",
    },
    "POST /watchers": {"category_key": "data", "person": "leah@clausewerk"},
    "POST /watchers/remove": {"watcher_id": 1},
    "POST /retention/nudge": {"agreement_id": "AG-1", "note": "please review"},
    "POST /negotiations": {
        "agreement_id": "AG-1", "paper": "ours", "baseline": "library_standard",
    },
    "POST /negotiations/renew": {
        "agreement_id": "AG-2", "renews_agreement_id": "AG-1", "paper": "ours",
    },
    "POST /negotiations/rounds": {
        "negotiation_id": 1, "round_no": 1, "direction": "issued",
        "document_sha256": "c" * 64, "storage_uri": "store://round-1",
        "sent_on": "2026-07-27",
    },
    "POST /negotiations/positions": {
        "negotiation_id": 1, "category_key": "data", "round_raised": 1,
        "opened_from": "library_standard",
    },
    "POST /negotiations/positions/move": {
        "position_id": 1, "round_no": 1, "to_state": "held",
    },
    "POST /negotiations/positions/escalate": {"position_id": 1, "round_no": 1},
    "POST /checkpoints": {},
    "POST /health-checks/anchor": {},
    "POST /health-checks/chain": {},
    "POST /health-checks/document": {
        "agreement_id": "AG-1", "doc_seq": 1, "observed_sha256": "a" * 64,
    },
    "POST /health-checks/rebuild": {"run_id": "RUN-1", "observed_hash": "b" * 64},
    "POST /notifications/addresses": {
        "person": "leah@clausewerk", "address": "leah@example.com",
    },
    "POST /notifications/addresses/remove": {"person": "leah@clausewerk"},
    # A complete notice, so the viewer sweep refuses it for WHO IS ASKING and
    # not for a missing field. The viewer holds no grant on cw.notice at all,
    # which is the refusal this body is here to reach.
    "POST /notices": {
        "to_role": "legal_admin", "subject_kind": "health_tile",
        "subject_ref": "audit chain", "note": "this check has never run",
    },
    "POST /notices/acknowledge": {"notice_id": 1, "note": "seen"},
    "POST /obligations/satisfy": {"obligation_id": 1, "note": "done; receipt"},
    "POST /obligations/ack": {"obligation_id": 1, "document_ref": 1},
    "POST /obligations/reassign": {
        "obligation_id": 1, "new_owner": "ben@clausewerk",
    },
    "POST /obligations/waive": {
        "obligation_id": 1, "note": "vendor in liquidation", "override_ref": 1,
    },
    "POST /library/retire": {
        "clause_id": "DP-H-014", "version": 1, "reason": "withdrawn, not replaced",
    },
    "POST /library/supersede": {
        "clause_id": "DP-H-014", "version": 1, "title": "A Title",
        "body": "the successor wording", "rationale": "why it changed",
        "reason": "rewritten after guidance",
    },
    "POST /rules": {
        "rule_id": "DP-001", "name": "no-conflict", "severity": "High",
        "title": "A Rule", "detail": "what it asks",
        "predicate": {"all_present": ["a", "b"]},
    },
    "POST /rules/retire": {
        "rule_id": "DP-001", "version": 1, "reason": "superseded by policy",
    },
    "POST /concessions/promote": {
        "concession_id": 1, "new_clause_id": "DP-S-009", "title": "A Title",
        "rationale": "used three times this quarter",
    },
    "POST /ladders/floor": {"ladder_id": 1, "rung": 1},
    "POST /ladders/publish": {
        "category_key": "data", "severity": "Standard",
        "clause_ids": ["DP-S-001", "DP-S-002"], "versions": [1, 1],
        "floor_rung": 1, "reason": "positions hardened",
    },
    "POST /holds/release": {"hold_id": 1},
    "POST /retention/destroy": {"agreement_id": "AG-1"},
    "POST /agreements/redact": {"agreement_id": "AG-1"},
    "POST /agreements/purge": {"agreement_id": "AG-1"},
    "POST /records-delegates": {
        "person": "leah@clausewerk", "reason": "records officer this quarter",
    },
    "POST /records-delegates/revoke": {"person": "leah@clausewerk"},
    "POST /shares": {
        "agreement_id": "AG-1", "shared_with": "sam@clausewerk",
        "purpose": "diligence request from the counterparty",
    },
    "POST /shares/revoke": {"share_id": 1},
}


# ── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def people(db: Database, owner_url: str):
    """Four roles: the two the ceremony creates, plus a requester and a viewer."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            ("owner@clausewerk", "admin@clausewerk", "The Administrator",
             "leah@clausewerk", "Leah Legal", "Legal"),
        )
    with db.as_person("admin@clausewerk", "administrator") as request:
        for person, name, unit, role in (
            ("rita@clausewerk", "Rita Requester", "Procurement", "requester"),
            ("sam@clausewerk", "Sam Supplier", "Supplier", "viewer"),
        ):
            request.write_one(
                "insert into cw.account (person, display_name, unit, role, created_by) "
                "values (%s,%s,%s,%s,'admin@clausewerk')", (person, name, unit, role))
            request.write_one(
                "insert into cw.role_grant (action, person, role, acted_by, reason) "
                "values ('granted',%s,%s,'admin@clausewerk','so there is somebody to "
                "test as')", (person, role))
    return db


def chain(db: Database, subject: str | None = None) -> list[dict]:
    """The audit chain, read as the auditor. The record, not the response."""
    auditor = "admin@clausewerk"
    with db.as_person(auditor, "administrator") as request:
        if subject is None:
            return request.rows(
                "select seq, actor, actor_role, event_type, subject "
                "from cw.audit_event order by seq desc")
        return request.rows(
            "select seq, actor, actor_role, event_type, subject "
            "from cw.audit_event where subject = %s order by seq desc", (subject,))


# ── 2. Rule 1 — one act per endpoint ────────────────────────────────────────


@pytest.mark.parametrize("key", sorted(WRITES))
def test_one_act_per_endpoint(key: str):
    """No convenience endpoint bundles several governed acts into one call.

    Counted as: the statement performs exactly one change — one INSERT, UPDATE or
    DELETE, or one call to one `cw.` function. A statement doing two would let an
    auditor read the chain and be unable to tell which of the bundled things the
    person actually looked at.
    """
    sql = WRITES[key].sql
    changes = len(re.findall(r"\b(insert\s+into|update\s+cw\.|delete\s+from)\b",
                             sql, flags=re.I))
    # No whitespace before the bracket, deliberately. `cw.audit(` is a call;
    # `insert into cw.agreement (agreement_id, …)` is a table and its columns,
    # and an earlier version of this check counted the second as an act.
    functions = len(re.findall(r"\bcw\.\w+\(", sql))

    assert changes + functions == 1, (
        f"{key} performs {changes + functions} acts in one endpoint "
        f"({changes} statement(s), {functions} function call(s)). One act per "
        "endpoint is what keeps the audit chain legible."
    )


def test_no_write_is_routed_as_a_read():
    for key in WRITES:
        assert key.startswith("POST "), f"{key} changes something but is not a POST"
    overlap = set(WRITES) & set(READS)
    assert not overlap, f"routes registered as both a read and a write: {overlap}"


# ── 3. Rule 2 — never retry a refusal ───────────────────────────────────────


def test_no_refusal_is_ever_caught_and_tried_again():
    """The single most damaging line anybody could add, checked structurally.

    `run()` performs the write and must contain no exception handling at all —
    a refusal travels straight out to the caller. `answer()` may catch, because
    its job is to describe what happened, but it must never perform the write a
    second time.
    """
    tree = ast.parse(Path(writes_module.__file__).read_text(encoding="utf-8"))
    functions = {node.name: node for node in ast.walk(tree)
                 if isinstance(node, ast.FunctionDef)}

    handlers = [n for n in ast.walk(functions["run"])
                if isinstance(n, (ast.Try, ast.ExceptHandler))]
    assert not handlers, (
        "run() catches something. A refusal is the system working, and a handler "
        "here is where a retry would be added by somebody trying to be helpful."
    )

    calls = [n for n in ast.walk(functions["answer"])
             if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "run"]
    assert len(calls) == 1, (
        f"answer() calls run() {len(calls)} times. Once is describing what "
        "happened; twice is a retry."
    )

    for handler in (n for n in ast.walk(functions["answer"])
                    if isinstance(n, ast.ExceptHandler)):
        retried = [n for n in ast.walk(handler)
                   if isinstance(n, ast.Call)
                   and getattr(n.func, "id", None) in {"run"}
                   or isinstance(n, ast.Call)
                   and getattr(n.func, "attr", None) in {"as_person", "rows", "write"}]
        assert not retried, (
            "answer() performs a database call inside an exception handler. That "
            "is a retry however it is worded."
        )


def test_the_module_holds_no_loop_around_a_write():
    """A retry does not have to look like a retry. A `for attempt in range(3)`
    around the statement is the same line with a nicer name."""
    tree = ast.parse(Path(writes_module.__file__).read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.While)):
            inner = [n for n in ast.walk(node)
                     if isinstance(n, ast.Call)
                     and getattr(n.func, "attr", None) in {"as_person", "rows"}]
            assert not inner, "a database call sits inside a loop in writes.py"


# ── 4. Rule 3 — no permission checks, and no second place for a name ────────


def executable_source(path: Path) -> str:
    """The file with its comments and docstrings removed, so a check does not
    trip on the sentence explaining the ban."""
    kept = []
    with path.open("rb") as handle:
        for token in tokenize.tokenize(handle.readline):
            if token.type in (tokenize.COMMENT, tokenize.STRING):
                continue
            kept.append(token.string)
    return "\n".join(kept)


def test_no_permission_check_lives_in_the_writes():
    source = executable_source(Path(writes_module.__file__))
    compared = re.findall(r"\brole\b\s*(?:==|!=|<|>)", source)
    assert not compared, (
        f"the writes compare a role {len(compared)} time(s). The database decides."
    )
    for role_name in ("viewer", "requester", "legal_reviewer", "legal_admin",
                      "auditor", "administrator"):
        assert role_name not in source, (
            f"the writes name the role {role_name!r} in executable code"
        )


@pytest.mark.parametrize("key", sorted(WRITES))
def test_no_write_takes_an_actor_from_the_body(key: str):
    """There is nowhere to put a different name. This is the structural half of
    the audit record's meaning, and it is checked per endpoint rather than by
    reading the file."""
    taken = {spec.name for spec in WRITES[key].fields}
    smuggled = sorted(taken & NEVER_FROM_THE_BODY)
    assert not smuggled, (
        f"{key} takes {smuggled} from the request body. Every one of those is an "
        "actor, and the actor comes from the connection."
    )


# ── The set of person columns, DERIVED and not typed out ────────────────────
#
# The migrations are what a person column actually is. A hand-written list is a
# snapshot of the schema on the day somebody last looked, and this one was
# seventeen names out of date when it was measured on 2026-08-08 — while its own
# comment in writes.py described exactly that failure and named the time it had
# already happened (`requester`).
#
# ONE DERIVATION, TWO GUARDS. Below it feeds both the declaration check and the
# statement check. They were separate hand-typed lists — 17 names and 10 — of one
# concept, which is S257's defect in a different file: two copies written apart
# have never once agreed in this codebase.

MIGRATIONS = Path(writes_module.__file__).resolve().parents[1] / "db" / "migrations"

# A column declaration whose name says it holds a person: at the start of a line,
# with a text type straight after.
#
# `p_…` IS EXCLUDED BECAUSE IT IS THIS SCHEMA'S PARAMETER PREFIX, not out of
# tidiness. Function parameters are declared in the same shape as columns and
# `p_by` was picked up on the first run — a name no body could ever collide with,
# reported as an unguarded column. A guard that cries wolf gets its exception
# list padded until it means nothing.
PERSON_COLUMN = re.compile(
    r"^\s+(?!p_)(\w+_by|actor|approver|reviewer|requester|owner)\s+"
    r"(?:text|citext|varchar)\b", re.MULTILINE)

# THE ONE COLUMN THAT LOOKS LIKE AN ACTOR AND IS NOT, kept as a NAMED exception
# so that it is a decision on the record rather than a silence.
#
# `cw.ladder.owner` is stewardship — who to ask about a ladder — and `POST
# /ladders/publish` takes it from the body deliberately. It defaults to the actor
# (`coalesce(p_owner, old_owner, cw.app_actor())`, 0062) which is why it matches
# the pattern, but NO POLICY READS IT: it is selected into a view and nowhere
# else. Only a legal admin may publish, and who actually published is recorded
# separately by cw.audit. Naming a colleague as a ladder's steward is an ordinary
# act, not an unattributed one.
NOT_AN_ACTOR = frozenset({"owner"})


def person_columns() -> set[str]:
    """Every column in the schema that holds a person's name."""
    found: set[str] = set()
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        found.update(PERSON_COLUMN.findall(
            migration.read_text(encoding="utf-8")))
    assert len(found) > 25, (
        f"only {len(found)} person columns were derived from {MIGRATIONS}. The "
        "pattern has stopped matching the schema, and a guard that derives "
        "nothing passes everything")
    return found


def test_the_declaration_covers_every_person_column_the_schema_has():
    """THE GUARD THAT LOOKS AT THE SCHEMA RATHER THAN AT THE LAST ENDPOINT.

    `NEVER_FROM_THE_BODY` is the doorway's own declaration and stays a plain
    frozenset — a runtime module must not read the migrations folder to answer a
    question about its own fields. This is what makes the declaration keep up:
    add `escalated_by` to a migration and this fails naming it, which is the
    moment somebody decides whether a body may carry it.
    """
    missing = sorted(person_columns() - NOT_AN_ACTOR - NEVER_FROM_THE_BODY)
    assert not missing, (
        f"the schema holds {missing}, which carry a person's name, and "
        "writes.NEVER_FROM_THE_BODY does not list them. Add them there, or add "
        "the column to NOT_AN_ACTOR above with the reason it is not an actor."
    )


# THE REVERSE IS DELIBERATELY NOT ASSERTED, and the reason is worth writing down
# because it was tried and was wrong.
#
# The obvious companion test — "the declaration names nothing the schema does not
# have" — was written, run, and deleted. It failed on `countersigned_by` and
# `person_acting`, and BOTH of those entries are correct. No such column exists:
# 0013 considered `countersigned_by` as a column and chose an action row instead
# (`action in ('granted','countersigned','revoked')`), and `person_acting` is in
# the schema nowhere at all.
#
# They belong in the declaration anyway, because it bans BODY FIELD NAMES, not
# columns. A form posting `person_acting` is claiming to name the actor whatever
# the schema calls the column, and the ban should already be there when somebody
# adds the column. The schema is a FLOOR under this list, never a ceiling — so
# the containment runs one way only.


@pytest.mark.parametrize("key", sorted(WRITES))
def test_any_recorded_actor_comes_from_the_connection(key: str):
    """Where a statement writes a name into a column, that name is
    `current_setting('cw.actor')` and nothing else.

    THE COLUMNS COME FROM THE SCHEMA (person_columns above), not from a list
    typed here. That list held ten names against the schema's thirty-three, so
    a statement setting `settled_by` or `granted_by` from anywhere at all was
    invisible to it.
    """
    sql = WRITES[key].sql
    for column in sorted(person_columns() - NOT_AN_ACTOR):
        for assigned in re.findall(rf"\b{column}\s*=\s*([^\s,)]+)", sql):
            assert "current_setting" in assigned, (
                f"{key} sets {column} to {assigned}, which did not come from the "
                "connection"
            )


# ── 5. The name on a write is the signed-in person's ────────────────────────


def test_a_write_lands_with_the_signed_in_person_s_name_on_it(people, db: Database):
    """Read from the audit record, not from the endpoint's response. A handler
    that reported the right name while recording the wrong one would pass any
    test that asked the handler."""
    run(db, ADMINISTRATOR, "POST /accounts", {
        "person": "newbie@clausewerk", "display_name": "New Bie",
        "unit": "Procurement", "role": "requester"})

    recorded = chain(db, subject="newbie@clausewerk")
    assert recorded, "the write left no trace in the audit chain"
    assert recorded[0]["actor"] == ADMINISTRATOR.person, (
        f"the chain says {recorded[0]['actor']} performed the act; the signed-in "
        f"person was {ADMINISTRATOR.person}"
    )


def test_a_body_naming_somebody_else_changes_nothing(people, db: Database):
    """The strongest form of the attribution test: try to smuggle a name in, and
    confirm the record still names the caller. There is no field for it, so the
    attempt is ignored rather than refused — and the record is what proves it."""
    run(db, ADMINISTRATOR, "POST /accounts", {
        "person": "smuggle@clausewerk", "display_name": "Smuggled",
        "unit": "Procurement", "role": "requester",
        # None of these exist as fields. If any of them ever did, this test fails.
        "created_by": "leah@clausewerk", "acted_by": "leah@clausewerk",
        "actor": "leah@clausewerk", "person_acting": "leah@clausewerk"})

    recorded = chain(db, subject="smuggle@clausewerk")
    assert recorded[0]["actor"] == ADMINISTRATOR.person, (
        f"a name in the request body reached the audit record as "
        f"{recorded[0]['actor']}"
    )

    with db.as_person(ADMINISTRATOR.person, ADMINISTRATOR.role) as request:
        row = request.one(
            "select created_by from cw.account where person = 'smuggle@clausewerk'")
    assert row[0] == ADMINISTRATOR.person, (
        f"cw.account.created_by says {row[0]}; the signed-in person was "
        f"{ADMINISTRATOR.person}"
    )


def test_two_people_performing_the_same_act_are_told_apart(people, db: Database):
    """Attribution that only works for one person is not attribution."""
    run(db, ADMINISTRATOR, "POST /accounts", {
        "person": "one@clausewerk", "display_name": "One", "role": "requester"})
    # A deal to hang a hold on, then the hold. Opening a hold is one of the acts
    # the schema audits; creating a category and opening a deal are not, which is
    # a schema decision and not this test's to argue with — it just means those
    # two would prove nothing here.
    run(db, REQUESTER, "POST /deals",
        {"agreement_id": "AG-1", "counterparty": "Northwind"})
    run(db, LEGAL_ADMIN, "POST /holds",
        {"agreement_id": "AG-1", "matter_ref": "MATTER-1"})

    actors = {row["actor"] for row in chain(db)}
    assert {ADMINISTRATOR.person, LEGAL_ADMIN.person} <= actors, (
        f"the chain names {actors}; both people performed an act"
    )


# ── 6. Refusals stay legible ────────────────────────────────────────────────


@pytest.mark.parametrize("key", sorted(WRITES))
def test_every_write_refuses_the_role_that_may_change_nothing(
    people, db: Database, key: str
):
    """A viewer changes nothing, anywhere, by doctrine. Twenty-seven endpoints,
    twenty-seven refusals — and each one refused for a reason the database gave,
    not because a field was missing."""
    shaped = answer(db, VIEWER, key, BODIES[key])

    assert shaped.refused, (
        f"{key} did not refuse a viewer. It answered {shaped.status} "
        f"{shaped.body!r}"
    )
    assert shaped.body.get("reason", "").strip(), (
        f"{key} refused a viewer with no words"
    )
    assert shaped.body.get("kind") != "rejected", (
        f"{key} refused a viewer for a missing field rather than for who they "
        f"are: {shaped.body!r}. The body in BODIES needs completing, or this "
        "endpoint proves nothing about permission."
    )


def test_a_refused_write_leaves_no_trace(people, db: Database):
    """A refusal is not a partial success. Nothing is recorded, because nothing
    happened."""
    before = len(chain(db))
    shaped = answer(db, VIEWER, "POST /accounts", BODIES["POST /accounts"])
    assert shaped.refused
    assert len(chain(db)) == before, (
        "a refused write added rows to the audit chain"
    )


# ── 7. A no-op success is a failure ─────────────────────────────────────────


def test_a_write_that_changes_nothing_is_not_reported_as_done(people, db: Database):
    """Finding D1's shape, and the one place this port deliberately behaves
    differently from the JavaScript.

    An UPDATE refused by a missing policy does not raise. It changes nothing and
    reports success, and the screen says the change was saved. The JavaScript
    answers `{"rows": []}` here.
    """
    with pytest.raises(SilentlyRefused):
        run(db, ADMINISTRATOR, "POST /settings",
            {"key": "no_such_setting_exists", "value": "4h"})

    shaped = answer(db, ADMINISTRATOR, "POST /settings",
                    {"key": "no_such_setting_exists", "value": "4h"})
    assert shaped.status == 409
    assert shaped.body["kind"] == "changed_nothing"
    assert "changing anything" in shaped.body["reason"]


def test_a_real_change_is_still_reported_as_done(people, db: Database):
    """The guard on the test above: if every write started reporting a no-op,
    that test would pass while the product did nothing at all."""
    produced = run(db, ADMINISTRATOR, "POST /settings",
                   {"key": "session_length", "value": "4h"})
    assert produced and produced[0]["value"] == "4h"


# ── 8. Missing fields are named, and named early ────────────────────────────


def test_a_missing_field_is_named(people, db: Database):
    with pytest.raises(Missing) as caught:
        run(db, ADMINISTRATOR, "POST /accounts", {"person": "x@clausewerk"})
    assert "display_name" in str(caught.value)


def test_a_blank_field_is_not_a_value(people, db: Database):
    """The empty string is what a form posts when nobody typed anything."""
    with pytest.raises(Missing):
        run(db, ADMINISTRATOR, "POST /accounts",
            {"person": "x@clausewerk", "display_name": "   ", "role": "requester"})


def test_a_note_is_required_only_when_the_finding_is_rejected():
    """The one conditional field in the whole set, checked both ways."""
    decide = WRITES["POST /overrides/decide"]
    with pytest.raises(Missing):
        decide.bind({"request_id": 1, "finding_ref": "F-1", "decision": "rejected"})

    bound = decide.bind({"request_id": 1, "finding_ref": "F-1", "decision": "approved"})
    assert bound["note"] is None


def test_an_unknown_write_is_not_reported_as_a_refusal(people, db: Database):
    with pytest.raises(NoSuchWrite):
        run(db, ADMINISTRATOR, "POST /no-such-thing", {})
    assert answer(db, ADMINISTRATOR, "POST /no-such-thing", {}).status == 404


# ── 9. The guarantees the JavaScript mutation harness named ─────────────────
#
# `db/test/mutation-check.mjs` carried fifteen mutations over the JavaScript
# service. When that service is deleted they report SKIP, which is fatal in that
# harness — deliberately, so the bar goes red until each one is either re-proved
# here or removed with its reason written down.
#
# Most of the fifteen were already caught by tests above. These four were not,
# and each is now named by `doorway/mutation_check.py`.


def test_verification_goes_through_the_function_that_mints(people, db: Database):
    """A verified ticket must name the clause it minted.

    The JavaScript's first attempt was one `/tickets/decide` endpoint doing a raw
    UPDATE, and the database refused it outright — an UPDATE that sets
    `state = 'verified'` and nothing else cannot name a minted clause. That
    refusal was the schema stopping the API inventing a second, weaker way to
    promote language.

    So this endpoint calls `cw.verify_review_ticket()` and nothing else. A raw
    UPDATE here would mint nothing, and the library would gain a verified ticket
    with no clause behind it.
    """
    statement = WRITES["POST /tickets/verify"].sql.lower()
    assert "cw.verify_review_ticket(" in statement, (
        "POST /tickets/verify no longer calls the function that mints the clause "
        "version. Whatever it does now, the library is not gaining a version from "
        "it."
    )
    assert "update" not in statement, (
        "POST /tickets/verify performs a raw update. Verification mints a clause "
        "version; an update that moves the ticket's state mints nothing."
    )


def test_the_approved_wording_is_required_and_never_defaulted(people, db: Database):
    """`approved_text` is what the reviewer is actually approving.

    Defaulting it to the proposed text would make every unedited approval a fact
    the system INVENTED rather than one it recorded — and the unedited-approval
    rate (owner decision U4) is built on precisely this column meaning what it
    says. A measurement of review quality that quietly counts un-reviewed
    approvals as clean is worse than no measurement.
    """
    verify = WRITES["POST /tickets/verify"]
    approved = next(f for f in verify.fields if f.name == "approved_text")

    assert approved.required, (
        "approved_text is optional. Whatever it now defaults to, the "
        "unedited-approval rate is measuring something nobody chose."
    )
    assert approved.default is None

    with pytest.raises(Missing):
        verify.bind({"ticket_id": 1, "new_clause_id": "C-1", "title": "T",
                     "rationale": "R"})


def test_a_rejection_needs_a_note(people, db: Database):
    """The empty string is what a form posts when nobody typed anything.

    The schema refuses a blank note (`rejection_needs_note`); this catches it one
    step earlier so the message names the field. A rejection nobody explained is
    a decision the requester cannot answer.
    """
    reject = WRITES["POST /tickets/reject"]
    note = next(f for f in reject.fields if f.name == "note")
    assert note.required, "a rejection note is optional"

    for blank in ({"ticket_id": 1}, {"ticket_id": 1, "note": ""},
                  {"ticket_id": 1, "note": "   "}):
        with pytest.raises(Missing):
            reject.bind(blank)


def test_the_deals_endpoint_does_not_scope_rows_itself(people, db: Database):
    """Named separately from the read-side check because this is the one an
    innocent change reaches for: a requester "should only see their own", so
    somebody adds a WHERE. The database already says so, and two copies of that
    rule is the vulnerability."""
    from doorway.reads import READS

    statement = READS["GET /deals"].sql.lower()
    assert "where" not in statement, (
        f"GET /deals scopes its own rows: {statement!r}. The policy on "
        "cw.agreement decides who sees what."
    )


# ── 10. The negotiation record ──────────────────────────────────────────────
#
# Six endpoints, and what is being proved about them is not that they insert
# rows. It is that WHO may write is settled by migration 0027 and not by
# anything in Python: Legal writes against any deal, a requester writes against
# their own and is refused on somebody else's, and the two roles that read but
# never write are refused everywhere.
#
# Every refusal below is the database's. None of these tests reaches for a
# second connection or a second role after being told no.

NEG_ADMINISTRATOR = Caller(person="a.okafor@clausewerk", role="administrator")
NEG_LEGAL_ADMIN = Caller(person="r.vance@clausewerk", role="legal_admin")
NEG_REVIEWER = Caller(person="p.nkemi@clausewerk", role="legal_reviewer")
NEG_AUDITOR = Caller(person="t.imani@clausewerk", role="auditor")
NEG_OWNER = Caller(person="d.buyer@clausewerk", role="requester")
NEG_STRANGER = Caller(person="e.other@clausewerk", role="requester")

OWNED_DEAL = "AG-NEG-OWNED"
OTHER_DEAL = "AG-NEG-OTHER"
PRIOR_DEAL = "AG-NEG-PRIOR"
RENEWAL_DEAL = "AG-NEG-RENEWAL"

NEGOTIATION_WRITES = (
    "POST /negotiations",
    "POST /negotiations/renew",
    "POST /negotiations/rounds",
    "POST /negotiations/positions",
    "POST /negotiations/positions/move",
    "POST /negotiations/positions/escalate",
)


def a_round(negotiation_id, round_no=1, direction="issued"):
    return {
        "negotiation_id": negotiation_id, "round_no": round_no,
        "direction": direction, "document_sha256": f"{round_no:064x}",
        "storage_uri": f"store://round-{round_no}", "sent_on": "2026-07-27",
    }


@pytest.fixture
def negotiating(db: Database, owner_url: str, schema: str):
    """Two requesters with a deal each, a Legal cast, and a prior term to renew
    from.

    The cast comes from the demo seed so the roles are the real ones, granted
    and countersigned the way the system grants them. The second requester is
    added here because ownership cannot be proved with only one.
    """
    from doorway.seed_demo import seed

    seed(owner_url=owner_url, app_url=schema)

    with db.as_person(NEG_ADMINISTRATOR.person, NEG_ADMINISTRATOR.role) as request:
        request.write_one(
            "insert into cw.account (person, display_name, unit, role, created_by) "
            "values (%s,%s,%s,%s,%s)",
            ("e.other@clausewerk", "Elle Other", "Procurement", "requester",
             NEG_ADMINISTRATOR.person))
        request.write_one(
            "insert into cw.role_grant (action, person, role, reason) "
            "values ('granted',%s,'requester',%s)",
            ("e.other@clausewerk", "a second requester to be refused as"))

    run(db, NEG_LEGAL_ADMIN, "POST /categories",
        {"key": "data", "label": "Data Privacy", "short": "DP"})

    for deal, who in ((OWNED_DEAL, NEG_OWNER), (PRIOR_DEAL, NEG_OWNER),
                      (RENEWAL_DEAL, NEG_OWNER), (OTHER_DEAL, NEG_STRANGER)):
        run(db, who, "POST /deals", {"agreement_id": deal, "counterparty": "Northwind"})

    # A prior term to renew from. Written on the owner connection because this
    # is scenery, not the act under test: cw.open_renewal refuses outright
    # unless the agreement it renews has an executed run behind it.
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("insert into cw.snapshot (snapshot_id) values (%s)", ("a" * 64,))
        owner.execute("insert into cw.ruleset (ruleset_id) values (%s)", ("b" * 64,))
        owner.execute(
            "insert into cw.run (run_id, agreement_id, vendor, manifest, "
            "manifest_source, snapshot_id, ruleset_id, result_hash, "
            "engine_version, gate_open, created_by) "
            "values (%s,%s,'Northwind','{}'::jsonb,'manual',%s,%s,%s,'test',true,%s)",
            ("RUN-PRIOR", PRIOR_DEAL, "a" * 64, "b" * 64, "d" * 64,
             NEG_OWNER.person))
        owner.execute(
            "insert into cw.executed_agreement (agreement_id, run_id, executed_on, "
            "effective_on) values (%s,'RUN-PRIOR', current_date, current_date)",
            (PRIOR_DEAL,))
    return db


def open_negotiation(db: Database, caller: Caller, agreement_id: str) -> int:
    produced = run(db, caller, "POST /negotiations", {
        "agreement_id": agreement_id, "paper": "ours",
        "baseline": "library_standard"})
    return produced[0]["negotiation_id"]


def open_position(db: Database, caller: Caller, negotiation_id: int) -> int:
    produced = run(db, caller, "POST /negotiations/positions", {
        "negotiation_id": negotiation_id, "category_key": "data",
        "round_raised": 1, "opened_from": "library_standard"})
    return produced[0]["position_id"]


def test_the_owning_requester_records_a_whole_negotiation(negotiating, db: Database):
    """Open it, record a round, raise a position, move it, escalate it. Five
    acts, five endpoints, one deal the caller owns."""
    negotiation_id = open_negotiation(db, NEG_OWNER, OWNED_DEAL)

    recorded = run(db, NEG_OWNER, "POST /negotiations/rounds",
                   a_round(negotiation_id))
    assert recorded[0]["round_no"] == 1

    position_id = open_position(db, NEG_OWNER, negotiation_id)

    moved = run(db, NEG_OWNER, "POST /negotiations/positions/move", {
        "position_id": position_id, "round_no": 1, "to_state": "held"})
    assert moved[0]["to_state"] == "held"

    escalated = run(db, NEG_OWNER, "POST /negotiations/positions/escalate", {
        "position_id": position_id, "round_no": 2})
    assert escalated[0]["to_state"] == "escalated"


@pytest.mark.parametrize("caller", [NEG_REVIEWER, NEG_LEGAL_ADMIN],
                         ids=["legal_reviewer", "legal_admin"])
def test_legal_writes_against_a_deal_it_does_not_own(
    negotiating, db: Database, caller: Caller
):
    """Legal never appears in cw.agreement.requester, so a two-branch policy
    that forgot the Legal branch would lock Legal out of the whole record."""
    negotiation_id = open_negotiation(db, caller, OWNED_DEAL)
    run(db, caller, "POST /negotiations/rounds", a_round(negotiation_id))
    position_id = open_position(db, caller, negotiation_id)
    run(db, caller, "POST /negotiations/positions/move", {
        "position_id": position_id, "round_no": 1, "to_state": "conceded"})
    run(db, caller, "POST /negotiations/positions/escalate", {
        "position_id": position_id, "round_no": 2})


def test_a_requester_is_refused_on_another_persons_deal(negotiating, db: Database):
    """0027's rule, seen through the endpoints. Each act is attempted
    separately, because closing one without the others achieves nothing."""
    negotiation_id = open_negotiation(db, NEG_OWNER, OWNED_DEAL)
    position_id = open_position(db, NEG_OWNER, negotiation_id)

    attempts = {
        "POST /negotiations": {
            "agreement_id": OWNED_DEAL, "paper": "ours",
            "baseline": "library_standard"},
        "POST /negotiations/rounds": a_round(negotiation_id),
        "POST /negotiations/positions": {
            "negotiation_id": negotiation_id, "category_key": "data",
            "round_raised": 1, "opened_from": "library_standard"},
        "POST /negotiations/positions/move": {
            "position_id": position_id, "round_no": 1, "to_state": "held"},
        "POST /negotiations/positions/escalate": {
            "position_id": position_id, "round_no": 1},
    }
    for key, body in attempts.items():
        shaped = answer(db, NEG_STRANGER, key, body)
        assert shaped.refused, (
            f"{key} let a requester write against a deal they do not own. It "
            f"answered {shaped.status} {shaped.body!r}")
        assert shaped.body.get("kind") != "rejected", (
            f"{key} refused for a missing field rather than for whose deal it "
            f"is: {shaped.body!r}")


@pytest.mark.parametrize("key", NEGOTIATION_WRITES)
@pytest.mark.parametrize("caller", [NEG_AUDITOR, NEG_ADMINISTRATOR],
                         ids=["auditor", "administrator"])
def test_the_reading_roles_write_nothing_in_the_negotiation_record(
    negotiating, db: Database, caller: Caller, key: str
):
    """Both hold select and neither holds insert (0011, 0013). Refused by the
    grant, before any policy is consulted."""
    shaped = answer(db, caller, key, BODIES[key])
    assert shaped.refused, (
        f"{key} let {caller.role} write. It answered {shaped.status} "
        f"{shaped.body!r}")
    assert shaped.body.get("reason", "").strip()
    assert shaped.body.get("kind") != "rejected", (
        f"{key} refused {caller.role} for a missing field: {shaped.body!r}")


def test_a_renewal_opens_from_the_prior_term(negotiating, db: Database):
    """The settled U1 choice, passed through and recorded rather than inferred."""
    produced = run(db, NEG_OWNER, "POST /negotiations/renew", {
        "agreement_id": RENEWAL_DEAL, "renews_agreement_id": PRIOR_DEAL,
        "paper": "ours", "baseline": "executed_agreement"})
    negotiation_id = produced[0]["negotiation_id"]
    assert negotiation_id

    with db.as_person(NEG_OWNER.person, NEG_OWNER.role) as request:
        rows = request.rows(
            "select baseline, renews_agreement_id, opened_by, baseline_chosen_by "
            "from cw.negotiation where negotiation_id = %s", (negotiation_id,))
    assert rows[0]["baseline"] == "executed_agreement"
    assert rows[0]["renews_agreement_id"] == PRIOR_DEAL
    assert rows[0]["opened_by"] == NEG_OWNER.person
    assert rows[0]["baseline_chosen_by"] == NEG_OWNER.person


def test_a_renewal_left_to_the_recorded_default_is_not_overridden_here(
    negotiating, db: Database
):
    """Absent baseline means null, and null means the governance setting. The
    doorway does not restate the default — a second copy of a settled decision
    is how the two stop agreeing."""
    produced = run(db, NEG_OWNER, "POST /negotiations/renew", {
        "agreement_id": RENEWAL_DEAL, "renews_agreement_id": PRIOR_DEAL,
        "paper": "ours"})

    with db.as_person(NEG_OWNER.person, NEG_OWNER.role) as request:
        chosen = request.rows(
            "select baseline from cw.negotiation where negotiation_id = %s",
            (produced[0]["negotiation_id"],))[0]["baseline"]
        recorded = request.rows(
            "select value from cw.governance_setting "
            "where key = 'renewal_default_baseline'")[0]["value"]
    assert chosen == recorded


def test_the_renewal_shortcut_is_scoped_by_ownership_too(negotiating, db: Database):
    """The one endpoint whose refusal had to be checked deliberately.

    cw.open_renewal is SECURITY DEFINER, so it runs past the write policies
    0027 installed — the ownership rule cannot reach it from there, and it has
    its own instead. Asserted rather than assumed, because a renewal that
    refused for some other reason (no executed term behind it, say) would look
    identical from out here. The fixture gives this deal a real prior term, so
    the only thing left to refuse is whose deal it is.
    """
    shaped = answer(db, NEG_STRANGER, "POST /negotiations/renew", {
        "agreement_id": RENEWAL_DEAL, "renews_agreement_id": PRIOR_DEAL,
        "paper": "ours", "baseline": "library_standard"})
    assert shaped.refused, (
        f"a stranger opened a renewal on somebody else's deal: {shaped.body!r}")
    assert shaped.body.get("kind") != "rejected", shaped.body

    # The same call by the owner succeeds, which is what makes the refusal above
    # about ownership rather than about the endpoint being broken.
    assert not answer(db, NEG_OWNER, "POST /negotiations/renew", {
        "agreement_id": RENEWAL_DEAL, "renews_agreement_id": PRIOR_DEAL,
        "paper": "ours", "baseline": "library_standard"}).refused


def test_a_round_out_of_sequence_is_the_databases_refusal(negotiating, db: Database):
    """The gap guard lives in cw.round_is_next(). Nothing in Python pre-empts
    it, and the refusal arrives as the database stated it."""
    negotiation_id = open_negotiation(db, NEG_OWNER, OWNED_DEAL)
    shaped = answer(db, NEG_OWNER, "POST /negotiations/rounds",
                    a_round(negotiation_id, round_no=3))
    assert shaped.refused
    assert shaped.body.get("reason", "").strip()


def test_raising_a_position_records_its_opening_movement_once(
    negotiating, db: Database
):
    """cw.position_opens() writes the opening row. The endpoint writing a second
    one would record the same fact twice — which is the trap this checks."""
    negotiation_id = open_negotiation(db, NEG_OWNER, OWNED_DEAL)
    position_id = open_position(db, NEG_OWNER, negotiation_id)

    with db.as_person(NEG_OWNER.person, NEG_OWNER.role) as request:
        movements = request.rows(
            "select to_state, actor from cw.position_movement "
            "where position_id = %s", (position_id,))
    assert len(movements) == 1
    assert movements[0]["to_state"] == "open"
    assert movements[0]["actor"] == NEG_OWNER.person


def test_escalation_does_not_take_its_state_from_the_body(negotiating, db: Database):
    """A caller should not reach Legal by typing a string, and cannot: the
    endpoint takes no state field at all."""
    escalate = WRITES["POST /negotiations/positions/escalate"]
    assert "to_state" not in {spec.name for spec in escalate.fields}

    negotiation_id = open_negotiation(db, NEG_OWNER, OWNED_DEAL)
    position_id = open_position(db, NEG_OWNER, negotiation_id)
    produced = run(db, NEG_OWNER, "POST /negotiations/positions/escalate", {
        "position_id": position_id, "round_no": 1, "to_state": "settled"})
    assert produced[0]["to_state"] == "escalated"


def test_every_negotiation_act_reaches_the_audit_chain(negotiating, db: Database):
    """Recorded by the triggers in 0011, which is why no endpoint writes an
    audit row of its own — a second write would record each act twice."""
    before = {row["seq"] for row in chain(db)}

    negotiation_id = open_negotiation(db, NEG_OWNER, OWNED_DEAL)
    run(db, NEG_OWNER, "POST /negotiations/rounds", a_round(negotiation_id))
    position_id = open_position(db, NEG_OWNER, negotiation_id)
    run(db, NEG_OWNER, "POST /negotiations/positions/move", {
        "position_id": position_id, "round_no": 1, "to_state": "held"})

    added = [row for row in chain(db) if row["seq"] not in before]
    kinds = [row["event_type"] for row in added]
    assert "negotiation_opened" in kinds
    assert "negotiation_round_recorded" in kinds
    # Raising the position and moving it are two movements, and each is its own
    # audit row. One would mean an act went unrecorded.
    assert kinds.count("position_moved") == 2
    for row in added:
        assert row["actor"] == NEG_OWNER.person


def test_each_negotiation_endpoint_is_reachable_through_the_service(
    negotiating, db: Database
):
    """The package's central claim: a WRITES entry is a whole endpoint. Nothing
    was added to app.py, and these routes answer anyway."""
    from doorway.app import App

    service = App(db)
    token = service.sign_in(NEG_OWNER.person).body["token"]

    opened = service.handle("POST", "/negotiations", token, {
        "agreement_id": OWNED_DEAL, "paper": "ours",
        "baseline": "library_standard"})
    assert opened.status == 200, opened.body
    negotiation_id = opened.body["rows"][0]["negotiation_id"]

    recorded = service.handle("POST", "/negotiations/rounds", token,
                              a_round(negotiation_id))
    assert recorded.status == 200, recorded.body

    raised = service.handle("POST", "/negotiations/positions", token, {
        "negotiation_id": negotiation_id, "category_key": "data",
        "round_raised": 1, "opened_from": "library_standard"})
    assert raised.status == 200, raised.body
    position_id = raised.body["rows"][0]["position_id"]

    for path, body in (
        ("/negotiations/positions/move",
         {"position_id": position_id, "round_no": 1, "to_state": "held"}),
        ("/negotiations/positions/escalate",
         {"position_id": position_id, "round_no": 2}),
        ("/negotiations/renew",
         {"agreement_id": RENEWAL_DEAL, "renews_agreement_id": PRIOR_DEAL,
          "paper": "ours"}),
    ):
        answered = service.handle("POST", path, token, body)
        assert answered.status == 200, (path, answered.body)


# ── 7. A structured value in a plain field is the caller's mistake ──────────
#
# Defect B1. A caller who sent a nested object or a list where a plain value
# belongs was told THE SERVICE FAILED — an HTTP 500 — on every write endpoint in
# the product. Scalar mistakes were already handled correctly, which is what
# made it a bug rather than a design choice.
#
# It matters in both directions: caller typos produced 500s, so a genuine
# service failure stopped being distinguishable from noise in the log.


def _plain_fields(key):
    return [f for f in WRITES[key].fields if not f.as_json]


@pytest.mark.parametrize("key", sorted(WRITES))
@pytest.mark.parametrize("bad", [{}, {"nested": [1, 2]}, [], [1, 2]])
def test_a_structured_value_is_refused_and_the_field_is_named(key, bad):
    """Every plain field, every write, both shapes, and the empty cases too.

    Database-free: this is the boundary, and it refuses before anything opens.
    The empty cases are here deliberately — `str({})` is "{}" and `str([])` is
    "[]", so neither is caught by the blankness check that sits beside this one.
    """
    for spec in _plain_fields(key):
        body = dict(BODIES[key])
        body[spec.name] = bad
        with pytest.raises(WrongShape):
            WRITES[key].bind(body)


@pytest.mark.parametrize("key", sorted(WRITES))
@pytest.mark.parametrize("bad", [True, False])
def test_a_boolean_is_refused_from_every_plain_field(key, bad):
    """JSON booleans are not numeric IDs or text and PostgreSQL treats them
    as their own type; letting one through turns a request typo into a late
    database error instead of a boundary rejection."""
    for spec in _plain_fields(key):
        body = dict(BODIES[key])
        body[spec.name] = bad
        with pytest.raises(WrongShape, match="boolean"):
            WRITES[key].bind(body)


def test_the_one_json_field_still_takes_a_structure():
    """The guard must not break the field whose whole job is to carry one."""
    findings = [f for f in WRITES["POST /overrides"].fields if f.as_json]
    assert findings, "POST /overrides no longer declares a JSON field"
    body = dict(BODIES["POST /overrides"])
    body[findings[0].name] = [{"finding_ref": "F-1"}]
    WRITES["POST /overrides"].bind(body)


@pytest.mark.parametrize("bad", [{"nested": [1, 2]}, [1, 2], True])
def test_the_endpoint_answers_a_refusal_and_not_a_service_failure(
    people, db: Database, bad
):
    """B1's reported reproduction, end to end.

    The guard raising is not enough — an uncaught exception on the way out
    becomes the very 500 the guard exists to remove, which is how this defect
    would have been fixed and reintroduced one layer up in the same change.
    """
    shaped = answer(db, REQUESTER, "POST /deals",
                    {"agreement_id": "AG-B1", "counterparty": bad})

    assert shaped.status == 400, (
        f"a malformed field answered {shaped.status}; a caller's mistake is "
        f"never a service failure")
    assert shaped.body.get("kind") == "rejected"


def test_a_scalar_mistake_is_unaffected(people, db: Database):
    """The behaviour that was already right stays right."""
    shaped = answer(db, REQUESTER, "POST /deals",
                    {"agreement_id": "AG-B1b", "counterparty": "Northwind"})
    assert shaped.status == 200


def test_the_shape_rule_has_exactly_one_implementation():
    """Hard constraint: a rule with two copies is a rule that drifts.

    The doorway's stated central vulnerability is two copies of one rule
    disagreeing. `refuse_structured` is the copy; everything else imports it.
    """
    doorway = Path(__file__).parent
    restated = []
    for path in sorted(doorway.glob("*.py")):
        if path.name.startswith("test_") or path.name == "writes.py":
            continue
        source = path.read_text(encoding="utf-8")
        # The isinstance test itself, in either argument order, outside the one
        # module entitled to spell it.
        if re.search(r"isinstance\([^)]*,\s*\(?\s*(dict|list)\s*,\s*(list|dict)\s*\)?\s*\)",
                     source):
            restated.append(path.name)
    assert restated == [], (
        f"{restated} restates the dict/list shape test instead of importing "
        f"writes.refuse_structured")


# ── 8. required_if adds a condition; it never removes one ───────────────────


def test_a_required_field_stays_required_alongside_a_condition():
    """Defect B7. `required_if` used to OVERWRITE `required`, so a field
    declared both became optional whenever the condition was false. No live
    effect today — the one field using it declares required=False — but the two
    read as though they compose, and the next conditional field would inherit
    the trap."""
    both = Write(sql="", rule="",
                 fields=(Field("note", required=True, required_if=("decision", "reject")),))

    with pytest.raises(Missing):
        both.bind({"decision": "approve"})       # condition false, still required
    with pytest.raises(Missing):
        both.bind({"decision": "reject"})        # condition true, still required
    both.bind({"decision": "approve", "note": "n"})


def test_a_conditional_only_field_is_demanded_only_when_the_condition_holds():
    """The other half: required=False plus required_if still composes correctly,
    which is the live case in the write table."""
    conditional = Write(sql="", rule="",
                        fields=(Field("note", required=False,
                                      required_if=("decision", "reject")),))

    conditional.bind({"decision": "approve"})    # not demanded
    with pytest.raises(Missing):
        conditional.bind({"decision": "reject"})  # demanded


# ── 9. The governed acts (D-5, NC-21/22/23): the boundary both ways ─────────


def test_retention_destruction_is_refused_to_legal_admin(people, db: Database):
    """U9 (0022) MOVED the authority to the administrator — revoked from
    legal_admin, never shared. The refusal lands before any happy path, per
    NC-21: destruction is irreversible and a wrong endpoint is worse than no
    endpoint. This guards the revocation itself."""
    shaped = answer(db, LEGAL_ADMIN, "POST /retention/destroy",
                    BODIES["POST /retention/destroy"])
    assert shaped.refused, "legal_admin was allowed to reach the destroy function"
    assert shaped.status == 403, (
        f"the refusal should be the grant's (403), not a merits argument: "
        f"{shaped.status} {shaped.body!r}")


def test_purge_is_the_administrators_and_undelegable(people, db: Database):
    """U12: redaction is delegable, the purge is not. legal_admin holds a
    redaction grant (behind a live delegation) and must still be refused the
    purge outright."""
    shaped = answer(db, LEGAL_ADMIN, "POST /agreements/purge",
                    BODIES["POST /agreements/purge"])
    assert shaped.refused
    assert shaped.status == 403, f"{shaped.status} {shaped.body!r}"


def test_the_librarys_acting_half_is_legal_admins_alone(people, db: Database):
    """The administrator is content-visible and content-POWERLESS (U5). Every
    content-side act refuses the role that runs the machine — the boundary
    from the other direction than the viewer sweep above."""
    for key in ("POST /library/retire", "POST /library/supersede",
                "POST /rules", "POST /rules/retire",
                "POST /concessions/promote", "POST /ladders/floor",
                "POST /ladders/publish", "POST /holds/release"):
        shaped = answer(db, ADMINISTRATOR, key, BODIES[key])
        assert shaped.refused, f"{key} let the administrator act on content"
        assert shaped.body.get("kind") != "rejected", (
            f"{key} refused the administrator for a missing field, proving "
            f"nothing about the boundary: {shaped.body!r}")


def test_releasing_a_hold_binds_the_actor_and_lands_on_the_chain(people, db: Database):
    """The release columns come from the session by trigger, whatever the
    statement proposes — and the act is on the chain under the right name."""
    run(db, REQUESTER, "POST /deals",
        {"agreement_id": "AG-H", "counterparty": "Northwind"})
    opened = run(db, LEGAL_ADMIN, "POST /holds",
                 {"agreement_id": "AG-H", "matter_ref": "M-77"})
    hold_id = opened[0]["hold_id"]

    released = run(db, LEGAL_ADMIN, "POST /holds/release",
                   {"hold_id": hold_id, "released_by": "someone@else"})
    assert released[0]["released_by"] == LEGAL_ADMIN.person, (
        "the release must name the session, whatever a body smuggles")

    events = [r for r in chain(db) if r["event_type"] == "legal_hold_released"]
    assert events, "the release never reached the audit chain"
    assert events[0]["actor"] == LEGAL_ADMIN.person

    again = answer(db, LEGAL_ADMIN, "POST /holds/release", {"hold_id": hold_id})
    assert again.status == 409, (
        f"releasing a released hold must be the honest changed-nothing 409, "
        f"got {again.status} {again.body!r}")


def test_a_delegation_is_a_recorded_revocable_act(people, db: Database):
    """U12's delegation: the administrator grants it, the administrator revokes
    it, both under the session's name — and Legal cannot arrange its own."""
    granted = run(db, ADMINISTRATOR, "POST /records-delegates",
                  {"person": "leah@clausewerk",
                   "reason": "records officer this quarter"})
    assert granted[0]["granted_by"] == ADMINISTRATOR.person

    revoked = run(db, ADMINISTRATOR, "POST /records-delegates/revoke",
                  {"person": "leah@clausewerk"})
    assert revoked[0]["revoked_by"] == ADMINISTRATOR.person

    shaped = answer(db, LEGAL_ADMIN, "POST /records-delegates",
                    {"person": "leah@clausewerk", "reason": "self-arranged cover"})
    assert shaped.refused, "legal_admin arranged its own redaction delegation"
