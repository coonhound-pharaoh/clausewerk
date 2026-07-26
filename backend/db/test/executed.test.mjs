// Executed agreement tests (migration 0006).
//
// The one thing this suite exists to prove: a signed contract is frozen.
// Not "usually", not "unless an administrator needs to" — frozen.
//
//   node db/test/executed.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const rows = async (s) => (await db.query(s)).rows;
const one = async (s) => (await rows(s))[0];

const SNAP = 'a'.repeat(64), RULES = 'c'.repeat(64);
const SIG = '1'.repeat(64), AMD = '2'.repeat(64);

await db.exec(`
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','legal@cw',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-H-014','data','High'), ('DP-H-052','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'GDPR','Notify within 24 hours.','2025-01-01','2030-01-01'),
    ('DP-H-014',2,'GDPR v2','Notify within 24 hours, with SCCs.','2026-01-01','2030-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-001','Northwind','buyer@cw');
  insert into cw.snapshot (snapshot_id,taken_on) values ('${SNAP}','2026-07-25');
  insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable) values
    ('${SNAP}','DP-H-014',1,true);
  insert into cw.ruleset (ruleset_id) values ('${RULES}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,gate_open,created_by)
    values ('RUN-001','AG-001','Northwind','{}','llm','${SNAP}','${RULES}','h',true,'buyer@cw');
  insert into cw.run_decision (run_id,seq,category,severity,clause_id,version,reason)
    values ('RUN-001',0,'Data Privacy','High','DP-H-014',1,'Matched High variant');`);

console.log('\nexecution');

await test('a signed agreement is recorded with its document', async () => {
  await db.exec(`
    insert into cw.executed_agreement
      (agreement_id,run_id,executed_on,effective_on,term_end,our_signatory,their_signatory,
       signature_evidence)
      values ('AG-001','RUN-001','2026-08-01','2026-09-01','2029-09-01',
              'M. Okafor','J. Halvorsen','DS-ENV-99213');
    insert into cw.executed_document
      (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
      values ('AG-001',0,'agreement','Northwind-MSA-executed.docx',184320,'${SIG}',
              's3://cw-executed/AG-001/0.docx','2026-08-01');`);
  const d = await one(`select sha256, kind from cw.executed_document
                       where agreement_id='AG-001' and doc_seq=0`);
  eq(d.kind, 'agreement'); eq(d.sha256, SIG);
});

await test('the agreement document must be first in the chain', async () => {
  await throws(() => db.exec(`insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
    values ('AG-001',5,'agreement','second-msa.docx',100,'${'3'.repeat(64)}','s3://x','2026-08-02')`),
    'agreement_is_first', 'there is exactly one agreement, and it is seq 0');
});

await test('an amendment must name what it amends', async () => {
  await throws(() => db.exec(`insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
    values ('AG-001',1,'amendment','amd-1.docx',5000,'${AMD}','s3://x','2027-02-01')`),
    'amendment_names_its_target');
});

await test('an amendment is appended, never applied', async () => {
  await db.exec(`insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on,supersedes_seq)
    values ('AG-001',1,'amendment','amd-1.docx',5000,'${AMD}','s3://x','2027-02-01',0)`);
  const chain = await rows(`select doc_seq, kind, sha256 from cw.agreement_chain
                            where agreement_id='AG-001' order by doc_seq`);
  eq(chain.length, 2);
  eq(chain[0].sha256, SIG, 'the original document is untouched by the amendment');
});

await test('the same bytes cannot be filed twice', async () => {
  await throws(() => db.exec(`insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on,supersedes_seq)
    values ('AG-001',2,'amendment','amd-1-copy.docx',5000,'${AMD}','s3://y','2027-02-01',0)`),
    'executed_document_hash');
});

console.log('\nfrozen means frozen');

