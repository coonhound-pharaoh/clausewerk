# ADR-0012 · The doorway runs on standard PostgreSQL, and is written in Python

**Status:** accepted, 2026-07-26 (owner)
**Supersedes in part:** the deployment note in `ARCHITECTURE.md` §5 and the note
above `cw.app_role()` in `0001_foundation.sql`, both of which overstate the
pooling constraint. See §5.

---

## Context

The service layer had been built in JavaScript (WP-U05 … WP-U09) against PGlite —
PostgreSQL compiled to WebAssembly, running inside the process. That was the
right call for the schema work: it needs nothing installed, so every test runs
the real DDL, constraints, triggers and row-level security rather than a mock.

Two costs came with it, both disclosed in the code rather than discovered later:

- `pgcrypto` is unavailable, so `cw.audit_checkpoint` ships **anchored but
  unsigned** (`0007_audit_chain.sql`).
- PGlite is single-connection, so the advisory lock guarding the audit chain
  against a fork has **zero test coverage and cannot get any**
  (`0001_foundation.sql`), and the JavaScript service had to serialise all
  requests onto one connection through a promise queue.

The third cost was structural: with one connection there is no second checkout,
so no test could establish whether a request's identity outlives the request. The
JavaScript doorway's own comments said its clean-up was "a second line, not the
mechanism", and nothing could prove otherwise.

## Decision

**1. Run standard PostgreSQL.** Version 18, pinned to match what PGlite reported,
via `backend/docker-compose.yml`. This is a change of packaging, not of database:
all fifteen migrations applied unchanged on the first attempt.

**2. Write the doorway in Python**, replacing the JavaScript service layer. The
engine is already Python; the doorway joins the parts that must be provably
correct rather than the parts that render.

**3. The doorway connects as `cw_app`** (migration `0016_doorway_login.sql`): a
member of all six application roles, `NOINHERIT`, no table privileges, no LOGIN
until a deployment grants it. Membership therefore confers nothing until a
request issues `SET LOCAL ROLE`.

**4. Mechanism C from the plan** — one transaction per request, `SET LOCAL ROLE`
and `set_config('cw.actor', …, true)`. Both are unwound by PostgreSQL at COMMIT
and at ROLLBACK, before the pool releases the connection. There is no clean-up
code, deliberately: clean-up code can fail to run.

## Consequences

**Gained.** `pgcrypto` is available, so the checkpoint can be signed (not yet
done — separate work). Concurrency is real, so the audit-chain advisory lock
becomes testable. The pool is real, so the leak test the plan names as "the first
test to write" is a genuine test rather than an approximation — and it exists:
`doorway/test_no_identity_survives.py`.

**Lost.** The database is now software to run, install and pay for. Tests need it
running, and each doorway test rebuilds the schema (~0.84s) to stay
order-independent.

**Discarded.** The JavaScript service layer and its 30 tests. The owner took this
decision knowing the price, having been shown that the work existed and was
sound; the handoff document had recorded the workstream as "not started".

## What the mutation checks established

Three, run deliberately, with what each taught:

1. **Swap `SET LOCAL ROLE` for `SET ROLE` and the transaction-scoped setting for
   the session-scoped one.** Caught by
   `test_a_returned_connection_carries_no_role_and_no_actor` — and by that test
   alone. The failure and refusal cases survive it, because PostgreSQL unwinds
   even a session-scoped `SET ROLE` on ROLLBACK. **The leak appears only on the
   path that succeeds**, which is the one nobody thinks to check.

2. **Read `cw.account.role` instead of `cw.effective_role`.** Caught by four
   tests, led by `test_a_pending_countersign_confers_nothing`, which is written
   to assert the two columns genuinely disagree so it cannot become tautological.

3. **Remove `NOINHERIT` from migration 0016.** Two misses before this landed
   precisely, both recorded in the test file. Setting the live role by hand
   catches nothing — the fixture rebuilds the schema and the migration repairs it
   first, which is trap 4.3 exactly. Removing it from the migration stops the
   whole suite at setup, because `prepare()` refuses to ready a database whose
   doorway login would hold six roles at once. That refusal is deliberate and now
   has its own named test.

## Correction carried out of the plan

`ARCHITECTURE.md` §5 and `0001_foundation.sql` both say the design is
"incompatible with transaction-mode connection pooling". **That is an
overstatement.** It describes the session-scoped setting the test harness uses —
correct *there*, since a test process is one client that never shares a
connection — not a limit of the design. The requirement is one authenticated
identity per unit of work, which `doorway/db.py` satisfies and
`doorway/test_no_identity_survives.py` checks. Both notes should be corrected;
they were another agent's files at the time of writing and were flagged rather
than edited.
