// The Review queue — the single gate through which language enters.
//
// ADR-0003, ADR-0004, ADR-0010, migrations 0008 and 0009.
//
// Almost everything below runs as a REAL cw_requester or cw_legal_reviewer,
// never as the database owner. That is not stylistic. The owner bypasses
// row-level security entirely and holds every table privilege by definition, so
// a gate tested as the owner is a gate nobody walked through — which is exactly
// how finding D1 survived a green suite. The two exceptions are marked, and
// both assert a TRIGGER's own words, which fire for the owner too.
//
//   node db/test/review-queue.test.mjs

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
const { queryAs, execAs, mustNotWrite } = roleHelpers(db);

const q = s => `'${String(s).replace(/'/g, "''")}'`;

console.log('\nseed');
await test('a library, a deal and an AI draft', async () => {
  await db.exec(`
    insert into cw.category (key,label,short) values
      ('data','Data Privacy','DP'), ('liab','Liability Cap','LC');
    insert into cw.clause (clause_id,category_key,severity) values
      ('DP-H-014','data','High'), ('LC-S-009','liab','Standard');
    insert into cw.clause_version (clause_id,version,title,body,reviewer,approved_on,expires_on)
      values
      ('DP-H-014',1,'24h notice','Notify within 24 hours.','R. Vance','2025-01-01','2028-01-01'),
      ('LC-S-009',1,'Cap at fees','Capped at fees paid.','R. Vance','2025-01-01','2028-01-01');
    insert into cw.agreement (agreement_id,counterparty,sector,value_usd,requester) values
      ('AG-001','Northwind Analytics','tech',240000,'buyer@clausewerk');
    insert into cw.clause_draft (draft_id,text,prompt,model,model_version,created_by) values
      (1,'Supplier shall notify Customer within thirty-six (36) hours of a Personal Data Breach.',
       'Draft a breach-notification clause between our 24h position and the vendor 72h ask.',
       'claude','v4.5','legal@clausewerk'),
      (2,'Supplier shall maintain commercially reasonable security.',
       'Draft a security clause.','claude','v4.5','legal@clausewerk');
    select setval('cw.clause_draft_draft_id_seq', 2);`);
  const d = await one(`select count(*)::int n from cw.clause_draft`);
  eq(d.n, 2);
});

// ════════════════════════════════════════════════════════════════════════════
// WP-16b · the front door — INSERT is governed, and legitimate opens still work
// ════════════════════════════════════════════════════════════════════════════
// The refutation this section answers: a `before update` trigger alone leaves
// INSERT ungoverned, so a requester can create a row that is ALREADY rejected,
// with an empty note and a hand-written decider. The transition trigger never
// fires and the mandatory-note guarantee is defeated on day one.

console.log('\nthe front door (WP-16b)');

// THE POSITIVE CONTROL. An insert-time guard that also blocks legitimate ticket
// creation is not a guard, it is an outage — so this runs first and must pass
// before any of the refusals below mean anything.
await test('a requester can open an ordinary ticket (positive control)', async () => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,opened_by)
    values ('AG-001','data','High','human-escalated','VENDOR LANGUAGE',
            'Supplier shall notify Customer within seventy-two (72) hours.',
            'forged-opener@clausewerk')
    returning ticket_id, state, opened_by`, [], 'buyer@clausewerk');
  eq(r[0].state, 'pending', 'a ticket opens pending');
  eq(r[0].opened_by, 'buyer@clausewerk',
     'and it records the authenticated opener, not caller-supplied attribution');
});

await test('a requester cannot open a ticket on another buyer’s agreement', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-001','data','High','human-escalated','VENDOR LANGUAGE',
            'Foreign requester language.')`,
    [], 'somebody.else@clausewerk'),
    'does not own agreement AG-001');
  const n = await one(`select count(*)::int n from cw.review_ticket
                        where proposed_text='Foreign requester language.'`);
  eq(n.n, 0, 'the foreign requester must leave no review-queue record');
});

