-- 0044 · Review routing: the claim, and the escalation to the named owner (RP-02)
--
-- FEATURE-PROPOSAL-2026-07-28 §6, built to its settled minimum answer: a
-- shared queue any Legal reviewer can claim from, with escalation to the
-- category's named owner if unclaimed. One queue, one claim act, one
-- escalation timer — nothing cleverer until real volume argues for it.
--
-- WHY A CLAIM TABLE AND NOT A COLUMN. cw.review_ticket is the permanent
-- record of an adjudication, guarded by a transition trigger and a mutation
-- harness; a claim is coordination — "I am looking at this" — and it can be
-- released and re-taken without the adjudication record moving at all. The
-- two lifespans are different, so the two records are different tables. The
-- claim follows the watcher-list shape: rows are added and closed, never
-- edited, so who held a ticket when is always answerable.
--
-- THE ROUTE IS DERIVED, NEVER STORED. The owner comes from cw.ladder at read
-- time — reassigning a ladder reroutes every open ticket at once, with no
-- sweep to forget. The escalation is a predicate on age, not a state a timer
-- has to move (the A-3 lesson: a control that depends on a job running is a
-- control only until someone moves the job).

create table cw.ticket_claim (
  claim_id    bigserial primary key,
  ticket_id   bigint not null references cw.review_ticket(ticket_id),
  person      text not null,
  claimed_at  timestamptz not null default now(),
  released_by text,
  released_at timestamptz,
  constraint release_is_whole check ((released_by is null) = (released_at is null))
);

-- One live claim per ticket; history stays as released rows.
create unique index ticket_claim_live
  on cw.ticket_claim (ticket_id) where released_at is null;

create or replace function cw.bind_ticket_claim() returns trigger
language plpgsql as $$
begin
  -- The claimer is the session, never the body — the NEVER_FROM_THE_BODY rule.
  if cw.app_role() is not null then
    new.person := cw.app_actor();
    new.claimed_at := now();
  end if;
  new.released_by := null;
  new.released_at := null;
  if not exists (select 1 from cw.review_ticket t
                  where t.ticket_id = new.ticket_id and t.state = 'pending') then
    raise exception 'ticket % is not pending; a decided ticket takes no claim',
      new.ticket_id using errcode = 'restrict_violation';
  end if;
  perform cw.audit('ticket_claimed', new.ticket_id::text, '{}'::jsonb);
  return new;
end $$;

create trigger bind_ticket_claim
  before insert on cw.ticket_claim
  for each row execute function cw.bind_ticket_claim();

-- The one permitted mutation is release, in the address-book shape: the pair
-- of columns and nothing else.
create or replace function cw.ticket_claim_change() returns trigger
language plpgsql as $$
begin
  if new.ticket_id  is distinct from old.ticket_id
     or new.person     is distinct from old.person
     or new.claimed_at is distinct from old.claimed_at then
    raise exception 'a claim is not edited; release it'
      using errcode = 'restrict_violation';
  end if;
  if old.released_at is not null then
    raise exception 'claim % was already released', old.claim_id
      using errcode = 'restrict_violation';
  end if;
  new.released_by := cw.app_actor();
  new.released_at := now();
  perform cw.audit('ticket_claim_released', old.ticket_id::text, '{}'::jsonb);
  return new;
end $$;

create trigger ticket_claim_change
  before update on cw.ticket_claim
  for each row execute function cw.ticket_claim_change();

create trigger ticket_claim_no_delete before delete on cw.ticket_claim
  for each row execute function cw.notification_frozen();

-- ── The escalation timer, as a setting rather than a constant ──────────────
select set_config('cw.actor', 'migration-0044', false);
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
values
  ('review_escalation_days', '3', 'operational', false, false, null,
   'Engineering default, undecided. How long a pending ticket may sit '
   'unclaimed before it appears on the category owner''s own list. Operational '
   'because changing it changes who is nagged, never who may decide.',
   'Days a pending ticket sits unclaimed before escalating to the category''s '
   'named owner.');

-- ── The route, derived at read time ─────────────────────────────────────────
create or replace view cw.ticket_route as
select
  t.ticket_id,
  t.category_key,
  t.severity,
  t.created_at,
  cl.person                                   as claimed_by,
  l.owner                                     as category_owner,
  (cl.person is null
   and t.created_at < now() - make_interval(days =>
         (select value::int from cw.governance_setting
           where key = 'review_escalation_days'))) as escalated
from cw.review_ticket t
left join cw.ticket_claim cl
       on cl.ticket_id = t.ticket_id and cl.released_at is null
left join cw.ladder l
       on l.category_key = t.category_key and l.severity = t.severity
where t.state = 'pending';

comment on view cw.ticket_route is
  'Where each pending ticket stands: claimed by whom, owned by whom, escalated
   or not. The owner comes from cw.ladder at read time, so reassigning a
   ladder reroutes every open ticket at once; escalation is a predicate on
   age, never a state a timer has to move.';

-- ── The derivation grows its routed source (the OB-08 rule: a source joins
--    cw.waiting_for when its package lands, with a named test to catch its
--    silent loss). Everything above the last arm is 0041's text, carried
--    unchanged. ─────────────────────────────────────────────────────────────
create or replace function cw.waiting_for(p_person text, p_role text)
returns table (kind text, subject_ref text, due_on date, since timestamptz)
language sql stable
security definer set search_path = cw, pg_temp as $$
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
  where a.requester = p_person
    and a.status = 'executed'
    and ea.term_end is not null
    and ea.term_end <= current_date + 90
  union all
  select 'envelope_out', e.envelope_id::text, null, e.sent_at
  from cw.signature_envelope e
  where e.sent_by = p_person and e.state = 'sent'
  union all
  select 'countersign', c.grant_id::text, null, c.proposed_at
  from cw.countersign_pending c
  where p_role = 'legal_admin'
  union all
  select 'review_ticket', t.ticket_id::text, null, t.created_at
  from cw.review_ticket t
  where t.state = 'pending' and p_role in ('legal_reviewer','legal_admin')
  union all
  -- Person audience: a ticket in YOUR category, unclaimed past the window.
  -- The role rows above already tell every reviewer the queue has work; this
  -- row tells the named owner the queue has work NOBODY TOOK.
  select 'review_escalation', r.ticket_id::text, null, r.created_at
  from cw.ticket_route r
  where r.escalated and r.category_owner = p_person
$$;

-- ── Who may do what ─────────────────────────────────────────────────────────
alter table cw.ticket_claim enable row level security;

-- Claims are coordination, visible to any signed-in role; taken and released
-- by the two roles that adjudicate tickets. Release is not restricted to the
-- claimer: a colleague releasing an absent colleague''s claim is the openness
-- default doing its job, and the released_by column names who did it.
create policy read_all on cw.ticket_claim for select
  using (cw.app_role() is not null);
create policy reviewers_claim on cw.ticket_claim for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));
create policy reviewers_release on cw.ticket_claim for update
  using      (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

revoke all on cw.ticket_claim from public;
grant select on cw.ticket_claim to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert, update on cw.ticket_claim to cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.ticket_claim_claim_id_seq
  to cw_legal_reviewer, cw_legal_admin;

grant select on cw.ticket_route to
  cw_legal_reviewer, cw_legal_admin, cw_auditor;
