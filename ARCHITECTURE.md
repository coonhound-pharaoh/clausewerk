# Clausewerk — System Architecture

Reference specification derived from the V3 prototype ([`prototype/v3/Clausewerk V3.html`](prototype/v3/Clausewerk%20V3.html) + [`prototype/v3/app/*.jsx`](prototype/v3/app)).
Scope: intended functionality, the deterministic/inference split, and back- and front-end requirements.

> Where this document and the prototype disagreed, the discrepancies are catalogued — and now
> resolved — in [`docs/spec-vs-implementation.md`](docs/spec-vs-implementation.md).
>
> **Scope:** this document ends at `contract.docx`. Two companion specifications extend it:
> [`LIFECYCLE-ARCHITECTURE.md`](LIFECYCLE-ARCHITECTURE.md) (the LCMA) covers everything after
> signature, and [`CLAUSE-LIBRARY-ARCHITECTURE.md`](CLAUSE-LIBRARY-ARCHITECTURE.md) (the CLA)
> covers the library itself — fallback ladders, concessions, and version history.
>
> The CLA **changes the Review-queue behaviour described in §2.8**: accepting vendor language is a
> deal-scoped *concession*, not a new library clause. See
> [ADR-0009](docs/decisions/ADR-0009-concession-is-not-supersession.md).

---

## 1. Intent

Clausewerk is a **procurement contract assembly system**. A business requester describes an engagement in natural language; the system produces a Master Services Agreement composed **exclusively of pre-approved clause text** drawn from a Legal-maintained library, plus an audit trail explaining why each clause is present.

The organising principle: **the language model never authors contract language.** It reads, classifies, and points. A deterministic executor fetches immutable text by ID and assembles the document. Every artifact the system emits carries the count `0 LLM-authored characters` — that claim is the product.

Three consequences follow, and the whole architecture exists to serve them:

1. **Legal reviews decisions, not prose.** Reviewers verify that the right clause was chosen, not that the wording is safe — the wording was already approved.
2. **Every output is traceable.** Clause → policy citation → reviewer → approval date. A regulator or auditor can walk the chain backwards.
3. **The library is the only mutation surface.** New language enters the system through one gate (Legal verification), never through generation.

### Actors

| Actor | Role |
|---|---|
| **Requester** (business/procurement) | Describes the engagement in Intake; reviews vendor redlines in Negotiate |
| **Legal** | Maintains the Ledger; adjudicates the Review queue; signs off in the Dossier |
| **Controller** (inference) | Classifies intake into a manifest; matches vendor redlines to clause IDs |
| **Executor** (deterministic) | Resolves manifests against the Ledger; validates; renders the .docx |

---

## 2. Pipeline

```
        ┌── TIER 1 (inference) ───┐  ┌── TIER 2 ──┐  ┌── TIER 3 (deterministic) ──────────┐
        │                         │  │            │  │                                    │
Human → │ INTAKE ──→ MANIFEST     │  │  LEDGER    │  │ FORGE ─→ VALIDATE ─→ DOSSIER ─→.docx│
        │ interview  strict JSON  │  │ clause     │  │ resolve  conflict    render         │
        │                         │  │ library    │  │                                     │
        └─────────────────────────┘  └────────────┘  └─────────────────────────────────────┘
                    ▲                       ▲                        │
                    │                       │                        ▼
        ┌── TIER 1.5 ────────────┐    ┌── FEEDBACK ────┐        AUDIT LOG
        │ NEGOTIATE              │───▶│ REVIEW QUEUE   │───────▶ (append-only)
        │ vendor .docx redline   │    │ Legal verifies │
        │ → controller → ID      │    │ → new clause   │
        └────────────────────────┘    └────────────────┘
```

**The trust boundary sits between Manifest and Forge.** The manifest — a strict JSON object of `{category, severity, justification}` triples — is the *only* thing that crosses from the inference side to the deterministic side. Nothing downstream of that boundary ever sees free text produced by a model.

