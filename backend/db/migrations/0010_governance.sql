-- 0010 · Governance: who must approve, what stops the clock, and how a
--        statement of work hangs off its master.
--
-- Four builds that the specifications already promise and the schema did not
-- have (WP-18a…WP-18d):
--
--   a. REQUIRED APPROVERS.  Owner decision 4, 2026-07-25: settling at a
--      fallback position takes the Requester AND the assigned attorney, plus
--      every Required Approver configured for that contract. CLA §3 and §7 say
--      a machine "proposes, never settles". Until now the schema disagreed —
--      cw.concession had one free-text `approved_by` and nothing checked it.
--   b. LEGAL HOLD.  The retention clock is a clock; clocks run out and records
--      are destroyed. In a system whose selling point is what survives a
--      dispute there must be a way to stop the clock for a dispute. There was
--      none (LIFECYCLE §3.5).
--   c. SIGNATURE EVIDENCE.  Two narrow gaps only — see 0006.
--   d. MASTERS AND STATEMENTS OF WORK.  Two facts on the executed record —
--      see 0006.
--
-- (c) and (d) land in 0006 because they belong to the executed-agreement
-- family. This file holds (a), (b), and the settings table both of them and
-- 0006 read.

-- ════════════════════════════════════════════════════════════════════════════
-- OWNER DECISIONS THAT ARE NOT SETTLED, KEPT WHERE THE CODE CAN SEE THEM
-- ════════════════════════════════════════════════════════════════════════════
-- Two questions in this work belong to the owner, not to the implementer. The
-- temptation is to pick one and bury it in a WHERE clause. This table is the
-- refusal to do that: each open question is a row, the shipped behaviour is
-- recorded as a DEFAULT, and `decided` is false until a person says otherwise.
--
-- A reader can therefore ask the database "what has this system assumed on my
-- behalf?" and get an answer, and changing the answer is one UPDATE rather
-- than a migration.
create table cw.governance_setting (
  key           text primary key,
  value         text not null,
  is_owner_decision boolean not null default false,
  decided       boolean not null default false,
  decided_by    text,
  rationale     text not null,
  updated_at    timestamptz not null default now(),
  constraint decided_names_a_person check (decided = (decided_by is not null))
);

comment on table cw.governance_setting is
  'Open owner decisions and the defaults shipped in their place. A row with
   is_owner_decision true and decided false is a question the system has
   answered PROVISIONALLY so that it could ship — not a settled rule.';

insert into cw.governance_setting (key, value, is_owner_decision, decided, rationale) values
  ('sow_may_contradict_master', 'false', true, false,
   'U2 — LIFECYCLE §3.6. May a statement of work take a different position on a '
   'category its master already settles? The stricter reading ships as the default: '
   'it may not, and a contradiction is surfaced for a person to resolve. Chosen '
   'because it fails towards someone noticing and can be relaxed later without '
   'rewriting a single record. NOT SETTLED — the owner may set this to true.'),
  ('renewal_default_baseline', 'executed_agreement', true, false,
   'U1 — LIFECYCLE §3.4. Does a renewal open from the positions actually in force '
   'or from current library standard? Both are built and both are reachable; this '
   'row only says which one is PRE-SELECTED. The proposal recommends opening from '
   'the executed agreement with the drift report alongside. NOT SETTLED.');

create or replace function cw.setting(p_key text) returns text
language sql stable as $$
  select value from cw.governance_setting where key = p_key
$$;

alter table cw.governance_setting enable row level security;
create policy read_all on cw.governance_setting for select
  using (cw.app_role() is not null);
create policy admin_writes on cw.governance_setting for update
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
grant select on cw.governance_setting to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant update on cw.governance_setting to cw_legal_admin;

-- ════════════════════════════════════════════════════════════════════════════
-- WP-18a · REQUIRED APPROVERS
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY THE APPROVAL SITS BESIDE THE CONCESSION AND NOT INSIDE IT, stated plainly
-- because it is the one place this build departs from the shape CLA §4 draws.
--
-- CLA §4 gives the concession a `state` moving proposed → approved | withdrawn.
-- cw.concession cannot carry that state without fighting WP-06, and fighting
-- WP-06 was explicitly ruled out for this package. Three separate mechanisms
-- put there deliberately would have to be unpicked:
--
--   · cw.concession_immutable() (0003) is an ALLOW-LIST trigger that fires for
--     everyone including the owner, and permits exactly one column to move;
--   · the UPDATE grant is COLUMN-LEVEL on promoted_to_clause alone, so no role
--     can write any other column even in principle;
--   · the RESTRICTIVE policy `promote_once` refuses any UPDATE that does not
--     leave promoted_to_clause populated — so a state change would be blocked
--     even for legal_admin.
--
-- Those three are the reason a concession is evidence rather than a working
-- document, and unpicking them to add a mutable flag would trade a strong
-- guarantee for a weaker one. So the state lives OUTSIDE the immutable record:
--
--     cw.concession                 the proposal — what was asked for, frozen
--     cw.concession_approval        one append-only row per named approver
--     cw.concession_settlement      the moment it came into force, gated
--     cw.concession_withdrawal      the other way out
--     cw.concession_state           the CLA §4 state, derived, not stored
--
-- The guarantee is identical and the honest sentence is the one CLA §4 already
-- uses: "a concession is in force only once approved; a proposed one is visible
-- and pending, never silently binding."

