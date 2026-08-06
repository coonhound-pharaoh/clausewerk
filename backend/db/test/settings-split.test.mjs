// The settings split and the watcher lists — 0013 part 3 (WP-U03).
//
// One guarantee with two halves, and the second half is the one that gets
// forgotten:
//
//   · an Administrator may change an operational setting and may NOT change an
//     owner decision;
//   · a Legal admin may change an owner decision and may NOT change an
//     operational one.
//
// The second half matters because the easy implementation — "legal_admin writes
// everything, administrator additionally writes operational rows" — reads like a
// delegation and is not one. A Legal admin setting the session length is doing
// machine stewardship inside the content role, which is the mixing the sixth
// role exists to end. So the refusal is exercised in both directions.
//
// And the watcher list: the Administrator decides WHO IS TOLD, never WHO
// DECIDES, and every change to that list lands on the chain — a person quietly
// dropped off a notification list is silence about who was silenced, and it is
// the failure nobody notices because nothing visibly happens afterwards.
//
//   node db/test/settings-split.test.mjs

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

await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada Okafor',
                                   '${LEGAL}','Rae Vance','Head Office')`);
await db.exec(`
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('liab','Liability','LB'), ('ip','IP','IP');`);
await execAs('administrator',
  `insert into cw.account (person,display_name,role,created_by)
   values ('${PAT}','Pat Nkemi','requester','${ADMIN}')`, ADMIN);

const value = async (k) => (await one(
  `select value from cw.governance_setting where key=$1`, [k])).value;

// ── The four operational rows exist and say what they do ──────────────────
console.log('\nfour operational settings, each with a default and a purpose');

await test('exactly the eleven named rows are operational, and no others', async () => {
  // Five since 0042: D-3 settled the existing notification_digest row and
  // added the immediate list beside it — the fifth row arrived as a proposal
  // with an owner decision behind it, which is exactly what this pin is for.
  // Nine since 0044/0045 (RP-02/RP-03): the review-escalation window and the
  // three friction-estimate assumptions, all engineering defaults, undecided —
  // each changes what a report says or when a person is nagged, never what
  // anyone may do.
  //
  // Eleven since 0066 (AI-3): the model budget — how many calls a day, and how
  // much one call may cost. They arrived as a PROPOSAL THE OWNER ACCEPTED on
  // 2026-08-04 (memory.md S225), which is precisely what this pin asks of a new
  // row. Operational because changing them changes what the system spends and
  // how often it asks a model, never what anybody is allowed to decide — and
  // running out of budget does not block an intake, it falls back to the
  // deterministic classifier and says so.
  const r = await rows(
    `select key from cw.governance_setting where kind='operational' order by key`);
  eq(r.map(x => x.key),
    ['ai_calls_per_day','ai_tokens_per_call',
     'friction_hourly_rate_usd','friction_hours_per_escalation',
     'friction_hours_per_round','notification_digest',
     'notification_immediate_list','override_review_window',
     'review_escalation_days','session_length','ticket_expiry'],
    'the operational set has drifted — a new row is a proposal, not a drive-by');
});

await test('every operational row ships with a value and a stated purpose', async () => {
  const bad = await rows(
    `select key from cw.governance_setting
     where kind='operational'
       and (value is null or btrim(value)='' or purpose is null or btrim(purpose)='')`);
  eq(bad.map(x => x.key), [],
    'a settings pane whose rows need a developer to explain them is one nobody touches');
});

await test('every pre-existing setting became an owner decision, not an operational one', async () => {
  // The safe direction: nothing an administrator previously could not write
  // becomes writable by them through this migration.
  for (const k of ['sow_may_contradict_master','renewal_default_baseline',
                   'unedited_approval_threshold','owner_maps_to_application_role']) {
    const r = await one(`select kind from cw.governance_setting where key=$1`, [k]);
    eq(r.kind, 'owner_decision', `${k} was moved to the administrator's side`);
  }
});

