// Portfolio questions on our own paper (0049, NC-16) — the certain count.
//
// The guarantees:
//   · The agreement-representation rule: an agreement is counted through its
//     LATEST run only (created_at, run_id), so a renegotiated deal never
//     counts twice; an unattached run stands alone in its own figure.
//   · A requester's NUMBERS are computed only over runs they created or
//     deals they own — the count, not merely the row list, is fenced.
//   · Unresolved decisions are their own count, never folded into zero.
//   · Ladder-rung answers REPRODUCE: the rung is the run's own pinned
//     snapshot row, not today's library.
//   · A viewer holds no grant at all.
//
//   node db/test/portfolio.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roleHelpers } from './roles.mjs';

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
const one  = async (s, p) => (await rows(s, p))[0];
const { queryAs } = roleHelpers(db);

const RITA = 'rita@cw';
const BEN  = 'ben@cw';
const LEAH = 'leah@cw';

const S1 = 'a'.repeat(64), S2 = 'b'.repeat(64), RS = 'c'.repeat(64);

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-A-001','data','Standard');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on)
    values ('DP-A-001',1,'T','placeholder','2025-01-01','2030-01-01');
  insert into cw.snapshot (snapshot_id) values ('${S1}'), ('${S2}');
  insert into cw.ruleset (ruleset_id) values ('${RS}');
  -- The pin this suite leans on: on S1 the clause sat on rung 2; on the later
  -- S2 the library has moved it to rung 0. Historic runs answer with S1's row.
  insert into cw.snapshot_ladder_rung
    (snapshot_id,category_key,severity,rung,clause_id,version,is_floor) values
    ('${S1}','data','Standard',2,'DP-A-001',1,false),
    ('${S2}','data','Standard',0,'DP-A-001',1,true);
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-1','Northwind','${RITA}'), ('AG-2','Contoso','${BEN}');
`);

async function run(id, agreement, createdBy, createdAt, snapshot = S1) {
  await db.query(`
    insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                        snapshot_id,ruleset_id,result_hash,engine_version,
                        gate_open,created_by,created_at)
    values ($1,$2,'V','{}','manual',$3,'${RS}',$4,'1.0.0',true,$5,$6)`,
    [id, agreement, snapshot,
     id.toLowerCase().padEnd(64, '0').replace(/[^0-9a-f]/g, 'e'),
     createdBy, createdAt]);
}

await run('R1', 'AG-1', RITA, '2026-07-01');  // superseded by R2
await run('R2', 'AG-1', LEAH, '2026-07-10');  // AG-1's latest, recorded by Legal
await run('R3', null,   RITA, '2026-07-05');  // unattached, stands alone
await run('R4', 'AG-2', BEN,  '2026-07-08');  // Ben's deal

await db.exec(`
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason) values
    ('R1',0,'data','Standard','DP-A-001',1,'placeholder'),
    ('R2',0,'data','Standard','DP-A-001',1,'placeholder'),
    ('R3',0,'data','Standard','DP-A-001',1,'placeholder'),
    ('R4',0,'data','Standard','DP-A-001',1,'placeholder');
  insert into cw.run_decision (run_id,seq,category_key,severity,reason) values
    ('R2',1,'data','Standard','nothing could be selected');
`);

console.log('\nthe agreement-representation rule');

await test('a renegotiated deal counts once, through its latest run', async () => {
  const p = await queryAs('legal_admin',
    `select decisions::int as d, agreements::int as a, unattached_runs::int as u
       from cw.portfolio_position where clause_id='DP-A-001'`, [], LEAH);
  eq(p.length, 1);
  eq(p[0].d, 3, 'R2, R3 and R4 — R1 is superseded by R2 and must not count');
  eq(p[0].a, 2, 'AG-1 and AG-2, each once');
  eq(p[0].u, 1, 'the unattached run stands alone, counted and labelled');
});

console.log('\nthe fence is on the NUMBER, not the row list');

await test('a requester’s counts cover only their own runs and deals', async () => {
  const p = await queryAs('requester',
    `select decisions::int as d, agreements::int as a
       from cw.portfolio_position where clause_id='DP-A-001'`, [], RITA);
  eq(p[0].d, 2,
    'Rita: R2 (her deal, recorded by Legal — ownership, not authorship, is ' +
    'what admits it) and R3 (her unattached run). Ben’s R4 must not reach ' +
    'her number.');
  eq(p[0].a, 1, 'only AG-1');
});

console.log('\nunresolved is a count of its own');

await test('an unresolved decision appears as unresolved, never as absent', async () => {
  const u = await queryAs('legal_admin',
    `select unresolved::int as n from cw.portfolio_unresolved`, [], LEAH);
  eq(u.length, 1);
  eq(u[0].n, 1);
});

console.log('\nhistoric answers reproduce');

await test('the rung is the run’s own pinned snapshot, not today’s library', async () => {
  const p = await queryAs('legal_admin',
    `select rung_at_run from cw.portfolio_position where clause_id='DP-A-001'`,
    [], LEAH);
  eq(p[0].rung_at_run, 2,
    'S1 pinned rung 2; the library has since moved the clause to rung 0 on ' +
    'S2, and the historic answer must not follow it');
});

console.log('\nwho may ask');

await test('a viewer holds no grant on the portfolio at all', async () => {
  await throws(() => queryAs('viewer',
    `select * from cw.portfolio_position`, [], 'vic@cw'), 'permission denied');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const [n, m] of failures) console.log(`  FAIL ${n}: ${m}`);
  process.exit(1);
}
