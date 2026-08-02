// The two governed acts migration 0062 builds — supersession in one act, and
// ladder replacement — plus the audit trail the floor move never had.
//
// D-5 (2026-08-02, memory.md S218): the six Legal-admin acts are in scope.
// Two needed schema work and this suite tests exactly those two, the way
// NC-21 asks: refusals before happy paths, history proven unchanged, and the
// in-flight flag proven to flag rather than rewrite.
//
//   node db/test/governed-library-acts.test.mjs

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
const one = async (s, p) => (await rows(s, p))[0];
const { queryAs, execAs, mustNotWrite } = roleHelpers(db);

const OWNER = 'owner@cw', ADMIN = 'a.okafor@cw', LEGAL = 'r.vance@cw';
await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);

const asAdmin = (s, p = []) => queryAs('legal_admin', s, p, LEGAL);
const oneAsAdmin = async (s, p = []) => (await asAdmin(s, p))[0];

// ── The library and one in-flight deal ─────────────────────────────────────
const SNAP = 'a'.repeat(64), RULES = 'c'.repeat(64), RH = 'd'.repeat(64);
await db.exec(`
  select set_config('cw.actor','installer@cw',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-H-014','data','High'),
    ('DP-S-001','data','Standard'),
    ('DP-S-002','data','Standard');
  insert into cw.clause_version
    (clause_id,version,title,body,rationale,approved_on,expires_on,reviewer) values
    ('DP-H-014',1,'24h','Notify within 24 hours.','Regulator expects 24h.',
     '2025-01-01','2030-01-01','R. Vance'),
    ('DP-S-001',1,'72h','Notify within 72 hours.','The standard position.',
     '2025-01-01','2030-01-01','R. Vance'),
    ('DP-S-002',1,'96h','Notify within 96 hours.','The fallback position.',
     '2025-01-01','2030-01-01','R. Vance');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-INFLIGHT','Contoso','buyer@cw');
  insert into cw.snapshot (snapshot_id,taken_on) values ('${SNAP}','2026-07-25');
  insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable) values
    ('${SNAP}','DP-H-014',1,true);
  insert into cw.ruleset (ruleset_id) values ('${RULES}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
    values ('RUN-1','AG-INFLIGHT','Contoso','{}','manual','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'buyer@cw');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-1',0,'data','High','DP-H-014',1,'Matched High variant');
  select set_config('cw.actor','',false);`);

// ═══ Supersession, refusals first ══════════════════════════════════════════
console.log('\nsuperseding a clause — refusals before the happy path');

const SUPERSEDE = `select cw.supersede_clause('DP-H-014', 1, '24h + SCCs',
  'Notify within 24 hours, with SCC module.', 'The 2026 guidance requires SCCs.',
  '{}', '2030-01-01'::date, 'Rewritten for the 2026 guidance.') as v`;

await test('a requester cannot supersede', async () => {
  await throws(() => queryAs('requester', SUPERSEDE, [], 'buyer@cw'),
    'permission denied');
});

await test('the database owner without a role cannot reach it as an act', async () => {
  // Not a refusal test of the function (the owner bypasses grants) — a check
  // that the inner second line refuses a session with no application role.
  await throws(() => db.query(SUPERSEDE), "legal admin's act");
});

await test('a version that does not exist cannot be superseded', async () => {
  await throws(() => asAdmin(`select cw.supersede_clause('DP-H-014', 9,
    't','b','r','{}',null,'No such predecessor.')`), 'does not exist');
});

let successor;
await test('the legal admin supersedes, and one act mints and records', async () => {
  const r = await oneAsAdmin(SUPERSEDE);
  successor = r.v;
  eq(successor, 2, 'the successor is the next version');
  const s = await one(`select approver, reason, predecessor_disposition
                       from cw.supersession
                       where clause_id='DP-H-014' and predecessor_version=1`);
  eq(s.approver, LEGAL, 'the approver is the session, not an argument');
  eq(s.predecessor_disposition, 'run_off');
});

await test('the predecessor bytes are unchanged and still readable', async () => {
  const v1 = await one(`select body, title from cw.clause_version
                        where clause_id='DP-H-014' and version=1`);
  eq(v1.body, 'Notify within 24 hours.');
  const state = await oneAsAdmin(`select state from cw.clause_version_state
                                  where clause_id='DP-H-014' and version=1`);
  eq(state.state, 'superseded');
});

await test('both halves of the act are on the chain', async () => {
  const minted = await one(`select count(*)::int n from cw.audit_event
    where event_type='clause_version_created' and subject='DP-H-014@v2'`);
  const sup = await one(`select count(*)::int n from cw.audit_event
    where event_type='clause_superseded' and subject='DP-H-014@v1'`);
  assert(minted.n >= 1, 'the mint is recorded');
  eq(sup.n, 1, 'the supersession is recorded');
});

await test('an in-flight deal carrying the old wording is flagged, not rewritten', async () => {
  const d = await asAdmin(`select clause_id, chosen_version, successor_version
                           from cw.run_drift where agreement_id='AG-INFLIGHT'`);
  eq(d.length, 1);
  eq([d[0].clause_id, d[0].chosen_version, d[0].successor_version], ['DP-H-014', 1, 2]);
  const decision = await one(`select version from cw.run_decision
                              where run_id='RUN-1' and seq=0`);
  eq(decision.version, 1, 'the deal still carries what it chose');
});

await test('a version is superseded at most once', async () => {
  await throws(() => asAdmin(`select cw.supersede_clause('DP-H-014', 1,
    't','b','r','{}',null,'A second supersession of v1.')`));
});

// ═══ Ladder replacement, refusals first ════════════════════════════════════
console.log('\npublishing a ladder — refusals before the happy path');

