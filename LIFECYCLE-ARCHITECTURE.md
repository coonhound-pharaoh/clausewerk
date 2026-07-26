# Clausewerk — Lifecycle Management Architecture (LCMA)

Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md), which specifies assembly and negotiation and
terminates at `contract.docx`. This document specifies what happens **after signature**. The third
specification, [`CLAUSE-LIBRARY-ARCHITECTURE.md`](CLAUSE-LIBRARY-ARCHITECTURE.md), covers the
library itself — fallback ladders, concessions, and the version history this document's renewal
drift report depends on.

> Read as *Lifecycle Management Architecture* — the lifecycle-management system deliberately
> excluded from the original architecture. Where the two documents overlap, `ARCHITECTURE.md`
> governs assembly and this one governs the executed agreement.

---

## 1. Intent

Assembly answers *"what should this contract say?"* Lifecycle management answers a different
question: **"what did we promise, is it still true, and what happens next?"**

An executed agreement is not a document. It is a bundle of **obligations**, **entitlements**, and
**dates**, most of which fall due long after everyone who negotiated them has moved on. The failure
modes are unglamorous and expensive: an auto-renewal that nobody diaried, a data-deletion duty that
lapsed unmet, an indexed price rise never claimed, an insurance certificate that expired in year
two of a five-year term.

The organising principle carries over intact from assembly, and gets sharper:

> **The model never authors contract language, and never decides what a contract obliges.**

Assembly earns that by fetching immutable clause text by ID. Lifecycle earns it the same way:
**obligations are declared on the clause record, not extracted from prose.** Because every sentence
in a Clausewerk contract arrived by clause ID, the system already knows exactly what it committed
to — no NLP over executed PDFs, no model reading a contract and guessing what it means. That is the
keystone of this design and the thing that makes it materially different from a conventional CLM
bolted onto documents of unknown provenance.

### What lifecycle management must not do

- **Never modify a signed contract.** An executed agreement is frozen at signature — text, exhibits
  and all — and stays frozen until it is destroyed at the end of its retention period. Library
  changes never reach it. Renewal produces a new agreement; an amendment is a new signed instrument
  appended to it. Neither edits what was signed.
- Never re-open executed language. An amendment is a *new* assembly run, not an edit.
- Never let a model determine an obligation, a date, a threshold, or a monetary amount.
- Never silently re-resolve an executed agreement against a newer library.
- Never close an obligation without a named human or a deterministic evidence rule.

---

## 2. The two clocks

The single most important concept in this document, and the thing the original architecture had no
model for.

| | **Clause validity** | **Agreement term** |
|---|---|---|
| Governs | Whether language may be used in a *new* contract | Whether an *executed* contract is in force |
| Applies to | The library only | The signed file only — whose **text never changes** |
| Owner | Legal (the Ledger) | The deal (the executed record) |
| Mechanism | `created` / `expires` / `active`, computed | `effective` / `expiry` / `renewal`, executed |
| On lapse | Clause leaves the selectable pool | Agreement terminates or renews |

These clocks are **independent and must never be conflated**. A clause expiring in the library has
no effect on a signed contract that used it — that contract executed under a pinned library
snapshot and stays valid ([ADR-0006](docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md)).
Conversely, an agreement can be live for five years using language the library retired in year one.

This resolves [`open-questions.md` §3](docs/open-questions.md) — *what happens when a clause expires
mid-flight*:

- **Before execution**, the live clause clock governs. Expiry is a warning at every negotiation
  round and a blocking condition at signature (implemented — see §7 below).
- **At execution**, the library snapshot is pinned into the agreement record. From that moment the
  clause clock is advisory only.
- **At renewal or amendment**, the pin is released: the work re-enters assembly and resolves
  against the *current* library, which is exactly where stale language should be caught.

Renewal never alters the signed agreement. It produces a **new** agreement, assembled from current
approved language, which the parties sign separately. The old one stays exactly as executed for as
long as it is retained.

> **A signed contract is not a living document.** Nothing in this system edits, refreshes,
> re-resolves or otherwise touches an executed agreement. Later library changes reach new
> agreements and amendments only. Where this document describes clauses "changing", it always means
> *the next contract will differ*, never *this one has been altered*.

---

## 3. Pipeline

