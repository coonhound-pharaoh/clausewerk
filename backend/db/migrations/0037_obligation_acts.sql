-- 0037 · The recorded acts: satisfy, reassign, assert breach (OB-04, and D-1)
--
-- OBLIGATIONS-ARCHITECTURE.md §2.3–2.6. States are computed (0038); ACTS are
-- recorded. This table is the only thing a human ever writes about an
-- obligation, and every row is append-only, named, noted and audited.
--
--   · satisfied  — a named human closes the duty, with evidence. v1 evidence is
--                  the attestation: the actor and a mandatory, non-empty note.
--                  Document evidence arrives with OB-06 (gated on NC-07).
--   · reassigned — accountability moves to another named PERSON, never a team
--                  inbox. The instance row does not change; the current owner
--                  is the last reassignment, read through cw.obligation_owner().
--   · breach_asserted — settled decision D-1 (2026-07-28): the SYSTEM never
--                  says breach. `overdue` is arithmetic (0038). Breach is a
--                  legal claim, so asserting it is a legal admin's recorded
--                  act, it requires a reason, and it can only be made about an
--                  obligation the arithmetic already calls overdue.
--
-- 'waived' is deliberately ABSENT from the act list: a waiver needs the
-- ADR-0008 override path in force behind it, and that arrives as OB-05. An act
-- list with 'waived' but no authority check would be the proposal-is-not-
-- approval fault, pre-installed.

create table cw.obligation_act (
  act_id        bigserial primary key,
  obligation_id bigint not null references cw.obligation_instance(obligation_id),
  act           text not null check (act in ('satisfied','reassigned','breach_asserted')),
  acted_by      text not null check (btrim(acted_by) <> ''),
  acted_at      timestamptz not null default now(),
  note          text,
  new_owner     text,
  -- The '' lesson, applied on day one: `is not null` is satisfied by the empty
  -- string, which is exactly what a form posts when nobody typed anything.
  constraint satisfaction_needs_note check
    (act <> 'satisfied' or coalesce(btrim(note), '') <> ''),
  constraint breach_needs_note check
    (act <> 'breach_asserted' or coalesce(btrim(note), '') <> ''),
  constraint reassignment_names_a_person check
    ((act = 'reassigned') = (coalesce(btrim(new_owner), '') <> ''))
);

create index on cw.obligation_act (obligation_id);

comment on table cw.obligation_act is
  'Append-only. The obligation instance is derivation output and never changes;
   what people DO about an obligation is recorded here, one act per row. A
   wrong act is corrected by a later act, never rewritten.';

-- ── The guards on the way in ────────────────────────────────────────────────
create or replace function cw.obligation_act_guard() returns trigger
language plpgsql as $$
declare i cw.obligation_instance%rowtype;
begin
  -- The actor is the connection's person, never a claim.
  if cw.app_role() is not null then
    new.acted_by := cw.app_actor();
    new.acted_at := now();
  end if;

  select * into i from cw.obligation_instance
   where obligation_id = new.obligation_id;
  if not found then
    raise exception 'no such obligation: %', new.obligation_id
      using errcode = 'no_data_found';
  end if;

  -- A decision is not revisited: once satisfied or waived, nothing further
  -- lands except a reassignment correction, which is pointless but harmless —
  -- refused anyway for the record's sake.
  if exists (select 1 from cw.obligation_act a
              where a.obligation_id = new.obligation_id
                and a.act in ('satisfied','waived')) then
    raise exception
      'obligation % is already closed; a decision is not revisited',
      new.obligation_id using errcode = 'restrict_violation';
  end if;

  -- D-1: breach is asserted about a computed fact, never ahead of it. An
  -- unanchored obligation (due_on null) is not overdue, whatever anyone feels.
  if new.act = 'breach_asserted'
     and (i.due_on is null or current_date <= i.due_on) then
    raise exception
      'obligation % is not overdue — the arithmetic does not support a breach '
      'assertion, and the system never says breach on its own (D-1)',
      new.obligation_id using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

create trigger obligation_act_guard
  before insert on cw.obligation_act
  for each row execute function cw.obligation_act_guard();

