# 38 privileged functions, 2 guarded — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `SECURITY DEFINER` functions across all 69 migrations.

---

## In one paragraph, for a business reader

Some database routines run with elevated rights — they do a job the caller is
not allowed to do directly, such as counting everyone's AI usage or checking the
audit chain. A routine like that has to be told exactly where to look up the
names it uses. If it is not, an ordinary user can create something of their own
with a matching name, and the routine will pick that up and run it **with the
elevated rights**. It is the standard way this kind of routine gets turned into
a way in.

All 38 such routines currently do the right thing. **Nothing checks that they
do.** Two of them are covered by mutation rules; the other 36 rest on whoever
writes the next migration remembering. That is the same shape as the leaked
database found earlier today: a property everybody believes holds, with nothing
keeping it.

## The evidence

Parsing every function definition across all 69 migrations:

```
functions parsed: 223, security definer: 47
DEFINER WITHOUT search_path: 0
```

So the property holds today — this is a **prevention** fix, not a live hole.

What guards it, in full: two rows in `mutation-check.mjs`, on
`cw.audit_chain()` and `cw.audit_verify()`. Both strip `security definer` and
`set search_path` **together**, so they prove the definer-ness matters; neither
isolates the `search_path` pinning. Searching the test tree for `prosecdef`
returns nothing. There is no sweep.

The earlier audit (`bug_report.md`, 2026-07-28) recorded "every one of the 26
privileged database functions is hardened against the classic escalation trick".
That was a **finding in a report**, checked once by a person, at 32 migrations.
There are now 69 migrations and 38 such functions installed — 47 DEFINITIONS in the sources, several of them create-or-replace of the same function. Counting definitions is not counting functions, and the sweep's own vacuity guard caught that distinction on its first run. Nothing carried the check
forward — which is precisely how the count grew from 26 to 38 unattended.

## The fix

A schema-wide sweep in `db/test/grants-and-policies.test.mjs`, which exists for
exactly this and whose header already argues the case: *"A lint that catches the
shape twice is worth more than a proof nobody writes."*

Read the **installed catalog**, not the migration text: `pg_proc.prosecdef` for
the elevated ones and `pg_proc.proconfig` for the pinned path. Reading the
catalog rather than the source matters — `create or replace` in a later
migration can drop a `set search_path` that the original definition had, and a
source-text scan would still see the old, correct one.

Any `SECURITY DEFINER` function in schema `cw` whose `proconfig` carries no
`search_path` fails the sweep, naming the function.

## What the sweep does not claim

It checks that a path is **pinned**, not that the pinned value is safe. A
function pinned to a schema an ordinary role can create objects in would pass.
Every one today is `cw, pg_temp`, so this is stated as a limit rather than
patched around — in the same spirit as the honest limits already listed at the
top of that file.

## How it is proved

Green, and then **proved to bite**: a definer function is temporarily created
without a pinned path and the sweep must name it. A sweep that has never been
seen to fail is not protection — this repository has caught a test that could
not fail before (`memory.md`, 2026-07-26).

## Not in scope

No migration changes, so no mutation-harness run is required by CLAUDE.md's
rule. It will be run anyway, because the sweep file is one the harness drives.
