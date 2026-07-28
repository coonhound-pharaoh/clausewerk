"""Ladder placement and ranking tests.

The guarantees under test: the same rows and the same position give the same
answer every time; the floor is never crossed by a rank; and a damaged ladder
is refused rather than guessed at.

Nothing here asserts on wording — refusals are checked by their code, which is
the stable part. Fixtures are synthetic.

    python -m pytest engine -q
"""

import pytest

from engine.ladder_placement import (
    BELOW_FLOOR,
    FLOOR_DUPLICATED,
    FLOOR_MISSING,
    NOT_A_RUNG,
    NO_RUNGS,
    POSITION_DUPLICATED,
    RUNGS_NOT_CONTIGUOUS,
    RUNG_DUPLICATED,
    Refusal,
    place,
    rank,
    read_ladder,
    retreat_path,
)


def row(rung, cid, ver=1, floor=False):
    return {"rung": rung, "clause_id": cid, "version": ver, "is_floor": floor}


@pytest.fixture
def rows():
    # Four rungs, floor at rung 2, plus one rung recorded below the floor.
    return [
        row(0, "AA-001"),
        row(1, "AA-002"),
        row(2, "AA-003", floor=True),
        row(3, "AA-004"),
    ]


@pytest.fixture
def ladder(rows):
    return read_ladder("Cat", "High", rows)


# ── Reading a ladder ───────────────────────────────────────────────────────

def test_reads_a_well_formed_ladder(ladder):
    assert not ladder.refused
    assert [r.rung for r in ladder.rungs] == [0, 1, 2, 3]
    assert ladder.floor_rung == 2


def test_row_order_does_not_change_the_ladder(rows):
    shuffled = [rows[2], rows[0], rows[3], rows[1]]
    assert read_ladder("Cat", "High", shuffled) == read_ladder("Cat", "High", rows)


def test_refuses_an_empty_ladder():
    assert read_ladder("Cat", "High", []).code == NO_RUNGS


def test_refuses_a_ladder_with_no_floor():
    bad = [row(0, "AA-001"), row(1, "AA-002")]
    assert read_ladder("Cat", "High", bad).code == FLOOR_MISSING


def test_refuses_a_ladder_with_two_floors():
    bad = [row(0, "AA-001", floor=True), row(1, "AA-002", floor=True)]
    assert read_ladder("Cat", "High", bad).code == FLOOR_DUPLICATED


def test_refuses_a_gap_in_the_rungs():
    bad = [row(0, "AA-001"), row(2, "AA-003", floor=True)]
    assert read_ladder("Cat", "High", bad).code == RUNGS_NOT_CONTIGUOUS


def test_refuses_rungs_that_do_not_start_at_zero():
    bad = [row(1, "AA-001"), row(2, "AA-003", floor=True)]
    assert read_ladder("Cat", "High", bad).code == RUNGS_NOT_CONTIGUOUS


def test_refuses_a_repeated_rung_number():
    bad = [row(0, "AA-001"), row(0, "AA-009"), row(1, "AA-002", floor=True)]
    assert read_ladder("Cat", "High", bad).code == RUNG_DUPLICATED


def test_refuses_the_same_clause_version_on_two_rungs():
    bad = [row(0, "AA-001"), row(1, "AA-001", floor=True)]
    assert read_ladder("Cat", "High", bad).code == POSITION_DUPLICATED


# ── Placement ──────────────────────────────────────────────────────────────

def test_places_on_the_correct_rung(ladder):
    p = place(ladder, "AA-002@v1")
    assert p.rung == 1
    assert p.at_floor is False
    assert p.rungs_to_floor == 1


def test_places_the_floor_as_the_floor(ladder):
    p = place(ladder, "AA-003@v1")
    assert p.at_floor is True
    assert p.rungs_to_floor == 0


def test_version_is_part_of_the_position(ladder):
    # Same clause id, different version: a different rung, or none.
    assert place(ladder, "AA-002@v2").code == NOT_A_RUNG


def test_placement_is_reproducible(ladder):
    assert place(ladder, "AA-002@v1") == place(ladder, "AA-002@v1")


def test_a_position_off_the_ladder_is_refused(ladder):
    assert place(ladder, "ZZ-999@v1").code == NOT_A_RUNG


def test_below_the_floor_is_refused_not_ranked(ladder):
    r = place(ladder, "AA-004@v1")
    assert isinstance(r, Refusal)
    assert r.code == BELOW_FLOOR
    assert r.reason  # a reason travels with the refusal


def test_a_refused_ladder_carries_through_placement():
    bad = read_ladder("Cat", "High", [row(0, "AA-001")])
    assert place(bad, "AA-001@v1").code == FLOOR_MISSING


# ── Ranking ────────────────────────────────────────────────────────────────

def test_ranks_from_the_position_down_to_the_floor(ladder):
    r = rank(ladder, "AA-001@v1")
    assert [a.ref for a in r.alternatives] == ["AA-001@v1", "AA-002@v1", "AA-003@v1"]
    assert r.better == ()
    assert r.floor.ref == "AA-003@v1"


def test_ranking_never_offers_a_rung_below_the_floor(ladder):
    r = rank(ladder, "AA-001@v1")
    assert all(a.rung <= ladder.floor_rung for a in r.alternatives)


def test_ranking_from_mid_ladder_keeps_what_is_above(ladder):
    r = rank(ladder, "AA-002@v1")
    assert [a.ref for a in r.better] == ["AA-001@v1"]
    assert [a.ref for a in r.alternatives] == ["AA-002@v1", "AA-003@v1"]


def test_ranking_at_the_floor_offers_only_the_floor(ladder):
    r = rank(ladder, "AA-003@v1")
    assert [a.ref for a in r.alternatives] == ["AA-003@v1"]


def test_ranking_is_reproducible(ladder):
    assert rank(ladder, "AA-002@v1") == rank(ladder, "AA-002@v1")


def test_ranking_below_the_floor_is_the_same_refusal(ladder):
    assert rank(ladder, "AA-004@v1").code == BELOW_FLOOR


def test_retreat_path_is_rung_zero_down_to_the_floor(ladder):
    assert [r.rung for r in retreat_path(ladder)] == [0, 1, 2]


def test_retreat_path_carries_a_refusal_through():
    bad = read_ladder("Cat", "High", [])
    assert retreat_path(bad).code == NO_RUNGS
