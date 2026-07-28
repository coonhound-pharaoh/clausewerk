# Clausewerk — Bug Report

**Date:** 2026-07-28
**Branch:** `main` (plus the uncommitted Phase 2 identity work in the tree)
**Scanned:** all 5,900 lines of non-test Python in `backend/doorway/` and `backend/engine/`, the 32 SQL migrations, and the installed schema as PostgreSQL actually reports it.

**Method:** the code was read, and then every claim below was *run*. Where a finding says "verified", a probe test was written, executed against a real PostgreSQL, and its output is quoted. The probes were deleted afterwards. Two findings are marked **latent** — the defect is real in the code but cannot be triggered today; those say so explicitly rather than being dressed up as live.

**Suite state:** `python -m pytest engine` — **202 passed**. Full `python -m pytest doorway` — **566 passed, 1 error in 13m37s**. That single error is not a product defect; it is the test harness colliding with itself and is written up as **B9** below. The suite that erred passes cleanly on its own (`test_reads.py` — 165 passed).

---

## The short version

Eight defects. **Two matter now.**

The first is that a caller who sends a slightly wrong request gets told *the service is broken*. It is not broken — they made a typo. This affects every write endpoint in the product, and it means the one message that should mean "we have a real problem" currently also means "somebody mistyped a form field".

The second is that when the system asks an AI for an opinion, it holds a database connection open for the entire twenty seconds that call is allowed to take. Ten of those at once and the whole product stops — sign-in, every screen, every save — and the error everyone sees blames the database, which will be sitting there perfectly healthy.

The other six are small: a guarantee the code documents but does not quite keep, some defensive gaps, and two stale comments. None of them is urgent.

Separately, and worth saying plainly: the parts of this codebase that are usually where the bad bugs live are in unusually good shape. Every one of the 26 privileged database functions is hardened against the classic escalation trick. No endpoint builds SQL out of anything a caller sent. The AI adapter handles every malformed reply I could think to check. That is not the normal result of a scan like this.

---

## B1 · A JSON object in any field reports the service as broken

> [!CAUTION]
> **Severity: high · Verified · Affects every write endpoint**

**What happens.** A caller sends a nested object or a list where the system expects a plain value. Instead of "that field is wrong", they get an HTTP 500 saying the service failed.

Verified on two unrelated endpoints:

```
POST /deals        counterparty={'nested': [1, 2]}  -> HTTP 500
    {'error': 'the service failed', 'reason': 'the database operation failed'}

POST /agreements/execute   byte_size={'nested': [1, 2]}  -> HTTP 500
    {'error': 'the service failed', 'reason': 'the database operation failed'}
```

The same endpoints handle *scalar* mistakes correctly, which is what makes this a bug rather than a design choice:

```
byte_size='not-a-number'   -> HTTP 400  'invalid input syntax for type bigint'
executed_on='not-a-date'   -> HTTP 400  'invalid input syntax for type date'
```

**Why.** Verified directly against the driver: a Python `dict` passed as a parameter raises `psycopg.ProgrammingError` with **`sqlstate = None`** — it is not a `DataError`. [refusals.py:100](backend/doorway/refusals.py:100) routes every psycopg error that is not a `DataError` to a 500 marked `"broke"`. [server.py:285](backend/doorway/server.py:285) checks that the top-level body is a JSON object, and nothing anywhere checks the type of a field inside it. `Write.bind` ([writes.py:133](backend/doorway/writes.py:133)) validates *presence* and never *shape*.

**Why it matters more than a wrong status code.** This codebase argues the point itself, repeatedly and correctly — [server.py:472-478](backend/doorway/server.py:472), [server.py:317-324](backend/doorway/server.py:317), [documents.py:12-14](backend/doorway/documents.py:12): *"a caller sending a malformed upload made a mistake, and 'we broke' would send them to argue with somebody about a bug that is not there."* B1 is exactly that failure, in the layer beneath the one where the rule was written down. And it works in both directions: because caller typos now produce 500s, a genuine service failure is no longer distinguishable from noise in the log.

