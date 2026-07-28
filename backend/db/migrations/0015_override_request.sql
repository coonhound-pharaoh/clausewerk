-- 0015 · The override request workflow (ADR-0008, closing the specified-but-
--        never-built gap).
--
-- ADR-0008 decided this in full and nothing was built. The prototype kept a
-- single `acknowledge · override` button: one person, one click, gate open, no
-- record of who else should have known. This migration is the retirement of
-- that button, and the shape it retires into:
--
--     requested → socialised → approved | rejected → (if approved) gate opens
--
-- FOUR THINGS THE DESIGN TURNS ON, each of which is a way the old button could
-- come back wearing a disguise:
--
--   1. THE GATE OPENS ON APPROVAL, NEVER ON REQUEST. The difference between
--      asking and being allowed is the entire product. A request that opened
--      the gate would be the old button with extra typing.
--
--   2. APPROVAL IS PER FINDING. Accepting a governing-law conflict does not
--      accept an uncapped indemnity. There is no approve-all — no affordance,
--      no parameter, and no loop. A batch endpoint that iterated approvals
--      would be the blanket button with a for-loop in front of it, and the
--      deciding person would not have seen each finding.
--
--   3. NOTHING IS DECIDED BEFORE THE WINDOW CLOSES. The window's purpose is
--      that nobody discovers the override at signature. A decision taken inside
--      it means the socialisation was decoration.
--
--   4. SOCIALISATION IS NOT "SENT" UNTIL SOMEBODY WAS ACTUALLY RESOLVED TO
--      TELL. An empty watcher list silently treated as "nobody to tell" is the
--      failure this whole step exists to prevent — the record would say the
--      stakeholders were notified when nobody was.

-- ── The request ───────────────────────────────────────────────────────────
create table cw.override_request (
  request_id    bigserial primary key,
  run_id        text not null references cw.run(run_id),
  agreement_id  text references cw.agreement(agreement_id),
  requested_by  text not null default cw.app_actor(),
  requested_at  timestamptz not null default now(),

  -- MANDATORY, and non-blank. ADR-0008 calls the justification the audit
  -- record's whole value, and `not null` is satisfied by the empty string —
  -- which is exactly what a form posts when somebody types nothing. The same
  -- lesson as `rejection_needs_note` in 0008.
  --
  -- The length floor is a judgement call and it is a low one: it stops "n/a"
  -- and "asap" without pretending the database can tell a good reason from a
  -- bad one. Whether a justification is any GOOD is a content judgement, and
  -- content is not ours — the reviewer reads it and decides.
  justification text not null,
  -- What is being cited. Separate from the justification because "the customer
  -- threatened to walk" and "we accept the risk because X" are different
  -- claims, and collapsing them lets one stand in for the other.
  commercial_pressure text,

  state         text not null default 'requested'
                  check (state in ('requested','socialised','approved',
                                   'rejected','withdrawn')),
  closed_at     timestamptz,

  constraint justification_is_not_boilerplate check (
    length(btrim(justification)) >= 20),
  constraint closed_states_are_closed check (
    (state in ('approved','rejected','withdrawn')) = (closed_at is not null))
);

create index override_request_by_run on cw.override_request (run_id);

comment on table cw.override_request is
  'A request to pass a blocking finding. Carries the findings, a mandatory '
  'justification and the commercial pressure cited. It opens no gate — only an '
  'approval does, and only for the findings actually approved.';

-- ── The findings the request covers ───────────────────────────────────────
-- One row per finding, and the decision lives HERE rather than on the request.
-- That is what makes per-finding real rather than a convention: there is no
-- column on the request that could be set to "approved" for all of them.
create table cw.override_finding (
  request_id  bigint not null references cw.override_request(request_id),
  finding_ref text not null,           -- the finding as the run recorded it
  severity    text not null check (severity in ('Standard','High')),
  summary     text not null,

  -- Null until somebody decides THIS finding.
  decision    text check (decision in ('approved','rejected')),
  decided_by  text,
  decided_at  timestamptz,
  note        text,

  primary key (request_id, finding_ref),
  constraint a_decision_names_a_person_and_a_time check (
    (decision is null) = (decided_by is null)
    and (decision is null) = (decided_at is null)),
  -- A rejection returns to the requester with the rationale visible, so the
  -- rationale has to exist. Non-blank for the same reason as above.
  constraint rejection_needs_a_note check (
    decision is distinct from 'rejected'
    or (note is not null and btrim(note) <> ''))
);

