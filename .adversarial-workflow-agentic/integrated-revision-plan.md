# Integrated Revision Plan — Clausewerk Phases 0–3

- **contract:** OC-CW-2026-07-25-01
- **inputs:** `revision-plans/plan-A-database.md`, `plan-B-engine.md`, `plan-C-phase3-docs.md`;
  `red-team-reviews/rt-1-database.md`, `rt-2-engine.md`, `rt-3-phase3-cross.md`
- **method:** evidence adjudication. Where a red-team reviewer produced its own reproduction, that
  outranks a planner's assertion. Where a reviewer objected without evidence, the planner stands.

---

## 1. Adjudications — what changed and why

Sixteen contested points. Each resolution names the winning evidence.

| # | Contested | Ruling | Winning evidence |
|---|---|---|---|
| 1 | Is `audit_verify()` broken on an honest database? | **Yes — HIGH, and it is the worst finding in the set.** The hash covers `new.ts::text`, so a session whose `TimeZone` or `DateStyle` differs from the writer's reports tampering. | RT-1 reproduced three ways independently of Plan A (clean at `Etc/GMT+6`, tampered at UTC / New_York / Kolkata; `DateStyle` SQL/Postgres/German all tamper). Two independent reproductions. `Observed`. |
| 2 | Is "add the UPDATE policy" vs "`security definer`" a real dilemma? | **No — false dichotomy. Take the third option:** `grant update (promoted_to_clause)` plus a restrictive UPDATE policy, keeping `security invoker`. | RT-1 *built and ran it*: promote succeeds as real `cw_legal_admin`, double-promote raises, `vendor_text`/`approved_by` rewrites are denied. Plan A's definer branch was additionally shown spoofable — a `cw_legal_reviewer` setting `cw.role='legal_admin'` promoted vendor text. Demonstration beats argument. `Observed`. |
| 3 | Does the fork-guard unique index cause false positives? | **No.** Adopt it. | RT-1 tested fork, second genesis, legit append, truncate-reseed, same-instant duplicates. `Observed`. |
| 4 | Is the `audit_event` RLS hole real, and is Plan A's remedy adequate? | **Hole real; remedy inadequate.** Enabling RLS with a SELECT-only policy breaks *every audited write*, and `audit_verify()` under RLS returns tampering for scoped roles. Remedy must add an INSERT policy and make `audit_verify()` `security definer`. | RT-1 reproduced both breakages. `Observed`. |
| 5 | Does the floor fail open when no ladder exists? | **Yes.** Verified: rung 99 with no override was accepted. The fix must fail loudly. | RT-1 direct test. `Observed`. |
| 6 | Is correcting the ladder fixtures "weakening the suite"? | **No — legitimate.** Neither test asserts rung severity or category; every existing assertion survives. But it needs *new seed clauses*, not ID swaps (no Standard `data` clause and no High `liab` clause exist). | RT-1 read the assertions. `Observed`. Ruling recorded because the objective contract forbids test weakening. |
| 7 | E1: store ladder status, and does it need a new `cw.snapshot_ladder` table? | **Store it and keep it in the hash — but the new table is refuted.** Status is a pure function of rows already stored (`is_floor` plus per-member frozen `selectable`); RT-2 derived it correctly from real emitted rows. | RT-2 derivation. `Observed`. **This deletes a table and the cross-plan dependency X1 that RT-3 built a whole package around.** |
| 8 | E2: nine seam mismatches? | **One.** `category`/`category_key` is the only real name mismatch. M7 refuted outright (`0002:26` already allows `'Baseline'`); five others are non-defects by Plan B's own wording. | RT-2 mechanical column-by-column audit. `Observed`. Plan B also wrongly claimed no write-side suite exists — one does, and its hand-written INSERTs used `category_key`, which is *why* the mismatch hid. |
| 9 | E6: is billion-laughs actually a live threat? | **Premise refuted.** expat 2.5.0 already blocks classic billion-laughs (0.26s) and quadratic blowup; the current parser raises `NotADocx` on the bomb today. **Mutation N9 must not be added — it cannot fail.** But the zip bomb is real (102 KB → 344 MB) and unbounded nesting is real (33.6 MB → 18.7 s, 1.3 GB peak, under the proposed cap). | RT-2 ran the actual fixtures. `Observed`. Remedy re-aimed: size caps and a nesting/size guard, not DOCTYPE theatre. |
| 10 | E5: is the zero-authored-characters claim at risk? | **No.** `paragraphs()` uses `p.iter()` and recurses; `authored_characters` only ever runs on `build_docx` output. S10 is safe. | RT-2 confirmed Plan B. `Observed`. The most reassuring finding in the review. |
| 11 | E3: does newest-wins break reproduction? | **No — zero tests break**; no fixture has two versions of one clause id. Adopt newest-selectable-wins. **E3(b) (resolution consults ladders for a preferred rung) is scope creep and is split out and deferred** — it has product-boundary implications. | RT-2 traced it. `Observed`. |
| 12 | Is the rule grammar specified? | **Split ruling.** The primitives, examples and tag namespacing exist in `0004:38-79` and `README:177-196` — so "specified nowhere" is refuted. But the namespace definition, empty-array legality (`0004:62` permits `all_present: []`, which fires vacuously) and case sensitivity are genuinely missing. So the grammar package is **not documents-only**: it needs a CHECK, a test and a mutation. | RT-3 read both artefacts. `Observed`. |
| 13 | Is e-signature byte capture already modelled? | **Bytes yes, signatories no.** `0006:56-66` really does hash counterparts and exhibits. But `0006:44` `signature_evidence text` holds no certificate bytes, and signatories are two text columns. | RT-3. `Observed`. Scope shrinks but does not vanish. |
| 14 | Renewal baseline | **Owner decision, not settled here.** RT-3 refuted the planner's "violates ADR-0009" argument (ADR-0009 forbids *library* drift; a same-agreement renewal baseline is deal-scoped) and called the drift-inversion claim a strawman. The real difference between the two options is only which button is pre-selected. **Objective-contract assumption A4 is NOT discharged.** | RT-3 read ADR-0009. `Observed`. Implement the proposal's recommendation as the default, make the alternative an explicit recorded choice, and put the decision in front of the owner. |
| 15 | Review-queue state machine | **Refuted four ways; the design must change.** (a) a `before update` trigger alone lets a requester INSERT `state='rejected'` directly — S6 defeated on day one, so an insert-time guard is required; (b) the "mandatory" note CHECK never catches `''`; (c) **`edited_before_approval` is structurally always `false`** — `proposed_text` is immutable and the verify function takes no body parameter, so a reviewer's edit has nowhere to land, and ADR-0010's binding control would report a perfect score forever; (d) `do instead nothing` on delete is the exact pattern finding D9 condemns, which Plan A is removing elsewhere while Plan C adds four more. | RT-3, all four with citations. `Observed`. |
| 16 | `origin` in the snapshot fingerprint | **Cut it.** `snapshot.py:62-73` states the fingerprint covers what determines the *outcome* and nothing else — it excludes `state` for exactly this reason. Origin is immutable on a pinned `(clause_id, version)`, so it cannot change an outcome. Cutting it removes a global rehash and a hard cross-plan collision. | RT-3. `Observed`. Plan C's reproducibility argument was false. |

