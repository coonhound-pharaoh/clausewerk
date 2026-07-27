# Port notes — JavaScript service → Python doorway

A running list of every difference found between the two languages while porting.
Each one is either a Python bug to fix or a JavaScript bug to record. Nothing on
this list was silently smoothed over.

Started WP-P2 (the 25 reads), 2026-07-26. WP-P3 and WP-P4 continue it.

---

## WP-P2 · The 25 reads

### How equivalence was actually proved, and what that does not cover

The two services run on **different databases**: the JavaScript service on PGlite
(in-process, one connection), the Python doorway on standard PostgreSQL. So a
live row-for-row diff between them would be comparing two separate instances, and
any difference found would more likely be seeding drift than port drift.

What was proved instead:

- **All 25 statements match the JavaScript character for character** (whitespace
  aside), read out of `service/app.mjs` at test time rather than from a copy.
  This covers every row for every role, not merely the rows a seeded system
  happens to hold.
- **Every statement runs against the migrated schema as two different roles** —
  an Administrator and a requester — with a broken statement (undefined column,
  undefined view, syntax error) failing the test outright. This is the check that
  found the `GET /waiting/tickets` fault in the JavaScript, carried across.
- **Every read a requester is refused is confirmed to refuse**, in words, rather
  than answering an empty list.

What is **not** covered: the two services' outputs have not been diffed side by
side on identical data. Given identical statement text, identical schema and
identical binding of role and actor, identical rows follow — but that is an
argument, not an observation, and it is recorded as one.

### 1 · `GET /holds` names its rule too thinly — **JavaScript, recorded, not fixed**

The note reads `cw.legal_hold policies`. Every other read names the specific rule
or grant that decides. This one names the table and leaves the reader to find
which of its policies applies.

Carried across unchanged, because the port's job is not to improve. Worth a
sentence when somebody next touches legal holds.

### 2 · Refusal bodies carry one extra field in Python — **Python, deliberate**

| | JavaScript | Python |
|---|---|---|
| body | `{error, reason}` | `{error, reason, kind}` |
| statuses | 403, 400 | 403, 409, 400 |

`kind` is one of `not_permitted`, `refused_on_merits`, `rejected`, and 409
distinguishes "the act itself is refused right now" from "your role may not".
Purely additive: the screens read `error` and `reason`, which are unchanged and
carry the database's own words in both.

On reads specifically the two behave identically in practice — a `select` that
fails, fails on privilege (403) or on the statement (400). The 409 case belongs
to writes and arrives properly in WP-P3.

### 3 · Rows are returned by column name — **Python, new**

`Request.rows()` was added to `db.py`. The JavaScript driver returns labelled
rows natively; the Python one returns tuples, and an interface cannot render a
tuple without holding a second copy of the SELECT list, which would then be the
second thing to drift.

No behaviour change: same rows, same column names, same order.

### 4 · `GET /overrides` shows every requester's overrides to everybody — **schema, confirmed, open**

Not a port difference. It is present in both languages, and it is the most
serious thing this package found.

`cw.override_status` is a view over `cw.override_request`. A PostgreSQL view runs
with its **owner's** rights, and the owner is exempt from row-level security — so
the view hands back every row regardless of the `read_scoped` policy underneath
it. Select on the view is granted to all six roles.

Observed, on a seeded database, not argued:

| asked by | `cw.override_request` (policy applies) | `cw.override_status` (the view) |
|---|---|---|
| a requester, owner of 1 of 2 requests | 1 | **2** |
| a viewer, told about nothing | 0 | **2**, justification text included |

The viewer case is the sharp one. ADR-0008 created that role precisely so a
contract could be shown to somebody without giving them a way in.

The endpoint's own rule note claims "a requester sees their own, Legal and Audit
see all, a viewer sees only what they were told about". That sentence is
currently false, which makes it worse than no note at all.

