// Run store tests (migration 0005).
//
// A run is a historical record of what was issued and why. Nothing about it may
// change, and it must remain resolvable however far the library moves on.
//
//   node db/test/run-store.test.mjs

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

const rows = async (s) => (await db.query(s)).rows;
const one = async (s) => (await rows(s))[0];

// Reading a RUN VIEW now requires being somebody.
//
// Migration 0025 scoped cw.run_summary and cw.run_contract in their own WHERE
// clauses, because a view runs with its owner's rights and never consults the
// policy on the table beneath it — the shape this repository has paid for
// several times. These two helpers exist because the tests below read those
// views, and the database OWNER, for whom cw.app_role() answers null
// (0013_administrator.sql:84-94), is now correctly shown nothing at all.
//
// The auditor is the honest reader for a question like "what does the run
// summary count": it is the role whose whole job is to see every run.
const { queryAs } = roleHelpers(db);
const rowsAsAuditor = (s) => queryAs('auditor', s, [], 'auditor@cw');
const oneAsAuditor = async (s) => (await rowsAsAuditor(s))[0];

const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64), R1 = 'c'.repeat(64);
const H3 = 'e'.repeat(64), R2 = 'f'.repeat(64);
// A result hash is a SHA-256 (WP-23 added the shape check to cw.run, to match
// cw.snapshot and cw.ruleset). These fixtures used 'h' and 'deadbeef' as
// stand-ins, which the constraint now correctly refuses.
const RH = 'd'.repeat(64);

await db.exec(`
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','buyer@cw',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('insu','Insurance','IN');
  insert into cw.clause (clause_id,category_key,severity) values
    ('DP-H-014','data','High'), ('DP-H-052','data','High');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'GDPR','Notify within 24 hours.','2025-01-01','2027-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2027-01-01');
  insert into cw.conflict_rule (rule_id,version,name,severity,title,detail,predicate,approved_by)
    values ('GL-001',1,'Mixed law','High','Different jurisdictions','…',
            '{"conflicting_values":"jurisdiction"}','R. Vance');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-001','Northwind','buyer@cw');

  insert into cw.snapshot (snapshot_id,taken_on) values ('${H1}','2026-07-25');
  insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable) values
    ('${H1}','DP-H-014',1,true), ('${H1}','DP-H-052',1,false);
  insert into cw.snapshot_ladder_rung
    (snapshot_id,category_key,severity,rung,clause_id,version,is_floor) values
    ('${H1}','data','High',0,'DP-H-014',1,false),
    ('${H1}','data','High',1,'DP-H-052',1,true);
  insert into cw.ruleset (ruleset_id) values ('${R1}');
  insert into cw.ruleset_member (ruleset_id,rule_id,version) values ('${R1}','GL-001',1);`);

console.log('\nrun records');

await test('governed snapshot and ruleset timestamps come from the database', async () => {
  const snapshot = await queryAs('legal_admin',
    `insert into cw.snapshot (snapshot_id,created_at)
     values ('${H3}','2099-01-01 00:00:00+00')
     returning created_at between statement_timestamp() - interval '5 seconds'
                            and statement_timestamp() as created_now`,
    [], 'legal@cw');
  const ruleset = await queryAs('legal_admin',
    `insert into cw.ruleset (ruleset_id,created_at)
     values ('${R2}','2000-01-01 00:00:00+00')
     returning created_at between statement_timestamp() - interval '5 seconds'
                            and statement_timestamp() as created_now`,
    [], 'legal@cw');
  eq(snapshot[0].created_now, true,
    'the caller-supplied snapshot creation time entered permanent evidence');
  eq(ruleset[0].created_now, true,
    'the caller-supplied ruleset creation time entered permanent evidence');
});

await test('a run records both pins', async () => {
  await db.exec(`insert into cw.run
    (run_id,agreement_id,vendor,value,manifest,manifest_source,snapshot_id,ruleset_id,
     result_hash,engine_version,gate_open,created_by)
    values ('RUN-001','AG-001','Northwind','$240K','{"risks":[]}','llm','${H1}','${R1}',
            '${RH}','clausewerk-engine/3',true,'buyer@cw')`);
  const r = await one(`select snapshot_id, ruleset_id from cw.run where run_id='RUN-001'`);
  eq(r.snapshot_id, H1); eq(r.ruleset_id, R1);
});