**Recommended fix.** Either is small; the second is better.

1. ~~In `refusals.classify`, catch the binding failure specifically — a `ProgrammingError` carrying no `sqlstate` never came from the database at all.~~ **Corrected 2026-07-28 after adversarial review: `sqlstate is None` is too broad and would invert the very defect it fixes.** Re-running the driver shows at least three causes of a null sqlstate: `cannot adapt type 'dict'` (the caller's fault — B1's case), `query parameter missing`, and `the query has 2 placeholders but 1 parameters were passed`. The last two are **our own SQL bugs**, and reclassifying them as 400 "you made a mistake" is exactly the failure this report objects to, running backwards. The branch must key on *adaptation failure specifically*, and must carry a test proving a missing or miscounted placeholder still returns 500 `broke`.
2. Better: reject it at the boundary where presence is already checked. In `Write.bind`, refuse a `dict` or `list` for any field not declared `as_json=True`, naming the field. That puts the message where the caller can act on it and matches how the module already treats a missing field.

`executions.py` and `runs.py` bind parameters outside `Write.bind` and need the same guard.

---

## B2 · The AI call holds a database connection, so a slow provider stops the whole product

> [!CAUTION]
> **Severity: high · Verified**

**What happens.** [advisory.py:304](backend/doorway/advisory.py:304) calls the model from *inside* the caller's open database transaction:

```python
with db.as_person(caller.person, caller.role) as request:
    ...
    judgment = judge_semantic_difference(baseline, compared)   # <- HTTPS, up to 20s
```

**Verified, two ways.** A probe stubbed the model call and, from an independent connection, asked PostgreSQL what the pool was doing mid-call:

```
endpoint status: 200
IDLE-IN-TRANSACTION BACKENDS WHILE THE MODEL CALL WAS RUNNING: 1
```

And separately, what a held connection does to everyone else:

```
4th request against a max_size=3 pool with 3 held: succeeded after waiting 2.52s
```

**The arithmetic.** `TIMEOUT_SECONDS = 20` ([advisory.py:74](backend/doorway/advisory.py:74)). The serving pool is `Database(database_url)` with the default `max_size=10` ([db.py:164](backend/doorway/db.py:164), [server.py:503](backend/doorway/server.py:503)). `ThreadingHTTPServer` accepts unbounded concurrent requests. So **ten simultaneous advisory calls occupy every connection the service has, for up to twenty seconds** — and during that window sign-in, every read endpoint and every write endpoint queues behind them.

**And the error message blames the wrong system.** `psycopg_pool`'s wait timeout defaults to 30 seconds (verified). Past that, a waiting request gets `PoolTimeout`, which is an `OperationalError`, which [refusals.py:75-86](backend/doorway/refusals.py:75) turns into:

> HTTP 500 — "the service could not reach its database"

The database was reachable the whole time. Someone is going to spend an afternoon looking at PostgreSQL because a model provider was slow.

**Recommended fix.** Split the transaction. Read the two texts and close it; call the model with no connection held; open a second short transaction to write the row. Nothing requires the read and the write to be atomic — the judgment is advisory by the module's own definition, and the record is a single insert that either lands or does not. As a cheap second belt, give the advisory path its own small pool or a semaphore so it can never consume every connection even if the split is deferred.

---

## B3 · WITHDRAWN — this is deliberate, tested behaviour, not a defect

> [!CAUTION]
> **Withdrawn 2026-07-28 after adversarial review. Do not action this. "Fixing" it deletes a passing regression guard.**

**What I got wrong.** I read the `check_manifest` docstring's phrase *"every real rewrite is recorded in `coerced`"* as covering case normalisation. The codebase's definition of "a real rewrite" is narrower and deliberate: a rewrite that changes **meaning**. Normalising `"HIGH"` to `"High"` changes spelling, not meaning, so it is correctly excluded.

