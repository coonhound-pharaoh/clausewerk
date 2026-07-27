// The Administrator — migration 0013 part 1 (WP-U01).
//
// Three guarantees, and they are the reason this suite exists:
//
//   1. The role reads content and CHANGES NONE OF IT. Owner decision U5 opened
//      the read half deliberately; the write half is the boundary, and it is
//      proved here table by table rather than sampled.
//   2. The system knows its people by name. cw.account is the administrator's
//      to keep and nobody else's — not even legal_admin, because keeping the
//      list of people is machine stewardship, not contract judgement.
//   3. The bootstrap ceremony runs exactly once and is not a standing backdoor.
//
// On the shape of guarantee 1. "Every content table refused, the full list, not
// a sample" is not achievable with a hand-written list of table names: the list
// goes stale the first time a migration adds a table, and it goes stale
// silently, which is the worst way. So the write sweep below reads the actual
// tables out of the catalogue and asserts against an explicit allowlist of the
// few the administrator is SUPPOSED to write. A content table added by any
// future migration is covered the moment it exists, and if somebody grants the
// administrator a write on it, this suite fails and names the table.
//
// The privilege sweep is paired with real writes on the write path, because a
// privilege check alone would not notice a policy that lets an UPDATE through to
// affect zero rows — finding D1's shape. Both layers, both directions.
//
//   node db/test/administrator.test.mjs

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
const { queryAs, execAs, mustWrite, mustNotWrite, ROLE_TO_DB_ROLE } = roleHelpers(db);

const ADMIN  = 'a.okafor@clausewerk';
const LEGAL  = 'r.vance@clausewerk';
const BUYER  = 'buyer@clausewerk';

// ── The role accessor ──────────────────────────────────────────────────────
console.log('\nthe role accessor learns a sixth answer, and forgets nothing');

await test('cw.app_role() answers administrator for a cw_administrator connection', async () => {
  const r = await queryAs('administrator', `select cw.app_role() as role`);
  eq(r[0].role, 'administrator');
});

await test('all five existing roles still answer exactly as before', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin','auditor']) {
    const r = await queryAs(role, `select cw.app_role() as role`);
    eq(r[0].role, role, `${role} stopped answering correctly when the sixth was added`);
  }
});

await test('the owner still maps to no application role — settled decision U3 untouched', async () => {
  const r = await one(`select cw.app_role() as role`);
  eq(r.role, null, 'the owner acquired an application role, which U3 forbids');
});

await test('every one of the six roles exists as a real nologin database role', async () => {
  for (const dbRole of Object.values(ROLE_TO_DB_ROLE)) {
    const r = await one(
      `select rolcanlogin from pg_roles where rolname = $1`, [dbRole]);
    assert(r, `${dbRole} does not exist as a database role`);
    eq(r.rolcanlogin, false, `${dbRole} can log in directly, which none of them should`);
  }
});

// ── Content: seed something real to read and to fail to write ──────────────
// Seeded as the owner. These are the rows the administrator will read
// successfully and fail to change.
await db.exec(`
  select set_config('cw.actor','${LEGAL}',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-H-014','data','High'), ('DP-H-052','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'24h','Notify within 24 hours.','2025-01-01','2030-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-900','Northwind','${BUYER}');
  insert into cw.ladder (ladder_id,category_key,severity,owner) values (9,'data','High','R. Vance');
  insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
    (9,0,'DP-H-014',1,false), (9,1,'DP-H-052',1,true);`);

// ── Guarantee 1a · the read half, asserted positively ─────────────────────
// Decision U5 is a real grant, so it is proved present rather than assumed.
// If a later change reverted the role to content-blind, these fail and say so.
console.log('\ndecision U5: contract content is READABLE by the administrator');

for (const [label, sql] of [
  ['the deals themselves',        `select agreement_id from cw.agreement`],
  ['clause text',                 `select body from cw.clause_version`],
  ['the fallback ladders',        `select rung from cw.ladder_rung`],
  ['the audit record',            `select event_type from cw.audit_event`],
]) {
  await test(`administrator can read ${label}`, async () => {
    const r = await queryAs('administrator', sql, [], ADMIN);
    assert(r.length > 0,
      `administrator read ${label} but got nothing back — a grant without a ` +
      `matching read policy looks exactly like this, and would make U5 a ` +
      `dead letter`);
  });
}

await test('the read really is content, not a redacted shadow of it', async () => {
  // Guards a plausible wrong turn: satisfying U5 with a view that returns
  // identifiers and nulls out the words. The owner asked for readable content.
  const r = await queryAs('administrator',
    `select body from cw.clause_version where clause_id='DP-H-014' and version=1`,
    [], ADMIN);
  eq(r[0].body, 'Notify within 24 hours.');
});