await test('a run cannot omit the library pin', async () => {
  await throws(() => db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,ruleset_id,result_hash,engine_version,
     gate_open,created_by)
    values ('RUN-X','N','{}','llm','${R1}','${RH}','clausewerk-engine/3',true,'buyer@cw')`),
    'null value', 'a run that cannot name its library is not reproducible');
});

await test('a run cannot omit the rules pin', async () => {
  await throws(() => db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,snapshot_id,result_hash,engine_version,
     gate_open,created_by)
    values ('RUN-Y','N','{}','llm','${H1}','${RH}','clausewerk-engine/3',true,'buyer@cw')`), 'null value');
});

await test('a run cannot pin a snapshot that was never stored', async () => {
  await throws(() => db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,snapshot_id,ruleset_id,result_hash,
     engine_version,gate_open,created_by)
    values ('RUN-Z','N','{}','llm','${H2}','${R1}','${RH}','clausewerk-engine/3',true,'buyer@cw')`),
    'foreign key', 'naming a snapshot nobody can rebuild is the failure this prevents');
});

// ── WP-23 · the run store carries the same CHECK discipline (finding D8) ────
console.log('\nthe run store is held to the same standard as the rest (WP-23)');

await test('a result hash that is not a hash is refused', async () => {
  // cw.snapshot and cw.ruleset have carried this shape check since they were
  // written. The column that names what the run PRODUCED did not — so the run
  // store was the one place a nonsense value could land, and it is the place
  // where nonsense is hardest to notice, because nobody reads a stored run
  // until there is a dispute.
  await throws(() => db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,snapshot_id,ruleset_id,result_hash,
     engine_version,gate_open,created_by)
    values ('RUN-BAD','N','{}','llm','${H1}','${R1}','not-a-hash',
            'clausewerk-engine/3',true,'buyer@cw')`),
    'result_hash_check', 'a result hash is a SHA-256 or it is not a result hash');
});

await test('a decision cannot record a severity the library cannot express', async () => {
  // Severity is a closed set on cw.clause and cw.ladder and was free text here.
  // Every report reads this column, so a decision at an invented severity is a
  // row nobody can reconcile with the library it came from.
  await throws(() => db.exec(`insert into cw.run_decision
    (run_id,seq,category_key,severity,reason)
    values ('RUN-001',90,'data','Critical','invented severity')`),
    'severity_check');
});

await test('a pinned ladder rung cannot be stored at a negative rung', async () => {
  await throws(() => db.exec(`insert into cw.snapshot_ladder_rung
    (snapshot_id,category_key,severity,rung,clause_id,version,is_floor)
    values ('${H1}','data','High',-1,'DP-H-014',1,false)`),
    'rung_check');
});

await test('a snapshot member cannot cite version zero', async () => {
  await throws(() => db.exec(`insert into cw.snapshot_member
    (snapshot_id,clause_id,version,selectable) values ('${H1}','DP-H-014',0,true)`),
    'member_version_positive');
});

await test('a decision with a real severity still records', async () => {
  // The positive control: the closed set is the set the library actually uses,
  // so an ordinary decision is unaffected. On its own run, because RUN-001's
  // decision and finding counts are asserted exactly further down.
  await db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,snapshot_id,ruleset_id,result_hash,
     engine_version,gate_open,created_by)
    values ('RUN-OK','N','{}','llm','${H1}','${R1}','${RH}',
            'clausewerk-engine/3',true,'other@cw');
    insert into cw.run_decision
      (run_id,seq,category_key,severity,clause_id,version,reason)
      values ('RUN-OK',0,'data','High','DP-H-014',1,'ordinary High selection');`);
  const r = await one(`select severity from cw.run_decision where run_id='RUN-OK' and seq=0`);
  eq(r.severity, 'High');
});

await test('an override must name its authorisation', async () => {
  await throws(() => db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,snapshot_id,ruleset_id,result_hash,
     engine_version,gate_open,overridden,created_by)
    values ('RUN-W','N','{}','llm','${H1}','${R1}','${RH}','clausewerk-engine/3',true,true,'buyer@cw')`),
    'override_needs_ref');
});

