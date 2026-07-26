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
</content>
