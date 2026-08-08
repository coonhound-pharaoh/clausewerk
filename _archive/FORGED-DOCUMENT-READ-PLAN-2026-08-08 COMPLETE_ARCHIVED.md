# A requester can write a document-read into the audit chain for a deal they cannot see — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** Migration 0072 restates the round's read policy inside the
function and builds every field of the event from the record. Proved by breaking
it: without 0072, three new tests fail, one naming the invented hash on the chain.

**288/288 mutations · 39/39 db suites.**

## What is wrong, demonstrated

`cw.record_document_read` is SECURITY DEFINER and callable by a requester, a
legal reviewer, a legal admin and the auditor. It takes a negotiation id, a round
number, a document id, a SHA-256, a byte size and a direction — **all six from
the caller** — and writes an event onto `cw.audit_event`.

**It checks nothing.** Proved on a scratch database. Rita is a requester; the
negotiation belongs to Ben:

    select count(*) from cw.negotiation where negotiation_id = 4   ->  0
      (Rita cannot see it at all — the policy works)

    select cw.record_document_read(4, 99, 12345, 'ffff…ff', 999999, 'received')
      ->  ACCEPTED

    cw.audit_event now holds, permanently:
      seq 7 | rita@x | requester | received_document_read
             | subject negotiation:4
             | round_no 99, document_id 12345, sha256 ffff…ff, byte_size 999999

Round 99 does not exist. Document 12345 does not exist. The hash is invented.
**And `cw.audit_verify()` returns clean**, because the chain guarantees that
nothing was altered or deleted — not that anything recorded is true.

## Why this one and not the others

Every other SECURITY DEFINER function in this family restates its own scoping,
and `cw.socialise_override_request` says why in its own comment:

> SECURITY DEFINER bypasses the request table's row policy, so the function must
> restate the grant's two intended branches itself.

Checked all 38 definer functions. Of the ones callable by an application role and
capable of a write, **`record_document_read` is the only one with no caller
check.** The rest of the "unchecked" list is deliberate and correct: chain
verification (`audit_verify`, `audit_anchor_check`) must see the whole chain,
role facts (`is_administrator`, `may_redact`) are public by 0013, and the
remainder are granted only to roles whose read policies are unconditional.

**It LOOKS checked, which is why it survived a sweep.** The body opens with a
`case current_setting('role', true)` mapping the caller's role — so a grep for
role-awareness finds it. That expression fills the `actor_role` COLUMN. It never
decides anything. This is [[S255]] exactly: a lookup mistaken for a gate.

## What it costs, stated honestly

**There is no browser path to it.** The doorway has no arbitrary-SQL endpoint;
the only caller is `redlines.fetch`, which resolves the round under the caller's
own row rules first and passes what the database was willing to show it. So this
is defence in depth, not a live exploit from the web.

That is not a reason to leave it, for three reasons:

1. **It is the audit chain.** 0065 opened this function precisely so the auditor
   would not need INSERT on `cw.audit_event` — its own note says granting that
   outright "trades the integrity of the record they audit for one download." The
   door was made narrow in EVENT TYPE and left wide open in CONTENT.
2. **The whole design is that the database refuses independently of the
   doorway.** `db.py`'s header: there is no privileged connection in the serving
   path, and every rule is the database's. A function that trusts its arguments
   is a hole in that promise wherever the next caller comes from.
3. **A false event is worse than a missing one.** An auditor reconciling reads
   against documents finds events pointing at negotiations the actor cannot see,
   with hashes matching nothing — and cannot tell a bug from a forgery.

## The fix

**The function records what it VERIFIED, not what it was told.**

Migration 0072 rewrites `cw.record_document_read` to:

1. Restate `cw.negotiation_round`'s `read_scoped` policy — Legal and the auditor
   in full; a requester only where `cw.owns_agreement` holds for the round's
   negotiation. A caller who could not read the round is refused with
   `insufficient_privilege`.
2. Take the round's own `document_sha256` and the stored document's `sha256` from
   the ROWS rather than the arguments, and refuse if they disagree — the same
   check `redlines.fetch` already makes, moved to where it cannot be skipped.
3. Take `byte_size` from `octet_length` of the stored bytes, and `direction` from
   the round. **Nothing recorded comes from an argument any more** except which
   round is being named.

The signature is unchanged so `redlines.py` keeps working; the extra arguments
become what the caller CLAIMS, checked against the record and then discarded.
Refusing to change the signature is deliberate — a migration that also changes a
call site is two changes, and the doorway is not where this is decided.

## Validation

* The probe above becomes a test: Rita is refused on Ben's negotiation, and the
  chain holds no event afterwards.
* A caller who CAN read the round still records normally — `redlines.fetch` must
  keep working end to end, including for the auditor, whose narrow door this is.
* A mismatched sha256 or byte size is refused rather than recorded.
* `node backend/db/test/mutation-check.mjs` — **a migration is touched, so
  CLAUDE.md requires it** — plus a new mutation row, since a gate this quiet is
  exactly the kind somebody softens.
* `node backend/db/test/run-all.mjs` and the full doorway suite.


---

## One change from the plan, and one thing the plan did not anticipate

**The plan said a mismatched SHA-256 would be REFUSED. It is ignored instead.**
`p_sha256`, `p_byte_size` and `p_direction` are now dropped on the floor and the
record's own values are written. Refusing on a claim would let a caller break
their own legitimate download by getting an argument wrong — an argument that
cannot be believed should not be able to stop anything either. What IS reconciled
is the record against itself: the round's recorded hash against the stored bytes'
own hash, which is the check `redlines.fetch` already makes.

**The existing test pinned the bug.** `received-documents.test.mjs` called the
function with negotiation 1, round 1, document 1 and byte size 4200 — none of
which existed or agreed with anything — and asserted 4200 came back out of the
chain. It passed for as long as it existed. It has been rewritten to assert the
opposite, with the history kept above it, and the suite now needs a real round
for the read to be about.