// ── Which engine produced the hash (WP-32) ─────────────────────────────────
// Three packages have changed how `result_hash` is computed. Until this column
// existed, a stored run of one engine and a stored run of another were
// indistinguishable — so a hash that no longer reproduces looked exactly like
// tampering, and one that reproduced by luck looked exactly like proof.

await test('a run records which engine produced its result hash', async () => {
  const r = await one(`select engine_version, result_hash from cw.run where run_id='RUN-001'`);
  eq(r.engine_version, 'clausewerk-engine/3');
  assert(r.result_hash, 'and the hash it qualifies');
});

await test('a run cannot omit which engine produced it', async () => {
  // NOT NULL with no default, deliberately: a default would let a writer that
  // does not know its own version record a run anyway, and the column would
  // then read like a fact while meaning "whatever the schema guessed".
  await throws(() => db.exec(`insert into cw.run
    (run_id,vendor,manifest,manifest_source,snapshot_id,ruleset_id,result_hash,
     gate_open,created_by)
    values ('RUN-V','N','{}','llm','${H1}','${R1}','${RH}',true,'buyer@cw')`),
    'null value',
    'an unattributable hash cannot be told apart from a hash of another engine');
});

await test('the engine version reaches the permanent record', async () => {
  const e = await one(`select payload from cw.audit_event
                       where event_type='run_recorded' and subject='RUN-001'`);
  eq(e.payload.engine_version, 'clausewerk-engine/3',
     'the audit log is where this question gets asked years later');
});

// ── Both provenance figures, in the system record only (WP-17) ─────────────
// Owner decision, 2026-07-25: neither count is printed on the contract. They
// live here, where Legal and auditors read them.

await test('both provenance counts are recorded on the run', async () => {
  const r = await one(`select authored_chars, ai_origin_chars from cw.run where run_id='RUN-001'`);
  eq(r.authored_chars, 0, 'the headline claim: this system wrote nothing');
  eq(r.ai_origin_chars, 0,
     'and no AI-originated wording reached this contract — a real zero, not an absent figure');
});

console.log('\ndecisions and findings');

await test('decisions record selections and nulls alike', async () => {
  await db.exec(`insert into cw.run_decision
    (run_id,seq,category_key,severity,clause_id,version,reason,suppressed) values
    ('RUN-001',0,'data','High','DP-H-014',1,'Matched High variant',
     array['DP-H-052@v1']),
    ('RUN-001',1,'insu','High',null,null,'No clause available in Ledger','{}')`);
  const r = await rows(`select clause_id, reason from cw.run_decision
                        where run_id='RUN-001' order by seq`);
  eq(r[1].clause_id, null, 'an unresolved risk is recorded, never omitted');
});

await test('a half-written selection is refused', async () => {
  await throws(() => db.exec(`insert into cw.run_decision
    (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-001',9,'data','High','DP-H-014',null,'broken')`),
    'selection_is_whole');
});

await test('a decision cannot cite a clause version that does not exist', async () => {
  await throws(() => db.exec(`insert into cw.run_decision
    (run_id,seq,category_key,severity,clause_id,version,reason)
    values ('RUN-001',10,'data','High','DP-H-014',99,'ghost')`), 'foreign key');
});

await test('findings cite the exact rule version', async () => {
  await db.exec(`insert into cw.run_finding
    (run_id,seq,rule_id,rule_version,severity,title,detail,refs)
    values ('RUN-001',0,'GL-001',1,'High','Different jurisdictions','…',
            array['DP-H-014@v1'])`);
  const f = await one(`select rule_id, rule_version from cw.run_finding where run_id='RUN-001'`);
  eq(f.rule_id, 'GL-001'); eq(f.rule_version, 1);
});

await test('a finding cannot cite a rule version that does not exist', async () => {
  await throws(() => db.exec(`insert into cw.run_finding
    (run_id,seq,rule_id,rule_version,severity,title)
    values ('RUN-001',9,'GL-001',7,'High','ghost')`), 'foreign key');
});

