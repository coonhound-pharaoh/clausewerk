# WPR-1 — Work Package Review (Gate 3)

- **assignment:** WPR-1 · lens: implementability
- **subject:** `.adversarial-workflow-agentic/work-packages/work-packages.md` (WP-01…WP-27)
- **verdict:** **Gate 3 FAILS as written.** 13 packages carry no acceptance criteria at all;
  two file collisions are scheduled concurrently; one stated dependency contradicts the stated
  execution order; one package's whole stated premise is factually refuted; new test suites are
  never wired into `npm run verify` until the last package, so no package before WP-27 can
  actually satisfy universal criterion U-A.

---

## 1. Verdict table

| WP | Verdict | Reason |
|---|---|---|
| WP-01 | **REVISE** | Sound instrument. But it must also own `backend/package.json`: `npm test` (`package.json:8`, `Observed`) hard-lists five suites, so the new suites added by WP-03, WP-10 and WP-16 never run under `npm run verify` until WP-27. Convert `test` to glob `db/test/*.test.mjs`, or every intervening package's U-A is vacuous. |
| WP-02 | APPROVE | Scope, files and acceptance all checkable. Premise verified: ADR-0010 and `NEGOTIATION-ARCHITECTURE.md` are committed at `dd0b396` (`git log`, `Observed`) — the review's staleness claim is correctly rejected. Both files are *also* modified in the working tree, so WP-02 must state which version it is amending. |
| WP-03 | **SPLIT** | Five independent sub-fixes (pre-image, fork guard, anchored tail, RLS + INSERT policy, definer `audit_verify`), each with its own migration surface, its own test and its own mutation. Not one sitting. Split 3a pre-image + `actor_role`; 3b fork guard + anchored tail; 3c RLS + INSERT policy + definer verify. Also: two of its four mutations are at risk of inertness — see §4. |
| WP-04 | **BLOCK** | (a) It states `Depends on: WP-03, WP-06`, but the integrated plan's Stage-2 sequence (`integrated-revision-plan.md:75-77`) runs `WP-03 → WP-04` *before* WP-06. The graph is acyclic; the **stated order is not executable**. (b) `U3` (what `app_role()` returns for the owner) is left unresolved *inside* the package with no default — Gate-3 blocking criterion. (c) No acceptance criterion for the ~30 owner-run tests that survive only because the owner bypasses RLS. |
| WP-05 | **BLOCK (scheduling)** | Content is fine. But it is declared "Runs parallel to WP-03/06" and all three write `mutation-check.mjs`. Serialize. |
| WP-06 | REVISE | Best-evidenced package in the set. Two gaps: the `revoke all on function … from public` spoof mutation is probably inert (§4); and RT-1's M1 (`clause_version.derived_from_concession`, which would put WP-06 into `0002` and collide with WP-05) is neither adopted nor explicitly dropped. State which. |
| WP-07 | APPROVE | Scope, target file, acceptance and two mutations all present and checkable. |
| WP-08 | **REVISE** | Acceptance present but **no mutations named**, and it closes an enforcement hole — U-C violation. File list omits `LIFECYCLE-ARCHITECTURE.md:296`, which the task itself says must be reconciled. RT-1's M6 (the `after insert` execution trigger fires the `before update` transition trigger; safe by luck) is dropped — state it. |
| WP-09 | REVISE | No mutation named; `mutation_check.py` is in the file list but nothing says what goes in it. Acceptance is otherwise strong. |
| WP-10 | **REVISE** | Target files incomplete: S0-2 (`run_decision.category` → `category_key` + FK) is a change to `0005_run_store.sql`, which WP-10 does not list, and `0005` is WP-09's file. Also needs `backend/package.json` (new suite). |
| WP-11 | APPROVE | Small, specific, one mutation, checkable acceptance. |
| WP-12 | **REVISE** | No acceptance criteria. No mutation, though `mutation_check.py` is listed. RT-2's I5 (`result_hash` reproducibility not pinned to an engine version — WP-09, WP-12 and WP-13 all change resolution outcomes) is dropped from every package; it belongs here or in a new package. |
| WP-13 | **REVISE** | No acceptance criteria, no mutation. "Loud, gating decision record" is not a checkable statement. |
| WP-14 | APPROVE | Premise correctly re-aimed on RT-2's reproductions; two fixtures, two mutations, both falsifiable. |
| WP-15 | **REVISE** | No acceptance criteria. The honesty constraint ("use the nearest honest substitute and label it") is a decision left inside the package — settle it before implementation. |
| WP-16 | **SPLIT + REVISE** | Four tables plus four design corrections plus a role-real test suite — not one sitting. Split: 16a `review_ticket`/`review_segment` + insert-and-update state guard + note CHECK; 16b `review_candidate` references; 16c `clause_draft` + `edited_before_approval`. **The fourth correction still has a hole** — see §5. Acceptance also lacks a positive control (a legitimate `pending` ticket must still be creatable) and lacks any mutation despite listing `mutation-check.mjs`. |
| WP-17 | **REVISE** | Files omit `0002_clause_registry.sql`. Adding `origin` to clause versions means `0002`'s immutability trigger (`0002:67-92`) must protect the new column, or `origin` is silently editable — which defeats "carries its origin permanently" (OC §5 constraint 2). Also no mutation. |
| WP-18 | **SPLIT + BLOCK** | Four unrelated builds in one package (required approvers · legal hold · signature evidence · MSA/SOW). **No acceptance criteria at all.** File list omits `0006_executed_agreements.sql`, which the task explicitly edits (`0006:44`, two signatory columns). Split into four. |
| WP-19 | **REVISE** | No acceptance criteria. Otherwise the `U1` default is stated and reversible, which is correct handling. |
| WP-20 | **REVISE** | No acceptance criteria and no named mutation, although the package's own justification for not being documents-only is "it needs a CHECK, a test and a mutation". Collides with WP-21 on `CLAUSE-LIBRARY-ARCHITECTURE.md` with no sequencing. |
| WP-21 | **REVISE** | No acceptance criteria. Collides with WP-20 (CLA) and with WP-24 (`backend/README.md`). RT-3's missed-issue 4 (`ADR-0008` role text) is dropped — `ADR-0008` is an OC §2 target owned by no package. |
| WP-22 | REVISE | No acceptance criteria. Otherwise well-scoped. |
| WP-23 | **REVISE** | The fixture ruling is **verified correct** (§6) but the **disclosure is incomplete** — new evidence, §6. No acceptance criteria; no mutation named. |
| WP-24 | APPROVE | All four claims verified: `test_docx.py:121-126` is vacuous (`Observed`); dead `Ladder` import at `resolution.py:22` (`Observed`); `at_floor` at `resolution.py:147` (`Observed`). Add acceptance wording. |
| WP-25 | **SPLIT** | "All six migrations" plus indexes plus TRUNCATE plus DELETE semantics. Three unrelated concerns across six files; no acceptance criteria; no mutations named. Split by concern. |
| WP-26 | APPROVE | Correctly sequenced last. Add one acceptance line. |
| WP-27 | **BLOCK — premise refuted** | See §3. Its stated task ("repair the stale mutation `find` strings at `mutation-check.mjs:39-42` and `:56-58`, which break `npm run test:mutation`") is factually wrong today. Its acceptance criterion is also unmeasurable with the current harness (§4). |

