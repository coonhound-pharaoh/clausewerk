// Clause registry tests.
//
// Runs against PGlite — real PostgreSQL compiled to WebAssembly — so the DDL,
// constraints, triggers, views and row-level security below are genuinely
// executed rather than mocked. No Docker required.
//
//   node db/test/registry.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roleHelpers } from './roles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Overridable so mutation-check.mjs can point the same suite at a deliberately
// broken copy of the schema and confirm these tests actually fail.
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');

let pass = 0, fail = 0;
const failures = [];

async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}
async function throws(fn, match, msg) {
  let threw = false, err;
  try { await fn(); } catch (e) { threw = true; err = e; }
  assert(threw, msg || 'expected an error, got none');
  if (match) assert(String(err.message).includes(match),
    `expected error containing "${match}", got "${err.message}"`);
}

const db = await PGlite.create();

// ── Apply migrations ────────────────────────────────────────────────────────
console.log('\nmigrations');
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
for (const f of files) {
  await test(`apply ${f}`, async () => {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  });
}

const asRole = async (role, actor = 'test@clausewerk') => {
  await db.exec(`reset role;
    select set_config('cw.role', '${role}', false);
    select set_config('cw.actor', '${actor}', false);`);
};
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const { queryAs, mustWrite } = roleHelpers(db);

await asRole('legal_admin');

// ── Seed ────────────────────────────────────────────────────────────────────
console.log('\nseed');
await test('categories and clauses insert', async () => {
  await db.exec(`
    insert into cw.category (key,label,short) values
      ('data','Data Privacy','DP'),
      ('accept','Acceptance','AC'),
      ('corr','Anti-Corruption','AB'),
      ('conf','Confidentiality','CF'),
      ('liab','Liability Cap','LC');
    insert into cw.clause (clause_id,category_key,severity,always_include,framework_section) values
      ('DP-H-014','data','High',false,null),
      ('DP-S-003','data','Standard',false,null),
      ('DP-H-021','data','High',false,null),
      ('LC-S-009','liab','Standard',false,null),
      ('CF-S-001','conf','Standard',false,null),
      ('AB-B-011','corr','Baseline',true,'9.2');`);
});

// ── finding #4 · short codes are unique by constraint ───────────────────────
console.log('\ncategory short codes (finding #4)');
await test('a duplicate short code is rejected', async () => {
  await throws(
    () => db.exec(`insert into cw.category (key,label,short) values ('accept2','Acceptance Two','AB')`),
    'duplicate key', 'AC/AB collision must be impossible at the schema level');
});
await test('short code format is enforced', async () => {
  await throws(() => db.exec(`insert into cw.category (key,label,short) values ('x','X','abc')`));
});

// ── WP-23 · the ID must agree with the category (finding D8) ────────────────
console.log('\nclause ids agree with their category (WP-23, finding D8)');

await test('a clause id whose prefix disagrees with its category is refused', async () => {
  // cw.category.short is documented as "the two-letter code embedded in clause
  // IDs" and is UNIQUE so that "a clause ID always identifies exactly one
  // category". Nothing checked it. Everyone in this system reads the ID rather
  // than the foreign key, so a clause filed as LC-* under Data Privacy shows up
  // in a Liability search by eye and a Data Privacy report by query — two
  // answers, nobody at fault.
  await throws(
    () => db.exec(`insert into cw.clause (clause_id,category_key,severity)
                   values ('LC-H-777','data','High')`),
    'does not agree with its category',
    'a clause id that lies about its category must not be storable');
});

await test('moving a clause to a disagreeing category is refused too', async () => {
  // The same defect arriving later. category_key is an ordinary column, so
  // without an UPDATE branch the constraint would only hold at birth.
  await throws(
    () => db.exec(`update cw.clause set category_key='liab' where clause_id='DP-H-014'`),
    'does not agree with its category');
  const r = await one(`select category_key from cw.clause where clause_id='DP-H-014'`);
  eq(r.category_key, 'data', 'and the clause stayed where it was');
});