-- ── Who a machine may be, and who it may not ────────────────────────────────
-- A concession row can be written by the matcher on negotiation resolution
-- (CLA §7: "Propose … Automatic"). Recording that honestly is the whole point
-- of ADR-0008's actor_kind distinction, so the concession says so itself.
alter table cw.concession
  add column proposer_kind text not null default 'human'
    check (proposer_kind in ('human','machine'));

comment on column cw.concession.proposer_kind is
  'Who put this position on the table. A machine may propose; a machine may
   never settle. Immutable — see cw.concession_proposer_immutable().';

-- 0003's allow-list trigger names the columns that existed when it was written,
-- so a column added later is outside it and would be freely editable. This
-- closes that: a machine proposal cannot be relabelled as a human one after the
-- fact, which is exactly the rewrite the actor_kind rule exists to prevent.
create or replace function cw.concession_proposer_immutable() returns trigger
language plpgsql as $$
begin
  if new.proposer_kind is distinct from old.proposer_kind then
    raise exception
      'concession % was proposed by a %; who proposed it cannot be rewritten',
      old.concession_id, old.proposer_kind using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger concession_proposer_no_edit
  before update on cw.concession
  for each row execute function cw.concession_proposer_immutable();

-- ── The assigned attorney ───────────────────────────────────────────────────
-- Owner decision 4 names "the assigned attorney". Nothing in the schema knew
-- which attorney that was, so the requirement could not be checked at all.
create table cw.agreement_attorney (
  agreement_id text primary key references cw.agreement(agreement_id),
  attorney     text not null check (btrim(attorney) <> ''),
  assigned_by  text not null,
  assigned_on  date not null default current_date
);

comment on table cw.agreement_attorney is
  'One named attorney per deal. A deal with no assigned attorney cannot settle
   a concession at all — see cw.concession_settlement_gate(). That is deliberate
   fail-closed behaviour: an unassigned deal is a configuration gap, and the
   system''s job is to make the gap visible at the moment it matters.';

-- ── The configurable part ───────────────────────────────────────────────────
-- CLA §4: "Who is required for which contracts is configuration, not a fixed
-- list." So it is a table, per agreement, and the enforcement below reads it
-- rather than naming any body in code.
create table cw.required_approver (
  required_approver_id bigserial primary key,
  agreement_id text not null references cw.agreement(agreement_id),
  body  text not null check (body in
          ('executive','management','iso','privacy','compliance','risk','other')),
  label text not null check (btrim(label) <> ''),
  -- CLA §8: "the named person (never a team inbox)". The system cannot tell a
  -- person from an inbox by looking at a string, and pretending otherwise would
  -- be the product boundary violation this project keeps warning about. What it
  -- CAN do is require a value and record who configured it.
  approver text not null check (btrim(approver) <> ''),
  added_by text not null,
  added_on date not null default current_date,
  unique (agreement_id, approver)
);

create or replace function cw.bind_governance_config_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    if tg_table_name = 'agreement_attorney' then
      new.assigned_by := cw.app_actor();
      new.assigned_on := current_date;
    else
      new.added_by := cw.app_actor();
      new.added_on := current_date;
    end if;
  end if;
  return new;
end $$;

create trigger agreement_attorney_bind_actor
  before insert on cw.agreement_attorney
  for each row execute function cw.bind_governance_config_actor();
create trigger required_approver_bind_actor
  before insert on cw.required_approver
  for each row execute function cw.bind_governance_config_actor();

-- ── The approvals themselves ────────────────────────────────────────────────
-- Governance configuration changes are remove-plus-add so both sides are
-- attributable. An in-place update would bypass the insert actor binding and
-- the removal/addition audit pair.
create or replace function cw.governance_config_no_update() returns trigger
language plpgsql as $$
begin
  raise exception
    '% configuration cannot be updated in place; remove it and add the '
    'replacement so both acts are audited', tg_table_name
    using errcode = 'restrict_violation';
