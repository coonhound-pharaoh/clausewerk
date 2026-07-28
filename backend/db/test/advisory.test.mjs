// The advisory judgment record (NC-25).
//
// What is under test, in plain terms:
//   · a judgment, once written down, can never be rewritten or removed;
//   · asking again does not replace the old answer — it adds a new one, and the
//     board shows the newest while the history stays;
//   · a number cannot get in without a model behind it, and a judgment that
//     could not be obtained is written down as absent with a reason rather than
//     as a substitute figure;
//   · the board shows the arithmetic measurement and the AI estimate side by
//     side, each with its own label, and it shows a person only the tickets
//     they are allowed to see.
//
// Every governed act runs as a REAL database role, for the reason roles.mjs
// gives: the owner bypasses row-level security and holds every privilege, so a
// gate tested as the owner is a gate nobody walked through.
//
// THIS SUITE NEVER ASSERTS ON A JUDGMENT'S WORDING OR ITS VALUE. A model's
// opinion is content, content is placeholder pending review (CLAUDE.md), and a
// test that pins it fails on correct work. What is asserted is what the system
// DOES: what the row holds, what it refuses, and who can see it.
//
//   node db/test/advisory.test.mjs

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
async function refused(fn, msg) {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  assert(threw, msg || 'expected a refusal, got none');
}

const db = await PGlite.create();
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

const rows = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await rows(s, p))[0];
const { queryAs } = roleHelpers(db);
const q = s => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const num = v => (v === null || v === undefined ? v : Number(v));

// ── The people ──────────────────────────────────────────────────────────────
const OWNER = 'owner@clausewerk';
const ADMIN = 'ada@clausewerk';
const LEGAL = 'rae@clausewerk';         // a Legal admin the system knows
const BUYER = 'buyer@clausewerk';       // a requester
const OTHER = 'other.legal@clausewerk'; // a second Legal person: nobody decides their own ask
const STRANGER = 'stranger@clausewerk'; // a second requester, with work of their own

console.log('\nseed');
await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
await db.exec(`
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');`);

let seq = 0;

