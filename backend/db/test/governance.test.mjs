// Governance tests — required approvers and legal hold (migration 0010).
//
// Two guarantees, and they are the reason this suite exists:
//
//   1. A machine may PROPOSE a concession. Only named people SETTLE one, and
//      "named people" means the Requester, the assigned attorney, and every
//      Required Approver configured for that contract — owner decision,
//      2026-07-25 (CLA §3, §7).
//   2. While a legal hold is open, nothing about that agreement is destroyed,
//      however far past its retention date it is (LIFECYCLE §3.5).
//
// Every governed act below runs AS THE REAL DATABASE ROLE. Run as the owner
// these tests would prove nothing: the owner bypasses row-level security and
// holds every privilege by definition, which is exactly how finding D1 hid.
//
//   node db/test/governance.test.mjs

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
// The concession summary views scope themselves by who is asking (0027), so
// reading them on the owner's connection — which holds no role — correctly
// answers with nothing. Read them as a real role, like every governed act here.
const oneAs = async (role, s, p) => (await queryAs(role, s, p))[0];

const BUYER = 'buyer@clausewerk';
const ATTY  = 'r.vance@clausewerk';

await db.exec(`
  select set_config('cw.actor','legal@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-H-014','data','High'), ('DP-H-052','data','High'), ('DP-H-061','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'24h','Notify within 24 hours.','2025-01-01','2030-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2030-01-01'),
    ('DP-H-061',1,'72h','Notify within 72 hours.','2025-01-01','2030-01-01');
  insert into cw.ladder (ladder_id,category_key,severity,owner) values (1,'data','High','R. Vance');
  insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
    (1,0,'DP-H-014',1,false), (1,1,'DP-H-052',1,false), (1,2,'DP-H-061',1,true);
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-001','Northwind','${BUYER}'),
    ('AG-002','Contoso','${BUYER}'),
    ('AG-003','Fabrikam','${BUYER}');`);

// A concession, recorded as the real requester. This is the PROPOSAL — the
// point being contested and the position asked for. It binds nobody yet.
const concede = async (agreement, rung, actor = BUYER, kind = 'human') =>
  (await queryAs('requester', `insert into cw.concession
     (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,
      reason,approved_by,proposer_kind)
     values ($1,'data','DP-H-014',1,$2,'Vendor could not meet 24h',$3,$4)
     returning concession_id`, [agreement, rung, 'forged-approver@clausewerk', kind],
     actor))[0].concession_id;

console.log('\na concession is a proposal until named people settle it (WP-18a)');

let C1;
await test('a requester can record a concession — as the real role', async () => {
  C1 = await concede('AG-001', 1);
  const c = await oneAs('legal_reviewer',
    `select approved_by from cw.concession where concession_id=$1`, [C1]);
  eq(c.approved_by, BUYER,
     'immutable concession attribution must name the authenticated proposer');
  const s = await oneAs('legal_reviewer', `select state from cw.concession_state where concession_id=$1`, [C1]);
  eq(s.state, 'proposed', 'nothing is in force merely because it was written down');
  const f = await oneAs('legal_reviewer', `select count(*)::int n from cw.concession_in_force
                       where concession_id=$1`, [C1]);
  eq(f.n, 0, 'and nothing reads it as agreed');
});