### 2.1 Intake (Tier 1 — inference)

A conversational risk-discovery interview conducted by an LLM playing a senior procurement attorney.

- **Framing constraint (hard):** the interview is conducted *before* a supplier is selected. Questions establish the standards the eventual contract will *impose* ("what insurance limits should we require?"), never facts to discover about a supplier ("does the vendor carry $5M cyber?"). This framing is encoded in the system prompt and is the difference between a contract-drafting tool and a vendor-questionnaire tool.
- **Rhythm:** exactly one question per turn, max two sentences, each turn targeting a different risk dimension. 8–14 turns.
- **Risk surface:** thirteen enumerated dimensions the interview must cover — what's bought, criticality, commercial shape, data exposure, security floor, IP/deliverables, acceptance & quality, operational protection, people & access, regulatory regime, physical/on-site, exit & wind-down, risk transfer.
- **Termination:** the interviewer emits the sentinel token `READY_FOR_MANIFEST` when coverage is sufficient. The UI turns that into a "generate manifest" button.
- **Auto-interview mode:** for demonstration, a second LLM instance role-plays the requester against a scripted case file, so a full interview plays out unattended. Synthetic turns are visually marked (dashed border, "Requester · synthesized").
- **Degradation:** if the LLM is unreachable, a deterministic 31-probe checklist takes over — ordered regex gap-detection against the transcript, asking about the first uncovered dimension. The interview continues, visibly labelled `· local`.
- **Live detection sidebar:** a deterministic keyword classifier runs continuously over the transcript and shows which categories are being picked up. This is a *preview*, not the classification of record.

### 2.2 Manifest (the contract between tiers)

```jsonc
{
  "vendor": "Northwind Analytics",
  "value":  "$240K",
  "source": "llm" | "fallback",
  "risks": [
    { "category":  "Data Privacy",     // MUST be one of the enumerated category labels
      "severity":  "High" | "Standard",
      "justification": "one sentence quoting or paraphrasing the conversation" }
  ]
}
```

Generation is inference; **validation is deterministic**. The classifier output is parsed, code-fence-stripped, JSON-parsed, and then filtered: any risk whose `category` is not in the canonical `CATEGORIES` enum is **dropped**, and `severity` is coerced to the two-value enum. A hallucinated category cannot survive the boundary. The manifest is human-editable in the Manifest panel (form or raw JSON) before it is handed to Forge.

Fallback classifier: ~100 regex `KEYWORD_RULES`, each `{test, category, severity, reason}`, highest-severity-wins per category, unioned with eight always-on `BASELINE_CATEGORIES`.

### 2.3 Ledger (Tier 2 — the clause library)

The single source of contract language. Two populations:

- **`INITIAL_LEDGER`** — risk-responsive clauses, ~30 categories × {Standard, High} variants, each with a stable ID (`DP-H-014`) encoding category short-code, severity, and sequence.
- **`BASELINE_FRAMEWORK`** — cross-cutting boilerplate (Definitions, Order of Precedence, Entire Agreement, Notices, Severability, Survival, Assignment, Anti-Corruption…) flagged `alwaysInclude: true` and carrying a `frameworkSection` number. These land in every contract regardless of what Intake found.

Every record is enriched at read time by `enrichLedger()` with a metadata overlay:

| Field | Purpose |
|---|---|
| `rationale` | The "why" — shown to reviewers, never inserted into the contract |
| `citations[]` | Policy/statute references (`GDPR Art. 28–33`, `Policy-DP-014 §3`) |
| `created` / `expires` | Temporal validity; default 2-year expiry from creation |
| `reviewer` | Named Legal owner |
| `active` | Kill switch — false if manually retired **or** past expiry |
| `daysToExpiry`, `expiresSoon` | Derived; drives the 90-day expiry warning |
| `vectorBuckets[]` | `{scope, score}` — what this clause is semantically *for* |

