# Work Package Package — Role-Based UI & the Administrator

*2026-07-26. Status: PROPOSED. Decomposes
[`UI-REIMAGINE-PLAN-2026-07-26.md`](UI-REIMAGINE-PLAN-2026-07-26.md) into sixteen
work packages, concatenated in dependency sequence. Design authority:
[`UI-AND-ADMINISTRATION-ARCHITECTURE.md`](UI-AND-ADMINISTRATION-ARCHITECTURE.md).
The `WP-U` series avoids collision with the backend's existing WP numbering.
When all packages close, this file moves to `_archive` marked COMPLETE_ARCHIVED.*

## How to read a package

- **Objective** — the one change in the world this package makes.
- **Deliverables** — what exists when it closes. A package with an unfinished
  deliverable is open, not "mostly done".
- **Dependencies** — packages that must be closed first. No forward references.
- **Anti-patterns** — *common* failure modes erode quality; *critical* failure
  modes silently defeat a control. A critical anti-pattern found in review
  reopens the package.
- **Testing** — the house doctrine applies everywhere and is not restated in
  each package: *every protection is tested by performing the protected action
  as the role the policy names, on the write path; a silent no-op counts as a
  failure, not a refusal; load-bearing protections get a mutation check that
  must be caught by the test that names it.*
- **Documentation** — what must be written or trued up. The 2026-07-25 review
  found eighteen findings, mostly documents promising what code didn't enforce;
  no package closes with its documents promising more than its tests prove.

## Dependency map

```
WP-U00 owner decisions ─┬─▶ U01 administrator & accounts ─┬─▶ U02 grants & countersign ──▶ U08 console: people
                        │                                 ├─▶ U03 settings & watchers ─┬─▶ U09 console: settings/health/watchers
                        │                                 ├─▶ U04 checkpoints & health ┘         ▲
                        │                                 └─▶ U05 service layer ──▶ U06 attributed mutations ──▶ U07 shell
                        │                                                                                        │
                        └────────────────────────────────────▶ U10 override workflow ◀── (U03, U06)              │
                                                                     │                                           │
                        U11 reviewer ◀─(U07,U10)   U12 requester ◀─(U07,U10)   U13 legal admin ◀─(U07)           │
                        U14 auditor & viewer ◀─(U07,U02)                                                         │
                                                        U15 acceptance & documentation ◀── everything ───────────┘
```

Parallel tracks after U01: {U02, U03, U04} and {U05→U06} can run side by side.
U07 needs U05/U06. U11–U14 can run in any order once their dependencies close;
the plan's value order is U11, U12, U13, U14.

---

## WP-U00 · Owner decisions — **CLOSED 2026-07-26**

**Objective.** The four decisions in the architecture (§6) are made by the owner
and recorded, so no later package builds on an assumption.

**Settled as.** `U5` Administrator boundary — accepted, **amended**: the role may
*read* content; write and judgement are the boundary, not sight. `U6` countersign
— accepted as proposed, for the two Legal roles only. `U7` checkpoints — **move**
to the Administrator, Legal admin's right revoked. `U8` workspace model —
accepted as proposed.

Recorded in [`memory.md`](memory.md) and [`docs/open-questions.md`](docs/open-questions.md)
with rationale and accepted costs; §4 and §6 of the architecture trued to the
`U5` amendment; the settings rows land with WP-U03, which is where the `kind`
column they need is created.

**Deliverables.**
- ✅ Decisions on: the Administrator boundary; the countersign rule; checkpoint
  ownership (move or joint); the workspace model.
- ✅ Each recorded in `memory.md` with rationale, and — where a decision is held as
  data — a row in the governance settings, marked decided, naming the decider.
  *(Rows deferred to U03 by dependency, not by choice: `cw.governance_setting`
  has no `kind` column until then. Tracked, not forgotten.)*

**Dependencies.** None. Gates everything.

**Anti-patterns.**
- *Common:* recording the decision without the reasoning — the log's value is
  the *why*, as the four settled decisions before these demonstrate.
- *Critical:* starting downstream packages "provisionally" before the boundary
  decision lands. If the Administrator's shape changes after U01 ships, the
  migration is already history and the correction is a second migration.

