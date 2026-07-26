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
