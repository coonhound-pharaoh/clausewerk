-- A session cap must retire the oldest issuance, not the smallest random hash.
-- `expires_at` cannot provide that order when sessions have the same configured
-- lifetime, and the token digest is deliberately random. The database clock is
-- taken at INSERT, inside the per-person issuance lock, so concurrent callers
-- acquire one total order without trusting their pre-lock application clocks.

alter table cw.session
  add column issued_at timestamptz not null default clock_timestamp();

comment on column cw.session.issued_at is
  'Database insertion time used only to retire the oldest live sign-ins first.';