**The evidence I missed.** [engine/test_manifest.py:112-125](backend/engine/test_manifest.py:112) is a currently-passing test, `test_high_is_matched_on_meaning_not_spelling`, which asserts exactly the behaviour I reported as a bug — for `"HIGH"`, `"high"` and `" High "` — and states the reason in its own assertion message:

> "a case variant of High preserves the model's meaning — recording it as a rewrite would bury the real rewrites in noise"

The test's *name* is the answer: matched on meaning, not spelling. My probe output was the case that test pins as correct.

**Why the withdrawal matters more than the finding did.** Acting on B3 as written would have deleted a regression guard against silent High-to-Standard downgrades — the exact defect `manifest.py`'s own comment records as having already happened once. It looked like a one-line fix, which is what made it dangerous.

**What, if anything, is left.** At most a documentation ambiguity: the docstring's "every real rewrite" does not say that a rewrite means a change of meaning, while the test does. Whether to tighten that sentence is a judgement about what the `coerced` field is for on screen and in the audit chain — an owner decision, carried in the revision plan as **WP-002**, with no code attached.

The original report follows, kept so the reasoning is auditable rather than deleted:

~~[engine/manifest.py:88-135](backend/engine/manifest.py:88). The docstring says "every real rewrite is recorded in `coerced` with the original claim", and the comment directly above the code names this exact scenario as the bug the code exists to fix. It does not hold:~~

```
kept severity : High
original claim: HIGH
coerced set   : ()
-> rewrite recorded? False
```

`coerced.append(risk)` sits only in the `else` branch — the unrecognised-severity case. A model that writes `"HIGH"` has its value rewritten to `"High"` and nothing records it.

~~**Impact.** `POST /manifests/check` and `POST /runs` both report `"coerced": []` for a manifest that was in fact altered. **Fix: record the coercion whenever `severity != risk.severity`.**~~ — superseded by the withdrawal above.

---

## B10 · The repository's own verification gate is already red, and has been silently

> [!CAUTION]
> **Severity: high · Verified · Found by adversarial review, not by my original scan**

**What happens.** `python backend/doorway/mutation_check.py` **exits 1** on the untouched tree:

```
mutation check — each row must FAIL the test that names it
36 mutations

STALE CHECKS — nothing was run, because these prove nothing:
  · sessions never expire — pattern is not in doorway/sessions.py any more
  · expired sessions pile up until each token is presented again — pattern is not in doorway/sessions.py any more
  · removing an expired session crashes if another request removed it first — pattern is not in doorway/sessions.py any more
  · removing an expired session crashes if another request removed it first — names
    test_sessions.py::test_an_entry_removed_mid_check_is_no_session_not_a_crash, which does not exist
  · the query selector is discarded before it reaches the app — pattern is not in doorway/server.py any more

EXIT=1
```

Five complaints over four distinct rows (the delete-race row trips twice — once for its missing pattern, once for its missing test).

**Why this is worse than four stale rows.** `main()` runs the preflight *first* and, on any staleness, returns 1 **without executing a single mutation**. So it is not that four guarantees are unchecked — **all 36 doorway guarantees are currently unevaluated.** No sentence of the form "the test suite would have caught that" is supportable for the doorway right now.

`backend/package.json` wires it in: `verify` → `test:mutation` → `node db/test/mutation-check.mjs && python engine/mutation_check.py && python doorway/mutation_check.py`. So `npm run verify` is red on `main`. The engine harness is clean (57 mutations, 0 stale, exits 0) — this is doorway-only.

**Not all of it is new damage.** The `server.py` row was *already* stale on committed `main` before the Phase 2 session work — the pattern is absent at `HEAD` (commit `add0554` refactored it into `_query`). Only the three `sessions.py` rows are Phase 2 fallout. So this is partly a repair of committed state, not just of the working tree.

