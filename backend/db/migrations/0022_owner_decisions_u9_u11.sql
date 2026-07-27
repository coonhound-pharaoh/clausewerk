-- 0022 · Three owner decisions, settled 2026-07-27.
--
-- U9  · Destruction is never automatic, and the authority is the Administrator's.
-- U10 · Replacing a clause never rewrites wording already committed to.
-- U11 · The Administrator may read the clause library.
--
-- All three amend or extend decisions already recorded, so each says which.

-- ══════════════════════════════════════════════════════════════════════════
-- U11 · The Administrator may read the library (settles docs/open-questions §9a)
-- ══════════════════════════════════════════════════════════════════════════
--
-- U5 settled the Administrator as content-visible and content-powerless, and
-- said never to describe it as content-blind. Against the clause library it WAS:
-- 0002 and 0003 granted select to the five roles that existed then, 0013 created
-- the Administrator, and nobody revisited the list. The role read executed
-- agreements perfectly well, so the two halves of "contract content" disagreed.
--
-- THE GAP WAS THE GRANT, NOT THE POLICY, and that is why this is four lines. The
-- read policies on these tables are already `cw.app_role() is not null` — they
-- admit an Administrator and always did. The connection was refused before any
-- policy was consulted, for want of a table privilege. Nothing below widens
-- anybody else's reach.
grant select on cw.clause, cw.clause_version, cw.category, cw.supersession,
                cw.clause_version_state, cw.selectable_clause, cw.coverage_gap,
                cw.library_entry
  to cw_administrator;

grant select on cw.ladder, cw.ladder_rung, cw.ladder_rung_state,
                cw.ladder_health, cw.ladder_board
  to cw_administrator;

-- Still no write of any kind on the library. U5's boundary was WRITE and
-- JUDGEMENT, not sight, and U11 relaxes only the sight half — exactly as U5
-- itself relaxed the proposal.

-- ══════════════════════════════════════════════════════════════════════════
-- U9 · Destruction never happens by itself, and only the Administrator may do it
-- ══════════════════════════════════════════════════════════════════════════
--
-- THE OWNER'S WORDS: "Auto-record-destruction should never happen. Only users
-- with authorization to delete records should have such authority. That should
-- go to Admin for now."
--
-- TWO SEPARATE THINGS, and the first was already true. Nothing in this schema
-- destroys anything on a timer: `cw.retention_destroy()` is a function somebody
-- must call, `cw.retention_due` is a LIST of what has come due and nothing acts
-- on it, and the nudge is a nudge. There is no scheduler, no trigger and no job.
-- U9 turns that from a fact about the current code into a rule, and
-- `governance.test.mjs` now asserts it: no trigger and no default anywhere in
-- the schema calls the destroy function.
--
-- The second half MOVES the authority. Execute was granted to cw_legal_admin;
-- it now belongs to cw_administrator, and legal_admin's is REVOKED rather than
-- held jointly — the same shape as U7's checkpoint move, and for the same
-- reason: two roles holding an irreversible act means neither is accountable
-- for it.
--
-- THIS AMENDS U5, and the amendment should be stated rather than absorbed. U5
-- said the Administrator writes no content and decides nothing. Destroying a
-- record at the end of its life is a write, and a final one. The owner has
-- placed records custody with the Administrator deliberately: it is the role
-- that keeps the machine, and retention is machine-keeping rather than a
-- judgement about what a contract should say. The boundary that survives is
-- that the Administrator still cannot author, alter or approve any wording, and
-- still holds no vote in any workflow. Describe the role now as
-- content-visible, content-powerless, and custodian of the record's end of life.
revoke execute on function cw.retention_destroy(text, text) from cw_legal_admin;
grant  execute on function cw.retention_destroy(text, text) to cw_administrator;

-- The Administrator needs to see what has come due in order to act on it, and to
-- see the holds that suspend it — a destruction refused for a reason the actor
-- cannot see is a refusal nobody can act on.
grant select on cw.agreement_retention, cw.legal_hold to cw_administrator;
grant execute on function cw.agreement_under_hold(text) to cw_administrator;

comment on function cw.retention_destroy(text, text) is
  'Records the destruction of an agreement at the end of its retention. Refuses '
  'while any legal hold is open, naming the matters, and refuses before the due '
  'date. NEVER runs by itself — there is no scheduler, trigger or job anywhere '
  'that calls it (owner decision U9, 2026-07-27); a person with the authority '
  'must ask. That person is the Administrator and nobody else.';


