# Implementation report — WP-16a/b/c · WP-17 · WP-32

**Assignment:** IMPL-REVIEW-QUEUE · Stage 4 (Gate 4) · single owner.

---

## 1. Acceptance criteria — written BEFORE any code was edited

Per the Gate 3 remediation rule (§6): the implementer writes the criteria into the report first,
and the validator checks against this written record.

| # | Criterion | Met | Proof |
|---|---|---|---|
| A1 | A requester **cannot** create a ticket already in a terminal state; a legitimate ticket creation still succeeds (positive control) | ✅ | `review-queue.test.mjs` · *a requester can open an ordinary ticket (positive control)*; *…already rejected*; *…already verified*; *…already carrying a decision* |
| A2 | A rejection with an empty or whitespace-only note is refused | ✅ | *a rejection with an empty note is refused*; *…whitespace-only note…*; positive control *a rejection with a real note is recorded, as the real role* |
| A3 | A reviewer edit sets `edited_before_approval` **true**; an unedited approval sets it **false**; editing the draft text instead does **not** produce a false clean score | ✅ | *a reviewer's edit is recorded as an edit*; *an unedited approval is recorded as unedited*; *a caller cannot self-report a clean score*; *the baseline cannot be edited instead of the approval*; *the ticket text cannot be moved under a pending decision* |
| A4 | `clause_draft.text` cannot be changed once attached to a ticket | ✅ | *the baseline cannot be edited instead of the approval*; positive control *an unused draft is still ordinary work in progress* |
| A5 | Deleting a ticket **raises** | ✅ | *a review ticket cannot be deleted*; *a draft cannot be deleted either* |
| A6 | The whole path runs as `cw_legal_reviewer` / `cw_requester`, not the owner | ✅ | every **governed** act — opening, rejecting, verifying, minting, reading under RLS — goes through `roles.mjs` `queryAs`/`execAs` as a real role. Owner-run statements are confined to library seeding and to the tests that assert a **trigger's** own words (delete refusal, origin/`source_ticket_id` immutability, segment immutability), where a role-run test would pass on a missing grant and prove nothing about the rule — the same reasoning `ladder.test.mjs` uses for `concession_no_delete` |
| A7 | Both character counts are computable; **no stored snapshot id changes**; the zero-authored-characters test passes untouched | ✅ | `test_no_stored_snapshot_id_changes` pins the literal id; `test_origin_is_not_in_the_snapshot_fingerprint`; `test_ai_originated_characters_are_counted`; `cw.library_origin_mix` / `cw.run_origin_mix`; `test_the_document_contains_zero_authored_characters` **unchanged** |
| A8 | `origin` cannot be rewritten after approval | ✅ | *origin cannot be rewritten after approval*; *the ticket a clause came through cannot be rewritten either* |
| A9 | `cw.run` records which engine produced its `result_hash` | ✅ | `run-store.test.mjs` · *a run records which engine produced its result hash*; *a run cannot omit which engine produced it*; *the engine version reaches the permanent record* |
| A10 | `npm run verify` exits 0 — no `MISS`, `IMPRECISE`, or `SKIP` | ✅ | raw tail in §8 |

Baseline before this package: 8/8 suites, 146 Python tests, 43/43 and 43/43 mutations.
After: **9/9 suites, 158 Python tests, 57/57 and 47/47 mutations, exit 0.**

---

## 2. Files changed

**New**
- `backend/db/migrations/0008_review_queue.sql`
- `backend/db/migrations/0009_clause_origin.sql`
- `backend/db/test/review-queue.test.mjs` (43 tests)

**Edited**
- `backend/db/migrations/0002_clause_registry.sql` — `provenance` gains `'reviewed'`.
- `backend/db/migrations/0003_ladders_and_concessions.sql` — `promote_concession()` now mints
  through the shared `cw.mint_clause_version()`. **WP-06's policy/grant structure is untouched**:
  the column grant, `promote_update`, `promote_once`, `concession_immutable()`,
  `concession_no_delete()`, the `revoke … from public`, and the severity derivation all stand
  exactly as WP-06 left them, and all seven WP-06/WP-07 mutations still pass.
