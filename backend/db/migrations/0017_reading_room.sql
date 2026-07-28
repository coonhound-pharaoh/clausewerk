-- 0017 · The sharing act, and the reading room it implies (WP-U14).
--
-- NUMBERED 0017, HAVING SHIPPED AS 0016. It collided: the Python doorway landed
-- its own 0016 (`0016_doorway_login.sql`) in a parallel session, and two files
-- claiming one number is a trap for whoever adds the next one. This file moved
-- rather than that one, because that one belonged to a session still running and
-- renaming a file out from under live work is how you cause the problem you were
-- preventing. Nothing about the order changed: `0016_doorway_login` already
-- sorted ahead of `0016_reading_room`, and neither reads anything the other
-- writes, so the run order is the same before and after.
--
-- WHAT THIS FIXES, and it is not a refinement. Until now:
--
--     create policy read_scoped on cw.executed_agreement for select using (
--       cw.app_role() in ('legal_reviewer','legal_admin','auditor','viewer') …
--
-- A VIEWER COULD READ EVERY SIGNED CONTRACT IN THE SYSTEM. Not the ones they
-- were shown — all of them. The role was added by ADR-0008 so that a contract
-- could be shown to somebody for socialisation without giving them the ability
-- to change it, and the "shown to" half was never built: there was nothing
-- anywhere recording who had been shown what.
--
-- So the reading room is not a screen over an existing mechanism. The mechanism
-- did not exist, and the screen was the only thing that would have made its
-- absence obvious. WP-U14 calls it "the small mechanism the reading room
-- implies"; it turns out to be the difference between the viewer role working
-- and the viewer role being a hole.
--
-- THE RULE, from WP-U14's critical anti-pattern: the viewer's render must never
-- be fetched through anything broader than "this share, this person". That is
-- enforced here, in the policy, rather than by a careful query — because a
-- careful query is one endpoint away from being a careless one.

-- ── The sharing act ───────────────────────────────────────────────────────
-- One row per act, and the act is recorded. Sharing a signed contract with
-- somebody outside the deal is a decision with consequences — it is how a
-- counterparty's terms reach a third party — and "who showed them that?" is a
-- question somebody eventually asks.
create table cw.agreement_share (
  share_id     bigserial primary key,
  agreement_id text not null references cw.executed_agreement(agreement_id),
  -- The person being shown it. A named account, not a free-text address: the
  -- whole point of the viewer role is that the audience is somebody the system
  -- knows.
  shared_with  text not null references cw.account(person),
  shared_by    text not null default cw.app_actor(),
  shared_at    timestamptz not null default now(),
  -- Why. Not optional: a share with no stated purpose is one nobody can review
  -- later, and this is the field that says whether it was socialisation, a
  -- diligence request, or somebody being helpful.
  purpose      text not null,
  -- Unsharing is recorded rather than deleting the row, for the same reason
  -- everything else here is: the fact that they COULD see it, for that period,
  -- does not stop being true.
  revoked_by   text,
  revoked_at   timestamptz,

  constraint a_purpose_is_not_blank check (length(btrim(purpose)) >= 5),
  constraint revoked_names_a_person_and_a_time check (
    (revoked_at is null) = (revoked_by is null))
);

-- One live share per person per agreement. A second would be a second row to
-- revoke, and somebody would revoke one and believe they were done.
create unique index agreement_share_live
  on cw.agreement_share (agreement_id, shared_with)
  where revoked_at is null;

comment on table cw.agreement_share is
  'Who was shown which signed agreement, by whom, why, and until when. Before '
  'this existed a viewer could read every executed agreement in the system.';

create or replace function cw.agreement_share_evidence_immutable()
returns trigger
language plpgsql as $$
begin
  if new.share_id is distinct from old.share_id
     or new.agreement_id is distinct from old.agreement_id
     or new.shared_with is distinct from old.shared_with
     or new.shared_by is distinct from old.shared_by
     or new.shared_at is distinct from old.shared_at
     or new.purpose is distinct from old.purpose then
    raise exception 'share % evidence is immutable; revoke it and create a new share',
      old.share_id using errcode = 'restrict_violation';
  end if;

  if old.revoked_at is not null then
    raise exception 'share % was revoked and cannot be rewritten', old.share_id
      using errcode = 'restrict_violation';
  end if;

  if new.revoked_at is null or new.revoked_by is null then
    raise exception 'share % may only be updated by recording its revocation',
      old.share_id using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

create trigger agreement_share_evidence_immutable
  before update on cw.agreement_share
  for each row execute function cw.agreement_share_evidence_immutable();

create or replace function cw.audit_agreement_share() returns trigger
language plpgsql as $$
begin
  -- A governed application write is attributed to the authenticated person,
  -- never to a second identity supplied alongside the SQL. The owner has no
  -- application role and remains able to import historical share records.
  if cw.app_role() is not null then
    if tg_op = 'INSERT' then
      new.shared_by := cw.app_actor();
      new.shared_at := now();
    elsif old.revoked_at is null and new.revoked_at is not null then
      new.revoked_by := cw.app_actor();
      new.revoked_at := now();
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform cw.audit('agreement_shared', new.agreement_id,
      jsonb_build_object('with', new.shared_with, 'purpose', new.purpose));
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform cw.audit('agreement_unshared', new.agreement_id,
      jsonb_build_object('with', new.shared_with, 'by', new.revoked_by));
  end if;
  return new;
end $$;

create trigger audit_agreement_share
  before insert or update on cw.agreement_share
  for each row execute function cw.audit_agreement_share();

create or replace function cw.share_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'a share is revoked, never deleted — that somebody could see '
    'this agreement, for that period, does not stop being true';
end $$;

create trigger agreement_share_no_delete
  before delete on cw.agreement_share
  for each row execute function cw.share_no_delete();

-- ── "Is this agreement shared with this person, right now?" ───────────────
-- SECURITY DEFINER for the same reason cw.was_notified() is: the policies below
-- consult this, and this consults a table whose own policy would consult them
-- back. 0015 met that exact cycle and Postgres refused the pair outright.
-- Definer rights break that recursion; they do not widen the reporting API.
-- The predicate below restores agreement_share's viewer/requester scope for a
-- direct call, while policy calls use the same actor and therefore still work.
create or replace function cw.is_shared_with(p_agreement_id text, p_person text)
returns boolean
language sql stable
security definer set search_path = cw, pg_temp as $$
  select exists (
    select 1 from cw.agreement_share
     where agreement_id = p_agreement_id
       and shared_with = p_person
       and revoked_at is null
       and (
         coalesce(nullif(current_setting('role', true), 'none'), session_user)
           not in ('cw_viewer', 'cw_requester')
         or (
           coalesce(nullif(current_setting('role', true), 'none'), session_user)
             = 'cw_viewer'
           and p_person = cw.app_actor()
         )
         or (
           coalesce(nullif(current_setting('role', true), 'none'), session_user)
             = 'cw_requester'
           and cw.owns_agreement(p_agreement_id)
         )
       ))
$$;

revoke all on function cw.is_shared_with(text, text) from public;
grant execute on function cw.is_shared_with(text, text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;

-- ── Narrowing the viewer ──────────────────────────────────────────────────
-- The policies are REPLACED rather than added to. An extra permissive policy
-- would be OR'd with the existing one and would widen nothing but change
-- nothing either — the viewer would still match the old branch and still see
-- everything. The old branch has to go.
--
-- Every other role is untouched. This is a change to what a VIEWER may read,
-- and to nothing else.
drop policy read_scoped on cw.executed_agreement;
create policy read_scoped on cw.executed_agreement for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id))
  or (cw.app_role() = 'viewer'
      and cw.is_shared_with(agreement_id, cw.app_actor())));