await test('a requester cannot open a ticket that is already rejected', async () => {
  // The whole attack in one statement: born terminal, with an empty note that
  // the CHECK as originally specified would have accepted.
  await throws(() => queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,
       state,decision_note,decided_by)
    values ('AG-001','data','High','human-escalated','VENDOR LANGUAGE','anything',
            'rejected','','me')`, [], 'buyer@clausewerk'),
    'a review ticket opens in pending',
    'a ticket born in a terminal state walks past the whole state machine');
});

await test('a requester cannot open a ticket that is already verified', async () => {
  await throws(() => queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,
       state,decided_by,approved_text,edited_before_approval,
       minted_clause_id,minted_version)
    values ('AG-001','data','High','human-escalated','VENDOR LANGUAGE','anything',
            'verified','me','anything',false,'DP-H-099',1)`, [], 'buyer@clausewerk'),
    'a review ticket opens in pending');
});

await test('a ticket cannot be opened already carrying a decision', async () => {
  // Pending, so the state check above does not fire — but with the decision
  // fields pre-filled, ready to be "confirmed" later.
  await throws(() => queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,
       decided_by,decision_note)
    values ('AG-001','data','High','human-escalated','VENDOR LANGUAGE','anything',
            'me','looks fine')`, [], 'buyer@clausewerk'),
    'cannot be opened carrying a decision');
});

await test('a draft-backed ticket must carry the draft as written', async () => {
  // The baseline cannot be pre-edited at open time. If it could, the reviewer
  // would approve text that already matched a doctored baseline and the
  // unedited-approval rate would measure nothing.
  await throws(() => queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,draft_id)
    values ('AG-001','data','High','ai-draft','AI CANDIDATE',
            'Supplier shall notify Customer within twenty-four (24) hours.',1)`,
    [], 'buyer@clausewerk'),
    'does not match draft');
});

console.log('\nthe rejection note is mandatory in fact, not in spirit (WP-16b)');

await test('a rejection with an empty note is refused', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await throws(() => queryAs('legal_reviewer',
    `select cw.reject_review_ticket(${id}, 'L. Reyes', '')`, [], 'legal@clausewerk'),
    'rejection_needs_note',
    "'' satisfies `is not null`, which is why the original CHECK was decorative");
});

await test('a rejection with a whitespace-only note is refused', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await throws(() => queryAs('legal_reviewer',
    `select cw.reject_review_ticket(${id}, 'L. Reyes', '   ')`, [], 'legal@clausewerk'),
    'rejection_needs_note',
    'a form that posts spaces must not be allowed to satisfy a mandatory field');
});

await test('a rejection with a real note is recorded, as the real role', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await queryAs('legal_reviewer',
    `select cw.reject_review_ticket(${id}, 'L. Reyes',
       'Seventy-two hours is below our regulatory floor; escalate to the ladder.')`,
    [], 'legal@clausewerk');
  const t = await one(`select state, decided_by, decision_note, edited_before_approval
                       from cw.review_ticket where ticket_id=${id}`);
  eq(t.state, 'rejected');
  eq(t.decided_by, 'L. Reyes');
  assert(t.decision_note.includes('regulatory floor'));
  eq(t.edited_before_approval, null, 'a rejected ticket approved nothing, so it edited nothing');
});

await test('a decided ticket cannot be reopened or redecided', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket where state='rejected' limit 1`)).ticket_id;
  await throws(() => queryAs('legal_reviewer',
    `update cw.review_ticket set state='pending' where ticket_id=${id}`, [], 'legal@clausewerk'),
    'cannot be reopened');
});

await test('a requester cannot decide a ticket', async () => {
  // Two walls, and this asserts the outer one: a requester holds no UPDATE
  // grant at all, so the explicit `for update` policy never has to be consulted.
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-001','liab','Standard','human-edit','VENDOR LANGUAGE',
            'Liability capped at three (3) months of fees.')
    returning ticket_id`, [], 'buyer@clausewerk');
  await throws(() => queryAs('requester',
    `update cw.review_ticket set state='verified' where ticket_id=${r[0].ticket_id}`,
    [], 'buyer@clausewerk'),
    'permission denied for table review_ticket',
    'opening a ticket and deciding one are two acts by two parties');
});

