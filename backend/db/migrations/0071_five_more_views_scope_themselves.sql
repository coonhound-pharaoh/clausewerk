-- 0071 · Five more views scope themselves
--
-- ── THE NUMBER THIS FILE CLAIMS, AND HOW ────────────────────────────────────
-- 0071, verified by listing backend/db/migrations/ at the moment this package
-- began rather than taken from any planning document. The directory held
-- 0001-0068 and 0070; there is no 0069 and there never has been in any branch.
-- A GAP IS HARMLESS — the bootstrap applies migrations in filename order, so a
-- missing number changes nothing. A DUPLICATE is the dangerous one, because it
-- would surface later as a migration that silently did not run. 0071 is the
-- next free number and nothing here touches, moves or renames any other file.
--
--
-- ── WHY THIS FILE EXISTS: THE SAME BUG, THE FIFTH THROUGH NINTH TIMES ───────
--
-- A view runs with its OWNER's rights. The owner ran the migrations, and
-- row-level security is ENABLED rather than FORCED — so the owner is exempt,
-- the policy under a view is never consulted, and the view hands back
-- everything. 0017, 0019, 0025 and 0027 each closed a batch of this. So did
-- db/test/views-are-not-policies.test.mjs, which exists to stop the next one.
--
-- IT DID NOT STOP THESE FIVE, AND THE REASON IS THE INTERESTING PART. That
-- file builds its inventory with
--
--     has_table_privilege('cw_viewer', c.oid, 'SELECT')
--
-- — every view A VIEWER can read. The viewer is the LEAST privileged role in
-- the system. All five views below are granted to cw_requester and to no
-- viewer, so they were outside the inventory from the day they were written and
-- the file's careful reverse check never ran against one of them. 21 views are
-- readable by a viewer; 45 more are readable by some other role and no viewer.
-- The guard covered 21 of 66. It is extended to every role in the same package
-- as this migration, and that half is the one that matters in a year.
--
--
-- ── DEMONSTRATED, NOT ARGUED ────────────────────────────────────────────────
-- Two requesters, Rita and Ben, one deal each. Rita's connection, bound to
-- cw_requester with cw.actor = rita@x, BEFORE this migration:
--
--   select * from cw.notice                    ->  0 rows      (policy works)
--   select * from cw.notice_state              ->  1 row: Ben's notice, its
--                                                  note text, who raised it,
--                                                  and the deal it names
--   select agreement_id from cw.executed_agreement       ->  AG-RITA
--   select * from cw.agreement_close_eligibility         ->  AG-RITA and AG-BEN
--   select * from cw.vendor_friction           ->  both counterparties, with
--                                                  Ben's deal counts
--
-- cw.obligation_state and cw.obligation_unowned carry the identical shape over
-- cw.obligation_instance and were empty on that seed. They are scoped ON SHAPE
-- rather than on evidence, exactly as cw.agreement_drift and cw.sow_conflict
-- were in the 0019 round. Waiting for a populated database to prove a hole is
-- how a hole reaches a customer.
--
-- WORST OF THE SET: reads.py documents GET /notices as "cw.notice read_scoped
-- policy (0064) reached through cw.notice_state — your own raised notices, the
-- ones addressed to you or your role". The policy was never consulted. A
-- sentence like that is what a reviewer relies on INSTEAD of checking.
--
--
-- ── WHAT CHANGES FOR SOMEBODY, SAID HERE RATHER THAN DISCOVERED LATER ───────
--
-- (1) AN ADMINISTRATOR STOPS READING EVERY NOTICE. They hold a grant on
--     cw.notice_state and have NO read policy on cw.notice at all — so today
--     the view is the only reason they see anything, and it shows them
--     everything. After this they see notices addressed to them by name or to
--     the administrator role, which is what the policy in 0064 actually says.
--     If the owner wants an administrator to read all notices, that belongs in
--     a POLICY on cw.notice, where it can be seen — not in a view that ignores
--     the policy that is there.
--
-- (2) cw.vendor_friction BECOMES "FRICTION ACROSS THE DEALS YOU CAN SEE."
--     Nothing changes for Legal or the auditor, whose branch is unconditional.
--     A requester's numbers drop to their own deals. The alternative considered
--     and REJECTED was revoking the requester's grant: that removes a
--     capability somebody deliberately granted, which is the owner's call.
--
--
-- ── WHAT IS DELIBERATELY NOT TOUCHED ────────────────────────────────────────
-- Nineteen other views outside the inventory carry no scoping either, and they
-- are CORRECT. Each is readable only by cw_legal_reviewer, cw_legal_admin,
-- cw_auditor or cw_administrator, and those roles' read policies on the base
-- tables are unconditional — so the views hand back exactly what the policies
-- already permit. They need classifying, which the extended guard does, and not
-- a WHERE clause. Scoping them would be motion, and it would slow every one of
-- them down for no gain.
--
-- Every column, name and ordering below is unchanged. This migration adds
-- WHERE clauses and nothing else, so no screen's shape moves.