console.log('\nimmutability');

for (const [table, sql] of [
  ['run', `update cw.run set vendor='Someone Else' where run_id='RUN-001'`],
  ['run_decision', `update cw.run_decision set reason='rewritten' where run_id='RUN-001' and seq=0`],
  ['run_finding', `update cw.run_finding set severity='Standard' where run_id='RUN-001' and seq=0`],
  ['snapshot_member', `update cw.snapshot_member set selectable=false where snapshot_id='${H1}' and clause_id='DP-H-014'`],
]) {
  await test(`${table} cannot be edited`, async () => {
    await throws(() => db.exec(sql), 'immutable');
  });
}

await test('a run cannot be deleted', async () => {
  // WP-25c (settled decision S0-3). This used to assert the delete was a silent
  // NO-OP: the row survived and the caller was told nothing. That is finding
  // D9's pattern exactly — an application bug that deletes runs is then
  // indistinguishable from an application that never tried.
  //
  // Both halves are asserted, and the original one is kept: the statement must
  // RAISE, and the row must still be there. Dropping the survival check in
  // favour of the raise would trade one assertion for another rather than
  // adding one.
  await throws(() => db.exec(`delete from cw.run where run_id='RUN-001'`),
    'cannot be deleted', 'deleting history must be refused, not silently ignored');
  const r = await one(`select count(*)::int n from cw.run where run_id='RUN-001'`);
  eq(r.n, 1, 'and the row is still there');
});

await test('a run cannot be truncated around the guard', async () => {
  // TRUNCATE fires neither row triggers nor ON DELETE rules, so before WP-25b
  // every guarantee above could be walked past by one statement.
  await throws(() => db.exec(`truncate cw.run cascade`),
    'cannot be', 'truncate must not be the way around immutability');
  const r = await one(`select count(*)::int n from cw.run where run_id='RUN-001'`);
  eq(r.n, 1, 'the run store survives a truncate attempt');
});

await test('a referenced pin cannot gain members afterwards', async () => {
  await throws(() => db.exec(`insert into cw.snapshot_member
    (snapshot_id,clause_id,version,selectable)
    values ('${H1}','DP-H-014',1,false)`),
    'referenced snapshot cannot gain',
    'a later insert changed the frozen selectable flag behind an existing run');
  await throws(() => db.exec(`insert into cw.snapshot_ladder_rung
    (snapshot_id,category_key,severity,rung,clause_id,version,is_floor)
    values ('${H1}','data','High',2,'DP-H-014',1,false)`),
    'referenced snapshot cannot gain',
    'a later insert extended the ladder behind an existing run');
  await db.exec(`insert into cw.ruleset_member
    (ruleset_id,rule_id,version) values ('${R1}','GL-001',1)
    on conflict do nothing`);
  await db.exec(`insert into cw.conflict_rule
    (rule_id,version,name,severity,title,detail,predicate,approved_by)
    values ('GL-002',1,'Second rule','High','Second','detail',
            '{"conflicting_values":"jurisdiction"}','R. Vance')`);
  await throws(() => db.exec(`insert into cw.ruleset_member
    (ruleset_id,rule_id,version) values ('${R1}','GL-002',1)`),
    'referenced ruleset cannot gain',
    'a later insert extended the ruleset behind an existing run');
});

console.log('\nresolvable forever');

await test('a run still resolves its clauses after they are retired', async () => {
  // Three years of Legal activity.
  await db.exec(`update cw.clause_version set retired=true, retired_reason='superseded'
                 where clause_id='DP-H-014' and version=1`);
  const c = await oneAsAuditor(`select title, body from cw.run_contract
                       where run_id='RUN-001' and seq=0`);
  assert(c.body.includes('24 hours'),
    'immutable clause versions are what make an old run readable at all');
});

await test('the pinned snapshot rebuilds with its frozen flags', async () => {
  const m = await rows(`select clause_id, selectable from cw.snapshot_member
                        where snapshot_id='${H1}' order by clause_id`);
  eq(m, [{ clause_id: 'DP-H-014', selectable: true },
         { clause_id: 'DP-H-052', selectable: false }],
     'the frozen flags must survive the clause being retired since');
});

