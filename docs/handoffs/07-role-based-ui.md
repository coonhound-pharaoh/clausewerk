# Handoff · The role-based UI and the Administrator

**State: fourteen of sixteen packages closed. What remains is `WP-U13` (the
Legal admin's workspace) and `WP-U15` (the acceptance sweep). Neither is
blocked.**
Written 2026-07-26 for somebody picking this up cold, revised as work landed:
`WP-U13`'s read models, then the Python service lifting the block on all three
(§4), then the Auditor's workspace on 2026-07-27.

**Start here if you are picking this up:** §4 says exactly what is left and which
single endpoint the viewer's reading room is waiting on.

Your source of truth is
[`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](../../UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md).
Every closed package carries a note under its heading saying what shipped, what
it cost, and what it taught. Read the notes on `WP-U11` and `WP-U14` first —
they are where the two real bugs were found — then `WP-U13`'s, which is where a
*test* was found to be worthless while passing.

---

## 0. Ground rules (read these; they are binding)

**The owner is Mike.** [`CLAUDE.md`](../../CLAUDE.md) auto-loads:

- Prefer simple, concise solutions.
- **Always plain business language, never developer jargon.** Mike is an
  executive. This is the rule most easily broken by accident.
- Record important decisions in [`memory.md`](../../memory.md), in plain
  language. Engineering detail goes in `docs/decisions/`.
- **The product boundary:** we are responsible for the *system* — recording,
  gating, checking, provenance. We are **not** responsible for the contract text
  inside it. Surface a content gap and route it to a named person; never frame it
  as ours to fill.

**The verification culture matters more than the code.** Every guarantee has a
mutation that deliberately breaks it and asserts the test notices. A mutation
caught by a test *other* than the one it names scores as a **failure**
(`IMPRECISE`), because the named test was never exercised. If you add a
guarantee, add its mutation and confirm it reports `ok`.

---

## 1. What exists

**Migrations `0013`–`0023`**, all with suites and mutations:

| Migration | What it adds |
|---|---|
| `0013` | `cw_administrator`, `cw.account`, `cw.role_grant`, the settings split, watcher lists, checkpoint move, health evidence |
| `0014` | `cw.person_activity`, `cw.access_summary` — the people console's read models |
| `0015` | The override request workflow: request, socialisation, per-finding decisions |
| `0016` | `cw_app`, the doorway's login — **not this workstream's**; it belongs to the Python session |
| `0017` | `cw.agreement_share` and the reading room |
| `0018` | `cw.library_entry` and `cw.ladder_board` — `WP-U13`'s read models |
| `0019` | Scoping six views that were handing every signed agreement, and every override justification, to anybody — see §5.1 |
| `0020` | `agreement_opened` and `category_created` — a deal's birth is on the chain |
| `0021` | The audit chain's `seq` is assigned under the append lock — see §5.10c |
| `0022` | Owner decisions **U9–U11**: destruction never automatic and the Administrator's alone; supersession flags in-flight deals (`cw.run_drift`); the Administrator may read the library |
| `0023` | Owner decision **U12**: redact (content goes, fact stays — **delegable**) then purge (record goes — **Administrator alone**). The escalation is the control |

**On the numbering, because it will look odd.** The reading room shipped as
`0016` and was renumbered to `0017` when the Python session landed its own
`0016` in parallel. This file's migration moved rather than theirs, because
theirs belonged to a session still running and renaming a file out from under
live work causes the problem it was meant to prevent. Run order is unchanged —
`0016_doorway_login` already sorted ahead of `0016_reading_room`, and neither
reads anything the other writes. This workstream then took `0018`–`0023`, and
the Python session has confirmed it needs no migration of its own — so
**the next free number is `0022`.**

**A Python service** at [`backend/doorway/`](../../backend/doorway) — 29
endpoints (the 52 ported, plus four this workstream needed). **The JavaScript
service is gone**: `backend/service/` was deleted on 2026-07-27 with owner
approval (WP-P5). See §3 for what moved and §5.12 for what its deletion cost.

**A working shell** at [`prototype/v4/`](../../prototype/v4). Six workspaces,
one per role. Run it:

```bash
cd backend && python -m doorway.seed_demo
python -m doorway.server --static ../prototype/v4 --port 8787
```

Sign in at `http://127.0.0.1:8787` as any of six seeded people. **Address
`127.0.0.1`, not `localhost`** — habit worth keeping even now that only one
server exists, because `localhost` may resolve to IPv6 and the failure it
produced was a screen disagreeing with the database.

**The bar:** `cd backend && npm run verify` — 23 suites, 161 engine tests,
215 + 49 mutations. It takes **over ten minutes**, almost all of it the mutation
sweep spawning a database per check. Somebody will be tempted to trim it. The
honest fix is parallelism or a faster database, not fewer checks.

**Last full run, 2026-07-27:** 21/21 suites, 161 engine tests, 215/215 and 49/49
mutations — all green, preflight clean. **Twenty suites, not twenty-three:**
`endpoints`, `mutations-api` and `service` went with the JavaScript service, and
the 15 service mutations with them — each re-proved in
`backend/doorway/mutation_check.py` and listed by name in `mutation-check.mjs`
where they used to live.

**One caveat about `npm run verify`, and it is worth understanding before you
trust a red one.** The chain runs `test:doorway` — the Python session's pytest
suite, against a **real PostgreSQL server**. The suites in `db/test/` are
different: each builds a fresh in-memory PGlite and touches no server at all, so
they cannot collide with anybody.

That distinction is the whole of it. Running the full bar while another session
was working meant running *their* suite against the shared database at the same
time they were, and each of their tests drops and rebuilds schema `cw`. The
result was `tuple concurrently updated`, `relation "cw.account" does not exist`
and `InvalidSchemaName` partway through migration `0003` — which reads exactly
like a broken migration and is not. The same suite gave 129 passed / 36 errors
and then 341 passed / 3 failures minutes apart with no code change in between.

They have since split their fixtures onto their own database
(`clausewerk_doorway`), so this should not recur. **Do not add the same
machinery to `db/test/` — there is no server there to contend for.** If you want
a signal from this workstream alone:

```bash
cd backend && npm test && npm run test:engine && node db/test/mutation-check.mjs
```

That path touches no server and is deterministic. **Do not "fix" a doorway
failure you cannot reproduce twice** — check whether somebody else is running
before you go looking for a broken migration.

---

## 2. The four owner decisions, settled

Recorded in [`memory.md`](../../memory.md),
[`docs/open-questions.md`](../open-questions.md), and as rows in
`cw.governance_setting`.

| | Decision | Settled as |
|---|---|---|
| `U5` | The Administrator's boundary | **Steward, with sight.** May *read* contract content; writes none of it, decides nothing. Say **content-visible, content-powerless** — never "content-blind", which it is not |
| `U6` | Countersign | **Two names for the two Legal roles only.** An uncountersigned Legal grant confers *nothing* |
| `U7` | Checkpoints | **Move** to the Administrator; Legal admin's right **revoked**, not shared |
| `U8` | Workspace model | **Six role-scoped workspaces**, waiting lists first, deals as the requester's unit |
| `U9` | Destruction | **Never automatic** — no timer, job or trigger, and a test asserts it. The authority **moves** to the Administrator; legal admin's is **revoked**, not shared. Amends `U5`: the role now performs one content-affecting act |
| `U10` | Supersession | Mints a **new version**, never rewrites wording already committed to. Signed **and in-flight** deals are **flagged** as carrying obsolete language — `cw.agreement_drift` and `cw.run_drift` — never corrected |
| `U11` | The Administrator and the library | **May read it.** Settles §9a. The gap was the *grant*, not the policy. No write added |
| `U12` | Ending a record's life | **Two acts.** *Redact* — content goes, fact stays; **delegable** by the Administrator to a named person, revocably, on the record. *Purge* — the record goes; **Administrator alone, undelegable**, and only on something already redacted. The escalation is the control: one-step erasure is refused by the function AND by a table constraint |

---

## 3. The language decision, and what it means for you

**Effective 2026-07-26, the service is written in Python.** JavaScript keeps one
job: the screens. The plan is
[`PYTHON-REVISION-PLAN-2026-07-26.md`](../../PYTHON-REVISION-PLAN-2026-07-26.md).

- **Do not add endpoints to `backend/service/`.** The 52 there are frozen as the
  specification the Python must match. `backend/service/` is deleted at `WP-P5`.
- **Migrations continue unchanged.** Both languages share them.
- **`prototype/v4/` stays JavaScript** and stays as written.

---

## 4. Where the remaining three packages stand

**ALL THREE ARE NOW UNBLOCKED.** `WP-P4` landed on 2026-07-26: the Python
service answers all 52 endpoints and serves `prototype/v4` unchanged, walked in
a browser as all six seeded people. The thing every remaining package was
waiting on is done.

```bash
python -m doorway.seed_demo
python -m doorway.server --static ../prototype/v4
```

**Address `127.0.0.1` explicitly and pass `--port`.** Both services default to
8787 and on Windows both can listen at once — Node binds `0.0.0.0`, Python binds
`127.0.0.1` — so a browser asking for `localhost` may resolve to IPv6 and reach
the *JavaScript* one. That cost the other session real time: a screen disagreed
with the database, and the answer was that both were right and they were
different systems.

**`WP-U13` (Legal admin's workspace) — READ HALVES BUILT, and the package
CANNOT CLOSE.** [`library.jsx`](../../prototype/v4/app/library.jsx) ships the
library and the ladder board against `0018`'s two views. **Six governed acts it
asks for have no endpoint in either language** — activate/retire/supersede,
conflict-rule editing, concession promotion, rung/floor reordering, hold release,
retention destruction. None was ever among the frozen 52; the package was paused
before anyone looked, so nothing surfaced it. Two of them are the most dangerous
acts in the product and need designing, not endpoint-shaped guesses. Written up
as [`docs/open-questions.md`](../open-questions.md) §9b — **it is a decision for
the owner, and `WP-U15` must not mark this package complete on its read halves.**

**`WP-U14` (Auditor and Viewer) — CLOSED 2026-07-27.** Both workspaces built:
[`auditor.jsx`](../../prototype/v4/app/auditor.jsx) (chain explorer, review
quality, origin mix) and [`viewer.jsx`](../../prototype/v4/app/viewer.jsx) (the
reading room). 13 tests in `shell.test.mjs`, 11 mutations.

**Two rules on the viewer's surface are enforced on BOTH sides, and should
stay that way.** Neither reading-room endpoint takes a parameter — "this share,
this person" stops being a rule the moment the browser can name an agreement —
and **no export route may exist**, because ADR-0008 withheld it deliberately and
a convenience is how a withheld decision gets undone. The doorway asserts both;
so does `shell.test.mjs`. A single-sided check here would be worth much less.

**Two things `WP-U15` must actually do, not just re-run.** The reading room's
share list is walked and its scoping proved, but **the per-clause paper render
has never been seen on screen** — `cw.reading_room_clause` joins through
`cw.run_decision`, so it needs a real run behind the agreement (manifest,
snapshot, ruleset, resolution, decisions). And the executed agreement in the
demo fixture was inserted **as the owner**, because there is no execution
endpoint — that is the document service and it is not built. Neither is a
defect; both are gaps a sweep is supposed to find, and faking either would
produce the seeded-system-that-looks-busy the seeding principle rejects.

**`WP-U15` (acceptance sweep) — was blocked on a service about to be replaced.**
That service is now replaced, so the sweep can be trued against the Python one.
Note `backend/service/` still exists pending Mike's approval of `WP-P5`; see
§5.10a for what actually depends on it.

**Mike's instruction, 2026-07-26:** *pause the screens; build their read models
now.* That is why `0017` and `0018` exist and why no `WP-U13` or `WP-U14` screen
does.

### The database half of `WP-U13`, now closed

Most of it already existed — `cw.clause_version_state`, `cw.selectable_clause`,
`cw.coverage_gap`, `cw.ladder_health`, `cw.ladder_rung_state`,
`cw.concession_rate`, `cw.library_proposal`, `cw.active_conflict_rule`,
`cw.retention_due`, `cw.clause_entrance`. What was missing was *consolidation*,
and `0018` adds it:

- **`cw.library_entry`** — one row per clause version: clause, version, state,
  expiry and rationale in one place, plus the category's human name, whether the
  version is load-bearing on a ladder, and whether its category is uncovered at
  that severity.
- **`cw.ladder_board`** — one row per rung, in order, floor marked, the ladder's
  health repeated onto every line. An **empty** ladder appears as one row with a
  null rung, which is the row that matters most.

Both are convenience joins and neither adds a control — the grants copy the
existing surface exactly rather than widening it by one role. See §5.7 and §5.8
for the two things that went wrong on the way.

**One thing was surfaced rather than fixed.** `cw_administrator` holds no
`select` on the clause library or the ladders at all, which contradicts owner
decision U5 — the role is *content-blind* against the library, the one word U5
says never to use for it. It reads executed agreements perfectly well, so the two
halves of "contract content" disagree. Granting it on `0018`'s views would have
closed the gap in the one place nobody would look and made two convenience joins
the Administrator's only window onto the library. It is a decision about a role's
boundary, so it went to the owner: `docs/open-questions.md` §9a.

---

## 5. Traps, all of which caught me

**5.1 — A view does not inherit the policies underneath it.** A PostgreSQL view
runs with its **owner's** rights; the owner ran the migrations and bypasses
row-level security. So a view over a policy-protected table hands **every row**
to whoever selects from it. The reading room (`0017`) shipped with a comment
claiming the policy protected it. It did not, and the test caught it.

`security_invoker = true` is the obvious fix and was the **wrong one there**: it
evaluates as the caller, who then needs `SELECT` on every joined table — and a
viewer holds none on `cw.agreement` or `cw.run_decision`, so the reading room
became "permission denied" for the role it exists for. The scoping went in the
view's `WHERE` clause instead, in the same words as the policy, with a test
holding the two halves together.

**The corollary, which `0018` had to answer.** Not every view needs that
treatment — `0018`'s two need none, because the tables under them are readable by
any signed-in role, so there is no per-person scoping to lose and the *grant*
carries what the policy asserts. But "it only joins things they can already read"
is a claim, and 5.7 is about what happens to unproven claims. It is asserted
there by a test that selects from both views on a connection holding no
application role (`cw_app`, the doorway's idle pool login) and requires a
refusal.

**AND IT HAPPENED AGAIN, FIVE MORE TIMES — read `0019`.** This warning has been
in this file since the reading room, and prose did not stop it. `0019` scoped
six views that had none: `cw.override_status`, `cw.override_passes`,
`cw.agreement_chain`, `cw.execution_evidence_gap`, `cw.agreement_drift`,
`cw.sow_conflict` and `cw.orphaned_sow`. Two leaked on seeded data — a viewer
who had been shown nothing read every signed agreement's counterparty, filename
and document hash, and the list of which agreements were missing their signature
evidence.

`cw.agreement_chain` is this hole reopened: `0017` narrowed the four tables that
carry a signed contract and scoped the view it had just written, and never
touched the three views in `0006` that had been reading those same tables since
long before. **Closed at the front door, left open at the side.**

So there is now a mechanical guard —
[`views-are-not-policies.test.mjs`](../../backend/db/test/views-are-not-policies.test.mjs)
— which asks the catalogue for every view a viewer can read and fails unless each
one is classified with its reason. See §5.9 and §5.10 for the two rules that came
out of it.

**5.2 — Test an endpoint's SQL against the real schema.**
`GET /waiting/tickets` shipped selecting three columns `cw.review_ticket` does
not have. It failed outright for anybody with a ticket, and nobody noticed for
two packages: the seeded system had none, and *an empty result and a failed
query look identical* from a workspace that renders "nothing is waiting on you"
either way. [`endpoints.test.mjs`](../../backend/db/test/endpoints.test.mjs) now
runs every endpoint's SQL. **Port that test when the Python endpoints land.**

**5.3 — A source assertion trips on its own warning.** Four separate times, a
test asserting a forbidden pattern is absent failed on the *comment explaining
why it is forbidden*, or on UI copy naming what was retired. Strip comments; for
UI bans check only button text and `data-testid`; for behaviour bans enumerate
the calls made rather than searching for a word.

**5.4 — A mutation must key on the definition that survives all migrations.**
`cw.app_role()` is defined in `0001` and redefined in `0013`. A mutation keyed on
`0001`'s copy silently cancelled itself out and reported "nothing guards this"
for a protection that was intact. When code moves file, its mutations report
`SKIP` — that is the harness catching its own rot, and it means *repoint*, not
*delete*.

**5.4a — The subtle version of 5.4: `MISSED`, not `SKIP`.** 5.4 describes a
mutation whose `find` no longer matches, which reports `SKIP` — the harness
catching its own rot, loudly. The quieter case is a `find` that *still matches an
earlier copy* of a definition a later migration replaces. The mutation lands, the
later `create or replace view` overwrites it wholesale, and the harness reports
**`MISSED` — "nothing guards this"** for a guarantee that is perfectly intact.

It happened here. `0019` redefines `cw.override_passes`, and two mutations keyed
on `0015`'s copy — ending in a semicolon only `0015` has — went stale in exactly
that way. The two guarantees left reading as unguarded were *the gate opens on
approval, never on request* and *a rejected finding is never let past*, which are
the two this whole workflow exists to hold.

**So: after redefining anything in a later migration, re-run the mutation sweep
and read the `MISSED` list, not just the count.** The fix is to key on text
present in *every* copy — dropping the trailing semicolon here matched both, so
both are mutated and the surviving definition is the mutated one.

**5.5 — A refusal that affects zero rows is not a refusal.** An RLS `USING`
clause that excludes the row makes an `UPDATE` complete having changed nothing
and raised nothing — a console renders that as a successful save. The settings
split hit this exactly. `USING` now admits both writing roles and the rule is
enforced by a trigger that *raises*, naming the rule.

**5.6 — Force-killing the service corrupts a PGlite data directory.** Regenerate
with `seed-demo.mjs`.

**5.7 — A mutation that refuses to break is telling you something, and it is not
"good".** Writing `0018`'s mutations, one reported `MISSED`: the duplication it
tried to induce could not happen, because a rule in `0003` forbids it. The test
it named passed, and would have passed forever, looking exactly like protection.

That is the whole argument for this discipline in one incident. **A test nobody
has ever seen fail is a claim, not evidence** — and the only way to tell the two
apart is to try to break it and watch. When one refuses, the honest moves are:
keep the test if it still tells a reader the right shape, and **write down beside
it where the protection actually comes from**, including what would have to
change for it to need a real guard. Do not delete it quietly. A missing mutation
and a forgotten one are indistinguishable six months later.

**5.8 — An inner join reports a broken thing as no thing.** `cw.ladder_health`
goes to the trouble of reporting a status of `empty`; an inner join from ladder
to rung deletes precisely those ladders from the board. The screen then renders
every ladder except the broken ones — a configuration error shown as absence,
which reads identically to health.

This is 5.2 wearing a different costume, and it is worth holding the general
shape in mind rather than the two instances: **the dangerous failures in this
system are the ones that render as calm.** An empty result, a shorter list, a
missing row, a silent no-op. Whenever a query could return fewer rows than it
should, ask what a screen would show — and if the answer is "the same thing it
shows when everything is fine", that is the case to test by name.

**5.9 — A view the SCHEMA reads must answer the same for everybody.**
`cw.sow_override_in_force` was scoped along with the other six in `0019`, and it
broke statement-of-work execution outright: the trigger in `0012` that decides
whether a SOW may contradict its master *consults that view*. Scoped, the trigger
found nothing, concluded the departure had never been authorised, and refused a
properly approved SOW.

So the two kinds of view are not interchangeable. **Access scoping belongs on
views people read. Putting it on a view a rule reads turns a permission into a
correctness bug** — and it fails in the direction of refusing work that was
properly authorised, which is the expensive direction. `cw.override_passes` is
read the same way by `cw.record_override_gate()` and is safe only because that
function is executable by three roles that always hold one. Anything wiring the
engine in through a definer-rights function should read this paragraph first.

**5.10 — When you find one of these, look for its siblings before you fix it.**
The Python session reported `cw.override_status`. Fixing that and stopping would
have left five, two of them worse than the one reported. They were found by
asking the catalogue which views sit over person-scoped tables rather than by
reading — the whole sweep took one query.

**One of six is not a fix.** The same applies to 5.3's four separate instances
and 5.4's mutations: in this codebase a defect of a given shape has never yet
turned out to be alone.

**5.10a — What actually depends on `backend/service/`, measured.** `WP-P5`
deletes it, and the dependency list was wrong in both directions. Established by
moving the directory aside and running everything:

- **`shell.test.mjs` does NOT break** — 61/61 with the service absent. It reads
  `CW_SHELL`, not `CW_SERVICE`, and parses the JSX in `prototype/v4/app` as text.
  The one mention of `CW_SERVICE` in it is a comment drawing an analogy. The
  screens keep their coverage whatever happens to the service.
- **Three suites fail:** `endpoints.test.mjs`, `mutations-api.test.mjs`,
  `service.test.mjs`. They fail rather than skipping, so `WP-P5` must delete
  them, not leave them.
- **`mutation-check.mjs` used to die outright** — `readdirSync` on the service
  directory ran at module load, so all 197 mutations went down together,
  including the 139 over the migrations. Now guarded: the 15 service mutations
  report `SKIP`, which is fatal, and the other 182 still run.

That `SKIP` is the point. **Deleting the service cannot make the bar green** —
it turns it red until somebody re-proves those 15 guarantees against the Python
doorway or removes each entry with its reason recorded. They are the
pool-bleed, privileged-connection, refusal-classification and attribution
guards; the doorway needs its own mutation harness and **those 15 are its
specification.**

**5.10b — A comment recording a limitation can outlive the limitation.**
`cw.audit_chain()` in `0001` takes an advisory lock so two writers cannot read
the same chain tail and fork. Its comment said the line had **zero coverage and
could not get any in this repository** — true when written, because PGlite is
single-connection. The doorway now runs on standard PostgreSQL with a real pool,
so it became testable and the comment became false.

That matters more than a stale note usually would, because the next reader
reasonably treats "cannot be tested" as "do not try". Corrected, and worth
generalising: **when the platform under a limitation changes, the notes claiming
that limitation are part of the change.** Grep for them.

**On the finding itself, so nobody re-diagnoses it from scratch:** the Python
session observed `audit_no_fork` duplicate-key errors under concurrent writes and
read them as the index being over-strict. It is not. The lock is
transaction-scoped and covers the tail-read and the insert together, so **a
duplicate key proves two writers held the same tail, which proves the lock was
not held across the tail-read for one of them** — look at isolation level,
transaction scope, and any path writing with triggers disabled. Do not loosen the
index; it is the only thing between an unexplained error and two futures for the
chain. Serialised appends are inherent to a hash chain and are a property to
accept, not a defect. Reproduction in `backend/doorway/PORT-NOTES.md` §16.

**5.10c — A column DEFAULT is evaluated before the BEFORE trigger, so it is
outside any lock the trigger takes.** This one cost the audit chain its central
invariant and nobody saw it for a year, because it needs two writers at the same
instant and PGlite is single-connection.

`cw.audit_event.seq` was `bigserial`. `nextval` therefore ran before
`cw.audit_chain()` and outside its advisory lock — in the order transactions
reached the `INSERT` — while the lock serialised the trigger bodies in a
*different* order. So `order by seq desc limit 1` did not find the row appended
last; it found the highest seq **committed** so far. Two consequences, measured
across eight concurrent writers:

- **`audit_no_fork` duplicate keys, 5 of 8.** The index was right every time —
  it was handed a genuine fork.
- **Honest chains failing `cw.audit_verify()`**, because rows linked backwards in
  seq order (a row at seq 13 whose parent was seq 15). Every row honest, every
  parent present — and the verifier calls it tampering, because it walks
  `order by seq` and assumes sequence order is append order.

`0021` assigns `seq` inside the trigger, under the lock, which makes that
assumption true again rather than teaching three readers to live without it.

**Three things worth carrying from it:**
1. **A DEFAULT is not inside your trigger's lock.** If a trigger's correctness
   depends on a value, the trigger must assign the value.
2. **The obvious fix was the dangerous one.** "The index is over-strict" invites
   loosening `audit_no_fork`, which is the only thing between an unexplained
   duplicate and two futures for the chain. When a guard fires, ask what handed
   it a bad write before deciding it is wrong.
3. **Serialised appends are inherent to a hash chain** — each row's hash depends
   on the one before it, so appends cannot be parallel and still be a chain. That
   bounds governed acts per second. It is a property to accept knowingly; the
   duplicate key and the false tamper alarm were not.

**Verification is split across two suites, and both halves are now in.**
`db/test/` proves the *mechanism* — a test pushes the sequence 5000 ahead of the
table and asserts the appended row still lands at `max+1`, with a mutation to
prove that test fails. It cannot prove the *race*; PGlite is single-connection.

The race is proved in `backend/doorway/`, the only thing here that can see one:
`test_retirement.py::test_the_chain_survives_people_acting_at_the_same_instant`,
eight simultaneous governed acts asserting both halves — every honest act lands,
and the chain still verifies afterwards. Measured before and after:

| | before `0021` | after `0021` |
|---|---|---|
| 8 writers released together | **5 of 8 refused** | **0 refused** |
| rows chained to a higher `seq` | present | **0** |
| `cw.audit_verify()` | **broken at seq 13** | **clean** |

Sustained: 96 governed acts, 0 failures, 0 gaps, verify clean, **323 governed
acts per second**. That number is the answer to the serialisation question —
several orders of magnitude beyond what this system needs, so the property is
one to accept knowingly rather than a cost. **This fix is verified, not merely
reasoned.**

**5.10d — Editing a migration with a Windows tool silently disarms its
mutations.** A scripted edit rewrote `0001_foundation.sql` with CRLF line
endings. Nothing broke: all 23 suites stayed green, because PostgreSQL does not
care. But every multi-line mutation `find` in `mutation-check.mjs` is written
with `\n`, so none of them matched that file any more.

Only **one** reported `SKIP`, which is what made it dangerous. The other
multi-line check keyed on `0001` also exists word-for-word in `0021`, so it
matched there and looked fine. **The harness was one file away from reporting
green while a protection went unwatched**, and the signal was a single line in a
198-line report.

If you edit a migration with anything other than the editor tools, **check the
line endings before trusting the next mutation run** — `grep -qU $'\r' <file>`.

**The harness now refuses to run rather than produce a misreadable count.**
`SKIP` was already fatal, so it was technically correct — it was still the wrong
shape, because it printed a reassuring number and buried the one line that
mattered. A **preflight** now checks every pattern before any mutation executes,
and if anything is stale **nothing runs at all**: there is no count to misread
because there is no count. (The idea is the Python session's, from
`doorway/mutation_check.py`.)

It enforces two invariants, and the second found four pre-existing problems on
its first run:

1. Every `find` must appear in at least one source file — absent means stale.
2. **It must appear at most once per file.** `String.replace` rewrites the first
   occurrence only, so a pattern matching twice mutates one of them and may not
   be the one the check is named for.

The four: two identical trigger-creation blocks in `0006`, a condition appearing
twice in `0013`, and a `values` line identical across four endpoints in
`mutations.mjs`. All four happened to be watching the right occurrence — **by
luck of file ordering**, and any reordering would have moved them silently onto
the wrong one. Now anchored so they are unique by construction.

What is deliberately still allowed is the same pattern in *several files* — that
is load-bearing, because when a later migration redefines a function the
mutation must land in every copy or the last definition silently undoes it
(§5.4a).

**5.10e — An assertion can match the screen's own words instead of its logic.**
The auditor's chain tile reads a state out of `cw.health_summary`, whose tile is
named `audit chain`. The first draft looked up `chain`, found nothing, and
rendered "not available" — a lookup that misses, impersonating a real state, and
indistinguishable on screen from a health check with no answer (5.8 again).

The test written to catch that asserted the string `'audit chain'` appeared in
the source. **The tile's own display label contains that string**, so the
assertion went on passing while the lookup was broken. The mutation harness
reported `MISS` on the first run; the check is now anchored on
`t.tile === 'audit chain'` — the lookup itself, not the copy near it.

This is 5.3 arriving through UI text rather than a comment, and the general rule
is worth stating once: **anchor a source assertion on the expression it means,
not on a string that also appears in prose the user reads.** Between comments and
labels, most distinctive words in this codebase appear twice.

**5.12 — A SECURITY DEFINER function cannot see who called it, and a NULL
comparison fails OPEN.** `0023`'s redaction guard read `cw.app_role()` to spot
the Administrator. Inside a `security definer` function `current_user` is the
function's **owner**, so `cw.app_role()` returns NULL — and `null <>
'administrator'` is NULL, not true, so the whole condition was NULL and **the
guard never raised.** An undelegated legal reviewer redacted a record on the
first run of the suite.

Two rules out of it, and the second is the more general:

1. **Ask the DATA who somebody is, not the connection.** `cw.may_redact()` and
   `cw.is_administrator()` read the delegation list and `cw.effective_role`, both
   of which mean the same thing whoever is executing. The EXECUTE grant is what
   bounds who may ask at all — that is the pattern `cw.retention_destroy()`
   already used, and the reason it never had this bug.
2. **A guard that compares against a possibly-NULL value fails open.** Not
   closed. In three-valued logic `NULL <> x` is NULL, `NULL and true` is NULL,
   and `if NULL then` does nothing. Any authorisation test written as `<>` or
   `not in` against something nullable should be read as "and does nothing at all
   if this is null".

The failing version is kept as a mutation, so it cannot come back unnoticed.

**5.11 — A test can assert the absence of activity and look like a control.**
`roles.test.mjs` asserted that no audit row anywhere carried
`actor_role = 'legal_admin'`. That passed for one reason only: nothing in the
suite legitimately acted as a legal admin. `0020` started recording category
creation, an honest `legal_admin` row appeared, and the test failed on the system
working correctly.

The claim it was actually there to make is narrower and stronger — *the
reviewer's forged event did not land* — and it is now written that way. Worth
recognising the shape: **an assertion phrased as "none of X exists anywhere"
usually measures how little the fixture does, not how well the control holds.**
It breaks the day the system starts doing something legitimate, which is a bad
time to discover what your test meant.

---

## 6. Things that are true and easy to undo

- **The approval box on the review desk is empty on purpose.** Pre-filling it
  turns "approve" into "confirm", and the unedited-approval rate is the figure
  Legal watches precisely because that pressure is real.
- **There is no approve-all anywhere**, no function taking a list, no loop. A
  batch endpoint would be the blanket acknowledge button with a for-loop in
  front of it.
- **The gate opens on approval, never on request.** `cw.override_passes` is
  phrased "which findings may be passed" rather than "is this request approved",
  because the second phrasing makes a blanket override easy to reintroduce.
- **Socialisation refuses when nobody would be told.** An empty audience is a gap
  in the watcher lists, not an audience of nobody.
- **An owner decision has no edit affordance at all** in the admin console — not
  a disabled input. A disabled control says "you could, but not now"; the truth
  is "this was never yours".
- **`never_ran` is its own state** on every health tile.
- **Revocation is honoured at the next request, not instantly.** The console says
  exactly that and no more.
- **An empty ladder is on the board, not missing from it.** `cw.ladder_board`
  left-joins its rungs so a rungless ladder renders as one row saying `empty`.
  Tightening that to an inner join is a one-word edit that hides exactly the
  ladders somebody needs to fix.
- **`0018`'s views grant `select` to five roles, not six.** The Administrator's
  absence is a live question for the owner, not an omission to tidy up — see §4
  and `docs/open-questions.md` §9a. Adding it here would answer a question about
  a role's boundary in a convenience view.

---

## 7. Read next

- [`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](../../UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md) — the sixteen packages and what each closed one taught
- [ADR-0011](../decisions/ADR-0011-the-administrator-is-a-steward.md) — the Administrator, and what it costs
- [ADR-0008](../decisions/ADR-0008-governance-roles-and-recorded-overrides.md) — now **built**, including the override workflow
- [`06-service-layer-and-identity.md`](06-service-layer-and-identity.md) §9–§10 — how identity binds, and the endpoint inventory the Python must match
- [`docs/open-questions.md`](../open-questions.md) §9a — the Administrator's read of the library, waiting on the owner
- [`docs/guides/`](../guides) — one guide per role, written for the people who use them
- [`PYTHON-REVISION-PLAN-2026-07-26.md`](../../PYTHON-REVISION-PLAN-2026-07-26.md) — the workstream that now owns the service
