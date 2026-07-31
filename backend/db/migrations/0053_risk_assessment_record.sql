-- 0053 · Risk-exposure judgments get their own record (NC-26, U14a–U14d)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-30: the
-- highest present was 0052, so 0053 is the next free number.
--
-- WHAT A ROW IS: one AI estimate of risk transferred, anchored to exactly
-- one of the two things the owner asked about —
--
--   · PROSPECTIVE: a proposed move in round analysis (0052's record), before
--     the buyer chooses. What accepting this change would cost.
--   · RETROSPECTIVE: a settled concession. What the choice actually cost.
--
-- AN ESTIMATE, LABELLED AND CONTAINED. The judgment rules are NC-25's,
-- inherited whole: stored with provenance (model, version, the exact texts
-- read), labelled an estimate wherever it appears, never caller-supplied,
-- never instead of any measurement — and an ABSENCE IS AN OUTCOME: when no
-- model is reachable the row says so with its reason, and nothing anywhere
-- waits on it (advice that gates action has become a decision).
--
-- Why not 0030's table: cw.advisory_assessment anchors to a review ticket,
-- NOT NULL, correctly for its judgment. These estimates anchor to analysis
-- rows and concessions — different anchors, own record, exactly as NC-25
-- planned ("that package appends rows, not columns" was about the KIND list;
-- the anchor difference makes it a sibling table instead).

create table cw.risk_assessment (
  assessment_id bigserial primary key,

  -- Exactly one anchor.
  analysis_id   bigint references cw.round_analysis(analysis_id),
  concession_id bigint references cw.concession(concession_id),
  direction     text not null check (direction in ('prospective','retrospective')),

  -- What the model actually read — copied, not referenced (the 0030 rule).
  baseline_text text not null,
  compared_text text not null,

  -- Whether there is a judgment at all, and the estimate when there is one.
  -- Signed: positive means risk moved TO the customer, negative to the
  -- vendor — the owner asked for both directions.
  outcome       text not null check (outcome in ('recorded','absent')),
  transfer_estimate numeric(6,4)
                  check (transfer_estimate is null
                         or (transfer_estimate >= -1 and transfer_estimate <= 1)),
  basis         text,
  absent_reason text,

  model         text not null,
  model_version text not null,

  assessed_at   timestamptz not null default now(),
  assessed_by   text not null check (btrim(assessed_by) <> ''),

  constraint one_anchor
    check ((analysis_id is null) <> (concession_id is null)),
  constraint anchor_matches_direction
    check ((direction = 'prospective') = (analysis_id is not null)),
  constraint recorded_has_estimate
    check ((outcome = 'recorded') = (transfer_estimate is not null)),
  constraint absent_has_reason
    check (outcome <> 'absent' or coalesce(btrim(absent_reason), '') <> '')
);

create index on cw.risk_assessment (analysis_id);
create index on cw.risk_assessment (concession_id);

comment on table cw.risk_assessment is
  'AI estimates of risk transferred, prospective (a proposed move, before
   the buyer chooses) and retrospective (a settled concession — what the
   choice actually cost). ADVISORY THROUGHOUT: an estimate beside the
   record, never a gate; an unavailable model is an absent outcome with its
   reason, and nothing waits on it. Signed -1..1; every row names its model
   and carries the exact texts it read.';

-- Append-only: a fresher estimate is a new row.
create or replace function cw.risk_assessment_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'a risk assessment is append-only; a better estimate is a new row, '
    'never an edit' using errcode = 'restrict_violation';
end $$;

create trigger risk_assessment_frozen before update on cw.risk_assessment
  for each row execute function cw.risk_assessment_frozen();
create trigger risk_assessment_no_delete before delete on cw.risk_assessment
  for each row execute function cw.risk_assessment_frozen();
create trigger risk_assessment_no_truncate before truncate on cw.risk_assessment
  execute function cw.risk_assessment_frozen();

create or replace function cw.bind_risk_assessment_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.assessed_by := cw.app_actor();
    new.assessed_at := now();
  end if;
  return new;
end $$;

create trigger risk_assessment_binds_actor
  before insert on cw.risk_assessment
  for each row execute function cw.bind_risk_assessment_actor();

-- ── Who may do what — the negotiation family's own shape ────────────────────
alter table cw.risk_assessment enable row level security;

create policy read_scoped on cw.risk_assessment for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and (
        (analysis_id is not null and exists (
           select 1 from cw.round_analysis ra
           join cw.negotiation n using (negotiation_id)
           where ra.analysis_id = risk_assessment.analysis_id
             and cw.owns_agreement(n.agreement_id)))
        or (concession_id is not null and exists (
           select 1 from cw.concession c
           where c.concession_id = risk_assessment.concession_id
             and cw.owns_agreement(c.agreement_id))))));

create policy write_scoped on cw.risk_assessment for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and (
          (analysis_id is not null and exists (
             select 1 from cw.round_analysis ra
             join cw.negotiation n using (negotiation_id)
             where ra.analysis_id = risk_assessment.analysis_id
               and cw.owns_agreement(n.agreement_id)))
          or (concession_id is not null and exists (
             select 1 from cw.concession c
             where c.concession_id = risk_assessment.concession_id
               and cw.owns_agreement(c.agreement_id))))));

revoke all on cw.risk_assessment from public;
grant select on cw.risk_assessment to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert on cw.risk_assessment to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.risk_assessment_assessment_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
