# Objective Contract — New Capabilities Work Package Packages — 2026-07-27 (Stage: work packages)

## Objective
Decompose the revised New Capabilities Plan (Revision 3: WP-1..WP-8; open decisions D-2, D-4, D-5, D-6, D-7) into an ordered set of single-owner, implementable work packages, in the house discipline the assembly-connection set (ASSEMBLY-CONNECTION-WORK-PACKAGES-2026-07-27.md) established. Stop at Gate 3 (work-package review). No implementation.

## Mode
document (the deliverable is a work-package document; it prescribes future code but changes none).

## Source materials (allowed inputs)
- .adversarial-workflow-agentic/2026-07-27-new-capabilities/new-capabilities-plan.html — the approved plan (Revision 3, includes WP-8 Contract Intelligence and D-7)
- .adversarial-workflow-agentic/2026-07-27-new-capabilities/integrated-revision-plan.md — verified facts and adjudications from the plan review
- ASSEMBLY-CONNECTION-WORK-PACKAGES-2026-07-27.md — the house exemplar for package style, discipline, and depth
- The repository (read-only): backend/db/migrations/, backend/doorway/, backend/engine/, docs/, memory.md, CLAUDE.md

## Deliverable
NEW-CAPABILITIES-WORK-PACKAGES-2026-07-27.md at repo root, mirroring the assembly set's structure: status header, how-it-was-made, decisions/heads-ups for Mike (plain language), order-of-work diagram, then one section per package.

## Package rules (hard constraints)
1. Package IDs are **NC-01, NC-02, …** — never reuse the plan's WP-x numbers or the assembly set's WP-00x numbers; each package names which plan WP it serves.
2. Single owner, explicit prerequisites, objective, scope, out-of-scope, target files (repo paths), acceptance criteria, risks, rollback. Two packages never mutate the same file without explicit sequencing.
3. **Detail is proportional to startability.** Packages that can start now (plan Phase 1: WP-2 and the D-4 session) are specified at assembly-set depth. Packages gated on open decisions (D-2/D-4/D-5/D-6/D-7) or on the in-flight assembly spine are specified as bounded outlines with their gate named — their fine detail is deliberately deferred, because specifying against an unmade decision manufactures rework.
4. **File-collision discipline:** no package touches backend/doorway/app.py, server.py, reads.py, mutation_check.py, or test_server.py until the assembly spine (WP-001..WP-008) completes. Packages needing those files sequence behind it and say so.
5. **Migration discipline:** any migration claims the next free number verified on disk at the moment its package starts — never a number written in this document (0025 is untracked as of today). One migration per package maximum; three rules for the negotiation migration (read-scoping of five views, write-scoping of four tables, per the verified findings).
6. **Engine discipline:** backend/engine/ existing modules are never modified; new deterministic capability may arrive as new engine modules with thin doorway adapters; `git diff --stat` on existing engine files stays empty in every package.
7. **Test discipline:** nothing counts as done without its named test; SQL tested against the migrated schema, not mocks; mutation rows only where a named test consumes the guarded line; never test content/wording (Mike's rule, it bit five times); synthetic/placeholder content is fine and never a defect.
8. **Owner decisions:** settled decisions (U1 renewal, U4 thresholds — see integrated-revision-plan.md and its validation corrections: U1 IS settled per 0012) are inherited, never reopened; open decisions gate packages but never gate silently — each gated package names its decision in plain language.
9. Mike-facing sections in plain business language; file:line evidence lives in package bodies and footers, not in his sections.

## Rigor
standard, Opus 5 subagents ('opus'), effort 'low' (user directive). Divergence at this stage = four parallel package authors on disjoint plan clusters (their clusters do not overlap, so blindness between them is by scope, not secrecy); adversarial pass = three Gate-3 reviewers (evidence, sequencing/collision, house-discipline lenses); orchestrator integrates and authors the final document; independent validator checks it at Gate 3.

## Stopping point
Gate 3. The final document is marked with its Gate 3 status. No code, no migration files, no artifact-plan changes.
