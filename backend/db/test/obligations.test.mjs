// Obligations — templates through the gate (0035, OB-01).
//
// The guarantees, and why each is worth a test that can fail:
//
//   · A template is born 'proposed'. A row born approved walks past the whole
//     state machine on day one — the review-queue lesson, applied here.
//   · Approval is legal_admin's act, never the proposer's own (the 0028 rule),
//     and it binds the approver from the connection, not from a claim.
//   · An approved template is immutable except retirement, because
//     registration (OB-02) reads templates BY DATE — rewriting an approved row
//     rewrites what past registrations meant.
//   · Retired is terminal, and nothing is ever deleted.
//
// Every governed act runs AS THE REAL DATABASE ROLE. Run as the owner these
// tests would prove nothing (finding D1) — except the delete test, which runs
// as the owner DELIBERATELY: no grant stops the owner, so only the trigger's
// own words prove the last line of defense (the D6 lesson).
//
//   node db/test/obligations.test.mjs

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

const PAT  = 'p.reviewer@clausewerk';   // legal reviewer
const DANA = 'd.admin@clausewerk';      // legal admin
const ROSS = 'r.admin@clausewerk';      // a second legal admin

await db.exec(`
  select set_config('cw.actor','legal@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values ('DP-H-014','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'24h','Notify within 24 hours.','2025-01-01','2030-01-01');
`);

console.log('\ntemplates are born proposed, through the gate');

await test('a template is born proposed, whatever the caller claims', async () => {
  await throws(() => queryAs('legal_reviewer', `
    insert into cw.obligation_template
      (clause_id,version,kind,obliged,summary,schedule_kind,anchor,evidence,
       state,approved_by,approved_on)
    values ('DP-H-014',1,'notify','customer','x','once','effective_on',
            'attestation','approved','forged@clausewerk',current_date)`,
    [], PAT), 'born proposed');
  const n = await one(`select count(*)::int as n from cw.obligation_template`);
  eq(n.n, 0, 'the forged row must not exist in any form');
});

await test('the proposer is the connection, not a claim', async () => {
  await mustWrite('legal_reviewer', `
    insert into cw.obligation_template
      (clause_id,version,kind,obliged,summary,schedule_kind,anchor,evidence,
       lead_days,proposed_by)
    values ('DP-H-014',1,'notify','customer',
            'Notify the customer of a breach within 24 hours.','once',
            'effective_on','attestation',14,'somebody.else@clausewerk')`,
    [], PAT);
  const t = await one(`select state, proposed_by from cw.obligation_template`);
  eq([t.state, t.proposed_by], ['proposed', PAT],
     'the recorded proposer must be the signed-in person');
});

const TPL = (await one(`select template_id from cw.obligation_template`)).template_id;

await test('a legal reviewer cannot decide a template — only legal admin', async () => {
  await mustNotWrite('legal_reviewer',
    `update cw.obligation_template set state='approved' where template_id=${TPL}`);
});

await test('a proposed template may be reworked before approval', async () => {
  await mustWrite('legal_admin', `
    update cw.obligation_template set lead_days = 30 where template_id=${TPL}`,
    [], DANA);
  const t = await one(`select lead_days, state from cw.obligation_template
                        where template_id=${TPL}`);
  eq([t.lead_days, t.state], [30, 'proposed']);
});

await test('nobody approves their own obligation template', async () => {
  // DANA proposes one and then tries to approve it — same person, same role
  // that legitimately holds the approving privilege.
  await mustWrite('legal_admin', `
    insert into cw.obligation_template
      (clause_id,version,kind,obliged,summary,schedule_kind,anchor,evidence)
    values ('DP-H-014',1,'maintain','vendor','Keep records for 7 years.',
            'once','term_end','attestation')`, [], DANA);
  const own = (await one(`select template_id from cw.obligation_template
                           where proposed_by=$1`, [DANA])).template_id;
  await throws(() => queryAs('legal_admin', `
    update cw.obligation_template set state='approved'
     where template_id=${own}`, [], DANA),
    'nobody approves their own obligation template');
});

