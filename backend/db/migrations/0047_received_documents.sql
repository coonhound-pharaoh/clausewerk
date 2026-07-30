-- 0047 · The system learns to KEEP a received document (NC-07, U15)
--
-- The transport arrived with RP-05: server.py reads a non-JSON POST once,
-- measures it, wraps it in app.Upload and hands it on. What was deliberately
-- missing was anywhere for the bytes to LAND — "where document bytes live is
-- an open owner decision (NC-07)", said paper.py, and parsed-and-released.
--
-- THE OWNER DECIDED, 2026-07-29 (U15, docs/open-questions.md §13):
--
--   · The bytes live IN THE DATABASE. One system, one backup, one row-level
--     security model — and U12's disposal stays honest, because deleting an
--     in-database document actually deletes it. The move of RAW BYTES to
--     object storage (S3) is PLANNED FOR LAUNCH, carried in open-questions
--     §13; `sha256` here is what makes that a migration, not a redesign.
--   · The ceiling is ONE GIGABYTE — for contracts, "any size" in practice
--     (a 300-page scanned contract runs 100–300 MB). The ceiling exists so
--     one upload cannot exhaust the service; it says nothing about what a
--     typical document should be.
--
-- WHAT A ROW IS: evidence somebody else created. We did not author it, we
-- cannot regenerate it, and an auditor may one day ask for the exact bytes
-- that arrived. So rows are append-only — no edit, no delete, no truncate —
-- and the sha256 and byte_count are GENERATED columns: the database's own
-- arithmetic over the stored bytes, impossible to record wrongly.
--
-- WHO MAY STORE ONE: the three working roles that receive paper — requester,
-- legal reviewer, legal admin. The Administrator stores nothing (U5: the role
-- writes no content; the administrator sweep test enforces this schema-wide),
-- and the Auditor reads everything and writes nothing, as always. Reading is
-- open to every working role plus the Auditor and the Administrator — the
-- openness-by-default rule (open-questions §12); the Viewer sees only what
-- is shared with them and holds no grant here.

create table cw.received_document (
  document_id  bigserial primary key,
  agreement_id text not null references cw.agreement(agreement_id),
  bytes        bytea not null,
  byte_count   bigint generated always as (octet_length(bytes)) stored,
  sha256       text  generated always as (encode(sha256(bytes), 'hex')) stored,
  content_type text,
  -- The caller's claim about their own file's name, recorded as claimed
  -- (server.py deliberately does not rewrite it). Nullable: a document with
  -- no name is still evidence.
  filename     text,
  received_by  text not null,
  received_at  timestamptz not null default now(),
  constraint a_document_has_bytes check (octet_length(bytes) > 0)
);

-- ── The ceiling, enforced where the bytes land ──────────────────────────────
-- server.py refuses an oversized upload UNREAD at the front door, from the
-- content-length header. This trigger is the LAST LINE OF DEFENSE for bytes
-- that arrive by any other path, and it reads the ceiling from the governance
-- row below — one recorded number, consulted at the door and at the floor.
-- A missing row REFUSES rather than waving through: a limit that fails open
-- is the redaction-guard shape, and it has bitten before.
create or replace function cw.bind_received_document() returns trigger
language plpgsql as $$
declare
  ceiling bigint;
begin
  select value::bigint into ceiling
    from cw.governance_setting where key = 'max_document_bytes';
  if ceiling is null then
    raise exception
      'max_document_bytes is not on the record; a document cannot be stored unmeasured'
      using errcode = 'restrict_violation';
  end if;
  if octet_length(new.bytes) > ceiling then
    raise exception
      'that document is too large: % bytes is over the recorded ceiling of %',
      octet_length(new.bytes), ceiling
      using errcode = 'restrict_violation';
  end if;
  new.received_by := cw.app_actor();
  new.received_at := now();
  perform cw.audit('document_received', new.agreement_id,
    jsonb_build_object('sha256', encode(sha256(new.bytes), 'hex'),
                       'bytes', octet_length(new.bytes),
                       'filename', new.filename));
  return new;
end $$;

create trigger bind_received_document
  before insert on cw.received_document
  for each row execute function cw.bind_received_document();

-- ── Append-only: evidence takes no edits ────────────────────────────────────
create or replace function cw.received_document_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'a received document is evidence: % takes no edits or deletions',
    tg_table_name using errcode = 'restrict_violation';
end $$;

create trigger received_document_frozen before update on cw.received_document
  for each row execute function cw.received_document_frozen();
create trigger received_document_no_delete before delete on cw.received_document
  for each row execute function cw.received_document_frozen();
create trigger received_document_no_truncate before truncate on cw.received_document
  execute function cw.received_document_frozen();

-- ── Who may do what ─────────────────────────────────────────────────────────
alter table cw.received_document enable row level security;

create policy read_all on cw.received_document for select
  using (cw.app_role() is not null);
create policy working_roles_store on cw.received_document for insert
  with check (cw.app_role() in ('requester', 'legal_reviewer', 'legal_admin'));

revoke all on cw.received_document from public;
grant select on cw.received_document to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert on cw.received_document to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.received_document_document_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;

-- ── U15 on the record ───────────────────────────────────────────────────────
select set_config('cw.actor', 'migration-0047-u15', false);

insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
values
  ('document_storage', 'database', 'owner_decision', true, true, 'owner',
   'U15 — SETTLED 2026-07-29 by the owner. Received documents (counterparty '
   'redlines, vendor paper, signed envelopes, obligation evidence) are stored '
   'in the database itself: one system, one backup, one security model, and '
   'a disposal that actually deletes. The move of raw bytes to object storage '
   '(S3) is PLANNED FOR LAUNCH — carried in docs/open-questions.md §13, to be '
   'raised with the rest of the deployment hardening. The stored sha256 is '
   'what makes that move a migration rather than a redesign.',
   'Where the bytes of a received document live.'),

  ('max_document_bytes', '1073741824', 'owner_decision', true, true, 'owner',
   'U15 — SETTLED 2026-07-29 by the owner: one gigabyte, "that would be a '
   'huge document." Comfortably above any real contract (a 300-page scanned '
   'contract runs 100–300 MB); the ceiling exists so one upload cannot '
   'exhaust the service, not as a statement about typical size. Enforced '
   'unread at the front door (server.py MAX_DOCUMENT_BYTES — a test holds '
   'the constant equal to this row) and again where the bytes land '
   '(cw.bind_received_document).',
   'The largest document the system accepts, in bytes.');
