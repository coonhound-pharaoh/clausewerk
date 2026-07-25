# Clausewerk — Clause Library Architecture (CLA)

Third of the three specifications.

| Document | Scope |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Assembly and negotiation, ending at `contract.docx` |
| [`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md) | The LCMA — everything after signature |
| **`CLAUSE-LIBRARY-ARCHITECTURE.md`** | **The library itself — what we approve, what we concede, and what we learn** |

---

## 1. Intent

In the original architecture the Ledger is a store: clauses go in, clauses come out. That is enough
to assemble a contract and not enough to run a negotiation programme.

This document makes the library **strategic**. Three capabilities it does not have today:

1. **A documented negotiating position, not just a clause.** Real procurement teams do not have one
   approved position per risk — they have a preferred position, an acceptable fallback, and a
   floor. Today that ladder lives in senior lawyers' heads, so every vendor push-back escalates.
2. **A record of what we actually gave away.** When a vendor's language is accepted, that is a
   **concession** — a deviation from our standard position on one deal. Today it is either
   invisible or wrongly promoted into the library as though it were a new standard.
3. **A feedback loop from concessions to library design.** If we conceded the same point fourteen
   times and Legal approved it every time, our "standard" position is not our real position. The
   library should be able to say so.

The invariant carries over unchanged and constrains everything below:

> **The model never authors contract language.**

Analytics count, rank, and cluster. They produce **proposals for a human**, never text. Every rung
of every ladder is approved clause text written by a lawyer, exactly like the clauses that exist
today.

---

## 2. Three populations

The library holds three distinct things. Conflating them is the current defect.

| | **Standard positions** | **Fallback ladders** | **Concessions** |
|---|---|---|---|
| What | Our opening position per category | Pre-approved retreat path | What we actually gave away, per deal |
| Scope | Library-wide | Library-wide | **One agreement** |
| Authored by | Legal | Legal | Nobody — *recorded*, not written |
| Changes the library? | — | — | **No** |
| Created by | Approval | Approval | Accepting a vendor's ask |

The critical rule, and the answer to *"is a review ticket a supersession?"*:

> **Accepting a vendor's language is a concession, not a library change.**
> It records what we agreed on one deal. It changes nothing for the next deal.
> The library only changes when Legal deliberately decides it should.

---

## 3. Fallback ladders

The single highest-value addition, because it attacks the system's main bottleneck.

Each category holds an ordered ladder of approved positions:

```
Data Privacy · High
  rung 0  PREFERRED   DP-H-014@v3   24-hour breach notice, full SCCs
  rung 1  ACCEPTABLE  DP-H-052@v1   48-hour breach notice, SCCs, audit rights retained
  rung 2  FLOOR       DP-H-061@v1   72-hour notice, SCCs — do not go below
          ────────────────────────────────────────────────
          below floor → escalate to Legal, always
```

Every rung is ordinary approved clause text with its own ID, rationale, citations, reviewer, and
expiry. A ladder is metadata *over* clauses, not a new kind of content.

### Why this matters more than it looks

Today, a vendor's counter either matches an approved clause above the similarity threshold or it
**escalates to Legal**. That makes Legal the binding constraint on negotiation throughput
([ADR-0003](docs/decisions/ADR-0003-review-queue-is-the-only-mutation-surface.md)).

With ladders, Legal pre-approves the *concession space* once, in advance. The matcher can then
resolve a vendor's ask against rung 1 or rung 2 without a human — because a lawyer already decided
that position is acceptable. Escalation is reserved for genuinely below-floor asks.

This converts Legal's involvement from **per-negotiation** to **per-category, periodically**, which
is the difference between a system that scales and one that doesn't.

### Guardrails

- Moving down a rung is a recorded act with a reason, visible to the deal owner. Cheap, not free.
- The floor is a hard stop. Below-floor always escalates; no threshold, no auto-approve, no
  override outside [ADR-0008](docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md).
- Rung selection is **deterministic** — the matcher returns a clause ID as it always did. Ladders
  change which IDs are eligible, not how selection works.
- A ladder with no floor is a configuration error and is reported as one.

---

## 4. Concessions

A concession is created when a negotiation resolves to anything other than our standard position:
we dropped to a lower rung, or we accepted vendor language outright.

| Field | Notes |
|---|---|
| `agreement_id`, `clause_category` | Where and about what |
| `standard_position` | The clause ID we opened with |
| `conceded_to` | The rung ID we settled on — **or** `vendor_language` |
| `depth` | Rungs descended; `below_floor` if we went past it |
| `vendor_text_ref` | The accepted text, stored **as a concession artifact, never as a library clause** |
| `counterparty`, `sector`, `deal_value`, `date` | The analysis dimensions |
| `reason` | Why we conceded — commercial leverage, immaterial risk, regulatory necessity |
| `approved_by` | Named human, per [ADR-0008](docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |

**Concession text is quarantined.** It lives in the concession record, is badged as vendor
language, and is never selectable by `resolveClauses`. The only route from a concession into the
library is a deliberate Legal promotion (§6), which mints a normal clause through the normal gate.

This is the point where the current design goes wrong: the Review queue mints library clauses from
vendor redlines, so one deal's compromise silently becomes everyone's starting position. Under this
architecture that promotion still exists, but it is a **separate, deliberate act**, not a
side-effect of closing a negotiation.

---

## 5. Version history and supersession

### Versions are immutable

Clause records are versioned and never overwritten — a contract executed under `v1` must resolve
`v1` forever ([ADR-0006](docs/decisions/ADR-0006-clause-expiry-is-computed-not-stored.md)). Editing
a clause creates a new version; the previous version remains readable, permanently.

```
DP-H-014@v1  2024-01-08  ──superseded by v2──┐
DP-H-014@v2  2025-06-02  ──superseded by v3──┤
DP-H-014@v3  2026-03-11  ← current           │
                                             │
             version history: queryable, exportable, never pruned
```

### Supersession is a distinct, auditable act

**Supersession replaces a clause.** It is a library-level decision by Legal, not a negotiation
outcome.

A supersession record carries: predecessor version, successor version, **reason**, approving
reviewer, decision date, effective date, and whether the predecessor is retired immediately or runs
off. It is an append-only audit event (`clause_superseded`) like every other governed act.

Clause state becomes a four-value enum, and the distinctions are load-bearing:

| State | Meaning | Selectable |
|---|---|---|
| `active` | Current approved position | Yes |
| `superseded` | Replaced by a newer version | No — but resolvable for agreements that used it |
| `retired` | Withdrawn, not replaced | No |
| `expired` | Lapsed on its own date | No |

`superseded` ≠ `retired`. A superseded clause was replaced by something better; a retired clause was
withdrawn. An auditor asking "why did this change?" gets a different answer in each case, and
today's single `active` boolean cannot tell them apart.

### Superseded language surfaces at renewal

The reason any of this matters commercially.

When an executed agreement approaches renewal, the LCMA drift report walks its pinned decision set
and flags every clause whose version has been superseded since signature:

```
Northwind Analytics · MSA · renewal 2027-03-01

  DP-H-014@v1 → @v3   SUPERSEDED ×2
    v2: aligned breach notice to 24h (Policy-DP-014 §3 update)
    v3: added SCC module for post-2026 transfers
    ⚠ this agreement carries 2024 language on a regulated data flow

  LC-S-009@v2 → @v2   current
  …
```

The renewal then re-enters assembly and resolves against the **current** library. This is how
executed agreements converge on current approved language without anyone ever rewriting a signed
contract — and it is the mechanism that makes version history worth keeping rather than merely
tidy.

---

## 6. Negotiation intelligence

The strategic layer: turning the concession record into library improvements.

**All analysis is deterministic aggregation.** Counting, grouping, and ranking over structured
concession data — no model reads a contract, and no model proposes text.

### What it computes

| Signal | The question it answers |
|---|---|
| **Concession rate** per clause | How often is our standard position rejected? |
| **Settlement point** | Which rung do deals actually land on? |
| **Time-to-agreement** by rung | What does holding rung 0 cost us in days? |
| **Escalation rate** | Which categories consume Legal's time? |
| **Below-floor frequency** | Where is our floor unrealistic? |
| **Counterparty patterns** | Which vendors always push the same clause? |
| **Segment variance** | Does the position hold in one sector and not another? |

### What it proposes

Proposals are structured findings for Legal to accept or reject — never automatic changes:

- *"`PT-S-022` conceded on 14 of 17 deals, always to the same position. Consider making that
  position rung 1, or reconsider rung 0."* — **the standard position is fiction; the library should
  say what we actually do.**
- *"`SLA & Uptime` escalated on 9 of 11 deals. No ladder defined."* — **a missing ladder, priced in
  Legal hours.**
- *"Floor breached 4 times on `Liability Cap`, approved every time."* — **the floor is in the wrong
  place, or the override process is being used to route around it.**
- *"3 concessions this quarter converged on near-identical vendor language."* — **a candidate for a
  new approved rung**, routed through the normal promotion gate.
- *"`AU-S-042` has never been negotiated in 40 deals."* — **an uncontroversial clause**; useful for
  knowing where not to spend attention.

### Where inference is permitted

Two narrow uses, both advisory, both with deterministic fallbacks:

| Use | Output | Fallback |
|---|---|---|
| **Concession clustering** — group similar accepted vendor texts so a human sees "these 3 are the same ask" | A grouping, shown with all members visible | Exact/keyword grouping |
| **Proposal narration** — describe a deterministically-computed statistic in prose | Prose *about* the numbers | The numbers themselves |

Absent by design: no model decides whether to concede, sets a floor, drafts a rung, or promotes
anything. Clustering is a **reading aid over data a human then reads** — if it groups wrongly, a
human sees the members and disagrees.

---

## 7. Governance

Extends [ADR-0008](docs/decisions/ADR-0008-governance-roles-and-recorded-overrides.md).

| Act | Who |
|---|---|
| Record a concession | Automatic, on negotiation resolution |
| Descend a rung | Requester, recorded |
| Go below floor | Override request → Legal approval |
| Author a rung | Legal reviewer, through the Review queue |
| Reorder / set floor | Legal admin |
| Promote a concession into the library | Legal admin, deliberate act, confirmation modal |
| Supersede a version | Legal admin, with reason |
| Read concession analytics | Legal, Auditor; Requester sees their own deals |

Concession analytics are **commercially sensitive** — an aggregate of exactly what we will give
away under pressure. Access is Legal and Auditor by default, and the data must never leave in a
vendor-facing export.

---

## 8. Data model

Extends [`docs/data-model.md`](docs/data-model.md).

**Clause version** — adds to the existing clause record: `version`, `supersedes`, `superseded_by`,
`state` (`active` | `superseded` | `retired` | `expired`), `ladder_id`, `rung`.

**Ladder** — `ladder_id`, `category`, `severity`, ordered `rungs[]` of clause version IDs,
`floor_rung`, `owner`, `reviewed_on`.

**Concession** — as §4. Immutable once written; corrections are new records.

**Supersession** — `predecessor`, `successor`, `reason`, `approver`, `decided`, `effective`,
`predecessor_disposition` (`retire_now` | `run_off`).

**Proposal** — `signal`, `evidence[]` (concession IDs — always traceable to source), `state`
(`open` | `accepted` | `rejected`), `decided_by`, `note`.

---

## 9. Backend requirements

Extends `ARCHITECTURE.md` §5.

| Service | Responsibility |
|---|---|
| Clause registry *(extended)* | Versioning, supersession chains, state machine, lineage queries |
| Ladder service | Ladder definition, rung ordering, floor enforcement, eligibility for the matcher |
| Concession store | Append-only, quarantined vendor text, deal-scoped |
| Analytics engine | Deterministic aggregation; proposal generation; scheduled recomputation |
| Promotion service | Concession → library clause, through the Review gate |

**Non-functional**

- **Resolution must remain reproducible.** Ladders change *eligibility*, so a run record must pin
  the ladder configuration as well as the library snapshot — otherwise the same manifest resolves
  differently next quarter and the determinism guarantee is lost. This is a real trap.
- Version lineage queries must be cheap; the renewal drift report walks them for every agreement.
- Concession data is append-only and never anonymised away — provenance is the point.
- Analytics are recomputed on a schedule, never on the negotiation path.

---

## 10. Frontend requirements

Three surfaces, extending the existing Ledger panel.

- **Ladder editor** — a category's rungs top to bottom, floor marked unmistakably, each rung
  showing its clause text and its concession rate. Legal's strategic view.
- **Concession explorer** — every concession, filterable by clause, counterparty, sector, value,
  depth. The commercial view: *what do we actually agree to?*
- **Proposals** — the ranked queue of library changes the data suggests, each showing the evidence
  that generated it and accept/reject in one act.

Carrying forward from `ARCHITECTURE.md` §6, and load-bearing here:

- **Every proposal shows its evidence.** A recommendation without its underlying concessions is an
  assertion, and this system does not make assertions.
- **Concession text is always badged as vendor language**, in every view, with no exception.
- **The floor is visually absolute** — not a stronger shade of warning.
- Superseded versions are readable, never editable, and always show what replaced them and why.

---

## 11. Open questions

1. **Ladder depth.** Three rungs is a guess. Too few and everything escalates; too many and the
   floor stops meaning anything.
2. **Concession decay.** A concession from four years ago under different regulation should
   probably weigh less than last month's. No weighting is specified.
3. **Sample size before proposing.** Three similar concessions is a coincidence; fourteen is a
   pattern. The threshold is unset, and setting it too low turns the proposals queue into noise.
4. **Ladders and expiry interact.** If rung 1 expires, does the ladder collapse upward, or does the
   category lose its ladder until Legal re-approves? Silent collapse would be dangerous.
5. **Multi-category concessions.** Vendors trade across categories — accepting a liability cap
   *because* an indemnity narrowed. The concession record is per-category and cannot express that,
   which is the same blind spot as
   [ADR-0007](docs/decisions/ADR-0007-one-redline-per-changed-paragraph.md).
