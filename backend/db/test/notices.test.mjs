// The notice record does what 0064 promises, and refuses the rest.
//
// FOUR GUARANTEES, one per rule in the migration's header. Each is written as
// the failure it prevents rather than as the feature it enables:
//
//   1. A notice cannot cite something its raiser cannot see. Without this the
//      subject reference is a free-text field with extra steps, and the
//      administrator — who deliberately cannot read contract operations —
//      could narrate them in prose.
//   2. A notice cannot be raised to a role the route table does not permit,
//      and naming an individual is not a way around that table.
//   3. An open notice reaches the recipient's waiting list, which is the one
//      derivation the workspace panel and the daily digest both read.
//   4. Only somebody the notice was addressed to can acknowledge it, and
//      nothing acknowledges itself.
//
//   node db/test/notices.test.mjs

// READ THROUGH cw.*_state_all, THE UNSCOPED DERIVATION (0071). These suites
// run as the database owner, where cw.app_role() is null — so the people-facing
// cw.notice_state and cw.obligation_state, which scope on app_role(), correctly
// answer nothing here. What is asserted below is the DERIVATION (open versus
// acknowledged, due versus overdue, who closed it), and that is what _all is.
// Whether the scoping works is asserted where the scoping lives:
// views-are-not-policies.test.mjs and doorway/test_reads.py.

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
const { queryAs, mustWrite, mustNotWrite } = roleHelpers(db);

const ADMIN = 'admin@clausewerk';
const LEGAL = 'legal@clausewerk';
const BUYER = 'buyer@clausewerk';
// THE BYSTANDER, and the choice matters. A requester would prove nothing about
// the addressing rule: they cannot SEE a notice raised to Legal, so the policy's
// `exists` fails on visibility long before it reaches the addressing clause, and
// relaxing that clause changes nothing they can observe. A Legal reviewer reads
// every notice and is addressed by none of them — which is exactly the person
// the rule is about. The mutation harness found this; the first version of the
// test below used the requester and passed with the guarantee broken.
const REVIEWER = 'reviewer@clausewerk';

// ── The smallest world in which any of this means anything ─────────────────
// Four people with effective roles, and ONE REAL SUBJECT for a notice to cite.
//
// THE SUBJECT IS A HEALTH TILE, and it used to be an intake question-set gap.
// 0067 removed that surface and the `intake_probe` subject kind with it, so
// every fixture below moved to a health tile — the same shape of subject (a
// row on a surface the administrator reads) attached to a kind that still has
// a live screen behind it. cw.health_summary names its tiles as constants, so
// the tile below exists on an empty system, which is what makes it a fixture
// rather than a thing that has to be manufactured first.
const TILE = 'audit chain';

await db.exec(`
  select set_config('cw.actor', 'owner@clausewerk', false);
  insert into cw.account (person, display_name, unit, role, created_by) values
    ('${ADMIN}', 'The Administrator', 'Ops', 'administrator', 'owner@clausewerk'),
    ('${LEGAL}', 'Legal Admin', 'Legal', 'legal_admin', 'owner@clausewerk'),
    ('${BUYER}', 'A Buyer', 'Procurement', 'requester', 'owner@clausewerk'),
    ('${REVIEWER}', 'A Reviewer', 'Legal', 'legal_reviewer', 'owner@clausewerk');
  insert into cw.role_grant (action, person, role, acted_by, reason) values
    ('granted', '${ADMIN}', 'administrator', 'owner@clausewerk', 'fixture'),
    ('granted', '${LEGAL}', 'legal_admin', 'owner@clausewerk', 'fixture'),
    ('granted', '${BUYER}', 'requester', 'owner@clausewerk', 'fixture'),
    ('granted', '${REVIEWER}', 'legal_reviewer', 'owner@clausewerk', 'fixture');
`);

console.log('\nthe subject a notice can be raised about is real');

await test('the health surface sees the tile (guards a vacuous pass)', async () => {
  const seen = await queryAs('administrator',
    'select tile from cw.health_summary where tile = $1', [TILE], ADMIN);
  assert(seen.length === 1,
    'the fixture tile is not on the administrator\'s health surface; every '
    + 'test below would then be asserting about an empty world');
});

await test('a subject kind with no surface behind it is gone (0067)', async () => {
  // The removal itself, checked as a SYSTEM fact rather than as a word: the
  // route table no longer offers any pair for the retired kind, so there is
  // nothing an administrator could raise about it even if a screen asked.
  const routes = await rows(
    "select 1 from cw.notice_route where subject_kind = 'intake_probe'");
  eq(routes, [],
    'the intake-probe route survived the removal of the surface it was '
    + 'raised from, so the kind is offerable with nothing behind it');
});

console.log('\nrule 1 · a notice cites something its raiser can see');

await test('the administrator may raise the gap they can actually see', async () => {
  await mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('ignored@clausewerk', 'legal_admin', 'health_tile', '${TILE}',
            'Placeholder: this check is not coming back clean.')`, [], ADMIN);
  const [raised] = await rows('select raised_by, to_role from cw.notice');
  eq(raised.raised_by, ADMIN,
    'the raiser was taken from the INSERT rather than from the connection — '
    + 'the one thing every act in this system binds');
});

await test('a tile nobody has ever seen cannot be cited', async () => {
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'health_tile', 'a-tile-on-no-screen', 'x')`,
    [], ADMIN), 'does not resolve',
    'a notice was accepted citing a tile that does not exist. The subject '
    + 'reference is now a free-text field, which is rule 1 broken');
});

