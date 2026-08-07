# Decision record

One record per important decision, newest first. Plain language.

Detailed engineering write-ups live in [`docs/decisions/`](docs/decisions/); this file is the
running log of *what we decided and why*, readable without opening the code.

## S85 — Governed execution headers and signed originals are atomic — SETTLED 2026-07-28
A governed execution filing must include signed agreement document zero in the
same transaction. Header-only filings roll back without changing deal status or
leaving an immutable orphan. Owner historical imports may still load in phases.

## S84 — A named approval must be the signed actor's own act — SETTLED 2026-07-28
A governed concession approval is accepted only when its configured approver is
the signed session actor. Its effective date comes from the database. Owner
imports retain explicit historical attribution.

## S83 — Governed concession action dates are database-derived — SETTLED 2026-07-28
Application settlements and withdrawals bind their effective date to the
database clock alongside the authenticated actor. Historical owner imports
remain possible.

## S82 — Governed legal-hold dates are database-derived — SETTLED 2026-07-28
Application opening and release actions bind both the authenticated actor and
the database's current date. Owner writes retain historical-import flexibility.

## S81 — Review decision time is database-derived — SETTLED 2026-07-28
Every review-ticket decision transition records the database's current time.
Direct table callers cannot backdate or future-date the review evidence.

## S80 — Review-ticket self-review separation lives on the transition — SETTLED 2026-07-28
A requester-originated review ticket cannot be verified by its authenticated
opener through either the helper or direct Legal update. Tickets opened by a
person with an effective Legal role retain their deliberate carve-out.

## S79 — Override self-decision separation lives on the row — SETTLED 2026-07-28
The authenticated actor deciding an override finding cannot be the parent
request opener. The row transition enforces this for helper calls and direct
Legal SQL alike.

## S78 — Finding decision consequences live on the row transition — SETTLED 2026-07-28
Every override-finding decision emits its audit event and, when it is the last
decision, derives and closes the parent request. Helper calls and direct Legal
updates therefore produce the same complete record.

## S77 — Finding decisions enforce the review window at the row — SETTLED 2026-07-28
Every override-finding decision path requires recorded socialisation and an
elapsed review window. Decision actor and time come from the authenticated
session and database, including direct SQL paths.

## S76 — Override finding severity is immutable — SETTLED 2026-07-28
The severity submitted on an override finding is part of what the request
covers. Legal may decide the finding but cannot downgrade or otherwise rewrite
its severity first.

## S75 — Override state is evidence-derived — SETTLED 2026-07-28
An override becomes socialised only after its audience and window exist, and
becomes approved or rejected only from completed per-finding decisions.
Unsupported direct states are refused and a terminal closure time is immutable.

## S74 — Override-request evidence is immutable — SETTLED 2026-07-28
After an override request opens, its run, agreement, requester identity,
opening time, justification, and commercial pressure cannot be rewritten. The
update path exists only for governed workflow state.

## S73 — Override findings inherit request scope — SETTLED 2026-07-28
An override finding may be inserted only when the requester can see its parent
override request through RLS. Guessing another request ID cannot append
immutable foreign findings.

## S72 — Advisory writes inherit ticket scope — SETTLED 2026-07-28
An advisory assessment may be appended only when the caller can see its parent
review ticket through RLS. A requester cannot attach permanent model evidence
or its audit event to another opener’s ticket.

## S71 — Review-evidence writes inherit parent scope — SETTLED 2026-07-28
Redline segments and review candidates may be appended only when the caller can
see the parent review ticket through its RLS policy. A requester cannot modify
another opener’s review evidence by guessing a ticket ID.

## S70 — Requester review tickets are deal-owner scoped — SETTLED 2026-07-28
A requester may open an agreement-linked review ticket only on a deal they own.
Agreement-less tickets and Legal cross-deal review remain available; a foreign
requester cannot inject review work into another deal.

## S69 — Requester concessions are deal-owner scoped — SETTLED 2026-07-28
A requester may record a concession only against an agreement they own. Legal
reviewer and Legal admin cross-deal authority remains intact; a foreign
requester cannot inject immutable commercial history into another deal.

## S68 — Requester-created deals bind ownership to session — SETTLED 2026-07-28
A requester opening an agreement becomes its requester; they cannot inject a
deal into another person’s RLS scope. Legal admins may still create and assign
deals for another person, and owner-mode imports retain historical ownership.

## S67 — Required-approver replacement is remove-plus-add — SETTLED 2026-07-28
Required-approver configuration cannot be updated in place. Replacement is an
audited removal followed by an actor-bound addition, preserving attribution for
both governance facts.

## S66 — Attorney reassignment is remove-plus-add — SETTLED 2026-07-28
Agreement-attorney configuration cannot be updated in place. Reassignment is
an audited removal followed by an actor-bound addition, so both the old and new
governance facts remain attributable.

## S65 — Published clause tags are append-only — SETTLED 2026-07-28
Clause tags are policy inputs attached to immutable approved wording. After
publication they cannot be updated, deleted, or truncated; a correction belongs
on a corrected clause version so the old conflict-evaluation history remains
resolvable.

## S64 — Published supersessions are append-only — SETTLED 2026-07-28
A supersession changes live clause selectability and is historical evidence.
After publication it cannot be updated, deleted, or truncated, including
through owner-level maintenance paths; corrections require new wording and a
new decision.

## S63 — Supersession approval binds actor to session — SETTLED 2026-07-28
Application-role supersession inserts bind `approver` to `cw.app_actor()`. The
irreversible library decision and its audit event cannot name a second
caller-supplied identity; owner-mode migrations and historical imports retain
explicit attribution.

## S62 — Clause-tag publication binds author to session — SETTLED 2026-07-28
Application-role inserts bind clause-tag `tagged_by` to `cw.app_actor()`.
Policy-driving tag provenance and its audit event cannot name a second
caller-supplied identity; owner-mode seeds and historical imports retain
explicit authors.

## S61 — Conflict-rule publication binds approver to session — SETTLED 2026-07-28
Application-role inserts bind conflict-rule `approved_by` to `cw.app_actor()`.
Immutable rule publication evidence and its audit event cannot name a second
caller-supplied identity; owner-mode migrations and historical imports retain
explicit attribution.

## S60 — Concession provenance binds proposer to session — SETTLED 2026-07-28
Application-role concession inserts bind immutable `approved_by` provenance to
`cw.app_actor()`. The commercial record and audit event cannot attribute a
governed proposal to a second caller-supplied identity; owner-mode historical
imports retain explicit attribution.

## S59 — Override requests bind requester to session — SETTLED 2026-07-28
Application-role inserts bind override-request `requested_by` to
`cw.app_actor()`. The identity used for requester scope and the no-self-decision
control cannot be redirected through direct SQL; owner-mode historical imports
retain explicit attribution.

## S58 — Advisory provenance binds requester to session — SETTLED 2026-07-28
Application-role inserts bind advisory-assessment `requested_by` to
`cw.app_actor()`. An append-only model judgment cannot permanently attribute
the request to a second caller-supplied identity; owner-mode historical imports
retain explicit attribution.

## S57 — Review-queue provenance binds actors to session — SETTLED 2026-07-28
Application-role inserts bind draft `created_by` and review-ticket `opened_by`
to `cw.app_actor()`. The opener identity used by self-review controls is
observed by the database rather than accepted from the caller; owner-mode
historical imports retain explicit attribution.

## S56 — Run provenance binds creator to session — SETTLED 2026-07-28
Application-role inserts bind `cw.run.created_by` to `cw.app_actor()`. Immutable
run provenance and requester read scoping cannot be redirected with a
caller-supplied creator identity.

## S55 — SOW override actions bind actors to session — SETTLED 2026-07-28
Application-role inserts bind SOW override `proposed_by` and settlement
`settled_by` to `cw.app_actor()`. Named approval subjects remain distinct from
the requester or Legal actor performing the proposal or authorization.

## S54 — Concession actions bind actors to session — SETTLED 2026-07-28
Application-role inserts bind concession `settled_by` and `withdrawn_by` to
`cw.app_actor()` before immutable state and audit events are written. Named
approval subjects remain distinct from the actor performing the action.

## S53 — Governance configuration binds actors to session — SETTLED 2026-07-28
Application-role inserts bind attorney `assigned_by` and required-approver
`added_by` to `cw.app_actor()`, without changing the configured attorney or
approver subject. Approval configuration cannot name a false configuring actor.

## S52 — Watcher-list evidence binds actors to session — SETTLED 2026-07-28
Application-role writes bind override-watcher `added_by` and `removed_by` to
`cw.app_actor()` before auditing. Notification-audience changes cannot be
stored or audited under a caller-supplied actor identity.

## S51 — Account history binds actors to session — SETTLED 2026-07-28
Application-role writes bind account `created_by` and `revoked_by` to
`cw.app_actor()`. Bootstrap remains an owner/system act, while ordinary
access-history rows cannot contradict the authenticated audit actor.

## S50 — Records-delegation evidence binds actors to session — SETTLED 2026-07-28
Application-role writes bind delegation `granted_by` and `revoked_by` to
`cw.app_actor()` before auditing. Authority over irreversible redaction cannot
be granted or withdrawn under a caller-supplied identity.

## S49 — Agreement-share evidence binds actors to session — SETTLED 2026-07-28
Application-role writes bind `shared_by` and `revoked_by` to `cw.app_actor()`
before the share audit trigger records the action. Reading-room attribution and
the audit chain cannot carry a caller-supplied actor identity.

## S48 — Legal-hold evidence binds actors to session — SETTLED 2026-07-28
Application-role writes bind legal-hold `opened_by` and release `released_by`
to `cw.app_actor()`. The immutable hold record and its audit events cannot
attribute litigation actions to a caller-supplied identity.

---

## 2026-07-27 · All content is placeholder until further notice

**Decision by Mike.** Everything in the system that is *content* rather than *system* — validation
rules, clause language, example contracts, and those contracts' data and metadata — is placeholder
until further notice, pending review. Synthetic data may be used freely to populate it; nobody
should sweat its quality or completeness. It is part of development for now.

**Why.** The system's machinery is what is being built and proven. Treating today's content as
real would invite exactly the confusion the product boundary rule (2026-07-25) exists to prevent —
the content will be reviewed and populated by the people responsible for it, later. Until Mike
says otherwise, no plan should block on content, and no report should treat a content gap as a
defect. The four specification rules stay unseeded for now; more rules come later.

---

## 2026-07-27 · Filing a signed contract requires its fingerprint and its signers

**Decision by Mike**, answering the second question in
[`ASSEMBLY-CONNECTION-PLAN-2026-07-27.md`](ASSEMBLY-CONNECTION-PLAN-2026-07-27.md). When Legal
files an executed agreement — the moment the record freezes — the system demands the signed
document's digital fingerprint **and** the named signatories, together, before it accepts the
filing. The signing service's completion certificate is *not* required at that moment: it can be
attached when it arrives, which matches how the paper actually shows up. The health console
already surfaces any agreement still waiting on its certificate, so a missing one is visible, not
forgotten. Mike's framing when first asked — "depends when you are talking about in the process" —
is the shape of the rule: evidence accumulates in stages, but a filing without its fingerprint and
its signers is not a filing.

---

## 2026-07-27 · Every assembly run belongs to a deal

**Decision by Mike**, answering the first question in
[`ASSEMBLY-CONNECTION-PLAN-2026-07-27.md`](ASSEMBLY-CONNECTION-PLAN-2026-07-27.md): when the
service gains its "run an assembly" endpoint, a run must name the deal it is for. A run floating
free of any deal is not offered, even though the database could store one — the reading room and
the requester's pipeline view only make sense when a run belongs to a deal, and the database's
existing row rules then decide whose deal a requester may run against. If a freestanding run is
ever wanted, offering it is one field's work.

---

## 2026-07-26 · The front door is Python, and we run standard PostgreSQL

**Two decisions by Mike, taken together**, after a report weighing JavaScript, Python and Rust,
and after he asked whether we should change database at all. The report is
[`SERVICE-STACK-OPTIONS-2026-07-26.md`](SERVICE-STACK-OPTIONS-2026-07-26.md).

**The database: standard PostgreSQL, from now on.** We are not changing database — we already
chose PostgreSQL and it is the right choice, because this product puts its rules *inside* the
database rather than in the application, and very few databases can do that. What changed is the
*packaging*: we were running PostgreSQL in a form that lives inside the program, which needed no
installation. We now run the ordinary version, as separate software, the way commercial products
do. The thirteen sets of rules are ordinary PostgreSQL instructions and run unchanged.

**What that buys, and two of them are gaps our own code admitted to in writing.** The audit
checkpoint can now be properly sealed — until now it was *anchored but unsigned*, so it caught
accidental deletion and bad backups but not deliberate rewriting. A protection against two
writers splitting the history in two, which shipped on reasoning alone because no test could
observe it, becomes testable. And the front door's most important test — hand a connection back
and prove it has forgotten who was using it — becomes real rather than simulated. Plus backups,
standby copies and managed hosting, none of which existed before.

**The cost, honestly.** It is now software to run and pay for, every machine needs it before
tests pass, and tests get slower. Worth it, and cheapest done *before* the front door is written
rather than after — otherwise the most safety-critical code in the system gets written twice.

**The front door: Python.** It belongs with the parts that must be provably correct — the
contract engine and the database rules — not with the screens. It also calls the contract engine
directly rather than running it as a separate program.

**A reversal worth recording, because Mike caused it.** I first recommended JavaScript, on two
grounds: only JavaScript could talk to the old in-program database, and our role-impersonation
test equipment is written in it. Mike asked whether the JavaScript was simply inherited from the
prototype he brought over from Claude Design — *"if yes, that's the opposite of the intent."*
The honest answer was a split one. The core was deliberately Python and the database deliberately
PostgreSQL; neither followed the prototype. But the test equipment is JavaScript only because the
in-program database was a JavaScript component — the convenience we had just agreed to remove. So
the argument was circular: defending a language on the strength of tooling that exists only to
support the packaging we were dropping. I had also overstated the rebuild cost — that helper is
about forty lines of instructions; what matters in it is the *instinct* it encodes, which
transfers to any language.

**Rust: not used, and the reason is not fashion.** Rust prevents a category of mistake that
arises when a program manages the computer's memory by hand. Python and the database already do
that for us, and our front door does almost no work — it establishes who you are and hands the
job to the database. Our failure modes are "the wrong person's name was believed" and "a rule was
bypassed", and Rust has no opinion about either.

**One place stays on the list.** The reader that opens a vendor's Word document is the only part
of the system that takes input from strangers, the only part where being slow *is* the attack —
a malicious file that takes forever to refuse takes the system down — and it is self-contained.
Not now: its defences are already right, and the failing speed test is a budget set on a faster
machine. If we later want that reader sealed off from the contracts and the audit history, Rust
is the right tool. Nothing we are building forecloses it.

---

## 2026-07-25 · We are responsible for the system, not the contract text

**The principle, from Mike.** Clausewerk is a system. It records, gates, checks, and proves
provenance. Responsibility for the contract language that ends up in it — what a clause says,
whether a supplier's paper covers what it should, what was conceded — belongs to the people
using the system: Legal, the requester, and the approvers. Not to the software, and not to us.

