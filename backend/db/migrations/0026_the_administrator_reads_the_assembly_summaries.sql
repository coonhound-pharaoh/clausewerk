-- 0026 · Owner decision — the Administrator sees the assembly summaries too
--
-- ── THE DECISION ─────────────────────────────────────────────────────────────
-- Mike, 2026-07-27, answering the question raised in docs/open-questions.md §11:
--
--   "Seeing an alarm you can't investigate is worse than either alternative."
--
-- The Administrator could already read every FINDING on every assembly in the
-- company — 0013_administrator.sql:290-306 grants the three run tables and
-- 0013:321 gives an explicit read policy on cw.run. What they could not read was
-- either SUMMARY: cw.run_summary (what was assembled, when, by whom, whether it
-- is clear to sign) or cw.run_contract (which clause went in for which risk).
--
-- That was an omission and not a judgement. Both views predate the role by two
-- migrations, and 0005_run_store.sql:293-297 names the auditor and the three
-- writing roles because those were the roles that existed. 0025 deliberately
-- left the gap open rather than closing it inside a scoping migration, on the
-- precedent 0018_library_and_ladder_views.sql:170-190 set for this same role.
-- This file is the owner closing it on its own.
--
--
-- ── WHY THIS IS TWO CHANGES AND NOT ONE GRANT ────────────────────────────────
--
-- THE GRANT ALONE WOULD HAVE MADE IT WORSE, and this system has already paid
-- for that exact mistake once.
--
-- 0025 scoped both views in their own WHERE clause, and 'administrator' is not
-- in either one — correctly at the time, because a branch no grant could reach
-- would have been reassuring text that could never execute. Add the grant and
-- leave the clause alone, and the Administrator passes the privilege check,
-- matches no branch, and is answered ZERO ROWS.
--
-- An empty list is not a smaller version of a refusal, it is a different
-- sentence: the screen would say "no contracts have been assembled" to the one
-- person in the company who can see every finding on every one of them.
--
-- That is finding-shaped and it is already written up: docs/open-questions.md §9
-- records the identical failure on legal holds — a grant with no matching policy
-- branch, so row-level security FILTERED instead of REFUSING, and the
-- Administrator was shown "No holds are open" while a hold was open. Owner
-- decision U13 (0024) settled that one by removing the inert grant. Here the
-- decision goes the other way, so the branch has to be added with it.

begin;

grant select on cw.run_summary, cw.run_contract to cw_administrator;

-- The same select list and the same scoping as 0025, with one more role
-- admitted. The Administrator sees every assembly, as they already see every
-- finding — there is no per-person narrowing for this role anywhere in the
-- schema and inventing one here would be a new control nobody asked for.
create or replace view cw.run_summary as
select r.run_id, r.vendor, r.agreement_id, r.manifest_source,
       r.snapshot_id, r.ruleset_id, r.result_hash, r.engine_version,
       r.gate_open, r.overridden, r.created_by, r.created_at,
       (select count(*) from cw.run_decision d where d.run_id = r.run_id)                    as decisions,
       (select count(*) from cw.run_decision d where d.run_id = r.run_id and d.clause_id is null) as unresolved,
       (select count(*) from cw.run_finding f where f.run_id = r.run_id)                     as findings,
       (select count(*) from cw.run_finding f where f.run_id = r.run_id and f.severity = 'High') as blocking
from cw.run r
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester'
       and (r.created_by = cw.app_actor()
            or (r.agreement_id is not null and cw.owns_agreement(r.agreement_id))));

create or replace view cw.run_contract as
select d.run_id, d.seq, c.label as category, d.severity, d.reason, d.baseline,
       d.clause_id, d.version,
       v.title, v.body, d.warning, d.suppressed
from cw.run_decision d
join cw.run r on r.run_id = d.run_id
join cw.category c on c.key = d.category_key
left join cw.clause_version v on v.clause_id = d.clause_id and v.version = d.version
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester'
       and (r.created_by = cw.app_actor()
            or (r.agreement_id is not null and cw.owns_agreement(r.agreement_id))))
order by d.run_id, d.seq;

comment on view cw.run_summary is
  'One line per assembly run. Scoped in its own WHERE clause since 0025 — a '
  'view does not inherit the policy on the table underneath it. The '
  'Administrator was admitted in 0026 by owner decision: they could already '
  'read every finding, and an alarm nobody can investigate is worse than '
  'either alternative.';

commit;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Reverting means BOTH halves, in this order, or the empty-list failure above
-- is what gets shipped:
--
--   revoke select on cw.run_summary, cw.run_contract from cw_administrator;
--   -- then recreate both views with 0025's WHERE clause, which reads
--   --   where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
--   --      or (cw.app_role() = 'requester' and (...))
--
-- Revoking the grant while leaving 'administrator' in the clause is harmless
-- (unreachable text, caught by views-are-not-policies.test.mjs's intent if not
-- its letter). Dropping the clause while leaving the grant is the failure.
