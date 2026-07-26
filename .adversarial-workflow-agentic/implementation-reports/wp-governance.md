# Implementation report — WP-18a/b/c/d · WP-19

**Assignment:** IMPL-GOVERNANCE · Stage 4 (Gate 4) · single owner.

---

## 1. Acceptance criteria — written BEFORE any code was edited

Per the Gate 3 remediation rule (§6): the implementer writes the criteria into the report first,
and the validator checks against this written record.

| # | Sub-package | Criterion | Met | Proof (named test) |
|---|---|---|---|---|
| G1 | 18a | A concession at a fallback position is refused (cannot be put in force) until the **Requester**, the **assigned attorney** and **every configured Required Approver** have approved | ✅ | `governance.test.mjs` · *settling is refused while anybody is still missing*; *a deal with no assigned attorney cannot settle anything*; *with everyone in, the concession comes into force* |
| G2 | 18a | Adding a Required Approver **changes the outcome** — proving the model is configurable, not hard-coded | ✅ | *with no Required Approver configured, two approvals are enough* (the A side) → *adding a Required Approver changes the outcome* (the B side) → *once the Required Approver signs, it settles* |
| G3 | 18a | A **machine-proposed** settlement cannot complete without a named human approval | ✅ | *a machine-proposed concession cannot settle without a human approval*; *who proposed a concession cannot be rewritten afterwards*; *the same machine proposal settles once humans have signed it* |
| G4 | 18b | A record under **legal hold** cannot be destroyed by the retention path; releasing the hold is **audited** | ✅ | *a record under legal hold cannot be destroyed by the retention path*; *releasing a hold is an audited act*; *one release is not enough while another matter is still open*; *with every hold released, destruction proceeds and is audited* |
| G5 | 18c | Signature evidence carries **certificate bytes**; signatories are **records**; frozen-document guarantees still hold | ✅ | *the completion certificate is stored as bytes, not as a reference*; *signatories are records, not two text fields*; *who signed cannot be rewritten after execution*; all pre-existing `executed.test.mjs` assertions unchanged and green |
| G6 | 18d | A SOW can **name its master**; by default a SOW **may not contradict** it; the default is visibly an **owner decision** (`U2`) | ✅ | *a statement of work names its master*; *by default a SOW cannot contradict its master*; *the strict default is marked an open owner decision, not a settled rule*; *the looser reading is reachable — the owner can relax it* |
| G7 | 19 | A negotiation **round is append-only** — updating or deleting one **raises** | ✅ | *a round cannot be updated once recorded*; *a round cannot be deleted either — it RAISES*; and the same for positions and movements |
| G8 | 19 | Renewal can open from the **executed agreement's positions** *or* from **library standard**; both reachable, choice recorded (`U1`) | ✅ | *by default a renewal opens from the executed agreement's positions*; *library standard is reachable as an explicit, recorded choice*; *the two baselines genuinely differ*; *which baseline was taken is in the audit trail, with the default alongside* |
| G9 | all | Tested **as the real database role**, not the owner | ✅ | every governed write in `governance.test.mjs` and `negotiation.test.mjs` goes through `roles.mjs` (`mustWrite` / `mustNotWrite` / `queryAs`). Owner-run statements are confined to seeding and to the four tests that assert a **trigger's** own words, where a role-run version would hit a grant first and leave the rule unproven — the same reasoning `ladder.test.mjs` uses for `concession_no_delete` |
| G10 | all | `npm run verify` exits 0 — no `MISS`, `IMPRECISE`, `SKIP` | ✅ | raw tail in §7 |
| G11 | all | Each of 18a–18d and 19 gains ≥1 mutation, each caught by **its own named test** | ✅ | 13 new mutations — 4 · 2 · 2 · 2 · 3 — §6 |

Baseline before this package: 9/9 suites, 158 Python tests, 57/57 and 47/47 mutations.
**After: 11/11 suites, 158 Python tests, 70/70 and 47/47 mutations, exit 0.**

---

## 2. Files changed

