# Plan B — Engine, the engine↔database seam, and the hostile-input edge

- **assignment_id:** PLAN-B · **role:** Planner · **rigor:** standard
- **contract:** OC-CW-2026-07-25-01
- **slice:** E1–E8 from `docs/REVIEW-2026-07-25.md` §5
- **date:** 2026-07-25

---

## Summary

All eight findings are **confirmed against the source**. Nothing in my slice is stale or wrong,
though three of them are worse than the review states and one is narrower.

The three that are worse:

1. **E1 is not only a missing column — the write side loses the whole ladder header.**
   `snapshot_rows` writes ladders *only* by iterating their rungs. A ladder's `status` has no home,
   and a ladder with zero rungs disappears entirely. Both change the rebuilt hash.
2. **E2's category mismatch is bidirectional.** The review names the write half (engine emits
   `category` holding a label; `cw.snapshot_ladder_rung` wants `category_key` holding a key). The
   read half is equally broken: `snapshot_from_rows` reads `r["category"]` and puts whatever it
   finds straight into `Ladder.category`, which is hashed. So even after the column is renamed, a
   round trip through the database produces a **different snapshot id** unless a label↔key
   translation happens on both sides. I found five further mismatches; full inventory below.
3. **E6's entity bomb is live, not theoretical.** I ran it. Python 3.10.11's `ElementTree` expanded
   a three-level billion-laughs payload to 3,000 characters without complaint. External entities
   are already blocked. So the exposure is real and the fix is narrow.

The one that is narrower: **E5's "hyperlinks/content controls/smart tags"** loss applies to
`parse_redlines` only. `paragraphs()` and `document_text()` use `p.iter()` and already recurse, so
the emitted-contract path and the authored-characters counter are unaffected.

**E6 needs no new dependency.** `defusedxml` is not required and I recommend against it.

---

## Baseline test output

`cd backend && python -m pytest engine -q` — **Observed**

```
........................................................................ [ 69%]
................................                                         [100%]
104 passed in 0.51s
```

Per file (**Observed**): `test_resolution` 26 · `test_validation` 22 · `test_run` 16 ·
`test_docx` 26 · `test_loader` 14. Total 104.

---

## Verification of review findings

