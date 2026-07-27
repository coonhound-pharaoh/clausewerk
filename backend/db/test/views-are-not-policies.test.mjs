// Every view a viewer can read has been looked at — migration-independent guard.
//
// WHY THIS FILE EXISTS. The same bug has now shipped three times:
//
//   · 0017, the reading room — caught by its own suite on the first run.
//   · cw.override_status  — found by the Python session porting the reads.
//   · cw.override_passes  — found by checking whether the first one had siblings.
//
// Each time the shape is identical. A view over a table whose read policy scopes
// BY PERSON, with no scoping of its own, granted to roles that should only see
// their own rows. A PostgreSQL view runs with its OWNER's rights, the owner ran
// the migrations, and row-level security is ENABLED rather than FORCED — so the
// owner is exempt, the policy is never consulted, and the view hands back
// everything.
//
// Three occurrences is a pattern, not bad luck. Handoff 07 §5.1 has warned about
// it in prose since the first one, and prose did not stop the second or the
// third. So this is the mechanical version: an inventory that FAILS when a view
// reaches a viewer and nobody has written down which case it is.
//
// WHAT THIS IS NOT. It cannot tell a safe view from a leaking one — that needs a
// human to know what the view is for. What it can do is refuse to let a new one
// through silently. Adding a view for a viewer now costs one line here and the
// sentence that goes with it, and the sentence is the point: it is the moment
// somebody asks "does this need a WHERE clause?", which is the question that was
// never asked three times running.
//
//   node db/test/views-are-not-policies.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// ── The inventory ─────────────────────────────────────────────────────────
// One entry per view readable by cw_viewer. The verdict is the deliverable.
//
//   'scoped'   — the view carries its own WHERE clause repeating the policy.
//                It leaked, or it would have. The scoping is load-bearing.
//   'read-all' — every table under it has a read policy of "any signed-in
//                role", so there is no per-person scoping to bypass and the
//                grant is what gates it.
//   'derived'  — aggregate or reference data with no person in it at all.
//   'enforcement'
//              — the SCHEMA ITSELF reads this view to decide something, so it
//                must return the same rows to everybody and must NOT be scoped.
//                Scoping one of these makes what the database enforces depend
//                on who is asking, which is a correctness bug wearing a
//                permission's clothes. Each entry needs its reason in a comment.
//
// A view missing from this list fails the test by name. That is the whole
// mechanism: you cannot add one without saying which case it is.
const REVIEWED = {
  // ── Scoped, because they leaked or would have ──
  // 0017. Written scoped after the first version was not.
  reading_room:            'scoped',
  reading_room_clause:     'scoped',
  // 0019, reported by the Python session porting the read endpoints.
  override_status:         'scoped',
  override_passes:         'scoped',
  // 0019, found by asking the catalogue what else had the same shape. The first
  // two leaked on seeded data — agreement_chain returned every signed contract
  // with its counterparty, filename and document hash to a viewer who had been
  // shown nothing, which is the hole 0017 closed reopened through a view
  // written ten migrations earlier.
  agreement_chain:         'scoped',
  execution_evidence_gap:  'scoped',
  // Same shape, empty on the seed. Scoped on shape, not on evidence.
  agreement_drift:         'scoped',
  sow_conflict:            'scoped',
  orphaned_sow:            'scoped',

  // ── Over read-all tables ──
  // Clause text, ladders and conflict rules are readable by anybody signed in
  // (0002, 0003, 0004), so there is no per-person scoping to bypass.
  clause_version_state:    'read-all',
  selectable_clause:       'read-all',
  coverage_gap:            'read-all',
  library_entry:           'read-all',
  ladder_board:            'read-all',
  ladder_rung_state:       'read-all',
  ladder_health:           'read-all',
  active_conflict_rule:    'read-all',
  // cw.account and cw.role_grant both carry read_all policies (0013): who holds
  // which role is deliberately visible to anybody signed in, so these two
  // bypass nothing. Note they DO name people — 'read-all' is a statement about
  // the policy underneath, not about the data being dull.
  effective_role:          'read-all',
  countersign_pending:     'read-all',

  // ── Read by the schema itself, so deliberately NOT scoped ──
  // The trigger in 0012 that decides whether a statement of work may contradict
  // its master consults this view. It was scoped, and an authorised SOW was
  // then refused execution because the trigger's caller held no application
  // role — see the note in 0019. Access scoping belongs on views people read.
  sow_override_in_force:   'enforcement',

  // ── Derived: counts and reference data with no person in them ──
  // watcher_coverage counts how many people would be told about an override in
  // each category. It names nobody and carries no contract content.
  watcher_coverage:        'derived',
};

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
const rows = async (s, p) => (await db.query(s, p)).rows;

