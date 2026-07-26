# Implementation log

Running record. Each entry: package, acceptance criteria **written before coding** (Gate 3
remediation §6), what changed, evidence, deviations, findings.

**Baseline before any work** (`npm run verify`, exit 0): 5 suites — 16/29/16/37/22 = 120 assertions
passing; JS mutations 15/15; Python 104 tests, mutations 24/24 (one scored `ok*`).

---

## WP-00 · Make the test suite able to see new work — **COMPLETE**

**Acceptance criteria (written first):**
1. Adding a new `*.test.mjs` to `db/test/` causes `npm test` to run it without editing any list.
2. A mutation caught by a test *other* than the one it names fails the harness.
3. `npm run verify` exits 0 with no `IMPRECISE` and no `MISS`.

**Changed**
- `backend/db/test/run-all.mjs` (new) — discovers and runs `db/test/*.test.mjs`.
- `backend/package.json:8` — `test` script replaced the hard-coded five-suite list with the runner.
- `backend/db/test/mutation-check.mjs` — `ok*` no longer scored as caught; new `imprecise` bucket,
  fatal, with its own report section.
- `backend/engine/mutation_check.py` — same change.
- Two mutation entries repointed to the test that actually catches them (below).

**Evidence** — `npm run verify` exit 0: `5/5 suites passed`, `15/15 mutations caught by their named
test`, `24/24 mutations caught by their named test`.

**Findings produced by the stricter harness** (it found two mispointed checks immediately):

1. **`clause text is reformatted on the way into the document`** named
   `test_clause_text_appears_verbatim`. Reproduced: that test does **not** fail. It asserts
   `d.selected.body in text` — plain substring containment — so appending `…` to a clause leaves it
   green. The real catcher is `test_the_document_contains_zero_authored_characters`
   (`assert 295 == 0`). **This is review finding E8's "substring-match test that asserts nothing",
   and it is a more serious instance than the one the red team nominated.** Repointed; strengthening
   the verbatim test is carried into WP-24.
2. **`audit log not hash-chained`** named `tampering with a past event is detected`. Reproduced: the
   real catcher is `the hash chain verifies`. Dropping the previous hash breaks verification
   outright, so the mutation proves the chain is *linked*, not that tampering is detected — a
   weaker guarantee than its name implied. Repointed, with a comment; genuine tamper-detection
   mutations are added in WP-03.

**Deviations from the package:** none. **Approval-sensitive:** none. No test assertion was weakened;
two mutation *labels* were corrected to name the test that actually fires, which strengthens the
harness rather than relaxing it.

**Why this package ran first:** without it, every later "verify is green" claim would have been
vacuous for the new suites in WP-03, WP-10 and WP-16, and any mutation caught by the wrong test
would have counted as protection.

---

## WP-01 · Role-real write harness — **COMPLETE**

**Acceptance criteria (written first):** (1) a shared helper genuinely becomes the named database
role, proved by `current_user`; (2) removing a grant makes a helper-run write fail; (3) a silent
no-op is not scored as a refusal.

**Changed:** `backend/db/test/roles.mjs` (new helper), `backend/db/test/roles.test.mjs` (new suite,
10 tests, all passing).

**The finding confirmed in the source.** Every existing suite's `asRole()` does `reset role` plus
two `set_config` calls — it sets the *claimed* application role while the session stays connected as
the owner. `set role` appears in exactly five files and only in the read-side RLS sections at the
bottom of each. **Every governed write in the entire test suite ran as the owner**, who bypasses RLS
and holds every privilege. That is precisely why D1 survived. The red team was right and the
review's stated root cause was wrong: the suites do use `set role`, but never where it counts.

**Notable:** `mustNotWrite()` distinguishes *raised* from *silent*. An UPDATE with no matching
policy does not error — it affects zero rows and reports success. Scoring that as a refusal is the
D1 blind spot, so the helper refuses to unless the caller explicitly expects it. There is a test
proving the helper complains, and a second proving the row really was unchanged.

