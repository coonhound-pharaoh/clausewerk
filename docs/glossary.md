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
