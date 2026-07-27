// The audit hash chain — the thing every tamper-evidence claim rests on.
//
// Five defects are under test here, and each one had the same shape: the log
// looked trustworthy and was not. An honest database reported tampering because
// the reader's clock settings differed from the writer's. Rewriting who did
// something left no trace. Deleting the newest events left no trace. Two rows
// could claim the same parent. And any requester could read every rival buyer's
// concession events straight out of the log.
//
// Every protection below that is a policy or a grant is exercised AS THE REAL
// ROLE, on the write path — see roles.mjs for why that distinction matters.
//
//   node db/test/audit-chain.test.mjs

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
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

// Several of these tests deliberately damage the log, so they each get their own
// database rather than leaving wreckage for the next test to trip over.
async function fresh() {
  const db = await PGlite.create();
  for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  return db;
}
const one = async (db, sql) => (await db.query(sql)).rows[0];

// ════════════════════════════════════════════════════════════════════════════
// 1 · The pre-image is session-independent  (WP-03a)
// ════════════════════════════════════════════════════════════════════════════
// The old chain hashed the timestamp as TEXT, and text renders through the
// session's TimeZone and DateStyle. So a perfectly honest log accused itself of
// tampering the moment somebody read it from a different machine.
//
// This test is written to be able to fail. It fixes the WRITER's settings
// explicitly, then for each reader setting asserts (i) the setting really did
// change and (ii) the timestamp really does render differently — so the test
// cannot pass by accidentally reading under the same settings it wrote under.

console.log('\nthe chain does not depend on the reader\'s session settings (WP-03a)');

const WRITER_TZ = 'Etc/GMT+6';
const WRITER_DS = 'ISO, MDY';

const dbA = await fresh();
await dbA.exec(`
  set timezone = '${WRITER_TZ}';
  set datestyle = '${WRITER_DS}';
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','writer@cw',false);
  select cw.audit('probe_one','S-1','{"n":1}'::jsonb);
  select cw.audit('probe_two','S-2','{"n":2}'::jsonb);
  select cw.audit('probe_three','S-3','{"n":3}'::jsonb);`);

const writerRender = (await one(dbA, `select ts::text as t from cw.audit_event order by seq limit 1`)).t;

await test('the honest chain verifies clean under the writer\'s own settings', async () => {
  const r = await one(dbA, `select cw.audit_verify() as broken`);
  eq(r.broken, null, 'a chain nobody touched must report no break');
});

for (const tz of ['UTC', 'America/New_York', 'Asia/Kolkata']) {
  await test(`an honest chain verifies clean whatever the session timezone (${tz})`, async () => {
    await dbA.exec(`set timezone = '${tz}'; set datestyle = '${WRITER_DS}';`);
    const now = await one(dbA, `select current_setting('TimeZone') as tz,
                                       (select ts::text from cw.audit_event order by seq limit 1) as t`);
    assert(now.tz !== WRITER_TZ,
      `the reading session is still on the writer's timezone (${now.tz}) — this test proves nothing`);
    assert(now.t !== writerRender,
      `the timestamp renders identically under ${tz} — this test proves nothing`);
    const r = await one(dbA, `select cw.audit_verify() as broken`);
    eq(r.broken, null, `reading at ${tz} accused an honest log of tampering`);
  });
}

for (const ds of ['SQL, DMY', 'Postgres, DMY', 'German, DMY']) {
  await test(`an honest chain verifies clean whatever the session date style (${ds})`, async () => {
    await dbA.exec(`set timezone = '${WRITER_TZ}'; set datestyle = '${ds}';`);
    const now = await one(dbA, `select current_setting('DateStyle') as ds,
                                       (select ts::text from cw.audit_event order by seq limit 1) as t`);
    assert(now.ds !== WRITER_DS,
      `the reading session is still on the writer's date style (${now.ds}) — this test proves nothing`);
    assert(now.t !== writerRender,
      `the timestamp renders identically under "${ds}" — this test proves nothing`);
    const r = await one(dbA, `select cw.audit_verify() as broken`);
    eq(r.broken, null, `reading with DateStyle "${ds}" accused an honest log of tampering`);
  });
}

await dbA.exec(`set timezone = '${WRITER_TZ}'; set datestyle = '${WRITER_DS}';`);

// ════════════════════════════════════════════════════════════════════════════
// 2 · Every writing role can still write, and reads are scoped  (WP-03c)
// ════════════════════════════════════════════════════════════════════════════
// The trap: turning on row-level security with only a SELECT policy silently
// breaks every audited write in the product, because the audit writer inserts as
// whoever called it. These tests run as the real database roles, so a missing
// INSERT policy shows up here rather than in production.

console.log('\nrow-level security does not break the people doing the work (WP-03c)');

const rolesA = roleHelpers(dbA);

