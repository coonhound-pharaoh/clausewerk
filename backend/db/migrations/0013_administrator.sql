-- 0013 · The Administrator: a sixth role that runs the machine.
--
-- Owner decisions U5–U8, settled 2026-07-26 (docs/open-questions.md, memory.md).
-- This file lands in parts as the work packages close:
--
--   part 1  WP-U01 · the cw_administrator role and cw.account
--   part 2  WP-U02 · cw.role_grant and the countersign rule
--   part 3  WP-U03 · the settings split and the watcher lists
--   part 4  WP-U04 · checkpoint duty moves, and health evidence ← this commit
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

create or replace function cw.bind_account_actor() returns trigger
language plpgsql as $$
begin
  -- Application account history names the authenticated Administrator.
  -- Owner-authored bootstrap and historical imports have no application role.
  if cw.app_role() is not null then
    if tg_op = 'INSERT' then
      new.created_by := cw.app_actor();
    elsif old.state = 'active' and new.state = 'revoked' then
      new.revoked_by := cw.app_actor();
    end if;
  end if;
  return new;
end $$;

create trigger account_bind_actor
  before insert or update on cw.account
  for each row execute function cw.bind_account_actor();

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
-- The function itself is defined in PART 2 of this file, after cw.role_grant
-- exists, because the ceremony writes two role grants as well as two accounts.
--
-- It was defined here in WP-U01 and MOVED in WP-U02 rather than being redefined
-- a second time further down. 0007 states the rule: a fix that replaces existing
-- logic is edited in place, because leaving the superseded version sitting above
-- it is a trap for the next reader.
--
-- It was a trap for the mutation harness too, which is how this was caught. Two
-- definitions of cw.bootstrap() in one file meant every mutation aimed at the
-- ceremony hit the dead copy, the live copy replaced it, and two real guarantees
-- were reported as unguarded. Same shape as the D3 entry repointed in the same
-- work: a mutation must key on the definition that survives all migrations.

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

-- ════════════════════════════════════════════════════════════════════════════
-- PART 2 · GRANTS, AND THE COUNTERSIGN RULE (WP-U02)
-- ════════════════════════════════════════════════════════════════════════════
-- Owner decision U6: a grant of either LEGAL role — legal_reviewer or
-- legal_admin — takes effect only when a Legal admin countersigns it. The
-- Administrator proposes; Legal accepts. Access to Legal judgement is itself a
-- Legal judgement, and this is ADR-0008's own role-sprawl warning given teeth:
-- it is the check that stops an Administrator assembling a voice in content by
-- granting an ally legal_reviewer and having them approve the Administrator's
-- own requests.
--
-- Viewer, requester and auditor the Administrator grants alone, recorded. None
-- of them can change a contract or decide anything, so a second signature would
-- buy control nobody needs at the price of slowing down every ordinary joiner.
--
-- WHERE THE RULE LIVES. Here, in the database. A countersign rule enforced only
-- by the console is one API bug from gone, and the bug would be invisible: the
-- screen would still show the amber "pending" badge while the person it names
-- was already working.

-- ── cw.role_grant · what happened to somebody's access, in order ───────────
-- APPEND-ONLY, and that shapes the table. The obvious design puts
-- countersigned_by and revoked_by as nullable columns on the grant row and
-- fills them in later — but filling them in is an UPDATE, and a table that
-- takes updates is not append-only, it is a table with a convention. Under that
-- design "who countersigned this" is a value somebody can quietly change, which
-- is the one fact the whole rule rests on.
--
-- So every act is its own row. A grant is a row. Countersigning it is a second
-- row naming the first. Revoking it is a third. Nothing is ever updated, there
-- is no update or delete grant for any role, and triggers refuse both even for
-- the owner. Corrections are new rows, exactly as with every other record in
-- this schema.
--
-- The cost, stated: "what can this person do right now" is no longer a column
-- lookup. It is cw.effective_role, below, which is the single source the
-- service layer consults.
create table cw.role_grant (
  grant_id   bigserial primary key,
  -- Which act this row is. Deliberately not a status column that moves:
  -- a status moves by UPDATE, and nothing here moves.
  action     text not null check (action in ('granted','countersigned','revoked')),
  person     text not null references cw.account(person),
  -- The role in question. Carried on countersign and revoke rows too,
  -- denormalised on purpose: an access history that needs a join to say WHAT
  -- was granted is an access history nobody reads.
  role       text not null check (role in
               ('viewer','requester','legal_reviewer','legal_admin',
                'auditor','administrator')),
  -- For 'countersigned' and 'revoked': the grant row being acted on. Null for a
  -- 'granted' row, which is the thing acted upon.
  grant_ref  bigint references cw.role_grant(grant_id),
  acted_by   text not null,
  acted_at   timestamptz not null default now(),
  reason     text,
  -- The two accounts the bootstrap ceremony creates hold their roles without a
  -- countersign, because at that instant there is no Legal admin to give one.
  -- See the honest note on cw.effective_role below — this is a real hole in the
  -- countersign rule and it is marked rather than hidden.
  is_bootstrap boolean not null default false,
  constraint an_act_names_its_subject check (
    (action = 'granted' and grant_ref is null)
    or (action in ('countersigned','revoked') and grant_ref is not null)),
  constraint an_actor_is_not_blank check (length(btrim(acted_by)) > 0)
);

create index role_grant_by_person on cw.role_grant (person, grant_id);
create index role_grant_by_ref    on cw.role_grant (grant_ref)
  where grant_ref is not null;

comment on table cw.role_grant is
  'Append-only. Every act on somebody''s access is a row: granted, '
  'countersigned, revoked. Nothing is ever updated — a correction is a new row. '
  'cw.effective_role derives what a person may actually do right now.';

