# WP-SPECS — WP-20, WP-21, WP-22

Assignment `IMPL-SPECS`. Documents only, plus one recorded requirement handed to WP-23.

---

## 1. Acceptance criteria — written before any file was edited

Per the Gate-3 rule (§6), these were fixed in advance and are not restated after the fact.

1. **No document cites the rule grammar to a section that is not the grammar.** The grammar exists
   as a named section in an architecture document, and every citation points at it.
2. **The role count is five everywhere, and matches the roles the backend actually creates**
   (`cw_viewer`, `cw_requester`, `cw_legal_reviewer`, `cw_legal_admin`, `cw_auditor`).
3. **CLA §3 and §7 no longer contradict each other, and neither permits a machine to settle.**
   A machine may propose; a human settles.
4. **Legal hold, the two e-signature gaps, MSA/SOW and the renewal baseline are each specified**,
   with owner decisions marked as owner decisions and not settled by me.
5. **Every claim marked as built is actually built**; everything else is visibly marked as
   specified-but-not-yet-enforced.
6. **`cd backend && npm run verify` still exits 0** — a regression check that I did not touch code.

**Criteria 1–5 met. Criterion 6 is not currently green, and the cause is not this package** — see
§5 and §7 (F-1).

---

## 2. Files and sections changed

| File | Section | Why |
|---|---|---|
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | **new §4A** | The conflict-rule grammar, written where the architecture cites it (WP-20) |
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | §3 (*Why this matters* + *Guardrails*) | A machine proposes, never settles; the scaling claim reduced to the true one (WP-21) |
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | §4 concession table | `state` and `approvals[]` replace the single `approved_by`; Required Approvers described (WP-21) |
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | §7 governance table | "Record a concession / Descend a rung" replaced by propose-versus-approve (WP-21) |
| `CLAUSE-LIBRARY-ARCHITECTURE.md` | §8 data model | Concession state, Required approver, Concession approval records (WP-21) |
| `NEGOTIATION-ARCHITECTURE.md` | line 182 | Citation moved from "§4 of the CLA" (Concessions) to CLA §4A, as a link (WP-20) |
| `ARCHITECTURE.md` | §5, the identity/RBAC bullet **only** | Five roles, named, with the actors-versus-roles confusion called out (WP-21) |
| `docs/glossary.md` | **new "Permission roles"** | The five roles and their database roles, kept distinct from the four actors (WP-21) |
| `LIFECYCLE-ARCHITECTURE.md` | §2 | Renewal baseline no longer asserted; points at `U1` (WP-22) |
| `LIFECYCLE-ARCHITECTURE.md` | §3.1 + new subsection | Signature evidence: what is already built, and the two narrow gaps (WP-22) |
| `LIFECYCLE-ARCHITECTURE.md` | §3.4 + new `U1` card | Renewal baseline as a neutral two-option owner decision (WP-22) |
| `LIFECYCLE-ARCHITECTURE.md` | §3.5 + new subsection | Legal hold (WP-22) |
| `LIFECYCLE-ARCHITECTURE.md` | **new §3.6** | Masters and statements of work, with `U2` (WP-22) |
| `LIFECYCLE-ARCHITECTURE.md` | §5, §7, §8 | Data-model rows for hold, signature evidence, signatories, agreement kind; honest "what is built" list; retention service consults holds (WP-22) |
| `LIFECYCLE-ARCHITECTURE.md` | §10 q.4 | MSA/SOW structure now specified; obligation composition still open (WP-22) |
| `docs/open-questions.md` | **new "Live owner decisions"** | `U1`–`U4` recorded (WP-22) |
| `docs/open-questions.md` | §9 | The per-negotiation-to-per-category scaling claim corrected here too (WP-21) |

**Not touched, deliberately:** anything under `backend/`, any ADR, `docs/data-model.md`, and every
part of `ARCHITECTURE.md` §5 other than the identity bullet. `LIFECYCLE-ARCHITECTURE.md:296` (the
agreement-status row, written by the WP-08 implementer) is **unchanged**; §7 was extended to agree
with it rather than to restate it.

---

## 3. The WP-23 handoff — empty predicates

**Recorded in CLA §4A.3 as a requirement, and marked there as specified-but-not-yet-enforced.**
I do not own SQL and did not edit `0004`.

**The defect.** `0004_conflict_rules.sql:61-74` requires that a predicate use at least one of the
three primitive keys, because an empty predicate would match every contract. It does not require the
primitive to *say anything*. `{"all_present": []}` passes the constraint, and it also passes the
engine's own grammar check (`validation.py:53-62`, which tests that the predicate dictionary is
non-empty, not that its contents are). Traced through `_evaluate` (`validation.py:134-163`): an empty
`all_present` skips its loop, an empty `none_present` skips its loop, and `conflicting_values: ""` is
falsy and skipped — so the function returns an empty tuple rather than `None`, which **counts as the
rule firing**. A rule that asks nothing therefore raises a finding on **every contract in the
system**. That is exactly the failure the "at least one primitive" clause exists to prevent, arriving
through a different door.

