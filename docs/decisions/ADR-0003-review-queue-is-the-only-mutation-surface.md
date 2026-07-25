# ADR-0003 — The Review queue is the only mutation surface

**Status:** Accepted · implemented in `negotiate.jsx` + the Ledger

## Context

A clause library that never grows is useless — vendors ask for things the library doesn't cover, and
those asks are often reasonable. So new language must be able to enter.

But every entry point for new language is also an entry point for **unapproved** language. If
vendor text can flow into the library through the negotiation loop, then a vendor effectively edits
the buyer's clause library by redlining aggressively, and
[ADR-0001](ADR-0001-model-never-authors-contract-language.md) is defeated from the outside instead
of the inside.

## Decision

Exactly **one** path adds language to the Ledger: a Review ticket verified by a named human.

- Redline **approve** inserts existing immutable text — no ticket, no new language.
- Redline **edit** and **escalate** create tickets. So does a controller no-match.
- **Verify** requires a confirmation modal stating exactly what will be promoted, then mints a
  clause with derived rationale, a `Policy-DERIVED-*` citation, today's date, a 2-year expiry, and
  the reviewer's name.
- **Reject** returns the ticket to the buyer with the rationale visible.

Tickets carry full provenance: original redline segments, vendor comment, the AI candidate with its
score and alternates, and a reason code (`no-ai-match` / `human-escalated` / `human-edit`).

Proposed text is pre-loaded from the **vendor's accepted language** (keep + ins, del dropped), with
a toggle to load the AI candidate instead, and the source is badged throughout:
`VENDOR LANGUAGE` / `AI CANDIDATE` / `EDITED BY LEGAL`.

## Consequences

**What it buys**

- The library grows from real negotiation pressure rather than speculation — what vendors actually
  push back on is what gets added.
- Every clause has a named human who put it there, which is what makes the provenance chain
  walkable end to end.
- Defaulting the editor to *vendor* language rather than the AI candidate is deliberate: it keeps
  the reviewer's attention on what was actually asked for, and makes the AI candidate an
  alternative to reach for rather than the baseline to skim past.

**What it costs**

- **Legal is a throughput bottleneck, by design.** Every unmatched redline waits on a human. At
  volume this is the binding constraint on the whole system, and no amount of engineering elsewhere
  relieves it.
- **The loop is slow where deals are fast.** A negotiation blocked on a review ticket is a
  commercial cost the system imposes on purpose.
- **Library sprawl.** Promotion is easier than curation, and nothing in the design prunes. Coverage
  gaps are reported; near-duplicate clauses are not.
- Promotion mints `Policy-DERIVED-*` rather than a real policy citation, so promoted clauses carry
  structurally weaker provenance than seeded ones — a distinction that is visible but not acted on.

## Related

- [ADR-0001](ADR-0001-model-never-authors-contract-language.md) — the invariant this protects
- [ADR-0006](ADR-0006-clause-expiry-is-computed-not-stored.md) — what happens to clauses after promotion
- [`open-questions §6`](../open-questions.md) — ticket routing is unspecified
- [`open-questions §7`](../open-questions.md) — supersession is named but not mechanised