- `backend/db/migrations/0005_run_store.sql` — `cw.run.engine_version` (WP-32), plus the audit
  payload and `cw.run_summary`.
- `backend/db/test/mutation-check.mjs` — 14 new entries, 1 repaired `find`.
- `backend/db/test/run-store.test.mjs` — 4 new tests; engine pin added to six inserts.
- `backend/db/test/executed.test.mjs` — one seeded run gains the engine pin (collateral repair,
  see §7).
- `backend/engine/model.py` — `Clause.origin`, the origin enum, `ENGINE_VERSION`.
- `backend/engine/snapshot.py` — comment only: why `origin` is excluded from the fingerprint.
- `backend/engine/run.py` — `engine_version`, `authored_chars`, `ai_origin_chars` on the run row;
  `origin` read back on rebuild.
- `backend/engine/docx.py` — `ai_originated_characters()`, `provenance_counts()`.
- `backend/engine/test_run.py` (+7 tests), `backend/engine/test_docx.py` (+5 tests),
  `backend/engine/mutation_check.py` (+4 entries).

**Not touched:** `0001`, `0004`, `0006`, `0007`, `package.json`, any architecture document.
`0010`/`0011` remain free.

---

## 3. The state machine, as built

```
              ┌─────────┐  verify(body)  ┌──────────┐
  open ──────►│ pending ├───────────────►│ verified │ terminal · mints a clause version
  (allow-list)└────┬────┘                └──────────┘
                   │  reject(note)       ┌──────────┐
                   ├────────────────────►│ rejected │ terminal · note must be non-blank
                   │                     └──────────┘
                   │  lapse              ┌──────────┐
                   └────────────────────►│ expired  │ terminal
                                         └──────────┘
```

Enforced on **both verbs**, twice each:

| | INSERT | UPDATE | DELETE |
|---|---|---|---|
| Trigger | `review_ticket_opens_pending` — initial-state allow-list | `review_ticket_transition` — transition allow-list, evidence immutability, flag derivation | `review_ticket_no_delete` — **raises** |
| CHECK | `pending_has_no_decision`, `rejection_needs_note`, `terminal_needs_decider`, `verified_names_its_clause` | same four, re-evaluated after the trigger | — |
| Policy/grant | `open_ticket` (requester, reviewer, admin) | `decide_ticket` with **both** `using` and `with check`; **no UPDATE grant to `cw_requester`** | no grant |

Tables: `cw.clause_draft`, `cw.review_ticket`, `cw.review_segment`, `cw.review_candidate`, plus
`cw.clause_version.source_ticket_id`. Views: `cw.clause_entrance` (which door each version came
through — an `UNACCOUNTED` row is asserted impossible) and `cw.review_quality` (the
unedited-approval rate; **no threshold is set — Legal owns it**).

`cw.review_candidate` stores **references**, `(clause_id, version)` with a foreign key, never
copies. Verified safe as instructed: `0002` guards body/title/citations/reviewer/dates and refuses
delete, and retire/supersede preserve the row, so the reference resolves to the same bytes forever.

---

## 4. The five mandatory corrections — how each was implemented and proved

**1 · Guard INSERTs, not only UPDATEs.** `cw.review_ticket_opens_pending()` is a `before insert`
trigger written as an **allow-list**: `state` must be `pending` and all seven decision columns must
be null. It additionally refuses a draft-backed ticket whose `proposed_text` is not the draft
verbatim, which closes pre-editing the baseline at open time.
*Proved by:* three negative tests **and the positive control** (*a requester can open an ordinary
ticket*), which runs first — an insert guard that also blocks legitimate creation is an outage, not
a guard. *Mutation:* `a ticket can be born already decided (the ungoverned INSERT)` — drops the
trigger.

