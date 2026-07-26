# Work Packages — Clausewerk Phases 0–3

Derived from `.adversarial-workflow-agentic/integrated-revision-plan.md`. IDs are stable and are
never renumbered once implementation begins.

**Universal acceptance criteria** (every package, in addition to its own):
- U-A: `cd backend && npm run verify` is green at the end of the package.
- U-B: no existing test assertion is weakened or deleted. If one was wrong, that is disclosed in
  the implementation report as a finding, not silently changed.
- U-C: any package that closes an enforcement hole adds (i) a test that fails without the fix and
  (ii) a mutation-check entry proving that test can fail.
- U-D: where a database protection is a policy or a grant, its test performs the governed action
  **as the real role, on the write path** — not as the owner (success criterion S3, tightened).
- U-E: no new runtime dependency. If one appears necessary, stop and record it as
  approval-sensitive.

---

## Stage 0 — Settled decisions (no code; binding on all packages)

- **S0-1 Migration numbers:** `0007` audit chain · `0008` review queue · `0009` clause origin ·
  `0010` approvers/hold/signature/MSA · `0011` negotiation record.
- **S0-2 `run_decision.category`** becomes **`category_key` with an FK** to the category table —
  the schema's dominant convention. Breaks the Plan A ↔ Plan B deadlock.
- **S0-3 `do instead nothing` on delete is banned** in new work and removed where it exists.
  Deletes on append-only tables must raise.
- **S0-4 `origin` is NOT in the snapshot fingerprint.** The fingerprint covers what determines the
  outcome; origin cannot change an outcome on a pinned `(clause_id, version)`.
- **S0-5 Mutation `N9` (billion-laughs) is not added** — expat already blocks it, so the mutation
  cannot fail. Adding an inert mutation is worse than adding none.

---

## Stage 1 — Enablers

### WP-01 · Role-real write harness
**Files:** new `backend/db/test/roles.mjs`; `backend/db/test/*.test.mjs` (helper adoption only).
**Depends on:** none. **Blocks:** WP-03…WP-08, WP-16, WP-18, WP-19.
**Task:** a shared helper that creates the four/five roles and runs a governed **write** as a named
role, so policy and grant failures surface. Existing suites use `set role` on reads only; that is
precisely why D1 hid.
**Acceptance:** helper exists and is used by at least one write in each governed suite; a
deliberately removed grant makes a helper-run write fail. **Mutation:** none of its own (it is the
instrument).

### WP-02 · ADR hygiene (documents only)
**Files:** `docs/decisions/ADR-0001…`, `ADR-0002…`, `docs/decisions/README.md`.
**Depends on:** none.
**Task:** "Amended by ADR-0010" notes on ADR-0001 and ADR-0002; correct ADR-0002's now-false
"auditing means reading one filter" passage; correct the index's "the prototype implements them"
claim, which is false for 0008–0010. The index already lists 0010 and both files are already
committed at `dd0b396` — the review's claim otherwise is stale.
**Acceptance:** no ADR asserts something the repository contradicts; a reader of the founding
records is not misled.

---

## Stage 2 — Database enforcement

### WP-03 · Audit chain rebuilt  *(D2 + the unreported RLS hole)*
**Files:** `backend/db/migrations/0001_foundation.sql`, new `0007_audit_chain.sql`,
`backend/db/test/` (new `audit-chain.test.mjs`), `mutation-check.mjs`.
**Depends on:** WP-01. **Blocks:** WP-04.
**Task, five parts:**
1. **Pre-image rebuilt.** Replace `new.ts::text` with epoch-microseconds (session-invariant —
   verified), use a separator that cannot be forged by field content, include `new.seq` and
   **`actor_role`** (currently unhashed, so a role rewrite is undetectable). Today an honest
   database reports tampering whenever the reader's `TimeZone` or `DateStyle` differs from the
   writer's — reproduced independently three ways.
2. **Fork guard.** `unique index on (prev_hash) nulls not distinct` — verified to reject a fork and
   a second genesis with no false positive on legitimate append, truncate-reseed, or same-instant
   duplicates. PGlite is single-connection so the fork must be tested structurally; an advisory
   lock is added for real deployments but ships with honest zero coverage, stated as such.
3. **Anchored tail.** A periodic checkpoint row recording the latest hash, so truncation is
   detectable. `pgcrypto` is unavailable in PGlite, so the checkpoint is **anchored but unsigned**
   in this phase, and that limitation is written down rather than glossed.
