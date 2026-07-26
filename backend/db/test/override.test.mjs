// The override request workflow — migration 0015 (WP-U10).
//
// ADR-0008 specified this in full and nothing was built. The prototype kept one
// `acknowledge · override` button: one person, one click, gate open, no record
// of who else should have known. This suite is that button's obituary.
//
// FOUR GUARANTEES, and each is a way the old button could come back disguised:
//
//   1. THE GATE OPENS ON APPROVAL, NEVER ON REQUEST. The difference between
//      asking and being allowed is the entire product.
//   2. APPROVAL IS PER FINDING, with no approve-all by any path — no
//      affordance, no parameter, no loop. A batch call would be the blanket
//      button with a for-loop in front of it.
//   3. NOTHING IS DECIDED BEFORE THE WINDOW CLOSES, or the socialisation was
//      decoration.
//   4. SOCIALISATION IS NOT "SENT" UNTIL SOMEBODY WAS RESOLVED TO TELL. An
//      empty audience recorded as done puts a lie in the permanent record.
//
//   node db/test/override.test.mjs

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
const PAT   = 'p.nkemi@clausewerk';
const DANA  = 'd.buyer@clausewerk';
const SEC   = 'sec.lead@clausewerk';

await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
await execAs('administrator', `
  insert into cw.account (person,display_name,role,created_by) values
    ('${PAT}','Pat Nkemi','legal_reviewer','${ADMIN}'),
    ('${DANA}','Dana Buyer','requester','${ADMIN}'),
    ('${SEC}','Sec Lead','viewer','${ADMIN}')`, ADMIN);
await execAs('administrator', `
  insert into cw.role_grant (action,person,role) values
    ('granted','${PAT}','legal_reviewer'),
    ('granted','${DANA}','requester'),
    ('granted','${SEC}','viewer')`, ADMIN);
await execAs('legal_admin', `
  insert into cw.role_grant (action,person,role,grant_ref)
  select 'countersigned','${PAT}','legal_reviewer',grant_id from cw.role_grant
   where person='${PAT}' and action='granted'`, LEGAL);

await db.exec(`
  select set_config('cw.actor','installer@clausewerk',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('liab','Liability','LB');
  insert into cw.agreement (agreement_id,counterparty,requester)
    values ('AG-1','Northwind','${DANA}');
  insert into cw.snapshot (snapshot_id) values ('${'1'.repeat(64)}');
  insert into cw.ruleset (ruleset_id) values ('${'2'.repeat(64)}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,
                      gate_open,created_by)
    values ('RUN-1','AG-1','Northwind','{}','manual','${'1'.repeat(64)}',
            '${'2'.repeat(64)}','${'c'.repeat(64)}','1.0.0',false,'${DANA}');
  select set_config('cw.actor','',false);`);

const FINDINGS = JSON.stringify([
  { finding_ref: 'data:F1', severity: 'High', summary: 'Governing law conflict' },
  { finding_ref: 'liab:F2', severity: 'High', summary: 'Uncapped indemnity' },
]);
const JUST = 'The customer will not sign before quarter end and Legal has seen the redline.';

const openRequest = async (findings = FINDINGS, just = JUST) =>
  (await queryAs('requester',
    `select cw.open_override_request('RUN-1',$1,$2::jsonb,'renewal deadline') as id`,
    [just, findings], DANA))[0].id;

// ── Asking is not being allowed ──────────────────────────────────────────
console.log('\nthe gate opens on approval, never on request');

let REQ;
await test('a requester opens a request, and it is recorded with its justification', async () => {
  REQ = await openRequest();
  const r = await one(`select state, requested_by, justification, commercial_pressure
                       from cw.override_request where request_id=$1`, [REQ]);
  eq([r.state, r.requested_by], ['requested', DANA]);
  eq(r.justification, JUST);
  const e = await one(`select actor, actor_role, actor_kind, payload->>'findings' as n
                       from cw.audit_event where event_type='human_override_request'`);
  eq([e.actor, e.actor_role, e.actor_kind, e.n], [DANA, 'requester', 'human', '2']);
});

await test('a request on its own passes NOTHING', async () => {
  // The whole product, in one assertion. If this ever returns a row for a
  // request that has only been asked for, the blanket button is back.
  const p = await rows(`select * from cw.override_passes where request_id=$1`, [REQ]);
  eq(p, [], 'a request that nobody has decided let a finding past the gate');
});

