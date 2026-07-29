# Clausewerk — Obligations, Signature, and Notification Architecture (OA)

Companion to [`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md), which specifies the
lifecycle in outline and stops where the machinery starts. This document takes the three pieces the
LCMA names but does not build — **obligations** (LCMA §3.2–3.5), the **signature connection**
(LCMA §3.1's evidence, acquired rather than filed by hand), and the **notification service** (which
at least three settled owner decisions quietly assume exists) — and specifies them at the depth an
engineer can implement from.

Where this document and the LCMA overlap, this one governs. Nothing here reopens a settled owner
decision; the ones it touches (`U1`, `U6`, `U9`, the ADR-0008 override path) are inherited as
settled and cited where they bind.

**Status: ACCEPTED, decisions settled. Nothing in this document is built yet.** The three owner
decisions it required — D-1, D-2 and D-3 — were **settled by the owner on 2026-07-28**, as
recommended (§10). Recorded in `memory.md` S111; to be held as `cw.governance_setting` rows by the
migration that builds each governed piece, the way every settled decision is.

---

## 1. Intent

Everything the system does today ends at a signed file. These three pieces are what make the system
worth having *after* that moment:

- **Obligations** turn a signed agreement into a working to-do list — what we owe, what we are
  owed, and when — derived from the clause IDs the contract was assembled from, never from a model
  reading prose.
- **The signature connection** closes the loop the pipeline currently leaves open: the system sends
  a document out and then learns of its execution only when a person remembers to file it. After
  this, execution is recorded the moment it happens, with evidence that would survive a dispute.
- **The notification service** is what makes any waiting-on-a-person control actually work. Today
  the countersign nudge (`U6`), expiry warnings, override socialisation and every "due" date depend
  on somebody remembering to open the right screen.

The organising principle is inherited from the LCMA and applied without exception:

> **The model never decides what a contract obliges. Obligations are declared on the clause
> record by Legal, extracted by ID, and closed by named humans or deterministic evidence rules.**

---

## 2. The Obligations module

### 2.1 Templates are library content, through the same gate as everything else

An obligation template is authored by Legal on a clause version, with the fields the LCMA §5 table
names (`kind`, `owner`, `schedule`, `evidence`, `lead_days`, `survives`, `entitlement`). Two rules
give it the same discipline as clause text:

- **Templates ride the Review queue** ([ADR-0003](docs/decisions/ADR-0003-review-queue-is-the-only-mutation-surface.md)
  applied to a third content type, after clause text and — still pending — conflict rules).
  Authored, approved by a named human, versioned, effective-dated, retirable. A template change
  silently alters what every future contract obliges, which is exactly the class of change that
  earns a gate.
- **Templates attach to a clause version and are pinned like everything else.** Registration reads
  the templates as they stood on the *pinned* clause versions of the executed agreement. A template
  authored or amended later reaches **future** registrations only. No signed deal's obligation set
  ever changes because Legal improved a template — the same rule as ADR-0006's snapshot pin, for
  the same reason.

Template *content* — what the wording of a duty is, which clauses carry which duties — is Legal's,
is placeholder during development, and is never a defect. What the system owes is the machinery and
the visibility of gaps (§2.5).

### 2.2 Registration — a deterministic act at execution

When an agreement's status moves to `executed` (by filing a signed document, or by the signature
connection in §3), registration runs: walk the frozen decision set, read each pinned clause
version's approved templates, resolve `owner` to a party and `schedule` to concrete dates from the
agreement record, and write **obligation instances**. No model runs. The act is audited with the
reserved machine actor, because derivation is not a decision and must never be recorded as a
human's ([ADR-0008 §3](docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md)).

Registration is **idempotent and replayable**: run twice against the same executed agreement it
produces the identical set, keyed on `(agreement_id, source_clause, template_version, occurrence)`.
This is the run-store rebuild guarantee extended past signature — an auditor can re-derive the
obligation set from the pinned record and diff it against what is stored, and any disagreement is
an incident, not a refresh.

**Recurring schedules** materialise as instances over a rolling horizon (recommended: 13 months —
one year of calendar plus one month of runway) rather than as an unbounded series. Extending the
horizon is the same idempotent registration re-run; the occurrence counter is what makes the
extension append rather than duplicate.

### 2.3 States are computed; only acts are recorded

The LCMA sketched `pending → due → satisfied | breached | waived` as a stored state machine. This
document deliberately reshapes that, on the precedent of
[ADR-0006](docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md) (clause expiry is
computed, not stored):

- **`pending`, `due`, and `overdue` are computed** from the due date, the lead time, and the clock,
  in a view. They are facts of date arithmetic. Nothing writes them, so no scheduled job can fail
  to write them — **there is no state-mover to run, and therefore none to miss.** The LCMA's
  hardest non-functional requirement ("a missed run cannot mean a missed obligation") is met by
  making the run unnecessary.
- **`satisfied` and `waived` are recorded acts** — append-only, audited, named. Satisfaction
  requires evidence of the declared type (§2.4). Waiver is an override and follows the full
  ADR-0008 path: request, socialise, approve, recorded per obligation. Nobody silently waives a
  duty.
- **`breached` does not exist as a system state.** The system computes and reports **overdue** —
  arithmetic. *Breach* is a legal claim with consequences, and asserting it is a human act. If the
  organisation wants breach on the record, it is recorded the way every other consequential human
  judgment is: a named person, a reason, an audited act on top of the computed fact. This answers
  LCMA open question #2 and was **settled by the owner as D-1, 2026-07-28** (§10).

Close eligibility (LCMA §3.5) is likewise computed: an agreement is closeable when every surviving
obligation is terminal. No one marks a deal closed; the record says whether it is.

### 2.4 Evidence

Four declared evidence types, each with an existing pattern to reuse:

| Evidence | What satisfies it | Machinery |
|---|---|---|
| `document` | A file — insurance certificate, deletion attestation letter | Stored bytes + SHA-256, the executed-document pattern. **Depends on NC-07** (the system cannot receive a document today) |
| `attestation` | A named human confirms, with a note | An audited act; the note is mandatory the way a rejection note is |
| `counterparty_ack` | The counterparty confirms | Recorded against the received document or message that evidences it — never a bare flag |
| `system` | An integration signal | Out of scope until an integration exists; declared now so templates can name it |

Evidence links immutably to its obligation instance. Nothing closes without its evidence and a
named closer, and the AI evidence-triage aid (LCMA §4, inference use #2) only ever *suggests* a
filing — a person files.

### 2.5 Coverage gaps are reported, not guessed at

A clause in force declaring no obligations produces a **coverage gap row** at registration — per
clause, visible on the agreement and aggregated as a library-quality metric, exactly like the
existing coverage-gap report. During development every gap is expected (content is placeholder);
in production the gap report is how Legal phases the authoring backlog (LCMA open question #1) by
seeing which in-force clauses are silent. The system's job ends at making the gap visible — the
product-boundary rule, applied here.

### 2.6 Ownership and who sees what

- Every instance has an **obligation owner** — a person, never a team inbox (LCMA §6). Default at
  registration: the deal's requester. Reassignment is a recorded act. An active agreement with an
  unowned obligation is a reported defect on the health surface.
- **Read scoping follows the concession family**: requesters see obligations broadly (colleagues
  cover for each other — the openness-by-default rule from open-questions §12), Legal and the
  Auditor see all, the Administrator sees per `U5` (content-visible, content-powerless). When the
  confidential-deal capability is built, obligations inherit the deal's marking.
- **Entitlements are the same table with the flag set**, surfaced as prominently as duties — a
  service credit nobody claims is the classic leak the LCMA names.

---

## 3. The signature connection

### 3.1 Build or buy — the honest version, then the verdict

Could we build e-signature ourselves? Partly, and the partial answer is what settles it. We already
have the hard record-keeping: hashed document bytes, an append-only audit chain, frozen executed
records. A click-to-sign flow on top of that is genuinely buildable.

What we cannot easily build is the part that matters in a dispute:

1. **The certificate must come from someone who is not us.** Our schema already stores a
   completion certificate — *who signed, when, from where, how they were authenticated* — as
   first-class evidence (WP-18c). A certificate we issue about our own contract is
   self-attestation; its evidentiary weight against *us* is roughly nothing. The provider's value
   is that it is an independent witness with court-tested records.
2. **Counterparty authentication.** Email OTP, SMS, knowledge-based checks, qualified signatures
   under eIDAS — an identity-proofing product in its own right.
3. **The counterparty's side of the experience.** Their signatories will not create accounts on our
   system; they will sign a DocuSign envelope without blinking. Adoption friction lands on every
   deal, forever.

**Verdict: connect, don't build.** The one-sentence version: *the completion certificate is only
worth storing if somebody independent issued it.* What we keep in-house is everything around the
signature: the frozen document, the envelope record, the certificate archive, and the wet-ink path
— which stays exactly as it is today, a manual filing. The connection is additive; nothing existing
is removed.

### 3.2 The provider seam

One narrow interface, provider-agnostic, in the doorway — the same seam discipline as the AI
provider (NC-10), and subject to the same hard-won rule (**B2**): **no database transaction is ever
held across a provider call.** Every provider interaction is: read what you need, commit, call the
provider, then record the outcome as its own short transaction.

The seam is five operations, and deliberately no more:

| Operation | What it does |
|---|---|
| `send` | Deliver the dossier's document for signature to named recipients, in signing order |
| `status` | Ask where an envelope stands |
| `retrieve` | Fetch the signed bytes and the completion certificate on completion |
| `void` | Withdraw an envelope, with a reason |
| `verify_event` | Authenticate a provider callback, where the deployment supports one (§3.4) |

**DocuSign is the first adapter** (settled by the owner as D-2, 2026-07-28 — §10). The seam is proven the day a second
adapter exists behind the same five operations; Adobe Acrobat Sign is the natural second. No
adapter-specific concept may leak above the seam — "envelope" is the seam's word for it regardless
of what a given provider calls it.

### 3.3 The envelope record

A new append-only record family, shaped like the negotiation record: an **envelope** per send, with
recipients and an event stream.

- Envelope: agreement, provider, provider's envelope id, the document's SHA-256 **as sent**, who
  sent it, when. States: `sent → completed | declined | voided | expired`. Transitions arrive from
  the provider, are recorded append-only, and every one is audited.
- Recipients: name, party, signing order, and per-recipient status with timestamps — this is what
  populates the `signatories[]` records (method `electronic`) that WP-18c built.
- **On completion**: `retrieve` fetches the signed bytes and the certificate; both are stored
  hashed (the certificate into the existing `signature_certificate` table); the executed agreement
  is filed through the *existing* filing act — the signature connection is a new way of arriving at
  the same recorded act, not a second act. The status machine moves, and registration (§2.2)
  fires. One further check, and it is the LCMA's own rule: **if the signed bytes differ from the
  bytes sent beyond the provider's signature overlay, the file wins and the discrepancy is an
  incident** — recorded, surfaced, never auto-resolved.

**Dependency stated plainly:** receiving bytes is NC-07's package. The signature connection is the
third consumer NC-07 was created for, and it does not duplicate that work — it waits for it.

### 3.4 Learning of completion: poll first, webhook when deployed

Providers push completion events to a public URL. **Nothing is deployed** — there is no public URL
to push to. So the connection starts on **polling**: a scheduled `status` sweep over open envelopes
(idempotent; envelope states are append-only, so a repeated poll records nothing new). When the
system has a deployment (`FEATURE-PROPOSAL` item 10), the webhook path is added behind
`verify_event`, and polling remains as the fallback — the same degradation discipline as the
keyword matcher behind the vector matcher.

The poll shares the notification service's tick (§4.4) rather than inventing a second scheduler.

---

## 4. The notification service

### 4.1 The shape: derived from the record, with only deliveries stored

The record already knows everything worth telling anyone — what is due, what is waiting, who is
watching. So the service stores **no parallel copy of who should be told what**. It has exactly two
parts:

1. **Derivation views** — per person: what is waiting on you *now*. Countersign queue (`U6`),
   unclaimed reviews, obligations entering their lead window, renewals entering their notice
   window, clauses expiring under a live deal, override socialisations naming you
   (`cw.override_notified` finally reaching its audience), envelope events on your deals.
   Computed, never stored — a notification that would no longer be true is never sent, because it
   is derived at send time.
2. **The outbox** — an append-only record of what was actually **sent**: person, channel, the
   *references* it carried, when, and the delivery outcome. Sending is an act; acts are recorded.
   What is deliberately absent is any record of what somebody *should* be told — that is always
   derived fresh.

### 4.2 Digests by default, immediate by exception

- **The daily digest** is the workhorse: one message per person per day, at start of business,
  containing everything currently waiting on them, grouped the way their workspace groups it
  (`U8`). This is the `U6` "daily nudge" made real, and it serves every waiting-on-a-person
  control at once.
- **Immediate sends** are reserved for the few events where a day's delay defeats the purpose:
  an override socialisation (the review window is short and starts at notification), a countersign
  request, an envelope completing or being declined. The immediate list is a governed operational
  setting, not code — the Administrator maintains it the way watcher lists are maintained.

### 4.3 What leaves the system, leaves carefully

An email is bytes outside the schema — no row-level security follows it. Two rules, stated now so
they never need retrofitting:

- **Messages carry references and minimal facts, not content.** "Obligation due on AG-0142 in 14
  days: insurance certificate" — never clause text, never negotiation positions, never document
  attachments. The message points at the workspace; the workspace enforces who sees what.
- **A confidential deal is named as exactly that.** When the confidential-deal capability lands, a
  notification about a marked deal says a confidential deal needs your attention and nothing else —
  the same marked-not-hidden shape the owner settled in open-questions §12.

### 4.4 One tick, replayable, and silence is visible

- **One scheduled tick** drives the service (and hosts the envelope poll, §3.4). The digest for a
  given day is derivable from the record after the fact, so a missed tick is recovered by the next
  one — windows, not instants. The tick is idempotent: the outbox says what day-D digest went out,
  so a re-run sends nothing twice.
- **Channels are adapters** behind one seam: email first (the only must-have), the in-app
  workspace inbox second (a read over the same outbox — cheap and useful). Same B2 rule: no
  transaction held across a send.
- **Nobody is silently untold.** A person with work waiting and no reachable address is a visible
  gap on the health surface, exactly like a category with no watcher — the precedent is already in
  the schema (`an uncovered category is a visible gap, not a silence`). A delivery failure is
  recorded on the outbox row, not swallowed.

---

## 5. Deterministic / inference boundary

Nothing in this document adds an inference use. The three LCMA allowances (template drafting aid at
authoring time, evidence triage suggestions, drift-summary narration) stand unchanged, each behind
its gate, each with a deterministic fallback. The signature connection and the notification
service are deterministic end to end. The obligations module runs no model anywhere.

---

## 6. Data model additions

Extends LCMA §5. New tables, all append-only unless stated; every consequential act audited on the
existing chain.

| Table | Holds |
|---|---|
| `obligation_template` | Versioned, effective-dated templates per clause version, through the Review queue |
| `obligation_instance` | One duty or entitlement: agreement, `source_clause` (always), template version, occurrence, owner, due date, anchors. Immutable once registered |
| `obligation_act` | The recorded acts: satisfaction (with evidence ref), waiver (override ref), reassignment, breach assertion if D-1 adopts it |
| `obligation_coverage_gap` | Per registration: in-force clauses declaring nothing |
| `signature_envelope` + `signature_envelope_event` + `signature_recipient` | §3.3. Events append-only from the provider |
| `notification_outbox` | §4.1: what was sent, to whom, via what, carrying which references, with what outcome |

Computed views (not tables): obligation state (`pending`/`due`/`overdue` — §2.3), close
eligibility, the per-person waiting-on-you derivations (§4.1), coverage metrics.

---

## 7. Backend requirements

Fits the doorway as it stands: new endpoint families for obligations (read, satisfy, waive-request,
reassign), envelopes (send, void, read), and notification administration (immediate list, channel
config, outbox reads for the Auditor). All writes ride existing role scoping and RLS; no new
privileged path. The provider seam and channel adapters live beside the AI seam and obey B2.
The scheduler is one tick, externally triggered (OS scheduler or deployment cron), idempotent,
and safe to run twice.

---

## 8. Frontend requirements

The four LCMA surfaces (Portfolio, Agreement, Calendar, Disposition) are unchanged and this
document adds the flesh they were waiting for. Two additions:

- **The envelope strip** on the Agreement view: where signing stands, per recipient, with the
  certificate visible once stored.
- **The waiting-on-you panel** in each workspace is the same derivation the digest sends — one
  source, two renderings, so the email and the screen can never disagree.

House rules carried over: every obligation shows its source clause; entitlements as prominent as
duties; nothing closes silently; derived-by-ID visually distinct from anything manual.

---

## 9. Build order

1. **Obligation templates + registration + computed states + coverage gaps** — the core, no
   external dependency, testable end to end with placeholder templates.
2. **Evidence + satisfaction + waiver** — needs NC-07 for document evidence; attestation path has
   no dependency and lands first.
3. **Notification service, email channel, daily digest** — unblocks `U6`'s nudge, socialisation
   delivery, and obligation alerting the moment obligations exist.
4. **Signature connection, DocuSign adapter, polling** — after NC-07; webhook when deployed.
5. **In-app inbox; second signature adapter** — each proves a seam.

Mutation-harness discipline applies to every protection added: a row only where a named test
consumes the guarded line, and `node backend/db/test/mutation-check.mjs` runs before every commit
that touches a migration.

---

## 10. Owner decisions — all three settled by the owner, 2026-07-28 ✅

Each was settled as recommended. The analysis is kept as written, because the reasoning is the
decision; the accepted cost of each is stated in its own column and was accepted with it.

| # | Question | Settled as | The accepted cost |
|---|---|---|---|
| **D-1** | Does the system ever say *breach*? | **No.** The system computes **overdue**; breach is a named human's recorded assertion on top, if the organisation wants it at all | Reports can never say "in breach" unattended; somebody must own the assertion |
| **D-2** | First signature provider | **DocuSign**, behind the five-operation seam; Adobe Acrobat Sign as the seam-proving second | Provider fees per envelope; a second adapter is real work deferred, so the seam stays unproven until it exists |
| **D-3** | Digest cadence and the immediate list | **Daily at start of business**; immediate for socialisation, countersign, envelope completion/decline. Administrator-maintained as an operational setting | More immediate sends erode the digest's value; the setting makes that erosion a governed act rather than drift |

Each decision becomes a `cw.governance_setting` row in the migration that builds the thing it
governs — a decision in a document gets read once; a decision in the schema is met by whoever next
touches the thing it governs.

Two LCMA open questions are answered by this settlement: #2 (breach — D-1) and the alerting half
of #1 (the coverage-gap report is how the template backlog is phased). The rest of the LCMA's open
questions stand.
