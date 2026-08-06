-- 0066 · What the model intake is allowed to spend, and what it leaves behind
--
-- AI-3 (AI-FRONT-HALF-ARCHITECTURE-2026-08-02) is the model intake: a
-- requester's plain answers in, a PROPOSED manifest out — which risk categories
-- apply, at what severity, and why. The owner cleared its three gates on
-- 2026-08-04 (memory.md S225): stay with OpenAI, accept the proposed budget,
-- intake before matcher.
--
-- This migration is the half of AI-3 that belongs in the database: the budget
-- as a setting somebody can change without a release, and a ledger of what was
-- actually asked, so the budget can be counted and the AI-use record exists.
--
-- WHY A LEDGER AT ALL, when the chain already records that a classification
-- happened. Two different questions. The chain says a REQUESTER classified an
-- intake; the ledger says the SYSTEM called a provider — how often, at what
-- cost, and how often the call failed and the deterministic path carried the
-- work instead. Nobody can answer "is the model earning its keep" from the
-- chain, and the daily cap cannot be enforced without counting.
--
-- WHAT THIS IS NOT. It is not the AI-use export (NC-15) and not the cost
-- reporting screens — that is AI-7, and it reads this table. Building the
-- ledger here rather than there is deliberate: the first model package needs
-- the count on day one, and a cap nobody can count is not a cap.

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · The budget, as settings a person can change
-- ══════════════════════════════════════════════════════════════════════════
-- OPERATIONAL, not owner decisions, and the distinction is the one 0013 drew:
-- changing these changes how much the system spends and how often it asks,
-- never what anybody is allowed to decide. The Administrator changes them; no
-- release is involved. That is exactly what the owner accepted.
select set_config('cw.actor', 'migration-0066-ai3', false);

insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale, purpose)
values
  ('ai_calls_per_day', '200', 'operational', false, true, 'owner 2026-08-04',
   'The owner accepted the proposed default on 2026-08-04 (S225): generous for '
   'development, visible in reporting, changeable by the Administrator without '
   'a release. The cap is counted over cw.model_call below. Reaching it does '
   'not break intake — the deterministic classifier carries the work and the '
   'screen says the model was not asked, which is ADR-0005 doing its job on a '
   'budget rather than on an outage.',
   'How many times a day the system may ask a model for an opinion. Past the '
   'cap, the deterministic path answers instead.'),

  ('ai_tokens_per_call', '4000', 'operational', false, true, 'owner 2026-08-04',
   'The owner accepted the proposed default on 2026-08-04 (S225). It bounds a '
   'single call so one enormous intake cannot spend a day''s budget, and it is '
   'the number the seam sends as its completion ceiling.',
   'The most a single model call may cost, in tokens.');

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · The ledger
-- ══════════════════════════════════════════════════════════════════════════
-- APPEND-ONLY, like every other record of something that happened. A call that
-- failed is a row, exactly like one that succeeded — the whole point is that
-- "the model was not asked" and "the model was asked and could not answer" are
-- different facts, and neither may hide.
create table cw.model_call (
  call_id      bigserial primary key,
  called_at    timestamptz not null default now(),
  -- WHO CAUSED IT. Bound from the connection by trigger, never from the insert.
  actor        text not null check (btrim(actor) <> ''),
  actor_role   text,
  -- WHAT FOR. A short fixed vocabulary rather than free text: this is a
  -- reporting dimension, and free text makes a reporting dimension useless
  -- within a month. Adding a purpose is a migration, which is correct — a new
  -- place the product asks a model is a decision, not a string.
  purpose      text not null check (purpose in (
    'intake_manifest',      -- AI-3: answers → proposed risks
    'semantic_difference',  -- NC-25: how much did the meaning move
    'risk_exposure')),      -- NC-26: how much risk moved, and which way
  model        text not null,
  model_version text,
  -- 'answered' or 'absent', and an absence carries its reason. The same
  -- vocabulary advisory.py already uses for a judgment, for the same reason.
  outcome      text not null check (outcome in ('answered', 'absent')),
  absent_reason text,
  -- What it cost, when the provider said. Null means the provider did not
  -- report usage — recorded as unknown rather than as zero, because a zero
  -- here would understate spend in exactly the figure somebody budgets from.
  prompt_tokens     int,
  completion_tokens int,
  constraint an_absence_carries_its_reason
    check ((outcome = 'absent') = (absent_reason is not null))
);

comment on table cw.model_call is
  'Every time the product asked a model, and what came back — including the
   times nothing did. The daily cap is counted here; AI-7''s cost reporting and
   the AI-use export read it.';

create index model_call_by_day on cw.model_call (called_at);

create or replace function cw.bind_model_call() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.actor := cw.app_actor();
    new.actor_role := cw.app_role();
    new.called_at := now();
  end if;
  return new;
end $$;

create trigger model_call_bound before insert on cw.model_call
  for each row execute function cw.bind_model_call();

create or replace function cw.model_call_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'the model-call ledger is append-only'
    using errcode = 'restrict_violation';
end $$;

create trigger model_call_no_edit before update or delete on cw.model_call
  for each row execute function cw.model_call_append_only();

-- ══════════════════════════════════════════════════════════════════════════
-- 3 · Today's spend, and whether there is any left
-- ══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER, deliberately. The cap is a property of the SYSTEM, not of
-- the caller: a requester must be told "the budget is spent" whether or not the
-- calls that spent it were theirs, and cw.model_call's read policy scopes a
-- requester to their own rows. A definer answers the true count.
--
-- It answers a NUMBER and a LIMIT, not a permission. Nothing here decides
-- whether a call may proceed — the caller compares them and falls back, in the
-- open, which is the shape ADR-0005 asks for.
create or replace function cw.model_calls_today()
returns table (calls_today bigint, calls_allowed int, tokens_per_call int)
language sql stable
security definer set search_path = cw, pg_temp as $$
  select
    (select count(*) from cw.model_call
      where called_at >= date_trunc('day', now())),
    (select value::int from cw.governance_setting where key = 'ai_calls_per_day'),
    (select value::int from cw.governance_setting where key = 'ai_tokens_per_call');
$$;

comment on function cw.model_calls_today() is
  'How many model calls have been made today, and the two budget numbers. A
   count, never a permission — the caller compares and falls back in the open.';

-- ══════════════════════════════════════════════════════════════════════════
-- 4 · Who may do what
-- ══════════════════════════════════════════════════════════════════════════
alter table cw.model_call enable row level security;

-- READ: the three roles that read the whole record, plus the administrator who
-- pays the bill and changes the budget. A requester sees the calls their own
-- work caused and nobody else's — the same shape as their slice of the chain.
create policy read_scoped on cw.model_call for select using (
  cw.app_role() in ('legal_reviewer', 'legal_admin', 'auditor', 'administrator')
  or (cw.app_role() = 'requester' and model_call.actor = cw.app_actor()));

-- WRITE: the roles whose work causes a call. The auditor is absent — they
-- read the record and cause nothing; the administrator is absent because they
-- do not do contract work. Neither is a judgement about trust: it is that
-- neither has a path that asks a model.
create policy record_the_call on cw.model_call for insert
  with check (cw.app_role() in ('requester', 'legal_reviewer', 'legal_admin'));

revoke all on cw.model_call from public;
grant select on cw.model_call to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
grant insert on cw.model_call to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.model_call_call_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;

revoke all on function cw.model_calls_today() from public;
grant execute on function cw.model_calls_today() to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;

-- Deliberately absent: any grant to cw_viewer, who is outside the process
-- entirely and asks nothing of anybody.
