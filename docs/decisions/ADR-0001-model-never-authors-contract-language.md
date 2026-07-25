# ADR-0001 — The model never authors contract language

**Status:** Accepted · implemented throughout the v3 prototype

## Context

An LLM that drafts contract clauses produces plausible legal prose. Plausible is the problem: the
failure mode is not gibberish a reviewer catches, but a competent-looking indemnity with the
liability carve-out subtly inverted. Reviewing generated contract language means reading every word
adversarially, which costs more than drafting it did.

Two further forces:

- **Regulatory.** A reviewer or regulator asking "who approved this sentence?" needs an answer that
  is a person and a date, not a model version and a temperature.
- **Commercial.** The claim that sells the system is falsifiable and countable:
  `0 LLM-authored characters`.

## Decision

The model **reads, classifies, and points**. It never writes, paraphrases, summarises, or
"improves" clause text.

A deterministic executor fetches immutable text by ID (`fetch_immutable_text(id)`) and assembles the
document. Clause text is either seeded by Legal or promoted through the Review queue by a named
human — there is no third source.

The model's outputs are confined to: a question (Intake), a `{category, severity, justification}`
triple (Manifest), and a clause **ID plus a score** (Negotiate).

## Consequences

**What it buys**

- Legal reviews *decisions*, not prose. Verifying "was `DP-H-014` the right choice here?" is
  bounded work; verifying "is this paragraph safe?" is not.
- Every sentence traces to a policy citation, a reviewer, and an approval date.
- The system degrades to a still-valid contract when the model is unavailable — the model was never
  the thing producing the text ([ADR-0005](ADR-0005-deterministic-fallbacks.md)).
- Model upgrades cannot change contract language. They can only change which approved clause gets
  selected, which is observable and reviewable.

**What it costs**

- **Coverage gaps are hard failures.** When no clause exists for a category, the system emits
  `selected: null` and flags it. It cannot write the missing clause, so the Ledger's completeness
  becomes a hard operational dependency — hence the coverage-gap report in the Ledger panel.
- **Fidelity is bounded by the library.** A risk the library expresses only approximately gets an
  approximate clause. There is no "close enough, adjust the wording" path by construction.
- **Bespoke deals fit poorly.** Genuinely novel commercial terms must go through the Review queue
  before they can appear in any contract, which is slow — deliberately
  ([ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md)).
- Every new feature must be checked against this rule. Anything that would let model output reach a
  document is wrong regardless of how well it works.

## Related

- [ADR-0002](ADR-0002-manifest-is-the-trust-boundary.md) — where the rule is enforced structurally
- [ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) — the only way new language enters
- [`spec-vs-implementation §5`](../spec-vs-implementation.md) — the enforcement point now fails closed
