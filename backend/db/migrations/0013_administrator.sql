-- 0013 · The Administrator: a sixth role that runs the machine.
--
-- Owner decisions U5–U8, settled 2026-07-26 (docs/open-questions.md, memory.md).
-- This file lands in parts as the work packages close:
--
--   part 1  WP-U01 · the cw_administrator role and cw.account   ← this commit
--   part 2  WP-U02 · cw.role_grant and the countersign rule
--   part 3  WP-U03 · the settings split and the watcher lists
--   part 4  WP-U04 · checkpoint duty moves, and health evidence
--
-- WHY A SIXTH ROLE AT ALL. Settled decision U3 says the database owner maps to
-- no application role — "the owner is nobody" — so that every governed act has
-- a name on it. That rule is right and it left a real job with no chair:
-- somebody has to create accounts, grant and revoke access, keep the
-- operational settings, and watch the health of the record. Done as the owner,
-- those acts have no name. Done as legal_admin, machine housekeeping gets mixed
-- into contract judgement. So the job gets its own named, recorded role.
--
-- WHAT THIS ROLE IS, SAID ACCURATELY. Decision U5 as the owner settled it:
--
--     The Administrator runs the machine and can never CHANGE what the machine
--     holds. It may READ contract content.
--
-- The proposal originally made the role content-blind. The owner relaxed the
-- read half so that whoever supports the system can see the thing being
-- complained about. The boundary that is kept — and that the tests below
-- enforce — is WRITE and JUDGEMENT: this role holds no insert, update or delete
-- on any content table, and no execute on any function that decides a ticket,
-- an override, a concession, or an owner decision.
--
-- Describe the role as CONTENT-VISIBLE AND CONTENT-POWERLESS. Not
-- content-blind: it reads. A comment, document or screen claiming otherwise is
-- the exact failure class the 2026-07-25 review catalogued eighteen of.
--
-- The accepted cost is written down rather than buried: the person who
-- administers accounts can read every deal, manifest, negotiation position and
-- supplier redline in this database, and reads are not individually recorded,
-- because the audit log records acts and not glances. See open-questions U5.

-- ════════════════════════════════════════════════════════════════════════════
-- PART 1 · THE ROLE (WP-U01)
-- ════════════════════════════════════════════════════════════════════════════
-- Created the same way the five in 0001 were, and for the same reason: a real
-- Postgres role, so that table-level GRANT/REVOKE is a second line of defence
-- underneath row-level security. A role holding no INSERT privilege cannot
-- insert even if a policy is wrong.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cw_administrator') then
    -- nologin, like the five. Nobody connects AS this role directly; the
    -- service layer (WP-U05) sets it per request against a named account.
    create role cw_administrator nologin;
  end if;
end $$;

comment on schema cw is
  'Clausewerk. Six application roles: viewer, requester, legal_reviewer, '
  'legal_admin, auditor, administrator. The database owner maps to none of '
  'them (settled decision U3).';

grant usage on schema cw to cw_administrator;

-- ── The role accessor learns a sixth answer ─────────────────────────────────
-- Rewritten wholesale rather than patched, because a reader needs to see the
-- whole mapping in one place. Everything 0001 established still holds:
-- current_user and not session_user, because `set role` is what binds; not
-- pg_has_role(), because a superuser is implicitly a member of every role and
-- that would hand the owner legal_admin, the opposite of U3.
--
-- ONE CONSEQUENCE WORTH STATING OUT LOUD, because it is easy to miss and it is
-- load-bearing. A dozen read policies in this schema are written
-- `using (cw.app_role() is not null)` — "anyone who is anybody may read this".
-- Adding a sixth answer here therefore opens those policies to the
-- administrator by itself, with no policy change anywhere. That is exactly what
-- decision U5 asked for, so it is correct here — but it would have been a
-- silent content grant under the original content-blind design.
--
-- It is safe on the write side, and this was verified rather than assumed
-- before the role was added: NO insert, update or delete policy anywhere in
-- migrations 0001–0012 is phrased `app_role() is not null`. Every write policy
-- names its roles explicitly, and none of them names the administrator. The
-- write boundary is therefore default-deny and stays that way; the test suite
-- proves it table by table rather than sampling.
create or replace function cw.app_role() returns text
language sql stable as $$
  select case current_user
    when 'cw_viewer'         then 'viewer'
    when 'cw_requester'      then 'requester'
    when 'cw_legal_reviewer' then 'legal_reviewer'
    when 'cw_legal_admin'    then 'legal_admin'
    when 'cw_auditor'        then 'auditor'
    when 'cw_administrator'  then 'administrator'
  end
