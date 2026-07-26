"""Resolution engine tests.

The guarantee under test is determinism: the same manifest against the same
snapshot must produce byte-identical decisions, and any change to the library
or the ladders must change the snapshot id.

    python -m pytest engine -q
"""

from datetime import date

import pytest

from engine.model import (
    BASELINE,
    EXPIRED,
    HIGH,
    RETIRED,
    STANDARD,
    Clause,
    Ladder,
    Manifest,
    Risk,
)
from engine.resolution import descend, resolve
from engine.snapshot import Snapshot


def clause(cid, ver=1, cat="Data Privacy", sev=HIGH, body=None, **kw):
    return Clause(
        clause_id=cid,
        version=ver,
        category=cat,
        severity=sev,
        title=f"{cid} title",
        body=body or f"Body of {cid}.",
        **kw,
    )


@pytest.fixture
def snap():
    return Snapshot.build(
        clauses=[
            clause("DP-H-014"),
            clause("DP-H-052"),
            clause("DP-H-061"),
            clause("DP-S-003", sev=STANDARD),
            clause("LC-S-009", cat="Liability Cap", sev=STANDARD),
            clause("DF-B-001", cat="Definitions", sev=STANDARD,
                   always_include=True, framework_section="1.1"),
            clause("OP-B-002", cat="Order of Precedence", sev=STANDARD,
                   always_include=True, framework_section="1.2"),
            # Present but unusable — resolution must exclude these.
            clause("SC-H-012", cat="Security", state=RETIRED, selectable=False),
            clause("SC-S-004", cat="Security", sev=STANDARD, state=EXPIRED,
                   selectable=False, expires_on=date(2024, 6, 1)),
        ],
        ladders=[
            Ladder("Data Privacy", HIGH,
                   rungs=("DP-H-014@v1", "DP-H-052@v1", "DP-H-061@v1"),
                   floor_rung=2),
        ],
        taken_on=date(2026, 7, 25),
    )


# ── Baseline pass ──────────────────────────────────────────────────────────


def test_baseline_clauses_land_in_every_contract(snap):
    r = resolve(Manifest(vendor="Northwind"), snap)
    refs = [d.selected.ref for d in r.decisions if d.baseline]
    assert refs == ["DF-B-001@v1", "OP-B-002@v1"]
    assert all(d.risk.severity == BASELINE for d in r.decisions if d.baseline)


def test_baseline_ordered_by_framework_section(snap):
    r = resolve(Manifest(vendor="N"), snap)
    sections = [d.selected.framework_section for d in r.decisions if d.baseline]
    assert sections == sorted(sections)


def test_baseline_clauses_are_not_offered_to_risks(snap):
    """A baseline clause is placed once, by the baseline pass, and never
    re-selected as though it answered a risk."""
    r = resolve(
        Manifest(vendor="N", risks=(Risk("Definitions", STANDARD),)), snap
    )
    risk_decision = [d for d in r.decisions if not d.baseline][0]
    assert risk_decision.selected is None
    assert risk_decision.reason == "No clause available in Ledger"


# ── Selection ──────────────────────────────────────────────────────────────


def test_exact_severity_match(snap):
    r = resolve(Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),)), snap)
    d = [x for x in r.decisions if not x.baseline][0]
    assert d.selected.severity == HIGH
    assert d.reason == "Matched High variant for Data Privacy"


def test_falls_back_to_standard_and_says_so(snap):
    r = resolve(Manifest(vendor="N", risks=(Risk("Liability Cap", HIGH),)), snap)
    d = [x for x in r.decisions if not x.baseline][0]
    assert d.selected.ref == "LC-S-009@v1"
    assert d.reason == "No High variant; fell back to Standard"


def test_losing_candidates_are_retained(snap):
    """Suppression is the audit answer to 'why not the stricter one?'"""
    r = resolve(Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),)), snap)
    d = [x for x in r.decisions if not x.baseline][0]
    assert len(d.suppressed) == 3
    assert d.selected.ref not in [c.ref for c in d.suppressed]