**New**
- `backend/db/migrations/0010_governance.sql` — required approvers, legal hold, the settings table.
- `backend/db/migrations/0011_negotiation_record.sql` — negotiation, rounds, positions, movements,
  `open_renewal()`.
- `backend/db/test/governance.test.mjs` (39 tests)
- `backend/db/test/negotiation.test.mjs` (21 tests)

**Edited**
- `backend/db/migrations/0006_executed_agreements.sql` — 18c and 18d.
- `backend/db/test/executed.test.mjs` — fixtures updated for the dropped signatory columns;
  15 new tests. **No pre-existing assertion was weakened or removed.**
- `backend/db/test/mutation-check.mjs` — 13 new entries.

Nothing else was touched. `0001`–`0005`, `0007`–`0009`, `engine/**`, `package.json` and every
architecture document are unmodified.

---

## 3. WP-18a · Required approvers

### The one design departure, stated plainly

CLA §4 draws a concession with a mutable `state` moving `proposed → approved | withdrawn`.
**`cw.concession` cannot carry that state**, and the reasons are three deliberate protections built
by WP-06 that would each have to be unpicked:

1. `cw.concession_immutable()` (0003) is an **allow-list** trigger that fires for everyone including
   the owner and permits exactly one column to move;
2. the UPDATE grant is **column-level** on `promoted_to_clause` alone;
3. the **restrictive** policy `promote_once` refuses any UPDATE that does not leave
   `promoted_to_clause` populated — so a state change would be blocked even for `legal_admin`.

The packet said to coordinate with that machinery rather than fight it. So the state lives **beside**
the immutable record, not inside it:

| Table | What it is |
|---|---|
| `cw.concession` | the proposal — what was asked for, frozen |
| `cw.concession_approval` | one append-only row per named approver |
| `cw.concession_settlement` | the moment it came into force, gated |
| `cw.concession_withdrawal` | the other way out |
| `cw.concession_state` (view) | the CLA §4 state, **derived** |
| `cw.concession_in_force` (view) | what the rest of the system should read |

The guarantee is the sentence CLA §4 already uses: *a concession is in force only once approved; a
proposed one is visible and pending, never silently binding.*

**Consequence for the criterion's wording.** "Refused until … approved" is implemented as *cannot be
put in force* rather than *cannot be written down at all*. Writing the proposal down is what a
machine is allowed to do (CLA §7: "Propose … Automatic"); settling it is what it may never do. A
blanket refusal at INSERT would also have broken nine existing fixtures in `ladder.test.mjs` and
`review-queue.test.mjs`, suites this package does not own.

### What is enforced

- Settlement is refused unless the Requester, the assigned attorney (`cw.agreement_attorney`) and
  every `cw.required_approver` for that agreement each has an approval row.
- **Fail-closed on an unconfigured deal**: no assigned attorney ⇒ nothing settles, rather than
  quietly needing one fewer approval.
- An approval must **name the person the configuration names** — otherwise the model is decorative
  and the count still comes out right.
- `cw.concession.proposer_kind` (`human` | `machine`) is added and made immutable by its own
  trigger, because 0003's allow-list names only the columns that existed when it was written.
- Approvals, settlements and withdrawals all **raise** on UPDATE and DELETE (S0-3).

### Residual, disclosed

`cw.promote_concession()` still promotes a concession that is only *proposed*. Gating promotion on
settlement is a one-line change but it would break `ladder.test.mjs`'s promotion fixtures, which
this package does not own, and re-creating `promote_concession()` here would shadow four live
mutation `find` strings in 0003 and silently turn them into MISSes. **Flagged for the sweep, not
done here.**

---

## 4. WP-18b · Legal hold

`cw.legal_hold` implements LIFECYCLE §3.5 exactly: a required `matter_ref`, named opener and
releaser, open-or-released and nothing between, several holds per agreement, and release recorded as
its own audited event. A hold **cannot be deleted** (raises) and cannot be reopened — a new matter is
a new hold.

`cw.agreement_retention` + `cw.retention_destroy()` are the retention path, and the hold check runs
**before** the due-date check so the error a person sees names the real reason.

