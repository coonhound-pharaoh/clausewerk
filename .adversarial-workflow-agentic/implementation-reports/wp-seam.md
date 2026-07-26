# WP-09 · WP-10 · WP-11 — ladder status, the write seam, the manifest boundary

- **assignment_id:** IMPL-SEAM · **stage:** Implementation (Gate 4) · **contract:** OC-CW-2026-07-25-01
- **date:** 2026-07-25 · **findings:** E1 (HIGH), E2 (HIGH, keystone), E7
- **baseline at start:** `python -m pytest engine -q` → 124 passed · `npm run verify` → exit 0

---

## 1. Acceptance criteria — written before editing, proved after

Per Gate 3 remediation §6, these were fixed before any code was touched.

| # | Criterion | Status | Proof |
|---|---|---|---|
| 1 | A run whose snapshot held a **degraded** ladder reproduces byte-identically; the negative control still proves today's library gives a different answer | **MET** | `test_a_run_taken_on_a_degraded_ladder_reproduces_years_later`, `test_a_degraded_ladder_survives_the_round_trip`; controls `test_assuming_the_ladder_was_intact_would_give_a_different_id` and the pre-existing `test_todays_library_would_give_a_different_answer` (still passing, unweakened) |
| 2 | `snapshot_rows()` / `run_rows()` output inserts into the migrated schema **without hand-editing**, and the round-tripped snapshot id is unchanged | **MET** | `writer-sql.test.mjs` — "snapshot_rows output inserts with nothing edited by hand", "run_rows output inserts with nothing edited by hand", "the round-tripped snapshot id is unchanged". The INSERT is generated from the emitted keys (`Object.keys(row)`); no column name is written by hand anywhere in the suite |
| 3 | Reverting **either** direction of the category translation changes the round-tripped id (the test can fail) | **MET** | `writer-sql.test.mjs` — "reverting the READ-side translation changes the id" (identity map ⇒ different id, ladder comes back as `data`); "reverting the WRITE-side translation is refused by the database" (label in `category_key` ⇒ FK violation). Also engine mutations M1/M2/S0-2 below, all caught |
| 4 | A hallucinated category is **dropped**, recorded as *dropped* in the run record, and does **not** appear as a coverage gap | **MET** | `test_a_hallucinated_category_never_becomes_a_coverage_gap` (asserts the defect exists unchecked, then that it is gone), `test_a_dropped_risk_is_recorded_as_dropped_not_discarded`, `test_a_real_gap_still_reports_as_a_gap` (control); `writer-sql.test.mjs` — "a hallucinated category never reaches the run decisions", "a dropped category is recorded as dropped in the run record", "a real coverage gap is still recorded as one" |
| 5 | `pytest engine -q` green; `npm run verify` exit 0 with no `MISS`/`IMPRECISE`/`SKIP` | **MET** | §5 raw output |

---

## 2. Files changed

| File | Change |
|---|---|
| `backend/engine/manifest.py` | **new.** `CategoryMap` (label ↔ key, built from `cw.category` rows), `UnknownCategory`, `check_manifest()` |
| `backend/engine/test_manifest.py` | **new.** 12 tests for the boundary and both translation directions |
| `backend/db/test/writer-sql.test.mjs` | **new.** 15 tests. The write-side counterpart to `loader-sql.test.mjs` |
| `backend/engine/run.py` | `ladder_status()` derivation; `category_key` on the way out, label on the way back; `CategoryMap` threaded through `snapshot_rows` / `run_rows` / `snapshot_from_rows`; rungless ladder refused; `dropped` written into the manifest column |
| `backend/engine/model.py` | `Manifest.dropped: tuple[Risk, ...] = ()` |
| `backend/engine/test_run.py` | call sites updated; 11 new tests (E1 + E2) |
| `backend/engine/mutation_check.py` | 9 new mutations. **No existing `find` string needed repair** — see §6 |
| `backend/db/migrations/0005_run_store.sql` | S0-2: `run_decision.category` → `category_key` with FK; `cw.run_contract` joins `cw.category` so the report still shows the label |
| `backend/db/test/run-store.test.mjs` | **deviation** — 5 lines, column rename only. See §7 |