**Deviation:** none. **Found in passing:** category short codes must match `^[A-Z]{2}$`
(`0002:13`) — my first fixtures used digits and were correctly rejected.

## WP-02 · ADR hygiene — **COMPLETE**

**Changed:** `ADR-0001` and `ADR-0002` carry amendment notes at the top; ADR-0002's Consequences
passage claiming "auditing means reading one filter" is corrected in place (it is no longer true —
there are several crossings now, and the question that *can* still be answered in one place is the
narrower "without a named human approving it?"); `docs/decisions/README.md` no longer claims the
prototype implements every record, and now separates retrospective 0001–0007 from forward-looking
0008–0010; the index rows for 0001 and 0002 are marked amended.

**Stale review claims, confirmed stale:** ADR-0010 and `NEGOTIATION-ARCHITECTURE.md` are already
committed at `dd0b396`, and the index already listed 0010. Two of the five Phase 0 hygiene items did
not need doing.

**Verify after WP-00 + WP-01 + WP-02:** `6/6 suites passed` (the new suite was discovered
automatically — WP-00 working), `15/15` and `24/24` mutations caught by their named test, exit 0.

---

## WP-03a/b/c · Audit chain rebuilt — **COMPLETE** (report: `wp-03.md`)

All 7 criteria met. `0001_foundation.sql` pre-image rebuilt in place (so the broken version does not
survive as a trap); new `0007_audit_chain.sql` adds the fork index, the checkpoint anchor and RLS;
new `audit-chain.test.mjs` (23 tests). 8 mutations added + 1 repaired, every one firing via its
named test. Both Gate-3 inert candidates were handled rather than shipped: the INSERT-policy test
writes **as a real `cw_requester`**, and the fork test induces the fork by disabling the trigger.

**Two findings nobody predicted:**
1. **RLS blinds the append path too.** `cw.audit_chain()` reads the tail to know what to link to.
   As a security-invoker function, a requester saw no rows, concluded it was writing the first event
   ever, and **started a second chain**. The plan only ever flagged `audit_verify()`. The new fork
   guard caught it loudly instead of letting it fork silently — the guard earning its place on its
   first day. Fixed by making `audit_chain()` `security definer`. *Carried forward: any function
   reading `cw.audit_event` for a system purpose now needs `security definer`.*
2. **`mutation-check.mjs` silently corrupted dollar-quoted mutations.** `String.replace` treats `$$`
   in the replacement as an escape, so `as $$` became `as $`. Mutations reported `IMPRECISE` as if
   badly written when the harness was mangling them. One-line fix.

**Stated limitations:** advisory lock ships with zero coverage (untestable in single-connection
PGlite); the checkpoint is anchored but **unsigned** (no `pgcrypto`), so it does not constrain the
owner; RLS is enabled, not forced; `actor_role` remains self-asserted at write time (WP-04).

## WP-12/13/14/15 · Engine hardening — **COMPLETE** (report: `wp-engine-harden.md`)

All 7 criteria met. 104 → **124** Python tests.

- **WP-12** newest selectable version wins, in both the risk and baseline passes. Broke zero tests,
  as predicted. **E3b deliberately deferred** with a code comment explaining why.
- **WP-13** baseline pass regrouped by clause id; a clause with no selectable version now emits an
  unresolved, gating decision reusing the risk pass's existing vocabulary instead of inventing new
  terms.
- **WP-14** the refuted premise was **not** implemented — no billion-laughs mutation, no
  `defusedxml`. Real fixes measured: zip bomb 49 KB → 40 MB refused at **32 MB peak vs 85 MB
  unguarded**; nesting 1.3 M elements refused in **0.03 s vs ~5 s and ~350 MB unguarded**. Both
  asserted with real bounds, not just "raises".
- **WP-15** recursion through `w:hyperlink`, `w:sdt`, `w:smartTag` as an **allow-list** — so a
  tracked *formatting* change cannot masquerade as a text redline. Moves read as delete + insert.
