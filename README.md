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
ID and assembles the document, and every emitted artifact carries the count
`0 LLM-authored characters`, asserted by test. AI may *draft candidate* clauses for the library, but
only a named lawyer turns a draft into approved language — see
[ADR-0010](docs/decisions/ADR-0010-ai-drafted-clause-candidates.md).

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

**Prototype built; production system not started.** `ARCHITECTURE.md` is the reference
specification derived from the v3 prototype, which is ingested here and runs.

Two things to know before building on it:

- Eight discrepancies between the spec and the v3 code were found and **all are now fixed**, with
  the fixes verified against the running prototype. See
  [`docs/spec-vs-implementation.md`](docs/spec-vs-implementation.md).
- Lifecycle management is **architected but not built** — see
  [`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md). The expiry-warning machinery it
  specifies is live in the prototype; everything past signature is specification.
