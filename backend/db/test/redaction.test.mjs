// Ending a record's life — migration 0023, owner decision U12.
//
// THE DECISION: "the administrator can remove the whole record, but can delegate
// the authority to delete records to remove content, but keep the fact. So
// records deleted under #1 can be reviewed and deleted under #2."
//
// Two acts, deliberately unequal:
//
//   REDACT · content goes, the fact stays. DELEGABLE.
//   PURGE  · the record goes. THE ADMINISTRATOR'S ALONE, and only after a
//            redaction, so there is always a reviewable state in between.
//
// This is the most dangerous pair of acts in the product — everything else here
// is written to make records survive — so the suite is built around what must
// still be refused, not around the happy path.
//
//   node db/test/redaction.test.mjs

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
const { queryAs, execAs, mustWrite, mustNotWrite } = roleHelpers(db);

const OWNER = 'owner@cw', ADMIN = 'a.okafor@cw', LEGAL = 'r.vance@cw';
const PAT = 'p.nkemi@cw', DANA = 'd.buyer@cw';

await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
await execAs('administrator', `
  insert into cw.account (person,display_name,role,created_by) values
    ('${PAT}','Pat','legal_reviewer','${ADMIN}'),
    ('${DANA}','Dana','requester','${ADMIN}')`, ADMIN);
await execAs('administrator', `
  insert into cw.role_grant (action,person,role) values
    ('granted','${PAT}','legal_reviewer'), ('granted','${DANA}','requester')`, ADMIN);
await execAs('legal_admin', `
  insert into cw.role_grant (action,person,role,grant_ref)
  select 'countersigned','${PAT}','legal_reviewer',grant_id from cw.role_grant
   where person='${PAT}' and action='granted'`, LEGAL);

const SNAP = 'a'.repeat(64), RULES = 'b'.repeat(64), SIG = 'c'.repeat(64);
const CERT = 'd'.repeat(64);

// Two signed agreements, both past their retention date. AG-1 is the one that
// walks the whole path; AG-2 exists so "this one and not the others" is
// checkable at every step.
await db.exec(`
  select set_config('cw.actor','installer@cw',false);
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-1','Northwind','${DANA}'), ('AG-2','Contoso','${DANA}');
  insert into cw.snapshot (snapshot_id) values ('${SNAP}');
  insert into cw.ruleset (ruleset_id) values ('${RULES}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,snapshot_id,
                      ruleset_id,result_hash,engine_version,gate_open,created_by) values
    ('RUN-1','AG-1','Northwind','{}','manual','${SNAP}','${RULES}','${'1'.repeat(64)}','1.0',true,'${DANA}'),
    ('RUN-2','AG-2','Contoso','{}','manual','${SNAP}','${RULES}','${'2'.repeat(64)}','1.0',true,'${DANA}');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on) values
    ('AG-1','RUN-1','2020-01-01','2020-01-01'), ('AG-2','RUN-2','2020-01-01','2020-01-01');
  insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on) values
    ('AG-1',0,'agreement','northwind.docx',1024,'${SIG}','s3://cw/AG-1/0.docx','2020-01-01'),
    ('AG-2',0,'agreement','contoso.docx',2048,'${'e'.repeat(64)}','s3://cw/AG-2/0.docx','2020-01-01');
  insert into cw.signature_certificate
    (agreement_id,provider,envelope_id,completed_at,certificate,byte_size,sha256) values
    ('AG-1','DocuSign','DS-1','2020-01-01T00:00:00Z','\\x0102030405'::bytea,5,'${CERT}');
  insert into cw.executed_signatory (agreement_id,ordinal,name,party,method,signed_on) values
    ('AG-1',0,'M. Okafor','ours','electronic','2020-01-01');
  insert into cw.agreement_retention (agreement_id,retention_until) values
    ('AG-1','2021-01-01'), ('AG-2','2021-01-01');
  select set_config('cw.actor','',false);`);