await test('a clause id that agrees with its category still inserts', async () => {
  // The positive control. A constraint that refuses everything is not a
  // constraint, and the seed above would not prove it because it predates the
  // trigger's own INSERT branch being exercised deliberately.
  await db.exec(`insert into cw.clause (clause_id,category_key,severity)
                 values ('CF-S-777','conf','Standard')`);
  const r = await one(`select category_key from cw.clause where clause_id='CF-S-777'`);
  eq(r.category_key, 'conf');
});

// ── WP-23b · a conflict rule must actually ask something ────────────────────
console.log('\nconflict rules must ask something (WP-23b)');

const emptyRule = (id, predicate) => db.exec(`insert into cw.conflict_rule
  (rule_id,version,name,severity,title,detail,predicate,approved_by,effective_on)
  values ('${id}',1,'empty_${id}','High','Asks nothing','No predicate content.',
          '${predicate}','R. Vance','2026-01-01')`);

await test('a rule that asks nothing is refused', async () => {
  // The hole WP-20 handed over. The "at least one primitive" clause required a
  // predicate to USE a primitive, never to SAY anything with it. An empty
  // all_present loops zero times, finds no violation, and the engine returns an
  // empty tuple rather than None — which COUNTS AS THE RULE FIRING. A rule that
  // asks nothing therefore raises a finding on every contract in the system.
  await throws(() => emptyRule('NUL-001', '{"all_present": []}'),
    'predicate_grammar', 'an empty tag list must not be publishable');
  await throws(() => emptyRule('NUL-002', '{"none_present": []}'),
    'predicate_grammar', 'the same hole from the other side');
  await throws(() => emptyRule('NUL-003', '{"conflicting_values": ""}'),
    'predicate_grammar', 'an empty namespace is falsy and is skipped, so it fires vacuously');
  const r = await one(`select count(*)::int n from cw.conflict_rule
                       where rule_id like 'NUL-%'`);
  eq(r.n, 0, 'none of the three reached the table');
});

await test('a legitimate rule still publishes', async () => {
  // The positive control demanded by the handover. A one-tag all_present rule
  // is the smallest legal predicate there is, and it must survive.
  await db.exec(`insert into cw.conflict_rule
    (rule_id,version,name,severity,title,detail,predicate,approved_by,effective_on)
    values ('REG-001',1,'regulated_no_cyber','High','Regulated data, no cyber cover',
            'Regulated data is in scope and no cyber cover is present.',
            '{"all_present":["data:regulated"],"none_present":["insurance:cyber"]}',
            'R. Vance','2026-01-01')`);
  const r = await one(`select predicate from cw.conflict_rule where rule_id='REG-001'`);
  assert(r, 'a rule that asks a real question is unaffected');
});

await test('a conflict rule cannot be deleted', async () => {
  // WP-25c (settled decision S0-3). This was `do instead nothing`, so a caller
  // who deleted a published rule by mistake was told it had worked. Findings
  // cite the rule version that raised them, so a rule has to stay resolvable.
  await throws(() => db.exec(`delete from cw.conflict_rule where rule_id='REG-001'`),
    'cannot be deleted', 'deleting a published rule must be refused, not ignored');
  const r = await one(`select count(*)::int n from cw.conflict_rule where rule_id='REG-001'`);
  eq(r.n, 1, 'and the rule is still there');
});