await test('approval by another admin binds the approver from the connection', async () => {
  await mustWrite('legal_admin', `
    update cw.obligation_template
       set state='approved', approved_by='forged@clausewerk'
     where template_id=${TPL}`, [], DANA);
  const t = await one(`select state, approved_by, approved_on is not null as dated,
                              effective_on is not null as effective
                         from cw.obligation_template where template_id=${TPL}`);
  eq([t.state, t.approved_by, t.dated, t.effective],
     ['approved', DANA, true, true],
     'the approver on the record must be the person who acted');
});

await test('approval lands on the chain', async () => {
  const e = await one(`
    select count(*)::int as n from cw.audit_event
     where event_type='obligation_template_approved' and subject=$1`,
    [String(TPL)]);
  eq(e.n, 1);
});

console.log('\napproved means immutable; retired means gone for good');

await test('an approved template is immutable — retire it and author a new one', async () => {
  await throws(() => queryAs('legal_admin', `
    update cw.obligation_template set lead_days = 5
     where template_id=${TPL}`, [], ROSS),
    'approved and immutable');
});

await test('retirement needs a reason', async () => {
  await throws(() => queryAs('legal_admin', `
    update cw.obligation_template set state='retired'
     where template_id=${TPL}`, [], ROSS));
  const t = await one(`select state from cw.obligation_template where template_id=${TPL}`);
  eq(t.state, 'approved', 'a reasonless retirement must not land');
});

await test('a proposed template cannot be retired — it was never in force', async () => {
  const own = (await one(`select template_id from cw.obligation_template
                           where state='proposed'`)).template_id;
  await throws(() => queryAs('legal_admin', `
    update cw.obligation_template
       set state='retired', retired_reason='never mind'
     where template_id=${own}`, [], DANA),
    'proposed -> approved -> retired');
});

await test('a retired template never comes back', async () => {
  await mustWrite('legal_admin', `
    update cw.obligation_template
       set state='retired', retired_reason='superseded by a tighter duty'
     where template_id=${TPL}`, [], ROSS);
  await throws(() => queryAs('legal_admin', `
    update cw.obligation_template set state='approved'
     where template_id=${TPL}`, [], ROSS),
    'never comes back');
});

await test('retiring is a recorded act with the reason on the chain', async () => {
  const e = await one(`
    select payload->>'reason' as reason from cw.audit_event
     where event_type='obligation_template_retired' and subject=$1`,
    [String(TPL)]);
  eq(e.reason, 'superseded by a tighter duty');
});

await test('a template is never deleted — not even by the owner', async () => {
  // As the owner DELIBERATELY: no grant stops the owner, so this asserts the
  // trigger's own words — the second layer, proven on its own (the D6 lesson).
  await throws(() => db.exec(`delete from cw.obligation_template
                               where template_id=${TPL}`),
    'never deleted');
});

// ════════════════════════════════════════════════════════════════════════════
// Registration — the deterministic derivation at execution (0036, OB-02)
// ════════════════════════════════════════════════════════════════════════════

console.log('\nregistration: a lookup by clause ID, never an analysis');

const SNAP = 'a'.repeat(64), RULES = 'c'.repeat(64), RH = 'd'.repeat(64);
const SIG = '1'.repeat(64), SIG2 = '2'.repeat(64);

await db.exec(`
  insert into cw.clause (clause_id,category_key,severity) values ('DP-H-052','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-OB1','Northwind','buyer@clausewerk'),
    ('AG-OB2','Contoso','buyer@clausewerk');
  insert into cw.snapshot (snapshot_id,taken_on) values ('${SNAP}','2026-05-01');
  insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable) values
    ('${SNAP}','DP-H-052',1,true);
  insert into cw.ruleset (ruleset_id) values ('${RULES}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
    values ('RUN-OB1','AG-OB1','Northwind','{}','llm','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'buyer@clausewerk'),
           ('RUN-OB2','AG-OB2','Contoso','{}','llm','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'buyer@clausewerk');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-OB1',0,'data','High','DP-H-052',1,'Matched High variant'),
           ('RUN-OB2',0,'data','High','DP-H-052',1,'Matched High variant');
`);

// Three templates on DP-H-052@v1, proposed by PAT and approved by ROSS today:
// a once duty, a monthly recurring one, and a termination-anchored survivor.
await mustWrite('legal_reviewer', `
  insert into cw.obligation_template
    (clause_id,version,kind,obliged,summary,schedule_kind,anchor,offset_days,evidence,lead_days)
  values ('DP-H-052',1,'notify','vendor','Deliver the breach-contact list.',
          'once','effective_on',10,'attestation',5)`, [], PAT);