**Testing.** None (no code). A decision held as a settings row inherits the
existing settings tests.

**Documentation.** `memory.md` records; `docs/open-questions.md` updated the
same way the four settled decisions were.

---

## WP-U01 · The Administrator role and named accounts — **CLOSED 2026-07-26**

*Delivered in [`0013_administrator.sql`](backend/db/migrations/0013_administrator.sql) part 1,
[`db/bootstrap.mjs`](backend/db/bootstrap.mjs), and
[`administrator.test.mjs`](backend/db/test/administrator.test.mjs) — 44 tests, 8 mutations, all
caught by the test that names them. Documented in
[ADR-0011](docs/decisions/ADR-0011-the-administrator-is-a-steward.md).*

**Objective.** A sixth database role exists — `cw_administrator` — recognised by
the role accessor, holding no content power; and the system knows its people by
name in an accounts table.

**Deliverables.**
- Migration 0013 (part 1): the `cw_administrator` role (nologin, like the five);
  `cw.app_role()` extended; `cw.account` (named person, unit, the one role they
  hold, active/revoked state, created by/on).
- Per decision `U5`: `select` **is** granted to the administrator on the content
  tables, and explicitly **no** `insert`/`update`/`delete` on any of them —
  agreements, manifests, runs, clauses, tickets, negotiations, concessions,
  holds, executed records — nor any execute grant on the functions that decide
  them.
- Audit event `account_created`.
- The scripted, run-once **bootstrap ceremony**: owner creates the first
  Administrator and first Legal admin, each act recorded on the chain marked as
  bootstrap; the script refuses to run twice.
- `roles.mjs` extended: the new role in `ROLE_TO_DB_ROLE`; `become()/as()`
  work for it.

**Dependencies.** WP-U00.

**Anti-patterns.**
- *Common:* modelling accounts with a many-roles-per-person join "for later" —
  the design is one person, one role; a second role is a revoke and a grant,
  both recorded.
- *Critical:* granting the administrator any content **write** — insert, update,
  delete, or execute on a deciding function — for any reason, including "the
  health dashboard needs to mark a row checked". Health evidence comes from
  purpose-built read models (U04). `U5` opened *reading*; it did not open
  writing, and writing is where the steward boundary actually lives.
- *Common:* describing the role as content-blind anywhere in code comments,
  documents or UI copy. It reads content. Say content-visible and
  content-powerless.
- *Critical:* a bootstrap path that stays callable after first run — a standing
  owner-powered backdoor.

**Testing.**
- As administrator: every content table **writable by nobody** — insert, update
  and delete refused on the full list, not a sample; and readable, which is
  asserted positively so the `U5` grant is proven present rather than assumed.
- As each of the five existing roles: `cw.app_role()` still answers correctly;
  owner still maps to null (settled decision U3 untouched).
- Bootstrap: runs once, refuses twice; its audit rows carry the bootstrap
  marking.
- Mutation checks: remove the administrator's exclusion from a content **write**
  policy → caught by the test that names it.

**Documentation.** New ADR — *"The Administrator is a steward, not a superuser"*
— in `docs/decisions/`, stating the `U5` amendment and its cost in its own
words; `ARCHITECTURE.md` role list becomes six; `docs/glossary.md` entry;
`docs/data-model.md` gains `cw.account`.

---

## WP-U02 · Role grants and the countersign rule — **CLOSED 2026-07-26**

*Delivered in [`0013_administrator.sql`](backend/db/migrations/0013_administrator.sql) part 2 and
[`role-grant.test.mjs`](backend/db/test/role-grant.test.mjs) — 35 tests, 10 mutations. The
countersign gate, the self-grant refusal, the self-countersign refusal and the proposer-is-not-the-
acceptor refusal each have their own mutation, caught by the test that names it.*

**One design note against the brief.** The package listed `countersigned by/on` and `revoked by/on`
as columns on the grant row *and* required the table to be append-only. Those cannot both hold —
filling a column in later is an `UPDATE`. Built as an event log instead: a grant is a row,
countersigning it is a second row naming the first, revoking it is a third. Nothing is ever updated
by anyone, including the owner. The derived view `cw.effective_role` answers "what may this person
do right now", which is what the service layer consults.

