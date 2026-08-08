// Every view ANY ROLE can read has been looked at — migration-independent guard.
//
// WHY THIS FILE EXISTS. The same bug has now shipped eight times:
//
//   · 0017, the reading room — caught by its own suite on the first run.
//   · cw.override_status  — found by the Python session porting the reads.
//   · cw.override_passes  — found by checking whether the first one had siblings.
//   · five more, found on 2026-08-08 by asking the catalogue the same question
//     THIS FILE ASKS, with cw_viewer swapped for every role. cw.notice_state
//     handed one requester another requester's private notes, in full, on
//     GET /notices — whose own rule note in reads.py claimed the scoping this
//     file exists to check. Scoped by 0071.
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
// reaches ANY role and nobody has written down which case it is.
//
// WHAT THIS IS NOT. It cannot tell a safe view from a leaking one — that needs a
// human to know what the view is for. What it can do is refuse to let a new one
// through silently. Adding a view for anybody now costs one line here and the
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
// One entry per view readable by ANY application role. The verdict is the
// deliverable.
//
//   'scoped'   — the view carries its own WHERE clause repeating the policy.
//                It leaked, or it would have. The scoping is load-bearing.
//   'scoped-through:<view>'
//              — it has no WHERE clause of its own and does not need one: every
//                row it can reach comes through the named view, which is itself
//                'scoped'. Written as a NAMED DEPENDENCY rather than as prose,
//                so the test can check the parent is still scoped. If the
//                parent's WHERE clause is ever removed, both fail.
//   'read-all' — every table under it has a read policy of "any signed-in
//                role", so there is no per-person scoping to bypass and the
//                grant is what gates it.
//   'privileged'
//              — unscoped, over person-scoped tables, and granted ONLY to roles
//                whose read policy on those tables is unconditional
//                (legal_reviewer, legal_admin, auditor, administrator). The
//                view hands back exactly what the policies already permit, so
//                there is nothing to bypass. THE GRANT IS THE WHOLE FENCE: add
//                cw_requester or cw_viewer to one of these and it becomes the
//                leak this file is about, which the test below checks for.
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

  // ══════════════════════════════════════════════════════════════════════════
  // Added 2026-08-08, when the enumeration above stopped asking about the
  // viewer alone. Everything below this line was readable by somebody and had
  // never been classified by anybody.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Scoped by 0071, because they leaked ──
  // Demonstrated on two requesters with one deal each, before the migration:
  // Rita read Ben's notice in full through cw.notice_state while cw.notice
  // itself correctly answered her nothing.
  notice_state:                'scoped',
  agreement_close_eligibility: 'scoped',
  vendor_friction:             'scoped',
  // Identical shape over cw.obligation_instance, empty on that seed. Scoped on
  // shape, not on evidence — the same call made for agreement_drift above.
  obligation_state:            'scoped',
  obligation_unowned:          'scoped',

  // ── Scoped already, by the migration that owned them ──
  // 0025 (the run store) and 0027 (the negotiation and concession record). The
  // note at the bottom of this file named five of these as blocking the
  // widening; they were scoped, and the widening is now done.
  run_summary:             'scoped',
  run_contract:            'scoped',
  run_drift:               'scoped',
  portfolio_run:           'scoped',
  concession_in_force:     'scoped',
  concession_state:        'scoped',
  position_current:        'scoped',
  position_revival:        'scoped',
  renewal_drift:           'scoped',
  ticket_metrics:          'scoped',
  waiting_on_you:          'scoped',

  // ── Scoped through a parent view ──
  // Neither reads a base table directly: every row arrives through
  // cw.portfolio_run, whose own WHERE clause is the fence. Recording the
  // dependency by name means removing that WHERE clause fails here too.
  portfolio_position:      'scoped-through:portfolio_run',
  portfolio_unresolved:    'scoped-through:portfolio_run',

  // ── Privileged: the grant is the whole fence ──
  // Each is unscoped over person-scoped tables and granted ONLY to roles whose
  // read policy on those tables is unconditional. Adding cw_requester or
  // cw_viewer to any one of them reopens the bug this file is about.
  //
  // Legal's review-quality and library instrumentation, over cw.review_ticket.
  clause_entrance:            'privileged',
  concession_rate:            'privileged',
  edit_quality:               'privileged',
  edit_quality_by_agreement:  'privileged',
  edit_quality_by_category:   'privileged',
  review_quality:             'privileged',
  ticket_route:               'privileged',
  // The portfolio reports, legal_admin and the auditor only.
  policy_shift_exposure:      'privileged',
  report_clause_contest:      'privileged',
  report_queue_state:         'privileged',
  report_reviewer_throughput: 'privileged',
  report_risk_exposure:       'privileged',
  report_velocity:            'privileged',
  // The health tiles and the chain, auditor and administrator only.
  health_chain:               'privileged',
  health_document:            'privileged',
  health_summary:             'privileged',
  // Who did what, over cw.audit_event. legal_admin, auditor, administrator.
  person_activity:            'privileged',
  // Retention and holds, and the auditor's own snapshot read.
  retention_due:              'privileged',
  run_snapshot:               'privileged',

  // ── Over read-all tables, or derived ──
  // Clause, ladder and library reference data (0002, 0003, 0062): readable by
  // anybody signed in, so there is no per-person scoping to bypass.
  library_origin_mix:      'read-all',
  library_proposal:        'read-all',
  run_origin_mix:          'read-all',
  // Counts and reference rows with no person in them.
  access_summary:          'derived',
  health_checkpoint:       'derived',
  health_rebuild:          'derived',
  notification_gap:        'derived',
  redaction_state:         'derived',
};

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
const rows = async (s, p) => (await db.query(s, p)).rows;

