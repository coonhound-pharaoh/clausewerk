# What is built in JavaScript that needs to be in Python

**A gap report for the owner. Written 2026-07-26, against commit `bd8fcf6`.**

Companion to [`PYTHON-REVISION-PLAN-2026-07-26.md`](PYTHON-REVISION-PLAN-2026-07-26.md),
which says how to close the gap. This document only says what the gap *is*.

---

## The one-paragraph version

The foundation of the front door is now in Python and proven. Everything built on
top of it — the fifty-two things the screens can ask for, the web server that
answers them, and the test suite that checks them — exists only in JavaScript.
That is about 1,800 lines to move. Separately, and more importantly, there is a
gap that exists in **neither** language: our contract engine has nothing calling
it, and from JavaScript it never could.

---

## 1. What is already in Python, and finished

| Piece | What it does | Proof |
|---|---|---|
| Connection layer | Binds each request to one person and one role, and lets PostgreSQL forget them the instant it ends | 4 tests, incl. the leak reproduced deliberately |
| The doorway's login | Holds no powers of its own until a request grants it one | 4 tests |
| Sign-in | Checks what somebody *actually* holds, including the countersign rule | 5 tests |
| Sign-in lifetime | Expires on the length the Administrator sets; withdrawal bites at the next click | 5 tests |
| Refusals | The database's own words, never flattened into "nothing here" | 8 tests |
| Schema installation | All fifteen migrations, applied and recorded | in every test |

**30 tests. Three deliberate breakages confirmed they notice.**

This is the part the plan called "the doorway", and it is the part none of the
rest is safe without.

---

## 2. What exists only in JavaScript

### 2.1 Duplicated — already replaced, needs retiring rather than porting

| File | Lines | Status |
|---|---|---|
| `service/db.mjs` | 176 | **Superseded** by `doorway/db.py` |
| `service/sessions.mjs` | 69 | **Superseded** by `doorway/sessions.py` |

These two do a job the Python now does better, because the Python has a real
database underneath it. The JavaScript version funnels every request through a
single connection one at a time — a hard ceiling for a commercial product — and
its identity clean-up is code that has to run rather than something the database
does by itself. Its own comments say so.

**Nothing to port. Delete once nothing depends on them.**

### 2.2 The real gap — what the screens actually ask for

| File | Lines | What it is |
|---|---|---|
| `service/app.mjs` | 376 | **25 things the screens can read** |
| `service/mutations.mjs` | 386 | **27 things the screens can do** |
| `service/server.mjs` | 134 | The web server, and serving the screens themselves |
| `service/seed-demo.mjs` | 100 | Creating six people so each workspace can be walked |
| `db/test/service.test.mjs` | 543 | The 30 tests proving all of the above |
| **Total** | **1,539** | |

**The 25 reads** cover: who am I; my deals; what is waiting on Legal; the
countersign queue; people and their access; the access history; operational
settings; system health; watcher lists and coverage; override requests, findings
and notifications; review tickets; library quality and clause origin; clauses and
their versions; where every version came from; concessions; legal holds;
retention; and the audit record.

**The 27 writes** cover: opening a deal; creating a category; opening, verifying
and rejecting review tickets; proposing and approving concessions; the whole
override request workflow (ask, socialise, decide, gate); legal holds; creating
and revoking accounts; granting, countersigning and revoking roles; changing
operational settings and recording owner decisions; maintaining watchers;
retention nudges; audit checkpoints; and four health checks.

**Important, and it makes the porting much smaller than the line count suggests:**
none of these contains any permission logic. There is not one "if the role is X"
in either file. Each is a database statement plus a route, and the database
decides who may run it. The port is therefore mostly mechanical — the risk is
volume and typos, not judgement.

### 2.3 What should stay JavaScript, permanently

| What | Lines | Why |
|---|---|---|
| `prototype/v4/` — the screens | 2,701 | Screens belong in the browser's language. This is not a compromise; it is the normal boundary between the thinking and the display. |
| `db/test/*.test.mjs` — the schema suites | ~4,000 | They test the *database*, which is identical whichever language asks. Rewriting them would re-prove what is already proven and risk losing detail earned by attacking the schema. |

---

## 3. The gap that exists in neither language — and matters most

**Our contract engine has nothing calling it.**

The engine is 4,604 lines of Python: it decides which clause answers which risk,
descends the fallback ladders, applies the validation rules, records a run so it
can be rebuilt later, and reads and writes Word documents. It is the half of the
product that must be provably correct, and it is thoroughly tested on its own.

Nothing in the running system calls any of it.

I checked whether the JavaScript service reaches it: **it does not, anywhere.**
There is no bridge to it and never was. So the check that stops a hallucinated
risk category reaching a contract — `check_manifest`, which the handoff names as
an inherited gap — has no caller, and from JavaScript could only ever have one by
launching Python as a separate program for every request.

**This is the strongest practical argument for the decision you already made.** In
Python, the doorway calls the engine directly. In JavaScript, connecting these
two halves of the product was a piece of work nobody had started, and it would
have been the awkward kind.

---

## 4. Effort, honestly

| Work | Size | Difficulty |
|---|---|---|
| 25 reads | ~380 lines | Low — each is a database statement and a route |
| 27 writes | ~390 lines | Low, with one caution: no endpoint may ever retry a refusal |
| Web server | ~134 lines | Low |
| Demo seeding | ~100 lines | Low |
| Test suite | ~543 lines | **Medium** — this is where the care goes, see below |
| Connecting the engine | new | Medium — it does not exist yet in any language |

**The test suite is the part to take seriously, and not because it is hard.** Its
30 tests are the record of what this system promises. Re-writing them is the
moment to check each promise still holds rather than transcribing it — and a few
of them can now be made *stronger* than they were, because the old database could
not support them. The clearest example is already done: the identity-leak test
was impossible before and is now the sharpest test in the suite.

---

## 5. The thing that makes all of this urgent

**Another session is actively adding to the JavaScript service.** Since this
morning it has committed three more work packages onto the files listed in §2.2 —
the override request workflow, the review desk, and the requester's asking flow —
adding roughly 150 lines to the very code the Python replaces, plus a new
569-line database migration.

That work is good and none of it is wasted: the migration is shared by both
languages, and the endpoints define the behaviour the Python must match.

But the gap in §2.2 grows every hour both sessions run. **Whoever is driving the
other session needs to know the decision has been taken**, so their effort goes
into the language that is staying. That is a coordination question, not an
engineering one, and it is the single highest-value thing to settle today.
