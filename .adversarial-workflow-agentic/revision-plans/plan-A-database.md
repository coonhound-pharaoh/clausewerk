# PLAN-A — Database enforcement, permissions, tamper-evidence, immutability

- **assignment_id:** PLAN-A · **stage:** Independent Revision Plan (divergent diagnosis)
- **contract:** OC-CW-2026-07-25-01
- **slice:** D1–D7 (Proposal Phase 1, items 1–6) and D8/D9 (Proposal Phase 2, item 4)
- **date:** 2026-07-25

---

## Summary

All nine findings in my slice are **real and reproducible**. I reproduced D1, D4, D5, D6, D7, D8
and D9 directly against the migrated schema in PGlite, and reproduced the *truncation* half of D2.
Nothing in my slice is already fixed, and nothing is a false alarm.

Three things matter more than the review said:

1. **The hash chain is not just concurrency-unsafe — it is not a stable commitment at all.**
   `cw.audit_verify()` returns "tampered at seq 1" on a completely untampered database as soon as
   the verifying session's `TimeZone` or `DateStyle` differs from the writing session's, because
   the hash is computed over `new.ts::text`, whose rendering is a session setting. The chain also
   uses `|`-joined concatenation, which I proved is field-shift ambiguous. This is a bigger defect
   than the fork, and the review does not mention it. Any tamper-evidence claim in the product is
   currently unsupported.
2. **The review's stated root cause is wrong in a way that matters.** It says "the tests run as
   the database owner in a single session." In fact all five suites *do* use `set role` — but only
   on **read** paths (RLS visibility). Every **write/mutation** path — promotion, retirement,
   supersession, execution, concession insert — runs as owner. The correct rule for the fix is
   narrower and sharper: *every governed write must be exercised as the role that is supposed to
   perform it.*
3. **D1 is worse than described, and my reproduction shows the exact mechanism.** As a real
   `cw_legal_admin`, `promote_concession()` returns `DP-S-080@v1`, `promoted_to_clause` stays
   `null`, and a second call **succeeds**, minting a second approved clause version from the same
   quarantined vendor text. Two approved clause versions from one concession, function reporting
   success both times.

**PGlite verdict: fully capable.** `CREATE ROLE`, `SET ROLE`, row-level security (enforced for
non-owners, bypassed by the owner), advisory locks (session and transaction), `SERIALIZABLE`,
`sha256()`, `gen_random_uuid()` and `NULLS NOT DISTINCT` unique indexes all work. The only gaps
are `pgcrypto` (unavailable, and not needed) and **true concurrency** — PGlite is a single
in-process connection, so the D2 *fork* cannot be produced by racing two writers and must be
tested structurally instead.

---

## Verification of review findings

| Finding | Review's claim | What I actually found | Tag | Evidence |
|---|---|---|---|---|
| **D1** | `promote_concession()` UPDATE has no policy; silently no-ops as real `legal_admin`; double-promote guard defeated | **Confirmed, and worse.** `cw.concession` has RLS on with only `read_scoped` (SELECT) and `write_scoped` (INSERT) policies — no UPDATE policy at all. As real `cw_legal_admin`: first promote returns `DP-S-080@v1`, `promoted_to_clause` = `null`; second promote **succeeds**, returning `DP-S-081@v1`; `count(*) where provenance='promoted'` = **2**. The `security invoker` marker at 0003:187 is what exposes it. | Observed | `backend/db/migrations/0003_ladders_and_concessions.sql:220-221` (the UPDATE), `:301-305` (policies), `:187`; probe §D1-clean |
| **D2 (fork)** | Chain head read without a lock; two writers fork | **Confirmed by inspection; not reproducible in PGlite.** `select hash into prev from cw.audit_event order by seq desc limit 1;` takes no lock and no `FOR UPDATE`; two concurrent `READ COMMITTED` inserters both see the same head. PGlite has one connection, so I could not race it. | Inferred (mechanism Observed; race Unresolved in PGlite) | `0001_foundation.sql:76` |
| **D2 (truncation)** | Deleting the newest entries is undetectable | **Confirmed.** Deleted `seq >= 3` from a 4-row chain; `cw.audit_verify()` returned `null` (clean). Deleting an *interior* row (`seq=1`) is caught (returns `2`). Only the tail is invisible. | Observed | probe3: `verify before=null, after truncating tail=null, rows left=2`; `0001:90-104` |
| **D2 (scheme unspecified)** | The hash scheme is undocumented | **Confirmed, plus two defects the review missed.** (a) The hash is over `new.ts::text` — a session-dependent rendering. Verifying the *same untampered rows* under `TimeZone='America/New_York'` returns `1` (tampered), and under `DateStyle='SQL, DMY'` returns `1`. (b) Field joining is `\|`-concatenation, which I proved collides under field shift. Also the hash omits `seq` and `actor_role`, so `actor_role` can be rewritten without breaking the chain. | Observed | probe4 output; `0001:78-81`, `:96-99` |
| **D3** | Identity self-asserted via session GUCs; spoofable; pooling-hostile | **Confirmed and demonstrated.** As real `cw_viewer` I set `cw.role='legal_admin'` and `cw.actor='ceo@clausewerk'`; `cw.app_role()` returned `legal_admin`, and with a stray SELECT grant the viewer read a concession row the policy is supposed to hide. Additional finding: **RLS is not enabled on `cw.audit_event` at all** (`relrowsecurity=false`), so any `cw_requester` reads every buyer's concession payloads. | Observed | `0001:39-47`; probe2 D3 rows; probe3 `relrowsecurity=false` |
| **D4 (reviewer)** | `reviewer` rewritable on approved clauses | **Confirmed.** `update cw.clause_version set reviewer='SOMEONE ELSE'` succeeded. The immutability trigger's field list omits `reviewer`, `retired`, `retired_reason` and `retired_on`. | Observed | `0002_clause_registry.sql:70-78`; probe1 |
| **D4 (un-retire)** | Un-retiring is unaudited | **Confirmed.** Retire → 1 `clause_retired` event. Un-retire → row flips back to `retired=false`, event count unchanged. The hook is `elsif new.retired and not old.retired`. | Observed | `0002:191-194`; probe1 |
| **D4 (effective_on)** | Conflict-rule `effective_on` movable retroactively | **Confirmed by inspection.** `cw.conflict_rule_immutable()` guards `rule_id, version, predicate, severity, title, detail, approved_by` — it does **not** guard `effective_on`, `name`, `approved_on`, or un-retirement. `cw.active_conflict_rule` filters on `effective_on <= current_date`, so moving that date rewrites which rules were in force. | Observed | `0004_conflict_rules.sql:85-92`, `:107-113` |
| **D5 (floor)** | Floor lookup ignores severity and ordering | **Confirmed and demonstrated.** With category `data` holding a High ladder (floor at rung 0) and a Standard ladder (floor at rung 2), the trigger's exact query returns **rung 0** with `limit 1` and no `order by` — arbitrary and here the *wrong* ladder for a Standard concession. | Observed | `0003:140-144`; probe2 `floors present=[{10,High,0},{11,Standard,2}] ; trigger picks rung=0` |
| **D5 (no ladder_id)** | Concessions don't record ladder/rung provenance | **Confirmed.** `cw.concession` columns are `concession_id, agreement_id, category_key, standard_clause_id, standard_version, conceded_rung, vendor_text, override_ref, reason, approved_by, conceded_on, promoted_to_clause, created_at` — no `ladder_id`, no `ladder_severity`, no floor-at-time-of-concession. | Observed | probe2 column list; `0003:107-127` |
| **D5 (rungs editable)** | Published rungs are editable | **Confirmed.** `cw_legal_admin` holds `UPDATE` and `DELETE` on `cw.ladder_rung`, there is no immutability trigger, and the `admin_writes` policy is `for all`. | Observed | `0003:309`, `:268-269`; probe2 grant list |
| **D6** | Concessions spec'd immutable but aren't; protected only by D1 | **Confirmed.** `update cw.concession set vendor_text='REWRITTEN', approved_by='nobody'` succeeded as owner. No immutability trigger, no update audit hook, and a **full-row** `grant update` at 0003:318 whose comment claims it is "promote_concession() only". Spec: CLA "Immutable once written; corrections are new records." | Observed | `0003:318`; `CLAUSE-LIBRARY-ARCHITECTURE.md:274`; probe1 D6 |
| **D7** | Agreement status can never change; nothing ties status to execution | **Confirmed.** `cw.agreement` has only `read_own` (SELECT) and `requester_writes` (INSERT) policies and no `UPDATE` grant to any `cw_*` role. No trigger sets `status='executed'` when `cw.executed_agreement` is inserted. Additional: `LIFECYCLE-ARCHITECTURE.md:296` specifies a five-state machine (`executing → active → terminating → wound_down → closed`) that the three-state column cannot express. | Observed | `0003:14-23`, `:271-275`, `:312-313`; probe2 policy list |
| **D8 (id prefix)** | Clause-ID prefix vs category short-code unenforced | **Confirmed.** No constraint links `clause.clause_id[1:2]` to `category.short`. `promote_concession()` inserts `cw.clause` with a caller-supplied `p_new_clause_id` and a **hard-coded** `'Standard'` severity, so a promoted High-category clause is silently mislabelled. | Observed | `0002:24`, `0003:206-208` |
| **D8 (rung severity)** | Rung severity vs ladder severity unenforced; test data violates it | **Confirmed, and there is a second violation the review missed.** `ladder.test.mjs:105-109` builds ladder 4 with `severity='Standard'` whose three rungs (`DP-H-014/070/061`) are all `High`. `ladder.test.mjs:120-122` builds ladder 5 with `category_key='liab'` whose rungs are `data`-category clauses — **rung category vs ladder category is also unenforced**, which the review did not name. | Observed | `backend/db/test/ladder.test.mjs:105-109`, `:120-122` |
| **D8 (run-store CHECKs)** | Run-store rows lack CHECK constraints | **Confirmed.** `cw.run_decision` carries exactly one CHECK (`selection_is_whole`); `severity` and `category` are unconstrained free text, unlike `cw.run_finding.severity` and `cw.clause.severity`. | Observed | probe2/3 constraint dumps; `0005_run_store.sql:99-100` |
| **D9 (indexes)** | Missing indexes on common lookups | **Confirmed.** `cw.concession` has only its PK — no index on `agreement_id`, `category_key` or `standard_clause_id` despite the RLS policy and `concession_rate` view keying on them. `cw.audit_event` has only its PK — no index on `event_type`, `subject` or `ts`, and every test and hook queries by `event_type`. `cw.clause_tag` has an index on `tag` but none on `(clause_id, version)` beyond the PK prefix (PK prefix covers it). | Observed | probe3 `pg_indexes` dumps |
| **D9 (TRUNCATE)** | TRUNCATE uncovered by the immutability story | **Confirmed, with a mitigating fact.** `truncate cw.clause_tag` succeeded as owner — `DELETE` rules and `BEFORE UPDATE` triggers do not fire for TRUNCATE. However **no `cw_*` role holds TRUNCATE**; only the owner does. So this is a documentation-and-owner-discipline gap, not an exploitable application-role hole. The review over-states its severity slightly; I agree with LOW. | Observed | probe1 TRUNCATE; probe3 privilege query returned `[]` |
| **D9 (silent DELETE)** | Silent no-op DELETE hides application bugs | **Confirmed.** `delete from cw.clause_version where clause_id='DP-H-014'` returned `affectedRows=0`, row count unchanged, no error. The `do instead nothing` rule at `0002:91-92` makes an application bug indistinguishable from success. | Observed | probe1 |

