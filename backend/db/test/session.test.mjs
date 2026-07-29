// The session store, at the layer that actually enforces it.
//
// What is under test, in plain terms:
//   · only the sign-in act reaches the session table — not every viewer, even
//     though sign-in and a signed-in viewer arrive as the same database role;
//   · the name that policy trusts is a name no account can hold;
//   · what the table stores is a fingerprint of a session key, never the key,
//     so a copy of the table — a backup, a replica — is not a set of logins;
//   · every other role is refused outright.
//
// WHY THIS SUITE EXISTS AT ALL. Findings A-1, A-2 and A-3 were all found by
// READING migration 0032 and confirmed with throwaway probes. Nothing in either
// suite asserted what the policy on this table did, so the suite would not have
// caught any of them and would not catch their reintroduction. The Python side
// now covers the doorway's behaviour; this covers the database's, which is
// where the guarantee actually lives — a Python test cannot fail if somebody
// widens the policy and never touches Python.
//
// Every governed act runs as a REAL database role, for the reason roles.mjs
// gives: the owner bypasses row-level security and holds every privilege, so a
// gate tested as the owner is a gate nobody walked through.
//
// NOTHING HERE ASSERTS ON WORDING. Row counts, refusals and identity only.
//
//   node db/test/session.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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
async function refused(fn, msg) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  assert(threw, msg || 'expected a refusal, got none');
}

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const rows = async (s, p) => (await db.query(s, p)).rows;
const { queryAs, become, asOwner } = roleHelpers(db);

// The actor the session policy trusts. Mirrors LOOKUP_ACTOR in sessions.py; if
// these ever disagree, sign-in stops working and this suite says so.
const SIGNIN = '__signin__';
const fingerprint = key => createHash('sha256').update(key, 'utf8').digest('hex');

const LIVE = 9999999999;
const DEAD = 1000;

await db.exec(`select cw.bootstrap('owner@clausewerk','admin@clausewerk',
  'The Administrator','leah@clausewerk','Leah Legal','Legal');`);

await db.exec(`reset role;
  insert into cw.account (person, display_name, unit, role, created_by)
  values ('sam@clausewerk','Sam Reed','Supplier','viewer','admin@clausewerk')
  on conflict do nothing;`);

// A session belonging to the administrator, written the way sign-in writes one.
const plant = async (person, key, expiresAt = LIVE) => {
  await asOwner();
  await db.query(
    `insert into cw.session (token_sha256, person, expires_at)
     values ($1, $2, $3) on conflict (token_sha256) do nothing`,
    [fingerprint(key), person, expiresAt]);
};

// ── A-1 · only the sign-in act reaches the table ────────────────────────────

await test('sign-in can read the session it wrote', async () => {
  await plant('admin@clausewerk', 'signin-can-read');
  const seen = await queryAs('viewer',
    'select person from cw.session where token_sha256 = $1',
    [fingerprint('signin-can-read')], SIGNIN);
  eq(seen.length, 1, 'sign-in could not read its own session');
});

await test('an ordinary viewer reads no session at all', async () => {
  await plant('admin@clausewerk', 'not-for-the-supplier');
  const seen = await queryAs('viewer', 'select person from cw.session', [],
    'sam@clausewerk');
  eq(seen.length, 0, 'a signed-in viewer read live sessions');
});

await test('an ordinary viewer cannot sign everybody out', async () => {
  await plant('admin@clausewerk', 'survives-the-supplier');
  await queryAs('viewer', 'delete from cw.session', [], 'sam@clausewerk');
  await asOwner();
  const left = await rows('select count(*)::int as n from cw.session');
  assert(left[0].n > 0, 'a viewer deleted sessions belonging to other people');
});

await test('an ordinary viewer cannot mint a session for somebody else', async () => {
  await refused(() => queryAs('viewer',
    `insert into cw.session (token_sha256, person, expires_at)
     values ($1,'admin@clausewerk',${LIVE})`,
    [fingerprint('forged-by-a-viewer')], 'sam@clausewerk'),
    'a viewer minted a session for the administrator');
});

for (const role of ['requester', 'legal_reviewer', 'legal_admin', 'auditor',
                    'administrator']) {
  await test(`${role} is refused the session table outright`, async () => {
    await refused(() => queryAs(role, 'select person from cw.session'),
      `${role} could read the session table`);
  });
}

// ── A-1 · the name the policy trusts cannot be taken ────────────────────────

await test('no account may be created with the name the policy trusts', async () => {
  await refused(() => db.query(
    `insert into cw.account (person, display_name, unit, role, created_by)
     values ($1,'Forged','Supplier','viewer','admin@clausewerk')`, [SIGNIN]),
    'an account could take the name the session policy trusts');
});

await test('the reserved namespace does not touch an ordinary person', async () => {
  await asOwner();
  await db.query(
    `insert into cw.account (person, display_name, unit, role, created_by)
     values ('d.buyer@clausewerk','Dana Buyer','Procurement','requester',
             'admin@clausewerk') on conflict do nothing`);
  const seen = await rows(
    `select person from cw.account where person = 'd.buyer@clausewerk'`);
  eq(seen.length, 1, 'an ordinary email address was refused');
});

// ── A-2 · the table holds a fingerprint, not a key ──────────────────────────

await test('a raw session key is refused by the column', async () => {
  await refused(() => db.query(
    `insert into cw.session (token_sha256, person, expires_at)
     values ('a-raw-token-not-a-digest','admin@clausewerk',${LIVE})`),
    'a value that is not a digest was stored as a session key');
});

await test('what is stored does not match the key that was issued', async () => {
  await plant('leah@clausewerk', 'the-real-session-key');
  await asOwner();
  const held = await rows(
    `select token_sha256 from cw.session where person = 'leah@clausewerk'`);
  assert(held.length > 0, 'no row to check');
  for (const row of held)
    assert(row.token_sha256 !== 'the-real-session-key',
      'the session key is stored verbatim');
});

// ── A-3 · expiry is a property of the row, not of the sweep ─────────────────
//
// The doorway's predicate is tested on the Python side; what belongs here is
// that the column carrying it is real and usable, so a lookup CAN ask.

await test('an expired row is distinguishable from a live one by the row alone',
  async () => {
    await plant('admin@clausewerk', 'a-dead-one', DEAD);
    await plant('admin@clausewerk', 'a-live-one', LIVE);
    const live = await queryAs('viewer',
      `select token_sha256 from cw.session where expires_at > 2000`, [], SIGNIN);
    const keys = live.map(r => r.token_sha256);
    assert(keys.includes(fingerprint('a-live-one')), 'the live session was hidden');
    assert(!keys.includes(fingerprint('a-dead-one')),
      'an expired session was indistinguishable from a live one');
  });

// ── The table keeps its shape ───────────────────────────────────────────────

await test('a session must belong to a real person', async () => {
  await refused(() => db.query(
    `insert into cw.session (token_sha256, person, expires_at)
     values ($1,'nobody@clausewerk',${LIVE})`, [fingerprint('orphan')]),
    'a session was written for an account that does not exist');
});

await test('row level security is enabled on the table', async () => {
  await asOwner();
  const [row] = await rows(
    `select relrowsecurity from pg_class
      where oid = 'cw.session'::regclass`);
  eq(row.relrowsecurity, true, 'row level security is off on cw.session');
});

console.log(`\n${pass}/${pass + fail} session checks passed`);
if (fail) {
  console.log('\nfailures:');
  for (const [name, message] of failures) console.log(`  · ${name}: ${message}`);
  process.exit(1);
}