**Why I missed it.** My scan ran `pytest`, which is green, and read `mutation_check.py` as test infrastructure rather than executing it. The harness is the thing that proves the tests have teeth, and I did not run the thing that checks the checker.

**Fix.** Repoint or retire the four rows. This is **WP-001** in the revision plan and it is sequenced first and blocking, because until it is green no other package can honestly claim its guarantee is guarded. One of the four has no line left to mutate and its named test was deleted — whether to repoint it or retire it with a written reason is an owner decision, not an implementer's.

---

## B4 · Five tables holding run evidence have no row-level security

> [!WARNING]
> **Severity: medium · Verified against the installed schema · Currently contained**

Queried from `pg_class` on a freshly migrated database:

```
tables in cw WITHOUT row level security enabled:
   audit_checkpoint, ruleset, ruleset_member, schema_migration,
   snapshot, snapshot_ladder_rung, snapshot_member
```

The five `snapshot*`/`ruleset*` tables hold select grants and carry the pinned library a run was taken against. [documents.py:47-56](backend/doorway/documents.py:47) knows this and states the invariant that keeps it safe: *"the caller-supplied run id is the one identifier in this system that must never reach an unprotected table before it has been resolved through a protected one."*

**That invariant currently holds.** I traced every consumer: `documents.py` resolves through `cw.run` first, `runs.py` only writes, `executions.py` never touches them. There is no live exposure.

**But it is enforced by one paragraph in one file.** Any future endpoint that takes a `snapshot_id` from a caller — a "show me this snapshot" screen is the obvious one — reads across every deal in the system with nothing to stop it, and would pass code review because the tables look like ordinary tables.

**Fix.** ~~A test that asserts the rule: for each of the five tables, confirm a caller cannot reach it with a caller-supplied id except via `cw.run`.~~ **Corrected 2026-07-28: that test cannot pass against correct code.** [0005_run_store.sql:301-309](backend/db/migrations/0005_run_store.sql:301) grants `select, insert` on all five tables to `cw_requester` and both Legal roles, and enables RLS on `cw.run`, `cw.run_decision` and `cw.run_finding` *only* — so a requester **can** reach these tables directly today, and a behavioural test would fail before any fix. The achievable version is a source-shape tripwire: assert the five table names appear only in the modules currently entitled to name them, so a new file mentioning one fails until reviewed (the pattern already used at `test_executions.py:421-424`). Actual RLS on these tables is a schema change with content-addressed-sharing blast radius and is deferred as its own item.

---

## B5 · `reasons[0]` can crash the request into a 500

> [!NOTE]
> **Severity: low · Latent — not reachable today**

**Four occurrences, not two** (corrected 2026-07-28): `reasons[0]` appears at [manifests.py:172](backend/doorway/manifests.py:172) and [:176](backend/doorway/manifests.py:176), and [runs.py:176](backend/doorway/runs.py:176) and [:179](backend/doorway/runs.py:179) — each site indexes it once for the audit record and again for the response body. Both files do this:

```python
reasons = []
for risk in checked.dropped:
    try:
        categories.key_for(risk.category)
    except UnknownCategory as unknown:
        reasons.append(str(unknown))
_record(request, ..., reasons[0])          # <- unguarded
```

The list is built by re-asking the category map to fail. It is non-empty only because `check_manifest` drops a risk under *exactly* the condition that makes `key_for` raise — verified by reading both. The day a second drop reason is added to the engine (a malformed justification, a duplicate category), both endpoints raise `IndexError` and return "the service failed" with a stack trace, on the path whose whole job is to explain why a manifest was refused.

**Fix.** `reasons[0] if reasons else "<the engine dropped this category>"`, or assert the coupling with a test.

---

## B6 · Three audit writers build SQL with string interpolation

> [!NOTE]
> **Severity: low · Not injectable today**

