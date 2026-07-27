// The two consolidation views the Legal admin's workspace reads — migration 0018
// (WP-U13, read models).
//
// WHAT THIS SUITE IS ACTUALLY ABOUT. Handoff 07 §4 records that most of WP-U13's
// database half already exists; what was missing was consolidation. So unlike
// 0017, these views close no hole and add no control — they join views that are
// already there. That makes the interesting question a different one.
//
// A convenience view has exactly two ways to be wrong:
//
//   1. It shows somebody something they could not otherwise see. A view runs
//      with its OWNER's rights and does NOT inherit the policies underneath it,
//      so "it only joins things they can already read" is a claim to be tested,
//      not assumed. 0017 shipped that assumption and it was false there.
//
//   2. It quietly drops rows. A join written one word differently reports a
//      broken ladder as no ladder — and absence renders identically to health,
//      which is trap 5.2 in handoff 07 wearing a different hat: an empty result
//      and a wrong result look the same from a screen.
//
// Both are tested here by name.
//
//   node db/test/library-ladder-views.test.mjs

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

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const rows = async (s, p) => (await db.query(s, p)).rows;
const one  = async (s, p) => (await rows(s, p))[0];
const { queryAs } = roleHelpers(db);

const OWNER = 'owner@cw', ADMIN = 'a.okafor@cw', LEGAL = 'r.vance@cw';
await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);

// ── The library, deliberately in every state it has ───────────────────────
// One category with a clause in each of the four states the registry reports,
// because a consolidation view that gets `state` right for active language and
// wrong for superseded language passes any test that only seeds the happy case.
await db.exec(`
  select set_config('cw.actor','installer@cw',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'),
    ('liab','Limitation of Liability','LL'),
    ('expo','Export Control','EX');

  insert into cw.clause (clause_id,category_key,severity,always_include) values
    ('DP-H-014','data','High',false),      -- active, on a ladder, the floor
    ('DP-S-001','data','Standard',false),  -- active
    ('DP-S-002','data','Standard',false),  -- expired
    ('DP-S-003','data','Standard',false),  -- retired
    ('DP-S-004','data','Standard',false),  -- v1 superseded by its own v2
    ('DP-S-005','data','Standard',false),  -- active
    ('DP-B-009','data','Baseline',true),   -- always included
    ('LL-H-001','liab','High',false),      -- the only liability clause
    -- The only Export Control clause, and it is retired. So the category has a
    -- library row but nothing selectable behind it: a genuine coverage gap, on
    -- a clause the library still lists. That is the case the flag exists for.
    ('EX-S-001','expo','Standard',false);

  insert into cw.clause_version
    (clause_id,version,title,body,rationale,approved_on,expires_on,reviewer,
     retired,retired_reason) values
    ('DP-H-014',1,'24h','Notify within 24 hours.','Regulator expects 24h.',
     '2025-01-01','2030-01-01','R. Vance',false,null),
    ('DP-S-001',1,'72h','Notify within 72 hours.','The standard position.',
     '2025-01-01','2030-01-01','R. Vance',false,null),
    ('DP-S-002',1,'Lapsed','This one lapsed.','Left to expire on purpose.',
     '2020-01-01','2021-01-01','R. Vance',false,null),
    ('DP-S-003',1,'Withdrawn','This one was withdrawn.','Withdrawn, not replaced.',
     '2025-01-01','2030-01-01','R. Vance',true,'Withdrawn, not replaced.'),
    ('DP-S-004',1,'Old','The old wording.','Replaced by v2.',
     '2025-01-01','2030-01-01','R. Vance',false,null),
    ('DP-S-004',2,'Newer','The new wording.','Replaces v1.',
     '2025-06-01','2030-01-01','R. Vance',false,null),
    ('DP-S-005',1,'Alternate','Another standard position.','Kept alongside.',
     '2025-01-01','2030-01-01','R. Vance',false,null),
    ('DP-B-009',1,'Baseline','Always in.','Framework member.',
     '2025-01-01','2030-01-01','R. Vance',false,null),
    ('LL-H-001',1,'Cap','Liability is capped.','The cap.',
     '2025-01-01','2030-01-01','R. Vance',false,null),
    ('EX-S-001',1,'Screening','Screen the parties.','Sanctions screening.',
     '2025-01-01','2030-01-01','R. Vance',true,'Superseded by policy, not by a clause.');

  insert into cw.supersession
    (clause_id,predecessor_version,successor_version,predecessor_disposition,
     effective_on,reason,approver)
    values ('DP-S-004',1,2,'retire_now','2025-06-01',
            'Rewritten after the 2025 guidance.','R. Vance');
  select set_config('cw.actor','',false);`);

