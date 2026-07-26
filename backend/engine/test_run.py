"""Run store tests — and the reproducibility guarantee, actually tested.

The central test here is `test_a_run_reproduces_years_later`. It stores a run,
then mutates the live library the way three years of Legal activity would —
retiring clauses, superseding them, letting them expire — and checks the stored
run still rebuilds to the same snapshot id and the same decisions.

That is the difference between claiming determinism and having it.
"""

import json
from dataclasses import replace
from datetime import date

import pytest

from engine.manifest import CategoryMap, UnknownCategory
from engine.model import (
    AI_DRAFTED,
    ENGINE_VERSION,
    EXPIRED,
    HIGH,
    LEGAL_AUTHORED,
    RETIRED,
    STANDARD,
    Clause,
    Ladder,
    Manifest,
    Risk,
)
from engine.resolution import resolve
from engine.run import (
    SnapshotIncomplete,
    ladder_status,
    ruleset_rows,
    run_rows,
    snapshot_from_rows,
    snapshot_rows,
)
from engine.snapshot import Snapshot
from engine.validation import ConflictRule, RuleSet, validate

# Stands in for `select key, label from cw.category`. Storage speaks keys, the
# engine speaks labels; db/test/writer-sql.test.mjs runs the same translation
# against the real table.
CATEGORIES = CategoryMap.from_rows([
    {"key": "data", "label": "Data Privacy"},
    {"key": "disp", "label": "Dispute Resolution"},
    {"key": "liab", "label": "Liability Cap"},
    {"key": "defs", "label": "Definitions"},
    {"key": "secu", "label": "Security"},
    {"key": "insu", "label": "Insurance"},
])


def clause(cid, ver=1, cat="Data Privacy", sev=HIGH, *tags, selectable=True, **kw):
    return Clause(clause_id=cid, version=ver, category=cat, severity=sev,
                  title=f"{cid} title", body=f"Body of {cid}.",
                  selectable=selectable, tags=tuple(tags), **kw)


def library():
    return [
        clause("DP-H-014", 1, "Data Privacy", HIGH, "jurisdiction:ny", "data:regulated"),
        clause("DP-H-052", 1, "Data Privacy", HIGH),
        clause("DP-S-003", 1, "Data Privacy", STANDARD),
        clause("DR-S-044", 1, "Dispute Resolution", STANDARD, "jurisdiction:london"),
        clause("LC-S-009", 1, "Liability Cap", STANDARD),
        clause("DF-B-001", 1, "Definitions", STANDARD,
               always_include=True, framework_section="1.1"),
        # Already unusable when the snapshot was taken. Without at least one of
        # these the frozen `selectable` flag is never load-bearing, and a rebuild
        # that ignored it would still reproduce — so the guarantee would be
        # untested. The clause rows fed to a rebuild deliberately carry no
        # `selectable` column, because the live registry has no memory of it.
        clause("SC-H-012", 1, "Security", HIGH, selectable=False, state=RETIRED),
    ]


LADDERS = [Ladder("Data Privacy", HIGH,
                  rungs=("DP-H-014@v1", "DP-H-052@v1"), floor_rung=1)]

RULES = RuleSet.build([
    ConflictRule("GL-001", 1, "Mixed governing law", HIGH, "Different jurisdictions",
                 "Law and forum disagree.", {"conflicting_values": "jurisdiction"}, "R. Vance"),
])

MANIFEST = Manifest(vendor="Northwind Analytics", value="$240K", source="llm",
                    risks=(Risk("Data Privacy", HIGH, "EU PII in scope"),
                           Risk("Dispute Resolution", STANDARD, "cross-border"),
                           Risk("Insurance", HIGH, "no clause exists")))


def clause_rows_from(clauses):
    """Stand in for cw.clause_version joined to cw.clause — immutable content."""
    return [
        {"clause_id": c.clause_id, "version": c.version, "category": c.category,
         "severity": c.severity, "title": c.title, "body": c.body,
         "state": c.state, "always_include": c.always_include,
         "framework_section": c.framework_section,
         "provenance_gap": c.provenance_gap, "tags": list(c.tags)}
        for c in clauses
    ]


