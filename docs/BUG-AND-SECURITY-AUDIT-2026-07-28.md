# Bug and security audit — started 2026-07-28

This is the durable ledger for the repeated whole-codebase audit. Each entry
records a confirmed system defect, the bounded fix, and the evidence used to
validate it. Placeholder contract content is outside this audit.

## Cycle 94 — clause-version publication provenance was caller-controlled

**Observed defect.** A governed legal-admin insert could supply the immutable
clause-version `reviewer`, `approved_on`, and `created_at` fields. The permanent
library could therefore attribute publication to another person and forge when
approval and recording occurred.

**Fix.** A clause-version publication trigger now derives reviewer, approval
date, and recording time from the governed session and database clock. Owner
historical imports retain explicit provenance.

**Regression proof.** A legal admin publishes a version with a forged reviewer,
year-2000 approval date, and year-2099 creation time. The stored reviewer is the
authenticated actor and both chronology fields are current.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 81 passed
- `node backend/db/test/review-queue.test.mjs` — 45 passed

## Cycle 93 — clause-tag publication date was caller-controlled

**Observed defect.** Governed clause-tag inserts bound the authenticated Legal
author but accepted caller-supplied `tagged_on`. Because tags are immutable
policy inputs to conflict evaluation, their publication history could be
backdated or future-dated permanently.

**Fix.** The clause-tag attribution trigger now derives `tagged_on` from the
database clock for governed writes. Owner historical imports remain explicit.

**Regression proof.** A legal admin publishes a tag with a year-2000 date and a
forged author. The stored author is authenticated and the tag date is the
current database date.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 81 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed

## Cycle 92 — conflict-rule approval chronology was caller-controlled

**Observed defect.** Governed conflict-rule publication bound the authenticated
Legal approver but accepted caller-supplied `approved_on` and `created_at`.
Immutable policy history could therefore misstate when a rule was approved and
recorded. The separately meaningful `effective_on` remains schedulable.

**Fix.** The conflict-rule attribution trigger now derives approval date and
recording time from the database clock for governed writes. Owner historical
imports remain explicit.

**Regression proof.** A legal admin publishes a rule with a year-2000 approval
date, year-2099 creation time, and forged approver. The stored approver is
authenticated and both chronology fields are current.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 81 passed
- `python -m pytest backend/engine/test_validation.py -q` — 26 passed

## Cycle 91 — supersession decision date was caller-controlled

**Observed defect.** Governed supersession inserts bound the authenticated
Legal approver but accepted caller-supplied `decided_on`. An immutable library
history record could therefore falsely claim that Legal made the replacement
decision years earlier or later. The separately meaningful `effective_on`
remains schedulable.

**Fix.** The supersession attribution trigger now derives `decided_on` from the
database clock for governed writes. Owner historical imports remain explicit.

**Regression proof.** A legal admin submits a year-2000 decision date and a
forged approver. The stored approver is authenticated and the decision date is
the current database date.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 81 passed
- `node backend/db/test/executed.test.mjs` — 53 passed

## Cycle 90 — advisory-judgment creation time was caller-controlled

**Observed defect.** Advisory-assessment inserts bound the authenticated
requester but accepted caller-supplied `created_at`. Because model judgments
are append-only evidence, a caller could permanently forge when a judgment was
requested and recorded.

**Fix.** The advisory requester-binding trigger now derives `created_at` from
the database clock for governed writes. Owner historical imports remain
explicit.

**Regression proof.** A legal admin records a judgment with a forged requester
and a year-2099 timestamp. The stored requester is authenticated and the
timestamp falls inside the current statement window.

**Validation.**

- `node backend/db/test/advisory.test.mjs` — 20 passed
- `node backend/db/test/review-queue.test.mjs` — 45 passed

## Cycle 89 — draft creation and expiry chronology was caller-controlled

**Observed defect.** Governed clause-draft inserts bound the authenticated
creator but accepted caller-supplied `created_at` and `expires_on`. A writer
could forge when an AI proposal was made or keep it live beyond the stated
thirty-day stale-draft policy.

**Fix.** The review-queue actor trigger now derives draft creation time and the
thirty-day expiry date from the database clock for governed writes. Owner
historical imports remain explicit.

**Regression proof.** A legal reviewer submits a year-2099 creation timestamp
and expiry date. The stored creation time is current and expiry is exactly
thirty days from the database date.

**Validation.**

- `node backend/db/test/review-queue.test.mjs` — 45 passed
- `node backend/db/test/draft-record.test.mjs` — 19 passed

## Cycle 88 — review-ticket creation time was caller-controlled

**Observed defect.** Review-ticket inserts bound the authenticated opener but
accepted caller-supplied `created_at`. A requester could therefore forge the
opening time of an immutable review and separation-of-duties record.

**Fix.** The review-queue actor trigger now derives ticket `created_at` from the
database clock for governed writes. Owner historical imports remain explicit.

**Regression proof.** A requester opens a ticket with a year-2099 timestamp and
a forged opener. The stored opener is the authenticated requester and the
timestamp falls inside the current statement window.

**Validation.**

- `node backend/db/test/review-queue.test.mjs` — 45 passed
- `node backend/db/test/self-approval.test.mjs` — 9 passed

## Cycle 87 — snapshot and ruleset creation times were caller-controlled

**Observed defect.** Governed writers could supply `created_at` when inserting
content-addressed snapshots and rulesets. These rows are immutable provenance
pins, so a caller could permanently forge when the pinned inputs were stored.

**Fix.** Shared insert triggers now derive snapshot and ruleset creation times
from the database clock for governed writes. Owner historical imports retain
their explicit timestamps.

**Regression proof.** A legal admin submits year-2099 and year-2000 creation
times for a snapshot and ruleset. Both stored timestamps fall inside their
current database statement windows.

**Validation.**

- `node backend/db/test/run-store.test.mjs` — 45 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed

## Cycle 86 — assembly-run creation time was caller-controlled

**Observed defect.** Governed run inserts bound the authenticated creator but
accepted caller-supplied `created_at`. Since runs are immutable reproducibility
records, a caller could permanently forge when an assembly was performed.

**Fix.** The run actor-binding trigger now derives `created_at` from the
database clock for governed writes. Owner historical imports remain explicit.

**Regression proof.** A requester submits a year-2099 run timestamp and a
forged creator. The stored creator is the authenticated requester and the
timestamp falls within the current database-clock window.

**Validation.**

- `node backend/db/test/run-store.test.mjs` — 44 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed

## Cycle 85 — agreement creation time was caller-controlled

**Observed defect.** A requester opening an agreement was bound as its owner,
but could supply the immutable `created_at` timestamp. This allowed a governed
deal record and its lifecycle history to claim it existed at an arbitrary time.

**Fix.** The agreement insert trigger now derives `created_at` from the
database clock for every governed role while preserving legal-admin assignment
of the requester and owner-mode historical imports.

**Regression proof.** A requester opens a deal with a year-2099 timestamp and a
forged owner. The row stores the authenticated requester and a timestamp inside
the current statement window.

**Validation.**

- `node backend/db/test/roles.test.mjs` — 20 passed
- `node backend/db/test/executed.test.mjs` — 53 passed

## Cycle 84 — concession proposal chronology was caller-controlled

**Observed defect.** Governed concession proposals bound the authenticated
proposer but accepted caller-supplied `conceded_on` and `created_at` values.
The immutable commercial record could therefore misstate both its effective
date and when the system received it.

**Fix.** The concession authority trigger now derives both chronology fields
from the database clock for governed writes. Owner historical imports retain
their explicit dates.

**Regression proof.** A requester submits a year-2000 concession date and a
year-2099 creation timestamp. The stored date is today, the timestamp falls
within the current database-clock window, and attribution remains the signed-in
requester.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed
- `node backend/db/test/ladder.test.mjs` — 56 passed

