# Decision record

One record per important decision, newest first. Plain language.

Detailed engineering write-ups live in [`docs/decisions/`](docs/decisions/); this file is the
running log of *what we decided and why*, readable without opening the code.

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
