// Negotiation record tests (migration 0011, NEGOTIATION-ARCHITECTURE.md §2).
//
// Two things this suite exists to prove:
//
//   1. The record is APPEND-ONLY, like runs. A round that can be edited
//      afterwards is not evidence of what was exchanged, it is a draft.
//   2. `U1` is not settled here. A renewal can open from the executed
//      agreement's positions OR from current library standard; both paths are
//      reachable, and which one was taken is recorded.
//
//   node db/test/negotiation.test.mjs

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
const { queryAs, mustWrite } = roleHelpers(db);

const BUYER = 'buyer@clausewerk';
const SNAP = 'a'.repeat(64), RULES = 'c'.repeat(64);
// A result hash is a SHA-256. cw.run carries the shape check from WP-23, so a
// one-character stand-in is now correctly refused.
const RH = 'd'.repeat(64);
const D1 = '1'.repeat(64), D2 = '2'.repeat(64), D3 = '3'.repeat(64);

// The prior term: we opened at 24 hours and settled at 48. The library has
// since moved on — DP-H-014 v1 was superseded by v2 — which is precisely the
// state that makes the U1 question interesting rather than academic.
await db.exec(`
  select set_config('cw.actor','legal@clausewerk',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-H-014','data','High'), ('DP-H-052','data','High'), ('DP-H-061','data','High'),
    ('LC-S-009','liab','Standard');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'24h','Notify within 24 hours.','2025-01-01','2030-01-01'),
    ('DP-H-014',2,'24h+SCC','Notify within 24 hours, with SCCs.','2026-01-01','2030-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2030-01-01'),
    ('DP-H-052',2,'48h+SCC','Notify within 48 hours, with SCCs.','2026-01-01','2030-01-01'),
    ('DP-H-061',1,'72h','Notify within 72 hours.','2025-01-01','2030-01-01'),
    ('LC-S-009',1,'Cap','Capped at fees paid.','2025-01-01','2030-01-01');
  insert into cw.ladder (ladder_id,category_key,severity,owner) values (1,'data','High','R. Vance');
  insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
    (1,0,'DP-H-014',2,false), (1,1,'DP-H-052',1,false), (1,2,'DP-H-061',1,true);
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-001','Northwind','${BUYER}'),
    ('AG-010','Northwind','${BUYER}'),
    ('AG-011','Northwind','${BUYER}'),
    ('AG-020','Contoso','${BUYER}'),
    ('AG-021','Contoso','${BUYER}'),
    ('AG-022','Contoso','${BUYER}');
  insert into cw.snapshot (snapshot_id,taken_on) values ('${SNAP}','2026-07-25');
  insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable)
    values ('${SNAP}','DP-H-014',1,true);
  insert into cw.ruleset (ruleset_id) values ('${RULES}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,snapshot_id,
                      ruleset_id,result_hash,engine_version,gate_open,created_by)
    values ('RUN-001','AG-001','Northwind','{}','llm','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'${BUYER}');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason) values
    ('RUN-001',0,'data','High','DP-H-052',1,'Conceded to 48 hours last term'),
    ('RUN-001',1,'liab','Standard','LC-S-009',1,'Standard cap');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on)
    values ('AG-001','RUN-001','2023-08-01','2023-09-01');
  insert into cw.supersession (clause_id,predecessor_version,successor_version,reason,approver)
    values ('DP-H-014',1,2,'Added SCC module','R. Vance'),
           ('DP-H-052',1,2,'Added SCC module to the 48-hour rung','R. Vance');`);

console.log('\nthe negotiation record is append-only (WP-19)');

let NEG;
await test('a negotiation and its first round are recorded as the real role', async () => {
  const n = await mustWrite('requester',
    `insert into cw.negotiation (agreement_id,paper,opened_by,baseline_chosen_by)
     values ('AG-020','ours','${BUYER}','${BUYER}') returning negotiation_id`, [], BUYER);
  NEG = n[0].negotiation_id;
  await mustWrite('requester',
    `insert into cw.negotiation_round
       (negotiation_id,round_no,direction,document_sha256,storage_uri,sent_on,actor)
     values (${NEG},1,'issued','${D1}','s3://cw/neg/1.docx','2026-07-01','${BUYER}')
     returning round_no`, [], BUYER);
  const r = await one(`select direction, document_sha256 from cw.negotiation_round
                       where negotiation_id=$1 and round_no=1`, [NEG]);
  eq(r.direction, 'issued'); eq(r.document_sha256, D1);
});