---

## 2. File-to-package collision map (built independently)

| File | Packages that write it | Safe? |
|---|---|---|
| `backend/package.json` | WP-27 only *as written* | **NO.** WP-01 (helper), WP-03, WP-10, WP-16 all add suites that `npm test` (`package.json:8`) never runs. Every U-A between here and WP-27 is vacuous. Fix in WP-01 by globbing. |
| `db/test/mutation-check.mjs` | WP-03, WP-05, WP-06, WP-07, WP-16, WP-20, WP-23, WP-25, WP-27 (+WP-08 implied by U-C) | **NO.** WP-05 is declared parallel to WP-03/06. Serialize. Note this file cannot be deferred to WP-27: a mutation whose `find` string no longer matches makes `npm run test:mutation` **exit 1** (`mutation-check.mjs:132-136, 157-161`, `Observed`), so U-A forces in-package edits. |
| `engine/mutation_check.py` | WP-09, WP-12, WP-13, WP-14 (+WP-15) , WP-27 | Sequential in the stated order — OK, but WP-12/13 and WP-14/15 are otherwise independent and would naturally parallelise; this file forbids it. |
| `0001_foundation.sql` | WP-03, WP-04, **WP-25** | Ordered, but WP-25 is an undeclared third writer ("all six migrations"). |
| `0002_clause_registry.sql` | WP-05, **WP-17 (undeclared)**, WP-23, WP-25 | Ordered 05→17→23→25, but WP-17 does not list the file. |
| `0003_ladders_and_concessions.sql` | WP-06, WP-07, WP-23, WP-25 | Safe — strictly sequential 06→07→23→25. |
| `0004_conflict_rules.sql` | WP-05, WP-20, WP-25 | Safe (Stage 2 → 5 → 5, provided WP-20 precedes WP-25). |
| `0005_run_store.sql` | WP-09, **WP-10 (undeclared, via S0-2)**, WP-23, WP-25 | Ordered, but WP-10's target file is unstated. |
| `0006_executed_agreements.sql` | WP-08, **WP-18 (undeclared)**, WP-25 | Ordered, but WP-18's target file is unstated. |
| `0007_audit_chain.sql` | WP-03, WP-04 | Safe. |
| `db/test/ladder.test.mjs` | WP-01, WP-06, WP-07, WP-23 | Safe. |
| `db/test/registry.test.mjs` | WP-01, WP-05 | Safe. |
| `db/test/executed.test.mjs` | WP-01, WP-08 | Safe. |
| `engine/resolution.py` | WP-12, WP-13, WP-24 | Safe — 12→13→24. |
| `engine/docx.py` | WP-14, WP-15, WP-17 | Safe — 14→15→17. |
| `engine/test_docx.py` | WP-14, WP-15, WP-24 | Safe. |
| `engine/run.py` | WP-09, WP-10, WP-11, WP-24 | Safe. |
| `engine/snapshot.py` | WP-09, WP-10 | Safe. |
| `engine/model.py` | WP-11, WP-17 | Safe. |
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | WP-18, **WP-20, WP-21** | **NO.** WP-20 and WP-21 are both Stage 5, listed with "·" (parallel), both rewrite CLA sections. Serialize 18 → 20 → 21. |
| `backend/README.md` | WP-24 (+ RT-3 missed-issue 4 role text, unowned) | At risk. |
| `LIFECYCLE-ARCHITECTURE.md` | WP-22 (+ **WP-08 undeclared**) | Ordered, but unstated. |
| `docs/open-questions.md` | WP-22 | Safe. |