-- ── The retention tile's copy, corrected for U9 ───────────────────────────
-- The tile told the reader "actioned by Legal admin, who alone may destroy".
-- U9 moved that authority to the Administrator, so the sentence became false in
-- the most awkward possible way: it tells the one person who CAN act that they
-- cannot. A screen that misnames whose act something is does the same damage as
-- a document promising a control the code does not enforce — it just does it to
-- the person's face.
--
-- REDEFINED IN FULL rather than patched, because a view has to be. Only the one
-- phrase differs from 0013's definition; the mutation that guards these tiles
-- keys on the GRANT statement, which is not repeated here, so it stays live.
create or replace view cw.health_summary as
select 'audit chain'      as tile,
       (select chain_state from cw.health_chain) as state,
       (select chain_ran_at from cw.health_chain) as as_of,
       (select chain_detail from cw.health_chain) as detail
union all
select 'anchor',
       (select anchor_state from cw.health_chain),
       (select anchor_ran_at from cw.health_chain),
       (select anchor_detail from cw.health_chain)
union all
select 'checkpoints',
       case when not exists (select 1 from cw.audit_checkpoint) then 'never_ran'
            when exists (select 1 from cw.health_checkpoint where overdue
                          and checkpoint_id = (select max(checkpoint_id)
                                               from cw.audit_checkpoint))
              then 'fail' else 'pass' end,
       (select max(taken_at) from cw.audit_checkpoint),
       case when not exists (select 1 from cw.audit_checkpoint)
            then 'no checkpoint has ever been taken' end
union all
select 'signed documents',
       case when (select documents_stored from cw.health_document) = 0 then 'never_ran'
            when (select documents_mismatched from cw.health_document) > 0 then 'fail'
            when (select documents_never_checked from cw.health_document) > 0 then 'never_ran'
            else 'pass' end,
       (select last_checked_at from cw.health_document),
       case when (select documents_never_checked from cw.health_document) > 0
            then format('%s of %s stored documents have never been checked',
                        (select documents_never_checked from cw.health_document),
                        (select documents_stored from cw.health_document)) end
union all
select 'rebuild spot-check',
       (select state from cw.health_rebuild),
       (select ran_at from cw.health_rebuild),
       (select detail from cw.health_rebuild)
union all
select 'retention due',
       -- Not a check that passes or fails: due-ness is a fact, not a fault, and
       -- acting on it is Legal's. 'pass' would be wrong and 'fail' would be
       -- worse — it would read as the system accusing itself of a defect for
       -- doing exactly what it is meant to do.
       case when (select count(*) from cw.retention_due) = 0 then 'none due'
            else 'due' end,
       now(),
       case when (select count(*) from cw.retention_due) > 0
            then format('%s agreement(s) past their retention date. Visible '
                        'here; actioned by the Administrator, who alone may destroy',
                        (select count(*) from cw.retention_due)) end;;

-- ══════════════════════════════════════════════════════════════════════════
-- U10 · Superseding wording never rewrites what a contract already carries
-- ══════════════════════════════════════════════════════════════════════════
--
-- THE OWNER'S WORDS: "replacing a clause must create a new version in the
-- system but never update wording on signed and in-flight contracts, it should
-- flag them as using obsolete language."
--
-- THE FIRST TWO PARTS ARE BUILT AND HAVE BEEN SINCE 0002.
--   · A clause version is immutable: `cw.clause_version_immutable()` refuses any
--     edit to body, title, rationale, reviewer, dates, provenance or origin, and
--     refuses un-retiring. Replacement is `cw.supersession`, which mints a NEW
--     version and keeps the old one with its history intact.
--   · A signed agreement is frozen: `cw.executed_frozen()` refuses update and
--     delete on the executed agreement and its documents. Superseding a clause
--     cannot reach a contract that was already signed, because nothing can.
--
-- THE THIRD PART — flagging — was HALF built, and U10 completes it.
--   · SIGNED contracts already have `cw.agreement_drift`: "the library has moved
--     on from what this contract carries", which is reporting only and never
--     implies the contract changed.
--   · IN-FLIGHT contracts had nothing. A deal still negotiating carries clause
--     versions chosen at run time, and if one is superseded, retired or expires
--     while the negotiation is open, nobody was told. That is the worse of the
--     two cases: a signed contract's wording is settled and the drift report is
--     input to a renewal, whereas an in-flight one can still be corrected — and
--     is the one where obsolete language would otherwise be signed BY MISTAKE.
create or replace view cw.run_drift as
select r.run_id,
       r.agreement_id,
       a.status                as agreement_status,
       d.clause_id,
       d.version               as chosen_version,
       s.successor_version,
       s.reason                as superseded_reason,
       cur.state               as current_state,
       cur.expires_on,
       cur.days_to_expiry