**Where the fix belongs:** the view, in `db/migrations/`, not the doorway. Adding
a `WHERE` to the endpoint would be exactly the second copy of the permission
model this whole layer exists to avoid. `security_invoker = true` is the obvious
fix and is the wrong one — it evaluates as the caller, who then needs SELECT on
every joined table, and a viewer holds none. The scoping goes in the view's own
`WHERE` clause in the same words as the policy, which is the pattern
`0017_reading_room.sql` already uses.

**CLOSED, same day — and the sweep that followed matters more than the bug.**
`0019_override_views_scoped.sql` put the scoping in the view's own `WHERE`
clause, in the same words as the `read_scoped` policy.

The role-based-UI session then asked the catalogue for siblings rather than
reading for them, and found **five more**, including two this note had recorded
as clean:

| view | an unshown viewer could read |
|---|---|
| `override_passes` | approved findings, with justification text |
| `agreement_chain` | counterparty, filename, document SHA-256 |
| `execution_evidence_gap` | which signed agreements are missing a signature |
| `agreement_drift`, `sow_conflict`, `orphaned_sow` | empty on the seed, same unscoped shape |

`override_passes` is the one worth learning from. This note called it clean
because it came back empty — but it filters on `decision`, so it is correctly
empty right up until the first approval lands. **An empty result is not evidence
of scoping.** The analysis here checked which base tables scope by person and
then reasoned about grants; it should have checked what each view actually
returns to a role that should see nothing, with data in it.

`execution_evidence_gap` is the sharpest: a list of the weakest contracts in the
business, readable by anybody with a viewer account.

One view was deliberately left unscoped. `cw.sow_override_in_force` is read by
the schema's own trigger, and scoping it made a properly authorised statement of
work be refused — **a view the schema itself reads must return the same rows to
everybody**, or a permission becomes a correctness bug that fails towards
refusing legitimate work. Relevant here: anything the doorway calls that reads a
view under a definer-rights function inherits that trap. WP-P6's
`check_manifest` connection reads `cw.category` directly and is not exposed to
it.

The lasting fix is theirs too: `db/test/views-are-not-policies.test.mjs` asks the
catalogue for every view a viewer can read and fails unless each is classified,
with a reason. That is the shape of guard this finding deserved.

The two tests were written as **strict** xfail — passing while the leak existed,
failing the moment it closed. They failed within the hour, which is exactly what
that strictness is for: nobody had to remember to come back. They are ordinary
tests now, and they stay. A guarantee that was once broken is the one worth
watching.

**How it was found:** the role-based-UI session warned that a view does not
inherit the policies underneath it. Twelve of the 25 reads point at views over
protected tables; of those, only three sit over a table whose read policy scopes
by PERSON rather than by role, and only one of those three is granted to roles
that the scoping was meant to hold back. `cw.person_activity` and
`cw.review_quality` are granted only to roles that already read the whole chain
or the whole queue, so bypassing the per-person scoping gives them nothing they
were not entitled to. One real leak, checked rather than assumed.

### 5 · Nothing else in the reads

---

## WP-P3 · The 27 writes

### 6 · Numbered placeholders do not survive a literal port — **Python, structural**

The JavaScript numbers its parameters `$1, $2, $3`, and PostgreSQL binds those by
NUMBER wherever they appear. The obvious port is psycopg's `%s`, which binds by
**order of appearance**. In three of the 27 statements the numbers do not appear
in order:

    POST /settings          set value = $2 where key = $1
    POST /settings/decide   set value = $2, rationale = $3 … where key = $1
    POST /grants/revoke     select … , $2 from cw.role_grant where grant_id = $1

Ported naively, `POST /settings` would set the setting's key to the new value and
look for a setting named after that value. It would not fail. It would write the
wrong thing and report success — the worst available outcome, and invisible in a
system with no settings a test happened to check.

Verified rather than assumed: `select %s, %s` with `("VALUE", "KEY")` binds them
in the order written, confirming the hazard is real.

**The fix is structural, not careful.** Every placeholder is named after the
field that fills it — `%(value)s`, `%(key)s`. Binding no longer depends on where
a placeholder sits in the sentence, and a name that does not match the declared
field list fails loudly on the first call. The statement-comparison test rebuilds
the JavaScript's `$n` into the Python's field names before comparing, so it
proves the statements agree **and** that the field order matches the numbering.

