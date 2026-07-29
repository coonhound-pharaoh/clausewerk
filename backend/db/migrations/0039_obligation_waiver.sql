-- 0039 · Waiver is an override (OB-05)
--
-- OBLIGATIONS-ARCHITECTURE.md §2.3: nobody silently waives a duty. Rather than
-- clone a second approval machine, a waiver RIDES the ADR-0008 override
-- machinery that already exists (0015): the request names the obligation as a
-- finding (`finding_ref = 'obligation:<id>'`), it is socialised to the
-- watchers, the window runs, a Legal reviewer who did not open it decides —
-- and only a finding in cw.override_passes authorises the act below. Every
-- guard that machinery carries (nobody decides their own request, nothing is
-- decided before socialisation or inside the window, a decision is not
-- revisited) applies to waivers with no new code and no second copy to rot.
--
-- The act list gains 'waived'; the guard gains one branch: the
-- proposal-is-not-approval check, the same shape cw.record_override_gate
-- enforces for assembly findings.

alter table cw.obligation_act add column override_ref bigint;

alter table cw.obligation_act drop constraint obligation_act_act_check;
alter table cw.obligation_act add constraint act_is_known
  check (act in ('satisfied','waived','reassigned','breach_asserted'));
alter table cw.obligation_act add constraint waiver_needs_note
  check (act <> 'waived' or coalesce(btrim(note), '') <> '');

-- The guard, replaced wholesale to add the waiver branch. The 0037 blocks are
-- carried VERBATIM — the mutation harness keys on them, and a definition
-- replaced without its guarded lines is how a mutation cancels itself out
-- (trap 5.4a); the preflight requires the copies to match so a break lands in
-- both.
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

  if exists (select 1 from cw.obligation_act a
              where a.obligation_id = new.obligation_id
                and a.act in ('satisfied','waived')) then
    raise exception
      'obligation % is already closed; a decision is not revisited',
      new.obligation_id using errcode = 'restrict_violation';
  end if;

  if new.act = 'breach_asserted'
     and (i.due_on is null or current_date <= i.due_on) then
    raise exception
      'obligation % is not overdue — the arithmetic does not support a breach '
      'assertion, and the system never says breach on its own (D-1)',
      new.obligation_id using errcode = 'restrict_violation';
  end if;

  -- The waiver branch: an APPROVED finding naming exactly this obligation, on
  -- the request the act cites. A merely proposed waiver authorises nothing —
  -- the same fault the concession path and the SOW path were built to prevent.
  if new.act = 'waived' then
    if new.override_ref is null or not exists (
      select 1 from cw.override_passes p
       where p.request_id = new.override_ref
         and p.finding_ref = 'obligation:' || new.obligation_id) then
      raise exception
        'waiving obligation % needs an approved override naming it; a proposal '
        'is not an approval (ADR-0008)', new.obligation_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;

-- The insert policy, replaced to admit the waiver act — Legal's hands only.
-- The approval is the control; the recording still belongs to the roles that
-- answer for the record. The prior branches are carried verbatim.
drop policy record_act on cw.obligation_act;
create policy record_act on cw.obligation_act for insert with check (
  (act in ('satisfied','reassigned')
     and (cw.app_role() in ('legal_reviewer','legal_admin')
          or (cw.app_role() = 'requester' and exists (
                select 1 from cw.obligation_instance i
                 where i.obligation_id = obligation_act.obligation_id
                   and cw.owns_agreement(i.agreement_id)))))
  or (act = 'waived' and cw.app_role() in ('legal_reviewer','legal_admin'))
  or (act = 'breach_asserted' and cw.app_role() = 'legal_admin'));
