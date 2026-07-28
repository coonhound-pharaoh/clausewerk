# Objective Contract — Clausewerk defect remediation

**Workflow ID:** cw-fix-2026-07-28
**Created:** 2026-07-28
**Stage reached at authoring:** Gate 1

## Objective

Produce an optimized Revision Plan and an ordered set of single-owner Work Packages that
remediate every defect recorded in `bug_report.md` (B1–B9) together with the open security
finding A-1 from `audit_results.md`. The deliverable is the plan and the packages —
**not** the code changes.

## Mode

`mixed`.

Predominantly code (Python doorway, PostgreSQL migrations, pytest suites), but the repository's
own rules make documentation load-bearing rather than incidental: `CLAUDE.md` requires that
important decisions and their rationale be recorded as individual entries in `memory.md`, and the
migration files carry rationale headers that are treated as part of the change (see the header of
`0031_the_renewal_shortcut_asks_whose_deal_it_is.sql`). A fix that lands without its rationale
record is an incomplete fix in this repository.

## Rigor

`standard` — three independent planners, three focused red-team reviewers, one integrator,
one work-package author, one work-package reviewer.

## Stopping point

`work packages` (Gate 3). No implementation, no file edits to product code.

## Target materials

**Defect sources (authoritative inputs):**
- `bug_report.md` — B1…B9
- `audit_results.md` — finding A-1 (A-2, A-3, D-1, D-3 are context; only A-1 is in scope by the
  user's instruction, though planners may recommend bundling and must justify it if they do)

**Implicated source:**
- `backend/doorway/refusals.py` — B1 classification gap
- `backend/doorway/writes.py` — B1 boundary validation, B7 `required_if`
- `backend/doorway/executions.py`, `backend/doorway/runs.py` — B1 parameter binding, B5, B6
- `backend/doorway/advisory.py` — B2 transaction placement
- `backend/engine/manifest.py` — B3 unrecorded coercion
- `backend/doorway/documents.py` — B4 invariant to be pinned by a test
- `backend/doorway/manifests.py` — B5, B6
- `backend/doorway/app.py`, `backend/doorway/sessions.py` — B8
- `backend/doorway/conftest.py`, `backend/doorway/setup.py`,
  `backend/db/migrations/0016_doorway_login.sql` — B9
- `backend/db/migrations/0032_session_store.sql` — A-1
- `backend/doorway/db.py`, `backend/doorway/identity.py` — A-1 surrounding contract

## Non-goals

- Implementing any fix.
- Line-by-line audit of the 11,000 lines of migration policy logic (explicitly out of scope per
  `bug_report.md`'s closing scope note).
- Fixing A-2, A-3, D-1 or D-3 from `audit_results.md` unless a planner shows a package cannot be
  bounded without them.
- Any change to contract content, clause language, or example data — placeholder by owner
  instruction (`CLAUDE.md`).

## Hard constraints

1. **The repository's house rules bind the plan.** `CLAUDE.md`: prefer simple concise solutions;
   record decisions in `memory.md`; never test content or wording; the system's job ends at making
   a gap visible.
2. **Never test wording.** Acceptance criteria must assert behaviour, never message text. The
   repository has been bitten by this five times in one day (`CLAUDE.md`).
3. **No second copy of a rule.** The codebase's stated central vulnerability is drift between two
   copies of one rule. A fix that adds a Python check duplicating a database rule is a defect, not
   a fix.
4. **No privileged connection in the serving path** (`db.py`). No fix may introduce one.
5. **Append-only tables stay append-only.** No fix may add UPDATE or DELETE to the audit chain.
6. **Migrations are forward-only and numbered.** `0032` is untracked and unapplied; whether A-1 is
   fixed by editing `0032` or by adding `0033` is a real decision the plan must make and justify.
7. Packages must be single-owner and must not mutate the same file concurrently without sequencing.

## Success criteria

1. Every defect B1–B9 and A-1 maps to exactly one work package, or is explicitly and justifiably
   deferred.
2. Each package names its target files, its acceptance criteria, and how it is validated.
3. Acceptance criteria are executable — a test that can be run, not a claim to be believed.
4. Package ordering respects real dependencies (notably: B1 changes `refusals.py`, whose behaviour
   several other packages' error paths depend on).
5. Approval-sensitive decisions are surfaced, not silently decided — specifically the A-1 fix
   approach and any migration choice.
6. No package requires weakening or deleting an existing passing test to succeed.

## Assumptions (Gate 1)

| ID | Assumption | Tag | Basis |
|----|-----------|-----|-------|
| A1 | Stopping point is work packages; the user reviews before any code changes. | Observed | User's wording: "a Revision Plan including Work Packages". |
| A2 | B9 (test-harness collision) is in scope — "all the bugs" includes it. | Inferred | It is a numbered finding in `bug_report.md`. |
| A3 | `standard` rigor is proportionate. | Assumed | User said "optimize"; no rigor stated. Security-sensitive content argues up; a plan-only deliverable argues down. |
| A4 | Migration `0032` is not yet applied to any production database. | Observed | Untracked in git, so never committed or deployed. |
| A5 | Another session is committing to `main` concurrently. | Observed | Two commits and several file changes landed during the preceding audit. Packages must be rebase-tolerant and must not assume exclusive file ownership. |

## Approval-sensitive decisions deferred to Gate 2

- **A-1 fix approach**: a dedicated database lookup role (larger, structurally correct) versus an
  actor-scoped RLS policy (smaller, no Python change). Both were sketched in `audit_results.md`;
  the integrator must adjudicate on evidence and the user must approve, because either is a
  security-sensitive database migration.
- **B1 fix location**: widen `refusals.classify` (one file, covers every current and future
  endpoint) versus validate field shape at the boundary in `Write.bind` (better message, but three
  call sites bind parameters outside it). Not mutually exclusive.
- **Whether `0032` is edited in place or superseded by `0033`.**

## Evidence rule

Every major claim in every downstream artifact is tagged `Observed`, `Inferred`, `Assumed`, or
`Unresolved`. `Observed` requires a file path and, where possible, a line reference or quoted
command output. The integrator may not promote an `Assumed` or `Unresolved` claim to `Observed`.

## Gate 1 status

**PASS with disclosed assumptions.** Objective, mode, targets, stopping point and scope boundaries
are stable. Assumptions A2, A3 and A5 are disclosed rather than resolved; none changes what the
planners must do, and all are correctable at Gate 2 before anything is built.

## Prior-run note

`.adversarial-workflow-agentic/` already held a completed run from 2026-07-25/26 plus two dated
work-package folders. This run was given its own dated folder rather than overwriting those
artifacts, matching the existing convention.