---

## PGlite capability probe results

**Environment:** `@electric-sql/pglite@0.5.4`, reporting `server_version = 18.3`, connected as
`postgres` with `usesuper = true`.

### Script

Three probe scripts were run from `backend/` (so the workspace `@electric-sql/pglite` resolves),
each creating a fresh `PGlite.create()` and applying all six migrations in filename order. The
scripts were removed after the run; they are reproduced here in condensed form.

```js
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const MIG = 'backend/db/migrations';
const db = await PGlite.create();
for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIG, f), 'utf8'));

// capability
await db.query(`show server_version`);
await db.query(`select current_user, usesuper from pg_user where usename=current_user`);
await db.exec(`set role cw_viewer;`);                       // → current_user = cw_viewer
await db.query(`select pg_advisory_lock(42), pg_advisory_unlock(42)`);
await db.exec(`begin;`); await db.query(`select pg_advisory_xact_lock(42)`); await db.exec(`commit;`);
await db.query(`select encode(sha256('x'::bytea),'hex')`);
await db.exec(`create extension if not exists pgcrypto;`);   // → not available
await db.exec(`begin isolation level serializable;`);        // → serializable
await db.exec(`create unique index audit_no_fork on cw.audit_event (prev_hash) nulls not distinct;`);

// D1 reproduction, as the REAL role
await db.exec(`set role cw_legal_admin;`);
await db.query(`select cw.promote_concession(1,'DP-S-080','a','b','c','2028-01-01')`);
await db.query(`select promoted_to_clause from cw.concession where concession_id=1`);
await db.query(`select cw.promote_concession(1,'DP-S-081','a','b','c','2028-01-01')`);
await db.query(`select count(*) from cw.clause_version where provenance='promoted'`);

// D2 timestamp-rendering sensitivity
await db.query(`select cw.audit_verify()`);                  // → null
await db.exec(`set timezone='America/New_York';`);
await db.query(`select cw.audit_verify()`);                  // → 1
await db.exec(`set timezone='UTC'; set datestyle='SQL, DMY';`);
await db.query(`select cw.audit_verify()`);                  // → 1
```

### Raw output