begin;

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · cw.notice_state — 0064's read_scoped, repeated
-- ══════════════════════════════════════════════════════════════════════════
-- The predicate is on cw.notice (n), never on the acknowledgement joined to
-- it: a notice you may read carries its acknowledgement, and one you may not
-- read does not appear at all. Putting it on the LEFT JOIN would turn an
-- unreadable acknowledgement into a notice that looks unacknowledged, which is
-- a worse answer than refusing the row.
-- THE SPLIT, AND WHY IT IS NOT OVER-ENGINEERING. The first version of this
-- migration simply put the WHERE clause on cw.notice_state, and three database
-- suites went red. The cause is written in 0064's own comment, twelve lines
-- above the function that broke: cw.waiting_for is SECURITY DEFINER, which
-- makes cw.app_role() NULL inside it. A scoping predicate that asks app_role()
-- therefore matches NOTHING there, and every notice silently vanished from the
-- workspace panel and the daily digest.
--
-- That is 0019's sow_override_in_force lesson exactly — "it was scoped, and an
-- authorised SOW was then refused execution because the trigger's caller held
-- no application role" — and 0019's conclusion still holds: ACCESS SCOPING
-- BELONGS ON VIEWS PEOPLE READ. So the derivation and the scoping stop being
-- the same object.
--
--   cw.notice_state_all   the derivation. No grants to anybody, so no
--                         application role can reach it; the schema's own
--                         definer functions read it as the owner.
--   cw.notice_state       that, plus the policy. What people read.
--
-- The alternative considered and REJECTED was `or cw.app_role() is null` in the
-- predicate — one line, no new object, and unreachable by any browser since a
-- doorway caller always has a role. It was rejected because it writes an escape
-- hatch into a security predicate, and the next person to read it cannot tell
-- from the line itself whether the hatch is safe. Two views can be read.
create or replace view cw.notice_state_all as
select n.notice_id, n.raised_by, n.raised_at, n.to_role, n.to_person,
       n.subject_kind, n.subject_ref, n.note,
       case when a.notice_id is null then 'open' else 'acknowledged' end as state,
       a.acknowledged_by, a.acknowledged_at, a.note as acknowledgement_note
from cw.notice n
left join cw.notice_acknowledgement a using (notice_id);

comment on view cw.notice_state_all is
  'THE DERIVATION WITHOUT THE SCOPING. Granted to nobody: the schema reads it
   through SECURITY DEFINER functions, where cw.app_role() is null and a
   scoping predicate would match nothing. People read cw.notice_state.';

-- The predicate is 0064's read_scoped policy on cw.notice, repeated. It is on
-- the notice and never on the acknowledgement: a notice you may read carries
-- its acknowledgement, and one you may not read does not appear at all.
create or replace view cw.notice_state as
select * from cw.notice_state_all n
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or n.raised_by = cw.app_actor()
   or n.to_person = cw.app_actor()
   or n.to_role = cw.app_role();

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · cw.obligation_state — cw.obligation_instance's read_scoped
-- ══════════════════════════════════════════════════════════════════════════
-- Note this one is read by cw.agreement_close_eligibility above. Scoping both
-- is not belt and braces: each is granted separately and reachable on its own
-- endpoint, and a view that relied on another view's WHERE clause would be one
-- refactor away from opening again.
create or replace view cw.obligation_state_all as
select i.obligation_id, i.agreement_id, i.clause_id, i.version, i.kind,
       i.obliged, i.summary, i.occurrence, i.due_on, i.evidence, i.lead_days,
       i.survives, i.entitlement,
       cw.obligation_owner(i.obligation_id) as owner_person,
       closed.act as closed_as, closed.acted_by as closed_by,
       closed.acted_at as closed_at,
       breach.acted_by as breach_asserted_by,
       case
         when closed.act is not null then closed.act
         when i.due_on is null then 'pending'
         when current_date > i.due_on then 'overdue'
         when current_date >= (i.due_on - i.lead_days) then 'due'
         else 'pending'
       end as state