**Migration numbers 0007–0011 are free.** `backend/db/migrations/` holds only `0001`–`0006`
(`Observed`). Every suite discovers migrations with
`readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()`
(`ladder.test.mjs:36`, `registry.test.mjs:43`, `loader-sql.test.mjs:44`, `run-store.test.mjs:36`,
`executed.test.mjs:36`, `mutation-check.mjs:118` — all `Observed`). **Consequence the plan does not
state:** every new migration runs inside *every existing suite* automatically. WP-03's RLS on
`cw.audit_event` and WP-04's narrowed `app_role()` therefore land on all five suites at once, not
just their own. Verified mitigant: `cw.app_role()` gates 34 RLS policies plus exactly **one**
non-RLS gate, `promote_concession` at `0003:190` (`Observed`); the owner bypasses RLS, so WP-04's
"three owner-run promotion tests" blast-radius estimate is correct.

---

## 3. New evidence — WP-27's stated premise is factually wrong

WP-27 says the `find` strings at `mutation-check.mjs:39-42` and `:56-58` are stale and break
`npm run test:mutation` / success criterion S9. I extracted all 15 mutation literals and matched
them against the current migrations: **all 15 match** (`Observed`, script run against
`backend/db/migrations/*.sql`). Specifically `coalesce(prev,'') || '|' || new.ts::text` matches
`0001:79`, and the floor condition matches `0003:151-152`.