end $$;

create trigger agreement_attorney_no_update
  before update on cw.agreement_attorney
  for each row execute function cw.governance_config_no_update();

create trigger required_approver_no_update
  before update on cw.required_approver
  for each row execute function cw.governance_config_no_update();

create table cw.concession_approval (
  approval_id   bigserial primary key,
  concession_id bigint not null references cw.concession(concession_id),
  approver_kind text not null check (approver_kind in ('requester','attorney','required')),
  required_approver_id bigint references cw.required_approver(required_approver_id),
  approver      text not null check (btrim(approver) <> ''),
  approved_on   date not null default current_date,
  recorded_at   timestamptz not null default now(),
  constraint required_names_its_configuration check (
    (approver_kind = 'required') = (required_approver_id is not null)),
  unique (concession_id, approver_kind, approver)
);

comment on table cw.concession_approval is
  'Append-only. One row per named human who approved this concession. An
   approval cannot be edited or deleted — withdrawing support is a withdrawal
   of the concession, which is its own record.';

-- An approval must name the person the configuration names. Without this the
-- whole model is decorative: anyone could record an "attorney" approval by
-- typing a name into the field, and the count would come out right.
create or replace function cw.approval_names_the_right_person() returns trigger
language plpgsql
-- SECURITY DEFINER for the same reason cw.owns_agreement() is: this reads
-- cw.agreement, cw.agreement_attorney and cw.required_approver to CHECK a
-- claim, and a check that only sees what the claimant is cleared to see is not
-- a check. Under today's grants an invoker-rights version would mostly agree;
-- the point is that it would stop agreeing the moment a grant is narrowed, and
-- it would fail in the permissive direction.
security definer set search_path = cw, pg_temp as $$
declare c cw.concession%rowtype; expected text; ra cw.required_approver%rowtype;
begin
  select * into c from cw.concession where concession_id = new.concession_id;

  if new.approver_kind = 'requester' then
    select a.requester into expected from cw.agreement a
      where a.agreement_id = c.agreement_id;
    if new.approver is distinct from expected then
      raise exception
        'the Requester on % is %, not %; an approval must name the person the '
        'record names', c.agreement_id, coalesce(expected,'(none)'), new.approver
        using errcode = 'check_violation';
    end if;

  elsif new.approver_kind = 'attorney' then
    select t.attorney into expected from cw.agreement_attorney t
      where t.agreement_id = c.agreement_id;
    if expected is null then
      raise exception
        'no attorney is assigned to %, so nobody can approve as the attorney',
        c.agreement_id using errcode = 'check_violation';
    end if;
    if new.approver is distinct from expected then
      raise exception
        'the assigned attorney on % is %, not %', c.agreement_id, expected, new.approver
        using errcode = 'check_violation';
    end if;

  else
    select * into ra from cw.required_approver
      where required_approver_id = new.required_approver_id;
    if ra.agreement_id is distinct from c.agreement_id then
      raise exception
        'required approver % is configured for a different agreement',
        new.required_approver_id using errcode = 'check_violation';
    end if;
    if new.approver is distinct from ra.approver then
      raise exception
        'required approver % is %, not %', ra.label, ra.approver, new.approver
        using errcode = 'check_violation';
    end if;
  end if;
  -- This function is SECURITY DEFINER, so current_user is the owner inside it.
  -- The session's SET ROLE value is the reliable governed/owner boundary here.
  if nullif(current_setting('role', true), 'none') is not null
     and new.approver is distinct from cw.app_actor() then
    raise exception
      'approval by % cannot be recorded by signed-in actor %',
      new.approver, cw.app_actor()
      using errcode = 'insufficient_privilege';
  end if;
  if nullif(current_setting('role', true), 'none') is not null then
    new.approved_on := current_date;
    new.recorded_at := now();
  end if;
  return new;
end $$;

create trigger concession_approval_names_the_right_person
  before insert on cw.concession_approval
  for each row execute function cw.approval_names_the_right_person();

create or replace function cw.approval_append_only() returns trigger
language plpgsql as $$
begin
  raise exception
    'an approval is evidence: it cannot be % once recorded (concession %)',
    case tg_op when 'UPDATE' then 'rewritten' else 'deleted' end,
    old.concession_id using errcode = 'restrict_violation';
end $$;

create trigger concession_approval_no_edit
  before update or delete on cw.concession_approval
  for each row execute function cw.approval_append_only();

