# ADR-0002 — The manifest is the sole inference→determinism crossing

**Status:** Accepted · **amended by [ADR-0010](ADR-0010-ai-drafted-clause-candidates.md)** ·
implemented in `engine.jsx`

> **Amendment (2026-07-25).** The word **sole** in this record's title is no longer accurate. When
> this was written the manifest was the only place model output crossed into the deterministic
> side. ADR-0010 opened others: Clause Library Builder drafts, supplier-paper atomisation, and the
> review queue's AI-candidate path. Model prose can now reach the deterministic side through any of
> them.
>
> What has **not** changed is the part that matters: every one of those crossings terminates at a
> named human's approval before any wording can reach an agreement, and the manifest remains the
> sole crossing on the *assembly* path. The correct reading of this record today is "the manifest is
> the trust boundary for assembly", not "for the system".

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

  > **No longer true as written (amended by ADR-0010).** There are now several crossings, not one,
  > so this audit costs more than reading a single filter. The question that *can* still be
  > answered in one place is the narrower one: "can model output reach a document **without a named
  > human approving it?**" — and the answer remains no. Auditing that means checking the approval
  > gate rather than the manifest filter.
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
- [`spec-vs-implementation §5`](../spec-vs-implementation.md) — the filter now fails closed when `window.CATEGORIES` is empty
- [ADR-0008](ADR-0008-governance-roles-and-recorded-overrides.md) — auto-approval and gate overrides, the other places a human could be bypassed
