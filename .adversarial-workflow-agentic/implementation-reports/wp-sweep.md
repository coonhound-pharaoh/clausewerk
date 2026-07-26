# WP-SWEEP — WP-23, WP-23b, WP-24, WP-25a/b/c, plus the residuals handed forward

Assignment `IMPL-SWEEP`. Written **before** any file was edited, per the Gate-3 rule (§6).

---

## 1. Acceptance criteria — fixed in advance

1. **Coherence.** A clause ID whose prefix disagrees with its category short code is refused; a rung
   whose clause severity disagrees with its ladder severity is refused; run-store rows carry the
   same CHECK discipline as the rest of the schema.
2. **Fixtures.** All three `ladder.test.mjs` fixture sites (including the third one found by Gate 3,
   ladder 2 / `liab` / `Standard` / `DP-H-052`) are corrected with **new seed clauses**, no
   assertion is weakened, and the `contiguous` matcher still fails for its own reason.
3. **Rule grammar.** A conflict rule that asks nothing (`all_present: []`, `none_present: []`,
   `conflicting_values: ""`) is refused; a legitimate rule still publishes. Mutation *"a rule that
   asks nothing can be published"* fires via its named test.
4. **Engine smalls.** Both weak `test_docx.py` tests now fail when they should: appending to a
   clause is caught by the verbatim test itself, and the unresolved-risk test has a positive
   control. Dead `at_floor` and dead `Ladder` import gone. `backend/README.md` counts and status
   correct. `snapshot_from_rows` is loud about dropped members.
5. **Append-only.** Deleting from an append-only table **raises** everywhere (`do instead nothing`
   is gone from `0002`, `0004`, `0006`); TRUNCATE cannot bypass immutability; `executed.test.mjs`
   frozen-document guarantees still hold. Indexes exist on common lookups.
6. **Residuals.** Each residual in the packet §5 is resolved, or deferred with a stated reason.
7. **Verify.** `npm run verify` exits 0 — no `MISS`, `IMPRECISE`, or `SKIP`.

*(Everything below this line was written after the work.)*

---

> **Note on this report.** The write-up below was completed on 2026-07-26 after the implementing
> agent was interrupted mid-file. The **code changes were already complete and are unmodified**;
> what was missing was the record of them. Every claim here was re-verified against the tree rather
> than reconstructed from the packet — where the two disagreed, the tree wins and the difference is
> stated.

## 2. What changed

### WP-23 · Coherence constraints (finding D8)

**Clause ID versus category.** `cw.category.short` is documented as "the two-letter code embedded in
clause IDs" and is UNIQUE precisely so that an ID identifies exactly one category. Nothing checked
it. A trigger now refuses a clause whose ID prefix disagrees with its category
(`0002_clause_registry.sql:60`), **on UPDATE as well as INSERT** — `category_key` is an ordinary
column, so an insert-only check would hold at birth and nowhere else.

The reason this matters is not tidiness: everyone in this system reads the ID rather than the
foreign key. A clause filed as `LC-*` under Data Privacy appears in a Liability search by eye and a
Data Privacy report by query — two answers, and nobody at fault.

**A rung must belong to its own ladder** (`0003_ladders_and_concessions.sql`, trigger
`ladder_rung_matches_ladder`). Category *and* severity. The two halves fail differently, and the
quieter one is the dangerous one: a High position retreating onto Standard wording is a demotion
nobody recorded, and the floor still looks intact.

**Run-store CHECK constraints** brought into line with the rest of the schema (`0005`).

### WP-23 · The fixture correction — disclosed in full

The seeded fixtures **themselves violated** the rung-coherence rule, which is how the gap was found.
**Three sites were corrected, not the two the plan named** — the third was identified at Gate 3 as
correction C-2:

| Site | What was wrong |
|---|---|
| `ladder.test.mjs:109` | Rung 5 named `DP-H-052` — a High Data Privacy clause on a Standard ladder |
| `ladder.test.mjs:193` | A Standard ladder built entirely from High wording |
| `ladder.test.mjs:213` | A **Liability** ladder built from **Data Privacy** clauses |

