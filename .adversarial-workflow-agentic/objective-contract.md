# Objective Contract — Clausewerk Improvement Proposal, Phases 0–3

- **contract_id:** OC-CW-2026-07-25-01
- **date:** 2026-07-25
- **mode:** mixed (code + durable documents)
- **rigor:** standard
- **stopping point:** implementation (run to completion of Phases 0–3)
- **check-in policy:** user requested report at the end only; orchestrator self-approves Gates 1–6 and discloses every gate outcome in the final report.

---

## 1. Objective

Execute Phases 0, 1, 2 and 3 of
[`IMPROVEMENT-PROPOSAL-2026-07-25.md`](../IMPROVEMENT-PROPOSAL-2026-07-25.md), which turns the
findings of [`docs/REVIEW-2026-07-25.md`](../docs/REVIEW-2026-07-25.md) into ordered work.

In plain terms: the system already promises a set of guarantees in its documents. Some of those
guarantees are not actually enforced by the code, and the tests cannot see the gap because they
run with god-mode permissions. This work makes the promises true, hardens the one door where
outside files enter, and then builds the approval gate the rest of the design already assumes
exists.

## 2. Mode and target materials

**Code targets**

- `backend/db/migrations/*.sql` — six migrations; permissions, audit chain, immutability triggers,
  ladders, concessions, run store, executed agreements.
- `backend/db/test/*.mjs` — five suites plus the mutation harness.
- `backend/engine/*.py` — model, loader, resolution, validation, snapshot, run, docx; plus tests
  and the Python mutation harness.
- `backend/package.json` — test/verify script wiring.

**Document targets**

- `ARCHITECTURE.md`, `CLAUSE-LIBRARY-ARCHITECTURE.md`, `NEGOTIATION-ARCHITECTURE.md`,
  `LIFECYCLE-ARCHITECTURE.md`
- `docs/decisions/ADR-0001`, `ADR-0002`, `ADR-0008`, `ADR-0010`, `docs/decisions/README.md`
- `docs/data-model.md`, `docs/open-questions.md`, `docs/spec-vs-implementation.md`,
  `backend/README.md`, root `README.md`
- `memory.md` (decision records, per project rules)

**Out of target unless a package names it:** `prototype/**` (except where Phase 0 already touched
it and a document claim depends on it), `docs/handoffs/**`, `docs/REVIEW-2026-07-25.md` (a dated
record, not to be rewritten).

## 3. Scope — in

- **Phase 0 (hygiene):** commit ADR-0010 and `NEGOTIATION-ARCHITECTURE.md`; "amended by ADR-0010"
  notes on ADR-0001 and ADR-0002; ADR index updated to 0010 and its "all implemented in the
  prototype" claim corrected.
- **Phase 1 (enforcement holes):** D1–D7 in the database; E1–E4 at the engine↔database seam.
  Every fix lands with a test that runs as the real role where relevant, plus a mutation-check
  entry proving that test can fail. Mutation harness extended to the run store.
- **Phase 2 (edges):** E6 hostile-upload defences (entity expansion, decompression bomb); E5
  real-world Word containers and tracked moves; E7 manifest boundary enforced in the backend;
  the smalls — E8, D8, D9.
- **Phase 3 (build what is promised):** Review-queue tables with the `pending → verified |
  rejected` state machine, mandatory rejection note, and ADR-0010's draft entity; clause `origin`
  plus the second character count; spec repairs (rule grammar, data-model refresh, five roles
  everywhere, e-signature byte capture, legal hold, MSA/SOW and renewal-baseline decisions);
  the negotiation record (rounds + positions), append-only.

## 4. Scope — out (non-goals)

- **Phase 4 in its entirety.** No negotiation-intelligence engine, no entitlement valuation, no
  package-trade modelling. The user selected Phases 0–3.
- No frontend or prototype rework beyond keeping existing claims honest.
- No new runtime dependencies without explicit approval.
- No production deployment, hosting, CI, or infrastructure work.
- No rewriting of the dated review document.
- No changes to the five owner decisions recorded in Phase 0 — they are settled inputs, not
  questions to reopen.

## 5. Constraints

1. **Product boundary (CLAUDE.md, owner, 2026-07-25).** Clausewerk is responsible for the
   *system* — recording, gating, checking, provenance. It is not responsible for the contract
   text inside it. Content gaps get badged and routed to a responsible person; they are never
   framed as a product defect to solve.
