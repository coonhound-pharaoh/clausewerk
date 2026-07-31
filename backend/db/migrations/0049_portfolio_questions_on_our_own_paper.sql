-- 0049 · Portfolio questions on our own paper — a certain count, no AI (NC-16)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-30: the
-- highest present was 0048, so 0049 is the next free number.
--
-- WHAT THIS ANSWERS: "how many contracts carry clause X", "what is in force
-- per category and severity", "which rung was that clause on when the deal
-- was assembled" — counted from cw.run_decision, the recorded decision sets.
-- THE CERTAIN HALF, and labelled as such: an AI-assessed half over supplier
-- paper (NC-24) can later stand beside it without either being read as the
-- whole.
--
-- ── THE AGREEMENT-REPRESENTATION RULE, STATED (the prerequisite NC-16 names)
--
--   · An agreement is represented by its LATEST run — greatest
--     (created_at, run_id), the tie-break making the rule total. The latest
--     run is the most recent statement of what the deal's paper is; counting
--     every run would double-count renegotiated deals.
--   · A run with NO agreement stands alone: it appears in its own
--     `unattached_runs` figure, never dropped and never able to double-count
--     a deal.
--
-- Both halves are asserted by portfolio.test.mjs.
--
-- ── SCOPING, IN THE VIEW'S OWN WHERE CLAUSE
--
-- The narrowest defensible fence, pending D-7: the run views' own phrasing,
-- copied verbatim from 0026 (administrator included there by owner decision).
-- D-7 can only ever widen this. The count criterion this protects: a
-- requester's NUMBERS are computed only over runs they created or deals they
-- own — a count computed above an unscoped base would leak a correct-looking
-- company total while showing no rows.
--
-- REPRESENTATIVENESS IS A GLOBAL FACT, evaluated before the fence: which run
-- is an agreement's latest does not depend on who is asking. The not-exists
-- below runs with the view owner's sight over cw.run, deliberately — a
-- requester whose deal's latest run was recorded by Legal still sees THAT
-- run (through cw.owns_agreement), not their own older one promoted to
-- "latest" by a scoped comparison.

create or replace view cw.portfolio_run as
select r.*
from cw.run r
where (r.agreement_id is null
       or not exists (select 1 from cw.run r2
                       where r2.agreement_id = r.agreement_id
                         and (r2.created_at, r2.run_id) > (r.created_at, r.run_id)))
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester'
           and (r.created_by = cw.app_actor()
                or (r.agreement_id is not null and cw.owns_agreement(r.agreement_id)))));

comment on view cw.portfolio_run is
  'The runs the portfolio counts over: each agreement''s latest run (the
   representation rule, stated in 0049) plus every unattached run. Scoped in
   its own WHERE clause in the run views'' exact phrasing (0026); the
   representativeness test deliberately is not scoped — which run is latest
   is a global fact.';

-- ── The drill-down: per category, severity, clause and version ──────────────
-- One row per position actually selected, with the pinned rung beside it:
-- cw.snapshot_ladder_rung is the rung the clause occupied AT RUN TIME, which
-- is why a historic answer reproduces after a supersession instead of being
-- recomputed against today's library.
create or replace view cw.portfolio_position as
select d.category_key, c.label as category, d.severity,
       d.clause_id, d.version, v.title,
       slr.rung as rung_at_run, slr.is_floor as was_floor,
       count(*)                                as decisions,
       count(distinct p.agreement_id)          as agreements,
       count(*) filter (where p.agreement_id is null) as unattached_runs
from cw.portfolio_run p
join cw.run_decision d on d.run_id = p.run_id
join cw.category c on c.key = d.category_key
left join cw.clause_version v
  on v.clause_id = d.clause_id and v.version = d.version
left join cw.snapshot_ladder_rung slr
  on slr.snapshot_id = p.snapshot_id
 and slr.clause_id = d.clause_id and slr.version = d.version
 and slr.category_key = d.category_key and slr.severity = d.severity
where d.clause_id is not null
group by d.category_key, c.label, d.severity, d.clause_id, d.version, v.title,
         slr.rung, slr.is_floor;

comment on view cw.portfolio_position is
  'How many agreements carry each clause version, by category and severity,
   over the representative runs (cw.portfolio_run). rung_at_run is the PINNED
   rung from the run''s own snapshot — historic answers reproduce, they are
   never recomputed against today''s library. The certain half of WP-8: a
   count, no AI, labelled as such.';

-- ── Unresolved, as its own count ────────────────────────────────────────────
-- A null clause_id is "nothing could be selected" — a hard flag, never a
-- substitution (0005:173-174) — so the portfolio reports it as its own
-- figure, never folded into zero.
create or replace view cw.portfolio_unresolved as
select d.category_key, c.label as category, d.severity,
       count(*)                                as unresolved,
       count(distinct p.agreement_id)          as agreements,
       count(*) filter (where p.agreement_id is null) as unattached_runs
from cw.portfolio_run p
join cw.run_decision d on d.run_id = p.run_id
join cw.category c on c.key = d.category_key
where d.clause_id is null
group by d.category_key, c.label, d.severity;

comment on view cw.portfolio_unresolved is
  'Positions where nothing could be selected, over the representative runs.
   Reported as its own count because an unresolved decision folded into an
   absent one reads as "no exposure" when it means "unmeasured exposure".';

-- ── Who reads them ──────────────────────────────────────────────────────────
-- The run views' readers, exactly: the fence is the scoping above, and the
-- grant list matches the tables the counts are drawn from. No viewer.
grant select on cw.portfolio_run, cw.portfolio_position, cw.portfolio_unresolved
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