# ── Serialisation ──────────────────────────────────────────────────────────


def test_run_rows_pin_both_the_library_and_the_rules():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = run_rows("RUN-001", MANIFEST, res, val, CATEGORIES, created_by="buyer@cw")
    run = rows["run"][0]
    assert run["snapshot_id"] == snap.snapshot_id
    assert run["ruleset_id"] == RULES.ruleset_id
    assert run["result_hash"] == res.result_hash


def test_the_manifest_source_survives_into_the_record():
    """A contract assembled by the fallback classifier is a different artefact
    from one the model produced. The record must say which."""
    snap = Snapshot.build(library(), LADDERS)
    fallback = Manifest(vendor="N", source="fallback", risks=MANIFEST.risks)
    rows = run_rows("RUN-002", fallback, resolve(fallback, snap),
                    validate([], RULES), CATEGORIES, created_by="buyer@cw")
    assert rows["run"][0]["manifest_source"] == "fallback"


def test_unresolved_decisions_are_recorded_as_null_not_omitted():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    rows = run_rows("RUN-003", MANIFEST, res, validate(res.decisions, RULES),
                    CATEGORIES, created_by="buyer@cw")
    insurance = [d for d in rows["run_decision"] if d["category_key"] == "insu"]
    assert len(insurance) == 1
    assert insurance[0]["clause_id"] is None
    assert insurance[0]["reason"] == "No clause available in Ledger"


def test_suppressed_candidates_are_recorded():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    rows = run_rows("RUN-004", MANIFEST, res, validate(res.decisions, RULES),
                    CATEGORIES, created_by="buyer@cw")
    dp = [d for d in rows["run_decision"] if d["category_key"] == "data"][0]
    assert dp["suppressed"], "the audit question is usually 'why not the stricter one?'"


def test_findings_are_recorded_with_their_rule_version():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = run_rows("RUN-005", MANIFEST, res, val, CATEGORIES, created_by="buyer@cw")
    assert rows["run_finding"], "mixed jurisdictions should have fired"
    f = rows["run_finding"][0]
    assert f["rule_id"] == "GL-001" and f["rule_version"] == 1


def test_snapshot_rows_carry_the_frozen_selectable_flag():
    snap = Snapshot.build(library(), LADDERS)
    rows = snapshot_rows(snap, CATEGORIES)
    retired = [m for m in rows["snapshot_member"] if m["clause_id"] == "SC-H-012"][0]
    assert retired["selectable"] is False


def test_snapshot_rows_pin_the_ladder_with_its_floor():
    snap = Snapshot.build(library(), LADDERS)
    rungs = snapshot_rows(snap, CATEGORIES)["snapshot_ladder_rung"]
    assert [r["rung"] for r in rungs] == [0, 1]
    assert [r["is_floor"] for r in rungs] == [False, True]


def test_ruleset_rows_name_each_rule_version():
    rows = ruleset_rows(RULES)
    assert rows["ruleset_member"][0] == {
        "ruleset_id": RULES.ruleset_id, "rule_id": "GL-001", "version": 1}


# ── Round trip ─────────────────────────────────────────────────────────────


def test_a_stored_snapshot_rebuilds_to_the_same_id():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap, CATEGORIES)
    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)
    assert rebuilt.snapshot_id == snap.snapshot_id


def test_a_snapshot_that_cannot_be_rebuilt_says_so():
    """A stored member with no clause row must raise, not be quietly skipped.

    Skipping it built a SMALLER library and returned it under the requested
    snapshot's name (WP-24, finding E8). The id differs, so the failure was
    detectable — but only by a caller who thought to compare it, and the whole
    reason to rebuild a snapshot is to trust what comes back. Clause versions
    are immutable and never deleted, so a missing row means the query did not
    fetch everything, or the library is not the one the snapshot was taken
    against. Neither is something to approximate around.
    """
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap, CATEGORIES)
    short = [r for r in clause_rows_from(library())
             if r["clause_id"] != library()[0].clause_id]

    with pytest.raises(SnapshotIncomplete) as e:
        snapshot_from_rows(rows["snapshot_member"], short,
                           rows["snapshot_ladder_rung"], date(2026, 7, 25),
                           categories=CATEGORIES)
    assert library()[0].clause_id in str(e.value), "the error must name what is missing"


