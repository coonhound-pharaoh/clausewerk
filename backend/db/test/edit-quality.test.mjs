// The edit-quality threshold and its read surface (0048, NC-13).
//
// The guarantees:
//   · The threshold SHIPS EMPTY, owner-decision true. The system never
//     chooses this number — that is U4's principle applied to the sibling
//     metric, and here it is a check rather than discipline, because
//     discipline alone already failed once on content boundaries.
//   · With no threshold set, the three cuts answer the figure and NO alarm
//     state exists (below_threshold is NULL, never zero).
//   · With a threshold set by legal_admin, the comparison is reported.
//   · Only legal_admin can set the threshold; a reviewer cannot.
//   · The quality surface stays Legal's and the Auditor's: a requester and a
//     viewer are refused outright, mirroring cw.review_quality.
//
//   node db/test/edit-quality.test.mjs

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
const { queryAs, mustWrite } = roleHelpers(db);

const RITA = 'rita@cw';   // requester who opens tickets
const LEAH = 'leah@cw';   // legal admin, who decides them and owns the threshold
const REVA = 'reva@cw';   // legal reviewer — decides tickets, may NOT set thresholds

await db.exec(`
  select set_config('cw.actor','owner@clausewerk',false);
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
`);

console.log('\nthe threshold ships empty, and that is a check, not discipline');

await test('the threshold row ships with an EMPTY value and owner-decision true', async () => {
  const s = await one(`select value, is_owner_decision, decided
                         from cw.governance_setting
                        where key = 'edit_similarity_threshold'`);
  assert(s, 'the row exists');
  eq(s.value, '', 'the shipped value is empty — the system never chooses this number');
  eq(s.is_owner_decision, true);
  eq(s.decided, false, 'U4 is the precedent, not the ruling; this key is not stamped as decided');
});

console.log('\nwith no threshold: the figure answers, no alarm state exists');

// Two tickets through the real decision path: one approved unedited, one
// edited. Wording is placeholder; the tests pin figures, never sentences.
await db.query(
  `insert into cw.review_ticket
     (category_key, severity, reason_code, provenance_badge, proposed_text, opened_by)
   values ('data','Standard','human-escalated','AI CANDIDATE','alpha beta gamma delta', $1),
          ('data','Standard','human-escalated','AI CANDIDATE','alpha beta gamma delta', $1)`,
  [RITA]);

await test('an unedited approval carries the identity figure', async () => {
  await mustWrite('legal_admin',
    `select cw.verify_review_ticket(1, 'alpha beta gamma delta', 'DP-N-001',
       'T', 'placeholder rationale', $1, null)`, [LEAH], LEAH);
  const t = await one(`select edit_similarity::text as s
                         from cw.review_ticket where ticket_id = 1`);
  eq(t.s, '1.0000');
});

await test('an edited approval carries a figure strictly below identity', async () => {
  await mustWrite('legal_admin',
    `select cw.verify_review_ticket(2, 'alpha beta gamma epsilon zeta', 'DP-N-002',
       'T', 'placeholder rationale', $1, null)`, [LEAH], LEAH);
  const t = await one(`select edit_similarity from cw.review_ticket where ticket_id = 2`);
  assert(Number(t.edit_similarity) < 1, `edited approval reads ${t.edit_similarity}`);
});

await test('the library-wide cut answers, and below_threshold is NULL, never zero', async () => {
  const q = await queryAs('legal_admin', `select * from cw.edit_quality`, [], LEAH);
  eq(Number(q[0].verified), 2);
  assert(q[0].threshold === null, 'no threshold is set');
  assert(q[0].below_threshold === null,
    '"no alarm state exists" and "nothing fell below" are different sentences; ' +
    'with no threshold the column must be NULL');
});

await test('the by-category and per-contract cuts answer the same figures', async () => {
  const byCat = await queryAs('legal_reviewer',
    `select * from cw.edit_quality_by_category`, [], REVA);
  eq(byCat.length, 1);
  eq(byCat[0].category_key, 'data');
  eq(Number(byCat[0].verified), 2);

  const byAg = await queryAs('auditor',
    `select * from cw.edit_quality_by_agreement`, [], 'ava@cw');
  eq(byAg.length, 1);
  assert(byAg[0].agreement_id === null,
    'tickets opened outside any deal group under a visible NULL row');
});

console.log('\nthe threshold is Legal admin’s to set, and nobody else’s');

await test('legal_admin sets the threshold and the comparison is reported', async () => {
  await mustWrite('legal_admin',
    `update cw.governance_setting set value = '0.9'
      where key = 'edit_similarity_threshold' returning key`, [], LEAH);
  const q = await queryAs('legal_admin', `select * from cw.edit_quality`, [], LEAH);
  eq(Number(q[0].threshold), 0.9);
  eq(Number(q[0].below_threshold), 1, 'the edited approval fell below 0.9');
});

await test('a legal reviewer cannot set the threshold', async () => {
  // The reviewer holds no UPDATE grant on the settings table at all (0010
  // granted it to legal_admin only), so this is refused before any policy is
  // consulted — a raise, not a silent no-op. The value is checked anyway.
  await throws(() => queryAs('legal_reviewer',
    `update cw.governance_setting set value = '0.5'
      where key = 'edit_similarity_threshold'`, [], REVA), 'permission denied');
  const s = await one(`select value from cw.governance_setting
                        where key = 'edit_similarity_threshold'`);
  eq(s.value, '0.9', 'the reviewer’s attempt changed nothing');
});

console.log('\nthe quality surface stays Legal’s and the Auditor’s');

await test('a requester is refused all three cuts outright', async () => {
  for (const view of ['cw.edit_quality', 'cw.edit_quality_by_category',
                      'cw.edit_quality_by_agreement'])
    await throws(() => queryAs('requester', `select * from ${view}`, [], RITA),
      'permission denied',
      `${view} answered a requester — the per-contract fencing is the grant, and it is absent`);
});

await test('a viewer holds no grant on any of the three', async () => {
  await throws(() => queryAs('viewer', `select * from cw.edit_quality`, [], 'vic@cw'),
    'permission denied');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const [n, m] of failures) console.log(`  FAIL ${n}: ${m}`);
  process.exit(1);
}
