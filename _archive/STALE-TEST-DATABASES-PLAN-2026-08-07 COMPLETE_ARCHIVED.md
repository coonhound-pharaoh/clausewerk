# The test suite leaks a database every time it is interrupted — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `backend/doorway/conftest.py` — the per-run test database.

---

## In one paragraph, for a business reader

Every time the test suite runs it builds a private copy of the whole database to
work in, and deletes it again at the end. If the run is stopped part-way — a
crash, a cancelled run, a machine reboot — the copy is never deleted, and
**nothing ever comes back for it.** The file that does this even names a rule
for tidying them up; the rule was written down and never implemented. Twenty-two
abandoned copies were sitting on this machine, and the machine's disk is 97%
full, which is very likely why the database has been crashing part-way through
suite runs today.

## The evidence

```
22 leaked databases, 587 MB   (clausewerk_doorway_%)
host disk: 447G total, 433G used, 15G free — 97%
```

PostgreSQL terminated abnormally twice during today's runs (05:40 and 05:57),
each time recovering with "database system was not properly shut down". The
resulting suite errors were `server closed the connection unexpectedly` during
migration, 50 in one run and 366 in the next — nothing to do with the code
under test, which is why they moved around between runs.

## The defect, precisely

`conftest.py:59` declares:

```python
TEST_DATABASE_PREFIX = "clausewerk_doorway_"
# The prefix a stale database can be recognised by. Only ever used to clean up
# databases this file created.
```

It is **used nowhere**. The only cleanup is a session-teardown fixture that
drops `TEST_DATABASE` — this run's own database, named for this process's pid —
and only when the session ends normally. Its comment says:

> "A database left behind is untidy; a run that fails while tidying up reports
> the wrong thing. **The next run clears it.**"

The next run does not clear it. The next run has a different pid, so it names a
different database and never looks at the one left behind.

## The fix

Sweep at session **start**, not at teardown — teardown is exactly what does not
run when a run is killed.

A stale database is dropped only when **both** hold:

1. **The pid in its name is not a live process.** The name carries the pid that
   created it, so this is a precise test rather than a guess. Checked with the
   standard library only — `ctypes.OpenProcess` on Windows, `os.kill(pid, 0)`
   elsewhere. *Note: `os.kill` must not be used on Windows for this — with a
   signal of 0 it calls `TerminateProcess`, so the liveness check would kill the
   process it was asking about.*
2. **No backend is connected to it.** A second, independent signal, because pids
   are recycled: if a dead run's pid now belongs to something else we keep the
   database, which is the harmless direction.

Parallel suite runs are the reason the databases are named per-pid in the first
place, so the sweep must never touch a live run's database. Requiring both
signals is what makes that safe.

Failures while sweeping are swallowed, for the reason the existing teardown
already gives: a run that fails while tidying up reports the wrong thing.

## How it is proved

A test that creates a database named for a pid that cannot be running, runs the
sweep, and asserts it is gone — and a second that creates one named for **this**
process and asserts the sweep leaves it alone. The second is the one that
matters: a sweep that is too eager breaks concurrent runs.

## Not in scope

The disk being 97% full is the machine's problem, not the repository's. This
change stops the repository contributing to it.

The suite errors seen today are explained by the crashes and are not evidence of
a product defect; the same suite passed 1693/1693 earlier in the day. A clean
confirmation run follows this change.