create or replace function cw.audit_concession_approval() returns trigger
language plpgsql as $$
begin
  perform cw.audit('concession_approved', new.concession_id::text,
    jsonb_build_object('approver_kind', new.approver_kind,
                       'approver', new.approver,
                       'approved_on', new.approved_on));
  return new;
end $$;

create trigger audit_concession_approval after insert on cw.concession_approval
  for each row execute function cw.audit_concession_approval();

-- ── Who is still missing ────────────────────────────────────────────────────
-- The whole enforcement reduces to this one function, so it is worth being
-- exact about it. It returns the people who have NOT yet approved. Empty means
-- settleable; anything else is the reason it is refused, by name.
create or replace function cw.concession_missing_approvers(p_concession_id bigint)
returns table (approver_kind text, approver text)
language sql stable
-- SECURITY DEFINER, and worth being precise about why rather than overstating
-- it. Under TODAY'S grants every role that can settle a concession can also
-- read the configuration behind it, so an invoker-rights version would give the
-- same answer. This is defence in depth against the version of this schema that
-- someone narrows later: if a grant is tightened and this function still ran
-- with the caller's rights, it would find no required approvers, report nobody
-- missing, and the gate would swing open — quietly, and wider the LESS the
-- caller is allowed to see. A check whose strictness depends on the asker is
-- not a check.
--
-- That does not make the helper a cross-deal directory. Its requester EXECUTE
-- grant exists so a deal owner can see whom they are waiting on; the first CTE
-- therefore restores the ownership scope that SECURITY DEFINER bypasses.
security definer set search_path = cw, pg_temp as $$
  with c as (
    select * from cw.concession
    where concession_id = p_concession_id
      and (
        coalesce(nullif(current_setting('role', true), 'none'), session_user)
          <> 'cw_requester'
        or cw.owns_agreement(agreement_id)
      )
  ),
  needed as (
    select 'requester'::text as approver_kind, a.requester as approver
      from c join cw.agreement a using (agreement_id)
    union all
    select 'attorney', t.attorney
      from c join cw.agreement_attorney t using (agreement_id)
    union all
    select 'required', r.approver
      from c join cw.required_approver r using (agreement_id))
  select n.approver_kind, n.approver
  from needed n
  where not exists (
    select 1 from cw.concession_approval ca
    where ca.concession_id = p_concession_id
      and ca.approver_kind = n.approver_kind
      and ca.approver      = n.approver)
$$;

-- ── Settlement: the act a machine may never perform ─────────────────────────
create table cw.concession_settlement (
  concession_id bigint primary key references cw.concession(concession_id),
  settled_by    text not null check (btrim(settled_by) <> ''),
  settled_on    date not null default current_date,
  approvals_at_settlement int not null,
  recorded_at   timestamptz not null default now()
);

comment on table cw.concession_settlement is
  'A concession is IN FORCE only once this row exists. Until then it is a
   proposal — visible, pending, and binding on nobody (CLA §4).';

create table cw.concession_withdrawal (
  concession_id bigint primary key references cw.concession(concession_id),
  withdrawn_by  text not null check (btrim(withdrawn_by) <> ''),
  reason        text not null check (btrim(reason) <> ''),
  withdrawn_on  date not null default current_date
);

create or replace function cw.bind_concession_action_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    if tg_table_name = 'concession_settlement' then
      new.settled_by := cw.app_actor();
      new.settled_on := current_date;
    else
      new.withdrawn_by := cw.app_actor();
      new.withdrawn_on := current_date;
    end if;
  end if;
  return new;
end $$;

create trigger concession_settlement_bind_actor
  before insert on cw.concession_settlement
  for each row execute function cw.bind_concession_action_actor();
create trigger concession_withdrawal_bind_actor
  before insert on cw.concession_withdrawal
  for each row execute function cw.bind_concession_action_actor();

