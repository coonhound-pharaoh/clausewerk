# Objective Contract — Adversarial Review of the Clausewerk UI Design Proposal

- **Contract ID:** OC-UIREVIEW-2026-08-04
- **Date:** 2026-08-04
- **Requested by:** Mike (owner)
- **Mode:** document · **Rigor:** standard · **Stopping point:** integrated review report (Gate 2)

## Objective
Adversarially review `UI-DESIGN-PROPOSAL-2026-08-04.md` and its companion mockup
`prototype/v5-concept/Clausewerk V5 Concept.html`. For every substantive element of the
proposal, reach a verdict: **keep**, **change** (with what to change), or **reject**, each
backed by tagged evidence. Deliverable: a **Proposal Review Report** in plain business
language for Mike.

## Target materials (under review)
- `UI-DESIGN-PROPOSAL-2026-08-04.md` (269 lines, §§1–8)
- `prototype/v5-concept/Clausewerk V5 Concept.html` (37 KB, self-describing invented data;
  a hard-linked copy also sits at the repo root)

## Ground-truth sources (for verifying the proposal's factual claims)
- `memory.md` (owner decision records, S-records, U-decisions)
- `CLAUDE.md` (session rules: content-is-placeholder, system-vs-content boundary)
- `UI-AND-ADMINISTRATION-ARCHITECTURE.md`, `AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md`,
  `SOURCING-DOCS-PROPOSAL-2026-08-04.md`, `ARCHITECTURE.md`, `docs/`, `_archive/`
- The actual UI implementation under `backend/` (what screens/stylesheets really exist)
- `backend/db/migrations/` 0012+ and any `open-questions.md` before calling a U-decision open

## Scope boundaries / non-goals
- **No edits** to the proposal, the mockup, or any product file. Review only.
- Content (clause text, example rows, wording) is **placeholder by owner rule** — content
  gaps are never defects and wording is never a review finding.
- Settled owner decisions (workspace model U8's *organization*, microservices-declined S119,
  provenance-not-printed 2026-07-25) are context, not things to relitigate — but the
  proposal's *citations* of them must be verified.
- The review judges appearance and its claims; it does not redesign the database, roles, or
  trust boundary.

## Success criteria
1. Every keep/change/reject verdict traces to evidence tagged Observed / Inferred /
   Assumed / Unresolved.
2. Every dated decision or rule the proposal cites is verified against repo records, or
   flagged as unverifiable.
3. Disagreements between reviewers are adjudicated, not averaged; surviving disagreements
   are reported as open questions for Mike.
4. Final report is plain language, no developer jargon, and separates "keep", "change",
   and "decide" cleanly.

## Assumptions
- The proposal was authored today by a prior session and Mike has not yet ruled on
  UX-1..UX-4 (Unresolved until a reviewer checks memory.md / migrations 0012+).

## Approval-sensitive items
None — this run stops at the review report; no files under review are modified.

## Gate 1: PASS (all required fields present and stable).
