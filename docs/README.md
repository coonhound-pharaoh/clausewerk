# Clausewerk documentation

Four specifications sit at the repository root and are the **canonical sources of truth**:

- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — assembly and negotiation, ending at `contract.docx`.
- [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md) — the LCMA: everything after
  signature. Obligations, renewals, amendments, wind-down.
- [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md) — the CLA: the library
  itself. Fallback ladders, concessions, version history, negotiation intelligence.
- [`NEGOTIATION-ARCHITECTURE.md`](../NEGOTIATION-ARCHITECTURE.md) — the NA: end-to-end
  negotiation. Rounds, supplier paper, per-round analysis, the Clause Library Builder.

Everything in this folder is *complementary* to that document, never a restatement of it. Where a
document here and `ARCHITECTURE.md` disagree, `ARCHITECTURE.md` wins and the document here is a
bug.

## Reading order

**If you are new to the system**, read in this order:

1. [`../ARCHITECTURE.md` §1–§2](../ARCHITECTURE.md) — what the system is for and how work flows
   through it. Do not skip §1; the entire design is downstream of one invariant.
2. [`diagrams.md`](diagrams.md) — the same pipeline as pictures, plus the two state machines the
   prose describes but does not draw.
3. [`glossary.md`](glossary.md) — the vocabulary is specific and load-bearing. "Ledger", "Forge",
   "Dossier", and "Manifest" all mean exactly one thing.

**If you are about to write code**, add:

4. [`data-model.md`](data-model.md) — every record shape in the system, consolidated. The spec
   describes these in the sections where they arise; this collects them so you can see the whole
   schema at once.
5. [`decisions/`](decisions/) — the load-bearing architectural decisions and, more importantly,
   their consequences. Most "why can't I just…" questions are answered here.
6. [`spec-vs-implementation.md`](spec-vs-implementation.md) — where the ingested prototype does not
   match the spec. Read it before trusting either one against the other.
7. [`open-questions.md`](open-questions.md) — what the architecture does *not* settle. Read this
   before designing anything that depends on an answer it doesn't give.

## Contents

| Document | What it is |
|---|---|
| [`data-model.md`](data-model.md) | Consolidated record shapes — manifest, clause, decision, finding, redline, ticket, audit event |
| [`diagrams.md`](diagrams.md) | Pipeline, trust boundary, resolution algorithm, redline adjudication, review-ticket lifecycle |
| [`decisions/`](decisions/) | Architecture Decision Records — the ten choices the system is built on |
| [`glossary.md`](glossary.md) | Terms of art, in the specific sense Clausewerk uses them |
| [`spec-vs-implementation.md`](spec-vs-implementation.md) | Seven verified places the v3 code and the spec disagree |
| [`open-questions.md`](open-questions.md) | Gaps, tensions, and deferred scope in the current specification |

The code these documents describe is ingested verbatim at [`../prototype/`](../prototype) — see
[`../prototype/README.md`](../prototype/README.md) for what each version is and how to run it.

## The one thing to remember

> The language model never authors contract language.

If a change you are making would let model output reach a contract document, the change is wrong
regardless of how well it works. See [ADR-0001](decisions/ADR-0001-model-never-authors-contract-language.md).
