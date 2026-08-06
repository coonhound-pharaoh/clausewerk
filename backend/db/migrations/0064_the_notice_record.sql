-- 0064 · Raising what you observed to the person who can act on it (NT-1)
--
-- WHY. Mike, 2026-08-05: "Give the admin a feature to notify legal about
-- intake question gaps when they arise. Indeed, the admin should have a lot of
-- abilities to notify different user types based on data they observe. Things
-- have to be escalated somewhere."
--
-- The observation behind it is right and had not been named. The administrator
-- watches health checks, unreachable people, the outbox and (since 0063) the
-- intake question set — and every one of those is a screen they can look at
-- and nothing they can DO. This migration gives them one act: raise a notice.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE FOUR RULES THAT KEEP THIS FROM BECOMING A MESSAGING SYSTEM
-- ══════════════════════════════════════════════════════════════════════════
-- Worth stating here rather than in a plan document, because this table is
-- where each of them is enforced and where each would be quietly relaxed.
--
--   1. A NOTICE ALWAYS CITES SOMETHING THE RAISER CAN ALREADY SEE. There are
--      no free-standing messages: every notice names a subject kind and a
--      reference, and cw.notice_subject_visible() — SECURITY INVOKER, so it
--      looks through the RAISER'S OWN eyes — refuses one that does not resolve.
--      This is not tidiness. The administrator deliberately cannot read
--      contract operations (0043 withholds the reporting views), and a blank
--      message box would let them narrate those operations anyway.
--
--   2. A NOTICE GATES NOTHING. There is no state anywhere that consults it and
--      nothing here returns a boolean anybody can gate on. It is a warning
--      written down (Mike's standing rule: warn stakeholders, don't gate on
--      approval). A screen that ever refuses to proceed because a notice is
--      open has broken this, and the refusal is the defect.
--
--   3. IT ARRIVES WHERE PEOPLE ALREADY LOOK. §4 below adds one branch to
--      cw.waiting_for, so an open notice reaches the workspace panel and the
--      daily digest from the ONE derivation both already read. No bell, no red
--      dot: the waiting list is the notification system, and a bell competes
--      with it and wins, badly.
--
--   4. WHO MAY NOTIFY WHOM IS A TABLE. cw.notice_route, below, seeded with the
--      administrator's pairs. A role list written in the doorway would be a
--      second copy of this rule, and two copies stop agreeing.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE TRAP, NAMED BEFORE IT IS SPRUNG (memory.md S220)
-- ══════════════════════════════════════════════════════════════════════════
-- §4 re-creates cw.waiting_for, which 0041, 0044 and 0059 also re-create. A
-- rewritten line in the LAST definition silently un-guards any mutation-harness
-- pattern anchored on the old text — that happened three times in one day on
-- 2026-08-02. Every line of 0059's body is carried across here unchanged and
-- the new branch is added at the end; the harnesses were grepped for
-- `waiting_for` patterns before this was committed.

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · The record
-- ══════════════════════════════════════════════════════════════════════════
create table cw.notice (
  notice_id    bigserial primary key,
  raised_by    text not null check (btrim(raised_by) <> ''),
  raised_at    timestamptz not null default now(),

  -- TO A ROLE OR TO A PERSON, NEVER BOTH AND NEVER NEITHER.
  -- A role notice is the common case and the better one: "Legal, your intake
  -- questions have a gap" is answerable by whoever is at the desk, and
  -- addressing it to one named lawyer makes it wait for that lawyer's holiday
  -- to end. A person notice exists for the case where the subject IS a person.
  to_role      text check (to_role in ('requester','legal_reviewer',
                                       'legal_admin','auditor','administrator')),
  to_person    text check (btrim(to_person) <> ''),
  constraint a_notice_has_exactly_one_recipient
    check ((to_role is null) <> (to_person is null)),

  -- WHAT IT IS ABOUT. The kind is a fixed vocabulary and adding to it is a
  -- migration — deliberately, because each kind needs a visibility rule in
  -- cw.notice_subject_visible() below, and a kind with no rule would be a
  -- notice citing something nobody checked the raiser could see.
  subject_kind text not null check (subject_kind in (
    'intake_probe',      -- an intake question classifying nothing (0063)
    'notification_gap',  -- somebody being waited on whom no channel reaches
    'health_tile',       -- a check failing, or never run
    'account')),         -- an account or its grant
  subject_ref  text not null check (btrim(subject_ref) <> ''),

  -- The raiser's own words about that subject. Required: a notice with no
  -- sentence is a nudge, and a nudge is what the daily digest already is.
  note         text not null check (btrim(note) <> '')
);

