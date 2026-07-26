# Handoff · The clause library

**State: partly built.** Ladders, concessions, promotion and the analytics views
are working software. The **Clause Library Builder is specified and not started**
— and it carries the one decision the owner still has to make.

---

## 0. Ground rules (repeated in every handoff — read them)

**The owner is Mike.** `CLAUDE.md` at the repo root auto-loads and is binding:
simple solutions; **plain business language, never developer jargon**; important
decisions recorded in [`../../memory.md`](../../memory.md) in plain language;
naming and branding are the owner's alone.

**The invariant**, as amended by
[ADR-0010](../decisions/ADR-0010-ai-drafted-clause-candidates.md):

> No contract language reaches an agreement without a named human's approval,
> and the origin of every clause is recorded on it permanently.

**Every guarantee has a mutation check** that deliberately breaks it and confirms
the tests notice. Eleven real faults have been found that way. Add yours.

---

## 1. What this workstream is

The library is not a store of clauses. It is meant to hold a **negotiating
position**: what we open with, what we will fall back to, where we stop, what we
actually gave away, and what that record tells us to change.

Specification: [`../../CLAUSE-LIBRARY-ARCHITECTURE.md`](../../CLAUSE-LIBRARY-ARCHITECTURE.md).

## 2. What exists

Migration `0003_ladders_and_concessions.sql`, fully tested (29 tests):

- **Ladders** — `cw.ladder` / `cw.ladder_rung`. Rung 0 is the preferred position;
  exactly one rung is the floor. Rungs must be contiguous from 0.
- **`cw.ladder_health`** — `intact` / `degraded` / `floor_unusable` / `floorless`
  / `empty`. An expired rung **degrades** a ladder; it does not silently close
  the gap, because that would quietly lower our floor.
- **Concessions** — `cw.concession`. Below the floor, or taking vendor wording,
  requires a recorded override.
- **Quarantine** — conceded vendor text is in no selectable view and not in the
  library at all. `cw.promote_concession()` is the only route in: `legal_admin`
  only, mints `provenance = 'promoted'`, refuses to run twice.
- **Analytics** — `cw.concession_rate`, `cw.library_proposal`. Plain aggregation
  with evidence attached. No model.

Ladder descent lives in `engine/resolution.py` and escalates whenever it cannot
be certain: no ladder, damaged ladder, unknown position, lapsed rung, or anything
below the floor.

## 3. What is specified and not built

### The Clause Library Builder — and the open owner decision

AI drafts candidate clauses, ladder rungs and conflict rules from **stated
inputs**: company rules, the concession record, coverage gaps, supplier paper we
have seen, and neighbouring rungs. Never a blank prompt.

**It drafts. It never publishes.** A draft is a proposal that reaches the library
only through the existing Review gate with a named approver.

> **UNRESOLVED, AND THE OWNER'S CALL.** The current document footer reads
> `0 LLM-authored characters`. That stays true of assembly and is still asserted
> by test. It stops being true of the *library* once AI-drafted clauses are
> approved into it. The system must compute both numbers. **Which is published
> is Mike's decision and he has not made it.** Do not ship the Builder with the
> old footer intact while the second number is above zero.

Two things the specification insists on and you should not drop:

- **Approving a draft unedited is recorded distinctly** from approving an edited
  one. That rate is the early warning that review has stopped being review.
  Nobody owns the threshold yet — see open questions.
- A draft may not be approved by whoever requested it, when the requester is not
  Legal.

### Also unbuilt

- `origin` on clause versions (`legal_authored` | `ai_drafted` | `vendor_derived`
  | `external`). Currently only `provenance` (`seeded` | `promoted`) exists.
- The `cw.draft` table and its state machine.
- Supersession is schema-complete but nothing calls it from a workflow.

## 4. Traps

- **The floor is absolute.** No confidence score, threshold or auto-approve gets
  past it. A mutation check guards this — and it originally passed for the wrong
  reason, because the test ladder's floor was also its last rung, so deleting the
  floor check still escalated via "ladder exhausted". A ladder may legitimately
  hold rungs *below* the floor (asks we know vendors make and refuse).
- **Concession data is the most commercially sensitive thing in the system** — an
  aggregate of exactly what we concede under pressure. Legal and Audit see all,
  a requester sees only their own deals, a viewer sees none. It must never appear
  in anything vendor-facing.
- **A viewer's denial was once accidental.** The row-level policy's subquery
  touched `cw.agreement`, which viewers cannot read, so the error named the wrong
  table. Fixed with a `security definer` ownership function. If you touch those
  policies, assert the denial names the right table.
- **Ladders must be pinned into run snapshots.** They change which clauses are
  *eligible*, so pinning the clause library alone lets the same manifest resolve
  differently next quarter.

## 5. Open questions the specification leaves

From CLA §11 — none of these are decided:

1. Ladder depth. Three rungs is a guess.
2. Concession decay — should a four-year-old concession weigh as much as last
   month's?
3. How many similar concessions constitute a pattern worth proposing on. Set it
   too low and the proposals queue becomes noise.
4. **If a rung expires, does the ladder collapse upward?** Currently reported as
   `degraded` and left to the caller, deliberately.
5. Cross-category trades — vendors accept a cap *because* an indemnity narrowed.
   The concession record is per-category and cannot express it.

## 6. Where to start

1. `cd backend && npm run verify` — confirms the built half.
2. Read the CLA end to end, then
   [ADR-0009](../decisions/ADR-0009-concession-is-not-supersession.md) and
   [ADR-0010](../decisions/ADR-0010-ai-drafted-clause-candidates.md).
3. **Ask Mike about the footer decision before building the Builder.** It changes
   what you build, not just what you write on it.
4. Smallest useful next step: add `origin` to clause versions and backfill it.
   Everything in the Builder depends on it and it is independently valuable.
