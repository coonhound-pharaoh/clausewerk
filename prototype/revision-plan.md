# Clausewerk — Revision Plan v1
**Scope:** fix all 15 issues identified in the design review. Organized by area, sequenced for minimum rework.

---

## Phase 1 — Foundations (touches every screen)

### R1. Rework the top bar into a proper masthead
**Fixes:** #1, #15
- Split into two rows: **masthead** (row 1) + **tab nav** (row 2).
- Row 1 (52px): Clausewerk wordmark set in Instrument Serif (22px, tracking -0.02), a thin vertical rule, then the current-run subject in mute ("Northwind Analytics · $240K MSA" when active, else a tagline: *Contract assembly for procurement*). Far right: the human-language status sentence + a single ghost "↺ reset" button.
- Row 2 (44px): the 5 tabs, left-aligned, with a single accent underline on active. Drop the `T1/T2/·` inline kickers — move them into tab tooltips or into each panel's own header.
- Wordmark lockup: replace the generic checkmark-in-square with a **CW monogram** in Instrument Serif, set in a 24px square with a 1px rule. Refined, newspaper-masthead energy.

### R2. Human-language status system
**Fixes:** #9
- Replace status tokens (`idle`, `thinking`, `classifying`, `forging`) with a `statusMessage` state that carries a full sentence.
- Mapping:
  - `idle` → "Ready" (on Intake: "Intake is listening"; on Ledger: "16 clauses on file"; on Forge: "Awaiting manifest" or "Pipeline ready")
  - `thinking` → "Intake is composing a question…"
  - `classifying` → "Building the manifest…"
  - `forging` → "Matching against 16 approved clauses…"
  - after dossier: "Dossier assembled · posted to SharePoint"
- Status dot colors: mute-2 for ready, accent-2 for in-flight, accent for complete.

### R3. Severity chip system
**Fixes:** #4
- Drop red from severity. Red is reserved for *errors* (missing clauses, validation failures).
- New scheme:
  - **Standard** → outlined chip, ink text, `hair-2` border.
  - **High** → filled chip, `var(--accent)` background on a tinted panel. Weight 600.
- Keep `--danger` (red) for: unmatched categories, validation errors, destructive actions only.
- Apply across Intake sidebar, Manifest form/JSON, Forge rows, Dossier audit.

### R4. Typography overhaul
**Fixes:** #5, #15
- Commit Instrument Serif to the **four nouns**: *Intake, Manifest, Ledger, Forge, Dossier* — as each panel's large title (36px).
- Add a display size: each panel gets a h1 at 36–44px in the serif as a resting point. Subtitle in Inter 14px mute.
- Tab labels: switch to Inter 13px weight 500, tracking -0.01. Remove the Tx kicker; keep the active-underline.
- Body text: keep 13–14px, but re-introduce one 11px caption tier (currently everything non-tag is 12–14).
- Section titles inside panels in Inter 600, 14px, tracking +.02em uppercase — reserve `.tag` for truly meta labels.

### R5. Surface/border discipline
**Fixes:** #6
- Define three background tones: `--bg` (canvas), `--surface` (panels), `--surface-2` (nested cards). Lean on luminance, not borders.
- Borders **only** on: interactive controls (buttons, inputs, select), actively-selected items, and the masthead/panel seams.
- Remove `panel-2`'s border; replace with a +4% luminance lift.
- Drop all `rounded-[4px]` on non-interactive elements — decoration only on buttons/inputs. Panels go square-cornered for a more editorial feel.

---

## Phase 2 — Core screens

### R6. Intake empty state (hero moment)
**Fixes:** #3
- Split-pane layout.
- **Left (420px):** full-height brand statement.
  - Kicker: "Tier 1 · Intake"
  - Serif h1 (44px): *"Describe the engagement. We'll do the rest."*
  - One paragraph (14px, 420 max): "Clausewerk interviews the requester, classifies risk, and assembles a contract from pre-approved language. Start with a scenario or type your own."
  - Footer line: "16 clauses on file · 8 risk categories"
- **Right (flex-1):** four **named scenarios** as full-bleed cards, 2×2:
  - *Northwind Analytics* — EU data, prod workload, $240K
  - *Lumen & Brand* — one-off agency, $18K, no data
  - *Paydrive HCM* — renewal, offshore, $480K mission-critical
  - *Orchid AI* — white-label resale, derivative works
  - Each card: vendor name (serif, 20px), one-line scope, small tag row (data / value / risk count estimate), hover → lift + accent border.
- Remove the current "Sample 1" button list.

### R7. Left pipeline rail — earn its space or die
**Fixes:** #2
- **Make it functional, not decorative.** Width stays 64px but each node:
  - Click → jump to that tab (replaces half the top-bar nav purpose; keep tabs for fast-switching).
  - Shows a live state badge: ✓ / ● / ○ / ▪ (done / running / ready / not-yet-reachable).
  - Hover → popover with the live artifact summary ("5 risks · 3 High" on Manifest; "5 selected · 3 suppressed" on Forge).
  - On hover, the thin connector between nodes draws in with `flow-line`.
- On completion, each node shows a micro-timestamp ("12s ago") so the rail doubles as a run log.

### R8. Manifest panel polish
**Fixes:** uses R3, R4, R5
- Serif h1 "Manifest" + subtitle "A strict JSON handshake between Intake and Forge."
- Replace metadata sidebar cards with a typographic stack (label + value, no card chrome).
- Distribution row (DP / ID / IP… swatches) → full-width strip under the header, slightly taller (32px), with clicking a swatch scrolling to that row.
- Form/JSON toggle → segmented control in serif caps, feels editorial.