// ── ADR-0006 · versions are immutable ───────────────────────────────────────
console.log('\nversion immutability (ADR-0006)');
await test('versions insert', async () => {
  await db.exec(`
    insert into cw.clause_version
      (clause_id,version,title,body,rationale,citations,reviewer,approved_on,expires_on) values
      ('DP-H-014',1,'GDPR v1','24-hour breach notice.','GDPR Art 33',
       array['GDPR Art. 28-33'],'A. Reyes','2024-01-08','2026-07-15'),
      ('DP-H-014',2,'GDPR v2','24-hour breach notice, with SCC module.','Updated for 2026 transfers',
       array['GDPR Art. 28-33'],'A. Reyes','2026-03-11','2028-03-11'),
      ('DP-S-003',1,'Baseline privacy','Reasonable technical measures.','Baseline',
       array['Policy-DP-003'],'A. Reyes','2023-11-12','2025-06-30'),
      ('LC-S-009',1,'Cap at fees','Liability capped at fees paid.','Standard cap',
       array['Policy-LC-009'],'M. Okafor','2025-01-05','2027-01-05'),
      -- A spare, un-superseded pair reserved for the negative tests below, so
      -- they fail on the rule under test rather than on a missing foreign key.
      ('CF-S-001',1,'Confidentiality v1','Recipient shall not disclose.','Baseline',
       array['Policy-CF-001'],'M. Okafor','2025-02-01','2027-02-01'),
      ('CF-S-001',2,'Confidentiality v2','Recipient shall not disclose; 5-year tail.','Extended tail',
       array['Policy-CF-001'],'M. Okafor','2026-02-01','2028-02-01');`);
});
await test('a clause tag records the authenticated Legal author', async () => {
  const r = await queryAs('legal_admin', `
    insert into cw.clause_tag (clause_id,version,tag,tagged_by)
    values ('DP-H-014',1,'audit:cycle48','forged-tagger@clausewerk')
    returning tagged_by`, [], 'test@clausewerk');
  eq(r[0].tagged_by, 'test@clausewerk',
     'policy-driving tag provenance must come from the governed session');
});
await test('editing clause body is refused', async () => {
  await throws(
    () => db.exec(`update cw.clause_version set body='tampered' where clause_id='DP-H-014' and version=1`),
    'immutable', 'contract language must never be edited in place');
});
await test('editing approval dates is refused', async () => {
  await throws(
    () => db.exec(`update cw.clause_version set approved_on='2020-01-01' where clause_id='DP-H-014' and version=1`),
    'immutable');
});
await test('deleting a version is refused, not silently ignored', async () => {
  // WP-25c (settled decision S0-3). This was `do instead nothing`, and the test
  // asserted only that the row survived. The row surviving is necessary but not
  // sufficient: a caller who deletes a clause version by mistake was told the
  // delete had worked. Both facts are now asserted — the raise AND the survival.
  await throws(
    () => db.exec(`delete from cw.clause_version where clause_id='DP-H-014' and version=1`),
    'cannot be deleted');
  const r = await one(`select count(*)::int n from cw.clause_version where clause_id='DP-H-014'`);
  eq(r.n, 2, 'versions must survive a delete attempt');
});

await test('a clause version cannot be truncated around the guard', async () => {
  // TRUNCATE fires no row trigger and obeys no ON DELETE rule, so the library
  // was erasable in one statement whatever the trigger above said (WP-25b).
  await throws(() => db.exec(`truncate cw.clause_version cascade`),
    'cannot be truncated', 'truncate must not be the way around immutability');
  const r = await one(`select count(*)::int n from cw.clause_version where clause_id='DP-H-014'`);
  eq(r.n, 2, 'the library survives a truncate attempt');
});
await test('retiring IS permitted (the one allowed mutation)', async () => {
  await db.exec(`insert into cw.clause (clause_id,category_key,severity) values ('DP-H-021','data','High')
                 on conflict do nothing;
                 insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on,retired,retired_reason)
                 values ('DP-H-021',1,'HIPAA','BAA required.','2024-02-01','2027-02-01',false,null);
                 update cw.clause_version set retired=true, retired_reason='Policy withdrawn', retired_on=current_date
                 where clause_id='DP-H-021' and version=1;`);
  const r = await one(`select state, selectable from cw.clause_version_state
                       where clause_id='DP-H-021' and version=1`);
  eq(r.state, 'retired'); eq(r.selectable, false);
});
await test('retiring without a reason is refused', async () => {
  await throws(
    () => db.exec(`update cw.clause_version set retired=true where clause_id='LC-S-009' and version=1`),
    'retired_needs_reason');
});

