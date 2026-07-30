// The reporting views (0043), the friction scorecard (0045) and the
// policy-shift exposure (0046).
//
// The guarantees:
//   · The report views answer legal_admin and the auditor, and REFUSE everyone
//     else — a requester asking gets a privilege error, never an empty list
//     dressed as an answer.
//   · The friction scorecard answers a requester too — that is its point —
//     groups counterparty names verbatim, and carries its estimate LABEL in
//     the row itself.
//   · Velocity leaves an unreached milestone null, never zero.
//   · Risk exposure counts live executed agreements only.
//   · Policy-shift exposure names superseded versions and missing
//     always-include categories, against the CURRENT library at read time.
//
//   node db/test/reporting.test.mjs

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

const { queryAs } = roleHelpers(db);
const LEGAL = 'legal@cw', AUDIT = 'audit@cw', RITA = 'rita@cw';

const SNAP = 'a'.repeat(64), RULES = 'c'.repeat(64), RH = 'd'.repeat(64);

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('ip','Intellectual Property','IP');
  insert into cw.clause (clause_id,category_key,severity,always_include) values
    ('DP-H-014','data','High',false), ('IP-S-001','ip','Standard',true);
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'GDPR','Notify within 24 hours.','2025-01-01','2030-01-01'),
    ('DP-H-014',2,'GDPR v2','Notify within 24 hours, with SCCs.','2026-01-01','2030-01-01'),
    ('IP-S-001',1,'IP','Work product belongs to Customer.','2025-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-001','Northwind','${RITA}'),
    ('AG-002','Northwind','${RITA}'),
    ('AG-003','Contoso','${RITA}');
  insert into cw.snapshot (snapshot_id,taken_on) values ('${SNAP}','2026-07-25');
  insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable) values
    ('${SNAP}','DP-H-014',1,true);
  insert into cw.ruleset (ruleset_id) values ('${RULES}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
    values ('RUN-001','AG-001','Northwind','{}','llm','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'${RITA}');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-001',0,'data','High','DP-H-014',1,'Matched High variant');
  insert into cw.executed_agreement
    (agreement_id,run_id,executed_on,effective_on,term_end,signature_evidence)
    values ('AG-001','RUN-001','2026-07-01','2026-07-01','2029-07-01','DS-1');
  -- A negotiation with pushback, on the still-open Northwind deal.
  insert into cw.negotiation (agreement_id,paper,opened_by,baseline_chosen_by)
    values ('AG-002','ours','${RITA}','${RITA}');
  insert into cw.negotiation_round
    (negotiation_id,round_no,direction,document_sha256,storage_uri,sent_on,actor)
    values (1,1,'received','${'e'.repeat(64)}','s3://cw/neg/1.docx','2026-07-10','${RITA}');
  insert into cw.negotiation_position
    (negotiation_id,category_key,round_raised,opened_from)
    values (1,'data',1,'their_paper');
  insert into cw.position_movement (position_id,round_no,to_state,actor,note)
    values (1,1,'escalated','${RITA}','their indemnity is under our floor');
  -- Two tickets: one escalated and later verified is out of scope here — one
  -- pending supplier-paper, one decided, for the throughput view.
  insert into cw.review_ticket
    (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
    values ('AG-002','data','High','supplier-paper','VENDOR LANGUAGE',
            'Vendor keeps all telemetry.','${RITA}');
  insert into cw.review_ticket
    (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
    values ('AG-002','data','High','human-escalated','EDITED BY LEGAL',
            'Escalated wording.','${RITA}');
  -- A decision is an act taken on a ticket, never a property it is born with —
  -- the schema says so, so the rejection happens as the act it is.
  select set_config('cw.actor','${LEGAL}',false);
  update cw.review_ticket
     set state='rejected', decided_by='${LEGAL}', decided_on=now(),
         decision_note='below the floor'
   where ticket_id = 2;
  select set_config('cw.actor','owner@clausewerk',false);
`);

console.log('\nwho may read a report');

await test('a requester is refused the report views, not shown empty lists', async () => {
  for (const v of ['report_velocity','report_clause_contest','report_queue_state',
                   'report_reviewer_throughput','report_risk_exposure',
                   'policy_shift_exposure'])
    await throws(() => queryAs('requester', `select * from cw.${v}`, [], RITA),
      'permission denied', `${v} must refuse a requester`);
});

await test('legal_admin and the auditor read every report', async () => {
  for (const v of ['report_velocity','report_clause_contest','report_queue_state',
                   'report_reviewer_throughput','report_risk_exposure',
                   'policy_shift_exposure']) {
    await queryAs('legal_admin', `select * from cw.${v}`, [], LEGAL);
    await queryAs('auditor', `select * from cw.${v}`, [], AUDIT);
  }
});

console.log('\nvelocity');

await test('an unreached milestone is null, never zero', async () => {
  const r = await queryAs('legal_admin',
    `select agreement_id, executed_on, days_open_to_signature, negotiation_turns
       from cw.report_velocity order by agreement_id`, [], LEGAL);
  const ag3 = r.find(x => x.agreement_id === 'AG-003');
  assert(ag3.executed_on === null && ag3.days_open_to_signature === null,
    'AG-003 never signed; its cycle time is unknown, not 0');
  const ag2 = r.find(x => x.agreement_id === 'AG-002');
  eq(ag2.negotiation_turns, 1, 'the received round is a turn');
});

console.log('\ncontested clauses');

await test('friction lands on the category that generated it', async () => {
  const r = await queryAs('legal_admin',
    `select * from cw.report_clause_contest where category_key='data'`, [], LEGAL);
  eq(r[0].tickets_supplier_paper, 1);
  eq(r[0].tickets_escalated, 1);
  eq(r[0].positions_escalated, 1);
  const ip = await queryAs('legal_admin',
    `select contests from cw.report_clause_contest where category_key='ip'`, [], LEGAL);
  eq(Number(ip[0].contests), 0, 'a quiet category shows a zero, visibly');
});

console.log('\nthe queue and its reviewers');

await test('the queue state counts what is pending', async () => {
  const q = await queryAs('legal_admin',
    `select pending from cw.report_queue_state`, [], LEGAL);
  eq(q[0].pending, 1);
});

await test('throughput counts deciders, not the pending pile', async () => {
  const t = await queryAs('legal_admin',
    `select reviewer, decided, rejected from cw.report_reviewer_throughput`, [], LEGAL);
  eq(t.length, 1); eq(t[0].reviewer, LEGAL); eq(t[0].rejected, 1);
});

console.log('\nrisk exposure');

await test('exposure counts live executed agreements by recorded severity', async () => {
  const r = await queryAs('auditor',
    `select category_key, severity, active_agreements
       from cw.report_risk_exposure`, [], AUDIT);
  eq(r.length, 1);
  eq(r[0], { category_key: 'data', severity: 'High', active_agreements: 1 });
});

console.log('\npolicy shift');

await test('a promoted version turns the executed portfolio into a worklist', async () => {
  const r = await queryAs('legal_admin',
    `select agreement_id, clause_id, executed_version, current_version, exposure
       from cw.policy_shift_exposure order by exposure`, [], LEGAL);
  const outdated = r.find(x => x.exposure === 'outdated');
  eq(outdated.clause_id, 'DP-H-014');
  eq(outdated.executed_version, 1);
  eq(outdated.current_version, 2, 'the library moved to v2; AG-001 carries v1');
  const missing = r.find(x => x.exposure === 'missing');
  eq(missing.clause_id, 'IP-S-001',
    'the always-include IP clause is absent from AG-001 entirely');
});

await test('retiring the newer version clears the exposure at read time', async () => {
  await db.exec(`reset role;
    select set_config('cw.actor','owner@clausewerk',false);
    update cw.clause_version set retired = true, retired_reason = 'placeholder review'
      where clause_id='DP-H-014' and version=2;`);
  const r = await queryAs('legal_admin',
    `select count(*)::int as n from cw.policy_shift_exposure
      where exposure='outdated'`, [], LEGAL);
  eq(r[0].n, 0, 'no batch job to rerun: the view reads the library as it stands');
  // Not restored: retirement is one-way by 0002's own rule, and nothing below
  // reads the clause library again.
});

console.log('\nthe friction scorecard');

await test('a requester reads the scorecard — that is its point', async () => {
  const r = await queryAs('requester',
    `select * from cw.vendor_friction order by counterparty`, [], RITA);
  const nw = r.find(x => x.counterparty === 'Northwind');
  eq(Number(nw.deals), 2);
  eq(Number(nw.rounds_received), 1);
  eq(Number(nw.positions_escalated), 1);
  eq(Number(nw.supplier_paper_tickets), 1);
});

await test('the cost is labelled an estimate in the row itself', async () => {
  const r = await queryAs('requester',
    `select counts_are, cost_is, estimated_handling_cost_usd
       from cw.vendor_friction where counterparty='Northwind'`, [], RITA);
  eq(r[0].counts_are, 'measured');
  assert(String(r[0].cost_is).startsWith('estimate'),
    'the label travels in the view, not in a screen that must remember it');
  // rate 250 × (1 round × 2h + 2 escalation-class events × 4h) = 2500
  eq(Number(r[0].estimated_handling_cost_usd), 2500,
    'the estimate multiplies the counts by the visible settings');
});

await test('counterparty names group verbatim — a misspelling is two rows', async () => {
  const r = await queryAs('requester',
    `select count(*)::int as n from cw.vendor_friction`, [], RITA);
  eq(r[0].n, 2, 'Northwind and Contoso; no fuzzy merging on a report');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
