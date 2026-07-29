-- 0040 · The envelope record (OB-12, and D-2 on the record)
--
-- OBLIGATIONS-ARCHITECTURE.md §3.3. The signature connection's record half,
-- deliberately ahead of its provider half (OB-13, gated on NC-07 and on
-- credentials only the owner can procure): an ENVELOPE per send, its
-- recipients, and an append-only event stream from the provider. When an
-- envelope completes, the signed bytes and the completion certificate are
-- filed through the machinery that already exists (cw.executed_document,
-- cw.signature_certificate, cw.executed_signatory) — the envelope is a new way
-- of ARRIVING at the same recorded acts, never a second copy of them.
--
-- One honest correction to the work package, recorded rather than smoothed
-- over: the package said a sent-hash vs signed-bytes mismatch is "an incident".
-- Hash EQUALITY is the wrong test — every provider overlays signature pages
-- and stamps, so the signed bytes legitimately differ on every envelope that
-- was ever signed. What the record preserves is the evidence PAIR: the hash of
-- what was sent (here) and the hash of what was signed (cw.executed_document),
-- linked by agreement, so a dispute can compare content with both hashes in
-- hand. An automatic incident on every signing would be noise wearing a
-- control's clothes.

create table cw.signature_envelope (
  envelope_id     bigserial primary key,
  agreement_id    text not null references cw.agreement(agreement_id),
  provider        text not null check (btrim(provider) <> ''),
  provider_envelope_id text not null check (btrim(provider_envelope_id) <> ''),
  -- What was SENT, byte for byte, before any provider overlay.
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  sent_by         text not null check (btrim(sent_by) <> ''),
  sent_at         timestamptz not null default now(),
  state           text not null default 'sent'
                    check (state in ('sent','completed','declined','voided','expired')),
  unique (provider, provider_envelope_id)
);

create index on cw.signature_envelope (agreement_id);

create table cw.signature_recipient (
  envelope_id bigserial not null references cw.signature_envelope(envelope_id),
  ordinal     int  not null check (ordinal >= 0),
  name        text not null check (btrim(name) <> ''),
  party       text not null check (party in ('ours','theirs')),
  primary key (envelope_id, ordinal)
);

-- The event stream: what the provider said, when, verbatim in `detail`.
-- Recipient-level facts (who signed when, from where) ride the detail payload;
-- the authoritative WHO-signed record is cw.executed_signatory, filed at
-- completion like any other execution.
create table cw.signature_envelope_event (
  envelope_id bigint not null references cw.signature_envelope(envelope_id),
  seq         int    not null check (seq >= 0),
  event       text   not null check (event in
                ('sent','delivered','signed','completed','declined','voided','expired')),
  occurred_at timestamptz not null,
  detail      jsonb  not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  primary key (envelope_id, seq)
);

-- ── The state machine, driven by events and nothing else ────────────────────
-- There is no UPDATE policy or grant on cw.signature_envelope: the state
-- column moves when a terminal event is recorded, by this trigger, and no
-- other way. A terminal envelope takes no further events.
--
-- SECURITY DEFINER, and it has to be: the trigger fires on a real role's
-- event insert, and that role holds no UPDATE on the envelope — by design.
-- Run as invoker, the state move would be a zero-row silent no-op for every
-- real role and the envelope would stay 'sent' forever: finding D1's exact
-- shape, pre-empted here.
create or replace function cw.envelope_event_applies() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare env cw.signature_envelope%rowtype;
begin
  select * into env from cw.signature_envelope
   where envelope_id = new.envelope_id;
  if not found then
    raise exception 'no such envelope: %', new.envelope_id
      using errcode = 'no_data_found';
  end if;

  if env.state <> 'sent' then
    raise exception
      'envelope % is % — a terminal envelope takes no further events',
      new.envelope_id, env.state using errcode = 'restrict_violation';
  end if;

  -- Events arrive in order or not at all, the negotiation-round rule.
  if new.seq is distinct from (
       select count(*)::int from cw.signature_envelope_event e
        where e.envelope_id = new.envelope_id) then
    raise exception
      'envelope % events arrive in sequence; expected seq %, got %',
      new.envelope_id,
      (select count(*)::int from cw.signature_envelope_event e
        where e.envelope_id = new.envelope_id),
      new.seq using errcode = 'restrict_violation';
  end if;

  if new.event in ('completed','declined','voided','expired') then
    update cw.signature_envelope
       set state = new.event
     where envelope_id = new.envelope_id;
  end if;

  perform cw.audit('envelope_' || new.event, new.envelope_id::text,
    jsonb_build_object('agreement_id', env.agreement_id,
                       'provider', env.provider));
  return new;
end $$;

create trigger envelope_event_applies
  before insert on cw.signature_envelope_event
  for each row execute function cw.envelope_event_applies();

-- Events and recipients are evidence: append-only, all doors.
create or replace function cw.envelope_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'the envelope record is evidence and append-only: % takes no edits or '
    'deletions; a wrong entry is corrected by a later event', tg_table_name
    using errcode = 'restrict_violation';
end $$;