// ── WP-05 · the immutability holes (finding D4) ─────────────────────────────
// Three things were editable on approved wording that should never have been.
console.log('\nimmutability holes closed (WP-05, finding D4)');

await test('the named reviewer cannot be rewritten', async () => {
  // The reviewer is the named human standing behind this wording. It is the
  // last link in the provenance chain an auditor walks, and it was the one
  // field in that chain anyone could quietly change after approval.
  await throws(
    () => db.exec(`update cw.clause_version set reviewer='Someone Else'
                   where clause_id='DP-H-014' and version=2`),
    'immutable', 'who approved this language must not be rewritable');
  const r = await one(`select reviewer from cw.clause_version
                       where clause_id='DP-H-014' and version=2`);
  eq(r.reviewer, 'A. Reyes', 'and the original name is still there');
});

await test('the reviewer cannot be rewritten by a real legal_admin either', async () => {
  // Run as the actual database role that holds UPDATE on this table — the most
  // privileged role there is here. A trigger that only stops the test harness
  // is not a protection.
  let threw = false, msg = '';
  try {
    await queryAs('legal_admin',
      `update cw.clause_version set reviewer='Someone Else'
       where clause_id='DP-H-014' and version=2`);
  } catch (e) { threw = true; msg = e.message; }
  assert(threw && msg.includes('immutable'),
    `cw_legal_admin must be refused by the trigger, got: ${msg || 'no error'}`);
  // roles.mjs claims an actor of its own; put the suite's actor back so the
  // audit assertions further down still describe this suite, not the helper.
  await asRole('legal_admin');
});

await test('a retired clause cannot be un-retired', async () => {
  // Withdrawing wording is a deliberate legal act. Putting it back is a NEW
  // approval and must go through the same gate — not an UPDATE that silently
  // returns withdrawn language to the selectable pool.
  await db.exec(`
    insert into cw.clause (clause_id,category_key,severity) values ('LC-S-020','liab','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on,
                                   retired,retired_reason)
    values ('LC-S-020',1,'Withdrawn cap','Capped at 10x fees.','2025-01-01','2028-01-01',
            true,'Commercially unacceptable');`);
  await throws(
    () => db.exec(`update cw.clause_version set retired=false
                   where clause_id='LC-S-020' and version=1`),
    'un-retiring it is not an edit', 'retirement is a one-way door');
  const r = await one(`select selectable from cw.clause_version_state
                       where clause_id='LC-S-020' and version=1`);
  eq(r.selectable, false, 'and it is still out of the pool');
});

await test('un-retiring leaves a record even if the guard is bypassed', async () => {
  // The audit hook used to fire only on the way OUT, so language coming BACK
  // left no trace at all. It now records both directions.
  //
  // The immutability guard above refuses this change before the audit hook can
  // ever run, so the only way to prove the hook works is to take the guard away
  // — from below the application, exactly as an attacker with database access
  // would. That is the point of a second line of defence.
  await db.exec(`alter table cw.clause_version disable trigger clause_version_no_edit;
                 update cw.clause_version set retired=false
                 where clause_id='LC-S-020' and version=1;
                 update cw.clause_version set retired=true,
                   retired_reason='Commercially unacceptable'
                 where clause_id='LC-S-020' and version=1;
                 alter table cw.clause_version enable trigger clause_version_no_edit;`);
  const e = await one(`select subject from cw.audit_event
                       where event_type='clause_unretired' order by seq desc limit 1`);
  assert(e, 'bringing withdrawn language back must be recorded, not silent');
  eq(e.subject, 'LC-S-020@v1');
});

// ── WP-05 · conflict rules cannot have their history rewritten ──────────────
console.log('\nconflict rule history is fixed (WP-05, finding D4)');

