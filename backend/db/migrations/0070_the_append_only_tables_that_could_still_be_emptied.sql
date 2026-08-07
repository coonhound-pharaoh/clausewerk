-- 0070 · The append-only tables that could still be emptied in one statement
--
-- 0001 built this defence and wrote down why, and this migration is nothing but
-- the sentence it already contains applied to the tables that never named it:
--
--     "A schema that raises loudly on `delete from cw.clause_version` and
--      empties the same table without complaint on `truncate cw.clause_version`
--      does not have an immutability guarantee; it has an immutability habit."
--
-- TRUNCATE is not a DELETE. Row triggers never fire, ON DELETE rules never
-- apply, and the table is emptied by one statement that leaves no per-row
-- trace. The defence has to be STATEMENT-level, because that is the only kind
-- TRUNCATE fires — and 0001 made `cw.no_truncate()` shared precisely so that
-- "a table added later inherits the story by NAMING it rather than by
-- re-deriving it".
--
-- Thirty-six tables name it. These twenty-one never did. Among them are the
-- record of who holds which role, the ledger of what the model was asked and
-- what it cost, and the whole override apparatus — every authorised departure
-- from a legal objection, and who socialised it to whom.
--
-- HOW EXPOSED THIS WAS, STATED HONESTLY RATHER THAN DRESSED UP: not at all,
-- today. No application role holds TRUNCATE on any of these; it is owner-only
-- and these tables are owned by the migration account. This is a defence
-- against operator and maintenance-script error — which is exactly what it is
-- on the thirty-six tables that already had it. It is not claimed as more.
--
-- HOW THE LIST WAS ARRIVED AT, because the obvious query gives the wrong
-- answer twice. Counting tables with any update/delete trigger gives 66 — but a
-- BINDING trigger fires on update without forbidding it. Counting trigger
-- functions containing a raise also gives 66 — but a CONDITIONAL raise guards
-- one column rather than the row. Only requiring an UNCONDITIONAL raise gives a
-- number that means what it says: 57 genuinely append-only tables, 21 of them
-- unguarded against TRUNCATE.
--
-- Nothing in the repository truncates any of these. Every `truncate` in the
-- tree is a test asserting the guard refuses.

select set_config('cw.actor', 'migration-0070-no-truncate', false);

create trigger account_no_truncate before truncate on cw.account
  execute function cw.no_truncate();
create trigger agreement_attorney_no_truncate before truncate on cw.agreement_attorney
  execute function cw.no_truncate();
create trigger agreement_share_no_truncate before truncate on cw.agreement_share
  execute function cw.no_truncate();
create trigger governance_setting_no_truncate before truncate on cw.governance_setting
  execute function cw.no_truncate();
create trigger integrity_check_no_truncate before truncate on cw.integrity_check
  execute function cw.no_truncate();
create trigger model_call_no_truncate before truncate on cw.model_call
  execute function cw.no_truncate();
create trigger notice_no_truncate before truncate on cw.notice
  execute function cw.no_truncate();
create trigger notice_acknowledgement_no_truncate before truncate on cw.notice_acknowledgement
  execute function cw.no_truncate();
create trigger notification_address_no_truncate before truncate on cw.notification_address
  execute function cw.no_truncate();
create trigger obligation_template_no_truncate before truncate on cw.obligation_template
  execute function cw.no_truncate();
create trigger override_finding_no_truncate before truncate on cw.override_finding
  execute function cw.no_truncate();
create trigger override_request_no_truncate before truncate on cw.override_request
  execute function cw.no_truncate();
create trigger override_socialisation_no_truncate before truncate on cw.override_socialisation
  execute function cw.no_truncate();
create trigger override_watcher_no_truncate before truncate on cw.override_watcher
  execute function cw.no_truncate();
create trigger required_approver_no_truncate before truncate on cw.required_approver
  execute function cw.no_truncate();
create trigger role_grant_no_truncate before truncate on cw.role_grant
  execute function cw.no_truncate();
create trigger signature_envelope_no_truncate before truncate on cw.signature_envelope
  execute function cw.no_truncate();
create trigger sow_override_no_truncate before truncate on cw.sow_override
  execute function cw.no_truncate();
create trigger sow_override_approval_no_truncate before truncate on cw.sow_override_approval
  execute function cw.no_truncate();
create trigger sow_override_settlement_no_truncate before truncate on cw.sow_override_settlement
  execute function cw.no_truncate();
create trigger ticket_claim_no_truncate before truncate on cw.ticket_claim
  execute function cw.no_truncate();
