# Integrated Review — UI Design Proposal (Gate 2 artifact)

- **Contract:** OC-UIREVIEW-2026-08-04 · **Stage reached:** Integrated review (Gate 2)
- **Deliverable:** [`PROPOSAL-REVIEW-REPORT-2026-08-04.md`](../../PROPOSAL-REVIEW-REPORT-2026-08-04.md)

## Independence: DOWNGRADED — disclosed

Planned as Tier 1 (Workflow: 3 blind planners → 3 red-team auditors → integrator).
Two runs failed before producing any planner output:

| Run | Model | Failure | Tokens |
|---|---|---|---|
| `wf_bb218d0a-c2b` | Fable 5 planners | out of Fable 5 usage credits | 254,491 |
| `wf_0a340a8c-578` | Opus 5 (all agents) | session limit, resets 9pm America/Chicago | 365,501 |

Journal inspected (`journal.jsonl`): `started` entries only, no `result` lines — nothing
recoverable. Fell back to **Tier 3 (sequential role passes in one context)** per SKILL.md.

**Consequence for claim strength:** factual findings are file-and-line verifiable and stand on
their own. Judgement calls (keep the gutter; amber overloaded; defer `UX-1`) were **not
independently challenged**. Re-run available after limit reset.

## Evidence ledger

| ID | Tag | Claim | Source |
|---|---|---|---|
| EV-001 | Observed | Two rules settled 2026-08-04 (contracts zero AI chars; sourcing docs label AI spans) — proposal §1 accurate | `memory.md:4703-4731` (S225) |
| EV-002 | Observed | U8 says "reorganisation, not a restyling — no budget spent on tokens, type, chips or buttons". No "base stylesheet frozen" rule | `memory.md:1004-1005` |
| EV-003 | Observed | The base.css-untouched / additions-only convention belongs to S95, not U8; S95 also guarantees one-line reversibility to dark mode | `memory.md:2970-2982` |
| EV-004 | Observed | Provenance counts never on the contract — proposal §3.2 citation accurate | `memory.md:372-385` |
| EV-005 | Observed | 2026-07-25: AI-origin disclosure to counterparties REJECTED; EU AI Act judged not to cover B2B contract text; "to be confirmed with counsel" | `memory.md:344-356` |
| EV-006 | Observed | Tab counts: requester 6, legal_reviewer 6, legal_admin 8, auditor 5, viewer 1 | `prototype/v4/app/shell.jsx:22-78` |
| EV-007 | Observed | Sign-in states "There is no password yet. This is a development doorway" | `prototype/v4/app/shell.jsx:159` |
| EV-008 | Observed | The historical drift was four near-duplicate **stat-tile** components, already consolidated by WP-U07 — not status widgets | `prototype/v4/app/common.jsx:1-7` |
| EV-009 | Observed | Four stylesheets load in sequence (tailwind → base → v4 → parchment); 5 font families requested, 2 unused under parchment | `prototype/v4/index.html:18-35` |
| EV-010 | Observed | Gutter is 4px wide; `.g-aiapproved` and `.g-aiauthored` are the identical 45° 3px/6px hatch differing only in colour token | mockup `:189-197` |
| EV-011 | Observed | Every clause carries a plain-language origin caption independent of the gutter | mockup `:424,437,449` |
| EV-012 | Observed | Amber token serves pending chip, machine-authored mark, and waiting-row age bar simultaneously | mockup `:40,139,155,197` |
| EV-013 | Observed | Both mockup and shipped app fetch typefaces from Google's CDN at load | mockup `:14-16`; `prototype/v4/index.html:19-21` |
| EV-014 | Observed | With colour removed, the two machine-origin marks render visually identical | mockup opened in browser, grayscale filter, 2026-08-04 |
| EV-015 | Observed | Proposal's rule "tabs for five or fewer" contradicts its own exemption of the 6-tab requester | proposal §3.4 vs EV-006 |
| EV-016 | Unresolved | "European transparency duty applies from 2 August 2026" (proposal §3.7) — not independently verified; contradicts EV-005's recorded position | proposal §3.7 |
| EV-017 | Unresolved | Whether machine-authored labels travel with a sourcing document sent to suppliers | not addressed in proposal |

## Verdict summary

**Sound with corrections.** Direction accepted; four defects to fix before build; one item
(EV-016/EV-017) removed from design scope and referred to counsel.

- **KEEP:** core provenance-visible idea (§1); four honesty rules (§2); refusals list (§6);
  typography (§3.6); near-zero motion (§3.8); sign-in (§4).
- **CHANGE:** gutter encoding — shape not hue (EV-010, EV-014, blocking); reframe gutter as
  scanning aid subordinate to the caption (EV-011); correct three miscited claims (EV-002,
  EV-003, EV-008); restate current condition and re-cost UX-1 (EV-009); stop overloading amber
  (EV-012); self-host fonts (EV-013); resolve the ≤5-tab rule contradiction (EV-015).
- **DECIDE (owner/counsel):** EV-016, EV-017.
- **Decisions:** UX-1 defer & re-draft · UX-2 yes, encoding fixed first · UX-3 yes ·
  UX-4 yes, on prevention grounds not precedent.

## Unresolved for the owner

1. Counterparty-facing AI labelling on sourcing documents — legal question (EV-005, EV-016, EV-017).
2. Whether one-line dark-mode reversibility (S95) is worth preserving under a UX-1 rebuild.
3. Whether §5's 4.5:1 floor supersedes the ~4:1 chip contrast accepted at S95.

## Recommended next step

Owner reads the report and rules on UX-1..UX-4 as re-framed. If an independently challenged
version is wanted, re-run `ui-proposal-adversarial-review` after the usage limit resets.
