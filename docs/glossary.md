# Glossary

Clausewerk's vocabulary is narrow on purpose. Each term below means exactly one thing, and the
codebase should use it in exactly that sense.

Source: [`ARCHITECTURE.md`](../ARCHITECTURE.md).

---

## Actors

**Requester** — the business or procurement person who describes the engagement in Intake and
reviews vendor redlines in Negotiate. Does not write contract language and cannot promote clauses.

**Legal** — maintains the Ledger, adjudicates the Review queue, signs off in the Dossier. The only
actor who can put new language into the system.

**Controller** — the *inference* half of the system. Classifies intake into a manifest and matches
vendor redlines to clause IDs. Returns identifiers and scores, never prose.

**Executor** — the *deterministic* half. Resolves manifests against the Ledger, validates the
result, renders the .docx. Never calls a model.

---

## Permission roles

Distinct from the actors above. **Actors** say who or what does the work; **roles** say who is
permitted to. There are **six**, defined in
[ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) and
[ADR-0011](decisions/ADR-0011-the-administrator-is-a-steward.md), and created as real
database roles so that a missing privilege stops an act even if a permission rule is written
wrongly.

| Role | Database role | May |
|---|---|---|
| **Viewer** | `cw_viewer` | Read contracts and clause text. Change nothing. Sees no concession record |
| **Requester** | `cw_requester` | Run intake, negotiate, request overrides, propose concessions on their own deals |
| **Legal reviewer** | `cw_legal_reviewer` | Adjudicate the Review queue, approve overrides, verify clause promotions |
| **Legal admin** | `cw_legal_admin` | Everything a reviewer may do, plus activate, retire and supersede clauses, and promote a concession into the library |
| **Auditor** | `cw_auditor` | Read everything, including the full audit log. Mutate nothing |
| **Administrator** | `cw_administrator` | Keep the accounts, grant and revoke roles, keep the operational settings and watcher lists, take checkpoints. **Reads** contract content and changes none of it. Decides nothing in any workflow |

**Content-visible, content-powerless** — the accurate description of the Administrator, and the
phrase to use. Owner decision `U5` gave the role `select` on the content tables so that whoever
supports the system can see what is being complained about; it gave the role no `insert`, `update`
or `delete` anywhere, and no say in any workflow. The role is **not** content-blind, and calling it
that is a document promising a control the code does not enforce.

**Countersign** — a grant of either Legal role takes effect only when a Legal admin accepts it
(owner decision `U6`, [ADR-0011](decisions/ADR-0011-the-administrator-is-a-steward.md)). Until then
the grant confers nothing, and the refusal comes from the database rather than the screen. Viewer,
requester and auditor the Administrator grants alone.

**Bootstrap** — the one-time ceremony in which the database owner creates the first Administrator
and the first Legal admin, because only an Administrator may create an account and on a new
installation there is none. Refused once any account exists; both acts recorded on the chain as
`system` acts, marked as bootstrap.

**Account** — one row per named person in `cw.account`, holding exactly one role. Replaces the
self-asserted actor name: the actor on an audit row should be somebody the system knows. A second
role is a revoke and a grant, never a second row.

---

## Pipeline stages

**Intake** (Tier 1) — the conversational risk-discovery interview. An LLM playing a senior
procurement attorney asks one question per turn across thirteen risk dimensions, then emits
`READY_FOR_MANIFEST`.

**Manifest** (the boundary) — the strict JSON object produced from the transcript: `vendor`,
`value`, `source`, and a list of `{category, severity, justification}` risks. The *only* artifact
that crosses from the inference side to the deterministic side.

**Ledger** (Tier 2) — the clause library. The single source of contract language. Two populations:
risk-responsive clauses and the Baseline Framework.

**Forge** (Tier 3) — deterministic resolution. `resolveClauses(manifest, ledger) → Decision[]`. A
pure function: no network, no model.

**Validate** — pairwise contradiction rules run over the assembled decision set. High-severity
findings gate progression.

**Dossier** — the output stage, presenting two views over one decision set: the audit trail
(default) and the rendered contract.

**Negotiate** (Tier 1.5) — the redline loop. Vendor counsel returns a redlined .docx; the system
decides whether each changed paragraph maps to an already-approved position.

**Review queue** — the mutation gate. The only path by which new language enters the Ledger.

---

## Concepts

**Trust boundary** — the line between Manifest and Forge. Nothing downstream of it ever sees free
text produced by a model. See [ADR-0002](decisions/ADR-0002-manifest-is-the-trust-boundary.md).

**Baseline Framework** — cross-cutting boilerplate (Definitions, Order of Precedence, Entire
Agreement, Notices, Severability, Survival, Assignment, Anti-Corruption…) flagged
`alwaysInclude: true`. Lands in every contract regardless of what Intake found. Emitted with the
synthetic severity `Baseline`.

**Suppressed** — the candidate clauses that lost during resolution. Retained on the decision
record, never discarded, because the audit story requires showing what lost. See
[ADR-0004](decisions/ADR-0004-suppressed-candidates-are-retained.md).

**Kill switch** — the `active` flag on a clause. False if manually retired *or* past its expiry
date. An inactive clause silently leaves the selectable pool.

**Coverage gap** — a category × severity combination with no active clause behind it. Computed as
a set difference and surfaced in the Ledger panel.

**Fallback** — the deterministic substitute for an inference call: a 31-probe gap checklist for the
interviewer, ~100 regex `KEYWORD_RULES` for the classifier, escalation-to-Legal for the matcher.
Every inference call has one. See [ADR-0005](decisions/ADR-0005-deterministic-fallbacks.md).

**Escalate** — route a redline to Legal untouched, because no approved position matched it above
threshold. The system escalates rather than inventing. Creates a Review ticket.

**Reason code** — why a Review ticket exists: `no-ai-match`, `human-escalated`, or `human-edit`.

**Source provenance** — where a ticket's proposed text came from, badged in the UI:
`VENDOR LANGUAGE` / `AI CANDIDATE` / `EDITED BY LEGAL`.

**Immutable text** — clause body fetched verbatim by ID via `fetch_immutable_text(id)`. The only
string permitted to reach a contract document.

**vectorBucket** — `{scope, score}` metadata on a clause describing what it is semantically *for*.
Backs k-NN retrieval for the redline matcher in production.

**Tweaks** — runtime configuration: `similarityThreshold`, `strictMode`, `autoApprove`,
`showTrace`, `density`. Org-level policy under Legal's control in production, not per-user
preferences.

**Outbox** — the delivery targets for a completed contract: SharePoint contract path, audit
workbook, Legal notification.

---

## Identifiers

**Clause ID** — e.g. `DP-H-014`: category short-code (`DP` = Data Privacy), severity (`H` = High),
sequence (`014`). Stable and immutable; the unit of reference throughout the system.

**`SC-RETIRED-01`** — a seed-data clause that exists specifically to demonstrate the kill switch.

**`READY_FOR_MANIFEST`** — the sentinel token the interviewer emits when risk coverage is
sufficient. The UI turns it into a "generate manifest" button.

**`Policy-DERIVED-*`** — the citation form minted for a clause promoted through the Review queue,
distinguishing derived language from language traceable to an external policy or statute.
