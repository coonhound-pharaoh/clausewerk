# Four endpoints are wired into the router and nothing ever asks for them — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** Four route tests plus a meta-guard that compares the keys
`app.py` dispatches against the route strings the test suite drives. Proved by
breaking it: renaming any key fails two tests, the meta-guard and the route test.
A mutation row was added and verified to fire; 48 patterns resolve exactly once.

**The plan's own design was wrong and its bite test caught it** — see the section
at the bottom. The first guard read only `app.py`, so a rename renamed both halves
and it agreed with itself.

Full doorway suite: **1512 passed**.

## What is wrong

`App.handle` dispatches sixteen routes by matching a literal string. Ten of them
are driven through `App.handle` by some test. **Four are not driven by anything,
anywhere in the repository** — no test, no screen, no script:

    POST /notifications/tick
    POST /negotiations/analyse
    POST /negotiations/analyse/supplier
    POST /concessions/assess-risk

Their handlers are well tested. `test_notifications.py` calls
`notifications.tick(...)` directly eleven times; `test_analysis.py` calls
`analysis.analyse(...)`. **The wiring between the route string and the handler is
what nothing checks.**

Proved by breaking it. All four keys renamed to nonsense in `app.py`
(`"POST /notifications/tickTYPO"` and friends), then:

    python -m pytest doorway/test_notifications.py doorway/test_analysis.py \
                     doorway/test_server.py doorway/test_server_protocol.py
    139 passed

Four endpoints made permanently unreachable and the suite is green.

## Why this one matters more than the arithmetic suggests

`notifications.py`'s own header states the contract:

> WHO RUNS IT. An external scheduler (OS cron, deployment timer) POSTs
> `/notifications/tick` on an Administrator's session. There is no thread, no
> timer and no daemon in here.

**That route string IS the feature.** There is no fallback path — no timer inside
the service, deliberately. A typo in it means every digest stops, nobody is told
anything is waiting on them, and the failure is silent: the scheduler gets a 404,
the tests stay green, and the first sign is somebody asking why they never hear
from the system.

`POST /concessions/assess-risk` appears **exactly once in the whole repository**,
in `app.py` itself. Nothing has ever asked for it, so nothing has ever confirmed
it answers.

## This is S254's lesson one layer over

S254 proved that all 139 routes REQUIRE A SESSION, and did it by scanning
`handle`'s source rather than a registry — because "a guard that enumerates a
registry cannot see something that was never registered."

The same file has the mirror-image gap. Every route is proved GATED, and four are
never proved REACHABLE. A route that 404s is perfectly gated.

The reads and writes do not have this problem, and the reason is worth stating:
they are dispatched by `key in reads.READS`, so the registry IS the route table
and a test parametrised over `sorted(READS)` covers every one. The sixteen
specially-dispatched routes are the ones where somebody typed the string twice —
once in `app.py`, once in whatever asks for it — and only one copy is checked.

## Not wrong, checked before claiming otherwise

* **The handlers are fine.** This is a wiring gap, not a logic gap. All four
  handler functions have direct tests.
* **The screens do not call them either**, so no button is currently dead — these
  four are all machine- or console-driven surfaces. That is why nothing has been
  noticed rather than a reason it is safe.
* **The 20 `GET` endpoints that no test names by path are covered**, because
  `test_reads.py` parametrises over `sorted(READS)` and drives every one as an
  administrator and as a requester. They were checked before being dismissed.

## The fix

**A test that enumerates the dispatch keys from `app.py`'s SOURCE and asks the
router for each one.**

Reading the source rather than a hand-written list is the whole point: a list
here would be a third copy of the same strings, and would go stale exactly as the
first two did. The test parses `key == "..."` out of `handle`'s body — the same
technique S254's session guard uses on the same function, for the same reason.

For each key it calls `App.handle` with a real signed-in caller and asserts the
answer is **not the router's own 404** (`{"error": "no such endpoint", …}`). Any
other outcome passes: a 400 for a missing selector, a 403 from the database, a
409 on the merits — all of those prove the route reached a handler, which is the
only thing being tested here. Asserting anything more would be re-testing the
handlers that already have their own suites.

A floor assertion guards the guard: if the parse finds fewer than the sixteen
keys that are there today, it fails rather than passing over nothing — S254's
vacuous-pass lesson, which bit that very file.

## Validation

* The test must FAIL when a route key is misspelt — proved by renaming each of
  the four, one at a time.
* It must fail if the enumeration stops finding keys (the floor).
* A mutation row, since a guard on a string is a guard somebody can soften.
* Full doorway suite.

No migration is touched, so the db mutation harness rule does not apply.


---

## The first version of the guard was nearly tautological, and its own bite test found it

The plan said: parse the dispatch keys out of `app.py` and ask `App.handle` for
each. That was written, and it passed. **Then renaming a route in `app.py` left
it passing too** — because the parse and the question both read the same file, so
a rename renamed it in both halves and the guard agreed with itself.

A guard that reads only the file it guards cannot see a rename. It can see a key
that was never wired at all, which is not the failure that happens.

**So the guard now compares two sources**: the keys `app.py` dispatches, and the
route strings the test suite actually drives. A key renamed in `app.py` alone
stops matching any test and fails by name. It excludes its own function body from
the search — the keys are quoted in its docstring and failure message, so leaving
them in would match every key by construction and pass over anything.

**That found eight, not four.** Four are named by no test at all; four more are
named only by `test_server.py`, which is legitimate. The matcher had to accept a
path appearing inside a longer string (`"/api/runs/contract?run=…"`), with a
lookahead so `/negotiations/analyse` is not satisfied by
`/negotiations/analyse/supplier`.

**Four route tests close the four.** They must sign somebody in: `App.handle`
resolves the caller BEFORE it dispatches, so a request with no token gets 401
whether or not the route exists — a version without a session would have passed
for a route renamed to nonsense, which is the exact failure being caught.

Proved by breaking it: renaming any of the three keys fails **two** tests, the
meta-guard and the route test.
