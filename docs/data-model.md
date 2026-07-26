# Data model

Every record shape in the system, in one place.

Rebuilt 2026-07-26. The previous version predated three of the four architecture documents and
described only the prototype's in-browser records, so it had quietly become a map of a smaller
system than the one that exists.

**How to read it.** The backend schema is the authoritative record shape, defined in thirteen
migrations under [`backend/db/migrations/`](../backend/db/migrations). This document gives the
*shape and the reasoning* — what each table is for, why it exists, and which architecture document
governs it. It deliberately does **not** copy column lists: duplicating DDL is what made the
previous version go stale, and the migrations are heavily commented and are what the tests actually
run.

Source of truth is marked throughout:

- **`[db]`** — a real table or view in the migrated schema; the migration file is authoritative.
- **`[engine]`** — a Python dataclass in [`backend/engine/`](../backend/engine).
- **`[proto]`** — exists only in the v3 prototype under
  [`prototype/v3/app/`](../prototype/v3/app), with no backend table yet.

---

## 1. The four architectures, and where their records live

| Architecture | Covers | Migrations |
|---|---|---|
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) | Intake → manifest → resolution → document | `0002`, `0004`, `0005` |
| [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md) (CLA) | The library, ladders, concessions | `0002`, `0003`, `0008`, `0009` |
| [`NEGOTIATION-ARCHITECTURE.md`](../NEGOTIATION-ARCHITECTURE.md) (NA) | Redlines, rounds, positions | `0008`, `0011` |
| [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md) (LCMA) | Everything after signature | `0006`, `0010`, `0012` |

Cross-cutting: `0001` (schema, roles, audit log) and `0007` (the audit chain) underpin all four.

---

## 2. Foundation — `0001`, `0007`

### `cw.audit_event` `[db]`

Append-only, hash-chained. Every governed act lands here. UPDATE and DELETE are revoked from every
role, including Legal admin — nobody edits history.

Each row commits to the one before it, so editing or removing a row breaks every hash after it.
What is hashed, and why each part is there:

- the previous row's hash (the link itself), and the sequence number;
- the timestamp **as epoch microseconds**, not as rendered text. Hashing the text made verification
  depend on the reader's `TimeZone` and `DateStyle`, so an honest database reported tampering
  whenever two people's session settings differed. That was a real defect, reproduced and fixed;
- the actor, the **actor's role**, the act kind, event type, subject and payload. The role was
  originally not hashed at all, which meant rewriting *who had the authority* was undetectable.

Fields are length-prefixed rather than joined by a separator, because a separator that can appear
inside a field lets two different events hash identically.

**`cw.audit_checkpoint`** `[db]` anchors the tail. Without it, deleting the newest entries is
undetectable — what remains is internally consistent. The checkpoint records the height and latest
hash, so a gap becomes visible.

Row-level security applies here too. It was absent, which meant a requester could read every rival
buyer's concession payloads — the exact information the concession table's own policy hides one
table over.

> **Two honest limitations, both stated in the migration.** The checkpoint is anchored but
> **unsigned** (`pgcrypto` is unavailable in the test database), so it constrains application roles,
> not the database owner. And the advisory lock that serialises appends in a real deployment ships
> with **no test coverage**, because the test database is single-connection.

### Roles `[db]`

Six. Five from [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) —
`cw_viewer`, `cw_requester`, `cw_legal_reviewer`, `cw_legal_admin`, `cw_auditor` — and
`cw_administrator` from [ADR-0011](decisions/ADR-0011-the-administrator-is-a-steward.md), added in
`0013`.

**Identity comes from the connection, not from a claim.** `cw.app_role()` derives the acting role
from the database role the session actually holds. It previously read a session variable any
connected client could set — so every policy in the schema trusted a value the client wrote.

> **Residual, stated plainly:** the *person's* name is still self-asserted, because the six roles
> are shared service roles. `cw.account` (below) narrows this — the name can now be checked against
> somebody the system knows — but does not close it. And the scheme assumes one connection means one
> person: it is **incompatible with transaction-mode connection pooling**. See `ARCHITECTURE.md` §5.

---

## 2a. People and access — `0013`

Governed by [`UI-AND-ADMINISTRATION-ARCHITECTURE.md`](../UI-AND-ADMINISTRATION-ARCHITECTURE.md) §4
and [ADR-0011](decisions/ADR-0011-the-administrator-is-a-steward.md); owner decisions `U5`–`U7`.

