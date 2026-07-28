// The role harness, proved.
//
// This suite tests the instrument, not the system. If `roles.mjs` did not
// genuinely become the named database role, every "runs as the real role" claim
// made by the suites that depend on it would be decoration — so the instrument
// gets its own evidence before anything trusts it.
//
//   node db/test/roles.test.mjs

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
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const db = await PGlite.create();
const { asOwner, become, as, queryAs, mustWrite, mustNotWrite, ROLE_TO_DB_ROLE } =
  roleHelpers(db);

for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
}
await db.exec(`select set_config('cw.actor','seed@clausewerk',false);
  insert into cw.category (key,label,short) values ('roles','Role Harness','RH');
  insert into cw.clause (clause_id,category_key,severity) values ('RH-S-001','roles','Standard');
  insert into cw.clause_version
    (clause_id,version,title,body,rationale,citations,reviewer,approved_on,expires_on)
  values ('RH-S-001',1,'Harness clause','Nothing of consequence.','Fixture',
          array['Policy-RH-001'],'A. Reyes','2026-01-01','2030-01-01');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-MINE','Northwind','buyer@clausewerk'),
    ('AG-THEIRS','Contoso','rival@clausewerk');`);

console.log('\nthe harness actually changes role');

await test('the owner is not a named application role', async () => {
  await asOwner();
  const who = (await db.query('select current_user as u')).rows[0].u;
  assert(!who.startsWith('cw_'), `expected the owner, got ${who}`);
});

await test('become() switches the session to the real database role', async () => {
  const rows = await queryAs('legal_admin', 'select current_user as u');
  assert(rows[0].u === 'cw_legal_admin', `expected cw_legal_admin, got ${rows[0].u}`);
  await asOwner();
  const back = (await db.query('select current_user as u')).rows[0].u;
  assert(!back.startsWith('cw_'), 'the helper did not return to the owner');
});

await test('an error inside as() still returns to the owner', async () => {
  try { await queryAs('viewer', 'select 1/0'); } catch { /* expected */ }
  const back = (await db.query('select current_user as u')).rows[0].u;
  assert(!back.startsWith('cw_'), 'a raised statement stranded the session in a role');
});

console.log('\nprivileges and policies actually apply');

await test('legal_admin may write to the library', async () => {
  await mustWrite('legal_admin',
    `insert into cw.category (key,label,short) values ('roles2','Role Harness 2','RX')`);
});

await test('a viewer is refused — the grant is missing', async () => {
  const how = await mustNotWrite('viewer',
    `insert into cw.category (key,label,short) values ('nope','Nope','NO')`);
  assert(how === 'raised', `expected a privilege error, got ${how}`);
});

await test('a legal_reviewer is refused — the grant is missing (ADR-0008)', async () => {
  const how = await mustNotWrite('legal_reviewer',
    `insert into cw.category (key,label,short) values ('nope2','Nope 2','NX')`);
  assert(how === 'raised', `expected a privilege error, got ${how}`);
});

await test('row-level security binds a role even when the grant is present', async () => {
  // The decisive case. Give a requester the table privilege but not the policy:
  // if the harness were still running as the owner, RLS would be bypassed and
  // this insert would succeed. It must not.
  await asOwner();
  await db.exec(`grant insert on cw.category to cw_requester;`);
  const how = await mustNotWrite('requester',
    `insert into cw.category (key,label,short) values ('rls','RLS probe','RL')`);
  await asOwner();
  await db.exec(`revoke insert on cw.category from cw_requester;`);
  assert(how === 'raised', `RLS did not bind the role — got ${how}. The harness is not switching role.`);
});

await test('removing a grant makes a helper-run write fail', async () => {
  // The package's own acceptance criterion: the instrument must notice when a
  // protection is taken away.
  await asOwner();
  await db.exec(`revoke insert on cw.category from cw_legal_admin;`);
  const how = await mustNotWrite('legal_admin',
    `insert into cw.category (key,label,short) values ('gone','Gone','GN')`);
  await asOwner();
  await db.exec(`grant insert on cw.category to cw_legal_admin;`);
  assert(how === 'raised', `expected the revoked grant to bite, got ${how}`);
});

console.log('\nthe silent no-op — the shape of finding D1');

await test('mustNotWrite reports a silent no-op instead of calling it a refusal', async () => {
  // An UPDATE with no matching policy does not raise. It affects zero rows and
  // reports success. That is how D1 hid, so the helper must refuse to score it
  // as a refusal unless the caller explicitly expects one.
  await asOwner();
  await db.exec(`grant update on cw.category to cw_requester;`);
  let complained = false;
  try {
    await mustNotWrite('requester', `update cw.category set label = 'hijacked' where key = 'roles'`);
  } catch (e) {
    complained = String(e.message).includes('finding D1');
  }
  await asOwner();
  await db.exec(`revoke update on cw.category from cw_requester;`);
  assert(complained, 'a silent no-op was scored as a refusal — the exact D1 blind spot');
});

await test('the silent no-op really did change nothing', async () => {
  await asOwner();
  const row = (await db.query(`select label from cw.category where key = 'roles'`)).rows[0];
  assert(row.label === 'Role Harness', `the row was actually modified: ${row.label}`);
});

// ── Identity comes from the connection, not from a claim (WP-04, D3) ────────
//
// cw.app_role() used to read `cw.role`, a session setting any connected client
// can write. Every policy in the schema trusts it, so the system asked "who are
// you" and believed the answer. These tests hold the new rule: the answer comes
// from the database role the connection actually holds.
console.log('\nidentity comes from the connection, not from a claim (WP-04)');

