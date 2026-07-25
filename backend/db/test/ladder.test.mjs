// Fallback ladder and concession tests (CLA §3–§6, ADR-0009).
//
// The guarantee this suite exists to defend: accepted vendor wording can never
// become approved language except by a deliberate Legal admin promotion.
//
//   node db/test/ladder.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}
async function throws(fn, match, msg) {
  let threw = false, err;
  try { await fn(); } catch (e) { threw = true; err = e; }
  assert(threw, msg || 'expected an error, got none');
  if (match) assert(String(err.message).includes(match),
    `expected error containing "${match}", got "${err.message}"`);
}

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const rows = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await rows(s, p))[0];
const asRole = async (role, actor = 'legal@clausewerk') =>
  db.exec(`reset role;
    select set_config('cw.role','${role}',false);
    select set_config('cw.actor','${actor}',false);`);

await asRole('legal_admin');

console.log('\nseed');
await test('library and ladder seed', async () => {
  await db.exec(`
    insert into cw.category (key,label,short) values
      ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');
    insert into cw.clause (clause_id,category_key,severity) values
      ('DP-H-014','data','High'), ('DP-H-052','data','High'),
      ('DP-H-061','data','High'), ('DP-H-070','data','High'),
      ('LC-S-009','liab','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
      ('DP-H-014',1,'24h notice','Notify within 24 hours.','2025-01-01','2027-01-01'),
      ('DP-H-052',1,'48h notice','Notify within 48 hours.','2025-01-01','2027-01-01'),
      ('DP-H-061',1,'72h notice','Notify within 72 hours.','2025-01-01','2027-01-01'),
      ('DP-H-070',1,'Lapsed','Notify within 96 hours.','2023-01-01','2024-06-01'),
      ('LC-S-009',1,'Cap at fees','Capped at fees paid.','2025-01-01','2027-01-01');
    insert into cw.agreement (agreement_id,counterparty,sector,value_usd,requester) values
      ('AG-001','Northwind Analytics','tech',240000,'buyer@clausewerk'),
      ('AG-002','Contoso Health','health',900000,'buyer@clausewerk'),
      ('AG-003','Fabrikam','tech',120000,'other@clausewerk');`);
});

console.log('\nladder structure (CLA §3)');
await test('a ladder with contiguous rungs and a floor is accepted', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (1,'data','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (1,0,'DP-H-014',1,false),
      (1,1,'DP-H-052',1,false),
      (1,2,'DP-H-061',1,true);`);
  const h = await one(`select status, rungs, has_floor from cw.ladder_health where ladder_id=1`);
  eq(h.status, 'intact'); eq(h.rungs, 3); eq(h.has_floor, true);
});
await test('rungs must be contiguous from 0', async () => {
  await throws(() => db.exec(`
    begin;
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (2,'liab','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (2,0,'LC-S-009',1,true), (2,5,'DP-H-052',1,false);
    commit;`), 'contiguous');
  await db.exec(`rollback;`).catch(() => {});
});
await test('a ladder cannot have two floors', async () => {
  await throws(() => db.exec(
    `update cw.ladder_rung set is_floor=true where ladder_id=1 and rung=0`), 'ladder_one_floor');
});
await test('a floorless ladder is reported as a configuration error', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (3,'liab','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (3,0,'LC-S-009',1,false);`);
  const h = await one(`select status from cw.ladder_health where ladder_id=3`);
  eq(h.status, 'floorless', 'a ladder with no floor must not look healthy');
});

console.log('\nladder health — expiry does NOT silently collapse (CLA §11 q4)');
await test('an expired rung degrades the ladder rather than vanishing', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (4,'data','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (4,0,'DP-H-014',1,false),
      (4,1,'DP-H-070',1,false),   -- expired 2024-06-01
      (4,2,'DP-H-061',1,true);`);
  const h = await one(`select status, rungs, unusable_rungs from cw.ladder_health where ladder_id=4`);
  eq(h.rungs, 3, 'the rung stays visible — collapse is not automatic');
  eq(h.unusable_rungs, 1);
  eq(h.status, 'degraded', 'the condition must be surfaced, not silently resolved');
  const r = await one(`select selectable, state from cw.ladder_rung_state
                       where ladder_id=4 and rung=1`);
  eq(r.selectable, false); eq(r.state, 'expired');
});
await test('an unusable floor is reported distinctly from a degraded rung', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (5,'liab','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (5,0,'DP-H-014',1,false), (5,1,'DP-H-070',1,true);`);
  const h = await one(`select status from cw.ladder_health where ladder_id=5`);
  eq(h.status, 'floor_unusable', 'losing the floor is worse than losing a middle rung');
});

