// Cross-layer test: the Python loader's SQL vs the actual schema.
//
// engine/loader.py holds the two queries that turn the registry into a
// snapshot. Nothing else binds the Python layer to the SQL layer, so a renamed
// column would break resolution in production while both test suites stayed
// green. This extracts those queries verbatim and runs them against the real
// migrated schema.
//
//   node db/test/loader-sql.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');
const LOADER = join(HERE, '..', '..', 'engine', 'loader.py');

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

// Pull the queries straight out of the Python source — no second copy to drift.
const py = readFileSync(LOADER, 'utf8');
function extract(name) {
  const m = py.match(new RegExp(`${name}\\s*=\\s*"""([\\s\\S]*?)"""`));
  if (!m) throw new Error(`could not find ${name} in loader.py`);
  return m[1];
}
const CLAUSE_SQL = extract('CLAUSE_SQL');
const LADDER_SQL = extract('LADDER_SQL');
const RULE_SQL = extract('RULE_SQL');

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

await db.exec(`
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','loader@test',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('defs','Definitions','DF');
  insert into cw.clause (clause_id,category_key,severity,always_include,framework_section) values
    ('DP-H-014','data','High',false,null),
    ('DP-H-052','data','High',false,null),
    ('DF-B-001','defs','Standard',true,'1.1');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'GDPR','Notify within 24 hours.','2025-01-01','2027-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2027-01-01');
  insert into cw.clause_version (clause_id,version,title,body) values
    ('DF-B-001',1,'Definitions','Terms have the meanings given.');
  insert into cw.ladder (ladder_id,category_key,severity,owner) values (1,'data','High','R. Vance');
  insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
    (1,0,'DP-H-014',1,false), (1,1,'DP-H-052',1,true);
  insert into cw.clause_tag (clause_id,version,tag,tagged_by) values
    ('DP-H-014',1,'data:regulated','R. Vance'),
    ('DP-H-014',1,'jurisdiction:ny','R. Vance');
  insert into cw.conflict_rule (rule_id,version,name,severity,title,detail,predicate,approved_by) values
    ('GL-001',1,'Mixed governing law','High','Different jurisdictions',
     'Law and forum disagree.','{"conflicting_values":"jurisdiction"}','R. Vance'),
    ('IN-001',1,'Regulated data, no cyber','High','No cyber cover',
     'Regulated data with baseline insurance only.',
     '{"all_present":["data:regulated"],"none_present":["insurance:cyber"]}','R. Vance');`);

console.log('\nloader SQL against the real schema');

await test('CLAUSE_SQL runs', async () => {
  const r = await db.query(CLAUSE_SQL);
  assert(r.rows.length === 3, `expected 3 clause rows, got ${r.rows.length}`);
});

await test('CLAUSE_SQL returns exactly the columns clause_from_row reads', async () => {
  const r = await db.query(CLAUSE_SQL);
  const got = Object.keys(r.rows[0]).sort();
  eq(got, ['always_include', 'body', 'category', 'clause_id', 'expires_on',
           'framework_section', 'provenance_gap', 'selectable', 'severity',
           'state', 'tags', 'title', 'version']);
});

await test('category is the LABEL, not the key', async () => {
  const r = await db.query(CLAUSE_SQL);
  const cats = [...new Set(r.rows.map(x => x.category))].sort();
  eq(cats, ['Data Privacy', 'Definitions'],
     'manifests carry labels; returning the key would resolve nothing');
});

await test('provenance_gap survives the query', async () => {
  const r = await db.query(CLAUSE_SQL);
  const df = r.rows.find(x => x.clause_id === 'DF-B-001');
  eq(df.provenance_gap, true, 'the undated baseline clause must come back flagged');
});

await test('always_include and framework_section come through', async () => {
  const r = await db.query(CLAUSE_SQL);
  const df = r.rows.find(x => x.clause_id === 'DF-B-001');
  eq(df.always_include, true); eq(df.framework_section, '1.1');
});

await test('LADDER_SQL runs', async () => {
  const r = await db.query(LADDER_SQL);
  assert(r.rows.length === 1, `expected 1 ladder, got ${r.rows.length}`);
});

