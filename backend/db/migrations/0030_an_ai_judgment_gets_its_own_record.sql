-- 0030 · An AI judgment gets its own record (NC-25)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-27: the
-- highest present was 0029 (the draft record gains its four fields), so 0030 is
-- the next free number. The directory was listed again immediately before this
-- file was written and nothing had landed in between. 0008 and 0029 are not
-- edited; migrations are append-only history and this file only adds.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS, IN PLAIN WORDS
-- ════════════════════════════════════════════════════════════════════════════
-- The system already measures how far the approved words are from the words the
-- model wrote. That measurement is arithmetic: it counts words. It says "a
-- person worked on this" and it says nothing about MEANING (owner ruling U14b,
-- written out in full at the top of 0029).
--
-- The owner asked for a second thing beside it: an AI's opinion of how much the
-- MEANING changed (U14c). An opinion is not a measurement, and the two must
-- never be mistaken for one another. So the opinion does not become a column on
-- the frozen ticket or the frozen draft — the four-field ruling D-4 stands
-- untouched. It gets its own record, here, and the record is built so that an
-- opinion always arrives wearing a label that says whose opinion it is, what it
-- was shown, and when.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE THREE RULES THIS TABLE ENFORCES
-- ════════════════════════════════════════════════════════════════════════════
--   1 APPEND-ONLY. A judgment is never rewritten and never removed. Models
--     improve; when a judgment is re-run, a NEW row is appended and the old row
--     stands. The read surface below shows the latest and keeps the history.
--     Same discipline as every other evidence table in this repository.
--
--   2 AN ABSENT JUDGMENT IS A RECORDED FACT, NOT A GAP. When the model cannot
--     be reached, the honest answer is "no judgment", written down as such
--     (ADR-0005). There is no deterministic substitute for an opinion, and a
--     made-up number in the place where an opinion belongs is precisely the
--     failure ADR-0005 exists to prevent. So the row carries an OUTCOME, and
--     'absent' is a first-class outcome with a stated reason.
--
--   3 A SCORE CANNOT ARRIVE WITHOUT ITS PROVENANCE. See the next block.
--
-- ════════════════════════════════════════════════════════════════════════════
-- "IGNORED" OR "REFUSED"? — A DISAGREEMENT IN THE PACKAGE, RULED HERE
-- ════════════════════════════════════════════════════════════════════════════
-- NC-25's scope says the caller never supplies the score; its acceptance
-- criteria say a caller-supplied score is IGNORED. Those are two different
-- enforcements, and the D-4 precedent (edit_similarity) only settles the case
-- where the DATABASE can compute the value itself and overwrite what it was
-- sent. It cannot compute an opinion. Nothing in this schema can.
--
-- Ruled: BOTH, at the layer each belongs to.
--   · The doorway IGNORES it. `advisory.py` never reads a score out of a
--     request body — the score comes from the adapter or the row says 'absent'.
--     That is the D-4 shape, kept.
--   · The database REFUSES a score that is not backed by a model. A score with
--     no model behind it is a number somebody typed, and the constraints below
--     will not store one: an 'absent' row cannot carry a score, and a
--     'recorded' row cannot exist without model, version, prompt and score.
--     There is no shape in which a bare number gets in.
-- The two together mean a caller-supplied score is not merely overwritten; it
-- has nowhere to land.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY NOT HERE
-- ════════════════════════════════════════════════════════════════════════════
-- No threshold, no alarm, no "too different" rule. Governance settings are the
-- owner's and are deliberately unset (U4). This record states a fact and stops.
-- The risk-exposure judgment (U14a/U14d) is NC-26's; the kind is already in the
-- allow-list below so that package adds no column, only rows.

-- ── The record ──────────────────────────────────────────────────────────────
create table cw.advisory_assessment (
  assessment_id  bigserial primary key,

  -- WHAT WAS ASSESSED. The ticket, and the two texts as they stood — copied,
  -- not referenced. A judgment is only re-checkable if the exact words it was
  -- shown are beside it, and the ticket's own columns can legitimately be null
  -- before a decision. The ticket reference says WHICH adjudication this is
  -- about; these two columns say what the model actually read.
  ticket_id      bigint not null references cw.review_ticket(ticket_id),
  draft_id       bigint references cw.clause_draft(draft_id),
  baseline_text  text not null,
  compared_text  text not null,

  -- WHICH JUDGMENT. 'semantic_difference' is NC-25's; 'risk_exposure' is
  -- NC-26's and is listed now so that package appends rows, not columns.
  judgment_kind  text not null
                   check (judgment_kind in ('semantic_difference','risk_exposure')),

  -- WHETHER THERE IS ONE. See rule 2 above.
  outcome        text not null check (outcome in ('recorded','absent')),

  -- The opinion, on the same 0..1 scale the measurement uses so the two can sit
  -- side by side without a reader converting anything in their head. Null when
  -- the outcome is 'absent', and that null MEANS absent — the outcome column is
  -- what says so, so nobody has to interpret a null.
  score          numeric(6,4) check (score >= 0 and score <= 1),

  -- The model's short stated basis. CONTENT: placeholder until Legal reviews
  -- prompts, never tested for its wording, never a defect (CLAUDE.md).
  basis          text,

  -- Why there is no judgment. Present exactly when outcome is 'absent'.
  absent_reason  text,

  -- PROVENANCE, the same shape 0008 put on cw.clause_draft. Empty strings are
  -- refused rather than accepted as "recorded", because a blank model name in a
  -- provenance record is worse than no record: it looks like an answer.
  model          text not null,
  model_version  text not null,
  prompt         text not null,
  --: the rules and source records the model was given.
  inputs         jsonb not null default '[]'::jsonb,

  -- WHO ASKED, and WHEN. Structural, as everywhere else: the actor comes off
  -- the connection and there is nowhere here to put a different name.
  requested_by   text not null default cw.app_actor(),
  created_at     timestamptz not null default now(),

  -- A recorded judgment has a score; an absent one has a reason and no score.
  -- One constraint, both directions, so neither half can drift.
  constraint judgment_is_recorded_or_absent check (
    (outcome = 'recorded' and score is not null and absent_reason is null)
    or
    (outcome = 'absent'   and score is null
     and absent_reason is not null and btrim(absent_reason) <> '')),

  constraint model_not_blank         check (btrim(model) <> ''),
  constraint model_version_not_blank check (btrim(model_version) <> ''),
  constraint prompt_not_blank        check (btrim(prompt) <> ''),
  constraint inputs_is_a_list        check (jsonb_typeof(inputs) = 'array')
);