def test_no_clause_at_all_is_a_hard_flag_not_a_guess(snap):
    r = resolve(Manifest(vendor="N", risks=(Risk("Insurance", HIGH),)), snap)
    d = [x for x in r.decisions if not x.baseline][0]
    assert d.selected is None
    assert d.unresolved
    assert d.reason == "No clause available in Ledger"
    assert not d.expired_only


def test_all_candidates_lapsed_is_a_distinct_diagnosis(snap):
    """'We had one and it lapsed' needs a different fix from 'we never had one'."""
    r = resolve(Manifest(vendor="N", risks=(Risk("Security", HIGH),)), snap)
    d = [x for x in r.decisions if not x.baseline][0]
    assert d.selected is None
    assert d.expired_only
    assert d.reason == "No active clause available in Ledger · 2 candidate(s) retired or expired"


def test_unselectable_clauses_never_reach_a_contract(snap):
    r = resolve(
        Manifest(vendor="N", risks=(Risk("Security", HIGH), Risk("Data Privacy", HIGH))),
        snap,
    )
    chosen = [d.selected.ref for d in r.decisions if d.selected]
    assert "SC-H-012@v1" not in chosen
    assert "SC-S-004@v1" not in chosen


def test_unprovenanced_clause_is_selectable_but_warns():
    snap = Snapshot.build([clause("XX-S-001", cat="Audit Rights", sev=STANDARD,
                                  provenance_gap=True)])
    r = resolve(Manifest(vendor="N", risks=(Risk("Audit Rights", STANDARD),)), snap)
    d = r.decisions[0]
    assert d.selected is not None
    assert "never expire" in d.warning
    assert r.warnings


# ── Determinism ────────────────────────────────────────────────────────────


def test_same_inputs_produce_identical_results(snap):
    m = Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH), Risk("Liability Cap", HIGH)))
    assert resolve(m, snap).result_hash == resolve(m, snap).result_hash


def test_snapshot_id_is_order_independent():
    """Two reads of the same library must agree however the rows arrived."""
    a = [clause("DP-H-014"), clause("LC-S-009", cat="Liability Cap", sev=STANDARD)]
    assert Snapshot.build(a).snapshot_id == Snapshot.build(list(reversed(a))).snapshot_id


def test_changing_a_clause_changes_the_snapshot_id(snap):
    other = Snapshot.build(list(snap.clauses) + [clause("IN-S-005", cat="Insurance", sev=STANDARD)],
                           ladders=snap.ladders)
    assert other.snapshot_id != snap.snapshot_id


def test_changing_only_a_ladder_changes_the_snapshot_id(snap):
    """CLA §9: ladders change which clauses are ELIGIBLE, so pinning the clause
    library alone would let the same manifest resolve differently."""
    moved = Ladder("Data Privacy", HIGH,
                   rungs=("DP-H-014@v1", "DP-H-061@v1", "DP-H-052@v1"), floor_rung=2)
    other = Snapshot.build(snap.clauses, ladders=[moved])
    assert other.snapshot_id != snap.snapshot_id


def test_result_is_bound_to_the_snapshot_that_produced_it(snap):
    r = resolve(Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),)), snap)
    assert r.snapshot_id == snap.snapshot_id


def test_selection_does_not_depend_on_input_order():
    a = [clause("DP-H-052"), clause("DP-H-014"), clause("DP-H-061")]
    m = Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),))
    first = resolve(m, Snapshot.build(a))
    second = resolve(m, Snapshot.build(list(reversed(a))))
    assert first.result_hash == second.result_hash
    assert first.decisions[0].selected.ref == second.decisions[0].selected.ref


def test_selection_is_stable_without_snapshot_normalisation():
    """The test above passes on Snapshot.build's sorting alone, so it never
    exercises the engine's own ordering. This bypasses build and constructs a
    snapshot directly — the path any caller assembling one by hand would take."""
    a = (clause("DP-H-052"), clause("DP-H-014"), clause("DP-H-061"))
    m = Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),))
    first = resolve(m, Snapshot(clauses=a, snapshot_id="fixed"))
    second = resolve(m, Snapshot(clauses=tuple(reversed(a)), snapshot_id="fixed"))
    assert first.decisions[0].selected.ref == second.decisions[0].selected.ref
    assert first.result_hash == second.result_hash


