# Clausewerk

A contract drafting, negotiation, and lifecycle management system.

Clausewerk is a **procurement contract assembly system**. A business requester describes an
engagement in natural language; the system produces a Master Services Agreement composed
**exclusively of pre-approved clause text** drawn from a Legal-maintained library, plus an audit
trail explaining why each clause is present.

## The invariant

> No contract language reaches an agreement without a named human's approval, and the
> origin of every clause is recorded on it permanently.

At assembly the model generates nothing at all: a deterministic executor fetches immutable text by
ID and assembles the document. Every build is counted character by character against approved
wording plus a declared list of structural strings, and the count of anything else must be **zero** —
a control test proves the counter actually looks. AI may *draft candidate* clauses for the library,
but only a named lawyer turns a draft into approved language — see
[ADR-0010](docs/decisions/ADR-0010-ai-drafted-clause-candidates.md).

**The count is not printed on the contract.** Both provenance figures — characters from the assembly
path, and characters originating from AI-drafted clauses — are computed and kept in the system
record. The document itself carries no provenance footer. That was decided by the owner on
2026-07-25.

Three consequences follow, and the whole architecture exists to serve them:

1. **Legal reviews decisions, not prose.** Reviewers verify that the right clause was chosen, not
   that the wording is safe — the wording was already approved.
2. **Every output is traceable.** Clause → policy citation → reviewer → approval date.
3. **The library is the only mutation surface.** New language enters through one gate (Legal
   verification), never through generation.

## Pipeline

```
Intake ──→ Manifest ──│──→ Forge ──→ Validate ──→ Dossier ──→ contract.docx
(inference)           │   (deterministic)
                      │
              trust boundary

Negotiate ──→ Review queue ──→ Ledger   (the human-gated learning loop)
```

The **trust boundary** sits between Manifest and Forge. The manifest — a strict JSON object of
`{category, severity, justification}` triples — is the *only* thing that crosses from the
inference side to the deterministic side.

## Repository

| Path | What it is |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **The specification.** Assembly and negotiation — intent, pipeline, the deterministic/inference split, back- and front-end requirements. Ends at `contract.docx` |
| [`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md) | **The LCMA.** Everything after signature — obligations derived by clause ID, renewals, amendments, wind-down |
| [`CLAUSE-LIBRARY-ARCHITECTURE.md`](CLAUSE-LIBRARY-ARCHITECTURE.md) | **The CLA.** The library itself — fallback ladders, concessions, version history and supersession, negotiation intelligence |
| [`NEGOTIATION-ARCHITECTURE.md`](NEGOTIATION-ARCHITECTURE.md) | **The NA.** End-to-end negotiation — every round captured, supplier paper, per-round analysis, the Clause Library Builder |
| [`memory.md`](memory.md) | Decision log in plain language — what we decided and why |
| [`docs/`](docs) | Data model, diagrams, decision records, glossary, and the spec-vs-code drift list |
| [`prototype/`](prototype) | The working prototype, ingested verbatim — v3 (current), v2, the pitch deck, and a single-file build |

**New to this project?** Start at [`docs/handoffs/`](docs/handoffs) — one
self-contained report per workstream, written for someone arriving with no
context. Otherwise [`docs/README.md`](docs/README.md) has the reading order.

## Running the prototype

No build step. Open [`prototype/v3/Clausewerk V3.html`](prototype/v3/Clausewerk%20V3.html) directly
in a browser — React, Babel, Tailwind, and JSZip load from CDNs, so it needs network access. See
[`prototype/README.md`](prototype/README.md).

## Status

**Built and tested end to end on a developer's machine: database, engine, service layer (the
doorway), and the six role-scoped workspaces. Not deployed; no identity provider wired; the AI
front half is designed but not built.** *(Status trued 2026-08-02 — the paragraph below replaces
one that had lagged the build by fifty migrations.)*

What exists and is tested:

- **The database** — sixty-two migrations (as of 2026-08-02) covering the clause library, ladders
  and concessions, conflict rules, the run store, executed agreements, the audit chain, the Review
  queue, clause origin, governance, the negotiation record, departures from a master, obligations
  and their notifications, the signature-envelope record, database-backed sessions, disposal
  (redact/purge), and the governed Legal-admin acts. Thirty-seven SQL test suites.
- **The Python engine** — resolution, validation, snapshot fingerprinting, run storage and rebuild,
  document assembly, and redline parsing.
- **The doorway** — the Python service layer: 63 reads, 55 writes, sign-in/sign-out, and the
  special acts (runs, execution filing, paper ingest, notifications), each deferring every
  permission to the database. Serves the v4 shell statically.
- **The v4 shell** — one workspace per role, every pane reading a real endpoint or saying plainly
  it is not built.
- **Mutation testing on both stacks.** Every protection is deliberately broken in turn and must be
  caught **by the test that names it** — a break caught by some other test is reported as a failure,
  not a pass, because it means the named test was never exercised.

What does not exist: identity-provider integration (sign-in names a person and trusts it), the
DocuSign adapter (the envelope record exists; the adapter waits on credentials), a scheduler
(nothing runs on its own), the AI front half (architecture written 2026-08-02 —
[`AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md`](AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md)), a vector
index, or deployment of any kind.

Two things to know before building on it:

- Eight discrepancies between the spec and the v3 prototype code were found and **all are fixed**.
  See [`docs/spec-vs-implementation.md`](docs/spec-vs-implementation.md).
- A full review on 2026-07-25 ([`docs/REVIEW-2026-07-25.md`](docs/REVIEW-2026-07-25.md)) found
  eighteen findings, mostly guarantees the documents stated absolutely that the code did not
  actually enforce. Phases 0–3 of the resulting plan
  ([`IMPROVEMENT-PROPOSAL-2026-07-25.md`](IMPROVEMENT-PROPOSAL-2026-07-25.md)) have been carried
  out, and the **four owner decisions it surfaced have been settled** — recorded in
  [`docs/open-questions.md`](docs/open-questions.md) and held as rows in the schema, with the
  reasoning and the accepted cost of each attached.

### Running the tests

```bash
cd backend && npm run verify
```

That runs everything: the SQL suites, the engine tests, the doorway tests (these need PostgreSQL
running — `docker compose up -d` from `backend/`) and both mutation harnesses — several hundred
deliberate breakages, each of which must be caught by the test that names it. The doorway half
takes the longest, around fifteen minutes; do not run two doorway suites at once.

For a fast loop while working, skip the mutation harnesses:

```bash
cd backend && npm test && python -m pytest engine -q
```