await test('LADDER_SQL returns exactly the columns ladder_from_row reads', async () => {
  const r = await db.query(LADDER_SQL);
  eq(Object.keys(r.rows[0]).sort(),
     ['category', 'floor_rung', 'rungs', 'severity', 'status']);
});

await test('rungs come back ordered, as clause refs', async () => {
  const r = await db.query(LADDER_SQL);
  eq(r.rows[0].rungs, ['DP-H-014@v1', 'DP-H-052@v1'],
     'rung order is the retreat order — it must not be arbitrary');
  eq(r.rows[0].floor_rung, 1);
  eq(r.rows[0].status, 'intact');
});

await test('CLAUSE_SQL returns tags as an array', async () => {
  const r = await db.query(CLAUSE_SQL);
  const dp = r.rows.find(x => x.clause_id === 'DP-H-014');
  eq(dp.tags, ['data:regulated', 'jurisdiction:ny'], 'tags drive every conflict rule');
  const df = r.rows.find(x => x.clause_id === 'DF-B-001');
  eq(df.tags, [], 'an untagged clause must yield an empty array, never null');
});

await test('RULE_SQL runs and returns the columns rule_from_row reads', async () => {
  const r = await db.query(RULE_SQL);
  eq(Object.keys(r.rows[0]).sort(),
     ['approved_by', 'detail', 'name', 'predicate', 'rule_id', 'severity', 'title', 'version']);
});

await test('predicates come back as usable objects', async () => {
  const r = await db.query(RULE_SQL);
  const gl = r.rows.find(x => x.rule_id === 'GL-001');
  eq(gl.predicate, { conflicting_values: 'jurisdiction' });
});

await test('the database refuses a predicate outside the grammar', async () => {
  // The grammar is enforced in BOTH layers. If either side drifts, rules that
  // the engine cannot evaluate could be published.
  let threw = false;
  try {
    await db.exec(`insert into cw.conflict_rule
      (rule_id,version,name,severity,title,detail,predicate,approved_by)
      values ('XX-001',1,'bad','High','t','d','{"exec":"anything"}','R')`);
  } catch (e) { threw = true; assert(String(e.message).includes('predicate_grammar')); }
  assert(threw, 'an unknown predicate key must be rejected by the schema');
});

await test('an empty predicate is refused by the database', async () => {
  let threw = false;
  try {
    await db.exec(`insert into cw.conflict_rule
      (rule_id,version,name,severity,title,detail,predicate,approved_by)
      values ('XX-002',1,'bad','High','t','d','{}','R')`);
  } catch (e) { threw = true; }
  assert(threw, 'an empty predicate would fire on every contract');
});

await test('retired rules drop out of active_conflict_rule', async () => {
  await db.exec(`update cw.conflict_rule set retired=true, retired_reason='superseded'
                 where rule_id='IN-001' and version=1`);
  const r = await db.query(RULE_SQL);
  assert(!r.rows.some(x => x.rule_id === 'IN-001'), 'a retired rule must stop firing');
});

await test('the newest effective version of a rule wins', async () => {
  await db.exec(`insert into cw.conflict_rule
    (rule_id,version,name,severity,title,detail,predicate,approved_by)
    values ('GL-001',2,'Mixed governing law','Standard','Different jurisdictions',
            'Downgraded after review.','{"conflicting_values":"jurisdiction"}','R. Vance')`);
  const r = await db.query(RULE_SQL);
  const gl = r.rows.filter(x => x.rule_id === 'GL-001');
  eq(gl.length, 1, 'exactly one version of a rule may be in force');
  eq(gl[0].version, 2); eq(gl[0].severity, 'Standard');
});

await test('rules are immutable once published', async () => {
  let threw = false;
  try {
    await db.exec(`update cw.conflict_rule set predicate='{"all_present":["x"]}'
                   where rule_id='GL-001' and version=1`);
  } catch (e) { threw = true; assert(String(e.message).includes('immutable')); }
  assert(threw, 'editing a published rule would rewrite why past contracts blocked');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