4. **RLS on `cw.audit_event`.** It currently has none — a requester can read rival buyers'
   concession payloads. Enable RLS **with an INSERT policy as well as SELECT**; a SELECT-only
   policy breaks every audited write for requester *and* legal_admin (reproduced).
5. **`audit_verify()` becomes `security definer`** with a pinned `search_path`; under RLS as a
   scoped role it otherwise reports tampering on an honest database (reproduced).
**Acceptance:** honest chain verifies clean under at least three `TimeZone` and three `DateStyle`
settings; `actor_role` rewrite detected; truncation detected; fork rejected; a requester cannot
read another buyer's audit payload; an auditor still can; every audited write still succeeds for
every writing role. **Document the scheme** — it is the unspecified foundation of every
tamper-evidence claim in the product.
**Mutations:** revert pre-image → timezone test fails; drop `actor_role` from the pre-image →
role-rewrite test fails; drop the fork index → fork test fails; drop the INSERT policy → audited
write fails. (No serialisation mutation — it is guaranteed to miss in PGlite.)

### WP-04 · Identity narrowed to the connection role  *(D3)*
**Files:** `0001_foundation.sql`, `0007_audit_chain.sql`, affected suites.
**Depends on:** WP-03, WP-06 (the owner mapping — see `U3`).
**Task:** derive role from the authenticated connection rather than a client-settable GUC. Narrowed
`app_role()` returns `null` for the owner, which breaks three owner-run promotion tests — hence the
WP-06 dependency. Where the real fix is not reachable in this codebase, **document the residual
loudly**: the GUC scheme requires a fully trusted connection layer and is incompatible with
transaction-mode pooling. Note the residual that `actor_role` remains self-asserted at write time.
**Acceptance:** a role cannot elevate itself by setting a session variable; the spoof attempt has
its own test. **Mutation:** restore the GUC read → spoof test fails.

### WP-05 · Immutability holes closed  *(D4)*
**Files:** `0002_clause_registry.sql`, `0004_conflict_rules.sql`, `registry.test.mjs`,
`mutation-check.mjs`. **Depends on:** WP-01. **Runs parallel to WP-03/06.**
**Task:** protect `reviewer` on approved clause versions; forbid un-retiring and audit **both**
directions of the retired flag (the hook currently fires only on retire); protect `effective_on`
and un-retirement on conflict rules, so history cannot be rewritten retroactively.
**Acceptance:** one mutation check per protected field, each proving its test can fail.

### WP-06 · Promotion under real permissions  *(D1 + D6 — one item, not two)*
**Files:** `0003_ladders_and_concessions.sql`, `ladder.test.mjs`, `mutation-check.mjs`.
**Depends on:** WP-01. **Blocks:** WP-07, WP-08, WP-04.
**Task:** D1 and D6 must be fixed together — adding a plain UPDATE policy fixes D1 while *opening*
D6, because concessions are currently immutable only by accident, via the very bug being fixed.
**The adjudicated remedy is neither branch the proposal offered:** `grant update
(promoted_to_clause)` plus a **restrictive** UPDATE policy, keeping `security invoker`. This was
built and run: promotion succeeds as a real `cw_legal_admin`, double-promotion raises, and
`vendor_text`/`approved_by` rewrites are denied. The `security definer` branch was rejected because
its role check reads a client-settable variable — a `cw_legal_reviewer` setting `cw.role` was
demonstrated promoting vendor text. Also: `revoke all on function … from public` is load-bearing
(PostgreSQL grants EXECUTE to PUBLIC by default), and needs its own spoofing test.
Also fix, found in passing: `promote_concession()` hard-codes `severity='Standard'`, so vendor text
conceded against a High position mints a Standard clause.
**Acceptance:** the whole promotion path runs **as `cw_legal_admin`, not the owner**; double
promotion raises rather than silently no-opping; a reviewer cannot promote by setting a session
variable; a High concession mints a High clause. **Mutations:** drop the restrictive policy →
rewrite test fails; restore the public EXECUTE grant → spoof test fails; revert severity → severity
test fails. Note: the D6 test must fail with the trigger *neutered*, not merely with the grant
removed — the grant denies first and would mask it.

