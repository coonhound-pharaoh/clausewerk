// Fallback ladder and concession tests (CLA §3–§6, ADR-0009).
//
// The guarantee this suite exists to defend: accepted vendor wording can never
// become approved language except by a deliberate Legal admin promotion.
//
//   node db/test/ladder.test.mjs

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
const one = async (s, p) => (await rows(s, p))[0];
const asRole = async (role, actor = 'legal@clausewerk') =>
  db.exec(`reset role;
    select set_config('cw.role','${role}',false);
    select set_config('cw.actor','${actor}',false);`);

// The real-role harness. asRole() above only claims a role in a session
// variable while the session stays connected as the owner — and the owner
// bypasses row-level security and holds every privilege. Anything below that
// tests a policy or a grant uses these instead.
const { queryAs } = roleHelpers(db);

await asRole('legal_admin');

console.log('\nseed');
await test('library and ladder seed', async () => {
  await db.exec(`
    insert into cw.category (key,label,short) values
      ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');
    insert into cw.clause (clause_id,category_key,severity) values
      ('DP-H-014','data','High'), ('DP-H-052','data','High'),
      ('DP-H-061','data','High'), ('DP-H-070','data','High'),
      ('LC-S-009','liab','Standard'),
      -- ── Seeded for the rung-coherence constraint (WP-23, finding D8) ──
      -- A rung must be a clause of its ladder's own category AND severity.
      -- Three fixture ladders below were built from whatever clause happened to
      -- be in the seed, which is how the gap survived. The correction is new
      -- seed clauses, NOT swapped ids: there was no Standard Data Privacy
      -- clause and no High Liability clause in the library at all, so every
      -- ladder those tests describe was unbuildable as written. Each mirrors the
      -- shape of the one it stands in for, including the lapsed dates, so the
      -- tests below assert the same thing about the same shape of ladder.
      ('DP-S-001','data','Standard'), ('DP-S-002','data','Standard'),
      ('DP-S-003','data','Standard'),
      ('LC-H-001','liab','High'), ('LC-H-002','liab','High'),
      ('LC-S-010','liab','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
      ('DP-H-014',1,'24h notice','Notify within 24 hours.','2025-01-01','2027-01-01'),
      ('DP-H-052',1,'48h notice','Notify within 48 hours.','2025-01-01','2027-01-01'),
      ('DP-H-061',1,'72h notice','Notify within 72 hours.','2025-01-01','2027-01-01'),
      ('DP-H-070',1,'Lapsed','Notify within 96 hours.','2023-01-01','2024-06-01'),
      ('LC-S-009',1,'Cap at fees','Capped at fees paid.','2025-01-01','2027-01-01'),
      ('DP-S-001',1,'Standard notice','Notify without undue delay.','2025-01-01','2027-01-01'),
      -- Lapsed, exactly like DP-H-070 — this is the rung that degrades ladder 4.
      ('DP-S-002',1,'Lapsed standard','Notify within a reasonable period.','2023-01-01','2024-06-01'),
      ('DP-S-003',1,'Standard floor','Notify on becoming aware.','2025-01-01','2027-01-01'),
      ('LC-H-001',1,'Cap at 2x fees','Capped at twice the fees paid.','2025-01-01','2027-01-01'),
      -- Lapsed, and used as ladder 5's unusable FLOOR.
      ('LC-H-002',1,'Lapsed cap','Capped at three times the fees paid.','2023-01-01','2024-06-01'),
      ('LC-S-010',1,'Cap at fees, annual','Capped at fees paid in the year.','2025-01-01','2027-01-01');
    insert into cw.agreement (agreement_id,counterparty,sector,value_usd,requester) values
      ('AG-001','Northwind Analytics','tech',240000,'buyer@clausewerk'),
      ('AG-002','Contoso Health','health',900000,'buyer@clausewerk'),
      ('AG-003','Fabrikam','tech',120000,'other@clausewerk');`);
});