await test('a requester cannot call the verification function', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket where state='pending'
                         order by ticket_id limit 1`)).ticket_id;
  await throws(() => queryAs('requester',
    `select cw.verify_review_ticket(${id},'x','DP-H-090','t','r','R. Vance','2028-01-01')`,
    [], 'buyer@clausewerk'),
    'permission denied for function verify_review_ticket');
});

// ════════════════════════════════════════════════════════════════════════════
// WP-16c · edited_before_approval, derived from stored bytes
// ════════════════════════════════════════════════════════════════════════════
// ADR-0010 makes the unedited-approval rate the binding control on review
// quality. As originally designed the flag was structurally pinned to false —
// proposed_text was immutable and the verify function took no body parameter,
// so a reviewer's edit had nowhere to land. A control that reports a perfect
// score forever is worse than no control, because the perfect score is also the
// alarm value.

console.log('\nedited_before_approval is a measurement, not a claim (WP-16c)');

const DRAFT_1 =
  'Supplier shall notify Customer within thirty-six (36) hours of a Personal Data Breach.';
const DRAFT_2 = 'Supplier shall maintain commercially reasonable security.';

await test('a draft-backed ticket opens carrying the draft verbatim', async () => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,draft_id)
    values ('AG-001','data','High','ai-draft','AI CANDIDATE',${q(DRAFT_1)},1)
    returning ticket_id`, [], 'buyer@clausewerk');
  assert(r[0].ticket_id > 0);
});

await test("a reviewer's edit is recorded as an edit", async () => {
  const id = (await one(`select ticket_id from cw.review_ticket where draft_id=1`)).ticket_id;
  const edited =
    'Supplier shall notify Customer within thirty-six (36) hours of a Personal Data Breach, ' +
    'and shall provide a written root-cause analysis within ten (10) business days.';
  const r = await queryAs('legal_reviewer',
    `select cw.verify_review_ticket(${id}, ${q(edited)}, 'DP-H-090',
       'Breach notice, 36h', 'Between our position and the vendor ask',
       'L. Reyes', '2028-01-01') as ref`, [], 'legal@clausewerk');
  eq(r[0].ref, 'DP-H-090@v1');
  const t = await one(`select edited_before_approval, approved_text
                       from cw.review_ticket where ticket_id=${id}`);
  eq(t.edited_before_approval, true,
     'the lawyer changed the words; the record must say so');
  assert(t.approved_text.includes('root-cause analysis'),
    'the approved bytes are stored, which is what makes the flag derivable at all');
  const v = await one(`select body, provenance, origin, source_ticket_id
                       from cw.clause_version where clause_id='DP-H-090'`);
  assert(v.body.includes('root-cause analysis'),
    'and the clause carries the EDITED text, not the draft');
  eq(v.provenance, 'reviewed');
  eq(v.origin, 'ai_drafted', 'a draft-backed ticket mints AI-originated wording');
  eq(v.source_ticket_id, id, 'the clause names the ticket it came through');
});