**Modelled, not delivered end to end:** `retention_destroy()` records and gates the *decision* to
destroy. It does not destroy stored files, because the backend has no storage layer to destroy them
in. What is genuinely delivered is that the decision cannot be taken while a matter is open.

---

## 5. WP-18c / WP-18d

**18c, narrow as instructed.** `0006:56-66` already hashed counterparts and exhibits and is
untouched. Two changes only:
- `cw.signature_certificate` — provider, envelope, completion timestamp, **the certificate bytes**,
  size and SHA-256, with a CHECK that the recorded size matches the bytes.
- `cw.executed_signatory` — name, party, method (`electronic` | `wet_ink`), date signed, title.
  `our_signatory` / `their_signatory` are **dropped**; they were referenced only by 0006 and
  `executed.test.mjs`, both owned here.

Both new tables join the frozen family (UPDATE raises). `cw.execution_evidence_gap` *reports* a
missing certificate or signatory rather than refusing the filing — the product boundary: make the
gap visible, give a named person somewhere to act, never invent the content.

**18d.** `agreement_kind` and `parent_agreement_id` on the executed record, a SOW must name a
**master**, and `cw.sow_conflict` / `cw.orphaned_sow` report contradiction and master-terminated-
over-live-SOW.

**Modelled, not delivered end to end:** multi-agreement **obligation** composition. Obligations do
not exist anywhere in the backend, so a SOW inheriting its master's obligations is the same
composition rule applied to a thing that does not exist. The structure is modelled; no coverage is
claimed.

---

## 6. How `U1` and `U2` are surfaced as open decisions

`cw.governance_setting` holds each open question as a row with `is_owner_decision = true` and
`decided = false`, the shipped behaviour as `value`, and the reasoning as `rationale`. A reader can
ask the database what it has assumed on their behalf; changing the answer is one UPDATE, not a
migration.

| Key | Ships as | Status |
|---|---|---|
| `sow_may_contradict_master` | `false` (stricter) | **U2 — undecided.** Both sides tested: *by default a SOW cannot contradict its master* and *the looser reading is reachable — the owner can relax it* |
| `renewal_default_baseline` | `executed_agreement` | **U1 — undecided.** Only the pre-selection. Both baselines are fully built in `cw.open_renewal()`, both seed real positions, the positions **genuinely differ**, and the choice plus the default in force is written to the audit log |

Neither is stubbed. On U1 the two paths produce different clauses for the same category — asserted
by *the two baselines genuinely differ* — which is what makes the choice worth recording.

---

## 7. Raw verify tail

`npm run verify`, exit code **0**:

```
23 passed, 0 failed      audit-chain.test.mjs
38 passed, 0 failed      executed.test.mjs        (was 23 — 15 new, 0 removed)
39 passed, 0 failed      governance.test.mjs      (new)
51 passed, 0 failed      ladder.test.mjs
16 passed, 0 failed      loader-sql.test.mjs
21 passed, 0 failed      negotiation.test.mjs     (new)
49 passed, 0 failed      registry.test.mjs
43 passed, 0 failed      review-queue.test.mjs
20 passed, 0 failed      roles.test.mjs
26 passed, 0 failed      run-store.test.mjs
15 passed, 0 failed      writer-sql.test.mjs

11/11 suites passed
158 passed in 2.25s                                    (python)
70/70 mutations caught by their named test             (database)
47/47 mutations caught by their named test             (engine)
EXIT=0
```

No `MISS`, no `IMPRECISE`, no `SKIP`.

---

## 8. Mutations added (13)