def test_a_complete_rebuild_is_unaffected():
    """The positive control for the raise above: nothing missing, nothing raised."""
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap, CATEGORIES)
    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)
    assert rebuilt.snapshot_id == snap.snapshot_id


def test_rebuilding_ignores_clauses_outside_the_snapshot():
    """The library grows. A clause added after the run must not appear in it."""
    snap = Snapshot.build(library(), LADDERS)
    rows = snapshot_rows(snap, CATEGORIES)
    later = library() + [clause("IN-H-006", 1, "Insurance", HIGH)]
    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(later),
                                 rows["snapshot_ladder_rung"],
                                 categories=CATEGORIES)
    assert rebuilt.snapshot_id == snap.snapshot_id
    assert rebuilt.by_ref("IN-H-006@v1") is None


def test_a_run_reproduces_years_later():
    """The guarantee, end to end.

    Store a run, then age the library the way three years of Legal activity
    would: retire one clause, expire another, supersede a third. The stored run
    must still rebuild to the same snapshot and the same decisions.
    """
    original = library()
    snap = Snapshot.build(original, LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    stored = snapshot_rows(snap, CATEGORIES)

    # Three years pass. The live library is now a different thing entirely.
    aged = [
        clause("DP-H-014", 1, "Data Privacy", HIGH, "jurisdiction:ny", "data:regulated",
               selectable=False, state=RETIRED),
        clause("DP-H-052", 1, "Data Privacy", HIGH, selectable=False, state=EXPIRED),
        clause("DP-S-003", 1, "Data Privacy", STANDARD, selectable=False, state=RETIRED),
        clause("DR-S-044", 1, "Dispute Resolution", STANDARD, "jurisdiction:london",
               selectable=False, state=EXPIRED),
        clause("LC-S-009", 1, "Liability Cap", STANDARD, selectable=False, state=RETIRED),
        clause("DF-B-001", 1, "Definitions", STANDARD, selectable=False, state=RETIRED,
               always_include=True, framework_section="1.1"),
        # Still present: clause versions are never deleted, only retired.
        clause("SC-H-012", 1, "Security", HIGH, selectable=False, state=RETIRED),
        # And plenty of new language nobody had written at the time.
        clause("DP-H-900", 1, "Data Privacy", HIGH),
        clause("DR-S-901", 1, "Dispute Resolution", STANDARD),
    ]

    # Bodies are still retrievable because clause versions are never deleted.
    rebuilt = snapshot_from_rows(stored["snapshot_member"], clause_rows_from(aged),
                                 stored["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)

    assert rebuilt.snapshot_id == snap.snapshot_id, (
        "the frozen selectable flags must win over today's library state")

    replayed = resolve(MANIFEST, rebuilt)
    assert replayed.result_hash == res.result_hash
    assert [d.selected.ref if d.selected else None for d in replayed.decisions] == \
           [d.selected.ref if d.selected else None for d in res.decisions]


def test_todays_library_would_give_a_different_answer():
    """Control for the test above: if the frozen flags were ignored and today's
    library used instead, the result WOULD differ. Without this, the test above
    could pass on a coincidence."""
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    today = Snapshot.build(
        [clause("DP-H-900", 1, "Data Privacy", HIGH),
         clause("DR-S-901", 1, "Dispute Resolution", STANDARD)], [])
    assert resolve(MANIFEST, today).result_hash != res.result_hash


def test_validation_replays_from_the_stored_snapshot():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = snapshot_rows(snap, CATEGORIES)

    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)
    replayed = validate(resolve(MANIFEST, rebuilt).decisions, RULES)
    assert [f.rule_version for f in replayed.findings] == \
           [f.rule_version for f in val.findings], "tags must survive the round trip"


# ── What the snapshot hash covers ──────────────────────────────────────────


def test_retiring_a_clause_does_not_change_the_snapshot_id():
    """`state` is descriptive and mutable; resolution never reads it. If it were
    hashed, every stored run would stop reproducing the first time Legal tidied
    the library — for no benefit, since the outcome is identical."""
    before = Snapshot.build(library(), LADDERS)
    aged = [Clause(**{**c.__dict__, "state": RETIRED}) for c in library()]
    assert Snapshot.build(aged, LADDERS).snapshot_id == before.snapshot_id


def test_changing_selectability_DOES_change_the_snapshot_id():
    """The control for the test above: what resolution actually reads must be
    hashed, or two libraries that resolve differently could share an id."""
    before = Snapshot.build(library(), LADDERS)
    lib = library()
    lib[0] = Clause(**{**lib[0].__dict__, "selectable": False})
    assert Snapshot.build(lib, LADDERS).snapshot_id != before.snapshot_id


def test_provenance_gap_is_hashed_so_warnings_reproduce():
    before = Snapshot.build(library(), LADDERS)
    lib = library()
    lib[0] = Clause(**{**lib[0].__dict__, "provenance_gap": True})
    assert Snapshot.build(lib, LADDERS).snapshot_id != before.snapshot_id


# ── Ladder status: derived on rebuild, not assumed (E1) ────────────────────
#
# The snapshot fingerprint includes each ladder's status, because resolution
# refuses to descend anything that is not `intact`. Nothing stored it and the
# rebuild hard-coded "intact", so any run taken while a ladder was degraded
# could never be reproduced — and every fixture used an intact ladder, so
# nothing noticed.


def degraded_library():
    """The same library with rung 0 of the Data Privacy ladder unusable.

    A state `cw.ladder_health` can actually emit: a non-floor rung is
    unselectable while the floor rung is fine, which the view calls `degraded`.
    A fixture in a state the view cannot produce would prove nothing.
    """
    lib = library()
    lib[0] = Clause(**{**lib[0].__dict__, "selectable": False, "state": EXPIRED})
    return lib


DEGRADED_LADDERS = [Ladder("Data Privacy", HIGH,
                           rungs=("DP-H-014@v1", "DP-H-052@v1"), floor_rung=1,
                           status="degraded")]


def test_ladder_status_mirrors_the_health_view_precedence():
    """The five states of cw.ladder_health, in the view's own precedence."""
    def rung(cid, is_floor=False):
        return {"clause_id": cid, "version": 1, "is_floor": is_floor}

    ok = {("A", 1): True, ("B", 1): True}
    floor_broken = {("A", 1): True, ("B", 1): False}
    top_broken = {("A", 1): False, ("B", 1): True}
    both_broken = {("A", 1): False, ("B", 1): False}

    assert ladder_status([], {}) == "empty"
    assert ladder_status([rung("A"), rung("B")], ok) == "floorless"
    assert ladder_status([rung("A"), rung("B", True)], both_broken) == "floor_unusable"
    assert ladder_status([rung("A"), rung("B", True)], floor_broken) == "floor_unusable"
    assert ladder_status([rung("A"), rung("B", True)], top_broken) == "degraded"
    assert ladder_status([rung("A"), rung("B", True)], ok) == "intact"


def test_a_degraded_ladder_survives_the_round_trip():
    snap = Snapshot.build(degraded_library(), DEGRADED_LADDERS, date(2026, 7, 25))
    assert snap.ladders[0].status == "degraded", "the fixture must really be degraded"
    rows = snapshot_rows(snap, CATEGORIES)
    rebuilt = snapshot_from_rows(rows["snapshot_member"],
                                 clause_rows_from(degraded_library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)
    assert rebuilt.ladders[0].status == "degraded"
    assert rebuilt.snapshot_id == snap.snapshot_id


def test_a_run_taken_on_a_degraded_ladder_reproduces_years_later():
    """The guarantee from `test_a_run_reproduces_years_later`, for the case that
    could never have held before: the ladder was already damaged at run time."""
    snap = Snapshot.build(degraded_library(), DEGRADED_LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    stored = snapshot_rows(snap, CATEGORIES)

    aged = [Clause(**{**c.__dict__, "selectable": False, "state": RETIRED})
            for c in degraded_library()] + [clause("DP-H-900", 1, "Data Privacy", HIGH)]

    rebuilt = snapshot_from_rows(stored["snapshot_member"], clause_rows_from(aged),
                                 stored["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)
    assert rebuilt.snapshot_id == snap.snapshot_id
    assert resolve(MANIFEST, rebuilt).result_hash == res.result_hash


def test_assuming_the_ladder_was_intact_would_give_a_different_id():
    """Control for the two tests above. If the rebuild kept hard-coding
    "intact" — the old behaviour — the ids would differ, so those tests are not
    passing by coincidence."""
    degraded = Snapshot.build(degraded_library(), DEGRADED_LADDERS, date(2026, 7, 25))
    assumed_intact = Snapshot.build(
        degraded_library(),
        [Ladder(**{**DEGRADED_LADDERS[0].__dict__, "status": "intact"})],
        date(2026, 7, 25))
    assert assumed_intact.snapshot_id != degraded.snapshot_id


def test_a_rungless_ladder_is_refused_rather_than_quietly_lost():
    """It is in the fingerprint but has no row to be stored in, so storing the
    snapshot would produce something that cannot rebuild. Unreachable from the
    registry — LADDER_SQL drops empty ladders — so refusing costs nothing."""
    snap = Snapshot.build(library(), [Ladder("Security", HIGH, rungs=(),
                                             floor_rung=-1, status="empty")])
    with pytest.raises(ValueError, match="no rungs"):
        snapshot_rows(snap, CATEGORIES)


def test_a_rung_outside_the_snapshot_fails_loudly():
    """Stored rows that disagree with each other must not be papered over with a
    guessed status — that resurfaces later as an unexplained id mismatch."""
    with pytest.raises(ValueError, match="not a member"):
        ladder_status([{"clause_id": "GHOST", "version": 1, "is_floor": True}], {})


# ── The seam: labels in the engine, keys in the database (E2) ──────────────


def test_snapshot_rows_emit_the_category_key_not_the_label():
    """cw.snapshot_ladder_rung.category_key has an FK to cw.category(key). A
    label here does not fail a test — it fails an INSERT in production."""
    rows = snapshot_rows(Snapshot.build(library(), LADDERS), CATEGORIES)
    assert {r["category_key"] for r in rows["snapshot_ladder_rung"]} == {"data"}


def test_run_decisions_emit_the_category_key_not_the_label():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    rows = run_rows("RUN-006", MANIFEST, res, validate(res.decisions, RULES),
                    CATEGORIES, created_by="buyer@cw")
    assert all(d["category_key"] in CATEGORIES.key_to_label for d in rows["run_decision"])
    assert "category" not in rows["run_decision"][0]


def test_the_key_is_translated_back_to_a_label_on_rebuild():
    """The mirror half, and the one that survives fixing the write side: the
    fingerprint hashes Ladder.category, so leaving the key there changes the id."""
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap, CATEGORIES)
    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25),
                                 categories=CATEGORIES)
    assert rebuilt.ladders[0].category == "Data Privacy"
    assert rebuilt.snapshot_id == snap.snapshot_id


def test_a_category_the_registry_does_not_define_cannot_be_stored():
    snap = Snapshot.build(library(), [Ladder("Invented", HIGH,
                                             rungs=("XX-H-001@v1",), floor_rung=0)])
    with pytest.raises(UnknownCategory):
        snapshot_rows(snap, CATEGORIES)


def test_dropped_risks_are_recorded_in_the_run_but_never_resolved():
    """A hallucinated category is a fault in the model's output, not a hole in
    the library. It is recorded as dropped and never becomes a decision."""
    snap = Snapshot.build(library(), LADDERS)
    hallucinated = Manifest(vendor="N", source="llm", risks=MANIFEST.risks,
                            dropped=(Risk("Quantum Indemnity", HIGH, "invented"),))
    res = resolve(hallucinated, snap)
    rows = run_rows("RUN-007", hallucinated, res, validate(res.decisions, RULES),
                    CATEGORIES, created_by="buyer@cw")
    stored = json.loads(rows["run"][0]["manifest"])
    assert stored["dropped"] == [{"category": "Quantum Indemnity", "severity": HIGH,
                                  "justification": "invented",
                                  "reason": "unknown category"}]
    assert not any(d["category_key"] == "Quantum Indemnity" for d in rows["run_decision"])


# ── Origin, and the two figures it makes computable (WP-17, ADR-0010) ──────
#
# `origin` says who composed the words. It is deliberately NOT part of the
# snapshot fingerprint (settled decision S0-4): the fingerprint covers exactly
# what determines the OUTCOME, and on a pinned (clause_id, version) the origin
# cannot change the body, cannot change `selectable`, and is read by nothing in
# resolution. Hashing it would break every stored run the first time a
# provenance backfill ran, and would buy nothing.


GOLDEN_SNAPSHOT_ID = "de62f0807ac80e68f121db09377fe4518b03735c71ab3d13e17163b24a3a46f2"


def test_no_stored_snapshot_id_changes():
    """The pinned value, from before origin existed.

    A test asserting only that two snapshots agree with each other would still
    pass if the fingerprint changed for both. This is the one that notices."""
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    assert snap.snapshot_id == GOLDEN_SNAPSHOT_ID, (
        "the snapshot fingerprint moved — every stored run just stopped "
        "reproducing, and nothing about a clause's origin can justify that")


def test_origin_is_not_in_the_snapshot_fingerprint():
    plain = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    drafted = Snapshot.build(
        [replace(c, origin=AI_DRAFTED) for c in library()], LADDERS, date(2026, 7, 25))
    assert drafted.snapshot_id == plain.snapshot_id
    assert all(c.origin == AI_DRAFTED for c in drafted.clauses), (
        "…and the origin is still carried, it is simply not hashed")


def test_origin_survives_the_round_trip_without_moving_the_id():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap, CATEGORIES)
    clause_rows = clause_rows_from(library())
    for r in clause_rows:
        r["origin"] = AI_DRAFTED if r["clause_id"] == "DP-H-014" else "legal_authored"
    back = snapshot_from_rows(rows["snapshot_member"], clause_rows,
                              rows["snapshot_ladder_rung"], date(2026, 7, 25),
                              categories=CATEGORIES)
    assert back.snapshot_id == GOLDEN_SNAPSHOT_ID
    assert back.by_ref("DP-H-014@v1").origin == AI_DRAFTED


def test_a_clause_row_with_no_origin_reads_as_legal_authored():
    """The library as it stands today: every word composed by a lawyer. The
    default is the honest one, not a null that a report would have to guess at."""
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap, CATEGORIES)
    back = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                              rows["snapshot_ladder_rung"], date(2026, 7, 25),
                              categories=CATEGORIES)
    assert all(c.origin == LEGAL_AUTHORED for c in back.clauses)


# ── Which engine produced the hash (WP-32) ─────────────────────────────────


def test_a_run_records_which_engine_produced_its_result_hash():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = run_rows("RUN-001", MANIFEST, res, val, CATEGORIES, created_by="buyer@cw")
    assert rows["run"][0]["engine_version"] == ENGINE_VERSION
    assert rows["run"][0]["result_hash"] == res.result_hash, (
        "the pin is only worth anything alongside the hash it qualifies")


def test_the_engine_version_can_be_overridden_for_a_replay():
    """Replaying an old run records the engine that ORIGINALLY produced it, not
    the one doing the replay. A pin that always reports 'now' pins nothing."""
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = run_rows("RUN-OLD", MANIFEST, res, val, CATEGORIES, created_by="buyer@cw",
                    engine_version="clausewerk-engine/1")
    assert rows["run"][0]["engine_version"] == "clausewerk-engine/1"


def test_both_provenance_counts_ride_on_the_run_record():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = run_rows("RUN-001", MANIFEST, res, val, CATEGORIES, created_by="buyer@cw",
                    authored_chars=0, ai_origin_chars=412)
    assert rows["run"][0]["authored_chars"] == 0
    assert rows["run"][0]["ai_origin_chars"] == 412
