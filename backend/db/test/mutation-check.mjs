// Mutation check: prove the registry tests can actually fail.
//
// A suite that passes on the first run tells you nothing until you have seen it
// fail for the right reason. This deliberately breaks one guarantee at a time
// and asserts the suite catches it.
//
//   node db/test/mutation-check.mjs

import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'migrations');

const MUTATIONS = [
  { name: 'short codes not unique',
    find: 'short  text not null unique',
    repl: 'short  text not null',
    expect: 'a duplicate short code is rejected' },

  { name: 'selectable ignores expiry (finding #1 regression)',
    find: 'and (v.expires_on is null or v.expires_on >= current_date)',
    repl: 'and true',
    expect: 'nothing retired or expired leaks into selectable_clause' },

  { name: 'missing dates treated as expired (finding #8 regression)',
    find: "(v.expires_on is not null and v.expires_on < current_date)          as expired",
    repl: "(coalesce(v.expires_on, date '2020-01-01') < current_date)          as expired",
    expect: 'a clause with no dates is flagged, not expired' },

  { name: 'clause bodies editable (ADR-0006 regression)',
    find: 'or new.body is distinct from old.body',
    repl: 'or false',
    expect: 'editing clause body is refused' },

  { name: 'audit log not hash-chained',
    find: "coalesce(prev,'') || '|' || new.ts::text",
    repl: "'' || '|' || new.ts::text",
    expect: 'tampering with a past event is detected' },

  { name: 'legal reviewer may supersede (ADR-0008 regression)',
    find: `create policy admin_writes on cw.supersession for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');`,
    repl: `create policy admin_writes on cw.supersession for all
  using (true) with check (true);
grant insert on cw.supersession to cw_legal_reviewer;
grant usage, select on sequence cw.supersession_id_seq to cw_legal_reviewer;`,
    expect: 'a legal reviewer cannot supersede — only legal admin can' },
];

const files = readdirSync(SRC).filter(f => f.endsWith('.sql')).sort();
const originals = Object.fromEntries(files.map(f => [f, readFileSync(join(SRC, f), 'utf8')]));

let caught = 0, missed = [];
console.log('mutation check — each row must FAIL the suite\n');

for (const m of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'cw-mut-'));
  let applied = false;
  for (const f of files) {
    let sql = originals[f];
    if (sql.includes(m.find)) { sql = sql.replace(m.find, m.repl); applied = true; }
    writeFileSync(join(dir, f), sql);
  }
  if (!applied) {
    missed.push(`${m.name} — mutation string not found in any migration (stale check)`);
    console.log(`  SKIP  ${m.name}  ← pattern not found, check is stale`);
    continue;
  }

  let out = '', failed = false;
  try {
    out = execFileSync(process.execPath, [join(HERE, 'registry.test.mjs')],
      { env: { ...process.env, CW_MIGRATIONS: dir }, encoding: 'utf8' });
  } catch (e) { failed = true; out = (e.stdout || '') + (e.stderr || ''); }

  const hitExpected = out.includes(`FAIL ${m.expect}`);
  if (failed && hitExpected) { caught++; console.log(`  ok    ${m.name}`); }
  else if (failed) {
    caught++;
    console.log(`  ok*   ${m.name}  (suite failed, but not via "${m.expect}")`);
  } else {
    missed.push(`${m.name} — suite still passed; nothing guards this`);
    console.log(`  MISS  ${m.name}  ← suite passed with the guarantee broken`);
  }
}

console.log(`\n${caught}/${MUTATIONS.length} mutations caught`);
if (missed.length) {
  console.log('\nunguarded:');
  for (const x of missed) console.log('  · ' + x);
  process.exit(1);
}