## Cycle 83 — concession settlement recording time was caller-controlled

**Observed defect.** Governed concession settlements derived the authenticated
settler and settlement date but accepted a caller-supplied `recorded_at`. An
immutable settlement could therefore falsely claim that the system received it
years before or after the actual transaction.

**Fix.** The concession-action trigger now derives settlement `recorded_at`
from the database clock for governed writes. Owner historical imports retain
their explicit chronology.

**Regression proof.** A legal reviewer submits a year-2099 recording timestamp
with a settlement. The stored timestamp falls within the current statement
window while the concession still enters force.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed

## Cycle 82 — concession approval recording time was caller-controlled

**Observed defect.** Governed concession approvals derived their business date
but accepted a caller-supplied `recorded_at`. Because approval rows are
append-only evidence, an approver could permanently forge when the system
received their approval.

**Fix.** The approval validation trigger now derives `recorded_at` from the
database clock for governed writes. Owner historical imports remain explicit.

**Regression proof.** A requester submits both a year-2000 approval date and a
year-2099 recording timestamp. The stored approval date is today and its
recording timestamp falls within the current database-clock window.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed

## Cycle 81 — governance configuration dates were caller-controlled

**Observed defect.** Legal-admin attorney assignments and required-approver
configuration bound the authenticated actor but accepted caller-supplied
`assigned_on` and `added_on` dates. These immutable, audited governance records
could therefore permanently misstate when access and approval duties changed.

**Fix.** The shared governance-configuration trigger now derives both dates
from the database clock for governed writes. Owner historical imports retain
the ability to supply their original dates.

**Regression proof.** A legal admin submits a year-2000 attorney assignment and
a year-2099 required-approver addition. Both records store the current database
date while retaining the authenticated legal-admin identity.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed
- `node backend/db/test/executed.test.mjs` — 53 passed

## Cycle 80 — SOW proposal and settlement chronology was caller-controlled

**Observed defect.** Governed SOW override proposals and settlements bound the
authenticated actor but accepted caller-supplied `created_at` and `settled_on`.
The append-only authorization record could therefore permanently misstate when
a departure was proposed or took effect.

**Fix.** The SOW actor-binding trigger now derives proposal creation time and
settlement date from the database clock for governed writes. Owner historical
imports retain explicit chronology.

**Regression proof.** The SOW owner supplies a year-2000 proposal timestamp and
the Legal settler supplies a year-2099 settlement date. Both stored values fall
within the current transition date/window, and the approved SOW still executes.

**Validation.**

- `node backend/db/test/executed.test.mjs` — 53 passed
- `node backend/db/test/negotiation.test.mjs` — 55 passed

## Cycle 79 — requesters could propose departures on another SOW

**Observed defect.** The SOW-override insert policy allowed every requester
without checking deal ownership. A requester who knew another SOW's identifier
could insert a governance proposal on it, then lose visibility of the row under
the stricter read policy.

**Fix.** Requester proposals now require `cw.owns_agreement(sow_id)`. Legal
reviewer and Legal admin proposal authority remains cross-deal as designed.

**Regression proof.** An unrelated requester attempts to propose a Data Privacy
departure on another requester's SOW and is refused by row-level security. The
actual owner can still create the proposal and complete the approved execution.

**Validation.**

- `node backend/db/test/executed.test.mjs` — 53 passed
- `node backend/db/test/roles.test.mjs` — 20 passed

## Cycle 78 — one session could manufacture every SOW approval

**Observed defect.** `sow_override_approval` had no validation trigger. Any role
with insert access could type the configured requester, attorney, and required
approver names, manufacture every signature, and satisfy the settlement gate
alone. Approval dates and record times were caller-controlled as well.

**Fix.** A SECURITY DEFINER row trigger now verifies each name against the SOW's
actual governance configuration, requires governed inserts to come from that
same signed actor, and derives both approval chronology fields from the database.
Owner historical imports remain supported.

**Regression proof.** A Legal session attempting to record the requester's
approval is refused. The actual requester, assigned attorney, and required
approver can each record their own approval, a forged year-2000 chronology is
overwritten, and the fully approved SOW still executes.

**Validation.**

- `node backend/db/test/executed.test.mjs` — 53 passed
- `node backend/db/test/governance.test.mjs` — 47 passed

## Cycle 77 — negotiation chronology was caller-controlled

**Observed defect.** Governed negotiation writes bound their actors but accepted
caller-supplied system chronology: `opened_on`, round `recorded_at`, position
`created_at`, and movement `moved_at`. The append-only commercial history could
therefore be backdated or future-dated permanently.

**Fix.** Governed writes now derive those four record-lifecycle fields from the
database clock. Business facts such as the document's actual `sent_on` date
remain explicit caller input, and owner historical imports remain unchanged.

**Regression proof.** A requester supplies forged year-2000/year-2099 values
while opening a negotiation and recording its round, position, and movement.
Every stored lifecycle value falls within the current transition window and all
four authenticated actor bindings remain correct.

**Validation.**

- `node backend/db/test/negotiation.test.mjs` — 55 passed
- `node backend/db/test/executed.test.mjs` — 53 passed

## Cycle 76 — account lifecycle timestamps were caller-controlled

**Observed defect.** Governed account creation and revocation bound the
Administrator identity but accepted arbitrary `created_at` and `revoked_at`
values. Those immutable fields feed access history and dormancy reporting, so a
caller could permanently backdate or future-date account lifecycle acts.

**Fix.** The account actor-binding trigger now derives creation and revocation
timestamps from the database clock for governed writes. Bootstrap and owner
historical imports retain explicit timestamps.

**Regression proof.** An Administrator supplies a year-2000 creation timestamp
and a year-2099 revocation timestamp. Both stored values fall within the current
transition window while revocation and effective-role behavior remain correct.

**Validation.**

- `node backend/db/test/administrator.test.mjs` — 46 passed
- `node backend/db/test/role-grant.test.mjs` — 42 passed

## Cycle 75 — watcher coverage changes accepted forged timestamps

**Observed defect.** Override-watcher additions and removals bound the
Administrator actor but accepted caller-supplied lifecycle timestamps. Because
`removed_at IS NULL` determines live notification coverage, the permanent
oversight history could misstate when a person was added or silenced.

**Fix.** Governed watcher additions and removals now derive their timestamps
from the database clock alongside the authenticated Administrator. Owner
historical imports retain explicit timestamps.

**Regression proof.** An Administrator supplies a year-2000 addition time and a
year-2099 removal time. Both stored values fall within the current transition
window, while coverage gaps and override socialisation remain correct.

**Validation.**

- `node backend/db/test/settings-split.test.mjs` — 24 passed
- `node backend/db/test/override.test.mjs` — 37 passed

## Cycle 74 — role actions accepted forged immutable timestamps

**Observed defect.** Non-bootstrap role grants, countersigns, and revocations
bound `acted_by` to the signed actor but accepted caller-supplied `acted_at`.
The append-only access history could therefore be backdated or future-dated,
distorting access reviews and dormancy reporting.

**Fix.** The role-grant rules trigger now derives `acted_at` from the database
clock whenever it binds a governed actor. Bootstrap rows retain their explicit
owner-authored historical semantics.

**Regression proof.** An Administrator supplies a year-2000 grant timestamp and
a Legal admin supplies a year-2099 countersign timestamp. Both rows store times
within the current transition window while countersign and revocation behavior
remains unchanged.

**Validation.**

- `node backend/db/test/role-grant.test.mjs` — 42 passed
- `node backend/db/test/administrator.test.mjs` — 46 passed

## Cycle 73 — delegation authority timestamps were caller-controlled

**Observed defect.** Records-delegation writes bound the Administrator actor but
accepted arbitrary `granted_at` and `revoked_at` values. Since a null revocation
timestamp determines live redaction authority, the permanent authority history
could disagree with when access actually changed.

