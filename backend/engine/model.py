"""Immutable value types for the resolution engine.

Everything here is frozen. Resolution is a pure function over these values, so
nothing it touches can be mutated underneath it — which is what makes a result
reproducible years later rather than merely reproducible today.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

# Severity of a clause or a risk. 'Baseline' is synthetic: it appears only on
# decisions emitted by the always-include pass, never in a manifest.
STANDARD = "Standard"
HIGH = "High"
BASELINE = "Baseline"

# Clause lifecycle, mirroring cw.clause_version_state (ADR-0009).
ACTIVE = "active"
SUPERSEDED = "superseded"
RETIRED = "retired"
EXPIRED = "expired"

# Who composed the words (ADR-0010), mirroring cw.clause_version.origin. This is
# a different question from `provenance`, which says which door the wording came
# through — the Review queue, a concession promotion, or the original seed.
LEGAL_AUTHORED = "legal_authored"
AI_DRAFTED = "ai_drafted"
VENDOR_DERIVED = "vendor_derived"
EXTERNAL = "external"
ORIGINS = (LEGAL_AUTHORED, AI_DRAFTED, VENDOR_DERIVED, EXTERNAL)

# ── Which engine produced a result (WP-32) ─────────────────────────────────
# Bumped whenever anything that feeds `Resolution.result_hash` changes: the
# resolution order, the decision fields that are hashed, or the snapshot
# fingerprint. Recorded on every run row, because a stored hash that no longer
# reproduces is indistinguishable from a tampered one unless the record says
# which code computed it.
ENGINE_VERSION = "clausewerk-engine/3"


@dataclass(frozen=True)
class Clause:
    """One immutable version of one clause."""

    clause_id: str
    version: int
    category: str
    severity: str
    title: str
    body: str
    state: str = ACTIVE
    #: Whether resolution may select this. Not the same as ``state``: a
    #: superseded clause on run-off is selectable until its own expiry.
    selectable: bool = True
    always_include: bool = False
    framework_section: Optional[str] = None
    expires_on: Optional[date] = None
    #: True when the clause has no recorded approval or expiry date. It is not
    #: expired — it is ungoverned, and that must stay visible (finding #8).
    provenance_gap: bool = False
    #: Who composed the words (ADR-0010). Permanent, and deliberately NOT part
    #: of the snapshot fingerprint: on a pinned ``(clause_id, version)`` the
    #: origin cannot change what the clause says or whether it was selectable,
    #: so it cannot change an outcome — see ``snapshot.py``.
    origin: str = LEGAL_AUTHORED
    #: Attributes counsel attached to this wording ('jurisdiction:ny',
    #: 'indemnity:uncapped'). Conflict rules match on these, so no rule ever
    #: has to parse contract prose.
    tags: tuple[str, ...] = ()

    @property
    def ref(self) -> str:
        return f"{self.clause_id}@v{self.version}"


@dataclass(frozen=True)
class Ladder:
    """A pre-approved retreat path for one category and severity (CLA §3)."""

    category: str
    severity: str
    #: Clause refs, rung 0 first. Rung 0 is the preferred position.
    rungs: tuple[str, ...]
    floor_rung: int
    #: intact | degraded | floor_unusable | floorless | empty, from
    #: cw.ladder_health. Resolution refuses to descend anything but 'intact'.
    status: str = "intact"

    def rung_of(self, clause_ref: str) -> Optional[int]:
        try:
            return self.rungs.index(clause_ref)
        except ValueError:
            return None


@dataclass(frozen=True)
class Risk:
    """One entry in a manifest — the only thing that crosses the trust boundary."""

    category: str
    severity: str
    justification: str = ""


@dataclass(frozen=True)
class Manifest:
    vendor: str
    value: Optional[str] = None
    source: str = "llm"
    risks: tuple[Risk, ...] = ()
    #: Risks the trust boundary refused because their category is not in the
    #: registry's enum (`engine.manifest.check_manifest`). Kept, not discarded:
    #: "the model invented a category" is a different fact from "we have no
    #: clause for that category", and only one of them is a library gap. These
    #: never reach resolution, so they can never be reported as coverage.
    dropped: tuple[Risk, ...] = ()


@dataclass(frozen=True)
class Decision:
    """Why one clause is in the contract, or why none is."""

    risk: Risk
    selected: Optional[Clause]
    suppressed: tuple[Clause, ...] = ()
    reason: str = ""
    baseline: bool = False
    #: Set when something about this decision needs a human's attention but
    #: does not block: an unprovenanced clause, a degraded ladder.
    warning: Optional[str] = None
    #: True when candidates existed for the category but all had lapsed. A
    #: different library problem from "we never had one", needing a different fix.
    expired_only: bool = False

    @property
    def unresolved(self) -> bool:
        return self.selected is None


@dataclass(frozen=True)
class Resolution:
    """The output of a run, bound to the exact library state that produced it."""

    decisions: tuple[Decision, ...]
    snapshot_id: str
    manifest_vendor: str
    #: Content hash of the decisions. Two runs agreeing on this agree exactly.
    result_hash: str = ""

    @property
    def unresolved(self) -> tuple[Decision, ...]:
        return tuple(d for d in self.decisions if d.unresolved)

    @property
    def warnings(self) -> tuple[Decision, ...]:
        return tuple(d for d in self.decisions if d.warning)