await test('the run summary counts what matters', async () => {
  const s = await oneAsAuditor(`select decisions, unresolved, findings, blocking
                       from cw.run_summary where run_id='RUN-001'`);
  eq(s.decisions, 2); eq(s.unresolved, 1); eq(s.findings, 1); eq(s.blocking, 1);
});

await test('recording a run is audited with both pins', async () => {
  const e = await one(`select payload from cw.audit_event
                       where event_type='run_recorded' order by seq desc limit 1`);
  eq(e.payload.snapshot, H1); eq(e.payload.ruleset, R1);
});

console.log('\nrow-level security');

await test('a requester sees only their own runs', async () => {
  await db.exec(`reset role;
    insert into cw.agreement (agreement_id,counterparty,requester)
      values ('AG-002','Contoso','other@cw');
    insert into cw.snapshot (snapshot_id,taken_on)
      values ('${H2}','2026-07-26');
    insert into cw.snapshot_member (snapshot_id,clause_id,version,selectable)
      values ('${H2}','DP-H-052',1,true);
    insert into cw.snapshot_ladder_rung
      (snapshot_id,category_key,severity,rung,clause_id,version,is_floor)
      values ('${H2}','data','High',0,'DP-H-052',1,true);
    insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                        snapshot_id,ruleset_id,result_hash,engine_version,gate_open,created_by)
      values ('RUN-002','AG-002','Contoso','{}','llm','${H2}','${R2}','${RH}',
              'clausewerk-engine/3',true,'other@cw');
    select set_config('cw.role','requester',false);
    select set_config('cw.actor','buyer@cw',false);`);
  await db.exec(`set role cw_requester;`);
  const r = await rows(`select run_id from cw.run order by run_id`);
  eq(r.map(x => x.run_id), ['RUN-001'], "a buyer must not see another buyer's runs");
});

await test('a requester sees only pins referenced by their visible runs', async () => {
  const snapshots = await rows(`select snapshot_id from cw.snapshot order by snapshot_id`);
  eq(snapshots.map(x => x.snapshot_id), [H1],
    "a requester enumerated another deal's snapshot headers");
  const members = await rows(
    `select distinct snapshot_id from cw.snapshot_member order by snapshot_id`);
  eq(members.map(x => x.snapshot_id), [H1],
    "a requester enumerated another deal's pinned clause pool");
  const ladders = await rows(
    `select distinct snapshot_id from cw.snapshot_ladder_rung order by snapshot_id`);
  eq(ladders.map(x => x.snapshot_id), [H1],
    "a requester enumerated another deal's pinned ladder");
  const rulesets = await rows(`select ruleset_id from cw.ruleset order by ruleset_id`);
  eq(rulesets.map(x => x.ruleset_id), [R1],
    'a requester enumerated rulesets unrelated to their runs');
  const ruleMembers = await rows(
    `select distinct ruleset_id from cw.ruleset_member order by ruleset_id`);
  eq(ruleMembers.map(x => x.ruleset_id), [R1],
    'a requester enumerated rule pins unrelated to their runs');
});

await test('an auditor sees every run', async () => {
  // The expected count moved from 2 to 3 when WP-23's positive control added
  // RUN-OK. Same assertion, same strength — "every run" is still every run in
  // the fixture, and the number is checked against what the owner can see so it
  // cannot drift quietly again.
  await db.exec(`reset role;`);
  const all = await one(`select count(*)::int n from cw.run`);
  await db.exec(`reset role; select set_config('cw.role','auditor',false); set role cw_auditor;`);
  const r = await one(`select count(*)::int n from cw.run`);
  eq(all.n, 3, 'the fixture holds three runs');
  eq(r.n, 3);
});

await test('an auditor sees the complete pin store', async () => {
  const checks = [
    ['snapshot', 3],
    ['snapshot_member', 3],
    ['snapshot_ladder_rung', 3],
    ['ruleset', 2],
    ['ruleset_member', 1],
  ];
  for (const [table, expected] of checks) {
    const r = await queryAs('auditor',
      `select count(*)::int n from cw.${table}`, [], 'auditor@cw');
    eq(r[0].n, expected, `the auditor lost rows from cw.${table}`);
  }
});

