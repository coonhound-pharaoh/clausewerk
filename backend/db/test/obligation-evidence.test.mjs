// Document and counterparty evidence for obligations (0050, OB-06).
//
// The guarantees:
//   · The same-deal rule: evidence answers for the deal it was received on.
//     A document from another deal proves nothing, whatever its bytes say.
//   · An acknowledgement records AGAINST a received document, never as a
//     bare flag — and it is evidence, not closure.
//   · Satisfy-with-document keeps the mandatory note (bytes without a
//     sentence are not evidence anybody can act on).
//   · The auditor reads and records nothing; both stores are append-only,
//     which the 0037/0047 suites already hold and this one does not repeat.
//
//   node db/test/obligation-evidence.test.mjs

// READ THROUGH cw.*_state_all, THE UNSCOPED DERIVATION (0071). These suites
// run as the database owner, where cw.app_role() is null — so the people-facing
// cw.notice_state and cw.obligation_state, which scope on app_role(), correctly
// answer nothing here. What is asserted below is the DERIVATION (open versus
// acknowledged, due versus overdue, who closed it), and that is what _all is.
// Whether the scoping works is asserted where the scoping lives:
// views-are-not-policies.test.mjs and doorway/test_reads.py.

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

const RITA = 'rita@cw';
const BEN  = 'ben@cw';

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values ('DP-H-014','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on)
    values ('DP-H-014',1,'T','placeholder','2025-01-01','2030-01-01');
  insert into cw.obligation_template
    (clause_id,version,kind,obliged,summary,schedule_kind,anchor,evidence)
    values ('DP-H-014',1,'notify','vendor','placeholder duty','once',
            'effective_on','document');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-E1','Northwind','${RITA}'), ('AG-E2','Contoso','${BEN}');
  insert into cw.snapshot (snapshot_id) values ('${'1'.repeat(64)}');
  insert into cw.ruleset (ruleset_id) values ('${'2'.repeat(64)}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,
                      gate_open,created_by)
    values ('RUN-E1','AG-E1','V','{}','manual','${'1'.repeat(64)}',
            '${'2'.repeat(64)}','${'3'.repeat(64)}','1.0.0',true,'${RITA}'),
           ('RUN-E2','AG-E2','V','{}','manual','${'1'.repeat(64)}',
            '${'2'.repeat(64)}','${'4'.repeat(64)}','1.0.0',true,'${BEN}');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on,term_end)
    values ('AG-E1','RUN-E1','2026-07-01','2026-07-15','2027-07-15'),
           ('AG-E2','RUN-E2','2026-07-01','2026-07-15','2027-07-15');
  insert into cw.obligation_instance
    (agreement_id,clause_id,version,template_id,occurrence,kind,obliged,summary,
     owner_person,due_on,evidence,lead_days,survives,entitlement)
    values ('AG-E1','DP-H-014',1,1,0,'notify','vendor','placeholder duty',
            '${RITA}',current_date + 40,'document',14,false,false),
           ('AG-E1','DP-H-014',1,1,1,'notify','vendor','second duty',
            '${RITA}',current_date + 60,'document',14,false,false);
  insert into cw.received_document (agreement_id,bytes,content_type,filename)
    values ('AG-E1','\\x6f6b','application/octet-stream','certificate.pdf'),
           ('AG-E2','\\x6e6f','application/octet-stream','wrong-deal.pdf');
`);

const DUTY = (await one(`select obligation_id from cw.obligation_instance
                          where summary='placeholder duty'`)).obligation_id;
const DUTY2 = (await one(`select obligation_id from cw.obligation_instance
                           where summary='second duty'`)).obligation_id;
const SAME_DEAL_DOC = (await one(`select document_id from cw.received_document
                                   where filename='certificate.pdf'`)).document_id;
const OTHER_DEAL_DOC = (await one(`select document_id from cw.received_document
                                    where filename='wrong-deal.pdf'`)).document_id;

console.log('\nthe same-deal rule');

await test('evidence from another deal is refused', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,document_ref,acted_by)
    values (${DUTY},'satisfied','the certificate arrived',${OTHER_DEAL_DOC},'x')`,
    [], RITA), 'was not received for agreement');
});

await test('a document that does not exist is refused, not ignored', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,document_ref,acted_by)
    values (${DUTY},'satisfied','citing nothing',99999,'x')`, [], RITA));
});

await test('satisfy-with-document closes the duty, evidence linked', async () => {
  await mustWrite('requester', `
    insert into cw.obligation_act (obligation_id,act,note,document_ref,acted_by)
    values (${DUTY},'satisfied','the insurance certificate, as received',
            ${SAME_DEAL_DOC},'x')`, [], RITA);
  const s = await one(`select state, closed_by from cw.obligation_state_all
                        where obligation_id = ${DUTY}`);
  eq([s.state, s.closed_by], ['satisfied', RITA]);
  const a = await one(`select document_ref from cw.obligation_act
                        where obligation_id = ${DUTY} and act='satisfied'`);
  eq(Number(a.document_ref), Number(SAME_DEAL_DOC),
     'the act cites the stored evidence row, immutably (both sides append-only)');
});

await test('the act and its evidence reference land on the chain', async () => {
  const e = await one(`select payload ? 'document_ref' as keyed from cw.audit_event
                        where event_type='obligation_satisfied'
                          and subject='${DUTY}'`);
  eq(e.keyed, true, 'the payload KEY is asserted, never wording');
});

console.log('\nan acknowledgement is evidence, not closure');

await test('an acknowledgement without a document is refused', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${DUTY2},'counterparty_ack','they say they did it','x')`, [], RITA));
});

await test('an acknowledgement records against the document and closes nothing', async () => {
  await mustWrite('requester', `
    insert into cw.obligation_act (obligation_id,act,note,document_ref,acted_by)
    values (${DUTY2},'counterparty_ack','their confirmation letter',
            ${SAME_DEAL_DOC},'x')`, [], RITA);
  const s = await one(`select state from cw.obligation_state_all
                        where obligation_id = ${DUTY2}`);
  eq(s.state, 'pending', 'an ack is evidence; the duty is still open');
});

await test('the acknowledged duty can still be satisfied afterwards', async () => {
  await mustWrite('requester', `
    insert into cw.obligation_act (obligation_id,act,note,document_ref,acted_by)
    values (${DUTY2},'satisfied','done, ack on file',${SAME_DEAL_DOC},'x')`,
    [], RITA);
  const s = await one(`select state from cw.obligation_state_all
                        where obligation_id = ${DUTY2}`);
  eq(s.state, 'satisfied');
});

console.log('\nwho records evidence');

await test('the auditor records no acknowledgement', async () => {
  await mustNotWrite('auditor', `
    insert into cw.obligation_act (obligation_id,act,note,document_ref,acted_by)
    values (${DUTY2},'counterparty_ack','x',${SAME_DEAL_DOC},'x')`);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const [n, m] of failures) console.log(`  FAIL ${n}: ${m}`);
  process.exit(1);
}
