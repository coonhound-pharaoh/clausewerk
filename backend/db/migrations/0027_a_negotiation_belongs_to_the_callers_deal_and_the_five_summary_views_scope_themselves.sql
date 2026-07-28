-- 0027 · A negotiation belongs to the caller's deal, and the five negotiation
--        and concession summary views scope themselves
--
-- ── THE NUMBER THIS FILE CLAIMED, AND HOW ────────────────────────────────────
-- 0027, verified by listing backend/db/migrations/ at the moment this package
-- began rather than taken from any planning document. The directory held
-- 0001-0026: 0001-0023 tracked, plus 0024_the_flag_is_enough.sql,
-- 0025_runs_belong_to_the_callers_deal_and_the_run_views_scope_themselves.sql
-- and 0026_the_administrator_reads_the_assembly_summaries.sql. 0027 is the
-- next free number. Nothing here touches, moves, renames or reads any of them.
--
-- The bootstrap applies migrations in filename order with no gate against a
-- duplicate number, so two files sharing one would not announce itself — it
-- would surface later as a migration that silently did not run.
--
--
-- ── WHY THIS FILE EXISTS: THREE RULES, ONE SHAPE ────────────────────────────
--
-- This is 0025 done again, one record over. The run store had exactly these
-- three holes and they were closed there; the negotiation record still has
-- them, and the negotiation record is the blow-by-blow of what we gave away
-- and when. All three are closed HERE, in the database, because the
-- alternative is deciding permissions in an endpoint, which this system does
-- not do anywhere.
--
-- (a) FOUR INSERT POLICIES CHECK THE ROLE ONLY.
--     0011_negotiation_record.sql writes, for cw.negotiation,
--     cw.negotiation_round, cw.negotiation_position and cw.position_movement,
--     four identical policies reading
--         with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'))
--     — deliberately unlike the read policy sitting immediately above each one,
--     which DOES call cw.owns_agreement. So any requester may open a
--     negotiation against any deal in the system, and append rounds, positions
--     and movements to any negotiation, permanently, into tables whose own
--     triggers make an UPDATE and a DELETE raise.
--
--     All four are closed together. Closing one without the others achieves
--     nothing: a requester refused a negotiation on somebody else's deal can
--     still append rounds and positions to the negotiation that is already
--     there.
--
-- (b) THREE NEGOTIATION VIEWS ANSWER WITH EVERYTHING.
--     cw.position_current, cw.position_revival and cw.renewal_drift carry no
--     scoping expression of their own and are granted to cw_requester, both
--     Legal roles and cw_auditor. A view runs with its OWNER'S rights, and
--     row-level security on the base tables is ENABLED, not FORCED — so the
--     base tables' read policies are never consulted through any of them.
--
-- (c) TWO CONCESSION VIEWS HAVE THE SAME SHAPE.
--     cw.concession_state and cw.concession_in_force (0010_governance.sql),
--     granted to the same four roles, likewise unscoped over cw.concession,
--     whose read policy scopes a requester by cw.owns_agreement.
--
--     This repository has paid for that exact shape three times already, and
--     0017_reading_room.sql:160-186 wrote down why. NOT security_invoker:
--     0017:175-185 and 0019:46 already record, in this repository's own words,
--     why that is the wrong tool for a view joining tables the caller may not
--     hold select on. backend/db/test/views-are-not-policies.test.mjs names
--     these five views, in its own words, as having this shape today and as
--     needing an owner. This file is that owner.
--
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
--
-- THE ADMINISTRATOR'S READ BOUNDARY ON THESE FIVE VIEWS IS LEFT OPEN, ON
-- PURPOSE. cw_administrator holds select on the four negotiation base tables
-- (0013_administrator.sql) and on none of these five views. That is the
-- identical gap 0025 deliberately left on the run views, for the reason
-- 0018_library_and_ladder_views.sql:170-190 gave about this same role: a
-- role's read boundary is an owner decision, and settling it inside a scoping
-- migration puts a new control in the one place nobody would look for it.
-- Closing it is one grant, and it is not taken here.
--
-- Consequently 'administrator' IS DELIBERATELY ABSENT FROM ALL FIVE WHERE
-- CLAUSES. A branch for a role that holds no select grant on the view could
-- never execute — reassuring text that does nothing, which is precisely what
-- backend/db/test/views-are-not-policies.test.mjs exists to prevent.
--
-- A NAMED RESIDUE, POINTING AT NC-03. cw.open_renewal is SECURITY DEFINER
-- (0011, and for a stated reason: it seeds a baseline from the prior
-- agreement's executed decisions and the current library, which the caller may
-- not be able to read). It INSERTs into cw.negotiation and
-- cw.negotiation_position directly, so it walks around the policies this file
-- installs, and execute on it is granted to cw_requester and both Legal roles.
-- That door is real and it is NOT closed here: silently rewriting a
-- security-definer function inside a scoping migration is how a permission
-- change ends up somewhere nobody reads. It is NC-03's package.
--
-- THE RENEWAL BASELINE IS SETTLED AND IS NOT REOPENED. 0012_sow_override.sql
-- records U1 as SETTLED 2026-07-26 by the owner: a renewal opens from the
-- positions actually in force in the executed agreement, with the drift report
-- alongside; library standard remains reachable as an explicit, recorded
-- choice. The pre-decision commentary in 0011 is superseded text. Nothing in
-- this file narrows, widens or reopens that.
--
-- No grant to cw_viewer is added or removed. 0011 records the absence of any
-- negotiation grant to that role as deliberate, matching cw.concession.
--
--
-- ── ONE LIVE CONSUMER, DECLARED ─────────────────────────────────────────────
-- backend/doorway/reads.py reads cw.concession_state (GET /concessions:
-- `from cw.concession_state s join cw.concession c using (concession_id)`).
-- Every select list below is preserved EXACTLY, so that endpoint's columns do
-- not move; its ROWS correctly narrow for a requester, which is the intended
-- effect of this migration. reads.py and test_reads.py belong to the in-flight
-- connection work, so that endpoint's own regression test is re-run once those
-- files are settled. This file changes no Python.
--
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Additive by replacement; no data is destroyed and no row shape changes. A
-- single follow-on migration restores all nine objects exactly, from the text
-- quoted verbatim at the foot of this file. Because the column lists are
-- preserved, the one live consumer needs no re-pointing in either direction.