```
  ASSEMBLY (ARCHITECTURE.md)          │  LIFECYCLE (this document)
                                      │
  Dossier ──→ contract.docx ──────────┼──→ EXECUTE ──→ REGISTER ──→ OPERATE ─┐
                                      │    signature    obligation   monitor  │
                                      │    + snapshot   extraction   + alert   │
                                      │       pin       (by ID)               │
                                      │                                        │
                    ┌─────────────────┼────────────────────────────────────────┘
                    │                 │
                    ▼                 │
              ┌── disposition ────────┼──────────────────┐
              │                       │                  │
         RENEW│              AMEND    │        TERMINATE │
              │                       │                  │
              └──→ back to ASSEMBLY ◄─┘                  ▼
                   (re-resolve vs current library)    WIND-DOWN ──→ CLOSE
                                                      survival     retention
                                                      obligations  clock
```

### 3.1 Execute

Signature converts a dossier into an **executed agreement record**. Deterministic; no inference.

**The signed file is stored, byte for byte, and it is the contract.**

This is not the same as being able to rebuild it, and the distinction is the most important one in
this section. Assembly can reconstruct what it *issued*; it cannot reconstruct what was *signed*.
Three reasons, each sufficient on its own:

1. **A signed contract can contain language that is not in the library.** Conceded vendor wording is
   quarantined by design ([ADR-0009](docs/decisions/ADR-0009-concession-is-not-supersession.md)) —
   it is deliberately not selectable, so no regeneration will ever produce it.
2. **Signature adds things assembly never saw**: executed signature blocks, counterpart pages,
   dated initials, exhibits and schedules attached during negotiation, sometimes wet ink.
3. **A reconstruction is evidence of what we believe; the file is evidence of what was agreed.**
   Only one of those survives a dispute.

So execution records:

- **The executed document itself** — the exact bytes, their SHA-256, and where they are stored.
  Immutable. This is the authoritative artefact.
- The **assembly provenance**: the run, and through it the pinned library snapshot, rule set and
  decision set. This *explains* the contract; it does not constitute it.
- Counterparty, effective date, term, signatories, and signature evidence (e-signature envelope
  reference).
- The **final expiry gate**: any clause that has lapsed since Forge blocks signature until
  re-resolved or overridden under
  [ADR-0008](docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md). This is the last
  point at which anything is checked against the live library — after signature, never again.
- `agreement_executed` in the audit log.

> **If the stored file and a regeneration ever disagree, the file wins and the discrepancy is an
> incident.** The system must be able to detect that disagreement — hence the stored hash — but it
> must never resolve it by preferring its own reconstruction.

Amendments never edit any of this. An amendment is a new signed document appended to the chain, and
the effective terms are the ordered composition of the original plus its amendments (§3.4).

### 3.2 Register — obligation extraction

The step that makes everything downstream possible, and it is a **lookup, not an analysis**.

Every clause record carries a declared `obligations[]` array, authored by Legal when the clause is
approved and promoted. Registration walks the executed decision set, reads each selected clause's
declared obligations, binds them to concrete dates and parties from the agreement record, and
writes obligation instances.

```
for each decision in agreement.decisions:
    for each template in decision.selected.obligations:
        emit Obligation(
            source_clause = decision.selected.id,     ← provenance, always
            owner         = resolve(template.owner, agreement.parties),
            due           = resolve(template.schedule, agreement.dates),
            evidence      = template.evidence_type
        )
```

No model runs here. If a clause declares no obligations, none are created — and that gap is
reported, not guessed at. **Obligation coverage becomes a library-quality metric**, exactly like the
existing coverage-gap report: a clause with obligations in its text but none declared on its record
is a Legal authoring defect, and the system can say so.

### 3.3 Operate

The steady state, and where most of the calendar lives.

- **Obligation monitoring** — each instance runs `pending → due → satisfied | breached | waived`.
- **Evidence capture** — satisfaction requires evidence of the declared type: a document (insurance
  certificate), an attestation (named human confirms), a system signal (integration), or a
  counter-party acknowledgement.
- **Alerting** — leads are declared per obligation type, not global. A 30-day insurance renewal and
  a 180-day auto-renewal notice window need different runways.
- **Entitlement prompts** — obligations the *counterparty* owes us, surfaced as claimable: service
  credits earned, benchmarking rights ripe, audit rights exercisable. Most CLM value leaks here,
  because nobody is watching the clock on rights they hold.

### 3.4 Disposition — renew, amend, terminate

Every agreement reaches one of three exits, and all three route back through machinery that already
exists.

**Renew.** The notice window opens; the system proposes renew / renegotiate / lapse. Renewal
re-enters **Assembly** with the original manifest as the starting point, re-resolved against the
current library. A drift report shows exactly which clauses would change and why — this is where
retired and **superseded** language is caught and replaced. The report walks the agreement's pinned
clause versions against current ones; see
[CLA §5](CLAUSE-LIBRARY-ARCHITECTURE.md) and
[ADR-0009](docs/decisions/ADR-0009-concession-is-not-supersession.md).

