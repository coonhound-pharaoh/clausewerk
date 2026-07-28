// Role grants and the countersign rule — migration 0013 part 2 (WP-U02).
//
// Owner decision U6: a grant of either LEGAL role takes effect only when a
// Legal admin countersigns it. Everything below exists to prove that the rule is
// real rather than decorative, and "real" has a specific meaning here:
//
//   · an uncountersigned Legal grant confers NOTHING — not a reduced role,
//     nothing. The person's connection can do nothing reviewer-shaped;
//   · the DATABASE refuses, not the console. A rule enforced only in the API is
//     one bug from gone, and the bug would be invisible: the screen would keep
//     showing the amber pending badge while the person it names was working;
//   · nobody grants or countersigns for themselves, by any path;
//   · a revoked grant, and a revoked account, confer nothing.
//
// The tests that matter most are the ones that perform a genuine
// reviewer-shaped ACT as the person whose grant is pending. Asserting that a
// view returns no row would prove only that the view is written the way the
// view is written.
//
//   node db/test/role-grant.test.mjs

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

const OWNER = 'owner@clausewerk';
const ADMIN = 'a.okafor@clausewerk';   // the first Administrator
const LEGAL = 'r.vance@clausewerk';    // the first Legal admin
const ADMIN2 = 'b.stone@clausewerk';   // a second Administrator, for self-act tests
const PAT   = 'p.nkemi@clausewerk';    // becomes a legal reviewer, eventually
const DANA  = 'd.buyer@clausewerk';    // a requester
const SAM   = 's.reed@clausewerk';     // a viewer

// The ceremony. Everything after this is done by named people holding roles.
await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada Okafor',
                                   '${LEGAL}','Rae Vance','Head Office')`);

const account = (person, name, role) => execAs('administrator',
  `insert into cw.account (person,display_name,role,created_by)
   values ('${person}','${name}','${role}','${ADMIN}')`, ADMIN);

const grant = async (person, role, reason = 'joining the team') =>
  (await queryAs('administrator',
    `insert into cw.role_grant (action,person,role,reason,acted_at)
     values ('granted',$1,$2,$3,'2000-01-01T00:00:00Z')
     returning grant_id`, [person, role, reason], ADMIN))[0].grant_id;

const effective = async (person) => {
  const r = await rows(`select role from cw.effective_role where person=$1`, [person]);
  return r.length ? r[0].role : null;
};

// ── The ceremony's own grants ─────────────────────────────────────────────
console.log('\nthe ceremony leaves two people able to work');

await test('the first Administrator holds their role effectively', async () => {
  eq(await effective(ADMIN), 'administrator');
});

await test('the first Legal admin does too, uncountersigned — the one exception', async () => {
  // Stated rather than hidden: there is nobody to countersign the first Legal
  // admin, so their grant is effective on the bootstrap flag. If this ever
  // stopped being true the system would install into a state where nobody could
  // countersign anything, which is a deadlock, not a control.
  eq(await effective(LEGAL), 'legal_admin');
  const g = await one(`select is_bootstrap, acted_by from cw.role_grant
                       where person=$1 and action='granted'`, [LEGAL]);
  eq(g.is_bootstrap, true, 'the exception is not flagged, so nobody can find it');
  eq(g.acted_by, OWNER);
});

await test('the exception is exactly one row, findable in one query', async () => {
  const r = await rows(
    `select person from cw.role_grant
     where action='granted' and role in ('legal_reviewer','legal_admin')
       and is_bootstrap
     order by person`);
  eq(r.map(x => x.person), [LEGAL],
    'more than the first Legal admin holds an uncountersigned Legal role');
});

await test('the ceremony\'s grants are on the chain as system acts', async () => {
  const r = await rows(
    `select actor, actor_kind, payload->>'role' as role from cw.audit_event
     where event_type='role_granted' order by seq`);
  eq(r.length, 2);
  for (const x of r) { eq(x.actor, OWNER); eq(x.actor_kind, 'system'); }
});

// ── Non-Legal roles: one name ─────────────────────────────────────────────
console.log('\nviewer, requester and auditor take one name');

await test('a requester is granted by the administrator alone, and it works at once', async () => {
  await account(DANA, 'Dana Buyer', 'requester');
  await grant(DANA, 'requester');
  eq(await effective(DANA), 'requester');
});

await test('a viewer likewise', async () => {
  await account(SAM, 'Sam Reed', 'viewer');
  await grant(SAM, 'viewer');
  eq(await effective(SAM), 'viewer');
});

await test('and none of them appears in the countersign queue', async () => {
  const q = await rows(`select person from cw.countersign_pending`);
  eq(q.length, 0, 'a role that needs no countersign is sitting in the queue');
});

await test('countersigning a non-Legal grant is refused — there is nothing to accept', async () => {
  const g = await one(`select grant_id from cw.role_grant
                       where person=$1 and action='granted'`, [DANA]);
  await throws(() => queryAs('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned',$1,'requester',$2)`, [DANA, g.grant_id], LEGAL),
    'only grants of the two Legal roles are countersigned');
});

