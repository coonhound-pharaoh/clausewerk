# ADR-0007 — One redline object per changed paragraph

**Status:** Accepted · implemented in `parseRedlineDocx` (`docx_codec.jsx` / `negotiate.jsx`)

## Context

Vendor counsel returns a `.docx` with tracked changes. The natural unit to work in is the
**document** — one upload, one adjudication, one answer.

That unit is wrong for this system. A vendor who edits the liability cap, the notice period, the
data-breach window, and the governing law has made four unrelated asks. Three may map cleanly to
already-approved positions while the fourth needs Legal. Adjudicating the document as a whole forces
one verdict across all four: either everything escalates because one item did, or the reviewer
approves in bulk and the careful matching underneath is decoration.

The `.docx` tracked-change format also offers no useful document-level structure — just a stream of
`w:ins` and `w:del` runs.

## Decision

Parsing emits **one redline object per changed paragraph**. A four-change document becomes four
independently adjudicated negotiation points, grouped in the inbox as one batch for presentation
only.

`parseRedlineDocx` unzips the file, DOM-parses `word/document.xml`, and walks each `<w:p>`,
classifying children as `keep` (`w:r`), `ins` (`w:ins`), or `del` (`w:del`, reading `w:delText`).
Each emitted object carries its own:

- stitched surrounding context (±160 chars)
- inferred category (best-scoring `KEYWORD_RULES` hit over the paragraph)
- extracted match keywords, tracked-change counts, and author/date from the first tracked change

Each object is then scored, matched, and resolved on its own — approve, edit, or escalate,
independently.

## Consequences

**What it buys**

- Partial resolution. Three asks approve against existing clauses while the fourth escalates; the
  negotiation proceeds on everything that isn't genuinely contested.
- Matching operates at the granularity it is good at. A paragraph maps to a clause; a document maps
  to nothing.
- Per-paragraph category inference means one document spanning Data Privacy, Liability Cap, and
  Governing Law routes each part to the right candidate pool.
- Every audit event references a specific paragraph, so the log records *which* ask was approved,
  not that a file was accepted.

**What it costs**

- **Cross-paragraph coupling is invisible.** Vendors negotiate in packages — accepting a liability
  cap increase *because* an indemnity narrowed. Adjudicated separately, a reviewer can approve one
  and reject the other and produce a position the vendor never offered. Nothing in the design
  detects or represents this, and it is the significant risk of the decision.
- **Paragraph is a formatting unit, not a semantic one.** One clause split across two paragraphs
  yields two redlines; a table-cell edit or a paragraph-mark change yields noise.
- Batch grouping is presentational only, so nothing enforces resolving a batch completely — a
  half-adjudicated document is a reachable state.
- Reviewer workload scales with edit count. A vendor returning fifty small changes generates fifty
  adjudications, which is correct and also a denial-of-service on Legal's attention.

## Related

- [ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md) — where edits and escalations go
- [`data-model.md`](../data-model.md) — the Redline record
- [`diagrams.md §3`](../diagrams.md) — redline adjudication flow