### R9. Ledger → "Vault" presentation
**Fixes:** #10, #14
- Rename the screen display to **Ledger / Vault**. Panel subtitle: "16 pre-approved clauses · maintained by Legal · synced from SharePoint."
- Add a top stat strip (4 tiles): *Clauses · Categories · Last update · Coverage gaps*.
- **Coverage gaps tile:** computed — any (category × severity) with no clause. Clickable. When a gap is visible, the filter sidebar shows a ⚠ badge next to that category.
- Row-level "No match" error → replaced with an empty-state card inline: "No High-severity clause for SLA & Uptime. Add one →" with an inline "+ add" that pre-fills the editor.
- Ledger rows: drop the table borders; use zebra via background luminance; add a left-margin "shelf label" showing the category short-code (DP, ID, IP) set in the serif italic — feels like library card catalog.

### R10. Forge — the money shot
**Fixes:** #7
- Restructure run animation into three theatrical beats per risk:
  1. **Query** (300ms): category label pulses; a vertical shaft of light drops from the manifest row into the ledger list; candidate rows highlight.
  2. **Resolve** (500ms): losing candidates strike through and slide up & out to the left; the winning clause ID "stamps" into the Resolution column — small scale-in (1.08 → 1.0) + brief accent glow.
  3. **Land** (200ms): row locks; checkmark draws into the done column.
- Add a running counter in the header: "Clauses selected: 3 / 5". Font-variant-numeric: tabular-nums.
- Add an "audible-but-silent" visual heartbeat: a single 1px line under the progress bar that sweeps left-to-right once per resolution.
- Include a real "python traceback" style console on the right (optional collapsible panel) printing `resolve('Data Privacy', 'High') → DP-H-014` live. Speaks CIO language.

### R11. Dossier — make it feel like a document
**Fixes:** #8, #13
- **Swap primary tab order:** default view is now **Audit summary** (justification ↔ selected clause). This is the compliance story the CIO came for. Rendered contract is the secondary tab.
- Rendered contract tab:
  - Paper: warm cream `#F5F1E8` with a 1px interior rule at the outer margin (like printed legal).
  - Add a left gutter (80px) carrying clause IDs in 9pt mono italic — as true marginalia, not inline labels.
  - Section 1: small-caps section number ("§ 1 · DATA PRIVACY") + a thin horizontal rule above.
  - Drop cap on the first clause's first letter (Instrument Serif, 48px, float-left, 3 lines).
  - Page footer: "Dossier · Clausewerk · {{run_id}} · Page 1" in 9pt mono.
  - Soft paper shadow (no drop-shadow; use a 2-layer inset-style stacked shadow for depth).
- Audit view:
  - Two-column layout per row: LLM justification (serif italic, 15px, with a quote-mark glyph) paired with the selected clause preview (14px regular). Clause ID in mono, set in the gutter.
  - Add a "signed off" slot per row — a checkbox the reviewer can tick, persisting to localStorage.

---

## Phase 3 — Narrative & scale cues

### R12. Architecture intro overlay
**Fixes:** #11
- On first visit (checked via localStorage `clausewerk.seen`), play a 6-second intro:
  - Three horizontal planes labeled *Intake · Ledger · Forge* fade in, stacked isometrically.
  - A JSON packet animates from Intake → Forge; a cluster of clause IDs animates Ledger → Forge; a .docx tile falls out.
  - Skippable ("skip · press any key"). Ends by morphing into the masthead.
- Persistently accessible via a small "architecture" link in the masthead (opens a modal version of the same animation, pauseable).

### R13. Demo mode
**Fixes:** #12
- Add a "▶ Demo" button in the masthead (right of status).
- Runs a scripted 90-second walkthrough:
  - t=0 — Intake chat auto-types the Northwind scenario; LLM replies play in at realistic cadence.
  - t=25s — Auto-clicks "Generate manifest"; caption overlay: *"Intake emits a validated JSON payload — the only thing crossing the trust boundary."*
  - t=40s — Jumps to Forge; pipeline runs with theatrical beats enabled (R10); caption: *"Python picks the highest-priority clause per category. Deterministic. Auditable."*
  - t=70s — Dossier appears in Audit view; caption: *"Every clause traces back to a justification. Legal reviews, they don't redraft."*
  - t=88s — Fade to a summary frame: "5 risks · 5 clauses · 0 LLM-authored characters · 47 seconds."
- Captions render in a bottom strip (not modal) so the UI stays visible.
- Pause/exit at any time; state is preserved.

### R14. Persistent system-scale strip
**Fixes:** #10
- Slim (28px) footer across all tabs:
  - Left: "Clausewerk · v0.3"
  - Center: live run state ("Northwind · Manifest validated · Awaiting Forge")
  - Right: scale readout — "16 clauses · 8 categories · 46 rule combos · last synced 3m ago"
- Mono, 11px, mute-2. Feels like a workbench status bar.

---

## Phase 4 — Cleanup

### R15. Brand lockup commitment
**Fixes:** #15 (polish)
- Final wordmark: **CW** monogram (Instrument Serif, letter-spaced -3px, 20px) inside a 28px square outlined in `hair-2`, to the left of "Clausewerk" set in Instrument Serif 22px, tracking -0.02.
- Beneath, in mute-2 Inter 10px uppercase: "Procurement contract assembly".
- Use the monogram alone as the favicon/tab bezel in compact layouts.

---

## Sequencing

1. **Phase 1** first — foundations propagate to everything.
2. **R6 (Intake hero)** + **R10 (Forge animation)** next — highest pitch impact.
3. **R11 (Dossier as document)** — locks in the compliance story.
4. **R13 (Demo mode)** last — needs the prior work to script against.
5. R7, R9, R14 in parallel with Phase 2.

## Out of scope for this revision
- Real SharePoint/O365 integration (keep as narrative).
- Multi-user state / auth.
- A PDF export path (could be a Phase 5).
