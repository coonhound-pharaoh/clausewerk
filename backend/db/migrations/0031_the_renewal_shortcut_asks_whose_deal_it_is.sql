-- 0031 · The renewal shortcut asks whose deal it is
--
-- ── THE NUMBER THIS FILE CLAIMED, AND HOW ────────────────────────────────────
-- 0031, verified by listing backend/db/migrations/ on disk at the moment this
-- package began, and listed again immediately before this file was written in
-- case anything landed in between. Both listings ended at
-- 0030_an_ai_judgment_gets_its_own_record.sql, so 0031 is the next free
-- number. It was not taken from any planning document.
--
-- The bootstrap applies migrations in filename order and has no gate against a
-- duplicate number: two files sharing one would not announce itself, it would
-- surface later as a migration that silently did not run.
--
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
--
-- 0027 gave the negotiation record its ownership rules: a requester may write
-- against their own deal and no other. 0027's own header names, at lines
-- 79-87, the one door those rules cannot reach, and hands it to this package:
--
--     cw.open_renewal is SECURITY DEFINER (0011:226-300) for a stated and good
--     reason — it seeds a renewal's opening positions from the PRIOR
--     agreement's executed decisions and from the current library, neither of
--     which the caller may be allowed to read. Running as its definer, it
--     INSERTs into cw.negotiation and cw.negotiation_position directly, and
--     0027's policies are never consulted. Execute on it is granted to
--     cw_requester and both Legal roles (0011:402-403).
--
-- So until this file, any requester holding that grant could open a renewal on
-- any deal in the system, seeded from any executed agreement, into two tables
-- whose triggers make an UPDATE and a DELETE raise. The rule 0027 wrote was
-- true through the front door and false through this one.
--
-- The fix is the smallest one that closes it: the same two-branch test 0027
-- installs, asked INSIDE the function, before anything is written.
--
--   · Legal roles unconditional. cw_legal_reviewer and cw_legal_admin see
--     every deal everywhere else in this schema, and a renewal is not the
--     place to start making them special.
--   · A requester only where cw.owns_agreement (0003:626-631) says the deal is
--     theirs — the identical expression 0027's four insert policies use, asked
--     of the agreement the renewal is being opened ON, which is the column
--     those policies scope.
--
-- NOT CHANGED, and deliberately so: who may execute the function, and the
-- SECURITY DEFINER property itself. Both are the owner's to decide. This file
-- only stops the function doing something the owner has already decided it
-- should not.
--
-- U1 IS NOT TOUCHED. 0012 records U1 as settled by the owner on 2026-07-26: a
-- renewal opens from the positions actually in force in the executed
-- agreement, with the drift report alongside, and library standard stays
-- reachable as an explicit recorded choice. This file changes WHO may open a
-- renewal. It changes nothing about WHAT a renewal opens from — everything
-- from `chosen :=` onward is the 0011 text, character for character.
--
--
-- ── ASKING WHO CALLED, INSIDE A SECURITY DEFINER FUNCTION ───────────────────
--
-- cw.app_role() reads current_user, and 0001:54 records why: `set role` is
-- what binds. That is correct everywhere EXCEPT here. Inside a SECURITY
-- DEFINER function PostgreSQL swaps current_user for the function's OWNER for
-- the duration of the call, so cw.app_role() inside this function answers
-- about the definer and not about the caller — it returns null, and a branch
-- comparing null to a role name is null, which is neither true nor false.
-- 0023:145-152 paid for exactly this in the redaction path, where a guard
-- built that way never raised and a reviewer redacted a record on the suite's
-- first run.
--
-- So the caller is identified from the two things SECURITY DEFINER does NOT
-- rewrite, in the order that matches how the two real callers connect:
--
--   · current_setting('role') — the role set by SET ROLE / SET LOCAL ROLE.
--     backend/doorway/db.py:29 uses `set local role` for every governed act,
--     and the test helper backend/db/test/roles.mjs uses `set role`. Entering
--     a definer function leaves this setting alone. It reads 'none' when
--     nobody has set it.
--   · session_user — the role the connection logged in as, for a deployment
--     that connects as the application role directly rather than assuming it.
--
-- cw.owns_agreement needs no such care: it is itself SECURITY DEFINER and
-- keyed on cw.app_actor(), a session setting, which the definer context does
-- not disturb.
--
-- A CONSEQUENCE WORTH STATING OUT LOUD: the database owner holds no
-- application role, so the owner can no longer call this function. That is the
-- same answer settled decision U3 already gives everywhere else — the owner's
-- connection has no role, so the scoped views return nothing to it either. The
-- test suite opens every renewal through a real role for that reason.
--
--
-- ── THE REFUSAL ─────────────────────────────────────────────────────────────
--
-- Raised in the database, in a plain sentence, with errcode
-- 'insufficient_privilege' (42501). That is the code
-- backend/doorway/refusals.py:88-89 turns into kind "not_permitted" and HTTP
-- 403 when this eventually crosses an endpoint — a refusal about WHO asked,
-- not about the merits of what they asked for. Any other code would report
-- this to a caller as though the renewal itself were the problem.
--
-- SEARCHED FOR OTHER CALLERS, per the package's first task. cw.open_renewal is
-- called from exactly two places outside its own definition:
-- backend/db/test/negotiation.test.mjs (four calls, all as cw_legal_reviewer,
-- all unaffected) and backend/doorway/writes.py:504, which is a role-bearing
-- endpoint and keeps its shape. No migration calls it. Recorded as a finding
-- rather than absorbed as scope: no other SECURITY DEFINER function in this
-- schema INSERTs into a policy-protected table on a caller-named subject —
-- cw.redact_agreement and cw.purge_agreement (0023) both already ask the data
-- who the actor is.

