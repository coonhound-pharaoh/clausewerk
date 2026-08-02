# Obligations, Signature, Notifications — Work Packages — 2026-07-28

**What this is.** The work-package cut of the accepted `OBLIGATIONS-ARCHITECTURE.md` (the OA),
whose three owner decisions — D-1 (overdue, never breach), D-2 (DocuSign first), D-3 (daily
digest, governed immediate list) — were settled 2026-07-28 and are inherited here as settled.
Fifteen single-owner packages, OB-01 through OB-15. Packages that can start now are specified at
implementable depth; packages behind a gate are deliberately bounded outlines that name their
gate, because specifying against an unmade prerequisite manufactures rework. No code, migration or
test file was changed in producing this document.

**House rules that bind every package:**

- **Migration numbers are claimed from disk at start**, never written in a plan. Two sessions
  write this repository at once; a number in a document is a collision waiting.
- **Never edit an applied migration** — supersede with a new number. The ledger checksums and
  refuses.
- **A mutation row only where a named test in the same package consumes the guarded line**, and
  `node backend/db/test/mutation-check.mjs` runs before any commit touching a migration
  (`CLAUDE.md` rule, 2026-07-28). Remember the duplicated-guard lesson (`memory.md` S110): a guard
  copied into a second layer makes single-copy mutations unprovable — mutate the shared substrate
  or the last line of defense.
- **Own your files.** Each package names the files only it may touch for its duration. Shared
  doorway files (`server.py`, `reads.py`, `refusals.py`, `mutation_check.py`) are collision
  surfaces with the NC set and with the second session — a package that must touch one says so and
  checks `git status` first.
- **Every governed act**: audited on the chain, refusals classified by SQLSTATE, no transaction
  held across any provider call (B2), and settled decisions landed as `cw.governance_setting` rows
  by the package that builds what they govern.
- **Content stays placeholder.** Template wording, digest wording, email text — all content, all
  placeholder, never tested for wording, never a defect.

**Dependency spine:** OB-01 → OB-02 → OB-03/OB-04 → the rest fan out. OB-06 and OB-13 wait on
NC-07. OB-14 waits on deployment. Nothing here waits on anything in the NC set except NC-07.

---

## Phase 1 — the obligations core

### OB-01 — Obligation templates: the third content type through the gate

*Serves OA §2.1. No prerequisites. Can start today.*

- One migration: `cw.obligation_template` — versioned, attached to a **clause version**, carrying
  the OA field set (`kind`, `owner`, `schedule` with anchor and offset, `evidence`, `lead_days`,
  `survives` with post-termination term, `entitlement`, `effective_on`, `retired`).
- Authoring rides the **Review queue pattern** (ADR-0003): proposed, approved by a named Legal
  human, versioned, retirable — never deleted. Approved templates are immutable except retirement,
  the clause-version discipline applied verbatim.
- Read scoping broad (the library is readable); writes only through the gate, `legal_admin`
  approval to activate, mirroring clause minting.
- **Mutations:** an approved template can be edited in place; a retired template comes back by
  edit; a template activates without a named approver. Each caught by its named test in a new
  `obligations.test.mjs`.

### OB-02 — Registration: the deterministic derivation

*Serves OA §2.2. Prereq: OB-01 merged.*

- On the agreement status machine's move to `executed` (the existing trigger point — this package
  adds a consumer, not a second status machine): walk the frozen decision set, read templates **as
  they stood on the pinned clause versions**, resolve owner→party and schedule→dates from the
  agreement record, write `cw.obligation_instance` rows keyed
  `(agreement_id, source_clause, template_version, occurrence)`.
- **Idempotent and replayable**: re-registration emits the identical set; a re-derivation function
  exists for the auditor and any disagreement with stored rows is a reported incident, never a
  refresh. Recurring schedules materialise over a rolling 13-month horizon; extending the horizon
  is the same re-run, appending by occurrence.
- Coverage gaps: an in-force clause version declaring no active templates writes a
  `cw.obligation_coverage_gap` row. Audited with the reserved machine actor (derivation is not a
  decision — ADR-0008 §3).
