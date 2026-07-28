# Revision Plan — Clausewerk defect remediation

**Date:** 2026-07-28
**Covers:** B1–B10 (`bug_report.md`) and finding A-1 (`audit_results.md`)
**Stage reached:** Gate 3 — Work Packages
**Gate 3 verdict:** **PASS WITH CONDITIONS.** No blocking issues remain. Three conditions must be
settled before implementation; one of them (C3) is already applied.
**Method:** adversarial workflow — 3 blind planners, 3 red-team lenses, 1 integrator, package
author, package review, then a remediation pass and an independent re-review. 11 agents.
**Not done:** no product code was changed. This is a plan.

Durable artifacts: `.adversarial-workflow-agentic/2026-07-28-defect-remediation/`

---

## What the review changed about the problem

Before the plan, four things about the defect list turned out to be wrong. Three were mine.

**1. The verification gate is already red — and nobody knew.** `python backend/doorway/mutation_check.py`
exits 1 on the untouched tree. Four of its 36 checks point at code that no longer exists. But it
aborts *before running anything*, so it is not four unchecked guarantees — **all 36 are
unevaluated**, and `npm run verify` has been red on `main`. One of the four was already stale on
committed `main` before the recent session work. This is now **B10**, and it is package one.

**2. B3 was not a bug.** `engine/test_manifest.py:112-125` is a passing test asserting exactly the
behaviour I reported as defective, with its reason written into the assertion. Implementing the
"fix" would have deleted a regression guard against silent High-to-Standard downgrades — the defect
that code's own comment records as having already happened once. Withdrawn; it survives as a
documentation question with no code (**WP-002**).

**3. My B1 fix would have inverted the bug it fixed.** I proposed treating a database error with no
error code as the caller's fault. Re-running the driver found three causes of that condition, two of
which are *our own* SQL bugs. The fix would have told users they had made a mistake about our bug —
precisely the failure B1 objects to, running backwards. The branch is narrowed to adaptation failure
and carries a test proving our own bugs still report as ours.

**4. Both A-1 options were under-costed.** The "minimal" fix is forgeable — nothing reserves the
name `__signin__`, so an administrator could create an account with it and read every session key.
The "structurally correct" fix **breaks sign-in at runtime** after the migration lands, because a new
role returns NULL from `cw.app_role()` and fails the account-read policy; making it work needs a
further migration that widens every policy phrased `app_role() is not null`. Neither is a clean win.
Both are now costed honestly and go to you as a decision (**WP-011**).

A fifth thing the review found that no report had: a **third** location for B1, in `manifests.py:99`,
which every early package had excluded on a premise that turned out to be false. It was traced hop by
hop and confirmed twice.

---

## Strategy

> Repair the instrument, then fix the defects behind it, then decide the things no amount of code
> reading can settle.

- **Phase 0 — restore the gate.** WP-001, blocking. Nothing downstream can honestly claim a green
  check until the harness runs.
- **Phase 1 — the classification floor.** WP-003 (B1 + B7) lands next, because several later
  packages' error paths run through `refusals.classify`.
- **Phase 2 — parallel, single-owner.** WP-004 through WP-009 proceed independently where files do
  not collide.
- **Phase 3 — approval-gated.** WP-011 (A-1) ships with its boundary test, behind three decisions.

Two items are **deferred with reasons rather than smuggled in**: real row-level security on the five
snapshot/ruleset tables (WP-012), and a checksum column on the migration ledger (WP-013).

---

## The packages

| ID | What it does | Prereqs | Owner decision? |
|----|--------------|---------|-----------------|
| **WP-001** | Repair the doorway mutation harness — B10 | EXT-1 (see below) | one (4th row) |
| **WP-002** | B3 — decide if a case-variant severity belongs in `coerced`. **No code.** | none | **yes** |
| **WP-003** | B1 classification floor + B7 `required_if` — `refusals.py`, `writes.py` | WP-001 | no |
| **WP-004** | B1 residual — the **two** bind sites outside `Write.bind` | WP-003 | no |
| **WP-005** | B5 unguarded `reasons[0]` (4 sites) + B6 f-string audit events (3 sites) | WP-004 | no |
| **WP-006** | B2 — stop holding a transaction across the 20s model call | WP-003 | no |
| **WP-007** | B9 — stop the harness writing cluster-wide role state | WP-001, PRE-1 probe | no |
| **WP-008** | B4 — allowlist tripwire over the five unprotected tables | WP-001 | no |
| **WP-009** | B8 — stale rationale + two import defects | WP-001 | no |
| **WP-010** | Relocate `LOOKUP_ACTOR`/`LOOKUP_ROLE` without closing an import cycle | WP-009 | no |
| **WP-011** | **A-1** — remove the unscoped grant and `using (true)` policy | WP-010 | **yes ×3** |
| **WP-012** | *Deferred* — real RLS on the five tables | — | **yes** |
| **WP-013** | *Deferred* — checksum column on the migration ledger | — | **yes** |

