// Mutation check: prove the registry tests can actually fail.
//
// A suite that passes on the first run tells you nothing until you have seen it
// fail for the right reason. This deliberately breaks one guarantee at a time
// and asserts the suite catches it.
//
//   node db/test/mutation-check.mjs

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'migrations');

const MUTATIONS = [
  { name: 'short codes not unique',
    find: 'short  text not null unique',
    repl: 'short  text not null',
    expect: 'a duplicate short code is rejected' },

  { name: 'selectable ignores expiry (finding #1 regression)',
    find: 'and (v.expires_on is null or v.expires_on >= current_date)',
    repl: 'and true',
    expect: 'nothing retired or expired leaks into selectable_clause' },

  { name: 'missing dates treated as expired (finding #8 regression)',
    find: "(v.expires_on is not null and v.expires_on < current_date)          as expired",
    repl: "(coalesce(v.expires_on, date '2020-01-01') < current_date)          as expired",
    expect: 'a clause with no dates is flagged, not expired' },

  { name: 'clause bodies editable (ADR-0006 regression)',
    find: 'or new.body is distinct from old.body',
    repl: 'or false',
    expect: 'editing clause body is refused' },

  // Dropping the previous hash makes verification fail outright, so what this
  // actually proves is that the chain is *linked* — not that tampering is
  // detected. The tamper-detection mutations live alongside the rebuilt chain.
  //
  // WP-03a rewrote the pre-image, which destroyed this entry's original `find`
  // string ("coalesce(prev,'') || '|' || new.ts::text"). Repaired here rather
  // than deferred: an unfound `find` exits the harness non-zero.
  //
  // The writer and the verifier now share one pre-image function, so a mutation
  // applied to that function changes BOTH sides and cancels itself out. This
  // entry therefore breaks the linkage on the writer's side ONLY — the stored
  // prev_hash column stays correct, so the verifier still hashes with the real
  // parent and the two disagree from the second row onward.
  { name: 'audit log not hash-chained',
    find: '      new.prev_hash, new.seq, new.ts, new.actor, new.actor_role,',
    repl: "      '', new.seq, new.ts, new.actor, new.actor_role,",
    expect: 'the hash chain verifies' },

  // ── The audit chain rebuilt (WP-03) ──
  { suite: 'audit-chain.test.mjs',
    name: 'the timestamp is hashed as text again (D2 regression)',
    find: '      || cw.lp((extract(epoch from p_ts) * 1000000)::bigint::text)',
    repl: '      || cw.lp(p_ts::text)',
    expect: 'an honest chain verifies clean whatever the session timezone (UTC)' },

  { suite: 'audit-chain.test.mjs',
    name: 'actor_role dropped from the pre-image',
    find: "      || cw.lp(coalesce(p_actor_role,''))",
    repl: "      || cw.lp('')",
    expect: 'rewriting actor_role on a past event is detected' },

  // Not an ordinary insert: prev_hash is trigger-assigned, so the fork can only
  // be induced from below the application. The test disables the trigger to do
  // exactly that, which is why this mutation is catchable at all.
  { suite: 'audit-chain.test.mjs',
    name: 'fork guard removed',
    find: `create unique index audit_no_fork
  on cw.audit_event (prev_hash) nulls not distinct;`,
    repl: 'select 1;',
    expect: 'a forked append is refused' },

  { suite: 'audit-chain.test.mjs',
    name: 'the anchor never reports a broken tail',
    find: '  if h >= c.height and cur_hash is not distinct from c.last_hash then',
    repl: '  if true then',
    expect: 'truncating the newest events is caught by the anchor' },

  // The audited write in this entry's test runs AS A NAMED ROLE. Run as the
  // owner it would prove nothing at all — the owner bypasses row-level security
  // entirely, so a missing INSERT policy is invisible to them.
  { suite: 'audit-chain.test.mjs',
    name: 'audit RLS has a SELECT policy but no INSERT policy',
    find: `create policy audit_append on cw.audit_event for insert with check (
  cw.app_role() in ('requester','legal_reviewer','legal_admin'));`,
    repl: 'select 1;',
    expect: 'every writing role can still record an audited act (requester)' },

  { suite: 'audit-chain.test.mjs',
    name: 'the append path reads the tail through the caller’s filtered view',
    find: `create or replace function cw.audit_chain() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as`,
    repl: `create or replace function cw.audit_chain() returns trigger
language plpgsql as`,
    expect: 'every writing role can still record an audited act (requester)' },

  { suite: 'audit-chain.test.mjs',
    name: 'requesters read every rival buyer’s audit payloads',
    find: "  or (cw.app_role() = 'requester' and audit_event.actor = cw.app_actor()));",
    repl: '  or true);',
    expect: `a requester cannot read another actor's audit payload` },

  { suite: 'audit-chain.test.mjs',
    name: 'audit_verify() walks the caller’s filtered view',
    find: `create or replace function cw.audit_verify() returns bigint
language plpgsql stable
security definer set search_path = cw, pg_temp as`,
    repl: `create or replace function cw.audit_verify() returns bigint
language plpgsql stable as`,
    expect: 'a scoped role gets a clean verify' },

  // ── Identity narrowed to the connection (WP-04, finding D3) ──
  //
  // Finding D3 restored exactly: cw.app_role() goes back to reading a session
  // variable, so a cw_legal_reviewer who sets one string is a legal_admin as far
  // as every policy in the schema is concerned. The named test performs a
  // governed write the reviewer genuinely holds the grant for, so no privilege
  // error can stand in for the protection.
  // REPOINTED at 0013 (WP-U01). This entry used to key on the five-way CASE in
  // 0001, and it silently stopped working the moment 0013 redefined
  // cw.app_role() to add the administrator: the harness broke 0001's copy,
  // 0013's correct copy then replaced it, and the mutation cancelled itself out
  // — reported as MISS, "nothing guards this", for a protection that was
  // actually intact.
  //
  // The lesson is worth keeping, because it will happen again: a mutation must
  // key on the definition that is LIVE after all migrations run, not on the
  // first one a grep finds. The `find` below carries the administrator line
  // precisely so it matches 0013 and nothing else.
  { suite: 'roles.test.mjs',
    name: 'identity is claimed in a session variable again (finding D3 regression)',
    find: `  select case current_user
    when 'cw_viewer'         then 'viewer'
    when 'cw_requester'      then 'requester'
    when 'cw_legal_reviewer' then 'legal_reviewer'
    when 'cw_legal_admin'    then 'legal_admin'
    when 'cw_auditor'        then 'auditor'
    when 'cw_administrator'  then 'administrator'
  end`,
    repl: `  select nullif(current_setting('cw.role', true), '')`,
    expect: 'a legal reviewer cannot become legal_admin by setting cw.role' },

  // And the sixth answer itself. Without it every policy sees the administrator
  // as null and the role can do nothing at all — including the account-keeping
  // that is its whole purpose.
  { suite: 'administrator.test.mjs',
    name: 'the role accessor never learned the sixth answer',
    find: `    when 'cw_administrator'  then 'administrator'`,
    repl: `    when 'cw_administrator'  then null`,
    expect: 'cw.app_role() answers administrator for a cw_administrator connection' },

  // The read half of D3, narrowed to one role so it cannot be confused with the
  // write-path entry above. Table privileges never covered this: a requester
  // holds SELECT on cw.agreement by design and only the policy keeps them inside
  // their own deals.
  { suite: 'roles.test.mjs',
    name: 'a requester may still talk their way up to another role',
    find: `    when 'cw_requester'      then 'requester'`,
    repl: `    when 'cw_requester'      then coalesce(nullif(current_setting('cw.role', true), ''), 'requester')`,
    expect: 'a requester cannot read another buyer’s agreement by claiming a role' },

  // The attribution binding, on its own. Without it the three roles that hold
  // INSERT on the audit log can write any actor_role they like by hand, and the
  // permanent record shows an authority the connection never held.
  { suite: 'roles.test.mjs',
    name: 'audit attribution is unbound from the connection',
    find: `create policy audit_attribution_bound on cw.audit_event
  as restrictive for insert
  with check (audit_event.actor_role is not distinct from cw.app_role());`,
    repl: 'select 1;',
    expect: 'audit attribution cannot name a role the connection does not hold' },

  // ── The immutability holes (WP-05, finding D4) ──
  { name: 'the reviewer on an approved clause is editable',
    find: '     or new.reviewer is distinct from old.reviewer\n',
    repl: '     or false\n',
    expect: 'the named reviewer cannot be rewritten' },

  { name: 'a retired clause can be un-retired',
    find: `  if old.retired and not new.retired then
    raise exception
      'clause_version %@v% is retired;`,
    repl: `  if false then
    raise exception
      'clause_version %@v% is retired;`,
    expect: 'a retired clause cannot be un-retired' },

  // The hook used to fire only on the way OUT. This restores that: language
  // coming BACK is recorded as though it had been retired, so the log says the
  // opposite of what happened.
  { name: 'un-retiring is logged as a retirement',
    find: `      case when new.retired then 'clause_retired' else 'clause_unretired' end,`,
    repl: `      'clause_retired',`,
    expect: 'un-retiring leaves a record even if the guard is bypassed' },

  { name: 'a conflict rule’s effective date can be moved retroactively',
    find: '     or new.effective_on is distinct from old.effective_on\n',
    repl: '     or false\n',
    expect: "a rule's effective date cannot be moved retroactively" },

  { name: 'a retired conflict rule can be brought back by an edit',
    find: `  if old.retired and not new.retired then
    raise exception
      'conflict_rule %@v% is retired;`,
    repl: `  if false then
    raise exception
      'conflict_rule %@v% is retired;`,
    expect: 'a retired conflict rule cannot be brought back by an edit' },

  { name: 'legal reviewer may supersede (ADR-0008 regression)',
    find: `create policy admin_writes on cw.supersession for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');`,
    repl: `create policy admin_writes on cw.supersession for all
  using (true) with check (true);
grant insert on cw.supersession to cw_legal_reviewer;
grant usage, select on sequence cw.supersession_id_seq to cw_legal_reviewer;`,
    expect: 'a legal reviewer cannot supersede — only legal admin can' },

  // ── Ladders and concessions (CLA) ──
  { suite: 'ladder.test.mjs',
    name: 'the floor is not absolute',
    find: `  if new.conceded_rung is not null and floor_rung is not null
     and new.conceded_rung > floor_rung and new.override_ref is null then`,
    repl: `  if false then`,
    expect: 'conceding below the floor without an override is refused' },

  { suite: 'ladder.test.mjs',
    name: 'vendor language accepted without an override',
    find: `  if new.vendor_text is not null and new.override_ref is null then`,
    repl: `  if false then`,
    expect: 'accepting vendor language without an override is refused' },

  { suite: 'ladder.test.mjs',
    name: 'anyone may promote a concession into the library (ADR-0009 regression)',
    find: `  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'only legal_admin may promote a concession into the library'
      using errcode = 'insufficient_privilege';
  end if;`,
    repl: `  if false then raise exception 'unreachable'; end if;`,
    expect: 'a caller with no legal_admin authority cannot promote' },

  { suite: 'ladder.test.mjs',
    name: 'a degraded ladder reports as intact (silent collapse)',
    find: `         when count(*) filter (where not r.selectable) > 0 then 'degraded'`,
    repl: `         when false then 'degraded'`,
    expect: 'an expired rung degrades the ladder rather than vanishing' },

  { suite: 'ladder.test.mjs',
    name: 'viewers can read the concession record',
    find: `grant select on cw.concession to cw_auditor;`,
    repl: `grant select on cw.concession to cw_auditor, cw_viewer;`,
    expect: 'a viewer cannot read concessions at all' },

  { suite: 'ladder.test.mjs',
    name: 'requesters see every buyer’s concessions',
    find: `create policy read_scoped on cw.concession for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and cw.owns_agreement(concession.agreement_id)));`,
    repl: `create policy read_scoped on cw.concession for select using (true);`,
    expect: 'a requester sees only their own deals' },

  // ── Promotion under real permissions (WP-06, findings D1 + D6) ──
  //
  // This is finding D1 restored exactly: with no permissive UPDATE policy, the
  // closing UPDATE affects zero rows for a real cw_legal_admin, raises nothing,
  // and the function still returns a clause reference. Only a test that runs as
  // the real role can see it — as the owner this mutation is invisible.
  { suite: 'ladder.test.mjs',
    name: 'promotion silently records nothing (finding D1 regression)',
    find: `create policy promote_update on cw.concession for update
  using      (cw.app_role() = 'legal_admin')
  with check (cw.app_role() = 'legal_admin');`,
    repl: 'select 1;',
    expect: 'the promotion is actually recorded on the concession' },

  { suite: 'ladder.test.mjs',
    name: 'the promotion column can be cleared, making room for a second promotion',
    find: `create policy promote_once on cw.concession as restrictive for update
  using      (promoted_to_clause is null)
  with check (promoted_to_clause is not null);`,
    repl: 'select 1;',
    expect: 'a legal_admin cannot touch promoted_to_clause outside a promotion' },

  // The warning from the work package, made concrete: this mutation neuters the
  // TRIGGER, not the grant. Removing the grant instead would be caught by the
  // "permission denied" test and the trigger would go unproven — the denial
  // arrives first and masks it. The test this names runs as the OWNER, whom no
  // grant stops, and asserts the trigger's own words.
  { suite: 'ladder.test.mjs',
    name: 'the concession immutability trigger is neutered (finding D6)',
    find: `    raise exception
      'a recorded concession cannot be rewritten; only promotion may change it '
      '(concession %)', old.concession_id using errcode = 'restrict_violation';`,
    repl: '    null;',
    expect: 'a recorded concession cannot be rewritten' },

  // PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so this
  // mutation does not add a grant — it removes the revoke that takes the
  // default away. The EXECUTE grant, not the role check inside the function, is
  // what actually keeps other roles out.
  { suite: 'ladder.test.mjs',
    name: 'the promotion function is left executable by everyone',
    find: `revoke all on function cw.promote_concession(bigint, text, text, text, text, date)
  from public;`,
    repl: 'select 1;',
    expect: 'a legal reviewer cannot even call the promotion function' },

  // WP-16 moved the two INSERTs this used to point at into
  // cw.mint_clause_version(), which destroyed the original `find` string
  // ("  values (p_new_clause_id, c.category_key, sev)"). Repaired here rather
  // than deferred: an unfound `find` exits the harness non-zero. The mutation
  // now lands on the call site, which is where the severity is decided, and it
  // proves exactly the same guarantee.
  { suite: 'ladder.test.mjs',
    name: 'promoted clauses are all minted as Standard',
    find: `    p_severity     => sev,`,
    repl: `    p_severity     => 'Standard',`,
    expect: 'a High concession mints a High clause, not a Standard one' },

  { suite: 'ladder.test.mjs',
    name: 'a concession can be deleted',
    find: `create trigger concession_no_delete
  before delete on cw.concession
  for each row execute function cw.concession_no_delete();`,
    repl: 'select 1;',
    expect: 'a concession cannot be deleted' },

  // ── The floor made absolute (WP-07, finding D5) ──
  { suite: 'ladder.test.mjs',
    name: 'the floor lookup ignores severity (finding D5 regression)',
    find: '    and l.severity = sev\n',
    repl: '    and true\n',
    expect: 'a legitimate Standard concession at its own floor is accepted' },

  { suite: 'ladder.test.mjs',
    name: 'a missing floor is read as no floor (the no-ladder path fails open)',
    find: '  if new.conceded_rung is not null and floor_rung is null then',
    repl: '  if false then',
    expect: 'a concession with no ladder is refused with a clear error' },

  { suite: 'ladder.test.mjs',
    name: 'the wording on a published rung can be swapped',
    find: `  if new.clause_id is distinct from old.clause_id
     or new.version is distinct from old.version
     or new.rung is distinct from old.rung then`,
    repl: '  if false then',
    expect: 'the wording on a published rung cannot be swapped' },

  // ── The agreement status machine (WP-08, finding D7) ──
  { suite: 'executed.test.mjs',
    name: 'signing a contract never moves its status (finding D7 regression)',
    find: `  update cw.agreement set status = 'executed'
  where agreement_id = new.agreement_id and status = 'negotiating';`,
    repl: '  perform 1;',
    expect: 'executing an agreement moves it out of negotiating' },

  { suite: 'executed.test.mjs',
    name: 'any status transition is permitted',
    find: `  if not (
       (old.status = 'negotiating' and new.status in ('executed','terminated'))
    or (old.status = 'executed'    and new.status = 'terminated')
  ) then`,
    repl: '  if false then',
    expect: 'an executed agreement cannot slide back to negotiating' },

  { suite: 'executed.test.mjs',
    name: 'a deal changing state leaves no record',
    find: `    perform cw.audit('agreement_status_changed', new.agreement_id,
      jsonb_build_object('from', old.status, 'to', new.status));`,
    repl: '    perform 1;',
    expect: 'the status transition is audited' },

  // ── Executed agreements: a signed contract is frozen ──
  { suite: 'executed.test.mjs',
    name: 'signed documents can be edited after execution',
    // Anchored on the foreach line, because 0006 has TWO identical blocks of
    // these format() calls — one for the agreement and its documents, one for
    // the certificate and signatories. String.replace rewrites the first only,
    // so without the anchor this check silently depended on which block came
    // first in the file. Preflight refuses the ambiguity now.
    find: `  foreach t in array array['executed_agreement','executed_document'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);`,
    repl: `  foreach t in array array['executed_agreement','executed_document'] loop
    perform 1;`,
    expect: 'the signed document cannot be edited — not by anyone' },

  { suite: 'executed.test.mjs',
    // Repointed: the delete guard used to be `do instead nothing`, which was
    // removed under settled decision S0-3 because a silent no-op hides
    // application bugs. It is now a trigger that raises, so the old `find`
    // string no longer exists anywhere.
    name: 'signed documents can be deleted',
    // Same anchoring, same reason. The frozen trigger is kept in the
    // replacement so this check breaks deletion ONLY — a mutation that removed
    // both would be caught by whichever test ran first, not by the named one.
    find: `  foreach t in array array['executed_agreement','executed_document'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);
    execute format('create trigger %I_no_delete before delete on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);`,
    repl: `  foreach t in array array['executed_agreement','executed_document'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);
    perform 1;`,
    expect: 'a signed document cannot be deleted' },

  { suite: 'executed.test.mjs',
    name: 'an amendment need not say what it amends',
    find: `  constraint amendment_names_its_target check (
    kind <> 'amendment' or supersedes_seq is not null)`,
    repl: `  constraint amendment_names_its_target check (true)`,
    expect: 'an amendment must name what it amends' },

  // ════════════════════════════════════════════════════════════════════════
  // The Review queue (WP-16a/b/c) · the gate itself
  // ════════════════════════════════════════════════════════════════════════
  // The plan gave WP-16 no mutations at all, which Gate 3 flagged: a gate whose
  // guards have never been seen to fail is a gate nobody has tested. Each entry
  // below restores exactly one of the four refutations, plus the dropped fifth.

  // REFUTATION 1 — INSERT was ungoverned. With this trigger gone a requester
  // can create a row that is already `rejected`, with an empty note and a
  // hand-written decider; the transition trigger never fires and the whole
  // state machine is walked past on day one.
  { suite: 'review-queue.test.mjs',
    name: 'a ticket can be born already decided (the ungoverned INSERT)',
    find: `create trigger review_ticket_opens_pending
  before insert on cw.review_ticket
  for each row execute function cw.review_ticket_opens_pending();`,
    repl: 'select 1;',
    expect: 'a requester cannot open a ticket that is already rejected' },

  // REFUTATION 2 — the note CHECK caught null but never ''. Restored exactly:
  // `is not null` is satisfied by the empty string, which is precisely what a
  // form posts when the reviewer types nothing.
  { suite: 'review-queue.test.mjs',
    name: 'the mandatory rejection note is satisfied by an empty string',
    find: `  constraint rejection_needs_note check (
    state <> 'rejected' or coalesce(btrim(decision_note), '') <> ''),`,
    repl: `  constraint rejection_needs_note check (
    state <> 'rejected' or decision_note is not null),`,
    expect: 'a rejection with an empty note is refused' },

  // REFUTATION 3 — the flag pinned to false. ADR-0010 names the unedited-
  // approval rate as the binding control; this is what it looks like when the
  // control reports a perfect score whatever reviewers actually do.
  { suite: 'review-queue.test.mjs',
    name: 'edited_before_approval is pinned to false (the control reports perfection)',
    find: `    new.edited_before_approval := (new.approved_text is distinct from new.proposed_text);`,
    repl: `    new.edited_before_approval := false;`,
    expect: `a reviewer's edit is recorded as an edit` },

  // The other half of refutation 3: the flag becomes self-reported rather than
  // derived, so a caller can simply declare a clean score.
  // 0029 replaced the deciding function wholesale (the figure joined the flag),
  // so this row keys on 0029's block — the definition that is LIVE after all
  // migrations run, per the rule at the top of this list. NC-25's implementer
  // found the old find string silently unguarded; repointed 2026-07-27.
  { suite: 'review-queue.test.mjs',
    name: 'the caller may supply their own edited_before_approval',
    find: `  if new.state = 'verified' then
    new.edited_before_approval := (new.approved_text is distinct from new.proposed_text);
    sim := cw.text_overlap(new.proposed_text, new.approved_text);
    -- Held below identity when the texts differ: see the note at the top.
    if new.edited_before_approval and sim >= 1 then sim := 0.9999; end if;
    new.edit_similarity := sim;
  else
    new.edited_before_approval := null;
    new.edit_similarity := null;
  end if;`,
    repl: `  if new.state <> 'verified' then
    new.edited_before_approval := null;
    new.edit_similarity := null;
  end if;`,
    expect: 'a caller cannot self-report a clean score' },

  // REFUTATION 4 (raised in red team, dropped in integration, reinstated by
  // Gate 3 remediation §8) — edit the BASELINE instead of the approval and the
  // control silently reports perfection from the other end.
  { suite: 'review-queue.test.mjs',
    name: 'the draft behind a ticket can still be rewritten',
    find: `  if exists (select 1 from cw.review_ticket t where t.draft_id = old.draft_id) then`,
    repl: `  if false then`,
    expect: 'the baseline cannot be edited instead of the approval' },

  // The third way to move the baseline: rewrite the ticket's own copy while the
  // decision is still pending.
  { suite: 'review-queue.test.mjs',
    name: 'the text under review can be swapped before the decision',
    find: `     or new.proposed_text is distinct from old.proposed_text\n`,
    repl: `     or false\n`,
    expect: 'the ticket text cannot be moved under a pending decision' },

  // REFUTATION 5 (settled decision S0-3) — `do instead nothing` is the pattern
  // finding D9 condemns. This removes the raising trigger; a delete then does
  // nothing at all, and an application bug becomes indistinguishable from
  // success.
  { suite: 'review-queue.test.mjs',
    name: 'deleting a ticket is silently ignored instead of refused',
    find: `create trigger review_ticket_no_delete
  before delete on cw.review_ticket
  for each row execute function cw.review_no_delete();`,
    repl: 'select 1;',
    expect: 'a review ticket cannot be deleted' },

  // The D1 lesson at the new gate. With no permissive UPDATE policy the
  // decision affects zero rows, raises nothing, and the function reports
  // success — the exact shape that let promotion silently record nothing for a
  // real cw_legal_admin. Only a test running as the real role can see it.
  { suite: 'review-queue.test.mjs',
    name: 'deciding a ticket silently records nothing (finding D1, at the new gate)',
    find: `create policy decide_ticket on cw.review_ticket for update
  using      (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));`,
    repl: 'select 1;',
    expect: 'a rejection with a real note is recorded, as the real role' },

  // The fence that makes the reviewer's narrow INSERT privilege safe: without
  // it a cw_legal_reviewer can name any ticket, in any state, and mint.
  { suite: 'review-queue.test.mjs',
    name: 'a clause version may name a ticket nobody verified',
    find: `  if t.state <> 'verified' then`,
    repl: `  if false then`,
    expect: 'a clause version cannot name a ticket that was never verified' },

  { suite: 'review-queue.test.mjs',
    name: 'the reviewer mint policy stops requiring a ticket at all',
    find: `create policy reviewer_mints on cw.clause_version for insert
  with check (cw.app_role() = 'legal_reviewer' and source_ticket_id is not null);`,
    repl: `create policy reviewer_mints on cw.clause_version for insert
  with check (cw.app_role() = 'legal_reviewer');`,
    expect: 'a reviewer cannot mint a clause version out of thin air' },

  // ════════════════════════════════════════════════════════════════════════
  // Clause origin (WP-17)
  // ════════════════════════════════════════════════════════════════════════
  { suite: 'review-queue.test.mjs',
    name: 'clause origin can be rewritten after approval',
    find: `     or new.origin is distinct from old.origin\n`,
    repl: `     or false\n`,
    expect: 'origin cannot be rewritten after approval' },

  { suite: 'review-queue.test.mjs',
    name: 'supplier paper is selectable for our own drafts',
    find: `   and v.origin <> 'external'\n`,
    repl: `   and true\n`,
    expect: 'external wording is never selectable' },

  // Origin is DERIVED for a draft-backed ticket, not accepted from the caller.
  // Otherwise "how much of our library began as an AI draft?" can be reduced by
  // passing a different parameter.
  { suite: 'review-queue.test.mjs',
    name: 'a draft-backed ticket may declare itself lawyer-composed',
    find: `  eff_origin := case when t.draft_id is not null then 'ai_drafted'
                     else coalesce(p_origin, 'legal_authored') end;`,
    repl: `  eff_origin := coalesce(p_origin, 'legal_authored');`,
    expect: `a reviewer's edit is recorded as an edit` },

  // ════════════════════════════════════════════════════════════════════════
  // Required approvers (WP-18a) · a machine proposes, only people settle
  // ════════════════════════════════════════════════════════════════════════
  // The original WP-18 carried no mutations at all, which Gate 3 §6 flagged.
  // Each entry below restores exactly one way the approval gate could be
  // decorative rather than real, and every named test runs the settlement AS
  // THE REAL ROLE.

  // The gate itself. With this gone, a concession comes into force with nobody
  // having approved it — which is precisely the "machine settles" behaviour
  // CLA §3 and §7 forbid.
  { suite: 'governance.test.mjs',
    name: 'a concession settles with approvals still outstanding',
    find: '  if missing is not null then',
    repl: '  if false then',
    expect: 'settling is refused while anybody is still missing' },

  // The CONFIGURABLE half. Requester and attorney are named in the owner
  // decision; the Required Approvers are per-contract configuration, and this
  // is what it looks like when the configuration is read but ignored.
  { suite: 'governance.test.mjs',
    name: 'configured Required Approvers are not counted',
    find: `    select 'required', r.approver
      from c join cw.required_approver r using (agreement_id))`,
    repl: `    select 'required', r.approver
      from c join cw.required_approver r using (agreement_id) where false)`,
    expect: 'adding a Required Approver changes the outcome' },

  // Fail-closed on an unconfigured deal. Without it a deal with no assigned
  // attorney needs one fewer approval than the rule says — silently, and
  // exactly on the deals nobody has looked at yet.
  { suite: 'governance.test.mjs',
    name: 'a deal with no assigned attorney simply needs one fewer approval',
    find: `  if not exists (select 1 from cw.agreement_attorney t
                 where t.agreement_id = c.agreement_id) then`,
    repl: '  if false then',
    expect: 'a deal with no assigned attorney cannot settle anything' },

  // Approvals that do not have to name the configured person. The count still
  // comes out right, which is what makes this the dangerous version.
  { suite: 'governance.test.mjs',
    name: 'an approval may name anyone at all',
    find: `    if new.approver is distinct from expected then
      raise exception
        'the assigned attorney on % is %, not %', c.agreement_id, expected, new.approver
        using errcode = 'check_violation';
    end if;`,
    repl: '    null;',
    expect: 'an approval must name the person the record names' },

  // ════════════════════════════════════════════════════════════════════════
  // Legal hold (WP-18b)
  // ════════════════════════════════════════════════════════════════════════
  { suite: 'governance.test.mjs',
    name: 'the retention path does not check for a legal hold',
    // ANCHORED ON THE ACT IT NAMES. `if cw.agreement_under_hold(...)` alone was
    // unique until 0023 added the same guard to redaction and to purging, at
    // which point it matched three blocks in two files and would have mutated
    // whichever came first. The preflight refused the run rather than let it
    // watch the wrong one. The word "destruction" is what makes this the
    // retention path's guard and not one of the other two.
    find: `  if cw.agreement_under_hold(p_agreement_id) then
    select string_agg(h.matter_ref, ', ' order by h.matter_ref) into matters
    from cw.legal_hold h
    where h.agreement_id = p_agreement_id and h.released_on is null;
    raise exception
      '% is under legal hold (%); destruction is suspended until every hold is '`,
    repl: `  if false then
    select string_agg(h.matter_ref, ', ' order by h.matter_ref) into matters
    from cw.legal_hold h
    where h.agreement_id = p_agreement_id and h.released_on is null;
    raise exception
      '% is under legal hold (%); destruction is suspended until every hold is '`,
    expect: 'a record under legal hold cannot be destroyed by the retention path' },

  // Releasing is the consequential act — it is what lets destruction resume —
  // so it is the one that must leave a record.
  { suite: 'governance.test.mjs',
    name: 'releasing a hold leaves no record',
    find: '  elsif new.released_on is distinct from old.released_on then',
    repl: '  elsif false then',
    expect: 'releasing a hold is an audited act' },

  // ════════════════════════════════════════════════════════════════════════
  // Signature evidence (WP-18c)
  // ════════════════════════════════════════════════════════════════════════
  // Back to a reference instead of the bytes. The counterpart bytes prove WHAT
  // was signed; only the certificate proves WHO signed it, and a pointer at
  // someone else's server does not survive them purging the account.
  { suite: 'executed.test.mjs',
    name: 'the completion certificate is a reference again, not bytes',
    find: '  certificate  bytea not null check (octet_length(certificate) > 0),',
    repl: '  certificate  text,',
    expect: 'the completion certificate is stored as bytes, not as a reference' },

  { suite: 'executed.test.mjs',
    name: 'signatory records are not frozen with the rest of the contract',
    find: `  foreach t in array array['signature_certificate','executed_signatory'] loop`,
    repl: `  foreach t in array array['signature_certificate'] loop`,
    expect: 'who signed cannot be rewritten after execution' },

  // ════════════════════════════════════════════════════════════════════════
  // Masters and statements of work (WP-18d)
  // ════════════════════════════════════════════════════════════════════════
  { suite: 'executed.test.mjs',
    name: 'a statement of work may hang off anything',
    find: `  if parent_kind <> 'master' then`,
    repl: '  if false then',
    expect: 'a statement of work cannot hang off another statement of work' },

  // ════════════════════════════════════════════════════════════════════════
  // U2 as settled: a SOW may depart from its master, but only with approval
  // ════════════════════════════════════════════════════════════════════════
  // The owner settled U2 on 2026-07-26. The risk is no longer "the loose side
  // ships by accident" — it is that the approval turns out to be decorative.
  // These two mutations attack that from both ends.

  // The gate stops asking anything at all.
  { suite: 'executed.test.mjs',
    name: 'the U2 gate opens for everyone — a SOW may contradict its master freely',
    find: `  mode := cw.setting('sow_may_contradict_master');
  if mode = 'true' then return new; end if;`,
    repl: '  mode := \'true\'; return new;',
    expect: 'an unauthorised departure from the master is still refused' },

  // A merely PROPOSED override authorises the departure — the same "a proposal
  // is not an approval" fault the concession path was built to prevent, arriving
  // from the statement-of-work side.
  { suite: 'executed.test.mjs',
    name: 'a proposed departure is treated as an authorised one',
    find: `            select 1 from cw.sow_override_in_force o`,
    repl: `            select 1 from cw.sow_override o`,
    expect: 'a proposed departure nobody has approved authorises nothing' },

  // The approval set is not actually checked before authorising.
  { suite: 'executed.test.mjs',
    name: 'a departure can be authorised with approvals still missing',
    find: `  if missing is not null then
    raise exception
      'statement of work % cannot depart from its master on % yet: still waiting '`,
    repl: `  if false then
    raise exception
      'statement of work % cannot depart from its master on % yet: still waiting '`,
    expect: 'a departure cannot be authorised with an approval missing' },

  // ════════════════════════════════════════════════════════════════════════
  // The negotiation record (WP-19)
  // ════════════════════════════════════════════════════════════════════════
  { suite: 'negotiation.test.mjs',
    name: 'a recorded round can be edited afterwards',
    find: `create trigger negotiation_round_no_edit
  before update or delete on cw.negotiation_round
  for each row execute function cw.negotiation_append_only();`,
    repl: 'select 1;',
    expect: 'a round cannot be updated once recorded' },

  { suite: 'negotiation.test.mjs',
    name: 'rounds may arrive with gaps in the sequence',
    find: `create trigger negotiation_round_in_sequence
  before insert on cw.negotiation_round
  for each row execute function cw.round_is_next();`,
    repl: 'select 1;',
    expect: 'rounds arrive in order or not at all' },

  // U1 is an owner decision and both paths must be REACHABLE. This collapses
  // the two into one, which is the failure the work package named explicitly:
  // building one path and stubbing the other.
  //
  // REPOINTED 2026-07-27 by NC-03. 0031 replaces cw.open_renewal wholesale to
  // add the ownership check, and quotes the prior body in its reverting footer
  // as this repository's migrations do. The footer is comment text, but its
  // lines carry the old body verbatim behind a `--   ` prefix, so the bare
  // pattern matched twice inside 0031 and preflight refused the whole run.
  // The leading newline is what distinguishes the two: the live branch begins a
  // line, the quoted copy sits behind the comment prefix. It still matches BOTH
  // live definitions — 0011's and 0031's — which is required, since 0031 runs
  // last and an unmutated copy there would undo the mutation (trap 5.4a).
  { suite: 'negotiation.test.mjs',
    name: 'the executed-agreement baseline is not actually built',
    find: `\n  if chosen = 'executed_agreement' then`,
    repl: '\n  if false then',
    expect: 'by default a renewal opens from the executed agreement’s positions' },

  // ════════════════════════════════════════════════════════════════════════
  // The engine pin (WP-32)
  // ════════════════════════════════════════════════════════════════════════
  { suite: 'run-store.test.mjs',
    // Repointed: the column gained a CHECK under WP-23's run-store constraint
    // work, so the bare `not null,` it used to key on no longer appears.
    name: 'a run need not say which engine produced its hash',
    find: `  engine_version text not null check (btrim(engine_version) <> ''),`,
    repl: `  engine_version text,`,
    expect: 'a run cannot omit which engine produced it' },

  // ════════════════════════════════════════════════════════════════════════
  // The Administrator (WP-U01, migration 0013 part 1)
  // ════════════════════════════════════════════════════════════════════════
  //
  // Owner decision U5 gave this role content READ and no content write. The
  // read half and the write half therefore need separate mutations: reverting
  // either one is a real fault, and they are caught by different tests.

  // The write half. Note what makes this one interesting: a table GRANT alone
  // is not enough to actually write a clause version, because the update policy
  // still names legal_admin — so none of the "administrator cannot edit clause
  // text" write-path tests would notice. Only the privilege sweep does, which is
  // the entire reason the sweep exists alongside the write attempts. Two layers
  // means two mutations, or one of the layers is unproven.
  { suite: 'administrator.test.mjs',
    name: 'the administrator is granted a content write "just for the dashboard"',
    find: 'grant insert, update on cw.account to cw_administrator;',
    repl: `grant insert, update on cw.account to cw_administrator;
grant insert, update on cw.clause_version to cw_administrator;`,
    expect: 'no table in schema cw grants the administrator insert, update or delete except the two it is supposed to' },

  // The read half, reverted to the original content-blind design. This must fail
  // loudly rather than quietly: U5 is a decision the owner made, and a silent
  // reversion would leave the console blind with no test objecting.
  { suite: 'administrator.test.mjs',
    name: 'decision U5 reverted — the administrator loses sight of the deals',
    find: `create policy administrator_reads on cw.agreement for select
  using (cw.app_role() = 'administrator');`,
    repl: 'select 1;',
    expect: 'administrator can read the deals themselves' },

  // Without this the administrator holds INSERT on the audit log and is still
  // refused by row-level security, so every audited administrative act fails
  // and the whole console is dead on arrival.
  { suite: 'administrator.test.mjs',
    name: 'the administrator is left out of the audit append policy',
    find: `create policy audit_append_administrator on cw.audit_event for insert
  with check (cw.app_role() = 'administrator');`,
    repl: 'select 1;',
    expect: 'an administrator creates an account, and it lands on the chain' },

  // The bootstrap backdoor, in both of its shapes.
  { suite: 'administrator.test.mjs',
    name: 'the bootstrap ceremony stays callable after first run',
    find: '  if existing > 0 then',
    repl: '  if false then',
    expect: 'it refuses to run a second time — the accounts table is the precondition' },

  { suite: 'administrator.test.mjs',
    name: 'the bootstrap ceremony stops checking who is calling it',
    // Anchored on the raise that follows it: `if cw.app_role() is not null then`
    // appears twice in 0013 — here, and in the governance-setting trigger — so
    // on its own this check depended on which came first in the file.
    find: `  if cw.app_role() is not null then
    raise exception 'the bootstrap ceremony is the owner''s one act; a connection '`,
    repl: `  if false then
    raise exception 'the bootstrap ceremony is the owner''s one act; a connection '`,
    expect: 'the in-function role guard refuses an administrator, if ever reached' },

  { suite: 'administrator.test.mjs',
    name: 'accounts become deletable, taking the access history with them',
    find: `create trigger account_no_delete
  before delete on cw.account
  for each row execute function cw.account_no_delete();`,
    repl: 'select 1;',
    expect: 'an account is not deleted, by anyone, ever' },

  { suite: 'administrator.test.mjs',
    name: 'a revocation can be erased by un-revoking the account',
    find: "  if old.state = 'revoked' and new.state <> 'revoked' then",
    repl: '  if false then',
    expect: 'revoking an account is recorded, and it cannot be un-revoked' },

  // ════════════════════════════════════════════════════════════════════════
  // Grants and the countersign rule (WP-U02, migration 0013 part 2)
  // ════════════════════════════════════════════════════════════════════════
  //
  // The countersign gate itself. This is the one that matters most: without the
  // clause, an uncountersigned grant of a Legal role becomes effective the
  // moment it is proposed, and the console would carry on showing the amber
  // pending badge for somebody who was already working.
  { suite: 'role-grant.test.mjs',
    name: 'the countersign gate opens on the proposal (decision U6 defeated)',
    find: `  and (l.role not in ('legal_reviewer','legal_admin')
       or l.countersigned_by is not null`,
    repl: `  and (true
       or l.countersigned_by is not null`,
    expect: 'a proposed legal reviewer confers NOTHING before countersign' },

  // The bootstrap exemption widened to everybody. A subtle and very plausible
  // regression: the flag exists for one row, and a change that let it apply
  // generally would look like tidying.
  { suite: 'role-grant.test.mjs',
    name: 'every Legal grant is treated as a bootstrap grant',
    find: '       or l.is_bootstrap)',
    repl: '       or true)',
    expect: 'a proposed legal reviewer confers NOTHING before countersign' },

  { suite: 'role-grant.test.mjs',
    name: 'an administrator can grant themselves any role',
    find: "    if new.acted_by = new.person and not new.is_bootstrap then",
    repl: '    if false then',
    expect: 'an administrator cannot grant themselves a role' },

  { suite: 'role-grant.test.mjs',
    name: 'the subject of a Legal grant can accept it themselves',
    find: '    if new.acted_by = g.person then',
    repl: '    if false then',
    expect: 'the subject of a grant cannot accept it, whatever connection they use' },

  { suite: 'role-grant.test.mjs',
    name: 'the proposer of a grant can also be its acceptor',
    find: '    if new.acted_by = g.acted_by then',
    repl: '    if false then',
    expect: 'the proposer cannot also be the acceptor, even holding both roles' },

  // The actor binding. Without it acted_by is whatever the caller typed, and
  // the access history — the one record that says who let whom in — names
  // whoever the writer preferred.
  // REPOINTED 2026-07-28: "Bind account lifecycle timestamps" (cb7a84a) added
  // an acted_at binding inside this exact block, which destroyed the old `find`.
  // The replacement now keeps the timestamp binding and severs the actor
  // binding ONLY — one guarantee at a time, and the timestamp work gets its own
  // guard if it ever needs one.
  { suite: 'role-grant.test.mjs',
    name: 'the actor on a grant is whatever the caller claims',
    find: `  if not new.is_bootstrap then
    new.acted_by := cw.app_actor();
    new.acted_at := now();
  end if;`,
    repl: `  if not new.is_bootstrap then
    new.acted_at := now();
  end if;`,
    expect: 'the actor on a grant is the connection\'s person, not a claim' },

  { suite: 'role-grant.test.mjs',
    name: 'the administrator can countersign as well as propose',
    find: `create policy administrator_grants on cw.role_grant for insert
  with check (cw.app_role() = 'administrator'
              and action in ('granted','revoked'));`,
    repl: `create policy administrator_grants on cw.role_grant for insert
  with check (cw.app_role() = 'administrator');`,
    expect: 'an administrator cannot countersign — not even somebody else\'s grant' },

  { suite: 'role-grant.test.mjs',
    name: 'the access history becomes editable',
    find: `create trigger role_grant_no_update
  before update on cw.role_grant
  for each row execute function cw.role_grant_append_only();`,
    repl: 'select 1;',
    expect: 'and the owner cannot edit it either — the trigger is the second layer' },

  { suite: 'role-grant.test.mjs',
    name: 'a revoked grant still confers its role',
    find: `    and not exists (select 1 from cw.role_grant r
                    where r.action = 'revoked' and r.grant_ref = g.grant_id)`,
    repl: '    and true',
    expect: 'revoking a grant takes the role away' },

  { suite: 'role-grant.test.mjs',
    name: 'a revoked account still confers its role',
    find: "where a.state = 'active'",
    repl: 'where true',
    expect: 'a revoked ACCOUNT confers nothing, however live its grants' },

  // ════════════════════════════════════════════════════════════════════════
  // The settings split and watcher lists (WP-U03, migration 0013 part 3)
  // ════════════════════════════════════════════════════════════════════════
  //
  // The split, one direction at a time. Two mutations rather than one, because
  // "legal_admin may write everything and the administrator may also write the
  // operational rows" is a plausible half-implementation that passes any test
  // checking only the administrator's side.
  { suite: 'settings-split.test.mjs',
    name: 'the administrator can edit owner decisions after all',
    find: `    if old.kind = 'owner_decision' and cw.app_role() <> 'legal_admin' then`,
    repl: '    if false then',
    expect: 'an administrator cannot change an owner decision, and is TOLD why' },

  { suite: 'settings-split.test.mjs',
    name: 'the split cuts one way only — Legal keeps the operational rows',
    find: `    if old.kind = 'operational' and cw.app_role() <> 'administrator' then`,
    repl: '    if false then',
    expect: 'a legal admin cannot change an operational setting — the other direction' },

  // The refusal going quiet. This is the D1 shape restored deliberately: the
  // narrow USING clause enforces the rule correctly AND makes the refusal a
  // zero-row no-op that raises nothing, which a console renders as a save.
  { suite: 'settings-split.test.mjs',
    name: 'the settings refusal goes silent (finding D1 shape restored)',
    find: `  using       (cw.app_role() in ('legal_admin','administrator'))`,
    repl: `  using       ((cw.app_role() = 'legal_admin'   and kind = 'owner_decision')
            or (cw.app_role() = 'administrator' and kind = 'operational'))`,
    expect: 'an administrator cannot change an owner decision, and is TOLD why' },

  { suite: 'settings-split.test.mjs',
    name: 'a setting can be moved to the other side of the split',
    find: '  if new.kind is distinct from old.kind then',
    repl: '  if false then',
    expect: 'a row cannot change sides to make itself writable' },

  { suite: 'settings-split.test.mjs',
    name: 'an operational row may also be an owner decision',
    find: `  add constraint operational_is_never_an_owner_decision check (
    not (kind = 'operational' and is_owner_decision));`,
    repl: '  add column unused_marker boolean;',
    expect: 'a row cannot be both operational and an owner decision' },

  { suite: 'settings-split.test.mjs',
    name: 'changing a setting leaves no record',
    find: `    perform cw.audit('setting_changed', new.key,`,
    repl: `    perform 1; perform cw.audit('setting_not_recorded', new.key,`,
    expect: 'an administrator changes an operational setting, and it is audited' },

  { suite: 'settings-split.test.mjs',
    name: 'taking somebody off a watcher list leaves no record',
    find: `    perform cw.audit('watcher_removed', coalesce(new.category_key, '*'),`,
    repl: `    perform 1; perform cw.audit('watcher_quietly_removed', coalesce(new.category_key, '*'),`,
    expect: 'removing a watcher lands on the chain — who was silenced, and by whom' },

  { suite: 'settings-split.test.mjs',
    name: 'an uncovered category is treated as nobody to tell',
    find: `           and (w.category_key = c.key or w.category_key is null))::int`,
    repl: `           and (w.category_key = c.key or w.category_key is null))::int + 1`,
    expect: 'a category with nobody watching it is a visible gap, not a silence' },

  { suite: 'settings-split.test.mjs',
    name: 'anybody can maintain the watcher lists',
    find: `create policy administrator_maintains on cw.override_watcher for insert
  with check (cw.app_role() = 'administrator');`,
    repl: `create policy administrator_maintains on cw.override_watcher for insert
  with check (cw.app_role() is not null);
grant insert on cw.override_watcher to cw_legal_reviewer;
grant usage, select on sequence cw.override_watcher_watcher_id_seq to cw_legal_reviewer;`,
    expect: 'nobody but the administrator maintains the list' },

  // ════════════════════════════════════════════════════════════════════════
  // Checkpoint duty and health evidence (WP-U04, migration 0013 part 4)
  // ════════════════════════════════════════════════════════════════════════
  //
  // The HALF OF THE MOVE THAT IS EASY TO FORGET. Decision U7 moves checkpoint
  // duty; a change that grants the administrator and leaves legal_admin holding
  // it looks complete and leaves two roles holding one duty, which is the state
  // where neither owns it and nobody can be held to account.
  { suite: 'health.test.mjs',
    name: 'checkpoint duty is shared rather than moved',
    find: 'revoke execute on function cw.audit_checkpoint_take() from cw_legal_admin;',
    repl: 'select 1;',
    expect: 'a legal admin can no longer take a checkpoint — where it used to work' },

  // Absence of evidence rendered as evidence, in each of the three places it
  // could be. These are the tiles that would reassure an operator into an
  // incident, so each gets its own mutation.
  { suite: 'health.test.mjs',
    name: 'a check that never ran renders as a pass',
    find: `  coalesce((select c.outcome from cw.integrity_check c
             where c.check_name = 'anchor' order by c.ran_at desc limit 1),
           'never_ran') as anchor_state,`,
    repl: `  coalesce((select c.outcome from cw.integrity_check c
             where c.check_name = 'anchor' order by c.ran_at desc limit 1),
           'pass') as anchor_state,`,
    expect: 'on a fresh system every check tile says never_ran, not pass' },

  { suite: 'health.test.mjs',
    name: 'stored documents are counted as verified documents',
    find: `            when (select documents_never_checked from cw.health_document) > 0 then 'never_ran'`,
    repl: `            when false then 'never_ran'`,
    expect: 'a stored document nobody has checked is NOT a verified document' },

  { suite: 'health.test.mjs',
    name: 'a document check counts rows that exist rather than checks that ran',
    find: `  ((select count(*) from cw.executed_document)
   - (select count(*) from latest))::int as documents_never_checked,`,
    repl: `  0 as documents_never_checked,`,
    expect: 'a stored document nobody has checked is NOT a verified document' },

  { suite: 'health.test.mjs',
    name: 'an unanchored log is reported as fine',
    find: `          case when r = 'ok' then 'pass' else 'fail' end,`,
    repl: `          case when r = 'ok' or r = 'no checkpoint' then 'pass' else 'fail' end,`,
    expect: '"no checkpoint" is recorded as a FAILURE of the anchor check' },

  // The hash comparison moved to the caller's word for it. A boolean supplied
  // by the thing being checked is not a check.
  { suite: 'health.test.mjs',
    name: 'a broken document hash is reported as matching',
    find: '  matched := (recorded = p_observed_sha256);',
    repl: '  matched := true;',
    expect: 'a broken stored hash makes the health model report the mismatch' },

  { suite: 'health.test.mjs',
    name: 'a rebuild that does not reproduce is reported as reproducing',
    find: '  matched := (recorded = p_observed_hash);',
    repl: '  matched := true;',
    expect: 'one that does not reproduce fails, and names the engine version' },

  { suite: 'health.test.mjs',
    name: 'the record of checks becomes editable',
    find: `create trigger integrity_check_no_update
  before update on cw.integrity_check
  for each row execute function cw.integrity_check_append_only();`,
    repl: 'select 1;',
    expect: 'a recorded check cannot be edited or removed, by anyone' },

  { suite: 'health.test.mjs',
    name: 'a failing check need not say what went wrong',
    find: `  constraint a_failure_says_what_went_wrong check (
    outcome <> 'fail' or (detail is not null and btrim(detail) <> '')),`,
    repl: '',
    expect: 'a failing check must say what went wrong' },

  // An unauthenticated view of which integrity checks are failing is a map for
  // somebody deciding when to tamper. Note this keys on the GRANT rather than
  // on the policy: the health tiles are VIEWS, and a view runs with its owner's
  // rights, so the policy on cw.integrity_check never sees the caller at all —
  // the grant is the only thing standing between a requester and the pane. An
  // earlier attempt at this entry mutated the policy instead and proved nothing.
  { suite: 'health.test.mjs',
    name: 'anybody can read which integrity checks are failing',
    find: `grant select on cw.health_chain, cw.health_checkpoint, cw.health_document,
                cw.health_rebuild, cw.health_summary
  to cw_administrator, cw_auditor;`,
    repl: `grant select on cw.health_chain, cw.health_checkpoint, cw.health_document,
                cw.health_rebuild, cw.health_summary
  to cw_administrator, cw_auditor, cw_requester, cw_viewer, cw_legal_reviewer;`,
    expect: 'a requester or viewer can reach none of them' },

  // ════════════════════════════════════════════════════════════════════════
  // The service layer (WP-U05/U06) — REMOVED WITH WP-P5, and where it went
  // ════════════════════════════════════════════════════════════════════════
  //
  // Fifteen mutations lived here, over `backend/service/*.mjs`. That directory
  // was deleted when the Python doorway replaced it (WP-P5, approved by the
  // owner 2026-07-27), so they are gone — but NOT quietly, and NOT because a
  // deletion made the bar green.
  //
  // The guarantees they held are the dangerous ones: identity bound per request
  // and surrendered at the end of it, no privileged connection at sign-in,
  // sessions that expire, refusals classified by SQLSTATE rather than by
  // message text, row scoping done by the database rather than by the API, a
  // write attributed to nobody but the signed-in person, and a refusal never
  // retried. Losing those silently is the worst outcome this file could produce.
  //
  // EVERY ONE IS RE-PROVED IN `backend/doorway/mutation_check.py`, checked name
  // by name before these were removed rather than taken on trust:
  //
  //   the actor is not bound at the start of a request          → same name
  //   the role is not bound at the start of a request           → same name
  //   requests are not serialised onto the connection           → 'a request is not one unit of work'
  //   the connection is never cleaned up after a request        → split in two: 'the role is not
  //                                                               surrendered when the request ends'
  //                                                               and 'the actor is not surrendered…'
  //   sign-in looks up identity on a privileged connection      → same name
  //   the effective role is resolved once and cached            → same name
  //   sessions never expire                                     → same name
  //   refusals are classified by reading the message…           → same name
  //   the deals endpoint scopes rows in the API…                → same name
  //   a deal can be opened in somebody else's name              → same name
  //   the reviewer verifying a ticket is taken from the request → same name
  //   verification becomes a raw update that mints nothing      → same name
  //   the approved wording defaults to whatever was proposed    → same name
  //   a blank rejection note is accepted                        → same name
  //   a refused write is retried "to make the demo work"        → same name
  //
  // The doorway's harness adds two this one never had, both found on its first
  // run: 'a read refusal is softened into an empty list' and 'the engine's
  // refusal is reworded on the way out'. So the surface is better watched after
  // the move than before it — which is the only honest reason to accept a
  // deletion here.
  //
  // `target: 'service'` is now used by no entry. The runner still understands
  // it and the existsSync guard stays, so nothing breaks if somebody restores
  // the directory to look at it.


  // ════════════════════════════════════════════════════════════════════════
  // The shell (WP-U07) — target: 'shell'
  // ════════════════════════════════════════════════════════════════════════
  //
  // THE TAB SET DRIFTING FROM THE ARCHITECTURE. Nobody notices this one: the
  // screen still works, it just quietly stops being what was agreed.
  { target: 'shell', suite: 'shell.test.mjs',
    // 2026-08-08. The named leak's guard, and its list of transports was three
    // names short of the promise its own header makes — every call goes through
    // API. EventSource and WebSocket are not hypothetical: this system has
    // digests and a waiting-on-you list, and making them push is the obvious
    // next feature. Nothing used them when the list was widened; the guard
    // simply would not have said so.
    name: 'a pane opens its own live connection',
    find: `function NoticesWaiting({ me }) {`,
    repl: `const liveNotices = new EventSource('/api/notices/stream');
function NoticesWaiting({ me }) {`,
    expect: "every call goes through the API module's fixed endpoint list" },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a role gains a tab the architecture never gave it',
    find: `      { key: 'my-record', label: 'my record' },`,
    repl: `      { key: 'my-record', label: 'my record' },
      { key: 'library',   label: 'the library' },`,
    expect: "requester's tabs match the architecture exactly" },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a role loses a tab the architecture gave it',
    find: `      { key: 'holds',        label: 'holds' },`,
    repl: ``,
    expect: "legal_reviewer's tabs match the architecture exactly" },

  // A TAB WITH NO PANE. A dead end somebody reaches by clicking.
  //
  // REPOINTED when WP-U14 built the auditor's panes: this keyed on the
  // `quality` route while it was still a NotBuiltYet stub, and that line no
  // longer exists. The preflight caught it the same run the panes landed —
  // which is the whole reason the preflight refuses to produce a count.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a tab leads nowhere',
    find: `  'quality':        () => <QualityPane />,`,
    repl: ``,
    expect: 'every tab in every workspace has a pane behind it' },

  // THE CRITICAL ANTI-PATTERN: the mockup's invented rows carried into the
  // product "so it demos well". The 2026-07-25 review was eighteen findings of
  // exactly this.
  // REPOINTED at WP-U12: the deals pane moved from workspaces.jsx to
  // requester.jsx and gained a name, so both of these stopped matching and
  // reported SKIP.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'canned example rows are carried into a pane',
    find: `  const deals = usePane(() => API.deals());`,
    repl: `  const deals = usePane(() => API.deals());
  const examples = [{ agreement_id: 'AG-001', counterparty: 'Northwind' },
                    { agreement_id: 'AG-002', counterparty: 'Contoso' }];`,
    expect: 'no pane holds an array of example rows' },

  // THE NAMED LEAK: a pane fetching for itself, which means it can ask for
  // anything and hide what it should not have had.
  // REPOINTED at WP-U09: this used to key on SystemHealth in workspaces.jsx,
  // which moved to console-rest.jsx when the real pane was built. The stale
  // entry reported SKIP — "pattern not found" — which is the harness catching
  // its own rot rather than quietly proving nothing.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a pane opens its own connection instead of using the endpoint list',
    find: `function MyDealsPane({ me }) {
  const deals = usePane(() => API.deals());`,
    repl: `function MyDealsPane({ me }) {
  const deals = usePane(() => fetch('/api/deals').then(r => r.json()));`,
    expect: "every call goes through the API module's fixed endpoint list" },

  // "NOT BUILT" COLLAPSING INTO "NOTHING HERE". Two different facts: one is
  // about the data, the other about the system. A pane showing the first when
  // the second is true is a surface claiming a capability.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the two kinds of empty become one',
    find: `function NotBuiltYet({ what, lands }) {`,
    repl: `function NotBuiltYetRenamed({ what, lands }) {`,
    expect: 'the empty states are honest about which kind of empty they are' },

  // A FAILED LOAD RENDERING AS AN EMPTY LIST — how somebody misses a queue.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a pane that cannot load renders as empty',
    find: `function LoadFailed({ reason }) {`,
    repl: `function LoadFailedRenamed({ reason }) {`,
    expect: 'a pane that cannot load says so instead of rendering as empty' },

  // THE RAIL GOING GLOBAL AGAIN. v3's shape: two deals at two stages share one
  // rail, so the screen can only be telling the truth about one of them. The
  // regression that matters is the rail no longer saying WHICH deal it is
  // drawing — at that point two rails are indistinguishable and nothing, test
  // or person, can tell whether the stage shown belongs to the deal on screen.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the rail no longer says which deal it is drawing',
    find: `data-deal={deal.agreement_id}`,
    repl: ``,
    expect: 'the rail takes its stage from the deal it is drawn for' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the rail takes its stage from somewhere other than its deal',
    find: `  const at = stageOf(deal);`,
    repl: `  const at = 3;`,
    expect: 'the rail takes its stage from the deal it is drawn for' },

  // THE STUB COMING BACK. The requester's screen said the forge was not built
  // for as long as it was true; now the contract, its decisions, its findings
  // and its gate are all real and rendered from the run's own record. A stub
  // put back over that would read as honesty — "we do not do this yet" — while
  // hiding a capability the system genuinely has.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the assembled contract is replaced by a stub again',
    find: `function RunResult({ run, decisions, findings, onError }) {`,
    repl: `function RunResult() {
  return <NotBuiltYet what="The contract is not built." lands="a later package" />;
}
function RunResultRetired({ run, decisions, findings, onError }) {`,
    expect: 'the run view renders what the endpoint returned and invents nothing' },

  // THE IRREVERSIBLE ACT LOSING ITS SECOND LOOK. Everything a filing writes is
  // frozen the moment it lands, so a one-click button is how a typo becomes a
  // permanent wrong fact about a signed contract. The confirmation is not
  // politeness; it is the only place the filer sees what they are about to
  // make permanent.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the filing happens on the first click, with nothing shown first',
    find: `                  if (!confirming) { setConfirming(true); return; }`,
    repl: ``,
    expect: 'nothing is filed without a confirmation showing what will be filed' },

  // THE VISUAL LANGUAGE DRIFTING. Decision U8 says reorganisation, not
  // restyling — a new colour here is out of scope by definition.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a new colour is introduced instead of composing the tokens',
    find: `.acting-role {`,
    repl: `.acting-role { color: #7dd3fc;`,
    expect: 'v4.css adds no new colour and no new typeface' },

  // A SCREEN READING A FIELD ITS ENDPOINT DOES NOT RETURN. WP-U11 found this
  // in the endpoint's own statement; it recurred one layer up, in the desk
  // that reads the rows. `undefined.trim()` in a component body blanks the
  // whole workspace, and the seeded system has no tickets to reveal it.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the review desk reads a ticket field again',
    find: `  const edited = approved.trim() !== ticket.proposed_text.trim();`,
    repl: `  const edited = approved.trim() !== (ticket.invented_column ?? '').trim();`,
    expect: 'every field the review desk reads is one the endpoint returns' },

  // A FAILED FINDINGS READ RENDERING AS "NO FINDINGS" — on the one screen
  // whose whole purpose is deciding each finding on its own.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the override surface swallows a failed findings read',
    find: `  if (findings.status === 'failed') return <LoadFailed reason={findings.reason} />;`,
    repl: ``,
    expect: 'the override surface says it could not ask, rather than showing nothing' },

  // A FAILED COVERAGE READ RENDERING AS FULL COVERAGE. The banner is driven
  // by a second endpoint, and an uncovered category is the hole that
  // socialises an override request to nobody.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a failed coverage read is swallowed into full coverage',
    find: `  if (coverage.status === 'failed') return <LoadFailed reason={coverage.reason} />;`,
    repl: ``,
    expect: 'a failed coverage read never renders as full coverage' },

  // REVOKING THE GRANT THAT CONFERS NOTHING. Two live grants is a normal
  // state, and effective_role confers the newest — so revoking the oldest
  // succeeds, closes the dialog, and leaves the person's access untouched.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'revoke targets the oldest live grant instead of the newest',
    find: `    return live.length ? live[0].grant_id : null;`,
    repl: `    return live.length ? live[live.length - 1].grant_id : null;`,
    expect: 'revoke targets the grant that actually confers access' },

  // ════════════════════════════════════════════════════════════════════════
  // The people console (WP-U08)
  // ════════════════════════════════════════════════════════════════════════
  //
  // PENDING-NESS INFERRED FROM THE ROLE AGAIN. This is the bug the package
  // actually shipped with for an hour, found by revoking a reviewer and looking
  // at the screen: a REVOKED person rendered as "awaiting countersign", which
  // reads as "almost there" when the truth is the opposite.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'pending-ness is inferred from the role instead of the queue',
    find: `  if (pendingPeople.has(p.person))`,
    repl: `  if (LEGAL_ROLES.has(p.declared_role))`,
    expect: 'pending is decided by the queue, never inferred from the role' },

  // A PENDING GRANT RENDERED GREEN — the countersign rule undone in pixels.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a pending grant is shown as effective',
    find: `    return <span className="chip chip-pending">awaiting countersign</span>;`,
    repl: `    return <span className="chip chip-ok">awaiting countersign</span>;`,
    expect: 'a pending grant is amber and never green' },

  // REMOVED 2026-07-27 — 'the revoke dialog promises an instant lockout'. The
  // mutation rewrote a sentence on the screen and the test caught the reworded
  // sentence. Both halves were about copy, which is placeholder content and not
  // ours to police (CLAUDE.md). When revocation actually bites is a property of
  // the SERVICE, and it is guarded where it lives — the doorway's own mutation
  // row caches the effective role and
  // test_server.py::test_revocation_bites_at_the_next_request objects.

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a revocation can be recorded with no reason',
    find: `          disabled={busy || !reason.trim()}`,
    repl: `          disabled={busy}`,
    expect: 'the revoke reason is required by the screen, not just by the database' },

  // DORMANCY MEASURED FROM SOMETHING ELSE. Re-anchored 2026-07-27: the
  // mutation used to rewrite the label to "never signed in, last seen never",
  // which the test caught by banning those words. It now changes the FIELD the
  // pane reads, which is the thing that would actually make the measure wrong.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'dormancy is measured from something other than recorded acts',
    find: `                  {p.acts_recorded === 0`,
    repl: `                  {p.last_sign_in === null`,
    expect: 'dormancy is measured from recorded acts, not from sign-ins' },

  // THE COUNTERSIGN QUEUE LEAVING LEGAL'S WORKSPACE — the wait the rule costs
  // stops being bounded by anybody looking.
  // REPOINTED at WP-U11: the review desk moved from workspaces.jsx to
  // reviewer.jsx, so this entry's old `find` stopped matching and reported SKIP
  // — the harness catching its own rot rather than quietly proving nothing.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the countersign queue is shown only in the admin console',
    // REPOINTED 2026-08-05: the reviewer's rendering gained a `routes` prop
    // when the raise control landed on the shared queue component (NT-3), so
    // the old four-line `find` stopped matching. Anchored on the opening tag
    // and the two props that were always there — a shorter pattern rots less
    // often, and this row has now been repointed twice for the same reason.
    find: `          <CountersignQueue
            me={me} rows={queue.rows}`,
    repl: `          <ItsOwnLocalQueue
            me={me} rows={queue.rows}`,
    expect: 'the countersign queue is one component, used in both places' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'anybody looking at the queue is offered the countersign button',
    find: `              {me.role === 'legal_admin' && (`,
    repl: `              {true && (`,
    expect: 'only a Legal admin is offered the countersign button' },

  // ACCOUNT-CREATION AND GRANT BUNDLED, so one refusal reports one outcome for
  // two acts and the screen cannot say which happened.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a refused account creation does not stop the grant',
    find: `      if (!made.ok) { setBusy(false); onError(made.reason); return; }`,
    repl: `      if (!made.ok) { /* carry on regardless */ }`,
    expect: 'creating an account and granting a role stay two acts' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'nothing warns that a Legal grant confers nothing yet',
    find: `      {LEGAL_ROLES.has(role) && (`,
    repl: `      {false && (`,
    expect: 'a Legal grant warns before the button, not after the fact' },

  // ════════════════════════════════════════════════════════════════════════
  // Settings, health and watchers (WP-U09)
  // ════════════════════════════════════════════════════════════════════════
  //
  // THE EDIT AFFORDANCE ON AN OWNER DECISION — the critical anti-pattern for
  // this package, restored in its most plausible form: a disabled input, which
  // feels responsible and teaches exactly the wrong boundary.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an owner decision gets a disabled editor',
    find: `      <div className="flex items-center gap-2 shrink-0 self-start">
        {s.decided`,
    repl: `      <div className="flex items-center gap-2 shrink-0 self-start">
        <input disabled value={s.value} />
        {s.decided`,
    expect: 'an owner decision has NO edit affordance at all' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an owner decision is shown without its reasoning',
    find: `        <div className="caption mt-1" style={{ lineHeight: 1.6 }}>{s.rationale}</div>`,
    repl: `        <div className="caption mt-1" />`,
    expect: 'an owner decision shows its reasoning, not just its value' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an undecided owner decision looks settled',
    find: `          : <span className="chip chip-pending">undecided</span>}`,
    repl: `          : null}`,
    expect: 'undecided owner decisions are flagged, not hidden' },

  // NEVER-RAN FALLING THROUGH TO GREEN — absence of evidence as evidence, in
  // the one place an operator looks to decide whether to worry.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a check that never ran renders as verified',
    find: `    return <span className="chip chip-unknown">never run</span>;`,
    repl: `    return <span className="chip chip-ok">verified</span>;`,
    expect: 'never-ran renders as its own thing, not as pass or fail' },

  // THE NUDGE BECOMING A DESTROY, which is the pressure this action exists to
  // relieve and therefore the thing most likely to happen to it.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the health pane reaches for a destroy',
    find: `                      const n = await API.nudgeRetention({`,
    repl: `                      const n = await API.retentionDestroy({`,
    expect: 'the nudge notifies and cannot destroy' },

  // REWRITTEN 2026-07-27 for U13. This used to break the chip by REMOVING the
  // matter reference, certifying that the matter was shown. U13 says the
  // Administrator gets the flag and not the reason, so the guarantee inverted:
  // the mutation now puts the matter back, and the test must object to that.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the matter holding a record leaks onto the administrator\'s screen',
    find: `                    ? <span className="chip chip-err">held</span>`,
    repl: `                    ? <span className="chip chip-err" title={r.matters}>held</span>`,
    expect: 'a held record is distinguishable from a due one, and never names the matter' },

  // REPOINTED 2026-07-27: the `?? []` was removed from this line when the pane
  // began refusing a failed coverage read outright, which made the rows
  // guaranteed-loaded and the fallback redundant. Same guarantee, same test.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an uncovered category is treated as nobody to tell',
    find: `  const gaps = coverage.rows.filter((c) => c.watcher_count === 0);`,
    repl: `  const gaps = [];`,
    expect: 'an uncovered category is surfaced as a gap' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the export does not escape quotes in a reason',
    find: `      return /[",\\n]/.test(s) ? \`"\${s.replace(/"/g, '""')}"\` : s;`,
    repl: `      return s;`,
    expect: 'the auditor can export, and the export is of what is on screen' },

  // ════════════════════════════════════════════════════════════════════════
  // The override request workflow (WP-U10, migration 0015)
  // ════════════════════════════════════════════════════════════════════════
  //
  // THE GATE OPENING ON REQUEST RATHER THAN APPROVAL. The difference between
  // asking and being allowed is the entire product, and this is the v3 button
  // returning in one line.
  // Written to drop BOTH conditions, and that took a second attempt. Relaxing
  // only the decision filter left the socialisation join in place, so a merely
  // requested override still passed nothing and a different test caught it —
  // reported IMPRECISE, which is the harness refusing to credit the wrong test.
  // REPOINTED AT 0019, and the reason is trap 5.4 in its subtlest form.
  //
  // Both of these keyed on 0015's copy of cw.override_passes, ending in the
  // semicolon that 0015's definition has. 0019 REDEFINES that view, so the
  // mutation went on landing in 0015 and was then overwritten wholesale by the
  // later migration — applied, cancelled, and reported MISSED. Not SKIP: the
  // pattern was still found, so the harness could not tell it had gone stale,
  // and these two read as "nothing guards this" for the two guarantees this
  // whole workflow exists to hold.
  //
  // The fix is to key on text that survives EVERY migration. Dropping the
  // trailing semicolon matches both copies, so both are mutated and the last
  // definition to run is the mutated one.
  { suite: 'override.test.mjs',
    name: 'the gate opens on the request rather than the approval',
    // The socialisation join goes WITH the decision filter, and that is not
    // incidental. Keeping the join and dropping only the filter leaves a
    // merely-requested override still passing nothing — because it has not been
    // socialised — so the named test goes on passing and a later one catches the
    // mutation instead. That is the IMPRECISE this entry's comment above already
    // records once; it was reintroduced when the entry was repointed at 0019 and
    // caught the same way.
    find: `join cw.override_socialisation s on s.request_id = f.request_id
where f.decision = 'approved'`,
    repl: `where true`,
    expect: 'a request on its own passes NOTHING' },

  { suite: 'override.test.mjs',
    name: 'a rejected finding is let past with the approved ones',
    find: `where f.decision = 'approved'`,
    repl: `where f.decision is not null`,
    expect: 'the gate opens for the approved finding ONLY' },

  // THE WINDOW, SKIPPED. The watchers are told and given no time to object,
  // which makes the socialisation decoration.
  //
  // REPOINTED 2026-07-28: "Enforce override decision windows at rows" (76008f2)
  // duplicated the guard into the row trigger, so `if now() < s.window_closes`
  // now appears twice in 0015 AND either single copy is masked by the other —
  // the helper's UPDATE fires the trigger, so breaking one guard alone changes
  // nothing observable. The mutation therefore moves to the one thing both
  // layers consult: the stored window itself. Computed to close in the past,
  // every decision is immediately allowed and the named test sees it.
  { suite: 'override.test.mjs',
    name: 'a decision can be taken before the window closes',
    find: `  closes := now() + (`,
    repl: `  closes := now() - (`,
    expect: 'a decision inside the window is refused' },

  // The guard skipped entirely. With no socialisation row, `now() < s.window_closes`
  // compares against null, which is not true — so the window check falls through
  // too and the decision lands on a request nobody was ever told about.
  //
  // REPOINTED 2026-07-28, and this one the preflight could NOT catch: the row
  // enforcement work duplicated the guard into the trigger with different
  // wording, so the helper's copy above stayed unique — the pattern still
  // matched, the mutation still applied, and it reported MISS because the
  // trigger refused in the helper's place. Same masking as its two siblings,
  // found by the run rather than the preflight. The check now breaks the
  // TRIGGER's copy — the last line of defense — and is caught by the test that
  // decides by direct UPDATE, which nothing else refuses.
  { suite: 'override.test.mjs',
    name: 'a decision can be taken before any socialisation at all',
    find: `    if not found then
      raise exception
        'override request % has not been socialised; no finding may be decided',`,
    repl: `    if false then
      raise exception
        'override request % has not been socialised; no finding may be decided',`,
    expect: 'Legal cannot decide a finding directly before socialisation' },

  // SOCIALISATION RECORDED AS SENT WHEN NOBODY WAS TOLD — a lie in the
  // permanent record, and the failure the whole step exists to prevent.
  { suite: 'override.test.mjs',
    name: 'an empty audience is treated as "nobody to tell"',
    find: `  if n = 0 then`,
    repl: `  if false then`,
    expect: 'an override with nobody to tell is REFUSED, not quietly sent' },

  { suite: 'override.test.mjs',
    name: 'socialisation is recorded as a human act',
    find: `                       'window_setting', win), 'system');`,
    repl: `                       'window_setting', win));`,
    expect: 'the socialisation event is a SYSTEM act, never a person\'s' },

  // THE JUSTIFICATION, hollowed out. `not null` is satisfied by the empty
  // string, which is exactly what a form posts when nobody types anything.
  { suite: 'override.test.mjs',
    name: 'a blank or boilerplate justification is accepted',
    find: `  constraint justification_is_not_boilerplate check (
    length(btrim(justification)) >= 20),`,
    repl: `  constraint justification_is_not_boilerplate check (justification is not null),`,
    expect: 'a justification cannot be boilerplate or blank' },

  { suite: 'override.test.mjs',
    name: 'a rejection needs no note',
    find: `  constraint rejection_needs_a_note check (
    decision is distinct from 'rejected'
    or (note is not null and btrim(note) <> ''))`,
    repl: `  constraint rejection_needs_a_note check (true)`,
    expect: 'a rejection without a note is refused' },

  { suite: 'override.test.mjs',
    name: 'a decision can be revisited',
    find: `  if old.decision is not null then
    raise exception 'finding % on request % was decided %; a decision is not '`,
    repl: `  if false then
    raise exception 'finding % on request % was decided %; a decision is not '`,
    expect: 'a decided finding is not revisited' },

  // REPOINTED 2026-07-28: "Enforce override self-review at rows" (37af0cd)
  // duplicated this guard into the row trigger, doubling the bare pattern in
  // 0015. The check now anchors on the TRIGGER's copy — distinguishable by its
  // own raise wording — because that is the copy the named test exercises: it
  // decides by direct UPDATE with the window already closed, so the trigger's
  // self-check is the only refusal in its path. The helper's copy is
  // unprovable redundancy behind it: the helper's UPDATE fires this same
  // trigger, so breaking the helper's copy alone changes nothing observable.
  { suite: 'override.test.mjs',
    name: 'somebody can decide their own override request',
    find: `    if r.requested_by = cw.app_actor() then
      raise exception
        'nobody decides their own override request — % asked for request %',`,
    repl: `    if false then
      raise exception
        'nobody decides their own override request — % asked for request %',`,
    expect: 'a reviewer cannot decide a request they opened' },

  { suite: 'override.test.mjs',
    name: 'a gate can be recorded for a finding nobody approved',
    find: `  if not exists (select 1 from cw.override_passes
                  where request_id = p_request_id and finding_ref = p_finding_ref) then`,
    repl: `  if false then`,
    expect: 'recording a gate for a rejected finding is refused' },

  // A ROLE ABLE TO ASSERT SOCIALISATION BY HAND — the state stops being earned
  // and becomes a claim.
  { suite: 'override.test.mjs',
    name: 'a role can write a socialisation row by hand',
    find: `grant insert on cw.override_request, cw.override_finding to cw_requester;`,
    repl: `grant insert on cw.override_request, cw.override_finding to cw_requester;
grant insert on cw.override_socialisation, cw.override_notified to cw_requester;`,
    expect: 'nobody can assert socialisation directly — no role holds the insert' },

  // ════════════════════════════════════════════════════════════════════════
  // The reviewer's desk (WP-U11)
  // ════════════════════════════════════════════════════════════════════════
  //
  // THE PRE-FILLED APPROVAL BOX. The critical anti-pattern for this package,
  // and the most tempting single line in the whole interface: it looks like a
  // convenience and it turns "approve" into "confirm".
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the AI candidate is pre-filled into the approval box',
    find: `  const [approved, setApproved] = useState('');`,
    repl: `  const [approved, setApproved] = useState(ticket.proposed_text);`,
    expect: 'the AI candidate is NEVER pre-filled into the approval box' },

  // RE-ANCHORED 2026-07-27: this used to retitle the confirmation panel and be
  // caught by a test requiring that title's words. It now removes the
  // confirmation step itself — minting straight from the button — which is the
  // break that matters and cannot be reworded away.
  // RE-ANCHORED 2026-08-02: the bare onClick pattern gained lookalikes when
  // the library's own confirm forms landed (D-5) — substring matching found
  // them inside deeper indentation. The verify button's testid pins the site.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'verify mints without a confirmation step',
    find: `                data-testid="verify"
                onClick={() => setConfirming(true)}>`,
    repl: `                data-testid="verify"
                onClick={async () => { await API.verifyTicket({ ticket_id: ticket.ticket_id, approved_text: approved.trim(), new_clause_id: clauseId.trim(), title: title.trim(), rationale: rationale.trim() }); onDone(); }}>`,
    expect: 'verify goes through a confirmation before it mints' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a rejection can be recorded with no note',
    find: `        <button className="btn" disabled={busy || !note.trim()}`,
    repl: `        <button className="btn" disabled={busy}`,
    expect: 'rejection needs a note and minting does not — friction where the irreversibility is' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an undecided ticket reads as approved-unedited',
    find: `              {t.edited_before_approval === true &&`,
    repl: `              {t.edited_before_approval ?`,
    expect: 'edited-before-approval is shown as the derived fact it is' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a reviewer can approve a finding inside the review window',
    find: `                        className="btn btn-sm" disabled={!r.window_closed}`,
    repl: `                        className="btn btn-sm"`,
    expect: 'the override window state is visible before anybody tries' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the reviewer is offered a hold release that is not theirs',
    find: `      <div className="caption mt-4">
        Releasing a hold is a Legal admin's act, not a reviewer's — so there is`,
    repl: `      <button className="btn" onClick={() => API.releaseHold({})}>release</button>
      <div className="caption mt-4">
        Releasing a hold is somebody's act — so there is`,
    expect: 'the reviewer is not offered acts that are not theirs' },

  // ════════════════════════════════════════════════════════════════════════
  // The requester's workspace (WP-U12)
  // ════════════════════════════════════════════════════════════════════════
  //
  // THE V3 BUTTON RETURNING. "Just for the demo flow" is exactly how it comes
  // back, and this is the screen it comes back on.
  //
  // RE-ANCHORED 2026-07-27: this used to relabel the button to
  // "acknowledge · override" and be caught by a ban on those words. Renaming a
  // button changes nothing; what matters is the handler. It now removes the
  // test handle the ask control is addressed by, which is a system fact.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the ask control loses the handle it is addressed by',
    find: `data-testid="ask-for-override"`,
    repl: `data-testid="acknowledge"`,
    expect: 'no acknowledge, override, or proceed-anyway affordance survives' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the requester opens the gate themselves',
    find: `            const s = await API.socialiseOverride({`,
    repl: `            await API.openOverrideGate({ request_id: r.rows[0].request_id });
            const s = await API.socialiseOverride({`,
    expect: 'no acknowledge, override, or proceed-anyway affordance survives' },

  // REMOVED 2026-07-27 — 'nothing says that asking is not being allowed'. The
  // mutation rewrote one sentence into another and the test caught the
  // rewrite. Copy, on both sides. That asking does not open the gate is
  // enforced by privilege, and the row above — which makes this screen call
  // API.openOverrideGate — is the check that would actually catch it.

  { target: 'shell', suite: 'shell.test.mjs',
    // RE-ANCHORED 2026-07-27: the mutation used to change the label from
    // "still blocks" to "decided". It now changes the CLASS, which is what
    // makes a rejected finding look settled favourably — and is what the test
    // checks now that it no longer reads the label.
    name: 'a rejected finding renders as though it were allowed',
    find: `                        ? <span className="chip chip-err" title={f.note}>still blocks</span>`,
    repl: `                        ? <span className="chip chip-ok" title={f.note}>still blocks</span>`,
    expect: 'a rejected finding is shown as still blocking' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the override request pane becomes unreachable again',
    find: `                      onClick={() => setAsking(true)}>`,
    repl: `                      onClick={() => {}}>`,
    expect: 'the request pane is reachable, not dead code' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a deal can be opened in somebody else\'s name from the form',
    find: `                    const r = await API.openDeal({
                      agreement_id: newDeal.id.trim(),
                      counterparty: newDeal.counterparty.trim(),
                    });`,
    repl: `                    const r = await API.openDeal({
                      agreement_id: newDeal.id.trim(),
                      counterparty: newDeal.counterparty.trim(),
                      requester: me.person,
                    });`,
    expect: 'the deal is opened in the session person\'s name, with no field for it' },

  // ════════════════════════════════════════════════════════════════════════
  // The sharing act and the reading room (WP-U14 read models, 0017)
  // ════════════════════════════════════════════════════════════════════════
  //
  // THE HOLE THIS CLOSED. Before 0017 a viewer could read every signed contract
  // in the system. This restores that exactly.
  { suite: 'reading-room.test.mjs',
    name: 'a viewer can read every signed agreement again',
    find: `  or (cw.app_role() = 'viewer'
      and cw.is_shared_with(agreement_id, cw.app_actor())));

drop policy read_scoped on cw.executed_document;`,
    repl: `  or cw.app_role() = 'viewer');

drop policy read_scoped on cw.executed_document;`,
    expect: 'before any share, a viewer sees NO signed agreement at all' },

  // THE VIEW NOT INHERITING THE POLICY. The bug this file actually shipped
  // with: a view runs with its OWNER's rights, so the scoping has to be in the
  // view as well, and a comment claiming otherwise is a document promising a
  // control the code does not enforce.
  { suite: 'reading-room.test.mjs',
    name: 'the reading room stops scoping itself and leans on the policy',
    find: `where s.revoked_at is null
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'viewer' and s.shared_with = cw.app_actor())
       or (cw.app_role() = 'requester' and cw.owns_agreement(s.agreement_id)));`,
    repl: `where s.revoked_at is null;`,
    expect: "an unshared viewer's reading room is empty, not refused" },

  { suite: 'reading-room.test.mjs',
    name: 'the clause view stops scoping itself',
    find: `where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'viewer'
       and cw.is_shared_with(e.agreement_id, cw.app_actor()))
   or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id));`,
    repl: `;`,
    expect: "an unshared viewer's reading room is empty, not refused" },

  // REPOINTED 2026-07-28: the share-evidence hardening series (b696fd9…6a04d5f)
  // rewrote cw.is_shared_with — the revocation test is no longer the closing
  // clause, so the old `find` with its trailing paren matched nothing. Same
  // mutation, same guarantee: the revocation clause alone is dropped and the
  // rest of the predicate is untouched.
  { suite: 'reading-room.test.mjs',
    name: 'a revoked share still opens the agreement',
    find: `       and shared_with = p_person
       and revoked_at is null`,
    repl: `       and shared_with = p_person`,
    expect: "revoking a share closes the viewer's access" },

  { suite: 'reading-room.test.mjs',
    name: 'a requester can share their own deal with anybody',
    find: `create policy legal_shares on cw.agreement_share for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));`,
    repl: `create policy legal_shares on cw.agreement_share for insert
  with check (cw.app_role() is not null);
grant insert on cw.agreement_share to cw_requester;
grant usage, select on sequence cw.agreement_share_share_id_seq to cw_requester;`,
    expect: 'a requester cannot share their own deal with whoever they like' },

  { suite: 'reading-room.test.mjs',
    name: 'a share need not say why',
    find: `  constraint a_purpose_is_not_blank check (length(btrim(purpose)) >= 5),`,
    repl: `  constraint a_purpose_is_not_blank check (purpose is not null),`,
    expect: 'a share must say why' },

  { suite: 'reading-room.test.mjs',
    name: 'a share can be deleted, taking the record with it',
    find: `create trigger agreement_share_no_delete
  before delete on cw.agreement_share
  for each row execute function cw.share_no_delete();`,
    repl: 'select 1;',
    expect: 'the row survives — that they COULD see it does not stop being true' },

  { suite: 'override.test.mjs',
    name: 'a viewer sees every override request, told about it or not',
    find: `  or (cw.app_role() = 'viewer'
      and cw.was_notified(override_request.request_id, cw.app_actor())));`,
    repl: `  or cw.app_role() = 'viewer');`,
    expect: 'a viewer sees a request only if they were told about it' },

  // ════════════════════════════════════════════════════════════════════════
  // The library and ladder consolidation views (WP-U13 read models, 0018)
  // ════════════════════════════════════════════════════════════════════════
  //
  // These views close no hole — they join views that already exist. So the
  // mutations are not "can somebody see what they should not"; they are the two
  // ways a convenience join goes wrong: it drops rows, or it duplicates them,
  // and both render as something a screen shows without complaint.

  // THE ONE THIS FILE IS MOST LIKELY TO REGRESS TO. An inner join is the
  // shorter, more natural thing to write, and it deletes every ladder that has
  // no rungs — reporting a configuration error as no error at all.
  { suite: 'library-ladder-views.test.mjs',
    name: 'the ladder board inner-joins its rungs, deleting empty ladders',
    find: 'left join cw.ladder_rung_state r on r.ladder_id = l.ladder_id',
    repl: 'join cw.ladder_rung_state r on r.ladder_id = l.ladder_id',
    expect: 'an empty ladder appears, as one row, saying it is empty' },

  // ONE MUTATION IS DELIBERATELY ABSENT, and it is worth the paragraph.
  //
  // 'every clause version appears exactly once' looks like it should be guarded
  // by swapping cw.library_entry's counted ladder facts for a join — a clause on
  // two ladders would then produce two library rows. That mutation was written,
  // run, and reported MISSED, because the duplication it induces cannot happen:
  // cw.ladder_rung_matches_ladder() refuses a rung whose clause is a different
  // category or severity than its ladder, and cw.ladder is unique on
  // (category_key, severity). A clause version therefore belongs to at most one
  // ladder, and no seed can make it belong to two.
  //
  // So the guarantee is real but it is held UPSTREAM, by 0003, not by 0018. It
  // is recorded here rather than deleted quietly, because a missing mutation and
  // a forgotten one look identical six months later — and because the day
  // anybody relaxes either of those two rules, this is the note that says the
  // library view now needs the guard it never needed before.

  // Null reads as "unknown" on a screen; the truth is "none". This is trap 5.2
  // in miniature — an absent answer and a zero answer rendering the same.
  // REPOINTED 2026-08-02: 0062 re-created cw.library_entry (live-ladder
  // filtering), so the 0018 text this row used to patch is no longer the last
  // definition to run — trap 5.4a, caught by the harness the same day.
  { suite: 'library-ladder-views.test.mjs',
    name: 'a version on no ladder reports null instead of false',
    find: `  (select coalesce(bool_or(r.is_floor), false) from cw.ladder_rung r
     join cw.ladder l on l.ladder_id = r.ladder_id and l.retired_on is null
    where r.clause_id = s.clause_id and r.version = s.version)      as is_a_floor,`,
    repl: `  (select bool_or(r.is_floor) from cw.ladder_rung r
     join cw.ladder l on l.ladder_id = r.ladder_id and l.retired_on is null
    where r.clause_id = s.clause_id and r.version = s.version)      as is_a_floor,`,
    expect: 'a version on no ladder reports zero, not null' },

  // The coverage flag stops asking. A banner that never fires is worse than no
  // banner: it reads as "no gaps" rather than "not checked".
  { suite: 'library-ladder-views.test.mjs',
    name: 'the coverage-gap flag never fires',
    find: `  exists (select 1 from cw.coverage_gap g
           where g.category_key = s.category_key and g.severity = s.severity)
                                                                    as category_uncovered`,
    repl: `  false                                                             as category_uncovered`,
    expect: 'a clause whose category has nothing selectable is flagged' },

  // The board hides its unusable rungs. A degraded ladder then renders as a
  // shorter healthy one, and the rung somebody has to fix is the one removed.
  { suite: 'library-ladder-views.test.mjs',
    name: 'the ladder board hides unusable rungs',
    find: 'left join cw.ladder_rung_state r on r.ladder_id = l.ladder_id',
    repl: `left join cw.ladder_rung_state r
  on r.ladder_id = l.ladder_id and r.selectable`,
    expect: 'an expired rung is carried as unusable, not hidden' },

  // THE ASSUMPTION IN 0018's HEADER. The file argues these views need no
  // WHERE-clause scoping because the grant carries what the policy asserts. If
  // the grant is widened, that argument fails — and this proves the suite is
  // watching the argument rather than repeating it.
  { suite: 'library-ladder-views.test.mjs',
    name: 'the consolidation views are granted to everybody',
    find: `grant select on cw.library_entry, cw.ladder_board
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;`,
    repl: `grant select on cw.library_entry, cw.ladder_board to public;`,
    expect: 'a connection holding no application role reads neither view' },

  // ════════════════════════════════════════════════════════════════════════
  // The views that were not policies (0019)
  // ════════════════════════════════════════════════════════════════════════
  //
  // Six views over person-scoped tables, none of them scoped, all granted to
  // roles that should only see their own rows. Two were reported by the Python
  // session porting the reads; four more were found by asking the catalogue
  // what else had the same shape. Each mutation below restores one leak
  // exactly.

  { suite: 'override.test.mjs',
    name: 'the override status view stops scoping itself',
    find: `where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and r.requested_by = cw.app_actor())
   or (cw.app_role() = 'viewer' and cw.was_notified(r.request_id, cw.app_actor()));`,
    repl: ';',
    expect: 'and the status view says the same thing as the table' },

  // THE GATE VIEW. This one hid because it filters on `decision` — it looks
  // correctly empty right up until the first approval lands, and then it hands
  // the justification of every approved override to anybody.
  { suite: 'override.test.mjs',
    name: 'the gate view stops scoping itself',
    find: `where f.decision = 'approved'
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and r.requested_by = cw.app_actor())
       or (cw.app_role() = 'viewer' and cw.was_notified(r.request_id, cw.app_actor())));`,
    repl: `where f.decision = 'approved';`,
    expect: 'the gate view is scoped, so it is not a way round the policy' },

  // THE READING-ROOM HOLE, REOPENED THROUGH THE SIDE DOOR. 0017 narrowed the
  // policies on the four tables carrying a signed contract and scoped the view
  // it had just written; this view had been selecting from those same tables
  // since 0006 and nobody pointed at it.
  { suite: 'executed.test.mjs',
    name: 'the document chain hands every signed agreement to any viewer',
    find: `where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id))
   or (cw.app_role() = 'viewer' and cw.is_shared_with(e.agreement_id, cw.app_actor()))
order by e.agreement_id, d.doc_seq;`,
    repl: 'order by e.agreement_id, d.doc_seq;',
    expect: 'and the views over it are shared-scoped too, not just the tables' },

  // A list of which signed agreements are missing a signature or a completion
  // certificate — a map of the weakest contracts in the business.
  { suite: 'executed.test.mjs',
    name: 'the evidence-gap list is readable by any viewer',
    find: `from cw.executed_agreement e
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id))
   or (cw.app_role() = 'viewer' and cw.is_shared_with(e.agreement_id, cw.app_actor()));`,
    repl: 'from cw.executed_agreement e;',
    expect: 'and the views over it are shared-scoped too, not just the tables' },

  // THE INVENTORY ITSELF, exercised through the schema rather than through its
  // own source. This harness mutates migrations, not test files, so the guard
  // is proved the way it will actually be met: by changing the database until
  // the inventory should object.
  //
  // A new view reaches a viewer and nobody has classified it. This is the
  // everyday case — somebody adds a grant, and the leak arrives with it.
  { suite: 'views-are-not-policies.test.mjs',
    // REWRITTEN 2026-08-08, AND THE FIRST ATTEMPT IS THE INTERESTING PART.
    // This used to grant cw.review_quality to a viewer, which worked while the
    // inventory was keyed on cw_viewer: the view was unlisted, so it became an
    // unclassified reader. Now that the inventory covers every role,
    // review_quality IS listed — classified 'privileged' — so that mutation
    // trips the PRIVILEGED test instead, and this row scored imprecise. I had
    // written a comment claiming it would trip both. It trips one.
    //
    // So the mutation now adds a view nobody could have classified, which is
    // the mistake this test actually guards: somebody writes a view, grants it,
    // and never says which case it is. The privileged test gets its own row
    // below rather than sharing this one.
    name: 'a view is granted with nobody having classified it',
    find: '-- A live SOW under a terminated master.',
    repl: `-- A live SOW under a terminated master.
create view cw.unclassified_probe as select ticket_id from cw.review_ticket;
grant select on cw.unclassified_probe to cw_requester;`,
    expect: 'every view any role can read has been classified' },

  { suite: 'received-documents.test.mjs',
    // 0072. The chain's one narrow door, and it is narrow in EVENT TYPE only
    // until somebody checks the caller may read what they are recording a read
    // of. It shipped without that check: a requester wrote a read of another
    // requester's negotiation, naming a round and a document that did not
    // exist, and cw.audit_verify() stayed clean — the chain proves nothing was
    // ALTERED, never that anything is TRUE.
    //
    // Softening this back to `true` is one edit, and it leaves a function that
    // still looks role-aware because it reads current_setting('role') to LABEL
    // the event. That is exactly how it hid the first time.
    name: 'the document-read door stops asking whose round it is',
    find: `  if not (raw_role in ('cw_legal_reviewer','cw_legal_admin','cw_auditor')`,
    repl: `  if not (true or raw_role in ('cw_legal_reviewer','cw_legal_admin','cw_auditor')`,
    expect: 'a requester cannot record a read of somebody else’s round' },

  { suite: 'views-are-not-policies.test.mjs',
    // The other half, and the one that would have caught the five views 0071
    // scoped had anybody classified them. 'privileged' means unscoped over
    // person-scoped tables and safe ONLY because privileged roles alone can
    // read it — so the grant is the whole fence, and a grant is one line in a
    // later migration away from moving.
    name: 'a privileged view is handed to the requester',
    find: '-- A live SOW under a terminated master.',
    repl: `-- A live SOW under a terminated master.
grant select on cw.review_quality to cw_requester;`,
    expect: "every view marked 'privileged' is granted to privileged roles only" },

  // And the other way the list rots: an entry says 'scoped' long after the
  // scoping was taken out. A list that keeps claiming a control nobody enforces
  // is worse than no list, because it reads like assurance.
  { suite: 'views-are-not-policies.test.mjs',
    name: "a view marked 'scoped' quietly stops scoping itself",
    find: `where s.revoked_at is null
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'viewer' and s.shared_with = cw.app_actor())
       or (cw.app_role() = 'requester' and cw.owns_agreement(s.agreement_id)));`,
    repl: 'where s.revoked_at is null;',
    expect: "every view marked 'scoped' actually consults who is asking" },

  // ════════════════════════════════════════════════════════════════════════
  // A deal's birth is on the chain (0020)
  // ════════════════════════════════════════════════════════════════════════
  //
  // Found by the Python session needing two audited acts for an attribution
  // test, reaching for the most obvious one in the system, and finding it was
  // not audited at all.
  { suite: 'executed.test.mjs',
    name: 'opening a deal leaves no trace again',
    find: `create trigger audit_agreement_opened
  after insert on cw.agreement
  for each row execute function cw.audit_agreement_opened();`,
    repl: 'select 1;',
    expect: 'the deal being opened is on the chain, naming who owns it' },

  // The payload, not just the event. An `agreement_opened` row that does not
  // name the requester records that a deal happened without recording the one
  // field every later access decision for that role reads.
  { suite: 'executed.test.mjs',
    name: 'the deal opening does not record who it is scoped to',
    find: `      'requester',    new.requester,`,
    repl: '',
    expect: 'the deal being opened is on the chain, naming who owns it' },

  { suite: 'executed.test.mjs',
    name: 'creating a category leaves no trace again',
    find: `create trigger audit_category_created
  after insert on cw.category
  for each row execute function cw.audit_category_created();`,
    repl: 'select 1;',
    expect: 'creating a category is recorded too' },

  // ════════════════════════════════════════════════════════════════════════
  // seq is assigned under the lock (0021)
  // ════════════════════════════════════════════════════════════════════════
  //
  // The defect needs two concurrent writers and PGlite is single-connection, so
  // the RACE cannot be reproduced here. The MECHANISM can: seq must come from
  // the trigger, not from the bigserial default that PostgreSQL evaluates
  // before the trigger fires — that is, outside the advisory lock.
  //
  // Restoring the default is exactly the regression: sequence order stops being
  // append order, and cw.audit_verify() starts calling honest chains broken.
  { suite: 'audit-chain.test.mjs',
    name: 'seq goes back to the column default, outside the lock',
    find: '  new.seq := coalesce(prev_seq, 0) + 1;',
    repl: '',
    expect: 'the sequence number is assigned under the lock, not by the default' },

  // ════════════════════════════════════════════════════════════════════════
  // The auditor's workspace (WP-U14) — target: 'shell'
  // ════════════════════════════════════════════════════════════════════════
  //
  // The role that changes nothing needs a screen that PROVES it. Each mutation
  // below is a way the proof quietly stops being one.

  // THE NAMED ANTI-PATTERN. A disabled control says "you could, but not now"
  // and sends somebody looking for the conditions that light it up. The truth
  // is "this was never yours".
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the auditor gets a disabled act instead of no act',
    find: `        <button className="btn btn-sm self-center" onClick={() => setDense(!dense)}`,
    repl: `        <button className="btn btn-sm" disabled onClick={() => API.takeCheckpoint()}`,
    expect: 'the auditor is offered no act at all, not even a disabled one' },

  // The same rule at the call site: a write helper reaching this file is a
  // write affordance whatever the buttons look like.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a write helper appears in the auditor pane',
    find: `  const health = usePane(() => API.health());`,
    repl: `  const health = usePane(() => API.health());
  const take = () => API.takeCheckpoint();`,
    expect: 'the auditor pane writes nothing through the API' },

  // THE ONE THAT ALREADY HAPPENED ONCE. The first draft looked for a tile named
  // 'chain'; cw.health_summary publishes 'audit chain'. It found nothing and
  // rendered "not available", which on screen is indistinguishable from the
  // health check genuinely having no answer — a lookup that misses
  // impersonating a real state.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the chain tile looks for a tile name that does not exist',
    find: `health.rows.find((t) => t.tile === 'audit chain')`,
    repl: `health.rows.find((t) => t.tile === 'chain')`,
    expect: 'the chain tile reports the health record rather than deciding for itself' },

  // NULL IS NOT ZERO. cw.review_quality returns null when nothing has been
  // verified — no denominator. Rendering that as 0% reports perfect discipline
  // from an empty queue, which is the most flattering possible lie.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an unmeasured approval rate is rendered as zero per cent',
    find: `  const unmeasured = rate === null || rate === undefined;`,
    repl: `  const unmeasured = false;`,
    expect: 'an unmeasured approval rate is not rendered as zero' },

  // A pane quietly reverting to a stub after the endpoint exists would claim
  // the system does less than it does — the mirror of the usual failure.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the record pane goes back to being a stub',
    find: `  'the-record':     () => <TheRecordPane />,`,
    repl: `  'the-record':     () => <NotBuiltYet what="The chain explorer is not built." lands="WP-U14" />,`,
    expect: 'the auditor panes are wired into the router, not still stubs' },

  // ════════════════════════════════════════════════════════════════════════
  // The viewer's reading room (WP-U14) — target: 'shell'
  // ════════════════════════════════════════════════════════════════════════
  //
  // REPOINTED: these keyed on the not-built stub until the doorway served
  // GET /reading-room. The role exists so a contract can be shown to somebody
  // without giving them a way in, and every mutation below is a way the screen
  // quietly becomes a way in.

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the reading room goes back to being a stub',
    find: `  'reading-room': (me) => <ReadingRoomPane me={me} />,`,
    repl: `  'reading-room': () => <NotBuiltYet what="The reading room is not built." lands="WP-U14" />,`,
    expect: 'the reading room is wired to a real endpoint' },

  // THE CRITICAL ANTI-PATTERN. The moment the browser can name an agreement,
  // "this share, this person" stops being a rule and becomes a query somebody
  // has to write carefully every time.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the reading room lets the browser name what it wants',
    find: `    readingRoom:        () => call('GET', '/reading-room'),`,
    repl: `    readingRoom:        (id) => call('GET', \`/reading-room?agreement=\${id}\`),`,
    expect: 'the viewer fetches nothing broader than this share, this person' },

  // ADR-0008 gave the viewer no export deliberately. This is how it comes back:
  // as a convenience nobody thinks to question.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'a download appears on the viewer surface',
    find: `  const [open, setOpen] = useState(null);`,
    repl: `  const [open, setOpen] = useState(null);
  const save = () => {
    const blob = new Blob(['x'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.download = 'agreement.txt';
    a.href = URL.createObjectURL(blob);
    a.click();
  };`,
    expect: 'the viewer has no export path of any kind' },

  // An empty room is a TRUE FACT about this person, not a fault and not an
  // unbuilt pane. Rendered as unbuilt it claims the system does less than it
  // does; rendered as a failure it sends somebody chasing a problem that is
  // not there.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'an empty reading room reports itself as unbuilt',
    find: `        <Empty
          kicker="reading room"
          line="Nothing has been shared with you."`,
    repl: `        <NotBuiltYet
          what="Nothing has been shared with you."
          lands="WP-U14"
          line="Nothing has been shared with you."`,
    expect: 'an empty reading room reads as an answer, not a failure' },

  // The one place a viewer sees an approval. Being shown a contract is useless
  // if you cannot see whose language it is.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the viewer is shown the wording but not who approved it',
    // REPOINTED 2026-08-05. The line was re-indented when the per-clause render
    // moved inside the origin-gutter markup, so the pattern stopped matching
    // and reported STALE — the harness catching its own rot, which is what the
    // preflight is for. Anchored on the conditional alone now, without the
    // leading whitespace that indentation keeps changing.
    find: `{c.reviewer
                            ? \`approved by \${c.reviewer}\${c.approved_on ? \` on \${c.approved_on}\` : ''}\`
                            : 'no approver recorded'}`,
    repl: `{''}`,
    expect: 'the viewer is shown who approved each clause' },

  // ════════════════════════════════════════════════════════════════════════
  // The Legal admin's library and ladders (WP-U13) — target: 'shell'
  // ════════════════════════════════════════════════════════════════════════

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the library goes back to being a stub',
    find: `  'library':    () => <LibraryPane />,`,
    repl: `  'library':    () => <NotBuiltYet what="The clause library is not built." lands="WP-U13" />,`,
    expect: 'the library and ladders read real endpoints' },

  // THE PRODUCT BOUNDARY IN PIXEL FORM. The system surfaces the gap and names
  // who can close it; the gap itself belongs to the library's owners. Calling it
  // an error makes it ours, which is the one framing CLAUDE.md forbids.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the coverage gap is framed as a system failure',
    find: `            A run that reaches one of these has nothing to offer and will say so.
            <strong> Closing it is Legal's to do</strong> — the system's part is to
            show it here rather than discover it mid-negotiation.`,
    repl: `            The library is misconfigured and the engine cannot resolve these
            categories. This is an error in the clause data.`,
    expect: 'a coverage gap is surfaced, never framed as a system failure' },

  // AN IN-PLACE EDIT AFFORDANCE would be the mutation-surface invariant broken
  // in the UI rather than in the schema. Every change to approved wording is a
  // new version with its history intact.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the library grows an in-place edit affordance',
    find: `                  <button className="btn btn-sm" onClick={() => setOpen(isOpen ? null : key)}`,
    repl: `                  <button className="btn btn-sm" onClick={() => API.setSetting({ body: c.body })}`,
    expect: 'the library offers no way to edit approved wording' },

  // THE GUARANTEE 0018 WAS BUILT AROUND, undone at the last possible moment. A
  // board that drops the null rung reports a configuration error as absence,
  // which renders identically to health.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the empty ladder is filtered out in the browser',
    find: `    if (r.rung !== null && r.rung !== undefined) l.steps.push(r);`,
    repl: `    l.steps.push(r);`,
    expect: 'an empty ladder is rendered, not filtered away' },

  // ════════════════════════════════════════════════════════════════════════
  // Owner decisions U9–U11 (0022)
  // ════════════════════════════════════════════════════════════════════════

  // U9 · THE AUTHORITY MOVED, IT WAS NOT SHARED. Two roles holding an
  // irreversible act means neither is accountable for it — the same reasoning
  // as U7's checkpoint move.
  { suite: 'governance.test.mjs',
    name: 'legal admin keeps destruction alongside the administrator',
    find: 'revoke execute on function cw.retention_destroy(text, text) from cw_legal_admin;',
    repl: '',
    expect: 'nor can a legal admin any more — U9 moved it, it did not share it' },

  { suite: 'health.test.mjs',
    name: 'the administrator is not given the authority U9 moved to it',
    find: 'grant  execute on function cw.retention_destroy(text, text) to cw_administrator;',
    repl: '',
    expect: 'the administrator sees what is due AND may act on it' },

  // U9 · "Auto-record-destruction should never happen." It never did, but a
  // fact nobody asserts is a fact somebody can undo without noticing. This adds
  // the timer the decision forbids and checks the assertion sees it.
  { suite: 'governance.test.mjs',
    name: 'a trigger destroys records without anybody asking',
    find: `comment on function cw.retention_destroy(text, text) is`,
    repl: `create or replace function cw.auto_destroy() returns trigger
language plpgsql as $$
begin
  perform cw.retention_destroy(new.agreement_id, 'scheduler');
  return new;
end $$;
create trigger auto_destroy after insert on cw.agreement_retention
  for each row execute function cw.auto_destroy();

comment on function cw.retention_destroy(text, text) is`,
    expect: 'nothing in the schema destroys anything by itself' },

  // REMOVED 2026-07-27 — 'the retention tile still names Legal admin as the
  // destroyer'. The mutation rewrote a sentence inside a SQL view's copy and
  // the test caught the reworded sentence. Content on both sides. The
  // authority move U9 made is proven by privilege, in the two rows above
  // (execute revoked from legal_admin, granted to the administrator), which is
  // the thing a screen cannot contradict into being false.

  // U10 · An in-flight deal on superseded wording must be FLAGGED. Before 0022
  // nothing reported it, and obsolete language would have been signed by
  // mistake with nobody told.
  { suite: 'executed.test.mjs',
    name: 'in-flight deals stop being told their wording has moved on',
    find: `  and (s.id is not null or cur.state <> 'active')`,
    repl: `  and false`,
    expect: 'an IN-FLIGHT deal carrying superseded wording is flagged too' },

  // U10 · And the two reports must stay distinct: a signed contract's drift is
  // input to a renewal, an in-flight one can still be corrected.
  { suite: 'executed.test.mjs',
    name: 'the in-flight report swallows signed agreements too',
    find: `where a.status <> 'executed'`,
    repl: `where true`,
    expect: 'an IN-FLIGHT deal carrying superseded wording is flagged too' },

  // U11 · The Administrator may read the library. The gap was the GRANT, not
  // the policy — removing it puts the role back to content-blind against the
  // library, the one word U5 says never to use for it.
  { suite: 'library-ladder-views.test.mjs',
    name: 'the administrator is content-blind against the library again',
    find: `grant select on cw.clause, cw.clause_version, cw.category, cw.supersession,
                cw.clause_version_state, cw.selectable_clause, cw.coverage_gap,
                cw.library_entry
  to cw_administrator;`,
    repl: '',
    expect: 'the administrator may read the library, and write none of it' },

  // U11 · And sight is ALL it opened. U5's boundary was write and judgement.
  //
  // POINTED AT THE SWEEP, not at a narrower test of my own. The first version of
  // this entry named a test I had just written for the library specifically, and
  // the harness reported IMPRECISE: administrator.test.mjs already sweeps EVERY
  // table in the schema against an explicit allow-list, so it caught the
  // mutation first and by a better route. The narrow test was then deleted — a
  // second, weaker assertion of a guarantee the sweep already owns is a place
  // for the two to drift apart.
  { suite: 'administrator.test.mjs',
    name: 'reading the library quietly becomes writing it',
    find: `grant select on cw.ladder, cw.ladder_rung, cw.ladder_rung_state,
                cw.ladder_health, cw.ladder_board
  to cw_administrator;`,
    repl: `grant select on cw.ladder, cw.ladder_rung, cw.ladder_rung_state,
                cw.ladder_health, cw.ladder_board
  to cw_administrator;
grant insert, update on cw.category, cw.clause_version to cw_administrator;`,
    expect: 'no table in schema cw grants the administrator insert, update or delete except the two it is supposed to' },

  // ════════════════════════════════════════════════════════════════════════
  // Ending a record's life (owner decision U12, 0023)
  // ════════════════════════════════════════════════════════════════════════
  //
  // The most dangerous acts in the product. Everything else here is written to
  // make records survive, so each mutation below restores a way one could be
  // removed that the owner refused.

  // THE ESCALATION IS THE CONTROL. One-step erasure is exactly what U12 refuses:
  // a record must be redacted first, which leaves it reviewable, before anybody
  // can remove it.
  { suite: 'redaction.test.mjs',
    name: 'a record can be purged without ever being redacted',
    find: `  if r.redacted_on is null then
    raise exception '% has not been redacted; a record is redacted first, '
      'reviewed, and only then purged', p_agreement_id
      using errcode = 'restrict_violation';
  end if;`,
    repl: '',
    expect: 'purging before redaction is refused — the review step cannot be skipped' },

  // Redaction carries out a decision; it is not the decision. Removing content
  // from something nobody decided to dispose of is a deletion with nothing
  // behind it.
  { suite: 'redaction.test.mjs',
    name: 'content can be removed before anybody decided to dispose of the record',
    find: `  if r.destroyed_on is null then
    raise exception 'the retention of % has not been ended; record the '
      'destruction first, then redact', p_agreement_id
      using errcode = 'restrict_violation';
  end if;`,
    repl: '',
    expect: 'redacting before the retention decision is refused' },

  // THE ASYMMETRY IS THE DECISION. Removing content can be handed out; removing
  // the record cannot.
  { suite: 'redaction.test.mjs',
    name: 'the purge becomes delegable like the redaction',
    find: 'grant execute on function cw.purge_agreement(text, text) to cw_administrator;',
    repl: `grant execute on function cw.purge_agreement(text, text)
  to cw_administrator, cw_legal_admin, cw_legal_reviewer;`,
    expect: 'and STILL cannot purge — the delegation does not carry that' },

  // THE NULL TRAP, RESTORED. The first version of this guard compared
  // cw.app_role() inside a SECURITY DEFINER function, where it is NULL — and
  // `null <> 'administrator'` is NULL, so the guard never fired and an
  // undelegated reviewer redacted a record. This is that bug, put back.
  { suite: 'redaction.test.mjs',
    name: 'the redaction guard compares against a NULL and fails open',
    find: `  if not cw.may_redact(p_actor) then`,
    repl: `  if cw.app_role() <> 'administrator' and not cw.may_redact(p_actor) then`,
    expect: 'a legal reviewer with no delegation cannot redact' },

  // A hold outranks every disposal act, and the refusal must NAME the matter —
  // a refusal nobody can act on is barely a refusal.
  { suite: 'redaction.test.mjs',
    name: 'a legal hold stops refusing the redaction',
    find: `  if cw.agreement_under_hold(p_agreement_id) then
    select string_agg(h.matter_ref, ', ' order by h.matter_ref) into matters
    from cw.legal_hold h
    where h.agreement_id = p_agreement_id and h.released_on is null;
    raise exception
      '% is under legal hold (%); redaction is suspended until every hold is '
      'released', p_agreement_id, matters using errcode = 'restrict_violation';
  end if;`,
    repl: '',
    expect: 'neither act proceeds while a matter is open' },

  // WHAT REDACTION MUST ACTUALLY REMOVE. The certificate holds real bytes — "a
  // reference to a certificate on someone else's server is a promise; the bytes
  // are the evidence" — and leaving them is a redaction that redacted nothing.
  { suite: 'redaction.test.mjs',
    name: 'redaction leaves the certificate bytes behind',
    find: `  update cw.signature_certificate
     set certificate = '\\x00'::bytea, byte_size = 1
   where agreement_id = p_agreement_id;`,
    repl: '',
    expect: 'the certificate bytes are gone' },

  // AND WHAT IT MUST KEEP. The hash is the important survivor: it still proves
  // what the document was to anybody holding a copy, without this system
  // holding one. A redaction that took it would destroy the fact along with the
  // content, which is the half U12 says to keep.
  { suite: 'redaction.test.mjs',
    name: 'redaction takes the record of what the document was, not just its content',
    find: `  update cw.executed_document
     set storage_uri = ''
   where agreement_id = p_agreement_id;`,
    repl: `  update cw.executed_document
     set storage_uri = '', sha256 = repeat('0', 64), filename = ''
   where agreement_id = p_agreement_id;`,
    expect: 'the FACT survives in full — name, size, hash, dates' },

  // THE ONE SANCTIONED EXCEPTION TO THE FREEZE, widened. If the flag alone let
  // a write through, a session variable would defeat the guarantee the whole
  // product rests on.
  { suite: 'redaction.test.mjs',
    name: 'the freeze is defeated by anybody who sets the flag',
    find: `grant execute on function cw.redact_agreement(text, text)
  to cw_administrator, cw_legal_admin, cw_legal_reviewer;`,
    repl: `grant execute on function cw.redact_agreement(text, text)
  to cw_administrator, cw_legal_admin, cw_legal_reviewer;
grant update on cw.executed_document to cw_legal_admin;`,
    expect: 'setting the flag by hand achieves nothing without the privilege' },

  // The delegation is the Administrator's to hand out. A role that could
  // delegate it to itself would have taken it rather than been given it.
  { suite: 'redaction.test.mjs',
    name: 'anybody can delegate the authority to destroy records',
    find: `create policy administrator_delegates on cw.records_delegate for insert
  with check (cw.app_role() = 'administrator');`,
    repl: `create policy administrator_delegates on cw.records_delegate for insert
  with check (cw.app_role() is not null);
grant insert on cw.records_delegate to cw_legal_admin;
grant usage, select on sequence cw.records_delegate_delegate_id_seq to cw_legal_admin;`,
    expect: 'only the administrator may delegate, and it lands on the chain' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'unusable rungs are hidden so the ladder looks healthy',
    find: `                      {!r.rung_selectable && (
                        <span className="chip chip-err" data-testid="rung-unusable">
                          {r.rung_state}
                        </span>
                      )}`,
    repl: `                      {false && (
                        <span className="chip chip-err">
                          {r.rung_state}
                        </span>
                      )}`,
    expect: 'an unusable rung stays on the ladder rather than being hidden' },

  // ════════════════════════════════════════════════════════════════════════
  // Obligation templates (0035, OB-01) · the third content type through the gate
  // ════════════════════════════════════════════════════════════════════════

  // The ungoverned INSERT again: a row born approved with a hand-written
  // approver never meets the transition trigger.
  { suite: 'obligations.test.mjs',
    name: 'an obligation template can be born already approved',
    find: `  if new.state <> 'proposed' or new.approved_by is not null
     or new.approved_on is not null or new.retired_on is not null then`,
    repl: `  if false then`,
    expect: 'a template is born proposed, whatever the caller claims' },

  { suite: 'obligations.test.mjs',
    name: 'an approved obligation template stays editable',
    find: `  if old.state = 'approved'
     and (new.clause_id     is distinct from old.clause_id`,
    repl: `  if false
     and (new.clause_id     is distinct from old.clause_id`,
    expect: 'an approved template is immutable — retire it and author a new one' },

  { suite: 'obligations.test.mjs',
    name: 'a retired obligation template comes back by edit',
    find: `  if old.state = 'retired' then
    raise exception
      'obligation template % is retired; a retired template never comes back '`,
    repl: `  if false then
    raise exception
      'obligation template % is retired; a retired template never comes back '`,
    expect: 'a retired template never comes back' },

  { suite: 'obligations.test.mjs',
    name: 'the proposer may approve their own template',
    find: `    if old.proposed_by is not distinct from cw.app_actor() then`,
    repl: `    if false then`,
    expect: 'nobody approves their own obligation template' },

  // Grant and policy widened TOGETHER, deliberately: each alone is masked by
  // the other (the S110 lesson), so the pair is what the named test proves.
  { suite: 'obligations.test.mjs',
    name: 'a legal reviewer may decide obligation templates',
    find: `create policy admin_decides on cw.obligation_template for update
  using      (cw.app_role() = 'legal_admin')
  with check (cw.app_role() = 'legal_admin');`,
    repl: `create policy admin_decides on cw.obligation_template for update
  using      (cw.app_role() in ('legal_admin','legal_reviewer'))
  with check (cw.app_role() in ('legal_admin','legal_reviewer'));
grant update on cw.obligation_template to cw_legal_reviewer;`,
    expect: 'a legal reviewer cannot decide a template — only legal admin' },

  { suite: 'obligations.test.mjs',
    name: 'an obligation template can be deleted',
    find: `create trigger obligation_template_no_delete
  before delete on cw.obligation_template
  for each row execute function cw.obligation_template_no_delete();`,
    repl: 'select 1;',
    expect: 'a template is never deleted — not even by the owner' },

  // ════════════════════════════════════════════════════════════════════════
  // Registration (0036, OB-02) · the deterministic derivation at execution
  // ════════════════════════════════════════════════════════════════════════

  // The pin removed: registration reads templates as they stand TODAY instead
  // of as they stood at execution, and a signed deal's obligation set changes
  // because Legal improved a template — the exact drift ADR-0006 forbids.
  { suite: 'obligations.test.mjs',
    name: 'registration reads current templates, not pinned-at-execution ones',
    find: `      and t.approved_on <= ea.executed_on`,
    repl: `      and true`,
    expect: 'a template approved after execution reaches future registrations only' },

  // The insert-missing guard removed. The unique key is the second layer here
  // (the S110 shape), so the observable break is a re-run RAISING instead of
  // quietly adding nothing — either way the named test sees idempotence die.
  { suite: 'obligations.test.mjs',
    name: 'a registration re-run duplicates the set (or dies trying)',
    find: `  where not exists (select 1 from cw.obligation_instance i
                     where i.agreement_id = p_agreement_id
                       and i.template_id  = d.template_id
                       and i.occurrence   = d.occurrence);`,
    repl: `  ;`,
    expect: 'registration is idempotent — a re-run adds nothing' },

  // The gap report suppressed: a clause declaring nothing simply registers
  // nothing, silently — the coverage metric reads as complete when it is blind.
  { suite: 'obligations.test.mjs',
    name: 'an uncovered clause registers silence instead of a gap row',
    find: `  where not exists (select 1 from cw.derive_obligations(p_agreement_id, horizon) x
                     where x.clause_id = pk.clause_id and x.version = pk.version)`,
    repl: `  where false and not exists (select 1 from cw.derive_obligations(p_agreement_id, horizon) x
                     where x.clause_id = pk.clause_id and x.version = pk.version)`,
    expect: 'an in-force clause declaring nothing is a visible gap' },

  // The freeze on derivation output, update half only — the delete trigger is
  // kept so this breaks rewriting ALONE, the 0006 anchoring lesson. The named
  // test runs as the owner, whom no grant stops (D6).
  { suite: 'obligations.test.mjs',
    name: 'obligation instances become editable',
    find: `    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.obligation_frozen()', t, t);`,
    repl: `    perform 1;`,
    expect: 'the obligation record cannot be rewritten — not even by the owner' },

  { suite: 'obligations.test.mjs',
    name: 'every requester reads every deal’s obligations at the table',
    find: `create policy read_scoped on cw.obligation_instance for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester'
      and cw.owns_agreement(obligation_instance.agreement_id)));`,
    repl: `create policy read_scoped on cw.obligation_instance for select using (
  cw.app_role() is not null);`,
    expect: 'a requester reads their own deals at the table' },

  // ════════════════════════════════════════════════════════════════════════
  // The recorded acts (0037, OB-04) · states computed, acts recorded
  // ════════════════════════════════════════════════════════════════════════

  // The '' vs NULL lesson, restored exactly: `is not null` is satisfied by the
  // empty string a form posts when the closer typed nothing.
  { suite: 'obligations.test.mjs',
    name: 'a satisfaction with an empty note is accepted',
    find: `  constraint satisfaction_needs_note check
    (act <> 'satisfied' or coalesce(btrim(note), '') <> ''),`,
    repl: `  constraint satisfaction_needs_note check
    (act <> 'satisfied' or note is not null),`,
    expect: 'satisfying with an empty note is refused' },

  { suite: 'obligations.test.mjs',
    name: 'the actor on an obligation act is whatever the caller claims',
    find: `  if cw.app_role() is not null then
    new.acted_by := cw.app_actor();
    new.acted_at := now();
  end if;`,
    repl: `  if false then end if;`,
    expect: 'a satisfaction is a named act with the note on the record' },

  { suite: 'obligations.test.mjs',
    name: 'a closed obligation takes further decisions',
    find: `  if exists (select 1 from cw.obligation_act a
              where a.obligation_id = new.obligation_id
                and a.act in ('satisfied','waived')) then`,
    repl: `  if false then`,
    expect: 'a decision is not revisited' },

  // D-1 defeated from the arithmetic side: breach asserted about a duty that
  // is not overdue, so the system's word outruns its facts.
  { suite: 'obligations.test.mjs',
    name: 'breach can be asserted ahead of the arithmetic',
    find: `  if new.act = 'breach_asserted'
     and (i.due_on is null or current_date <= i.due_on) then`,
    repl: `  if false then`,
    expect: 'breach is asserted only on an overdue fact (D-1)' },

  // D-1 defeated from the authority side.
  { suite: 'obligations.test.mjs',
    name: 'anybody signed in asserts breach',
    find: `  or (act = 'breach_asserted' and cw.app_role() = 'legal_admin'));`,
    repl: `  or (act = 'breach_asserted' and cw.app_role() is not null));`,
    expect: 'nobody but legal admin asserts breach' },

  // Update half only; the delete trigger stays so this breaks rewriting alone.
  { suite: 'obligations.test.mjs',
    name: 'obligation acts become editable',
    find: `create trigger obligation_act_frozen before update on cw.obligation_act
  for each row execute function cw.obligation_act_frozen();`,
    repl: `select 1;`,
    expect: 'an act cannot be rewritten or deleted — not even by the owner' },

  // ════════════════════════════════════════════════════════════════════════
  // Computed states and close eligibility (0038, OB-03)
  // ════════════════════════════════════════════════════════════════════════
  // No mutation for the `due_on is null then 'pending'` branch, deliberately:
  // dropping it routes a null due date through two null comparisons into the
  // same 'pending' else-arm, so the mutation cancels itself out and would
  // report MISS for a behaviour that is intact. The branch is readability,
  // not protection — the unprovable-redundancy rule (S110) applied.

  { suite: 'obligations.test.mjs',
    name: 'a recorded closure loses to the calendar',
    find: `         when closed.act is not null then closed.act`,
    repl: `         when false then closed.act`,
    expect: 'a satisfied duty reads satisfied, with its closer' },

  { suite: 'obligations.test.mjs',
    name: 'the lead window never opens — nothing ever reads due',
    // REPOINTED TO 0071. This used to patch 0038's spelling of the view, which
    // 0071 replaces — so the mutation was undone by a later migration and the
    // harness scored it imprecise. The parentheses are 0071's, and they are why
    // the old string stopped matching.
    find: `         when current_date >= (i.due_on - i.lead_days) then 'due'`,
    repl: `         when false then 'due'`,
    expect: 'an obligation inside its lead window reads due' },

  { suite: 'obligations.test.mjs',
    name: 'the close gate is pinned open',
    // REPOINTED TO 0071, for the same reason as the row above.
    find: `       count(s.obligation_id) filter (where s.survives and s.closed_as is null) = 0
         as closeable`,
    repl: `       true as closeable`,
    expect: 'an unanchored survivor reads pending, and blocks close' },

  // ════════════════════════════════════════════════════════════════════════
  // Waiver is an override (0039, OB-05)
  // ════════════════════════════════════════════════════════════════════════

  // The proposal-is-not-approval fault, at the waiver gate.
  { suite: 'obligations.test.mjs',
    name: 'a merely proposed waiver authorises the act',
    find: `    if new.override_ref is null or not exists (
      select 1 from cw.override_passes p
       where p.request_id = new.override_ref
         and p.finding_ref = 'obligation:' || new.obligation_id) then`,
    repl: `    if false then`,
    expect: 'a waiver without an approved override authorises nothing' },

  { suite: 'obligations.test.mjs',
    name: 'anybody on the deal records the waiver act',
    find: `  or (act = 'waived' and cw.app_role() in ('legal_reviewer','legal_admin'))`,
    repl: `  or (act = 'waived' and cw.app_role() is not null)`,
    expect: 'a requester cannot record the waiver act' },

  // ════════════════════════════════════════════════════════════════════════
  // The envelope record (0040, OB-12)
  // ════════════════════════════════════════════════════════════════════════

  { suite: 'signature-envelope.test.mjs',
    name: 'envelope events may arrive out of order',
    find: `  if new.seq is distinct from (
       select count(*)::int from cw.signature_envelope_event e
        where e.envelope_id = new.envelope_id) then`,
    repl: `  if false then`,
    expect: 'events arrive in sequence or not at all' },

  { suite: 'signature-envelope.test.mjs',
    name: 'a terminal envelope keeps taking events',
    find: `  if env.state <> 'sent' then
    raise exception
      'envelope % is % — a terminal envelope takes no further events',`,
    repl: `  if false then
    raise exception
      'envelope % is % — a terminal envelope takes no further events',`,
    expect: 'a terminal envelope takes no further events' },

  // The D1 shape at the new gate: without the definer trigger's move, the
  // envelope stays 'sent' forever and only a test running as the real role
  // can see it.
  { suite: 'signature-envelope.test.mjs',
    name: 'a completed envelope never moves off sent',
    find: `  if new.event in ('completed','declined','voided','expired') then`,
    repl: `  if false then`,
    expect: 'a terminal event moves the state — as a real role, not the owner' },

  { suite: 'signature-envelope.test.mjs',
    name: 'the envelope evidence becomes editable',
    find: `create trigger envelope_state_moves_by_event
  before update on cw.signature_envelope
  for each row execute function cw.envelope_state_moves_by_event();`,
    repl: `select 1;`,
    expect: 'the envelope record is evidence — no edits, no deletions' },

  { suite: 'signature-envelope.test.mjs',
    name: 'any requester opens an envelope on any deal',
    find: `create policy send_envelope on cw.signature_envelope for insert with check (
  cw.app_role() in ('legal_reviewer','legal_admin')
  or (cw.app_role() = 'requester'
      and cw.owns_agreement(signature_envelope.agreement_id)));`,
    repl: `create policy send_envelope on cw.signature_envelope for insert with check (
  cw.app_role() is not null);`,
    expect: 'a requester cannot open an envelope on another buyer’s deal' },

  // ════════════════════════════════════════════════════════════════════════
  // The waiting-on-you derivation (0041, OB-08)
  // ════════════════════════════════════════════════════════════════════════
  // A derivation that hides work is this family's whole failure mode: each
  // source a test consumes gets its own silent-drop (or silent-widen) row.

  { suite: 'obligations.test.mjs',
    name: 'due obligations vanish from the waiting list',
    find: `  where s.owner_person = p_person and s.state in ('due','overdue')`,
    repl: `  where false`,
    expect: 'the workspace panel answers for the caller alone' },

  // REPOINTED 2026-08-02: 0059 re-created cw.waiting_for and reworded this
  // line (`is not null and` joined it), so the row was patching the 0041/0044
  // text that 0059's definition then overwrote — trap 5.4a, again.
  { suite: 'obligations.test.mjs',
    name: 'the renewal window never reaches the person who owns the deal',
    find: `    and ea.term_end is not null and ea.term_end <= current_date + 90`,
    repl: `    and false`,
    expect: 'the workspace panel answers for the caller alone' },

  // Widened, not dropped — the subtler break: the ticket queue starts waiting
  // on people who hold no deciding role at all.
  { suite: 'obligations.test.mjs',
    name: 'review tickets wait on everybody, whatever their role',
    find: `  where t.state = 'pending' and p_role in ('legal_reviewer','legal_admin')`,
    repl: `  where t.state = 'pending' and p_role is not null`,
    expect: 'a role audience reaches every holder of the role' },

  // ════════════════════════════════════════════════════════════════════════
  // The outbox and the address book (0042, OB-09)
  // ════════════════════════════════════════════════════════════════════════

  { suite: 'notifications.test.mjs',
    name: 'anybody runs the notification tick',
    find: `  if cw.app_role() is distinct from 'administrator' then
    raise exception
      'the notification tick is the Administrator''s act; % holds %',`,
    repl: `  if false then
    raise exception
      'the notification tick is the Administrator''s act; % holds %',`,
    expect: 'only the administrator may run the notification tick' },

  { suite: 'notifications.test.mjs',
    name: 'anybody maintains the address book',
    find: `create policy administrator_maintains on cw.notification_address for insert
  with check (cw.app_role() = 'administrator');`,
    repl: `create policy administrator_maintains on cw.notification_address for insert
  with check (cw.app_role() is not null);
grant insert on cw.notification_address to cw_legal_admin;
grant usage, select on sequence cw.notification_address_address_id_seq to cw_legal_admin;`,
    expect: 'nobody but the administrator maintains addresses' },

  { suite: 'notifications.test.mjs',
    name: 'anybody records a send',
    find: `create policy tick_records on cw.notification_outbox for insert
  with check (cw.app_role() = 'administrator');`,
    repl: `create policy tick_records on cw.notification_outbox for insert
  with check (cw.app_role() is not null);
grant insert on cw.notification_outbox to cw_legal_admin;
grant usage, select on sequence cw.notification_outbox_outbox_id_seq to cw_legal_admin;`,
    expect: 'only the administrator records a send' },

  { suite: 'notifications.test.mjs',
    name: 'the delivery record becomes editable',
    find: `create trigger notification_outbox_frozen before update on cw.notification_outbox
  for each row execute function cw.notification_frozen();`,
    repl: `select 1;`,
    expect: 'the outbox is append-only — not even the owner edits a delivery' },

  // The gap goes quiet: the address check dropped, so every waiting person
  // reads as reachable and the silence looks like good news.
  { suite: 'notifications.test.mjs',
    name: 'an unreachable person is reported as covered',
    find: `  and not exists (select 1 from cw.notification_address a
                   where a.person = e.person and a.channel = 'email'
                     and a.removed_at is null);`,
    repl: `  and false;`,
    expect: 'a person with work waiting and no address is a visible gap' },

  // ════════════════════════════════════════════════════════════════════════
  // Review routing (0044, RP-02)
  // ════════════════════════════════════════════════════════════════════════
  // NOTE for future editors: 0044 re-creates cw.waiting_for and deliberately
  // repeats 0041's arms verbatim. The harness mutates EVERY file containing a
  // `find` string, so the 0041-era derivation guards above sabotage both
  // copies and stay honest. If either copy is ever reworded, repoint those
  // guards in the same commit — this is exactly how B10 and S110 went red.

  { suite: 'routing.test.mjs',
    name: 'the claimer becomes whoever the body claimed',
    find: `    new.person := cw.app_actor();`,
    repl: `    null;`,
    expect: 'a claim names the connection, whatever the insert claimed' },

  { suite: 'routing.test.mjs',
    name: 'two reviewers hold the same ticket at once',
    find: `create unique index ticket_claim_live
  on cw.ticket_claim (ticket_id) where released_at is null;`,
    repl: `select 1;`,
    expect: 'a race has one winner: the second claim is refused' },

  // The escalation goes quiet: the named owner is never told about work
  // nobody took, and the queue's oldest tickets wait on nobody in particular.
  // REPOINTED 2026-08-02: 0059 merged the from and where onto one line when it
  // re-created cw.waiting_for, stranding this row on the 0044 text — the same
  // trap 5.4a as the renewal-window row above, found in the same sweep.
  // REPOINTED AGAIN 2026-08-05, and by the trap's own instructions above. 0064
  // adds the notice branch to cw.waiting_for, so this arm is no longer the last
  // line of the function and lost its trailing semicolon. The `find` below drops
  // the semicolon, which makes it a substring of BOTH the 0059 line (which still
  // ends in one) and the 0064 line (which ends in `union all`) — so every copy
  // is sabotaged, which is what keeps this row honest.
  { suite: 'routing.test.mjs',
    name: 'the escalation never reaches the named owner',
    find: `  from cw.ticket_route r where r.escalated and r.category_owner = p_person`,
    repl: `  from cw.ticket_route r where false`,
    expect: 'the named owner is told about work nobody took — review_escalation reaches cw.waiting_for' },

  // ── The notice record (0064, NT-1) ────────────────────────────────────────
  // Four rows, one per rule in the migration's header. Each mutation is the
  // shape the rule exists to prevent, not a paraphrase of the rule.
  // ── The grant-without-policy sweep (2026-08-05) ──────────────────────────
  // The sweep is a LINT, so it needs proving it still bites. Putting back the
  // grant migration 0065 removed must make it fail — if it does not, the sweep
  // has become a green light nobody is behind.
  { suite: 'grants-and-policies.test.mjs',
    name: 'the inert negotiation grant comes back',
    find: `revoke select on cw.negotiation, cw.negotiation_round,
                cw.negotiation_position, cw.position_movement
  from cw_administrator;`,
    repl: `select 1;`,
    expect: 'the two historical instances stay fixed' },

  // ── The model intake's budget and ledger (0066, AI-3) ────────────────────
  { suite: 'model-intake.test.mjs',
    name: 'the ledger can be rewritten after the fact',
    find: `create trigger model_call_no_edit before update or delete on cw.model_call
  for each row execute function cw.model_call_append_only();`,
    repl: `select 1;`,
    expect: 'the model-call ledger is append-only' },

  // REPOINTED AT 0068. These two watch cw.model_calls_today(), and 0068
  // replaces the whole function, so a mutation applied to 0066's copy is
  // overwritten before any test sees it — the silent-green failure S110 and
  // B10 both were. The text below is 0068's.
  { suite: 'model-intake.test.mjs',
    name: 'the daily count is scoped to the caller and undercounts',
    find: `      where called_at >= date_trunc('day', now())
        -- A call the doorway declined to make cost nothing and must not be
        -- billed. Remove this line and a keyless deployment spends a budget it
        -- never had. A mutation row watches it.
        and outcome <> 'not_asked'),`,
    repl: `      where called_at >= date_trunc('day', now())
        and outcome <> 'not_asked'
        and actor = cw.app_actor()),`,
    expect: "the budget counts every call, not only the caller's own" },

  { suite: 'model-intake.test.mjs',
    name: 'a call the doorway never made is billed anyway',
    find: `        and outcome <> 'not_asked'),`,
    repl: `        ),`,
    expect: 'a call the doorway declined to make is recorded but not billed' },

  { suite: 'model-intake.test.mjs',
    name: "a requester reads everybody's model calls",
    find: `  or (cw.app_role() = 'requester' and model_call.actor = cw.app_actor()));`,
    repl: `  or cw.app_role() = 'requester');`,
    expect: 'a requester sees the calls their own work caused and no others' },

  // ── An append-only table cannot be emptied either (0070) ─────────────────
  // TRUNCATE fires no row triggers, so a table that refuses a delete and allows
  // a truncate has an immutability habit rather than a guarantee (0001's own
  // words). role_grant is the one chosen here because it is the authority
  // record — who holds which role — and emptying it leaves no per-row trace.
  { suite: 'grants-and-policies.test.mjs',
    name: 'the authority record can be emptied in one statement again',
    find: `create trigger role_grant_no_truncate before truncate on cw.role_grant
  execute function cw.no_truncate();`,
    repl: 'select 1;',
    expect: 'every table that guards truncate still guards it' },

  // ── The auditor's narrow door onto the chain (0065) ──────────────────────
  { suite: 'received-documents.test.mjs',
    name: 'the download door records whatever role it is told',
    find: `    cw.app_actor(), caller_role, 'human', 'received_document_read',`,
    repl: `    cw.app_actor(), null, 'human', 'received_document_read',`,
    expect: 'a recorded read names the role that made it' },

  { suite: 'notices.test.mjs',
    name: 'a notice can cite anything at all',
    find: `  if not cw.notice_subject_visible(new.subject_kind, new.subject_ref) then`,
    repl: `  if false then`,
    // REPOINTED 2026-08-05 (0067). The suite's example subject was an intake
    // question-set gap until the surface behind that subject kind was removed;
    // it is a health tile now, and this row names the test that moved with it.
    expect: 'a tile nobody has ever seen cannot be cited' },

  { suite: 'notices.test.mjs',
    name: 'anyone may notify anyone',
    find: `    if not cw.notice_is_routed(raiser_role, new.to_role, new.subject_kind) then`,
    repl: `    if false then`,
    expect: 'a pair absent from cw.notice_route is refused' },

  { suite: 'notices.test.mjs',
    name: 'naming a person walks around the route table',
    find: `         and cw.notice_is_routed(raiser_role, e.role, new.subject_kind)`,
    repl: `         and true`,
    expect: 'naming an individual is not a way around the route table' },

  { suite: 'notices.test.mjs',
    name: 'a raised notice never reaches the waiting list',
    find: `    and (n.to_person = p_person or n.to_role = p_role);`,
    repl: `    and false;`,
    expect: "an open notice is on the recipient role's waiting list" },

  { suite: 'notices.test.mjs',
    name: 'a bystander clears somebody else\'s notice',
    find: `       and (n.to_person = cw.app_actor() or n.to_role = cw.app_role())));`,
    repl: `       and true));`,
    expect: "a bystander cannot acknowledge somebody else's notice" },

  // ── The received-document store (0047, NC-07, U15) ────────────────────────
  { suite: 'received-documents.test.mjs',
    name: 'received documents editable (evidence regression)',
    find: `create trigger received_document_frozen before update on cw.received_document
  for each row execute function cw.received_document_frozen();`,
    repl: `select 1;`,
    expect: 'a received document takes no edits' },

  { suite: 'received-documents.test.mjs',
    name: 'received documents deletable',
    find: `create trigger received_document_no_delete before delete on cw.received_document
  for each row execute function cw.received_document_frozen();`,
    repl: `select 1;`,
    expect: 'a received document takes no deletions' },

  { suite: 'received-documents.test.mjs',
    name: 'the ceiling is never consulted where the bytes land',
    find: `  if octet_length(new.bytes) > ceiling then`,
    repl: `  if false then`,
    expect: 'a document over the recorded ceiling is refused with both numbers' },

  // The redaction-guard shape: a limit compared against NULL waves through.
  { suite: 'received-documents.test.mjs',
    name: 'a missing ceiling fails open',
    find: `  if ceiling is null then`,
    repl: `  if false then`,
    expect: 'a MISSING ceiling refuses rather than waving through' },

  { suite: 'received-documents.test.mjs',
    name: 'the receiver becomes whoever the body claimed',
    find: `  new.received_by := cw.app_actor();`,
    repl: `  new.received_by := coalesce(new.received_by, cw.app_actor());`,
    expect: 'the recorder is the connection, whatever the insert claimed' },

  // ── Supplier units anchored (0051, NC-18) ──
  // The same-deal shape on provenance: without it a unit can claim any
  // document in the system as its source.
  { suite: 'supplier-units.test.mjs',
    name: 'a unit may anchor to any deal’s paper',
    find: `  if t_agreement is distinct from d_agreement then`,
    repl: `  if false then`,
    expect: 'a unit anchored to another deal’s paper is refused' },

  // ── Document and counterparty evidence (0050, OB-06) ──
  // The same-deal rule dropped: any received document anywhere "proves" any
  // duty. The guard's structure survives; only the ownership test goes.
  { suite: 'obligation-evidence.test.mjs',
    name: 'evidence from any deal proves any duty',
    find: `                    where rd.document_id = new.document_ref
                      and rd.agreement_id = i.agreement_id) then`,
    repl: `                    where rd.document_id = new.document_ref) then`,
    expect: 'evidence from another deal is refused' },

  { suite: 'obligation-evidence.test.mjs',
    name: 'an acknowledgement can be a bare flag',
    find: `alter table cw.obligation_act add constraint ack_needs_document
  check (act <> 'counterparty_ack' or document_ref is not null);`,
    repl: `alter table cw.obligation_act add constraint ack_needs_document
  check (true);`,
    expect: 'an acknowledgement without a document is refused' },

  // ── The portfolio's certain count (0049, NC-16) ──
  { suite: 'portfolio.test.mjs',
    name: 'every run counts and renegotiated deals double',
    find: `                         and (r2.created_at, r2.run_id) > (r.created_at, r.run_id)))`,
    repl: `                         and false))`,
    expect: 'a renegotiated deal counts once, through its latest run' },

  { suite: 'portfolio.test.mjs',
    name: 'unresolved is folded into nothing',
    find: `where d.clause_id is null
group by d.category_key, c.label, d.severity;`,
    repl: `where false
group by d.category_key, c.label, d.severity;`,
    expect: 'an unresolved decision appears as unresolved, never as absent' },

  // ── The edit-quality threshold (0048, NC-13) ──
  // The one boundary this package converts from discipline into a check: the
  // system never chooses the number. A shipped default is exactly the breach
  // an earlier plan made once, which is why the test exists.
  { suite: 'edit-quality.test.mjs',
    name: 'the threshold ships with a number in it',
    find: `  ('edit_similarity_threshold', '', 'owner_decision', true, false,`,
    repl: `  ('edit_similarity_threshold', '0.85', 'owner_decision', true, false,`,
    expect: 'the threshold row ships with an EMPTY value and owner-decision true' },

  // ── The governed library acts (0062, D-5) ──
  // Superseding stops being an act with a gate: anybody with a connection
  // reaches it if the inner role check goes soft.
  { suite: 'governed-library-acts.test.mjs',
    name: 'anybody may supersede',
    find: `  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'superseding a clause is a legal admin''s act'`,
    repl: `  if false then
    raise exception 'superseding a clause is a legal admin''s act'`,
    expect: 'the database owner without a role cannot reach it as an act' },

  // A replacement that forgets to retire its predecessor either double-lists
  // the pair or trips the live-pair index — never silently succeeds.
  { suite: 'governed-library-acts.test.mjs',
    name: 'publishing a replacement leaves the old ladder live',
    find: `  if old_id is not null then
    update cw.ladder
       set retired_on = current_date, retired_reason = p_reason
     where ladder_id = old_id;
  end if;`,
    repl: ``,
    expect: 'publishing again replaces: the old ladder retires, readable forever' },

  // The floor move goes back to leaving no trace — the exact gap 0062 closed.
  { suite: 'governed-library-acts.test.mjs',
    name: 'the floor moves silently again',
    find: `  when (new.is_floor and not old.is_floor)`,
    repl: `  when (false)`,
    expect: 'moving the floor is recorded on the chain' },

  // A new concession judged against a RETIRED ladder's floor: the one-word
  // filter that keeps the authority lookup on the live path.
  { suite: 'governed-library-acts.test.mjs',
    name: 'a concession is judged against a retired ladder',
    find: `  where l.category_key = new.category_key
    and l.severity = sev
    and l.retired_on is null`,
    repl: `  where l.category_key = new.category_key
    and l.severity = sev`,
    expect: 'a new concession is judged against the live ladder, not the retired one' },

  // ── The acting library shell (D-5) ──
  // The irreversible acts keep their preview step; losing a confirm testid is
  // the act getting cheaper, which the allow-list test names.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'superseding loses its confirmation step',
    find: `                    data-testid="confirm-supersede"`,
    repl: ``,
    expect: 'the library offers no way to edit approved wording' },

  // Destruction one click cheaper: the typed-id gate is what the health-pane
  // test hangs on.
  // ── The obligations surfaces (OB-11/OB-15) ──
  // A duty with no due date yet silently disappears from the calendar.
  { target: 'shell', suite: 'shell.test.mjs',
    name: 'the unanchored duty vanishes from the calendar',
    find: `            <div className="panel p-3 mb-3" data-testid="calendar-unanchored">`,
    repl: `            <div className="panel p-3 mb-3">`,
    expect: 'the obligations pane shows the whole book, including what has no date' },

  { target: 'shell', suite: 'shell.test.mjs',
    name: 'destruction stops demanding the record\'s own id',
    find: '                 data-testid={`type-to-${verb}`} />',
    repl: ' />',
    expect: 'the nudge notifies and cannot destroy' },
];