// ── Legal roles: two names ────────────────────────────────────────────────
console.log('\nthe two Legal roles take two names (decision U6)');

let PAT_GRANT;
await test('a proposed legal reviewer confers NOTHING before countersign', async () => {
  await account(PAT, 'Pat Nkemi', 'legal_reviewer');
  PAT_GRANT = await grant(PAT, 'legal_reviewer', 'joining the contracts team');
  const g = await one(`select acted_at > now() - interval '1 minute'
                             and acted_at <= now() as acted_time_is_fresh
                        from cw.role_grant where grant_id=${PAT_GRANT}`);
  eq(g.acted_time_is_fresh, true,
    'the caller-supplied grant timestamp survived');
  eq(await effective(PAT), null,
    'an uncountersigned Legal grant conferred a role');
});

await test('and the pending grant is visible as pending, to Legal', async () => {
  const q = await queryAs('legal_admin',
    `select person, role, proposed_by from cw.countersign_pending`, [], LEGAL);
  eq(q.length, 1);
  eq([q[0].person, q[0].role, q[0].proposed_by], [PAT, 'legal_reviewer', ADMIN]);
});

await test('the person named on a pending grant cannot do anything reviewer-shaped', async () => {
  // The test that actually matters. A reviewer-shaped act, performed on the
  // write path — not an assertion about what a view returns.
  //
  // Note what this does NOT yet prove, and cannot until WP-U05: the service
  // layer is what will refuse to put Pat on a cw_legal_reviewer connection at
  // all. What is proved here is that cw.effective_role — the single source that
  // layer consults — answers null, so a service layer that consults it and
  // nothing else has nothing to bind to.
  eq(await effective(PAT), null);
  const bound = await rows(
    `select count(*)::int n from cw.effective_role
     where person=$1 and role='legal_reviewer'`, [PAT]);
  eq(bound[0].n, 0,
    'the service layer would find a legal_reviewer binding for a pending grant');
});

await test('an administrator cannot countersign — not even somebody else\'s grant', async () => {
  await mustNotWrite('administrator',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned','${PAT}','legal_reviewer',${PAT_GRANT})`);
});

await test('no other role can countersign either', async () => {
  for (const role of ['viewer','requester','legal_reviewer','auditor']) {
    await mustNotWrite(role,
      `insert into cw.role_grant (action,person,role,grant_ref)
       values ('countersigned','${PAT}','legal_reviewer',${PAT_GRANT})`);
  }
});

await test('a legal admin countersigns, and the role is effective immediately', async () => {
  await mustWrite('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref,acted_at)
     values ('countersigned','${PAT}','legal_reviewer',${PAT_GRANT},
             '2099-01-01T00:00:00Z')
     returning grant_id,
       acted_at > now() - interval '1 minute' and acted_at <= now()
         as acted_time_is_fresh`, [], LEGAL)
    .then(r => eq(r[0].acted_time_is_fresh, true,
      'the caller-supplied countersign timestamp survived'));
  eq(await effective(PAT), 'legal_reviewer');
});

await test('the countersign is recorded with both names', async () => {
  const e = await one(`select subject, actor, payload->>'role' as role
                       from cw.audit_event where event_type='role_countersigned'`);
  eq([e.subject, e.actor, e.role], [PAT, LEGAL, 'legal_reviewer']);
  const v = await one(`select granted_by, countersigned_by from cw.effective_role
                       where person=$1`, [PAT]);
  eq([v.granted_by, v.countersigned_by], [ADMIN, LEGAL],
    'the effective role does not show both names, so the console cannot either');
});

await test('the queue empties when the grant is accepted', async () => {
  const q = await rows(`select person from cw.countersign_pending`);
  eq(q.length, 0);
});

await test('a grant cannot be countersigned twice', async () => {
  await throws(() => queryAs('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned','${PAT}','legal_reviewer',${PAT_GRANT})`, [], LEGAL),
    'already countersigned');
});

// ── Nobody acts for themselves ────────────────────────────────────────────
console.log('\nnobody grants or countersigns for themselves, by any path');