for (const role of ['requester', 'legal_reviewer', 'legal_admin']) {
  await test(`every writing role can still record an audited act (${role})`, async () => {
    await rolesA.mustWrite(role,
      `select cw.audit('role_probe','S-${role}','{"who":"${role}"}'::jsonb)`,
      undefined, `${role}@cw`);
  });
}

await test('a requester cannot read another actor\'s audit payload', async () => {
  // Two requesters, two different buyers. Each writes; neither may read the
  // other. This is the hole the concession table's own policy already closes —
  // it was simply wide open one table over.
  await rolesA.mustWrite('requester',
    `select cw.audit('concession_recorded','AG-001','{"gave_away":"uncapped liability"}'::jsonb)`,
    undefined, 'buyer-a@cw');

  const seen = await rolesA.queryAs('requester',
    `select subject, payload, actor from cw.audit_event where subject = 'AG-001'`,
    undefined, 'buyer-b@cw');
  eq(seen.length, 0, 'a rival buyer read the concession event out of the audit log');

  const own = await rolesA.queryAs('requester',
    `select subject from cw.audit_event where subject = 'AG-001'`,
    undefined, 'buyer-a@cw');
  eq(own.length, 1, 'a requester must still be able to read their own record');
});

await test('an auditor can read everything', async () => {
  const total = (await one(dbA, `select count(*)::int as n from cw.audit_event`)).n;
  const seen = await rolesA.queryAs('auditor', `select count(*)::int as n from cw.audit_event`);
  eq(seen[0].n, total, 'the auditor is the one role that must see the whole record');
});

await test('a viewer still cannot read the audit log at all', async () => {
  const how = await rolesA.mustNotWrite('viewer', `select * from cw.audit_event limit 1`);
  eq(how, 'raised', 'a viewer must be refused outright — the log names who conceded what');
});

await test('a scoped role gets a clean verify', async () => {
  // cw.audit_verify() must not walk the caller's filtered view. A requester can
  // see only their own rows, so an invoker-rights verifier reports tampering at
  // the first row they are not allowed to see — on a completely honest database.
  const r = await rolesA.queryAs('requester', `select cw.audit_verify() as broken`, undefined, 'buyer-a@cw');
  eq(r[0].broken, null, 'an honest log reported tampering to a scoped role');
});

// ════════════════════════════════════════════════════════════════════════════
// 3 · Rewriting who did something is detected  (WP-03a)
// ════════════════════════════════════════════════════════════════════════════

console.log('\nthe role on a past event cannot be rewritten unnoticed (WP-03a)');

const dbB = await fresh();
await dbB.exec(`
  select set_config('cw.role','requester',false);
  select set_config('cw.actor','buyer@cw',false);
  select cw.audit('override_requested','AG-100','{"why":"speed"}'::jsonb);
  select cw.audit('override_requested','AG-101','{"why":"speed"}'::jsonb);
  select set_config('cw.role','legal_admin',false);
  select cw.audit('override_granted','AG-100','{}'::jsonb);`);

await test('the seeded chain starts clean', async () => {
  const r = await one(dbB, `select cw.audit_verify() as broken`);
  eq(r.broken, null);
});

await test('rewriting actor_role on a past event is detected', async () => {
  // Simulated attack below the application: promote a requester's own act into
  // something legal signed off on. Nobody holds UPDATE on this table, so this is
  // the database owner acting, which is exactly the actor the chain exists to
  // catch after the fact.
  await dbB.exec(`update cw.audit_event set actor_role = 'legal_admin' where seq = 1`);
  const r = await one(dbB, `select cw.audit_verify() as broken`);
  eq(Number(r.broken), 1, 'a rewritten role must break the chain at the row it was rewritten on');
});

// ════════════════════════════════════════════════════════════════════════════
// 4 · Removing the newest events is caught by the anchor  (WP-03b)
// ════════════════════════════════════════════════════════════════════════════

console.log('\nremoving the newest events is caught by the anchor (WP-03b)');

const dbC = await fresh();
await dbC.exec(`
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','legal@cw',false);
  select cw.audit('e1','S-1','{}'::jsonb);
  select cw.audit('e2','S-2','{}'::jsonb);
  select cw.audit('e3','S-3','{}'::jsonb);
  select cw.audit('e4','S-4','{}'::jsonb);`);

await test('before a checkpoint is taken the anchor says so, not "ok"', async () => {
  const r = await one(dbC, `select cw.audit_anchor_check() as status`);
  eq(r.status, 'no checkpoint', '"we have not looked" must not be reported as "it is fine"');
});

await test('a checkpoint over an intact log reports ok', async () => {
  await dbC.exec(`select cw.audit_checkpoint_take()`);
  const r = await one(dbC, `select cw.audit_anchor_check() as status`);
  eq(r.status, 'ok');
});