-- ── The rules, enforced before the row lands ───────────────────────────────
create or replace function cw.role_grant_rules() returns trigger
language plpgsql as $$
declare g cw.role_grant%rowtype; acct cw.account%rowtype;
begin
  -- The actor is the connection's person, never a value the caller supplies.
  -- Without this, an administrator writes acted_by = 'somebody.else' and the
  -- access history names the wrong person for the act that mattered most.
  --
  -- This is only as strong as cw.app_actor(), which is self-asserted — the
  -- residual ARCHITECTURE.md §5 states. What it closes is the gap between the
  -- name on the connection and the name on the row; what it cannot close is
  -- whether the name on the connection is really that person. Bootstrap rows
  -- are exempt because the owner performs them holding no application identity.
  if not new.is_bootstrap then
    new.acted_by := cw.app_actor();
  end if;

  select * into acct from cw.account where person = new.person;

  if new.action = 'granted' then
    -- Self-grant. The single most valuable act anybody inside this role could
    -- perform, so it is refused here rather than left to the console.
    if new.acted_by = new.person and not new.is_bootstrap then
      raise exception 'nobody grants themselves a role — % tried to grant '
        'themselves %', new.acted_by, new.role
        using errcode = 'insufficient_privilege';
    end if;
    if acct.state = 'revoked' then
      raise exception 'the account for % is revoked; create an account before '
        'granting a role', new.person
        using errcode = 'check_violation';
    end if;

  elsif new.action = 'countersigned' then
    select * into g from cw.role_grant where grant_id = new.grant_ref;
    -- Said plainly, and early. Without this the row falls through to
    -- `new.person := g.person`, g is an all-null record, and the caller is told
    -- "null value in column person violates not-null constraint" — which is
    -- true, useless, and points at the wrong thing entirely. The check
    -- constraint on the table cannot catch it either, because this trigger has
    -- already overwritten person by the time constraints are evaluated.
    if g.grant_id is null then
      raise exception 'a countersign names the grant it accepts, and grant % does '
        'not exist', coalesce(new.grant_ref::text, '(none given)')
        using errcode = 'foreign_key_violation';
    end if;
    if g.action <> 'granted' then
      raise exception 'a countersign names a grant; row % is a %', g.grant_id, g.action
        using errcode = 'check_violation';
    end if;
    if g.role not in ('legal_reviewer','legal_admin') then
      raise exception 'only grants of the two Legal roles are countersigned; % '
        'takes effect when it is granted', g.role
        using errcode = 'check_violation';
    end if;
    -- Self-countersign. An administrator who could countersign their own
    -- proposal has the countersign rule in name only. Checked against BOTH the
    -- subject of the grant and the person who proposed it: countersigning a
    -- grant you yourself proposed is one signature wearing two hats.
    if new.acted_by = g.person then
      raise exception 'nobody countersigns their own role — % is the subject of '
        'grant %', new.acted_by, g.grant_id
        using errcode = 'insufficient_privilege';
    end if;
    if new.acted_by = g.acted_by then
      raise exception 'the countersign is a second person''s judgement — % '
        'proposed grant % and cannot also accept it', new.acted_by, g.grant_id
        using errcode = 'insufficient_privilege';
    end if;
    if exists (select 1 from cw.role_grant c
               where c.action = 'countersigned' and c.grant_ref = new.grant_ref) then
      raise exception 'grant % is already countersigned', new.grant_ref
        using errcode = 'unique_violation';
    end if;
    new.person := g.person;
    new.role   := g.role;

  elsif new.action = 'revoked' then
    select * into g from cw.role_grant where grant_id = new.grant_ref;
    if g.grant_id is null then
      raise exception 'a revocation names the grant it withdraws, and grant % does '
        'not exist', coalesce(new.grant_ref::text, '(none given)')
        using errcode = 'foreign_key_violation';
    end if;
    if g.action <> 'granted' then
      raise exception 'a revocation names a grant; row % is a %', g.grant_id, g.action
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from cw.role_grant r
               where r.action = 'revoked' and r.grant_ref = new.grant_ref) then
      raise exception 'grant % is already revoked', new.grant_ref
        using errcode = 'unique_violation';
    end if;
    new.person := g.person;
    new.role   := g.role;
  end if;

  return new;
end $$;

create trigger role_grant_rules
  before insert on cw.role_grant
  for each row execute function cw.role_grant_rules();

-- Append-only, both directions, for everyone including the owner. The grant
-- table is the access history; a system that can edit its own access history
-- has no access history.
create or replace function cw.role_grant_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'cw.role_grant is append-only — a correction is a new row, so '
    'that the correction is on the record too';
end $$;

create trigger role_grant_no_update
  before update on cw.role_grant
  for each row execute function cw.role_grant_append_only();
create trigger role_grant_no_delete
  before delete on cw.role_grant
  for each row execute function cw.role_grant_append_only();

-- ── Audit ──────────────────────────────────────────────────────────────────
create or replace function cw.audit_role_grant() returns trigger
language plpgsql as $$
begin
  perform cw.audit(
    case new.action
      when 'granted'       then 'role_granted'
      when 'countersigned' then 'role_countersigned'
      when 'revoked'       then 'role_revoked'
    end,
    new.person,
    jsonb_build_object('role', new.role, 'grant_id', new.grant_id,
                       'grant_ref', new.grant_ref, 'by', new.acted_by,
                       'reason', new.reason, 'bootstrap', new.is_bootstrap),
    case when new.is_bootstrap then 'system' else 'human' end);
  return new;
end $$;

create trigger audit_role_grant
  after insert on cw.role_grant
  for each row execute function cw.audit_role_grant();

-- ── cw.effective_role · what this person may actually do, right now ────────
-- The single source the service layer (WP-U05) consults. Everything else about
-- roles is history; this is the present tense.
--
-- FOUR CONDITIONS, and each one is a rule somebody could otherwise forget:
--
--   1. There is a grant.                    No grant, no role.
--   2. It has not been revoked.             A revoked grant confers nothing.
--   3. If it is a Legal role, it is         Decision U6. The uncountersigned
--      countersigned.                       grant confers NOTHING — not a
--                                           lesser role, nothing.
--   4. The account is active.               A revoked person holds nothing,
--                                           however many live grants they have.
--
-- Where a person somehow holds several live grants the most recent wins, and
-- one-person-one-role means that should not arise — cw.account's primary key
-- makes a second account impossible and the console grants one role at a time.
-- Taking the newest is the fail-safe answer if it ever does: the most recently
-- recorded decision is the one a human most recently made.
create or replace view cw.effective_role as
with live as (
  select g.grant_id, g.person, g.role, g.acted_at, g.acted_by, g.is_bootstrap,
         (select c.acted_by from cw.role_grant c
           where c.action = 'countersigned' and c.grant_ref = g.grant_id)
           as countersigned_by,
         (select c.acted_at from cw.role_grant c
           where c.action = 'countersigned' and c.grant_ref = g.grant_id)
           as countersigned_at
  from cw.role_grant g
  where g.action = 'granted'
    and not exists (select 1 from cw.role_grant r
                    where r.action = 'revoked' and r.grant_ref = g.grant_id)
)
select distinct on (l.person)
       l.person, a.display_name, a.unit, l.role, l.grant_id,
       l.acted_by as granted_by, l.acted_at as granted_at,
       l.countersigned_by, l.countersigned_at
