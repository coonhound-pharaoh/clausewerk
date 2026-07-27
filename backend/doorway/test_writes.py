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

JAVASCRIPT_MUTATIONS = Path(__file__).resolve().parents[1] / "service" / "mutations.mjs"

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


# ── 1. The port carried the JavaScript across unchanged ─────────────────────


def javascript_writes() -> dict[str, str]:
    """The write endpoints as the JavaScript service declares them."""
    source = JAVASCRIPT_MUTATIONS.read_text(encoding="utf-8")
    found = re.findall(r"'(POST [^']+)':\s*\{.*?`([^`]*)`", source, flags=re.S)
    assert found, (
        f"no write endpoints could be read out of {JAVASCRIPT_MUTATIONS.name}; the "
        "comparison tests below would pass while comparing nothing"
    )
    return dict(found)


def canonical(sql: str) -> str:
    """Whitespace collapsed, and spacing around punctuation made uniform.

    The two files lay their statements out differently — `$1,$2` against
    `%(a)s, %(b)s`. What must not differ is a table, a column or a keyword.
    """
    squashed = " ".join(sql.split())
    return re.sub(r"\s*([(),])\s*", r"\1", squashed)


def javascript_translated(key: str) -> str:
    """The JavaScript's statement with `$1, $2 …` replaced by the field names the
    Python binds in those positions.

    This is the comparison that matters most in the whole file. It proves the
    statements agree AND that the Python's declared field order matches the
    numbering the JavaScript relies on — the two ways this port could go wrong
    silently.
    """
    names = [spec.name for spec in WRITES[key].fields]
    sql = javascript_writes()[key]

    def substitute(match: re.Match) -> str:
        index = int(match.group(1)) - 1
        assert index < len(names), (
            f"{key} uses ${match.group(1)} in the JavaScript but the Python "
            f"declares only {len(names)} field(s): {names}"
        )
        return f"%({names[index]})s"

    return re.sub(r"\$(\d+)", substitute, sql)


def test_every_javascript_write_exists_in_python():
    missing = sorted(set(javascript_writes()) - set(WRITES))
    assert not missing, f"{len(missing)} write endpoint(s) were not ported: {missing}"


def test_python_invented_no_write_the_javascript_does_not_have():
    invented = sorted(set(WRITES) - set(javascript_writes()))
    assert not invented, f"write endpoint(s) added during the port: {invented}"


def test_the_port_carried_all_twenty_seven():
    assert len(WRITES) == 27, (
        f"{len(WRITES)} writes are registered; the JavaScript service has 27"
    )


@pytest.mark.parametrize("key", sorted(javascript_writes()))
def test_each_statement_matches_the_javascript(key: str):
    assert canonical(WRITES[key].sql) == canonical(javascript_translated(key)), (
        f"{key} does not run the statement the JavaScript runs, or binds its "
        "fields in a different order. Either is a change made during a port."
    )


@pytest.mark.parametrize("key", sorted(WRITES))
def test_every_write_names_the_rule_it_defers_to(key: str):
    rule = WRITES[key].rule
    assert rule and rule.strip(), f"{key} names no governing rule"
    assert "cw." in rule or "execute on" in rule, (
        f"{key} names its rule as {rule!r}, which points at nothing in the database"
    )


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
