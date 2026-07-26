# Implementation report — IMPL-ENGINE-HARDEN (WP-12, WP-13, WP-14, WP-15)

Stage: Implementation (Gate 4). assignment_id: `IMPL-ENGINE-HARDEN`. Single owner.
Files owned and touched: `backend/engine/resolution.py`, `backend/engine/test_resolution.py`,
`backend/engine/docx.py`, `backend/engine/test_docx.py`, `backend/engine/mutation_check.py`.
Nothing outside those five files was edited. No dependency added.

---

## 1. Acceptance criteria — written BEFORE any edit

Per Gate 3 remediation §6, the criteria were recorded first and each is proved below.

| # | Criterion | Package | Result |
|---|---|---|---|
| A1 | Two selectable versions of one clause → the **newest** is selected (new fixture) | WP-12 | **MET** |
| A2 | An expired always-include clause produces a **gating decision record**, not a silently shorter contract | WP-13 | **MET** |
| A3 | The zip-bomb fixture is refused **without exhausting memory**; the nesting fixture is refused **promptly** (a time or size bound asserted, not merely "raises") | WP-14 | **MET** |
| A4 | Text inside a **hyperlink**, a **content control** and a **smart tag** survives redline parsing | WP-15 | **MET** |
| A5 | A tracked **move** is represented as **delete + insert** | WP-15 | **MET** |
| A6 | `python -m pytest engine -q` green, and every mutation caught **by its named test** (no `MISS`, no `IMPRECISE`) | all | **MET** |
| A7 | The zero-authored-characters test still passes, untouched | all | **MET** |

---

## 2. Results at a glance

- Baseline: **104 passed**. Now: **124 passed** (20 new tests), in ~1.9 s.
- Mutation harness: **34/34 caught by their named test** (was 26/26 after repairs; 8 new mutations).
- No existing test assertion was weakened, removed, or relaxed. Two existing mutation `find`
  strings were repaired in this package because this package's edits moved them.

---

## 3. WP-12 — newest selectable version wins (E3a)

`_order()` now sorts **descending by version** (`(clause_id, -version)`), so the first candidate for
any clause id is its newest selectable version. Both the risk pass and the baseline pass consume
`_order()`, so the rule is one rule, applied once.

Why this is safe against reproducibility: reproducibility is defined against a **pinned snapshot**,
not the live registry. A rebuilt snapshot carries every version with its **frozen** `selectable`
flag, so newest-wins re-selects exactly what it selected on the day. `test_a_run_reproduces_years_later`
was untouched and stays green.

As the plan predicted, the change broke **zero** existing tests — no pre-existing fixture had two
versions of one clause id.

**E3b explicitly deferred, and visible in the code.** A comment at `resolution.py` immediately below
`_order()` records that resolution does **not** consult ladders for a preferred opening rung, and
why: a ladder's rung 0 disagreeing with the severity match is a *content* question for Legal, not a
system question, and adopting it would create a second silent selection authority. It needs an owner
decision before it is built. Nothing was silently dropped.

New tests
- `test_the_newest_selectable_version_wins` — v1/v2/v3 all selectable, v3 chosen, v1 and v2 retained
  as `suppressed` (the audit answer to "why not the other one?").
- `test_a_lapsed_newer_version_does_not_beat_a_live_older_one` — the rule is newest-**selectable**,
  so a retired v2 does not shadow a live v1.
- `test_the_newest_baseline_version_wins` — the always-include pass obeys the same rule, and two
  versions of one baseline clause produce **one** section, not two.

## 4. WP-13 — a lapsed always-include clause gates (E4)

The baseline pass is now `_baseline_pass()`. It groups always-include clauses **by clause id**,
takes the newest selectable version of each, and — when a clause id has **no** selectable version —
emits an **unresolved** decision instead of dropping the section.

**Vocabulary matched, not invented.** The risk pass already distinguishes lapsed from never-existed
via `expired_only` and the phrase `No active clause available in Ledger · N candidate(s) retired or
expired`. The baseline record reuses both, prefixed with its framework section:

```
Always-include · Baseline Framework §1.1 · No active clause available in Ledger · 1 candidate(s) retired or expired
```

**What makes it gating.** The record has `selected is None`, so it appears in
`Resolution.unresolved`; it carries a `warning`, so it appears in `Resolution.warnings`; and
`run.py` already persists `expired_only` per decision, so it lands in the stored run record.
`docx.py` skips decisions with no selection, so the section is still absent from the document — but
it is now absent **with a named, recorded, warned-about reason** rather than silently.

Product boundary respected: the system makes the gap visible and gives Legal somewhere to act on it.
It does not attempt to fill the gap, substitute wording, or fall back to an expired version.

New tests
- `test_a_lapsed_always_include_clause_gates_it_does_not_vanish` — the section is still accounted
  for, the record is unresolved, `expired_only`, carries the category, the count, the warning, and
  is present in both `r.unresolved` and `r.warnings`.
- `test_a_baseline_clause_with_a_lapsed_older_version_still_resolves` — the gate fires on "no
  version is usable", not on "some version lapsed".
- `test_a_never_present_baseline_category_is_not_invented` — the counterpart: nothing fabricates a
  framework section the library never had.

**Interaction disclosed (rt-2 §5d).** A manifest naming a category whose baseline clause has lapsed
now produces **two** decisions for that category — one gating baseline record and one risk record —
and both go into `cw.run_decision`. That is deliberate: they are different questions ("the framework
section is missing" vs "this risk is unanswered"). Which one a report surfaces is a reporting
decision that belongs to a later package; it is flagged here, not decided here.

**Reproducibility caveat, restated (rt-2 §5b).** WP-12 and WP-13 both change `_resolve_risk`/baseline
output, so a `result_hash` stored *before* this change will not match a replay *after* it, while
`snapshot_id` still will. No production data exists, so nothing is lost today. This is exactly the
gap WP-32 (engine-version pin on `cw.run`) exists to close, and it is not in this package's files.

## 5. WP-14 — hostile uploads (E6, re-aimed)

**The refuted premise was not implemented.** No billion-laughs mutation was added and no
`defusedxml` (or any other) dependency was added. expat 2.5.0 already refuses classic entity
expansion, so such a check could not fail — and per Gate 3 remediation §5, an inert check is a
defect, not a formality. A comment in `docx.py` records the measurements (0.26 s and 0.02 s) so the
omission is understood rather than looking like an oversight.

Three real defences, one honesty label:

1. **Per-member bounded read** — `_read_member()` uses `z.open(name).read(MAX_PART_BYTES + 1)` and
   rejects on overrun. Never `z.read()`. The uncompressed size in a zip header is a *claim by
   whoever built the file*; an unbounded read believes it.
2. **Archive-total cap** — the sum of declared member sizes is checked before anything is read, so
   a bomb split across many members, each individually under the per-part cap, is also refused.
3. **Nesting guard** — `_BoundedDepthBuilder`, an `ET.TreeBuilder` subclass that counts depth as the
   parse runs and abandons the document at the first over-deep element. This is the defence for the
   attack the review's own reproduction found: no DOCTYPE, no entities, *under* any plausible byte
   cap, yet 18.7 s and 1.3 GB.
4. **DOCTYPE refused** — kept as cheap defence in depth. The comment states plainly that
   "legitimate OOXML never carries a DOCTYPE" is **`Inferred`** from the ECMA-376 part definitions
   and the samples to hand, **not `Observed`** against a corpus of real Word output.

Limits chosen: `MAX_PART_BYTES = 16 MB`, `MAX_ARCHIVE_BYTES = 64 MB`, `MAX_ELEMENT_DEPTH = 256`.
A `document.xml` of 16 MB is a contract of several thousand pages; 64 MB is a very large Word file
including its media. They are named constants and easy to raise if a real vendor file ever meets
one. `test_an_ordinary_document_is_not_refused_by_any_of_this` is the control that proves a normal
document passes all four.

Fixtures are **small and generated in code** — no binary files committed. The bombs are written in
1 MB chunks through `ZipFile.open(..., "w")` so that *building the fixture* does not itself allocate
the expanded payload.

New tests — each asserts a **bound**, not merely "it raises"
- `test_a_zip_bomb_is_refused_without_exhausting_memory` — a 49 KB archive expanding to 40 MB.
  Asserts the archive is under 200 KB, that it is refused, and — via `tracemalloc` — that peak
  allocation stays under 48 MB. Measured: **32 MB with the cap, 85 MB without it**. That gap is
  what the assertion is protecting.
- `test_a_bomb_spread_across_members_is_refused` — five members of 14 MB each, all individually
  under the per-part cap, 70 MB together.
- `test_deeply_nested_xml_is_refused_promptly` — 1.3 million nested elements, 14 MB of XML, **under**
  the per-part cap so no size limit can see it. Asserts refusal in **under 1.0 s**. Measured: about
  **0.03 s guarded**; parsing the same fixture unguarded takes **~5 s and ~350 MB** (the review's
  original was 33.6 MB / 18.7 s / 1.3 GB — this fixture is the largest one that still fits under the
  byte cap, which is the point).
- `test_a_doctype_is_refused`.
- `test_an_ordinary_document_is_not_refused_by_any_of_this` — the control.

## 6. WP-15 — real-world Word containers and tracked moves (E5)

**Scope correction, stated plainly and confirmed by measurement: the emit path was never at risk.**
`paragraphs()` used `p.iter()`, which already recursed, and `authored_characters()` only ever runs
over `build_docx` output — which this module produces itself, in a fixed shape, with no containers
and no tracked changes. **Success criterion S10 was never in danger.** The zero-authored-characters
test is unmodified and green. The exposure was real but confined to `parse_redlines`, i.e. to what a
Review ticket shows Legal about a *vendor's* file.

Changes:
- **Container recursion.** `parse_redlines` walked only a paragraph's **direct children**. Real Word
  output wraps runs in `w:hyperlink` (cross-references and links), `w:sdt`/`w:sdtContent` (content
  controls) and `w:smartTag`. The walker now recurses through those — an explicit allow-list, not
  "recurse into anything", so that markup such as `w:pPr`/`w:rPr` (which can legitimately carry a
  tracked *formatting* change) cannot manufacture a phantom text redline.
- **Tracked moves.** `w:moveTo` is read as an **insertion** and `w:moveFrom` as a **deletion**. This
  is called out as a semantic choice in a comment at the constant definitions in `docx.py`, in the
  test's docstring, and here: Word models a move as one operation with two ends, but a Review ticket
  adjudicates *text*, and ADR-0007 makes each changed paragraph an independently adjudicated point.
  Splitting the move lets each end be accepted or refused on its own; keeping it whole would force
  the reviewer to reason about both ends at once.
- **The vacuous `w:delText` branch.** The old `elif node.tag == delText: continue` did nothing and
  was unreachable in ordinary markup. Replaced with the actual rule, applied to whole subtrees:
  `w:del` and `w:moveFrom` are skipped entirely, and a `w:delText` reached directly is skipped too.
- **Nested-`w:p` double count.** A paragraph inside a table cell or a content control is its own
  paragraph and is already reported separately; the outer paragraph no longer swallows its text as
  well. Both `paragraphs()` and the redline context strings now use the same `_visible_text()`
  helper, so plain text and redline context can no longer disagree.

New tests
- `test_a_change_inside_a_word_container_is_not_lost[hyperlink|content control|smart tag]` — the
  same tracked change wrapped in each container; parametrised so all three are named individually.
- `test_text_inside_a_word_container_is_readable[…]` — the insertion is readable, the deletion is not.
- `test_a_tracked_move_is_read_as_a_delete_plus_an_insert` — two paragraphs, two redlines, one
  `["keep", "del"]` and one `["keep", "ins"]`, author preserved on both ends.
- `test_a_nested_paragraph_is_counted_once`.
- `test_text_reached_directly_as_deleted_is_never_document_content`.

**Honesty constraint discharged.** Microsoft Word is not available in this environment, so no claim
of Word fidelity is made. The fixtures are hand-built OOXML written to the ECMA-376 shapes, and the
limitation is stated in a comment block directly above them in `test_docx.py`: they exercise the
exact structural difference that broke the parser — *a run that is not a direct child of `w:p`* —
but they cannot prove Word emits precisely this markup and nothing else. Treat them as a faithful
substitute, not as verified Word output. **This is the package's main residual limitation.**

---

## 7. Mutations

Two existing entries were **repaired in this package** (their `find` strings key on lines this work
changed; a non-matching string exits 1, so this could not be deferred):

| Entry | Repair |
|---|---|
| `candidate order is not normalised` | `find` updated for the new descending sort key |
| `deleted text is treated as document content`, `every paragraph is treated as a redline`, `a corrupt upload raises something unusable` | verified still matching after the `docx.py` rewrite; `find` strings deliberately preserved verbatim |

Eight new mutations, all confirmed `ok` — caught **by the test they name**:

| # | Mutation | File | Named test |
|---|---|---|---|
| 1 | the oldest version wins when two are selectable (E3a regression) | `resolution.py` | `test_the_newest_selectable_version_wins` |
| 2 | a lapsed always-include clause vanishes instead of gating | `resolution.py` | `test_a_lapsed_always_include_clause_gates_it_does_not_vanish` |
| 3 | an archive member is read without a ceiling (zip bomb) | `docx.py` | `test_a_zip_bomb_is_refused_without_exhausting_memory` |
| 4 | the archive total is not capped | `docx.py` | `test_a_bomb_spread_across_members_is_refused` |
| 5 | nesting is unbounded (the attack no size cap sees) | `docx.py` | `test_deeply_nested_xml_is_refused_promptly` |
| 6 | a DOCTYPE is accepted | `docx.py` | `test_a_doctype_is_refused` |
| 7 | runs inside a hyperlink, content control or smart tag are invisible | `docx.py` | `test_a_change_inside_a_word_container_is_not_lost` |
| 8 | a tracked move is dropped instead of read as delete + insert | `docx.py` | `test_a_tracked_move_is_read_as_a_delete_plus_an_insert` |

Plus two more covering the WP-15 repairs: `a nested paragraph is counted twice` and
`text reached directly as deleted is treated as content`.

**Not added, on purpose:** any billion-laughs / entity-expansion mutation. It cannot fail against
expat 2.5.0. Banned by Gate 3 remediation §5 (S0-5), and the ban is honoured.

### Raw mutation output

```
mutation check — each row must FAIL the suite via its named test

  ok    unselectable clauses may be chosen
  ok    candidate order is not normalised
  ok    the oldest version wins when two are selectable (E3a regression)
  ok    a lapsed always-include clause vanishes instead of gating
  ok    baseline clauses are offered to risks as well
  ok    the floor is not absolute
  ok    a damaged ladder collapses silently
  ok    ladders are not pinned into the snapshot (CLA §9 regression)
  ok    lapsed candidates are not distinguished from none
  ok    the gate blocks on any finding, not only High
  ok    none_present is ignored
  ok    conflicting_values fires on a single value
  ok    predicates are not pinned into the ruleset id
  ok    findings do not cite their rule version
  ok    the predicate grammar is not enforced
  ok    tags are not pinned into the snapshot
  ok    the frozen selectable flag is ignored on rebuild
  ok    clauses outside the snapshot are included on rebuild
  ok    mutable clause state is hashed into the snapshot
  ok    snapshot ladders lose their floor when stored
  ok    clause text is reformatted on the way into the document
  ok    an unresolved risk gets a placeholder section
  ok    document assembly is not reproducible
  ok    deleted text is treated as document content
  ok    every paragraph is treated as a redline
  ok    an archive member is read without a ceiling (zip bomb)
  ok    the archive total is not capped
  ok    nesting is unbounded (the attack no size cap sees)
  ok    a DOCTYPE is accepted
  ok    runs inside a hyperlink, content control or smart tag are invisible
  ok    a tracked move is dropped instead of read as delete + insert
  ok    a nested paragraph is counted twice
  ok    text reached directly as deleted is treated as content
  ok    a corrupt upload raises something unusable

34/34 mutations caught by their named test
```

### Raw test output

```
$ python -m pytest engine -q
........................................................................ [ 58%]
....................................................                     [100%]
124 passed in 1.89s
```

Diffstat (owned files only):

```
 backend/engine/docx.py            | 219 ++++++++++++++++++++++++++------
 backend/engine/mutation_check.py  | 118 +++++++++++++++--
 backend/engine/resolution.py      |  95 ++++++++++++--
 backend/engine/test_docx.py       | 261 +++++++++++++++++++++++++++++++++++++-
 backend/engine/test_resolution.py |  97 ++++++++++++++
 5 files changed, 727 insertions(+), 63 deletions(-)
```

---

## 8. Deviations from the packet

1. **A fourth and fifth WP-14 defence.** The packet named the per-member cap, the archive-total cap
   and the nesting guard. The DOCTYPE refusal was described as "worth keeping"; it is kept, tested,
   and mutated. The control test (a normal document is not refused) is additional and unrequested —
   a guard that rejects real work is worse than no guard.
2. **The nesting fixture was sized deliberately at 14 MB, not the review's 33.6 MB.** At 33.6 MB the
   per-part cap would refuse it first, and the nesting-guard mutation would then be **inert** — the
   exact failure mode Gate 3 §5 bans. 14 MB is the largest fixture that still passes every size
   check and therefore genuinely exercises depth. Measured unguarded cost: ~5 s / ~350 MB.
3. **Container recursion uses an allow-list, not blanket recursion.** Blanket recursion would let a
   tracked *formatting* change inside `w:pPr`/`w:rPr` register as a text redline with no text.
4. **Two extra WP-15 mutations** beyond those the packet asked for, covering the nested-paragraph
   and `delText` repairs.
5. **`MAX_ARCHIVE_BYTES` set at 64 MB rather than something larger.** Chosen partly so the
   archive-total fixture stays cheap enough that the mutation harness (which runs the whole suite
   34 times) does not slow down materially. Full suite is still ~1.9 s.

## 9. Findings not in the plan

- **F1 — the baseline pass silently treated versions as separate sections.** Before this work, two
  selectable versions of one always-include clause would each have produced their own contract
  section — the same framework clause printed twice. No test covered it. Fixed by grouping on
  clause id; `test_the_newest_baseline_version_wins` locks it.
- **F2 — `parse_redlines` and `paragraphs` used two different text extractors.** The redline context
  strings came from a flat `p.iter(w:t)` while `paragraphs()` had its own walk, so context could
  legitimately disagree with the readable text (notably including deleted text). Both now use
  `_visible_text()`.
- **F3 — reporting question raised, not decided.** Per §4, a lapsed baseline clause in a category
  the manifest also names produces two run decisions. Which one a report shows is out of scope here.
- **F4 — no existing test assertion was found to be wrong.** Nothing was weakened; there is no
  finding to disclose under contract §5.7 from this package.

## 10. Limitations, stated honestly

1. **No Word fidelity is claimed.** Word is not available in this environment. The E5 fixtures are
   hand-built OOXML matching the ECMA-376 shapes, labelled as such in the test file. They prove the
   parser handles runs that are not direct children of `w:p`; they do not prove Word emits exactly
   this markup. A later validation pass against genuine Word output would be worth doing.
2. **The size limits are judgement, not measurement.** 16 MB / 64 MB / depth 256 are comfortably
   above anything a contract needs and comfortably below anything hostile, but no corpus of real
   vendor files was available to calibrate them. They are named constants, easy to change.
3. **The archive-total check trusts the zip directory's declared sizes.** A liar can understate
   them — which is precisely why the per-member bounded read exists and is the load-bearing
   defence. The total is a second line, not the first.
4. **The `tracemalloc` bound is a proxy for memory safety.** It measures Python-level allocation.
   The measured gap (32 MB guarded vs 85 MB unguarded) is wide enough to be a real signal, and the
   mutation confirms the test fails when the cap is removed.
5. **`result_hash` values stored before this change will not replay.** Disclosed in §4; the fix
   (WP-32's engine-version pin) is outside this package's five files.
