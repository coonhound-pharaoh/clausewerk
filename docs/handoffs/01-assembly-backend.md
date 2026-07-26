# Handoff · Assembly and the backend deterministic core

**State: built, verified, pushed.** This is the only workstream with working
software. Everything else is specification.

---

## 0. Ground rules (repeated in every handoff — read them)

**The owner is Mike.** `CLAUDE.md` at the repo root auto-loads and is binding:

- Prefer simple, concise solutions.
- **Always speak in plain business language. Never developer jargon.** Mike is
  an executive, not an engineer. This is the rule most easily broken by accident.
- Record important decisions as individual entries in [`../../memory.md`](../../memory.md),
  in plain language. Engineering detail belongs in `docs/decisions/`.
- Naming and branding are the owner's alone. Do not "fix" terminology.

**The invariant**, as amended by
[ADR-0010](../decisions/ADR-0010-ai-drafted-clause-candidates.md):

> No contract language reaches an agreement without a named human's approval,
> and the origin of every clause is recorded on it permanently.

At assembly nothing is generated, and a test asserts it. AI may draft *candidate*
clauses for the library, but only a named lawyer turns a draft into approved
wording.

**The verification culture matters more than the code.** Every guarantee has a
mutation check that deliberately breaks it and confirms the tests notice. That
practice has found **eleven** faults ordinary testing missed — including tests
that passed for entirely unrelated reasons. If you add a guarantee, add its
mutation. "The test passed" is a weaker claim than "the test failed when I broke
the thing it guards."

---

## 1. What this workstream is

The path from a described engagement to a Word contract:

```
manifest → resolve → validate → record the run → emit .docx
```

All of it deterministic. No AI anywhere in this path.

## 2. What exists

```
backend/
  db/migrations/   0001 foundation (roles, hash-chained audit log)
                   0002 clause registry (immutable versions, supersession)
                   0003 ladders and concessions
                   0004 clause tags and conflict rules
                   0005 run store (stored snapshots, rule sets, immutable runs)
                   0006 executed agreements (frozen signed contracts)
  engine/          model, snapshot, resolution, validation, run, docx, loader
```

**Run everything:**

```bash
cd backend && npm install && npm run verify
```

224 tests, 39 mutation checks, all green. **No database to install** — SQL runs
against PGlite (real PostgreSQL compiled to WebAssembly). The same SQL runs on
Supabase unchanged. `python-docx` is optional and test-only.

## 3. Design decisions you must not casually undo

| Decision | Why it is load-bearing |
|---|---|
| Clause wording is immutable; a DB trigger refuses edits | A contract executed under v1 must resolve v1 forever. Everything downstream assumes it |
| Validity is **computed**, not stored | A clause leaves the pool on its expiry date with nobody acting |
| Four states: active / superseded / retired / expired | "Replaced by something better" and "withdrawn" are different answers to an auditor |
| `selectable` ≠ `state` | A superseded clause on run-off stays usable until its own expiry |
| The audit log has no UPDATE or DELETE grant for **any** role | Immutability survives a wrong policy or a compromised app |
| Snapshots are **stored**, not just named | `selectable` depends on the date, so a snapshot hash cannot be recomputed later. Storing the id alone would name something nobody can rebuild |
| `state` is deliberately **not** in the snapshot hash | It is mutable and changes no outcome. Hashing it broke every stored run the first time Legal tidied the library |
| Dates are nullable | A clause with no approval date is *unprovenanced*, not expired. Fabricating one birth-expired 54 clauses in the prototype |

## 4. Traps

- **`cw.clause_version` stores `cat`/`sev`; manifests carry `category`/`severity`.**
  Worse, clauses store a category *key* and manifests carry the *label*. The
  loader joins to `cw.category` to convert. Get this backwards and every risk
  resolves to nothing, silently.
- **`loader.py` is the only module that knows both layers.** A renamed column
  there breaks production while both suites stay green. `db/test/loader-sql.test.mjs`
  extracts its SQL from the Python source and runs it against the real schema —
  keep that test alive.
- **CHECK constraints cannot contain a subquery.** The conflict-rule grammar
  check uses jsonb key subtraction for this reason. PostgreSQL rejects the
  obvious version outright.
- **Zip entries carry a fixed timestamp** in `docx.py`. A live clock would make
  the same contract hash differently every minute, and the stored SHA-256 is
  what a signed contract is verified against.
- **`python-docx` cannot read tracked changes** — it drops insertions *and*
  deletions. That is why the document service uses the standard library. A test
  demonstrates it; do not "simplify" back to python-docx.

## 5. Known gaps

- No service layer, no HTTP API, no auth wiring. The engine is pure functions and
  the schema is SQL; nothing connects them to a request.
- `cw.agreement` is the minimal subset concessions needed. The lifecycle handoff
  extends it.
- Supabase is the chosen host but nothing is deployed. Row-level security uses a
  session setting (`cw.role`) that maps to a JWT claim in Supabase — that mapping
  is unwritten.
- The role model is five Postgres roles plus RLS. Real SSO is not wired.

## 6. Where to start

1. Run `npm run verify`. If it is green, the description above is accurate.
2. Read [`../../backend/README.md`](../../backend/README.md) — it is current and
   explains each decision in place.
3. The natural next piece is the **service layer**: something that loads a
   snapshot, resolves, validates, records the run, and returns a document. Every
   part exists; nothing composes them yet.

## 7. Read next

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) — the specification
- [`../decisions/`](../decisions/) — ADR-0001 through 0010, and what each costs
- [`../spec-vs-implementation.md`](../spec-vs-implementation.md) — eight defects
  found in the original prototype, all fixed, with the reasoning
