-- 0003 · Fallback ladders and the concession record.
--
-- Implements CLAUSE-LIBRARY-ARCHITECTURE.md §3–§6 and ADR-0009.
--
-- The rule this migration exists to enforce: accepting a vendor's wording is a
-- CONCESSION scoped to one deal. It does not change the library. There is
-- exactly one path from conceded text into approved language — cw.promote_
-- concession() — and it is a deliberate Legal admin act.

-- ── Agreement (minimal) ─────────────────────────────────────────────────────
-- A concession has to belong to a deal. This is the small certain subset of the
-- executed-agreement record; LIFECYCLE-ARCHITECTURE.md §5 extends it with the
-- library snapshot pin, decision set, term and status machine.
create table cw.agreement (
  agreement_id text primary key,
  counterparty text not null,
  sector       text,
  value_usd    numeric(14,2),
  requester    text not null,          -- who owns the deal; drives RLS below
  status       text not null default 'negotiating'
                 check (status in ('negotiating','executed','terminated')),
  created_at   timestamptz not null default now()
);

-- ── Ladders (CLA §3) ────────────────────────────────────────────────────────
-- A pre-approved retreat path per category. Every rung is ordinary approved
-- clause text — a ladder is metadata over clauses, not a new kind of content.
create table cw.ladder (
  ladder_id    bigserial primary key,
  category_key text not null references cw.category(key),
  severity     text not null check (severity in ('Standard','High')),
  owner        text not null,
  reviewed_on  date,
  unique (category_key, severity)
);

create table cw.ladder_rung (
  ladder_id  bigint not null references cw.ladder(ladder_id) on delete cascade,
  rung       int    not null check (rung >= 0),   -- 0 = preferred position
  clause_id  text   not null,
  version    int    not null,
  is_floor   boolean not null default false,
  primary key (ladder_id, rung),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version),
  unique (ladder_id, clause_id, version)
);

comment on column cw.ladder_rung.is_floor is
  'The last position we will accept. Below it, escalation is mandatory — no
   similarity score, auto-approve, or threshold may bypass it (CLA §3).';

-- Exactly one floor per ladder.
create unique index ladder_one_floor on cw.ladder_rung (ladder_id) where is_floor;

-- Rungs must be contiguous from 0, or "descend one rung" is meaningless.
create or replace function cw.ladder_rungs_contiguous() returns trigger
language plpgsql as $$
declare lid bigint; n int; mx int;
begin
  lid := coalesce(new.ladder_id, old.ladder_id);
  select count(*), max(rung) into n, mx from cw.ladder_rung where ladder_id = lid;
  if n > 0 and mx <> n - 1 then
    raise exception 'ladder % rungs must be contiguous from 0 (have % rungs, highest %)',
      lid, n, mx using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger ladder_contiguous
  after insert or update or delete on cw.ladder_rung
  deferrable initially deferred
  for each row execute function cw.ladder_rungs_contiguous();

-- ── Ladder health (CLA §11 open question 4) ─────────────────────────────────
-- A rung can expire underneath a ladder. Whether the ladder should then
-- collapse upward is UNDECIDED, and silent collapse would be dangerous — so
-- this reports the condition rather than quietly resolving it. The resolution
-- engine reads `status` and refuses to descend a degraded ladder.
create or replace view cw.ladder_rung_state as
select r.ladder_id, r.rung, r.clause_id, r.version, r.is_floor,
       s.state, s.selectable, s.expires_on, s.days_to_expiry
from cw.ladder_rung r
join cw.clause_version_state s using (clause_id, version);

create or replace view cw.ladder_health as
select l.ladder_id, l.category_key, l.severity, l.owner, l.reviewed_on,
       count(r.*)                                       as rungs,
       count(*) filter (where not r.selectable)         as unusable_rungs,
       bool_or(r.is_floor)                              as has_floor,
       case
         when count(r.*) = 0                            then 'empty'
         when not bool_or(r.is_floor)                   then 'floorless'
         when count(*) filter (where r.is_floor and not r.selectable) > 0
                                                        then 'floor_unusable'
         when count(*) filter (where not r.selectable) > 0 then 'degraded'
         else 'intact'
       end                                              as status
from cw.ladder l
left join cw.ladder_rung_state r using (ladder_id)
group by l.ladder_id, l.category_key, l.severity, l.owner, l.reviewed_on;

