# Five views hand one requester another requester's rows — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** Migration 0071 scopes all five and splits the two the schema
itself reads into a granted-to-nobody derivation plus a scoped view.
`views-are-not-policies.test.mjs` now enumerates every role — 66 views, all
classified — with two new verdicts ('privileged', 'scoped-through') and a guard on
the new `_all` seam. Four endpoint-level regression tests in `test_reads.py`.

Proved by breaking it: without 0071, three of those tests fail naming Ben's data;
unclassifying a view, granting a 'privileged' view to a requester, granting an
`_all` view, and removing a WHERE clause each fail a named test.

**287/287 mutations · 39/39 db suites · 1507 doorway tests, all passing.**

## What is wrong, demonstrated rather than argued

A PostgreSQL view runs with its OWNER's rights. The owner ran the migrations and
row-level security is ENABLED rather than FORCED, so **a view does not inherit the
policies of the tables under it**. This codebase knows that — it has shipped four
times before and `db/test/views-are-not-policies.test.mjs` exists because of it.

It has now shipped five more times, and the guard could not see any of them.

Proved on a scratch database with two requesters, Rita and Ben, each owning one
deal. Rita's connection, bound to `cw_requester` with `cw.actor = rita@x`:

    select * from cw.notice                 →  0 rows        (policy works)
    select * from cw.notice_state           →  1 row: BEN'S NOTICE, note text,
                                               who raised it, and AG-BEN

    select agreement_id from cw.executed_agreement        →  AG-RITA
    select * from cw.agreement_close_eligibility          →  AG-RITA AND AG-BEN

    select * from cw.vendor_friction        →  both counterparties, with Ben's
                                               deal counts and negotiation metrics

Two more carry the same shape and were empty on this seed, so they are scoped on
shape rather than on evidence — as `cw.agreement_drift` and `cw.sow_conflict`
were in the earlier round:

    cw.obligation_state      no scoping, over cw.obligation_instance
    cw.obligation_unowned    no scoping, over cw.obligation_instance

All five are served by live read endpoints: `GET /notices`,
`GET /agreements/closeable`, `GET /vendors/friction`, `GET /obligations`,
`GET /obligations/unowned`.

**`GET /notices` documents the guarantee it does not deliver.** Its rule note in
`reads.py` reads: *"cw.notice read_scoped policy (0064) reached through
cw.notice_state — your own raised notices, the ones addressed to you or your role"*.
The policy is never consulted. That sentence is the one to be angriest about: it
is what a reviewer would rely on instead of checking.

## Why the existing guard did not catch them

`views-are-not-policies.test.mjs` enumerates its inventory like this:

    where … and has_table_privilege('cw_viewer', c.oid, 'SELECT')

**It looks only at what a VIEWER can read.** The viewer is the least privileged
role in the system. Every one of these five is granted to `cw_requester` and not
to `cw_viewer`, so all five sat outside the inventory from the day they were
written — and the file's carefully built reverse check ("no view marked read-all
or derived sits over a person-scoped table") never ran against them.

Measured: 21 views are readable by a viewer. **45 more are readable by some other
role and by no viewer.** The guard covers 21 of 66.

This is S254's lesson again — a guard that enumerates a registry cannot see what
was never registered — except the registry here is one role's grant list, and the
mistake being guarded against does not have to appear on it.

## Not wrong, checked before claiming otherwise

* **The 19 other unscoped views outside the inventory are readable only by
  `cw_legal_reviewer`, `cw_legal_admin`, `cw_auditor` or `cw_administrator`.**
  Those roles' read policies on the base tables are unconditional
  (`app_role() in ('legal_reviewer','legal_admin','auditor')`), so the views hand
  back exactly what the policies already permit. They need CLASSIFYING, not
  scoping.
* **Every table the read endpoints touch has RLS enabled and at least one
  policy** — 27 of 27. The tables are not the problem.
* **`cw.received_document` is not reachable from any read endpoint**, consistent
  with the fence redlines.py describes.
* **The migration numbering gap at 0069 is benign** — no such file has ever
  existed in any branch, and the bootstrap applies in filename order, so a gap
  changes nothing. A DUPLICATE would matter; a gap does not.

## The fix

**Two halves, and the second is the one that matters in a year.**

### 1 · Scope the five views (migration 0071)