await test('the hash chain alone cannot see a truncated tail', async () => {
  // This is why the anchor exists. What is left after the newest rows are cut
  // off is a shorter chain that still adds up perfectly.
  await dbC.exec(`delete from cw.audit_event where seq >= 3`);
  const r = await one(dbC, `select cw.audit_verify() as broken`);
  eq(r.broken, null, 'if this ever reports a break, the anchor is no longer load-bearing');
});

await test('truncating the newest events is caught by the anchor', async () => {
  const r = await one(dbC, `select cw.audit_anchor_check() as status`);
  assert(String(r.status).startsWith('anchor broken'),
    `the anchor missed a truncated tail — it said "${r.status}"`);
});

// ════════════════════════════════════════════════════════════════════════════
// 5 · The log cannot be forked  (WP-03b)
// ════════════════════════════════════════════════════════════════════════════
// A fork cannot be produced by an ordinary insert, because prev_hash is assigned
// by the trigger. So this test attacks the way a real attacker would have to:
// from below the application, with the trigger switched off. That is a
// structural test of the unique index, which is the actual guarantee.

console.log('\nthe log cannot be forked into two futures (WP-03b)');

const dbD = await fresh();
await dbD.exec(`
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','legal@cw',false);
  select cw.audit('f1','S-1','{}'::jsonb);
  select cw.audit('f2','S-2','{}'::jsonb);
  select cw.audit('f3','S-3','{}'::jsonb);
  alter table cw.audit_event disable trigger audit_chain_before_insert;`);

const parent = (await one(dbD, `select hash from cw.audit_event order by seq limit 1`)).hash;

async function refused(fn, what) {
  let threw = false, msg = '';
  try { await fn(); } catch (e) { threw = true; msg = String(e.message); }
  assert(threw, `${what} was accepted — the log now has two futures`);
  assert(msg.includes('audit_no_fork'),
    `${what} was refused, but not by the fork guard: ${msg}`);
}

await test('a forked append is refused', async () => {
  // Row 2 already claims this parent. A second child of the same parent is a
  // fork, and a verifier faced with two branches is choosing, not verifying.
  await refused(() => dbD.exec(
    `insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject, prev_hash, hash)
     values ('attacker','legal_admin','human','f2_rewritten','S-2','${parent}','deadbeef')`),
    'a second child of the same parent');
});

await test('a second genesis row is refused', async () => {
  // Without `nulls not distinct` anyone could start a rival chain from scratch
  // alongside the real one, since NULLs never collide by default.
  await refused(() => dbD.exec(
    `insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject, prev_hash, hash)
     values ('attacker','legal_admin','human','rival_genesis',null,null,'cafebabe')`),
    'a second genesis row');
});

await dbD.exec(`alter table cw.audit_event enable trigger audit_chain_before_insert;`);

await test('legitimate appends still work after all of that', async () => {
  await dbD.exec(`select cw.audit('f4','S-4','{}'::jsonb)`);
  const r = await one(dbD, `select cw.audit_verify() as broken`);
  eq(r.broken, null, 'the fork guard must not stand in the way of ordinary work');
});

// ── seq comes from the trigger, not the column default (0021) ───────────────
// THE ONE PART OF 0021 THIS REPOSITORY CAN PROVE.
//
// The defect it fixes needs two writers at once, and PGlite is
// single-connection, so nothing here can watch the race. But the MECHANISM is
// testable alone, and it is the whole of the fix: `seq` must be assigned inside
// cw.audit_chain() — under the advisory lock — rather than by the bigserial
// default, which PostgreSQL evaluates BEFORE the trigger fires and therefore
// outside the lock.
//
// Push the sequence far ahead of the table and append. If seq still comes from
// the default, the row lands at the sequence's number. If it comes from the
// trigger, it lands at max+1 and the default's value is discarded — which is
// what makes sequence order and append order the same thing again under
// concurrency.
await test('the sequence number is assigned under the lock, not by the default', async () => {
  const before = await one(dbD, `select max(seq)::int as m from cw.audit_event`);
  await dbD.exec(`select setval('cw.audit_event_seq_seq', ${before.m + 5000})`);
  await dbD.exec(`select cw.audit('f5','S-5','{}'::jsonb)`);
  const after = await one(dbD,
    `select seq::int as s from cw.audit_event order by seq desc limit 1`);
  eq(after.s, before.m + 1,
    'the row took the column default rather than its place in the append order — ' +
    'seq is being allocated outside the advisory lock, which is the 0021 defect');
});

await test('and the chain still verifies after that', async () => {
  // Because the point of assigning seq is to keep the thing the verifier walks
  // and the thing the chain links in the same order.
  const r = await one(dbD, `select cw.audit_verify() as broken`);
  eq(r.broken, null, 'assigning seq in the trigger broke the chain it exists to keep straight');
});

// ── Result ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