`snapshot.py` and `loader.py` were **not** changed. `status` was already in the hash and the
decision was to keep it there; `CLAUSE_SQL`/`LADDER_SQL` column sets are unchanged, so
`loader-sql.test.mjs` is untouched and still green.

---

## 3. Per-finding notes

### WP-09 / E1 — ladder status stored and rebuilt

**Decision taken: derive, do not store.** No `cw.snapshot_ladder` header table was created and no
column was added. `run.ladder_status()` reproduces `cw.ladder_health`'s precedence
(`0003_ladders_and_concessions.sql:88-98`) from rows the snapshot already holds — rung count and
`is_floor` from `cw.snapshot_ladder_rung`, per-rung `selectable` from the frozen flag in
`cw.snapshot_member`. Status stays in the fingerprint, because `descend()` refuses a non-intact
ladder and two libraries differing only in status negotiate differently.

The cost the red team named — a Python re-implementation of a SQL view, free to drift — is real and
is answered rather than accepted: `writer-sql.test.mjs` asserts the derived status equals
`cw.ladder_health.status` **against the real view**, for `intact` and for `degraded`. Drift fails a
test rather than corrupting a fingerprint.

**Fixture.** The degraded fixture is in a state the view can actually emit: rung 0 unselectable,
floor rung usable. In the node suite this is produced by retiring `DP-H-014@v1` and then asserting
`cw.ladder_health` really says `degraded` before anything else is checked. The planner's proposed
all-selectable "degraded" fixture would have been theatre.

**Zero-rung ladders (the gap found on the write side).** A rungless ladder is hashed into the
snapshot id but emits no row, so it would vanish on the way to storage and the rebuild would produce
a different id with no diagnostic. It is **unreachable from the registry** — `LADDER_SQL`
inner-joins `cw.ladder_rung`, so `ladder_health`'s `empty` ladders are dropped before a snapshot is
built. It is reachable from hand-constructed `Ladder` objects. Handled by refusing: `snapshot_rows`
raises `ValueError`. Cheap, and it removes a silent-loss path rather than documenting one.

**Also fixed, unasked (X1/I4 from RT-2, one line):** `ladder_status` raises when a stored rung's
clause is not a member of the snapshot, instead of defaulting the flag. Silent defaulting there
surfaces later as an unexplained id mismatch, which is the same failure class this package exists to
close.

### WP-10 / E2 — the write-side seam

The suite writes **no column names by hand**. It pulls `CLAUSE_SQL`/`LADDER_SQL`/`RULE_SQL` out of
`loader.py` verbatim (same technique as `loader-sql.test.mjs`), runs them against the migrated
schema, hands the rows to the real engine in a subprocess, and generates every INSERT from
`Object.keys()` of whatever the engine emitted. The engine is imported, never re-implemented — a
second copy of the mapping in JavaScript would be one more thing free to drift, which is the defect
this suite exists to stop.

The loop is end to end: **database → `loader.build_snapshot` → `snapshot_rows` → database →
`snapshot_from_rows` → id compared**. That is what makes criterion 2 mean something.

`cw.run_contract` now joins `cw.category` and exposes `c.label as category`, so the key is for the
FK and the report a lawyer reads still says "Data Privacy". Asserted.

### WP-11 / E7 — the manifest boundary

One function: `engine.manifest.check_manifest(manifest, categories)`.

- Unknown categories are **dropped** and recorded in `Manifest.dropped` — a distinct state from
  "no clause available in Ledger", which is what an unchecked hallucination resolves to today.
- Severity is coerced to the two-value enum, mirroring the prototype
  (`prototype/v3/app/engine.jsx:56`): anything that is not exactly `High` becomes `Standard`.
  Coercing an unrecognised severity *up* would let a model block a contract by typo. `Baseline` in a
  manifest is coerced too — it is synthetic, emitted only by the always-include pass.
- **Fails closed on an empty enum**, same as the prototype: with no vocabulary there is nothing to
  validate against, so everything would pass.

