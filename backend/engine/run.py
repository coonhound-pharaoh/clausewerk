"""Recording a run, and proving it can be reproduced.

`loader` is the read side — registry rows to a snapshot. This is the write side
— a resolution and its findings to rows.

The pair matters more than either half. A snapshot's id is a hash of its
contents, and `selectable` depends on the clock, so the hash **cannot be
recomputed from the live registry later**: tomorrow's registry is a different
library. Storing the id alone would name a thing nobody can rebuild.

So `snapshot_rows` writes out the membership, and `snapshot_from_rows` reads it
back. `test_run.py` closes the loop by rebuilding a stored snapshot and checking
the id still matches — which is the reproducibility guarantee actually being
tested rather than asserted.

Every function that crosses to or from storage takes a `CategoryMap`, because
storage speaks category *keys* and the engine speaks category *labels*. The
translation is not cosmetic: the label is inside the snapshot fingerprint, so
reading a key back where a label belongs changes the id and a stored run stops
reproducing. `db/test/writer-sql.test.mjs` drives exactly these rows into the
real migrated schema and back, so neither direction can drift unnoticed.
"""

from __future__ import annotations

import json
from typing import Any, Iterable, Mapping, Optional

from .manifest import CategoryMap
from .model import ENGINE_VERSION, LEGAL_AUTHORED, Clause, Ladder, Manifest, Resolution
from .snapshot import Snapshot
from .validation import RuleSet, ValidationResult


class SnapshotIncomplete(Exception):
    """A stored snapshot names a clause version the caller did not supply.

    Its own type rather than ValueError, because the caller's sensible response
    is specific: go and fetch the rest of the library, or accept that this run
    is not reproducible right now — never carry on with what arrived.
    """


# ── Ladder status, derived rather than stored ──────────────────────────────


def ladder_status(
    rung_rows: Iterable[Mapping[str, Any]],
    selectable: Mapping[tuple[str, int], bool],
) -> str:
    """Rebuild a ladder's health from the rows a snapshot already holds.

    A ladder's `status` is inside the snapshot fingerprint, because resolution
    refuses to descend anything that is not `intact` — two libraries differing
    only in ladder status negotiate differently, so an id that ignored it would
    assert sameness about libraries that behave differently.

    It does not need a column. `cw.ladder_health` computes status from exactly
    three things: how many rungs there are, which rung is the floor, and whether
    each rung's clause is selectable. The first two are in
    `cw.snapshot_ladder_rung` and the third is the frozen flag in
    `cw.snapshot_member`. So the status a run was taken under is recoverable
    from what is already stored — and, unlike a stored column, it cannot
    contradict its own rungs.

    The precedence order below mirrors `0003_ladders_and_concessions.sql:88-98`
    exactly. That is a Python re-implementation of a SQL view and it is free to
    drift, which is why `db/test/writer-sql.test.mjs` asserts the two agree
    against the real view rather than trusting this comment.
    """
    rows = list(rung_rows)
    if not rows:
        return "empty"

    def usable(r: Mapping[str, Any]) -> bool:
        key = (r["clause_id"], int(r["version"]))
        if key not in selectable:
            # Loudly, not by defaulting. A rung whose clause is not in the
            # snapshot means the stored rows disagree with each other, and
            # guessing would surface later as an unexplained id mismatch.
            raise ValueError(
                f"snapshot rung {key[0]}@v{key[1]} is not a member of this "
                f"snapshot — the stored rows are inconsistent and the ladder's "
                f"status cannot be recovered")
        return bool(selectable[key])

    if not any(r.get("is_floor") for r in rows):
        return "floorless"
    if any(r.get("is_floor") and not usable(r) for r in rows):
        return "floor_unusable"
    if any(not usable(r) for r in rows):
        return "degraded"
    return "intact"


# ── Write side ─────────────────────────────────────────────────────────────