```
[INFO] pglite version 0.5.4
[PASS] server_version :: 18.3
[PASS] current_user / superuser :: {"current_user":"postgres","usesuper":true}
[PASS] roles exist :: ["cw_auditor","cw_legal_admin","cw_legal_reviewer","cw_requester","cw_viewer"]
[PASS] SET ROLE works :: cw_viewer
[PASS] advisory lock (session) :: {"ok":false,"released":true}
[PASS] advisory lock (xact) :: {"ok":false}
[PASS] sha256 builtin :: 2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881
[FAIL] pgcrypto available :: extension "pgcrypto" is not available
[PASS] gen_random_uuid :: ca2a2736-877b-45ed-b818-77cb0603c98f
[PASS] serializable isolation :: serializable
[PASS] RLS enforced for non-owner role (viewer sees 0 concessions) :: n=0 (0 means RLS is enforced)
[PASS] RLS bypassed for owner (owner sees the row) :: n=1 (1 means owner bypasses RLS)
[PASS] D1: promote as OWNER with cw.role=legal_admin :: returned=DP-S-080@v1 promoted_to_clause=DP-S-080@v1
[PASS] D1 clean: first promote as real cw_legal_admin :: first=DP-S-080@v1 promoted_to_clause=null
       | SECOND PROMOTE SUCCEEDED: DP-S-081@v1 | promoted clause_versions=2
[PASS] D4: reviewer rewritable on an approved clause version :: reviewer=SOMEONE ELSE
[PASS] D4: un-retire is silent :: retire events=1, retired now=false, total retire-ish events=1
[PASS] D5: floor lookup ignores severity :: floors present=[{"ladder_id":10,"severity":"High","rung":0},
       {"ladder_id":11,"severity":"Standard","rung":2}] ; trigger picks rung=[{"rung":0}]
[PASS] D6: concession row rewritable by owner :: {"vendor_text":"REWRITTEN","approved_by":"nobody"}
[PASS] D7: agreement status update path :: owner UPDATE succeeded: executed | non-owner grants: SELECT/INSERT only
[PASS] D9: DELETE on audit_event as owner :: delete ran before=8 after=7 verify={"v":2}
[PASS] D9: TRUNCATE on an "immutable" table :: TRUNCATE succeeded
[PASS] D9: silent no-op DELETE on clause_version :: affectedRows=0 rows 5->5

[PASS] NULLS NOT DISTINCT unique index :: created
[PASS] single-row chain-head table + FOR UPDATE lock :: works
[PASS] pg_advisory_xact_lock inside a plpgsql trigger :: created; callable from plpgsql
[PASS] clause-ID-prefix trigger (D8) :: mismatched prefix rejected: clause id XX-H-001 does not match
       category short code DP
[PASS] D3: any role can set cw.role at will :: as cw_viewer, app_role()=legal_admin app_actor()=ceo@clausewerk
[PASS] D3: spoofed GUC gets past a policy :: viewer role + spoofed cw.role=legal_admin sees 1 concession row
[PASS] D3: set_config(...,true) is transaction-local :: inside tx=requester, after commit=legal_admin
[PASS] D5: concession columns :: [...no ladder_id, no ladder_severity...]
[PASS] D7: agreement policies :: [{"polname":"read_own","polcmd":"r"},{"polname":"requester_writes","polcmd":"a"}]

[PASS] D2 truncation :: verify before=null, after truncating tail=null (UNDETECTED), rows left=2
[PASS] D2 fork: unique index on prev_hash :: fork rejected by index: duplicate key value violates
       unique constraint "audit_no_fork"
[PASS] D3/audit: relrowsecurity=false on cw.audit_event (every granted role reads the whole log)
[PASS] D3/audit: requester sees 2 audit rows (unscoped)
[PASS] D8: run_decision CHECKs = ["selection_is_whole"]
[PASS] D9: audit_event indexes = [pkey only]
[PASS] D9: concession indexes = [pkey only]
[PASS] D9: non-owner TRUNCATE grants: [] (only the owner can truncate)

verify @ default TimeZone (Etc/GMT+6): [{"v":null}]
verify @ America/New_York:            [{"v":1}]      ← FALSE TAMPER ALARM
verify @ datestyle 'SQL, DMY':        [{"v":1}]      ← FALSE TAMPER ALARM
separator ambiguity, sha256('|a|b'||'|') = sha256('|a'||'|b|'): [{"collides":true}]
```

### Verdict

| Capability | Available in PGlite 0.5.4? | Consequence for the plan |
|---|---|---|
| `CREATE ROLE` | **Yes** — all five `cw_*` roles exist | Role-based tests are viable |
| `SET ROLE` | **Yes** | Every write path can and must be tested as its real role |
| Row-level security | **Yes**, enforced for non-owners | D1/D3/D6/D7 remedies are testable |
| Owner bypasses RLS | **Yes** (`postgres`, `usesuper=true`) | This is the exact blind spot; `set role` is mandatory in the new tests |
| Advisory locks (session + xact), callable from plpgsql | **Yes** | D2 serialisation remedy is implementable |
| `SERIALIZABLE` isolation | **Yes** | Alternative D2 remedy available |
| `sha256()` builtin | **Yes** | No dependency needed |
| `pgcrypto` | **No** ("extension is not available") | Do **not** propose HMAC/signed checkpoints via pgcrypto; `sha256()` + an out-of-band key is the only route, and a *signed* anchor is therefore **out of scope for Phase 1** |
| `NULLS NOT DISTINCT` unique index | **Yes** | Structural fork prevention is implementable and proven |
| `SECURITY DEFINER` functions | **Yes** (`cw.owns_agreement` already works) | D1 and D3 remedies both viable |
| **True concurrency (2+ connections)** | **No** — single in-process connection | The D2 *fork* cannot be raced. Test it structurally (see D2 remedy) and disclose the limit |

---

## Remedies

Throughout: **migration files are still free to edit in place** (OC §5 constraint 10 — no
production data). Prefer editing the migration that owns the object over stacking a `0007_fixups`
migration; a reader of `0003` must see the truth. The one exception is genuinely new structure
(the chain head, the checkpoint table), which belongs in a new migration.

### D1 — `promote_concession()` no-ops under real permissions

**Root cause.** `cw.concession` has RLS enabled (`0003:262`) with policies covering only SELECT
(`read_scoped`, `0003:301-303`) and INSERT (`write_scoped`, `0003:304-305`). RLS default-denies
any command with no matching policy, so the function's terminal
`update cw.concession set promoted_to_clause = ...` (`0003:220-221`) matches zero rows. Because
the function is `security invoker` (`0003:187`), it runs under the caller's RLS. The `grant update`
at `0003:318` is therefore doubly wrong: it is a full-row grant that does nothing.

**Remedy — file `backend/db/migrations/0003_ladders_and_concessions.sql`.**
Make the function the sole writer instead of patching the policy. Add a narrow UPDATE policy would
also re-open D6, so:

1. Redeclare `cw.promote_concession(...)` as `security definer set search_path = cw, pg_temp`,
   keeping the existing explicit `cw.app_role() = 'legal_admin'` check at `0003:190-193` as the
   authorisation gate (it must stay — `security definer` removes the RLS gate, so the explicit
   check becomes the only one).
2. `revoke all on function cw.promote_concession(...) from public;` then
   `grant execute` to `cw_legal_admin` only.
3. **Delete** `grant update on cw.concession to cw_legal_admin;` (`0003:318`) — with a definer
   function nobody needs it, and removing it is half of the D6 fix.
4. Make the double-promote guard structural as well as procedural: add
   `constraint promoted_once unique (concession_id, promoted_to_clause)` is useless (PK already
   unique); instead add a **partial unique index** on the *derived* clause, e.g.
   `create unique index concession_promoted_once on cw.concession (concession_id) where promoted_to_clause is not null;`
   is likewise a no-op. The right structural guard is on the target side:
   `create unique index clause_version_one_per_concession on cw.clause_version ((citations[1])) where provenance = 'promoted';`
   — this makes "two approved versions derived from concession N" impossible even if the
   procedural guard is bypassed. **Prefer** the cleaner shape: add
   `cw.clause_version.derived_from_concession bigint references cw.concession(concession_id)` with
   `create unique index on cw.clause_version (derived_from_concession) where derived_from_concession is not null;`
   and have `promote_concession()` populate it. This also removes the `Policy-DERIVED-<id>`
   citation string-hack at `0003:217`.

**Test that must exist** — new `backend/db/test/promotion-role.test.mjs`, or a new section in
`ladder.test.mjs` after line 217:

- `set role cw_legal_admin;` then promote a vendor-text concession → assert the returned ref
  **and** assert `promoted_to_clause` is non-null when read back **as the same role**.
