-- 0065 · Two owner decisions from 2026-08-05, both about honest answers.
--
--   1. NI-4 finished: the AUDITOR may take a copy of the counterparty's
--      document. They could not, because handing a document out is recorded on
--      the chain first and the auditor holds no INSERT on cw.audit_event.
--   2. The ADMINISTRATOR stops being told a negotiation record is empty when it
--      is not. The U13 answer (0024), applied to four more tables.
--
-- They are one migration because they are one principle twice: a role should
-- either be able to do the thing, or be refused in words. What neither of them
-- may do is get a plausible-looking answer that is false.

-- ══════════════════════════════════════════════════════════════════════════
-- 1 · A narrow door onto the chain, for one event
-- ══════════════════════════════════════════════════════════════════════════
-- THE PROBLEM, PRECISELY. GET /negotiations/paper appends
-- `received_document_read` before the bytes leave — documents.py's order, and
-- the only thing that makes a download evidence rather than a convenience. The
-- chain's append policy (0007) names the requester and the two Legal roles;
-- 0013 added the administrator with a policy of its own. The auditor was never
-- admitted, deliberately: they read the whole record and add nothing to it.
--
-- So the auditor, who reads every deal, could not read one document — refused
-- not by a rule about documents but by a rule about the chain.
--
-- WHAT WAS REJECTED. Granting cw_auditor INSERT on cw.audit_event outright.
-- That would let them append ANY event of any type to the record they exist to
-- verify, which is a genuinely bad trade for one download.
--
-- WHAT THIS IS INSTEAD. One function that writes exactly one event type, with
-- every field it carries either derived here or bounded by its own arguments.
-- The auditor gains the ability to record that they took a copy, and nothing
-- else whatsoever.
--
-- SECURITY DEFINER, AND THE ROLE IS NOT TAKEN FROM cw.app_role(). Inside a
-- definer, current_user becomes the owner and cw.app_role() answers null — so
-- reading the role that way would record every download as roleless. The role
-- comes from `current_setting('role')`, the unforgeable SET ROLE the base login
-- selected, in exactly the words cw.waiting_for uses (0041, kept through 0064).
-- A caller cannot lie about it: it is not a session variable they set, it is
-- the database role they are connected as.
create or replace function cw.record_document_read(
  p_negotiation bigint,
  p_round       int,
  p_document    bigint,
  p_sha256      text,
  p_byte_size   bigint,
  p_direction   text
) returns void
language plpgsql security definer set search_path = cw, pg_temp as $$
declare caller_role text := case current_setting('role', true)
  when 'cw_viewer' then 'viewer'
  when 'cw_requester' then 'requester'
  when 'cw_legal_reviewer' then 'legal_reviewer'
  when 'cw_legal_admin' then 'legal_admin'
  when 'cw_auditor' then 'auditor'
  when 'cw_administrator' then 'administrator'
end;
begin
  -- A connection with no mapped application role is the owner, running a
  -- migration or a fixture. It records what it is: null, which is the truthful
  -- answer under U3 and the same thing cw.audit() would have written.
  insert into cw.audit_event
    (actor, actor_role, actor_kind, event_type, subject, payload)
  values (
    cw.app_actor(), caller_role, 'human', 'received_document_read',
    'negotiation:' || p_negotiation::text,
    jsonb_build_object(
      'round_no', p_round,
      'direction', p_direction,
      'document_id', p_document,
      'sha256', p_sha256,
      'byte_size', p_byte_size));
end $$;

comment on function cw.record_document_read(bigint, int, bigint, text, bigint, text) is
  'The one chain entry an auditor may make: that they took a copy of a received
   document. Deliberately not a general append — the event type is fixed here
   and the actor''s role comes from the connection, not from an argument.';

revoke all on function cw.record_document_read(bigint, int, bigint, text, bigint, text)
  from public;
-- The four roles that may read a negotiation round, and therefore the four who
-- may reach the document behind one. NOT the administrator: their read of the
-- negotiation family is being withdrawn below, so a door onto a record they
-- cannot reach would be dead machinery. NOT the viewer, who holds nothing here.
grant execute on function cw.record_document_read(bigint, int, bigint, text, bigint, text)
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- ══════════════════════════════════════════════════════════════════════════
-- 2 · The administrator stops being answered "none" where there are some
-- ══════════════════════════════════════════════════════════════════════════
-- 0013:324-325 grants the administrator SELECT on the four negotiation tables.
-- No policy admits the role — 0011's read_scoped names Legal, the auditor and
-- the owning requester, and nothing added the administrator since. Row-level
-- security therefore FILTERS instead of REFUSING, and the answer is zero rows.
--
-- This is 0024's finding exactly, on four more tables. Its words, which are the
-- reasoning here too: "a grant that admits a role to a table its policies
-- refuse produces a silent empty result, and this schema's whole discipline is
-- that a refusal and an empty result must never look alike."
--
-- NC-08 reported the gap on cw.negotiation_round and left it open, correctly:
-- widening a role's read is an owner decision and never a read package's. The
-- negotiate screens (2026-08-05) widened the SYMPTOM to three reads, and the
-- owner settled it the same day — the same way U13 settled it, by removing the
-- grant rather than the refusal.
--
-- WHAT THIS COSTS, stated rather than buried: nothing today. The administrator
-- holds no negotiation area and no screen asks these tables as that role. What
-- changes is that the day somebody builds one, it gets an answer it can render
-- honestly instead of an empty list that reads as calm.
revoke select on cw.negotiation, cw.negotiation_round,
                cw.negotiation_position, cw.position_movement
  from cw_administrator;

-- The three summary views were never granted to the administrator, so they
-- already refused honestly and are untouched. Stated so the asymmetry does not
-- look like something this migration missed.