do $$
declare t text;
begin
  foreach t in array array['signature_envelope_event','signature_recipient'] loop
    execute format('create trigger %I_frozen before update on cw.%I
                    for each row execute function cw.envelope_frozen()', t, t);
    execute format('create trigger %I_no_delete before delete on cw.%I
                    for each row execute function cw.envelope_frozen()', t, t);
    execute format('create trigger %I_no_truncate before truncate on cw.%I
                    execute function cw.envelope_frozen()', t, t);
  end loop;
end $$;

-- The envelope row itself: no delete, and the only update is the trigger's
-- own state move — enforced by absence of any UPDATE grant plus this guard
-- against the owner's hand.
create or replace function cw.envelope_state_moves_by_event() returns trigger
language plpgsql as $$
begin
  if new.agreement_id  is distinct from old.agreement_id
     or new.provider   is distinct from old.provider
     or new.provider_envelope_id is distinct from old.provider_envelope_id
     or new.document_sha256 is distinct from old.document_sha256
     or new.sent_by    is distinct from old.sent_by
     or new.sent_at    is distinct from old.sent_at then
    raise exception
      'an envelope is evidence; only its state moves, and only an event moves it'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger envelope_state_moves_by_event
  before update on cw.signature_envelope
  for each row execute function cw.envelope_state_moves_by_event();

create trigger signature_envelope_no_delete before delete on cw.signature_envelope
  for each row execute function cw.envelope_frozen();

-- Sending binds the sender to the connection.
create or replace function cw.bind_envelope_sender() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.sent_by := cw.app_actor();
    new.sent_at := now();
  end if;
  new.state := 'sent';
  return new;
end $$;

create trigger bind_envelope_sender
  before insert on cw.signature_envelope
  for each row execute function cw.bind_envelope_sender();

create or replace function cw.audit_envelope_sent() returns trigger
language plpgsql as $$
begin
  perform cw.audit('envelope_opened', new.envelope_id::text,
    jsonb_build_object('agreement_id', new.agreement_id,
                       'provider', new.provider,
                       'document_sha256', new.document_sha256));
  return new;
end $$;

create trigger audit_envelope_sent
  after insert on cw.signature_envelope
  for each row execute function cw.audit_envelope_sent();

-- ── Who may do what ─────────────────────────────────────────────────────────
alter table cw.signature_envelope       enable row level security;
alter table cw.signature_recipient      enable row level security;
alter table cw.signature_envelope_event enable row level security;

create policy read_scoped on cw.signature_envelope for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester'
      and cw.owns_agreement(signature_envelope.agreement_id)));
create policy read_scoped on cw.signature_recipient for select using (
  cw.app_role() is not null);
create policy read_scoped on cw.signature_envelope_event for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.signature_envelope e
         where e.envelope_id = signature_envelope_event.envelope_id
           and cw.owns_agreement(e.agreement_id))));

-- Sending is the requester's act on their own deal, or Legal's. Events are the
-- adapter's writes (OB-13) and ride the same roles until the poller has an
-- identity of its own — a decision that belongs to OB-13, not here.
create policy send_envelope on cw.signature_envelope for insert with check (
  cw.app_role() in ('legal_reviewer','legal_admin')
  or (cw.app_role() = 'requester'
      and cw.owns_agreement(signature_envelope.agreement_id)));
create policy send_recipients on cw.signature_recipient for insert with check (
  cw.app_role() in ('legal_reviewer','legal_admin')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.signature_envelope e
         where e.envelope_id = signature_recipient.envelope_id
           and cw.owns_agreement(e.agreement_id))));
create policy record_event on cw.signature_envelope_event for insert with check (
  cw.app_role() in ('legal_reviewer','legal_admin')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.signature_envelope e
         where e.envelope_id = signature_envelope_event.envelope_id
           and cw.owns_agreement(e.agreement_id))));

revoke all on cw.signature_envelope       from public;
revoke all on cw.signature_recipient      from public;
revoke all on cw.signature_envelope_event from public;
grant select on cw.signature_envelope, cw.signature_recipient,
                cw.signature_envelope_event to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert on cw.signature_envelope, cw.signature_recipient,
                cw.signature_envelope_event to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
-- No UPDATE grant on the envelope for anybody: the state moves through the
-- definer trigger above, and there is no second way.
grant usage, select on sequence cw.signature_envelope_envelope_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;

-- ── D-2 on the record ───────────────────────────────────────────────────────
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale)
values
  ('signature_provider_first', 'docusign', 'owner_decision', true, true, 'owner',
   'D-2 — SETTLED 2026-07-28 by the owner. E-signature is CONNECTED, not '
   'built: a completion certificate is only evidence if somebody independent '
   'issued it, and our own certificate about our own contract is '
   'self-attestation. DocuSign is the first adapter, behind a five-operation '
   'provider-agnostic seam (send, status, retrieve, void, verify_event); '
   'Adobe Acrobat Sign is the intended seam-proving second. The wet-ink '
   'manual filing path stays. The accepted cost, stated: provider fees per '
   'envelope, and the seam stays unproven until a second adapter exists.');