await test('a deal with no assigned attorney cannot settle anything', async () => {
  // Fail closed. An unassigned deal is a configuration gap, and the honest
  // behaviour is to refuse and say so — not to quietly need one fewer approval.
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values ($1,'legal@clausewerk')`, [C1]),
    'no attorney is assigned to AG-001');
});

await test('only a legal admin assigns the attorney', async () => {
  await mustNotWrite('requester',
    `insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
     values ('AG-001','${ATTY}','${BUYER}')`);
  const assignment = await mustWrite('legal_admin',
    `insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
     values ('AG-001','${ATTY}','impostor@clausewerk')
     returning agreement_id, assigned_by`, [], 'legal@clausewerk');
  eq(assignment[0].assigned_by, 'legal@clausewerk',
    'the caller-supplied assigner entered the permanent attorney record');
});

await test('attorney reassignment is an audited removal and addition', async () => {
  await throws(() => queryAs('legal_admin', `
    update cw.agreement_attorney
       set attorney='somebody-else@clausewerk',
           assigned_by='forged-assigner@clausewerk'
     where agreement_id='AG-001'`, [], 'legal@clausewerk'),
    'cannot be updated in place');
  await queryAs('legal_admin',
    `delete from cw.agreement_attorney where agreement_id='AG-001'`,
    [], 'legal@clausewerk');
  const replacement = await queryAs('legal_admin', `
    insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
    values ('AG-001','${ATTY}','forged-assigner@clausewerk')
    returning assigned_by`, [], 'legal@clausewerk');
  eq(replacement[0].assigned_by, 'legal@clausewerk');
  const events = await rows(`
    select event_type from cw.audit_event
     where subject='AG-001'
       and event_type in ('attorney_assigned','attorney_removed')
     order by seq desc limit 2`);
  eq(events.map(e => e.event_type), ['attorney_assigned','attorney_removed'],
     'reassignment must leave both halves in the audit chain');
});

await test('with an attorney assigned, the missing approvals are named', async () => {
  const m = await queryAs('legal_reviewer',
    `select approver_kind, approver from cw.concession_missing_approvers($1)
     order by approver_kind`, [C1]);
  eq(m.length, 2);
  eq(m[0].approver_kind, 'attorney'); eq(m[0].approver, ATTY);
  eq(m[1].approver_kind, 'requester'); eq(m[1].approver, BUYER);
});

await test('a requester cannot enumerate another deal’s missing approvers', async () => {
  const own = await queryAs('requester',
    `select approver_kind, approver from cw.concession_missing_approvers($1)`,
    [C1], BUYER);
  eq(own.length, 2, 'the deal owner lost their missing-approver view');
  const hidden = await queryAs('requester',
    `select approver_kind, approver from cw.concession_missing_approvers($1)`,
    [C1], 'somebody.else@clausewerk');
  eq(hidden, [], 'the definer disclosed governance identities across deals');
});

await test('settling is refused while anybody is still missing', async () => {
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values ($1,'legal@clausewerk')`, [C1]),
    'still waiting on',
    'this is the whole point: the concession is refused until they have approved');
});

await test('an approval must name the person the record names', async () => {
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values ($1,'attorney','someone.else@clausewerk')`, [C1]),
    'the assigned attorney on AG-001 is',
    'otherwise the model is decorative — anyone could type a name and the count '
    + 'would come out right');
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values ($1,'requester','not.the.buyer@clausewerk')`, [C1]),
    'an approval must name the person the record names');
});

await test('the Requester and the attorney approve, each by name', async () => {
  await mustWrite('requester',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${C1},'requester','${BUYER}') returning approval_id`, [], BUYER);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${C1},'attorney','${ATTY}') returning approval_id`);
  const m = await queryAs('legal_reviewer',
    `select * from cw.concession_missing_approvers($1)`, [C1]);
  eq(m.length, 0, 'nobody outstanding');
});

await test('with everyone in, the concession comes into force', async () => {
  await mustWrite('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values (${C1},'impostor@clausewerk') returning concession_id`,
    [], 'legal@clausewerk');
  const s = await oneAs('legal_reviewer', `select state, settled_by from cw.concession_state
                       where concession_id=$1`, [C1]);
  eq(s.state, 'approved');
  eq(s.settled_by, 'legal@clausewerk',
    'the caller-supplied settler entered the permanent settlement record');
  const f = await oneAs('legal_reviewer', `select count(*)::int n from cw.concession_in_force
                       where concession_id=$1`, [C1]);
  eq(f.n, 1, 'and only now does anything read it as agreed');
});

await test('the number of approvals is frozen onto the settlement', async () => {
  const s = await one(`select approvals_at_settlement from cw.concession_settlement
                       where concession_id=$1`, [C1]);
  eq(s.approvals_at_settlement, 2, 'what it took at the time, not what it takes today');
});

console.log('\nrequired approvers are configuration, not a fixed list (WP-18a)');