// ── The order is the control ──────────────────────────────────────────────
console.log('\na record is destroyed, then redacted, then purged — never skipped');

await test('redacting before the retention decision is refused', async () => {
  // Redaction CARRIES OUT a decision; it is not the decision. Removing content
  // from something nobody has decided to dispose of would be a deletion with no
  // decision behind it.
  await throws(() => queryAs('administrator',
    `select cw.redact_agreement('AG-1','${ADMIN}')`, [], ADMIN),
    'has not been ended');
});

await test('purging before redaction is refused — the review step cannot be skipped', async () => {
  // THE ESCALATION, and the whole reason U12 has two acts. There must always be
  // a state in which the record is content-free and reviewable before anybody
  // removes it.
  await execAs('administrator',
    `select cw.retention_destroy('AG-1','${ADMIN}')`, ADMIN);
  await throws(() => queryAs('administrator',
    `select cw.purge_agreement('AG-1','${ADMIN}')`, [], ADMIN),
    'has not been redacted');
});

// ── Who may do which ──────────────────────────────────────────────────────
console.log('\nredaction can be delegated; purging cannot');

await test('a legal reviewer with no delegation cannot redact', async () => {
  await throws(() => queryAs('legal_reviewer',
    `select cw.redact_agreement('AG-1','${PAT}')`, [], PAT),
    'holds no such delegation');
});

await test('a requester cannot reach either act at all', async () => {
  // Refused by PRIVILEGE, before either function's own check runs. That is the
  // stronger refusal: a role that cannot execute the function cannot be
  // delegated the authority by mistake either.
  await throws(() => queryAs('requester',
    `select cw.redact_agreement('AG-1','${DANA}')`, [], DANA),
    'permission denied');
  await throws(() => queryAs('requester',
    `select cw.purge_agreement('AG-1','${DANA}')`, [], DANA),
    'permission denied');
});

await test('only the administrator may delegate, and it lands on the chain', async () => {
  await mustNotWrite('legal_admin',
    `insert into cw.records_delegate (person,reason)
     values ('${PAT}','helping with the backlog')`);
  await mustWrite('administrator',
    `insert into cw.records_delegate (person,reason)
     values ('${PAT}','records clean-up for the 2020 cohort') returning delegate_id`,
    [], ADMIN);
  const e = await one(`select actor, subject, payload->>'reason' as why
                       from cw.audit_event where event_type='records_delegate_granted'`);
  eq([e.actor, e.subject], [ADMIN, PAT]);
  assert(e.why, 'the delegation records no reason, so nobody can review it later');
});

await test('an undelegated caller cannot borrow a delegate’s identity', async () => {
  await throws(() => queryAs('legal_admin',
    `select cw.redact_agreement('AG-1','${PAT}')`, [], LEGAL),
    'redaction actor must match the signed-in person',
    'an undelegated caller redacted content under a colleague’s name');
  const state = await one(
    `select redacted_on from cw.agreement_retention where agreement_id='AG-1'`);
  eq(state.redacted_on, null, 'the impersonation refusal changed the record');
});

await test('the delegate may now redact, and it is marked as delegated', async () => {
  await execAs('legal_reviewer', `select cw.redact_agreement('AG-1','${PAT}')`, PAT);
  const e = await one(`select payload->>'delegated' as d, payload->>'redacted_by' as who
                       from cw.audit_event where event_type='agreement_redacted'`);
  eq([e.d, e.who], ['true', PAT],
    'the chain does not record that this was a delegated act rather than the '
    + "Administrator's own");
});

await test('and STILL cannot purge — the delegation does not carry that', async () => {
  // The asymmetry is the owner's decision, not an oversight. Removing content
  // can be handed out; removing the record cannot.
  await throws(() => queryAs('legal_reviewer',
    `select cw.purge_agreement('AG-1','${PAT}')`, [], PAT),
    'permission denied');
});

// ── What redaction actually removed, and what it kept ─────────────────────
console.log('\nthe content is gone and the fact remains');