from live l
join cw.account a on a.person = l.person
where a.state = 'active'
  and (l.role not in ('legal_reviewer','legal_admin')
       or l.countersigned_by is not null
       -- THE ONE HOLE IN THE COUNTERSIGN RULE, marked rather than hidden.
       -- The first Legal admin is created before any Legal admin exists to
       -- countersign them, so the ceremony's own grant is effective without
       -- one. It is a single row, it is flagged is_bootstrap, it names the
       -- owner, and it is on the chain as a system act — so "which Legal role
       -- was never countersigned" is one query, not an investigation.
       or l.is_bootstrap)
order by l.person, l.acted_at desc, l.grant_id desc;

comment on view cw.effective_role is
  'What each person may actually do right now. A grant that is revoked, or an '
  'uncountersigned grant of a Legal role, confers NOTHING — not a lesser role. '
  'The service layer binds a session to this and to nothing else.';

-- The pending queue: proposed Legal grants waiting on a Legal admin. This is
-- the countersign queue, and WP-U08 puts it in Legal's OWN workspace as well as
-- the admin console — a queue living only where the people who must clear it
-- never look is a queue that does not get cleared.
create or replace view cw.countersign_pending as
select g.grant_id, g.person, a.display_name, a.unit, g.role,
       g.acted_by as proposed_by, g.acted_at as proposed_at, g.reason
from cw.role_grant g
join cw.account a on a.person = g.person
where g.action = 'granted'
  and g.role in ('legal_reviewer','legal_admin')
  and not g.is_bootstrap
  and not exists (select 1 from cw.role_grant c
                  where c.action = 'countersigned' and c.grant_ref = g.grant_id)
  and not exists (select 1 from cw.role_grant r
                  where r.action = 'revoked' and r.grant_ref = g.grant_id)
order by g.acted_at;

comment on view cw.countersign_pending is
  'Proposed grants of the two Legal roles that no Legal admin has accepted yet. '
  'These confer nothing while they sit here.';

-- ── Who may write which act ────────────────────────────────────────────────
alter table cw.role_grant enable row level security;

-- Access is not a secret, for the same reason cw.account is not: it carries no
-- contract content, and hiding it would make the access story unauditable by
-- anyone but the administrator.
create policy read_all on cw.role_grant for select
  using (cw.app_role() is not null);

-- The administrator proposes and revokes.
create policy administrator_grants on cw.role_grant for insert
  with check (cw.app_role() = 'administrator'
              and action in ('granted','revoked'));

-- A Legal admin — and nobody else, including the administrator — countersigns.
-- A separate policy rather than one with an OR, so that each reads as the
-- single rule it is.
create policy legal_admin_countersigns on cw.role_grant for insert
  with check (cw.app_role() = 'legal_admin' and action = 'countersigned');

revoke all on cw.role_grant from public;
grant select on cw.role_grant to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;
grant insert on cw.role_grant to cw_administrator, cw_legal_admin;
grant usage, select on sequence cw.role_grant_grant_id_seq to
  cw_administrator, cw_legal_admin;
-- No update, no delete, for anybody. Two layers, with the triggers above.

grant select on cw.effective_role, cw.countersign_pending to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;

