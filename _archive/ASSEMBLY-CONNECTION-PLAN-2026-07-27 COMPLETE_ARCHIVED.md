# Assembly Connection Plan — 2026-07-27

**What this is.** The detailed revision plan for WS-1 of
[`GAP-CLOSURE-PLAN-2026-07-27.md`](GAP-CLOSURE-PLAN-2026-07-27.md): connecting the tested assembly
engine to the running service so a requester can produce a contract end to end. This plan is
written to be broken into work packages; each Part below is a candidate package boundary.

**The gap in one sentence.** `backend/engine/` is 4,600 lines of tested Python that decides
everything about an assembly, and the only thing that calls any of it is one manifest check —
no endpoint runs an assembly, reads a run back, produces the document, or files an execution.

---

## 1 · What already exists, and is not touched

The engine is complete and is **not modified** — the rule set by the first join
(`backend/doorway/manifests.py`) holds: adapt the doorway's side, never the engine's.

| Piece | Where | State |
|---|---|---|
| Manifest check | `engine/manifest.py::check_manifest`, wired via `POST /manifests/check` | done, in service |
| Registry → snapshot | `engine/loader.py`, `engine/snapshot.py::Snapshot.build` | done, tested, uncalled |
| Resolution (clause selection, ladder rules) | `engine/resolution.py::resolve` | done, tested, uncalled |
| Validation (conflict rules, gate) | `engine/validation.py::validate`, `RuleSet` | done, tested, uncalled |
| Run persistence, both directions | `engine/run.py::snapshot_rows / ruleset_rows / run_rows / snapshot_from_rows` | done, tested, uncalled |
| Document build | `engine/docx.py::build_docx` — deterministic, zero-authored-characters asserted | done, tested, uncalled |
| Run store schema | `db/migrations/0005_run_store.sql` — snapshot, ruleset, run, decisions, findings | done, empty |
| Execution schema | `db/migrations/0006_executed_agreements.sql` — agreement record, documents, evidence, freeze triggers | done, demo row inserted by hand |
| Rebuild integrity check | `POST /health-checks/rebuild` | done — will finally have real runs to check |

**The permission model already exists — no migration is expected.** The database already answers
every "who may" question this plan raises:

- Record a run (snapshot, ruleset, run, decisions, findings): **requester, legal reviewer, legal
  admin** — grants and policies in `0005_run_store.sql`.
- Read runs: those three plus **auditor**; run summaries also to those three.
- File an executed agreement and its document: **legal reviewer, legal admin** — grants in
  `0006_executed_agreements.sql`. A requester cannot execute, which is right.
- Read conflict rules: **every signed-in role** (`0004_conflict_rules.sql`); author them: legal
  admin only (that authoring endpoint is WS-7's work, not this plan's).

Every new endpoint reads and writes **through the caller's own connection**, as the whole doorway
does — the database refuses what the role may not do, in its own words, and the endpoint adds no
permission logic of its own.

---

## 2 · The parts

### Part A — Run an assembly: `POST /runs`

One endpoint that does, in one transaction, as the caller, what `engine/test_run.py` does in tests:

1. **Take the manifest from the body** using the existing `manifests.manifest_from` — same
   strictness, same refusal shapes. Re-run `check_manifest`; a dropped category refuses the run
   exactly as `POST /manifests/check` refuses today (the pre-flight endpoint stays; this is the
   enforcement of the same boundary at the moment that matters).
2. **Load the library as the caller** — clauses, ladders via `engine/loader.py`'s queries run over
   the caller's connection, then `Snapshot.build`. The snapshot's identity is a hash of its
   contents; the same principle as `manifests.categories_for`: no second, privileged path to the
   library.
3. **Load the rule catalogue as the caller** — `cw.conflict_rule` rows into a `RuleSet`.
4. **Resolve and validate** — `resolve(manifest, snapshot)`, then `validate(...)`. Pure functions;
   nothing new.
5. **Persist** — `snapshot_rows`, `ruleset_rows`, `run_rows` inserted through the caller's
   connection. The run id is generated server-side. `agreement_id` links the run to the caller's
   deal (see Part A decisions). Provenance counts recorded on the run row — never printed on the
   document (owner decision, 2026-07-25).
6. **Record in the audit chain** — `run_recorded` (or `run_refused`), following the
   `manifests.py::_record` pattern: every attempt recorded, not only failures, so the audit-chain
   insert grant decides uniformly who may use the endpoint.