await test('the certificate bytes are gone', async () => {
  const c = await one(`select octet_length(certificate) as n, byte_size
                       from cw.signature_certificate where agreement_id='AG-1'`);
  assert(Number(c.n) <= 1,
    'the signature certificate still holds its bytes after redaction');
});

await test('the pointer to the document is severed', async () => {
  const d = await one(`select storage_uri from cw.executed_document
                       where agreement_id='AG-1' and doc_seq=0`);
  eq(d.storage_uri, '', 'the document is still reachable from this system');
});

await test('the FACT survives in full — name, size, hash, dates', async () => {
  // The hash is the important survivor. It still proves WHAT the document was
  // to anybody holding a copy, without this system holding one.
  const d = await one(`select filename, byte_size, sha256, signed_on
                       from cw.executed_document where agreement_id='AG-1' and doc_seq=0`);
  eq([d.filename, Number(d.byte_size), d.sha256], ['northwind.docx', 1024, SIG],
    'redaction took the record of what the document WAS, which U12 says to keep');
});

await test('the other agreement is untouched', async () => {
  const d = await one(`select storage_uri from cw.executed_document
                       where agreement_id='AG-2' and doc_seq=0`);
  eq(d.storage_uri, 's3://cw/AG-2/0.docx', 'redaction reached past the record it named');
});

await test('the review queue lists it, and says the outside bytes are still there', async () => {
  // The honest caveat. Clearing storage_uri severs this system's link; it does
  // not reach into the object store. A screen that implied otherwise would be
  // the most dangerous kind of clean.
  const r = await one(`select state, external_bytes_pending from cw.redaction_state
                       where agreement_id='AG-1'`);
  eq([r.state, r.external_bytes_pending], ['redacted', true]);
});

await test('redacting twice is refused', async () => {
  await throws(() => queryAs('administrator',
    `select cw.redact_agreement('AG-1','${ADMIN}')`, [], ADMIN),
    'already redacted');
});

// ── The purge ─────────────────────────────────────────────────────────────
console.log('\nthe record goes, and the chain remembers that it did');

await test('a purge cannot be attributed to a different administrator', async () => {
  await throws(() => queryAs('administrator',
    `select cw.purge_agreement('AG-1','${ADMIN}')`, [], 'impostor@clausewerk'),
    'purge actor must match the signed-in person',
    'an administrator-role session purged under another person’s name');
  const state = await one(
    `select purged_on from cw.agreement_retention where agreement_id='AG-1'`);
  eq(state.purged_on, null, 'the impersonation refusal changed the record');
});

await test('the administrator purges the reviewed record', async () => {
  await execAs('administrator', `select cw.purge_agreement('AG-1','${ADMIN}')`, ADMIN);
  for (const t of ['executed_agreement', 'executed_document',
                   'signature_certificate', 'executed_signatory']) {
    const n = await one(`select count(*)::int n from cw.${t} where agreement_id='AG-1'`);
    eq(n.n, 0, `cw.${t} still holds a row for the purged agreement`);
  }
});

await test('THE AUDIT CHAIN OUTLIVES IT — the disposal stays provable', async () => {
  // The reason a purge is safe to offer at all. cw.audit_event holds no DELETE
  // privilege for any role, is hash-chained and refuses TRUNCATE, so the
  // evidence that disposal happened correctly survives the disposal.
  const e = await rows(`select event_type from cw.audit_event
                        where subject='AG-1' order by seq`);
  const kinds = e.map(x => x.event_type);
  for (const k of ['agreement_opened', 'retention_destroyed',
                   'agreement_redacted', 'agreement_purged']) {
    assert(kinds.includes(k),
      `the chain lost ${k} for a purged agreement, so the disposal is no longer provable`);
  }
  const v = await one(`select cw.audit_verify() as broken`);
  eq(v.broken, null, 'purging a record broke the audit chain');
});