await test('the four WP-U00 decisions are recorded as rows, decided, naming the decider', async () => {
  const r = await rows(
    `select key, value, decided, decided_by from cw.governance_setting
     where key in ('administrator_may_read_content','legal_role_grants_need_countersign',
                   'checkpoint_duty','workspace_model') order by key`);
  eq(r.length, 4, 'the owner decisions from WP-U00 are not all held as data');
  for (const x of r) {
    eq(x.decided, true, `${x.key} is recorded as undecided`);
    eq(x.decided_by, 'owner', `${x.key} does not name the owner as decider`);
  }
  eq((await one(`select value from cw.governance_setting where key='checkpoint_duty'`)).value,
     'administrator');
});

await test('a row cannot be both operational and an owner decision', async () => {
  // The mislabelling guard, in its most likely form: an "auto-approve
  // threshold" slipped in as a tuning knob. What decides adequate legal review
  // is content, and content is not ours.
  await throws(() => db.exec(
    `insert into cw.governance_setting (key,value,kind,is_owner_decision,rationale)
     values ('auto_approve_threshold','0.9','operational',true,'a tuning knob')`),
    'operational_is_never_an_owner_decision');
});

// ── The split, both ways ─────────────────────────────────────────────────
console.log('\nthe split cuts both ways');

await test('an administrator changes an operational setting, and it is audited', async () => {
  await mustWrite('administrator',
    `update cw.governance_setting set value='24h'
     where key='override_review_window' returning key`, [], ADMIN);
  eq(await value('override_review_window'), '24h');
  const e = await one(
    `select actor, actor_role, payload->>'from' as f, payload->>'to' as t,
            payload->>'kind' as kind
     from cw.audit_event where event_type='setting_changed' and subject=$1`,
    ['override_review_window']);
  eq([e.actor, e.actor_role, e.f, e.t, e.kind],
     [ADMIN, 'administrator', '48h', '24h', 'operational'],
     'an operational change is not fully on the record');
});

await test('an administrator cannot change an owner decision, and is TOLD why', async () => {
  // The message is asserted, not just the refusal, and that is the whole point
  // of this test rather than a flourish.
  //
  // Written the natural way — one policy per role, each with `kind` in its
  // USING clause — this refusal is silent: the row is invisible to the UPDATE,
  // the statement affects zero rows and raises nothing, and a console renders
  // that as a successful save while the screen and the database disagree. That
  // is finding D1. WP-U06 passes this message straight through to the person,
  // so it has to name the rule rather than say "no".
  await throws(() => queryAs('administrator',
    `update cw.governance_setting set value='library_standard'
     where key='renewal_default_baseline'`, [], ADMIN),
    'only a legal admin may change it');
  eq(await value('renewal_default_baseline'), 'executed_agreement');
});

await test('a legal admin changes an owner decision, and it is audited', async () => {
  await mustWrite('legal_admin',
    `update cw.governance_setting set value='0.85'
     where key='unedited_approval_threshold' returning key`, [], LEGAL);
  eq(await value('unedited_approval_threshold'), '0.85');
  const e = await one(
    `select actor_role, payload->>'kind' as kind from cw.audit_event
     where event_type='setting_changed' and subject='unedited_approval_threshold'`);
  eq([e.actor_role, e.kind], ['legal_admin','owner_decision']);
});

await test('a legal admin cannot change an operational setting — the other direction', async () => {
  // The half that gets forgotten. Legal setting the session length is machine
  // stewardship inside the content role.
  await throws(() => queryAs('legal_admin',
    `update cw.governance_setting set value='30d' where key='session_length'`,
    [], LEGAL),
    'only the administrator may change it');
  eq(await value('session_length'), '8h');
});

await test('nobody else changes anything at all', async () => {
  for (const role of ['viewer','requester','legal_reviewer','auditor']) {
    await mustNotWrite(role,
      `update cw.governance_setting set value='1h' where key='session_length'`);
    await mustNotWrite(role,
      `update cw.governance_setting set value='x' where key='renewal_default_baseline'`);
  }
});

