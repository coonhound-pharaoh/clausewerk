# RT-3 — Focused red-team review: Plan C (Phase 3 / documents) + cross-plan collision analysis

- **assignment_id:** RT-3 · **stage:** Focused Red-Team Review (comparative)
- **primary target:** `.adversarial-workflow-agentic/revision-plans/plan-C-phase3-docs.md`
- **also assigned:** `plan-A-database.md`, `plan-B-engine.md` (part 7 only)
- **date:** 2026-07-25
- **evidence tags:** `Observed` · `Inferred` · `Assumed` · `Unresolved`
- **default posture:** refuted unless verified

---

## 1. Claim: "Two review claims are stale — ADR-0010 and `NEGOTIATION-ARCHITECTURE.md` are committed (`dd0b396`) and the ADR index already lists 0010"

**Verdict: UPHELD on "committed". UPHELD on "index lists 0010". PARTLY REFUTED on the implied conclusion that nothing remains.**

**Evidence.**

- `git log --oneline -1 -- docs/decisions/ADR-0010-ai-drafted-clause-candidates.md NEGOTIATION-ARCHITECTURE.md` → `dd0b396 Architect end-to-end negotiation, supplier paper, and the Clause Library Builder`. Both files are in `HEAD`. `Observed`.
- `git show HEAD:docs/decisions/README.md` contains the row `| [0010](ADR-0010-ai-drafted-clause-candidates.md) | AI may draft candidate clauses; only a human publishes them | ...` — committed, not a working-tree addition. `Observed`.
- The false status sentence is also in `HEAD`: "Status is `Accepted` throughout because the prototype implements them." `Observed`.

**The distinction the packet asked me to test — "committed" vs "current content is complete and correct" — is real and the planner handled it, but under-weighted it.** `git diff --stat` shows `NEGOTIATION-ARCHITECTURE.md | 18 +++--` and `ADR-0010… | 7 ++` as *uncommitted* working-tree edits. So:

- The **review's** claim ("uncommitted") is stale as to the files' existence. Plan C is right.
- But the **owner-decision content** inside both files is uncommitted. Objective contract §8 makes committing approval-sensitive. `Observed`.
- Consequence: **every downstream package that "rebases on the working tree"** (WP-C2 explicitly does) inherits uncommitted state. If any package is executed in a fresh worktree or an agent checkout, it will silently revert owner-decision text. This is not a planning error; it is an **orchestration hazard that must be written into the merged sequence**: pin all packages to the dirty working tree, or get the owner's commit approval before Phase 3 starts.

**Consequence:** Plan C correctly removes ~2 items of phantom work. Phase 0 residue is genuinely three edits (R1, R2, R3), not five. **No blocking objection.**

---

## 2a. Claim: "The rule grammar IS fully specified — in `0004_conflict_rules.sql` and `backend/README.md`, not in the CLA"

**Verdict: REFUTED as stated ("fully specified"). UPHELD in the weaker form the repair actually needs ("substantially specified, in the wrong artefact").**

**Evidence.** `backend/db/migrations/0004_conflict_rules.sql:38-40` names the three primitives in a comment; `:60-74` is a CHECK constraint enforcing key-set closure and per-key JSON *types*; `:76-79` is a `comment on column` stating the "three primitives, ANDed" boundary. `backend/README.md:177-196` gives a primitive table, worked examples (`conflicting_values: jurisdiction`; `all_present` + `none_present` for regulated-data-without-cyber-cover), the "no rule ever parses prose" rule, the tag-namespace convention (`jurisdiction:ny`, `indemnity:uncapped`), and the two-layer enforcement note. `Observed`.

**Why "fully specified" is still wrong, and I am ruling against the planner here.**

1. **The SQL constrains shape, not semantics.** The CHECK proves `conflicting_values` is a *string*. Nothing anywhere states the evaluation rule — what "more than one distinct value within a namespace" means when a tag has no colon, whether matching is case-sensitive, whether an empty `all_present: []` array is legal (the CHECK permits it; it would vacuously fire on every contract, the exact failure the "at least one primitive" clause was written to prevent). `Observed` — `0004:62-63` requires `predicate ?| array[...]` (a *key* must be present) but never requires the arrays be non-empty.
2. **The tag-namespace convention is stated as prose examples in a README, not as a grammar.** There is no statement of what a namespace *is* (text before the first `:`?), which is the load-bearing definition for `conflicting_values`.
3. **A specification the architecture cites must exist in the architecture.** `NEGOTIATION-ARCHITECTURE.md:182` cites "§4 of the CLA"; `CLAUSE-LIBRARY-ARCHITECTURE.md:102` heads §4 as *Concessions*. `Observed`. The planner is letting the implementation stand in for the spec — precisely the substitution this repository's own review culture rejects elsewhere.

**Ruling.** The planner is **right that this is not a from-scratch specification job** and right that R4's "lift the existing text" approach is the correct shape. The planner is **wrong that the repair is purely a citation move**. R4 must additionally settle three open semantics (namespace definition, empty-array legality, case sensitivity) and — because two of those are enforceable — add CHECK clauses and a mutation entry. **Scope of R4 is understated by roughly one CHECK constraint and one test.** Non-blocking, but it must not be planned as a documents-only package: WP-C2 is currently tagged `D` (documents only, no test surface). **That tag is wrong.**

---