comment on view cw.ladder_health is
  'A ladder with no floor is a configuration error, reported as floorless.
   A ladder with an expired rung is degraded — NOT silently collapsed.';

-- ── Concessions (CLA §4) ────────────────────────────────────────────────────
create table cw.concession (
  concession_id     bigserial primary key,
  agreement_id      text   not null references cw.agreement(agreement_id),
  category_key      text   not null references cw.category(key),
  -- What we opened with.
  standard_clause_id text  not null,
  standard_version   int   not null,
  -- Exactly one of: we descended to a pre-approved rung, or we took vendor text.
  conceded_rung      int,
  vendor_text        text,
  override_ref       text,          -- required when below floor or vendor text
  reason             text   not null,
  approved_by        text   not null,
  conceded_on        date   not null default current_date,
  promoted_to_clause text,          -- set only by cw.promote_concession()
  created_at         timestamptz not null default now(),
  foreign key (standard_clause_id, standard_version)
    references cw.clause_version(clause_id, version),
  constraint one_outcome check (
    (conceded_rung is not null) <> (vendor_text is not null))
);

comment on column cw.concession.vendor_text is
  'QUARANTINED. Accepted vendor wording, stored as a concession artifact. It is
   referenced by no selectable view and can never be resolved into a contract.
   The only route into the library is cw.promote_concession().';

-- Authority: below the floor, or taking vendor language outright, requires a
-- recorded override (ADR-0008). Enforced here because it depends on the
-- ladder's floor, which a check constraint cannot reach.
create or replace function cw.concession_requires_authority() returns trigger
language plpgsql as $$
declare floor_rung int;
begin
  select r.rung into floor_rung
  from cw.ladder l join cw.ladder_rung r using (ladder_id)
  where l.category_key = new.category_key and r.is_floor
  limit 1;

  if new.vendor_text is not null and new.override_ref is null then
    raise exception 'accepting vendor language requires a recorded override'
      using errcode = 'check_violation';
  end if;

  if new.conceded_rung is not null and floor_rung is not null
     and new.conceded_rung > floor_rung and new.override_ref is null then
    raise exception 'conceding below the floor (rung % > floor %) requires a recorded override',
      new.conceded_rung, floor_rung using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger concession_authority
  before insert on cw.concession
  for each row execute function cw.concession_requires_authority();

create or replace function cw.audit_concession() returns trigger
language plpgsql as $$
begin
  perform cw.audit('concession_recorded',
    new.agreement_id || '/' || new.category_key,
    jsonb_build_object(
      'standard', new.standard_clause_id || '@v' || new.standard_version,
      'conceded_rung', new.conceded_rung,
      'vendor_language', (new.vendor_text is not null),
      'override_ref', new.override_ref,
      'approved_by', new.approved_by));
  return new;
end $$;

create trigger audit_concession
  after insert on cw.concession
  for each row execute function cw.audit_concession();

-- ── The one path from concession into the library ───────────────────────────
-- Deliberate, gated, audited. Never a side-effect of closing a negotiation.
create or replace function cw.promote_concession(
  p_concession_id bigint, p_new_clause_id text, p_title text,
  p_rationale text, p_reviewer text, p_expires_on date
) returns text
language plpgsql security invoker as $$
declare c cw.concession%rowtype; v int;
begin
  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'only legal_admin may promote a concession into the library'
      using errcode = 'insufficient_privilege';
  end if;

  select * into c from cw.concession where concession_id = p_concession_id;
  if not found then raise exception 'no such concession: %', p_concession_id; end if;
  if c.vendor_text is null then
    raise exception 'concession % settled on an approved rung; there is nothing to promote',
      p_concession_id using errcode = 'check_violation';
  end if;
  if c.promoted_to_clause is not null then
    raise exception 'concession % was already promoted to %', p_concession_id, c.promoted_to_clause
      using errcode = 'unique_violation';
  end if;

  insert into cw.clause (clause_id, category_key, severity)
  values (p_new_clause_id, c.category_key, 'Standard')
  on conflict (clause_id) do nothing;

  select coalesce(max(version), 0) + 1 into v
  from cw.clause_version where clause_id = p_new_clause_id;

  insert into cw.clause_version
    (clause_id, version, title, body, rationale, citations, reviewer,
     approved_on, expires_on, provenance)
  values (p_new_clause_id, v, p_title, c.vendor_text, p_rationale,
          array['Policy-DERIVED-' || p_concession_id], p_reviewer,
          current_date, p_expires_on, 'promoted');

  update cw.concession set promoted_to_clause = p_new_clause_id || '@v' || v
  where concession_id = p_concession_id;

  perform cw.audit('concession_promoted', p_new_clause_id || '@v' || v,
    jsonb_build_object('concession_id', p_concession_id, 'reviewer', p_reviewer));

  return p_new_clause_id || '@v' || v;
