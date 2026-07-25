# Spec vs. implementation

Where [`ARCHITECTURE.md`](../ARCHITECTURE.md) and the ingested v3 prototype disagree.

`ARCHITECTURE.md` states the **intended** design and stays authoritative. This document records
the places the prototype does not yet match it, so nobody reads the spec, greps the code, and
concludes one of the two is lying.

**Method:** these were found by reading the ingested sources under
[`prototype/v3/app/`](../prototype/v3/app), not by running the application. Line references are to
the files as ingested. Each finding names the exact lines so you can re-check it.

**Status of this list:** descriptive, not a work queue. Nothing here has been fixed — the ingest
was verbatim on purpose.

---

## 1. Retired and expired clauses stay in the manifest-driven candidate pool

**Severity: high — it defeats the kill switch for exactly the clauses the kill switch is for.**

`ARCHITECTURE.md` §2.4 specifies the manifest pass as: *"candidates = active ledger clauses in that
category, excluding `alwaysInclude` entries"*. §3 lists *"Expiry & kill-switch evaluation"* as a
deterministic subsystem gated on `active`.

The code filters on category and `alwaysInclude`, but **not** on `active`:

```js
// engine.jsx:127
const candidates = ledger.filter(c => c.cat === risk.category && !c.alwaysInclude);
```

The baseline pass twelve lines earlier *does* check it:

```js
// engine.jsx:108
const baseline = ledger.filter(c => c.alwaysInclude && c.active);
```

The ledger reaching this function is enriched but not filtered — `enrichLedger` computes the
`active` flag (`v3_metadata.jsx:163`) and `main.jsx:27` memoises the result, which
`forge.jsx:32` hands to `resolveClauses` whole.

**Effect:** a retired or expired clause remains selectable for a manifest risk. Whether it is
actually selected is ledger-order-dependent, because `candidates.find(c => c.sev === risk.severity)`
takes the first severity match in array order. So this surfaces intermittently rather than always
— which is worse, not better, for a compliance system.

`SC-RETIRED-01` exists in the seed data specifically to demonstrate the kill switch, and the
baseline pass honours it while the manifest pass does not.

## 2. `strictMode` is declared but never read

The tweak that would close finding #1 exists in the UI and is not wired to anything.

| Location | What it does |
|---|---|
| `main.jsx:20` | Defaults `strictMode: true` |
| `main.jsx:158` | Renders the toggle, labelled "Strict mode (Active clauses only)" |
| `negotiate.jsx:609` | Displays its state: `strict mode · on (Active only)` |

No code path in resolution reads it. `resolveClauses` (`engine.jsx:102`) does not receive
`tweaks` at all. The control asserts a guarantee the engine does not implement — and it defaults
to `true`, so the UI reports "Active only" while finding #1 is live.

## 3. The validation gate blocks on any finding, not only High severity

`ARCHITECTURE.md` §2.5: *"High-severity findings **gate** progression to Dossier."*

The code gates on finding *count*:

```js
// validate.jsx:55 and :67
findings.length === 0 || acknowledged
```

**Effect:** stricter than specified — a Standard-severity finding also blocks progression until a
human overrides. The panel computes `high` (`validate.jsx:44`) but uses it only for the display
tile, never for the gate.

Note also that the override is one act clearing *all* findings at once
(`onAcknowledge`, `validate.jsx:58`), not a per-finding acknowledgement. The spec calls the
override "a recorded act"; whether one blanket acknowledgement satisfies the audit story is
[an open question](open-questions.md).

## 4. Category short-code collision: `AC`

Clause IDs encode the category short code (§2.3: `DP-H-014` = Data Privacy / High / 014). Two of
the 48 categories in `data.jsx` claim the same short code:

```js
{ key: 'accept', label: 'Acceptance',      short: 'AC' },
{ key: 'corr',   label: 'Anti-Corruption', short: 'AC' },
```

**Effect:** an `AC-*` clause ID does not identify its category unambiguously. The system does not
currently resolve clauses *by* parsed ID — lookup is by the stored `id` string — so this is latent
rather than active. It becomes real the moment anything parses a clause ID to recover its category,
which is exactly what the ID format invites, and it is a poor property for an identifier that
appears in executed contracts and audit exports.

## 5. The classifier's category filter fails open

`ARCHITECTURE.md` §2.2 states the boundary guarantee plainly: *"A hallucinated category cannot
survive the boundary."*

```js
// engine.jsx:46-48
const allowed = new Set(cats.length ? cats : []);
const risks = parsed.risks
  .filter(r => allowed.size === 0 || allowed.has(r.category))
```

`allowed.size === 0` passes **everything**. `cats` derives from `window.CATEGORIES`
(`engine.jsx:13`), so if that global is missing or empty — load-order failure, a refactor of the
`window` export convention, or module extraction during a real build — the enum filter silently
becomes a no-op and unvalidated model output crosses the trust boundary.

The guarantee holds today because `data.jsx` loads first (`Clausewerk V3.html` script order) and
populates `window.CATEGORIES`. It holds by load order, not by construction. For the single most
load-bearing check in the architecture, fail-closed is the correct default.

## 6. Expiry is evaluated against a frozen clock

`ARCHITECTURE.md` §2.3: *"Expiry is computed, not stored: a clause silently leaves the selectable
pool on its expiry date."*

`enrichLedger` pins "today" to a literal:

```js
// v3_metadata.jsx
const today = new Date('2026-04-24');
```

Every derived field — `active`, `expired`, `daysToExpiry`, `expiresSoon` — is computed against that
fixed date rather than the current one.

**Effect:** the kill switch and the 90-day expiry warning are demo-deterministic, which is a
reasonable thing to want in a demo (the seed data's expiry states stay stable and the screenshots
keep working). It is not the behaviour the spec describes, and the constant is the single line that
has to change for it to be. Flagged because it is easy to miss and silently wrong in production:
nothing would ever expire.

## 7. Clause field naming diverges from the prose

Not a defect; a schema note for anyone building the backend.

| Concept | Prose in `ARCHITECTURE.md` | Field in code |
|---|---|---|
| Clause category | "category" | `c.cat` |
| Clause severity | "severity" | `c.sev` |
| Risk category | "category" | `risk.category` |
| Risk severity | "severity" | `risk.severity` |

Clause records and manifest risks use different names for the same two concepts, and
`resolveClauses` bridges them inline (`engine.jsx:127`, `:133`). Worth settling deliberately before
the relational schema in §5 is written, rather than inheriting the split by accident. See
[`data-model.md`](data-model.md), which documents the code's names.

---

## Not drift

Two things that look like gaps but are declared as such by §7 Prototype fidelity, and are
substitutions of transport rather than of logic:

- **The "python executor"** — the trace reads `python_docx.replace(...)` while JS runs underneath.
- **Vector embeddings** — additive keyword scoring stands in for k-NN retrieval.

Also by design: SharePoint/O365 sync, multi-user identity and RBAC, server persistence, and
e-signature are all narrative in the prototype.
