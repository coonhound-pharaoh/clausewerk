-- 0025 · A run belongs to the caller's deal, and the two run views scope themselves
--
-- ── THE NUMBER THIS FILE CLAIMED, AND HOW ────────────────────────────────────
-- 0025, verified by listing backend/db/migrations/ at the moment this package
-- began rather than taken from a plan written earlier. The directory already
-- held 0001-0023 PLUS an untracked 0024_the_flag_is_enough.sql — the owner's
-- own U13 decision, dated 2026-07-27, sitting in his working tree. He was asked
-- directly whether it is landing and whether it must land first; his answer was
-- that it IS landing, so 0024 is his and this file takes 0025. Nothing here
-- touches, moves, renames or reads that file.
--
-- The bootstrap applies migrations in filename order with no gate against a
-- duplicate number, so two files sharing one would not announce itself — it
-- would surface later as a migration that silently did not run.
--
--
-- ── WHY THIS FILE EXISTS: THREE DISCOVERED FACTS ─────────────────────────────
--
-- The settled owner decision of 2026-07-27 — "every assembly run belongs to a
-- deal" — says the database's own row rules decide whose deal a requester may
-- run against. They do not. Three separate things were found while wiring the
-- assembly engine to the service, and all three are closed here because the
-- alternative is deciding permissions in an endpoint, which this system does
-- not do anywhere.
--
-- (a) cw.run's INSERT policy checks the ROLE ONLY.
--     0005_run_store.sql:276-277 reads
--         with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'))
--     — deliberately unlike the read policy three lines above it, which DOES
--     call cw.owns_agreement. So any requester may record a run against any
--     deal in the system, including one they cannot read back afterwards.
--
-- (b) cw.run_decision and cw.run_finding have the SAME hole, one table over.
--     0005_run_store.sql:281-286: both INSERT policies check role only. Without
--     closing this, closing (a) achieves nothing — a requester refused a run row
--     on somebody else's deal can still append decisions and findings to that
--     run, permanently, into tables with no UPDATE and no DELETE grant.
--
-- (c) cw.run_summary and cw.run_contract answer with EVERY run to anyone
--     granted them. 0005:231-248 defines both with no scoping expression of
--     their own; 0005:296-298 grants them to the requester and both Legal
--     roles. A view runs with its OWNER'S rights, and row-level security on
--     cw.run is ENABLED, not FORCED — so cw.run's read policy is never
--     consulted through either view.
--
--     This repository has paid for that exact shape three times already, and
--     0017_reading_room.sql:160-186 wrote down why. NOT security_invoker:
--     0017:175-185 and 0019:46 already record, in this repository's own words,
--     why that is the wrong tool for a view joining tables the caller may not
--     hold select on.
--
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Additive by replacement; no data is destroyed and no row shape changes. A
-- single follow-on migration restores all five objects exactly, from the text
-- quoted verbatim at the foot of this file.

begin;

-- ── Rule (a) · a run belongs to a deal you own ──────────────────────────────
--
-- DROP and CREATE by name rather than ALTER POLICY, so the rollback is
-- symmetrical and the prior text is quotable verbatim.
--
-- TWO BRANCHES, NOT ONE CONDITION, and this is the house shape (0005:271-275,
-- 0006_executed_agreements.sql:276-279). cw.owns_agreement resolves to
-- `a.requester = cw.app_actor()` (0003_ladders_and_concessions.sql:626-631),
-- so a single-condition form would lock out legal_reviewer and legal_admin,
-- who never appear in cw.agreement.requester and are precisely the people who
-- run assemblies on deals they do not own.

drop policy write_scoped on cw.run;
create policy write_scoped on cw.run for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester'
        and agreement_id is not null
        and cw.owns_agreement(agreement_id)));

comment on table cw.run is
  'An assembly run. Since 0025 a requester may only record one against a deal '
  'they own — the settled decision of 2026-07-27 that every run belongs to a '
  'deal, enforced where every other row rule in this system is enforced. Legal '
  'may record against any deal, by the same two-branch shape used everywhere '
  'else, because Legal never appears in cw.agreement.requester.';

-- ── Rule (b) · decisions and findings belong to a run you could record ──────
--
-- The subquery is evaluated UNDER row-level security, so `exists (select 1
-- from cw.run …)` means "a run this caller can see" — which is exactly the
-- read policy sitting above each of these, and exactly the set rule (a) now
-- controls. Without this pair, rule (a) is bypassable one table over.

drop policy write_scoped on cw.run_decision;
create policy write_scoped on cw.run_decision for insert
  with check (exists (select 1 from cw.run r where r.run_id = run_decision.run_id));

drop policy write_scoped on cw.run_finding;
create policy write_scoped on cw.run_finding for insert
  with check (exists (select 1 from cw.run r where r.run_id = run_finding.run_id));

