# The doorway — service layer, identity, and interface

**A detailed implementation plan for Phases 2–4 of
[`UI-REIMAGINE-PLAN-2026-07-26.md`](UI-REIMAGINE-PLAN-2026-07-26.md), plus a review of the
in-flight `0013` work it depends on.**

Written 2026-07-26. This does not replace the UI plan — that plan sets the phases and the value
order, and it is right. This is the layer underneath it: exactly how a person becomes a signed-in
user, how each of their clicks reaches the database as that person, and where each step can go
wrong.

---

## Read this first — what is being built, in plain terms

**The problem.** The system records who did what, but it currently believes whatever name it is
given — like a visitor book you sign yourself, with nobody checking identification. That is
tolerable today because nothing is running and nobody can reach it. It stops being tolerable the
moment real people can.

**What we are building.** The front door. It does one job: establish who you really are, and hand
that to the database. It does *not* decide what you are allowed to do — thirteen migrations of rules
already decide that, and they have been tested by attacking them. If the front door started making
those decisions too, we would have two sets of rules that could disagree, and the disagreement is
the hole.

**The two clocks, because one word was doing two jobs.**

| | How long it lasts | Who notices |
|---|---|---|
| **Signing in** | Hours. You sign in once and stay signed in, as you would expect. The length is a setting the Administrator controls | Everyone |
| **The identity stamp on the database** | One click. It is attached when a click reaches the database and removed the moment that click finishes | Nobody |

A building pass and a visitor badge. The pass lasts the day; the badge is handed over at each
interior door and taken back as you walk through. Users keep the pass and never see the badge.

**Why the badge is surrendered every time.** Most companies run a sharing layer in front of a
database so many users take turns on a small number of connections, rather than each holding one.
It saves real money. The risk is that your identity lingers on a connection after your turn and gets
mistaken for the next person's. If the badge is surrendered automatically at every door, there is
nothing left to linger — so we can run on ordinary infrastructure without weakening anything.

**What a user actually experiences.** They sign in. They see one workspace — the one for their job,
and no way to reach anybody else's. Everything on screen is something their role is genuinely
allowed to see, because the database refused to hand over anything else.

**What is deliberately not in this plan:** e-signature and document-store connections, obligations,
and any change to how contracts are assembled or how the audit trail works.

---

# Part A — Review of the work in flight

Read at 2026-07-26, against `0013_administrator.sql` uncommitted in the working tree. **The sister
agent is actively editing this file, so this is a point-in-time read.** Nothing here has been
changed by me.

## A.1 The design is sound, and one part of it is better than the brief

`cw.effective_role` is the right shape. Keeping `cw.account.role` as the *declared* administrative
record and the view as the *authority* means a pending countersign cannot silently confer a Legal
role. The one hole — the first Legal admin, who has nobody to countersign them — is flagged in the
view itself, marked `is_bootstrap`, and left answerable by a single query rather than an
investigation. That is the right way to carry an unavoidable exception.

The self-grant refusal (`nobody grants themselves a role`) is enforced in the database rather than
in the console, which is where it belongs.

## A.2 Currently red — one failing test

```
FAIL no table in schema cw grants the administrator insert, update or delete
     except the two it is supposed to
     got ["cw.role_grant INSERT"], want []
```

`cw.role_grant` legitimately grants the Administrator INSERT (they propose grants; a Legal admin
countersigns). The sweep's `ADMIN_MAY_WRITE` allowlist has not caught up.

**This is the sweep working, not failing.** It noticed a new write privilege the moment it appeared
— which is exactly why it was written as a sweep over every table rather than a list of known ones.
The fix is one allowlist entry; the value is that it could not have been forgotten.

*No action taken — this is the sister agent's file, mid-edit.*

## A.3 Two live findings

**A.3.1 — Eighteen lines of corrupted text.** The file contains 19 instances of `â€"` where an em
dash was intended (lines 459, 460, 479, 513, 528 and thirteen more). The file is valid UTF-8; the
bytes are a mis-decoded em dash that has been re-encoded. Line endings are clean LF, matching every
other migration.

It is cosmetic, but it is in the explanatory comments — and in this project those comments are the
artefact, not decoration. A future reader hits it in the middle of the countersign rule's rationale.

**A.3.2 — `cw.bootstrap()` is defined twice in one file** (around lines 380 and 792). The second
`create or replace` supersedes the first, so the behaviour is whatever the second says and the first
is dead. Two risks: a maintainer patches the dead one and sees no effect, and a mutation `find`
string could match either. Worth collapsing to one definition, or making the supersession explicit
in a comment if the two-part structure is deliberate.

## A.4 The residual that this plan exists to close

`0013` states it plainly at the self-grant guard:

