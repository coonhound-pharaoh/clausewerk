# Phase 2 (WS-3) Security & Architecture Audit — Results

**Date:** 2026-07-28
**Branch:** `main`
**Scope audited:** the uncommitted Phase 2 identity work — `backend/db/migrations/0032_session_store.sql` (new, untracked), `backend/doorway/sessions.py`, `app.py`, `server.py`, and the three test files changed alongside them. `db.py` and `identity.py` are unchanged by this work and were reviewed as the surrounding contract.

**How this was checked:** the code was read, and then the claims were *run*. All 115 tests across the seven affected suites pass. Five purpose-built probe tests were written to test the privilege boundary and concurrency behaviour directly against PostgreSQL, and were deleted afterwards. Where a finding below says "verified", it means a test was run and its output observed — not that the code looked correct.

---

## The one-paragraph version, in plain terms

The work does what it set out to do: sign-ins now survive a restart, and the rule that matters most — that a person's authority is looked up fresh from the database on every single request — is intact and unweakened. There is **one serious problem**. The new table that holds everybody's sign-in keys was made readable and deletable by `cw_viewer`, which is not only the internal role used at sign-in but also a **real job role a real person can hold**. A person granted the lowest-privilege role in the system now sits in front of a table containing the administrator's live session key. Nothing in the product exposes that today, so this is not a live breach — but the wall is down, and the only thing holding the room shut is that nobody has opened a door into it yet. That should be fixed before this ships.

---

## A. Session store & row-level security

### > [!CAUTION]
### A-1 · The session table hands every live session key to the lowest-privileged human role

`0032_session_store.sql:28-32`

```sql
grant select, insert, delete on cw.session to cw_viewer;
create policy viewer_manages_sessions on cw.session
    for all to cw_viewer using (true);
```

The migration's header explains the grant as being for "the lookup role", and on the sign-in path that is exactly what `cw_viewer` is. But `cw_viewer` is not *only* that. It is one of the six real application roles — `0001_foundation.sql:18` describes it as "read contracts and clause text; **change nothing**" — and `db.py::ROLE_TO_DB_ROLE` binds any person holding `viewer` in `cw.effective_role` to precisely this database role. The table therefore does not distinguish "the doorway looking somebody up" from "a signed-in viewer going about their day". They are the same role.

**Verified, not inferred.** A probe created an ordinary account with role `viewer`, signed the administrator in, and then ran a plain select as that viewer:

```
VIEWER SEES: [('byBBjArYMziuP3HbcXy4U6HltLlVlYXeZoSPTRkZ7nU', 'admin@clausewerk')]
VIEWER DELETED ROWS: 1
requester: InsufficientPrivilege
administrator: InsufficientPrivilege
```

So: a viewer reads the administrator's session key in the clear, and can delete every session in the system. Every other role is correctly locked out — the exposure is specific to `cw_viewer`.

**What stops this being a live breach today.** `reads.py` and `writes.py` hold fixed, whole SQL statements with no caller-supplied text composed into them; a browser cannot steer a statement toward `cw.session`. The containment is real and it was checked. But it is containment by *absence of a door*, not by a wall. The moment anyone adds a read endpoint that a viewer can reach and that touches an unexpected table — or the moment a statement anywhere starts being assembled from a parameter — this becomes full account takeover of any role, including Legal admin and Administrator, with no audit trail, because a stolen session key is indistinguishable from the real holder.

Two further consequences worth naming for the record: `select` on this table also gives a viewer a live roster of exactly who is signed in right now, and `delete` gives any viewer a one-statement way to sign the entire company out.

**Recommended fix — preferred.** Give the doorway's lookup path a database role of its own, distinct from the six application roles, and grant the table to that role alone. This is the change that matches how the rest of this schema reasons: the header of `0031` spends fifty lines on exactly this kind of "the rule was true through the front door and false through this one" problem. `identity.py:50-57` already documents `LOOKUP_ROLE` as a deliberate compromise chosen because `cw_viewer` "can do nothing else at all" — that sentence was true when it was written and this migration makes it false, so either the role or the sentence has to change.