| Finding | Review's claim | What I actually found | Tag | Evidence |
|---|---|---|---|---|
| **E1** | Ladder status hashed, no run-store column, rebuild hard-codes "intact" | **Confirmed, and worse.** `status` is in the hash payload; `cw.snapshot_ladder_rung` has no `status` column; rebuild hard-codes `"intact"`. Additionally the write side has no ladder *header* row at all, so `floor_rung` survives only implicitly via `is_floor`, and a rung-less ladder is silently dropped. | Observed | hash: `backend/engine/snapshot.py:99`; table: `backend/db/migrations/0005_run_store.sql:38-48`; hard-code: `backend/engine/run.py:189`; rung-only write: `backend/engine/run.py:40-51` |
| **E1 (fixtures)** | All fixtures use intact ladders | Confirmed. No test in `test_run.py` constructs a `Ladder` with a non-intact status; the reproducibility tests at `test_run.py:152,171,226` all pass intact ladders. `test_resolution.py` exercises degraded ladders only through `descend`, never through a round trip. | Observed | `backend/engine/test_run.py:136-241` |
| **E2** | Write side never exercised; `category` vs `category_key` | **Confirmed, plus five more mismatches** (inventory below). No write-side integration test exists — `backend/db/test/` contains no counterpart to `loader-sql.test.mjs` for `snapshot_rows`/`run_rows`. | Observed | emit: `backend/engine/run.py:45-46`; target: `0005_run_store.sql:41`; dir listing of `backend/db/test/` |
| **E3** | Two selectable versions → oldest wins; ladders never consulted | Confirmed. `_order` sorts ascending by `(clause_id, version)`; `exact = next(...)` takes the first match, i.e. the lowest version. `_resolve_risk` contains no reference to `snapshot.ladder_for` or `Ladder`. | Observed | `backend/engine/resolution.py:37`, `:98`, `:116`, `:121`; whole function `:92-131` |
| **E4** | Lapsed always-include vanishes silently | Confirmed. The baseline pass filters `c.always_include and c.selectable` and emits a `Decision` only for survivors. A lapsed always-include clause produces no decision, no warning, no record — while `_resolve_risk` carefully emits `expired_only=True` for the same situation on the risk path. | Observed | `backend/engine/resolution.py:46` vs `:106-113` |
| **E5** | Redline parsing loses hyperlink/content-control/smart-tag text; moves unhandled; fixtures hand-built | Confirmed, **narrower than stated**. Only `parse_redlines` walks direct children (`for child in list(p)`). `paragraphs()` uses `p.iter()` and does recurse, so the emit path is safe. `w:moveFrom`/`w:moveTo` appear nowhere in the module. All fixtures are string-literal XML in `test_docx.py`. | Observed | `backend/engine/docx.py:267` (direct children) vs `:163-171` (`p.iter()`); no `move` match in `docx.py` |
| **E5 (bug beyond the review)** | — | `paragraphs()` has a **dead branch**: it tests `node.tag == w:delText` and `continue`s, but the preceding branch already only matches `w:t`, so the `elif` is unreachable. Deleted text is excluded by accident (because `w:delText` ≠ `w:t`), not by the code that claims to exclude it. | Observed | `backend/engine/docx.py:165-170` |
| **E6** | No entity-expansion or zip-bomb defence | **Confirmed and demonstrated.** `_document_xml` calls `zipfile.ZipFile(...).read("word/document.xml")` (unbounded decompression) then `ET.fromstring` (unbounded internal entity expansion). Live check on this interpreter: 3-level billion-laughs **parsed**, yielding 3,000 chars; external-entity payload raised `ParseError: undefined entity`. | Observed | `backend/engine/docx.py:146-157`; command output in §Remedies/E6 |
| **E7** | Manifest trust boundary only in the prototype | Confirmed. The prototype validates against `window.CATEGORIES` and refuses an unvalidated manifest (`prototype/v3/app/engine.jsx:13`, `:51`). No backend module references a category enum: `Manifest`/`Risk` are plain frozen dataclasses with no validation, and `resolve` accepts any string. A hallucinated category falls through `_resolve_risk` to `"No clause available in Ledger"` — misdiagnosed as a coverage gap. | Observed | `backend/engine/model.py:77-91`; `backend/engine/resolution.py:114`; `prototype/v3/app/engine.jsx:13,51` |
| **E8 · `at_floor`** | Misnamed and dead | Confirmed, and **actively wrong**. `Descent.at_floor` returns `accepted is not None and rung is not None` — true for *every* successful descent, not only floor ones. It has no caller in `backend/`. The local variable of the same name at `:188` is a separate, correct thing. | Observed | `backend/engine/resolution.py:146-148`; grep for `at_floor` across `backend/` finds only `:147`, `:188`, `:190`, and a local in `test_resolution.py:247` |
| **E8 · dead imports** | Dead code and imports | Confirmed: `docx.py:24 import re` (unused), `docx.py:26 field`, `model.py:10 field`, `run.py:20 asdict`, `validation.py:25 field`, `test_loader.py:6 STANDARD`. | Observed | AST scan across `backend/engine/*.py` |
| **E8 · README drift** | README drift | Confirmed. `backend/README.md:51-55` claims 27/21/19/25/14 = 106 engine tests; actual is 26/22/16/26/14 = 104. Four of five counts are wrong. | Observed | `backend/README.md:51-55` vs per-file pytest output |
| **E8 · vacuous test** | A substring-match test that asserts nothing | **Partially confirmed — the review does not name it, and two candidates exist.** My reading: `test_an_unresolved_risk_is_omitted_not_invented` asserts only `"INSURANCE" not in text.upper()`, which passes identically if the document is empty or generation failed entirely. It never asserts that the *resolved* sections are present, so it cannot distinguish "correctly omitted" from "nothing was produced". Second, weaker candidate: `test_deleted_text_is_not_part_of_the_document` matches the bare substrings `"24"` / `"72"`. I treat the first as the finding and will strengthen both. | Inferred (from the review's one-line description) | `backend/engine/test_docx.py:126`, `:272-273` |

---

## Remedies

### E1 — decision: **store the ladder header, hash stays as it is**

**Decision: branch (a) — store ladder status in the snapshot; do not remove it from the hash.**

Argument. The proposal offers "remove `status` from the hash and document why" as the cheap
branch. It is wrong here, and the migration file already contains the argument against it:

> "A snapshot id is a hash of the library's contents, and `selectable` depends on the clock — so
> the hash CANNOT be recomputed later from the live registry." (`0005_run_store.sql:6-10`)

`status` is the *same kind of field as* `selectable`. `cw.ladder_health` derives it from rung
expiry dates against the current clock (`0003_ladders_and_concessions.sql:79-100`), so it is
clock-dependent and unrecoverable later, exactly like `selectable`. And it is outcome-bearing:
`descend()` refuses any ladder whose status is not `intact` (`resolution.py:166`). Two snapshots
that differ only in ladder status produce different negotiation outcomes.

So dropping `status` from the hash would make the snapshot id a fingerprint that says "same" about
two libraries that behave differently. "Reproducible forever" means: from the stored record alone,
without the live registry, I can rebuild the exact inputs and get the same id and the same
decisions. A hash that omits an outcome-bearing field breaks the second half of that even while the
first half appears to pass. `snapshot.py:63-73` already reasons this way about `state` (excluded
because resolution never reads it) versus `provenance_gap` (included because it drives a warning).
`status` sits firmly on the `provenance_gap` side. **The existing hash is correct; the storage is
missing.** Keep the hash, fix the storage.

**What must change.**

1. **New table needed (database owner's call, I name the shape only):** a ladder *header* per
   snapshot, e.g. `cw.snapshot_ladder (snapshot_id, category_key, severity, status, floor_rung)`,
   primary key `(snapshot_id, category_key, severity)`, with `status` constrained to the same five
   values as `cw.ladder_health` (`intact | degraded | floor_unusable | floorless | empty`).
   A header table rather than a `status` column on `snapshot_ladder_rung` because:
   - a rung-level `status` would be repeated per rung and need a same-value constraint;
   - it gives `floor_rung` an explicit home instead of inferring it from `is_floor`, which loses
     the floorless case cleanly rather than by accident; and
   - it lets a **zero-rung ladder** (status `empty`) be stored at all — today it vanishes.
2. `snapshot_rows()` emits a `"snapshot_ladder"` list alongside `"snapshot_ladder_rung"`, one row
   per ladder including ladders with no rungs.
3. `snapshot_from_rows()` gains a `ladder_rows` parameter and takes `status` and `floor_rung` from
   it. The `status="intact"` literal at `run.py:189` is deleted. Keep the parameter optional with a
   documented default only if no header row exists **and** raise rather than silently defaulting
   when rung rows exist without a header — silent defaulting is the present bug.

**Degraded-ladder fixture.** In `test_run.py`, add a fixture that mirrors the existing intact one
but with `Ladder(category="Data Privacy", severity=HIGH, rungs=(...), floor_rung=1,
status="degraded")`. Two tests:
- `test_a_degraded_ladder_survives_the_round_trip` — build → `snapshot_rows` → `snapshot_from_rows`
  → assert the rebuilt `snapshot_id` equals the original **and** `ladder_for(...).status ==
  "degraded"`.
- `test_a_replayed_degraded_ladder_still_escalates` — rebuild from stored rows, then `descend()`
  from rung 0 and assert `escalate is True`. This is the finding's real consequence: today a
  replayed run would descend a ladder that escalated at run time.

Add a third for the zero-rung case: `test_an_empty_ladder_is_still_pinned`.

---

### E2 — the keystone: complete seam-mismatch inventory

`loader-sql.test.mjs` works by extracting the Python triple-quoted SQL constants verbatim and
running them against the migrated PGlite schema (`loader-sql.test.mjs:32-41`). The write side has
no such anchor because the engine emits **dictionaries, not SQL** — there is no string to extract.
So the write-side mirror must be built differently: generate the rows in Python, hand them to the
JS test as JSON, insert them into the migrated schema, read them back, hand them back to Python,
and re-run `snapshot_from_rows`. See WP-2 for the mechanism.

#### Inventory

| # | Where | Engine emits | Schema wants | Consequence | Tag | Evidence |
|---|---|---|---|---|---|---|
| M1 | `snapshot_ladder_rung` | key `category`, value is the **label** (`"Data Privacy"`) | column `category_key`, value is the **key** (`"data"`), FK to `cw.category(key)` | Insert fails on unknown column; if renamed only, fails the FK | Observed | `run.py:45-46` vs `0005:41` |
| M2 | `snapshot_from_rows` | reads `r["category"]` and assigns it to `Ladder.category` unchanged | DB returns `category_key` holding a key; `Ladder.category` is hashed as the **label** | **Snapshot id changes on round trip** even after M1 is fixed. The label↔key translation is needed in *both* directions. | Observed | `run.py:178`, `:185`; hash at `snapshot.py:95` |
| M3 | ladder `status` | not emitted at all | no column exists | E1 | Observed | `run.py:40-51`; `0005:38-48` |
| M4 | zero-rung ladder | not emitted (loop over `ladder.rungs` never runs) | — | A `status='empty'` ladder is in the hash but not in storage → rebuild misses it → id mismatch | Observed | `run.py:40-41` |
| M5 | `run_decision.category` | the **label** (`d.risk.category`), plain text, no FK | `category text not null` — plain text, **no FK, no enum** | Not a failure, but an *inconsistency*: the same concept is stored as a key in one table and a label in another. Worth naming to the database owner; a hallucinated category (E7) lands here unchallenged. | Observed | `run.py:110` vs `0005:99` |
| M6 | `run.manifest` | a **JSON string** from `json.dumps` | `jsonb` | Depends entirely on the driver. An untyped parameter casts; a parameter typed as `text` does not. Untested either way — the write-side test must pin it. | Observed (types) / Inferred (behaviour) | `run.py:85` vs `0005:78` |
| M7 | `run_decision.severity` | includes the synthetic `"Baseline"` for always-include decisions | `severity text not null` — **no check constraint** | Passes today, but only because the column is unconstrained. If the database owner adds the obvious `check (severity in ('Standard','High'))` — matching `run_finding.severity` at `0005:122` — every baseline decision breaks. Flag to the database owner before they tighten it. | Observed | `model.py:18`, `resolution.py:51` vs `0005:100`, `0005:122` |
| M8 | `run_decision.suppressed`, `run_finding.refs` | Python `list[str]` | `text[] not null default '{}'` | Driver-dependent array binding, never exercised. Must be asserted, including the empty-list case (the read side already learned this lesson for `tags`, `loader-sql.test.mjs:132`). | Observed | `run.py:119`, `:133` vs `0005:111`, `:125` |
| M9 | `snapshot.taken_on` | `None` when the snapshot was built without a date | `taken_on date` (nullable) — fine | No failure. But `snapshot_from_rows` takes `taken_on` as a **separate argument** and does not read it from the snapshot row, so a caller who forgets it rebuilds with `taken_on=None`. `taken_on` is not hashed (`snapshot.py:74-102`), so the id survives — but the rebuilt object is not equal to the original. A latent trap, not a defect. | Observed | `run.py:53-54`, `:146` |

**Not mismatches (verified clean).** `cw.run` — all thirteen emitted keys match columns exactly
(`run.py:80-103` vs `0005:70-91`). `cw.snapshot_member` — four keys, exact match. `cw.ruleset` /
`cw.ruleset_member` — exact. `cw.run_finding` — all eight keys match; `rule_version` is correctly
split out of `"RULE@vN"` at `run.py:124`. The `override_needs_ref` constraint (`0005:90`) is
satisfied by `ValidationResult` only if `overridden` implies a caller-supplied `override_ref` —
**untested**, and the write-side suite should prove both the satisfied and the violated case.

#### The write-side test (S4)

New file `backend/db/test/run-store-write.test.mjs`, modelled on `loader-sql.test.mjs`:

1. Migrate a fresh PGlite, seed the same small library the read-side test seeds.
2. Shell out to Python once: a tiny `backend/engine/_fixture_rows.py` (or a `python -c`) that
   builds a snapshot **including a degraded ladder and an empty ladder**, resolves a manifest,
   validates, and prints `{snapshot_rows, ruleset_rows, run_rows}` as JSON on stdout. Keeping the
   generator in Python is the point — a hand-written JSON fixture in the JS file would be a second
   copy free to drift, which is exactly what `loader-sql.test.mjs` refuses to allow.
3. Insert every row into the migrated schema with column names taken **from the emitted keys**, so
   a renamed column fails the test rather than being papered over by a hand-written INSERT.
4. Select the rows back (joining `cw.category` to recover the label), print them as JSON, and shell
   back to Python to run `snapshot_from_rows`.
5. Assert: the rebuilt `snapshot_id` equals the original; the ladder statuses survive; `suppressed`
   and `refs` round-trip including empty; `manifest` comes back as an object not a string; the
   immutability triggers (`0005:132-152`) still refuse an update to any inserted row.

**Alternative if the Node↔Python shell-out proves fragile on Windows:** run the whole test from
Python with the JS side reduced to a schema-dump. I prefer the shell-out because it keeps a single
source of truth for the row shapes; the fallback is noted as a risk (R2).

---

### E3 — decision: newest selectable version wins, and the ladder's preferred rung wins over that

Two separate defects share one function.

**(a) Version ordering.** Today `_order` sorts ascending and `next()` takes the first, so the
*oldest* selectable version of a clause is chosen (`resolution.py:37`, `:116`). Recommendation:
**newest selectable version of each clause_id wins.** Reasoning: a superseded version is selectable
only during run-off (`model.py:38-40`); it exists so that in-flight work does not break, not so
that new contracts keep issuing last year's wording. Issuing the old version when Legal has already
approved a newer one is a content decision the system would be making on Legal's behalf — which the
product boundary forbids. Newest-wins is also what the reader expects from the word "superseded".

Implementation: collapse candidates to the highest version per `clause_id` *before* severity
matching, then keep `(clause_id, -version)` as the deterministic order. The older versions must
still appear in `suppressed` — the audit question is "why not the other one" (`0005:109-110`).

**(b) Ladders are never consulted.** `_resolve_risk` has no reference to `snapshot.ladder_for`
(whole function, `resolution.py:92-131`). A ladder's rung 0 is defined as "the preferred position"
(`model.py:63`), and the opening position of a negotiation is precisely what resolution picks. So:
if a ladder exists for `(category, severity)`, its status is `intact`, and its rung-0 clause is in
the snapshot and selectable, **rung 0 is the selection**, and the reason string says so. Otherwise
fall through to the existing severity-match logic unchanged.

Deliberately conservative: a non-intact ladder is *not* consulted for opening position either —
consistent with `descend()`'s refusal (`resolution.py:166`) and with failing closed. And the ladder
never *adds* a candidate that is not already selectable in the snapshot.

Tests: `test_the_newest_selectable_version_wins`; `test_the_superseded_version_is_recorded_as_
suppressed`; `test_a_ladders_preferred_rung_is_the_opening_position`; `test_a_degraded_ladder_does_
not_set_the_opening_position`; `test_a_ladder_never_introduces_an_unselectable_clause`.

---

### E4 — a lapsed always-include clause becomes a loud, gating decision

The baseline pass must look at *all* always-include clauses, not only selectable ones
(`resolution.py:46`). For each always-include `clause_id` where no version is selectable, emit:

```
Decision(risk=Risk(category=<category>, severity=BASELINE,
                   justification="Always included"),
         selected=None, baseline=True, expired_only=True,
         reason="Baseline Framework §X has no active clause · N candidate(s) retired or expired",
         warning="<category> is a mandatory section and has lapsed — a contract cannot issue")
```

Because `selected is None`, `Decision.unresolved` becomes true, so it already flows into
`Resolution.unresolved` and into the run store as a null-clause decision (`run.py:113-114`,
`0005:102`). Whether that *blocks* the gate is the validation engine's call, not resolution's —
resolution's job here ends at making the gap visible and giving a named person somewhere to act.
Per the product boundary, the system does not fill the gap.

Note the grouping subtlety: always-include is a property of the clause, and multiple versions of
one `clause_id` exist. The pass must group by `clause_id` and emit one decision per clause, not one
per version.

Tests: `test_a_lapsed_always_include_clause_produces_a_gating_decision`;
`test_a_lapsed_baseline_section_is_not_silently_dropped_from_the_document` (asserting the emitted
document has no section for it **and** the run record has a decision saying why);
`test_a_baseline_clause_with_one_lapsed_and_one_live_version_uses_the_live_one`.

---

### E5 — real-world Word containers and tracked moves

**Container enumeration.** The OOXML elements that can contain `w:r` (or further nest containers)
inside a `w:p`, all of which `parse_redlines` currently walks straight past:

| Element | What it is | Treatment |
|---|---|---|
| `w:hyperlink` | link | **transparent** — recurse, children keep their own change context |
| `w:sdt` → `w:sdtContent` | content control (the `w:sdtPr` sibling is properties, **not** content) | **transparent** into `w:sdtContent` only |
| `w:smartTag` | legacy smart tag | transparent |
| `w:customXml` | custom XML wrapper | transparent |
| `w:fldSimple` | simple field (page numbers, cross-references) | transparent |
| `w:bdo`, `w:dir` | bidirectional/direction override | transparent |
| `w:ins` | insertion | change context → `ins` |
| `w:del` | deletion | change context → `del` (text lives in `w:delText`) |
| `w:moveTo` | tracked move, destination | change context → `ins` (see below) |
| `w:moveFrom` | tracked move, origin | change context → `del`; text lives in `w:delText` |
| `w:moveFromRangeStart/End`, `w:moveToRangeStart/End` | range markers pairing the two halves | **carry no text — skip.** They may sit at paragraph level between the halves. |
| `w:bookmarkStart` / `w:bookmarkEnd` | bookmark markers | carry no text — skip |
| `w:proofErr`, `w:commentRangeStart/End` | proofing and comment markers | carry no text — skip |
| `w:rPr`, `w:pPr` | run/paragraph properties | **must not be recursed into** — `w:pPr` can contain `w:rPr` with `w:ins`/`w:del` marking a *formatting* change, which is not text |

Critically, **containers nest**: `w:hyperlink` inside `w:ins`, `w:ins` inside `w:sdtContent`,
`w:hyperlink` inside `w:sdtContent` inside `w:ins`. The fix is therefore not "add three more
`elif` branches" — it is to replace the flat `for child in list(p)` loop (`docx.py:267`) with a
recursive walk carrying a change-context ("keep" | "ins" | "del") down the tree, and to derive the
run's text tag from the context (`w:delText` under del/moveFrom, `w:t` otherwise). Segments are
appended in document order, which the recursion preserves naturally.

**Tracked-move semantics — recommendation: `w:moveFrom` → `del`, `w:moveTo` → `ins`.**

Why. Word models a move as a linked delete/insert pair; the only thing "move" adds over
delete-plus-insert is the identity link between the halves. Three properties argue for the mapping:
`accepted_text` (keep + ins) and `original_text` (keep + del) both come out correct with no further
change (`docx.py:226-233`); no text is ever lost, which is the failure mode that matters when
Legal is looking at a Review ticket; and it needs no new `Segment.kind`, so nothing downstream
changes. Modelling moves as a distinct kind would be more faithful but would silently break every
consumer that switches on `kind`, for a distinction Legal adjudicates identically. If the paired
identity is wanted later, the honest place is an optional `move_id` field on `Segment` — recorded,
not acted on. **Not proposed now.**

**Fixture honesty.** I cannot produce genuine Word output in this environment — there is no Word
installation, and generating a file with `python-docx` would not help because the module's own
docstring records that python-docx cannot even *read* tracked changes (`docx.py:5-7`), so it
certainly cannot author the containers at issue. **Proposed substitute, labelled as such:**
hand-built XML that reproduces the *structures* Word emits, taken from the ECMA-376 element
definitions, with each fixture carrying a comment naming the Word feature it stands for (e.g.
"Word emits this shape when a user tracks a change inside a hyperlink"). The test module gets a
header comment stating plainly: **these fixtures are structurally faithful to the schema, not
captured from Word; they demonstrate the parser handles the shapes, not that Word produces exactly
these bytes.** If a real vendor `.docx` with tracked changes can be obtained later, it should be
committed as a binary fixture and this limitation retired. Recorded as an open item, not hidden.

Also in scope here (found beyond the review): remove the unreachable `w:delText` branch at
`docx.py:165-170` and replace it with an explicit exclusion that actually runs, so the comment and
the code agree.

Tests: one per container (`hyperlink`, `sdtContent`, `smartTag`, `fldSimple`), one for each nesting
combination, `test_a_tracked_move_is_read_as_a_deletion_and_an_insertion`,
`test_move_range_markers_do_not_become_segments`,
`test_a_formatting_only_change_in_pPr_is_not_read_as_text`,
`test_paragraphs_still_excludes_deleted_text_after_the_rewrite`.

---

### E6 — hostile uploads: no new dependency required

**What the code does today** (`docx.py:146-157`): `zipfile.ZipFile(BytesIO(data)).read(
"word/document.xml")` — decompresses the whole member into memory with no cap — then
`ET.fromstring(raw)`, i.e. `xml.etree.ElementTree` on top of `pyexpat`.

**Measured behaviour** on this interpreter (Python 3.10.11) — **Observed**, command output:

```
PARSED, len: 3000            # 3-level billion laughs expanded silently
EXT RAISED: ParseError undefined entity &x;   # external entity already blocked
```

So: **internal general entity expansion is live** (a 9-level payload is the standard billion-laughs
and would exhaust memory); **external entity resolution and XXE are already blocked** by
ElementTree's default handling. The review is right about the entity bomb and the zip bomb; it does
not need to worry about XXE.

**Recommendation: fix in the standard library. Do not add `defusedxml`.**

`defusedxml` would be a new runtime dependency and therefore approval-sensitive under the contract
(§8). It is also *weaker than necessary* for this input: `defusedxml` permits a DOCTYPE and merely
limits expansion, whereas a legitimate OOXML part **never carries a DOCTYPE at all** — ECMA-376
parts are plain XML with no document type declaration, and Word does not emit one. So the correct
defence for this specific input is to reject a DOCTYPE outright, which is stricter than
`defusedxml` and costs nothing. A dependency that buys a weaker guarantee is not worth the
approval.

**The three defences.**

1. **Refuse a DOCTYPE.** Before parsing, scan the decompressed part's prologue (everything before
   the first `<` that starts an element, in practice the first ~4 KB) case-insensitively for
   `<!DOCTYPE`, and raise `NotADocx("word/document.xml declares a document type — Word documents
   do not; refusing to parse")`. This kills entity expansion at the source: with no DTD there are
   no entity declarations. Belt-and-braces alternative in stdlib if a prologue scan feels fragile:
   install a `ET.XMLParser` and set `StartDoctypeDeclHandler` on its underlying expat parser to
   raise. Both are stdlib. I recommend the prologue scan as the primary because it is readable and
   testable without touching a private attribute, with the handler as a second line if the reviewer
   prefers belt and braces.
2. **Cap decompressed size.** Replace `z.read(name)` with `z.open(name)` and a bounded read:
   `raw = fh.read(MAX_PART_BYTES + 1)`; if `len(raw) > MAX_PART_BYTES`, raise `NotADocx`. This does
   not trust `ZipInfo.file_size`, which the attacker writes. **Proposed cap: 32 MiB** for
   `word/document.xml` — a 700-page contract with tracked changes is comfortably under 20 MB of
   XML, so the cap is generous by an order of magnitude while a bomb is orders of magnitude over.
3. **Cap the archive itself, before touching any member.** Reject an archive with more than
   `MAX_MEMBERS` entries (**proposed: 512** — a real `.docx` has tens), reject a total declared
   `file_size` sum over `MAX_TOTAL_BYTES` (**proposed: 128 MiB**, a cheap early rejection on the
   attacker's own declaration), and reject any member whose declared compression ratio exceeds
   `MAX_RATIO` (**proposed: 1000:1**). All three thresholds go in one clearly-named constants block
   with a comment explaining the units and the reasoning, so raising one is a visible decision.

Every constant is module-level and named, so the numbers can be argued with rather than discovered.

**Fixtures** (built by test helpers, no binaries committed):
- `entity_bomb_docx()` — a valid zip whose `word/document.xml` carries the classic 9-level
  billion-laughs DTD. Assert `NotADocx` is raised **and** that it is raised in under a second
  (a timing bound is what distinguishes "rejected" from "expanded then rejected").
- `nested_entity_docx()` — a single benign `<!ENTITY>` with no recursion, to prove the defence is
  "no DOCTYPE" and not "no large output".
- `zip_bomb_docx()` — `word/document.xml` = 100 MB of a single repeated byte, compressed with
  `ZIP_DEFLATED` (compresses to a few kilobytes). Assert `NotADocx`, and assert peak allocation
  stays bounded via `tracemalloc`.
- `lying_header_docx()` — a member whose `ZipInfo.file_size` is understated relative to the real
  decompressed stream, proving the cap is enforced on bytes actually read, not on the header.
- `many_members_docx()` — 5,000 tiny members.
- Plus a **control**: a normal, slightly large but legitimate document must still parse, so the
  caps are proven not to reject real work.

---

### E7 — the manifest trust boundary, as one function

**Where it lives.** A new module `backend/engine/manifest.py`. Not in `model.py` (which is
deliberately pure value types with no logic) and not in `loader.py` (which is the *registry* seam,
not the *LLM* seam). The trust boundary deserves its own file with a docstring that says what it
guards, in the same style as the other modules.

**The function.**

```python
def validated_manifest(raw: Mapping, categories: Iterable[str]) -> tuple[Manifest, tuple[Dropped, ...]]
```

- `categories` is the label list from `cw.category` — passed in, never hard-coded, so the enum has
  exactly one home (the database) and the engine stays database-free.
- **Unknown category → dropped**, and the drop is *recorded*: a frozen `Dropped(category, severity,
  justification, reason)` value returned alongside the manifest. Never silently discarded, never
  passed through.
- **Severity coerced**: anything not in `{Standard, High}` becomes `Standard`, and the coercion is
  itself recorded (a `coerced` flag or a second record type — the point is that it is visible).
  `Baseline` from an LLM is *not* accepted; it is synthetic and belongs only to the always-include
  pass (`model.py:18`).
- **Refuse rather than guess** if `categories` is empty — mirroring the prototype's
  `"CATEGORIES unavailable — refusing unvalidated LLM manifest"` (`engine.jsx:51`). An empty enum
  would drop everything and report a total coverage failure.
- Missing/blank `vendor` → raise. A run that cannot name a counterparty is not a run.

**Who must call it.** Every path that turns model output into a `Manifest`. Today that is the
service layer that will call `resolve`; there is no such caller in `backend/` yet, so the
enforcement mechanism is a test plus a docstring contract on `resolve`: `resolve` documents that it
takes a *validated* manifest, and `validated_manifest` is the only supported constructor from
untrusted input. When the service layer lands, it calls this and nothing else.

**Dropped must be distinct from "no clause available."** This is the finding's real point. A
dropped hallucinated category must never surface as a library coverage gap. Two consequences:
- The `Dropped` records travel with the run and get stored. **New table needed (database owner's
  call, I name the shape only):** `cw.run_manifest_dropped (run_id, seq, category, severity,
  justification, reason)`. Without it the record dies in memory and the report still lies.
- `run_rows()` gains a `"run_manifest_dropped"` list, and the write-side test (WP-2) covers it.

Tests: `test_a_hallucinated_category_is_dropped_and_recorded`;
`test_a_dropped_category_never_becomes_a_coverage_gap` (resolve the validated manifest and assert
no `Decision` with `reason="No clause available in Ledger"` exists for the hallucinated label);
`test_an_unknown_severity_is_coerced_to_standard_and_the_coercion_is_recorded`;
`test_baseline_severity_from_a_model_is_refused`;
`test_an_empty_category_list_refuses_the_manifest`.

---

### E8 — the smalls

1. Delete `Descent.at_floor` (`resolution.py:146-148`). It has no caller and its logic is wrong.
   If a floor indicator is wanted, the correct expression is `rung is not None and rung ==
   ladder.floor_rung`, which requires the ladder — so it does not belong on `Descent` as a bare
   property. Deleting is the honest fix. **This is a deletion of production code, not of a test
   assertion, so it is outside the contract's §8 approval trigger — but it is disclosed here.**
2. Remove dead imports: `docx.py:24 re`, `docx.py:26 field`, `model.py:10 field`, `run.py:20
   asdict`, `validation.py:25 field`, `test_loader.py:6 STANDARD`.
3. `backend/README.md:51-55` — correct the five engine test counts. Better: state them as a single
   total, or drop the per-file numbers entirely, since a hand-maintained count is guaranteed to
   drift again. **Recommendation: keep per-file names, drop per-file counts, keep one total** — and
   add a note that the total is checked by `npm run verify`.
4. `test_docx.py:126` — strengthen `test_an_unresolved_risk_is_omitted_not_invented` so it asserts
   both halves: no Insurance section **and** every resolved section is present. As written it
   passes on an empty document. This is *strengthening* an assertion, not weakening one.
5. `test_docx.py:272-273` — anchor the substring match to the paragraph's full expected text rather
   than the bare digits `"24"` / `"72"`.

---

## Candidate work packages

Ordered. Each has a single owner file set; collisions are called out.

| WP | Title | Findings | Touches | Depends on |
|---|---|---|---|---|
| **WP-1** | Ladder header in the snapshot round trip | E1, M3, M4 | `engine/run.py`, `engine/snapshot.py` (no change expected — verify), `engine/test_run.py`; **needs** the `cw.snapshot_ladder` table from the database owner | Database owner's migration |
| **WP-2** | Write-side seam test and the mismatch fixes | E2 (M1, M2, M5–M9) | `engine/run.py`, new `engine/_fixture_rows.py`, new `db/test/run-store-write.test.mjs`, `backend/package.json` | WP-1 (the test must cover the new ladder header, so build it once) |
| **WP-3** | Resolution: newest version wins, ladder sets the opening position | E3 | `engine/resolution.py`, `engine/test_resolution.py` | none |
| **WP-4** | A lapsed baseline clause becomes a loud decision | E4 | `engine/resolution.py`, `engine/test_resolution.py` | **WP-3** — same function, guaranteed collision |
| **WP-5** | Hostile-upload defences | E6 | `engine/docx.py` (top half), `engine/test_docx.py` | none |
| **WP-6** | Word containers and tracked moves | E5 | `engine/docx.py` (bottom half), `engine/test_docx.py` | **WP-5** — same two files |
| **WP-7** | The manifest trust boundary | E7 | new `engine/manifest.py`, new `engine/test_manifest.py`, `engine/run.py`; **needs** `cw.run_manifest_dropped` from the database owner | WP-2 (adds a row list to `run_rows`, which WP-2 owns) |
| **WP-8** | The smalls | E8 | `engine/resolution.py`, `engine/docx.py`, `engine/model.py`, `engine/validation.py`, `engine/run.py`, `engine/test_loader.py`, `engine/test_docx.py`, `backend/README.md` | **last** — touches nearly every file; run it after WP-1..WP-7 to avoid conflicting with all of them |
| **WP-9** | Mutation harness extension | all | `engine/mutation_check.py` | all of the above |

**Ordering constraints.**
- WP-1 → WP-2 → WP-7 is a hard chain: each adds row lists that the write-side test must cover.
- WP-3 → WP-4 is a hard chain (both rewrite `_resolve_risk`/the baseline pass).
- WP-5 → WP-6 is a hard chain (both rewrite `docx.py`; WP-5 changes `_document_xml`, WP-6 changes
  `parse_redlines` and `paragraphs`).
- WP-8 must be last. It touches six of the eight engine modules.
- WP-3/WP-4 and WP-5/WP-6 are independent of each other and of WP-1/WP-2, so the three chains can
  run in parallel if three implementers exist.

**File-collision notes.**
- `engine/run.py` is touched by WP-1, WP-2 and WP-7 — **serialise these three.**
- `engine/resolution.py` is touched by WP-3, WP-4 and WP-8.
- `engine/docx.py` and `engine/test_docx.py` by WP-5, WP-6 and WP-8.
- `backend/package.json` by WP-2 only from my slice — but the database planner may also add a
  suite. **Cross-plan collision: flag to the orchestrator.**
- `engine/mutation_check.py` by WP-9 only. Keep it that way — every other package should hand its
  mutation to WP-9 rather than editing the harness itself.
- **The two new tables** (`cw.snapshot_ladder`, `cw.run_manifest_dropped`) are named here but owned
  by the database planner. **Cross-plan dependency: flag to the orchestrator.** If the database
  planner declines either, WP-1 and WP-7 must be renegotiated, not silently downgraded.

---

## New mutations

Added to `engine/mutation_check.py` (WP-9). Each breaks exactly one new guarantee and names the
test that must then fail.

| # | Mutation | File | Change | Test that must fail | Proves |
|---|---|---|---|---|---|
| N1 | ladder status is not stored | `run.py` | drop `status` from the emitted ladder header | `test_a_degraded_ladder_survives_the_round_trip` | E1 storage |
| N2 | rebuild hard-codes intact again | `run.py` | `status=row["status"]` → `status="intact"` | `test_a_replayed_degraded_ladder_still_escalates` | E1 replay |
| N3 | empty ladders are dropped | `run.py` | skip ladders with no rungs | `test_an_empty_ladder_is_still_pinned` | M4 |
| N4 | the label/key translation is skipped | `run.py` | emit the label into `category_key` | `run-store-write.test.mjs` insert | M1/M2 |
| N5 | oldest version wins again | `resolution.py` | restore ascending version order | `test_the_newest_selectable_version_wins` | E3(a) |
| N6 | the ladder is ignored for opening position | `resolution.py` | `ladder = None` in `_resolve_risk` | `test_a_ladders_preferred_rung_is_the_opening_position` | E3(b) |
| N7 | a degraded ladder sets the opening position | `resolution.py` | drop the `status == "intact"` guard in `_resolve_risk` | `test_a_degraded_ladder_does_not_set_the_opening_position` | E3(b), fail-closed |
| N8 | a lapsed baseline clause vanishes again | `resolution.py` | restore `if c.always_include and c.selectable` | `test_a_lapsed_always_include_clause_produces_a_gating_decision` | E4 |
| N9 | the DOCTYPE check is removed | `docx.py` | make the prologue scan always pass | `test_an_entity_bomb_is_refused` | E6 entity |
| N10 | the decompression cap is removed | `docx.py` | `MAX_PART_BYTES = 1 << 60` | `test_a_zip_bomb_is_refused` | E6 zip |
| N11 | the cap trusts the header | `docx.py` | check `ZipInfo.file_size` instead of bytes read | `test_a_lying_zip_header_is_still_refused` | E6, attacker-controlled input |
| N12 | container recursion is removed | `docx.py` | restore the flat direct-children loop | `test_a_change_inside_a_hyperlink_is_read` | E5 |
| N13 | tracked moves are ignored | `docx.py` | drop `w:moveFrom`/`w:moveTo` from the context map | `test_a_tracked_move_is_read_as_a_deletion_and_an_insertion` | E5 moves |
| N14 | range markers become segments | `docx.py` | treat `w:moveToRangeStart` as transparent | `test_move_range_markers_do_not_become_segments` | E5 |
| N15 | unknown categories pass through | `manifest.py` | return the raw risks unchanged | `test_a_hallucinated_category_is_dropped_and_recorded` | E7 |
| N16 | drops are silent | `manifest.py` | return `()` for the dropped tuple | `test_a_dropped_category_never_becomes_a_coverage_gap` | E7 — the finding's actual point |
| N17 | severity is not coerced | `manifest.py` | pass severity through unchanged | `test_an_unknown_severity_is_coerced_to_standard...` | E7 |

The existing sixteen mutations must all still pass. N4 is unusual in that it is proved by the JS
suite rather than pytest — `mutation_check.py` will need a way to name a Node test, or N4 moves to
`db/test/mutation-check.mjs`. **Recommendation: put N4 in the JS harness**, since that is where the
test it breaks lives. Flag to the orchestrator as a harness-ownership question.

---

## Risks and unknowns

| ID | Risk | Tag | Mitigation |
|---|---|---|---|
| R1 | Two new tables are needed and I do not own migrations. If the database planner declines, WP-1 and WP-7 lose their storage. | Observed (scope boundary) | Named precisely, with shapes, so the database planner can accept or counter. Escalate to the orchestrator, do not downgrade silently. |
| R2 | The write-side test shells between Node and Python. Windows path/quoting and `python` vs `python3` are real friction. | Inferred | Fallback: drive the whole test from pytest with PGlite invoked via `node -e`, or reduce the JS side to a schema dump consumed by Python. Decide during WP-2, disclose whichever is used. |
| R3 | `jsonb` binding of a JSON *string* (M6) may work or may not, depending on the PGlite driver — and PGlite may not behave identically to real Postgres. | Unresolved | The write-side test settles it empirically. If PGlite and Postgres differ, that is a finding to disclose (contract A2). |
| R4 | E5 fixtures are structurally faithful, not captured from Word. A real Word document could still contain a shape none of us anticipated. | Observed (no Word in this environment) | Label the limitation in the test module header and in the README. Do not claim Word fidelity. Retire it if a real vendor `.docx` is obtained. |
| R5 | E3's newest-wins change alters existing selections, so some current tests may legitimately change expected values. | Inferred | Any such change is a **finding to disclose**, not a quiet edit (contract §5.7). Expect at most one or two, since the loader fixture has a single version per clause. |
| R6 | The chosen size caps (32 MiB / 128 MiB / 512 members / 1000:1) are judgement calls with no empirical basis in this repo. | Assumed | Named constants with reasoning in comments, plus a control test proving a legitimate large document still parses. Easy to raise, visibly. |
| R7 | E4 emits new decisions where none existed. If the validation engine treats `unresolved` as gate-blocking, some fixtures may flip from gate-open to gate-closed. | Inferred | Check `validation.py`'s gate rule during WP-4. If the gate flips, that is the intended behaviour — disclose it. |
| R8 | M7: `run_decision.severity` accepts `Baseline` only because the column is unconstrained. If the database owner tightens it to match `run_finding`, baseline decisions break. | Observed | Flag to the database planner **before** they tighten. Cross-plan. |

---

## Disagreements

1. **With the proposal's E1 "or" branch.** Removing `status` from the hash is offered as an equal
   option. It is not. It would make the snapshot id assert sameness about two libraries that
   negotiate differently. Storing it is the only branch consistent with the reasoning the codebase
   already applies to `selectable` (`0005_run_store.sql:6-10`) and to `provenance_gap`
   (`snapshot.py:71-73`). Recorded as a decision, with the reasoning, for `memory.md`.

2. **With the review's framing of E2 as "one column".** It is at least nine mismatches across two
   directions, and the one the review names is not the worst — M2 (the read side puts a key into a
   hashed field) is, because it survives the obvious fix and then silently changes the snapshot id.

3. **With the review's framing of E5.** "Real-world Word documents will lose text" over-states it.
   The *emit* path and the authored-characters counter are unaffected because `paragraphs()`
   already recurses. Only `parse_redlines` is affected. The finding is real; the blast radius is
   half what it reads as. I also found a defect the review missed in the same function — the
   unreachable `w:delText` branch at `docx.py:165-170`.

4. **With the implied E6 remedy.** The natural reading of "no protection against entity-expansion
   attacks" is "add `defusedxml`". I recommend against it: it is a new runtime dependency requiring
   owner approval, and for this specific input it is *weaker* than the stdlib defence, because a
   legitimate OOXML part never carries a DOCTYPE at all and can simply be refused one.

5. **Partial, with E8's "a substring-match test that asserts nothing".** The review does not name
   the test. My best reading is `test_an_unresolved_risk_is_omitted_not_invented`
   (`test_docx.py:126`), which passes identically on an empty document. If the reviewer meant
   `test_deleted_text_is_not_part_of_the_document` (`:272`), that one does assert something real,
   merely loosely. **I will strengthen both** rather than guess. Tagged `Inferred`, not `Observed`.
