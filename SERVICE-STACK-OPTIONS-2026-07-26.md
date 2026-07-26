# The database, and the language for the front door — a decision report

**For the owner. Written 2026-07-26, revised the same day after the owner asked
whether we should change database. Nothing is built yet; both answers are needed
before the front door is written.**

*Supersedes `SERVICE-LANGUAGE-OPTIONS-2026-07-26.md`, which answered the language
question while treating today's database as fixed. The owner has since said it is
not, and that changes part of the reasoning.*

---

## Part 1 — The database

### The short version

**We are not choosing a database. We already chose PostgreSQL, and it is the
right choice for a commercial product of this kind.** What is actually on the
table is a change of *packaging*, and I recommend making it.

Today the system runs PostgreSQL in a form that lives **inside** the program —
the whole database, compiled to run as a component. What I recommend is running
the **standard** PostgreSQL: the same database, as separate software the program
connects to, which is how essentially every commercial product runs it.

**This is not a rewrite.** The thirteen sets of rules are ordinary PostgreSQL
instructions. They run unchanged. Nothing about the six roles, the row-by-row
rules, the append-only history or the tamper-evident chain is affected.

### Why PostgreSQL is genuinely right here, not merely what we happen to have

Most systems use the database as a filing cabinet: the rules about who may do
what live in the application, and the database stores whatever it is handed. This
system is deliberately built the other way round. **The rules live in the
database.** Six real database identities, rules applied row by row, history that
physically cannot be edited or deleted, and a chain that makes tampering visible.

That design is the product's main claim, and it drastically narrows the field:

- **PostgreSQL** does all of it, and does it well. It is free of licence cost,
  available as a managed service from every major cloud provider, and has the
  largest pool of people who know it.
- **MySQL / MariaDB** — the most common alternative, but its row-by-row rules are
  weaker and much less used, so we would be relying on a lightly-trodden path for
  the part of the system that matters most.
- **Microsoft SQL Server / Oracle** — both capable of this. Both carry
  substantial per-server licence costs and pull us toward one vendor. For a
  product we intend to sell, that cost lands on every customer who self-hosts.
- **Document databases (MongoDB and similar)** — no equivalent capability at all.
  Choosing one would mean moving every rule out of the database and into the
  application, which is precisely the design this product exists to avoid.
- **SQLite and the embedded family** — no concept of separate identities with
  different privileges. Same objection, more severely.

So: PostgreSQL. If we were starting from a blank page this morning, I would
choose it again, and more confidently than usual, because this system leans on
the database far harder than most.

### What changing the packaging actually buys

Three things, and two of them are gaps the code **already admits to in writing**.

**1. The audit checkpoint can be properly sealed.** The system periodically
records how tall the history is and what its last entry fingerprints to, so that
quietly deleting recent entries becomes visible. Today that record is *anchored
but unsigned* — the migration says so plainly — because the signing tools are not
available in the in-program version. It catches accidental deletion, a partial
restore and a bad backup; it does not stop somebody with full database access
from rewriting both. Standard PostgreSQL includes the signing tools. This closes
a disclosed gap in the strongest claim the product makes.

**2. A protection that currently ships on reasoning alone becomes testable.**
There is one line guarding against two writers appending to the history at the
same moment and splitting it in two. The migration states honestly that it has
**zero test coverage and cannot get any**, because the in-program database allows
only one connection at a time. Standard PostgreSQL allows many. That guard
becomes provable rather than argued.

**3. The front door's most important test becomes real rather than simulated.**
The single test the plan says to write first takes a connection, runs a request as
one role, hands the connection back, takes it out again, and confirms it carries
no identity at all. That is the leak, reproduced deliberately. With one
connection available, we can only approximate it. With many, we test the real
thing.

Plus the ordinary commercial requirements: backups, standby copies, restoring to
a point in time, and managed hosting from any cloud vendor. None of those exist
for a database that lives inside the program.

### What it costs

Honestly, and it is not nothing:

- It becomes a piece of software to run, monitor and pay for — modest, and every
  cloud vendor sells it managed, but it is a real operating line where today
  there is none.
- Every developer and every automated build needs it installed and running before
  a single test passes. Today they need nothing.
- Tests get slower. Today the whole database suite runs in seconds because the
  database starts inside the test. That convenience is genuinely lost.

### Recommendation

**Move to standard PostgreSQL now, before the front door is written**, and keep
the in-program version available for quick local work if it stays useful. Doing
it now costs a day or so. Doing it after the front door exists means rewriting
the connection handling and every test that touches it — the most safety-critical
code in the system, changed twice.

---

## Part 2 — The language, revisited twice

### The owner's second question, and why it changed the answer

*Added after the owner asked: "Is everything in JavaScript because it is based on
the prototype I brought over? If yes, that's the opposite of the intent."*

The honest answer is a split one, and the half that is "yes" was load-bearing in
my earlier recommendation.

**The core is not JavaScript, deliberately.** The engine that must be provably
correct — resolution, validation, the run store, document handling — is Python,
and the architecture document records that as the intended shape from the
beginning. The database is PostgreSQL, also deliberate. Neither followed the
prototype.

**But the JavaScript test equipment is an accident of convenience.** The backend
README gives the reason in its own words: *"There is no database to install."*
The database tests are JavaScript because the in-program PostgreSQL is a
JavaScript component, so its tests had to be. The prototype did not cause that;
the no-installation convenience did.

