-- 0018 · The two consolidation views the Legal admin's workspace reads (WP-U13).
--
-- WHAT THESE ARE, AND WHAT THEY ARE DELIBERATELY NOT
-- Handoff 07 §4 records that most of WP-U13's database half already exists —
-- cw.clause_version_state, cw.selectable_clause, cw.coverage_gap, cw.ladder_health,
-- cw.ladder_rung_state, cw.concession_rate, cw.library_proposal and the rest. What
-- was missing was CONSOLIDATION: the library screen wants clause, version, state,
-- expiry and rationale in one place, and the ladders screen wants rungs in order
-- with the floor marked and the ladder's health beside them.
--
-- So these are convenience joins over views that already exist. THEY ARE NOT NEW
-- CONTROLS, and that constraint decided every question below — most importantly
-- the grants, which copy the existing surface exactly rather than widening it by
-- one role. A consolidation view that quietly becomes the only way somebody can
-- read something is not a convenience, it is a new door with a friendly name.
--
-- ON THE TRAP IN 0017, WHICH DOES NOT BITE HERE, AND WHY THAT IS WORTH SAYING
-- A view does not inherit the policies underneath it: it runs with its OWNER's
-- rights, and the owner ran the migrations and bypasses row-level security. In
-- 0017 that was a live hole — the reading room is person-scoped, so an
-- unscoped view handed every share to whoever selected from it.
--
-- Here the underlying policies are:
--
--     create policy read_all on cw.clause        for select using (cw.app_role() is not null);
--     create policy read_all on cw.clause_version for select using (cw.app_role() is not null);
--     create policy read_all on cw.ladder        for select using (cw.app_role() is not null);
--     create policy read_all on cw.ladder_rung   for select using (cw.app_role() is not null);
--
-- There is no per-person scoping to lose. The row set is the same for every role
-- that may read it at all, so bypassing the policy costs nothing — the only thing
-- the policy asserts is "you are somebody", and that is carried by the GRANT
-- instead, which a view does not bypass.
--
-- That is a claim about the schema as it stands today, not a general licence, and
-- it is one refactor away from being false: the day anybody makes clause text
-- person-scoped, these two views become 0017's bug again and the comment above
-- becomes a document promising a control the code does not enforce. So the suite
-- asserts the grant actually gates them rather than trusting this paragraph —
-- see 'a connection holding no application role reads neither view'.

-- ── The library, in one row per version ───────────────────────────────────
-- What the library table renders. cw.clause_version_state already carries state,
-- expiry, provenance and the selectable flag; what it does not carry is the
-- human name of the category, whether the category is uncovered at this severity,
-- and whether this exact version is load-bearing on a ladder.
--
-- The last of those is the one worth having. WP-U13's library lets a Legal admin
-- retire and supersede, and the question you want answered BEFORE retiring
-- something is "is this the floor of a ladder?" — because retiring a floor turns
-- an intact ladder into floor_unusable, and finding that out afterwards means
-- resolution is already refusing to descend it.
create or replace view cw.library_entry as
select
  s.clause_id,
  s.version,
  s.category_key,
  cat.label                                            as category_label,
  cat.short                                            as category_short,
  s.severity,
  s.always_include,
  s.title,
  s.body,
  s.rationale,
  s.citations,
  s.reviewer,
  s.approved_on,
  s.expires_on,
  s.provenance,
  s.origin,
  s.source_ticket_id,
  s.state,
  s.selectable,
  s.expired,
  s.expires_soon,
  s.days_to_expiry,
  s.provenance_gap,
  s.successor_version,
  s.predecessor_disposition,
  s.superseded_reason,
  -- Where this exact version sits in the ladders. Counted rather than joined so
  -- the view stays one row per version: a version on three ladders is still one
  -- library entry, not three.
  (select count(*) from cw.ladder_rung r
    where r.clause_id = s.clause_id and r.version = s.version)      as on_ladders,
  (select coalesce(bool_or(r.is_floor), false) from cw.ladder_rung r
    where r.clause_id = s.clause_id and r.version = s.version)      as is_a_floor,
  -- Whether this clause's category is uncovered at this severity. Surfaced
  -- BESIDE the clause rather than in a second query, because the coverage-gap
  -- banner in WP-U13 sits on the library screen and a screen that has to ask
  -- twice is a screen that will one day ask once.
  --
  -- Always false for a Baseline clause: cw.coverage_gap is defined over
  -- Standard and High only, since a Baseline clause is always included and so
  -- cannot leave a gap behind it. Reported honestly as false rather than null —
  -- "no gap" is the true answer, not "unknown".
  exists (select 1 from cw.coverage_gap g
           where g.category_key = s.category_key and g.severity = s.severity)
                                                                    as category_uncovered