**Amend.** An amendment is a **new assembly run scoped to the changed categories**, producing an
amending instrument that references the original. The original executed record is never edited.
The agreement's effective terms become the ordered composition of the original plus its amendments,
which is precisely what the existing Order of Precedence baseline clause governs.

**Terminate.** For cause, for convenience, or by expiry. Termination triggers the wind-down path
and freezes the operating clock — but not the surviving obligations.

### 3.5 Wind-down and close

Termination is not the end, and treating it as one is the classic CLM failure.

- **Survival obligations** activate: confidentiality tails, data deletion and return, records
  retention, post-termination audit rights, transition assistance. These are declared on the clause
  record like any other obligation, with `survives: true` and a term measured from termination
  rather than from effective date.
- **Close** occurs only when every surviving obligation is satisfied or expired. An agreement with
  an unmet data-deletion duty is *not* closed, however long ago it terminated.
- The **retention clock** then runs independently to the horizon the system's own Records Retention
  clause imposes — 7 years, matching the audit retention already required in `ARCHITECTURE.md` §5.

---

## 4. Deterministic / inference boundary

Lifecycle is even more deterministic than assembly, because the hard problem — knowing what the
contract says — was solved at assembly time by construction.

**Deterministic (all of it that matters)**

| Subsystem | Nature |
|---|---|
| Obligation extraction | Lookup of declared `obligations[]` by clause ID |
| Date arithmetic | Term, notice windows, renewal dates, survival periods |
| Obligation state machine | `pending → due → satisfied \| breached \| waived` |
| Alert scheduling | Declared lead times per obligation type |
| Survival determination | `survives` flag on the clause's obligation templates |
| Renewal drift report | Set difference: executed decision set vs re-resolution |
| Amendment composition | Ordered overlay under Order of Precedence |
| Close eligibility | All surviving obligations terminal |
| Retention expiry | Date arithmetic against the retention clause |
| Obligation coverage gaps | Clauses in force declaring no obligations |

**Inference — three narrow, optional uses, each with a deterministic fallback**

| # | Use | Output | Fallback |
|---|---|---|---|
| 1 | **Obligation drafting aid** — proposes `obligations[]` for a clause *at authoring time*, for Legal to edit and approve | A draft template shown to Legal | Legal authors it manually |
| 2 | **Evidence triage** — classifies an uploaded document as plausibly satisfying a named obligation | A suggestion + confidence | Human files it manually |
| 3 | **Renewal drift summary** — narrates a deterministically-computed diff | Prose *about* the diff | The diff table itself |

Note what is absent: no model reads an executed contract, determines an obligation, computes a date,
closes an obligation, or decides a disposition. Use #1 operates on the *library* before approval —
the same gate all clause content passes through. Use #3 narrates a computed artifact and can be
switched off with no loss of function.

**Third-party paper.** Agreements not assembled by Clausewerk have no clause IDs and therefore no
declared obligations. They are **out of scope for automatic registration** and must be registered
manually. Running an extraction model over them would import exactly the uncertainty this
architecture exists to eliminate, and would put model-derived obligations in the same table as
declared ones. If third-party paper is later required, it belongs in a separately-badged
`provenance: 'external'` population that can never be mistaken for the derived-by-ID set.

---

## 5. Data model additions

Extends [`docs/data-model.md`](docs/data-model.md).

### Obligation template — new field on the clause record

Authored by Legal, approved through the Review queue like everything else on a clause.

| Field | Notes |
|---|---|
| `kind` | `deliver` \| `pay` \| `notify` \| `maintain` \| `refrain` \| `permit` |
| `owner` | `customer` \| `vendor` — resolved to a party at registration |
| `schedule` | `once` \| `recurring` \| `on_event`, plus offset from a named anchor date |
| `evidence` | `document` \| `attestation` \| `system` \| `counterparty_ack` |
| `lead_days` | Alert runway, per obligation |
| `survives` | Whether it outlives termination, and for how long |
| `entitlement` | True if this is a right *we hold* rather than a duty we owe |

### Executed agreement — new root entity

| Field | Notes |
|---|---|
| `agreement_id` | Stable, external-facing |
| `library_snapshot_id` | **The pin.** Makes resolution reproducible forever |
| `decisions[]` | The executed decision set, frozen |
| `parties`, `effective`, `term`, `renewal` | Commercial spine |
| `signature_evidence` | E-signature envelope reference |
| `amendments[]` | Ordered; composition governed by Order of Precedence |
| `status` | `executing → active → terminating → wound_down → closed` |
| `retention_until` | Independent of `status` |

### Obligation instance