comment on table cw.override_finding is
  'One row per finding covered by a request, carrying its own decision. '
  'Per-finding is structural: there is no column anywhere that could approve '
  'all of them at once.';

-- ── Socialisation ─────────────────────────────────────────────────────────
-- WHO WAS TOLD, resolved and recorded one row per person. The window is stored
-- on the request's socialisation row rather than computed at read time, because
-- shortening the setting later must not retrospectively close a window that was
-- open when it mattered.
create table cw.override_socialisation (
  request_id   bigint primary key references cw.override_request(request_id),
  socialised_at timestamptz not null default now(),
  window_closes timestamptz not null,
  window_setting text not null,        -- the value in force, for the record
  -- How many people were actually resolved. Zero is IMPOSSIBLE here: the
  -- function refuses to socialise to nobody. It is stored anyway so the record
  -- says how wide the notification was, not merely that it happened.
  notified_count int not null check (notified_count > 0)
);

create table cw.override_notified (
  request_id bigint not null references cw.override_socialisation(request_id),
  person     text not null,
  -- Why this person was told. A watcher list can be edited afterwards, so the
  -- reason has to be recorded at the time or the record cannot be reconstructed.
  reason     text not null check (reason in
                ('deal owner','category watcher','always watcher')),
  primary key (request_id, person, reason)
);

comment on table cw.override_socialisation is
  'That the stakeholders were told, when, and how long the window runs. A row '
  'here cannot exist unless at least one person was actually resolved.';

-- ── Opening a request ─────────────────────────────────────────────────────
create or replace function cw.open_override_request(
  p_run_id       text,
  p_justification text,
  p_findings     jsonb,               -- [{finding_ref, severity, summary}, …]
  p_pressure     text default null
) returns bigint
language plpgsql security invoker as $$
declare rid bigint; agreement text; n int;
begin
  if cw.app_role() <> 'requester' then
    raise exception 'an override is REQUESTED by the requester on the deal; '
      'the % role decides one, it does not ask', coalesce(cw.app_role(), 'owner')
      using errcode = 'insufficient_privilege';
  end if;

  if p_findings is null or jsonb_array_length(p_findings) = 0 then
    raise exception 'an override request covers findings; this one covers none'
      using errcode = 'check_violation';
  end if;

  select agreement_id into agreement from cw.run where run_id = p_run_id;

  insert into cw.override_request
    (run_id, agreement_id, justification, commercial_pressure)
  values (p_run_id, agreement, p_justification, p_pressure)
  returning request_id into rid;

  insert into cw.override_finding (request_id, finding_ref, severity, summary)
  select rid, f->>'finding_ref', f->>'severity', f->>'summary'
  from jsonb_array_elements(p_findings) f;

  get diagnostics n = row_count;

  perform cw.audit('human_override_request', rid::text,
    jsonb_build_object('run_id', p_run_id, 'findings', n,
                       'justification', p_justification,
                       'commercial_pressure', p_pressure));
  return rid;
end $$;

-- ── Socialising it ────────────────────────────────────────────────────────
-- SECURITY DEFINER, because resolving the audience means reading the watcher
-- lists and the deal, and the requester's own view of those is not the point —
-- the question is who the SYSTEM says should be told, not who this caller can
-- see. A caller who could not see a watcher would otherwise socialise to fewer
-- people and the record would say that was everybody.
create or replace function cw.socialise_override_request(p_request_id bigint)
returns int
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare r cw.override_request%rowtype; win text; closes timestamptz; n int;
        caller_role text;
