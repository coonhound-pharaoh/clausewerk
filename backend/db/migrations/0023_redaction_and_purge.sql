-- 0023 · Two ways to end a record's life, and the second needs the first.
--
-- OWNER DECISION U12, 2026-07-27: "the administrator can remove the whole
-- record, but can delegate the authority to delete records to remove content,
-- but keep the fact. So records deleted under #1 can be reviewed and deleted
-- under #2."
--
-- So there are two acts, not one, and they are deliberately unequal:
--
--   REDACT  · removes the CONTENT, keeps the FACT. The document's name, size,
--             hash, dates and the whole history of it survive; what goes is the
--             text and the pointer to it. **Delegable** — the Administrator may
--             name somebody to do this.
--   PURGE   · removes the record itself. **The Administrator alone**, and only
--             on something already redacted, so there is always a reviewable
--             state in between.
--
-- THE ESCALATION IS THE CONTROL. You cannot purge in one step. A record must
-- first be redacted, which leaves it listed in cw.redaction_state for anybody
-- to review, and only then can the Administrator remove it. That ordering is
-- what makes "reviewed" in the owner's sentence mean something rather than being
-- a hope.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT SURVIVES A PURGE, AND THE OWNER SHOULD KNOW IT
-- ══════════════════════════════════════════════════════════════════════════
-- The audit chain does. `cw.audit_event` has no DELETE privilege for any role
-- including the owner's application roles, it is hash-chained, and it refuses
-- TRUNCATE. So after a purge the chain still records that this agreement was
-- opened, executed, destroyed, redacted and purged — by whom and when.
--
-- That is deliberate and it is the reason a purge is safe to offer at all: the
-- evidence that disposal happened correctly outlives the thing disposed of. It
-- also means a purge is NOT erasure of every trace. If the motive is ever a
-- right-to-erasure request naming a person, the chain is a residual that has to
-- be discussed on its own terms — it is not something this migration can quietly
-- solve, and pretending otherwise would be the worst kind of reassurance.
--
-- WHAT A PURGE DOES NOT TOUCH, stated so nobody assumes otherwise. It removes
-- the SIGNED CONTRACT and its evidence: the executed agreement, its documents,
-- its signature certificate and its signatories. It leaves the negotiation
-- behind it — cw.agreement, its runs, decisions, positions and override
-- requests — because that is a different record with its own retention story and
-- removing it would cascade through half the schema. Extending the purge there
-- is a decision, not a detail.

-- ══════════════════════════════════════════════════════════════════════════
-- The two new stages, recorded on the retention row
-- ══════════════════════════════════════════════════════════════════════════
-- `destroyed_on` already meant "the decision to end this record's life was
-- taken". It did not mean anything had been removed, and that gap is what U12
-- fills. These two columns are the acts that carry the decision out.
alter table cw.agreement_retention
  add column redacted_on date,
  add column redacted_by text,
  add column purged_on   date,
  add column purged_by   text;

alter table cw.agreement_retention
  add constraint redacted_names_a_person_and_a_date
    check ((redacted_on is null) = (redacted_by is null)),
  add constraint purged_names_a_person_and_a_date
    check ((purged_on is null) = (purged_by is null)),
  -- The escalation, enforced by the table and not only by the function. A row
  -- cannot record a purge that skipped the redaction, however it was written.
  add constraint a_purge_follows_a_redaction
    check (purged_on is null or redacted_on is not null),
  add constraint a_redaction_follows_a_destruction
    check (redacted_on is null or destroyed_on is not null);

-- ══════════════════════════════════════════════════════════════════════════
-- The delegation
-- ══════════════════════════════════════════════════════════════════════════
-- Named people, not a role. The owner said the Administrator may DELEGATE the
-- redaction authority, which is a different shape from granting a role: it is
-- one person authorising another to do one thing, revocably, on the record.
create table cw.records_delegate (
  delegate_id bigserial primary key,
  person      text not null references cw.account(person),
  granted_by  text not null default cw.app_actor(),
  granted_at  timestamptz not null default now(),
  reason      text not null,
  revoked_by  text,
  revoked_at  timestamptz,

  -- A delegation with no stated reason is one nobody can review later, which is
  -- the same rule the share and the override request already follow.
  constraint a_reason_is_not_blank check (length(btrim(reason)) >= 5),
  constraint revoked_names_a_person_and_a_time check (
    (revoked_at is null) = (revoked_by is null))
);

-- One live delegation per person. A second would be a second row to revoke, and
-- somebody would revoke one and believe they were done.
create unique index records_delegate_live
  on cw.records_delegate (person) where revoked_at is null;

comment on table cw.records_delegate is
  'Who the Administrator has authorised to REDACT records — remove content and '
  'keep the fact. Never to purge: that is the Administrator''s alone (U12). '
  'Revoked, never deleted, because that somebody held this authority for that '
  'period does not stop being true.';