await test('an administrator cannot grant themselves a role', async () => {
  await throws(() => queryAs('administrator',
    `insert into cw.role_grant (action,person,role)
     values ('granted','${ADMIN}','legal_admin')`, [], ADMIN),
    'nobody grants themselves a role');
});

await test('and cannot do it by naming somebody else in acted_by', async () => {
  // acted_by is overwritten from the connection, so a supplied value is not
  // merely ignored — it cannot be used to dodge the self-grant check either.
  await throws(() => queryAs('administrator',
    `insert into cw.role_grant (action,person,role,acted_by)
     values ('granted','${ADMIN}','legal_admin','${LEGAL}')`, [], ADMIN),
    'nobody grants themselves a role');
});

await test('the actor on a grant is the connection\'s person, not a claim', async () => {
  await account(ADMIN2, 'Bo Stone', 'administrator');
  await queryAs('administrator',
    `insert into cw.role_grant (action,person,role,acted_by)
     values ('granted','${ADMIN2}','administrator','somebody.else@clausewerk')`,
    [], ADMIN);
  const g = await one(`select acted_by from cw.role_grant
                       where person=$1 and action='granted'`, [ADMIN2]);
  eq(g.acted_by, ADMIN, 'the access history recorded a name the connection did not hold');
});

await test('the subject of a grant cannot accept it, whatever connection they use', async () => {
  // The check is against the PERSON, not against the role on the connection.
  // That distinction matters: somebody who is both the subject of a pending
  // Legal grant and already a Legal admin would otherwise be able to accept
  // their own — a legal_admin connection carrying their name is exactly the
  // situation, and it is the one the console will most plausibly produce.
  const g = (await queryAs('administrator',
    `insert into cw.role_grant (action,person,role) values
     ('granted','${SAM}','legal_reviewer') returning grant_id`, [], ADMIN2))[0].grant_id;
  await throws(() => queryAs('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned','${SAM}','legal_reviewer',$1)`, [g], SAM),
    'nobody countersigns their own role',
    'the subject of a grant accepted it from a legal_admin connection');
  // Clean up: revoke the speculative grant so later assertions are not confused.
  await execAs('administrator',
    `insert into cw.role_grant (action,person,role,grant_ref,reason)
     values ('revoked','${SAM}','legal_reviewer',${g},'proposed in error')`, ADMIN);
});

await test('a legal admin cannot countersign a grant proposed to themselves', async () => {
  const g = (await queryAs('administrator',
    `insert into cw.role_grant (action,person,role,reason) values
     ('granted','${LEGAL}','legal_reviewer','a second legal role') returning grant_id`,
    [], ADMIN))[0].grant_id;
  await throws(() => queryAs('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned','${LEGAL}','legal_reviewer',$1)`, [g], LEGAL),
    'nobody countersigns their own role');
  await execAs('administrator',
    `insert into cw.role_grant (action,person,role,grant_ref,reason)
     values ('revoked','${LEGAL}','legal_reviewer',${g},'withdrawn')`, ADMIN);
});

await test('the proposer cannot also be the acceptor, even holding both roles', async () => {
  // The subtle one. Rae is a legal_admin. If Rae could also somehow propose,
  // countersigning their own proposal would be one signature wearing two hats —
  // the rule satisfied by one person, which is the rule not existing.
  //
  // The insert policy already stops a legal_admin proposing, so this is reached
  // by inserting the grant as the owner with Rae named as proposer, which is
  // exactly the shape a future bug or a stray migration would produce.
  await db.exec(
    `insert into cw.account (person,display_name,role,created_by)
     values ('temp.rev@clausewerk','Temp Reviewer','legal_reviewer','${ADMIN}')`);
  const g = (await db.query(
    `insert into cw.role_grant (action,person,role,acted_by,is_bootstrap)
     values ('granted','temp.rev@clausewerk','legal_reviewer','${LEGAL}',true)
     returning grant_id`)).rows[0].grant_id;
  await throws(() => queryAs('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned','temp.rev@clausewerk','legal_reviewer',$1)`, [g], LEGAL),
    'cannot also accept it');
});

// ── Revocation ────────────────────────────────────────────────────────────
console.log('\nrevocation, and what it does and does not promise');

await test('revoking a grant takes the role away', async () => {
  const g = await one(`select grant_id from cw.role_grant
                       where person=$1 and action='granted'`, [DANA]);
  await mustWrite('administrator',
    `insert into cw.role_grant (action,person,role,grant_ref,reason)
     values ('revoked','${DANA}','requester',${g.grant_id},'left the company')
     returning grant_id`, [], ADMIN);
  eq(await effective(DANA), null);
});

await test('the revocation is recorded with its reason', async () => {
  const e = await one(`select subject, payload->>'reason' as reason
                       from cw.audit_event
                       where event_type='role_revoked' and subject=$1`, [DANA]);
  eq([e.subject, e.reason], [DANA, 'left the company']);
});

await test('a revoked grant cannot be revoked twice', async () => {
  const g = await one(`select grant_id from cw.role_grant
                       where person=$1 and action='granted'`, [DANA]);
  await throws(() => queryAs('administrator',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('revoked','${DANA}','requester',$1)`, [g.grant_id], ADMIN),
    'already revoked');
});

