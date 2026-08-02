# UI & Administration Architecture (the UIA)

*Proposed 2026-07-26. **Status: accepted 2026-07-26; BUILT** — the six
workspaces, the role-scoped tab sets, and the acting halves (D-5, 2026-08-02)
are all implemented in `prototype/v4` against the Python doorway. §3's tab
sets were amended 2026-08-02: an `obligations` tab (OB-11/OB-15) for the
requester and the Legal admin. The four decisions in §6 are settled; `U5`
amended this document and §4 has been trued to the amendment. Companion mockup:
[`prototype/v4-concept/Clausewerk V4 Concept.html`](prototype/v4-concept/Clausewerk%20V4%20Concept.html)
— open it in a browser, no build step, and switch roles in the top-right corner.*

This document does two things:

1. **Reimagines the UI** — from nine tabs everyone can open, to one workspace per
   role, in the same visual style the prototype already has.
2. **Architects the Administrator** — a sixth role that runs the machine without
   ever gaining a voice in its content, plus the tools that role needs.

---

## 1. The principle the whole redesign hangs on

> **The screen mirrors the database. What a role cannot do, its workspace does not
> show — and what its workspace does not show, the database would refuse anyway.**

Today's prototype shows all nine tabs to whoever opens the file. The real
permission model lives in the database — five roles, enforced row by row — and the
frontend handoff already warns that fetching data a role may not see and merely
hiding it on screen is a leak, not a control. The redesign closes that gap: each
person signs in as a named human holding one role, and their workspace is built
from only what that role's database connection can actually read.

Nothing about the trust boundary changes. The model still never authors contract
language; the manifest is still the only thing that crosses; signed agreements
stay frozen; the audit record stays append-only for everyone.

## 2. What stays exactly as it is

The visual language of v3 is kept wholesale — this is a reorganisation, not a
restyling:

- The dark canvas and panel palette, the teal/amber/green/red accent system, and
  the rule that **red means error, never merely "High severity"**.
- The three typefaces and their jobs: Inter for the interface, JetBrains Mono for
  identifiers, numbers and buttons, Instrument Serif for titles, quoted
  justifications and contract text.
- The idioms: the panel header with its italic serif subtitle, the stat-tile
  strip, uppercase mono chips, lowercase glyph-led buttons (`▶ run`, `✓ approve`),
  the cream "paper" surface for anything that renders a document, and the
  oversized teal quotation marks around every human justification.
- The masthead / tab row / footer chrome, and the 54–42–28px rhythm.

## 3. What changes: one workspace per role

The nine global tabs are replaced by six workspaces. Signing in is the front
door; the role on your connection decides which one you get.