console.log('\nconcessions (CLA §4, ADR-0009)');
await test('descending to a pre-approved rung needs no override', async () => {
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-001','data','DP-H-014',1,1,'Vendor could not meet 24h','buyer@clausewerk')`);
  const c = await one(`select conceded_rung, vendor_text from cw.concession
                       where agreement_id='AG-001'`);
  eq(c.conceded_rung, 1); eq(c.vendor_text, null);
});
await test('conceding below the floor without an override is refused', async () => {
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-001','data','DP-H-014',1,3,'Vendor pushed hard','buyer@clausewerk')`),
    'below the floor', 'the floor must be absolute without a recorded override');
});
await test('below the floor WITH a recorded override is allowed', async () => {
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,
     override_ref,reason,approved_by)
    values ('AG-002','data','DP-H-014',1,3,'OVR-2026-0042','Regulatory necessity','legal@clausewerk')`);
  const c = await one(`select override_ref from cw.concession where agreement_id='AG-002'`);
  eq(c.override_ref, 'OVR-2026-0042');
});
await test('accepting vendor language without an override is refused', async () => {
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,'Notify when convenient.','pressure','buyer@clausewerk')`),
    'requires a recorded override');
});
await test('a concession cannot be both a rung and vendor text', async () => {
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,1,'text','OVR-1','x','y')`), 'one_outcome');
});

console.log('\nquarantine — the central guarantee');
await test('vendor text is recorded', async () => {
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,
            'Vendor shall notify Customer within five (5) business days.',
            'OVR-2026-0043','Vendor would not sign otherwise','legal@clausewerk')`);
  const c = await one(`select vendor_text from cw.concession where agreement_id='AG-003'`);
  assert(c.vendor_text.includes('five (5) business days'));
});
await test('vendor text NEVER appears in the selectable pool', async () => {
  const leak = await one(`select count(*)::int n from cw.selectable_clause
    where body in (select vendor_text from cw.concession where vendor_text is not null)`);
  eq(leak.n, 0, 'conceded wording must never be resolvable into a contract');
});
await test('vendor text is not in the clause library at all', async () => {
  const leak = await one(`select count(*)::int n from cw.clause_version
    where body in (select vendor_text from cw.concession where vendor_text is not null)`);
  eq(leak.n, 0, 'quarantine means it is not in the library, not merely filtered out');
});

console.log('\npromotion — the only path in');
await test('a requester cannot promote', async () => {
  await asRole('requester', 'buyer@clausewerk');
  await throws(() => db.exec(
    `select cw.promote_concession(4,'DP-S-080','5-day notice','Derived','R. Vance','2028-01-01')`),
    'only legal_admin');
  await asRole('legal_admin');
});
await test('a rung concession has nothing to promote', async () => {
  const id = (await one(`select concession_id from cw.concession where agreement_id='AG-001'`)).concession_id;
  await throws(() => db.exec(
    `select cw.promote_concession(${id},'DP-S-081','x','y','z','2028-01-01')`),
    'nothing to promote');
});
await test('legal_admin can promote vendor text into a new clause', async () => {
  const id = (await one(`select concession_id from cw.concession where vendor_text is not null`)).concession_id;
  const r = await one(
    `select cw.promote_concession(${id},'DP-S-080','5-day breach notice',
       'Derived from repeated vendor position','R. Vance','2028-01-01') as ref`);
  eq(r.ref, 'DP-S-080@v1');
  const v = await one(`select provenance, citations, selectable from cw.clause_version_state
                       where clause_id='DP-S-080'`);
  eq(v.provenance, 'promoted', 'promoted language must be distinguishable from seeded');
  assert(String(v.citations).includes('Policy-DERIVED'), 'derived provenance must be cited');
  eq(v.selectable, true, 'once promoted it is ordinary approved language');
});
await test('the same concession cannot be promoted twice', async () => {
  const id = (await one(`select concession_id from cw.concession
                         where promoted_to_clause is not null`)).concession_id;
  await throws(() => db.exec(
    `select cw.promote_concession(${id},'DP-S-082','x','y','z','2028-01-01')`),
    'already promoted');
});
await test('promotion is audited', async () => {
  const e = await one(`select subject, payload from cw.audit_event
                       where event_type='concession_promoted' order by seq desc limit 1`);
  eq(e.subject, 'DP-S-080@v1');
});
await test('recording a concession is audited', async () => {
  const n = await one(`select count(*)::int n from cw.audit_event where event_type='concession_recorded'`);
  assert(n.n >= 3, 'every concession must leave a record');
});