comment on table cw.notice is
  'Something one role observed, raised to the role that can act on it. Cites a
   subject the raiser can see; carries their own words; gates nothing.';

create index notice_open_by_role on cw.notice (to_role);
create index notice_open_by_person on cw.notice (to_person);

-- ── Closing one is its own act ──────────────────────────────────────────────
-- A notice is NEVER auto-closed and never expires quietly. An unacknowledged
-- notice stays visible, which is the entire point of having raised it.
create table cw.notice_acknowledgement (
  notice_id       bigint primary key references cw.notice(notice_id),
  acknowledged_by text not null check (btrim(acknowledged_by) <> ''),
  acknowledged_at timestamptz not null default now(),
  note            text
);

comment on table cw.notice_acknowledgement is
  'One per notice — acknowledging is an act by a named person, not a state the
   system reaches on its own.';

-- ── Append-only, like every other record of an act ──────────────────────────
create or replace function cw.notice_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'the notice record is append-only; raise another notice'
    using errcode = 'restrict_violation';
end $$;

create trigger notice_no_edit before update or delete on cw.notice
  for each row execute function cw.notice_append_only();
create trigger notice_ack_no_edit before update or delete
  on cw.notice_acknowledgement
  for each row execute function cw.notice_append_only();

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · Who may raise a notice to whom, about what
-- ══════════════════════════════════════════════════════════════════════════
-- Rule 4. Seeded with the administrator's pairs — the acts Mike asked for —
-- and left as data so a new pair is a row rather than a release.
create table cw.notice_route (
  raiser_role  text not null check (raiser_role in ('requester','legal_reviewer',
                                                    'legal_admin','auditor',
                                                    'administrator')),
  to_role      text not null check (to_role in ('requester','legal_reviewer',
                                                'legal_admin','auditor',
                                                'administrator')),
  subject_kind text not null,
  why          text not null,
  primary key (raiser_role, to_role, subject_kind)
);

comment on table cw.notice_route is
  'The permitted raiser-role → recipient-role pairs, per subject kind. A pair
   absent from here is refused by cw.notice_is_routed().';

insert into cw.notice_route (raiser_role, to_role, subject_kind, why) values
  ('administrator', 'legal_admin', 'intake_probe',
   'Legal curates intake_walk.json and does not hold the coverage view (NI-5); '
   'this is how a gap in the questions reaches the person who can close it.'),
  ('administrator', 'legal_admin', 'notification_gap',
   'Somebody is being waited on and no channel can reach them. The address book '
   'is the administrator''s to fix; who is waiting on them is Legal''s to know.'),
  ('administrator', 'legal_admin', 'health_tile',
   'A check failing or never run is an evidence problem, and Legal is who '
   'answers for the evidence.'),
  ('administrator', 'auditor', 'health_tile',
   'The auditor examines whether the chain verifies; a failing check is exactly '
   'their question.'),
  ('administrator', 'legal_admin', 'account',
   'A grant nobody has countersigned confers nothing while it waits (U6), and '
   'only a Legal admin can countersign it.');