Expiry is computed, not stored: a clause silently leaves the selectable pool on its expiry date. `SC-RETIRED-01` exists in the seed data specifically to demonstrate the kill switch.

The Ledger panel provides search, category/severity/status filtering, a **coverage-gap** computation (category × severity combinations with no active clause), and full CRUD with the same metadata fields Legal would fill in production.

### 2.4 Forge (Tier 3 — deterministic resolution)

`resolveClauses(manifest, ledger) → Decision[]`. Pure function. No network, no model.

1. **Baseline pass.** Every `alwaysInclude && active` clause is emitted first as a synthetic decision with severity `Baseline` and reason `Always-include · Baseline Framework §n`.
2. **Manifest pass.** For each risk: candidates = active ledger clauses in that category, *excluding* `alwaysInclude` entries (already placed).
   - No candidates → `{selected: null, reason: 'No clause available in Ledger'}` — a hard flag, not a guess.
   - Exact severity match → selected.
   - Otherwise → fall back to the Standard variant, reason recorded as `No {severity} variant; fell back to {sev}`.
   - All non-selected candidates are recorded as `suppressed[]`. **Suppression is retained, not discarded** — the audit story requires showing what lost.

Decision record: `{risk, selected, suppressed[], reason, baseline?}`.

The panel stages this as three visual beats per risk (query → resolve → land) alongside a live Python-style console (`>>> resolve('Data Privacy','High')` … `← DP-H-014`). The theatre is presentation only; the resolution is synchronous and instant.

### 2.5 Validate (deterministic guardrail)

Pairwise contradiction rules run over the assembled decision set. Each rule is a pure `(decisions) => Finding | null`. Currently:

| Rule | Detects |
|---|---|
| Mixed governing law / dispute seat | Governing-law jurisdiction ≠ dispute-forum jurisdiction |
| Incompatible liability carve-outs | Indemnity uncaps claims the cap clause doesn't mirror |
| SLA vs termination mismatch | ≥99.9% uptime commitment paired with soft 30-day convenience exit |
| Regulated data + baseline insurance | GDPR/HIPAA/GLBA processing with no cyber-liability coverage |

Findings are `{rule, severity, title, detail, refs[]}`. High-severity findings **gate** progression to Dossier; the gate can be explicitly overridden by a human, and the override is a recorded act. Validation re-runs automatically whenever `decisions` changes.

### 2.6 Dossier (output)

Two views over the same decision set, **audit-first by default**:

- **Audit trail** (default) — one row per decision: LLM justification (serif italic, quoted) beside the selected clause text, clause ID in the gutter, and a per-row sign-off checkbox persisted locally. This is the compliance artifact.
- **contract.docx** — the rendered document: title block, numbered sections (`§ 1 · DATA PRIVACY`), clause IDs as marginalia in a left gutter, drop cap, footer carrying the clause count and the zero-authored-characters assertion.

Export produces a **real OOXML .docx** built client-side with JSZip — `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`, `word/_rels/document.xml.rels` — with Title/Subtitle/Heading2 styles and Letter page geometry. Plaintext fallback if JSZip is unavailable.

An Outbox panel represents the delivery targets (SharePoint contract path, audit workbook, Legal notification) — narrative in the prototype, real integrations in production.

### 2.7 Negotiate (Tier 1.5 — the redline loop)

Vendor counsel returns a redlined .docx. The system must decide whether the vendor's ask maps to an already-approved position.

**Parsing (deterministic).** `parseRedlineDocx()` unzips the file, DOM-parses `word/document.xml`, and walks each `<w:p>`, classifying children as `keep` (`<w:r>`), `ins` (`<w:ins>`), `del` (`<w:del>`, reading `<w:delText>`). It emits **one redline object per changed paragraph** — so a four-change document becomes four independently-adjudicated negotiation points, grouped in the inbox as one batch. Each carries stitched surrounding context (±160 chars), an inferred category (best-scoring `KEYWORD_RULES` hit over the paragraph), extracted match keywords, tracked-change counts, and author/date from the first tracked change.