await test('the retention row remains, naming who purged it and when', async () => {
  const r = await one(`select state, purged_by, redacted_by from cw.redaction_state
                       where agreement_id='AG-1'`);
  eq([r.state, r.purged_by, r.redacted_by], ['purged', ADMIN, PAT]);
});

await test('purging twice is refused', async () => {
  await throws(() => queryAs('administrator',
    `select cw.purge_agreement('AG-1','${ADMIN}')`, [], ADMIN),
    'already purged');
});

// ── The hold still outranks everything ────────────────────────────────────
console.log('\na legal hold suspends both acts, and says which matter');

await test('neither act proceeds while a matter is open', async () => {
  await execAs('administrator', `select cw.retention_destroy('AG-2','${ADMIN}')`, ADMIN);
  await mustWrite('legal_admin',
    `insert into cw.legal_hold (agreement_id,matter_ref,opened_by)
     values ('AG-2','Contoso v. Us, 2026-CV-1','${LEGAL}') returning hold_id`, [], LEGAL);

  await throws(() => queryAs('administrator',
    `select cw.redact_agreement('AG-2','${ADMIN}')`, [], ADMIN),
    'Contoso v. Us, 2026-CV-1',
    'the refusal does not name the matter, so nobody can act on it');
  await throws(() => queryAs('administrator',
    `select cw.purge_agreement('AG-2','${ADMIN}')`, [], ADMIN),
    'Contoso v. Us, 2026-CV-1');
});

// ── The freeze is not otherwise weakened ──────────────────────────────────
console.log('\nand a signed contract is still frozen to everybody else');

await test('nobody can edit or delete a signed document by hand', async () => {
  // 0023 gave cw.executed_frozen() one sanctioned exception. This is the
  // assertion that it is ONLY that: the flag confers no privilege, and no role
  // holds update or delete on these tables anyway.
  await mustNotWrite('legal_admin',
    `update cw.executed_document set storage_uri='s3://elsewhere'
      where agreement_id='AG-2'`, [], { allowSilent: true });
  await mustNotWrite('administrator',
    `delete from cw.executed_document where agreement_id='AG-2'`,
    [], { allowSilent: true });
});

await test('setting the flag by hand achieves nothing without the privilege', async () => {
  // THE HONEST TEST OF THE DESIGN. cw.records_act is a session variable, so any
  // caller can set it — that is exactly the objection to make. What they cannot
  // do is acquire an UPDATE privilege they were never granted, and the flag only
  // stops the trigger refusing the owner-rights functions that are allowed
  // through. So: set it, genuinely, as a real role, and then watch the write be
  // refused anyway.
  //
  // Two statements in one role session rather than one call — a multi-statement
  // string cannot be sent as a prepared statement, and splitting it is also the
  // more honest reproduction of what an attacker would actually do.
  // Run inside ONE explicit transaction, because the flag is transaction-local
  // and would otherwise not survive to the next statement. That is the shape a
  // real attempt would take, and doing it any other way would prove only that
  // the flag is hard to set rather than that setting it does not help.
  const { as } = roleHelpers(db);
  await as('legal_admin', async () => {
    let threw = false;
    try {
      await db.exec(`begin;
        select set_config('cw.records_act','yes',true);
        update cw.executed_document set storage_uri='s3://elsewhere'
         where agreement_id='AG-2';
        commit;`);
    } catch { threw = true; }
    try { await db.exec('rollback;'); } catch { /* already ended */ }
    assert(threw,
      'the flag was set by hand and the write went through — the freeze is now '
      + 'defeated by a session variable, which is the one thing this design must '
      + 'not allow');
  }, LEGAL);

  // And the row is untouched, which is the assertion that would catch a write
  // that raised on the way out but had already landed.
  const d = await one(`select storage_uri from cw.executed_document
                       where agreement_id='AG-2' and doc_seq=0`);
  eq(d.storage_uri, 's3://cw/AG-2/0.docx', 'the document was modified after all');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