**The constraint required** — add to `constraint predicate_grammar`:

```sql
and (not predicate ? 'all_present'
     or jsonb_array_length(predicate->'all_present') > 0)
and (not predicate ? 'none_present'
     or jsonb_array_length(predicate->'none_present') > 0)
and (not predicate ? 'conflicting_values'
     or btrim(predicate->>'conflicting_values') <> '')
```

**The test required.** Writing a conflict rule whose predicate is `{"all_present": []}` must be
refused. A companion positive control — a legitimate one-tag `all_present` rule must still be
accepted — so the constraint is not simply rejecting everything.

**The mutation required.** *"a rule that asks nothing can be published"* — delete the three added
conjuncts. It must be caught by the named test above.

**A matching engine-side guard is desirable but is not mine to write** either. The grammar is
enforced in two layers on purpose (CLA §4A.4); if only the database is fixed, a predicate loaded from
a fixture rather than from the database still fires vacuously. WP-23 or WP-24 should decide which of
them owns `validation.py:53-62`.

**Two grammar questions the same review raised are already answered by the code and needed only
writing down, not enforcing** — recorded in CLA §4A.1:

- **Namespace** = everything before the first colon; a tag with no colon has no namespace and can
  never participate in `conflicting_values` (`validation.py:127-128`).
- **Case sensitivity** — matching is exact, and `cw.clause_tag.tag` already carries a lower-case-only
  format check (`0004:21`), so a mixed-case tag cannot be written in the first place. No new
  enforcement needed; the gap was purely that nobody had said so.

---

## 4. Owner decisions surfaced, and how each is presented

| # | Decision | Presented as |
|---|---|---|
| `U1` | Which positions a renewal opens from | **A neutral two-option table** in LCMA §3.4, with cost, commercial effect and drift exposure for each. The proposal's recommendation (open from the executed agreement, drift report made blocking) is recorded as the **default**; the alternative is required to stay reachable as a recorded choice. The text says in its own words that the only real difference is which button is pre-selected. The claim that this option violates ADR-0009 is **explicitly retired** in the document, with the reason: ADR-0009 forbids *library* drift, and a same-agreement renewal baseline is deal-scoped |
| `U2` | May a SOW contradict its master | Both readings stated in LCMA §3.6; the **stricter default recorded** (it may not), with the reason given — it fails towards a person noticing, and relaxing later costs nothing while discovering a silent override costs a great deal |
| `U3` | What the database owner account maps to | Recorded in `docs/open-questions.md` as having a stated, reversible default already in effect from the Gate-3 remediation. Not re-opened |
| `U4` | The unedited-approval-rate threshold | Recorded as a number **the system may never choose**. It measures and displays; Legal sets it; it stays unset |

Owner decision 4 (concessions need the Requester, the attorney, and every configured Required
Approver) is **already settled** by the objective contract and was applied, not re-opened.

---

## 5. Evidence per criterion

| # | Criterion | Evidence |
|---|---|---|
| 1 | Grammar cited correctly | `grep` across all markdown finds one citation of the grammar outside the backend README, and it now points at CLA §4A. CLA §4 is still Concessions and is no longer cited for the grammar |
| 1 | Grammar exists in the architecture | New CLA §4A: tags and namespaces, the three primitives with worked examples, predicate legality, two-layer enforcement |
| 2 | Five roles | `ARCHITECTURE.md` §5 identity bullet lists five and names the five database roles; `docs/glossary.md` gains a five-row Permission roles table. Both match `0001_foundation.sql:17-23` |
| 2 | Actors not confused with roles | Both documents carry an explicit line distinguishing the four actors from the five roles |
| 3 | §3/§7 agree | §3 now says the matcher **proposes**; §7's table has "Propose a concession" (automatic) and "Approve a concession" (Requester + attorney + Required Approvers) as separate rows. "Descend a rung — Requester, recorded" is gone, along with "without a human" |
| 3 | No machine settles | Stated in §3 in those words, and again in the §7 table row |
| 4 | Legal hold | New LCMA §3.5 subsection plus a data-model record and a retention-service responsibility |
| 4 | E-signature | New LCMA §3.1 subsection naming exactly two gaps, plus the §5 rows |
| 4 | MSA/SOW | New LCMA §3.6, plus §5 rows and a rewritten open question 4 |
| 4 | Renewal | LCMA §3.4 `U1` card; §2's contradicting sentence removed |
| 4 | Owner decisions not settled | `U1` and `U2` marked "owner decision, not settled here"; both recorded in `docs/open-questions.md` |
| 5 | Nothing over-claimed | Five "**Specified, not yet enforced**" callouts, naming WP-18a/18b/18c/18d and WP-23. LCMA §7 rewritten to say what is built and to state flatly that obligations do not exist in any form |
| 6 | verify | **Not green — see below** |