**Where the dropped risks are recorded, and why not in `cw.run_decision`.** `run_decision.category_key`
now has an FK to `cw.category`, and a dropped category is by definition not in `cw.category` — it
*cannot* be stored there without weakening the constraint that makes a decision's category
trustworthy. They go into the `cw.run.manifest` jsonb, under `dropped`, each with
`reason: "unknown category"`. `manifest` already stores the model's output verbatim; this is the
part of that output we refused, kept next to it. No schema change was needed.

**Who must call it: the service layer, at the trust boundary, before `resolve()` sees the
manifest.** Stated in the module docstring. `resolve()` deliberately does **not** call it —
resolution is a pure function of a manifest and a snapshot and must not silently rewrite its own
input. There is no backend service layer yet (`backend/` is `db/` and `engine/` only), so this is a
contract on the code that will call `resolve`, and `writer-sql.test.mjs` demonstrates the intended
call order end to end.

**Product boundary.** The boundary drops what the model invented; it does not fill, guess or
substitute. A genuine gap in the library still reports as a gap — `test_a_real_gap_still_reports_as_a_gap`
is the control that proves the boundary did not silence the report it protects.

---

## 4. The complete verified list of seam mismatches

A column-by-column check of every key emitted by `snapshot_rows`, `ruleset_rows` and `run_rows`
against every column in `0005_run_store.sql`, re-run against the migrated schema by
`writer-sql.test.mjs` ("every table the engine emits is a table the schema has", plus the generated
INSERTs, which fail on any unknown column).

### Genuine, found and fixed — **two**, one in each direction

| # | Where | Defect | Evidence |
|---|---|---|---|
| **M1** | `run.py` `snapshot_rows` | emitted `category` holding the **label**; the column is `category_key` with an FK to `cw.category(key)` (`0005:41`) | Reproduced: the write-side revert test raises `foreign key` against the real schema |
| **M2** | `run.py` `snapshot_from_rows` | put the stored **key** into the hashed `Ladder.category`, so the snapshot id changed on round trip **even after M1 was fixed** | Reproduced: read-side revert with an identity map gives a different id and `ladder_categories == ['data']` |

M2 is the keystone, exactly as the red team said: it survives the obvious fix to M1, and only a
round-trip test can see it. Both are covered by their own engine mutation.

### Not a name mismatch, but a real defect in the same seam — **three**

| # | Where | Defect | Fix |
|---|---|---|---|
| M3 | `run.py:189` (old) | ladder `status` reset to `"intact"` on rebuild while being in the hash | derived (WP-09) |
| M4 | `run.py` `snapshot_rows` | a zero-rung ladder emitted no rows and vanished silently | refused with a diagnostic; **unreachable from the registry**, so this is a hand-constructed-object path, not live data loss |
| X1 | `run.py` | a stored rung with no matching member defaulted silently | raises |

### Planner-claimed mismatches that **do not exist** — confirmed refuted

| # | Claim | Verdict here |
|---|---|---|
| M5, M6, M8 | non-defects by the plan's own text ("Not a failure", "Depends entirely on the driver", "never exercised") | **not mismatches.** Nothing implemented |
| **M7** | "`severity='Baseline'` passes only because the column is unconstrained" | **REFUTED, verified independently.** `0002_clause_registry.sql:26` is `check (severity in ('Standard','High','Baseline'))` — Baseline is *already* permitted, so the mismatch does not exist. `run_decision.severity` was left unconstrained deliberately: it carries the synthetic `Baseline` that the always-include pass emits. **No remedy implemented** |
| **M9** | "the `taken_on` trap" | **CONFIRMED as an API note, not a defect.** `taken_on` is not hashed (`snapshot.py:74-102`), so the id survives. No remedy implemented |

**No new mismatch was found.** The audit stands at **one column-name mismatch on the write side**,
plus its mirror on the read side. The headline "nine" was inflated; the real count is two name
defects and three behavioural ones.

**Why it stayed hidden, confirmed:** `run-store.test.mjs:114` (and `executed.test.mjs:64`) insert
`run_decision` by hand and already used `category_key`. The engine's own output was never the thing
being inserted. That is the argument for this suite, and it is now structurally impossible to repeat:
`writer-sql.test.mjs` cannot hand-write a column name.