console.log('\nladder structure (CLA §3)');
await test('a ladder with contiguous rungs and a floor is accepted', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (1,'data','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (1,0,'DP-H-014',1,false),
      (1,1,'DP-H-052',1,false),
      (1,2,'DP-H-061',1,true);`);
  const h = await one(`select status, rungs, has_floor from cw.ladder_health where ladder_id=1`);
  eq(h.status, 'intact'); eq(h.rungs, 3); eq(h.has_floor, true);
});
await test('rungs must be contiguous from 0', async () => {
  // FIXTURE CORRECTED (WP-23). Rung 5 named DP-H-052 — a HIGH DATA PRIVACY
  // clause on a STANDARD LIABILITY ladder. Under the rung-coherence constraint
  // that insert now raises for the wrong reason, and this test's
  // `throws(..., 'contiguous')` would have gone green on the coherence error
  // instead: a false pass, with the contiguity rule itself never exercised.
  // LC-S-010 is a Standard Liability clause, so the ONLY thing wrong with this
  // ladder is the gap between rung 0 and rung 5 — which is what the test is for.
  await throws(() => db.exec(`
    begin;
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (2,'liab','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (2,0,'LC-S-009',1,true), (2,5,'LC-S-010',1,false);
    commit;`), 'contiguous');
  await db.exec(`rollback;`).catch(() => {});
});
// ── WP-23 · a rung must belong to its own ladder (finding D8) ───────────────
//
// On their own category, because cw.ladder is UNIQUE on (category_key,
// severity) and the fixtures below claim most of the pairs the seed can build.
await test('a category of its own for the coherence tests', async () => {
  await db.exec(`
    insert into cw.category (key,label,short) values ('warr','Warranty','WR');
    insert into cw.clause (clause_id,category_key,severity) values
      ('WR-H-001','warr','High'), ('WR-S-001','warr','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
      ('WR-H-001',1,'Full warranty','Services conform in all material respects.','2025-01-01','2028-01-01'),
      ('WR-S-001',1,'Limited warranty','Services conform substantially.','2025-01-01','2028-01-01');`);
  const c = await one(`select count(*)::int n from cw.clause where category_key='warr'`);
  eq(c.n, 2);
});

await test('a rung whose severity disagrees with the ladder is refused', async () => {
  // The quiet half. A High position retreating onto Standard wording is a
  // demotion nobody recorded — the same defect WP-06 found in promotion,
  // arriving from the ladder side. The floor would still read "intact".
  await throws(() => db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (20,'warr','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (20,0,'WR-S-001',1,true);`),
    'retreating onto weaker wording is a demotion',
    'a Standard clause must not sit on a High ladder');
  await db.exec(`delete from cw.ladder where ladder_id=20;`).catch(() => {});
});

