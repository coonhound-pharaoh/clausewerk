-- 0028 · Nobody verifies their own request (NC-05)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-27. At the
-- start of this work the highest present was 0026, so this file was first
-- written as 0027. The directory was listed again while the checks were running
-- and another package's 0027 — the negotiation view scoping — had landed in the
-- meantime, so this file was renumbered to 0028, the next free number on that
-- re-listing. Nothing was overwritten; migrations are append-only history.
--
-- ── What was missing ────────────────────────────────────────────────────────
-- cw.verify_review_ticket() held exactly one authorisation check: the actor's
-- role had to be legal_reviewer or legal_admin (0008_review_queue.sql:513-516,
-- carried forward unchanged by 0009_clause_origin.sql). It never consulted
-- cw.review_ticket.opened_by. So one person holding a Legal role could open a
-- request for new contract language and then approve their own request, and the
-- record would show a verified ticket like any other.
--
-- The refusal belongs here, in the function, beside the role check — not in the
-- doorway. A caller who reaches the database by any other path must meet the
-- same wall.
--
-- ── How the rule is bounded ─────────────────────────────────────────────────
-- Refuse when the person deciding is the person who opened the ticket, UNLESS
-- the opener is Legal. That carve-out is deliberate: a Legal reviewer opening a
-- ticket and deciding it is Legal doing its own work, and the review queue has
-- always been Legal's queue. What the rule stops is the requester's own ask
-- coming back approved by the requester.
--
-- "Is the opener Legal?" is answered by cw.effective_role — the system's own
-- authority on what a person may do right now — and by nothing else. If the
-- opener has no effective role there (no account, no live grant, revoked, or an
-- uncountersigned Legal grant), the system cannot show the opener was Legal, and
-- the conservative answer is the refusal. A person the system does not know is
-- not a person it can vouch for.
--
-- Both the connection's actor and the reviewer named on the call are compared,
-- because either one alone can be routed around: the doorway passes the
-- connection's actor as the reviewer, so a mismatch between them is itself a
-- reason to look twice.
--
-- Everything else in the function is carried forward from 0009 byte for byte.
-- Nothing about minting, origin derivation or the rowcount check changes.

create or replace function cw.verify_review_ticket(
  p_ticket_id     bigint,
  p_body          text,
  p_new_clause_id text,
  p_title         text,
  p_rationale     text,
  p_reviewer      text,
  p_expires_on    date,
  p_origin        text default 'legal_authored',
  p_note          text default null
) returns text
language plpgsql security invoker as $$
declare t cw.review_ticket%rowtype; v int; eff_origin text;
begin
  if cw.app_role() not in ('legal_reviewer','legal_admin') then
    raise exception 'only Legal may verify a review ticket'
      using errcode = 'insufficient_privilege';
  end if;

  select * into t from cw.review_ticket where ticket_id = p_ticket_id;
  if not found then
    raise exception 'no such review ticket: %', p_ticket_id;
  end if;

  -- NC-05. The second authorisation check, at content level: who opened this.
  if t.opened_by is not null
     and (t.opened_by = cw.app_actor() or t.opened_by = p_reviewer)
     and not exists (
       select 1 from cw.effective_role e
       where e.person = t.opened_by
         and e.role in ('legal_reviewer','legal_admin'))
  then
    raise exception
      'review ticket % was opened by %, who may not also decide it; a request '
      'for new contract language is approved by somebody other than the person '
      'who asked for it', p_ticket_id, t.opened_by
      using errcode = 'insufficient_privilege';
  end if;

  if t.state <> 'pending' then
    raise exception 'review ticket % is already %', p_ticket_id, t.state
      using errcode = 'restrict_violation';
  end if;

  eff_origin := case when t.draft_id is not null then 'ai_drafted'
                     else coalesce(p_origin, 'legal_authored') end;

  select coalesce(max(version), 0) + 1 into v
  from cw.clause_version where clause_id = p_new_clause_id;

  update cw.review_ticket set
    state            = 'verified',
    approved_text    = p_body,
    decided_by       = p_reviewer,
    decided_on       = now(),
    decision_note    = p_note,
    minted_clause_id = p_new_clause_id,
    minted_version   = v
  where ticket_id = p_ticket_id;

  if not found then
    raise exception
      'review ticket % was not moved; the verifying role holds no UPDATE path '
      'to it', p_ticket_id using errcode = 'insufficient_privilege';
  end if;

  perform cw.mint_clause_version(
    p_clause_id    => p_new_clause_id,
    p_category_key => t.category_key,
    p_severity     => t.severity,
    p_title        => p_title,
    p_body         => p_body,
    p_rationale    => p_rationale,
    p_citations    => array['Policy-REVIEW-' || p_ticket_id],
    p_reviewer     => p_reviewer,
    p_expires_on   => p_expires_on,
    p_provenance   => 'reviewed',
    p_origin       => eff_origin,
    p_source_ticket_id => p_ticket_id);

  return p_new_clause_id || '@v' || v;