### 7 · A write that changes nothing is no longer reported as done — **Python, deliberate divergence**

The one place this port changes behaviour on purpose. The work package requires
it and finding D1 is why.

An UPDATE refused by a missing policy does not raise. It changes nothing and
reports success. Four of the 27 are UPDATEs, and the JavaScript answers
`{"rows": []}` for all of them — which a screen renders as "saved".

| | JavaScript | Python |
|---|---|---|
| an UPDATE matching no row | `200 {"rows": []}` | `409 kind="changed_nothing"` |

Every statement in the set returns something, so nothing returned means nothing
happened. `run()` raises `SilentlyRefused`.

### 8 · Two acts the schema does not audit — **schema, recorded, not fixed**

Opening a hold is recorded in the audit chain (`legal_hold_opened`). Creating a
category (`POST /categories`) and opening a deal (`POST /deals`) are not — they
leave no trace in `cw.audit_event` at all.

Found while writing the attribution test, which needed two audited acts by two
different people and initially picked two acts that record nothing. Whether those
two *should* be audited is a schema judgement and not the doorway's to make, so
it is written down rather than acted on. Worth a look by whoever owns the chain:
a deal opening is the act every scoping decision afterwards hangs off.

### 9 · Two test suites cannot share one database — **test harness, fixed**

Not a port difference, but it cost an hour and it will cost the next person the
same.

Each test in this suite drops the whole `cw` schema and rebuilds it from the
migrations. The role-based-UI session's suite does the same. Run at the same time
against the same database, the two **deadlock** — one holding the schema while
the other waits to drop it — and the failure surfaces as `schema "cw" does not
exist` halfway through migration 0003, which reads exactly like a broken
migration and is not one.

`conftest.py` now builds and uses `clausewerk_doorway`, a database of its own,
created on first run. The shared `clausewerk` database is left to everybody else.
Override with `CW_TEST_DATABASE`.

### 10 · Nothing else in the writes

The remaining 24 statements carried across with no difference. The three rules
are checked rather than stated: one act per endpoint is **counted**, the no-retry
rule is checked by walking the module's syntax tree for a refusal being caught
and the statement run again, and no endpoint takes an actor from the body — each
of the 27 checked against a list of names that are all actors.

No behaviour difference was found in the other 24 endpoints, and no permission
logic was added on either side. There is not one role comparison in
`reads.py` — checked by a test that strips comments and docstrings first, so the
sentence explaining the ban cannot trip the check on the ban.

---

## WP-P4 · The web server and the screens

### 11 · No web framework — **Python, deliberate**

The standard library's `ThreadingHTTPServer`, as the JavaScript used Node's
built-in server. This layer is a router and a JSON encoder; a framework would add
a dependency, a configuration surface and a set of conventions to the one part of
the system that has to stay readable in full. The engine has no dependencies at
all and the doorway has one — the database driver. Worth keeping.

**Threaded is not a performance choice.** The whole identity scheme rests on a
connection being handed out, used for exactly one unit of work and handed back
carrying nothing. Served one request at a time, that promise would never be
exercised.

### 12 · The bootstrap ceremony cannot give its two people different units — **schema, worked around honestly**

`cw.bootstrap` takes one `p_unit` and applies it to both accounts it creates. It
cannot put the first Administrator in Operations and the first Legal admin in
Legal.

That is a real limit rather than an oversight: at the moment of the ceremony
there is no Administrator yet to say where anybody sits. The JavaScript seed
declared different units for the two and simply did not get them.

The seed now passes the Administrator's unit to the ceremony and has the
**Administrator correct the Legal admin's** afterwards, as an ordinary recorded
act through the doorway. Writing it straight in as the owner would have put a row
in the system that the system could not have reached on its own, which is the one
thing that file exists not to do.

### 13 · Two services, one port, and a browser that picks the wrong one — **worth knowing**

