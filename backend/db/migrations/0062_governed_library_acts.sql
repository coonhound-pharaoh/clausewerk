-- 0062 · The governed library acts: supersession in one act, ladder replacement.
--
-- D-5 settled in the affirmative on 2026-08-02 (memory.md S218): the six
-- governed Legal-admin acts belong to this effort. Four of them need no schema
-- work at all — retiring a clause, publishing or retiring a conflict rule,
-- releasing a legal hold and the whole disposal family are raw writes or
-- functions the schema already guards. Two need something built, and this
-- migration is that:
--
--   1. SUPERSEDING A CLAUSE was two writes (mint the successor, record the
--      supersession) and the doorway's rule is one act per endpoint. So the
--      two become one recorded act, cw.supersede_clause(), which calls the
--      existing minting door — never a third entrance into the library.
--
--   2. REORDERING A RUNG is refused by cw.ladder_rung_immutable(), whose own
--      message says "publish a new ladder instead" — and publishing a new
--      ladder was impossible: cw.ladder was unique on (category_key, severity)
--      forever, and a published rung cannot be deleted. The refusal pointed at
--      a door that did not exist. This migration builds the door: a ladder can
--      now be RETIRED, exactly one LIVE ladder may exist per (category,
--      severity), and cw.publish_ladder() replaces the live ladder with a new
--      one in a single recorded act. Past concessions keep meaning what they
--      meant — "we went to rung 2" still names a rung on the retired ladder,
--      which stays readable forever.
--
-- Design choices recorded here rather than asked (open-questions §9b: made,
-- recorded, flagged):
--   · Rung order stays immutable in place. The reorder act IS replacement.
--   · A replacement requires a reason, the same way retiring wording does.
--   · Moving the floor stays a plain UPDATE (0003 left is_floor mutable on
--     purpose); what it gains here is an audit trail, which it never had.

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · Supersession as one act
-- ══════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER, the promote_concession precedent: a caller-rights function
-- can do nothing the caller could not already do, so the table privileges and
-- row-level security on cw.clause_version and cw.supersession stay in force
-- underneath it. The inner role check is the second line; the EXECUTE grant
-- below is the door.
create or replace function cw.supersede_clause(
  p_clause_id           text,
  p_predecessor_version int,
  p_title               text,
  p_body                text,
  p_rationale           text,
  p_citations           text[],
  p_expires_on          date,
  p_reason              text,
  p_disposition         text default 'run_off',
  p_effective_on        date default null
) returns int
language plpgsql security invoker as $$
declare cat text; sev text; v int;
begin
  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'superseding a clause is a legal admin''s act'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from cw.clause_version
                  where clause_id = p_clause_id
                    and version = p_predecessor_version) then
    raise exception 'clause %@v% does not exist and cannot be superseded',
      p_clause_id, p_predecessor_version using errcode = 'no_data_found';
  end if;

  select c.category_key, c.severity into cat, sev
  from cw.clause c where c.clause_id = p_clause_id;

  -- The successor enters through the one minting door (0008). 'reviewed' is
  -- the honest provenance: this wording was authored and approved by the
  -- named legal admin performing the act, recorded below as the approver.
  v := cw.mint_clause_version(
    p_clause_id, cat, sev, p_title, p_body, p_rationale, p_citations,
    cw.app_actor(), p_expires_on, 'reviewed', 'legal_authored', null);

  -- The approver and decided_on are bound from the session by
  -- cw.bind_supersession_approver(), whatever this insert proposes.
  insert into cw.supersession
    (clause_id, predecessor_version, successor_version, reason, approver,
     effective_on, predecessor_disposition)
  values
    (p_clause_id, p_predecessor_version, v, p_reason, cw.app_actor(),
     coalesce(p_effective_on, current_date), p_disposition);

  return v;
end $$;

revoke all on function cw.supersede_clause(
  text, int, text, text, text, text[], date, text, text, date) from public;
grant execute on function cw.supersede_clause(
  text, int, text, text, text, text[], date, text, text, date)
  to cw_legal_admin;

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · A ladder can be retired; exactly one live ladder per pair
-- ══════════════════════════════════════════════════════════════════════════
alter table cw.ladder add column retired_on date;
alter table cw.ladder add column retired_reason text;
alter table cw.ladder add constraint ladder_retired_needs_reason
  check ((retired_on is null) = (retired_reason is null));

-- One LIVE ladder per (category, severity), forever many retired ones. The
-- old constraint said "one ladder per pair, ever", which is what made the
-- "publish a new ladder instead" refusal in 0003 point at a door that did
-- not exist.
alter table cw.ladder drop constraint ladder_category_key_severity_key;
create unique index ladder_live_pair on cw.ladder (category_key, severity)
  where retired_on is null;