await test('a viewer cannot read runs', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  await throws(() => db.exec(`select * from cw.run limit 1`), 'permission denied for table run');
});

await db.exec(`reset role;`);

// ── Whose deal a run may be recorded against (0025) ────────────────────────
//
// The settled decision of 2026-07-27 — every assembly run belongs to a deal —
// had no rule behind it: cw.run's INSERT policy checked the ROLE and nothing
// else, so any requester could record a run against any deal in the system.
// Every assertion below is written in BOTH directions, because a rule that
// only ever refuses is indistinguishable from one that refuses everybody.

console.log('\na run belongs to the caller\'s deal');

const { execAs, mustNotWrite } = roleHelpers(db);

const runRow = (id, agreement, by) =>
  `insert into cw.run (run_id,agreement_id,vendor,manifest,manifest_source,
                       snapshot_id,ruleset_id,result_hash,engine_version,gate_open,
                       created_by,created_at)
   values ('${id}','${agreement}','Contoso','{}','llm','${H1}','${R1}','${RH}',
           'clausewerk-engine/3',true,'${by}','2099-01-01 00:00:00+00')`;

await test('a requester may record a run against a deal they own', async () => {
  await db.exec(`reset role;
    insert into cw.agreement (agreement_id,counterparty,requester)
      values ('AG-OWN','Contoso','buyer@cw');`);
  await execAs('requester',
    runRow('RUN-OWN', 'AG-OWN', 'impostor@cw'), 'buyer@cw');
  const r = await one(`select created_by, 1::int n
                       from cw.run where run_id='RUN-OWN'`);
  eq(r.n, 1, 'a requester cannot record a run on their own deal — the rule is inverted');
});

await test('a run records the authenticated creator', async () => {
  const r = await one(`select created_by,
                              created_at between now() - interval '1 minute'
                                             and now() as created_now
                       from cw.run where run_id='RUN-OWN'`);
  eq(r.created_by, 'buyer@cw',
    'the caller-supplied creator entered the permanent run record');
  eq(r.created_now, true,
    'the caller-supplied creation time entered the permanent run record');
});

await test("a requester may NOT record a run against another requester's deal", async () => {
  // AG-002 belongs to other@cw, seeded above.
  await mustNotWrite('requester', runRow('RUN-NOPE', 'AG-002', 'buyer@cw'));
  await db.exec('reset role;');
  const r = await one(`select count(*)::int n from cw.run where run_id='RUN-NOPE'`);
  eq(r.n, 0);
});

await test('a requester may not record a run with no deal at all', async () => {
  await mustNotWrite('requester',
    `insert into cw.run (run_id,vendor,manifest,manifest_source,snapshot_id,
                         ruleset_id,result_hash,engine_version,gate_open,created_by)
     values ('RUN-NODEAL','Contoso','{}','llm','${H1}','${R1}','${RH}',
             'clausewerk-engine/3',true,'buyer@cw')`);
});

await test('legal_reviewer and legal_admin may record against a deal they do not own', async () => {
  // The other direction, and it is load-bearing: cw.owns_agreement resolves to
  // `requester = cw.app_actor()`, and neither Legal role ever appears there. A
  // single-condition rule would have locked Legal out of every deal at once.
  await execAs('legal_reviewer', runRow('RUN-LR', 'AG-002', 'legal@cw'), 'legal@cw');
  await execAs('legal_admin', runRow('RUN-LA', 'AG-002', 'legal@cw'), 'legal@cw');
  await db.exec('reset role;');
  const r = await one(
    `select count(*)::int n from cw.run where run_id in ('RUN-LR','RUN-LA')`);
  eq(r.n, 2, 'Legal must be able to assemble against any deal');
});

await test('a requester may not append a decision to a run they cannot see', async () => {
  // Without this, scoping cw.run achieves nothing: the requester refused a run
  // row on somebody else's deal could still append decisions to that run,
  // permanently, into a table with no UPDATE and no DELETE grant.
  await mustNotWrite('requester',
    `insert into cw.run_decision (run_id,seq,category_key,severity,reason)
     values ('RUN-LR',99,'data','Standard','appended by somebody else')`,
    { allowSilent: false });
});