await mustWrite('legal_reviewer', `
  insert into cw.obligation_template
    (clause_id,version,kind,obliged,summary,schedule_kind,anchor,offset_days,every_months,evidence)
  values ('DP-H-052',1,'deliver','vendor','Monthly processing report.',
          'recurring','effective_on',0,1,'document')`, [], PAT);
await mustWrite('legal_reviewer', `
  insert into cw.obligation_template
    (clause_id,version,kind,obliged,summary,schedule_kind,anchor,evidence,survives)
  values ('DP-H-052',1,'refrain','vendor','Delete all personal data.',
          'on_event','termination','attestation',true)`, [], PAT);
await mustWrite('legal_admin', `
  update cw.obligation_template set state='approved'
   where clause_id='DP-H-052' and state='proposed'`, [], ROSS);

// AG-OB1's dates are computed from TODAY, never written down. The fixture
// used to hardcode an execution of 2026-08-01 while the templates above are
// approved on the day the suite runs — so from 2026-08-02 the
// approved-before-executed pin (0036) refused the registration, exactly as
// pinned, against the test's own fixture. Date rot, not a defect. Executed
// today, effective the first of the month after next, a six-month term: the
// same nine instances, whichever day the suite runs.
const D = await one(`select
  current_date::text as executed_on,
  (date_trunc('month', current_date) + interval '2 months')::date::text as effective_on,
  (date_trunc('month', current_date) + interval '8 months')::date::text as term_end,
  ((date_trunc('month', current_date) + interval '2 months')::date + 10)::text as once_due`);

await test('execution registers obligations from the pinned decision set', async () => {
  // The term ends well inside any registration horizon, so the recurring
  // count is a fixed fact rather than a function of the day the suite runs.
  await db.exec(`
    insert into cw.executed_agreement
      (agreement_id,run_id,executed_on,effective_on,term_end)
      values ('AG-OB1','RUN-OB1','${D.executed_on}','${D.effective_on}','${D.term_end}');
    insert into cw.executed_document
      (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
      values ('AG-OB1',0,'agreement','MSA.docx',1000,'${SIG}','s3://x/0.docx','${D.executed_on}');`);
  const inst = await rows(`
    select kind, occurrence, due_on::text as due, owner_person
    from cw.obligation_instance where agreement_id='AG-OB1'
    order by kind, occurrence`);
  // once: effective + 10 days. recurring: monthly, capped by the term end.
  const once = inst.filter(i => i.kind === 'notify');
  const monthly = inst.filter(i => i.kind === 'deliver');
  eq(once.length, 1); eq(once[0].due, D.once_due);
  eq(monthly.length, 7, 'the effective month through term end, one per month, capped there');
  eq(monthly[0].due, D.effective_on); eq(monthly[6].due, D.term_end);
  eq(inst.every(i => i.owner_person === 'buyer@clausewerk'), true,
     'the accountable person defaults to the deal requester');
});

await test('a termination-anchored duty registers unanchored, visibly', async () => {
  const s = await one(`
    select due_on, survives from cw.obligation_instance
    where agreement_id='AG-OB1' and kind='refrain'`);
  eq([s.due_on, s.survives], [null, true],
     'no termination date exists yet, so no due date is invented');
});

await test('registration lands on the chain as a machine act', async () => {
  const e = await one(`
    select actor_kind, (payload->>'instances')::int as n from cw.audit_event
    where event_type='obligations_registered' and subject='AG-OB1'`);
  eq([e.actor_kind, e.n], ['system', 9], 'derivation is never recorded as a human act');
});

await test('registration is idempotent — a re-run adds nothing', async () => {
  const r = await queryAs('legal_admin',
    `select cw.register_obligations('AG-OB1') as added`, [], ROSS);
  eq(r[0].added, 0);
  const n = await one(`select count(*)::int as n from cw.obligation_instance
                        where agreement_id='AG-OB1'`);
  eq(n.n, 9);
});

