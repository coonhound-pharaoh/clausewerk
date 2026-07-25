# Data model

Every record shape in the system, consolidated. [`ARCHITECTURE.md`](../ARCHITECTURE.md) introduces
these in the sections where they arise; this collects them so the whole schema is visible at once.

**Provenance.** Each record below is marked:

- **`[code]`** — field names read from the ingested prototype under
  [`prototype/v3/app/`](../prototype/v3/app). These are what the running system actually uses.
- **`[spec]`** — described in `ARCHITECTURE.md` but not verified against source here. Treat the
  names as indicative, not authoritative.

Where a **`[code]`** name differs from the prose in `ARCHITECTURE.md`, the code name is given and
the divergence is noted — see
[spec-vs-implementation §7](spec-vs-implementation.md#7-clause-field-naming-diverges-from-the-prose).

---

## Category `[code]`

The enumeration every other record keys off. 48 entries in `data.jsx`.

```js
{ key: 'data', label: 'Data Privacy', short: 'DP' }
```

| Field | Type | Notes |
|---|---|---|
| `key` | string | Internal handle |
| `label` | string | **The canonical string.** Manifest `category` values must match exactly |
| `short` | string(2) | Category code embedded in clause IDs |

Two categories share the short code `AC` (Acceptance, Anti-Corruption) —
[see finding #4](spec-vs-implementation.md#4-category-short-code-collision-ac).

`BASELINE_CATEGORIES` `[code]` is a separate list of eight labels the fallback classifier always
emits: Liability Cap, Termination, Payment Terms, Confidentiality, Compliance, Governing Law,
Force Majeure, Change Control.

---

## Clause `[code]`

The unit of contract language. Seeded in `data.jsx`, then overlaid by `enrichLedger`
(`v3_metadata.jsx`) at read time.

### As seeded

```js
{ id: 'DP-H-014',
  cat: 'Data Privacy',
  sev: 'High',
  title: 'Data processing — GDPR / regulated',
  text: 'Controller agrees to process Personal Data strictly in accordance with…' }
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Immutable. `{short}-{S\|H}-{seq}` — the unit of reference everywhere |
| `cat` | string | Must match a `CATEGORIES[].label` |
| `sev` | `'Standard' \| 'High'` | Prose calls this "severity" |
| `title` | string | Reviewer-facing label. **Never enters the contract** |
| `text` | string | **The only string permitted to reach a contract document** |
| `alwaysInclude` | bool? | Baseline Framework member — lands in every contract |
| `frameworkSection` | number? | Ordering within the Baseline Framework |

### After `enrichLedger`

Resolution order per field is `V3_METADATA[id]` → clause's own value → computed default.

| Field | Type | Default when absent |
|---|---|---|
| `rationale` | string | `Pre-approved {sev} clause for {cat}.` — shown to reviewers, **never inserted into the contract** |
| `citations[]` | string[] | `['Policy-{id}']` |
| `created` | date | `'2024-01-01'` |
| `expires` | date | `created` + 2 years |
| `reviewer` | string | `'Legal'` |
| `active` | bool | **Computed**: `(meta.active !== false && c.active !== false) && !isExpired` |
| `retiredReason` | string \| null | `null` |
| `daysToExpiry` | number | Derived; negative once expired |
| `expiresSoon` | bool | `0 < daysToExpiry <= 90` — drives the expiry warning |
| `expired` | bool | Derived |
| `vectorBuckets[]` | `{scope, score}[]` | `[{ scope: cat, score: 0.85 }]` |

`active` is the kill switch: false if manually retired **or** past expiry. Expiry is evaluated
against a [hard-coded date](spec-vs-implementation.md#6-expiry-is-evaluated-against-a-frozen-clock).

---

## Manifest `[code]`

The trust boundary. The only artifact crossing from inference to determinism.

```js
{ vendor: 'Northwind Analytics',
  value:  '$240K',
  source: 'llm',
  risks: [ { category: 'Data Privacy', severity: 'High', justification: '…' } ] }
```

| Field | Type | Notes |
|---|---|---|
| `vendor` | string | Falls back to `'Unnamed vendor'` |
| `value` | string \| null | Free-form (`'$240K'`) |
| `source` | `'llm' \| 'fallback'` | Which classifier produced it — surfaced in the UI |
| `risks[]` | Risk[] | See below |

### Risk

| Field | Type | Notes |
|---|---|---|
| `category` | string | **Enum-filtered** against `CATEGORIES[].label`; unknown values dropped |
| `severity` | `'Standard' \| 'High'` | Coerced: anything not exactly `'High'` becomes `'Standard'` |
| `justification` | string | One sentence from the transcript. Evidence for the reviewer — **never contract text** |

Both guards are in `engine.jsx`. The category filter
[fails open](spec-vs-implementation.md#5-the-classifiers-category-filter-fails-open) if
`window.CATEGORIES` is empty.

---

## Decision `[code]`

Output of `resolveClauses(manifest, ledger)`. One per risk, plus one per baseline clause.

```js
{ risk, selected, suppressed: [], reason: 'Matched High variant for Data Privacy' }
```

| Field | Type | Notes |
|---|---|---|
| `risk` | Risk | The manifest risk, or a synthetic one for baseline clauses |
| `selected` | Clause \| **null** | `null` means no clause existed — a hard flag, never a guess |
| `suppressed[]` | Clause[] | Candidates that lost. **Retained deliberately** — see [ADR-0004](decisions/ADR-0004-suppressed-candidates-are-retained.md) |
| `reason` | string | Why this clause; one of four strings (below) |
| `baseline` | bool? | True for Baseline Framework entries |

Baseline decisions carry a **synthetic risk** with `severity: 'Baseline'` — a third value that
appears only here and never in a manifest.

The four `reason` strings, verbatim:

| Situation | `reason` |
|---|---|
| Baseline clause | `Always-include · Baseline Framework §{n}` |
| Severity matched | `Matched {severity} variant for {category}` |
| Severity fell back | `No {severity} variant; fell back to {sev}` |
| Nothing available | `No clause available in Ledger` |

---

## Conflict finding `[code]`

Produced by `CONFLICT_RULES`, each a pure `(decisions) => Finding[] | null`.

| Field | Type | Notes |
|---|---|---|
| `rule` | string | Matches the rule's `name`; joins findings to the rule catalogue |
| `severity` | `'Standard' \| 'High'` | Renders as `chip-err` when High |
| `title` | string | One-line statement of the contradiction |
| `detail` | string | The explanation; hidden in `compact` mode |
| `refs[]` | string[] | Clause IDs involved |

The gate [blocks on any finding, not only High](spec-vs-implementation.md#3-the-validation-gate-blocks-on-any-finding-not-only-high-severity).

---

## Keyword rule `[code]`

The deterministic classifier fallback (~100 entries).

| Field | Type | Notes |
|---|---|---|
| `test` | RegExp | Matched against the whole transcript |
| `category` | string | A `CATEGORIES[].label` |
| `severity` | `'Standard' \| 'High'` | Highest-severity-wins per category |
| `reason` | string | Becomes the risk's `justification` — **only the first is kept** |

---

## Redline `[spec]`

One object **per changed paragraph**, so a four-change document becomes four independently
adjudicated negotiation points — see [ADR-0007](decisions/ADR-0007-one-redline-per-changed-paragraph.md).

| Field | Notes |
|---|---|
| segments | `keep` (`w:r`) / `ins` (`w:ins`) / `del` (`w:del` → `w:delText`) |
| context | Stitched surrounding text, ±160 chars |
| inferred category | Best-scoring `KEYWORD_RULES` hit over the paragraph |
| keywords | Extracted match terms; feed the similarity score |
| change counts | Tracked-change tallies |
| author, date | From the first tracked change |

## Review ticket `[spec]`

The mutation gate's unit of work. State machine: `pending → verified | rejected`.

| Field | Notes |
|---|---|
| redline segments | The original diff |
| vendor comment | Counsel's stated rationale |
| AI candidate | Clause + its rationale, citations, and score |
| alternates | The runner-up candidates |
| reason code | `no-ai-match` \| `human-escalated` \| `human-edit` |
| proposed text | Editable; pre-loaded from **vendor accepted language** (keep + ins, del dropped) |
| source provenance | `VENDOR LANGUAGE` \| `AI CANDIDATE` \| `EDITED BY LEGAL` |

On **verify**, a new clause is minted: derived rationale, `Policy-DERIVED-*` citation, today's
creation date, 2-year expiry, named reviewer.

## Audit event `[spec]`

Append-only.

```js
{ ts, actor: 'controller' | 'human', type, vendor, redline, clause_id, pending_id, score }
```

`type` ∈ `ai_suggest`, `ai_no_match`, `human_approve`, `human_edit_submit`, `human_escalate`.

Note the asymmetry: **approvals do not create review tickets, but they do create audit events.**
Approving inserts already-approved text, so nothing needs promoting — but the act is still recorded.

---

## How they connect

```
CATEGORIES ──constrains──→ Manifest.risks[].category
     │                            │
     └──constrains──→ Clause.cat  │
                          │       │
                          ▼       ▼
                    resolveClauses() ──→ Decision[] ──→ CONFLICT_RULES ──→ Finding[]
                          ▲                  │
                          │                  ▼
                       Ledger          assembleDossier() ──→ contract.docx
                          ▲
                          │
                   Review ticket ←── Redline ←── vendor .docx
                  (verify = mint clause)
```

Every arrow into `Ledger` passes through a named human. That is the whole design —
see [ADR-0003](decisions/ADR-0003-review-queue-is-the-only-mutation-surface.md).