console.log('\nnegotiation intelligence (CLA §6)');
await test('concession rates aggregate', async () => {
  // Three concessions persist. Three further attempts above were correctly
  // refused (below floor without override, vendor text without override, and
  // both outcomes at once) and must leave no trace in the analytics.
  const r = await one(`select concessions, to_vendor_language, required_override
                       from cw.concession_rate where standard_clause_id='DP-H-014'`);
  eq(r.concessions, 3); eq(r.to_vendor_language, 1); eq(r.required_override, 2);
});
await test('proposals only fire on a real pattern, not a single event', async () => {
  const p = await rows(`select proposal from cw.library_proposal where standard_clause_id='DP-H-014'`);
  assert(p.length === 1, 'one row per clause');
  assert(p[0].proposal.includes('settle below the opening position'),
    'settlement below rung 0 is the supported signal here');
});

console.log('\nrow-level security (CLA §7)');
await test('a viewer cannot read concessions at all', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  // Assert the denial names CONCESSION. An earlier version of this test accepted
  // any "permission denied", and passed because the policy's subquery tripped
  // over cw.agreement instead — the right outcome for the wrong reason.
  await throws(() => db.exec(`select * from cw.concession limit 1`),
    'permission denied for table concession');
});
await test('even given a grant, the policy yields a viewer no rows', async () => {
  // Defence in depth: the table grant is the first line, the policy is the
  // second. Prove the second holds on its own.
  await db.exec(`reset role; grant select on cw.concession to cw_viewer;`);
  await db.exec(`select set_config('cw.role','viewer',false); set role cw_viewer;`);
  const r = await one(`select count(*)::int n from cw.concession`);
  eq(r.n, 0, 'no policy branch admits a viewer, so a stray grant leaks nothing');
  await db.exec(`reset role; revoke select on cw.concession from cw_viewer;`);
});
await test('a viewer cannot read the analytics', async () => {
  // Sets its own role rather than inheriting one, so it cannot silently pass
  // because an earlier test left the session as superuser.
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  await throws(() => db.exec(`select * from cw.concession_rate limit 1`),
    'permission denied for view concession_rate');
});
await test('a viewer CAN read ladders', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  const r = await one(`select count(*)::int n from cw.ladder_health`);
  assert(r.n > 0, 'the retreat path is not the sensitive part; what we conceded is');
});
await test('a requester sees only their own deals', async () => {
  await db.exec(`reset role; select set_config('cw.role','requester',false);
                 select set_config('cw.actor','other@clausewerk',false); set role cw_requester;`);
  const r = await rows(`select agreement_id from cw.concession`);
  assert(r.every(x => x.agreement_id === 'AG-003'),
    `a requester must not see other buyers' concessions, saw ${JSON.stringify(r)}`);
});
await test('legal sees every concession', async () => {
  await db.exec(`reset role; select set_config('cw.role','legal_reviewer',false); set role cw_legal_reviewer;`);
  const r = await one(`select count(*)::int n from cw.concession`);
  eq(r.n, 3);
});
await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
