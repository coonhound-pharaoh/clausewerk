# Work Package Package — Python as the primary language

**Written 2026-07-26, against commit `648d2cf`. Status: DRAFT — awaiting owner approval (Gate 3).**

Source plan: [`PYTHON-REVISION-PLAN-2026-07-26.md`](PYTHON-REVISION-PLAN-2026-07-26.md)
Gap evidence: [`PYTHON-DIFF-REPORT-2026-07-26.md`](PYTHON-DIFF-REPORT-2026-07-26.md)

Six packages, in strict dependency order. Each one leaves the system working.
IDs are stable — do not renumber once implementation begins.

| ID | Title | Depends on | Size | Risk |
|---|---|---|---|---|
| WP-P1 | Tell the other session | nothing | a conversation | highest value, zero cost |
| WP-P2 | Port the 25 reads | WP-P1 | ~380 lines | low |
| WP-P3 | Port the 27 writes | WP-P2 | ~390 lines | medium — three rules must survive verbatim |
| WP-P4 | Port the web server and serve the screens | WP-P3 | ~234 lines | low |
| WP-P5 | Retire the JavaScript service | WP-P4 **passed** | deletion + 30 re-proved tests | medium — the tests carry the promises |
| WP-P6 | Connect the contract engine | WP-P5 | new work, small first step | medium — the only genuinely new piece |

**The principle every package answers to:** Python everywhere the system thinks.
JavaScript everywhere it displays. The database keeps the rules.

---

## WP-P1 · Tell the other session

### Objective
Stop new endpoint work landing in JavaScript, today. Another session is actively
adding to `backend/service/`; every hour both sessions run, the redo pile grows.

### Deliverables
- The language decision communicated to whoever drives the other session.
- Confirmation that their in-flight work is redirected: migrations continue
  (shared by both languages); new endpoints stop.
- A decision record in `memory.md`: the decision, the date, and the reason.

### Dependencies
None. This blocks nothing and is blocked by nothing — which is exactly why it
goes first.

### Anti-patterns
**Common failure modes**
- Treating this as an engineering task and burying it under WP-P2. It is a
  conversation; it costs nothing; it is the highest-value item on the list.
- Framing the other session's work as wasted. It is not — their endpoints are
  the specification the Python must match, and their migrations are shared.

**Critical failure mode**
- *Not doing it.* Both sessions keep building in opposite directions, and every
  package below gets more expensive by the hour. This is Risk #1 in the plan.

### Testing requirements
None — there is nothing to test. Done when the other session's driver confirms
they know, and no new JavaScript endpoint commits appear after that point.

### Documentation requirements
- The decision record in `memory.md` (decision, rationale, date).
- Nothing else. Do not write a migration guide yet — WP-P2 will discover what
  one needs to say.

---

## WP-P2 · Port the 25 reads

### Objective
Move every read endpoint from `backend/service/app.mjs` (376 lines) into the
Python doorway. Reads first because reads cannot damage anything — this is the
cheapest way to learn what the whole port actually costs.

### Deliverables
- A Python module under `backend/doorway/` carrying all 25 reads: each one a
  database statement plus a route, nothing more.
- **Carried over verbatim:** the note on each endpoint naming which database
  rule decides who may see it. That note is why a reader can answer "why can
  this person see this?" without reading the whole schema.
- The JavaScript service left untouched and running — both versions coexist
  until WP-P5.

### Dependencies
WP-P1. Porting endpoints while another session is still adding them is the
race this whole sequence exists to prevent.

### Anti-patterns
**Common failure modes**
- Dropping the governing-rule notes as "just comments." They are the map from
  endpoint to rule and they are a named deliverable.
- "Improving" an endpoint mid-port. The JavaScript is the specification; match
  it exactly, note improvements for later.