**That convenience is exactly what Part 1 recommends removing.** So the argument
"stay in JavaScript because the test equipment is JavaScript" is circular: it
defends a language on the strength of tooling that exists only to support the
packaging we are dropping.

**Two corrections to what I told the owner earlier this morning**, both of which
change the decision:

1. **I overstated the cost of rebuilding the test equipment.** Counted properly,
   the role-impersonation helper is roughly forty lines of actual instructions;
   the rest of the file is explanation. What is valuable in it is the *instinct* —
   above all, that a change which reports success while changing nothing must be
   treated as a failure, which is how a real past failure went unnoticed. That
   instinct transfers as a design principle in any language. It is not forty lines
   of irreplaceable machinery.
2. **With the database argument and the test-equipment argument both gone, one
   argument for JavaScript remains:** it shares a language with the screens. That
   is a convenience, not a guarantee.

### The recommendation, changed: Python

The front door is the third piece of must-be-provably-correct engineering,
alongside the contract engine and the database rules. **It belongs with the core,
not with the screens.**

- On standard PostgreSQL it reaches the database as well as anything does.
- It calls the contract engine directly rather than running it as a separate
  program — the one advantage Python always had, now no longer outweighed.
- The project settles at **two** languages for the parts that must be correct
  (Python and the database's own), with JavaScript where it belongs: the screens.
  That boundary between the thinking and the display is a normal one, not a
  compromise.

**JavaScript remains defensible** on the shared-language-with-the-screens point
alone, and I would not call it a mistake. It is no longer what I recommend.

**Rust is unchanged and still not recommended**, for the reason set out below,
which none of this touches.

---

### What the owner's first question changed (retained for the record)

My earlier recommendation rested substantially on one fact: today's database can
only be loaded by a JavaScript program, so JavaScript was the only option that
worked without new infrastructure. **If we move to standard PostgreSQL, that
argument disappears entirely.** All three languages talk to standard PostgreSQL
equally well. I want that said plainly rather than quietly dropped.

So the case has to stand on what remains.

### What remains

**Two arguments survive, both real:**

1. **The test equipment.** There is a purpose-built helper that lets a test
   *impersonate* each of the six roles and perform a real action as that role. It
   exists because of a real past failure — an entire test suite once passed while
   testing nothing, because every test ran with owner privileges, which bypass
   every rule. It also knows the trap where a refused change reports success while
   changing nothing. It is written in JavaScript. In JavaScript we reuse it. In
   Python or Rust we rebuild it, and a rebuilt safety instrument is one nobody has
   stress-tested yet.

2. **The screens.** The interface we are about to build is JavaScript already. The
   front door and the screens talk to each other constantly. Sharing a language
   means one set of tools and one set of people.

**One argument now genuinely favours Python:** the contract engine is Python, and
a Python front door would call it directly rather than running it as a separate
program. With the database objection gone, this is a fair point. It is worth
less than it looks, though, because the project **already** calls the Python
engine from a JavaScript test today — the cross-language route is proven here,
not theoretical.

### Rust — unchanged, and worth restating

The database question does not rescue Rust, because my objection to it was never
about the database.

Rust earns its reputation by preventing a category of mistake that arises when a
program does heavy work itself and manages the computer's memory by hand. Our
front door does almost no work: it establishes who you are and hands the job to
the database. Our two failure modes are *"the wrong person's name was believed"*
and *"a rule was bypassed"*, and Rust has no opinion about either. It is an
excellent lock for a door nobody is forcing.

Rust has **one** advantage that genuinely fits, and I will not bury it: it could
make the single largest risk in the plan — somebody quietly adding a privileged
shortcut "just for one screen", which disables every rule on that path and looks
like a performance improvement in review — *impossible to build* rather than
merely certain to be caught by a test. That is better than a test. It is not
worth rebuilding the test equipment, adding a third and least-common language,
having nobody else able to maintain it, and taking the slowest route to a
provable front door. If some specific piece later turns out to need Rust, one
component can be moved then, on evidence.

### Where that left it, before the owner's second question

**JavaScript**, by a narrower margin, resting on the test equipment and the
screens rather than on the database. The section above supersedes this: the test
equipment argument did not survive scrutiny, and the recommendation is now
Python.

---

## Part 3 — What does not change, whichever way you decide

- The front door never decides what anybody is allowed to do. The database does.
- Sign-in is checked against what somebody *actually* holds — including the rule
  that a legal role means nothing until a second person countersigns it — never
  against what an administrator merely typed.
- Nothing the browser sends can influence whose name gets recorded.
- Somebody whose access is withdrawn is stopped on their very next click, not
  their next sign-in.
- A change that reports success while changing nothing is treated as a failure,
  not an outcome.
- No part of the system holds a privileged connection. Not for a dashboard count,
  not for a health check, not for one screen.

Those are the guarantees, and they are proved by the same set of tests in every
combination above.

---

## What I need from you

1. **Standard PostgreSQL?** My recommendation is yes, and now rather than later.
2. **Which language for the front door?** **Python recommended** — it belongs
   with the core, not with the screens. JavaScript defensible. Rust not
   recommended.

Both answers go into `memory.md` as recorded decisions, and then I start on the
doorway.
