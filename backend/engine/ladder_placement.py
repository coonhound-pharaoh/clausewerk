"""Ladder placement and alternative ranking.

A pure function set: no network, no database, no model. It is handed the rung
rows of one ladder — the shape `cw.ladder` and `cw.ladder_rung` already store
(`0003_ladders_and_concessions.sql:28-60`) — and answers two questions the same
way every time:

  * placement — where does a position sit on its ladder?
  * ranking — what are the alternatives, preferred first, down to the floor?

It never produces contract language and it never judges whether an alternative
is a *good* one. The ranking IS the ladder: rung order, and nothing else. Any
opinion beyond that order is content, and content belongs to Legal.

The floor is absolute. `cw.ladder_rung.is_floor` says in the schema's own words
that escalation below it is mandatory and no similarity score, auto-approve or
threshold may bypass it. So a position below the floor comes back as a refusal
carrying that reason — never as a low-ranked option that something downstream
could mistake for an acceptable retreat.

Refusals are returned, not raised, and they carry a stable machine code. The
caller branches on the code; the sentence is for a human reading a record.

    python -m pytest engine -q
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Optional, Union

# ── Refusal codes ──────────────────────────────────────────────────────────
# Stable identifiers, deliberately separate from the sentence. Wording is
# content and will be rewritten; a caller that branched on the sentence would
# break when it was. These are what a caller may depend on.
NO_RUNGS = "no_rungs"
FLOOR_MISSING = "floor_missing"
FLOOR_DUPLICATED = "floor_duplicated"
RUNGS_NOT_CONTIGUOUS = "rungs_not_contiguous"
RUNG_DUPLICATED = "rung_duplicated"
POSITION_DUPLICATED = "position_duplicated"
NOT_A_RUNG = "not_a_rung"
BELOW_FLOOR = "below_floor"


@dataclass(frozen=True)
class Refusal:
    """A question this module will not answer, and why.

    Returned wherever the alternative would be a guess. A damaged ladder is a
    thing a human fixes, not a thing an engine patches over — closing a gap
    quietly would silently move the floor.
    """

    code: str
    reason: str

    @property
    def refused(self) -> bool:
        return True


@dataclass(frozen=True)
class Rung:
    """One position on a ladder. Rung 0 is the preferred opening position."""

    rung: int
    clause_id: str
    version: int
    is_floor: bool = False

    @property
    def ref(self) -> str:
        # Same shape as ``model.Clause.ref``, so a placement result can be
        # matched against a snapshot without either side reformatting.
        return f"{self.clause_id}@v{self.version}"


@dataclass(frozen=True)
class Ladder:
    """A validated retreat path for one category and severity.

    Only ever constructed by ``read_ladder``, which refuses anything the
    schema's own constraints would have refused. Holding an instance of this
    type therefore means: rungs contiguous from 0, exactly one floor.
    """

    category: str
    severity: str
    rungs: tuple[Rung, ...]
    floor_rung: int

    @property
    def refused(self) -> bool:
        return False

    def rung_of(self, clause_ref: str) -> Optional[int]:
        for r in self.rungs:
            if r.ref == clause_ref:
                return r.rung
        return None


@dataclass(frozen=True)
class Placement:
    """Where one position sits on its ladder."""

    ladder: Ladder
    rung: int
    clause_ref: str
    at_floor: bool
    #: How many rungs of retreat remain before the floor. 0 means: this is the
    #: last position we will accept.
    rungs_to_floor: int

    @property
    def refused(self) -> bool:
        return False


@dataclass(frozen=True)
class Ranking:
    """The alternatives available from a position, best first.

    ``alternatives`` is every rung from the placed position down to and
    including the floor — the retreat path, in the order a negotiator walks it.
    ``better`` is what sits above the position, kept because "we are already
    three rungs down" is a fact a reviewer wants and a rank alone does not say.
    """

    placement: Placement
    better: tuple[Rung, ...]
    alternatives: tuple[Rung, ...]

    @property
    def refused(self) -> bool:
        return False

    @property
    def floor(self) -> Rung:
        return self.placement.ladder.rungs[self.placement.ladder.floor_rung]


LadderResult = Union[Ladder, Refusal]
PlacementResult = Union[Placement, Refusal]
RankingResult = Union[Ranking, Refusal]


def _row(row: Mapping) -> Rung:
    return Rung(
        rung=int(row["rung"]),
        clause_id=str(row["clause_id"]),
        version=int(row["version"]),
        is_floor=bool(row.get("is_floor", False)),
    )


def read_ladder(
    category: str, severity: str, rung_rows: Iterable[Mapping]
) -> LadderResult:
    """Validate rung rows into a ladder, or refuse to.

    The database enforces contiguity and the single floor with a trigger and a
    partial unique index. This re-checks both anyway: rows reach this module
    through a query result, a fixture or a cache, and a module that trusts its
    input to be well-formed is a module that guesses when it is not. Cheap
    check, and it turns a silent wrong answer into a named refusal.
    """
    rungs = tuple(sorted((_row(r) for r in rung_rows), key=lambda r: r.rung))

    if not rungs:
        return Refusal(
            NO_RUNGS,
            f"Ladder for {category}/{severity} has no rungs — escalate",
        )

    numbers = [r.rung for r in rungs]
    if len(set(numbers)) != len(numbers):
        return Refusal(
            RUNG_DUPLICATED,
            f"Ladder for {category}/{severity} has a repeated rung number — escalate",
        )
    refs = [r.ref for r in rungs]
    if len(set(refs)) != len(refs):
        return Refusal(
            POSITION_DUPLICATED,
            f"Ladder for {category}/{severity} repeats a clause version — escalate",
        )
    if numbers != list(range(len(numbers))):
        # "Descend one rung" is meaningless over a gap, and closing the gap
        # here would move the floor by one without anyone deciding to.
        return Refusal(
            RUNGS_NOT_CONTIGUOUS,
            f"Ladder for {category}/{severity} rungs are not contiguous from 0 — escalate",
        )

    floors = [r for r in rungs if r.is_floor]
    if not floors:
        return Refusal(
            FLOOR_MISSING,
            f"Ladder for {category}/{severity} has no floor — escalate",
        )
    if len(floors) > 1:
        # Two floors means two different answers to "how far may we go", and
        # picking either one would be this module deciding a Legal question.
        return Refusal(
            FLOOR_DUPLICATED,
            f"Ladder for {category}/{severity} has more than one floor — escalate",
        )

    return Ladder(
        category=category,
        severity=severity,
        rungs=rungs,
        floor_rung=floors[0].rung,
    )


def place(ladder: LadderResult, clause_ref: str) -> PlacementResult:
    """Place one position against a ladder.

    Takes the result of ``read_ladder`` directly, refusal included, so a caller
    can chain the two without unpacking in between and without a damaged ladder
    quietly turning into a placement.
    """
    if isinstance(ladder, Refusal):
        return ladder

    rung = ladder.rung_of(clause_ref)
    if rung is None:
        return Refusal(
            NOT_A_RUNG,
            f"{clause_ref} is not a rung on the {ladder.category}/"
            f"{ladder.severity} ladder — escalate",
        )

    if rung > ladder.floor_rung:
        # Below the floor is a refusal, never a rank. The schema's comment on
        # is_floor is the reason, and it is carried here rather than restated:
        # escalation is mandatory, and no score or threshold bypasses it.
        floor = ladder.rungs[ladder.floor_rung]
        return Refusal(
            BELOW_FLOOR,
            f"Rung {rung} is below the floor ({floor.ref}, rung "
            f"{ladder.floor_rung}) on the {ladder.category}/{ladder.severity} "
            f"ladder. Below the floor, escalation is mandatory — no similarity "
            f"score, auto-approve or threshold may bypass it (CLA §3).",
        )

    return Placement(
        ladder=ladder,
        rung=rung,
        clause_ref=clause_ref,
        at_floor=rung == ladder.floor_rung,
        rungs_to_floor=ladder.floor_rung - rung,
    )


def rank(ladder: LadderResult, clause_ref: str) -> RankingResult:
    """Rank the alternatives available from a position: preferred, then down.

    The order is the ladder's order and stops at the floor. Rungs recorded
    below the floor — which the schema permits, since is_floor marks a position
    rather than truncating the table — are never offered as alternatives; they
    exist for the record, not for a negotiator to reach for.
    """
    placed = place(ladder, clause_ref)
    if isinstance(placed, Refusal):
        return placed

    lad = placed.ladder
    return Ranking(
        placement=placed,
        better=lad.rungs[: placed.rung],
        alternatives=lad.rungs[placed.rung : lad.floor_rung + 1],
    )


def retreat_path(ladder: LadderResult) -> Union[tuple[Rung, ...], Refusal]:
    """The whole ladder as offered: rung 0 down to the floor, inclusive.

    The ranking from the preferred position, for the common case where nothing
    has been placed yet and the question is simply "what may we accept".
    """
    if isinstance(ladder, Refusal):
        return ladder
    return ladder.rungs[: ladder.floor_rung + 1]