2. **The founding invariant, as amended by ADR-0010.** No contract language reaches an agreement
   without a named human's approval, and every clause carries its origin permanently. The
   assembly path still generates nothing, and the zero-authored-characters property stays
   asserted by test on every build.
3. **No provenance count is printed on the contract document** (owner decision, Phase 0 item 1).
   Both counts are computed and kept in the system record only.
4. **Concessions at a fallback position require** the Requester **and** the assigned attorney,
   plus any configured Required Approvers. This is a Phase 3 build item, and CLA §3/§7 must be
   updated to match.
5. **Every guarantee-shaped fix needs a test that could have caught the original fault** — and,
   where the review named the fault, a test that runs as the real database role rather than the
   owner.
6. **Mutation discipline is preserved.** Both harnesses must stay green, and new protections must
   gain new mutations.
7. **Existing tests must not be weakened** to make new work pass. If a test's assertion was wrong,
   that is a finding to disclose, not a line to quietly delete.
8. **Plain language in all user-facing reporting.** Mike is a business executive; jargon is a
   defect in the report.
9. **Decisions get recorded** as individual entries in `memory.md`, per project rules.
10. **Schema changes are still free** — no production data exists. Prefer the correct shape now
    over a compatibility shim.

## 6. Success criteria

| # | Criterion | How it is checked |
|---|---|---|
| S1 | Every HIGH finding (D1–D5, E1–E3) has a fix and a test that fails without the fix | Named test + mutation-check entry per finding |
| S2 | Every MEDIUM/LOW finding in scope is fixed or explicitly, visibly deferred with a reason | Traceability table, finding → package → outcome |
| S3 | Database tests exercise the real roles, not the owner, wherever a policy or grant is the protection | Test source runs `SET ROLE` / connects as the role |
| S4 | The engine↔database write seam round-trips: engine rows inserted into the migrated schema and read back through `snapshot_from_rows` | New write-side integration test, green |
| S5 | Hostile-file defences are proven by hostile fixtures, not by inspection | Entity-bomb and zip-bomb tests, both rejected safely |
| S6 | The Review queue exists as tables with an enforced state machine and a mandatory rejection note | Migration + test suite |
| S7 | Clause `origin` exists end to end — schema, engine model, and both character counts computable | Migration + engine test |
| S8 | Documents no longer contradict the code or each other on the points the review named | Document diff + a claims checklist |
| S9 | `npm run verify` is green: five DB suites, the Python suite, and both mutation harnesses | Command output captured |
| S10 | Zero-authored-characters property still asserted and still true on the assembly path | Existing test still green |

## 7. Assumptions

| ID | Assumption | Tag |
|---|---|---|
| A1 | Baseline suites are green before work starts | Observed — pending `npm run verify` baseline |
| A2 | PGlite is the test database and supports the role/RLS behaviour the tests need; where it does not, that is a finding to disclose, not to paper over | Assumed |
| A3 | "Implement to completion" means functioning, tested code and consistent documents — not deployment | Inferred from the proposal's own definitions of done |
| A4 | Phase 3's "spec repairs" recommendations in the proposal (e.g. renewal opens from the executed agreement) are the owner's preferred answers unless red-team evidence contradicts them | Assumed |
| A5 | No production data exists, so migrations may change shape freely | Observed — stated in the proposal |
| A6 | The uncommitted working-tree changes are the completed Phase 0 code work, not work-in-progress to be discarded | Assumed — to be verified before committing |

## 8. Approval-sensitive decisions

These need the owner, and are surfaced in the final report rather than decided unilaterally:

- Adding any runtime dependency (e.g. a hardened XML parser for E6).
- Any change to the five settled Phase 0 decisions.
- The unedited-approval-rate threshold — Legal owns this; the system measures and displays, and
  the threshold stays unset.
- Anything that would weaken or delete an existing test assertion.
- Committing the working tree (the user has not asked for commits; changes are left staged in the
  working tree unless asked).

## 9. Gate 1 status

**PASS.** Objective, mode, targets, stopping point, scope boundaries, constraints, success
criteria, assumptions and approval-sensitive items are all stated and stable. The user answered
the three open intake questions (phase depth, rigor, check-in policy) directly.
