-- 0046 · Policy-shift exposure: the retro-scan over the executed portfolio (RP-04)
--
-- When Legal promotes a new clause version, the library moves on — and every
-- executed agreement stays exactly as signed, which is the run store's whole
-- promise. This view answers the question that promotion raises: WHICH live
-- agreements now carry a superseded version, and which lack the clause's
-- category altogether. It is the worklist an amendment campaign starts from.
--
-- WHAT IT DELIBERATELY DOES NOT DO: generate the amendments. An amendment is
-- an assembled document with its own run, gate and signature — machinery that
-- exists for first execution and has not been decided for amendments (there
-- is no amendment-assembly path today; cw.executed_document merely files one
-- after the fact). Generating "drafts ready to bulk-approve" from a report
-- would be this view inventing a second, weaker way for language to reach an
-- agreement — the exact move the trust boundary exists to refuse. So the
-- output is the exposure list, per agreement, per clause: everything Legal
-- needs to decide WHERE to act, nothing that acts.
--
-- The comparison is against the CURRENT library, computed at read time, so
-- the morning after a promotion this view is already right, with no batch job
-- to run or forget (the A-3 lesson, again).

create or replace view cw.policy_shift_exposure as
with current_library as (
  -- The latest live version of every clause: not retired, not expired.
  select v.clause_id, max(v.version) as current_version
  from cw.clause_version v
  where not v.retired
    and (v.expires_on is null or v.expires_on >= current_date)
  group by v.clause_id
),
live_agreements as (
  select ea.agreement_id, a.counterparty, ea.run_id, ea.executed_on
  from cw.executed_agreement ea
  join cw.agreement a on a.agreement_id = ea.agreement_id
  where a.status = 'executed'
    and (ea.term_end is null or ea.term_end >= current_date)
)
-- An agreement carrying a version the library has since moved past.
select
  la.agreement_id,
  la.counterparty,
  la.executed_on,
  d.category_key,
  d.clause_id,
  d.version            as executed_version,
  cl.current_version,
  'outdated'::text     as exposure
from live_agreements la
join cw.run_decision d on d.run_id = la.run_id and d.clause_id is not null
join current_library cl on cl.clause_id = d.clause_id
                       and cl.current_version > d.version
union all
-- An agreement with no decision at all in a category the library now marks
-- always-include: the clause was not there to select when it was assembled,
-- or was skipped, and today's library says every agreement should carry one.
select
  la.agreement_id,
  la.counterparty,
  la.executed_on,
  c.category_key,
  c.clause_id,
  null                 as executed_version,
  cl.current_version,
  'missing'::text      as exposure
from live_agreements la
cross join (select clause_id, category_key from cw.clause where always_include) c
join current_library cl on cl.clause_id = c.clause_id
where not exists (
  select 1 from cw.run_decision d
  where d.run_id = la.run_id and d.category_key = c.category_key
    and d.clause_id is not null);

comment on view cw.policy_shift_exposure is
  'Live agreements measured against the CURRENT library: superseded versions
   and missing always-include categories, computed fresh at read time. The
   worklist an amendment campaign starts from — never the amendments
   themselves, because a report must not become a second way for language to
   reach an agreement.';

-- The amendment campaign is Legal''s; the auditor checks it happened.
grant select on cw.policy_shift_exposure to cw_legal_admin, cw_auditor;