[runs.py:405](backend/doorway/runs.py:405), [manifests.py:240](backend/doorway/manifests.py:240), [executions.py:323](backend/doorway/executions.py:323):

```python
request.write(f"select cw.audit('{event}', %(agreement_id)s, %(payload)s::jsonb)", {...})
```

`event` is a module-local literal at every one of the six call sites, so nothing a caller sends reaches it. It is flagged because it is the single pattern this codebase is otherwise scrupulous about: [db.py:196-206](backend/doorway/db.py:196) spends ten lines explaining why even a *role name* drawn from a fixed internal map is composed through `sql.Identifier` rather than an f-string. The audit writers are the exception, and they write to the one table that has no UPDATE and no DELETE.

**Fix.** Pass the event as a bound parameter — `select cw.audit(%(event)s, ...)`. Nothing about the call changes.

---

## B7 · `required_if` cancels `required` instead of adding to it

> [!NOTE]
> **Severity: low · Latent — no live effect**

[writes.py:141-144](backend/doorway/writes.py:141):

```python
demanded = spec.required
if spec.required_if is not None:
    demanded = body.get(other) == expected     # <- overwrites, does not combine
```

A field declared `required=True` *and* `required_if=(...)` silently becomes optional whenever the condition is false. Only one field in the codebase uses `required_if` and it declares `required=False`, so nothing is wrong today. The trap is that the two attributes read as though they compose, and the next person to add a conditional field will reasonably assume they do.

**Fix.** `demanded = spec.required or (…)`, or reject the combination outright in `Field`.

---

## B8 · A stale comment explains behaviour that has changed

> [!NOTE]
> **Severity: low · Documentation**

[app.py:134-139](backend/doorway/app.py:134) justifies returning `expiresInSeconds` rather than a timestamp on the grounds that *"the session clock is the service's own monotonic clock, whose zero point is arbitrary"*. The Phase 2 work moved sessions to wall-clock time ([sessions.py:76-78](backend/doorway/sessions.py:76)) precisely because monotonic time does not survive a restart. The behaviour is still right; the reason given for it is no longer true, and this comment is the kind that gets trusted rather than re-checked.

Also from the same change: `threading` is imported and unused in `sessions.py:32`, and `Database` is used in the `__init__` annotation at `sessions.py:70` but never imported — it works only because of `from __future__ import annotations` and fails under any type checker.

---

## B9 · Two test runs at once still collide — on the one object the isolation does not cover

> [!WARNING]
> **Severity: medium (test infrastructure only — production is unaffected) · Verified**

**What happened.** The full doorway suite errored once in 566 tests:

```
psycopg.errors.InternalError_: tuple concurrently updated
CONTEXT:  SQL statement "alter role cw_app noinherit"
ERROR doorway/test_reads.py::test_every_read_runs_as_a_requester[GET /concessions]
566 passed, 1 error in 816.84s
```

Re-running that suite alone: **165 passed**. So nothing is wrong with the product code — this is the harness colliding with a second `pytest` process running at the same time. In this case the second process was mine (probe tests running alongside the long suite), which is exactly how a real user hits it.

**Why the existing isolation does not catch it.** [conftest.py](backend/doorway/conftest.py) is careful about this and gets it *half* right. It gives every run its own database, keyed on the process id, precisely because two runs sharing one deadlocked on 2026-07-26. Its docstring then reasons past the remaining hole:

> "The roles are cluster-wide and the migrations create them only if absent, so dropping the schema and rebuilding leaves them in place."

The premise holds for `create role` — but two statements *rewrite* `cw_app` on every single rebuild:

- [0016_doorway_login.sql:41](backend/db/migrations/0016_doorway_login.sql:41) — `alter role cw_app noinherit`, run unconditionally and deliberately, to re-assert the property rather than assume it
- [setup.py:39](backend/doorway/setup.py:39) — `alter role cw_app login password …`, run on every `prepare()`