await test('a round cannot be updated once recorded', async () => {
  await throws(() => db.exec(
    `update cw.negotiation_round set document_sha256='${D2}'
     where negotiation_id=${NEG} and round_no=1`),
    'a negotiation_round cannot be rewritten once recorded',
    'a round that can be edited afterwards proves nothing about what was exchanged');
});

await test('a round cannot be deleted either — it RAISES', async () => {
  // Settled decision S0-3. `do instead nothing` would make an application bug
  // indistinguishable from success, which is finding D9's whole complaint.
  await throws(() => db.exec(
    `delete from cw.negotiation_round where negotiation_id=${NEG} and round_no=1`),
    'a negotiation_round cannot be deleted once recorded');
  const n = await one(`select count(*)::int n from cw.negotiation_round
                       where negotiation_id=$1`, [NEG]);
  eq(n.n, 1, 'and it is still there');
});

await test('rounds arrive in order or not at all', async () => {
  await throws(() => queryAs('requester',
    `insert into cw.negotiation_round
       (negotiation_id,round_no,direction,document_sha256,storage_uri,sent_on,actor)
     values (${NEG},4,'received','${D2}','s3://cw/neg/4.docx','2026-07-05','${BUYER}')`,
    [], BUYER),
    'the next round is 2, not 4',
    'a record with a hole in it is worse than no record — it looks complete');
});

await test('a received redline cannot claim an assembly run', async () => {
  await throws(() => queryAs('requester',
    `insert into cw.negotiation_round
       (negotiation_id,round_no,direction,document_sha256,storage_uri,sent_on,actor,run_id)
     values (${NEG},2,'received','${D2}','s3://cw/neg/2.docx','2026-07-05','${BUYER}','RUN-001')`,
    [], BUYER),
    'only_our_rounds_have_a_run',
    'their paper did not come out of our engine, and the provenance chain must say so');
});

let POS;
await test('a position is a thread across rounds, and its state is its history', async () => {
  await mustWrite('requester',
    `insert into cw.negotiation_round
       (negotiation_id,round_no,direction,document_sha256,storage_uri,sent_on,actor)
     values (${NEG},2,'received','${D2}','s3://cw/neg/2.docx','2026-07-05','vendor')
     returning round_no`, [], BUYER);
  const p = await mustWrite('requester',
    `insert into cw.negotiation_position
       (negotiation_id,category_key,our_clause_id,our_version,round_raised,opened_from)
     values (${NEG},'data','DP-H-014',2,2,'library_standard') returning position_id`,
    [], BUYER);
  POS = p[0].position_id;
  const c = await one(`select state, round_last_moved from cw.position_current
                       where position_id=$1`, [POS]);
  eq(c.state, 'open', 'every position starts open, and says so in its own history');
  eq(c.round_last_moved, 2);
});

await test('a position moves by appending, never by editing', async () => {
  await throws(() => db.exec(
    `update cw.negotiation_position set category_key='liab' where position_id=${POS}`),
    'a negotiation_position cannot be rewritten once recorded');
  await mustWrite('requester',
    `insert into cw.position_movement (position_id,round_no,to_state,actor,note)
     values (${POS},2,'held','${BUYER}','not moving on 24 hours') returning movement_id`,
    [], BUYER);
  const c = await one(`select state from cw.position_current where position_id=$1`, [POS]);
  eq(c.state, 'held');
  const h = await rows(`select to_state from cw.position_movement
                        where position_id=$1 order by movement_id`, [POS]);
  eq(h.map(x => x.to_state), ['open', 'held'], 'the whole history survives');
});

await test('a movement cannot be rewritten or deleted', async () => {
  await throws(() => db.exec(
    `update cw.position_movement set to_state='settled' where position_id=${POS}`),
    'a position_movement cannot be rewritten once recorded');
  await throws(() => db.exec(
    `delete from cw.position_movement where position_id=${POS}`),
    'a position_movement cannot be deleted once recorded');
});