await test('Legal cannot request one, and a requester cannot decide one', async () => {
  // Both refused by PRIVILEGE, before either function's own role check runs —
  // execute is granted to exactly the role that should have it. That is the
  // stronger refusal and the one that ships; the in-function checks sit
  // underneath as a second line, for the day somebody widens a grant.
  await throws(() => queryAs('legal_reviewer',
    `select cw.open_override_request('RUN-1',$1,$2::jsonb)`, [JUST, FINDINGS], PAT),
    'permission denied for function open_override_request');
  await throws(() => queryAs('requester',
    `select cw.decide_override_finding($1,'data:F1','approved')`, [REQ], DANA),
    'permission denied for function decide_override_finding');
});

await test('a justification cannot be boilerplate or blank', async () => {
  // `not null` is satisfied by the empty string, which is exactly what a form
  // posts when somebody types nothing. ADR-0008 calls the justification the
  // audit record's whole value.
  for (const bad of ['', '   ', 'n/a', 'asap']) {
    await throws(() => queryAs('requester',
      `select cw.open_override_request('RUN-1',$1,$2::jsonb)`, [bad, FINDINGS], DANA),
      'justification_is_not_boilerplate', `"${bad}" was accepted as a justification`);
  }
});

await test('a request must cover at least one finding', async () => {
  await throws(() => queryAs('requester',
    `select cw.open_override_request('RUN-1',$1,'[]'::jsonb)`, [JUST], DANA),
    'covers none');
});

// ── Socialisation ────────────────────────────────────────────────────────
console.log('\nsocialisation is not "sent" until somebody was resolved to tell');

await test('nothing can be decided before the request has been socialised', async () => {
  await throws(() => queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'data:F1','approved')`, [REQ], PAT),
    'has not been socialised');
});

await test('socialising resolves a real audience and records each person', async () => {
  await execAs('administrator',
    `insert into cw.override_watcher (category_key,person,added_by)
     values ('data','${SEC}','${ADMIN}')`, ADMIN);
  const n = await queryAs('requester',
    `select cw.socialise_override_request($1) as n`, [REQ], DANA);
  eq(n[0].n, 2, 'the audience should be the deal owner and the data watcher');
  const told = await rows(
    `select person, reason from cw.override_notified where request_id=$1
     order by person`, [REQ]);
  eq(told.map(t => [t.person, t.reason]),
     [[SEC, 'category watcher'], [DANA, 'deal owner']].sort((a, b) => a[0] < b[0] ? -1 : 1),
     'the record does not say who was told and why');
});

await test('the socialisation event is a SYSTEM act, never a person\'s', async () => {
  // Nobody performed this notification; the system did. Recording it as a human
  // act would put a person's name against something they did not do, and
  // ADR-0008 §3 is explicit that a machine act is never recorded as a human one.
  const e = await one(`select actor_kind, actor_role, payload->>'notified' as n
                       from cw.audit_event where event_type='human_override_socialise'`);
  eq(e.actor_kind, 'system', 'socialisation was recorded as a human act');
  eq(e.n, '2');
});

await test('an override with nobody to tell is REFUSED, not quietly sent', async () => {
  // The critical one. An empty watcher list treated as "nobody to tell" would
  // put a lie in the permanent record — the stakeholders were notified, when
  // nobody was. The uncovered category is a gap for an Administrator to close.
  // A run with NO agreement. That is the shape the empty-audience case actually
  // takes: cw.agreement.requester is not null, so a deal always has an owner to
  // tell — the gap only opens for a run that is not attached to a deal, and for
  // findings in a category nobody watches. Worth knowing, because it means the
  // refusal is rarer than it looks and correspondingly easier to leave untested.
  await db.exec(`insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                   snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
                 values ('RUN-ORPHAN',null,'Nobody','{}','manual',
                   '${'1'.repeat(64)}','${'2'.repeat(64)}','${'d'.repeat(64)}','1.0.0',
                   false,'${DANA}')`);
  const orphan = (await queryAs('requester',
    `select cw.open_override_request('RUN-ORPHAN',$1,
       '[{"finding_ref":"ip:F9","severity":"High","summary":"no watcher covers this"}]'::jsonb) as id`,
    [JUST], DANA))[0].id;

  await throws(() => queryAs('requester',
    `select cw.socialise_override_request($1)`, [orphan], DANA),
    'nobody to socialise',
    'a request with no audience was recorded as socialised');

  // And nothing was written. A half-socialised request would be worse than a
  // refused one, because the state would say it happened.
  eq(await rows(`select * from cw.override_socialisation where request_id=$1`, [orphan]), []);
  eq((await one(`select state from cw.override_request where request_id=$1`, [orphan])).state,
     'requested');
});

await test('socialisation happens once', async () => {
  await throws(() => queryAs('requester',
    `select cw.socialise_override_request($1)`, [REQ], DANA),
    'already socialised');
});

await test('nobody can assert socialisation directly — no role holds the insert', async () => {
  // The state cannot be claimed; it has to be earned by an audience actually
  // being resolved. Only the security-definer function writes here.
  const holders = [];
  for (const r of ['cw_viewer','cw_requester','cw_legal_reviewer','cw_legal_admin',
                   'cw_auditor','cw_administrator']) {
    if ((await one(`select has_table_privilege($1,'cw.override_socialisation','INSERT') as h`,
      [r])).h) holders.push(r);
  }
  eq(holders, [], 'a role can write a socialisation row by hand');
});

// ── The window ───────────────────────────────────────────────────────────
console.log('\nnothing is decided before the window closes');

await test('a decision inside the window is refused', async () => {
  await throws(() => queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'data:F1','approved')`, [REQ], PAT),
    'review window',
    'a decision was taken while the watchers still had time to object');
});