- Default owner: the deal's requester. Instances are immutable once registered; acts live in OB-04.
- **Mutations:** registration reads **current** templates instead of pinned ones (the drift this
  package exists to prevent); double registration doubles the set; the gap row is suppressed; a
  hallucinated party resolves silently instead of refusing.

### OB-03 — Computed states, close eligibility, and D-1 on the record

*Serves OA §2.3. Prereq: OB-02.*

- Views, not tables: `pending` / `due` / `overdue` computed from due date, `lead_days` and the
  clock (ADR-0006 precedent — **no state-mover job exists**); close eligibility (every surviving
  obligation terminal); survival terms measured from termination.
- **D-1 lands here** as a `cw.governance_setting` owner-decision row: the system never asserts
  breach; `overdue` is arithmetic; breach assertion, if ever wanted, is a recorded human act — the
  row is where the next engineer meets the decision.
- **Mutations:** an obligation with no lead window renders as `pending` forever; an unmet survivor
  does not block close; `overdue` compares against NULL and fails open (the redaction-guard shape).

### OB-04 — The recorded acts: satisfy, reassign, and the defect surface

*Serves OA §2.3–2.6. Prereq: OB-02. Parallel with OB-03.*

- `cw.obligation_act`, append-only: **satisfy** (attestation evidence first — named human,
  mandatory non-empty note, the `''` vs `NULL` lesson applied on day one), **reassign** (to a
  person, never a team inbox; recorded). Acts are undeletable and uneditable; a wrong act is
  corrected by a later act, never rewritten.
- Read scoping follows the concession family (openness by default, open-questions §12); the
  Administrator reads per U5 and writes nothing.
- Health surface: an active agreement with an unowned obligation is a visible defect tile,
  `never_ran`-style — absence of an owner rendered as a gap, not as calm.
- **Mutations:** an act row can be edited; satisfaction with an empty note is accepted; a
  reassignment to nobody succeeds; the unowned-obligation tile renders as fine.

### OB-05 — Waiver is an override

*Serves OA §2.3. Prereq: OB-04.*

- Waiving an obligation reuses the ADR-0008 machinery per obligation: request → socialise →
  approve, each recorded; only an **in-force** approval authorises the waiver act (the
  proposal-is-not-approval shape, again). Nobody waives their own obligation's duty to themselves;
  nobody decides their own request — inherited guards, applied to the new subject.
- **Mutations:** a proposed waiver authorises the act; a waiver names an approval for a different
  obligation; self-decision allowed. Anchor on the last line of defense per S110.

### OB-06 — Document and counterparty evidence — **GATED on NC-07**

*Serves OA §2.4. Gate: NC-07 merged (the system can receive a document), plus its owner-decided
size limit.*

> **BUILT — 2026-07-30, migration `0050`** (the gate opened with 0047). Small
> on purpose: it CONNECTS the evidence store to the obligation record.
> `document_ref` on the act — satisfy-with-document keeps the mandatory note
> (bytes without a sentence are not evidence anybody can act on);
> `counterparty_ack` records against a received document, never a bare flag,
> and is evidence, not closure. **The one new guard is the same-deal rule:**
> evidence answers for the deal it was received on, refused otherwise. Both
> sides append-only already (0037/0047), so "immutably linked" needed no new
> mechanism. Guard and policy replaced carrying the 0037/0039 harness-keyed
> blocks verbatim (third copy, the 0039 precedent). Doorway: `document_ref`
> on satisfy, `POST /obligations/ack`. Suites:
> `obligation-evidence.test.mjs` (8), doorway grew three; two SQL mutation
> rows.

Bounded outline: satisfy-with-document stores received bytes hashed (the executed-document
pattern), immutably linked to the instance; `counterparty_ack` records against a received
document, never a bare flag. Evidence rows are undeletable. Full specification when NC-07's
transport shape exists to specify against.

### OB-07 — The doorway learns obligations

*Serves OA §7. Prereq: OB-03 + OB-04. Owns only its new files.*