- **Scope correction confirmed:** the emit path and the zero-authored-characters claim were never at
  risk. **S10 is safe**; that test is untouched and green.

**Deviation, correctly reasoned:** the nesting fixture is 14 MB, not the 33.6 MB the plan named — at
33.6 MB the *size* cap fires first and the nesting mutation would have been **inert**.

**Limitation:** Word is unavailable here, so fixtures are hand-built ECMA-376 markup, labelled as
such. No Word fidelity is claimed.

**Carried forward:** stored `result_hash` values will not replay (WP-32's engine pin); a lapsed
baseline clause in a manifest-named category now yields two run decisions — a reporting choice left
open for WP-27.

**Verify:** 7/7 suites (154 assertions), 124 Python tests, **23/23** and **34/34** mutations caught
by their named test, exit 0.

---

## WP-05/06/07/08 · Database enforcement — **COMPLETE** (report: `wp-db-enforce.md`)

All criteria met. 17 mutations added, each firing via its named test.

- **D4** `reviewer` immutable on approved versions; un-retiring refused with the correct next step
  named; both directions of the retired flag audited; conflict-rule `effective_on` frozen.
- **D1+D6** the adjudicated remedy shipped: column-level `grant update (promoted_to_clause)` plus
  permissive *and* restrictive UPDATE policies, `security invoker` kept. **Promotion now runs as a
  real `cw_legal_admin` end to end**; double promotion raises; `vendor_text`/`approved_by` rewrites
  are denied. A `cw_legal_reviewer` cannot promote by spoofing `cw.role` — tested with the EXECUTE
  grant deliberately *given* to them, so table privileges alone hold the line. **Mutation #6 is
  invisible to an owner-run test; it exists only because the test runs as the real role.** Mutation
  #8 neuters the trigger rather than the grant, per the Gate 3 warning. Severity is now derived from
  the position conceded against, so a High concession mints a High clause.
- **D5** floor lookup filters on severity and orders deterministically; the legitimate Standard
  rung-2 concession is accepted again; a rung with no floor behind it raises; `ladder_id` and the
  floor in force are recorded; published rungs immutable.
- **D7** filing the signed contract moves status via a `security definer` trigger; illegal
  transitions raise; every move is audited. `LIFECYCLE-ARCHITECTURE.md:296` reconciled — the schema
  won, and only that row was edited.

**Deviations, each reasoned:** severity derived from `cw.clause` rather than a new `not null` column
(avoids six statements of fixture churn); a permissive policy ships alongside the restrictive one
(restrictive alone grants nothing); the no-ladder raise fires on the rung path only.

## WP-09/10/11 · Ladder status, the write seam, the manifest boundary — **COMPLETE**
(report: `wp-seam.md`)

All criteria met. pytest 124 → **146**. New `writer-sql.test.mjs` (15) and `test_manifest.py` (12).

**The real mismatch list is two, one in each direction** — not the nine the planner claimed:
M1 `snapshot_rows` emitted the label into `category_key`; **M2, the keystone**,
`snapshot_from_rows` hashed the stored key as `Ladder.category`, so the id moved on round trip even
after M1 was fixed. Three further seam defects that are not name mismatches were found and fixed
(status reset to "intact"; a zero-rung ladder vanishing; a rung with no member defaulting silently —
the last two now raise). **M7 refuted and not implemented** — `0002:26` already permits `'Baseline'`.
No new mismatch found.

**Ladder status is derived, not stored** — no new table, no new column, as adjudicated. The
derivation mirrors `cw.ladder_health`'s precedence and the node suite asserts it equals the real
view, so drift is answered rather than accepted.

**Limitation stated honestly:** `check_manifest` has no production caller because no service layer
exists yet, so criterion 4 rests on the docstring contract at that boundary.

## Defect in my own WP-01 helper, found by an implementer and fixed

`roles.mjs` reset the role but left `cw.role` / `cw.actor` set to its own values, silently
re-attributing every later audited write in the calling suite — it broke an unrelated assertion in
`registry.test.mjs` and pointed at the wrong test. `as()` now snapshots both settings and restores
them in `finally`. The instrument leaves no trace. Re-verified green.

**Verify:** 8/8 suites (204 assertions), 146 Python tests, **40/40** and **43/43** mutations caught
by their named test, exit 0.

---

## WP-04 · Identity narrowed to the connection — **COMPLETE** (report: `wp-04.md`)

All 5 criteria met. `cw.app_role()` now derives from `current_user`, **not** `pg_has_role` — a
superuser is an implicit member of every role, so `pg_has_role` would have handed the owner
`legal_admin`. That is a subtle trap the implementer caught and avoided.

**Better than the package asked for.** Criterion 2 was written to allow "document the residual", but
attribution was **genuinely fixed**: a new restrictive INSERT policy on `cw.audit_event` requires the
recorded `actor_role` to equal the connection's real role. Previously the three roles holding INSERT
could hand-write any authority they liked into the log.

Also fixed, and not in the plan: **a read-policy bypass** — a requester claiming `auditor` could
read rival deals. Half the table grants never covered it.

**Residual, stated loudly in `0001` and `ARCHITECTURE.md` §5:** `actor` — the *person's* name — is
still self-asserted, because the five roles are shared service accounts; binding it in policy would
be theatre. Plus the pooling incompatibility. The scheme is a wall against application roles, not
against the owner.

**`U3` applied as written** — no escape hatch needed. Exactly three tests broke and all three were
migrated onto real roles, which is the discipline WP-01 exists to enforce.

**Deviation:** one assertion in `ladder.test.mjs` changed — the reviewer-spoof test previously
required the refusal to say `permission denied`, but the authority check now fires first. Both walls
are now asserted separately, so this is a net gain of one assertion, not a weakening.

## WP-20/21/22 · Specification repairs — **COMPLETE** (report: `wp-specs.md`)

- **WP-20** the grammar is written as new **CLA §4A** — lettered, not numbered, so every existing
  `§5`–`§11` cross-reference in the repo stays valid. Nice touch. `NEGOTIATION-ARCHITECTURE.md:182`
  now cites §4A instead of §4 (Concessions). It lifts what already exists rather than inventing a
  rival grammar. Three genuine gaps closed: namespace defined, case sensitivity written down
  (already enforced at `0004:21`, so it needed recording not enforcing), and empty-primitive
  illegality **marked specified-not-yet-enforced** with a precise handoff to WP-23.
- **WP-21** five roles everywhere, matching the backend's actual roles. CLA §3 now says a machine
  **proposes, never settles**; §7's table splits "Propose" (automatic) from "Approve" (Requester +
  assigned attorney + configured Required Approvers). **The scaling claim is reduced, not reworded**
  — ladders remove the drafting and research, not the approval. The implementer found the same
  contradiction repeated in `docs/open-questions.md` §9 and in CLA §4 and §8 (`approved_by` was a
  third contradicting statement the review never counted) and fixed those too.