---

## 5. Raw test output

```
$ python -m pytest engine -q
146 passed in 2.36s
```

```
$ node db/test/writer-sql.test.mjs

the engine write side against the real schema
  ok   every table the engine emits is a table the schema has
  ok   snapshot_rows output inserts with nothing edited by hand
  ok   the emitted rung category satisfies the FK to cw.category
  ok   run_rows output inserts with nothing edited by hand
  ok   a decision names a category the registry defines
  ok   cw.run_contract still reports the human label
  ok   the round-tripped snapshot id is unchanged
  ok   the ladder comes back as a label, not a key
  ok   reverting the READ-side translation changes the id
  ok   reverting the WRITE-side translation is refused by the database
  ok   the derived status agrees with cw.ladder_health when intact
  ok   a degraded ladder is stored and rebuilt as degraded
  ok   a hallucinated category never reaches the run decisions
  ok   a dropped category is recorded as dropped in the run record
  ok   a real coverage gap is still recorded as one

15 passed, 0 failed
```

```
$ npm run verify
EXIT=0
23 passed, 0 failed      (audit-chain)
23 passed, 0 failed      (executed)
50 passed, 0 failed      (ladder)
16 passed, 0 failed      (loader-sql)
45 passed, 0 failed      (registry)
10 passed, 0 failed      (roles)
22 passed, 0 failed      (run-store)
15 passed, 0 failed      (writer-sql)
8/8 suites passed
146 passed in 2.36s
39/39 mutations caught by their named test     (db/test/mutation-check.mjs)
43/43 mutations caught by their named test     (engine/mutation_check.py)
```

No `MISS`, no `IMPRECISE`, no `SKIP` in either harness.

---

## 6. Mutations added — nine, all `ok` via their named test

All in `engine/mutation_check.py` (34 → 43). None in `mutation-check.mjs`, which is owned by another
implementer this cycle.

| Mutation | File | Named test |
|---|---|---|
| a rebuilt ladder is assumed intact (E1 regression) | `run.py` | `test_a_run_taken_on_a_degraded_ladder_reproduces_years_later` |
| a rungless ladder is dropped instead of refused | `run.py` | `test_a_rungless_ladder_is_refused_rather_than_quietly_lost` |
| a stored rung's category is the label, not the key (M1) | `run.py` | `test_snapshot_rows_emit_the_category_key_not_the_label` |
| a decision's category is the label, not the key (S0-2) | `run.py` | `test_run_decisions_emit_the_category_key_not_the_label` |
| the stored key is hashed as if it were a label (M2 — the keystone) | `run.py` | `test_the_key_is_translated_back_to_a_label_on_rebuild` |
| an unknown category crosses the trust boundary | `manifest.py` | `test_a_hallucinated_category_never_becomes_a_coverage_gap` |
| a dropped category is discarded instead of recorded | `manifest.py` | `test_a_dropped_risk_is_recorded_as_dropped_not_discarded` |
| severity is taken from the model verbatim | `manifest.py` | `test_severity_is_coerced_to_the_two_value_enum` |
| an empty category enum lets everything through | `manifest.py` | `test_an_empty_enum_fails_closed` |

**Existing `find` strings: none required repair.** The constraint anticipated damage to entries
keying on `snapshot.py` and `run.py`. The three `run.py` targets — `selectable=frozen[key],…`,
`if key not in frozen:` + its comment, and `"is_floor": rung == ladder.floor_rung,` — were preserved
byte-for-byte through the rewrite, and `snapshot.py` was not edited at all. All 34 pre-existing
engine mutations and all 39 node mutations still match and still fire. Verified by the 43/43 and
39/39 runs above, in which a stale string would have printed `SKIP` and exited 1.

---

## 7. Handoff to WP-27 — node mutations for the run store

`db/test/mutation-check.mjs` currently has **zero** mutations targeting the run store, and WP-27
owns it. `writer-sql.test.mjs` gives it named tests to point at for the first time. Recommended
entries, each with the test that should catch it:

| Proposed mutation (in `0005_run_store.sql`) | Test that must then fail |
|---|---|
| drop the FK on `run_decision.category_key` (`references cw.category(key)` → nothing) | `a decision names a category the registry defines` — and, better, add a negative insert asserting an undefined key is refused |
| drop the FK on `snapshot_ladder_rung.category_key` | `reverting the WRITE-side translation is refused by the database` (it is the FK that refuses) |
| `cw.run_contract` selects `d.category_key` instead of `c.label` | `cw.run_contract still reports the human label` |
| remove `constraint selection_is_whole` | `a half-written selection is refused` (`run-store.test.mjs`) |
| `snapshot_member.selectable` made nullable / defaulted | `the round-tripped snapshot id is unchanged` |

Also for WP-27's reconciliation pass: `writer-sql.test.mjs` shells out to `python` via
`CW_PYTHON` (default `python`). If CI's interpreter is not on `PATH` under that name, set the
variable rather than editing the suite.

---

## 8. Deviations

1. **`backend/db/test/run-store.test.mjs` was edited** — 5 lines, and the packet asked me not to
   touch existing db suites. S0-2 renames `run_decision.category` to `category_key`, and this suite
   inserts that column by hand in three places; leaving it would have left `npm run verify` red,
   failing acceptance criterion 5. The edit is a column rename plus one seed row
   (`('insu','Insurance','IN')`, needed because the FK now requires the Insurance category to
   exist). **No assertion was weakened, added or removed**; the suite's count went 22 → 22.
   Low collision risk: the concurrent implementer owns `0002/0003/0004/0006` and
   `mutation-check.mjs`, not this file.
2. **`backend/engine/model.py` gained a field** (`Manifest.dropped`) rather than the boundary
   carrying its own return type. A `(manifest, dropped)` pair would have to be threaded through
   every caller and would be droppable by any one of them; a field on the manifest travels with it
   into `run_rows` and cannot be forgotten. `dropped` is not read by `resolve()`, so it cannot
   affect an outcome, and it is not in the snapshot fingerprint.
3. **The `CategoryMap` is a required argument**, not an optional one with a fallback. An
   identity-mapping default would have been a silent-drift path of exactly the kind M1/M2 are, so
   the seven call sites in `test_run.py` were updated instead.
4. **`executed.test.mjs` already used `category_key`** when I reached it — no edit was needed there.
5. `snapshot.py` was in my ownership list but required no change: `status` was already in the hash,
   and the decision was to keep it there.

---

## 9. Limitations

- **`result_hash` is still not pinned to an engine version.** WP-12/13 changed resolution, so
  `result_hash` values stored before those packages will not replay. This surfaced as expected and
  was not chased — it is WP-32's job. Nothing in this package stores or checks an engine version.
- **`ladder_status()` is a Python re-implementation of a SQL view.** It is anchored by
  `writer-sql.test.mjs` against the real view for `intact` and `degraded` only. `empty`,
  `floorless` and `floor_unusable` are asserted against the view's precedence in
  `test_ladder_status_mirrors_the_health_view_precedence` (Python), not against the view itself —
  `empty` and `floorless` cannot be produced through `LADDER_SQL`'s inner join, and
  `floor_unusable` would need the floor rung retired, which the ladder tests set up elsewhere.
  If WP-23's rung-coherence work makes `floor_unusable` reachable in a fixture, add it here.
- **`check_manifest` has no caller in production code**, because there is no backend service layer
  yet. It is a contract stated in the docstring and demonstrated in `writer-sql.test.mjs`. Whoever
  builds the service layer must call it, and until then the boundary exists but is not enforced by
  the codebase's own structure. This is the one criterion-4 claim that rests on documentation rather
  than on a check.
- **Dropped risks live in a jsonb field, not a table.** Querying "how often does the model invent
  categories" means reading `cw.run.manifest->'dropped'`. That is adequate for an audit question and
  poor for a metric. If the coverage report ever needs to *count* hallucinations, it wants a table.
- The decision records this work implies (derive-don't-store for ladder status; `dropped` recorded in
  the manifest column rather than `run_decision`; boundary called by the service layer, not by
  `resolve`) are **not** written to `memory.md` — WP-29 owns that, per the execution order.
