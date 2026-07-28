# Decision record

One record per important decision, newest first. Plain language.

Detailed engineering write-ups live in [`docs/decisions/`](docs/decisions/); this file is the
running log of *what we decided and why*, readable without opening the code.

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