The real problem is the mirror image and it is a **sequencing hazard, not a repair job**: WP-03
rewrites `0001:79`, WP-06 rewrites `0003:190`, and WP-07 rewrites `0003:151-152` — each of which
*destroys* a live mutation's `find` string. Because a non-matching string exits 1, the package that
breaks the string must fix it in the same sitting. Retarget WP-27 accordingly: its job is the run-store
extension and the final reconciliation, not repairing pre-existing staleness that does not exist.

---

## 4. Inert-check findings

S0-5 correctly bans N9. Four more are at risk:

1. **WP-03 "drop the INSERT policy → audited write fails" — inert unless a named test does an
   audited write as a real role.** The owner bypasses RLS, and almost all existing audited writes
   run as the owner with only the `cw.role` GUC set (`ladder.test.mjs:41-46`, `registry.test.mjs:51-53`,
   `run-store.test.mjs:44-46`, `executed.test.mjs:45-47` — `Observed`). Make the WP-01 helper's use
   in this specific test an explicit acceptance criterion.
2. **WP-03 "fork rejected" mutation.** `prev_hash` is assigned by the `before insert` trigger
   (`0001:76-77`), so no ordinary insert can forge a fork. The test must state exactly how it forges
   one; as written the mutation may not be reachable. `Inferred`.
3. **WP-06 "restore the public EXECUTE grant → spoof test fails" — probably inert.** The adjudicated
   remedy keeps `security invoker`, so a `cw_legal_reviewer` calling `promote_concession()` is denied
   by the column grant / restrictive policy *before* the EXECUTE grant matters. Same masking pattern
   RT-1's M3 identified for D6. The test must assert the specific error text.
4. **WP-27's acceptance criterion "every mutation demonstrably caught by a *named* test" cannot be
   checked by the current harness.** `mutation-check.mjs:147-150` scores `ok*` — "suite failed, but
   not via the expected test" — as **caught**. Until that branch is made a failure (or at least
   reported and gated), the criterion is unmeasurable. `Observed`.

Additionally, **13 packages have no acceptance criteria at all**: WP-12, WP-13, WP-15, WP-18, WP-19,
WP-20, WP-21, WP-22, WP-23, WP-24, WP-25, WP-26 (and WP-08 has criteria but no mutation). Under
Gate 3 that is a block on each.

---

## 5. WP-16 — the four corrections are not sufficient

- **Correction 3 (`edited_before_approval`) still has a hole.** Giving verification a body
  parameter makes the *approval side* comparable, but nothing in WP-16 makes `cw.clause_draft.text`
  immutable after submission. If the draft body can be edited, the flag is defeated by editing the
  **baseline** rather than the approval — the metric reads "unedited" forever, exactly the failure
  mode correction 3 exists to close. RT-3 raised this as missed-issue 5 and it was **dropped in
  integration**. Add: `clause_draft` body gets the same immutability trigger treatment as
  `clause_version` (`0002:67-92` is the precedent), plus a test and a mutation.
- **Correction 1 (guard inserts) does not break legitimate ticket creation**, provided the guard is
  written as an allow-list on the *initial* state (`state='pending'` only at insert) rather than as a
  transition check. WP-16 does not say which, and its acceptance criteria contain **no positive
  control** — only "an illegal insert-time state is refused". Add "a legitimate `pending` ticket is
  created successfully by `cw_requester`" as an acceptance criterion, or the guard can ship as a
  blanket deny and still pass.
- Corrections 2 and 4 are sufficient as stated.

---

## 6. WP-23 — the fixture ruling is right; the disclosure is incomplete (new evidence)

**Verified correct.** `ladder.test.mjs:105-118` (ladder 4: `data`/`Standard`, rungs `DP-H-014`,
`DP-H-070`, `DP-H-061` — all `data`/`High`) asserts only `rungs`, `unusable_rungs`, `status`,
`selectable` and `state`. `ladder.test.mjs:120-124` (ladder 5: `liab`/`High`, rungs `DP-H-014`,
`DP-H-070` — both `data`) asserts only `status`. **No assertion touches rung severity or category**;
every existing assertion survives the correction. `Observed`. And the new-seed-clauses claim holds:
the seed at `:53-56` has no `Standard` `data` clause and no `High` `liab` clause. `Observed`.