-- ── The bootstrap ceremony grants the two roles it creates ─────────────────
-- Rewritten rather than patched: part 1's version created accounts and stopped,
-- which under part 2 would leave the first Administrator holding an account and
-- no effective role — unable to perform the very next act the ceremony exists
-- to enable. The two grants are part of the ceremony, not a follow-up somebody
-- has to remember.
create or replace function cw.bootstrap(
  p_by                 text,
  p_administrator      text,
  p_administrator_name text,
  p_legal_admin        text,
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

  if cw.app_role() is not null then
    raise exception 'the bootstrap ceremony is the owner''s one act; a connection '
      'holding the % role cannot perform it', cw.app_role()
      using errcode = 'insufficient_privilege';
  end if;

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

  perform set_config('cw.actor', p_by, true);

  insert into cw.account (person, display_name, unit, role, created_by, is_bootstrap)
  values (p_administrator, p_administrator_name, p_unit, 'administrator', p_by, true),
         (p_legal_admin,   p_legal_admin_name,   p_unit, 'legal_admin',   p_by, true);

  -- Effective from the start, and flagged. The Legal admin's grant is the one
  -- exception to decision U6 in the system's whole life, because there is
  -- nobody yet to countersign it. cw.effective_role names the exception in its
  -- own WHERE clause so that nobody has to remember it.
  insert into cw.role_grant (action, person, role, acted_by, reason, is_bootstrap)
  values ('granted', p_administrator, 'administrator', p_by,
          'bootstrap: the first Administrator', true),
         ('granted', p_legal_admin, 'legal_admin', p_by,
          'bootstrap: the first Legal admin, uncountersigned because there is '
          'no Legal admin yet to countersign', true);

  perform cw.audit('bootstrap_performed', p_by,
    jsonb_build_object('administrator', p_administrator,
                       'legal_admin', p_legal_admin), 'system');
end $$;

revoke all on function cw.bootstrap(text,text,text,text,text,text) from public;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 3 · THE SETTINGS SPLIT, AND THE WATCHER LISTS (WP-U03)
-- ════════════════════════════════════════════════════════════════════════════
-- Two kinds of setting live in cw.governance_setting and they were never
-- distinguished, because until now there was only one kind of person who could
-- write them.
--
--   OWNER DECISIONS   — what the business has chosen. Whether a work order may
--                       depart from its master; what a renewal opens from; what
--                       counts as adequate legal review. These stay Legal
--                       admin's, and are READ-ONLY to the Administrator.
--   OPERATIONAL       — how the machine is tuned. How long a socialisation
--                       window runs; when a ticket expires; how often digests
--                       go out; how long a session lasts. These become the
--                       Administrator's, and are read-only to Legal admin.
--
-- THE SPLIT CUTS BOTH WAYS, and that is the point. It would be easy to write it
-- as "legal_admin may write everything, administrator may also write the
-- operational rows", which reads as a delegation and is not one. A Legal admin
-- editing the session length is doing machine stewardship in the content role —
-- the exact mixing the sixth role exists to end. So legal_admin is refused on
-- operational rows, and the tests exercise the refusal in both directions.
--
-- WHERE THE LINE IS DRAWN, because it is the only interesting question here: a
-- setting is operational when changing it cannot change a contract outcome. An
-- "auto-approve threshold" is NOT operational however much it looks like a
-- tuning knob — it decides what counts as adequate review, which is content, and
-- content is not ours (U4 is emphatic about this). The check constraint below
-- refuses a row that is marked operational and an owner decision at once, which
-- catches the mislabelling in its most likely form.

-- ── The kind column ────────────────────────────────────────────────────────
-- Note there are now two columns that sound alike, and they answer different
-- questions:
--
--   kind               WHO MAY WRITE THIS ROW.
--   is_owner_decision  WHETHER THE CHOICE WAS THE OWNER'S TO MAKE.
--
-- They are not the same. `owner_maps_to_application_role` was settled in
-- engineering rather than by the owner, so is_owner_decision is false — but it
-- is emphatically not an operational knob for the Administrator to turn, so its
-- kind is owner_decision. Every existing row becomes owner_decision, which is
-- the safe direction: nothing an Administrator could not previously write
-- becomes writable by them here.
alter table cw.governance_setting
  add column kind text not null default 'owner_decision'
    check (kind in ('owner_decision','operational')),
  -- The purpose, in the row, for the settings pane to render. Owner decisions
  -- already carry `rationale`, which is a different thing: rationale says why
  -- the choice was made, purpose says what the knob does.
  add column purpose text,
  add constraint operational_is_never_an_owner_decision check (
    not (kind = 'operational' and is_owner_decision));

comment on column cw.governance_setting.kind is
  'Who may write this row: owner_decision (legal_admin only) or operational '
  '(administrator only). Distinct from is_owner_decision, which records whether '
  'the CHOICE was the owner''s to make.';

-- ── The four operational rows ──────────────────────────────────────────────
-- Four, and four is the scope. A fifth is a proposal with a reason attached,
-- not a drive-by while the file is open.
--
-- Each ships with a defensible default and says what it does, because a
-- settings pane whose rows need a developer to explain them is a settings pane
-- nobody touches.
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
values
  ('override_review_window', '48h', 'operational', false, true, 'engineering',
   'ADR-0008 calls the socialisation window a policy setting and does not fix a '
   'number. 48 hours ships as the default: long enough that watchers in another '
   'timezone get a working day, short enough that it does not become the reason '
   'people stop asking. Operational because changing it changes how long people '
   'wait, never what they are allowed to decide.',
   'How long an override request is socialised to its watchers before a Legal '
   'reviewer may decide it. Deciding sooner is refused.'),

  ('ticket_expiry', '30d', 'operational', false, true, 'engineering',
   'A review ticket that nobody has touched in a month is not waiting, it is '
   'lost. This is the age at which it is surfaced as overdue — it does not close '
   'or decide anything, which is why it is operational rather than a judgement.',
   'The age at which an untouched review ticket is flagged as overdue. Nothing '
   'is closed or decided automatically.'),

  ('notification_digest', 'daily', 'operational', false, true, 'engineering',
   'How often watchers and Legal admins are nudged. Daily is the default '
   'because the countersign queue''s whole mitigation is that somebody looks at '
   'it — ADR-0011 leans on this to keep the countersign wait short.',
   'How often digests go out: what is waiting to be countersigned, what is '
   'closing, what is expiring.'),

  ('session_length', '8h', 'operational', false, true, 'engineering',
   'One working day. Long enough not to interrupt somebody mid-negotiation, '
   'short enough that a forgotten browser is not an open door overnight. Note '
   'this bounds how long a session LIVES, not how long a revocation takes to '
   'bite: revocation is honoured at the next request (WP-U05), and the console '
   'copy must not promise more than that.',
   'How long a signed-in session lasts before the person signs in again.');

-- ── The four decisions from WP-U00, held where the code can see them ───────
-- The same discipline as U1–U4: a decision recorded only in a document gets
-- read once; a decision recorded here is met by whoever next touches the thing
-- it governs.
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale)
values
  ('administrator_may_read_content', 'true', 'owner_decision', true, true, 'owner',
   'U5 — SETTLED 2026-07-26 by the owner, and settled as an AMENDMENT to the '
   'proposal. The Administrator runs the machine and may READ contract content; '
   'it can write none of it and decides nothing in any workflow. The proposal '
   'made the role content-blind; the owner relaxed the read half so that whoever '
   'supports the system can see the thing being complained about. The boundary '
   'kept is WRITE and JUDGEMENT, not sight. The accepted cost, stated: this '
   'person can read every deal in the system and reads are not recorded, because '
   'the audit log records acts and not glances. Describe the role as '
   'content-visible and content-powerless — never as content-blind.'),

  ('legal_role_grants_need_countersign', 'true', 'owner_decision', true, true, 'owner',
   'U6 — SETTLED 2026-07-26 by the owner, as proposed. A grant of legal_reviewer '
   'or legal_admin confers NOTHING until a Legal admin countersigns it. Viewer, '
   'requester and auditor the Administrator grants alone, recorded. Access to '
   'Legal judgement is itself a Legal judgement, and this is the check that stops '
   'an Administrator assembling a voice in content by granting an ally the '
   'reviewer role. The accepted cost: a wait whenever Legal cover is needed in a '
   'hurry, mitigated by putting the countersign queue in Legal''s own workspace. '
   'Enforced in cw.effective_role, not in the console.'),

  ('checkpoint_duty', 'administrator', 'owner_decision', true, true, 'owner',
   'U7 — SETTLED 2026-07-26 by the owner. Taking an audit checkpoint MOVES from '
   'legal_admin to the administrator, and legal_admin''s right is revoked rather '
   'than held jointly during a transition. Checkpointing proves the record has '
   'not been tampered with and says nothing about any contract, so it is machine '
   'stewardship. Not shared, because two roles holding one duty means neither '
   'owns it and nobody can be held to account for a checkpoint never taken.'),

  ('workspace_model', 'six_role_scoped', 'owner_decision', true, true, 'owner',
   'U8 — SETTLED 2026-07-26 by the owner, as proposed. Nine global tabs are '
   'replaced by six workspaces, one per role, each opening on what is waiting on '
   'that person. Deals become the requester''s unit of navigation and the '
   'assembly pipeline becomes the stages of ONE deal, so two deals at two stages '
   'never share a rail. The blanket acknowledge-and-override button is retired '
   'per ADR-0008. The v3 visual language is kept wholesale — reorganisation, not '
   'restyling. Accepted cost: showing the whole product now takes six sign-ins.');