// Every view in cw that ANY application role holds select on. Asked of the
// catalogue, so a view added tomorrow appears here without anybody remembering
// to list it.
//
// IT ASKED ABOUT cw_viewer ALONE UNTIL 2026-08-08, AND THAT IS HOW FIVE MORE
// SHIPPED. The viewer is the LEAST privileged role in the system, so a view
// granted to the requester and not to the viewer sat outside this inventory
// from the day it was written — and the reverse check below, which is the good
// one, never ran against it. 21 views are readable by a viewer; 45 more are
// readable by some other role and by no viewer. The guard covered 21 of 66.
//
// THE WIDENING WAS ALREADY WRITTEN DOWN as the right thing to do, at the bottom
// of this file, and deferred for a stated reason: five requester-only views had
// the leaking shape and belonged to nobody in that change. Those five were
// scoped in the meantime and nobody came back for the widening — so
// cw.notice_state, cw.agreement_close_eligibility, cw.obligation_state,
// cw.obligation_unowned and cw.vendor_friction landed unscoped behind it, and
// cw.notice_state was handing one requester another requester's private notes.
// 0071 scopes those five. This is the follow-through that note asked for.
const APPLICATION_ROLES = ['cw_viewer', 'cw_requester', 'cw_legal_reviewer',
                           'cw_legal_admin', 'cw_auditor', 'cw_administrator'];

// The roles whose read policies on the base tables are UNCONDITIONAL — written
// as `app_role() in (...)` with no per-person clause. A view readable ONLY by
// these hands back exactly what the policies already permit, which is what the
// 'privileged' verdict means below.
const UNCONDITIONAL = new Set(['cw_legal_reviewer', 'cw_legal_admin',
                               'cw_auditor', 'cw_administrator']);

const readable = await rows(`
  select c.relname as view_name,
         array(select r.rolname from unnest($1::text[]) as r(rolname)
                where has_table_privilege(r.rolname, c.oid, 'SELECT')) as readers
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'cw' and c.relkind = 'v'
    and exists (select 1 from unnest($1::text[]) as r(rolname)
                 where has_table_privilege(r.rolname, c.oid, 'SELECT'))
  order by c.relname`, [APPLICATION_ROLES]);

console.log(`\n${readable.length} views are readable by at least one role\n`);