### WP-07 · The floor made absolute  *(D5)*
**Files:** `0003_ladders_and_concessions.sql`, `ladder.test.mjs`, `mutation-check.mjs`.
**Depends on:** WP-06.
**Task:** floor lookup must filter on the concession's severity and order deterministically —
today it picks rung 0 (the High floor) and wrongly rejects a legitimate Standard rung-2 concession.
It must **fail loudly when no ladder exists**; the no-ladder path was verified to fail *open*
(rung 99, no override, accepted). Record `ladder_id` and rung on the concession. Make published
rungs immutable. Confirm the check also fires on the vendor-text path.
**Acceptance:** High concession cannot pass the Standard floor; a legitimate Standard concession is
no longer wrongly rejected; a concession with no ladder is refused with a clear error.
**Mutations:** remove the severity filter; remove the fail-closed branch.

### WP-08 · Agreement status machine  *(D7)*
**Files:** `0006_executed_agreements.sql`, `executed.test.mjs`, `mutation-check.mjs`.
**Depends on:** WP-06.
**Task:** an audited status transition tied to execution — today status can never change, so every
signed deal stays "negotiating" forever. The permitted state set contradicts
`LIFECYCLE-ARCHITECTURE.md:296`; reconcile and note it (`U2`-adjacent).
**Acceptance:** executing an agreement moves its status; illegal transitions raise; every
transition is audited.

---

## Stage 3 — Engine and the seam

### WP-09 · Ladder status stored and rebuilt  *(E1)*
**Files:** `backend/engine/snapshot.py`, `run.py`, `loader.py`, `test_run.py`,
`0005_run_store.sql`, `mutation_check.py`. **Blocks:** WP-10.
**Task:** the snapshot hash includes each ladder's status but nothing stores it and rebuild
hard-codes "intact", so a run holding a degraded ladder can never be reproduced. **Store it and
keep it in the hash** — status is outcome-bearing (`descend()` refuses a non-intact ladder), and
the `selectable` precedent (`0005:6-10`) already argues clock-derived state cannot be recomputed
later. **No new `cw.snapshot_ladder` table is needed** — status is a pure function of rows already
stored (`is_floor` plus per-member frozen `selectable`), which was independently derived from real
emitted rows. Add a degraded-ladder fixture to the reproducibility tests, in a state
`ladder_health` can actually emit.
**Acceptance:** a run with a degraded ladder reproduces byte-identically; the negative control
still proves today's library gives a different answer.

### WP-10 · Write-side seam test  *(E2 — the keystone)*
**Files:** new `backend/db/test/writer-sql.test.mjs`; `snapshot.py`/`run.py` for the fix.
**Depends on:** WP-09, S0-2.
**Task:** insert `snapshot_rows()` / `run_rows()` output into the **real migrated schema** and
round-trip it back through `snapshot_from_rows`. This converts "two parallel worlds" into one
system. **The mismatch is one, not nine:** `category` (human label) versus `category_key`. M7 was
refuted — `0002:26` already permits `'Baseline'`. But the read side is broken in the mirror
direction: `snapshot_from_rows` puts the key into the hashed `Ladder.category`, so the id changes
on round trip even after the write side is fixed. Translation is needed **both** ways. Note that a
write-side suite does exist and its hand-written INSERTs used `category_key` — which is exactly how
the mismatch stayed hidden, and is a stronger argument for this test than "no suite exists".
**Acceptance:** engine output inserts into the migrated schema without hand-editing, and the
round-tripped snapshot id is unchanged. **Mutation:** revert either translation → round-trip id
differs.

### WP-11 · Manifest boundary in the backend  *(E7)*
**Files:** `backend/engine/model.py` or a new `manifest.py`; `run.py`; tests.
**Depends on:** WP-10.
**Task:** one function validating a manifest against the category enum — dropping unknowns
**recorded as *dropped*, distinct from "no clause available"** — and coercing severity, so a
hallucinated category can never masquerade as a library coverage gap. Today this boundary exists
only in the prototype.
**Acceptance:** a hallucinated category is dropped, appears in the run record as dropped, and does
**not** appear as a coverage gap. **Mutation:** remove the enum filter.

### WP-12 · Newest selectable version wins  *(E3a)*
**Files:** `resolution.py`, `test_resolution.py`, `mutation_check.py`.
**Task:** resolution currently picks the *oldest* when two versions are selectable. Adopt
newest-selectable-wins and add the two-selectable-versions fixture. Verified to break zero existing
tests — no current fixture has two versions of one clause id.
**Deferred and split out:** E3(b), resolution consulting ladders for a preferred rung, is scope
creep with product-boundary implications. Recorded as deferred, not silently dropped.