drop policy read_scoped on cw.executed_document;
create policy read_scoped on cw.executed_document for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id))
  or (cw.app_role() = 'viewer'
      and cw.is_shared_with(agreement_id, cw.app_actor())));

drop policy read_scoped on cw.signature_certificate;
create policy read_scoped on cw.signature_certificate for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id))
  or (cw.app_role() = 'viewer'
      and cw.is_shared_with(agreement_id, cw.app_actor())));

drop policy read_scoped on cw.executed_signatory;
create policy read_scoped on cw.executed_signatory for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id))
  or (cw.app_role() = 'viewer'
      and cw.is_shared_with(agreement_id, cw.app_actor())));

-- ── The reading room ──────────────────────────────────────────────────────
-- What a viewer opens on.
--
-- A VIEW DOES NOT INHERIT THE POLICIES UNDERNEATH IT, and getting that wrong
-- here is worth writing down because the first version of this file did.
--
-- A PostgreSQL view runs with its OWNER's rights by default. The owner ran the
-- migrations, and row-level security is ENABLED rather than FORCED — so the
-- owner bypasses every policy. A view over cw.agreement_share therefore hands
-- EVERY share to whoever selects from it, and the policies above are not
-- consulted at all.
--
-- This shipped with a comment claiming "a viewer sees their own shares only —
-- enforced by the policy". That was a document promising a control the code did
-- not enforce: the precise failure class this whole effort exists to pay down,
-- written while paying it down. The suite caught it on the first run — an
-- unshared viewer's reading room had a row in it.
--
-- `security_invoker = true` was the obvious fix and is the wrong one HERE: it
-- evaluates the view as the caller, which then needs SELECT on every joined
-- table. A viewer holds none on cw.agreement, so the reading room became
-- "permission denied" for exactly the role it exists for. Widening those grants
-- to fix it would open more than the view.
--
-- So the scoping is IN THE VIEW, stated in the same words as the policy. Two
-- expressions of one rule is a real cost — they can drift — and the test suite
-- is what holds them together: it asserts an unshared viewer sees nothing here,
-- which fails if either half is wrong.
create or replace view cw.reading_room as
select s.share_id, s.agreement_id, s.shared_with, s.shared_by, s.shared_at,
       s.purpose,
       a.counterparty,
       e.executed_on, e.effective_on, e.term_end
