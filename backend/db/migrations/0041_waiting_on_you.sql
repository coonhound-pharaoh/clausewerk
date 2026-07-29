-- 0041 · The waiting-on-you derivation (OB-08)
--
-- OBLIGATIONS-ARCHITECTURE.md §4.1. The record already knows everything worth
-- telling anyone, so the notification service stores NO copy of who should be
-- told what: this derivation computes it fresh on every read, and a
-- notification that would no longer be true is never produced, because it is
-- derived at the moment it is asked for.
--
-- One function feeds BOTH consumers — the workspace panel (the view below) and
-- the daily digest (OB-10, when the sender exists) — so the screen and the
-- email can never disagree. The function reads BASE TABLES under definer
-- rights, deliberately: the scoped views consult cw.app_role(), which is null
-- for a definer, and a derivation built on them would answer everyone with
-- nothing — the inverse of the leak the scoping exists to prevent, and just as
-- wrong.
--
-- Two audience shapes, and the difference is load-bearing:
--   · person rows  — this named individual is being waited on.
--   · role rows    — anybody holding the role can clear it (a countersign, an
--                    unclaimed review ticket). p_role admits them.

create or replace function cw.waiting_for(p_person text, p_role text)
returns table (kind text, subject_ref text, due_on date, since timestamptz)
language sql stable
security definer set search_path = cw, pg_temp as $$
  -- An obligation in its lead window, or past it, owned by this person.
  select 'obligation'::text, s.obligation_id::text, s.due_on, null::timestamptz
  from cw.obligation_state s
  where s.owner_person = p_person and s.state in ('due','overdue')
  union all
  -- An override socialisation naming this person, with findings undecided —
  -- the review window is what makes this the immediate-send class (D-3).
  select 'override_socialisation', n.request_id::text, null, s.socialised_at
  from cw.override_notified n
  join cw.override_socialisation s on s.request_id = n.request_id
  where n.person = p_person
    and exists (select 1 from cw.override_finding f
                 where f.request_id = n.request_id and f.decision is null)
  union all
  -- Their deal's renewal window opening: 90 days of runway before term end.
  select 'renewal_window', ea.agreement_id, ea.term_end, null
  from cw.executed_agreement ea
  join cw.agreement a on a.agreement_id = ea.agreement_id
  where a.requester = p_person
    and a.status = 'executed'
    and ea.term_end is not null
    and ea.term_end <= current_date + 90
  union all
  -- An envelope they sent, still out for signature.
  select 'envelope_out', e.envelope_id::text, null, e.sent_at
  from cw.signature_envelope e
  where e.sent_by = p_person and e.state = 'sent'
  union all
  -- Role audience: a Legal grant waiting for a countersign (U6 — the wait this
  -- derivation exists to keep short).
  select 'countersign', c.grant_id::text, null, c.proposed_at
  from cw.countersign_pending c
  where p_role = 'legal_admin'
  union all
  -- Role audience: a review ticket nobody has decided.
  select 'review_ticket', t.ticket_id::text, null, t.created_at
  from cw.review_ticket t
  where t.state = 'pending' and p_role in ('legal_reviewer','legal_admin')
$$;

revoke all on function cw.waiting_for(text, text) from public;
-- Every working role may call it — the view below executes it AS THE CALLER,
-- so the grant is what makes the panel work at all. A consequence, stated
-- rather than discovered: a signed-in colleague can ask after another
-- person's queue by name. That is the settled openness default
-- (open-questions §12 — cover is the point), and the rows carry kinds and
-- references, never contract content. Viewers hold nothing here.
grant execute on function cw.waiting_for(text, text) to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;

-- ── The workspace panel: the same derivation, asked for yourself ────────────
create or replace view cw.waiting_on_you as
select w.kind, w.subject_ref, w.due_on, w.since
from cw.waiting_for(cw.app_actor(), cw.app_role()) w;

comment on view cw.waiting_on_you is
  'What is waiting on YOU, derived fresh at read time — never stored. The
   caller''s own name and role are the arguments, so this view is self-scoping
   by construction. The digest (OB-10) reads cw.waiting_for() directly with
   each person''s name, so screen and email share one derivation and cannot
   disagree.';

grant select on cw.waiting_on_you to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