**EXT-1** is an external blocker, now declared rather than buried: `sessions.py` is still modified and
uncommitted by a concurrent session, and three of WP-001's rows must quote text from it. The
`server.py` row and the fourth-row decision can start immediately; the two session rows cannot.

Migration numbers are allocated in the plan, not left to coordination: **WP-011 takes 0033**,
**WP-007 takes 0034** unconditionally, so neither waits on the other.

---

## Four decisions that are yours

Nothing below can be settled by reading more code.

**D1 · B3 — does a case-variant severity belong in `coerced`?**
The code, a passing test, and a mutation-check row all say no. The docstring's phrase "every real
rewrite" says yes. This is a judgement about what the `coerced` field is *for* on screen and in the
audit chain. **Recommendation: change the docstring, not the code.** WP-002 produces no code either way.

**D2 · A-1 — which fix?**
Dedicated lookup role (needs a second migration replacing `cw.app_role()`, after which the new role
satisfies every policy phrased `app_role() is not null` — containment falls back to table grants)
versus actor-scoped policy (no Python change, but leaves the grant standing and is bypassable via an
administrator-created `__signin__` account). **Both are more expensive than the audit said. Neither is
unambiguously safer.**

**D3 · Is `0032` edited in place, or superseded by `0033`?**
**This cannot be settled from git,** and the plan corrects my earlier claim that it could. `migrate.py`
ledgers by filename with no checksum and no re-application path, so any developer database where
`prepare()` has run since `0032` was written already holds that row and would **silently skip an
edited file** — while the fresh per-process test database reports green. The evidence needed is
`select filename from cw.schema_migration where filename = '0032_session_store.sql'` on every
developer database. My earlier "not yet applied" was tagged Observed; it is downgraded to Assumed.

**D4 · WP-001's fourth stale row.** Its guarantee has no line left to mutate and its named test was
deleted. Repoint it at a replacement guarantee, or retire it with a written reason? The harness's own
rule is that a guarantee leaves the suite with a reason or not at all — which makes it your call.

---

## Conditions before implementation

| | Condition | Status |
|---|---|---|
| **C1** | WP-003 and WP-004 disagree about the shared helper's exception, and WP-004's version does not work — the exception would escape to the last-resort handler and produce the 500 the package exists to remove. Specify one contract. | **open** |
| **C2** | WP-004 places its guard inside `manifest_from`, which silently narrows `POST /manifests/check` — and `runs.py:141-143` is a written decision *against exactly that*, nine lines above the call. Guard in `runs.py` instead, or overrule the comment deliberately and update it. | **open** |
| **C3** | The binding plan still contained the falsified `manifests.py:99` exclusion, contradicting the corrected package. | **applied** |
| C4 | Nine packages write `memory.md`; two authoring in parallel will claim the same entry number. Serialise it, or assign at merge. | recommended |
| C5 | Drop two volatile Observed facts that have already drifted (`memory.md` head, HEAD sha). | recommended |
| C6 | WP-001 exempts the `server.py` row from EXT-1 as "committed state" — true of the staleness, not of the repair; `server.py` is also uncommitted. | recommended |

C1 and C2 are two sentences of specification each. Neither requires re-planning.

---

## What was rejected, and why it matters

The integrator rejected **eleven** recommendations, several of which all three planners had
independently agreed on — which is exactly why they needed a probe rather than a vote. Beyond the
four corrections above:

- **A behavioural database test for B4** — cannot pass against correct code. `0005_run_store.sql`
  grants select on all five tables to requester and both Legal roles with no RLS, so a requester
  *can* reach them today.
- **Importing the lookup constants into `sessions.py`** — a circular import. `identity.py` already
  imports `sessions.py`. Hence WP-010 exists.
- **`python doorway/mutation_check.py` as a per-package criterion** — 36 mutations, each a copied
  tree and a fresh database, against a suite that rebuilds the schema per test. Tens of minutes to
  hours per package. *A criterion nobody can afford is a criterion that gets waived* — replaced by a
  two-tier gate: a seconds-long text preflight per package, the full harness per phase.
- **Deleting the harness's serial second pass** as a B9 benefit — it exists to cope with lane deaths
  from *many* causes; fixing one is not a reason to delete it.

The re-review also **upheld the package author's refusal of one of its own corrections**: the session
deletes are at `sessions.py:93` and `:114`, not `:112`. Refusing a reviewer on verified evidence is
what this gate is supposed to produce.

---

## Honest limits

