"""Mutation check for the resolution engine.

The SQL layer has one of these and it has caught three real faults. The engine
gets the same treatment: break one guarantee at a time, confirm the tests notice.

    python engine/mutation_check.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

MUTATIONS = [
    (
        "unselectable clauses may be chosen",
        "resolution.py",
        "candidates = _order(c for c in everything if c.selectable)",
        "candidates = _order(everything)",
        "test_unselectable_clauses_never_reach_a_contract",
    ),
    (
        "candidate order is not normalised",
        "resolution.py",
        "return tuple(sorted(clauses, key=lambda c: (c.clause_id, c.version)))",
        "return tuple(clauses)",
        "test_selection_is_stable_without_snapshot_normalisation",
    ),
    (
        "baseline clauses are offered to risks as well",
        "resolution.py",
        "if not c.always_include",
        "if True",
        "test_baseline_clauses_are_not_offered_to_risks",
    ),
    (
        "the floor is not absolute",
        "resolution.py",
        "if nxt > ladder.floor_rung:",
        "if False:",
        "test_below_the_floor_escalates_even_when_lower_rungs_exist",
    ),
    (
        "a damaged ladder collapses silently",
        "resolution.py",
        'if ladder.status != "intact":',
        "if False:",
        "test_a_degraded_ladder_is_not_silently_collapsed",
    ),
    (
        "ladders are not pinned into the snapshot (CLA §9 regression)",
        "snapshot.py",
        '"ladders": [',
        '"ladders_ignored": [] and [',
        "test_changing_only_a_ladder_changes_the_snapshot_id",
    ),
    (
        "lapsed candidates are not distinguished from none",
        "resolution.py",
        "if lapsed:",
        "if False:",
        "test_all_candidates_lapsed_is_a_distinct_diagnosis",
    ),
    # ── Validation ──
    (
        "the gate blocks on any finding, not only High",
        "validation.py",
        "blocking = [f for f in findings if f.severity == HIGH]",
        "blocking = list(findings)",
        "test_only_high_severity_gates",
    ),
    (
        "none_present is ignored",
        "validation.py",
        """    forbidden = rule.predicate.get("none_present") or []
    for tag in forbidden:
        if tag in tags:
            return None""",
        "    pass",
        "test_adding_cyber_cover_clears_it",
    ),
    (
        "conflicting_values fires on a single value",
        "validation.py",
        "if len(values) < 2:",
        "if len(values) < 1:",
        "test_a_single_jurisdiction_does_not_conflict_with_itself",
    ),
    (
        "predicates are not pinned into the ruleset id",
        "validation.py",
        '"predicate": {k: r.predicate[k] for k in sorted(r.predicate)},',
        '"predicate": None,',
        "test_changing_a_predicate_changes_the_ruleset_id",
    ),
    (
        "findings do not cite their rule version",
        "validation.py",
        "rule_version=rule.ref,",
        'rule_version="",',
        "test_every_finding_cites_its_rule_version",
    ),
    (
        "the predicate grammar is not enforced",
        "validation.py",
        "unknown = set(self.predicate) - set(PRIMITIVES)",
        "unknown = set()",
        "test_unknown_predicate_key_is_refused",
    ),
    (
        "tags are not pinned into the snapshot",
        "snapshot.py",
        '"tags": sorted(c.tags),',
        '"tags": [],',
        "test_retagging_a_clause_changes_the_snapshot_id",
    ),
]


def main() -> int:
    caught, missed = 0, []
    print("mutation check — each row must FAIL the suite\n")

    for name, filename, find, repl, expect in MUTATIONS:
        with tempfile.TemporaryDirectory(prefix="cw-eng-mut-") as tmp:
            dst = Path(tmp) / "engine"
            shutil.copytree(HERE, dst, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))

            target = dst / filename
            src = target.read_text(encoding="utf-8")
            if find not in src:
                missed.append(f"{name} — pattern not found in {filename} (stale check)")
                print(f"  SKIP  {name}  ← pattern not found, check is stale")
                continue
            target.write_text(src.replace(find, repl, 1), encoding="utf-8")

            proc = subprocess.run(
                [sys.executable, "-m", "pytest", "engine", "-q", "--no-header", "-p", "no:cacheprovider"],
                cwd=tmp, capture_output=True, text=True,
            )
            out = proc.stdout + proc.stderr

            if proc.returncode == 0:
                missed.append(f"{name} — suite still passed; nothing guards this")
                print(f"  MISS  {name}  ← suite passed with the guarantee broken")
            elif expect in out:
                caught += 1
                print(f"  ok    {name}")
            else:
                caught += 1
                print(f"  ok*   {name}  (failed, but not via {expect})")

    print(f"\n{caught}/{len(MUTATIONS)} mutations caught")
    if missed:
        print("\nunguarded:")
        for m in missed:
            print("  · " + m)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