let C2, C3;
await test('with no Required Approver configured, two approvals are enough', async () => {
  await mustWrite('legal_admin',
    `insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
     values ('AG-002','${ATTY}','legal@clausewerk') returning agreement_id`);
  C2 = await concede('AG-002', 1);
  await mustWrite('requester',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${C2},'requester','${BUYER}') returning approval_id`, [], BUYER);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${C2},'attorney','${ATTY}') returning approval_id`);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values (${C2},'legal@clausewerk') returning concession_id`);
  const s = await oneAs('legal_reviewer', `select state from cw.concession_state where concession_id=$1`, [C2]);
  eq(s.state, 'approved', 'the baseline for the comparison below');
});

await test('adding a Required Approver changes the outcome', async () => {
  // The proof that this is genuinely configurable rather than a hard-coded pair
  // of names: the same two approvals, on the same deal, now settle nothing.
  const required = await mustWrite('legal_admin',
    `insert into cw.required_approver (agreement_id,body,label,approver,added_by)
     values ('AG-002','privacy','Data Protection Officer','dpo@clausewerk',
             'impostor@clausewerk')
     returning required_approver_id, added_by`, [], 'legal@clausewerk');
  eq(required[0].added_by, 'legal@clausewerk',
    'the caller-supplied adder entered the permanent approver record');
  C3 = await concede('AG-002', 1);
  await mustWrite('requester',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${C3},'requester','${BUYER}') returning approval_id`, [], BUYER);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${C3},'attorney','${ATTY}') returning approval_id`);
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values ($1,'legal@clausewerk')`, [C3]),
    'required dpo@clausewerk',
    'the Data Protection Officer was configured a moment ago and now blocks it');
});

await test('a requester cannot settle round the Required Approver on their own deal', async () => {
  // The fail-open shape this guards against: a caller who cannot SEE the
  // required-approver configuration must not therefore be told nobody is
  // missing. The check runs with definer rights precisely so the answer does
  // not depend on the asker.
  await throws(() => queryAs('requester',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values ($1,'${BUYER}')`, [C3], BUYER),
    'required dpo@clausewerk');
});

await test('once the Required Approver signs, it settles', async () => {
  const ra = await one(`select required_approver_id from cw.required_approver
                        where agreement_id='AG-002'`);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_approval
       (concession_id,approver_kind,required_approver_id,approver)
     values (${C3},'required',${ra.required_approver_id},'dpo@clausewerk')
     returning approval_id`);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values (${C3},'legal@clausewerk') returning concession_id`);
  const s = await oneAs('legal_reviewer', `select state from cw.concession_state where concession_id=$1`, [C3]);
  eq(s.state, 'approved');
});

await test('a required approval must name the configured person', async () => {
  const ra = await one(`select required_approver_id from cw.required_approver
                        where agreement_id='AG-002'`);
  const C = await concede('AG-002', 1);
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_approval
       (concession_id,approver_kind,required_approver_id,approver)
     values ($1,'required',$2,'someone.helpful@clausewerk')`,
    [C, ra.required_approver_id]),
    'is dpo@clausewerk, not');
});

console.log('\na machine may propose; a machine may never settle (WP-18a)');

let CM;
await test('a machine-proposed concession cannot settle without a human approval', async () => {
  await mustWrite('legal_admin',
    `insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
     values ('AG-003','${ATTY}','legal@clausewerk') returning agreement_id`);
  CM = await concede('AG-003', 1, BUYER, 'machine');
  const c = await one(`select proposer_kind from cw.concession where concession_id=$1`, [CM]);
  eq(c.proposer_kind, 'machine', 'the matcher proposed this one, and says so');
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values ($1,'the matcher')`, [CM]),
    'A machine may propose; only named people settle',
    'CLA §3 and §7 say the schema must agree with this, and now it does');
});

await test('who proposed a concession cannot be rewritten afterwards', async () => {
  // Run as the OWNER on purpose: this is a trigger's own words, and it fires
  // for everyone. A role-run version would be stopped by the column grant first
  // and the rule itself would go unproven.
  await throws(() => db.exec(
    `update cw.concession set proposer_kind='human' where concession_id=${CM}`),
    'who proposed it cannot be rewritten');
});

await test('the same machine proposal settles once humans have signed it', async () => {
  await mustWrite('requester',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${CM},'requester','${BUYER}') returning approval_id`, [], BUYER);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_approval (concession_id,approver_kind,approver)
     values (${CM},'attorney','${ATTY}') returning approval_id`);
  await mustWrite('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values (${CM},'legal@clausewerk') returning concession_id`);
  const s = await oneAs('legal_reviewer', `select state, proposer_kind from cw.concession_state
                       where concession_id=$1`, [CM]);
  eq(s.state, 'approved');
  eq(s.proposer_kind, 'machine',
    'proposed by a machine, settled by people — and the record says both');
});