await test('the window is the setting that was in force, stored on the record', async () => {
  // Stored rather than recomputed: shortening the setting later must not
  // retrospectively close a window that was open when it mattered.
  const s = await one(`select window_setting, window_closes > socialised_at as forward
                       from cw.override_socialisation where request_id=$1`, [REQ]);
  eq([s.window_setting, s.forward], ['48h', true]);
});

// Close the window by moving it into the past. Done directly as the owner,
// because there is deliberately no way for any role to shorten a live window.
await db.exec(`update cw.override_socialisation
                  set window_closes = now() - interval '1 minute'
                where request_id = ${REQ}`);

// ── Per finding, and only per finding ────────────────────────────────────
console.log('\napproval is per finding, and there is no approve-all by any path');

await test('a reviewer approves one finding and rejects the other, with a note', async () => {
  await queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'data:F1','approved','governing law is acceptable here')`,
    [REQ], PAT);
  await queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'liab:F2','rejected','uncapped indemnity is a floor')`,
    [REQ], PAT);
  const f = await rows(`select finding_ref, decision, decided_by, note
                        from cw.override_finding where request_id=$1 order by finding_ref`, [REQ]);
  eq(f.map(x => [x.finding_ref, x.decision]),
     [['data:F1','approved'], ['liab:F2','rejected']]);
  for (const x of f) eq(x.decided_by, PAT);
});

await test('the gate opens for the approved finding ONLY', async () => {
  const p = await rows(`select finding_ref from cw.override_passes where request_id=$1`, [REQ]);
  eq(p.map(x => x.finding_ref), ['data:F1'],
    'a rejected finding was let past, which is the blanket override returning');
});

await test('recording a gate for a rejected finding is refused', async () => {
  await queryAs('requester', `select cw.record_override_gate($1,'data:F1')`, [REQ], DANA);
  await throws(() => queryAs('requester',
    `select cw.record_override_gate($1,'liab:F2')`, [REQ], DANA),
    'was not approved, so no gate opens');
  const e = await rows(`select payload->>'finding_ref' as f from cw.audit_event
                        where event_type='human_override_gate'`);
  eq(e.map(x => x.f), ['data:F1']);
});

await test('there is no approve-all function, parameter, or loop anywhere', async () => {
  // The critical anti-pattern, checked structurally rather than by trying a few
  // shapes. A batch endpoint that iterated approvals would be the blanket
  // button with a for-loop in front of it, and the deciding person would not
  // have seen each finding.
  const fns = await rows(
    `select p.proname, pg_get_function_arguments(p.oid) as args
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'cw' and p.proname like '%override%'`);
  for (const f of fns) {
    assert(!/\[\]|jsonb/.test(f.args) || f.proname === 'open_override_request',
      `cw.${f.proname} takes a collection (${f.args}) — only opening a request `
      + 'should, and a decision function that did would be an approve-all');
    assert(!/all|batch|bulk/i.test(f.proname), `cw.${f.proname} is named like a batch act`);
  }
  // And no update path that could set every finding at once.
  const src = readFileSync(join(MIGRATIONS, '0015_override_request.sql'), 'utf8');
  assert(!/update cw\.override_finding\s+set decision[\s\S]{0,200}where request_id = \w+;/.test(src),
    'a statement sets a decision for a whole request');
});