| Sub-package | Mutation | Named test |
|---|---|---|
| 18a | a concession settles with approvals still outstanding | settling is refused while anybody is still missing |
| 18a | configured Required Approvers are not counted | adding a Required Approver changes the outcome |
| 18a | a deal with no assigned attorney simply needs one fewer approval | a deal with no assigned attorney cannot settle anything |
| 18a | an approval may name anyone at all | an approval must name the person the record names |
| 18b | the retention path does not check for a legal hold | a record under legal hold cannot be destroyed by the retention path |
| 18b | releasing a hold leaves no record | releasing a hold is an audited act |
| 18c | the completion certificate is a reference again, not bytes | the completion certificate is stored as bytes, not as a reference |
| 18c | signatory records are not frozen with the rest of the contract | who signed cannot be rewritten after execution |
| 18d | a statement of work may hang off anything | a statement of work cannot hang off another statement of work |
| 18d | the U2 default ships loose — a SOW may contradict its master | by default a SOW cannot contradict its master |
| 19 | a recorded round can be edited afterwards | a round cannot be updated once recorded |
| 19 | rounds may arrive with gaps in the sequence | rounds arrive in order or not at all |
| 19 | the executed-agreement baseline is not actually built | by default a renewal opens from the executed agreement's positions |

No existing mutation `find` string was destroyed. One trap was hit and fixed: **`0010` and `0011`
were written with CRLF line endings while every other migration is LF**, which made five multi-line
`find` strings report `SKIP`. All three files this package writes are now normalised to LF. Worth
knowing for the next implementer — the harness gives no hint that this is the cause.

---

## 9. Deviations and disclosures

1. **Concession state lives beside the concession, not on it** (§3). Deliberate, to avoid unpicking
   three WP-06 protections; the guarantee is unchanged and CLA §4's own wording is satisfied.
2. **`our_signatory` / `their_signatory` dropped** from `cw.executed_agreement`, and the
   `agreement_executed` audit payload now carries `agreement_kind` / `parent_agreement_id` instead
   of the two names. Individual signatures are audited as `signatory_recorded`. Both files affected
   are owned here.
3. **`cw.executed_*` still uses `do instead nothing` on DELETE**, which S0-3 bans. It is
   pre-existing, `executed.test.mjs` asserts the no-op explicitly, and converting it is **WP-25c's
   declared scope**. Not changed here; the two tables 18c adds follow the existing family pattern so
   WP-25c converts them together rather than finding a split convention.
4. **Audit rows written from inside `security definer` functions carry a null `actor_role`**
   (`retention_destroy`, `open_renewal`), because `current_user` inside a definer function is the
   owner. The acting **person** is still recorded, and the row itself names who chose. Pre-existing
   behaviour of the pattern 0006 already uses; called out so it is not discovered later.
5. **`SECURITY DEFINER` comments were rewritten to be honest.** The first draft claimed the definer
   rights were load-bearing today. Under current grants every role that can settle can also read the
   configuration, so an invoker-rights version would give the same answer. The comments now say that,
   and say the definer is there so a later narrowing of grants cannot turn the gate into a no-op.
6. **`CLAUSE-LIBRARY-ARCHITECTURE.md` §4 now contains a stale line** — "Until it lands, the schema
   records a single `approved_by`." WP-18a has landed. This package is forbidden from touching
   architecture documents, so it is **flagged for the documents sweep**, along with the "Specified,
   not yet enforced" notes in LIFECYCLE §3.1, §3.5 and §3.6, which are all now enforced.
7. **No existing assertion was weakened.** No pre-existing assertion was found to be wrong.

---

## 10. Explicitly: what is modelled but not delivered end to end

| Thing | Modelled | Not delivered |
|---|---|---|
| MSA / SOW | structure, parentage, contradiction detection, orphaned-SOW reporting | **obligation composition** — obligations do not exist in the backend at all |
| Retention | the destruction **decision**, gated by hold and by date, audited | actual destruction of stored bytes — there is no storage layer to destroy them in |
| Signature evidence | certificate bytes, signatory records, gap reporting | no verification of the certificate's contents or signature; the system stores and hashes, it does not validate |
| Negotiation record | rounds, positions, movement history, revival detection, both renewal baselines | **round analysis** (NA §4) and the Clause Library Builder (NA §5) — Phase 4, out of scope |
| Required approvers | the gate on settlement | promotion into the library is **not** yet gated on settlement (§3, residual) |
