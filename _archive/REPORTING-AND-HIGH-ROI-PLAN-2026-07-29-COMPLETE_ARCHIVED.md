# Reporting & High-ROI Features — COMPLETE_ARCHIVED

**Plan approved by Mike in chat, 2026-07-29 (including explicit confirmation
that Third-Party Paper Ingestion fits the business strategy). Implemented the
same day. Decisions and deviations recorded in `memory.md` §S118.**

## What the plan asked for, and what was built

| Plan item | Outcome |
|---|---|
| Reporting Module (velocity, contested-clause leaderboard, review-queue bottlenecks, risk exposure) | **Built.** Migration `0043` — five views derived fresh from the record, granted to legal admin and auditor only. Reads `/reports/velocity`, `/reports/contested`, `/reports/queue`, `/reports/reviewers`, `/reports/exposure`. Reporting pane in the v4 shell for both roles. |
| Metrics Aggregator Service / materialized view / read replica | **Deliberately not built.** Plain views; no second store that can drift. Materialize from the same SQL if a view is ever measurably slow. |
| Feature 1 — Third-Party Paper Ingestion | **Built.** `doorway/paper.py`, `POST /paper/ingest` — the first consumer of an upload. Hardened docx parser (engine), deterministic category-words classifier (ADR-0005: deterministic substitute ships first; a model can front it later), every classified paragraph quarantined as a `supplier-paper` review ticket, deviation report names missing always-include categories. Severity of vendor wording is left to the reviewer on purpose. |
| Feature 2 — Regulatory Retro-Scanning | **Built as the worklist, not the amendments.** Migration `0046`, `cw.policy_shift_exposure`, `GET /reports/policy-shift`. Auto-generated "draft amendments ready to bulk-approve" was narrowed away: no amendment-assembly machinery exists, and a report must not become a second way for language to reach an agreement. |
| Feature 3 — Friction Scorecard & Cost Estimator | **Built.** Migration `0045`, `cw.vendor_friction`, `GET /vendors/friction`, "vendors" tab in the requester's workspace. Names group verbatim (no vendor master table smuggled in); the cost is labelled an estimate in the row, driven by three visible Administrator settings. |
| Feature 4 — Intelligent Review Queue Routing | **Built to §6's settled minimum.** Migration `0044`: `cw.ticket_claim` (one live claim per ticket, enforced by index), `cw.ticket_route` (owner from `cw.ladder` at read time), escalation as an age predicate against `review_escalation_days`, and a `review_escalation` arm in `cw.waiting_for` so the named owner is told about work nobody took — which the notification digest picks up automatically. Claim/release writes, routing panes for reviewer and admin. |

## Evidence at completion

- New SQL suites `reporting.test.mjs` (12) and `routing.test.mjs` (9), green.
- SQL mutation harness 256/256, including three new routing guards.
- New doorway suite `test_paper.py` (9), green; `test_reads.py` / `test_writes.py` green with the read-count pin moved 36 → 44.
- Full SQL suite run and UI verification recorded in the session; panes render honest empty states and no console errors.