// ── Guarantee 1b · the write half, over every table in the schema ─────────
// The allowlist. Everything else in schema cw must be unwritable by the
// administrator, and this is the entire justification for each exception.
// Adding an entry here is meant to be a deliberate act with a reason attached.
// It has already done its job once: WP-U02's cw.role_grant failed this sweep on
// its first run, which is the sweep noticing a new writable table rather than
// assuming it was fine.
const ADMIN_MAY_WRITE = {
  // The administrator's own record of people. Its whole point.
  'account':     ['INSERT','UPDATE'],
  // Appending to the audit log, like every other acting role. Never update or
  // delete: nobody edits history, and that has never had an exception.
  'audit_event': ['INSERT'],
  // Granting and revoking roles. INSERT only — cw.role_grant is append-only for
  // everybody including the owner, so a countersign is a new row naming the
  // grant rather than an update filling in a column. See 0013 part 2.
  'role_grant':  ['INSERT'],
  // The settings registry. UPDATE only, and only the OPERATIONAL rows — that
  // narrowing is a policy and a trigger, not a privilege, so it cannot be
  // expressed here. The both-ways refusal is proved in settings-split.test.mjs;
  // what this entry records is that the administrator may write this table at
  // all. No insert: the four operational rows are seeded by the migration, and
  // a fifth is a proposal with a reason, not a row somebody adds at runtime.
  'governance_setting': ['UPDATE'],
  // The watcher lists. Insert to add somebody, update to record their removal —
  // a watcher is removed, never deleted, because being taken off a notification
  // list is exactly the change that has to stay on the record.
  'override_watcher':   ['INSERT','UPDATE'],
  // The record of integrity checks that actually ran. INSERT only, append-only
  // for everybody: a check that found something cannot be un-found, and
  // re-running it is a new row. See 0013 part 4.
  'integrity_check':    ['INSERT'],
  // Who the Administrator has authorised to REDACT records — remove content and
  // keep the fact (owner decision U12, 0023). Insert to delegate, update to
  // revoke; never delete, because that somebody held this authority for that
  // period does not stop being true.
  //
  // THE SWEEP CAUGHT THIS ON ITS FIRST RUN, which is the second time it has
  // earned itself: a new writable table appeared and it refused to pass until
  // somebody wrote down why. Note what the entry does NOT license — delegation
  // is the authority to redact, and purging stays the Administrator's own act
  // with nothing to hand out.
  'records_delegate':   ['INSERT','UPDATE'],
};

console.log('\ndecision U5: contract content is WRITABLE by the administrator NOWHERE');

const allTables = (await rows(
  `select table_name from information_schema.tables
   where table_schema='cw' and table_type='BASE TABLE' order by table_name`))
  .map(r => r.table_name);

await test('the sweep below actually found the schema (guards a vacuous pass)', async () => {
  assert(allTables.length >= 40,
    `only ${allTables.length} tables found in schema cw; a sweep over an empty ` +
    `list would pass while proving nothing`);
});

await test('no table in schema cw grants the administrator insert, update or delete '
         + 'except the two it is supposed to', async () => {
  const wrong = [];
  for (const t of allTables) {
    const allowed = ADMIN_MAY_WRITE[t] || [];
    for (const priv of ['INSERT','UPDATE','DELETE']) {
      const held = (await one(
        `select has_table_privilege('cw_administrator', $1, $2) as held`,
        [`cw.${t}`, priv])).held;
      if (held && !allowed.includes(priv)) wrong.push(`cw.${t} ${priv}`);
      if (!held && allowed.includes(priv)) wrong.push(`cw.${t} ${priv} MISSING`);
    }
  }
  eq(wrong, [], 'the administrator holds write privileges it must not hold '
    + '(or lacks one it needs)');
});

await test('the administrator holds select on the content tables — the U5 grant, swept', async () => {
  // The counterpart sweep. Not every table needs to be readable, but the
  // content ones do, and a missing grant here is U5 quietly reverted.
  const missing = [];
  for (const t of ['agreement','clause','clause_version','concession','run',
                   'run_finding','review_ticket','negotiation',
                   'negotiation_position','executed_agreement','sow_override',
                   'legal_hold','agreement_retention']) {
    const held = (await one(
      `select has_table_privilege('cw_administrator', $1, 'SELECT') as held`,
      [`cw.${t}`])).held;
    if (!held) missing.push(`cw.${t}`);
  }
  eq(missing, [], 'content tables the administrator cannot read, contrary to U5');
});

