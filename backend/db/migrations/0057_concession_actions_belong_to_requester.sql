-- 0057 · Requester concession actions stay on the requester's own deal
--
-- The parent concession has an ownership trigger, but 0010's three child
-- INSERT policies checked only the caller's role. The approval trigger happens
-- to bind an approval to its configured person; settlement and withdrawal
-- validate workflow state but not deal ownership. A foreign requester could
-- therefore withdraw an unsettled concession, or settle one after its named
-- approvals existed. Legal roles retain portfolio-wide action authority.

drop policy write_scoped on cw.concession_approval;
create policy write_scoped on cw.concession_approval for insert
  with check (
    cw.app_role() in ('legal_reviewer', 'legal_admin')
    or (cw.app_role() = 'requester' and exists (
      select 1 from cw.concession c
      where c.concession_id = concession_approval.concession_id
        and cw.owns_agreement(c.agreement_id)
    ))
  );

drop policy write_scoped on cw.concession_settlement;
create policy write_scoped on cw.concession_settlement for insert
  with check (
    cw.app_role() in ('legal_reviewer', 'legal_admin')
    or (cw.app_role() = 'requester' and exists (
      select 1 from cw.concession c
      where c.concession_id = concession_settlement.concession_id
        and cw.owns_agreement(c.agreement_id)
    ))
  );

drop policy write_scoped on cw.concession_withdrawal;
create policy write_scoped on cw.concession_withdrawal for insert
  with check (
    cw.app_role() in ('legal_reviewer', 'legal_admin')
    or (cw.app_role() = 'requester' and exists (
      select 1 from cw.concession c
      where c.concession_id = concession_withdrawal.concession_id
        and cw.owns_agreement(c.agreement_id)
    ))
  );