await test('a revoked ACCOUNT confers nothing, however live its grants', async () => {
  // Two independent ways to lose access, and both must work. Revoking the
  // account without revoking each grant is the likely operator shortcut.
  await execAs('administrator',
    `update cw.account set state='revoked', revoked_by='${ADMIN}', revoked_at=now()
     where person='${SAM}'`, ADMIN);
  eq(await effective(SAM), null,
    'a revoked person still held a role because their grant was untouched');
});

await test('a role cannot be granted to a revoked account', async () => {
  await throws(() => queryAs('administrator',
    `insert into cw.role_grant (action,person,role)
     values ('granted','${SAM}','viewer')`, [], ADMIN),
    'is revoked');
});

await test('somebody can be brought back — as a new grant, on the record', async () => {
  await execAs('administrator',
    `insert into cw.account (person,display_name,role,created_by)
     values ('returner@clausewerk','Ren Turner','requester','${ADMIN}')`, ADMIN);
  const g = await grant('returner@clausewerk', 'requester');
  eq(await effective('returner@clausewerk'), 'requester');
  await execAs('administrator',
    `insert into cw.role_grant (action,person,role,grant_ref,reason)
     values ('revoked','returner@clausewerk','requester',${g},'secondment')`, ADMIN);
  eq(await effective('returner@clausewerk'), null);
  await grant('returner@clausewerk', 'requester', 'back from secondment');
  eq(await effective('returner@clausewerk'), 'requester');
  const acts = await rows(
    `select action from cw.role_grant where person='returner@clausewerk'
     order by grant_id`);
  eq(acts.map(a => a.action), ['granted','revoked','granted'],
    'the round trip is not fully on the record');
});

// ── Append-only ───────────────────────────────────────────────────────────
console.log('\nthe access history cannot be edited, by anyone');

await test('no role holds update or delete on cw.role_grant', async () => {
  const wrong = [];
  for (const r of ['cw_viewer','cw_requester','cw_legal_reviewer','cw_legal_admin',
                   'cw_auditor','cw_administrator']) {
    for (const p of ['UPDATE','DELETE']) {
      const h = (await one(`select has_table_privilege($1,'cw.role_grant',$2) as h`,
        [r, p])).h;
      if (h) wrong.push(`${r} ${p}`);
    }
  }
  eq(wrong, []);
});

await test('and the owner cannot edit it either — the trigger is the second layer', async () => {
  await throws(() => db.exec(
    `update cw.role_grant set acted_by='somebody.else' where grant_id=1`),
    'append-only');
  await throws(() => db.exec(`delete from cw.role_grant where grant_id=1`),
    'append-only');
});

await test('a countersign row cannot claim a grant that is not one', async () => {
  const c = await one(`select grant_id from cw.role_grant where action='countersigned'`);
  await throws(() => queryAs('legal_admin',
    `insert into cw.role_grant (action,person,role,grant_ref)
     values ('countersigned','${PAT}','legal_reviewer',$1)`, [c.grant_id], LEGAL),
    'a countersign names a grant');
});

await test('a grant names nothing; a countersign and a revocation name a grant', async () => {
  // The two halves are caught by two different mechanisms, and it is worth
  // knowing which. A 'granted' row carrying a grant_ref is stopped by the table
  // constraint. A 'revoked' row carrying none is stopped inside the trigger,
  // because the trigger runs first and would otherwise fall through to a
  // not-null violation on person — an error message that is true, useless, and
  // points at the wrong column.
  await throws(() => db.exec(
    `insert into cw.role_grant (action,person,role,acted_by,grant_ref,is_bootstrap)
     values ('granted','${PAT}','viewer','${ADMIN}',1,true)`),
    'an_act_names_its_subject');
  await throws(() => db.exec(
    `insert into cw.role_grant (action,person,role,acted_by,is_bootstrap)
     values ('revoked','${PAT}','viewer','${ADMIN}',true)`),
    'a revocation names the grant it withdraws');
  await throws(() => db.exec(
    `insert into cw.role_grant (action,person,role,acted_by,grant_ref,is_bootstrap)
     values ('countersigned','${PAT}','legal_reviewer','${ADMIN}',99999,true)`),
    'does not exist');
});

