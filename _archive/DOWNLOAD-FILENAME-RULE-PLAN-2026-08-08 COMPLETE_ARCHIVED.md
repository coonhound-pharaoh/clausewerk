# A document with an ordinary foreign name could not be downloaded — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** One rule (`app.transportable_filename`), asked by the transport
and by both producers. Proved by breaking it: with the old narrow condition
restored, four redline tests fail naming `'Contrat Été.docx'` and three document
tests fail. A mutation row was added; all 46 patterns resolve exactly once.
Full doorway suite: **1502 passed**.

## What is wrong

The counterparty's document is stored under **the name the counterparty gave it**,
unedited. That is deliberate and right: a system that quietly renames somebody's
file is a system that can be argued with about what the file was called.

Handing it back out, two different rules decide whether that name is usable, and
they do not agree.

* `redlines.fetch` (the producer) falls back to a generated name only when the
  stored one is empty, or carries a quote or a line break.
* `server._send_download` (the transport) refuses anything outside plain
  printable ASCII — **any accented letter, any non-Latin script, any backslash
  or tab** — and answers `500 {"error": "the service failed"}`.

So a document called `Contrat Été.docx`, `合同.docx`, or `MSA v2\final.docx` is
accepted on the way in, stored, recorded on the audit chain, and then **cannot be
retrieved at all**. The person asking is told the service broke. Nothing is
broken; the two halves simply disagree about what a name may be.

`documents.py` has the same gap one step earlier: it refuses a run name carrying a
quote or a line break, and composes `{run_id}.docx` — so a run id with an accent
in it reaches the transport and gets the same 500.

**The transport is not the thing that is wrong.** Its rule is correct and already
proved (`test_server.py::test_a_download_filename_cannot_change_the_response_headers`).
The defect is that the producers guess at that rule instead of asking it.

## Why it counts as a defect and not content

This is not the words on a screen. It is a stored document that the system
accepted and then cannot give back, reported as a fault in the service. Per
`CLAUDE.md` the placeholder rule covers clause language and example contracts,
not whether a recorded document is retrievable.

## The fix

**One rule, in one place, asked by everybody** — the recurring defect in this
codebase is a guard that has drifted from what it guards
(`memory.md`, "guards point at moved code"), and two hand-copied spellings of a
filename rule is that defect waiting to happen.

1. `app.py` owns the `Download` type, so it owns what a `Download` filename may
   be. Add `transportable_filename(name)` beside it, carrying the reasoning.
2. `server._send_download` calls it instead of spelling the rule inline. Its
   behaviour does not change — the 500 backstop stays, because a producer that
   ignores the rule is still our bug and must not reach the wire.
3. `redlines.fetch` calls it on the stored name. A name the transport cannot
   carry now falls back to the generated `negotiation-N-round-M`, which is what
   the fallback was already for. **The document downloads.**
4. `documents.contract` calls it on the composed `{run_id}.docx` rather than on a
   hand-listed subset of characters, so its 400 covers the same set.

## Validation

* A new test asserts the producers and the transport agree — that every name
  `redlines` hands on is one `_send_download` will accept. Written against the
  shared predicate, not against a copied character list, so it cannot pass by
  agreeing with a stale copy.
* A new test drives a stored document with a non-ASCII name end to end and
  asserts **200 and bytes**, not 500.
* `test_server.py::test_a_download_filename_cannot_change_the_response_headers`
  must still pass unchanged — the transport backstop is not being relaxed.
* Full doorway suite.

No migration is touched, so the mutation harness rule does not apply here.