> This is only as strong as `cw.app_actor()`, which is self-asserted … What it closes is the gap
> between the name on the connection and the name on the row; what it cannot close is whether the
> name on the connection is really that person.

**That sentence is the entire justification for the service layer.** Today an Administrator can set
`cw.actor` to a colleague's name and the access history will name the wrong person for the act that
mattered most. The database cannot fix this — nothing inside it knows who is really at the keyboard.
The doorway is what fixes it, and until the doorway exists, the access history is *attributable* but
not *authenticated*.

This raises the stakes on Phase 2 beyond "we need an API": **the countersign rule, the self-grant
refusal and the access history are all currently resting on a value the client supplies.**

---

# Part B — The plan

## B.1 The one idea everything follows from

**The service layer holds no privileged database connection, and no permission logic.**

A request arrives, is authenticated to a named person, and is executed on a connection that *is*
that person's database role. If the database would refuse it, it is refused. The API never decides
who may do what — it only decides **who you are**, and hands that to the database.

Everything in this plan is either that idea, or a way of proving nobody has quietly worked around
it.

The failure mode to design against is mundane and common: someone adds a privileged connection "for
one endpoint" — a dashboard count, a health check, an admin screen — and every row-level rule in
thirteen migrations stops applying to that path. It will not announce itself. It will look like a
performance fix.

## B.2 Identity: from a person to a database role

Four steps, and each one is a place this can go wrong.

> **Terminology, fixed here because one word was doing two jobs.** A **sign-in** lasts hours and is
> what a user would call being logged in. A **request identity** lasts one click: it is attached
> when that click reaches the database and removed when the click finishes. Wherever this plan says
> "session" unqualified, it means the sign-in.

### Step 1 — Authenticate the person

Two supported sources, decided per deployment:

- **Identity provider (preferred):** OIDC or SAML against the customer's directory. The provider
  asserts the person; we never hold a password.
- **Accounts table (fallback, for deployments with no provider):** sign-in against `cw.account`.

**The provider asserts identity only — never role.** If a customer's directory carries group
memberships that look like our roles, we ignore them. Roles come from `cw.effective_role`, because
the countersign rule lives there. A directory group is not a countersigned grant.

### Step 2 — Resolve the role · **the critical join**

> **Bind the session to `cw.effective_role`, never to `cw.account.role`.**

This is the single most important line in this plan. `cw.account.role` is the administrative record
of what somebody is *supposed* to hold. `cw.effective_role` is what they *actually* hold, and it is
the only one that applies the countersign rule.

A doorway that signs people in against `cw.account.role` would confer Legal roles the moment an
Administrator typed them, and the countersign rule — a whole migration's worth of care — would be
bypassed by the front door on day one. The two columns are deliberately named differently and
documented as "record" versus "authority"; the API must respect that distinction.

**A person with no row in `cw.effective_role` gets no session.** Not a viewer session, not a
degraded session — no session. Failing closed here costs a support ticket; failing open costs the
guarantee.

### Step 3 — Bind the connection

Each **request** executes as one of six database roles — not each sign-in. A person signed in for
eight hours produces hundreds of separately-stamped requests. Three mechanisms:

| | **A · Role-per-pool** | **B · `SET ROLE` per request** | **C · `SET LOCAL ROLE` inside one transaction** |
|---|---|---|---|
| Shape | Six pools, one per role | One pool; `set role` at request start, `reset role` at the end | One pool as a minimal base role; each request is one transaction opening with `set local role` |
| Reset | Not needed | **Manual** | **Automatic at `COMMIT`** |
| Weakness | Six pools to size and monitor | A missed `reset` leaks a role to the next request — finding D3's exact shape | Every request must genuinely be one transaction |
| Works behind a transaction-mode pooler | No | No | **Yes** |

**Recommendation: C.** It gets the property A was chosen for — the reset is structural, not
remembered — without the pool multiplication, and it is the only option compatible with
transaction-mode pooling (see B.3).

It also fails in the right direction: a request that somehow escapes its transaction runs as the
base role, which holds no privileges on anything. The failure is a refusal, not a silent
escalation.

The discipline C does require is that **every** request is one transaction and **every** setting
uses the `LOCAL` form. That is one lint rule and one test (B.8, test 7), not an ongoing habit.

> **Earlier drafts of this plan recommended A**, on the grounds that a missed `RESET ROLE` is
> exactly the class of bug that produced finding D3. That reasoning was right about option B and
> wrong to stop there — `SET LOCAL` removes the reset entirely rather than making it more reliable.

### Step 4 — Set the actor, server-side only

`cw.actor` is set from the authenticated session, in the same place the connection is checked out,
and **nothing the browser sends can influence it**. This is what closes the residual in A.4.

Concretely: the request handler never reads an actor from the body, the headers, or a cookie
claim — only from the server-side session record.