-- ── Rule (c) · the two run views consult who is asking ──────────────────────
--
-- The same words as cw.run's own read policy (0005:271-275), stated in the
-- view, in the style of cw.run_drift (0022:196-200), cw.override_passes
-- (0019:95-105) and cw.reading_room. The existing select lists are preserved
-- exactly, so CREATE OR REPLACE is sufficient and no consumer's columns move.
--
-- 'administrator' IS DELIBERATELY ABSENT FROM BOTH WHERE CLAUSES, and it is
-- absent because it could never be reached: cw_administrator holds no select
-- grant on either view. 0005:293-296 grants them to cw_auditor and 0005:297 to
-- cw_requester, cw_legal_reviewer and cw_legal_admin, and nothing in 0001-0024
-- adds this role. An 'administrator' branch here would be reassuring text that
-- can never execute — which is the precise thing
-- backend/db/test/views-are-not-policies.test.mjs exists to prevent, written
-- into a brand new migration.
--
-- THE GAP IS REAL AND IS NOT CLOSED HERE. 0013_administrator.sql:321 gives the
-- administrator an explicit read policy on cw.run and 0013:296 a select grant
-- on all three base tables, so that role can read every run's rows and neither
-- run view. Closing it is one line — `grant select on cw.run_summary,
-- cw.run_contract to cw_administrator` — and it is deliberately not taken,
-- for the reason 0018_library_and_ladder_views.sql:170-190 already gave about
-- this same role: the administrator's read boundary is an owner decision about
-- the boundary of a role, and settling it inside a scoping migration would put
-- a new control in the one place nobody would look for it.

create or replace view cw.run_summary as
select r.run_id, r.vendor, r.agreement_id, r.manifest_source,
       r.snapshot_id, r.ruleset_id, r.result_hash, r.engine_version,
       r.gate_open, r.overridden, r.created_by, r.created_at,
       (select count(*) from cw.run_decision d where d.run_id = r.run_id)                    as decisions,
       (select count(*) from cw.run_decision d where d.run_id = r.run_id and d.clause_id is null) as unresolved,
       (select count(*) from cw.run_finding f where f.run_id = r.run_id)                     as findings,
       (select count(*) from cw.run_finding f where f.run_id = r.run_id and f.severity = 'High') as blocking
from cw.run r
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or (cw.app_role() = 'requester'
       and (r.created_by = cw.app_actor()
            or (r.agreement_id is not null and cw.owns_agreement(r.agreement_id))));

-- The join to cw.run is REQUIRED, not decorative: this view selects from
-- cw.run_decision, which carries no agreement of its own, so there would
-- otherwise be nothing to scope against.
create or replace view cw.run_contract as
select d.run_id, d.seq, c.label as category, d.severity, d.reason, d.baseline,
       d.clause_id, d.version,
       v.title, v.body, d.warning, d.suppressed
from cw.run_decision d
join cw.run r on r.run_id = d.run_id
join cw.category c on c.key = d.category_key
left join cw.clause_version v on v.clause_id = d.clause_id and v.version = d.version
where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
   or (cw.app_role() = 'requester'
       and (r.created_by = cw.app_actor()
            or (r.agreement_id is not null and cw.owns_agreement(r.agreement_id))))
order by d.run_id, d.seq;

comment on view cw.run_summary is
  'One line per assembly run. Scoped in its own WHERE clause since 0025, in '
  'the same words as cw.run''s read policy — a view does not inherit the '
  'policy on the table underneath it, and this one answered with every run to '
  'anybody granted it.';

comment on view cw.run_contract is
  'What a run actually issued, resolvable forever. Scoped in its own WHERE '
  'clause since 0025 via its join to cw.run, for the same reason as '
  'cw.run_summary.';

commit;

-- ── THE PRIOR TEXT, VERBATIM, FOR A REVERTING MIGRATION ─────────────────────
--
--   create policy write_scoped on cw.run for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create policy write_scoped on cw.run_decision for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create policy write_scoped on cw.run_finding for insert
--     with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
--
--   create or replace view cw.run_contract as
--   select d.run_id, d.seq, c.label as category, d.severity, d.reason, d.baseline,
--          d.clause_id, d.version,
--          v.title, v.body, d.warning, d.suppressed
--   from cw.run_decision d
--   join cw.category c on c.key = d.category_key
--   left join cw.clause_version v on v.clause_id = d.clause_id and v.version = d.version
--   order by d.run_id, d.seq;
--
--   create or replace view cw.run_summary as  -- 0005:240-248, without the WHERE
--   select r.run_id, r.vendor, r.agreement_id, r.manifest_source, ... from cw.run r;
--
-- Reverting the views without reverting the policies additionally requires the
-- three run reads in backend/doorway/reads.py to be re-pointed at the base
-- tables cw.run, cw.run_decision and cw.run_finding, which carry their own
-- policies. That dependency is recorded in reads.py beside the entries.
