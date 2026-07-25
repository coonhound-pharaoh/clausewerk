# ADR-0002 — The manifest is the sole inference→determinism crossing

**Status:** Accepted · implemented in `engine.jsx`

## Context

[ADR-0001](ADR-0001-model-never-authors-contract-language.md) says the model must not author
contract language. A rule that lives only in a prompt is not enforced — prompts drift, models
change, and "don't write clause text" is exactly the instruction a helpful model bends when it
thinks it is helping.

The rule needs a **structural** enforcement point: one place, auditable, where model output either
conforms or is destroyed.

## Decision

All inference output crosses into the deterministic tier through **one** artifact, the manifest:

```js
{ vendor, value, source, risks: [{ category, severity, justification }] }
```

Generation is inference; **validation is deterministic**. The classifier's raw output is
code-fence-stripped, JSON-parsed, then filtered:

- `category` not in the canonical `CATEGORIES` enum → the risk is **dropped**
- `severity` coerced — anything not exactly `'High'` becomes `'Standard'`

Nothing downstream of this point ever receives free text produced by a model. `justification` is
carried across as *evidence shown to reviewers* and never reaches a contract document.

## Consequences

**What it buys**

- A hallucinated category cannot survive the boundary — it is not rejected with a warning, it
  ceases to exist.
- The attack surface is one function. Auditing "can model output reach a document?" means reading
  one filter, not the whole system.
- The manifest is human-editable before Forge, so the correction point sits exactly where a human
  can still act.
- Downstream code needs no defensive handling of model weirdness, which is why `resolveClauses` can
  be a pure function with no validation in it.

**What it costs**

- **Expressiveness is capped at the triple.** A risk the categories don't carve — an unusual
  liability structure, a bespoke acceptance regime — is either forced into the nearest category or
  lost. The interview can surface nuance the manifest cannot represent.
- **Silent data loss.** Dropping is deliberate but invisible: a dropped risk leaves no trace in the
  manifest. A model consistently proposing a category that doesn't exist is a signal about library
  coverage, and it is currently discarded rather than logged.
- The enum becomes a schema-migration problem. Adding a category means the classifier prompt, the
  keyword rules, the short-code space, and the coverage-gap report all move together.
- Severity coercion means a model emitting `'Critical'` silently gets `'Standard'` — the *lowest*
  setting, not the highest. Fail-safe would arguably be the other direction.

## Related

- [ADR-0001](ADR-0001-model-never-authors-contract-language.md) — the rule this enforces
- [`data-model.md`](../data-model.md) — the manifest schema
- [`spec-vs-implementation §5`](../spec-vs-implementation.md#5-the-classifiers-category-filter-fails-open) — the filter fails open when `window.CATEGORIES` is empty
- [`open-questions §1`](../open-questions.md) — `autoApprove` bypasses the human at a different boundary
