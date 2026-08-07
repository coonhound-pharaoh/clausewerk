// A grant with no policy behind it is a silent lie. Swept, schema-wide.
//
// THE BUG THIS EXISTS TO CATCH, which has now shipped twice.
//
// PostgreSQL does not refuse a role that holds SELECT on a table but is
// admitted by none of its row-level policies. It SUCCEEDS, and returns nothing.
// So the screen says "no holds are open" while a hold is open, or "this
// negotiation has no rounds" while a round is on record — and an empty list is
// a worse answer than a refusal, because a refusal sends somebody to ask.
//
//   · 2026-07-27, cw.legal_hold and cw.agreement_retention. The Administrator
//     — the person who destroys records on schedule — was told nothing stood
//     in their way. Owner decision U13, migration 0024: revoke the inert grant.
//   · 2026-08-05, the four negotiation tables. Reported on one of them by
//     NC-08 and left open; the negotiate screens widened the symptom to three
//     reads before the owner settled it the same way. Migration 0065.
//
// Both times it was found by a person noticing. This is the sweep that was
// missing, and it would have caught both.
//
// WHAT THIS CHECK IS, STATED HONESTLY: A LINT, NOT A PROOF.
//
// The sound test is "put a row in the table and see whether the role gets it or
// is refused", and it is not achievable here — every table would need a fixture
// satisfying its foreign keys, and the sweep would rot the first time a
// migration added one. So this reads the POLICY EXPRESSIONS as text and asks
// whether any of them could admit the role.
//
// Its limits, so nobody mistakes it for more than it is:
//   · A policy admitting a role through a helper function this file does not
//     know about reads as a suspect. That is a FALSE ALARM, and the answer is
//     to add it to KNOWN_ADMITTING below with a reason, never to loosen the
//     check.
//   · A policy that mentions a role only to exclude it would read as admitting.
//     No such policy exists today; if one is written, this sweep stops covering
//     that table and the comment on it should say so.
//
// A lint that catches the shape twice is worth more than a proof nobody writes.
//
//   node db/test/grants-and-policies.test.mjs

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
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const rows = async (s, p) => (await db.query(s, p)).rows;

// The six application roles and the database role each one connects as.
const ROLES = {
  viewer:         'cw_viewer',
  requester:      'cw_requester',
  legal_reviewer: 'cw_legal_reviewer',
  legal_admin:    'cw_legal_admin',
  auditor:        'cw_auditor',
  administrator:  'cw_administrator',
};

// Expressions that admit EVERY signed-in role. A policy carrying one of these
// admits whoever holds the grant, so the pair is fine whatever role it is.
const ADMITS_EVERYONE = [
  'app_role() IS NOT NULL',
  'current_setting(',   // e.g. scoping to the caller's own name
];

// Helper functions that scope a row to the caller rather than to a role. A
// policy built on one of these admits the role and filters the rows, which is
// the intended shape and not the bug — the caller sees THEIR rows, and a
// refusal was never the right answer.
const KNOWN_ADMITTING = [
  'owns_agreement(',
  'app_actor()',
  'shared_with',
];