def snapshot_rows(
    snapshot: Snapshot, categories: CategoryMap
) -> dict[str, list[dict[str, Any]]]:
    """Everything needed to rebuild this snapshot, minus the clause bodies —
    those live immutably in cw.clause_version and a reference suffices."""
    members = [
        {"snapshot_id": snapshot.snapshot_id, "clause_id": c.clause_id,
         "version": c.version, "selectable": c.selectable}
        for c in snapshot.clauses
    ]
    rungs: list[dict[str, Any]] = []
    for ladder in snapshot.ladders:
        if not ladder.rungs:
            # A rungless ladder is hashed into the snapshot id but has no row to
            # be stored in, so it would vanish on the way to the database and
            # the rebuild would silently produce a different id. It cannot reach
            # here from the registry — LADDER_SQL inner-joins cw.ladder_rung, so
            # cw.ladder_health's 'empty' ladders are dropped before a snapshot
            # is ever built — which is why refusing is cheap and losing it
            # quietly is not.
            raise ValueError(
                f"ladder {ladder.category}/{ladder.severity} has no rungs — it "
                f"is part of the snapshot fingerprint but cannot be stored, so "
                f"the snapshot would not rebuild")
        for rung, ref in enumerate(ladder.rungs):
            clause_id, _, version = ref.partition("@v")
            rungs.append({
                "snapshot_id": snapshot.snapshot_id,
                # The KEY, not the label: cw.snapshot_ladder_rung.category_key
                # has an FK to cw.category(key).
                "category_key": categories.key_for(ladder.category),
                "severity": ladder.severity,
                "rung": rung,
                "clause_id": clause_id,
                "version": int(version),
                "is_floor": rung == ladder.floor_rung,
            })
    return {
        "snapshot": [{"snapshot_id": snapshot.snapshot_id,
                      "taken_on": snapshot.taken_on}],
        "snapshot_member": members,
        "snapshot_ladder_rung": rungs,
    }


def ruleset_rows(ruleset: RuleSet) -> dict[str, list[dict[str, Any]]]:
    return {
        "ruleset": [{"ruleset_id": ruleset.ruleset_id}],
        "ruleset_member": [
            {"ruleset_id": ruleset.ruleset_id, "rule_id": r.rule_id, "version": r.version}
            for r in ruleset.rules
        ],
    }


def run_rows(
    run_id: str,
    manifest: Manifest,
    resolution: Resolution,
    validation: ValidationResult,
    categories: CategoryMap,
    *,
    created_by: str,
    agreement_id: Optional[str] = None,
    override_ref: Optional[str] = None,
    engine_version: str = ENGINE_VERSION,
    authored_chars: int = 0,
    ai_origin_chars: int = 0,
) -> dict[str, list[dict[str, Any]]]:
    run = {
        "run_id": run_id,
        "agreement_id": agreement_id,
        "vendor": manifest.vendor,
        "value": manifest.value,
        "manifest": json.dumps({
            "vendor": manifest.vendor,
            "value": manifest.value,
            "source": manifest.source,
            "risks": [
                {"category": r.category, "severity": r.severity,
                 "justification": r.justification}
                for r in manifest.risks
            ],
            # Recorded here rather than in cw.run_decision, and not by accident:
            # run_decision.category_key has an FK to cw.category, and a dropped
            # category is by definition not in cw.category. It could not be
            # stored there without weakening the very constraint that makes a
            # decision's category trustworthy. The manifest column holds what
            # the model said; this is the part of what it said that we refused.
            "dropped": [
                {"category": r.category, "severity": r.severity,
                 "justification": r.justification, "reason": "unknown category"}
                for r in manifest.dropped
            ],
            # The severities the boundary rewrote, with the ORIGINAL claim.
            # Without this, every Standard in `risks` reads as though the
            # model chose it — and a downgrade nobody can see is a judgement
            # nobody made.
            "coerced": [
                {"category": r.category, "claimed": r.severity,
                 "recorded": "Standard", "reason": "unrecognised severity"}
                for r in manifest.coerced
            ],
        }),
        "manifest_source": manifest.source,
        "snapshot_id": resolution.snapshot_id,
        "ruleset_id": validation.ruleset_id,
        "result_hash": resolution.result_hash,
        # WP-32. The hash above is only meaningful alongside the code that
        # produced it: three packages have changed how it is computed, and a
        # stored hash that no longer reproduces is indistinguishable from a
        # tampered one unless the record says which engine wrote it.
        "engine_version": engine_version,
        # The two provenance figures, for the SYSTEM RECORD only — neither is
        # printed on the contract document (owner decision, 2026-07-25).
        # `authored_chars` is the headline claim, counted; `ai_origin_chars` is
        # ADR-0010's second number. Both default to zero because a run that
        # emitted no document has nothing to count, not because zero is assumed.
        "authored_chars": authored_chars,
        "ai_origin_chars": ai_origin_chars,
        "gate_open": validation.gate_open,
        "overridden": validation.overridden,
        "override_ref": override_ref,
        "created_by": created_by,
    }

    decisions = []
    for seq, d in enumerate(resolution.decisions):
        decisions.append({
            "run_id": run_id,
            "seq": seq,
            "category_key": categories.key_for(d.risk.category),
            "severity": d.risk.severity,
            "justification": d.risk.justification,
            "clause_id": d.selected.clause_id if d.selected else None,
            "version": d.selected.version if d.selected else None,
            "reason": d.reason,
            "baseline": d.baseline,
            "expired_only": d.expired_only,
            "warning": d.warning,
            "suppressed": [c.ref for c in d.suppressed],
        })

    findings = []
    for seq, f in enumerate(validation.findings):
        rule_id, _, version = f.rule_version.partition("@v")
        findings.append({
            "run_id": run_id,
            "seq": seq,
            "rule_id": rule_id,
            "rule_version": int(version),
            "severity": f.severity,
            "title": f.title,
            "detail": f.detail,
            "refs": list(f.refs),
        })

    return {"run": [run], "run_decision": decisions, "run_finding": findings}