console.log('\napprovals and settlements are evidence');

await test('an approval cannot be edited or deleted', async () => {
  await throws(() => db.exec(
    `update cw.concession_approval set approver='someone else' where concession_id=${C1}`),
    'it cannot be rewritten once recorded');
  await throws(() => db.exec(
    `delete from cw.concession_approval where concession_id=${C1}`),
    'it cannot be deleted once recorded');
});

await test('a settlement cannot be edited or deleted', async () => {
  await throws(() => db.exec(
    `update cw.concession_settlement set settled_by='nobody' where concession_id=${C1}`),
    'a settlement cannot be rewritten');
  await throws(() => db.exec(
    `delete from cw.concession_settlement where concession_id=${C1}`),
    'a settlement cannot be deleted');
});

await test('a concession in force cannot be withdrawn', async () => {
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_withdrawal (concession_id,withdrawn_by,reason)
     values ($1,'legal@clausewerk','changed our mind')`, [C1]),
    'already in force');
});

await test('a proposal that never settled can be withdrawn, and then cannot settle', async () => {
  const C = await concede('AG-001', 1);
  const withdrawn = await mustWrite('requester',
    `insert into cw.concession_withdrawal (concession_id,withdrawn_by,reason)
     values (${C},'impostor@clausewerk','vendor accepted our position after all')
     returning concession_id, withdrawn_by`, [], BUYER);
  eq(withdrawn[0].withdrawn_by, BUYER,
    'the caller-supplied withdrawer entered the permanent withdrawal record');
  const s = await oneAs('legal_reviewer', `select state from cw.concession_state where concession_id=$1`, [C]);
  eq(s.state, 'withdrawn');
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.concession_settlement (concession_id,settled_by)
     values ($1,'legal@clausewerk')`, [C]), 'was withdrawn');
});

await test('every approval and every settlement is in the audit trail', async () => {
  const a = await rows(`select subject, payload from cw.audit_event
                        where event_type='concession_approved' order by seq`);
  assert(a.some(x => x.subject === String(C1) && x.payload.approver === ATTY));
  const s = await one(`select payload from cw.audit_event
                       where event_type='concession_settled' and subject=$1`, [String(C1)]);
  eq(s.payload.approvals, 2);
  eq(s.payload.settled_by, 'legal@clausewerk',
    'the caller-supplied settler entered the audit chain');
  const w = await one(`select payload from cw.audit_event
                       where event_type='concession_withdrawn'`);
  eq(w.payload.withdrawn_by, BUYER,
    'the caller-supplied withdrawer entered the audit chain');
  const r = await one(`select payload from cw.audit_event
                       where event_type='required_approver_added'`);
  eq(r.payload.approver, 'dpo@clausewerk');
});

await test('a viewer cannot see who had to be persuaded', async () => {
  // Concession analytics are an aggregate of exactly what we give away under
  // pressure (CLA §7). Who had to sign off is part of that.
  await throws(() => queryAs('viewer', `select * from cw.concession_approval`),
    'permission denied');
});

// ════════════════════════════════════════════════════════════════════════════
// WP-18b · LEGAL HOLD
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe clock stops when a dispute starts (WP-18b)');

await test('retention is due, and destruction would proceed', async () => {
  await mustWrite('legal_admin',
    `insert into cw.agreement_retention (agreement_id,retention_until)
     values ('AG-001','2020-01-01'), ('AG-002','2020-01-01'), ('AG-003','2099-01-01')
     returning agreement_id`);
  const d = await rows(`select agreement_id, under_hold from cw.retention_due order by 1`);
  eq(d.length, 2, 'AG-003 is not due for another seventy years');
  eq(d[0].under_hold, false);
});