begin;

-- ── Rule (a) · a negotiation belongs to a deal you own ──────────────────────
--
-- DROP and CREATE by name rather than ALTER POLICY, so the rollback is
-- symmetrical and the prior text is quotable verbatim.
--
-- TWO BRANCHES, NOT ONE CONDITION, and this is the house shape (0011's own
-- read policies, 0005:271-275, 0025). cw.owns_agreement resolves to
-- `a.requester = cw.app_actor()` (0003_ladders_and_concessions.sql:626-631),
-- so a single-condition form would lock out legal_reviewer and legal_admin,
-- who never appear in cw.agreement.requester and are precisely the people who
-- negotiate on deals they do not own.

drop policy write_scoped on cw.negotiation;
create policy write_scoped on cw.negotiation for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));

comment on table cw.negotiation is
  'A negotiation on one agreement. Since 0027 a requester may only open one '
  'against a deal they own, enforced where every other row rule in this system '
  'is enforced. Legal may open one against any deal, by the same two-branch '
  'shape used everywhere else, because Legal never appears in '
  'cw.agreement.requester.';

-- ── Rule (a, continued) · rounds, positions and movements ───────────────────
--
-- The subquery is evaluated UNDER row-level security, so `exists (select 1
-- from cw.negotiation n …)` means "a negotiation this caller can see" — and
-- the ownership test is stated as well, in the same words as the read policy
-- sitting above each of these in 0011, so the rule reads the same on both
-- sides and does not depend on the reader knowing that policies nest.

drop policy write_scoped on cw.negotiation_round;
create policy write_scoped on cw.negotiation_round for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and exists (
          select 1 from cw.negotiation n
          where n.negotiation_id = negotiation_round.negotiation_id
            and cw.owns_agreement(n.agreement_id))));