const files = readdirSync(SRC).filter(f => f.endsWith('.sql')).sort();
const originals = Object.fromEntries(files.map(f => [f, readFileSync(join(SRC, f), 'utf8')]));

// `imprecise` is kept separate from `missed` and is also fatal. A mutation that
// makes *some* test fail proves the suite noticed something; it does not prove
// the named guarantee is guarded. Scoring those as caught let a check look like
// protection while the test it names was never exercised.
let caught = 0, missed = [], imprecise = [];

// Mutations run CONCURRENTLY. Each one is fully independent — its own temp
// directory of mutated SQL, its own node process, its own in-memory database —
// so running them one at a time bought nothing but wall-clock. Sequentially this
// harness outgrew a ten-minute timeout; the work is spawn-and-wait, not CPU, so
// it parallelises almost linearly.
//
// Output is still printed in MUTATIONS order regardless of finish order, because
// a mutation report that reshuffles itself run to run is much harder to diff.
const LANES = Math.max(2, Math.min(MUTATIONS.length, (cpus().length || 4) - 1));
console.log(`mutation check — each row must FAIL the suite via its named test`);
console.log(`${MUTATIONS.length} mutations, ${LANES} at a time\n`);

const runOne = (m) => new Promise((resolve) => {
  // A mutation targets either the migrations or the service. The service half
  // arrived with WP-U05: the pool-bleed guard, the per-request role resolution
  // and the no-privileged-path rule are all JavaScript, and a harness that
  // could only reach SQL would leave the most dangerous protections in the
  // system as tests nobody had ever seen fail.
  if (m.target === 'service') return resolve(runServiceMutation(m));
  if (m.target === 'shell')   return resolve(runShellMutation(m));

  const dir = mkdtempSync(join(tmpdir(), 'cw-mut-'));
  let applied = false;
  for (const f of files) {
    let sql = originals[f];
    // The replacement goes in as a function, not a string. String.replace treats
    // `$$` in a replacement as an escape for a single `$`, which silently
    // mangles every dollar-quoted function body it touches — the mutated SQL
    // then fails to parse and the harness reports IMPRECISE for a mutation that
    // was never actually applied. Found the hard way in WP-03.
    if (sql.includes(m.find)) { sql = sql.replace(m.find, () => m.repl); applied = true; }
    writeFileSync(join(dir, f), sql);
  }
  if (!applied) return resolve({ m, verdict: 'skip' });

  execFile(process.execPath, [join(HERE, m.suite || 'registry.test.mjs')],
    { env: { ...process.env, CW_MIGRATIONS: dir }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      if (!err) return resolve({ m, verdict: 'miss' });
      resolve({ m, verdict: out.includes(`FAIL ${m.expect}`) ? 'ok' : 'imprecise' });
    });
});