# ── Ladder descent ─────────────────────────────────────────────────────────


def test_descend_one_rung(snap):
    d = descend(snap, "Data Privacy", HIGH, "DP-H-014@v1")
    assert not d.escalate
    assert d.rung == 1
    assert d.accepted.ref == "DP-H-052@v1"


def test_descend_to_the_floor_is_allowed(snap):
    d = descend(snap, "Data Privacy", HIGH, "DP-H-052@v1")
    assert not d.escalate
    assert d.rung == 2
    assert "(floor)" in d.reason


def test_below_the_floor_always_escalates(snap):
    d = descend(snap, "Data Privacy", HIGH, "DP-H-061@v1")
    assert d.escalate
    assert d.accepted is None


def test_below_the_floor_escalates_even_when_lower_rungs_exist():
    """The fixture ladder's floor is also its last rung, so removing the floor
    check there still escalates via 'ladder exhausted' — the floor itself goes
    untested. A ladder may document positions BELOW the floor (asks we know
    vendors make and refuse), and reaching one must escalate, not descend."""
    s = Snapshot.build(
        [clause("DP-H-014"), clause("DP-H-052"), clause("DP-H-061"), clause("DP-H-070")],
        ladders=[Ladder("Data Privacy", HIGH,
                        rungs=("DP-H-014@v1", "DP-H-052@v1", "DP-H-061@v1", "DP-H-070@v1"),
                        floor_rung=2)],
    )
    at_floor = descend(s, "Data Privacy", HIGH, "DP-H-052@v1")
    assert not at_floor.escalate and at_floor.rung == 2

    below = descend(s, "Data Privacy", HIGH, "DP-H-061@v1")
    assert below.escalate, "rung 3 exists but is below the floor — must not be taken"
    assert below.accepted is None
    assert "below the floor" in below.reason


def test_missing_ladder_escalates_rather_than_improvising(snap):
    d = descend(snap, "Liability Cap", STANDARD, "LC-S-009@v1")
    assert d.escalate
    assert "No ladder defined" in d.reason


def test_a_degraded_ladder_is_not_silently_collapsed(snap):
    """Closing the gap over an unusable rung would quietly lower the floor."""
    broken = Ladder("Data Privacy", HIGH,
                    rungs=("DP-H-014@v1", "DP-H-052@v1", "DP-H-061@v1"),
                    floor_rung=2, status="degraded")
    s = Snapshot.build(snap.clauses, ladders=[broken])
    d = descend(s, "Data Privacy", HIGH, "DP-H-014@v1")
    assert d.escalate
    assert "degraded" in d.reason


def test_unknown_current_position_escalates(snap):
    d = descend(snap, "Data Privacy", HIGH, "DP-S-003@v1")
    assert d.escalate
    assert "not a rung" in d.reason


def test_a_rung_that_lapsed_escalates():
    s = Snapshot.build(
        [clause("DP-H-014"), clause("DP-H-052", selectable=False, state=EXPIRED)],
        ladders=[Ladder("Data Privacy", HIGH,
                        rungs=("DP-H-014@v1", "DP-H-052@v1"), floor_rung=1)],
    )
    d = descend(s, "Data Privacy", HIGH, "DP-H-014@v1")
    assert d.escalate
    assert "not selectable" in d.reason


# ── The invariant ──────────────────────────────────────────────────────────


def test_every_selected_body_came_from_the_snapshot(snap):
    """ADR-0001: no string reaching a contract may be produced by anything but
    the library. Every body must be byte-identical to a snapshot clause."""
    m = Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH), Risk("Liability Cap", HIGH)))
    bodies = {c.body for c in snap.clauses}
    for d in resolve(m, snap).decisions:
        if d.selected:
            assert d.selected.body in bodies