**2 · The note CHECK rejects `''`, not merely null.**
`check (state <> 'rejected' or coalesce(btrim(decision_note), '') <> '')`. `btrim` covers
whitespace-only, which is what a form posts when a reviewer types spaces.
*Proved by:* empty-note and whitespace-only tests, plus a positive control that a real note lands.
*Mutation:* `the mandatory rejection note is satisfied by an empty string` — reverts the CHECK to
`decision_note is not null`, which is exactly the refuted version.

**3 · `edited_before_approval` is genuinely derivable.** Three changes together:
`cw.verify_review_ticket()` gained **`p_body`**; the approved bytes are **stored** in
`review_ticket.approved_text`; and the flag is assigned **inside the before-update trigger** from
`approved_text is distinct from proposed_text`, overwriting whatever the caller supplied. The
insert guard refuses a value at open time, so it can never be seeded either.
*Proved by:* edit → `true`; unedited approval → `false`; a hand-supplied `false` on an edited
approval is overwritten to `true`; and `cw.review_quality` returns a real fraction.
*Mutations:* `edited_before_approval is pinned to false` and `the caller may supply their own
edited_before_approval`.

**4 · `clause_draft.text` is immutable once attached.** `cw.clause_draft_frozen_when_used()` raises
on any update to a draft that a ticket references. Before attachment a draft is ordinary work in
progress and may be revised — proved by its own positive control, because a freeze that also blocked
routine drafting would be switched off by its users.
*Mutation:* `the draft behind a ticket can still be rewritten`. The third route to the same defeat —
moving the ticket's own copy — is closed by `proposed_text` immutability and has its own test and
mutation.

**5 · No `do instead nothing` on delete.** `cw.review_no_delete()` **raises** on
`review_ticket`, `review_segment`, `review_candidate` and `clause_draft`.
*Proved by:* *a review ticket cannot be deleted* (owner-run, asserting the trigger's own words —
a role-run test would pass on a missing grant and prove nothing about the rule).
*Mutation:* `deleting a ticket is silently ignored instead of refused`.

**Plus the D1 lesson from line one.** `decide_ticket` is an explicit `for update` policy with
**both** `using` and `with check`; `verify_review_ticket()` and `reject_review_ticket()` check the
rowcount and raise rather than trusting the absence of an error. *Mutation:* `deciding a ticket
silently records nothing (finding D1, at the new gate)`.

---

## 5. Reconciling `promote_concession()`

`cw.mint_clause_version()` is the single entrance both doors call. It validates the body and the
named approver, creates the clause identity if absent, computes the next version, and writes the
row. `promote_concession()` keeps its own severity derivation, its own citation, its own audit hook
and every WP-06 guard; only the two hand-written INSERTs moved.

`cw.clause_version.source_ticket_id` plus `cw.clause_entrance` turn "every non-seeded clause came
through a recorded gate" into a query with an asserted answer. `cw.clause_version_from_ticket()`
refuses any version naming a ticket that is not `verified`, or carrying bytes that ticket did not
approve, or naming a different clause than the ticket verified — which is what makes the reviewer's
narrow INSERT privilege safe.

**Who mints.** ADR-0003 puts minting on the *reviewer* ("Verify … mints a clause"), while ADR-0008
reserves the library to `legal_admin`. Resolved by granting `cw_legal_reviewer` INSERT on
`cw.clause`/`cw.clause_version` fenced to `source_ticket_id is not null` by policy **and** by the
trigger above. Activation, retirement and supersession remain `legal_admin` alone.
**Residual, disclosed:** a `cw_legal_reviewer` can insert a bare `cw.clause` identity with no
version. That row carries no text and is inert until a version exists, and a version needs a
verified ticket — but it is a wider privilege than strictly required, and a follow-up could fence it
the same way.