## 2b. Claim: "E-signature byte capture IS already modelled in `0006` (counterparts and exhibits, with bytes and hashes)"

**Verdict: UPHELD on the byte set. REFUTED on the inference that the remaining work is "mostly a doc repair".**

**Evidence.** `0006_executed_agreements.sql:56-66`: `cw.executed_document` has `kind check in ('agreement','amendment','exhibit','counterpart')`, `byte_size bigint check (byte_size > 0)`, `sha256 text check (sha256 ~ '^[0-9a-f]{64}$')`, `storage_uri`, `signed_on`, plus a unique index on `(agreement_id, sha256)`. `Observed`. So counterparts and exhibits are first-class hashed byte rows. The planner is correct and the review's "one field" framing is wrong about the schema.

**What the planner glosses.** `0006:44` is `signature_evidence text, -- e-signature envelope reference` — a nullable free-text column on `cw.executed_agreement`, with no CHECK, no provider, no completion timestamp, and **no bytes or hash for the completion certificate itself**. The completion certificate is the artefact that proves *who signed and how*; the counterpart rows prove only *what was signed*. Those are different evidentiary claims. `Observed`.

Additionally: `cw.executed_agreement` has `our_signatory` / `their_signatory` as two plain text columns (`0006:42-43`) — no per-signatory rows, no `method` (electronic vs wet ink), no per-signatory `signed_on`. Plan C's R9 proposes exactly these, so the *design* is right; the **cost framing is wrong**. Two new tables (`cw.signature_evidence`, `cw.signatory`) against a table family that is explicitly frozen — `0006:49-51`: "There is no UPDATE path and no DELETE path — not for any role, including legal_admin" — plus the `_no_delete` rule loop at `0006:91`, plus RLS, grants, a test suite and mutation entries. That is a schema package, not a documentation footnote.

**Ruling.** The planner's two "overstated" findings behave differently under scrutiny: 2a genuinely shrinks the work (correctly), 2b **does not shrink it as much as claimed**. Both are folded into WP-C8, which is already the largest schema package and already carries three hard collisions. **Non-blocking concern: R9 should be split out of WP-C8, not folded in.**

---

## 3. Claim: "Renewal should open from the current library with carried concessions shown alongside; the proposal's recommendation inverts the drift control and violates ADR-0009"

**Verdict: the planner's *recommendation* is defensible. The planner's *argument for it* contains one refuted claim (the ADR-0009 violation) and one strawman. The owner is not currently being given an honest choice.**

### The proposal's side, argued as strongly as I can

1. **The library-restart default is a fiction about how renewals happen.** A renewal is a continuation of a *live commercial relationship* under an instrument both parties have been performing against for years. The counterparty's negotiator opens their copy of the executed agreement. Handing them a document that silently reverts every point they won reads as bad faith and costs rounds — and each round is a real cost the system does not currently measure.
2. **It does not contradict ADR-0009, and I checked.** ADR-0009's decision text is: concession is *deal-scoped and changes nothing about the library*; promotion is a *separate library act*; supersession is *replacement*. The thing it forbids is "one negotiation's compromise silently becomes **every future deal's** starting position — the library drifts toward whatever vendors pushed hardest on" (`ADR-0009`, Context). **Carrying a concession into the renewal of the same agreement with the same counterparty is not library drift.** It affects one deal, not every deal. `Observed`. ADR-0009 *does* say "Renewal re-resolves against the current library" — but that sentence sits under the heading **"Renewal surfaces superseded language"**, describing the drift report's mechanism, not stating a prohibition. **Plan C §8's claim that the proposal's default is "the precise thing ADR-0009 exists to forbid" is REFUTED.** ADR-0009 would need *amending*, not *violating*.
3. **The drift-control inversion argument is a strawman as written.** Plan C §8 says opening from executed positions "makes stale language the *default* and current language the exception — inverting the control." But the proposal explicitly keeps the drift report alongside (`IMPROVEMENT-PROPOSAL-2026-07-25.md:119-121`). The control is *the report*, not *the default*. A blocking drift report over an executed-positions baseline is a **stronger** control than an advisory report over a library baseline, because it forces an explicit act on every stale clause rather than silently resolving them away. `Inferred`.
4. **The symmetry argument.** Plan C's option (B) makes *carrying* an act. Option (A) makes *reverting* an act. Both produce a recorded decision per concession; they differ only in which way the null action points. Plan C's own §8 admits the two are "buildable at similar cost". So the choice is genuinely about commercial posture, and Plan C's framing — "the case against it is stronger, on this system's own terms" — puts a thumb on the scale using an ADR citation that does not hold.

### Ruling

- **On the mechanism: the planner and the proposal converge.** Both compute both baselines, both show the carried-concession list, both make the non-default an explicit recorded act. The buildable delta between (A) and (B) is *which button is pre-selected*. That should be said to the owner in one sentence, and Plan C buries it under six paragraphs of argument.
- **On the argument: two of the planner's three supports fail.** The ADR-0009 violation claim is refuted (see 2 above). The drift-inversion claim is a strawman of the proposal as written (see 3). What survives is the CLA §2 quote (`CLAUSE-LIBRARY-ARCHITECTURE.md:53-56`, "It changes nothing for the next deal") — a real textual tension, and a fair point, though "the next deal" plainly means *a different deal*, not *the same agreement renewed*.
- **On the recommendation itself: I do not overturn it.** (B) is a reasonable default for a buyer-side system whose whole thesis is drift resistance. I object to *how it is being sold*, not to *what it is*.

