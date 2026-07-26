// Cross-layer test: the Python engine's WRITE side vs the actual schema.
//
// `loader-sql.test.mjs` anchors the read path — it extracts the engine's
// queries verbatim and runs them against the real migrated schema, so a renamed
// column cannot drift silently. There was no counterpart for the write path,
// and the consequence was not hypothetical: a write-side suite does exist, but
// its INSERTs are hand-written, and they used `category_key` while the engine
// emitted `category`. Two green suites, one broken seam. The hand-written
// fixture is exactly what hid it.
//
// So this suite writes nothing by hand. It takes whatever `snapshot_rows()` and
// `run_rows()` emit, builds the INSERT from the emitted keys, and lets the
// database judge. Then it reads the rows back out and rebuilds the snapshot
// through `snapshot_from_rows`, asserting the id is unchanged — because the
// category has to be translated in BOTH directions and only the round trip can
// see the second one.
//
//   node db/test/writer-sql.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');
const BACKEND = join(HERE, '..', '..');
const LOADER = join(BACKEND, 'engine', 'loader.py');
const PYTHON = process.env.CW_PYTHON || 'python';

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
async function throws(fn, needle) {
  let threw = false;
  try { await fn(); } catch (e) { threw = true; assert(String(e.message).includes(needle),
    `expected ${needle}, got ${e.message}`); }
  assert(threw, `expected a failure mentioning ${needle}`);
}

// ── The engine, driven as a subprocess ─────────────────────────────────────
// Imported, never re-implemented. A second copy of the mapping in JavaScript
// would be one more thing free to drift — the defect this suite exists to stop.

