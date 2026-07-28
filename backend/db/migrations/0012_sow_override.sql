-- 0012 · A statement of work may contradict its master — with the same approval.
--
-- OWNER DECISION U2, SETTLED 2026-07-26.
--
-- The question was: may a statement of work take a different position on a
-- category its master agreement already settles? `0010` shipped the stricter
-- reading as a default and left the row marked `decided = false`, because it is
-- a legal convention rather than an engineering choice.
--
-- The owner has settled it: **yes, when it goes through the same approval as a
-- concession.** That is deliberately not the same as "yes". Contradicting the
-- master is exactly as consequential as conceding a position to a supplier — in
-- both cases the company ends up bound by something other than its standard
-- position — so it earns the same signatures: the Requester, the assigned
-- attorney, and every approver configured for that deal.
--
-- The setting therefore takes a third value rather than flipping to a boolean:
--
--   'false'          a SOW may not contradict its master (0010's default)
--   'with_approval'  it may, per category, once approved  ← settled
--   'true'           it may, unconditionally (nobody has chosen this)
--
-- Why a per-category override rather than a per-SOW switch: "this work order
-- departs from the master on liability" is a decision someone can weigh. "This
-- work order may depart from the master on anything" is not — it is a blank
-- cheque, and it would be signed once and then inherited by every later
-- amendment to that SOW without anyone looking again.
--
-- The honest limit, restated from `0010`: obligations do not exist anywhere in
-- the backend, so this governs which CLAUSE POSITION a SOW may take. It does
-- not yet reconcile what the two documents actually oblige the parties to do.

-- ── The override: a proposal to depart from the master, on one category ─────
create table cw.sow_override (
  override_id  bigserial primary key,
  sow_id       text not null references cw.agreement(agreement_id),
  category_key text not null references cw.category(key),
  -- Why this departure is justified. Required and non-empty: an override with
  -- no stated reason is the artefact an auditor will ask about first, and
  -- "someone approved it" is not an answer to "why".
  reason       text not null check (btrim(reason) <> ''),
  proposed_by  text not null check (btrim(proposed_by) <> ''),
  -- A machine may propose this, exactly as it may propose a concession. It may
  -- never approve it. Immutable once written (see the trigger below).
  proposer_kind text not null default 'human'
                  check (proposer_kind in ('human','machine')),
  created_at   timestamptz not null default now(),
  unique (sow_id, category_key)
);

comment on table cw.sow_override is
  'A PROPOSAL to let one statement of work depart from its master on one
   category. It binds nobody until cw.sow_override_settlement exists for it —
   read cw.sow_override_in_force, never this table, to answer "may it?".';

-- ── Approvals, append-only, mirroring cw.concession_approval ────────────────
create table cw.sow_override_approval (
  approval_id   bigserial primary key,
  override_id   bigint not null references cw.sow_override(override_id),
  approver_kind text not null check (approver_kind in ('requester','attorney','required')),
  required_approver_id bigint references cw.required_approver(required_approver_id),
  approver      text not null check (btrim(approver) <> ''),
  approved_on   date not null default current_date,
  recorded_at   timestamptz not null default now(),
  constraint required_names_its_configuration check (
    (approver_kind = 'required') = (required_approver_id is not null)),
  unique (override_id, approver_kind, approver)
);

create or replace function cw.sow_approval_names_the_right_person() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare o cw.sow_override%rowtype; expected text;
        ra cw.required_approver%rowtype;
begin
  select * into o from cw.sow_override where override_id = new.override_id;

  if new.approver_kind = 'requester' then
    select a.requester into expected from cw.agreement a
     where a.agreement_id = o.sow_id;
    if new.approver is distinct from expected then
      raise exception
        'the Requester on % is %, not %; an approval must name the configured person',
        o.sow_id, coalesce(expected, '(none)'), new.approver
        using errcode = 'check_violation';
    end if;
  elsif new.approver_kind = 'attorney' then
    select t.attorney into expected from cw.agreement_attorney t
     where t.agreement_id = o.sow_id;
    if expected is null or new.approver is distinct from expected then
      raise exception
        'the assigned attorney on % is %, not %',
        o.sow_id, coalesce(expected, '(none)'), new.approver
        using errcode = 'check_violation';
    end if;
  else
    select * into ra from cw.required_approver
     where required_approver_id = new.required_approver_id;
    if ra.agreement_id is distinct from o.sow_id then
      raise exception 'required approver % is configured for a different agreement',
        new.required_approver_id using errcode = 'check_violation';
    end if;
    if new.approver is distinct from ra.approver then
      raise exception 'required approver % is %, not %',
        ra.label, ra.approver, new.approver using errcode = 'check_violation';
    end if;
  end if;

  -- SECURITY DEFINER changes current_user, so use the session's SET ROLE value
  -- to preserve owner imports while governing every application insert.
  if nullif(current_setting('role', true), 'none') is not null then
    if new.approver is distinct from cw.app_actor() then
      raise exception 'approval by % cannot be recorded by signed-in actor %',
        new.approver, cw.app_actor()
        using errcode = 'insufficient_privilege';
    end if;
    new.approved_on := current_date;
    new.recorded_at := now();
  end if;
  return new;
end $$;

create trigger sow_override_approval_names_the_right_person
  before insert on cw.sow_override_approval
  for each row execute function cw.sow_approval_names_the_right_person();

-- Who has not signed yet. Same shape, and the same SECURITY DEFINER reasoning,
-- as cw.concession_missing_approvers: a check whose strictness depends on what
-- the asker happens to be allowed to see is not a check.
-- Its requester-callable reporting path is still deal-scoped: definer rights
-- provide a complete answer for an owned SOW, not approver identities from
-- somebody else's.
create or replace function cw.sow_override_missing_approvers(p_override_id bigint)
returns table (approver_kind text, approver text)
language sql stable
security definer set search_path = cw, pg_temp as $$
  with o as (
    select * from cw.sow_override
    where override_id = p_override_id
      and (
        coalesce(nullif(current_setting('role', true), 'none'), session_user)
          <> 'cw_requester'
        or cw.owns_agreement(sow_id)
      )
  ),
  needed as (
    select 'requester'::text as approver_kind, a.requester as approver
      from o join cw.agreement a on a.agreement_id = o.sow_id
    union all
    select 'attorney', t.attorney
      from o join cw.agreement_attorney t on t.agreement_id = o.sow_id
    union all
    select 'required', r.approver
      from o join cw.required_approver r on r.agreement_id = o.sow_id)
  select n.approver_kind, n.approver
  from needed n
  where not exists (
    select 1 from cw.sow_override_approval oa
    where oa.override_id   = p_override_id
      and oa.approver_kind = n.approver_kind
      and oa.approver      = n.approver)
$$;

-- ── Settlement: the act that actually authorises the departure ──────────────
create table cw.sow_override_settlement (
  override_id            bigint primary key references cw.sow_override(override_id),
  settled_by             text not null check (btrim(settled_by) <> ''),
  settled_on             date not null default current_date,
  approvals_at_settlement int
);

create or replace function cw.bind_sow_override_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    if tg_table_name = 'sow_override' then
      new.proposed_by := cw.app_actor();
    else
      new.settled_by := cw.app_actor();
    end if;
  end if;
  return new;
end $$;

create trigger sow_override_bind_actor
  before insert on cw.sow_override
  for each row execute function cw.bind_sow_override_actor();
create trigger sow_override_settlement_bind_actor
  before insert on cw.sow_override_settlement
  for each row execute function cw.bind_sow_override_actor();

create or replace function cw.sow_override_gate() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare missing text; n int; o cw.sow_override%rowtype;
begin
  select * into o from cw.sow_override where override_id = new.override_id;

  -- Fail closed on an unconfigured deal, for the same reason concessions do:
  -- "the assigned attorney" is not optional, and a deal with no attorney must
  -- not quietly need one fewer approval than it should.
  if not exists (select 1 from cw.agreement_attorney t
                 where t.agreement_id = o.sow_id) then
    raise exception
      'no attorney is assigned to %; a departure from the master cannot be '
      'authorised without the assigned attorney (owner decision, 2026-07-25)',
      o.sow_id using errcode = 'check_violation';
  end if;

  select string_agg(m.approver_kind || ' ' || m.approver, ', ' order by m.approver)
    into missing
  from cw.sow_override_missing_approvers(new.override_id) m;

  if missing is not null then
    raise exception
      'statement of work % cannot depart from its master on % yet: still waiting '
      'on %. A machine may propose; only named people authorise (CLA §3, §7)',
      o.sow_id, o.category_key, missing
      using errcode = 'check_violation';
  end if;

  select count(*) into n from cw.sow_override_approval
    where override_id = new.override_id;
  new.approvals_at_settlement := n;
  return new;
end $$;

create trigger sow_override_needs_everyone
  before insert on cw.sow_override_settlement
  for each row execute function cw.sow_override_gate();

-- Evidence, not working state: when a departure was authorised and on whose
-- approval cannot be rewritten or erased.
create or replace function cw.sow_override_append_only() returns trigger
language plpgsql as $$
begin
  raise exception
    'a statement-of-work override cannot be %: what was authorised, and by whom, '
    'is evidence',
    case tg_op when 'UPDATE' then 'rewritten' else 'deleted' end
    using errcode = 'restrict_violation';
end $$;

create trigger sow_override_no_edit
  before update or delete on cw.sow_override
  for each row execute function cw.sow_override_append_only();

create trigger sow_override_approval_no_edit
  before update or delete on cw.sow_override_approval
  for each row execute function cw.sow_override_append_only();

create trigger sow_override_settlement_no_edit
  before update or delete on cw.sow_override_settlement
  for each row execute function cw.sow_override_append_only();

create or replace view cw.sow_override_in_force as
select o.* from cw.sow_override o
join cw.sow_override_settlement s using (override_id);

comment on view cw.sow_override_in_force is
  'The authorised departures. Anything asking "may this SOW contradict its
   master here?" reads THIS, never cw.sow_override — a proposed override
   authorises nothing.';

create or replace function cw.audit_sow_override() returns trigger
language plpgsql as $$
declare o cw.sow_override%rowtype;
begin
  select * into o from cw.sow_override where override_id = new.override_id;
  perform cw.audit('sow_override_authorised', o.sow_id,
    jsonb_build_object('category_key', o.category_key,
                       'settled_by',   new.settled_by,
                       'approvals',    new.approvals_at_settlement,
                       'reason',       o.reason));
  return new;
end $$;

create trigger audit_sow_override after insert on cw.sow_override_settlement
  for each row execute function cw.audit_sow_override();

-- ── The guard, replacing the one in 0006 ────────────────────────────────────
-- Same function, one new branch. `0006` is left as the record of what shipped
-- before the owner settled U2; this is the record of the decision.
-- Everything before the U2 branch is `0006`'s logic, unchanged and deliberately
-- so. The parent-kind checks and their exact messages are load-bearing — one of
-- them is asserted by name, and the "standalone may not name a master" rule is
-- a table CHECK constraint, not this function's job. Only the U2 branch below
-- is new.
create or replace function cw.sow_hangs_off_a_master() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare parent_kind text; clashes text; mode text;
begin
  if new.agreement_kind <> 'sow' then return new; end if;

  select agreement_kind into parent_kind from cw.executed_agreement
   where agreement_id = new.parent_agreement_id;
  if parent_kind is null then
    raise exception
      'statement of work % names % as its master, but no executed agreement of '
      'that id exists', new.agreement_id, new.parent_agreement_id
      using errcode = 'foreign_key_violation';
  end if;
  if parent_kind <> 'master' then
    raise exception
      'statement of work % names % as its master, but that agreement is a %; '
      'only a master may carry statements of work',
      new.agreement_id, new.parent_agreement_id, parent_kind
      using errcode = 'check_violation';
  end if;

  mode := cw.setting('sow_may_contradict_master');
  if mode = 'true' then return new; end if;

  -- Which categories does this SOW settle differently from its master? Under
  -- 'with_approval', a clash that carries an in-force override is not a clash —
  -- it is a decision somebody signed for.
  select string_agg(x.category_key || ' (master ' || x.master_clause ||
                    ', sow ' || x.sow_clause || ')', ', ' order by x.category_key)
    into clashes
  from (
    select sd.category_key,
           md.clause_id as master_clause,
           sd.clause_id as sow_clause
    from cw.run_decision sd
    join cw.executed_agreement m on m.agreement_id = new.parent_agreement_id
    join cw.run_decision md on md.run_id = m.run_id
                           and md.category_key = sd.category_key
    where sd.run_id = new.run_id
      and sd.clause_id is not null and md.clause_id is not null
      and sd.clause_id is distinct from md.clause_id
      and not (mode = 'with_approval' and exists (
            select 1 from cw.sow_override_in_force o
            where o.sow_id = new.agreement_id
              and o.category_key = sd.category_key))) x;

  if clashes is not null then
    if mode = 'with_approval' then
      raise exception
        'statement of work % departs from its master % on %, and that departure '
        'has not been authorised. Record a cw.sow_override for each category and '
        'have it approved by the Requester, the assigned attorney and every '
        'configured approver (owner decision U2, 2026-07-26)',
        new.agreement_id, new.parent_agreement_id, clashes
        using errcode = 'check_violation';
    end if;
    raise exception
      'statement of work % contradicts its master % on %. By default a SOW may '
      'add to its master but not contradict it; amend the master instead',
      new.agreement_id, new.parent_agreement_id, clashes
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ── The owner's decisions, now settled ──────────────────────────────────────
update cw.governance_setting set
  value = 'with_approval', decided = true, decided_by = 'owner',
  rationale =
    'U2 — SETTLED 2026-07-26 by the owner. A statement of work MAY depart from '
    'its master, per category, once it has the same approval a concession needs: '
    'the Requester, the assigned attorney, and every configured approver. '
    'Contradicting the master binds the company to something other than its '
    'standard position, which is exactly what a concession does, so it earns the '
    'same signatures. Per-category rather than per-SOW, because a blanket '
    'permission is signed once and then inherited by every later amendment '
    'without anyone looking again. Enforced in cw.sow_hangs_off_a_master().'
where key = 'sow_may_contradict_master';

update cw.governance_setting set
  decided = true, decided_by = 'owner',
  rationale =
    'U1 — SETTLED 2026-07-26 by the owner. A renewal opens from the positions '
    'actually in force in the executed agreement, with the drift report '
    'alongside, because that is how counterparties behave: they expect last '
    'year''s deal as the starting point. Restarting from library standard '
    'remains fully built and reachable as an explicit, recorded choice. The '
    'known cost, accepted: a concession can become permanent unless somebody '
    'reads the drift report, so that report is the control and must stay in '
    'front of whoever opens the renewal.'
where key = 'renewal_default_baseline';

insert into cw.governance_setting (key, value, is_owner_decision, decided, decided_by, rationale)
values
  ('unedited_approval_threshold', '', true, true, 'owner',
   'U4 — SETTLED 2026-07-26 by the owner, and settled as DELIBERATELY UNSET. '
   'The rate at which AI-drafted wording is approved with no edits is measured '
   'and shown to Legal from day one (cw.review_quality), and nothing is blocked '
   'on it yet. Legal sets the number with counsel, against real data rather '
   'than a guess. An empty value here means "measured, no threshold" — it does '
   'NOT mean nobody has thought about it. The system must never choose this '
   'number: that is the product boundary, and picking a legal review standard '
   'is content, not system.'),
  ('owner_maps_to_application_role', 'none', false, true, 'engineering',
   'U3 — settled in engineering, not an owner decision. The database owner maps '
   'to NO application role, so cw.app_role() returns null for it and every '
   'governed act must be performed as a named role. This is what makes the test '
   'suite able to see permission faults at all: run as the owner, every policy '
   'is bypassed and a missing protection is invisible.');

comment on table cw.governance_setting is
  'Owner decisions, held as data rather than prose. A decision recorded in a
   document gets read once; a decision recorded here is encountered by whoever
   next touches the thing it governs. `decided = false` means genuinely open —
   the value is what ships meanwhile, not what was chosen.';

-- ── Grants and row-level security ───────────────────────────────────────────
alter table cw.sow_override            enable row level security;
alter table cw.sow_override_approval   enable row level security;
alter table cw.sow_override_settlement enable row level security;

create policy read_scoped on cw.sow_override for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(sow_id)));
create policy read_all on cw.sow_override_approval for select
  using (cw.app_role() is not null);
create policy read_all on cw.sow_override_settlement for select
  using (cw.app_role() is not null);

-- A Requester may propose a departure and record their own approval. Only Legal
-- may authorise one — the same split as concessions.
create policy propose on cw.sow_override for insert with check (
  cw.app_role() in ('legal_reviewer','legal_admin')
  or (cw.app_role() = 'requester' and cw.owns_agreement(sow_id)));
create policy approve on cw.sow_override_approval for insert with check (
  cw.app_role() in ('requester','legal_reviewer','legal_admin'));
create policy authorise on cw.sow_override_settlement for insert with check (
  cw.app_role() in ('legal_reviewer','legal_admin'));

grant select on cw.sow_override, cw.sow_override_approval,
                cw.sow_override_settlement, cw.sow_override_in_force
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert on cw.sow_override, cw.sow_override_approval
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant insert on cw.sow_override_settlement
  to cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.sow_override_override_id_seq,
                       cw.sow_override_approval_approval_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;

revoke all on function cw.sow_override_missing_approvers(bigint) from public;
grant execute on function cw.sow_override_missing_approvers(bigint) to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

create index sow_override_by_sow on cw.sow_override (sow_id, category_key);
create index sow_override_approval_by_override on cw.sow_override_approval (override_id);