$$;

comment on function cw.app_role() is
  'The acting application role, derived from the connection''s real database '
  'role. Six answers plus null; the owner is null (settled decision U3).';

-- ── cw.account · the system knows its people by name ───────────────────────
-- The ADR-0008 residual, being paid down. Until now the actor on an audit row
-- was a self-asserted string: cw.app_actor() reads a session setting, and
-- nothing checked that the name belonged to anybody. The five roles are shared
-- service roles, so "who did this" was answerable only as far as "somebody
-- connected as a legal reviewer".
--
-- This table is the other half. One row per named person, holding exactly ONE
-- role. The service layer signs a person in against this table and binds their
-- connection to the role recorded for them, so the actor on the audit row is a
-- person the system knows.
--
-- ONE PERSON, ONE ROLE — and deliberately not a person-to-roles join table
-- "for later". A second role is a revoke and a grant, both recorded, both
-- visible in the access history. A many-roles model would let somebody hold
-- legal_reviewer and administrator at once, which is precisely the combination
-- the countersign rule (part 2) exists to prevent.
create table cw.account (
  person       text primary key,
  display_name text not null,
  unit         text,
  -- The single role this person holds. Note this column is the DECLARED role;
  -- what the person may actually do is decided by cw.effective_role in part 2,
  -- which additionally requires a countersigned grant for the Legal roles. The
  -- two are kept separate on purpose: this column is administrative record,
  -- that view is the authority.
  role         text not null check (role in
                 ('viewer','requester','legal_reviewer','legal_admin',
                  'auditor','administrator')),
  state        text not null default 'active' check (state in ('active','revoked')),
  created_by   text not null,
  created_at   timestamptz not null default now(),
  revoked_by   text,
  revoked_at   timestamptz,
  -- Marks the two accounts the bootstrap ceremony creates. Kept as a column
  -- rather than inferred from being first, because "first two rows" stops being
  -- true the moment anybody deletes anything, and because the audit rows for
  -- these acts must be findable as bootstrap acts forever.
  is_bootstrap boolean not null default false,
  constraint revoked_names_a_person_and_a_time check (
    (state = 'revoked') = (revoked_by is not null and revoked_at is not null)),
  constraint a_person_is_not_blank check (
    length(btrim(person)) > 0 and length(btrim(display_name)) > 0)
);

comment on table cw.account is
  'One row per named person, holding exactly one role. Replaces the '
  'self-asserted actor name: the actor on an audit row should be somebody the '
  'system knows. A second role is a revoke and a grant, never a second row.';

-- History is not edited here either. An account is created once and revoked
-- once; the display name and unit may be corrected, and the role may be moved,
-- but the person, who created them and when are settled facts.
--
-- Deliberately NOT a blanket no-update trigger: unlike cw.clause_version, an
-- account is a living administrative record — people change unit and change
-- role. What must not change is the identity and the provenance of the row.
create or replace function cw.account_provenance_immutable() returns trigger
language plpgsql as $$
begin
  if new.person is distinct from old.person then
    raise exception 'the person on an account is its identity and cannot be changed; '
      'revoke this account and create the correct one';
  end if;
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'who created an account, and when, are settled facts';
  end if;
  if old.is_bootstrap is distinct from new.is_bootstrap then
    raise exception 'the bootstrap marking is a fact about how this account came '
      'to exist and cannot be added or removed later';
  end if;
  -- Un-revoking would erase a revocation from the record. Bringing somebody
  -- back is a new grant, recorded (part 2).
  if old.state = 'revoked' and new.state <> 'revoked' then
    raise exception 'a revoked account is not un-revoked; grant the role again '
      'so that the return is on the record too';
  end if;
  return new;