// ── Three ladders, and one of them is empty on purpose ────────────────────
// The empty one is the reason cw.ladder_health reports a status of 'empty' at
// all, and it is the row an inner join silently deletes.
//
// A NOTE ON WHAT COULD NOT BE SEEDED HERE, because it changed what this suite
// claims. The plan was to put one clause version on two ladders, so that a
// library view joining the ladder facts instead of counting them would visibly
// duplicate. The schema does not allow it: cw.ladder_rung_matches_ladder()
// refuses a rung whose clause is a different category or severity than its
// ladder, and cw.ladder is unique on (category_key, severity). Between them, a
// clause version belongs to at most ONE ladder, always.
//
// So 'every clause version appears exactly once' is true because of those two
// rules, not because of anything cw.library_entry does — and it has no mutation
// for the same reason. It is kept as a statement of the shape a reader should
// expect, and mutation-check.mjs records why it is not guarded there.
await db.exec(`
  select set_config('cw.actor','installer@cw',false);
  insert into cw.ladder (ladder_id,category_key,severity,owner,reviewed_on) values
    (1,'data','High','Legal','2026-01-01'),      -- intact, with a floor
    (2,'data','Standard','Legal','2026-01-01'),  -- has rungs, no floor
    (3,'liab','High','Legal','2026-01-01');      -- EMPTY. no rungs at all
  insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
    (1,0,'DP-H-014',1,true),
    (2,0,'DP-S-001',1,false),
    (2,1,'DP-S-002',1,false);                    -- an expired rung: degraded
  select set_config('cw.actor','',false);`);

// ── The library view says exactly what its parts say ──────────────────────
console.log('\nthe library view consolidates, and changes nothing');

await test('every clause version appears exactly once', async () => {
  // One row per version, not one per ladder it appears on. Note this holds
  // because of the rung trigger and the ladder uniqueness described above, not
  // because of anything cw.library_entry does — see the seed comment. Kept as
  // the shape a reader should expect, and honestly unguarded.
  const n = await one(`select count(*)::int total,
                              count(distinct (clause_id, version))::int distinct_versions
                       from cw.library_entry`);
  eq([n.total, n.distinct_versions], [10, 10],
    'the library view does not hold one row per clause version');
});

await test('state, expiry and rationale match cw.clause_version_state exactly', async () => {
  // The consolidation must not restate anything. Any column this view computes
  // for itself is a column that can disagree with the registry, and two answers
  // to "is this clause retired?" is worse than none.
  const drift = await rows(`
    select e.clause_id
    from cw.library_entry e
    join cw.clause_version_state s using (clause_id, version)
    where e.state           is distinct from s.state
       or e.selectable      is distinct from s.selectable
       or e.expired         is distinct from s.expired
       or e.expires_soon    is distinct from s.expires_soon
       or e.days_to_expiry  is distinct from s.days_to_expiry
       or e.provenance_gap  is distinct from s.provenance_gap
       or e.rationale       is distinct from s.rationale
       or e.expires_on      is distinct from s.expires_on`);
  eq(drift, [], 'the library view disagrees with the registry it is built from');
});

await test('all four states survive the join', async () => {
  const byState = await rows(
    `select state, count(*)::int n from cw.library_entry group by state order by state`);
  eq(byState, [
    { state: 'active',     n: 6 },
    { state: 'expired',    n: 1 },
    { state: 'retired',    n: 2 },
    { state: 'superseded', n: 1 },
  ], 'a state is missing from the library view, so a join dropped rows');
});

await test('the category arrives with its human name', async () => {
  // The reason this view exists rather than the screen joining it: a library
  // that renders "data" instead of "Data Privacy" sends somebody to the schema.
  const r = await one(
    `select category_label, category_short from cw.library_entry where clause_id='DP-H-014'`);
  eq([r.category_label, r.category_short], ['Data Privacy', 'DP']);
});

await test('a version that is a ladder floor says so', async () => {
  // The question a Legal admin needs answered BEFORE retiring something.
  const r = await one(
    `select on_ladders::int as on_ladders, is_a_floor
     from cw.library_entry where clause_id='DP-H-014'`);
  eq([r.on_ladders, r.is_a_floor], [1, true],
    'the library does not report that this version is holding up a ladder');
});

await test('a version on no ladder reports zero, not null', async () => {
  // A null here would render as blank, and blank reads as "unknown" when the
  // truth is "none". The distinction is the whole of trap 5.2.
  const r = await one(
    `select on_ladders::int as on_ladders, is_a_floor
     from cw.library_entry where clause_id='DP-S-005'`);
  eq([r.on_ladders, r.is_a_floor], [0, false]);
});

