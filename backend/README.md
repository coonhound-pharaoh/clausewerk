# Clausewerk backend

The deterministic core. This is the half of the system that must be provably
correct and uses no AI at all.

**Status:** clause registry built and verified. Resolution engine and document
service not yet started.

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
  0001_foundation.sql       roles, append-only hash-chained audit log
  0002_clause_registry.sql  categories, clauses, immutable versions, supersession
db/test/
  registry.test.mjs         33 tests
  mutation-check.mjs        proves those tests can fail
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

## Why there is a mutation check

A test suite that has never failed proves nothing. `mutation-check.mjs`
deliberately breaks one guarantee at a time — removes the unique constraint on
category short codes, makes clause bodies editable, lets expired clauses be
selected — and asserts the suite catches each one.

It has already earned its place: it caught two tests that were passing for the
wrong reason. Both referenced clause versions that did not exist, so they failed
on a foreign key rather than on the rule under test, and would have kept passing
if the rule were deleted.

## Mapping to the specifications

| Guarantee | Source |
|---|---|
| Versions immutable, validity computed | [ADR-0006](../docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md) |
| Five roles, recorded overrides | [ADR-0008](../docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| Four states, supersession is a deliberate act | [ADR-0009](../docs/decisions/ADR-0009-concession-is-not-supersession.md) |
| Unique category short codes; expired clauses unselectable | [spec-vs-implementation](../docs/spec-vs-implementation.md) findings #1, #4, #8 |
| Append-only, tamper-evident audit | [ARCHITECTURE.md](../ARCHITECTURE.md) §5 |

## Next

1. **Ladders and concessions** — [CLA](../CLAUSE-LIBRARY-ARCHITECTURE.md) §3–4.
   Concessions must be quarantined so vendor text can never become selectable.
2. **Resolution engine** — the pure function, in Python, reading
   `cw.selectable_clause`. Must pin a library snapshot per run so a result is
   reproducible forever.
3. **Document service** — Python, `python-docx`, generation and tracked-change
   parsing.