// Real writes, on the write path, against seeded rows. The privilege sweep
// above proves the grant layer; this proves it is not being quietly bypassed
// and — the D1 shape — that a refused UPDATE raises rather than affecting zero
// rows and reporting success.
console.log('\nand the same, performed as a real cw_administrator connection');

for (const [label, sql] of [
  ['insert a clause',             `insert into cw.clause (clause_id,category_key,severity) values ('DP-H-999','data','High')`],
  ['edit clause text',            `update cw.clause_version set body='Notify within 1 hour.' where clause_id='DP-H-014'`],
  ['delete a clause version',     `delete from cw.clause_version where clause_id='DP-H-014'`],
  ['create a deal',               `insert into cw.agreement (agreement_id,counterparty,requester) values ('AG-901','Contoso','${ADMIN}')`],
  ['change a deal',               `update cw.agreement set counterparty='Acme' where agreement_id='AG-900'`],
  ['move a ladder rung',          `update cw.ladder_rung set is_floor=true where ladder_id=9 and rung=0`],
  ['open a review ticket',        `insert into cw.review_ticket (agreement_id,clause_id,version,opened_by) values ('AG-900','DP-H-014',1,'${ADMIN}')`],
  ['record a concession',         `insert into cw.concession (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by) values ('AG-900','data','DP-H-014',1,1,'because','${ADMIN}')`],
  ['open a legal hold',           `insert into cw.legal_hold (agreement_id,matter,opened_by) values ('AG-900','M-1','${ADMIN}')`],
  ['change an owner decision',    `update cw.governance_setting set value='true' where key='sow_may_contradict_master'`],
  ['edit the audit record',       `update cw.audit_event set event_type='nothing_happened' where seq=1`],
  ['erase the audit record',      `delete from cw.audit_event where seq=1`],
]) {
  await test(`administrator cannot ${label}`, async () => {
    // allowSilent is NOT passed. A statement that completes affecting zero rows
    // is reported as a failure by mustNotWrite, which is finding D1's shape.
    await mustNotWrite('administrator', sql);
  });
}

await test('administrator CAN take a checkpoint — decision U7 moved the duty here', async () => {
  // This assertion is inverted from what WP-U01 shipped, deliberately and with
  // the reason recorded. In part 1 the administrator held no checkpoint right
  // and this test asserted the refusal; part 4 moved the duty per decision U7,
  // so the refusal became the wrong expectation. The move's other half — that
  // legal_admin is now refused where it previously succeeded — is proved in
  // health.test.mjs, which is where the whole of U7 lives.
  const r = await queryAs('administrator', `select cw.audit_checkpoint_take() as id`,
    [], ADMIN);
  assert(r[0].id > 0, 'the administrator cannot discharge the duty it was given');
});

await test('destruction is the administrator\'s, and legal admin\'s is revoked', async () => {
  // INVERTED BY OWNER DECISION U9, 2026-07-27, and the inversion is the point.
  // This used to assert the opposite — "destruction stays legal admin's" — and
  // it was right until the owner moved the authority. Records custody now sits
  // with the role that keeps the machine.
  //
  // The MOVE is what is tested, not just the grant. U9 revokes legal_admin's
  // rather than leaving both holding it, on the same reasoning as U7's
  // checkpoint move: two roles holding an irreversible act means neither is
  // accountable for it. So both halves are asserted here.
  //
  // Neither call gets far — AG-900 has no retention record — and that is
  // deliberate. What separates the two roles is WHICH refusal each receives: a
  // privilege refusal means the door is shut, and a "nothing to destroy" means
  // the door opened and there was nothing behind it.
  await throws(() => queryAs('legal_admin',
    `select cw.retention_destroy('AG-900','${LEGAL}')`, [], LEGAL),
    'permission denied',
    'legal_admin still holds destruction, so U9 moved nothing');

  await throws(() => queryAs('administrator',
    `select cw.retention_destroy('AG-900','${ADMIN}')`, [], ADMIN),
    'nothing to destroy',
    'the administrator was refused by PRIVILEGE, so it did not receive the '
    + 'authority U9 gave it');
});

await test('an administrator creates an account, and it lands on the chain', async () => {
  await mustWrite('administrator',
    `insert into cw.account (person,display_name,unit,role,created_by)
     values ('${BUYER}','Dana Buyer','Procurement','requester','${ADMIN}')
     returning person`, [], ADMIN);
  const a = await one(`select actor, actor_role, actor_kind, event_type, subject,
                              payload->>'role' as role
                       from cw.audit_event where event_type='account_created'`);
  eq(a.subject, BUYER);
  eq(a.role, 'requester');
  eq(a.actor, ADMIN, 'the act is attributed to the administrator who performed it');
  eq(a.actor_role, 'administrator',
    'and to the authority they held — 0007 binds this to the real connection role');
  eq(a.actor_kind, 'human');
});