create or replace function cw.concession_settlement_gate() returns trigger
language plpgsql
-- SECURITY DEFINER so the gate sees the whole configuration regardless of who
-- is settling. Same reasoning, and the same honest caveat, as
-- cw.concession_missing_approvers() above.
security definer set search_path = cw, pg_temp as $$
declare missing text; n int; c cw.concession%rowtype;
begin
  select * into c from cw.concession where concession_id = new.concession_id;

  if exists (select 1 from cw.concession_withdrawal w
             where w.concession_id = new.concession_id) then
    raise exception 'concession % was withdrawn; it cannot be settled',
      new.concession_id using errcode = 'restrict_violation';
  end if;

  -- Fail closed on an unconfigured deal. "The assigned attorney" is not
  -- optional, so a deal with no attorney assigned cannot settle anything —
  -- rather than quietly needing one fewer approval than it should.
  if not exists (select 1 from cw.agreement_attorney t
                 where t.agreement_id = c.agreement_id) then
    raise exception
      'no attorney is assigned to %; a concession cannot be settled without the '
      'assigned attorney (owner decision, 2026-07-25)', c.agreement_id
      using errcode = 'check_violation';
  end if;

  select string_agg(m.approver_kind || ' ' || m.approver, ', ' order by m.approver)
    into missing
  from cw.concession_missing_approvers(new.concession_id) m;

  if missing is not null then
    raise exception
      'concession % cannot be settled: still waiting on %. A machine may propose; '
      'only named people settle (CLA §3, §7)', new.concession_id, missing
      using errcode = 'check_violation';
  end if;

  select count(*) into n from cw.concession_approval
    where concession_id = new.concession_id;
  new.approvals_at_settlement := n;
  return new;
end $$;

create trigger concession_settlement_needs_everyone
  before insert on cw.concession_settlement
  for each row execute function cw.concession_settlement_gate();

create or replace function cw.settlement_append_only() returns trigger
language plpgsql as $$
begin
  raise exception
    'a settlement cannot be %: when a concession came into force, and on whose
     approval, is evidence',
    case tg_op when 'UPDATE' then 'rewritten' else 'deleted' end
    using errcode = 'restrict_violation';
end $$;

create trigger concession_settlement_no_edit
  before update or delete on cw.concession_settlement
  for each row execute function cw.settlement_append_only();

create trigger concession_withdrawal_no_edit
  before update or delete on cw.concession_withdrawal
  for each row execute function cw.settlement_append_only();

create or replace function cw.concession_withdrawal_gate() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from cw.concession_settlement s
             where s.concession_id = new.concession_id) then
    raise exception
      'concession % is already in force; it cannot be withdrawn, only superseded '
      'by a new record', new.concession_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger concession_withdrawal_not_after_settlement
  before insert on cw.concession_withdrawal
  for each row execute function cw.concession_withdrawal_gate();

create or replace function cw.audit_concession_settlement() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'concession_settlement' then
    perform cw.audit('concession_settled', new.concession_id::text,
      jsonb_build_object('settled_by', new.settled_by,
                         'approvals', new.approvals_at_settlement));
  else
    perform cw.audit('concession_withdrawn', new.concession_id::text,
      jsonb_build_object('withdrawn_by', new.withdrawn_by, 'reason', new.reason));
  end if;
  return new;
end $$;

create trigger audit_concession_settlement after insert on cw.concession_settlement
  for each row execute function cw.audit_concession_settlement();
create trigger audit_concession_withdrawal after insert on cw.concession_withdrawal
  for each row execute function cw.audit_concession_settlement();

create or replace function cw.audit_required_approver() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('required_approver_added', new.agreement_id,
      jsonb_build_object('body', new.body, 'label', new.label,
                         'approver', new.approver));
    return new;
  end if;
  perform cw.audit('required_approver_removed', old.agreement_id,
    jsonb_build_object('body', old.body, 'label', old.label,
                       'approver', old.approver));
  return old;
end $$;

create trigger audit_required_approver
  after insert or delete on cw.required_approver
  for each row execute function cw.audit_required_approver();

create or replace function cw.audit_agreement_attorney() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('attorney_assigned', new.agreement_id,
      jsonb_build_object('attorney', new.attorney, 'assigned_by', new.assigned_by));
    return new;
  end if;
  perform cw.audit('attorney_removed', old.agreement_id,
    jsonb_build_object('attorney', old.attorney, 'assigned_by', old.assigned_by));
  return old;
end $$;

create trigger audit_agreement_attorney after insert or delete on cw.agreement_attorney
  for each row execute function cw.audit_agreement_attorney();

-- ── The CLA §4 state, derived rather than stored ────────────────────────────
create or replace view cw.concession_state as
select c.concession_id, c.agreement_id, c.category_key, c.proposer_kind,
       case when w.concession_id is not null then 'withdrawn'
            when s.concession_id is not null then 'approved'
            else 'proposed' end as state,
       s.settled_by, s.settled_on, w.withdrawn_by, w.withdrawn_on
from cw.concession c
left join cw.concession_settlement s using (concession_id)
left join cw.concession_withdrawal w using (concession_id);

comment on view cw.concession_state is
  'CLA §4 state, computed. Anything asking "what did we actually agree to" reads
   cw.concession_in_force, not cw.concession — a proposed concession binds
   nobody.';