await test('an unedited approval is recorded as unedited', async () => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text,draft_id)
    values ('AG-001','data','Standard','ai-draft','AI CANDIDATE',${q(DRAFT_2)},2)
    returning ticket_id`, [], 'buyer@clausewerk');
  const id = r[0].ticket_id;
  await queryAs('legal_reviewer',
    `select cw.verify_review_ticket(${id}, ${q(DRAFT_2)}, 'DP-S-091',
       'Reasonable security', 'Accepted as drafted', 'L. Reyes', '2028-01-01')`,
    [], 'legal@clausewerk');
  const t = await one(`select edited_before_approval from cw.review_ticket where ticket_id=${id}`);
  eq(t.edited_before_approval, false,
     'approving a model draft word for word is the fact the rate exists to expose');
});

await test('a caller cannot self-report a clean score', async () => {
  // The defeat that matters most: pass the flag by hand on the way through. The
  // trigger derives it from the two stored strings and assigns over whatever
  // arrived, so a hand-written value never survives.
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-001','data','High','human-edit','VENDOR LANGUAGE',
            'Supplier shall notify Customer within forty-eight (48) hours.')
    returning ticket_id`, [], 'buyer@clausewerk');
  const id = r[0].ticket_id;
  await queryAs('legal_reviewer', `
    update cw.review_ticket set
      state='verified', approved_text='Supplier shall notify Customer within 24 hours.',
      edited_before_approval=false, decided_by='L. Reyes',
      minted_clause_id='DP-H-092', minted_version=1
    where ticket_id=${id}`, [], 'legal@clausewerk');
  const t = await one(`select edited_before_approval from cw.review_ticket where ticket_id=${id}`);
  eq(t.edited_before_approval, true,
     'the flag is computed from the bytes, so a false claim is simply overwritten');
});

await test('the baseline cannot be edited instead of the approval', async () => {
  // The other end of the same defeat, and the one dropped during integration:
  // rewrite the AI's own words to match what the lawyer approved and the
  // control silently reports perfection from the far side.
  await throws(() => queryAs('legal_reviewer',
    `update cw.clause_draft set text='anything at all' where draft_id=1`,
    [], 'legal@clausewerk'),
    'is under review',
    'a draft under review is the baseline of a measurement, not a scratchpad');
});

await test('an unused draft is still ordinary work in progress', async () => {
  // The positive control for the freeze: it bites when the draft is used, and
  // only then. A freeze that also stops routine drafting would be refused by
  // its users and switched off.
  await queryAs('legal_reviewer', `
    insert into cw.clause_draft (draft_id,text,prompt,model,model_version,created_by)
    values (9,'first attempt','p','claude','v4.5','forged-author@clausewerk')`,
    [], 'legal@clausewerk');
  await queryAs('legal_reviewer',
    `update cw.clause_draft set text='second attempt' where draft_id=9`, [], 'legal@clausewerk');
  const d = await one(`select text, created_by from cw.clause_draft where draft_id=9`);
  eq(d.text, 'second attempt');
  eq(d.created_by, 'legal@clausewerk',
     'draft provenance is bound to the authenticated actor');
});

await test('the ticket text cannot be moved under a pending decision', async () => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-001','liab','Standard','no-ai-match','VENDOR LANGUAGE','original ask')
    returning ticket_id`, [], 'buyer@clausewerk');
  await throws(() => queryAs('legal_reviewer',
    `update cw.review_ticket set proposed_text='something else'
     where ticket_id=${r[0].ticket_id}`, [], 'legal@clausewerk'),
    'cannot be rewritten, only decided');
});

await test('the unedited-approval rate is computable', async () => {
  const r = await one(`select verified, verified_unedited, unedited_rate from cw.review_quality`);
  assert(r.verified >= 3, 'three verified tickets so far');
  eq(r.verified_unedited, 1);
  assert(Number(r.unedited_rate) > 0 && Number(r.unedited_rate) < 1,
    `the rate must be a real fraction, got ${r.unedited_rate}`);
});

// ════════════════════════════════════════════════════════════════════════════
// The gate itself
// ════════════════════════════════════════════════════════════════════════════

console.log('\nlanguage enters only through a verified ticket');

await test('a reviewer cannot mint a clause version out of thin air', async () => {
  await throws(() => queryAs('legal_reviewer', `
    insert into cw.clause_version (clause_id,version,title,body,reviewer)
    values ('DP-H-014',2,'quietly better','Notify whenever.','L. Reyes')`,
    [], 'legal@clausewerk'),
    'row-level security policy',
    'the reviewer privilege exists to serve a verified ticket and nothing else');
});

await test('a clause version cannot name a ticket that was never verified', async () => {
  const r = await queryAs('requester', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-001','data','High','no-ai-match','VENDOR LANGUAGE','pending forever')
    returning ticket_id`, [], 'buyer@clausewerk');
  await throws(() => queryAs('legal_reviewer', `
    insert into cw.clause_version (clause_id,version,title,body,reviewer,source_ticket_id)
    values ('DP-H-014',2,'x','Notify whenever.','L. Reyes',${r[0].ticket_id})`,
    [], 'legal@clausewerk'),
    'not verified');
});