**Fix.** Governed delegation grants and revocations now derive their timestamps
from the database clock alongside the authenticated Administrator. Owner
historical imports retain explicit timestamps.

**Regression proof.** An Administrator supplies a year-2000 grant time and a
year-2099 revocation time. Both stored timestamps fall within the current
transition window, and the delegate's redaction/purge boundaries remain intact.

**Validation.**

- `node backend/db/test/redaction.test.mjs` — 22 passed
- `node backend/db/test/administrator.test.mjs` — 46 passed

## Cycle 72 — share lifecycle timestamps were caller-controlled

**Observed defect.** Governed share and revocation transitions bound the
authenticated actor but accepted caller-supplied `shared_at` and `revoked_at`.
A future-dated revocation closed access immediately while permanently claiming
the consequential act happened later.

**Fix.** Governed application writes now derive both lifecycle timestamps from
the database clock alongside the authenticated actor. Owner historical imports
retain explicit timestamps.

**Regression proof.** A Legal reviewer supplies a year-2000 share time and a
Legal admin supplies a year-2099 revocation time. Both stored values fall within
the current transition window, and revocation still closes viewer access.

**Validation.**

- `node backend/db/test/reading-room.test.mjs` — 23 passed
- `node backend/db/test/executed.test.mjs` — 53 passed

## Cycle 71 — an execution header alone marked a deal signed

**Observed defect.** Inserting `executed_agreement` immediately moved the deal
to `executed`, although the signed bytes live in the separate document-zero row.
A governed Legal caller could therefore create a phantom execution with no
signed original; the immutable orphan header also prevented a clean retry.

**Fix.** Governed execution filings now have a deferred transaction-bound
constraint requiring signed agreement document zero. This permits the
foreign-key-required parent-then-child insertion order but rolls the entire
filing back if the original is absent. Owner-mode historical imports retain
their phased-loading lane.

**Regression proof.** A Legal reviewer files only an execution header. Commit is
refused, the agreement remains negotiating, and no execution header survives.
The existing real-role complete-filing test still reaches executed state.

**Validation.**

- `node backend/db/test/executed.test.mjs` — 53 passed
- `node backend/db/test/health.test.mjs` — 24 passed
- `node backend/db/test/reading-room.test.mjs` — 23 passed
- `node backend/db/test/redaction.test.mjs` — 22 passed

## Cycle 70 — a Legal session could manufacture named approvals

**Observed defect.** The concession-approval gate checked that the supplied name
matched the configured requester, attorney, or required approver, but did not
check that the signed-in actor was that person. A single Legal-role session
could therefore insert other people's approvals and satisfy the settlement
gate. It could also forge the append-only approval date.

**Fix.** Governed approval inserts now require the configured approver to equal
the signed session actor and derive `approved_on` from the database date. The
SECURITY DEFINER trigger uses the session's `SET ROLE` value to preserve the
owner-import boundary.

**Regression proof.** A Legal reviewer attempting to record the configured
requester's approval is refused. The requester and assigned attorney can still
record their own approvals, and a year-2000 approval date is overwritten.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed
- `node backend/db/test/negotiation.test.mjs` — 55 passed
- `node backend/db/test/review-queue.test.mjs` — 45 passed
- `node backend/db/test/ladder.test.mjs` — 56 passed

## Cycle 69 — concession actions accepted forged effective dates

**Observed defect.** Settlement and withdrawal rows correctly bound the
authenticated actor but accepted caller-supplied `settled_on` and
`withdrawn_on`. Because those rows are append-only, a false historical or future
effective date became permanent governance evidence.

**Fix.** Governed application inserts now bind the applicable action date to the
database's current date alongside the authenticated actor. Owner-level
historical imports remain unaffected.

**Regression proof.** A settlement supplies a year-2000 date and a withdrawal
supplies a year-2099 date. Both rows store the database's current date.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed

## Cycle 68 — forged legal-hold dates could misstate retention state

**Observed defect.** Application Legal users were attributed by the database,
but could still supply `opened_on` and `released_on`. In particular, a
future-dated release was treated as released immediately because an open hold is
identified by a null release date, potentially unblocking retention destruction
before the represented release date.

**Fix.** Governed application writes now bind both the opening and release dates
to the database's current date alongside the authenticated actor. Owner writes
remain available for migrations and historical imports.

**Regression proof.** A Legal reviewer supplies a year-2000 opening date and a
Legal admin supplies a year-2099 release date. Both stored dates and the release
audit event record the database's current date.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed
- `node backend/db/test/redaction.test.mjs` — 22 passed

## Cycle 67 — direct ticket decisions accepted forged timestamps

**Observed defect.** The review-ticket transition supplied the current time only
when `decided_on` was null. The intentional direct Legal update path could
therefore backdate or future-date a decision, corrupting the historical evidence
used to explain when language passed review.

**Fix.** Every review-ticket decision transition now derives `decided_on` from
the database clock, assigning over any caller-supplied value.

**Regression proof.** A direct Legal verification supplies a year-2000 decision
time. The stored decision time is nevertheless within the current test window.

**Validation.**

- `node backend/db/test/review-queue.test.mjs` — 45 passed
- `node backend/db/test/self-approval.test.mjs` — 9 passed

## Cycle 66 — direct ticket verification bypassed self-review separation

**Observed defect.** The review helper prevented a requester-originated ticket
from being verified by its opener, but the intentional direct Legal update path
did not. The opener could switch to a Legal database role and verify their own
request without calling the helper.

**Fix.** The final review-ticket transition trigger now enforces the
authenticated-opener separation check for verified transitions, while retaining
the existing carve-out for tickets opened by a person with an effective Legal
role.

**Regression proof.** A requester opens a ticket, then the same actor attempts a
complete direct verified transition under the Legal role. The update raises,
the ticket remains pending, and no clause version is minted.

**Validation.**

- `node backend/db/test/self-approval.test.mjs` — 9 passed
- `node backend/db/test/review-queue.test.mjs` — 45 passed

## Cycle 65 — direct decisions bypassed self-review separation

**Observed defect.** The no-self-decision check existed only in the helper
function. A Legal person who opened an override request could directly update a
finding after the review window and decide their own request.

**Fix.** The finding transition trigger now compares the authenticated decision
actor with the parent request opener and refuses self-decision on every update
path.

**Regression proof.** A reviewer-authored request with an elapsed window is
approved by direct SQL from the same reviewer. The row trigger refuses it and
the finding remains undecided.

**Validation.**

- `node backend/db/test/override.test.mjs` — 37 passed

## Cycle 64 — direct decisions skipped audit and parent closure

**Observed defect.** Once a socialisation window elapsed, a direct Legal update
could validly decide a finding but bypass the helper’s audit event and its
derived parent-request closure. Identical decisions therefore produced
different records depending on the SQL entry point.

**Fix.** Decision auditing and final parent-state derivation now run in an
after-update trigger. The helper performs only the row decision, so helper and
direct updates share one consequence path without duplicate events.

**Regression proof.** One finding is approved by direct SQL with forged
provenance and one is rejected through the helper. Both bind the authenticated
reviewer, emit exactly one corresponding audit event, and the last decision
derives and closes the parent as approved.

**Validation.**

- `node backend/db/test/override.test.mjs` — 37 passed

## Cycle 63 — direct finding decisions bypassed socialisation

**Observed defect.** Legal holds direct update privilege on override findings
for the governed decision function. The row trigger did not enforce
socialisation, so direct SQL could approve or reject a finding before any
audience or review window existed.

**Fix.** The finding transition trigger now requires a socialisation row,
requires its window to have closed, and binds `decided_by` and `decided_at` to
the authenticated session and database time for every decision path.

**Regression proof.** A real Legal reviewer attempts a direct approval before
socialisation while supplying forged decision provenance. The update raises and
all decision fields remain null.

**Validation.**

- `node backend/db/test/override.test.mjs` — 37 passed

