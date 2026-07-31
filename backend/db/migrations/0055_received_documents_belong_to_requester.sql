-- 0055 · A requester stores received paper only on their own agreement
--
-- 0047 correctly limited storage to the three working roles, but its INSERT
-- policy stopped at the role name. A requester connection could therefore
-- attach arbitrary bytes to any known agreement id, even though every other
-- requester write in this family is scoped through cw.owns_agreement(). Legal
-- roles continue to work across the portfolio; requester ownership is enforced
-- by the schema rather than left to a doorway lookup.

drop policy working_roles_store on cw.received_document;

create policy working_roles_store on cw.received_document for insert
  with check (
    cw.app_role() in ('legal_reviewer', 'legal_admin')
    or (cw.app_role() = 'requester'
        and cw.owns_agreement(received_document.agreement_id))
  );
