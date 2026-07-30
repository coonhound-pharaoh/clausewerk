// Review routing: the claim and the escalation (0044, RP-02).
//
// The guarantees:
//   · A claim names the CONNECTION's person, whatever the insert claimed, and
//     both taking and releasing are recorded acts.
//   · One live claim per ticket — a race between two reviewers resolves in
//     the database with one winner and one honest refusal.
//   · A decided ticket takes no claim.
//   · Only the two adjudicating roles claim; everyone signed in may look.
//   · The route is DERIVED: the owner comes from cw.ladder at read time, and
//     escalation is a predicate on age against a visible setting — no timer
//     job, no stored assignment to go stale.
//   · cw.waiting_for gains the review_escalation source: the named ladder
//     owner is told the queue has work NOBODY TOOK. (The OB-08 rule: a source
//     silently dropped from the union must be caught by a named test — this
//     file's last test is that test.)
//
//   node db/test/routing.test.mjs

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
const { queryAs, mustWrite, mustNotWrite } = roleHelpers(db);

const OWNER_OF_DATA = 'dana@cw';   // the ladder's named owner
const REVIEWER = 'ravi@cw';
const RIVAL = 'lena@cw';

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.ladder (category_key,severity,owner) values
    ('data','High','${OWNER_OF_DATA}');
  insert into cw.review_ticket
    (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
    values (null,'data','High','supplier-paper','VENDOR LANGUAGE',
            'Vendor keeps all telemetry.','someone@cw');
  insert into cw.review_ticket
    (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
    values (null,'data','High','human-escalated','EDITED BY LEGAL','Old wording.',
            'someone@cw');
  -- Decided as the act it is; a ticket is never born rejected.
  select set_config('cw.actor','legal@cw',false);
  update cw.review_ticket
     set state='rejected', decided_by='legal@cw', decided_on=now(),
         decision_note='below the floor'
   where ticket_id = 2;
  select set_config('cw.actor','owner@clausewerk',false);
`);

console.log('\nthe claim');

await test('a claim names the connection, whatever the insert claimed', async () => {
  await mustWrite('legal_reviewer', `
    insert into cw.ticket_claim (ticket_id, person)
    values (1, 'forged@cw')`, [], REVIEWER);
  const c = await one(`select person from cw.ticket_claim
                        where ticket_id=1 and released_at is null`);
  eq(c.person, REVIEWER, 'the claimer is the session, never the body');
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='ticket_claimed' and subject='1'`);
  eq(e.n, 1, 'taking a ticket is a recorded act');
});

await test('a race has one winner: the second claim is refused', async () => {
  await throws(() => queryAs('legal_admin',
    `insert into cw.ticket_claim (ticket_id) values (1)`, [], RIVAL),
    'ticket_claim_live');
});

await test('a decided ticket takes no claim', async () => {
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.ticket_claim (ticket_id) values (2)`, [], REVIEWER),
    'not pending');
});

await test('a requester may look at claims but never take one', async () => {
  await queryAs('requester', `select * from cw.ticket_claim`, [], 'rita@cw');
  await mustNotWrite('requester',
    `insert into cw.ticket_claim (ticket_id) values (1)`);
});

console.log('\nthe release');

await test('a claim is released, not edited, and release is recorded', async () => {
  await throws(() => queryAs('legal_admin',
    `update cw.ticket_claim set person='stolen@cw' where ticket_id=1`, [], RIVAL),
    'not edited');
  await mustWrite('legal_admin', `
    update cw.ticket_claim set released_by='x'
     where ticket_id=1 and released_at is null`, [], RIVAL);
  const c = await one(`select released_by from cw.ticket_claim where ticket_id=1`);
  eq(c.released_by, RIVAL,
    'a colleague may release an absent colleague — and is named for it');
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='ticket_claim_released' and subject='1'`);
  eq(e.n, 1);
  await throws(() => queryAs('legal_admin',
    `update cw.ticket_claim set released_by='x' where claim_id=1`, [], RIVAL),
    'already released');
});

console.log('\nthe route');

await test('an unclaimed ticket inside the window sits with the shared queue', async () => {
  const r = await queryAs('legal_reviewer',
    `select claimed_by, category_owner, escalated from cw.ticket_route
      where ticket_id=1`, [], REVIEWER);
  eq(r[0].claimed_by, null, 'the release above emptied the claim');
  eq(r[0].category_owner, OWNER_OF_DATA, 'the owner comes from the ladder');
  eq(r[0].escalated, false, 'three days have not passed');
});

await test('past the window, an unclaimed ticket escalates — by predicate, not by job', async () => {
  await db.exec(`reset role;
    select set_config('cw.actor','owner@clausewerk',false);
    update cw.governance_setting set value='0'
     where key='review_escalation_days';`);
  const r = await queryAs('legal_reviewer',
    `select escalated from cw.ticket_route where ticket_id=1`, [], REVIEWER);
  eq(r[0].escalated, true, 'nothing ran; the age crossed the line and the view says so');
});

await test('a fresh claim clears the escalation at once', async () => {
  await mustWrite('legal_reviewer',
    `insert into cw.ticket_claim (ticket_id) values (1)`, [], REVIEWER);
  const r = await queryAs('legal_reviewer',
    `select claimed_by, escalated from cw.ticket_route where ticket_id=1`,
    [], REVIEWER);
  eq(r[0].claimed_by, REVIEWER);
  eq(r[0].escalated, false, 'claimed work is not nagged to the owner');
});

console.log('\nthe derivation grows its routed source (OB-08 rule)');

await test('the named owner is told about work nobody took — review_escalation reaches cw.waiting_for', async () => {
  // Release Ravi's claim so ticket 1 is unclaimed and past the (zeroed) window.
  await db.exec(`reset role;
    select set_config('cw.actor','${REVIEWER}',false);
    set role cw_legal_reviewer;
    update cw.ticket_claim set released_by='x'
     where ticket_id=1 and released_at is null;
    reset role;`);
  const w = await rows(
    `select kind, subject_ref from cw.waiting_for('${OWNER_OF_DATA}','requester')
      where kind='review_escalation'`);
  eq(w.length, 1, 'this assertion is the named test that catches the source '
    + 'silently dropped from the union');
  eq(w[0].subject_ref, '1');
  const other = await rows(
    `select 1 from cw.waiting_for('nobody@cw','requester')
      where kind='review_escalation'`);
  eq(other.length, 0, "only the ladder's named owner is told");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