end $$;

create trigger account_provenance_immutable
  before update on cw.account
  for each row execute function cw.account_provenance_immutable();

create or replace function cw.account_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'accounts are revoked, never deleted — the record of who had '
    'access is part of the access history';
end $$;

create trigger account_no_delete
  before delete on cw.account
  for each row execute function cw.account_no_delete();

-- Audit: account_created, and the revocation of the account itself. (The
-- revocation of a ROLE is a separate event in part 2; an account revocation is
-- the stronger act — the person is gone, not merely re-roled.)
create or replace function cw.audit_account() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('account_created', new.person,
      jsonb_build_object('role', new.role, 'unit', new.unit,
                         'display_name', new.display_name,
                         'bootstrap', new.is_bootstrap),
      -- A bootstrap account is created by the owner before any administrator
      -- exists, so there is no human application role on that connection. It is
      -- recorded as a 'system' act with the owner named as the actor, rather
      -- than as a human act by a role that was not held.
      case when new.is_bootstrap then 'system' else 'human' end);
  elsif tg_op = 'UPDATE' and old.state = 'active' and new.state = 'revoked' then
    perform cw.audit('account_revoked', new.person,
      jsonb_build_object('role', new.role, 'revoked_by', new.revoked_by));
  elsif tg_op = 'UPDATE' and old.role is distinct from new.role then
    perform cw.audit('account_role_moved', new.person,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end $$;

create trigger audit_account
  after insert or update on cw.account
  for each row execute function cw.audit_account();

-- ── Who may read and write the accounts table ──────────────────────────────
alter table cw.account enable row level security;

-- Everyone who is anybody may see who holds what. Access is not a secret: a
-- requester needs to know which attorney to name, and hiding the list would
-- make the "shared accounts: 0" goal unverifiable by anyone but the
-- administrator. The list carries no contract content.
create policy read_all on cw.account for select
  using (cw.app_role() is not null);

-- Creating and maintaining accounts is the administrator's job and nobody
-- else's. legal_admin is deliberately excluded: keeping the list of people is
-- machine stewardship, and mixing it into the content role is what the sixth
-- role exists to stop.
create policy administrator_creates on cw.account for insert
  with check (cw.app_role() = 'administrator');
create policy administrator_maintains on cw.account for update
  using (cw.app_role() = 'administrator')
  with check (cw.app_role() = 'administrator');

revoke all on cw.account from public;
grant select on cw.account to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;
grant insert, update on cw.account to cw_administrator;
-- No delete grant for anyone, matching the trigger above. Two layers.

-- ── The administrator's own working surface ────────────────────────────────
-- The audit log: insert and select, exactly like the other acting roles. No
-- update, no delete — nobody edits history, and that has never had an
-- exception.
grant insert, select on cw.audit_event to cw_administrator;
grant usage, select on sequence cw.audit_event_seq_seq to cw_administrator;
grant execute on function cw.audit_verify() to cw_administrator;
grant execute on function cw.audit_anchor_check() to cw_administrator;

-- The grant above is necessary and not sufficient: 0007's `audit_append` policy
-- enumerates the three roles that could append when it was written, and a role
-- absent from it is refused by row-level security however many table
-- privileges it holds. Without this policy every audited administrator act —
-- creating an account, granting a role, changing a setting — fails with "new
-- row violates row-level security policy" and the whole console is dead on
-- arrival.
--
-- Permissive, so it is OR'd with `audit_append` and adds a sixth appender
-- without touching the existing rule. 0007's RESTRICTIVE
-- `audit_attribution_bound` still applies underneath and is ANDed: an
-- administrator's rows must carry actor_role = 'administrator' and cannot claim
-- legal_admin any more than a reviewer could.
create policy audit_append_administrator on cw.audit_event for insert
  with check (cw.app_role() = 'administrator');

-- ════════════════════════════════════════════════════════════════════════════
-- CONTENT: READ YES, WRITE NEVER (decision U5)
-- ════════════════════════════════════════════════════════════════════════════
-- The full list, table by table, in one reviewable block. This is the surface
-- decision U5 opened, and it is written out explicitly rather than granted with
-- `all tables in schema` so that a reader can see exactly what a person holding
-- this role can see, and so that a table added by a later migration does NOT
-- silently become administrator-readable.
--
-- Only SELECT appears below. There is no insert, update or delete on any of
-- these tables anywhere in this file, and the test suite walks the whole list
-- attempting each write as a real cw_administrator connection.
grant select on
  cw.category, cw.clause, cw.clause_version, cw.supersession,
  cw.agreement, cw.ladder, cw.ladder_rung, cw.concession,
  cw.clause_tag, cw.conflict_rule,
  cw.snapshot, cw.snapshot_member, cw.snapshot_ladder_rung,
  cw.ruleset, cw.ruleset_member,
  cw.run, cw.run_decision, cw.run_finding,
  cw.executed_agreement, cw.executed_document,
  cw.signature_certificate, cw.executed_signatory,
  cw.clause_draft, cw.review_ticket, cw.review_segment, cw.review_candidate,
  cw.agreement_attorney, cw.required_approver,
  cw.concession_approval, cw.concession_settlement, cw.concession_withdrawal,
  cw.legal_hold, cw.agreement_retention,
  cw.negotiation, cw.negotiation_round, cw.negotiation_position,
  cw.position_movement,
  cw.sow_override, cw.sow_override_approval, cw.sow_override_settlement
to cw_administrator;

-- Row-level security has to agree with the grant, and for most of these tables
-- it already does: a read policy phrased `app_role() is not null` admits the
-- administrator the moment the accessor above learned its sixth answer.
--
-- These are the ones that do not, because they enumerate their readers. A
-- separate additive policy per table, rather than editing the existing ones:
-- permissive policies are OR'd, so this reads as a clean list of "and the
-- administrator may also read this" without disturbing a single existing rule
-- or the mutation checks that guard them.
create policy administrator_reads on cw.agreement for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.concession for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.run for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.executed_agreement for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.executed_document for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.signature_certificate for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.executed_signatory for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.clause_draft for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.review_ticket for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.agreement_attorney for select
  using (cw.app_role() = 'administrator');
create policy administrator_reads on cw.audit_event for select
  using (cw.app_role() = 'administrator');

-- Helper the scoped read policies call. Harmless for this role — it answers a
-- question about ownership, and the administrator owns no agreements — but it
-- is granted because cw.run's and cw.review_ticket's policies invoke it during
-- evaluation and a missing execute privilege there is an error, not a refusal.
grant execute on function cw.owns_agreement(text) to cw_administrator;
grant execute on function cw.agreement_under_hold(text) to cw_administrator;

-- ════════════════════════════════════════════════════════════════════════════
-- THE BOOTSTRAP CEREMONY
-- ════════════════════════════════════════════════════════════════════════════
-- A chicken-and-egg problem with an honest answer. Only an administrator may
-- create an account, and there is no administrator until somebody creates one.
-- The owner has to make the first two — the first Administrator, and the first
-- Legal admin who will countersign that administrator's Legal grants — before
-- the rule "the owner does nothing" can hold at all.
--
-- WHY THIS IS NOT A BACKDOOR, which is the thing that matters. A bootstrap path
-- that stays callable after first run is a standing owner-powered way to mint
-- roles, and it would be worth more to an attacker than any of the controls
-- above. Three properties close it:
--
--   1. It refuses when ANY account already exists. Not a flag that could be
--      reset — the precondition is the state of the accounts table itself, and
--      cw.account has no delete grant and a trigger refusing deletion, so the
--      table cannot be emptied back to a bootstrappable state by any
--      application role.
--   2. It refuses any caller holding an application role. The owner performs
--      this ceremony, and only the owner: an administrator cannot re-run it to
--      mint a second Legal admin, and this is checked rather than assumed
--      because the accounts-empty test alone would pass on a fresh install.
--   3. It is not SECURITY DEFINER and is granted to nobody. Invoker's rights,
--      no execute privilege for any of the six roles, so the only caller who can
--      reach it is one who already bypasses row-level security anyway. It hands
--      out no authority its caller did not already have — it exists to make the
--      ceremony recorded and repeatable, not to elevate.
--
-- Both acts land on the hash chain marked as bootstrap, with actor_kind
-- 'system' and the owner's stated name as the actor: at that moment there is no
-- application role on the connection, and recording the acts as human ones
-- under a role nobody held would be a lie in the permanent record.
create or replace function cw.bootstrap(
  p_by                 text,   -- the human running the ceremony, for the record
  p_administrator      text,   -- the first Administrator's identifier
  p_administrator_name text,
  p_legal_admin        text,   -- the first Legal admin's identifier
  p_legal_admin_name   text,
  p_unit               text default null
) returns void
language plpgsql as $$
declare existing bigint;
begin
  if p_by is null or length(btrim(p_by)) = 0 then
    raise exception 'the bootstrap ceremony records who performed it; name yourself'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Property 2, checked first and deliberately: on a fresh install the
  -- accounts-empty check below would pass for an administrator too, so testing
  -- emptiness alone would leave the caller unchecked exactly when it matters.
  if cw.app_role() is not null then
    raise exception 'the bootstrap ceremony is the owner''s one act; a connection '
      'holding the % role cannot perform it', cw.app_role()
      using errcode = 'insufficient_privilege';
  end if;

  -- Property 1. The ceremony is over the moment it has happened once.
  select count(*) into existing from cw.account;
  if existing > 0 then
    raise exception 'the bootstrap ceremony has already been performed — % account(s) '
      'exist. Further accounts are created by an Administrator, and a lost '
      'Administrator is recovered by granting the role to somebody who remains, '
      'which is itself recorded', existing
      using errcode = 'restrict_violation';
  end if;

  if p_administrator = p_legal_admin then
    raise exception 'the first Administrator and the first Legal admin must be two '
      'different people, or the countersign rule is satisfied by one person from '
      'the moment the system starts'
      using errcode = 'check_violation';
  end if;

  -- Name the actor for the audit trigger. There is no application role to
  -- report, so cw.app_role() records null — the truthful answer under U3.
  perform set_config('cw.actor', p_by, true);

  insert into cw.account (person, display_name, unit, role, created_by, is_bootstrap)
  values (p_administrator, p_administrator_name, p_unit, 'administrator', p_by, true),
         (p_legal_admin,   p_legal_admin_name,   p_unit, 'legal_admin',   p_by, true);

  perform cw.audit('bootstrap_performed', p_by,
    jsonb_build_object('administrator', p_administrator,
                       'legal_admin', p_legal_admin), 'system');
end $$;

comment on function cw.bootstrap(text,text,text,text,text,text) is
  'Run once, by the owner, to create the first Administrator and first Legal '
  'admin. Refuses if any account exists, and refuses any caller holding an '
  'application role. Both acts are recorded on the chain as bootstrap acts.';

-- Granted to nobody. The revoke is the point: no application role can reach
-- this function, so it is not a path anyone can walk after installation.
revoke all on function cw.bootstrap(text,text,text,text,text,text) from public;

-- WHAT IS DELIBERATELY NOT GRANTED, and would each be a critical fault:
--
--   cw.audit_checkpoint_take()   — arrives in part 4, when decision U7 moves
--                                  the duty here and revokes it from legal_admin.
--   cw.retention_destroy()       — destruction stays legal_admin's recorded act.
--                                  The administrator sees what is due and nudges.
--   update on cw.governance_setting — owner decisions are legal_admin's. Part 3
--                                  adds the operational rows and splits the
--                                  write policy by kind.
--   anything on the review queue, negotiations, concessions or overrides beyond
--   select — deciding is judgement, and this role holds none.