- Immediately promote the same concession again **as the same role** → must raise
  `already promoted`.
- Assert `select count(*) from cw.clause_version where provenance='promoted'` = 1.
- `set role cw_requester;` → promote must raise `only legal_admin`.
- `set role cw_legal_reviewer;` → promote must raise `only legal_admin` (currently untested; the
  reviewer is the role most likely to be wrongly granted this).
- The existing `legal_admin can promote` test at `ladder.test.mjs:199-210` runs as owner. **Do not
  delete it** (OC §5 constraint 7) — add `set role cw_legal_admin` to it, which strictly
  strengthens it, and disclose the change.

**Mutation-check entries** (`db/test/mutation-check.mjs`, `suite: 'ladder.test.mjs'`):

| Mutation | find → repl | expect |
|---|---|---|
| `promote_concession is security invoker again` | `security definer set search_path = cw, pg_temp` → `security invoker` | `the same concession cannot be promoted twice` |
| `promote may be executed by any role` | the `grant execute ... to cw_legal_admin` line → `grant execute ... to public` | `a legal reviewer cannot promote` |
| `the derived-clause uniqueness index is dropped` | the `create unique index ... derived_from_concession` line → `select 1;` | `the same concession cannot be promoted twice` |

---

### D2 — Hash chain: forking, truncation, and an unstable commitment

**Root causes, three of them.**

1. **No serialisation.** `0001:76` reads the head with a bare
   `select hash into prev from cw.audit_event order by seq desc limit 1;` — no `FOR UPDATE`, no
   advisory lock. Under `READ COMMITTED`, two concurrent inserters read the same head and both
   commit, producing two rows with the same `prev_hash`. `cw.audit_verify()` then walks by `seq`,
   finds the second row's `prev_hash` ≠ the first row's `hash`, and reports tampering at that
   `seq` — a false accusation against an honest database. *(Inferred: mechanism read from source;
   not raced, because PGlite has one connection.)*
2. **No anchored tail.** `cw.audit_verify()` (`0001:90-104`) walks whatever rows exist. It never
   checks how many there should be. **Observed:** deleting `seq >= 3` from a 4-row chain leaves
   `audit_verify()` returning `null`.
3. **The commitment itself is unstable and ambiguous.** **Observed:** the pre-image includes
   `new.ts::text` (`0001:79`), whose rendering depends on the session `TimeZone` and `DateStyle`.
   The same untampered rows verify clean under `Etc/GMT+6` and report *tampered at seq 1* under
   `America/New_York` or `DateStyle='SQL, DMY'`. Separately, `|`-joined concatenation is
   field-shift ambiguous (proved: `sha256('|a|b'||'|') = sha256('|a'||'|b|')`), and the pre-image
   omits `seq` and `actor_role`, so `actor_role` can be silently rewritten.

**Remedy — a new migration `backend/db/migrations/0007_audit_chain.sql`,** which replaces
`cw.audit_chain()` and `cw.audit_verify()` and adds two objects. Full scheme specification is in
the next section; the DDL shape is:

- `create table cw.audit_head (only_one boolean primary key default true check (only_one), head_hash text, height bigint not null default 0);` seeded with one row. *(Verified constructible in PGlite.)*
- `create table cw.audit_checkpoint (checkpoint_seq bigserial primary key, at_height bigint not null unique, head_hash text not null, taken_at timestamptz not null default now(), taken_by text not null);` with `revoke all` + `grant insert, select` to `cw_legal_admin`, `cw_auditor` and no UPDATE/DELETE to anyone.
- `create unique index audit_no_fork on cw.audit_event (prev_hash) nulls not distinct;` — **verified in PGlite: a second child of the same head is rejected with `duplicate key value violates unique constraint "audit_no_fork"`.** This is the structural fork guard and is what makes D2's fork *testable without concurrency*.
- Replace the trigger body: take `pg_advisory_xact_lock(hashtext('cw.audit_event'))` **first** *(verified callable from plpgsql)*, then `select head_hash, height from cw.audit_head for update`, compute the hash from the canonical pre-image, `update cw.audit_head set head_hash = new.hash, height = height + 1`.
- Replace `cw.audit_verify()` to return a row `(ok boolean, first_bad_seq bigint, reason text)` and to check height and checkpoints, not just links.

**Tests that must exist** — new `backend/db/test/audit-chain.test.mjs`:

- *Fork is structurally impossible.* Disable the chain trigger, insert two rows sharing one
  `prev_hash`, assert the unique index rejects the second. (This is the honest substitute for a
  race PGlite cannot run — and it tests the actual protection.)
- *Tail truncation is detected.* Write N events, take a checkpoint, delete the last two rows as
  owner, assert `audit_verify()` reports `ok=false` with reason `height` or `checkpoint`.
- *Interior tamper is still detected.* Existing behaviour; keep.
- *Verification is session-independent.* Verify clean; `set timezone='America/New_York'`; verify
  again; **must still be clean.** Repeat for `set datestyle='SQL, DMY'`. This is the test that
  would have caught the largest defect in my slice, and none exists today.
- *Field-shift ambiguity is closed.* Two events whose `(event_type, subject)` pairs are shifted
  across the separator (`('a|b','c')` vs `('a','b|c')`) must produce different hashes.
- *`actor_role` is covered.* Rewrite `actor_role` on a past row as owner; `audit_verify()` must
  report tampering.
- *The head table cannot be edited by an application role.* `set role cw_legal_admin;` then
  `update cw.audit_head` → permission denied.

**Mutation-check entries** (new `suite: 'audit-chain.test.mjs'`):

| Mutation | find → repl | expect |
|---|---|---|
| `chain append is not serialised` | `perform pg_advisory_xact_lock(...)` → `perform 1;` | *(documented as a MISS-tolerant entry — see Risks; prefer the next row)* |
| `fork guard removed` | the `create unique index audit_no_fork ...` line → `select 1;` | `two events cannot share one predecessor` |
| `height is not checked` | the height comparison in `audit_verify` → `and true` | `deleting the newest events is detected` |
| `checkpoints are not consulted` | the checkpoint join in `audit_verify` → `where false` | `deleting the newest events is detected` |
| `timestamp is hashed as rendered text` | the canonical epoch-microseconds expression → `new.ts::text` | `verification does not depend on session TimeZone` |
| `separator is unescaped concatenation` | the length-prefixed encoder → `||'\|'||` joining | `field-shift cannot produce the same hash` |
| `actor_role is not hashed` | the `actor_role` term in the pre-image → `''` | `rewriting actor_role is detected` |

---

### D3 — Self-asserted identity

**Root cause.** `cw.app_role()` (`0001:39-42`) and `cw.app_actor()` (`0001:44-47`) read
`current_setting('cw.role')` / `('cw.actor')`, which are unprivileged, client-settable session
GUCs. **Observed:** as real `cw_viewer` I set `cw.role='legal_admin'` and read a concession row
that `read_scoped` is written to hide. Every policy in every migration keys off these functions.

**Short-term mitigation (achievable today, in this codebase):**

1. **Bind the claim to the connection role.** Change `cw.app_role()` so that the GUC can only
   *narrow*, never *widen*: return the GUC only if it is consistent with `current_user`
   (`cw_legal_admin` → may claim `legal_admin` or anything weaker; `cw_viewer` → may only claim
   `viewer`), and return `null` otherwise. This is a pure-SQL change to one function in
   `0001_foundation.sql:39-42` and it closes the demonstrated escalation immediately, without a
   JWT, without Supabase, and without a new dependency. **This is the single highest
   value-per-line change in D3 and I recommend it over the proposal's "document it loudly."**
