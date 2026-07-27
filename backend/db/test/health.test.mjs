// Checkpoint duty and system-health evidence — 0013 part 4 (WP-U04).
//
// Two guarantees.
//
//   1. Owner decision U7: checkpointing MOVED to the administrator. A move, not
//      a shared right — so legal_admin must be REFUSED where it previously
//      succeeded, and that refusal is what this suite proves. A test that only
//      showed the administrator can now checkpoint would pass just as happily
//      with both roles holding the duty, which is the state where neither owns it.
//
//   2. The health pane shows evidence, not decoration. The failure to design
//      against is not a tile saying BROKEN when things are fine — somebody
//      investigates that within the hour. It is a tile saying VERIFIED because a
//      query counted rows that exist rather than checks that ran. So:
//
//        · never_ran is asserted as its own state, on a fresh system, for every
//          tile. Absence of evidence must never render as evidence.
//        · "documents stored" and "documents verified" are proved to be
//          different numbers, and the gap between them visible.
//        · a deliberately broken hash must make the pane say so.
//
//   node db/test/health.test.mjs

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
const { queryAs, execAs, mustWrite, mustNotWrite } = roleHelpers(db);

const OWNER = 'owner@clausewerk';
const ADMIN = 'a.okafor@clausewerk';
const LEGAL = 'r.vance@clausewerk';

