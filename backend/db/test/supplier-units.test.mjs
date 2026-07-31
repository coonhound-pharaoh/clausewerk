// Supplier units: anchored provenance, and the quarantine claim itself
// (0051, NC-18).
//
// The guarantees:
//   · THE QUARANTINE TEST THAT IS THE CLAIM: filing supplier units adds
//     NOTHING to cw.selectable_clause — vendor wording cannot reach a
//     contract from the review queue. Asserted with a library clause
//     present, so the check cannot pass vacuously.
//   · Every unit is anchored: paragraph N of a stored received document
//     whose sha256 the schema computed. The anchor must name the deal's own
//     paper (the same-deal shape), and provenance takes no edits.
//   · The unit's TEXT lives in the ticket's quarantined proposed_text and
//     nowhere else — this table carries positions, never wording.
//
//   node db/test/supplier-units.test.mjs

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
const { queryAs, mustWrite } = roleHelpers(db);

const RITA = 'rita@cw';
const BEN  = 'ben@cw';

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  -- A real library clause, so "nothing leaked into selectable" cannot pass
  -- because selectable was empty all along.
  insert into cw.clause (clause_id,category_key,severity) values ('DP-A-001','data','Standard');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on)
    values ('DP-A-001',1,'Ours','our approved wording','2025-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-S1','Vendor Co','${RITA}'), ('AG-S2','Other Co','${BEN}');
  insert into cw.received_document (agreement_id,bytes,filename) values
    ('AG-S1','\\x765f70','vendor-msa.docx'),
    ('AG-S2','\\x6f74','other-paper.docx');
`);

const DOC = (await one(`select document_id from cw.received_document
                         where filename='vendor-msa.docx'`)).document_id;
const FOREIGN_DOC = (await one(`select document_id from cw.received_document
                                 where filename='other-paper.docx'`)).document_id;

const selectableBefore =
  (await one(`select count(*)::int as n from cw.selectable_clause`)).n;

// A supplier unit through the real path: ticket as the requester, anchor in
// the same act — the shape paper.ingest performs.
await mustWrite('requester', `
  insert into cw.review_ticket
    (agreement_id, category_key, severity, reason_code, provenance_badge, proposed_text)
  values ('AG-S1','data','Standard','supplier-paper','VENDOR LANGUAGE',
          'the vendor''s own words, quarantined')
  returning ticket_id`, [], RITA);
const TICKET = (await one(`select ticket_id from cw.review_ticket
                            where reason_code='supplier-paper'`)).ticket_id;
await mustWrite('requester', `
  insert into cw.supplier_unit (ticket_id, document_id, paragraph_no)
  values (${TICKET}, ${DOC}, 3)`, [], RITA);

console.log('\nthe quarantine claim, asserted as a boundary');

await test('a supplier unit adds nothing to cw.selectable_clause', async () => {
  const after = (await one(
    `select count(*)::int as n from cw.selectable_clause`)).n;
  eq(after, selectableBefore,
     'vendor language reached the selectable surface — the quarantine is the '
     + 'whole point of the review-queue home');
  assert(selectableBefore > 0,
     'non-vacuity: the library clause must be selectable, or this proves nothing');
});

await test('the unit table carries positions, never wording', async () => {
  const cols = await rows(`
    select column_name from information_schema.columns
    where table_schema='cw' and table_name='supplier_unit'`);
  const names = cols.map(c => c.column_name);
  assert(!names.some(n => /text|body|wording/.test(n)),
    `a text-shaped column appeared on cw.supplier_unit: ${names}. The unit’s `
    + 'words live in the ticket’s quarantined proposed_text and nowhere else');
});

console.log('\nthe anchor');

await test('the anchor answers position and the stored fingerprint together', async () => {
  const u = await queryAs('legal_admin', `
    select u.paragraph_no, d.sha256
    from cw.supplier_unit u join cw.received_document d using (document_id)
    where u.ticket_id = ${TICKET}`, [], 'leah@cw');
  eq(u[0].paragraph_no, 3);
  assert(/^[0-9a-f]{64}$/.test(u[0].sha256),
    'the anchor points at bytes via the schema-computed sha');
});

await test('a unit anchored to another deal’s paper is refused', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.supplier_unit (ticket_id, document_id, paragraph_no)
    values (${TICKET}, ${FOREIGN_DOC}, 0)`, [], RITA),
    'must be the deal');
});

await test('provenance takes no edits, not even the owner’s', async () => {
  await throws(() => db.query(
    `update cw.supplier_unit set paragraph_no = 99 where ticket_id = ${TICKET}`),
    'append-only');
  await throws(() => db.query(
    `delete from cw.supplier_unit where ticket_id = ${TICKET}`), 'append-only');
});

console.log('\nwho sees a unit');

await test('a requester sees their own deal’s units and not others’', async () => {
  const mine = await queryAs('requester',
    `select ticket_id from cw.supplier_unit`, [], RITA);
  eq(mine.length, 1);
  const theirs = await queryAs('requester',
    `select ticket_id from cw.supplier_unit`, [], BEN);
  eq(theirs.length, 0,
     'Ben covers nothing on AG-S1 through the unit table; the ticket policy '
     + 'is the boundary and the unit mirrors it');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const [n, m] of failures) console.log(`  FAIL ${n}: ${m}`);
  process.exit(1);
}
