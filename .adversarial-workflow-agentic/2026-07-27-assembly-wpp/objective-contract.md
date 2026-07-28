# Objective Contract — Assembly Connection Work Package Package

- **contract_id:** OC-CW-2026-07-27-01
- **date:** 2026-07-27
- **mode:** code (deliverable is a package document governing code work; no code changes here)
- **rigor:** standard
- **stopping point:** **work packages (Gate 3)** — no implementation in this engagement
- **subagent model:** Opus 5 (user directive), all roles

## 1. Objective
Convert `ASSEMBLY-CONNECTION-PLAN-2026-07-27.md` (WS-1 of the gap-closure plan) into an approved,
ordered set of single-owner work packages — a "Work Package Package" — ready for implementation.

## 2. Target materials (Observed sources)
- `ASSEMBLY-CONNECTION-PLAN-2026-07-27.md` — authoritative source plan (Mike-approved; its §5
  decisions are SETTLED/CLOSED user decisions, not open questions).
- `GAP-CLOSURE-PLAN-2026-07-27.md` — surrounding context (workstream boundaries).
- Repo ground truth: `backend/engine/` (untouchable), `backend/doorway/`,
  `backend/db/migrations/0001–0023` (next free number 0024), `prototype/v4/`, `memory.md`,
  `CLAUDE.md`.

## 3. Hard constraints
1. The engine is **not modified**; adapt the doorway's side only.
2. No permission logic in endpoints — every read/write through the caller's own connection; the
   database refuses in its own words.
3. Engine and database refusal sentences pass through unchanged.
4. No new migration unless a package claims 0024 explicitly and records why.
5. All content is **placeholder** — synthetic seeding allowed as development data; a content gap
   is never a defect or blocker.
6. Out of scope entirely: WS-2 (intake/AI), WS-4 (scheduler), WS-6 (negotiation records),
   WS-7 (rule authoring), WS-8 (byte store / e-signature provider).
7. Order respects plan §3: A → B → C → D; E after B (execute screen after D); F inside every
   package, not a trailing package. Suggested cut ~six packages; A splittable into A1/A2.
8. Stable WP IDs; no renumbering once issued.

## 4. Success criteria (Gate 3 verifies)
- Every Part (A–F) covered by at least one package; F embedded per-package.
- Each package: single owner, bounded scope, explicit target files, prerequisites, exact required
  changes, named validation checks and acceptance criteria (including the plan's named mutation-
  harness additions), risks, rollback notes.
- No two packages mutate the same file without an explicit prerequisite ordering.
- No unresolved design decision hidden inside a package; §5 settled decisions cited as settled.
- The round-trip test (record run → rebuild document → snapshot id match, through the service, as
  the caller) is a named acceptance criterion where the plan puts it.

## 5. Gate 1 status
**PASS.** Objective, mode, targets, stopping point, rigor, and constraints all supplied by the
user's request and the source plan; the owner's decisions are settled. No user decision
outstanding before planning begins.