await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada Okafor',
                                   '${LEGAL}','Rae Vance','Head Office')`);

const tile = async (name) =>
  (await queryAs('administrator',
    `select state, detail from cw.health_summary where tile=$1`, [name], ADMIN))[0];

// ── Never-ran, before anything has been looked at ────────────────────────
console.log('\nabsence of evidence is never rendered as evidence');

await test('on a fresh system every check tile says never_ran, not pass', async () => {
  const t = await queryAs('administrator',
    `select tile, state from cw.health_summary where tile <> 'retention due'
     order by tile`, [], ADMIN);
  const green = t.filter(x => x.state === 'pass');
  eq(green, [], 'a tile rendered pass before any check had run');
  for (const x of t)
    eq(x.state, 'never_ran', `${x.tile} is ${x.state} on a system nobody has checked`);
});

await test('and the checkpoint tile says so in words, not just a state', async () => {
  const t = await tile('checkpoints');
  eq(t.state, 'never_ran');
  assert(/has ever been taken/.test(t.detail || ''),
    'the pane gives the operator a state and no sentence to act on');
});

await test('retention is due or none due — never pass or fail', async () => {
  // Due-ness is a fact, not a fault. 'pass' would be wrong and 'fail' would be
  // worse: the system accusing itself of a defect for doing what it is meant to.
  const t = await tile('retention due');
  assert(['due','none due'].includes(t.state), `retention rendered as ${t.state}`);
});

// ── Decision U7: the move ────────────────────────────────────────────────
console.log('\ndecision U7: checkpoint duty MOVED, and the old right is gone');

await test('a legal admin can no longer take a checkpoint — where it used to work', async () => {
  // The half of the move that is easy to forget. Before 0013, cw_legal_admin
  // held execute on this function and this call succeeded.
  await throws(() => queryAs('legal_admin', `select cw.audit_checkpoint_take()`, [], LEGAL),
    'permission denied',
    'legal_admin still holds checkpoint duty, so two roles hold it and neither owns it');
});

await test('and no role but the administrator holds it', async () => {
  const holders = [];
  for (const [role, dbRole] of Object.entries({
    viewer:'cw_viewer', requester:'cw_requester', legal_reviewer:'cw_legal_reviewer',
    legal_admin:'cw_legal_admin', auditor:'cw_auditor', administrator:'cw_administrator'})) {
    const h = (await one(`select has_function_privilege($1,
      'cw.audit_checkpoint_take()', 'EXECUTE') as h`, [dbRole])).h;
    if (h) holders.push(role);
  }
  eq(holders, ['administrator'], 'checkpoint duty is held by more than one role');
});

await test('the administrator takes a checkpoint, and it is recorded', async () => {
  const r = await queryAs('administrator', `select cw.audit_checkpoint_take() as id`,
    [], ADMIN);
  assert(r[0].id > 0);
  const h = await queryAs('administrator',
    `select checkpoints_taken, chain_height from cw.health_chain`, [], ADMIN);
  eq(h[0].checkpoints_taken, 1);
  assert(Number(h[0].chain_height) > 0, 'the chain has no height after a bootstrap');
});

await test('a fresh checkpoint is not overdue; the next is due in 24 hours', async () => {
  const c = await queryAs('administrator',
    `select overdue, next_due_at > now() as ahead from cw.health_checkpoint`, [], ADMIN);
  eq([c[0].overdue, c[0].ahead], [false, true]);
  eq((await tile('checkpoints')).state, 'pass');
});

// ── The whole-log checks ─────────────────────────────────────────────────
console.log('\nthe two checks the database performs for itself');

await test('running the anchor check records a pass, and the tile moves', async () => {
  const r = await queryAs('administrator', `select cw.run_anchor_check() as r`, [], ADMIN);
  eq(r[0].r, 'ok');
  const t = await tile('anchor');
  eq(t.state, 'pass');
  assert(t.detail === null, 'a passing check left a detail behind');
});

await test('running the chain check records a pass', async () => {
  const r = await queryAs('administrator', `select cw.run_chain_check() as broken`, [], ADMIN);
  eq(r[0].broken, null, 'the chain does not verify on an untouched database');
  eq((await tile('audit chain')).state, 'pass');
});

await test('the check is recorded with who ran it', async () => {
  const c = await queryAs('administrator',
    `select ran_by, outcome from cw.integrity_check
     where check_name='anchor' order by ran_at desc limit 1`, [], ADMIN);
  eq([c[0].ran_by, c[0].outcome], [ADMIN, 'pass']);
});

await test('"no checkpoint" is recorded as a FAILURE of the anchor check', async () => {
  // Not a pass with a caveat. There is no anchor, so nothing is anchored, and
  // the pane must not render that green.
  const d = await PGlite.create();
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
    await d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  await d.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
  const { queryAs: qa } = roleHelpers(d);
  const r = await qa('administrator', `select cw.run_anchor_check() as r`, [], ADMIN);
  eq(r[0].r, 'no checkpoint');
  const t = await qa('administrator',
    `select state, detail from cw.health_summary where tile='anchor'`, [], ADMIN);
  eq(t[0].state, 'fail', 'an unanchored log rendered as anything but a failure');
  await d.close();
});

// ── Documents: stored is not verified ────────────────────────────────────
console.log('\nstored is not verified, and the gap is the interesting number');

const SHA_GOOD = 'a'.repeat(64);
const SHA_OTHER = 'b'.repeat(64);

await db.exec(`
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.agreement (agreement_id,counterparty,requester)
    values ('AG-700','Northwind','buyer@clausewerk');
  insert into cw.snapshot (snapshot_id) values ('${'1'.repeat(64)}');
  insert into cw.ruleset (ruleset_id) values ('${'2'.repeat(64)}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,
                      gate_open,created_by)
    values ('RUN-1','AG-700','Northwind','{}','manual','${'1'.repeat(64)}','${'2'.repeat(64)}',
            '${'c'.repeat(64)}','1.0.0',true,'buyer@clausewerk');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on)
    values ('AG-700','RUN-1','2026-01-01','2026-01-01');
  insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
    values ('AG-700',0,'agreement','ag700.docx',1024,'${SHA_GOOD}',
            'store://ag700.docx','2026-01-01');`);

await test('a stored document nobody has checked is NOT a verified document', async () => {
  const d = await queryAs('administrator', `select * from cw.health_document`, [], ADMIN);
  eq(d[0].documents_stored, 1);
  eq(d[0].documents_verified, 0,
    'a row that exists was counted as bytes that were checked');
  eq(d[0].documents_never_checked, 1);
  const t = await tile('signed documents');
  eq(t.state, 'never_ran');
  assert(/never been checked/.test(t.detail || ''),
    'the pane does not say how many documents are unchecked');
});

await test('checking it with the right hash moves it to verified', async () => {
  const r = await queryAs('administrator',
    `select cw.record_document_hash_check('AG-700',0,'${SHA_GOOD}') as r`, [], ADMIN);
  eq(r[0].r, 'pass');
  const d = await queryAs('administrator', `select * from cw.health_document`, [], ADMIN);
  eq([d[0].documents_verified, d[0].documents_never_checked], [1, 0]);
  eq((await tile('signed documents')).state, 'pass');
});

await test('a broken stored hash makes the health model report the mismatch', async () => {
  // The check the package names. The caller reads the bytes and supplies what
  // they hash to; the database compares against what was recorded at execution.
  const r = await queryAs('administrator',
    `select cw.record_document_hash_check('AG-700',0,'${SHA_OTHER}') as r`, [], ADMIN);
  eq(r[0].r, 'fail');
  const d = await queryAs('administrator', `select * from cw.health_document`, [], ADMIN);
  eq(d[0].documents_mismatched, 1);
  const t = await tile('signed documents');
  eq(t.state, 'fail');
  const c = await queryAs('administrator',
    `select detail from cw.integrity_check
     where check_name='document_hash' and outcome='fail'`, [], ADMIN);
  assert(/BYTES are the authority/.test(c[0].detail),
    'the failure does not say which side wins, which is the whole point');
});

await test('the caller cannot simply assert that it matched', async () => {
  // A boolean supplied by the thing being checked is not a check. There is no
  // parameter here to say "trust me" — the comparison happens where the
  // recorded value lives.
  await throws(() => queryAs('administrator',
    `select cw.record_document_hash_check('AG-700',0,true)`, [], ADMIN),
    'does not exist',
    'a boolean-taking overload exists, which would let the caller grade itself');
});

await test('checking a document that does not exist is an error, not a pass', async () => {
  await throws(() => queryAs('administrator',
    `select cw.record_document_hash_check('AG-NONE',0,'${SHA_GOOD}')`, [], ADMIN),
    'no executed document');
});

// ── Rebuild spot-check ───────────────────────────────────────────────────
console.log('\nthe rebuild spot-check');

await test('a rebuild that reproduces the recorded hash passes', async () => {
  const r = await queryAs('administrator',
    `select cw.record_rebuild_spot_check('RUN-1','${'c'.repeat(64)}') as r`, [], ADMIN);
  eq(r[0].r, 'pass');
  eq((await tile('rebuild spot-check')).state, 'pass');
});

await test('one that does not reproduce fails, and names the engine version', async () => {
  const r = await queryAs('administrator',
    `select cw.record_rebuild_spot_check('RUN-1','${'d'.repeat(64)}') as r`, [], ADMIN);
  eq(r[0].r, 'fail');
  const t = await tile('rebuild spot-check');
  eq(t.state, 'fail');
  assert(/engine 1\.0\.0/.test(t.detail || ''),
    'a hash that no longer reproduces looks like tampering AND like an engine ' +
    'change; the detail must say which engine produced it');
});

// ── Who may see and do all this ──────────────────────────────────────────
console.log('\nwho may see the evidence, and who may produce it');

await test('the administrator and the auditor read the health models', async () => {
  for (const role of ['administrator','auditor']) {
    const s = await queryAs(role, `select count(*)::int n from cw.health_summary`);
    assert(s[0].n > 0, `${role} cannot read cw.health_summary`);
  }
});

await test('a requester or viewer can reach none of them', async () => {
  for (const role of ['requester','viewer','legal_reviewer']) {
    for (const v of ['cw.health_summary','cw.health_chain','cw.health_document',
                     'cw.integrity_check']) {
      await throws(() => queryAs(role, `select count(*) from ${v}`),
        'permission denied', `${role} can read ${v}`);
    }
  }
});

await test('the administrator sees what is due AND may act on it', async () => {
  // INVERTED BY OWNER DECISION U9, 2026-07-27. This used to assert "visible
  // here, actioned by Legal" and refuse the administrator by privilege. The
  // owner moved records custody to the Administrator, so both halves flip.
  //
  // THE TILE'S OWN COPY IS PART OF THE TEST, and that is the point rather than
  // decoration. It named Legal admin as the only role that may destroy. Left
  // alone, the pane would have told the one person who CAN act that they
  // cannot — a screen misnaming whose act something is does the same damage as
  // a document promising a control the code does not enforce, to the person's
  // face. 0022 redefines the view; this holds the two together.
  await db.exec(`insert into cw.agreement_retention (agreement_id,retention_until)
                 values ('AG-700','2020-01-01')`);
  const t = await tile('retention due');
  eq(t.state, 'due');
  assert(/actioned by the Administrator/.test(t.detail || ''),
    'the pane does not name the Administrator as whose act destruction is');
  assert(!/Legal admin/.test(t.detail || ''),
    'the pane still names Legal admin, whose authority U9 revoked');

  // And the act itself now succeeds for this role.
  await queryAs('administrator',
    `select cw.retention_destroy('AG-700','${ADMIN}')`, [], ADMIN);
  const r = await one(`select destroyed_by from cw.agreement_retention
                       where agreement_id='AG-700'`);
  eq(r.destroyed_by, ADMIN, 'the destruction did not land in the administrator\'s name');
});

await test('nobody but the administrator records a check', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin','auditor']) {
    await mustNotWrite(role,
      `insert into cw.integrity_check (check_name,ran_by,outcome)
       values ('anchor','${role}','pass')`);
  }
});

await test('a recorded check cannot be edited or removed, by anyone', async () => {
  await mustNotWrite('administrator',
    `update cw.integrity_check set outcome='pass' where outcome='fail'`);
  await throws(() => db.exec(
    `update cw.integrity_check set outcome='pass' where outcome='fail'`),
    'append-only');
  await throws(() => db.exec(`delete from cw.integrity_check where check_id=1`),
    'append-only');
});

await test('a failing check must say what went wrong', async () => {
  await throws(() => db.exec(
    `insert into cw.integrity_check (check_name,ran_by,outcome)
     values ('chain','${ADMIN}','fail')`),
    'a_failure_says_what_went_wrong',
    'a failure with no detail tells the person on call that something is wrong '
    + 'and nothing about what');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