create or replace function cw.audit_records_delegate() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('records_delegate_granted', new.person,
      jsonb_build_object('reason', new.reason));
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform cw.audit('records_delegate_revoked', new.person,
      jsonb_build_object('by', new.revoked_by));
  end if;
  return new;
end $$;

create trigger audit_records_delegate
  before insert or update on cw.records_delegate
  for each row execute function cw.audit_records_delegate();

create or replace function cw.delegate_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'a delegation is revoked, never deleted — that this person '
    'held the authority, for that period, does not stop being true';
end $$;

create trigger records_delegate_no_delete
  before delete on cw.records_delegate
  for each row execute function cw.delegate_no_delete();

create trigger records_delegate_no_truncate
  before truncate on cw.records_delegate
  for each statement execute function cw.no_truncate();

-- "May this person redact, right now?" SECURITY DEFINER for the same reason
-- cw.was_notified() and cw.is_shared_with() are: the policy below consults this,
-- and this consults a table whose policy would consult it back.
-- "May this person redact, right now?" Answered from DATA — the delegation list
-- and the person's effective role — never from the connection.
--
-- THAT DISTINCTION IS A BUG FIX, AND IT WAS A DANGEROUS ONE. The first version
-- of the guards below read `cw.app_role()` to spot the Administrator. Inside a
-- SECURITY DEFINER function `current_user` is the function's OWNER, so
-- cw.app_role() returns NULL — and `null <> 'administrator'` is NULL, not true,
-- so the whole condition was NULL and **the guard never raised**. An
-- undelegated legal reviewer redacted a record on the first run of
-- redaction.test.mjs.
--
-- The lesson generalises: a SECURITY DEFINER function cannot see who called it,
-- and a three-valued comparison against a NULL fails OPEN. Ask the data who
-- somebody is; let the EXECUTE grant bound who may ask at all.
create or replace function cw.may_redact(p_person text) returns boolean
language sql stable
security definer set search_path = cw, pg_temp as $$
  select exists (select 1 from cw.records_delegate
                  where person = p_person and revoked_at is null)
      or exists (select 1 from cw.effective_role
                  where person = p_person and role = 'administrator')
$$;

-- "Is this person an Administrator?" Same reasoning, and the only thing that
-- may purge.
create or replace function cw.is_administrator(p_person text) returns boolean
language sql stable
security definer set search_path = cw, pg_temp as $$
  select exists (select 1 from cw.effective_role
                  where person = p_person and role = 'administrator')
$$;

revoke all on function cw.is_administrator(text) from public;
grant execute on function cw.is_administrator(text) to
  cw_administrator, cw_legal_admin, cw_legal_reviewer, cw_auditor;

revoke all on function cw.may_redact(text) from public;
grant execute on function cw.may_redact(text) to
  cw_administrator, cw_legal_admin, cw_legal_reviewer, cw_auditor;

alter table cw.records_delegate enable row level security;

-- The Administrator delegates and revokes. Nobody else, including legal_admin —
-- this is the Administrator's authority to hand out, and a role that could
-- delegate it to itself would have taken it rather than been given it.
create policy administrator_delegates on cw.records_delegate for insert
  with check (cw.app_role() = 'administrator');
create policy administrator_revokes on cw.records_delegate for update
  using (cw.app_role() = 'administrator')
  with check (cw.app_role() = 'administrator');

-- Read: everybody signed in. Who may destroy records is not a secret — it is
-- exactly the sort of thing an auditor, and anybody else, should be able to see
-- without asking.
create policy read_all on cw.records_delegate for select
  using (cw.app_role() is not null);

revoke all on cw.records_delegate from public;
grant select on cw.records_delegate to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;
grant insert, update on cw.records_delegate to cw_administrator;
grant usage, select on sequence cw.records_delegate_delegate_id_seq to cw_administrator;