-- The check itself. A plain lookup, phrased as a function so the doorway never
-- restates the rule and the refusal has one wording.
create or replace function cw.notice_is_routed(
  p_raiser_role text, p_to_role text, p_subject_kind text
) returns boolean
language sql stable as $$
  select exists (select 1 from cw.notice_route r
                  where r.raiser_role  = p_raiser_role
                    and r.to_role      = p_to_role
                    and r.subject_kind = p_subject_kind);
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3 · A notice cites something its raiser can see
-- ══════════════════════════════════════════════════════════════════════════
-- Rule 1, and the reason this function is SECURITY INVOKER: it resolves the
-- subject through the RAISER'S OWN privileges and row rules. A definer would
-- answer "yes, that exists" about things the raiser cannot see, which is
-- exactly the leak the rule exists to prevent — the caller would learn a
-- person's name or a tile's existence by being told their notice was accepted.
create or replace function cw.notice_subject_visible(
  p_kind text, p_ref text
) returns boolean
language plpgsql stable security invoker as $$
begin
  -- Each branch reads the SURFACE the raiser observed it on, not the table
  -- underneath it. That is deliberate: the claim being checked is "you saw
  -- this", and what they saw is the view their screen reads.
  if p_kind = 'intake_probe' then
    return exists (select 1 from cw.intake_question_coverage c
                    where c.probe = p_ref);
  elsif p_kind = 'notification_gap' then
    return exists (select 1 from cw.notification_gap g where g.person = p_ref);
  elsif p_kind = 'health_tile' then
    return exists (select 1 from cw.health_summary h where h.tile = p_ref);
  elsif p_kind = 'account' then
    return exists (select 1 from cw.account a where a.person = p_ref);
  end if;
  -- An unknown kind is not visible. The check constraint on the column should
  -- have caught it first; this is the second answer, and it is "no".
  return false;
end $$;

