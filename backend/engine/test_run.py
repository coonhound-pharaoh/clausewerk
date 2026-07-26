"""Run store tests — and the reproducibility guarantee, actually tested.

The central test here is `test_a_run_reproduces_years_later`. It stores a run,
then mutates the live library the way three years of Legal activity would —
retiring clauses, superseding them, letting them expire — and checks the stored
run still rebuilds to the same snapshot id and the same decisions.

That is the difference between claiming determinism and having it.
"""

from datetime import date

from engine.model import EXPIRED, HIGH, RETIRED, STANDARD, Clause, Ladder, Manifest, Risk
from engine.resolution import resolve
from engine.run import (
    ruleset_rows,
    run_rows,
    snapshot_from_rows,
    snapshot_rows,
)
from engine.snapshot import Snapshot
from engine.validation import ConflictRule, RuleSet, validate


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
    rows = run_rows("RUN-001", MANIFEST, res, val, created_by="buyer@cw")
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
                    validate([], RULES), created_by="buyer@cw")
    assert rows["run"][0]["manifest_source"] == "fallback"


def test_unresolved_decisions_are_recorded_as_null_not_omitted():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    rows = run_rows("RUN-003", MANIFEST, res, validate(res.decisions, RULES),
                    created_by="buyer@cw")
    insurance = [d for d in rows["run_decision"] if d["category"] == "Insurance"]
    assert len(insurance) == 1
    assert insurance[0]["clause_id"] is None
    assert insurance[0]["reason"] == "No clause available in Ledger"


def test_suppressed_candidates_are_recorded():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    rows = run_rows("RUN-004", MANIFEST, res, validate(res.decisions, RULES),
                    created_by="buyer@cw")
    dp = [d for d in rows["run_decision"] if d["category"] == "Data Privacy"][0]
    assert dp["suppressed"], "the audit question is usually 'why not the stricter one?'"


def test_findings_are_recorded_with_their_rule_version():
    snap = Snapshot.build(library(), LADDERS)
    res = resolve(MANIFEST, snap)
    val = validate(res.decisions, RULES)
    rows = run_rows("RUN-005", MANIFEST, res, val, created_by="buyer@cw")
    assert rows["run_finding"], "mixed jurisdictions should have fired"
    f = rows["run_finding"][0]
    assert f["rule_id"] == "GL-001" and f["rule_version"] == 1


def test_snapshot_rows_carry_the_frozen_selectable_flag():
    snap = Snapshot.build(library(), LADDERS)
    rows = snapshot_rows(snap)
    retired = [m for m in rows["snapshot_member"] if m["clause_id"] == "SC-H-012"][0]
    assert retired["selectable"] is False


def test_snapshot_rows_pin_the_ladder_with_its_floor():
    snap = Snapshot.build(library(), LADDERS)
    rungs = snapshot_rows(snap)["snapshot_ladder_rung"]
    assert [r["rung"] for r in rungs] == [0, 1]
    assert [r["is_floor"] for r in rungs] == [False, True]


def test_ruleset_rows_name_each_rule_version():
    rows = ruleset_rows(RULES)
    assert rows["ruleset_member"][0] == {
        "ruleset_id": RULES.ruleset_id, "rule_id": "GL-001", "version": 1}


# ── Round trip ─────────────────────────────────────────────────────────────


def test_a_stored_snapshot_rebuilds_to_the_same_id():
    snap = Snapshot.build(library(), LADDERS, date(2026, 7, 25))
    rows = snapshot_rows(snap)
    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25))
    assert rebuilt.snapshot_id == snap.snapshot_id


def test_rebuilding_ignores_clauses_outside_the_snapshot():
    """The library grows. A clause added after the run must not appear in it."""
    snap = Snapshot.build(library(), LADDERS)
    rows = snapshot_rows(snap)
    later = library() + [clause("IN-H-006", 1, "Insurance", HIGH)]
    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(later),
                                 rows["snapshot_ladder_rung"])
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
    stored = snapshot_rows(snap)

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
                                 stored["snapshot_ladder_rung"], date(2026, 7, 25))

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
    rows = snapshot_rows(snap)

    rebuilt = snapshot_from_rows(rows["snapshot_member"], clause_rows_from(library()),
                                 rows["snapshot_ladder_rung"], date(2026, 7, 25))
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
