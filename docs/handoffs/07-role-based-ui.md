# Handoff · The role-based UI and the Administrator

**State: thirteen of sixteen packages closed, two paused, one blocked.**
Written 2026-07-26 for somebody picking this up cold.

Your source of truth is
[`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](../../UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md).
Every closed package carries a note under its heading saying what shipped, what
it cost, and what it taught. Read the notes on `WP-U11` and `WP-U14` first —
they are where the two real bugs were found.

---

## 0. Ground rules (read these; they are binding)

**The owner is Mike.** [`CLAUDE.md`](../../CLAUDE.md) auto-loads:

- Prefer simple, concise solutions.
- **Always plain business language, never developer jargon.** Mike is an
  executive. This is the rule most easily broken by accident.
- Record important decisions in [`memory.md`](../../memory.md), in plain
  language. Engineering detail goes in `docs/decisions/`.
- **The product boundary:** we are responsible for the *system* — recording,
  gating, checking, provenance. We are **not** responsible for the contract text
  inside it. Surface a content gap and route it to a named person; never frame it
  as ours to fill.

**The verification culture matters more than the code.** Every guarantee has a
mutation that deliberately breaks it and asserts the test notices. A mutation
caught by a test *other* than the one it names scores as a **failure**
(`IMPRECISE`), because the named test was never exercised. If you add a
guarantee, add its mutation and confirm it reports `ok`.

---

## 1. What exists

**Migrations `0013`–`0016`**, all with suites and mutations:

| Migration | What it adds |
|---|---|
| `0013` | `cw_administrator`, `cw.account`, `cw.role_grant`, the settings split, watcher lists, checkpoint move, health evidence |
| `0014` | `cw.person_activity`, `cw.access_summary` — the people console's read models |
| `0015` | The override request workflow: request, socialisation, per-finding decisions |
| `0016` | `cw.agreement_share` and the reading room |

**A JavaScript service** at [`backend/service/`](../../backend/service) — 52
endpoints. **This is now frozen** (see §3).

**A working shell** at [`prototype/v4/`](../../prototype/v4). Six workspaces,
one per role. Run it:

```bash
cd backend && node service/seed-demo.mjs --data ./cw-demo-data
node service/server.mjs --data ./cw-demo-data --static ../prototype/v4
```

Sign in at `http://localhost:8787` as any of six seeded people.

**The bar:** `cd backend && npm run verify` — 21 suites, 161 engine tests,
183 + 49 mutations. It takes **over ten minutes**, almost all of it the mutation
sweep spawning a database per check. Somebody will be tempted to trim it. The
honest fix is parallelism or a faster database, not fewer checks.

---

## 2. The four owner decisions, settled

Recorded in [`memory.md`](../../memory.md),
[`docs/open-questions.md`](../open-questions.md), and as rows in
`cw.governance_setting`.

| | Decision | Settled as |
|---|---|---|
| `U5` | The Administrator's boundary | **Steward, with sight.** May *read* contract content; writes none of it, decides nothing. Say **content-visible, content-powerless** — never "content-blind", which it is not |
| `U6` | Countersign | **Two names for the two Legal roles only.** An uncountersigned Legal grant confers *nothing* |
| `U7` | Checkpoints | **Move** to the Administrator; Legal admin's right **revoked**, not shared |
| `U8` | Workspace model | **Six role-scoped workspaces**, waiting lists first, deals as the requester's unit |

---

## 3. The language decision, and what it means for you

**Effective 2026-07-26, the service is written in Python.** JavaScript keeps one
job: the screens. The plan is
[`PYTHON-REVISION-PLAN-2026-07-26.md`](../../PYTHON-REVISION-PLAN-2026-07-26.md).

- **Do not add endpoints to `backend/service/`.** The 52 there are frozen as the
  specification the Python must match. `backend/service/` is deleted at `WP-P5`.
- **Migrations continue unchanged.** Both languages share them.
- **`prototype/v4/` stays JavaScript** and stays as written.

---

## 4. Where the remaining three packages stand

**`WP-U13` (Legal admin's workspace) — paused.** Its screens need endpoints that
do not exist. Those must now be Python, and Python does not answer HTTP until
`WP-P4`.

**`WP-U14` (Auditor and Viewer) — paused, but the database half is built.**
`0016` landed because migrations are shared by both languages and none of it is
wasted whichever way the service goes. What remains is the two screens.

**`WP-U15` (acceptance sweep) — blocked, deliberately.** It would be trued
against a service about to be replaced.

**Mike's instruction, 2026-07-26:** *pause the screens; build their read models
now.* That is why `0016` exists and why no `WP-U13` screen does.

### What `WP-U13` still needs from the database

Most of it already exists — `cw.clause_version_state`, `cw.selectable_clause`,
`cw.coverage_gap`, `cw.ladder_health`, `cw.ladder_rung_state`,
`cw.concession_rate`, `cw.library_proposal`, `cw.active_conflict_rule`,
`cw.retention_due`, `cw.clause_entrance`. What is missing is *consolidation*: a
library view joining clause, version, state, expiry and rationale in one place,
and a ladder view with rungs in order plus floor plus health. Both are
convenience joins, not new controls — lower value than what `0016` closed.

---

## 5. Traps, all of which caught me

**5.1 — A view does not inherit the policies underneath it.** A PostgreSQL view
runs with its **owner's** rights; the owner ran the migrations and bypasses
row-level security. So a view over a policy-protected table hands **every row**
to whoever selects from it. `0016` shipped with a comment claiming the policy
protected it. It did not, and the test caught it.

`security_invoker = true` is the obvious fix and was the **wrong one there**: it
evaluates as the caller, who then needs `SELECT` on every joined table — and a
viewer holds none on `cw.agreement` or `cw.run_decision`, so the reading room
became "permission denied" for the role it exists for. The scoping went in the
view's `WHERE` clause instead, in the same words as the policy, with a test
holding the two halves together.

**5.2 — Test an endpoint's SQL against the real schema.**
`GET /waiting/tickets` shipped selecting three columns `cw.review_ticket` does
not have. It failed outright for anybody with a ticket, and nobody noticed for
two packages: the seeded system had none, and *an empty result and a failed
query look identical* from a workspace that renders "nothing is waiting on you"
either way. [`endpoints.test.mjs`](../../backend/db/test/endpoints.test.mjs) now
runs every endpoint's SQL. **Port that test when the Python endpoints land.**

**5.3 — A source assertion trips on its own warning.** Four separate times, a
test asserting a forbidden pattern is absent failed on the *comment explaining
why it is forbidden*, or on UI copy naming what was retired. Strip comments; for
UI bans check only button text and `data-testid`; for behaviour bans enumerate
the calls made rather than searching for a word.

**5.4 — A mutation must key on the definition that survives all migrations.**
`cw.app_role()` is defined in `0001` and redefined in `0013`. A mutation keyed on
`0001`'s copy silently cancelled itself out and reported "nothing guards this"
for a protection that was intact. When code moves file, its mutations report
`SKIP` — that is the harness catching its own rot, and it means *repoint*, not
*delete*.

**5.5 — A refusal that affects zero rows is not a refusal.** An RLS `USING`
clause that excludes the row makes an `UPDATE` complete having changed nothing
and raised nothing — a console renders that as a successful save. The settings
split hit this exactly. `USING` now admits both writing roles and the rule is
enforced by a trigger that *raises*, naming the rule.

**5.6 — Force-killing the service corrupts a PGlite data directory.** Regenerate
with `seed-demo.mjs`.

---

## 6. Things that are true and easy to undo

- **The approval box on the review desk is empty on purpose.** Pre-filling it
  turns "approve" into "confirm", and the unedited-approval rate is the figure
  Legal watches precisely because that pressure is real.
- **There is no approve-all anywhere**, no function taking a list, no loop. A
  batch endpoint would be the blanket acknowledge button with a for-loop in
  front of it.
- **The gate opens on approval, never on request.** `cw.override_passes` is
  phrased "which findings may be passed" rather than "is this request approved",
  because the second phrasing makes a blanket override easy to reintroduce.
- **Socialisation refuses when nobody would be told.** An empty audience is a gap
  in the watcher lists, not an audience of nobody.
- **An owner decision has no edit affordance at all** in the admin console — not
  a disabled input. A disabled control says "you could, but not now"; the truth
  is "this was never yours".
- **`never_ran` is its own state** on every health tile.
- **Revocation is honoured at the next request, not instantly.** The console says
  exactly that and no more.

---

## 7. Read next

- [`UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md`](../../UI-REIMAGINE-WORK-PACKAGES-2026-07-26.md) — the sixteen packages and what each closed one taught
- [ADR-0011](../decisions/ADR-0011-the-administrator-is-a-steward.md) — the Administrator, and what it costs
- [ADR-0008](../decisions/ADR-0008-governance-roles-and-recorded-overrides.md) — now **built**, including the override workflow
- [`06-service-layer-and-identity.md`](06-service-layer-and-identity.md) §9–§10 — how identity binds, and the endpoint inventory the Python must match
- [`docs/guides/`](../guides) — one guide per role, written for the people who use them
- [`PYTHON-REVISION-PLAN-2026-07-26.md`](../../PYTHON-REVISION-PLAN-2026-07-26.md) — the workstream that now owns the service
