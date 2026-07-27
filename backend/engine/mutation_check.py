"""Mutation check for the resolution engine.

The SQL layer has one of these and it has caught three real faults. The engine
gets the same treatment: break one guarantee at a time, confirm the tests notice.

    python engine/mutation_check.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
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
        "return tuple(sorted(clauses, key=lambda c: (c.clause_id, -c.version)))",
        "return tuple(clauses)",
        "test_selection_is_stable_without_snapshot_normalisation",
    ),
    (
        "the oldest version wins when two are selectable (E3a regression)",
        "resolution.py",
        "key=lambda c: (c.clause_id, -c.version)",
        "key=lambda c: (c.clause_id, c.version)",
        "test_the_newest_selectable_version_wins",
    ),
    (
        "a lapsed always-include clause vanishes instead of gating",
        "resolution.py",
        """        out.append(Decision(
            risk=risk,
            selected=None,""",
        """        continue
        out.append(Decision(
            risk=risk,
            selected=None,""",
        "test_a_lapsed_always_include_clause_gates_it_does_not_vanish",
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
    (
        "the frozen selectable flag is ignored on rebuild",
        "run.py",
        "selectable=frozen[key],          # the frozen flag wins, not today's",
        "selectable=bool(row.get('selectable', True)),",
        "test_a_run_reproduces_years_later",
    ),
    (
        "clauses outside the snapshot are included on rebuild",
        "run.py",
        """        if key not in frozen:
            continue  # not part of this snapshot""",
        "        pass",
        "test_rebuilding_ignores_clauses_outside_the_snapshot",
    ),
    (
        "mutable clause state is hashed into the snapshot",
        "snapshot.py",
        """"selectable": c.selectable,
                    "provenance_gap": c.provenance_gap,""",
        """"selectable": c.selectable,
                    "state": c.state,
                    "provenance_gap": c.provenance_gap,""",
        "test_retiring_a_clause_does_not_change_the_snapshot_id",
    ),
    (
        "snapshot ladders lose their floor when stored",
        "run.py",
        '"is_floor": rung == ladder.floor_rung,',
        '"is_floor": False,',
        "test_snapshot_rows_pin_the_ladder_with_its_floor",
    ),
    # ── Ladder status, and the write seam (E1, E2) ──
    (
        "a rebuilt ladder is assumed intact (E1 regression)",
        "run.py",
        "status=ladder_status(rows, frozen),",
        'status="intact",',
        "test_a_run_taken_on_a_degraded_ladder_reproduces_years_later",
    ),
    (
        "a rungless ladder is dropped instead of refused",
        "run.py",
        "        if not ladder.rungs:",
        "        if False:",
        "test_a_rungless_ladder_is_refused_rather_than_quietly_lost",
    ),
    (
        "a stored rung's category is the label, not the key (M1)",
        "run.py",
        '"category_key": categories.key_for(ladder.category),',
        '"category_key": ladder.category,',
        "test_snapshot_rows_emit_the_category_key_not_the_label",
    ),
    (
        "a decision's category is the label, not the key (S0-2)",
        "run.py",
        '"category_key": categories.key_for(d.risk.category),',
        '"category": d.risk.category,',
        "test_run_decisions_emit_the_category_key_not_the_label",
    ),
    (
        "the stored key is hashed as if it were a label (M2 — the keystone)",
        "run.py",
        "category=categories.label_for(category_key),",
        "category=category_key,",
        "test_the_key_is_translated_back_to_a_label_on_rebuild",
    ),
    # ── The manifest trust boundary (E7) ──
    (
        "an unknown category crosses the trust boundary",
        "manifest.py",
        """        if not categories.knows(risk.category):
            dropped.append(risk)
            continue""",
        """        if False:
            dropped.append(risk)
            continue""",
        "test_a_hallucinated_category_never_becomes_a_coverage_gap",
    ),
    (
        "a dropped category is discarded instead of recorded",
        "manifest.py",
        "return replace(manifest, risks=tuple(kept), dropped=tuple(dropped))",
        "return replace(manifest, risks=tuple(kept), dropped=())",
        "test_a_dropped_risk_is_recorded_as_dropped_not_discarded",
    ),
    (
        "severity is taken from the model verbatim",
        "manifest.py",
        "severity = HIGH if risk.severity == HIGH else STANDARD",
        "severity = risk.severity",
        "test_severity_is_coerced_to_the_two_value_enum",
    ),
    (
        "an empty category enum lets everything through",
        "manifest.py",
        "    if not categories.label_to_key:",
        "    if False:",
        "test_an_empty_enum_fails_closed",
    ),
    # ── Document service ──
    (
        "unprintable characters are emitted into the document anyway",
        "docx.py",
        "    bad = _UNPRINTABLE.search(text)",
        "    bad = None",
        "test_wording_no_word_file_can_carry_is_refused_not_emitted",
    ),
    (
        "a line break in approved wording is emitted as a raw character",
        "docx.py",
        '    runs = "<w:br/>".join(\n'
        "        f'<w:t xml:space=\"preserve\">{piece}</w:t>'\n"
        '        for piece in _esc(text).split("\\n"))\n'
        '    return f"<w:p>{pr}<w:r>{runs}</w:r></w:p>"',
        "    return f'<w:p>{pr}<w:r><w:t xml:space=\"preserve\">{_esc(text)}</w:t></w:r></w:p>'",
        "test_a_line_break_in_approved_wording_is_a_real_line_break_in_the_file",
    ),
    (
        "clause text is reformatted on the way into the document",
        "docx.py",
        "body.append(_para(d.selected.body))",
        "body.append(_para(' '.join(d.selected.body.split())[:200] + '…'))",
        # RE-POINTED (WP-24). This used to name the character counter, with a
        # comment explaining that the verbatim test could not catch it: that
        # test asserted `body in text`, and the mutation APPENDS, so the
        # approved wording was still a substring and the test stayed green. The
        # wrong instrument was noticing the right problem.
        #
        # test_clause_text_appears_verbatim now compares the whole paragraph
        # rather than testing containment, so the test whose name is
        # "clause text appears verbatim" is the one that catches clause text not
        # appearing verbatim.
        "test_clause_text_appears_verbatim",
    ),
    (
        # An unresolved risk given a heading but no clause. The character
        # counter cannot see this one — a category name is not authored contract
        # language, and INSURANCE is a word from the manifest, not invention. It
        # is still exactly the failure the omission rule exists to prevent: a
        # section that looks like a position we have taken, with nothing in it.
        "an unresolved risk still gets a section heading",
        "docx.py",
        "            continue          # an unresolved risk is not silently papered over",
        "            body.append(_para(f'{d.risk.category.upper()}', 'Heading2'))\n"
        "            continue",
        "test_an_unresolved_risk_is_omitted_not_invented",
    ),
    (
        "an unresolved risk gets a placeholder section",
        "docx.py",
        "            continue          # an unresolved risk is not silently papered over",
        "            body.append(_para('To be agreed between the parties.'))\n            continue",
        "test_the_document_contains_zero_authored_characters",
    ),
    (
        "document assembly is not reproducible",
        "docx.py",
        "info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))",
        "import time as _t; info = zipfile.ZipInfo(name, date_time=_t.localtime()[:6])",
        "test_the_archive_embeds_no_wall_clock",
    ),
    (
        "deleted text is treated as document content",
        "docx.py",
        'tag = f"{{{W}}}delText" if kind == "del" else f"{{{W}}}t"',
        'tag = f"{{{W}}}t"',
        "test_original_text_is_keep_plus_del",
    ),
    (
        "every paragraph is treated as a redline",
        "docx.py",
        '        if not any(s.kind in ("ins", "del") for s in segments):\n            continue',
        "        pass",
        "test_one_redline_per_changed_paragraph",
    ),
    # ── Hostile uploads (E6). No billion-laughs mutation: expat 2.5.0 already
    # refuses it, so the check could not fail, and an inert check is a defect
    # (Gate 3 remediation §5).
    (
        "an archive member is read without a ceiling (zip bomb)",
        "docx.py",
        """    with z.open(name) as f:
        raw = f.read(MAX_PART_BYTES + 1)
    if len(raw) > MAX_PART_BYTES:""",
        """    with z.open(name) as f:
        raw = f.read()
    if False:""",
        "test_a_zip_bomb_is_refused_without_exhausting_memory",
    ),
    (
        "the archive total is not capped",
        "docx.py",
        "            if declared > MAX_ARCHIVE_BYTES:",
        "            if False:",
        "test_a_bomb_spread_across_members_is_refused",
    ),
    (
        "nesting is unbounded (the attack no size cap sees)",
        "docx.py",
        "        if self._depth > self._limit:",
        "        if False:",
        "test_deeply_nested_xml_is_refused_promptly",
    ),
    (
        "a DOCTYPE is accepted",
        "docx.py",
        '        raise NotADocx("word/document.xml declares a DOCTYPE — refused")',
        "        pass",
        "test_a_doctype_is_refused",
    ),
    # The same guard, attacked through its old blind spot. Two rows on one
    # line of code is deliberate: the guarantee is "refused in ANY encoding",
    # and each test must be the one that notices its own half.
    (
        "a DOCTYPE hides behind an encoding a byte scan does not speak",
        "docx.py",
        '        raise NotADocx("word/document.xml declares a DOCTYPE — refused")',
        "        pass",
        "test_a_doctype_in_utf_16_is_still_refused",
    ),
    # ── Real-world Word containers (E5) ──
    (
        "runs inside a hyperlink, content control or smart tag are invisible",
        "docx.py",
        """                elif tag in TRANSPARENT:
                    walk(child)""",
        """                elif False:
                    walk(child)""",
        "test_a_change_inside_a_word_container_is_not_lost",
    ),
    (
        "a tracked move is dropped instead of read as delete + insert",
        "docx.py",
        "                elif tag in (INS, MOVE_TO):",
        "                elif tag == INS:",
        "test_a_tracked_move_is_read_as_a_delete_plus_an_insert",
    ),
    (
        "a nested paragraph is counted twice",
        "docx.py",
        """            if tag == P:
                continue          # its own paragraph, counted once, over there""",
        """            if False:
                continue""",
        "test_a_nested_paragraph_is_counted_once",
    ),
    (
        "text reached directly as deleted is treated as content",
        "docx.py",
        """            elif tag == DEL_TEXT:
                continue          # deleted text reached directly, same rule""",
        """            elif tag == DEL_TEXT:
                if child.text:
                    parts.append(child.text)""",
        "test_text_reached_directly_as_deleted_is_never_document_content",
    ),
    (
        "a corrupt upload raises something unusable",
        "docx.py",
        'raise NotADocx("not a .docx file — a Word document is a zip archive") from exc',
        "raise",
        "test_a_non_zip_upload_fails_with_a_usable_message",
    ),
    # ── Clause origin, and what it must not touch (WP-17) ──
    (
        # Settled decision S0-4 restored the wrong way round: hashing origin
        # makes every stored run stop reproducing the first time a provenance
        # backfill runs, for a field that cannot change an outcome.
        "clause origin is hashed into the snapshot fingerprint (S0-4 regression)",
        "snapshot.py",
        '                    "provenance_gap": c.provenance_gap,',
        '                    "provenance_gap": c.provenance_gap,\n'
        '                    "origin": c.origin,',
        "test_no_stored_snapshot_id_changes",
    ),
    (
        "the second provenance count always reports zero",
        "docx.py",
        '    ai_bodies = {c.body.strip() for c in clauses if getattr(c, "origin", "") == "ai_drafted"}',
        "    ai_bodies = set()",
        "test_ai_originated_characters_are_counted",
    ),
    (
        # The first count must not start reporting AI-originated wording as
        # authored: those characters were approved by a named lawyer, and
        # conflating the two figures makes both useless.
        "AI-originated clause text is counted as authored by the system",
        "docx.py",
        "    allowed = {b.strip() for b in bodies} | {s.strip() for s in structural}",
        "    allowed = {s.strip() for s in structural}",
        "test_the_first_count_is_still_zero_when_the_second_is_not",
    ),
    # ── Rebuilding a stored snapshot is all-or-nothing (WP-24, finding E8) ──
    (
        # The silent skip restored. A stored member with no clause row was
        # simply dropped, a smaller library was built, and it hashed to a
        # different id — so the caller was handed a DIFFERENT library under the
        # name of the one they asked for, and found out only if they thought to
        # compare ids.
        "a stored snapshot member with no clause row is silently dropped",
        "run.py",
        """    missing = sorted(frozen.keys() - seen)
    if missing:""",
        """    missing = []
    if missing:""",
        "test_a_snapshot_that_cannot_be_rebuilt_says_so",
    ),
    # ── The engine pin (WP-32) ──
    (
        "a replayed run is stamped with today's engine, not the one that ran it",
        "run.py",
        '        "engine_version": engine_version,',
        '        "engine_version": ENGINE_VERSION,',
        "test_the_engine_version_can_be_overridden_for_a_replay",
    ),
]


def _run_one(mutation):
    """Apply one mutation in its own tree and report the verdict.

    Self-contained on purpose: a private temp directory and a separate pytest
    process, so these can run concurrently without touching each other.
    """
    name, filename, find, repl, expect = mutation
    with tempfile.TemporaryDirectory(prefix="cw-eng-mut-") as tmp:
        dst = Path(tmp) / "engine"
        shutil.copytree(HERE, dst, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))

        target = dst / filename
        src = target.read_text(encoding="utf-8")
        if find not in src:
            return name, expect, "skip"
        target.write_text(src.replace(find, repl, 1), encoding="utf-8")

        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "engine", "-q", "--no-header", "-p", "no:cacheprovider"],
            cwd=tmp, capture_output=True, text=True,
        )
        out = proc.stdout + proc.stderr

    if proc.returncode == 0:
        return name, expect, "miss"
    return name, expect, "ok" if expect in out else "imprecise"