await test('a rung whose category disagrees with the ladder is refused', async () => {
  // cw.concession_requires_authority() looks a ladder up by category AND
  // severity, so a foreign-category rung means a Liability concession judged
  // against a retreat path made of Data Privacy wording. There is no reading of
  // "pre-approved retreat" in which that is a retreat.
  await throws(() => db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (21,'warr','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (21,0,'DP-S-001',1,true);`),
    'must be a retreat within the same category');
  await db.exec(`delete from cw.ladder where ladder_id=21;`).catch(() => {});
});

await test('a rung that agrees with its ladder is still accepted', async () => {
  // The positive control: the constraint refuses the wrong ladder, not every
  // ladder. Ladder 1 above is the fuller demonstration; this is the direct one.
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (22,'warr','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (22,0,'WR-H-001',1,true);`);
  const h = await one(`select status from cw.ladder_health where ladder_id=22`);
  eq(h.status, 'intact', 'a coherent ladder is unaffected');
});

await test('a ladder cannot have two floors', async () => {
  await throws(() => db.exec(
    `update cw.ladder_rung set is_floor=true where ladder_id=1 and rung=0`), 'ladder_one_floor');
});
await test('a floorless ladder is reported as a configuration error', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (3,'liab','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (3,0,'LC-S-009',1,false);`);
  const h = await one(`select status from cw.ladder_health where ladder_id=3`);
  eq(h.status, 'floorless', 'a ladder with no floor must not look healthy');
});

console.log('\nladder health — expiry does NOT silently collapse (CLA §11 q4)');
await test('an expired rung degrades the ladder rather than vanishing', async () => {
  await db.exec(`
    -- FIXTURE CORRECTED (WP-23). This Standard ladder was built entirely from
    -- HIGH clauses. The test is about an EXPIRED middle rung, and DP-S-002
    -- expires on exactly the date DP-H-070 did, so the property under test is
    -- untouched — only the severity of the wording changed, to the severity the
    -- ladder always claimed.
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (4,'data','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (4,0,'DP-S-001',1,false),
      (4,1,'DP-S-002',1,false),   -- expired 2024-06-01
      (4,2,'DP-S-003',1,true);`);
  const h = await one(`select status, rungs, unusable_rungs from cw.ladder_health where ladder_id=4`);
  eq(h.rungs, 3, 'the rung stays visible — collapse is not automatic');
  eq(h.unusable_rungs, 1);
  eq(h.status, 'degraded', 'the condition must be surfaced, not silently resolved');
  const r = await one(`select selectable, state from cw.ladder_rung_state
                       where ladder_id=4 and rung=1`);
  eq(r.selectable, false); eq(r.state, 'expired');
});
await test('an unusable floor is reported distinctly from a degraded rung', async () => {
  await db.exec(`
    -- FIXTURE CORRECTED (WP-23). A LIABILITY ladder built from DATA PRIVACY
    -- clauses. LC-H-002 lapses on the same date DP-H-070 did, so the floor is
    -- unusable for exactly the same reason and the assertion is unchanged.
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (5,'liab','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (5,0,'LC-H-001',1,false), (5,1,'LC-H-002',1,true);`);
  const h = await one(`select status from cw.ladder_health where ladder_id=5`);
  eq(h.status, 'floor_unusable', 'losing the floor is worse than losing a middle rung');
});

console.log('\nconcessions (CLA §4, ADR-0009)');
await test('descending to a pre-approved rung needs no override', async () => {
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-001','data','DP-H-014',1,1,'Vendor could not meet 24h','buyer@clausewerk')`);
  const c = await one(`select conceded_rung, vendor_text from cw.concession
                       where agreement_id='AG-001'`);
  eq(c.conceded_rung, 1); eq(c.vendor_text, null);
});
await test('conceding below the floor without an override is refused', async () => {
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-001','data','DP-H-014',1,3,'Vendor pushed hard','buyer@clausewerk')`),
    'below the floor', 'the floor must be absolute without a recorded override');
});
await test('below the floor WITH a recorded override is allowed', async () => {
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,
     override_ref,reason,approved_by)
    values ('AG-002','data','DP-H-014',1,3,'OVR-2026-0042','Regulatory necessity','legal@clausewerk')`);
  const c = await one(`select override_ref from cw.concession where agreement_id='AG-002'`);
  eq(c.override_ref, 'OVR-2026-0042');
});
await test('accepting vendor language without an override is refused', async () => {
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,'Notify when convenient.','pressure','buyer@clausewerk')`),
    'requires a recorded override');
});
await test('a concession cannot be both a rung and vendor text', async () => {
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,1,'text','OVR-1','x','y')`), 'one_outcome');
});

console.log('\nquarantine — the central guarantee');
await test('vendor text is recorded', async () => {
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,
            'Vendor shall notify Customer within five (5) business days.',
            'OVR-2026-0043','Vendor would not sign otherwise','legal@clausewerk')`);
  const c = await one(`select vendor_text from cw.concession where agreement_id='AG-003'`);
  assert(c.vendor_text.includes('five (5) business days'));
});
await test('vendor text NEVER appears in the selectable pool', async () => {
  const leak = await one(`select count(*)::int n from cw.selectable_clause
    where body in (select vendor_text from cw.concession where vendor_text is not null)`);
  eq(leak.n, 0, 'conceded wording must never be resolvable into a contract');
});
await test('vendor text is not in the clause library at all', async () => {
  const leak = await one(`select count(*)::int n from cw.clause_version
    where body in (select vendor_text from cw.concession where vendor_text is not null)`);
  eq(leak.n, 0, 'quarantine means it is not in the library, not merely filtered out');
});

// ════════════════════════════════════════════════════════════════════════════
// SETTLING A CONCESSION, so that it can be promoted (WP-SWEEP)
// ════════════════════════════════════════════════════════════════════════════
// WP-18a built the approval gate — a concession is merely PROPOSED until the
// Requester, the assigned attorney and every configured Required Approver have
// signed off — and promotion into the library did not consult it. It does now,
// so the promotion fixtures below have to settle their concession first, which
// is what a real deal would do.
//
// The gate itself is proven in governance.test.mjs, as the real roles. This
// helper is fixture setup for a different guarantee, so it runs as the owner.
const settle = async (concessionId) => {
  const c = await one(`select agreement_id from cw.concession where concession_id=$1`,
                      [concessionId]);
  const a = await one(`select requester from cw.agreement where agreement_id=$1`,
                      [c.agreement_id]);
  await db.exec(`insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
                 values ('${c.agreement_id}','counsel@clausewerk','legal@clausewerk')
                 on conflict (agreement_id) do nothing;
    insert into cw.concession_approval (concession_id,approver_kind,approver) values
      (${concessionId},'requester','${a.requester}'),
      (${concessionId},'attorney','counsel@clausewerk');
    insert into cw.concession_settlement (concession_id,settled_by)
      values (${concessionId},'legal@clausewerk');`);
};

console.log('\npromotion — the only path in');

