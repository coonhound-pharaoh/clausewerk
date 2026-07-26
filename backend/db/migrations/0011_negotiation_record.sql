-- 0011 · The negotiation record (NEGOTIATION-ARCHITECTURE.md §2, WP-19).
--
-- Rounds and positions, append-only for exactly the same reason runs are: the
-- negotiation history is the evidence of how a position was reached. A round
-- that can be edited afterwards proves nothing about what was exchanged.
--
-- The one thing this record buys that nothing else does: a point marked `held`
-- in round 2 that reappears in round 5 is the SAME position reopening, not a
-- new redline. Without it the buyer negotiates the same point twice and nobody
-- notices — see cw.position_revival at the end of this file.

-- ── The negotiation ─────────────────────────────────────────────────────────
create table cw.negotiation (
  negotiation_id bigserial primary key,
  agreement_id   text not null unique references cw.agreement(agreement_id),
  paper          text not null check (paper in ('ours','theirs')),
  opened_on      date not null default current_date,
  opened_by      text not null check (btrim(opened_by) <> ''),
  state          text not null default 'open' check (state in ('open','closed')),

  -- ══════════════════════════════════════════════════════════════════════════
  -- U1 · WHICH POSITIONS A RENEWAL OPENS FROM — OWNER DECISION, NOT SETTLED
  -- ══════════════════════════════════════════════════════════════════════════
  -- Both options build the same machinery, and the only genuine difference is
  -- which button is pre-selected. So BOTH are built, both are reachable, and
  -- which one was taken is recorded on the negotiation itself — because a
  -- renewal that opened from last term's concessions and one that opened from
  -- current library standard are different commercial acts, and six months
  -- later somebody will need to know which happened.
  --
  --   'executed_agreement'  the positions actually in force, concessions
  --                         included. The proposal's recommendation, and the
  --                         default in cw.governance_setting — with the drift
  --                         report alongside (cw.renewal_drift below), because
  --                         stale and superseded language is then the starting
  --                         point rather than the exception.
  --   'library_standard'    current approved standard positions. Every
  --                         concession is re-fought.
  --
  -- One claim retired here because it was made and it is wrong: opening from
  -- the executed agreement does NOT violate ADR-0009. ADR-0009 forbids LIBRARY
  -- drift — one deal's compromise silently becoming every future deal's
  -- starting position. A renewal baseline is scoped to one agreement with one
  -- counterparty and the library is untouched either way.
  baseline       text not null default 'library_standard'
                   check (baseline in ('executed_agreement','library_standard')),
  renews_agreement_id text references cw.agreement(agreement_id),
  baseline_chosen_by  text not null check (btrim(baseline_chosen_by) <> ''),
  baseline_note       text,
  constraint executed_baseline_needs_a_prior_agreement check (
    baseline <> 'executed_agreement' or renews_agreement_id is not null),
  constraint a_renewal_is_not_its_own_predecessor check (
    renews_agreement_id is distinct from agreement_id)
);

comment on column cw.negotiation.baseline is
  'Which positions this negotiation opened from. Recorded, never inferred: the
   two options are different commercial acts and the choice is an owner
   decision (U1) that this schema deliberately does not settle.';

-- ── Rounds ──────────────────────────────────────────────────────────────────
create table cw.negotiation_round (
  negotiation_id  bigint not null references cw.negotiation(negotiation_id),
  round_no        int not null check (round_no >= 1),
  direction       text not null check (direction in ('issued','received')),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  storage_uri     text not null,
  sent_on         date not null,
  actor           text not null check (btrim(actor) <> ''),
  -- Only rounds WE issued came out of an assembly run. A received redline did
  -- not, and pretending otherwise would break the provenance chain.
  run_id          text references cw.run(run_id),
  recorded_at     timestamptz not null default now(),
  primary key (negotiation_id, round_no),
  constraint only_our_rounds_have_a_run check (direction = 'issued' or run_id is null)
);

comment on table cw.negotiation_round is
  'Append-only. A round records the document as exchanged, its SHA-256, the
   direction, the date and who sent it. Immutable once closed — updating or
   deleting one RAISES.';

