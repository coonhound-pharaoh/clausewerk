// The draft record's four fields (NC-11).
//
// What is under test, in plain terms:
//   · the ticket carries a figure for how far the approved words are from the
//     words the model wrote — and the DATABASE puts it there, at the moment of
//     approval, over anything the caller sent;
//   · the draft carries what it was for, what was known to be unreliable about
//     it, and how the model was performing — never empty, and never changed
//     afterwards.
//
// Every governed act runs as a REAL database role, for the reason roles.mjs
// gives: the owner bypasses row-level security and holds every privilege, so a
// gate tested as the owner is a gate nobody walked through.
//
// This suite never asserts on the wording of a refusal, and never on the wording
// of a draft. It asserts on outcomes: what the row holds afterwards.
//
//   node db/test/draft-record.test.mjs

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
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const num = v => (v === null || v === undefined ? v : Number(v));

// ── The people ──────────────────────────────────────────────────────────────
const OWNER = 'owner@clausewerk';
const ADMIN = 'ada@clausewerk';
const LEGAL = 'rae@clausewerk';         // a Legal admin the system knows
const BUYER = 'buyer@clausewerk';       // a requester
const OTHER = 'other.legal@clausewerk'; // a second Legal person: nobody decides their own ask

console.log('\nseed');
await db.exec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada','${LEGAL}','Rae')`);
await db.exec(`
  insert into cw.category (key,label,short) values
    ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');`);

