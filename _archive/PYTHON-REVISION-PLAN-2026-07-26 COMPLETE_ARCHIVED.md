# Making Python the primary language, where it is the right one

**A revision plan for the owner. Written 2026-07-26, against commit `bd8fcf6`.**

The gap this closes is described in
[`PYTHON-DIFF-REPORT-2026-07-26.md`](PYTHON-DIFF-REPORT-2026-07-26.md). Read that
first if you want to know *what* is missing; this says *how* and *in what order*.

---

## Read this first — the shape of the answer

**Python everywhere the system thinks. JavaScript everywhere it displays. The
database keeps the rules.**

That is the whole principle, and it decides every question below without needing
a case-by-case argument.

| Layer | Language | Why |
|---|---|---|
| The rules about who may do what | **The database** | Already there, tested by attacking it. Never duplicated anywhere else. |
| The contract engine | **Python** | Already there. The half that must be provably correct. |
| The front door and the endpoints | **Python** | Same reason. Joins the engine rather than being split from it. |
| The screens | **JavaScript** | Screens belong in the browser's language. |
| The schema test suites | **JavaScript, left alone** | They test the database, which is the same whichever language asks. |

**What "primary" does not mean.** It does not mean rewriting things that work and
are in the right language already. Two candidates that people will suggest and
that this plan explicitly rejects are listed in §5.

---

## The order, and why it is this order

Six packages. Each one leaves the system working — there is no point at which
both versions are half-finished.

### P1 · Tell the other session (today, before anything else)

Not code. Another session is actively adding to the JavaScript service; every
hour both run, the work to be redone grows.

**Done when:** whoever drives that session knows the decision, and new endpoint
work has stopped landing in JavaScript. Their in-flight work is not wasted —
migrations are shared, and their endpoints are the specification the Python must
match.

**This is the highest-value item on the list and it costs nothing.**

---

### P2 · The 25 reads

Port `service/app.mjs`. Each entry is a database statement, a route, and a note
naming the rule that decides who may see it.

**Why first among the code:** reads cannot damage anything. It is the cheapest way
to get the whole shape of the system into Python and find out what the port
actually costs, before anything irreversible.

**Carried over deliberately:** the note on each entry saying which database rule
governs it. That note is why a reader can answer "why can this person see this?"
without reading the whole schema.

**Done when:** every read returns what the JavaScript returned, for at least two
different roles, and a refusal is still a refusal rather than an empty list.

---

### P3 · The 27 writes

Port `service/mutations.mjs`. Mechanical, with three rules that must survive
verbatim, because each exists for a reason somebody paid for:

1. **One act per endpoint.** No convenience endpoint bundles several recorded
   acts. An auditor reading the chain afterwards cannot tell which of a bundle a
   person actually looked at.
2. **Never retry a refusal.** Not as another role, not on another connection, not
   at all. A refusal is the system working. Re-issuing a refused write to "make
   the demo work" is the single most damaging line anybody could add.
3. **No permission checks.** The database decides. A check that seems necessary
   means the database is missing a rule — fix it there.

**Already structural in the Python:** no endpoint can attribute a write to
anybody but the signed-in person, because the name is bound to the connection
before the first statement and there is nowhere else to put one.

**Done when:** every write lands with the right person's name on it, refusals stay
legible, and a change that reports success while altering nothing is treated as a
failure.

---

### P4 · The web server, and serving the screens

Port `service/server.mjs`. Small. The screens are static files; the server hands
them out and answers the endpoints.

**Done when:** the six workspaces load and work against the Python, with the
existing screens unchanged. This is the first moment the whole thing is real.

---

### P5 · Retire the JavaScript service

Delete `backend/service/`. Move its 30 tests across as they are re-proved, not
transcribed — see §4.

**Not before P4 passes.** Two working versions is untidy; zero is an outage.

**Done when:** `backend/service/` is gone, the acceptance check is green, and the
seeded walkthrough runs end to end on Python.

---

### P6 · Connect the contract engine — the one that is new work

The engine is 4,604 lines of tested Python that **nothing calls**. This is the
gap that exists in neither language, and it is the reason the language decision
pays for itself.

First and smallest: wire `check_manifest`, the check that stops an invented risk
category reaching a contract. It is defined, tested, and has no caller.

**Done when:** a risk category the library does not have is refused on the way in,
by the engine, through the doorway, with the refusal recorded.

**Worth stating plainly:** this is the first time the two halves of the product
are connected to each other. Everything before it is moving existing work; this
is the part that adds something the system has never had.

---

## 4. How the tests move — the part that needs judgement

The 30 JavaScript tests are the written record of what this system promises.

**Re-prove them; do not transcribe them.** Each one is a chance to ask whether the
promise still holds, and several can now be made stronger than they were, because
the old database could not support them:

| Promise | Was | Can now be |
|---|---|---|
| An identity does not outlive its request | Unprovable — one connection, nothing to leak to | **Done, and the sharpest test in the suite** |
| Two writers cannot split the audit history | Shipped on reasoning alone, admitted in the code | Testable — real concurrency exists |
| The audit checkpoint resists tampering | Anchored but unsigned, admitted in the code | Sealable — the signing tools are available |

The last two are not in this plan's scope; they belong to whoever owns the
database. They are listed because moving to standard PostgreSQL is what made them
possible, and they should not be quietly forgotten.

**The bar every ported test must clear:** break the thing it names, and confirm
*that* test fails — not a neighbour. A guarantee caught by the wrong test is a
guarantee nobody is actually watching.

---

## 5. What this plan deliberately does not do

**It does not rewrite the schema test suites.** About 4,000 lines of JavaScript
that test the database itself. The database behaves identically whichever
language asks, so rewriting them would re-prove what is proven and risk losing
detail earned by attacking the schema. They stay, and they stay green.

**It does not rewrite the screens.** 2,701 lines of JavaScript, and the right
language for them. "Primary" is about where the system thinks, not about
uniformity for its own sake.

**It does not touch the contract engine.** It is already Python, already tested,
and P6 connects it rather than changing it.

---

## 6. Risks

1. **Both sessions keep building in opposite directions.** Highest risk on the
   list, and P1 is the entire control. It is a conversation, not an engineering
   problem.

2. **A refusal gets softened during the port.** The likeliest quiet damage: an
   endpoint that returns an empty list where the database refused, so the screen
   says "nothing here" instead of "you may not see this". Control: it is already a
   test, and every ported endpoint must keep the two outcomes distinguishable.

3. **A permission check creeps into the Python.** It starts as one convenience
   and ends as a second set of rules that disagrees with the first — and the
   disagreement is the hole. Control: any proposed check is treated as a missing
   database rule and fixed there.

4. **A privileged connection appears "temporarily".** Already guarded: the
   doorway offers no way to reach one, and a test fails if the connection is ever
   privileged. The guard must survive the port.

5. **Volume.** Fifty-two endpoints is a lot of small, dull work, and dull work is
   where typos live. Control: reads before writes, and each endpoint checked
   against the database as two different people.

---

## 7. What it buys, in one sentence each

- **P1** stops two teams undoing each other.
- **P2–P4** move what exists into the language you chose, without a day where
  nothing works.
- **P5** removes the version that queues every customer behind one connection.
- **P6** connects the contract engine to the running system for the first time —
  the only item here that adds something the product has never had.