- **WP-22** legal hold specified; e-signature brought *up to* the code, with only the
  completion-certificate bytes and per-signatory records flagged as gaps; masters/SOWs modelled
  honestly ("structure can be modelled, obligations do not exist yet"); renewal written as a neutral
  two-option card.

**Owner decisions surfaced, none settled:** `U1` renewal baseline (proposal's default recorded, the
alternative reachable, and the false "violates ADR-0009" claim explicitly retired), `U2` SOW may not
contradict its master (stricter default), `U3`, `U4` (Legal owns the threshold; the system measures
and never chooses). All four recorded in `docs/open-questions.md`.

**Orchestrator note:** this implementer reported verify at 6/8 as a blocker. That was a mid-flight
artefact — WP-04 was still landing in the same suites. Re-verified after both completed: **8/8, exit
0.** Not a real blocker; recorded because the report says otherwise.

**Follow-up done by the orchestrator:** WP-04 flagged stale prose in `0003` (two places) still
claiming the role check "reads a session variable any client can set". Corrected — the decision to
keep `security invoker` still stands, but now for the better reason (a caller-rights function cannot
exceed the caller, so privileges and RLS stay in force underneath it).

**Verify:** 8/8 suites (215 assertions), 146 Python tests, **43/43** and **43/43**, exit 0.