await test('a concession that is only proposed cannot be promoted', async () => {
  // The WP-18a residual, closed. Promotion is the single door into the clause
  // library (ADR-0009), and it stood BEHIND the approval gate rather than in
  // front of it: vendor wording nobody had yet approved — and which could still
  // be withdrawn — could be minted as approved language for every future deal.
  //
  // Run as a real cw_legal_admin, because the authority check would otherwise
  // refuse this call first and prove nothing about the new gate.
  const id = (await one(`select concession_id from cw.concession
                         where vendor_text is not null and agreement_id='AG-003'`)).concession_id;
  await throws(() => queryAs('legal_admin',
    `select cw.promote_concession(${id},'DP-S-079','x','y','z','2028-01-01')`),
    'only a settled concession may be promoted',
    'unapproved vendor wording must not reach the library');
  const leak = await one(`select count(*)::int n from cw.clause where clause_id='DP-S-079'`);
  eq(leak.n, 0, 'and nothing was minted on the way to being refused');
  await asRole('legal_admin');
});
await test('a caller with no legal_admin authority cannot promote', async () => {
  // Runs as the owner, who under WP-04 / settled decision U3 holds no
  // application role at all — so what is being exercised here is the function's
  // own authority check, with no privilege error able to mask it. Claiming
  // 'requester' in a session variable no longer changes the answer, which is
  // exactly the property WP-04 bought.
  await asRole('requester', 'buyer@clausewerk');
  await throws(() => db.exec(
    `select cw.promote_concession(4,'DP-S-080','5-day notice','Derived','R. Vance','2028-01-01')`),
    'only legal_admin');
  await asRole('legal_admin');
});
await test('a requester cannot even call the promotion function', async () => {
  // The same refusal one wall further out, as the real role: a cw_requester
  // holds no EXECUTE grant, so the call never reaches the authority check.
  await throws(() => queryAs('requester',
    `select cw.promote_concession(4,'DP-S-080','5-day notice','Derived','R. Vance','2028-01-01')`),
    'permission denied for function promote_concession');
  await asRole('legal_admin');
});
await test('a rung concession has nothing to promote', async () => {
  const id = (await one(`select concession_id from cw.concession where agreement_id='AG-001'`)).concession_id;
  // Run as a REAL cw_legal_admin. Under WP-04 the owner holds no application
  // role at all, so an owner-run call is now stopped by the authority check
  // before it ever reaches the question this test is asking.
  await throws(() => queryAs('legal_admin',
    `select cw.promote_concession(${id},'DP-S-081','x','y','z','2028-01-01')`),
    'nothing to promote');
});
// The promotion below runs AS A REAL cw_legal_admin, not as the owner. That is
// the whole point of finding D1: run as the owner this always worked, and run
// as the actual role the closing UPDATE silently affected nothing — the
// function reported success, the concession was never marked promoted, and the
// same vendor paragraph could be minted into the library again and again.
await test('legal_admin can promote vendor text into a new clause', async () => {
  const id = (await one(`select concession_id from cw.concession where vendor_text is not null`)).concession_id;
  await settle(id);   // the approval gate, satisfied the way a real deal does
  const r = (await queryAs('legal_admin',
    `select cw.promote_concession(${id},'DP-S-080','5-day breach notice',
       'Derived from repeated vendor position','R. Vance','2028-01-01') as ref`))[0];
  eq(r.ref, 'DP-S-080@v1');
  const v = await one(`select provenance, citations, selectable from cw.clause_version_state
                       where clause_id='DP-S-080'`);
  eq(v.provenance, 'promoted', 'promoted language must be distinguishable from seeded');
  assert(String(v.citations).includes('Policy-DERIVED'), 'derived provenance must be cited');
  eq(v.selectable, true, 'once promoted it is ordinary approved language');
  await asRole('legal_admin');
});
await test('the promotion is actually recorded on the concession', async () => {
  // The single read that finding D1 would have failed. Everything else about
  // the promotion looked perfect; this column stayed empty.
  const c = await one(`select promoted_to_clause from cw.concession
                       where vendor_text is not null and agreement_id='AG-003'`);
  eq(c.promoted_to_clause, 'DP-S-080@v1',
     'a promotion that does not mark the concession has not happened');
});
await test('a High concession mints a High clause, not a Standard one', async () => {
  // The vendor text above was conceded against DP-H-014, a HIGH position. The
  // severity was hard-coded to 'Standard', so the language that matters most
  // came back into the library quietly demoted, where a later deal could pick
  // it up as ordinary wording.
  const c = await one(`select severity from cw.clause where clause_id='DP-S-080'`);
  eq(c.severity, 'High', 'a clause promoted from a High position is High');
});
await test('the same concession cannot be promoted twice', async () => {
  const id = (await one(`select concession_id from cw.concession
                         where promoted_to_clause is not null`)).concession_id;
  await throws(() => queryAs('legal_admin',
    `select cw.promote_concession(${id},'DP-S-082','x','y','z','2028-01-01')`),
    'already promoted',
    'the second promotion must RAISE, not silently do nothing');
  await asRole('legal_admin');
});
await test('promotion is audited', async () => {
  const e = await one(`select subject, payload from cw.audit_event
                       where event_type='concession_promoted' order by seq desc limit 1`);
  eq(e.subject, 'DP-S-080@v1');
});
await test('recording a concession is audited', async () => {
  const n = await one(`select count(*)::int n from cw.audit_event where event_type='concession_recorded'`);
  assert(n.n >= 3, 'every concession must leave a record');
});