await test('every view any role can read has been classified', async () => {
  const unlisted = readable.map(r => r.view_name).filter(v => !(v in REVIEWED));
  assert(unlisted.length === 0,
    `these views are readable by some role and nobody has said why that is safe:\n` +
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
    `the inventory lists views no role can read (renamed, dropped, or the ` +
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
    // 'privileged' and 'scoped-through' are unscoped over person-scoped tables
    // BY DEFINITION — that is what each verdict says. Each has its own test
    // below, which is where the claim is actually checked.
    if (verdict === 'privileged') continue;
    if (verdict.startsWith('scoped-through:')) continue;
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

await test("every view marked 'privileged' is granted to privileged roles only",
  async () => {
    // THE WHOLE CONTENT OF THAT VERDICT. These views are unscoped over
    // person-scoped tables and safe for exactly one reason: nobody who should
    // see only their own rows can read them. That reason is a GRANT, and a
    // grant is one line in a later migration away from changing.
    //
    // This is the check that would have caught the five that 0071 scoped, had
    // they ever been classified — each was 'privileged' in shape and granted to
    // cw_requester, which is the contradiction below.
    for (const row of readable) {
      if (REVIEWED[row.view_name] !== 'privileged') continue;
      const broad = row.readers.filter(r => !UNCONDITIONAL.has(r));
      assert(broad.length === 0,
        `cw.${row.view_name} is marked 'privileged' — unscoped over ` +
        `person-scoped tables, safe only because privileged roles alone can ` +
        `read it — but ${broad.join(', ')} now hold select on it. Either give ` +
        `it a WHERE clause of its own or take the grant back.`);
    }
  });

await test('no unscoped derivation view is reachable by an application role',
  async () => {
    // 0071's new seam, guarded on the day it was built rather than after it
    // leaks. cw.notice_state_all and cw.obligation_state_all are the derivations
    // WITHOUT the scoping — they exist because cw.waiting_for is SECURITY
    // DEFINER, where cw.app_role() is null and a scoping predicate matches
    // nothing. They are unscoped over person-scoped tables BY DESIGN, and the
    // only thing between them and the leak 0071 closes is that no application
    // role holds select.
    //
    // Named by SUFFIX rather than listed, so a third one written next year is
    // covered without anybody remembering this file. The suffix is the promise:
    // if you call a view `_all`, it is granted to nobody.
    const reachable = await rows(`
      select c.relname as view_name,
             array(select r.rolname from unnest($1::text[]) as r(rolname)
                    where has_table_privilege(r.rolname, c.oid, 'SELECT')) as readers
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'cw' and c.relkind = 'v' and c.relname like '%\\_all'
        and exists (select 1 from unnest($1::text[]) as r(rolname)
                     where has_table_privilege(r.rolname, c.oid, 'SELECT'))`,
      [APPLICATION_ROLES]);
    assert(reachable.length === 0,
      reachable.map(r => `cw.${r.view_name} is granted to ${r.readers.join(', ')}`)
        .join('; ') + `. A view named _all carries a derivation WITHOUT its ` +
      `scoping. Read it from a SECURITY DEFINER function, never from a session ` +
      `that belongs to a person.`);
  });

await test("every 'scoped-through' view names a parent that is still scoped",
  async () => {
    // A view with no WHERE clause of its own, resting on one that has one. The
    // dependency is named so it cannot rot quietly: if the parent is
    // reclassified or its scoping removed, this fails and names both.
    for (const [view, verdict] of Object.entries(REVIEWED)) {
      if (!verdict.startsWith('scoped-through:')) continue;
      const parent = verdict.slice('scoped-through:'.length);
      assert(REVIEWED[parent] === 'scoped',
        `cw.${view} is marked 'scoped-through:${parent}', but cw.${parent} is ` +
        `marked '${REVIEWED[parent] ?? 'nothing at all'}'. The fence it rests ` +
        `on is not there.`);
      const [d] = await rows(`select pg_get_viewdef($1::regclass, true) as def`,
        [`cw.${view}`]);
      assert(new RegExp(`\\b${parent}\\b`).test(d.def),
        `cw.${view} is marked 'scoped-through:${parent}' but its definition ` +
        `no longer reads cw.${parent} — it is getting its rows from somewhere ` +
        `else now, and nobody has said what fences them`);
    }
  });

await test('the two run views scope themselves in their own WHERE clause', async () => {
  // The standing guard on migration 0025. Both views answered with EVERY run
  // to anybody granted them: a view runs with its owner's rights, and
  // row-level security on cw.run is ENABLED rather than FORCED, so cw.run's
  // read policy was never consulted through either of them.
  //
  // WHY THIS IS STILL A NAMED TEST NOW THAT THE INVENTORY IS WIDE. It used to
  // be a named test BECAUSE the inventory was narrow: widening it then would
  // have failed on five requester-only views — cw.concession_in_force,
  // cw.concession_state, cw.position_current, cw.position_revival and
  // cw.renewal_drift — that had this exact shape and belonged to nobody in that
  // change. They were recorded as needing an owner, and they got one: all five
  // are scoped and classified above.
  //
  // THE DEFERRAL COST SOMETHING, and it is worth naming. Nobody came back for
  // the widening, so five NEW unscoped views landed behind it over the
  // following weeks — one of them handing a requester another requester's
  // private notes. A note saying "this should be widened later" protected
  // nothing for as long as it sat there. It is widened now.
  //
  // The test stays because it is more specific than the inventory: the
  // inventory asks whether somebody classified a view, and this asks whether
  // these two particular WHERE clauses are still present.
  //
  // A SECOND LIMITATION, recorded rather than fixed: the reverse check above
  // would not have caught cw.run_contract even after widening. Its risky-table
  // set is matched on policy TEXT, and cw.run_decision's read policy scopes
  // transitively through cw.run without naming app_actor or owns_agreement
  // itself. The check has a blind spot for one-hop scoping.
  for (const view of ['run_summary', 'run_contract']) {
    const [d] = await rows(`select pg_get_viewdef($1::regclass, true) as def`,
      [`cw.${view}`]);
    assert(/app_role\(\)|app_actor\(\)|owns_agreement/.test(d.def),
      `cw.${view} no longer consults who is asking. It is granted to the ` +
      `requester and both Legal roles, so without a WHERE clause of its own it ` +
      `hands every run in the system to all three.`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
