// The model intake's budget and ledger do what 0066 promises (AI-3).
//
// WHAT IS ACTUALLY BEING GUARDED HERE, because none of it is about the model
// being any good — that is not a property of this schema and not testable from
// here.
//
//   1. THE LEDGER RECORDS FAILURES TOO. A call that could not be answered is a
//      row exactly like one that was. A ledger that only held successes would
//      make the model look more reliable than it is, in the one figure anybody
//      would budget from.
//   2. THE BUDGET IS THE SYSTEM'S, NOT THE CALLER'S. The daily count is over
//      EVERY call, whoever made it. Counting only your own would give each
//      requester their own private 200 a day, which is not a budget.
//   3. A REQUESTER SEES THEIR OWN CALLS AND NO OTHERS, even though the count
//      above is global. Those two are in tension and both are deliberate: you
//      may know the budget is spent without being shown whose work spent it.
//   4. THE LEDGER IS APPEND-ONLY, like every other record of something that
//      happened.
//
//   node db/test/model-intake.test.mjs

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

const ADMIN = 'admin@clausewerk';
const LEGAL = 'legal@clausewerk';
const DANA  = 'dana@clausewerk';
const BEN   = 'ben@clausewerk';

await db.exec(`
  select set_config('cw.actor', 'owner@clausewerk', false);
  insert into cw.account (person, display_name, unit, role, created_by) values
    ('${ADMIN}', 'The Administrator', 'Ops', 'administrator', 'owner@clausewerk'),
    ('${LEGAL}', 'Legal Admin', 'Legal', 'legal_admin', 'owner@clausewerk'),
    ('${DANA}', 'Dana Buyer', 'Procurement', 'requester', 'owner@clausewerk'),
    ('${BEN}', 'Ben Buyer', 'Procurement', 'requester', 'owner@clausewerk');
  insert into cw.role_grant (action, person, role, acted_by, reason) values
    ('granted', '${ADMIN}', 'administrator', 'owner@clausewerk', 'fixture'),
    ('granted', '${LEGAL}', 'legal_admin', 'owner@clausewerk', 'fixture'),
    ('granted', '${DANA}', 'requester', 'owner@clausewerk', 'fixture'),
    ('granted', '${BEN}', 'requester', 'owner@clausewerk', 'fixture');
`);

const record = (role, actor, outcome, reason = null) => mustWrite(role, `
  insert into cw.model_call (actor, purpose, model, model_version, outcome,
                             absent_reason, prompt_tokens, completion_tokens)
  values ('ignored@clausewerk', 'intake_manifest', 'gpt-4o-mini', 'gpt-4o-mini',
          '${outcome}', ${reason === null ? 'null' : `'${reason}'`}, 100, 20)`,
  [], actor);

console.log('\nthe budget the owner accepted is on the record');

await test('both budget numbers ship as operational settings with a value', async () => {
  const budget = await rows(
    `select key, value, kind from cw.governance_setting
      where key in ('ai_calls_per_day','ai_tokens_per_call') order by key`);
  eq(budget.map(r => [r.key, r.value, r.kind]),
     [['ai_calls_per_day', '200', 'operational'],
      ['ai_tokens_per_call', '4000', 'operational']],
     'the budget the owner accepted on 2026-08-04 is not what shipped');
});

console.log('\nthe ledger records what happened, including what did not');

await test('a call that could not be answered is a row like any other', async () => {
  await record('requester', DANA, 'absent', 'no model key is configured');
  const [call] = await rows(
    `select actor, actor_role, outcome, absent_reason from cw.model_call`);
  eq(call.actor, DANA, 'the actor came from the insert, not the connection');
  eq(call.actor_role, 'requester');
  eq(call.outcome, 'absent');
  assert(call.absent_reason, 'an absence with no reason is a silence');
});

await test('an absence with no reason is refused outright', async () => {
  await throws(() => record('requester', DANA, 'absent'),
    'an_absence_carries_its_reason',
    'a call could be recorded as unanswered without saying why, which is the '
    + 'silence the whole ledger exists to prevent');
});

await test('the model-call ledger is append-only', async () => {
  await throws(() => db.exec(`update cw.model_call set outcome = 'answered'`),
    'append-only', 'a failed call could be rewritten as a successful one');
  await throws(() => db.exec(`delete from cw.model_call`),
    'append-only', 'a call could be erased from the spend record');
});

console.log('\nthe budget is the system\'s, and the detail is not everybody\'s');

await test('the budget counts every call, not only the caller\'s own', async () => {
  // Ben's call must count against Dana's allowance. Otherwise every requester
  // gets a private 200 a day and the number the owner accepted means nothing.
  await record('requester', BEN, 'answered');
  const seen = await queryAs('requester',
    `select calls_today, calls_allowed from cw.model_calls_today()`, [], DANA);
  assert(Number(seen[0].calls_today) >= 2, (
    `Dana was told ${seen[0].calls_today} calls have been made today; Ben's `
    + 'call is missing from her count, so the daily cap is per-person and the '
    + 'budget is not a budget'));
  eq(Number(seen[0].calls_allowed), 200);
});

await test('a requester sees the calls their own work caused and no others', async () => {
  // The other half, and the tension is deliberate: you may know the budget is
  // spent without being shown whose work spent it.
  const dana = await queryAs('requester',
    `select actor from cw.model_call order by call_id`, [], DANA);
  eq([...new Set(dana.map(r => r.actor))], [DANA],
    'a requester was shown another requester\'s model calls');
});

await test('Legal, the auditor and the administrator see all of them', async () => {
  for (const role of ['legal_admin', 'auditor', 'administrator']) {
    const seen = await queryAs(role, `select actor from cw.model_call`,
                               [], role === 'legal_admin' ? LEGAL : ADMIN);
    assert(seen.length >= 2,
      `${role} was shown ${seen.length} calls; they read the whole ledger`);
  }
});

await test('an auditor and an administrator record no calls of their own', async () => {
  // Not a judgement about trust: neither has a path that asks a model, so a
  // grant would be dead machinery — and dead machinery is how the next person
  // concludes the role is supposed to be calling models.
  await mustNotWrite('auditor', `
    insert into cw.model_call (actor, purpose, model, outcome)
    values ('x', 'intake_manifest', 'm', 'answered')`, []);
  await mustNotWrite('administrator', `
    insert into cw.model_call (actor, purpose, model, outcome)
    values ('x', 'intake_manifest', 'm', 'answered')`, []);
});

await test('a viewer holds nothing here at all', async () => {
  await mustNotWrite('viewer', `
    insert into cw.model_call (actor, purpose, model, outcome)
    values ('x', 'intake_manifest', 'm', 'answered')`, []);
});

await test('a purpose outside the named three is refused', async () => {
  // The vocabulary is a reporting dimension. Free text makes one useless
  // within a month, and a new place the product asks a model is a decision.
  await throws(() => mustWrite('requester', `
    insert into cw.model_call (actor, purpose, model, outcome)
    values ('x', 'writing_the_contract', 'm', 'answered')`, [], DANA),
    'model_call_purpose_check',
    'a call was recorded for a purpose nobody added deliberately');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