## Cycle 62 — override finding severity was rewriteable

**Observed defect.** The override-finding update guard froze its request,
reference, and summary but omitted `severity`. Legal could silently downgrade a
High blocking finding before deciding it, changing what the submitted override
covered.

**Fix.** Finding severity is now immutable alongside every other submitted
finding-evidence field.

**Regression proof.** A real Legal reviewer attempts to change a pending High
finding to Standard; the update raises and both severity and undecided state
remain unchanged.

**Validation.**

- `node backend/db/test/override.test.mjs` — 36 passed

## Cycle 61 — override workflow states were directly assertable

**Observed defect.** A requester could directly update an untouched override
request to `socialised` or `withdrawn` and supply `closed_at`, despite having no
audience, socialisation window, per-finding decisions, governed withdrawal
path, or audit event.

**Fix.** A transition trigger now requires a socialisation row for
`requested → socialised`, derives terminal approval/rejection from completed
findings, refuses unsupported transitions, and prevents later closure-time
rewrites.

**Regression proof.** Direct requester attempts to assert both `socialised` and
`withdrawn` are refused, leaving the request in its original open state. The
complete governed socialisation and decision workflow still passes.

**Validation.**

- `node backend/db/test/override.test.mjs` — 35 passed

## Cycle 60 — override-request evidence was rewriteable

**Observed defect.** The update privilege required by override workflow
functions also let a requester rewrite the parent run, agreement, requester
identity, opening time, justification, and commercial pressure after submission.
Those fields drive scope and are the immutable evidence of what was requested.

**Fix.** A before-update guard now permits workflow fields only; every
request-evidence field is immutable after opening.

**Regression proof.** The authenticated requester attempts to replace ownership,
deal scope, justification, and pressure in one update. The operation raises and
all original values remain byte-for-byte unchanged.

**Validation.**

- `node backend/db/test/override.test.mjs` — 34 passed

## Cycle 59 — requesters could append findings to foreign overrides

**Observed defect.** Direct `override_finding` inserts checked only that the
caller was a requester. A requester who knew another request ID could append an
immutable finding to that override despite being unable to read its parent.

**Fix.** Finding inserts now require the parent override request to be visible
through its RLS policy as well as the requester role.

**Regression proof.** A foreign requester attempts to append a finding to a
real override request; RLS refuses the insert and no matching finding remains.

**Validation.**

- `node backend/db/test/override.test.mjs` — 33 passed

## Cycle 58 — requesters could append judgments to foreign tickets

**Observed defect.** Advisory-assessment reads inherited review-ticket scope,
but inserts checked only the role. A requester who knew a foreign ticket ID
could append permanent model evidence and an audit event to another person’s
review.

**Fix.** Advisory-assessment inserts now require the parent ticket to be
visible through its own RLS policy as well as a permitted writer role.

**Regression proof.** A foreign requester attempts to record a model judgment
on a decided ticket; RLS refuses the insert and the append-only assessment count
remains zero.

**Validation.**

- `node backend/db/test/advisory.test.mjs` — 20 passed

## Cycle 57 — requesters could append evidence to foreign review tickets

**Observed defect.** Insert policies for `review_segment` and
`review_candidate` checked only the caller’s role. A requester who knew a
foreign ticket ID could append redline text or candidate references to another
person’s review evidence despite being unable to read the parent ticket.

**Fix.** Both child-table insert policies now require the parent review ticket
to be visible through its own RLS policy, in addition to the permitted role.

**Regression proof.** A foreign requester attempts both child writes against a
real ticket. Each is refused by RLS and both child-table counts remain zero.

**Validation.**

- `node backend/db/test/review-queue.test.mjs` — 45 passed

## Cycle 56 — requesters could open review tickets on foreign deals

**Observed defect.** The review-ticket insert policy checked only the role. A
requester could open a ticket against another buyer’s agreement and retain
visibility through `opened_by`, injecting review work and provenance into a
foreign deal.

**Fix.** The review-queue insert trigger now requires requester ownership when
an agreement is named. Agreement-less tickets and Legal cross-deal work remain
available.

**Regression proof.** A foreign requester attempts to open a ticket on the
owned test agreement; the insert raises and no matching review record remains.

**Validation.**

- `node backend/db/test/review-queue.test.mjs` — 44 passed
- `node backend/db/test/self-approval.test.mjs` — 9 passed

## Cycle 55 — requesters could write concessions to foreign deals

**Observed defect.** The concession insert policy checked only the caller’s
role. A requester could create immutable, audited commercial history against
another buyer’s agreement, even though the requester could not read that deal
or the injected concession afterward.

**Fix.** The concession authority trigger now requires a requester to own the
referenced agreement. Legal reviewer and Legal admin cross-deal authority is
unchanged.

**Regression proof.** A foreign requester attempts to concede on an owned test
deal; the insert raises and the concession count remains unchanged.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 47 passed
- `node backend/db/test/ladder.test.mjs` — 56 passed

## Cycle 54 — requesters could forge deal ownership

**Observed defect.** A requester creating an agreement could name another
person in `agreement.requester`. That column is the ownership root used by RLS
and helper functions across deals, runs, concessions, negotiations, overrides,
and views, so the caller could inject a deal into somebody else’s scope and
lose visibility of the row they created.

**Fix.** A before-insert trigger binds `requester` to `cw.app_actor()` when the
session role is requester. Legal admins retain legitimate ability to create and
assign deals for another person, and owner-mode imports retain historical
ownership.

**Regression proof.** A real requester opens a deal while explicitly naming a
rival buyer; the returned row and subsequent scope name the authenticated
requester.

**Validation.**

- `node backend/db/test/roles.test.mjs` — 20 passed
- `node backend/db/test/ladder.test.mjs` — 56 passed

## Cycle 53 — required-approver replacement bypassed audit

**Observed defect.** A Legal admin could update a `required_approver` row in
place, silently replacing the person, governance body, label, and `added_by`.
That bypassed both insert-time actor binding and the existing audited
removal/addition path.

**Fix.** In-place required-approver updates now raise. Replacement must use the
already-audited delete followed by an actor-bound insert.

**Regression proof.** A real Legal admin’s silent replacement is refused. A
delete-plus-insert succeeds, binds `added_by` to the authenticated actor, and
leaves ordered removal and addition events while settlement enforcement still
requires the configured person.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 46 passed

## Cycle 52 — attorney reassignment bypassed provenance and audit

**Observed defect.** A Legal admin could update an `agreement_attorney` row in
place, changing both the attorney and `assigned_by` without actor binding or an
audit event. Deleting an assignment also emitted no removal event, despite the
configuration contract saying removals are audited.

**Fix.** In-place attorney updates now raise. Reassignment must be an audited
delete followed by an insert, whose `assigned_by` remains session-bound. The
attorney audit trigger now records both assignment and removal.

**Regression proof.** A real Legal admin’s silent update is refused; a
delete-plus-insert succeeds, binds the new assignment to the authenticated
actor, and leaves ordered `attorney_removed` and `attorney_assigned` events.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 45 passed

## Cycle 51 — clause-tag history was rewriteable and removable

**Observed defect.** Clause tags drive conflict evaluation but could be updated
or deleted after their insert-only audit event. Owner-level truncate also had
no explicit guard. Policy inputs could therefore silently change or disappear
while the audit chain continued to describe the original tag.

**Fix.** Published clause tags are now append-only: update, delete, and truncate
each raise. Corrections require a corrected clause version and its own tags.

**Regression proof.** A real Legal admin attempts to rewrite a tag and its
author, while owner-level statements attempt delete and truncate. Every path is
refused and the original tag and authenticated author remain.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 81 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed
- `node backend/db/test/loader-sql.test.mjs` — 19 passed

## Cycle 50 — supersession history was rewriteable and removable

