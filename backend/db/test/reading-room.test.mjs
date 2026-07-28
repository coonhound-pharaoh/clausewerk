// The sharing act and the reading room — migration 0017 (WP-U14, read models).
// It shipped as 0016 and was renumbered when the Python doorway's own 0016
// collided with it; the header of the migration says why it moved and not that.
//
// WHAT THIS SUITE IS ACTUALLY ABOUT. Until 0017 a viewer could read EVERY signed
// contract in the system. Not the ones they had been shown — all of them. The
// role was created by ADR-0008 so a contract could be shown to somebody for
// socialisation without letting them change it, and the "shown to" half was
// never built: nothing anywhere recorded who had been shown what.
//
// So this is not a screen's read model. It is a control that was missing, found
// by asking what the reading room would have to read from.
//
// The rule, from WP-U14's critical anti-pattern: the viewer's render must never
// come through anything broader than "this share, this person" — enforced in the
// policy, because a careful query is one endpoint away from a careless one.
//
//   node db/test/reading-room.test.mjs

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
const SAM = 's.reed@cw';      // a viewer who gets shown one agreement
const KIM = 'k.other@cw';     // a viewer who gets shown nothing

await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
await execAs('administrator', `
  insert into cw.account (person,display_name,role,created_by) values
    ('${PAT}','Pat','legal_reviewer','${ADMIN}'),
    ('${DANA}','Dana','requester','${ADMIN}'),
    ('${SAM}','Sam','viewer','${ADMIN}'),
    ('${KIM}','Kim','viewer','${ADMIN}')`, ADMIN);
await execAs('administrator', `
  insert into cw.role_grant (action,person,role) values
    ('granted','${PAT}','legal_reviewer'), ('granted','${DANA}','requester'),
    ('granted','${SAM}','viewer'), ('granted','${KIM}','viewer')`, ADMIN);
await execAs('legal_admin', `
  insert into cw.role_grant (action,person,role,grant_ref)
  select 'countersigned','${PAT}','legal_reviewer',grant_id from cw.role_grant
   where person='${PAT}' and action='granted'`, LEGAL);

// Two signed agreements, so "shared" can be told from "all of them".
await db.exec(`
  select set_config('cw.actor','installer@cw',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.clause (clause_id,category_key,severity) values ('DP-H-014','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on,reviewer)
    values ('DP-H-014',1,'24h','Notify within 24 hours.','2025-01-01','2030-01-01','R. Vance');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-1','Northwind','${DANA}'), ('AG-2','Contoso','${DANA}');
  insert into cw.snapshot (snapshot_id) values ('${'1'.repeat(64)}');
  insert into cw.ruleset (ruleset_id) values ('${'2'.repeat(64)}');
  insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,snapshot_id,
                      ruleset_id,result_hash,engine_version,gate_open,created_by) values
    ('RUN-1','AG-1','Northwind','{}','manual','${'1'.repeat(64)}','${'2'.repeat(64)}',
     '${'a'.repeat(64)}','1.0.0',true,'${DANA}'),
    ('RUN-2','AG-2','Contoso','{}','manual','${'1'.repeat(64)}','${'2'.repeat(64)}',
     '${'b'.repeat(64)}','1.0.0',true,'${DANA}');
  insert into cw.run_decision (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-1',0,'data','High','DP-H-014',1,'Matched High variant');
  insert into cw.executed_agreement (agreement_id,run_id,executed_on,effective_on) values
    ('AG-1','RUN-1','2026-01-01','2026-01-01'),
    ('AG-2','RUN-2','2026-01-01','2026-01-01');
  insert into cw.executed_document
    (agreement_id,doc_seq,kind,filename,byte_size,sha256,storage_uri,signed_on) values
    ('AG-1',0,'agreement','ag1.docx',1024,'${'c'.repeat(64)}','store://1','2026-01-01'),
    ('AG-2',0,'agreement','ag2.docx',1024,'${'d'.repeat(64)}','store://2','2026-01-01');
  select set_config('cw.actor','',false);`);