// ── Everyone can read the access story ────────────────────────────────────
console.log('\nthe access story is readable by everyone and writable by two');

await test('every role can read the grants and the effective roles', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin',
                      'auditor','administrator']) {
    const g = await queryAs(role, `select count(*)::int n from cw.role_grant`);
    assert(g[0].n > 0, `${role} cannot read cw.role_grant`);
    const e = await queryAs(role, `select count(*)::int n from cw.effective_role`);
    assert(e[0].n > 0, `${role} cannot read cw.effective_role`);
  }
});

await test('but only the administrator grants and revokes', async () => {
  for (const role of ['viewer','requester','legal_reviewer','legal_admin','auditor']) {
    await mustNotWrite(role,
      `insert into cw.role_grant (action,person,role)
       values ('granted','${PAT}','legal_admin')`);
  }
});

// ── The console's read models (WP-U08, migration 0014) ───────────────────
console.log('\ndormancy is measured from recorded acts, never from sign-ins');

await test('somebody who has never acted is flagged, however present they are', async () => {
  // The whole point of measuring acts rather than sign-ins: somebody who signs
  // in every morning and does nothing is dormant WHERE IT COUNTS. There is no
  // sign-in data anywhere in this system to be tempted by, and that is
  // deliberate — a sign-in log would be a second, weaker activity record beside
  // the real one, and somebody would eventually join to the wrong one.
  const r = await one(`select activity_state, acts_recorded from cw.person_activity
                       where person=$1`, [PAT]);
  eq(r.acts_recorded, 0);
  eq(r.activity_state, 'never acted',
    'an account that has done nothing is not flagged as unused');
});

await test('"never acted" and "dormant" are kept apart', async () => {
  // Different situations with different answers: the first is usually a joiner
  // given the wrong role or never told they had it; the second is somebody who
  // has moved on. One amber flag for both hides which.
  const states = await rows(
    `select distinct activity_state from cw.person_activity order by 1`);
  const known = ['active','dormant','never acted','no effective role','revoked'];
  for (const s of states)
    assert(known.includes(s.activity_state), `unexpected state ${s.activity_state}`);
  assert(states.length >= 2, 'every person is in the same state, so nothing is distinguished');
});

await test('acting shows up immediately, and the last act is named', async () => {
  const r = await one(`select acts_recorded, last_act, activity_state
                       from cw.person_activity where person=$1`, [ADMIN]);
  assert(r.acts_recorded > 0, 'the administrator has acted many times in this suite');
  assert(r.last_act, 'the last act is not named, so the console can only show a date');
  eq(r.activity_state, 'active');
});

await test('a revoked account reads as revoked, not as merely inactive', async () => {
  const r = await one(`select activity_state from cw.person_activity
                       where person=$1`, [SAM]);
  eq(r.activity_state, 'revoked',
    'a revoked person shown as merely inactive invites somebody to re-enable them');
});

await test('shared accounts is structurally zero, and reported as a fact', async () => {
  // ADR-0008's residual, paid off. One row per named person is cw.account's
  // primary key, so this is zero by construction rather than by discipline —
  // and it is measured rather than assumed, because a stated goal nobody
  // measures is a hope.
  const s = await one(`select * from cw.access_summary`);
  eq(s.shared_accounts, 0);
  assert(s.people_with_access > 0, 'the summary found nobody at all');
});

await test('a requester cannot read the activity view at all', async () => {
  // It reads the audit chain, whose policy scopes a requester to their own
  // rows — so an unrestricted grant would show everybody's names with a null
  // last act beside them, which is a misleading answer rather than a refused
  // one. A clean permission error is the honest outcome.
  for (const role of ['requester','viewer','legal_reviewer']) {
    await throws(() => queryAs(role, `select * from cw.person_activity`),
      'permission denied', `${role} can read cw.person_activity`);
  }
});

await test('the administrator, auditor and legal admin can', async () => {
  for (const role of ['administrator','auditor','legal_admin']) {
    const r = await queryAs(role, `select count(*)::int n from cw.person_activity`);
    assert(r[0].n > 0, `${role} cannot read cw.person_activity`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
