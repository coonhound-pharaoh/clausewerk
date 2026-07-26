# RT-1 — Red-team review of PLAN-A (database)

- **assignment_id:** RT-1 · **stage:** Focused Red-Team Review · **lens:** correctness and security of the database remedies
- **contract:** OC-CW-2026-07-25-01 · **date:** 2026-07-25
- **posture:** adversarial. Default verdict is *refuted* unless I reproduced it myself.

**Method.** All probes were run against a fresh `PGlite.create()` with all six migrations applied
in filename order, from throwaway scripts in the session scratchpad (deleted after the run; none
were written into the repo). Baseline confirmed green before starting:
`node db/test/ladder.test.mjs` → `29 passed, 0 failed`; `node db/test/registry.test.mjs` →
`37 passed, 0 failed`.

Environment: `@electric-sql/pglite@0.5.4`, `server_version = 18.3`, `current_user = postgres`,
session default `TimeZone = Etc/GMT+6`, `DateStyle = ISO, MDY`.

---

## Claim 1 — "D2 is worse than the review states: `audit_verify()` false-alarms on session `TimeZone`/`DateStyle`"

**Verdict: CONFIRMED — and it is the most important finding in the plan. The proposed replacement
pre-image is sound. But the plan does not handle re-anchoring, and its own test as specified can
pass with the fix reverted.**

### Evidence — reproduced independently

Four honest events written, then verified under varying session settings (`Observed`):

```
[verify @ default (Etc/GMT+6)]          {"v":null}     ← clean
[verify @ TimeZone=UTC]                 {"v":1}        ← FALSE TAMPER ALARM
[verify @ TimeZone=America/New_York]    {"v":1}        ← FALSE TAMPER ALARM
[verify @ TimeZone=Asia/Kolkata]        {"v":1}        ← FALSE TAMPER ALARM
[verify @ TimeZone=Etc/GMT+6]           {"v":null}     ← clean again
```

Isolated `DateStyle` run with `TimeZone` left untouched (`Observed`):

```
[DS: verify @ default]                {"v":null}
[DS: DateStyle='SQL, DMY']            {"v":1}   ts renders '25/07/2026 20:36:53.623 -06'
[DS: DateStyle='Postgres, DMY']       {"v":1}   ts renders 'Sat 25 Jul 20:36:53.623 2026 -06'
[DS: DateStyle='German, DMY']         {"v":1}   ts renders '25.07.2026 20:36:53.623 -06'
[DS: DateStyle='ISO, DMY']            {"v":null} ts renders '2026-07-25 20:36:53.623-06'
```

Root cause is `backend/db/migrations/0001_foundation.sql:79` (`new.ts::text` in the writer) and
`:97` (`r.ts::text` in the verifier).

The other three sub-defects also reproduced, each in isolation (`Observed`):

- **`actor_role` unhashed.** Clean chain → `update cw.audit_event set actor_role='FORGED' where
  seq=1` → `audit_verify()` still returns `null`. The pre-image at `0001:79-81` never mentions
  `actor_role`.
- **Tail truncation invisible.** 4-row chain, `delete from cw.audit_event where seq >= 3` →
  `audit_verify()` returns `null`, 2 rows left.
- **Separator ambiguity.** `sha256(convert_to('|a|b'||'|'))= sha256(convert_to('|a'||'|b|'))` →
  `{"collides":true}`.

### Is the proposed pre-image genuinely unambiguous?

**Yes, and I verified the load-bearing parts** (`Observed`):

- `epoch_micros(ts)` is session-invariant: the same row read at `TimeZone=Etc/GMT+6` /
  `DateStyle=ISO` and again at `Asia/Kolkata` / `German, DMY` gave
  `epoch_same: true, text_same: false` (`1785033420445000` both times).
- Length-prefixed framing `lp(s) := octet_length(s)||':'||s` is prefix-free and therefore closes
  the field-shift collision — this is a standard result, not one I need to measure.
- `payload::text` on a `jsonb` column is key-ordered and whitespace-normalised:
  `'{"b":1,"a":2}'::jsonb::text` → `{"a": 2, "b": 1}` (`Observed`). The plan is right to insist
  this be *stated* rather than assumed.
- `seq` is populated in a `BEFORE INSERT` row trigger, so hashing it is safe — I probed this
  specifically because getting it wrong would false-alarm on every row:
  `[SEQ visible in BEFORE INSERT] {"seq":1,"saw":"1"}` (`Observed`).

Does it cover `actor_role`? **Yes** — `lp(actor_role_or_empty)` is term 5 of the pre-image
(plan §"Hash-chain scheme specification" ¶1). Good.

