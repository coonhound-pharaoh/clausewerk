# Port notes — JavaScript service → Python doorway

A running list of every difference found between the two languages while porting.
Each one is either a Python bug to fix or a JavaScript bug to record. Nothing on
this list was silently smoothed over.

Started WP-P2 (the 25 reads), 2026-07-26. WP-P3 and WP-P4 continue it.

---

## WP-P2 · The 25 reads

### How equivalence was actually proved, and what that does not cover

The two services run on **different databases**: the JavaScript service on PGlite
(in-process, one connection), the Python doorway on standard PostgreSQL. So a
live row-for-row diff between them would be comparing two separate instances, and
any difference found would more likely be seeding drift than port drift.

What was proved instead:

- **All 25 statements match the JavaScript character for character** (whitespace
  aside), read out of `service/app.mjs` at test time rather than from a copy.
  This covers every row for every role, not merely the rows a seeded system
  happens to hold.
- **Every statement runs against the migrated schema as two different roles** —
  an Administrator and a requester — with a broken statement (undefined column,
  undefined view, syntax error) failing the test outright. This is the check that
  found the `GET /waiting/tickets` fault in the JavaScript, carried across.
- **Every read a requester is refused is confirmed to refuse**, in words, rather
  than answering an empty list.

What is **not** covered: the two services' outputs have not been diffed side by
side on identical data. Given identical statement text, identical schema and
identical binding of role and actor, identical rows follow — but that is an
argument, not an observation, and it is recorded as one.

### 1 · `GET /holds` names its rule too thinly — **JavaScript, recorded, not fixed**

The note reads `cw.legal_hold policies`. Every other read names the specific rule
or grant that decides. This one names the table and leaves the reader to find
which of its policies applies.

Carried across unchanged, because the port's job is not to improve. Worth a
sentence when somebody next touches legal holds.

### 2 · Refusal bodies carry one extra field in Python — **Python, deliberate**

| | JavaScript | Python |
|---|---|---|
| body | `{error, reason}` | `{error, reason, kind}` |
| statuses | 403, 400 | 403, 409, 400 |

`kind` is one of `not_permitted`, `refused_on_merits`, `rejected`, and 409
distinguishes "the act itself is refused right now" from "your role may not".
Purely additive: the screens read `error` and `reason`, which are unchanged and
carry the database's own words in both.

On reads specifically the two behave identically in practice — a `select` that
fails, fails on privilege (403) or on the statement (400). The 409 case belongs
to writes and arrives properly in WP-P3.

### 3 · Rows are returned by column name — **Python, new**

`Request.rows()` was added to `db.py`. The JavaScript driver returns labelled
rows natively; the Python one returns tuples, and an interface cannot render a
tuple without holding a second copy of the SELECT list, which would then be the
second thing to drift.

No behaviour change: same rows, same column names, same order.

### 4 · `GET /overrides` shows every requester's overrides to everybody — **schema, confirmed, open**

Not a port difference. It is present in both languages, and it is the most
serious thing this package found.

`cw.override_status` is a view over `cw.override_request`. A PostgreSQL view runs
with its **owner's** rights, and the owner is exempt from row-level security — so
the view hands back every row regardless of the `read_scoped` policy underneath
it. Select on the view is granted to all six roles.

Observed, on a seeded database, not argued:

| asked by | `cw.override_request` (policy applies) | `cw.override_status` (the view) |
|---|---|---|
| a requester, owner of 1 of 2 requests | 1 | **2** |
| a viewer, told about nothing | 0 | **2**, justification text included |

The viewer case is the sharp one. ADR-0008 created that role precisely so a
contract could be shown to somebody without giving them a way in.

The endpoint's own rule note claims "a requester sees their own, Legal and Audit
see all, a viewer sees only what they were told about". That sentence is
currently false, which makes it worse than no note at all.

**Where the fix belongs:** the view, in `db/migrations/`, not the doorway. Adding
a `WHERE` to the endpoint would be exactly the second copy of the permission
model this whole layer exists to avoid. `security_invoker = true` is the obvious
fix and is the wrong one — it evaluates as the caller, who then needs SELECT on
every joined table, and a viewer holds none. The scoping goes in the view's own
`WHERE` clause in the same words as the policy, which is the pattern
`0017_reading_room.sql` already uses.

**How it is held open:** two strict-xfail tests in `test_reads.py`. They pass
while the leak exists and **fail the moment it is fixed**, so nobody has to
remember to come back and delete them.

**How it was found:** the role-based-UI session warned that a view does not
inherit the policies underneath it. Twelve of the 25 reads point at views over
protected tables; of those, only three sit over a table whose read policy scopes
by PERSON rather than by role, and only one of those three is granted to roles
that the scoping was meant to hold back. `cw.person_activity` and
`cw.review_quality` are granted only to roles that already read the whole chain
or the whole queue, so bypassing the per-person scoping gives them nothing they
were not entitled to. One real leak, checked rather than assumed.

### 5 · Nothing else

No behaviour difference was found in the other 24 endpoints, and no permission
logic was added on either side. There is not one role comparison in
`reads.py` — checked by a test that strips comments and docstrings first, so the
sentence explaining the ban cannot trip the check on the ban.
