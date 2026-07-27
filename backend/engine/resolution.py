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
    Manifest,
    Resolution,
    Risk,
)
from .snapshot import Snapshot, content_hash


def _order(clauses) -> tuple[Clause, ...]:
    """Deterministic candidate order: newest selectable version of a clause first.

    The prototype relied on the order rows happened to arrive in, which made
    selection depend on the database's whim. Sorting explicitly is what lets
    two runs of the same inputs agree.

    The version key is DESCENDING on purpose (E3a). When two versions of the
    same clause are both selectable — the usual case while a superseded version
    runs off alongside its replacement — picking the older one is deterministic
    but is the wrong contract position: Legal approved the newer wording. This
    does not weaken reproducibility, which is defined against a pinned snapshot:
    a rebuilt snapshot carries both versions with their frozen `selectable`
    flags, so newest-wins re-selects exactly what it selected on the day.
    """
    return tuple(sorted(clauses, key=lambda c: (c.clause_id, -c.version)))


def _section_key(section: str) -> tuple:
    """Framework sections in the order a reader expects: 1.2 before 1.10.

    Sorted as plain text, "1.10" lands before "1.2" — invisible today because
    no fixture has ten sections, and wrong on the first library that does,
    with the document then numbering its sections in that wrong order. Each
    dot-separated piece is compared as a number when it is one and as text
    when it is not; the leading flag on each piece keeps numbers and words
    comparable without ever comparing them to each other.
    """
    return tuple(
        (0, int(piece), "") if piece.isdigit() else (1, 0, piece)
        for piece in section.split(".")
    )


# DEFERRED, not forgotten (E3b): resolution does not consult ladders for a
# preferred opening rung. It was split out of this package deliberately — a
# ladder's rung 0 disagreeing with the severity match is a CONTENT question for
# Legal, not a system question, and adopting it would create a second silent
# selection authority. It needs an owner decision before it is built.


def resolve(manifest: Manifest, snapshot: Snapshot) -> Resolution:
    decisions: list[Decision] = []

    # ── Baseline pass ──────────────────────────────────────────────────────
    # Cross-cutting boilerplate lands in every contract regardless of what
    # Intake found. Emitted first so the framework sections lead the document.
    decisions.extend(_baseline_pass(snapshot))

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


def _baseline_pass(snapshot: Snapshot) -> tuple[Decision, ...]:
    """Place the always-include framework sections, and gate on any that lapsed.

    A baseline clause that has expired used to simply disappear: the contract
    came out one section shorter and nothing said so. That is the worst possible
    failure for a framework section — Definitions and Order of Precedence are
    what the rest of the document leans on.

    The risk pass already tells "we had one and it lapsed" apart from "we never
    had one" (`expired_only`). The baseline pass now uses the same vocabulary,
    and the lapsed case is emitted as an UNRESOLVED decision with a warning —
    so it lands in `Resolution.unresolved`, in `Resolution.warnings`, and in the
    stored run record, instead of leaving a hole nobody can see.

    Where the gap gets fixed is not our business: the system's job ends at
    making it visible and giving Legal a place to act.
    """
    versions: dict[str, list[Clause]] = {}
    for c in snapshot.clauses:
        if c.always_include:
            versions.setdefault(c.clause_id, []).append(c)

    rows = []
    for clause_id, group in versions.items():
        live = _order(c for c in group if c.selectable)
        selected = live[0] if live else None
        # Even with nothing selectable we still know the section this clause
        # was meant to occupy, so the gap can be reported in document order.
        anchor = selected or _order(group)[0]
        rows.append((anchor.framework_section or "", clause_id, anchor, selected, len(group)))

    out: list[Decision] = []
    for section, clause_id, anchor, selected, lapsed in sorted(
            rows, key=lambda r: (r[0] != "", _section_key(r[0]), r[1])):
        risk = Risk(category=anchor.category, severity=BASELINE,
                    justification="Always included")
        if selected is not None:
            out.append(Decision(
                risk=risk,
                selected=selected,
                reason=f"Always-include · Baseline Framework §{section or '—'}",
                baseline=True,
                warning=_provenance_warning(selected),
            ))
            continue
        out.append(Decision(
            risk=risk,
            selected=None,
            reason=(
                f"Always-include · Baseline Framework §{section or '—'} · "
                f"No active clause available in Ledger · "
                f"{lapsed} candidate(s) retired or expired"
            ),
            baseline=True,
            expired_only=True,
            warning=(
                f"{clause_id} is an always-include Baseline Framework section and "
                f"every version has lapsed — the contract cannot be assembled "
                f"until an approved current version exists"
            ),
        ))
    return tuple(out)


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

    # `at_floor` used to live here and was removed (WP-24, finding E8). It read
    # `accepted is not None and rung is not None`, which is not "at the floor"
    # at all — it is "a rung was accepted", true of every successful descent.
    # Nothing called it. A misnamed property that answers a different question
    # from the one its name asks is worse than no property, because the first
    # caller to reach for it would have been told the wrong thing. Whether a
    # descent landed on the floor is already stated in `reason`, and is
    # derivable from `rung` against the ladder.


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
