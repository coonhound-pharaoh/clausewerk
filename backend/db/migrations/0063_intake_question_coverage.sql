-- 0063 · Does the intake question set actually work?
--
-- WHY THIS EXISTS. The deterministic intake (AI-1) classifies a requester's
-- plain answers against term lists that Legal curates in `intake_walk.json`.
-- An answer that matches no list comes back in `unmatched` deliberately —
-- intake.py's own words: "a silently dropped answer would make a coverage gap
-- invisible". But it came back to ONE SCREEN, in the moment, to the one person
-- least able to act on it: the requester who just wrote it. Nobody was
-- counting, so nobody could answer "are our questions any good?"
--
-- Every classification already appends to the chain with the counts on it, so
-- the answer was always in the record and never derived. These two views
-- derive it. NOTHING IS STORED: a stored coverage figure is a number that
-- starts being wrong the moment the next intake runs, and this repository has
-- retired that shape twice already.
--
-- WHO SEES IT — OWNER DECISION NI-5, 2026-08-05. Mike: "This sounds like an
-- admin issue not something legal needs to see." So the grant is the
-- administrator's, beside the other health surfaces. The auditor is granted
-- too, on the standing basis that they read the whole record and this is a
-- cut of it, not a new fact.
--
-- LEGAL IS DELIBERATELY NOT GRANTED, and that is worth stating plainly because
-- it will look like an oversight to whoever reads this next: Legal EDITS the
-- question set and does not see the figure that judges it. The gap reaches
-- them through the administrator raising it (0064). If that proves slow in
-- practice, the fix is a grant on this view and a section on a Legal screen —
-- one line and one panel, because the derivation is already shared.

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · One row per classification
-- ══════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER (the default), which is the whole design: this view has no
-- rules of its own and inherits cw.audit_event's. A requester reading it would
-- see their own intakes and nobody else's, exactly as they see their own chain
-- rows — so the view cannot become a way around a policy, whoever it is later
-- granted to.
--
-- The payload keys are intake.py's. They are read defensively — a payload
-- missing a key answers null rather than failing the whole view — because the
-- chain is append-only: a row written by an older shape of that code can never
-- be corrected, and a view that throws on one historical row would take the
-- whole surface down rather than showing the rest.
create or replace view cw.intake_classification as
select
  e.seq,
  e.ts,
  e.actor,
  e.subject                                        as vendor,
  nullif(e.payload->>'answers', '')::int           as answers,
  case when jsonb_typeof(e.payload->'risks_proposed') = 'array'
       then jsonb_array_length(e.payload->'risks_proposed') end
                                                   as risks_proposed,
  case when jsonb_typeof(e.payload->'unmatched') = 'array'
       then jsonb_array_length(e.payload->'unmatched') end
                                                   as unmatched,
  case when jsonb_typeof(e.payload->'unmatched') = 'array'
       then e.payload->'unmatched' else '[]'::jsonb end
                                                   as unmatched_probes
from cw.audit_event e
where e.event_type = 'intake_classified';

comment on view cw.intake_classification is
  'One row per recorded intake classification, derived from the chain. The
   counts are the classifier''s own, written at the moment it ran — never
   recomputed against today''s term lists, which would make a historical
   figure change when Legal edits a word.';

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · Which questions are classifying nothing
-- ══════════════════════════════════════════════════════════════════════════
-- The surface the administrator reads. One row per PROBE that has ever come
-- back unmatched, with how often and how recently.
--
-- A probe that always matches something never appears here, and that is
-- correct: this is a list of gaps, not a census of questions. The screen says
-- so, because "no rows" on a gap report means "no gaps", and that is the one
-- reading an empty table must never be ambiguous about.
create or replace view cw.intake_question_coverage as
select
  probe.id                              as probe,
  count(*)                              as times_unmatched,
  min(c.ts)                             as first_unmatched,
  max(c.ts)                             as last_unmatched,
  count(distinct c.actor)               as people_affected
from cw.intake_classification c
cross join lateral jsonb_array_elements_text(c.unmatched_probes) as probe(id)
group by probe.id;

comment on view cw.intake_question_coverage is
  'Intake questions whose answers matched no term list, counted. A gap here
   belongs to whoever curates intake_walk.json — the system''s job ends at
   making it visible (the product boundary, CLAUDE.md).';

-- ══════════════════════════════════════════════════════════════════════════
-- 3 · The one-line answer
-- ══════════════════════════════════════════════════════════════════════════
-- Exactly one row, always — including on an empty system, where every figure
-- is zero and `unmatched_share` is NULL rather than 0.
--
-- THAT NULL IS THE POINT. Zero per cent unmatched means "every answer
-- classified", which is excellent news. No intakes at all means nobody has
-- asked yet. Rendering the second as the first would tell an administrator the
-- question set is working perfectly on the day it was installed.
create or replace view cw.intake_coverage_summary as
select
  count(*)                                            as classifications,
  coalesce(sum(c.answers), 0)                         as answers,
  coalesce(sum(c.unmatched), 0)                       as unmatched,
  coalesce(sum(c.risks_proposed), 0)                  as risks_proposed,
  count(*) filter (where c.unmatched > 0)             as with_a_gap,
  case when coalesce(sum(c.answers), 0) > 0
       then round(100.0 * sum(c.unmatched) / sum(c.answers), 1) end
                                                      as unmatched_share,
  max(c.ts)                                           as last_classified
from cw.intake_classification c;

comment on view cw.intake_coverage_summary is
  'One row, always. unmatched_share is NULL when nothing has been classified —
   "no answers yet" and "every answer classified" are opposite facts and this
   view refuses to render the first as the second.';

-- ── Who may read them ───────────────────────────────────────────────────────
revoke all on cw.intake_classification, cw.intake_question_coverage,
               cw.intake_coverage_summary from public;
grant select on cw.intake_classification, cw.intake_question_coverage,
                cw.intake_coverage_summary
  to cw_administrator, cw_auditor;
