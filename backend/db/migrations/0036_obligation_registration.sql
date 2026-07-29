-- 0036 · Registration — the deterministic derivation at execution (OB-02)
--
-- OBLIGATIONS-ARCHITECTURE.md §2.2. When an agreement executes, the system
-- already knows what it committed to — every sentence arrived by clause ID. So
-- registration is a LOOKUP, never an analysis: walk the frozen decision set,
-- read each pinned clause version's obligation templates AS THEY STOOD on the
-- execution date, resolve the schedule to concrete dates from the executed
-- record, and write obligation instances. No model runs anywhere near this.
--
-- Three properties, each load-bearing:
--
--   · PINNED. The template window is approved_on <= executed_on < retired_on,
--     so a template authored or retired later reaches FUTURE executions only.
--     No signed deal's obligation set ever changes because Legal improved a
--     template (the ADR-0006 rule, extended past signature).
--   · IDEMPOTENT. Registration inserts what is missing by
--     (agreement, template, occurrence) and nothing else. A re-run adds
--     nothing; extending the horizon appends occurrences. That insert-missing
--     shape is the idempotence mechanism, stated rather than smuggled.
--   · RE-DERIVABLE. cw.obligation_rederive() recomputes the set and reports
--     every disagreement with what is stored. A disagreement is an incident to
--     investigate, never something registration "refreshes".
--
-- What is deliberately DEFERRED, stated rather than smoothed over: templates
-- anchored on 'termination' (survival duties) and on a term_end the agreement
-- does not have register UNANCHORED — due_on null, visibly pending. Wiring the
-- termination date to anchor them belongs to the package that builds
-- termination properly; a guessed date here would be a lie with a deadline.

-- ── The instances ───────────────────────────────────────────────────────────
-- Template fields are copied onto the instance at registration. The template is
-- immutable once approved (0035), so the copy cannot drift from its source —
-- what it buys is that an instance reads whole without a join, and that
-- cw.obligation_rederive can diff the record against the derivation.
create table cw.obligation_instance (
  obligation_id bigserial primary key,
  agreement_id  text not null references cw.executed_agreement(agreement_id),
  -- The provenance chain, always: obligation -> clause -> policy -> reviewer.
  clause_id     text not null,
  version       int  not null,
  template_id   bigint not null references cw.obligation_template(template_id),
  occurrence    int  not null check (occurrence >= 0),
  kind          text not null,
  obliged       text not null,
  summary       text not null,
  -- The accountable PERSON (never a team inbox): the deal's requester at
  -- registration. Reassignment is a recorded act (OB-04), not an edit here.
  owner_person  text,
  -- Null means unanchored (termination-anchored, or a missing term_end) —
  -- visibly pending, never silently dated.
  due_on        date,
  evidence      text not null,
  lead_days     int  not null,
  survives      boolean not null,
  entitlement   boolean not null,
  registered_at timestamptz not null default now(),
  unique (agreement_id, template_id, occurrence),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version)
);

create index on cw.obligation_instance (agreement_id);
create index on cw.obligation_instance (due_on);

-- ── The gaps ────────────────────────────────────────────────────────────────
-- A clause in force declaring no obligations is REPORTED, not guessed at.
-- During development every gap is expected — content is placeholder — and in
-- production this table is how Legal phases the authoring backlog by seeing
-- which in-force clauses are silent. The system's job ends at making the gap
-- visible.
create table cw.obligation_coverage_gap (
  agreement_id  text not null references cw.executed_agreement(agreement_id),
  clause_id     text not null,
  version       int  not null,
  registered_at timestamptz not null default now(),
  primary key (agreement_id, clause_id, version),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version)
);

-- ── Registered means registered ─────────────────────────────────────────────
-- Instances and gaps are derivation output. Nothing edits or deletes them —
-- acts about an obligation live in their own append-only record (OB-04), and
-- a wrong derivation is an incident, not an edit.
create or replace function cw.obligation_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'the obligation record is derivation output and cannot be rewritten: '
    '% is append-only; acts about an obligation are their own record',
    tg_table_name
    using errcode = 'restrict_violation';
end $$;

