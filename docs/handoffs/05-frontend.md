# Handoff · Frontend

**State: specified, and a working prototype exists.** No production frontend has
been started. The prototype is the design reference and is genuinely runnable.

---

## 0. Ground rules (repeated in every handoff — read them)

**The owner is Mike.** `CLAUDE.md` at the repo root auto-loads and is binding:
simple solutions; **plain business language, never developer jargon**; important
decisions recorded in [`../../memory.md`](../../memory.md) in plain language;
naming and branding are the owner's alone — **do not rename anything.**

**The invariant**, as amended by
[ADR-0010](../decisions/ADR-0010-ai-drafted-clause-candidates.md):

> No contract language reaches an agreement without a named human's approval,
> and the origin of every clause is recorded on it permanently.

**Every guarantee has a mutation check.** Eleven real faults have been found that
way. If you add a UI guarantee that matters (a gate, a badge, a blocked action),
test it the same way.

---

## 1. What exists

[`../../prototype/v3/`](../../prototype/v3) — `Clausewerk V3.html` plus 18 `.jsx`
modules. **Open the HTML directly in a browser**; no build step, no server. React
18 UMD, Babel standalone, Tailwind and JSZip from CDNs, so it needs network
access.

It implements nine panels: Intake, Manifest, Ledger, Forge, Validate, Dossier,
Negotiate, Review, Audit. It is not a mockup — it parses real `.docx` tracked
changes, generates real OOXML, and runs the resolution logic.

**Eight defects were found and fixed in it** — see
[`../spec-vs-implementation.md`](../spec-vs-implementation.md). Notably the
expiry clock is now live rather than frozen, and retired clauses can no longer be
selected. Do not treat the prototype as unmaintained; it is the reference.

`prototype/v2/` and `prototype/pitch/` are historical. Leave them alone.

## 2. The design system (ARCHITECTURE.md §6)

- Dark editorial. `--bg #0B0D10`, two surface tiers, two hairline weights,
  `--accent` teal, `--accent-2` amber. **`--danger` red is reserved for errors
  only** — severity uses filled-vs-outlined chips, never red.
- Instrument Serif for panel titles, document body and quoted justifications;
  Inter for UI; JetBrains Mono for IDs, timestamps and all numerics.
- Motion carries meaning: `beam-drop` (query), `strike-out` (suppression),
  `stamp-in` (selection), `pulse` (in-flight).

## 3. The rules that are not decoration

These come straight from the architecture and they are the product, not styling:

- **Every automated step must be watchable.** Staged resolution beats, live
  console output, streamed interview turns, the controller trace. The pitch is
  auditability; invisible automation defeats it.
- **Every AI output sits next to its evidence.** Justification beside clause
  text, similarity score beside candidate ID, alternates always visible. A
  recommendation without its evidence is an assertion, and this system does not
  make assertions.
- **Every gate is explicit.** Validation blocks; override is a distinct act;
  promotion needs a confirmation modal stating exactly what is being promoted.
- **Synthetic and non-approved content is always badged** — `UPLOADED`,
  `NO AI MATCH`, `VENDOR LANGUAGE`, dashed borders on simulated turns.
- **Redlines render as paper** — cream stock, serif, standard ins/del colouring.
  Reviewers read documents, not diffs.
- Accessibility: 44px hit targets, WCAG 2.1 AA contrast (the system issues an
  accessibility clause; it should satisfy it), keyboard-navigable queues, holds
  at 1280px with ~500-clause libraries (virtualise the Ledger and Audit tables).

## 4. New surfaces the specs now require

Not in the prototype. Each is specified in its own document:

| Surface | Source |
|---|---|
| Ladder editor — rungs top to bottom, **floor visually absolute**, concession rate per rung | CLA §10 |
| Concession explorer — filterable by clause, counterparty, sector, value, depth | CLA §10 |
| Proposals queue — each with the evidence that generated it | CLA §10 |
| Negotiation rounds and **positions across rounds** | NA §2 |
| Round analysis with **alternatives** — our opening, ladder rungs, the floor, comparable deals | NA §4 |
| Clause Library Builder — draft review, with **unedited-approval visibly recorded** | NA §5 |
| Portfolio / Agreement / Calendar / Disposition | LCMA §9 |

## 5. Traps

- **Concession data is the most commercially sensitive thing in the system.** A
  viewer must never see it. The backend enforces this, but a UI that fetches it
  for a viewer and hides it client-side is a leak.
- **The floor is not a stronger warning.** It is absolute, and must look it.
- **Entitlements as prominent as obligations.** A UI showing only duties trains
  people to treat the system as a compliance chore rather than a source of
  recoverable value.
- **Nothing closes silently.** Satisfaction shows evidence and a named closer.
- **The prototype's persistence is `localStorage`.** Production moves all of it
  server-side; only view preferences stay local.
- Severity in red is a recurring temptation and is wrong — red means error.

## 6. Where to start

1. Open `prototype/v3/Clausewerk V3.html` and use it. Twenty minutes there is
   worth more than reading §6.
2. Read `ARCHITECTURE.md` §6, then the frontend sections of the CLA, NA and LCMA.
3. **No production stack has been chosen.** The backend is Python plus
   PostgreSQL on Supabase; the prototype is React-from-CDN. Choosing the real
   stack is an open decision — raise it with Mike rather than assuming.
4. Nothing exists to call yet: there is no HTTP API. See
   [`01-assembly-backend.md`](01-assembly-backend.md) §5 — the service layer is
   the missing piece between you and the engine.