console.log('\nnegotiation intelligence (CLA §6)');
await test('concession rates aggregate', async () => {
  // Three concessions persist. Three further attempts above were correctly
  // refused (below floor without override, vendor text without override, and
  // both outcomes at once) and must leave no trace in the analytics.
  const r = await one(`select concessions, to_vendor_language, required_override
                       from cw.concession_rate where standard_clause_id='DP-H-014'`);
  eq(r.concessions, 3); eq(r.to_vendor_language, 1); eq(r.required_override, 2);
});
await test('proposals only fire on a real pattern, not a single event', async () => {
  const p = await rows(`select proposal from cw.library_proposal where standard_clause_id='DP-H-014'`);
  assert(p.length === 1, 'one row per clause');
  assert(p[0].proposal.includes('settle below the opening position'),
    'settlement below rung 0 is the supported signal here');
});

console.log('\nrow-level security (CLA §7)');
await test('a viewer cannot read concessions at all', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  // Assert the denial names CONCESSION. An earlier version of this test accepted
  // any "permission denied", and passed because the policy's subquery tripped
  // over cw.agreement instead — the right outcome for the wrong reason.
  await throws(() => db.exec(`select * from cw.concession limit 1`),
    'permission denied for table concession');
});
await test('even given a grant, the policy yields a viewer no rows', async () => {
  // Defence in depth: the table grant is the first line, the policy is the
  // second. Prove the second holds on its own.
  await db.exec(`reset role; grant select on cw.concession to cw_viewer;`);
  await db.exec(`select set_config('cw.role','viewer',false); set role cw_viewer;`);
  const r = await one(`select count(*)::int n from cw.concession`);
  eq(r.n, 0, 'no policy branch admits a viewer, so a stray grant leaks nothing');
  await db.exec(`reset role; revoke select on cw.concession from cw_viewer;`);
});
await test('a viewer cannot read the analytics', async () => {
  // Sets its own role rather than inheriting one, so it cannot silently pass
  // because an earlier test left the session as superuser.
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  await throws(() => db.exec(`select * from cw.concession_rate limit 1`),
    'permission denied for view concession_rate');
});
await test('a viewer CAN read ladders', async () => {
  await db.exec(`reset role; select set_config('cw.role','viewer',false); set role cw_viewer;`);
  const r = await one(`select count(*)::int n from cw.ladder_health`);
  assert(r.n > 0, 'the retreat path is not the sensitive part; what we conceded is');
});
await test('a requester sees only their own deals', async () => {
  await db.exec(`reset role; select set_config('cw.role','requester',false);
                 select set_config('cw.actor','other@clausewerk',false); set role cw_requester;`);
  const r = await rows(`select agreement_id from cw.concession`);
  assert(r.every(x => x.agreement_id === 'AG-003'),
    `a requester must not see other buyers' concessions, saw ${JSON.stringify(r)}`);
});
await test('legal sees every concession', async () => {
  await db.exec(`reset role; select set_config('cw.role','legal_reviewer',false); set role cw_legal_reviewer;`);
  const r = await one(`select count(*)::int n from cw.concession`);
  eq(r.n, 3);
});
// ════════════════════════════════════════════════════════════════════════════
// WP-06 · promotion under real permissions   (findings D1 + D6)
// WP-07 · the floor made absolute            (finding D5)
// ════════════════════════════════════════════════════════════════════════════
// Everything below runs after the row-level-security section on purpose: it
// adds concessions, and the counts asserted above are deliberate.
await db.exec(`reset role;`);
await asRole('legal_admin');

console.log('\nthe concession record cannot be rewritten (WP-06, finding D6)');

await test('a real legal_admin cannot rewrite the vendor text', async () => {
  // legal_admin holds UPDATE on exactly one column of this table —
  // promoted_to_clause — so the vendor's wording and the approver's name are
  // out of reach at the privilege level, before any policy is consulted.
  await throws(() => queryAs('legal_admin',
    `update cw.concession set vendor_text='something friendlier'
     where agreement_id='AG-003'`),
    'permission denied for table concession');
  await asRole('legal_admin');
});

await test('a real legal_admin cannot rewrite who approved a concession', async () => {
  await throws(() => queryAs('legal_admin',
    `update cw.concession set approved_by='someone else' where agreement_id='AG-003'`),
    'permission denied for table concession');
  await asRole('legal_admin');
});