await test('nobody else creates an account — not even legal admin', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin','auditor']) {
    await mustNotWrite(role,
      `insert into cw.account (person,display_name,role,created_by)
       values ('sneak.${role}@clausewerk','Sneak','legal_admin','${role}')`);
  }
});

await test('everyone who is anybody can see who holds what — access is not a secret', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin','auditor','administrator']) {
    const r = await queryAs(role, `select person, role from cw.account order by person`);
    assert(r.length > 0, `${role} cannot read the accounts list`);
  }
});

await test('one person, one role — a second row for the same person is refused', async () => {
  await throws(() => db.exec(
    `insert into cw.account (person,display_name,role,created_by)
     values ('${BUYER}','Dana Buyer','legal_reviewer','${ADMIN}')`),
    'duplicate key',
    'a person held two roles at once, which the countersign rule exists to prevent');
});

await test('an account is not deleted, by anyone, ever', async () => {
  // Both layers. No delete grant for any role, and a trigger that refuses even
  // for the owner, who bypasses row-level security.
  await mustNotWrite('administrator', `delete from cw.account where person='${BUYER}'`);
  await throws(() => db.exec(`delete from cw.account where person='${BUYER}'`),
    'accounts are revoked, never deleted');
});

await test('the identity and provenance of an account cannot be rewritten', async () => {
  await throws(() => db.exec(
    `update cw.account set person='someone.else@clausewerk' where person='${BUYER}'`),
    'is its identity and cannot be changed');
  await throws(() => db.exec(
    `update cw.account set created_by='nobody' where person='${BUYER}'`),
    'settled facts');
});

await test('moving somebody to a different role is recorded', async () => {
  await mustWrite('administrator',
    `update cw.account set role='viewer' where person='${BUYER}' returning person`,
    [], ADMIN);
  const a = await one(`select subject, payload->>'from' as f, payload->>'to' as t
                       from cw.audit_event where event_type='account_role_moved'`);
  eq([a.subject, a.f, a.t], [BUYER, 'requester', 'viewer']);
  // Put it back for the suites below.
  await execAs('administrator',
    `update cw.account set role='requester' where person='${BUYER}'`, ADMIN);
});

await test('revoking an account is recorded, and it cannot be un-revoked', async () => {
  await mustWrite('administrator',
    `update cw.account set state='revoked', revoked_by='${ADMIN}', revoked_at=now()
     where person='${BUYER}' returning person`, [], ADMIN);
  const a = await one(`select subject from cw.audit_event where event_type='account_revoked'`);
  eq(a.subject, BUYER);
  await throws(() => db.exec(
    `update cw.account set state='active', revoked_by=null, revoked_at=null
     where person='${BUYER}'`),
    'not un-revoked',
    'un-revoking would erase a revocation from the record');
});

await test('a revoked account must name who revoked it and when', async () => {
  await execAs('administrator',
    `insert into cw.account (person,display_name,role,created_by)
     values ('temp@clausewerk','Temp','viewer','${ADMIN}')`, ADMIN);
  await throws(() => db.exec(
    `update cw.account set state='revoked' where person='temp@clausewerk'`),
    'revoked_names_a_person_and_a_time');
});

await test('a blank person is not a person', async () => {
  await throws(() => db.exec(
    `insert into cw.account (person,display_name,role,created_by)
     values ('   ','Nobody','viewer','${ADMIN}')`),
    'a_person_is_not_blank');
});

// ── Guarantee 3 · the bootstrap ceremony ──────────────────────────────────
// A separate database, because the ceremony's precondition is an empty accounts
// table and the tests above have filled it. That is the point of the
// precondition, and the shape of this test is the evidence for it.
console.log('\nthe bootstrap ceremony runs once and is not a standing backdoor');

const fresh = async () => {
  const d = await PGlite.create();
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
    await d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  return d;
};
const CEREMONY = `select cw.bootstrap('owner@clausewerk',
  '${ADMIN}','Ada Okafor','${LEGAL}','Rae Vance','Head Office')`;

await test('on an empty system the owner creates the first two accounts', async () => {
  const d = await fresh();
  await d.exec(CEREMONY);
  const a = (await d.query(
    `select person, role, is_bootstrap from cw.account order by role`)).rows;
  eq(a.length, 2);
  eq(a.map(r => r.role), ['administrator','legal_admin']);
  assert(a.every(r => r.is_bootstrap), 'the accounts are not marked as bootstrap');
  await d.close();
});