7. **Answer** with the run summary: run id, snapshot id, gate open or not, each decision with its
   reason, each finding. The engine's own sentences pass through unchanged — the standing rule.

Refusal behaviour follows the house pattern exactly: malformed body → 400 with reason; engine
refusal → 409 with the engine's words; database refusal → classified by `refusals.py`. A snapshot
that cannot be built (empty library, rungless ladder) refuses loudly with the engine's own error —
never a quiet partial run.

**Decisions inside Part A (recommendations attached, none block starting):**

- **A run belongs to a deal.** Recommended: `POST /runs` requires a `deal` reference and the
  database's row-level security decides whether that deal is the caller's — the same shape every
  existing write uses. A freestanding run (`agreement_id` null) stays possible in the schema but
  the endpoint does not offer it; offering it later is one field.
- **The four spec validation rules are not seeded** — `0004` created the catalogue empty, and an
  empty catalogue validates nothing. This is **content**, and content is Legal's. The endpoint
  ships against whatever rules exist; the plan's job ends at making an empty catalogue *visible*
  (the run answer says how many rules were consulted, and zero reads as zero). Seeding the four
  rules from the spec is a one-page task for Legal to approve — flagged to Mike, not solved here.

### Part B — Read runs back: `GET /runs`, `GET /runs/decisions`, `GET /runs/findings`

Three entries in `reads.py`, same shape as every existing read: a statement, and the rule that
decides who sees rows is the database's, not the endpoint's. The existing views
(`cw.run_summary`, `cw.run_contract`) already exist with grants and should be what these reads
select from where they fit.

This part is what makes two known screen-gaps real:

- The **reading room's per-clause view** (`GET /reading-room/clauses`) has never returned a row on
  screen — WP-U14's named carried gap. After Part A records a genuine run behind an agreement, it
  returns rows with no further code. WP-U15's instruction stands: **do not fake the run** — Part A
  is how the real one gets made.
- The requester's pipeline rail stops being a derived header and can show the run's actual state.

### Part C — The document: `GET /runs/contract`

Build the contract from the stored run and hand it back as a `.docx` download.

1. **Rebuild, don't trust.** Read the stored snapshot members, clause rows, and ladder rungs back
   through the caller's connection; `snapshot_from_rows` rebuilds the snapshot and the id must
   match the stored one — `SnapshotIncomplete` or an id mismatch refuses the download with the
   stored-vs-rebuilt facts. A document is only ever produced from a run that just proved it
   reproduces. This is the same guarantee `POST /health-checks/rebuild` checks on demand, enforced
   at the moment someone asks for paper.
2. **`build_docx`** produces the bytes. Zero authored characters is asserted by the engine, and
   the counts land on the run record — the document itself carries no provenance footer.
3. **Record the act** in the audit chain (`document_produced`, with the document's SHA-256), so
   "who pulled paper, when, and the hash of what they got" is answerable.
4. **Not stored.** A pre-execution document is deterministic output of an immutable run — storing
   bytes would create a second copy that could drift from what the run proves. Rebuilt on demand,
   every time, hash recorded each time. (Executed documents are different — Part D.)

**One genuinely new mechanism:** the server (`doorway/server.py`) speaks only JSON today. It
learns to send one more thing: bytes with a filename and the `.docx` content type. That is a
change to the thin HTTP file, kept as small as it sounds, and it is the only change this plan
makes outside adding endpoints and screens.

### Part D — File the execution: `POST /agreements/execute`

The act that today only the database owner can perform, made into a governed endpoint:

1. **Who:** legal reviewer or legal admin — already the database's answer (`0006` grants). The
   endpoint adds nothing to that.
2. **What it takes:** the run being executed, the executed document's bytes-evidence (hash, size,
   storage reference), signatories, and the signature-evidence references the schema already
   models. What it inserts is exactly what the hand-inserted demo row inserted, through the
   caller's connection, with the freeze triggers and status machine doing their existing jobs.
3. **The expiry gate at signature.** The v3 prototype re-checked clause expiry at the moment of
   signing; the backend never got that check. Here it becomes real: execution refuses if the run's
   selected clauses include any whose approval has lapsed between run and signature, with the
   clause named. The check consults the same computed state (`expires_soon` / expiry dates) the
   library already exposes — no new machinery, one honest comparison at the right moment.