await test('a row cannot change sides to make itself writable', async () => {
  // Without this the split is one UPDATE from meaningless: mark an owner
  // decision operational, then edit it, and each statement is individually
  // permitted. Refused for an application role by the trigger, and for the
  // owner too, who bypasses policies entirely.
  await throws(() => queryAs('administrator',
    `update cw.governance_setting set kind='operational'
     where key='renewal_default_baseline'`, [], ADMIN),
    'does not change sides');
  await throws(() => db.exec(
    `update cw.governance_setting set kind='operational'
     where key='renewal_default_baseline'`),
    'does not change sides');
});

await test('a setting key is its identity', async () => {
  await throws(() => db.exec(
    `update cw.governance_setting set key='something_else' where key='session_length'`),
    'is its identity');
});

await test('settings are never deleted, by anyone', async () => {
  await mustNotWrite('administrator',
    `delete from cw.governance_setting where key='session_length'`);
  await throws(() => db.exec(
    `delete from cw.governance_setting where key='session_length'`),
    'changed, never deleted');
});

await test('changing the rationale is recorded too, not just the value', async () => {
  // An owner decision whose reasoning is rewritten with the value left alone is
  // still a change to what the system says it decided and why.
  const before = await rows(`select seq from cw.audit_event
                             where event_type='setting_changed'`);
  await execAs('legal_admin',
    `update cw.governance_setting set rationale='a different reason entirely'
     where key='sow_may_contradict_master'`, LEGAL);
  const after = await rows(`select seq from cw.audit_event
                            where event_type='setting_changed'`);
  eq(after.length, before.length + 1, 'a rationale rewrite left no trace');
});

// ── Watchers ─────────────────────────────────────────────────────────────
console.log('\nwatcher lists: who is told, never who decides');

await test('an administrator adds a watcher, and it is audited', async () => {
  const w = await mustWrite('administrator',
    `insert into cw.override_watcher (category_key,person,added_by,added_at)
     values ('data','${PAT}','impostor@clausewerk','2000-01-01T00:00:00Z')
     returning watcher_id, added_by,
       added_at > now() - interval '1 minute' and added_at <= now()
         as added_time_is_fresh`, [], ADMIN);
  eq(w[0].added_by, ADMIN,
    'the caller-supplied adder entered the permanent watcher record');
  eq(w[0].added_time_is_fresh, true,
    'the caller-supplied watcher timestamp survived');
  const e = await one(`select subject, payload->>'person' as p,
                              payload->>'by' as added_by, actor_role
                       from cw.audit_event where event_type='watcher_added'`);
  eq([e.subject, e.p, e.actor_role], ['data', PAT, 'administrator']);
  eq(e.added_by, ADMIN,
    'the caller-supplied adder entered the watcher audit event');
});

await test('an always-watcher watches every category', async () => {
  await execAs('administrator',
    `insert into cw.override_watcher (category_key,person,added_by)
     values (null,'${LEGAL}','${ADMIN}')`, ADMIN);
  const c = await rows(`select category_key, watcher_count from cw.watcher_coverage
                        order by category_key`);
  const by = Object.fromEntries(c.map(r => [r.category_key, r.watcher_count]));
  eq(by.data, 2, 'the data category should see its own watcher plus the always-watcher');
  eq(by.ip,   1, 'a category with no watcher of its own should still see the always-watcher');
});

await test('watcher evidence cannot be redirected instead of removed', async () => {
  await throws(() => queryAs('administrator',
    `update cw.override_watcher
        set category_key = 'ip',
            person = '${LEGAL}',
            added_by = 'impostor@clausewerk',
            added_at = '2000-01-01T00:00:00Z'
      where person = '${PAT}' and category_key = 'data'`, [], ADMIN),
    'evidence is immutable',
    'the Administrator silently redirected an existing watcher record');
  const w = await one(
    `select category_key, person, added_by,
            added_at > now() - interval '1 minute' as added_at_is_original
       from cw.override_watcher
      where person = '${PAT}' and category_key = 'data'`);
  eq([w.category_key, w.person, w.added_by, w.added_at_is_original],
    ['data', PAT, ADMIN, true]);
});