await test('both acts are on the chain, marked bootstrap, and not claimed as human', async () => {
  const d = await fresh();
  await d.exec(CEREMONY);
  const e = (await d.query(
    `select event_type, actor, actor_role, actor_kind, payload->>'bootstrap' as boot
     from cw.audit_event order by seq`)).rows;
  const created = e.filter(r => r.event_type === 'account_created');
  eq(created.length, 2);
  for (const r of created) {
    eq(r.actor, 'owner@clausewerk', 'the ceremony records who performed it');
    eq(r.actor_kind, 'system',
      'a bootstrap act was recorded as a human act by a role nobody held');
    eq(r.actor_role, null,
      'there is no application role on the connection at bootstrap — U3');
    eq(r.boot, 'true', 'the bootstrap marking is not on the audit row');
  }
  assert(e.some(r => r.event_type === 'bootstrap_performed'),
    'the ceremony itself is not recorded');
  await d.close();
});

await test('it refuses to run a second time — the accounts table is the precondition', async () => {
  const d = await fresh();
  await d.exec(CEREMONY);
  let threw = false;
  try { await d.exec(CEREMONY); } catch (e) {
    threw = true;
    assert(String(e.message).includes('already been performed'),
      `refused, but for the wrong reason: ${e.message}`);
  }
  assert(threw, 'the bootstrap ceremony ran twice — that is a standing backdoor');
  await d.close();
});

await test('and it refuses even when the accounts were created some other way', async () => {
  // The precondition is "any account exists", not "bootstrap has run". An
  // administrator who created accounts normally cannot clear the way back.
  const d = await fresh();
  const { execAs: ex } = roleHelpers(d);
  await d.exec(
    `insert into cw.account (person,display_name,role,created_by)
     values ('${ADMIN}','Ada','administrator','owner@clausewerk')`);
  let threw = false;
  try { await d.exec(CEREMONY); } catch { threw = true; }
  assert(threw, 'the ceremony ran on a system that already had people in it');
  await d.close();
});

await test('the in-function role guard refuses an administrator, if ever reached', async () => {
  // Two layers, tested separately, because the outer one hides the inner one.
  //
  // In normal operation no role holds EXECUTE on cw.bootstrap (the next test),
  // so an administrator attempting the ceremony is refused by privilege before
  // a single line of the function body runs. That is the stronger refusal and it
  // is the one that ships.
  //
  // It also means the `app_role() is not null` guard inside the function would
  // be untestable through any ordinary connection — and an untestable guard is
  // indistinguishable from a comment. So the grant is deliberately opened here,
  // the guard is exercised, and the grant is taken away again. What this proves
  // is the thing worth proving: if some future migration grants execute on this
  // function, the function itself still refuses. On a fresh system the
  // accounts-empty precondition passes, so without this inner guard that grant
  // would be enough for an administrator to mint themselves a second Legal admin.
  const d = await fresh();
  const { queryAs: qa } = roleHelpers(d);
  await d.exec(`grant execute on function
    cw.bootstrap(text,text,text,text,text,text) to cw_administrator`);
  await throws(() => qa('administrator', CEREMONY, [], ADMIN),
    'owner', 'an application role performed the owner\'s one act');
  await d.exec(`revoke execute on function
    cw.bootstrap(text,text,text,text,text,text) from cw_administrator`);
  // And with the grant gone it is unreachable again, which is how it ships.
  await throws(() => qa('administrator', CEREMONY, [], ADMIN), 'permission denied');
  await d.close();
});

await test('no application role can reach the function as shipped', async () => {
  const d = await fresh();
  for (const dbRole of Object.values(ROLE_TO_DB_ROLE)) {
    const r = (await d.query(
      `select has_function_privilege($1,
         'cw.bootstrap(text,text,text,text,text,text)', 'EXECUTE') as held`,
      [dbRole])).rows[0];
    eq(r.held, false, `${dbRole} can execute cw.bootstrap()`);
  }
  await d.close();
});

await test('the first administrator and first legal admin must be two people', async () => {
  const d = await fresh();
  await throws(() => d.exec(
    `select cw.bootstrap('owner@clausewerk','${ADMIN}','Ada','${ADMIN}','Ada')`),
    'two different people',
    'one person held both halves of the countersign rule from the first minute');
  await d.close();
});

await test('the ceremony refuses to be anonymous', async () => {
  const d = await fresh();
  await throws(() => d.exec(
    `select cw.bootstrap('  ','${ADMIN}','Ada','${LEGAL}','Rae')`),
    'name yourself');
  await d.close();
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
