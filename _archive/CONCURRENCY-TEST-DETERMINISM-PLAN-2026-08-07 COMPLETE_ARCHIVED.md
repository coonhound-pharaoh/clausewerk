# A concurrency test that raced the machine it ran on — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-06/07.
**Area:** `test_advisory.py::test_risk_judgments_share_the_provider_concurrency_ceiling`.

---

## In one paragraph, for a business reader

There is a limit on how many AI calls the system will have in flight at once, so
a slow provider cannot tie up the service. A test proves that limit holds. It
proves it by starting twelve calls at the same moment and checking that exactly
four get through — but it keeps each call "busy" using a **fixed 1/20th-second
pause**. On a loaded machine, the first calls finish and free their slot before
the last threads have even started, so more than four get through and the test
fails. **Nothing is wrong with the product; the test is racing the machine.**
It failed in the full-suite run and passed when run alone.

## Why this matters more than one flaky test

This is the third defect in three days where a guard stopped reporting on the
thing it watches (S241, S242, S243). A test that fails when the machine is busy
teaches exactly the same lesson as a test that always fails: the next person
learns that a red result here means nothing, re-runs it, and moves on. The first
genuinely broken concurrency limit will get the same shrug.

## The cause, precisely

`slow_open` holds a slot for `time.sleep(0.05)`. The test then asserts:

```python
assert len(recorded) == advisory.MAX_CONCURRENT_JUDGMENTS   # exactly 4
```

That equality is only true if all twelve threads attempt to acquire a slot
**before any holder releases one**. Thread start-up under load is not bounded by
50 ms, so the premise fails and the count comes out high. `peak > 1` has the
same exposure in the other direction.

## The fix — replace the wall clock with a barrier

Nothing here actually needs elapsed time; it needs *ordering*. Hold every
acquired slot open until all twelve threads have attempted acquisition, then
release them all.

Count the attempts where they actually happen — at the semaphore — by wrapping
`advisory._JUDGMENT_SLOTS` for the duration of the test with a proxy that
increments a counter on `acquire` (whether or not the slot is granted) and opens
a gate on the twelfth. `slow_open` then waits on that gate instead of sleeping.

The result is deterministic on any machine at any load: exactly
`MAX_CONCURRENT_JUDGMENTS` recorded, the rest refused, and `peak` exactly the
ceiling rather than merely "greater than one".

**The gate wait is bounded and asserted, not merely bounded.** If fewer than
twelve threads ever attempt — which would mean the code under test stopped
consulting the semaphore — the gate never opens. Waiting forever would turn a
real regression into a hung suite, so the wait carries a timeout and the test
asserts afterwards that the gate actually opened. A timeout must read as a
failure, never as a pass.

## What the test must still prove, unchanged

- exactly `MAX_CONCURRENT_JUDGMENTS` judgments are recorded
- every other caller is refused, and refused with the concurrency reason
- calls genuinely overlapped — otherwise the ceiling was never exercised
- the provider timeout passed to `urlopen` is still `TIMEOUT_SECONDS`

## How it is proved

Green, and then proved to bite: with `MAX_CONCURRENT_JUDGMENTS` temporarily
raised in `advisory.py`, the test must fail. A determinism check by repeated
runs, since "passes once" is what the old version also did.

## Not in scope

The other two judgment paths (`judge_semantic_difference`,
`propose_intake_manifest`) share the same semaphore and are covered by their own
tests; this change is confined to the one fragile test.
