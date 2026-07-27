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


def test_section_1_10_follows_1_9_not_1_1():
    """Sections are numbers a reader counts through, not words. Sorted as
    text, 1.10 lands between 1.1 and 1.2 — invisible until the first library
    with ten framework sections, and the document would then number its
    sections in that wrong order. (The test above cannot catch this: with
    single-digit fixtures, text order and numeric order agree.)"""
    snap = Snapshot.build(
        clauses=[
            clause("BF-B-010", cat="Notices", sev=STANDARD,
                   always_include=True, framework_section="1.10"),
            clause("BF-B-002", cat="Order of Precedence", sev=STANDARD,
                   always_include=True, framework_section="1.2"),
            clause("BF-B-009", cat="Assignment", sev=STANDARD,
                   always_include=True, framework_section="1.9"),
            clause("BF-B-001", cat="Definitions", sev=STANDARD,
                   always_include=True, framework_section="1.1"),
        ],
        taken_on=date(2026, 7, 25),
    )
    r = resolve(Manifest(vendor="N"), snap)
    sections = [d.selected.framework_section for d in r.decisions if d.baseline]
    assert sections == ["1.1", "1.2", "1.9", "1.10"], (
        "framework sections are printing out of order — a reader walking the "
        "contract meets §1.10 before §1.2")


def test_a_lapsed_always_include_clause_gates_it_does_not_vanish(snap):
    """E4. If Definitions expires, the contract must not simply come out one
    section shorter with nothing said. It is a decision record, and a loud one."""
    library = [c for c in snap.clauses if c.clause_id != "DF-B-001"]
    library.append(clause("DF-B-001", cat="Definitions", sev=STANDARD,
                          always_include=True, framework_section="1.1",
                          state=EXPIRED, selectable=False,
                          expires_on=date(2025, 1, 1)))
    s = Snapshot.build(library, ladders=snap.ladders)

    r = resolve(Manifest(vendor="Northwind"), s)
    baseline = [d for d in r.decisions if d.baseline]

    # The section is still accounted for — it did not disappear.
    assert len(baseline) == 2
    gap = [d for d in baseline if d.selected is None]
    assert len(gap) == 1, "the lapsed baseline clause left no decision record"
    d = gap[0]
    assert d.unresolved
    assert d.expired_only, "same vocabulary as the risk pass: lapsed, not absent"
    assert d.risk.category == "Definitions"
    assert "1 candidate(s) retired or expired" in d.reason
    assert d.warning and "every version has lapsed" in d.warning
    # And it is loud where a caller actually looks.
    assert d in r.unresolved
    assert d in r.warnings


def test_a_baseline_clause_with_a_lapsed_older_version_still_resolves(snap):
    """The gate must fire on 'no version is usable', not on 'some version lapsed'."""
    library = list(snap.clauses)
    library.append(clause("DF-B-001", ver=2, cat="Definitions", sev=STANDARD,
                          always_include=True, framework_section="1.1"))
    library = [c for c in library if not (c.clause_id == "DF-B-001" and c.version == 1)]
    library.append(clause("DF-B-001", ver=1, cat="Definitions", sev=STANDARD,
                          always_include=True, framework_section="1.1",
                          state=EXPIRED, selectable=False))
    r = resolve(Manifest(vendor="N"), Snapshot.build(library))
    d = [x for x in r.decisions if x.baseline and x.risk.category == "Definitions"][0]
    assert d.selected is not None and d.selected.ref == "DF-B-001@v2"
    assert not d.expired_only


def test_a_never_present_baseline_category_is_not_invented(snap):
    """The counterpart: a framework section the library never had produces no
    baseline decision at all. Nothing here fabricates a section."""
    r = resolve(Manifest(vendor="N"), snap)
    cats = {d.risk.category for d in r.decisions if d.baseline}
    assert "Order of Precedence" in cats
    assert "Force Majeure" not in cats


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


def test_the_newest_selectable_version_wins():
    """E3a. Two versions of one clause are both selectable — the usual state
    while a superseded version runs off beside its replacement. The newer
    wording is the one Legal approved most recently, and it is the one that
    must reach the contract."""
    library = [
        clause("DP-H-014", ver=1, body="Notify within 72 hours."),
        clause("DP-H-014", ver=3, body="Notify within 24 hours."),
        clause("DP-H-014", ver=2, body="Notify within 48 hours."),
    ]
    m = Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),))
    d = resolve(m, Snapshot.build(library)).decisions[0]
    assert d.selected.version == 3, f"picked v{d.selected.version}, not the newest"
    assert d.selected.body == "Notify within 24 hours."
    # The older versions are still on the record as what lost.
    assert {c.version for c in d.suppressed} == {1, 2}


def test_a_lapsed_newer_version_does_not_beat_a_live_older_one():
    """Newest-SELECTABLE-wins. A newer version that has been retired is not a
    candidate at all, so the live older version still stands."""
    library = [
        clause("DP-H-014", ver=1, body="Notify within 72 hours."),
        clause("DP-H-014", ver=2, body="Notify within 24 hours.",
               state=RETIRED, selectable=False),
    ]
    m = Manifest(vendor="N", risks=(Risk("Data Privacy", HIGH),))
    d = resolve(m, Snapshot.build(library)).decisions[0]
    assert d.selected.version == 1


def test_the_newest_baseline_version_wins():
    """The always-include pass obeys the same rule as the risk pass."""
    library = [
        clause("DF-B-001", ver=1, cat="Definitions", sev=STANDARD,
               always_include=True, framework_section="1.1"),
        clause("DF-B-001", ver=2, cat="Definitions", sev=STANDARD,
               always_include=True, framework_section="1.1"),
    ]
    r = resolve(Manifest(vendor="N"), Snapshot.build(library))
    baseline = [d for d in r.decisions if d.baseline]
    assert len(baseline) == 1, "one clause, one section — not one per version"
    assert baseline[0].selected.ref == "DF-B-001@v2"


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