-- A retired ladder is closed history: nothing about it may change, and it
-- cannot come back. Un-retiring would silently re-arm an old retreat path.
create or replace function cw.ladder_retirement_immutable() returns trigger
language plpgsql as $$
begin
  if old.retired_on is not null then
    raise exception
      'ladder % is retired and is closed history; publish a new ladder instead',
      old.ladder_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger ladder_retirement_immutable
  before update on cw.ladder
  for each row execute function cw.ladder_retirement_immutable();

-- Retirement lands on the chain from a trigger, so it is recorded however it
-- happens — through cw.publish_ladder() below or any future path.
create or replace function cw.audit_ladder() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.retired_on is not null
     and old.retired_on is null then
    perform cw.audit('ladder_retired', new.ladder_id::text,
      jsonb_build_object('category_key', new.category_key,
                         'severity', new.severity,
                         'reason', new.retired_reason));
  end if;
  return new;
end $$;

create trigger audit_ladder
  after update on cw.ladder
  for each row execute function cw.audit_ladder();

-- ══════════════════════════════════════════════════════════════════════════
-- 3 · Publishing a replacement ladder, as one recorded act
-- ══════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER for the same reason as above: cw.ladder and cw.ladder_rung
-- keep their admin_writes policies in force underneath. The rung triggers from
-- 0003 all still stand — contiguity, category/severity agreement, one floor —
-- so this function cannot publish a ladder those rules would refuse.
create or replace function cw.publish_ladder(
  p_category_key text,
  p_severity     text,
  p_clause_ids   text[],
  p_versions     int[],
  p_floor_rung   int,
  p_reason       text,
  p_owner        text default null
) returns bigint
language plpgsql security invoker as $$
declare old_id bigint; old_owner text; new_id bigint; n int;
begin
  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'publishing a ladder is a legal admin''s act'
      using errcode = 'insufficient_privilege';
  end if;

  n := coalesce(array_length(p_clause_ids, 1), 0);
  if n = 0 or coalesce(array_length(p_versions, 1), 0) <> n then
    raise exception
      'a ladder needs at least one rung, and every rung needs a version '
      '(% clause ids, % versions)',
      n, coalesce(array_length(p_versions, 1), 0)
      using errcode = 'check_violation';
  end if;
  if p_floor_rung < 0 or p_floor_rung >= n then
    raise exception 'the floor must be one of the rungs (rung %, of %)',
      p_floor_rung, n using errcode = 'check_violation';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'publishing a ladder requires a stated reason'
      using errcode = 'check_violation';
  end if;

  select ladder_id, owner into old_id, old_owner
  from cw.ladder
  where category_key = p_category_key and severity = p_severity
    and retired_on is null;

  if old_id is not null then
    update cw.ladder
       set retired_on = current_date, retired_reason = p_reason
     where ladder_id = old_id;
  end if;

  insert into cw.ladder (category_key, severity, owner, reviewed_on)
  values (p_category_key, p_severity,
          coalesce(p_owner, old_owner, cw.app_actor()), current_date)
  returning ladder_id into new_id;

  insert into cw.ladder_rung (ladder_id, rung, clause_id, version, is_floor)
  select new_id, i - 1, p_clause_ids[i], p_versions[i], (i - 1) = p_floor_rung
  from generate_subscripts(p_clause_ids, 1) as i;

  perform cw.audit('ladder_published', new_id::text,
    jsonb_build_object('category_key', p_category_key, 'severity', p_severity,
                       'rungs', n, 'floor_rung', p_floor_rung,
                       'replaces', old_id, 'reason', p_reason));
  return new_id;
end $$;

revoke all on function cw.publish_ladder(
  text, text, text[], int[], int, text, text) from public;
grant execute on function cw.publish_ladder(
  text, text, text[], int[], int, text, text)
  to cw_legal_admin;

-- ══════════════════════════════════════════════════════════════════════════
-- 4 · Moving the floor finally leaves a trace
-- ══════════════════════════════════════════════════════════════════════════
-- 0003 left is_floor mutable on purpose — "changing how far down we will go
-- is a policy call" — and never audited it. One row per move: the rung the
-- floor lands on, not the rung it left, so a single-statement move writes a
-- single audit row.
create or replace function cw.audit_ladder_floor() returns trigger
language plpgsql as $$
begin
  perform cw.audit('ladder_floor_moved', new.ladder_id::text,
    jsonb_build_object('rung', new.rung,
                       'clause', new.clause_id || '@v' || new.version));
  return new;
end $$;

create trigger audit_ladder_floor
  after update on cw.ladder_rung
  for each row
  when (new.is_floor and not old.is_floor)
  execute function cw.audit_ladder_floor();