// ── The hole this closes ─────────────────────────────────────────────────
console.log('\na viewer sees what was shared with them, and nothing else');

await test('before any share, a viewer sees NO signed agreement at all', async () => {
  // This is the assertion that used to be the opposite. It is the whole point
  // of the migration: the viewer role was a hole, not a control.
  const seen = await queryAs('viewer',
    `select agreement_id from cw.executed_agreement`, [], SAM);
  eq(seen, [], 'a viewer can read signed agreements nobody shared with them');
  const docs = await queryAs('viewer',
    `select count(*)::int n from cw.executed_document`, [], SAM);
  eq(docs[0].n, 0, 'the documents are reachable even when the agreement is not');
});

let SHARE;
await test('a legal reviewer shares one, with a stated purpose', async () => {
  const r = await mustWrite('legal_reviewer',
    `insert into cw.agreement_share
       (agreement_id, shared_with, shared_by, shared_at, purpose)
     values ('AG-1', '${SAM}', 'impostor@clausewerk',
             '2000-01-01T00:00:00Z',
             'socialising the data-privacy terms')
     returning share_id, shared_by,
       shared_at > now() - interval '1 minute' and shared_at <= now()
         as shared_time_is_fresh`, [], PAT);
  SHARE = r[0].share_id;
  eq(r[0].shared_by, PAT, 'the share does not name who made it');
  eq(r[0].shared_time_is_fresh, true,
    'the caller-supplied share timestamp survived');
});

await test('the share is on the chain, naming who and why', async () => {
  const e = await one(`select actor, actor_role, subject,
                              payload->>'with' as who, payload->>'purpose' as why
                       from cw.audit_event where event_type='agreement_shared'`);
  eq([e.actor, e.actor_role, e.subject, e.who], [PAT, 'legal_reviewer', 'AG-1', SAM]);
  assert(e.why, 'the purpose is not recorded, so nobody can review the share later');
});

await test('now the viewer sees that agreement — and still only that one', async () => {
  const seen = await queryAs('viewer',
    `select agreement_id from cw.executed_agreement order by agreement_id`, [], SAM);
  eq(seen.map(r => r.agreement_id), ['AG-1'],
    'one share opened more than the agreement it named');
  const docs = await queryAs('viewer',
    `select agreement_id from cw.executed_document order by agreement_id`, [], SAM);
  eq(docs.map(r => r.agreement_id), ['AG-1']);
});

await test('a different viewer still sees nothing', async () => {
  const seen = await queryAs('viewer',
    `select agreement_id from cw.executed_agreement`, [], KIM);
  eq(seen, [], 'a share with one person opened the agreement to another');
});

await test('a viewer cannot probe another person’s sharing status', async () => {
  const own = await queryAs('viewer',
    `select cw.is_shared_with('AG-1',$1) as shared`, [SAM], SAM);
  eq(own[0].shared, true, 'the shared viewer lost their own access check');
  const probed = await queryAs('viewer',
    `select cw.is_shared_with('AG-1',$1) as shared`, [SAM], KIM);
  eq(probed[0].shared, false,
    'an unshared viewer learned another person’s sharing relationship');
  const owner = await queryAs('requester',
    `select cw.is_shared_with('AG-1',$1) as shared`, [SAM], DANA);
  eq(owner[0].shared, true, 'the deal owner lost their sharing-status view');
});

await test('the certificate and signatories follow the same rule', async () => {
  // Four tables carry the signed contract. Narrowing one and forgetting the
  // others would leave the render reachable by another route, which is exactly
  // the shape of the anti-pattern.
  for (const t of ['signature_certificate', 'executed_signatory']) {
    const kim = await queryAs('viewer', `select count(*)::int n from cw.${t}`, [], KIM);
    eq(kim[0].n, 0, `a viewer with no share can read cw.${t}`);
  }
});

// ── The reading room ─────────────────────────────────────────────────────
console.log('\nthe reading room, and what it shows');

