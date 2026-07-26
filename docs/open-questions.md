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
| 4 | The redline matcher's production form | **Decided** — keyword scorer is retained as the fallback |
| 5 | Who authors validation rules | **Decided** — attorneys, through a Legal gate |
| 6 | Ticket routing and assignment | **Deferred** — documented below, not now |
| 7 | Supersession | **Decided** — [ADR-0009](decisions/ADR-0009-concession-is-not-supersession.md) |
| 8 | Lifecycle management | **Architected** — [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md) |
| 9 | Clause library — concessions, ladders, negotiation intelligence | **Architected** — [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md) |
| 10 | Smaller gaps | Deferred |

*Numbering note: the original §9 "smaller gaps" moved to §10 when the clause library took the
number. Every other number is stable — they are referred to by number in conversation.*

---

## Owner decisions — all eight settled ✅

These were never architecture questions. They were choices only the business owner could make, and
the system deliberately did not make them. **All eight are now settled** — U1–U4 on 2026-07-26,
and U5–U8 the same day when the UI redesign raised four more. They are recorded as rows
in `cw.governance_setting` with the reasoning attached, not only here — a decision in a document
gets read once; a decision in the schema is met by whoever next touches the thing it governs.

| # | Decision | Settled as | Where it is enforced |
|---|---|---|---|
| `U1` | **Which positions a renewal opens from** | **From the agreement as executed**, with the drift report alongside. Counterparties expect last year's deal as the starting point. Restarting from current library standard stays fully built and reachable as an explicit, recorded choice | `cw.governance_setting`, `cw.open_renewal()`, `0011` |
| `U2` | **May a statement of work contradict its master** | **Yes — with the same approval a concession needs**, and one category at a time. Not never, and not freely | `cw.sow_hangs_off_a_master()`, `cw.sow_override*`, `0012` |
| `U3` | **What the database owner account maps to** | **No application role.** Governed acts run as a named role | `cw.app_role()`, `0001` |
| `U4` | **The unedited-approval-rate threshold** | **Deliberately unset.** Measured and shown from day one; nothing is blocked on it. Legal sets the number with counsel, against real data | `cw.review_quality`, `0008` |
| `U5` | **The Administrator's boundary** | **Steward, with sight.** The role runs the machine — accounts, grants, operational settings, watchers, checkpoints, health — and may **read** contract content, but can write none of it and decides nothing in any workflow | `cw_administrator` grants, `0013` |
| `U6` | **Whether granting a Legal role takes two names** | **Yes, for the two Legal roles only.** A grant of legal reviewer or legal admin confers nothing until a Legal admin countersigns. Viewer, requester and auditor the Administrator grants alone | `cw.effective_role`, `0013` |
| `U7` | **Who takes audit checkpoints** | **The Administrator, alone.** Moved from Legal admin, whose right is revoked rather than left unused | checkpoint grants, `0013` |
| `U8` | **The workspace model** | **Six workspaces, one per role**, each opening on what is waiting on you; deals become the requester's unit and the pipeline becomes per-deal; the blanket override button is retired | the shell, `WP-U07` |

### The costs of each, stated rather than buried

- **`U1`** — a concession made once can become permanent unless somebody reads the drift report. The
  report is therefore the control, and it must stay in front of whoever opens the renewal rather
  than sitting in a menu.
- **`U2`** — the master agreement stops being a complete statement of what the company is committed
  to, because a work order may lawfully depart from it. Two things contain that: the departure is
  granted per category, never as a blanket permission that later changes silently inherit; and an
  authorised departure is **still reported** in `cw.sow_conflict`. Approved is not the same as
  hidden.
- **`U3`** — administrative work is less convenient, by design. That inconvenience is what makes the
  test suite able to see permission faults at all.
- **`U4`** — the system measures the rate and shows it. What the number should be, and who watches
  it, belongs to the organisation using the system. If a customer wants to set rules around it, the
  measurement is already there to build on.
- **`U5`** — the person who administers accounts can read every deal, manifest, negotiation position
  and supplier redline in the system, and reads are not individually recorded because the system
  records acts, not glances. What contains it: the role can change none of it, holds no vote in any
  workflow, and cannot grant itself one. Describe this role as **content-visible and
  content-powerless** — never as content-blind, which it is not.
- **`U6`** — a wait every time Legal cover is needed in a hurry. That wait is the control working.
  It is kept short by putting the countersign queue in Legal's own workspace rather than only in the
  admin console, and by a daily nudge.
- **`U7`** — during the changeover there is a window in which Administrator accounts must exist
  before checkpoints can be taken at all, because Legal admin's right is revoked in the same
  migration that grants the Administrator's. The bootstrap ceremony creates the first Administrator,
  which is why it runs before anything else.
- **`U8`** — the nine-tab prototype demos well to everybody at once, and six role-scoped workspaces
  do not: showing the whole product now takes six sign-ins. Accepted deliberately, because a screen
  that shows what the viewer's connection could never fetch is a leak dressed as a feature.

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