create or replace view cw.concession_in_force as
select c.* from cw.concession c
join cw.concession_settlement s using (concession_id)
where not exists (select 1 from cw.concession_withdrawal w
                  where w.concession_id = c.concession_id);

-- ── Row-level security and grants ───────────────────────────────────────────
alter table cw.agreement_attorney    enable row level security;
alter table cw.required_approver     enable row level security;
alter table cw.concession_approval   enable row level security;
alter table cw.concession_settlement enable row level security;
alter table cw.concession_withdrawal enable row level security;

-- Who the attorney is, and who must sign off, is not concession data — it is
-- the shape of the deal's governance, and the Requester has to be able to see
-- who they are waiting on.
create policy read_scoped on cw.agreement_attorney for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));
create policy read_scoped on cw.required_approver for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));

-- CLA §7: "Configure who the Required Approvers are — Legal admin, per
-- agreement." Configuration, so it may be removed as well as added; both are
-- audited, which is what makes removal safe to allow.
create policy admin_writes on cw.agreement_attorney for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.required_approver for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');

-- Approvals and settlements follow the concession's own visibility rule: Legal
-- and Audit see everything, a Requester sees their own deals, a Viewer sees
-- none of it. Concession analytics are commercially sensitive (CLA §7) and who
-- had to be persuaded is part of that.
create policy read_scoped on cw.concession_approval for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.concession c
        where c.concession_id = concession_approval.concession_id
          and cw.owns_agreement(c.agreement_id))));
create policy write_scoped on cw.concession_approval for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

create policy read_scoped on cw.concession_settlement for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.concession c
        where c.concession_id = concession_settlement.concession_id
          and cw.owns_agreement(c.agreement_id))));
create policy write_scoped on cw.concession_settlement for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

create policy read_scoped on cw.concession_withdrawal for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.concession c
        where c.concession_id = concession_withdrawal.concession_id
          and cw.owns_agreement(c.agreement_id))));
create policy write_scoped on cw.concession_withdrawal for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

grant select on cw.agreement_attorney, cw.required_approver
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert, update, delete on cw.agreement_attorney, cw.required_approver
  to cw_legal_admin;
grant usage, select on sequence cw.required_approver_required_approver_id_seq
  to cw_legal_admin;

grant select, insert on cw.concession_approval, cw.concession_settlement,
                        cw.concession_withdrawal
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.concession_approval, cw.concession_settlement,
                cw.concession_withdrawal to cw_auditor;
grant usage, select on sequence cw.concession_approval_approval_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.concession_state, cw.concession_in_force
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

revoke all on function cw.concession_missing_approvers(bigint) from public;
grant execute on function cw.concession_missing_approvers(bigint) to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- ════════════════════════════════════════════════════════════════════════════
-- WP-18b · LEGAL HOLD (LIFECYCLE §3.5)
-- ════════════════════════════════════════════════════════════════════════════
-- A hold suspends destruction for a named matter. The rules are deliberately
-- few, and all of them are here:
--
--   · A hold names its matter. A hold with no matter is not a hold, it is an
--     indefinite delay nobody owns.
--   · Opened and released by named people; both acts audited. Releasing is the
--     consequential act, because it is what lets destruction resume.
--   · Open or released, nothing else.
--   · Several holds may sit on one agreement, from unrelated matters. All must
--     be released before it is destructible.
--   · Retention PAUSES, it does not restart.
create table cw.legal_hold (
  hold_id      bigserial primary key,
  agreement_id text not null references cw.agreement(agreement_id),
  matter_ref   text not null check (btrim(matter_ref) <> ''),
  opened_by    text not null check (btrim(opened_by) <> ''),
  opened_on    date not null default current_date,
  released_by  text,
  released_on  date,
  constraint release_is_both_or_neither check (
    (released_by is null) = (released_on is null)),
  constraint release_after_open check (released_on is null or released_on >= opened_on)
);

comment on table cw.legal_hold is
  'While any hold on an agreement is open, nothing about that agreement may be
   destroyed, however far past its retention date it is. This is not a
   preference the retention job consults if convenient — cw.retention_destroy()
   checks it before doing anything.';

-- A hold can move exactly once, in one direction: open → released. Everything
-- else about it is the record of why destruction was suspended.
-- The permanent attribution is the authenticated session, not a name supplied
-- in SQL. Keep owner writes available for migrations and historical imports:
-- the owner has no application role, while every governed application write
-- does. On release, bind the actor only when the hold actually moves from open
-- to released; the immutability trigger below rejects every other rewrite.
create or replace function cw.bind_legal_hold_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    if tg_op = 'INSERT' then
      new.opened_by := cw.app_actor();
      new.opened_on := current_date;
    elsif old.released_on is null and new.released_on is not null then
      new.released_by := cw.app_actor();
      new.released_on := current_date;
    end if;
  end if;
  return new;