// A ticket, opened by the requester. opened_by is never supplied: it defaults to
// the connection's actor.
let seq = 0;
const openTicket = async (proposed) => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('data','Standard','ai-draft','AI CANDIDATE',${q(proposed)})
    returning ticket_id`, [], BUYER);
  return r[0].ticket_id;
};

const verify = (id, approved, clauseId) => queryAs('legal_reviewer',
  `select cw.verify_review_ticket(${id}, ${q(approved)}, ${q(clauseId)},
     'A title', 'A rationale', 'L. Reyes', '2028-01-01') as ref`, [], OTHER);

const ticket = id => one(`select state, edited_before_approval, edit_similarity
                          from cw.review_ticket where ticket_id=${id}`);

// The pair of texts used wherever the point is "the same input gives the same
// figure" rather than the words themselves.
const AI_TEXT = 'Supplier shall notify Customer within thirty six hours of a breach.';

// ════════════════════════════════════════════════════════════════════════════
// The figure appears when a decision is taken, and not before
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe figure arrives with the decision');

await test('a pending ticket carries no figure', async () => {
  const id = await openTicket(AI_TEXT);
  const t = await ticket(id);
  eq(t.state, 'pending');
  eq(num(t.edit_similarity), null, 'nothing has been approved, so there is nothing to compare');
});

await test('an approval that changed nothing stores the identity figure, flag false', async () => {
  const id = await openTicket(AI_TEXT);
  await verify(id, AI_TEXT, 'DP-S-601');
  const t = await ticket(id);
  eq(t.state, 'verified');
  eq(t.edited_before_approval, false);
  eq(num(t.edit_similarity), 1, 'the same words in and out is the top of the scale');
});

await test('an approval that changed the words stores a figure below identity, flag true', async () => {
  const id = await openTicket(AI_TEXT);
  await verify(id, 'Supplier shall notify Customer within twenty four hours of a breach.',
               'DP-S-602');
  const t = await ticket(id);
  eq(t.edited_before_approval, true);
  assert(num(t.edit_similarity) < 1, 'a reviewer worked on this, and the figure must say so');
  assert(num(t.edit_similarity) > 0, 'the two texts still share most of their words');
});

await test('a one-word change in a long clause still reads as edited', async () => {
  // The rounding trap: a tiny edit inside a long text can round to the identity
  // figure and read as untouched, which is the one thing this figure exists to
  // say. Long enough that the arithmetic alone would round up.
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
  const id = await openTicket(long);
  await verify(id, long.replace('word40', 'replaced'), 'DP-S-603');
  const t = await ticket(id);
  eq(t.edited_before_approval, true);
  assert(num(t.edit_similarity) < 1, 'edited and identity must never agree');
});

await test('a rejected ticket carries no figure', async () => {
  const id = await openTicket(AI_TEXT);
  await queryAs('legal_reviewer',
    `select cw.reject_review_ticket(${id}, 'L. Reyes', 'Not acceptable.')`, [], OTHER);
  const t = await ticket(id);
  eq(t.state, 'rejected');
  eq(num(t.edit_similarity), null, 'nothing was approved, so nothing was compared');
});

// ════════════════════════════════════════════════════════════════════════════
// The figure is the database's, not the caller's
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe caller cannot write the figure');

await test('a ticket cannot be opened carrying a figure — and opens fine without one', async () => {
  await refused(() => queryAs('requester', `
    insert into cw.review_ticket
      (category_key,severity,reason_code,provenance_badge,proposed_text,edit_similarity)
    values ('data','Standard','ai-draft','AI CANDIDATE',${q(AI_TEXT)},0.5000)`, [], BUYER));
  // The control: the identical open without the figure succeeds, which is what
  // shows the refusal came from the guard and not from a missing grant.
  const id = await openTicket(AI_TEXT);
  assert(id > 0);
});

await test('a figure supplied on the deciding update is overwritten', async () => {
  const id = await openTicket(AI_TEXT);
  const edited = 'Supplier shall notify Customer within twenty four hours of a breach.';
  await queryAs('legal_reviewer', `
    update cw.review_ticket set
      state='verified', approved_text=${q(edited)}, edit_similarity=0.1234,
      decided_by='L. Reyes', minted_clause_id='DP-S-610', minted_version=1
    where ticket_id=${id}`, [], OTHER);
  const t = await ticket(id);
  eq(t.state, 'verified');
  assert(num(t.edit_similarity) !== 0.1234, 'the caller does not get to report the figure');
  // And what landed is what the database computes from the two stored strings.
  const c = await one(`select cw.text_overlap(${q(AI_TEXT)}, ${q(edited)}) as v`);
  eq(num(t.edit_similarity), num(c.v));
});

await test('a caller claiming no edit, having edited, is contradicted by the figure', async () => {
  const id = await openTicket(AI_TEXT);
  await queryAs('legal_reviewer', `
    update cw.review_ticket set
      state='verified', approved_text='Something else entirely.',
      edited_before_approval=false, edit_similarity=1.0000,
      decided_by='L. Reyes', minted_clause_id='DP-S-611', minted_version=1
    where ticket_id=${id}`, [], OTHER);
  const t = await ticket(id);
  eq(t.edited_before_approval, true);
  assert(num(t.edit_similarity) < 1);
});

await test('the figure cannot be changed after the decision', async () => {
  const id = await openTicket(AI_TEXT);
  await verify(id, AI_TEXT, 'DP-S-612');
  const before = await ticket(id);
  await refused(() => queryAs('legal_reviewer',
    `update cw.review_ticket set edit_similarity=0.5000 where ticket_id=${id}`, [], OTHER),
    'a decided ticket cannot be redecided');
  const after = await ticket(id);
  eq(num(after.edit_similarity), num(before.edit_similarity));
});

// ════════════════════════════════════════════════════════════════════════════
// What the figure measures — the owner's ruling, as behaviour
// ════════════════════════════════════════════════════════════════════════════
console.log('\ntextual distance, additions counted as much as deletions');

await test('the same two texts always give the same figure', async () => {
  const a = 'one two three four five', b = 'one two three four six';
  const first  = await one(`select cw.text_overlap(${q(a)}, ${q(b)}) as v`);
  const second = await one(`select cw.text_overlap(${q(a)}, ${q(b)}) as v`);
  eq(num(first.v), num(second.v), 'the figure must not wobble between calls');
});

await test('adding words moves the figure exactly as much as removing them', async () => {
  const short = 'one two three four';
  const long  = 'one two three four five six';
  const added   = await one(`select cw.text_overlap(${q(short)}, ${q(long)}) as v`);
  const removed = await one(`select cw.text_overlap(${q(long)}, ${q(short)}) as v`);
  eq(num(added.v), num(removed.v), 'owner ruling: additions count as much as deletions');
  assert(num(added.v) < 1, 'and both are a change');
});

await test('an approval that only adds words is not treated as untouched', async () => {
  const id = await openTicket(AI_TEXT);
  await verify(id, AI_TEXT + ' Notice shall be in writing.', 'DP-S-620');
  const t = await ticket(id);
  eq(t.edited_before_approval, true);
  assert(num(t.edit_similarity) < 1);
});

await test('two texts sharing nothing sit at the bottom of the scale', async () => {
  const v = await one(`select cw.text_overlap('alpha beta', 'gamma delta') as v`);
  eq(num(v.v), 0);
});

// ════════════════════════════════════════════════════════════════════════════
// The draft's three documentation fields
// ════════════════════════════════════════════════════════════════════════════
console.log('\nthe draft records what it was for and what was known');

const newDraft = (cols = '', vals = '') => queryAs('legal_admin', `
  insert into cw.clause_draft (text, prompt, model, model_version${cols})
  values ('Some drafted words.', 'Some prompt.', 'a-model', 'v1'${vals})
  returning draft_id`, [], LEGAL);

const draft = id => one(`select intended_purpose, known_limitations, model_performance
                         from cw.clause_draft where draft_id=${id}`);

await test('a new draft is never empty on any of the three fields', async () => {
  const r = await newDraft();
  const d = await draft(r[0].draft_id);
  assert((d.intended_purpose ?? '').trim() !== '', 'intended purpose is never empty');
  assert((d.known_limitations ?? '').trim() !== '', 'known limitations are never empty');
  assert(d.model_performance !== null && Object.keys(d.model_performance).length > 0,
         'model performance is never empty');
});

await test('a draft may be created carrying all three, and keeps what it was given', async () => {
  const r = await newDraft(
    ', intended_purpose, known_limitations, model_performance',
    `, 'A stated purpose.', 'A stated limitation.', '{"accuracy": 0.9}'::jsonb`);
  const d = await draft(r[0].draft_id);
  eq(d.intended_purpose, 'A stated purpose.');
  eq(d.known_limitations, 'A stated limitation.');
  eq(d.model_performance, { accuracy: 0.9 });
});

await test('a blank value on any of the three is refused', async () => {
  await refused(() => newDraft(', intended_purpose', `, '   '`), 'blank purpose');
  await refused(() => newDraft(', known_limitations', `, ''`), 'blank limitations');
  await refused(() => newDraft(', model_performance', `, '{}'::jsonb`), 'empty metrics');
  await refused(() => newDraft(', model_performance', `, '[]'::jsonb`), 'metrics are a record');
  // The control: the same insert with real values goes through.
  const r = await newDraft(', intended_purpose', `, 'A purpose.'`);
  assert(r[0].draft_id > 0);
});

await test('none of the three can be brought up to date afterwards', async () => {
  const r = await newDraft();
  const id = r[0].draft_id;
  const before = await draft(id);
  for (const set of ["intended_purpose='rewritten'",
                     "known_limitations='rewritten'",
                     `model_performance='{"accuracy": 1}'::jsonb`]) {
    await refused(() => queryAs('legal_admin',
      `update cw.clause_draft set ${set} where draft_id=${id}`, [], LEGAL),
      `a fixed field was rewritten: ${set}`);
  }
  const after = await draft(id);
  eq(after, before, 'the record of what was known at the time is unchanged');
});

await test('the control: an unused draft is still editable in every other respect', async () => {
  // This is what shows the three refusals above come from the new rule rather
  // than from a draft being frozen outright.
  const r = await newDraft();
  const id = r[0].draft_id;
  await queryAs('legal_admin',
    `update cw.clause_draft set text='Revised drafted words.' where draft_id=${id}`, [], LEGAL);
  const d = await one(`select text from cw.clause_draft where draft_id=${id}`);
  eq(d.text, 'Revised drafted words.');
});

// ════════════════════════════════════════════════════════════════════════════
// The draft and the ticket, end to end
// ════════════════════════════════════════════════════════════════════════════
console.log('\na drafted candidate, through the gate');

await test('a ticket opened against a draft is decided and carries the figure', async () => {
  const text = 'Supplier shall maintain commercially reasonable security measures.';
  const r = await queryAs('legal_admin', `
    insert into cw.clause_draft (text, prompt, model, model_version,
                                 intended_purpose, known_limitations, model_performance)
    values (${q(text)}, 'A prompt.', 'a-model', 'v1',
            'A purpose.', 'A limitation.', '{"accuracy": 0.8}'::jsonb)
    returning draft_id`, [], LEGAL);
  const draftId = r[0].draft_id;
  const t = await queryAs('requester', `
    insert into cw.review_ticket
      (category_key,severity,reason_code,provenance_badge,proposed_text,draft_id)
    values ('data','Standard','ai-draft','AI CANDIDATE',${q(text)},${draftId})
    returning ticket_id`, [], BUYER);
  const id = t[0].ticket_id;
  await verify(id, text + ' Notice in writing.', 'DP-S-630');
  const got = await ticket(id);
  eq(got.state, 'verified');
  eq(got.edited_before_approval, true);
  assert(num(got.edit_similarity) < 1 && num(got.edit_similarity) > 0);
  // And the draft it was measured against still says what it said.
  const d = await draft(draftId);
  eq(d.intended_purpose, 'A purpose.');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n      ${m}`);
  process.exit(1);
}