comment on table cw.advisory_assessment is
  'An AI judgment about a review ticket: an ESTIMATE, never a measurement and
   never a decision. Append-only. A judgment that could not be obtained is
   recorded as absent with a reason, never as a substitute number (ADR-0005).';

comment on column cw.advisory_assessment.score is
  'The estimate, 0..1, on the same scale as the arithmetic measurement so the
   two can be shown side by side. Null when, and only when, no judgment was
   obtained — the outcome column is what says which.';

comment on column cw.advisory_assessment.model is
  'Which model gave this opinion. An opinion without an author is not evidence,
   so this and the version, prompt and inputs are all mandatory — including on
   an absent row, where they record what was ATTEMPTED.';

create index advisory_assessment_by_ticket
  on cw.advisory_assessment (ticket_id, judgment_kind, assessment_id desc);

-- ── Append-only, and it raises ──────────────────────────────────────────────
-- Settled house shape (0011): this RAISES rather than quietly doing nothing.
-- `do instead nothing` would let an application bug that rewrites a judgment
-- look exactly like success.
-- The person who requested a model judgment is observed from the governed
-- session. A DEFAULT only fills an omitted value; without this trigger a caller
-- could permanently attribute an append-only judgment to somebody else.
-- Owner-mode historical imports retain explicit attribution.
create or replace function cw.bind_advisory_requester() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.requested_by := cw.app_actor();
  end if;
  return new;
end $$;

create trigger advisory_assessment_bind_requester
  before insert on cw.advisory_assessment
  for each row execute function cw.bind_advisory_requester();

create or replace function cw.advisory_append_only() returns trigger
language plpgsql as $$
begin
  raise exception
    'an advisory judgment is append-only: it cannot be % once recorded. A model '
    'that has improved is re-run, and the new judgment is appended beside the '
    'old one', case tg_op when 'UPDATE' then 'rewritten' else 'deleted' end
    using errcode = 'restrict_violation';
end $$;

create trigger advisory_assessment_no_edit
  before update or delete on cw.advisory_assessment
  for each row execute function cw.advisory_append_only();