begin
  select * into r from cw.override_request where request_id = p_request_id;
  if not found then
    raise exception 'no such override request: %', p_request_id
      using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER bypasses the request table's row policy, so the function
  -- must restate the grant's two intended branches itself: Legal may push any
  -- request along, while a requester may advance only the request they opened.
  -- current_user cannot answer this inside a definer function; `role` is what
  -- db.as_person() SETs, and session_user covers a direct role connection.
  caller_role := coalesce(nullif(current_setting('role', true), 'none'),
                          session_user);
  if not (caller_role in ('cw_legal_reviewer', 'cw_legal_admin')
          or (caller_role = 'cw_requester'
              and r.requested_by = cw.app_actor())) then
    raise exception
      'only the requester who opened override request % or Legal may socialise it',
      p_request_id using errcode = 'insufficient_privilege';
  end if;

  if r.state <> 'requested' then
    raise exception 'override request % is already %; socialisation happens once',
      p_request_id, r.state using errcode = 'restrict_violation';
  end if;

  win := coalesce(cw.setting('override_review_window'), '48h');
  closes := now() + (
    case when win ~ '^\d+\s*h$' then (regexp_replace(win,'\D','','g') || ' hours')
         when win ~ '^\d+\s*d$' then (regexp_replace(win,'\D','','g') || ' days')
         when win ~ '^\d+\s*m$' then (regexp_replace(win,'\D','','g') || ' minutes')
         else '48 hours' end)::interval;

  -- Resolve the audience. Three sources, and the deal owner is structural —
  -- they are told because it is their deal, not because somebody remembered to
  -- put them on a list.
  create temporary table _audience (person text, reason text) on commit drop;

  insert into _audience (person, reason)
  select a.requester, 'deal owner' from cw.agreement a
   where a.agreement_id = r.agreement_id and a.requester is not null;

  insert into _audience (person, reason)
  select distinct w.person, 'category watcher'
    from cw.override_watcher w
    join cw.override_finding f on f.request_id = p_request_id
   where w.removed_at is null
     and w.category_key is not null
     -- The finding reference carries its category as a prefix, the way the run
     -- store records it. Matching on that rather than on a stored category
     -- column keeps this working for findings that name no clause.
     and split_part(f.finding_ref, ':', 1) = w.category_key;

  insert into _audience (person, reason)
  select distinct w.person, 'always watcher'
    from cw.override_watcher w
   where w.removed_at is null and w.category_key is null
     and not exists (select 1 from _audience a where a.person = w.person);

  select count(distinct person) into n from _audience;

  -- THE REFUSAL THAT MATTERS. An empty audience is not "nobody to tell" — it is
  -- a gap in the watcher configuration, and recording socialisation as done
  -- would put a lie in the permanent record: the stakeholders were notified,
  -- when nobody was. The system's job is making the gap visible, so it says so
  -- and stops.
  if n = 0 then
    raise exception 'there is nobody to socialise request % to. The deal names no '
      'requester and no watcher covers its findings — that is a gap in the watcher '
      'lists for an Administrator to close, not an audience of nobody',
      p_request_id
      using errcode = 'check_violation';
  end if;

  insert into cw.override_socialisation
    (request_id, window_closes, window_setting, notified_count)
  values (p_request_id, closes, win, n);

  insert into cw.override_notified (request_id, person, reason)
  select distinct p_request_id, person, reason from _audience;

  update cw.override_request set state = 'socialised' where request_id = p_request_id;

  -- ACTOR IS 'system'. Nobody performed this notification; the system did, on
  -- the request's behalf. Recording it as a human act would put a person's name
  -- against something they did not do — and ADR-0008 §3 is explicit that a
  -- machine act can never be recorded as a human one.
  perform cw.audit('human_override_socialise', p_request_id::text,
    jsonb_build_object('notified', n, 'window_closes', closes,
                       'window_setting', win), 'system');
  return n;
end $$;