// The service half of the harness. Same contract as the SQL half — break one
// guarantee, assert the suite fails via the test that names it — but it copies
// backend/service/*.mjs into a temp directory and points CW_SERVICE at it.
const SERVICE_SRC = join(HERE, '..', '..', 'service');

// SURVIVES THE DIRECTORY BEING GONE, and reports rather than crashes.
//
// WP-P5 deletes backend/service/. Before this guard, that deletion took the
// WHOLE harness down at import: readdirSync threw ENOENT before a single
// mutation ran, so all 197 checks — including the 139 over the migrations,
// which have nothing to do with the service — died together. A harness that
// cannot start is a harness that proves nothing, and the failure looked like a
// broken test file rather than a missing dependency.
//
// With the guard, the 17 service mutations report SKIP, which is already fatal
// (see the bottom of this file). That is the correct outcome and it is
// deliberate: SKIP means "this check is stale, repoint it", and these 17 guard
// properties the Python doorway must hold just as the JavaScript service did —
// identity bound per request, no privileged connection at sign-in, refusals
// classified by SQLSTATE rather than by message text, scoping in the database
// rather than the API, a write attributed to nobody but the signed-in person,
// and a refusal never retried.
//
// So deleting the service does not quietly drop them. It turns the harness red
// until somebody either re-proves them against the doorway or removes each entry
// with its reason written down. Going green by deletion is the one outcome this
// arrangement will not allow.
const serviceFiles = existsSync(SERVICE_SRC)
  ? readdirSync(SERVICE_SRC).filter(f => f.endsWith('.mjs')) : [];
