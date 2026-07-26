# ADR-0010 — AI may draft candidate clauses; it still cannot put words in a contract

**Status:** Accepted · specified in [`NEGOTIATION-ARCHITECTURE.md`](../../NEGOTIATION-ARCHITECTURE.md)

**Amends [ADR-0001](ADR-0001-model-never-authors-contract-language.md)**, the founding invariant.
Read that first.

## Context

The owner has asked for a **Clause Library Builder**: a tool that uses AI to draft clauses and
negotiating moves from rules and company input. That is a direct collision with the first hard
prohibition in `ARCHITECTURE.md` §4 — *"the model never writes, paraphrases, summarises, or
'improves' clause text."*

The collision is real and should not be smoothed over. But it is narrower than it first appears,
and locating it precisely is what lets the system keep its integrity.

**Where the invariant was actually doing work.** ADR-0001 exists so that a reviewer or regulator
asking *"who approved this sentence?"* gets a person and a date, not a model version. It achieves
that by two separate mechanisms:

1. **At assembly** — a deterministic executor fetches immutable text by ID. Nothing generates.
2. **At authoring** — text enters the library only through a named human.

The Library Builder touches the second only. A drafted candidate is not a clause; it is a proposal.
It becomes a clause when a lawyer approves it, at which point it is approved language with a named
approver and a date — exactly the property the invariant protects.

**What genuinely changes** is the provenance of some approved wording: previously every word was
composed by a lawyer; now some words may have started as an AI draft that a lawyer read, edited and
approved. That is a real change and the claim has to change with it.

## Decision

### The assembly-time invariant is untouched

Nothing in this ADR alters how a contract is assembled. `resolveClauses` remains pure, still selects
by ID from the approved pool, still cannot generate. The document service still emits only clause
bodies, and `authored_characters()` still asserts zero. **No model output reaches a contract
without passing through the library gate first.**

Four of the five hard prohibitions stand unchanged:

- The model still **never** selects outside the enumerated, active, in-category pool.
- The model still **never** invents a category.
- The model still **never** commits anything to the library. Only a named human, through Review.
- The model still **never** overrides a validation gate.

### The first prohibition is narrowed, not deleted

| | Before | After |
|---|---|---|
| Model writes text into a **contract** | Never | **Never** — unchanged |
| Model writes text into the **library** | Never | Never — only a human commits |
| Model **drafts a candidate** for a human to approve | Never | **Permitted, and recorded** |

Restated for the whole system:

> **No contract language reaches an agreement without a named human's approval, and the origin of
> every clause is recorded on it permanently.**

### Origin is a first-class, permanent property

Every clause version carries an `origin`, alongside the existing `provenance`:

| Origin | Meaning |
|---|---|
| `legal_authored` | Composed by a lawyer |
| `ai_drafted` | Started as a Library Builder draft, then reviewed and approved |
| `vendor_derived` | Promoted from a concession (ADR-0009) |
| `external` | From supplier paper; agreement-scoped, never selectable for our drafts |

Origin is immutable, survives supersession, and is reportable. "How much of our library began as an
AI draft?" must be answerable at any moment, and so must "which executed contracts contain
AI-originated wording?".

### The Builder proposes; it never publishes

A drafted candidate lands in the **Review queue** as a proposal, with the prompt, the model and
version, the rules it was given, and the source material it was shown. It cannot become a clause
without the same confirmation modal and named approver that governs every other promotion
(ADR-0003). Approving a draft **unedited** is recorded distinctly from approving an edited one —
because the rate of unedited approvals is the number that tells you whether review has quietly
stopped happening.

### The public claim changes, and that is an owner decision

The current artifact footer reads `0 LLM-authored characters`. Once AI-drafted clauses can be
approved into the library, that sentence is only true of contracts drawn entirely from
`legal_authored` and `vendor_derived` wording.

The system will therefore compute and expose **both** numbers per contract:

- `LLM-authored characters: 0` — still true, and still asserted by test, for the assembly path.
- `Characters from AI-originated clauses: N` — approved by a named lawyer, but AI in origin.

Which of those goes on the document, and how the product is positioned, is the owner's call and is
not decided here. The engineering position is only that **both must be computable**, and that
quietly keeping the old footer while the second number is non-zero would be misleading.

## Consequences

**What it buys**

- The library can grow at the speed the business needs, instead of at the speed lawyers can
  compose from scratch. Coverage gaps have been the system's hard operational dependency since
  ADR-0001; this is the first thing that addresses them directly.
- Drafting *from the rules and the concession record* means proposals are grounded in what we
  actually negotiate, not in a model's general impression of contracts.
- The strongest audit answer is preserved intact: every word in every contract was approved by a
  named person on a date.

**What it costs**

- **The simplest version of the claim is gone.** "Zero LLM-authored characters" was falsifiable,
  countable and rare. Its replacement is more defensible but longer to explain, and a longer claim
  is a weaker one in a sales conversation.
- **Review quality becomes the binding control, and review quality decays.** A lawyer reading a
  fluent AI draft approves faster than one composing from nothing. The unedited-approval rate is
  instrumented for exactly this reason, and somebody has to actually watch it.
- **Plausible-but-wrong is the failure mode ADR-0001 was built to avoid**, and this reintroduces
  it at the library gate. The gate is now carrying weight it did not carry before.
- Prompt, model and rule versions become part of the provenance chain, so a model upgrade is a
  change-controlled event with legal consequences rather than an infrastructure detail.

## Related

- [ADR-0001](ADR-0001-model-never-authors-contract-language.md) — the invariant this amends
- [ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) — the gate a draft must pass
- [ADR-0009](ADR-0009-concession-is-not-supersession.md) — the other non-Legal origin
- [`NEGOTIATION-ARCHITECTURE.md`](../../NEGOTIATION-ARCHITECTURE.md) — the Builder and the rounds
