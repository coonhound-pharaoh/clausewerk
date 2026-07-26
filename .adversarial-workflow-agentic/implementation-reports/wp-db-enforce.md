# WP-DB-ENFORCE — WP-05, WP-06, WP-07, WP-08

Assignment `IMPL-DB-ENFORCE`. Database enforcement: the immutability holes, promotion under real
permissions, the floor made absolute, and the agreement status machine.

---

## 1. Acceptance criteria — written before any code was edited

Per the Gate-3 rule (§6: "the implementer writes the acceptance criteria into the implementation
report *before* editing code"), these are the criteria this package is measured against. They were
fixed at the start and are not restated after the fact.

1. `reviewer` cannot be rewritten on an approved clause version; un-retiring is refused; **both**
   directions of the retired flag are audited; conflict-rule `effective_on` cannot move.
2. The **whole promotion path runs as `cw_legal_admin`, not the owner**; double promotion **raises**
   rather than silently no-opping; `vendor_text` / `approved_by` rewrites are denied.
3. A `cw_legal_reviewer` cannot promote by setting `cw.role`, and cannot promote via a public
   EXECUTE grant.
4. A High concession mints a High clause, not a Standard one.
5. A High concession cannot pass a Standard floor; a legitimate Standard rung-2 concession is **no
   longer wrongly rejected**; a concession with no ladder is refused with a clear error.
6. Executing an agreement moves its status; an illegal transition raises; the transition is audited.
7. `npm run verify` exits 0 — no `MISS`, no `IMPRECISE`, no `SKIP`.

**All seven are met.** Evidence per criterion is in §5.

---

## 2. Files changed

| File | Why |
|---|---|
| `backend/db/migrations/0002_clause_registry.sql` | WP-05: `reviewer` protected, un-retiring refused, retired flag audited both ways |
| `backend/db/migrations/0003_ladders_and_concessions.sql` | WP-06 + WP-07: promotion permissions, severity, concession immutability, floor lookup, rung immutability |
| `backend/db/migrations/0004_conflict_rules.sql` | WP-05: `effective_on` protected, un-retiring refused, retired flag audited both ways |
| `backend/db/migrations/0006_executed_agreements.sql` | WP-08: the status machine |
| `backend/db/test/registry.test.mjs` | WP-05 tests (clause versions and conflict rules) |
| `backend/db/test/ladder.test.mjs` | WP-06 + WP-07 tests, promotion moved onto the real role |
| `backend/db/test/executed.test.mjs` | WP-08 tests; plus one fixture repair forced from outside (F-1) |
| `backend/db/test/mutation-check.mjs` | 17 new mutation entries |
| `LIFECYCLE-ARCHITECTURE.md` | The agreement-state row only (line 296) |

Nothing else was touched. `0001`, `0005`, `0007`, `backend/engine/**` and `package.json` are
untouched, as instructed.

---

## 3. What was done, per finding

### WP-05 · Immutability holes (D4)

**Clause versions (`0002`).** `reviewer` joins the immutable field list. It is the named human at
the end of the provenance chain an auditor walks — obligation → clause → policy → reviewer →
approval date — and it was the one link in that chain anyone with UPDATE could quietly change after
approval.

Un-retiring is refused outright, with the correct move named in the error: bringing withdrawn
language back is a **new approval**, not an edit, and goes through the same gate as any other — a
new version.

The audit hook fired only in the retire direction, so language coming *back* left no trace at all.
It now records both, as `clause_retired` and `clause_unretired`.

**Conflict rules (`0004`).** Same two shapes, both of which rewrote *history* rather than data.
`effective_on` decides which rules were in force on a given day and `cw.active_conflict_rule` reads
it; moving it backwards changes, after the fact, the answer to "was this contract checked against
the right rules when we signed it?". Every conflict finding cites a rule version precisely so that
question has one fixed answer. And un-retiring a rule is now refused for the same reason as a
clause.

### WP-06 · Promotion under real permissions (D1 + D6)

**The adjudicated remedy was used; the `security definer` branch was not.** `cw.promote_concession()`
stays `security invoker`. What it gained:

```sql
grant update (promoted_to_clause) on cw.concession to cw_legal_admin;   -- column-level
create policy promote_update on cw.concession for update                -- permissive
  using (cw.app_role()='legal_admin') with check (cw.app_role()='legal_admin');
create policy promote_once on cw.concession as restrictive for update   -- restrictive
  using (promoted_to_clause is null) with check (promoted_to_clause is not null);
revoke all on function cw.promote_concession(...) from public;
grant execute on function cw.promote_concession(...) to cw_legal_admin;
```

D1 and D6 were fixed together, as required: the permissive policy is what makes the closing UPDATE
actually work for a real `cw_legal_admin` (D1), and it is also what removes the accidental
immutability concessions had been relying on — so `cw.concession_immutable()` lands in the same
change (D6), as an **allow-list**: exactly one field may move, in one direction.

`revoke all … from public` is treated as load-bearing and has its own test, because PostgreSQL
grants EXECUTE on every new function to PUBLIC by default.

**Severity, found in passing.** `promote_concession()` hard-coded `severity='Standard'`, so wording
surrendered against a **High** position came back into the library quietly demoted. Severity is now
derived from the position conceded against.

**Deletes raise** rather than silently doing nothing, per settled decision S0-3.

### WP-07 · The floor made absolute (D5)

The floor lookup matched on category alone, with no severity filter and no `ORDER BY`. Two defects
followed and both are now closed:

- **Wrong ladder.** With a High and a Standard ladder in one category, `limit 1` returned whichever
  the planner happened to hand back — in the reproduction, the High floor at rung 0 — and refused a
  Standard rung-2 concession sitting exactly on its own floor. The lookup now filters on the
  severity of the standard position and orders deterministically.
- **No ladder meant no limit.** A missing floor was read as "no floor", and rung 99 with no override
  was accepted silently. A rung concession with no floor behind it now **raises**.

The concession also records `ladder_id` and `ladder_floor_rung` — the ladder it was judged against
and where that ladder's floor sat *at the time* — so "was this within authority?" is answerable from
the record rather than re-derived from a ladder that may since have been re-ordered.

Published rungs are immutable: which clause version occupies a rung, and the rung number, cannot
change.

### WP-08 · Agreement status machine (D7)

Status has existed since `0003` and nothing has ever moved it — every deal read as "negotiating"
forever, including deals whose signed document was already filed.

Permitted moves: `negotiating → executed`, `negotiating → terminated`, `executed → terminated`.
Nothing else; in particular there is no way back. Every move is audited with where it came from.

**Execution is the only thing that moves it.** `cw.agreement` has no UPDATE grant and no UPDATE
policy for any role, deliberately. Filing the signed contract fires a `security definer` trigger
that moves the status. Anyone who wants a deal marked executed must produce the signed contract.

**Reconciliation with `LIFECYCLE-ARCHITECTURE.md:296`.** The document described
`executing → active → terminating → wound_down → closed`. **The schema wins and the document was
corrected.** The document's set had no state for a deal *before* signature — where every agreement
starts and most of them live — and its finer post-signature steps describe obligation wind-down that
is not built. Adopting it would have put five states in the schema of which four could never be
reached: a promise on the page with nothing behind it, which is the class of defect this work exists
to remove. Only that one table row was edited.

---

## 4. Mutations added

Seventeen new entries, all `ok` — each fires via **its named test**.

| # | Mutation | Named test |
|---|---|---|
| 1 | the reviewer on an approved clause is editable | the named reviewer cannot be rewritten |
| 2 | a retired clause can be un-retired | a retired clause cannot be un-retired |
| 3 | un-retiring is logged as a retirement | un-retiring leaves a record even if the guard is bypassed |
| 4 | a conflict rule's effective date can be moved retroactively | a rule's effective date cannot be moved retroactively |
| 5 | a retired conflict rule can be brought back by an edit | a retired conflict rule cannot be brought back by an edit |
| 6 | promotion silently records nothing (D1 regression) | the promotion is actually recorded on the concession |
| 7 | the promotion column can be cleared | a legal_admin cannot touch promoted_to_clause outside a promotion |
| 8 | the concession immutability trigger is neutered (D6) | a recorded concession cannot be rewritten |
| 9 | the promotion function is left executable by everyone | a legal reviewer cannot even call the promotion function |
| 10 | promoted clauses are all minted as Standard | a High concession mints a High clause, not a Standard one |
| 11 | a concession can be deleted | a concession cannot be deleted |
| 12 | the floor lookup ignores severity (D5 regression) | a legitimate Standard concession at its own floor is accepted |
| 13 | a missing floor is read as no floor | a concession with no ladder is refused with a clear error |
| 14 | the wording on a published rung can be swapped | the wording on a published rung cannot be swapped |
| 15 | signing a contract never moves its status (D7 regression) | executing an agreement moves it out of negotiating |
| 16 | any status transition is permitted | an executed agreement cannot slide back to negotiating |
| 17 | a deal changing state leaves no record | the status transition is audited |

**The mutation warning was honoured.** Mutation #8 neuters the **trigger body**, not the grant. If
it had removed the grant instead, `permission denied for table concession` would have arrived first
and the "a real legal_admin cannot rewrite the vendor text" test would have caught it — leaving the
trigger itself completely unproven while the harness reported success. The test #8 names runs as the
**owner**, whom no grant stops, and asserts the trigger's own words.

**Mutation #6 is the one that could only exist on the real role.** Run as the owner it is invisible:
the owner bypasses row-level security, so removing the UPDATE policy changes nothing they can see.
That is finding D1 in one line.

**The public-EXECUTE mutation (#9) is not inert.** Gate-3 §5 flagged it as "likely inert as written;
prove it fails before adopting it". It was proved: with the revoke removed, `cw_legal_reviewer` gets
past the EXECUTE gate and fails later with a different error, so the test asserting
`permission denied for function promote_concession` fails. Confirmed `ok`.

**No live `find` string was destroyed.** All fifteen pre-existing entries still match and still pass;
`the floor is not absolute`, `vendor language accepted without an override`, `anyone may promote`,
`viewers can read the concession record` and `requesters see every buyer's concessions` were all
preserved verbatim through the `0003` rewrite, deliberately, so no repair was needed.

---

## 5. Evidence — each acceptance criterion, proved

| # | Criterion | Proving test(s) |
|---|---|---|
| 1 | reviewer immutable | `the named reviewer cannot be rewritten` + `…by a real legal_admin either` |
| 1 | un-retiring refused | `a retired clause cannot be un-retired` |
| 1 | both directions audited | `un-retiring leaves a record even if the guard is bypassed` |
| 1 | `effective_on` fixed | `a rule's effective date cannot be moved retroactively` |
| 2 | promotion as the real role | `legal_admin can promote vendor text into a new clause` (via `queryAs`) + `the promotion is actually recorded on the concession` |
| 2 | double promotion raises | `the same concession cannot be promoted twice` (real role, asserts the raise) |
| 2 | rewrites denied | `a real legal_admin cannot rewrite the vendor text` / `…who approved a concession` |
| 3 | GUC spoof refused | `a legal reviewer cannot promote by claiming to be legal_admin` |
| 3 | public EXECUTE | `a legal reviewer cannot even call the promotion function` |
| 4 | severity derived | `a High concession mints a High clause, not a Standard one` + `a Standard concession mints a Standard clause` |
| 5 | right floor | `a legitimate Standard concession at its own floor is accepted` |
| 5 | wrong floor not borrowed | `a High concession cannot pass the Standard floor` |
| 5 | fails closed | `a concession with no ladder is refused with a clear error` + `an override does not buy a rung on a ladder that does not exist` |
| 6 | execution moves status | `executing an agreement moves it out of negotiating` |
| 6 | illegal transitions raise | `an executed agreement cannot slide back to negotiating` + `a terminated agreement cannot be revived` |
| 6 | audited | `the status transition is audited` |
| 7 | verify green | below |

The spoofing test (criterion 3) is worth reading closely. It hands `cw_legal_reviewer` the EXECUTE
grant they should not have **and** lets them spoof `cw.role='legal_admin'` — both halves of the
escalation the red team demonstrated — and they are still refused, by table privileges they
genuinely do not hold, with nothing reaching the library. That is the defence-in-depth the
`security definer` branch would have removed.

### Raw `npm run verify` tail

```
15 passed, 0 failed

8/8 suites passed
...
146 passed in 2.02s
...
40/40 mutations caught by their named test
...
43/43 mutations caught by their named test
EXIT=0
```

Suite-by-suite: `23 / 23 / 50 / 16 / 45 / 10 / 22 / 15` passed, **0 failed** across all eight.
No `MISS`, no `IMPRECISE`, no `SKIP`.

---

## 6. Deviations from the packet

1. **Severity is derived, not stored.** The packet's source material assumed a `severity not null`
   column on `cw.concession` — which the red team noted would break six INSERT statements across
   five tests (§5c). It is instead derived from `cw.clause` on the standard position being conceded
   against. One source of truth, no fixture churn, and a second copy that could disagree with the
   first never gets created.
2. **A permissive UPDATE policy sits alongside the restrictive one.** The packet says "a restrictive
   UPDATE policy". A restrictive policy on its own grants nothing — PostgreSQL requires at least one
   permissive policy for the command or the table stays default-deny, which is finding D1 unchanged.
   Both ship: `promote_update` (permissive, grants the write to legal_admin) and `promote_once`
   (restrictive, subtracts everything except one move in one direction).
3. **The no-ladder raise fires on the rung path only.** The red team flagged this collision as
   undecided (§5b). Decided and stated in the migration: descending to rung 5 of a ladder nobody has
   published is indefensible and is refused; taking vendor wording is a different act, already gated
   by an unconditional recorded override, and requiring a ladder as well would block a fully
   authorised concession in any category Legal has not yet laddered — which is most of them, early
   on. Both behaviours have tests.
4. **`ladder_floor_rung` recorded, not "rung".** The packet asked for "`ladder_id` and rung";
   `conceded_rung` already existed, so what was actually missing was the floor in force at the time.
5. **Rung immutability protects `clause_id`, `version` and `rung` — not `is_floor`.** Protecting
   `is_floor` would have replaced the error the existing test `a ladder cannot have two floors`
   expects, i.e. it would have required weakening an existing assertion. It is also right on the
   merits: which wording sits on a rung is a published fact; how far down we will go is a live
   governance call. Both halves have tests.
6. **Conflict-rule tests live in `registry.test.mjs`.** The natural home, `loader-sql.test.mjs`, is
   not owned by this package.
7. **No existing test assertion was weakened, removed, or edited**, with one exception forced from
   outside the package — see F-1.

---

## 7. Things found that were not in the plan

**F-1 — a fixture broke mid-package, from the other implementer's file.** Partway through, the
concurrent implementer landed settled decision S0-2 in `0005` (`run_decision.category` →
`category_key` with an FK). That immediately broke `executed.test.mjs`, which is **my** file: its
seed inserted the human label `'Data Privacy'` into a column that now takes the key. Repaired
mechanically in my own file (`category` → `category_key`, `'Data Privacy'` → `'data'`). This is not
a weakening — no assertion changed, and the fixture now says the same thing correctly. Disclosed
because it is the one edit to a pre-existing line in this package.

**F-2 — `roles.mjs` leaves its own actor behind, and that silently broke an audit assertion.** The
helper's `as()` resets the database role but not the `cw.actor` / `cw.role` session variables, so
after any `queryAs(...)` the suite's actor is `<role>@clausewerk` rather than the suite's own. In
`registry.test.mjs` this made a later, entirely unrelated test — `the actor and role are captured on
every event` — fail with a confusing message about the wrong actor. Every call site in this package
restores the suite's actor immediately afterwards. **Downstream packages adopting the helper should
expect this**; it is not obvious from reading `roles.mjs`, and the failure it produces points at the
wrong test.

**F-3 — the un-retire audit branch is unreachable in normal operation, on purpose.** Refusing to
un-retire and recording an un-retirement are two guards on the same event, and the first one wins:
the BEFORE-UPDATE guard raises before the AFTER-UPDATE audit hook can run. Rather than ship a branch
that cannot fire and cannot be tested — an inert check, which Gate 3 §5 rightly calls a defect — the
test disables the guard from below the application, exactly as an attacker with database access
would, and proves the record still appears. Same technique WP-03b used for the fork guard.

**F-4 — `do instead nothing` slipped in and was caught by S0-3.** The concession no-delete protection
was first written as a rule, copying the existing pattern in `0002` and `0006`. Settled decision S0-3
bans that in new work — deletes on append-only tables must raise. Rewritten as a trigger that raises,
with its own test and mutation. Flagging it because the banned pattern is the *surrounding house
style* in three migrations, so it will be reached for again: `0002`, `0004` and `0006` still carry
it, and removing those is WP-25c's job.

---

## 8. Honest limitations

1. **Clearing an already-promoted flag is blocked *silently* for a real `cw_legal_admin`.** The
   restrictive policy's `using` clause hides the row, so the UPDATE matches nothing and affects zero
   rows without an error — the same silent-no-op shape this package exists to remove. The loud
   message comes from `cw.concession_immutable()`, which is only reached on paths where the row is
   visible (the owner). It is blocked either way; it is not always *told*. Closing this properly
   needs a different mechanism than row-level security.
2. **`cw.app_role()` is still a client-settable session variable.** The role check inside
   `promote_concession()` therefore stops nobody on its own, and the migration says so in those
   words. What actually holds the line is the EXECUTE grant plus the table privileges, and the
   spoofing test proves it. Narrowing identity to the connection role is WP-04's job; this package
   is safe without it, but the comment in `0003` should be revisited when WP-04 lands.
3. **The status machine has three states, not five.** Obligation wind-down (`active`, `terminating`,
   `wound_down`, `closed`) is genuinely not built, and the document has been corrected to say so
   rather than the schema being padded to match it. When wind-down is built, states get added with
   the code that moves them.
4. **`is_floor` remains mutable by design** (deviation 5). A ladder's floor can be moved without a
   new ladder. Concessions now copy the floor that was in force at the time, so past decisions are
   still readable against the rule they were taken under — but the ladder's *current* floor is not a
   historical record and should not be read as one.
5. **RLS is enabled, not forced.** Unchanged from WP-03: the table owner bypasses every policy in
   this package, deliberately, because migrations and seeding run as the owner. The concession
   immutability trigger is the one protection here that also binds the owner.
6. **Trigger ordering on execution works, and now by statement rather than by luck.** The
   `AFTER INSERT` trigger on `cw.executed_agreement` fires the `BEFORE UPDATE` transition trigger on
   `cw.agreement`. The permitted-move list includes `negotiating → executed`, so the consequential
   update passes. `cw.executed_agreement`'s primary key is `agreement_id`, so a second execution row
   cannot exist and `executed → executed` is unreachable.