-- TRUNCATE fires no row trigger (0008's finding D9). One statement would
-- otherwise remove every judgment ever recorded.
create trigger advisory_assessment_no_truncate
  before truncate on cw.advisory_assessment
  for each statement execute function cw.no_truncate();

-- ── Every model call is a fact in the chain ─────────────────────────────────
-- NC-25's stated risk: per-call cost is invisible until it isn't. An audit
-- entry per row makes usage countable rather than guessable — and because an
-- absent judgment is also a row, an outage is countable too. No text of the
-- judgment goes into the chain; the chain records that a call happened, to
-- whom, about what, and whether it answered.
create or replace function cw.audit_advisory_assessment() returns trigger
language plpgsql as $$
begin
  perform cw.audit('advisory_judgment', new.ticket_id::text,
    jsonb_build_object(
      'assessment_id', new.assessment_id,
      'judgment_kind', new.judgment_kind,
      'outcome',       new.outcome,
      'model',         new.model,
      'model_version', new.model_version));
  -- actor_kind stays 'human', the default. 0001:107-109 reserves 'controller'
  -- for acts taken WITHOUT a human, and this is not one: a named person asked
  -- for the judgment. Whose opinion it is lives in the payload's model fields,
  -- where it cannot be mistaken for who acted.
  return null;
end $$;

create trigger audit_advisory_assessment
  after insert on cw.advisory_assessment
  for each row execute function cw.audit_advisory_assessment();

-- ── The read surface: a measurement and an estimate, side by side ───────────
-- One row per ticket, carrying BOTH figures and a label for each. The labels
-- are columns rather than something the interface remembers to add, because the
-- one way this feature does harm is a screen showing two numbers and letting a
-- reader assume they are the same kind of thing.
--
-- Latest judgment, full history kept: the lateral picks the newest row per
-- ticket, and judgments_recorded says how many there have been, so a screen can
-- show "estimated again since" without this view growing a second shape.
--
-- THE WHERE CLAUSE IS LOAD-BEARING, and it is the house shape (0017:160-186,
-- 0019, 0025, 0027, and the standing guard db/test/views-are-not-policies).
-- A view runs with its OWNER'S rights and row-level security is ENABLED rather
-- than FORCED, so cw.review_ticket's read policy would never be consulted
-- through this view and a requester would read every ticket in the system. The
-- clause below repeats that policy verbatim (0008:677-681). NOT
-- security_invoker: 0017:175-185 and 0019:46 already record, in this
-- repository's own words, why that is the wrong tool here.
create or replace view cw.ticket_metrics as
  select
    t.ticket_id,
    t.agreement_id,
    t.category_key,
    t.state,

    -- The arithmetic. Computed by the database at the moment of approval.
    t.edit_similarity                       as measured_edit_similarity,
    'MEASURED · textual distance, computed by the database'
                                            as measurement_label,

    -- The opinion. Null until one is asked for; 'absent' when one was asked
    -- for and the model could not answer.
    j.outcome                               as judgment_outcome,
    j.score                                 as estimated_semantic_difference,
    'ESTIMATED · an AI advisory opinion, not a measurement'
                                            as judgment_label,
    j.basis                                 as judgment_basis,
    j.absent_reason                         as judgment_absent_reason,
    j.model                                 as judgment_model,
    j.model_version                         as judgment_model_version,
    j.requested_by                          as judgment_requested_by,
    j.created_at                            as judgment_at,
    coalesce(c.judgments_recorded, 0)       as judgments_recorded
  from cw.review_ticket t
  left join lateral (
    select a.* from cw.advisory_assessment a
     where a.ticket_id = t.ticket_id
       and a.judgment_kind = 'semantic_difference'
     order by a.assessment_id desc limit 1) j on true
  left join lateral (
    select count(*) as judgments_recorded from cw.advisory_assessment a
     where a.ticket_id = t.ticket_id
       and a.judgment_kind = 'semantic_difference') c on true
  where cw.app_role() in ('legal_reviewer','legal_admin','auditor')
     or (cw.app_role() = 'requester'
         and (t.opened_by = cw.app_actor()
              or (t.agreement_id is not null and cw.owns_agreement(t.agreement_id))));

comment on view cw.ticket_metrics is
  'The arithmetic measurement and the latest AI estimate for a ticket, each
   carrying its own label. Scoped by cw.review_ticket''s own policy — this view
   adds no visibility of its own.';

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.advisory_assessment enable row level security;

-- A judgment is about a ticket, so it is read by exactly the people who may
-- read that ticket. Written as a lookup into cw.review_ticket rather than a
-- second copy of the ticket's rules, because a second copy is the one that
-- goes stale.
create policy read_scoped on cw.advisory_assessment for select using (
  exists (select 1 from cw.review_ticket t where t.ticket_id = advisory_assessment.ticket_id));

create policy record_judgment on cw.advisory_assessment for insert
  with check (
    cw.app_role() in ('requester','legal_reviewer','legal_admin')
    and exists (
      select 1 from cw.review_ticket t
       where t.ticket_id = advisory_assessment.ticket_id));

-- Deliberately absent: any UPDATE or DELETE policy, and any UPDATE or DELETE
-- grant. Append-only is enforced twice — by privilege and by the trigger above
-- — because the trigger alone would be one `alter table … disable trigger`
-- away, and the grant alone fails silently (finding D1).
revoke all on cw.advisory_assessment from public;
grant select, insert on cw.advisory_assessment
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.advisory_assessment to cw_auditor, cw_administrator;
grant usage, select on sequence cw.advisory_assessment_assessment_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;

grant select on cw.ticket_metrics
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- Deliberately absent: any grant to cw_viewer. A judgment quotes the two texts
-- it compared, and a viewer reads neither. Also deliberately absent:
-- cw_administrator, for the reason 0025 gave about this same role — the
-- administrator's read boundary is an owner decision about a role, and settling
-- it inside a feature migration puts a new control where nobody would look for
-- it. 'administrator' is absent from the WHERE clause above for the same
-- reason it is absent from 0025's: a branch that can never execute is
-- reassuring text, which is what views-are-not-policies exists to prevent.

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- drop view if exists cw.ticket_metrics;
-- drop trigger if exists audit_advisory_assessment on cw.advisory_assessment;
-- drop trigger if exists advisory_assessment_no_truncate on cw.advisory_assessment;
-- drop trigger if exists advisory_assessment_no_edit on cw.advisory_assessment;
-- drop table if exists cw.advisory_assessment;
-- drop function if exists cw.audit_advisory_assessment();
-- drop function if exists cw.advisory_append_only();
--
-- Rows already written are evidence and are lost by this rollback; that is the
-- cost of reverting an evidence table and is stated so nobody discovers it.