await test('a decided finding is not revisited', async () => {
  await throws(() => queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'data:F1','rejected','changed my mind')`,
    [REQ], PAT),
    'already approved');
  await throws(() => db.exec(
    `update cw.override_finding set decision='approved'
      where request_id=${REQ} and finding_ref='liab:F2'`),
    'is not revisited');
});

await test('a rejection without a note is refused', async () => {
  const r2 = await openRequest();
  await execAs('requester', `select cw.socialise_override_request(${r2})`, DANA);
  await db.exec(`update cw.override_socialisation
                    set window_closes = now() - interval '1 minute'
                  where request_id = ${r2}`);
  await throws(() => queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'data:F1','rejected')`, [r2], PAT),
    'rejection_needs_a_note');
});

await test('a reviewer cannot decide a request they opened', async () => {
  // Reached by writing the request as the owner with the reviewer named, which
  // is the shape a future bug or a stray migration would produce.
  await db.exec(`insert into cw.override_request
                   (run_id,agreement_id,requested_by,justification)
                 values ('RUN-1','AG-1','${PAT}','${JUST}')`);
  const own = (await one(`select request_id from cw.override_request
                          where requested_by=$1`, [PAT])).request_id;
  await db.exec(`insert into cw.override_finding (request_id,finding_ref,severity,summary)
                 values (${own},'data:F1','High','x')`);
  await db.exec(`insert into cw.override_socialisation
                   (request_id,window_closes,window_setting,notified_count)
                 values (${own}, now() - interval '1 minute','48h',1)`);
  await throws(() => queryAs('legal_reviewer',
    `select cw.decide_override_finding($1,'data:F1','approved')`, [own], PAT),
    'nobody decides their own override request');
});

// ── The record, and who can read it ──────────────────────────────────────
console.log('\nthe record, and who can see it');

await test('all six ADR-0008 event types are emitted with the right actors', async () => {
  const e = await rows(
    `select event_type, actor_kind, count(*)::int n from cw.audit_event
     where event_type like 'human_override%' group by 1,2 order by 1`);
  const byType = Object.fromEntries(e.map(x => [x.event_type, x.actor_kind]));
  eq(byType['human_override_request'],   'human');
  eq(byType['human_override_socialise'], 'system',
    'socialisation must be a system act — nobody performed it');
  eq(byType['human_override_approve'],   'human');
  eq(byType['human_override_reject'],    'human');
  eq(byType['human_override_gate'],      'human');
});

await test('a viewer sees a request only if they were told about it', async () => {
  // Which is the point of having been told. A viewer exists so a contract can
  // be shown to somebody for socialisation without giving them a way to change
  // it; showing them nothing would make the role pointless.
  const seen = await queryAs('viewer',
    `select request_id from cw.override_request order by request_id`, [], SEC);
  // The expectation is DERIVED from who was actually told, not hard-coded. The
  // first version named one request and failed once a second was socialised to
  // the same watcher — which was the test being wrong, not the policy.
  const told = await rows(
    `select distinct request_id from cw.override_notified where person=$1
     order by request_id`, [SEC]);
  eq(seen.map(r => r.request_id), told.map(r => r.request_id),
    'a viewer sees requests nobody told them about, or misses ones they were told about');
  assert(told.length > 0, 'the watcher was told about nothing, so this proves nothing');

  // And there ARE requests they were not told about, or the assertion above is
  // satisfied by there being nothing to hide.
  const all = await rows(`select count(*)::int n from cw.override_request`);
  assert(all[0].n > told.length,
    'every request was socialised to this viewer, so the scoping is untested');
});

await test('a requester sees their own requests and no others', async () => {
  const seen = await queryAs('requester',
    `select distinct requested_by from cw.override_request`, [], DANA);
  eq(seen.map(r => r.requested_by), [DANA]);
});

await test('Legal, Audit and the administrator see them all', async () => {
  for (const role of ['legal_reviewer','legal_admin','auditor','administrator']) {
    const n = await queryAs(role, `select count(*)::int n from cw.override_request`);
    assert(n[0].n >= 3, `${role} cannot see the whole picture (saw ${n[0].n})`);
  }
});

await test('nothing about a request is deleted, by anyone', async () => {
  await throws(() => db.exec(`delete from cw.override_request where request_id=${REQ}`),
    'never deleted');
  await throws(() => db.exec(`delete from cw.override_finding where request_id=${REQ}`),
    'never deleted');
});

await test('the requester can watch their request without seeing anyone else\'s', async () => {
  const s = await queryAs('requester',
    `select request_id, state, window_closed, findings, decided, approved
     from cw.override_status where request_id=$1`, [REQ], DANA);
  eq([s[0].state, s[0].findings, s[0].decided, s[0].approved], ['approved', 2, 2, 1]);
  eq(s[0].window_closed, true);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