-- Rounds arrive in order or not at all. A gap in the sequence is a lost
-- exchange, and a record with a hole in it is worse than no record because it
-- looks complete.
create or replace function cw.round_is_next() returns trigger
language plpgsql as $$
declare last_no int;
begin
  select coalesce(max(round_no), 0) into last_no
  from cw.negotiation_round where negotiation_id = new.negotiation_id;
  if new.round_no <> last_no + 1 then
    raise exception
      'negotiation % is at round %; the next round is %, not %',
      new.negotiation_id, last_no, last_no + 1, new.round_no
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger negotiation_round_in_sequence
  before insert on cw.negotiation_round
  for each row execute function cw.round_is_next();

-- Settled decision S0-3: this RAISES. `do instead nothing` would let an
-- application bug that deletes a round look exactly like success.
create or replace function cw.negotiation_append_only() returns trigger
language plpgsql as $$
begin
  raise exception
    'the negotiation record is append-only: a % cannot be % once recorded',
    tg_table_name, case tg_op when 'UPDATE' then 'rewritten' else 'deleted' end
    using errcode = 'restrict_violation';
end $$;

create trigger negotiation_round_no_edit
  before update or delete on cw.negotiation_round
  for each row execute function cw.negotiation_append_only();

-- ── Positions ───────────────────────────────────────────────────────────────
-- A redline is per-paragraph and per-round (ADR-0007). A POSITION is the thread
-- that connects them: one contested point, tracked from first raised to finally
-- settled.
create table cw.negotiation_position (
  position_id    bigserial primary key,
  negotiation_id bigint not null references cw.negotiation(negotiation_id),
  category_key   text not null references cw.category(key),
  -- The clause we opened from, if the position is on our paper.
  our_clause_id  text,
  our_version    int,
  -- Their wording lives in quarantine, referenced not copied (NA §3).
  their_text_ref text,
  round_raised   int not null check (round_raised >= 0),
  opened_from    text not null check (opened_from in
                   ('executed_agreement','library_standard','their_paper')),
  created_at     timestamptz not null default now(),
  unique (negotiation_id, category_key, round_raised)
);

comment on column cw.negotiation_position.opened_from is
  'Where this position''s starting point came from. Set per position, so the
   U1 choice is legible on the individual point and not only on the header —
   which is what a person actually asks about a year later.';

create trigger negotiation_position_no_edit
  before update or delete on cw.negotiation_position
  for each row execute function cw.negotiation_append_only();

-- ── Movement, which is where the state lives ────────────────────────────────
-- The specification gives a position a `state` and a `history[]`. Storing both
-- means storing the same fact twice and letting them disagree. The history is
-- the record; the state is the last row of it.
create table cw.position_movement (
  movement_id  bigserial primary key,
  position_id  bigint not null references cw.negotiation_position(position_id),
  round_no     int not null check (round_no >= 0),
  to_state     text not null check (to_state in
                 ('open','conceded','held','withdrawn','escalated','settled')),
  current_rung int,
  actor        text not null check (btrim(actor) <> ''),
  note         text,
  moved_at     timestamptz not null default now()
);

create trigger position_movement_no_edit
  before update or delete on cw.position_movement
  for each row execute function cw.negotiation_append_only();

-- TRUNCATE fires no row trigger, so the append-only record above was erasable
-- in one statement (WP-25b, finding D9).
create trigger negotiation_round_no_truncate
  before truncate on cw.negotiation_round
  for each statement execute function cw.no_truncate();
create trigger negotiation_position_no_truncate
  before truncate on cw.negotiation_position
  for each statement execute function cw.no_truncate();
create trigger position_movement_no_truncate
  before truncate on cw.position_movement
  for each statement execute function cw.no_truncate();

-- Every position starts open, and it says so in its own history rather than
-- being open by the absence of evidence.
create or replace function cw.position_opens() returns trigger
language plpgsql as $$
begin
  insert into cw.position_movement (position_id, round_no, to_state, actor, note)
  values (new.position_id, new.round_raised, 'open', cw.app_actor(),
          'raised, opened from ' || new.opened_from);
  return new;
end $$;

create trigger negotiation_position_opens
  after insert on cw.negotiation_position
  for each row execute function cw.position_opens();

create or replace view cw.position_current as
select p.position_id, p.negotiation_id, p.category_key, p.our_clause_id,
       p.our_version, p.their_text_ref, p.round_raised, p.opened_from,
       m.to_state as state, m.current_rung, m.round_no as round_last_moved,
       m.actor as moved_by