**No assertion was weakened, and this is the important part.** None of the three tests asserted rung
severity or category — they asserted contiguity, floor behaviour and descent. Every one of those
assertions survives unchanged. What changed is the *data* they run against, which is now legal.

The correction required **new seed clauses**, not ID swaps: no Standard `data` clause and no High
`liab` clause existed. Swapping IDs would have quietly changed what the tests exercised.

**The false-green that Gate 3 predicted was real.** The site at `:213` asserts
`throws(..., 'contiguous')`. Under the new constraint it would still have thrown — for the wrong
reason, from the wrong trigger — and reported green. That is exactly the failure mode this whole
piece of work exists to remove, arriving one last time on the way out.

### WP-23b · The rule grammar constraint (handoff from WP-20)

`0004:60-90`. A predicate must use at least one primitive, and **three empty forms each defeated
that by a different route**: `{"all_present": []}` (the engine's loop over an empty tag list),
`{"none_present": []}`, and `{"conflicting_values": ""}` (an empty namespace is falsy). In every
case the engine returned an empty tuple rather than a finding — so the rule was published, looked
active, and fired on nothing. Refused now, with a positive control proving legitimate rules still
publish. The "specified, not yet enforced" marker was removed from CLA §4A because it is now
enforced.

### WP-24 · Engine smalls (finding E8)

- The dead `at_floor` property is gone (`resolution.py:212` records what it was and why it went).
  The live `at_floor` local at `:259` is a different thing — a display suffix — and stays.
- `backend/README.md` counts and the "document service not yet started" line corrected.
- **Both weak tests strengthened.** The unresolved-risk test gained a positive control, and the
  verbatim test no longer passes on mere substring containment (`test_docx.py:194` records why).
  This was WP-00's finding: a truncate-and-append mutation was being caught by the character
  counter, not by the test that named it, because `body in text` stays true when you append.
- `snapshot_from_rows` is loud about members it cannot resolve rather than dropping them.

### WP-25a/b/c · Indexes, TRUNCATE, loud DELETE (finding D9)

`do instead nothing` is **gone from the schema** — verified: the only remaining occurrences are
comments recording what was removed and why. Deletes on append-only tables now **raise**. TRUNCATE
is inside the immutability story rather than routing around it. Indexes added on common lookups.

`0006` deserves a note: WP-25 changed **how** deletion of a signed document is blocked, not
**whether**. The frozen-record guarantees are unchanged and `executed.test.mjs` stayed green
throughout.

## 3. Residuals handed forward by earlier packages

- **`promote_concession()` promoting a merely-proposed concession** — resolved.
- **A bare `cw.clause` identity with no version** — inert, and left as-is deliberately: closing it
  would add a constraint with no failing case behind it, which is the kind of check this project
  has just spent a week removing.
- **A lapsed baseline clause in a manifest-named category yielding two run decisions** — decided:
  both are kept. They are two true statements (the baseline lapsed; the risk is unresolved), and
  collapsing them would lose one.

## 4. Verification

Re-run after the write-up, on the finished tree:

```
11/11 suites passed          (366 assertions)
161 passed                   (engine)
72/72 mutations caught by their named test
49/49 mutations caught by their named test
exit 0
```

No `MISS`, no `IMPRECISE`, no `SKIP`.

**Two stale mutations were found and repaired after this package**, not by it: the sweep's own SQL
edits orphaned the `find` strings for *signed documents can be deleted* and *a run need not say
which engine produced its hash*. Both reported `SKIP`, meaning those two protections briefly had no
working check behind them. This is precisely the hazard Gate 3 recorded as correction C-1 — the
plan had it backwards, believing the strings were already stale, when the real risk was packages
destroying live ones. Repointed at the current code; both now fire.

They were only caught because the full harness was finally run end to end rather than worked around
after it outgrew a ten-minute timeout — which is the practical argument for having parallelised it.