await test('a rule publishes', async () => {
  const published = await queryAs('legal_admin', `insert into cw.conflict_rule
    (rule_id,version,name,severity,title,detail,predicate,approved_by,effective_on)
    values ('JUR-001',1,'jurisdiction_split','High','Two governing laws',
            'The decision set names more than one governing law.',
            '{"conflicting_values":"jurisdiction"}','R. Vance','2026-01-01')
    returning approved_by`, [], 'test@clausewerk');
  eq(published[0].approved_by, 'test@clausewerk',
     'immutable publication provenance must name the authenticated Legal admin');
  const r = await one(
    `select effective_on, approved_by from cw.conflict_rule where rule_id='JUR-001'`);
  assert(r, 'the rule exists');
});

await test("a rule's effective date cannot be moved retroactively", async () => {
  // effective_on decides which rules were in force on any given day. Every
  // conflict finding cites a rule version precisely so that question has one
  // fixed answer. A movable date makes the citation worthless — it lets someone
  // arrange, after the fact, for a contract to have been checked against rules
  // that were not actually in force when it was signed.
  await throws(
    () => db.exec(`update cw.conflict_rule set effective_on='2020-01-01'
                   where rule_id='JUR-001' and version=1`),
    'immutable', 'which rules were in force is history, not a setting');
  const r = await one(`select (effective_on = date '2026-01-01') as unchanged
                       from cw.conflict_rule where rule_id='JUR-001' and version=1`);
  eq(r.unchanged, true, 'the original date stands');
});

await test('a retired conflict rule cannot be brought back by an edit', async () => {
  await db.exec(`update cw.conflict_rule set retired=true, retired_reason='Replaced by policy'
                 where rule_id='JUR-001' and version=1`);
  await throws(
    () => db.exec(`update cw.conflict_rule set retired=false
                   where rule_id='JUR-001' and version=1`),
    'bringing it back into force is a new publication');
  const r = await rows(`select rule_id from cw.active_conflict_rule where rule_id='JUR-001'`);
  eq(r.length, 0, 'and it is still out of force');
});

// ── ADR-0009 · four-state model and supersession ────────────────────────────
console.log('\nsupersession and state (ADR-0009)');
await test('superseding marks the predecessor superseded, not retired', async () => {
  const inserted = await queryAs('legal_admin', `insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver,predecessor_disposition)
    values ('DP-H-014',1,2,'Added SCC module for post-2026 transfers',
            'forged-approver@clausewerk','retire_now')
    returning approver`, [], 'test@clausewerk');
  eq(inserted[0].approver, 'test@clausewerk',
     'supersession attribution must name the authenticated Legal actor');
  const p = await one(`select state, selectable, superseded_reason from cw.clause_version_state
                       where clause_id='DP-H-014' and version=1`);
  eq(p.state, 'superseded', 'replaced-by-better is distinct from withdrawn');
  eq(p.selectable, false, 'retire_now stops selection immediately');
  assert(p.superseded_reason.includes('SCC'), 'the reason must travel with the state');
  const s = await one(`select state, selectable from cw.clause_version_state
                       where clause_id='DP-H-014' and version=2`);
  eq(s.state, 'active'); eq(s.selectable, true);
});
await test('a version can be superseded at most once', async () => {
  await throws(() => db.exec(`insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver)
    values ('DP-H-014',1,2,'again','R. Vance')`), 'duplicate key');
});
await test('successor must be newer than predecessor', async () => {
  await throws(() => db.exec(`insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver)
    values ('DP-H-014',2,1,'backwards','R. Vance')`), 'successor_is_newer');
});
await test('supersession requires a reason', async () => {
  // CF-S-001 1→2 is otherwise entirely valid, so this can only fail on the
  // null reason — not on a missing version.
  await throws(() => db.exec(`insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver)
    values ('CF-S-001',1,2,null,'R. Vance')`), 'not-null');
});
await test('run_off keeps the predecessor selectable until its own expiry', async () => {
  await db.exec(`
    insert into cw.clause (clause_id,category_key,severity) values ('LC-S-010','liab','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
      ('LC-S-010',1,'Cap v1','Capped at fees.','2025-01-01','2027-12-31'),
      ('LC-S-010',2,'Cap v2','Capped at 2x fees.','2026-01-01','2028-01-01');
    insert into cw.supersession
      (clause_id,predecessor_version,successor_version,reason,approver,predecessor_disposition)
      values ('LC-S-010',1,2,'Raised cap to 2x','R. Vance','run_off');`);
  const p = await one(`select state, selectable from cw.clause_version_state
                       where clause_id='LC-S-010' and version=1`);
  eq(p.state, 'superseded', 'still labelled superseded');
  eq(p.selectable, true, 'but run-off keeps it usable until it expires');
});