await test('a legal hold names its matter', async () => {
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.legal_hold (agreement_id,matter_ref,opened_by)
     values ('AG-001','   ','legal@clausewerk')`), 'matter_ref',
    'a hold with no matter is not a hold, it is an indefinite delay nobody owns');
});

await test('opening a hold is a named, audited act', async () => {
  await mustWrite('legal_reviewer',
    `insert into cw.legal_hold (agreement_id,matter_ref,opened_by)
     values ('AG-001','Northwind v. Us, 2026-CV-4417','impostor@clausewerk')
     returning hold_id`, [], 'legal@clausewerk');
  const e = await one(`select payload from cw.audit_event
                       where event_type='legal_hold_opened' and subject='AG-001'`);
  eq(e.payload.matter_ref, 'Northwind v. Us, 2026-CV-4417');
  eq(e.payload.opened_by, 'legal@clausewerk',
    'the caller-supplied name entered the permanent audit record');
  const u = await one(`select cw.agreement_under_hold('AG-001') as held`);
  eq(u.held, true);
});

await test('a requester cannot probe another deal’s legal-hold status', async () => {
  const own = await queryAs('requester',
    `select cw.agreement_under_hold('AG-001') as held`, [], BUYER);
  eq(own[0].held, true, 'the deal owner lost visibility of their legal hold');
  const hidden = await queryAs('requester',
    `select cw.agreement_under_hold('AG-001') as held`, [],
    'somebody.else@clausewerk');
  eq(hidden[0].held, false,
    'the definer disclosed litigation status across deals');
});

await test('a record under legal hold cannot be destroyed by the retention path', async () => {
  // The guarantee. Past its retention date, otherwise destructible, and the
  // destruction is refused with the matter named.
  await throws(() => queryAs('administrator',
    `select cw.retention_destroy('AG-001','records@clausewerk')`, [],
    'records@clausewerk'),
    'under legal hold (Northwind v. Us, 2026-CV-4417)');
  const r = await one(`select destroyed_on from cw.agreement_retention
                       where agreement_id='AG-001'`);
  eq(r.destroyed_on, null, 'and nothing was destroyed');
});

await test('a second matter holds the same agreement independently', async () => {
  await mustWrite('legal_reviewer',
    `insert into cw.legal_hold (agreement_id,matter_ref,opened_by)
     values ('AG-001','ICO investigation 2026/0912','privacy@clausewerk')
     returning hold_id`);
  const h = await one(`select matters from cw.retention_due where agreement_id='AG-001'`);
  assert(h.matters.includes('ICO investigation'));
  assert(h.matters.includes('Northwind v. Us'));
});

await test('a legal hold cannot be deleted', async () => {
  // Settled decision S0-3: this raises rather than quietly doing nothing.
  await throws(() => db.exec(`delete from cw.legal_hold where agreement_id='AG-001'`),
    'a legal hold cannot be deleted');
});

await test('a hold cannot be rewritten to point at a different matter', async () => {
  await throws(() => db.exec(
    `update cw.legal_hold set matter_ref='something smaller' where agreement_id='AG-001'`),
    'a legal hold cannot be rewritten');
});

await test('only a legal admin releases a hold', async () => {
  await mustNotWrite('legal_reviewer',
    `update cw.legal_hold set released_by='reviewer@clausewerk',
      released_on=current_date where agreement_id='AG-001'`, [], { allowSilent: false });
});

await test('releasing a hold is an audited act', async () => {
  await mustWrite('legal_admin',
    `update cw.legal_hold set released_by='impostor@clausewerk', released_on=current_date
     where agreement_id='AG-001' and matter_ref like 'Northwind%'
     returning hold_id`, [], 'legal@clausewerk');
  const e = await one(`select payload from cw.audit_event
                       where event_type='legal_hold_released'`);
  eq(e.payload.released_by, 'legal@clausewerk');
  assert(e.payload.matter_ref.startsWith('Northwind'),
    'which matter stopped holding it is the useful half');
});

await test('retention destruction cannot be attributed to another person', async () => {
  await throws(() => queryAs('administrator',
    `select cw.retention_destroy('AG-001','records@clausewerk')`, [],
    'impostor@clausewerk'),
    'retention actor must match the signed-in person',
    'an administrator-role session destroyed a record under another name');
  const state = await one(
    `select destroyed_on from cw.agreement_retention where agreement_id='AG-001'`);
  eq(state.destroyed_on, null, 'the impersonation refusal changed the record');
});

await test('one release is not enough while another matter is still open', async () => {
  await throws(() => queryAs('administrator',
    `select cw.retention_destroy('AG-001','records@clausewerk')`, [],
    'records@clausewerk'),
    'ICO investigation 2026/0912',
    'all holds must be released before an agreement is destructible');
});

await test('a released hold cannot be reopened', async () => {
  await throws(() => db.exec(
    `update cw.legal_hold set released_by=null, released_on=null
     where agreement_id='AG-001' and matter_ref like 'Northwind%'`),
    'cannot be reopened');
});

await test('with every hold released, destruction proceeds and is audited', async () => {
  await mustWrite('legal_admin',
    `update cw.legal_hold set released_by='legal@clausewerk', released_on=current_date
     where agreement_id='AG-001' and released_on is null returning hold_id`);
  await queryAs('administrator',
    `select cw.retention_destroy('AG-001','records@clausewerk')`, [],
    'records@clausewerk');
  const r = await one(`select destroyed_on, destroyed_by from cw.agreement_retention
                       where agreement_id='AG-001'`);
  assert(r.destroyed_on !== null, 'the clock resumes from where it was, and runs out');
  eq(r.destroyed_by, 'records@clausewerk');
  const e = await one(`select payload from cw.audit_event
                       where event_type='retention_destroyed' and subject='AG-001'`);
  eq(e.payload.destroyed_by, 'records@clausewerk');
});

await test('destruction before the retention date is refused', async () => {
  await throws(() => queryAs('administrator',
    `select cw.retention_destroy('AG-003','records@clausewerk')`, [],
    'records@clausewerk'),
    'it is not due');
});

await test('nothing is destroyed twice', async () => {
  await throws(() => queryAs('administrator',
    `select cw.retention_destroy('AG-001','records@clausewerk')`, [],
    'records@clausewerk'),
    'was already destroyed');
});

await test('a requester cannot open or release a hold', async () => {
  await mustNotWrite('requester',
    `insert into cw.legal_hold (agreement_id,matter_ref,opened_by)
     values ('AG-002','convenient matter','${BUYER}')`);
});

await test('a requester cannot run the retention path at all', async () => {
  await throws(() => queryAs('requester',
    `select cw.retention_destroy('AG-002','${BUYER}')`, [], BUYER),
    'permission denied');
});

await test('nor can a legal admin any more — U9 moved it, it did not share it', async () => {
  // The destruction tests above now run as the administrator. Rewiring them
  // without this one would have QUIETLY DROPPED the boundary they were partly
  // there to prove: they would still pass if BOTH roles could destroy, which is
  // exactly what U9 refused.
  //
  // The move matters more than the grant. Two roles holding an irreversible act
  // means neither is accountable for it — the same reasoning as U7's checkpoint
  // move, where legal_admin's right was revoked rather than left unused.
  await throws(() => queryAs('legal_admin',
    `select cw.retention_destroy('AG-002','records@clausewerk')`),
    'permission denied',
    'legal_admin still holds destruction, so U9 shared the authority instead of '
    + 'moving it');
});

await test('nothing in the schema destroys anything by itself', async () => {
  // OWNER DECISION U9, FIRST HALF: "auto-record-destruction should never
  // happen". It never did — there is no scheduler, job or trigger here — but
  // that was a fact about the code rather than a rule, and a fact nobody
  // asserts is a fact somebody can undo without noticing.
  //
  // Asked of the catalogue rather than by reading: every trigger function body
  // and every column default in the schema, checked for a call to the destroy
  // function. A timer would have to become one of those to fire at all.
  const callers = await rows(`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cw'
      and p.oid in (select tgfoid from pg_trigger where not tgisinternal)
      and p.prosrc like '%retention_destroy%'`);
  eq(callers, [],
    'a trigger calls cw.retention_destroy(), so destruction can happen without '
    + 'anybody asking for it');

  const defaults = await rows(`
    select a.attname, c.relname
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where n.nspname = 'cw'
      and pg_get_expr(d.adbin, d.adrelid) like '%retention_destroy%'`);
  eq(defaults, [], 'a column default calls cw.retention_destroy()');
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