| Record | Purpose |
|---|---|
| `cw.account` `[db]` | One row per named person: who they are, their unit, the **one** role they hold, active or revoked, who created them and when |
| `cw.role_grant` `[db]` | Append-only. Every act on somebody's access is a row: `granted`, `countersigned`, `revoked` |
| `cw.effective_role` `[db]` | Derived. What each person may actually do **right now** — the single source the service layer consults |
| `cw.countersign_pending` `[db]` | Derived. Proposed Legal grants no Legal admin has accepted yet |
| `cw.bootstrap()` `[db]` | The run-once ceremony that creates the first Administrator and first Legal admin, and grants their two roles |

**Why `cw.role_grant` is an event log and not a grant row with nullable columns.**
The obvious design puts `countersigned_by` and `revoked_by` on the grant row and fills them in
later — but filling them in is an `UPDATE`, and a table that takes updates is not append-only, it is
a table with a convention. Under that design "who countersigned this" becomes a value somebody can
quietly change, and it is the one fact the whole rule rests on. So a grant is a row, countersigning
it is a second row naming the first, and revoking it is a third. The cost: "what can this person do
right now" is no longer a column lookup, it is `cw.effective_role`.

**`cw.effective_role` applies four conditions**, and each is a rule somebody could otherwise forget:
there is a grant; it has not been revoked; if it is a Legal role it has been countersigned (decision
`U6` — an uncountersigned Legal grant confers **nothing**, not a lesser role); and the account is
active. `cw.account.role` is the *declared* role and administrative record; this view is the
authority, and the gap between them is exactly the pending state the console renders amber.

> **The one hole in the countersign rule, marked rather than hidden.** The first Legal admin is
> created before any Legal admin exists to countersign them, so the bootstrap ceremony's own grant
> is effective without one. It is a single row, flagged `is_bootstrap`, naming the owner, recorded
> on the chain as a `system` act — so "which Legal role was never countersigned" is one query rather
> than an investigation, and a test asserts it returns exactly that one person.

**One person, one role — deliberately not a join table.** A second role is a revoke and a grant,
both recorded and both visible in the access history. A many-roles model would let one person hold
`legal_reviewer` and `administrator` at once, which is precisely the combination the countersign
rule exists to prevent.

**An account is revoked, never deleted**, and a revocation is never undone — bringing somebody back
is a new grant, recorded. Two layers hold this: no `delete` grant for any role, and a trigger that
refuses even for the owner. The person, and who created them when, are immutable; unit, display name
and role are living administrative facts and may change, each change audited
(`account_role_moved`, `account_revoked`).

**What the Administrator may touch.** Insert and update on `cw.account`, insert on `cw.audit_event`,
and — from `0013` parts 3 and 4 — the operational settings, the watcher lists and the checkpoint
function. `select` on the content tables and **no** insert, update or delete on any of them
(decision `U5`). The test suite sweeps every table in schema `cw` against an allowlist of the two it
may write, so a content table added by a future migration is covered the moment it exists.

**Audit events added:** `account_created`, `account_revoked`, `account_role_moved`,
`bootstrap_performed`, `role_granted`, `role_countersigned`, `role_revoked`. The bootstrap acts are
recorded with `actor_kind = 'system'` and a null `actor_role`: at that moment there is no
application role on the connection, and recording them as human acts under a role nobody held would
be a lie in the permanent record.

**Who writes what.** The administrator proposes (`granted`) and withdraws (`revoked`); a Legal admin
— and nobody else, including the administrator — writes `countersigned`. `acted_by` is overwritten
from the connection by a trigger, so a caller cannot name somebody else as the granter, and cannot
use that to dodge the self-grant check. Three refusals are enforced in the database: nobody grants
themselves a role, nobody countersigns a grant they are the subject of, and the person who proposed
a grant cannot also accept it — one signature wearing two hats is the rule not existing.

> **What revocation does not yet promise.** `cw.effective_role` stops answering the moment a grant
> or an account is revoked, so anything that consults it is current. Whether a person's *live
> session* ends is WP-U05's problem: the promise there is revocation honoured at next request, not
> next sign-in, and the console's copy must not promise more than that.

---