from cw.obligation_instance i
left join lateral (
  select a.act, a.acted_by, a.acted_at
  from cw.obligation_act a
  where a.obligation_id = i.obligation_id
    and a.act = any (array['satisfied','waived'])
  order by a.act_id
  limit 1) closed on true
left join lateral (
  select a.acted_by
  from cw.obligation_act a
  where a.obligation_id = i.obligation_id and a.act = 'breach_asserted'
  order by a.act_id desc
  limit 1) breach on true;

comment on view cw.obligation_state_all is
  'THE DERIVATION WITHOUT THE SCOPING — due/overdue arithmetic, the owner, and
   the closing act. Granted to nobody: cw.waiting_for reads it as the owner,
   where cw.app_role() is null. People read cw.obligation_state.';

-- cw.obligation_instance's read_scoped policy, repeated.
create or replace view cw.obligation_state as
select * from cw.obligation_state_all i
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and cw.owns_agreement(i.agreement_id));

-- ══════════════════════════════════════════════════════════════════════════
-- 3 · cw.agreement_close_eligibility — cw.executed_agreement's read_scoped
-- ══════════════════════════════════════════════════════════════════════════
-- THE WHERE SITS BEFORE THE GROUP BY, for 0027's reason: written as a HAVING it
-- would filter groups after the counts had been computed over every row. The
-- scoping expression is constant per agreement, so in WHERE it restricts the
-- rows the aggregate sees and leaves each surviving group's counts identical.
--
-- The viewer branch is carried across even though no viewer holds a grant on
-- this view today. It is what the policy says, and a predicate that agrees with
-- its policy stays true when a grant changes.
create or replace view cw.agreement_close_eligibility as
select ea.agreement_id,
       count(s.obligation_id) filter (where s.survives and s.closed_as is null)::int
         as surviving_open,
       count(s.obligation_id) filter (where s.survives and s.closed_as is null) = 0
         as closeable
from cw.executed_agreement ea
left join cw.obligation_state_all s on s.agreement_id = ea.agreement_id
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and cw.owns_agreement(ea.agreement_id))
   or (cw.app_role() = 'viewer'
       and cw.is_shared_with(ea.agreement_id, cw.app_actor()))
group by ea.agreement_id;

-- ══════════════════════════════════════════════════════════════════════════
-- 4 · cw.obligation_unowned — the same predicate
-- ══════════════════════════════════════════════════════════════════════════
create or replace view cw.obligation_unowned as
select obligation_id, agreement_id, kind, due_on
from cw.obligation_instance i
where cw.obligation_owner(obligation_id) is null
  and not exists (
    select 1 from cw.obligation_act a
    where a.obligation_id = i.obligation_id
      and a.act = any (array['satisfied','waived']))
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and cw.owns_agreement(i.agreement_id)));

