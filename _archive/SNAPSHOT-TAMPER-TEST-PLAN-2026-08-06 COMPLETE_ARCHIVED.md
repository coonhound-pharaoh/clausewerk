# A test that tampers with a snapshot the schema now protects — plan (2026-08-06) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-06.
**Area:** `test_documents.py::test_a_snapshot_that_does_not_rebuild_produces_no_document`.

---

## In one paragraph, for a business reader

A run points at a frozen copy of the clause library, so the same run always
produces the same document. One test proves the system refuses to produce a
document when that frozen copy has been meddled with. To do that, the test has
to meddle with it — and **it can no longer do so, because the system was
strengthened to make meddling impossible.** The test now fails, not because
anything is broken, but because the hole it was reaching through has been
bricked up. Left alone it reads as a real failure and would eventually be
"fixed" by someone weakening either the test or the protection.

## The evidence

Red on clean `HEAD` (1198af1):

```
psycopg.errors.RaiseException: a referenced snapshot cannot gain or change members
CONTEXT: PL/pgSQL function freeze_referenced_pin_member() line 18 at RAISE
```

The failure is in the test's own setup, not in the endpoint under test. The
run itself was created successfully (`POST /api/runs → 200`).

## Which is wrong, the schema or the test? The schema is right

Migration `0058_run_pins_freeze_when_referenced.sql` says why, in its opening
lines:

> "The original append-only guards prevented edits and deletes while still
> allowing a working role to add a new member afterwards, permanently changing
> the replay input of every run already pointing at the id."

That is a serious defect and 0058 closed it. The rule stays exactly as it is.
The test's setup — a Legal admin inserting a member into a snapshot a run
already references — is now refused, correctly, for every role.

## The fix

Rewrite the test in **the shape this same file already uses one test below it**.
`test_a_stored_member_with_no_clause_row_refuses_with_the_engine_s_sentence`
faced exactly this situation and handled it honestly: it records that the
condition cannot be induced through the front door, explains why that is the
schema working, and then proves the **wiring** — that when the engine does
report the problem, the doorway turns it into a 409 with the right sentence and
no bytes.

So: state that a referenced snapshot can no longer gain members and name 0058 as
the reason, then drive `snapshot_from_rows` to return a snapshot whose id
differs from the stored one, and keep every assertion that matters:

- status 409, `kind: refused_on_merits`
- the reason names **both** ids — "it does not rebuild" with no numbers is
  unactionable, which was the original test's whole point
- no bytes are produced

The guarantee is unchanged. Only the way the condition is reached moves, because
the old way is now a thing the system forbids.

## What is NOT done, and why it matters

The tampering is **not** re-induced at owner level to keep the old test working.
The test's own comment already refuses that: *"a fixture that reaches past the
row rules to break something can break things the system would never allow."*
Reaching past 0058 to prove a defence against something 0058 prevents would be
testing a state the product cannot be in.

## How it is proved

`pytest doorway/test_documents.py` green, and the assertions still fail if the
mismatch branch stops naming both ids — checked by temporarily reverting that
branch's message, not assumed.
