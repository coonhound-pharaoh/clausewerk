# Clausewerk backend

The deterministic core. This is the half of the system that must be provably
correct and uses no AI at all.

**Status:** clause registry, fallback ladders, the concession record, the
resolution engine, the validation engine, the run store and frozen executed
agreements built and verified. Document service not yet started.

## Running it

```bash
npm install
python -m pip install -r requirements.txt
docker compose up -d
python -m doorway.setup
npm run verify
```

`verify` runs every suite and then both mutation checks. All must pass.
Requires Node, Python 3.10+ with `pytest`, and Docker. `python-docx` is optional
and test-only — it independently validates our output; three tests skip without
it.

**The database.** Standard PostgreSQL 18, run in Docker (`docker compose up -d`).
Until 2026-07-26 this project used [PGlite](https://pglite.dev) — real PostgreSQL
compiled to run inside the test process — which needed nothing installed. The
owner's decision that day was to move to the ordinary version, because the
convenience cost three things the product needs: the tools to seal the audit
checkpoint (`pgcrypto`), more than one connection at a time, and therefore any
honest test of whether an identity outlives the request it belongs to. The
migrations moved across unchanged, first attempt.

The older `db/test/*.test.mjs` suites still run against PGlite and are still
green; they test the schema, which is identical either way. New work targets
PostgreSQL.

**Two logins, and the difference matters.** The owner applies migrations and does
nothing else. The doorway connects as `cw_app`, which is a member of all six
application roles and `NOINHERIT`, so it holds none of their privileges until a
request binds one. An idle connection can do nothing at all.

## What's here

```
db/migrations/
  0001_foundation.sql             roles, append-only hash-chained audit log
  0002_clause_registry.sql        categories, clauses, immutable versions, supersession
  0003_ladders_and_concessions.sql  fallback ladders, concessions, promotion, analytics
  0004_conflict_rules.sql   clause tags and attorney-authored conflict rules
  0005_run_store.sql        stored snapshots, rule sets, and immutable runs
  0006_executed_agreements.sql  frozen signed contracts and the amendment chain
db/test/
  registry.test.mjs         37 tests
  ladder.test.mjs           29 tests
  loader-sql.test.mjs       16 tests — the engine's SQL against the real schema
  run-store.test.mjs        22 tests
  executed.test.mjs         16 tests
  mutation-check.mjs        15 mutations — proves those tests can fail
engine/
  model.py                  frozen value types
  snapshot.py               content-addressed library snapshots
  resolution.py             the pure function, and ladder descent
  validation.py             conflict rules as data, and the gate
  run.py                    recording a run, and rebuilding one
  docx.py                   emit a contract, read a vendor's redline
  loader.py                 the only module that knows both layers
  test_resolution.py        27 tests
  test_validation.py        21 tests
  test_run.py               19 tests
  test_docx.py              25 tests
  test_loader.py            14 tests
  mutation_check.py         24 mutations
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

## The run store, and what reproducibility actually costs

`ARCHITECTURE.md` §5 asks that a run be reproducible forever given its manifest
and library snapshot id. Storing the id is not enough, and the reason is worth
understanding before anyone tries to simplify this away:

**A snapshot id cannot be recomputed from the live registry later.** The hash
covers `selectable`, and selectability depends on the date. Tomorrow's registry
is a different library. Naming a thing nobody can rebuild is not a guarantee.

So snapshots are **stored**, not merely named — membership plus the frozen
`selectable` flag, which is the one fact that cannot be recovered afterwards.
They are content-addressed, so a slow-moving library means many runs share one
row rather than each carrying a copy.

**Clause bodies are not stored with them.** They live in `cw.clause_version`,
which is immutable and never deleted, so a reference suffices forever. This is
where ADR-0006 finally pays for itself: a three-year-old run is still readable
because the wording it points at cannot have changed.

**What the hash covers is a deliberate choice.** It includes everything that
determines the outcome — body, severity, `selectable`, tags, ladders,
`provenance_gap` — and excludes `state`. `state` is descriptive, resolution
never reads it, and it *changes* when Legal retires or supersedes a clause.
Hashing it would have broken every stored run the first time the library was
tidied, for no benefit. That flaw was caught by the reproducibility test, not by
review.

`test_a_run_reproduces_years_later` is the guarantee under test: it stores a run,
ages the library the way three years of Legal activity would — retiring,
expiring, superseding, adding new language — and checks the run still rebuilds
to the same snapshot id and the same decisions. A companion test confirms
today's library *would* give a different answer, so the first cannot pass by
coincidence.

Runs, decisions, findings, snapshots and rule sets are all immutable. `UPDATE`
raises; `DELETE` is a silent no-op rather than an error, so deleting history
cannot succeed even by accident.

## A signed contract is frozen

The most important rule in the lifecycle half, and the one easiest to erode by
accident: **nothing in this system modifies an executed agreement.** Not a
library update, not a supersession, not an administrator. Renewal produces a
*new* agreement; an amendment is a *new* signed instrument appended to the
chain. Neither edits what was signed.

**Being able to rebuild a contract is not the same as having the one that was
signed**, and the difference is why `cw.executed_document` stores the bytes:

1. **A signed contract can contain language that is not in the library.**
   Conceded vendor wording is quarantined by design (ADR-0009) — deliberately
   never selectable — so no regeneration will ever produce it.
2. **Signature adds what assembly never saw**: signature blocks, counterparts,
   initials, exhibits attached during negotiation.
3. **A reconstruction is evidence of what we believe. The file is evidence of
   what was agreed.** Only one of those survives a dispute.

So the executed document is stored with its SHA-256 and is authoritative. The
assembly provenance — run, snapshot, rule set, decision set — *explains* the
contract; it does not constitute it. If a regeneration and the stored file ever
disagree, the file wins and the disagreement is an incident.

`UPDATE` on `cw.executed_agreement` or `cw.executed_document` raises for every
role including `legal_admin`; `DELETE` is a silent no-op. `cw.agreement_drift`
reports how far the library has moved from what a contract carries — input to a
renewal conversation, and nothing more. Tests assert that superseding and
retiring the very clauses a contract used leave it byte-identical.

## The document service

Emits the contract, and reads vendor redlines back.

**Deviation from `ARCHITECTURE.md` §5, deliberately.** The specification names
`python-docx`. This uses the standard library, because python-docx *cannot read
tracked changes* — it exposes only runs that are direct children of a paragraph,
so `w:ins` and `w:del` content is invisible to it. A test demonstrates this: read
through python-docx, a vendor's redline loses **both** the insertion and the
deletion, which is exactly the text under negotiation. Since the redline half
must walk the XML regardless, a second dependency would buy only inconsistency.

python-docx is kept as a **test-only** dependency, used the other way round: an
independent OOXML reader opens our generated file and confirms the clauses and
styles are really there. Our own parser reading our own output proves only that
we are self-consistent.

**`authored_characters()` makes the headline claim checkable.** It counts
characters in the emitted document that are neither approved clause text nor one
of a small, explicitly declared set of structural strings. The suite asserts the
count is zero — and a control test asserts the counter returns non-zero when the
allowlist is incomplete, so it cannot pass by always returning 0. If that
allowlist ever needs a new entry, that is the moment to ask what just got
written.

**An unresolved risk is omitted, never filled in.** A mutation that inserts
"To be agreed between the parties." for a missing clause is caught by the
authored-characters test — which is the invariant doing real work rather than
decorating a footer.

**Assembly is byte-reproducible.** Zip entries carry a fixed timestamp, because
a stored SHA-256 is worthless if the same contract hashes differently every
minute. Asserted directly against the archive, not inferred from building twice.

**Redlines: one per changed paragraph** (ADR-0007), with segments in document
order so a reviewer sees what changed where. `accepted_text` is keep + insert
with deletions dropped — what a Review ticket pre-loads. Unchanged paragraphs
are context, not redlines.

**A vendor upload is the one place untrusted bytes enter the system**, so a file
that is not a zip, not a Word document, or malformed inside raises `NotADocx`
with a message a buyer can act on.

## Why there is a mutation check

A test suite that has never failed proves nothing. `mutation-check.mjs`
deliberately breaks one guarantee at a time — removes the unique constraint on
category short codes, makes clause bodies editable, lets expired clauses be
selected — and asserts the suite catches each one.

It has already earned its place nine times:

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
- **The frozen `selectable` flag was never load-bearing.** Every clause in the
  run-store fixture was selectable, so a rebuild that ignored the stored flag
  still reproduced. The fixture now contains a clause that was already retired
  when the snapshot was taken.
- A test asserting the ladder floor survives storage passed while the floor was
  being written as `false` for every rung.
- The document-reproducibility test built two files in the same second, so it
  would have passed with a live timestamp — by luck. Replaced with a direct
  assertion that the archive embeds no wall clock.
- The redline fixture wrote only `word/document.xml`. Enough for our lenient
  parser, but not a real vendor file, and it hid the fact that an independent
  reader could not open it at all.

## Operations — what runs nightly, and what to do when it fails

Four integrity checks. All four run as the **Administrator**, the role that owns
machine stewardship since owner decision `U7`
([ADR-0011](../docs/decisions/ADR-0011-the-administrator-is-a-steward.md)), and
every one of them **records that it ran** in `cw.integrity_check`. That table is
append-only, and the health pane counts rows in it and nothing else.

That last point is the design, not an implementation detail. The failure to
guard against is not a tile saying BROKEN when things are fine — somebody
investigates that within the hour. It is a tile saying VERIFIED because a query
counted rows that *exist* rather than checks that *ran*. So `documents_stored`
and `documents_verified` are different numbers, the difference is
`documents_never_checked`, and it is shown rather than hidden. **`never_ran` is
its own state everywhere** — "we looked and it is fine" and "we have not looked"
are different answers.

| # | Check | Call | What it proves | Cadence |
|---|---|---|---|---|
| 1 | **Checkpoint** | `cw.audit_checkpoint_take()` | Records how tall the log is and what its last row hashes to, so later removal of the *newest* rows becomes visible | nightly |
| 2 | **Anchor** | `cw.run_anchor_check()` | The newest checkpoint still describes the log | nightly, after 1 |
| 3 | **Chain** | `cw.run_chain_check()` | Every row's hash still links to its parent — catches edits and removals in the *middle* | nightly |
| 4 | **Document hash** | `cw.record_document_hash_check(agreement_id, doc_seq, observed_sha256)` | A stored signed file still hashes to what was recorded at execution | nightly, sampled |
| 5 | **Rebuild spot-check** | `cw.record_rebuild_spot_check(run_id, observed_hash)` | A past run, re-run, still produces the hash on record | nightly, one run |

Checks 4 and 5 cannot happen inside the database. A document hash needs the
stored *bytes*, which live in a document store the database has no reach into —
`cw.executed_document` holds a `storage_uri`, not a file. A rebuild needs the
Python engine. So the caller reads the bytes (or re-runs the engine) and supplies
what it observed; **the database performs the comparison** against what it
recorded. Deliberately not "the caller tells us whether it matched" — a boolean
supplied by the thing being checked is not a check.

The scheduler itself is not built. Each check is runnable on demand today, and
wiring them to a nightly trigger lands with the service layer's runtime
(WP-U05). The 24-hour cadence the checkpoint tile reports against is a constant
in `cw.health_checkpoint`, not a settings row: `WP-U03` fixed the operational
settings at four, and a fifth is a proposal with a reason rather than something
added while a file happened to be open.

### When one fails

Read `cw.health_summary` first — one row per tile, each `pass`, `fail` or
`never_ran`, with a sentence to act on.

- **Anchor `fail`, detail "no checkpoint"** — nothing is anchored, because none
  has ever been taken. Take one. This is recorded as a *failure* rather than a
  pass-with-a-caveat, deliberately: there is no anchor, so the pane must not be
  green.
- **Anchor `fail`, detail "anchor broken"** — the log is shorter than the
  checkpoint recorded, or the row at the recorded sequence hashes differently.
  Newest events have been removed or edited. This is an incident. Do not take a
  new checkpoint, which would anchor the damaged state and destroy the evidence.
- **Chain `fail`** — the detail names the first sequence number that no longer
  verifies. Everything before it is intact; everything from there on is suspect.
- **Document hash `fail`** — a signed file no longer matches what was recorded at
  execution. **The bytes are the authority.** This is an incident to investigate
  and never something to resolve by preferring our own regeneration.
- **Rebuild `fail`** — check `engine_version` on the run first. A hash that no
  longer reproduces looks exactly like tampering *and* exactly like an engine
  change, and the detail names the version that produced the original for that
  reason.
- **Retention `due`** — not a fault. Due-ness is a fact, and acting on it is
  Legal admin's: the Administrator sees what is due and nudges, and holds no
  privilege to destroy anything. That boundary is a grant, not a convention.

The database owner is outside all of this, as it has been since `0007`: it holds
DELETE on `cw.audit_event` and can rewrite the checkpoints too. Against that
actor these checks raise the bar; they do not close the door. Notarising
checkpoints outside the database is the next phase's job.

## Mapping to the specifications

| Guarantee | Source |
|---|---|
| Versions immutable, validity computed | [ADR-0006](../docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md) |
| Five roles, recorded overrides | [ADR-0008](../docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| A sixth role that runs the machine and changes no content | [ADR-0011](../docs/decisions/ADR-0011-the-administrator-is-a-steward.md) |
| Four states, supersession is a deliberate act | [ADR-0009](../docs/decisions/ADR-0009-concession-is-not-supersession.md) |
| Unique category short codes; expired clauses unselectable | [spec-vs-implementation](../docs/spec-vs-implementation.md) findings #1, #4, #8 |
| Append-only, tamper-evident audit | [ARCHITECTURE.md](../ARCHITECTURE.md) §5 |

## Next

1. **Obligation templates** — [LCMA](../LIFECYCLE-ARCHITECTURE.md) §5, declared
   on the clause so registration is a lookup rather than an interpretation.

Deferred deliberately: a rule-authoring surface for non-developers. The grammar
is now small enough to put behind a form, but that is a frontend concern and the
backend contract it would write to is settled.
