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

  // ── Ladders and concessions (CLA) ──
  { suite: 'ladder.test.mjs',
    name: 'the floor is not absolute',
    find: `  if new.conceded_rung is not null and floor_rung is not null
     and new.conceded_rung > floor_rung and new.override_ref is null then`,
    repl: `  if false then`,
    expect: 'conceding below the floor without an override is refused' },

  { suite: 'ladder.test.mjs',
    name: 'vendor language accepted without an override',
    find: `  if new.vendor_text is not null and new.override_ref is null then`,
    repl: `  if false then`,
    expect: 'accepting vendor language without an override is refused' },

  { suite: 'ladder.test.mjs',
    name: 'anyone may promote a concession into the library (ADR-0009 regression)',
    find: `  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'only legal_admin may promote a concession into the library'
      using errcode = 'insufficient_privilege';
  end if;`,
    repl: `  if false then raise exception 'unreachable'; end if;`,
    expect: 'a requester cannot promote' },

  { suite: 'ladder.test.mjs',
    name: 'a degraded ladder reports as intact (silent collapse)',
    find: `         when count(*) filter (where not r.selectable) > 0 then 'degraded'`,
    repl: `         when false then 'degraded'`,
    expect: 'an expired rung degrades the ladder rather than vanishing' },

  { suite: 'ladder.test.mjs',
    name: 'viewers can read the concession record',
    find: `grant select on cw.concession to cw_auditor;`,
    repl: `grant select on cw.concession to cw_auditor, cw_viewer;`,
    expect: 'a viewer cannot read concessions at all' },

  { suite: 'ladder.test.mjs',
    name: 'requesters see every buyer’s concessions',
    find: `create policy read_scoped on cw.concession for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and cw.owns_agreement(concession.agreement_id)));`,
    repl: `create policy read_scoped on cw.concession for select using (true);`,
    expect: 'a requester sees only their own deals' },
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
  const suite = m.suite || 'registry.test.mjs';
  try {
    out = execFileSync(process.execPath, [join(HERE, suite)],
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
