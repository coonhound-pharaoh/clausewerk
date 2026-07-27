-- 0020 · A deal's birth is now on the chain. So is a category's.
--
-- WHAT WAS MISSING. Every later move of an agreement is recorded —
-- `agreement_status_changed`, `agreement_executed`, `agreement_shared`,
-- `negotiation_opened`, `renewal_opened`, `legal_hold_opened`, and the rest —
-- but the agreement's CREATION was not. An auditor could read the whole life of
-- a deal except the moment it started and who started it.
--
-- That `agreement_status_changed` exists while `agreement_opened` did not is the
-- tell: this is an omission, not a decision. Nothing in memory.md, the ADRs or
-- the architecture documents says a deal opening should go unrecorded, and the
-- comment on the status trigger argues the exact opposite — "this deal is
-- terminated" is not an answer an auditor can use, and neither is "this deal
-- exists".
--
-- WHY IT MATTERS MORE THAN AN ORDINARY GAP. `cw.agreement.requester` is the
-- field `cw.owns_agreement()` reads, and `cw.owns_agreement()` is what decides a
-- requester's access to their own deals, their runs, their overrides, their
-- reading room and — since 0019 — six more views. Every scoping decision in the
-- system for that role hangs off one column that had no record of who set it or
-- when. The row could be created and nothing anywhere would say by whom.
--
-- Found by the Python session while writing an attribution test for WP-P3: they
-- needed two audited acts, reached for the most obvious one in the system, and
-- discovered it was not audited. Reported rather than acted on, because what
-- belongs on the chain is a schema judgement — which is the right call and the
-- reason this file exists rather than a doorway patch.
--
-- ON SAFETY, because this adds a trigger to two heavily-written tables. The
-- audit insert cannot refuse: cw.app_actor() falls back to 'unattributed' rather
-- than raising, and both roles that may insert here — cw_requester and
-- cw_legal_admin for agreements, cw_legal_admin for categories — already hold
-- INSERT on cw.audit_event and satisfy the `audit_append` policy. Migrations and
-- seeding run as the owner, which row-level security exempts, and their rows
-- carry a null actor_role, which is the truthful answer under U3.

-- ── A deal is opened ──────────────────────────────────────────────────────
-- AFTER insert, not BEFORE: the chain should record a row that actually landed.
-- A BEFORE trigger writes the audit event first and would leave a record of a
-- deal that a later constraint refused.
create or replace function cw.audit_agreement_opened() returns trigger
language plpgsql as $$
begin
  perform cw.audit('agreement_opened', new.agreement_id,
    jsonb_build_object(
      'counterparty', new.counterparty,
      -- The field every later access decision for this role reads. Recording it
      -- here means "why can this person see this deal?" has an answer on the
      -- chain rather than only in the current state of the row.
      'requester',    new.requester,
      'status',       new.status));
  return null;
end $$;

create trigger audit_agreement_opened
  after insert on cw.agreement
  for each row execute function cw.audit_agreement_opened();

comment on function cw.audit_agreement_opened() is
  'Records the opening of a deal, naming the requester the row is scoped to. '
  'Added in 0020: every later move of an agreement was audited and its creation '
  'was not.';

-- ── A category is created ─────────────────────────────────────────────────
-- Smaller, and worth having for the same reason. A category is the spine of
-- coverage — cw.coverage_gap is defined over the category list, and every
-- clause, ladder and conflict rule hangs off a category key. Adding one changes
-- what the system considers complete, and that is an act with consequences.
create or replace function cw.audit_category_created() returns trigger
language plpgsql as $$
begin
  perform cw.audit('category_created', new.key,
    jsonb_build_object('label', new.label, 'short', new.short));
  return null;
end $$;

create trigger audit_category_created
  after insert on cw.category
  for each row execute function cw.audit_category_created();

comment on function cw.audit_category_created() is
  'Records the creation of a clause category. Adding one changes what '
  'cw.coverage_gap considers covered, so it is an act rather than reference '
  'data being loaded.';