function py(script, payload) {
  const r = spawnSync(PYTHON, ['-c', script], {
    cwd: BACKEND, input: JSON.stringify(payload), encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`python failed:\n${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}

const EMIT = `
import json, sys
from datetime import date
from engine.loader import build_ruleset, build_snapshot
from engine.manifest import CategoryMap, check_manifest
from engine.model import Manifest, Risk
from engine.resolution import resolve
from engine.run import ruleset_rows, run_rows, snapshot_rows
from engine.validation import validate

p = json.load(sys.stdin)
cats = CategoryMap.from_rows(p["category_rows"])
snap = build_snapshot(p["clause_rows"], p["ladder_rows"], date.fromisoformat(p["taken_on"]))
rules = build_ruleset(p["rule_rows"])
manifest = check_manifest(
    Manifest(vendor=p["vendor"], value=p.get("value"), source="llm",
             risks=tuple(Risk(**r) for r in p["risks"])), cats)
res = resolve(manifest, snap)
val = validate(res.decisions, rules)

rows = {}
rows.update(snapshot_rows(snap, cats))
rows.update(ruleset_rows(rules))
rows.update(run_rows(p["run_id"], manifest, res, val, cats, created_by="buyer@cw"))
json.dump({
    "snapshot_id": snap.snapshot_id,
    "result_hash": res.result_hash,
    "ruleset_id": rules.ruleset_id,
    "ladder_status": {l.category + "|" + l.severity: l.status for l in snap.ladders},
    "dropped": [r.category for r in manifest.dropped],
    "rows": rows,
}, sys.stdout, default=str)
`;

const REBUILD = `
import json, sys
from datetime import date
from engine.manifest import CategoryMap
from engine.run import snapshot_from_rows

p = json.load(sys.stdin)
cats = CategoryMap.from_rows(p["category_rows"])
snap = snapshot_from_rows(p["member_rows"], p["clause_rows"], p["rung_rows"],
                          date.fromisoformat(p["taken_on"]), categories=cats)
json.dump({
    "snapshot_id": snap.snapshot_id,
    "ladder_status": {l.category + "|" + l.severity: l.status for l in snap.ladders},
    "ladder_categories": [l.category for l in snap.ladders],
}, sys.stdout)
`;

// ── Inserting engine output, with nothing edited by hand ───────────────────

function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v))
    return v.length ? `array[${v.map(x => lit(x)).join(',')}]::text[]` : `'{}'::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// `snapshot` and `ruleset` are content-addressed: two runs against an unchanged
// library share one row, which is the point of hashing them. A real writer
// inserts them if absent, so this does too. Nothing about the emitted column
// names or values is touched either way.
const SHARED = new Set(['snapshot', 'ruleset', 'ruleset_member']);

async function insertEmitted(db, table, rows) {
  for (const row of rows) {
    const cols = Object.keys(row);
    await db.exec(
      `insert into cw.${table} (${cols.join(',')}) ` +
      `values (${cols.map(c => lit(row[c])).join(',')})` +
      (SHARED.has(table) ? ' on conflict do nothing' : ''));
  }
}

const ORDER = ['snapshot', 'snapshot_member', 'snapshot_ladder_rung',
               'ruleset', 'ruleset_member', 'run', 'run_decision', 'run_finding'];

// ── Schema and seed ────────────────────────────────────────────────────────

const py_src = readFileSync(LOADER, 'utf8');
function extract(name) {
  const m = py_src.match(new RegExp(`${name}\\s*=\\s*"""([\\s\\S]*?)"""`));
  if (!m) throw new Error(`could not find ${name} in loader.py`);
  return m[1];
}
const CLAUSE_SQL = extract('CLAUSE_SQL');
const LADDER_SQL = extract('LADDER_SQL');
const RULE_SQL = extract('RULE_SQL');
const CATEGORY_SQL = 'select key, label from cw.category order by key';

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

await db.exec(`
  select set_config('cw.role','legal_admin',false);
  select set_config('cw.actor','buyer@cw',false);
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('disp','Dispute Resolution','DR'),
    ('defs','Definitions','DF'), ('insu','Insurance','IN');
  insert into cw.clause (clause_id,category_key,severity,always_include,framework_section) values
    ('DP-H-014','data','High',false,null),
    ('DP-H-052','data','High',false,null),
    ('DR-S-044','disp','Standard',false,null),
    ('DF-B-001','defs','Standard',true,'1.1');
  insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
    ('DP-H-014',1,'GDPR','Notify within 24 hours.','2025-01-01','2027-01-01'),
    ('DP-H-052',1,'48h','Notify within 48 hours.','2025-01-01','2027-01-01'),
    ('DR-S-044',1,'Arbitration','Disputes go to arbitration in London.','2025-01-01','2027-01-01');
  insert into cw.clause_version (clause_id,version,title,body) values
    ('DF-B-001',1,'Definitions','Terms have the meanings given.');
  insert into cw.ladder (ladder_id,category_key,severity,owner) values (1,'data','High','R. Vance');
  insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
    (1,0,'DP-H-014',1,false), (1,1,'DP-H-052',1,true);
  insert into cw.clause_tag (clause_id,version,tag,tagged_by) values
    ('DP-H-014',1,'data:regulated','R. Vance'),
    ('DP-H-014',1,'jurisdiction:ny','R. Vance'),
    ('DR-S-044',1,'jurisdiction:london','R. Vance');
  insert into cw.conflict_rule (rule_id,version,name,severity,title,detail,predicate,approved_by)
    values ('GL-001',1,'Mixed governing law','High','Different jurisdictions',
            'Law and forum disagree.','{"conflicting_values":"jurisdiction"}','R. Vance');`);

const rows = async (sql) => (await db.query(sql)).rows;
const TAKEN_ON = '2026-07-25';

// The manifest carries one category nobody defined. It must not survive the
// trust boundary, and it must not turn up as a library coverage gap.
const RISKS = [
  { category: 'Data Privacy', severity: 'High', justification: 'EU PII in scope' },
  { category: 'Dispute Resolution', severity: 'Standard', justification: 'cross-border' },
  { category: 'Insurance', severity: 'High', justification: 'no clause exists' },
  { category: 'Quantum Indemnity', severity: 'High', justification: 'invented by the model' },
];

async function emit(runId) {
  return py(EMIT, {
    run_id: runId, vendor: 'Northwind Analytics', value: '$240K', risks: RISKS,
    taken_on: TAKEN_ON,
    category_rows: await rows(CATEGORY_SQL),
    clause_rows: await rows(CLAUSE_SQL),
    ladder_rows: await rows(LADDER_SQL),
    rule_rows: await rows(RULE_SQL),
  });
}

async function rebuildFromDatabase(snapshotId, categoryRows) {
  return py(REBUILD, {
    taken_on: TAKEN_ON,
    category_rows: categoryRows || await rows(CATEGORY_SQL),
    member_rows: await rows(
      `select clause_id, version, selectable from cw.snapshot_member
       where snapshot_id = '${snapshotId}'`),
    rung_rows: await rows(
      `select category_key, severity, rung, clause_id, version, is_floor
       from cw.snapshot_ladder_rung where snapshot_id = '${snapshotId}' order by rung`),
    clause_rows: await rows(CLAUSE_SQL),
  });
}

console.log('\nthe engine write side against the real schema');

const intact = await emit('RUN-001');

await test('every table the engine emits is a table the schema has', async () => {
  eq(Object.keys(intact.rows).sort(), [...ORDER].sort(),
     'a table the engine writes to that nobody migrated is a run that never lands');
});

await test('snapshot_rows output inserts with nothing edited by hand', async () => {
  for (const t of ['snapshot', 'snapshot_member', 'snapshot_ladder_rung'])
    await insertEmitted(db, t, intact.rows[t]);
  const n = await rows(`select count(*)::int as n from cw.snapshot_ladder_rung
                        where snapshot_id='${intact.snapshot_id}'`);
  eq(n[0].n, 2, 'both rungs must be stored');
});

await test('the emitted rung category satisfies the FK to cw.category', async () => {
  const r = await rows(`select distinct category_key from cw.snapshot_ladder_rung
                        where snapshot_id='${intact.snapshot_id}'`);
  eq(r.map(x => x.category_key), ['data'],
     'the column is category_key with an FK; a label here fails the INSERT');
});

await test('run_rows output inserts with nothing edited by hand', async () => {
  for (const t of ['ruleset', 'ruleset_member', 'run', 'run_decision', 'run_finding'])
    await insertEmitted(db, t, intact.rows[t]);
  const r = await rows(`select result_hash, snapshot_id from cw.run where run_id='RUN-001'`);
  eq(r[0].result_hash, intact.result_hash);
  eq(r[0].snapshot_id, intact.snapshot_id);
});

await test('a decision names a category the registry defines', async () => {
  const r = await rows(`select distinct category_key from cw.run_decision
                        where run_id='RUN-001' order by category_key`);
  eq(r.map(x => x.category_key), ['data', 'defs', 'disp', 'insu']);
});

await test('cw.run_contract still reports the human label', async () => {
  const r = await rows(`select distinct category from cw.run_contract
                        where run_id='RUN-001' order by category`);
  eq(r.map(x => x.category),
     ['Data Privacy', 'Definitions', 'Dispute Resolution', 'Insurance'],
     'the key is for the FK; the report a lawyer reads must still say the label');
});

// ── The round trip — the half the obvious fix does not reach ───────────────

await test('the round-tripped snapshot id is unchanged', async () => {
  const back = await rebuildFromDatabase(intact.snapshot_id);
  eq(back.snapshot_id, intact.snapshot_id,
     'a stored run that rebuilds to a different id is a run nobody can reproduce');
});

await test('the ladder comes back as a label, not a key', async () => {
  const back = await rebuildFromDatabase(intact.snapshot_id);
  eq(back.ladder_categories, ['Data Privacy']);
});

await test('reverting the READ-side translation changes the id', async () => {
  // Proves this suite can fail. An identity map stands in for the old code,
  // which put the stored key straight into the hashed Ladder.category.
  const identity = (await rows(CATEGORY_SQL)).map(c => ({ key: c.key, label: c.key }));
  const back = await rebuildFromDatabase(intact.snapshot_id, identity);
  assert(back.snapshot_id !== intact.snapshot_id,
     'if the key survives into the fingerprint the id must move — it did not, so ' +
     'this test could never have caught the defect it exists for');
  eq(back.ladder_categories, ['data']);
});

await test('reverting the WRITE-side translation is refused by the database', async () => {
  // The other direction, proved the way production would meet it.
  const bad = intact.rows.snapshot_ladder_rung.map(
    r => ({ ...r, category_key: 'Data Privacy', rung: r.rung + 10 }));
  await throws(() => insertEmitted(db, 'snapshot_ladder_rung', bad), 'foreign key');
});

// ── Ladder status: derived in Python, judged by the view ───────────────────

await test('the derived status agrees with cw.ladder_health when intact', async () => {
  const health = await rows(`select status from cw.ladder_health where ladder_id=1`);
  eq(health[0].status, 'intact');
  eq(intact.ladder_status['Data Privacy|High'], 'intact');
  const back = await rebuildFromDatabase(intact.snapshot_id);
  eq(back.ladder_status['Data Privacy|High'], 'intact');
});

await test('a degraded ladder is stored and rebuilt as degraded', async () => {
  // Retire rung 0. The floor rung is still usable, which is what
  // cw.ladder_health calls `degraded` — a state the view can really emit.
  await db.exec(`update cw.clause_version set retired=true, retired_reason='superseded'
                 where clause_id='DP-H-014' and version=1`);
  const health = await rows(`select status from cw.ladder_health where ladder_id=1`);
  eq(health[0].status, 'degraded', 'the fixture must be in a state the view produces');

  const degraded = await emit('RUN-002');
  eq(degraded.ladder_status['Data Privacy|High'], 'degraded');
  assert(degraded.snapshot_id !== intact.snapshot_id,
     'status is in the fingerprint, so a damaged ladder is a different library');

  for (const t of ORDER) await insertEmitted(db, t, degraded.rows[t]);

  const back = await rebuildFromDatabase(degraded.snapshot_id);
  eq(back.ladder_status['Data Privacy|High'], 'degraded',
     'derived from the stored rungs and frozen flags — no column, no clock');
  eq(back.snapshot_id, degraded.snapshot_id,
     'the run taken while the ladder was damaged must still reproduce');
});

// ── The trust boundary ─────────────────────────────────────────────────────

await test('a hallucinated category never reaches the run decisions', async () => {
  eq(intact.dropped, ['Quantum Indemnity']);
  const r = await rows(`select count(*)::int as n from cw.run_decision
                        where run_id='RUN-001' and category_key='Quantum Indemnity'`);
  eq(r[0].n, 0, 'it cannot be stored — and it must not be reported as a coverage gap');
});

await test('a dropped category is recorded as dropped in the run record', async () => {
  const r = await rows(`select manifest->'dropped' as dropped from cw.run where run_id='RUN-001'`);
  eq(r[0].dropped.length, 1, 'dropped is its own state, distinct from "no clause available"');
  const d = r[0].dropped[0];
  eq([d.category, d.severity, d.justification, d.reason],
     ['Quantum Indemnity', 'High', 'invented by the model', 'unknown category']);
  const kept = await rows(`select jsonb_array_length(manifest->'risks') as n
                           from cw.run where run_id='RUN-001'`);
  eq(Number(kept[0].n), 3, 'the model said four; the record says three kept and one dropped');
});

await test('a real coverage gap is still recorded as one', async () => {
  // Control: Insurance is a defined category with no clause. The boundary must
  // not silence the report it protects.
  const r = await rows(`select clause_id, reason from cw.run_decision
                        where run_id='RUN-001' and category_key='insu'`);
  eq(r.length, 1);
  eq(r[0].clause_id, null);
  eq(r[0].reason, 'No clause available in Ledger');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
