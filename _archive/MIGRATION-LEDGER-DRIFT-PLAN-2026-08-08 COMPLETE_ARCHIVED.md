# The migration ledger notices an edited file and nothing else — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** Two refusals beside the checksum — a migration that left the
repository, and one inserted below the high-water mark. A second smaller finding
in `setup.py` was fixed in the same change (see the bottom section). Proved by
breaking all three; two new mutation rows verified to fire, 50 patterns resolve.

Full doorway suite: **1516 passed**.

## What is wrong

`migrate.py` checks that an already-applied migration's file still hashes to what
was applied. That check exists because "migrations are forward-only" had been a
convention nobody could enforce, and its own docstring says why it matters:

> a migration edited after it had been applied was skipped in silence on every
> database that already ran it — forever, with no mechanism by which the drift
> could ever become visible.

**It catches content drift. It catches neither membership nor order drift**, and
both produce exactly the same outcome the checksum work exists to prevent: an
installation and a repository that silently disagree.

Proved against a real database with all 71 migrations applied:

### 1 · An applied migration deleted from disk — no complaint at all

    0045_vendor_friction.sql removed from the directory
    migrate() -> []          (nothing applied, nothing said)

The loop iterates the files that EXIST, so a recorded migration with no file is
never looked at. This installation carries `cw.vendor_friction` and everything
0045 built; a database created from the repository today would not. Nothing
anywhere reports the difference — the same silence, in the mirror direction.

### 2 · A migration inserted below the high-water mark — applied out of order

    0007a_inserted_late.sql added, after 71 later migrations were applied
    migrate() -> ['0007a_inserted_late.sql']
    it landed at ledger position 71 of 72 — its NAME sorts 8th

So the same repository produces two different schemas depending on when you built
the database: 0007a runs **eighth** on a fresh one and **last** on this one. For a
system whose stated promise is that a manifest and a snapshot id reproduce
forever, a schema whose build order depends on the age of the database is a
reproducibility hole with nothing watching it.

It is also how the harmless case becomes the harmful one. A file inserted low
today depends on nothing; the day somebody inserts one that references a table
created above it, a fresh build fails and every existing database is fine — or
worse, the reverse.

## The guard's own stated limits are incomplete

`_check_nothing_applied_has_changed` has a "WHAT THIS CANNOT DO" paragraph, which
is exactly the right habit. It names one limitation — rows written before the
checksum column existed are baselined from disk and prove nothing about the past.
It does not name either of the two above, so a reader who takes that paragraph as
the complete list of gaps is misled by a document that was trying to be honest.

## Not wrong, checked before claiming otherwise

* **The numbering gap at 0069 is not this.** No 0069 has ever existed in any
  branch, so nothing recorded it and nothing is missing. A gap in the NAMES is
  harmless; a gap between the LEDGER and the DIRECTORY is not.
* **The mutation harness is unaffected.** It copies the whole migrations
  directory before mutating, so no file goes missing under it.
* **The per-test databases are unaffected.** They start with an empty ledger, so
  neither check has anything to compare against.
* **The `db/test/*.mjs` suites are unaffected.** They load the `.sql` files
  straight into PGlite and never go through `migrate()`.

## The fix

Two refusals beside the one that is already there, in the same house style: a
sentence that says what happened, why it matters, and what the deliberate escape
is.

1. **A recorded migration with no file** → refuse. The installation ran something
   the repository no longer describes, so a database built from the repository
   today would not match this one.
2. **A new file that sorts below the highest already-applied name** → refuse,
   naming both positions. On a fresh database it would run at its sorted
   position; here it would run last.

Both are refusals rather than warnings, matching `MigrationChanged`: a warning in
a start-up path is a line in a log nobody reads, and this is the same class of
problem as an edited migration — which already refuses.

The "WHAT THIS CANNOT DO" paragraph gains the limits that remain after this: the
checks compare the ledger to the directory, so they cannot see a migration that
was renamed AND re-added under a new name with the same content, and they still
prove nothing about databases migrated before checksums existed.

## Validation

* Deleting an applied migration must FAIL, naming the file — proved by doing it.
* Inserting a low-sorting new migration must FAIL, naming both positions — proved
  by doing it.
* A normal run, a re-run with nothing new, and a run with a genuinely NEW
  high-sorting migration must all still pass.
* `test_migration_ledger.py` must still pass unchanged.
* Full doorway suite, and a mutation row since a start-up guard is the kind
  nobody exercises by hand.

No migration file is edited, so the db mutation harness rule does not apply.


---

## Two things the plan did not anticipate

**An existing test was pointing `migrate()` at a directory holding one file while
the ledger held seventy-two.** `test_two_migrators_serialize_the_same_new_file`
did that as a shortcut, and the missing-file check correctly read it as
seventy-one migrations missing. The test now copies the real directory and adds
its probe file to the copy — which is also the more faithful arrangement, since a
second service instance racing the first sees the real directory with one new
file in it. The check is right; the shortcut described a state no deployment has.

**A second, smaller finding in the same privileged path, fixed here.**
`setup.py` checked that `cw_app` does not inherit its roles — the single word
that stops the doorway's login holding all six roles' privileges — **after** it
had granted the login and set the password. On a cluster where somebody had
cleared NOINHERIT, `prepare()` would first hand that role a working login and
then refuse; `alter role` is autocommit there, so the raise unwound nothing. The
comment beside the check already said it was "applied two lines too late" and
nothing had moved it. It now runs first, still after `migrate()` because 0016 is
what creates the role.

**My first test for that ordering proved nothing, and its bite test found it.**
It asserted no `alter role … login` is issued before the refusal — but `cw_app`
can already log in by the time the test runs, so prepare() issues that statement
under NEITHER order and the assertion had nothing to see. It passed against the
old order. Setting `CW_APP_PASSWORD_RESET` forces the statement to be reachable,
and the test now fails when the order is put back.