---

## WP-23/24/25 · The sweep — **COMPLETE** (report: `wp-sweep.md`)

Coherence constraints, the rule-grammar CHECK, engine smalls, indexes/TRUNCATE/loud DELETE. The
implementing agent was interrupted mid-write-up; the **code was complete**, the record was not. The
report was finished on 2026-07-26 by re-verifying every claim against the tree rather than
reconstructing from the packet.

**Three fixture sites corrected, not two** — Gate 3's correction C-2 was right. The third
(`ladder.test.mjs:213`, a Liability ladder built from Data Privacy clauses) would have thrown for
the *wrong reason* under the new constraint and reported green. A false green found on the way out
of a project whose entire subject is false greens.

**No assertion weakened:** none of the three tests asserted rung severity or category. New seed
clauses were required, not ID swaps.

## Owner decisions settled — 2026-07-26 (migration `0012`)

The user answered all four. Three matched what shipped and became settled records. **`U2` changed
the design:** a work order may now depart from its master **with the same approval a concession
needs**, granted one category at a time, with the departure still reported.

`0012_sow_override.sql` — proposal, append-only approvals, gated settlement, and
`cw.sow_override_in_force` as the only thing that authorises anything. A machine may propose a
departure; it may never approve one. Fails closed with no attorney assigned.

**Orchestrator error, caught by the tests:** my first version of the guard rewrote logic that
already lived in a table CHECK constraint and changed two error messages asserted by name. Four
tests failed immediately. Restored `0006`'s logic byte-for-byte and added only the new branch.

Three new mutations attack the decision specifically: the gate opening for everyone; a merely
*proposed* departure treated as authorised; settlement proceeding with signatures missing.

## Harness parallelised — 2026-07-26

`npm run verify` had outgrown the 10-minute tool ceiling, and I was working around it rather than
fixing it. Both mutation harnesses now run their breakages concurrently (7 lanes); every mutation
was already fully independent, so serialising bought nothing but wall-clock. Output stays in fixed
order so runs remain diffable.

**> 10 min (killed) → 5m08s, exit 0.**

Running it end to end immediately surfaced **two `SKIP`s** — mutations orphaned by the sweep's SQL
edits, meaning two protections had no working check behind them. Exactly Gate 3's correction C-1,
and invisible for as long as the full harness was being worked around.

---

# Final state

| | Baseline (2026-07-25) | Now |
|---|---|---|
| Database suites | 5 | **11** |
| Database assertions | 120 | **366** |
| Engine tests | 104 | **161** |
| Database mutations | 15 | **72** |
| Engine mutations | 24 | **49** |
| Mutations scored by the *wrong* test | counted as passes | **fatal** |
| `npm run verify` | exit 0 | **exit 0** |

**Findings:** D1–D9 and E1–E8 all closed, plus one HIGH nobody had found (`cw.audit_event` had no
row-level security at all). E3b deliberately deferred and recorded.

**Where the review was wrong, recorded rather than quietly followed:** E6's entity-expansion threat
was already blocked by the parser, so building that guard would have added a check that could never
fail; E5 was overstated and the zero-authored-characters claim was never at risk; E2 named nine seam
mismatches and there was one plus its mirror image. Two "missing document" findings were simply
stale.

**Residuals, stated in the migrations and in `docs/spec-vs-implementation.md`:** unsigned audit
checkpoint; untested advisory lock; the actor's *name* still self-asserted; identity incompatible
with transaction-mode pooling; `check_manifest` has no production caller; redline fixtures are
hand-built, not Word output; retention gates the destruction decision but does not destroy bytes;
master/SOW is structure only, because obligations do not exist.

**Gates:** 1 pass · 2 pass · 3 **fail → remediated → pass** · 4 pass · 5 pass · 6 pass.
