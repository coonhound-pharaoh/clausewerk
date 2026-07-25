# Prototype

Ingested verbatim from `Downloads/Interview Pitch` on 2026-07-25. Nothing was refactored, renamed,
or fixed on the way in — including the issues catalogued in
[`../docs/spec-vs-implementation.md`](../docs/spec-vs-implementation.md). This tree is the record
of what was built, not a maintained codebase.

## What's here

| Path | What it is | Status |
|---|---|---|
| [`v3/`](v3) | The V3 prototype — `Clausewerk V3.html` + 18 `app/*.jsx` | **Current.** What [`ARCHITECTURE.md`](../ARCHITECTURE.md) documents |
| [`v2/`](v2) | Earlier prototype — `index.html` + 11 `app/*.jsx` | Superseded |
| [`pitch/`](pitch) | Exec pitch deck — `samples.html` + 12 `components/*.jsx` | Presentation, not product |
| [`dist/`](dist) | `Clausewerk.html` — self-contained single-file export (1.7 MB) + its thumbnail | Distributable |
| [`revision-plan.md`](revision-plan.md) | The design-review response that produced the V3 UI (15 issues, R1–R…) | Historical |

Version lineage is recorded in the `localStorage` keys: `v2/` writes `clausewerk.v2`, `v3/` writes
`clausewerk.v3.1` and `clausewerk.v3.seen`.

## Running it

No build step and no server required — every entry point is plain HTML loading React 18 UMD,
Babel standalone, and Tailwind from CDNs, with the `.jsx` modules loaded as `text/babel` and
sharing scope via `window` exports.

Open the file directly in a browser:

- **v3** → `v3/Clausewerk V3.html`
- **v2** → `v2/index.html`
- **pitch deck** → `pitch/samples.html`
- **standalone** → `dist/Clausewerk.html`

Two consequences of that stack worth knowing before you debug anything:

1. **It needs network access.** React, Babel, Tailwind, JSZip, and Google Fonts all come from
   CDNs. Offline, the page renders nothing.
2. **Script order is load-bearing.** `data.jsx` must run first because it populates
   `window.CATEGORIES`, which the classifier's enum filter depends on — and that filter
   [fails open](../docs/spec-vs-implementation.md#5-the-classifiers-category-filter-fails-open) if
   the global is missing. The order is fixed in each entry HTML; preserve it.

`dist/Clausewerk.html` is a bundler export with its sources inlined as UUID-keyed payloads rather
than plaintext, so it is the right file to *send someone* and the wrong file to read or edit. Use
`v3/` for both.

## Layout note

`ARCHITECTURE.md` was written against paths of the form `v3/Clausewerk V3.html`. The prototype now
lives one level down under `prototype/`, and the spec's references were updated to match. The
structure inside each version folder is untouched, so every relative `./app/…` and
`./components/…` reference in the HTML still resolves.

## Relationship to the rest of the repo

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — the specification this code is the reference for
- [`../docs/`](../docs) — data model, diagrams, decision records, glossary
- [`../docs/spec-vs-implementation.md`](../docs/spec-vs-implementation.md) — six verified places
  the code and the spec disagree
