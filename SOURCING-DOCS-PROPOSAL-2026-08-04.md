# Sourcing documents from the same intake — RFP or RFQ, selectable (owner addition, 2026-08-04)

*Commissioned by Mike 2026-08-04: "In addition to creation of the contract from the interview/intake
data, we also need to generate an RFP. Or RFQ (selectable)." This proposes how that fits; the
decisions at the end are Mike's and are deliberately not made here.*

## What this adds, in one paragraph

Today the intake interview feeds one destination: the contract. In the real procurement sequence a
sourcing event usually comes first — the requester describes the need, suppliers are invited to
respond, and only the winner gets the agreement. This addition makes the intake feed **two**
destinations: a **sourcing document** (an RFP when the requester is asking suppliers to propose a
solution, an RFQ when the specification is fixed and only price and delivery are in question —
selectable, and the interview can recommend which one fits), and later the contract, exactly as
built. One conversation, both documents, one data spine.

## Why this is worth doing (the pitch it unlocks)

The differentiator no incumbent leads with: **the draft contract terms ride along with the sourcing
document.** Because the same intake manifest that will assemble the agreement already exists at
RFP/RFQ time, the sourcing package can include the actual clause set the winner will be asked to
sign — pre-approved language, named approvers, the whole dossier. Suppliers see the paper before
they bid; negotiation surprises shrink; and the sales story becomes "your sourcing event and your
contract are the same governed pipeline, so nothing is re-keyed and nothing sneaks in between award
and signature."

## The rules it obeys — nothing new

- **Same one-door rule for language.** Sourcing documents assemble from a Legal/procurement-approved
  section library (instructions to bidders, submission rules, evaluation criteria, terms preview,
  pricing tables) the same deterministic way contracts assemble from clauses. A model may draft
  *candidate* sections only into the existing review queue (ADR-0010's shape), never into a
  document.
- **Requester prose is requester prose.** The scope/statement-of-need is authored by the human
  requester during intake. It is human-authored content, recorded as such — the zero-AI-characters
  count applies to the assembly path exactly as it does for contracts.
- **Content is placeholder** (2026-07-27 rule): section wording is synthetic until reviewed; nothing
  here blocks on content, and no test pins wording.
- **Deterministic before model** (ADR-0005): the type choice (RFP vs RFQ) is a requester selection
  first; the interview *recommending* a type from the conversation is a model nicety on the existing
  seam, arriving later or never.

## Where it sits in the build order

It consumes the intake manifest, so it lands **after AI-1/AI-2** (deterministic intake + screens)
and is untouched by the model-path decision gates. Sketch, mirroring the AI-plan's table:

| # | Package | Depends on | Gate |
|---|---|---|---|
| SRC-1 | Sourcing section library (placeholder content) + type taxonomy (RFP / RFQ) | nothing | none |
| SRC-2 | Deterministic sourcing forge: manifest + type → rfp.docx / rfq.docx + dossier | SRC-1, AI-1 | none |
| SRC-3 | Intake asks the event-type question (selectable; "no sourcing event" allowed for renewals/direct awards) | AI-2 | none |
| SRC-4 | Terms preview: attach the draft clause set to the sourcing package | SRC-2 | **decision 2** |

## The decisions that are Mike's (put, not made)

1. **Does the strict character-count invariant govern sourcing documents exactly as contracts?**
   Recommendation: yes — one rule for every document the system emits is easier to sell and easier
   to prove than a carve-out.
2. **Is the terms-preview attachment (SRC-4) in the first version?** Recommendation: yes — it is the
   differentiator; without it this is just a document generator.
3. **Demo scope:** does the design-partner demo show intake → RFP/RFQ → contract end to end, or
   intake → contract first with sourcing as the fast-follow? Recommendation: build AI-1/AI-2 first
   either way; decide this when the intake demo exists and the first conversations are being booked.
