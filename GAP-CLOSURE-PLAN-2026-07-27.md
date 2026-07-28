# Gap Closure Plan — 2026-07-27

**What this is.** On 2026-07-27 a full scan compared everything the architecture documents promise
against everything the code actually does. This plan takes every issue that scan found and organises
it into workstreams at a strategic level. Each workstream is sized, ordered, and marked with the
decisions it needs. **Each workstream gets its own detailed revision plan before work starts** —
this document is the map, not the route.

**What this is not.** It does not cover content gaps — clause text, categories, rule wording,
obligation templates. Those belong to Legal and the people using the system, per the product
boundary decision of 2026-07-25. The system's job is to make those gaps visible, and it does.

**The headline.** The vault is built; the machine that uses it is not. The record-keeping half —
database rules, audit chain, review queue, ladders, concessions, the doorway — is strong, finished,
and well tested. What is missing clusters into nine workstreams below. One of them (WS-1) is ready
to build today with no new decisions; it is the recommended first move, and its detailed revision
plan is written: [`ASSEMBLY-CONNECTION-PLAN-2026-07-27.md`](ASSEMBLY-CONNECTION-PLAN-2026-07-27.md).

---

## The workstreams, in recommended order

### WS-1 · Connect the assembly line ⟶ *detailed plan written, ready for work packages*

**The gap.** The system cannot produce a contract. Every piece of the assembly machinery — pick the
clauses, check the conflicts, record the run, build the Word document — is written and tested in
the engine, but nothing connects it to the running service. Exactly one small check is wired
(`POST /manifests/check`). There is no way to run an assembly, read a run back, download the
document, or file an executed agreement. The demo agreement was inserted by hand at the database
level because the execution path does not exist.

**Why first.** It requires **no new decisions** — the database already says who may record a run
and who may file an execution. It unblocks WP-U15 (the acceptance sweep needs a real assembled
run), fills the reading room's never-exercised clause view, and turns the product's central promise
from tested-in-parts to demonstrated end to end.

**Done means.** A requester submits a manifest and gets a recorded, reproducible run; the findings
show on screen; the contract document downloads; Legal files the execution through the service, not
through the database owner.

**Size.** Medium. Mostly doorway endpoints and screens; no engine changes, at most no migrations.

---

### WS-2 · Rebuild the intelligent front half ⟶ *needs an architecture plan before a revision plan*

**The gap.** The intake interview, the classifier that turns a conversation into a manifest, the
matcher that maps a vendor's redline to a library clause, and the Clause Library Builder exist only
in the superseded v3 prototype or on paper. The backend has no AI connection of any kind — and even
the **deterministic fallbacks** the architecture requires (keyword rules, the similarity scorer,
the fallback interviewer) were never ported. No current plan owns this work; the Python move closed
complete without it and the UI packages only cover screens.

**What must exist first.** An AI service layer design that no document currently provides: which
model, where prompts live and how they are versioned, cost and rate controls, per-call logging, and
the switch to the deterministic fallback. The build order the earlier handoffs recorded still
stands: **the deterministic fallback is written before the AI path**, for every capability.

**Decisions needed (Mike).** Model provider and hosting; whether intake ships before the redline
matcher or after; budget appetite for the AI layer.

**Size.** Large — the biggest remaining block of work in the product. Depends on WS-1 (a manifest
with nowhere to go has no value).

---

### WS-3 · Prove who signs in

**The gap.** Sign-in takes a name and trusts it. It was deliberately built as the seam an identity
provider plugs into, but no provider was chosen or wired — so the core invariant, "a named human
approved this," currently rests on trust rather than proof. Two smaller items ride along: sessions
live only in memory (a service restart silently signs everyone out — recorded nowhere as a gap
until now), and the audit record's names are only as good as the sign-in that asserted them.

**Decisions needed (Mike / whoever owns company IT).** Which identity provider the company uses;
whether sessions must survive a restart.

**Size.** Small-to-medium. The seam exists; this is wiring, plus session persistence.
**When.** Before any real user touches the system. Independent of WS-1 and WS-2.

---

### WS-4 · The clock and the messenger ⟶ *needs a design document before a revision plan*

**The gap.** Nothing in the system happens on its own. No scheduler: draft expiry, ticket lapsing,
retention due dates, renewal notice windows, and the four nightly integrity checks all run only
when a person pushes a button. No delivery: the database records who *should* be told about
overrides and holds, but "notify" means "a row exists in a table" — no email, nothing sent. Neither
the scheduler nor the delivery mechanism is even **designed** in any document, despite the
lifecycle architecture depending on both.

**Decisions needed (Mike).** How people are told (email? a daily digest? something the company
already runs?); what happens when a told person does nothing (escalation).