-- ── Opening a renewal ───────────────────────────────────────────────────────
-- BOTH U1 options, in one function, with the choice recorded. The default comes
-- from cw.governance_setting, which is marked an undecided owner decision — so
-- the pre-selection is visible and changing it settles nothing by accident.
create or replace function cw.open_renewal(
  p_agreement_id       text,
  p_renews_agreement_id text,
  p_actor              text,
  p_baseline           text default null,   -- null ⇒ the recorded default
  p_paper              text default 'ours',
  p_note               text default null
) returns bigint
language plpgsql
-- SECURITY DEFINER: seeding reads the PRIOR agreement's executed decisions and
-- the current library. Under the caller's row-level security a requester opening
-- their own renewal may not see either, and a baseline seeded from what the
-- caller happened to be allowed to read is not a baseline.
security definer set search_path = cw, pg_temp as $$
declare nid bigint; chosen text; prior_run text; n int; caller_role text;
begin
  -- ── The ownership check 0027's policies cannot reach (NC-03) ──────────────
  -- The first statement in the function, so nothing is read and nothing is
  -- written before it is known that the caller may. Two branches, the same two
  -- 0027 installs on the tables this function writes behind.
  caller_role := coalesce(nullif(current_setting('role', true), 'none'),
                          session_user);

  if not (caller_role in ('cw_legal_reviewer', 'cw_legal_admin')
          or (caller_role = 'cw_requester'
              and cw.owns_agreement(p_agreement_id))) then
    raise exception
      'a renewal may only be opened on your own deal, and % is not yours',
      p_agreement_id using errcode = 'insufficient_privilege';
  end if;

  chosen := coalesce(p_baseline, cw.setting('renewal_default_baseline'));
  if chosen not in ('executed_agreement','library_standard') then
    raise exception 'unknown renewal baseline: %', chosen using errcode = 'check_violation';
  end if;

  insert into cw.negotiation (agreement_id, paper, opened_by, baseline,
                              renews_agreement_id, baseline_chosen_by, baseline_note)
  values (p_agreement_id, p_paper, p_actor, chosen,
          p_renews_agreement_id, p_actor, p_note)
  returning negotiation_id into nid;

  select e.run_id into prior_run
  from cw.executed_agreement e where e.agreement_id = p_renews_agreement_id;
  if prior_run is null then
    raise exception
      'agreement % has no executed run to renew from', p_renews_agreement_id
      using errcode = 'no_data_found';
  end if;

  if chosen = 'executed_agreement' then
    -- Option A. Open from the positions actually in force, concessions
    -- included. The counterparty opens their copy of what they signed; so do we.
    insert into cw.negotiation_position
      (negotiation_id, category_key, our_clause_id, our_version, round_raised, opened_from)
    select nid, d.category_key, d.clause_id, d.version, 0, 'executed_agreement'
    from cw.run_decision d
    where d.run_id = prior_run and d.clause_id is not null;
  else
    -- Option B. Open from current library standard: the ladder's preferred rung
    -- where one is published, otherwise the newest selectable version. Every
    -- carried concession is then re-fought, which is the cost of this option.
    insert into cw.negotiation_position
      (negotiation_id, category_key, our_clause_id, our_version, round_raised, opened_from)
    select nid, d.category_key,
           coalesce(lad.clause_id, sel.clause_id),
           coalesce(lad.version,   sel.version),
           0, 'library_standard'
    from (select distinct category_key, severity from cw.run_decision
          where run_id = prior_run and clause_id is not null) d
    left join lateral (
      select rr.clause_id, rr.version
      from cw.ladder l join cw.ladder_rung rr using (ladder_id)
      where l.category_key = d.category_key and l.severity = d.severity
        and rr.rung = 0
      order by l.ladder_id limit 1) lad on true
    left join lateral (
      select c.clause_id, c.version from cw.selectable_clause c
      where c.category_key = d.category_key and c.severity = d.severity
      order by c.version desc, c.clause_id limit 1) sel on true
    where coalesce(lad.clause_id, sel.clause_id) is not null;
  end if;

  get diagnostics n = row_count;
  perform cw.audit('renewal_opened', p_agreement_id, jsonb_build_object(
    'negotiation_id', nid, 'renews', p_renews_agreement_id,
    'baseline', chosen, 'positions_seeded', n,
    'default_was', cw.setting('renewal_default_baseline')));
  return nid;
