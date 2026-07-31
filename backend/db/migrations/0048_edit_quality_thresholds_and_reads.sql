-- 0048 · Customer thresholds for the edit-quality metric, and its read surface (NC-13)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-30: the
-- highest present was 0047_received_documents.sql, so 0048 is the next free
-- number. Nothing here edits an applied migration.
--
-- WHAT THIS IS. NC-11 (0029) put the edit-quality figure on the record:
-- cw.review_ticket.edit_similarity, the database's own arithmetic over the
-- proposed and approved texts, assigned at the moment of approval and never
-- caller-supplied. This migration gives that figure the two things WP-6 asks
-- for and nothing more:
--
--   · A THRESHOLD ROW a customer's Legal admin may fill in — shipped EMPTY,
--     because the system must never choose this number. U4 settled the
--     identical principle for the sibling metric (unedited_approval_threshold,
--     0012:387): measured and shown from day one, the number set by Legal with
--     counsel against real data. This row follows that pattern exactly. It
--     ships decided=false: U4's ruling covered its own key, and stamping the
--     owner's name on a key the owner never saw would put words in the
--     owner's mouth.
--
--   · THREE READ CUTS of the figure — across the library, by category, and
--     per contract — beside cw.review_quality, with its grants mirrored:
--     legal_reviewer, legal_admin, auditor. Nothing for cw_viewer, and
--     nothing for cw_requester: the quality surfaces have been Legal's and
--     the Auditor's since 0008, and a requester asking gets an honest refusal
--     rather than a number computed over other people's tickets.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   · Ship any default threshold, anywhere. The empty value IS the design.
--   · Alarm or block on the threshold. The comparison column below is a
--     figure for a person (and a regulator), never a gate.
--   · Change cw.review_quality or the rate it computes.
--
-- The threshold is read through cw.setting() — the one accessor — and written
-- through the one existing route: cw.governance_setting's update policy,
-- which cw.setting_write_rules() (0013) already splits so an owner-decision
-- row is legal_admin's alone.

-- ── The threshold, shipped empty ────────────────────────────────────────────
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, rationale, purpose)
values
  ('edit_similarity_threshold', '', 'owner_decision', true, false,
   'Shipped EMPTY following the principle U4 settled for the sibling metric '
   '(unedited_approval_threshold): the system measures and shows the '
   'edit-quality figure from day one, and the number that makes a figure '
   'acceptable is Legal''s to set with counsel, against real data. An empty '
   'value means "measured, no threshold" — the views below report the figure '
   'and no alarm state exists. The system must never choose this number. '
   'NOT SETTLED by the owner for this key; U4 is the precedent, not the '
   'ruling.',
   'The retained-language figure below which a verified ticket is counted '
   'against the threshold, once Legal sets one. Empty means no threshold.');

-- ── The threshold, read once ────────────────────────────────────────────────
-- One expression, used by all three views, so the parse of "empty means none"
-- exists in exactly one place. STABLE like cw.setting itself.
create or replace function cw.edit_similarity_threshold() returns numeric
language sql stable as $$
  select nullif(btrim(coalesce(cw.setting('edit_similarity_threshold'), '')), '')::numeric
$$;

comment on function cw.edit_similarity_threshold() is
  'The Legal-set threshold as a number, or NULL when none is set. Empty and
   absent both mean "measured, no threshold" — the U4 shape.';

-- ── The three cuts ──────────────────────────────────────────────────────────
-- All three views compute over verified tickets only: the figure exists only
-- at approval (0029's CHECKs), so pending, rejected and expired tickets have
-- nothing to report. below_threshold is NULL — not zero — when no threshold
-- is set: "no alarm state exists" and "nothing fell below the bar" are
-- different sentences, and a screen must be able to tell them apart.

create or replace view cw.edit_quality as
select
  count(*)                                    as verified,
  count(*) filter (where edited_before_approval) as edited,
  round(avg(edit_similarity), 4)              as mean_retained,
  min(edit_similarity)                        as least_retained,
  cw.edit_similarity_threshold()              as threshold,
  case when cw.edit_similarity_threshold() is null then null
       else count(*) filter (where edit_similarity < cw.edit_similarity_threshold())
  end                                         as below_threshold
from cw.review_ticket
where state = 'verified';

create or replace view cw.edit_quality_by_category as
select
  category_key,
  count(*)                                    as verified,
  count(*) filter (where edited_before_approval) as edited,
  round(avg(edit_similarity), 4)              as mean_retained,
  min(edit_similarity)                        as least_retained,
  cw.edit_similarity_threshold()              as threshold,
  case when cw.edit_similarity_threshold() is null then null
       else count(*) filter (where edit_similarity < cw.edit_similarity_threshold())
  end                                         as below_threshold
from cw.review_ticket
where state = 'verified'
group by category_key;

-- Tickets with no agreement named group under a NULL agreement_id — a visible
-- row, not a dropped one: work done outside any deal is still work done.
create or replace view cw.edit_quality_by_agreement as
select
  agreement_id,
  count(*)                                    as verified,
  count(*) filter (where edited_before_approval) as edited,
  round(avg(edit_similarity), 4)              as mean_retained,
  min(edit_similarity)                        as least_retained,
  cw.edit_similarity_threshold()              as threshold,
  case when cw.edit_similarity_threshold() is null then null
       else count(*) filter (where edit_similarity < cw.edit_similarity_threshold())
  end                                         as below_threshold
from cw.review_ticket
where state = 'verified'
group by agreement_id;

comment on view cw.edit_quality is
  'The retained-language figure across the library. Rows verified before 0029
   carry no figure and average as absent, not as zero. The threshold column is
   Legal''s number or NULL; below_threshold is NULL — never zero — when no
   threshold is set, because "no alarm exists" and "nothing fell below" are
   different sentences.';

comment on view cw.edit_quality_by_category is
  'The same figure, cut by clause category. Same rules as cw.edit_quality.';

comment on view cw.edit_quality_by_agreement is
  'The same figure, cut per contract. A NULL agreement_id row is tickets opened
   outside any deal, kept visible. Same rules as cw.edit_quality. Granted to
   the quality surface''s readers only — a requester holds no grant here, and
   is refused rather than answered a number computed over other people''s
   tickets.';

-- ── Who reads them ──────────────────────────────────────────────────────────
-- Mirrors cw.review_quality (0008:798-802): both Legal roles and the Auditor.
-- Deliberately absent: cw_viewer, cw_requester, cw_administrator — the same
-- absences the sibling view has carried since 0008 and 0013.
grant select on cw.edit_quality, cw.edit_quality_by_category,
                cw.edit_quality_by_agreement
  to cw_legal_reviewer, cw_legal_admin, cw_auditor;

revoke all on function cw.edit_similarity_threshold() from public;
grant execute on function cw.edit_similarity_threshold()
  to cw_legal_reviewer, cw_legal_admin, cw_auditor;
