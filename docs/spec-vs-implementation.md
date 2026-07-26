# Spec vs. implementation

Where [`ARCHITECTURE.md`](../ARCHITECTURE.md) and the v3 prototype disagreed, and what was done
about it.

**All findings below are now resolved in [`prototype/v3/`](../prototype/v3).** Fixes were verified
by loading the prototype and exercising the engine directly, not by inspection alone — results are
quoted per finding.

| # | Finding | Status |
|---|---|---|
| 1 | Retired/expired clauses stayed in the candidate pool | **Fixed** |
| 2 | `strictMode` declared but never read | **Fixed** — now wired |
| 3 | Validation gate blocked on any finding, not only High | **Fixed** |
| 4 | Category short-code collision (`AC`) | **Fixed** |
| 5 | Classifier's category filter failed open | **Fixed** — now fails closed |
| 6 | Expiry evaluated against a frozen clock | **Fixed** — clock is live |
| 7 | Clause field naming diverges from the prose | **Not a defect** — documented, not changed |
| 8 | 54 clauses were birth-expired by a fabricated creation date | **Fixed** — found while fixing #6 |

Verification snapshot, live clock `2026-07-25`, full 30-category manifest against the seeded
102-clause library:

```
duplicate short codes ...... 0
inactive clauses in ledger .. 6
inactive leaked (strict) .... 0     ← was the bug in #1
inactive selected (loose) ... 1     ← permitted, and 100% carry a warning
baseline clauses in contract  20
unresolved categories ....... 0
live expiry warnings ........ 7 expiring soon, 0 lapsed
```

---

## 1. Retired and expired clauses stayed in the candidate pool ✅

The manifest pass filtered on category and `alwaysInclude` but not `active`, while the baseline pass
twelve lines above did — so the kill switch worked for boilerplate and not for risk-driven clauses.

**Fix** (`engine.jsx`): the candidate pool is now filtered, and the two failure modes are
distinguished, because "we never had a clause" and "we had one and it lapsed" are different library
problems needing different fixes.

```js
const inCategory = ledger.filter(c => c.cat === risk.category && !c.alwaysInclude);
const candidates = strictMode ? inCategory.filter(c => c.active !== false) : inCategory;
```

```
reason: inCategory.length
  ? `No active clause available in Ledger · N candidate(s) retired or expired`
  : 'No clause available in Ledger'
```

**Verified:** zero inactive clauses selected across all 30 categories under strict mode.

## 2. `strictMode` declared but never read ✅

The toggle defaulted to `true` and claimed "Active clauses only" while no resolution code read it.

**Fix:** `resolveClauses(manifest, ledger, opts)` now takes options and defaults to strict
(`opts.strictMode !== false`). `forge.jsx` passes `tweaks` through; `main.jsx` supplies it.

With strict mode **off**, inactive clauses become selectable again — but never silently. Each such
decision carries a warning that travels with it:

```js
warning: `${selected.id} is not active (${selected.retiredReason || 'expired'}) — selected with strict mode off`
```

**Verified:** loose mode selected 1 inactive clause, and 100% of loose inactive selections carried
a warning.

## 3. Validation gate blocked on any finding, not only High ✅

Spec: *"High-severity findings gate progression."* Code gated on `findings.length === 0`, so a
Standard finding also blocked.

**Fix** (`validate.jsx`): both gate expressions now read `high === 0 || acknowledged`. The panel
already computed `high` and used it only for a display tile.

The override is also now genuinely *recorded*, not merely counted — see finding note below and
[ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md).

## 4. Category short-code collision (`AC`) ✅

Acceptance and Anti-Corruption both claimed `AC`, and clause IDs encode the short code.

**Fix:** Anti-Corruption → `AB` (anti-bribery), and its single clause `AC-B-011` → `AB-B-011`.
Acceptance keeps `AC` because it owns two existing clause IDs (`AC-S-016`, `AC-H-027`) and the
baseline entry was the newer V3.1 addition — the smaller blast radius.

**Verified:** zero duplicate short codes across all 48 categories.