Each gets the WHERE clause that repeats its base table's read policy — the house
pattern from 0019, 0025 and 0027.

* `cw.notice_state` — repeats 0064's `read_scoped`: Legal and the auditor in
  full, plus `raised_by = app_actor()`, `to_person = app_actor()`,
  `to_role = app_role()`.
* `cw.agreement_close_eligibility` — repeats `cw.executed_agreement`'s
  `read_scoped`, including the viewer's `is_shared_with` branch.
* `cw.obligation_state`, `cw.obligation_unowned` — repeat
  `cw.obligation_instance`'s `read_scoped`.
* `cw.vendor_friction` — the scoping goes on the `cw.agreement` scan, in WHERE
  and before the GROUP BY, for the reason 0027 records: in a HAVING it would
  filter groups after the counts were computed over every row.

**TWO THINGS THAT CHANGE FOR SOMEBODY, and both are called out rather than
discovered later:**

* **An administrator holds a grant on `cw.notice_state` and has no read policy on
  `cw.notice` at all.** After scoping they see notices addressed to them or to
  the administrator role, and no longer every notice in the system. That is the
  policy's own answer; if the owner wants an administrator to read all notices,
  that belongs in a policy on `cw.notice`, not in a view that quietly ignores it.
* **`cw.vendor_friction` becomes "friction across the deals you can see."** For
  Legal and the auditor nothing changes. For a requester the numbers drop to
  their own deals. The alternative — revoking the requester's grant — removes a
  capability somebody deliberately granted, which is the owner's call and not
  mine.

### 2 · Extend the guard to every role

`views-are-not-policies.test.mjs` enumerates per role instead of for the viewer
alone, so the inventory covers all 66 views. Each newly visible view is
classified with its reason. This is the half that stops the sixth occurrence.

## Validation

* The Rita/Ben probe becomes a test: each of the five views returns nothing of
  Ben's to Rita, and still returns Rita's own rows — a view scoped to nothing
  passes "no leak" perfectly and is useless.
* Legal, the auditor and the administrator must still see what they saw. A
  scoping change that quietly narrows Legal is a broken product, and it is the
  one real risk in this change.
* The extended inventory must FAIL for an unclassified view — proved by removing
  an entry.
* `node backend/db/test/mutation-check.mjs` — **a migration is edited, so
  CLAUDE.md requires it.**
* `node backend/db/test/run-all.mjs` and the full doorway suite.


---

## What changed once the tests ran — the definer seam

The plan above said "each gets the WHERE clause that repeats its base table's
read policy." That was done, and **three database suites went red.**

The cause is in `0064`'s own comment, twelve lines above the function that broke:
**`cw.waiting_for` is SECURITY DEFINER, so `cw.app_role()` is NULL inside it.**
A predicate that asks `app_role()` therefore matches nothing there, and every
notice and every due obligation silently vanished from the workspace panel and
the daily digest. That is 0019's `sow_override_in_force` lesson exactly.

So the derivation and the scoping stop being the same object:

    cw.notice_state_all       the derivation, granted to nobody
    cw.notice_state           that, plus the policy — what people read

Same for `cw.obligation_state`. `cw.waiting_for` is rebuilt over the `_all`
views — 0064's body carried forward with two table names changed — and it loses
no scoping, because its own guard already refuses to answer for anybody but the
signed caller and every branch filters on `p_person` or `p_role`.

**Rejected: `or cw.app_role() is null` in the predicate.** One line, no new
object, and unreachable from a browser since a doorway caller always has a role.
Rejected because it writes an escape hatch into a security predicate, and the
next reader cannot tell from the line whether the hatch is safe.

**The new seam is guarded on the day it was built:** no view whose name ends in
`_all` may be granted to any application role. Matched by SUFFIX, so a third one
next year is covered without anybody remembering the file.

**Three db-test reads moved and five moved back.** Reads made as the owner now go
through `_all` — they assert the derivation, and the scoped view correctly
answers an owner nothing. Reads made inside `queryAs(role, …)` stay on the scoped
view, which is what that person would see.

**The mutation harness earned its rule.** Three rows went imprecise: one named a
test this change renamed, and two patched 0038's spelling of views that 0071
replaces — so a later migration silently undid the mutation. All three repointed;
286/286 expected.
