// Mutation check: prove the registry tests can actually fail.
//
// A suite that passes on the first run tells you nothing until you have seen it
// fail for the right reason. This deliberately breaks one guarantee at a time
// and asserts the suite catches it.
//
//   node db/test/mutation-check.mjs

import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
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
  { suite: 'roles.test.mjs',
    name: 'identity is claimed in a session variable again (finding D3 regression)',
    find: `  select case current_user
    when 'cw_viewer'         then 'viewer'
    when 'cw_requester'      then 'requester'
    when 'cw_legal_reviewer' then 'legal_reviewer'
    when 'cw_legal_admin'    then 'legal_admin'
    when 'cw_auditor'        then 'auditor'
  end`,
    repl: `  select nullif(current_setting('cw.role', true), '')`,
    expect: 'a legal reviewer cannot become legal_admin by setting cw.role' },

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
    find: `    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);`,
    repl: `    perform 1;`,
    expect: 'the signed document cannot be edited — not by anyone' },

  { suite: 'executed.test.mjs',
    // Repointed: the delete guard used to be `do instead nothing`, which was
    // removed under settled decision S0-3 because a silent no-op hides
    // application bugs. It is now a trigger that raises, so the old `find`
    // string no longer exists anywhere.
    name: 'signed documents can be deleted',
    find: `    execute format('create trigger %I_no_delete before delete on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);`,
    repl: `    perform 1;`,
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
  { suite: 'review-queue.test.mjs',
    name: 'the caller may supply their own edited_before_approval',
    find: `  if new.state = 'verified' then
    new.edited_before_approval := (new.approved_text is distinct from new.proposed_text);
  else
    new.edited_before_approval := null;
  end if;`,
    repl: `  if new.state <> 'verified' then
    new.edited_before_approval := null;
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
    find: '  if cw.agreement_under_hold(p_agreement_id) then',
    repl: '  if false then',
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
  { suite: 'negotiation.test.mjs',
    name: 'the executed-agreement baseline is not actually built',
    find: `  if chosen = 'executed_agreement' then`,
    repl: '  if false then',
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