### Where the plan is wrong or silent

**(1a) Re-anchoring is not addressed — but it does not need to be, and the plan should say so.**
Changing the pre-image invalidates every stored `hash`/`prev_hash`. The plan handles this only
obliquely, in R2, as "free today (OC §5 constraint 10, no production data)". That is correct as
far as it goes, but the plan never states the operational consequence: **there is no rebuild
path.** Every test database is built from migrations, so no rows survive; there is nothing to
re-anchor. This should be an explicit sentence in the D2 remedy, not an inference from a risk
row. `Inferred`.

**(1b) The plan's own session-independence test can pass with the fix reverted.** The specified
test is "verify clean; `set timezone='America/New_York'`; verify again; must still be clean."
PGlite inherits the **host's** timezone as the session default — here `Etc/GMT+6`. On a CI runner
whose host clock is UTC, a test that flips to a *fixed* target timezone may be flipping to the
same value it already had, and the assertion passes against the unfixed code. The same applies to
`DateStyle`: I showed `ISO, DMY` does **not** trigger the false alarm — only `SQL`, `Postgres` and
`German` styles do. The test must (i) set an explicit *writer* timezone/datestyle before writing,
(ii) assert the two settings actually differ, and (iii) pick a `DateStyle` family that changes
rendering. Without that it is theatre. `Observed` (the `ISO, DMY` null result and the
host-inherited default are both in the raw output above).

**(1c) The plan's D2 work invalidates an existing mutation-check entry and does not say so.**
`backend/db/test/mutation-check.mjs:39-42` has `find: "coalesce(prev,'') || '|' || new.ts::text"`.
A2 deletes that exact string from `0001_foundation.sql`. The harness treats an unfound `find` as a
**stale check and exits non-zero** (`mutation-check.mjs:127-133`, `:157-161`) — so `npm run
test:mutation`, and therefore success criterion **S9**, breaks the moment A2 lands. The plan flags
stale `find` strings only for the D9 DELETE-rule entries (§D9(c)) and never for this one. The same
applies to `the floor is not absolute` (`mutation-check.mjs:56-58`), whose `find` is the exact
trigger body text that A4 rewrites. `Observed`.

**(1d) The height check is close to theatre against the only actor who can perform the attack.**
Privilege dump on `cw.audit_event` (`Observed`):

```
cw_auditor SELECT | cw_legal_admin INSERT,SELECT | cw_legal_reviewer INSERT,SELECT
cw_requester INSERT,SELECT | postgres DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

**Only the owner can DELETE.** The plan's remedy for tail truncation is `cw.audit_head.height`,
an ordinary table the owner can also `UPDATE`, plus `cw.audit_checkpoint`, an ordinary table whose
protective triggers the owner can `DISABLE`. So the entire truncation remedy raises the bar
against an actor who, by construction, can also lower it back. The plan concedes this for
*checkpoints* ("anchored but not notarised … cannot survive an attacker who also controls the
checkpoint table's owner") but presents the height check flatly as "**This is what catches tail
truncation**" with no such caveat. The height check is genuinely worth having — it catches
accidental deletion, partial restores, and a future non-owner DELETE grant — but the plan must say
what it does *not* catch, or it repeats exactly the "promise not enforced" pattern this whole
contract exists to remove. `Observed` + `Inferred`.

**Consequence for the plan.** Claim 1 stands and A2 should indeed be first. Add: (i) an explicit
"nothing to re-anchor" sentence; (ii) a hardened session-independence test with an asserted
setting delta; (iii) the `mutation-check.mjs:39-42` and `:56-58` stale-`find` repairs, inside A2
and A4 respectively; (iv) an honest statement of the height check's threat model.

---

## Claim 2 — "Adding an UPDATE policy fixes D1 but opens D6, therefore only `security definer` is correct"

**Verdict: REFUTED as stated. It is a false dichotomy — a third option exists, I built it, and it
is strictly safer than the plan's choice. Separately, the plan's stated rationale for the
`security definer` branch is wrong in a way that matters.**

### The third option works

A **column-level UPDATE grant** plus a **restrictive UPDATE policy**, keeping the function
`security invoker`:

```sql
create policy promote_only on cw.concession for update
  using      (cw.app_role()='legal_admin' and promoted_to_clause is null)
  with check (cw.app_role()='legal_admin' and promoted_to_clause is not null);