end $$;

create trigger legal_hold_bind_actor
  before insert or update on cw.legal_hold
  for each row execute function cw.bind_legal_hold_actor();

create or replace function cw.legal_hold_immutable() returns trigger
language plpgsql as $$
begin
  if old.released_on is not null then
    raise exception
      'hold % on % was released on %; a released hold cannot be reopened — open a '
      'new hold for the new matter', old.hold_id, old.agreement_id, old.released_on
      using errcode = 'restrict_violation';
  end if;
  if new.hold_id      is distinct from old.hold_id
     or new.agreement_id is distinct from old.agreement_id
     or new.matter_ref   is distinct from old.matter_ref
     or new.opened_by    is distinct from old.opened_by
     or new.opened_on    is distinct from old.opened_on then
    raise exception
      'a legal hold cannot be rewritten; only its release may be recorded (hold %)',
      old.hold_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger legal_hold_no_edit
  before update on cw.legal_hold
  for each row execute function cw.legal_hold_immutable();

-- Settled decision S0-3: a delete on an append-only table RAISES. A caller who
-- believes they removed a hold and did not is in the worst possible position —
-- they think destruction is unblocked when it is not, or the reverse.
create or replace function cw.legal_hold_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'a legal hold cannot be deleted: that a matter once stopped the clock is '
    'itself evidence. Release it instead (hold %)', old.hold_id
    using errcode = 'restrict_violation';
end $$;

create trigger legal_hold_no_delete
  before delete on cw.legal_hold
  for each row execute function cw.legal_hold_no_delete();

-- TRUNCATE fires no row trigger (WP-25b, finding D9). A hold that can be
-- erased wholesale is not a hold, and an approval record that can be is not
-- evidence of who approved anything.
create trigger legal_hold_no_truncate
  before truncate on cw.legal_hold
  for each statement execute function cw.no_truncate();
create trigger concession_approval_no_truncate
  before truncate on cw.concession_approval
  for each statement execute function cw.no_truncate();
create trigger concession_settlement_no_truncate
  before truncate on cw.concession_settlement
  for each statement execute function cw.no_truncate();
create trigger concession_withdrawal_no_truncate
  before truncate on cw.concession_withdrawal
  for each statement execute function cw.no_truncate();

create or replace function cw.audit_legal_hold() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('legal_hold_opened', new.agreement_id,
      jsonb_build_object('hold_id', new.hold_id, 'matter_ref', new.matter_ref,
                         'opened_by', new.opened_by));
  elsif new.released_on is distinct from old.released_on then
    -- The consequential act. This is the one that lets destruction resume, so
    -- it is recorded with who did it and which matter it closed.
    perform cw.audit('legal_hold_released', new.agreement_id,
      jsonb_build_object('hold_id', new.hold_id, 'matter_ref', new.matter_ref,
                         'released_by', new.released_by,
                         'released_on', new.released_on));
  end if;
  return new;
end $$;

create trigger audit_legal_hold after insert or update on cw.legal_hold
  for each row execute function cw.audit_legal_hold();

create or replace function cw.agreement_under_hold(p_agreement_id text)
returns boolean
language sql stable
-- SECURITY DEFINER: the retention path must get the same answer whoever asks.
-- A hold the caller cannot see is still a hold. Today only legal_admin can run
-- the destruction path and legal_admin can read every hold, so this changes no
-- current answer — it is here so that a narrower grant later cannot turn
-- "I cannot see a hold" into "there is no hold".
-- The requester EXECUTE grant is a reporting path, not a litigation oracle:
-- for that role the query restores the same owned-deal scope as legal_hold.
security definer set search_path = cw, pg_temp as $$
  select exists (select 1 from cw.legal_hold h
                 where h.agreement_id = p_agreement_id
                   and h.released_on is null
                   and (
                     coalesce(nullif(current_setting('role', true), 'none'),
                              session_user) <> 'cw_requester'
                     or cw.owns_agreement(h.agreement_id)
                   ))
$$;

-- ── The retention path ──────────────────────────────────────────────────────
-- Retention is a date and a decision. This table is the date; the function
-- below is the decision, and it is the only door.
create table cw.agreement_retention (
  agreement_id    text primary key references cw.agreement(agreement_id),
  retention_until date not null,
  destroyed_on    date,
  destroyed_by    text,
  constraint destruction_is_both_or_neither check (
    (destroyed_on is null) = (destroyed_by is null))
);