await test('a legal_admin cannot touch promoted_to_clause outside a promotion', async () => {
  // The one column legal_admin CAN write is still fenced, by a restrictive
  // policy that only lets it move from empty to a clause reference. Writing an
  // empty value into an unpromoted concession is the shape of an attempt to
  // clear the flag, and it is refused at the row-security layer — as the real
  // role, on the write path.
  const id = (await one(`select concession_id from cw.concession
                         where promoted_to_clause is null order by concession_id limit 1`)).concession_id;
  await throws(() => queryAs('legal_admin',
    `update cw.concession set promoted_to_clause=null where concession_id=${id}`),
    'row-level security policy',
    'the promotion column moves one way, once, or not at all');
  await asRole('legal_admin');
});

await test('a recorded concession cannot be rewritten', async () => {
  // Run as the OWNER, deliberately. The column grant above stops application
  // roles and denies with "permission denied", which tells nobody what the rule
  // is — and stops nothing at all for the owner. This asserts the trigger's own
  // message, so the check cannot pass on the grant's behalf.
  await throws(() => db.exec(
    `update cw.concession set reason='a better story' where agreement_id='AG-003'`),
    'a recorded concession cannot be rewritten');
});

await test('a promotion cannot be undone', async () => {
  await throws(() => db.exec(
    `update cw.concession set promoted_to_clause=null where agreement_id='AG-003'`),
    'cannot be undone or redirected',
    'clearing the flag would make room for a second promotion of the same text');
});

await test('a concession cannot be deleted', async () => {
  // It RAISES rather than quietly doing nothing (settled decision S0-3): being
  // told no is better than believing you succeeded when you did not.
  const before = await one(`select count(*)::int n from cw.concession`);
  await throws(() => db.exec(`delete from cw.concession where agreement_id='AG-003'`),
    'a concession cannot be deleted');
  const after = await one(`select count(*)::int n from cw.concession`);
  eq(after.n, before.n, 'what we conceded is evidence, and evidence is not deletable');
});

await test('the promotion left its own record on the concession row', async () => {
  const e = await one(`select payload from cw.audit_event
                       where event_type='concession_updated' order by seq desc limit 1`);
  assert(e, 'the one permitted change to a concession must be audited');
  eq(e.payload.promoted_to_clause, 'DP-S-080@v1');
});

console.log('\nwho may promote at all (WP-06)');

await test('a legal reviewer cannot even call the promotion function', async () => {
  // PostgreSQL grants EXECUTE on every new function to PUBLIC by default. The
  // `revoke all ... from public` in the migration is what actually keeps other
  // roles out; the role check inside the function reads a session variable and
  // stops nobody on its own.
  const id = (await one(`select concession_id from cw.concession
                         where promoted_to_clause is not null`)).concession_id;
  await throws(() => queryAs('legal_reviewer',
    `select cw.promote_concession(${id},'DP-S-090','x','y','z','2028-01-01')`),
    'permission denied for function promote_concession');
  await asRole('legal_admin');
});

await test('a legal reviewer cannot promote by claiming to be legal_admin', async () => {
  // Defence in depth. Hand the reviewer the EXECUTE grant they should not have,
  // AND let them spoof the session variable that used to be the function's role
  // check. They must still be refused, and nothing may reach the library.
  //
  // WP-04 changed WHICH defence fires first, and that is the point of the
  // change. Before, cw.app_role() read `cw.role`, so a spoofed variable walked
  // straight past the authority check and the only thing left standing was the
  // table privilege — which is why this test insisted on "permission denied".
  // Now the authority check reads the connection's real role, so it refuses
  // first and the variable buys nothing. Both walls are still asserted below:
  // the function refuses, AND the reviewer still cannot write the column by
  // hand.
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-003','data','DP-H-014',1,'Vendor shall notify within ten (10) days.',
            'OVR-2026-0044','Second vendor position','legal@clausewerk')`);
  const id = (await one(`select concession_id from cw.concession
                         where promoted_to_clause is null and vendor_text is not null
                         order by concession_id desc limit 1`)).concession_id;
  await db.exec(`reset role;
    grant execute on function
      cw.promote_concession(bigint, text, text, text, text, date) to cw_legal_reviewer;`);
  let threw = false, msg = '';
  try {
    await db.exec(`reset role;
      select set_config('cw.actor','reviewer@clausewerk',false);
      select set_config('cw.role','legal_admin',false);
      set role cw_legal_reviewer;
      select cw.promote_concession(${id},'DP-S-091','x','y','z','2028-01-01');`);
  } catch (e) { threw = true; msg = e.message; }
  await db.exec(`reset role;
    revoke execute on function
      cw.promote_concession(bigint, text, text, text, text, date) from cw_legal_reviewer;`);
  await asRole('legal_admin');
  assert(threw, 'a legal reviewer minted approved language by setting one session variable');
  assert(msg.includes('only legal_admin may promote'),
    `the spoofed variable must buy nothing — the connection's real role decides, got: ${msg}`);
  const leaked = await one(`select count(*)::int n from cw.clause where clause_id='DP-S-091'`);
  eq(leaked.n, 0, 'and nothing reached the library');
  // The second wall, asserted separately now that the first one fires earlier:
  // the reviewer holds no privilege on the column the promotion writes, so even
  // with the function out of the picture they cannot record a promotion.
  let byHand = '';
  try {
    await db.exec(`reset role;
      select set_config('cw.role','legal_admin',false);
      set role cw_legal_reviewer;
      update cw.concession set promoted_to_clause='DP-S-091' where concession_id=${id};`);
  } catch (e) { byHand = e.message; }
  await asRole('legal_admin');
  assert(byHand.includes('permission denied'),
    `the reviewer must also lack the privilege to write the promotion by hand, got: ${byHand}`);
});

