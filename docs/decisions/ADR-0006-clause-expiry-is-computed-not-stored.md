# ADR-0006 — Clause validity is computed; clause versions are immutable

**Status:** Accepted · implemented in `enrichLedger` (`v3_metadata.jsx`)

## Context

Approved language goes stale. Regulations change, policies are revised, and a clause approved
against GDPR guidance in 2024 may be wrong in 2027. A library with no temporal model accumulates
confidently-wrong clauses — the worst failure mode available to a system whose entire pitch is that
its language is pre-approved.

The obvious fix — let Legal edit clauses in place — breaks something more important: a contract
executed under a clause's 2024 wording must still resolve to *that* wording in 2027, or the audit
trail is fiction.

So two requirements pull against each other: language must be able to go stale, and language must
never change under an executed contract.

## Decision

Separate them.

**Validity is computed, not stored.** `enrichLedger` derives `active` at read time:

```js
active: (meta.active !== false && c.active !== false) && !isExpired
```

with `expires` defaulting to `created` + 2 years, plus derived `daysToExpiry`, `expiresSoon`
(≤ 90 days), and `expired`. A clause leaves the selectable pool on its expiry date with **no human
action and no write**.

**Versions are immutable.** §5 requires clause records to be versioned and never overwritten, with
the library version pinned into every run record so resolution is reproducible forever.

`SC-RETIRED-01` exists in the seed data specifically to demonstrate the kill switch.

## Consequences

**What it buys**

- Staleness is the default outcome, not a maintenance task. Nobody has to remember to retire a
  clause; someone has to remember to *renew* one. The failure mode of neglect is a coverage gap
  (loud, reported) rather than a stale clause in a signed contract (silent).
- The 90-day `expiresSoon` window turns expiry into a scheduled review rather than an outage.
- Manual retirement and expiry converge on one flag, so consumers check `active` and never reason
  about *why*.
- Reproducibility survives library evolution — old runs resolve old versions.

**What it costs**

- **Expiry is invisible until it bites.** A clause can leave the pool between two runs of the same
  engagement with no event, no notification, and no diff. The system reports the resulting coverage
  gap but not the transition that caused it.
- **The library only grows.** Immutable versions plus promotion-only mutation
  ([ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md)) means storage and retrieval
  scale with total history, not with the active set. Every query needs a validity filter, and the
  vector index must exclude inactive versions or the matcher will suggest retired language.
- **Every read pays for enrichment.** `enrichLedger` recomputes the whole overlay on every ledger
  change. Fine at ~30 clauses, not at ~500 with a vector index attached.
- Correctness now depends on a clock, which makes it environment-dependent and easy to get wrong.
  The prototype got it wrong twice: it pinned "today" to a hard-coded date, and it fabricated a
  creation date for clauses that had none, birth-expiring 54 of them. Both are fixed; both were
  invisible until something else forced them into the light. See
  [findings #6 and #8](../spec-vs-implementation.md).
- A clause with no recorded approval date cannot be governed by this mechanism at all. It never
  expires and never warns — visible now as `provenanceGap`, but only closable by Legal recording
  the dates.

## Related

- [ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) — how clauses enter
- [`diagrams.md §5`](../diagrams.md) — the clause lifecycle
- [`LIFECYCLE-ARCHITECTURE.md §2`](../../LIFECYCLE-ARCHITECTURE.md) — the two-clock model: clause
  validity vs. executed agreement term, and what happens when a clause expires mid-negotiation
- [`spec-vs-implementation §1`](../spec-vs-implementation.md) — the manifest pass now checks `active`