---

## 6. The `external` reconciliation, and its rationale

**Chosen: `external` is a clause-version `origin`, and the "never selectable" promise is enforced in
`cw.clause_version_state.selectable`** — not left to a separate table nothing happens to join.

- The enforceable half is the one worth keeping. A side entity is "never selectable" only because
  today's queries do not reach it; that is a property of the current SQL, not a rule. An origin
  value on the one table resolution actually draws from is refused by the same expression that
  already refuses retired and expired language, for every future query too.
- Supplier paper still has to be countable. `cw.clause_entrance` and both provenance figures must
  see it; a side table would be outside both.
- It costs the other design nothing. The agreement-scoped entity in `NEGOTIATION-ARCHITECTURE.md`
  §7 is WP-19's work (migration `0011`) and can **reference** these versions rather than duplicating
  their text — the same reference-not-copy rule `0008` applies to candidates.

*Proved by:* *external wording is never selectable*. *Mutation:* `supplier paper is selectable for
our own drafts`. **No architecture document was edited** — another owner holds them; this is the
record for the final report.

---

## 7. Deviations, limitations and disclosures

1. **`origin` immutability lives in `0009`, not `0002`.** Gate 3 §7 declared `0002` the writer. The
   check is in a `create or replace` of `cw.clause_version_immutable()` inside `0009` instead: the
   column does not exist until `0009`, and a `0002` trigger naming a column added four files later
   is a trap for anyone who reorders migrations. The trigger declaration stays in `0002` and the
   substance — origin cannot be rewritten — is identical and mutation-proved.
2. **`0002` was edited for `provenance`, adding `'reviewed'`.** Not in the packet's list of writes,
   but the ticket entrance needs a value the enum permits.
3. **`executed.test.mjs` was edited** — one seeded `cw.run` insert needed the engine pin. Not in my
   ownership list, but the constraint "repair any `find` string your edits destroy — you cannot
   defer it" applies equally to a suite my schema change broke. One line, no assertion changed.
4. **No existing assertion was weakened.** `test_the_document_contains_zero_authored_characters` is
   byte-for-byte unchanged and still green. No mutation was removed; one `find` string was repaired
   in place, and its `expect` is unchanged.
5. **`mint_clause_version()` accepts `p_origin` in `0008` and ignores it** — the column arrives in
   `0009`. The parameter is in the signature from the start so `0009` can `create or replace`
   without changing the signature and no caller moves. Documented at both sites.
6. **`cw.mint_clause_version()` is called from `0003`, which runs first.** Safe because a plpgsql
   body resolves its calls at run time, and nothing calls it during migration. Stated in the SQL.
7. **`expired` has no function.** The state is legal and reachable by UPDATE; no scheduled job
   exists to drive it, because nothing in this repository schedules anything.
8. **`cw.run.authored_chars` / `ai_origin_chars` default to `0`.** A run that emitted no document
   has nothing to count. `engine_version` deliberately has **no** default — a default would let a
   writer that does not know its own version record a run anyway, and the column would read like a
   fact while meaning "whatever the schema guessed".
9. **`loader.py` was not touched** (not in my ownership). Snapshots built from the live registry
   therefore carry the default `legal_authored` until a package extends `CLAUSE_SQL` to select
   `origin`. The database-side figures (`cw.library_origin_mix`, `cw.run_origin_mix`) are complete
   today; the engine-side figure is complete for any caller that supplies origin, which
   `snapshot_from_rows` already reads.
10. **`0005`'s `do instead nothing` delete rules were left alone.** WP-25c owns the loud-DELETE
    sweep across the existing migrations; correction 5 was applied to the tables this package
    creates.

---

## 8. Raw verify tail

```
9/9 suites passed
158 passed in 1.91s
57/57 mutations caught by their named test
47/47 mutations caught by their named test
VERIFY EXIT=0
```