> [!WARNING]
> **Both recommendations below were under-costed. Corrected 2026-07-28 after adversarial review — read this before acting on either.**
>
> **The "minimal" fix is forgeable.** It rests on `__signin__` being a name no real account can hold. Nothing enforces that: `cw.account.person` is an unconstrained `text primary key` ([0013_administrator.sql:117](backend/db/migrations/0013_administrator.sql:117)) with no CHECK reserving any name, the string appears nowhere in any migration, and `POST /accounts` ([writes.py:339](backend/doorway/writes.py:339)) takes the person straight from the request body. An administrator who creates an account literally named `__signin__` with role `viewer` would satisfy the policy and read every session key. Also: bare `current_setting('cw.actor')` **raises** when unset — the house form is the missing_ok variant used by `cw.app_actor()` — so any owner or maintenance path touching the table would error rather than deny, surfacing as a 500.
>
> **The "preferred" fix breaks sign-in.** `cw.app_role()` ([0013:84-94](backend/db/migrations/0013_administrator.sql:84)) is a CASE over `current_user` naming exactly the six application roles and returning NULL for anything else, and [0013:252](backend/db/migrations/0013_administrator.sql:252) reads `create policy read_all on cw.account for select using (cw.app_role() is not null)`. A new `cw_lookup` role therefore fails that policy and **sign-in breaks at runtime, after the migration lands**. Making it work needs a further migration replacing `app_role()` — after which `cw_lookup` satisfies *every* policy phrased `app_role() is not null`, and containment falls back to table-level grants: the very layer the minimal option was criticised for relying on.
>
> Neither option is unambiguously safer. Both are now costed honestly in the revision plan as **WP-011**, gated on an owner decision.

**Recommended fix — minimal, if a new role is too much for this phase** *(see the correction above — this is forgeable as written)*. Scope the policy to the sign-in actor stamp:

```sql
create policy viewer_manages_sessions on cw.session
    for all to cw_viewer
    using      (current_setting('cw.actor', true) = '__signin__')
    with check (current_setting('cw.actor', true) = '__signin__');
```

Every session call in `sessions.py` already opens with `as_person("__signin__", "viewer")`, so this needs no Python change. A signed-in viewer's transaction stamps `cw.actor` with their own account name and the policy then returns nothing to them.

Either fix should land with a test that asserts the boundary, so a later change cannot quietly reopen it. There is no such test today (see D-1).

### > [!WARNING]
### A-2 · Session keys are stored in the clear

`0032_session_store.sql:14-18`, `sessions.py:83-97`

The token column holds the bearer key verbatim. In memory that was defensible. In a table it is durable: it is now in every backup, every `pg_dump`, every replica, and every database console session for the rest of its eight-hour life, and anyone holding any one of those holds working credentials for whoever was signed in.

The standard fix is small and costs nothing at this stage: store `sha256(token)`, issue the raw token to the browser once and never again, and look up by hash. Lookup stays a single indexed equality. Doing it now is a ten-line change; doing it after there are stored sessions in a customer's database is a migration with a forced sign-out.

Token *generation* itself is correct and needs no change — `secrets.token_urlsafe(32)` is 256 bits from the OS entropy source, which is the right call and is correctly commented as such (`sessions.py:81-83`).

### > [!WARNING]
### A-3 · Expiry has no second line of defence

`sessions.py:110-116`

`person_for()` deletes expired rows and then selects by token — but the select carries **no expiry condition of its own**. Whether an expired session is honoured depends entirely on that one preceding `DELETE`.

**Verified:** with the sweep skipped, an expired row is returned as a live session:

```
EXPIRED ROW STILL PRESENT BEFORE ANY SWEEP: ('admin@clausewerk',)
```

Today the behaviour is correct, because the delete and the select share one transaction. But the entire expiry guarantee now rests on a statement whose stated purpose in the comments is *housekeeping* — sweeping abandoned rows so the table does not grow. Someone who later moves that sweep to a scheduled job for performance reasons, entirely reasonably, silently turns every expired session back on. Add the predicate:

```python
row = request.one(
    "select person from cw.session where token = %s and expires_at > %s",
    (token, now))
```

One clause, and expiry stops depending on a cleanup step.

---

## B. Transaction identity bonding — **no findings**