-- ── Who writes which kind ──────────────────────────────────────────────────
-- The existing single policy is replaced rather than added to. Leaving
-- `admin_writes` in place and adding an administrator policy beside it would
-- leave legal_admin able to write operational rows — permissive policies are
-- OR'd — and the split would cut one way only.
drop policy admin_writes on cw.governance_setting;

-- WHY THE `using` CLAUSE IS DELIBERATELY WIDER THAN THE RULE, which looks wrong
-- until you have watched it fail.
--
-- The natural way to write this is
--   using (app_role() = 'legal_admin' and kind = 'owner_decision')
-- for one policy and the mirror for the other. It enforces the rule correctly
-- and it is finding D1 all over again: a row excluded by USING is not visible to
-- the UPDATE at all, so the statement completes having affected ZERO rows and
-- raises nothing. An administrator pressing save on an owner decision would get
-- silence that a console renders as success, and the value on screen would go on
-- disagreeing with the value in the database until somebody reloaded.
--
-- So USING admits both writing roles — enough for the row to be reached — and
-- the rule is enforced twice below it, loudly:
--
--   · cw.setting_write_rules(), a BEFORE trigger, raises naming the rule and the
--     role. That is the message a person sees, and WP-U06 passes it through
--     unchanged rather than inventing one.
--   · WITH CHECK, underneath, refuses independently. If the trigger is ever
--     dropped the write is still refused — with a worse message, which is the
--     right trade for a second line of defence.
--
-- Roles other than these two hold no UPDATE grant at all, so they are refused by
-- privilege before any of this — a genuine error, not a silent no-op.
create policy settings_writers on cw.governance_setting
  for update
  using       (cw.app_role() in ('legal_admin','administrator'))
  with check  ((cw.app_role() = 'legal_admin'   and kind = 'owner_decision')
            or (cw.app_role() = 'administrator' and kind = 'operational'));

grant update on cw.governance_setting to cw_administrator;
grant select on cw.governance_setting to cw_administrator;

-- ── A row cannot change sides, and cannot change identity ──────────────────
-- Without this the split is one UPDATE from meaningless: an administrator marks
-- an owner decision operational and then edits it, and both statements are
-- individually permitted. The USING clause of the policy is evaluated against
-- the OLD row, so the first update — flipping kind on a row the administrator
-- may not write — is already refused. This trigger is the second layer, and it
-- also refuses the owner, who bypasses policies entirely.
create or replace function cw.setting_write_rules() returns trigger
language plpgsql as $$
begin
  if new.key is distinct from old.key then
    raise exception 'a setting''s key is its identity and cannot be changed';
  end if;
  if new.kind is distinct from old.kind then
    raise exception 'a setting does not change sides — % is a %, and moving it '
      'would move who may write it', old.key, old.kind
      using errcode = 'insufficient_privilege';
  end if;

  -- The split, said out loud. This is what makes a refusal a refusal instead of
  -- an update that quietly touches nothing; see the note above the policy.
  -- Skipped entirely for the owner, who holds no application role and runs the
  -- migrations and the seeding.
  if cw.app_role() is not null then
    if old.kind = 'owner_decision' and cw.app_role() <> 'legal_admin' then
      raise exception '% is an owner decision and only a legal admin may change '
        'it; the % role sees it read-only', old.key, cw.app_role()
        using errcode = 'insufficient_privilege';
    end if;
    if old.kind = 'operational' and cw.app_role() <> 'administrator' then
      raise exception '% is an operational setting and only the administrator '
        'may change it; the % role sees it read-only', old.key, cw.app_role()
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;

create trigger setting_write_rules
  before update on cw.governance_setting
  for each row execute function cw.setting_write_rules();

-- ── Every change is recorded, whichever kind it is ─────────────────────────
-- Both kinds, deliberately. An operational setting is not a lesser record: the
-- socialisation window is the difference between a control and a formality, and
-- "who shortened it to one hour, and when" is exactly the question an auditor
-- asks after the fact.
create or replace function cw.audit_setting() returns trigger
language plpgsql as $$
begin
  if new.value is distinct from old.value
     or new.decided is distinct from old.decided
     or new.rationale is distinct from old.rationale then
    perform cw.audit('setting_changed', new.key,
      jsonb_build_object('kind', new.kind,
                         'from', old.value, 'to', new.value,
                         'decided', new.decided,
                         'rationale', new.rationale));
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger audit_setting
  before update on cw.governance_setting
  for each row execute function cw.audit_setting();

-- Nobody deletes a setting. A knob that vanishes takes its history with it, and
-- the audit rows would then point at a key nothing explains.
create or replace function cw.setting_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'settings are changed, never deleted — the audit rows that '
    'name this key have to keep meaning something';
end $$;

create trigger setting_no_delete
  before delete on cw.governance_setting
  for each row execute function cw.setting_no_delete();

-- ── cw.override_watcher · who is told, never who decides ──────────────────
-- ADR-0008's socialisation step needs a list of people to tell when an override
-- is requested. This is that list, and the Administrator's to maintain — which
-- is the sharpest illustration of the sixth role's boundary: the Administrator
-- decides WHO IS TOLD and never WHO DECIDES. Adding somebody here gives them
-- sight of a request; it gives them no vote in it.
--
-- TWO KINDS OF ROW, distinguished by category_key:
--
--   category_key = 'data'   watches override requests touching Data Privacy.
--   category_key is null    an ALWAYS-WATCHER: watches every request whatever
--                           it covers. The security lead, the general counsel.
--
-- THE DEAL OWNER IS NOT A ROW HERE. The requester's own deal always socialises
-- to them; that is structural and follows from the request, so putting them in
-- a maintainable list would only create the possibility of somebody removing
-- them. What cannot be misconfigured does not need configuring.
create table cw.override_watcher (
  watcher_id  bigserial primary key,
  -- Null means every category. The FK is on the non-null values only, which is
  -- what a nullable FK column already does.
  category_key text references cw.category(key),
  person      text not null references cw.account(person),
  added_by    text not null,
  added_at    timestamptz not null default now(),
  removed_by  text,
  removed_at  timestamptz,
  constraint removed_names_a_person_and_a_time check (
    (removed_at is null) = (removed_by is null))
);

-- One live row per person per category. A person listed twice would be notified
-- twice and, worse, would have to be removed twice.
create unique index override_watcher_live
  on cw.override_watcher (coalesce(category_key, '*'), person)
  where removed_at is null;

