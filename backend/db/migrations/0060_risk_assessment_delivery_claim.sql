-- 0060 · Claim a retrospective assessment before asking the model
--
-- The assessment itself is append-only and the provider call must happen
-- outside a database transaction. Without a coordination row, two concurrent
-- sweeps can both observe the same unassessed concession, both pay for an
-- opinion, and both append one. This lease is operational state, not evidence;
-- the risk_assessment row remains the durable outcome.

create table cw.risk_assessment_claim (
  concession_id bigint primary key references cw.concession(concession_id),
  claim_token   uuid not null,
  claimed_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  constraint risk_claim_expiry_follows_claim check (expires_at > claimed_at)
);

comment on table cw.risk_assessment_claim is
  'Expiring coordination leases preventing duplicate concurrent retrospective '
  'model calls. Operational state only; outcomes remain append-only in '
  'cw.risk_assessment.';

alter table cw.risk_assessment_claim enable row level security;

create policy assessors_coordinate on cw.risk_assessment_claim for all
  using (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and exists (
      select 1 from cw.concession c
      where c.concession_id = risk_assessment_claim.concession_id
        and cw.owns_agreement(c.agreement_id))))
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and exists (
      select 1 from cw.concession c
      where c.concession_id = risk_assessment_claim.concession_id
        and cw.owns_agreement(c.agreement_id))));

revoke all on cw.risk_assessment_claim from public;
grant select, insert, update, delete on cw.risk_assessment_claim to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