### Criterion 6, honestly

`npm run verify` currently reports **6 of 8 database suites passing**, failing `registry.test.mjs`
(1 failure: *"the actor and role are captured on every event"*) and `ladder.test.mjs`. The Python
suite and the write-seam suite are green.

**This package cannot be the cause and is not.** Every file I edited is markdown; `git status`
confirms no non-`.md` file in my scope changed, and no test or engine module reads any of the
documents I touched (only prose references in comments). `ladder.test.mjs` **passes on its own**
(51/51) and fails only in the combined run, which is the cross-suite actor leak already documented as
**F-2 in `wp-db-enforce.md`**: the `roles.mjs` helper resets the database role but not the session
actor, and the failure it produces points at the wrong test. WP-04 (identity narrowed to the
connection role) and WP-05 are recorded as still in flight and both write `0001` and the test
helpers.

**I have not touched it.** Fixing a suite I do not own, mid-flight, would collide with the
implementer who does. Flagged for the orchestrator to re-run once WP-04 lands.

---

## 6. Deviations from the packet

1. **The grammar went into the CLA as §4A, not §4.** The packet says "write the CLA section that the
   architecture cites". Writing it *as* §4 would have displaced Concessions and renumbered §5–§11,
   breaking references from `NEGOTIATION-ARCHITECTURE.md`, `LIFECYCLE-ARCHITECTURE.md` and
   `docs/open-questions.md`. A lettered section keeps every existing reference valid; the citation
   was updated to match, and the numbering choice is explained in the document itself.
   (This also departs from Plan C's R4, which proposed putting the grammar in `ARCHITECTURE.md`
   §2.5a — that file is not mine beyond the roles bullet, and the work packages superseded R4.)
2. **The CLA §3 rewrite reduces the scaling claim rather than softening it**, as the plan required —
   and I found the *same* claim repeated in `docs/open-questions.md` §9, which the packet did not
   list. Corrected there too; leaving it would have meant the contradiction survived in a document
   that indexes the others.
3. **LCMA §7 was extended.** The packet named only §296 as another implementer's. §7's blanket
   "everything else in this document is specification" had become untrue once the executed-agreement
   record and status machine were built. Extending it was necessary for criterion 5. Line 296 itself
   is untouched.
4. **`U1`'s default follows the proposal, not Plan C.** Plan C recommended the opposite default. The
   red team refuted its central supporting argument and Gate 3 adopted the proposal's recommendation
   with the alternative kept reachable. I recorded that, and wrote both options fairly rather than
   arguing for either.

---

## 7. What I found that the plan missed

**F-1 — `npm run verify` is red before this package starts, and criterion 6 as written cannot
distinguish "I broke it" from "it was already broken".** A documents-only package whose only
regression check is a suite owned by three other in-flight packages will always be ambiguous. For
the remaining documents packages (WP-26, WP-28, WP-30, WP-31), the honest check is *"no non-markdown
file changed"*, which is provable, rather than a green suite, which is not in the package's control.

**F-2 — the empty-predicate hole is wider than the review described: it is in the engine too.** The
review located it at `0004:62` (the database). The identical hole is at `validation.py:53-62`, which
checks that the predicate dictionary is non-empty but never that its values are. Fixing only the
database still leaves a rule loaded from a fixture firing on every contract. Recorded in §3 as a
question WP-23 or WP-24 must assign an owner to; **not fixed here**, because I own neither file.

**F-3 — `conflicting_values: ""` is a third empty-primitive case, and nobody had listed it.** The
review named `all_present: []`. The empty *string* form fails differently: `if ns:` is falsy, so the
primitive is silently skipped rather than evaluated, and the rule fires vacuously by the same route.
The constraint text in §3 covers all three.

**F-4 — the glossary had no permission vocabulary at all.** It defines four *actors* and no roles,
so a reader looking up "Legal admin" found nothing and the four-actor list read as the role list.
That is very likely how `ARCHITECTURE.md`:309 came to list four roles in the first place. Both
documents now carry the distinction explicitly.

**F-5 — CLA §4's `approved_by` was the quiet centre of the §3/§7 contradiction.** The review framed
the contradiction as §3 versus §7. But §4 required a single named `approved_by` on every concession,
which already contradicted §3's "without a human" — three statements, not two, and the one in §4 is
the one the schema implements. Fixing only §3 and §7 would have left the data model saying something
different again. §4 and §8 were updated with them.