await test('a category with nobody watching it is a visible gap, not a silence', async () => {
  // The product boundary in a view. The system's job ends at making the gap
  // visible; closing it belongs to whoever owns the category.
  await db.exec(`insert into cw.category (key,label,short) values ('tax','Tax','TX')`);
  await execAs('administrator',
    `update cw.override_watcher
        set removed_by='impostor@clausewerk',
            removed_at='2099-01-01T00:00:00Z'
     where person='${LEGAL}' and category_key is null`, ADMIN);
  const removed = await one(`select removed_at > now() - interval '1 minute'
                                   and removed_at <= now() as removed_time_is_fresh
                              from cw.override_watcher
                             where person='${LEGAL}' and category_key is null`);
  eq(removed.removed_time_is_fresh, true,
    'the caller-supplied watcher removal timestamp survived');
  const gaps = await rows(
    `select category_key from cw.watcher_coverage where watcher_count=0 order by category_key`);
  eq(gaps.map(g => g.category_key), ['ip','liab','tax'],
    'an uncovered category is not being surfaced as uncovered');
});

await test('removing a watcher lands on the chain — who was silenced, and by whom', async () => {
  const e = await one(`select subject, payload->>'person' as p, payload->>'by' as by
                       from cw.audit_event where event_type='watcher_removed'`);
  eq([e.subject, e.p, e.by], ['*', LEGAL, ADMIN]);
});

await test('a removed watcher cannot be rewritten', async () => {
  await throws(() => queryAs('administrator',
    `update cw.override_watcher
        set removed_by = '${PAT}', removed_at = now()
      where person = '${LEGAL}' and category_key is null`, [], ADMIN),
    'was removed and cannot be rewritten',
    'a removed watcher still accepted changes to its permanent evidence');
});

await test('a watcher is removed, never deleted', async () => {
  await mustNotWrite('administrator',
    `delete from cw.override_watcher where person='${PAT}'`);
  await throws(() => db.exec(`delete from cw.override_watcher where person='${PAT}'`),
    'removed, never deleted');
});

await test('a removal must name who did it and when', async () => {
  await throws(() => db.exec(
    `update cw.override_watcher set removed_at=now() where person='${PAT}'`),
    'may only be updated by recording its removal');
});

await test('the same person is not listed twice for one category', async () => {
  await throws(() => queryAs('administrator',
    `insert into cw.override_watcher (category_key,person,added_by)
     values ('data','${PAT}','${ADMIN}')`, [], ADMIN),
    'duplicate key',
    'a person listed twice is notified twice and must be removed twice');
});

await test('but can be re-added once removed', async () => {
  await execAs('administrator',
    `insert into cw.override_watcher (category_key,person,added_by)
     values (null,'${LEGAL}','${ADMIN}')`, ADMIN);
  const n = await one(`select watcher_count from cw.watcher_coverage where category_key='ip'`);
  eq(n.watcher_count, 1);
});

await test('nobody but the administrator maintains the list', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin','auditor']) {
    await mustNotWrite(role,
      `insert into cw.override_watcher (category_key,person,added_by)
       values ('liab','${PAT}','${role}')`);
    await mustNotWrite(role,
      `update cw.override_watcher set removed_by='${role}', removed_at=now()
       where person='${PAT}'`);
  }
});

await test('everyone can see who would be told — socialisation is not a secret', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin',
                      'auditor','administrator']) {
    const r = await queryAs(role, `select count(*)::int n from cw.override_watcher`);
    assert(r[0].n > 0, `${role} cannot read the watcher list`);
    const c = await queryAs(role, `select count(*)::int n from cw.watcher_coverage`);
    assert(c[0].n > 0, `${role} cannot read watcher coverage`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