// Become the named role, then have that role claim to be legal_admin, then run
// the statement. The claim and the statement are issued separately on purpose:
// sending them as one string would make PGlite reject the batch outright, and a
// refusal that came from the driver rather than from the database would look
// exactly like the protection working.
const spoofAs = (role, sql, actor) => as(role, async () => {
  await db.exec(`select set_config('cw.role','legal_admin',false);`);
  return (await db.query(sql)).rows;
}, actor);

await test('cw.app_role() follows the connection for every role', async () => {
  for (const app of Object.keys(ROLE_TO_DB_ROLE)) {
    const got = await spoofAs(app, `select cw.app_role() as r`);
    assert(got[0].r === app,
      `${app} claimed legal_admin and the database agreed: got ${got[0].r}`);
  }
});

await test('the owner maps to no application role', async () => {
  // Settled decision U3. The owner is the migration runner, not a person acting
  // in the business, so it holds no application role and owner-run governed
  // writes are run as a named role instead.
  await asOwner();
  await db.exec(`select set_config('cw.role','legal_admin',false);`);
  const r = (await db.query('select cw.app_role() as r')).rows[0];
  assert(r.r === null, `the owner was handed the role "${r.r}" for the asking`);
});

await test('a legal reviewer cannot become legal_admin by setting cw.role', async () => {
  // The governed write path: cw_legal_reviewer genuinely holds INSERT on the
  // audit log, so no privilege error can mask this. The only thing deciding
  // what authority they may record is cw.app_role(). Before WP-04 this insert
  // succeeded and the permanent record showed an approval authority the
  // reviewer does not hold.
  let threw = false;
  try {
    await spoofAs('legal_reviewer',
      `insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject)
       values ('reviewer@clausewerk','legal_admin','human','clause_activated','RH-S-001@v1')`);
  } catch { threw = true; }
  assert(threw, 'the claim was honoured — the reviewer wrote themselves in as legal_admin');
  await asOwner();
  // Scoped to THE FORGERY, not to the role. This used to assert that no row
  // anywhere carried actor_role = 'legal_admin', which held only because
  // nothing in this suite legitimately acted as one. 0020 added audit triggers
  // to cw.agreement and cw.category, so a legal admin creating a category now
  // writes an honest legal_admin row and the old assertion failed on it.
  //
  // The narrower claim is also the truer one: what must not exist is the
  // reviewer's forged event, not every trace of the role. A test that breaks
  // when the system starts recording something legitimate was measuring the
  // absence of activity rather than the presence of a control.
  const leaked = (await db.query(
    `select count(*)::int as n from cw.audit_event
      where actor_role = 'legal_admin'
        and event_type = 'clause_activated' and subject = 'RH-S-001@v1'`)).rows[0];
  assert(leaked.n === 0, 'a forged legal_admin attribution reached the permanent record');
});

await test('audit attribution cannot name a role the connection does not hold', async () => {
  // The same forgery without any session-variable games at all, so this test
  // names the binding in 0007 rather than the accessor in 0001.
  const how = await mustNotWrite('requester',
    `insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject)
     values ('buyer@clausewerk','auditor','human','clause_activated','RH-S-001@v1')`);
  assert(how === 'raised', `a requester recorded themselves as auditor — got ${how}`);
});

await test('a requester cannot read another buyer’s agreement by claiming a role', async () => {
  // The read half of D3, and the half table privileges never covered: a
  // requester holds SELECT on cw.agreement by design, and only the policy — via
  // cw.app_role() — keeps them inside their own deals.
  const seen = await spoofAs('requester',
    `select agreement_id from cw.agreement order by agreement_id`, 'buyer@clausewerk');
  const ids = seen.map(r => r.agreement_id);
  assert(!ids.includes('AG-THEIRS'),
    `a claimed role opened a rival buyer's deals: ${JSON.stringify(ids)}`);
  assert(ids.includes('AG-MINE'), 'and the requester must still see their own deal');
});

console.log('\nevery role can still do its own work (WP-04 regression)');

await test('a viewer can still read clause text', async () => {
  const r = await queryAs('viewer', `select count(*)::int as n from cw.clause_version`);
  assert(r[0].n > 0, 'a viewer must still be able to read the library');
});

await test('a requester can still open a deal of their own', async () => {
  const opened = await queryAs('requester',
    `insert into cw.agreement (agreement_id,counterparty,requester)
     values ('AG-NEW','Fabrikam','rival@clausewerk')
     returning requester`, [], 'buyer@clausewerk');
  assert(opened[0].requester === 'buyer@clausewerk',
    `a requester injected a deal into ${opened[0].requester}'s ownership scope`);
});

await test('a legal reviewer can still record their own act', async () => {
  // The positive control for the two forgery tests above: the binding must stop
  // a lie without stopping the truth.
  await mustWrite('legal_reviewer',
    `insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject)
     values ('reviewer@clausewerk','legal_reviewer','human','ticket_verified','RH-S-001@v1')`);
});

await test('a legal_admin can still record an audited act', async () => {
  await mustWrite('legal_admin',
    `insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject)
     values ('legal@clausewerk','legal_admin','human','clause_activated','RH-S-001@v1')`);
});

await test('an auditor can still read the whole log', async () => {
  await asOwner();
  const all = (await db.query(`select count(*)::int as n from cw.audit_event`)).rows[0].n;
  const seen = await queryAs('auditor', `select count(*)::int as n from cw.audit_event`);
  assert(seen[0].n === all, `the auditor saw ${seen[0].n} of ${all} events`);
});

await asOwner();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