def main() -> int:
    # `imprecise` is kept separate from `missed` and is also fatal. A mutation
    # that makes *some* test fail proves the suite noticed something; it does
    # not prove the named guarantee is guarded. Scoring those as caught let a
    # check look like protection while the test it names was never exercised.
    caught, missed, imprecise = 0, [], []

    # Mutations run CONCURRENTLY — each one copies the engine into its own temp
    # tree and runs its own pytest, so nothing is shared. Sequentially this
    # harness was the slow half of `npm run verify`; the work is spawn-and-wait,
    # so it parallelises well. Results are printed in MUTATIONS order regardless
    # of finish order, because a report that reshuffles run to run is hard to
    # diff.
    lanes = max(2, min(len(MUTATIONS), (os.cpu_count() or 4) - 1))
    print("mutation check — each row must FAIL the suite via its named test")
    print(f"{len(MUTATIONS)} mutations, {lanes} at a time\n")

    with ThreadPoolExecutor(max_workers=lanes) as pool:
        results = list(pool.map(_run_one, MUTATIONS))

    for name, expect, verdict in results:
        if verdict == "ok":
            caught += 1
            print(f"  ok    {name}")
        elif verdict == "skip":
            missed.append(f"{name} — pattern not found (stale check)")
            print(f"  SKIP  {name}  ← pattern not found, check is stale")
        elif verdict == "miss":
            missed.append(f"{name} — suite still passed; nothing guards this")
            print(f"  MISS  {name}  ← suite passed with the guarantee broken")
        else:
            imprecise.append(f"{name} — suite failed, but not via {expect}")
            print(f"  IMPRECISE  {name}  ← wrong test caught it; {expect} is unproven")

    print(f"\n{caught}/{len(MUTATIONS)} mutations caught by their named test")
    if missed:
        print("\nunguarded:")
        for m in missed:
            print("  · " + m)
    if imprecise:
        print("\nimprecise — the mutation must name the test that actually catches it:")
        for m in imprecise:
            print("  · " + m)
    return 1 if (missed or imprecise) else 0


if __name__ == "__main__":
    raise SystemExit(main())
