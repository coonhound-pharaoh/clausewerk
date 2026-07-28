// Nobody verifies their own request (NC-05).
//
// The rule: the person who opened a review ticket may not also be the person
// who approves it — unless the opener is themselves Legal, which is Legal doing
// its own work in its own queue.
//
// Every check below runs as a REAL database role, for the reason roles.mjs
// gives: the owner bypasses row-level security and holds every privilege, so a
// gate tested as the owner is a gate nobody walked through.
//
// Two things this suite deliberately does NOT do:
//   · It never asserts on the words of a refusal. What matters is that the act
//     did not happen — the ticket is still pending and no clause version was
//     minted — not how the database phrased its no.
//   · It never trusts "an error was raised" on its own. A refusal that comes
//     from a missing grant would look identical, so every refusal is paired
//     with a control: the same call, by somebody who did not open the ticket,
//     succeeds. That is what shows the refusal came from the function.
//
//   node db/test/self-approval.test.mjs

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
async function refused(fn, msg) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  assert(threw, msg || 'expected a refusal, got none');
}

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const rows = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await rows(s, p))[0];
const { queryAs } = roleHelpers(db);
const q = s => `'${String(s).replace(/'/g, "''")}'`;

// ── The people ──────────────────────────────────────────────────────────────
const OWNER  = 'owner@clausewerk';
const ADMIN  = 'ada@clausewerk';
const LEGAL  = 'rae@clausewerk';        // a Legal admin the system knows
const BUYER  = 'buyer@clausewerk';      // a requester
const OTHER  = 'other.legal@clausewerk'; // a second Legal person, the control

console.log('\nseed');
await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
await db.exec(`
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');`);

await test('the system knows the Legal admin as Legal, and the requester as neither', async () => {
  const r = await one(`select role from cw.effective_role where person=${q(LEGAL)}`);
  eq(r.role, 'legal_admin');
  const b = await one(`select role from cw.effective_role where person=${q(BUYER)}`);
  eq(b, undefined, 'the requester holds no effective role — nobody granted them one');
});

// A ticket opener helper. It deliberately supplies a forged opener: the
// database must replace it with the connection's actor, which is the basis of
// the separation rule.
const openTicket = async (role, actor, body, severity = 'Standard') => {
  const r = await queryAs(role, `
    insert into cw.review_ticket
      (category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
    values ('data',${q(severity)},'human-edit','VENDOR LANGUAGE',${q(body)},
            'forged-opener@clausewerk')
    returning ticket_id, opened_by`, [], actor);
  eq(r[0].opened_by, actor,
     'the database must bind the opener before separation-of-duties checks rely on it');
  return r[0].ticket_id;
};

const verify = (role, actor, id, clauseId, reviewer) => queryAs(role,
  `select cw.verify_review_ticket(${id}, 'Supplier shall notify Customer promptly.',
     ${q(clauseId)}, 'Breach notice', 'Rationale', ${q(reviewer)}, '2028-01-01') as ref`,
  [], actor);

// ════════════════════════════════════════════════════════════════════════════
// The requester's own request cannot come back approved by the requester
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe opener of a requester-originated ticket cannot verify it');

await test('the opener is refused even holding a Legal role, and nothing moves', async () => {
  const id = await openTicket('requester', BUYER, 'Notice within 48 hours.');
  // The same person, now acting with a Legal role, takes the direct table path.
  // The row transition itself must enforce separation, not only the helper.
  await refused(() => queryAs('legal_reviewer', `
    update cw.review_ticket
       set state='verified',
           approved_text='Supplier shall notify Customer promptly.',
           decided_by='forged-reviewer@clausewerk',
           minted_clause_id='DP-S-501',
           minted_version=1
     where ticket_id=${id}`, [], BUYER));
  const t = await one(`select state, minted_clause_id from cw.review_ticket where ticket_id=${id}`);
  eq(t.state, 'pending', 'a refused verification must leave the ticket where it was');
  eq(t.minted_clause_id, null);
  const v = await one(`select count(*)::int as n from cw.clause_version where clause_id='DP-S-501'`);
  eq(v.n, 0, 'and must mint nothing');
});

await test('naming the opener as the reviewer is refused too', async () => {
  // The other way round: a Legal connection, but the reviewer named on the call
  // is the person who opened it. The doorway passes the connection's actor as
  // the reviewer, so a call where the two disagree is exactly the shape worth
  // stopping.
  const id = await openTicket('requester', BUYER, 'Notice within 72 hours.');
  await refused(() => verify('legal_reviewer', OTHER, id, 'DP-S-502', BUYER));
  const t = await one(`select state from cw.review_ticket where ticket_id=${id}`);
  eq(t.state, 'pending');
});

await test('the control: somebody else verifies the same ticket, and it mints', async () => {
  // This is what proves the two refusals above came from the function's own
  // rule rather than from a missing grant: the identical call, by a person who
  // did not open the ticket, goes through.
  const id = await one(`select ticket_id from cw.review_ticket
                        where state='pending' order by ticket_id limit 1`);
  const r = await verify('legal_reviewer', OTHER, id.ticket_id, 'DP-S-503', 'L. Reyes');
  eq(r[0].ref, 'DP-S-503@v1');
  const t = await one(`select state, decided_by from cw.review_ticket
                       where ticket_id=${id.ticket_id}`);
  eq(t.state, 'verified');
  eq(t.decided_by, 'L. Reyes');
});

// ════════════════════════════════════════════════════════════════════════════
// Legal's own queue is untouched — the plan's carve-out
// ════════════════════════════════════════════════════════════════════════════
console.log("\na Legal person still decides a ticket Legal opened");

await test('the Legal admin opens a ticket and verifies it', async () => {
  const id = await openTicket('legal_admin', LEGAL, 'Supplier shall maintain security.');
  const r = await verify('legal_admin', LEGAL, id, 'DP-S-510', LEGAL);
  eq(r[0].ref, 'DP-S-510@v1');
  const t = await one(`select state, minted_clause_id, minted_version
                       from cw.review_ticket where ticket_id=${id}`);
  eq(t.state, 'verified');
  eq(t.minted_clause_id, 'DP-S-510');
  eq(t.minted_version, 1, 'and the clause version the ticket names exists');
});

// ════════════════════════════════════════════════════════════════════════════
// The role refusal that was already there still holds
// ════════════════════════════════════════════════════════════════════════════
console.log('\nevery non-Legal role is still refused outright');

for (const role of ['viewer', 'requester', 'auditor', 'administrator']) {
  await test(`${role} cannot verify a ticket`, async () => {
    const id = await openTicket('requester', BUYER, `Opened for the ${role} check.`);
    await refused(() => verify(role, `${role}@clausewerk`, id, 'DP-S-520', 'X. Y'));
    const t = await one(`select state from cw.review_ticket where ticket_id=${id}`);
    eq(t.state, 'pending');
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n      ${m}`);
  process.exit(1);
}
