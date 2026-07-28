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
    NEVER_FROM_THE_BODY, WRITES, Missing, NoSuchWrite, answer, run,
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


@pytest.mark.parametrize("key", sorted(WRITES))
def test_any_recorded_actor_comes_from_the_connection(key: str):
    """Where a statement writes a name into a column, that name is
    `current_setting('cw.actor')` and nothing else."""
    sql = WRITES[key].sql
    for column in ("created_by", "opened_by", "added_by", "removed_by",
                   "revoked_by", "decided_by", "approved_by", "approver",
                   "requester", "acted_by"):
        for assigned in re.findall(rf"{column}\s*=\s*([^\s,]+)", sql):
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