- **Gate 3 passed with conditions, not cleanly.** C1 and C2 must be closed first.
- **No test suite was executed during planning.** The mutation-gate failure is Observed — I ran it.
  The claim that the rest of the suite passes is carried from `bug_report.md`.
- **Three open questions are registered and unowned:** whether `db/test/mutation-check.mjs` (the
  *first* harness `test:mutation` runs) is also stale — nobody probed it; whether the five
  snapshot/ruleset tables can carry `cw.run`-scoped policies at all, which decides if WP-012 is ever
  buildable; and audit finding D-2, which no package owns.
- **The tree moved throughout.** Assumption A5 is live, not theoretical — files changed between the
  planners' pass and the reviewer's. Every package is written to rebase cleanly.

---

## IMPLEMENTED 2026-07-28 — what actually happened

The four decisions below were answered by the owner and ten of the thirteen packages
were built. This section is the record of that; the plan above is left as written so the
two can be compared.

**Decisions, as settled.** D1: change the wording, not the code. D2: A-1 was first held, then
**fixed** once a working database was available to test the two options against — see below.
D3: `0032` is never edited; anything that changes it takes a new number. D4: retire the orphan
check with a written reason. All are recorded in `memory.md` as S96–S106.

**Conditions, closed on evidence rather than opinion.** C1: the shared helper raises.
C2: the guard went in `runs.py`, **not** in `manifest_from` — because `/manifests/check`
never passes that value to the database at all, so narrowing it would have changed an
endpoint for no benefit, against a written decision nine lines away.

**Built:** WP-001 through WP-011. **Not built:** WP-012 and WP-013, deferred as planned.

**A-1 is fixed (WP-011), and it did not cost anyone any access.** Migration `0033` scopes the
session table's policy to the sign-in *act* rather than the *role*, because sign-in and an
ordinary signed-in viewer arrive as the same database role — that is the entire finding. The
same migration reserves the name the policy trusts, without which the fix would have been
decorative: an administrator could otherwise have created an account with that name and read
every session key through the front door. The other option — a dedicated lookup role — was
rejected on evidence: it breaks sign-in at runtime *after* the migration lands, and repairing
that would leave containment resting on the very layer it was meant to replace.

All six demo accounts are unaffected, verified. The exposure ran the other way: `viewer` is
the role held by outside suppliers, and it could read the administrator's session key and sign
the whole company out.

**Evidence.** Engine suite 202 passed, unchanged. Doorway suite **723 passed, no failures and
no errors** — against 566 passed and 1 error before. (566 → 578 with the new tests for B9 and
B4, → 717 once B1 and B7 were covered across the whole write table, → 723 with the A-1
boundary tests.) The mutation gate, which had been red, now runs: **exit 0, 34 of 35
guarantees caught.**

**Two things worth your attention.**

**One defect was found in this work and fixed before it shipped.** The new guard raised an
exception that nothing caught, so a caller's typo would have gone on producing the exact
500 the guard exists to remove — the defect fixed, then reintroduced one layer up in the
same change. The 578-test suite did not catch it, because no test had ever sent a malformed
field to a write endpoint. That test exists now, and it fails without the fix.

**One new defect was found and is NOT fixed: B11.** With the gate finally running, one
guarantee scores MISS — "an outage is blamed on the caller" is not actually guarded. Removing
the branch still yields the same status code, so the test passes with the guarantee broken;
what the branch really protects is a sentence, and the house rule rightly forbids testing
sentences. Proven pre-existing, not caused by this work. Closing it needs either an
observable difference that is not wording, or a decision to retire the row — the same kind of
call as D4, and yours.

**One deviation from the packages, disclosed.** WP-007 was specified to add migration `0034`.
It does not, because a later migration cannot stop `0016` re-running on every fresh database,
and `0016` itself cannot be edited — its name is already in every ledger, so the edit would be
skipped exactly where it was needed. The retry lives in the migration runner instead. Measuring
also showed the migration's `grant` never contended at all, so that half of the package was
dropped rather than built against a problem that does not exist.

---

## Recommended next step

*Superseded — this was the next step before implementation, and it has been taken. Kept for
the record.*

~~Answer **D1** and **D4**, close **C1** and **C2**, and run the **D3 ledger query**. Then
implement **WP-001**.~~

**The next step now** is **B11** — decide whether the unguarded outage check can be given
something observable to guard, or should be retired with a reason. It is the only defect on
this list still open.

Two gaps are left recorded rather than closed, both smaller than B11: `db/test/` has no
SQL-side coverage of `cw.session` at all, so the A-1 guarantee is guarded by a Python test
only; and nobody has yet checked whether `db/test/mutation-check.mjs` — the *first* harness
`npm run verify` runs — is stale in the same way the doorway one was. That second one is
worth an hour, because the answer determines whether the SQL guarantees are being evaluated
at all.