from cw.agreement_share s
join cw.executed_agreement e on e.agreement_id = s.agreement_id
join cw.agreement a on a.agreement_id = s.agreement_id
where s.revoked_at is null
  and (cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
       or (cw.app_role() = 'viewer' and s.shared_with = cw.app_actor())
       or (cw.app_role() = 'requester' and cw.owns_agreement(s.agreement_id)));

comment on view cw.reading_room is
  'The agreements a person has been shown, and why. The scoping is in this '
  'view''s WHERE clause because a view runs with its owner''s rights and does '
  'NOT inherit the policies underneath it — see the note in 0017.';

-- What was in the agreement, per clause, with its origin and who approved it.
-- The one place a viewer sees an approval: WP-U14's "SOW-departure visibility
-- rule" and the socialisation audience's whole reason for existing — being shown
-- a contract is useless if you cannot see whose language it is.
-- Scoped the same way, and for the same reason. Note this one reads
-- cw.run_decision, which a viewer holds no grant on at all — another reason
-- `security_invoker` was the wrong tool: it would have made this view
-- unreadable by the role it is for.
create or replace view cw.reading_room_clause as
select e.agreement_id, d.clause_id, d.version,
       v.title, v.body, v.reviewer, v.approved_on, v.origin, v.provenance
from cw.executed_agreement e
join cw.run_decision d on d.run_id = e.run_id and d.clause_id is not null
join cw.clause_version v
  on v.clause_id = d.clause_id and v.version = d.version
where cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
   or (cw.app_role() = 'viewer'
       and cw.is_shared_with(e.agreement_id, cw.app_actor()))
   or (cw.app_role() = 'requester' and cw.owns_agreement(e.agreement_id));

comment on view cw.reading_room_clause is
  'The clauses in a signed agreement with their origin and approver — the one '
  'place a viewer sees an approval. Scoped in the WHERE clause, because a view '
  'does not inherit the policies underneath it.';

-- ── Who may share ─────────────────────────────────────────────────────────
alter table cw.agreement_share enable row level security;

-- Sharing is a Legal act. A requester cannot show their own deal to whoever
-- they like: the point of the socialisation audience is that somebody decided
-- who should see it, and "the person who wants the override picks the audience"
-- is not that.
create policy legal_shares on cw.agreement_share for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));
create policy legal_unshares on cw.agreement_share for update
  using (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

-- Read: Legal and Audit see every share, because "who was shown what" is
-- exactly the access story the Auditor exists to read. A viewer sees their own,
-- so they know what they have been given and why. A requester sees shares on
-- their own deals.
create policy read_scoped on cw.agreement_share for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor','administrator')
  or (cw.app_role() = 'viewer' and shared_with = cw.app_actor())
  or (cw.app_role() = 'requester' and cw.owns_agreement(agreement_id)));

revoke all on cw.agreement_share from public;
grant select on cw.agreement_share, cw.reading_room, cw.reading_room_clause to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;
grant insert, update on cw.agreement_share to cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.agreement_share_share_id_seq
  to cw_legal_reviewer, cw_legal_admin;

-- NO EXPORT, and it is a grant rather than a screen decision. ADR-0008 gave the
-- viewer no export deliberately — the reading room shows a contract to somebody
-- outside the deal, and letting them take a copy away is a different act nobody
-- decided. Convenience does not amend an ADR, so there is nothing here for a
-- future export button to call.