from cw.clause_version_state s
join cw.category cat on cat.key = s.category_key;

comment on view cw.library_entry is
  'One row per clause version: the clause, its version, its state, its expiry '
  'and its rationale in one place, plus whether the version is load-bearing on '
  'a ladder. A convenience join over cw.clause_version_state for WP-U13''s '
  'library screen — it adds no control and widens no grant.';

-- ── The ladders, in one row per rung ──────────────────────────────────────
-- Rungs in order, the floor marked, the ladder's health beside them.
--
-- THE LEFT JOIN IS THE WHOLE POINT AND IS EASY TO WRITE AS AN INNER ONE. An
-- inner join drops any ladder that has no rungs — and 'empty' is a status
-- cw.ladder_health goes to the trouble of reporting, precisely because an empty
-- ladder is a configuration error somebody needs to see. A board that renders
-- every ladder except the broken ones is worse than no board: it reports the
-- problem as absence, which reads identically to health.
--
-- So an empty ladder appears here as exactly one row with a null rung and a
-- status of 'empty', and the suite holds that in place.
create or replace view cw.ladder_board as
select
  l.ladder_id,
  l.category_key,
  cat.label            as category_label,
  l.severity,
  l.owner,
  l.reviewed_on,
  -- The ladder's health, repeated on each of its rungs. Repetition is the right
  -- shape for a table render: the screen draws a rung per line and needs the
  -- ladder's status on the line, not in a second result set it has to zip.
  h.rungs,
  h.unusable_rungs,
  h.has_floor,
  h.status             as ladder_status,
  -- The rung. Null on an empty ladder, which is the row that matters most.
  r.rung,
  r.clause_id,
  r.version,
  r.is_floor,
  r.state              as rung_state,
  r.selectable         as rung_selectable,
  r.expires_on         as rung_expires_on,
  r.days_to_expiry     as rung_days_to_expiry,
  v.title              as rung_title
from cw.ladder l
join cw.category cat on cat.key = l.category_key
join cw.ladder_health h on h.ladder_id = l.ladder_id
left join cw.ladder_rung_state r on r.ladder_id = l.ladder_id
left join cw.clause_version v
  on v.clause_id = r.clause_id and v.version = r.version
-- Ordering here is a convenience for `select * from cw.ladder_board`, not a
-- guarantee: an outer query is free to discard it, and any caller that depends
-- on the order must say so itself. Nulls last puts the empty ladder's single
-- rungless row where a reader expects it rather than ahead of rung 0.
order by l.category_key, l.severity, r.rung nulls last;

comment on view cw.ladder_board is
  'One row per ladder rung, in order, with the floor marked and the ladder''s '
  'health on every line. A ladder with no rungs appears as one row with a null '
  'rung and status ''empty'' — the LEFT JOIN is deliberate, because a board that '
  'silently omits broken ladders reports a problem as absence.';

-- ── Who may read them ─────────────────────────────────────────────────────
-- EXACTLY the roles that already hold select on what these views are built from,
-- and not one more. 0002 granted cw.clause_version_state and 0003 granted
-- cw.ladder_health to the same five roles; these two views are those views with
-- a category label attached, so they are readable by the same five.
--
-- cw_administrator is ABSENT HERE, and that is a deliberate refusal to decide
-- something rather than an oversight — see the note below.
grant select on cw.library_entry, cw.ladder_board
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- ON THE ADMINISTRATOR, AND WHY THIS FILE DOES NOT FIX IT
-- Owner decision U5 settled the Administrator as content-visible and
-- content-powerless, and says in terms never to describe the role as
-- content-blind. Against the clause library it currently IS content-blind:
-- cw_administrator holds no select on cw.clause, cw.clause_version,
-- cw.clause_version_state, cw.ladder or cw.ladder_health — 0002 and 0003 predate
-- the role and were never revisited when 0013 created it. (It does read executed
-- agreements: 0017's read_scoped policies name 'administrator' explicitly.)
--
-- Granting it here would close the gap in the one place nobody would look for it
-- and would make these consolidation views the Administrator's only window onto
-- the library — a new control wearing a convenience view's clothes, which is the
-- thing this file's header promises not to do. The right fix is a grant beside
-- the others in the library's own migration, and it is a decision about the
-- boundary of a role rather than a joined column, so it goes to the owner.
-- Recorded in docs/open-questions.md and surfaced in the handoff.