## 4. The redline matcher's production form — decided ✅

**Decision: yes — the keyword scorer is retained as the deterministic fallback** when the matcher
is rebuilt on vector search.

Consequences to hold to:

- Negotiate keeps a working offline path, so the full-degradation claim in §5 stays true for the
  whole system rather than "everything except negotiation".
- The two implementations need **comparable score semantics**, or the 0.78 threshold means
  different things depending on which one ran. Either the vector matcher is calibrated onto the
  existing scale, or each carries its own threshold and the UI states which is in effect.
- The keyword rules become long-lived infrastructure rather than scaffolding, and need an owner —
  see [ADR-0005](decisions/ADR-0005-deterministic-fallbacks.md) on the cost of maintaining two
  implementations of the same judgement.

## 5. Who authors validation rules — decided ✅

**Decision: attorneys author and approve them, through a Legal gate — not developers through a code
review.**

*The original framing was wrong and worth correcting: it assumed the rules would be maintained as
code by engineers merging changes. The clauses in the prototype are placeholders, and in production
the people writing both clause text and conflict rules are lawyers.*

What this implies for the build:

- Conflict rules need an **authoring surface for non-developers**, not a source file. A rule is a
  structured statement over the decision set — "if a clause from category A is present and a clause
  from category B is present, and condition C holds, raise a finding of severity S."
- Rules go through the same gate as clause text: authored, reviewed, approved by a named human,
  versioned, effective-dated, and retirable — the Review queue pattern applied to a second content
  type ([ADR-0003](decisions/ADR-0003-review-queue-is-the-only-mutation-surface.md)).
- Rule changes are change-controlled, because a rule change silently alters which contracts are
  blocked. Every finding must cite the rule version that produced it.
- This makes the rule catalogue a **library asset**, governed like the clause library in
  [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md).

Still open: the expressiveness of the rule grammar. Too restrictive and lawyers cannot say what
they mean; too open and it becomes a programming language with no gate.

## 6. Ticket routing and assignment — deferred, documented

**Status: acknowledged as important, explicitly not being solved now.** Recorded so it is not
rediscovered later.

**The question: when a Review ticket is created, which specific lawyer gets it?**

Clause records carry a named `reviewer`. When a redline against `DP-H-014` escalates, does it route
to that clause's reviewer, to a shared queue, or round-robin? And what happens when the named
reviewer has left?

Why it will matter: the reviewer's name is part of the provenance chain a regulator walks
backwards, so routing determines whose name ends up on promoted language. §5 names a notification
service responsible for "Legal review assignment" and specifies nothing further.

Minimum viable answer when it is picked up: a shared queue with explicit claim, plus escalation to
the clause's named reviewer if unclaimed. That is enough to build against and can be refined once
there is real volume data.

## 7. Supersession — decided ✅

**Decision: supersession, concession, and promotion are three different acts.** Specified in
[ADR-0009](decisions/ADR-0009-concession-is-not-supersession.md) and
[`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md).

- **A Review ticket carrying changed clause text is not a supersession — it is negotiation**, and
  is recorded as a **concession** scoped to that one agreement. Vendor text is quarantined and
  never becomes selectable library language.
- **Supersession replaces a clause**, as a deliberate Legal act with a recorded reason and
  approver.
- **Old versions are retained in version history**, permanently, so an agreement executed under
  `@v1` still resolves `@v1`.
- **Executed agreements carrying superseded clauses surface at renewal**, via the LCMA drift
  report, which shows what changed and why.

Clause state becomes `active` | `superseded` | `retired` | `expired`, because "replaced by something
better" and "withdrawn" are different answers to an auditor's question.

## 8. Lifecycle management — architected ✅

Specified in [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md): the two-clock model,
obligation extraction by clause ID rather than by parsing prose, the operate/renew/amend/terminate
pipeline, wind-down and survival obligations, and the data model additions.

Its own open questions are listed in [LCMA §10](../LIFECYCLE-ARCHITECTURE.md) — chiefly the size of
the obligation-template authoring backlog, and whether the system should assert breach.

## 9. Clause library — architected ✅

Specified in [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md): the three
populations (standard positions, fallback ladders, concessions), version history and supersession,
and the negotiation-intelligence layer that turns concession data into proposed library changes.

The load-bearing idea is the **fallback ladder** — a pre-approved preferred position, acceptable
fallback, and floor per category. It moves Legal's work from **drafting** a fallback under deadline
to **choosing** among positions already approved. The attorney is still in the loop on every
concession (owner decision, 2026-07-25) — what disappears is the research and the drafting, not the
approval. See [CLA §3](../CLAUSE-LIBRARY-ARCHITECTURE.md).

Its own open questions are in [CLA §11](../CLAUSE-LIBRARY-ARCHITECTURE.md) — chiefly ladder depth,
how much weight to give old concessions, and how many similar concessions constitute a pattern
worth proposing on.

## 10. Smaller gaps — deferred

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
