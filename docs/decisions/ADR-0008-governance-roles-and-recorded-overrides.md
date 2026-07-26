# ADR-0008 — Governance: roles, socialised overrides, and auditable auto-approval

**Status:** Accepted · partially implemented.

- **The five-role model is built** in the backend (`0001_foundation.sql`) as real database roles,
  with row-level security and table privileges as two independent lines of defence. Since
  2026-07-26 the acting role is derived from the **authenticated connection**, not from a value the
  client can set — so a Legal reviewer cannot claim to be a Legal admin. Tests exercise each
  protection **as the real role on the write path**, because running them as the database owner
  bypasses every policy and proves nothing.
- **Every act carries an actor and a role** in the hash-chained audit log, and the role is part of
  the hash — rewriting who held the authority is detectable.
- **The override-request workflow is still specified, not built.** So is the socialisation step.
- **Known residual:** the *person's* name is still self-asserted, because the five roles are shared
  service accounts. The scheme assumes one connection means one person and is incompatible with
  transaction-mode connection pooling. See `ARCHITECTURE.md` §5.

Supersedes the unanswered questions at
[`open-questions.md` §1 and §2](../open-questions.md).

## Context

Two gaps in the original architecture, both about the same thing — **who did what, and can you
prove it**.

**Override authority was unassigned.** §2.5 says a validation gate "can be explicitly overridden by
a human, and the override is a recorded act", but §5's RBAC model assigns only two permissions
(Legal admin activates clauses; Auditor-and-above reads the full log). Read literally, a Requester
could override a High-severity finding on their own contract, unilaterally and instantly.

The business reality is that Requesters legitimately need to proceed over a flagged finding — they
own the commercial deadline and often the risk. Forbidding it drives the work outside the system,
which is worse than permitting it with a record. But a unilateral, instant override converts a
compliance gate into a speed bump.

**Auto-approval had no actor.** §6 lists an `autoApprove (≥0.90)` tweak while §2.7 says there are
"three human outcomes". The audit log's event types (`human_approve`, `human_edit_submit`,
`human_escalate`, `ai_suggest`, `ai_no_match`) have no vocabulary for a machine approval — the log
was designed before the tweak existed.

*Correction to an earlier reading of this repo: in the v3 prototype `autoApprove` never actually
approves. It renders an advisory "above auto-approve threshold · confirm anyway" hint and a human
still clicks. The gap is therefore not an unattributed action today; it is that the hint's
influence was invisible, and that the log has no way to represent machine approval if it is ever
switched on.*

## Decision

### 1. A five-role model

| Role | Can |
|---|---|
| **Viewer** | Read contracts, decisions, and clause text. No mutation, no export, no log access |
| **Requester** | Everything Viewer can, plus run Intake, edit a manifest, run Forge, and **request** an override |
| **Legal reviewer** | Adjudicate Review tickets; **approve or reject override requests**; verify clause promotions |
| **Legal admin** | Everything a reviewer can, plus activate/retire clauses and edit validation rules |
| **Auditor** | Read the full audit log, including override history and rejected requests. No mutation |

Viewer exists because the socialisation step below needs an audience that can genuinely read the
contract without being able to change it — today the only way to show someone a contract is to give
them an actor's role.

### 2. Override is a request, not an act

A Requester cannot clear a gate. They open an **override request** carrying the findings being
overridden, a mandatory business justification, and the commercial pressure being cited.

```
requested → socialised → approved | rejected → (if approved) gate opens
```

- **Socialisation** notifies the named stakeholders — clause reviewers of the affected clauses,
  the deal owner, and any configured watchers — and holds a review window. Its purpose is that
  nobody discovers the override at signature.
- **Approval** is a Legal reviewer's act. Approval is **per-finding**, not blanket: accepting a
  governing-law conflict does not accept an uncapped-indemnity conflict.
- **Rejection** requires a note and returns to the Requester with the rationale visible.

Blanket acknowledgement is retired. It recorded *that* someone proceeded, never *which*
contradictions they accepted, which is weaker than the audit story everywhere else in the system.

### 3. Every act carries an actor, a role, and its evidence

New audit event types:

| Event | Actor | Records |
|---|---|---|
| `human_override_request` | human | findings cited, justification, requester role |
| `human_override_socialise` | system | who was notified, when, review window |
| `human_override_approve` | human | approver role, per-finding decisions |
| `human_override_reject` | human | approver role, rejection note |
| `human_override_gate` | human | the gate opening, with the approved request's ID |
| `auto_approve` | **controller** | clause ID, score, threshold — reserved for machine approval |

The actor derivation is explicit-first, so a machine act can never be mis-attributed to a person:

```js
actor: entry.actor || (/^(ai|auto)_/.test(entry.type) ? 'controller' : 'human')
```

### 4. Auto-approval is recorded whether or not it acts

Every approval records whether the auto-approve hint was showing, the score, and the threshold:

```js
logAudit({
  type: 'human_approve',
  clause_id: suggestion.clause.id,
  score: suggestion.score,
  auto_approve_eligible: !!suggestion.autoApprove,
  auto_approve_threshold: AUTO_APPROVE_THRESHOLD,
});
```

This makes the *rate of nudged approvals* measurable — the number that matters if auto-approval is
ever promoted from advisory to automatic. If it is, it emits `auto_approve` with
`actor: 'controller'` and is sampled for retrospective review; it never emits `human_approve`.

## Consequences

**What it buys**

- The Requester keeps the ability to proceed, so the work stays inside the system where it is
  recorded.
- Overrides become socially expensive rather than technically impossible, which is the correct
  shape for a control that must not be routinely bypassed.
- Per-finding approval means the audit trail records the specific risk accepted, by whom, against
  what justification.
- A machine approval can never be read as a human one, in the log or in a regulator's export.

**What it costs**

- **Latency on the exact path that is already under deadline pressure.** A socialisation window on
  an urgent deal is a real commercial cost. Expect pressure to shorten or skip it; the window
  length is a policy setting and will be argued about.
- **A new bottleneck.** Override approval joins Review-ticket adjudication on Legal's queue
  ([ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md)), and the two compete.
- **Five roles is more RBAC than a small Legal team wants to administer**, and role sprawl invites
  everyone being granted Legal reviewer "temporarily".
- Recording `auto_approve_eligible` on human approvals means the log now carries a measure of how
  often humans rubber-stamp the machine. That number may be uncomfortable. It is supposed to be.

## Related

- [ADR-0001](ADR-0001-model-never-authors-contract-language.md) — auto-approval never widens what
  text may be inserted, only who decided to insert it
- [ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) — the other Legal bottleneck
- [`spec-vs-implementation.md §3`](../spec-vs-implementation.md) — the gate now blocks on High only
- [`LIFECYCLE-ARCHITECTURE.md`](../../LIFECYCLE-ARCHITECTURE.md) — the same role model governs
  post-execution obligations
