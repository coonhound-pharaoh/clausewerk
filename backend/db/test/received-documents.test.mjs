// The received-document store (0047, NC-07, U15).
//
// The guarantees:
//   · A stored document's sha256 and byte_count are the DATABASE's arithmetic
//     over the stored bytes — generated columns, impossible to record wrongly.
//   · Rows are evidence: no edit, no delete, not even by the owner.
//   · The ceiling is the governance row, consulted where the bytes land; a
//     document over it is refused, and a MISSING ceiling refuses rather than
//     waving through (the redaction-guard shape).
//   · The three working roles store; the Auditor and Administrator read but
//     never store (the administrator sweep in administrator.test.mjs already
//     holds the no-write half schema-wide); the Viewer holds no grant at all.
//   · Storing is a recorded act, and the recorder is the CONNECTION's person,
//     whatever the insert claimed.
//   · U15 is on the record: both governance rows, decided by the owner.
//
//   node db/test/received-documents.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
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

const RITA = 'rita@cw';      // a requester with vendor paper in hand
const LEAH = 'leah@cw';      // legal admin

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-701','Vendor Co','${RITA}'),
    ('AG-702','Other Vendor','someone-else@cw');
`);

// The vendor's bytes, and what our own arithmetic says about them.
const PAPER = Buffer.from('placeholder vendor paper, bytes are bytes');
const PAPER_SHA = createHash('sha256').update(PAPER).digest('hex');

console.log('\nstoring a received document');

await test('a requester stores a document against their deal', async () => {
  await mustWrite('requester', `
    insert into cw.received_document (agreement_id, bytes, content_type, filename)
    values ('AG-701', $1, 'application/octet-stream', 'vendor-msa.docx')`,
    [PAPER], RITA);
  const d = await one(`select * from cw.received_document where document_id = 1`);
  eq(d.filename, 'vendor-msa.docx');
});

await test('sha256 and byte_count are the schema’s own arithmetic over the bytes', async () => {
  const d = await one(`select sha256, byte_count::int as n
                         from cw.received_document where document_id = 1`);
  eq(d.sha256, PAPER_SHA, 'the stored fingerprint is the fingerprint of the stored bytes');
  eq(d.n, PAPER.length);
});

await test('the recorder is the connection, whatever the insert claimed', async () => {
  await mustWrite('legal_admin', `
    insert into cw.received_document (agreement_id, bytes, received_by)
    values ('AG-701', $1, 'forged@cw')`, [PAPER], LEAH);
  const d = await one(`select received_by from cw.received_document
                        where document_id = 2`);
  eq(d.received_by, LEAH, 'received_by is the session, never the body');
});

await test('a requester cannot attach bytes to somebody else\u2019s deal', async () => {
  await mustNotWrite('requester', `
    insert into cw.received_document (agreement_id, bytes)
    values ('AG-702', $1)`, [PAPER], RITA);
});

await test('storing is a recorded act', async () => {
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='document_received' and subject='AG-701'`);
  eq(e.n, 2, 'both stores landed on the chain');
});

await test('a document for a deal that does not exist is refused', async () => {
  await mustNotWrite('requester', `
    insert into cw.received_document (agreement_id, bytes)
    values ('AG-999', $1)`, [PAPER]);
});

await test('an empty document is refused', async () => {
  await mustNotWrite('requester', `
    insert into cw.received_document (agreement_id, bytes)
    values ('AG-701', $1)`, [Buffer.alloc(0)]);
});

console.log('\nevidence takes no edits');

await test('no role holds update on a received document at all', async () => {
  await throws(() => queryAs('legal_admin',
    `update cw.received_document set filename='renamed.docx'
      where document_id = 1`, [], LEAH), 'permission denied');
});

await test('a received document takes no edits', async () => {
  // As the OWNER, who bypasses grants and policies — only the trigger is left
  // to refuse, and it must.
  await throws(() => db.query(
    `update cw.received_document set filename='renamed.docx'
      where document_id = 1`), 'evidence');
});

await test('a received document takes no deletions', async () => {
  await throws(() => db.query(
    `delete from cw.received_document where document_id = 1`), 'evidence');
});

console.log('\nthe ceiling is the governance row');