4. **The validation gate.** A run whose gate is closed (unresolved blocking findings, no override
   in force) cannot be executed. The override apparatus (WP-U10) already exists; this is the
   moment it was built for.
5. **Audit:** `agreement_executed`, as everywhere else.

Out of scope, stated plainly: the e-signature *provider* integration (obtaining certificates
automatically) stays future work — evidence arrives as references and bytes-hashes exactly as the
schema was designed to take them. The document byte store itself is WS-8.

### Part E — Screens

The requester workspace gains the panes the pipeline rail has been promising, and the reviewer
side gains the execution act:

- **Requester:** a manifest panel (compose risks, pre-flight via the existing
  `POST /manifests/check`, submit via `POST /runs`); a run view (decisions with reasons, findings,
  gate state); the document download. The intake *interview* is WS-2 and is not here — the
  manifest panel takes a manifest composed by hand, which is exactly what the trust boundary
  accepts from anywhere.
- **Reviewer / Legal:** run view from their side; the execute action with the evidence fields;
  refusals shown in the database's and engine's own words, as every screen already does.
- **Reading room:** no new work — Part B's data makes the existing screen true.

Screens follow the v4 shell's rules as they stand: role-scoped API module, no fetch-broad-filter-
on-screen, no export routes from the reading room, `NotBuiltYet` panes replaced only when their
endpoint is live (the mutation harness already guards against stub regression).

### Part F — Tests, in the house discipline

Nothing in this plan counts as done without its named test, and every protection broken must be
caught by the test that names it:

- **Endpoint tests** per part, in the `test_writes.py` / `test_reads.py` pattern, including: every
  role that must be refused is refused *by the database*; a viewer touching `POST /runs` is
  refused before the engine's answer is ever reported (the `manifests.py` uniformity rule).
- **SQL-against-real-schema** tests for the new statements (the trap recorded in handoff 07 §5.2:
  test the statements against the migrated schema, not against mocks).
- **The round trip is the test that matters most:** record a run through the endpoint, rebuild it
  through the document endpoint, and the snapshot id must match — through the service, as the
  caller, not in an engine test.
- **Execution-gate mutations:** break the expiry re-check, break the gate check, break the
  rebuild-before-build — each must be caught by the test that names it, added to the doorway
  mutation harness (`doorway/mutation_check.py`).
- **The full `npm run verify`** stays green, including both existing mutation harnesses.

---

## 3 · Order of work

Parts are sequential where data flows, parallel where it doesn't:

```
A (run)  ──→  B (read back)  ──→  C (document)  ──→  D (execute)
                    │
                    └──→  E (screens, begin after B; execution screen after D)
F (tests) runs inside every part, not after them
```

A is the keystone; nothing else starts before it lands. B is small. C contains the one server
change (bytes out). D is the most consequential and inherits everything before it. E can trail B
by a package. Suggested work-package cut: **six packages, one per part, A split in two if the
package runs large** (A1: snapshot+resolve+validate wired and refusing correctly; A2: persistence
and audit).

## 4 · What this plan deliberately does not do

- No intake interview, no classifier, no AI anywhere — WS-2, with its own architecture first.
- No negotiation-record endpoints — WS-6.
- No conflict-rule authoring endpoint — WS-7 (the six Legal-admin acts).
- No scheduler, no notifications — WS-4. The expiry gate in Part D is a check at an act, not a
  clock.
- No document byte store, no e-signature provider — WS-8 and its decisions.
- No new migration unless a Part discovers a genuine need; the next free number is 0024 and any
  use of it gets recorded in the work package that claims it.
- No rule seeding — content, Legal's, flagged.

## 5 · Decisions for Mike, gathered in one place

None of these block starting Part A; the first two should be settled before Part D ships.

1. **Runs are tied to deals** — **SETTLED, 2026-07-27: yes** (Mike). Recorded in
   [`memory.md`](memory.md).
2. **Execution evidence minimum** — **SETTLED, 2026-07-27: hash and signatories required at
   filing; signature certificates attachable after** (Mike). Recorded in [`memory.md`](memory.md).
3. **The empty rule catalogue** — **CLOSED, 2026-07-27** by the owner's placeholder-content rule
   (see [`memory.md`](memory.md) and `CLAUDE.md`): all content is placeholder until further notice,
   so no Legal review is needed now. Work packages may seed the four specification rules — or any
   synthetic rules — freely as development data. Real rules come later, after review.
