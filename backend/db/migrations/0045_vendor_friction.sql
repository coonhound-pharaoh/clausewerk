-- 0045 · The vendor friction scorecard (RP-03)
--
-- Procurement compares vendors on price; the record knows the other cost —
-- how much argument a vendor's paper generates before it can be signed. This
-- surface aggregates what already happened, per counterparty name, so the
-- next deal with the same name starts informed.
--
-- THERE IS NO VENDOR TABLE, DELIBERATELY REUSED AS-IS. Counterparty is the
-- free-text name on the deal (cw.agreement.counterparty); this view groups on
-- it verbatim. "Acme Corp" and "Acme Corporation" are therefore two rows —
-- honest, visible, and exactly the incentive to type names consistently. A
-- vendor master table is a real feature with governance of its own (who may
-- merge two names is not a small question) and is not smuggled in through a
-- report.
--
-- THE COST COLUMN IS AN ESTIMATE AND SAYS SO (the NC-25 rule: the label
-- travels in the view, not in a screen that has to remember it). The counts
-- are measurements; the dollar figure multiplies them by assumptions the
-- Administrator can see and change as settings. Two kinds of number, labelled
-- as what each one is, in the row itself.

select set_config('cw.actor', 'migration-0045', false);
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
values
  ('friction_hourly_rate_usd', '250', 'operational', false, false, null,
   'Engineering default, undecided. Blended hourly cost of the people who '
   'handle negotiation rounds and escalations. Operational because it changes '
   'an estimate on a report, never what anyone may do.',
   'Blended hourly rate the friction scorecard multiplies by.'),
  ('friction_hours_per_round', '2', 'operational', false, false, null,
   'Engineering default, undecided. Assumed hours of combined Legal and '
   'requester time per negotiation round received.',
   'Assumed hours of handling per received negotiation round.'),
  ('friction_hours_per_escalation', '4', 'operational', false, false, null,
   'Engineering default, undecided. Assumed hours per escalated position or '
   'escalated review ticket.',
   'Assumed hours of Legal time per escalation.');

create or replace view cw.vendor_friction as
with by_vendor as (
  select
    a.counterparty,
    count(distinct a.agreement_id)                     as deals,
    count(distinct a.agreement_id)
      filter (where a.status = 'executed')             as executed,
    coalesce(sum(rr.received_rounds), 0)               as rounds_received,
    coalesce(sum(pp.positions), 0)                     as positions_contested,
    coalesce(sum(pp.escalated), 0)                     as positions_escalated,
    coalesce(sum(pp.conceded), 0)                      as positions_conceded,
    coalesce(sum(tt.supplier_tickets), 0)              as supplier_paper_tickets
  from cw.agreement a
  left join lateral (
    select count(*) as received_rounds
    from cw.negotiation n
    join cw.negotiation_round r on r.negotiation_id = n.negotiation_id
    where n.agreement_id = a.agreement_id and r.direction = 'received'
  ) rr on true
  left join lateral (
    select count(distinct np.position_id) as positions,
           count(distinct np.position_id) filter (where pm.to_state = 'escalated')
             as escalated,
           count(distinct np.position_id) filter (where pm.to_state = 'conceded')
             as conceded
    from cw.negotiation n
    join cw.negotiation_position np on np.negotiation_id = n.negotiation_id
    left join cw.position_movement pm on pm.position_id = np.position_id
    where n.agreement_id = a.agreement_id
  ) pp on true
  left join lateral (
    select count(*) as supplier_tickets
    from cw.review_ticket t
    where t.agreement_id = a.agreement_id
      and t.reason_code = 'supplier-paper'
  ) tt on true
  group by a.counterparty
),
rates as (
  select
    (select value::numeric from cw.governance_setting
      where key = 'friction_hourly_rate_usd')       as hourly,
    (select value::numeric from cw.governance_setting
      where key = 'friction_hours_per_round')       as per_round,
    (select value::numeric from cw.governance_setting
      where key = 'friction_hours_per_escalation')  as per_escalation
)
select
  v.counterparty,
  v.deals,
  v.executed,
  v.rounds_received,
  v.positions_contested,
  v.positions_escalated,
  v.positions_conceded,
  v.supplier_paper_tickets,
  -- The score: a plain sum of the friction events, per deal, so a vendor with
  -- ten smooth deals is not out-scored by one with a single rough one.
  round((v.rounds_received + v.positions_escalated + v.supplier_paper_tickets)
        / greatest(v.deals, 1)::numeric, 1)          as friction_per_deal,
  'measured'::text                                   as counts_are,
  round((v.rounds_received * r.per_round
         + (v.positions_escalated + v.supplier_paper_tickets) * r.per_escalation)
        * r.hourly, 0)                               as estimated_handling_cost_usd,
  'estimate — hours and rate are Administrator settings, not measurements'::text
                                                     as cost_is
from by_vendor v cross join rates r;

comment on view cw.vendor_friction is
  'Historical friction per counterparty name, grouped verbatim — a misspelled
   vendor is two rows, visibly. Counts are measured from the record; the cost
   column is an estimate labelled as one in the row itself, multiplying the
   counts by assumption settings anyone reading it can inspect.';

-- Readable by everyone who opens deals or reviews them: the whole point is
-- that the REQUESTER sees this at intake, before committing to a vendor.
-- It aggregates event counts per vendor name and carries no contract content,
-- no clause text, and no deal identifiers.
grant select on cw.vendor_friction to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