## 5. Classifier's category filter failed open ✅

`allowed.size === 0 || allowed.has(r.category)` passed **everything** when `window.CATEGORIES` was
empty, so the trust boundary held by script load order rather than by construction.

**Fix** (`engine.jsx`) — fail closed, and fall through to the deterministic classifier rather than
accept unvalidated categories:

```js
if (!cats.length) throw new Error('CATEGORIES unavailable — refusing unvalidated LLM manifest');
const allowed = new Set(cats);
const risks = parsed.risks.filter(r => allowed.has(r.category));
```

The throw is inside the existing `try`, so the failure path is the keyword classifier — a degraded
manifest rather than an unvalidated one. That is the correct trade for the one check the whole
architecture rests on.

## 6. Expiry evaluated against a frozen clock ✅

`enrichLedger` pinned `today` to a literal `new Date('2026-04-24')`, so nothing ever expired in
real time.

**Fix** (`v3_metadata.jsx`): the clock is live, with an explicit, visible override for demos.

```js
const today = window.CLAUSEWERK_TODAY ? new Date(window.CLAUSEWERK_TODAY) : new Date();
```

The override is left **unset** in `Clausewerk V3.html`. It isn't needed: against the live clock the
seeded library is healthy — 6 clauses expired, every category still resolving, and 7 genuine
expiring-soon warnings. The expiry machinery now demonstrates itself with real dates.

## 7. Clause field naming diverges from the prose — not a defect

Clause records use `cat`/`sev`; manifest risks use `category`/`severity`; `resolveClauses` bridges
them inline.

**Deliberately unchanged.** This is a schema-consistency question for the production backend, not a
bug in the prototype, and renaming across the codebase would be churn with no behavioural payoff.
It is documented in [`data-model.md`](data-model.md), which uses the code's names, and should be
settled when the relational schema in §5 is written.

## 8. 54 clauses were birth-expired by a fabricated creation date ✅

*Found while fixing #6, and the reason #6 mattered more than it looked.*

54 of the 102 seeded clauses carry no `created` or `expires` anywhere — neither inline nor in the
`V3_METADATA` overlay. `enrichLedger` fabricated one:

```js
const expires = meta.expires || c.expires || defaultExpiry(c.created || meta.created);
// defaultExpiry(undefined) → new Date('2024-01-01') + 2 years → '2026-01-01'
```

So every unprovenanced clause was silently stamped as expiring 2026-01-01 — already lapsed at the
old frozen date. This was invisible only because finding #1 meant resolution ignored `active` and
used them anyway. Fixing #1 and #6 together would have made 21 of 30 categories unresolvable.

**Fix:** expiry is derived only from a *known* creation date. A clause with no recorded provenance
is not expired — it is unprovenanced, which is a different condition and is now flagged as one:

```js
const knownCreated = meta.created || c.created || null;
const expires = meta.expires || c.expires || (knownCreated ? defaultExpiry(knownCreated) : null);
const isExpired = expiresDate ? expiresDate < today : false;
// …
provenanceGap: !knownCreated || !expires,
```

**Verified:** 54 clauses now carry `provenanceGap: true` and remain selectable; 0 categories
unresolved.

`provenanceGap` is a **data-quality** flag, not a validity flag. Those 54 clauses cannot be
temporally governed at all — they will never expire, never warn, and never leave the pool. That is
a real gap in the seeded library, and closing it means Legal recording approval dates. Fabricating
dates in code would only have hidden it again.

---

## Not drift

Declared as such by §7 Prototype fidelity — substitutions of transport, not of logic: the "python
executor" (JS under a Python-shaped trace), vector embeddings (additive keyword scoring stands in),
SharePoint/O365 sync, multi-user identity and RBAC, server persistence, and e-signature.

---

# Part 2 — the backend, 2026-07-26

Everything above concerns the v3 prototype. A backend now exists, and a full review on 2026-07-25
([`REVIEW-2026-07-25.md`](REVIEW-2026-07-25.md)) found a second, different class of drift: **not
the code disagreeing with the prose, but the code failing to enforce what the prose asserted
absolutely.**