await test('a template approved after execution reaches future registrations only', async () => {
  // AG-OB2 executed BEFORE today's approvals, so none of the templates were in
  // force when it signed. Nothing registers, and that is the pin working.
  await db.exec(`
    insert into cw.executed_agreement
      (agreement_id,run_id,executed_on,effective_on,term_end)
      values ('AG-OB2','RUN-OB2','2026-06-01','2026-06-15','2027-06-15');
    insert into cw.executed_document
      (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
      values ('AG-OB2',0,'agreement','MSA2.docx',1000,'${SIG2}','s3://x/1.docx','2026-06-01');`);
  const n = await one(`select count(*)::int as n from cw.obligation_instance
                        where agreement_id='AG-OB2'`);
  eq(n.n, 0, 'templates approved after execution must not reach back');
});

await test('an in-force clause declaring nothing is a visible gap', async () => {
  const g = await rows(`select clause_id, version from cw.obligation_coverage_gap
                         where agreement_id='AG-OB2'`);
  eq(g, [{ clause_id: 'DP-H-052', version: 1 }],
     'the gap is reported, not guessed at — and never a defect in development');
});

await test('the obligation record cannot be rewritten — not even by the owner', async () => {
  await throws(() => db.exec(`
    update cw.obligation_instance set due_on='2030-01-01'
     where agreement_id='AG-OB1' and kind='notify'`),
    'cannot be rewritten');
  await throws(() => db.exec(`
    delete from cw.obligation_instance where agreement_id='AG-OB1'`),
    'append-only');
});

await test('re-derivation reports no disagreement on an honest record', async () => {
  const d = await queryAs('auditor',
    `select * from cw.obligation_rederive('AG-OB1')`);
  eq(d, [], 'a clean record re-derives to exactly itself');
});

await test('a requester reads their own deals at the table', async () => {
  const own = await queryAs('requester',
    `select count(*)::int as n from cw.obligation_instance where agreement_id='AG-OB1'`,
    [], 'buyer@clausewerk');
  eq(own[0].n, 9);
  const rival = await queryAs('requester',
    `select count(*)::int as n from cw.obligation_instance where agreement_id='AG-OB1'`,
    [], 'rival@clausewerk');
  eq(rival[0].n, 0, 'the table scopes by deal; openness comes with the views, deliberately');
});

// ════════════════════════════════════════════════════════════════════════════
// The recorded acts (0037, OB-04) — states are computed, acts are recorded
// ════════════════════════════════════════════════════════════════════════════

console.log('\nacts: satisfy, reassign, assert breach — named, noted, audited');

const BUYER = 'buyer@clausewerk';

// AG-OB3 executes TODAY with an effective date long past and a term already
// ended, so its obligations are overdue the moment they register — and stay a
// fixed fact whichever day the suite runs.
await db.exec(`
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-OB3','Overdue Ltd','${BUYER}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                      snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
    values ('RUN-OB3','AG-OB3','Overdue Ltd','{}','llm','${SNAP}','${RULES}','${RH}',
            'clausewerk-engine/3',true,'${BUYER}');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-OB3',0,'data','High','DP-H-052',1,'Matched High variant');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on,term_end)
    values ('AG-OB3','RUN-OB3',current_date,'2026-01-01','2026-07-01');
  insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on)
    values ('AG-OB3',0,'agreement','MSA3.docx',1000,'${'3'.repeat(64)}','s3://x/3.docx',current_date);
`);

const FUTURE_DUE = (await one(`select obligation_id from cw.obligation_instance
  where agreement_id='AG-OB1' and kind='notify'`)).obligation_id;
const OVERDUE = (await one(`select obligation_id from cw.obligation_instance
  where agreement_id='AG-OB3' and kind='notify'`)).obligation_id;
const REASSIGN_ME = (await one(`select obligation_id from cw.obligation_instance
  where agreement_id='AG-OB3' and kind='deliver' and occurrence=0`)).obligation_id;

await test('satisfying with an empty note is refused', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${FUTURE_DUE},'satisfied','   ','x')`, [], BUYER),
    'satisfaction_needs_note');
});

await test('a satisfaction is a named act with the note on the record', async () => {
  await mustWrite('requester', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${FUTURE_DUE},'satisfied','Contact list delivered by counsel.',
            'forged@clausewerk')`, [], BUYER);
  const a = await one(`select acted_by, note from cw.obligation_act
                        where obligation_id=${FUTURE_DUE}`);
  eq(a.acted_by, BUYER, 'the actor is the connection, not a claim');
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='obligation_satisfied' and subject='${FUTURE_DUE}'`);
  eq(e.n, 1, 'the act lands on the chain');
});

await test('a decision is not revisited', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${FUTURE_DUE},'satisfied','again','x')`, [], BUYER),
    'already closed');
});