**Consequence — this is a BLOCKING objection to §8 as written.** §8 must be rewritten as a neutral two-option decision card: what each default does, what each costs in negotiation rounds vs drift exposure, and one line stating that the ADR-0009 concern applies to *library* promotion and not to a same-agreement renewal baseline. Objective contract A4 says the proposal's recommendations stand unless *red-team evidence* contradicts them. Plan C's contradicting evidence is one-third valid. **A4 is not discharged.**

---

## 4. Claim: "The Review-queue state machine is enforced twice — CHECK for shape, `before update` trigger for transition legality, `do instead nothing` on delete"

**Verdict: REFUTED in three independent, concrete ways. This is the strongest finding in this review.**

### 4a. The state machine has an open front door — INSERT is ungoverned

The trigger at Plan C §2.2 is `before update` only. Nothing in the proposed design constrains the state a row is *inserted* with. Walk the constraints as written (Plan C:102-114):

- `rejection_needs_note` — satisfied by `decision_note = ''`.
- `terminal_needs_decider` — satisfied by writing any string into `decided_by`.
- `pending_has_no_decision` — vacuous when `state <> 'pending'`.
- `verified_names_its_clause` — only bites on `'verified'`.

So a `cw_requester` (Plan C §2.3 grants requester INSERT) can insert a row directly as `state='rejected'`, `decision_note=''`, `decided_by='me'`. The transition trigger never fires, the audit hook emits `review_ticket_opened` rather than `review_ticket_rejected`, and the mandatory-rejection-note guarantee — success criterion **S6** — is defeated on its first day. `Inferred` from the plan's own constraint list; no code exists yet to observe.

**Fix:** the trigger must be `before insert or update`, with the insert branch requiring `state = 'pending'`; or add `constraint opens_pending` enforced by a separate `before insert` trigger. Either way the plan's "enforced twice" claim is currently "enforced once, on the wrong verb".

### 4b. The mandatory rejection note is not enforceable by CHECK, and the planner knows it but ships it anyway

Plan C:116-119 asserts `rejection_needs_note` "is the answer to 'how is the mandatory rejection note enforced at the database rather than in practice' — it is a CHECK, not a convention." Plan C:197-199 then admits "the CHECK catches `''` never". **Both sentences are in the same document.** The first is the one that will be quoted into the final report; it is false. `Observed` (`plan-C-phase3-docs.md:116-119` vs `:197-199`).

The CHECK is trivially fixable — `check (state <> 'rejected' or coalesce(btrim(decision_note),'') <> '')` — and once fixed, the trigger's duplicate is genuinely belt-and-braces rather than load-bearing. **The plan should ship the strengthened CHECK, not the weak one plus a compensating trigger**, because the trigger does not fire on INSERT (4a) and the CHECK does.

### 4c. `edited_before_approval` is NOT derivable from stored bytes — as designed it is structurally pinned to `false`

This is the most serious defect. ADR-0010 names the unedited-approval rate as the binding control; `NEGOTIATION-ARCHITECTURE.md:191-193` says "Approving **unedited** is recorded distinctly from approving an edited draft. The unedited-approval rate is the metric that reveals whether review has quietly stopped happening." `Observed`.

Plan C §2.4 computes it as `(ticket.proposed_text is distinct from draft.text)`. Trace the bytes through Plan C's own design:

1. `cw.clause_draft.text` is written at draft creation.
2. Submitting copies that text into `review_ticket.proposed_text`. They are equal by construction.
3. `review_ticket.proposed_text` is **immutable** — the transition trigger raises on any change (`plan-C:181-188`).
4. `cw.verify_review_ticket(p_ticket_id, p_new_clause_id, p_title, p_rationale, p_reviewer, p_expires_on, p_origin)` — **there is no body parameter** (`plan-C:212-216`). The minted body can only come from the immutable `proposed_text`.

**There is nowhere for a reviewer's edit to land.** The comparison at step (4) is between two values that were made equal at step (2) and frozen thereafter. `edited_before_approval` is always `false`. The metric ADR-0010 calls "the binding control" reports 100% unedited approval regardless of what reviewers actually do — the worst possible failure mode, since that number is *also* the alarm value.

The plan is internally inconsistent about this: §3 introduces `cw.mint_clause_version(..., p_body, ...)` with a body parameter, while §2.3's `verify_review_ticket` has none and no way to supply one. `Observed` (`plan-C:212-216` vs `:284-285`).

