-- 0038 · Computed states and close eligibility (OB-03)
--
-- OBLIGATIONS-ARCHITECTURE.md §2.3, on ADR-0006's precedent (clause expiry is
-- computed, not stored): pending, due and overdue are FACTS OF ARITHMETIC over
-- the due date, the lead window and the clock — so they are computed in a view,
-- written nowhere, and there is NO state-mover job to run and therefore none to
-- silently die. Only human acts are recorded (0037), and this view is where the
-- two meet: a recorded closure wins, and everything else is the calendar.
--
-- Note what 'overdue' is NOT: breach. D-1 (settled 2026-07-28, the governance
-- row is in 0037): the system never says breach. A breach assertion appears
-- here as its own recorded fact BESIDE the computed state, never in place of it.

create or replace view cw.obligation_state as
select i.obligation_id, i.agreement_id, i.clause_id, i.version, i.kind,
       i.obliged, i.summary, i.occurrence, i.due_on, i.evidence, i.lead_days,
       i.survives, i.entitlement,
       cw.obligation_owner(i.obligation_id) as owner_person,
       closed.act      as closed_as,
       closed.acted_by as closed_by,
       closed.acted_at as closed_at,
       breach.acted_by as breach_asserted_by,
       case
         when closed.act is not null then closed.act
         -- Unanchored (termination-anchored, or no term_end): visibly pending,
         -- never silently dated.
         when i.due_on is null then 'pending'
         when current_date > i.due_on then 'overdue'
         when current_date >= i.due_on - i.lead_days then 'due'
         else 'pending'
       end as state
from cw.obligation_instance i
left join lateral (
  select a.act, a.acted_by, a.acted_at from cw.obligation_act a
   where a.obligation_id = i.obligation_id and a.act in ('satisfied','waived')
   order by a.act_id limit 1) closed on true
left join lateral (
  select a.acted_by from cw.obligation_act a
   where a.obligation_id = i.obligation_id and a.act = 'breach_asserted'
   order by a.act_id desc limit 1) breach on true;

comment on view cw.obligation_state is
  'pending/due/overdue are computed from the calendar on every read (ADR-0006
   precedent); satisfied/waived come from the recorded acts. Overdue is
   arithmetic, never breach — D-1. Granted to every working role WITHOUT
   per-person scoping, deliberately: colleagues cover for each other
   (open-questions §12, settled), and confidentiality arrives as an explicit
   per-deal marking, not as a default. Not granted to viewers.';

-- ── Close eligibility ───────────────────────────────────────────────────────
-- LIFECYCLE §3.5: close happens when every SURVIVING obligation is terminal.
-- Nobody marks a deal closed; the record says whether it is. An unanchored
-- survivor (no termination date yet) is open and therefore blocks — the
-- fail-closed reading, because "we cannot date it yet" is not "it is met".
create or replace view cw.agreement_close_eligibility as
select ea.agreement_id,
       count(s.obligation_id) filter
         (where s.survives and s.closed_as is null)::int as surviving_open,
       (count(s.obligation_id) filter
         (where s.survives and s.closed_as is null) = 0) as closeable
from cw.executed_agreement ea
left join cw.obligation_state s on s.agreement_id = ea.agreement_id
group by ea.agreement_id;

-- Not viewer-readable, so the views-are-not-policies inventory is untouched.
grant select on cw.obligation_state, cw.agreement_close_eligibility to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