console.log('\nthe floor is absolute — and it is the RIGHT floor (WP-07, finding D5)');

await test('two ladders in one category, with different floors', async () => {
  await db.exec(`
    insert into cw.category (key,label,short) values ('ip','IP Ownership','IP');
    insert into cw.clause (clause_id,category_key,severity) values
      ('IP-H-001','ip','High'),
      ('IP-S-001','ip','Standard'), ('IP-S-002','ip','Standard'), ('IP-S-003','ip','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on) values
      ('IP-H-001',1,'We own it','Customer owns all deliverables.','2025-01-01','2028-01-01'),
      ('IP-S-001',1,'We own it','Customer owns all deliverables.','2025-01-01','2028-01-01'),
      ('IP-S-002',1,'Joint','Joint ownership of deliverables.','2025-01-01','2028-01-01'),
      ('IP-S-003',1,'Licence','Perpetual licence to deliverables.','2025-01-01','2028-01-01');
    -- High: no retreat at all. The opening position IS the floor.
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (10,'ip','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (10,0,'IP-H-001',1,true);
    -- Standard: two rungs of give, floor at rung 2.
    insert into cw.ladder (ladder_id,category_key,severity,owner) values (11,'ip','Standard','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) values
      (11,0,'IP-S-001',1,false), (11,1,'IP-S-002',1,false), (11,2,'IP-S-003',1,true);`);
  const f = await rows(`select l.severity, r.rung from cw.ladder l
                        join cw.ladder_rung r using (ladder_id)
                        where l.category_key='ip' and r.is_floor order by l.severity`);
  eq(f.length, 2, 'one category, two ladders, two different floors');
});

await test('a legitimate Standard concession at its own floor is accepted', async () => {
  // THE REGRESSION. The lookup matched on category alone with no ORDER BY, so
  // it picked whichever floor came back first — the High ladder's rung 0 — and
  // refused this concession, which sits exactly on the Standard floor and needs
  // no override at all.
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-001','ip','IP-S-001',1,2,'Vendor would not assign IP','buyer@clausewerk')`);
  const c = await one(`select conceded_rung, ladder_id, ladder_floor_rung from cw.concession
                       where agreement_id='AG-001' and category_key='ip'`);
  eq(c.conceded_rung, 2, 'a pre-approved retreat must not need an override');
  eq(c.ladder_id, 11, 'and the ladder it was judged against is recorded');
  eq(c.ladder_floor_rung, 2, 'together with where that ladder’s floor sat at the time');
});

await test('a High concession cannot pass the Standard floor', async () => {
  // Same category, same rung number, High position: rung 2 is two rungs below
  // a floor that sits at rung 0. Refused.
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-002','ip','IP-H-001',1,2,'Vendor pushed hard','buyer@clausewerk')`),
    'below the floor (rung 2 > floor 0)',
    'the Standard ladder’s slack must not be lent to a High position');
});

await test('a concession with no ladder is refused with a clear error', async () => {
  // The no-ladder path used to fail OPEN: rung 99, no ladder, no override,
  // accepted silently. A missing floor was read as "no floor".
  await db.exec(`
    insert into cw.category (key,label,short) values ('ins','Insurance','IN');
    insert into cw.clause (clause_id,category_key,severity) values ('IN-S-001','ins','Standard');
    insert into cw.clause_version (clause_id,version,title,body,approved_on,expires_on)
      values ('IN-S-001',1,'Cyber cover','USD 5m cyber cover.','2025-01-01','2028-01-01');`);
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,reason,approved_by)
    values ('AG-001','ins','IN-S-001',1,99,'Vendor has no cover','buyer@clausewerk')`),
    'nothing to concede against',
    'an unladdered category must refuse a rung, not wave it through');
});

await test('an override does not buy a rung on a ladder that does not exist', async () => {
  // A recorded override authorises going BELOW a known floor. It cannot
  // authorise a position on a retreat path nobody has ever published.
  await throws(() => db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,conceded_rung,
     override_ref,reason,approved_by)
    values ('AG-001','ins','IN-S-001',1,99,'OVR-2026-0099','Signed off','legal@clausewerk')`),
    'nothing to concede against');
});