**Observed defect.** A published supersession controls which clause version is
selectable, but every decision field could be updated after approval. The
database owner could also delete or truncate the records without an explicit
guard. None of those changes emitted a supersession audit event, so clause
history could silently change or disappear.

**Fix.** Supersession rows are now append-only: before-update and before-delete
triggers refuse row mutation and removal, and a statement trigger refuses
truncate. Each refusal applies even to owner-level maintenance paths.

**Regression proof.** A real Legal admin attempts to rewrite the reason,
disposition, and approver, while owner-level statements attempt delete and
truncate. Every operation is refused and the original decision remains intact.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 80 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed

## Cycle 49 — supersessions accepted false approvers

**Observed defect.** A Legal admin superseding approved language could supply
any person as `approver`. The field and audit event describe a deliberate Legal
authorization, so the caller could place another person’s name on an
irreversible library decision.

**Fix.** A before-insert trigger binds `approver` to `cw.app_actor()` for
governed sessions. Database-owner migrations and historical imports preserve
explicit attribution.

**Regression proof.** A real `cw_legal_admin` supersedes a clause version while
naming a forged approver, and the inserted record must name the authenticated
actor while the predecessor and successor states remain correct.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 78 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed

## Cycle 48 — clause tags accepted false authors

**Observed defect.** A Legal admin attaching a policy-driving clause tag could
supply any `tagged_by` identity. The database copied that unverified identity
into the tag’s audit event even though tags are the facts conflict rules
evaluate.

**Fix.** A before-insert trigger binds `tagged_by` to `cw.app_actor()` for
governed sessions. Database-owner seed and historical imports retain explicit
authors.

**Regression proof.** A real `cw_legal_admin` inserts a valid tag while naming
a forged author, and the returned row must name the authenticated actor.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 78 passed
- `node backend/db/test/writer-sql.test.mjs` — 16 passed
- `node backend/db/test/loader-sql.test.mjs` — 19 passed

## Cycle 47 — conflict rules accepted false approvers

**Observed defect.** A Legal admin publishing a conflict rule could supply any
person as `approved_by`. That identity is immutable, appears in the active rule
surface and audit chain, and purports to identify who approved a rule capable
of blocking contracts.

**Fix.** A before-insert trigger binds `approved_by` to `cw.app_actor()` for
governed sessions. Database-owner migrations and historical imports preserve
their explicit attribution.

**Regression proof.** A real `cw_legal_admin` publishes a rule while naming a
different approver, and the returned immutable row must name the authenticated
actor.

**Validation.**

- `node backend/db/test/registry.test.mjs` — 77 passed
- `node backend/db/test/loader-sql.test.mjs` — 19 passed

## Cycle 46 — concession records accepted false approvers

**Observed defect.** Any role permitted to record a concession could supply an
arbitrary `approved_by`. The field is immutable evidence, is emitted into the
audit chain, and identifies who put the commercial retreat forward, so a caller
could permanently attribute their act to another person.

**Fix.** The concession authority trigger now binds `approved_by` to
`cw.app_actor()` for governed sessions before it validates the commercial
floor. Owner-mode historical imports retain explicit attribution.

**Regression proof.** Every governed concession helper supplies a forged
approver, and the positive control requires the stored immutable record to name
the authenticated requester.

**Validation.**

- `node backend/db/test/governance.test.mjs` — 44 passed
- `node backend/db/test/ladder.test.mjs` — 56 passed

## Cycle 45 — override requests accepted false requesters

**Observed defect.** Requesters hold direct insert privilege on
`override_request` and could explicitly supply another person as
`requested_by`. That immutable identity controls requester read scope and the
rule preventing a reviewer from deciding their own request, so forgery could
hide a request and mislead the separation control.

**Fix.** A before-insert trigger binds `requested_by` to `cw.app_actor()` for
all application-role sessions. Database-owner imports preserve explicit
historical attribution.

**Regression proof.** A real requester directly inserts an override request
while naming a Legal reviewer and the stored row must instead name the
authenticated requester.

**Validation.**

- `node backend/db/test/override.test.mjs` — 32 passed

## Cycle 44 — advisory judgments accepted false requesters

**Observed defect.** A permitted caller could explicitly set
`advisory_assessment.requested_by` to another person. The value is permanent,
appears on the metrics board, and attributes an append-only model judgment, so
the database contradicted its own claim that requester identity came from the
connection.

**Fix.** A before-insert trigger now binds `requested_by` to `cw.app_actor()`
for application-role sessions while preserving explicit attribution for
database-owner historical imports.

**Regression proof.** Every advisory test insert now supplies a forged
requester; the positive control requires the returned immutable row to name the
authenticated Legal actor.

**Validation.**

- `node backend/db/test/advisory.test.mjs` — 19 passed

## Cycle 43 — review-queue provenance accepted false actors

**Observed defect.** Governed inserts could supply arbitrary values for
`clause_draft.created_by` and `review_ticket.opened_by`. Besides falsifying
permanent provenance, a forged ticket opener reached the self-review control,
allowing the actual opener to conceal their identity from the
separation-of-duties check.

**Fix.** A before-insert trigger now binds both fields to `cw.app_actor()` for
application-role sessions. Database-owner imports remain able to preserve
historical attribution.

**Regression proof.** The review-queue tests submit forged draft and ticket
actors and require the stored actors to match the authenticated session. The
self-approval suite now attempts every ticket open with a forged identity and
still proves that the real opener cannot approve their own request.

**Validation.**

- `node backend/db/test/review-queue.test.mjs` — 43 passed
- `node backend/db/test/self-approval.test.mjs` — 9 passed

## Cycle 42 — run records accepted false creators

**Observed defect.** A permitted requester or Legal caller could insert a run
with an arbitrary `created_by`. The field is permanent and participates in
requester read scoping, so the write could falsify provenance or hide the run
from its authenticated creator.

**Fix.** A before-insert trigger binds `created_by` to `cw.app_actor()` for
application-role sessions. Owner writes remain available for migrations and
historical imports.

**Regression proof.** The run-store suite records an owned-deal run while
supplying `impostor@cw` and verifies the immutable row names the authenticated
requester.

**Validation.**

