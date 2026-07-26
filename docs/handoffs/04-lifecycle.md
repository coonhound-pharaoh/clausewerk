# Handoff · Lifecycle (after signature)

**State: specified; two pieces built.** Frozen executed agreements and the expiry
warnings exist. Obligations, renewals and wind-down do not.

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

## 1. The rule that governs everything here

> **A signed contract is not a living document.**

The owner corrected an earlier draft of this specification on exactly this point,
and it is the thing most easily eroded by accident. Nothing in this system
modifies an executed agreement — not a library update, not a supersession, not an
administrator. Renewal produces a **new** agreement. An amendment is a **new**
signed instrument appended to the chain. Neither edits what was signed.

Where the specification talks about clauses "changing", it always means *the next
contract will differ*, never *this one has been altered*.

Specification: [`../../LIFECYCLE-ARCHITECTURE.md`](../../LIFECYCLE-ARCHITECTURE.md).

## 2. The two clocks

The central concept, and the thing the original architecture had no model for:

| | Clause validity | Agreement term |
|---|---|---|
| Governs | Whether wording may be used in a *new* contract | Whether an *executed* contract is in force |
| Applies to | The library only | The signed file only — whose text never changes |
| On lapse | Clause leaves the selectable pool | Agreement terminates or renews |

Independent, and never to be conflated. A clause expiring in the library has no
effect on a signed contract that used it.

## 3. What exists

**`0006_executed_agreements.sql`** (16 tests):

- `cw.executed_agreement` and `cw.executed_document` — the **signed file is
  stored, byte for byte, with its SHA-256, and it is the contract.**
- `UPDATE` raises for every role including `legal_admin`; `DELETE` is a silent
  no-op.
- Amendments are appended and must name what they amend. Seq 0 is always the
  agreement itself.
- `cw.agreement_drift` reports how far the library has moved from what a contract
  carries — **reporting only**, input to a renewal conversation.
- Tests assert that superseding *and* retiring the very clauses a contract used
  leave it byte-identical.

**Expiry warnings** — in the v3 prototype: `expiryWarnings()` and `<ExpiryNotice>`
re-read the live ledger at **every negotiation round** and at **signature**.
Lapsed language blocks signing; expiring-soon warns. Not yet ported to the
backend.

### Why the bytes are stored, and not just the means to rebuild

This is the reasoning most likely to be "simplified" away by someone who has not
read it:

1. **A signed contract can contain language that is not in the library.**
   Conceded vendor wording is quarantined by design and never selectable — no
   regeneration will ever produce it.
2. **Signature adds what assembly never saw**: signature blocks, counterparts,
   initials, exhibits attached during negotiation.
3. **A reconstruction is evidence of what we believe. The file is evidence of
   what was agreed.** Only one survives a dispute.

If a regeneration and the stored file ever disagree, **the file wins and the
disagreement is an incident.**

## 4. What is specified and not built

**Obligation templates — the keystone, and the biggest piece.**

What a contract obliges us to do is declared **on the approved clause**, authored
by Legal at approval time. Registering a signed contract is then a *lookup*, not
an interpretation.

> This is what makes the product different. Conventional contract-management
> tools read finished contracts and guess what they mean. We never have to:
> every sentence got there by referencing an approved clause, so we already know
> exactly what we committed to. **No software is ever asked to read a contract
> and decide what it requires.**

Also unbuilt: obligation instances and their state machine; the scheduler
(replayable — a missed run must not mean a missed obligation); evidence capture;
entitlement tracking (rights *we* hold — where most CLM value leaks); renewal
drift reports; amendment composition; wind-down and survival obligations; the
retention clock.

## 5. Traps

- **Do not let anything write to `cw.executed_*`.** Mutations guard this. If you
  find yourself needing to update an executed row, the model is wrong, not the
  constraint.
- **Survival obligations outlive termination.** An agreement with an unmet
  data-deletion duty is *not* closed, however long ago it terminated. Closing on
  termination date is the classic failure.
- **Timezone and business-day semantics must be explicit per obligation.** "30
  days' notice" is a legal quantity, not a `setDate()` call.
- **Third-party paper has no clause references**, so obligations cannot be
  derived for it. The negotiation workstream now atomises supplier paper, but
  those units are AI-derived — if they ever feed obligations they must be
  separately badged and never mixed with declared-by-ID ones.
- `cw.agreement` is still the minimal subset concessions needed. Extending it is
  your job; `cw.run` already holds the snapshot pin.

## 6. Open questions

From LCMA §10:

1. **Obligation-template authoring is a large Legal backlog** — every clause in a
   ~500-clause library needs its obligations written before registration is
   useful. Phasing is a rollout question with no obvious answer.
2. Breach is detectable but not adjudicated. Whether the system *asserts* breach
   is a legal decision well beyond a status field.
3. Entitlement valuation needs commercial data the system does not hold.
4. MSA-plus-SOW structures: obligations on the master, attaching to work under
   the children. Composition rule unspecified.

## 7. Where to start

1. Read the LCMA end to end, then
   [ADR-0006](../decisions/ADR-0006-clause-expiry-is-computed-not-stored.md) —
   immutable versions are the precondition for all of it.
2. `node backend/db/test/executed.test.mjs` — shows the frozen half working.
3. **Obligation templates first**, as a field on the clause. Everything
   downstream is arithmetic once they exist, and nothing downstream is possible
   until they do.
4. Port `expiryWarnings()` from the prototype into the backend engine — small,
   self-contained, and the warnings are already specified.
