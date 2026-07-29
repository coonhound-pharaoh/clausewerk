-- 0042 · The outbox, the address book, and D-3 on the record (OB-09)
--
-- OBLIGATIONS-ARCHITECTURE.md §4. The notification service stores NO copy of
-- who should be told what — that is derived fresh by cw.waiting_for (0041).
-- What IS stored is exactly two things:
--
--   · WHERE a person can be reached — cw.notification_address, maintained by
--     the Administrator the way watcher lists are: an operational fact about
--     the machine, audited both ways, never self-service (a person who can
--     redirect their own notifications can silence their own countersign
--     nudges).
--   · WHAT WAS ACTUALLY SENT — cw.notification_outbox, append-only: person,
--     channel, day, the REFERENCES carried (never content), and the delivery
--     outcome. Sending is an act; acts are recorded. Individual outbox rows
--     are deliberately NOT audited onto the hash chain — a daily digest per
--     person would bury the chain in heartbeats; the outbox IS the record,
--     and the auditor reads it whole.
--
-- The tick itself (OB-10, doorway/notifications.py) derives, sends OUTSIDE
-- any transaction (the B2 rule), and records here. Its authority is enforced
-- IN THIS SCHEMA, not in Python: cw.assert_may_run_notifications() refuses
-- every role but the Administrator, and the outbox insert policy says the
-- same thing a second way.

create table cw.notification_address (
  address_id bigserial primary key,
  person     text not null check (btrim(person) <> ''),
  channel    text not null check (channel in ('email')),
  address    text not null check (btrim(address) <> ''),
  set_by     text not null,
  set_at     timestamptz not null default now(),
  removed_by text,
  removed_at timestamptz,
  constraint removal_is_whole check ((removed_by is null) = (removed_at is null))
);

-- One live address per person per channel; history stays as removed rows.
create unique index notification_address_live
  on cw.notification_address (person, channel) where removed_at is null;

create table cw.notification_outbox (
  outbox_id bigserial primary key,
  person    text not null,
  channel   text not null check (channel in ('email')),
  sent_on   date not null,
  kind      text not null check (kind in ('digest','immediate')),
  -- References only, ever. The assembler has no content to put here, by
  -- construction (OB-10); this check is the schema saying so too.
  refs      jsonb not null default '[]'::jsonb,
  sent_at   timestamptz not null default now(),
  outcome   text not null check (outcome in ('sent','failed')),
  failure   text,
  constraint failure_is_explained check ((outcome = 'failed') = (failure is not null))
);

-- The idempotence key the tick consults: one SENT digest per person per day.
-- Failed attempts may repeat — a retry after a failure is the point of
-- recording the failure.
create unique index outbox_one_digest_a_day
  on cw.notification_outbox (person, channel, sent_on)
  where kind = 'digest' and outcome = 'sent';

create index on cw.notification_outbox (sent_on);

-- ── Append-only, both records ───────────────────────────────────────────────
create or replace function cw.notification_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'the notification record is append-only: % takes no edits or deletions',
    tg_table_name using errcode = 'restrict_violation';
end $$;

create trigger notification_outbox_frozen before update on cw.notification_outbox
  for each row execute function cw.notification_frozen();
create trigger notification_outbox_no_delete before delete on cw.notification_outbox
  for each row execute function cw.notification_frozen();
create trigger notification_outbox_no_truncate before truncate on cw.notification_outbox
  execute function cw.notification_frozen();

-- The address book allows exactly one mutation: removal, which is the pair of
-- columns and nothing else — the watcher-list shape.
create or replace function cw.notification_address_change() returns trigger
language plpgsql as $$
begin
  if new.person is distinct from old.person
     or new.channel is distinct from old.channel
     or new.address is distinct from old.address
     or new.set_by  is distinct from old.set_by
     or new.set_at  is distinct from old.set_at then
    raise exception
      'an address row is not edited; remove it and set a new one'
      using errcode = 'restrict_violation';
  end if;
  if old.removed_at is not null then
    raise exception
      'address % was already removed; removal is not revisited', old.address_id
      using errcode = 'restrict_violation';
  end if;
  new.removed_by := cw.app_actor();
  new.removed_at := now();
  perform cw.audit('notification_address_removed', old.person,
    jsonb_build_object('channel', old.channel));
  return new;
end $$;

create trigger notification_address_change
  before update on cw.notification_address
  for each row execute function cw.notification_address_change();

create trigger notification_address_no_delete before delete on cw.notification_address
  for each row execute function cw.notification_frozen();