**Objective.** Access is granted and revoked as recorded acts; grants of the two
Legal roles take effect only when a Legal admin countersigns.

**Deliverables.**
- Migration 0013 (part 2): `cw.role_grant` — append-only grant/revoke events:
  person, role, granted by, requested on; countersigned by/on (required before a
  Legal-role grant is *effective*); revoked by/on. No update or delete for
  anyone; corrections are new rows.
- A derived view answering "what role does this person effectively hold right
  now" — the single source the service layer (U05) will consult.
- Enforcement: an uncountersigned Legal-role grant confers nothing; an
  administrator cannot grant or countersign a role for themselves; a revoked
  account confers nothing.
- Audit events: `role_granted`, `role_countersigned`, `role_revoked`.

**Dependencies.** WP-U01.

**Anti-patterns.**
- *Common:* treating the countersign as UI workflow only — the *database* must
  refuse effectiveness without it, or the rule is one API bug from gone.
- *Critical:* self-grant or self-countersign possible by any path, including
  the administrator editing `cw.account` directly.
- *Critical:* revocation that only the API honours — a revoked person whose old
  session still maps to a live database role has not been revoked.

**Testing.**
- Grant of legal reviewer without countersign: effective-role view says none;
  the granted person's connection can do nothing reviewer-shaped.
- Countersign by a legal admin: effective immediately; by anyone else: refused.
- Self-grant and self-countersign attempts as administrator: refused.
- Append-only proven on the write path; silent no-ops are failures.
- Mutation checks on the countersign gate and the self-grant refusal.

**Documentation.** ADR from U01 gains the countersign section (or its own ADR
if the owner amended the rule in U00); `docs/data-model.md` updated.

---

## WP-U03 · The settings split and watcher lists