await test('the reading room lists the share with its purpose', async () => {
  const r = await queryAs('viewer',
    `select agreement_id, counterparty, purpose, shared_by from cw.reading_room`,
    [], SAM);
  eq(r.length, 1);
  eq([r[0].agreement_id, r[0].counterparty, r[0].shared_by], ['AG-1', 'Northwind', PAT]);
  assert(/socialising/.test(r[0].purpose));
});

await test('the viewer sees each clause with its origin and approver', async () => {
  // The one place a viewer sees an approval. Being shown a contract is useless
  // if you cannot see whose language it is.
  const c = await queryAs('viewer',
    `select clause_id, version, reviewer, origin, provenance
     from cw.reading_room_clause`, [], SAM);
  eq(c.length, 1);
  eq([c[0].clause_id, c[0].reviewer], ['DP-H-014', 'R. Vance']);
  assert(c[0].origin, 'the clause origin is not shown, which is the one thing '
    + 'a socialisation audience needs to judge what they are reading');
});

await test('an unshared viewer\'s reading room is empty, not refused', async () => {
  // Empty rather than an error: they have been shown nothing, which is a fact
  // about their situation and not a fault.
  const r = await queryAs('viewer', `select count(*)::int n from cw.reading_room`,
    [], KIM);
  eq(r[0].n, 0);
  const c = await queryAs('viewer', `select count(*)::int n from cw.reading_room_clause`,
    [], KIM);
  eq(c[0].n, 0, 'the clause view reaches past the agreement policy');
});

// ── Who may share ────────────────────────────────────────────────────────
console.log('\nsharing is a Legal act');