create or replace function cw.bind_notification_address() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.set_by := cw.app_actor();
    new.set_at := now();
  end if;
  new.removed_by := null;
  new.removed_at := null;
  perform cw.audit('notification_address_set', new.person,
    jsonb_build_object('channel', new.channel));
  return new;
end $$;

create trigger bind_notification_address
  before insert on cw.notification_address
  for each row execute function cw.bind_notification_address();

-- ── The tick's authority, enforced where authority lives ────────────────────
create or replace function cw.assert_may_run_notifications() returns void
language plpgsql stable as $$
begin
  if cw.app_role() is distinct from 'administrator' then
    raise exception
      'the notification tick is the Administrator''s act; % holds %',
      coalesce(cw.app_actor(), 'an unbound connection'),
      coalesce(cw.app_role(), 'no role')
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- ── Silence made visible ────────────────────────────────────────────────────
-- A person with work waiting and no reachable address, asked of the SAME
-- derivation the digest uses — one source, so this gap and the digest can
-- never disagree about who was owed a message.
create or replace view cw.notification_gap as
select e.person, e.role
from cw.effective_role e
where exists (select 1 from cw.waiting_for(e.person, e.role))
  and not exists (select 1 from cw.notification_address a
                   where a.person = e.person and a.channel = 'email'
                     and a.removed_at is null);

comment on view cw.notification_gap is
  'People being waited on whom no channel can reach. The uncovered-category
   precedent: a gap rendered as a gap, never as calm. Empty is good news only
   if somebody is looking.';

-- ── Who may do what ─────────────────────────────────────────────────────────
alter table cw.notification_address enable row level security;
alter table cw.notification_outbox  enable row level security;

-- Addresses are operational configuration: visible to any signed-in role
-- (access is not a secret), written by the Administrator alone.
create policy read_all on cw.notification_address for select
  using (cw.app_role() is not null);
create policy administrator_maintains on cw.notification_address for insert
  with check (cw.app_role() = 'administrator');
create policy administrator_removes on cw.notification_address for update
  using      (cw.app_role() = 'administrator')
  with check (cw.app_role() = 'administrator');

-- The outbox: a person reads their own deliveries; the Administrator (who runs
-- the machine), the Auditor and Legal admin read all. Only the Administrator —
-- the tick — records one.
create policy read_scoped on cw.notification_outbox for select using (
  cw.app_role() in ('administrator','auditor','legal_admin')
  or notification_outbox.person = cw.app_actor());
create policy tick_records on cw.notification_outbox for insert
  with check (cw.app_role() = 'administrator');

revoke all on cw.notification_address from public;
revoke all on cw.notification_outbox  from public;
grant select on cw.notification_address to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert, update on cw.notification_address to cw_administrator;
grant select on cw.notification_outbox to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert on cw.notification_outbox to cw_administrator;
grant usage, select on sequence cw.notification_address_address_id_seq to cw_administrator;
grant usage, select on sequence cw.notification_outbox_outbox_id_seq to cw_administrator;
grant select on cw.notification_gap to
  cw_legal_admin, cw_auditor, cw_administrator;

-- ── D-3 on the record ───────────────────────────────────────────────────────
-- 0013 anticipated the digest with an operational row, `notification_digest`,
-- decided by engineering as a default. D-3 does not add a duplicate beside it
-- — it SETTLES the existing row, the way later migrations settle earlier
-- defaults. The actor is named so the audited change carries a name.
select set_config('cw.actor', 'migration-0042-d3', false);

update cw.governance_setting
   set value = 'daily_start_of_business',
       decided_by = 'owner',
       rationale =
         'D-3 — SETTLED 2026-07-28 by the owner, superseding engineering''s '
         'default. One digest per person per day, at start of business, '
         'containing everything currently waiting on them, derived fresh at '
         'send time from cw.waiting_for (0041). Operational because changing '
         'it changes when people are told, never what they may do.'
 where key = 'notification_digest';

insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
values
  ('notification_immediate_list',
   'override_socialisation,countersign,envelope_completed,envelope_declined',
   'operational', false, true, 'owner',
   'D-3 — SETTLED 2026-07-28 by the owner. The short list of events where a '
   'day''s delay defeats the purpose. Administrator-maintained as a setting '
   'rather than code, so widening it is a governed act rather than drift — '
   'the accepted cost being that every widening erodes the digest''s value.',
   'Which events are told the moment they happen instead of waiting for the '
   'daily digest.');