**Size.** Medium. Design first, then a small scheduler and one delivery channel done well.
**When.** Before the lifecycle side (WS-5) can honestly claim to manage dates.

---

### WS-5 · Finish the lifecycle dispositions

**The gap.** Beyond the long-known "obligations are not built": an executed agreement **cannot be
terminated** — the status machine permits it but no function, endpoint, or screen offers a path.
Renewals cannot compute their notice window because the agreement record has no renewal-term
fields. Amendments store correctly but the "effective terms after amendment" composition is prose
only. "Retention pauses during a legal hold" is not real — a hold blocks destruction but the clock
is never extended. Wind-down states don't exist.

**Decisions needed (Mike).** Who may terminate and what evidence it requires; whether the renewal
drift report blocks or advises (U1 said blocking — the view exists, the blocking does not).
Obligations themselves stay parked until Legal's template authoring makes them real.

**Size.** Medium, in independent slices — termination path, renewal fields, retention arithmetic
can each be its own small revision plan. Depends on WS-4 for anything date-driven.

---

### WS-6 · Open the negotiation record

**The gap.** The full round-by-round negotiation schema is built and well guarded — and not one
service route touches it. No way to open a negotiation, record a round, or move a position. Also
unowned by any spec: the handoff moment where a negotiation closes and becomes an executed
agreement — the seam between the two architecture documents belongs to neither.

**Decisions needed.** None to start the record-keeping routes; the close-of-negotiation act needs
its owner defined (likely with Legal).

**Size.** Medium. Pure doorway-and-screens work against a finished schema. The analysis layer on
top (position identification, round analysis, recommendations) belongs to WS-2, not here.

---

### WS-7 · The six Legal-admin acts (finish WP-U13)

**The gap.** Already tracked as the open question §9b. Six governed acts have no endpoint:
activate/retire/supersede a clause, edit a conflict rule, promote a concession, reorder a ladder
rung, release a hold, destroy under retention. Two — destruction and supersession — are **fully
built in the database and reachable from nowhere**; they are waiting only for the button.

**Decisions needed (Mike — already on your list).** Whether the remaining four acts are in scope
for this effort or a named follow-on.

**Size.** Small for the two decided acts; the four undecided ones are each small once decided.

---

### WS-8 · Seal and store

**The gap.** Two foundations promised but not delivered. First, the audit checkpoint is still
anchored but **unsigned** — sealing it was a stated benefit of the move to standard PostgreSQL and
remains undone, so the chain catches accidents but not deliberate rewriting. Second, every stored
document points into a byte store (`storage_uri`) that no document defines — who runs it, who can
touch it, whether its bytes can change. Redaction already admits this: it severs links but cannot
delete bytes it cannot reach.

**Decisions needed (Mike / database owner).** Where documents physically live; who holds the
signing key for the checkpoint.

**Size.** Small for the signature; the store is a design decision more than a build.

---

### WS-9 · True up the paperwork

**The gap.** Cheap and worth five minutes each: the README says twelve migrations (there are
twenty-three) and its status section predates the doorway; the work-package header says thirteen
closed (it is fourteen); the ADR index stops at ADR-0011 though ADR-0012 exists; two documents
still overstate the connection-pooling constraint ADR-0012 corrected; several handoff files list as
open two things since closed (the manifest check now has a caller; the two-writer race is now
tested through the doorway).

**Decisions needed.** None. **Size.** Small. Fold into WP-U15's "doc trueing" half, where it
already belongs.

---

## Decisions parked deliberately — no workstream, on purpose

These stay where the project already put them: obligations content (Legal's authoring backlog),
the vector index, the seven-signal negotiation intelligence, ticket routing, entitlement valuation,
the Rust document-reader isolation, the production frontend stack choice (raise before the UI
grows further), and the open owner questions in [`docs/open-questions.md`](docs/open-questions.md).

## Order and dependencies, in one view

| Order | Workstream | Blocked by | Decisions needed before start |
|---|---|---|---|
| 1 | WS-1 Assembly line | nothing | none |
| 1 (parallel) | WS-9 Paperwork | nothing | none |
| 2 | WS-3 Identity | nothing | provider choice |
| 2 (parallel) | WS-7 Legal-admin acts (two decided) | nothing | scope of the other four |
| 3 | WS-4 Clock & messenger | design doc | delivery channel |
| 3 (parallel) | WS-6 Negotiation record | nothing | close-of-negotiation owner |
| 4 | WS-5 Lifecycle dispositions | WS-4 for dates | termination authority |
| 4 (parallel) | WS-8 Seal & store | nothing | store location, key holder |
| 5 | WS-2 Intelligent front half | WS-1; AI design doc | provider, budget, order |

Each row becomes a detailed revision plan like the one written for WS-1, and each detailed plan
becomes work packages before anything is built.
