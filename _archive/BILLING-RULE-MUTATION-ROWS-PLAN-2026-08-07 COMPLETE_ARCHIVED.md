# The billing rule is guarded in the schema and not in the code — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan, 2026-08-07 — reviewing my own change from this morning.
**Area:** `doorway/advisory.py` `Proposal.asked` / `Proposal.outcome`, shipped in `c7b2bf9`.

---

## In one paragraph, for a business reader

This morning's fix stopped the system charging its daily AI allowance for calls
it decided not to make. The database half of that rule is protected by a
deliberate sabotage test: break it, and a named test goes red. **The code half
is not.** It has ordinary tests, which is not the same thing — an ordinary test
proves the code works today; a sabotage test proves somebody will be told when it
stops. This repository's own rule is that every guarantee gets a deliberate
attempt to break it, and I did half the job.

## The evidence

`db/test/mutation-check.mjs` carries the row I added this morning:

```
name:   'a call the doorway never made is billed anyway'
expect: 'a call the doorway declined to make is recorded but not billed'
```

`doorway/mutation_check.py` carries a row for `advisory.py` — but for a
different guarantee (a judgment inventing a number). Grepping it for `asked`,
`not_asked` or `model_call` returns nothing relevant.

So: break the SQL filter and the harness reports it. Break the Python that
decides which outcome to write, and nothing does.

## The two mutations worth adding

Each names one existing test, per the harness's contract.

1. **The rule reverts to what it was before this morning.**
   `return "absent" if self.asked else "not_asked"` becomes `return "absent"`.
   That is exactly the defect `0068` was written for: every keyless deployment
   silently spends an allowance it never used.
   Caught by `test_with_no_key_the_seam_declines_and_says_why`.

2. **The default flips, and this is the more dangerous one.**
   `asked: bool = True` becomes `asked: bool = False`. Every path from the
   dispatch onward — a provider refusal, a timeout, an unreadable reply — would
   then record `not_asked` and go **unbilled**. That hides real spend, in the
   one figure somebody budgets from, and it is the failure mode the fix's own
   comment warns about ("Defaults True so that every path from the dispatch
   onward … is billed").
   Caught by `test_a_provider_that_was_reached_and_failed_is_still_billed`.

The second matters more than the first. The original defect over-billed, which
shows up as a budget running out early — visible, annoying, and self-reporting.
Under-billing is silent: the figure simply reads low forever.

## How it is proved

The harness itself is the proof — it applies each mutation, runs the named test,
and reports the mutation as caught only if that test fails. A row whose `expect`
does not name the test that actually catches it is reported as **imprecise**,
which is how this session's first attempt at a mutation row was caught.

## Not in scope

No product code changes and no migration, so no schema-harness requirement. Both
Python harnesses will be run regardless: this file is one of them.
