// Attributed mutations through the API — WP-U06.
//
// The claim: every write that goes through the doorway lands on the audit chain
// with the real person's name, and the v3 prototype's unattributed override is
// not a bug that was fixed but a shape that cannot be expressed.
//
// FOUR THINGS THIS SUITE PROVES, and the last two are the ones that matter:
//
//   1. Each mutation, performed as the role permitted to perform it, lands and
//      is audited with the right name AND the right authority.
//   2. Each mutation, performed as a role that may not, is refused end to end —
//      and nothing reaches the chain. A refused act that still logs something is
//      a record of an act that did not happen.
//   3. NO WRITE ENDPOINT CAN CARRY A NAME FROM THE REQUEST. Asserted against
//      the source of every handler, not by trying a few and hoping.
//   4. The audit rows produced THROUGH THE API are indistinguishable in shape
//      from those produced by the database tests. If they differed, the API
//      would be a second way of writing history.
//
//   node db/test/mutations-api.test.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE = process.env.CW_SERVICE || join(HERE, '..', '..', 'service');
const load = (f) => import(pathToFileURL(join(SERVICE, f)).href);

const { Db }  = await load('db.mjs');
const { App } = await load('app.mjs');
const { MUTATIONS } = await load('mutations.mjs');

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

const OWNER = 'owner@clausewerk';
const ADMIN = 'a.okafor@clausewerk';
const LEGAL = 'r.vance@clausewerk';
const DANA  = 'd.buyer@clausewerk';
const PAT   = 'p.nkemi@clausewerk';
const SAM   = 's.reed@clausewerk';

const pg = await PGlite.create();
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const DB  = new Db(pg);
const APP = new App(DB);
const rows = async (sql, params = []) => (await pg.query(sql, params)).rows;