// ── finding #1 · expired language is not selectable ─────────────────────────
console.log('\nexpiry (findings #1 and #8)');
await test('an expired version is excluded from the selectable pool', async () => {
  const r = await one(`select state, selectable, expired from cw.clause_version_state
                       where clause_id='DP-S-003' and version=1`);   // expires 2025-06-30
  eq(r.expired, true); eq(r.state, 'expired'); eq(r.selectable, false);
});
await test('nothing retired or expired leaks into selectable_clause', async () => {
  const r = await rows(`select clause_id, version from cw.selectable_clause
                        where clause_id in ('DP-S-003','DP-H-021','DP-H-014') and version=1`);
  eq(r.length, 0, 'the kill switch must hold for manifest-driven clauses too');
});

// ── finding #8 · unprovenanced ≠ expired ────────────────────────────────────
await test('a clause with no dates is flagged, not expired', async () => {
  await db.exec(`
    insert into cw.clause_version (clause_id,version,title,body) values
      ('AB-B-011',1,'Anti-corruption','FCPA and UK Bribery Act compliance.')`);
  const r = await one(`select state, selectable, expired, provenance_gap, days_to_expiry
                       from cw.clause_version_state where clause_id='AB-B-011'`);
  eq(r.expired, false, 'no date cannot mean expired — that birth-expired 54 clauses');
  eq(r.provenance_gap, true, 'it is a data-quality problem, and must be visible as one');
  eq(r.state, 'active');
  eq(r.selectable, true);
  eq(r.days_to_expiry, null);
});
await test('expiry cannot precede approval', async () => {
  await throws(() => db.exec(`insert into cw.clause_version
    (clause_id,version,title,body,approved_on,expires_on)
    values ('LC-S-009',2,'x','y','2026-01-01','2025-01-01')`), 'expiry_after_approval');
});
await test('coverage gaps are computed', async () => {
  const gaps = await rows(`select category_key, severity from cw.coverage_gap order by 1,2`);
  const has = (c, s) => gaps.some(g => g.category_key === c && g.severity === s);
  assert(has('accept', 'High'), 'Acceptance/High has no clause at all');
  assert(has('data', 'Standard'), 'Data Privacy/Standard exists but has expired');
  assert(!has('liab', 'Standard'), 'Liability Cap/Standard is covered');
});

