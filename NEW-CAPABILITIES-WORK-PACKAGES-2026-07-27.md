# New Capabilities — Work Package Package — 2026-07-27

**Status: APPROVED_WITH_NOTES at Gate 3 (independent validation, 2026-07-27). Ready for implementation of the ungated packages; validator's four wording corrections applied.**

**What this is.** The work-package cut of the approved New Capabilities Plan (Revision 3: WP-1
through WP-8, with open decisions D-2, D-4, D-5, D-6 and D-7). Twenty-four single-owner packages,
NC-01 through NC-24, each naming the plan work it serves. Packages that can start now are
specified at the depth an engineer can implement from; packages waiting on a decision you have not
yet made are deliberately bounded outlines that name their gate, because specifying against an
unmade decision manufactures rework. No code, migration or test file was changed in producing this
document.

**How it was made.** An adversarial workflow on Opus 5 subagents: four independent package authors
working disjoint slices of the plan (they could not see each other's work), three Gate-3 red-team
reviewers applying an evidence lens, a sequencing-and-collision lens and a house-discipline lens,
and an integrator who ruled on every disagreement by re-reading the repository rather than by
averaging opinions. Full artifacts — the objective contract, all role outputs and every verdict —
are in `.adversarial-workflow-agentic/2026-07-27-new-capabilities/`.

**Disclosures.**

- **Independence limit.** The four authors were blind to one another by scope, not by secrecy —
  their slices did not overlap, so nothing forced them to agree. That is why four of them
  independently caught the same stale fact about migration numbering, and it is also why three
  file collisions between clusters had to be settled at integration rather than by the authors.
- **One author reopened a settled decision.** The negotiation-cluster author treated the renewal
  baseline (U1) as still open and instructed implementers to preserve that framing. It is settled,
  in the database, dated 2026-07-26. The reviewer caught it, the integrator confirmed it at source,
  and every trace of the wrong framing has been removed. Nothing else in the set reopens a settled
  decision.
- **Line numbers drift.** Every high-value citation in this document was confirmed by content;
  several exact line offsets in the source material are a few lines out. Implementers must locate
  cited code by what it says, never by the line number written here.
- **One package is carried as blocked, not scheduled.** NC-24 (portfolio search over the
  counterparty's paper) has no owned file set because it waits on a dependency approval that is
  yours to give. It is written down so it is not lost, and it is deliberately kept out of the
  schedulable set so that the rest of that capability does not look blocked when it is not.
- **Two source documents are one file stale** about which migrations are untracked. This document
  names no number for any migration yet to be written; existing migrations are cited by filename
  only.

## What the review changed

Seven rulings, each made by re-reading the repository:

1. **The renewal baseline is settled.** The governance record settles it (dated 26 July; the exact
   citation is in NC-01's package body): a renewal opens from the positions actually in force in the executed agreement, with the
   drift report alongside; restarting from library standard remains reachable as an explicit,
   recorded choice. The commentary in `0011` that one author cited is pre-decision text,
   superseded. Ruling: settled, inherited, not reopened anywhere in this set.
2. **A live endpoint reads one of the views being rescoped.** One author asserted as Observed that
   no Python reads any of the five negotiation/concession summary views. In fact the concessions
   read endpoint consumes one of them (the exact citation is in NC-01's risks). Verified at source
   by the integrator. Ruling:
   the claim is struck; NC-01 declares the consumer, preserves the view's column list exactly, and
   names the re-test.
3. **The connection work is finished but uncommitted.** Its plan and work packages sit in
   `_archive/` marked COMPLETE_ARCHIVED, and `runs.py`, `documents.py`, `executions.py` and their
   tests exist on disk — all untracked, with `app.py`, `server.py`, `reads.py`, `mutation_check.py`,
   `test_server.py` and `test_reads.py` modified. Ruling: every gate that said "wait for the
   connection work" is restated as one testable condition — *those files are clean in `git status`* —
   so the gate can be checked rather than argued.
4. **Two capabilities had no owner and were being pointed at as gates.** Receiving a document into
   the system, and closing the renewal write path that a security-definer function walks around.
   Ruling: an unowned prerequisite that three packages point at is a missing package. Both are now
   packages (NC-07, NC-03).
5. **Four packages were larger than one owner.** Ruling: split — supplier paper into decomposition
   and its analysis tail; round analysis into its deterministic half and its AI-assisted half; the
   four undecided governance acts into the one that is ready and the three that are not; and the
   library builder's self-approval refusal — which needs no decision at all — out of the builder
   that needs two.
6. **Two packages were about to write to the same permanent record.** Two clusters each planned to
   add columns to the draft record, both gated on the same design session, neither claiming the
   file. That record can never be deleted or corrected. Ruling: NC-11 owns that migration; the
   compliance package contributes its columns to it and keeps only its own audit and test work.
7. **One open question is framed on a false picture.** The plan puts D-6 as a conflict between
   reporting AI uses whose content the customer believes was deleted, and under-reporting. Read at
   source, deletion today reaches only the executed-agreement records; it never reaches the AI-use
   record at all, and the draft record cannot be deleted by anyone. Ruling: D-6 must be re-put in
   those terms before it is answered.

## Decisions and heads-ups for Mike

None of these stop work starting. Four packages can start the day this document is accepted, and
two more the moment the first one (NC-01) merges.

1. **Commit the connection work, or say it is done.** Twelve files from that effort sit finished
   but uncommitted in the working tree. Nine packages here wait on it, and they wait on the files being
   settled rather than on any remaining work. One instruction releases them all.
2. **The renewal path still has an open door.** The negotiation record is about to get proper
   ownership rules, but one built-in shortcut for opening a renewal runs with the rules switched
   off, so it walks around them. That is its own small package (NC-03), and it should land in the
   same week as the rules themselves rather than being noticed later.
3. **Nobody owns "the system can receive a document."** Today the system can send a document out
   and cannot take one in. Three separate pieces of work need that, and if it is not owned once, it
   will be built twice, differently. NC-07 owns it. Choosing how a document arrives also decides
   the largest document the system will accept — that is a product fact, not a technical detail,
   and it comes back to you.
4. **The draft-record design session (D-4) is the single biggest unblocker.** Four packages wait
   on it. The record it covers can never be corrected once written, which is exactly why the
   session exists. NC-04 prepares it, needs nothing from anyone, and is a one-page yes/no/defer
   sheet at the end.
5. **One safety rule the plan assumed exists does not.** A person can approve their own request
   for new contract language. The plan describes forbidding this as a small addition; it is not
   built at all. It is also cheap to build and needs no decision from you, so it is its own package
   (NC-05) near the front.
6. **The deletion question (D-6) must be re-asked properly.** The question as written assumes the
   AI-use record gets deleted when a customer asks for data to be removed. It does not — deletion
   today reaches the signed-contract records only, and the AI-use record cannot be deleted at all.
   The real question is whether it should have any deletion path. Answering the question as
   originally written would settle it against a picture that is not true.
7. **Two decisions should be taken in one sitting.** Whether to adopt meaning-based search over
   the counterparty's paper (a new outside dependency, and yours to approve) changes what the
   EU-documentation work has to cover. Deciding them separately means deciding the second one
   twice.
8. **Nobody in this set picks a number.** No threshold, no default, no clause wording, no
   disclosure sentence. Where a threshold is stored, it ships empty on purpose and a test enforces
   that it ships empty — because relying on discipline alone has already failed here once.

## Owner additions after Gate 3 (2026-07-27, recorded — packages not yet re-cut)

Two AI advisory features were added by the owner after this set passed Gate 3, and have since
been authored as packages NC-25 and NC-26 (end of this document). They introduce one new
decision, D-8: Clausewerk itself calling an AI model is a new outside dependency — a provider,
a key, a per-call cost — and it needs the owner's approval before either package starts.
Summary of the two features:

- **AI semantic-difference measurement** (plan WP-6 area): how much the *meaning* changed between
  the AI draft and the approved text. An AI judgment stored with provenance, labelled an estimate,
  shown beside the arithmetic score, never instead of it, never caller-supplied. Not a field on
  the frozen draft/ticket record — it arrives after the fact and lives in its own advisory record.
  The D-4 four-field ruling stands unchanged.
- **Risk-exposure score** (plan WP-3 area, alongside NC-17): AI estimate, baselined on the
  original clause, of the % of risk transferred from supplier to customer — in both directions:
  every PROPOSED move in round analysis carries its estimate before the buyer chooses, and an
  accepted concession carries what the choice actually cost. Same judgment rules. Recorded in
  `memory.md` (U14a–U14d).
- **Mid-negotiation drafting** (owner intent confirmed 2026-07-27, memory.md U14e): when a
  supplier's edit has no good pre-approved alternative, the AI drafts recommended counter-language
  — which lands in the review queue as a proposal for a named attorney to approve, edit or
  reject, exactly the flow 0008 built (AI-draft reason code, frozen baseline, no self-approval
  since NC-05). To be authored as its own package in the WP-3 area once NC-17 and NC-25's model
  seam exist; the language a model proposes is content, placeholder until Legal reviews it.

## Order of work

```
START NOW (nothing gates these)
  NC-01  negotiation ownership + view scoping (one migration)
    ├─ NC-02  negotiation write endpoints
    └─ NC-03  the renewal shortcut's ownership check
  NC-04  draft-record session prep  ──────────────► opens D-4
  NC-05  self-approval refusal (verified gap, no gate)
  NC-06  ladder placement + ranking (new engine module)

GATE C — the connection work's files are clean in git status
  NC-07  receive a document  (owns the inbound path and the size limit)
    ├─ NC-08  negotiation reads          [also needs NC-01]
    ├─ NC-09  record a received redline  [also needs NC-02]
    └─ NC-18  supplier paper: decompose + quarantine
  NC-10  AI pipeline connection + integration guide
  NC-16  portfolio questions on our own paper        [+ GATE D-7]

GATE D-4 — the draft-record design session (NC-04 prepares it)
  NC-11  draft-record migration: edit-quality figure + EU fields  (sole owner of that file)
    ├─ NC-12  EU documentation: audit payload + schema tests
    │     └─ NC-15  compliance export        [+ GATE D-6, re-put; + GATE C]
    ├─ NC-13  customer threshold + metric read surface   [+ GATE C]
    └─ NC-20  clause library builder         [+ GATE D-5]

GATE D-2 — EU risk classification (counsel)
  NC-14  AI disclosure setting

GATE D-5 — are the six governance controls in this effort?
  NC-21  retention destruction + supersession endpoints   [+ GATE C]
  NC-22  concession promotion endpoint                    [+ GATE C]
  NC-23  the three undecided governance acts   [+ owner session; no files claimed]

ROUND ANALYSIS
  NC-17  analysis record + AI-assisted path   [NC-01, NC-06, NC-07; + matcher-fallback reading]
    └─ NC-19  supplier units through analysis  [NC-17, NC-18]

BLOCKED — not schedulable
  NC-24  portfolio search over supplier paper  [dependency approval: Mike's]
```

**Two shared files, one queue each.** `backend/doorway/writes.py` is claimed by NC-02, NC-09,
NC-20, NC-21 and NC-22 in that order (NC-02 may start now; the later claimants each carry their
own gates). `backend/doorway/reads.py` is claimed — only after Gate C opens — by NC-08, NC-13,
NC-15 and NC-16 in that order. Nothing in either queue starts while an earlier item in the
same queue is open. Tests live inside every package; there is no test package. Every package that
touches the backend ends with `npm run verify` green including all three mutation harnesses, and
asserts `git diff --stat backend/engine/` is empty on pre-existing files: the engine is extended,
never edited.

---

## NC-01 — Negotiation ownership and view scoping — one migration, three rules

*Serves plan WP-2 (Negotiation Core).*

**Objective.** Make the database — not an endpoint — decide whose deal a person may write
negotiation records against, and make the five negotiation and concession summary views consult
who is asking. Three rules in one migration, modelled line-for-line on the migration that did the
same job for the run tables.

**Prerequisites**

- None. This package is startable today: it touches no file in the frozen set and no file the
  connection work has open.
- At the moment the package starts, list `backend/db/migrations/` on disk and claim the next free
  number. Do not take a number from this document. (Two migrations are untracked as of today;
  the count in the source planning documents is stale, which is the whole reason for the rule.)

**Scope**

- **Rule (a) — write-scoping of the four negotiation tables.** Replace the four role-only INSERT
  policies on `cw.negotiation`, `cw.negotiation_round`, `cw.negotiation_position` and
  `cw.position_movement` (each reads `with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'))`,
  `0011_negotiation_record.sql:359-360, 368-369, 377-378, 384-385`) with the house two-branch shape
  the run migration uses: Legal roles unconditional, requester gated on ownership. For
  `cw.negotiation` the test is `cw.owns_agreement(agreement_id)`; for round and position it is an
  `exists` against the parent negotiation; for movement it is an `exists` against the parent
  position. Those subqueries evaluate under row-level security, so they mean "a parent row this
  caller can see" — the same reasoning the run migration recorded, and the same words the read
  policies already sitting above each one use (`0011:349-352`).
- **Rule (b) — read-scoping of the three negotiation views:** `cw.position_current` (`0011:196`),
  `cw.position_revival` (`0011:211`), `cw.renewal_drift` (`0011:307`). None carries a WHERE clause;
  all three are granted to four roles at `0011:393-394`. A view runs with its owner's rights and
  row-level security on the base tables is ENABLED not FORCED, so the base-table read policies are
  never consulted through them. Add the scoping expression in each view's own WHERE, in the same
  words as `cw.negotiation`'s read policy. `position_revival` and `renewal_drift` must correlate to
  `cw.negotiation` to have an agreement to scope against.
- **Rule (c) — read-scoping of the two governance views:** `cw.concession_state` (`0010:473`) and
  `cw.concession_in_force` (`0010:488`), granted to the same four roles at `0010:564-565`, likewise
  unscoped. Same treatment, through `cw.concession`'s `agreement_id`.
- `CREATE OR REPLACE` for all five views, preserving each existing select list exactly so no
  consumer's columns move. DROP-and-CREATE by name for the four policies, so the rollback is
  symmetrical and the prior text is quotable verbatim.
- A `-- THE PRIOR TEXT, VERBATIM, FOR A REVERTING MIGRATION` footer quoting all four replaced
  policies and all five prior view definitions.
- Extend `backend/db/test/negotiation.test.mjs` with the write-refusal and read-scoping cases.
  **This package is the sole owner of that file** for the duration of this set; no other package
  edits it.
- No mutation-check row: this package adds no guarded Python line, and both MISS and SKIP are fatal
  in the harness, so an unnecessary row would fail it.

**Out of scope**

- Any endpoint. This package changes no Python.
- Reopening the renewal baseline. It is SETTLED (`0012_sow_override.sql:285`): a renewal opens from
  the positions in force in the executed agreement, with the drift report as the named control, and
  library standard remains reachable as an explicit recorded choice. Nothing in this migration
  narrows or reopens that, and no package text may instruct an implementer to preserve an
  "unsettled" framing.
- Granting `cw_administrator` select on any of the five views. It holds the four base tables
  (`0013:303-304`) and none of the views — the identical gap the run migration deliberately left
  open, because a role's read boundary is an owner decision that must not be settled inside a
  scoping migration. Leave it open, say so in the migration header, and do NOT write an
  administrator branch into any WHERE clause: it could never execute, and
  `backend/db/test/views-are-not-policies.test.mjs` exists to catch exactly that.
- Hardening `cw.open_renewal` — that is NC-03.
- Anything touching `cw_viewer`. `0011:399` records the deliberate absence of any negotiation grant
  to that role.

**Target files**

- `backend/db/migrations/<next free number>_*.sql` (NEW — number verified on disk at start)
- `backend/db/test/negotiation.test.mjs` (MODIFIED — sole owner)

**Acceptance criteria**

- Against the migrated schema, not mocks: as a requester who does not own agreement X, every one of
  the four INSERTs is refused — the negotiation, a round on it, a position on it, and a movement on
  that position. Each is attempted separately; closing one without the others achieves nothing.
- As the requester who DOES own X, all four INSERTs succeed unchanged.
- As `legal_reviewer` and as `legal_admin`, all four succeed against a deal they do not own — the
  two-branch shape must not lock Legal out, since Legal never appears in `cw.agreement.requester`
  (`cw.owns_agreement` resolves to `a.requester = cw.app_actor()`, `0003:626-631`).
- Each of the five views, read with rows from two different agreements present, returns only the
  requester's own rows for a requester, and all rows for `legal_reviewer`, `legal_admin` and
  `auditor`.
- Each of the five views returns the same column list and order as before, compared against
  `information_schema`, not against a hand-written list.
- `backend/db/test/views-are-not-policies.test.mjs` passes unchanged.
- The existing GET /concessions read still returns its documented columns; its rows narrow for a
  requester, which is the intended effect.
- `backend/db/test/run-all.mjs` passes against a freshly migrated database.
- No test asserts on comment text, message wording, clause language or a threshold value.

**Risks**

- **`cw.concession_state` has a live consumer.** `backend/doorway/reads.py:246` reads it
  (`from cw.concession_state s join cw.concession c using (concession_id)`). The column list is
  preserved so the endpoint keeps working, and its rows correctly narrow for a requester — but
  `reads.py` and `test_reads.py` are in the connection work's file set, so the endpoint's own
  regression test is re-run once Gate C opens, and this package records that as a follow-up rather
  than editing either file.
- `cw.open_renewal` is SECURITY DEFINER (`0011:236-239`) and INSERTs into `cw.negotiation` and
  `cw.negotiation_position` directly, so it bypasses the policies this migration installs, and
  execute is granted (`0011:402-403`). Flag it in the migration header as a named residue pointing
  at NC-03. Do not silently rewrite a security-definer function inside a scoping migration.
- `cw.position_revival` is a GROUP BY / HAVING view; a correlating WHERE must go before the
  grouping or it changes the aggregate. Verify row counts, not just visibility.
- A duplicate migration number does not announce itself — the bootstrap applies files in filename
  order with no duplicate gate, and the failure surfaces later as a migration that silently did not
  run. Hence the number is verified on disk at start.
- Seeded demo rows (`backend/doorway/seed_demo.py`) may have been written under the old permissive
  policy against deals their author does not own; after this migration those rows become invisible
  to that author. Check the seed before assuming a test failure is a policy bug.
- Cited line offsets drift by a few lines; locate each policy and view by its text.

**Rollback.** A single follow-on migration restoring the four policies and five view definitions
from the verbatim footer. Additive by replacement: no data destroyed, no row shape changed, and
because the column lists are preserved, the one live consumer needs no re-pointing either way.

---

## NC-02 — Negotiation write endpoints over the scoped schema

*Serves plan WP-2 (Negotiation Core): opening a negotiation, recording each round a document is
exchanged, and moving positions between states.*

**Objective.** Give the negotiation record its endpoints entirely as data in `writes.WRITES`, so
that `app.py` needs no edit and the package can proceed alongside the in-flight connection work.

**Prerequisites**

- NC-01 merged. These endpoints perform no permission checks of their own (`writes.py:31-34` —
  "NO PERMISSION CHECKS. Same as the reads: the database decides"), so shipping them over the
  unscoped policies would ship the write hole as a product feature.
- **A gating pre-task with a written finding, done before any code:** write the SQL for
  POST /negotiations/renew and for the escalation endpoint and confirm each is one statement. A
  `writes.WRITES` entry adds an endpoint without touching `app.py` (`app.py:158`,
  `if key in writes.WRITES`); a module needs its own explicit branch (`app.py:165, 173, 180, 183`)
  and therefore falls under the frozen-set rule. Any endpoint that fails the one-statement test is
  removed from this package and re-filed behind Gate C. This finding decides the package's start
  date and is recorded, not assumed.
- Position in the `writes.py` queue: first. NC-09, NC-20, NC-21 and NC-22 follow.

**Scope**

- POST /negotiations — one INSERT into `cw.negotiation`. From the body: `agreement_id`, `paper`,
  `baseline`, `renews_agreement_id`, `baseline_note`. Never from the body: `opened_by` and
  `baseline_chosen_by` — both are actors and both come from the connection. `NEVER_FROM_THE_BODY`
  (`writes.py:75`) already contains `opened_by`; add `baseline_chosen_by`. That is a `writes.py`
  edit, not an `app.py` one.
- POST /negotiations/renew — `select cw.open_renewal(...)`, one statement. Kept as a SEPARATE
  endpoint rather than a conditional inside POST /negotiations: `writes.py:22-26` requires one act
  per endpoint, and opening from last term's executed positions is a different commercial act from
  opening from library standard. Pass `p_baseline` through when supplied and null when not. The
  rationale, corrected: the renewal baseline is SETTLED (`0012:285`) — the governance setting
  pre-selects the executed-agreement baseline and the drift report is the named control; library
  standard stays reachable as an explicit, recorded choice. Passing the value through honours the
  settled decision; it does not preserve an open question.
- POST /negotiations/rounds — one INSERT into `cw.negotiation_round`. `actor` from the connection.
  The `cw.round_is_next()` trigger (`0011:86`) refuses a gap in the sequence and the
  `only_our_rounds_have_a_run` check (`0011:75`) refuses a run id on a received round; both are
  refusals to pass back unchanged, never to pre-empt with a check in Python.
- POST /negotiations/positions — one INSERT into `cw.negotiation_position`. The
  `cw.position_opens()` trigger (`0011:183`) writes the first movement row, so this endpoint does
  not.
- POST /negotiations/positions/move — one INSERT into `cw.position_movement`. `to_state` is
  constrained by the table (`0011:156-157`); do not restate that list in Python, because a second
  copy of a constraint is how two copies quietly stop agreeing.
- POST /negotiations/positions/escalate — one INSERT with `to_state = 'escalated'`. Separate from
  /move because escalation is the act a person means to perform and a caller should not reach Legal
  by typing a string. Not bundled with creating a review ticket: that would be two governed acts in
  one call.
- Tests in `backend/doorway/test_writes.py`.
- **Mutation rule:** no mutation-check row unless a named test in this package consumes the guarded
  line.
- Endpoint paths above are illustrative. `server.py` strips a leading `/api/` before dispatch, so
  both spellings are true at different layers; the plan deliberately freezes neither.

**Out of scope**

- Any read endpoint (NC-08).
- Receiving a document (NC-07) and recording a received redline (NC-09).
- `backend/db/test/negotiation.test.mjs` — NC-01 owns it exclusively. All SQL-layer assertions
  belong there; this package's tests are Python.
- Any edit to `app.py`, `server.py`, `reads.py`, `mutation_check.py` or `test_server.py`.
- Round analysis, redline diffing, ladder comparison (NC-06, NC-17).
- Any screen.

**Target files**

- `backend/doorway/writes.py` (MODIFIED — new WRITES entries; `baseline_chosen_by` added to
  `NEVER_FROM_THE_BODY`)
- `backend/doorway/test_writes.py` (MODIFIED)

**Acceptance criteria**

- `git diff --stat` shows no change to `app.py`, `server.py`, `reads.py`, `mutation_check.py` or
  `test_server.py`. This is the package's central claim, asserted mechanically.
- Each new endpoint is reachable end to end through `App.handle()` with only a `writes.WRITES`
  entry present — which is what proves the no-collision claim.
- The existing test that walks `writes.py` asserting no handler takes an actor from the body passes
  with the new entries, including `baseline_chosen_by`.
- Refusal tests against the roles that actually hold grants (`cw_requester`, `cw_legal_reviewer`,
  `cw_legal_admin` hold select+insert on all four tables, `0011:387-389`; `cw_auditor` select only,
  `0011:390-391`; `cw_administrator` select only, `0013:303-304`; `cw_viewer` nothing, `0011:399`):
  as auditor and as administrator every endpoint is refused; as a requester against a deal they do
  not own every endpoint is refused; as the owning requester and as both Legal roles each succeeds.
- A refusal is reported as the database stated it, never retried on another connection or as
  another role.
- A write that changed no row is reported as the refusal it is, not as success with an empty list.
- Every act appears in the audit chain — `cw.audit_negotiation()` fires on insert into all four
  tables (`0011:317`, triggers at `0011:337-343`).
- No test asserts on message wording, category labels or thresholds.

**Risks**

- The start-date risk is the pre-task above, and it is settled before code, not during it.
- `psycopg` binds `%s` by order of appearance, not by number. Every placeholder must be named after
  the field that fills it (`writes.py:36-49` — the ported bug that silently wrote the wrong thing
  and reported success).
- Until NC-03 lands, POST /negotiations/renew is the one endpoint whose refusal test may pass for
  the wrong reason, because the renewal function runs with row rules off. Assert its scoping
  deliberately and, if it does not hold, say so rather than removing the test.

**Rollback.** Delete the WRITES entries and their tests. No schema change, no other module altered.

---

## NC-03 — The renewal shortcut gets an ownership check

*Serves plan WP-2. Created at integration: a verified open write path that the reviewers found
named by two packages and owned by none.*

**Objective.** Close the one route into the negotiation record that NC-01's rules cannot reach, so
that "you may only write against your own deal" is true through every door and not just the front
one.

**Prerequisites**

- NC-01 merged. This package hardens the path that migration deliberately leaves open and names in
  its header.
- Number claimed from disk at start.

**Scope**

- `cw.open_renewal` is SECURITY DEFINER (`0011:236-239`) and INSERTs into `cw.negotiation` and
  `cw.negotiation_position` with the caller's row rules switched off. Execute is granted to
  `cw_requester` and both Legal roles (`0011:402-403`). Add the ownership check inside the function,
  before the first insert, in the same two-branch shape NC-01 installs: Legal roles unconditional,
  requester gated on `cw.owns_agreement`.
- One migration, `create or replace` of the function body only, with the prior body quoted verbatim
  in the reverting footer.
- Tests in `backend/db/test/negotiation.test.mjs` — **after NC-01 has merged and released the file.**
- No Python. No endpoint change: NC-02's renew endpoint keeps its shape and simply stops being able
  to open a renewal on someone else's deal.

**Out of scope**

- Changing who may execute the function, or removing SECURITY DEFINER. Both are owner decisions;
  this package only stops the function doing something the owner already decided it should not.
- Any other security-definer function in the schema. If the same shape exists elsewhere, that is a
  finding to write down, not scope to absorb.

**Target files**

- `backend/db/migrations/<next free number>_*.sql` (number verified on disk at start)
- `backend/db/test/negotiation.test.mjs` (after NC-01 releases it)

**Acceptance criteria**

- A requester calling the renewal function against an agreement they do not own is refused, and the
  refusal comes from the database.
- The owning requester, `legal_reviewer` and `legal_admin` all still open renewals successfully.
- NC-02's renewal refusal test now passes for the right reason, and a comment records that it
  previously could not.
- The existing renewal tests pass unchanged.
- No test asserts on the refusal's wording.

**Risks**

- A security-definer function's whole point is to do something the caller cannot; narrowing it can
  break a legitimate caller. The Legal-unconditional branch is what prevents that, and the tests
  above assert it directly.
- If the function is called from anywhere else in the schema, the new refusal reaches that caller
  too. First task: search the migrations for callers and record what was found.

**Rollback.** One follow-on migration restoring the prior function body from the footer. No data
touched.

---

## NC-04 — Prepare the draft-record design session (D-4)

*Serves the D-4 design session, which gates plan WP-5, WP-6 and WP-7.*

**Objective.** Produce the single briefing that lets the owner settle D-4 in one sitting: what the
draft record carries today, what the metrics and documentation work need added, and why the record
can never be corrected afterwards.

**Prerequisites**

- None. Startable now: this package writes no code and touches no file the connection work owns.

**Scope**

- Inventory the existing draft record at source: `cw.clause_draft` carries `draft_id`, `kind`,
  `text` (the frozen model baseline), `prompt`, `model`, `model_version`, `inputs`, `created_by`,
  `created_at`, `expires_on`, and a not-blank check on text (`0008_review_queue.sql:57-75`).
- Inventory the ticket half, because the before-and-after the metrics measure lives there, not on
  the draft: `proposed_text` (immutable), `approved_text`, `edited_before_approval` (derived),
  `decided_by`, `decided_on`, `minted_clause_id`, `minted_version` (`0008:82-143`).
- State the append-only constraint in plain terms with citations: a ticket's proposal half cannot be
  rewritten, only decided (`0008:264-277`); a decided ticket cannot be reopened or redecided
  (`0008:279-284`); a draft is frozen the moment a ticket is opened against it (`0008:361-375`);
  deletes and truncates raise on both tables (`0008:311-333, 384-395`). The consequence to put in
  front of the owner in one sentence: a field agreed wrong is a field that stays wrong for every
  record already written.
- List the candidate new fields and no more: the edit-quality similarity figure, and the three EU
  documentation fields the plan names — intended purpose, known limitations at time of use, model
  performance metrics. **State explicitly that these four cover BOTH consumers**, the metrics work
  and the documentation work, because one migration (NC-11) will carry all four and two packages
  depend on that session's answer.
- For each candidate field, present the three questions the session must answer: which table it
  lives on (draft or ticket), whether it is nullable for records written before the field existed,
  and who may write it (nobody, the trigger, or Legal).
- Record the standing constraint that the similarity figure is derived by the database and never
  supplied by the caller, with the existing precedent so the session does not relitigate it:
  `edited_before_approval` is assigned over whatever the caller supplied, inside
  `cw.review_ticket_transition()` (`0008:292-301`).
- Record the standing constraint that thresholds are not fields on the record: they follow the
  governance-settings pattern (NC-13).
- Deliver a one-page decision sheet: each proposed field, one line of plain language, a
  yes/no/defer box.

**Out of scope**

- Writing any migration. This is preparation for a decision, not the change the decision
  authorises.
- Choosing the similarity algorithm — engineering's choice in NC-11, presented to the session only
  as "a number between 0 and 1, computed the same way every time".
- Proposing a threshold value of any kind. That is settled as deliberately unset
  (`0012_sow_override.sql:295-305`) and the system must never choose that number.
- Reopening the renewal baseline or the threshold decision.

**Target files**

- `docs/` (new briefing document; exact path assigned at package start)
- No source file is modified.

**Acceptance criteria**

- The briefing names every existing `cw.clause_draft` column and every `cw.review_ticket` column
  with a citation to `backend/db/migrations/0008_review_queue.sql`.
- The briefing lists exactly four candidate new fields and states that they serve both consumers;
  any fifth is flagged as scope growth rather than silently added.
- For each candidate field it states table, nullability and writer as an open question with
  options, never as a recommendation of a number or a wording.
- The append-only constraint is stated in plain business language with its citations in a footer.
- The document contains no proposed threshold value.
- `git status --short backend/` is unchanged by this package.

**Risks**

- The session widens into "redesign the draft record". Mitigation: the briefing opens by stating
  that most of what a regulator asks for is already stored, and that the session's job is four
  fields.
- The preparation is read as the decision. Mitigation: every field is a question with options.

**Rollback.** Delete the briefing. Nothing else changed.

---

## NC-05 — A person may not approve their own request

*Serves plan WP-5 (Clause Library Builder). Split out at integration: a verified gap that needs no
owner decision and was buried behind two that are unmade.*

**Objective.** Make the database refuse to let the same person open a request for new contract
language and then approve it, while leaving Legal free to decide a Legal-opened ticket.

**Prerequisites**

- None. Startable now: one migration and one SQL test, no file in the frozen set, no decision
  pending. The gap is verified, not inferred.
- Number claimed from disk at start.

**Scope**

- `cw.verify_review_ticket()` contains exactly one authorization check — the actor's role must be
  `legal_reviewer` or `legal_admin` (`0008_review_queue.sql:513-516`) — and never consults
  `cw.review_ticket.opened_by` (`0008:120`, which appears elsewhere only in the immutability guard
  and one unrelated view predicate). The plan's requester-may-not-approve rule is not enforced
  today. Confirmed at source by two reviewers and the integrator.
- Add the refusal inside the function by `create or replace`, beside the existing role check —
  never in the doorway, where a caller can route around it.
- Bound the rule precisely: refuse when the person deciding is the person who opened the ticket as
  requester; still permit a Legal reviewer to decide a Legal-opened ticket, which is the plan's own
  carve-out.
- One migration, prior function body quoted verbatim in the reverting footer.
- Tests in a new file under `backend/db/test/`, against the migrated schema.
- No mutation-check row: no Python line is guarded here.

**Out of scope**

- Anything else in the library builder — AI drafting, candidate selection, the new write endpoint
  (NC-20).
- Changing who may verify, or adding a third entrance into the library. `0008:398-412` is explicit
  that there are exactly two recorded entrances and both call one minting function.
- Any change to `cw.mint_clause_version` or the clause-version-from-ticket guard.

**Target files**

- `backend/db/migrations/<next free number>_*.sql` (number verified on disk at start)
- `backend/db/test/<new>.test.mjs`

**Acceptance criteria**

- A test proves the person who opened a requester-originated ticket cannot verify it, and that the
  refusal comes from the function.
- A test proves a Legal reviewer can still verify a Legal-opened ticket.
- A test proves the existing role refusal still holds for every other role.
- The existing review-queue tests pass unchanged.
- No test asserts on the refusal's wording.

**Risks**

- Widening the verify function disturbs the minting path it also performs. Mitigation: the existing
  tests passing unchanged is an acceptance criterion here.
- A seeded demo ticket may have been opened and verified by the same person under the old
  behaviour; check the seed before assuming a test failure is a bug in the rule.

**Rollback.** One follow-on migration restoring the prior function body. Nothing else changed.

---

## NC-06 — Ladder placement and alternative ranking — a new engine module

*Serves plan WP-3 (Negotiation Round Analysis), the deterministic half. Split out at integration.*

**Objective.** Give the system a deterministic way to place a negotiating position against its
ladder and to rank alternatives best-to-floor, as a new engine module with its own tests and no
network call — so that when round analysis is built, the part that must be reproducible is already
built and proven.

**Prerequisites**

- None. Startable now: it depends only on the ladder tables, which already exist, and it adds only
  new files.

**Scope**

- A NEW module under `backend/engine/`: given a category and severity, place a position against
  `cw.ladder` and `cw.ladder_rung` (rung 0 = preferred, exactly one `is_floor`, rungs contiguous
  from 0 — `0003_ladders_and_concessions.sql:28-60`), and rank the available alternatives from
  preferred down to the floor.
- Below-floor is always a refusal, never a score. The schema's own comment on `is_floor` says
  escalation below it is mandatory and no similarity score or threshold may bypass it; the module
  returns that refusal rather than a low ranking.
- Engine-level unit tests for the module, in the engine's own test style.
- No doorway adapter here — NC-17 adapts to it. This package ships a capability the engine can
  prove on its own.

**Out of scope**

- Any modification to an existing `backend/engine/` module. `docx.py`, `resolution.py`, `run.py`,
  `loader.py`, `manifest.py` and `validation.py` are called, never edited.
- Anything AI-assisted: matching a change to a position, categorisation, risk assessment, the
  recommendation. All of that is NC-17.
- Any migration, any doorway file, any endpoint.
- Choosing thresholds or risk bands — content, and the customer's.

**Target files**

- `backend/engine/<new module>` (NEW)
- `backend/engine/` new test module (NEW)

**Acceptance criteria**

- Given a seeded ladder, the module places a position on the correct rung and reproduces the same
  answer for the same input every time.
- A below-floor alternative is returned as a refusal carrying the ladder's own reason, never as a
  ranked option.
- A ladder with a missing or duplicated floor is refused rather than guessed at.
- `git diff --stat` over pre-existing `backend/engine/` files is empty.
- No doorway file and no migration is touched.
- No test asserts on clause wording or category labels.
- `npm run verify` from `backend/` is green.

**Risks**

- Ranking logic drifting into judgement about what a good alternative is. Mitigation: the ranking
  *is* the ladder — the module orders by rung and stops; anything beyond that is content.
- The module later needing data the ladder tables do not carry. That is a finding to report, not a
  reason to widen this package.

**Rollback.** Delete the new module and its tests. Nothing existing is touched, so the revert is
complete.

---

## NC-07 — The system learns to receive a document

*Serves plan WP-2 and WP-4. Created at integration: an unowned capability that three packages were
pointing at as a gate.*

> **BUILT — 2026-07-29, migration `0047`, the same day U15 settled the owner
> decision it was gated on ([open-questions §13](docs/open-questions.md)).**
> Bytes are stored **in the database** (`cw.received_document` — append-only,
> sha256 and byte_count computed by the schema itself), limit **1 GB per
> file**, with a planned move to object storage (S3) at launch. Both settled
> values are `cw.governance_setting` rows; the transport had already arrived
> with RP-05 (the binary inbound path in `server.py`), so this package's
> delivery was the store, the settled ceiling at both doors, and the guards.
> `paper.ingest` now keeps what it receives. Suites:
> `received-documents.test.mjs`, `test_paper.py`; five SQL mutation rows and
> one doorway row. **The NC-08/09/18 and OB-06/13 gates on this package are
> open.**

**Gate.** The connection work's files are clean in `git status` — specifically `server.py`, which
this package owns for the duration. Plus an owner decision on how a document arrives, which
decides the largest document the system will accept.

**Prerequisites**

- Gate C confirmed at start by checking the working tree, not by reading a document status.
- The owner's answer on transport shape (below), because it decides the package's own file set.

**Scope sketch**

- Verified, and the reason the package exists: `server.py`'s `_read_body` accepts JSON only. It
  reads content-length, refuses over `MAX_BODY` with 413, `json.loads()`es the payload and returns
  400 for anything that is not a dict (`server.py:147-168`). There is no multipart path, no
  raw-bytes path, and every handler downstream reads named fields off a dict. The connection work
  built bytes OUT only.
- Two candidate shapes, to be weighed at the gate and not chosen here: (a) a base64 field inside
  the existing JSON body — no transport change, but the body cap becomes the document size limit
  and base64 inflates by a third; (b) a genuine binary or multipart inbound path in `server.py`,
  mirroring the outbound split. Shape (b) is the larger change and the one that actually touches
  the frozen file. These two are the candidates this package could see; the gate should confirm
  there is no third before choosing.
- The size limit is decided with the shape and stated as a product fact, not buried in a constant.
  Whoever owns this package owns the `MAX_BODY` question.
- Where the bytes are stored. `cw.negotiation_round` carries `storage_uri` and `document_sha256`
  (`0011:66-67`) and nothing in the repository is a document store today — that, not the transport,
  may be the real question.
- If storage needs a schema, at most one migration, number claimed from disk at start.
- Mutation rule: a row only where a named test in this package consumes the guarded line.
- Tests in `test_server.py` (frozen-set file, hence the gate) and/or a new test module.

**Evidence**

- `backend/doorway/server.py:147-168` — `_read_body`: content-length, 413 over the cap,
  `json.loads`, 400 on a non-dict body. JSON only. Verified by all three reviewers.
- `backend/doorway/app.py` — the Download type: status, bytes, content type, filename, with
  `server.py` branching on the type. Bytes out only.
- `backend/db/migrations/0011_negotiation_record.sql:62-77` — `document_sha256`, `storage_uri`,
  `direction`.
- Working tree: `server.py` modified and uncommitted by the connection work.

**What must be true before this is specified in full**

- The connection work's files are committed, so `server.py` has one writer.
- The owner has chosen a transport shape and, with it, the maximum document size.
- Someone has said where document bytes live, because a storage location that does not exist cannot
  be recorded.

---

## NC-08 — Negotiation reads — history, current positions, the revival flag

*Serves plan WP-2: Legal and the Auditor can see the full history; the position-revival view is
live from the first round.*

> **BUILT — 2026-07-29.** Four READS entries, no migration, no new file:
> `GET /negotiations/rounds` (cw.negotiation_round, 0011's own read policy),
> `GET /negotiations/positions` (cw.position_current), `GET /negotiations/revivals`
> (cw.position_revival), `GET /negotiations/drift` (cw.renewal_drift) — the three
> views self-scoping since `0027`. No parameters and no WHERE added, asserted by a
> named test and one doorway mutation row (36 total). Six-role outcome table in
> `test_reads.py`. **The administrator's read gap is reported, not closed:** honest
> refusal on the three views (0027's stated non-decision), and on the rounds table
> an inert 0013 grant that FILTERS to zero rows — the open-questions §9 shape —
> pinned by `test_the_administrator_is_answered_no_rounds_while_a_round_exists`
> so it can only move deliberately. Both boundaries are the owner's to settle.

**Gate.** The connection work's files are clean in `git status`. First in the `reads.py` queue.

**Prerequisites**

- Gate C, verified at start against the working tree rather than against a document status. The
  connection work is archived complete but uncommitted; when its files are settled, **promote this
  package from outline to full detail rather than inheriting the freeze** — it is small, and it
  waits only because it edits the same handful of files.
- NC-01 merged. Reads over unscoped views would hand every requester every other deal's negotiation
  history.

**Scope sketch**

- Read entries over `cw.position_current`, `cw.position_revival` and `cw.renewal_drift` (scoped by
  NC-01), plus a rounds-by-negotiation read over `cw.negotiation_round`.
- Reads are data in `reads.READS` (`reads.py:62-72`, the same generic dispatch shape as writes), so
  the edit is confined to `reads.py` and its test — the gate is the file, not the work.
- Name the specific READS entries once the gate clears; they are deliberately not named now against
  a file being rewritten.
- Mutation rule: a row only where a named test consumes the guarded line.
- Tests in `backend/doorway/test_reads.py`.

**Evidence**

- `backend/doorway/reads.py:62-72` — the Read dataclass and the READS dict.
- `backend/db/migrations/0011_negotiation_record.sql:393-394` — view grants: requester, both Legal,
  auditor; no administrator, no viewer.
- `backend/db/migrations/0013_administrator.sql:303-304` — administrator holds the base tables only.
- `backend/doorway/app.py` — "the rows come from a policy, never from a WHERE clause added here".
- Working tree: `reads.py` and `test_reads.py` modified and uncommitted.

**What must be true before this is specified in full**

- Gate C confirmed against `git status`.
- NC-01 merged.
- Acknowledgement that the administrator's read gap on these views stays open and is reported, never
  closed with a grant added by a read package.

---

## NC-09 — Recording a received redline

*Serves plan WP-2 (uploading a received redline). The thin recording act, once NC-07 owns the
transport.*

> **BUILT — 2026-07-29.** NC-07's transport answered the open question: a module
> (`redlines.py`, `POST /negotiations/redline`), not a `writes.WRITES` entry — a
> Write carries a record, never bytes. Bytes into `cw.received_document` (0047),
> a `'received'` round appended in the same unit of work, pointing at the stored
> row. The caller supplies bytes and `?agreement=`, nothing else: the SHA-256 is
> the schema's GENERATED column, direction/run-id are structural, the round
> number is derived, the actor is the connection's; `sent_on` records today,
> deliberately, until backdating is asked for. **One live wire defect found and
> fixed in-package:** `server.py`'s document branch dropped the query string, so
> every upload arrived addressed to nobody — only app-level tests passed, because
> they hand the query to `App.handle` directly. Now parsed before the body is
> read, proved over real HTTP, and both this and the 'received' claim carry
> doorway mutation rows (38 total). Suites: `test_redlines.py` (11),
> `test_server.py` grew the wire test.

**Prerequisites**

- NC-07 (the inbound path and the size limit).
- NC-02 merged: a received redline is recorded as a round with direction 'received', so the round
  endpoint exists before the upload does.
- Second in the `writes.py` queue, after NC-02.

**Scope sketch**

- The recording act itself, which is already specified by the schema: direction 'received', run id
  null. The `only_our_rounds_have_a_run` check (`0011:75`) refuses a run id on a received round, and
  `0011:69-71` says why — a received redline did not come out of an assembly run, and pretending
  otherwise breaks the provenance chain.
- The document's SHA-256 is computed by the system, never supplied by the caller; the actor comes
  from the connection.
- Whether this is a `writes.WRITES` entry or a module is decided by NC-07's transport shape, so the
  target file set is not claimed until then.

**Evidence**

- `backend/db/migrations/0011_negotiation_record.sql:62-77` — round columns; `:75` the run-id
  constraint; `:69-71` its stated reason.
- `backend/doorway/writes.py` — the actor and derived-value rules this act inherits.

**What must be true before this is specified in full**

- NC-07 has chosen the transport shape, so this package knows which file it edits.
- The document store question is answered, because `storage_uri` must point somewhere real.

---

## NC-10 — The AI pipeline's documented way in

*Serves plan WP-1 (Input Module — AI Pipeline Connection).*

**Gate.** The connection work's files are clean in `git status`, and POST /runs' request contract is
frozen — this package documents that contract to an external caller and must not document a moving
target.

**Prerequisites**

- Gate C, confirmed at start against the working tree.
- No decision gate: attribution is structural, and the record already distinguishes model from
  deterministic fallback from person.

**Scope sketch**

- A pipeline-facing integration guide under `docs/guides/`: the exact request body both endpoints
  accept today, the refusal shapes and what each means to a caller, and the authentication a caller
  presents. This package adds no endpoint and no SQL — WP-1 is a connection and a document, not a
  capability.
- Document the manifest body as the code defines it: vendor required and non-empty, risks a
  non-empty list, each risk naming a non-empty category, severity and source defaulting
  (`manifests.py:66-102`); POST /runs additionally requires a non-empty agreement id and restricts
  source to exactly llm, fallback or manual (`runs.py:84, 111-147`).
- Document the deliberate asymmetry: the manifest check does not narrow source, because it is a
  pre-flight over anything a model might emit; the run endpoint does, because `cw.run` carries the
  check constraint (`0005_run_store.sql:88`).
- Document the three refusal kinds a pipeline must handle distinctly, and that the manifest check
  records both acceptance and refusal to the audit chain — so a role without insert on the audit
  chain cannot use the endpoint at all (`manifests.py:203-255`).
- End-to-end tests: one run submitted with source 'llm' and the identical manifest with source
  'fallback', asserting both are recorded, both readable back, and the two records differ only in
  the source field.
- The guide's example body is the test fixture, so the document cannot drift from the endpoint
  silently.
- State, without solving, the identity residue: sign-in proves nothing today by design, and how a
  pipeline holds a person's credential once an identity provider is connected is settled during
  identity-provider work, not here.
- Mutation rule, stated negatively and deliberately: **no** mutation row belongs here, because
  nothing new is guarded and both MISS and SKIP are fatal in the harness.

**Acceptance criteria (mechanical only — the reviewers struck the unmeasurable one)**

- A fixture test executes the guide's example body against both endpoints and passes.
- One test per documented refusal shape: 400 rejected, 409 unknown category, 409 refused on merits.
- The llm/fallback pair test passes.
- No new route exists; `git diff --stat` over `backend/engine/` is empty; `backend/db/migrations/`
  gained no file.
- No test asserts any user-facing sentence.
- `npm run verify` from `backend/` is green, including all three mutation harnesses.

**Evidence**

- `backend/doorway/manifests.py:66-102, 126-200, 203-255`; `backend/doorway/runs.py:84, 111-147`;
  `backend/db/migrations/0005_run_store.sql:88`; `backend/doorway/test_runs.py:287-296`;
  `docs/decisions/ADR-0005-deterministic-fallbacks.md`.

**What must be true before this is specified in full**

- The connection work's files are committed, `test_runs.py` among them.
- POST /runs' accepted body is settled, because the guide's example becomes a fixture.

---

## NC-11 — The draft record gains its four fields — one migration, one owner

*Serves plan WP-6 (Edit Quality Metrics) and WP-7 (EU documentation fields). Ownership assigned at
integration: two clusters planned to alter this record independently.*

**Gate.** D-4 — the owner has not yet agreed what the draft record should carry. This package
writes the first database change that touches that record, and the record can never be corrected
once written.

**Prerequisites**

- NC-04 delivered and the D-4 session has ruled.
- **This package is the sole owner of the `cw.clause_draft` alteration.** NC-12 contributes the
  three EU columns to this migration and declares this package as a prerequisite; it does not write
  its own migration against that table.
- No prerequisite on the connection work: this package touches no file in the frozen set.
- Number claimed from disk at start; never a number from any planning document, including this one.

**Scope sketch**

- One migration adding the D-4-agreed columns: the edit-quality similarity figure, and the three EU
  documentation fields (intended purpose, known limitations at time of use, model performance
  metrics), on whichever table the session chose for each.
- Nullability decided explicitly per column and written into the migration comment. Existing rows
  predate the columns, so NOT NULL without a default is impossible and a default would record a
  guess as a fact — the reasoning `cw.run.engine_version` already sets down
  (`0005_run_store.sql:96-108`). No back-fill statement exists in the migration.
- Extend `cw.review_ticket_transition()` by `create or replace` so that on the verified transition
  it assigns the similarity figure alongside `edited_before_approval`, from the two stored strings
  the existing flag already uses (`0008:292-301`). Any value the caller supplied is overwritten.
- Extend `cw.review_ticket_opens_pending()` so a ticket cannot be opened carrying a similarity
  figure, matching the existing decision-fields guard (`0008:230-240`).
- Extend the pending and verified CHECK constraints so the new column is null while pending and
  non-null when verified (`0008:133-141`), keeping the constraint set consistent rather than adding
  a column outside it.
- The similarity computation is deterministic and belongs in the database function, or — if it
  outgrows what SQL should carry — a NEW module under `backend/engine/` with a thin adapter. No
  existing engine module is modified.
- Tests against the migrated schema: an unedited approval stores the identity value with the
  existing flag false; an edited approval stores a value strictly below identity; a caller supplying
  a value on the update has it overwritten; a caller supplying one at insert is refused; the figure
  cannot be changed later, because a decided ticket cannot be redecided (`0008:279-284`); rows
  verified before the migration read null.
- Mutation rule: one row only if a named test above consumes the guarded line.

**Evidence**

- `0008_review_queue.sql:57-75` (draft columns), `:82-143` (ticket columns and CHECKs), `:230-240`
  (open-time guard), `:279-284` (no redeciding), `:292-301` (the derived-flag precedent), `:377-378`
  (the draft record cannot be deleted at all).
- `0009_clause_origin.sql:127-130` — clause-version provenance is guarded against rewrite, which is
  why the metric does not live there.
- `0005_run_store.sql:96-108` — the "NOT NULL and no default, deliberately" precedent.

**What must be true before this is specified in full**

- D-4 has ruled: for each of the four fields, which table, whether nullable, and who may write it.
- NC-12 has confirmed its three columns against that ruling, so this migration carries them.

---

## NC-12 — EU documentation on the record — audit payload and schema proof

*Serves plan WP-7.*

**Gate.** D-4 (through NC-11), and D-2 — the EU risk classification, or an explicit written
instruction to build to the high-risk standard.

**Prerequisites**

- NC-11 merged, carrying the three EU columns. This package writes no migration against
  `cw.clause_draft`.
- D-2 answered or explicitly deferred with a written instruction.

**Scope sketch**

- Extend the existing clause-drafted audit write so the new attributes travel into the hash-chained
  audit event alongside prompt, model and model version (`0008:648`).
- A schema test against the migrated schema asserting each new column's presence and constraint
  shape, and that the draft record's no-delete trigger still refuses a delete.
- A test asserting the audit event's payload **keys**, never its wording.

**Evidence**

- `0008_review_queue.sql:57-73` (what already exists — the plan's "most of it is already there" is
  correct, three fields is the true delta), `:377-378` (no delete), `:648` (the audit write).

**What must be true before this is specified in full**

- NC-11's migration has landed with the agreed column shapes.
- D-2 is answered, or the instruction to build to the high-risk standard is written down.

*Rollback note, carried forward deliberately:* audit events already written keep their extra payload
keys. The chain is append-only and is not rewritten, and the rollback says so rather than implying
a clean reversal.

---

## NC-13 — Customer thresholds for the edit-quality metric, and its read surface

*Serves plan WP-6 (Customer Thresholds).*

**Gate.** NC-11 (the figure must exist before anything reports on it), plus the connection work's
files being clean in `git status` for the `reads.py` edit only. Second in the `reads.py` queue,
after NC-08.

**Prerequisites**

- NC-11 merged.
- Gate C confirmed at start against the working tree, for the `reads.py` edit only. Plain language:
  another approved effort has that file open; two efforts in one file is how the safety checks
  quietly stop working.
- One migration maximum, sequenced strictly after NC-11's. The two never share a file.

**Scope sketch**

- Threshold row or rows inserted into `cw.governance_setting` following the settled pattern exactly:
  key, an EMPTY value meaning "measured, no threshold", owner-decision true, and a rationale saying
  the system must never choose this number (`0012_sow_override.sql:295-305`; table shape
  `0010_governance.sql:35-44`).
- Read the threshold through the existing `cw.setting(key)` accessor (`0010:64-67`) rather than a
  new one. Writing uses the existing route: `cw.governance_setting` already has an update policy for
  `legal_admin` and update granted to that role only (`0010:69-76`). No new policy, grant or role.
- New read views alongside `cw.review_quality`: the retained-language figure across the library, by
  clause category, and per contract — the plan's three cuts. Grants mirror `cw.review_quality`'s
  (`0008:737-741`); nothing for `cw_viewer`.
- Register the new reads in `reads.py` beside the existing `cw.review_quality` entry
  (`reads.py:213-214`) — after Gate C.
- Tests against the migrated schema: with no threshold set the metric returns and no alarm state
  exists; with a threshold set by `legal_admin` the comparison is reported; a non-admin cannot set
  it; the per-contract cut returns to a requester only what their existing fencing allows.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- Shipping any default threshold value, anywhere. The empty value is the design, not a gap — and
  recommended numbers were deleted from an earlier plan for exactly this reason.
- Changing `cw.review_quality` itself or the rate it computes (`0008:606-620`).
- Alerting, or any behaviour that fires when a threshold is crossed. The plan asks for a figure that
  can be shown to a regulator, not an alarm.

**Acceptance criteria (the ones that matter most)**

- The new setting row ships with an empty value and owner-decision true, and **a test asserts the
  shipped value is empty** — a system property, not wording. This converts the content boundary from
  discipline into a check, because discipline alone already failed here once.
- No number appears as a threshold anywhere in the migration or the doorway.
- Only `cw_legal_admin` can change the threshold; a test proves a reviewer cannot.
- `reads.py` is modified only after Gate C, and the package records the date the gate cleared.

**Evidence**

- `0010_governance.sql:35-44, 64-67, 69-76`; `0012_sow_override.sql:295-305`;
  `0008_review_queue.sql:606-620, 737-741`; `backend/doorway/reads.py:213-214`.

**What must be true before this is specified in full**

- NC-11 has landed the figure.
- Gate C is confirmed for the `reads.py` edit.

---

## NC-14 — Customer-configurable AI disclosure

*Serves plan WP-7.*

**Gate.** D-2 — what disclosure the classification requires — or an explicit instruction to build to
the high-risk standard. Independent of D-4 and D-6.

**Prerequisites**

- D-2 answered, or the written instruction.
- **A prerequisite decision, promoted from a risk at review:** `cw.governance_setting` update is
  granted to `legal_admin` only (`0010:69-76`). If disclosure is thought of as an Administrator
  control, that is a new owner decision, not an implementation choice, and it must be answered
  before the row is written.
- Number claimed from disk at start.

**Scope sketch**

- Insert the disclosure setting key or keys into `cw.governance_setting` with kind, owner-decision,
  decided and rationale populated in the house pattern (`0022_owner_decisions_u9_u11.sql:219-240`).
  The row ships **undecided**; a decided-true default would repeat a boundary breach an earlier plan
  already made once.
- Read the setting through `cw.setting()` — no second settings mechanism.
- Tests against the migrated schema: the setting exists undecided by default; `legal_admin` can
  update it and no other role can.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- **The review-surface wiring.** `prototype/v4/app/reviewer.jsx` is modified and uncommitted in the
  working tree today, and no test harness for that surface is named anywhere in this set — an
  untestable criterion attached to an otherwise testable package. The surface half is dropped from
  this package and filed as a separate item once the prototype files are settled and a harness
  exists.
- Choosing the disclosure text. That is content and it is the customer's.
- Presetting any default that reads as a rule.
- Any new settings table or per-customer settings mechanism.

**Evidence**

- `0010_governance.sql:35-44` (setting shape and the decided-names-a-person constraint), `:46-51`
  (a provisionally-answered question is not a settled rule), `:64-77` (accessor; update for
  `legal_admin` only); `0022:219-240` (the settled-decision insert pattern);
  `0012_sow_override.sql:298` (the precedent forbidding a preset value).

**What must be true before this is specified in full**

- D-2 answered or the high-risk instruction given.
- The writer question (Legal admin or Administrator) answered.

---

## NC-15 — Compliance export — a read over the AI-use record

*Serves plan WP-7.*

**Gate.** D-6, **re-put on the corrected picture** (see below), primarily; D-2 for the export's
required contents; plus the connection work's files being clean for the `reads.py` edit. Third in
the `reads.py` queue.

**Prerequisites**

- **D-6 re-put and answered.** Verified at source by the integrator: redaction updates
  `cw.signature_certificate`, `cw.executed_document` and `cw.agreement_retention` only
  (`0023_redaction_and_purge.sql:296-306`); purge deletes `cw.signature_certificate`,
  `cw.executed_signatory`, `cw.executed_document` and `cw.executed_agreement` only (`0023:368-374`);
  and `0023:38-45` states outright that a purge leaves the agreement, its runs, decisions, positions
  and override requests behind. Neither reaches `cw.clause_draft` or `cw.review_ticket`, and the
  draft record additionally cannot be deleted at all (`0008:377-378`). So the question is not which
  promise wins — it is that the AI-use record has no disposal path whatsoever today. Put to the
  owner as originally framed, D-6 would be answered against a false picture.
- NC-12 complete: the export reports the fields, so the fields exist first.
- Gate C confirmed at start.

**Scope sketch**

- A new read — doorway read plus a scoping view over the draft record, the review ticket, the review
  segments and the audit chain — returning one row per AI use instance: the draft, its prompt, model,
  version and inputs, the reviewer, what changed at approval, and the audit events proving oversight.
- Scoping written explicitly in the view's own WHERE clause. A view does not inherit the policy on
  the table beneath it — the defect the two most recent migrations exist to correct, and the pattern
  this export copies.
- A stated, tested position on disposal: whether an export includes, excludes or marks records whose
  related content was redacted or purged — whichever D-6 rules.
- Tests against the migrated schema: one per role showing what that role's export contains and
  excludes; one asserting the disposal position holds, by first redacting or purging a related
  agreement and then running the export.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- Any write path; the export reads only.
- Any change to the audit chain or its grants.
- Deciding D-6 — the package names the decision and implements the answer.
- Document rendering or file transport of the export.
- The wording of any disclosure or export field label.
- Closing the right-to-erasure residue. A request naming a person is a larger question that the
  redaction migration itself declines to solve, and the hash-chained audit survives every purge
  (`0023:26-37`). This package surfaces it and never claims to close it.

**Evidence**

- `0023_redaction_and_purge.sql:296-306, 368-374, 38-45, 26-37` — all four ranges re-read at source
  by the integrator, because the reviewers flagged that this whole re-framing rested on them and
  that an owner question was about to be put on their strength.
- `0008_review_queue.sql:377-378`; `backend/doorway/reads.py:101-103, 208-209` (existing review
  reads and the house rule-comment style).

**What must be true before this is specified in full**

- D-6 re-put and answered on the corrected picture.
- NC-12 landed.
- Gate C confirmed.

---

## NC-16 — Portfolio questions on our own paper — a certain count, no AI

*Serves plan WP-8 (the precise half).*

**Gate.** D-7 (who may ask portfolio-wide questions), plus the connection work's files being clean
for the `reads.py` edit. Needs no vectors, no supplier-paper work, and no other decision. Fourth in
the `reads.py` queue.

**Prerequisites**

- Gate C confirmed at start.
- D-7 answered for the scoping rule, or the package ships fenced to the narrowest defensible scope
  (the existing run-view scoping), which D-7 can only ever widen.
- **A definition, promoted from a risk at review: which run represents an agreement.** `cw.run.agreement_id`
  is nullable, so runs exist with no agreement, and an agreement carries many runs, so a naive count
  counts runs and double-counts renegotiated deals. "How many contracts" is not a defined quantity
  until someone states the rule (latest run, or the executed one) and how runs with no agreement are
  reported. A count with an undefined denominator is not a testable criterion.

**Scope sketch**

- A portfolio read aggregating over `cw.run_decision` joined to `cw.run`, `cw.clause_version` and
  `cw.category`: counts plus a drill-down list per category, severity, clause and version.
- Ladder-rung questions answered through `cw.snapshot_ladder_rung`, which pins the rung a clause
  occupied at run time — which is why the answer reproduces rather than being recomputed against
  today's library.
- Explicit unresolved handling: `cw.run_decision.clause_id` is nullable and a null means nothing
  could be selected — "a hard flag, never a substitution". The portfolio answer reports unresolved
  as its own count, never folded into zero.
- Scoping written into the query's own WHERE clause, copying the phrasing the two most recent
  migrations settled for the run views.
- The result is labelled as the certain half, so an AI-assessed half can be added beside it without
  either being read as the whole.
- The agreement-representation rule from prerequisites is implemented in scope and asserted by a
  criterion.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- Supplier paper, decomposed units, embeddings, any AI assessment (NC-24).
- Any index beyond one justified by a query this package actually ships.
- Modifying `cw.run`, `cw.run_decision` or `cw.run_finding` — immutable historical records with
  delete and truncate refused.

**Acceptance criteria (the load-bearing ones)**

- For a seeded set of runs, the read returns the correct count for a given clause and the correct
  per-category breakdown, against the migrated schema.
- A requester asking the same question receives counts computed only over runs they created or
  agreements they own, and **the test asserts the NUMBER, not the row list** — a count computed above
  an unscoped base table would leak a correct-looking total drawn from everyone's deals while showing
  no rows. This is the specific failure D-7 is worried about.
- An unresolved decision appears as an unresolved count and never as an absent one.
- Ladder-rung questions reproduce for a historic run whose clause has since been superseded.
- The agreement-representation rule is asserted by a test.
- `git diff --stat` over `backend/engine/` is empty.

**Evidence**

- `0005_run_store.sql:79-114` (run columns; nullable agreement id), `:129-153` (run decisions — the
  table that answers the question), `:143-146` ("a hard flag, never a substitution"), `:43-62`
  (the pinned rung), `:121-127` (an index on run creator already exists because the portfolio
  question is the common one), `:176-186` (runs are immutable).

**What must be true before this is specified in full**

- Gate C confirmed; D-7 answered or the narrow fence accepted; the agreement-representation rule
  stated.

---

## NC-17 — Round analysis — the record and the AI-assisted path

*Serves plan WP-3 (Negotiation Round Analysis). Split at integration; the deterministic half is
NC-06.*

**Gate.** How the redline matcher's fallback is read. `ADR-0005` says the fallback IS escalation (a
review ticket with reason 'no-ai-match'); `docs/open-questions.md` §4 says the keyword scorer is
retained as the deterministic fallback when the matcher moves to vector search. They reconcile as
two layers — score with keywords, escalate when nothing clears the bar — and this package assumes
that reading. If the owner reads it otherwise, the matching step changes shape.

**Prerequisites**

- NC-01 merged (analysis rows are written against negotiation records whose row rules it
  establishes).
- NC-06 delivered (the deterministic placement and ranking module this package calls).
- NC-07 delivered (there is no analysis without an arrived redline).
- Number claimed from disk at start.

**Scope sketch**

- Parsing the changes: **do not build.** `backend/engine/docx.py` already parses a tracked-changes
  document into one redline per changed paragraph, with keep/insert/delete segments in document
  order, author, date, surrounding context and accepted/original text (`docx.py:426-535`). This
  package calls it; it never modifies it.
- Identify which open negotiating position a change touches — AI-assisted, with the fallback above:
  the keyword scorer scores, and where nothing clears the threshold the system does not guess, it
  opens a review ticket with reason 'no-ai-match', a value the schema already permits.
- Categorise, assess risk, and produce alternatives — AI-assisted for the first two; the ranking is
  deterministic and comes from NC-06's module.
- The advisory recommendation, stored and presented as advice, never as a decision, and unable by
  schema to move a position's state on its own. Moving a position remains NC-02's endpoint under a
  named actor.
- Comparable-deal history read from `cw.concession` and `cw.concession_rate` — read, never written.
- One migration for the analysis record: one row per analysed paragraph, keyed to the negotiation
  and round and to the matched position when there is one, carrying the step outputs separately, the
  matcher's score and **which matcher produced it**, the model and version for the AI-assisted steps,
  and a null-match path pointing at the review ticket.
- Thin doorway adapters only: a module beside `runs.py` calling the engine's queries and types, in
  the existing adaptation pattern — engine types out, engine's own sentences back, the library read
  through the caller's own connection.
- Tests: doorway tests against the migrated schema covering the matched path, the no-match path
  landing a ticket, and the below-floor refusal. Mutation rows only where a named test consumes the
  guarded line.

**A ruling made inside this work, carried forward as a proposal rather than a fact.** The
round-analysis record needs a schema but does NOT need a D-4-style pre-brief, and the argument is
the difference between the two records: D-4 exists because the draft record can never be changed
once written and is shared by three plan packages, so a wrong field is unfixable and shared. Round
analysis is advisory output, feeds no other package's schema, and is fully re-derivable from inputs
the system already keeps immutably — so a wrong field is corrected by a later migration and a re-run,
not by rewriting history. If the owner disagrees, this package becomes decision-gated.

**Out of scope**

- Any modification to existing `backend/engine/` modules; `git diff --stat` over them stays empty.
- Supplier-paper decomposition (NC-18) — this package assumes a redline against our own paper.
- Rebuilding the matcher on vector search. §4 settled that the keyword scorer is retained as the
  fallback; this package builds against the existing scale.
- Receiving the document (NC-07).
- Choosing thresholds, risk bands or recommendation wording — content, placeholder, and no test may
  assert it.

**Evidence**

- `backend/engine/docx.py:426-535`; `0003_ladders_and_concessions.sql:28-60, 189-215, 573`;
  `0008_review_queue.sql:86-101` (reason codes including 'no-ai-match'; quarantined proposed text);
  `0011_negotiation_record.sql:62-96, 124-196, 211`; `docs/decisions/ADR-0005-deterministic-fallbacks.md`;
  `docs/open-questions.md` §4; `backend/doorway/manifests.py:33-44` (the adaptation rule).

**What must be true before this is specified in full**

- The matcher-fallback reading is confirmed by the owner.
- NC-06 and NC-07 are delivered.
- A note carried from review, so neither side assumes the other checked: confirm that NC-01's
  write-scoping covers round inserts in the shape these analysis rows need.

---

## NC-18 — Supplier paper: decompose into quarantined units

*Serves plan WP-4 (Supplier Paper), the decomposition half. Split at integration.*

**Gate.** NC-07 (receive a document).

**Prerequisites**

- NC-07 delivered.
- **Resolve "at most one migration" to yes or no before start.** A package that may or may not add a
  migration cannot be sequenced against other migration-bearing packages. If yes, the number is
  claimed from disk at start.

**Scope sketch**

- Decomposition: an AI step splitting the counterparty's document into clause-like units and
  assigning each a category, with a deterministic fallback consistent with the fallbacks decision
  (the keyword classifier and its always-on baseline categories) so the step works with no model at
  all.
- Unknown categories are dropped at the boundary, using the same engine call the manifest check
  already uses, so the two boundaries cannot diverge.
- A source-location reference on every unit, anchored to the round's stored document hash so the
  reference points at specific bytes.
- **Quarantine, built on what exists rather than invented:** units land as review-queue material
  with reason code 'supplier-paper' and provenance badge 'VENDOR LANGUAGE' — both already permitted
  values — and their text lives in the review ticket's proposed-text column, which the schema
  describes as quarantined and referenced by no selectable view. A negotiation position points at
  their wording by reference rather than copying it.
- A test that IS the quarantine claim: a supplier unit must be unreachable from
  `cw.selectable_clause` and must not appear in an assembly run's decisions. Assert the boundary,
  never the wording.
- A note for the library work: supplier language seen repeatedly across counterparties is INPUT to
  it, surfaced through the existing library-proposal surface. This package produces the observation,
  never a clause.

**Out of scope**

- The analysis tail (NC-19).
- Promoting any supplier unit into the clause library. If supplier language ever becomes approved
  wording it does so through Legal's review as a new clause version with a vendor-derived or
  external origin — the library path, not this one.
- Any modification to existing engine modules.
- Judging whether the counterparty's language is good, or writing a response to it.
- Deciding what the categories should be.

**Evidence**

- `0008_review_queue.sql:86-101` (reason code, badge, the quarantine comment: "Referenced by no
  selectable view; it cannot reach a contract from here"); `0009_clause_origin.sql:14-17, 30-50,
  96-97, 100-135` (origins, the never-selectable promise enforced by the view rather than left to a
  side table's good manners, and origin immutability); `0011_negotiation_record.sql:13-19, 124-140,
  66-70`; `backend/doorway/manifests.py:105-113, 146-180`.

**Assumed, flagged rather than hidden:** that the review queue is the right home for quarantined
units rather than a new table. It already carries the reason code, the badge, the quarantine comment
and the human decision path, and a parallel store would create a second quarantine that a future
view could forget about. Treat this as a design proposal, not a verified fact.

**What must be true before this is specified in full**

- NC-07 delivered, so a document can arrive.
- The migration question resolved to yes or no.

---

## NC-19 — Supplier units through round analysis

*Serves plan WP-4 (Supplier Paper), the analysis tail. Split at integration.*

**Gate.** NC-17 and NC-18 both delivered.

**Prerequisites**

- NC-18 (the units) and NC-17 (the path they run through).

**Scope sketch**

- Supplier units enter the same analysis path a redline on our own paper goes through — one
  pipeline, not two — with the negotiation's paper recorded as theirs and the position's origin
  recorded as their paper. Both are already permitted values, so the schema needs nothing new to
  express supplier paper at the position level.
- No new storage: this package connects two existing halves.
- Tests asserting the single-pipeline claim: a supplier unit and a redline paragraph produce
  analysis rows of the same shape, through the same code.

**Evidence**

- `0011_negotiation_record.sql:13-19` (paper is ours or theirs), `:124-140` (position origin
  includes their paper; their wording is referenced, not copied).

**What must be true before this is specified in full**

- NC-17's analysis record shape is settled, since these rows use it.
- NC-18's unit shape is settled, since these rows key to it.

---

## NC-20 — Clause Library Builder

*Serves plan WP-5 (Clause Library Builder), less the self-approval refusal, which is NC-05.*

**Gate.** D-4 (what the draft record carries) and D-5 (are the six governance controls in this
effort). Plain language: an approved draft is only useful if it can be put into service, and putting
a clause into service is one of the six acts the system still has no way to perform.

**Prerequisites**

- D-4 and D-5 both settled.
- NC-11 merged if the draft record gains fields this package writes.
- NC-05 merged: the self-approval refusal is a precondition of a builder that opens tickets on a
  requester's behalf, and it is deliberately not bundled here because it needs neither decision.
- Third in the `writes.py` queue, after NC-02 and NC-09.

**Scope sketch**

- Start from `cw.library_proposal` (`0003:586-598`): it already derives candidate proposals from the
  concession record — repeated vendor language accepted, a floor breached repeatedly, deals settling
  below the opening rung. That is the Builder's input, not a new analysis.
- Write candidates as draft rows. The route is already complete and audited: a draft records model,
  version, prompt and inputs, and its insert is audited as a controller act that may never be
  recorded as a human one (`0008:645-657`).
- Open a review ticket carrying the draft. The existing guard already forces ticket text to equal
  draft text (`0008:244-252`), so the baseline cannot be pre-edited — the Builder inherits this, it
  does not rebuild it.
- Approval mints through `cw.verify_review_ticket()` and nothing else; the doorway precedent exists
  at `writes.py:203-227` and a test already pins that the endpoint calls the function rather than
  raw SQL (`test_writes.py:482-487`).
- The AI-drafted marker is already derived, not accepted: a draft-backed ticket mints that origin
  whatever the caller passes (`0009:217-221`). No work needed; do not re-implement.
- Bounded outline only: prompt design, model choice, candidate ranking and any screen are
  deliberately unspecified until D-4 and D-5 land.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- The self-approval refusal (NC-05).
- Activation, supersession and concession promotion (NC-21, NC-22) — and the reason D-5 gates this
  package.
- Any clause wording, drafting rule or example.
- Changing the minting function or the clause-version-from-ticket guard.

**Stated on the package's face rather than discovered later:** if D-5 lands as "follow-on", the
Builder can approve clauses it cannot put into service. That is a dead end, and the package says so
rather than shipping into it.

**Evidence**

- `0003_ladders_and_concessions.sql:586-598, 473`; `0008_review_queue.sql:244-252, 398-412` (exactly
  two recorded entrances into the library, both calling one minting function), `:645-657`;
  `0009_clause_origin.sql:217-221`; `backend/doorway/writes.py:203-227`;
  `backend/doorway/test_writes.py:482-487`.

**What must be true before this is specified in full**

- D-4 and D-5 both settled; NC-05 and (if fields are written) NC-11 merged.

---

## NC-21 — The two decided governance endpoints: retention destruction and clause supersession

*Serves plan WP-5 support and the six missing governance controls.*

**Gate.** D-5 settled in the affirmative — the owner has agreed the six governance controls belong
to this effort rather than a named follow-on. Plus the connection work's files being clean, because
new endpoints register in files that set owns. Fourth in the `writes.py` queue.

**Prerequisites**

- D-5 affirmative.
- Gate C confirmed at start.
- **First task of the package, before proposing any migration:** confirm at source whether the
  owner-decisions migration already laid every grant and policy these endpoints need.

**Scope sketch**

- Retention destruction. Decided: never automatic, the authority is the Administrator's alone and
  revoked from `legal_admin`; the schema half is built (`0022:38-49, 220-235`). The endpoint is
  absent. Build the endpoint only, against the existing authority — do not redecide who may destroy.
- Clause supersession. Decided: mints a NEW version and never rewrites wording already committed to;
  signed and in-flight deals are FLAGGED as carrying obsolete language rather than corrected, and
  the flagging half is built (`0022:147-207, 240-247`). The superseding endpoint is absent; build
  it, calling the existing mint path.
- Each endpoint follows the doorway's existing shape: a named write calling a database function and
  no raw SQL, matching the pinned precedent.
- The confirmation idiom the open questions ask for — the strongest confirmation in the product,
  refused while a matter is on hold — is a UI question named here, not designed here.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- Redeciding either act. Both are settled owner decisions recorded as data, inherited and never
  reopened.
- The remaining governance acts (NC-22, NC-23).
- Any UI work. Any content.

**Acceptance criteria**

- **The refusal tests land before the happy path** — promoted from a risk mitigation to a criterion
  at review, because destruction is irreversible and a wrong endpoint is worse than no endpoint.
- Retention destruction is performable only by the Administrator; a test proves `legal_admin` is
  refused, guarding the revocation the owner-decisions migration made.
- Supersession mints a new version; a test proves the prior version's bytes are unchanged and still
  readable.
- A test proves an in-flight or signed deal carrying superseded wording is flagged rather than
  rewritten.
- Both acts appear on the audit chain.
- No test asserts on confirmation wording or any message text.

**Evidence**

- `docs/open-questions.md:260-279` (six governed acts have no endpoint; not a porting oversight),
  `:281-287`, `:294-303`; `0022_owner_decisions_u9_u11.sql:38-49, 147-207, 220-247`;
  `backend/doorway/writes.py:203-227` with `test_writes.py:482-487`.

**What must be true before this is specified in full**

- D-5 affirmative; Gate C confirmed; the grant/policy confirmation done at source.

---

## NC-22 — Concession promotion gets its endpoint

*Serves plan WP-5 and the six governance controls. Split out at integration: the one of the four
undecided acts that is ready, separated so the work that depends on it is not held by three that are
not.*

**Gate.** D-5 settled in the affirmative, plus the connection work's files being clean. Fifth in the
`writes.py` queue.

**Prerequisites**

- D-5 affirmative. This act can be put to the owner on its own if the other three stall — it is the
  act the library work actually depends on.
- Gate C confirmed at start.
- NC-21 merged (same files, same shape; the two decided acts establish the pattern).

**Scope sketch**

- The act already exists in the database: `cw.promote_concession()` is a function (`0003:473`),
  revoked from public and granted narrowly (`0003:696-698`), and is recorded as one of the library's
  two recorded entrances (`0008:398-412`). Only the endpoint is missing.
- A named write calling the function and no raw SQL, matching the pinned precedent.
- Tests: the act is refused for every role but its granted authority; it leaves an audit row.
- Mutation rule: a row only where a named test consumes the guarded line.

**Out of scope**

- Deciding whether promotion should exist, or widening who may perform it.
- The other three acts (NC-23).

**Evidence**

- `0003_ladders_and_concessions.sql:473, 696-698`; `0008_review_queue.sql:398-412`;
  `docs/open-questions.md:267-274, 305-307`.

**What must be true before this is specified in full**

- D-5 affirmative (or a standalone ruling on this act); Gate C confirmed.

---

## NC-23 — The three remaining governance acts — an owner session, not yet a package

*Serves plan WP-5 (the six missing governance controls that make the Library Builder usable). Deliberately carries no target files.*

**Gate.** D-5 in the affirmative, AND a short owner session ruling on the three acts. An endpoint
built against an unmade decision is rework, and a package whose deliverable is "whatever was ruled
on" cannot be accepted or rejected — so this is filed as a named owner-session item rather than as a
package holding route files open indefinitely.

**Prerequisites**

- D-5 affirmative and the owner session held.
- NC-21 and NC-22 merged, because they establish the shape the remaining acts follow.

**Scope sketch — the three acts, verified at source**

- **Editing a conflict rule.** Its home is the conflict-rules migration; the first task once the
  ruling exists is to verify what write path, if any, exists there before proposing one.
- **Reordering a rung or moving a floor.** An authority already exists in the schema: admin-writes
  policies restrict the ladder tables to `legal_admin` (`0003:608-611`). It needs an endpoint against
  an existing authority, not a new authority — subject to the ruling.
- **Releasing a legal hold.** The hold FLAG question was settled and built; RELEASE is a separate act
  and remains open.

Per-act detail is deliberately deferred. Once the ruling exists, each act becomes its own package
with its own start condition, so that no package holds shared route files while waiting.

**Out of scope**

- Recommending answers to the three open questions. Gaps are written down for the owner, never
  decided by engineering.
- Any target file claim before the ruling.

**Evidence**

- `docs/open-questions.md:267-274` (the six acts, tabulated), `:305-307` (which remain open),
  `:343, :401` (the hold flag settled and built; release is separate);
  `0003_ladders_and_concessions.sql:608-611`.

**What must be true before this is specified in full**

- The owner has ruled on each of the three acts individually.

---

## NC-24 — Portfolio questions over the counterparty's paper — BLOCKED

*Serves plan WP-8 (the meaning-based half). **Carried as a blocked outline and deliberately kept out
of the schedulable set**, so that the portfolio capability does not look blocked when its precise
half (NC-16) is not.*

**Blocker, named.** An owner approval that has never been requested: adopting vector storage, an
embedding model or an external index is a new dependency and a new data-processing relationship,
and that is Mike's to give, not engineering's. This package names no product and picks nothing.
Until the approval exists, it has no owned file set, and a package with no owned file set cannot be
sequenced or assigned.

**Also gated on:** NC-18 (there is nothing to index until units exist), D-6 (traces must leave any
index when content is removed — the same disposal question, and it must be re-put first per NC-15),
and D-7 (who may ask).

**Scope sketch, for the day the approval exists**

- An index over the decomposed units, keyed back to the source document location.
- A retrieval read: question in, candidate units out, each carrying its citation.
- An assessment step whose every output cites the unit it was drawn from — a bare number is never
  returned.
- Index disposal wired to whatever D-6 rules, with a test that removes content and asserts the
  traces are gone.
- Scoping identical in effect to NC-16's, so the two halves of one answer cannot disagree about who
  may ask.

**Evidence — the absence is verified, not assumed**

- A repository-wide search for vector, pgvector, embedding and CREATE EXTENSION across
  `backend/db/migrations/`, `backend/doorway/`, `backend/engine/`, `backend/package.json`,
  `backend/db/test/` and `docs/` returns zero hits.
- `backend/package.json` — the backend's only declared dependency is the vendored database library.
- The single repository-wide match is a `tests/pgvector.test.js` entry inside that library's own
  package manifest under `node_modules`. That is evidence the current database CAN carry a vector
  extension. It is not evidence that this project has adopted one.
- `0023_redaction_and_purge.sql:368-374` — deletion reaches the executed-agreement tables only, so a
  derived index would sit outside every disposal path that exists; `:245-249` — the migration's own
  note that clearing a pointer does not reach into a second system's storage, and says so out loud
  rather than implying otherwise. An external index would need the same honesty.

**What must be true before this is specified in full**

- The dependency approval is given — and it should be decided in the same sitting as the EU risk
  classification, because a second AI processor over contract text changes what the compliance
  export and that classification have to cover.
- NC-18 has delivered units to index.
- D-6 has been re-put and answered, so index disposal has a rule to follow.

---

## NC-25 — Advisory judgments: the record, the model seam, and the semantic-difference score

*Serves plan WP-6 (owner addition U14c). The first feature where Clausewerk itself calls an AI
model — everything before this treats AI as an outside submitter.*

**Objective.** Give AI judgments a permanent, honest home — an advisory-assessment record separate
from the frozen draft and ticket rows — and deliver the first judgment into it: how much the
*meaning* changed between the AI's draft and what Legal approved, shown beside the arithmetic
score, never instead of it (owner ruling, memory.md U14b/U14c).

**Gate — D-8, SETTLED (2026-07-27, memory.md).** In-product AI judgment was settled intent
(U14e); the provider question is now answered: **OpenAI**, chosen by the owner for token
efficiency. The adapter stays provider-thin — one module owns the integration, so a later change
of provider is one file, not a hunt. The API key is supplied by the owner through environment
configuration and never lands in the repository. This package is unblocked.

**Prerequisites**

- D-8 approved (the model dependency, above).
- NC-11 merged — it is the sole owner of the draft-record migration, and this package's migration
  must sequence behind it (migration number claimed on disk at start, as always).
- Gate C already holds (the connection work is committed as of 2026-07-27 evening).

**Scope**

- One migration: `cw.advisory_assessment` — an append-only record holding: what was assessed (the
  ticket and the two frozen texts it points at), the judgment kind (`semantic_difference` first;
  NC-26 adds `risk_exposure`), the score, the model, model version, prompt and inputs (the same
  provenance discipline the draft record already carries, 0008's shape), who asked, and when.
  Append-only with no update or delete grants, like every evidence table in this repository.
  A judgment is re-runnable as models improve: a new row is appended, the old row stands, and
  the read surface shows the latest while keeping the history.
- A thin model-adapter module in the doorway (the seam every later AI feature calls), with
  ADR-0005 discipline: when the model is unavailable, the honest answer is **no judgment,
  recorded as absent** — never a substitute number, never a stale cache presented as fresh
  (a judgment has no deterministic fallback, and pretending otherwise is the failure mode
  ADR-0005 exists to prevent).
- The semantic-difference pipeline: on demand (and optionally on approval), the adapter is given
  the two frozen texts and returns a difference judgment with a short stated basis; both land in
  the assessment row. The caller never supplies the score (the U14 rule, applied to judgments).
- A read surface: the metrics view gains the latest semantic judgment beside the arithmetic
  figure, each labelled as what it is — a measurement and an estimate.
- Tests in the house discipline: the record refuses updates and deletes; a second run appends
  rather than replaces; the caller cannot write a score; the model-unavailable path records an
  honest absence; no test asserts on any judgment's wording or value (content rule — a model's
  opinion is content).

**Out of scope**

- The risk-exposure judgment (NC-26).
- Any threshold, alarm, or "too different" rule — governance settings, deliberately unset (U4).
- Retro-scoring old synthetic records in bulk.
- Any change to the frozen draft/ticket tables — the D-4 four-field ruling stands untouched.

**Target files** — one new migration; `backend/doorway/advisory.py` (NEW — the adapter and the
pipeline); `backend/doorway/test_advisory.py` (NEW); one dispatch line in `app.py` and a read in
`reads.py` (both now single-writer-free, Gate C being satisfied — claim them in the shared-file
queue order); `backend/db/test/advisory.test.mjs` (NEW).

**Acceptance criteria** — the assessment row is append-only and provenance-complete, proven by
test; a caller-supplied score is ignored, proven by test; model-down records an absence, proven
by test; the metrics read shows measurement and judgment side by side with distinct labels;
`npm run verify` green including all three harnesses; `git diff --stat backend/engine/` empty.

**Risks** — per-call cost is invisible until it isn't: the package records a count of model calls
in the audit chain so usage is a fact, not a guess. The judgment's quality is content and is
placeholder until Legal reviews prompts — never a defect (owner rule).

**Rollback** — revert the migration by its footer, delete the two new modules and tests, remove
the dispatch and read lines. The append-only rows already written stay, as evidence rows do.

---

## NC-26 — Risk-exposure judgments in round analysis, both directions

*Serves plan WP-3 (owner additions U14a/U14d). Consumes NC-25's record and adapter.*

**Objective.** Every proposed negotiation move shown in round analysis carries an AI estimate of
the percentage of risk it would transfer from supplier to customer — before the buyer chooses —
and an accepted concession carries what the choice actually cost. Baselined on the original
clause; always an estimate with its basis stated; never a decision (owner rulings U14a, U14d).

**Gate.** D-8 (the model dependency, approved once for NC-25, reused here). Round analysis itself
(NC-17) must exist — this package extends its results surface, so it sequences after NC-17, which
carries its own gates.

**Prerequisites** — NC-25 merged (the record and the adapter are its); NC-17 merged (the analysis
this judgment attaches to); NC-01 already merged (the positions being judged are ownership-scoped).

**Scope sketch (outline — full detail is authored when NC-17's shape is final)**

- Extend the assessment record's use, not its shape: kind `risk_exposure`, pointing at a
  negotiation position/alternative (prospective) or a concession (retrospective), with the
  original clause named as the baseline in the inputs.
- The prospective path: when round analysis ranks alternatives, each alternative is offered to
  the adapter with the original clause, the proposed language, and the concession history; the
  estimate and its stated basis land as assessment rows and travel with the analysis answer,
  labelled advisory.
- The retrospective path: on concession settlement, the same judgment against what was actually
  accepted — the "what it cost" record.
- Model-down: analysis proceeds without estimates, absences recorded — a buyer is never blocked
  by a judgment being unavailable, because advice that gates action has become a decision.
- Tests: same discipline as NC-25; additionally, analysis-without-model still answers, proven by
  test; no test pins any estimate's value or wording.

**Out of scope** — any automatic refusal or gate driven by a risk estimate (advice never
decides); threshold/alarm rules (governance settings, unset); portfolio aggregation of risk
scores (that is WP-8 territory and waits on D-7).

**Evidence** — owner rulings in `memory.md` U14a–U14d; the advisory record and adapter (NC-25);
round analysis (NC-17); ADR-0005 (fallbacks); 0011's position and concession records.

**What must be true before this is specified in full** — D-8 approved; NC-17's result shape
merged; NC-25's record landed.

---

## Open issues carried forward

1. **The connection work is committed** (2026-07-27 evening, branch `assembly-connection-2026-07-27`)
   — Gate C's condition now holds; the nine packages it gated are released, pending the branch
   reaching `main`.
2. **D-6 is framed on a false picture** and must be re-put before it is answered (NC-15).
3. **The matcher-fallback reading** — escalation-only versus keyword-then-escalate — is assumed by
   NC-17 and should be confirmed by the owner.
4. **Score scales are not calibrated.** A keyword score and a vector score do not mean the same
   thing on one threshold. NC-17 stores which matcher produced each score, which makes the record
   honest without settling the question.
5. **The administrator's read boundary** on the negotiation, concession and run summary views is one
   unresolved question raised twice. It should be raised once, for both sets, and it is never closed
   by a package adding a grant.
6. **Where document bytes live.** Nothing in the repository is a document store today; NC-07 may
   find that this, not the transport, is the real question.
7. **Right-to-erasure naming a person** remains a residue that the redaction migration itself
   declines to solve. NC-15 makes it more visible; no package closes it, and none should claim to.
8. **Endpoint path spellings** throughout are illustrative. The server strips a leading `/api/`
   before dispatch, so both spellings are true at different layers, and the plan freezes neither.
9. **The review-surface wiring for AI disclosure** was dropped from NC-14 because the prototype
   files are uncommitted and no test harness for that surface is named anywhere. It needs a home
   once both are settled.
10. **Migration numbering.** Two migrations are untracked on disk as of today, one more than the
    source planning documents record. This document prints no number anywhere; every package claims
    the next free number verified on disk at the moment it starts.