2. **Make the GUC transaction-scoped.** `set_config(..., true)` is transaction-local
   *(verified: value resets at commit)*. Convert the tests and document the requirement so a
   pooled connection cannot leak identity between clients.
3. **Enable RLS on `cw.audit_event`** *(new — the review missed this)* and scope reads: auditor
   and legal see all; a requester sees only events whose `subject` belongs to an agreement they
   own; a viewer sees none (already denied by grant, but defence in depth). **Observed:**
   `relrowsecurity=false` today and `cw_requester` reads the entire log including every rival
   buyer's concession payloads.
4. **Document loudly** — `docs/decisions/ADR-0008-*.md` and `backend/README.md` — that the GUC
   scheme requires a trusted connection layer and is incompatible with transaction-mode pooling.

**Real fix (not achievable in this codebase today — no auth layer exists):** derive role and actor
from the authenticated connection via a `security definer` accessor over JWT claims
(`current_setting('request.jwt.claims')` under Supabase/PostgREST). This needs a deployment target
that does not yet exist. **Recommendation: implement mitigations 1–3 now, and record the real fix
as an explicit deferral with its trigger condition (first authenticated deployment).**

**Tests:** as `cw_viewer`, set `cw.role='legal_admin'` → `cw.app_role()` must be `null` (or
`'viewer'`), and the concession read must return 0 rows; as `cw_legal_admin` claiming `viewer`,
the narrowing must be honoured. As `cw_requester`, `select count(*) from cw.audit_event` must not
include another buyer's `concession_recorded` events.

**Mutation:** revert `cw.app_role()` to the bare `current_setting` form → expect
`a viewer cannot escalate by asserting a role`.

---

### D4 — Immutability holes

**Root cause.** `cw.clause_version_immutable()` (`0002:70-78`) enumerates protected columns and
omits `reviewer`, `retired`, `retired_reason`, `retired_on`. `cw.audit_clause_version()`
(`0002:191-194`) fires only on `new.retired and not old.retired`.
`cw.conflict_rule_immutable()` (`0004:85-92`) omits `effective_on`, `name`, `approved_on`, and
un-retirement. **Observed** for reviewer and un-retire; **Observed by inspection** for
`effective_on`.

**Remedy — files `0002_clause_registry.sql` and `0004_conflict_rules.sql`.**

- Invert the trigger's logic: instead of enumerating what is protected, enumerate what is
  *permitted to change* (`retired`, `retired_reason`, `retired_on` on `clause_version`;
  `retired`, `retired_reason` on `conflict_rule`) and reject everything else. An enumerate-the-
  allowed list cannot silently miss a column added later; the current shape already has.