const PUBLISH = (ids, vers, floor, reason) =>
  `select cw.publish_ladder('data','Standard',
     array[${ids.map(i => `'${i}'`).join(',')}]::text[],
     array[${vers.join(',')}]::int[], ${floor}, '${reason}') as ladder_id`;

await test('a requester cannot publish a ladder', async () => {
  await throws(() => queryAs('requester',
    PUBLISH(['DP-S-001'], [1], 0, 'Not their act.'), [], 'buyer@cw'),
    'permission denied');
});

await test('a ladder with no rungs, a floor off the ladder, or no reason is refused', async () => {
  await throws(() => asAdmin(PUBLISH(['DP-S-001'], [1, 2], 0, 'Mismatched arrays.')),
    'every rung needs a version');
  await throws(() => asAdmin(PUBLISH(['DP-S-001'], [1], 3, 'Floor off the end.')),
    'the floor must be one of the rungs');
  await throws(() => asAdmin(PUBLISH(['DP-S-001'], [1], 0, '  ')),
    'requires a stated reason');
});

let firstLadder;
await test('the legal admin publishes a ladder, and it is recorded', async () => {
  const r = await oneAsAdmin(PUBLISH(['DP-S-001', 'DP-S-002'], [1, 1], 1,
    'Initial Standard retreat path.'));
  firstLadder = Number(r.ladder_id);
  const board = await asAdmin(`select rung, clause_id, is_floor from cw.ladder_board
    where ladder_id=${firstLadder} order by rung`);
  eq(board.map(b => [b.rung, b.clause_id, b.is_floor]),
     [[0, 'DP-S-001', false], [1, 'DP-S-002', true]]);
  const audited = await one(`select count(*)::int n from cw.audit_event
    where event_type='ladder_published' and subject='${firstLadder}'`);
  eq(audited.n, 1);
});

let secondLadder;
await test('publishing again replaces: the old ladder retires, readable forever', async () => {
  const r = await oneAsAdmin(PUBLISH(['DP-S-002', 'DP-S-001'], [1, 1], 0,
    'Positions hardened; the fallback becomes preferred.'));
  secondLadder = Number(r.ladder_id);
  assert(secondLadder !== firstLadder, 'a replacement is a new ladder');

  const old = await one(`select retired_on, retired_reason from cw.ladder
                         where ladder_id=${firstLadder}`);
  assert(old.retired_on !== null, 'the predecessor is retired');
  const oldRungs = await asAdmin(`select rung, clause_id from cw.ladder_board
    where ladder_id=${firstLadder} order by rung`);
  eq(oldRungs.map(b => b.clause_id), ['DP-S-001', 'DP-S-002'],
    'the retired ladder still reads exactly as it was published');

  const retired = await one(`select count(*)::int n from cw.audit_event
    where event_type='ladder_retired' and subject='${firstLadder}'`);
  eq(retired.n, 1, 'the retirement is on the chain');

  const live = await asAdmin(`select ladder_id from cw.ladder_board
    where category_key='data' and severity='Standard' and retired_on is null
    group by ladder_id`);
  eq(live.map(l => Number(l.ladder_id)), [secondLadder],
    'exactly one live ladder per pair');
});

await test('a retired ladder is closed history — no edits, no coming back', async () => {
  await throws(() => execAs('legal_admin',
    `update cw.ladder set retired_on = null, retired_reason = null
     where ladder_id = ${firstLadder}`, LEGAL),
    'closed history');
});

await test('a new concession is judged against the live ladder, not the retired one', async () => {
  await db.exec(`
    select set_config('cw.actor','installer@cw',false);
    insert into cw.concession
      (agreement_id, category_key, standard_clause_id, standard_version,
       conceded_rung, reason, approved_by)
    values ('AG-INFLIGHT','data','DP-S-001',1,0,'Conceded to the preferred rung.',
            '${LEGAL}');
    select set_config('cw.actor','',false);`);
  const c = await one(`select ladder_id, ladder_floor_rung from cw.concession
                       where agreement_id='AG-INFLIGHT'`);
  eq(Number(c.ladder_id), secondLadder, 'the live ladder is the authority');
  eq(c.ladder_floor_rung, 0, "and its floor, not the retired ladder's");
});

// ═══ The floor move finally leaves a trace ═════════════════════════════════
console.log('\nmoving the floor');

await test('moving the floor is recorded on the chain', async () => {
  await execAs('legal_admin',
    `update cw.ladder_rung set is_floor = (rung = 1)
     where ladder_id = ${secondLadder}`, LEGAL);
  const moved = await one(`select payload from cw.audit_event
    where event_type='ladder_floor_moved' and subject='${secondLadder}'`);
  assert(moved, 'the move landed on the chain');
  eq(moved.payload.rung, 1, 'naming the rung the floor landed on');
  const floors = await one(`select count(*)::int n from cw.audit_event
    where event_type='ladder_floor_moved'`);
  eq(floors.n, 1, 'one move, one row — the cleared rung is not a second event');
});

// ═══ The library view knows a retired ladder is not load-bearing ═══════════
console.log('\nthe library view');

await test('a floor duty on a retired ladder no longer marks the version a floor', async () => {
  // DP-S-002 v1 was the FIRST ladder's floor. That ladder is retired, and on
  // the live ladder the floor has moved to rung 1 (DP-S-001). So DP-S-002's
  // only floor duty is on a retired ladder — and must not linger.
  const held = await oneAsAdmin(`select is_a_floor, on_ladders::int as on_ladders
    from cw.library_entry where clause_id='DP-S-002' and version=1`);
  eq(held.is_a_floor, false, 'the retired duty does not linger');
  eq(held.on_ladders, 1, 'and only live ladders are counted');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { for (const [n, m] of failures) console.error(`FAIL ${n}: ${m}`); process.exit(1); }