**Unresolved and escalated to the owner** (implemented with a stated default, reversible):
`U1` renewal baseline (adjudication 14); `U2` whether a SOW may contradict its master;
`U3` the `cw_owner` role mapping for `app_role()`; `U4` the unedited-approval-rate threshold
(Legal owns it — the system measures, never sets it).

## 2. Rejected claims

Recorded so they are not re-litigated: Plan A's `security definer` remedy for D1 (spoofable —
adjudication 2); Plan A's claim that the review's D1 root cause was right (RT-1 showed all suites
*do* use `set role`, but only on reads — success criterion **S3 is tightened to name writes**);
Plan B's nine mismatches (one, adjudication 8); Plan B's `cw.snapshot_ladder` table (7); Plan B's
mutation N9 (9 — inert); Plan B's degraded-ladder fixture as specified (encodes a state
`ladder_health` cannot emit); Plan C's `origin` in the fingerprint (16); Plan C's
"rule grammar specified nowhere" (12); Plan C's ADR-0009 renewal argument (14).

## 3. Scope ruling

RT-3 assesses Phase 3 at 2–2.5× Phases 0–2 combined and judges the full scope undeliverable at the
objective contract's quality bar. **Scope is not narrowed** — the user asked for Phases 0–3 and
reducing scope is the user's call, not the orchestrator's. The plan proceeds in full, in strict
dependency order, and the final report states exactly what completed, what did not, and why.
Three adjudications (7, 8, 16) removed a table, seven phantom mismatches and a global rehash, so
the real scope is smaller than any planner estimated.

## 4. Migration numbering (central allocation — resolves the double-claim on `0007`)

`0007` audit chain · `0008` review queue · `0009` clause origin · `0010` required approvers,
legal hold, signature evidence, MSA/SOW · `0011` negotiation record.

## 5. Global package sequence

Ordering constraints: `mutation-check.mjs` is a lock with many writers — it is touched last within
each stage. Files edited by two packages never run concurrently.

**Stage 0 — settle**: numbering above; `run_decision.category` → **`category_key` + FK** (the
schema's dominant convention, breaking the A↔B deadlock); `do instead nothing` is banned in new
work and removed from old; `origin` stays out of the fingerprint.

**Stage 1 — enablers**: `WP-01` role-real write harness (S3, tightened) ∥ `WP-02` ADR hygiene.

**Stage 2 — database enforcement**: `WP-03` audit chain rebuilt (pre-image, fork guard, anchored
tail, RLS + INSERT policy, `audit_verify` as definer) → `WP-04` identity narrowed to the connection
role; `WP-05` immutability holes; `WP-06` promotion under real permissions (D1+D6 as one item) →
`WP-07` floor made absolute → `WP-08` agreement status machine.

**Stage 3 — engine and seam**: `WP-09` ladder status stored and rebuilt → `WP-10` write-side seam
test → `WP-11` manifest boundary; `WP-12` newest-version-wins → `WP-13` lapsed baseline gates;
`WP-14` hostile uploads (caps, not DOCTYPE theatre) → `WP-15` Word containers and tracked moves.

**Stage 4 — Phase 3 builds**: `WP-16` review queue (redesigned per adjudication 15) → `WP-17`
clause origin and the second count → `WP-18` required approvers, legal hold, signature evidence,
MSA/SOW → `WP-19` negotiation record.

**Stage 5 — documents and sweep**: `WP-20` rule grammar (with the CHECK) · `WP-21` five roles and
CLA §3/§7 · `WP-22` lifecycle spec repairs · `WP-23` coherence constraints · `WP-24` engine smalls
· `WP-25` indexes, TRUNCATE, loud DELETE · `WP-26` data-model refresh · `WP-27` mutation harness
consolidation and full verify.

## 6. Gate 2 status

**PASS.** Every conflict between the three plans is adjudicated against evidence, not averaged.
Assumptions remain labelled; A4 is explicitly *not* discharged and is escalated as `U1`. Package
boundaries are implementable and their file collisions are sequenced. No `Assumed` claim was
promoted to `Observed`.
