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

const rows = async (s) => (await db.query(s)).rows;
const one = async (s) => (await rows(s))[0];
const { queryAs, execAs, mustNotWrite } = roleHelpers(db);

const SNAP = 'a'.repeat(64), RULES = 'c'.repeat(64);
// A result hash is a SHA-256. cw.run carries the shape check from WP-23, so a
// one-character stand-in is now correctly refused.
const RH = 'd'.repeat(64);
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
                      snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
    values ('RUN-001','AG-001','Northwind','{}','llm','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'buyer@cw');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-001',0,'data','High','DP-H-014',1,'Matched High variant');`);

console.log('\nexecution');

await test('a signed agreement is recorded with its document', async () => {
  await db.exec(`
    insert into cw.executed_agreement
      (agreement_id,run_id,executed_on,effective_on,term_end,signature_evidence)
      values ('AG-001','RUN-001','2026-08-01','2026-09-01','2029-09-01','DS-ENV-99213');
    insert into cw.executed_signatory (agreement_id,ordinal,name,party,method,signed_on)
      values ('AG-001',0,'M. Okafor','ours','electronic','2026-08-01'),
             ('AG-001',1,'J. Halvorsen','theirs','electronic','2026-08-01');
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
  // WP-25c (settled decision S0-3). The guarantee is unchanged — the signed
  // bytes survive — but HOW it is enforced changed, from a rule that swallowed
  // the statement to a trigger that refuses it. Reporting a successful deletion
  // of a signed contract is the opposite of what this file defends, so the
  // raise is now asserted alongside the survival rather than instead of it.
  await throws(() => db.exec(
    `delete from cw.executed_document where agreement_id='AG-001' and doc_seq=0`),
    'frozen', 'deleting a signed contract must be refused, not silently ignored');
  const r = await one(`select count(*)::int n from cw.executed_document
                       where agreement_id='AG-001' and doc_seq=0`);
  eq(r.n, 1, 'and the signed bytes are still there');
});

await test('a signed document cannot be truncated around the guard', async () => {
  // TRUNCATE fires neither row triggers nor ON DELETE rules. Every guard in
  // 0006 was blind to it, so the signed bytes could be erased wholesale by one
  // statement (WP-25b, finding D9).
  await throws(() => db.exec(`truncate cw.executed_document cascade`),
    'frozen', 'truncate must not be the way around a frozen contract');
  const r = await one(`select count(*)::int n from cw.executed_document
                       where agreement_id='AG-001' and doc_seq=0`);
  eq(r.n, 1, 'the signed bytes survive a truncate attempt');
});

// ════════════════════════════════════════════════════════════════════════════
// WP-08 · the agreement status machine (finding D7)
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe status machine (WP-08, finding D7)');

await test('executing an agreement moves it out of negotiating', async () => {
  // The status column has existed since 0003 and nothing has ever moved it. Every
  // deal in the system read as "negotiating" forever — including this one, whose
  // signed document is sitting in the table above. A portfolio report built on
  // that column would have said the company has never signed anything.
  const a = await one(`select status from cw.agreement where agreement_id='AG-001'`);
  eq(a.status, 'executed', 'filing the signed contract IS the act; status follows it');
});

await test('the status transition is audited', async () => {
  const e = await one(`select subject, payload from cw.audit_event
                       where event_type='agreement_status_changed'
                       order by seq desc limit 1`);
  assert(e, 'a deal changing state must leave a record');
  eq(e.subject, 'AG-001');
  eq(e.payload.from, 'negotiating', 'where it came from is the useful half');
  eq(e.payload.to, 'executed');
});

await test('an executed agreement cannot slide back to negotiating', async () => {
  await throws(() => db.exec(
    `update cw.agreement set status='negotiating' where agreement_id='AG-001'`),
    'cannot go from executed to negotiating',
    'un-signing a deal is not an edit; it is a different deal');
});

await test('a deal can die before signature', async () => {
  await db.exec(`insert into cw.agreement (agreement_id,counterparty,requester)
                 values ('AG-002','Contoso','buyer@cw');
                 update cw.agreement set status='terminated' where agreement_id='AG-002';`);
  const a = await one(`select status from cw.agreement where agreement_id='AG-002'`);
  eq(a.status, 'terminated');
});

await test('a terminated agreement cannot be revived', async () => {
  await throws(() => db.exec(
    `update cw.agreement set status='executed' where agreement_id='AG-002'`),
    'cannot go from terminated to executed');
  await throws(() => db.exec(
    `update cw.agreement set status='negotiating' where agreement_id='AG-002'`),
    'cannot go from terminated to negotiating');
});

