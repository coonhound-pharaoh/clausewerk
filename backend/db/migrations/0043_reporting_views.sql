-- 0043 · The reporting views (RP-01)
--
-- Four questions Legal's management already asks by hand, answered from the
-- record it already keeps. NOTHING NEW IS STORED: every figure here is derived
-- fresh from the run store, the negotiation record, the review queue and the
-- executed agreements — the same tables the audit trail already guards. A
-- reporting module that kept its own copy of any of these numbers would be a
-- second source of truth able to drift from the first, and the drift would be
-- invisible; so there is no aggregator table, no materialisation, no schedule.
-- If these views ever get slow the answer is a materialised view REFRESHED
-- from this exact SQL, never a parallel store.
--
-- WHO MAY READ THEM, and why it is narrower than the tables underneath.
-- A view executes with its owner's rights, so the grant below is the entire
-- control (the cw.retention_due precedent). These views aggregate across
-- EVERY deal — including deals whose row policies scope a requester to their
-- own — so they are management surfaces: legal_admin and auditor only.
-- The administrator runs the machine and reads none of this; a report is
-- contract operations, not operations of the machine.

-- ── 1 · Velocity: how long things actually take ─────────────────────────────
-- One row per deal that has at least started. Every duration is in whole days
-- and derived from timestamps the record already holds; a null means the deal
-- has not reached that milestone, and stays null rather than being read as 0.
create or replace view cw.report_velocity as
select
  a.agreement_id,
  a.counterparty,
  a.status,
  a.created_at::date                            as opened_on,
  first_run.first_run_on,
  ea.executed_on,
  (first_run.first_run_on - a.created_at::date) as days_open_to_first_assembly,
  (ea.executed_on - first_run.first_run_on)     as days_assembly_to_signature,
  (ea.executed_on - a.created_at::date)         as days_open_to_signature,
  coalesce(rounds.turns, 0)                     as negotiation_turns
from cw.agreement a
left join lateral (
  select min(r.created_at)::date as first_run_on
  from cw.run r where r.agreement_id = a.agreement_id
) first_run on true
left join cw.executed_agreement ea on ea.agreement_id = a.agreement_id
left join lateral (
  select count(*) as turns
  from cw.negotiation n
  join cw.negotiation_round nr on nr.negotiation_id = n.negotiation_id
  where n.agreement_id = a.agreement_id
) rounds on true;

comment on view cw.report_velocity is
  'Cycle time per deal: opened → first assembly → signature, plus negotiation
   turns. Derived fresh from the record; a null milestone is a milestone not
   reached, never a zero.';

-- ── 2 · The contested-clause leaderboard ────────────────────────────────────
-- Which categories generate friction: review-queue escalations, supplier
-- pushback, and negotiation positions that moved off their opening rung.
-- This is the signal that a standard position may be priced too aggressively —
-- WHAT to do about the words is Legal''s call, never this view''s.
create or replace view cw.report_clause_contest as
select
  c.key                                   as category_key,
  c.label,
  coalesce(t.escalated, 0)                as tickets_escalated,
  coalesce(t.supplier_paper, 0)           as tickets_supplier_paper,
  coalesce(t.rejected, 0)                 as tickets_rejected,
  coalesce(p.positions_opened, 0)         as positions_opened,
  coalesce(p.positions_conceded, 0)       as positions_conceded,
  coalesce(p.positions_escalated, 0)      as positions_escalated,
  coalesce(t.escalated, 0) + coalesce(t.supplier_paper, 0)
    + coalesce(p.positions_escalated, 0)  as contests
from cw.category c
left join lateral (
  select
    count(*) filter (where rt.reason_code = 'human-escalated') as escalated,
    count(*) filter (where rt.reason_code = 'supplier-paper')  as supplier_paper,
    count(*) filter (where rt.state = 'rejected')              as rejected
  from cw.review_ticket rt where rt.category_key = c.key
) t on true
left join lateral (
  select
    count(distinct np.position_id) as positions_opened,
    count(distinct np.position_id) filter (where pm.to_state = 'conceded')
      as positions_conceded,
    count(distinct np.position_id) filter (where pm.to_state = 'escalated')
      as positions_escalated
  from cw.negotiation_position np
  left join cw.position_movement pm on pm.position_id = np.position_id
  where np.category_key = c.key
) p on true;

comment on view cw.report_clause_contest is
  'Friction per category: escalations, supplier pushback, concessions. A high
   count says a standard position generates argument; what to do about the
   words is Legal''s, never this view''s.';

-- ── 3 · Review-queue bottlenecks ────────────────────────────────────────────
-- Two shapes in one surface would invite misreading, so there are two views:
-- the queue as it stands, and each decider''s history.
create or replace view cw.report_queue_state as
select
  count(*) filter (where state = 'pending')                        as pending,
  min(created_at) filter (where state = 'pending')                 as oldest_pending_since,
  count(*) filter (where state = 'pending'
                     and created_at < now() - interval '7 days')   as pending_over_week
from cw.review_ticket;

create or replace view cw.report_reviewer_throughput as
select
  decided_by                                            as reviewer,
  count(*)                                              as decided,
  count(*) filter (where state = 'verified')            as verified,
  count(*) filter (where state = 'rejected')            as rejected,
  round(avg(extract(epoch from decided_on - created_at) / 3600.0)::numeric, 1)
                                                        as mean_hours_to_decision
from cw.review_ticket
where decided_by is not null
group by decided_by;

comment on view cw.report_reviewer_throughput is
  'Per-reviewer decision history. A throughput number is a workload signal for
   staffing, never a performance score — the mean hides the hard tickets.';

-- ── 4 · Risk exposure across the live portfolio ─────────────────────────────
-- For every executed, still-active agreement: how its recorded decisions
-- distribute across category and severity. The severity is the one the RUN
-- recorded — what was actually assembled — not what the library says today;
-- what the library says today is the policy-shift question, and it gets its
-- own surface rather than being blended into this one.
create or replace view cw.report_risk_exposure as
select
  d.category_key,
  c.label,
  d.severity,
  count(distinct ea.agreement_id) as active_agreements
from cw.executed_agreement ea
join cw.agreement a on a.agreement_id = ea.agreement_id
join cw.run_decision d on d.run_id = ea.run_id
join cw.category c on c.key = d.category_key
where a.status = 'executed'
  and (ea.term_end is null or ea.term_end >= current_date)
group by d.category_key, c.label, d.severity;

comment on view cw.report_risk_exposure is
  'Live portfolio by category and recorded severity. Counts agreements, not
   clauses, because the exposure question is "how many contracts", and it
   reads the run each agreement was executed from — the record, not today''s
   library.';

-- ── Who may read ────────────────────────────────────────────────────────────
grant select on cw.report_velocity,
                cw.report_clause_contest,
                cw.report_queue_state,
                cw.report_reviewer_throughput,
                cw.report_risk_exposure
  to cw_legal_admin, cw_auditor;
