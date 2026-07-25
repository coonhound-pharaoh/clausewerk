# ADR-0004 — Losing candidates are retained, not discarded

**Status:** Accepted · implemented in `resolveClauses` (`engine.jsx`)

## Context

Resolution picks one clause per risk. The obvious implementation returns the winner and forgets the
rest — the losers are, after all, not in the contract.

But the question an auditor asks is rarely "why is this clause here?" It is **"why isn't the
stricter one here?"** A decision record showing only the winner cannot answer that. It cannot
distinguish "the High variant was considered and the risk was only Standard" from "the High variant
didn't exist."

## Decision

Every decision retains the full candidate set:

```js
{ risk, selected, suppressed: [...], reason }
```

`suppressed[]` holds every in-category candidate that was not selected. The `reason` string records
*why* the winner won, in one of four fixed forms — matched, fell back, baseline, or nothing
available.

The Forge UI renders suppression as a visible act (`~ suppress {id}`, a strike-out animation)
rather than a silent filter.

## Consequences

**What it buys**

- The audit trail answers counterfactuals. "Why not the High variant?" is answerable from the
  decision record alone, without re-running resolution against a reconstructed library.
- Fallbacks are legible. `No High variant; fell back to Standard` names a **library coverage gap
  discovered at assembly time** — different information from the coverage-gap report, which is
  computed statically and doesn't know what was actually needed.
- `selected: null` is a first-class outcome. The system says "no clause available" rather than
  quietly substituting the nearest thing — the resolution-layer expression of
  [ADR-0001](ADR-0001-model-never-authors-contract-language.md).

**What it costs**

- **Decision records carry the whole candidate set forever.** With a ~500-clause library and many
  variants per category, decision sets are much larger than the contracts they produce. §5's run
  store inherits that; storing clause IDs rather than clause copies is the obvious mitigation and
  is not currently specified.
- **Suppression is not the same as rejection.** A suppressed clause was outranked by a fixed rule,
  not judged unsuitable. Presenting suppression lists to reviewers risks implying more deliberation
  than occurred — the rule is "exact severity match, else Standard", nothing more.
- The record grows with library size rather than with contract complexity, so adding clause variants
  silently inflates every future decision set.

## Related

- [ADR-0001](ADR-0001-model-never-authors-contract-language.md) — why `null` beats a guess
- [`data-model.md`](../data-model.md) — the Decision record and its four `reason` strings
- [`diagrams.md §2`](../diagrams.md) — resolution flow