await test('an executed agreement can be terminated', async () => {
  await db.exec(`insert into cw.agreement (agreement_id,counterparty,requester)
                 values ('AG-003','Fabrikam','buyer@cw');
                 insert into cw.executed_agreement
                   (agreement_id,executed_on,effective_on)
                 values ('AG-003','2026-08-01','2026-09-01');
                 update cw.agreement set status='terminated' where agreement_id='AG-003';`);
  const a = await one(`select status from cw.agreement where agreement_id='AG-003'`);
  eq(a.status, 'terminated', 'the one move that ends a live contract');
});

await test('nobody can set a deal to executed by hand', async () => {
  // Run as the real cw_legal_admin. There is no UPDATE grant and no UPDATE
  // policy on cw.agreement for any role, deliberately: the only way to mark a
  // deal executed is to produce the signed contract and file it.
  await db.exec(`insert into cw.agreement (agreement_id,counterparty,requester)
                 values ('AG-004','Tailspin','buyer@cw')`);
  await throws(() => queryAs('legal_admin',
    `update cw.agreement set status='executed' where agreement_id='AG-004'`),
    'permission denied for table agreement');
  await db.exec(`select set_config('cw.role','legal_admin',false);
                 select set_config('cw.actor','legal@cw',false);`);
  const a = await one(`select status from cw.agreement where agreement_id='AG-004'`);
  eq(a.status, 'negotiating', 'and it is still unsigned');
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
    (agreement_id,executed_on,effective_on)
    values ('AG-005','2026-08-01','2026-09-01')`));
});

await test('a viewer reads a signed contract ONLY once it is shared with them', async () => {
  // THIS ASSERTION IS INVERTED FROM WHAT IT SHIPPED AS, and the reason is worth
  // keeping. It used to read:
  //
  //     a viewer can read a signed contract
  //     … assert(r.n > 0, 'the executed contract is the thing colleagues most
  //                        need to read')
  //
  // which was true and was also the whole problem: a viewer could read EVERY
  // signed contract in the system, not the ones they had been shown. ADR-0008
  // added the role so a contract could be shown to somebody for socialisation
  // without letting them change it, and the "shown to" half was never built —
  // nothing anywhere recorded who had been shown what.
  //
  // 0016 builds it. The viewer's reach is now exactly "this share, this
  // person", enforced in the policy rather than by a careful query.
  await db.exec(`reset role; select set_config('cw.actor','outsider@cw',false);`);
  await db.exec(`insert into cw.account (person,display_name,role,created_by)
                 values ('outsider@cw','Out Sider','viewer','legal@cw')
                 on conflict do nothing`);

  await db.exec(`reset role; set role cw_viewer;`);
  const before = await one(`select count(*)::int n from cw.executed_document`);
  eq(before.n, 0,
    'a viewer can read a signed contract nobody shared with them — which is '
    + 'what this test used to assert was correct');

  // Legal shares one, with a stated purpose.
  await db.exec(`reset role; select set_config('cw.actor','legal@cw',false);
                 set role cw_legal_admin;`);
  await db.exec(`insert into cw.agreement_share (agreement_id, shared_with, purpose)
                 values ('AG-001','outsider@cw','socialising the data-privacy terms')`);

  await db.exec(`reset role; select set_config('cw.actor','outsider@cw',false);
                 set role cw_viewer;`);
  const after = await one(`select count(*)::int n from cw.executed_document
                           where agreement_id = 'AG-001'`);
  assert(after.n > 0,
    'a viewer cannot read a contract that WAS shared with them, which makes the '
    + 'reading room useless');

  // And still nothing else.
  const others = await one(`select count(*)::int n from cw.executed_document
                            where agreement_id <> 'AG-001'`);
  eq(others.n, 0, 'one share opened more than the agreement it named');

  await db.exec(`reset role; select set_config('cw.actor','legal@cw',false);`);
});

// ════════════════════════════════════════════════════════════════════════════
// WP-18c · signature evidence — the two gaps, and nothing else
// ════════════════════════════════════════════════════════════════════════════
console.log('\nsignature evidence (WP-18c)');

await db.exec(`reset role;
  select set_config('cw.actor','legal@cw',false);`);

const CERT = '7'.repeat(64);

await test('the completion certificate is stored as bytes, not as a reference', async () => {
  // The counterpart bytes prove WHAT was signed. The provider's certificate
  // proves WHO signed it. Only one of those survives the provider purging the
  // account, and until now the system kept a pointer at it rather than the
  // thing itself.
  await execAs('legal_reviewer', `insert into cw.signature_certificate
    (agreement_id,provider,envelope_id,completed_at,certificate,byte_size,sha256,storage_uri)
    values ('AG-001','DocuSign','DS-ENV-99213','2026-08-01T14:02:00Z',
            decode('255044462d312e340a', 'hex'), 9, '${CERT}',
            's3://cw-executed/AG-001/cert.pdf')`);
  const c = await one(`select provider, byte_size, octet_length(certificate) as n
                       from cw.signature_certificate where agreement_id='AG-001'`);
  eq(c.provider, 'DocuSign');
  eq(c.n, 9, 'the certificate bytes are actually held');
  eq(Number(c.byte_size), 9);
});

await test('a certificate whose size disagrees with its bytes is refused', async () => {
  await throws(() => db.exec(`insert into cw.signature_certificate
    (agreement_id,provider,envelope_id,completed_at,certificate,byte_size,sha256)
    values ('AG-003','DocuSign','DS-2','2026-08-01T14:02:00Z',
            decode('2550','hex'), 4096, '${'8'.repeat(64)}')`),
    'size_matches_the_bytes',
    'a byte count that does not match the bytes is not evidence of anything');
});

await test('the certificate is frozen like every other signed artefact', async () => {
  await throws(() => db.exec(`update cw.signature_certificate
    set envelope_id='DS-ENV-00000' where agreement_id='AG-001'`), 'frozen');
});

await test('signatories are records, not two text fields', async () => {
  // Three signatories, two parties, and one of them wet ink on a different
  // date — none of which the old our_signatory / their_signatory pair could
  // hold at all.
  await execAs('legal_reviewer', `insert into cw.executed_signatory
    (agreement_id,ordinal,name,party,method,signed_on,title)
    values ('AG-001',2,'P. Nwosu','ours','wet_ink','2026-08-04','CFO')`);
  const s = await rows(`select name, party, method, signed_on from cw.executed_signatory
                        where agreement_id='AG-001' order by ordinal`);
  eq(s.length, 3, 'a third signatory has somewhere to go');
  eq(s[2].method, 'wet_ink', 'and how they signed is recorded');
  assert(String(s[2].signed_on) !== String(s[0].signed_on),
    'a counterpart execution is not one date for everyone');
});

await test('who signed cannot be rewritten after execution', async () => {
  await throws(() => db.exec(
    `update cw.executed_signatory set name='someone else'
     where agreement_id='AG-001' and ordinal=0`), 'frozen');
});

await test('every signature is recorded in the audit trail', async () => {
  const e = await rows(`select subject, payload from cw.audit_event
                        where event_type='signatory_recorded' order by seq`);
  assert(e.some(x => x.subject === 'AG-001#2' && x.payload.method === 'wet_ink'));
  const c = await one(`select payload from cw.audit_event
                       where event_type='signature_certificate_stored'`);
  eq(c.payload.sha256, CERT);
});

await test('a missing certificate or signatory is reported, never invented', async () => {
  // The product boundary: the system makes the gap visible and gives the
  // responsible person a place to act. It does not refuse to file a contract
  // that was genuinely signed, and it does not fabricate the missing evidence.
  const g = await one(`select * from cw.execution_evidence_gap where agreement_id='AG-003'`);
  eq(g.missing_completion_certificate, true);
  eq(g.missing_our_signatory, true);
  const ok = await one(`select * from cw.execution_evidence_gap where agreement_id='AG-001'`);
  eq(ok.missing_completion_certificate, false);
  eq(ok.missing_our_signatory, false);
});

await test('a requester cannot file signature evidence', async () => {
  await mustNotWrite('requester', `insert into cw.executed_signatory
    (agreement_id,ordinal,name,party,method,signed_on)
    values ('AG-001',9,'not me','ours','electronic','2026-08-01')`);
});

// ════════════════════════════════════════════════════════════════════════════
// WP-18d · masters and statements of work
// ════════════════════════════════════════════════════════════════════════════
console.log('\nmasters and statements of work (WP-18d)');

await db.exec(`reset role;
  insert into cw.clause (clause_id,category_key,severity) values ('DP-H-090','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on)
    values ('DP-H-090',1,'Alt','Notify within 72 hours.','2025-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-100','Globex','buyer@cw'), ('AG-101','Globex','buyer@cw'),
    ('AG-102','Globex','buyer@cw'), ('AG-103','Globex','buyer@cw');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,snapshot_id,
                      ruleset_id,result_hash,engine_version,gate_open,created_by) values
    ('RUN-100','AG-100','Globex','{}','llm','${SNAP}','${RULES}','${RH}','clausewerk-engine/3',true,'buyer@cw'),
    ('RUN-101','AG-101','Globex','{}','llm','${SNAP}','${RULES}','${RH}','clausewerk-engine/3',true,'buyer@cw'),
    ('RUN-102','AG-102','Globex','{}','llm','${SNAP}','${RULES}','${RH}','clausewerk-engine/3',true,'buyer@cw');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason) values
    ('RUN-100',0,'data','High','DP-H-014',1,'Master position'),
    ('RUN-101',0,'data','High','DP-H-014',1,'Agrees with the master'),
    ('RUN-102',0,'data','High','DP-H-090',1,'Takes a different position');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on,agreement_kind)
    values ('AG-100','RUN-100','2026-08-01','2026-09-01','master');`);

await test('a statement of work names its master', async () => {
  await db.exec(`insert into cw.executed_agreement
    (agreement_id,run_id,executed_on,effective_on,agreement_kind,parent_agreement_id)
    values ('AG-101','RUN-101','2026-08-10','2026-09-01','sow','AG-100')`);
  const s = await one(`select agreement_kind, parent_agreement_id
                       from cw.executed_agreement where agreement_id='AG-101'`);
  eq(s.agreement_kind, 'sow'); eq(s.parent_agreement_id, 'AG-100');
});

await test('a standalone agreement cannot name a master', async () => {
  await throws(() => db.exec(`insert into cw.executed_agreement
    (agreement_id,executed_on,effective_on,agreement_kind,parent_agreement_id)
    values ('AG-103','2026-08-10','2026-09-01','standalone','AG-100')`),
    'only_a_sow_has_a_master');
});

await test('a statement of work cannot hang off another statement of work', async () => {
  await throws(() => db.exec(`insert into cw.executed_agreement
    (agreement_id,executed_on,effective_on,agreement_kind,parent_agreement_id)
    values ('AG-103','2026-08-10','2026-09-01','sow','AG-101')`),
    'only a master may carry statements of work');
});

await test('an unauthorised departure from the master is still refused', async () => {
  // U2 was SETTLED by the owner on 2026-07-26: a SOW may depart from its master,
  // but only with the same approval a concession needs. So the departure is no
  // longer forbidden — it is gated. Ungated, it must still fail, and the message
  // must say what to do about it rather than just "no".
  await throws(() => db.exec(`insert into cw.executed_agreement
    (agreement_id,run_id,executed_on,effective_on,agreement_kind,parent_agreement_id)
    values ('AG-102','RUN-102','2026-08-10','2026-09-01','sow','AG-100')`),
    'has not been authorised',
    'a SOW quietly overriding the master is the failure this gate prevents');
});

await test('the settled decision is recorded as settled, and says who settled it', async () => {
  const s = await one(`select value, is_owner_decision, decided, decided_by, rationale
                       from cw.governance_setting where key='sow_may_contradict_master'`);
  eq(s.value, 'with_approval',
    'a SOW may depart from its master once approved — not never, and not freely');
  eq(s.is_owner_decision, true);
  eq(s.decided, true, 'the owner has chosen; this is no longer a shipped default');
  assert(s.decided_by, 'a settled decision names who settled it');
  assert(s.rationale.includes('U2'), 'and it says which question it answers');
});

await test('the unconditional reading remains reachable, and nobody has chosen it', async () => {
  // 'true' means "a SOW may depart from its master freely, no approval". It is
  // still implemented and one UPDATE away — but the owner chose 'with_approval'
  // instead, and this test exists so that the unchosen branch stays honest
  // rather than rotting. It is asserted without executing anything, because an
  // executed agreement is frozen and cannot be cleaned up afterwards.
  await db.exec(`update cw.governance_setting set value='true'
                 where key='sow_may_contradict_master'`);
  eq(await one(`select cw.setting('sow_may_contradict_master') as v`), { v: 'true' });
  await db.exec(`update cw.governance_setting set value='with_approval'
                 where key='sow_may_contradict_master'`);
});

// ── U2 as settled: departure is allowed, but it is earned ──────────────────
//
// The owner settled U2 on 2026-07-26: a SOW may contradict its master, per
// category, once it carries the same approval a concession does. These tests
// hold the two halves of that — the gate refuses a proposal nobody has signed,
// and opens for one everybody has.

await test('a proposed departure nobody has approved authorises nothing', async () => {
  await db.exec(`insert into cw.sow_override (sow_id, category_key, reason, proposed_by)
                 values ('AG-102','data','Customer requires their own DPA wording','buyer@cw')`);
  const inForce = await rows(`select 1 from cw.sow_override_in_force where sow_id='AG-102'`);
  eq(inForce.length, 0, 'a proposal is not an authorisation');
  await throws(() => db.exec(`insert into cw.executed_agreement
    (agreement_id,run_id,executed_on,effective_on,agreement_kind,parent_agreement_id)
    values ('AG-102','RUN-102','2026-08-10','2026-09-01','sow','AG-100')`),
    'has not been authorised');
});

await test('a departure cannot be authorised with an approval missing', async () => {
  const o = await one(`select override_id from cw.sow_override where sow_id='AG-102'`);
  await db.exec(`insert into cw.agreement_attorney (agreement_id, attorney, assigned_by)
                 values ('AG-102','counsel@cw','legal@cw')`);
  await db.exec(`insert into cw.required_approver (agreement_id, body, label, approver, added_by)
                 values ('AG-102','privacy','Privacy Office','dpo@cw','legal@cw')`);
  // Only the Requester has signed. The attorney and the Privacy Office have not.
  await db.exec(`insert into cw.sow_override_approval (override_id, approver_kind, approver)
                 values (${o.override_id},'requester','buyer@cw')`);
  await throws(() => db.exec(`insert into cw.sow_override_settlement (override_id, settled_by)
                              values (${o.override_id},'legal@cw')`),
    'still waiting on',
    'the same approval a concession needs, or it is not the same control');
});

await test('with everyone signed, the departure is authorised and the SOW executes', async () => {
  const o = await one(`select override_id from cw.sow_override where sow_id='AG-102'`);
  const req = await one(`select required_approver_id from cw.required_approver
                         where agreement_id='AG-102'`);
  await db.exec(`insert into cw.sow_override_approval (override_id, approver_kind, approver)
                 values (${o.override_id},'attorney','counsel@cw')`);
  await db.exec(`insert into cw.sow_override_approval
                   (override_id, approver_kind, required_approver_id, approver)
                 values (${o.override_id},'required',${req.required_approver_id},'dpo@cw')`);
  await db.exec(`insert into cw.sow_override_settlement (override_id, settled_by)
                 values (${o.override_id},'legal@cw')`);

  const inForce = await rows(`select category_key from cw.sow_override_in_force
                              where sow_id='AG-102'`);
  eq(inForce.length, 1); eq(inForce[0].category_key, 'data');

  await db.exec(`insert into cw.executed_agreement
    (agreement_id,run_id,executed_on,effective_on,agreement_kind,parent_agreement_id)
    values ('AG-102','RUN-102','2026-08-10','2026-09-01','sow','AG-100')`);

  const c = await rows(`select category_key from cw.sow_conflict where sow_id='AG-102'`);
  eq(c.length, 1, 'and it is STILL reported — authorised is not the same as hidden');
});

await test('authorising a departure is audited', async () => {
  const e = await rows(`select subject, payload from cw.audit_event
                        where event_type='sow_override_authorised'`);
  eq(e.length, 1); eq(e[0].subject, 'AG-102');
  eq(e[0].payload.category_key, 'data');
  assert(e[0].payload.reason, 'and the audit record carries why, not just that');
});

await test('what was authorised, and by whom, cannot be rewritten', async () => {
  const o = await one(`select override_id from cw.sow_override where sow_id='AG-102'`);
  await throws(() => db.exec(`update cw.sow_override set reason='different reason'
                              where override_id=${o.override_id}`),
    'is evidence');
  await throws(() => db.exec(`delete from cw.sow_override_settlement
                              where override_id=${o.override_id}`),
    'is evidence');
});

await test('terminating a master over a live SOW is surfaced, not prevented', async () => {
  const before = await rows(`select sow_id from cw.orphaned_sow`);
  eq(before.length, 0);
  await db.exec(`update cw.agreement set status='terminated' where agreement_id='AG-100'`);
  const after = await rows(`select sow_id, master_status from cw.orphaned_sow order by sow_id`);
  assert(after.some(r => r.sow_id === 'AG-101'),
    'the named deal owner has to be told the master ended under live work');
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