This was the highest-stakes item in the plan and it is sound. `db.py` and `identity.py` are unchanged by this work, and re-reading them against the checklist:

- `as_person()` executes `set local role` and `set_config('cw.actor', …, true)` inside `conn.transaction()` (`db.py:193-207`). Both are transaction-scoped, so PostgreSQL unwinds them at commit *and* rollback before the connection returns to the pool. There is no cleanup step that could fail to run.
- There is no privileged connection reachable from a request. The pool logs in as an unprivileged base user holding no application role; `borrow_bare()` is test equipment and useless for anything else. Applying the schema lives in `migrate.py`, off the serving path.
- `effective_role()` and `identity_of()` read `cw.effective_role` and nothing else. Confirmed by search: the only mentions of `cw.account.role` in `identity.py` are in comments explaining why it is *not* read.
- Failure paths fail closed. `sign_in()` raises `NoEffectiveRole` for a blank name and for anybody the view returns nothing for; `caller_for()` ends every session the person holds and then raises. `UnknownRole` is raised rather than defaulted.

`test_no_identity_survives.py` passes, along with the rest of the affected suites.

One point the plan asked about specifically — connection-pool leakage on the unauthenticated path — was traced and is clean. `sessions.py` reaches the database only through `as_person()`, using the `with` form throughout, so every session statement is inside a transaction that unwinds itself. No path in the new code holds a connection across a request boundary.

---

## C. Request parsing & the network edge

### C-1 · The `-?` regex change is safe — and it is a repair, not a hardening

`server.py:253`

The plan asks whether allowing `-` into the content-length grammar creates overflow or request desynchronisation. It does not, and the reasoning is short:

- Python integers do not overflow, and `len(raw) > 20` bounds the conversion before it happens.
- A negative length is refused at `server.py:261-262` **before** anything is read from the socket, so there is no desync window. Both the JSON path and the document path call `_content_length()` before their first `rfile.read()`.
- `transfer-encoding` in any form is refused outright at `server.py:266` and `server.py:325`, so no chunked body is ever parsed. There is no chunked-transfer surface to have a vulnerability in.
- Before the change, `-1` was already refused — as `"unreadable request"` rather than `"content length cannot be negative"`. Both are a 400 before dispatch. **The security posture is unchanged in either direction.**

### > [!NOTE]
### C-2 · Two tests were committed to `main` in a failing state, and this uncommitted work is what fixes them

This is a process observation, not a vulnerability, but it is the most actionable thing in this section.

The regex change and the `test_retirement.py` change are not improvements to working code — they repair tests that are **currently red on committed `main`**. Verified by stashing only these two files and running the committed versions:

```
FAILED doorway/test_server.py::test_negative_content_length_is_refused_before_dispatch
FAILED doorway/test_retirement.py::test_the_service_reads_exactly_one_header
    AssertionError: the bearer token is not being read at all
    assert 'authorization' in {'content-disposition', 'content-type', 'transfer-encoding'}
```

- `test_negative_content_length_…` was committed at `710cb49` asserting the message `"content length cannot be negative"`, which the then-current regex could never produce.
- `test_the_service_reads_exactly_one_header` scanned only for `self.headers.get(`, so it never saw the bearer token — which is read via `get_all` — and its allowlist of four headers had not been updated when `transfer-encoding` was added. It was failing on the very guarantee it exists to protect.

Both fixes in the working tree are correct. The widened scanner (`get(?:_all)?`) now genuinely sees every header read, and the allowlist honestly records five. But a guard test that fails silently on `main` is a guard that is not guarding, and this one protects a real rule — what a caller is allowed to influence. Worth understanding how it got committed red before the next one does.

---

## D. Tests

### > [!WARNING]
### D-1 · There is no test asserting who may reach the session table

The new store holds credentials and has exactly one thing protecting it — an RLS policy. Nothing in the suite asserts what that policy does. Finding A-1 was found by reading the migration and confirmed by a probe written for this audit; the suite would not have caught it, and will not catch its reintroduction.

Whichever fix is chosen for A-1, it should ship with a test in the shape of the probe used here: sign somebody in, then attempt to read `cw.session` as an ordinary viewer, and assert nothing comes back. That is a test of what the *system does*, not of any wording, so it is the kind that stays true.