from cw.negotiation_position p
join lateral (
  select * from cw.position_movement mm
  where mm.position_id = p.position_id
  order by mm.round_no desc, mm.movement_id desc
  limit 1) m on true;

-- The third-round revival, made visible. A point held in round 2 that moves
-- again later is the same argument reopening — which is exactly the thing a
-- buyer without this record cannot see.
create or replace view cw.position_revival as
select p.position_id, p.negotiation_id, p.category_key,
       count(*) filter (where m.to_state = 'held') as times_held,
       min(m.round_no) filter (where m.to_state = 'held') as first_held_round,
       max(m.round_no) as last_round
from cw.negotiation_position p
join cw.position_movement m using (position_id)
group by p.position_id, p.negotiation_id, p.category_key
having count(*) filter (where m.to_state = 'held') > 0
   and max(m.round_no) > min(m.round_no) filter (where m.to_state = 'held');

-- ── Opening a renewal ───────────────────────────────────────────────────────
-- BOTH U1 options, in one function, with the choice recorded. The default comes
-- from cw.governance_setting, which is marked an undecided owner decision — so
-- the pre-selection is visible and changing it settles nothing by accident.
create or replace function cw.open_renewal(
  p_agreement_id       text,
  p_renews_agreement_id text,
  p_actor              text,
  p_baseline           text default null,   -- null ⇒ the recorded default
  p_paper              text default 'ours',
  p_note               text default null
) returns bigint
language plpgsql
-- SECURITY DEFINER: seeding reads the PRIOR agreement's executed decisions and
-- the current library. Under the caller's row-level security a requester opening
-- their own renewal may not see either, and a baseline seeded from what the
-- caller happened to be allowed to read is not a baseline.
security definer set search_path = cw, pg_temp as $$
declare nid bigint; chosen text; prior_run text; n int;
begin
  chosen := coalesce(p_baseline, cw.setting('renewal_default_baseline'));
  if chosen not in ('executed_agreement','library_standard') then
    raise exception 'unknown renewal baseline: %', chosen using errcode = 'check_violation';
  end if;

  insert into cw.negotiation (agreement_id, paper, opened_by, baseline,
                              renews_agreement_id, baseline_chosen_by, baseline_note)
  values (p_agreement_id, p_paper, p_actor, chosen,
          p_renews_agreement_id, p_actor, p_note)
  returning negotiation_id into nid;

  select e.run_id into prior_run
  from cw.executed_agreement e where e.agreement_id = p_renews_agreement_id;
  if prior_run is null then
    raise exception
      'agreement % has no executed run to renew from', p_renews_agreement_id
      using errcode = 'no_data_found';
  end if;

  if chosen = 'executed_agreement' then
    -- Option A. Open from the positions actually in force, concessions
    -- included. The counterparty opens their copy of what they signed; so do we.
    insert into cw.negotiation_position
      (negotiation_id, category_key, our_clause_id, our_version, round_raised, opened_from)
    select nid, d.category_key, d.clause_id, d.version, 0, 'executed_agreement'
    from cw.run_decision d
    where d.run_id = prior_run and d.clause_id is not null;
  else
    -- Option B. Open from current library standard: the ladder's preferred rung
    -- where one is published, otherwise the newest selectable version. Every
    -- carried concession is then re-fought, which is the cost of this option.
    insert into cw.negotiation_position
      (negotiation_id, category_key, our_clause_id, our_version, round_raised, opened_from)
    select nid, d.category_key,
           coalesce(lad.clause_id, sel.clause_id),
           coalesce(lad.version,   sel.version),
           0, 'library_standard'
    from (select distinct category_key, severity from cw.run_decision
          where run_id = prior_run and clause_id is not null) d
    left join lateral (
      select rr.clause_id, rr.version
      from cw.ladder l join cw.ladder_rung rr using (ladder_id)
      where l.category_key = d.category_key and l.severity = d.severity
        and rr.rung = 0
      order by l.ladder_id limit 1) lad on true
    left join lateral (
      select c.clause_id, c.version from cw.selectable_clause c
      where c.category_key = d.category_key and c.severity = d.severity
      order by c.version desc, c.clause_id limit 1) sel on true
    where coalesce(lad.clause_id, sel.clause_id) is not null;
  end if;

  get diagnostics n = row_count;
  perform cw.audit('renewal_opened', p_agreement_id, jsonb_build_object(
    'negotiation_id', nid, 'renews', p_renews_agreement_id,
    'baseline', chosen, 'positions_seeded', n,
    'default_was', cw.setting('renewal_default_baseline')));
  return nid;
