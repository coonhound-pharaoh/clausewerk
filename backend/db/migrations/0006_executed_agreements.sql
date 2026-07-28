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
  -- WP-18c: `our_signatory` and `their_signatory` used to live here as two text
  -- columns. Two plain names cannot record a THIRD signatory, cannot say whether
  -- a signature was electronic or wet ink, and cannot hold the date an
  -- individual actually signed — which on a counterpart execution is not the
  -- same date for everyone. They are replaced by cw.executed_signatory below.
  --
  -- `signature_evidence` stays, narrowed to what it always honestly was: a
  -- pointer at the provider's envelope. The evidence itself — the completion
  -- certificate and its bytes — is cw.signature_certificate below.
  signature_evidence text,               -- e-signature envelope reference
  -- WP-18d · masters and statements of work (LIFECYCLE §3.6). Two facts, not a
  -- new hierarchy: what kind of instrument this is, and which master it belongs
  -- to. Composition reuses the Order of Precedence overlay that already governs
  -- an agreement and its amendments — no new resolution rule.
  agreement_kind   text not null default 'standalone'
                     check (agreement_kind in ('standalone','master','sow')),
  parent_agreement_id text references cw.executed_agreement(agreement_id),
  frozen_at        timestamptz not null default now(),
  constraint term_after_effective check (term_end is null or term_end > effective_on),
  constraint only_a_sow_has_a_master check (
    (agreement_kind = 'sow') = (parent_agreement_id is not null)),
  constraint a_sow_is_not_its_own_master check (parent_agreement_id <> agreement_id)
);

