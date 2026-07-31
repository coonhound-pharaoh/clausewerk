-- 0054 · Claim a digest before talking to the outside channel
--
-- 0042's unique sent-outbox index prevents two SENT records. It cannot
-- prevent two external sends: concurrent ticks can both observe no sent row,
-- both send, and only then race to append the outcome. This coordination row
-- closes that gap without holding a database transaction (and therefore a
-- pooled connection) across SMTP.
--
-- Claims are deliberately leases rather than permanent locks. A process may
-- die after claiming and before recording an outcome; after five minutes a
-- later tick may recover the work. Five minutes is comfortably beyond the
-- channel's 30-second timeout. As with any SMTP sender, a process dying after
-- the server accepted a message but before the outcome commit can still cause
-- a later retry: the system is at-least-once across that irreducible boundary.

create table cw.notification_delivery_claim (
  person      text not null,
  channel     text not null check (channel in ('email')),
  sent_on     date not null,
  kind        text not null check (kind in ('digest','immediate')),
  claim_token uuid not null,
  claimed_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (person, channel, sent_on, kind),
  constraint claim_expiry_follows_claim check (expires_at > claimed_at)
);

comment on table cw.notification_delivery_claim is
  'Short-lived coordination leases that prevent overlapping notification '
  'ticks from sending the same delivery. Mutable operational state, not an '
  'outcome record; completed and failed attempts remain append-only in '
  'notification_outbox.';

alter table cw.notification_delivery_claim enable row level security;

create policy administrator_coordinates on cw.notification_delivery_claim
  for all
  using (cw.app_role() = 'administrator')
  with check (cw.app_role() = 'administrator');

revoke all on cw.notification_delivery_claim from public;
grant select, insert, update, delete on cw.notification_delivery_claim
  to cw_administrator;