**But two further fixtures break and are not disclosed:**
- `ladder.test.mjs:83-85` — ladder 2 is `liab`/`Standard` and rung 5 is `DP-H-052` (`data`/`High`).
  Under either coherence rule this insert now fails for a **new reason**, and the test asserts
  `throws(..., 'contiguous')` (`:81-86`). It will fail on the matcher, not on the guarantee — "the
  right outcome for the wrong reason", the failure mode `ladder.test.mjs:247-249` already warns about.
  `Observed`.
- `run-store.test.mjs:47` seeds only the `data` category, and `loader-sql.test.mjs:50-55` seeds
  `DF-B-001` as `defs`/`Standard`. If the prefix rule covers the severity letter as well as the
  category short code, `DF-B-001` (B = Baseline) breaks too. WP-23 does not state the rule's scope.
  `Observed` / `Inferred`.

---

## 7. Missing packages

| Gap | Source | Owner today |
|---|---|---|
| `docs/spec-vs-implementation.md` | OC §2 named target; RT-3 missed-issue 1 | **none** — file exists in `docs/`, `Observed` |
| `memory.md` decision records | OC §2 target; CLAUDE.md project rule; OC §5 constraint 9 | **none** |
| root `README.md` | OC §2 target | **none** |
| `docs/decisions/ADR-0008` role text | OC §2 target; RT-3 missed-issue 4 | **none** (WP-21 covers ARCHITECTURE/CLA/glossary only) |
| `result_hash` not pinned to an engine version | RT-2 I5 | **none** — and WP-09, WP-12, WP-13 all change resolution outcomes |
| `clause_draft` body immutability | RT-3 missed-issue 5 | **none** (see §5) |
| `backend/package.json` suite wiring before WP-27 | RT-3 missed-issue 3 | **none** (see §2) |
| Trigger-ordering statement for the execution triggers | RT-1 M6 | **none** (belongs in WP-08) |
| `clause_version.derived_from_concession` | RT-1 M1 | dropped without a ruling |

---

## 8. Sequencing versus the user's goal

Front-loading is broadly right: every S1 (HIGH) finding sits in Stages 2–3. Two problems:

1. **WP-18 and WP-19 are the two largest builds in the plan and sit immediately before the cheap
   document packages** (WP-20, WP-21, WP-22) that discharge success criterion S8. If anything slips,
   the *cheapest* criterion is the one that fails. Move WP-20/21/22 ahead of WP-18/19.
2. **WP-26 is correctly last.** **WP-25 must precede it** (WP-25 edits all six migrations), which the
   stated order already satisfies.

---

## 9. Recommended final execution order

```
S0   (settled)  + NEW WP-00: glob db/test/*.test.mjs in package.json;
                  make mutation-check.mjs `ok*` a hard failure
S1   WP-01  ∥  WP-02                                   (disjoint files)
S2   WP-03a → WP-03b → WP-03c → WP-05 → WP-06 → WP-04 → WP-07 → WP-08
       (WP-05 serialized: mutation-check.mjs. WP-04 AFTER WP-06: its own dependency.)
S3   WP-09 → WP-10 → WP-11 → WP-12 → WP-13 → WP-14 → WP-15
       (fully serial only because all five write engine/mutation_check.py; if that
        file is split per-area, {09,10,11} ∥ {12,13} ∥ {14,15})
S4a  WP-20 → WP-21 → WP-22          (cheap, discharges S8 before the big builds)
S4b  WP-16a → WP-16b → WP-16c → WP-17 → WP-18a → WP-18b → WP-18c → WP-18d → WP-19
S5   WP-23 → WP-24 → WP-25a → WP-25b → WP-25c → WP-26 → WP-27
       (WP-23 before WP-25: both touch 0002/0003/0005. WP-26 after every schema package.)
```

## Gate 3 status

**FAIL.** Blocking: WP-04 (order contradicts dependency; `U3` unresolved in-package), WP-05
(scheduled concurrent with WP-03/06 on `mutation-check.mjs`), WP-18 (no acceptance criteria; four
packages in one), WP-27 (premise refuted; acceptance unmeasurable), plus the 13 packages with no
acceptance criteria and the `package.json` wiring gap that makes U-A vacuous for most of the plan.