**Fix (design, not wording):** the ticket needs a second, mutable-until-decision `approved_text` column (or an append-only `review_ticket_revision` log, which fits the schema's stated principle better). `edited_before_approval := (approved_text is distinct from draft.text)`. Then it *is* derived from stored bytes and the claim becomes true.

### 4d. `do instead nothing` on delete — the D9 contradiction is real

The packet's suspicion is correct. Plan A confirms D9 by reproduction: "`delete from cw.clause_version where clause_id='DP-H-014'` returned `affectedRows=0`, row count unchanged, no error. The `do instead nothing` rule at `0002:91-92` makes an application bug indistinguishable from success" (`plan-A-database.md:68`). Plan A's **A9 replaces those rules with a loud raise** across `0001`–`0006` and notes it "invalidates two existing mutation entries' `find` strings" (`plan-A-database.md:720`). `Observed`.

Plan C §2.2 adopts `create rule review_ticket_no_delete as on delete to cw.review_ticket do instead nothing;` explicitly "matching `0002:91-92` and `0005:150`" — i.e. **matching the exact pattern the other plan is removing, and citing the removed lines as precedent.** `Observed`.

**Consequence:** if both plans execute as written, A9 either misses `0007`–`0010` (leaving the silent-delete class of bug alive in exactly the new tables, and inconsistent with the rest of the schema) or A9's author must retrofit four migrations they did not write. **Blocking cross-plan contradiction — resolution in §7.**

### Summary of claim 4

| Sub-claim | Verdict |
|---|---|
| Enforced twice (CHECK + trigger) | **Refuted** — enforced on UPDATE only; INSERT is ungoverned |
| Mandatory rejection note enforceable by CHECK | **Refuted** — satisfiable by `''`; the plan says so 80 lines later |
| `edited_before_approval` derivable from stored bytes | **Refuted** — structurally always `false` as designed |
| `do instead nothing` hides application bugs (D9) | **Upheld** — and it directly contradicts Plan A's A9 |

---

## 5. Claim: "Store suppressed candidates as references, not copies"

**Verdict: UPHELD. The planner is right, and ADR-0004 endorses it explicitly.**

**Evidence.**

- ADR-0004 itself names the mitigation: "storing clause IDs rather than clause copies is the obvious mitigation and is not currently specified." `Observed`. So this is not a departure from ADR-0004 — it is ADR-0004's own recommendation being implemented.
- **Immutability is sufficient for the reference to reconstruct the audit trail.** `cw.clause_version` is keyed `(clause_id, version)` (`0002:54`). The immutability trigger guards `clause_id, version, body, title, rationale, citations, approved_on, expires_on, provenance` (`0002:67-78`) — **the entire text and every field that determines what the candidate was**. `create rule clause_version_no_delete as on delete to cw.clause_version do instead nothing` (`0002:91-92`). `Observed`.
- **Retirement and supersession do not break the reference.** Retiring sets `retired`/`retired_reason`/`retired_on`; the row persists and the body is unchanged. A superseded version is retained "permanently, so an agreement executed under `@v1` still resolves `@v1`" (ADR-0009). `Observed`. So a reference to `(clause_id, version)` still answers "why isn't the stricter one here?" years later — which is the exact question ADR-0004 exists to answer.

**Three caveats that must be written into WP-C5, not assumed.**

1. **The reference must be to `(clause_id, version)`, never to a `current`/`selectable` view.** Plan C §2.1 gets this right (`clause_id`, `version` FK to `cw.clause_version`). Keep it.
2. **Auditor read access to retired/superseded versions must be verified under RLS.** If `cw.clause_version_state`'s policies scope reads to selectable rows for any role that must reconstruct an audit, the reference resolves to nothing for that role. `Unresolved` — not checked by Plan C.
3. **TRUNCATE is the one hole.** Plan A observed `truncate cw.clause_tag` succeeds as owner (`plan-A:67`), and no `cw_*` role holds TRUNCATE. So the residual risk is owner-discipline only, and A9's `BEFORE TRUNCATE` guard closes it. **Reference safety depends on A9 landing.** `Observed`.

Plan C's `cw.review_candidate` omits ADR-0004's per-decision `reason` string (one of four fixed forms). Minor — the reason lives on the decision, not the candidate — but the run-store `run_decision.reason` already carries it (`0005:103`), so no gap. **No objection.**

---

## 6. Claim: "Phase 3 is 1.5–2× Phases 0–2 combined; minimum coherent subset is C1, C2, C3, C5, C6"

**Verdict: the ratio is UPHELD and probably understated. The minimum subset is UPHELD with one substitution. The full scope is NOT deliverable at the objective contract's quality bar.**

### The ratio

Plan C's surface count (§11) is honest and matches what I can verify: four new migrations (0007–0010), ~4 new test suites, 4 new subsystems, a full `docs/data-model.md` rebuild with ~28 record shapes to add (`docs/data-model.md` currently covers 9). `Observed`.

**It is understated for three reasons Plan C does not count:**

1. **The quality bar multiplies schema work.** OC §5 constraints 5 and 6 require, per guarantee-shaped fix, a test that *would have caught the original fault* **and** a mutation entry proving that test can fail. Phase 3 builds things with no original fault — so every protection needs an invented mutation. Plan C names mutation entries only for WP-C6 (§4.1). WP-C5 alone needs roughly one per constraint: 5 CHECKs, 4 trigger branches, the insert guard, the update policy, the delete rule, the `not_self_approved` rule. **That is ~12 mutation entries in one package**, each needing a distinct failing test. Not counted.
2. **S3 applies to every new table.** Every write path in four new migrations must be exercised as the real role. Plan A's A1 (shared `asRole()` helper) is the enabler and is in a *different plan*. Phase 3 cannot start its tests until A1 lands.
3. **`docs/data-model.md` is a *derived* document.** WP-C10 documents ~28 shapes that four other packages are still moving. It cannot be written once; it will be written and re-written.

**Honest re-estimate: 2–2.5×, not 1.5–2×.** `Inferred`.

### Is the full scope deliverable at the bar?

**No.** Say it plainly. The binding constraint is not effort — it is that **three Phase 3 packages cannot even be written until Phase 1 packages land** (C7 needs A3; C8 needs A3+A4; all Phase 3 tests need A1), and **two Phase 3 packages carry unanswered owner decisions** (MSA/SOW precedence in C8; renewal baseline in C4). A plan whose critical path runs through another plan's critical path *and* through two decisions the owner has not made is not a plan that completes; it is a plan that stalls twice.

### The minimum subset

Plan C proposes **keep C1, C2, C3, C5, C6**. I agree with four of five and substitute one.

- **C1, C2, C3 — keep.** Cheap, no test surface (except R4's CHECK, see §2a), and they remove a live contradiction at the centre of the scaling claim.
- **C5 — keep, but only after the four defects in §4 are fixed.** As drafted, C5 ships a state machine with an open INSERT, a rejection note satisfiable by `''`, a metric pinned to `false`, and a delete rule the other plan is deleting. **Shipping C5 as written would create four new guarantee-shaped claims that are false — the exact fault class this whole workflow exists to remove.** C5 is in the minimum set *conditionally*.
- **C6 — I recommend SPLITTING it and keeping only half.** See §7 on the fingerprint. `origin` on the schema + engine model + `ai_origin_characters` is cheap and must land before the first AI-drafted clause. Adding `origin` to the **snapshot fingerprint** is a separate, contested, expensive change and should be **cut**.
- **Substitute in: R9's signature-evidence half is NOT in the minimum set** (correct, Plan C defers it) — but **A9's TRUNCATE/loud-DELETE decision must be settled before C5 writes its delete rule.** That is a sequencing item, not a package.

**On C8 (Required Approvers).** Plan C calls deferring it "the most uncomfortable deferral, because the owner asked for it explicitly." That is right, and it is the honest thing in the plan. My addition: **C3 without C8 is worse than neither.** C3 rewrites the CLA to say concessions require three-party approval; C8 is what makes that true. Shipping the document edit without the enforcement means the CLA newly promises something the schema does not do — creating a *fresh* spec-vs-implementation gap of exactly the kind this whole exercise is closing. **If C8 is deferred, C3's CLA edit must be written in the future tense with an explicit "not yet enforced" marker**, or it is a new lie. Plan C does not say this. **Blocking.**

---

## 7. CROSS-PLAN COLLISION ANALYSIS

### 7.1 File-touch matrix

Legend: **A**n = Plan A package · **B**n = Plan B package · **C**n = Plan C package.

| File / object | Plan A | Plan B | Plan C | Collision |
|---|---|---|---|---|
| `0001_foundation.sql` | A2 (audit chain), A6 (`app_role`), A9 | — | — | A-internal only |
| `0002_clause_registry.sql` | A5 (D4 immutability), A8, A9 | — | **C6** (`origin` in `clause_version_immutable()`, `clause_version_state`) | **HARD — A5 ↔ C6, same function** |
| `0003_ladders_and_concessions.sql` | A3 (D1+D6), A4 (D5), A7 (D7), A8, A9 | — | **C7** (`promote_concession()` refactor), **C8** (`cw.concession` state) | **HARD — A3 ↔ C7 (same function); A3/A4 ↔ C8 (same table)** |
| `0004_conflict_rules.sql` | A5, A9 | — | C2 (grammar CHECK, per §2a) | **MEDIUM — new** |
| `0005_run_store.sql` | A8 (D8 CHECKs incl. `run_decision.category`), A9 | B WP-2/WP-7 (needs new tables) | C6 (`cw.run` gains two counters) | **HARD — three-way** |
| `0006_executed_agreements.sql` | A7, A9 | — | C8 (signature evidence, R9) | **MEDIUM** |
| **`0007_*.sql`** | **A2 = `0007_audit_chain.sql`** | — | **C5 = `0007_review_queue.sql`** | **HARD — MIGRATION NUMBER COLLISION. Neither plan knows.** |
| `0008`–`0010` | — | — | C6, C8, C9 | Renumber (see 7.3) |
| `cw.snapshot_ladder` (new) | — | **B WP-1 needs it; explicitly not owned** | — | **GAP — unowned table** |
| `cw.run_manifest_dropped` (new) | — | **B WP-7 needs it; explicitly not owned** | — | **GAP — unowned table** |
| `mutation-check.mjs` | A2, A3, A4, A5, A6, A7, A8, A9 | — | C5, C6, C8, C9 | **SOFT — everyone; serialise** |
| `engine/mutation_check.py` | — | B WP-9 | — | none |
| `backend/package.json` | **A1** | **B WP-2** | (C5 test wiring, implied) | **MEDIUM — three writers** |
| `engine/run.py` | — | B WP-1, WP-2, WP-7, WP-8 | **C6** (`snapshot_from_rows`, `run_rows`) | **HARD — B ↔ C6** |
| `engine/model.py` | — | B WP-7, WP-8 | **C6** (`origin` on `Clause`) | **HARD** |
| `engine/snapshot.py` | — | B WP-1 (verify only) | **C6 (changes the hash payload)** | **HARD — see 7.2(c)** |
| `engine/loader.py` | — | B WP-8 | C6 | MEDIUM |
| `engine/docx.py` | — | **B WP-5, WP-6, WP-8** | C6 (`ai_origin_characters`) | **HARD — plus uncommitted working-tree edits** |
| `engine/test_run.py` / fixtures | — | B WP-1, WP-2 | **C6 rehashes every fixture** | **HARD** |
| `backend/db/test/*.mjs` | A1 (all), A3, A4, A5, A7, A8 | B WP-2 (new file) | C5, C6, C8, C9 (new files) | SOFT after A1 |
| `ARCHITECTURE.md` | — | — | C2 (§2.5a), C3 (:309) | C-internal |
| `NEGOTIATION-ARCHITECTURE.md` | — | — | C2 | uncommitted tree |
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | — | — | C3, C4 | C-internal |
| `LIFECYCLE-ARCHITECTURE.md` | A7 (5-state contradiction) | — | C4 (R9–R12) | **MEDIUM — A7 and C4 both rewrite the agreement lifecycle** |
| `ADR-0008` | **A6, A9** | — | — | A-internal |
| `backend/README.md` | A6 | B WP-8 | C2 (grammar moves out) | **MEDIUM — three writers** |
| `docs/data-model.md` | — | — | C10 | last |
| `memory.md` | A (R2 chain version) | — | C (decisions) | append-only, low risk |

### 7.2 Contradictions — where two plans want incompatible things

**(a) `0007` migration number — two plans, same filename.** `plan-A:713` names `**new** 0007_audit_chain.sql`; `plan-C:74` names `migration 0007_review_queue.sql`. Neither cites the other. Whichever lands second either overwrites or forces a renumber mid-flight, and migration numbers are referenced in test harness ordering. **Resolution: allocate the number space centrally now — A2=`0007_audit_chain`, C5=`0008_review_queue`, C6=`0009_clause_origin`, C8=`0010_governance_and_lifecycle`, C9=`0011_negotiation_record`, plus B's two tables (see (b)).** Cost: renumbering Plan C's four migrations, ~10 minutes, done once, before anything starts.

**(b) Two tables Plan B needs that nobody owns.** `plan-B:487` — "The two new tables (`cw.snapshot_ladder`, `cw.run_manifest_dropped`) are named here but owned [by the database owner]". Plan A's nine packages do not create them; Plan A's R9 says explicitly "I did not read `backend/engine/**` (excluded by my slice)". Plan C's four migrations do not create them. **Nobody owns them, and both plans think someone else does.** This is not a collision — it is a **hole**, and Plan B's WP-1 and WP-7 are both blocked on it. **Resolution: a new package, `X1 = 0012_engine_seam_tables.sql`, owned by the Plan A author (schema conventions) but specified by the Plan B author (column shapes are in `plan-B:103-104` and `:420`). It must land before B WP-1.**

**(c) `origin` in the snapshot fingerprint — Plan C contradicts the engine's own stated hashing principle.** This is my sharpest technical objection to Plan C.

`backend/engine/snapshot.py:62-73` states the criterion in a comment: *"The hash covers exactly what determines the OUTCOME, and nothing else."* It then excludes `state` with a named reason: *"It is descriptive… and resolution never reads it… Hashing a mutable field that changes no outcome would make a stored run un-reproducible the first time Legal tidied the library, for no benefit at all."* `Observed`.

**`origin` is descriptive and determines no outcome.** Resolution never reads it. Plan C's own §4.1 puts `origin` into `clause_version_immutable()` — so unlike `state` it does not drift — but the *first* half of the criterion still excludes it: it changes nothing.

Plan C's justification (`plan-C:344-347`) is that otherwise `ai_origin_characters` would be "un-reproducible for a past run". **That is false.** The snapshot already pins `(clause_id, version)` for every clause; `origin` is immutable on that key; so `ai_origin_characters` for any past run is recoverable by joining the pinned refs to `cw.clause_version.origin`. Nothing needs to be in the hash. `Inferred`, but the mechanism is direct.

**Cost of the plan's version:** every engine fixture rehashed, which collides head-on with Plan B's WP-1 and WP-2 — both of which assert **round-trip `snapshot_id` equality** (`plan-B:122`, `:176`) and would have to be rewritten twice.

**Resolution: cut `origin` from the fingerprint.** Keep `origin` on the schema, on the `Clause` dataclass, in the `selectable` expression, and in `ai_origin_characters`. This removes a hard collision with Plan B, removes a global fixture rehash, and keeps `snapshot.py`'s stated principle intact. If the owner disagrees, it must land *before* B WP-1, never after.

**(d) `run_decision.category` — label vs key — both plans defer to the other.** Plan A R4: "Do not resolve unilaterally… the category question is handed to the E2 owner with a written note" (`plan-A:R4`). Plan B M5: "Worth naming to the database owner" (`plan-B:149`). **Deadlock.** Neither will resolve it, so it will ship unresolved. **Resolution: settle it now by evidence.** `0005:41` uses `category_key` with an FK to `cw.category(key)` for snapshot ladder rungs; `0005:99` uses bare `category text` for run decisions. The schema's own dominant convention is *key + FK* (`0003:14-23`, `0004`, `0002`). Plan B's M2 also shows the read path needs a key→label translation regardless. **Decide: `run_decision.category_key text not null references cw.category(key)`, with the label recovered by join.** Owner: Plan B (it owns `run.py:110`, the emitter); Plan A's A8 adds the FK. Single written decision, recorded in `memory.md`.

**(e) `do instead nothing` — Plan A removes it, Plan C adds four more.** See §4d. **Resolution: A9 sets the pattern; C5/C8/C9 adopt A9's replacement (a `BEFORE DELETE` trigger that raises), not `0002:91-92`.** This requires A9's decision to be *made* early even though A9 *executes* late. **Action: extract the delete-policy decision out of A9 into a one-line ruling before C5 is written.**

**(f) `cw.concession` — "immutable" vs "has a state machine".** Plan A's A3 adds a D6 immutability trigger; Plan C's C8 adds `state` plus a `recompute_concession_state()` that must move it. Plan C flags this (`plan-C:424-429`) and proposes A3's trigger exempt `state`. **I agree, with one addition: the exemption must be `state` only, transitions must be `proposed → approved | withdrawn` and terminal, and the exemption must carry its own mutation entry** — otherwise "concessions are immutable" degrades to "concessions are immutable except where they aren't" with nothing proving the boundary.

**(g) `LIFECYCLE-ARCHITECTURE.md` agreement lifecycle.** Plan A's A7 carries an owner decision (3 states vs the document's 5, `plan-A:R7`); Plan C's C4 rewrites §3.5/§3.6 of the same document. **Resolution: A7's owner decision must be answered before C4 writes, or C4 documents a state set A7 then changes.**

### 7.3 Recommended global package sequence

Six stages. Within a stage, packages are parallel-safe. **Nothing crosses a stage boundary.**

**Stage 0 — decisions and allocations (no code; hours, not days).**
- Migration-number allocation (contradiction (a)).
- Delete-policy ruling: keep `do instead nothing` or replace with a loud raise (contradiction (e)).
- `run_decision.category_key` ruling (contradiction (d)).
- Owner decisions surfaced together, in one card: agreement state set (A7/R7); MSA/SOW precedence (C §7); **renewal baseline, rewritten neutrally per §3 of this review**; `not_self_approved` strict vs qualified (C R4).
- Owner call on committing the working tree (§1).
- Cut `origin` from the snapshot fingerprint (contradiction (c)) or schedule it before B WP-1.

**Stage 1 — enablers.**
- **A1** (role-real test harness) — blocks every test in all three plans. Alone; touches every test file and `package.json`.
- **C1, C2, C3** documents track — runs fully parallel, touches no code. *(C2 gains the grammar CHECK from §2a; C3 gains the "not yet enforced" marker from §6.)*

**Stage 2 — database enforcement (Plan A's critical path).**
- **A2** → **A6** (both touch `0001`; strictly sequential).
- **A5** parallel (touches `0002`, `0004`).
- **A3** → **A4** → **A7** (all touch `0003`; strictly sequential).

**Stage 3 — the engine seam.**
- **X1** = new `0012_engine_seam_tables.sql` (`cw.snapshot_ladder`, `cw.run_manifest_dropped`) — the unowned-table hole (b). Must precede B WP-1.
- **B WP-1** → **B WP-2** → **B WP-7**.
- **B WP-3** → **B WP-4** parallel.
- **B WP-5** → **B WP-6** parallel *(note: `docx.py` has uncommitted Phase 0 edits — rebase, do not revert)*.

**Stage 4 — Phase 3 build.**
- **C5** (review queue) — **only after the four §4 defects are fixed in the plan**. Requires A1, A3.
- **C6-lite** (`origin` schema + engine + `ai_origin_characters`; **no fingerprint change**). After C5, after B WP-2.
- **C7** (`mint_clause_version` extraction). After A3 and C5. *Plan C's own suggestion to fold this into A3 is better: **do that**, and A3 becomes A3+C7.*
- **C8** (Required Approvers, concession state, signature evidence, legal hold, MSA/SOW). After A3, A4, A7, C3, C4. **Split R9 out** per §2b.
- **C9** (negotiation record). After C5, C6.

**Stage 5 — closers, strictly serial.**
- **A8** (coherence constraints; breaks fixtures — disclosures, not weakenings).
- **B WP-8** (touches nearly every engine file), then **B WP-9** (Python mutations).
- **A9** (indexes, TRUNCATE, loud DELETE — now across `0001`–`0012`).
- **C4** (LCMA doc repairs) — after A7's state decision.
- **C10** (`docs/data-model.md` + `docs/README.md`) — **last**, documents what exists.

**Single shared serialisation point:** `mutation-check.mjs` is edited by 12 of the ~25 packages. It should be treated as a lock: one writer at a time, in stage order, with entries appended and never reordered.

---

## 8. Missed issues

1. **`docs/spec-vs-implementation.md` and `docs/open-questions.md` are named in OC §2 as document targets and appear in no plan's package list.** Phase 3 resolves at least open questions 4 (MSA/SOW) and 5 (rules-as-data). Leaving them open is a new drift. `Observed` (OC §2; absent from A, B, C package tables).
2. **Plan C never checks whether PGlite enforces `create rule … do instead nothing` or `BEFORE TRUNCATE` at all** — it lists PGlite as risk 3 but only for `for update` policies. Plan A ran a full capability probe (`plan-A:72-190`) and found PGlite "fully capable" with two named gaps. **Plan C should inherit Plan A's probe rather than re-assume.** Free evidence, unused.
3. **No plan owns the `verify` script's stage ordering.** OC S9 requires `npm run verify` green across five DB suites + Python + both mutation harnesses. Plan C adds ~4 suites, Plan B adds 2, Plan A adds 1. `backend/package.json` is edited by A1, B WP-2 and implicitly C5. Nobody owns the final wiring. **Add a stage-5 package.**
4. **The `viewer` role is created in `0001_foundation.sql:17-23` and is invisible in `ARCHITECTURE.md:309` (Plan C R5 fixes this) — but Plan A's A6 also rewrites role/identity text in `ADR-0008` and `backend/README.md`.** Two plans editing the role story in three files with no shared source of truth.
5. **Plan C's `cw.clause_draft.text` has no immutability protection.** Even after the §4c fix, if `draft.text` is editable after submission the metric is gameable by editing the *baseline* instead of the approval. Needs the same trigger treatment as `clause_version`.

---

## 9. Blocking objections

| # | Objection | Where |
|---|---|---|
| **B1** | `edited_before_approval` is structurally always `false` as designed. ADR-0010's binding control would report a perfect score regardless of reviewer behaviour. C5 must not ship without an `approved_text` (or revision log) surface. | §4c |
| **B2** | The Review-queue state machine is ungoverned on INSERT. A requester can insert a terminal, note-less, self-decided ticket. Defeats OC success criterion **S6** on day one. | §4a |
| **B3** | `0007` is claimed by two plans (A2 and C5). Must be allocated centrally before either starts. | §7.2(a) |
| **B4** | `cw.snapshot_ladder` and `cw.run_manifest_dropped` are needed by Plan B and owned by nobody. Plan B's WP-1 and WP-7 are blocked and neither plan knows it. | §7.2(b) |
| **B5** | Plan C §8 (renewal) presents a non-neutral choice, resting on an ADR-0009 "violation" that does not exist in ADR-0009's text. OC assumption A4 is not discharged. §8 must be rewritten as a neutral decision card. | §3 |
| **B6** | C3 rewrites the CLA to promise three-party concession approval; C8 (the enforcement) is on the defer list. Shipping C3 without C8 creates a *new* spec-vs-implementation gap. C3's edit must carry an explicit "not yet enforced" marker if C8 defers. | §6 |
| **B7** | Plan C adopts `do instead nothing` for four new tables while Plan A removes it from six existing ones. One ruling must precede both. | §4d, §7.2(e) |

---

## 10. Non-blocking concerns

1. `rejection_needs_note` should be `coalesce(btrim(decision_note),'') <> ''` — the plan already knows and shipped the weak form anyway (§4b).
2. R4 is tagged documents-only but needs a CHECK constraint, a test and a mutation entry (§2a).
3. R9 (signature evidence) is two new tables against the frozen `0006` family; it should not be folded into C8 (§2b).
4. `origin` in the snapshot fingerprint contradicts `snapshot.py:62-73`'s stated criterion and is unnecessary for reproducibility (§7.2(c)).
5. Auditor RLS visibility of retired/superseded `clause_version` rows is unverified; the reference-not-copy design depends on it (§5, caveat 2).
6. `cw.clause_draft.text` needs immutability protection (§8.5).
7. Plan C's `verify_review_ticket` signature (§2.3) and `mint_clause_version` signature (§3) are mutually inconsistent on the body parameter.
8. Size estimate should be restated as **2–2.5×**, not 1.5–2× (§6).

---

## 11. What the plans get right

**Plan C.**
- **The stale-claims correction is correct and well-evidenced.** ADR-0010, the NA and the index row are genuinely committed. Removing phantom work is exactly what an independent plan should do, and most planners would have padded instead.
- **The rule-grammar diagnosis is the right *shape*** even though "fully specified" overstates it. Putting the grammar in `ARCHITECTURE.md §2.5` (where validation lives) rather than inventing a CLA §4 is the correct call and cheaper than the review implied.
- **The e-signature finding is correct on the schema.** `0006:56-66` really does model counterparts and exhibits with bytes and hashes; the review's "one field" framing was wrong.
- **§5.2's insistence that the CLA scaling claim be *reduced*, not reworded, is the single best judgement in the document.** "Ladders convert Legal's work from authoring to approving" is a smaller and true claim. A weaker plan would have softened the language and moved on.
- **§13.6 declining two invitations to design content-generation** correctly applies the owner's product boundary.
- **The reference-not-copy design for suppressed candidates is right**, and right for the reason ADR-0004 itself gives.
- **The collision flags against Phase 1 (D1, D4, D5/D6) are accurate** — I verified all three against the migration sources. Plan C found them; Plan A did not look for them.
- **Naming C8's deferral "the most uncomfortable" rather than burying it** is the behaviour the objective contract asks for.

**Plan A.** The PGlite capability probe and the D2 timestamp-rendering discovery (`ts::text` is session-dependent, so `audit_verify()` false-alarms on an honest database) are genuinely new findings the review missed, reproduced rather than asserted. Its correction of the review's root cause — *writes*, not *reads*, run as owner — is precise and should tighten OC S3.

**Plan B.** The bidirectional analysis of E2 (the read half is broken too, so a rename alone does not fix it) and the refusal to add a mutation entry guaranteed to MISS under PGlite are both disciplined. Its explicit "I do not own these two tables" note is the reason the ownership hole in §7.2(b) is discoverable at all.