comment on table cw.override_watcher is
  'Who is told when an override is requested. A null category_key is an '
  'always-watcher. The Administrator maintains this list and holds no vote in '
  'any request it feeds. The deal owner is structural and deliberately not a '
  'row here.';

-- The coverage question the console has to be able to ask. An override request
-- touching a category with no watcher and no always-watcher is not "nobody to
-- tell" — it is a gap, and the system's job is making the gap visible.
create or replace view cw.watcher_coverage as
select c.key as category_key, c.label,
       (select count(*) from cw.override_watcher w
         where w.removed_at is null
           and (w.category_key = c.key or w.category_key is null))::int
         as watcher_count
from cw.category c
order by c.key;

comment on view cw.watcher_coverage is
  'How many people would be told about an override request in each category, '
  'counting always-watchers. A zero here is a visible gap for somebody to '
  'close, never a silent "nobody to tell".';

create or replace function cw.audit_override_watcher() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('watcher_added', coalesce(new.category_key, '*'),
      jsonb_build_object('person', new.person, 'by', new.added_by));
  elsif old.removed_at is null and new.removed_at is not null then
    -- The one that matters. Somebody quietly dropped off a notification list is
    -- silence about who was silenced, and it is the failure nobody notices
    -- because nothing visibly happens afterwards.
    perform cw.audit('watcher_removed', coalesce(new.category_key, '*'),
      jsonb_build_object('person', new.person, 'by', new.removed_by));
  end if;
  return new;
end $$;

create trigger audit_override_watcher
  before insert or update on cw.override_watcher
  for each row execute function cw.audit_override_watcher();

create or replace function cw.override_watcher_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'a watcher is removed, never deleted — being taken off a '
    'notification list is exactly the change that has to stay on the record';
end $$;

create trigger override_watcher_no_delete
  before delete on cw.override_watcher
  for each row execute function cw.override_watcher_no_delete();

alter table cw.override_watcher enable row level security;

-- Everyone reads it. Who will be told about a request is not a secret from the
-- person making the request — quite the opposite, it is what makes the
-- socialisation meaningful to them.
create policy read_all on cw.override_watcher for select
  using (cw.app_role() is not null);

create policy administrator_maintains on cw.override_watcher for insert
  with check (cw.app_role() = 'administrator');
create policy administrator_removes on cw.override_watcher for update
  using (cw.app_role() = 'administrator')
  with check (cw.app_role() = 'administrator');

revoke all on cw.override_watcher from public;
grant select on cw.override_watcher, cw.watcher_coverage to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;
grant insert, update on cw.override_watcher to cw_administrator;
grant usage, select on sequence cw.override_watcher_watcher_id_seq
  to cw_administrator;

-- ════════════════════════════════════════════════════════════════════════════
-- PART 4 · CHECKPOINT DUTY, AND SYSTEM-HEALTH EVIDENCE (WP-U04)
-- ════════════════════════════════════════════════════════════════════════════
-- Owner decision U7: taking an audit checkpoint MOVES from legal_admin to the
-- administrator. Checkpointing proves the record has not been tampered with and
-- says nothing about any contract, so it is machine stewardship.
--
-- A move, not a shared right. Two roles holding one duty means neither owns it,
-- and there is nobody to hold to account for a checkpoint that was never taken.
-- So legal_admin's execute privilege is REVOKED in the same statement block that
-- grants the administrator's, and a test proves legal_admin is now refused where
-- it previously succeeded.
grant  execute on function cw.audit_checkpoint_take() to cw_administrator;
revoke execute on function cw.audit_checkpoint_take() from cw_legal_admin;

-- The comment on the function said "so a legal_admin can take a checkpoint";
-- leaving that in place would be a document promising what the code no longer
-- does, which is the failure class this whole effort is paying down.
comment on function cw.audit_checkpoint_take() is
  'Record how tall the audit log is and what its last row hashes to. The '
  'ADMINISTRATOR''s duty since owner decision U7 — machine stewardship, not a '
  'contract judgement. legal_admin''s right was revoked in the same migration, '
  'because two roles holding one duty means neither owns it.';

grant select on cw.audit_checkpoint to cw_administrator;
grant select on cw.retention_due to cw_administrator;

-- ════════════════════════════════════════════════════════════════════════════
-- EVIDENCE, NOT DECORATION
-- ════════════════════════════════════════════════════════════════════════════
-- The health pane shows six facts, and every one of them has a way of being
-- comfortably wrong. The failure to design against is not a tile that says
-- BROKEN when things are fine — somebody investigates that within the hour. It
-- is a tile that says VERIFIED because a query counted rows that exist rather
-- than checks that ran.
--
--   "documents stored"    is a count of rows. It proves nothing about bytes.
--   "documents verified"  must count verifications that actually happened.
--
-- Those are different numbers and the pane shows both, plus the difference. The
-- gap between them is the interesting figure and it is never hidden.
--
-- NEVER-RAN IS ITS OWN STATE, everywhere below. "We looked and it is fine" and
-- "we have not looked" are different answers, and rendering the second as the
-- first is how a system reassures its operator into an incident. 0007 already
-- established the pattern — cw.audit_anchor_check() returns 'no checkpoint'
-- rather than 'ok' before the first one is taken — and this part follows it.

-- ── cw.integrity_check · the checks that actually ran ─────────────────────
-- Append-only. This table is the difference between evidence and decoration:
-- nothing in the health views counts anything that is not a row here.
--
-- WHY THE CHECKS ARE RECORDED RATHER THAN COMPUTED ON READ. Two of the four
-- cannot be computed inside the database at all. A document hash check requires
-- reading the stored bytes, which live in a document store the database has no
-- reach into (cw.executed_document holds a storage_uri, not the file). A rebuild
-- spot-check requires running the Python engine. Both are performed outside and
-- their RESULT is recorded here — so the honest thing is for the anchor and
-- chain checks to be recorded the same way, rather than having two kinds of
-- health fact with two different meanings behind one row of tiles.
create table cw.integrity_check (
  check_id   bigserial primary key,
  check_name text not null check (check_name in
    ('anchor',            -- the newest checkpoint still describes the log
     'chain',             -- every row's hash still links to its parent
     'document_hash',     -- a stored signed file still hashes to what we recorded
     'rebuild_spot_check' -- a past run rebuilt and compared, byte for byte
    )),
  -- Which thing was checked, where that makes sense: an agreement/doc_seq for a
  -- document hash, a run_id for a rebuild. Null for the whole-log checks.
  subject    text,
  ran_at     timestamptz not null default now(),
  ran_by     text not null,
  outcome    text not null check (outcome in ('pass','fail')),
  -- What was seen. Mandatory on a failure: a failed check whose detail is null
  -- tells the person on call that something is wrong and nothing about what.
  detail     text,
  constraint a_failure_says_what_went_wrong check (
    outcome <> 'fail' or (detail is not null and btrim(detail) <> '')),
  constraint a_check_names_who_ran_it check (btrim(ran_by) <> '')
);