comment on table cw.agreement_retention is
  'The 7-year horizon from ARCHITECTURE.md §5. Destruction is recorded here and
   nowhere else, and it goes through cw.retention_destroy() — which refuses
   while any legal hold is open.';

create or replace view cw.retention_due as
select r.agreement_id, r.retention_until,
       cw.agreement_under_hold(r.agreement_id) as under_hold,
       (select string_agg(h.matter_ref, ', ' order by h.matter_ref)
        from cw.legal_hold h
        where h.agreement_id = r.agreement_id and h.released_on is null) as matters
from cw.agreement_retention r
where r.destroyed_on is null and r.retention_until <= current_date;

comment on view cw.retention_due is
  'What the retention sweep would consider today, with the holds that stop it
   named. Held rows stay listed on purpose: "nothing is due" and "everything due
   is frozen by litigation" are different facts and a person needs to see both.';

create or replace function cw.retention_destroy(p_agreement_id text, p_actor text)
returns void
language plpgsql
-- SECURITY DEFINER because the destruction decision must not depend on what the
-- caller can see. A hold hidden by row-level security would otherwise read as
-- no hold — destruction proceeding because the destroyer lacked clearance to
-- know better. EXECUTE is granted to legal_admin only, below.
security definer set search_path = cw, pg_temp as $$
declare r cw.agreement_retention%rowtype; matters text;
begin
  -- The argument is permanent attribution, not an identity selector. Bind it
  -- before checking holds or dates so no refusal or success is misattributed.
  if p_actor is distinct from cw.app_actor() then
    raise exception
      'the retention actor must match the signed-in person; % cannot act as %',
      cw.app_actor(), p_actor using errcode = 'insufficient_privilege';
  end if;

  select * into r from cw.agreement_retention where agreement_id = p_agreement_id;
  if not found then
    raise exception 'no retention record for %; nothing to destroy', p_agreement_id
      using errcode = 'no_data_found';
  end if;
  if r.destroyed_on is not null then
    raise exception '% was already destroyed on %', p_agreement_id, r.destroyed_on
      using errcode = 'restrict_violation';
  end if;

  -- The precondition this whole sub-package exists for, and it is checked
  -- BEFORE the due date so that the error a person sees names the real reason.
  if cw.agreement_under_hold(p_agreement_id) then
    select string_agg(h.matter_ref, ', ' order by h.matter_ref) into matters
    from cw.legal_hold h
    where h.agreement_id = p_agreement_id and h.released_on is null;
    raise exception
      '% is under legal hold (%); destruction is suspended until every hold is '
      'released', p_agreement_id, matters using errcode = 'restrict_violation';
  end if;

  if r.retention_until > current_date then
    raise exception 'the retention period for % runs to %; it is not due',
      p_agreement_id, r.retention_until using errcode = 'restrict_violation';
  end if;

  update cw.agreement_retention
     set destroyed_on = current_date, destroyed_by = p_actor
   where agreement_id = p_agreement_id;

  perform cw.audit('retention_destroyed', p_agreement_id,
    jsonb_build_object('retention_until', r.retention_until, 'destroyed_by', p_actor));
end $$;

alter table cw.legal_hold           enable row level security;
alter table cw.agreement_retention  enable row level security;

create policy read_scoped on cw.legal_hold for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));
create policy admin_opens on cw.legal_hold for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));
create policy admin_releases on cw.legal_hold for update
  using      (cw.app_role() = 'legal_admin')
  with check (cw.app_role() = 'legal_admin');

create policy read_scoped on cw.agreement_retention for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor'));
create policy admin_writes on cw.agreement_retention for insert
  with check (cw.app_role() = 'legal_admin');

grant select, insert on cw.legal_hold to cw_legal_reviewer, cw_legal_admin;
grant update (released_by, released_on) on cw.legal_hold to cw_legal_admin;
grant select on cw.legal_hold to cw_auditor, cw_requester;
grant usage, select on sequence cw.legal_hold_hold_id_seq
  to cw_legal_reviewer, cw_legal_admin;
grant select, insert on cw.agreement_retention to cw_legal_admin;
grant select on cw.agreement_retention, cw.retention_due
  to cw_legal_reviewer, cw_auditor;
grant select on cw.retention_due to cw_legal_admin;

revoke all on function cw.retention_destroy(text, text) from public;
grant execute on function cw.retention_destroy(text, text) to cw_legal_admin;
revoke all on function cw.agreement_under_hold(text) from public;
grant execute on function cw.agreement_under_hold(text) to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