from cw.run r
join cw.agreement a on a.agreement_id = r.agreement_id
join cw.run_decision d on d.run_id = r.run_id and d.clause_id is not null
left join cw.supersession s
  on s.clause_id = d.clause_id and s.predecessor_version = d.version
left join cw.clause_version_state cur
  on cur.clause_id = d.clause_id and cur.version = d.version
-- Only deals that have NOT been signed. Once executed, the wording is settled
-- and cw.agreement_drift is the right report — this one exists to catch it
-- while there is still time to choose differently.
where a.status <> 'executed'
  -- The same test cw.agreement_drift uses: superseded, or no longer active.
  and (s.id is not null or cur.state <> 'active')
  -- Scoped as cw.agreement is: a requester sees their own deals. Stated here
  -- because a view does not inherit the policy underneath it — the mistake 0017
  -- and 0019 both paid for.
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and cw.owns_agreement(r.agreement_id)));

comment on view cw.run_drift is
  'In-flight deals carrying wording the library has moved on from — superseded, '
  'retired or expired since the run chose it. REPORTING ONLY: nothing here '
  'changes a run or a contract, and superseding a clause never rewrites what a '
  'deal already carries (owner decision U10, 2026-07-27). The point is to catch '
  'obsolete language while there is still time to choose differently.';

revoke all on cw.run_drift from public;
grant select on cw.run_drift to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor, cw_administrator;

-- ══════════════════════════════════════════════════════════════════════════
-- The three decisions, held where the code can see them
-- ══════════════════════════════════════════════════════════════════════════
-- Same discipline as U1–U8: a decision recorded only in a document gets read
-- once; a decision recorded here is met by whoever next touches what it governs.
insert into cw.governance_setting
  (key, value, kind, is_owner_decision, decided, decided_by, rationale)
values
  ('destruction_is_never_automatic', 'true', 'owner_decision', true, true, 'owner',
   'U9 — SETTLED 2026-07-27 by the owner. Records are NEVER destroyed by a '
   'timer, a job or a trigger. Destruction is an act a person with the authority '
   'performs, and the system''s part is to show what has come due and to refuse '
   'when a hold is open. Nothing in the schema calls cw.retention_destroy(); a '
   'test asserts that and fails if anything ever does.'),

  ('destruction_authority', 'administrator', 'owner_decision', true, true, 'owner',
   'U9 — SETTLED 2026-07-27 by the owner. The authority to destroy a record at '
   'the end of its retention MOVES from legal_admin to the administrator, and '
   'legal_admin''s is revoked rather than held jointly — two roles holding an '
   'irreversible act means neither is accountable for it. This AMENDS U5: the '
   'Administrator now performs one content-affecting write. The boundary that '
   'survives is that it still cannot author, alter or approve any wording, and '
   'holds no vote in any workflow. "For now" is the owner''s word — this is the '
   'role that keeps the machine, and records custody is machine-keeping.'),

  ('supersession_never_rewrites_a_contract', 'true', 'owner_decision', true, true, 'owner',
   'U10 — SETTLED 2026-07-27 by the owner. Replacing a clause mints a NEW '
   'version in the library and never touches wording already committed to. A '
   'signed contract is frozen and cannot be reached; an in-flight deal keeps the '
   'version its run chose. Both are FLAGGED as carrying obsolete language rather '
   'than quietly corrected — cw.agreement_drift for signed, cw.run_drift for '
   'in-flight. Reporting, never rewriting: past approvals were given against '
   'that exact wording, and changing it would silently change what was agreed.'),

  ('administrator_may_read_library', 'true', 'owner_decision', true, true, 'owner',
   'U11 — SETTLED 2026-07-27 by the owner, settling open-questions §9a. The '
   'Administrator may read the clause library and the ladders, as it already '
   'read executed agreements. U5 said the role is content-visible and must never '
   'be called content-blind; against the library it was, because 0002 and 0003 '
   'predate the role and their grants were never revisited. The gap was the '
   'GRANT, not the policy — the read policies always admitted it. No write of '
   'any kind is added here.');
