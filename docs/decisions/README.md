# Architecture Decision Records

The load-bearing choices Clausewerk is built on, and — more usefully — what each one costs.

These are **retrospective**: the decisions were made during the prototype and are recorded here
from [`ARCHITECTURE.md`](../../ARCHITECTURE.md) and the ingested v3 source. They document reasoning
that already shaped the system rather than proposing anything new. Status is `Accepted` throughout
because the prototype implements them.

Most "why can't I just…" questions are answered by the **Consequences** section of one of these.
That is the section to read.

| ADR | Decision | The cost |
|---|---|---|
| [0001](ADR-0001-model-never-authors-contract-language.md) | The model never authors contract language | Coverage gaps become hard failures instead of soft prose |
| [0002](ADR-0002-manifest-is-the-trust-boundary.md) | The manifest is the sole inference→determinism crossing | Nuance not expressible as a category triple is lost |
| [0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) | Only the Review queue can add clauses | Legal is a throughput bottleneck, deliberately |
| [0004](ADR-0004-suppressed-candidates-are-retained.md) | Losing candidates are retained, not discarded | Every decision record carries its rejects forever |
| [0005](ADR-0005-deterministic-fallbacks.md) | Every inference call has a deterministic fallback | Two implementations of every judgement, kept in step |
| [0006](ADR-0006-clause-expiry-is-computed-not-stored.md) | Clause validity is computed, versions immutable | The library only grows; nothing is ever edited in place |
| [0007](ADR-0007-one-redline-per-changed-paragraph.md) | One redline per changed paragraph, adjudicated independently | Cross-paragraph negotiation packages become invisible |
| [0008](ADR-0008-governance-roles-and-recorded-overrides.md) | Five roles; override is a socialised request; auto-approval is recorded | Latency on exactly the deals already under deadline pressure |
| [0009](ADR-0009-concession-is-not-supersession.md) | Concession, promotion, and supersession are three separate acts | Three concepts where operators saw one; promotion has no natural trigger |
| [0010](ADR-0010-ai-drafted-clause-candidates.md) | AI may draft candidate clauses; only a human publishes them | The simplest form of the headline claim is gone; review quality becomes the binding control |

## Format

Each record: **Status**, **Context** (the forces), **Decision**, **Consequences** (what it buys,
what it costs), **Related**. Kept short on purpose — the reasoning matters, the ceremony doesn't.