The `schema` fixture rebuilds from the migrations **per test**, so one 566-test run issues those `alter role` statements hundreds of times against a **cluster-wide** row in `pg_authid` — the one object a per-process *database* does not isolate. Two overlapping runs, and PostgreSQL raises `tuple concurrently updated`.

**Why it matters.** `npm run verify` runs this suite, several agent sessions work this repository at once (two more commits and three file changes landed on `main` during this scan alone), and the failure surfaces as a random error in an unrelated test with a message about role inheritance. That is the same debugging trap conftest.py's docstring exists to describe — a harness problem wearing a product problem's clothes.

**Recommended fix.** Cheapest: wrap the `alter role` in [setup.py](backend/doorway/setup.py) and the DO block in 0016 so a `tuple concurrently updated` is retried once — the statement is idempotent and the second attempt sees the settled row. Cleaner: have the test harness assert `cw_app`'s properties rather than re-apply them, and leave role maintenance to installation, where it belongs and where it runs once. The `noinherit` check that `prepare()` already performs at [setup.py:44-52](backend/doorway/setup.py:44) is the model — it verifies rather than rewrites, and it is the right instinct applied two lines too late.

---

## Checked and clean

Recorded so nobody re-runs them.

| Check | Result |
|---|---|
| `SECURITY DEFINER` functions without a pinned `search_path` | **0 of 26** — the classic PostgreSQL escalation route is fully closed |
| SQL composed from caller input in `reads.py` / `writes.py` | none — every statement is a fixed literal with bound parameters |
| Tables with RLS enabled but no policy (accidental deny-all) | none |
| Bare `except:` clauses | none outside the one documented last-resort handler |
| Mutable default arguments | none |
| `engine` test suite | 202 passed |
| Seven doorway suites touched by Phase 2 | 115 passed |

Two things deserve more than a table row.

**The AI adapter is the best-defended code in the repository.** `advisory.py` correctly handles a non-numeric score, a boolean masquerading as a number, a structured `basis`, an oversized reply, a truncated reply, a non-object envelope, missing model provenance, an out-of-range score it refuses to clamp, and — unusually — it uses `add_unredirected_header` so the API key cannot follow a redirect to another host. Every one of those has a test. B2 is a structural placement problem, not a quality problem with this module.

**The refusal vocabulary is right.** `refusals.py` classifies on SQLSTATE rather than message text, which is the correct choice and is documented as a deliberate reversal of an earlier wrong one. B1 is a gap at its edge, not a flaw in its design.

---

## Recommended order

1. **B1** — every write endpoint currently reports caller typos as service failures. Small fix, product-wide effect.
2. **B2** — split the transaction around the model call before this endpoint sees real traffic.
3. **B3** — one line, and it makes a documented guarantee true.
4. **B4** — add the test that pins the invariant `documents.py` is currently the only thing enforcing.
5. **B9** — test-only, but it will keep producing mystery failures while several people work this repository at once.
6. **B5–B8** — tidy-ups; batch them.

---

## Two notes on scope

**The migrations were scanned, not audited.** I checked the 32 SQL files for the structural failure modes that can be verified mechanically — privileged-function hardening, RLS coverage, policy presence — and queried the installed schema rather than trusting the text. I did not line-by-line review 11,000 lines of policy logic. If you want that, it is a separate and much larger piece of work, and it is where the remaining risk in this system most likely sits.

**The tree moved while I worked.** Another session committed to `main` and modified further files (`0010_governance.sql`, `governance.test.mjs`, `0015_override_request.sql`) during this scan. None of it touched the files above, but the line numbers cited are against the tree as it stood today.

**Still open from the earlier audit:** the session-table privilege finding in [audit_results.md](audit_results.md) (A-1) is unfixed. Worth noting here because `seed_demo.py:41` seeds a real `viewer` account — Sam Reed — so the role that can read every live session key is one the system hands out by default, not a theoretical one.