const serviceOriginals = Object.fromEntries(
  serviceFiles.map(f => [f, readFileSync(join(SERVICE_SRC, f), 'utf8')]));

// The mutated copies live INSIDE backend/, not in the system temp directory.
// They have to: the service imports '@electric-sql/pglite', and Node resolves a
// bare specifier by walking up from the importing file looking for node_modules.
// From C:\…\Temp\ that walk finds nothing, so every service mutation failed to
// import at all — the suite crashed instead of failing a test, and all nine were
// reported IMPRECISE, "the named test is unproven", for tests that were fine.
// Under backend/ the walk finds backend/node_modules on the first step.
const MUT_ROOT = join(HERE, '..', '..', '.mutation-service');

// The shell's files, for `target: 'shell'`. Same idea again: WP-U07's
// guarantees — the tab sets, the empty states, the no-canned-data rule — live in
// JSX that neither of the other two harness modes can reach.
const SHELL_SRC = join(HERE, '..', '..', '..', 'prototype', 'v4', 'app');
const shellFiles = existsSync(SHELL_SRC)
  ? readdirSync(SHELL_SRC).filter(f => f.endsWith('.jsx') || f.endsWith('.css')) : [];
const shellOriginals = Object.fromEntries(
  shellFiles.map(f => [f, readFileSync(join(SHELL_SRC, f), 'utf8')]));