## 3. The clause library — `0002`, `0009`

The identity/content split is the core idea: **a clause is an identity; a clause *version* is
content.** Versions are immutable and never overwritten, so a contract executed under v1 still
resolves v1 forever.

| Record | Purpose |
|---|---|
| `cw.category` `[db]` | The enumeration everything keys off; short codes are unique and appear in clause IDs |
| `cw.clause` `[db]` | Identity: category, severity, whether it is always included |
| `cw.clause_version` `[db]` | Content: title, body, rationale, citations, reviewer, approval and expiry dates, **origin** |
| `cw.supersession` `[db]` | One version replacing another, as a recorded act |
| `cw.clause_version_state` `[db]` | Derived validity — computed, never stored ([ADR-0006](decisions/ADR-0006-clause-expiry-is-computed-not-stored.md)) |
| `cw.selectable_clause` `[db]` | What resolution may choose from |
| `cw.coverage_gap` `[db]` | Category × severity combinations with no selectable clause |

**What is immutable on an approved version:** body, title, citations, the named reviewer, the
direction of the retired flag (un-retiring is refused), and **origin**. A provenance field that can
be rewritten is not provenance.

### Origin `[db]` — added in `0009`

Every version records where its wording came from:
`legal_authored | ai_drafted | vendor_derived | external | reviewed`.

This exists because of [ADR-0010](decisions/ADR-0010-ai-drafted-clause-candidates.md): the Clause
Library Builder may *draft* candidate wording for a named lawyer to approve, so approved language
may be AI in origin. Two provenance counts are therefore computable — characters produced by the
assembly path (still zero, still asserted by test on every build) and characters originating from
AI-drafted clauses.

> **Neither count is printed on the contract document.** Decided by the owner, 2026-07-25. Both live
> in the system record — the run record and the dossier. The contract carries no provenance footer.

`cw.library_origin_mix` and `cw.run_origin_mix` `[db]` report the mix for the library and for a run.

**Origin is deliberately *not* in the snapshot fingerprint.** The fingerprint covers what determines
the *outcome* and nothing else — it already excludes clause state for the same reason. Origin cannot
change which clause is selected on a pinned `(clause_id, version)`, so including it would have
changed every stored hash for no gain.

---

## 4. Ladders and concessions — `0003`

Governed by CLA §3–§7 and [ADR-0009](decisions/ADR-0009-concession-is-not-supersession.md):
**accepting a vendor's wording is a concession scoped to one deal. It does not change the library.**

| Record | Purpose |
|---|---|
| `cw.agreement` `[db]` | The deal a concession belongs to; drives row-level security |
| `cw.ladder` `[db]` | A pre-approved retreat path for one category at one severity |
| `cw.ladder_rung` `[db]` | One position on that path; rung 0 is preferred, one rung is the floor |
| `cw.concession` `[db]` | What we opened with, where we settled, who approved, and why |
| `cw.ladder_health` `[db]` | Reports `intact` / `degraded` / `floorless` / `floor_unusable` / `empty` |

**The floor is absolute.** The below-floor check now filters on the concession's own severity and
orders deterministically. It previously did neither, so it judged a Standard position against the
High floor — wrongly rejecting legitimate concessions while a genuinely below-floor High concession
could slip past. It also **fails loudly when no ladder exists**; it used to fail open.

**A rung must belong to its own ladder** — matching the ladder's category *and* severity. Nothing
checked this, and the seeded test fixtures themselves violated it: a High Data Privacy clause sat on
a Standard Liability ladder. Retreating onto weaker wording is a demotion nobody recorded.

**A published rung is immutable** in which wording occupies it, because every past concession says
"we went to rung 2" and stays readable forever. The floor *marker* stays movable — that is a live
governance decision, and the floor in force is copied onto each concession anyway.

**A ladder never collapses silently.** If a rung expires beneath it, the ladder reports `degraded`
and the engine refuses to descend it, rather than quietly resolving to a shorter path.

---

## 5. Conflict rules — `0004`

| Record | Purpose |
|---|---|
| `cw.clause_tag` `[db]` | Tags a clause carries, used by rule predicates |
| `cw.conflict_rule` `[db]` | A versioned, effective-dated rule with a predicate |
| `cw.active_conflict_rule` `[db]` | The rules in force today |