// DELEGATION: "visible exactly when its parent row is visible".
//
//   using (exists (select 1 from cw.review_ticket t where t.ticket_id = ...))
//
// Row-level security applies to that inner select too, so the child row is
// admitted for precisely the callers the PARENT's policy admits. It names no
// role because it does not need to — which is why the first run of this sweep
// reported twenty-nine of them as suspects.
//
// THEY WERE FALSE ALARMS, AND THE FIX IS TO TEACH THE LINT THE SHAPE rather
// than to relax it. The check keeps all its teeth on the shape that actually
// bit: a policy that enumerates roles and omits one that holds the grant. Both
// historical instances are of that kind, and both are still caught — verified
// by the named test at the bottom of this file, which does not consult this
// list at all.
const DELEGATES_TO_ANOTHER_TABLE = /EXISTS \(\s*SELECT 1\s*FROM cw\./i;

console.log('\nevery SELECT grant has a policy that could admit its role');

const tables = await rows(`
  select c.relname as name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'cw' and c.relkind = 'r'
   order by c.relname`);

await test('the sweep found the schema (guards a vacuous pass)', async () => {
  assert(tables.length >= 40,
    `only ${tables.length} tables found in schema cw; a sweep over an empty ` +
    'list passes while proving nothing');
  assert(tables.some(t => t.rls),
    'no table has row-level security enabled, which cannot be true');
});

const policies = await rows(`
  select c.relname as table_name, p.polname as name, p.polpermissive as permissive,
         p.polcmd as cmd, pg_get_expr(p.polqual, p.polrelid) as qual
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'cw'`);

function couldAdmit(table, role) {
  // PERMISSIVE policies grant; restrictive ones only ever subtract, so a
  // restrictive policy can never be the thing that admits a role.
  const forSelect = policies.filter(p =>
    p.table_name === table && p.permissive &&
    (p.cmd === 'r' || p.cmd === '*') && p.qual);
  return forSelect.some(p => {
    const text = p.qual;
    if (ADMITS_EVERYONE.some(marker => text.includes(marker))) return true;
    if (KNOWN_ADMITTING.some(marker => text.includes(marker))) return true;
    if (DELEGATES_TO_ANOTHER_TABLE.test(text)) return true;
    return text.includes(`'${role}'`);
  });
}

await test('no role holds a read it can never use', async () => {
  const silent = [];
  for (const table of tables) {
    if (!table.rls) continue;   // no RLS: the grant is the whole answer
    for (const [role, dbRole] of Object.entries(ROLES)) {
      const [{ held }] = await rows(
        `select has_table_privilege($1, $2, 'SELECT') as held`,
        [dbRole, `cw.${table.name}`]);
      if (!held) continue;
      if (!couldAdmit(table.name, role)) silent.push(`cw.${table.name} → ${role}`);
    }
  }

  eq(silent, [],
    'these roles hold SELECT on a table whose policies never admit them. '
    + 'PostgreSQL will not refuse them — it will answer ZERO ROWS, and a '
    + 'screen will report "there are none" where the truthful answer is "not '
    + 'yours to see". Either revoke the grant (the U13 answer, migrations 0024 '
    + 'and 0065) or admit the role in a policy. If the policy admits it through '
    + 'a helper this sweep does not know, add the helper to KNOWN_ADMITTING '
    + 'with a reason — never loosen the check');
});

await test('the two historical instances stay fixed', async () => {
  // Named rather than left to the sweep, because these two are the reason it
  // exists and a regression on either should say so in those words.
  const regressed = [];
  for (const table of ['legal_hold', 'agreement_retention',
                       'negotiation', 'negotiation_round',
                       'negotiation_position', 'position_movement']) {
    const [{ held }] = await rows(
      `select has_table_privilege('cw_administrator', $1, 'SELECT') as held`,
      [`cw.${table}`]);
    if (held) regressed.push(`cw.${table}`);
  }
  eq(regressed, [],
    'the administrator holds a read that no policy admits, on a table where '
    + 'this exact bug has already shipped once');
});

// ── A privileged function must be told where to look (2026-08-07) ──────────
//
// THE SHAPE THIS CATCHES. A SECURITY DEFINER function runs with the rights of
// whoever owns it, not whoever called it. If its search_path is not pinned, the
// caller's own path decides which objects the names inside it resolve to — so an
// ordinary role creates a table or a function of their own with a matching name
// in a schema they can write to, calls the privileged function, and their object
// runs with the owner's rights. It is the standard escalation against this kind
// of function, and it is a one-word omission in a migration.
//
// WHY A SWEEP AND NOT A LIST. bug_report.md recorded on 2026-07-28 that "every
// one of the 26 privileged database functions is hardened against the classic
// escalation trick". True when written, checked once, by a person, at 32
// migrations. There are now 69 migrations and 38 such functions installed (47
// definitions in the sources, several of them create-or-replace of the same
// function) — the count grew by twelve with nothing carrying the check forward.
// Two of them are covered by
// mutation rows on cw.audit_chain and cw.audit_verify, and those strip the
// definer-ness and the path TOGETHER, so neither isolates the pinning.
//
// READ FROM THE CATALOG, NOT THE MIGRATION TEXT, and that is load-bearing: a
// later `create or replace` can drop a `set search_path` the original definition
// had, and a scan of the source files would still find the old, correct one and
// report calm.

await test('every privileged function is told where to look', async () => {
  const loose = await rows(`
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'cw'
       and p.prosecdef
       and not exists (
             select 1 from unnest(coalesce(p.proconfig, '{}')) as c
              where c like 'search_path=%')
     order by p.proname`);

  eq(loose.map(r => `cw.${r.proname}(${r.args})`), [],
    'these run with the owner\'s rights and let the CALLER decide what their '
    + 'names mean — the classic privilege-escalation shape. Add '
    + '`set search_path = cw, pg_temp` to each');
});

await test('the sweep is looking at something', async () => {
  // A sweep whose query matched nothing would pass for ever and protect
  // nothing. This repository has already caught one test that could not fail
  // (2026-07-26), so the population is asserted rather than assumed.
  const [{ n }] = await rows(`
    select count(*)::int as n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'cw' and p.prosecdef`);
  // 38 at the time of writing. The floor is well below that so that removing a
  // function is not a false alarm, and well above zero so that a query which
  // stops matching — a schema rename, a catalog change — is.
  assert(n >= 30,
    `only ${n} privileged functions found; the sweep above is not looking at `
    + 'the population it claims to cover');
});

// ── An append-only table cannot be emptied either (0070, 2026-08-07) ───────
//
// 0001 built this defence and stated the rule better than a restatement would:
// "A schema that raises loudly on `delete from cw.clause_version` and empties
// the same table without complaint on `truncate cw.clause_version` does not
// have an immutability guarantee; it has an immutability habit."
//
// TRUNCATE fires no row triggers and applies no ON DELETE rules, so the defence
// must be STATEMENT-level. 0001 made cw.no_truncate() shared so that "a table
// added later inherits the story by NAMING it". Forty-three named it; twenty-one
// never did — including who holds which role, the model-spend ledger, and every
// authorised departure from a legal objection. 0070 closed that.
//
// A NAMED LIST, NOT A DERIVED ONE, AND THE REASON IS WORTH READING. The obvious
// sweep is "every table whose row trigger forbids update or delete must also
// guard truncate", and deriving that set needs a way to tell an unconditional
// append-only trigger from a conditional binding one. Three heuristics were
// tried — any update/delete trigger, any trigger function containing a raise,
// and a raise with no `if` in the body — and they gave 66, 66 and 57. Worse,
// the third behaved differently in two files carrying byte-identical SQL, and
// that was never explained. A guard nobody can explain is worse than no guard:
// it reports calm for reasons no one understands. So the population is written
// down instead of inferred.
//
// WHAT THIS CATCHES: a truncate guard REMOVED from any table that has one.
// WHAT IT DOES NOT: a NEW append-only table shipped without one. That half is
// stated rather than faked — it is the honest limit of a named list, and the
// count check below is what notices the list drifting out of step.

const TRUNCATE_GUARDED = [
  'account', 'advisory_assessment', 'agreement_attorney',
  'agreement_share', 'audit_event', 'clause',
  'clause_draft', 'clause_tag', 'clause_version',
  'concession', 'concession_approval', 'concession_settlement',
  'concession_withdrawal', 'conflict_rule', 'executed_agreement',
  'executed_document', 'executed_signatory', 'governance_setting',
  'integrity_check', 'ladder_rung', 'legal_hold',
  'model_call', 'negotiation_position', 'negotiation_round',
  'notice', 'notice_acknowledgement', 'notification_address',
  'notification_outbox', 'obligation_act', 'obligation_coverage_gap',
  'obligation_instance', 'obligation_template', 'override_finding',
  'override_request', 'override_socialisation', 'override_watcher',
  'position_movement', 'received_document', 'records_delegate',
  'required_approver', 'review_candidate', 'review_segment',
  'review_ticket', 'risk_assessment', 'role_grant',
  'round_analysis', 'ruleset', 'ruleset_member',
  'run', 'run_decision', 'run_finding',
  'signature_certificate', 'signature_envelope', 'signature_envelope_event',
  'signature_recipient', 'snapshot', 'snapshot_ladder_rung',
  'snapshot_member', 'sow_override', 'sow_override_approval',
  'sow_override_settlement', 'supersession', 'supplier_unit',
  'ticket_claim',
];

await test('every table that guards truncate still guards it', async () => {
  const live = new Set((await rows(`
    select c.relname as tbl
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'cw' and not t.tgisinternal and (t.tgtype & 32) <> 0
     group by c.relname`)).map(r => r.tbl));

  const lost = TRUNCATE_GUARDED.filter(t => !live.has(t)).map(t => `cw.${t}`);
  eq(lost, [],
    'these lost their truncate guard, so one statement now empties a table '
    + 'that refuses a delete — an immutability habit, not a guarantee');
});

await test('the truncate-guard list has not drifted', async () => {
  // The named list cannot notice a new table shipped without a guard. This
  // notices it drifting the other way — a table gaining a guard nobody added
  // here — which is the prompt to re-derive the list.
  const [{ n }] = await rows(`
    select count(*)::int as n from (
      select c.relname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace nn on nn.oid = c.relnamespace
       where nn.nspname = 'cw' and not t.tgisinternal and (t.tgtype & 32) <> 0
       group by c.relname) g`);
  eq(n, TRUNCATE_GUARDED.length,
    `${n} tables guard truncate and the list names ${TRUNCATE_GUARDED.length}; `
    + 'add the new one to TRUNCATE_GUARDED, or say why it does not belong');
});

// WHAT THIS DOES NOT CLAIM: that the pinned value is SAFE. A function pinned to
// a schema an ordinary role may create objects in would satisfy this check.
// Every one today is `cw, pg_temp`. Stated as a limit rather than patched
// around, in the same spirit as the limits at the top of this file.

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