create index integrity_check_recent
  on cw.integrity_check (check_name, ran_at desc);

comment on table cw.integrity_check is
  'Every integrity check that actually ran, and what it found. Append-only. '
  'The health views count rows here and nothing else — a tile that says '
  'verified must be counting verifications, not records.';

create or replace function cw.integrity_check_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'cw.integrity_check is append-only — a check that found '
    'something cannot be un-found, and re-running it is a new row';
end $$;

create trigger integrity_check_no_update
  before update on cw.integrity_check
  for each row execute function cw.integrity_check_append_only();
create trigger integrity_check_no_delete
  before delete on cw.integrity_check
  for each row execute function cw.integrity_check_append_only();

-- ── The two checks the database can perform for itself ────────────────────
-- Both SECURITY DEFINER for the reason 0007 established: under row-level
-- security a scoped role sees a filtered log and would be told an honest
-- database had been truncated.
create or replace function cw.run_anchor_check() returns text
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare r text;
begin
  r := cw.audit_anchor_check();
  insert into cw.integrity_check (check_name, ran_by, outcome, detail)
  values ('anchor', cw.app_actor(),
          case when r = 'ok' then 'pass' else 'fail' end,
          -- 'no checkpoint' is a FAILURE of the anchor check, not a pass with a
          -- caveat. There is no anchor, so nothing is anchored, and the pane
          -- must not render that green.
          case when r = 'ok' then null else r end);
  return r;
end $$;

create or replace function cw.run_chain_check() returns bigint
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare broken bigint;
begin
  broken := cw.audit_verify();
  insert into cw.integrity_check (check_name, ran_by, outcome, detail)
  values ('chain', cw.app_actor(),
          case when broken is null then 'pass' else 'fail' end,
          case when broken is null then null
               else format('the chain first fails to verify at seq %s', broken) end);
  return broken;
end $$;

-- ── The two the database can only adjudicate ──────────────────────────────
-- The caller reads the bytes and supplies what they hash to; the DATABASE says
-- whether that matches what was recorded. Deliberately not "the caller tells us
-- whether it matched" — a boolean supplied by the thing being checked is not a
-- check, and the comparison has to happen where the recorded value lives.
create or replace function cw.record_document_hash_check(
  p_agreement_id text, p_doc_seq int, p_observed_sha256 text
) returns text
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare recorded text; matched boolean;
begin
  select sha256 into recorded from cw.executed_document
   where agreement_id = p_agreement_id and doc_seq = p_doc_seq;
  if recorded is null then
    raise exception 'there is no executed document %/% to check',
      p_agreement_id, p_doc_seq using errcode = 'no_data_found';
  end if;
  matched := (recorded = p_observed_sha256);
  insert into cw.integrity_check (check_name, subject, ran_by, outcome, detail)
  values ('document_hash', p_agreement_id || '/' || p_doc_seq, cw.app_actor(),
          case when matched then 'pass' else 'fail' end,
          case when matched then null else format(
            'the stored file no longer hashes to what was recorded at execution: '
            'recorded %s, read %s. The BYTES are the authority — this is an '
            'incident to investigate, never something to resolve by preferring '
            'a regeneration', recorded, p_observed_sha256) end);
  return case when matched then 'pass' else 'fail' end;
end $$;

create or replace function cw.record_rebuild_spot_check(
  p_run_id text, p_observed_hash text
) returns text
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare recorded text; engine text; matched boolean;
begin
  select result_hash, engine_version into recorded, engine
    from cw.run where run_id = p_run_id;
  if recorded is null then
    raise exception 'there is no run % to rebuild', p_run_id
      using errcode = 'no_data_found';
  end if;
  matched := (recorded = p_observed_hash);
  insert into cw.integrity_check (check_name, subject, ran_by, outcome, detail)
  values ('rebuild_spot_check', p_run_id, cw.app_actor(),
          case when matched then 'pass' else 'fail' end,
          case when matched then null else format(
            'rebuilding run %s produced %s; the record says %s. The run was '
            'produced by engine %s — a hash that no longer reproduces looks '
            'exactly like tampering AND exactly like an engine change, so check '
            'the engine version before raising an incident',
            p_run_id, p_observed_hash, recorded, engine) end);
  return case when matched then 'pass' else 'fail' end;
end $$;

revoke all on function cw.run_anchor_check() from public;
revoke all on function cw.run_chain_check() from public;
revoke all on function cw.record_document_hash_check(text,int,text) from public;
revoke all on function cw.record_rebuild_spot_check(text,text) from public;

grant execute on function cw.run_anchor_check() to cw_administrator;
grant execute on function cw.run_chain_check() to cw_administrator;
grant execute on function cw.record_document_hash_check(text,int,text)
  to cw_administrator;
grant execute on function cw.record_rebuild_spot_check(text,text)
  to cw_administrator;

alter table cw.integrity_check enable row level security;

-- Read: the administrator, whose pane this is, and the auditor, who reads
-- everything. Deliberately not the world — an unauthenticated view of which
-- integrity checks are failing is a map for somebody deciding when to tamper.
create policy health_read on cw.integrity_check for select
  using (cw.app_role() in ('administrator','auditor'));
create policy administrator_records on cw.integrity_check for insert
  with check (cw.app_role() = 'administrator');

revoke all on cw.integrity_check from public;
grant select on cw.integrity_check to cw_administrator, cw_auditor;
grant insert on cw.integrity_check to cw_administrator;
grant usage, select on sequence cw.integrity_check_check_id_seq to cw_administrator;

-- ── The health read models ────────────────────────────────────────────────
-- One row per tile, and every one of them can say never_ran.