### WP-13 · Lapsed always-include clause gates  *(E4)*
**Files:** `resolution.py`, `test_resolution.py`, `mutation_check.py`. **Depends on:** WP-12.
**Task:** an expired baseline clause currently vanishes and the contract is silently shorter. It
must produce a loud, **gating** decision record — the risk pass already distinguishes "lapsed" from
"never existed"; the baseline pass must too.

### WP-14 · Hostile uploads  *(E6 — re-aimed)*
**Files:** `docx.py`, `test_docx.py`, `mutation_check.py`. **Blocks:** WP-15.
**Task:** **the entity-expansion premise is refuted** — expat 2.5.0 already blocks classic
billion-laughs (0.26 s) and quadratic blowup, and the current parser raises `NotADocx` on the bomb
today. Do not add mutation N9; it cannot fail. The **real** exposures, both reproduced, are:
(i) a zip bomb, 102 KB expanding to 344 MB, and (ii) unbounded nesting — 33.6 MB of nested elements
with no DOCTYPE took 18.7 s and 1.3 GB peak, *under* the proposed cap. Implement a per-member
bounded read (`z.open().read(cap+1)`), an archive-total cap, and a nesting/size guard. Refusing a
DOCTYPE is cheap and retained as defence in depth, but "legitimate OOXML never has a DOCTYPE" is
`Inferred`, not `Observed`, and must be labelled that way.
**Acceptance:** the zip-bomb fixture is refused without exhausting memory; the nesting fixture is
refused promptly. **Mutations:** remove the per-member cap; remove the nesting guard. Both must
demonstrably fail.

### WP-15 · Word containers and tracked moves  *(E5)*
**Files:** `docx.py`, `test_docx.py`. **Depends on:** WP-14.
**Task:** `parse_redlines` (`docx.py:267`) walks only direct children, so text inside `w:hyperlink`,
`w:sdt`/`w:sdtContent` and `w:smartTag` vanishes from what a Review ticket shows Legal. Recurse.
Handle tracked moves (`w:moveFrom`/`w:moveTo`) explicitly — **treat as delete + insert and say so**
in both code and docs. Also fix the reachable-but-vacuous `w:delText` branch (`docx.py:165-170`)
and the nested-`w:p` double count.
**Scope correction:** the review overstated this. `paragraphs()` uses `p.iter()` and recurses, so
the emit path and the authored-characters counter are **not** affected — success criterion S10 was
never at risk. That is worth stating plainly.
**Honesty constraint:** fixtures "generated from actual Word output" may not be producible here. If
not, use the nearest honest substitute and **label the limitation** rather than claiming Word
fidelity.

---

## Stage 4 — Phase 3 builds

### WP-16 · Review queue  *(migration 0008 — redesigned)*
**Files:** new `0008_review_queue.sql`, new `backend/db/test/review-queue.test.mjs`,
`mutation-check.mjs`. **Depends on:** WP-01, WP-06.
**Task:** `cw.review_ticket` (ticket, quarantined proposed text, provenance badge),
`cw.review_segment`, `cw.review_candidate` (**candidates stored as references, not copies** —
verified safe: clause versions are genuinely immutable, `0002:67-92` guards body/title/citations
and forbids delete, and retire/supersede preserve the row), and `cw.clause_draft` (prompt, model,
version, inputs, `edited_before_approval`, expiry).
**Four mandatory corrections to the proposed design, each refuted with evidence:**
1. **Guard inserts, not only updates.** A `before update` trigger alone lets a requester INSERT
   `state='rejected'` directly and defeat the gate on day one. Guard both.
2. **The rejection note CHECK must reject `''`**, not merely `null`. As proposed it never catches
   the empty string, so "mandatory" was decorative.
3. **`edited_before_approval` must be derivable.** As designed it is structurally always `false` —
   `proposed_text` is immutable and the verify function takes no body parameter, so a reviewer's
   edit has nowhere to land. ADR-0010's binding control would report a perfect score forever. Give
   verification a body parameter and derive the flag from stored bytes, never self-report.