| Role | Workspace | What it opens on | Its tabs |
|---|---|---|---|
| **Requester** | *My deals* | Their engagements only, each with its pipeline stage, plus what's waiting on them vs. on others | my deals · intake · negotiate · obligations · vendors · my record |
| **Legal reviewer** | *Review desk* | Everything waiting on Legal judgement, oldest first: tickets, override requests, concession approvals | review desk · tickets · routing · approvals · negotiations · holds |
| **Legal admin** | *The library* | The vault (today's Ledger), plus ladders & rules, owner decisions, holds & retention — and everything a reviewer sees | the library · ladders & rules · governance · holds & retention · obligations · review desk · routing · reporting |
| **Auditor** | *The record* | The full chain, verified status, quality and origin-mix measures, and the history of who was granted what | the record · quality · origin mix · access history · reporting |
| **Viewer** | *Reading room* | Just the agreements shared with them — built for the socialisation audience ADR-0008 created this role for | reading room |
| **Administrator** | *Administration* | People & access — see §4 | people & access · settings · system health · watchers & notices |

Three structural changes come with this:

- **Deals become the requester's unit of navigation.** The assembly pipeline
  (Intake → Manifest → Forge → Validate → Dossier) stops being five global tabs
  and becomes the stages *of one deal*, entered from the deal list. The pipeline
  rail survives as the header of an open deal.
- **Waiting lists replace tab-hunting.** Every workspace opens on "what is
  waiting on you" — the review desk for Legal, the countersign queue for the
  Administrator, awaiting-me/awaiting-others for a requester. The backend already
  has the read models for this (missing-approver functions, review quality,
  retention due).
- **The prototype's blanket `acknowledge · override` button is retired**, as
  ADR-0008 already decided. In its place: the requester *requests*, watchers are
  told, a window passes, Legal decides per finding — and each workspace shows its
  own side of that one process.

Screens the current prototype has no home for — fallback ladders, concessions
and their approval state, negotiation rounds and positions, executed agreements,
version history — land in the workspace of the role that owns them.

## 4. The Administrator

### 4.1 Why a sixth role, and why it is not a superuser

The spec is emphatic that **"the owner is nobody"**: database ownership carries no
application role, and any governed act done during installation or support must
be done as a named role so the record says who did it. That rule is right, and it
leaves a real job with no chair: someone has to grant people access, keep the
settings, watch the health of the record, and connect the integrations. Today
those jobs would fall to Legal admin (wrong: they are not content judgements) or
to the unaccountable owner account (worse: acts with no name on them).

So the Administrator is designed as a **steward, not a superuser**:

> **The Administrator runs the machine and can never change what the machine
> holds.** No writing of clause text, no deciding of tickets, overrides or
> concessions, no changing of owner decisions, and — like everyone else — no
> editing of history.

This is the product boundary applied to ourselves: system, not content.

**Owner amendment, 2026-07-26 (decision `U5`).** This document originally
proposed that the Administrator could not *read* contract content either. The
owner relaxed that: the role **may read** deals, manifests, negotiations and
redlines, so that whoever is supporting the system can see the thing being
complained about. The boundary that is kept, and that the tests enforce, is
**write and judgement** — the Administrator can change nothing and decides
nothing.

Say this accurately when describing the role: **content-visible,
content-powerless.** "Content-blind" is no longer true, and a document claiming
it would be exactly the failure the 2026-07-25 review catalogued. The cost is
recorded in [`docs/open-questions.md`](docs/open-questions.md) under `U5`.

### 4.2 What the Administrator can and cannot do

| The Administrator can | The Administrator can never |
|---|---|
| Create accounts for named people; grant and revoke roles — **grants to the two Legal roles take effect only after a Legal admin countersigns** | Hold a second role at the same time, or grant themselves one |
| Change **operational settings** (review-window length, ticket expiry, notification timing, session length) | Change an **owner decision** — those stay Legal admin's, read-only in the admin console |
| Take audit checkpoints and run anchor/rebuild checks on a schedule | Write contract content, manifests, negotiations, or anything in the review queue — reading them is permitted per `U5`; changing them never is |
| Maintain watcher lists and notification rules — *who is told*, never *who decides* | Approve, reject or decide anything in any workflow |
| Connect and monitor integrations (identity, model endpoint, e-signature, document store) | Give an integration a content role |
| See what retention makes due, and nudge Legal | Destroy anything — destruction stays Legal admin's recorded act |

Every one of these acts lands on the same hash-chained audit record as everything
else, with the Administrator's name and role on it, and the Auditor reads all of
it — including a new **access history** view: who granted whom what, when, and
who countersigned.

**The countersign rule** answers ADR-0008's own warning that role sprawl invites
everyone being handed Legal reviewer "temporarily": access to Legal judgement is
itself a judgement, so it takes two names — the Administrator who proposes and a
Legal admin who accepts. Non-Legal roles (viewer, requester, auditor) the
Administrator grants alone, recorded.

### 4.3 The Administrator's console — four tools

1. **People & access.** Named people, the role each holds, who granted it and
   when, last activity, dormant-access flags. Grant/revoke actions, and the
   countersign queue. This is also where the ADR-0008 residual — shared service
   accounts, self-asserted names — gets its fix: one account per named person.
2. **Settings.** The existing governance-settings registry, rendered as "what has
   this system assumed on my behalf", split into two panes: operational settings
   (Administrator edits) and owner decisions (Legal admin edits; the Administrator
   sees value, state, decider and rationale, read-only). Undecided owner
   decisions are flagged, not hidden.
3. **System health.** Evidence, not decoration: audit-chain verification status
   and height, checkpoint history and schedule, executed-document hash checks, a
   nightly rebuild spot-check (a past run rebuilt and compared byte for byte),
   retention coming due, and integration status.
4. **Watchers & notices.** Per-category watcher lists for override
   socialisation, and the notification rules (window closing, ticket nearing
   expiry, clause expiring, grant awaiting countersign).

### 4.4 What this means in the database

The same doctrine as every prior migration: two independent layers (grants and
row-level security), append-only history, and tests that perform the protected
act *as the role the policy names*.

- A sixth database role, **`cw_administrator`**, added alongside the five, and
  recognised by the role accessor. The owner still maps to nothing — settled
  decision U3 is untouched, and the Administrator is the named-and-recorded
  replacement for ever acting as the owner.
- **`cw.account`** — one row per named person: who they are, which role they
  hold, active or revoked. Replaces self-asserted names over time: the actor on
  an audit row should be a person the system knows.
- **`cw.role_grant`** — append-only grant/revoke events: person, role, granted
  by, countersigned by (required when the role granted is a Legal role),
  revoked by/when. New audit events: `account_created`, `role_granted`,
  `role_countersigned`, `role_revoked`.
- **Settings split** — a `kind` on each governance setting: `owner_decision`
  (write stays Legal admin only) or `operational` (write becomes Administrator
  only). Existing rows all become `owner_decision`; the operational rows are new.
  ADR-0008's "review window is a policy setting" gets its home here.
- **`cw.override_watcher`** — the per-category watcher configuration the
  socialisation step needs. The override request tables themselves are ADR-0008
  work that this design depends on but does not redefine.
- **Checkpoint duty moves.** Taking an audit checkpoint is machine stewardship,
  not a content judgement. Decision `U7`: it **moves** from Legal admin to the
  Administrator, and Legal admin's right is *revoked* in the same migration —
  not held jointly, because two roles holding one duty means neither owns it.
- **Read on content, write on nothing.** Per decision `U5` the Administrator
  role receives `select` on the content tables, and **no** `insert`, `update` or
  `delete` on any of them — nor any grant on the functions that decide tickets,
  overrides, concessions or owner decisions. Its *write* surface is exactly
  accounts, grants, operational settings, watchers, and checkpoints.

### 4.5 Costs, stated plainly

- **A sixth role is more access administration**, in a system whose own ADR
  warned five was already a lot. The mitigation is that this role exists
  precisely to make administering the other five somebody's recorded job.
- **The countersign rule adds a wait** every time Legal cover is needed in a
  hurry. That wait is the control working; the daily nudge to Legal admins keeps
  it short.
- **Bootstrap is a special moment.** The first Administrator and first Legal
  admin have to be created by the owner before the rule "the owner does nothing"
  can hold. That bootstrap is done once, scripted, and recorded on the chain as
  such — the same pattern the schema already uses for seeded rows.
- **The Administrator can starve the system** (revoke everyone, break a
  setting). They cannot *corrupt* it — content and history stay unwritable —
  and every act of starvation is on the record under their name. Recovery is the
  bootstrap path, recorded again.
- **The Administrator can read everything, and reading is not recorded.** Per
  `U5` this is accepted: the system records acts, not glances, and adding
  per-read logging for one role would be a second audit mechanism with different
  guarantees. Anyone for whom that is unacceptable should not hold this role.

## 5. What has to exist for any of this to be real

There is no service layer today — the prototype talks to nothing, and the
database enforces roles only for whoever connects to it directly. Role-scoped
workspaces therefore need the thin API the backend handoff already anticipates:
sign in as a named person, hold their role on the connection, pass rows through —
**no permission logic in the API itself**; it borrows the database's. That layer
is a prerequisite phase in the project plan, not part of this document's scope.

## 6. Decisions this proposal asked of the owner — all four settled

Settled by Mike on 2026-07-26. Recorded with reasoning and accepted costs in
[`memory.md`](memory.md) and [`docs/open-questions.md`](docs/open-questions.md),
and held as rows in `cw.governance_setting`.

| # | Decision | Settled as |
|---|---|---|
| `U5` | The Administrator boundary (§4.1–4.2) | **Accepted, amended.** Steward of the machine and never a voice in content — but content is **readable**. Write and judgement are the boundary, not sight |
| `U6` | The countersign rule for Legal-role grants (§4.2) | **Accepted as proposed.** Two names for legal reviewer and legal admin; one name for viewer, requester and auditor |
| `U7` | Who takes checkpoints (§4.4) | **Moves to the Administrator alone.** Legal admin's right is revoked, not shared |
| `U8` | The workspace model (§3) | **Accepted as proposed.** Six workspaces, waiting lists first, deals as the requester's unit, nine global tabs retired |

Status of this document therefore moves from *awaiting owner acceptance* to
**accepted, being built** — see
[`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md).
It moves to *built* at WP-U15, with any drift between this design and what
shipped listed rather than smoothed over.
