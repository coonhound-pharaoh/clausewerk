// Every endpoint's SQL, run against the real migrated schema.
//
// WHY THIS EXISTS. WP-U07 shipped `GET /waiting/tickets` selecting `clause_id`,
// `version` and `opened_at` from `cw.review_ticket` — three columns that table
// does not have. A review ticket names a CATEGORY, not a clause, because the
// whole point is that the proposed text has not become a clause yet.
//
// The endpoint failed outright for anybody with a ticket to see. Nobody noticed
// for two packages, because the seeded system had no tickets and an empty result
// and a failed query look identical from a workspace that renders "nothing is
// waiting on you" either way. The service tests exercise a handful of endpoints
// by name; the rest were only ever read.
//
// So: every entry in READS, run. It cannot prove the rows are the RIGHT rows —
// that is what the role-scoped suites are for — but it proves the query is a
// query this schema can answer, which is the failure that actually happened.
//
//   node db/test/endpoints.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE = process.env.CW_SERVICE || join(HERE, '..', '..', 'service');
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');

const { READS }     = await import(pathToFileURL(join(SERVICE, 'app.mjs')).href);
const { MUTATIONS } = await import(pathToFileURL(join(SERVICE, 'mutations.mjs')).href);

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

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

console.log('\nevery read endpoint asks the schema something it can answer');

await test('there are endpoints to check (guards a vacuous pass)', async () => {
  assert(Object.keys(READS).length >= 20,
    `only ${Object.keys(READS).length} read endpoints found`);
});

for (const [route, def] of Object.entries(READS)) {
  await test(`${route} is valid against the migrated schema`, async () => {
    // cw.actor is a session setting the service binds per request; here there
    // is no session, so it is substituted with a literal. Everything else runs
    // exactly as written.
    await db.query(def.sql.replace(/current_setting\('cw\.actor'\)/g, `'nobody'`));
  });
}

await test('every read endpoint names the rule that scopes it', async () => {
  const missing = Object.entries(READS)
    .filter(([, d]) => !d.rule || !d.rule.trim()).map(([k]) => k);
  eq(missing, [], 'endpoints with no note saying where the decision lives');
});

await test('every write endpoint names its rule too', async () => {
  const missing = Object.entries(MUTATIONS)
    .filter(([, d]) => !d.rule || !d.rule.trim()).map(([k]) => k);
  eq(missing, []);
});

await test('no read endpoint is a write in disguise', async () => {
  // A GET that mutates is the shape that turns a link into an action — and a
  // browser prefetching links would then perform it.
  for (const [route, def] of Object.entries(READS)) {
    assert(!/\b(insert|update|delete|truncate|create|drop|alter)\b/i.test(def.sql),
      `${route} contains a mutating statement`);
    assert(route.startsWith('GET '), `${route} is in READS but is not a GET`);
  }
});

await test('no write endpoint is routed as a GET', async () => {
  for (const route of Object.keys(MUTATIONS))
    assert(route.startsWith('POST '), `${route} mutates but is not a POST`);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