## B.3 Connection sharing — resolved, not a constraint

**An earlier draft of this plan said transaction-mode connection pooling was incompatible with this
model and would force a redesign. That was wrong, and the correction is worth keeping** because the
same overstatement appears in the schema (`0001_foundation.sql`, the note above `cw.app_role()`) and
in `ARCHITECTURE.md` §5.

The leak those notes describe is real, but it comes from *how long the identity stamp lasts*, not
from the design. Session-scoped state (`SET ROLE`, and `set_config(..., false)` — the `false` means
session) survives a transaction-mode pooler handing the connection to the next client, and that is
exactly the leak.

Their transaction-scoped equivalents — `SET LOCAL ROLE` and `set_config(..., true)` — are unwound at
`COMMIT`, **before** the pooler releases the connection. Nothing survives to leak.

So the requirement is not "session-mode pooling only". It is:

- Every request is one unit of work (one transaction).
- Every identity setting uses the transaction-scoped form.

Both are checkable, and B.8 test 7 checks them. The test suite's own helper deliberately uses the
session-scoped form, which is correct *there* — a test process is one client and never shares a
connection — and that is precisely how the assumption came to look like a law.

**Still worth stating to customers:** which form we use, and that the guarantee depends on it. Not
as a restriction on their infrastructure, but so nobody later "optimises" a request out of its
transaction and quietly removes the property.

**Follow-up:** the notes in `0001_foundation.sql` and `ARCHITECTURE.md` §5 should be corrected to
say "assumes one authenticated identity per unit of work" rather than "incompatible with
transaction-mode pooling". Both are the sister agent's files at time of writing; flagged, not
edited.

## B.4 Sign-ins, revocation, and expiry

**Decided 2026-07-26 by the owner: the per-request identity expires automatically** rather than
being cleared by the service layer. Mechanism C in B.2 step 3.

- **How long a sign-in lasts** comes from the operational settings (`session_length`), not from a
  constant in the code. The Administrator controls it.
- **Revocation is honoured at the next click, not the next sign-in.** Somebody whose access is
  withdrawn while they are working must be stopped on their very next action — not whenever they
  next happen to sign in, which could be never. The implementation: re-check `cw.effective_role`
  every request, cached for seconds rather than hours, and the cache dropped on any revocation.
- **A role change while somebody is signed in** takes effect on their next click. If the change
  leaves them with no effective role — a Legal grant awaiting countersign confers nothing — they
  are signed out rather than left in a workspace they no longer hold.
- **The per-request identity needs no clean-up path**, and that is the point of choosing it: there
  is no code that could fail to run, because the database removes the stamp when the request's unit
  of work closes. Nothing to remember, nothing to leak.

## B.5 What the service layer must never do

Written as prohibitions because that is how they will be tested:

1. Never hold a connection as the database owner or any superuser.
2. Never accept a role, actor, or permission claim from the client.
3. Never implement an authorisation check of its own. If a check seems necessary, the database is
   missing a policy — fix it there. Two permission systems drift, and the drift is the hole.
4. Never widen a database refusal into a success (for example, returning an empty list where the
   database refused, so the interface shows "nothing here" instead of "you may not see this").
5. Never log the payloads of contract content it merely passed through.

## B.6 Error handling — refusals must stay legible

The database refuses in three distinguishable ways, and the interface needs to tell them apart:

| Database outcome | Means | Interface should say |
|---|---|---|
| `insufficient_privilege` | Your role may not do this | "Your role cannot do this" — and name the role that can |
| `check_violation` / `restrict_violation` | The act is refused on its merits | The database's own message — they are written for humans and should be shown, not swallowed |
| **Zero rows affected, no error** | **A policy silently no-opped** | **Treat as a failure.** This is finding D1's shape |

Point three is not theoretical: D1 was exactly this, and the test harness has a helper
(`mustNotWrite`) that exists because a silent no-op reads as success. The service layer needs the
same instinct — a mutation that reports success while changing nothing is an error, not an outcome.

## B.7 The interface

The UI plan's six-workspace model (`U8`) stands. What this plan adds is the rules that keep the
interface honest about permissions.

- **The workspace is chosen by the session's effective role, server-side.** Not by a query
  parameter, not by client-side routing. A person cannot reach another role's workspace by typing a
  URL, and if they try, the API refuses rather than rendering an empty version of it.
- **"Acting as" is always visible** in the masthead: the person's real name and their one role.
- **Empty states name the reason.** "Nothing is waiting on you" and "You cannot see this" are
  different sentences and must never be rendered identically — collapsing them is prohibition 4
  above, arriving through the UI instead of the API.
- **Every screen is fed by rows the person's database role can read.** No screen assembles itself
  from a privileged query and filters afterwards.