- `node backend/db/test/run-store.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 41 — SOW override actions accepted false actors

**Observed defect.** Requesters or Legal callers could propose or authorize a
statement-of-work departure while placing arbitrary identities in immutable
`proposed_by` or `settled_by`. The false authorizer was copied into the audit
chain.

**Fix.** Before-insert triggers bind proposal and authorization attribution to
`cw.app_actor()` for application-role sessions. Named approval subjects remain
unchanged, and owner writes remain available for historical imports.

**Regression proof.** The executed-agreement suite supplies `impostor@cw` for
both governed operations and verifies the permanent rows and authorization
audit payload name the authenticated requester and Legal reviewer.

**Validation.**

- `node backend/db/test/executed.test.mjs`
- Result: 52 passed, 0 failed.

## Cycle 40 — concession actions accepted false actors

**Observed defect.** A permitted caller could settle or withdraw a concession
while placing an arbitrary identity in immutable `settled_by` or
`withdrawn_by`. The false actor was also copied into the audit chain.

**Fix.** Before-insert triggers bind settlement and withdrawal attribution to
`cw.app_actor()` for application-role sessions. Named approval subjects remain
unchanged, and owner writes remain available for historical imports.

**Regression proof.** The governance suite supplies `impostor@clausewerk` for
both successful actions and verifies the permanent rows and audit payloads name
the authenticated Legal reviewer and requester.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 39 — governance configuration accepted false actors

**Observed defect.** A Legal Admin could assign an attorney or add a required
approver while placing an arbitrary identity in `assigned_by` or `added_by`.
Those provenance fields permanently claimed somebody else configured the
approval obligations.

**Fix.** Before-insert triggers bind the configuration provenance fields to
`cw.app_actor()` for application-role sessions while leaving the configured
attorney and approver identities unchanged. Owner writes remain available for
migrations and historical imports.

**Regression proof.** The governance suite supplies `impostor@clausewerk` for
both operations and verifies the rows name the authenticated Legal Admin as the
configuring actor.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 38 — override-watcher evidence accepted false actors

**Observed defect.** An Administrator could add or remove an override watcher
while supplying arbitrary `added_by` or `removed_by` identities. The false
identity was stored and copied into the audit payload that explains who changed
the notification audience.

**Fix.** The existing before-write watcher trigger binds addition and removal
attribution to `cw.app_actor()` for application-role sessions before auditing.
Owner writes remain available for migrations and historical imports.

**Regression proof.** The settings/watcher suite supplies
`impostor@clausewerk` for both operations and verifies watcher state and audit
payloads use the authenticated Administrator.

**Validation.**

- `node backend/db/test/settings-split.test.mjs`
- Result: 24 passed, 0 failed.

## Cycle 37 — account history accepted false actors

**Observed defect.** An Administrator could create or revoke an account while
placing arbitrary identities in the immutable `created_by` and `revoked_by`
fields. Audit events still named the authenticated actor, leaving contradictory
permanent access-history evidence.

**Fix.** A before-write trigger binds account creation and revocation
attribution to `cw.app_actor()` for application-role sessions. Owner writes
remain available for the bootstrap ceremony, migrations, and historical
imports.

**Regression proof.** The administrator suite supplies
`impostor@clausewerk` for both operations and verifies the stored account row
and revocation audit payload contain the authenticated Administrator.

**Validation.**

- `node backend/db/test/administrator.test.mjs`
- Result: 46 passed, 0 failed.

## Cycle 36 — records delegation accepted false actors

**Observed defect.** An Administrator could override `granted_by` when
delegating redaction authority and supply any `revoked_by` when withdrawing it.
The false revoker was copied into the audit chain, falsifying accountability
around authority that permits irreversible content removal.

**Fix.** The existing before-write delegation trigger binds grant and
revocation attribution to `cw.app_actor()` for application-role sessions before
it creates audit events. Owner writes remain available for migrations and
historical imports.

**Regression proof.** The redaction suite supplies `impostor@clausewerk` for
both operations and verifies the stored fields and revocation audit payload
contain the authenticated Administrator.

**Validation.**

- `node backend/db/test/redaction.test.mjs`
- Result: 22 passed, 0 failed.

## Cycle 35 — agreement-share evidence accepted false actors

**Observed defect.** Legal callers could explicitly override `shared_by` and
supply any `revoked_by` when sharing or unsharing an executed agreement. The
false revoker was also copied into the audit chain, while the false sharer was
shown in the reading room as permanent attribution.

**Fix.** The existing before-write share trigger binds both fields to
`cw.app_actor()` for application-role sessions before it creates audit events.
Owner writes remain available for migrations and historical imports.

**Regression proof.** The reading-room suite supplies
`impostor@clausewerk` for both operations and verifies the stored fields and
audit payload contain the authenticated Legal actors.

**Validation.**

- `node backend/db/test/reading-room.test.mjs`
- Result: 23 passed, 0 failed.

## Cycle 34 — legal-hold evidence accepted false actors

**Observed defect.** The roles allowed to open and release legal holds could
write arbitrary `opened_by` and `released_by` values. Those values are
immutable and copied into the audit trail, so a permitted caller could
permanently attribute a litigation hold or consequential release to somebody
else.

**Fix.** A before-write trigger binds opening and release attribution to
`cw.app_actor()` for every application-role session. Owner writes remain
available for migrations and historical imports.

**Regression proof.** The governance suite now attempts both operations with
`impostor@clausewerk` while authenticated as `legal@clausewerk`, and verifies
the permanent audit payload records the authenticated actor.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 33 — direct negotiation writes accepted false actors

**Observed defect.** Negotiation row policies correctly scoped who could write,
but the append-only identity fields remained supplied by that writer.
`opened_by`, `baseline_chosen_by`, round `actor`, and movement `actor` could all
name somebody other than the session person, permanently falsifying the
commercial history.

**Fix.** Before-insert triggers bind all four fields to `cw.app_actor()` for
application-role writes. Owner-run migrations retain the ability to preserve
actors while importing historical records.

**Regression proof.** A requester writes their owned negotiation, round, and
movement while naming a different requester in every actor field. The stored
record names the authenticated requester in all four places, and every
append-only, ordering, access, renewal, and Legal control remains green.

**Validation.**

- `node backend/db/test/negotiation.test.mjs`
- Result: 55 passed, 0 failed.

## Cycle 32 — renewal decisions could be attributed to another person

**Observed defect.** `cw.open_renewal` authorizes the session actor against the
deal, but separately accepted an actor argument for `opened_by` and
`baseline_chosen_by`. An authorized requester or Legal caller could therefore
put somebody else’s name on the renewal and baseline decision.

**Fix.** Bind the renewal actor argument to `cw.app_actor()` before the
ownership check or any write.

**Regression proof.** A requester attempts to open their own renewal under
another requester’s name and is refused with no negotiation row created.
Requester and both Legal role controls still open correctly attributed
renewals, and both baseline paths remain reachable.

**Validation.**

- `node backend/db/test/negotiation.test.mjs`
- Result: 55 passed, 0 failed.

## Cycle 31 — retention destruction actors could be impersonated

**Observed defect.** `cw.retention_destroy` permanently records its actor
argument but did not bind that name to the session actor. An
administrator-role connection could therefore make the destruction decision
under another person’s identity, corrupting both the retention row and audit
chain attribution.

**Fix.** Require the actor argument to equal `cw.app_actor()` before checking
holds, dates, or changing lifecycle state.

**Regression proof.** An administrator-role session attempts to destroy under
the records custodian’s name and is refused without changing `destroyed_on`.
The real named custodian still exercises every hold, due-date, success, and
repeat-destruction path.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 30 — records actors could be impersonated

**Observed defect.** The irreversible redaction and purge definers accepted an
actor argument and checked that named person’s authority, but never required
the name to match the session actor. An undelegated Legal caller could borrow a
delegate’s identity to erase content, and an administrator-role session could
attribute a purge to a different administrator.

**Fix.** Bind each actor argument to `cw.app_actor()` before checking
delegation, retention state, or touching records. The argument remains only the
permanent attribution of the person actually signed in.

**Regression proof.** An undelegated legal admin attempts redaction under a
delegate’s name and an administrator-role session attempts purge under another
administrator’s name. Both are refused before changing lifecycle state; the
real delegate and real administrator controls still succeed.

**Validation.**

- `node backend/db/test/redaction.test.mjs`
- Result: 22 passed, 0 failed.

## Cycle 29 — notification relationships were probeable by viewers

**Observed defect.** `cw.was_notified` bypasses row security to break the
recursive dependency between override requests and their notification rows.
Any viewer could nevertheless call it with another person’s identity and learn
whether that person was notified about a named override request.

**Fix.** Preserve the recursion-safe definer but restore the parent policies’
scope inside it: viewers may ask only about themselves, and requesters only
about a request they opened. Legal, Audit, and the administrator retain the
complete access story.

**Regression proof.** A notified viewer and the request owner still receive
`true`; an uninvolved viewer asking about that notified person receives
`false`. All downstream override visibility checks remain green.

**Validation.**

- `node backend/db/test/override.test.mjs`
- Result: 31 passed, 0 failed.

## Cycle 28 — sharing relationships were probeable by other viewers

**Observed defect.** `cw.is_shared_with` bypasses row security to avoid a policy
recursion, and every viewer could execute it with any agreement and person.
An unshared viewer could therefore discover whether a named person had live
access to a specific signed agreement.

**Fix.** Mirror the sharing table’s subject scope inside the helper. A viewer
may ask only about their own identity; a requester may ask about an agreement
they own; Legal, Audit, and the administrator retain their complete view.

**Regression proof.** The shared viewer and deal owner still receive `true`.
An unshared viewer asking the identical question about the shared person
receives `false`, while all reading-room policies continue to work.

**Validation.**

- `node backend/db/test/reading-room.test.mjs`
- Result: 23 passed, 0 failed.

## Cycle 27 — legal-hold status was probeable across deals

**Observed defect.** `cw.agreement_under_hold` uses definer rights so retention
decisions cannot miss a hidden hold. The function was also callable by
requesters without restoring the legal-hold table’s ownership scope, allowing
an unrelated requester to test whether an arbitrary agreement ID was involved
in active litigation.

**Fix.** Retain the complete result for Legal, Audit, and the records
custodian, but require requester calls to pass `cw.owns_agreement`.

**Regression proof.** With a live hold in place, the deal owner still receives
`true`; another requester querying the same agreement receives `false`. The
retention path remains blocked by the hold.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 43 passed, 0 failed.

## Cycle 26 — approval helpers disclosed unrelated deal governance

**Observed defect.** The concession and SOW “missing approvers” helpers run as
security definers so settlement checks always see the complete approval
configuration. Both were also explicitly callable by requesters, but neither
restored the deal scope it bypassed. A requester could enumerate the attorney,
deal owner, and required approvers for an unrelated concession or SOW by ID.

**Fix.** Preserve complete results for Legal and Audit while filtering a
requester’s helper input through `cw.owns_agreement`. An unrelated identifier
now returns no governance identities.

**Regression proof.** Both governance workflows compare the deal owner with an
unrelated requester: the owner still receives the complete missing-approver
list, while the unrelated requester receives no rows.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- `node backend/db/test/executed.test.mjs`
- Results: 42 governance tests and 52 executed-agreement tests passed.

## Cycle 25 — requesters could socialise other people’s overrides

**Observed defect.** `cw.socialise_override_request` is a security-definer
function so it can resolve the complete notification audience. That also
bypasses the override-request row policy, and the function did not restore an
ownership check. Any requester who learned another request’s numeric ID could
advance it to `socialised`, notify its audience, and start its decision window.

**Fix.** Resolve the invoker role before acting. Legal retains its intended
ability to advance any pending request, while a requester must be the person
recorded as having opened that request.

**Regression proof.** The override suite has an unrelated requester attempt the
transition, requires an authorization failure, and proves neither state nor
socialisation rows changed. Positive controls prove both the owner-requester
and Legal paths still work.

**Validation.**

- `node backend/db/test/override.test.mjs`
- Result: 30 passed, 0 failed.

## Cycle 24 — terminated agreements could acquire executed records

**Observed defect.** The execution trigger changed an agreement from
`negotiating` to `executed`, but did not check whether its conditional update
matched a row. Filing against a previously terminated agreement therefore
succeeded, creating an immutable executed-agreement record while leaving the
agreement itself terminated.

**Fix.** Require the trigger's status transition to affect exactly one
negotiating agreement. Any other state raises a check violation, rolling the
executed-record insert back atomically.

**Regression proof.** The executed-agreement schema suite terminates a deal,
attempts to file it, requires the state-specific refusal, and confirms no
executed row survived.

**Validation.**

- `node backend/db/test/executed.test.mjs`

## Cycle 1 — ambiguous duplicate Content-Type fields

**Observed defect.** The HTTP doorway accepted more than one `Content-Type`
field and silently used the first value to decide whether a POST body was JSON
or a document. Different HTTP hops can select or combine duplicate fields
differently, making the meaning of one request ambiguous.

**Fix.** Reject any POST carrying multiple `Content-Type` fields before reading
its body. This matches the doorway's existing fail-closed handling for duplicate
`Content-Length` and `Authorization` fields.

**Regression proof.** `doorway/test_server_protocol.py` sends conflicting JSON
and DOCX media types, asserts a 400 response, and proves no body byte was read.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`

