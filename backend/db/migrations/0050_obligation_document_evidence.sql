-- 0050 · Document and counterparty evidence for obligations (OB-06)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-30: the
-- highest present was 0049, so 0050 is the next free number.
--
-- OB-06 was gated on NC-07 — "the system can receive a document" — and that
-- gate opened with 0047: received bytes land in cw.received_document,
-- append-only, the SHA-256 the schema's own arithmetic. So this migration is
-- small on purpose: it CONNECTS the evidence store to the obligation record
-- rather than inventing a second one.
--
--   · satisfy-with-document — the satisfied act may now carry a reference to
--     a received document. The note stays mandatory (the attestation says
--     what the document IS; bytes without a sentence are not evidence
--     anybody can act on), and the reference is immutably linked: acts are
--     append-only (0037) and the document row is append-only (0047).
--   · counterparty_ack — the counterparty acknowledged something, recorded
--     AGAINST A RECEIVED DOCUMENT, never as a bare flag. An ack is evidence,
--     not closure: the closed set stays satisfied/waived (0038 reads acts in
--     ('satisfied','waived') and is untouched).
--   · THE SAME-DEAL RULE, the one new guard: evidence must have been
--     received for the deal the obligation belongs to. Without it, any
--     document in the system could "prove" any duty anywhere.
--
-- The guard and the insert policy are replaced wholesale, with the 0037/0039
-- blocks carried VERBATIM — the mutation harness keys on those lines, and
-- the preflight requires every copy to match so a break lands in all of them
-- (the 0039 precedent, third copy).

alter table cw.obligation_act
  add column document_ref bigint references cw.received_document(document_id);

comment on column cw.obligation_act.document_ref is
  'The received document this act cites as evidence (0047''s store). Present
   on satisfy-with-document, mandatory on counterparty_ack, and always from
   the SAME deal as the obligation — the guard refuses foreign evidence.';

alter table cw.obligation_act drop constraint act_is_known;
alter table cw.obligation_act add constraint act_is_known
  check (act in ('satisfied','waived','reassigned','breach_asserted',
                 'counterparty_ack'));

-- An acknowledgement IS its document; without one it is a bare flag, which
-- is exactly what OB-06 exists to refuse.
alter table cw.obligation_act add constraint ack_needs_document
  check (act <> 'counterparty_ack' or document_ref is not null);

-- ── The guard, third edition: 0039's text verbatim plus the same-deal rule ──
create or replace function cw.obligation_act_guard() returns trigger
language plpgsql as $$
declare i cw.obligation_instance%rowtype;
begin
  -- The actor is the connection's person, never a claim.
  if cw.app_role() is not null then
    new.acted_by := cw.app_actor();
    new.acted_at := now();
  end if;

  select * into i from cw.obligation_instance
   where obligation_id = new.obligation_id;
  if not found then
    raise exception 'no such obligation: %', new.obligation_id
      using errcode = 'no_data_found';
  end if;

  if exists (select 1 from cw.obligation_act a
              where a.obligation_id = new.obligation_id
                and a.act in ('satisfied','waived')) then
    raise exception
      'obligation % is already closed; a decision is not revisited',
      new.obligation_id using errcode = 'restrict_violation';
  end if;

  if new.act = 'breach_asserted'
     and (i.due_on is null or current_date <= i.due_on) then
    raise exception
      'obligation % is not overdue — the arithmetic does not support a breach '
      'assertion, and the system never says breach on its own (D-1)',
      new.obligation_id using errcode = 'restrict_violation';
  end if;

  -- The waiver branch: an APPROVED finding naming exactly this obligation, on
  -- the request the act cites. A merely proposed waiver authorises nothing —
  -- the same fault the concession path and the SOW path were built to prevent.
  if new.act = 'waived' then
    if new.override_ref is null or not exists (
      select 1 from cw.override_passes p
       where p.request_id = new.override_ref
         and p.finding_ref = 'obligation:' || new.obligation_id) then
      raise exception
        'waiving obligation % needs an approved override naming it; a proposal '
        'is not an approval (ADR-0008)', new.obligation_id
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- The same-deal rule (OB-06): evidence answers for the deal it was
  -- received on. A document from another deal — or none at all where one is
  -- cited — proves nothing here, whatever its bytes say.
  if new.document_ref is not null then
    if not exists (select 1 from cw.received_document rd
                    where rd.document_id = new.document_ref
                      and rd.agreement_id = i.agreement_id) then
      raise exception
        'document % was not received for agreement % — evidence answers for '
        'the deal it arrived on', new.document_ref, i.agreement_id
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end $$;

-- ── The insert policy, third edition: the ack joins the working acts ─────────
-- The 0039 waived and breach branches are carried verbatim (harness-keyed).
-- An acknowledgement is recorded by the people doing the work — Legal, or
-- the requester on their own deal — exactly like a satisfaction.
drop policy record_act on cw.obligation_act;
create policy record_act on cw.obligation_act for insert with check (
  (act in ('satisfied','reassigned','counterparty_ack')
     and (cw.app_role() in ('legal_reviewer','legal_admin')
          or (cw.app_role() = 'requester' and exists (
                select 1 from cw.obligation_instance i
                 where i.obligation_id = obligation_act.obligation_id
                   and cw.owns_agreement(i.agreement_id)))))
  or (act = 'waived' and cw.app_role() in ('legal_reviewer','legal_admin'))
  or (act = 'breach_asserted' and cw.app_role() = 'legal_admin'));

-- ── The audit payload carries the evidence reference ────────────────────────
create or replace function cw.audit_obligation_act() returns trigger
language plpgsql as $$
begin
  perform cw.audit('obligation_' || new.act, new.obligation_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'note', new.note, 'new_owner', new.new_owner,
      'document_ref', new.document_ref)));
  return new;
end $$;
