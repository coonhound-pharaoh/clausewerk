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
await test('deleting a version is a no-op, not a deletion', async () => {
  await db.exec(`delete from cw.clause_version where clause_id='DP-H-014' and version=1`);
  const r = await one(`select count(*)::int n from cw.clause_version where clause_id='DP-H-014'`);
  eq(r.n, 2, 'versions must survive a delete attempt');
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

// ── ADR-0009 · four-state model and supersession ────────────────────────────
console.log('\nsupersession and state (ADR-0009)');
await test('superseding marks the predecessor superseded, not retired', async () => {
  await db.exec(`insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver,predecessor_disposition)
    values ('DP-H-014',1,2,'Added SCC module for post-2026 transfers','R. Vance','retire_now')`);
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