-- ══════════════════════════════════════════════════════════════════════════
-- 5 · Every live-ladder lookup learns that ladders retire
-- ══════════════════════════════════════════════════════════════════════════
-- Four readers looked a ladder up by (category_key, severity) and relied on
-- there being at most one. There is now at most one LIVE one, and each reader
-- says so. The historical reader — resolving a past concession's rung — is in
-- the doorway (analysis.py) and is repointed at the concession's own stored
-- ladder_id in the same change, which is where a historical question belonged
-- all along.

-- 5a · cw.concession_requires_authority (0003) — the floor a new concession
--      is judged against is the LIVE ladder's floor. Text unchanged but for
--      the retired filter.
create or replace function cw.concession_requires_authority() returns trigger
language plpgsql as $$
declare floor_rung int; lid bigint; sev text;
begin
  -- The immutable approver/proposer identity is observed from the governed
  -- session, not accepted beside the commercial facts. Owner-mode historical
  -- imports retain explicit attribution.
  if cw.app_role() is not null then
    new.approved_by := cw.app_actor();
    new.conceded_on := current_date;
    new.created_at := now();
  end if;

  if cw.app_role() = 'requester'
     and not cw.owns_agreement(new.agreement_id) then
    raise exception
      'requester % does not own agreement % and cannot record its concessions',
      cw.app_actor(), new.agreement_id
      using errcode = 'insufficient_privilege';
  end if;

  -- The severity of the position we opened with. Single source of truth.
  select c.severity into sev
  from cw.clause c where c.clause_id = new.standard_clause_id;

  select l.ladder_id, r.rung into lid, floor_rung
  from cw.ladder l join cw.ladder_rung r using (ladder_id)
  where l.category_key = new.category_key
    and l.severity = sev
    and l.retired_on is null
    and r.is_floor
  order by l.ladder_id
  limit 1;

  new.ladder_id := lid;
  new.ladder_floor_rung := floor_rung;

  if new.vendor_text is not null and new.override_ref is null then
    raise exception 'accepting vendor language requires a recorded override'
      using errcode = 'check_violation';
  end if;

  -- Fail closed. A rung with no ladder behind it is not a concession, it is a
  -- number, and there is no floor for it to be above or below.
  if new.conceded_rung is not null and floor_rung is null then
    raise exception
      'no % floor is published for category %, so there is nothing to concede '
      'against and rung % cannot be authorised; publish a ladder with a floor first',
      sev, new.category_key, new.conceded_rung
      using errcode = 'check_violation';
  end if;

  if new.conceded_rung is not null and floor_rung is not null
     and new.conceded_rung > floor_rung and new.override_ref is null then
    raise exception 'conceding below the floor (rung % > floor %) requires a recorded override',
      new.conceded_rung, floor_rung using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- 5b · cw.open_renewal (0031) — the library-standard baseline seeds from the
--      LIVE ladder's preferred rung. Text unchanged but for the retired
--      filter in the lateral join.
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
declare nid bigint; chosen text; prior_run text; n int; caller_role text;
begin
  -- The session decides who may open the renewal, so the permanent opened_by
  -- and baseline_chosen_by fields must name that same person.
  if p_actor is distinct from cw.app_actor() then
    raise exception
      'the renewal actor must match the signed-in person; % cannot act as %',
      cw.app_actor(), p_actor using errcode = 'insufficient_privilege';
  end if;

  -- ── The ownership check 0027's policies cannot reach (NC-03) ──────────────
  -- The first statement in the function, so nothing is read and nothing is
  -- written before it is known that the caller may. Two branches, the same two
  -- 0027 installs on the tables this function writes behind.
  caller_role := coalesce(nullif(current_setting('role', true), 'none'),
                          session_user);

  if not (caller_role in ('cw_legal_reviewer', 'cw_legal_admin')
          or (caller_role = 'cw_requester'
              and cw.owns_agreement(p_agreement_id))) then
    raise exception
      'a renewal may only be opened on your own deal, and % is not yours',
      p_agreement_id using errcode = 'insufficient_privilege';
  end if;

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
        and l.retired_on is null
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

-- 5c · cw.ticket_route (0044) — a pending ticket routes to the LIVE ladder's
--      owner. A retired ladder's owner stops receiving new work at the moment
--      of replacement, which is exactly what "reassigning a ladder reroutes
--      every open ticket at once" promised. Text unchanged but for the filter.
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
      and l.retired_on is null
where t.state = 'pending';

comment on view cw.ticket_route is
  'Where each pending ticket stands: claimed by whom, owned by whom, escalated
   or not. The owner comes from the live cw.ladder at read time, so replacing
   a ladder reroutes every open ticket at once; escalation is a predicate on
   age, never a state a timer has to move.';