4. **No `do instead nothing` on delete** (S0-3) — it is the pattern D9 condemns.
Apply the D1 lesson from line one: explicit `for update` policy with both `using` and `with check`,
and tests running as `cw_legal_reviewer`, not the owner.
**Acceptance:** an illegal insert-time state is refused; a rejection with an empty note is refused;
a reviewer edit sets `edited_before_approval` true and an unedited approval sets it false; the
whole path runs as the real role.

### WP-17 · Clause origin and the second count  *(migration 0009)*
**Files:** new `0009_clause_origin.sql`, `backend/engine/model.py`, `docx.py`, tests.
**Depends on:** WP-16.
**Task:** `origin` on clause versions (`legal_authored | ai_drafted | vendor_derived | external`)
plus the second character count, so both provenance figures are computable **for the system record**
before the first AI draft is ever approved. **Neither figure is printed on the contract** (owner
decision, Phase 0 item 1). **`origin` is NOT added to the snapshot fingerprint** (S0-4) — the
fingerprint covers what determines the outcome, and origin cannot change an outcome on a pinned
`(clause_id, version)`. Reconcile the inconsistency where ADR-0010:72 makes `external` a
clause-version origin while NA:244 gives external clauses a separate entity.
**Acceptance:** both counts computable; the zero-authored-characters assertion on the assembly path
still passes unchanged; no stored hash changes.

### WP-18 · Required approvers, legal hold, signature evidence, MSA/SOW  *(migration 0010)*
**Files:** new `0010_governance.sql`, tests, `CLAUSE-LIBRARY-ARCHITECTURE.md` §3/§7.
**Depends on:** WP-07, WP-16.
**Task:** the configurable **Required-Approvers** model — settling at a fallback position requires
the Requester **and** the assigned attorney, plus any configured Required Approvers (executive
leadership, other management, and stakeholder departments such as ISO, Privacy, Compliance, Risk).
Legal hold on retention (currently absent entirely — in a system whose selling point is what
survives a dispute). Signature evidence: bytes are already modelled (`0006:56-66` hashes
counterparts and exhibits), but `0006:44 signature_evidence text` holds no certificate bytes and
signatories are two text columns — fix those two, do not rebuild what works. MSA/SOW:
`agreement_kind` and `parent_agreement_id`, reusing the existing Order of Precedence overlay.
**Honest boundary:** obligations do not exist yet, so MSA/SOW can be *modelled* but not delivered
end to end. Say so rather than implying coverage.
**Owner decision `U2`:** whether a SOW may contradict its master. Implement the stricter default
(it may not) and surface the choice.
**Note:** WP-21 without this package creates a fresh spec-versus-code gap — if either slips, both
slip together, or WP-21's text is marked "specified, not yet enforced".

### WP-19 · Negotiation record  *(migration 0011)*
**Files:** new `0011_negotiation_record.sql`, tests. **Depends on:** WP-16.
**Task:** rounds and positions per `NEGOTIATION-ARCHITECTURE.md` §2 — append-only, like runs.
**Owner decision `U1` (renewal baseline):** implement the proposal's recommendation — renewal opens
from the executed agreement's positions with the drift report alongside — with library-standard
restart as an **explicit recorded choice**. Objective-contract assumption **A4 is not discharged**:
the opposing case was argued and its "violates ADR-0009" reasoning was refuted (ADR-0009 forbids
*library* drift; a same-agreement renewal baseline is deal-scoped). The genuine difference between
the options is only which button is pre-selected, so both must be reachable and the choice recorded.

---

## Stage 5 — Documents and the sweep

### WP-20 · Rule grammar  *(not documents-only)*
**Files:** `CLAUSE-LIBRARY-ARCHITECTURE.md`, `NEGOTIATION-ARCHITECTURE.md:182`,
`0004_conflict_rules.sql`, tests.
**Task:** NA cites the rule grammar to "CLA §4", which is the Concessions section. The grammar is
**not** missing — primitives, examples and tag namespacing exist at `0004:38-79` and
`README:177-196` — it is in the wrong artefact. Write the CLA section, fix the citation, and close
the three genuine gaps: the namespace *definition*, empty-array legality (`0004:62` permits
`all_present: []`, which fires vacuously), and case sensitivity. The empty-array gap needs a
**CHECK, a test and a mutation** — hence not documents-only.