// ── Audit log ───────────────────────────────────────────────────────────────
console.log('\naudit log (ADR-0008)');
await test('governed acts were recorded automatically', async () => {
  const r = await rows(`select event_type, subject from cw.audit_event order by seq`);
  assert(r.some(e => e.event_type === 'clause_version_created'), 'creation must be recorded');
  assert(r.some(e => e.event_type === 'clause_retired'), 'retirement must be recorded');
  const sup = r.find(e => e.event_type === 'clause_superseded');
  assert(sup, 'supersession must be recorded');
  eq(sup.subject, 'DP-H-014@v1');
});
await test('the actor and role are captured on every event', async () => {
  const r = await one(`select count(*)::int n from cw.audit_event
                       where actor is null or actor_kind is null`);
  eq(r.n, 0);
  // WP-04 / settled decision U3: cw.app_role() now comes from the connection's
  // real database role, and the owner deliberately holds none. This assertion
  // therefore had to move onto a governed write made by an actual
  // cw_legal_admin — which is the stronger test anyway: it proves the recorded
  // role is the one the connection genuinely holds, not one it claimed.
  await mustWrite('legal_admin', `insert into cw.clause
      (clause_id,category_key,severity) values ('DP-H-077','data','High')`,
    [], 'test@clausewerk');
  await mustWrite('legal_admin', `insert into cw.clause_version
      (clause_id,version,title,body,rationale,citations,reviewer,approved_on,expires_on)
    values ('DP-H-077',1,'Transfer impact','Recipient shall complete a transfer assessment.',
            'Baseline',array['Policy-DP-077'],'A. Reyes','2026-01-05','2028-01-05')`,
    [], 'test@clausewerk');
  await asRole('legal_admin');
  const a = await one(`select actor, actor_role from cw.audit_event order by seq desc limit 1`);
  eq(a.actor, 'test@clausewerk'); eq(a.actor_role, 'legal_admin');
});
await test('machine acts are recorded as controller, never as a person', async () => {
  await db.exec(`select cw.audit('auto_approve','DP-H-014@v2',
                   '{"score":0.94,"threshold":0.9}'::jsonb,'controller')`);
  const r = await one(`select actor_kind, event_type from cw.audit_event order by seq desc limit 1`);
  eq(r.actor_kind, 'controller');
});
await test('the hash chain verifies', async () => {
  const r = await one(`select cw.audit_verify() as broken`);
  eq(r.broken, null, 'an intact chain must report no break');
});
await test('tampering with a past event is detected', async () => {
  // Simulated attack at the database level, bypassing the revoked privilege.
  await db.exec(`reset role;
    update cw.audit_event set payload='{"score":0.99}'::jsonb
    where event_type='auto_approve'`);
  const r = await one(`select cw.audit_verify() as broken`);
  assert(r.broken !== null, 'an edited event must break the chain');
  await asRole('legal_admin');
});

// ── Row-level security ──────────────────────────────────────────────────────
console.log('\nrow-level security (ADR-0008)');
await test('a viewer can read clause text', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  const r = await one(`select count(*)::int n from cw.clause_version`);
  assert(r.n > 0, 'viewers must be able to read');
});
await test('a viewer cannot write', async () => {
  await throws(() => db.exec(
    `insert into cw.clause (clause_id,category_key,severity) values ('DP-H-099','data','High')`));
});
await test('a requester cannot change the library', async () => {
  await db.exec(`reset role; select set_config('cw.role','requester',false); set role cw_requester;`);
  await throws(() => db.exec(
    `insert into cw.clause (clause_id,category_key,severity) values ('DP-H-098','data','High')`));
});
await test('a legal reviewer cannot supersede — only legal admin can', async () => {
  await db.exec(`reset role; select set_config('cw.role','legal_reviewer',false); set role cw_legal_reviewer;`);
  // CF-S-001 1→2 is a wholly valid supersession. The only thing that may stop
  // it is authority, so this test cannot pass for an unrelated reason.
  await throws(() => db.exec(`insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver)
    values ('CF-S-001',1,2,'Extended confidentiality tail','R. Vance')`),
    'permission denied');
});
await test('nobody can edit or delete the audit log', async () => {
  for (const role of ['cw_legal_admin', 'cw_auditor', 'cw_requester']) {
    await db.exec(`reset role; set role ${role};`);
    await throws(() => db.exec(`update cw.audit_event set actor='someone else' where seq=1`),
      'permission denied', `${role} must not be able to edit history`);
    await throws(() => db.exec(`delete from cw.audit_event where seq=1`),
      'permission denied', `${role} must not be able to delete history`);
  }
});
await test('a viewer cannot read the audit log at all', async () => {
  await db.exec(`reset role; set role cw_viewer;`);
  await throws(() => db.exec(`select * from cw.audit_event limit 1`), 'permission denied');
});
await test('an auditor can read the audit log', async () => {
  await db.exec(`reset role; set role cw_auditor;`);
  const r = await one(`select count(*)::int n from cw.audit_event`);
  assert(r.n > 0);
});
await db.exec(`reset role;`);

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