end $$;

-- ── Negotiation intelligence (CLA §6) ───────────────────────────────────────
-- Deterministic aggregation. Counting and grouping only — no model, no text.
create or replace view cw.concession_rate as
select c.standard_clause_id, c.category_key,
       count(*)                                                    as concessions,
       count(*) filter (where c.vendor_text is not null)           as to_vendor_language,
       count(*) filter (where c.override_ref is not null)          as required_override,
       round(avg(c.conceded_rung), 2)                              as avg_rung,
       mode() within group (order by c.conceded_rung)              as settlement_rung
from cw.concession c
group by c.standard_clause_id, c.category_key;

-- Proposals the data supports. Evidence is always traceable to source records —
-- a recommendation without its concessions is an assertion, and this system
-- does not make assertions (CLA §10).
create or replace view cw.library_proposal as
select category_key, standard_clause_id, concessions, settlement_rung,
       case
         when to_vendor_language >= 3
           then 'Repeated vendor language accepted — candidate for a new approved rung'
         when required_override >= 3
           then 'Floor breached repeatedly and approved each time — the floor may be wrong'
         when settlement_rung is not null and settlement_rung > 0
           then 'Deals consistently settle below the opening position — rung 0 may be fiction'
       end as proposal
from cw.concession_rate
where to_vendor_language >= 3 or required_override >= 3
   or (settlement_rung is not null and settlement_rung > 0);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.agreement   enable row level security;
alter table cw.ladder      enable row level security;
alter table cw.ladder_rung enable row level security;
alter table cw.concession  enable row level security;

create policy read_all on cw.ladder for select using (cw.app_role() is not null);
create policy read_all on cw.ladder_rung for select using (cw.app_role() is not null);
create policy admin_writes on cw.ladder for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.ladder_rung for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');

create policy read_own on cw.agreement for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and requester = cw.app_actor()));
create policy requester_writes on cw.agreement for insert
  with check (cw.app_role() in ('requester','legal_admin'));

-- Ownership test for the requester branch below.
--
-- SECURITY DEFINER on purpose: without it the policy's subquery requires the
-- CALLER to hold SELECT on cw.agreement, so a role that lacks it is denied with
-- "permission denied for table agreement" — the right outcome for the wrong
-- reason, and one that would silently become the wrong outcome if the grants
-- ever changed. This makes the policy depend on ownership alone.
create or replace function cw.owns_agreement(p_agreement_id text) returns boolean
language sql stable security definer set search_path = cw, pg_temp as $$
  select exists (
    select 1 from cw.agreement a
    where a.agreement_id = p_agreement_id and a.requester = cw.app_actor())
$$;

-- Executable by every role, including viewer: Postgres may evaluate the call
-- even when the role branch ahead of it is false, and the function discloses
-- nothing beyond "does the CALLING actor own this agreement".
revoke all on function cw.owns_agreement(text) from public;
grant execute on function cw.owns_agreement(text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- Concession data is an aggregate of exactly what we give away under pressure.
-- Legal and Audit see everything; a Requester sees only their own deals;
-- a Viewer sees none of it (CLA §7).
create policy read_scoped on cw.concession for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and cw.owns_agreement(concession.agreement_id)));
create policy write_scoped on cw.concession for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

grant select on cw.ladder, cw.ladder_rung, cw.ladder_rung_state, cw.ladder_health
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert, update, delete on cw.ladder, cw.ladder_rung to cw_legal_admin;
grant usage, select on sequence cw.ladder_ladder_id_seq to cw_legal_admin;

grant select, insert on cw.agreement to cw_requester, cw_legal_admin;
grant select on cw.agreement to cw_legal_reviewer, cw_auditor;

grant select, insert on cw.concession
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.concession to cw_auditor;
grant update on cw.concession to cw_legal_admin;   -- promote_concession() only
grant usage, select on sequence cw.concession_concession_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.concession_rate, cw.library_proposal
  to cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- Deliberately absent: any grant of cw.concession or the analytics views to
-- cw_viewer. Viewers must not see the concession record at all.