await test('a document over the recorded ceiling is refused with both numbers', async () => {
  // The real ceiling is a gigabyte; nobody allocates one in a test. Lowering
  // the row is itself a governed act the settings policies allow legal_admin,
  // which is exactly how the ceiling would move in production.
  await queryAs('legal_admin',
    `update cw.governance_setting set value='16' where key='max_document_bytes'`,
    [], LEAH);
  await throws(() => queryAs('requester', `
    insert into cw.received_document (agreement_id, bytes)
    values ('AG-701', $1)`, [PAPER], RITA), 'too large');
  await queryAs('legal_admin',
    `update cw.governance_setting set value='1073741824'
      where key='max_document_bytes'`, [], LEAH);
});

await test('a MISSING ceiling refuses rather than waving through', async () => {
  // Settings are undeletable by design (setting_no_delete, 0013), so this
  // state is induced BELOW the application — the fork-guard precedent: the
  // test disables the protection to prove the next layer still fails CLOSED.
  await db.exec(
    `alter table cw.governance_setting disable trigger setting_no_delete`);
  await db.query(`delete from cw.governance_setting where key='max_document_bytes'`);
  await db.exec(
    `alter table cw.governance_setting enable trigger setting_no_delete`);
  await throws(() => queryAs('requester', `
    insert into cw.received_document (agreement_id, bytes)
    values ('AG-701', $1)`, [PAPER], RITA), 'unmeasured');
  await db.query(`
    insert into cw.governance_setting
      (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
    values ('max_document_bytes','1073741824','owner_decision',true,true,'owner',
            'restored by the test that proved its absence refuses','the ceiling')`);
});

console.log('\nwho may do what');

await test('the auditor reads and never stores', async () => {
  const d = await queryAs('auditor',
    `select count(*)::int as n from cw.received_document`, [], 'ava@cw');
  eq(d[0].n, 2);
  await mustNotWrite('auditor', `
    insert into cw.received_document (agreement_id, bytes)
    values ('AG-701', $1)`, [PAPER]);
});

await test('the administrator reads (U5) — the sweep already holds it to no writes', async () => {
  const d = await queryAs('administrator',
    `select count(*)::int as n from cw.received_document`, [], 'admin@cw');
  eq(d[0].n, 2);
});

await test('a viewer holds no grant on received documents at all', async () => {
  await throws(() => queryAs('viewer',
    `select * from cw.received_document`, [], 'vic@cw'), 'permission denied');
});

console.log('\nU15 on the record');

await test('both U15 rows are on the record, decided by the owner', async () => {
  const s = await rows(`select key, value, decided_by from cw.governance_setting
    where key in ('document_storage','max_document_bytes') order by key`);
  eq(s.length, 2, 'both rows exist');
  eq(s[0].value, 'database');
  eq(s[1].value, '1073741824');
  assert(s.every(r => r.decided_by === 'owner'), 'both are the owner’s decision');
});

console.log('\nreading one back out is itself recorded (0065, NI-4)');

// A REAL ROUND FOR THE READ TO BE ABOUT (0072). Until then this section called
// cw.record_document_read with invented ids and the function wrote them down;
// now it verifies what it is told, so the test needs a round that exists.
await db.exec(`
  select set_config('cw.actor','${RITA}',false);
  insert into cw.negotiation (agreement_id, paper, opened_by, baseline_chosen_by)
    values ('AG-701','theirs','${RITA}','${RITA}');
  insert into cw.negotiation_round
    (negotiation_id, round_no, direction, document_sha256, storage_uri, sent_on, actor)
    values (1, 1, 'received', '${PAPER_SHA}', 'cw://received-document/1',
            current_date, '${RITA}');
`);