> **BUILT — 2026-07-30**, with one deliberate shape change from this outline:
> the reads and acts are entries in `reads.READS` and `writes.WRITES` rather
> than a module — every one is a single statement, which is those files' whole
> admission rule, and OB-09/10 set the precedent when the collision risk this
> outline guarded against had passed (one session, clean tree, checked at
> start). Four reads: the obligation book (source clause always adjacent),
> coverage gaps, the unowned-defect surface, close eligibility. Three acts:
> satisfy (note mandatory), reassign (a person, never an inbox), waive (only
> against an approved override naming the obligation). Waiver request/decide
> ride the existing override endpoints; **asserting breach got no endpoint,
> deliberately** — D-1 made it a consequential claim, and a button for it is a
> decision to take knowingly when a screen needs one. Suite:
> `test_obligations.py` (29). No new mutation rows: every guarantee lives in
> the schema and is already checked there.

- New doorway module (`obligations.py` + `test_obligations.py`): reads (my obligations, an
  agreement's obligations with source clause always adjacent, coverage gaps, close eligibility)
  and the act writes (satisfy-attestation, reassign, waiver request/decide via the override
  endpoints' pattern). Wiring into `app.py`/`server.py` is the one shared-file touch; it follows
  the existing route-registration idiom and checks `git status` first.
- Refusals ride `refusals.classify` untouched; scoping stays in the database, never re-implemented
  in Python (the doorway's standing rule).
- **Evidence:** endpoint tests as the real roles; the Python mutation harness gains rows only for
  lines this package guards, coordinated with the shared `mutation_check.py`.

---

## Phase 2 — the notification service

### OB-08 — The waiting-on-you derivation

*Serves OA §4.1. No prerequisite except what it reads; starts any time after OB-03 for the
obligation sources, and its non-obligation sources can land first.*

- Computed views, per person: countersign queue (U6), unclaimed review tickets, obligations
  entering their lead window, renewals entering notice windows, expiring clauses under live deals,
  override socialisations naming them (`cw.override_notified`, finally delivered), envelope events
  (once OB-12 exists — the view grows a source then, not before).
- Derived at read time, stored nowhere. Confidentiality note carried from the OA: when the
  confidential-deal capability lands, this view is where its marking is honoured.
- **Mutations:** one per source — each source silently dropped from the union must be caught by a
  named test proving that a person owed that item sees it. A derivation that hides work is this
  package's whole failure mode.

### OB-09 — The outbox, the settings, and the visible silence

*Serves OA §4.1, §4.3–4.4. Prereq: OB-08.*

- `cw.notification_outbox`, append-only: person, channel, day, the **references** carried (never
  content), sent-at, delivery outcome. **D-3 lands here** as governance rows: digest cadence
  (operational), the immediate list (operational, Administrator-maintained like watcher lists).
- Health: a person with waiting work and no reachable address is a visible gap tile (the
  uncovered-category precedent); a delivery failure is an outcome on the row, never a swallow.
- **Mutations:** the outbox becomes editable; a failed delivery renders as sent; the
  unreachable-person gap renders as fine; a non-administrator maintains the immediate list.

### OB-10 — The email channel and the tick

*Serves OA §4.2, §4.4. Prereq: OB-09.*

- One channel adapter (email) behind a seam shaped like the AI seam; one externally-triggered
  idempotent tick that assembles each person's digest **fresh from the derivation** at send time,
  consults the outbox for what day-D already sent, and sends the difference. Immediate-list events
  send on occurrence. **B2 verbatim:** no transaction across a send; record the outcome as its own
  short transaction.
- Messages carry references and minimal facts only — the OA §4.3 rule is enforced by construction:
  the assembler has no access to content fields, only to references and dates.
- Digest wording is content: placeholder, untested.
- **Evidence:** Python-side tests: tick twice, one send; missed day recovered by next tick;
  provider failure recorded not raised; the digest for a past day derivable after the fact.

### OB-11 — The in-app inbox — **BUILT 2026-08-02**

*Serves OA §4.4. Prereq: OB-09. Small, late, optional until the shell work resumes.*

Bounded outline: a workspace read over the same outbox and derivation — one source, two
renderings, so screen and email cannot disagree. Shell-target mutation rows where the empty-state
and no-canned-data rules apply.

*Delivered as part of the `obligations` pane ([](prototype/v4/app/obligations.jsx)): the
waiting-on-you panel renders `GET /waiting` (the digest's own derivation) and the inbox renders
the outbox record — what was actually sent, never the intention. Shared tab, requester and Legal
admin; the obligation table's own policy does the scoping.*

---

## Phase 3 — the signature connection

### OB-12 — The envelope record

*Serves OA §3.3. Prereq: none of the provider work — this is schema and can precede the adapter.*

- One migration: `cw.signature_envelope` (agreement, provider, provider envelope id, SHA-256 **as
  sent**, sender, states `sent → completed | declined | voided | expired`),
  `cw.signature_envelope_event` (append-only, provider-attributed),
  `cw.signature_recipient` (name, party, signing order, per-recipient status). **D-2 lands here**
  as its governance row.
- Completion path specified against machinery that exists: certificate bytes into the existing
  `signature_certificate` table, signatories into WP-18c's records (method `electronic`), filing
  through the **existing** filing act — a new way of arriving at the same recorded act. The
  sent-hash vs signed-bytes discrepancy is recorded as an incident and never auto-resolved.
- **Mutations:** an envelope event can be edited; completion files without a certificate; a
  voided envelope still completes; the discrepancy check compares nothing and passes.

### OB-13 — The DocuSign adapter and the poll — **GATED on NC-07 and credentials**

*Serves OA §3.2, §3.4. Gates: NC-07 merged (retrieve must store received bytes), OB-12 merged,
and a DocuSign developer account with API credentials — which only the owner can procure, and
which live in deployment configuration, never in the schema.*

Bounded outline: the five operations (`send`, `status`, `retrieve`, `void`, `verify_event`)
against DocuSign's envelope API; polling of open envelopes on OB-10's tick (idempotent — events
are append-only, a repeated poll records nothing); B2 on every call. No DocuSign concept above the
seam. Full specification when the gates open.

### OB-14 — The webhook — **BLOCKED on deployment**

*Serves OA §3.4. Carried, not scheduled, the NC-24 pattern: written down so it is not lost, kept
out of the schedulable set so the rest of the capability does not look blocked when it is not.*

When the system has a public URL: DocuSign Connect events through `verify_event`
(HMAC-authenticated), polling retained as the fallback. Nothing else changes shape.

### OB-15 — The lifecycle surfaces — **BUILT 2026-08-02**

*Serves OA §8. Prereq: OB-03, OB-08; envelope strip needs OB-12. Shell work — sequenced with,
not inside, the paused WP-U set.*

*Delivered in the same `obligations` pane: the calendar (grouped by due month, with an honest
"no date yet" bucket for termination-anchored duties — visible, never invented), the
per-agreement panel with the source clause adjacent and entitlements as prominent as duties,
the envelope strip over the new `GET /envelopes` read, and the coverage-gap line. A shell test
pins the structure and a mutation row breaks the unanchored bucket.*

Bounded outline: the Calendar (obligations and entitlements over time, by owner), the Agreement
view's obligations panel (source clause always adjacent; entitlements as prominent as duties;
nothing closes silently) and envelope strip, the workspace waiting-on-you panel (OB-08's
derivation, rendered). Shell-target mutation rows per the v4 harness mode.

---

## For the owner — three things, none blocking Phase 1

1. **A DocuSign developer account** is yours to open when Phase 3 nears — OB-13 cannot be
   scheduled without credentials, and credentials belong to the company, not to a session.
2. **NC-07 remains the single most valuable unblocking merge** in the NC set for this effort:
   two packages here (OB-06, OB-13) wait on it, alongside the three NC packages already waiting.
3. **Nothing here needs a new decision.** D-1, D-2 and D-3 are settled and inherited; the gates
   above are prerequisites, not questions.