await test('every clause version can name the door it came through', async () => {
  const u = await one(`select count(*)::int n from cw.clause_entrance where entrance='UNACCOUNTED'`);
  eq(u.n, 0, 'a clause nobody can explain is the thing this gate exists to prevent');
  const e = await rows(`select entrance, count(*)::int n from cw.clause_entrance
                        group by entrance order by entrance`);
  const byName = Object.fromEntries(e.map(x => [x.entrance, x.n]));
  assert(byName.review_ticket >= 2, 'the ticket entrance is in use');
  assert(byName.seeded >= 2, 'and the seeded library is still distinguishable');
});

await test('a review ticket cannot be deleted', async () => {
  // Runs as the OWNER, deliberately, and asserts the TRIGGER's own words. A
  // role-level test here would pass on a missing grant and prove nothing about
  // the rule; the trigger fires for everyone, including the owner, which is
  // what settled decision S0-3 asks for. It RAISES — it is not the
  // `do instead nothing` rule that makes a bug indistinguishable from success.
  const before = await one(`select count(*)::int n from cw.review_ticket`);
  await throws(() => db.exec(`delete from cw.review_ticket where ticket_id=1`),
    'a review ticket cannot be deleted');
  const after = await one(`select count(*)::int n from cw.review_ticket`);
  eq(after.n, before.n);
});

await test('a draft cannot be deleted either', async () => {
  await throws(() => db.exec(`delete from cw.clause_draft where draft_id=9`),
    'cannot be deleted');
});

console.log('\ncandidates are references, not copies (ADR-0004)');

await test('suppressed candidates are recorded by reference', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await queryAs('legal_reviewer', `
    insert into cw.review_candidate (ticket_id,seq,clause_id,version,disposition,score,reason)
    values (${id},0,'DP-H-014',1,'suppressed',0.8100,'stricter than the vendor would accept')`,
    [], 'legal@clausewerk');
  const c = await one(`select cv.body from cw.review_candidate rc
                       join cw.clause_version cv
                         on cv.clause_id=rc.clause_id and cv.version=rc.version
                       where rc.ticket_id=${id} and rc.seq=0`);
  eq(c.body, 'Notify within 24 hours.',
     'the reference resolves to the immutable original — no second copy to disagree');
});

await test('a candidate cannot point at a clause version that does not exist', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await throws(() => queryAs('legal_reviewer',
    `insert into cw.review_candidate (ticket_id,seq,clause_id,version,disposition)
     values (${id},1,'DP-H-014',99,'alternate')`, [], 'legal@clausewerk'),
    'foreign key');
});

await test('the redline segments survive as they arrived', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await queryAs('requester', `
    insert into cw.review_segment (ticket_id,seq,kind,text) values
      (${id},0,'keep','Supplier shall notify Customer within '),
      (${id},1,'del','twenty-four (24)'),
      (${id},2,'ins','seventy-two (72)'),
      (${id},3,'keep',' hours.')`, [], 'buyer@clausewerk');
  const s = await rows(`select kind, text from cw.review_segment
                        where ticket_id=${id} order by seq`);
  eq(s.length, 4);
  eq(s[1].kind, 'del');
});

await test('a segment cannot be edited after the fact', async () => {
  const id = (await one(`select ticket_id from cw.review_ticket order by ticket_id limit 1`)).ticket_id;
  await throws(() => db.exec(
    `update cw.review_segment set text='something kinder' where ticket_id=${id} and seq=1`),
    'evidence and cannot be edited');
});

// ════════════════════════════════════════════════════════════════════════════
// WP-17 · origin
// ════════════════════════════════════════════════════════════════════════════

console.log('\norigin is permanent (WP-17, ADR-0010)');

