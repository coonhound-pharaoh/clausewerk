-- 0019 · The override views were handing every request to everybody.
--
-- WHAT THIS FIXES, and it is not a refinement.
--
-- `cw.override_request` has a per-person read policy. `cw.override_status` and
-- `cw.override_passes` are views over it, they carry no scoping of their own,
-- and `select` on both is granted to all six roles. A view runs with its
-- OWNER's rights, and the owner ran the migrations and is exempt from row-level
-- security — so the policy is not consulted at all and both views hand back
-- every row.
--
-- OBSERVED, on a seeded database with two requests owned by two different
-- requesters, not argued:
--
--   asked by                       override_request   override_status   override_passes
--   a requester owning 1 of 2             1                  2                 —
--   a viewer told about nothing           0                  2                 1*
--
--   * once one finding is approved and socialised. Before that the view is
--     empty for everyone, which is why this one hides: it filters on `decision`,
--     not on who is asking, so it looks correctly empty right up until the first
--     approval lands.
--
-- Both leak `justification` — the requester's own words about why a commercial
-- deadline should override a legal finding. That is the most sensitive free text
-- in the system and it was readable by any viewer in it.
--
-- THE VIEWER CASE IS THE SHARP ONE. ADR-0008 created that role so a contract
-- could be shown to somebody without giving them a way in. This gave them the
-- negotiating position of every deal in the system.
--
-- HOW IT WAS FOUND, because the route matters more than the bug. The Python
-- session was porting the read endpoints and checked what the views underneath
-- them actually return, prompted by the note this repository already carries
-- about views not inheriting policies (handoff 07 §5.1). They reported
-- `override_status`. `override_passes` was found by checking whether the same
-- shape appeared elsewhere in the same file — it did. THE SECOND ONE IS THE
-- LESSON: a leak of this class is a pattern, not an incident, and the right
-- response to finding one is to look for its siblings rather than to fix it.
--
-- This is the THIRD instance. `0017` shipped with the same bug in the reading
-- room and its own header explains it at length. A note in a file is evidently
-- not enough to stop the next one, so `views-are-not-policies.test.mjs` now
-- holds an inventory that fails when an unreviewed view reaches a viewer.
--
-- WHY NOT `security_invoker = true`. Same reason as `0017`: it evaluates the
-- view as the caller, who then needs SELECT on every joined table. A viewer
-- holds none on `cw.override_request`, so the fix would turn a leak into
-- "permission denied" for the roles the views exist for. Widening those grants
-- to compensate would open more than the view.
--
-- So the scoping goes IN THE VIEW, stated in the same words as the policy. Two
-- expressions of one rule is a real cost — they can drift — and the suite is
-- what holds them together.

-- ── The requester's own view of where a request has got to ────────────────
-- Column list unchanged: `create or replace view` requires it, and the screens
-- and the ported read endpoint both select from it by name.
create or replace view cw.override_status as
select r.request_id, r.run_id, r.agreement_id, r.requested_by, r.requested_at,
       r.state, r.justification, r.commercial_pressure,
       s.socialised_at, s.window_closes, s.notified_count,
       (s.window_closes is not null and now() >= s.window_closes) as window_closed,
       (select count(*) from cw.override_finding f
         where f.request_id = r.request_id)::int as findings,
       (select count(*) from cw.override_finding f
         where f.request_id = r.request_id and f.decision is not null)::int as decided,
       (select count(*) from cw.override_finding f
         where f.request_id = r.request_id and f.decision = 'approved')::int as approved
from cw.override_request r
left join cw.override_socialisation s on s.request_id = r.request_id
-- The same three branches as `read_scoped` on cw.override_request, in the same
-- order and the same words, so a reader can diff them by eye.
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and r.requested_by = cw.app_actor())
   or (cw.app_role() = 'viewer' and cw.was_notified(r.request_id, cw.app_actor()));

comment on view cw.override_status is
  'Where an override request has got to. Scoped in this view''s WHERE clause, '
  'in the same words as read_scoped on cw.override_request, because a view runs '
  'with its owner''s rights and does NOT inherit the policy underneath it.';

-- ── What the gate actually sees ───────────────────────────────────────────
-- THE LOAD-BEARING VIEW, and the reason the scoping here needed checking rather
-- than copying: cw.record_override_gate() consults this view and is SECURITY
-- INVOKER, so scoping the view also scopes the gate check.
--
-- That is correct, and it tightens one thing deliberately. The function is
-- executable by cw_requester, cw_legal_reviewer and cw_legal_admin. Under the
-- branches below a requester still opens the gate on their OWN request, and
-- Legal still opens it on any — but a requester can no longer open a gate on
-- somebody ELSE'S approved finding, which the unscoped view allowed. Nothing
-- should have been doing that; it is recorded here because it is a behaviour
-- change and not only a leak fix.
create or replace view cw.override_passes as
select f.request_id, r.run_id, r.agreement_id, f.finding_ref, f.severity,
       f.decided_by, f.decided_at, r.justification
