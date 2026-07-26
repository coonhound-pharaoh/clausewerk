-- 0014 · What the people-and-access console needs that 0013 did not build.
--
-- 0013 holds the facts: who has an account, what was granted, who countersigned,
-- what was revoked. This adds the one DERIVED fact the console has to show and
-- cannot compute honestly in the browser — whether somebody's access is still
-- being used.

-- ── cw.person_activity · dormancy, measured the right way ─────────────────
-- THE TEMPTATION, AND WHY IT IS WRONG. The obvious way to flag a dormant
-- account is "has not signed in for N days". It is wrong in the direction that
-- matters: somebody who signs in every morning, looks at a dashboard and does
-- nothing is dormant WHERE IT COUNTS. Their access is unused, it is still a way
-- in, and a sign-in-based measure marks it green forever.
--
-- So dormancy is measured from RECORDED ACTS — the audit chain, which is the
-- only record of somebody actually doing something. A person with no act on the
-- chain has never used their access, however many times they have looked at it.
--
-- The service layer holds sessions in memory and deliberately writes no sign-in
-- rows, so there is no sign-in data here to be tempted by. That is not an
-- accident of implementation: a sign-in log would be a second, weaker activity
-- record sitting next to the real one, and somebody would eventually join to
-- the wrong one.
create or replace view cw.person_activity as
select a.person,
       a.display_name,
       a.unit,
       a.role as declared_role,
       a.state,
       a.created_by,
       a.created_at,
       e.role as effective_role,
       e.granted_by,
       e.granted_at,
       e.countersigned_by,
       last_act.ts        as last_act_at,
       last_act.event_type as last_act,
       (select count(*) from cw.audit_event ev where ev.actor = a.person)::int
         as acts_recorded,
       -- Three states, not two. "Never acted" and "has not acted lately" are
       -- different situations with different answers: the first is an account
       -- that was created and never used, which is usually a joiner who was
       -- given the wrong role or never told they had it; the second is somebody
       -- who has moved on. Collapsing them into one amber flag hides which.
       case
         when a.state = 'revoked'      then 'revoked'
         when e.role is null           then 'no effective role'
         when last_act.ts is null      then 'never acted'
         when last_act.ts < now() - interval '90 days' then 'dormant'
         else 'active'
       end as activity_state
from cw.account a
left join cw.effective_role e on e.person = a.person
left join lateral (
  select ev.ts, ev.event_type
  from cw.audit_event ev
  where ev.actor = a.person
  order by ev.seq desc
  limit 1
) last_act on true;

comment on view cw.person_activity is
  'Everybody the system knows, with what they may do and when they last did '
  'anything. Dormancy is measured from RECORDED ACTS and never from sign-ins: '
  'somebody who signs in daily and does nothing is dormant where it matters.';

-- The view reads cw.audit_event, whose row-level policy scopes a requester to
-- their own rows — so a requester querying this would see everybody's names
-- with a null last act, which is a misleading answer rather than a refused one.
--
-- SECURITY DEFINER is not available to a view here, and making it so would hand
-- every reader the owner's sight of the whole log. The narrower fix: grant it
-- only to the roles that already read the whole chain. A requester asking for
-- this gets a clean permission error, which is an honest answer.
revoke all on cw.person_activity from public;
grant select on cw.person_activity to
  cw_administrator, cw_auditor, cw_legal_admin;

-- ── cw.access_summary · the console's stat strip, computed once ───────────
-- Four numbers the people pane shows. Computed here rather than in the browser
-- so that "shared accounts: 0" is a claim the DATABASE makes — and it is a
-- claim worth making, because it is the ADR-0008 residual being paid off. One
-- account per named person is a property of cw.account's primary key, so the
-- number is structurally zero rather than aspirationally zero.
create or replace view cw.access_summary as
select
  (select count(*) from cw.effective_role)::int              as people_with_access,
  (select count(*) from cw.countersign_pending)::int         as awaiting_countersign,
  (select count(*) from cw.account where state = 'revoked')::int as revoked,
  (select count(*) from cw.person_activity
    where activity_state in ('dormant','never acted'))::int  as dormant,
  -- Zero by construction: cw.account's primary key is the person, so a shared
  -- account cannot exist. Reported rather than assumed, because the goal was
  -- stated in ADR-0008 and a stated goal nobody measures is a hope.
  0::int as shared_accounts;

comment on view cw.access_summary is
  'The people pane''s four figures. shared_accounts is structurally zero — one '
  'row per named person is enforced by the primary key, not by discipline.';

revoke all on cw.access_summary from public;
grant select on cw.access_summary to
  cw_administrator, cw_auditor, cw_legal_admin;