## Cycle 6 — unexpected database errors leaked as caller mistakes

**Observed defect.** An unexpected psycopg failure fell through to a 400
response containing the driver's raw message. Broken statements could therefore
blame the caller and disclose internal table or column names.

**Fix.** Preserve the existing classifications for operational, privilege,
integrity, trigger, and caller data errors. Log any other psycopg error and
return a redacted service-failure response.

**Regression proof.** A simulated real psycopg `UndefinedColumn` error must
produce a redacted 500 while retaining its diagnostic detail only in stderr.

**Validation.**

- `python -m pytest doorway/test_refusals.py -q`
- `python -m py_compile doorway/refusals.py doorway/test_refusals.py`

## Cycle 7 — unbounded model-provider response

**Observed defect.** The advisory adapter read the provider's entire HTTP
response into memory before parsing it. A malfunctioning or compromised
provider could exhaust the service with an arbitrarily large response.

**Fix.** Read at most one byte beyond a one-megabyte response budget. If that
sentinel byte exists, discard the reply and record an absent judgment.

**Regression proof.** A fake provider sends one byte over the limit; the adapter
reads only the bounded amount and returns an absence naming the oversized reply.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "adapter"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 21 — reconstruction inconsistencies became generic failures

**Observed defect.** The document endpoint translated only
`SnapshotIncomplete` into a fail-closed 409. Other detected stored-run
inconsistencies, including missing ladder members and removed category mappings,
escaped as generic 500 failures.

**Fix.** Treat every engine-detected reconstruction inconsistency as the same
refused-on-merits outcome before document generation.

**Regression proof.** Forced missing-rung and unknown-category reconstruction
errors must each return 409 and no ZIP bytes.

**Validation.**

- `python -m pytest doorway/test_documents.py -q -k "other_rebuild_inconsistencies"`
- `python -m py_compile doorway/documents.py doorway/test_documents.py`

## Cycle 23 — known unprintable wording became a generic failure

**Observed defect.** The document engine deliberately raises
`UnprintableText` when approved wording contains a character XML 1.0 cannot
represent. The endpoint let that known refusal escape as a generic 500.

**Fix.** Preserve the engine's actionable explanation in a refused-on-merits
409 before hashing, auditing, or returning any document bytes.

**Regression proof.** Forced unprintable approved text must return 409 with the
engine explanation and no ZIP bytes.

**Validation.**

- `python -m pytest doorway/test_documents.py -q -k "unprintable_approved_text"`
- `python -m py_compile doorway/documents.py doorway/test_documents.py`

## Cycle 22 — malformed stored manifests became 500s

**Observed defect.** Stored run manifests are JSONB without a database shape
constraint. If reconstruction encounters an invalid object or risk list,
`manifest_from` raises `Malformed` outside the endpoint's refusal handling.

**Fix.** Classify malformed stored manifests as non-reproducible runs and
return a refused-on-merits 409 before resolution or document generation.

**Regression proof.** Forced malformed stored-manifest reconstruction must
return 409 and no ZIP bytes.

**Validation.**

- `python -m pytest doorway/test_documents.py -q -k "malformed_stored_manifest"`
- `python -m py_compile doorway/documents.py doorway/test_documents.py`

## Cycle 20 — malformed ticket IDs escaped integer conversion

**Observed defect.** `str.isdigit()` accepts some Unicode numeral characters
that `int()` rejects, while a thousands-digit ASCII value exceeds Python's
integer-conversion safety limit. Both malformed identifiers became internal
failures.

**Fix.** Require ticket identifiers to contain 1–19 ASCII decimal digits, the
input shape of PostgreSQL `bigint`, before conversion.

**Regression proof.** Unicode superscript, 5,000-digit, negative, and decimal
identifiers must all receive 400 responses without touching the database.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "malformed_ticket_ids"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 19 — provider redirects could receive the API key

**Observed defect.** Python's default HTTP redirect handler copies ordinary
headers, including `Authorization`, into the redirected request even when its
host changes. The OpenAI key was stored in that redirectable header set.

**Fix.** Add authorization as an unredirected request header. It is sent to the
configured endpoint but excluded from every redirect request Python constructs.