await test('a clause whose category has nothing selectable is flagged', async () => {
  // EX-S-001 is the only Export Control clause and it is retired. So the
  // library still lists it — the history does not disappear — while the
  // category behind it is uncovered. That pair is exactly what WP-U13's
  // coverage-gap banner has to render, and it is why the flag sits on the row
  // rather than in a second query the screen might forget to make.
  const r = await one(
    `select state, category_uncovered from cw.library_entry where clause_id='EX-S-001'`);
  eq([r.state, r.category_uncovered], ['retired', true],
    'the last clause in a category was retired and the library did not notice');
});

await test('a covered category is not flagged', async () => {
  // The other half. A flag that is always true is not a flag.
  for (const id of ['LL-H-001', 'DP-S-001', 'DP-H-014']) {
    const r = await one(
      `select category_uncovered from cw.library_entry where clause_id=$1`, [id]);
    eq(r.category_uncovered, false, `${id} sits in a covered category, reported as a gap`);
  }
});

await test('the flag agrees with cw.coverage_gap on every row', async () => {
  // Rather than only asserting fixed answers, hold the two definitions
  // together — the same discipline 0017 used for its two expressions of one
  // rule. If the flag's WHERE and cw.coverage_gap's ever drift apart, this
  // fails whichever of them moved.
  const disagree = await rows(`
    select e.clause_id, e.severity, e.category_uncovered from cw.library_entry e
    where e.category_uncovered
       <> exists (select 1 from cw.coverage_gap g
                   where g.category_key = e.category_key
                     and g.severity = e.severity)`);
  eq(disagree, [], 'the library flag and cw.coverage_gap disagree');
});

await test('a Baseline clause is never reported as a gap', async () => {
  // cw.coverage_gap is defined over Standard and High only: a Baseline clause
  // is always included, so it cannot leave a gap behind it. The honest answer
  // is false — "no gap" — not null, which a screen renders as unknown.
  const r = await one(
    `select severity, category_uncovered from cw.library_entry where clause_id='DP-B-009'`);
  eq([r.severity, r.category_uncovered], ['Baseline', false]);
});

// ── The ladder board ──────────────────────────────────────────────────────
console.log('\nthe ladder board, including the ladders that are broken');

await test('an empty ladder appears, as one row, saying it is empty', async () => {
  // THE TEST THIS FILE EXISTS FOR. An inner join to the rungs deletes ladder 3
  // entirely, and the board then reports a configuration error as nothing at
  // all — which renders exactly like a healthy system.
  const r = await rows(
    `select rung, ladder_status, rungs::int as rungs
     from cw.ladder_board where ladder_id = 3`);
  eq(r.length, 1, 'the empty ladder is missing from the board, or duplicated');
  eq([r[0].rung, r[0].ladder_status, r[0].rungs], [null, 'empty', 0],
    'the empty ladder is on the board but does not say it is empty');
});

await test('every ladder is on the board', async () => {
  const seen = await rows(
    `select distinct ladder_id::int as id from cw.ladder_board order by id`);
  eq(seen.map(r => r.id), [1, 2, 3], 'a ladder is missing from the board');
});

await test('rungs come back in order, with the floor marked', async () => {
  const r = await rows(
    `select rung, clause_id, is_floor from cw.ladder_board
      where ladder_id = 2 order by rung`);
  eq(r.map(x => [x.rung, x.clause_id, x.is_floor]),
     [[0, 'DP-S-001', false], [1, 'DP-S-002', false]]);

  const floor = await one(
    `select clause_id, is_floor from cw.ladder_board where ladder_id = 1`);
  eq([floor.clause_id, floor.is_floor], ['DP-H-014', true]);
});

await test('the health on the line matches cw.ladder_health', async () => {
  // Same discipline as the coverage flag: the board repeats the health onto
  // each rung, and a repeated value is a value that can drift.
  const drift = await rows(`
    select b.ladder_id from cw.ladder_board b
    join cw.ladder_health h using (ladder_id)
    where b.ladder_status  is distinct from h.status
       or b.rungs          is distinct from h.rungs
       or b.unusable_rungs is distinct from h.unusable_rungs
       or b.has_floor      is distinct from h.has_floor`);
  eq(drift, [], 'the board reports a different health than cw.ladder_health');
});

await test('a ladder with no floor is reported floorless, not intact', async () => {
  const r = await one(
    `select distinct ladder_status, has_floor from cw.ladder_board where ladder_id = 2`);
  eq([r.ladder_status, r.has_floor], ['floorless', false]);
});