await test('origin cannot be rewritten after approval', async () => {
  // Run as the OWNER on purpose. The privilege system stops application roles
  // and denies with "permission denied", which says nothing about the rule;
  // the trigger fires for everyone and says exactly what the rule is.
  await throws(() => db.exec(
    `update cw.clause_version set origin='legal_authored' where clause_id='DP-H-090'`),
    'is immutable',
    'relabelling AI-drafted wording as lawyer-composed is the one edit that turns '
    + 'the provenance chain into a story');
});

await test('the ticket a clause came through cannot be rewritten either', async () => {
  await throws(() => db.exec(
    `update cw.clause_version set source_ticket_id=null where clause_id='DP-H-090'`),
    'is immutable');
});

await test('seeded language defaults to legal_authored', async () => {
  const v = await one(`select origin from cw.clause_version where clause_id='DP-H-014' and version=1`);
  eq(v.origin, 'legal_authored');
});

await test('an unknown origin cannot be stored', async () => {
  await throws(() => db.exec(`
    insert into cw.clause (clause_id,category_key,severity) values ('DP-H-777','data','High');
    insert into cw.clause_version (clause_id,version,title,body,reviewer,origin)
    values ('DP-H-777',1,'x','y','R. Vance','model_authored')`),
    'clause_version_origin_check');
});

await test('external wording is never selectable', async () => {
  // The reconciliation: ADR-0010 makes `external` a clause-version origin, and
  // NEGOTIATION-ARCHITECTURE.md §7 gives external clauses their own
  // agreement-scoped entity that is "never selectable". Implemented as an
  // origin, with the never-selectable half ENFORCED by the same view that
  // already refuses retired and expired language — rather than left as a
  // property of which tables today's queries happen to join.
  await db.exec(`
    insert into cw.clause (clause_id,category_key,severity) values ('DP-X-001','data','High');
    insert into cw.clause_version
      (clause_id,version,title,body,reviewer,approved_on,expires_on,origin)
    values ('DP-X-001',1,'Supplier paper','Supplier paper wording, agreement scoped.',
            'R. Vance','2025-01-01','2028-01-01','external')`);
  const s = await one(`select selectable, state from cw.clause_version_state
                       where clause_id='DP-X-001'`);
  eq(s.selectable, false, 'supplier paper must never be drawn into one of our drafts');
  const p = await one(`select count(*)::int n from cw.selectable_clause where clause_id='DP-X-001'`);
  eq(p.n, 0);
});

await test('both provenance figures are computable for the library', async () => {
  const m = await rows(`select origin, versions, characters from cw.library_origin_mix
                        order by origin`);
  const byOrigin = Object.fromEntries(m.map(x => [x.origin, x]));
  assert(byOrigin.ai_drafted, 'the AI-originated figure exists');
  assert(Number(byOrigin.ai_drafted.characters) > 0);
  assert(byOrigin.legal_authored, 'and so does the lawyer-composed one');
  assert(byOrigin.external, 'and supplier paper is counted, not hidden');
});