await test('a recorded read names the role that made it', async () => {
  // THE AUDITOR'S NARROW DOOR. Handing a document out is appended to the chain
  // before the bytes leave, and the chain's general append policy names the
  // requester and the two Legal roles — not the auditor, who verifies the
  // record and does not write to it. That rule was refusing them a DOCUMENT,
  // so 0065 opened one function that writes this event and nothing else.
  //
  // INSIDE A SECURITY DEFINER, cw.app_role() answers null — current_user has
  // become the owner. So the role must come from the connection's own SET
  // ROLE, which is unforgeable, and this asserts it arrives. Recording every
  // download as roleless would make the ledger useless in the exact case it
  // was built for.
  await queryAs('auditor', `select cw.record_document_read(
    1, 1, 1, '${PAPER_SHA}', ${PAPER.length}, 'received')`, [], 'ava@cw');

  const [entry] = await rows(
    `select actor, actor_role, event_type, payload from cw.audit_event
      where event_type = 'received_document_read'`);
  assert(entry, 'the read was not recorded at all');
  eq(entry.actor, 'ava@cw');
  eq(entry.actor_role, 'auditor',
     'the chain recorded the read without the role that made it');
  eq(entry.payload.byte_size, PAPER.length);
});

// ── The arguments are a claim, not a record (0072) ─────────────────────────
//
// THIS SECTION EXISTS BECAUSE THE TEST ABOVE USED TO PIN THE BUG. It called the
// function with negotiation 1, round 1, document 1 and byte size 4200 — none of
// which existed or agreed with anything — and asserted that 4200 came back out
// of the chain. It passed. What it was actually proving was that whatever the
// caller said got written down.
//
// 0065 described the function as writing fields "either derived here or bounded
// by its own arguments". An argument is not a bound; it is whatever the caller
// says. Demonstrated before the fix: a requester wrote a read of another
// requester's negotiation, naming a round that did not exist, a document that
// did not exist and an invented hash — and cw.audit_verify() returned clean,
// because the chain guarantees nothing was ALTERED, never that anything is TRUE.

await test('a requester cannot record a read of somebody else’s round', async () => {
  // THE ONE THAT WAS THE HOLE. AG-701's negotiation belongs to Rita; Bo is a
  // requester on nothing. Refused by the round's own read policy, restated
  // inside the function because SECURITY DEFINER bypasses it.
  await throws(() => queryAs('requester',
    `select cw.record_document_read(1, 1, 1, '${PAPER_SHA}', ${PAPER.length}, 'received')`,
    [], 'bo@cw'),
    'not yours to read',
    'a requester recorded a read of a negotiation they cannot see');

  const n = await one(`select count(*)::int as n from cw.audit_event
    where event_type='received_document_read' and actor='bo@cw'`);
  eq(n.n, 0, 'the refusal still left something on the chain');
});

await test('a round that does not exist cannot be read', async () => {
  await throws(() => queryAs('auditor',
    `select cw.record_document_read(1, 99, 1, '${PAPER_SHA}', 1, 'received')`,
    [], 'ava@cw'),
    'no round 99',
    'a read was recorded against a round nobody has ever exchanged');
});

await test('the claimed hash, size and direction are ignored — the record wins', async () => {
  // NOT REFUSED, AND THAT IS THE DELIBERATE CHOICE. Refusing on a mismatched
  // claim would let a caller break their own legitimate download with a typo.
  // An argument that cannot be believed should not be able to stop anything
  // either — so it is dropped and the database's own answer is recorded.
  await queryAs('legal_admin',
    `select cw.record_document_read(1, 1, 1, repeat('f', 64), 999999, 'sent')`,
    [], LEAH);

  const [entry] = await rows(
    `select payload from cw.audit_event
      where event_type='received_document_read' and actor='${LEAH}'`);
  assert(entry, 'the read was not recorded');
  eq(entry.payload.sha256, PAPER_SHA,
     'the caller’s invented hash reached the chain');
  eq(entry.payload.byte_size, PAPER.length,
     'the caller’s invented byte size reached the chain');
  eq(entry.payload.direction, 'received',
     'the caller’s invented direction reached the chain');
});

await test('the door writes that one event and nothing else', async () => {
  // The half that matters. If the auditor ever holds a general append, the
  // record they exist to verify has become a record they can write.
  await throws(() => queryAs('auditor',
    `select cw.audit('invented_by_the_auditor','x','{}'::jsonb)`, [], 'ava@cw'),
    'permission denied',
    'the auditor can append an arbitrary event to the chain');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const [n, m] of failures) console.log(`  FAIL ${n}: ${m}`);
  process.exit(1);
}
