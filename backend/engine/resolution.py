"""The resolution engine.

A pure function: no network, no database, no model. Given a manifest and a
snapshot it returns the same decisions every time, forever — which is the whole
point, since a contract executed today must still be explicable in seven years.

It never produces contract language. It selects an already-approved clause by
reference, or it reports that it cannot and says why. There is no path here that
invents, paraphrases or adjusts wording (ADR-0001).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .model import (
    BASELINE,
    STANDARD,
    Clause,
    Decision,
    Ladder,
    Manifest,
    Resolution,
    Risk,
)
from .snapshot import Snapshot, content_hash


def _order(clauses) -> tuple[Clause, ...]:
    """Deterministic candidate order.

    The prototype relied on the order rows happened to arrive in, which made
    selection depend on the database's whim. Sorting explicitly is what lets
    two runs of the same inputs agree.
    """
    return tuple(sorted(clauses, key=lambda c: (c.clause_id, c.version)))


def resolve(manifest: Manifest, snapshot: Snapshot) -> Resolution:
    decisions: list[Decision] = []

    # ── Baseline pass ──────────────────────────────────────────────────────
    # Cross-cutting boilerplate lands in every contract regardless of what
    # Intake found. Emitted first so the framework sections lead the document.
    baseline = _order(c for c in snapshot.clauses if c.always_include and c.selectable)
    for clause in sorted(baseline, key=lambda c: (c.framework_section or "", c.clause_id)):
        decisions.append(
            Decision(
                risk=Risk(category=clause.category, severity=BASELINE,
                          justification="Always included"),
                selected=clause,
                reason=f"Always-include · Baseline Framework §{clause.framework_section or '—'}",
                baseline=True,
                warning=_provenance_warning(clause),
            )
        )

    # ── Manifest pass ──────────────────────────────────────────────────────
    for risk in manifest.risks:
        decisions.append(_resolve_risk(risk, snapshot))

    result = tuple(decisions)
    return Resolution(
        decisions=result,
        snapshot_id=snapshot.snapshot_id,
        manifest_vendor=manifest.vendor,
        result_hash=content_hash(
            [
                {
                    "category": d.risk.category,
                    "severity": d.risk.severity,
                    "selected": d.selected.ref if d.selected else None,
                    "reason": d.reason,
                    "suppressed": [c.ref for c in d.suppressed],
                }
                for d in result
            ]
        ),
    )


def _provenance_warning(clause: Clause) -> Optional[str]:
    if clause.provenance_gap:
        return (
            f"{clause.ref} has no recorded approval or expiry date — it cannot "
            f"be temporally governed and will never expire"
        )
    return None


def _resolve_risk(risk: Risk, snapshot: Snapshot) -> Decision:
    # Baseline clauses were already placed; exclude them from the risk pool.
    everything = tuple(
        c for c in snapshot.in_category(risk.category, include_unselectable=True)
        if not c.always_include
    )
    candidates = _order(c for c in everything if c.selectable)

    if not candidates:
        lapsed = len(everything)
        if lapsed:
            # "We had one and it lapsed" is a different library problem from
            # "we never had one", and needs a different fix.
            return Decision(
                risk=risk,
                selected=None,
                reason=(
                    f"No active clause available in Ledger · "
                    f"{lapsed} candidate(s) retired or expired"
                ),
                expired_only=True,
            )
        return Decision(risk=risk, selected=None, reason="No clause available in Ledger")

    exact = next((c for c in candidates if c.severity == risk.severity), None)
    if exact is not None:
        selected = exact
        reason = f"Matched {risk.severity} variant for {risk.category}"
    else:
        selected = next((c for c in candidates if c.severity == STANDARD), candidates[0])
        reason = f"No {risk.severity} variant; fell back to {selected.severity}"

    return Decision(
        risk=risk,
        selected=selected,
        # Retained, not discarded: the audit story needs to show what lost.
        suppressed=tuple(c for c in candidates if c.ref != selected.ref),
        reason=reason,
        warning=_provenance_warning(selected),
    )


# ── Ladder descent (CLA §3) ────────────────────────────────────────────────


@dataclass(frozen=True)
class Descent:
    """The outcome of a vendor pushing back on a position."""

    accepted: Optional[Clause]
    rung: Optional[int]
    escalate: bool
    reason: str

    @property
    def at_floor(self) -> bool:
        return self.accepted is not None and self.rung is not None


def descend(
    snapshot: Snapshot, category: str, severity: str, current_ref: str
) -> Descent:
    """Move one rung down a pre-approved ladder, or escalate.

    Escalation is always the safe outcome. Nothing here may invent a position:
    if a ladder is missing, damaged, or exhausted, a human decides.
    """
    ladder = snapshot.ladder_for(category, severity)
    if ladder is None:
        return Descent(None, None, True,
                       f"No ladder defined for {category}/{severity} — escalate")

    # A ladder with an unusable rung must not quietly close the gap: collapsing
    # it would silently lower the floor. Reported, not resolved (CLA §11 q4).
    if ladder.status != "intact":
        return Descent(None, None, True,
                       f"Ladder for {category}/{severity} is {ladder.status} — escalate")

    current = ladder.rung_of(current_ref)
    if current is None:
        return Descent(None, None, True,
                       f"{current_ref} is not a rung on this ladder — escalate")

    nxt = current + 1
    if nxt >= len(ladder.rungs):
        return Descent(None, None, True, "Ladder exhausted — escalate")
    if nxt > ladder.floor_rung:
        # The floor is absolute. No score, threshold or auto-approve passes it.
        return Descent(None, None, True,
                       f"Rung {nxt} is below the floor (rung {ladder.floor_rung}) — escalate")

    clause = snapshot.by_ref(ladder.rungs[nxt])
    if clause is None or not clause.selectable:
        return Descent(None, None, True,
                       f"Rung {nxt} clause is not selectable — escalate")

    at_floor = " (floor)" if nxt == ladder.floor_rung else ""
    return Descent(clause, nxt, False,
                   f"Descended to rung {nxt}{at_floor}: {clause.ref}")