-- ══════════════════════════════════════════════════════════════════════════
-- The freeze, and its one sanctioned exception
-- ══════════════════════════════════════════════════════════════════════════
-- cw.executed_frozen() refuses every update and delete on a signed contract, and
-- that is the guarantee the whole product rests on. Redaction and purge are the
-- only acts that may pass it, so the trigger now admits a transaction-local flag
-- that ONLY the two functions below set.
--
-- WHY A SESSION FLAG IS NOT A HOLE HERE, since it is settable by any caller. It
-- confers no privilege. No role holds UPDATE or DELETE on any of these four
-- tables — not legal_admin, not the administrator, nobody — so a caller who sets
-- the flag still cannot reach the row. The privilege is the lock; this flag only
-- stops the trigger refusing the owner-rights functions that are allowed
-- through. Setting it by hand achieves precisely nothing.
create or replace function cw.executed_frozen() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('cw.records_act', true), '') = 'yes' then
    return coalesce(new, old);
  end if;
  raise exception
    'a signed contract is frozen: % cannot be modified after execution', tg_table_name
    using errcode = 'restrict_violation';
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- REDACT · remove the content, keep the fact
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT IS ACTUALLY REMOVED, because "content" means different things in the two
-- tables and getting it wrong would leave the thing behind:
--
--   cw.signature_certificate.certificate  · REAL BYTES, held here on purpose —
--     "a reference to a certificate on someone else's server is a promise; the
--     bytes are the evidence". Emptied.
--   cw.executed_document.storage_uri      · the pointer to the document itself,
--     which lives outside this database. Cleared, so nothing here leads to it.
--
--   KEPT: filename, byte_size, sha256, mime_type, dates, provider, envelope,
--   and every audit row. The hash is the important survivor — it still proves
--   WHAT the document was to anybody holding a copy, without this system holding
--   one.
--
-- NOTE ON THE BYTES OUTSIDE. Clearing storage_uri severs this system's link to
-- the stored file; it does not reach into the object store and delete it. That
-- is a second system's job and this migration cannot honestly claim to have done
-- it. `cw.redaction_state.external_bytes_pending` says so out loud rather than
-- letting a clean-looking screen imply otherwise.
create or replace function cw.redact_agreement(p_agreement_id text, p_actor text)
returns void
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare r cw.agreement_retention%rowtype; matters text;
begin
  -- Asked of the data, not of the connection — see cw.may_redact(). An
  -- Administrator qualifies by role; anybody else needs a live delegation.
  if not cw.may_redact(p_actor) then
    raise exception 'redacting records is the Administrator''s, or a person the '
      'Administrator has delegated it to; % holds no such delegation', p_actor
      using errcode = 'insufficient_privilege';
  end if;

  select * into r from cw.agreement_retention where agreement_id = p_agreement_id;
  if not found then
    raise exception 'no retention record for %; nothing to redact', p_agreement_id
      using errcode = 'no_data_found';
  end if;

  -- Checked before the destruction test so the error names the real reason.
  if cw.agreement_under_hold(p_agreement_id) then
    select string_agg(h.matter_ref, ', ' order by h.matter_ref) into matters
    from cw.legal_hold h
    where h.agreement_id = p_agreement_id and h.released_on is null;
    raise exception
      '% is under legal hold (%); redaction is suspended until every hold is '
      'released', p_agreement_id, matters using errcode = 'restrict_violation';
  end if;

  -- THE ORDER MATTERS. Retention destruction is the decision that this record's
  -- life has ended; redaction carries it out. Redacting something nobody has
  -- decided to destroy would be a deletion without a decision behind it.
  if r.destroyed_on is null then
    raise exception 'the retention of % has not been ended; record the '
      'destruction first, then redact', p_agreement_id
      using errcode = 'restrict_violation';
  end if;

  if r.redacted_on is not null then
    raise exception '% was already redacted on %', p_agreement_id, r.redacted_on
      using errcode = 'restrict_violation';
  end if;

  perform set_config('cw.records_act', 'yes', true);

  update cw.signature_certificate
     set certificate = '\x00'::bytea, byte_size = 1
   where agreement_id = p_agreement_id;

  update cw.executed_document
     set storage_uri = ''
   where agreement_id = p_agreement_id;

  update cw.agreement_retention
     set redacted_on = current_date, redacted_by = p_actor
   where agreement_id = p_agreement_id;

  perform set_config('cw.records_act', '', true);

  perform cw.audit('agreement_redacted', p_agreement_id,
    jsonb_build_object('redacted_by', p_actor,
                       'delegated', not cw.is_administrator(p_actor)));
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- PURGE · remove the record itself. The Administrator alone.
-- ══════════════════════════════════════════════════════════════════════════
create or replace function cw.purge_agreement(p_agreement_id text, p_actor text)
returns void
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare r cw.agreement_retention%rowtype; matters text;
begin
  -- No delegation here, and that asymmetry is the owner's decision rather than
  -- an oversight. Removing content can be handed out; removing the record
  -- cannot.
  -- Two gates, and this is the inner one. The EXECUTE grant already admits only
  -- cw_administrator; this refuses on the PERSON as well, so a connection that
  -- somehow reached the function under another name is still turned away.
  if not cw.is_administrator(p_actor) then
    raise exception 'purging a record is the Administrator''s alone and cannot '
      'be delegated; % may redact at most', p_actor
      using errcode = 'insufficient_privilege';
  end if;

  select * into r from cw.agreement_retention where agreement_id = p_agreement_id;
  if not found then
    raise exception 'no retention record for %; nothing to purge', p_agreement_id
      using errcode = 'no_data_found';
  end if;

  if cw.agreement_under_hold(p_agreement_id) then
    select string_agg(h.matter_ref, ', ' order by h.matter_ref) into matters
    from cw.legal_hold h
    where h.agreement_id = p_agreement_id and h.released_on is null;
    raise exception
      '% is under legal hold (%); purging is suspended until every hold is '
      'released', p_agreement_id, matters using errcode = 'restrict_violation';
  end if;

  -- THE ESCALATION, and the whole reason there are two acts. A purge can only
  -- follow a redaction, so there is always a state in which the record is
  -- content-free, listed in cw.redaction_state, and reviewable before anybody
  -- removes it. One-step erasure is exactly what this refuses.
  if r.redacted_on is null then
    raise exception '% has not been redacted; a record is redacted first, '
      'reviewed, and only then purged', p_agreement_id
      using errcode = 'restrict_violation';
  end if;

  if r.purged_on is not null then
    raise exception '% was already purged on %', p_agreement_id, r.purged_on
      using errcode = 'restrict_violation';
  end if;

  perform set_config('cw.records_act', 'yes', true);

  delete from cw.signature_certificate where agreement_id = p_agreement_id;
  delete from cw.executed_signatory    where agreement_id = p_agreement_id;
  delete from cw.executed_document     where agreement_id = p_agreement_id;
  delete from cw.executed_agreement    where agreement_id = p_agreement_id;

  update cw.agreement_retention
     set purged_on = current_date, purged_by = p_actor
   where agreement_id = p_agreement_id;

  perform set_config('cw.records_act', '', true);

  -- This row outlives everything it describes. cw.audit_event holds no DELETE
  -- privilege for any role, is hash-chained and refuses TRUNCATE — so the fact
  -- that this contract existed and was disposed of correctly survives the
  -- disposal. That is the point.
  perform cw.audit('agreement_purged', p_agreement_id,
    jsonb_build_object('purged_by', p_actor,
                       'redacted_on', r.redacted_on,
                       'retention_until', r.retention_until));