- **The v3 visual language is kept.** This is not a redesign.

## B.8 Testing bar

The same bar the database already meets, extended to two-party tests the database cannot express:

1. **Two people, two roles, same endpoint, different data** — the Phase 2 done-bar from the UI plan.
2. **A forged role claim gets nothing.** Send a role in the body, the headers, and a tampered
   session cookie; all three must change nothing.
3. **A revoked person is out on their next request**, not their next sign-in.
4. **A pending countersign confers nothing.** Grant a Legal role without countersigning; the person
   signs in and cannot perform the Legal act. This is the test that proves B.2 step 2 was honoured —
   **if it passes while the API reads `cw.account.role`, the test is wrong, not the code.**
5. **No privileged connection exists.** A test that inspects the running service's connection
   configuration and fails if any pool connects as owner or superuser. Cheap, and it is the one that
   catches the "just for this endpoint" shortcut in review rather than in production.
6. **A silent no-op is a failure**, mirroring `mustNotWrite`.
7. **The identity stamp does not outlive its request.** Two parts, and both matter:
   (a) a static check that no identity setting uses the session-scoped form and no request runs
   outside a transaction — this is the one that catches an "optimisation" removing the property;
   (b) a live check that runs a request as one role, returns the connection to the pool, takes it
   back out, and asserts it now carries **no** role and **no** actor. That is the leak itself,
   reproduced deliberately, and it must come back clean.

Mutation checks apply to the service layer too: remove the effective-role join and test 4 must fail;
remove the server-side actor binding and the attribution test must fail.

## B.9 Sequence

| Step | Work | Depends on |
|---|---|---|
| **S1** | `0013` finished and green — allowlist entry, the two findings in A.3 | — |
| **S2** | Choose the service stack, and record the choice | Owner |
| **S3** | Connection layer: six pools, no privileged pool, server-side actor binding | S1, S2 |
| **S4** | Sign-in: accounts-table path first, provider path behind the same interface | S3 |
| **S5** | Session lifecycle: expiry from settings, revocation at next request | S4 |
| **S6** | The refusal-mapping layer and the silent-no-op guard | S3 |
| **S7** | Shell: sign-in, "acting as", per-role workspace routing, honest empty states | S5, S6 |
| **S8** | Administrator console — smallest surface, exercises the whole stack end to end | S7 |
| **S9** | The five content workspaces, in the UI plan's value order | S8 |

S3–S6 are the doorway and should be treated as one unit: none of them is safe alone.

## B.10 Decisions this plan needs and does not make

0. **Settled 2026-07-26 — how the identity stamp is removed.** Automatically, when each request's
   unit of work closes, rather than by service-layer code that clears it. Chosen because there is
   no clean-up step that can be forgotten, and because it lets the system run behind ordinary
   connection-sharing infrastructure without weakening attribution. This also retires the earlier
   recommendation of six separate connection pools, which existed only to avoid a clean-up step
   that no longer exists.

1. **The service stack.** The engine is Python; the database tests are Node. A third runtime is a
   third thing to keep in step. The honest options are Python (shares the engine's language and can
   call it directly) or Node (shares the test harness's). **This is an owner/architect decision and
   it should be made before S3**, because the connection layer is written in it.
2. **Identity provider, or accounts table, for the first deployment.** Affects S4's order, not its
   design.
3. **Whether the Administrator console is a separate application** or a workspace inside the same
   shell. Cheaper as a workspace; a separate application makes the blast radius smaller.

## B.11 Risks

1. **A privileged connection appears "temporarily".** Highest-severity risk in the plan, and the
   most likely. Control: test 5 in B.8, run in CI, plus the prohibition being written where a
   reviewer will see it.
2. **The API drifts into permission logic.** It starts as one convenience check and ends as a second
   authorisation system that disagrees with the first. Control: prohibition 3, and any proposed
   check being treated as a missing database policy.
3. **Pooling.** See B.3. Control: state it before deployment; check it in the health console.
4. **`account.role` used instead of `effective_role`.** Control: test 4, written so that it fails if
   the wrong column is read.
5. **Attribution still self-asserted until S3 lands.** Until then, the access history names whoever
   the client said. Control: say so, and do not describe the access history as authenticated before
   the doorway exists.

---

## What this buys, in one sentence each

- **Part A** keeps the in-flight work honest: one red test, two cosmetic-but-real findings, and the
  residual that justifies the whole next phase.
- **B.2** makes sure the front door respects the countersign rule instead of walking around it.
- **B.3** surfaces a deployment constraint that would otherwise be found in production.
- **B.5–B.6** keep the service layer thin, so the thirteen migrations of enforcement keep applying.
- **B.8** proves it, with the same instinct the database tests already use: run as the real person,
  and treat a silent no-op as a failure.