**Matching (inference-shaped, deterministic in the prototype).** The controller scores every active clause in the inferred category:

```
base 0.42 (uploaded) / 0.50 (curated)
 + 0.18/0.25  category match
 + 0.10       severity match
 + 0.06/0.04  per keyword hit in clause text
 + 0.03       per keyword hit in clause title
 + 0.08       bonus at ≥3 keyword hits
 + 0.15       curated preferredId
 → capped 0.98, thresholded at tweaks.similarityThreshold (default 0.78)
```

Below-threshold in-category → widen to the full active ledger → still nothing → **escalate**, never invent. Top-3 candidates are shown with scores; the top one is returned.

**The critical constraint:** the controller returns *an ID and nothing else*. The visible trace makes this legible:

```
  → select_id("DP-H-014")
[exec] python_docx.replace(run_id="RL-2026-0418", clause_id="DP-H-014")
[exec] fetch_immutable_text("DP-H-014") → 412 chars
[exec] ✓ substitution complete
```

**Three human outcomes:** approve (insert the immutable text), edit (submit modified text for Legal review), or escalate (send to Legal untouched). Edits and escalations both create Review tickets; approvals do not.

### 2.8 Review queue (the mutation gate)

The only path by which new language enters the Ledger. Each ticket carries full provenance: the original redline segments, the vendor's comment, the AI candidate with its rationale/citations/score, the alternates, and the reason code (`no-ai-match` / `human-escalated` / `human-edit`).

Legal sees the redline diff on paper stock beside an editable proposed-text field, pre-loaded from **the vendor's accepted language** (keep + ins segments, del dropped) with a one-click toggle to load the AI candidate instead. Source provenance is tracked and badged: `VENDOR LANGUAGE` / `AI CANDIDATE` / `EDITED BY LEGAL`.

- **Verify** → confirmation modal showing exactly what will be promoted → new clause minted with derived rationale, `Policy-DERIVED-*` citation, today's creation date, 2-year expiry, named reviewer → appended to the Ledger → the buyer is notified in their Negotiate inbox.
- **Reject** → mandatory-in-practice rejection note → returned to the buyer with the rationale visible.

This is the learning loop, and it is deliberately slow and human-gated.

### 2.9 Audit log

Append-only record of every controller and human act: `{ts, actor: 'controller'|'human', type, vendor, redline, clause_id, pending_id, score}`. Event types: `ai_suggest`, `ai_no_match`, `human_approve`, `human_edit_submit`, `human_escalate`. Table and timeline views, actor filter, CSV export.

---

## 3. Deterministic systems boundary

Everything below is rule-based, reproducible, and testable. Given identical inputs it produces byte-identical outputs, and it is the *only* code path that touches contract language.

| Subsystem | Nature |
|---|---|
| Manifest schema validation | Enum filter on category, coercion on severity, drop-unknown |
| Clause storage & retrieval | Keyed by immutable ID |
| Metadata enrichment (`enrichLedger`) | Pure overlay + derived expiry/active computation |
| Expiry & kill-switch evaluation | Date comparison against clause `expires`; `active` gate |
| Baseline framework injection | `alwaysInclude && active` filter |
| Clause resolution (`resolveClauses`) | Category filter → exact-severity match → Standard fallback → suppression list |
| Unmatched-category flagging | Explicit null decision, never substitution |
| Conflict validation | Pairwise pure predicates over the decision set; gate |
| Coverage-gap computation | Set difference over category × severity |
| Document assembly (`assembleDossier`) | String composition from clause text only |
| .docx generation (`buildDocx`) | OOXML emission via JSZip |
| .docx redline parsing | XML DOM walk of `w:ins` / `w:del` / `w:r` |
| Similarity scoring | Fixed additive weights + threshold |
| Text substitution | `fetch_immutable_text(id)` → verbatim insertion |
| Audit logging | Append-only, timestamped, actor-tagged |
| Fallback classifier | ~100 regex rules + 8 baseline categories |
| Fallback interviewer | 31-probe ordered gap checklist |