### WP-21 · Five roles everywhere, and CLA §3/§7
**Files:** `ARCHITECTURE.md:309`, `CLAUSE-LIBRARY-ARCHITECTURE.md` §3/§7, `docs/glossary.md`.
**Depends on:** WP-18 (see its note).
**Task:** ARCHITECTURE.md §5 lists four roles; ADR-0008 defines five. Resolve the CLA §3-versus-§7
contradiction: §3 says the matcher may settle against a fallback rung *without a human*; §7 says
descending is a recorded Requester act, yet also says concessions are created automatically. Owner
decision 4 settles it — a concession at a fallback position requires named human approval. Apply
it; a machine may propose, never settle.

### WP-22 · Lifecycle spec repairs
**Files:** `LIFECYCLE-ARCHITECTURE.md`, `docs/open-questions.md`.
**Task:** legal hold documented; signature-evidence spec brought up to the code (the spec is behind
the schema, not ahead of it); MSA/SOW and renewal semantics written down with `U1`/`U2` marked as
owner decisions; the agreement state set reconciled with WP-08.

### WP-23 · Coherence constraints  *(D8)*
**Files:** `0002`, `0003`, `0005`, `ladder.test.mjs`, `mutation-check.mjs`.
**Task:** clause-ID prefix versus category short-code; rung clause severity versus ladder severity;
CHECK constraints on run-store rows to match the rest of the schema.
**Disclosure required:** the rung-coherence constraint breaks existing fixtures at
`ladder.test.mjs:105-109` and `:120-122`. Correcting them is **legitimate, not test weakening** —
neither test asserts rung severity or category, and every existing assertion survives unchanged.
But the correction needs **new seed clauses** (no Standard `data` clause and no High `liab` clause
exist), not ID swaps. This must appear in the implementation report either way.

### WP-24 · Engine smalls  *(E8)*
**Files:** `resolution.py`, `backend/README.md`, `test_docx.py`.
**Task:** remove the misnamed dead `at_floor` property and the dead `Ladder` import
(`resolution.py:22`); fix README test counts and the "document service not yet started" line that
sits above a section describing the built document service; fix the vacuous test — it starts at
`test_docx.py:121` and its assertion at `:126` passes on an empty document. Also handle
`snapshot_from_rows` silently dropping members that lack clause rows.

### WP-25 · Indexes, TRUNCATE, loud DELETE  *(D9)*
**Files:** all six migrations, `mutation-check.mjs`.
**Task:** indexes on common lookups; bring TRUNCATE inside the immutability story; make silent
no-op DELETE raise instead (S0-3), since it currently hides application bugs.

### WP-26 · Data-model refresh
**Files:** `docs/data-model.md`. **Depends on:** every schema package.
**Task:** it predates three of the four architecture documents and covers none of the newer ones.
Rebuild it against the final schema — last, so it describes what exists.

### WP-27 · Mutation harness consolidation and full verify
**Files:** `mutation-check.mjs`, `mutation_check.py`, `backend/package.json`.
**Depends on:** all. **This file is a lock — many packages write to it; it is reconciled here.**
**Task:** extend the harness to the **run store** (currently zero mutations target it); repair the
stale mutation `find` strings at `mutation-check.mjs:39-42` and `:56-58`, which break
`npm run test:mutation` and therefore success criterion S9; confirm no inert mutation was added
(notably N9, banned by S0-5, and any serialisation mutation, which cannot fail in PGlite).
**Acceptance:** `npm run verify` green; every mutation demonstrably caught by a *named* test.

---

## Traceability

| Finding | Package | Finding | Package |
|---|---|---|---|
| D1 | WP-06 | E1 | WP-09 |
| D2 | WP-03 | E2 | WP-10 |
| D3 | WP-04 | E3a | WP-12 · E3b deferred |
| D4 | WP-05 | E4 | WP-13 |
| D5 | WP-07 | E5 | WP-15 |
| D6 | WP-06 | E6 | WP-14 |
| D7 | WP-08 | E7 | WP-11 |
| D8 | WP-23 | E8 | WP-24 |
| D9 | WP-25 | Phase 0 hygiene | WP-02 |
| audit RLS (new) | WP-03 | Review queue | WP-16 |
| Origin + 2nd count | WP-17 | Required approvers | WP-18 |
| Legal hold, e-sig, MSA/SOW | WP-18 · WP-22 | Negotiation record | WP-19 |
| Rule grammar | WP-20 | Five roles, CLA §3/§7 | WP-21 |
| data-model.md | WP-26 | Mutation harness | WP-27 |

## Gate 3 status

Pending independent work-package review.
