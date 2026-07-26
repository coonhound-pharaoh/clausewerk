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
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Iterable, Mapping, Optional

from .model import Clause, Ladder, Manifest, Resolution
from .snapshot import Snapshot
from .validation import RuleSet, ValidationResult


# ── Write side ─────────────────────────────────────────────────────────────


def snapshot_rows(snapshot: Snapshot) -> dict[str, list[dict[str, Any]]]:
    """Everything needed to rebuild this snapshot, minus the clause bodies —
    those live immutably in cw.clause_version and a reference suffices."""
    members = [
        {"snapshot_id": snapshot.snapshot_id, "clause_id": c.clause_id,
         "version": c.version, "selectable": c.selectable}
        for c in snapshot.clauses
    ]
    rungs: list[dict[str, Any]] = []
    for ladder in snapshot.ladders:
        for rung, ref in enumerate(ladder.rungs):
            clause_id, _, version = ref.partition("@v")
            rungs.append({
                "snapshot_id": snapshot.snapshot_id,
                "category": ladder.category,
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
    *,
    created_by: str,
    agreement_id: Optional[str] = None,
    override_ref: Optional[str] = None,
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
        }),
        "manifest_source": manifest.source,
        "snapshot_id": resolution.snapshot_id,
        "ruleset_id": validation.ruleset_id,
        "result_hash": resolution.result_hash,
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
            "category": d.risk.category,
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
) -> Snapshot:
    """Rebuild a stored snapshot.

    `member_rows` supply the frozen `selectable` flags; `clause_rows` supply the
    immutable content by reference. The two are joined on (clause_id, version),
    so a clause that has since been retired still rebuilds exactly as it was.
    """
    frozen = {(m["clause_id"], int(m["version"])): bool(m["selectable"]) for m in member_rows}

    clauses = []
    for row in clause_rows:
        key = (row["clause_id"], int(row["version"]))
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
            tags=tuple(row.get("tags") or ()),
        ))

    by_ladder: dict[tuple[str, str], list[Mapping[str, Any]]] = {}
    for r in ladder_rung_rows:
        by_ladder.setdefault((r["category"], r["severity"]), []).append(r)

    ladders = []
    for (category, severity), rows in by_ladder.items():
        rows = sorted(rows, key=lambda r: int(r["rung"]))
        floor = next((int(r["rung"]) for r in rows if r.get("is_floor")), -1)
        ladders.append(Ladder(
            category=category,
            severity=severity,
            rungs=tuple(f"{r['clause_id']}@v{r['version']}" for r in rows),
            floor_rung=floor,
            status="intact",
        ))

    return Snapshot.build(clauses, ladders, taken_on)
