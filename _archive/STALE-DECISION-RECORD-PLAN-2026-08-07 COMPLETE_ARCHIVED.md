# The decision record says two shipped capabilities are missing — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `docs/open-questions.md` §9b.

---

## In one paragraph, for a business reader

`open-questions.md` is the file the team reads to know what has been decided and
what has been built. Section 9b says, in the present tense, that six governed
acts **have no endpoint** — and names two of them as still missing outright.
Both shipped on 2 August. A reader who trusts this file would conclude the
product cannot destroy a record under retention or supersede a clause. It can do
both.

## The evidence

| the record says | the code says |
|---|---|
| §9b heading: "six governed acts **have no endpoint**" | all six shipped in `0062` + the doorway writes |
| "Retention destruction … **The endpoint is still absent**" | `writes.py:372` — `POST /retention/destroy` |
| "Clause supersession … **the superseding endpoint is still absent**" | `writes.py:249` — `POST /library/supersede`, backed by `cw.supersede_clause()` (0062) |
| "the endpoints do not exist" | `POST /library/retire`, `POST /library/supersede`, `POST /retention/destroy` all present |

The file **already contains the correction**, ten lines below the stale bullets:

> "SETTLED 2026-08-02 (D-5): the six acts are IN SCOPE — and BUILT the same day.
> Migration `0062`, the doorway writes, and the screens landed together; WP-U13
> is closed."

So the section contradicts itself within one screenful. The D-5 paragraph was
appended when the work landed; the older present-tense claims above it were left
as they were.

## Why this is worth fixing

This is not product content — the "content is placeholder" rule covers clause
language and example contracts, not the record of what has been decided and
built. This file is a system record, and it is wrong.

The cost is concrete for commercial software: somebody builds a capability that
already exists, or tells a customer the product cannot do something it does. The
same reader has no way to know which half of a self-contradicting section to
believe, so the whole file loses authority — which is worse than the two wrong
lines, because the rest of it is accurate and load-bearing.

This is the same defect as the tripwire fixed earlier today (`c2aa7a6`), one
layer out: **a factual claim about the system that stopped being true and that
nothing re-checked.** There it was a test's premise; here it is the decision
record.

## The fix

Correct §9b so it describes the system as it is, without erasing the history —
the reasoning about *why* those two acts needed designing before building is
still worth reading, and it is what D-5 was answering.

- Retitle 9b from "six governed acts have no endpoint" to record it as closed.
- Mark the two "still absent" bullets as superseded, naming the endpoint that
  now performs each act rather than deleting the sentence.
- Correct "the endpoints do not exist" to past tense, so the table beneath it
  reads as the gap that *was* found rather than one that stands.

Nothing about D-5's own paragraph changes: it is accurate.

## How it is proved

There is no code change, so the proof is the claim itself: each endpoint named
is shown to exist in `writes.py`, and the file no longer asserts anything the
tree contradicts. Full suite run regardless, because a documentation edit that
breaks a test is exactly the kind of surprise worth ruling out — several tests
in this repository read source files.

## Not in scope

The other `SETTLED` entries (U11, U12, U13, U15) were spot-checked against the
tree and are accurate. §9b is the only self-contradicting section.
