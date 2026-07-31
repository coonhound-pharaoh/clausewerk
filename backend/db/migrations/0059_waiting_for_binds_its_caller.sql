-- A SECURITY DEFINER derivation may trust cross-person arguments only from the
-- Administrator notification duty. Every other caller is bound to its session.
create or replace function cw.waiting_for(p_person text, p_role text)
returns table (kind text, subject_ref text, due_on date, since timestamptz)
language plpgsql stable
security definer set search_path = cw, pg_temp as $$
declare caller_role text := case current_setting('role', true)
  when 'cw_viewer' then 'viewer'
  when 'cw_requester' then 'requester'
  when 'cw_legal_reviewer' then 'legal_reviewer'
  when 'cw_legal_admin' then 'legal_admin'
  when 'cw_auditor' then 'auditor'
  when 'cw_administrator' then 'administrator'
end;
begin
  -- SECURITY DEFINER changes current_user to the owner, which makes
  -- cw.app_role() null. The SET ROLE setting remains the unforgeable role the
  -- base login selected; an owner migration session has no mapped role and is
  -- deliberately allowed to derive fixtures/imports.
  if caller_role is not null
     and caller_role <> 'administrator'
     and (p_person is distinct from cw.app_actor()
          or p_role is distinct from caller_role) then
    raise exception 'waiting_for may ask only for the signed caller and role'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select 'obligation'::text, s.obligation_id::text, s.due_on, null::timestamptz
  from cw.obligation_state s
  where s.owner_person = p_person and s.state in ('due','overdue')
  union all
  select 'override_socialisation', n.request_id::text, null, s.socialised_at
  from cw.override_notified n
  join cw.override_socialisation s on s.request_id = n.request_id
  where n.person = p_person
    and exists (select 1 from cw.override_finding f
                 where f.request_id = n.request_id and f.decision is null)
  union all
  select 'renewal_window', ea.agreement_id, ea.term_end, null
  from cw.executed_agreement ea
  join cw.agreement a on a.agreement_id = ea.agreement_id
  where a.requester = p_person and a.status = 'executed'
    and ea.term_end is not null and ea.term_end <= current_date + 90
  union all
  select 'envelope_out', e.envelope_id::text, null, e.sent_at
  from cw.signature_envelope e
  where e.sent_by = p_person and e.state = 'sent'
  union all
  select 'countersign', c.grant_id::text, null, c.proposed_at
  from cw.countersign_pending c where p_role = 'legal_admin'
  union all
  select 'review_ticket', t.ticket_id::text, null, t.created_at
  from cw.review_ticket t
  where t.state = 'pending' and p_role in ('legal_reviewer','legal_admin')
  union all
  select 'review_escalation', r.ticket_id::text, null, r.created_at
  from cw.ticket_route r where r.escalated and r.category_owner = p_person;
end $$;

revoke all on function cw.waiting_for(text, text) from public;
grant execute on function cw.waiting_for(text, text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin,
  cw_auditor, cw_administrator;
