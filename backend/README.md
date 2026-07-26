# Clausewerk backend

The deterministic core. This is the half of the system that must be provably
correct and uses no AI at all.

**Status:** clause registry, fallback ladders, the concession record, the
resolution engine and the validation engine built and verified. Document service
not yet started.

## Running it

```bash
npm install
npm run verify
```

`verify` runs every suite and then both mutation checks. All must pass.
Requires Node and Python 3.10+ with `pytest`.

There is **no database to install**. SQL tests run against
[PGlite](https://pglite.dev) — real PostgreSQL compiled to WebAssembly — so the
DDL, constraints, triggers, views and row-level security are genuinely executed,
not mocked. Same SQL will run on Supabase unchanged.

## What's here

```
db/migrations/
  0001_foundation.sql             roles, append-only hash-chained audit log
  0002_clause_registry.sql        categories, clauses, immutable versions, supersession
  0003_ladders_and_concessions.sql  fallback ladders, concessions, promotion, analytics
  0004_conflict_rules.sql   clause tags and attorney-authored conflict rules
db/test/
  registry.test.mjs         35 tests
  ladder.test.mjs           29 tests
  loader-sql.test.mjs       16 tests — the engine's SQL against the real schema
  mutation-check.mjs        12 mutations — proves those tests can fail
engine/
  model.py                  frozen value types
  snapshot.py               content-addressed library snapshots
  resolution.py             the pure function, and ladder descent
  validation.py             conflict rules as data, and the gate
  loader.py                 the only module that knows both layers
  test_resolution.py        27 tests
  test_validation.py        21 tests
  test_loader.py            14 tests
  mutation_check.py         14 mutations
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

## The resolution engine

A pure function. No network, no database, no model — it takes a manifest and a
snapshot and returns decisions. It never produces contract language: it selects
an approved clause by reference, or reports that it cannot and says why
(ADR-0001). A test asserts every selected body is byte-identical to one already
in the snapshot.

**A snapshot is the frozen library plus the frozen ladders, identified by a hash
of its own contents.** That makes the reproducibility guarantee in
`ARCHITECTURE.md` §5 *checkable* rather than merely asserted: given a snapshot id
and a manifest, you can prove the decisions you get are the decisions someone
got two years ago.

Ladders are pinned as well as clauses, and that is not optional. Ladders change
which clauses are *eligible*, so pinning the clause library alone would let the
same manifest resolve differently next quarter (CLA §9). A mutation guards it.

**The snapshot carries every version, not only the usable ones.** That is what
lets a decision distinguish "there were three candidates and all had lapsed"
from "there were none" — different library problems needing different fixes.

**Descent escalates whenever it cannot be certain.** No ladder, a damaged
ladder, an unknown current position, a lapsed rung, or anything below the floor
all produce an escalation rather than a guess. The floor is absolute.

`loader.py` is the only module that knows both the database and the engine, and
it holds the two queries that build a snapshot. Because a renamed column there
would break resolution in production while both suites stayed green,
`db/test/loader-sql.test.mjs` extracts those queries from the Python source and
runs them against the real migrated schema.

## The validation engine

Conflict rules are **data, not code**, because attorneys author them
([open question 5](../docs/open-questions.md)). A rule cannot be a function,
because a function needs a developer.

So counsel tags approved wording — `jurisdiction:ny`, `indemnity:uncapped`,
`data:regulated`, `insurance:cyber` — and a rule is a small declarative
predicate over those tags. **No rule ever parses contract prose.**

The grammar has exactly three primitives, ANDed:

| Primitive | Fires when |
|---|---|
| `all_present` | every listed tag appears in the contract |
| `none_present` | none of the listed tags appears |
| `conflicting_values` | one tag namespace holds more than one distinct value |

Between them they express all four rules in `ARCHITECTURE.md` §2.5, including
the two awkward shapes: governing law versus dispute seat is
`conflicting_values: jurisdiction`, and regulated data with no cyber cover is
`all_present` plus `none_present` — a rule that fires on an *absence*.

Anything counsel cannot say with these needs a new primitive, added
deliberately. That friction is the design. An unbounded grammar would be a
programming language with no gate in front of it.

**The grammar is enforced in both layers.** A `CHECK` constraint rejects unknown
keys at write time (using jsonb key subtraction — check constraints cannot
contain a subquery), and `ConflictRule` raises `RuleGrammarError` at read time.
If either side drifts, a rule the engine cannot evaluate could be published.

**Rules are versioned and immutable, like clause wording.** Editing a published
rule would rewrite why past contracts blocked. Every finding cites the rule
version that raised it, `cw.active_conflict_rule` exposes the newest effective
version of each, and retiring is the one permitted mutation.

**Only High-severity findings close the gate**, matching the specification —
unlike the prototype, which blocked on any finding. An override opens the gate
and is recorded as an override; the findings remain, because an override
accepts a risk rather than erasing it.

Rule sets are content-addressed like snapshots, so a validation result names
both the library and the rules that produced it. Tags are pinned into the
snapshot for the same reason: retagging a clause changes which contracts block.

## Why there is a mutation check

A test suite that has never failed proves nothing. `mutation-check.mjs`
deliberately breaks one guarantee at a time — removes the unique constraint on
category short codes, makes clause bodies editable, lets expired clauses be
selected — and asserts the suite catches each one.

It has already earned its place five times:

- Two tests referenced clause versions that did not exist, so they failed on a
  foreign key rather than the rule under test — and would have kept passing if
  the rule were deleted.
- The "a viewer cannot read concessions" test was passing for an **accidental**
  reason. The row-level policy's subquery touched `cw.agreement`, which viewers
  cannot read, so the denial named the wrong table. The policy now uses a
  `security definer` ownership function, and the test asserts the denial names
  `concession` specifically.
- The engine's ordering test passed on `Snapshot.build`'s sorting alone and
  never exercised the engine's own normalisation. A second test now bypasses
  `build` and constructs a snapshot directly.
- **The floor was never actually tested.** The fixture ladder's floor was also
  its last rung, so deleting the floor check still escalated — via "ladder
  exhausted". A ladder may legitimately document positions below the floor
  (asks vendors make that we refuse), and reaching one must escalate. Now
  covered by a four-rung ladder with the floor at rung 2.

## Mapping to the specifications

| Guarantee | Source |
|---|---|
| Versions immutable, validity computed | [ADR-0006](../docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md) |
| Five roles, recorded overrides | [ADR-0008](../docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| Four states, supersession is a deliberate act | [ADR-0009](../docs/decisions/ADR-0009-concession-is-not-supersession.md) |
| Unique category short codes; expired clauses unselectable | [spec-vs-implementation](../docs/spec-vs-implementation.md) findings #1, #4, #8 |
| Append-only, tamper-evident audit | [ARCHITECTURE.md](../ARCHITECTURE.md) §5 |

## Next

1. **Run store** — persisting a resolution and its findings against the snapshot
   and rule-set ids that produced them. This is what turns reproducibility from
   a property of the engine into a property of the system.
2. **Document service** — Python, `python-docx`, generation and tracked-change
   parsing.
3. **Agreement record** — `cw.agreement` is currently the minimal subset needed
   by concessions. [LCMA](../LIFECYCLE-ARCHITECTURE.md) §5 extends it with the
   snapshot pin, decision set, term and status machine.

Deferred deliberately: a rule-authoring surface for non-developers. The grammar
is now small enough to put behind a form, but that is a frontend concern and the
backend contract it would write to is settled.