-- ── Deciding, one finding at a time ───────────────────────────────────────
-- Note the shape: this function takes ONE finding reference. There is no
-- variant taking an array, and no loop anywhere in the schema or the service
-- that calls it repeatedly on the caller's behalf. A batch endpoint would be
-- the blanket acknowledge button wearing a disguise: the deciding person would
-- press one thing, and the record would claim they considered each finding.
create or replace function cw.decide_override_finding(
  p_request_id  bigint,
  p_finding_ref text,
  p_decision    text,
  p_note        text default null
) returns void
language plpgsql security invoker as $$
declare r cw.override_request%rowtype; s cw.override_socialisation%rowtype;
        f cw.override_finding%rowtype;
begin
  if cw.app_role() not in ('legal_reviewer','legal_admin') then
    raise exception 'only Legal decides an override'
      using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'a finding is approved or rejected, not %', p_decision
      using errcode = 'check_violation';
  end if;

  select * into r from cw.override_request where request_id = p_request_id;
  if not found then
    raise exception 'no such override request: %', p_request_id
      using errcode = 'no_data_found';
  end if;

  -- Nobody decides their own request. The requester asks; Legal decides. The
  -- roles already make this impossible, but a legal reviewer opening a request
  -- for their own deal would slip through role checks alone.
  if r.requested_by = cw.app_actor() then
    raise exception 'nobody decides their own override request — % asked for this one',
      cw.app_actor() using errcode = 'insufficient_privilege';
  end if;

  select * into s from cw.override_socialisation where request_id = p_request_id;
  if not found then
    raise exception 'override request % has not been socialised; the point of the '
      'window is that nobody discovers the override at signature',
      p_request_id using errcode = 'restrict_violation';
  end if;

  -- THE WINDOW. A decision taken inside it means the socialisation was
  -- decoration — the watchers were told and given no time to say anything.
  if now() < s.window_closes then
    raise exception 'the review window for request % closes at %; deciding before '
      'then would make the socialisation decoration',
      p_request_id, s.window_closes using errcode = 'restrict_violation';
  end if;

  select * into f from cw.override_finding
   where request_id = p_request_id and finding_ref = p_finding_ref;
  if not found then
    raise exception 'request % does not cover finding %', p_request_id, p_finding_ref
      using errcode = 'no_data_found';
  end if;
  if f.decision is not null then
    raise exception 'finding % on request % is already %; a decision is not revisited',
      p_finding_ref, p_request_id, f.decision using errcode = 'restrict_violation';
  end if;

  update cw.override_finding
     set decision = p_decision, decided_by = cw.app_actor(),
         decided_at = now(), note = p_note
   where request_id = p_request_id and finding_ref = p_finding_ref;

  perform cw.audit(
    case p_decision when 'approved' then 'human_override_approve'
                    else 'human_override_reject' end,
    p_request_id::text,
    jsonb_build_object('finding_ref', p_finding_ref, 'note', p_note));

  -- The request closes when every finding has been decided, and its state is
  -- derived from them rather than set by whoever happened to decide last.
  if not exists (select 1 from cw.override_finding
                  where request_id = p_request_id and decision is null) then
    update cw.override_request
       set state = case when exists (select 1 from cw.override_finding
                                      where request_id = p_request_id
                                        and decision = 'approved')
                        then 'approved' else 'rejected' end,
           closed_at = now()
     where request_id = p_request_id;
  end if;
end $$;

-- ── What the gate actually sees ───────────────────────────────────────────
-- THE LOAD-BEARING VIEW. A finding is passable only when it was APPROVED, on a
-- request that was socialised and whose window has closed. Everything else —
-- requested, socialised, waiting, rejected — passes nothing.
--
-- Written as "which findings may be passed" rather than "is this request
-- approved", because the second phrasing is what makes a blanket override easy
-- to reintroduce by accident.
create or replace view cw.override_passes as
select f.request_id, r.run_id, r.agreement_id, f.finding_ref, f.severity,
       f.decided_by, f.decided_at, r.justification