end $$;

comment on function cw.open_renewal(text, text, text, text, text, text) is
  'Opens a renewal negotiation and seeds its opening positions. Still SECURITY '
  'DEFINER, because the seeding reads records the caller may not hold; since '
  '0031 it first asks whose deal it is — Legal unconditionally, a requester '
  'only on a deal cw.owns_agreement says is theirs.';

-- The grants are unchanged and are not restated here. Who may ASK is the
-- owner's decision and 0011:402-403 still holds it; what the function does
-- once asked is what this file narrowed.


-- ── THE PRIOR TEXT, VERBATIM, FOR A REVERTING MIGRATION ─────────────────────
--
-- 0011_negotiation_record.sql:226-300 as it stood before this file. A revert is
-- one follow-on migration replaying the block below; no data is touched either
-- way, and no other object in the schema depends on this change.
--
-- Reverting it reopens the door described at the top: a requester with the
-- execute grant may again open a renewal on any deal in the system, and 0027's
-- four insert policies will not see it happen.
--
--   create or replace function cw.open_renewal(
--     p_agreement_id       text,
--     p_renews_agreement_id text,
--     p_actor              text,
--     p_baseline           text default null,   -- null ⇒ the recorded default
--     p_paper              text default 'ours',
--     p_note               text default null
--   ) returns bigint
--   language plpgsql
--   -- SECURITY DEFINER: seeding reads the PRIOR agreement's executed decisions and
--   -- the current library. Under the caller's row-level security a requester opening
--   -- their own renewal may not see either, and a baseline seeded from what the
--   -- caller happened to be allowed to read is not a baseline.
--   security definer set search_path = cw, pg_temp as $$
--   declare nid bigint; chosen text; prior_run text; n int;
--   begin
--     chosen := coalesce(p_baseline, cw.setting('renewal_default_baseline'));
--     if chosen not in ('executed_agreement','library_standard') then
--       raise exception 'unknown renewal baseline: %', chosen using errcode = 'check_violation';
--     end if;
--
--     insert into cw.negotiation (agreement_id, paper, opened_by, baseline,
--                                 renews_agreement_id, baseline_chosen_by, baseline_note)
--     values (p_agreement_id, p_paper, p_actor, chosen,
--             p_renews_agreement_id, p_actor, p_note)
--     returning negotiation_id into nid;
--
--     select e.run_id into prior_run
--     from cw.executed_agreement e where e.agreement_id = p_renews_agreement_id;
--     if prior_run is null then
--       raise exception
--         'agreement % has no executed run to renew from', p_renews_agreement_id
--         using errcode = 'no_data_found';
--     end if;
--
--     if chosen = 'executed_agreement' then
--       -- Option A. Open from the positions actually in force, concessions
--       -- included. The counterparty opens their copy of what they signed; so do we.
--       insert into cw.negotiation_position
--         (negotiation_id, category_key, our_clause_id, our_version, round_raised, opened_from)
--       select nid, d.category_key, d.clause_id, d.version, 0, 'executed_agreement'
--       from cw.run_decision d
--       where d.run_id = prior_run and d.clause_id is not null;
--     else
--       -- Option B. Open from current library standard: the ladder's preferred rung
--       -- where one is published, otherwise the newest selectable version. Every
--       -- carried concession is then re-fought, which is the cost of this option.
--       insert into cw.negotiation_position
--         (negotiation_id, category_key, our_clause_id, our_version, round_raised, opened_from)
--       select nid, d.category_key,
--              coalesce(lad.clause_id, sel.clause_id),
--              coalesce(lad.version,   sel.version),
--              0, 'library_standard'
--       from (select distinct category_key, severity from cw.run_decision
--             where run_id = prior_run and clause_id is not null) d
--       left join lateral (
--         select rr.clause_id, rr.version
--         from cw.ladder l join cw.ladder_rung rr using (ladder_id)
--         where l.category_key = d.category_key and l.severity = d.severity
--           and rr.rung = 0
--         order by l.ladder_id limit 1) lad on true
--       left join lateral (
--         select c.clause_id, c.version from cw.selectable_clause c
--         where c.category_key = d.category_key and c.severity = d.severity
--         order by c.version desc, c.clause_id limit 1) sel on true
--       where coalesce(lad.clause_id, sel.clause_id) is not null;
--     end if;
--
--     get diagnostics n = row_count;
--     perform cw.audit('renewal_opened', p_agreement_id, jsonb_build_object(
--       'negotiation_id', nid, 'renews', p_renews_agreement_id,
--       'baseline', chosen, 'positions_seeded', n,
--       'default_was', cw.setting('renewal_default_baseline')));
--     return nid;
--   end $$;