from cw.override_finding f
join cw.override_request r on r.request_id = f.request_id
join cw.override_socialisation s on s.request_id = f.request_id
where f.decision = 'approved'
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and r.requested_by = cw.app_actor())
       or (cw.app_role() = 'viewer' and cw.was_notified(r.request_id, cw.app_actor())));

comment on view cw.override_passes is
  'The findings an approval actually lets past, one row each. A request being '
  'approved overall passes nothing by itself. Scoped in the WHERE clause for '
  'the same reason as cw.override_status — and note cw.record_override_gate() '
  'reads this view as the caller, so this scoping is also the gate''s.';

-- ══════════════════════════════════════════════════════════════════════════
-- THE SIBLINGS, and the reason this file is longer than the bug report
-- ══════════════════════════════════════════════════════════════════════════
--
-- Fixing the two reported views raised the obvious question: how many others
-- have this shape? The answer was found by asking the catalogue rather than by
-- reading, and it is FIVE MORE. Two of them leak on seeded data today:
--
--   A viewer who has been shown NOTHING, with two signed agreements present:
--
--     cw.executed_agreement (the policy)  ....  0   ← correct, 0017 did its job
--     cw.reading_room       (scoped)      ....  0   ← correct
--     cw.agreement_chain                  ....  2   ← every contract, with
--                                                     counterparty, filename
--                                                     and document hash
--     cw.execution_evidence_gap           ....  2   ← every contract, plus
--                                                     which evidence it is
--                                                     missing
--
-- `cw.agreement_chain` IS THE READING-ROOM HOLE REOPENED. 0017 narrowed the
-- policies on the four tables that carry a signed contract and closed the view
-- it had just written — but three views in 0006 had been selecting from those
-- same tables since long before, and nothing pointed at them. The hole was
-- closed at the front door and left open at the side.
--
-- `cw.execution_evidence_gap` is worse than it looks. It is a list of which
-- signed agreements are short of a signature or a completion certificate —
-- which is to say, a map of the weakest contracts in the business, handed to
-- anybody with a viewer account.
--
-- The other three — `agreement_drift`, `sow_conflict`, `orphaned_sow` — return
-- nothing on the seeded data, and that is a fact about the seed and not about
-- the views. They are unscoped views over the same person-scoped tables and
-- they leak the moment the data exists. Scoped here on shape, not on evidence,
-- because waiting for the evidence means waiting for the incident.
--
-- Each takes the scoping of the table it is built on, in that table's own
-- words. They are NOT all the same words, which is the reason to do this by
-- hand: `cw.sow_override`'s policy admits any viewer deliberately (0012), so
-- copying `executed_agreement`'s rule onto it would quietly reverse a decision
-- somebody made. The bypass is fixed; the decision is left alone.

-- The document chain of a signed agreement. Scoped as cw.executed_agreement.
create or replace view cw.agreement_chain as
select e.agreement_id, a.counterparty, e.executed_on, e.effective_on, e.term_end,
       d.doc_seq, d.kind, d.filename, d.sha256, d.signed_on, d.supersedes_seq,
       e.run_id
from cw.executed_agreement e
join cw.agreement a using (agreement_id)
join cw.executed_document d using (agreement_id)
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id))
   or (cw.app_role() = 'viewer' and cw.is_shared_with(e.agreement_id, cw.app_actor()))
order by e.agreement_id, d.doc_seq;

comment on view cw.agreement_chain is
  'The documents behind a signed agreement, in order. Scoped in this view''s '
  'WHERE clause in the same words as read_scoped on cw.executed_agreement: '
  'before 0019 it returned every signed agreement to any viewer, which was the '
  'hole 0017 closed, reopened through a view written ten migrations earlier.';

-- How far the library has moved since a contract was signed. The existing
-- filter is parenthesised because it is an OR — ANDing the scoping onto it
-- without brackets would bind to the last branch only and scope nothing.
create or replace view cw.agreement_drift as
select e.agreement_id, d.clause_id, d.version as executed_version,
       s.successor_version, s.reason as superseded_reason,
       cur.state as current_state
from cw.executed_agreement e
join cw.run_decision d on d.run_id = e.run_id and d.clause_id is not null
left join cw.supersession s
  on s.clause_id = d.clause_id and s.predecessor_version = d.version