end $$;

revoke all on function cw.redact_agreement(text, text) from public;
revoke all on function cw.purge_agreement(text, text) from public;
-- Redaction reaches the three roles a delegate could plausibly hold; the
-- function then refuses anybody without a live delegation. Two gates, and the
-- privilege is the outer one — a viewer or requester cannot be delegated this
-- authority even by mistake.
grant execute on function cw.redact_agreement(text, text)
  to cw_administrator, cw_legal_admin, cw_legal_reviewer;
grant execute on function cw.purge_agreement(text, text) to cw_administrator;

-- ══════════════════════════════════════════════════════════════════════════
-- The review surface
-- ══════════════════════════════════════════════════════════════════════════
create or replace view cw.redaction_state as
select r.agreement_id,
       r.retention_until,
       r.destroyed_on, r.destroyed_by,
       r.redacted_on,  r.redacted_by,
       r.purged_on,    r.purged_by,
       case when r.purged_on   is not null then 'purged'
            when r.redacted_on is not null then 'redacted'
            when r.destroyed_on is not null then 'destroyed'
            else 'live' end                          as state,
       -- The honest caveat. Clearing storage_uri severs this system's link to
       -- the stored file; it does not reach into the object store. Anything
       -- redacted but not purged still has bytes somewhere else, and a screen
       -- that implied otherwise would be the most dangerous kind of clean.
       (r.redacted_on is not null and r.purged_on is null) as external_bytes_pending
from cw.agreement_retention r;

comment on view cw.redaction_state is
  'Where each record is in its end of life: live, destroyed (decided), redacted '
  '(content gone, fact kept) or purged (record gone, audit chain kept). The '
  'redacted rows are the review queue U12 asks for — a purge can only follow a '
  'redaction, so this is always the state in between.';

revoke all on cw.redaction_state from public;
grant select on cw.redaction_state to
  cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;

insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale)
values
  ('record_disposal_is_two_acts', 'redact_then_purge', 'owner_decision', true, true, 'owner',
   'U12 — SETTLED 2026-07-27 by the owner. Ending a record''s life is TWO acts, '
   'not one. REDACT removes the content and keeps the fact — filename, size, '
   'hash, dates and the whole audit history survive — and the Administrator may '
   'DELEGATE it to a named person, revocably and on the record. PURGE removes '
   'the record itself and is the Administrator''s alone, undelegable, and only '
   'on something already redacted. The escalation is the control: there is '
   'always a reviewable state in between, and one-step erasure is refused. What '
   'survives a purge is the audit chain, which has no delete privilege for '
   'anybody — so the evidence that disposal happened correctly outlives the '
   'thing disposed of.');