### D-2 · The rewritten session tests lost a regression guard and were quietly weakened

`test_sessions.py`

- `test_an_entry_removed_mid_check_is_no_session_not_a_crash` was deleted. This is **defensible** — it tested a specific interleaving on the in-memory dictionary, which no longer exists.
- `test_the_store_survives_genuinely_parallel_traffic` had its iteration count cut from 200 to 50 with no note explaining why. The docstring was rewritten from naming the two specific failures it existed to catch, to the generic "proves the database correctly handles concurrent modifications". A concurrency test that is quietly made a quarter as likely to hit the interleaving it hunts for should say so, and say why.
- The new `db` fixture inserts 60 accounts inside the test file, including 50 named `p0…p49` "for all tests". Fixture setup that exists to serve tests other than the one asking for it drifts; when a later test needs `p50` this will be debugged from the wrong end.

### D-3 · The concurrency worry did not materialise — measured, not assumed

Worth recording so nobody re-litigates it. Every request now performs a `DELETE` before its lookup, and there is no index on `expires_at`, so the sweep is a sequential scan:

```
SWEEP PLAN: Delete on session -> Seq Scan on session (Filter: expires_at <= …)
INDEXES: [('session_pkey', '… USING btree (token)')]
```

Twelve threads sweeping 2,000 simultaneously-expired rows at once:

```
FAILURES: []
WALL CLOCK for 12 concurrent lookups: 0.033s
ROWS AFTER: 0
```

No deadlock, no lock-wait pile-up, no failures, and the sweep is correct. There is no defect here at present scale. Two things are still worth doing cheaply, as insurance rather than repair: add `create index on cw.session (expires_at);` and `create index on cw.session (person);` so the per-request sweep and the revocation delete stay index-driven as the table grows. And note for the record that read endpoints now perform a write, which forecloses ever serving reads from a replica.

---

## Adherence to `CLAUDE.md`

- **Simple and concise** — met. The store is one small table and five short methods, and the memory implementation was removed rather than left alongside.
- **Document decisions and rationale** — partially met. The migration explains *what* it does and why sessions moved to the database, and the switch from `time.monotonic` to `time.time` carries a genuinely good one-line reason. But the single most consequential decision in the file — reusing `cw_viewer`, which widens what a real job role can reach — is recorded only as "the lookup role", with no note that the role is also held by people. Measured against the header of `0031`, which spends fifty lines on precisely this class of "true through the front door, false through this one" problem, `0032`'s header is thin at the exact point where it needed to be thickest.
- **Never test content** — met. Nothing in the changed tests pins clause language or product wording. (`test_server.py:728` asserts on an HTTP error string, but that is pre-existing and is arguably system behaviour rather than content.)
- **Content is placeholder** — respected. No content gap is reported anywhere in this audit.
- **Product boundary** — respected. Every finding above is about the system: who may read a table, when a credential expires, what a test guards.

---

## Recommendations, in the order they are worth doing

1. **Fix A-1 before this ships.** Either a dedicated lookup role or the actor-scoped policy. This is the only finding that changes who can act as whom.
2. **Ship a boundary test with it (D-1)**, so the wall stays up.
3. **Hash the token (A-2)** while the change is still ten lines and there is no stored data to migrate.
4. **Add the expiry predicate to the lookup select (A-3)** — one clause, and expiry stops depending on a housekeeping step.
5. **Add the two indexes (D-3)** as insurance.
6. **Understand how two guard tests reached `main` red (C-2).** The fixes are correct; the gap that let them land is the thing to close.
7. **Tidy `sessions.py`:** `threading` is imported and no longer used (line 32), and `Database` is used in the `__init__` annotation but never imported — this works only because of `from __future__ import annotations` and will surprise anyone running a type checker.

---

### One note on the state of the branch

Two commits (`0d301ef`, `fe2990c`) landed on `main` from another session while this audit was running, and further files were modified in the working tree afterwards. None of them touched the Phase 2 identity files, so nothing above is affected. Flagging it only so the reader knows the tree moved underneath this report and the findings are anchored to the Phase 2 changes specifically.