No `MISS`, no `IMPRECISE`, no `SKIP`.

---

## 9. Mutations added

**SQL — 14 new (43 → 57), 1 `find` repaired**

| Mutation | Named test |
|---|---|
| a ticket can be born already decided (the ungoverned INSERT) | a requester cannot open a ticket that is already rejected |
| the mandatory rejection note is satisfied by an empty string | a rejection with an empty note is refused |
| edited_before_approval is pinned to false | a reviewer's edit is recorded as an edit |
| the caller may supply their own edited_before_approval | a caller cannot self-report a clean score |
| the draft behind a ticket can still be rewritten | the baseline cannot be edited instead of the approval |
| the text under review can be swapped before the decision | the ticket text cannot be moved under a pending decision |
| deleting a ticket is silently ignored instead of refused | a review ticket cannot be deleted |
| deciding a ticket silently records nothing (D1, at the new gate) | a rejection with a real note is recorded, as the real role |
| a clause version may name a ticket nobody verified | a clause version cannot name a ticket that was never verified |
| the reviewer mint policy stops requiring a ticket at all | a reviewer cannot mint a clause version out of thin air |
| clause origin can be rewritten after approval | origin cannot be rewritten after approval |
| supplier paper is selectable for our own drafts | external wording is never selectable |
| a draft-backed ticket may declare itself lawyer-composed | a reviewer's edit is recorded as an edit |
| a run need not say which engine produced its hash | a run cannot omit which engine produced it |

*Repaired:* `promoted clauses are all minted as Standard` — its `find` string was destroyed when the
two INSERTs moved into `mint_clause_version()`; it now targets the `p_severity => sev` call site and
proves the same guarantee via the same test.

**Python — 4 new (43 → 47)**

| Mutation | Named test |
|---|---|
| clause origin is hashed into the snapshot fingerprint (S0-4 regression) | test_no_stored_snapshot_id_changes |
| the second provenance count always reports zero | test_ai_originated_characters_are_counted |
| AI-originated clause text is counted as authored by the system | test_the_first_count_is_still_zero_when_the_second_is_not |
| a replayed run is stamped with today's engine, not the one that ran it | test_the_engine_version_can_be_overridden_for_a_replay |

---

## 10. What downstream packages must know

- **WP-18 (`0010_governance.sql`)** — `cw.review_ticket` is the natural carrier for Required
  Approvers: add an approvals child table keyed on `ticket_id` and gate the `pending → verified`
  transition inside `cw.review_ticket_transition()`. Do **not** add a second UPDATE policy; extend
  `decide_ticket`, and keep both `using` and `with check`.
- **WP-19 (`0011_negotiation_record.sql`)** — the external-clause entity should **reference**
  `cw.clause_version` rows carrying `origin='external'`, not duplicate their text. Those rows are
  already non-selectable and already counted. Rounds and positions can hang off
  `cw.review_ticket.agreement_id`.
- **WP-23 (coherence)** — new seed clauses must satisfy `clause_version_origin_check`; the default
  `legal_authored` covers ordinary seeding. Note `cw.selectable_clause` now also excludes
  `origin='external'`.
- **WP-26 / documents** — the `external` choice in §6 is **not** written into any architecture file.
  `ADR-0010:72` and `NEGOTIATION-ARCHITECTURE.md:244` still read as two designs; whoever owns those
  files should record the adjudication.
- **WP-27** — `cw.run.engine_version` is `NOT NULL` with no default. Any new run insert, in SQL or
  in Python, must supply it; `engine.model.ENGINE_VERSION` is the source, currently
  `clausewerk-engine/3`, and it must be bumped whenever anything feeding `result_hash` changes.
- **Everyone** — two migrations were added, so every suite now replays nine files. `cw.clause` and
  `cw.clause_version` carry a new INSERT policy for `cw_legal_reviewer`; a package changing those
  grants must keep the `source_ticket_id` fence.
