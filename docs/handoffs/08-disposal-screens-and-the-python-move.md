# Handoff · Where Clausewerk stands, 2026-07-27

**Read this first if you are arriving cold.** It supersedes
[`07-role-based-ui.md`](07-role-based-ui.md) as the current state of play; 07 is
still the right place for the *history* of the sixteen UI packages and for the
long-form traps, and this file points at it rather than repeating it.

---

## THE ONE THING TO DO BEFORE ANYTHING ELSE

**Most of this session's work is uncommitted, and the history is interleaved
with another agent's.** Run `git status` and `git log --oneline -8` before you
touch anything. As of writing:

- **Committed, by the other session** (§5): the deletion of `backend/service/`
  (`b9a5823`), the Python plan archived (`a72a06e`), and **`memory.md`**
  (`e1da002`, `0d953b0`) — which carried my records in with theirs.
- **Uncommitted, mine:** 23 files changed, 13 new — six migrations
  (`0018`–`0023`), three suites, three screens, and the documentation. Including
  this file.

**`backend/service/` is already gone from the tree and from git.** Do not
restore it; three suites and fifteen mutations were removed with it and the bar
is green without them.

Files under `backend/doorway/` belong to the other session. **Do not commit
theirs with yours** — and note they have shown they *will* commit shared files
like `memory.md`, so check what is staged before you add.

---

## 0. Ground rules — binding, and the ones most easily broken

**The owner is Mike.** [`CLAUDE.md`](../../CLAUDE.md) auto-loads:

- Prefer simple, concise solutions.
- **Always plain business language, never developer jargon.** Mike is an
  executive. He will tell you when you slip; it is worth not slipping.
- Record important decisions in [`memory.md`](../../memory.md) **in plain
  language**. Engineering detail goes in `docs/decisions/` or the migration.
- **The product boundary:** we are responsible for the *system* — recording,
  gating, checking, provenance. We are **not** responsible for the contract text
  inside it. Surface a content gap and route it to a named person; never frame it
  as ours to fill.

**The verification culture is the product.** Every guarantee has a mutation that
deliberately breaks it and asserts the *named* test notices. A mutation caught by
a different test scores as a failure (`IMPRECISE`). If you add a guarantee, add
its mutation and confirm it reports `ok`.

**This is not ceremony. It found seven live defects in three days** — see §6.
Every one of them was invisible in a green report and none could have been found
by reading the code.

---

## 1. What exists

**Migrations `0001`–`0023`.** The ones from this session:

| Migration | What it does |
|---|---|
| `0018` | `cw.library_entry`, `cw.ladder_board` — the Legal admin's read models |
| `0019` | **Security fix.** Scoped six views that were handing every signed agreement, and every override justification, to anybody |
| `0020` | `agreement_opened`, `category_created` — a deal's creation is on the chain |
| `0021` | The audit chain's `seq` is assigned under the append lock |
| `0022` | Owner decisions **U9–U11** |
| `0023` | Owner decision **U12** — redact, then purge |

**A Python service** at [`backend/doorway/`](../../backend/doorway) — **56
endpoints: 29 reads and 27 writes.** (The 52 frozen as the specification, plus
four this workstream needed for the reading room, the library and the ladders.)
**The JavaScript service is deleted** — WP-P5, owner-approved and committed
2026-07-27. Do not restore it.

**Six workspaces** at [`prototype/v4/`](../../prototype/v4):

```bash
cd backend && python -m doorway.seed_demo
python -m doorway.server --static ../prototype/v4 --port 8787
```

Sign in at `http://127.0.0.1:8787`. **Use `127.0.0.1`, not `localhost`** — a
habit worth keeping; `localhost` may resolve to IPv6 and that once cost an
afternoon.

**The bar:**

```bash
cd backend && npm run verify
```

21 suites, 161 engine tests, 215 + 49 mutations. Over ten minutes, almost all of
it the mutation sweep spawning a database per check. **Last full run 2026-07-27:
21/21, 161, 215/215, 49/49 — all green, preflight clean.**

**If another session is working, `npm run verify` is not the signal you want** —
it runs their pytest suite against a real PostgreSQL server. This path touches no
server and is deterministic:

```bash
cd backend && npm test && npm run test:engine && node db/test/mutation-check.mjs
```

---

## 2. The twelve owner decisions

`U1`–`U8` are in [`07-role-based-ui.md`](07-role-based-ui.md) §2. The four
settled **this session**, all 2026-07-27:

| | Decision | Settled as |
|---|---|---|
| `U9` | Destruction | **Never automatic** — no timer, job or trigger, and a test asserts it. Authority **moves** to the Administrator; legal admin's is **revoked**, not shared. Amends `U5` |
| `U10` | Supersession | Mints a **new version**, never rewrites wording already committed to. Signed **and in-flight** deals are **flagged** — `cw.agreement_drift`, `cw.run_drift` — never corrected |
| `U11` | Administrator & the library | **May read it.** The gap was the *grant*, not the policy. No write added |
| `U12` | Ending a record's life | **Two acts.** *Redact* — content goes, fact stays; **delegable**. *Purge* — record goes; **Administrator alone, undelegable**, and only after a redaction |

**On `U12`, because it is the most dangerous thing here.** The escalation is the
control: one-step erasure is refused by the function *and* by a table constraint.
Three residuals are written down rather than smoothed over — the audit chain
outlives a purge (so a purge is **not** erasure of every trace); the bytes in the
object store are **not** deleted, only unlinked; and a purge leaves the
negotiation behind the contract untouched. All three are in
[`docs/open-questions.md`](../open-questions.md).

---

## 3. What is left

### `WP-U13` — the Legal admin's workspace. **Cannot close.**

Its reading halves are built ([`library.jsx`](../../prototype/v4/app/library.jsx)
— the clause library and the ladder board). **Six governed acts it asks for have
no endpoint in either language**, and never did — they were not among the frozen
52, and the package was paused before anyone looked:

| act | status |
|---|---|
| activate / retire / **supersede** a clause | **decided** (`U10`); endpoint absent |
| **destroy under retention** | **decided** (`U9`, `U12`); endpoint absent |
| edit a conflict rule | undecided |
| promote a concession | undecided |
| reorder a rung / move a floor | undecided |
| release a legal hold | undecided |

**The two decided ones are built in the database and reachable from nowhere.**
`cw.redact_agreement()`, `cw.purge_agreement()` and the supersession path all
work and are tested; no screen or endpoint calls them.

**Open for Mike:** are these six in scope for this effort, or does `WP-U13` close
as its reading surfaces plus a named follow-on?
[`docs/open-questions.md`](../open-questions.md) §9b.

### `WP-U15` — the acceptance sweep. **RUN 2026-08-02; both named gaps closed.**

1. **The reading room's per-clause render has been seen on screen**, behind a
   real run. `doorway/acceptance_walkthrough.py` performs every act through
   the doorway over HTTP as the real people — accounts and countersign,
   category, ticket → claim → verify (the minting door), deal, run (snapshot,
   ruleset, decisions recorded), execution filed, share — and the viewer's
   browser then renders the clause with its wording, approver and origin.
   Nothing was faked; the script is kept so the walk is re-runnable.
2. **Execution is filed through the act now** — `POST /agreements/execute`
   exists and the walkthrough uses it as Legal; the owner-inserted fixture
   shape is retired.

   The sweep also found and closed two things: the reading-room SHARE had no
   doorway act (the 07-27 walkthrough created its share below the doorway) —
   `POST /shares` and `POST /shares/revoke` exist now; and the ladders pane's
   empty-state early return was hiding the rules and promotion sections —
   trap 5.2's shape, caught in the browser.

### `WP-U14` — **closed 2026-07-27.** Both read-only workspaces built.

---

## 4. The screens

| File | Workspace | State |
|---|---|---|
| `shell.jsx`, `common.jsx`, `api.jsx` | the frame | built |
| `console-people.jsx`, `console-rest.jsx` | Administrator | built |
| `requester.jsx` | Requester | built |
| `reviewer.jsx` | Legal reviewer | built |
| `auditor.jsx` | Auditor | **built this session** |
| `viewer.jsx` | Viewer — the reading room | **built this session** |
| `library.jsx` | Legal admin — library, ladders | **built this session, read-only** |

**The rule the whole shell follows:** a pane either reads a real endpoint or says
plainly that it is not built. There is no third option, and no example rows
anywhere.

**Two rules on the viewer's surface are enforced on BOTH sides** and should stay
that way: neither reading-room endpoint takes a parameter, and **no export route
may exist**. ADR-0008 withheld the viewer's export deliberately; a convenience is
how a withheld decision gets undone.

---

## 5. There is another agent session, and coordination worked

A parallel session owns [`backend/doorway/`](../../backend/doorway) and moved the
service to Python (`WP-P1`–`P6`, all complete). **Its files are in this working
tree, uncommitted.** Leave them alone.