**Why this needed saying.** Reviews and plans kept framing content gaps (for example, "supplier-
paper deals have no obligation coverage") as problems the product must solve. They are not. The
product's whole job there is to be honest about what it does and does not cover — badge it,
record it, and hand it to the responsible person. Solving it is their work.

**How to apply.** When a gap is about *content*, the system's obligation ends at making the gap
visible and giving the responsible person a place to act. Never design the software to quietly
take on judgement that belongs to people.

---

## 2026-07-25 · Concessions need the requester, the attorney, and every required approver

**Decision.** Settling a negotiation point at a fallback position is approved by **both** the
business requester **and** the assigned attorney — plus any other **Required Approvers**
configured for that contract: executive leadership, other management, and stakeholder
departments such as ISO, Privacy, Compliance, and Risk. The system must support a configurable
list of Required Approvers per contract, and every approval is recorded by name.

**What this replaces.** An earlier ambiguity where the ladder spec said in one place that the
software could settle a push-back on its own, and in another that the requester alone did it.
Neither is right: the retreat path is pre-approved language, but *taking* it on a given deal is
a decision, and the people with a stake in that decision all sign it.

**Cost, openly.** This puts the attorney back in the loop on every concession. The ladder still
saves the drafting and the research — the approvers are choosing among pre-approved positions,
not writing anything — but the approval round-trip is real. Who counts as Required for which
contracts still needs to be designed (by category? by deal size?) — that is build work, not a
new decision.

---

## 2026-07-25 · No disclosure of AI-drafted origin to counterparties

**Decision.** Rejected until there is a legal reason. We do not tell the other side that a
clause began as an AI draft. There is no requirement for this in negotiation.

**What we checked.** As of today we know of no US or EU rule requiring disclosure of AI
assistance in drafting business-to-business contract language that a lawyer reviewed and
approved. The EU AI Act's transparency rules aim at things like chatbots and synthetic media,
not human-approved contract text. To be confirmed with counsel whenever we next engage one —
and revisited if any jurisdiction we operate in adopts such a rule.

**Unchanged.** Internally, origin is still stamped on every clause permanently. This decision
is only about what the counterparty is told.

---

## 2026-07-25 · Legal owns the unedited-approval rate

**Decision.** The number that shows whether lawyers are actually reviewing AI drafts — how often
a draft is approved without a single edit — is owned by **Legal**. The threshold that triggers
concern will be set in consultation with counsel later; until then the number is measured and
visible, with no alarm wired to it.

**Why it matters.** The AI-drafting decision (ADR-0010) names review quality as the control the
whole thing rests on. A control needs an owner. It now has one.

---

## 2026-07-25 · The provenance counts live in the system, never on the contract

**Decision, from Mike.** The contract document itself carries no provenance claim — the old
"0 LLM-authored characters" footer line is gone from every generated document. Both counts
(machine-written characters: zero, and characters from AI-drafted but lawyer-approved clauses)
are computed and kept **in the system record** for every contract, where Legal and auditors see
them.

**Why.** The contract is the counterparty-facing legal document. Internal assurance figures
belong in the internal record, not on paper the other side signs.

**Still enforced.** Removing the sentence from the page removes nothing from the guarantee: the
character-by-character zero check still runs on every build and the build still fails if it is
ever non-zero. The claim was never the footer; the footer was advertising.

---

## 2026-07-25 · What we concede and what we stand for are different records

**Decision.** Accepting a vendor's wording is a **concession** — a note that on *this one deal* we
agreed to something other than our standard position. It does not change the library. The next deal
still starts from our standard position.

Changing the library is a separate, deliberate decision by Legal. Replacing a clause outright is a
third thing again, called **supersession**, and it keeps the old version on file permanently.

**Why.** Today the system does all three with one action: accept a vendor's redline and it quietly
becomes approved language for everyone. That means the library drifts toward whatever vendors
pushed hardest on, and nobody ever decided that should happen.

**The commercial payoff.** Once concessions are recorded properly, we have something we have never
had: a structured record of what we actually give away, to whom, at what deal size. That record is
what the strategic library gets built from.

**Also decided.** Signed agreements carrying replaced language get flagged at renewal, showing what
changed and why. That is what makes keeping old versions worth doing rather than just tidy.

---

## 2026-07-25 · The library gets a documented retreat path

**Decision.** Each risk area gets a **ladder**: our preferred position, an acceptable fallback, and
a floor we do not go below. Every rung is proper approved language written by a lawyer.

**Why this is the big one.** Today, when a vendor pushes back on anything, it goes to Legal. That
makes Legal the bottleneck on every negotiation. With a ladder, Legal approves the retreat path
once, in advance — so the system can settle common push-backs on its own, and Legal only sees the
asks that fall below the floor.

In plain terms: **Legal's involvement moves from every deal to every category, occasionally.** That
is the difference between a system that scales and one that doesn't.

**The floor is absolute.** No confidence score, no auto-approve, and no shortcut gets past it.

---

## 2026-07-25 · The library learns from what we gave away

**Decision.** The system counts patterns in our concessions and proposes library changes for Legal
to accept or reject. For example: *"we conceded this point on 14 of 17 deals, always to the same
position — our standard position may be fiction."*

**Why.** If we always concede the same point, our written standard is not our real standard, and
everyone wastes time discovering that deal by deal.

**Guardrail.** These are proposals with the evidence attached, never automatic changes, and the
software never writes contract language. It counts; lawyers decide.

**Note.** This data is commercially sensitive — it is a summary of exactly what we will give away
under pressure. It stays internal to Legal and Audit and must never appear in anything vendor-facing.

---

## 2026-07-25 · Lawyers write the contradiction rules, not developers

**Decision.** The rules that detect contradictions in a contract are written and approved by
attorneys, through the same approval process as clause wording — not by engineers changing code.

**Correction.** I had framed this as a code-review question. That was wrong: the sample clauses are
placeholders, and in practice attorneys own this.

**What it means for the build.** The rules need a proper authoring screen for non-technical users,
version control, effective dates, and a named approver — the same treatment clause wording gets.
Every warning the system raises must say which version of which rule produced it.

---

## 2026-07-25 · Keep the simple matcher as the backup

**Decision.** When we upgrade the vendor-redline matcher to smarter search, we keep the current
simple keyword method as the offline backup.

**Why.** Otherwise negotiation becomes the only part of Clausewerk that stops working when the AI
is unavailable, and we lose the ability to say the whole system runs without it.

**Watch out for.** The two methods must score things on the same scale, or our confidence threshold
means different things depending on which one is running.

---

## 2026-07-25 · Auto-approve must leave a trace

**Decision.** Every time someone approves a vendor's change, the system now records whether the
software was recommending that approval, how confident it was, and what the confidence bar was set
to.

**Why.** We can now measure how often people simply agree with the machine. If that number is very
high, the human review step has quietly stopped being a review, and we would want to know before an
auditor tells us.

**Worth knowing.** The "auto-approve" setting never actually approved anything on its own — it only
displayed a hint and a person still clicked. We have also reserved a separate record type so that
if the software is ever allowed to approve by itself, it can never be mistaken in the records for a
person's decision.

---

## 2026-07-25 · A requester can override a warning, but not alone

**Decision.** When the system flags a serious contradiction in a contract, the business requester
can ask to proceed anyway — but it becomes a request, not an instant action. Relevant people are
notified, a lawyer approves or rejects it, and every step is recorded. Approval is given warning by
warning, not as one blanket "proceed".

**Why.** Blocking people entirely just pushes the work outside the system, where nothing is
recorded. Letting one person clear a warning instantly turns a real control into a speed bump. A
request that others can see is the middle path.

**Also decided.** We are adding a **Viewer** role — someone who can read a contract but change
nothing. Today the only way to show a contract to a colleague is to give them the ability to edit
it, which makes the notification step above impossible to do safely.

**Cost, openly.** This adds delay to exactly the deals that are already in a hurry. Expect pressure
to shorten or skip the notification window.

---

## 2026-07-25 · Expiry warnings at every round, and a hard stop at signature

**Decision.** Approved language has an expiry date. The system now re-checks every clause in a
contract at **each negotiation round** and again **at signature**. Language that has gone stale
blocks signing; language expiring soon shows as a warning.

**Why.** Negotiations run for weeks. A clause that was approved when the draft was built can lapse
before anyone signs, and nothing used to notice.

**The rule that makes it safe.** Once a contract is signed, later changes to our clause library
never affect it. A signed contract stays exactly as signed. Stale language gets replaced at
renewal, not retroactively.

---

## 2026-07-25 · Lifecycle management: obligations come from the clause, never from reading the contract

**Decision.** We are adding the lifecycle system (see
[`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md)). Its foundation: what a contract obliges
us to do is recorded **on the approved clause itself**, written by Legal when the clause is
approved. Registering a signed contract is then a lookup, not an interpretation.

**Why this is the whole point.** Most contract-management products read finished contracts and
guess what they mean. We never have to. Every sentence in our contracts got there by referencing an
approved clause, so we already know precisely what we committed to. No software is ever asked to
read a contract and decide what it requires.

**Consequence to plan for.** Legal has to write those obligations onto the clauses. For a
500-clause library that is a real backlog, and it is the main cost of this decision.

**Deliberately excluded.** Contracts written on the other side's paper have no approved clauses
behind them, so they cannot be registered automatically. Including them would import exactly the
guesswork we are avoiding.

---

## 2026-07-25 · Fix the software, not the demo

**Decision.** Eight defects were found and all eight were fixed in the working prototype rather
than documented and left.

**The two that mattered most.**

1. Retired and expired clauses could still be chosen for a new contract. The safety switch worked
   for standard boilerplate and not for the risk-driven clauses — the ones that matter.
2. The check that stops the AI inventing a risk category would silently let everything through if a
   configuration file failed to load. It now refuses and falls back to the rule-based method
   instead.

**A judgement call worth recording.** Fixing the expiry clock revealed that 54 of our 102 sample
clauses have no approval date recorded at all. The old code invented one, which made them look
expired. We chose **not** to invent dates in software. Those clauses are now flagged as missing
their paperwork. Filling that in is Legal's job, and hiding it in code would only have buried the
problem again.

---

## 2026-07-25 · A protection that worked by accident is not a protection

**What happened.** While building the concession record, our test proved that a
read-only Viewer could not see concession data. It passed — but for the wrong
reason. The rule was tripping over an unrelated permission on a different table,
not actually enforcing "viewers may not see this."

Had anyone later adjusted that unrelated permission, the most commercially
sensitive data we hold — the record of what we concede under pressure — would
have become visible, and the test would still have said everything was fine.

**Why it was caught.** Not by the tests. By the deliberate practice of breaking
each protection on purpose and checking the tests notice. That practice has now
caught three faults the normal tests missed.

**Decision.** Keep doing it, and treat "the test passed" as a weaker claim than
"the test failed when we broke the thing it guards."

---

## 2026-07-25 · Contradiction rules are written by lawyers, so they are data

**Decision.** Following the decision that attorneys own the contradiction rules,
the rules are now stored as data rather than written as software.

**How it works in plain terms.** Lawyers label approved wording with short tags —
"this clause is governed by New York law", "this indemnity is uncapped", "this
covers regulated data". A rule is then a simple statement about those labels:
*"warn if two clauses name different jurisdictions"*, or *"warn if we handle
regulated data and carry no cyber insurance"*.

**Why this matters.** No rule ever reads contract wording and interprets it. It
only checks labels a lawyer applied deliberately. That keeps the same discipline
as everything else: judgement is recorded by a person, and the software only
counts.

**The deliberate limitation.** The rule language has exactly three building
blocks and nothing else — no calculations, no conditions, no logic. All four
rules in our specification are expressible with them. If counsel needs something
these cannot say, we add a fourth building block on purpose. An open-ended rule
language would just be programming with no approval step in front of it.

**Also decided.** Rules are versioned and cannot be edited once published, and
every warning names the exact rule version that raised it. Editing a live rule
would rewrite the record of why past contracts were blocked.

---

## 2026-07-25 · A promise you cannot check is not a promise

**The problem found while building.** Our architecture says any assembled
contract must be reproducible years later, given a record of which library
version produced it. We were about to satisfy that by storing a reference number
for the library version.

That does not work, and the reason is subtle. Whether a clause is usable depends
on today's date — approved wording expires. So next year's library is a
genuinely different thing, and the reference number cannot be turned back into
the library it named. We would have been storing a label for something nobody
could ever reconstruct.

**Decision.** We now store the library state itself: which clauses were in play
and, critically, which were usable at that moment. The wording is not copied —
approved wording can never be edited or deleted, so a reference to it is safe
forever. This is the first real payoff from that rule.

**How we know it works.** A test stores a contract, then ages the library the
way three years of legal housekeeping would — retiring clauses, letting others
expire, adding new ones — and confirms the old contract still rebuilds
identically. A second test confirms today's library would give a *different*
answer, so the first cannot pass by luck.

**A flaw this caught.** Our fingerprint of the library included a descriptive
status field that changes whenever Legal retires a clause — but which has no
effect on the outcome. Every stored contract would have stopped reproducing the
first time anyone tidied the library. Removed.

---

## 2026-07-25 · A signed contract is frozen, and we store the signed file

**Correction from Mike.** Some of my wording implied that as clause wording gets
updated it somehow flows through to contracts already signed. That is not how
contracts work and was never the design — but the wording was loose, and loose
wording becomes wrong software eventually. Corrected throughout.

**The rule, stated plainly.** A signed contract never changes. Not when the
library is updated, not when a clause is replaced, not by an administrator.
Renewal produces a *new* agreement. An amendment is a *new* signed document
added alongside the original. Neither edits what was signed.

**The real gap this exposed.** We were storing enough information to *rebuild* a
contract, and treating that as sufficient. It is not, for three reasons:

- A signed contract can contain wording we conceded to the vendor — which we
  deliberately keep out of the library, so it could never be regenerated.
- Signature adds things assembly never saw: signature pages, initials, exhibits
  attached during the negotiation.
- A rebuild is evidence of what we believe was agreed. The signed file is
  evidence of what *was* agreed. Only one of those is any use in a dispute.

**Decision.** The signed file itself is now stored and frozen, with a fingerprint
so tampering is detectable. If a rebuild ever disagrees with the stored file, the
file wins and the disagreement is treated as an incident to investigate — never
resolved by trusting our own reconstruction.

**Proven, not assumed.** Tests confirm that replacing and retiring the very
clauses a contract used leave that contract byte-identical, and that no role —
including the most privileged — can edit or delete a signed document.

---

## 2026-07-25 · We do not use the standard Word library, and the reason is in a test

**Decision.** The document part of the system is built directly on Python's
built-in tools rather than the usual `python-docx` library that our architecture
named.

**Why.** That library cannot read tracked changes. When a vendor sends back a
marked-up contract, the library silently drops both what they added and what
they struck out — precisely the text being negotiated. Reading redlines through
it would mean reading everything except the part that matters.

We keep the library installed for testing only, used the other way round: it
opens the contracts we produce and confirms they are genuinely valid Word files.
Our own reader checking our own output only proves we agree with ourselves.

**The claim is now counted, not asserted.** Every contract we produce is checked
character by character: anything that is neither approved clause wording nor a
short list of declared structural text (the title, the date, section headings)
is flagged. That count must be zero. A second test deliberately removes items
from the allowed list to prove the counter is actually looking.

This turns "no wording is machine-written" from a statement in a footer into a
property the build refuses to ship without.

**Also.** A contract assembled twice from identical inputs now produces a
byte-identical file. Without that, the fingerprint we store against the signed
contract would change every minute and mean nothing.

---

## 2026-07-25 · AI may now draft clauses — and what that costs us

**Decision.** Mike asked for a Clause Library Builder that uses AI to draft
clauses and negotiating moves. That collides directly with the rule the whole
system was built on: *the model never writes contract language.* The collision
is real and worth stating rather than smoothing over.

**Where it lands.** The rule was doing two jobs. At assembly, it stops anything
being generated into a contract — **that half is completely unchanged.** Nothing
a model writes can reach a contract; the check that counts machine-written
characters still returns zero and is still enforced by the build.

The second job was at authoring: wording entered the library only if a lawyer
composed it. That is what changes. AI can now draft a *proposal*; it becomes
approved wording only when a named lawyer reviews and accepts it — the same
approval step that already existed.

**The rule now reads:** no contract language reaches an agreement without a
named human's approval, and the origin of every clause is recorded permanently
— written by a lawyer, drafted by AI, conceded to a vendor, or from supplier
paper.

**The honest cost.** "Zero machine-written characters" was a simple, checkable,
unusual claim. It stays true of contract assembly, but not of the library once
AI-drafted wording is approved into it. The system will compute both numbers.
**Which one we publish is your call** — but quietly keeping the old wording on
the document while the second number is above zero would mislead.

**The risk to watch.** A lawyer reviewing a fluent draft approves faster than one
writing from a blank page. We now measure how often drafts are approved with no
edits at all. That number is the early warning that review has stopped being
review, and somebody has to own it.

---

## 2026-07-25 · Supplier paper is now supported, but quarantined

**Decision.** When the counterparty's template is the base document, AI breaks it
into clause-like pieces so the system can categorise it, assess risk, and offer
alternatives from our library.

**The hard limit.** Those pieces belong to that one agreement. They are never
selectable, never enter our library, and never appear in anything we draft. A
lawyer can deliberately promote one, through the normal approval gate — never
automatically.

**Why it is safe enough.** Every piece keeps a pointer back to the exact text in
their document, so a reviewer can always check the split rather than trust it.

---

## 2026-07-26 · The tests were checking the wrong thing, and that hid four faults

**What we found.** Every test that mattered ran as the database owner. The owner
bypasses every permission rule by design, so a protection could be completely
missing and the tests would still pass. Four separate faults were living in that
blind spot, including one where accepting a supplier's wording into the library
could be done over and over, each time creating another copy, while the system
reported success.

**The rule now.** If a protection is a permission rule, the test must perform the
protected action **as the person the rule names**. Anything else measures the
owner's privileges, not the system's.

**Why it matters beyond the four faults.** We already wrote down once that "a
protection that worked by accident is not a protection." This is the same lesson
arriving from a different direction: a test that cannot fail is not a test. We
built a small piece of machinery so this is now the easy path rather than the
diligent one.

---

## 2026-07-26 · A check caught by the wrong test is a failure, not a pass

**Decision.** Our deliberate-breakage harness — the one that breaks each
protection in turn to prove the tests notice — used to accept "something failed"
as good enough. It now requires the failure to come from **the test that names
the guarantee**. Anything else is reported as a failure.

**Why we changed it.** The first run after the change immediately found two
checks pointing at the wrong test. One of them meant a test we believed protected
our headline claim — that no machine-written words reach a contract — was
actually being carried by a different test entirely. The claim was safe; our
evidence for it was not.

**The cost, honestly.** The harness is now slow — over ten minutes — because it
re-runs whole test suites more than a hundred times. That is the price of the
evidence being real, and it is worth paying, but it means it is run deliberately
rather than constantly.

---

## 2026-07-26 · The audit trail was accusing an honest system of tampering

**What was wrong.** Our tamper-evidence works by chaining records together so
that changing any one of them breaks everything after it. But the chain included
the timestamp *as written text*, and different people's connections write the
same moment differently. Two colleagues checking the same untouched log would get
different answers, and one of them would be told the records had been tampered
with.

**Why that is serious.** This is the mechanism every provenance claim in the
product rests on. A tamper alarm that cries wolf is worse than none — the first
few false alarms teach everyone to ignore the real one.

**Also fixed:** we could not previously detect someone deleting the *newest*
records, because what remained still looked consistent. And buyers could read
each other's concession records in the log — information we carefully hide one
table over.

**Two limits we are stating rather than hiding.** The anchor that detects
deletion is not cryptographically signed, so it constrains staff but not someone
with full database control. And the safeguard against two people writing at the
exact same instant cannot be tested in our current test database.

---

## 2026-07-26 · A machine may propose a concession; it may never settle one

**The contradiction we resolved.** One part of our own specification said the
system could settle a supplier's ask against a pre-approved fallback position
without a human. Another said stepping down to a fallback is a person's recorded
act. Both were written down. The second is right.

**What is built.** Settling at a fallback position now requires the Requester
**and** the assigned attorney, plus whichever approvers are configured for that
contract — leadership, other management, and stakeholder departments such as ISO,
Privacy, Compliance and Risk. It is configurable per contract, and a contract
with no configuration **refuses to settle** rather than waving it through.

**What this costs.** It reduces the scaling claim, and we should say so plainly:
fallback ladders remove the drafting and the research, not the approval. We chose
to write the smaller true claim rather than keep the larger one.

---

## 2026-07-26 · The approval gate now exists, and it watches itself

**What changed.** The Review queue — the single door through which new wording
enters the library — existed only as prose until now. It is built: tickets,
states, a rejection that genuinely requires a reason, and the record of an AI
draft including which model produced it.

**The part worth understanding.** When we allowed AI to draft candidate wording,
we said the safeguard would be measuring how often lawyers approve drafts without
editing them — because a fluent draft is approved faster than a blank page is
filled. That number is now derived from what was actually stored, not from anyone
reporting it, and the original draft is frozen once it is attached to a ticket.
Otherwise the measurement could be made to look perfect by editing the wrong
thing.

**Still yours to decide.** What the number should be. Legal sets it with counsel.
The system measures it and shows it, and must never pick it.

---

## 2026-07-26 · Four decisions we deliberately did not make for you

**Decision.** Where the right answer is a business judgement rather than an
engineering one, we built both paths, shipped a default, and recorded it as an
open question — rather than quietly choosing and moving on.

They are held in the database itself, marked as undecided, so they cannot be
forgotten:

1. **Renewals** — does a renewal open from the last signed deal, or from today's
   standard library? Shipped opening from the signed deal, because that is how
   counterparties actually behave. Both paths are fully built, and whichever is
   used is recorded.
2. **Work orders** — may a work order contradict its master agreement? Shipped as
   "no", the stricter reading.
3. **Database ownership** — how the owner account maps to the five roles.
4. **The unedited-approval threshold** — Legal's, in consultation with counsel.

**Why record them this way.** An open question in a document gets read once. An
open question in the schema gets encountered by whoever next touches the thing it
governs.

---

## 2026-07-26 · The four open decisions, settled

**Renewals open from the deal we actually signed.** Not from today's standard
library. Suppliers expect last year's deal as the starting point, and pretending
otherwise reopens fights we already had. Restarting from standard remains
available as a deliberate, recorded choice.

**The cost we are accepting, stated plainly:** a concession we made once can
become permanent unless somebody reads the comparison report. That report is
therefore the control, and it has to stay in front of whoever opens the renewal
rather than sitting in a menu.

**A work order may depart from its master agreement — with the same approval a
concession needs.** Not never, and not freely. Departing from the master binds
the company to something other than its standard position, which is exactly what
conceding to a supplier does, so it earns the same signatures: the Requester, the
assigned attorney, and every approver configured for that deal.

It is granted **one category at a time**, not once for the whole work order. A
blanket permission gets signed once and then quietly inherited by every later
change to that work order, with nobody looking again. And an authorised
departure is still *reported* — approved is not the same as hidden.

**The AI-drafting safeguard is measured and shown, and blocks nothing yet.**
Legal sets the threshold with counsel, against real data rather than a guess. The
system will never pick that number: choosing what counts as adequate legal review
is content, and content is not ours.

**Where these live.** In the database, as rows marked settled, with the reasoning
attached — not only in this file. A decision in a document gets read once. A
decision in the schema is encountered by whoever next touches the thing it
governs.

---

## 2026-07-26 · The Administrator: a sixth role that runs the machine

**The job that had no chair.** Somebody has to create accounts, grant and revoke
access, keep the operational settings, watch the health of the record, and
connect the integrations. Today that work would fall either to Legal admin —
which mixes machine housekeeping into contract judgement — or to the database
owner account, which is worse, because "the owner is nobody" is already settled
and an act done as the owner has no name on it. So we are adding a sixth role,
the **Administrator**, and Mike has settled the four questions its design asked.

### U5 · The Administrator runs the machine, and may read but never change what it holds

**Decided: accepted, with contract content readable.** The Administrator creates
accounts, grants and revokes roles, keeps operational settings, maintains the
watcher lists, takes checkpoints, and reads the health evidence. The Administrator
**cannot change anything the business cares about**: no writing clause text, no
deciding tickets, overrides or concessions, no changing an owner decision, and —
like everyone else, including the owner — no editing history.

Mike's amendment to the proposal: the Administrator **can read** contract content.
The original design gave the role no sight of deals at all.

**The cost, stated plainly.** The person who administers accounts can read every
deal, manifest, negotiation position and supplier redline in the system. Nothing
in the database stops them, and every read is *not* individually recorded — we
record acts, not glances. What contains this is that the Administrator can change
none of it, holds no vote in any workflow, and cannot grant themselves a role
that would give them one. The boundary we are keeping is **write and judgement**,
not sight. Anyone describing this role to an auditor must say "content-visible,
content-powerless" and not "content-blind" — the ADR is titled accordingly.

### U6 · Access to Legal judgement takes two names

**Decided: accepted as proposed.** A grant of either Legal role — reviewer or
admin — takes effect only when a **Legal admin countersigns** it. The
Administrator proposes; Legal accepts. Until then the grant confers nothing, and
the *database* is what refuses, not the screen — a rule that lives only in the
API is one bug away from gone.

The other three roles — viewer, requester, auditor — the Administrator grants
alone, recorded. None of them can change a contract or decide anything, so a
second signature would buy control nobody needs and slow down every ordinary
joiner.

**Why this one survived when U5 was relaxed.** Reading everything is a
containable risk; being able to hand somebody the power to approve contract
language is not. This is the check that stops an Administrator assembling a
voice in content by proxy — granting an ally Legal reviewer and having them
approve the Administrator's own requests.

**The cost.** A wait, every time Legal cover is needed in a hurry. That wait is
the control working. A daily nudge to Legal admins keeps it short, and the
countersign queue appears in Legal's own workspace, not only in the console
where Legal never looks.

### U7 · Checkpoints move to the Administrator, and are revoked from Legal admin

**Decided: move, not share.** Taking an audit checkpoint is machine stewardship —
it proves the record has not been tampered with, and says nothing about any
contract. It becomes the Administrator's duty alone, and Legal admin's right to
take one is **revoked**, not merely left unused.

**Why not hold it jointly during transition.** Two roles holding one duty means
neither owns it, and there is nobody to hold to account for a checkpoint that
was never taken. A shared right also needs an end date somebody remembers to
set. Cleaner to move it once and record the move.

### U8 · Six workspaces replace nine global tabs

**Decided: accepted as proposed.** Each person signs in as a named human holding
one role, and their workspace is built only from what that role's database
connection can actually read. Every workspace opens on *what is waiting on you*
rather than on a menu to hunt through.

Two structural consequences: **deals become the requester's unit of navigation**
— the Intake → Manifest → Forge → Validate → Dossier pipeline stops being five
global tabs and becomes the stages of one deal, so two deals at two stages never
share a rail; and **the blanket acknowledge-and-override button is retired**, as
ADR-0008 already decided, replaced by a request that is socialised, waits out a
window, and is decided per finding.

The visual language of v3 is kept wholesale. This is a reorganisation, not a
restyling — no budget is spent on tokens, type, chips or buttons.

**Where these live.** [`UI-AND-ADMINISTRATION-ARCHITECTURE.md`](UI-AND-ADMINISTRATION-ARCHITECTURE.md)
(the design), [`UI-REIMAGINE-PLAN-2026-07-26.md`](UI-REIMAGINE-PLAN-2026-07-26.md)
(the plan), [`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md)
(the sixteen packages), and a clickable concept at `prototype/v4-concept/`.
U5–U8 are also rows in `cw.governance_setting`, marked decided and naming the
decider, so whoever next touches the thing they govern meets them there.

---

## 2026-07-26 · Signing in lasts hours; the identity stamp lasts one click

**Decision.** Two different clocks, and we had been calling both of them
"sessions", which caused real confusion.

**Signing in** works the way anyone expects: you sign in once and stay signed in
for hours. How long is a setting the Administrator controls.

**The identity stamp** that travels with each individual click down to the
database expires the instant that click finishes. Nobody sees it. It is the
difference between a building pass that lasts the day and a visitor badge handed
back at every interior door.

**Why we chose the disappearing badge.** Most companies put a sharing layer in
front of a database so many users take turns on a few connections — it saves
real money. The danger is that your identity lingers after your turn and gets
mistaken for the next person's. If the badge is surrendered automatically at
every door, there is nothing left to linger.

**What it buys us commercially.** We can run on ordinary infrastructure. The
earlier plan said we could not, and would have had us telling customers to
configure their systems specially. That was wrong.

**What it buys us technically.** There is no clean-up step that anybody could
forget to write, because the database removes the stamp itself. The earlier plan
proposed six separate sets of connections purely to avoid that forgettable
step — no longer needed, so there is less to build and less to run.

**The one discipline it requires.** Every click must be handled as a single unit
of work. That is ordinary practice, and it is checked by a test that deliberately
reproduces the leak: use a connection as one person, hand it back, take it out
again, and prove it has forgotten who that was.

**A correction worth keeping.** Two of our own documents still say this system is
"incompatible with transaction-mode connection pooling". That was an
overstatement — it described the setting we happened to use in our test harness,
where it is the right setting, not a limit of the design. Both should be
corrected to say the system assumes one identity per unit of work.

---

## 2026-07-26 · Python is the language the system thinks in

**Decision.** From today, every new piece of the service — every endpoint, every
rule, every check — is written in Python. JavaScript keeps one job: drawing the
screens people look at. The database keeps the rules, as it always has.

**Why now.** We had been building the same system twice without meaning to. The
half that decides things — 4,604 lines of tested contract-checking logic — is
Python. The half that answers the screens is JavaScript. The two halves cannot
call each other, so the tested half currently has no caller at all. Every hour
we kept adding to the JavaScript side, the bill for joining them went up.

**What this costs.** The existing JavaScript service (52 endpoints, roughly 900
lines) gets rewritten in Python and then deleted. That is real work, and it is
work we would rather not do. It is still cheaper than the alternative, which is
maintaining a permanent translation layer between the two halves forever.

**What this does not touch.** The screens (2,701 lines) stay exactly as they
are — they are already in the right language for their job. The database test
suites (~4,000 lines) stay in JavaScript and stay green; they test the database,
which behaves the same whoever is asking.

**What it buys.** The contract engine finally gets a caller. That is the whole
point: the tested half of the product starts doing its job.

**The one thing that had to happen first.** A second session was still adding
JavaScript endpoints for the remaining screens. Told, so the redo pile stops
growing. Database migrations continue unchanged — both languages share them.

**Where the work is written down.**
[`PYTHON-REVISION-PLAN-2026-07-26.md`](PYTHON-REVISION-PLAN-2026-07-26.md) (the
reasoning) and
[`PYTHON-WORK-PACKAGES-2026-07-26.md`](PYTHON-WORK-PACKAGES-2026-07-26.md) (six
packages, in order).

---

## 2026-07-26 · The Administrator cannot read the clause library, and should

**What we found.** You settled in decision U5 that the Administrator may *read*
contract content while writing none of it and deciding nothing — and said in
terms never to describe the role as content-blind. Against the clause library it
currently is exactly that. The Administrator can read signed agreements, but has
never been given the right to read the library of approved wording, the fallback
ladders, or the health of either.

**Why it happened.** The library was built long before the Administrator role
existed, and the list of who may read it was never revisited when the role was
created. Nothing was decided wrongly; a list was simply not updated.

**Why we did not just fix it.** Two new consolidation views for the Legal admin's
workspace landed today, and adding the Administrator to those would have closed
the gap in the one place nobody would think to look — and would have made two
convenience screens the Administrator's only window onto the library. That is a
new permission wearing a convenience's clothes. The right fix is one line beside
the original list, and it is a decision about the boundary of a role rather than
a technical tidy-up, so it is yours.

**What we need from you.** Confirm that "may read contract content" was meant to
include the clause library and the fallback ladders, not only signed agreements.
If yes, it is a small change. If no, then U5's wording should be narrowed to say
so, because as written the two do not agree.

---

## 2026-07-26 · A test that cannot fail is not protection, and we found one

**What happened.** Our rule is that every guarantee gets a deliberate attempt to
break it, to prove the test guarding it actually notices. Writing those attempts
for two new views, one of them refused to break: the thing the test claimed to
protect turned out to be impossible in the first place, prevented by a rule
written three years' worth of migrations earlier.

**Why it matters more than it sounds.** The test still passed, and would have
passed forever, looking exactly like protection. The only reason we know it was
not is that we tried to break it and failed. A test nobody has ever seen fail is
a claim, not evidence — and this is the second time that discipline has paid for
itself this week.

**What we did.** Kept the test, because it still tells a reader the right shape
to expect, and wrote down beside it that the protection comes from somewhere
else — including the note that if the older rule is ever relaxed, this is the
place that needs a real guard. A missing safeguard and a forgotten one look
identical six months later unless somebody says which it is.

---

## 2026-07-26 · A viewer could read every signed contract. Again.

**What we found.** Six places where the system handed people contract
information they had no right to. The worst two: anyone with a read-only account
could list every signed contract in the business — counterparty, document name,
document fingerprint — and could pull the list of which signed contracts are
missing a signature or a completion certificate. That second one is a map of our
weakest paperwork, and it was available to the most junior account we issue.

Two others exposed the written justification a person gives when asking to
override a legal finding. That is the most sensitive free text in the system:
it is somebody explaining why a commercial deadline should beat a legal
objection.

**How it happened, in one sentence.** We had correctly locked the underlying
records, but a "view" — a saved question the system answers — does not inherit
those locks, and six saved questions had never been given locks of their own.

**Why it recurred.** We closed exactly this hole last week on the reading room
and wrote a long warning about it. The warning did not stop it, because the
older saved questions were written years of work earlier and nothing pointed at
them. We closed the front door and left the side door open.

**What we did beyond fixing it.** Fixing the reported one and stopping would have
left four. So we asked the database to list every saved question a read-only
account can reach, and checked each. That is now a permanent test: it lists 21
today, and it fails if anyone adds a twenty-second without recording why it is
safe. The point is not the list — it is that adding one now forces somebody to
ask the question that went unasked three times running.

**The one we deliberately did not lock, and why it matters.** One of the six is
read by the system itself, to decide whether a statement of work may depart from
its master agreement. Locking it meant the system could no longer see the
approval it was looking for, and it started refusing properly authorised work.
The rule we took from it: a saved question the system consults to make a decision
must answer the same way for everybody. Locking it turns a privacy control into
a correctness fault — and it fails by refusing work that was properly approved,
which is the expensive direction.

**Where it came from.** The other session, porting the service to Python, checked
what these saved questions returned rather than assuming, and reported the first
one. Their report was specific enough to reproduce in a single pass. The other
five were found by asking whether the first had siblings.

**The habit worth keeping:** when you find a fault of this kind, the next move is
to look for its siblings, not to fix it. One of six is not a fix.

---

## 2026-07-26 · The two halves of the product are now connected

**What changed.** The contract engine — the tested half that actually decides
things — has a caller for the first time. Until today it was 4,604 lines of
working Python that nothing in the running system could reach.

**Where the join is.** One check, deliberately: `check_manifest`, which asks
whether every risk category in a manifest is one the library actually defines.
A manifest naming a category nobody created is now refused by the engine,
through the doorway, and the refusal is written into the audit record.

**Why that check first, and why it matters commercially.** A language model asked
to categorise a contract will occasionally invent a category. If an invented
category reaches the rest of the engine, the report says "no clause available" —
which reads, in the one report this product is prized for, as *a gap in our own
library*. Legal would be sent to write a clause for a risk category that does
not exist. Two very different faults:

  · the model invented something        — a fault in the model's output
  · we have no clause for that category — a fault in our library

They go to different people, and one must never be able to wear the other's
clothes.

**The pattern every further connection follows.** Adapt on the doorway's side;
never edit the engine. Pass the engine's own sentence back out unchanged, the
same way the database's refusals are passed through unchanged. Record what
happened. The engine is tested as it stands, and changing it to fit its first
caller would move two things at once.

**One decision worth recording on its own.** Every manifest check is written to
the audit record, not only the refused ones. Recording only refusals made the
permission model incoherent: reading the category list is open to everybody, so
a viewer could submit a manifest and be told it was fine, then be refused with an
unrelated message the moment the model happened to hallucinate. Two different
answers to "may I use this", chosen by the model. Recording both puts the
decision back in the database, where the audit chain's write permission settles
it once. The record is better for it: what crossed the boundary and what the
engine made of it is exactly what an auditor would want.

**The boundary this does not cross.** The system checks that a category *exists*.
Whether the library's content is any good — the right categories, the right
clauses under them — belongs to the people who own the library. The system's job
ends at making the gap visible and giving the responsible person somewhere to act.

---

## 2026-07-26 · We recorded everything about a deal except that it started

**What we found.** The system records every step in a deal's life — when it
changes status, when it is signed, when it is shared, when a hold goes on, when
a renewal opens. It did not record the deal being opened. An auditor could read
the entire history of an agreement except the moment it began and who began it.

**Why that is worse than an ordinary missing entry.** The name of the person who
opened the deal is the field the system uses to decide who may see it afterwards
— their runs, their override requests, their reading room, and six other places.
Every access decision for that person traced back to one field with no record of
who set it or when.

**How we knew it was an oversight and not a decision.** Nothing anywhere records
a choice to leave deal openings unrecorded, and the system already audits the
deal's *status changes*. Recording that something moved from A to B while not
recording that it exists is not a position anybody would take on purpose.

**Fixed.** Opening a deal, and creating a clause category, are now both on the
permanent record. Adding a category matters for the same reason: it changes what
the system counts as covered.

**Who found it.** The other session, building the Python service, needed two
recorded acts for a test, reached for the most obvious one in the system, and
found it was not recorded. They wrote it down and did not act on it, because what
belongs on the permanent record is our decision rather than theirs. That was the
right call and it is the reason the fix is in the right place.

---

## 2026-07-26 · Two sessions, one database, and an hour nearly lost

**What happened.** Our two working sessions were sharing one database. Each
session's tests wipe and rebuild it, so running both at once produced failures
that looked exactly like a broken system: missing tables, half-built structures,
errors pointing at a migration that was entirely fine.

**Why it is worth remembering.** The error message named a specific piece of our
schema and said it did not exist. That is indistinguishable from a genuine fault,
and the natural response is to go and fix the thing it names — which would have
meant changing working code to chase a problem that was not there.

**What settled it.** Running the same tests twice, minutes apart, with nothing
changed in between: 129 passed with 36 errors, then 341 passed with 3 failures.
Results that move on their own are not a fault in the code.

**The habit:** when a failure cannot be reproduced twice, find out what else is
running before changing anything. Fixed by giving each session its own database.

---

## 2026-07-26 · The blocker that wasn't, and the safety net that would have vanished

**The situation.** The other session was ready to delete the old JavaScript
service — the last step of moving to Python — but stopped, because deleting it
looked like it would destroy the tests protecting our screens. The screens are
staying, so that would have been a real loss.

**It wasn't true.** I checked by moving the old service aside and running
everything. The screens' tests do not touch it at all — 61 of 61 still passed.
The apparent link was a comment mentioning it, not actual use. So the deletion
they were bracing for is straightforward, and the rewrite they were budgeting
for does not need doing.

**But something else was worse than reported.** Our verification harness — the
one that deliberately breaks each protection to prove the test guarding it
notices — would not have "partly stopped working". It would have stopped
starting at all, taking down all 197 checks, including the 139 that have nothing
to do with the service. A harness that cannot start proves nothing, and it would
have looked like a broken test rather than a missing file.

**Fixed, and deliberately made noisy.** The harness now survives the deletion,
and reports the 15 affected checks as stale — which fails the build. That is the
intended outcome: **deleting the old service cannot make the bar green.** It goes
red until somebody either re-proves those 15 protections against the new Python
service or removes each one with a written reason.

**Why those 15 matter.** They are the guards on the most dangerous behaviours we
identified: that a request can't act under someone else's name, that sign-in
never uses a privileged connection, that a refusal is never quietly retried to
make a demo work, and that permission decisions stay in the database rather than
being duplicated in code. The new service must hold every one of them. Those 15
are now the checklist for proving it does.

**The general point.** Twice today a plan's dependency list was wrong — once
naming something that would break and didn't, once understating something that
would break badly. Both were settled in minutes by moving a directory and running
the tests. **A dependency list is a hypothesis; running it is the answer.**

---

## 2026-07-26 · The audit trail can only be written one act at a time

**What came up.** The other session, now running on a real database, tested
something we have never been able to test: what happens when two people record a
governed act at the exact same moment. They reported it as a fault.

**What it actually is.** The permanent record is a chain — each entry is sealed
using the entry before it, which is what makes tampering detectable. That design
means entries cannot be written in parallel. If two people act at the same
instant, one waits for the other. The waiting is not a bug; it is the chain
working.

**The part that IS a problem.** They also saw an honest act occasionally fail
outright with an unreadable database error rather than waiting its turn. That
should not happen — the protection meant to make people queue is already in the
code — so something is defeating it. I have given them the specific things to
measure rather than guessing, because rewriting the most safety-critical part of
the system from a description would be the wrong order.

**Why I did not "fix" it.** The error they saw proves two writers held the same
position in the chain at once. The obvious-looking fix — relaxing the rule that
refuses a second entry in the same position — would remove the only thing
standing between an unexplained error and the permanent record quietly gaining
two versions of history. The rule is right; something upstream is wrong.

**A decision you may need to make.** Recording acts one at a time bounds how many
governed acts per second the system can accept. That has never mattered at our
size and may never. It is a property to accept knowingly rather than discover
later, and the alternative — a record that can be written in parallel — cannot be
a tamper-evident chain in the same way.

**Worth noting about our own honesty.** The relevant line of code carried a
comment admitting it had never been tested and shipped "on reasoning alone",
because our old database could not run two connections. That comment was honest
when written and had become false the moment we moved to the new database. I have
corrected it. A note recording a limitation that has since been lifted is its own
kind of misinformation.

---

## 2026-07-26 · The audit trail's numbering was assigned in the wrong place

**What was wrong.** Every entry in our permanent record carries a number saying
its position in the order. That number was being handed out by the database a
moment *before* the entry was actually sealed into the chain — and crucially,
before the mechanism that makes people take turns. So when two people acted at
the same instant, the numbers and the actual order disagreed.

**Two consequences, both measured.** With eight people acting at once, five of
the eight were refused outright with an unreadable error, for acts that were
entirely honest. And when nothing was refused, the record came out numbered in
one order and chained in another — so our own verification declared the record
tampered with, when nothing had been.

**That second one is the serious one.** It is the audit trail accusing an honest
system, which we have been caught by before in a different form. It only appears
when two people act simultaneously, which is why it has never been seen.

**Fixed** by moving the numbering inside the mechanism that makes people take
turns, so position and order are the same thing again. That also means the three
things that read the record — the verifier, the checkpoint, the tamper anchor —
keep working exactly as written rather than each needing to be taught a new rule.

**The trap I avoided, and it was inviting.** The obvious reading was "our
duplicate-prevention rule is too strict — relax it." That rule is the only thing
standing between an unexplained error and the permanent record quietly holding
two versions of history. It was right every time; it was being handed bad input.
**When a safety check fires, ask what handed it a bad value before deciding the
check is wrong.**

**On proof, stated honestly.** Our own test setup cannot run two people at once,
so it cannot reproduce the original fault. What it *can* prove is the mechanism —
there is now a test showing the number comes from the right place. The proof that
the fault is gone belongs to the other session's setup, and until they re-run it
this is a reasoned fix rather than a verified one. I have said so everywhere it
is written down rather than letting it read as finished.

---

## 2026-07-26 · The audit-trail fix is verified, and the speed question is answered

**Verified.** The other session re-ran the failures against the fix. Eight people
acting at the same instant: previously five of eight were refused, now none. The
record previously came out numbered in one order and chained in another, and our
own verification called it tampered with; now it verifies clean. It is a
permanent test on their side, not a one-off measurement, so it will keep being
true rather than having been true once.

**The speed question, answered with a number rather than a shrug.** Because the
permanent record is a chain, entries must be written one at a time — I flagged
that as a property you might need to accept. Measured: **323 governed acts per
second.** For a contract governance system that is several orders of magnitude
more headroom than we need. It stops being a decision and becomes a fact we
checked.

**Worth recording about how the fix was chosen.** Their instinct was to change
how we *find* the end of the chain. Mine was to ask who *reads* it afterwards —
three separate things do, and that approach would have obliged all three to be
re-taught. Assigning the number in the right place instead meant none of them
changed at all. They said plainly they would have shipped the worse fix. Two
people looking at the same defect from different ends is what produced the
smaller change.

**And a correction we made rather than left.** A comment in the schema had said
this exact scenario was "checked and passes". It had been checked — on a database
that could not run two people at once, so it never tested the thing it claimed.
It is now true again, and the comment says explicitly that it is true for a
different reason than it originally claimed. A note that is accidentally correct
is not the same as a note that has been verified.

---

## 2026-07-27 · A near-miss worth more than the bug it nearly hid

**What happened.** A routine edit to a schema file changed its invisible
line-ending characters — a Windows/Unix difference that affects nothing about how
the database behaves. All 23 test suites stayed green. But our safety harness,
the one that deliberately breaks each protection to confirm the test guarding it
notices, matches text exactly. Those invisible characters meant it could no
longer find what it was looking for in that file.

**Why it nearly slipped through.** Only one of the affected checks reported a
problem, because the other happened to exist word-for-word in a second file and
matched there instead. So the report read as almost perfect: one line of warning
in a 198-line list. "198 of 198" and "197 of 198 with one skipped" look nearly
identical and mean completely different things — one is protected, the other has
a protection nobody is watching.

**Caught, fixed, and now written down** as a thing to check whenever a schema
file is edited by a script rather than an editor.

**The wider point, and it is the same one twice today.** Our tests going green is
not the same as our protections working. A test can pass because it was never
run, because it was handed nothing to look at, or — here — because the harness
quietly lost its target. **The count at the bottom of a report is the least
informative line in it.** Read what was skipped.

---

## 2026-07-27 · The safety harness now refuses to run rather than mislead

**Following on from yesterday's near-miss.** Our harness — the one that
deliberately breaks each protection to confirm the test guarding it notices —
used to report a stale check as one warning line inside a 198-line list, next to
a near-perfect score. Technically correct, and the wrong shape: it produced a
reassuring number and buried the thing that mattered.

**Changed so there is nothing to misread.** It now checks every pattern before
running anything. If any is stale, **nothing runs and there is no score** — just
the list of what to fix. The idea came from the other session, who hit the same
problem from the other direction.

**It found four real problems on its first run**, none of which anyone knew
about. In four places the harness was looking for a piece of text that appears
more than once, and it only ever changes the first one it finds. All four
happened to be watching the right copy — **purely by luck of what order things
sit in the file.** Any tidy-up that moved them would have shifted the check onto
the wrong copy, silently, and it would still have reported success.

Fixed so each is unmistakable rather than lucky. All 198 checks still pass.

**Why this keeps being worth the time.** Three separate times in two days, the
thing that looked like protection wasn't: a test that could never fail, a check
that lost its target, and now four checks watching the wrong copy of something.
Each was invisible in a green report. **The value is not in the tests passing —
it is in having built something that can tell us when they pass for the wrong
reason.**

---

## 2026-07-27 · The Auditor's workspace is built; the Viewer's is one endpoint away

**Built.** The Auditor — the role that reads everything and changes nothing —
now has a real workspace: the full record of governed acts with search and
filtering, a spreadsheet export, the review-quality figure, and where the
approved wording came from. Signed in as the seeded auditor and walked all of
it in a browser.

**The design rule it is built around.** The Auditor changes nothing, and the
screen has to *prove* that rather than assert it. So there is not a single
greyed-out button anywhere in it. A disabled control says "you could, but not
now", and sends somebody looking for the conditions that light it up. The truth
is "this was never yours", and the honest way to show a right you do not hold is
to show nothing.

**Still blocked, and it is one small thing.** The Viewer's reading room has no
way to fetch its data. The reading room was built into the database while the
service work was paused, so it arrived after the list of service endpoints was
frozen. I have asked the other session for two, and specifically asked them
**not** to add a way for a viewer to download a copy — that was a deliberate
decision and convenience is exactly how such decisions get undone. Until then the
screen keeps saying it is not built, which is the truthful answer: an empty
reading room would tell somebody they had been shown nothing when the truth is
that nobody asked.

**Two things it taught, both about our own checks rather than the screens.**

First, a tile showed "not available" because it was looking up the wrong name.
On screen that is indistinguishable from the health check genuinely having no
answer — the same failure that keeps recurring here, where something missing
looks exactly like everything being fine.

**Second, and worse: the test I wrote to catch that was itself fooled.** It
looked for a phrase in the code, and the tile's own on-screen wording contains
that same phrase — so the test kept passing while the thing it was checking was
broken. Our harness caught it by deliberately breaking the code and noticing the
test did not object. **That is now six times in three days** that something
which looked like protection was not, and every one was found by attacking it
rather than reading it.

---

## 2026-07-27 · Both read-only workspaces are done

**Closed.** The Auditor and the Viewer — the two roles that change nothing — now
have working screens. Fourteen of our sixteen packages are complete. What remains
is the Legal admin's workspace and a final acceptance pass, and **nothing is
blocked any more.**

**The Viewer's reading room** shows the agreements somebody has shown you, why
they were shared, and the contract itself clause by clause — including who
approved each piece of wording. That last part is the point of the role: being
shown a contract is useless if you cannot see whose language it is.

**Two rules on that screen are now enforced twice, on purpose.** The viewer's
data cannot be requested by name — the screen has no way to ask for a particular
agreement, only to receive what it was given — and there is **no way for a viewer
to download a copy.** That second one was a deliberate decision when the role was
designed: showing somebody a contract and letting them take a copy away are
different acts, and only the first was agreed. Both the screen and the service
now have a test that fails if either rule is broken. Single-sided would have been
worth much less, because the whole risk is somebody adding a convenience later
without reading the decision.

**Something I want to be straight about.** I verified the reading room by its
tests, by deliberately breaking it and confirming the tests object, and by
checking every field it displays against what the service actually sends. But I
have **not** seen it render a real share on screen. The shared development
database does not have the full set of demo people, and creating them would have
risked disturbing the other session's work — which is exactly the collision that
cost us time yesterday. It belongs in the final acceptance pass, and I have said
so rather than letting it read as done.

---

## 2026-07-27 · The Legal admin's workspace cannot be finished, and it is not our oversight

**What I found.** The Legal admin's workspace asks for four surfaces. Each has a
*looking* half and a *doing* half. I built the looking halves — the clause
library with its history and expiry warnings, and the fallback ladders showing
where a negotiation can retreat to. Then I checked what the doing halves need,
and **six of them have no way to reach the system at all**:

- activating, retiring or replacing a clause
- editing a conflict rule
- promoting a concession into the library
- reordering a ladder, or moving its floor
- releasing a legal hold
- destroying a record once its retention period ends

**This is not something we broke.** The list of things the system can do was
frozen months of work ago as the specification for the rewrite, and these six
were never on it. Nobody noticed because this workspace was paused before anyone
looked at it closely.

**Nothing is broken today.** A screen that cannot do something says so, rather
than offering a button that fails. What is affected is the claim: **this package
cannot be called finished**, and the final sweep must not mark it done on the
strength of the reading screens.

**Two of the six need you, not just engineering time.** Destroying a record when
its retention period ends is irreversible, must be refused while a legal hold is
open, and needs the most deliberate confirmation in the product. Replacing a
clause must create a new version with its history intact — never edit the old one
in place, because past decisions were taken against that wording and rewriting it
changes what they meant. Both need deciding before they are built.

**The question for you:** are those six in scope for this piece of work, or does
this workspace close as the reading screens plus a named follow-on?

**Recorded in `docs/open-questions.md` §9b** with the full list.

---

## 2026-07-27 · One system in one language, and the second one retired

**What changed.** The duplicate service is gone. Until today the system had two
of them: one written in JavaScript answering the screens, one in Python holding
the part that actually decides things. The JavaScript one has been deleted.

**What was deleted, and what deliberately was not.**

| Deleted | Kept |
|---|---|
| the JavaScript service (6 files) | all 21 database migrations — the rules |
| its 3 test files | the 20 database test suites |
| | the contract engine, untouched |
| | the screens, not one line changed |

The database test suites stay in JavaScript on purpose. They test the database,
which behaves identically whichever language asks it — rewriting them would
re-prove what is already proven and risk losing detail earned by attacking the
schema.

**Why this was safe to do.** The thirty promises the old service made were
re-proved against the new one before anything was deleted, each with a record of
where it now lives. Two of them are stronger than they were: the system can now
be tested with two people using it at the same moment, which the old database
could not do at all.

**What that new ability found, on its first use.** A defect present since the
first migration: when two people acted in the same instant, one of them was
refused for no good reason, and — worse — the system could declare its own audit
trail tampered with. Both are fixed and confirmed. Nobody had seen it because
nothing could produce two simultaneous users until this week.

**The one thing worth remembering about how this was done.** Everything that
looked like a blocker was checked rather than believed. The last one held the
work up for a day and turned out to be a *comment* mentioning the old service in
a file that does not use it. Reading found the blocker; running the experiment
removed it.

**Where the language decision now stands.** Python everywhere the system thinks.
JavaScript everywhere it displays. The database keeps the rules. All six planned
packages are complete.

---

## 2026-07-27 · A record is never destroyed without a person doing it

**The rule, restated by Mike and recorded here so it stops needing restating.**

A record may be **flagged** as past its retention date automatically. It may
**never** be deleted or destroyed automatically. Destruction happens only when a
named person performs it, deliberately, and the record says who they were.

**This is not aspiration; it is how the system is built,** and the check was made
rather than assumed:

- Nothing scheduled destroys anything. The five nightly jobs are all *checks* —
  they verify the audit log and the stored documents. None of them deletes.
- Being past a retention date is surfaced as a **fact to act on**, not an
  instruction. The Administrator, whose console shows the list, holds no
  privilege to destroy at all — they can only send a reminder that Legal was
  told.
- Destruction is one function, `cw.retention_destroy()`, granted to the Legal
  admin alone. It takes the acting person's name, writes it onto the record, and
  refuses outright while any legal hold is open.

**What is still missing, and it is only the button.** No screen offers the act
yet. Adding one is in scope; adding anything that performs it on a timer is not,
now or later.

---

## 2026-07-27 · Changing a clause means replacing it, however small the change

**Mike's rule, confirmed 2026-07-27.** Any change to approved clause wording —
including a comma — produces a **complete new version**. There is no edit-in-place
of an approved clause, ever.

**Why, in one sentence:** a contract signed last March must still show the exact
words that were approved last March, and it can only do that if those words were
never overwritten.

**What this does NOT restrict, because the phrasing confused things once.** It
places no limit whatsoever on negotiating a deal. Departing from standard
wording on a live negotiation is a normal, supported act with its own approval
path — the fallback ladders, the concession record, and the override request all
exist precisely to make departures happen properly and be recorded. The rule is
about the **library** — the master copy of the company's approved positions —
not about what any individual contract may say.

The library is the filing cabinet of approved language. You may take a clause
out and negotiate away from it with the right approvals. You may not go into the
cabinet and quietly retype the master copy.

---

## 2026-07-27 · Three decisions from Mike, and the old JavaScript is gone

### Records are never destroyed by the system, only by a person (U9)

**Your instruction:** auto-destruction should never happen; only someone with
authority to delete records should have it; that authority goes to the
Administrator for now.

**Half of it was already true** — nothing here has ever destroyed anything on a
timer. But that was a fact about how the code happened to be written, not a rule,
and a fact nobody checks is one somebody can undo without noticing. It is now a
rule with a test behind it: if anyone ever wires destruction to fire by itself,
the build fails and names it.

**The authority has moved** from Legal admin to the Administrator, and Legal
admin's has been **revoked rather than shared.** Two people holding an
irreversible act means neither is accountable for it — the same reasoning you
applied to audit checkpoints.

**This amends your earlier decision** that the Administrator writes no content.
It now performs exactly one content-affecting act: ending a record's life. What
still holds is that it cannot write, alter or approve a single word of any
contract, and holds no vote in any workflow.

**One consequence I fixed:** the health screen told the reader that destruction
was "actioned by Legal admin, who alone may destroy". Left alone it would have
told the one person who *can* act that they cannot.

### Replacing a clause never rewrites what is already agreed (U10)

**Confirmed as you described.** Two of the three parts were already built:
approved wording cannot be edited, only replaced by a new version with the old
one kept; and a signed contract is frozen so nothing can reach it.

**The third part was half-built and is now complete.** Signed contracts were
already flagged when the library moved on from what they carry. **Deals still
being negotiated had nothing** — and that is the worse case, because a signed
contract's wording is settled whereas an in-flight one can still be corrected.
Without the flag, obsolete wording would be signed by mistake with nobody told.
Now both are flagged, and neither is ever quietly corrected.

### The Administrator can read the library (U11)

Done. It was one missing permission, not a missing rule — the rules always
allowed it. No one else's access widened, and the role still cannot write a word
of the library.

### The old JavaScript service is deleted

Gone, with your approval. Before removing it I checked that the fifteen
protections it carried are genuinely re-proved on the Python side — name by name,
not on trust. The Python version has those fifteen plus two more it found on its
first run, so the surface is better watched after the move than before it.

---

## 2026-07-27 · One thing I did NOT do, and need you to decide

You said to give the Administrator "the power to delete document". I have given
it the authority to destroy records at the end of their retention — which is what
your first decision described, and it is now the only role that can.

**But I want to be straight about what that does today: it records the
destruction; it does not remove the document.** The stored contract file is
frozen and nothing anywhere deletes it. So a record marked destroyed still has
its document sitting behind it.

I did not build actual deletion, because the shape of it is a decision rather
than a detail, and the wrong shape is expensive to undo. **The question is what
"destroyed" should mean:**

- **Remove the contents, keep the fact.** The file's name, its fingerprint, its
  dates and the record that it was destroyed all survive — you can still prove
  what existed and that it was properly disposed of, but the text is gone. This
  is what I would recommend, and it is what most retention regimes expect.
- **Remove the whole record.** Nothing survives to show the contract ever
  existed, which also removes the evidence that you disposed of it correctly.

Everything else in this system is built on the principle that the record of what
happened survives. The first option keeps that; the second breaks it.

---

## 2026-07-27 · Ending a record's life is two acts, and the second needs the first (U12)

**Your decision:** the Administrator can remove the whole record, but can
delegate the authority to remove *content while keeping the fact* — and records
handled that way can be reviewed before being removed entirely.

**Built as two unequal acts:**

**Redact** — the content goes, the fact stays. The document's name, size,
fingerprint, dates and its whole history survive; what goes is the text and the
pointer to it. **The Administrator can delegate this** to a named person, with a
stated reason, revocably, and the delegation is on the permanent record.

**Purge** — the record itself goes. **The Administrator alone**, and it cannot be
delegated. It only works on something already redacted.

**The order is the control.** You cannot erase in one step. A record must be
redacted first, which leaves it sitting in a review list, and only then can it be
removed. That is what makes "reviewed" mean something rather than being a hope,
and the database refuses the shortcut even if someone edits the record by hand.

**Three things worth knowing:**

**The audit trail outlives the purge.** After a record is gone, the permanent log
still shows that this contract existed, was signed, was disposed of, and by whom.
That is deliberate — it is what makes offering a purge safe at all, because the
evidence of correct disposal survives the thing disposed of. **But it also means
a purge is not the erasure of every trace.** If the reason is ever a legal demand
to erase a named person, that log is a residual we would have to discuss
separately. I would rather say so than let it read as solved.

**The file outside is not deleted by this.** Clearing the pointer severs our link
to the stored document; it does not reach into the storage system and delete it.
The review screen says so out loud rather than looking clean.

**A purge removes the signed contract and its evidence, not the negotiation
behind it.** Extending it further would cascade through half the system and is a
decision rather than a detail.

---

## 2026-07-27 · A guard I wrote failed open, and the suite caught it in one run

Building the above, I wrote a permission check that **never fired.** An
unauthorised person could have removed content from a record on the first
attempt.

**The cause is worth remembering** because it is invisible on the page: the check
asked "who is calling this?" from inside a piece of code that deliberately runs
with the system's own authority — so the answer was *nothing at all*, and a
comparison against nothing is neither true nor false in a database. It quietly
evaluated to "don't object".

**It was caught immediately** by a test that tried to do the thing and expected
to be refused. Rewritten to ask the *records* who somebody is rather than asking
the connection, and the failing version is now kept as a permanent break-it
check, so it can never return unnoticed.

**Seventh time this week** something that looked like protection wasn't. Every
one found by attacking it rather than reading it.

---

## 2026-07-27 · The sign-in desk could crash under two clicks, and never emptied its drawer

**Found by a deliberate sweep for defects, not by a failure.** All 500 tests were
green when the sweep started; both problems live in the gap the tests were not
exercising — two people acting in the same instant, and time passing with nobody
watching.

**The first problem: two simultaneous requests could crash one of them.** The
service deliberately handles many people at once, but the ledger of who is
signed in was written as if requests arrive one at a time. If two requests
carrying the same just-expired sign-in landed together, both tried to remove the
same entry; the second found it already gone and failed — and the person saw
"the service failed" instead of "please sign in again". Fixed so the ledger
takes one action at a time, and removing something already removed counts as
done rather than as an error.

**The second problem: abandoned sign-ins were kept forever.** A sign-in that
expired was only cleared out when that exact person came back — which for a
closed browser is never. And because signing in currently needs no password
(the deliberate seam where a real identity provider will plug in), anyone who
could reach the service could fill its memory one sign-in at a time until it
fell over. Now every new sign-in first sweeps out the expired ones.

**Both fixes are guarded the way this project guards everything:** each has a
test that fails on the old code — verified by putting the old code back and
watching it fail — and the break-it harness now carries two new checks, one per
guarantee. 20 of 20 caught.

---

## 2026-07-27 · An outage was being blamed on the person at the keyboard

**The rule this system already states for itself:** "you may not do that" and
"we broke" are different facts, and confusing them sends somebody to argue with
their administrator about a bug. The sweep found the system breaking its own
rule in one place: if the **database itself** was unreachable — restarted,
network gone, or too busy to answer — the error fell through the sorting logic
and came out as "your request was rejected". Every person using the system
during an outage would be told they had done something wrong, and because the
answer looked like an ordinary mistake rather than a failure, nothing would
page whoever watches the service.

**Worse, the message carried the machinery's own words** — the raw database
error, naming internal addresses and ports — out to the browser. Same with any
unexpected crash: the reply included the failure's internal details. What a
failure says about the insides of a service is exactly what a stranger probing
it hopes to read.

**Fixed in the one place all requests pass through:** an unreachable database
now comes back as "the service failed — it could not reach its database", the
crash reply says only "the service failed", and the technical detail goes to
the service's own log where it belongs.

**Guarded:** two new tests (both verified to fail on the old code — one makes a
genuinely failed connection rather than a hand-built error), two new break-it
checks. 22 of 22 caught by the test that names each one.

---

## 2026-07-27 · Two ways the printed contract could differ from the approved wording

**Why this matters more here than anywhere:** this system's headline promise is
that every character of contract text in an emitted document is approved
library wording, exactly. The sweep found two ways that promise could break —
both invisible to our own tests, because both only fail inside Microsoft Word.

**First: an invisible character could make the contract unopenable.** When
someone in Word presses Shift+Enter, Word puts an invisible line-break marker
on the clipboard. Pasted into a clause body, that marker is a character a Word
*file* is physically incapable of containing. The document builder would emit
it anyway — producing a file, with a valid fingerprint, recorded as the
executed artifact, that Word refuses to open. The builder now refuses instead,
loudly, saying which character and where — so the problem surfaces as "this
wording needs re-entering" at build time, not as a corrupt contract later.
(Per the product boundary: the system's job is to make the gap visible; fixing
the wording belongs to whoever owns it.)

**Second: a line break in approved wording would silently vanish in print.**
Wording with an ordinary line break survived every check we run — because our
own reader hands it back faithfully — and then Word renders the break as
nothing. The printed wording would not be the approved wording, and no test
could see it. Line breaks are now written as real Word line breaks, and read
back as what they stand for, so the round trip is exact end to end.

**Guarded:** four new tests — one deliberately inspects the raw file bytes,
since this failure hides from anything that reads the document politely — and
two new break-it checks. 51 of 51 caught by the test that names each one.

---

## 2026-07-27 · A door check that could be walked around by speaking another language

**The door in question:** when a vendor sends back a marked-up contract, that
upload is the one place bytes we did not produce enter the system, so the
reader refuses several dangerous shapes outright. One of those refusals — a
declaration that legitimate Word files never carry, historically used to make
a small file blow up into a huge one — checked for the marker **in one text
encoding only.** A file written in a different encoding hid the marker from
the check, while the reader itself, which understands that encoding perfectly
well, went on to honour it. Reproduced before fixing: the hostile file walked
straight past.

**The fix moves the check to the other side of the translation.** Instead of
scanning the raw bytes for the marker's most common spelling, the refusal now
happens inside the reader itself, after the file's encoding has been decoded —
so there is no spelling of it, in any encoding, that arrives unseen. The check
got simpler, not more elaborate: one refusal in the right place replaced one
in the wrong place.

**Worth remembering as a pattern:** this is the same failure our own harness
taught us twice already — a protection that reads the *representation* rather
than the *meaning* is a protection with a dialect it does not speak. The
break-it harness now attacks this guard both ways, plain and disguised.
52 of 52 caught. Today's protection against the blow-up attack itself is the
underlying reader being patched against it; this refusal is the cheap second
line, and now a real one.

---

## 2026-07-27 · A known gap in the rule grammar, recorded months of work ago, now closed

**This one was not discovered — it was already written down.** The database
migration that holds the conflict rules (the attorney-authored statements that
block a contract when two clauses cannot coexist) carries a note: the database
checks that a rule is *shaped* correctly, the engine checks only that it uses
the right *labels*, and the two were left disagreeing because the engine
belonged to another workstream. The note ends "recorded rather than fixed
here." Nobody had picked it up since.

**Why the shape matters, in one example.** A rule whose condition is written
as one piece of text instead of a list of tags is read by the engine letter by
letter — no single letter is ever a real tag, so **the rule never fires.** A
blocking rule that never fires is a safety gate silently failing open. The
opposite malformation — an empty list — makes the rule fire on **every**
contract. Both are quiet, and they are wrong in opposite directions, which is
the worst combination.

**Today it cannot happen through the database**, whose checks are sound. It
could happen to any rule built directly in the engine — in tests, or by the
future rule-authoring screen the architecture already plans for attorneys.
The engine now refuses malformed shapes with the same strictness as the
database, so the two layers agree, and the stale note in the migration now
says so instead of describing a gap that no longer exists.

**Guarded:** five new tests and two new break-it checks — 54 of 54 caught,
170 engine tests green.

---

## 2026-07-27 · A severity downgrade nobody could see, and a test that outlived its purpose

**The downgrade.** When the intake model assesses a risk, only the exact word
"High" counted as high severity. "HIGH" or "high" — the kind of drift a
routine model or prompt update produces — was silently rewritten to Standard.
Every genuinely high risk would get the weaker standard wording, and the run
record would show "Standard" as though the model had said so. Compare how
carefully the same code treats an invented *category*: recorded, with a
reason, because "the model said something wrong" and "we chose this" are
different facts. Severity got no such care.

**The fix keeps the safe direction and adds the missing record.** Severity is
now matched on meaning, not spelling. Anything genuinely unrecognisable
("Catastrophic", say) is still pulled *down* to Standard — pulling an unknown
claim up would let a model's typo block a contract — but the rewrite is now
recorded everywhere the decision travels: in the run record and on the audit
chain, with the model's original words. A downgrade the record cannot see is
a judgement nobody made.

**Separately: I retired a test the other session wrote, and here is why.**
During the move to Python, a test froze the engine against the exact point
where the port began, to prove the port changed nothing — true then, and
certified. But frozen-forever means every legitimate engine improvement fails
it from now on, including this week's genuine bug fixes. The property it
protected belongs to the port, which is finished and in history; it is not a
property of the engine's future. Retired with its reason written where the
test used to be, following the house rule that a guarantee leaves the suite
with a reason or not at all.

**Guarded:** four new tests, three break-it checks updated or added — engine
56 of 56, doorway 22 of 22, all suites green.

---

## 2026-07-27 · Two small honesty fixes at the front door

**A wrong-shaped request was reported as our failure.** Send the service a
request whose body is technically valid but the wrong shape — a list where a
form was expected — and it crashed into "the service failed". The person was
told we broke when the truth is the request was malformed, which by this
system's own rules is a "your mistake" answer, not a "we broke" answer. One
shape check at the door now covers every endpoint at once.

**The sign-in reply carried a number that meant nothing.** It reported when
the session would expire using the service's internal stopwatch, whose zero
point is arbitrary — read as a date, it lands in January 1970. Nothing on any
screen consumed it yet, which is exactly why no test ever caught it; the first
screen to render it would have misbehaved silently. The reply now says how
long the session lasts, which is true on anybody's clock.

**Guarded:** two new tests, two new break-it checks — 24 of 24 caught.

---

## 2026-07-27 · Section 1.10 would have printed before section 1.2

**A defect waiting for the library to grow.** The boilerplate sections that
open every contract are sorted by their section number — but sorted the way
words sort, not the way numbers sort. Alphabetically, "1.10" comes before
"1.2". Today's library has under ten such sections, so nothing has ever
printed wrong; the first library with ten framework sections would produce
contracts whose sections a reader meets out of order, renumbered in that
wrong order.

**Fixed and versioned.** Sections now sort as a reader counts. And because
this system's rule is that any change to the order in which decisions are
made must be stamped — a stored contract-assembly result that no longer
reproduces is indistinguishable from a tampered one unless the record names
the engine that made it — the engine version is bumped, with a dated note.
Nothing recorded to date actually differs; the rule is "the rule changed",
not "we saw a difference", and it is cheap to honour.

**Also worth noting:** the existing order test could never have caught this —
with single-digit fixtures, word order and number order agree. The new test
uses a ten-section library, and the break-it harness now reinstates the text
sort and demands the test notice. 57 of 57 caught, 174 engine tests green.

---

## 2026-07-27 · Four faults on the screens, two of them serious

A sweep of the six workspaces — the first to check every field each screen
reads against what the service actually sends — found four real faults.

**The Legal reviewer's desk crashed on opening any ticket, blanking the whole
workspace.** The desk displays the wording a supplier proposed; the endpoint
feeding it never sent that wording. Reading something that isn't there takes
the entire screen down, so the core review-and-approve workflow was unusable.
Nobody saw it because the demonstration system has no tickets in it. **This is
the same fault as one found weeks ago, one layer further out** — that time the
endpoint asked the database for columns it doesn't have; this time the screen
asked the endpoint for a column it doesn't send. There is now a check that
compares every field the desk reads against the endpoint's own statement.

**The revoke button could revoke the wrong grant, leaving access live.** When
someone holds two roles — normal, since granting a second doesn't remove the
first — the button targeted the *older* grant, while the system grants
authority from the *newer* one. So the revocation succeeded, the dialog
closed, the record showed it done, and the person's access was untouched. An
administrator would believe they had removed access that was still live. Now
it targets the grant that actually confers the access, and the button does not
appear at all until the screen has the information to name it.

**A sentence that stopped being true was being written into the permanent
record.** Every retention reminder logged "destruction is Legal admin's act" —
false since your decision U9 moved that authority to the Administrator and
revoked Legal's. The screens said the same thing, telling the one person who
*can* act that they cannot. Corrected in the log entry and in both screens.

**Two screens rendered a failed lookup as "nothing here."** On the override
surface — the screen whose entire purpose is deciding each finding one at a
time — a failed findings lookup showed the heading with nothing beneath it.
"We could not ask" wearing the clothes of "there is nothing to decide," on
exactly the screen where that matters most.

**One more thing worth recording, because it is the fifth time.** A test
failed on my correction to the retention wording — because the test was
checking for the *old sentence itself*. It had frozen prose that had been
false for weeks. Rewritten to check that the button exists and does the right
thing, with no opinion about its label.

**Guarded:** three new screen checks, all verified to fail on the old code,
and three new break-it checks. 81 screen tests green, 255 endpoint tests
green.

---

## 2026-07-27 · The safety harness was counting crashes as successes

**This is the most important thing found this week, and it is about our own
safety net rather than the product.**

We have three harnesses that deliberately break each protection and confirm the
test guarding it notices. One of the three — the newest, covering the service
front door — scored a check as **passed whenever the test run exited unhappily
for any reason at all.** It never checked *which* test failed, or whether the
named test had even run.

**Why that turned out to matter enormously.** Those checks run several at a
time, each against its own database, and the file said they therefore could not
interfere with each other. That was wrong: some of the setup work is
cluster-wide, so simultaneous runs collide. **Measured today: nine of
twenty-four checks died during setup, before evaluating anything — and all nine
were reported as passing.** Every "24 of 24" I have reported this week included
some number of protections that were never actually tested.

**Three changes, and the order matters:**

1. **A check now only passes if the named test failed on its own assertion** —
   the rule our oldest harness has always applied. Anything else is reported as
   its own outcome, "the suite failed but not through its own test", and is
   treated as a failure.
2. **Collisions are removed rather than tolerated:** anything that comes back
   ambiguous is automatically re-run on its own, one at a time. Eight of the
   nine were traffic jams and resolved immediately.
3. **The ninth was real.** A protection about binding a person's authority to
   their request was watched by a test whose *setup* needed that very authority
   — so breaking the thing made the test error out before asserting anything. It
   proved nothing. There is now a small test that checks the binding directly
   and needs nothing else to work, and the check points at that.

**The honest bottom line: the count is now 24 of 24 and it means what it says.**
Before today it did not.

**Two smaller fixes alongside.** The watchers screen hid its "categories nobody
is watching" warning whenever the underlying lookup failed — so a failure read
as full coverage, on precisely the screen whose job is showing that gap. And
the description attached to the signed-contract table still stated that a
signed agreement can never be changed or deleted by anyone; your decision U12
added exactly two controlled ways, and the description now names both rather
than denying they exist.

**One thing I did NOT change, because it is your call.** Decision U11 granted
the Administrator sight of retention and legal-hold records, but the underlying
permission rules were never widened to match — so the Administrator currently
sees an empty list where they should see the holds. Fixing it means widening who
can read those two tables, which is an access decision rather than a repair.
It is recorded in the open questions for whoever picks it up.

---

## 2026-07-27 · The Administrator is told a record is held, not why (U13)

**Your decision, answering the question above:** *"The Administrator will just
need to be someone who has that level of confidence. It just needs to be
flagged, it doesn't need to explain why."*

**You chose neither option I offered, and the answer is smaller than both.** I
had framed it as "let them read the hold details" or "take the permission away";
you split it. The Administrator sees **that** a contract is held — which is all
they need, because it is the difference between "you may destroy this" and "you
may not" — and does not see **which** lawsuit or investigation put it there.
That belongs to Legal.

**Why this was the better answer.** Widening access needed no justifying, and
nothing had to be granted at all: the flag was already reachable. The permission
that was doing nothing has been removed, so nobody is shown a misleading blank
any more, and no one else's access changed by a single row.

**One cost, stated plainly.** An administrator refused a destruction has to ask
Legal which matter blocked it. That is your intent rather than an oversight —
and worth knowing: the refusal itself does name the matter to the person
attempting the act, so the reason is there at the moment it decides something.
What is withdrawn is browsing the holds at leisure.

**And a check that had to be inverted.** A test *required* the matter to appear
on the Administrator's screen. It was written when that was right; your decision
made it demand the opposite. Now it checks the two things that matter — held and
due look different from each other, and the matter never reaches the screen.

---

## 2026-07-27 · Twenty checks that policed wording, removed

**Your instruction: stop writing checks that police content.** I counted first:
**1,107 checks across the whole system. 55 test nothing but wording. Another 222
use wording to stand in for something they could check directly. 830 are sound.**

**Twenty of the worst are gone**, chosen for danger rather than for the count.
Four whole checks retired because their entire content was "the screen must
contain this sentence" — each promise they claimed to protect is enforced by the
system itself and proved where it lives. Others rewritten to check the thing
they were circling: whether a screen reads the right field, whether a decision
can only be taken one at a time, whether a rejected item is visually
distinguishable from an approved one.

**The one that was actively dangerous.** A check banned the word "force" in
every button and label on a **contracts** screen. The first button mentioning
*Force majeure* — an ordinary clause category — would have stopped the build.
And the reverse: renaming a button while leaving the machinery behind it intact
would have passed. It was worse than having no check at all.

**One file argued for the practice in writing** — a comment saying the screen's
own wording "IS part of the test, and that is the point rather than decoration."
Its wording checks had already been rewritten once to chase your U9 decision.
Removed, with a note explaining why that instinct was wrong.

**What is left, and it is one pattern.** About 140 of the remaining 222 are the
same thing: a test that provokes a refusal and then checks the refusal's English
sentence. Fifty-four of their siblings already check the *name of the rule* that
refused instead, which never needs revisiting when wording changes. Giving each
rule a stable code finishes almost all of it. Written up in
`CONTENT-CHECKS-CLEANUP-2026-07-27.md` with the counts and the list.

---

## 2026-07-27 · The doorway learns to hand over a file

**What changed.** The service could only ever answer with a record — names,
numbers, lists. It can now hand back a document as a document: the bytes
untouched, named so a browser saves it with a sensible filename, and measured so
the browser knows when it has all of it. It can also read one named parameter out
of a web address, so a screen can say *which* contract it wants.

**Nothing uses either yet, on purpose.** Both live in the two files every single
request passes through, and the safest time to change those is when nothing
depends on the change. Every existing answer is now *proved* to arrive exactly as
it did before, rather than assumed to have survived.

**One decision worth recording: the contract is named in the address, not in the
request body.** Asking for a document is reading, and the address says so. The
alternative — putting it in the body — would have filed a read under the
machinery that exists for writes, erasing the one distinction those two files
exist to draw. The alternative is written down beside the choice, because it does
work and a later owner may prefer it; switching costs three deletions and no
migration.

---

## 2026-07-27 · Assembling a contract, wired up but recording nothing

**What changed.** A person can now submit a manifest and get back a real
assembled contract — which clause was chosen for which risk, why, what the
conflict rules found, whether the gate is open, and how many rules were even
consulted. It is the first time the two halves of the product have spoken to each
other about actual work.

**It stores nothing, and the answer says so.** Every reply carries `recorded:
false`. Recording is the next step, deliberately separated: the question of *who
may do this* is settled here, where there are no stored rows to hide a mistake
behind.

**Zero reads as zero.** A contract assembled against an empty rulebook comes back
saying nought rules were consulted. That is not a clean run, it is an unchecked
one, and the screen must be able to tell them apart.

**An empty library reports a gap, it does not fail.** Ask for a contract when no
clauses exist and you get a full report saying, for each risk, that there is
nothing to offer — in the engine's own words. Nothing is invented and nothing
reads as a system fault. The plan called for a loud refusal here; that would have
dressed a *library* gap up as a *product* failure, which is the boundary you set
on 2026-07-25.

**A fact in the plan was out of date, and the check found it.** The plan said an
Administrator would be stopped at the clause library. Your own U11 decision had
already given that role sight of the library. They are stopped one step later,
at the **conflict rules**, which U11 deliberately did not open. The outcome is
the same — an Administrator cannot assemble a contract — but the reason is
different, and a comment saying the wrong reason is how the next person gets it
wrong too. Both the check and the code now say the real one, and name your
decision.

**Not one line of this decides who may do anything.** No role is named, tested or
branched on anywhere in the new code. The database refuses, in its own words, and
those words are passed straight back.

---

## 2026-07-27 · A run belongs to a deal, and the run screens stop showing everybody everything

**Assembled contracts are now recorded** — the library as it stood, the rules as
they stood, the run, its decisions and its findings, all in one act. If any part
of it fails, none of it lands: these records can never be deleted, so a
half-written one could never be tidied away.

**Three things the database was not doing, and now does.** Migration 0025.

**One — a requester could record a run against anybody's deal.** Your settled
decision says every run belongs to a deal; there was no rule behind it. The rule
that decided *who may record a run* checked only what job you hold, never whose
deal it was. Now a requester may only run against their own deals. Legal may
still run against any deal, which is their job.

**Two — and closing that alone would have achieved nothing.** The same hole
existed one table over: a requester turned away from someone else's run could
still bolt decisions and findings onto it, permanently. Both are closed
together, because closing one without the other is a locked door beside an open
window.

**Three — the two run screens showed every run to everyone who could open them.**
Not a permissions bug in the usual sense: a screen built on top of a protected
table does not inherit that protection, and this is the fourth time this system
has been bitten by exactly that. Both now ask who is looking.

**Deliberately left alone: the Administrator.** That role can read every run's
underlying rows but neither of the two run screens. Closing it is one line, and
it is not ours to write — it is a decision about what the Administrator is for,
and burying it inside a technical migration would put a new control in the last
place anyone would look. Written down, with the one line, for you.

**A fix in the plan was half a fix, and would have failed in production.** The
plan handled repeat records on the two parent tables. That moves the problem one
table along rather than removing it: the second attempt writes the parent
harmlessly and then trips on the very next row. Under two people submitting at
once, one of them would have been told their contract was *rejected on its
merits* — because nothing had changed since the last run. Now handled on all five
tables, with one rule instead of two, and a check that fails if anyone puts it
back to two.

**A check was retired honestly rather than kept for the count.** One check
guarded "record the attempt before consulting the engine." Once runs are stored,
a viewer is stopped twice over, so breaking that ordering no longer shows up
anywhere a test can see. It now guards what it can still see — that a refused
call still leaves a trace — and the old claim is written down as retired, with
why. A check that cannot be seen to fail reads as protection and is not.

---

## 2026-07-27 · The contract comes out as a file, and has to earn it first

**You can now download the assembled contract as a Word document.** It is the
first thing this service has ever handed back that is not a list of records.

**No document comes out of a run that cannot prove itself.** Before a single
byte is built, the endpoint rebuilds the library that run was taken against and
re-runs the decisions. If either comes back different, it refuses and names both
figures — the one stored and the one just computed. A contract that cannot be
shown to follow from an unchangeable record is not a weaker contract; it is a
different one wearing the same name.

**The date on the document is the run's own date, not today's.** Without that,
the same unchangeable run would produce a different file tomorrow, and two
entries in a record that can never be corrected would legitimately disagree
about which file it was. Now a run's paper is identical forever, and the record
can name its fingerprint honestly.

**One instruction in the plan carried the wrong reason, and the wrong reason was
dangerous.** It said not to re-run the trust-boundary check on the stored
manifest, because doing so would empty a field. That is false — and anyone who
checked would find it false and "fix" it. The real reason is the opposite way
round: re-checking against TODAY's category list would silently drop a risk that
was perfectly legitimate when the run was recorded, change the result, and make
the download refuse. It would report "this contract does not reproduce" when
what actually happened is that Legal retired a category. That is the one thing
this refusal must never mean. The true reason is now written beside the code.

**An auditor cannot download a pre-execution contract.** Producing one writes a
line to the record, and auditors deliberately cannot write to the record. Rather
than open a side door around the caller's own connection — the exact privileged
path this whole layer exists to make impossible — it stays refused, written down,
with a test. Reversing it is a one-line permission change, not code.

**Two conditions the schema makes untestable, recorded rather than faked.** A
stored contract clause with no wording behind it, and a pinned ladder with no
rungs, can both be refused correctly — but neither can be created by any act the
system permits, because clause wording is immutable and never deleted. The checks
prove the wiring using the engine's real sentence and say plainly that the
condition cannot be reached through the front door.

---

## 2026-07-27 · Signing a contract is now a governed act with three gates

**Filing an executed agreement used to be something only the database owner
could do, by hand.** It is now an endpoint anyone in Legal can use, with the
database deciding who may — a requester, a viewer and an auditor are all turned
away, and not one line of the new code mentions a role.

**Three checks stand between a run and a signature, and all three run before the
record freezes.** That ordering is the whole thing: filing the agreement moves
the deal to "executed" by itself, and a check placed after that would pass
forever without ever being wrong out loud.

**One — the run must belong to the deal being signed.** Nothing in the database
tied them together, and Legal may assemble against any deal. Without this check
Legal could sign deal B while citing deal A's assembly — permanently, with the
record calling it legitimate.

**Two — every clause must still be one the library would choose today.** This is
the deviation flagged earlier and it is now built: the plan asked only about
expiry dates, which turn out to be untestable because an expired clause can never
get into a contract in the first place. The check asks the broader question, and
it deliberately still allows a clause that has a replacement but is permitted to
keep being used — the library would still choose it, so refusing would be a false
refusal on the one act that cannot be undone. Both directions are tested, and the
allowing one is the test that stops a later author "tightening" it into a bug.

**Three — a blocked contract may only be signed if every blocking finding was
individually approved.** The obvious place to look for that answer is a column on
the run marked "overridden". That column is wrong: it is written once and can
never change, so a check reading it would leave every blocked contract unsignable
no matter what Legal approved, and the entire override workflow would end in a
filing cabinet. The check reads the approvals themselves. A test proves the
column is still false after a successfully approved signing, which is how we know.

**Both directions of that gate have their own check.** A gate that refuses
everything would pass a test that only proves refusal. One check breaks the
approval lookup specifically, so the "yes" half is guarded too.

**The signature certificate's actual file is refused, with a reason.** The
document store does not exist yet, so there is nowhere to put it. A caller who
sends one is told; silently dropping it would leave them believing it was filed.

**And the reading room finally has something in it.** A counterparty shown a
signed agreement can now see its wording — the first time that screen has ever
returned a row, and it does so off a real assembly, not a fixture.

---

## 2026-07-27 · The screens finally do what the rail has been promising

**A requester can now, on one screen: say which risks are in scope, check that
list, assemble the contract, read what was selected and why, download it as a
Word document, and ask for an override on whatever blocked it.** Until today
every one of those was a stub or a typed-in box.

**Checking and assembling are two separate buttons, deliberately.** Checking
records nothing. Assembling records something that can never be edited or
removed. Learning that a category was invented AFTER making a permanent record
is a worse way to learn it, so assembling stays unavailable until the check has
passed.

**The categories come from the library, not from a list on the screen.** A
category this page invented would be refused by the trust boundary, and the
person would be told a model hallucinated when in fact the screen did.

**The override form no longer asks people to type a reference.** It ticks the
findings that actually blocked the run. This matters more than it looks: that
reference is what the signing gate matches an approval against, and a typed one
can be typed wrong. A wrong one is not caught when it is written — it is
accepted, decided by Legal, and then covers nothing at the signature, which is
the worst possible moment. One function on each side builds the reference, and
matching at the gate refuses rather than guesses.

**Downloading is split on purpose, and the split is checked.** The transport
fetches the file and shapes a refusal into a sentence; the requester's screen —
and only that screen — actually saves it. A check asserts the transport contains
no file-saving code at all, because if it did, every screen would download by
accident and the rule that the counterparty has no export path would quietly
stop meaning anything.

**Legal's side: read any assembly, and file the signed agreement.** The filing
form asks for the document's fingerprint and the named signatories — your
settled decision — and there is no certificate field, because there is nowhere
to keep the file yet. The gap is shown on screen rather than hidden.

**Filing takes two clicks, and the second one shows exactly what will be
written.** Everything filed is frozen on landing, so a one-click button is how a
typo becomes a permanent wrong fact about a signed contract. A check breaks the
second look and expects the test to notice.

**No permission decision is made on any of these screens.** The buttons are
offered to whoever is looking. The database refuses, and what the person sees is
the database's own sentence. Hiding a button would look like a rule while
enforcing nothing.

**A check tripped on its own warning, again.** The new screen SAYS the signature
certificate cannot be attached yet — that is the gap shown honestly — and a check
searching for the word "certificate" failed on the sentence explaining the very
thing it was policing. Same trap as the "force" ban. The check now looks for a
field and a sent value, which is what actually matters.

**And one check was moved rather than deleted.** A check required the phrase
"not built yet" on the requester's screen. The thing it referred to is built; the
honest fact it guarded — the screen still declares its own gaps — is still true.
It now checks that the gap-declaring component is there and that what it names is
the intake interview, which genuinely is not built. Structure, not wording.

---

## 2026-07-27 · The browser walk — the whole thing, clicked through by hand

**Done in a real browser against a real database, and recorded as manual rather
than claimed as automated.** The screen checks read source code; they prove
shape, not that anything renders. This is the part that proves it renders.

**Set up on its own throwaway database** so nothing in the working development
database was created, seeded or dropped.

**What was actually done, in order, entirely by clicking:**

1. Signed in as the requester. Opened the deal.
2. Chose a risk from the library's own category list, checked it, and watched
   the check unlock the assemble button — which stays locked until it passes.
3. Assembled the contract. The engine ran: the boilerplate Definitions clause
   was pulled in automatically, the data-protection clause was matched, the
   cross-border rule fired, and the gate closed. All of it on screen, in the
   engine's own words.
4. Downloaded the contract. A real file, named by the server, built from the run.
5. Asked for an override. The blocking finding was offered as a tickbox
   carrying its own reference — the exact reference the signing gate matches
   against. Recorded, one person told, window opened, and the screen said the
   finding still blocks.
6. Assembled a second, clean contract. An assembly picker appeared.
7. Signed in as the Legal reviewer. Both assemblies were listed with their gate
   states. Opened one and filed the signed agreement.
8. The filing took two clicks. The second showed exactly what was about to
   become permanent — file, size, deal, assembly, dates, who signed — before
   anything was written.
9. Signed in as the counterparty. The reading room showed the signed agreement
   and its wording, with who shared it and why.

**Checked afterwards in the record, not taken on trust:** one signing event, one
document freeze, one document produced, two assemblies, and the deal moved to
"executed" by the system rather than by the screen. Exactly one of each — no
duplicate written by the endpoint alongside the one the database writes itself.

**No errors in the browser console at any point.**

---

## 2026-07-27 · Three decisions, and one of them turned a defect into a feature

**Your U13 file is landed.** The old check that demanded the Administrator be
able to read *why* a contract is frozen now says the opposite, and a second
check sits beside it proving they can still see *that* it is frozen. The two are
next to each other on purpose, so nobody later reads the absence as an oversight
and puts it back. The whole bar is green for the first time: 21 of 21.

**The Administrator now sees the assembly summaries.** Your words: seeing an
alarm you can't investigate is worse than either alternative.

**And that fix had a trap in it that this system has already paid for once.**
The obvious change is a one-line permission. That alone would have been *worse
than the gap*: the summaries were narrowed last week to answer only people they
recognise, and the Administrator was not on that list. Grant the permission
without adding them, and every request succeeds and returns nothing — the screen
telling the one person who can see every alarm in the company that no contract
has ever been assembled. That is exactly the legal-holds failure you settled
with U13: an inert permission, so the system *filtered* instead of *refusing*,
and an Administrator was shown "No holds are open" while a hold was open. The
change does both halves, and the checks now count rows rather than checking for
an error — because "no error" is precisely what the broken version reports.

**COLLEAGUES SEEING EACH OTHER'S WORK IS NOT A DEFECT — IT IS THE POINT.** Your
decision, and it inverts what was reported to you. Cover matters: a buyer on
holiday should not take their deals offline with them, and a colleague picking
one up should not need an access request. The five screens flagged as leaking
were doing the right thing by accident. Nothing was narrowed.

**Why:** this reverses the instinct that any unscoped screen is a bug. The
question is not "can somebody see this" but "should a colleague be able to cover
for them". Confidentiality becomes the exception a person chooses, not the
default the system imposes.

**How to apply:** openness is the default; hiding a deal is an explicit act.
Before that can be built, four things need Mike: who may mark and unmark a deal,
and whether unmarking is recorded the way every other reversal here is; whether
Legal, the Auditor and the Administrator still see a hidden deal (almost
certainly yes — the Auditor's whole job is that nothing is invisible); whether a
colleague sees nothing at all or sees "confidential", because a silent
disappearance means somebody covering cannot tell a hidden deal from one that
does not exist; and whether marking a deal covers the concessions and positions
underneath it. It is a new capability across the deal record, every deal list,
and the negotiation family — its own plan, not a scoping fix.

**One consequence flagged and deliberately not acted on.** The same principle
argues against a narrowing that predates all of this: a requester sees only
their own assembled contracts, because the run table has said so since 0005. The
recent change made the two new screens *obey* that rule rather than bypass it —
it did not invent it. If openness-with-an-opt-out is the house rule, that rule is
a candidate to go too, and widening who sees every assembled contract in the
company is a decision rather than a tidy-up.

## U14 — D-4 draft-record fields — SETTLED (except one) 2026-07-27
Mike answered the D-4 session sheet (docs/D4-DRAFT-RECORD-SESSION-PREP-2026-07-27.md §7):
F1 edit-quality figure on the TICKET, never empty; F2 intended purpose, F3 known limitations,
F4 model performance all on the DRAFT, never empty, fixed/frozen at creation or use. "Never empty"
overrides the empty-for-old-records recommendation because development data is synthetic and
rebuilt — old records do not survive into production. 1.3 (database-computed vs caller-supplied
for F1) DEFERRED pending plain explanation, provided same day. Scope confirmed: four fields only.

## U14a — Risk-exposure score — NEW, recorded 2026-07-27
Mike wants an AI-calculated "risk exposure" score: baselined on the original clause, estimating
the % of risk transferred from supplier to customer by accepting a concession. Recorded as a
separate question per the D-4 scope rule — belongs to round analysis (plan WP-3 / package NC-17)
as an advisory estimate, never a decision, never caller-supplied. Not a draft-record field.

## U14 addendum — D-4 CLOSED 2026-07-27
1.3 settled by Mike: DATABASE-COMPUTED. The edit-quality figure is calculated by the database at
the moment of approval; whatever the calling software supplies is ignored and overwritten — the
same rule as edited_before_approval. All twelve D-4 questions now answered; NC-11 unblocked.

## U14b — F1 kept, with its meaning stated 2026-07-27
Mike challenged the edit-quality score twice (meaning-blind arithmetic; added words) and then
ruled: KEEP it. For the record: the figure measures how far apart the AI text and the approved
text are — additions count as much as deletions — and it claims only "a person worked on this,"
never "the meaning changed this much." Meaning-level comparison is the AI's job (WP-4/WP-8), and
review-depth-as-judgment may be added later as a separately-labelled AI advisory, not in place of
the measurement.

## U14c — Two AI advisory measurements wanted 2026-07-27
Mike wants BOTH, as features (not maybes): (1) an AI semantic content-difference measurement —
how much the MEANING changed between the AI draft and the approved text (and between our clause
and a supplier's version) — living alongside the arithmetic F1 score as a separately-labelled AI
advisory, never replacing the measurement (U14b); (2) the risk-exposure score (U14a) — AI-estimated
% of risk transferred supplier→customer by accepting a concession. Both are AI judgments: stored
with provenance (model, version, inputs), labelled estimates, never caller-alterable, never
decisions. Semantic-difference attaches to WP-6's metrics surface; risk exposure to WP-3 round
analysis (NC-17). Neither is a field on the frozen draft/ticket record — an AI judgment arrives
after the fact and lives in its own advisory record; the D-4 four-field ruling stands unchanged.

## U14d — Risk exposure covers PROPOSED moves too 2026-07-27
Mike extended U14a: the AI risk-exposure estimate applies not only to an accepted concession
(retrospective) but to every PROPOSED negotiation move — each alternative shown in round analysis
carries an AI-estimated % of risk it would transfer from supplier to customer, before the buyer
chooses. Same judgment rules: advisory, provenance-stamped, labelled estimate, never a decision,
never caller-supplied. Home: WP-3 round analysis (NC-17 area), shown beside the ladder ranking.

## U14e — In-product AI judgment is intended scope, not an open question 2026-07-27
Mike, correcting an over-cautious gate: Clausewerk calling AI judgment inside the negotiation
module was always the intent — it analyzes risk AND drafts recommended language for attorney
approval (the review queue's proposal→named-lawyer flow is the built home for that). D-8 is NOT
"may the product call a model" — that is settled by the plan (WP-3, WP-5). D-8 reduces to
provider selection: which model provider, whose key, one bill. Still owner-named before the
first call is wired, but it is procurement, not scope.

## D-8 — Model provider — SETTLED 2026-07-27
Mike: OpenAI is the model provider for this project's in-product AI judgments, chosen for token
efficiency. D-8 was procurement only (in-product AI judgment itself was settled intent, U14e).
The adapter seam (NC-25) is built provider-thin so this remains one integration point; the key is
Mike's to supply and never lands in the repository.

## S15 — Duplicate media-type fields fail closed — SETTLED 2026-07-28
The HTTP doorway rejects a POST carrying more than one Content-Type field before
reading its body. Which parser handles a request must not depend on which
duplicate field an HTTP hop chooses. This follows the same fail-closed rule
already used for duplicate Content-Length and Authorization fields.

## S16 — Blank query values still count — SETTLED 2026-07-28
The doorway preserves blank query-string values while counting occurrences.
`run=&run=RUN-2` is two selectors and fails closed; a blank spelling cannot
erase evidence that a security-sensitive document selector was duplicated.

## S17 — Decoded NUL paths are caller errors — SETTLED 2026-07-28
Static URL decoding rejects an embedded NUL before filesystem resolution.
Malformed `%00` input receives a bounded 400 response rather than escaping as
an internal service failure.

## S18 — Query identifiers decode strictly — SETTLED 2026-07-28
Query-string selectors use strict UTF-8 decoding. Invalid bytes are refused as
malformed input rather than replaced into a different identifier before an
authorization-scoped lookup.

## S19 — Query percent escapes use one grammar — SETTLED 2026-07-28
A percent sign in a query string must be followed by two hexadecimal digits.
Malformed escapes are refused before they can become literal identifier text.

## S20 — Unexpected database errors are redacted failures — SETTLED 2026-07-28
Only expected database refusals and caller data errors may leave as 4xx
responses. Broken statements and other unexpected psycopg errors are logged
with their diagnostic detail and returned as redacted 500 service failures.

## S21 — Model replies are memory-bounded — SETTLED 2026-07-28
The advisory adapter accepts at most one megabyte from the model provider. It
reads one sentinel byte beyond the limit and records an absent judgment instead
of parsing or retaining an oversized reply.

## S22 — Recursive model JSON becomes an absence — SETTLED 2026-07-28
Excessive JSON nesting from the model provider is handled at both parsing
layers. A RecursionError records an unreadable absent judgment and cannot
interrupt the caller's governed work.

## S23 — Duplicate DOCX parts fail closed — SETTLED 2026-07-28
An uploaded Word archive may not contain the same member name twice. Duplicate
parts are ambiguous across ZIP readers and are refused before any contract text
is selected or parsed.

## S24 — DOCX XML has an element budget — SETTLED 2026-07-28
The streaming Word XML parser refuses document.xml after 100,000 elements as
well as after 256 levels of nesting. A shallow element flood cannot force the
service to finish building an unbounded object tree.

## S25 — Unsupported DOCX ZIP features fail as documents — SETTLED 2026-07-28
Unsupported compression and encrypted ZIP members are malformed Word uploads,
not internal service failures. The document parser translates their zipfile
exceptions into NotADocx at the archive boundary.

## S26 — Redline segments preserve Word line breaks — SETTLED 2026-07-28
Kept, inserted, and deleted runs retain w:br as newline characters when
reconstructing original and accepted redline text. Review cannot silently join
lines the vendor kept separate.

## S27 — Word tabs survive document parsing — SETTLED 2026-07-28
The document and redline readers preserve w:tab as a tab character across
visible, kept, inserted, and deleted text. Displayed separation cannot vanish
from the text Legal reviews.

## S28 — Model scores require finite JSON numbers — SETTLED 2026-07-28
The advisory adapter does not coerce booleans, strings, nulls, NaN, or infinity
into scores. Only a finite JSON integer or float inside the zero-to-one range
can become a recorded judgment.

## S29 — Advisory basis is text, never a stringified object — SETTLED 2026-07-28
The model basis may be text or absent. Objects, arrays, numbers, and booleans
are malformed replies and cannot be converted into plausible-looking stored
explanations.

## S30 — Model provider envelopes must be objects — SETTLED 2026-07-28
A syntactically valid JSON array, scalar, or null is not a provider response
envelope. It records an absent judgment before any object fields are read and
cannot escape the advisory adapter as AttributeError.

## S31 — Model provenance must be nonblank text — SETTLED 2026-07-28
Provider-reported model identity is accepted only as nonblank text. Structured
or scalar non-text provenance cannot be stringified into an audit record; an
omitted field alone falls back to the requested model.

## S32 — Truncated model HTTP replies are absences — SETTLED 2026-07-28
HTTP protocol exceptions, including IncompleteRead, follow the advisory
unreachable-provider path. A truncated response cannot interrupt the governed
request that asked for an optional judgment.

## S33 — Provider authorization never follows redirects — SETTLED 2026-07-28
The model API key is an unredirected HTTP header. Python sends it to the
configured provider endpoint and omits it from redirect requests, including
redirects to a different host.

## S34 — Advisory ticket IDs use bigint input grammar — SETTLED 2026-07-28
Ticket identifiers are 1 to 19 ASCII decimal digits before integer conversion.
Unicode numerals, signs, decimals, and pathological digit strings are rejected
as caller input and cannot become conversion failures.

## S35 — Stored-run reconstruction failures are one refusal — SETTLED 2026-07-28
Missing clause members, inconsistent ladder members, and unknown stored
categories all fail closed as 409 reconstruction refusals before document bytes
are built. None may escape as an internal error or produce partial paper.

## S36 — Malformed stored manifests cannot produce paper — SETTLED 2026-07-28
A run whose stored JSON manifest no longer satisfies the manifest boundary is
non-reproducible. Document generation returns a 409 refusal before resolution
and never emits partial Word bytes.

## S37 — Unprintable approved wording is a document refusal — SETTLED 2026-07-28
XML-forbidden characters in approved clause text return the engine's actionable
UnprintableText explanation as a 409. No document hash, audit entry, or Word
bytes are produced.

## S38 — Execution requires a negotiating agreement — SETTLED 2026-07-28
The executed-agreement insert and the `negotiating` to `executed` status move
are one atomic act. If the agreement is no longer negotiating, the trigger
raises and no immutable execution record is retained.

## S39 — Override socialisation is owner-scoped — SETTLED 2026-07-28
The socialisation definer may bypass row policies only to resolve the complete
audience. Legal may advance any pending request; a requester may advance only
the request they opened. An unrelated requester changes no state and creates no
notification record.

## S40 — Missing-approver helpers preserve deal scope — SETTLED 2026-07-28
Security-definer approval helpers may see complete governance configuration for
fail-closed settlement checks. A requester calling them directly sees results
only for a deal they own; unrelated concession and SOW identifiers disclose no
approver identities.

## S41 — Legal-hold existence preserves deal scope — SETTLED 2026-07-28
The retention path sees every active legal hold. A requester calling the
hold-existence helper sees `true` only for an agreement they own; another deal’s
litigation status is not an existence oracle.

## S42 — Share-existence checks preserve subject scope — SETTLED 2026-07-28
The sharing helper may bypass row policies to prevent recursion, but a viewer
can ask only whether they personally hold the share and a requester can ask
only about an owned agreement. Other people’s sharing relationships are not
probeable.

## S43 — Notification checks preserve subject scope — SETTLED 2026-07-28
The notification helper may bypass row policies to prevent recursion, but a
viewer can ask only whether they personally were notified and a requester can
ask only about a request they opened. Other people’s notification relationships
are not probeable.

## S44 — Records actions bind actor to session — SETTLED 2026-07-28
Redaction and purge actor arguments must equal `cw.app_actor()` before any
delegation or lifecycle check. A caller cannot borrow another person’s records
authority or place another person’s name on an irreversible disposal event.

## S45 — Retention destruction binds actor to session — SETTLED 2026-07-28
The retention-destruction actor must equal `cw.app_actor()` before hold and date
checks. An administrator-role connection cannot place another person’s name on
the destruction decision or its audit event.

## S46 — Renewal opening binds actor to session — SETTLED 2026-07-28
The renewal actor must equal `cw.app_actor()` before ownership and baseline
checks. The session-authorized person is also the person recorded in
`opened_by` and `baseline_chosen_by`.

## S47 — Negotiation history binds actors to session — SETTLED 2026-07-28
Application-role inserts bind negotiation `opened_by`, `baseline_chosen_by`,
round `actor`, and movement `actor` to `cw.app_actor()`. The append-only
commercial history cannot carry a second caller-supplied identity.

## S96 — A case-variant severity is not a recorded rewrite — SETTLED 2026-07-28
`coerced` records rewrites that change MEANING. `"HIGH"` stored as `"High"`
changes spelling only and is deliberately absent, because recording it would
bury the rewrites that did change meaning. Reported as defect B3; withdrawn on
review — `engine/test_manifest.py::test_high_is_matched_on_meaning_not_spelling`
already pins this behaviour, and "fixing" it would have deleted the regression
guard against silent High-to-Standard downgrades that `manifest.py`'s own
comment records as having happened once. Owner decision: change the docstring,
not the code. No behaviour changed.

## S97 — The B1 shape rule lives at the boundary AND as a floor — SETTLED 2026-07-28
Two layers, deliberately, and they are not two copies of one rule.
`writes.refuse_structured` is the single implementation: it refuses a dict or a
list for any field not declared `as_json=True`, names the field, and is imported
by `runs.py` and `executions.py` rather than restated. The branch in
`refusals.classify` is a backstop for a bind site the guard has not reached, and
it says less because it knows less.
The floor is narrow on purpose. Three unrelated conditions raise
`ProgrammingError` with no SQLSTATE (verified, psycopg 3.3.4): a failed
adaptation (the caller's fault), a missing parameter, and a placeholder-count
mismatch. The last two are OUR bugs. Keying on "no SQLSTATE" would have told
callers they made a mistake about our bug — the same failure B1 objects to,
running backwards — so the branch keys on the adaptation message alone and a
test pins that the other two still return 500 `broke`.
Also found: psycopg adapts a LIST to a Postgres array without error, so a list
never raised at all — it would have been silently stored as an array in a text
column. The boundary guard is what catches that; the floor never could.

## S98 — `required_if` adds a condition, it never removes one — SETTLED 2026-07-28
`Field.required_if` used to overwrite `required` rather than combine with it, so
a field declared `required=True` alongside a `required_if` became optional
whenever the condition was false. No live effect — the one field using it
declares `required=False` — but the two read as though they compose. They now
do: `demanded = spec.required or (condition)`.

## S99 — The model call holds no database connection — SETTLED 2026-07-28
`advisory.assess` runs in three phases: read the two frozen texts and close the
transaction; call the model holding nothing; reopen a short transaction to write
the row. Previously the 20-second model call ran inside the caller's open
transaction, so ten concurrent assessments occupied every connection in the
`max_size=10` serving pool and everything else — sign-in included — queued
behind them, then failed with a message blaming the database.
WHAT THE WINDOW MEANS: the ticket may be decided, withdrawn or re-texted while
the model is thinking. The row still stands, because it stores `baseline_text`
and `compared_text` verbatim — it is a judgment about those two frozen texts and
says so in its own columns. If the ticket itself is gone, the foreign key
refuses the insert and the caller gets a classified refusal.
Second belt, independently useful: `MAX_CONCURRENT_JUDGMENTS = 4`, below the
pool's 10, so a slow provider degrades one endpoint rather than the process.

## S100 — Role contention is retried in the migration runner, not fixed in 0016 — SETTLED 2026-07-28
A role is cluster-wide; a database is not. The harness gives every process its
own database, but `cw_app` lives in `pg_authid` outside that isolation, and the
schema fixture rebuilds per test — so migration 0016's `alter role cw_app
noinherit` fired hundreds of times per run and two overlapping runs raised
`tuple concurrently updated` in an unrelated test (defect B9).
DEVIATION FROM THE WORK PACKAGE, recorded because it matters: the package called
for a new migration 0034 re-expressing 0016's statement as check-then-act. That
cannot work. `0016` re-runs from the start on every fresh database, so a later
migration cannot prevent it; and 0016 itself may not be edited, because its
filename is already in every ledger and the edit would be silently skipped
exactly where it was needed. The retry therefore lives in `migrate.py`, keyed on
PostgreSQL's own words and bounded, with anything else still failing loudly on
the first attempt. No migration was added.
MEASURED 2026-07-28, PostgreSQL 18.4: 12 concurrent `alter role cw_app
noinherit` produced 7 failures; 12 concurrent `grant ... to cw_app` produced
none. So the grant needed nothing, and the package's conditional-grant item was
dropped rather than implemented against a problem that does not exist.

## S101 — `prepare()` checks the login rather than rewriting it — SETTLED 2026-07-28
The NOINHERIT check in `setup.prepare()` was already right — it verifies rather
than re-applies — and was simply two lines too late. The password write is now
conditional on `rolcanlogin`, so a repeat `prepare()` writes nothing to the
cluster-wide role. A password cannot be read back from `pg_authid`, so this
cannot be a pure assertion; rotation stays available through
`CW_APP_PASSWORD_RESET`, which makes changing a credential a deliberate act.

## S102 — The lookup identity lives in sessions.py — SETTLED 2026-07-28
`LOOKUP_ACTOR` and `LOOKUP_ROLE` moved from `identity.py` to `sessions.py`, with
their rationale comments, which carry the security argument for why `cw_viewer`
is safe on this path. They cannot live in `identity.py`: that module already
imports `sessions.py`, so naming them there and importing them back closes a
cycle. `identity.py` now re-exports them, so there is one copy of each. This
collapses the five hardcoded `as_person("__signin__", "viewer")` sites in
`sessions.py` to named constants.

## S103 — The five RLS-free tables get a review tripwire, not a behavioural test — SETTLED 2026-07-28
`cw.snapshot`, `cw.snapshot_member`, `cw.snapshot_ladder_rung`, `cw.ruleset` and
`cw.ruleset_member` have no row-level security, and `0005_run_store.sql:301-309`
grants select on all five to the requester and both Legal roles. A behavioural
test asserting a requester cannot reach them CANNOT PASS against correct code —
today a requester can. What ships instead is a source-shape tripwire
(`test_unprotected_tables.py`): each table name may appear only in modules on an
explicit allowlist, so a new file naming one gets read before it merges. This is
a review control and the test says so in its own docstring; it proves nothing
about whether the id reaching the table was resolved through `cw.run`. Real RLS
on these tables remains deferred (WP-012) — it is a schema change with
content-addressed-sharing blast radius.

## S104 — A retired mutation row leaves with a written reason — SETTLED 2026-07-28
`python doorway/mutation_check.py` had been exiting 1 on the untouched tree, and
because the preflight aborts before running anything, ALL 36 doorway guarantees
were unevaluated and `npm run verify` was red on `main` (defect B10). Three rows
were repointed. The fourth — "removing an expired session crashes if another
request removed it first" — guarded a KeyError on an in-memory dict popped by
two requests at once; sessions now live in the database and both expiry paths
delete by predicate, which removes zero rows without complaint. There is no line
left whose mutation reproduces the hazard and the test it named was deleted with
the dict. Owner decision: RETIRED with this reason recorded, not repointed —
inventing a replacement guarantee to keep the count at 36 would be a design
change wearing a repair's clothes. 35 rows, preflight clean.
Both session rows anchor on the comment above their delete, not the delete
itself: the two expiry deletes are byte-identical and a bare pattern would match
twice and mutate whichever came first.

## S105 — A-1 is held, and 0032 is never edited — SETTLED 2026-07-28
Owner decision on the session-key exposure (audit finding A-1): HELD, not fixed
in this pass. Both options were under-costed in the audit. The "minimal"
actor-scoped policy is forgeable — nothing reserves the name `__signin__`, so an
administrator could create an account with it and read every session key. The
"structurally correct" dedicated lookup role BREAKS SIGN-IN at runtime once the
migration lands, because a new role returns NULL from `cw.app_role()` and fails
the account-read policy; making it work needs a further migration widening every
policy phrased `app_role() is not null`. Neither is a clean win, and neither
should be chosen without testing against a real database.
Separately settled: migration `0032` is never edited in place. `migrate.py`
ledgers by filename with no checksum and no re-application path, so any database
where `prepare()` has run since 0032 was written already holds that row and
would SILENTLY SKIP an edited file, while a fresh test database reports green.
Any change supersedes it with a new number. (Checked 2026-07-28 on the local
developer database: no `003x` row present. The rule holds regardless — it is
about what cannot be proven across every developer machine, not about this one.)

## S95 — The screens wear parchment, and the theme is one removable file — SETTLED 2026-07-28
Mike asked for the old-school legal parchment-and-typeset look in place of dark
mode, kept short of garish. This does not reopen decision U8: base.css is still
v3's bytes, untouched, and v4.css is still additions-only. The whole look lives
in ONE new file, `prototype/v4/app/parchment.css`, loaded last in index.html —
it repaints the colour tokens (parchment desk, cream sheets, iron-gall ink,
banker's-lamp green where teal was) and swaps the typefaces (Source Serif for
running text, Courier Prime — the legal typewriter face — for the data face;
Instrument Serif stays). The amber-never-green rule for pending grants and the
red-means-error rule keep their meanings; only the shades changed, and every
status chip was measured at or above ~4:1 contrast on the new paper. Removing
one `<link>` line from index.html restores dark mode exactly. `_style.html`
still shows the dark tokens; it is a reference snippet, not a served page.

## S106 — A-1 fixed by scoping the policy to the sign-in act — SETTLED 2026-07-28
Supersedes the "held" half of [[S105]]; the 0032 rule in S94 still stands.

Migration `0033` replaces 0032's `using (true)` policy on `cw.session` with one
scoped to the ACTOR rather than the role:

    using (cw.app_actor() = '__signin__')

WHY THE POLICY AND NOT THE GRANT. There is only one role to grant to. Sign-in
and an ordinary signed-in viewer both arrive as `cw_viewer` — that is the whole
finding. What distinguishes them is the actor stamped on the connection, so the
policy asks WHICH ACT is in progress rather than which role is asking. The grant
is left alone, and no Python changed.

`cw.app_actor()` and not bare `current_setting`: the bare form RAISES when
unset, so an owner or maintenance path touching the table would 500 rather than
simply match nothing.

THE FORGERY IS CLOSED IN THE SAME MIGRATION, and it had to be — without it the
policy is decorative. `cw.account.person` is an unconstrained text primary key
and `POST /accounts` takes it from the request body, so an administrator could
have created an account named `__signin__` with role `viewer`, satisfied the
policy, and read every live session key through the front door with no error
anywhere. A CHECK constraint now reserves the leading-double-underscore
namespace for identities the system uses. Real people here are email addresses;
all six seeded demo accounts verified unaffected.

THE OTHER OPTION WAS REJECTED ON EVIDENCE. A dedicated `cw_lookup` role returns
NULL from `cw.app_role()`, which fails the `read_all` policy on `cw.account`
(0013:252) — sign-in would break at runtime AFTER the migration landed. Making
it work needs a further migration replacing `app_role()`, after which the new
role satisfies EVERY policy phrased `app_role() is not null` and containment
falls back to table grants: the very weakness the smaller option was criticised
for.

WHAT THIS IS NOT. It does not reduce anyone's access. The exposure ran the other
way — `viewer` is the role held by outside suppliers, and it could read the
administrator's session key and sign the whole company out. A session key is the
credential itself, not a fact about a person, so a stolen one is
indistinguishable from its holder and leaves no audit trail.

Shipped with `test_session_privacy.py`, the audit's own probe kept as a test:
four assertions demonstrated failing with 0033 removed. Asserts row counts and
exceptions, never wording.

GAP LEFT OPEN, recorded rather than quietly carried: `db/test/` has no SQL-side
coverage of `cw.session` at all, and the SQL mutation harness
(`db/test/mutation-check.mjs`) carries no row for this guarantee. The Python
boundary test is what guards it today.

## S107 — The outage mutation row is retired, not repaired — SETTLED 2026-07-28
Defect B11, found on the first run of the doorway mutation harness after its
preflight was repaired ([[S104]]) — the row had been listed as a guard for an
unknown length of time while guarding nothing, invisibly, because the harness
was aborting before it ran anything.

The row mutated `if isinstance(error, psycopg.OperationalError):` in
`refusals.py` and named
`test_refusals.py::test_the_database_being_unreachable_is_not_the_callers_fault`.
It scored MISS.

WHY IT CANNOT BE REPAIRED. Deleting that branch does not blame the caller. An
OperationalError falls through to the generic `psycopg.Error` catch-all, which
also answers 500 `broke` and also keeps the driver's message — hosts and ports
included — out of the response. Both facts the test names remain true. What the
branch actually contributes is a MORE SPECIFIC SENTENCE: "the service could not
reach its database" rather than "the database operation failed". That is
wording, and this repository does not test wording.

So the row was misnamed rather than the code broken: the promise is genuinely
kept, by the catch-all, and the branch is defence in depth on the message.
Retired with this reason on owner decision, for the same reason as the session
delete-race row — inventing something for a row to guard, to keep the count up,
is a design change wearing a repair's clothes. 34 rows, preflight clean.

THE CONDITION FOR ITS RETURN, written down so it is not re-litigated from
scratch: if an outage is ever given its own `kind`, distinct from `broke`, so a
screen can say "try again shortly" rather than "something is broken", that IS
observable and this row should come back guarding it. That was offered and
declined for now — the retryable/not-retryable distinction is a product
question, not a test question.

## S108 — The migration ledger records a checksum — SETTLED 2026-07-28
Closes the gap [[S105]] had to work around. `migrate.py` ledgered applied
migrations by FILENAME ONLY, so a migration edited after it had been applied was
skipped in silence on every database that already ran it, forever, with no
mechanism by which the drift could become visible — a fresh test database would
rebuild from the edited file and report green while production ran the old one.

Proven both ways against a throwaway database, 2026-07-28: with the checksum the
edit is caught and refuses to proceed; without it the edited file is skipped
silently.

WHERE IT LIVES, and why not in a migration. The ledger is `migrate.py`'s own
bookkeeping, not part of the schema being migrated. It cannot be altered BY a
migration, because every migration — including that one — is recorded in it. So
the column is created by the ledger statement itself, with an `add column if not
exists` for installations that predate it.

THE DIGEST IS OVER DECODED TEXT, NOT RAW BYTES. `read_text` performs universal
newline translation, and git converts line endings on this repository, so a byte
digest would report every migration as altered on a fresh clone.
`mutation_check.py` relies on the same property.

WHAT IT CANNOT DO, recorded so nobody reads more assurance into it than it
earns: rows written before the column existed carry no digest and are given one
from whatever is on disk NOW. That establishes a baseline and proves nothing
about the past — a migration edited last week is recorded as correct. The
backfill writes a line to stderr saying exactly that rather than reporting a
clean bill of health it has not earned. Drift is detectable from this point
forward, not before.

Consequence worth stating: the forward-only rule in [[S105]] is now enforceable
rather than merely conventional, and the question "has this migration been
applied here?" can be asked of the ledger instead of by hand.

## S109 — The session table holds a fingerprint, not a key — SETTLED 2026-07-28
Audit finding A-2. `cw.session.token` held the bearer credential VERBATIM. In
memory that was defensible; in a table it is durable — the key was in every
backup, every `pg_dump`, every replica and every console session for the rest of
its eight-hour life, and anyone holding one of those held working credentials
for everyone signed in.

DISTINCT FROM A-1 ([[S106]]), and the two are easy to conflate. 0033 stopped the
wrong ROLE reading this table. It could do nothing about a COPY of the table,
and a backup is a copy. A-1 is about who may read the row; A-2 is about what the
row is worth once read. Both were needed.

Migration `0034` renames the column to `token_sha256` and hashes the existing
rows in place. The rename is not cosmetic: a column called `token` holding
something that is not a token is the kind of lie this schema is careful not to
tell. `sessions.fingerprint()` is the one copy of the rule, used at every site
where a key is stored or looked up — a single site that forgot would put a live
credential back in the table with nothing looking wrong.

NOBODY WAS SIGNED OUT, verified end to end 2026-07-28 against a throwaway
database built at 0033: a session was planted with its key in the clear, 0034
was applied, the column stopped holding the key, and the same key still signed
in. PostgreSQL's `sha256` agrees with Python's `hashlib` byte for byte, which is
what makes that work. This is why doing it NOW was cheap — the same migration
against a customer database with live sessions would have been a forced
company-wide sign-out.

NO SALT, deliberately. A salt defends a guessable secret against a rainbow
table. This secret is 256 bits from the OS entropy source, so there is nothing
to guess and nothing to look up; a per-row salt would only stop the lookup being
a single indexed equality. This is not a password. Token generation was already
correct and is unchanged.

THE TEST THAT CARRIES THIS is not "the column differs from the key" — it is
`test_the_stored_value_cannot_be_presented_as_a_key`. Hashing that left the
stored value usable would merely rename the credential and a backup would still
be a set of working logins. Five of the seven tests in
`test_session_secrecy.py` were demonstrated failing against the pre-fix code.

A CHECK constraint requires 64 hex characters, so a future writer who forgets to
fingerprint fails loudly at the insert rather than quietly storing a live key —
a `token_urlsafe(32)` is 43 characters and is refused.

STILL OPEN and deliberately not bundled: A-3, where expiry rests entirely on a
DELETE whose stated purpose is housekeeping. Moving that sweep to a scheduled
job — a reasonable thing for somebody to do — would silently honour every
expired session. It is a one-line predicate on the lookup and it is a separate
decision.

## S110 — The SQL mutation harness was red on main, for the Python harness's exact reason — REPAIRED 2026-07-28
The 2026-07-28 status report named one remaining unknown: nobody had checked
whether `db/test/mutation-check.mjs` had rotted the way the doorway harness had
(B10). Checked, and it had: the afternoon hardening series (16:31–17:35, the
"Freeze/Bind/Enforce … at rows" commits) edited guarded code in applied
migrations without repointing the harness. Its preflight — correctly — refused
to run anything, so all 218 database protection checks were unevaluated and
`npm run verify` was red on `main` from that moment. Four checks were stale by
preflight; a FIFTH was found only by the run itself, reported MISS.

THE LESSON THAT IS NEW, worth keeping beside trap 5.4a: **duplicating a guard
into a second layer quietly makes the first layer's mutation unprovable.** The
row-enforcement work copied three override guards from the deciding function
into a row trigger. The helper's UPDATE fires that trigger, so breaking either
single copy changes nothing observable — the other copy refuses in its place,
and the harness reports MISS for a protection that is intact but no longer
individually provable. Preflight cannot see this: the pattern may still be
unique (the fifth casualty was). The repair is to mutate what both layers
share (the stored window value, for the window guard) or the LAST line of
defense (the trigger copy, caught by a direct-UPDATE test) — never the
redundant inner copy.

All five checks repointed with reasons written in the file; 218/218 caught by
their named test; baseline 24/24 suites green. Uncommitted, on purpose — the
working tree carries another session's in-flight A-2 work ([[S109]]) and the
owner decides what is bundled with what.

## S111 — Obligations, signature, and notifications: architecture accepted, D-1/D-2/D-3 settled — 2026-07-28
The owner accepted `OBLIGATIONS-ARCHITECTURE.md` and settled its three decisions, each as
recommended:

- **D-1 — the system never says "breach."** It computes and reports **overdue** (date
  arithmetic); breach is a legal claim, so asserting it is a named human's recorded act on
  top of the computed fact, if the organisation wants it recorded at all. This settles LCMA
  open question #2. Cost accepted: no report can say "in breach" unattended.
- **D-2 — DocuSign is the first signature provider**, behind a five-operation
  provider-agnostic seam (send, status, retrieve, void, verify_event); Adobe Acrobat Sign
  is the intended seam-proving second adapter. Build-vs-buy was decided on one fact: a
  completion certificate is only evidence if somebody independent issued it — our own
  certificate about our own contract is self-attestation. Wet-ink manual filing stays.
- **D-3 — notifications are a daily digest at start of business**, with a short
  Administrator-maintained immediate list (socialisation, countersign, envelope
  completion/decline) held as an operational setting, not code.

Also in the accepted architecture, worth remembering because it inverts the LCMA sketch:
**obligation states pending/due/overdue are COMPUTED, never stored** (ADR-0006's precedent
extended) — there is no state-mover job to run, so none to silently die, which is the failure
mode this repository has now caught twice in its own harnesses. Only human acts are recorded:
satisfy (with evidence), waive (full ADR-0008 path), reassign. Registration of obligations
from pinned clause-version templates is deterministic, idempotent, and re-derivable, like the
run store.

Each settled decision becomes a `cw.governance_setting` row in the migration that builds the
thing it governs. Work-package cutting is the next step; not yet done.

## S112 — Commit 1580c77 is four workstreams wearing one label — 2026-07-28
The commit titled "Store a fingerprint of the session key, not the key (A-2)" contains far
more than A-2. Two sessions shared one working tree; the owner instructed this session to
commit its work in logical chunks, and the other session committed and pushed everything
staged — both sessions' work — minutes before that happened. Nothing was lost, but the label
under-describes the contents. What 1580c77 actually carries:

- **A-2** (the other session's): migration 0034, `sessions.py`, the secrecy/privacy tests,
  the Python harness update, `STATUS-2026-07-28.md`, memory entry S109.
- **The SQL mutation harness repair** (this session's): five stale checks repointed in
  `backend/db/test/mutation-check.mjs` after the afternoon hardening series moved their
  anchors; 218/218 green again; the CLAUDE.md rule requiring the harness after any
  migration edit; memory entry S110.
- **The 2026-07-28 feature proposal**: `FEATURE-PROPOSAL-2026-07-28.md`.
- **The obligations/signature/notifications architecture**: `OBLIGATIONS-ARCHITECTURE.md`
  with owner decisions D-1/D-2/D-3 settled; memory entry S111.

Splitting was considered and rejected: the commit was already pushed, and rewriting shared,
published history under a live second session trades a labelling defect for a real one.
This entry is the correction instead.

## S113 — Expiry is a predicate on the lookup, not a side effect of housekeeping — SETTLED 2026-07-28
Audit finding A-3. `person_for` deleted expired rows and then selected by
fingerprint, and the select carried NO expiry condition of its own. So whether
an expired session was honoured rested entirely on the preceding DELETE — a
statement whose own comment calls itself housekeeping, there to stop the table
growing.

Two statements, one of which quietly held the whole expiry guarantee while
describing itself as tidying up. That sweep is an unindexed sequential scan on
every single request, so moving it to a scheduled job is a change somebody will
propose for good reasons — and it would have silently turned every expired
session back on. Verified before the fix: with the sweep skipped, an expired row
came back as a live session.

`LIVE_SESSION_SQL` now carries `and expires_at > %s`. The sweep stays, as
housekeeping, which is what it always said it was.

WHY THE SQL IS A MODULE CONSTANT. The guarantee is only observable when the
sweep has NOT run — with it, the row is gone either way and a test passes
whether or not the predicate exists. So the tests execute that statement
directly against a planted row, which is only honest if it is the same statement
the doorway runs. One copy, named, and the mutation harness points at it.

THIS IS THE B11 TRAP, MET A SECOND TIME AND AVOIDED ([[S107]]). Three things
followed from taking it seriously, and each was caught by asking "would this
fail if the guarantee were broken?" rather than "does this pass?":

  1. The mutation KEEPS THE PLACEHOLDER COUNT and merely makes the predicate
     never bite. The first attempt deleted the clause outright, which broke the
     arity — every test failed on a driver error rather than on the guarantee,
     proving the tests break rather than that they catch anything.
  2. Two of the five tests go through `person_for`, so the sweep deletes the row
     before the lookup sees it and they pass with the predicate neutered. They
     are renamed `test_control_…` and labelled in the file. One of them had been
     named as though it proved ordering it does not prove — shipping that would
     have been the outage row all over again.
  3. The mutation row "sessions never expire" is REPOINTED from the sweep to the
     predicate, and its named test changed to the one that reads a planted row.
     Left pointing at the sweep it would now score MISS, because the predicate
     refuses the row regardless — which is precisely the point of the fix.
     Verified by running that single mutation: caught, and not via a driver
     error.

The sweep inside `person_for` is now guarded by nothing, and that is recorded
rather than papered over: its growth-control job is already covered by the
sweep-on-issue row, and inventing a guarantee for it would be the thing
[[S107]] and [[S104]] both refused to do.

Boundary pinned deliberately: `>` not `>=`, so a session expiring exactly now is
over. The two read alike and the wrong one keeps every session alive one extra
second — invisible, and it only ever surfaces as an argument about clocks.

## S114 — A concurrency test says what it hunts, and hunts it 200 times — SETTLED 2026-07-28
Audit finding D-2, the last one open. `test_the_store_survives_genuinely_parallel_traffic`
had been changed in three ways when the session store moved to the database,
none of them noted:

  1. Its iteration count was cut from 200 to 50. That quartered the chance of
     hitting the interleaving it exists to catch, while the row in the report
     went on saying it was watching. A concurrency test quietly made a quarter
     as likely to fire is worse than one that was deleted, because a deleted
     test is visibly absent. RESTORED to 200, and timed rather than guessed:
     the body costs about five seconds. The reduction bought nothing.
  2. Its docstring lost the sentence naming what it hunts — "any unguarded
     read-check-remove surfaces here as a KeyError or a dictionary-changed-size
     error" — and gained "proves the database correctly handles concurrent
     modifications", which names no failure at all. The original specifics were
     genuinely obsolete (the dictionary is gone), so the fix is not to restore
     them but to name the DATABASE-era equivalents: a deadlock between one
     connection's sweep and another's insert, a unique violation on
     token_sha256 when they race, `tuple concurrently updated`, and a
     connection returned to the pool still inside a transaction.
     A test that does not say what failure it looks for cannot be reviewed, and
     cannot tell you whether it is still looking for the right thing.
  3. The shared `db` fixture created 60 accounts, 58 of them for the exclusive
     use of this one test, under the comment "create users for all tests". They
     now belong to the test that wants them. Fixture setup that provisions for
     one test while claiming to serve all of them is how the next person to need
     `p50` ends up debugging somebody else's file.

HONEST LIMIT, recorded so nobody reads more into it: this is a stress test, not
a proof. It can only fail if a race actually occurs, so a green run means "did
not reproduce", never "cannot happen". That is why the iteration count is worth
arguing about at all.

## S115 — The session table is guarded on the SQL side too — SETTLED 2026-07-28
`db/test/` had NO coverage of `cw.session` whatsoever. Findings A-1, A-2 and A-3
were all found by reading migration 0032 and confirmed with throwaway probes;
nothing in either suite asserted what the policy on that table did, so the suite
would not have caught any of them and would not have caught their
reintroduction.

`db/test/session.test.mjs` closes that: 16 checks covering who may reach the
table, that the trusted actor name cannot be taken by an account, that a raw key
is refused by the column, that an expired row is distinguishable from a live one
by the row alone, and that every other role is refused outright.

WHY IT BELONGS ON THIS SIDE and is not a duplicate of the Python tests. The
guarantee lives in the database. A Python test cannot fail if somebody widens
the policy and never touches Python — which is exactly how A-1 arrived. The
Python suite covers what the doorway DOES; this covers what the database
REFUSES.

Verified to be a guard rather than decoration, the check [[S107]] exists to
insist on: with 0033 removed, four of the sixteen fail. No wiring was needed —
`run-all.mjs` discovers `*.test.mjs`, so a suite is run because it is there
rather than because somebody remembered to list it.

## S116 — The obligations core is built: OB-01–05, OB-08, OB-12 — 2026-07-28
Seven of the fifteen OB packages implemented, tested and mutation-guarded, per
`OBLIGATIONS-WORK-PACKAGES-2026-07-28.md`:

- **0035** templates through the gate (born proposed, no self-approval,
  approved-immutable, retired-terminal, never deleted).
- **0036** registration: deterministic derivation at execution, pinned to
  templates as they stood on the execution date, idempotent by
  (agreement, template, occurrence), coverage gaps reported, re-derivable via
  cw.obligation_rederive(). Termination-anchored duties register UNANCHORED
  (due null) — wiring the termination date is deferred, stated in 0036.
- **0037** acts: satisfy (mandatory non-empty note), reassign (named person),
  breach_asserted (legal_admin only, only on an arithmetically overdue duty —
  D-1's governance row lands here). Append-only, actor-bound, audited.
- **0038** computed states: pending/due/overdue are a VIEW over the calendar
  (ADR-0006 extended) — no state-mover job exists, so none can die. Close
  eligibility computed; unanchored survivors block close (fail closed).
- **0039** waiver RIDES the 0015 override machinery: finding_ref
  'obligation:<id>', socialise, window, decide — only cw.override_passes
  authorises the act. No second approval machine to rot.
- **0040** envelope record (D-2 row lands here): append-only event stream,
  state moves ONLY via the definer trigger (D1 pre-empted), sequence-guarded.
  Hash-equality is NOT the sent-vs-signed test — providers overlay signature
  pages; the record keeps both hashes instead of minting false incidents.
- **0041** waiting-on-you: one definer derivation feeds panel and future
  digest; reads BASE tables (a definer reading scoped views gets nothing).

Verification: 248/248 mutations caught by their named test; all suites green.

**A NEW TESTING LESSON, sibling to S110:** a BEFORE-trigger that looks the
row up under the caller's RLS refuses a NON-OWNING caller before any policy
is consulted — so a widened policy is invisible to a test running as the
wrong person. Found live: two policy mutations reported MISS because
mustNotWrite's fourth argument is an options object, not the actor, and the
tests silently ran as a non-owner. Policy tests must run as the person the
policy would admit, with only the policy left to refuse them.

**Interleave note:** migrations 0035–0038 and mid-flight test states were
swept into the other session's A-3 commit (7a270f7) — same shape as S112.
This commit completes them; nothing was lost.

Still open from the package set: OB-09/10 (outbox + email tick — needs the
doorway quiet), OB-07 (doorway endpoints), OB-11/15 (shell), OB-06/13 (gated
on NC-07), OB-14 (blocked on deployment).

## S117 — Notifications built: the outbox, the address book, and the tick (OB-09, OB-10) — 2026-07-29
The notification service is real. 0042 holds the record half: an append-only
outbox (one SENT digest per person per day is a unique index, not a promise),
an Administrator-maintained address book (the watcher-list shape — a person
who could redirect their own notifications could silence their own countersign
nudges), cw.assert_may_run_notifications() (authority in the schema, never an
`if role ==` in Python), and cw.notification_gap (a person with work waiting
whom no channel can reach, derived from the SAME source as the digest).
doorway/notifications.py holds the tick: derive fresh from cw.waiting_for,
send BETWEEN transactions (B2 — as_person holds one transaction for its whole
block, so the channel call must sit outside it), record every outcome, retry
failures, refuse non-administrators with the schema's words. Three new reads
(/waiting, /notifications/outbox, /notifications/gap) and two address writes.

**D-3's cadence row was NOT added — it already existed.** 0013 seeded
`notification_digest` as an engineering default ('daily'); 0042 SETTLES that
row (value daily_start_of_business, decided_by owner, rationale replaced)
rather than planting a near-duplicate beside it. The
owner-decisions-settle-in-later-migrations pattern, applied deliberately.
Only `notification_immediate_list` is a new row.

**Three tripwires fired and were answered, not silenced:** the Administrator
privilege sweep (allowlist extended with reasons — its third catch), the
operational-settings pin (four → five, with the sentence), and the doorway
read-count pin (33 → 36). Each exists to force exactly this conversation.

**The digest carries references, never content, by construction** — the
assembler is handed kinds, ids and dates from cw.waiting_for and has no
access to clause text; a test proves the ticket's proposed text cannot appear
in the email about it.

Verification after a machine crash mid-gate (Docker restarted): 28/28 suites,
776 doorway tests, 253/253 SQL mutations, 34/34 Python harness checks.

Immediate-on-occurrence sends are the one deliberate deferral: the governed
list is stored and the machinery ready, but the event paths that consult it
(above all OB-13's envelope adapter) arrive with their own packages.

## S118 — Reporting, routing, friction, policy-shift and vendor-paper ingestion (RP-01…RP-05) — 2026-07-29
The reporting plan approved by Mike on 2026-07-29 is built, backend first, as
four migrations (0043–0046), one new doorway module, eight reads, two writes
and three prototype panes. The load-bearing decisions:

**No aggregator store.** Every report figure is a view derived fresh from the
tables the audit trail already guards. The proposal's "materialized view or
read replica" is deferred until a view is measurably slow — a stored aggregate
is a second source of truth able to drift invisibly. Grants are the whole
access control (views run with owner rights — the cw.retention_due precedent):
reports answer legal_admin and auditor only; the administrator runs the
machine and reads none of it.

**Routing (0044) is a claim table plus a predicate, not an assignment
column.** cw.review_ticket stays untouched; cw.ticket_claim is coordination in
the watcher-list shape (one live claim per ticket is a unique index — a race
between two reviewers resolves in the database). The route is derived at read
time from cw.ladder's owner, so reassigning a ladder reroutes every open
ticket with no sweep; escalation is an age predicate against the
review_escalation_days setting, never a timer job (the A-3 lesson).
cw.waiting_for grew a 'review_escalation' arm — 0044 re-creates the function
repeating 0041's arms VERBATIM, and the mutation harness sabotages every file
containing a guard string, so the 0041-era derivation guards stay honest; a
note in mutation-check.mjs says so for the next editor.

**The friction scorecard (0045) groups counterparty names verbatim** — no
vendor master table smuggled in through a report; who may merge two names is
a governance question nobody has decided. The dollar figure is an estimate and
the ROW says so (counts_are='measured', cost_is='estimate…'), multiplying
counts by three visible operational settings — the NC-25 labelled-estimate
rule. Readable by requesters on purpose: intake is the point.

**Policy-shift exposure (0046) is the worklist, never the amendments.** The
proposal asked for auto-generated draft amendments ready to bulk-approve;
there is no amendment-assembly machinery, and a report that writes language
toward an agreement would be a second, weaker path past the trust boundary.
Deliberately narrowed to the exposure list (outdated version / missing
always-include category, per live agreement, computed against the CURRENT
library at read time).

**Vendor-paper ingestion (paper.py) ships the deterministic classifier
first** (ADR-0005): a paragraph matches a category by the category's own
label words; every classified paragraph lands as a review_ticket
reason='supplier-paper', badge VENDOR LANGUAGE, text quarantined in
proposed_text (NC-18's shape). It judges NO severity — whether vendor wording
is under the floor is the reviewer's call at the desk. Bytes are parsed and
released; the report carries the SHA-256; where documents live stays NC-07's
open owner decision. First consumer of App.handle's upload parameter;
QUERY_KEYS grew 'agreement'.

**Tripwires moved with reasons:** read-count pin 36 → 44, operational-settings
pin five → nine, shell tab SPEC + architecture §3 updated together,
deliberatelyShared grew 'routing' and 'reporting'. Three new mutation guards
(claimer binding, live-claim uniqueness, escalation reaching the owner) —
256/256 caught.

## S119 — Microservices declined; scaling is more copies, not more services — 2026-07-29
An outside recommendation (Gemini, 2026-07-29) proposed a five-layer
microservices architecture with an LLM/RAG core. Mike reviewed the reasoning
and closed the question — recorded here so it is not relitigated.

**Why declined.** Microservices solve an organizational problem (many teams
shipping independently), not a performance one. With one small team they cost
every seam and pay nothing. Worse, our entire permission model is enforced in
one place — the database, row by row, with no privileged connection reachable
from a request (db.py). Splitting into services talking over APIs multiplies
the seams where that enforcement can be forgotten; it would make security
harder to scale, not easier.

**How Clausewerk actually scales.** The doorway keeps nothing in memory
between requests — each request signs in fresh and does its work in one
transaction — so horizontal scaling is "run more identical copies behind a
splitter," no code change. The database is PostgreSQL; vertical growth is a
bigger machine long before any redesign. Neither is load-tested yet
(pre-launch, placeholder content); when near real usage, measure instead of
debating.

**Also declined from the same proposal:** an LLM authoring risk analysis and
negotiation playbooks (reverses the trust boundary — the model never authors
contract language, UIA §1) and a vector database (infrastructure ahead of any
feature needing it). Encryption at rest / in transit is a deployment-time
hardening item, not an architecture change.

## S120 — U15: received documents live in the database, 1 GB, S3 at launch — 2026-07-29
NC-07's owner decision is settled (2026-07-29): received-document bytes
(counterparty redlines, vendor paper, signed envelopes back from DocuSign,
obligation evidence) are stored **in the database**, ceiling **1 GB per
file**, with a **planned move of raw bytes to S3-class object storage at
launch**. Full record: `docs/open-questions.md` §13; a settled note sits on
the NC-07 package itself.

Why this shape: one system / one backup / one row-level-security model; U12's
redact-and-purge actually deletes in-database bytes (the
external_bytes_pending residual is deferred to launch, not accepted now); and
`storage_uri` + `document_sha256` (0011) make the launch move a migration,
not a redesign. The owner's framing: build the system out now; 1 GB is any
contract in practice.

Consequences for the builders: NC-07's transport question is effectively
decided toward the true binary/multipart inbound path (base64-in-JSON
inflates a gigabyte past the JSON parser's dignity); the two settled values
land as cw.governance_setting rows in the NC-07 package per the house rule;
OB-06 and OB-13's gate is now only Gate C hygiene plus, for OB-13, DocuSign
credentials. **The S3 move is carried to launch on the NC-24/OB-14 pattern**
— whoever plans deployment must raise it beside TLS, encrypted disks and
backups.

## S121 — NC-07 built: the system keeps a received document (0047) — 2026-07-29
U15 settled at midday and NC-07 was built against it the same afternoon.
Migration 0047: cw.received_document — bytes IN the database per U15,
append-only (evidence takes no edits or deletions, not even the owner's),
sha256 and byte_count as GENERATED columns (the schema's own arithmetic over
the stored bytes — a fingerprint that cannot be recorded wrongly), stored by
the three working roles, read by everyone but the viewer, FK to the deal.
Both U15 values are governance rows: document_storage='database',
max_document_bytes=1073741824 (kind owner_decision, decided_by owner).

**The ceiling is enforced at two doors and pinned together.** server.py
refuses an oversized upload UNREAD from its content-length header
(MAX_DOCUMENT_BYTES, now 1 GB); cw.bind_received_document consults the
governance row again where the bytes land, and REFUSES when the row is
missing (the redaction-guard shape — a limit compared against NULL waves
through). test_the_ceiling_here_matches_the_recorded_decision holds constant
and row equal so they cannot drift silently.

**paper.ingest keeps what it receives.** The parse-and-release behaviour was
NC-07's placeholder, not a principle; the bytes now land beside the tickets
in one unit of work (a refused ingest still stores nothing), and the report
carries document_id beside the sha. The transport needed no work at all —
RP-05 had already built the binary inbound path, so NC-07's delivery was the
store, the settled ceiling, and the guards.

**One stale test trued, worth remembering the shape of:** RP-05 legitimately
widened QUERY_KEYS with 'agreement', and test_server's whitelist test had
used 'agreement' as its EXAMPLE of a non-whitelisted key. The fix keeps the
test's point (a genuinely foreign key still never reaches the app) rather
than deleting the assertion. Fixture-choice lesson: an example chosen from
live vocabulary goes stale the day the vocabulary grows.

Verification: received-documents.test.mjs (15), test_paper.py grew three;
five new SQL mutation rows (261 total) and one doorway row (35) — all caught
by the tests that name them. Gates now open: NC-08, NC-09, NC-18, OB-06;
OB-13 waits only on DocuSign credentials.

## S122 — NC-08 built: the negotiation record is readable from the doorway — 2026-07-29

Four READS entries and nothing else — no migration, no new file, no server.py
touch (app.py dispatches any key in reads.READS): GET /negotiations/rounds
(cw.negotiation_round, 0011's own read policy), /negotiations/positions
(cw.position_current), /negotiations/revivals (cw.position_revival),
/negotiations/drift (cw.renewal_drift). The three views scope themselves
since 0027, so the endpoints add no parameters and no WHERE — that absence
is asserted by a named test and guarded by a new doorway mutation row
(36 total, 36/36 caught). Row-scoping against real rows stays proved in
db/test/negotiation.test.mjs per the run-reads precedent; the doorway suite
adds the six-role outcome table (24 entries).

**The administrator's boundary is REPORTED, not settled, in two different
shapes — worth keeping straight because they render differently:**

- **The three views: honest refusal.** No grant at all (0027 left the
  boundary to the owner on purpose, the 0025→0026 pattern). If Mike settles
  it the way he settled the run views ("an alarm you can't investigate…"),
  the fix is a migration granting + admitting the role, and the outcome
  table moves with it.
- **cw.negotiation_round: the §9 shape, live.** 0013:324 grants the table,
  no policy admits the role, so RLS FILTERS: the administrator is answered
  200-with-zero-rows while rounds exist. Pinned by
  test_the_administrator_is_answered_no_rounds_while_a_round_exists so it
  can only move deliberately. The two precedents cut opposite ways — runs
  (0026) widened the policy; holds (U13, 0024) revoked the inert grant —
  so this is Mike's call, raised in the session report, not blocking.

**One flaky test trued in passing, the fixture-clock shape:** test_paper's
vendor_docx built its zip with writestr(name, …), which stamps the WALL
CLOCK into each member header — so test_the_same_document_files_the_same
_tickets (ingest twice, expect one sha256) only passed when both archives
landed in the same clock second. It failed honestly during NC-08's verify
run, on rows NC-08 never touched. Fixed by pinning the stamp
(zipfile.ZipInfo), which is what the determinism the test asserts actually
requires. Lesson beside S121's stale-fixture note: a fixture that embeds
the clock makes a determinism test a coin flip.

reads.py queue: NC-08 done; NC-13 is next in that queue (Gate D-6/D-4
context applies), then NC-15, NC-16. writes.py queue: NC-09 is next.

## S124 — The ungated sweep, day one: NC-13, NC-10, OB-07 — 2026-07-30

Mike asked for ALL currently-ungated open work. The gate audit at start:
ungated = NC-13, NC-16 (narrow fence in lieu of D-7), NC-10, OB-06, OB-07,
NC-18 (gap over RP-05), NC-17 (on its stated two-layer matcher reading —
flagged, not blocking, per the warn-don't-gate rule), NC-19, NC-26. Gated
and skipped: NC-12/14 (D-2, counsel), NC-15 (D-6 re-put), NC-20..23 (D-5),
NC-24, OB-13 (credentials), OB-14 (deployment), OB-11/15 (paused shell).

**NC-13 (0048):** edit_similarity_threshold ships EMPTY (owner-decision
true, decided FALSE — U4 cited as precedent, not stamped as the ruling;
putting the owner's name on a key they never saw would be words in their
mouth). Three cuts (cw.edit_quality, _by_category, _by_agreement), readers
mirror cw.review_quality exactly; requester refused outright IS the
per-contract fencing. below_threshold NULL-never-zero when unset. SQL
mutation row proves the shipped emptiness. edit-quality.test.mjs (9).

**NC-10:** docs/guides/pipeline.md; its example bodies ARE the fixtures
(test_pipeline_guide.py parses the markdown and executes, 7 tests). The
coupling caught its own first draft: manifest categories match LABELS, not
keys. No mutation row — nothing new guarded (both MISS and SKIP are fatal).

**OB-07:** reads/acts as READS/WRITES entries, not a module — single
statements, the OB-09 precedent, collision risk gone (one session, clean
tree). Four reads (book w/ source clause adjacent, gaps, unowned, close
eligibility), three acts (satisfy, reassign, waive-against-approval).
Breach assertion got NO endpoint deliberately (D-1: consequential claim,
a button is a knowing decision). test_obligations.py (29); BODIES in
test_writes.py grew three entries — the structural sweep failed loudly
until it did, which is that fixture doing its job.

## S125 — The ungated sweep, day two: NC-16, OB-06, NC-18, NC-17, NC-19, NC-26 — 2026-07-30

**NC-16 (0049):** portfolio views fenced to the run views' phrasing in lieu
of D-7. THE REPRESENTATION RULE, stated in the migration and asserted: an
agreement = its latest run (created_at, run_id tie-break); unattached runs
their own labelled figure. Representativeness evaluated globally BEFORE the
fence — a requester whose deal's latest run is Legal's still sees THAT run,
not their own older one promoted. Requester test asserts the NUMBER.
Unresolved never folds into zero. Two SQL mutation rows.

**OB-06 (0050):** document_ref on obligation acts + counterparty_ack
(evidence-not-closure). ONE new guard: the same-deal rule. Guard/policy
replaced carrying 0037/0039 harness-keyed blocks verbatim — THIRD copy; the
preflight demands the copies match, so any future replacement must carry
them again. Two SQL mutation rows.

**NC-18 (0051):** cw.supplier_unit — the anchor RP-05 lacked: paragraph N
of the stored document, same-deal-guarded, positions-never-wording (a
column-name test enforces that). paper.ingest anchors in the ticket's unit
of work. The quarantine claim asserted non-vacuously against
cw.selectable_clause.

**NC-17 (0052 + analysis.py):** one row per analysed paragraph; matched OR
escalated (no-ai-match ticket — a ticket NAMES a category, so only
category-with-no-open-position escalates) OR visibly unanswered (no
category: no guess, no ticket). Matcher/classifier named per row (§4
calibration residue); classifier imported from paper.py — one copy;
ranking = NC-06 verbatim; advice-by-schema (no path to position_movement,
tested). Doorway mutation row on the escalation branch.

**NC-19:** analyse_supplier_units through the same _analyse_one — one
pipeline, two entrances, same-shape rows asserted.

**NC-26 (0053 + judge_risk_exposure):** own record (0030 is
ticket-anchored; these anchor analysis rows and concessions). Prospective
after the analysis COMMITS (B2 — never a transaction across the provider
call); retrospective per settled concession, idempotent. Signed -1..1.
Model-down still answers; the _absent harness row covers the new judge
free (same path). The judge deliberately DUPLICATES the semantic judge's
call flow rather than sharing a helper — a shared body would let a
mutation cancel itself across the two (S110's shape).

**Fixture lessons collected:** clause ids must start with the category's
short code; concession settlement demands an assigned attorney + approvals
(fail-closed by design); executed_agreement.run_id FK is real in PG (PGlite
suites that skip runs pass only because their file created them earlier).

Reads now 59. STILL OWNER-GATED: NC-12/14 (D-2 counsel), NC-15 (D-6
re-put), NC-20..23 (D-5), NC-24, OB-13 (DocuSign creds), OB-14
(deployment), OB-11/15 (paused shell). The matcher-fallback reading and
the NC-16 narrow fence are flagged for Mike's confirmation, not blocking.

## S123 — NC-09 built: recording a received redline — 2026-07-29

A module (redlines.py, POST /negotiations/redline), settling the package's
open question the way NC-07's transport implied: a Write carries a record,
never bytes. One unit of work: bytes into cw.received_document (0047), a
'received' round appended pointing at the stored row —
storage_uri = cw://received-document/{id}, document_sha256 = the GENERATED
column's value. The caller supplies bytes and ?agreement=, nothing else:
sha from the schema, direction 'received' and run_id null structurally,
round_no derived (cw.round_is_next still adjudicates races), actor from
the connection, sent_on = today deliberately until backdating is asked
for. The negotiation lookup runs under the caller's own read rules, so
"not your deal" and "no negotiation" are answered identically (409),
which is also what the screen shows.

**A live wire defect found and fixed in-package (the app-level-tests-lie
shape, worth remembering):** server.py's document branch never parsed the
query string — GET passed query=selector, the document POST did not — so
every real upload arrived addressed to nobody and paper.ingest's
?agreement= could never work over HTTP. Nothing caught it because the
end-to-end tests call App.handle directly with the query. Fixed (query
parsed BEFORE the body, so a malformed one is refused unread), proved by
a test that speaks HTTP (test_a_documents_deal_selector_travels_with_it),
and guarded by a mutation row. Lesson: a transport guarantee needs at
least one test on the transport.

Two doorway mutation rows (38 total, 38/38): the 'received' claim (an
'issued' lie passes the schema's own check — provenance is this act's to
tell), and the selector surviving the wire.

writes.py was NOT touched — the queue's next claimant is now NC-20
(Gate D-5). Gates open next: NC-18 (supplier decompose — largely built by
RP-05 already), OB-06, OB-07, NC-10; NC-13 next in reads.py.

## S126 — Download filenames fail closed at the HTTP boundary — 2026-07-31

`server.py` used `Download.filename` directly inside Content-Disposition. The
only current producer rejects quotes and line breaks, but the transport itself
accepted an unsafe internal value; a future producer could inject a header or
make the server fail after beginning a 200 response. The transport now accepts
only printable ASCII attachment names without quote or backslash and returns a
generic 500 before sending download headers otherwise. A socket-level,
parameterized test covers quotes, CRLF, backslash and non-ASCII input. This is
defence in depth at the boundary, not filename rewriting: the producer's value
is either carried unchanged or refused.

## S127 — Broken session durations fall back safely — 2026-07-31

`parse_duration` treated `0s` as valid even though its stated failure behavior
is to preserve a working sign-in; the issued session was expired immediately.
A duration with hundreds of digits also matched the syntax and then raised
`OverflowError`, turning sign-in into a 500. Non-positive and non-representable
durations now use the existing eight-hour fallback. No new maximum session
policy was invented. Direct regression cases cover both failure shapes.

## S128 — Wrong routes refuse document bodies unread — 2026-07-31

The HTTP router treated every non-JSON POST as a document and consumed up to
the one-gigabyte document ceiling before `App` returned 404. That let an
unauthenticated request to an unknown or JSON-only route hold a worker and make
it read a body the route could never use. `server.py` now names the two byte
routes (`/paper/ingest` and `/negotiations/redline`) and returns 415 before
query or body parsing everywhere else. A raw-socket test sends only headers
claiming a one-billion-byte body; the prompt response proves it was not read.

## S129 — Duplicate document-name headers are refused — 2026-07-31

`server.py` rejected duplicate Content-Type and Content-Length fields but used
the first of multiple Content-Disposition fields. Different HTTP hops may pick
different fields, so an immutable evidence row could record a filename other
than the one another hop inspected. Duplicate Content-Disposition fields now
receive a 400 before any document bytes are read. A raw-socket regression sends
two names and claims a one-billion-byte body, proving both ambiguity refusal and
the unread-body order.

## S130 — Document filenames use exact parameter parsing — 2026-07-31

The upload parser searched for the substring `filename=` anywhere in
Content-Disposition. A parameter such as `xfilename=wrong.docx` placed before
the real filename was therefore recorded as the immutable evidence name.
`server.py` now uses the standard email parameter parser, selects the exact
case-insensitive `filename` parameter, supports RFC 2231 encoded values, and
treats repeated filename parameters within one field as ambiguous. A transport
test proves a prefixed lookalike cannot displace the real name.

## S131 — The development database is loopback-only — 2026-07-31

The Python doorway binds to `127.0.0.1`, but Docker published PostgreSQL as
`5432:5432`, which exposes it on every host interface. Because the compose file
also contains intentionally predictable development credentials, another
machine on the network could bypass the doorway and connect directly. The port
mapping is now `127.0.0.1:5432:5432`. A dependency-free configuration test
pins both the required loopback mapping and the absence of the broad mapping.

## S132 — HTTP server instances keep separate apps — 2026-07-31

`serve()` stored its `App` and static root on the global `Handler` class. A
second server created in the same process overwrote those values, so requests
arriving at the first listener could run against the second database. Each
server now receives a private handler subclass with its own bound state. A
two-listener transport test proves simultaneous servers retain distinct apps
and answers; the global assignments remain only as the established inspection
seam and are no longer read by live servers created through `serve()`.

## S133 — Failed HTTP startup closes its database pool — 2026-07-31

`serve()` opened the PostgreSQL pool before constructing the app and binding
the listener, but neither failure path closed it. A port collision or app
construction error therefore leaked connections even though no server was
returned for the caller to close. Startup now closes the pool and re-raises the
original error. A focused test forces socket binding to fail and verifies both
the original error and the pool closure.

## S134 — CORS configuration cannot become a wildcard — 2026-07-31

`server.py` explained that wildcard cross-origin access would let any website
obtain its own development token and read records, but emitted `CW_ORIGIN`
without validation. `CW_ORIGIN=*` therefore did exactly what the comment ruled
out. CORS now accepts only one absolute HTTP(S) origin without credentials,
path, query or fragment, adds `Vary: Origin`, and grants no origin for invalid
or wildcard settings. Transport tests cover one valid development origin and
four unsafe shapes.

## S135 — The browser shell is not cached — 2026-07-31

JSON and document responses already carried `Cache-Control: no-store`, but
static HTML, JavaScript and styles did not. The shell contains the API contract
and session handling, so a cached older client can keep making stale requests
after an authorization or boundary fix is deployed. Static responses now carry
the same no-store rule. The existing same-origin screen test records and checks
the response header as well as the page bytes.

## S136 — Every model judgment shares the concurrency ceiling — 2026-07-31

The four-call semaphore wrapped only `semantic_difference` at its service
caller. `judge_risk_exposure`, used by round and concession analysis, bypassed
it, allowing concurrent analyses to park unbounded server threads on the model
provider. The semaphore now wraps network access inside both outbound adapters,
so no caller can omit it; the redundant outer semantic lock was removed. A
12-worker regression observes the risk adapter and proves its provider-call
peak never exceeds `MAX_CONCURRENT_JUDGMENTS` while still overlapping calls.

## S137 — Excess model work fails fast instead of parking threads — 2026-07-31

The provider semaphore bounded active network calls but used blocking acquire,
so every excess HTTP request still parked a server thread waiting for a slot.
During a provider outage, unbounded requests could therefore exhaust the
threaded server despite the stated ceiling. Both adapters now acquire without
waiting; when four calls are already active, additional judgments immediately
return an honest `absent` outcome naming provider capacity. The 12-worker test
now proves exactly four calls enter the provider and all eight excess calls
return the capacity absence without entering it.

## S138 — Invalid SMTP configuration does not crash startup — 2026-07-31

`channel_from_env` parsed `CW_SMTP_URL` during app construction. Invalid IPv6
or port text raised `ValueError` and stopped the entire service; unsupported
schemes were silently treated as plaintext SMTP. The factory now accepts only
an `smtp://host:port` origin without credentials, query, fragment or meaningful
path. Invalid configuration returns a channel that fails when used, allowing
the notification tick to record the failure through its existing outbox path.
Five focused cases cover malformed URLs, protocol confusion and embedded
credentials.

## S139 — JSON booleans are refused from plain write fields — 2026-07-31

Every generic write field is text or a numeric/date identifier; none declares
a boolean. The central shape guard rejected objects and lists but allowed JSON
`true` and `false`. PostgreSQL treats booleans as a distinct bound type, so a
boolean ticket or agreement identifier reached the driver and became a late
database error rather than a 400 caller mistake. `refuse_structured` now rejects
booleans centrally. A table-wide test covers both values in every plain field,
and the endpoint-level test proves the result is a shaped 400 rather than a
service failure.

## S140 — Overflowing JSON exponents cannot become infinity — 2026-07-31

The HTTP parser used `parse_constant` to reject the non-standard tokens `NaN`
and `Infinity`, but valid JSON exponent syntax such as `1e400` becomes positive
infinity in Python without invoking that hook. The non-finite value could then
reach plain bindings or nested JSON and fail late or pollute calculations.
`server.py` now iteratively checks the entire parsed object for non-finite
floats. The existing socket-level non-finite test now covers both signs of the
overflowing-exponent form alongside the three explicit tokens.

## S141 — Duplicate JSON keys are refused as ambiguous — 2026-07-31

Python's JSON decoder accepts repeated object keys and silently keeps the last
value. Other consumers may keep the first, so a request containing two actors,
identifiers or decisions has no single meaning across the path that handles or
records it. The HTTP parser now uses an object-pairs hook that rejects repeated
keys at any nesting level. A socket-level request with two `person` fields is
proved to receive a 400 before reaching the app.

## S142 — Unrepresentable JSON text is refused at the wire — 2026-07-31

JSON escapes can decode to lone UTF-16 surrogate code points or NUL. Python's
decoder accepts both, but a surrogate cannot be encoded as normal UTF-8 and
PostgreSQL text cannot contain NUL; either value produced a late response or
driver failure instead of a caller-facing 400. The HTTP boundary now walks keys
and values iteratively and rejects both forms before dispatch. Socket tests
cover an escaped lone surrogate and escaped NUL.

## S143 — The origin server accepts only origin-form targets — 2026-07-31

`_parse_target` accepted proxy-style absolute URLs, network-path references and
fragments, then routed only the parsed path. A proxy, cache and this service can
interpret those forms with different authorities or resource identities. The
doorway is an origin server and now requires a slash-prefixed origin-form target
with no scheme, authority or fragment. Fast protocol tests reject four ambiguous
forms and retain an ordinary path-plus-query control.

## S144 — HTTP authority requires one Host field — 2026-07-31

The origin server accepted HTTP/1.1 requests with no Host, an empty Host,
comma-combined hosts or repeated Host fields. Intermediaries may select a
different authority from the one the application ultimately serves, creating
cache and routing ambiguity. GET, POST and OPTIONS now refuse such requests
before parsing the target or body; HTTP/1.0 retains its optional-Host rule but
still rejects ambiguous supplied values. Fast protocol tests cover four bad
shapes and one valid host with a port.

## S145 — A single Host must still be a valid authority — 2026-07-31

The first Host guard enforced cardinality but still accepted malformed single
values: embedded credentials or paths, whitespace, broken IPv6 and non-numeric
ports. Proxies and origin libraries do not interpret those strings uniformly.
The guard now validates printable ASCII authority syntax through `urlparse`,
forces port parsing, and excludes user information and all path/query/fragment
components. Protocol cases cover five additional invalid forms plus bracketed
IPv6 as a valid control.

## S146 — Notification delivery is claimed before the external send — 2026-07-31

The sent-outbox unique index protected the database record but not the external
side effect: concurrent ticks could both observe no sent row, both send, and
only then collide while recording the outcome. Migration 0054 adds an
Administrator-only five-minute coordination lease, acquired atomically before
SMTP and released in the same transaction that appends the outcome. The lease
does not hold a pooled connection across the outside call, expires after a
crashed worker, and permits immediate retry after a recorded failure. SMTP is
still necessarily at-least-once if a process dies after remote acceptance but
before its local commit; the lease closes overlapping live-worker duplicates.

## S147 — Requesters cannot file received bytes against foreign deals — 2026-07-31

Migration 0047's document INSERT policy checked only that the caller held one
of the three working roles. That let a requester connection attach arbitrary
bytes to an agreement owned by somebody else, despite the doorway's ordinary
visibility lookup. Migration 0055 retains portfolio-wide storage for the two
Legal roles and requires `cw.owns_agreement(agreement_id)` for requesters. The
received-document schema test now carries a second deal and proves the foreign
write is refused while own-deal storage still succeeds.

## S148 — Requester override requests are anchored to an owned run — 2026-07-31

The override-request trigger bound `requested_by`, but the direct INSERT policy
checked only the requester role. A requester could name another person's run
and provide a null or mismatched agreement anchor, bypassing the governed
helper's scoped lookup. Migration 0056 requires a run visible under the existing
requester read policy and an agreement anchor exactly matching that run; this
also preserves requester-created legacy runs whose anchor is null. The override
schema suite now carries two requesters, agreements and runs, and refuses both a
foreign-run request and a deliberately mismatched run/agreement pair.

## S149 — Requester concession actions stay on owned deals — 2026-07-31

The parent concession rejected foreign requester writes, but its approval,
settlement and withdrawal children used role-only INSERT policies. Their
workflow triggers did not make ownership a general invariant, allowing a
foreign requester to withdraw an unsettled concession or settle an approved
one. Migration 0057 keeps portfolio-wide Legal authority and scopes every
requester child action through the parent concession's agreement. Governance
tests prove a foreign withdrawal leaves no immutable action record.

## S150 — Content-Type cannot carry combined media types — 2026-07-31

The HTTP boundary rejected repeated Content-Type fields but accepted a single
comma-combined value. An intermediary may split or select that value while the
doorway treated the whole thing as a document media type, changing which body
parser and endpoint path receives the bytes. The transport now rejects commas
in the media-type portion before reading the body while retaining commas inside
quoted parameters. Fast protocol tests cover both cases.

## S151 — Content-Disposition cannot carry combined dispositions — 2026-07-31

The upload boundary rejected repeated Content-Disposition fields and repeated
filename parameters, but a single comma-combined disposition type still passed.
HTTP hops may combine repeated fields, leaving them and the doorway to choose
different filename claims. The parser now rejects commas in the disposition
type while retaining commas inside a quoted filename. Fast protocol controls
cover both shapes.

## S152 — Request targets cannot hide routing separators — 2026-07-31

Origin-form validation still accepted raw backslashes and percent-encoded slash
or backslash. Proxies may decode or normalize these before routing, while the
doorway chose API versus static handling on the encoded path; Windows also
treats a decoded backslash as a filesystem separator. Target parsing now
rejects all three separator-confusion forms before dispatch. Fast protocol
tests cover raw and case-varied encoded spellings.

## S153 — Request targets cannot carry dot segments — 2026-07-31

The static layer contained path traversal after resolution, but target parsing
still accepted raw and percent-encoded `.` or `..` segments. A proxy may remove
those segments before choosing API routing while the doorway routed the
unnormalized form, creating cross-hop endpoint ambiguity even without escaping
the static root. Origin-form parsing now rejects raw, encoded and mixed dot
segments before dispatch. Fast protocol tests cover all three forms.

## S154 — Request paths cannot hide query or fragment delimiters — 2026-07-31

Origin-form parsing separated raw query and fragment delimiters but accepted
percent-encoded `?` and `#` inside the path. An upstream hop may decode those
reserved characters before routing while the doorway keeps them in the path,
so the hops can disagree about both endpoint and selector. Target parsing now
rejects encoded query and fragment delimiters before dispatch, with fast
protocol coverage for case variants.

## S155 — Request targets reject raw controls and encoded NUL — 2026-07-31

Target parsing accepted raw control/non-ASCII bytes and percent-encoded NUL.
Different HTTP and native components may reject, normalize or truncate those
forms, while API and query routing could carry them deeper than the static
layer's later NUL check. The origin boundary now requires printable ASCII in
the raw target and rejects `%00` anywhere; ordinary percent-encoded UTF-8 stays
valid. Fast protocol tests cover raw NUL, encoded NUL, DEL, raw non-ASCII and a
valid encoded UTF-8 control.

## S156 — DOCX archives have a member-count ceiling — 2026-07-31

The untrusted DOCX reader bounded decompressed bytes, part size, XML depth and
element count but not ZIP member count. Empty entries add no declared payload,
so a compact archive could force large central-directory lists and duplicate
tracking without crossing a byte ceiling. The parser now refuses more than
10,000 members before per-name bookkeeping. A compact empty-entry metadata-bomb
fixture proves the refusal.

## S157 — DOCX XML elements have an attribute ceiling — 2026-07-31

The DOCX XML parser bounded bytes, depth and element count but not the number of
attributes on one element. A compact tag can force a large attribute map while
remaining shallow and under every existing ceiling. The streaming tree builder
now refuses more than 1,024 attributes on an element before adding it to the
tree. A sub-20 KB attribute-bomb fixture proves the refusal.

## S158 — Advisory model inputs have a character ceiling — 2026-07-31

Both model adapters bounded timeout, concurrency and response bytes but
JSON-encoded and transmitted input texts without a size limit. Supplier paper
can contain very large paragraphs, multiplying memory and provider load across
concurrent judgments. Each adapter now records an absence before encoding or
network access when the pair exceeds 200,000 characters. Parameterized tests
prove neither provider path is called for oversized input.

## S159 — Provider judgment text must be database-representable — 2026-07-31

JSON accepts escaped NUL and lone surrogate code points, but PostgreSQL text
does not. Both model adapters previously accepted those values in reported
model provenance or judgment basis, causing the later evidence insert to fail
instead of recording an absence. The adapters now reject unrepresentable text
before returning a judgment. Tests cover NUL and lone-surrogate provenance in
both adapters plus an unrepresentable basis.

## S160 — Invalid configured model names become recordable absences — 2026-07-31

The model name comes from deployment configuration and is copied even into
no-key absence rows. Blank, NUL-containing or lone-surrogate values therefore
made the explanatory database record fail before any provider call. Both
adapters now turn an unusable configured name into an absence that identifies
the bad variable while storing the safe default model label. Parameterized
tests cover three invalid shapes across both adapters.

## S161 — Supplier-paper classification has a paragraph ceiling — 2026-07-31

Supplier ingest capped the number of classified tickets only after scanning
every nonblank paragraph against every category. A document near the XML
element ceiling could therefore consume substantial CPU while opening no
tickets at all. Ingest now refuses more than 5,000 nonblank paragraphs before
hashing, database access or classification. A monkeypatched 5,001-paragraph
regression proves no ticket or received-document row is written.

## S162 — Supplier category terms match whole words — 2026-07-31

The deterministic supplier-paper classifier used substring membership and
always included category keys. A short key such as `ip` therefore matched
ordinary words like `supplier` and `ship`, opening false immutable tickets and
potentially hiding a baseline gap. Classification now tokenizes alphabetic
words and matches exact tokens, preserving standalone short acronyms. Synthetic
controls prove both the false-positive refusal and the standalone-key match.

## S163 — Malformed upload filenames are refused unread — 2026-07-31

The HTTP header parser accepts quoted filenames containing NUL and other
control characters, but PostgreSQL text cannot store NUL. The doorway therefore
read a whole document before a malformed provenance name failed at the database
boundary. Upload routing now rejects control characters and lone surrogates in
the parsed filename before reading the body, while retaining ordinary Unicode
filenames. A protocol regression proves the body remains unread.

## S164 — Traversal test accepts the earlier parser refusal — 2026-07-31

The live-server traversal regression still required a 403 or 404 after request
target hardening moved raw and encoded dot-segment rejection ahead of static
file routing. The server correctly answered 400, but the stale assertion made
the broad security rail fail despite the traversal remaining closed. The test
now accepts 400 at the parser boundary as well as the static boundary's 403 or
404, and retains its content-leak assertion if any request is served.

## S165 — Content-addressed run pins are verified before commit — 2026-07-31

The run writer treated every `ON CONFLICT DO NOTHING` collision in the five
shared snapshot and ruleset tables as identical by definition. The database did
not verify the hashes, while working roles could preinsert those rows, so a
preclaimed id with different members could silently bind a later run to
provenance the engine never used. After inserting the run parent makes both pins
visible through RLS, the writer now compares every stored parent and member row
with the emitted pin inside the same transaction. Any mismatch raises, rolls
back the run, and answers 409. A synthetic poisoned member proves the refusal.

## S166 — Referenced run pins cannot be extended — 2026-07-31

Append-only run-pin tables refused updates and deletes but still accepted new
snapshot members, ladder rungs, and rules after a run referenced the parent. A
working role could therefore permanently change an existing run's replay input
after the doorway's creation-time equality check. Migration 0058 locks pin
parents while members and runs are inserted, permits exact idempotent member
replays, and refuses any new or different member once a run references the pin.
The focused store rail exercises all three child tables.

## S167 — Repeated sign-in has a live-session ceiling — 2026-07-31

Each sign-in inserted a new session lasting up to the configured lifetime, and
the expiry sweep bounded only dead rows. Because the current identity-only
sign-in accepts any known person name, one caller could continuously grow the
live session table. Issuance now retains at most 19 existing sessions for that
person before adding the new token, bounding the steady-state set at 20 per
finite account. The session rail issues 27 tokens and proves both the ceiling
and newest-token usability.

## S168 — Manifest risk fan-out is bounded — 2026-07-31

The HTTP byte limit still allowed a compact manifest to carry thousands of
risk objects. Every accepted risk crosses category validation and resolution
and can become a permanent decision row, so array fan-out amplified one request
into unbounded deterministic work and database writes within the byte ceiling.
The shared manifest boundary now refuses more than 200 risks before entry
normalization, covering both pre-flight and run endpoints. A 201-risk synthetic
manifest proves the early refusal.

## S169 — Analysis invocation fan-out is bounded — 2026-07-31

Redline analysis processed every changed paragraph in a DOCX, while supplier
analysis processed all units accumulated across every ingest on a deal. Each
unit can create immutable analysis and ticket rows and trigger an external model
judgment, so file-byte and per-ingest limits did not bound one analysis call.
Both entrances now refuse more than 200 units before writing analysis rows or
calling a provider; the supplier query reads at most 201 to make the decision.
A three-redline fixture with a lowered ceiling proves zero analysis rows land.

## S170 — Analysis match scores use whole words — 2026-07-31

Supplier-paper classification was corrected to exact word tokens, but round
analysis still scored category terms as substrings. A short key such as `ip`
therefore gained false score from ordinary words like `supplier` and `ship`,
leaving the recorded confidence inconsistent with the classifier that selected
the category. `_score` now uses the same alphabetic-token membership. Synthetic
controls prove both the substring refusal and standalone acronym match.

## S171 — Ambiguous category matches do not pick a database row — 2026-07-31

A negotiation may hold multiple open positions in one category from different
rounds. Round analysis fetched current positions without an order and selected
the first category match, so PostgreSQL row order could decide which live
argument received advice. The matcher now accepts a position only when exactly
one open candidate exists; multiple candidates use the existing quarantined
no-match escalation. A real-schema regression opens a second position in the
same category and proves neither position is selected.

## S172 — Execution signatory fan-out is bounded — 2026-07-31

The execution endpoint accepted an unbounded signatory array inside the HTTP
byte ceiling and inserted one immutable `executed_signatory` row per entry as
part of an irreversible filing. It now refuses more than 100 signatories before
opening a database transaction. A 101-entry synthetic filing calls the boundary
without a database and proves the early 400.

## S173 — Structured signatory fields are boundary errors — 2026-07-31

Execution checked signatory fields with `str(value).strip()`, so objects, lists,
and booleans looked nonblank and reached immutable filing inserts as bind
parameters. Objects and lists then failed adaptation as a service/database error
instead of a malformed request; optional structured titles bypassed even the
presence loop. Required signatory fields and title now use the shared plain-value
guard before database work. Four synthetic shapes prove clean 400 responses.

## S174 — Structured execution fields are boundary errors — 2026-07-31

Most top-level execution fields were checked only for presence. Objects, lists,
and booleans in dates, filename, byte size, hashes, storage references, or the
optional agreement metadata therefore reached psycopg or immutable schema
constraints as late service/database failures. Every required filing field and
the four optional plain fields now pass through the shared plain-value guard
before signatory processing or database work. Representative required and
optional malformed shapes prove clean 400 responses.

## S175 — Structured manifest text is not stringified — 2026-07-31

Manifest normalization called `str()` on vendor, source, and risk text fields.
Objects, arrays, and booleans therefore became plausible-looking strings: a
structured category was misreported as an unknown library category, while a
structured severity could be silently coerced and recorded. Those declared text
fields now use the shared plain-value guard before normalization and engine
classification. Five synthetic shapes prove malformed structure stays a 400
boundary error rather than becoming content.

## S176 — Sign-in identity must be text — 2026-07-31

`App.sign_in` stringified every truthy `person` value before lookup. JSON
objects, arrays, numbers, and booleans therefore became made-up account names
and answered with a misleading inactive-account 403 after database work instead
of a malformed-request 400. Sign-in now requires a nonblank string before any
identity query. Four direct boundary cases run with no database and prove the
early refusal.

## S177 — Execution scalar types are checked before filing — 2026-07-31

Rejecting structured fields still left wrong scalar types: numeric dates and
filenames reached text/date columns late, while string byte sizes relied on
driver or database coercion during an irreversible filing. All declared text
fields now require strings when present, and `byte_size` requires a non-boolean
integer before signatory processing or database work. Representative required
and optional scalar mismatches prove clean 400 responses.

## S178 — Signatory scalar types are checked before filing — 2026-07-31

After container rejection, numeric signatory names, parties, methods, dates, or
titles still passed the `str(value).strip()` presence check and reached text/date
columns during an irreversible filing. Required signatory fields and optional
title now require strings before the nonblank check and before database work.
Five scalar mismatch controls prove clean 400 responses.

## S179 — Manifest text fields require text scalars — 2026-07-31

Container rejection still allowed numeric vendor, source, category, severity,
and justification values to pass through `str()`. That misreported numeric
categories as missing library content and could silently coerce numeric
severities rather than identify malformed model output. All five declared text
locations now require strings when present, before normalization or engine
classification. Five numeric controls prove the boundary refusal.

## S180 — Malformed content types are refused unread — 2026-07-31

Upload filenames rejected control characters, but the `Content-Type` header was
also copied into received-document provenance and had no equivalent check. A
quoted or raw NUL/control value therefore caused PostgreSQL text failure only
after the whole upload was read. POST routing now rejects controls, DEL, and
lone surrogates in the sole media-type field before body reads. A protocol
regression proves a NUL-bearing type returns 400 with the body untouched.

## S181 — Concurrent migrators serialize ledger decisions — 2026-07-31

Migration files were transactional and checksummed, but two service instances
could read the same absent ledger row and execute the same DDL concurrently.
The narrow retry handled one cluster-role catalog error, not duplicate schema
application. `migrate()` now holds a database advisory lock across ledger setup,
drift checks, and all per-file transactions, releasing it in `finally`. A
two-connection regression applies one temporary migration exactly once: one
caller reports the file and the other reports no work.

## S182 — Request controls are escaped in operational logs — 2026-07-31

The request-target parser refused control bytes, but `http.server` later passed
the original caller-controlled request line to `log_message`, which wrote it
verbatim to stderr. ESC or carriage return could therefore manipulate a local
operator terminal or forge log layout even though the request itself answered
400. Logging now renders every control and DEL as a visible hex escape after
formatting. A synthetic ESC/CR request line proves one control-free log line.

## S183 — waiting_for binds non-admin callers to themselves — 2026-07-31

`cw.waiting_for(person, role)` runs as `SECURITY DEFINER` and was executable by
every signed role, but trusted both arguments. A requester could name another
person or claim `legal_admin` and enumerate privileged queue references and due
dates. The replacement function permits cross-person derivation only for the
Administrator notification duty; every other application caller must supply
their signed actor and actual role. Routing tests prove self access, two spoof
refusals, and the Administrator's positive control.

## S184 — In-flight HTTP connections are bounded — 2026-07-31

`ThreadingHTTPServer` creates a new thread for every accepted connection. The
socket timeout limits each slow client to ten seconds but did not limit how many
threads many concurrent partial requests could allocate. The live server now
reserves one of 64 semaphore slots before starting a request thread, closes new
connections when full, releases slots in the request thread's `finally`, and
also releases on thread-start failure. A unit control exhausts the sole test
slot and proves no request thread starts.

## S185 — Execution byte size is positive at the boundary — 2026-07-31

The execution doorway accepted zero and negative document sizes as correctly
typed input, leaving a database constraint to reject them after transactional
work had begun. That late rejection was also classified as a conflict on the
request's merits instead of a malformed request. The doorway now refuses every
nonpositive byte size with 400 before opening a database request. Direct
regressions cover both zero and a negative value without a database fixture.

## S186 — Prospective assessment write refusals stay classified — 2026-07-31

Round analysis commits before calling the advisory model, then opens a short
transaction to append each prospective risk assessment. Both prospective
callers left a database error from that second phase uncaught, unlike the
retrospective path, so a permission or integrity refusal became a generic 500
after the analysis itself had already landed. Both callers now classify that
database refusal into the normal explicit response. A regression injects an
insufficient-privilege failure after analysis and proves the endpoint answers
403 with the database's reason instead of crashing.

## S187 — One request makes at most four advisory judgments — 2026-07-31

The 200-unit analysis ceiling bounded database fan-out but not external work:
each matched unit could make a separate provider call sequentially, so one
request could consume 200 billable calls and about 4,000 seconds of provider
timeouts. Prospective and retrospective assessment now make at most four model
calls per request. Every remaining item still receives an append-only `absent`
assessment whose reason says the request limit prevented a model call. A
fixture-free regression supplies six eligible analyses, proves only four calls
reach the provider seam, and proves all six outcomes remain on the record.

## S188 — One notification tick attempts at most four deliveries — 2026-07-31

The notification tick bounded each SMTP connection to 30 seconds but placed no
bound on how many people one tick would contact sequentially. A large directory
or slow mail server could therefore hold one request for 30 seconds per person.
One tick now attempts at most four external deliveries. Reachable people beyond
that ceiling remain unclaimed and unsent for the next tick, and the response
counts them as `deferred_by_delivery_limit`. A fixture-free six-person control
proves four channel calls and two explicit deferrals.

## S189 — The loopback server accepts only its own Host names — 2026-07-31

The HTTP handler validated Host syntax but accepted every hostname. Because the
service binds to loopback and development sign-in names an account without an
external identity provider, an attacker-controlled hostname rebound to
127.0.0.1 could make an attacker page same-origin with the doorway and bypass
CORS. A live server now accepts only `localhost` and `127.0.0.1`, and requires
any supplied port to equal its actual listening port. An isolated regression
proves an attacker hostname is rejected while the local authority remains
valid.

## S190 — Session issuance enforces its cap atomically — 2026-07-31

The 20-live-session ceiling trimmed old rows and then inserted a new token under
ordinary read-committed transactions. Concurrent unauthenticated sign-ins for
one known account could all trim the same snapshot and then insert, leaving the
account above the stated resource bound. Issuance now takes a transaction-scoped
PostgreSQL advisory lock keyed by person before the trim-and-insert pair; other
people remain independent. A 12-worker regression starts from 19 sessions and
proves the final count is exactly 20 and the newest token works.

## S191 — Run-history reads use one bounded recent window — 2026-07-31

The run summary, decisions, and findings endpoints returned every visible run
ever recorded. For an Auditor that meant an ever-growing response containing
the whole company history, and the source itself acknowledged the missing
bound. All three reads now cover the same 500 most recent RLS-visible runs. The
summary is deterministically ordered by creation time and run id; child rows
select those run ids before ordering, so no included run is cut in half by a
flat row limit. A structural regression pins the shared server-owned window.

## S192 — Retrospective assessments claim before model calls — 2026-07-31

The retrospective endpoint selected concessions with no assessment, released
that transaction, and then called the model. Concurrent sweeps could both see
the same concession, both incur an external call, and both append an estimate,
despite the endpoint's idempotency promise. An expiring per-concession claim now
coordinates the outside call without holding a pooled connection. A live claim
is reported as `assessment_in_progress`; completion appends the outcome and
releases its matching token in one transaction.

## S193 — Retrospective sweeps bound database fan-out — 2026-07-31

The four-call provider ceiling did not bound retrospective database work. One
request still selected every unassessed concession and opened one transaction
per outcome, so a large agreement could keep a worker busy without bound even
after external spend was capped. A sweep now reads at most 51 candidates,
processes 50, and reports the excess as `concessions_deferred`; deferred rows
remain unassessed and eligible for the next sweep. The fixture-free fan-out
control now supplies 52 concessions and proves 50 outcomes, two deferrals, and
only four provider calls.

## S194 — Every notification database phase classifies refusals — 2026-07-31

The notification tick classified database failures during its initial authority
read and final outbox write, but not during per-person derivation or delivery
claiming. A permission, integrity, or connectivity failure in either middle
phase escaped to the server's generic 500 instead of retaining its database
meaning. Both phases now use the same classifier as the surrounding work.
Fixture-free controls inject insufficient privilege into each transaction and
prove a 403 with no channel call.

## S195 — Every channel exception has recordable failure detail — 2026-07-31

The notification tick caught every channel exception but called `str(error)`
inside that handler and copied the result directly into PostgreSQL. An exception
whose string conversion raised escaped the promised failure path; a detail with
NUL or a lone surrogate made the outbox insert fail instead of recording the
delivery outcome. Failure capture now tolerates broken string conversion,
substitutes the exception type when detail is absent or unrepresentable, and
bounds the result to 500 characters. Live controls prove both hostile exception
shapes still produce a sent-to-outbox `failed` outcome.

## S196 — Test database names are identifiers, never owner SQL — 2026-07-31

The doorway test fixture accepted `CW_TEST_DATABASE` and interpolated it into
owner-privileged `CREATE DATABASE` SQL. A name containing a quote could end the
identifier and append another statement when the suite started. Creation and
cleanup now compose the configured name with psycopg's identifier quoting; a
fixture-free control proves hostile punctuation remains inside one identifier.

## S197 — Test database names cannot rewrite connection URLs — 2026-07-31

The test fixture also inserted `CW_TEST_DATABASE` raw into PostgreSQL URLs with
a regular-expression replacement. URL delimiters could change the database
path or query, while backslash replacement syntax could corrupt construction
before the suite began. The fixture now percent-encodes the name as exactly one
URL path segment and preserves the original connection authority and options.

## S198 — DOCX member names have a metadata ceiling — 2026-07-31

The DOCX reader bounded member count and decompressed bytes, but ZIP member
names could still be tens of thousands of characters and duplicate refusal
joined attacker-controlled names into its error. Each member name is now capped
at 1,024 characters before duplicate details are collected, and the refusal
does not echo the hostile name. A compact archive regression proves both facts.

## S199 — Duplicate DOCX diagnostics are bounded — 2026-07-31

After member-name length was bounded, duplicate detection could still join as
many as 10,000 attacker-chosen names into a caller-facing refusal. The error now
reports the total duplicate count but lists at most ten sorted examples, with
an ellipsis when more exist. A regression supplies twelve distinct duplicate
names and proves the eleventh is not reflected in the diagnostic.

## S200 — Document uploads preflight the session before reading bytes — 2026-07-31

The HTTP transport read a document body before `App.handle()` resolved its
bearer session, so an unauthenticated client could make a worker receive up to
the 1 GiB document limit merely to learn it had no session. Document endpoints
now preflight the current session after parsing their small query and before
reading the body. Dispatch resolves identity again after the read so revocation
between the two checks still takes effect. A socket regression advertises a
1,000,000,000-byte body, sends none, and receives 401 without app dispatch.

## S201 — Huge session durations fall back instead of breaking sign-in — 2026-07-31

Session-duration parsing handled numeric overflow but not Python's integer
digit-limit `ValueError`. A governance value containing thousands of digits
therefore broke every new sign-in instead of using the parser's documented
eight-hour fallback. Both conversion failures now fall back; the duration
control includes a 5,000-digit value that reaches the previously uncaught path.

## S202 — Session trimming follows database issue order — 2026-07-31

The per-person issuance lock enforced the count cap, but trimming ordered equal
expiries by random token digest. A later concurrent sign-in could therefore
delete a token another request had just returned while older sessions survived.
Sessions now carry a database insertion timestamp taken inside the issuance
lock, and trimming keeps the most recently inserted rows. The concurrency
control proves all twelve new tokens remain usable while the cap stays at 20.
The required database mutation harness produced no output before the 304-second
command ceiling and therefore remains unverified for this change; the live
session rail and migration-ledger rail completed successfully.

## S203 — Session lookup is no longer a global write — 2026-07-31

Every nonempty bearer lookup first deleted every expired session in the table.
That made random invalid tokens an unauthenticated trigger for a global write
and row-lock work before the indexed fingerprint lookup. Expiry already lives
in `LIVE_SESSION_SQL`, while issuance retains the growth-control sweep, so the
lookup-side DELETE was removed. A fixture-free control supplies a read-only
request object and proves invalid-token resolution performs only the lookup.

## S204 — Migration cleanup cannot mask the primary failure — 2026-07-31

`migrate()` released its session advisory lock in `finally`. If the connection
failed during migration and failed again during unlock, Python reported only
the cleanup exception and hid the failure that actually stopped installation.
Unlock is now best-effort only while another exception is active; after a
successful migration, an unlock failure still surfaces. Fixture-free controls
prove both exception paths.

## S205 — The authenticated shell does not trust mutable CDN code — 2026-07-31

The v4 page ran Tailwind's unversioned browser compiler plus React, ReactDOM,
and Babel from third-party origins without integrity. Any changed CDN response
ran beside the in-memory bearer token. Tailwind 3.4.17 is now compiled to local
CSS, removing that executable dependency; the three pinned unpkg scripts carry
verified SHA-384 integrity and anonymous CORS attributes. The shell suite proves
there is no Tailwind CDN reference, every remote script is integrity-locked,
and the compiled local stylesheet is present.

## S206 — Sign-out always destroys the browser credential — 2026-07-31

The v4 client cleared its bearer token only after the server-side sign-out call
returned. A network or service failure therefore left the person visibly and
credentially signed in after they clicked sign out. Local token and identity
destruction now runs in `finally`; the server session may expire naturally if
unreachable, but the page cannot keep using it. The shell suite executes the
real API module with a rejecting fetch and proves both local values are gone.

## S207 — A failed remote sign-out still returns to the front door — 2026-07-31

Destroying the browser token in `finally` was necessary but incomplete: the
network exception still escaped `API.signOut()`, so the root callback stopped
before clearing React's visible identity. The workspace remained on screen with
no usable credential. Remote session cleanup is now best-effort and local
sign-out resolves after destroying the token, allowing the root to clear the
workspace. The rejecting-fetch control now also proves sign-out does not throw.

## S208 — Rejected browser fetches settle as transport failures — 2026-07-31

The API adapter normalized HTTP errors but let network-level fetch rejection
escape. Pane hooks then remained in `loading`, and action handlers stopped before
clearing their busy state. Record calls, downloads, and sign-in now return the
same status-zero unreachable shape when fetch rejects. The shell executes all
three real transport paths with a rejecting fetch and proves each promise
settles as a classified failure rather than throwing.

## S209 — Unreadable 200 responses fail closed in the browser — 2026-07-31

The API adapter replaced JSON parse failure with `null` and then treated an OK
HTTP status as a successful response with zero rows. A truncated queue response
could therefore render as “nothing is waiting” instead of “could not load.”
Successful record and sign-in responses now require a readable JSON object;
otherwise they return a classified invalid-response failure while preserving
the HTTP status. The real adapter is tested with a 200 whose JSON parser throws.

## S210 — Browser row responses require an array — 2026-07-31

A successful readable JSON object was accepted even when its `rows` member was
an object or string. Shared panes then called array methods and crashed instead
of rendering the service response as invalid. The adapter now requires an own
`rows` property, when present, to be an array; other successful record-shaped
responses remain valid. The real adapter is tested with an object disguised as
rows and returns the classified invalid-response path.

## S211 — Interrupted download bodies settle as transport failures — 2026-07-31

The download adapter caught rejection while opening a request but not rejection
while consuming its successful response body. If the connection broke after
headers, `res.blob()` escaped and the requesting screen stopped before clearing
its busy state. Blob consumption now returns the same unreachable result as an
initial fetch failure. The real adapter is tested with successful headers and a
body stream that rejects.

## S212 — Sign-in requires a complete identity before storing it — 2026-07-31

A readable successful sign-in object was accepted without checking its token or
identity fields. A truncated or wrong-shaped response could therefore report
success, store undefined state, and crash when the root selected the returned
role's workspace. Sign-in now requires nonblank text for token, person, role,
and display name, plus a text-or-null unit, before changing browser state. The
real adapter is tested with an incomplete 200 and proves nothing is installed.

## S213 — Sign-in accepts only the six workspace roles — 2026-07-31

Complete text fields were not enough to make a sign-in response usable: an
unknown nonblank role still installed the token, then crashed when the root
looked up a workspace that does not exist. The API adapter now requires the
role to be one of the six protocol values before mutating browser state. The
real adapter is tested with a `superuser` response and proves no token lands.

## S214 — Older pane responses cannot overwrite newer reloads — 2026-07-31

The shared pane hook allowed overlapping fetches to settle in any order. A slow
initial request could overwrite a newer manual reload, and an unmounted pane
could still attempt a state update. Each reload now claims a monotonic generation
and may update state only while it remains current; effect cleanup invalidates
the pending generation. The shell control pins claim, comparison, and cleanup
in the one hook every data pane uses.
## S215 — Invalid timestamps do not render fabricated ages — 2026-07-31

The shared age renderer did arithmetic on `Invalid Date`. Its comparisons all
fell through and it displayed `NaNd`, making malformed response data look like
a real recorded age. The renderer now verifies the parsed epoch is finite
before doing elapsed-time arithmetic. The shell executes the isolated real
helper with invalid timestamp text and proves no `NaN` age is produced.
## S216 — Browser error reasons are text-only — 2026-07-31

The API wrapper trusted `reason` and `error` fields from failed responses to be
strings. An object or array could therefore reach a React error surface and
crash rendering while the service was already failing. The wrapper now accepts
only nonblank text and otherwise uses its endpoint-specific fallback. The shell
executes ordinary, download, and sign-in refusals with hostile response shapes.
## S217 — Session polling results belong to one identity — 2026-07-31

The periodic `/me` request outlived the identity effect that started it. If an
old request returned 401 after sign-out and a replacement sign-in, it could
forget the replacement credential. The effect now invalidates pending results
on cleanup and permits only one check at a time. The shell locks both lifetime
and overlap guards to the actual polling effect.

## S218 — Owner decision session, 2026-08-02: D-5 in scope; the rest deferred or commissioned — 2026-08-02

Mike answered the roadmap questions in one sitting:

- **D-5 — the six governed Legal-admin acts are IN SCOPE for this effort** (activate/retire
  a clause, supersede, edit a conflict rule, promote a concession, reorder a rung / move a
  floor, release a legal hold, destroy under retention). This unblocks NC-21, NC-22, NC-23
  and lets WP-U13 close. Where an individual act still needs a design choice that is not an
  owner decision, make the choice, record it, and flag it — warn, don't gate (Mike's
  standing rule).
- **Confidential deals: deferred.** The settled shape (marked-but-listed, §12) stands;
  the three residual approval questions wait with it.
- **D-2 / D-6: research commissioned**, not decided. Deliverable is a memo for Mike and
  counsel. D-6 must be re-put with the corrected framing (the AI-use record survives an
  erasure request; deletion reaches signed-contract records only).
- **Procurements deferred** — DocuSign credentials and the identity-provider choice. OB-13
  and the sign-in hardening stay gated on these.
- **Finish what is started: yes** — WP-U15 acceptance sweep, OB-11/OB-15 screens, the
  WP-U13 acting halves, documentation trueing.
- **AI front half: architecture and plan commissioned** (WS-2). Design only; the provider,
  budget, and intake-vs-matcher sequencing decisions remain Mike's, to be put with the
  plan.
- **Launch hardening: deferred for now** (scheduler, checkpoint signing, deployment, the
  U15 S3 move). Unchanged: raise the S3 move again when launch planning starts.

## S219 — Date rot: a fixture the calendar walked past — 2026-08-02

`obligations.test.mjs` hardcoded an execution date of 2026-08-01 while its
templates are approved on the day the suite runs. From 2026-08-02 the
approved-before-executed pin (0036) refused the registration — the guard
working exactly as pinned, against the test's own fixture. Six tests failed
and one crash stopped the suite; the mutation harness reported 16 misses, all
tracing here. Fixed by computing the fixture's dates from `current_date`
(executed today, effective the first of the month after next, a six-month
term), with the expected due dates computed the same way.

**Why:** a fixture date in the future of the suite's writing day is a time
bomb; the suite was green for five days and rotted on the sixth.
**How to apply:** seed dates relative to today unless the test is ABOUT a
fixed date; if a pin compares two dates, derive both from the same anchor.

## S220 — Trap 5.4a again, three times in one day — 2026-08-02

Three mutation rows were stranded by later migrations re-creating the object
they patch: two by `0059` (waiting_for reworded the renewal-window line and
merged the ticket_route from/where), one by my own `0062` (library_entry).
All three reported MISS — "suite passed with the guarantee broken". Also:
`administrator.test.mjs`'s write allow-list was never repointed when `0054`
deliberately granted the administrator the notification delivery-claim lease
table. All repointed the same day.

**Why:** the harness deliberately patches every file carrying a pattern, but a
REWORDED line in the last definition to run silently un-guards the check.
**How to apply:** when a migration re-creates a function or view, grep
mutation-check.mjs (and mutation_check.py) for patterns anchored on the old
text before committing — the harness preflight only catches VANISHED text,
not text that survives in a superseded copy. See [[clausewerk-mutation-harness-after-migrations]].

## S221 — D-5 built: the six governed acts, same day as the decision — 2026-08-02

Migration 0062 (supersession as one act; ladder replacement with retirement;
the floor move audited), fifteen doorway writes + three reads, and the acting
screens. Design choices recorded in open-questions §9b: reorder = replace (a
new ladder; the old retires and stays readable, because concessions name rung
numbers); rule edit = next version; destruction confirms by typing the
record's own id. Every live-ladder lookup gained the retired filter
(concession authority trigger, open_renewal, ticket_route, ladder views,
analysis.py) — and the historical concession-wording lookup in analysis.py
was repointed at the concession's OWN stored ladder_id, which is where a
historical question belonged all along. WP-U13 closed. All SQL suites green,
mutation harness 274/274.

## S222 — WP-U15 run: the reading room is real on screen; OB-11/15 built — 2026-08-02

The acceptance walkthrough (`doorway/acceptance_walkthrough.py`, kept and
re-runnable) performed the whole front-to-back path through the doorway over
HTTP as the seeded people — accounts + U6 countersign, category, ticket →
claim → verify, deal, recorded run, execution FILED THROUGH THE ACT, share —
and the viewer's browser rendered the per-clause paper with approver and
origin. Both of handoff 08 §3's named gaps closed. Found on the way: the
share had no doorway act (POST /shares added), and the ladders pane's empty
early-return hid the rules and promotion sections (fixed; the trap-5.2 shape
again). OB-11/OB-15 landed as one obligations pane (waiting-on-you, calendar
with an honest no-date-yet bucket, per-agreement panel with envelope strip,
inbox) on a shared tab for requester and legal admin; GET /envelopes added.

## S223 — `localhost` costs two minutes a connection on this machine — 2026-08-02

psycopg connecting to the dockerised PostgreSQL via `localhost` stalls ~2
minutes per connection (IPv6 ::1 tried first against the Docker proxy);
`127.0.0.1` connects in 0.04s. This is why the doorway pytest run crawled for
an hour with zero output and why seed/server pools threw PoolTimeout.

**Why:** the pool's 30-second timeout is shorter than the ::1 stall, so every
symptom looks like an unreachable or overloaded database.
**How to apply:** on this machine always use 127.0.0.1 in database URLs
(CW_TEST_OWNER_URL, CW_DATABASE_URL, CW_OWNER_DATABASE_URL); if a doorway
anything hangs ~30s per operation, check the host in the URL first.

## S224 — Owner addition: sourcing documents (RFP or RFQ, selectable) from the same intake — 2026-08-04

Mike added a second destination for the intake data: alongside the contract,
the system must generate a sourcing document — an RFP when suppliers are asked
to propose a solution, an RFQ when the spec is fixed and only price/delivery
are in question. Selectable by the requester; the interview may later
recommend a type. Proposal written: `SOURCING-DOCS-PROPOSAL-2026-08-04.md` —
same one-door language rule (approved section library + review-queue-only AI
candidates), requester scope prose is human-authored, lands after AI-1/AI-2
because it consumes the intake manifest. The pitch it unlocks: the draft
contract clause set rides along with the RFP/RFQ, so suppliers see the paper
before they bid. Three decisions put to Mike in the proposal (strict invariant
parity, terms-preview in v1, demo scope); none made yet.

## S225 — All six pending owner decisions MADE (front half + sourcing) — 2026-08-04

Asked and answered in one sitting.

**Front half (AI-FRONT-HALF-ARCHITECTURE-2026-08-02):**
1. Provider: **stay with OpenAI** on the existing seam; revisit at launch.
2. Budget: **proposed defaults accepted** — 200 calls/day, 4,000 tokens/call,
   administrator-changeable without a release.
3. Sequencing: **intake first** (AI-1 → AI-2 → AI-3); matcher's deterministic
   half may proceed in parallel.

**Sourcing documents (SOURCING-DOCS-PROPOSAL-2026-08-04):**
4. Invariant parity: **NO — looser rule for RFP/RFQ, by design.** Mike,
   verbatim: "We must use a looser rule for this. The AI will be responsible
   for authoring of customized questions and/or deliverables. MOST of the
   document can be deterministically generated but not all of it." Contracts
   keep the strict zero-AI-characters guarantee untouched; sourcing documents
   may carry AI-authored spans (supplier questions, deliverable descriptions)
   recorded as such — the provenance count is computed and kept, just not
   required to be zero for this document class.
5. Terms preview: **yes, in version one** — the draft contract clause set
   rides with the RFP/RFQ.
6. Demo scope: **full pipeline** — the design-partner demo shows
   intake → RFP/RFQ → contract end to end (demo gate includes SRC-1..4).

**Why this matters to the pitch:** the product now states two rules instead of
one, and both are provable: "contracts contain zero AI-authored characters;
sourcing documents label every AI-authored span." That is still a governance
story no incumbent tells.

Build order unlocked: AI-1 (deterministic intake) → AI-2 (intake screens) →
AI-3 (model intake, OpenAI, budget defaults) → SRC-1..4 → full-pipeline demo.

## S226 — The typefaces are served from the repository, not a font CDN — 2026-08-04

Found during the adversarial review of the UI design proposal
(`PROPOSAL-REVIEW-REPORT-2026-08-04.md`): `prototype/v4/index.html` fetched all
five typefaces from Google's font CDN on every page load, and so did the v5
mockup. Two costs, neither of them cosmetic. It reported every page view — the
customer's IP address — to a third party, which is a question a buyer's security
team asks during procurement and an awkward one for a contract vault to answer.
And it failed *silently*: behind a firewall that blocks the call the page still
worked but fell back to system faces, so the parchment typeset look — the thing
the product's whole "looks like a system of record" argument rests on —
disappeared on the machine of the most security-conscious customer.

Fixed at Mike's instruction the same day. Eighteen `.woff2` files now live in
`prototype/v4/app/fonts/`, 645 KB, latin + latin-ext only; `app/fonts.css` is
generated and points at them; the mockup borrows the same copies rather than
keeping a second set. Deduplicating by URL took it from 1,816 KB to 645 KB —
Google serves ONE variable font per family and repeats it per weight, so six
Inter weights are one file. Cyrillic, Greek and Vietnamese are deliberately not
bundled; adding a subset is a re-run of `fonts/fetch-fonts.py`, not a redesign.
All five families are SIL OFL 1.1, which permits this provided the licence
travels with the fonts — `fonts/OFL.txt`. Worth a lawyer's glance before a
paying customer, on the principle that a contract-governance company should be
able to account for its own licences.

**Inter and JetBrains Mono are kept even though parchment never renders them.**
They are dark mode's faces, and [[S95]] made dark mode one deleted `<link>` line
away. That reversal only works if its typefaces are still present.

**Still open, deliberately.** The app also loads React, ReactDOM and Babel from
`unpkg.com` (`index.html:23-25`). They carry integrity hashes so they cannot be
altered undetected, but it is the same outbound third-party call — and unlike
the fonts, the application does not run *at all* if it fails. Larger job, not
done, recorded in `prototype/v4/app/fonts/README.md`.

## S227 — Five owner decisions on the Intake and Negotiate screens — 2026-08-05

Put to Mike with the plan (`NEGOTIATE-AND-INTAKE-SCREENS-PLAN-2026-08-05.md`) and all five
answered in one sitting.

- **`NI-1` — the Legal admin gets a NINTH area, `negotiations`.** My recommendation was to
  leave it at eight and give the admin the numbers through reporting; Mike asked for the desk
  itself and that is the decision. The workspace table in `shell.jsx` is the specification and
  the acceptance test asserts it exactly, so this is a deliberate change to a checked contract,
  made in one commit with its test. The rail is now nine deep — a layout question to revisit
  when sourcing and obligations grow the admin further, not a reason to withhold the screen.
- **`NI-2` — the auditor reads the negotiation inside `the record`,** as a section, not a new
  tab. Keeps the workspace model untouched and puts the negotiation beside the rest of that
  agreement's chain.
- **`NI-3` — escalating a position and opening a review ticket stay two buttons.** The backend
  already keeps them two acts deliberately; one button performing both is how a person ends up
  having performed a governed act they never saw.
- **`NI-4` — the supplier's received document becomes downloadable, by everyone who can read
  the deal** (Legal, the auditor, the owning requester). Built the way `GET /runs/contract` is
  built: names one artefact, resolves it under the caller's own read rules first, no bytes on
  any refusing path. **Scoped by the round's own read policy rather than a role list in the
  doorway** — so the rule stays the database's. The viewer still has no export and gains none;
  `ADR-0008` is untouched, and the next screen wanting "a download like that one" is its own
  decision.
- **`NI-5` — question-set coverage (how often intake answers classified as nothing) belongs to
  the ADMINISTRATOR, not Legal.** Mike, verbatim: "This sounds like an admin issue not something
  legal needs to see." It lands with the health tiles, where "something is not working" already
  lives; the administrator already reads the audit chain, so no new grant.

**Flagged, not blocking** (warn, don't gate): Legal edits `intake_walk.json` but under `NI-5`
does not see the figure that judges it, so a gap in the questions travels through a second
person before reaching whoever can fix it. It is one view read twice, so adding a Legal surface
later is not rework.

**Why the plan is cheap:** both screens sit on machinery already merged — `intake.py` with its
two endpoints, and the whole negotiation family of reads and writes — with no screen. The only
gaps found were the negotiation HEADER list (we could read a negotiation's rounds and positions
but not which deal, whose paper, which baseline) and the received document being recordable but
never readable. One migration in the whole plan, in `IN-2` alone.

## S228 — The administrator gets acts, not just screens: the notice record — 2026-08-05

Mike, immediately after the S227 decisions: "Give the admin a feature to notify legal about
intake question gaps when they arise. Indeed, the admin should have a lot of abilities to
notify different user types based on data they observe. Things have to be escalated somewhere."

The observation behind it is right and had not been named: the administrator watches health
checks, unreachable people, the outbox and (now) the intake question set, and every one of
those is a screen they can look at and nothing they can DO. Planned as `NT-1`…`NT-4` in
`NEGOTIATE-AND-INTAKE-SCREENS-PLAN-2026-08-05.md` §5b — one act, "raise a notice", against a
`cw.notice` record with its own acknowledgement act and a `cw.notice_route` table of permitted
raiser-role → recipient-role pairs.

**Four design choices made rather than put back to Mike**, each the guard against this
becoming a messaging system:

1. **A notice always cites a subject the raiser can already see — no free-standing messages.**
   The administrator deliberately cannot read contract operations (reporting refuses them); a
   prose message box would let them narrate operations anyway.
2. **It appears in the existing `cw.waiting_for` derivation**, so it reaches the workspace
   panel and the daily digest from ONE derivation — screen and email cannot disagree. No bell
   and no red dot: the waiting list IS the notification system, and a bell competes with it
   and wins badly.
3. **A notice never gates anything** — warn, don't gate on approval. A screen that refuses to
   proceed because a notice is open is the defect, not the notice.
4. **Who may notify whom is `cw.notice_route`, a table**, not an `if role ==` in the doorway.

**Named trap for whoever builds it:** `cw.waiting_for` has been re-created four times (0041,
0044, 0059, and NT-1 makes five). Re-creating it strands mutation-harness patterns anchored on
the old text — that is [[S220]], which happened three times in one day. Grep the harnesses for
`waiting_for` patterns BEFORE committing, then run the harness (the migration requires it
anyway).

**Deliberately not built:** Legal → requester, and auditor → legal admin. Both are obvious once
the record exists, and both are a row in `cw.notice_route` plus one control — cheap enough to
wait for somebody actually wanting them rather than being guessed at now.

## S229 — Intake and Negotiate screens built for every role that has one — 2026-08-05

The whole plan (`NEGOTIATE-AND-INTAKE-SCREENS-PLAN-2026-08-05.md`) built the same day it was
written, decisions and all. What landed:

- **NG-0** — two reads the negotiation family never had: `GET /negotiations` (the header list;
  four reads described what was happening INSIDE a negotiation and nothing named the
  negotiations themselves) and `GET /negotiations/movements` (how a position reached its rung).
  Plus `GET /negotiations/paper`, the supplier's document back out (NI-4).
- **IN-1** — `prototype/v4/app/intake.jsx`: the probe walk, the proposal drawn PENDING until a
  named person confirms it, `unmatched` shown as a plain fact, then the same pre-flight and the
  same recorded act as a hand-typed manifest. `AssembleContract` gained a `start` prop rather
  than being copied.
- **NG-1…NG-4** — `negotiate.jsx`: one set of components, three compositions (requester's own
  deals, the Legal desk, the auditor's read-only section inside the record).
- **IN-2 / migration 0063** — the intake question set judged, in the administrator's health
  workspace (NI-5).
- **NT-1…NT-4 / migration 0064** — the notice record: raise, route, acknowledge, and one branch
  added to `cw.waiting_for` so it lands in the panel and the digest.

Verified end to end over HTTP by the extended `acceptance_walkthrough.py` and in the browser as
five different people.

## S230 — The auditor cannot download the supplier's paper, and NI-4 did not change that — 2026-08-05

Owner decision NI-4 said everyone who can read the deal may take a copy of the counterparty's
document, and the auditor reads every deal. But handing a document out is recorded on the chain
BEFORE the bytes leave (documents.py's order, and the only thing that makes a download evidence),
and `cw.audit_event`'s append policy (0007) names the requester and the two Legal roles.

**An auditor reads the whole record and adds nothing to it** — the older rule, left standing.
Pinned by a named test in `test_redlines.py` rather than discovered later.

**How to apply:** if Mike wants the auditor included, it is a grant on the chain and that test
moves with it. It is a decision about what an auditor is, not a bug.

## S231 — A document store's read policy is not a fence; resolve through the round — 2026-08-05

`cw.received_document` carries a `read_all` policy (`app_role() is not null`) from 0047, when a
stored document was only ever reachable by somebody who already held its id. The obvious
implementation of the supplier-paper download — take a document id, read the row — would have
handed one requester another requester's supplier paper, and passed every test that only checked
"the owner gets their bytes".

`GET /negotiations/paper` therefore names a **round**, reads it under the caller's own rules, and
takes the document id off the row the database was willing to show.

**Why:** the fence has to be the table whose policy expresses the rule you mean ("everyone who
can read the deal"), not the table the bytes happen to live in.
**How to apply:** when adding any endpoint that serves stored bytes, ask which table's policy is
the sentence you want, and resolve through that one first. See [[clausewerk-u15-documents-in-database]].

## S232 — The deterministic intake records `fallback`, never `intake` — 2026-08-05

`POST /intake/classify` answers `source: "intake"` — its own name for the classification event.
`cw.run.manifest_source` accepts exactly `llm`, `fallback`, `manual` (0005), and ADR-0005 calls
the keyword classifier the deterministic fallback. A screen forwarding the classifier's own label
is refused at the FINAL act, after the requester has answered every question, in a sentence about
a field they never saw.

**How to apply:** the intake screen sends `fallback`. When the model intake (AI-3) lands it sends
`llm`. The acceptance walkthrough now walks all four steps so this cannot pass a unit test and
fail a person.

## S233 — cw.waiting_for re-created a FIFTH time; two mutation rows repointed — 2026-08-05

0064 adds the notice branch to `cw.waiting_for` (after 0041, 0044, 0059). Two harness rows were
anchored on text this changed:

- the ticket-route arm lost its trailing semicolon (it is no longer the last line), so
  `routing.test.mjs`'s row was repointed to the semicolon-less substring — which now matches
  BOTH the 0059 and 0064 copies, so every definition is sabotaged.
- `shell.test.mjs`'s countersign-queue row was repointed after the shared component gained a
  `routes` prop, and the viewer-approval row after another session re-indented it into the
  origin-gutter markup. Both reported STALE at preflight rather than silently passing.

**Why:** this is [[S220]] for the fourth and fifth time. The harness preflight catches VANISHED
text; it cannot catch text that survives in a superseded copy, which is why the repoint has to be
to a substring common to every copy.

## S234 — Windows line endings broke five source-reading tests — 2026-08-05

A Python patch script rewrote `reviewer.jsx` and `console-people.jsx` with CRLF (`write_text`
translates `\n` to `os.linesep`). Five `shell.test.mjs` assertions extract a function with
regexes ending `\n\}\n`, which cannot match `\r\n}\r\n`, so `exec` returned null and the tests
failed with "Cannot read properties of null" — a message that says nothing about the cause.

**How to apply:** when patching these `.jsx` files from Python, write bytes or pass
`newline='\n'`. The app sources are LF; the source-reading tests depend on it.

## S235 — Verification of the intake/negotiate build — 2026-08-05

All green, and worth recording what "all" covers so nobody re-runs it hopefully:

- **37/37 SQL suites**, including a new `notices.test.mjs` (16 tests, four rules).
- **279/279 SQL mutations** caught by their named test. Five new rows for the notice record;
  two existing rows repointed ([[S233]]).
- **shell.test.mjs 103/103.**
- **Doorway pytest: 1163 tests across the five affected files** (`test_reads`, `test_writes`,
  `test_redlines`, `test_intake`, `test_server`) — 1093 + 70. The FULL doorway suite was not
  run to completion: it takes over an hour on this machine and PostgreSQL dropped into
  recovery mode under the load of a pytest run and the mutation harness at once. That is a
  machine limit, not a result — say so rather than claiming a full green.
- **The acceptance walkthrough** runs the whole path over HTTP and is re-runnable against a
  scratch database; it now covers intake (4 steps) and negotiation (open → redline in → bytes
  back out → contest → escalate → the reviewer's desk sees it).
- **The browser**, as five different people.

**How to apply:** run the doorway pytest and the mutation harness one at a time on this
machine. Running both at once crashed PostgreSQL into recovery.

## S236 — AI-3 built: the model proposes the manifest, the word lists fall back — 2026-08-05

Mike, correcting a framing I had let stand: "The system is not supposed to just
scan for keywords in requestor answers. It's supposed to use AI to categorize risks
into clause- and risk-severity-buckets." He was right, and the gap was real — AI-1
(the keyword fallback) and AI-2 (the screens) were built and AI-3 was not, so what
was on screen was the fallback wearing the intake's clothes.

**My failure, recorded because it will recur:** the plan said the screens were
scoped to AI-1/AI-2 and Mike's own sequencing decision put AI-3 third — but I never
said in one plain sentence "the thing behind this screen is the fallback; the real
one is the next package". He found out by asking why it behaved stupidly. When a
package ships a deliberate placeholder, say so in the summary, not only in the plan.

**What landed:**
- `advisory.propose_intake_manifest()` on the existing seam — the third thing this
  product asks a model, and the first whose answer a person acts on. Never raises;
  every failure is an absence with its reason.
- Migration 0066: the budget as two operational settings (200 calls/day, 4,000
  tokens/call — the defaults Mike accepted, [[S225]]) and `cw.model_call`, an
  append-only ledger. **Failures are rows too**; a ledger of only successes makes
  the model look more reliable than it is, in the exact figure somebody budgets from.
- `intake.classify_intake` tries the model, falls back to the keyword classifier,
  and returns WHICH PATH RAN plus why the model did not answer.
- The screen labels the path, and splits the human-voice idiom: the oversized
  quotation mark (which in this product means A PERSON SAID THIS) stays on the
  requester's own quoted words on the fallback path, and the model's reasoning is
  set plainly and labelled. Wrapping a machine's sentence in the human idiom would
  be this product's own failure mode on its own screen.

**Three rules enforced, not requested:** the model may not invent a category (told
the library's list; anything outside it is dropped AND recorded in
`not_in_library`), may not author contract language (ADR-0001 — it never sees clause
text; the engine picks wording afterwards), and decides nothing.

**The daily count is system-wide, not per caller** — a per-person count would give
every requester a private 200. But a requester READS only their own calls. Both are
deliberate and in tension: you may know the budget is spent without being shown
whose work spent it.

## S237 — `source: "intake"` would have been refused at the last step — 2026-08-05

`POST /intake/classify` answered `source: "intake"`, its own name for the
classification event. `cw.run.manifest_source` accepts exactly llm, fallback,
manual (0005). A screen forwarding that label is refused at POST /runs — AFTER the
requester has answered every question, in a sentence about a field they never saw.

Two tests pinned the wrong value because they were written from the code rather than
from the record. Both moved; one now asserts the source is in the run store's own
list, with the list written out rather than imported.

**How to apply:** when an endpoint labels its own output, check the label against
the constraint of whatever stores it downstream. A vocabulary that only agrees with
itself is not a vocabulary.

## S238 — A grant with no policy behind it, swept schema-wide — 2026-08-05

Third instance of the silent-zero shape, so it got a sweep:
`db/test/grants-and-policies.test.mjs`. For every table with row-level security,
every role holding SELECT must be admissible by some policy — otherwise PostgreSQL
FILTERS rather than refuses and the screen says "there are none" where the truth is
"not yours".

**It is a LINT and says so.** The sound test needs a row in every table; that rots
the first time a migration adds one. This reads policy expressions as text.

**Its first run reported 29 suspects and all 29 were false alarms of one shape:**
policies that delegate — `exists (select 1 from cw.review_ticket t where ...)` —
which admit exactly whoever the PARENT's policy admits, naming no role because they
do not need to. The lint was taught that shape; it was not loosened. It keeps every
tooth on the shape that actually bit twice: a policy enumerating roles and omitting
one that holds the grant.

**A mutation row puts back 0065's revoke and requires the sweep to fail** — a lint
nobody has seen fail is a green light with nothing behind it.

## S239 — The fallback classifier read a denial as a mention — 2026-08-05

`intake.classify_answers` matched term lists as case-blind substrings over the whole
answer, so "No personal data is involved in this purchase" contained the phrase
"personal data" and proposed Data Privacy at the person who had just said the
opposite. Severity had the same fault ("no health data" read as High). Since AI-3
this is the FALLBACK path ([[S236]]) — it runs when there is no key, no network or
the day's budget is spent — but a fallback that argues with the requester costs
confidence in the whole screen.

**The rule now, in the sentence a requester gets:** a term counts wherever it
appears, except where the few words just before it, in the same sentence, deny it.

**The trade-off was decided in one direction and written into the code.** A risk
proposed that is not there costs seconds and one removal on a screen the requester
must read anyway; a risk NOT proposed costs a clause missing from a signed contract
that nobody notices at the time. So everything short of a plain denial still
proposes: a denial more than three words back, a denial in another sentence, a
denial before "but"/"except", two denials that cancel — and any internal failure at
all falls back to plain substring matching and never raises, because ADR-0005's
fallback must not stop a requester's work.

**Three tests exist purely to keep the errors on the harmless side** — they assert
that doubtful cases are STILL proposed, so a future "smarter" reading that starts
dropping them goes red. A mutation row (`a denied mention is read as a mention
again`) proves the denial reading is guarded; nothing downstream could catch it,
because a denied mention produces a perfectly valid proposal for a real category.

**NOT KNOWING IS NOT SAYING NO, and the first version got that wrong.** "It is not
clear whether personal data is involved" was read as a denial and silenced — the
exact case where a person most needs to see the risk, because the requester has just
said nobody knows. Corrected the same day on review: a denial followed by a word of
doubt ("clear", "sure", "certain", "known", "know", "whether", "if", "yet",
"confirmed", "say" …) is set aside and the risk is proposed. Two tests hold the pair
— one that doubt proposes, one that a plain "no" still does not.

**Known residual, stated rather than papered over:** a denial that FOLLOWS its term
("personal data is not involved") is not read at all, so it over-proposes; and a
genuine denial with a doubt word between it and the term — "no clear personal-data
requirement exists" — now proposes too. Both are the harmless direction. The costly
direction is a real denial landing within three words of a term while meaning
something else, which is why the window is deliberately short.

## S240 — A number that cannot fail is not a measure: the intake coverage screen came out — 2026-08-05

Built in the morning (0063), removed the same day (0067). It counted intake
questions whose plain-word answers matched none of Legal's term lists and showed
the result to the administrator as gaps in those lists.

**Two defects, and the second one could not be fixed.** Four of the six intake
questions carry no category at all — what are you buying, from whom, for how much,
for how long — so they have no term list to match and were reported as gaps they
could never *not* be. The single "gap" the demo produced was the question asking a
requester to describe their purchase: a false alarm, and the only reading anybody
ever got. Narrowed to the two questions that do carry a category, the figure still
cannot tell "our word lists missed something" from "there was nothing to find" —
the requester who correctly says there is no personal data looks identical to the
one describing a serious exposure in words we do not recognise.

**Mike's decision: remove rather than narrow — a weak number on a screen is worse
than no number.** An administrator who reads a figure they cannot act on learns to
skip that panel, and the panels beside it must not be skipped.

**The notice record survived intact; only the `intake_probe` subject kind went.**
It was one of four kinds and the only one whose sole surface was the removed screen.
The other three — `notification_gap`, `health_tile`, `account` — all still have live
screens, so the kind was removed rather than repointed: a kind kept alive against a
future surface is a kind whose visibility rule nobody re-reads. The check constraint
was re-added NOT VALID, because `cw.notice` is append-only and a validated one would
have demanded the migration rewrite notices already raised.

**How to apply:** before building a counting surface, ask what its silence means.
If "zero" and "we are blind" produce the same number, there is nothing to build.

*Both records above were written S239 by two agents working in parallel and
blind to each other; the second was renumbered on integration. Worth knowing
the next time work is split this way — a sequential id is a shared resource,
and nothing stopped them both taking it.*


## S241 — A model that was never asked is not a call: the budget was billing decisions — 2026-08-06

`cw.model_calls_today()` (0066) counted every row in the model-call ledger. The
doorway writes a row even where it **declined to dispatch anything** — no key
installed, an unusable model name, a library with no categories, answers too
large to send, every provider slot taken. The keyless case is not exotic: it is
every development machine and every deployment not yet configured.

**So a system that had never spoken to a provider in its life still ran its 200
a day to zero**, and past that point stopped telling requesters "no model key is
configured" and started telling them "today's model budget is spent (200 of
200 calls)" — which was false. The administrator's cost figures carried the
same inflation, in the one number somebody budgets from.

**0066 had already written down the rule it then broke.** Above the table:
"the whole point is that 'the model was not asked' and 'the model was asked and
could not answer' are different facts, and neither may hide." The table it
created has one `outcome` column with two values, and `absent` collapsed exactly
those two facts. The sentence was right; the schema underneath it was not.

**Verified before anything was written.** Three intakes on a keyless deployment
→ three ledger rows, `calls_today` = 3, no provider contacted.

**The fix says the third fact out loud** (0068): `outcome` takes a third value
`not_asked`, still obliged to carry its reason, and the daily count skips it.
`advisory.Proposal` gained `asked`, false at the five sites that return before
dispatch and true from the dispatch onward — so a provider that WAS reached and
failed is still `absent` and still billed. That line matters in both directions:
under-billing a real failed call would hide real spend.

**The row is kept, not removed, and that was the harder half of the decision.**
How often the system falls back and why is what AI-7 reports on, and a
deployment silently never asking is precisely what an administrator must be able
to see. Recorded is not the same as billed.

**A mutation row had to be REPOINTED, not just added.** The existing row
watching `model_calls_today()` named 0066's text, and 0068 replaces the whole
function with `create or replace` — so the mutation would have been overwritten
before any test saw it, and the guard would have gone silently green. That is
S110 and B10 for the third time; the harness's own "imprecise" report caught the
new row's `expect` naming a sentence instead of a test name, which is worth
knowing: `expect` is the TEST NAME, exactly.

**How to apply:** when a counter exists to bound a cost, check what it counts
against what actually costs. A cap charged for decisions rather than for spend
is a cap that lies in the direction of doing less work than the owner paid for.

## S242 — The header guard had been red since the Host check landed — 2026-08-06

`test_the_service_reads_exactly_one_header` reads server.py's own source and
refuses to let the set of headers the service consults grow. It had been
**failing on main** since fb44d17 ("Require an unambiguous HTTP Host") added a
sixth, `host`, and nobody updated the list.

**The missing name is not the defect. The red guard is.** A test that fails
identically whether the rule holds or is genuinely broken reports nothing: the
next person reads it as noise and scrolls past, and the protection is gone while
still looking present. It sat that way through at least one full-suite run.

**`host` does belong on the list, and the reasoning is the point.** The rule is
not "read few headers" — it is that no header may say anything about who is
calling or what they may do. `_host_is_ambiguous` runs first in do_GET, do_POST
and do_OPTIONS and its only outcome is a 400; the names it accepts are fixed in
`serve()` (`localhost`, `127.0.0.1`), not taken from the request; nothing
downstream reads the value. It can refuse and do nothing else. It exists to close
DNS rebinding, which CORS cannot: once an attacker-controlled name resolves to
loopback, their page and this service look same-origin to the browser.

**Widened WITH its justification written beside it**, and a line saying a
seventh name deserves the same paragraph — if one cannot be written for it, it
does not belong. A number raised silently is how a guard becomes a rubber stamp.

**Checked in both directions, not just green.** After the fix, a seventh header
(`x-forwarded-for`) was temporarily added to server.py and the guard failed as
it should; server.py was then restored. A guard is only proved by watching it
catch something.

**How to apply:** when a security change lands, check what was watching the thing
you changed. Two separate defects this week ([[S241]] and this one) were guards
left pointing at code that had moved — CLAUDE.md's mutation-harness rule is the
same lesson written down for migrations only.

## S243 — A test that tampered with a snapshot the schema had since sealed — 2026-08-06

`test_a_snapshot_that_does_not_rebuild_produces_no_document` proved the doorway
refuses to build a document when a run's pinned library no longer rebuilds to
the stored fingerprint. To reach that state it added a clause to the pinned
library after the run existed, as the Legal admin. **Migration 0058 closed that
door**, and the test had been red on main ever since — failing in its own setup,
never reaching the endpoint it was about.

**The schema is right and did not move.** 0058's opening lines name the defect it
closed: the original append-only guards stopped edits and deletes but still let a
working role ADD a member afterwards, "permanently changing the replay input of
every run already pointing at the id."

**The test moved into the shape the same file already used one test below it.**
`test_a_stored_member_with_no_clause_row_...` had faced this exact situation and
handled it honestly — record that the condition cannot be induced through the
front door, say why that is the schema working, then prove the WIRING. Same
treatment here: the rebuild is driven to return a different id, and every
assertion that mattered survives, including the one the test existed for — the
refusal names BOTH ids, because "it does not rebuild" with no numbers is a dead
end for whoever reads it.

**NOT re-induced as the owner, and the old test said why before I did:** "a
fixture that reaches past the row rules to break something can break things the
system would never allow." A defence proved against a state the product cannot
be in proves nothing.

**A SECOND TEST WAS ADDED, and it is the more important half.** With the first
test no longer reaching through 0058's rule, nothing in that file would have
noticed if the rule were removed. `test_a_referenced_snapshot_cannot_gain_a_
member_at_all` now asserts it directly, as the most privileged role holding
insert on `cw.snapshot_member`. **When a test stops exercising a guarantee as a
side effect, the guarantee needs its own test — otherwise hardening silently
deletes coverage.**

**Checked by breaking it, not by going green.** The both-ids assertion was proved
to bite by temporarily dropping the rebuilt id from documents.py's message.

*Third guard-pointing-at-moved-code defect in two days ([[S241]], [[S242]], this).
The pattern is always the same: a correct change lands, and the thing watching
the old behaviour is left where it was.*

## S244 — A concurrency test that raced the machine it ran on — 2026-08-07

`test_risk_judgments_share_the_provider_concurrency_ceiling` starts twelve
callers against four provider slots and asserts exactly four get through. It held
each slot with `time.sleep(0.05)`, so the assertion was only true if all twelve
threads reached the semaphore within 50ms of each other. Thread start-up is not
bounded by anything of the sort: **under full-suite load the early callers
released before the late ones arrived, more than four got through, and the test
failed while the product was working perfectly.** It passed run alone.

**That is the worst way for a guard to behave** — worse than always-red, because
the failure looks like a real one and re-running makes it disappear. The next
person learns that a red result here means nothing, and the first genuinely
unenforced ceiling gets the same shrug. Same disease as [[S242]], different
symptom.

**Nothing in it needed elapsed time; it needed ORDERING.** No slot may be
released until every caller has tried for one. The attempts are now counted where
they actually happen — a proxy around `_JUDGMENT_SLOTS` counting `acquire`
whether or not a slot is granted, because **a caller turned away has still
arrived**, and it is arrival, not success, the barrier waits for. The twelfth
attempt opens the gate the in-flight calls wait on.

**`peak` became an equality.** It was `<= ceiling` and `> 1`; with the barrier it
is exactly the ceiling on any machine at any load. A weaker assertion was being
paid for entirely by the flakiness.

**The gate wait is bounded AND the bound is asserted.** If the code stops
consulting the semaphore, fewer than twelve attempts arrive and the gate never
opens — waiting forever would turn a real regression into a hung suite. The wait
carries 30s and the test then asserts the gate opened, so a timeout reads as a
failure, never as a pass. Verified: neutering the acquire on the risk path fails
in 30s via that assertion rather than hanging.

**The first probe was a bad probe, and it is worth recording why.** Raising
`MAX_CONCURRENT_JUDGMENTS` from 4 to 7 left the test green — correctly, because
it asserts the ceiling is ENFORCED, not that it is 4. A test that pinned the
number would go red on a legitimate config change. The real probe is removing the
enforcement.

**Determinism proved by repetition, not by one green run** — 15 consecutive runs
while the full doorway suite ran concurrently, all passing. "Passes once" is
exactly what the old version also did.

## S245 — A "security finding" that was an owner decision, caught one step before the migration — 2026-08-07

A scan of `cw.received_document` found `read_all ... using (cw.app_role() is not
null)` and proved by probe that **the administrator reads the raw bytes of a
counterparty document on a deal owned by somebody else.** A plan and migration
0069 were written to narrow the policy and revoke the grant.

**Both were deleted unmade. It is decision U5, working exactly as the owner
settled it** (2026-07-26): the Administrator is *"Steward, with sight"* —
content-visible and content-powerless. `docs/open-questions.md:61` states the
accepted cost in the very words the probe reproduced: "the person who
administers accounts can read every deal, manifest, negotiation position **and
supplier redline** in the system", contained by the role being able to change
none of it. The owner also said in terms **never to describe the role as
content-blind**, which is precisely what the migration would have made it.

**How the wrong conclusion got so far.** It was built entirely from migration
prose, and the prose was genuinely suggestive: 0055 had closed the same
asymmetry on the INSERT side, and 0065 withdrew the administrator's read of the
whole negotiation family with the line "a door onto a record they cannot reach
would be dead machinery". Three migrations pointing one way is a persuasive
story. **0065 was not narrowing U5** — those tables' policies never admitted the
administrator at all, so the grant was dead, and 0065 removed a dead grant rather
than adding a policy, saying explicitly that widening a role's read is an owner
decision. Different fact, same shape.

**What actually stopped it: the existing test.** `received-documents.test.mjs`
carries `test('the administrator reads (U5) — ...')`. The decision was cited in
the test name. Had the test only asserted a count with no "(U5)", the migration
would have gone in and taken a green suite with it, because the test would have
been "fixed" alongside.

**How to apply:** before narrowing any role's access, grep the role and the
table against `docs/open-questions.md` and the U-decisions in `memory.md` —
migration prose describes what the schema does, never what the owner chose. And
when a test encodes a decision, **name the decision in the test name**; that
string is what stops the next person from deleting the guarantee.

*Related: [[clausewerk-owner-decisions-settle-in-later-migrations]] is the
mirror of this — a decision can move in a later migration, so neither the
migration nor the decision list is authoritative alone.*

## S246 — The suite leaked a database every time it was interrupted, and the cleanup was a comment — 2026-08-07

`conftest.py` builds a database per run named `clausewerk_doorway_<pid>` and
drops it at session teardown. **Teardown is exactly what does not run when a run
is killed or the server dies under it.** Every interrupted run left a full copy
of the schema behind.

**The cleanup was documented as already happening.** Two places said so — the
comment above `TEST_DATABASE` ("stale ones with nobody connected are cleaned up
at the start of the next") and `TEST_DATABASE_PREFIX` itself ("Only ever used to
clean up databases this file created"). The constant was **read by nothing**.
The teardown's own note said "The next run clears it"; the next run has a
different pid, names a different database, and never looks.

**Found while chasing something else, which is how it should be read.** A full
suite came back with 50 errors, then 366, in different files each time, all
`server closed the connection unexpectedly` during migration. Not a code
failure: PostgreSQL had terminated abnormally twice (05:40, 05:57), on a host
disk at 97%. 22 abandoned databases, 587 MB. After the sweep: 3, 31 MB.

**TWO SIGNALS, BOTH REQUIRED, and the reason is the per-pid naming itself.**
Databases are named per-pid so suite runs can go in PARALLEL, so a sweep that
took a live run's database would break it in a way that looks like a product
failure. A database is dropped only when the pid in its name is not a live
process AND nothing is connected to it. Pids get recycled, so a dead run's
number may now belong to something else — that reads as alive and the database
is kept. **Every uncertainty resolves towards keeping it**; being too eager is
the costly direction.

**`os.kill(pid, 0)` IS NOT THE LIVENESS CHECK, and this one bites.** On Windows
`os.kill` with any signal other than CTRL_C_EVENT/CTRL_BREAK_EVENT calls
TerminateProcess — the check would kill the process it was asking about, and on
a pid collision that could be something of Mike's. `ctypes.OpenProcess` on
Windows, `os.kill` only on POSIX. A test pins both answers.

**Proved in both directions outside pytest**, because the interesting case
cannot be staged from inside a run: a database named for an impossible pid is
dropped, and one named for the running process is left alone.

**How to apply:** a comment describing cleanup is not cleanup. When a constant
exists only to be used by a rule, grep for its uses before believing the rule
runs — this is [[S241]]'s lesson again, one layer down: the thing that was
supposed to be watching had never been wired up at all.

## S247 — A scan pass that found nothing, written down so it is not repeated — 2026-08-07

Recorded because an unrecorded negative gets re-run. Swept this pass, no defect
found:

**`manifests.py` (the trust boundary), `runs.py` (record/store), `executions.py`
(the three gates), `redlines.py`, `analysis.py`, `notifications.py`.** All
heavily guarded. Two claims were checked rather than taken on trust:

  · `notifications._digest` says it cannot leak contract content "by
    construction". True — the query hands it `kind, subject_ref, due_on, since`
    and nothing else, so clause text, negotiation positions and document bytes
    are never in scope to leak.
  · `executions.execute` takes `agreement_id` and `run_id` through `.strip()`.
    A non-string would crash into a 500, but `TEXT_FIELDS` rejects it at the
    boundary first. Checked because the same shape WAS the B1 defect one layer
    down.

**A declared-but-never-used sweep across `doorway/` and `engine/`** — the shape
that produced [[S246]] — found three constants only: `docx.NS`,
`model.ORIGINS`, `model.SUPERSEDED`. All three are vocabulary mirroring database
enums, held as documentation of the enum rather than enforcing anything. **Not
written up as defects**: nothing claims they are enforced, which is the
difference between these and S246, where two comments promised a cleanup that
did not exist.

**The guard-of-guards is real, and worth knowing about.** `mutation-check.mjs`
already enforces that every rule's `find` text still appears in some source file
and exits non-zero when one goes stale (its own note: "Absent means stale"). So
the repointing failure S110/B10/S241 all shared is caught mechanically now — the
same run also caught this session's new row naming a sentence instead of a test
name. What it cannot catch is a rule that was never written, which is the gap
S246 sat in.

**How to apply:** record the negative. Half of this pass was re-treading files an
earlier pass had already cleared, because nothing said so.

## S248 — 38 privileged functions, 2 guarded: the search_path sweep that was missing — 2026-08-07

A `SECURITY DEFINER` function runs with its owner's rights. If its `search_path`
is not pinned, the CALLER's path decides what the names inside it resolve to —
so an ordinary role creates an object of their own with a matching name in a
schema they can write to, calls the function, and their object runs with the
owner's rights. Standard escalation against this kind of function, and it is a
one-word omission in a migration.

**All 38 are correct today. Nothing was keeping them that way.** Two mutation
rows cover `cw.audit_chain` and `cw.audit_verify`, and both strip the
definer-ness and the path TOGETHER, so neither isolates the pinning. Searching
the whole test tree for `prosecdef` returned nothing.

**The check existed once, as a sentence in a report.** `bug_report.md`
(2026-07-28): "every one of the 26 privileged database functions is hardened
against the classic escalation trick." True when written — checked once, by a
person, at 32 migrations. There are now 69 migrations and 38 such functions.
**The population grew by twelve with nothing carrying the check forward.** A
finding in a report is not a guard; this is [[S246]] again, and the reason to
convert a one-off verification into a sweep the day it is made.

**READ FROM THE CATALOG, NOT THE MIGRATION SOURCES, and it is load-bearing.** A
later `create or replace` can drop a `set search_path` the original definition
had, and a scan of the source files would still find the old, correct one and
report calm. `pg_proc.prosecdef` + `pg_proc.proconfig` is the authority.

**Counting definitions is not counting functions.** The source scan said 47; the
catalog says 38, because several are create-or-replace of the same function. The
first population floor was set from the source number and the sweep's own
vacuity guard caught it immediately — which is the guard doing its job on its
first day.

**Proved to bite before being believed**, by creating a definer function with no
pinned path and watching the sweep name it. A sweep that has never been seen to
fail is not protection — this repo has caught a test that could not fail before
(2026-07-26).

**Stated limit, not patched around:** this checks a path is PINNED, never that
the pinned value is SAFE. A function pinned to a schema an ordinary role can
create objects in would pass. All 38 are `cw, pg_temp` today.

**How to apply:** when a one-off audit reports "all N of these are fine", ask what
makes N+1 fine. If the answer is a person remembering, write the sweep then.

## S249 — The view-scoping seam is already swept; three candidates chased to ground — 2026-08-07

A view runs with its OWNER's rights and does **not** inherit the row-level
policies of the tables beneath it (0017 wrote this down at length). So every
view granted to a role must carry its own scoping clause. A catalog probe found
**46 of 66 views granted with no scoping predicate in their definition**, which
looks alarming and is not.

**Three candidates were chased individually rather than reported as a set:**

  · **Most of the 46 read company-wide reference data** — the library, ladders,
    categories, the roster, and reporting aggregates granted only to Legal, the
    auditor and the administrator. Nothing per-deal to scope.

  · **`cw.sow_override_in_force` IS deal-scoped** (`sow_id` is a foreign key to
    `cw.agreement`) and IS granted to the viewer unscoped — the one that looked
    like a real finding. It is **deliberate**, and the reason is in memory.md at
    2026-07-26: the system itself reads this view to decide whether a statement
    of work may depart from its master, and scoping it made the system stop
    seeing approvals and refuse properly authorised work. *"A saved question the
    system consults to make a decision must answer the same way for everybody."*
    Locking it turns a privacy control into a correctness fault.

  · **The base table already admits the viewer anyway.** `read_scoped on
    cw.sow_override` lists 'viewer' unconditionally, so the view exposes nothing
    the policy does not. Worth knowing before writing up any view: check the
    policy underneath before blaming the view.

**THE SWEEP ALREADY EXISTS, and it is better than the one I was about to write.**
`views-are-not-policies.test.mjs` lists every view a **viewer** can read and
fails if one is not in a `REVIEWED` classification naming why it is safe. It is
guarded by TWO mutation rows: one that adds an unclassified view, and one that
leaves an entry claiming 'scoped' after the scoping was removed — so the LIST
cannot rot either, which is the failure mode a classification list normally has.

**Viewer is the right role to sweep, and only viewer.** Requester breadth is
Mike's decided openness model, Legal and the auditor read the record by
definition, and the administrator is U5. The one role with a genuinely narrow
boundary is the one the sweep covers.

**How to apply:** before building a sweep, search for the one that already
exists — this is the second time today ([[S248]] was the gap, this was not).
The tell is the mutation harness: `grep` the `expect` strings, they name every
guard in the repository in one place.

## S250 — I guarded the billing rule in the schema and not in the code — 2026-08-07

This morning's fix ([[S241]], 0068) stopped the daily AI budget being charged for
calls the doorway decided not to make. I added a mutation row for the SQL half —
the `outcome <> 'not_asked'` filter — and **none for the Python half**, which is
the part that decides which outcome gets written. It had ordinary tests. An
ordinary test proves the code works today; a mutation row proves somebody is
told when it stops. This repository's rule is that every guarantee gets a
deliberate attempt to break it, and I did half of it.

**Two rows, and the second is the one worth having.** Reverting
`return "absent" if self.asked else "not_asked"` restores the original defect —
over-billing, which shows up as a budget running out early: visible, irritating,
self-reporting. Flipping `_no_proposal`'s `asked` default to False **under**-bills:
every dispatched call that then failed, timed out or came back unreadable would
record `not_asked` and go uncounted. **That one is silent** — the figure simply
reads low forever, in the number somebody budgets from. `advisory.py`'s own
comment asks for the default; a comment asking is not a guard.

**The harness corrected me twice today, and both corrections were right.**

  · A row's `expect` must be the exact NAME of the catching test. My first
    attempt named a sentence and was reported *imprecise*.
  · `asked: bool = True` appears twice in advisory.py, so the harness reported
    the row **STALE — "it would mutate the first, which may be the wrong one"**
    and ran nothing. Re-anchored on `_no_proposal`'s multi-line signature, which
    is the load-bearing occurrence: every post-dispatch absence takes that
    default, and the dataclass field is only ever reached through it.

**A harness that refuses an ambiguous anchor rather than guessing is the whole
design.** Silently mutating the first match would have produced a green row
guarding the wrong line — a guard that reports success while watching nothing,
which is the failure this session has now found five times over.

**All three harnesses were green before any of this**: 57/57 engine, 43/43
doorway, 285/285 schema. Worth running unprompted — CLAUDE.md records both Python
harnesses going silently red once in two days, and neither had been run this
session.

**How to apply:** when a fix spans the schema and the code, the guard has to span
both. Ask which half a mutation would have to break to make the wrong thing
happen quietly, and guard that one first.

## S251 — 21 append-only tables could still be emptied in one statement — 2026-08-07

TRUNCATE fires no row triggers and applies no ON DELETE rules: it empties a
table in one statement leaving no per-row trace. 0001 named this exact failure
and put it better than a restatement would — *"a schema that raises loudly on
`delete from cw.clause_version` and empties the same table without complaint on
`truncate cw.clause_version` does not have an immutability guarantee; it has an
immutability habit."* It also made `cw.no_truncate()` shared so "a table added
later inherits the story by NAMING it".

**Forty-three tables named it. Twenty-one never did** — among them `role_grant`
(who holds which role), `model_call` (the spend ledger) and the whole override
apparatus (every authorised departure from a legal objection, and who it was
socialised to). 0070 closed it.

**Not a live hole, and it is not claimed as one.** No application role holds
TRUNCATE; it is owner-only. This is defence against operator and
maintenance-script error — exactly what it already was on the other 43.

**THE SWEEP I SET OUT TO BUILD WAS NOT SHIPPED, AND THAT IS THE PART WORTH
READING.** Deriving "which tables are append-only" needs telling an
unconditional guard from a conditional binding trigger. Three heuristics were
tried — any update/delete trigger, any trigger function containing a raise, a
raise with no `if` in the body — giving 66, 66 and 57. The third then returned
**different answers from byte-identical SQL in two files, in the same process**,
and that was never explained. So it was abandoned in favour of a named list of
the 64 guarded tables.

**A guard nobody can explain is worse than no guard: it reports calm for reasons
no one understands.** The named list is a smaller guarantee, honestly stated in
the file — it catches a guard REMOVED, not a new append-only table shipped
without one — with a count check to notice the list drifting. Both halves proved
to bite by removing `role_grant`'s trigger.

**The unexplained discrepancy is written into the test file rather than dropped**,
so whoever picks this up starts where I stopped instead of re-deriving it.

**Checked:** 39/39 schema suites, 286/286 mutations caught by their named test
(up from 285 — the new row lands), 1695 Python tests passed.

## S252 — A security tripwire that had been warning about a hole already closed — 2026-08-07

`test_unprotected_tables.py` exists to make a developer stop before a new file
reaches the five run-store tables directly. Its stated premise: those tables
have **no row-level security**, so nothing but the doorway's own discipline
prevents a read across every deal. **Both halves were false by the time the file
landed.**

    16:44  6fb4c97  "Scope run pins to visible runs" — enables RLS AND adds
                    read/write policies to all five
    18:57  62f0257  adds the tripwire, asserting the five have no RLS

Two hours apart, the same day. Almost certainly parallel work integrated in
sequence: the author verified against a tree that predated the fix. **Nobody was
careless — the guard arrived AFTER its danger was gone**, which is this
codebase's recurring defect ([[clausewerk-guards-point-at-moved-code]]) seen
from the other end, and the only instance so far that runs that way round.

**What made it worth fixing rather than leaving: the failure message stated a
false thing about the system's security.** It told a developer that resolving
through `cw.run` was the only thing standing between a caller and every deal's
evidence. It is not — 0005's policies scope a requester to pins "visible through
cw.run". Two costs, both real: somebody takes a risk elsewhere believing this
rule is uniquely load-bearing, and somebody who finds out the claim is false has
been handed a reason to distrust the test and delete it.

**Kept, not deleted, and the reasoning matters.** The catastrophic case it
warned about is now refused by the database, so its value drops from "the only
control" to defence in depth and house style — but resolving through `cw.run` is
still how this system reasons, and a file skipping it should be read by somebody.
Deleting would trade a true guard for nothing.

**`UNPROTECTED` was renamed to `RUN_STORE`.** The old name was the false premise
in one word, and **a name is what a reader trusts when they do not read the
comment**. Fixing a long docstring while leaving the identifier saying the
opposite would have fixed the smaller half.

**Re-checked and left alone:** `cw.audit_checkpoint` and `cw.schema_migration`
genuinely have no RLS and are deliberately outside the tripwire — neither holds
per-deal evidence. Verified against the installed catalog, not the comment.

**How to apply:** when a guard's premise is a factual claim about the system,
re-verify the claim, not just the test result. This one passed every run for ten
days while describing a system that no longer existed.

## S253 — The decision record said two shipped capabilities were missing — 2026-08-07

`docs/open-questions.md` §9b asserted in the present tense that six governed acts
**have no endpoint**, and named two as still absent outright: retention
destruction and clause supersession. Both shipped on 2026-08-02. `writes.py`
carries `POST /retention/destroy`, `POST /library/supersede` and
`POST /library/retire`.

**The file already contained its own correction, ten lines below** — the D-5
paragraph saying the six acts were "BUILT the same day" with migration 0062. The
paragraph was appended when the work landed; the present-tense claims above it
were left alone. So the section contradicted itself within one screenful.

**Same defect as the tripwire fixed the same day ([[S252]], c2aa7a6), one layer
out.** There, a test's premise was a factual claim about the system that stopped
being true and nothing re-checked it. Here it is the decision record. Both had
been wrong for days while everything around them passed.

**Corrected without erasing the history.** The reasoning about WHY those two acts
needed designing before building is what D-5 was answering, so it is kept and
framed as the gap AS FOUND, with a banner at the top of the section and each
stale sentence struck through and answered rather than deleted. A decision record
that quietly rewrites itself is worth less than one that shows its working.

**Why it counts as a defect and not tidying:** this is not product content — the
placeholder rule covers clause language and example contracts, not the record of
what is decided and built. Somebody reading it builds a capability twice, or
tells a customer the product cannot do something it does. And a section that
contradicts itself costs the WHOLE file its authority, which is worse than the
two wrong lines, because the rest of it is accurate and load-bearing.

**Spot-checked and accurate, left alone:** U11, U12, U13, U15. §9b was the only
self-contradicting section.

**How to apply:** when a work package closes, grep the decision record for the
sentences that described the gap it closed. The closing paragraph gets appended;
the claims above it do not update themselves.

## S254 — 139 routes require a session, and nothing checked it — 2026-08-07

Every route in the doorway refuses a caller with no session. Two are
deliberately exempt — `/sign-in` and `/sign-out` — and are handled ABOVE the
gate. **Nothing proved any of it.**

**What protects it today is structure, not a test.** `App.handle` calls
`caller_for` before dispatching, so a route registered in READS or WRITES
inherits the gate whether its author thought about it or not. That is why the
count is 139/139 and why this is prevention rather than a live hole.

**It is not sufficient, and the two exemptions show why:** they are early
returns above the gate, and a third would look exactly like them. The mistake
being guarded is not "somebody forgot a permission check" — it is somebody
adding an early return because their endpoint "doesn't need a user", without
noticing that **"doesn't need a user" and "may be called by anyone on the
network" are the same sentence.**

**MY FIRST GUARD DID NOT CATCH THAT, AND THE BITE TEST IS THE ONLY REASON I
KNOW.** It enumerated READS, WRITES and the specially-dispatched keys and drove
each with no token — which proves the 139 KNOWN routes are gated and is blind to
the one case that matters. A deliberately added public `/health-probe` sailed
through it green, because a brand-new early return is in none of those
collections. **A guard that enumerates a registry cannot see something that was
never registered.**

**So the check moved to where the mistake happens** — the source. It finds the
line inside `handle` that resolves the caller and asserts the only request paths
above it are the two exemptions. That version names `/health-probe`.

**A second, quieter fault, caught the same way:** anchoring on the first mention
of `caller_for` in the file landed in `preflight_session`, not `handle`, so the
scanned region was empty and the test passed over nothing — a vacuous pass
wearing a green tick. The anchor is now inside `handle` with the reason beside
it, and both faults are recorded in the test so the next person does not
re-derive them.

**How to apply:** when guarding against "somebody adds X", ask whether the guard
looks at a REGISTRY or at the CODE. A registry only contains things somebody
already registered — which is never true of the mistake you are guarding
against. Three sweeps this session were proved by breaking them; this is the
only one that failed its first bite test, and it would have shipped green.

## S255 — The web root served whatever was in it, to anyone — 2026-08-07

Static files are served BEFORE any session exists — necessarily, since the shell
has to load before anybody can sign in. So every file under the static root is
readable by anyone who can open a socket. **It served every file it found**, not
just the ones the screens are made of. Verified against a running server with no
token:

    GET /app/fonts/fetch-fonts.py  -> 200  text/x-python
    GET /app/fonts/OFL.txt         -> 200  text/plain
    GET /app/fonts/README.md       -> 200  application/octet-stream

**The cause is a lookup table mistaken for a gate.** `MIME` named six web types,
but the suffix was consulted only to CHOOSE A CONTENT TYPE — after the decision
to serve — with `mimetypes.guess_type` and then `application/octet-stream`
behind it. So an unknown suffix was served anyway, just less confidently.

Nothing in there is sensitive today. The point is that it is an ordinary
repository directory people add files to, and the day a database dump, a `.env`
or a page of notes lands in it, that file is published and nothing says so.

**The fix makes the table the gate**, checked before the bytes are read.

**`.woff2` had to be ADDED in the same change, and that was the only real risk.**
Eighteen font files were being served through the guess path; gating on the
existing table would have refused every font and broken every screen — a failure
no other test in the file would have caught. Closed by naming the type, never by
leaving the gate open. A test now asserts fonts still load, for exactly that
reason.

**Proved by putting a secret in the web root**: a `.txt` holding a fake
credential and a `.pem` were both refused; the CSS still served. Before the
change both returned 200.

**I had to correct my own claim, which is the habit worth keeping.** I wrote that
a refused file gives 404. It gives **401** to an anonymous caller, because the
fall-through reaches the session gate. That is BETTER — 401 is the same answer
every unknown path gives, so it distinguishes nothing, where a 404 would confirm
the path was handled. The comment was corrected to match the behaviour rather
than left as a plausible-sounding claim.

**How to apply:** when a table maps a value to a presentation detail, ask whether
anything decides on membership. A lookup with a fallback answers "what shall I
call this?"; only a gate answers "may this leave the building?". They look
identical in code and are opposite in effect.