await test('an expired rung is carried as unusable, not hidden', async () => {
  // DP-S-002 lapsed in 2021. The rung is still ON the ladder — that is the
  // condition a Legal admin has to see and fix. A board that filtered it out
  // would report a degraded ladder as a shorter healthy one.
  const r = await one(
    `select rung_state, rung_selectable from cw.ladder_board
      where ladder_id = 2 and clause_id = 'DP-S-002'`);
  eq([r.rung_state, r.rung_selectable], ['expired', false],
    'the expired rung is missing from the board, or reported as usable');
});

await test('the rung carries the clause title', async () => {
  const r = await one(
    `select rung_title from cw.ladder_board where ladder_id = 1 and rung = 0`);
  eq(r.rung_title, '24h');
});

// ── The grant is the gate ─────────────────────────────────────────────────
console.log('\nwho may read them, tested rather than assumed');

await test('the five roles that read the registry read the library too', async () => {
  for (const role of ['viewer', 'requester', 'legal_reviewer', 'legal_admin', 'auditor']) {
    const r = await queryAs(role, `select count(*)::int n from cw.library_entry`);
    assert(r[0].n === 10, `${role} cannot read cw.library_entry`);
    const b = await queryAs(role, `select count(*)::int n from cw.ladder_board`);
    assert(b[0].n === 4, `${role} cannot read cw.ladder_board`);
  }
});

await test('the administrator may read the library, and write none of it', async () => {
  // OWNER DECISION U11, 2026-07-27, settling open-questions §9a.
  //
  // U5 settled the Administrator as content-visible and said never to call it
  // content-blind. Against the library it WAS: 0002 and 0003 granted select to
  // the five roles that existed then, 0013 created the role, and nobody
  // revisited the list. It read executed agreements perfectly well, so the two
  // halves of "contract content" disagreed with each other.
  //
  // THE GAP WAS THE GRANT, NOT THE POLICY. The read policies underneath are
  // `cw.app_role() is not null` and always admitted an Administrator; the
  // connection was refused before any policy was consulted, for want of a table
  // privilege. Which is why the fix is a grant and widens nobody else's reach.
  const lib = await queryAs('administrator', `select count(*)::int n from cw.library_entry`);
  assert(lib[0].n === 10, 'the administrator cannot read the library');
  const lad = await queryAs('administrator', `select count(*)::int n from cw.ladder_board`);
  assert(lad[0].n === 4, 'the administrator cannot read the ladders');

  // AND SIGHT IS ALL U11 OPENED — U5's boundary was WRITE and JUDGEMENT, not
  // sight. That half is NOT asserted here on purpose: administrator.test.mjs
  // sweeps every table in the schema against an explicit allow-list, which is a
  // stronger check than anything this file could write about two tables. A
  // second assertion of a guarantee something else already owns is a place for
  // the two to drift apart, not extra safety.
});

await test('a connection holding no application role reads neither view', async () => {
  // THE ASSUMPTION IN 0018's HEADER, MADE INTO A TEST. The file argues the
  // views need no WHERE-clause scoping because the underlying policies only
  // assert "you are somebody" — and that the GRANT carries that instead, since
  // a view bypasses the policy but not the grant.
  //
  // cw_app is exactly that connection: the doorway's pool login, a NOINHERIT
  // member of all six roles, holding none of their privileges until a request
  // says who it is. If the grant were not the gate, this is the state in which
  // the whole library would be readable by an idle connection.
  for (const view of ['library_entry', 'ladder_board']) {
    let threw = false;
    try {
      await db.exec(`reset role; set role cw_app;`);
      await db.query(`select 1 from cw.${view}`);
    } catch { threw = true; }
    finally { await db.exec('reset role;'); }
    assert(threw,
      `cw_app read cw.${view} while holding no application role — the grant is ` +
      `not the gate, and 0018's header is a document promising a control the ` +
      `code does not enforce`);
  }
});

await test('neither view offers a write path', async () => {
  // A view over a single table can be updatable in PostgreSQL. These join
  // several, so they are not — but "not by accident" and "not by design" read
  // the same until somebody checks.
  for (const view of ['library_entry', 'ladder_board']) {
    const r = await one(
      `select is_updatable, is_insertable_into from information_schema.views
        where table_schema='cw' and table_name=$1`, [view]);
    eq([r.is_updatable, r.is_insertable_into], ['NO', 'NO'],
      `cw.${view} is writable, which makes a convenience join a mutation surface`);
  }
});

await test('no role was granted anything but select', async () => {
  const bad = await rows(`
    select grantee, privilege_type, table_name
    from information_schema.role_table_grants
    where table_schema='cw'
      and table_name in ('library_entry','ladder_board')
      and privilege_type <> 'SELECT'
      and grantee <> current_user`);
  eq(bad, [], 'a consolidation view was granted more than select');
});

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
