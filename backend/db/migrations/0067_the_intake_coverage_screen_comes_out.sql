-- 0067 · The intake question-set coverage screen comes out (reverses 0063)
--
-- WHY, AND IT IS NOT A TIDY-UP. 0063 derived three views over the `unmatched`
-- field the deterministic intake records; GET /intake/coverage read two of
-- them; and the administrator's health screen showed the result as "questions
-- whose answers matched nothing". It shipped on 2026-08-05 and it was wrong on
-- the morning it shipped, in two ways — the second of them fatal.
--
--   1. IT COUNTED CONTEXT QUESTIONS AS GAPS. Four of the six probes in
--      intake_walk.json carry no category at all. They ask what is being
--      bought, from whom, for how much, and for how long — they exist to give
--      the manifest its context, and they can never match a term list because
--      there is no term list for them to match. The screen reported them as
--      holes in the word lists Legal maintains. The one "gap" the demo ever
--      produced was the question asking the requester to describe what they
--      are buying: a false alarm, and the only reading anybody got from this
--      surface before it came out.
--
--   2. NARROWING IT WOULD NOT HAVE SAVED IT. Restricted to the two probes that
--      do carry a category, the number still cannot tell apart the only two
--      facts worth telling apart: "our word lists missed something" and "there
--      was genuinely no risk to find". A requester who correctly answers that
--      no personal data is involved produces exactly the same silence as a
--      requester who describes a serious exposure in words we do not
--      recognise. A measure that cannot distinguish success from blindness is
--      not a weak measure; it is not a measure.
--
-- AND THE GROUND MOVED UNDER IT THE SAME DAY. 0066 (AI-3) landed in the same
-- commit: a model now proposes the manifest and the keyword classifier is the
-- fallback for when the model cannot answer. Judging the word lists was worth
-- materially less by the end of the day the screen was built than it was at the
-- start of it.
--
-- THE OWNER'S DECISION (Mike, 2026-08-05): remove it rather than narrow it — a
-- weak number on a screen is worse than no number. An administrator who reads a
-- figure they cannot act on learns to skip that panel, and the panels beside it
-- on that screen are ones they must not learn to skip.
--
-- WHAT DOES NOT CHANGE. Nothing about the intake itself. The classifier still
-- records `unmatched` on the chain, still returns it to the requester in the
-- moment, and every classification that has ever run is still in the record.
-- This migration removes the COUNTING SURFACE, not the material underneath it:
-- if a better question is ever asked of that material, it is all still there to
-- ask it of.

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · The subject kind loses its surface, so the kind goes too
-- ══════════════════════════════════════════════════════════════════════════
-- 0064 gave the administrator one act — raise a notice — and every notice
-- cites a subject the raiser can already see. `intake_probe` was one of four
-- subject kinds, and the ONLY surface it could ever be raised from was the
-- screen this migration removes.
--
-- WHY THE KIND IS REMOVED RATHER THAN REPOINTED AT SOMETHING ELSE. The
-- alternative was to keep the vocabulary word and find it a new subject. There
-- is nothing honest to point it at: the thing it named was "a question that
-- classified nothing", and the whole finding of the review above is that this
-- is not an observation anybody can act on. A kind kept alive against a future
-- surface is a kind whose visibility rule nobody re-reads, and 0064's own
-- header says why that is dangerous — a kind with no rule is a notice citing
-- something nobody checked the raiser could see.
--
-- THE NOTICE RECORD ITSELF IS UNTOUCHED AND MUST STAY THAT WAY. It is a
-- separate, working feature. The other three kinds all still have live
-- surfaces the administrator reads: `notification_gap` and `health_tile` on
-- the health screen, `account` on the people screen. Only the fourth loses its
-- one surface, and only the fourth is removed.

-- ── The visibility rule, minus the branch that reads a view about to go ─────
-- REPLACED FIRST, DELIBERATELY. A function body is not a dependency Postgres
-- tracks, so dropping the view without this would leave a function that parses
-- fine and throws at run time — and it is the function EVERY notice insert
-- passes through, so the working kinds would break too. 0064's body is carried
-- across unchanged apart from the removed branch.
create or replace function cw.notice_subject_visible(
  p_kind text, p_ref text
) returns boolean
language plpgsql stable security invoker as $$
begin
  -- Each branch reads the SURFACE the raiser observed it on, not the table
  -- underneath it. That is deliberate: the claim being checked is "you saw
  -- this", and what they saw is the view their screen reads.
  if p_kind = 'notification_gap' then
    return exists (select 1 from cw.notification_gap g where g.person = p_ref);
  elsif p_kind = 'health_tile' then
    return exists (select 1 from cw.health_summary h where h.tile = p_ref);
  elsif p_kind = 'account' then
    return exists (select 1 from cw.account a where a.person = p_ref);
  end if;
  -- An unknown kind is not visible. The check constraint on the column should
  -- have caught it first; this is the second answer, and it is "no".
  -- `intake_probe` reaches this line now, and the answer it gets is the right
  -- one: there is no surface it could have been observed on.
  return false;
end $$;

-- ── The route it travelled ─────────────────────────────────────────────────
-- Rule 4 of 0064: who may notify whom is a table, so withdrawing a permission
-- is a deleted row rather than a released code change. The other four seeded
-- pairs stand.
delete from cw.notice_route
 where raiser_role  = 'administrator'
   and to_role      = 'legal_admin'
   and subject_kind = 'intake_probe';

-- ── The vocabulary ─────────────────────────────────────────────────────────
-- NOT VALID, AND THE REASON MATTERS MORE THAN THE KEYWORD. cw.notice is
-- append-only: a raised notice takes no update and no delete, by a trigger that
-- exists precisely so nobody can quietly revise what was once raised. A
-- validated constraint would demand this migration first rewrite or destroy any
-- intake_probe notice already in the record — which is the one thing this
-- record is built to refuse. So the constraint governs everything raised from
-- here on, and anything raised before stands as it was raised. That is the same
-- bargain every append-only record in this system makes with a changed rule.
alter table cw.notice drop constraint notice_subject_kind_check;
alter table cw.notice add constraint notice_subject_kind_check
  check (subject_kind in (
    'notification_gap',  -- somebody being waited on whom no channel reaches
    'health_tile',       -- a check failing, or never run
    'account'))          -- an account or its grant
  not valid;

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · The three views
-- ══════════════════════════════════════════════════════════════════════════
-- Dropped innermost-last. The grants go with them automatically — a dropped
-- object cannot be granted on, and leaving a grant behind for a view somebody
-- might re-create is how a permission outlives the review that approved it.
drop view if exists cw.intake_coverage_summary;
drop view if exists cw.intake_question_coverage;
drop view if exists cw.intake_classification;
