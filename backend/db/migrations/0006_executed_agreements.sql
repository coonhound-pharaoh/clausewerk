-- 0006 · Executed agreements and the frozen signed document.
--
-- A signed contract is not a living document. It is frozen at signature — text,
-- exhibits and all — and nothing in this system may alter it. Library changes
-- reach new agreements and amendments only.
--
-- The critical point, and the reason this migration exists at all: being able
-- to REBUILD a contract is not the same as having the one that was SIGNED.
-- Assembly can reconstruct what it issued; it cannot reconstruct what was
-- executed, because
--   1. a signed contract can contain conceded vendor language, which is
--      quarantined and deliberately never selectable (ADR-0009);
--   2. signature adds signature blocks, counterparts, initials and exhibits
--      that assembly never saw;
--   3. a reconstruction is evidence of what we believe; the file is evidence of
--      what was agreed.
--
-- So the bytes are stored, hashed, and authoritative.

-- ── The executed agreement ──────────────────────────────────────────────────
create table cw.executed_agreement (
  agreement_id     text primary key references cw.agreement(agreement_id),
  -- Assembly provenance. EXPLAINS the contract; does not constitute it.
  -- Nullable because paper that came from elsewhere still gets stored.
  run_id           text references cw.run(run_id),
  executed_on      date not null,
  effective_on     date not null,
  term_end         date,
  our_signatory    text not null,
  their_signatory  text not null,
  signature_evidence text,               -- e-signature envelope reference
  frozen_at        timestamptz not null default now(),
  constraint term_after_effective check (term_end is null or term_end > effective_on)
);

comment on table cw.executed_agreement is
  'Frozen at signature. There is no UPDATE path and no DELETE path — not for
   any role, including legal_admin.';

-- ── The signed document(s) ──────────────────────────────────────────────────
-- One row per signed instrument: the agreement, each amendment, each exhibit.
-- Never edited. An amendment is appended, never applied.
create table cw.executed_document (
  agreement_id  text not null references cw.executed_agreement(agreement_id),
  doc_seq       int  not null check (doc_seq >= 0),
  kind          text not null check (kind in ('agreement','amendment','exhibit','counterpart')),
  filename      text not null,
  mime_type     text not null default
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  byte_size     bigint not null check (byte_size > 0),
  -- The authority. If a regeneration ever disagrees with these bytes, the bytes
  -- win and the disagreement is an incident to investigate, never something to
  -- resolve by preferring our own reconstruction.
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_uri   text not null,
  signed_on     date not null,
  supersedes_seq int,                    -- an amendment names what it amends
  frozen_at     timestamptz not null default now(),
  primary key (agreement_id, doc_seq),
  foreign key (agreement_id, supersedes_seq)
    references cw.executed_document(agreement_id, doc_seq),
  -- Exactly one document is the agreement itself, and it is seq 0.
  constraint agreement_is_first check ((kind = 'agreement') = (doc_seq = 0)),
  constraint amendment_names_its_target check (
    kind <> 'amendment' or supersedes_seq is not null)
);

create unique index executed_document_hash
  on cw.executed_document (agreement_id, sha256);

comment on column cw.executed_document.sha256 is
  'Of the stored bytes. Lets the system DETECT that a regeneration and the
   signed file disagree — which it must be able to do, and must never resolve
   in favour of the regeneration.';

-- ── Frozen means frozen ─────────────────────────────────────────────────────
create or replace function cw.executed_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'a signed contract is frozen: % cannot be modified after execution', tg_table_name
    using errcode = 'restrict_violation';
end $$;

do $$
declare t text;
begin
  foreach t in array array['executed_agreement','executed_document'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);
    execute format('create rule %I_no_delete as on delete to cw.%I do instead nothing', t, t);
  end loop;
end $$;

-- ── The agreement as it stands ──────────────────────────────────────────────
-- The ordered chain of signed instruments. Effective terms are the composition
-- of the original plus its amendments, under the Order of Precedence clause —
-- computed at read time, never by rewriting anything.
create or replace view cw.agreement_chain as
select e.agreement_id, a.counterparty, e.executed_on, e.effective_on, e.term_end,
       d.doc_seq, d.kind, d.filename, d.sha256, d.signed_on, d.supersedes_seq,
       e.run_id
from cw.executed_agreement e
join cw.agreement a using (agreement_id)
join cw.executed_document d using (agreement_id)
order by e.agreement_id, d.doc_seq;

-- What a signed agreement is carrying, and how far the library has moved since.
-- Reporting only: it flags drift for the RENEWAL conversation and changes
-- nothing about the executed contract.
create or replace view cw.agreement_drift as
select e.agreement_id, d.clause_id, d.version as executed_version,
       s.successor_version, s.reason as superseded_reason,
       cur.state as current_state
from cw.executed_agreement e
join cw.run_decision d on d.run_id = e.run_id and d.clause_id is not null
left join cw.supersession s
  on s.clause_id = d.clause_id and s.predecessor_version = d.version
left join cw.clause_version_state cur
  on cur.clause_id = d.clause_id and cur.version = d.version
where s.id is not null or cur.state <> 'active';

comment on view cw.agreement_drift is
  'Reporting only. Says "the library has moved on from what this contract
   carries", which is input to a renewal conversation. It never implies the
   signed contract has changed, because it has not.';

-- ── Audit ───────────────────────────────────────────────────────────────────
create or replace function cw.audit_executed() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'executed_agreement' then
    perform cw.audit('agreement_executed', new.agreement_id, jsonb_build_object(
      'run_id', new.run_id, 'executed_on', new.executed_on,
      'our_signatory', new.our_signatory, 'their_signatory', new.their_signatory));
  else
    perform cw.audit('document_frozen', new.agreement_id || '#' || new.doc_seq,
      jsonb_build_object('kind', new.kind, 'sha256', new.sha256,
                         'filename', new.filename, 'bytes', new.byte_size));
  end if;
  return new;
end $$;

create trigger audit_executed_agreement after insert on cw.executed_agreement
  for each row execute function cw.audit_executed();
create trigger audit_executed_document after insert on cw.executed_document
  for each row execute function cw.audit_executed();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.executed_agreement enable row level security;
alter table cw.executed_document  enable row level security;

create policy read_scoped on cw.executed_agreement for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));
create policy read_scoped on cw.executed_document for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));

-- Only Legal records an execution. A requester cannot declare a deal signed.
create policy legal_writes on cw.executed_agreement for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));
create policy legal_writes on cw.executed_document for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

grant select on cw.executed_agreement, cw.executed_document,
                cw.agreement_chain, cw.agreement_drift
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert on cw.executed_agreement, cw.executed_document
  to cw_legal_reviewer, cw_legal_admin;