left join cw.clause_version_state cur
  on cur.clause_id = d.clause_id and cur.version = d.version
where (s.id is not null or cur.state <> 'active')
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id))
       or (cw.app_role() = 'viewer' and cw.is_shared_with(e.agreement_id, cw.app_actor())));

-- Which signed agreements are short of the evidence they should carry.
create or replace view cw.execution_evidence_gap as
select e.agreement_id,
       not exists (select 1 from cw.executed_signatory s
                   where s.agreement_id = e.agreement_id and s.party = 'ours')
         as missing_our_signatory,
       not exists (select 1 from cw.executed_signatory s
                   where s.agreement_id = e.agreement_id and s.party = 'theirs')
         as missing_their_signatory,
       not exists (select 1 from cw.signature_certificate c
                   where c.agreement_id = e.agreement_id)
         as missing_completion_certificate
from cw.executed_agreement e
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id))
   or (cw.app_role() = 'viewer' and cw.is_shared_with(e.agreement_id, cw.app_actor()));

comment on view cw.execution_evidence_gap is
  'Signed agreements short of a signatory or a completion certificate. Scoped '
  'in the WHERE clause: unscoped, this was a list of the weakest contracts in '
  'the business readable by anybody holding a viewer account.';

-- Where a SOW contradicts its master. Scoped on the SOW's own agreement.
create or replace view cw.sow_conflict as
select s.agreement_id as sow_id, s.parent_agreement_id as master_id,
       sd.category_key, md.clause_id as master_clause, sd.clause_id as sow_clause
from cw.executed_agreement s
join cw.executed_agreement m on m.agreement_id = s.parent_agreement_id
join cw.run_decision sd on sd.run_id = s.run_id
join cw.run_decision md on md.run_id = m.run_id and md.category_key = sd.category_key
where s.agreement_kind = 'sow'
  and sd.clause_id is not null and md.clause_id is not null
  and sd.clause_id is distinct from md.clause_id
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and cw.owns_agreement(s.agreement_id))
       or (cw.app_role() = 'viewer' and cw.is_shared_with(s.agreement_id, cw.app_actor())));

-- A live SOW under a terminated master.
create or replace view cw.orphaned_sow as
select s.agreement_id as sow_id, s.parent_agreement_id as master_id,
       a.status as sow_status, ma.status as master_status
from cw.executed_agreement s
join cw.agreement a  on a.agreement_id  = s.agreement_id
join cw.agreement ma on ma.agreement_id = s.parent_agreement_id
where s.agreement_kind = 'sow'
  and ma.status = 'terminated' and a.status <> 'terminated'
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'requester' and cw.owns_agreement(s.agreement_id))
       or (cw.app_role() = 'viewer' and cw.is_shared_with(s.agreement_id, cw.app_actor())));

-- ── cw.sow_override_in_force IS DELIBERATELY LEFT UNSCOPED ────────────────
--
-- It was scoped here, and the scoping was removed after it broke something
-- important. Writing down why, because the next person will see an unscoped
-- view in a file about scoping views and assume it was missed.
--
-- THIS VIEW IS NOT A REPORT. The trigger in 0012 that decides whether a
-- statement of work may contradict its master consults it:
--
--     and not (mode = 'with_approval' and exists (
--           select 1 from cw.sow_override_in_force o
--           where o.sow_id = new.agreement_id
--             and o.category_key = sd.category_key))
--
-- Scoping it makes WHAT THE DATABASE ENFORCES depend on who is asking. Under
-- the scoped version an authorised SOW was refused execution outright — the
-- trigger looked for the authorisation, the view returned nothing because the
-- caller held no application role, and the schema concluded the departure had
-- never been approved. The suite caught it immediately, which is the only
-- reason this paragraph is a note rather than an incident.
--
-- The rule worth carrying: a view the schema itself reads must return the same
-- rows to everybody. Access scoping belongs on views that people read, and
-- putting it on a view that a rule reads turns a permission into a correctness
-- bug — the most expensive kind, because it fails in the direction of refusing
-- work that was properly authorised.
--
-- WHAT THAT LEAVES OPEN, stated rather than glossed: the view bypasses the
-- requester branch of read_scoped on cw.sow_override, so a requester can see
-- authorised departures on statements of work they do not own. That is a small
-- exposure — category, reason, who proposed it — and it is already the settled
-- position for viewers, whom 0012's policy admits outright. It is not a new
-- hole opened here; it is the existing one, now written down. If it should be
-- closed, the fix is to give the SCREENS a separate scoped view and leave this
-- one for the trigger, which is a change to what WP-U13 reads rather than to
-- what the database enforces.
