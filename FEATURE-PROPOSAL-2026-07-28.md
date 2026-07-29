# Proposal — improvements and new features — 2026-07-28

**Status: PROPOSED. Nothing here is started, decided, or committed.**

**What this is.** A proposal for what to build next, written after reading the current state of the
repository. It deliberately does **not** repeat anything already in the approved roadmap
(`NEW-CAPABILITIES-WORK-PACKAGES-2026-07-27.md`, NC-01 through NC-26) — negotiation, receiving
documents, the AI pipeline, compliance exports and the library builder are all covered there and
need no second proposal. What follows is the rest: risks worth closing, decisions you already made
that nobody is building, and new capabilities with no owner anywhere.

Ordered by recommendation, strongest first.

---

## Part 1 — Trust and safety improvements (small, cheap, do first)

### 1. Check the second verification harness — one hour

The Python checking harness turned out to be silently broken: it showed nothing wrong because it
was checking nothing at all (B10, now fixed). The **database-side harness has never been examined
for the same rot**, and it runs first in `npm run verify`. Until someone spends the hour, we do not
actually know whether the database's protections are being tested. The status report calls this
"the largest remaining unknown," and I agree. **Cost: about an hour. Risk if skipped: every
database guarantee may be unverified and we would not know.**

### 2. Stop storing sign-in keys in readable form (audit finding A-2)

Anyone who can read the sessions table today can read every active sign-in key and impersonate any
user. The audit already priced this: roughly ten lines of code now, versus forcing everyone to sign
in again if it is done later. The audit called it the one worth doing soonest, and it has been open
since. **Cost: small. Risk if skipped: one database leak becomes full account takeover.**

### 3. Give session expiry a second leg (audit finding A-3)

Whether an expired sign-in actually stops working currently rests on a single housekeeping
statement. If that one statement ever stops running, expired sessions keep working and nothing
alerts anyone. The fix is to also check expiry at the moment of use, so the housekeeping is a
cleanup, not the control. **Cost: small.**

### 4. Two test gaps already written down

- A database-side test for the sessions table — the A-1 fix is currently guarded from Python only.
- The concurrency test that was quietly weakened (finding D-2) — restore it or retire it with a
  written reason, but not the silent middle.

---

## Part 2 — Decisions you made that nobody is building

### 5. Confidential deals — the shape is settled, the work is unowned

You settled this in two passes on 2026-07-27 (open-questions §12): openness stays the default; a
deal can be marked confidential; a marked deal still *appears* in colleagues' lists but shows
nothing about itself; company-wide counts become a management view; and the Auditor reaching a
confidential deal is itself a recorded act. That is a real capability touching the deal record,
every list screen, and the concession family — and it is in no work package anywhere. It also
carries three small open choices you already named (who approves the Auditor's look; per-deal or
standing; whether it expires). **Recommendation: give it its own plan now, before the deal record
grows more screens that would all need reworking later.**

### 6. Review routing — who gets the ticket

Deferred question §6, with the minimum answer already written: a shared queue any Legal reviewer
can claim from, with escalation to the clause's named reviewer if unclaimed. This matters more than
it looks, because the reviewer's name is part of the permanent record a regulator walks backwards.
Today a ticket goes nowhere in particular. The minimum answer is enough to build and refine with
real volume. **Cost: modest — one queue, one claim act, one escalation timer.**

### 7. A place for lawyers to write the checking rules

Decided (§5): attorneys author conflict rules through a Legal gate, not developers through code.
Nothing of that surface exists, and the rules are currently effectively code. The open part —
how expressive the rule language should be — has a safe starting answer: **begin with a small
fixed set of sentence shapes** ("if a clause from category A is present and one from category B is
present, raise a finding of severity S"), gate them exactly like clause text, and widen the grammar
only when a real rule cannot be said. This also unblocks one of the six governed acts (rule
editing) that WP-U13 is stuck on. *(The rules' wording is content and stays placeholder — this is
the surface, not the rules.)*

---

## Part 3 — New capabilities (bigger, need a decision to start)

### 8. Obligations — turn a signed contract into a to-do list

The architecture calls obligations "the heart of lifecycle management," and they are the largest
built-nothing in the product: architected in full, zero code. The idea is that because every
contract is assembled from known clauses by ID, the system can *derive* what the company owes and
is owed — payment dates, notice windows, renewal deadlines — without anyone reading prose. The
visible product is a calendar and reminder stream: "this agreement auto-renews in 60 days; notice
is due by this date." **This is the feature that makes the system valuable after signature instead
of only before it**, and it is the natural next headline once the negotiation roadmap lands. The
obligation *templates* are content and stay placeholder; the machinery is ours.

### 9. Getting signatures — e-signature integration

The pipeline ends at a document file. Signing happens somewhere we cannot see, which means the
system cannot honestly know its own most important date — when an agreement became real. NC-07
teaches the system to *receive* a document; this is the other half: send for signature, track who
has signed, and record execution the moment it happens rather than when someone remembers to say
so. Also the trigger the obligations feature (item 8) hangs off.

### 10. Somewhere real to run — deployment, backups, and proof the record survives

Nothing is deployed; the product runs on a developer's machine. Before any real user touches it,
it needs a home, and — given this product's entire promise is the permanence of its record — a
tested backup with a **rehearsed restore**, plus a scheduled self-check that walks the
tamper-evident audit chain and confirms it intact. A record that claims permanence should be able
to prove, on a schedule, that it still holds. **Recommendation: treat "restore rehearsed, chain
self-check green" as the definition of deployed, not an afterthought.**

### 11. Notifications — one small service, several settled decisions depend on it

At least three settled decisions quietly assume the system can tap someone on the shoulder: the
countersign wait is "kept short by a daily nudge" (U6), expiring clauses warn every round, and
review routing (item 6) needs an escalation timer. None of that exists — nothing in the system can
notify anyone of anything. One small notification piece (even just daily email digests per role)
serves all of them at once. Without it, every waiting-on-a-person control depends on that person
remembering to look.

---

## Deliberately not proposed

- **Anything in NC-01 – NC-26** — already specified and approved.
- **Real row-level security on the five run-evidence tables** — already deferred with a written
  reason and a tripwire; the stated revisit condition (someone builds a screen taking a snapshot
  id) has not occurred.
- **The vector-search redline matcher** — decided as the production form with the keyword scorer
  kept as fallback, but the negotiation roadmap (NC-17 – NC-19) should land first so the matcher
  has real rounds to run against.
- **Anything about clause wording, rule content, or example contracts** — placeholder by standing
  rule, not blockable, not reportable.

## Recommended order

1. **Items 1–4 now** — days of work total, and item 1 is an hour that answers whether the
   database's guarantees are being checked at all.
2. **Item 5 (confidential deals) planned next** — settled decision, unowned, and cheapest before
   more screens exist.
3. **Items 8 + 9 + 10 as the next headline effort after the NC roadmap** — obligations is the
   product's second act, e-signature is its trigger, deployment is its floor.
4. **Items 6, 7, 11 slotted alongside** — small, independent, and each unblocks something already
   decided.
