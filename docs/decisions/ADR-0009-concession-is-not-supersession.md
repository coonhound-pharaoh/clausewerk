# ADR-0009 — A concession is not a supersession

**Status:** Accepted · specified in [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../../CLAUSE-LIBRARY-ARCHITECTURE.md);
supersedes the open question at [`open-questions.md` §7](../open-questions.md)

## Context

The original architecture had one mechanism where it needed three.

When a vendor's redline is accepted, the Review queue mints a **new library clause** — derived
rationale, `Policy-DERIVED-*` citation, 2-year expiry, appended to the Ledger
([ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md)). That single act was doing the
work of three different things:

1. Recording what we agreed **on this deal**.
2. Deciding what our **standard position** should be from now on.
3. **Replacing** an existing approved clause.

These have different scopes, different approvers, and different consequences. Collapsing them means
one negotiation's compromise silently becomes every future deal's starting position — the library
drifts toward whatever vendors pushed hardest on, and nobody decided that.

Meanwhile "supersession links" appeared in the §5 data store with no mechanism behind them, and the
prototype carried only a `retiredReason` string like `'Replaced by SC-H-012'` — a note nothing can
traverse.

## Decision

**Separate the three acts.**

### Concession — deal-scoped, recorded, changes nothing

Accepting a vendor's ask creates a **concession record** bound to that agreement: the standard
position we opened with, what we settled on, how far down we went, the counterparty, the value, and
who approved it.

Accepted vendor text is stored **as a concession artifact and quarantined** — badged as vendor
language and never selectable by `resolveClauses`. The next deal still opens from the standard
position.

### Promotion — library-scoped, deliberate, gated

Turning a concession into approved language is a **separate act by a Legal admin**, through the
existing Review gate with its confirmation modal. It is never a side-effect of closing a
negotiation. The [negotiation-intelligence layer](../../CLAUSE-LIBRARY-ARCHITECTURE.md) proposes
candidates from concession patterns; a human decides.

### Supersession — replacement, versioned, auditable

Supersession **replaces** a clause with a newer version. Versions are immutable and retained
permanently, so an agreement executed under `@v1` still resolves `@v1`.

A supersession record carries predecessor, successor, **reason**, approving reviewer, decision and
effective dates, and whether the predecessor retires immediately or runs off. It emits
`clause_superseded` to the audit log.

Clause state becomes four-valued: `active` | `superseded` | `retired` | `expired`. `superseded`
means *replaced by something better*; `retired` means *withdrawn*. Today's single boolean cannot
distinguish them, and an auditor asking "why did this change?" needs different answers.

### Renewal surfaces superseded language

The LCMA drift report walks an agreement's pinned decision set at renewal and flags every clause
whose version has been superseded since signature, showing what changed and why. Renewal
re-resolves against the current library.

This is what makes version history commercially useful rather than merely tidy: it is how executed
agreements converge on current approved language without anyone rewriting a signed contract.

## Consequences

**What it buys**

- The library stops drifting toward vendor preference. What we concede under pressure and what we
  stand for are now separate records.
- Concession data becomes the most valuable asset in the system — a structured record of what we
  actually give away, by counterparty, sector, and value. It is what the strategic library is built
  from.
- "Why did this clause change?" has a real answer: a supersession record with a reason and a name.
- Old agreements can be told, at exactly the moment it is actionable, that they are carrying stale
  language.

**What it costs**

- **Three concepts where operators saw one.** "Accept the vendor's wording" now has a follow-on
  question — *does this change our position?* — that someone must actually answer, or the proposals
  queue silently grows.
- **A new deliberate act that nobody is scheduled to perform.** Promotion has no natural trigger;
  without a periodic library review it will not happen, and the concession record will accumulate
  insight nobody acts on.
- **Storage grows with history and never shrinks** — versions, concessions, and supersessions are
  all append-only.
- Run records must now pin ladder configuration as well as library snapshot, or the determinism
  guarantee breaks.
- This is a **behavioural change to the existing Review queue**, which currently mints clauses
  directly. The prototype still does the old thing; this is specification.

## Related

- [ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) — the mutation gate this refines
- [ADR-0006](ADR-0006-clause-expiry-is-computed-not-stored.md) — immutable versions, the precondition
- [ADR-0008](ADR-0008-governance-roles-and-recorded-overrides.md) — who may promote and supersede
- [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../../CLAUSE-LIBRARY-ARCHITECTURE.md) — ladders, concessions, intelligence
- [`LIFECYCLE-ARCHITECTURE.md`](../../LIFECYCLE-ARCHITECTURE.md) — the renewal drift report