await test('the third-round revival is visible', async () => {
  // A point held in round 2 that moves again in round 5 is the SAME argument
  // reopening. Without this record the buyer negotiates it twice and nobody
  // notices — which is the single thing the position thread exists to buy.
  let empty = await rows(`select * from cw.position_revival where position_id=$1`, [POS]);
  eq(empty.length, 0, 'held once and left alone is not a revival');
  for (const rn of [3, 4, 5])
    await mustWrite('requester',
      `insert into cw.negotiation_round
         (negotiation_id,round_no,direction,document_sha256,storage_uri,sent_on,actor)
       values (${NEG},${rn},'received','${'a'.repeat(63) + rn}','s3://x','2026-07-0${rn+2}','vendor')
       returning round_no`, [], BUYER);
  await mustWrite('requester',
    `insert into cw.position_movement (position_id,round_no,to_state,current_rung,actor,note)
     values (${POS},5,'conceded',1,'${BUYER}','they raised it again in round 5')
     returning movement_id`, [], BUYER);
  const rev = await one(`select times_held, first_held_round, last_round
                         from cw.position_revival where position_id=$1`, [POS]);
  assert(rev, 'the same point coming back must be visible as the same point');
  eq(rev.first_held_round, 2); eq(rev.last_round, 5);
  const c = await one(`select state, current_rung from cw.position_current
                       where position_id=$1`, [POS]);
  eq(c.state, 'conceded'); eq(c.current_rung, 1);
});

await test('every round and every movement is in the audit trail', async () => {
  const r = await one(`select payload from cw.audit_event
                       where event_type='negotiation_round_recorded'
                         and subject=$1`, [`${NEG}#1`]);
  eq(r.payload.sha256, D1);
  const m = await rows(`select payload from cw.audit_event
                        where event_type='position_moved' and subject=$1
                        order by seq`, [String(POS)]);
  assert(m.some(x => x.payload.to_state === 'held'));
});

// ════════════════════════════════════════════════════════════════════════════
// U1 · which positions a renewal opens from — NOT SETTLED HERE
// ════════════════════════════════════════════════════════════════════════════
console.log('\nboth renewal baselines are built, and the choice is recorded (U1)');

await test('the baseline is a settled owner decision, and says who settled it', async () => {
  // U1 was SETTLED by the owner on 2026-07-26: a renewal opens from the deal as
  // signed, with the drift report alongside. The value is unchanged from what
  // shipped as the pre-selection — what changed is that it is now a choice
  // somebody made rather than a default nobody had looked at.
  const s = await one(`select value, is_owner_decision, decided, decided_by, rationale
                       from cw.governance_setting where key='renewal_default_baseline'`);
  eq(s.value, 'executed_agreement', 'a renewal opens from what is actually in force');
  eq(s.is_owner_decision, true);
  eq(s.decided, true, 'settled — no longer a shipped default');
  assert(s.decided_by, 'a settled decision names who settled it');
  assert(s.rationale.includes('U1'));
});

let NEG_A;
await test('by default a renewal opens from the executed agreement’s positions', async () => {
  const r = await queryAs('legal_reviewer',
    `select cw.open_renewal('AG-010','AG-001','legal@clausewerk') as id`);
  NEG_A = r[0].id;
  const n = await one(`select baseline, renews_agreement_id, baseline_chosen_by
                       from cw.negotiation where negotiation_id=$1`, [NEG_A]);
  eq(n.baseline, 'executed_agreement');
  eq(n.renews_agreement_id, 'AG-001');
  const p = await rows(`select category_key, our_clause_id, our_version, opened_from
                        from cw.negotiation_position where negotiation_id=$1
                        order by category_key`, [NEG_A]);
  eq(p.length, 2, 'one position per category the executed contract settles');
  eq(p[0].our_clause_id, 'DP-H-052',
    'the position ACTUALLY in force — the concession we made last term, carried');
  eq(p[0].opened_from, 'executed_agreement');
});

let NEG_B;
await test('library standard is reachable as an explicit, recorded choice', async () => {
  const r = await queryAs('legal_reviewer',
    `select cw.open_renewal('AG-011','AG-001','legal@clausewerk','library_standard',
                            'ours','Legal asked to reset to standard') as id`);
  NEG_B = r[0].id;
  const n = await one(`select baseline, baseline_note from cw.negotiation
                       where negotiation_id=$1`, [NEG_B]);
  eq(n.baseline, 'library_standard');
  assert(n.baseline_note.includes('reset to standard'));
  const p = await rows(`select category_key, our_clause_id, our_version, opened_from
                        from cw.negotiation_position where negotiation_id=$1
                        order by category_key`, [NEG_B]);
  eq(p[0].our_clause_id, 'DP-H-014',
    'the ladder’s preferred rung, not last term’s concession');
  eq(p[0].our_version, 2, 'and the current version of it');
  eq(p[0].opened_from, 'library_standard');
});