-- ── The one trigger that enforces both rules ────────────────────────────────
-- Identity is bound from the connection, whatever the INSERT claims — the
-- house pattern (0011's bind_negotiation_actor, and every act since).
create or replace function cw.bind_and_check_notice() returns trigger
language plpgsql as $$
declare raiser_role text := cw.app_role();
begin
  -- An owner-run migration or import has no application role and is left
  -- alone, exactly as the negotiation binder leaves it alone.
  if raiser_role is null then
    return new;
  end if;

  new.raised_by := cw.app_actor();
  new.raised_at := now();

  -- Rule 4. A person notice is routed by the RECIPIENT'S effective role, so
  -- naming an individual cannot be a way around the route table.
  if new.to_role is not null then
    if not cw.notice_is_routed(raiser_role, new.to_role, new.subject_kind) then
      raise exception
        'a % may not raise a % notice to a %; the permitted pairs are in '
        'cw.notice_route', raiser_role, new.subject_kind, new.to_role
        using errcode = 'insufficient_privilege';
    end if;
  else
    if not exists (
      select 1 from cw.effective_role e
       where e.person = new.to_person
         and cw.notice_is_routed(raiser_role, e.role, new.subject_kind)
    ) then
      raise exception
        'a % may not raise a % notice to %; either they hold no effective role '
        'or the pair is not in cw.notice_route',
        raiser_role, new.subject_kind, new.to_person
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Rule 1.
  if not cw.notice_subject_visible(new.subject_kind, new.subject_ref) then
    raise exception
      'a notice cites something you can see; % "%" does not resolve for you',
      new.subject_kind, new.subject_ref
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end $$;

create trigger notice_bound before insert on cw.notice
  for each row execute function cw.bind_and_check_notice();

create or replace function cw.bind_acknowledgement() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.acknowledged_by := cw.app_actor();
    new.acknowledged_at := now();
  end if;
  return new;
end $$;

create trigger notice_ack_bound before insert on cw.notice_acknowledgement
  for each row execute function cw.bind_acknowledgement();

-- ── The state, derived ──────────────────────────────────────────────────────
-- Open or acknowledged, computed from whether the acknowledgement exists. The
-- concession-state precedent: storing the state as well means storing one fact
-- twice and letting the copies disagree.
create or replace view cw.notice_state as
select n.notice_id, n.raised_by, n.raised_at, n.to_role, n.to_person,
       n.subject_kind, n.subject_ref, n.note,
       case when a.notice_id is null then 'open' else 'acknowledged' end as state,
       a.acknowledged_by, a.acknowledged_at, a.note as acknowledgement_note
from cw.notice n
left join cw.notice_acknowledgement a using (notice_id);

comment on view cw.notice_state is
  'CLA-style derived state: open until somebody named acknowledges it. Nothing
   closes a notice on its own.';

-- ══════════════════════════════════════════════════════════════════════════
-- 4 · It arrives where people already look
-- ══════════════════════════════════════════════════════════════════════════
-- Rule 3. 0059's body, carried across UNCHANGED, with one branch added at the
-- end. See the trap note in this file's header before touching it.
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
  from cw.ticket_route r where r.escalated and r.category_owner = p_person
  union all
  -- THE NEW BRANCH (0064). An open notice addressed to this person, or to the
  -- role they hold. Both audience shapes, exactly as 0041's header describes
  -- them: a person row is this named individual; a role row is anybody holding
  -- the role, and p_role admits them.
  --
  -- No due date: a notice is a thing to read, not a thing with a deadline.
  -- Giving it one would make the digest sort it against obligations, which
  -- DO have deadlines, and the comparison would be meaningless.
  select 'notice', n.notice_id::text, null, n.raised_at
  from cw.notice_state n
  where n.state = 'open'
    and (n.to_person = p_person or n.to_role = p_role);
end $$;

revoke all on function cw.waiting_for(text, text) from public;
grant execute on function cw.waiting_for(text, text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin,
  cw_auditor, cw_administrator;

-- ══════════════════════════════════════════════════════════════════════════
-- 5 · Who may do what
-- ══════════════════════════════════════════════════════════════════════════
alter table cw.notice enable row level security;
alter table cw.notice_acknowledgement enable row level security;
alter table cw.notice_route enable row level security;

-- READ: your own raised notices, the ones addressed to you or to your role,
-- plus Legal and the auditor in full. The wide half is the settled position
-- that colleagues seeing each other's work is not a leak (open-questions §12)
-- — and a notice carries a subject reference and a sentence about process,
-- never contract content.
create policy read_scoped on cw.notice for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or notice.raised_by = cw.app_actor()
  or notice.to_person = cw.app_actor()
  or notice.to_role = cw.app_role());

-- WRITE: any signed role may attempt one. The route table and the visibility
-- check are the gate, and both refuse in words — a role list here as well
-- would be the third copy of a rule that already has one.
create policy raise_notice on cw.notice for insert
  with check (cw.app_role() is not null);

create policy read_scoped on cw.notice_acknowledgement for select using (
  cw.app_role() is not null);

-- ACKNOWLEDGING: only somebody the notice was addressed to. A notice cleared
-- by a bystander is a notice nobody read.
create policy acknowledge_addressed on cw.notice_acknowledgement for insert
  with check (exists (
    select 1 from cw.notice n
     where n.notice_id = notice_acknowledgement.notice_id
       and (n.to_person = cw.app_actor() or n.to_role = cw.app_role())));

create policy read_all on cw.notice_route for select
  using (cw.app_role() is not null);

revoke all on cw.notice, cw.notice_acknowledgement, cw.notice_route from public;
grant select, insert on cw.notice, cw.notice_acknowledgement
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
     cw_administrator;
grant select on cw.notice_route, cw.notice_state
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
     cw_administrator;
grant usage, select on sequence cw.notice_notice_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
     cw_administrator;

-- Deliberately absent: any grant to cw_viewer. A viewer is outside the
-- organisation's process entirely — they hold no negotiation grant, no
-- obligation grant, and nothing here either.

-- The visibility check runs as the caller, so it needs the caller to be able
-- to execute it. What it can SEE is still theirs alone.
revoke all on function cw.notice_subject_visible(text, text) from public;
grant execute on function cw.notice_subject_visible(text, text) to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
revoke all on function cw.notice_is_routed(text, text, text) from public;
grant execute on function cw.notice_is_routed(text, text, text) to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
