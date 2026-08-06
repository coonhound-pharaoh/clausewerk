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
// Two people with effective roles, and ONE REAL GAP for a notice to cite. The
// gap is manufactured the way the system makes them: an intake classification
// is appended to the chain with an unmatched probe on it, which is exactly
// what cw.intake_question_coverage reads.
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

// One classification with one unmatched probe, written the way intake.py
// writes it. Owner-run, because the point of the fixture is the GAP existing,
// not who created it.
await db.exec(`
  select cw.audit('intake_classified', 'Northwind', jsonb_build_object(
    'source', 'intake', 'answers', 2,
    'risks_proposed', jsonb_build_array('Data Privacy'),
    'unmatched', jsonb_build_array('need'),
    'classified_by', 'doorway.intake.classify_answers'));
`);

console.log('\nthe gap a notice can be raised about is real');

await test('the coverage view sees the unmatched probe (guards a vacuous pass)', async () => {
  const seen = await queryAs('administrator',
    'select probe, times_unmatched from cw.intake_question_coverage', [], ADMIN);
  eq(seen.map(r => r.probe), ['need'],
    'the fixture classification never reached the coverage view; every test '
    + 'below would then be asserting about an empty world');
});

await test('nothing classified yet is NOT rendered as nothing unmatched', async () => {
  // The summary's null share. Asserted on the shape rather than the number:
  // with one classification and no answers-without-a-match the share is a
  // real figure; what must never happen is a NULL becoming a 0 on the way out.
  const [total] = await queryAs('administrator',
    'select classifications, unmatched_share from cw.intake_coverage_summary',
    [], ADMIN);
  assert(Number(total.classifications) === 1, 'the fixture did not land');
  assert(total.unmatched_share !== null,
    'this fixture HAS answers, so the share must be a number here — if this '
    + 'fails the case-when in cw.intake_coverage_summary has inverted');
});

console.log('\nrule 1 · a notice cites something its raiser can see');

await test('the administrator may raise the gap they can actually see', async () => {
  await mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('ignored@clausewerk', 'legal_admin', 'intake_probe', 'need',
            'Placeholder: this question is classifying nothing.')`, [], ADMIN);
  const [raised] = await rows('select raised_by, to_role from cw.notice');
  eq(raised.raised_by, ADMIN,
    'the raiser was taken from the INSERT rather than from the connection — '
    + 'the one thing every act in this system binds');
});

await test('a probe nobody has ever failed to classify cannot be cited', async () => {
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'intake_probe', 'a-probe-with-no-gap', 'x')`,
    [], ADMIN), 'does not resolve',
    'a notice was accepted citing a gap that does not exist. The subject '
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
  // The administrator has no route for an intake gap to a REQUESTER. Nothing
  // about that is arbitrary — a requester cannot edit the question set — and
  // the refusal names the table rather than the role.
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'requester', 'intake_probe', 'need', 'x')`,
    [], ADMIN), 'cw.notice_route',
    'a notice landed on a role the route table does not permit');
});

await test('naming an individual is not a way around the route table', async () => {
  // THE HOLE THIS CLOSES. If a person notice were checked only for existence,
  // the whole route table would be one field away from irrelevant: address it
  // to the requester by name instead of by role and it lands anyway.
  await throws(() => mustWrite('administrator', `
    insert into cw.notice (raised_by, to_person, subject_kind, subject_ref, note)
    values ('x', '${BUYER}', 'intake_probe', 'need', 'x')`,
    [], ADMIN), 'cw.notice_route',
    'a person notice bypassed the route table — the recipient must be routed '
    + 'by the role they actually hold');
});

await test('a requester cannot raise a notice at all, having no route', async () => {
  await throws(() => mustWrite('requester', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'intake_probe', 'need', 'x')`,
    [], BUYER), 'cw.notice_route',
    'a role with no seeded route raised one anyway');
});

await test('a viewer holds no grant on the notice record at all', async () => {
  await mustNotWrite('viewer', `
    insert into cw.notice (raised_by, to_role, subject_kind, subject_ref, note)
    values ('x', 'legal_admin', 'intake_probe', 'need', 'x')`, []);
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
  const [state] = await rows('select state, acknowledged_by from cw.notice_state');
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
    values ('${ADMIN}', 'legal_admin', 'intake_probe', 'need', 'second one');`);
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
