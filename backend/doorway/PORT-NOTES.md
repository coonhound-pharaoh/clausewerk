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

### 4 · Nothing else

No behaviour difference was found in the other 24 endpoints, and no permission
logic was added on either side. There is not one role comparison in
`reads.py` — checked by a test that strips comments and docstrings first, so the
sentence explaining the ban cannot trip the check on the ban.