-- 5d · cw.ladder_health and cw.ladder_board — retired ladders stay readable
--      (history is the point) and now SAY they are retired, appended as the
--      last column so every existing reader keeps its shape.
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
       end                                              as status,
       l.retired_on
from cw.ladder l
left join cw.ladder_rung_state r using (ladder_id)
group by l.ladder_id, l.category_key, l.severity, l.owner, l.reviewed_on,
         l.retired_on;

comment on view cw.ladder_health is
  'A ladder with no floor is a configuration error, reported as floorless.
   A ladder with an expired rung is degraded — NOT silently collapsed. A
   retired ladder is history, kept readable and marked by retired_on.';

create or replace view cw.ladder_board as
select
  l.ladder_id,
  l.category_key,
  cat.label            as category_label,
  l.severity,
  l.owner,
  l.reviewed_on,
  -- The ladder's health, repeated on each of its rungs. Repetition is the right
  -- shape for a table render: the screen draws a rung per line and needs the
  -- ladder's status on the line, not in a second result set it has to zip.
  h.rungs,
  h.unusable_rungs,
  h.has_floor,
  h.status             as ladder_status,
  -- The rung. Null on an empty ladder, which is the row that matters most.
  r.rung,
  r.clause_id,
  r.version,
  r.is_floor,
  r.state              as rung_state,
  r.selectable         as rung_selectable,
  r.expires_on         as rung_expires_on,
  r.days_to_expiry     as rung_days_to_expiry,
  v.title              as rung_title,
  l.retired_on
from cw.ladder l
join cw.category cat on cat.key = l.category_key
join cw.ladder_health h on h.ladder_id = l.ladder_id
left join cw.ladder_rung_state r on r.ladder_id = l.ladder_id
left join cw.clause_version v
  on v.clause_id = r.clause_id and v.version = r.version
order by l.category_key, l.severity, r.rung nulls last;

comment on view cw.ladder_board is
  'One row per rung, in order, the floor marked, the ladder''s health on every
   line — and one row for an empty ladder, because an empty ladder is the row
   that matters most. Retired ladders carry retired_on; the live board is
   where retired_on is null.';

-- 5e · cw.library_entry (0018) — "is this version load-bearing on a ladder"
--      now means a LIVE ladder. A version whose only floor duty was on a
--      ladder that has been replaced is no longer holding anything up.
create or replace view cw.library_entry as
select
  s.clause_id,
  s.version,
  s.category_key,
  cat.label                                            as category_label,
  cat.short                                            as category_short,
  s.severity,
  s.always_include,
  s.title,
  s.body,
  s.rationale,
  s.citations,
  s.reviewer,
  s.approved_on,
  s.expires_on,
  s.provenance,
  s.origin,
  s.source_ticket_id,
  s.state,
  s.selectable,
  s.expired,
  s.expires_soon,
  s.days_to_expiry,
  s.provenance_gap,
  s.successor_version,
  s.predecessor_disposition,
  s.superseded_reason,
  -- Where this exact version sits in the LIVE ladders. Counted rather than
  -- joined so the view stays one row per version: a version on three ladders
  -- is still one library entry, not three.
  (select count(*) from cw.ladder_rung r
     join cw.ladder l on l.ladder_id = r.ladder_id and l.retired_on is null
    where r.clause_id = s.clause_id and r.version = s.version)      as on_ladders,
  (select coalesce(bool_or(r.is_floor), false) from cw.ladder_rung r
     join cw.ladder l on l.ladder_id = r.ladder_id and l.retired_on is null
    where r.clause_id = s.clause_id and r.version = s.version)      as is_a_floor,
  -- Whether this clause's category is uncovered at this severity. Surfaced
  -- BESIDE the clause rather than in a second query, because the coverage-gap
  -- banner in WP-U13 sits on the library screen and a screen that has to ask
  -- twice is a screen that will one day ask once.
  --
  -- Always false for a Baseline clause: cw.coverage_gap is defined over
  -- Standard and High only, since a Baseline clause is always included and so
  -- cannot leave a gap behind it. Reported honestly as false rather than null —
  -- "no gap" is the true answer, not "unknown".
  exists (select 1 from cw.coverage_gap g
           where g.category_key = s.category_key and g.severity = s.severity)
                                                                    as category_uncovered
from cw.clause_version_state s
join cw.category cat on cat.key = s.category_key;

comment on view cw.library_entry is
  'One row per clause version: the clause, its version, its state, its expiry '
  'and its rationale in one place, plus whether the version is load-bearing on '
  'a live ladder. A convenience join over cw.clause_version_state for WP-U13''s '
  'library screen — it adds no control and widens no grant.';