**Objective.** Settings divide into owner decisions (Legal admin's, unchanged)
and operational settings (the Administrator's); the watcher lists that override
socialisation will need exist and are the Administrator's to maintain.

**Deliverables.**
- Migration 0013 (part 3): a `kind` on each governance setting —
  `owner_decision` or `operational`. Every existing row becomes
  `owner_decision`; write policy on owner decisions stays Legal admin only;
  write on operational rows is administrator only. New operational rows seeded:
  `override_review_window`, `ticket_expiry`, `notification_digest`,
  `session_length` — each with a sane default and its purpose in the row.
- `cw.override_watcher`: per-category watcher lists plus the always-watchers
  (deal owner is structural, not a row). Read: any role. Write: administrator.
- Audit event `setting_changed` (old value, new value, by whom) for both kinds.

**Dependencies.** WP-U01.

**Anti-patterns.**
- *Common:* inventing operational settings nobody asked for — four seeded rows
  is the scope; a fifth is a proposal, not a drive-by.
- *Critical:* an operational setting that quietly governs content judgement
  (e.g. an "auto-approve threshold" slipped in as operational). The unedited
  approval threshold is an owner decision and stays one.
- *Critical:* watcher edits that don't land on the audit chain — silence about
  who was silenced.

**Testing.**
- As administrator: edit an operational row (works, audited), edit an owner
  decision (refused).
- As legal admin: edit an owner decision (works), edit an operational row
  (refused) — the split cuts both ways.
- Watcher add/remove as administrator (works, audited); as reviewer (refused).
- Mutation check on the kind-based write policies.

**Documentation.** `docs/data-model.md`; the settings section of the
architecture trued to the seeded rows.

---

## WP-U04 · Checkpoint duty and system-health evidence

**Objective.** The health facts the console will show exist as queryable
evidence: chain status, checkpoints on schedule, executed-document hash checks,
a rebuild spot-check, retention coming due.

**Deliverables.**
- Checkpoint execute-right **moved** to the administrator per decision `U7`, and
  revoked from legal admin in the same migration. Both halves recorded.
- Health read models, each granted to administrator (and auditor where it
  already reads): last anchor-check result and chain height; checkpoint history
  and next-due; executed-document count vs hash-verified count; latest rebuild
  spot-check result; retention due (exists — grant read to administrator, who
  sees due-ness, never content).
- The nightly job *specification* (anchor check, rebuild spot-check, checkpoint
  on schedule) — scheduled execution itself may land with U05's runtime, but
  each check is runnable on demand now.

**Dependencies.** WP-U01. (U00 decides checkpoint ownership.)

**Anti-patterns.**
- *Common:* a health view computed from assumptions ("documents stored = rows
  inserted") rather than verification actually performed. The tile says
  *verified*; the query must only count verifications that ran.
- *Common:* a health read model that returns agreement bodies. `U5` means this is
  no longer a leak, but it is still wrong design: a health model answers
  *is the record sound*, and mixing content into it makes the tile impossible to
  read at a glance. Retention due exposes identity and due-ness.
- *Critical:* moving checkpoint duty without revoking the old right — decision
  `U7` is a **move**. Legal admin's checkpoint right must be revoked in the same
  migration; two roles silently holding a duty means neither owns it, and a test
  must prove Legal admin is now refused.

**Testing.**
- Each read model as administrator (readable) and as requester/viewer
  (refused).
- Checkpoint as administrator (works, audited); as legal admin (refused, where it
  previously worked) — matching decision `U7` exactly.
- A deliberately broken stored hash makes the health model report the mismatch.

**Documentation.** `backend/README.md` operations section: what runs nightly,
what each check proves, what to do when one fails.

---

## WP-U05 · Service layer: sign-in and the borrowed permission model

**Objective.** The doorway exists: a person signs in by name, their session is
bound to their one effective role, and the API holds no opinions — the database
refuses what should be refused.

**Deliverables.**
- The thin service: sign-in against `cw.account` (identity provider if
  available; accounts table if not); session issue/expiry honouring
  `session_length`; every request executes as the person's effective role
  (from U02's view) with their name set as the actor.
- **No privileged connection in the serving path.** The service cannot query as
  owner; whatever needs elevation is a migration, not an endpoint.
- Read endpoints for what the shell needs first (deal list, waiting lists),
  each a pass-through of an existing read model.
- Revocation honoured at next request, not next sign-in.

**Dependencies.** WP-U01, WP-U02. (U03's `session_length` read if present.)

**Anti-patterns.**
- *Common:* per-endpoint permission checks duplicating database policy — two
  permission systems drift, and the drift is the vulnerability. The API's job
  is identity and connection binding, nothing else.
- *Critical:* a privileged "system" connection used for any user-facing read
  ("it's just a count") — the exact leak the frontend handoff warns about, now
  server-side and invisible.
- *Critical:* trusting any client-supplied role or actor claim. Role comes from
  the grant record; actor comes from the session; nothing the browser sends
  changes either.
- *Critical:* connection pooling that bleeds one person's role or actor into
  another's request — the ADR-0008 residual, now a live wire. Session state
  must be set and reset per request, provably.

**Testing.**
- Two sessions, two roles, same endpoint: provably different rows.
- Forged role/actor headers: nothing.
- Revoked mid-session: next request refused.
- Pool-bleed test: interleaved requests from two identities never cross-
  attribute (assert on the audit rows they produce).
- Expired session: refused, re-sign-in required.

**Documentation.** A new `docs/handoffs/` service-layer report: how identity
binds to role, why there is no privileged path, how to add an endpoint without
adding permission logic.

---

## WP-U06 · Attributed mutations through the API

**Objective.** Every write that goes through the doorway lands on the audit
chain with the real person's name — which retires the prototype's unattributed
acts for good.

**Deliverables.**
- Mutation endpoints for the workflows that exist today (open ticket, decide
  ticket, record approval, propose concession…), each a pass-through to the
  governed write path, attributed to the session's person.
- The v3 unattributed-override bug class is structurally impossible: no write
  endpoint exists that does not carry the session actor.
- Uniform refusal shape: when the database refuses, the API reports *refused,
  by which rule*, and invents nothing.

**Dependencies.** WP-U05.

**Anti-patterns.**
- *Common:* "convenience" endpoints that bundle several governed acts into one
  call — each recorded act is one act; bundling blurs what was approved.
- *Critical:* catch-and-retry logic that reissues a refused write under a
  different role or as a different connection "to make the demo work".
- *Critical:* accepting an actor name in the request body. The session is the
  actor. Always.

**Testing.**
- Each mutation as the permitted role (lands, audited, correct name and role on
  the chain) and as a refused role (refused end to end; nothing on the chain).
- The audit rows produced through the API are indistinguishable in shape from
  those produced by the database tests.

**Documentation.** Endpoint inventory in the U05 handoff; each endpoint names
the database rule it defers to.

---

## WP-U07 · The shell: six workspaces, honest and empty

**Objective.** The v4 chrome exists in the v3 style: sign-in screen, "acting
as" masthead, per-role tab rows, waiting-lists-first workspaces, deals as the
requester's unit — every pane fed only by endpoints, even when the pane is
empty.

**Deliverables.**
- Sign-in screen; masthead with named person and role; the six per-role tab
  sets from the concept mockup; footer strip.
- The waiting-list pattern as a shared component (one stat-tile strip, one
  list idiom — consolidating the prototype's four near-duplicate tile
  components, as the UI inventory recommended).
- Requester's deal list with the pipeline rail as the header of an open deal.
- Honest empty states in the existing idiom (kicker, serif sentence, one
  primary action).
- The concept mockup's static data is *not* imported; a pane with no endpoint
  yet renders an empty state, not a promise.

**Dependencies.** WP-U05, WP-U06.

**Anti-patterns.**
- *Common:* carrying the mockup's canned rows into the product "so it demos
  well" — the 2026-07-25 review was precisely about surfaces claiming what the
  system doesn't do.
- *Common:* rebuilding the visual language while touching the shell. Tokens,
  type, chips, buttons are done; this package spends nothing on style.
- *Critical:* any pane that fetches broadly and filters client-side — the
  named leak. If a workspace needs a narrower slice, that is a read model
  request on the backend, not a filter in the browser.
- *Critical:* navigation reachable by URL that the role's endpoints would
  refuse — hiding the tab is cosmetic; the route itself must resolve through
  role-scoped calls only.

**Testing.**
- Per role: rendered tab set matches the specification exactly; direct
  navigation to another role's route yields the refusal state, and the network
  log shows no cross-role data ever arrived.
- Empty-state render for every pane with seeded-empty backend.
- The pool-bleed and forged-claim tests from U05 re-run through the browser.

**Documentation.** `prototype/README.md` gains the v4 story; the concept
mockup is marked as concept, superseded by the shell.

---

## WP-U08 · Administrator console I: people & access

**Objective.** The countersigned grant lifecycle works end to end through the
UI: grant, countersign, revoke, dormancy flag — every act visible on the chain.

**Deliverables.**
- The people table (person, unit, role, granted by, last act, dormant flag);
  grant flow; revoke flow; the countersign queue with both names shown; the
  "shared accounts: 0" goal made visible.
- Legal admins see their countersign queue in *their* workspace too (a waiting
  list, per the pattern) — the queue must not live only where Legal never
  looks.

**Dependencies.** WP-U02, WP-U06, WP-U07.

**Anti-patterns.**
- *Common:* dormancy computed from sign-ins rather than recorded acts — a
  person who signs in daily and does nothing is dormant where it matters.
- *Critical:* a UI path that makes a Legal-role grant *look* effective before
  countersign. The pending state must be unmistakable — the amber badge, not a
  green one.
- *Critical:* revoke rendered as instant while old sessions continue working.
  U05 promised next-request revocation; this screen's copy must not promise
  more, and the test must prove what it promises.

**Testing.**
- Browser-level: grant viewer (alone, effective), grant reviewer (pending →
  countersign in a second session as legal admin → effective), revoke (locked
  out on next request), each act then found in the auditor's view.
- Self-grant attempt through the UI: refused with the database's reason.

**Documentation.** A short administrator's guide (grant, countersign, revoke,
what dormant means); screenshots into the U05 handoff.

---

## WP-U09 · Administrator console II: settings, health, watchers — and the auditor's access history

**Objective.** The remaining three console sections work against real evidence,
and the Auditor can read the entire access story.

**Deliverables.**
- Settings pane: operational (editable) and owner decisions (read-only, with
  decider and rationale; undecided rows flagged amber, not hidden).
- System health pane over U04's read models, including the retention monitor
  with its "visible here, actioned by Legal" boundary and a nudge action that
  notifies, never destroys.
- Watchers & notices pane over U03's tables.
- **Access history** in the Auditor's workspace: every grant, countersign,
  revocation and setting change, filterable, exportable like the rest of the
  record.

**Dependencies.** WP-U03, WP-U04, WP-U07.

**Anti-patterns.**
- *Common:* health tiles that render green when a check has *never run* —
  absence of evidence rendered as evidence. Never-ran is its own state.
- *Critical:* an edit affordance on an owner decision in the admin console —
  even one that would fail server-side. The boundary is taught by the screen.
- *Critical:* the nudge action mutating retention state in any way.

**Testing.**
- Settings: the U03 both-ways refusal, exercised through the browser.
- Health: break a hash in a fixture → the pane shows the mismatch; a
  never-ran check renders as never-ran.
- Access history: every act performed in U08's tests appears, correctly
  attributed; a viewer or requester cannot reach any console route or endpoint.

**Documentation.** Administrator's guide completed; auditor's guide gains the
access-history section.

---

## WP-U10 · The override request workflow (closing the ADR-0008 gap)

**Objective.** The specified-but-never-built workflow exists: a requester
*requests*, watchers are told, a window passes, Legal decides per finding —
and the blanket acknowledge button has no descendant.

**Deliverables.**
- Override request tables per ADR-0008: request (findings covered, mandatory
  business justification, commercial pressure), socialisation record (watchers
  notified, window from `override_review_window`), per-finding approval or
  rejection-with-note, gate effect on approval.
- The six ADR-0008 event types emitted with correct actors (`system` for
  socialisation, the person otherwise).
- Enforcement: no decision before the window closes (unless the owner decides
  a fast-path — that would be a U00-style recorded decision, not a default);
  approval strictly per finding; rejection requires the note.
- API endpoints (via U06) and the notification hooks (via U03's rules).

**Dependencies.** WP-U03, WP-U06. (Screens land in U11/U12/U14.)

**Anti-patterns.**
- *Common:* justification accepted as an empty or boilerplate string — the
  schema's non-blank discipline applies; the justification is the audit
  record's whole value.
- *Critical:* any approve-all affordance, parameter, or loop — per-finding
  means the deciding person saw each finding. A batch endpoint that iterates
  approvals is the blanket button wearing a disguise.
- *Critical:* the gate opening on request rather than approval anywhere in the
  pipeline — the difference between asking and being allowed is the product.
- *Critical:* socialisation recorded as sent when no watcher resolution
  happened (empty watcher list silently treated as "nobody to tell"). An
  uncovered category is a visible gap — the system's job is making the gap
  visible.

**Testing.**
- Full lifecycle as the roles: requester opens (works), requester approves own
  request (refused), reviewer approves finding 1 and rejects finding 2 with
  note (both recorded), gate opens for finding 1 only.
- Window enforcement: decision before close refused.
- Event actors verified: socialise rows are `system`, never a person.
- Mutation checks on the per-finding constraint and the window gate.

**Documentation.** ADR-0008 status updated from *specified, not built* to
*built*; `docs/spec-vs-implementation.md` row closed; data model updated.

---

## WP-U11 · The Legal reviewer's workspace

**Objective.** The review desk: everything waiting on Legal judgement, oldest
first — tickets, per-finding override decisions, concession approvals, holds —
in one place Legal actually works from.

**Deliverables.**
- Review desk landing (waiting lists over existing read models and U10).
- Ticket adjudication: redline view, provenance badges (`VENDOR LANGUAGE`, `AI
  CANDIDATE`, `EDITED BY LEGAL`), verify-with-confirmation and
  reject-with-note, edited-before-approval shown as the derived fact it is.
- Override decision surface (per finding, window state visible).
- Concession approvals (as attorney or reviewer) with missing-approvers
  by name; hold opening.

**Dependencies.** WP-U07, WP-U10.

**Anti-patterns.**
- *Common:* burying the oldest ticket under the newest — the desk exists to
  make the oldest wait visible; sort order is a control, not a preference.
- *Critical:* the AI candidate pre-filled into the approval text box as the
  default path. The reviewer chooses; the screen must not have chosen already.
  (The measured unedited-rate exists precisely to watch this pressure.)
- *Critical:* verify without the confirmation step that shows what will be
  minted — the wording approved is the wording that exists forever.

**Testing.**
- Each desk action as reviewer (works) and as requester (refused end to end).
- The minted clause's origin derived, not chosen (0009's rule, exercised
  through the UI).
- Reviewer cannot reach library-write, rule-edit, hold-release, or retention
  surfaces — the reviewer/admin boundary rendered and enforced.

**Documentation.** Reviewer's guide; glossary cross-links from badge names to
their definitions.

---

## WP-U12 · The Requester's workspace

**Objective.** My deals: the requester's own engagements with pipeline-per-deal,
the negotiate inbox, and the override *request* path — and nothing of anyone
else's.

**Deliverables.**
- Deal list with stage chips and awaiting-me/awaiting-others; open-deal view
  with the pipeline rail as header (Intake → Manifest → Forge → Validate →
  Dossier as stages of *this deal*).
- Validate stage shows findings with **request override** as the only path past
  a blocking finding; request status (socialising, window countdown, decided)
  visible on the deal.
- Negotiate inbox: redlines in, resolved tickets back with the seen/unseen
  loop; concession proposal on own deals.
- My record: the requester's own audit slice (the scoping the database already
  enforces).

**Dependencies.** WP-U07, WP-U10.

**Anti-patterns.**
- *Common:* the pipeline rendered as one global state again — the rail is
  per-deal now; two deals at two stages must never share a rail.
- *Critical:* any surviving acknowledge/override single actor path — the v3
  button and its descendants are retired by ADR-0008, and this screen is where
  the retirement is most tempting to undo "for demo flow".
- *Critical:* another requester's deal reachable by identifier guessing — the
  U05 tests cover the endpoint; this package re-proves it from the browser.

**Testing.**
- Two requesters seeded: each sees exactly their own deals, inbox, record;
  cross-access by URL and by API refused.
- Override request through the UI: lands as U10's request, gate stays closed,
  status renders from the record.
- The full intake-to-dossier walk on one deal, every mutation attributed.

**Documentation.** Requester's guide (the interview, the manifest, what a
blocking finding means, how requesting works and what it does not promise).

---

## WP-U13 · The Legal admin's workspace

**Objective.** The vault and its keys: the library, ladders & rules, owner
decisions, holds & retention — the whole content-governance surface in one
workspace that also contains everything a reviewer has.

**Deliverables.**
- Library: clause table with rationale drawers, activate/retire/supersede,
  expiry flags, coverage-gap surfacing (visible gap, admin's place to act —
  the product boundary in pixel form).
- Ladders & rules: rung ordering, floors, conflict-rule editing; concession
  promotion (the used-N-times signal surfaced).
- Governance: owner decisions with edit rights here (and only here), rationale
  required on change.
- Holds & retention: release (admin's act), retention destruction with the
  strongest confirmation idiom in the product.

**Dependencies.** WP-U07. (Reviewer surfaces reused from U11 where built.)

**Anti-patterns.**
- *Common:* the coverage-gap banner framed as a system failure — the system
  surfaces the gap; the gap itself belongs to the library's owners. Copy
  matters here.
- *Critical:* library edits that bypass versioning/supersession semantics —
  every change is a new version with its history intact; an in-place edit
  affordance would be the mutation-surface invariant broken in the UI.
- *Critical:* destruction reachable in fewer steps than a clause retirement.
  Irreversibility must cost proportionate friction, and destruction under hold
  must render as blocked *because held*, naming the matter.

**Testing.**
- Each admin act as legal admin (works, audited) and as reviewer (refused) —
  the boundary both ways, through the browser.
- Destruction: under hold refused; before due date refused; after both, works
  once and is recorded.
- Owner-decision edit demands rationale; the change and rationale land on the
  chain.

**Documentation.** Legal admin's guide; `CLAUSE-LIBRARY-ARCHITECTURE.md` §7
act→role table trued if any surface shifted an act's home.

---

## WP-U14 · The read-only workspaces: Auditor and Viewer

**Objective.** The two roles that change nothing get surfaces that prove it:
the Auditor reads everything; the Viewer reads exactly what was shared.

**Deliverables.**
- Auditor: chain explorer (table and timeline, filter by actor kind, CSV
  export), verified-status tile, review quality, origin mix, access history
  (from U09) — no mutation affordance anywhere, not even disabled ones.
- Viewer: the reading room — agreements shared with this person, the paper
  render, per-clause origin and approval on read; socialisation shares carry
  the window state. No export, no log, no library, no queue.
- The sharing act itself (who shared what with which viewer, recorded) —
  the small mechanism the reading room implies.

**Dependencies.** WP-U07, WP-U02 (access history), WP-U10 (socialisation
shares).

**Anti-patterns.**
- *Common:* disabled buttons standing in for absent rights — a read-only role
  gets a read-only screen, not a greyed-out editor.
- *Critical:* the viewer's paper render fetched through any endpoint broader
  than "this share, this person" — the reading room is the easiest place to
  accidentally mount the whole record.
- *Critical:* an export path on the viewer surface. ADR-0008 gave the viewer
  no export deliberately; convenience does not amend an ADR.

**Testing.**
- Auditor: reads every event class produced by every prior package's tests;
  holds no write anywhere (the existing doctrine, through the browser).
- Viewer: sees shared agreements only; unshared identifiers refused; the
  SOW-departure visibility rule (the one place viewers see approvals) renders
  correctly.
- Share and unshare recorded and visible in access history.

**Documentation.** Auditor's and viewer's guides (one page each — these roles
are simple on purpose).

---

## WP-U15 · Acceptance sweep and documentation trueing

**Objective.** The whole system holds together under the concept mockup as
acceptance script, the mutation harnesses cover the new surface, and every
document tells the truth about what is now enforced.

**Deliverables.**
- End-to-end acceptance run: the six-role walk from the concept mockup
  executed against the real system, each "can never" attempted and refused.
- Mutation sweep extended over U01–U10's protections; every new named test
  catches its own breakage.
- Documentation trueing: `README.md` status section; `docs/
  spec-vs-implementation.md` reconciled; handoffs updated;
  `UI-AND-ADMINISTRATION-ARCHITECTURE.md` status moved from proposed to built,
  with any drift between design and build listed, not smoothed over.
- This file and the plan moved to `_archive`, marked COMPLETE_ARCHIVED.

**Dependencies.** Everything.

**Anti-patterns.**
- *Common:* the sweep run once at the end instead of per package — U15 is the
  net, not the first time anyone tests.
- *Critical:* documentation stating a guarantee any test does not prove — the
  exact failure class the 2026-07-25 review catalogued eighteen of. When in
  doubt, the document weakens until the test strengthens.

**Testing.** The full `npm run verify` bar: every suite, both mutation
harnesses, plus the browser acceptance run, green in one invocation.

**Documentation.** Is the deliverable.

---

## Sequence summary

| # | Package | Depends on | Plan phase |
|---|---|---|---|
| WP-U00 | Owner decisions | — | 0 |
| WP-U01 | Administrator role & accounts | U00 | 1 |
| WP-U02 | Grants & countersign | U01 | 1 |
| WP-U03 | Settings split & watchers | U01 | 1 |
| WP-U04 | Checkpoints & health evidence | U01 | 1 |
| WP-U05 | Service layer & sign-in | U01, U02 | 2 |
| WP-U06 | Attributed mutations | U05 | 2 |
| WP-U07 | The shell | U05, U06 | 3 |
| WP-U08 | Console: people & access | U02, U06, U07 | 4 |
| WP-U09 | Console: settings, health, watchers | U03, U04, U07 | 4 |
| WP-U10 | Override workflow | U03, U06 | 5 |
| WP-U11 | Reviewer workspace | U07, U10 | 5 |
| WP-U12 | Requester workspace | U07, U10 | 5 |
| WP-U13 | Legal admin workspace | U07 | 5 |
| WP-U14 | Auditor & viewer workspaces | U07, U02, U10 | 5 |
| WP-U15 | Acceptance & trueing | all | 5 |