-- Chain and anchor. Height comes from the log itself because it is a count, not
-- a verification, and it is labelled as such.
create or replace view cw.health_chain as
select
  (select count(*) from cw.audit_event)::bigint as chain_height,
  (select count(*) from cw.audit_checkpoint)::int as checkpoints_taken,
  (select taken_at from cw.audit_checkpoint
    order by checkpoint_id desc limit 1) as last_checkpoint_at,
  coalesce((select c.outcome from cw.integrity_check c
             where c.check_name = 'anchor' order by c.ran_at desc limit 1),
           'never_ran') as anchor_state,
  (select c.ran_at from cw.integrity_check c
    where c.check_name = 'anchor' order by c.ran_at desc limit 1) as anchor_ran_at,
  (select c.detail from cw.integrity_check c
    where c.check_name = 'anchor' order by c.ran_at desc limit 1) as anchor_detail,
  coalesce((select c.outcome from cw.integrity_check c
             where c.check_name = 'chain' order by c.ran_at desc limit 1),
           'never_ran') as chain_state,
  (select c.ran_at from cw.integrity_check c
    where c.check_name = 'chain' order by c.ran_at desc limit 1) as chain_ran_at,
  (select c.detail from cw.integrity_check c
    where c.check_name = 'chain' order by c.ran_at desc limit 1) as chain_detail;

comment on view cw.health_chain is
  'Chain height and the state of the two whole-log checks. anchor_state and '
  'chain_state are pass, fail, or never_ran — the third is not a variety of '
  'the first.';

-- Checkpoints: history and when the next one is due.
--
-- THE CADENCE IS A CONSTANT HERE AND NOT A SETTINGS ROW, deliberately. WP-U03
-- fixed the operational settings at four, and a fifth is a proposal with a
-- reason attached rather than something added while a file happened to be open.
-- The nightly job's schedule is documented in backend/README.md and this view
-- reports against the same 24 hours.
create or replace view cw.health_checkpoint as
select c.checkpoint_id, c.taken_at, c.height, c.last_seq,
       c.taken_at + interval '24 hours' as next_due_at,
       (c.taken_at + interval '24 hours') < now() as overdue
from cw.audit_checkpoint c
order by c.checkpoint_id desc;

comment on view cw.health_checkpoint is
  'Checkpoint history, newest first, with the next due time on a nightly '
  'cadence. Empty means none has ever been taken, which is never-ran and not '
  'up-to-date.';

-- Executed documents: stored versus actually verified. The gap is the point.
create or replace view cw.health_document as
with latest as (
  select distinct on (c.subject) c.subject, c.outcome, c.ran_at
  from cw.integrity_check c
  where c.check_name = 'document_hash'
  order by c.subject, c.ran_at desc
)
select
  (select count(*) from cw.executed_document)::int as documents_stored,
  (select count(*) from latest where outcome = 'pass')::int as documents_verified,
  (select count(*) from latest where outcome = 'fail')::int as documents_mismatched,
  -- The honest residual, computed rather than assumed. A document nobody has
  -- ever checked is not a verified document.
  ((select count(*) from cw.executed_document)
   - (select count(*) from latest))::int as documents_never_checked,
  (select max(ran_at) from latest) as last_checked_at;

comment on view cw.health_document is
  'Signed files stored, versus signed files whose bytes have actually been '
  'checked against the hash recorded at execution. documents_stored is a count '
  'of rows and proves nothing about bytes; the difference between it and '
  'documents_verified is documents_never_checked, and it is never hidden.';

create or replace view cw.health_rebuild as
select coalesce((select c.outcome from cw.integrity_check c
                  where c.check_name = 'rebuild_spot_check'
                  order by c.ran_at desc limit 1), 'never_ran') as state,
       (select c.subject from cw.integrity_check c
         where c.check_name = 'rebuild_spot_check'
         order by c.ran_at desc limit 1) as run_id,
       (select c.ran_at from cw.integrity_check c
         where c.check_name = 'rebuild_spot_check'
         order by c.ran_at desc limit 1) as ran_at,
       (select c.detail from cw.integrity_check c
         where c.check_name = 'rebuild_spot_check'
         order by c.ran_at desc limit 1) as detail;

comment on view cw.health_rebuild is
  'The most recent rebuild spot-check: a past run re-run and compared against '
  'the hash on record. never_ran until one has been.';

-- One row per tile, so the pane is one query and cannot render a state the
-- database did not produce.
create or replace view cw.health_summary as
select 'audit chain'      as tile,
       (select chain_state from cw.health_chain) as state,
       (select chain_ran_at from cw.health_chain) as as_of,
       (select chain_detail from cw.health_chain) as detail
union all
select 'anchor',
       (select anchor_state from cw.health_chain),
       (select anchor_ran_at from cw.health_chain),
       (select anchor_detail from cw.health_chain)
union all
select 'checkpoints',
       case when not exists (select 1 from cw.audit_checkpoint) then 'never_ran'
            when exists (select 1 from cw.health_checkpoint where overdue
                          and checkpoint_id = (select max(checkpoint_id)
                                               from cw.audit_checkpoint))
              then 'fail' else 'pass' end,
       (select max(taken_at) from cw.audit_checkpoint),
       case when not exists (select 1 from cw.audit_checkpoint)
            then 'no checkpoint has ever been taken' end
union all
select 'signed documents',
       case when (select documents_stored from cw.health_document) = 0 then 'never_ran'
            when (select documents_mismatched from cw.health_document) > 0 then 'fail'
            when (select documents_never_checked from cw.health_document) > 0 then 'never_ran'
            else 'pass' end,
       (select last_checked_at from cw.health_document),
       case when (select documents_never_checked from cw.health_document) > 0
            then format('%s of %s stored documents have never been checked',
                        (select documents_never_checked from cw.health_document),
                        (select documents_stored from cw.health_document)) end
union all
select 'rebuild spot-check',
       (select state from cw.health_rebuild),
       (select ran_at from cw.health_rebuild),
       (select detail from cw.health_rebuild)
union all
select 'retention due',
       -- Not a check that passes or fails: due-ness is a fact, not a fault, and
       -- acting on it is Legal's. 'pass' would be wrong and 'fail' would be
       -- worse — it would read as the system accusing itself of a defect for
       -- doing exactly what it is meant to do.
       case when (select count(*) from cw.retention_due) = 0 then 'none due'
            else 'due' end,
       now(),
       case when (select count(*) from cw.retention_due) > 0
            then format('%s agreement(s) past their retention date. Visible '
                        'here; actioned by Legal admin, who alone may destroy',
                        (select count(*) from cw.retention_due)) end;

comment on view cw.health_summary is
  'One row per health tile. Every state is pass, fail or never_ran, except '
  'retention, which is due or none due — due-ness is a fact, not a fault.';

grant select on cw.health_chain, cw.health_checkpoint, cw.health_document,
                cw.health_rebuild, cw.health_summary
  to cw_administrator, cw_auditor;