await test('reassignment moves accountability to a named person', async () => {
  await throws(() => queryAs('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,new_owner,acted_by)
    values (${REASSIGN_ME},'reassigned','  ','x')`, [], DANA),
    'reassignment_names_a_person');
  await mustWrite('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,new_owner,acted_by)
    values (${REASSIGN_ME},'reassigned','m.cover@clausewerk','x')`, [], DANA);
  const o = await one(`select cw.obligation_owner(${REASSIGN_ME}) as owner`);
  eq(o.owner, 'm.cover@clausewerk');
});

await test('an act cannot be rewritten or deleted — not even by the owner', async () => {
  await throws(() => db.exec(`update cw.obligation_act set note='better story'
    where obligation_id=${FUTURE_DUE}`), 'append-only');
  await throws(() => db.exec(`delete from cw.obligation_act
    where obligation_id=${FUTURE_DUE}`), 'append-only');
});

await test('breach is asserted only on an overdue fact (D-1)', async () => {
  // Not overdue: the arithmetic does not support the claim.
  const notYet = (await one(`select obligation_id from cw.obligation_instance
    where agreement_id='AG-OB1' and kind='deliver' and occurrence=6`)).obligation_id;
  await throws(() => queryAs('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${notYet},'breach_asserted','they are late','x')`, [], DANA),
    'not overdue');
  // Overdue: the assertion is accepted, named and audited.
  await mustWrite('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${OVERDUE},'breach_asserted','No contact list after two notices.','x')`,
    [], DANA);
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='obligation_breach_asserted' and subject='${OVERDUE}'`);
  eq(e.n, 1);
});

await test('nobody but legal admin asserts breach', async () => {
  // As the deal's OWNER, deliberately: a non-owning requester is refused by
  // the guard's scoped lookup before the policy is consulted, which would
  // mask a widened policy (the S110 shape, found live by a MISS). For the
  // owner, the policy is the only refusal in the path.
  const other = (await one(`select obligation_id from cw.obligation_instance
    where agreement_id='AG-OB3' and kind='deliver' and occurrence=1`)).obligation_id;
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${other},'breach_asserted','late','x')`, [], BUYER),
    'row-level security');
});

await test('an unowned obligation on a live deal is a visible gap', async () => {
  // cw.agreement.requester is NOT NULL, so no legitimate write produces an
  // unowned obligation today — the state can only arrive from below the
  // application (a requester who has left, a future write path). Induced as
  // the owner for exactly that reason, the audit-chain fork precedent: the
  // guard is proven against the state it exists for, not the states we can
  // reach politely.
  await db.exec(`
    insert into cw.obligation_instance
      (agreement_id,clause_id,version,template_id,occurrence,kind,obliged,summary,
       owner_person,due_on,evidence,lead_days,survives,entitlement)
    select 'AG-OB3', clause_id, version, template_id, 99, kind, obliged, summary,
           null, '2026-06-15', evidence, lead_days, survives, entitlement
    from cw.obligation_template
    where clause_id='DP-H-052' and kind='notify' and state='approved'`);
  const g = await queryAs('legal_admin',
    `select distinct agreement_id from cw.obligation_unowned`, [], DANA);
  eq(g, [{ agreement_id: 'AG-OB3' }],
     'a duty with nobody accountable is reported, never calm');
});

// ════════════════════════════════════════════════════════════════════════════
// Computed states and close eligibility (0038, OB-03)
// ════════════════════════════════════════════════════════════════════════════

console.log('\nstates are computed from the calendar; only acts are stored');