| Field | Notes |
|---|---|
| `obligation_id`, `agreement_id` | |
| `source_clause` | **Always present.** The provenance chain: obligation → clause → policy → reviewer |
| `owner_party`, `due`, `state`, `evidence_ref` | |
| `closed_by`, `closed_at` | Named human or the deterministic rule that closed it |

The `source_clause` field is what lets an auditor walk backwards from *"why are we deleting this
data on 14 March?"* to a clause, a policy citation, a reviewer, and an approval date — the same
chain assembly already provides, extended past signature.

---

## 6. Roles

Uses the model in [ADR-0008](docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md),
plus one lifecycle-specific role:

- **Obligation owner** — the named human accountable for a specific obligation instance. Not a
  system-wide role but a per-obligation assignment, and it must resolve to a person, never a team
  inbox. Unassigned obligations on an active agreement are a reported defect.

Waiving an obligation is an override and follows the ADR-0008 path: request → socialise → approve,
recorded per obligation. Nobody silently marks a breached duty as waived.

---

## 7. What is already implemented

The expiry-warning half of §2 is live in the v3 prototype, since it was directive-driven work
during the bug-fix pass:

- `expiryWarnings(decisions, ledger)` (`engine.jsx`) re-reads every selected clause from the **live**
  ledger, so a clause that lapsed since Forge is caught rather than trusted from resolution time.
- `<ExpiryNotice>` (`validate.jsx`) renders at **every negotiation round** (Negotiate inbox) and at
  **signature** (Dossier), distinguishing lapsed and retired (blocking) from expiring-soon
  (warning).
- The clause clock is live — see
  [`docs/spec-vs-implementation.md` §6](docs/spec-vs-implementation.md).

Everything else in this document is specification.

---

## 8. Backend requirements

Extends `ARCHITECTURE.md` §5.

| Service | Responsibility |
|---|---|
| Agreement registry | Executed records, snapshot pins, amendment chains, status machine |
| Obligation engine | Instantiation from templates, state machine, close eligibility |
| Scheduler | Date arithmetic, alert dispatch, notice-window detection. Must be idempotent and replayable — a missed run cannot mean a missed obligation |
| Evidence store | Documents and attestations, immutably linked to obligation instances |
| Disposition service | Renewal drift reports, amendment scoping, termination orchestration |
| Retention service | Close eligibility, retention expiry, defensible deletion |

**Non-functional**

- **The scheduler is the system of record for time, and must be replayable.** Reconstruct what was
  due on any past date from the event log alone.
- **Timezone and business-day semantics must be explicit per obligation.** "30 days' notice" is a
  legal quantity, not a `setDate()` call.
- Obligation state transitions are append-only and hash-chained, same as the assembly audit log.
- An agreement's executed decision set is immutable. Amendments compose; they never mutate.

---

## 9. Frontend requirements

Four surfaces, extending the existing nine panels.

- **Portfolio** — every agreement by status, term, and value. The default lifecycle landing view.
- **Agreement** — one executed record: the document, its decision set with provenance intact, its
  amendment chain, its obligations, its dates.
- **Calendar** — obligations and entitlements over time, filtered by owner. The daily-use surface.
- **Disposition** — the renewal/amend/terminate workbench, showing the drift report clause by clause.

Carrying over from `ARCHITECTURE.md` §6, and load-bearing here:

- **Every obligation shows its source clause.** Provenance is adjacent to the item, always — the
  same rule as justification-beside-clause-text in the Dossier.
- **Entitlements are as prominent as obligations.** A UI that shows only duties trains people to
  treat the system as a compliance chore rather than a source of recoverable value.
- **Nothing closes silently.** Satisfaction shows evidence and a named closer.
- **Derived-by-ID obligations are visually distinct** from any manually-registered ones.

---

## 10. Open questions

Genuinely unsettled, and better flagged than guessed:

1. **Obligation template authoring is a large Legal backlog.** Every clause in a ~500-clause library
   needs `obligations[]` authored before registration is useful. Phasing — highest-value categories
   first — is a rollout question with no obvious right answer.
2. **Breach is defined but not adjudicated.** The system can detect an unmet obligation. Whether it
   asserts breach, and what that triggers, is a legal decision with consequences well beyond a
   status field.
3. **Entitlement valuation.** Service credits and indexed price adjustments need computation against
   commercial data the system does not hold. Integration boundary is undefined.
4. **Multi-agreement obligations.** MSA-plus-SOW structures mean obligations that live on the master
   but attach to work under the children. The composition rule is not specified here.
5. **Third-party paper**, per §4 — deliberately excluded, and the pressure to include it will be
   real.