from cw.override_finding f
join cw.override_request r on r.request_id = f.request_id
join cw.override_socialisation s on s.request_id = f.request_id
where f.decision = 'approved';

comment on view cw.override_passes is
  'The findings an approval actually lets past, one row each. A request being '
  'approved overall passes nothing by itself — only the findings that were '
  'individually approved appear here.';

-- The requester's own view of where a request has got to.
create or replace view cw.override_status as
select r.request_id, r.run_id, r.agreement_id, r.requested_by, r.requested_at,
       r.state, r.justification, r.commercial_pressure,
       s.socialised_at, s.window_closes, s.notified_count,
       (s.window_closes is not null and now() >= s.window_closes) as window_closed,
       (select count(*) from cw.override_finding f
         where f.request_id = r.request_id)::int as findings,
       (select count(*) from cw.override_finding f
         where f.request_id = r.request_id and f.decision is not null)::int as decided,
       (select count(*) from cw.override_finding f
         where f.request_id = r.request_id and f.decision = 'approved')::int as approved
from cw.override_request r
left join cw.override_socialisation s on s.request_id = r.request_id;

-- ── Recording the gate opening ────────────────────────────────────────────
-- Separate from the approval on purpose. Approving a finding is Legal's
-- judgement; opening the gate is what the pipeline then does with it, and
-- ADR-0008 lists them as two events because they are two facts. Refuses unless
-- the finding really is in cw.override_passes.
create or replace function cw.record_override_gate(
  p_request_id bigint, p_finding_ref text
) returns void
language plpgsql security invoker as $$
begin
  if not exists (select 1 from cw.override_passes
                  where request_id = p_request_id and finding_ref = p_finding_ref) then
    raise exception 'finding % on request % was not approved, so no gate opens for it',
      p_finding_ref, p_request_id using errcode = 'insufficient_privilege';
  end if;
  perform cw.audit('human_override_gate', p_request_id::text,
    jsonb_build_object('finding_ref', p_finding_ref));
end $$;

-- ── Append-only-ish: a decision is not revisited ──────────────────────────
create or replace function cw.override_finding_decided_once() returns trigger
language plpgsql as $$
begin
  if old.decision is not null then
    raise exception 'finding % on request % was decided %; a decision is not '
      'revisited — open a new request', old.finding_ref, old.request_id, old.decision
      using errcode = 'restrict_violation';
  end if;
  if new.request_id is distinct from old.request_id
     or new.finding_ref is distinct from old.finding_ref
     or new.summary is distinct from old.summary then
    raise exception 'what a request covers cannot be rewritten, only decided'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger override_finding_decided_once
  before update on cw.override_finding
  for each row execute function cw.override_finding_decided_once();

create or replace function cw.override_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'override requests and their findings are part of the record '
    'and are never deleted; withdraw the request instead';
end $$;

create trigger override_request_no_delete
  before delete on cw.override_request
  for each row execute function cw.override_no_delete();
create trigger override_finding_no_delete
  before delete on cw.override_finding
  for each row execute function cw.override_no_delete();
create trigger override_socialisation_no_delete
  before delete on cw.override_socialisation
  for each row execute function cw.override_no_delete();

-- ── Row-level security and grants ─────────────────────────────────────────
alter table cw.override_request       enable row level security;
alter table cw.override_finding       enable row level security;
alter table cw.override_socialisation enable row level security;
alter table cw.override_notified      enable row level security;

-- "Was this person told about this request?"
--
-- SECURITY DEFINER, and that is not an optimisation — it is the fix for a real
-- fault. The viewer's branch of the policy below has to consult
-- cw.override_notified, whose own read policy consults cw.override_request, and
-- Postgres refuses the pair outright: "infinite recursion detected in policy for
-- relation override_request". Every read of a request failed, for every role.
--
-- Found by the first run of the test suite, which is the only way it could have
-- been found — the policies are individually reasonable and only the cycle is
-- wrong. A definer-rights helper breaks the cycle by answering the question
-- without re-entering the policy, exactly as cw.owns_agreement() does for deals.
create or replace function cw.was_notified(p_request_id bigint, p_person text)
returns boolean
language sql stable
security definer set search_path = cw, pg_temp as $$
  select exists (select 1 from cw.override_notified
                  where request_id = p_request_id and person = p_person)