const runShellMutation = (m) => new Promise((resolve) => {
  mkdirSync(MUT_ROOT, { recursive: true });
  const dir = mkdtempSync(join(MUT_ROOT, 'shell-'));
  let applied = false;
  for (const f of shellFiles) {
    let src = shellOriginals[f];
    if (src.includes(m.find)) { src = src.replace(m.find, () => m.repl); applied = true; }
    writeFileSync(join(dir, f), src);
  }
  const done = (verdict) => { rmSync(dir, { recursive: true, force: true }); resolve({ m, verdict }); };
  if (!applied) return done('skip');

  execFile(process.execPath, [join(HERE, m.suite || 'shell.test.mjs')],
    { env: { ...process.env, CW_SHELL: dir }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      if (!err) return done('miss');
      done(out.includes(`FAIL ${m.expect}`) ? 'ok' : 'imprecise');
    });
});

const runServiceMutation = (m) => new Promise((resolve) => {
  mkdirSync(MUT_ROOT, { recursive: true });
  const dir = mkdtempSync(join(MUT_ROOT, 'svc-'));
  let applied = false;
  for (const f of serviceFiles) {
    let src = serviceOriginals[f];
    if (src.includes(m.find)) { src = src.replace(m.find, () => m.repl); applied = true; }
    writeFileSync(join(dir, f), src);
  }
  const done = (verdict) => { rmSync(dir, { recursive: true, force: true }); resolve({ m, verdict }); };
  if (!applied) return done('skip');

  execFile(process.execPath, [join(HERE, m.suite || 'service.test.mjs')],
    { env: { ...process.env, CW_SERVICE: dir }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      if (!err) return done('miss');
      done(out.includes(`FAIL ${m.expect}`) ? 'ok' : 'imprecise');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// PREFLIGHT — refuse to run rather than produce a count that can be misread
// ════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS, and it is a near-miss rather than a bug. A scripted edit
// rewrote 0001_foundation.sql with CRLF line endings. Nothing broke — Postgres
// does not care and all 23 suites stayed green — but every multi-line `find`
// here is written with `\n`, so none of them matched that file any more.
//
// Exactly ONE check reported SKIP, because the other multi-line pattern keyed on
// 0001 also appears word-for-word in 0021 and matched there. The report read
// `197/198` with a single SKIP line. Against `198/198` that is nearly invisible,
// and it meant a protection had quietly stopped being watched.
//
// SKIP was already fatal, so the harness was technically correct. It was still
// the wrong shape: it produced a reassuring number and buried the one line that
// mattered. **The count at the bottom of a report is the least informative line
// in it.** So the fix is not a louder warning — it is refusing to produce a
// count at all when any pattern is stale. There is nothing to misread if nothing
// runs. (The idea is the Python session's, from `doorway/mutation_check.py`.)
//
// TWO INVARIANTS, and the second is the subtler one:
//
//   1. Every `find` must appear in at least one source file. Absent means stale.
//   2. It must appear AT MOST ONCE PER FILE. `String.replace` rewrites the first
//      occurrence only, so a pattern matching twice in one file mutates one of
//      them and may not be the one the check is named for — a check reading as
//      protection while watching the wrong thing.
//
// Note what is deliberately ALLOWED: the same pattern in SEVERAL files. That is
// load-bearing here. When a later migration redefines a function, the mutation
// must land in every copy or the last definition to run silently undoes it —
// trap 5.4a, which cost two guarantees earlier the same day.
const sourcesFor = (m) =>
  m.target === 'service' ? serviceOriginals
  : m.target === 'shell' ? shellOriginals
  : originals;

const countIn = (haystack, needle) => {
  let n = 0, i = 0;
  for (;;) {
    const at = haystack.indexOf(needle, i);
    if (at === -1) return n;
    n++; i = at + needle.length;
  }
};

const stale = [];
for (const m of MUTATIONS) {
  const src = sourcesFor(m);
  const where = Object.entries(src)
    .map(([f, text]) => [f, countIn(text, m.find)])
    .filter(([, n]) => n > 0);

  if (where.length === 0) {
    stale.push(`${m.name}\n      pattern not found in any ${m.target || 'migration'} source — ` +
               `the code moved or was reworded; repoint it, do not delete it`);
    continue;
  }
  const doubled = where.filter(([, n]) => n > 1);
  if (doubled.length) {
    stale.push(`${m.name}\n      pattern appears ${doubled[0][1]}× in ${doubled[0][0]} — ` +
               `only the first would be mutated, so this check may be watching ` +
               `the wrong one; make the pattern unique within the file`);
  }
  if (m.suite && !existsSync(join(HERE, m.suite))) {
    stale.push(`${m.name}\n      names a suite that does not exist: ${m.suite}`);
  }
}

if (stale.length) {
  console.log(`\nPREFLIGHT FAILED — ${stale.length} stale check(s). Nothing was run.\n`);
  for (const s of stale) console.log('  · ' + s);
  console.log(
    `\nNo mutations executed, and that is deliberate: a partial run reports a\n` +
    `number, and a number next to a skipped line reads as success. Fix the\n` +
    `patterns above and run again.\n`);
  process.exit(1);
}

const results = new Array(MUTATIONS.length);
let next = 0;
await Promise.all(Array.from({ length: LANES }, async () => {
  for (let i = next++; i < MUTATIONS.length; i = next++) {
    results[i] = await runOne(MUTATIONS[i]);
  }
}));

for (const { m, verdict } of results) {
  if (verdict === 'ok') { caught++; console.log(`  ok    ${m.name}`); }
  else if (verdict === 'skip') {
    missed.push(`${m.name} — mutation string not found in any migration (stale check)`);
    console.log(`  SKIP  ${m.name}  ← pattern not found, check is stale`);
  } else if (verdict === 'imprecise') {
    imprecise.push(`${m.name} — suite failed, but not via "${m.expect}"`);
    console.log(`  IMPRECISE  ${m.name}  ← wrong test caught it; the named one is unproven`);
  } else {
    missed.push(`${m.name} — suite still passed; nothing guards this`);
    console.log(`  MISS  ${m.name}  ← suite passed with the guarantee broken`);
  }
}

console.log(`\n${caught}/${MUTATIONS.length} mutations caught by their named test`);
if (missed.length) {
  console.log('\nunguarded:');
  for (const x of missed) console.log('  · ' + x);
}
if (imprecise.length) {
  console.log('\nimprecise — the mutation must name the test that actually catches it:');
  for (const x of imprecise) console.log('  · ' + x);
}
if (missed.length || imprecise.length) process.exit(1);
