# Clausewerk

A contract drafting, negotiation, and lifecycle management system.

Clausewerk is a **procurement contract assembly system**. A business requester describes an
engagement in natural language; the system produces a Master Services Agreement composed
**exclusively of pre-approved clause text** drawn from a Legal-maintained library, plus an audit
trail explaining why each clause is present.

## The invariant

> The language model never authors contract language.

It reads, classifies, and points. A deterministic executor fetches immutable text by ID and
assembles the document. Every artifact the system emits carries the count
`0 LLM-authored characters` — that claim is the product.

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

## Documents

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the reference specification: intent, pipeline, the
  deterministic/inference split, and back- and front-end requirements.

## Status

Specification stage. `ARCHITECTURE.md` describes the intended system, derived from the V3
prototype (`v3/Clausewerk V3.html` + `v3/app/*.jsx`); the prototype sources are not yet in this
repository. Lifecycle management is out of scope for the current architecture document.