Both services default to port 8787. On Windows the JavaScript service binds
`0.0.0.0` and the Python one binds `127.0.0.1`, so both can listen at once
without either failing — and a browser asking for `localhost` may resolve to IPv6
and reach the JavaScript one.

This cost real time during the WP-P4 walkthrough: the Administrator's screen
showed a unit that did not match the database, because the screen was being
served by the other service against a different database entirely. The tell was
an audit act (`watcher_added`) that the seed never performs.

Until WP-P5 deletes the JavaScript service, use `--port` and address
`127.0.0.1` explicitly when it matters. **A screen disagreeing with the database
is worth checking twice** — the second answer was that both were right and they
were different systems.

### 14 · What the walkthrough actually proved

All six workspaces opened against the Python service, in a real browser, as the
six seeded people, each showing the right person, the right role and the right
workspace. Every API call returned 200; no console errors. The Administrator's
pane showed Pat Nkemi's grant as countersigned by Rae — the countersign rule
visible on screen rather than asserted in a test.

The JavaScript service's 30 tests were re-run afterwards and all 30 pass, which
is the check that the specification did not drift while the Python caught up.

---

## WP-P6 · Connecting the engine

### 15 · One database per RUN, not per suite — **test harness, second attempt**

Per-suite (note 9) was not enough. `npm run verify` runs this very suite, so two
people verifying at once are two processes rebuilding the same schema. The
database name now carries the process id.

The first version of that fix also **deleted other runs' databases** — it looked
for `clausewerk_doorway_*` with nobody connected, reasoning that a live run
always holds a connection. It does not: this suite closes its pool after every
test, so a healthy run is unconnected for a moment between each one. A second run
starting in that gap destroyed the first one's database, and the failure looked
exactly like the deadlock it was meant to prevent.

The automatic cleanup is gone. A killed run leaves a database behind, which is
untidy and harmless. `drop database` is not a tidying operation, and a guess
about whether somebody else has finished is not a good enough reason to run it.

Worth knowing when reading a failing run: **16 errors that look like broken
migrations are almost always two suites at once.** A clean single run of this
suite is 399 tests and about four minutes.

### 16 · The audit chain refuses concurrent writers — **schema, open, found by making the two-writers test real**

The plan listed "real concurrency for the two-writers audit test" as a promise
that had become *possible* on standard PostgreSQL, and left it out of scope. It
was written in WP-P5, and it immediately found something.

`cw.audit_event` carries a unique index on `prev_hash` (`audit_no_fork`,
migration 0007) so that no second chain can ever be started alongside the real
one. Under genuine concurrency, two people appending at the same instant read the
same chain tail, compute the same `prev_hash`, and collide.

What actually happens, observed rather than reasoned about:

- The second writer **blocks** on the first's lock — held open, the two
  transactions deadlock the test process indefinitely. The chain therefore
  **serialises every governed act in the system**.
- If both did read the same tail, the second is refused on the first's commit
  with `duplicate key value violates unique constraint "audit_no_fork"`. That is
  not a sentence anybody can act on, and the act it refused was honest.
- Over HTTP it is **intermittent**: usually the first commits fast enough that
  the second reads the new tail. Eight simultaneous writes collide sometimes and
  not others.

It surfaced only after `0020_deal_and_category_openings.sql` added audit triggers
to deal and category creation — before that, the two writers in the test wrote to
different tables and never contended.

0007's own note says the no-fork index was "checked for false positives …
ordinary appends … two events with identical content written in the same instant
all pass". That check was true and is now misleading: it ran on a database
allowing one connection, where appends cannot overlap.

**No test for this is in the suite, deliberately.** A deterministic reproduction
blocks forever, and a probabilistic one flips between xfail and xpass and teaches
everybody to ignore it. What is in the suite is the promise that still holds:
under concurrent writes by two people, **everything that lands is attributed to
whoever actually did it**. A refused write recorded nothing, which is correct.

**Whose it is:** the database's. The doorway must not retry — that is WP-P3's
rule 2, and a retry here would be a governed act quietly performed twice.