# ── Read side ──────────────────────────────────────────────────────────────


def snapshot_from_rows(
    member_rows: Iterable[Mapping[str, Any]],
    clause_rows: Iterable[Mapping[str, Any]],
    ladder_rung_rows: Iterable[Mapping[str, Any]] = (),
    taken_on=None,
    *,
    categories: CategoryMap,
) -> Snapshot:
    """Rebuild a stored snapshot.

    `member_rows` supply the frozen `selectable` flags; `clause_rows` supply the
    immutable content by reference. The two are joined on (clause_id, version),
    so a clause that has since been retired still rebuilds exactly as it was.

    Raises `SnapshotIncomplete` if a stored member has no clause row. That used
    to be silent (WP-24, finding E8): the member was skipped, a smaller snapshot
    was built, and it hashed to a different id — so a caller was handed a
    *different library* under the name of the one they asked for, and found out
    only if they happened to compare ids. cw.clause_version is immutable and
    never deleted, so a missing row is not an ordinary condition to tolerate; it
    means the query that fetched the clauses did not fetch all of them, or the
    library it was fetched from is not the one the snapshot was taken against.
    Either way the honest answer is "I cannot rebuild this", not a quiet
    approximation of it.
    """
    frozen = {(m["clause_id"], int(m["version"])): bool(m["selectable"]) for m in member_rows}
    seen: set[tuple[str, int]] = set()

    clauses = []
    for row in clause_rows:
        key = (row["clause_id"], int(row["version"]))
        if key in frozen:
            seen.add(key)
        if key not in frozen:
            continue  # not part of this snapshot
        clauses.append(Clause(
            clause_id=row["clause_id"],
            version=int(row["version"]),
            category=row["category"],
            severity=row["severity"],
            title=row["title"],
            body=row["body"],
            state=row.get("state", "active"),
            selectable=frozen[key],          # the frozen flag wins, not today's
            always_include=bool(row.get("always_include", False)),
            framework_section=row.get("framework_section"),
            provenance_gap=bool(row.get("provenance_gap", False)),
            # Read back but NOT hashed (S0-4). It rides along so a rebuilt
            # snapshot can answer "which of these began as an AI draft?"; it
            # cannot move the snapshot id, and test_run.py pins that id to make
            # sure it never starts to.
            origin=row.get("origin") or LEGAL_AUTHORED,
            tags=tuple(row.get("tags") or ()),
        ))

    missing = sorted(frozen.keys() - seen)
    if missing:
        raise SnapshotIncomplete(
            "cannot rebuild the snapshot: "
            + ", ".join(f"{cid}@v{v}" for cid, v in missing)
            + " are stored members with no clause row. Rebuilding without them "
              "would silently produce a different library under the same name."
        )

    by_ladder: dict[tuple[str, str], list[Mapping[str, Any]]] = {}
    for r in ladder_rung_rows:
        by_ladder.setdefault((r["category_key"], r["severity"]), []).append(r)

    ladders = []
    for (category_key, severity), rows in by_ladder.items():
        rows = sorted(rows, key=lambda r: int(r["rung"]))
        floor = next((int(r["rung"]) for r in rows if r.get("is_floor")), -1)
        ladders.append(Ladder(
            # Back to the LABEL. The fingerprint hashes Ladder.category, so
            # leaving the key here changes the snapshot id on round trip even
            # after the write side is fixed — the mirror-image half of the same
            # defect, and the one that survives the obvious repair.
            category=categories.label_for(category_key),
            severity=severity,
            rungs=tuple(f"{r['clause_id']}@v{r['version']}" for r in rows),
            floor_rung=floor,
            status=ladder_status(rows, frozen),
        ))

    return Snapshot.build(clauses, ladders, taken_on)