- Forbid `retired = true → false` outright in both triggers ("un-retiring is a new version, not
  an edit"), and require `retired_on` to be set when `retired` flips true.
- Audit **both** directions: `elsif new.retired is distinct from old.retired then` emit
  `clause_retired` or `clause_unretired` accordingly (the un-retire branch only survives if the
  owner decides un-retiring should be legal at all; my recommendation is to forbid it, in which
  case the audit branch is unreachable and should not be written).

**Tests** (`registry.test.mjs`, after the existing immutability block): as
`set role cw_legal_admin`, each of `update ... set reviewer=`, `set approved_on=`,
`set retired=false`, `set effective_on=` must raise; retiring must produce exactly one
`clause_retired` event with `retired_on` set.

**Mutations:** remove `reviewer` from the permitted-change list check → expect
`the named reviewer cannot be rewritten`; remove the un-retire guard → expect
`a retired clause cannot be un-retired`; remove `effective_on` from the conflict-rule guard →
expect `a rule's effective date cannot be moved`.

---

### D5 — The floor is not absolute

**Root cause.** `cw.concession_requires_authority()` (`0003:140-144`):

```sql
select r.rung into floor_rung
from cw.ladder l join cw.ladder_rung r using (ladder_id)
where l.category_key = new.category_key and r.is_floor
limit 1;
```

No `severity` predicate, no `order by`, and `limit 1` over a set that can legitimately have two
rows (one ladder per `(category_key, severity)` by the unique constraint at `0003:34`).
**Observed:** with a High ladder (floor rung 0) and a Standard ladder (floor rung 2) on the same
category, this returns rung 0. The concession row carries no severity at all, so the trigger
*cannot* pick correctly even with an `order by` — the missing input is the real defect.

**Remedy — file `0003_ladders_and_concessions.sql`.**

1. Add `severity text not null check (severity in ('Standard','High'))` to `cw.concession`
   (`0003:107-127`) — the concession must state which position it descended from.
2. Add `ladder_id bigint references cw.ladder(ladder_id)` and `floor_rung_at_concession int` to
   `cw.concession`, populated by the trigger, so the historical floor survives later ladder edits.
3. Rewrite the lookup to `where l.category_key = new.category_key and l.severity = new.severity
   and r.is_floor` and **fail loudly** when no ladder exists: today `floor_rung is null` silently
   permits any rung. Replace with an explicit raise — "no approved ladder for
   (category, severity); a concession cannot be authorised against a ladder that does not exist."
4. Make published rungs immutable: add `cw.ladder_rung_immutable()` (`BEFORE UPDATE`) permitting
   nothing, and a `do instead nothing` DELETE rule guarded by an `is_published` flag, or — simpler
   and more honest — version the ladder. **Minimum viable for Phase 1:** revoke `UPDATE` on
   `cw.ladder_rung` from `cw_legal_admin` (`0003:309`) and add an immutability trigger, keeping
   `DELETE` only for unpublished ladders. Flag the ladder-versioning question as an owner
   decision rather than inventing one.
5. Coherence, shared with D8: a rung's clause must match the ladder's `category_key` **and**
   `severity`. Enforce with a trigger (a CHECK cannot reach `cw.clause`). *Note: this will break
   `ladder.test.mjs:105-109` and `:120-122` — see D8.*

**Tests** (`ladder.test.mjs`): build both a High and a Standard ladder on one category with
different floors; assert a High concession below the **High** floor is refused without an
override and a Standard concession below the **Standard** floor is refused, each naming its own
floor; assert a concession in a category with no ladder for its severity raises; assert
`ladder_id` and `floor_rung_at_concession` are recorded; assert `update cw.ladder_rung` raises.

**Mutations:** drop `and l.severity = new.severity` → expect
`a High concession is judged against the High floor`; restore the silent
`floor_rung is null` permit → expect `a concession with no ladder is refused`; drop the rung
immutability trigger → expect `a published rung cannot be edited`.

---

### D6 — Concessions are not immutable

**Root cause.** No `BEFORE UPDATE` trigger on `cw.concession`, no update audit hook, and a
full-row `grant update on cw.concession to cw_legal_admin` (`0003:318`) whose inline comment
claims "promote_concession() only" — a claim nothing enforces. **Observed:** owner rewrote
`vendor_text` and `approved_by` freely. The review is right that today it is protected only by
accident, via the missing UPDATE policy (D1). **Fixing D1 by adding an UPDATE policy would open
this hole for real — which is exactly why the D1 remedy above uses `security definer` instead.**

**Remedy — file `0003_ladders_and_concessions.sql`.** Add
`cw.concession_immutable()` (`BEFORE UPDATE`) permitting **only** `promoted_to_clause` to move
from `null` to non-null, and rejecting every other change; add
`create rule concession_no_delete as on delete to cw.concession do instead nothing` — subject to
the D9 decision below on silent DELETEs; remove the `grant update` at `0003:318`.

**Tests:** as `cw_legal_admin`, `update cw.concession set vendor_text=...` raises; as owner it
also raises (the trigger runs for the owner too — this is why a trigger, not a policy, is the
right instrument here); the promote path still succeeds.

**Mutation:** neuter the trigger body to `return new;` → expect
`a recorded concession cannot be rewritten`.

---

### D7 — Agreement status is a dead field

**Root cause.** `cw.agreement.status` (`0003:20-21`) has three states; the only policies are
`read_own` (SELECT) and `requester_writes` (INSERT) (`0003:271-275`), and no `cw_*` role holds
`UPDATE` (`0003:312-313`). Nothing links `cw.executed_agreement` insertion to the parent
agreement's status. **Observed** in the policy and grant dumps.

There is also a spec divergence the review did not name: `LIFECYCLE-ARCHITECTURE.md:296`
specifies `executing → active → terminating → wound_down → closed`, five states, none of which
are the three in the column.

**Remedy — file `0003_ladders_and_concessions.sql` (+ `0006_executed_agreements.sql`).**

1. Reconcile the state set with the lifecycle spec. **This is an owner decision, not mine** —
   surface it. Minimum honest Phase 1 answer: keep `negotiating | executed | terminated` in the
   database, add an ADR/`memory.md` note that the lifecycle document's five states are the
   *obligation-phase* machine layered on top, and update whichever document is wrong.
2. Make the transition **only** a consequence, never an assertion: an `AFTER INSERT` trigger on
   `cw.executed_agreement` that sets the parent to `executed`. Implemented in a `security definer`
   function so no role needs a bare `UPDATE` grant.
3. Add a `BEFORE UPDATE` trigger on `cw.agreement` enforcing the legal transitions
   (`negotiating → executed`, `negotiating → terminated`, `executed → terminated`; nothing else,
   and nothing back to `negotiating`).
4. Audit every transition: `agreement_status_changed` with `from` and `to` in the payload.

**Tests** (`executed.test.mjs`): as `set role cw_legal_reviewer`, insert an executed agreement →
the parent's status reads `executed`; the transition is audited; a direct
`update cw.agreement set status='negotiating'` raises; a requester cannot set status at all.

**Mutations:** remove the execution trigger → expect `signing a deal marks the agreement
executed`; allow `executed → negotiating` → expect `an executed agreement cannot return to
negotiating`.

---

### D8 — Unenforced coherences

Three distinct sub-findings; all confirmed.

**(a) Clause-ID prefix vs category short code.** No constraint. A `BEFORE INSERT OR UPDATE`
trigger on `cw.clause` comparing `left(clause_id,2)` to `cw.category.short` was **verified to
work in PGlite** (`mismatched prefix rejected: clause id XX-H-001 does not match category short
code DP`). Note `cw.clause.severity` and the middle letter of the ID (`-H-`/`-S-`) are also
uncorrelated — enforce both in the same trigger. **`promote_concession()` (`0003:206-208`) is the
worst offender**: it accepts an arbitrary `p_new_clause_id` and hard-codes `severity='Standard'`.
The trigger will start refusing bad promotions, which is the point; the function should derive
the ID prefix from `c.category_key` rather than trust the caller.

**(b) Rung severity/category vs ladder.** Enforce via trigger on `cw.ladder_rung`.
**This will break the existing test fixtures** — `ladder.test.mjs:105-109` (Standard ladder,
three High rungs) and `:120-122` (`liab` ladder, `data` rungs). Under OC §5 constraint 7 these
fixtures must be *corrected*, not the constraint weakened, and the correction disclosed. Seed the
suite with genuine Standard-severity clauses.

**(c) Run-store CHECKs.** `cw.run_decision.severity` and `.category` are unconstrained free text
while `cw.run_finding.severity` and `cw.clause.severity` are checked. Add
`check (severity in ('Standard','High'))` to `cw.run_decision`, and consider a FK from
`run_decision.category` to `cw.category(label)` — **but note E-slice territory**: the engine
currently writes the human *label* where the schema elsewhere uses the *key* (review E2). I flag
the collision and defer the column's identity to whoever owns E2; the CHECK on `severity` is
independent and safe to add now.

**Mutations:** remove each new trigger/CHECK → expect the corresponding named test.

---

### D9 — Indexes, TRUNCATE, silent DELETE

**(a) Indexes.** **Observed:** `cw.concession` and `cw.audit_event` each carry only their primary
key. Add `create index on cw.concession (agreement_id)`, `(category_key)`,
`(standard_clause_id, standard_version)`; and on `cw.audit_event` add `(event_type)`,
`(subject)`, `(ts)`. Every one of these backs a query that already exists in a policy, a view or a
test. Low risk, low value today (no data) — sequence it last.

**(b) TRUNCATE.** **Observed:** `truncate cw.clause_tag` succeeds as owner; DELETE rules and
UPDATE triggers do not fire. **But no `cw_*` role holds TRUNCATE** — the privilege query returned
`[]`. So this is not an application-role hole. Remedy: an explicit `BEFORE TRUNCATE` statement
trigger on every append-only table raising `restrict_violation`, plus a note in
`ADR-0008` that owner-level access is out of the threat model and belongs to operational
controls. **I disagree with treating this as a code fix only** — the honest answer is a trigger
*and* a written statement of what the database can and cannot defend against.

**(c) Silent no-op DELETE.** **Observed:** `affectedRows=0`, no error, no row change. `do instead
nothing` rules (`0002:91-92`, `0004:103-104`, `0005:150`, `0006:91`) turn an application bug into
a silent success. Replace every one with a `BEFORE DELETE` trigger that raises
`restrict_violation` with a message naming the table, matching the shape already used for UPDATE
at `0005:134-139` and `0006:77-83`. **This is a behaviour change** — the existing mutation entries
`signed documents can be deleted` (mutation-check.mjs:104-108) target the rule text and will need
their `find` strings updated; that is a stale-check maintenance item, not a weakening.

---

## Hash-chain scheme specification

This section is the deliverable the review says does not exist. It is written to be
implementation-ready.

### 1. What is hashed

Each `cw.audit_event` row commits to a **canonical pre-image** built from length-prefixed fields,
so no field boundary is ambiguous:

```
preimage(row) :=
    lp(prev_hash_or_empty)
 || lp(seq::text)
 || lp(epoch_micros(ts)::text)
 || lp(actor)
 || lp(actor_role_or_empty)
 || lp(actor_kind)
 || lp(event_type)
 || lp(subject_or_empty)
 || lp(canonical_json(payload))

lp(s) := length(convert_to(s,'utf8'))::text || ':' || s
hash(row) := encode(sha256(convert_to(preimage(row),'utf8')),'hex')
```

Design points, each answering a defect I measured:

- **`epoch_micros(ts)`**, i.e. `(extract(epoch from ts) * 1000000)::bigint`, *not* `ts::text`.
  Rendering `timestamptz` as text is session-dependent; I observed the identical untampered rows
  verifying clean under one `TimeZone` and reporting tampering under another, and again under a
  different `DateStyle`. Epoch microseconds are a single integer with no session dependency.
- **Length prefixes**, not `|` separators. I proved `sha256('|a|b'||'|') = sha256('|a'||'|b|')` —
  the current scheme cannot distinguish a subject of `a|b` from an event type ending in `a` and a
  subject starting with `b`.
- **`seq` is included.** Without it, two rows identical in content at the same instant are
  interchangeable, and re-ordering is invisible.
- **`actor_role` is included.** It is currently unhashed and therefore silently rewritable, while
  being precisely the field an auditor relies on.
- **`canonical_json(payload)`** := `jsonb` sorted-key text form. `jsonb::text` in Postgres is
  already key-ordered and whitespace-normalised, so `payload::text` suffices; this must be
  *stated* rather than assumed, because it is a load-bearing property.

### 2. How append is serialised

A new single-row table is the chain head:

```sql
create table cw.audit_head (
  only_one  boolean primary key default true check (only_one),
  head_hash text,
  height    bigint not null default 0
);
insert into cw.audit_head (only_one) values (true);
```

The `BEFORE INSERT` trigger on `cw.audit_event`:

1. `perform pg_advisory_xact_lock(hashtext('cw.audit_event'));` — *(verified callable from
   plpgsql in PGlite)*. Held to commit; second writer waits.
2. `select head_hash, height into prev, h from cw.audit_head where only_one for update;` — the row
   lock is the real serialiser and works even if the advisory lock is bypassed; the advisory lock
   makes the ordering deterministic for the *whole* append including hash computation.
3. Compute `new.prev_hash := prev` and `new.hash := hash(row)`.
4. `update cw.audit_head set head_hash = new.hash, height = h + 1;`

Plus a **structural** fork guard that does not depend on the lock being right:

```sql
create unique index audit_no_fork on cw.audit_event (prev_hash) nulls not distinct;
```

**Verified in PGlite:** with the chain trigger disabled, inserting two rows sharing one
`prev_hash` fails with `duplicate key value violates unique constraint "audit_no_fork"`.
`nulls not distinct` covers the genesis row, so a second genesis is also impossible. This is what
lets the guarantee be *tested* in a single-connection database.

### 3. The anchored checkpoint

```sql
create table cw.audit_checkpoint (
  checkpoint_seq bigserial primary key,
  at_height      bigint not null unique,
  head_hash      text   not null,
  event_count    bigint not null,
  taken_at       timestamptz not null default now(),
  taken_by       text   not null
);
```

- **Contents:** the height of the chain at the moment of the checkpoint, the head hash at that
  height, and the row count. Written by `cw.audit_checkpoint_take()`, a `security definer`
  function executable by `cw_legal_admin` and `cw_auditor` only, which takes the same advisory
  lock so a checkpoint cannot straddle an append.
- **Cadence:** on demand plus automatically at a fixed height interval (recommend every 1,000
  events, driven from the same `BEFORE INSERT` trigger — cheap, and it means an attacker cannot
  choose a quiet moment). **Owner decision:** whether checkpoints are also written on a wall-clock
  schedule; that needs a scheduler that does not exist yet, so height-driven is the Phase 1
  answer.
- **Immutability:** `revoke all`, `grant insert, select` to `cw_legal_admin` and `cw_auditor`; no
  UPDATE/DELETE grant to anyone; `BEFORE UPDATE` and `BEFORE DELETE` triggers raising
  `restrict_violation`.
- **Out of scope for Phase 1 (disclose):** a *signed* anchor. PGlite reports
  `extension "pgcrypto" is not available`, so HMAC-in-the-database is not testable here, and an
  external signing key is a deployment concern with no deployment target. The checkpoint as
  specified is *anchored* (tamper-evident against in-database edits) but not *notarised* (it
  cannot survive an attacker who also controls the checkpoint table's owner). Say this plainly in
  `ADR-0008` rather than implying more.

### 4. How the verifier detects forking and truncation

`cw.audit_verify()` returns `table (ok boolean, first_bad_seq bigint, reason text)`:

1. **Link check.** Walk `order by seq`. For each row, `prev_hash` must equal the previous row's
   `hash` (null for the first), and `hash` must equal `hash(row)` recomputed from the canonical
   pre-image. Failure → `reason='link'` or `'content'` at that `seq`.
2. **Fork check.** `select prev_hash from cw.audit_event group by prev_hash having count(*) > 1` —
   any result is a fork. Failure → `reason='fork'`. (The unique index makes this unreachable in a
   healthy database; the check exists so the verifier still detects a fork in a database where the
   index was dropped, which is itself the attack.)
3. **Height check.** `cw.audit_head.height` must equal `count(*)` from `cw.audit_event`, and
   `cw.audit_head.head_hash` must equal the `hash` of the highest `seq`. **This is what catches
   tail truncation**, which link-walking structurally cannot: I observed `audit_verify()` returning
   clean after the newest two rows of a four-row chain were deleted. Failure → `reason='height'`.
4. **Checkpoint check.** For every `cw.audit_checkpoint` row, the event at that height must still
   exist and its `hash` must equal the recorded `head_hash`. This catches truncation *below* the
   current head and any rewrite of history that was subsequently re-chained (an attacker who
   deletes rows and recomputes every hash afterwards passes checks 1–3 but cannot make an old
   checkpoint match). Failure → `reason='checkpoint'`.
5. **Sequence-gap reporting.** Gaps in `seq` are reported as `reason='gap'` but are *advisory*,
   not fatal: a rolled-back transaction legitimately consumes a `bigserial` value. This
   distinction must be written down, because otherwise the first rollback in production looks like
   an attack.

An attacker who deletes the newest rows fails (3). One who deletes interior rows fails (1). One
who deletes rows and re-chains everything after fails (4). One who races two appends is blocked by
the unique index and, failing that, detected by (2). One who edits a payload fails (1)'s content
check. One who edits `actor_role` now also fails it, which it does not today.

---

## Candidate work packages

Nine packages. Ordering constraints are hard where stated. **Packages that touch the same file
must not run concurrently** — the file-collision column is the scheduling constraint.

| # | Package | Findings | Files touched | Must follow | Notes |
|---|---|---|---|---|---|
| **A1** | **Role-real test harness** | (enabler) | `backend/db/test/*.mjs` (shared helper), `backend/package.json` | — | Extract the `asRole()` helper into a shared module that does `reset role; set_config; set role cw_<role>`, so a write test cannot accidentally run as owner. **Do this first**: every other package's test depends on it. Collides with every test file — schedule alone. |
| **A2** | **Audit chain rebuild** | D2 | **new** `0007_audit_chain.sql`, `0001_foundation.sql` (replace `audit_chain`/`audit_verify`), **new** `db/test/audit-chain.test.mjs`, `mutation-check.mjs`, `package.json` | A1 | Highest severity in my slice once the timestamp defect is counted. Touches `0001` — collides with A6 (D3's `app_role`). |
| **A3** | **Promotion under real permissions** | D1, D6 | `0003_ladders_and_concessions.sql`, `ladder.test.mjs`, `mutation-check.mjs` | A1 | D1 and D6 **must** be one package: the naive D1 fix (add an UPDATE policy) opens D6. Touches `0003` — collides with A4 and A7. |
| **A4** | **The floor made absolute** | D5 | `0003_ladders_and_concessions.sql`, `ladder.test.mjs`, `mutation-check.mjs` | A3 (same file) | Adds `severity`, `ladder_id`, `floor_rung_at_concession` to `cw.concession`; must land *after* A3 so the immutability trigger is written against the final column set. |
| **A5** | **Immutability holes closed** | D4 | `0002_clause_registry.sql`, `0004_conflict_rules.sql`, `registry.test.mjs`, `mutation-check.mjs` | A1 | Independent of A2–A4. Can run concurrently with A3 (different migration files). |
| **A6** | **Identity narrowed to the connection role** | D3 | `0001_foundation.sql`, `0002`–`0006` (RLS on `audit_event`), `registry.test.mjs`, `mutation-check.mjs`, `ADR-0008`, `backend/README.md` | A2 (both touch `0001`) | Includes the *new* finding that `cw.audit_event` has no RLS. The "real fix" (JWT) is explicitly deferred with a recorded trigger condition. |
| **A7** | **Agreement status machine** | D7 | `0003_ladders_and_concessions.sql`, `0006_executed_agreements.sql`, `executed.test.mjs`, `mutation-check.mjs` | A4 (same file `0003`) | Carries an owner decision (3 states vs the lifecycle document's 5). |
| **A8** | **Coherence constraints** | D8 | `0002`, `0003`, `0005`, `ladder.test.mjs` (**fixture corrections**), `registry.test.mjs`, `run-store.test.mjs`, `mutation-check.mjs` | A3, A4, A5, A7 (touches all their files) | Must be **last** among the migration-editing packages. Will break existing fixtures — corrections are disclosures, not weakenings. Coordinate the `run_decision.category` column question with the E2 owner. |
| **A9** | **Indexes, TRUNCATE guards, loud DELETE** | D9 | `0001`–`0006`, `mutation-check.mjs` (stale `find` strings), `ADR-0008` | A8 | Touches every migration; schedule alone at the end. Replacing the `do instead nothing` rules invalidates two existing mutation entries' `find` strings — a maintenance item to fix in the same package. |

**Critical path:** A1 → A2 → A6, and A1 → A3 → A4 → A7 → A8 → A9. A5 runs parallel to A2/A3.

**Deliberate deviation from the proposal's ordering:** the proposal lists D1 first and D2 second.
I recommend **A2 (D2) first among the substantive packages** once A1 exists, because the
timestamp-rendering defect means *every* tamper-evidence claim in the product is currently false
in a way nobody has noticed, and because A2's `0001` edits are on the critical path for A6.

---

## Risks and unknowns

| # | Risk | Tag | Handling |
|---|---|---|---|
| R1 | **The D2 fork cannot be raced in PGlite** — single in-process connection. A serialisation mutation (removing the advisory lock) will therefore be a MISS in the mutation harness, because no test can observe its absence. | Observed | Do not add a mutation entry that is guaranteed to MISS (the harness exits non-zero on any miss, per `mutation-check.mjs:157-161`). Test the *structural* guard (unique index) instead, and record the concurrency gap as an explicit, visible deferral with the reason. Revisit if a real Postgres test target is ever added. |
| R2 | Making the chain hash session-independent **changes every existing hash**. | Inferred | Free today (OC §5 constraint 10, no production data). It must be stated in `memory.md` that the chain format has a version, and the format should carry a version marker so a future change is detectable rather than silent. |
| R3 | The D8 rung-coherence trigger **breaks existing passing tests**. | Observed (`ladder.test.mjs:105-109`, `:120-122`) | OC §8: anything that weakens a test assertion is approval-sensitive. Correcting *fixture data* to satisfy a new constraint is not a weakening, but it must be disclosed explicitly in the final report. |
| R4 | `run_decision.category` — label vs key — is contested between D8 and E2. | Inferred | Do not resolve unilaterally. A8 adds only the `severity` CHECK; the category question is handed to the E2 owner with a written note. |
| R5 | `pgcrypto` is unavailable, so a **signed** checkpoint is untestable here. | Observed | Ship an anchored-but-unsigned checkpoint; state the residual risk in `ADR-0008` in plain language ("this detects edits made through the database; it does not defend against someone who controls the database itself"). Adding a signing dependency is approval-sensitive (OC §8). |
| R6 | D3's real fix requires an auth layer that does not exist. | Observed (no auth code in `backend/`) | Ship mitigations 1–3; record the deferral with its trigger condition. |
| R7 | The agreement state set contradicts `LIFECYCLE-ARCHITECTURE.md:296`. | Observed | Owner decision. Do not silently pick one. |
| R8 | Whether un-retiring should be *possible at all*, and whether ladders should be versioned rather than frozen, are product questions I am answering by recommendation only. | Assumed | Surface both as owner decisions. |
| R9 | I did not read `backend/engine/**` (excluded by my slice), so any engine code that writes `cw.concession` or `cw.run_decision` may break on the new NOT NULL `severity` column. | Unresolved | A4 and A8 must be sequenced after, or coordinated with, whoever owns the write-side seam (E2). |

---

## Disagreements with the review or the proposal

1. **The review's root cause is imprecise, and the imprecision would mislead the fix.** §4 says
   "the tests run as the database owner in a single session." **Observed:** all five suites use
   `set role` — `registry.test.mjs:269-309`, `ladder.test.mjs:246-285`, `run-store.test.mjs:204-228`,
   `executed.test.mjs:194-207`. What is uniformly missing is role-real testing of **write** paths.
   The corrected rule — *every governed write is exercised as the role that is meant to perform
   it* — is what A1 should encode. Success criterion S3 in the objective contract is satisfiable
   today by a suite that still has the D1 hole, so **S3 should be tightened** to name writes.
2. **The review understates D2 by omitting its worst component.** It describes forking and
   truncation. It does not mention that `cw.audit_verify()` produces a **false tamper alarm on an
   honest database** whenever the verifying session's `TimeZone` or `DateStyle` differs from the
   writer's — which I observed directly — nor that the `|`-joined pre-image is field-shift
   ambiguous, nor that `actor_role` is unhashed. On a single-node deployment, the timestamp defect
   fires before the concurrency defect ever does.
3. **The proposal's D1 remedy offers a choice that is not a choice.** It says "add the missing
   UPDATE policy **(or)** make the function `security definer`." Adding an UPDATE policy fixes D1
   and simultaneously **opens D6** — it hands `cw_legal_admin` a working, unaudited rewrite path
   over quarantined vendor text and recorded approvers. Only the `security definer` branch is
   correct. The proposal should say so, and D1 and D6 should be one work item rather than items
   1 and 6.
4. **The proposal's ordering puts D2 second; it should be first** among substantive packages, for
   the reasons in R2 and the critical path above.
5. **The review misses that `cw.audit_event` has no row-level security at all.**
   **Observed:** `relrowsecurity=false`; a `cw_requester` reads the entire log, including
   `concession_recorded` payloads naming every other buyer's conceded position and override
   reference. `ladder.test.mjs:274-280` carefully proves a requester cannot read rival concessions
   *through `cw.concession`* — and the same information is freely readable one table over. This is
   a genuine confidentiality hole, arguably HIGH, and it belongs in D3's package.
6. **The review misses a second D8 coherence violation.** Not only does a rung's clause severity
   go unchecked against the ladder's severity — the rung's *category* is unchecked too, and
   `ladder.test.mjs:120-122` builds a `liab` ladder out of `data` clauses.
7. **D9's TRUNCATE item is slightly over-stated.** **Observed:** no `cw_*` role holds TRUNCATE;
   only the owner does. It is a threat-model documentation gap plus a cheap belt-and-braces
   trigger, not an application-role hole. LOW is the right severity, and the fix should be
   honest about what it is.
8. **`promote_concession()` has a defect neither D1 nor D8 names.** It hard-codes
   `severity => 'Standard'` (`0003:207`) and accepts an arbitrary caller-supplied clause ID with
   no relationship to `c.category_key` (`0003:206`). Promoting vendor text conceded against a
   *High* position mints a *Standard* clause. That is a substantive mislabelling of risk, and it
   should be fixed inside package A3.