await test('a requester may not append a finding to a run they cannot see', async () => {
  await mustNotWrite('requester',
    `insert into cw.run_finding (run_id,seq,rule_id,rule_version,severity,title)
     values ('RUN-LR',99,'GL-001',1,'High','appended by somebody else')`,
    { allowSilent: false });
});

await test('a requester CAN append a decision to their own run', async () => {
  await execAs('requester',
    `insert into cw.run_decision (run_id,seq,category_key,severity,reason)
     values ('RUN-OWN',0,'data','Standard','their own run')`, 'buyer@cw');
  await db.exec('reset role;');
  const r = await one(`select count(*)::int n from cw.run_decision where run_id='RUN-OWN'`);
  eq(r.n, 1, 'the decision rule refuses everybody, which is not the rule');
});

await test('the read policies 0025 did not touch are unchanged', async () => {
  // Asserted against the catalogue rather than inferred from behaviour. A
  // careless DROP would leave a table momentarily without a policy, which
  // fails closed and surfaces as a confusing refusal somewhere else entirely.
  const p = await rows(
    `select polname from pg_policy
     where polrelid = 'cw.run'::regclass order by polname`);
  const names = p.map(x => x.polname);
  assert(names.includes('read_scoped'), 'cw.run lost its read policy');
  assert(names.includes('administrator_reads'),
    "0013's administrator read policy on cw.run did not survive 0025");
  assert(names.includes('write_scoped'), 'cw.run has no write policy at all');
});

// ── The two run views answer only what the asker may see (0025) ────────────

console.log('\nthe run views scope themselves');

await test('four roles are scoped by the view, and see exactly their own runs', async () => {
  await db.exec('reset role;');
  const everything = (await one(`select count(*)::int n from cw.run`)).n;

  for (const role of ['legal_reviewer', 'legal_admin', 'auditor']) {
    const seen = await queryAs(role, `select count(*)::int n from cw.run_summary`);
    eq(seen[0].n, everything, `${role} must see every run through the summary`);
  }

  const buyer = await queryAs('requester',
    `select run_id from cw.run_summary order by run_id`, [], 'buyer@cw');
  assert(buyer.length > 0 && buyer.length < everything,
    `a requester saw ${buyer.length} of ${everything} runs — the view is not scoped`);
  assert(!buyer.some(x => x.run_id === 'RUN-002'),
    "a requester read another requester's run through cw.run_summary");
});

await test('the viewer is refused both views by GRANT, not filtered to nothing', async () => {
  // NOT an empty result set, and the difference matters: cw_viewer holds no
  // select grant on either view, so it never reaches the WHERE clause at all.
  //
  // A test expecting zero rows would be green today for the wrong reason and
  // red the day somebody adds a grant. Assert the refusal.
  for (const view of ['cw.run_summary', 'cw.run_contract']) {
    let refused = '';
    try { await queryAs('viewer', `select 1 from ${view} limit 1`); }
    catch (e) { refused = String(e.message); }
    assert(/permission denied/i.test(refused),
      `a viewer was not refused ${view} for want of a grant: ${refused || 'it answered'}`);
  }
});

await test('the administrator sees every assembly, and never an empty list', async () => {
  // CHANGED BY OWNER DECISION, 2026-07-27, migration 0026. This role was in the
  // test above until today, refused both views because they predate it.
  //
  // The trap the decision had to avoid, and the reason 0026 is two changes:
  // granting the views WITHOUT admitting the role to their scoping clauses
  // leaves every query succeeding and returning nothing. An administrator who
  // can see every finding in the company would be told no contract has ever
  // been assembled. So this asserts the COUNT, not the absence of an error.
  await db.exec('reset role;');
  const everything = (await one(`select count(*)::int n from cw.run`)).n;
  assert(everything > 0, 'no runs in the fixture, so this proves nothing');

  const seen = await queryAs('administrator', `select count(*)::int n from cw.run_summary`);
  eq(seen[0].n, everything,
     'the administrator holds the grant and was filtered to nothing — the '
     + 'misleading empty state, which is worse than the refusal it replaced');
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