$$;

revoke all on function cw.was_notified(bigint, text) from public;
grant execute on function cw.was_notified(bigint, text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;

-- A requester sees their own; Legal and Audit see all; the administrator reads
-- content under decision U5. A viewer sees a request only if they were told
-- about it — which is the point of having been told, and the reason the viewer
-- role exists at all (ADR-0008 created it so a contract could be shown to
-- somebody for socialisation without giving them a way to change it).
create policy read_scoped on cw.override_request for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and requested_by = cw.app_actor())
  or (cw.app_role() = 'viewer'
      and cw.was_notified(override_request.request_id, cw.app_actor())));

-- The child tables follow the parent's visibility, expressed without looking at
-- the parent — for the same recursion reason. Each repeats the rule rather than
-- joining back, which is more words and no cycle.
create policy read_scoped on cw.override_finding for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.override_request r
         where r.request_id = override_finding.request_id
           and r.requested_by = cw.app_actor()))
  or (cw.app_role() = 'viewer'
      and cw.was_notified(override_finding.request_id, cw.app_actor())));

create policy read_scoped on cw.override_socialisation for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.override_request r
         where r.request_id = override_socialisation.request_id
           and r.requested_by = cw.app_actor()))
  or (cw.app_role() = 'viewer'
      and cw.was_notified(override_socialisation.request_id, cw.app_actor())));

-- Who was told is visible to everybody who can see the request at all. It has
-- to be: the requester needs to know their override was actually socialised and
-- to whom, and "we told the right people" is not a claim anybody should have to
-- take on trust.
create policy read_scoped on cw.override_notified for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.override_request r
         where r.request_id = override_notified.request_id
           and r.requested_by = cw.app_actor()))
  or (cw.app_role() = 'viewer' and person = cw.app_actor()));

create policy requester_asks on cw.override_request for insert
  with check (cw.app_role() = 'requester');
-- The state moves are made by the functions above, which run as the caller;
-- these policies are what let them.
create policy state_moves on cw.override_request for update
  using (cw.app_role() in ('requester','legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
create policy requester_lists_findings on cw.override_finding for insert
  with check (cw.app_role() = 'requester');
create policy legal_decides on cw.override_finding for update
  using (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

revoke all on cw.override_request, cw.override_finding,
              cw.override_socialisation, cw.override_notified from public;

grant select on cw.override_request, cw.override_finding,
                cw.override_socialisation, cw.override_notified,
                cw.override_passes, cw.override_status
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
     cw_administrator;

grant insert on cw.override_request, cw.override_finding to cw_requester;
grant update on cw.override_request to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant update on cw.override_finding to cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.override_request_request_id_seq to cw_requester;
-- The socialisation tables are written ONLY by the security-definer function.
-- No role holds insert on them directly, so "socialised" cannot be asserted by
-- anybody — it can only be earned by an audience actually being resolved.

revoke all on function cw.open_override_request(text,text,jsonb,text) from public;
revoke all on function cw.socialise_override_request(bigint) from public;
revoke all on function cw.decide_override_finding(bigint,text,text,text) from public;
revoke all on function cw.record_override_gate(bigint,text) from public;

grant execute on function cw.open_override_request(text,text,jsonb,text)
  to cw_requester;
-- Socialisation is available to the requester (it is the next step of their own
-- request) and to Legal, who may need to push one along.
grant execute on function cw.socialise_override_request(bigint)
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant execute on function cw.decide_override_finding(bigint,text,text,text)
  to cw_legal_reviewer, cw_legal_admin;
grant execute on function cw.record_override_gate(bigint,text)
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