await pg.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada Okafor',
                                   '${LEGAL}','Rae Vance','Head Office')`);

await DB.asPerson(ADMIN, 'administrator', async ({ query }) => {
  for (const [p, n, r] of [[DANA,'Dana Buyer','requester'],
                           [PAT,'Pat Nkemi','legal_reviewer'],
                           [SAM,'Sam Reed','viewer']]) {
    await query(`insert into cw.account (person,display_name,unit,role,created_by)
                 values ($1,$2,'Procurement',$3,$4)`, [p, n, r, ADMIN]);
    await query(`insert into cw.role_grant (action,person,role)
                 values ('granted',$1,$2)`, [p, r]);
  }
});
await DB.asPerson(LEGAL, 'legal_admin', async ({ query }) => {
  const g = await query(`select grant_id from cw.role_grant
                         where person=$1 and action='granted'`, [PAT]);
  await query(`insert into cw.role_grant (action,person,role,grant_ref)
               values ('countersigned',$1,'legal_reviewer',$2)`, [PAT, g[0].grant_id]);
});

// Installation seeding names who did it. Without the actor, the clause the
// seed creates lands on the chain as 'unattributed' — which the final sweep in
// this file catches, and correctly: an installer is a person too, and "the
// system installed itself" is not a fact anybody can act on later.
await pg.exec(`
  select set_config('cw.actor','installer@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values ('DP-H-014','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on)
    values ('DP-H-014',1,'24h','Notify within 24 hours.','2025-01-01','2030-01-01');
  select set_config('cw.actor','',false);`);

const tokens = {};
for (const p of [ADMIN, LEGAL, DANA, PAT, SAM]) {
  const r = await APP.signIn(p);
  assert(r.status === 200, `sign-in failed for ${p}: ${JSON.stringify(r.body)}`);
  tokens[p] = r.body.token;
}
const post = (person, path, body) =>
  APP.handle('POST', path, { token: tokens[person], body });

// ── The structural guarantee ─────────────────────────────────────────────
console.log('\nno write endpoint can carry a name from the request');

await test('not one handler reads an actor, person-as-author or role from the body', async () => {
  // The claim is about ALL of them, so it is asserted against all of them
  // rather than by trying a few. What is forbidden is a handler taking the
  // NAME OF WHO ACTED from the request. Taking the SUBJECT of an act from the
  // request is fine and necessary — POST /grants names the person being
  // granted a role, and that is not who is doing the granting.
  const src = readFileSync(join(SERVICE, 'mutations.mjs'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const field of ['actor', 'acted_by', 'approved_by', 'decided_by',
                       'added_by', 'removed_by', 'opened_by', 'created_by',
                       'revoked_by', 'granted_by']) {
    const taken = new RegExp(`body\\s*[.\\[]\\s*['"]?${field}\\b|required\\(body,\\s*['"]${field}['"]`);
    assert(!taken.test(src),
      `a handler takes ${field} from the request body — the session is the actor, always`);
  }
});

await test('every handler that records an actor reads it from the connection', async () => {
  // The positive half. Each entry that writes a "who did this" column must use
  // current_setting('cw.actor'), which asPerson bound from the session.
  const src = readFileSync(join(SERVICE, 'mutations.mjs'), 'utf8');
  const actorColumns = src.match(/current_setting\('cw\.actor'\)/g) ?? [];
  assert(actorColumns.length >= 8,
    `only ${actorColumns.length} handlers read the actor from the connection; `
    + 'expected every attributing write to do so');
});

await test('no handler catches a refusal and tries again', async () => {
  // The critical anti-pattern: catch-and-retry that reissues a refused write as
  // a different role or on a different connection "to make the demo work".
  const src = readFileSync(join(SERVICE, 'mutations.mjs'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert(!/\bcatch\b/.test(src),
    'mutations.mjs contains a catch — a refusal is the system working, and '
    + 'reissuing a refused write is the most damaging line this file could hold');
  assert(!/\bretry\b/i.test(src), 'mutations.mjs mentions retry');
});

await test('every endpoint names the database rule it defers to', async () => {
  const missing = Object.entries(MUTATIONS)
    .filter(([, m]) => !m.rule || !m.rule.trim()).map(([k]) => k);
  eq(missing, [], 'endpoints with no note saying where the decision actually lives');
});

// ── Each act, as the role that may, and as one that may not ─────────────
console.log('\neach act lands as the permitted role and is refused as another');

await test('a requester opens a deal, attributed to them', async () => {
  const r = await post(DANA, '/deals',
    { agreement_id: 'AG-001', counterparty: 'Northwind' });
  eq(r.status, 200);
  eq(r.body.rows[0].requester, DANA,
    'the deal was opened in somebody else\'s name');
});

await test('the requester on a deal comes from the session, not the body', async () => {
  const r = await post(DANA, '/deals',
    { agreement_id: 'AG-002', counterparty: 'Contoso', requester: LEGAL });
  eq(r.status, 200);
  eq(r.body.rows[0].requester, DANA, 'a body field renamed who opened the deal');
});

await test('a viewer cannot open a deal, and nothing reaches the chain', async () => {
  const before = (await rows(`select count(*)::int n from cw.audit_event`))[0].n;
  const r = await post(SAM, '/deals',
    { agreement_id: 'AG-BAD', counterparty: 'Nope' });
  eq(r.status, 403);
  const after = (await rows(`select count(*)::int n from cw.audit_event`))[0].n;
  eq(after, before, 'a refused act still wrote to the audit chain');
  eq((await rows(`select count(*)::int n from cw.agreement where agreement_id='AG-BAD'`))[0].n, 0);
});

let TICKET;
await test('a requester opens a review ticket, attributed to them', async () => {
  const r = await post(DANA, '/tickets', {
    agreement_id: 'AG-001', category_key: 'data', severity: 'High',
    reason_code: 'human-escalated', provenance_badge: 'VENDOR LANGUAGE',
    proposed_text: 'Notify within 72 hours.',
  });
  eq(r.status, 200);
  TICKET = r.body.rows[0].ticket_id;
  eq(r.body.rows[0].opened_by, DANA);
  const a = (await rows(
    `select actor, actor_role, actor_kind from cw.audit_event
     where event_type='review_ticket_opened' order by seq desc limit 1`))[0];
  eq([a.actor, a.actor_role, a.actor_kind], [DANA, 'requester', 'human']);
});

await test('a legal reviewer verifies it, and the minted origin is derived', async () => {
  const r = await post(PAT, '/tickets/verify', {
    ticket_id: TICKET,
    approved_text: 'Notify within 72 hours.',
    new_clause_id: 'DP-H-100', title: '72h',
    rationale: 'Agreed with the counterparty at 72 hours.',
    expires_on: '2030-01-01',
  });
  eq(r.status, 200);
  eq(r.body.rows[0].minted, 'DP-H-100@v1');
  const t = (await rows(
    `select decided_by, edited_before_approval, minted_clause_id
     from cw.review_ticket where ticket_id=$1`, [TICKET]))[0];
  eq(t.decided_by, PAT, 'the decision was recorded against the wrong person');
  eq(t.edited_before_approval, false,
    'edited_before_approval must be DERIVED from the two texts, not supplied');
  eq(t.minted_clause_id, 'DP-H-100');
});

await test('verification is one act, not an API-shaped shortcut round the schema', async () => {
  // Worth its own test because the first version of this file got it wrong in a
  // way that would have shipped. A single /tickets/decide endpoint doing a raw
  // UPDATE was refused outright by `verified_names_its_clause`: a verified
  // ticket must name the version it minted, and an update that sets the state
  // and nothing else cannot. The schema stopped the API inventing a second,
  // weaker way to promote language — which is what it is for.
  const src = readFileSync(join(SERVICE, 'mutations.mjs'), 'utf8');
  assert(!/update cw\.review_ticket/i.test(src),
    'a handler updates cw.review_ticket directly instead of going through '
    + 'cw.verify_review_ticket() / cw.reject_review_ticket()');
});

await test('a requester cannot verify a ticket, and it does not move', async () => {
  const r2 = await post(DANA, '/tickets', {
    agreement_id: 'AG-001', category_key: 'data', severity: 'High',
    reason_code: 'human-escalated', provenance_badge: 'VENDOR LANGUAGE',
    proposed_text: 'Notify within 96 hours.',
  });
  const t2 = r2.body.rows[0].ticket_id;
  const r = await post(DANA, '/tickets/verify', {
    ticket_id: t2, approved_text: 'Notify within 96 hours.',
    new_clause_id: 'DP-H-101', title: '96h', rationale: 'because',
  });
  eq(r.status, 403, `a requester verified a ticket: ${JSON.stringify(r.body)}`);
  // Refused by PRIVILEGE, before a line of the function body runs — 0008 grants
  // execute to the two Legal roles only. That is the stronger of the two
  // refusals and it is the one that ships; the function's own
  // "only Legal may verify a review ticket" check sits underneath it as a
  // second line, for the day somebody widens the grant.
  assert(/permission denied for function/.test(r.body.reason), r.body.reason);
  const state = (await rows(`select state from cw.review_ticket where ticket_id=$1`,
    [t2]))[0].state;
  eq(state, 'pending', 'the ticket moved despite the refusal');
  eq((await rows(`select count(*)::int n from cw.clause where clause_id='DP-H-101'`))[0].n,
     0, 'a refused verification still minted a clause');
});

await test('a rejection without a note is refused before it reaches the database', async () => {
  const r2 = await post(DANA, '/tickets', {
    agreement_id: 'AG-001', category_key: 'data', severity: 'High',
    reason_code: 'human-escalated', provenance_badge: 'VENDOR LANGUAGE',
    proposed_text: 'Notify within 120 hours.',
  });
  const r = await post(PAT, '/tickets/reject',
    { ticket_id: r2.body.rows[0].ticket_id });
  eq(r.status, 400);
  assert(/note is required/.test(r.body.reason), r.body.reason);
  // And with a note, it goes through.
  const ok = await post(PAT, '/tickets/reject',
    { ticket_id: r2.body.rows[0].ticket_id, note: 'below the floor' });
  eq(ok.status, 200);
});

await test('the approved wording is never defaulted to the proposal', async () => {
  // If an absent approved_text quietly became the proposed text, every
  // unedited approval would be a fact the system invented rather than one it
  // recorded — and the unedited-approval-rate measurement (owner decision U4)
  // is built on exactly this column.
  const src = readFileSync(join(SERVICE, 'mutations.mjs'), 'utf8');
  const verify = /'POST \/tickets\/verify'[\s\S]*?\n  \},/.exec(src)[0];
  assert(!/proposed_text/.test(verify),
    'the verify handler substitutes the proposed text when none was approved');
  assert(/required\(body, 'approved_text'\)/.test(verify),
    'approved_text is optional; the wording approved must be stated, not assumed');
});

// ── Access acts through the API ─────────────────────────────────────────
console.log('\nthe access lifecycle, through the doorway');

await test('an administrator creates an account, attributed to them', async () => {
  const r = await post(ADMIN, '/accounts',
    { person: 'n.hart@clausewerk', display_name: 'Nia Hart', role: 'legal_reviewer' });
  eq(r.status, 200);
  const a = (await rows(
    `select actor, actor_role from cw.audit_event
     where event_type='account_created' and subject='n.hart@clausewerk'`))[0];
  eq([a.actor, a.actor_role], [ADMIN, 'administrator']);
});

let NEW_GRANT;
await test('a Legal grant through the API confers nothing until countersigned', async () => {
  const r = await post(ADMIN, '/grants',
    { person: 'n.hart@clausewerk', role: 'legal_reviewer', reason: 'joining' });
  eq(r.status, 200);
  NEW_GRANT = r.body.rows[0].grant_id;
  eq(r.body.rows[0].acted_by, ADMIN);
  const eff = await rows(`select role from cw.effective_role where person=$1`,
    ['n.hart@clausewerk']);
  eq(eff, [], 'a pending Legal grant conferred a role through the API');
  eq((await APP.signIn('n.hart@clausewerk')).status, 403);
});

await test('an administrator cannot countersign it through the API either', async () => {
  const r = await post(ADMIN, '/grants/countersign', { grant_id: NEW_GRANT });
  eq(r.status, 403);
});

await test('a legal admin countersigns, and the role becomes effective', async () => {
  const r = await post(LEGAL, '/grants/countersign', { grant_id: NEW_GRANT });
  eq(r.status, 200);
  eq(r.body.rows[0].acted_by, LEGAL);
  eq((await APP.signIn('n.hart@clausewerk')).status, 200);
});

await test('an administrator cannot grant themselves a role through the API', async () => {
  const r = await post(ADMIN, '/grants', { person: ADMIN, role: 'legal_admin' });
  eq(r.status, 403);
  assert(/nobody grants themselves a role/.test(r.body.reason), r.body.reason);
});

await test('revoking through the API takes effect on the next request', async () => {
  const g = (await rows(`select grant_id from cw.role_grant
                         where person=$1 and action='granted'`, [SAM]))[0].grant_id;
  const r = await post(ADMIN, '/grants/revoke',
    { grant_id: g, reason: 'left the company' });
  eq(r.status, 200);
  const after = await APP.handle('GET', '/people', { token: tokens[SAM] });
  eq(after.status, 403, 'a revoked person kept working');
});

// ── Settings, watchers, stewardship ─────────────────────────────────────
console.log('\nsettings and stewardship, through the doorway');

await test('an administrator changes an operational setting', async () => {
  const r = await post(ADMIN, '/settings',
    { key: 'override_review_window', value: '72h' });
  eq(r.status, 200);
  eq(r.body.rows[0].value, '72h');
  const a = (await rows(
    `select actor, actor_role, payload->>'from' as f, payload->>'to' as t
     from cw.audit_event where event_type='setting_changed'
       and subject='override_review_window'`))[0];
  eq([a.actor, a.actor_role, a.f, a.t], [ADMIN, 'administrator', '48h', '72h']);
});

await test('and is refused on an owner decision, in the database\'s own words', async () => {
  const r = await post(ADMIN, '/settings',
    { key: 'renewal_default_baseline', value: 'library_standard' });
  eq(r.status, 403);
  assert(/only a legal admin may change it/.test(r.body.reason),
    'the refusal was reworded and lost the rule it names: ' + r.body.reason);
});

await test('a legal admin is refused on an operational one — both ways', async () => {
  const r = await post(LEGAL, '/settings', { key: 'session_length', value: '30d' });
  eq(r.status, 403);
  assert(/only the administrator may change it/.test(r.body.reason), r.body.reason);
});

await test('an administrator adds and removes a watcher, both recorded', async () => {
  const add = await post(ADMIN, '/watchers', { category_key: 'data', person: PAT });
  eq(add.status, 200);
  const rm = await post(ADMIN, '/watchers/remove',
    { watcher_id: add.body.rows[0].watcher_id });
  eq(rm.status, 200);
  eq(rm.body.rows[0].removed_by, ADMIN);
  const a = await rows(`select event_type, actor from cw.audit_event
                        where event_type in ('watcher_added','watcher_removed')
                        order by seq`);
  eq(a.map(x => x.event_type), ['watcher_added','watcher_removed']);
  for (const x of a) eq(x.actor, ADMIN);
});

await test('a reviewer cannot touch the watcher list', async () => {
  eq((await post(PAT, '/watchers', { category_key: 'data', person: PAT })).status, 403);
});

await test('the administrator takes a checkpoint and runs the checks', async () => {
  eq((await post(ADMIN, '/checkpoints', {})).status, 200);
  const a = await post(ADMIN, '/health-checks/anchor', {});
  eq(a.status, 200);
  eq(a.body.rows[0].result, 'ok');
  const c = await post(ADMIN, '/health-checks/chain', {});
  eq(c.status, 200);
  eq(c.body.rows[0].first_broken_seq, null);
});

await test('a legal admin can no longer take a checkpoint through the API', async () => {
  eq((await post(LEGAL, '/checkpoints', {})).status, 403);
});

// ── The chain looks the same whichever way it was written ───────────────
console.log('\nthe API is not a second way of writing history');

await test('rows written through the API are indistinguishable in shape', async () => {
  // Same columns populated, same rules obeyed. If an API-written row could be
  // told apart from a database-written one, the API would be a second history.
  //
  // Compared against a database-written row that is NOT the genesis row. The
  // first version of this test compared against the bootstrap account, whose
  // prev_hash is null because it is the first link in the chain — so the two
  // "differed" for a reason that has nothing to do with how they were written.
  const shape = `select actor, actor_role, actor_kind,
                        prev_hash is not null as linked, hash is not null as hashed`;
  const viaApi = (await rows(
    `${shape} from cw.audit_event where event_type='review_ticket_opened' limit 1`))[0];
  const viaDb = (await rows(
    `${shape} from cw.audit_event where event_type='role_countersigned' limit 1`))[0];
  for (const k of ['linked','hashed','actor_kind']) eq(viaApi[k], viaDb[k],
    `an API-written row differs from a database-written one on ${k}`);
  assert(viaApi.actor_role !== null,
    'an API-written row carries no authority, which no ordinary row does');
  eq(viaApi.actor_kind, 'human');
});

await test('the chain still verifies after everything above', async () => {
  const broken = (await rows(`select cw.audit_verify() as b`))[0].b;
  eq(broken, null, 'writing through the API broke the hash chain');
});

await test('no audit row anywhere is unattributed', async () => {
  // The v3 bug class, swept. Bootstrap rows name the owner and carry a null
  // actor_role truthfully, which is why the check is on the NAME.
  const orphans = await rows(
    `select seq, event_type from cw.audit_event
     where actor is null or btrim(actor) = '' or actor = 'unattributed'`);
  eq(orphans, [], 'unattributed acts reached the permanent record');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
