# The list of names a request body may not carry was half the list — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** The set is derived from `backend/db/migrations` and feeds both
guards. `owner` is the one named exception, with its reasoning. Proved by breaking
it both ways: removing `withdrawn_by` from the declaration fails naming it, and
adding `escalated_by` to a scratch copy of the migrations fails naming that.

**One change from the plan.** The companion test in step 3's spirit — "the
declaration names nothing the schema does not have" — was written, run and
DELETED. It failed on `countersigned_by` and `person_acting`, and both entries are
correct: neither column exists, and both belong in the list anyway because it bans
BODY FIELD NAMES, not columns. The schema is a floor under the list, never a
ceiling. The reasoning is kept in the test file where the deleted test would have
been.

A mutation row was added (`the person-column derivation matches nothing`); all 47
patterns resolve exactly once. Full doorway suite: **1503 passed**.

## What is wrong

No write endpoint may take an actor from the request body: the name on a recorded
act comes from the connection, never from the caller. Two guards enforce that, and
**both are hand-typed lists of column names that nobody derived from anything.**

    writes.NEVER_FROM_THE_BODY                              17 names
    test_writes.test_any_recorded_actor_comes_from_the_       10 names
      connection (its own separate list, inline)

The schema has **33 columns that hold a person's name**. So the first list is
missing seventeen of them and the second is missing twenty-three — and the two
lists do not agree with each other either.

Missing from `NEVER_FROM_THE_BODY` today: `acknowledged_by`, `analysed_by`,
`assessed_by`, `assigned_by`, `destroyed_by`, `granted_by`, `raised_by`, `ran_by`,
`received_by`, `released_by`, `retired_by`, `sent_by`, `set_by`, `shared_by`,
`tagged_by`, `withdrawn_by`.

**The file already knows this about itself.** Its own comment records that
`requester` was absent until the mutation harness broke a deals endpoint and
nothing noticed — `cw.owns_agreement()` reads that column, so a deal opened under
somebody else's name would have handed them that person's deals, runs, overrides
and reading room. The comment ends: *"which is exactly how a list like this goes
wrong: it grows by whatever the last endpoint happened to be called."*

It is still growing that way. It just has not been caught a second time yet.

## What is NOT wrong, checked before claiming otherwise

**No endpoint takes any of those seventeen from the body today.** This is a
prevention gap, not a live hole. Every current `WRITES` entry was driven against
all 33 columns and one matched:

* `POST /ladders/publish` declares `Field("owner")`, and `cw.ladder.owner` is a
  person by default (`coalesce(p_owner, old_owner, cw.app_actor())`).
  **This is legitimate and stays.** `owner` here is stewardship — who to ask about
  a ladder — and it is read by nothing but a view; no policy consults it. Only a
  legal admin can publish, the real actor is recorded separately by `cw.audit`,
  and naming a colleague as a ladder's steward is an ordinary act.

Also checked: no `WRITES` statement assigns any of the 33 columns from anything
other than `current_setting`. Guard 2 finds nothing today because there is nothing
to find, not because its list is adequate.

## Why this is worth fixing

This is the codebase's signature defect twice over — a guard that does not derive
from what it guards, and **two separately maintained copies of one concept**,
which is what S257 fixed yesterday on the download path. The costs differ only in
which direction they fail: a short list lets an actor column through, and there is
no test that would say so.

Per S254's lesson: a guard that enumerates a hand-written registry cannot see
something nobody registered.

## The fix

**Derive the set from the schema; keep the declaration, but make it prove itself.**

1. A helper reads `backend/db/migrations/` and returns every column that holds a
   person's name. The migrations are the source of truth — a new one adding
   `escalated_by` changes the answer with no edit here.
2. `NEVER_FROM_THE_BODY` stays a declaration in `writes.py` — it is what the
   doorway asserts about itself, and a runtime module must not read the migrations
   folder to answer a question about its own fields. It gains the seventeen.
3. A new test holds the declaration against the derived set and fails naming any
   column the schema has and the declaration does not. `owner` is the single
   named exception, with the reasoning above beside it, so the exception is a
   decision on the record rather than a silence.
4. `test_any_recorded_actor_comes_from_the_connection` drops its private list and
   uses the same derived set. One concept, one source.

## Validation

* The derived-vs-declared test must FAIL if a name is removed from
  `NEVER_FROM_THE_BODY` — proved by removing one.
* It must FAIL for a newly added person column that nobody declared — proved by
  adding a column to a scratch copy of the migrations, not to the real ones.
* Existing `test_no_write_takes_an_actor_from_the_body` and
  `test_any_recorded_actor_comes_from_the_connection` still pass for all writes.
* Full doorway suite.

No migration is edited, so the mutation harness rule does not apply — but a
mutation row is added for the derivation, since a guard that is now one copy is a
guard somebody can soften in one edit.