await test('a promoted concession is vendor_derived', async () => {
  await db.exec(`
    insert into cw.ladder (ladder_id,category_key,severity,owner)
      values (1,'data','High','R. Vance');
    insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor)
      values (1,0,'DP-H-014',1,true);
    insert into cw.concession
      (agreement_id,category_key,standard_clause_id,standard_version,vendor_text,
       override_ref,reason,approved_by)
    values ('AG-001','data','DP-H-014',1,'Supplier shall notify within five (5) days.',
            'OVR-2026-0050','Vendor would not sign otherwise','legal@clausewerk');`);
  const id = (await one(`select concession_id from cw.concession
                         where vendor_text is not null order by concession_id desc limit 1`)).concession_id;
  // Promotion now runs behind WP-18a's approval gate (WP-SWEEP): only a SETTLED
  // concession may enter the library. Satisfying that gate is fixture setup for
  // this test, whose subject is the origin the promotion door stamps; the gate
  // itself is proven in governance.test.mjs and ladder.test.mjs as real roles.
  await db.exec(`
    insert into cw.agreement_attorney (agreement_id,attorney,assigned_by)
      values ('AG-001','counsel@clausewerk','legal@clausewerk');
    insert into cw.concession_approval (concession_id,approver_kind,approver) values
      (${id},'requester','buyer@clausewerk'),
      (${id},'attorney','counsel@clausewerk');
    insert into cw.concession_settlement (concession_id,settled_by)
      values (${id},'legal@clausewerk');`);
  await queryAs('legal_admin',
    `select cw.promote_concession(${id},'DP-S-095','5-day notice','Derived','R. Vance','2028-01-01')`,
    [], 'legal@clausewerk');
  const v = await one(`select origin, provenance, source_ticket_id
                       from cw.clause_version where clause_id='DP-S-095'`);
  eq(v.origin, 'vendor_derived',
     'both entrances now mint through cw.mint_clause_version, and each keeps its own origin');
  eq(v.provenance, 'promoted');
  eq(v.source_ticket_id, null, 'the promotion door is a different door, and says so');
});

console.log('\naudit');

await test('opening and deciding a ticket both leave a record', async () => {
  const opened = await one(
    `select count(*)::int n from cw.audit_event where event_type='review_ticket_opened'`);
  assert(opened.n >= 5, 'every ticket opened leaves a record');
  const verified = await one(
    `select payload from cw.audit_event where event_type='review_ticket_verified'
     order by seq limit 1`);
  eq(verified.payload.edited_before_approval, true,
     'the control ADR-0010 names is in the permanent record, not only in a view');
  const rejected = await one(
    `select payload from cw.audit_event where event_type='review_ticket_rejected' limit 1`);
  assert(String(rejected.payload.note).includes('regulatory floor'));
});

await test('a drafted candidate is recorded as a machine act', async () => {
  const e = await one(`select actor_kind, payload from cw.audit_event
                       where event_type='clause_drafted' order by seq limit 1`);
  eq(e.actor_kind, 'controller',
     'a machine act may never be recorded as a human one (ADR-0008 §3)');
  eq(e.payload.model_version, 'v4.5');
});

await test('the audit chain still verifies after all of this', async () => {
  const v = await one(`select cw.audit_verify() as broken`);
  eq(v.broken, null, 'the whole review queue writes through the same append path');
});

console.log('\nrow-level security');

await test('a viewer cannot read the review queue at all', async () => {
  await db.exec(`reset role; set role cw_viewer;`);
  await throws(() => db.exec(`select * from cw.review_ticket limit 1`),
    'permission denied for table review_ticket');
  await db.exec(`reset role;`);
});

await test('a requester sees only their own tickets', async () => {
  await db.exec(`reset role;
    insert into cw.agreement (agreement_id,counterparty,requester)
      values ('AG-002','Contoso','other@clausewerk');`);
  await execAs('legal_reviewer', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-002','data','High','no-ai-match','VENDOR LANGUAGE','someone else''s deal')`,
    'legal@clausewerk');
  const mine = await queryAs('requester',
    `select agreement_id from cw.review_ticket`, [], 'buyer@clausewerk');
  assert(mine.length > 0, 'a requester must still see their own');
  assert(mine.every(r => r.agreement_id === 'AG-001'),
    `a buyer must not see another buyer's tickets, saw ${JSON.stringify(mine)}`);
});

await test('an auditor sees every ticket', async () => {
  const all = await queryAs('auditor', `select count(*)::int n from cw.review_ticket`);
  const owner = await one(`select count(*)::int n from cw.review_ticket`);
  eq(all[0].n, owner.n);
});

await test('an auditor cannot write to the queue', async () => {
  await mustNotWrite('auditor', `
    insert into cw.review_ticket
      (agreement_id,category_key,severity,reason_code,provenance_badge,proposed_text)
    values ('AG-001','data','High','no-ai-match','VENDOR LANGUAGE','audit should not write')`);
});

await db.exec(`reset role;`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