end $$;

comment on function cw.verify_review_ticket(bigint, text, text, text, text, text, date, text, text) is
  'Verifies a review ticket and mints the clause version it approved. Two '
  'authorisation checks: the decider holds a Legal role, and the decider is not '
  'the person who opened the ticket unless that person is themselves Legal.';

-- ── Reverting this migration ────────────────────────────────────────────────
-- One follow-on migration restoring the prior body, quoted here verbatim as it
-- stood after 0009_clause_origin.sql:189-255. Nothing else changed.
--
-- create or replace function cw.verify_review_ticket(
--   p_ticket_id     bigint,
--   p_body          text,
--   p_new_clause_id text,
--   p_title         text,
--   p_rationale     text,
--   p_reviewer      text,
--   p_expires_on    date,
--   p_origin        text default 'legal_authored',
--   p_note          text default null
-- ) returns text
-- language plpgsql security invoker as $$
-- declare t cw.review_ticket%rowtype; v int; eff_origin text;
-- begin
--   if cw.app_role() not in ('legal_reviewer','legal_admin') then
--     raise exception 'only Legal may verify a review ticket'
--       using errcode = 'insufficient_privilege';
--   end if;
--
--   select * into t from cw.review_ticket where ticket_id = p_ticket_id;
--   if not found then
--     raise exception 'no such review ticket: %', p_ticket_id;
--   end if;
--   if t.state <> 'pending' then
--     raise exception 'review ticket % is already %', p_ticket_id, t.state
--       using errcode = 'restrict_violation';
--   end if;
--
--   -- Derived, not accepted. A draft-backed ticket is ai_drafted whatever the
--   -- caller passes, so the answer to "how much of the library began as an AI
--   -- draft?" cannot be reduced by a parameter.
--   eff_origin := case when t.draft_id is not null then 'ai_drafted'
--                      else coalesce(p_origin, 'legal_authored') end;
--
--   select coalesce(max(version), 0) + 1 into v
--   from cw.clause_version where clause_id = p_new_clause_id;
--
--   update cw.review_ticket set
--     state            = 'verified',
--     approved_text    = p_body,
--     decided_by       = p_reviewer,
--     decided_on       = now(),
--     decision_note    = p_note,
--     minted_clause_id = p_new_clause_id,
--     minted_version   = v
--   where ticket_id = p_ticket_id;
--
--   if not found then
--     raise exception
--       'review ticket % was not moved; the verifying role holds no UPDATE path '
--       'to it', p_ticket_id using errcode = 'insufficient_privilege';
--   end if;
--
--   perform cw.mint_clause_version(
--     p_clause_id    => p_new_clause_id,
--     p_category_key => t.category_key,
--     p_severity     => t.severity,
--     p_title        => p_title,
--     p_body         => p_body,
--     p_rationale    => p_rationale,
--     p_citations    => array['Policy-REVIEW-' || p_ticket_id],
--     p_reviewer     => p_reviewer,
--     p_expires_on   => p_expires_on,
--     p_provenance   => 'reviewed',
--     p_origin       => eff_origin,
--     p_source_ticket_id => p_ticket_id);
--
--   return p_new_clause_id || '@v' || v;
-- end $$;