await test('the signed document cannot be edited — not by anyone', async () => {
  await throws(() => db.exec(
    `update cw.executed_document set sha256='${'9'.repeat(64)}'
     where agreement_id='AG-001' and doc_seq=0`),
    'frozen', 'the acting role here is legal_admin, the most privileged there is');
});

await test('the filename cannot be edited either', async () => {
  await throws(() => db.exec(
    `update cw.executed_document set filename='renamed.docx'
     where agreement_id='AG-001' and doc_seq=0`), 'frozen');
});

await test('execution details cannot be edited', async () => {
  await throws(() => db.exec(
    `update cw.executed_agreement set effective_on='2027-01-01' where agreement_id='AG-001'`),
    'frozen');
});

await test('a signed document cannot be deleted', async () => {
  await db.exec(`delete from cw.executed_document where agreement_id='AG-001' and doc_seq=0`);
  const r = await one(`select count(*)::int n from cw.executed_document
                       where agreement_id='AG-001' and doc_seq=0`);
  eq(r.n, 1, 'deleting a signed contract must be a no-op, not a success');
});

console.log('\nthe library moves on; the contract does not');

await test('superseding the clause it used changes nothing about the contract', async () => {
  const before = await one(`select sha256 from cw.executed_document
                            where agreement_id='AG-001' and doc_seq=0`);
  await db.exec(`insert into cw.supersession
    (clause_id,predecessor_version,successor_version,reason,approver)
    values ('DP-H-014',1,2,'Added SCC module','R. Vance')`);
  const after = await one(`select sha256 from cw.executed_document
                           where agreement_id='AG-001' and doc_seq=0`);
  eq(after.sha256, before.sha256);
  const d = await one(`select clause_id, version from cw.run_decision
                       where run_id='RUN-001' and seq=0`);
  eq(d.version, 1, 'the executed decision still names v1, not the successor');
});

await test('retiring the clause it used changes nothing either', async () => {
  await db.exec(`update cw.clause_version set retired=true, retired_reason='withdrawn'
                 where clause_id='DP-H-052' and version=1`);
  const c = await one(`select body from cw.run_contract where run_id='RUN-001' and seq=0`);
  assert(c.body.includes('24 hours'), 'the executed wording is still readable, verbatim');
});

await test('drift is reported, not applied', async () => {
  const drift = await rows(`select clause_id, executed_version, successor_version,
                                   superseded_reason
                            from cw.agreement_drift where agreement_id='AG-001'`);
  eq(drift.length, 1);
  eq(drift[0].executed_version, 1);
  eq(drift[0].successor_version, 2, 'renewal input — the signed contract is unchanged');
  assert(drift[0].superseded_reason.includes('SCC'));
});

console.log('\nprovenance and access');

await test('execution and freezing are both audited', async () => {
  const e = await rows(`select event_type, subject from cw.audit_event
                        where event_type in ('agreement_executed','document_frozen')
                        order by seq`);
  assert(e.some(x => x.event_type === 'agreement_executed' && x.subject === 'AG-001'));
  assert(e.some(x => x.event_type === 'document_frozen' && x.subject === 'AG-001#0'));
});

await test('the stored hash is recorded in the audit trail', async () => {
  const e = await one(`select payload from cw.audit_event
                       where event_type='document_frozen' and subject='AG-001#0'`);
  eq(e.payload.sha256, SIG, 'so tampering with storage is detectable against the log');
});

await test('a requester cannot declare a deal signed', async () => {
  await db.exec(`reset role; select set_config('cw.role','requester',false);
                 select set_config('cw.actor','buyer@cw',false); set role cw_requester;`);
  await throws(() => db.exec(`insert into cw.executed_agreement
    (agreement_id,executed_on,effective_on,our_signatory,their_signatory)
    values ('AG-001','2026-08-01','2026-09-01','x','y')`));
});

await test('a viewer can read a signed contract', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  const r = await one(`select count(*)::int n from cw.executed_document`);
  assert(r.n > 0, 'the executed contract is the thing colleagues most need to read');
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
