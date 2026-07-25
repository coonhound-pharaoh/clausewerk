# ADR-0005 — Every inference call has a deterministic fallback

**Status:** Accepted · implemented for all three inference roles

## Context

The system uses a model in three places: interviewer, classifier, redline matcher. Each is a
network call to a third-party service that can be slow, rate-limited, down, or — over a long enough
horizon — retired.

A contract assembly system that stops working when a vendor's API has an incident is not a system of
record. And there is a sharper version of the problem: if the LLM is *load-bearing*, then the claim
that it never authors contract language is hard to believe, because it is evidently doing the work.

## Decision

Every inference call has a deterministic substitute, and the pipeline runs to a valid contract
without any model at all.

| Role | Fallback | Marked as |
|---|---|---|
| Interviewer | 31-probe ordered gap checklist, regex-detected against the transcript | `· local` |
| Classifier | ~100 regex `KEYWORD_RULES` + 8 always-on `BASELINE_CATEGORIES` | `source: 'fallback'` |
| Redline matcher | Escalate to Legal | Review ticket, reason `no-ai-match` |

Fallbacks are **visibly marked**, never silent. The manifest carries its own provenance in
`source`, so a downstream reader always knows which classifier produced it.

## Consequences

**What it buys**

- Availability is decoupled from the model vendor. Intake → Manifest → Forge → Validate → Dossier →
  `.docx` all work offline.
- It proves the architectural claim operationally: the deterministic tier is genuinely independent,
  and the model is genuinely advisory.
- The matcher's fallback is *escalation rather than degradation* — the correct choice, since a worse
  automatic match is more dangerous than no match.
- Fallback quality is a useful lower bound. Anything the keyword classifier catches is a risk the
  system will never miss, regardless of model behaviour.

**What it costs**

- **Two implementations of every judgement, which must be kept in step.** Adding a category means
  updating both the classifier prompt and the keyword rules; forget the second and the fallback
  silently under-classifies. The 48-category enum and the ~100 keyword rules have no mechanism
  binding them together.
- **Quality asymmetry is real and mostly unmeasured.** A regex checklist interview is worse than a
  competent attorney interview. Both produce a manifest; only `source` distinguishes them, and
  nothing downstream treats a fallback manifest differently.
- The fallback classifier keeps only the first matched reason per category
  (`justification: v.reasons[0]`), so a category triggered by several distinct signals presents as
  though triggered by one.
- Maintaining ~100 regexes is unglamorous work with no natural owner, and it decays quietly.

## Related

- [ADR-0001](ADR-0001-model-never-authors-contract-language.md) — why the model can be optional
- [`diagrams.md §6`](../diagrams.md) — the degradation path
- [`open-questions §4`](../open-questions.md) — whether the matcher keeps a deterministic fallback in production
