// The outbox and the address book (0042, OB-09).
//
// The guarantees:
//   · The tick is the Administrator's act — enforced by the schema
//     (cw.assert_may_run_notifications and the outbox insert policy), never by
//     Python deciding anything.
//   · Addresses are Administrator-maintained, audited both ways, and a removal
//     is terminal — the watcher-list shape.
//   · The outbox is append-only, and one SENT digest per person per day is a
//     unique index, not a promise.
//   · A person with work waiting and no reachable address is a VISIBLE gap,
//     asked of the same derivation the digest uses.
//
//   node db/test/notifications.test.mjs

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
const LEAH  = 'leah@clausewerk';

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  select cw.bootstrap('owner@clausewerk','${ADMIN}','The Administrator',
                      '${LEAH}','Leah Legal','Legal');
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.review_ticket
    (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
  values (null,'data','High','human-escalated','VENDOR LANGUAGE',
          'Supplier shall notify Customer.','someone@clausewerk');
`);

console.log('\nthe tick is the Administrator’s act, says the schema');

await test('only the administrator may run the notification tick', async () => {
  await throws(() => queryAs('legal_admin',
    `select cw.assert_may_run_notifications()`, [], LEAH),
    "the Administrator's act");
  await queryAs('administrator',
    `select cw.assert_may_run_notifications()`, [], ADMIN);
});

await test('a person with work waiting and no address is a visible gap', async () => {
  const g = await queryAs('administrator',
    `select person from cw.notification_gap order by person`, [], ADMIN);
  assert(g.some(r => r.person === LEAH),
    'the pending ticket waits on Leah, and nothing can reach her — a gap, not calm');
});

await test('nobody but the administrator maintains addresses', async () => {
  await mustNotWrite('legal_admin', `
    insert into cw.notification_address (person,channel,address,set_by)
    values ('${LEAH}','email','leah@example.com','x')`);
});

await test('setting an address closes the gap, and is a recorded act', async () => {
  await mustWrite('administrator', `
    insert into cw.notification_address (person,channel,address,set_by)
    values ('${LEAH}','email','leah@example.com','forged@clausewerk')`, [], ADMIN);
  const a = await one(`select set_by from cw.notification_address
                        where person='${LEAH}' and removed_at is null`);
  eq(a.set_by, ADMIN, 'the setter is the connection, not a claim');
  const g = await queryAs('administrator',
    `select count(*)::int as n from cw.notification_gap where person='${LEAH}'`,
    [], ADMIN);
  eq(g[0].n, 0);
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='notification_address_set' and subject='${LEAH}'`);
  eq(e.n, 1);
});

await test('only the administrator records a send', async () => {
  await mustNotWrite('legal_admin', `
    insert into cw.notification_outbox (person,channel,sent_on,kind,outcome)
    values ('${LEAH}','email',current_date,'digest','sent')`);
  await mustWrite('administrator', `
    insert into cw.notification_outbox (person,channel,sent_on,kind,refs,outcome)
    values ('${LEAH}','email',current_date,'digest',
            '[{"kind":"review_ticket","ref":"1"}]','sent')`, [], ADMIN);
});

await test('one sent digest per person per day is an index, not a promise', async () => {
  await throws(() => queryAs('administrator', `
    insert into cw.notification_outbox (person,channel,sent_on,kind,outcome)
    values ('${LEAH}','email',current_date,'digest','sent')`, [], ADMIN),
    'outbox_one_digest_a_day');
  // A failure may land beside a sent row — a retry after failure is why
  // failures are recorded at all.
  await mustWrite('administrator', `
    insert into cw.notification_outbox (person,channel,sent_on,kind,outcome,failure)
    values ('${LEAH}','email',current_date,'immediate','failed','mailbox full')`,
    [], ADMIN);
});

await test('the outbox is append-only — not even the owner edits a delivery', async () => {
  await throws(() => db.exec(`update cw.notification_outbox set outcome='sent'
    where outcome='failed'`), 'append-only');
  await throws(() => db.exec(`delete from cw.notification_outbox`), 'append-only');
});

await test('removing an address is recorded, and removal is terminal', async () => {
  await mustWrite('administrator', `
    update cw.notification_address set removed_by='x', removed_at=now()
     where person='${LEAH}' and removed_at is null`, [], ADMIN);
  const a = await one(`select removed_by from cw.notification_address
                        where person='${LEAH}'`);
  eq(a.removed_by, ADMIN, 'the remover is the connection, not a claim');
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='notification_address_removed' and subject='${LEAH}'`);
  eq(e.n, 1);
  await throws(() => queryAs('administrator', `
    update cw.notification_address set removed_by='x', removed_at=now()
     where person='${LEAH}'`, [], ADMIN),
    'not revisited');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
