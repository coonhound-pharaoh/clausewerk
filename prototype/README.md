# Prototype

Ingested verbatim from `Downloads/Interview Pitch` on 2026-07-25, then repaired: the eight defects
catalogued in [`../docs/spec-vs-implementation.md`](../docs/spec-vs-implementation.md) are all
fixed in [`v3/`](v3), with the fixes verified against the running application.

`v2/` and `pitch/` remain untouched — they are historical records, not maintained code.

## What's here

| Path | What it is | Status |
|---|---|---|
| [`v4/`](v4) | **The shell.** Six workspaces, one per role, talking to the real service | **Current.** Built from WP-U07 onward |
| [`v4-concept/`](v4-concept) | The clickable concept that argued for v4 | **Concept, superseded by `v4/`.** Its data is invented — see below |
| [`v3/`](v3) | The V3 prototype — `Clausewerk V3.html` + 18 `app/*.jsx` | **Superseded by `v4/`**, and still the source of the visual language |
| [`v2/`](v2) | Earlier prototype — `index.html` + 11 `app/*.jsx` | Superseded |
| [`pitch/`](pitch) | Exec pitch deck — `samples.html` + 12 `components/*.jsx` | Presentation, not product |
| [`dist/`](dist) | `Clausewerk.html` — self-contained single-file export (1.7 MB) + its thumbnail | Distributable |
| [`revision-plan.md`](revision-plan.md) | The design-review response that produced the V3 UI (15 issues, R1–R…) | Historical |

Version lineage is recorded in the `localStorage` keys: `v2/` writes `clausewerk.v2`, `v3/` writes
`clausewerk.v3.1` and `clausewerk.v3.seen`.

## v4 — the shell, and how it differs from everything above it

**v3 and the concept mockup talk to nothing.** They hold their own data, in the
browser, and every role can open every tab. That was the right shape for showing
what the product would feel like, and the wrong shape for a product: the frontend
handoff already warned that fetching data a role may not see and hiding it on
screen is a leak, not a control.

**v4 talks to the real service.** You sign in as a named person, the database
says what role you actually hold, and your workspace is built from only what that
role's connection can read. Six workspaces, one per role — owner decision `U8`.

```bash
cd backend
node service/seed-demo.mjs --data ./cw-demo-data     # six people, one per role
node service/server.mjs --data ./cw-demo-data --static ../prototype/v4
# then open http://localhost:8787 and sign in as, say, d.buyer@clausewerk
```

The seed creates **no deals, tickets or clauses.** Those are acts for the people
in the system to perform, and an empty workspace showing its honest empty state
is the correct first impression. A seeded system that looks busy is a demo.

### Three rules this shell keeps, and why they are worth knowing

**Nothing is invented.** The concept mockup in `v4-concept/` has a complete set
of plausible rows — deals, tickets, findings, people. **None of it is imported.**
A pane either reads a real endpoint or renders an empty state naming the work
package it lands in. The 2026-07-25 review found eighteen instances of documents
promising what code did not do, and a screen full of convincing fiction is that
same failure with better lighting.

**Hiding a tab is not a control.** Anybody can type a URL. So the tab row decides
what is *offered*, and the address bar is tested: navigating to another role's
route reaches a refusal state **having fetched nothing at all**. Not "fetched and
refused" — no request is made, because there is no call in this app that fetches
broadly and filters afterwards.

**The visual language is v3's, byte for byte.** `app/base.css` was extracted from
`Clausewerk V3.html` rather than retyped, and a test asserts it still matches.
Decision `U8` was explicit that this is a reorganisation and not a restyling, so
`v4.css` adds only the two idioms v4 needed — the acting-as masthead and the
waiting list — and introduces no new colour and no fourth typeface.

### What is built, and what is not

The shell, the sign-in, the per-role tab sets, the requester's deal list with the
pipeline rail as an open deal's header, the administrator's people and health
panes, and the auditor's access history. Everything else renders an honest
"not built yet" naming its package — `WP-U08` through `WP-U14`.

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
   `window.CATEGORIES`, which the classifier's enum filter depends on. That filter now
   [fails closed](../docs/spec-vs-implementation.md) — a missing global means the LLM manifest is
   refused and the deterministic classifier runs — but the order is still fixed in each entry HTML
   and should be preserved.

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