The **rule grammar** is specified in CLA §4A. It was previously cited to CLA §4 — the Concessions
section. The grammar existed, in migration comments and the backend README, but not in the
architecture document pointing at it.

A rule's effective date **cannot be moved retroactively**, and a retired rule cannot be un-retired.
Either would rewrite which rules were in force historically.

A rule that asks nothing — an empty `all_present`, an empty `none_present`, an empty
`conflicting_values` — is refused, because such a rule fires vacuously on every contract.

---

## 6. The run store — `0005`

The reproducibility guarantee: **given a manifest and a library snapshot, resolution must be
reproducible forever.**

| Record | Purpose |
|---|---|
| `cw.snapshot` `[db]` | A fingerprinted pin of the library at a moment |
| `cw.snapshot_member` `[db]` | Which versions were in it, with their **frozen** selectable flag |
| `cw.snapshot_ladder_rung` `[db]` | The ladders as they stood, including where the floor sat |
| `cw.ruleset` / `cw.ruleset_member` `[db]` | The validation rules as they stood |
| `cw.run` `[db]` | One assembly: manifest, snapshot pin, ruleset pin, result hash, **engine version** |
| `cw.run_decision` `[db]` | One decision per risk — what was selected, what was suppressed, why |
| `cw.run_finding` `[db]` | Validation findings, each citing its rule version |

**Clock-derived state is frozen, not recomputed.** Whether a clause was selectable, and whether a
ladder was intact, both depend on the date. Recomputing them later silently answers a different
question, so both are stored and rebuilt from storage. Ladder status was fingerprinted but never
stored, which meant any run taken on a degraded ladder could never be reproduced.

**The engine version is recorded**, because the result hash depends on engine behaviour. Without it
a run produced by a different engine is indistinguishable from a stale one.

**Categories are stored as keys with a foreign key**, and translated back to human labels on the way
out (`cw.run_contract`). The engine wrote the human label into a column that wanted the key — and
the read side made the mirror-image mistake, hashing the stored key as if it were a label. Both
directions are now translated, and a round-trip test inserts real engine output into the real schema
and asserts the fingerprint survives.

---

## 7. The Review queue — `0008`

The architecture's **single mutation gate**. Until 2026-07-26 it existed only as prose;
`promote_concession()` was one path through a gate that otherwise did not exist.

| Record | Purpose |
|---|---|
| `cw.review_ticket` `[db]` | The ticket: quarantined proposed text, provenance badge, state |
| `cw.review_segment` `[db]` | The redline segments the ticket came from |
| `cw.review_candidate` `[db]` | Alternates, stored as **references** to clause versions, not copies |
| `cw.clause_draft` `[db]` | An AI draft: prompt, model, model version, inputs, expiry |
| `cw.clause_entrance` `[db]` | Every clause, and the door it came through |

State machine `pending → verified | rejected`, guarded on **insert as well as update** — a guard on
updates alone would let a requester create a ticket already in a terminal state and defeat the gate
on day one. Rejection requires a note that is neither empty nor whitespace. Deleting a ticket raises
rather than silently doing nothing.

Alternates are references because clause versions are immutable and never deleted, so a reference
still reconstructs the audit trail — which is what
[ADR-0004](decisions/ADR-0004-suppressed-candidates-are-retained.md) actually requires.

**`edited_before_approval`** is ADR-0010's binding control: it measures whether reviewers genuinely
review AI-drafted wording or wave it through. It is **derived from stored bytes**, never
self-reported, and the draft text is frozen once a ticket references it — otherwise the baseline
could be edited instead of the approval, and the control would report a perfect score forever.

> **Nobody owns the threshold yet, and that is deliberate.** Legal sets it in consultation with
> counsel. The system measures the rate and makes it visible (`cw.review_quality`); it must never
> choose the number itself.

---

## 8. Executed agreements — `0006`

**The signed file is the contract.** Frozen bytes, fingerprinted; amendments append rather than
edit; drift is reported, never applied.

| Record | Purpose |
|---|---|
| `cw.executed_agreement` `[db]` | The signed deal, its snapshot pin and status |
| `cw.executed_document` `[db]` | Frozen bytes and hashes — originals, counterparts, exhibits |
| `cw.executed_signatory` `[db]` | Who signed, as records rather than free text |
| `cw.signature_certificate` `[db]` | Completion-certificate bytes from the signing provider |
| `cw.agreement_drift` `[db]` | Where today's library differs from what was signed |
| `cw.agreement_chain` `[db]` | An agreement and its amendments |
| `cw.sow_conflict` / `cw.orphaned_sow` `[db]` | Master / work-order coherence reporting |

