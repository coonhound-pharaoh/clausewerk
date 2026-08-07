# A model that was never asked is not a call — plan (2026-08-06) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-06.
**Area:** the model-call ledger and the daily budget (migration 0066, AI-3).

---

## In one paragraph, for a business reader

The system keeps a count of how many times a day it asks an AI for an opinion,
and stops asking once that count reaches the limit the administrator set. The
count is wrong. It also counts the times the system **decided not to ask** — for
example, when no AI key is installed, which is the state every development
machine and every not-yet-configured deployment is in. So a system that has
never spoken to an AI provider in its life still runs its daily allowance down
to zero, and once it does, requesters are told *"today's model budget is spent"*
— a sentence that is simply untrue — instead of the honest *"no model key is
configured"*. The administrator's cost figures are inflated by calls that cost
nothing.

## The evidence

Three intakes were submitted with no key configured, against a real database.
The ledger and the budget function were then read directly:

```
SOURCE:   fallback
ABSENCE:  no model key is configured: CLAUSEWERK_OPENAI_API_KEY is not set ...
LEDGER:   [('absent', 'no model key is configured ...'),
           ('absent', 'no model key is configured ...'),
           ('absent', 'no model key is configured ...')]
BUDGET:   (3, 200, 4000)      <- calls_today, calls_allowed, tokens_per_call
```

Three calls charged. Zero calls made.

## Why this is a defect and not a design choice

Migration `0066` says it in its own words, above the table:

> "the whole point is that 'the model was not asked' and 'the model was asked
> and could not answer' are different facts, and neither may hide."

The table it then creates has a single `outcome` column with two values, and
`absent` collapses exactly those two facts into one. `cw.model_calls_today()`
counts every row with no filter, so the cap — which exists to bound **spend** —
is charged for asks that never left the building.

`doorway/advisory.py::propose_intake_manifest` returns an absence before it
dispatches anything in five places: an unusable model name, no key, a library
with no categories, answers too large to send, and the provider concurrency
limit already reached. All five are recorded as calls.

## The fix

Say the third fact out loud rather than inferring it.

1. **Migration `0068`** — extend `outcome` to `'answered' | 'absent' |
   'not_asked'`; widen the absence-reason constraint so a `not_asked` row still
   has to carry its reason; and make `cw.model_calls_today()` count only rows
   that actually reached the provider. Existing rows are untouched and remain
   valid.
2. **`advisory.py`** — a `Proposal` carries whether the provider was reached.
   The five pre-dispatch refusals say no; everything from the dispatch onward
   says yes. `Proposal.outcome` reports the three values.
3. **`intake.py`** — unchanged. It already writes `proposal.outcome`.

### Why not simply skip the ledger row

Because the row is the fact worth having: how often the system falls back, and
why, is exactly what AI-7 reports on, and a deployment silently never asking is
something an administrator must be able to see. The row stays. What changes is
that it is no longer billed.

## How it is proved

- A Python test: a keyless intake writes a `not_asked` row and leaves
  `calls_today` where it was.
- A schema test (`db/test/model-intake.test.mjs`): the three-value vocabulary,
  the reason constraint on `not_asked`, and the count that skips it.
- A mutation row, so that reverting the count filter goes red.
- `node backend/db/test/mutation-check.mjs` after the migration edit (CLAUDE.md).

## Not in scope

The judgment paths (`semantic_difference`, `risk_exposure`) name purposes in
`0066` but write no ledger row at all yet. That is unbuilt work, not a defect,
and is left alone.
