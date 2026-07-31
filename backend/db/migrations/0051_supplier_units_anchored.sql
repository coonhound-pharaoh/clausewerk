-- 0051 · Supplier units are anchored to the bytes they came from (NC-18)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-30: the
-- highest present was 0050, so 0051 is the next free number. NC-18's open
-- prerequisite — "resolve 'at most one migration' to yes or no" — resolves
-- to YES, this one.
--
-- WHAT RP-05 ALREADY BUILT, which is most of NC-18: the decomposition
-- (paper.ingest splits the vendor's .docx with the hardened reader), the
-- deterministic classifier (ADR-0005: the fallback ships FIRST; a model is
-- seated in front of it later, exactly as the manifest classifier is
-- fronted), and the quarantine — units land as review tickets with reason
-- 'supplier-paper', badge 'VENDOR LANGUAGE', their text in proposed_text,
-- which no selectable view references. Unknown categories cannot arise at
-- this boundary by construction: the classifier's vocabulary IS cw.category.
--
-- WHAT WAS MISSING, and lands here: the SOURCE-LOCATION REFERENCE. A ticket
-- said what the vendor's paragraph SAYS but not where it CAME FROM — and
-- with U15's store (0047) the exact bytes are on the record, so the anchor
-- can point at them: this unit is paragraph N of the document whose SHA-256
-- the store itself computed. A reviewer adjudicating vendor language can
-- open the exact source; an auditor can prove the quoted text against
-- stored bytes.
--
-- A NOTE FOR THE LIBRARY WORK, carried from the package: supplier language
-- seen repeatedly across counterparties is INPUT to the library, surfaced
-- through the existing proposal surface. This table produces the
-- observation; it never produces a clause. Promotion, if it ever happens,
-- goes through Legal's review as a new version with a vendor-derived origin
-- — the library path, not this one.

create table cw.supplier_unit (
  unit_id      bigserial primary key,
  -- One unit, one ticket: the ticket IS the quarantined unit; this row is
  -- its provenance.
  ticket_id    bigint not null unique references cw.review_ticket(ticket_id),
  document_id  bigint not null references cw.received_document(document_id),
  -- Zero-based position among the document's parsed paragraphs, so the
  -- reference points at specific bytes via the stored document's own sha256.
  paragraph_no int not null check (paragraph_no >= 0),
  created_at   timestamptz not null default now()
);

create index on cw.supplier_unit (document_id);

comment on table cw.supplier_unit is
  'Where each quarantined supplier unit came from: paragraph N of a stored
   received document (0047), whose sha256 is the schema''s own arithmetic —
   so the anchor survives anything short of the bytes themselves changing,
   which the store refuses. Append-only provenance; the unit''s TEXT lives in
   the ticket''s quarantined proposed_text and nowhere else.';

-- Provenance takes no edits, the house shape.
create or replace function cw.supplier_unit_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'a supplier unit''s provenance is append-only; where a unit came from is '
    'not correctable after the fact'
    using errcode = 'restrict_violation';
end $$;

create trigger supplier_unit_frozen before update on cw.supplier_unit
  for each row execute function cw.supplier_unit_frozen();
create trigger supplier_unit_no_delete before delete on cw.supplier_unit
  for each row execute function cw.supplier_unit_frozen();
create trigger supplier_unit_no_truncate before truncate on cw.supplier_unit
  execute function cw.supplier_unit_frozen();

-- The anchor must name a document received for the same deal the ticket
-- names — the OB-06 same-deal shape, applied to provenance.
create or replace function cw.supplier_unit_guard() returns trigger
language plpgsql as $$
declare t_agreement text; d_agreement text;
begin
  select agreement_id into t_agreement from cw.review_ticket
   where ticket_id = new.ticket_id;
  select agreement_id into d_agreement from cw.received_document
   where document_id = new.document_id;
  if t_agreement is distinct from d_agreement then
    raise exception
      'supplier unit anchors ticket % (deal %) to document % (deal %) — a '
      'unit''s source must be the deal''s own received paper',
      new.ticket_id, t_agreement, new.document_id, d_agreement
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger supplier_unit_guard
  before insert on cw.supplier_unit
  for each row execute function cw.supplier_unit_guard();

-- ── Who may do what ─────────────────────────────────────────────────────────
-- Written by the ingest path as the caller; read wherever the ticket is
-- readable. The read policy mirrors cw.review_ticket's read_scoped shape:
-- Legal and the Auditor in full, a requester on their own deals, no viewer.
alter table cw.supplier_unit enable row level security;

create policy read_scoped on cw.supplier_unit for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.review_ticket t
         where t.ticket_id = supplier_unit.ticket_id
           and (t.opened_by = cw.app_actor()
                or (t.agreement_id is not null
                    and cw.owns_agreement(t.agreement_id))))));

create policy working_roles_anchor on cw.supplier_unit for insert with check (
  cw.app_role() in ('requester','legal_reviewer','legal_admin'));

revoke all on cw.supplier_unit from public;
grant select on cw.supplier_unit to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert on cw.supplier_unit to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.supplier_unit_unit_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
