// The envelope record (0040, OB-12) — the signature connection's record half.
//
// The guarantees:
//   · Sending binds the sender to the connection and opens at 'sent'.
//   · Events arrive in sequence, from the provider, append-only.
//   · The state moves when a TERMINAL EVENT is recorded — through the definer
//     trigger, proven AS A REAL ROLE, because run as the owner the D1 shape
//     (a zero-row silent no-op) is invisible.
//   · A terminal envelope takes no further events, and nothing about an
//     envelope is ever edited or deleted.
//
//   node db/test/signature-envelope.test.mjs

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

const BUYER = 'buyer@clausewerk';
const SHA = 'e'.repeat(64);

await db.exec(`
  select set_config('cw.actor','seed@clausewerk',false);
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-E1','Northwind','${BUYER}'),
    ('AG-E2','Contoso','somebody.else@clausewerk');
`);

console.log('\nthe envelope: sent, evented, terminal — and evidence throughout');

await test('sending binds the sender and opens at sent', async () => {
  await mustWrite('requester', `
    insert into cw.signature_envelope
      (agreement_id,provider,provider_envelope_id,document_sha256,sent_by)
    values ('AG-E1','docusign','ENV-001','${SHA}','forged@clausewerk')`,
    [], BUYER);
  const e = await one(`select sent_by, state from cw.signature_envelope
                        where provider_envelope_id='ENV-001'`);
  eq([e.sent_by, e.state], [BUYER, 'sent']);
  const a = await one(`select count(*)::int as n from cw.audit_event
    where event_type='envelope_opened'`);
  eq(a.n, 1);
});

const ENV = (await one(`select envelope_id from cw.signature_envelope
  where provider_envelope_id='ENV-001'`)).envelope_id;

await test('a requester cannot open an envelope on another buyer’s deal', async () => {
  await mustNotWrite('requester', `
    insert into cw.signature_envelope
      (agreement_id,provider,provider_envelope_id,document_sha256,sent_by)
    values ('AG-E2','docusign','ENV-XX','${SHA}','x')`, [], BUYER);
});

await test('events arrive in sequence or not at all', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.signature_envelope_event (envelope_id,seq,event,occurred_at)
    values (${ENV},1,'delivered',now())`, [], BUYER),
    'in sequence');
  await mustWrite('requester', `
    insert into cw.signature_envelope_event (envelope_id,seq,event,occurred_at)
    values (${ENV},0,'delivered',now())`, [], BUYER);
});

await test('a terminal event moves the state — as a real role, not the owner', async () => {
  await mustWrite('requester', `
    insert into cw.signature_envelope_event (envelope_id,seq,event,occurred_at,detail)
    values (${ENV},1,'completed',now(),'{"certificate":"pending retrieval"}')`,
    [], BUYER);
  const e = await one(`select state from cw.signature_envelope
                        where envelope_id=${ENV}`);
  eq(e.state, 'completed',
     'run as the owner this proves nothing — the D1 shape hides there');
});

await test('a terminal envelope takes no further events', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.signature_envelope_event (envelope_id,seq,event,occurred_at)
    values (${ENV},2,'declined',now())`, [], BUYER),
    'no further events');
});

await test('the envelope record is evidence — no edits, no deletions', async () => {
  await throws(() => db.exec(`update cw.signature_envelope
    set document_sha256='${'f'.repeat(64)}' where envelope_id=${ENV}`),
    'only its state moves');
  await throws(() => db.exec(`update cw.signature_envelope_event
    set detail='{}' where envelope_id=${ENV} and seq=0`),
    'append-only');
  await throws(() => db.exec(`delete from cw.signature_envelope
    where envelope_id=${ENV}`),
    'append-only');
});

await test('declining is a terminal state of its own', async () => {
  await mustWrite('requester', `
    insert into cw.signature_envelope
      (agreement_id,provider,provider_envelope_id,document_sha256,sent_by)
    values ('AG-E1','docusign','ENV-002','${SHA}','x')`, [], BUYER);
  const e2 = (await one(`select envelope_id from cw.signature_envelope
    where provider_envelope_id='ENV-002'`)).envelope_id;
  await mustWrite('requester', `
    insert into cw.signature_envelope_event (envelope_id,seq,event,occurred_at)
    values (${e2},0,'declined',now())`, [], BUYER);
  const e = await one(`select state from cw.signature_envelope where envelope_id=${e2}`);
  eq(e.state, 'declined');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
