-- 0068 · A model that was never asked is not a call (corrects 0066)
--
-- WHAT WAS WRONG. 0066 built the model-call ledger and the daily cap, and said
-- this above the table, in its own words:
--
--     "the whole point is that 'the model was not asked' and 'the model was
--      asked and could not answer' are different facts, and neither may hide."
--
-- The table it then created has one `outcome` column with two values, and
-- `absent` collapses precisely those two facts into one. `cw.model_calls_today`
-- counts every row with no filter. So the cap — which exists to bound SPEND —
-- is charged for asks that never left the building.
--
-- WHAT THAT COSTS, IN THE SENTENCE A REQUESTER READS. The doorway declines to
-- ask a model in five situations before it dispatches anything: the configured
-- model name is unusable, no key is installed, the library defines no risk
-- categories to choose from, the answers are too large to send, and the
-- provider concurrency limit is already taken. The keyless case is not exotic —
-- it is every development machine and every deployment not yet configured. Each
-- one of those wrote a row and each row was billed, so a system that has never
-- spoken to a provider in its life still runs its allowance to zero. Past that
-- point intake stops saying "no model key is configured" and starts saying
-- "today's model budget is spent (200 of 200 calls)", which is not true. The
-- administrator's cost figures carry the same inflation.
--
-- Verified before this was written: three intakes on a keyless deployment
-- produced three ledger rows and calls_today = 3, with no provider contacted.
--
-- WHAT THIS DOES. Says the third fact out loud rather than leaving it to be
-- inferred, and bills only the rows that reached a provider.
--
-- WHAT THIS DELIBERATELY DOES NOT DO — remove the row. How often the system
-- falls back, and why, is exactly what AI-7 reports on, and a deployment that
-- silently never asks is something an administrator must be able to see. The
-- row stays a fact. It stops being a charge.

select set_config('cw.actor', 'migration-0068-not-asked', false);

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · A third outcome
-- ══════════════════════════════════════════════════════════════════════════
-- Existing rows are all 'answered' or 'absent' and satisfy both widened
-- constraints unchanged, so these validate without rewriting anything — which
-- matters, because cw.model_call is append-only and a migration that had to
-- edit its rows could not.
alter table cw.model_call drop constraint model_call_outcome_check;
alter table cw.model_call add constraint model_call_outcome_check
  check (outcome in ('answered', 'absent', 'not_asked'));

-- A NOT-ASKED ROW STILL CARRIES ITS REASON, and that is the whole value of it.
-- "The model was not asked" with no reason beside it is the silent degradation
-- ADR-0005 exists to prevent; the reason is what the screen prints and what an
-- administrator reads six months later.
alter table cw.model_call drop constraint an_absence_carries_its_reason;
alter table cw.model_call add constraint an_absence_carries_its_reason
  check ((outcome <> 'answered') = (absent_reason is not null));

comment on column cw.model_call.outcome is
  'answered — a provider was asked and replied usably. absent — a provider was
   asked and no usable answer came back. not_asked — the doorway declined to
   ask before dispatching anything, and absent_reason says why. Only the first
   two are billed against the daily cap; see cw.model_calls_today().';

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · The cap counts spend, not decisions
-- ══════════════════════════════════════════════════════════════════════════
-- The only change is the filter. Everything else — SECURITY DEFINER so a
-- requester is told the true system-wide count, a number rather than a
-- permission — is 0066's reasoning and still holds.
create or replace function cw.model_calls_today()
returns table (calls_today bigint, calls_allowed int, tokens_per_call int)
language sql stable
security definer set search_path = cw, pg_temp as $$
  select
    (select count(*) from cw.model_call
      where called_at >= date_trunc('day', now())
        -- A call the doorway declined to make cost nothing and must not be
        -- billed. Remove this line and a keyless deployment spends a budget it
        -- never had. A mutation row watches it.
        and outcome <> 'not_asked'),
    (select value::int from cw.governance_setting where key = 'ai_calls_per_day'),
    (select value::int from cw.governance_setting where key = 'ai_tokens_per_call');
$$;

comment on function cw.model_calls_today() is
  'How many model calls have actually been made today, and the two budget
   numbers. Rows recorded as not_asked are excluded: they reached no provider
   and cost nothing. A count, never a permission — the caller compares and
   falls back in the open.';

revoke all on function cw.model_calls_today() from public;
grant execute on function cw.model_calls_today() to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;