What that collaboration produced, so you keep doing it:

- **They found the `cw.override_status` leak** while porting reads. Checking for
  its siblings turned one leak into six — `0019`.
- **They found the audit chain's concurrency defect** with a test this repository
  structurally cannot write (PGlite is single-connection). I fixed it in `0021`;
  they verified it — 5-of-8 refusals to zero, **323 governed acts/second**, which
  answers the "does serialising matter" question with a number.
- **They found that opening a deal was not audited** — `0020`.
- **I found their `shell.test.mjs` blocker did not exist**, by moving
  `backend/service/` aside and running it: 61/61 passed.

**Two working rules that came out of it:** each session takes its own migration
numbers and says so; and when one reports a defect, the other **reproduces it
before acting**. Twice a plan's dependency list was wrong and both were settled
in minutes by running the thing rather than reading it.

**Next free migration number: `0024`.**

---

## 6. Traps

[`07-role-based-ui.md`](07-role-based-ui.md) §5 has the long form, and it is
worth your time. **The four from this session:**

**A view does not inherit the policies underneath it.** It runs with its
*owner's* rights and the owner bypasses row-level security. This shipped **three
separate times** — the reading room, then five more views found by asking the
catalogue what else had the same shape. There is now a mechanical guard,
[`views-are-not-policies.test.mjs`](../../backend/db/test/views-are-not-policies.test.mjs),
which lists every view a viewer can read and fails unless each is classified with
its reason.

**A `SECURITY DEFINER` function cannot see who called it, and a NULL comparison
fails OPEN.** `0023`'s redaction guard read `cw.app_role()` inside a definer
function, where it is NULL — and `null <> 'administrator'` is NULL, so the guard
never raised. An undelegated reviewer redacted a record on the first run. **Ask
the data who somebody is; let the EXECUTE grant bound who may ask.**

**An assertion can match the screen's own words instead of its logic.** A test
searched the source for `'audit chain'`; the tile's *display label* contains that
string, so it passed while the lookup was broken. Anchor on the expression, not
on a string that also appears in prose the user reads.

**Editing a migration with a scripted tool can silently disarm its mutations.**
A rewrite changed line endings; every multi-line pattern stopped matching that
file and only *one* check reported it. The harness now runs a **preflight** — if
any pattern is stale or ambiguous, **nothing runs and there is no count to
misread.** It found four pre-existing checks watching the wrong copy of a
repeated line, all correct by luck of file ordering.

**The through-line, and the most useful thing in this handoff:** seven times in
three days, something that looked like protection was not — a test that could
never fail, views that leaked while reading correctly, a harness that lost its
target, four checks on the wrong copy, an assertion fooled by UI copy, a guard
that failed open, and a guarantee held in three files but watched in one. **Every
one was invisible in a green report. None could have been found by reading.**

That is the argument for the mutation harnesses being load-bearing rather than
extra. The count at the bottom of a report is the least informative line in it.

---

## 7. Things that are true and easy to undo

From 07 §6, still true, plus this session's:

- **The approval box on the review desk is empty on purpose.**
- **There is no approve-all anywhere** — no function taking a list, no loop.
- **The gate opens on approval, never on request.**
- **`never_ran` is its own state** on every health tile — a check nobody ran and
  a check that failed are different facts.
- **An empty ladder is on the board, not missing from it.** `cw.ladder_board`
  left-joins its rungs so a rungless ladder renders as one row saying `empty`.
  Tightening that to an inner join hides exactly the ladders somebody must fix.
- **The Auditor and Viewer screens have no disabled controls.** A read-only role
  gets a read-only screen, not a greyed-out editor — "you could, but not now" is
  a different claim from "this was never yours".
- **`cw.sow_override_in_force` is deliberately unscoped.** The schema itself
  reads it to decide whether a SOW may contradict its master. Scoping it broke
  SOW execution outright. **A view a rule reads must answer the same for
  everybody.**

---

## 8. Read next

- [`docs/open-questions.md`](../open-questions.md) — §9b is the live one
- [`07-role-based-ui.md`](07-role-based-ui.md) — the sixteen packages, and §5's traps in full
- [`memory.md`](../../memory.md) — the decisions in Mike's language, newest last
- [`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](../../UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md) — what each package closed and taught
- [`backend/doorway/PORT-NOTES.md`](../../backend/doorway/PORT-NOTES.md) — the other session's findings, including the concurrency reproduction