An agreement's **status can now change**, through an audited transition tied to execution. It
previously could not change at all, so every signed deal stayed "negotiating" forever.

**Master agreements and work orders** are modelled (`agreement_kind`, `parent_agreement_id`), reusing
the existing order-of-precedence overlay. **This is structure only.** Obligations do not exist
anywhere in the backend, so the composition a real master/SOW relationship needs cannot be delivered
end to end — and this document does not pretend otherwise.

**A work order may depart from its master** — owner decision `U2`, settled 2026-07-26 — but only
with the same approval a concession needs, and **one category at a time**. See §9a.

---

## 9. Governance — `0010`

| Record | Purpose |
|---|---|
| `cw.agreement_attorney` `[db]` | The attorney assigned to a deal |
| `cw.required_approver` `[db]` | Per-agreement configured approvers |
| `cw.concession_approval` `[db]` | Append-only approvals |
| `cw.concession_settlement` `[db]` | The gated act of settling |
| `cw.concession_state` / `cw.concession_in_force` `[db]` | Derived from the approvals, not stored twice |
| `cw.legal_hold` `[db]` | Suspends deletion for litigation |
| `cw.agreement_retention` `[db]` | The retention clock |
| `cw.governance_setting` `[db]` | Open owner decisions, held as data |

**Required Approvers** implement the owner's decision of 2026-07-25: settling at a fallback position
requires the **Requester and the assigned attorney**, plus any approvers configured for that
contract — executive leadership, other management, and stakeholder departments such as ISO, Privacy,
Compliance and Risk. Configurable per agreement, and it **fails closed** on a deal with no
configuration.

A concession records `proposer_kind` (`human` or `machine`), so **a machine may propose but never
settle** is enforced by the schema rather than asserted in prose. CLA §3 and §7 previously
contradicted each other on exactly this point.

**Legal hold** did not exist before. Retention deleted on a clock with no way to suspend it for
litigation — in a system whose selling point is what survives a dispute. A record under hold cannot
be destroyed, and releasing a hold is audited.

> **What retention does and does not do:** it gates and records the destruction decision. It does not
> yet destroy stored bytes.

---

## 9a. Departures from a master — `0012`

| Record | Purpose |
|---|---|
| `cw.sow_override` `[db]` | A **proposal** that one work order depart from its master on one category |
| `cw.sow_override_approval` `[db]` | Append-only signatures |
| `cw.sow_override_settlement` `[db]` | The gated act that actually authorises it |
| `cw.sow_override_in_force` `[db]` | What authorises anything — read this, never the proposal table |

Departing from the master binds the company to something other than its standard position, which is
exactly what conceding to a supplier does — so it earns the same signatures: the Requester, the
assigned attorney, and every configured Required Approver. **A machine may propose a departure; it
may never approve one.** A deal with no attorney assigned cannot authorise one at all.

Granted **per category**, never per work order: a blanket permission is signed once and then
inherited by every later amendment without anyone looking again. An authorised departure is **still
reported** in `cw.sow_conflict` — approved is not hidden.

---

## 10. The negotiation record — `0011`

Append-only, like runs. Governed by NA §2.

| Record | Purpose |
|---|---|
| `cw.negotiation` `[db]` | The negotiation over one agreement |
| `cw.negotiation_round` `[db]` | Contiguous, append-only rounds |
| `cw.negotiation_position` `[db]` | Positions held in a round |
| `cw.position_movement` `[db]` | How a position moved, and when |
| `cw.position_current` / `cw.position_revival` `[db]` | Derived; revival makes a re-raised ask visible |
| `cw.renewal_drift` `[db]` | What changed since the deal being renewed |

**Renewal baseline was owner decision `U1`, settled 2026-07-26** — recorded in
`cw.governance_setting`. Both paths are fully built; the decision chose which is pre-selected:

- **Default as shipped** — renewal opens from the executed agreement's positions, with the drift
  report alongside. This matches how counterparties actually behave.
- **The alternative** — renewal restarts from current library standard.