**Regression proof.** Python's real redirect handler builds a request to an
attacker host from the captured provider request; the original has the key and
the redirected request does not.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "not_copied_to_a_redirected_host"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 18 — truncated model HTTP replies escaped

**Observed defect.** A truncated provider response can raise
`http.client.IncompleteRead`. That protocol exception is not an `OSError`, so it
escaped the advisory adapter instead of recording an absence.

**Fix.** Treat standard-library HTTP protocol exceptions as unreachable-provider
outcomes alongside URL, timeout, and operating-system failures.

**Regression proof.** A fake response raises `IncompleteRead` from its bounded
read; the adapter must return an absence naming that failure type.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "truncated_provider"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 17 — structured model provenance was stringified

**Observed defect.** A provider's object, array, number, boolean, or blank
`model` field was converted to text and stored as the model version, fabricating
provenance for an otherwise valid judgment.

**Fix.** Accept provider-reported model identity only as nonblank text. Use the
requested model only when the response omits the field; malformed supplied
provenance makes the judgment absent.

**Regression proof.** Five malformed model values must return absent judgments
with unknown model-version provenance.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "structured_model_provenance"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 16 — non-object provider envelope raised

**Observed defect.** A syntactically valid top-level JSON array, string, number,
or null reached `payload.get()` and raised `AttributeError`, violating the
adapter's guarantee that advisory failures never interrupt governed work.

**Fix.** Require a JSON object provider envelope before reading model
provenance or choices; otherwise record an absent judgment.

**Regression proof.** Four valid non-object JSON types must each return an
absence naming the wrong envelope shape.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "non_object_provider"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 15 — structured model basis was stringified

**Observed defect.** A list, object, number, or boolean in the model's `basis`
field was converted with `str()` and stored as if it were the requested
explanatory sentence.

**Fix.** Accept a basis only when it is text or absent. Structured and scalar
non-text values make the whole reply an absent malformed judgment.

**Regression proof.** Object, list, number, and boolean basis values must not
produce recorded judgments or stored basis text.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "structured_basis"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 9 — ambiguous duplicate DOCX members

**Observed defect.** A ZIP can contain two entries with the same
`word/document.xml` name. Python selects one entry while another DOCX reader may
select the other, allowing one upload to represent different negotiated text.

**Fix.** Reject an archive containing any exact duplicate member name before
reading or parsing its document part.

**Regression proof.** A DOCX fixture carries two different document XML entries
under the same name and must raise `NotADocx`.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "duplicate_document_parts"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q` — 198 passed; the expected duplicate-name
  warning comes from constructing the hostile regression fixture.

## Cycle 10 — shallow XML element flood

**Observed defect.** DOCX parsing bounded decompressed bytes and nesting depth
but not total element count. A shallow document containing hundreds of
thousands of empty elements stays below the byte and depth limits while
expanding into a disproportionately large in-memory tree.

**Fix.** Count elements in the streaming tree builder and abandon
`word/document.xml` after 100,000 elements, before completing the tree.

**Regression proof.** A compressed shallow fixture contains 100,001 run
elements and must raise `NotADocx` at the element budget.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "shallow_element_flood"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q`

## Cycle 14 — non-numeric model scores were coerced

**Observed defect.** Python converted JSON booleans and numeric strings through
`float()`. A malformed provider response such as `{"score": true}` therefore
became a recorded score of `1.0`.

**Fix.** Require the score to be an actual finite JSON integer or float,
explicitly excluding booleans, before applying the zero-to-one range check.

**Regression proof.** Boolean, string, and null scores must all produce absent
judgments rather than numbers.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "non_numeric_scores"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 13 — Word tabs vanished from parsed text

**Observed defect.** `w:tab` elements were ignored by both ordinary document
reading and redline segment extraction. Words separated by a displayed tab in
Word were silently joined.

**Fix.** Preserve Word tab elements as tab characters in readable, kept,
inserted, and deleted text.

**Regression proof.** A changed paragraph carries tabs in all three segment
kinds; the visible, accepted, and original representations must retain them.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "tabs_survive"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q`

## Cycle 11 — unsupported ZIP features escaped DOCX parsing

**Observed defect.** An uploaded DOCX using an unsupported compression method
caused `zipfile` to raise `NotImplementedError` outside the parser's
`NotADocx` contract. Encrypted members similarly raise `RuntimeError`.

**Fix.** Translate unsupported or encrypted ZIP mechanics into a clear
malformed-document refusal at the archive boundary.

**Regression proof.** A valid minimal DOCX has both ZIP compression-method
fields patched to unsupported method 99 and must raise `NotADocx`.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "unsupported_zip_compression"`
- `python -m py_compile engine/docx.py engine/test_docx.py`

## Cycle 12 — line breaks vanished from redline text

**Observed defect.** The redline parser extracted text nodes but ignored
`w:br` elements inside kept, inserted, and deleted runs. Its accepted and
original text could therefore differ from the vendor's actual proposed text.

**Fix.** Extract each run in document order and preserve Word line-break
elements as newline characters for every segment kind.

**Regression proof.** One changed paragraph carries a line break in its kept,
deleted, and inserted runs; both reconstructed texts and all three segments
must retain those breaks.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "line_breaks_survive"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q`

## Cycle 8 — recursive model-provider JSON escaped the adapter

**Observed defect.** A deeply nested but size-bounded provider reply caused
`json.loads` to raise `RecursionError`. The adapter did not catch it, violating
its promise that an advisory judgment can never interrupt the caller's work.

**Fix.** Treat excessive JSON nesting at either the provider envelope or the
model-content layer as an unreadable reply and record an absent judgment.

**Regression proof.** A fake provider returns 2,000 nested arrays; the adapter
returns an absence rather than raising.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "adapter"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 5 — malformed query percent escapes

**Observed defect.** Query parsing accepted malformed percent escapes literally.
For example, `run=%ZZ` reached the document selector as `%ZZ`, even though the
same invalid URL encoding was already refused on the static-file path.

**Fix.** Reject any query percent sign that is not followed by exactly two
hexadecimal digits before decoding fields.

**Regression proof.** The protocol suite requires `run=%ZZ` to return no
selector and a 400 response.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`

## Cycle 4 — invalid UTF-8 query selectors

**Observed defect.** Query parsing used replacement decoding. An invalid
selector such as `run=%FF` was silently changed into a Unicode replacement
character before the authorization-scoped lookup.

**Fix.** Decode query fields with strict UTF-8 and classify decoding or field
count failures as malformed caller input.

**Regression proof.** The protocol suite requires `run=%FF` to return no
selector and a 400 response.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`

## Cycle 3 — embedded NUL in static paths

**Observed defect.** A `%00` escape decoded into an embedded NUL and was passed
to `Path.resolve()`, which raises an unexpected exception. Malformed caller
input therefore became a 500 instead of a bounded 400 response.

**Fix.** Reject decoded NUL characters before constructing or resolving a
filesystem path.

**Regression proof.** The protocol suite submits `/assets/app%00.js` and
requires a 400 refusal from the URL-decoding boundary.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`
- `python -m pytest engine -q`
- Results: 12 protocol tests passed, both changed Python files compiled, and
  197 engine tests passed.

The database-backed doorway suite could not reach terminal output while
pre-existing session-store work and other test processes were using the shared
development database. It is not claimed as passing evidence for this cycle.

## Cycle 2 — blank duplicate query selectors

**Observed defect.** Query parsing discarded blank values before counting a
selector's occurrences. `run=&run=RUN-2` therefore passed as one selector even
though the caller supplied two, allowing different HTTP components to disagree
about which value named the requested document.

**Fix.** Preserve blank query values during parsing so the existing
exactly-once check sees and rejects every duplicate spelling.

**Regression proof.** The protocol test now covers both two nonblank selectors
and a blank plus nonblank selector; each must produce a 400.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`