-- Append-only, all three doors.
create or replace function cw.obligation_act_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'an obligation act is append-only; a wrong act is corrected by a later '
    'act, never rewritten'
    using errcode = 'restrict_violation';
end $$;

create trigger obligation_act_frozen before update on cw.obligation_act
  for each row execute function cw.obligation_act_frozen();
create trigger obligation_act_no_delete before delete on cw.obligation_act
  for each row execute function cw.obligation_act_frozen();
create trigger obligation_act_no_truncate before truncate on cw.obligation_act
  execute function cw.obligation_act_frozen();

-- ── Every act on the chain ──────────────────────────────────────────────────
create or replace function cw.audit_obligation_act() returns trigger
language plpgsql as $$
begin
  perform cw.audit('obligation_' || new.act, new.obligation_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'note', new.note, 'new_owner', new.new_owner)));
  return new;
end $$;

create trigger audit_obligation_act
  after insert on cw.obligation_act
  for each row execute function cw.audit_obligation_act();

-- ── The current owner, in one place ─────────────────────────────────────────
-- Read by the unowned surface below and by the state view (0038), so the two
-- can never disagree about who is accountable.
create or replace function cw.obligation_owner(p_obligation_id bigint) returns text
language sql stable as $$
  select coalesce(
    (select a.new_owner from cw.obligation_act a
      where a.obligation_id = p_obligation_id and a.act = 'reassigned'
      order by a.act_id desc limit 1),
    (select i.owner_person from cw.obligation_instance i
      where i.obligation_id = p_obligation_id))
$$;

-- ── The defect surface: an unowned obligation on a live deal ────────────────
-- Absence of an owner rendered as a gap, never as calm. Not granted to
-- viewers, so the views-are-not-policies inventory is untouched; everybody
-- else may see the gap, which is the point of a gap.
create or replace view cw.obligation_unowned as
select i.obligation_id, i.agreement_id, i.kind, i.due_on
from cw.obligation_instance i
where cw.obligation_owner(i.obligation_id) is null
  and not exists (select 1 from cw.obligation_act a
                   where a.obligation_id = i.obligation_id
                     and a.act in ('satisfied','waived'));

grant select on cw.obligation_unowned to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;

-- ── Who may act ─────────────────────────────────────────────────────────────
alter table cw.obligation_act enable row level security;

create policy read_scoped on cw.obligation_act for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.obligation_instance i
         where i.obligation_id = obligation_act.obligation_id
           and cw.owns_agreement(i.agreement_id))));

-- Satisfying and reassigning belong to the people doing the work: Legal, and
-- the requester on their own deal. Asserting breach is legal_admin's alone —
-- D-1 made it a consequential legal claim, and consequential claims are not
-- spread thin.
create policy record_act on cw.obligation_act for insert with check (
  (act in ('satisfied','reassigned')
     and (cw.app_role() in ('legal_reviewer','legal_admin')
          or (cw.app_role() = 'requester' and exists (
                select 1 from cw.obligation_instance i
                 where i.obligation_id = obligation_act.obligation_id
                   and cw.owns_agreement(i.agreement_id)))))
  or (act = 'breach_asserted' and cw.app_role() = 'legal_admin'));

revoke all on cw.obligation_act from public;
grant select on cw.obligation_act to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert on cw.obligation_act to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.obligation_act_act_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;

-- ── D-1 on the record, where the next engineer will meet it ─────────────────
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale)
values
  ('breach_is_never_a_system_state', 'true', 'owner_decision', true, true, 'owner',
   'D-1 — SETTLED 2026-07-28 by the owner. The system computes and reports '
   'OVERDUE, which is date arithmetic. Breach is a legal claim with '
   'consequences, so asserting it is a named legal admin''s recorded act '
   '(cw.obligation_act, act=breach_asserted), it requires a reason, and it is '
   'only accepted about an obligation the arithmetic already calls overdue. '
   'No report, view or job may present overdue as breach unattended. The '
   'accepted cost, stated: nothing can ever say "in breach" without a person '
   'owning the assertion.');