Whichever is used is a recorded choice, written to the audit log. This is deal-scoped and does not
conflict with ADR-0009, which forbids *library* drift.

**Settled: open from the executed agreement.** The accepted cost is that a concession can become
permanent unless somebody reads the drift report — so that report is the control, and belongs in
front of whoever opens the renewal.

---

## 11. Engine records `[engine]`

The Python engine mirrors the schema in dataclasses under [`backend/engine/`](../backend/engine):
`model.py` (clause, ladder, manifest, risk), `resolution.py` (`Decision`, `Resolution`),
`snapshot.py` (the fingerprint), `run.py` (storage and rebuild), `validation.py` (findings),
`manifest.py` (the trust boundary), `docx.py` (assembly and redline parsing).

### The manifest — the trust boundary

```jsonc
{ "vendor": "…", "value": "…", "source": "llm" | "fallback",
  "risks": [ { "category": "Data Privacy", "severity": "High" | "Standard",
               "justification": "one sentence from the conversation" } ] }
```

Generation is inference; **validation is deterministic**. A category outside the enumeration is
**dropped**, and the drop is *recorded as a drop* — distinct from "no clause available in the
library". That distinction matters: without it, a model hallucinating a category is misdiagnosed as
a gap in the library, corrupting the one report the system prizes. This check previously existed
only in the prototype.

> **Known limitation:** `check_manifest` has no production caller yet, because there is no service
> layer. It is the boundary's definition and it is tested; it is not yet wired into a running path.

### Document assembly

`build_docx` composes only approved clause text plus a declared allowlist of structural strings.
`authored_characters()` counts every character in the produced document that is neither, and the
test suite requires that count to be **zero** on every build. A control test proves the counter
actually looks, by removing the allowlist and requiring a non-zero result.

Redline parsing recurses through `w:hyperlink`, `w:sdt` and `w:smartTag` containers — text inside
them was previously invisible to Legal. Tracked **moves** are read as delete + insert, deliberately.
Uploads are bounded per archive member and in total, and element nesting is capped.

> **Limitation:** Word is not available in this environment, so redline fixtures are hand-built
> ECMA-376 markup. No Word fidelity is claimed beyond what those fixtures exercise.

---

## 12. Prototype-only records `[proto]`

Still living only in [`prototype/v3/app/`](../prototype/v3/app), with no backend table: intake
sessions and transcripts, per-inference-call logging, the outbox targets, and the tweak settings
(`similarityThreshold`, `strictMode`, `autoApprove`). `ARCHITECTURE.md` §5 lists these as production
requirements.

---

## 13. How they connect

```
CATEGORIES ──constrains──→ Manifest.risks[].category   (unknown → DROPPED, recorded as dropped)
     │                            │
     └──constrains──→ Clause.cat  │
                          │       │
                          ▼       ▼
                    resolve() ──→ Decision[] ──→ CONFLICT_RULES ──→ Finding[]
                          ▲            │
                          │            ▼
                    clause_version   build_docx() ──→ contract.docx
                          ▲                          (0 authored characters, counted)
                          │
                    review_ticket ←── redline ←── vendor .docx
                   (verify = mint a version, origin recorded)
                          ▲
                          │
                    clause_draft (AI candidate — proposes, never publishes)
```

Every arrow into the library passes through a named human. That is the whole design — see
[ADR-0003](decisions/ADR-0003-review-queue-is-the-only-mutation-surface.md), as narrowed by
[ADR-0010](decisions/ADR-0010-ai-drafted-clause-candidates.md).

---

## 14. What is deliberately not built

Recorded so each absence is a decision rather than an oversight:

- **Obligations** — the lifecycle system's obligation extraction and tracking.
- **Negotiation intelligence** — the seven-signal engine. A counting query delivers most of the
  insight until a real concession corpus exists.
- **Entitlement valuation** — depends on commercial-data integrations that are themselves undefined.
- **Package-trade modelling** — concession analytics are **trade-blind**, and wherever they surface
  they must say so, because the record systematically reads a traded concession as a unilateral
  giveaway.
- **Resolution consulting ladders for a preferred rung** — deferred; it would give the engine a
  second, quieter selection authority.
- **Vector index** — the redline matcher's embedding store.
- **Destruction of stored bytes** — retention gates and records the decision only.