**Invariant:** no string that reaches a contract document was produced by a model. Clause text is either (a) seeded by Legal, or (b) promoted through the Review queue by a named human.

---

## 4. Inference systems boundary

The model is used in exactly three places, each with a narrow contract and a deterministic fallback.

| # | Use | Input | Output | Failure mode |
|---|---|---|---|---|
| 1 | **Interviewer** | Conversation transcript + risk-surface prompt | One question, ≤2 sentences, or `READY_FOR_MANIFEST` | Regex gap-checklist question, flagged `· local` |
| 2 | **Classifier** | Full transcript + allowed-category enum | Strict JSON manifest | Keyword-rule classifier, `source: 'fallback'` |
| 3 | **Redline matcher** | Parsed redline + active clause pool | A clause **ID** and a score | Escalate to Legal |
| (4) | *Requester simulator* (demo only) | Scenario case file + attorney's question | An in-character answer | Canned deferral line |

### Hard prohibitions

- The model **never** writes, paraphrases, summarises, or "improves" clause text.
- The model **never** selects a clause outside the enumerated, active, in-category pool.
- The model **never** invents a category — unknown categories are dropped at the boundary.
- The model **never** commits anything to the Ledger. Only a named human, through Review, can.
- The model **never** overrides a validation gate. Only a human override, recorded, can.

### What the model is trusted with

Judgment about **which question to ask next**, **what risks a described engagement implies**, and **which approved position a vendor's ask corresponds to**. All three are recommendations that a human sees, and all three produce artifacts (justification text, clause ID, similarity score) that a human can check against the source.

### Observability

Every inference call surfaces its reasoning in the UI: the interview transcript is the interviewer's record, `justification` per risk is the classifier's record, and the live controller trace is the matcher's record. Nothing infers silently.

---

## 5. Backend requirements (production)

The prototype runs entirely client-side. A production deployment needs:

**Services**

| Service | Responsibility |
|---|---|
| Intake service | Session state, conversation persistence, LLM proxy with prompt versioning |
| Classification service | Manifest generation, schema validation, category enum enforcement |
| Clause registry | CRUD over the library, versioning, effective-dating, approval workflow |
| Vector index | Embeddings per clause `vectorBucket`; k-NN retrieval for the redline matcher |
| Resolution engine | `resolveClauses` as a pure service — the prototype's Python framing (`resolve()`, `python_docx.replace()`) is the intended shape |
| Validation engine | Rule catalogue, versioned; gate decisions recorded |
| Document service | python-docx generation, tracked-change parsing, template management |
| Audit service | Append-only, tamper-evident (hash-chained), exportable |
| Notification service | Legal review assignment, buyer notification on ticket resolution |

**Data stores**

- **Clause registry** (relational): clause records, versions, category/severity, policy citations, reviewer, created/effective/expiry, active flag, supersession links. *Versioned, never overwritten* — a contract executed under v1 must still resolve v1.
- **Vector store**: per-clause embeddings with scope metadata; rebuilt on clause promotion.
- **Run store**: sessions, transcripts, manifests, decision sets, validation findings, generated document references.
- **Audit log**: append-only, hash-chained, 7-year retention to match the Records Retention clause the system itself issues.
- **Review queue**: tickets with full provenance payload and state machine (`pending → verified | rejected`).

**Integrations**

- SharePoint / O365 — clause library sync, contract outbox, audit workbook
- Identity (SSO + RBAC): Requester / Legal reviewer / Legal admin / Auditor. Only Legal admin can activate clauses; only Auditor-and-above can read the full log.
- E-signature handoff
- LLM provider with per-call logging: prompt version, model version, tokens, latency, raw response retained for audit

**Non-functional**