// Every view in cw that cw_viewer holds select on. Asked of the catalogue, so a
// view added tomorrow appears here without anybody remembering to list it.
const readable = await rows(`
  select c.relname as view_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'cw' and c.relkind = 'v'
    and has_table_privilege('cw_viewer', c.oid, 'SELECT')
  order by c.relname`);

console.log(`\n${readable.length} views are readable by a viewer\n`);

await test('every view a viewer can read has been classified', async () => {
  const unlisted = readable.map(r => r.view_name).filter(v => !(v in REVIEWED));
  assert(unlisted.length === 0,
    `these views are readable by a viewer and nobody has said why that is safe:\n` +
    unlisted.map(v => `         · cw.${v}`).join('\n') +
    `\n       Add each to REVIEWED in this file with a verdict — 'scoped',\n` +
    `       'read-all' or 'derived' — and check it before you do. A view does\n` +
    `       NOT inherit the policies underneath it; that has shipped three times.`);
});

await test('the inventory has no entries for views that no longer exist', async () => {
  // The other direction, so the list cannot rot into reassuring fiction. A
  // stale entry is a claim about something that is not there.
  const live = new Set(readable.map(r => r.view_name));
  const ghosts = Object.keys(REVIEWED).filter(v => !live.has(v));
  assert(ghosts.length === 0,
    `the inventory lists views a viewer cannot read (renamed, dropped, or the ` +
    `grant changed): ${ghosts.map(v => 'cw.' + v).join(', ')}`);
});

await test("every view marked 'scoped' actually consults who is asking", async () => {
  // Checked against the view's own definition rather than by querying it,
  // because a query proves it for the rows that happen to be seeded and this
  // proves it for all of them. cw.app_role() or cw.app_actor() appearing in the
  // definition is what "the view scopes itself" means.
  for (const [view, verdict] of Object.entries(REVIEWED)) {
    if (verdict !== 'scoped') continue;
    const [d] = await rows(`select pg_get_viewdef($1::regclass, true) as def`,
      [`cw.${view}`]);
    assert(/app_role\(\)|app_actor\(\)|is_shared_with|was_notified|owns_agreement/.test(d.def),
      `cw.${view} is marked 'scoped' but its definition never asks who is ` +
      `asking — the scoping was removed and the inventory now lies`);
  }
});

await test("no view marked 'read-all' or 'derived' sits over a person-scoped table", async () => {
  // The reverse check, and the one that would have caught all three. A view
  // classified as harmless must not depend on a table whose read policy
  // mentions the person asking — those are the tables where bypassing the
  // policy actually costs something.
  //
  // "Mentions the person asking" means app_actor() directly OR one of the
  // definer-rights helpers that exist precisely to answer a question about
  // them. Matching only app_actor() missed cw.sow_override, whose policy scopes
  // requesters through cw.owns_agreement() and never names the actor itself.
  const personScoped = await rows(`
    select distinct c.relname as table_name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'cw' and p.polcmd in ('r', '*')
      and pg_get_expr(p.polqual, p.polrelid) ~
          'app_actor\\(\\)|owns_agreement|is_shared_with|was_notified'`);
  const risky = new Set(personScoped.map(r => r.table_name));

  for (const [view, verdict] of Object.entries(REVIEWED)) {
    if (verdict === 'scoped') continue;
    // 'enforcement' views are knowingly unscoped over person-scoped tables —
    // that is the entry's whole content. The residual exposure is written up in
    // 0019 rather than asserted away here.
    if (verdict === 'enforcement') continue;
    const [d] = await rows(`select pg_get_viewdef($1::regclass, true) as def`,
      [`cw.${view}`]);
    // Word-boundary match so `cw.agreement` does not match `cw.agreement_share`.
    const touched = [...risky].filter(t => new RegExp(`\\b${t}\\b`).test(d.def));
    assert(touched.length === 0,
      `cw.${view} is marked '${verdict}' but reads ${touched.map(t => 'cw.' + t).join(', ')}, ` +
      `whose read policy scopes by person. Either it needs a WHERE clause of its ` +
      `own or the verdict is wrong — this is the exact shape that shipped three times`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