await test('the two baselines genuinely differ — that is why the choice is recorded', async () => {
  const a = await one(`select our_clause_id from cw.negotiation_position
                       where negotiation_id=$1 and category_key='data'`, [NEG_A]);
  const b = await one(`select our_clause_id from cw.negotiation_position
                       where negotiation_id=$1 and category_key='data'`, [NEG_B]);
  assert(a.our_clause_id !== b.our_clause_id,
    'if both paths produced the same positions there would be nothing to decide');
});

await test('which baseline was taken is in the audit trail, with the default alongside', async () => {
  const e = await rows(`select subject, payload from cw.audit_event
                        where event_type='renewal_opened' order by seq`);
  eq(e.length, 2);
  const byId = Object.fromEntries(e.map(x => [x.subject, x.payload]));
  eq(byId['AG-010'].baseline, 'executed_agreement');
  eq(byId['AG-011'].baseline, 'library_standard');
  eq(byId['AG-011'].default_was, 'executed_agreement',
    'so a reader can see the choice was deliberate rather than accidental');
});

await test('the drift report sits alongside the baseline it exists to compensate for', async () => {
  // Opening from the executed agreement means stale and superseded language is
  // the STARTING point. This report is what pulls it forward.
  // Asked as Legal rather than as the owner. cw.renewal_drift joins
  // cw.agreement_drift, which 0019 scoped — it now consults cw.app_role(), and
  // the database owner holds none, so on the owner's connection this report is
  // empty. That is correct: drift on an agreement you cannot see is not yours
  // to read. It also means this assertion would have gone quietly true rather
  // than failing, which is the failure mode 0019's own note is about.
  const d = await queryAs('legal_reviewer',
                       `select clause_id, executed_version, successor_version,
                               superseded_reason
                        from cw.renewal_drift where negotiation_id=$1`, [NEG_A]);
  eq(d.length, 1, 'the carried concession has been superseded in the library since');
  eq(d[0].clause_id, 'DP-H-052');
  eq(d[0].executed_version, 1);
  eq(d[0].successor_version, 2, 'and the renewal conversation is told so');
  const p = await one(`select our_version from cw.negotiation_position
                       where negotiation_id=$1 and category_key='data'`, [NEG_A]);
  eq(p.our_version, 1, 'reporting only — the position it opened from is untouched');
});

await test('an unknown baseline is refused rather than quietly defaulted', async () => {
  await throws(() => queryAs('legal_reviewer',
    `select cw.open_renewal('AG-021','AG-001','legal@clausewerk','whatever')`),
    'unknown renewal baseline: whatever');
});

await test('a renewal cannot claim to renew an agreement that was never executed', async () => {
  await throws(() => queryAs('legal_reviewer',
    `select cw.open_renewal('AG-022','AG-010','legal@clausewerk')`),
    'has no executed run to renew from');
});

await test('a negotiation cannot say it opened from an agreement it did not renew', async () => {
  await throws(() => db.exec(
    `insert into cw.negotiation (agreement_id,paper,opened_by,baseline,baseline_chosen_by)
     values ('AG-021','ours','x','executed_agreement','x')`),
    'executed_baseline_needs_a_prior_agreement');
});

console.log('\naccess');

await test('a viewer cannot read the negotiation record at all', async () => {
  // It is the blow-by-blow of what we gave away and when — as commercially
  // sensitive as the concession record it feeds (CLA §7).
  await throws(() => queryAs('viewer', `select * from cw.negotiation`), 'permission denied');
});

await test('an auditor can read it and cannot write to it', async () => {
  const r = await queryAs('auditor', `select count(*)::int n from cw.negotiation`);
  assert(r[0].n > 0);
  await throws(() => queryAs('auditor',
    `insert into cw.negotiation (agreement_id,paper,opened_by,baseline_chosen_by)
     values ('AG-021','ours','a','a')`), 'permission denied');
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