The distinction matters. Prototype drift was visible to anyone who read both. Backend drift was
invisible to the tests themselves, because **the tests ran as the database owner, who bypasses
row-level security and holds every privilege.** A protection could be entirely absent and the suite
would still be green.

## Findings and their status

| # | Finding | Status |
|---|---|---|
| D1 | Concession promotion silently did nothing under real permissions; the same vendor text could be minted repeatedly | **Fixed** |
| D2 | The audit chain reported tampering on an honest database, and truncation was undetectable | **Fixed** |
| D3 | The acting role was read from a value the client could set | **Fixed**, with a stated residual |
| D4 | "Immutable" records had editable holes; some edits left no audit trace | **Fixed** |
| D5 | The "absolute" floor consulted the wrong ladder and failed open when none existed | **Fixed** |
| D6 | Concessions were immutable only by accident — via bug D1 | **Fixed** (with D1, as one item) |
| D7 | An agreement's status could never change | **Fixed** |
| D8 | Claimed coherences unenforced; the test fixtures themselves violated one | **Fixed** |
| D9 | Missing indexes; TRUNCATE outside the immutability story; silent no-op DELETE | **Fixed** |
| — | `cw.audit_event` had no row-level security at all — buyers could read rivals' concessions | **Fixed** (found during the work, not in the review) |
| E1 | Ladder condition was fingerprinted but never stored, so some runs could never be reproduced | **Fixed** |
| E2 | The engine↔database write seam had never been exercised and was already wrong | **Fixed** |
| E3 | With two selectable versions, the **oldest** won | **Fixed** (E3a). Ladder-preferred rung deferred (E3b) |
| E4 | A lapsed boilerplate clause vanished silently from the contract | **Fixed** |
| E5 | Text inside hyperlinks, content controls and smart tags was invisible to Legal | **Fixed** |
| E6 | Hostile uploads unmitigated | **Fixed** — see the correction below |
| E7 | The manifest trust boundary existed only in the prototype | **Fixed**, with a stated limitation |
| E8 | Dead code, README drift, a test that asserted nothing | **Fixed** |

## Where the review itself was wrong

Recorded because a review is evidence, not scripture, and three of its claims did not survive
checking:

- **E6 — the entity-expansion threat was not live.** The XML parser in use already refuses classic
  billion-laughs and quadratic blowup, and the unfixed code already rejected the bomb. Implementing
  the proposed guard would have added a check that **could never fail** — worse than no check,
  because it looks like protection. The *real* exposures, both measured, were a zip bomb (102 KB
  expanding to 344 MB) and unbounded element nesting. Those are what was fixed.
- **E5 was overstated.** Only redline parsing walked direct children. Document assembly already
  recursed, and the character counter only ever runs on our own output — so the
  zero-authored-characters claim was never at risk.
- **E2 named nine mismatches; there was one**, plus its mirror image on the read side. A
  column-by-column audit found the rest were not defects.

Two further review claims about missing documents were simply stale — the records had been committed
already.

## Residuals — stated, not hidden

- The audit checkpoint is **unsigned**, so it constrains application roles, not the database owner.
- The advisory lock serialising audit appends has **no test coverage** — the test database is
  single-connection.
- The *person's* name in the audit log is still self-asserted; the five roles are shared service
  accounts.
- The identity scheme is **incompatible with transaction-mode connection pooling**.
- `check_manifest` has no production caller, because there is no service layer yet.
- Redline fixtures are hand-built markup; **Word was not available**, so no Word fidelity is claimed
  beyond what those fixtures exercise.
- Retention gates and records the destruction decision; it does not destroy stored bytes.
- Master/work-order structure is modelled but cannot be delivered end to end, because obligations do
  not exist.

## Not drift

Deliberate omissions, recorded in [`data-model.md`](data-model.md) §14: obligations, the
negotiation-intelligence engine, entitlement valuation, package-trade modelling, the vector index,
and resolution consulting ladders for a preferred rung.