end $$;

-- The drift report that has to sit alongside Option A. Opening from the
-- executed agreement means stale and superseded language is the STARTING point,
-- so this report is what pulls it forward — and it is the reason the
-- recommendation is Option A plus a blocking drift report rather than Option A
-- alone.
create or replace view cw.renewal_drift as
select n.negotiation_id, n.agreement_id, n.baseline, d.clause_id,
       d.executed_version, d.successor_version, d.superseded_reason, d.current_state
from cw.negotiation n
join cw.agreement_drift d on d.agreement_id = n.renews_agreement_id;

comment on view cw.renewal_drift is
  'What the positions this renewal opened from are carrying, and how far the
   library has moved since. Reporting: it never rewrites a position.';

create or replace function cw.audit_negotiation() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'negotiation' then
    perform cw.audit('negotiation_opened', new.agreement_id, jsonb_build_object(
      'negotiation_id', new.negotiation_id, 'paper', new.paper,
      'baseline', new.baseline, 'renews', new.renews_agreement_id,
      'baseline_chosen_by', new.baseline_chosen_by));
  elsif tg_table_name = 'negotiation_round' then
    perform cw.audit('negotiation_round_recorded',
      new.negotiation_id || '#' || new.round_no, jsonb_build_object(
      'direction', new.direction, 'sha256', new.document_sha256,
      'sent_on', new.sent_on, 'run_id', new.run_id));
  else
    perform cw.audit('position_moved', new.position_id::text, jsonb_build_object(
      'round_no', new.round_no, 'to_state', new.to_state,
      'current_rung', new.current_rung));
  end if;
  return new;
end $$;

create trigger audit_negotiation after insert on cw.negotiation
  for each row execute function cw.audit_negotiation();
create trigger audit_negotiation_round after insert on cw.negotiation_round
  for each row execute function cw.audit_negotiation();
create trigger audit_position_movement after insert on cw.position_movement
  for each row execute function cw.audit_negotiation();

-- ── Row-level security and grants ───────────────────────────────────────────
-- A negotiation record is as commercially sensitive as the concession record it
-- feeds: it is the blow-by-blow of what we gave away and when. Same scoping.
alter table cw.negotiation          enable row level security;
alter table cw.negotiation_round    enable row level security;
alter table cw.negotiation_position enable row level security;
alter table cw.position_movement    enable row level security;

create policy read_scoped on cw.negotiation for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));
create policy write_scoped on cw.negotiation for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

create policy read_scoped on cw.negotiation_round for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.negotiation n
        where n.negotiation_id = negotiation_round.negotiation_id
          and cw.owns_agreement(n.agreement_id))));
create policy write_scoped on cw.negotiation_round for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

create policy read_scoped on cw.negotiation_position for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.negotiation n
        where n.negotiation_id = negotiation_position.negotiation_id
          and cw.owns_agreement(n.agreement_id))));
create policy write_scoped on cw.negotiation_position for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

create policy read_scoped on cw.position_movement for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.negotiation_position p
        join cw.negotiation n using (negotiation_id)
        where p.position_id = position_movement.position_id
          and cw.owns_agreement(n.agreement_id))));
create policy write_scoped on cw.position_movement for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

grant select, insert on cw.negotiation, cw.negotiation_round,
                        cw.negotiation_position, cw.position_movement
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.negotiation, cw.negotiation_round,
                cw.negotiation_position, cw.position_movement
  to cw_auditor;
grant select on cw.position_current, cw.position_revival, cw.renewal_drift
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant usage, select on sequence cw.negotiation_negotiation_id_seq,
                                cw.negotiation_position_position_id_seq,
                                cw.position_movement_movement_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;

-- Deliberately absent: any grant to cw_viewer, matching cw.concession.

revoke all on function cw.open_renewal(text, text, text, text, text, text) from public;
grant execute on function cw.open_renewal(text, text, text, text, text, text)
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