await test('an obligation inside its lead window reads due', async () => {
  // A template anchored on execution day + 3, with a 30-day lead: due lands
  // three days out whichever day the suite runs, squarely inside the window.
  await mustWrite('legal_reviewer', `
    insert into cw.obligation_template
      (clause_id,version,kind,obliged,summary,schedule_kind,anchor,offset_days,evidence,entitlement)
    values ('DP-H-052',1,'permit','customer','Audit rights are exercisable.',
            'once','executed_on',3,'attestation',true)`, [], PAT);
  await mustWrite('legal_admin', `
    update cw.obligation_template set state='approved'
     where clause_id='DP-H-052' and state='proposed'`, [], ROSS);
  await queryAs('legal_admin',
    `select cw.register_obligations('AG-OB3')`, [], ROSS);
  const s = await queryAs('legal_admin', `
    select state, entitlement from cw.obligation_state
    where agreement_id='AG-OB3' and kind='permit'`, [], DANA);
  eq(s, [{ state: 'due', entitlement: true }],
     'a claimable right shows up with the same urgency as a duty');
});

await test('past its due date it reads overdue — arithmetic, never breach', async () => {
  const s = await queryAs('legal_admin', `
    select state, breach_asserted_by from cw.obligation_state
    where agreement_id='AG-OB3' and kind='notify' and occurrence=0`, [], DANA);
  eq(s, [{ state: 'overdue', breach_asserted_by: DANA }],
     'the assertion sits BESIDE the computed fact, never in place of it (D-1)');
});

await test('a satisfied duty reads satisfied, with its closer', async () => {
  const s = await queryAs('requester', `
    select state, closed_by from cw.obligation_state
    where agreement_id='AG-OB1' and kind='notify'`, [], BUYER);
  eq(s, [{ state: 'satisfied', closed_by: BUYER }]);
});

await test('an unanchored survivor reads pending, and blocks close', async () => {
  const s = await queryAs('requester', `
    select state from cw.obligation_state
    where agreement_id='AG-OB1' and kind='refrain'`, [], BUYER);
  eq(s, [{ state: 'pending' }], 'no due date is invented for it');
  const c = await queryAs('legal_admin', `
    select closeable, surviving_open from cw.agreement_close_eligibility
    where agreement_id='AG-OB1'`, [], DANA);
  eq(c, [{ closeable: false, surviving_open: 1 }],
     '"we cannot date it yet" is not "it is met" — close fails closed');
});

await test('closing the last survivor opens the close gate', async () => {
  const survivor = (await one(`select obligation_id from cw.obligation_instance
    where agreement_id='AG-OB1' and kind='refrain'`)).obligation_id;
  await mustWrite('requester', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${survivor},'satisfied','Deletion certificate received from vendor.','x')`,
    [], BUYER);
  const c = await queryAs('legal_admin', `
    select closeable from cw.agreement_close_eligibility
    where agreement_id='AG-OB1'`, [], DANA);
  eq(c, [{ closeable: true }]);
});

// ════════════════════════════════════════════════════════════════════════════
// Waiver is an override (0039, OB-05) — riding the 0015 machinery
// ════════════════════════════════════════════════════════════════════════════

console.log('\nwaiver: request, socialise, approve — then, and only then, the act');

const REFRAIN = (await one(`select obligation_id from cw.obligation_instance
  where agreement_id='AG-OB3' and kind='refrain'`)).obligation_id;
const ORPHAN = (await one(`select obligation_id from cw.obligation_instance
  where agreement_id='AG-OB3' and occurrence=99`)).obligation_id;

// The request, socialised with its window already closed — the 0015 machinery
// owns those guards and proves them in its own suite; this one seeds past them
// the way override.test.mjs itself does.
await db.exec(`
  insert into cw.override_request (run_id,agreement_id,requested_by,justification)
    values ('RUN-OB3','AG-OB3','${BUYER}',
            'The vendor ceased trading; the deletion duty cannot be performed.');
`);
const WREQ = (await one(`select request_id from cw.override_request
  where agreement_id='AG-OB3'`)).request_id;
await db.exec(`
  insert into cw.override_finding (request_id,finding_ref,severity,summary)
    values (${WREQ},'obligation:${REFRAIN}','High','waive the deletion duty'),
           (${WREQ},'obligation:${ORPHAN}','High','waive the orphaned duty');
`);
// Socialised through the real machinery — the deal owner is the audience —
// then the window is moved into the past as the owner, the way
// override.test.mjs itself closes a window (there is deliberately no role
// that can shorten a live one).
await queryAs('legal_reviewer',
  `select cw.socialise_override_request(${WREQ})`, [], PAT);
await db.exec(`update cw.override_socialisation
  set window_closes = now() - interval '1 minute' where request_id=${WREQ}`);

await test('a waiver without an approved override authorises nothing', async () => {
  await throws(() => queryAs('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,note,override_ref,acted_by)
    values (${REFRAIN},'waived','vendor gone',${WREQ},'x')`, [], DANA),
    'a proposal is not an approval');
  await throws(() => queryAs('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,note,acted_by)
    values (${REFRAIN},'waived','vendor gone','x')`, [], DANA),
    'a proposal is not an approval', 'no reference at all is no better');
});

await test('an approval for a different obligation authorises nothing', async () => {
  await queryAs('legal_reviewer',
    `select cw.decide_override_finding(${WREQ},'obligation:${ORPHAN}','approved')`,
    [], PAT);
  await throws(() => queryAs('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,note,override_ref,acted_by)
    values (${REFRAIN},'waived','vendor gone',${WREQ},'x')`, [], DANA),
    'a proposal is not an approval',
    'the request is real and carries an approval — for the OTHER duty');
});

