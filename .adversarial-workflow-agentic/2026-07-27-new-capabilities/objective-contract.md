# Objective Contract — New Capabilities Plan optimization — 2026-07-27

## Objective
Optimize the "New Capabilities Plan" (artifact 4a818f77; local extraction: plan-under-review.md): verify its factual claims against the repository, red-team its sequencing, dependencies, decision framing, and package boundaries, and produce a revised plan whose claims survive contact with the repo and whose ordering is defensible. Update the artifact in place.

## Mode
document (a project plan; no code changes).

## Target materials
- .adversarial-workflow-agentic/2026-07-27-new-capabilities/plan-under-review.md (the plan text)
- The repository C:\Users\MimoMac\repo\clausewerk (read-only evidence source): backend/db/migrations/, backend/doorway/, docs/, memory.md, NEGOTIATION-ARCHITECTURE.md, ADR-0010, open-questions.

## Stopping point
Implementation: a revised plan document published back to the artifact URL, plus a plain-language summary for Mike. Validation + verification pass afterward.

## Rigor
standard — three independent planners, three red-team reviewers, integrator, single-owner rewrite, validator, verifier, final audit. Subagents: Opus 5 ('opus'), effort 'low' (user directive).

## Scope boundaries / non-goals
- No source code, migration, or test changes. The deliverable is the plan document only.
- Content (clause language, rules, thresholds as legal substance) is placeholder — never report a content gap as a defect (Mike's standing rule).
- The plan's product boundary stands: system responsibility, not contract-text responsibility.
- Do not renumber or restructure WP-1..WP-7 identities; refine scope, dependencies, sequencing, decisions, gaps.
- Plain business language for Mike; no jargon.

## Known constraints / facts
- Settled decisions in the assembly workstream (runs tied to deals; execution evidence minimum; placeholder-content rule closing the rule-catalogue question).
- The parallel assembly-connection work-package set (WP-001..WP-008) is APPROVED and touches the same doorway files; this plan must not conflict with it.
- Working tree holds untracked 0024_the_flag_is_enough.sql and a 0025 run-scoping migration; migration numbering claims in this plan must not collide.

## Assumptions (tagged)
- Assumed: artifact content fetched today is current.
- Assumed: "migration 0011" claim for the negotiation database needs verification (planner task).

## Gate 1
User invoked the skill with target, model, and effort specified; session is autonomous — Gate 1 passes on this contract. Gate 2 (integrated plan) is adjudicated by the orchestrator on evidence; the revised artifact ships with disclosures rather than blocking on user approval, per the autonomous-session rule and Mike's "warn, don't gate" memory.