revoke update on cw.concession from cw_legal_admin;
grant  update (promoted_to_clause) on cw.concession to cw_legal_admin;
```

Result, run as the **real** `cw_legal_admin` (`Observed`):

```
[current_user]                        {"current_user":"cw_legal_admin","app_role":"legal_admin"}
[promote #1]                          {"ok":true,"rows":[{"ref":"DP-S-080@v1"}]}
[promoted_to_clause read back]        {"promoted_to_clause":"DP-S-080@v1"}   ← D1 FIXED
[promote #2]                          {"ok":false,"err":"concession 1 was already promoted to DP-S-080@v1"}
[update ... set vendor_text=...]      {"ok":false,"err":"permission denied for table concession"}  ← D6 CLOSED
[update ... set approved_by=...]      {"ok":false,"err":"permission denied for table concession"}  ← D6 CLOSED
[update ... set promoted_to_clause=null] {"ok":true, affected:0}   ← blocked, but silently
[final row] vendor_text='Vendor text.', approved_by='legal@cw', promoted_to_clause='DP-S-080@v1'
```

So D1 and D6 are **both** fixed without `security definer`, without dropping RLS as the gate, and
without the function running as a superuser. The plan's premise — "a policy cannot express this
transition" — is false: a policy *plus a column-level grant* can. The plan asserts the dichotomy
twice (§Remedies D1 preamble; §Disagreements ¶3) and never tests it.

The one wart: un-promotion is blocked *silently* (0 rows affected, no error) rather than loudly —
the same silent-no-op shape the plan itself objects to in D9(c). A `BEFORE UPDATE` trigger is
still the right instrument for the loud message. But that is the D6 trigger the plan already
proposes, and it works identically under either branch.

**This does not mean `security definer` is wrong** — it is a defensible choice, and it also
removes the need for `cw_legal_admin` to hold any `UPDATE` at all. It means the plan's *reasoning*
is not evidence-backed, and a reviewer who accepts "only one branch is correct" will not notice
that the definer branch trades RLS enforcement for a superuser-context function. The plan must
either present the column-grant option and say why it prefers definer, or drop the dichotomy.

### `search_path` — the plan gets this right

The plan specifies `security definer set search_path = cw, pg_temp` (§D1 remedy step 1). I applied
that shape and confirmed it takes: `{"prosecdef":true,"proconfig":["search_path=cw, pg_temp"]}`
(`Observed`). Correct, and it matches the existing precedent at `0003:285`.

### The role check IS spoofable, and the plan says the opposite

The plan writes: *"keeping the existing explicit `cw.app_role() = 'legal_admin'` check … as the
authorisation gate (it must stay — `security definer` removes the RLS gate, so **the explicit
check becomes the only one**)."*

`cw.app_role()` reads `current_setting('cw.role')`, an unprivileged client-settable GUC
(`0001:39-42`). **A `security definer` function whose authorisation gate is a client-settable
session variable is not a fix.** Demonstrated (`Observed`), with the definer function applied and
`revoke all … from public; grant execute … to cw_legal_admin`:

```
[reviewer, honest guc]                 permission denied for function promote_concession   ← held by the GRANT
[reviewer, spoofed cw.role=legal_admin] permission denied for function promote_concession  ← held by the GRANT
[MUTANT grant-to-public, honest guc]   only legal_admin may promote a concession…          ← held by app_role()
[MUTANT grant-to-public, SPOOFED guc]  {"ok":true,"ref":"DP-S-093@v1"}                     ← PROMOTED
```

Read that last line carefully: a **`cw_legal_reviewer`** minted an approved clause version from
quarantined vendor text by setting one session variable. The thing that actually protects the
system is the `EXECUTE` grant, **not** the `app_role()` check. The plan has it exactly backwards.

Two consequences the plan misses:

- Postgres grants `EXECUTE` to `PUBLIC` by default on `CREATE FUNCTION`. If the `revoke all …
  from public` line is ever dropped, forgotten, or lost in a merge, the definer branch is
  **strictly worse than today** — today RLS default-deny stops the write; after the change nothing
  does except a spoofable string. This is the single highest-consequence line in package A3 and
  the plan gives it one clause in step 2.
- The plan's D1 test list never includes a **spoofing** case. Add: `set role cw_legal_reviewer` +
  `set_config('cw.role','legal_admin')` → promote must be refused. Without it, the suite would
  report "a legal reviewer cannot promote" green while the escalation above is live.

**Consequence for the plan.** PARTIAL on the dichotomy (refuted), PARTIAL on the definer branch
(correct mechanism, wrong stated rationale, missing test). A3 must: state the `EXECUTE` grant is
the gate; add the spoofing test; and either adopt the column-grant option or justify rejecting it.

---

## Claim 3 — "The D2 fork must be tested structurally via `unique (prev_hash) nulls not distinct`"

**Verdict: CONFIRMED. The index rejects forks and I could not make it reject anything legitimate.
The plan is right, including its refusal to add a mutation entry it knows would MISS.**

Evidence (`Observed`):

```
[create index]                           ok
[legit append 1..5]                      all ok
[verify]                                 {"v":null}
[fork child A (trigger disabled)]        ok
[fork child B, same prev_hash]           duplicate key value violates unique constraint "audit_no_fork"
[second genesis, prev_hash NULL]         duplicate key value violates unique constraint "audit_no_fork"
```

I then went hunting for the "guard that breaks normal operation" the assignment warned about, and
did not find one:

- **Genesis row.** Exactly one NULL `prev_hash` is permitted and exactly one is ever created.
- **Re-seeding / truncate-restart.** `truncate cw.audit_event` then append → `ok`, 1 row. The
  index does not survive a fresh chain into a conflict because the old NULL row is gone
  (`Observed`).
- **Same-instant duplicate content.** Two `cw.audit()` calls with identical `event_type`,
  `subject` and `payload` inside one transaction → both inserted, `verify` clean. Their
  `prev_hash` values differ by construction, so no collision (`Observed`).
- **Checkpoints.** Checkpoints live in a separate table and never touch `audit_event.prev_hash`.
  No interaction. `Inferred`.

The mutation entry `fork guard removed` → `select 1;` is a real, catchable mutation.

**One residual concern, non-blocking.** The plan's R1 correctly refuses to add a mutation for the
advisory lock, because no PGlite test can observe its absence. The honest consequence — which the
plan should state in one line rather than leave to the reader — is that
`pg_advisory_xact_lock(...)` and the `for update` on `cw.audit_head` ship **with zero test
coverage of any kind**. That is acceptable given the unique index is the real guarantee, but it
should be written down as an untested line of code, not implied.

---

## Claim 4 — "`cw.audit_event` has no RLS; a requester reads every rival's concession payloads"

**Verdict: CONFIRMED. The hole is real. The plan's proposed remedy, as written, is NOT adequate —
it breaks every audited write in the system, and it introduces a second false-tamper-alarm source
in `audit_verify()` that nobody has noticed.**

### The hole

`select relrowsecurity from pg_class where oid='cw.audit_event'::regclass` → `{"relrowsecurity":
false}` (`Observed`). As a real `cw_requester` with `cw.actor='other@cw'`, owning only AG-002:

```
[requester sees audit rows]      {"n":3}
[requester reads rival payloads] [{"subject":"AG-001/data","ab":"legal@cw"},
                                  {"subject":"AG-002/data","ab":"legal@cw"}]
```

AG-001 belongs to `buyer@cw`. The requester read another buyer's `concession_recorded` event.
`ladder.test.mjs:274-280` proves this is impossible *through `cw.concession`*; it is trivial one
table over. The plan is right that this is a genuine confidentiality hole and right to call it
arguably HIGH.

### The remedy as written breaks the product

The plan's D3 mitigation 3 says only: *"Enable RLS on `cw.audit_event` … and scope reads."* I
implemented exactly that — RLS enabled, one `for select` policy, nothing else (`Observed`):

```
[requester after RLS, read]                    {"n":1}                        ← scoping works
[requester inserts a concession]  ERROR: new row violates row-level security policy for table "audit_event"
[legal_admin inserts a concession] ERROR: new row violates row-level security policy for table "audit_event"
```

`cw.audit()` (`0001:107-114`) is `language sql`, **security invoker**, and inserts as the caller.
Enable RLS with no `for insert` policy and *every governed write in the system* — concession
recorded, clause retired, promotion, execution — fails. This is the D1 failure mode reproduced
verbatim by the plan's own remedy. **Blocking.**

### Worse: RLS turns `audit_verify()` into a false tamper alarm

`cw.audit_verify()` (`0001:90-104`) is a plain `stable` function that walks
`select * from cw.audit_event order by seq`. Under RLS it walks the caller's **filtered view**
(`Observed`):

```
[audit_verify() as cw_requester under read-scoping RLS]   {"v":3}
```

That is an honest, untampered database reporting **tampering at seq 3** — because the requester
cannot see seq 1 and 2. This is a second, independent instance of exactly the defect the plan
identifies as the most important in its slice, and the plan **introduces** it. The height check
proposed in A2 makes it worse: `count(*)` under RLS will also not equal `audit_head.height` for
any scoped role.

The fix is one word — `security definer` on `audit_verify()` (with `set search_path`), plus a
deliberate decision about who may execute it. The plan does not mention it. It is invisible to the
plan's tests because every existing suite verifies the chain as the **owner**, who bypasses RLS —
the precise blind spot the objective contract exists to close.

Note the ordering trap: A2 rebuilds `audit_verify()` and A6 adds the RLS. The plan's critical path
runs A2 → A6, so A2 will be written and merged before the hazard exists, and A6 does not list
`audit_verify()` among its touched objects.

### Does it break the auditor?

No, if a policy branch is written for them. Confirmed (`Observed`): `set role cw_auditor` with
`cw.role='auditor'` and a policy branch `cw.app_role() in ('auditor','legal_reviewer',
'legal_admin')` → `{"n":3}`, full log. The plan's read-scoping design is correct on this point.

**Consequence for the plan.** A6 must additionally: (i) add a permissive `for insert` policy on
`cw.audit_event` (or make `cw.audit()` `security definer`); (ii) make `cw.audit_verify()`
`security definer set search_path = cw, pg_temp`; (iii) add a test that a **non-owner** role gets
a clean verify. Without (i) the migration cannot even be applied without breaking the suites;
without (ii) the product's tamper-evidence claim is false for every role that is not the owner.

---

## Claim 5 — "The floor lookup ignores severity" and the fix fails closed

**Verdict: CONFIRMED on the defect. On the fix: PARTIAL — the plan's *intent* is fail-closed and
correct, but I could not verify the remedy (it is prose, not code), and the plan understates how
much fixture surgery its own fail-closed rule requires.**

### The defect, reproduced

Category `data` with a High ladder (floor rung 0) and a Standard ladder (floor rung 2)
(`Observed`):

```
[floors]                       [{"ladder_id":10,"severity":"High","rung":0},
                                {"ladder_id":11,"severity":"Standard","rung":2}]
[trigger query, no order by]   [{"rung":0}]
[concede rung 2, no override]  ERROR: conceding below the floor (rung 2 > floor 0) requires a recorded override
```

Rung 2 is the *legitimate* Standard floor and is refused. The trigger at `0003:140-144` picked the
wrong ladder. Confirmed.

### The no-ladder path fails OPEN today — reproduced

```
[concede rung 99 in category 'liab', which has no ladder at all, no override]  {"ok":true, affected:1}
```

An arbitrary rung, no ladder, no override, accepted silently. The plan is right that this is the
real defect and right that it must raise. `Observed`.

### Where the plan is thin

**(5a) The remedy is unverifiable as written.** §D5 step 3 says "*fail loudly* when no ladder
exists … Replace with an explicit raise". There is no DDL. I cannot confirm it fails closed; I can
only confirm the defect it is aimed at. `Unresolved` — the plan should carry the trigger body, as
it does for the hash scheme.

**(5b) The fail-closed rule collides with the vendor-text path and the plan does not say which
wins.** The current trigger reaches the floor lookup only when `conceded_rung is not null`
(`0003:151`). A concession that takes vendor text with a recorded override needs no floor. If the
new raise is unconditional, vendor-text concessions in a category with no ladder for their
severity become impossible. That may be the right answer — but it is an unstated behaviour change
sitting inside a "fail loudly" bullet. `Inferred` from `0003:146-155`.

**(5c) `severity not null` on `cw.concession` breaks more fixtures than the plan discloses.** The
plan discloses only the D8 rung fixtures. Adding a `not null` column breaks **every**
`insert into cw.concession` in `ladder.test.mjs` — lines 129-131, 137-139, 143-146, 151-153,
157-160, 165-170 — six statements across five tests. Current columns confirmed (`Observed`):
`concession_id*, agreement_id*, category_key*, standard_clause_id*, standard_version*,
conceded_rung, vendor_text, override_ref, reason*, approved_by*, conceded_on*, promoted_to_clause,
created_at*`. Mechanical, but it is fixture churn the disclosure list must name, and it lands in
A4 while A8 is separately rewriting the same file.

---

## Claim 6 — "A8's rung-coherence trigger breaks `ladder.test.mjs:105-109` and `:120-122`"

**Verdict: CONFIRMED on the facts. RULING: correcting the fixtures is legitimate and is NOT a
weakening — but the plan under-scopes the correction, which is a real scheduling risk.**

### The facts

- `ladder.test.mjs:105-109` — `insert into cw.ladder … values (4,'data','Standard','R. Vance')`
  with rungs `DP-H-014`, `DP-H-070`, `DP-H-061`, all declared `severity='High'` at
  `ladder.test.mjs:54-56`. **Severity incoherent.** `Observed`.
- `ladder.test.mjs:120-122` — `values (5,'liab','High','R. Vance')` with rungs `DP-H-014` and
  `DP-H-070`, both `category_key='data'`. **Category incoherent, and severity too** (`liab`/High
  ladder, High clauses — severity happens to match; category does not). `Observed`.

### Ruling

**Legitimate.** OC §5 constraint 7 forbids weakening tests to make new work pass; OC §8 makes
weakening an assertion approval-sensitive. Neither test *asserts* anything about rung severity or
category. Test at `:103-117` asserts `rungs=3`, `unusable_rungs=1`, `status='degraded'`,
`selectable=false`, `state='expired'`. Test at `:118-125` asserts `status='floor_unusable'`. Both
assertions survive a fixture whose rungs are coherent, unchanged in strength and in count. The
fixture severity/category was **incidental scaffolding that happened to be invalid** — precisely
the "the fixture was wrong, disclose it" case the contract contemplates, not the "delete the
assertion" case it forbids. The plan's framing ("corrections are disclosures, not weakenings") is
correct. **No objection.**

### But the correction is bigger than the plan thinks

The seed at `ladder.test.mjs:53-56` contains **no Standard `data` clause and no High `liab`
clause** (`DP-H-014/052/061/070` = data/High; `LC-S-009` = liab/Standard) — verified against the
fixture. So the corrections cannot be done by swapping clause IDs: ladder 4 (`data`/Standard)
needs *new* Standard data clauses including one with a lapsed `expires_on` for the degraded-rung
assertion, and ladder 5 (`liab`/High) needs *new* High liability clauses including a lapsed one
for the `floor_unusable` assertion. That is new seed data, not an edit. And once D8(a)'s
clause-ID-prefix/severity trigger lands, those new IDs must themselves be prefix- and
middle-letter-coherent (`DP-S-…`, `LC-H-…`). The plan says "Seed the suite with genuine
Standard-severity clauses" in half a sentence. `Observed` + `Inferred`. Non-blocking, but A8's
estimate is wrong and A8 is already the most file-contended package.

---

## Missed issues

**M1 — The plan's own file-collision table is wrong, and it is the plan's stated scheduling
constraint.** §Candidate work packages says "Packages that touch the same file must not run
concurrently" and lists A5 (D4) as able to "run concurrently with A3 (different migration
files)". But A3's own remedy, §D1 step 4, adds
`cw.clause_version.derived_from_concession bigint references cw.concession(concession_id)` plus a
partial unique index on it — and `cw.clause_version` is declared in
**`0002_clause_registry.sql`**, which is A5's file. A3 and A5 collide on `0002`. Worse, the new
column is `references cw.concession`, a table created in `0003` — so under in-place migration
editing the column cannot be declared in `0002` at all and needs an `ALTER` in `0003`, which the
plan does not say. `Observed` (`0002:66-88` is the immutability trigger over `clause_version`;
`0003:107` creates `cw.concession`). **Blocking** — it invalidates the concurrency plan.

**M2 — D3's narrowing has no defined answer for the owner, and the answer determines whether the
suites still run.** I implemented mitigation 1 (GUC may only narrow, never widen) and probed
(`Observed`):

```
[owner claiming legal_admin]      {"current_user":"postgres","app_role":null}
[cw_viewer spoofing legal_admin]  {"current_user":"cw_viewer","app_role":null}   ← escalation closed
```

The escalation is closed — mitigation 1 works, and the plan is right that it is high
value-per-line. **But `app_role()` returns `null` for the owner**, and `cw.promote_concession()`
gates on `cw.app_role() is distinct from 'legal_admin'` *outside* RLS, so the owner can no longer
promote. Every `ladder.test.mjs` promotion test runs via `asRole()` (`ladder.test.mjs:41-44`),
which does `reset role` — i.e. as `postgres`. Tests at `:193-198`, `:199-210` and `:211-217` break.
They only survive if **A3 lands first** and converts them to `set role cw_legal_admin`. The plan's
critical path is `A1 → A2 → A6` in parallel with `A1 → A3 → …`; **A6 has no declared dependency on
A3**, so a valid schedule breaks the ladder suite. Beyond ordering, the plan must *decide* what
the owner maps to: `null` (breaks owner-run paths, arguably correct) or "whatever is claimed" (a
superuser bypass that is exactly the god-mode blind spot this contract exists to close, and which
would then need its own test). Silence is not an option. **Blocking.**

**M3 — A test that passes with the fix reverted: the D6 mutation.** §D6 proposes both (i) removing
`grant update on cw.concession to cw_legal_admin` (`0003:318`) and (ii) a `concession_immutable`
trigger, and lists the mutation "neuter the trigger body to `return new;` → expect *a recorded
concession cannot be rewritten*." With the grant already removed, `cw_legal_admin` gets
`permission denied for table concession` regardless of the trigger (I reproduced that exact error
in Claim 2). So the role-level test passes with the trigger fully neutered. Only the plan's
second, parenthetical assertion — "as owner it also raises" — can catch it, and only if the
`throws()` matcher checks the trigger's message rather than accepting any error. `ladder.test.mjs`
already learned this lesson once, in the comment at `:247-249` ("the right outcome for the wrong
reason"). The D6 test must assert the trigger's message text. `Observed` + `Inferred`.

**M4 — Nothing in the plan covers `actor_role` being self-asserted.** A2 correctly adds
`actor_role` to the hash so it cannot be *rewritten*. But `cw.audit()` (`0001:112-113`) writes
`cw.app_role()` — the same spoofable GUC — so the value that is now cryptographically committed
can still be a **lie at the moment of writing**. D3 mitigation 1 narrows it, which helps, and
that is the correct fix; the plan simply never connects the two. A2 shipping without A6 produces a
tamper-evident record of an unreliable claim, which is arguably worse than an obviously
unreliable one. Non-blocking, but it belongs in the ADR-0008 wording. `Inferred`.

**M5 — `cw.run_decision` CHECK is safe; the plan's R9 over-worries.** I confirmed the engine writes
no concessions (`grep -rn "concession" backend/engine/*.py` → no output) and that both existing
fixtures use `severity='High'` (`run-store.test.mjs:112-116`, `executed.test.mjs:64-65`), so
D8(c)'s `check (severity in ('Standard','High'))` lands green. The plan's R9 ("engine code that
writes `cw.concession` … may break") is unfounded for `cw.concession` — the engine does not touch
it. The `run_decision.category` label-vs-key question (R4) is real and the deferral is right.
`Observed`.

**M6 — Trigger ordering is unspecified in one place that matters.** Postgres fires same-timing
row triggers in **name** order. A5 inverts `cw.clause_version_immutable()` to an allow-list while
`cw.audit_clause_version()` (`0002:186-199`) is `after insert or update` — different timing, no
conflict, fine. But D7 adds a `BEFORE UPDATE` transition trigger on `cw.agreement` *and* an
`AFTER INSERT` `security definer` trigger on `cw.executed_agreement` that updates the parent. The
second fires the first. The plan's legal-transition list is "`negotiating → executed`,
`negotiating → terminated`, `executed → terminated`; nothing else" — which permits the
consequential update, so this happens to be safe. (`cw.executed_agreement`'s PK is
`agreement_id`, `0006:22`, so a second execution row cannot exist and `executed → executed` is
unreachable.) It works, but by luck rather than by statement; A7 should say so. `Observed`,
non-blocking.

---

## Blocking objections — must change before implementation

| # | Objection | Package |
|---|---|---|
| **B1** | Enabling RLS on `cw.audit_event` with a SELECT policy only makes **every audited write in the system fail** — reproduced: `new row violates row-level security policy for table "audit_event"` for both `cw_requester` and `cw_legal_admin`. A6 must add an `for insert` policy, or make `cw.audit()` `security definer`. | A6 |
| **B2** | Under that RLS, `cw.audit_verify()` reports **tampering at seq 3 on an honest database** for any scoped role, because it is `security invoker` and walks a filtered view. Must be `security definer set search_path = cw, pg_temp`, with a non-owner verify test. This is the plan's own headline defect, reintroduced by the plan. | A2 + A6 |
| **B3** | The `security definer` rationale is wrong: `cw.app_role()` is **not** a gate. Demonstrated — with `execute` granted to public, a `cw_legal_reviewer` who sets `cw.role='legal_admin'` successfully promoted quarantined vendor text. The `EXECUTE` grant is the gate; the `revoke all … from public` line is load-bearing (Postgres grants EXECUTE to PUBLIC by default). A3 must state this and add a **spoofing** test. | A3 |
| **B4** | The D1/D6 dichotomy is refuted. A column-level `grant update (promoted_to_clause)` plus a restrictive UPDATE policy fixes D1 and closes D6 with `security invoker` intact — built and verified. The plan must present this and justify its choice rather than assert there is only one branch. | A3 |
| **B5** | A2 and A4 invalidate the `find` strings of existing mutation entries `mutation-check.mjs:39-42` (`coalesce(prev,'') \|\| '\|' \|\| new.ts::text`) and `:56-58` (the floor trigger body). The harness treats a stale `find` as a failure and exits non-zero (`:127-133`, `:157-161`), so **S9 breaks**. The plan flags only the D9 DELETE-rule entries. | A2, A4 |
| **B6** | The file-collision table is wrong: A3 adds a column to `cw.clause_version`, which lives in `0002` — A5's file. A3 and A5 cannot run concurrently, and the new FK to `cw.concession` cannot be declared in `0002` at all under in-place editing. | A3/A5 scheduling |
| **B7** | A6 (narrowing `app_role()`) makes `app_role()` return `null` for the owner — verified — which breaks the three owner-run promotion tests unless A3 lands first. A6 must depend on A3, and the plan must **decide** what the owner maps to and test that decision. | A6 ordering |

---

## Non-blocking concerns

- **N1.** The plan's session-independence test can pass with the fix reverted on a UTC CI host, and
  `DateStyle='ISO, DMY'` does not trigger the alarm at all (verified). The test must set an
  explicit writer setting, assert the delta, and use a rendering-changing style
  (`SQL`/`Postgres`/`German`).
- **N2.** The height check protects only against an actor who cannot perform the attack —
  `postgres` is the sole holder of DELETE on `cw.audit_event` and also owns `cw.audit_head`.
  Keep it, but state the threat model as plainly as the plan does for checkpoints.
- **N3.** The advisory lock and the `for update` on `cw.audit_head` ship with **no test coverage of
  any kind**. R1 explains why; the plan should say so as a disclosure, not leave it inferred.
- **N4.** The D6 test as specified passes with the immutability trigger neutered, because the
  removed grant denies first. Assert the trigger's message text, not merely that it throws
  (`ladder.test.mjs:247-249` already documents this failure mode).
- **N5.** `severity not null` on `cw.concession` breaks six `insert into cw.concession` statements
  across five tests in `ladder.test.mjs`, not just the two D8 fixtures. Add to the disclosure list.
- **N6.** The D8 fixture correction needs **new seed clauses** (there is no Standard `data` clause
  and no High `liab` clause), not ID swaps — and those IDs must satisfy D8(a)'s own prefix trigger.
- **N7.** D5's "fail loudly when no ladder exists" ships as prose with no DDL, and does not say
  whether it also fires on the vendor-text path (which needs no floor). Specify it, as the plan
  did for the hash scheme.
- **N8.** D2's re-anchoring question resolves to "there is nothing to re-anchor — every database is
  built from migrations". Say it in the D2 remedy rather than leaving it as risk row R2.
- **N9.** A7's trigger ordering on `cw.agreement` is safe, but by coincidence. State it.
- **N10.** R9 is unfounded for `cw.concession`: the engine does not write it (verified). Narrow R9
  to `run_decision`.

---

## What the plan gets right

Stated plainly, because false objections cost more than missed ones:

1. **The timestamp defect is real, is the biggest thing in the slice, and the review missed it.**
   I reproduced it three ways. Every tamper-evidence claim in the product is currently
   unsupported, and the plan is right to reorder A2 ahead of the proposal's D1-first sequence.
2. **The canonical pre-image is correctly designed.** Epoch microseconds are session-invariant
   (verified); length-prefixing closes the collision the plan proved; `jsonb::text` is
   key-ordered (verified); `seq` is available in a `BEFORE INSERT` trigger (verified); and
   `actor_role` is covered.
3. **The `nulls not distinct` fork guard is correct and I could not break it.** Genesis,
   truncate-and-reseed, and same-instant duplicate content all behave. Refusing to add a mutation
   entry that is guaranteed to MISS is the right call and the right kind of honesty.
4. **The `cw.audit_event` RLS hole is real, HIGH, and the review missed it.** Reproduced: a
   requester read another buyer's `concession_recorded` payload. The read-scoping design is right
   and the auditor branch works (verified).
5. **Every D1/D4/D5/D6/D7/D8/D9 finding I spot-checked reproduced exactly as described**, including
   the arbitrary floor pick, the fail-open no-ladder path, the two incoherent ladder fixtures, and
   the privilege dump showing no `cw_*` role holds TRUNCATE.
6. **The correction on the review's root cause is right and material.** The suites do use
   `set role` — on reads. It is *writes* that run as owner. Tightening S3 to name writes is the
   correct contract amendment.
7. **The `security invoker` marker at `0003:187` really is the mechanism**, and the plan found it
   by running as the real role rather than by reading.
8. **D9's TRUNCATE de-escalation is honest.** No `cw_*` role holds TRUNCATE (verified in the
   privilege dump); calling it a documentation gap rather than an exploitable hole is right, and
   arguing for a written threat-model statement alongside the trigger is the correct instinct.
9. **`set search_path = cw, pg_temp` is specified on the definer function** (verified to take
   effect), matching the existing precedent at `0003:285`. The plan did not make the classic
   `security definer` mistake.
10. **Ruling on the fixture question: the plan is right.** Correcting incidental fixture data so a
    new constraint passes, with the assertions untouched, is a disclosure and not a weakening
    under OC §5 constraint 7.