- Determinism guarantee: given a manifest and a library snapshot ID, resolution must be reproducible forever. Pin the library version into every run record.
- Model-version pinning; a model upgrade is a change-controlled event because it changes classification behaviour.
- Every inference call is logged with its input, output, and the human decision that followed.
- Full degradation path: with the LLM offline, the system must still run interview → manifest → resolution → document via the deterministic fallbacks.
- Latency budget: resolution and validation are synchronous (<200ms); inference calls are async with visible progress.

---

## 6. Frontend requirements

**Stack (prototype):** React 18 UMD + Babel standalone, Tailwind CDN, JSZip. Nine `.jsx` modules loaded as `text/babel`, sharing scope via `window` exports. State lives in one orchestrator (`ClausewerkApp`) and flows down as props — no state library, no router.

**Persistence:** `localStorage` under `clausewerk.v3.1` (ledger, audit log, review queue), `clausewerk.v3.seen` (intro), `clausewerk_signed` (dossier sign-offs). Production moves all of this server-side; only view preferences stay local.

**Structural requirements**

- **Masthead + tab nav.** Wordmark, current run subject, a full-sentence status ("Matching against the ledger…", not `forging`), demo/architecture/reset controls.
- **Pipeline rail.** 72px left rail; five nodes (Intake → Manifest → Ledger → Forge → Dossier) each showing live state (done / running / ready / waiting) and a hover summary. Clickable — it is navigation, not decoration.
- **Scale strip.** 28px persistent footer: version, live run state, library scale readout.
- **Nine panels**, each owning its own header (tier kicker, serif display title, one-line subtitle) and empty state that names the missing prerequisite and links to it.

**Interaction requirements**

- Every automated step must be *watchable*: staged Forge beats, live console output, streamed interview turns, controller trace. The pitch is auditability; invisible automation defeats it.
- Every AI output must be adjacent to its evidence: justification beside clause text, similarity score beside candidate ID, alternates always visible.
- Every gate must be explicit: validation blocks, override is a distinct act, verification requires a confirmation modal that states exactly what is being promoted.
- Redlines render as **paper** — cream stock, serif, standard `ins`/`del` colouring — because reviewers read documents, not diffs.
- Synthetic content is always marked (dashed borders on simulated requester turns, `UPLOADED` / `NO AI MATCH` / `VENDOR LANGUAGE` badges).

**Design system**

- Dark editorial: `--bg #0B0D10`, two surface tiers, two hairline weights, `--accent` oklch(0.82 0.13 175) teal, `--accent-2` amber, `--danger` red **reserved for errors only** — severity uses filled-vs-outlined chips, never red.
- Type: Instrument Serif for panel titles, document body, and quoted justifications; Inter for UI; JetBrains Mono for IDs, timestamps, traces, and all numerics (`tabular-nums` throughout).
- Motion carries meaning: `beam-drop` (query), `strike-out` (suppression), `stamp-in` (selection), `pulse` (in-flight).

**Tweaks (runtime configuration)**

`similarityThreshold` (0.50–0.95), `strictMode` (active clauses only), `autoApprove` (≥0.90), `showTrace`, `density`. In production these are org-level policy settings under Legal's control, not per-user preferences.

**Accessibility & scale targets:** 44px minimum hit targets, WCAG 2.1 AA contrast (the system issues an accessibility clause; it should satisfy it), keyboard-navigable queue and tab structures, and layouts that hold at 1280px minimum width with ~500-clause libraries (virtualised Ledger and Audit tables).

---

## 7. Prototype fidelity

Real in the prototype: OOXML .docx generation, .docx tracked-change parsing, clause resolution, conflict validation, expiry/kill-switch logic, the full Negotiate → Review → Ledger learning loop, audit logging and CSV export, and live LLM calls for all three inference roles.

Narrative in the prototype: SharePoint/O365 sync, the "python executor" (JS running under a Python-shaped trace), true vector embeddings (additive keyword scoring stands in), multi-user identity and RBAC, server persistence, and e-signature.

Nothing in the narrative set changes the architecture — each is a substitution of transport, not of logic.