await test('an unreachable person who is perfectly reachable cannot be cited', async () => {
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'notification_gap', '${BUYER}', 'x')`,
    [], ADMIN), 'does not resolve',
    'nothing is waiting on this person, so they are not in cw.notification_gap '
    + 'and citing them should have been refused');
});

console.log('\nrule 2 · who may notify whom is a table');

await test('a pair absent from cw.notice_route is refused', async () => {
  // The administrator has no route for a failing check to a REQUESTER. Nothing
  // about that is arbitrary — a requester cannot answer for the evidence — and
  // the refusal names the table rather than the role.
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'requester', 'health_tile', '${TILE}', 'x')`,
    [], ADMIN), 'cw.notice_route',
    'a notice landed on a role the route table does not permit');
});

await test('naming an individual is not a way around the route table', async () => {
  // THE HOLE THIS CLOSES. If a person notice were checked only for existence,
  // the whole route table would be one field away from irrelevant: address it
  // to the requester by name instead of by role and it lands anyway.
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_person, subject_kind, subject_ref, note)
    values ('x', '${BUYER}', 'health_tile', '${TILE}', 'x')`,
    [], ADMIN), 'cw.notice_route',
    'a person notice bypassed the route table — the recipient must be routed '
    + 'by the role they actually hold');
});

await test('a requester cannot raise a notice at all, having no route', async () => {
  await throws(() => mustWrite('requester', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'health_tile', '${TILE}', 'x')`,
    [], BUYER), 'cw.notice_route',
    'a role with no seeded route raised one anyway');
});

await test('a viewer holds no grant on the notice record at all', async () => {
  await mustNotWrite('viewer', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'health_tile', '${TILE}', 'x')`, []);
});

console.log('\nrule 3 · it arrives where people already look');

await test('an open notice is on the recipient role\'s waiting list', async () => {
  const waiting = await queryAs('legal_admin',
    `select kind, subject_ref from cw.waiting_for('${LEGAL}', 'legal_admin')
      where kind = 'notice'`, [], LEGAL);
  assert(waiting.length === 1,
    `the notice did not reach cw.waiting_for; got ${JSON.stringify(waiting)}. `
    + 'The workspace panel and the daily digest both read this derivation, so '
    + 'a notice missing here is a notice nobody is told about');
});

await test('it is NOT on somebody else\'s waiting list', async () => {
  const waiting = await queryAs('requester',
    `select kind from cw.waiting_for('${BUYER}', 'requester')
      where kind = 'notice'`, [], BUYER);
  eq(waiting, [], 'a notice addressed to Legal appeared on a requester\'s list');
});

await test('every other branch of waiting_for still works', async () => {
  // THE TRAP THIS SUITE EXISTS TO CATCH (memory.md S220). 0064 re-creates
  // cw.waiting_for, which 0041, 0044 and 0059 also re-create. A branch dropped
  // while carrying the body across would remove a whole class of notification
  // and nothing else in this file would notice.
  const branches = await rows(
    `select pg_get_functiondef(p.oid) as body from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'cw' and p.proname = 'waiting_for'`);
  const body = branches[0].body;
  for (const kind of ['obligation', 'override_socialisation', 'renewal_window',
                      'envelope_out', 'countersign', 'review_ticket',
                      'review_escalation', 'notice']) {
    assert(body.includes(`'${kind}'`),
      `cw.waiting_for lost its ${kind} branch when 0064 re-created it`);
  }
});

console.log('\nrule 4 · acknowledging is an act, by somebody it was addressed to');

await test('the addressed role can acknowledge', async () => {
  await mustWrite('legal_admin', `
    insert into cw.notice_acknowledgement (notice_id, acknowledged_by, note)
    select notice_id, 'ignored@clausewerk', 'Placeholder: fixed the term list.'
    from cw.notice order by notice_id limit 1`, [], LEGAL);
  const [state] = await rows('select state, acknowledged_by from cw.notice_state_all');
  eq(state.state, 'acknowledged', 'the derived state did not move');
  eq(state.acknowledged_by, LEGAL,
    'the acknowledger came from the INSERT rather than the connection');
});

await test('an acknowledged notice leaves the waiting list', async () => {
  const waiting = await queryAs('legal_admin',
    `select kind from cw.waiting_for('${LEGAL}', 'legal_admin')
      where kind = 'notice'`, [], LEGAL);
  eq(waiting, [], 'an acknowledged notice is still being waited on');
});

await test('a bystander cannot acknowledge somebody else\'s notice', async () => {
  await db.exec(`select set_config('cw.actor', 'owner@clausewerk', false);
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('${ADMIN}', 'legal_admin', 'health_tile', '${TILE}', 'second one');`);
  const [second] = await rows(
    'select notice_id from cw.notice order by notice_id desc limit 1');
  // Non-vacuity: the reviewer CAN see the notice — Legal reads them all — so
  // the refusal below is about who it was addressed to and nothing else.
  const visible = await queryAs('legal_reviewer',
    'select notice_id from cw.notice where notice_id = $1',
    [second.notice_id], REVIEWER);
  assert(visible.length === 1,
    'the bystander cannot even see this notice, so refusing them proves '
    + 'nothing about the addressing rule');

  await mustNotWrite('legal_reviewer', `
    insert into cw.notice_acknowledgement (notice_id, acknowledged_by)
    values (${second.notice_id}, 'x')`, []);
});

await test('the record is append-only, both halves', async () => {
  await throws(() => db.exec("update cw.notice set note = 'edited'"),
    'append-only', 'a raised notice could be reworded after the fact');
  await throws(() => db.exec('delete from cw.notice_acknowledgement'),
    'append-only', 'an acknowledgement could be withdrawn');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