drop policy write_scoped on cw.negotiation_position;
create policy write_scoped on cw.negotiation_position for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and exists (
          select 1 from cw.negotiation n
          where n.negotiation_id = negotiation_position.negotiation_id
            and cw.owns_agreement(n.agreement_id))));

drop policy write_scoped on cw.position_movement;
create policy write_scoped on cw.position_movement for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and exists (
          select 1 from cw.negotiation_position p
          join cw.negotiation n using (negotiation_id)
          where p.position_id = position_movement.position_id
            and cw.owns_agreement(n.agreement_id))));

-- ── Rule (b) · the three negotiation views consult who is asking ────────────
--
-- The same words as cw.negotiation's own read policy (0011), stated in the
-- view, in the style of cw.run_summary (0025), cw.run_drift (0022:196-200) and
-- cw.override_passes (0019:95-105). The existing select lists are preserved
-- exactly, so CREATE OR REPLACE is sufficient and no consumer's columns move.

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
  limit 1) m on true
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or (cw.app_role() = 'requester' and exists (
         select 1 from cw.negotiation n
         where n.negotiation_id = p.negotiation_id
           and cw.owns_agreement(n.agreement_id)));

-- THE WHERE CLAUSE SITS BEFORE THE GROUPING, WHICH MATTERS HERE. This view
-- is a GROUP BY / HAVING view: the same expression written as a HAVING would
-- filter groups after the counts were computed over every row, and the counts
-- are the whole content of the view. Placed in WHERE, it restricts the rows
-- the aggregate sees, which for a scoping expression that is constant per
-- negotiation is the same set with the same counts.
create or replace view cw.position_revival as
select p.position_id, p.negotiation_id, p.category_key,
       count(*) filter (where m.to_state = 'held') as times_held,
       min(m.round_no) filter (where m.to_state = 'held') as first_held_round,
       max(m.round_no) as last_round
from cw.negotiation_position p
join cw.position_movement m using (position_id)
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or (cw.app_role() = 'requester' and exists (
         select 1 from cw.negotiation n
         where n.negotiation_id = p.negotiation_id
           and cw.owns_agreement(n.agreement_id)))
group by p.position_id, p.negotiation_id, p.category_key
having count(*) filter (where m.to_state = 'held') > 0
   and max(m.round_no) > min(m.round_no) filter (where m.to_state = 'held');

-- This one already had a negotiation to scope against: it selects FROM
-- cw.negotiation, so the agreement is in hand.
create or replace view cw.renewal_drift as
select n.negotiation_id, n.agreement_id, n.baseline, d.clause_id,
       d.executed_version, d.successor_version, d.superseded_reason, d.current_state
from cw.negotiation n
join cw.agreement_drift d on d.agreement_id = n.renews_agreement_id
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or (cw.app_role() = 'requester' and cw.owns_agreement(n.agreement_id));

comment on view cw.position_current is
  'Where each position stands, which is the last row of its history. Scoped in '
  'its own WHERE clause since 0027, in the same words as cw.negotiation''s '
  'read policy — a view does not inherit the policy on the table underneath '
  'it, and this one answered with every position to anybody granted it.';

comment on view cw.position_revival is
  'The same argument reopening, made visible. Scoped in its own WHERE clause '
  'since 0027, before the grouping so the counts are counts of rows this '
  'caller may see, for the same reason as cw.position_current.';

comment on view cw.renewal_drift is
  'What the positions this renewal opened from are carrying, and how far the '
  'library has moved since. Reporting: it never rewrites a position. Scoped in '
  'its own WHERE clause since 0027, for the same reason as cw.position_current.';

-- ── Rule (c) · the two concession views consult who is asking ───────────────
--
-- The same words as cw.concession's read policy (0003:643-645). cw.concession
-- carries the agreement, so both views scope through it directly.

create or replace view cw.concession_state as
select c.concession_id, c.agreement_id, c.category_key, c.proposer_kind,
       case when w.concession_id is not null then 'withdrawn'
            when s.concession_id is not null then 'approved'
            else 'proposed' end as state,
       s.settled_by, s.settled_on, w.withdrawn_by, w.withdrawn_on
