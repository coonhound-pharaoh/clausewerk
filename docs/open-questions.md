# Open questions

What the architecture does **not** settle. Read this before designing anything that depends on an
answer it doesn't give.

Distinct from [`spec-vs-implementation.md`](spec-vs-implementation.md), which records places the
code and the spec disagree. These are places the *spec itself* is silent, underspecified, or in
tension with its own premises.

---

## 1. `autoApprove` is in tension with the audit story

**The tension.** §6 lists a runtime tweak `autoApprove (≥0.90)`. §2.7 states there are "three human
outcomes" for a redline — approve, edit, escalate — and that approvals insert immutable text.

If a ≥0.90 match auto-approves, a clause substitution happens in a negotiated contract with **no
human act at all**. The invariant survives (the inserted text is still pre-approved, still fetched
by ID), so nothing unapproved reaches the document. But the *second* pillar — "Legal reviews
decisions, not prose" — quietly loses its reviewer for that decision.

**Unsettled:** whether auto-approved substitutions are (a) permitted at all in production,
(b) permitted but flagged for retrospective sampling, or (c) permitted only below some contract
value or above some clause-criticality threshold. The audit log records `human_approve`; there is
no event type for a machine approval, which suggests the log was designed before this tweak
existed.

## 2. Who may override the validation gate

§2.5: the gate "can be explicitly overridden by a human, and the override is a recorded act."

§5's RBAC model names four roles — Requester, Legal reviewer, Legal admin, Auditor — and assigns
exactly two permissions: only Legal admin can activate clauses, only Auditor-and-above can read the
full log. **Override authority is never assigned.**

Taken literally, a Requester could override a High-severity finding on their own contract. That is
almost certainly not intended.

**Also unsettled:** whether override is per-finding or blanket. The prototype implements one
acknowledgement clearing all findings at once
([finding #3](spec-vs-implementation.md#3-the-validation-gate-blocks-on-any-finding-not-only-high-severity)).
A blanket override records *that* someone proceeded, not *which* contradictions they accepted —
weaker than the audit story elsewhere in the system.

## 3. What happens when a clause expires mid-flight

§5 requires that resolution be reproducible forever, pinning a library snapshot into every run
record, and that clause versions are never overwritten.

Neither §2.3 nor §5 says what happens when a clause **expires between assembly and execution** —
a realistic window, since negotiation rounds take weeks.

Candidate readings, all defensible, all different:

- The pinned snapshot governs; the contract executes on the clause as resolved. *(Favours
  reproducibility.)*
- Expiry invalidates the pending contract and forces re-resolution. *(Favours currency.)*
- Expiry raises a warning at signature without blocking. *(Favours getting deals done.)*

This needs an answer before the run store is designed, because it determines whether run records
hold snapshot IDs or live references.

## 4. The redline matcher's production form

§2.7 describes matching as "inference-shaped, deterministic in the prototype" — additive keyword
scoring with fixed weights. §4 lists it as inference use #3. §5 specifies a vector index with
per-clause embeddings and k-NN retrieval.

So the target is clear and the prototype is a stand-in. What is unspecified is the **contract
between them**: whether the production matcher keeps the 0.78 threshold semantics, whether scores
remain comparable across the two implementations, and whether the deterministic scorer survives as
the offline fallback (§4 says the failure mode is "escalate to Legal", which implies it does not).

If the keyword scorer is *not* retained, the matcher becomes the one inference call with no
deterministic substitute, and the §5 claim of a full degradation path weakens to "everything except
Negotiate".

## 5. The conflict rule catalogue is a stub

§2.5 lists four rules and marks the table "Currently". Four pairwise rules over a 48-category
library is thin — the combinatorial surface is large and the four chosen are illustrative
(governing law vs. dispute seat, liability carve-outs, SLA vs. termination, regulated data vs.
insurance).

**Unsettled:** who authors new rules and through what gate. Clause text has a rigorous promotion
path (Review queue, named human, confirmation modal). Validation rules are *code* and have none
described. A bad rule is a false gate; a missing rule is a shipped contradiction. §5 says the rule
catalogue is "versioned" — that is the entire specification of its lifecycle.

## 6. Ticket routing and assignment

§5 names a notification service responsible for "Legal review assignment", and §2.8 shows Legal
adjudicating tickets. Nothing specifies **which** reviewer gets a given ticket.

Clause records carry a named `reviewer`. Whether a ticket derived from clause `DP-H-014` routes to
that clause's reviewer, to a queue, or round-robin is undefined — as is what happens when the named
reviewer has left. Matters more than it looks: the reviewer name is part of the provenance chain a
regulator walks backwards.

## 7. Supersession is named but not mechanised

§5's clause registry includes "supersession links" among the stored fields. No section describes
how a clause is superseded: whether promoting a Review ticket supersedes the clause it was derived
from, whether superseding auto-retires the predecessor, or how supersession interacts with the
"never overwritten" rule.

The prototype's `retiredReason` field carries strings like `'Replaced by SC-H-012'` — a
human-readable pointer, not a link. That is a reasonable prototype shortcut and an unreasonable
production schema.

## 8. Lifecycle management is out of scope

The current `ARCHITECTURE.md` deliberately excludes the lifecycle-management system — post-execution
obligations, renewals, expiry notices, amendments against an executed agreement.

Its absence is visible in the design: the pipeline terminates at `contract.docx` and the Outbox, and
the Ledger's temporal model (`created`/`expires`/`active`) governs *clause* validity, with nothing
modelling *agreement* validity. Those are different clocks and will need different records.

Two hooks already exist and are worth not painting over:

- The Records Retention clause the system issues implies a 7-year audit horizon that §5 already
  matches.
- `assembleDossier` stamps an execution date but nothing consumes it.

## 9. Smaller gaps

| Gap | Where |
|---|---|
| The 31 fallback interview probes are counted but never enumerated | §2.1 |
| The thirteen risk dimensions are named but not mapped to the 48 categories | §2.1 vs §2.3 |
| `strictMode`, `density`, `showTrace` semantics are named, not defined | §6 |
| Prompt versioning is required; no versioning scheme is given | §5 |
| "Tamper-evident (hash-chained)" audit log — no chaining scheme specified | §5 |
| Whether `justification` is retained after execution, given it is model-authored text living beside a contract | §2.2, §2.6 |

That last one is worth a decision rather than a default. The justification is the reviewer's
evidence and belongs in the audit trail — but it is also the only model-authored prose anywhere
near the artifact, and the system's headline claim is a character count of exactly that.
