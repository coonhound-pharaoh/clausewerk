"""The assembly run, as an endpoint. Nothing is stored yet — deliberately.

WHAT THIS FILE IS

`manifests.py` connected the trust boundary; this connects the engine itself.
A manifest arrives, the library is read AS THE CALLER, the engine resolves it
against a pinned snapshot and validates it against the rules in force, and the
engine's own answer comes back out.

AND THEN IT IS RECORDED — ALL OF IT, OR NONE OF IT

Snapshot, rule set, run, decisions and findings all land inside the ONE
transaction the caller's connection opened. A run is eight tables' worth of
rows and exactly one fact; a partial failure rolls the whole thing back,
because the run tables have no DELETE grant and a half-written run could never
be tidied up afterwards.

The request shape was fixed by the package that introduced this route and did
not change when persistence arrived. Only the answer changed: it now carries a
run_id and says `"recorded": true`.

WHAT IS ADAPTED, AND WHICH WAY ROUND

The engine is not modified — the same rule manifests.py states. Three
corrections carried over from the plan that wrote this, each settled by reading
the source rather than by remembering it:

  · the engine's rule query reads `cw.active_conflict_rule`, not
    `cw.conflict_rule` (engine/loader.py RULE_SQL)
  · the loader's public snapshot entry is `build_snapshot`, and it takes clause
    rows and ladder rows, not a connection
  · `cw.run.engine_version` is NOT NULL with no default and is absent from the
    plan's insert list — so the package that persists must supply it

WHY EVERY CALL IS RECORDED BEFORE THE ENGINE IS CONSULTED

The attempt row is the FIRST statement inside the transaction, and that
ordering is the whole permission model of this endpoint. `cw.audit` is plain
SQL and not SECURITY DEFINER, and INSERT on cw.audit_event is granted to the
requester, the two Legal roles and the administrator — so a viewer and an
auditor are refused HERE, by the database, in its own words, before an engine
answer exists to leak. It is manifests.py's uniformity argument, one layer
further in; that file makes the case in full and it is not restated here.

NOTHING IN THIS FILE TESTS, BRANCHES ON OR MENTIONS A ROLE

Every refusal below comes out of the database through the caller's own
connection and is passed back unchanged. That includes the ones that are
surprising: an administrator is refused this endpoint at the RULE CATALOGUE.
That role may write to the audit chain, and since owner decision U11
(0022_owner_decisions_u9_u11.sql:24-31) it may read the clause library and the
ladders too — but not cw.active_conflict_rule, which is still granted to five
roles and not to it (0004_conflict_rules.sql:237-238). The loader asks for
clauses, then ladders, then rules, so the refusal lands on the third query and
still lands before the engine is consulted.

The endpoint does not know any of that and must never learn it. It asks the
database for the library through the caller's own connection and hands back
what comes out, refusal included.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

import psycopg

from doorway import manifests
from doorway.manifests import DROPPED_WITHOUT_REASON
from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify
from doorway.writes import WrongShape, refuse_structured
from engine import docx, loader
from engine import run as engine_run
from engine.manifest import UnknownCategory, check_manifest
from engine.model import ENGINE_VERSION
from engine.resolution import resolve
from engine.validation import validate

# The three the database's own check constraint on cw.run.manifest_source
# permits. Named here so the boundary check and the constraint say the same
# thing, and so a fourth is a visible act.
SOURCES = ("llm", "fallback", "manual")


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def run(db: Database, caller: Caller, body: dict | None) -> Answer:
    """Assemble a contract and report what the engine made of it.

    The order below is load-bearing and is the specification of this endpoint:
    boundary checks, then the attempt row, then the library, then the engine.
    """
    body = body or {}

    # ── The boundary, before anything is opened ─────────────────────────────
    #
    # Both checks are about SHAPE. Neither is about permission: a field being
    # present and well formed is a different question from whether this person
    # may use it, and the second question is the database's alone.

    agreement_id = body.get("agreement_id")
    if not isinstance(agreement_id, str) or not agreement_id.strip():
        # REQUIRED FROM THIS PACKAGE ONWARDS, even though nothing is stored
        # yet, so that the request contract is fixed by the package that
        # introduces the route — no test, script or screen written against it
        # breaks when persistence lands.
        #
        # THIS CHECKS PRESENCE ONLY. Whose deal this names is a rule that
        # belongs in the database, and putting it here would make an endpoint
        # decide who may act — the one thing this layer never does.
        return Answer(400, {
            "error": "refused",
            "reason": "name the deal this run belongs to (agreement_id)",
            "kind": "rejected"})
    agreement_id = agreement_id.strip()

    try:
        manifest = manifests.manifest_from(body)
    except manifests.Malformed as wrong:
        return Answer(400, {"error": "refused", "reason": str(wrong),
                            "kind": "rejected"})

    # `value` is the one manifest field that travels unconverted from the body
    # into cw.run.value, a text column, and a dict there reaches psycopg as a
    # bind parameter — B1's 500 exactly.
    #
    # Guarded HERE and not in manifests.manifest_from, for the same reason
    # manifest_source is checked here: POST /manifests/check is a pre-flight
    # over anything a model might emit, it never binds `value` to the driver,
    # and narrowing manifest_from would silently change that endpoint. See the
    # note below, which made this call once already.
    try:
        refuse_structured("value", manifest.value)
    except WrongShape as wrong:
        return Answer(400, {"error": "refused", "reason": str(wrong),
                            "kind": "rejected"})

    if manifest.source not in SOURCES:
        # cw.run.manifest_source carries a check constraint naming exactly
        # these three. Left to the database, a bad source arrives as a late
        # IntegrityError, which refusals.classify would label
        # 'refused_on_merits' — telling somebody their contract was rejected
        # when they simply mistyped a field name. It is a 400, and it says
        # which field.
        #
        # manifests.manifest_from is NOT tightened to match: POST
        # /manifests/check is a pre-flight over anything a model might emit,
        # and narrowing it here would silently change that endpoint.
        return Answer(400, {
            "error": "refused",
            "reason": "manifest_source must be one of 'llm', 'fallback' or 'manual'",
            "kind": "rejected"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            # ── The attempt, first ──────────────────────────────────────────
            _record(request, agreement_id, manifest, "run_attempted",
                    "the manifest reached the engine")

            categories = manifests.categories_for(request)

            try:
                checked = check_manifest(manifest, categories)
            except UnknownCategory as refused_outright:
                _record(request, agreement_id, manifest, "run_refused",
                        str(refused_outright))
                return Answer(409, {
                    "error": "refused", "reason": str(refused_outright),
                    "kind": "unknown_category", "dropped": []})

            if checked.dropped:
                # The pre-flight and the enforcement must refuse IDENTICALLY,
                # so the sentence is asked for the same way manifests.check
                # asks for it — one category at a time, from the engine.
                reasons = []
                for risk in checked.dropped:
                    try:
                        categories.key_for(risk.category)
                    except UnknownCategory as unknown:
                        reasons.append(str(unknown))
                # Guarded for the same reason as the identical site in
                # manifests.check: reasons is non-empty only by a coupling to
                # the engine's single drop condition, and an IndexError here
                # would answer "the service failed" on the refusal-explaining
                # path itself.
                first = reasons[0] if reasons else DROPPED_WITHOUT_REASON
                _record(request, agreement_id, manifest, "run_refused", first)
                return Answer(409, {
                    "error": "refused",
                    "reason": first,
                    "kind": "unknown_category",
                    "dropped": [risk.category for risk in checked.dropped],
                    "reasons": reasons,
                })

            # ── The library, as the caller ──────────────────────────────────
            #
            # The queries are the ENGINE'S OWN. Retyping them here would put a
            # second definition of "what the library is" in a second file, and
            # the two would drift on the first schema change.
            snapshot = loader.build_snapshot(
                request.rows(loader.CLAUSE_SQL),
                request.rows(loader.LADDER_SQL))
            ruleset = loader.build_ruleset(request.rows(loader.RULE_SQL))

            resolution = resolve(checked, snapshot)
            validation = validate(resolution.decisions, ruleset)

            # ── The record ──────────────────────────────────────────────────
            #
            # ALL OF IT INSIDE THE ONE TRANSACTION THIS `with` OPENED. A run
            # is eight tables' worth of rows and it is one fact: a half-written
            # run in tables that have no DELETE grant could never be tidied up.
            # NOT a content hash, deliberately. cw.run.run_id is a text primary
            # key with no default (0005:80), so the server supplies it — and a
            # hash of the inputs would make two runs of an unchanged manifest
            # against an unchanged library collide, which is exactly the case
            # somebody re-running a check produces.
            run_id = uuid.uuid4().hex
            try:
                snapshot_tables = engine_run.snapshot_rows(snapshot, categories)
            except ValueError as would_not_rebuild:
                # A ladder hashed into the snapshot's fingerprint with no row
                # to be stored in — engine/run.py says so itself. Unhandled
                # this is a 500 with a stack trace, which would report "we
                # broke" for a library that genuinely cannot be pinned.
                _record(request, agreement_id, manifest, "run_refused",
                        str(would_not_rebuild))
                return Answer(409, {
                    "error": "refused", "reason": str(would_not_rebuild),
                    "kind": "refused_on_merits"})

            _store(request, run_id, snapshot_tables,
                   engine_run.ruleset_rows(ruleset),
                   engine_run.run_rows(
                       run_id, checked, resolution, validation, categories,
                       created_by=caller.person,
                       agreement_id=agreement_id,
                       engine_version=ENGINE_VERSION,
                       authored_chars=0,
                       ai_origin_chars=_ai_origin_chars(checked, resolution)))

    except psycopg.Error as error:
        database_said: Refused = classify(error)
        return Answer(database_said.status, database_said.as_body())

    return Answer(200, {
        "run_id": run_id,
        "vendor": checked.vendor,
        "agreement_id": agreement_id,
        "snapshot_id": resolution.snapshot_id,
        "ruleset_id": validation.ruleset_id,
        "result_hash": resolution.result_hash,
        "gate_open": validation.gate_open,
        # HOW MANY RULES WERE CONSULTED, and zero must read as zero. A run
        # against an empty rule catalogue is not a clean run; it is an
        # unchecked one, and the difference has to be visible on the screen.
        "rules_consulted": len(ruleset.rules),
        "decisions": [_decision(d) for d in resolution.decisions],
        "findings": [
            {"rule": f.rule, "rule_version": f.rule_version,
             "severity": f.severity, "title": f.title, "detail": f.detail,
             "refs": list(f.refs)}
            for f in validation.findings],
        "dropped": [],
        "coerced": [{"category": risk.category, "claimed": risk.severity}
                    for risk in checked.coerced],
        "unresolved": sum(1 for d in resolution.decisions if d.unresolved),
        # The run is on the record. A screen must be able to tell a preview
        # from a record without reading this file.
        "recorded": True,
    })


def _insert(request, table: str, rows: list[dict], *, shared: bool = False) -> None:
    """One table's worth of engine output, with nothing edited by hand.

    The column names and the values are the engine's own. db.Request exposes no
    executemany (deliberately — it is a thin thing), so the loop is written out.

    `shared` marks a CONTENT-ADDRESSED table, where an identical row already
    being present is the expected outcome rather than a fault. See _store.
    """
    for row in rows:
        columns = list(row)
        placeholders = ", ".join(f"%({name})s" for name in columns)
        request.write(
            f"insert into cw.{table} ({', '.join(columns)}) "
            f"values ({placeholders})"
            + (" on conflict do nothing" if shared else ""), row)


def _store(request, run_id: str, snapshot_tables: dict, ruleset_tables: dict,
           run_tables: dict) -> None:
    """Everything a run is, in the order the foreign keys require.

    ── IDEMPOTENCY: ONE RULE, ON FIVE TABLES ────────────────────────────────

    cw.snapshot and cw.ruleset are CONTENT-ADDRESSED: their primary key is a
    hash of what they contain (0005:64-76). A second run against an unchanged
    library re-derives the same id, so a naive insert takes a unique violation
    — which refusals.classify turns into a 409 'refused on its merits'. That
    would tell somebody their contract was rejected because nothing about the
    library had changed since lunchtime.

    The rule is `on conflict do nothing`, on ALL FIVE shared tables.

    NOT on the two parents only, which was the obvious answer and does not
    work: it moves the collision one table along rather than removing it. The
    second writer's parent insert becomes a no-op, and its very next statement
    writes a snapshot_member row the first writer already wrote — the same
    unique violation, reported as the same false refusal.

    The member tables can carry the clause, and their own keys are why. Each is
    keyed on the content-addressed parent plus the content — cw.snapshot_member
    on (snapshot_id, clause_id, version), cw.snapshot_ladder_rung on
    (snapshot_id, category_key, severity, rung), cw.ruleset_member on
    (ruleset_id, rule_id, version). Identical parent id means identical
    members; that is what content-addressing MEANS. A conflict on any of them
    is therefore a row identical to the one being written, and doing nothing is
    the correct answer rather than a shrug.

    AND NO READ-THEN-SKIP GUARD, deliberately. Checking whether the snapshot is
    already there and skipping the block would be a second rule saying the same
    thing — and a weaker one, because a read followed by a write is a race: two
    concurrent FIRST runs against a brand-new library would both see nothing,
    both insert, and the loser would hit the very violation the check was for.
    One rule that is always right beats two that are right separately.
    """
    _insert(request, "snapshot", snapshot_tables["snapshot"], shared=True)
    _insert(request, "snapshot_member", snapshot_tables["snapshot_member"],
            shared=True)
    _insert(request, "snapshot_ladder_rung",
            snapshot_tables["snapshot_ladder_rung"], shared=True)

    _insert(request, "ruleset", ruleset_tables["ruleset"], shared=True)
    _insert(request, "ruleset_member", ruleset_tables["ruleset_member"],
            shared=True)

    # cw.run's insert fires cw.audit_run(), which writes run_recorded to the
    # chain. A caller with no audit grant is refused there, and that is the
    # correct answer rather than a problem to route around.
    _insert(request, "run", run_tables["run"])
    _insert(request, "run_decision", run_tables["run_decision"])
    _insert(request, "run_finding", run_tables["run_finding"])


def _ai_origin_chars(manifest, resolution) -> int:
    """ADR-0010's second provenance figure, counted honestly.

    ── WHY THE HEADLINE FIGURE IS NOT COUNTED HERE ──────────────────────────

    engine.docx.provenance_counts would give both numbers, but it requires an
    explicit `structural` list of build_docx's OWN literal strings — and the
    only thing in the repository that builds one is test code. Having the
    doorway build it would put a second copy of the document's vocabulary in a
    second file, which is the drift this system has paid for repeatedly.

    So `ai_origin_chars` is counted for real (ai_originated_characters needs no
    structural list), and `authored_chars` is recorded as 0 BY CONSTRUCTION —
    justified by the engine's own standing assertion that build_docx emits no
    authored characters, not by not having looked.

    Both alternatives are live and either costs one function and no migration:
      A · duplicate the structural vocabulary here and count both figures
      B · record both as zero, which engine/run.py:214-219 blesses only for a
          run that emitted no document — and this one did emit one, in memory

    ON THE DOCUMENT DATE. build_docx stamps `Dated: <today>` from
    `today or date.today()` (docx.py:113-123), so this build is date-dependent
    — and it takes the default deliberately. ai_originated_characters matches
    whole paragraphs against AI-drafted clause BODIES (docx.py:390-400), and
    the date paragraph is never one, so the stamp cannot move the number. These
    bytes are discarded and never compared with anything. The endpoint that
    returns bytes to a caller does NOT take the default; it passes the date
    from cw.run.created_at, so a run's paper is byte-stable forever.
    """
    data = docx.build_docx(manifest, resolution)
    return docx.ai_originated_characters(
        data, [d.selected for d in resolution.decisions if d.selected])


def _decision(decision) -> dict:
    """One decision, in the shape cw.run_contract reports them."""
    selected = decision.selected
    return {
        "category": decision.risk.category,
        "severity": decision.risk.severity,
        "reason": decision.reason,
        "baseline": decision.baseline,
        "clause_id": selected.clause_id if selected else None,
        "version": selected.version if selected else None,
        "title": selected.title if selected else None,
        "body": selected.body if selected else None,
        "warning": decision.warning,
        "suppressed": [clause.ref for clause in decision.suppressed],
    }


def _record(request, agreement_id: str, manifest, event: str, reason: str) -> None:
    """Write the attempt, or the refusal, into the chain.

    THE VOCABULARY HERE IS PERMANENT. cw.audit_event has no UPDATE and no
    DELETE grant for any role, so 'run_attempted' and 'run_refused' cannot be
    renamed later without leaving the chain speaking two languages about the
    same act. They are fixed in this package on purpose.

    'run_recorded' is deliberately NOT among them: cw.audit_run() already emits
    it on insert into cw.run. An endpoint copy would put two entries per act
    into an append-only chain, free to disagree forever.

    Attribution is structural, as everywhere else — cw.audit reads the actor
    off the connection and there is nowhere here to put a different name.
    """
    request.write(
        # Bound, not interpolated. `event` is a module-local literal at every
        # call site, so nothing a caller sends reaches it — but db.py spends ten
        # lines explaining why even a role name from a fixed internal map is
        # composed safely, and these three writers were the one exception, on
        # the one table with no UPDATE and no DELETE.
        "select cw.audit(%(event)s, %(agreement_id)s, %(payload)s::jsonb)",
        {
            "event": event,
            "agreement_id": agreement_id,
            "payload": json.dumps({
                "reason": reason,
                "vendor": manifest.vendor,
                "agreement_id": agreement_id,
                "risks_submitted": len(manifest.risks),
                "source": manifest.source,
                "checked_by": "engine.resolution.resolve",
            }),
        },
    )