- Batch-porting all 25 before checking one. Port a few, verify against the
  JavaScript, then continue — volume is where typos live (plan Risk #5).

**Critical failure modes**
- *A refusal softened into an empty list.* The screen would say "nothing here"
  instead of "you may not see this." The two outcomes must stay distinguishable
  on every endpoint (plan Risk #2).
- *A permission check added in Python.* There is not one `if the role is X` in
  the JavaScript, and there must not be one in the Python. If a check seems
  necessary, the database is missing a rule — fix it there (plan Risk #3).

### Testing requirements
- Every read returns what the JavaScript returns, for **at least two different
  roles** — same query, both languages, compared.
- A refusal is still a refusal: for each read a role may not use, confirm the
  Python surfaces the database's refusal rather than an empty result.
- The existing doorway tests (identity, refusals, prohibitions) stay green —
  the guard against a privileged connection must survive the port (plan Risk #4).

### Documentation requirements
- The governing-rule note on every endpoint (this is documentation living in
  the code, and it is the package's second deliverable).
- A short running note of any behaviour difference discovered between the two
  languages — each one is either a Python bug to fix or a JavaScript bug to
  record, never to silently paper over.

---

## WP-P3 · Port the 27 writes

### Objective
Move every write endpoint from `backend/service/mutations.mjs` (386 lines) into
the Python doorway. Mechanical work with three rules that must survive
verbatim, because each exists for a reason somebody paid for.

### Deliverables
- A Python module under `backend/doorway/` carrying all 27 writes.
- The three rules, intact:
  1. **One act per endpoint.** No convenience endpoint bundles several recorded
     acts — an auditor must be able to tell exactly which act a person took.
  2. **Never retry a refusal.** Not as another role, not on another connection,
     not at all. A refusal is the system working.
  3. **No permission checks.** The database decides.
- Attribution stays structural: the signed-in person's name is bound to the
  connection before the first statement, and there is nowhere else to put one.

### Dependencies
WP-P2. The reads prove the plumbing; the writes trust it.

### Anti-patterns
**Common failure modes**
- Bundling two acts into one endpoint "for convenience." Rule 1 exists so the
  audit chain stays legible.
- Reporting success while altering nothing. A write that changes nothing is a
  failure and must be treated as one.
- Losing focus in the volume. Twenty-seven dull endpoints is where typos live —
  check each one against the database as two different people before moving on.

**Critical failure modes**
- *Re-issuing a refused write to "make the demo work."* The plan calls this the
  single most damaging line anybody could add. There is no version of it that
  is acceptable.
- *A write attributed to anyone but the signed-in person.* The structure makes
  this impossible today; any change that opens a second place to put a name
  breaks the audit record's meaning.

### Testing requirements
- Every write lands with the right person's name on it — verified from the
  audit record, not from the endpoint's response.
- Refusals stay legible: for each write, at least one role that may not perform
  it is tried, and the refusal is confirmed to be a refusal.
- A no-op "success" is caught: a write reporting success while altering nothing
  fails the test.
- The identity and prohibition test suites in `backend/doorway/` stay green.

### Documentation requirements
- The governing-rule note on each write, as in WP-P2.
- The three verbatim rules stated once at the top of the module, so the next
  person adding an endpoint reads them before they type.

---

## WP-P4 · Port the web server and serve the screens

### Objective
Port `backend/service/server.mjs` (134 lines): a small Python web server that
serves the screens as static files and answers the endpoints from WP-P2/P3.
This is the first moment the whole thing is real.

### Deliverables
- The Python web server, serving the existing screens (`prototype/v4/`)
  **unchanged** — not one line of the screens is touched.
- The demo seeding ported (`backend/service/seed-demo.mjs`, ~100 lines): six
  people, one per workspace, so the walkthrough can be walked.
- All six workspaces loading and working against the Python service.

### Dependencies
WP-P3. The server is only real when it has all 52 endpoints to answer with.

### Anti-patterns
**Common failure modes**
- Rewriting or "modernising" the screens while wiring them up. The screens are
  2,701 lines of JavaScript in the right language already; the plan explicitly
  rejects touching them (§5).
- Serving the screens but quietly stubbing endpoints that don't work yet. If a
  workspace doesn't fully work, the package is not done.

**Critical failure mode**
- *A privileged database connection appearing "temporarily"* to get a stubborn
  workspace rendering. The doorway offers no way to reach one and a test fails
  if a connection is ever privileged — that guard must survive (plan Risk #4).

### Testing requirements
- The six workspaces load and work end to end against Python, walked as the six
  seeded people.
- The existing 30 JavaScript service tests still pass against the JavaScript
  service — proof the spec didn't drift while the Python caught up.
- The privileged-connection test stays green.

### Documentation requirements
- How to start the Python service and run the seeded walkthrough — one short
  section, replacing the JavaScript instructions when WP-P5 lands.

---

## WP-P5 · Retire the JavaScript service

### Objective
Delete `backend/service/` and carry its 30 tests across as **re-proved**
promises, not transcriptions. Two working versions is untidy; zero is an
outage — which is why this waits for WP-P4 to pass.

### Deliverables
- `backend/service/` gone: `app.mjs`, `mutations.mjs`, `server.mjs`, `db.mjs`,
  `sessions.mjs`, `seed-demo.mjs`. (`db.mjs` and `sessions.mjs` are already
  superseded by `doorway/db.py` and `doorway/sessions.py` — delete, nothing to
  port.)
- The 30 tests from `backend/db/test/service.test.mjs` re-proved in Python.
  Each is a chance to ask whether the promise still holds — not a line-by-line
  translation.
- The schema test suites in `backend/db/test/` (~4,000 lines) **left alone and
  green**. They test the database, which behaves identically whichever language
  asks.

### Dependencies
WP-P4 **passed** — six workspaces working on Python, walkthrough green. Not
merely "mostly working."

### Anti-patterns
**Common failure modes**
- Transcribing tests instead of re-proving them. A transcribed test carries the
  old test's blind spots into the new suite unexamined.
- "Tidying up" the schema test suites while in the neighbourhood. They stay,
  they stay JavaScript, and they stay green — rewriting them would re-prove
  what is proven and risk losing detail earned by attacking the schema.

**Critical failure modes**
- *Deleting before WP-P4 passes.* Zero working versions is an outage.
- *A ported test that passes for the wrong reason.* A guarantee caught by the
  wrong test is a guarantee nobody is actually watching — see the bar below.

### Testing requirements
- **The bar every ported test must clear:** break the thing the test names, and
  confirm *that* test fails — not a neighbour. Three deliberate breakages
  proved the doorway suite this way; the same discipline applies here.
- The full acceptance check green; the seeded walkthrough runs end to end on
  Python; the schema suites green and untouched.

### Documentation requirements
- Note in `memory.md` recording the retirement: what was deleted, what the
  tests became, and the two promises now *possible* but out of scope — real
  concurrency for the two-writers test and signing the audit checkpoint. Both
  belong to whoever owns the database; they are recorded so they are not
  quietly forgotten (plan §4).

---

## WP-P6 · Connect the contract engine

### Objective
Give the contract engine its first caller. The engine is 4,604 lines of tested
Python that nothing calls — the gap that exists in neither language, and the
reason the language decision pays for itself. First and smallest step: wire
`check_manifest` ([manifest.py:88](backend/engine/manifest.py:88)), the check
that stops an invented risk category reaching a contract.

### Deliverables
- The doorway calls `check_manifest` on the way in: a manifest naming a risk
  category the library does not have is refused **by the engine, through the
  doorway, with the refusal recorded**.
- The engine itself unchanged — this package connects it, it does not edit it.

### Dependencies
WP-P5. Connect the engine to the one remaining service, not to a service that
is about to be deleted.

### Anti-patterns
**Common failure modes**
- Modifying the engine to fit the doorway. The engine is tested as it stands;
  adapt at the doorway side.
- Wiring more than `check_manifest` in the first pass. Small first, prove the
  connection pattern, then extend.

**Critical failure modes**
- *The engine's refusal flattened on the way out.* If the doorway turns the
  engine's "this category does not exist" into a silent drop or a generic
  error, the check exists but nobody can see it working — the same softening
  failure as WP-P2, one layer deeper.
- *The refusal not recorded.* An unrecorded refusal is invisible to the audit
  record, and the point of the check is that the record shows it happened.

### Testing requirements
- The engine's existing tests (`test_manifest.py` and the rest) stay green,
  untouched.
- A new doorway test: submit a manifest with an invented risk category, confirm
  it is refused, confirm the refusal is the engine's own words, confirm the
  refusal is recorded.
- A control test: a manifest with only known categories passes through.

### Documentation requirements
- A decision record in `memory.md`: the two halves of the product are now
  connected, and `check_manifest` is the pattern every further engine
  connection follows.
- One boundary note, wherever the connection lives: the system checks that
  categories exist in the library — whether the library's *content* is right
  belongs to the people who own it, not to the system.

---

## Open issues

- **Two promises deliberately out of scope** (recorded in WP-P5's
  documentation): making the two-writers audit test real with concurrency, and
  signing the audit checkpoint. Both became possible with standard PostgreSQL;
  both belong to whoever owns the database.
- **No unresolved design decisions block any package.** WP-P1 requires a person
  to have a conversation, which no package can do for them.

## Evidence summary

Every claim above traces to one of two observed sources: the revision plan
(order, rules, risks, done-when criteria) and the diff report (file inventory,
line counts, the confirmed absence of permission logic in the JavaScript, the
confirmed absence of any caller for the engine). File paths and
`check_manifest`'s location were verified against the repository at `648d2cf`
before writing. Nothing here is assumed.

## Gate 3 decision

**DRAFT — awaiting owner approval.** On approval, implementation starts with
WP-P1, today.