from cw.concession c
left join cw.concession_settlement s using (concession_id)
left join cw.concession_withdrawal w using (concession_id)
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or (cw.app_role() = 'requester' and cw.owns_agreement(c.agreement_id));

-- The existing `not exists` stays exactly as it was and the scoping is ANDed
-- onto it: one clause says what is in force, the other says who may see it,
-- and merging them would make it impossible to revert one without the other.
create or replace view cw.concession_in_force as
select c.* from cw.concession c
join cw.concession_settlement s using (concession_id)
where not exists (select 1 from cw.concession_withdrawal w
                  where w.concession_id = c.concession_id)
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor')
       or (cw.app_role() = 'requester' and cw.owns_agreement(c.agreement_id)));

comment on view cw.concession_state is
  'CLA §4 state, computed. Anything asking "what did we actually agree to" '
  'reads cw.concession_in_force, not cw.concession — a proposed concession '
  'binds nobody. Scoped in its own WHERE clause since 0027, in the same words '
  'as cw.concession''s read policy.';

comment on view cw.concession_in_force is
  'The concessions actually binding us. Scoped in its own WHERE clause since '
  '0027, for the same reason as cw.concession_state.';

commit;

-- ── THE PRIOR TEXT, VERBATIM, FOR A REVERTING MIGRATION ─────────────────────
--
--   create policy write_scoped on cw.negotiation for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create policy write_scoped on cw.negotiation_round for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create policy write_scoped on cw.negotiation_position for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create policy write_scoped on cw.position_movement for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create or replace view cw.position_current as
--   select p.position_id, p.negotiation_id, p.category_key, p.our_clause_id,
--          p.our_version, p.their_text_ref, p.round_raised, p.opened_from,
--          m.to_state as state, m.current_rung, m.round_no as round_last_moved,
--          m.actor as moved_by
--   from cw.negotiation_position p
--   join lateral (
--     select * from cw.position_movement mm
--     where mm.position_id = p.position_id
--     order by mm.round_no desc, mm.movement_id desc
--     limit 1) m on true;
--
--   create or replace view cw.position_revival as
--   select p.position_id, p.negotiation_id, p.category_key,
--          count(*) filter (where m.to_state = 'held') as times_held,
--          min(m.round_no) filter (where m.to_state = 'held') as first_held_round,
--          max(m.round_no) as last_round
--   from cw.negotiation_position p
--   join cw.position_movement m using (position_id)
--   group by p.position_id, p.negotiation_id, p.category_key
--   having count(*) filter (where m.to_state = 'held') > 0
--      and max(m.round_no) > min(m.round_no) filter (where m.to_state = 'held');
--
--   create or replace view cw.renewal_drift as
--   select n.negotiation_id, n.agreement_id, n.baseline, d.clause_id,
--          d.executed_version, d.successor_version, d.superseded_reason, d.current_state
--   from cw.negotiation n
--   join cw.agreement_drift d on d.agreement_id = n.renews_agreement_id;
--
--   create or replace view cw.concession_state as
--   select c.concession_id, c.agreement_id, c.category_key, c.proposer_kind,
--          case when w.concession_id is not null then 'withdrawn'
--               when s.concession_id is not null then 'approved'
--               else 'proposed' end as state,
--          s.settled_by, s.settled_on, w.withdrawn_by, w.withdrawn_on
--   from cw.concession c
--   left join cw.concession_settlement s using (concession_id)
--   left join cw.concession_withdrawal w using (concession_id);
--
--   create or replace view cw.concession_in_force as
--   select c.* from cw.concession c
--   join cw.concession_settlement s using (concession_id)
--   where not exists (select 1 from cw.concession_withdrawal w
--                     where w.concession_id = c.concession_id);
--
-- Reverting the views without reverting the policies leaves the five summary
-- views answering with every negotiation and every concession to anybody
-- granted them, which is the hole this file closed. Revert both or neither.
