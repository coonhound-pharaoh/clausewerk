# Handoff · The service layer and identity — the doorway

**State: built (WP-U05), 2026-07-26.** The doorway exists. A person signs in by
name, their session is bound to the one role the database says they hold, and
the API holds no opinions.

Read [§9 — what shipped](#9-what-shipped-wp-u05) first if you are picking this
up; the sections above it are the context that made those choices, and they are
still accurate. Your original plan is
[`SERVICE-LAYER-AND-IDENTITY-PLAN-2026-07-26.md`](../../SERVICE-LAYER-AND-IDENTITY-PLAN-2026-07-26.md).

---

## 0. Ground rules (repeated in every handoff — read them)

**The owner is Mike.** `CLAUDE.md` at the repo root auto-loads and is binding:

- Prefer simple, concise solutions.
- **Always speak in plain business language. Never developer jargon.** Mike is
  an executive, not an engineer. This is the rule most easily broken by accident.
  It was broken repeatedly while writing your plan, and he had to say so twice.
  Assume you will break it too; re-read anything you write to him.
- Record important decisions as individual entries in [`../../memory.md`](../../memory.md),
  in plain language. Engineering detail belongs in `docs/decisions/`.
- Naming and branding are the owner's alone. Do not "fix" terminology.

**The invariant**, as amended by
[ADR-0010](../decisions/ADR-0010-ai-drafted-clause-candidates.md):

> No contract language reaches an agreement without a named human's approval,
> and the origin of every clause is recorded on it permanently.

**The product boundary** (`CLAUDE.md`, owner, 2026-07-25): we are responsible for
the *system* — recording, gating, checking, provenance. We are **not**
responsible for the contract text inside it. Surface a content gap and route it
to a named person; never frame it as ours to fill.

**The verification culture matters more than the code.** Every guarantee has a
mutation check that deliberately breaks it and confirms the tests notice. A
mutation caught by a test *other* than the one it names is scored as a **failure**,
not a pass — because it means the named test was never exercised. If you add a
guarantee, add its mutation, and confirm it reports `ok` rather than `MISS` or
`IMPRECISE`.

---

## 1. What this workstream is

The front door. It does exactly one job: **establish who somebody really is, and
hand that to the database.**

It does not decide what they may do. Thirteen migrations already decide that, and
those rules have been tested by attacking them. If the service layer starts
making authorisation decisions too, there are two sets of rules that can
disagree, and the disagreement is the vulnerability.

In scope: sign-in, identity, the per-request binding to a database role, session
lifecycle, error mapping, and the shell that puts a person in their one
workspace. Out of scope: e-signature and document-store connections, obligations,
and any change to contract assembly or the audit chain.

---

## 2. What exists to build on

- **Thirteen migrations** under `backend/db/migrations/`, enforcing six roles row
  by row, with tests that perform each protected action **as the role the policy
  names**. This is the foundation. Extend it; do not replace it.
- **`cw.account`** — one row per named person, one role each.
- **`cw.role_grant`** — append-only. Every act on somebody's access is a row:
  granted, countersigned, revoked.
- **`cw.effective_role`** — derived. What each person may actually do *right
  now*. **This is the view you sign people in against.** See §3.
- **The v3 prototype** supplies the complete visual language, kept as-is.
- **`UI-REIMAGINE-PLAN-2026-07-26.md`** sets the phases and the value order for
  the interface. Your plan is the layer underneath it, not a replacement.

**Check the state before you start.** At the time of writing, migration `0013`
was uncommitted and one test was failing. Run `cd backend && npm run verify`
first. If it is not green, that is somebody else's work in flight — find out
before building on it.

---

## 3. Design decisions you must not casually undo

**3.1 — Sign in against `cw.effective_role`, never `cw.account.role`.**
The single most important line in this workstream. `cw.account.role` is the
administrative record of what somebody is *supposed* to hold.
`cw.effective_role` is what they *actually* hold, and it is the only one that
applies the countersign rule — a grant of either Legal role confers nothing until
a Legal admin countersigns it (owner decision `U6`).

A doorway reading `cw.account.role` would confer Legal roles the moment an
Administrator typed them, and a whole migration of care would be bypassed by the
front door on day one. The two columns are named and documented differently on
purpose: **record** versus **authority**.

**3.2 — The identity stamp expires by itself** (owner decision, 2026-07-26).
Each request runs inside one unit of work, and the identity is attached in a form
the database removes when that unit of work closes. There is deliberately no
clean-up code, because clean-up code can fail to run.

Signing in is a different clock and lasts hours. Do not conflate the two — Mike
was misled by exactly that conflation, and the plan now defines both terms
explicitly.

**3.3 — The service layer holds no privileged connection.** Not for a dashboard
count, not for a health check, not "just for this one endpoint". A privileged
connection silently disables every row-level rule on that path, and it will look
like a performance fix in review.

**3.4 — The actor is set server-side, from the authenticated session only.**
Nothing the browser sends may influence it. This is what closes the residual the
schema itself names: the self-grant guard and the access history currently rest
on a value the client supplies.

**3.5 — Roles come from us, never from the customer's directory.** An identity
provider asserts *who somebody is*. If their directory has groups that look like
our roles, ignore them. A directory group is not a countersigned grant.

**3.6 — A person with no effective role gets no session.** Not a viewer session,
not a degraded one. Failing closed costs a support ticket; failing open costs the
guarantee.

---

## 4. Traps

**4.1 — The silent no-op.** A write refused by a missing policy does not raise an
error; it affects zero rows and reports success. This is finding D1's exact
shape, and it survived a full test suite because the tests ran as the database
owner, who bypasses everything. The test harness has a helper (`mustNotWrite`)
that exists solely because of it. **Your service layer needs the same instinct: a
mutation that succeeds while changing nothing is an error, not an outcome.**

**4.2 — Two documents are wrong about connection pooling.**
`backend/db/migrations/0001_foundation.sql` (above `cw.app_role()`) and
`ARCHITECTURE.md` §5 both say the system is "incompatible with transaction-mode
connection pooling". **This is an overstatement** — it describes the
session-scoped setting used in the *test harness*, where it is the correct
choice, not a limit of the design. Transaction-scoped settings are unwound before
a pooler releases the connection. Both notes should be corrected to "assumes one
authenticated identity per unit of work". Flagged, not edited, because they were
another agent's files at the time.

**4.3 — Mutations must key on the definition that is live after *all* migrations
run.** `cw.app_role()` is defined in `0001` and redefined in `0013`. A mutation
keyed on `0001`'s copy silently stopped working: the harness broke the dead copy,
the live one replaced it, and the check reported "nothing guards this" for a
protection that was entirely intact. Expect this to happen again.

**4.4 — Widening a refusal into a success.** Returning an empty list where the
database refused makes the interface say "nothing here" instead of "you may not
see this". Those are different sentences and must never render identically.

**4.5 — The test suite's session-scoped settings are correct there.** Do not
"fix" `backend/db/test/roles.mjs` to match your service layer. A test process is
one client and never shares a connection.

---

## 5. Known gaps you inherit

- **Attribution is not yet authenticated.** Until your work lands, the audit log
  names whoever the client said it was. Do not describe the access history as
  authenticated before the doorway exists.
- **The override request → socialise → decide workflow** from
  [ADR-0008](../decisions/ADR-0008-governance-roles-and-recorded-overrides.md)
  was specified and never built. The role-scoped screens do not make sense
  without it, so the UI plan puts it in scope at Phase 5.
- **No service layer means `check_manifest` has no caller.** The manifest trust
  boundary is defined and tested but not wired into any running path. Wiring it
  is yours.

---

## 6. The decision to settle before you write code

**What language the service is written in.** The contract engine is Python; the
database tests are JavaScript. A third runtime is a third thing to keep in step.

- **Python (recommended)** — can call the assembly engine directly rather than
  across a process boundary, and the engine is the part most likely to need
  calling.
- **JavaScript** — shares the database test harness's language, so the
  role-testing helpers are reusable as-is.

Either is defensible. **Confirm with Mike before starting §7 step 3**, and record
the answer in `memory.md`. Do not let it block steps 1 and 2.

---

## 7. Where to start

1. `cd backend && npm run verify`. Do not build on a red tree.
2. Read `SERVICE-LAYER-AND-IDENTITY-PLAN-2026-07-26.md` §B.2 (the four identity
   steps) and §B.8 (the testing bar). They are the whole job in miniature.
3. Settle §6, then build the connection layer: no privileged pool, identity
   attached per request in the self-expiring form, actor bound server-side.
4. Sign-in against `cw.effective_role`, accounts-table path first, provider path
   behind the same interface.
5. Session lifecycle: expiry from the operational settings, revocation honoured
   at the next click rather than the next sign-in.
6. The refusal-mapping layer and the silent-no-op guard.
7. Only then the shell.

Steps 3–6 are the doorway and should be treated as one unit. None of them is safe
alone.

**The first test to write, before any of it:** a live check that runs a request as
one role, returns the connection to the pool, takes it back out, and asserts it
carries no role and no actor. That is the leak, reproduced deliberately. If it
ever comes back dirty, stop.

---

## 8. Read next

- [`../../SERVICE-LAYER-AND-IDENTITY-PLAN-2026-07-26.md`](../../SERVICE-LAYER-AND-IDENTITY-PLAN-2026-07-26.md) — your plan, including a plain-language section at the front you can show Mike.
- [`../../UI-REIMAGINE-PLAN-2026-07-26.md`](../../UI-REIMAGINE-PLAN-2026-07-26.md) — the phases and value order for the interface.
- [`../../UI-AND-ADMINISTRATION-ARCHITECTURE.md`](../../UI-AND-ADMINISTRATION-ARCHITECTURE.md) — the six workspaces and the Administrator's boundary.
- [ADR-0008](../decisions/ADR-0008-governance-roles-and-recorded-overrides.md) — the roles, and the override workflow you will eventually build.
- [ADR-0011](../decisions/ADR-0011-the-administrator-is-a-steward.md) — the Administrator: content-visible, content-powerless.
- [`../open-questions.md`](../open-questions.md) — the settled owner decisions `U1`–`U8` and what each one cost.
- [`05-frontend.md`](05-frontend.md) — the workstream yours feeds.

---

## 9. What shipped (WP-U05)

Three files under [`backend/service/`](../../backend/service), about 400 lines
including the reasoning, plus
[`service.test.mjs`](../../backend/db/test/service.test.mjs) — 29 tests and 9
mutations.

| File | Job |
|---|---|
| `db.mjs` | The only way the service touches the database. Binds a connection to a person and a role, and offers no other path. |
| `sessions.mjs` | Tokens, expiry, and one deliberate omission — see below. |
| `app.mjs` | Routing, the read endpoints, and the refusal shape. No permission logic. |
| `server.mjs` | The HTTP wrapper, deliberately thin. |

### How identity binds to role

1. **Sign in** with a name. `POST /sign-in`. There is no password — that is the
   seam an identity provider plugs into, and it is marked as a seam rather than
   dressed up as authentication. What is already real is that the **role never
   comes from the request**: the person names themselves, and the database says
   what that person may do.
2. A session is issued for as long as the `session_length` operational setting
   says — an Administrator's knob (WP-U03).
3. **Every request** resolves the person's role from `cw.effective_role`, fresh.
   Nothing is cached.
4. The request runs on a connection bound to that role and carrying that name,
   and every audited write it makes lands with both on the chain.

**The session stores a person and nothing else about their authority**, and that
is the single most load-bearing choice in the layer. If the role were captured at
sign-in, revoking somebody would take effect at their next *sign-in* — which for
an eight-hour session means tomorrow, while the console said revoked and the
person went on working.

So the promise is precise, and the console must not enlarge it:
**revocation is honoured at the next request.** A request already in flight
completes. That gap is real and small; closing it would mean interrupting work in
progress, and pretending it is closed is the failure class this whole effort is
paying down.

### Why there is no privileged path

The database enforces the entire permission model, and **all of it is bypassed by
the owner connection** — row-level security is `ENABLED`, not `FORCED`. So a
single "it's just a count" query run as the owner does not merely leak that count:
it proves nothing about whether the caller was allowed to have it, and it will be
copied.

`db.mjs` therefore exports **one class**, whose every query path sets a role
first. There is no general-purpose query function to reach for when an endpoint
is awkward. `migrate()` is the one privileged entry point and it runs before the
server listens.

Sign-in is the one genuine chicken-and-egg: `cw.account` must be read before any
role is known. It runs as **`cw_viewer`** — the least-privileged role in the
system, which can read the staff list and do nothing else — not as the owner. So
the worst a bug on that path can do is expose who works here.

### How to add an endpoint without adding permission logic

Add a row to `READS` in `app.mjs`: a SQL statement and a note naming the database
rule that decides what comes back. That is the whole procedure.

**Do not** add an `if (role === …)`. There is not one in the service and a test
fails the build if one appears. Two permission systems drift, and the drift is
the vulnerability precisely because it is invisible — both keep working, they
just stop agreeing, and the one that is wrong is the one nobody tested as a real
role.

**Do not** add a `WHERE` clause to narrow what a role sees. If a workspace needs
a narrower slice, that is a read model on the backend. A test asserts the
`/deals` query has no `WHERE` at all, because the scoping is a policy on
`cw.agreement` and moving it here would be the second permission system arriving
one endpoint at a time.

### Refusals

A database refusal is passed through **unchanged**, classified by SQLSTATE.

That last part was a bug this file shipped with, and the test caught it: the
first version classified by matching the message text for "permission denied",
which catches the refusals Postgres words itself and misses every refusal the
*schema* words — and those are the good ones. `"renewal_default_baseline is an
owner decision and only a legal admin may change it"` was being reported as a
`400 bad request`. Reading `42501` respects what the schema raises and needs no
maintenance as more rules are written.

Never reword a refusal. Those messages name the rule and the role; a friendlier
sentence here would be vaguer and would have to be kept in step with the schema
forever.

### The pool bleed, and what is actually load-bearing

PGlite is a single connection, so requests are **serialised** onto it. That is
the strictest reading of the "one connection, one identity" assumption in
`ARCHITECTURE.md` §5, and also the shape most likely to leak.

Three things prevent cross-attribution, and the mutation harness proves each:
the **actor binding** at the start of a request, the **role binding**, and the
**queue** that stops two requests interleaving them.

The `finally` cleanup is a **second line, not the mechanism** — removing it
changes no observable behaviour, because every entry point binds both values
before reading anything. That was found by the harness rather than assumed, and
`db.mjs` says so in place. If you add an entry point, bind both values in it;
do not rely on the cleanup.

### What the harness can now reach

The mutation check gained a `target: 'service'` mode: it copies
`backend/service/*.mjs` into `backend/.mutation-service/`, mutates one line, and
points `CW_SERVICE` at the copy. The copies live **inside** `backend/` because
Node resolves `@electric-sql/pglite` by walking up for `node_modules`, and from
the system temp directory that walk finds nothing — every service mutation
crashed on import and was scored `IMPRECISE` for tests that were perfectly fine.

If you add a guarantee to the service, add its mutation with
`target: 'service'`, and confirm it reports `ok`.

### What is still open

- **Authentication.** Sign-in takes a name and trusts it. This is a development
  doorway, and the identity provider replaces `App.signIn` without touching the
  privilege story — the role has never come from the request.
- **The name is still self-asserted at the database level.** `cw.account`
  narrows the residual from "any name at all" to "any name, by a caller with
  direct database access". `ARCHITECTURE.md` §5 states it; it is not closed.
- **The nightly job has no scheduler.** All four integrity checks are runnable on
  demand (WP-U04); wiring them to a trigger belongs with this runtime.
- **Mutation endpoints** are WP-U06. `app.mjs` has the hook (`this.mutations`)
  and the refusal shape; the endpoints themselves land there.
