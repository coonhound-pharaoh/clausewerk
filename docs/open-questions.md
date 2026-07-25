# Open questions

What the architecture does **not** settle, and what has since been decided.

Distinct from [`spec-vs-implementation.md`](spec-vs-implementation.md), which tracked places the
code disagreed with the spec (all now resolved). These are places the *spec itself* was silent,
underspecified, or in tension with its own premises.

| # | Question | Status |
|---|---|---|
| 1 | Auto-approve vs. the audit story | **Decided** — [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| 2 | Who may override the validation gate | **Decided** — [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| 3 | Clause expiring mid-flight | **Decided** — [LCMA §2](../LIFECYCLE-ARCHITECTURE.md), warnings implemented |
| 4 | The redline matcher's production form | Open — restated below |
| 5 | Who authors validation rules | Open — restated below |
| 6 | Ticket routing and assignment | Open — restated below |
| 7 | Supersession | Open — restated below |
| 8 | Lifecycle management | **Architected** — [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md) |
| 9 | Smaller gaps | Deferred |

---

## 1. Auto-approve vs. the audit story — decided ✅

**Decision: auto-approval must be auditable.** Every approval now records whether the auto-approve
hint was showing, the score, and the threshold, making the rate of nudged approvals measurable. The
event type `auto_approve` with `actor: 'controller'` is reserved for genuine machine approval, so it
can never be logged as a human act.

Worth noting, because it changes the shape of the original concern: in the v3 prototype
`autoApprove` **never actually approves**. It renders an advisory "confirm anyway" hint and a human
still clicks. The gap was that the hint's influence was invisible, not that an action was
unattributed.

See [ADR-0008 §4](decisions/ADR-0008-governance-roles-and-recorded-overrides.md).

## 2. Who may override the validation gate — decided ✅

**Decision: a Requester may override, but not unilaterally.** Override becomes a *request* that is
socialised to stakeholders and approved by a Legal reviewer, recorded per-finding rather than as a
blanket acknowledgement. A **Viewer** role is added so a contract can be shown to someone for
socialisation without granting them the ability to change it.

See [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) for the five-role
model and the request state machine.

## 3. Clause expiring mid-flight — decided ✅

**Decision: expiry and obsolescence produce warnings throughout, and block at signature.**

- The clause clock and the agreement clock are formally separated — [LCMA §2](../LIFECYCLE-ARCHITECTURE.md).
- Before execution, the live clause clock governs: warnings at **every negotiation round**,
  blocking at **signature**.
- At execution the library snapshot is pinned, and the clause clock becomes advisory — an executed
  contract is never invalidated by later library changes.
- Renewal releases the pin and re-resolves against the current library, which is how executed
  agreements converge on current language.

Implemented in the prototype: `expiryWarnings()` in `engine.jsx`, `<ExpiryNotice>` rendered in the
Negotiate inbox and the Dossier. See [LCMA §7](../LIFECYCLE-ARCHITECTURE.md).

---

## 4. The redline matcher's production form

*Restated — the original phrasing buried the question.*

**The question: when the redline matcher is rebuilt on vector search, does the current keyword
scorer survive as its offline fallback — yes or no?**

Why it matters. Today the matcher scores clauses with fixed additive keyword weights and a 0.78
threshold. §5 says production replaces this with embeddings and k-NN retrieval. Every other
inference call in the system has a deterministic fallback so the pipeline runs with the model
offline ([ADR-0005](decisions/ADR-0005-deterministic-fallbacks.md)).

If the keyword scorer is deleted when vectors arrive, Negotiate becomes the **only** part of
Clausewerk that stops working when the model is unavailable, and the claim of a full degradation
path narrows to "everything except negotiation."

Two sub-questions follow: are scores from the two implementations comparable (does 0.78 still mean
the same thing), and does the vector matcher inherit the threshold semantics or need its own?

## 5. Who authors validation rules

*Restated.*

**The question: clause text can only enter the system through a named human in the Review queue.
Validation rules are code and have no equivalent gate. Should they?**

Why it matters. There are four conflict rules today, marked "Currently" in the spec, over a
48-category library — the combinatorial surface is much larger. New rules will be written. But a
validation rule is a *legal* judgement expressed as code: "an uncapped indemnity contradicts a
liability cap" is exactly the kind of assertion the Review queue exists to make a named lawyer
approve.

Today it would be approved by whoever merges the pull request. A bad rule is a false gate that
blocks good contracts; a missing rule is a shipped contradiction. §5 says the catalogue is
"versioned", which is the entire specification of its lifecycle.

## 6. Ticket routing and assignment

*Restated.*

**The question: when a Review ticket is created, which specific lawyer gets it?**

Why it matters. Clause records carry a named `reviewer`. When a redline against `DP-H-014`
escalates, does it route to that clause's reviewer, to a shared queue, or round-robin? And what
happens when the named reviewer has left the company?

This is not just workload distribution. The reviewer name is part of the provenance chain a
regulator walks backwards, so routing determines whose name ends up on promoted language. §5 names
a notification service responsible for "Legal review assignment" and specifies nothing further.

## 7. Supersession

*Restated — and the honest answer is that nothing in the software implements it.*

**The question: when Legal promotes a clause that replaces an older one, what should happen to the
old clause?**

Where it stands. §5 lists "supersession links" among the clause registry's stored fields, so the
spec assumes the concept exists. Nothing describes the mechanism, and the prototype has no
implementation — only a `retiredReason` string carrying human-readable text like
`'Replaced by SC-H-012'`. That is a note, not a link: nothing can traverse it, and nothing enforces
that the named clause exists.

The decisions needed:

- Does verifying a Review ticket derived from clause X automatically supersede X?
- Does superseding auto-retire the predecessor, or leave it active until Legal retires it?
- How does supersession coexist with "versions are never overwritten"
  ([ADR-0006](decisions/ADR-0006-clause-expiry-is-computed-not-stored.md))? Presumably a supersession
  link is a pointer *between* immutable versions rather than a mutation of either.
- Do executed agreements referencing a superseded clause surface that at renewal? (The LCMA drift
  report is the natural place, and would make supersession genuinely useful rather than decorative.)

## 8. Lifecycle management — architected ✅

Specified in [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md): the two-clock model,
obligation extraction by clause ID rather than by parsing prose, the operate/renew/amend/terminate
pipeline, wind-down and survival obligations, and the data model additions.

Its own open questions are listed in [LCMA §10](../LIFECYCLE-ARCHITECTURE.md) — chiefly the size of
the obligation-template authoring backlog, and whether the system should assert breach.

## 9. Smaller gaps — deferred

| Gap | Where |
|---|---|
| The 31 fallback interview probes are counted but never enumerated | §2.1 |
| The thirteen risk dimensions are named but not mapped to the 48 categories | §2.1 vs §2.3 |
| `density`, `showTrace` semantics are named, not defined | §6 |
| Prompt versioning is required; no versioning scheme is given | §5 |
| "Tamper-evident (hash-chained)" audit log — no chaining scheme specified | §5 |
| Whether `justification` is retained after execution | §2.2, §2.6 |
| 54 seeded clauses carry no approval date, so they can never be temporally governed | [spec-vs-implementation §8](spec-vs-implementation.md) |

The last two are worth decisions rather than defaults. The justification is the reviewer's evidence
and belongs in the audit trail — but it is also the only model-authored prose anywhere near the
artifact, and the system's headline claim is a character count of exactly that.
