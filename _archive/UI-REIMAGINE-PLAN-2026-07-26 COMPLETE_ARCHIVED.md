# Project Plan — Role-Based UI & the Administrator

*2026-07-26. Status: PROPOSED — awaiting owner acceptance of the four decisions in
[`UI-AND-ADMINISTRATION-ARCHITECTURE.md`](UI-AND-ADMINISTRATION-ARCHITECTURE.md) §6.
The phases below are decomposed into sixteen sequenced work packages in
[`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md).
When this plan is completed it moves to `_archive` marked COMPLETE_ARCHIVED.*

## What we are building, in one paragraph

Today anyone who opens the prototype sees every screen, and the real permission
model lives only in the database. We are rebuilding the interface as six
role-scoped workspaces — requester, legal reviewer, legal admin, auditor, viewer,
and a new **Administrator** — in the existing visual style, backed by a thin
service layer that signs each person in by name and lets the database's own rules
decide what they see. The Administrator is a steward: runs accounts, settings,
health and notifications; can never touch contract content or history.

## What already exists to build on

- The database enforces the five current roles row by row, with tests that prove
  each protection as the role it names. **This is the foundation; we extend it,
  we do not replace it.**
- Ready-made read models for the workspace "waiting lists" (missing approvers,
  review quality, retention due, origin mix, position tracking).
- The v3 prototype supplies the complete visual language, kept as-is.
- A clickable concept of the whole thing:
  [`prototype/v4-concept/Clausewerk V4 Concept.html`](prototype/v4-concept/Clausewerk%20V4%20Concept.html).

## What does NOT exist yet (and this plan therefore contains)

No service layer or API, no sign-in, no accounts for named people, no
Administrator role, and no override request/socialisation workflow (ADR-0008
specified it; it was never built — the role-scoped screens make no sense without
it, so it is in scope here).

---

## Phases

Each phase ends with the same bar the backend already meets: tests that perform
the protected action as the role the policy names, and mutation checks where a
protection is load-bearing.

### Phase 0 — Owner decisions *(no build; gates everything)*
Mike accepts or amends: the Administrator boundary, the countersign rule,
checkpoint ownership, the workspace model. Recorded in `memory.md` and
`docs/open-questions.md` like the four before them.

### Phase 1 — The Administrator in the database *(~1 week)*
Migration 0013: the `cw_administrator` role; accounts for named people;
append-only role grants with Legal countersign; the operational/owner split on
settings; watcher lists; new audit events; checkpoint duty per Phase 0. Test
suite + mutation checks in the established style.
**Done when:** every Administrator power in the architecture table works as that
role, and every "can never" is refused by the database, provably.

### Phase 2 — The doorway: service layer & sign-in *(~2–3 weeks; the riskiest phase)*
The thin API: named-person sign-in (identity provider if available, accounts
table if not), each session bound to the person's single role, no permission
logic of its own — the database refuses what should be refused. Session length
from operational settings. Every mutation lands on the audit chain with the
person's real name, which also fixes the prototype's unattributed-override bug.
**Done when:** two people with different roles get provably different data from
the same endpoints, and a forged role claim gets nobody anything.

### Phase 3 — The shell: one workspace per role *(~2 weeks)*
The v4 shell in the v3 style: sign-in, "acting as" masthead, per-role tab rows,
the waiting-list pattern, deals as the requester's unit with the pipeline rail as
a deal header. Empty-but-honest workspaces wired to real endpoints.
**Done when:** all six roles sign in and see only their own workspace, fed only
by rows their database role can read.

### Phase 4 — The Administrator's console *(~2 weeks)*
People & access (with countersign queue), settings (two panes), system health
(chain status, checkpoints, hash checks, nightly rebuild spot-check, retention
monitor, integrations), watchers & notices. The auditor's **access history**
view ships here too — the grant record is only trustworthy if the Auditor can
read all of it.
**Done when:** granting, countersigning, revoking, and a setting change all
round-trip through the UI onto the audit chain, and a revoked person is locked
out on their next request.

### Phase 5 — The five content workspaces *(~4–6 weeks, one at a time)*
In value order: **Legal reviewer** (review desk — tickets, per-finding override
decisions, concession approvals), **Requester** (my deals, pipeline-per-deal,
override *requests*, negotiate inbox), **Legal admin** (vault + ladders & rules +
governance + holds/retention), **Auditor** (chain explorer, quality, origin mix),
**Viewer** (reading room). Includes the override request → socialise → decide
workflow end to end (the ADR-0008 gap), which spans requester, viewer and
reviewer surfaces.
**Done when:** the retired blanket-override button has no equivalent anywhere,
and each workspace's "can never" list from the concept mockup is enforced, not
narrated.

### Out of scope, on purpose
E-signature and document-store integrations (the console shows their status;
connecting them is its own effort). Obligations (architected in the LCMA, not
built). Any change to the trust boundary, assembly engine, or audit chain
internals.

---

## Order and dependencies

Phase 1 and the API groundwork in Phase 2 can run side by side; everything after
needs both. Phase 4 before Phase 5: the admin console is smaller, exercises the
whole new stack end to end, and every content workspace assumes accounts and
grants exist. Rough total: **10–14 weeks of focused work**, most of it Phase 5.

## Risks, stated plainly

1. **The service layer is the new trust surface.** One wrong shortcut (querying
   as a privileged connection "for convenience") silently defeats every database
   rule. Control: the API holds no privileged connection at all, and Phase 2's
   done-bar includes proving a forged claim fails.
2. **Scope creep through Phase 5** — five workspaces invite five wish lists.
   Control: each workspace ships its waiting list and its owned records first;
   anything else is a later proposal.
3. **Bootstrap ceremony** — the one moment the owner acts. Control: scripted,
   run once, recorded on the chain as bootstrap.
4. **A second Legal bottleneck** (countersigning grants) on top of the review
   desk. Control: the daily nudge, and the Auditor's access-history view making
   slow countersigns visible rather than silent.

## What Mike sees at each checkpoint

- **After Phase 1:** nothing visual — a demonstration that the database refuses
  the right things.
- **After Phase 2:** two browser sessions, two people, two different worlds.
- **After Phase 3:** the six workspaces, real sign-in, honest empty states.
- **After Phase 4:** the Administrator's console working end to end — grant,
  countersign, revoke, and the act showing up in the Auditor's view.
- **After Phase 5:** the whole system, role by role, with the concept mockup as
  the acceptance script.