// A ticket, opened by a requester. opened_by is never supplied: it defaults to
// the connection's actor.
const openTicket = async (proposed, who = BUYER) => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('data','Standard','ai-draft','AI CANDIDATE',${q(proposed)})
    returning ticket_id`, [], who);
  return r[0].ticket_id;
};

const verify = (id, approved) => queryAs('legal_reviewer',
  `select cw.verify_review_ticket(${id}, ${q(approved)}, 'DP-S-${900 + (seq++)}',
     'A title', 'A rationale', 'L. Reyes', '2028-01-01') as ref`, [], OTHER);

// The board, read as a real role. `one()` runs as the OWNER, whose app_role is
// null, and cw.ticket_metrics scopes itself on app_role — so an owner read of
// the board correctly returns nothing. Reading it any other way in this suite
// would be testing a path nobody uses.
const board = async (id, role = 'legal_admin', who = LEGAL) =>
  (await queryAs(role, `select * from cw.ticket_metrics where ticket_id = ${id}`,
                 [], who))[0];

// The two texts. Synthetic, and the point is the machinery, not the words.
const AI_TEXT = 'Supplier shall notify Customer within thirty six hours of a breach.';
const APPROVED = 'Supplier shall notify Customer within twenty four hours of a breach.';

// A decided ticket, ready to be judged.
const decidedTicket = async (who = BUYER) => {
  const id = await openTicket(AI_TEXT, who);
  await verify(id, APPROVED);
  return id;
};

// Recording a judgment, as a real Legal role. `outcome`, `score` and the rest
// are passed explicitly because the DOORWAY is what fills them from the model;
// this suite is about what the DATABASE will and will not store.
const record = (id, { outcome = 'recorded', score = 0.4, basis = 'a stated basis',
                      absent = null, model = 'a-model', version = 'a-version',
                      prompt = 'a prompt', who = LEGAL, role = 'legal_admin' } = {}) =>
  queryAs(role, `
    insert into cw.advisory_assessment
      (ticket_id, baseline_text, compared_text, judgment_kind, outcome, score,
       basis, absent_reason, model, model_version, prompt, requested_by,created_at)
    values (${id}, ${q(AI_TEXT)}, ${q(APPROVED)}, 'semantic_difference',
            ${q(outcome)}, ${score === null ? 'null' : score}, ${q(basis)},
            ${q(absent)}, ${q(model)}, ${q(version)}, ${q(prompt)},
            'forged-requester@clausewerk','2099-01-01 00:00:00+00')
    returning assessment_id, requested_by,
              created_at between statement_timestamp() - interval '5 seconds'
                             and statement_timestamp() as created_now`, [], who);

// ════════════════════════════════════════════════════════════════════════════
// A judgment is written once and never rewritten
// ════════════════════════════════════════════════════════════════════════════
console.log('\nappend-only');

await test('a judgment can be recorded', async () => {
  const id = await decidedTicket();
  const r = await record(id);
  assert(r[0].assessment_id, 'nothing came back from the insert');
  eq(r[0].requested_by, LEGAL,
     'append-only provenance must name the authenticated requester');
  eq(r[0].created_now, true,
     'append-only provenance must use the database recording time');
});

await test('a recorded judgment cannot be rewritten', async () => {
  const id = await decidedTicket();
  const r = await record(id);
  await refused(() => queryAs('legal_admin',
    `update cw.advisory_assessment set score = 0.9
      where assessment_id = ${r[0].assessment_id}`, [], LEGAL),
    'a judgment was rewritten');
});

await test('a recorded judgment cannot be deleted', async () => {
  const id = await decidedTicket();
  const r = await record(id);
  await refused(() => queryAs('legal_admin',
    `delete from cw.advisory_assessment where assessment_id = ${r[0].assessment_id}`,
    [], LEGAL), 'a judgment was deleted');
});

await test('the whole record cannot be emptied in one statement', async () => {
  await refused(() => db.exec('truncate cw.advisory_assessment'),
    'truncate removed every judgment ever recorded');
});

// ════════════════════════════════════════════════════════════════════════════
// Asking again appends; it does not replace
// ════════════════════════════════════════════════════════════════════════════
console.log('\nre-running a judgment');

await test('a second run adds a row rather than replacing the first', async () => {
  const id = await decidedTicket();
  const first = await record(id, { score: 0.2 });
  const second = await record(id, { score: 0.6 });
  const held = await rows(
    `select assessment_id from cw.advisory_assessment where ticket_id = ${id}
      order by assessment_id`);
  eq(held.length, 2, 'the earlier judgment did not survive the later one');
  eq(held.map(r => String(r.assessment_id)),
     [String(first[0].assessment_id), String(second[0].assessment_id)]);
});

await test('the board shows the latest judgment and counts the history', async () => {
  const id = await decidedTicket();
  await record(id, { score: 0.2 });
  const second = await record(id, { score: 0.6 });
  const shown = await board(id);
  eq(num(shown.judgments_recorded), 2, 'the history was not counted');
  // The LATEST is shown. Asserted by identity with the row just written, not by
  // its value — a value would be asserting on a judgment.
  const latest = await one(
    `select score from cw.advisory_assessment
      where assessment_id = ${second[0].assessment_id}`);
  eq(num(shown.estimated_semantic_difference), num(latest.score),
     'the board is not showing the newest judgment');
});

// ════════════════════════════════════════════════════════════════════════════
// A number cannot get in without a model behind it
// ════════════════════════════════════════════════════════════════════════════
console.log('\na score needs a model behind it');

await test('an absent judgment carrying a score is refused', async () => {
  const id = await decidedTicket();
  await refused(() => record(id, {
    outcome: 'absent', score: 0.75, basis: null,
    absent: 'the model could not be reached',
  }), 'a substitute number was stored on an absence');
});

await test('a recorded judgment with no score is refused', async () => {
  const id = await decidedTicket();
  await refused(() => record(id, { outcome: 'recorded', score: null }),
    'a judgment claimed to be recorded while holding no judgment');
});

await test('an absence with no reason is refused', async () => {
  const id = await decidedTicket();
  await refused(() => record(id, {
    outcome: 'absent', score: null, basis: null, absent: null,
  }), 'an absence was stored without saying why');
});

await test('a judgment with no model named is refused', async () => {
  const id = await decidedTicket();
  await refused(() => record(id, { model: '   ' }),
    'an opinion was stored without an author');
});

await test('a score outside the scale is refused', async () => {
  const id = await decidedTicket();
  await refused(() => record(id, { score: 1.5 }),
    'a figure outside 0..1 is not a figure');
});

// ════════════════════════════════════════════════════════════════════════════
// The honest absence is a first-class row
// ════════════════════════════════════════════════════════════════════════════
console.log('\nan absence is recorded, not hidden');

await test('an absence records the reason and no number', async () => {
  const id = await decidedTicket();
  await record(id, {
    outcome: 'absent', score: null, basis: null,
    absent: 'no model key is configured',
  });
  const shown = await board(id);
  eq(shown.judgment_outcome, 'absent');
  eq(num(shown.estimated_semantic_difference), null,
     'an absence must not present as a number');
  assert(shown.judgment_absent_reason, 'the absence gives no reason');
});

await test('an absence still carries what was attempted', async () => {
  const id = await decidedTicket();
  await record(id, {
    outcome: 'absent', score: null, basis: null,
    absent: 'the model could not be reached',
  });
  const held = await one(
    `select model, model_version, prompt from cw.advisory_assessment
      where ticket_id = ${id}`);
  // Present, not equal to anything: the words are content.
  assert(held.model && held.model_version && held.prompt,
    'an absence records nothing about what was attempted');
});

// ════════════════════════════════════════════════════════════════════════════
// The board: a measurement and an estimate, kept apart
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe metrics board');

await test('both figures are on the board, each with its own label', async () => {
  const id = await decidedTicket();
  await record(id);
  const shown = await board(id);
  assert(shown.measured_edit_similarity !== null,
    'the arithmetic measurement is missing from the board');
  assert(shown.estimated_semantic_difference !== null,
    'the AI estimate is missing from the board');
  // The LABELS DIFFER. Not what they say — that is wording, and wording is
  // content. What matters is that the two figures cannot arrive wearing the
  // same label and be taken for the same kind of thing.
  assert(shown.measurement_label && shown.judgment_label,
    'a figure arrived on the board with no label at all');
  assert(shown.measurement_label !== shown.judgment_label,
    'the measurement and the estimate carry the same label');
});

await test('a ticket with no judgment still appears, with the estimate empty', async () => {
  const id = await decidedTicket();
  const shown = await board(id);
  eq(shown.judgment_outcome, null, 'a judgment appeared that nobody asked for');
  eq(num(shown.estimated_semantic_difference), null);
  eq(num(shown.judgments_recorded), 0);
});

// ════════════════════════════════════════════════════════════════════════════
// Who may see a judgment, and who may record one
// ════════════════════════════════════════════════════════════════════════════
console.log('\nwho sees what');

await test('a requester cannot record a judgment on another opener’s ticket',
  async () => {
    const id = await decidedTicket(BUYER);
    await refused(() => record(id, {
      role: 'requester',
      who: 'foreign.requester@clausewerk',
    }), 'a foreign requester appended model evidence to another ticket');
    const held = await one(
      `select count(*)::int n from cw.advisory_assessment where ticket_id=${id}`);
    eq(held.n, 0, 'the refused model call must leave no append-only evidence row');
  });

await test('a requester sees their own ticket on the board and not a stranger\'s',
  async () => {
    await queryAs('administrator', `
      insert into cw.account (person, display_name, unit, role, created_by)
      values (${q(STRANGER)}, 'A Stranger', 'Procurement', 'requester', ${q(ADMIN)})`,
      [], ADMIN);
    await queryAs('administrator', `
      insert into cw.role_grant (action, person, role, acted_by, reason)
      values ('granted', ${q(STRANGER)}, 'requester', ${q(ADMIN)}, 'a second requester')`,
      [], ADMIN);

    const mine = await decidedTicket(BUYER);
    const theirs = await decidedTicket(STRANGER);
    await record(mine);
    await record(theirs);

    const seen = await queryAs('requester',
      `select ticket_id from cw.ticket_metrics`, [], BUYER);
    const ids = seen.map(r => String(r.ticket_id));
    assert(ids.includes(String(mine)), 'a requester cannot see their own ticket');
    assert(!ids.includes(String(theirs)),
      'the board handed a requester somebody else\'s ticket — a view runs as its owner');
  });

await test('a viewer cannot read the record at all', async () => {
  await refused(() => queryAs('viewer',
    'select 1 from cw.advisory_assessment', [], STRANGER),
    'a viewer read the judgments');
});

await test('an administrator cannot read advisory text before an owner decision', async () => {
  const id = await decidedTicket();
  await record(id);
  await refused(() => queryAs('administrator',
    'select baseline_text, compared_text, prompt from cw.advisory_assessment',
    [], ADMIN),
    'an administrator read copied contract text and model prompts');
});

await test('an auditor may read a judgment but not record one', async () => {
  const id = await decidedTicket();
  await record(id);
  // Reading is allowed; whether rows come back depends on the ticket policy,
  // and what is asserted is that the statement is not refused.
  await queryAs('auditor', 'select 1 from cw.advisory_assessment', [], LEGAL)
    .catch(e => { throw new Error(`an auditor was refused the read: ${e.message}`); });
  await refused(() => record(id, { role: 'auditor', who: LEGAL }),
    'an auditor recorded a judgment');
});

// ════════════════════════════════════════════════════════════════════════════
// Every model call is a fact in the chain
// ════════════════════════════════════════════════════════════════════════════
console.log('\nusage is a fact, not a guess');

await test('recording a judgment leaves an entry in the audit chain', async () => {
  const before = await one(
    `select count(*) as n from cw.audit_event where event_type = 'advisory_judgment'`);
  const id = await decidedTicket();
  await record(id);
  await record(id, { outcome: 'absent', score: null, basis: null,
                     absent: 'the model could not be reached' });
  const after = await one(
    `select count(*) as n from cw.audit_event where event_type = 'advisory_judgment'`);
  eq(num(after.n) - num(before.n), 2,
    'a call that produced no judgment was not counted — an outage must be countable too');
});

// ── Verdict ─────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [name, message] of failures) console.log(`  · ${name}\n    ${message}`);
  process.exit(1);
}
