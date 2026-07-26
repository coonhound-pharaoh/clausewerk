# Clausewerk — Negotiation Architecture (NA)

Fourth specification. Covers **end-to-end negotiation**: every round captured, supplier paper
supported, each round analysed, alternatives offered — and the **Clause Library Builder** that
turns what we learn into approved language.

| Document | Scope |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Assembly, ending at `contract.docx` |
| [`CLAUSE-LIBRARY-ARCHITECTURE.md`](CLAUSE-LIBRARY-ARCHITECTURE.md) | The library — ladders, concessions, supersession |
| **`NEGOTIATION-ARCHITECTURE.md`** | **Rounds, supplier paper, per-round analysis, the Builder** |
| [`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md) | After signature |

---

## 1. Intent

`ARCHITECTURE.md` §2.7 handles *a* redline: one upload, matched against the library. That is a
feature, not a negotiation. A real negotiation is six rounds over eleven weeks, on either party's
paper, with positions that move, get traded, and are sometimes revisited three rounds later.

This document makes the **negotiation itself** the object of record. Three things follow:

1. **Every round is captured** — what they sent, what we sent, what changed, what we agreed. The
   negotiation history is evidence, and today it lives in an email thread.
2. **Supplier paper is supported**, by decomposing their document into clause-like units scoped to
   that one agreement. Previously excluded; now supported, with hard limits on what it may touch.
3. **Each round is analysed and answered** — identified, categorised, risk-assessed, and paired
   with alternatives from our library, so a buyer is never staring at a redline with no idea what
   we would normally accept.

And upstream of all of it, the **Clause Library Builder** drafts candidate clauses and negotiating
moves for Legal to approve — see [ADR-0010](docs/decisions/ADR-0010-ai-drafted-clause-candidates.md),
which amends the founding invariant to permit it.

### What does not change

The assembly-time invariant. Nothing in this document lets a model put words into a contract. AI
drafts *proposals*; a named human approves them; the deterministic executor still fetches immutable
text by ID. `authored_characters()` still asserts zero on every generated document.

---

## 2. The negotiation record

```
NEGOTIATION  (one per agreement, opened at first exchange)
  │
  ├── ROUND 1  ← our paper, issued          run RUN-001, snapshot S1
  ├── ROUND 2  → their redline, received    4 positions, 1 escalated
  ├── ROUND 3  ← our response, issued       2 held, 1 conceded to rung 1, 1 escalated
  ├── ROUND 4  → their redline, received    …
  └── ROUND n  ← executed                   → frozen (LCMA §3.1)
```

**A round is immutable once closed.** It records the document as exchanged, its SHA-256, the
direction, the date, who sent it, and the positions it moved. Rounds are append-only for the same
reason runs are: the negotiation history is the evidence of how a position was reached.

### Position — the unit that persists across rounds

A redline is per-paragraph and per-round (ADR-0007). A **position** is the thread that connects
them: one contested point, tracked from first raised to finally settled.

| Field | Notes |
|---|---|
| `position_id`, `negotiation_id` | |
| `category` | Enum-constrained, as everywhere |
| `our_clause` | The clause reference we opened from, if ours |
| `their_text_ref` | Their wording, quarantined (§3) |
| `state` | `open → conceded \| held \| withdrawn \| escalated → settled` |
| `current_rung` | Where we are on the ladder, if there is one |
| `round_raised`, `round_settled` | |

Positions are what make the third-round-revival visible: a point marked `held` in round 2 that
reappears in round 5 is the same position reopening, not a new redline. Without this the system
would have no memory and the buyer would negotiate the same point twice without noticing.

---

## 3. Supplier paper

Reversing the exclusion in [LCMA §4](LIFECYCLE-ARCHITECTURE.md), with limits.

When the counterparty's template is the base document, there are no clause IDs — their paper is
prose we did not write. **AI decomposes it into clause-like units** so the rest of the system can
operate: categorise, assess, compare, offer alternatives.

### The hard boundary

> **Atomised supplier clauses are scoped to one agreement. They are never selectable, never enter
> the library, and never appear in a document we assemble.**

They live beside concessions in the quarantine (ADR-0009), carrying `origin: external`. The
promotion path exists — a Legal admin may deliberately promote one — and it is the same gate as
everything else, never automatic.

### Atomisation

| Step | Nature |
|---|---|
| Split their document into candidate clauses | **Inference** — heading structure, numbering, and semantic boundaries |
| Assign each a category | **Inference**, enum-constrained; unknown categories are dropped, as at the manifest boundary |
| Assess severity and risk | **Inference**, advisory, always shown with its reasoning |
| Match to our library | Deterministic scoring / vector retrieval, returning IDs and scores |
| Present alternatives | Deterministic — our clause, our ladder rungs, and what we normally accept |

Every atomised unit keeps a **character range back into the source document**, so a reviewer can
always see the original text in place rather than trusting the split. An atomisation that cannot
point back at its source is a bug, not a clause.

**The deterministic fallback**, per [ADR-0005](docs/decisions/ADR-0005-deterministic-fallbacks.md):
with no model available, supplier paper splits on headings and numbering alone, categorises by
keyword rules, and marks every unit `low confidence · unclassified`. The negotiation still runs;
the buyer just gets less help.

---

## 4. Round analysis

Every inbound round goes through the same pass, in this order. Each step is separately visible —
a buyer who disagrees with the categorisation needs to see it *before* the alternatives are chosen.

1. **Parse** — deterministic. One redline per changed paragraph, or full atomisation for their
   paper on the first round.
2. **Identify** — inference. Which position does this touch? An existing one, or new?
3. **Categorise** — inference, enum-constrained. Unknown categories are dropped at the boundary,
   exactly as in the manifest.
4. **Assess risk** — inference, advisory. Severity plus a one-sentence justification quoting the
   change. Never a number without the sentence.
5. **Compare to our position** — deterministic. What we opened with, where we are on the ladder,
   what the floor is, what we conceded on comparable deals.
6. **Offer alternatives** — deterministic. Ladder rungs at or above the floor, ranked; the
   concession record for this category; and for each option, what it costs us.
7. **Recommend** — inference, advisory, and clearly marked as such. Never auto-applied.

### Alternatives are the point

This is the step that makes the system useful to a buyer rather than to Legal. Faced with a
vendor's counter, the buyer sees:

```
THEIR ASK   Liability capped at USD 50,000
OUR OPENING LC-S-009 · capped at fees paid (rung 0)
LADDER      rung 1  LC-S-014  capped at 12 months' fees        ← available
            rung 2  LC-S-021  capped at 24 months' fees  FLOOR ← available
            below floor → escalate
HISTORY     conceded to rung 1 on 9 of 14 comparable deals; below floor twice, both approved
```

Every line of that is computed from stored records. Nothing is generated, and the recommendation
that follows it is labelled as advice.

---

## 5. The Clause Library Builder

The upstream half. Where §4 helps a buyer answer *this* negotiation, the Builder turns the
accumulated record into approved language so the next one starts better.

**It drafts. It never publishes.** See
[ADR-0010](docs/decisions/ADR-0010-ai-drafted-clause-candidates.md).

### What it drafts from

Never from a blank prompt. A draft is grounded in stated inputs, all of which are recorded with it:

- **Company rules and policy** — the standards Legal has written down.
- **The concession record** — what we actually agree to under pressure. If we conceded the same
  position fourteen times, the Builder can propose making it an official rung.
- **Coverage gaps** — category × severity combinations with no active clause, already computed.
- **Supplier paper we have seen** — patterns across counterparties, as market context.
- **Existing clauses** — for a new rung on an existing ladder, the neighbouring rungs are the
  strongest constraint on what the new one should say.

### What it produces

| Output | Then what |
|---|---|
| **Clause draft** | Review queue → named approver → clause with `origin: ai_drafted` |
| **Ladder move** | A proposed new rung, positioned relative to the floor |
| **Rule draft** | A conflict-rule predicate in the three-primitive grammar (§4 of the CLA) |
| **Gap report** | Deterministic, no model — where the library is thin |

Each draft carries its **prompt, model, model version, rule inputs and source records**, so the
provenance chain reaches back past the lawyer to what the lawyer was shown.

### Guardrails

- A draft is a **proposal**, not a clause. It has no ID in the clause namespace until approved.
- Approving **unedited** is recorded distinctly from approving an edited draft. The unedited-approval
  rate is the metric that reveals whether review has quietly stopped happening, and it must be
  visible to Legal leadership, not buried.
- A draft may not be approved by whoever requested it, when the requester is not Legal.
- Drafts expire. An un-actioned proposal goes stale rather than lingering as a decision nobody made.
- The Builder **may not draft a replacement for a clause it did not have the predecessor for** —
  a supersession needs a lawyer to say what is wrong with the current position.

---

## 6. Deterministic / inference boundary

Inference now has more surface than in `ARCHITECTURE.md` §4. It is worth stating plainly rather
than letting it accumulate quietly.

**Inference — advisory in all cases, deterministic fallback in all cases**

| # | Use | Output | Fallback |
|---|---|---|---|
| 1–3 | Interviewer, classifier, redline matcher | as `ARCHITECTURE.md` §4 | unchanged |
| 4 | **Supplier-paper atomisation** | Candidate clause boundaries + categories | Heading/numbering split, keyword categories, marked low-confidence |
| 5 | **Position identification** | Which position a change touches | New position per changed paragraph |
| 6 | **Round risk assessment** | Severity + justification sentence | Keyword rules |
| 7 | **Clause / ladder / rule drafting** | A proposal for Legal | Legal composes it, as today |
| 8 | **Recommendation** | Advice, labelled | The computed comparison alone |

**Deterministic — unchanged and load-bearing**

Resolution, validation, ladder descent, concession recording, the run store, document assembly,
redline parsing, the audit log. Everything that decides what a contract *says* remains code.

**Still prohibited, absolutely**

- Model output reaching a contract without a named human approving it.
- Model text entering the library without passing the Review gate.
- Model selection outside the enumerated, active, in-category pool.
- Model-invented categories surviving the boundary.
- Model overriding a validation gate, a ladder floor, or an expiry block.
- **Auto-approving its own drafts.** The Builder proposing and the Builder's proposal being
  accepted are two acts by two parties, one of whom is a person.

---

## 7. Data model additions

**Negotiation** — `negotiation_id`, `agreement_id`, `paper` (`ours` | `theirs`), `opened_on`,
`state`, `current_round`.

**Round** — `round_no`, `direction` (`issued` | `received`), `document_sha256`, `storage_uri`,
`sent_on`, `actor`, `run_id` (for rounds we issued). Immutable once closed.

**Position** — as §2, plus `history[]` of round-by-round movement.

**External clause** — `agreement_id`, `source_round`, `ordinal`, `text`, `char_range`, `category`,
`severity`, `confidence`, `origin: 'external'`. Never selectable.

**Draft** — `draft_id`, `kind` (`clause` | `rung` | `rule`), `text`, `prompt`, `model`,
`model_version`, `inputs[]`, `state` (`proposed → approved | rejected | expired`), `approved_by`,
`edited_before_approval` (bool).

**Clause version** gains `origin` — `legal_authored` | `ai_drafted` | `vendor_derived` |
`external`. Immutable, survives supersession, reportable.

---

## 8. What this costs

Stated plainly, because the tension in
[ADR-0010](docs/decisions/ADR-0010-ai-drafted-clause-candidates.md) is real.

- **The simplest claim is gone.** `0 LLM-authored characters` remains true of the assembly path and
  is still asserted by test. It is no longer true of the *library* once AI-drafted clauses are
  approved into it. Both numbers will be computed per contract; which one is published is an owner
  decision, and quietly keeping the old footer while the second is non-zero would mislead.
- **Review quality becomes the binding control.** A fluent draft is approved faster than a blank
  page is filled. The unedited-approval rate is instrumented for exactly this, and someone has to
  watch it.
- **Supplier paper brings uncertainty inside the walls.** Atomisation is inference over prose we did
  not write. The quarantine keeps it out of the library; it does not make the categorisation right,
  which is why every unit points back at its source text.
- **More inference means more to version.** Prompt and model versions now sit in the provenance
  chain of approved language, so a model upgrade is a change-controlled legal event.

---

## 9. Open questions

1. **Who owns the unedited-approval rate?** Instrumenting it is easy; acting on it needs an owner
   and a threshold nobody has set.
2. **Atomisation disagreement.** When a reviewer says the split is wrong, is that a correction to
   this agreement only, or training signal? The system has no concept of the latter and should not
   acquire one accidentally.
3. **Cross-round trades.** Vendors concede one point to win another. Positions are tracked
   individually, so a trade is invisible — the same blind spot as ADR-0007, now one level up and
   more consequential.
4. **Draft attribution in executed contracts.** If wording that began as an AI draft ends up in a
   signed agreement, does the counterparty have any interest in knowing? A legal question, not an
   engineering one, and worth asking counsel before the first one ships.
