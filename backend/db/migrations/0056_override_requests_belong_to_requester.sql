-- 0056 · A requester opens an override only on their own anchored run
--
-- The 0015 trigger binds requested_by, but its INSERT policy checked only the
-- role. Because requesters intentionally hold direct INSERT, one could name a
-- foreign run and supply a null or mismatched agreement anchor. The governed
-- helper normally derives the anchor through a scoped read, but the schema is
-- the authority and must enforce the same relationship on every write path.

drop policy requester_asks on cw.override_request;

create policy requester_asks on cw.override_request for insert
  with check (
    cw.app_role() = 'requester'
    and exists (
      select 1 from cw.run r
      where r.run_id = override_request.run_id
        and r.agreement_id is not distinct from override_request.agreement_id
    )
  );