do $$
declare t text;
begin
  foreach t in array array['obligation_instance','obligation_coverage_gap'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.obligation_frozen()', t, t);
    execute format('create trigger %I_no_delete before delete on cw.%I
                    for each row execute function cw.obligation_frozen()', t, t);
    execute format('create trigger %I_no_truncate before truncate on cw.%I
                    execute function cw.obligation_frozen()', t, t);
  end loop;
end $$;

-- ── The derivation, in one place ────────────────────────────────────────────
-- One function feeds BOTH registration and the re-derivation check, so the two
-- can never quietly compute different answers. SECURITY DEFINER because the
-- trigger that calls it fires on a legal_admin's insert, and that role holds
-- no privilege on the obligation tables — by design, since nothing but this
-- derivation may write them.
create or replace function cw.derive_obligations(p_agreement_id text, p_through date)
returns table (
  clause_id text, version int, template_id bigint, occurrence int,
  kind text, obliged text, summary text, due_on date,
  evidence text, lead_days int, survives boolean, entitlement boolean
)
language sql stable
security definer set search_path = cw, pg_temp as $$
  with ea as (
    select * from cw.executed_agreement where agreement_id = p_agreement_id
  ),
  picked as (
    select distinct d.clause_id, d.version
    from ea join cw.run_decision d on d.run_id = ea.run_id
    where d.clause_id is not null
  ),
  -- The pin: templates as they stood on the execution date. Approved by then,
  -- not yet retired by then. A template approved afterwards reaches future
  -- executions only; one retired afterwards still governed this one.
  tpl as (
    select t.*
    from picked p
    join cw.obligation_template t
      on t.clause_id = p.clause_id and t.version = p.version
    cross join ea
    where t.approved_on is not null
      and t.approved_on <= ea.executed_on
      and (t.retired_on is null or t.retired_on > ea.executed_on)
  ),
  anchored as (
    select t.template_id, t.clause_id, t.version, t.kind, t.obliged, t.summary,
           t.schedule_kind, t.offset_days, t.every_months, t.evidence,
           t.lead_days, t.survives, t.entitlement,
           case t.anchor
             when 'effective_on' then ea.effective_on
             when 'executed_on'  then ea.executed_on
             when 'term_end'     then ea.term_end
             else null                        -- 'termination': not yet known
           end as anchor_date,
           ea.term_end
    from tpl t cross join ea
  )
  select a.clause_id, a.version, a.template_id, occ.k as occurrence,
         a.kind, a.obliged, a.summary,
         case when a.anchor_date is null then null
              else (a.anchor_date + make_interval(days => a.offset_days,
                      months => coalesce(a.every_months, 0) * occ.k))::date
         end as due_on,
         a.evidence, a.lead_days, a.survives, a.entitlement
  from anchored a
  cross join lateral generate_series(0,
    case when a.schedule_kind = 'recurring' and a.anchor_date is not null
         -- A generous upper bound; the WHERE below is what actually decides.
         then greatest(0, ((p_through - a.anchor_date) / 28) / a.every_months + 2)
         else 0 end) as occ(k)
  where a.anchor_date is null
     or a.schedule_kind <> 'recurring'
     -- Recurring occurrences run to the horizon, and never past the term.
     or (a.anchor_date + make_interval(days => a.offset_days,
           months => a.every_months * occ.k))::date
        <= least(p_through, coalesce(a.term_end, p_through))
$$;

revoke all on function cw.derive_obligations(text, date) from public;

-- ── Registration ────────────────────────────────────────────────────────────
create or replace function cw.register_obligations(
  p_agreement_id text, p_through date default null
) returns int
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare ea cw.executed_agreement%rowtype; horizon date; added int; gaps int;
begin
  select * into ea from cw.executed_agreement where agreement_id = p_agreement_id;
  if not found then
    raise exception 'no executed agreement %; obligations register from the '
      'executed record, nothing else', p_agreement_id
      using errcode = 'no_data_found';
  end if;

  -- 13 months: one year of calendar plus a month of runway (OA §2.2).
  horizon := coalesce(p_through,
    (greatest(current_date, ea.executed_on) + interval '13 months')::date);

  insert into cw.obligation_instance
    (agreement_id, clause_id, version, template_id, occurrence, kind, obliged,
     summary, owner_person, due_on, evidence, lead_days, survives, entitlement)
  select p_agreement_id, d.clause_id, d.version, d.template_id, d.occurrence,
         d.kind, d.obliged, d.summary,
         (select a.requester from cw.agreement a
           where a.agreement_id = p_agreement_id),
         d.due_on, d.evidence, d.lead_days, d.survives, d.entitlement
  from cw.derive_obligations(p_agreement_id, horizon) d
  where not exists (select 1 from cw.obligation_instance i
                     where i.agreement_id = p_agreement_id
                       and i.template_id  = d.template_id
                       and i.occurrence   = d.occurrence);
  get diagnostics added = row_count;

  insert into cw.obligation_coverage_gap (agreement_id, clause_id, version)
  select p_agreement_id, pk.clause_id, pk.version
  from (select distinct rd.clause_id, rd.version
          from cw.run_decision rd
         where rd.run_id = ea.run_id and rd.clause_id is not null) pk
  where not exists (select 1 from cw.derive_obligations(p_agreement_id, horizon) x
                     where x.clause_id = pk.clause_id and x.version = pk.version)
    and not exists (select 1 from cw.obligation_coverage_gap g
                     where g.agreement_id = p_agreement_id
                       and g.clause_id = pk.clause_id and g.version = pk.version);
  get diagnostics gaps = row_count;

  -- Derivation is not a decision: the machine actor kind, never a human's
  -- (ADR-0008 §3). Silent when nothing changed — an idempotent re-run that
  -- audited "nothing happened" would bury the chain in noise.
  if added > 0 or gaps > 0 then
    perform cw.audit('obligations_registered', p_agreement_id,
      jsonb_build_object('instances', added, 'coverage_gaps', gaps), 'system');
  end if;
  return added;
end $$;

revoke all on function cw.register_obligations(text, date) from public;
grant execute on function cw.register_obligations(text, date) to cw_legal_admin;

-- Fires on execution. The filing of the signed contract is the trigger point —
-- the signature connection (OB-12/13) arrives at this same recorded act, so it
-- needs nothing further to make registration happen.
create or replace function cw.register_on_execution() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
begin
  perform cw.register_obligations(new.agreement_id);
  return new;
end $$;

create trigger obligations_register_on_execution
  after insert on cw.executed_agreement
  for each row execute function cw.register_on_execution();

-- ── The re-derivation check ─────────────────────────────────────────────────
-- Recompute and diff. Three disagreement shapes, each named: a stored row the
-- derivation no longer produces, a derivable row the record is missing, and a
-- due date that moved. Any row from this function is an incident.
create or replace function cw.obligation_rederive(
  p_agreement_id text, p_through date default null
) returns table (template_id bigint, occurrence int, disagreement text,
                 stored_due date, derived_due date)
language plpgsql stable
security definer set search_path = cw, pg_temp as $$
declare ea cw.executed_agreement%rowtype; horizon date;
begin
  select * into ea from cw.executed_agreement where agreement_id = p_agreement_id;
  if not found then
    raise exception 'no executed agreement %', p_agreement_id
      using errcode = 'no_data_found';
  end if;
  horizon := coalesce(p_through,
    (greatest(current_date, ea.executed_on) + interval '13 months')::date);

  return query
  select coalesce(i.template_id, d.template_id),
         coalesce(i.occurrence,  d.occurrence),
         case when i.template_id is null then 'missing from the record'
              when d.template_id is null then 'not derivable'
              when i.due_on is distinct from d.due_on then 'due date disagrees'
         end,
         i.due_on, d.due_on
  from (select * from cw.obligation_instance x
         where x.agreement_id = p_agreement_id) i
  full outer join cw.derive_obligations(p_agreement_id, horizon) d
    on d.template_id = i.template_id and d.occurrence = i.occurrence
  where i.template_id is null or d.template_id is null
     or i.due_on is distinct from d.due_on;
end $$;

revoke all on function cw.obligation_rederive(text, date) from public;
grant execute on function cw.obligation_rederive(text, date) to
  cw_auditor, cw_legal_admin;

-- ── Who sees what ───────────────────────────────────────────────────────────
-- The concession-family scoping: Legal, the Auditor and the Administrator (U5)
-- see all; a requester sees their own deals at the table. The
-- openness-by-default reading surfaces (open-questions §12) come with the
-- workspace views, deliberately, not by accident here.
alter table cw.obligation_instance     enable row level security;
alter table cw.obligation_coverage_gap enable row level security;

create policy read_scoped on cw.obligation_instance for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester'
      and cw.owns_agreement(obligation_instance.agreement_id)));

create policy read_scoped on cw.obligation_coverage_gap for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester'
      and cw.owns_agreement(obligation_coverage_gap.agreement_id)));

revoke all on cw.obligation_instance     from public;
revoke all on cw.obligation_coverage_gap from public;
grant select on cw.obligation_instance, cw.obligation_coverage_gap to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
-- No INSERT, UPDATE or DELETE grant to anybody: the derivation writes through
-- definer rights, and nothing else writes at all.
