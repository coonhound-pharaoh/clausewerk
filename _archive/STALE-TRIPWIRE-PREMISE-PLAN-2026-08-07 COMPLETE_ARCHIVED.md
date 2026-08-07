# A security tripwire that has been warning about a closed hole — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `backend/doorway/test_unprotected_tables.py`.

---

## In one paragraph, for a business reader

A test in this system exists to make developers stop and think before touching
five tables that hold run evidence, because — it says — those tables have **no
row-level security**, so anyone reaching them directly could read across every
deal in the business. That was true once. It stopped being true on 28 July, when
those five tables were given row-level security and proper policies. **The test
has been telling developers a false thing about the system's security ever
since**, including in the message it prints when it fires.

## The evidence, from the history

Two commits, the same day, two hours apart:

| time | commit | what it did |
|---|---|---|
| 16:44 | `6fb4c97` "Scope run pins to visible runs" | added `enable row level security` **and** `read_scoped` / `write_scoped` policies to all five tables |
| 18:57 | `62f0257` "Remediate B1-B11 and audit finding A-1" | added `test_unprotected_tables.py`, whose premise is that those five tables have no row-level security |

The installed catalog today:

```
cw.snapshot_member       rls=true policies=2   select-> requester,legal_reviewer,legal_admin,auditor,administrator
cw.snapshot_ladder_rung  rls=true policies=2   ...
cw.snapshot              rls=true policies=2   ...
cw.ruleset_member        rls=true policies=2   ...
cw.ruleset               rls=true policies=2   ...
```

The two changes were almost certainly parallel work integrated in sequence —
the tripwire's author verified against a tree that predated the fix. Nobody did
anything careless; the guard simply arrived after its danger was gone.

## Why this is worth fixing rather than leaving

The file is not merely out of date. **Its failure message instructs a developer
with a false statement about the system:**

> "…which has no row-level security. Resolve the caller's id through `cw.run`
> first…"

Someone who trips this is told the only thing standing between a caller and
every deal's evidence is their own discipline. It is not — the database enforces
it. That matters in two directions: a developer may take a risk elsewhere on the
strength of a rule they think is uniquely load-bearing here, and a developer who
discovers the statement is false has been given a reason to distrust the test
and delete it.

This is the recurring defect of this codebase seen from the other end. Usually a
guard is left behind by a change; here a guard **arrived after** the change that
made it unnecessary, and nothing reconciled the two.

## What is NOT proposed: deleting it

Resolving a caller-supplied id through `cw.run` before touching the run store
remains the house pattern and is worth enforcing. The policies added in
`6fb4c97` scope a requester through `exists (select 1 from cw.run …)`, which is
belt and braces with the doorway's own discipline, not a replacement for it.
Deleting the tripwire would trade a true guard for nothing.

## The fix

Rewrite the premise and the message so both describe the system as it is:

- state that the five tables **do** carry row-level security, naming `6fb4c97`
  and quoting `0005`'s own note that a requester may read a pin "only when at
  least one run visible through `cw.run` references it";
- keep the allowlist and the review friction, re-justified as **defence in
  depth and house style** rather than as the only thing preventing a breach;
- fix the failure message, which is the part that actually misinforms;
- record why the guard outlived its premise, so the next reader does not have
  to reconstruct it from two commits' timestamps.

## How it is proved

The test must still fail when an unentitled module names one of the five —
proved by adding such a reference temporarily, not assumed. Both existing tests
keep passing, and the full suite is run.

## Not in scope

`cw.audit_checkpoint` and `cw.schema_migration` genuinely have no row-level
security and are deliberately outside this tripwire — neither holds per-deal
evidence. Checked; that exclusion is still correct and is left alone.