-- ══════════════════════════════════════════════════════════════════════════
-- 5 · cw.vendor_friction — the scoping goes on the cw.agreement scan
-- ══════════════════════════════════════════════════════════════════════════
-- ONE PLACE, NOT SIX. Every lateral beneath already correlates on
-- a.agreement_id, so restricting the agreements the outer scan sees restricts
-- every count under it. Repeating the predicate in each lateral would be five
-- more copies to keep in step, which is how two copies of one rule stop
-- agreeing.
--
-- The predicate is cw.agreement's read_own policy: the administrator branch is
-- carried across for the same reason the viewer branch is above — it is what
-- the policy says — even though no administrator holds a grant here today.
create or replace view cw.vendor_friction as
with by_vendor as (
  select a.counterparty,
         count(distinct a.agreement_id) as deals,
         count(distinct a.agreement_id) filter (where a.status = 'executed')
           as executed,
         coalesce(sum(rr.received_rounds), 0) as rounds_received,
         coalesce(sum(pp.positions), 0) as positions_contested,
         coalesce(sum(pp.escalated), 0) as positions_escalated,
         coalesce(sum(pp.conceded), 0) as positions_conceded,
         coalesce(sum(tt.supplier_tickets), 0) as supplier_paper_tickets
  from cw.agreement a
  left join lateral (
    select count(*) as received_rounds
    from cw.negotiation n
    join cw.negotiation_round r on r.negotiation_id = n.negotiation_id
    where n.agreement_id = a.agreement_id and r.direction = 'received') rr on true
  left join lateral (
    select count(distinct np.position_id) as positions,
           count(distinct np.position_id) filter (where pm.to_state = 'escalated')
             as escalated,
           count(distinct np.position_id) filter (where pm.to_state = 'conceded')
             as conceded
    from cw.negotiation n
    join cw.negotiation_position np on np.negotiation_id = n.negotiation_id
    left join cw.position_movement pm on pm.position_id = np.position_id
    where n.agreement_id = a.agreement_id) pp on true
  left join lateral (
    select count(*) as supplier_tickets
    from cw.review_ticket t
    where t.agreement_id = a.agreement_id
      and t.reason_code = 'supplier-paper') tt on true
  where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
     or (cw.app_role() = 'requester' and a.requester = cw.app_actor())
  group by a.counterparty
), rates as (
  select (select value::numeric from cw.governance_setting
           where key = 'friction_hourly_rate_usd') as hourly,
         (select value::numeric from cw.governance_setting
           where key = 'friction_hours_per_round') as per_round,
         (select value::numeric from cw.governance_setting
           where key = 'friction_hours_per_escalation') as per_escalation
)
select v.counterparty, v.deals, v.executed, v.rounds_received,
       v.positions_contested, v.positions_escalated, v.positions_conceded,
       v.supplier_paper_tickets,
       round((v.rounds_received + v.positions_escalated + v.supplier_paper_tickets)
             / greatest(v.deals, 1)::numeric, 1) as friction_per_deal,
       'measured' as counts_are,
       round((v.rounds_received * r.per_round
              + (v.positions_escalated + v.supplier_paper_tickets) * r.per_escalation)
             * r.hourly, 0) as estimated_handling_cost_usd,
       'estimate — hours and rate are Administrator settings, not measurements'
         as cost_is
from by_vendor v
cross join rates r;

-- ══════════════════════════════════════════════════════════════════════════
-- 6 · cw.waiting_for reads the derivations, not the scoped views
-- ══════════════════════════════════════════════════════════════════════════
-- 0064's body, carried across UNCHANGED except for two table names. See that
-- file's header before touching it: this function has been rebuilt four times
-- (0041, 0044, 0059, 0064) and each rebuild carries the whole body forward.
--
-- WHY IT HAD TO MOVE. It is SECURITY DEFINER, so cw.app_role() is NULL inside
-- it — 0064 says so in a comment twelve lines above the query. Reading a view
-- that scopes on app_role() therefore returned NOTHING, and every notice and
-- every due obligation disappeared from the workspace panel and the daily
-- digest. Three database suites caught it, which is the only reason this
-- paragraph is here rather than in an incident note.
--
-- IT LOSES NO SCOPING BY READING THE UNSCOPED DERIVATIONS. The function's own
-- guard above the query already refuses to answer for anybody but the signed
-- caller and their role, and every branch filters on p_person or p_role. The
-- scoping was never the view's job here.
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
  from cw.obligation_state_all s
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
  from cw.notice_state_all n
  where n.state = 'open'
    and (n.to_person = p_person or n.to_role = p_role);
end $$;

revoke all on function cw.waiting_for(text, text) from public;
grant execute on function cw.waiting_for(text, text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin,
  cw_auditor, cw_administrator;

-- ══════════════════════════════════════════════════════════════════════════
-- 7 · The derivations are granted to NOBODY, said out loud
-- ══════════════════════════════════════════════════════════════════════════
-- create view grants nothing by default, so these are belt and braces — and
-- they are the statement of intent. An `_all` view is unscoped over a
-- person-scoped table BY DESIGN; the only thing standing between it and the
-- leak this migration closes is that no application role can reach it.
-- db/test/views-are-not-policies.test.mjs asserts that, so a later grant fails
-- a test rather than opening a hole quietly.
revoke all on cw.notice_state_all from public;
revoke all on cw.obligation_state_all from public;

commit;