await test('vendor text in an unladdered category is still allowed, with an override', async () => {
  // Stated decision, not an accident: the fail-closed rule applies to the RUNG
  // path. Taking vendor wording is not a position on a ladder; it is already
  // gated by an unconditional recorded override. Requiring a ladder as well
  // would block a fully authorised concession in any category Legal has not yet
  // laddered — which is most of them, early on.
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-002','ins','IN-S-001',1,'Vendor carries USD 1m cover.',
            'OVR-2026-0045','Vendor cannot obtain more','legal@clausewerk')`);
  const c = await one(`select ladder_id, ladder_floor_rung from cw.concession
                       where agreement_id='AG-002' and category_key='ins'`);
  eq(c.ladder_id, null, 'there is no ladder, and the record says so honestly');
  eq(c.ladder_floor_rung, null);
});

await test('the ladder lookup runs on the vendor-text path too', async () => {
  // Where a ladder DOES exist, a vendor-text concession records it, so "what
  // was our floor when we gave this away?" is answerable for both kinds.
  await db.exec(`insert into cw.concession
    (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,
     override_ref,reason,approved_by)
    values ('AG-002','ip','IP-S-001',1,'Vendor retains all IP.',
            'OVR-2026-0046','Vendor would not sign otherwise','legal@clausewerk')`);
  const c = await one(`select ladder_id, ladder_floor_rung from cw.concession
                       where agreement_id='AG-002' and category_key='ip'
                         and vendor_text is not null`);
  eq(c.ladder_id, 11, 'the Standard ladder, matched on the position we opened with');
  eq(c.ladder_floor_rung, 2);
});

await test('a Standard concession mints a Standard clause', async () => {
  // The mirror of the High case above: severity is derived from the position
  // conceded against, not hard-coded either way.
  const id = (await one(`select concession_id from cw.concession
                         where agreement_id='AG-002' and category_key='ins'`)).concession_id;
  await settle(id);
  const r = (await queryAs('legal_admin',
    `select cw.promote_concession(${id},'IN-S-080','Reduced cyber cover',
       'Derived from vendor position','R. Vance','2028-01-01') as ref`))[0];
  eq(r.ref, 'IN-S-080@v1');
  const c = await one(`select severity from cw.clause where clause_id='IN-S-080'`);
  eq(c.severity, 'Standard');
  await asRole('legal_admin');
});

console.log('\npublished rungs are immutable (WP-07)');

await test('the wording on a published rung cannot be swapped', async () => {
  // Concessions are recorded as "we went to rung 1". If the clause sitting on
  // rung 1 can be changed afterwards, every past concession quietly starts
  // meaning something else.
  await throws(() => db.exec(
    `update cw.ladder_rung set clause_id='IP-S-003', version=1
     where ladder_id=11 and rung=1`),
    'the wording on a rung cannot be swapped');
  const r = await one(`select clause_id from cw.ladder_rung where ladder_id=11 and rung=1`);
  eq(r.clause_id, 'IP-S-002', 'the published path is unchanged');
});

await test('a published rung cannot be deleted', async () => {
  await throws(() => queryAs('legal_admin',
    `delete from cw.ladder_rung where ladder_id=11 and rung=1`),
    'a rung cannot be deleted');
  const r = await one(`select clause_id from cw.ladder_rung
                       where ladder_id=11 and rung=1`);
  eq(r.clause_id, 'IP-S-002', 'the published rung disappeared');
});

await test('moving the floor is still allowed — that is a policy decision', async () => {
  // Deliberately NOT locked. How far down a ladder we are willing to go is a
  // live governance call; which wording sits on each rung is a published fact.
  await db.exec(`update cw.ladder_rung set is_floor=false where ladder_id=11 and rung=2;
                 update cw.ladder_rung set is_floor=true  where ladder_id=11 and rung=1;`);
  const h = await one(`select status from cw.ladder_health where ladder_id=11`);
  eq(h.status, 'intact');
  await db.exec(`update cw.ladder_rung set is_floor=false where ladder_id=11 and rung=1;
                 update cw.ladder_rung set is_floor=true  where ladder_id=11 and rung=2;`);
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