await test('a requester cannot share their own deal with whoever they like', async () => {
  // The socialisation audience exists because somebody decided who should see
  // it. "The person who wants the override picks the audience" is not that.
  await mustNotWrite('requester',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-2','${KIM}','because I would like them to see it')`);
});

await test('a viewer cannot share anything, including what they were shown', async () => {
  await mustNotWrite('viewer',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-1','${KIM}','passing it along')`);
});

await test('an administrator cannot share either — it is a content judgement', async () => {
  await mustNotWrite('administrator',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-2','${KIM}','helping out')`);
});

await test('a share names an account, not a free-text address', async () => {
  await throws(() => queryAs('legal_admin',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-2','someone@elsewhere.com','external review')`, [], LEGAL),
    'violates foreign key',
    'a contract can be shared with somebody the system does not know');
});

await test('a share must say why', async () => {
  for (const bad of ['', '   ', 'fyi']) {
    await throws(() => queryAs('legal_admin',
      `insert into cw.agreement_share (agreement_id, shared_with, purpose)
       values ('AG-2','${KIM}',$1)`, [bad], LEGAL),
      'a_purpose_is_not_blank', `"${bad}" was accepted as a purpose`);
  }
});

await test('the same agreement is not shared with the same person twice', async () => {
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-1','${SAM}','again, for some reason')`, [], PAT),
    'duplicate key',
    'a second live share is a second row to revoke, and somebody will revoke one '
    + 'and believe they are done');
});

// ── Unsharing ────────────────────────────────────────────────────────────
await test('share evidence cannot be rewritten instead of revoked', async () => {
  await throws(() => queryAs('legal_reviewer',
    `update cw.agreement_share
        set shared_with = '${KIM}',
            shared_by = 'impostor@clausewerk',
            shared_at = '2000-01-01T00:00:00Z',
            purpose = 'a different explanation'
      where share_id = ${SHARE}`, [], PAT),
    'evidence is immutable',
    'Legal rewrote who could see an agreement, why, and the sharing provenance');
  const r = await one(
    `select shared_with, shared_by, purpose,
            shared_at > now() - interval '1 minute' as shared_at_is_original
       from cw.agreement_share where share_id = ${SHARE}`);
  eq([r.shared_with, r.shared_by, r.shared_at_is_original],
    [SAM, PAT, true]);
  assert(/socialising/.test(r.purpose), 'the recorded sharing purpose was rewritten');
});

console.log('\nunsharing is recorded, and the reach closes');

await test('revoking a share closes the viewer\'s access', async () => {
  await mustWrite('legal_admin',
    `update cw.agreement_share
        set revoked_by = 'impostor@clausewerk',
            revoked_at = '2099-01-01T00:00:00Z'
      where share_id = ${SHARE}
      returning share_id, revoked_by,
        revoked_at > now() - interval '1 minute' and revoked_at <= now()
          as revoked_time_is_fresh`, [], LEGAL)
    .then(r => {
      eq(r[0].revoked_by, LEGAL,
        'the caller-supplied revoker entered the permanent share record');
      eq(r[0].revoked_time_is_fresh, true,
        'the caller-supplied revocation timestamp survived');
    });
  const seen = await queryAs('viewer',
    `select agreement_id from cw.executed_agreement`, [], SAM);
  eq(seen, [], 'a revoked share still opens the agreement');
});

await test('and it is on the chain', async () => {
  const e = await one(`select subject, payload->>'with' as who,
                              payload->>'by' as revoked_by
                       from cw.audit_event where event_type='agreement_unshared'`);
  eq([e.subject, e.who], ['AG-1', SAM]);
  eq(e.revoked_by, LEGAL, 'the caller-supplied revoker entered the audit chain');
});

await test('the row survives — that they COULD see it does not stop being true', async () => {
  const r = await one(`select count(*)::int n from cw.agreement_share
                       where share_id = ${SHARE}`);
  eq(r.n, 1);
  await throws(() => db.exec(`delete from cw.agreement_share where share_id=${SHARE}`),
    'revoked, never deleted');
});

await test('a revoked share cannot be rewritten', async () => {
  await throws(() => queryAs('legal_admin',
    `update cw.agreement_share
        set revoked_by = '${PAT}', revoked_at = now()
      where share_id = ${SHARE}`, [], LEGAL),
    'was revoked and cannot be rewritten',
    'a revoked share still accepted edits to its permanent evidence');
});

await test('the same agreement can be shared again afterwards', async () => {
  await mustWrite('legal_reviewer',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-1','${SAM}','re-shared for the renewal conversation')
     returning share_id`, [], PAT);
  const seen = await queryAs('viewer',
    `select agreement_id from cw.executed_agreement`, [], SAM);
  eq(seen.map(r => r.agreement_id), ['AG-1']);
});

// ── Who can read the sharing record ──────────────────────────────────────
console.log('\nwho was shown what is part of the access story');

await test('the auditor reads every share', async () => {
  const r = await queryAs('auditor', `select count(*)::int n from cw.agreement_share`);
  assert(r[0].n >= 2, 'the auditor cannot read the sharing record');
});

await test('a viewer reads their own shares and nobody else\'s', async () => {
  await execAs('legal_admin',
    `insert into cw.agreement_share (agreement_id, shared_with, purpose)
     values ('AG-2','${KIM}','a second audience for the other deal')`, LEGAL);
  const sam = await queryAs('viewer',
    `select distinct shared_with from cw.agreement_share`, [], SAM);
  eq(sam.map(r => r.shared_with), [SAM]);
});

await test('nobody holds an export path on the viewer\'s surface', async () => {
  // ADR-0008 gave the viewer no export deliberately: the reading room shows a
  // contract to somebody outside the deal, and letting them take a copy away is
  // a different act nobody decided. Convenience does not amend an ADR, so there
  // is nothing here for a future export button to call.
  const writes = [];
  for (const priv of ['INSERT','UPDATE','DELETE']) {
    for (const t of ['executed_agreement','executed_document','agreement_share']) {
      if ((await one(`select has_table_privilege('cw_viewer', $1, $2) as h`,
        [`cw.${t}`, priv])).h) writes.push(`${t} ${priv}`);
    }
  }
  eq(writes, [], 'the viewer holds a write on the reading room\'s tables');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