await test('a requester cannot record the waiver act', async () => {
  // As the deal's owner, for the same reason as the breach test: only the
  // policy stands between the owner and the insert, so only this shape can
  // see the policy widen.
  await throws(() => queryAs('requester', `
    insert into cw.obligation_act (obligation_id,act,note,override_ref,acted_by)
    values (${ORPHAN},'waived','approved, so I will book it myself',${WREQ},'x')`,
    [], BUYER),
    'row-level security');
});

await test('with the approval in force, the waiver closes the survivor', async () => {
  await queryAs('legal_reviewer',
    `select cw.decide_override_finding(${WREQ},'obligation:${REFRAIN}','approved')`,
    [], PAT);
  await mustWrite('legal_admin', `
    insert into cw.obligation_act (obligation_id,act,note,override_ref,acted_by)
    values (${REFRAIN},'waived','Vendor in liquidation; duty impossible.',${WREQ},'x')`,
    [], DANA);
  const s = await queryAs('legal_admin', `
    select state, closed_by from cw.obligation_state where obligation_id=${REFRAIN}`,
    [], DANA);
  eq(s, [{ state: 'waived', closed_by: DANA }]);
  const c = await queryAs('legal_admin', `
    select closeable from cw.agreement_close_eligibility where agreement_id='AG-OB3'`,
    [], DANA);
  eq(c, [{ closeable: true }], 'the last survivor is terminal, so the deal may close');
  const e = await one(`select count(*)::int as n from cw.audit_event
    where event_type='obligation_waived' and subject='${REFRAIN}'`);
  eq(e.n, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// The waiting-on-you derivation (0041, OB-08)
// ════════════════════════════════════════════════════════════════════════════

console.log('\nwaiting-on-you: derived fresh, never stored');

await test('the workspace panel answers for the caller alone', async () => {
  const mine = await queryAs('requester',
    `select kind, subject_ref from cw.waiting_on_you`, [], BUYER);
  assert(mine.some(r => r.kind === 'renewal_window' && r.subject_ref === 'AG-OB3'),
    'the renewal window on their own deal is on the list');
  assert(mine.some(r => r.kind === 'obligation' && r.subject_ref === String(OVERDUE)),
    'their overdue duty is on the list');
  assert(!mine.some(r => r.subject_ref === String(ORPHAN)),
    'the unowned duty is nobody’s panel entry — it is the gap surface’s job');
  const rival = await queryAs('requester',
    `select count(*)::int as n from cw.waiting_on_you`, [], 'rival@clausewerk');
  eq(rival[0].n, 0, 'a person with nothing waiting sees nothing — no leakage either');
});

await test('a role audience reaches every holder of the role', async () => {
  await db.exec(`
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-OB1','data','High','human-escalated','VENDOR LANGUAGE',
            'Supplier shall notify Customer within seventy-two (72) hours.')`);
  const admin = await queryAs('legal_admin',
    `select kind from cw.waiting_on_you where kind='review_ticket'`, [], DANA);
  eq(admin.length, 1, 'an unclaimed ticket waits on anybody who can decide it');
  const buyer = await queryAs('requester',
    `select count(*)::int as n from cw.waiting_on_you where kind='review_ticket'`,
    [], BUYER);
  eq(buyer[0].n, 0, 'a requester holds no deciding role, so it does not wait on them');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
