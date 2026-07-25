# Clausewerk backend

The deterministic core. This is the half of the system that must be provably
correct and uses no AI at all.

**Status:** clause registry, fallback ladders and the concession record built and
verified. Resolution engine and document service not yet started.

## Running it

```bash
npm install
npm run verify
```

`verify` runs the test suite and then the mutation check. Both must pass.

There is **no database to install**. Tests run against
[PGlite](https://pglite.dev) — real PostgreSQL compiled to WebAssembly — so the
DDL, constraints, triggers, views and row-level security are genuinely executed,
not mocked. Same SQL will run on Supabase unchanged.

## What's here

```
db/migrations/
  0001_foundation.sql             roles, append-only hash-chained audit log
  0002_clause_registry.sql        categories, clauses, immutable versions, supersession
  0003_ladders_and_concessions.sql  fallback ladders, concessions, promotion, analytics
db/test/
  registry.test.mjs         34 tests
  ladder.test.mjs           29 tests
  mutation-check.mjs        12 mutations — proves those tests can fail
```

## The design in one page

**Clause identity is separate from clause content.** `cw.clause` holds the ID a
contract refers to (`DP-H-014`). `cw.clause_version` holds the wording. Wording
is never edited — a database trigger refuses it — so an agreement executed under
version 1 still resolves version 1 forever. Retiring is the single permitted
mutation, and it requires a reason.

**Validity is computed, never stored** (ADR-0006). `cw.clause_version_state`
derives four states:

| State | Meaning |
|---|---|
| `active` | current approved position |
| `superseded` | replaced by a newer version |
| `retired` | withdrawn, not replaced |
| `expired` | lapsed on its own date |

`superseded` and `retired` are deliberately different, because "replaced by
something better" and "withdrawn" are different answers to an auditor
(ADR-0009).

**`selectable` is the column resolution actually asks.** It is not the same as
`state`: a superseded clause set to `run_off` stays usable until its own expiry,
which is how a replacement can be phased in without invalidating live
negotiations.

**Dates are nullable on purpose.** A clause with no approval date is *not*
expired — it is unprovenanced, flagged `provenance_gap`, and still selectable.
Fabricating a creation date is precisely what birth-expired 54 clauses in the
prototype (spec-vs-implementation finding #8), and doing it in the database
would hide the same problem again.

**The audit log cannot be edited by anyone.** Not by `legal_admin`, not by the
application. `UPDATE` and `DELETE` are granted to no role at all, so the
restriction survives a wrong row-level policy or a compromised application. Rows
are hash-chained, so editing one at the database level still breaks
`cw.audit_verify()` — the test suite proves this by performing exactly that
attack.

**Row-level security carries the five roles** from ADR-0008. Everyone who is
authenticated may read clause text; only `legal_admin` may change the library;
`viewer` cannot read the audit log at all, because it names who conceded what.

## Ladders and concessions

**A ladder is a pre-approved retreat path** — rung 0 is the preferred position,
the last rung is the floor. Every rung is ordinary approved clause text, so a
ladder is metadata over clauses rather than a new kind of content. Rungs must be
contiguous from 0 (or "descend one rung" is meaningless) and exactly one must be
the floor.

**Below the floor, an override is mandatory.** Enforced by trigger, because the
rule depends on the ladder's floor and a check constraint cannot reach another
table. Accepting vendor wording outright requires an override too.

**An expiring rung degrades a ladder; it does not silently collapse it.**
Whether a ladder should close up when a middle rung lapses is deliberately
undecided (CLA §11 q4), so `cw.ladder_health` reports `intact` / `degraded` /
`floor_unusable` / `floorless` / `empty` and leaves the decision to the caller.
Silent collapse would quietly lower our floor.

**Conceded vendor wording is quarantined.** It lives in `cw.concession`, is
referenced by no selectable view, and is not in the clause library at all. The
only route in is `cw.promote_concession()` — a deliberate `legal_admin` act that
mints a normal clause version marked `provenance = 'promoted'` with a
`Policy-DERIVED-*` citation, and refuses to run twice on the same concession.
This is ADR-0009: accepting a vendor's ask is a concession, not a library change.

**The analytics are plain counting.** `cw.concession_rate` and
`cw.library_proposal` aggregate what we actually gave away, and propose library
changes with the evidence attached. No model is involved and none writes text.

**Concession data is the most sensitive thing here** — an aggregate of exactly
what we concede under pressure. Legal and Audit see all of it, a Requester sees
only their own deals, and a Viewer sees none of it.

## Why there is a mutation check

A test suite that has never failed proves nothing. `mutation-check.mjs`
deliberately breaks one guarantee at a time — removes the unique constraint on
category short codes, makes clause bodies editable, lets expired clauses be
selected — and asserts the suite catches each one.

It has already earned its place three times:

- Two tests referenced clause versions that did not exist, so they failed on a
  foreign key rather than the rule under test — and would have kept passing if
  the rule were deleted.
- The "a viewer cannot read concessions" test was passing for an **accidental**
  reason. The row-level policy's subquery touched `cw.agreement`, which viewers
  cannot read, so the denial named the wrong table. The policy now uses a
  `security definer` ownership function, and the test asserts the denial names
  `concession` specifically.

## Mapping to the specifications

| Guarantee | Source |
|---|---|
| Versions immutable, validity computed | [ADR-0006](../docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md) |
| Five roles, recorded overrides | [ADR-0008](../docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| Four states, supersession is a deliberate act | [ADR-0009](../docs/decisions/ADR-0009-concession-is-not-supersession.md) |
| Unique category short codes; expired clauses unselectable | [spec-vs-implementation](../docs/spec-vs-implementation.md) findings #1, #4, #8 |
| Append-only, tamper-evident audit | [ARCHITECTURE.md](../ARCHITECTURE.md) §5 |

## Next

1. **Resolution engine** — the pure function, in Python, reading
   `cw.selectable_clause` and descending a ladder when a vendor pushes back.
   Must pin a library snapshot *and* the ladder configuration per run, or the
   same manifest resolves differently next quarter and the determinism
   guarantee is lost (CLA §9).
2. **Document service** — Python, `python-docx`, generation and tracked-change
   parsing.
3. **Agreement record** — `cw.agreement` is currently the minimal subset needed
   by concessions. [LCMA](../LIFECYCLE-ARCHITECTURE.md) §5 extends it with the
   snapshot pin, decision set, term and status machine.