comment on table cw.executed_agreement is
  'Frozen at signature: no role holds UPDATE or DELETE on this table, and the
   freeze trigger refuses an edit even if one did. NOT absolute any more, and
   this comment said it was until 2026-07-27 — owner decision U12, built in
   0023, added exactly two governed exits, each through a SECURITY DEFINER
   function that runs with owner rights and therefore past the privilege lock:
   cw.redact_agreement() clears the document content and keeps the fact
   (legal_admin, or a named delegate), and cw.purge_agreement() deletes the
   row (administrator alone, undelegable, and only after a redaction). Both
   are on the audit chain, which outlives the record. Read those as the whole
   list of ways a signed agreement can change; there is no third.';

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
--
-- WP-25b/c changed HOW deletion is blocked, not WHETHER it is. It was
-- `on delete to … do instead nothing`: the row survived, and the caller was
-- told the delete had succeeded. The guarantee this file exists to defend is
-- that nothing in the system modifies an executed agreement, and a system that
-- reports a successful deletion of a signed contract is not defending it — it
-- is describing the opposite of what happened. Now it raises, in the same words
-- as an edit attempt.
--
-- TRUNCATE joins the same story. It fires neither row triggers nor ON DELETE
-- rules, so before this the signed bytes could be erased wholesale by one
-- statement that every guard in this file was blind to.
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
    execute format('create trigger %I_no_delete before delete on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);
    execute format('create trigger %I_no_truncate before truncate on cw.%I
                    for each statement execute function cw.executed_frozen()', t, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- THE AGREEMENT STATUS MACHINE (WP-08 · finding D7)
-- ════════════════════════════════════════════════════════════════════════════
-- cw.agreement has carried a `status` column since 0003 and nothing has ever
-- moved it. No grant, no policy, no code path. Every deal in the system —
-- including deals whose signed PDF is sitting in the table above — reads as
-- "negotiating", forever. A portfolio view built on that column would report
-- that the company has never signed anything.
--
-- THE PERMITTED STATES, RECONCILED. LIFECYCLE-ARCHITECTURE.md described a
-- five-step post-signature life: executing → active → terminating → wound_down
-- → closed. The schema has three: negotiating → executed → terminated. They
-- contradicted each other, so one had to give.
--
-- The schema wins, and the document is corrected to match. Reasons: the
-- document's set has no state for a deal BEFORE signature, which is where every
-- agreement starts and where most of them live; and its finer post-signature
-- states describe obligation wind-down machinery that is not built. Writing
-- five states into the schema now would mean four of them could never be
-- reached — a promise on the page with nothing behind it, which is the exact
-- class of defect this work exists to remove. When wind-down is built, states
-- get added then, with the code that moves them.
--
-- THE PERMITTED MOVES:
--     negotiating → executed     (we signed it)
--     negotiating → terminated   (it died before signature)
--     executed    → terminated   (it ended)
-- Nothing else. In particular there is no way back: a signed deal cannot
-- return to negotiating, and a terminated one cannot be revived. Both of those
-- are new agreements, not edits to an old one.
create or replace function cw.agreement_status_transition() returns trigger
language plpgsql as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (
       (old.status = 'negotiating' and new.status in ('executed','terminated'))
    or (old.status = 'executed'    and new.status = 'terminated')
  ) then
    raise exception
      'an agreement cannot go from % to %; the permitted moves are '
      'negotiating→executed, negotiating→terminated, executed→terminated',
      old.status, new.status using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger agreement_status_machine
  before update on cw.agreement
  for each row execute function cw.agreement_status_transition();

-- Every move is recorded, with where it came from. "This deal is terminated"
-- is not an answer an auditor can use; "it moved from executed to terminated
-- on this date, by this person" is.
create or replace function cw.audit_agreement_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    perform cw.audit('agreement_status_changed', new.agreement_id,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

create trigger audit_agreement_status
  after update on cw.agreement
  for each row execute function cw.audit_agreement_status();

-- Execution is what moves the status, and it is the ONLY thing that does.
--
-- SECURITY DEFINER, and for a reason worth stating: cw.agreement has no UPDATE
-- policy and no UPDATE grant to any role, deliberately. Nobody can set a deal's
-- status by hand — not a requester, not legal_admin. The status is a
-- consequence of filing the signed document, so recording the execution is the
-- act, and the status follows automatically. Anyone who wants a deal marked
-- executed has to produce the signed contract.
create or replace function cw.agreement_execute() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare
  moved integer;
begin
  update cw.agreement set status = 'executed'
  where agreement_id = new.agreement_id and status = 'negotiating';
  get diagnostics moved = row_count;
  if moved <> 1 then
    raise exception
      'agreement % cannot be executed because it is not negotiating',
      new.agreement_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger executed_agreement_moves_status
  after insert on cw.executed_agreement
  for each row execute function cw.agreement_execute();

-- The header and its signed original are one filing. Defer the check until the
-- transaction boundary so callers can insert the parent before document zero,
-- as the foreign key requires, while a header-only transaction rolls back
-- instead of leaving an immutable phantom execution.
create or replace function cw.execution_requires_original() returns trigger
language plpgsql as $$
begin
  -- Owner-mode migrations and historical imports may load evidence in phases.
  -- Governed application writes always carry SET ROLE and must be atomic.
  if nullif(current_setting('role', true), 'none') is null then
    return new;
  end if;
  if not exists (
    select 1 from cw.executed_document d
     where d.agreement_id = new.agreement_id
       and d.doc_seq = 0
       and d.kind = 'agreement'
  ) then
    raise exception
      'execution % has no signed original document; the header and document zero '
      'must be filed in the same transaction',
      new.agreement_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

create constraint trigger execution_requires_original
  after insert on cw.executed_agreement
  deferrable initially deferred
  for each row execute function cw.execution_requires_original();

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
      'agreement_kind', new.agreement_kind,
      'parent_agreement_id', new.parent_agreement_id));
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

-- ════════════════════════════════════════════════════════════════════════════
-- WP-18c · SIGNATURE EVIDENCE — the two genuine gaps, and only those two
-- ════════════════════════════════════════════════════════════════════════════
-- Most of signature capture already worked and is deliberately not rebuilt
-- here. Every executed document above is already a first-class record with its
-- byte size, SHA-256 and storage location, and that already covers counterpart
-- and exhibit documents — wet-ink counterparts, signature pages returned
-- separately, and schedules attached during negotiation are all hashed byte
-- sets today. The earlier reading that signature capture was "one field" was
-- wrong about the schema.
--
-- Two things were genuinely missing.

-- ── Gap 1 · the completion certificate ──────────────────────────────────────
-- The counterpart bytes prove WHAT was signed. The provider's completion
-- certificate proves WHO signed it, when, from where, and how they were
-- authenticated. Those are different evidentiary claims, and only one of them
-- survives the provider going out of business or purging the account. So the
-- certificate is stored like any other document — bytes included.
create table cw.signature_certificate (
  agreement_id text primary key references cw.executed_agreement(agreement_id),
  provider     text not null check (btrim(provider) <> ''),
  envelope_id  text not null check (btrim(envelope_id) <> ''),
  completed_at timestamptz not null,
  -- THE POINT OF THIS TABLE. A reference to a certificate held on someone
  -- else's server is a promise; the bytes are the evidence.
  certificate  bytea not null check (octet_length(certificate) > 0),
  byte_size    bigint not null check (byte_size > 0),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_uri  text,
  frozen_at    timestamptz not null default now(),
  constraint size_matches_the_bytes check (byte_size = octet_length(certificate))
);

comment on table cw.signature_certificate is
  'The e-signature provider''s completion certificate, stored as bytes. Frozen
   at execution like everything else in this family.';

-- ── Gap 2 · signatories are records, not two text fields ────────────────────
create table cw.executed_signatory (
  agreement_id text not null references cw.executed_agreement(agreement_id),
  ordinal      int  not null check (ordinal >= 0),
  name         text not null check (btrim(name) <> ''),
  party        text not null check (party in ('ours','theirs')),
  method       text not null check (method in ('electronic','wet_ink')),
  signed_on    date not null,
  title        text,
  frozen_at    timestamptz not null default now(),
  primary key (agreement_id, ordinal)
);

comment on table cw.executed_signatory is
  'One row per person who signed. Replaces the two `our_signatory` /
   `their_signatory` text columns, which could not hold a third signatory, could
   not say whether a signature was electronic or wet ink, and could not record
   the date an individual actually signed — which on a counterpart execution
   differs per person.';

-- What a signed agreement is still missing. REPORTING, not a constraint: the
-- system's job is to make the gap visible and give the responsible person a
-- place to act, not to refuse to record a contract that was genuinely signed
-- because the filing is incomplete.
create or replace view cw.execution_evidence_gap as
select e.agreement_id,
       not exists (select 1 from cw.executed_signatory s
                   where s.agreement_id = e.agreement_id and s.party = 'ours')
         as missing_our_signatory,
       not exists (select 1 from cw.executed_signatory s
                   where s.agreement_id = e.agreement_id and s.party = 'theirs')
         as missing_their_signatory,
       not exists (select 1 from cw.signature_certificate c
                   where c.agreement_id = e.agreement_id)
         as missing_completion_certificate
from cw.executed_agreement e;

comment on view cw.execution_evidence_gap is
  'Rows where a signed agreement is short of the evidence it should carry. A
   gap here is a filing task for a named person, never something the system
   invents or resolves on their behalf.';

-- Frozen, exactly like the rest of the family.
do $$
declare t text;
begin
  foreach t in array array['signature_certificate','executed_signatory'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);
    execute format('create trigger %I_no_delete before delete on cw.%I
                    for each row execute function cw.executed_frozen()', t, t);
    execute format('create trigger %I_no_truncate before truncate on cw.%I
                    for each statement execute function cw.executed_frozen()', t, t);
  end loop;
end $$;

create or replace function cw.audit_signature_evidence() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'signature_certificate' then
    perform cw.audit('signature_certificate_stored', new.agreement_id,
      jsonb_build_object('provider', new.provider, 'envelope_id', new.envelope_id,
                         'sha256', new.sha256, 'bytes', new.byte_size));
  else
    perform cw.audit('signatory_recorded',
      new.agreement_id || '#' || new.ordinal,
      jsonb_build_object('name', new.name, 'party', new.party,
                         'method', new.method, 'signed_on', new.signed_on));
  end if;
  return new;
end $$;

create trigger audit_signature_certificate after insert on cw.signature_certificate
  for each row execute function cw.audit_signature_evidence();
create trigger audit_executed_signatory after insert on cw.executed_signatory
  for each row execute function cw.audit_signature_evidence();

-- ════════════════════════════════════════════════════════════════════════════
-- WP-18d · MASTERS AND STATEMENTS OF WORK
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS HONESTLY DELIVERS, said before the code rather than after it.
--
-- It models the STRUCTURE: the system can say that a statement of work belongs
-- to a master, refuses a SOW that names something which is not a master, and
-- surfaces a SOW that contradicts its master. It does NOT deliver multi-
-- agreement OBLIGATION composition, because obligations are not built at all —
-- not in this migration, not anywhere in the backend. Obligations registering
-- per instrument and inheriting the master's where a SOW is silent is the same
-- composition rule applied to a thing that does not exist. Modelling the
-- structure now is what makes that possible later; claiming coverage today
-- would be false.
create or replace function cw.sow_hangs_off_a_master() returns trigger
language plpgsql as $$
declare parent_kind text; clashes text;
begin
  if new.agreement_kind <> 'sow' then return new; end if;

  select agreement_kind into parent_kind from cw.executed_agreement
   where agreement_id = new.parent_agreement_id;
  if parent_kind is null then
    raise exception
      'statement of work % names % as its master, but no executed agreement of '
      'that id exists', new.agreement_id, new.parent_agreement_id
      using errcode = 'foreign_key_violation';
  end if;
  if parent_kind <> 'master' then
    raise exception
      'statement of work % names % as its master, but that agreement is a %; '
      'only a master may carry statements of work',
      new.agreement_id, new.parent_agreement_id, parent_kind
      using errcode = 'check_violation';
  end if;

  -- ── U2 · OWNER DECISION, NOT SETTLED HERE ────────────────────────────────
  -- May a SOW take a different position on a category its master already
  -- settles? That is a legal convention, not an engineering choice, so it is
  -- not decided in this code. The STRICTER reading ships as the default —
  -- it may not — and the switch is a visible row in cw.governance_setting
  -- marked `is_owner_decision = true, decided = false`. Setting that row to
  -- 'true' relaxes the rule with no migration and no rewritten records, which
  -- is exactly why the strict side was chosen to ship: relaxing is cheap,
  -- discovering that a SOW quietly overrode the master's liability cap is not.
  if cw.setting('sow_may_contradict_master') = 'true' then return new; end if;

  select string_agg(x.category_key || ' (master ' || x.master_clause ||
                    ', sow ' || x.sow_clause || ')', ', ' order by x.category_key)
    into clashes
  from (
    select sd.category_key,
           md.clause_id as master_clause,
           sd.clause_id as sow_clause
    from cw.run_decision sd
    join cw.executed_agreement m on m.agreement_id = new.parent_agreement_id
    join cw.run_decision md on md.run_id = m.run_id
                           and md.category_key = sd.category_key
    where sd.run_id = new.run_id
      and sd.clause_id is not null and md.clause_id is not null
      and sd.clause_id is distinct from md.clause_id) x;

  if clashes is not null then
    raise exception
      'statement of work % contradicts its master % on %. By default a SOW may '
      'add to its master but not contradict it; amend the master instead, or '
      'have the owner settle U2 by setting sow_may_contradict_master',
      new.agreement_id, new.parent_agreement_id, clashes
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger sow_hangs_off_a_master
  before insert on cw.executed_agreement
  for each row execute function cw.sow_hangs_off_a_master();

-- Reporting, for the looser setting and for anything already recorded: where
-- does a SOW take a different position from its master? Under the strict
-- default this view is empty by construction; under the loose one it is the
-- list a person needs.
create or replace view cw.sow_conflict as
select s.agreement_id as sow_id, s.parent_agreement_id as master_id,
       sd.category_key, md.clause_id as master_clause, sd.clause_id as sow_clause
from cw.executed_agreement s
join cw.executed_agreement m on m.agreement_id = s.parent_agreement_id
join cw.run_decision sd on sd.run_id = s.run_id
join cw.run_decision md on md.run_id = m.run_id and md.category_key = sd.category_key
where s.agreement_kind = 'sow'
  and sd.clause_id is not null and md.clause_id is not null
  and sd.clause_id is distinct from md.clause_id;

-- §3.6: "Terminating a master while a SOW under it is still live is a condition
-- the system must surface at the moment of termination, not discover later."
-- Surfaced, not prevented — ending a relationship while work runs under it is a
-- legitimate commercial act, and the named deal owner decides.
create or replace view cw.orphaned_sow as
select s.agreement_id as sow_id, s.parent_agreement_id as master_id,
       a.status as sow_status, ma.status as master_status
from cw.executed_agreement s
join cw.agreement a  on a.agreement_id  = s.agreement_id
join cw.agreement ma on ma.agreement_id = s.parent_agreement_id
where s.agreement_kind = 'sow'
  and ma.status = 'terminated' and a.status <> 'terminated';

-- ── Row-level security and grants for the new evidence ──────────────────────
alter table cw.signature_certificate enable row level security;
alter table cw.executed_signatory    enable row level security;

create policy read_scoped on cw.signature_certificate for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));
create policy read_scoped on cw.executed_signatory for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));

create policy legal_writes on cw.signature_certificate for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));
create policy legal_writes on cw.executed_signatory for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

grant select on cw.signature_certificate, cw.executed_signatory,
                cw.execution_evidence_gap, cw.sow_conflict, cw.orphaned_sow
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert on cw.signature_certificate, cw.executed_signatory
  to cw_legal_reviewer, cw_legal_admin;
