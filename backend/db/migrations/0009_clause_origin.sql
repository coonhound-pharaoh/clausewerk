-- 0009 · Clause origin, and the second character count.
--
-- Implements ADR-0010: "No contract language reaches an agreement without a
-- named human's approval, and the origin of every clause is recorded on it
-- permanently."
--
-- `provenance` (0002) already says which DOOR a version came through — seeded,
-- promoted from a concession, reviewed through a ticket. `origin` says who or
-- what COMPOSED the words. They are different questions with different answers:
-- a version can be `reviewed` in provenance and `ai_drafted` in origin, and an
-- auditor asking "how much of our library began as an AI draft?" is asking the
-- second one.

alter table cw.clause_version
  add column origin text not null default 'legal_authored'
    check (origin in ('legal_authored','ai_drafted','vendor_derived','external'));

comment on column cw.clause_version.origin is
  'Who composed the words. Immutable, survives supersession, reportable
   (ADR-0010). NOT part of the snapshot fingerprint — see 0009 notes and
   snapshot.py — because it cannot change the outcome of a run on a pinned
   (clause_id, version).';

-- ════════════════════════════════════════════════════════════════════════════
-- `external`: ONE CONCEPT, RECONCILED
-- ════════════════════════════════════════════════════════════════════════════
-- ADR-0010:72 makes `external` a clause-version origin. NEGOTIATION-
-- ARCHITECTURE.md:244 gives external clauses their own entity, agreement-scoped
-- and "never selectable". Both cannot be the whole truth, and a provenance
-- field that means two things is not provenance.
--
-- CHOSEN: `external` stays a clause-version origin, and the promise attached to
-- it — never selectable for our own drafts — is ENFORCED HERE rather than left
-- to a separate table's good manners. Reasons, in order of weight:
--
--   · The enforceable half is the one worth keeping. A separate entity that is
--     "never selectable" is only never selectable because nothing joins to it;
--     that is a property of today's queries, not a rule. An origin value on the
--     one table resolution actually draws from can be refused by the same view
--     that already refuses retired and expired language, and it is refused for
--     every future query too.
--   · Supplier paper is still ours to record. `cw.clause_entrance` and the two
--     character counts must be able to see it; a version in a side table would
--     be outside both.
--   · It costs the other design nothing. The agreement-scoped entity in
--     NEGOTIATION-ARCHITECTURE.md §7 is WP-19's work (migration 0011) and can
--     reference these versions rather than duplicating their text — the same
--     reference-not-copy rule 0008 applies to candidates.
--
-- This choice is recorded in the implementation report rather than by editing
-- the architecture documents; another owner holds those files.
create or replace view cw.clause_version_state as
select
  v.clause_id,
  v.version,
  c.category_key,
  c.severity,
  c.always_include,
  v.title,
  v.body,
  v.rationale,
  v.citations,
  v.reviewer,
  v.approved_on,
  v.expires_on,
  v.provenance,
  s.successor_version,
  s.predecessor_disposition,
  s.reason as superseded_reason,
  (v.expires_on is not null and v.expires_on < current_date)          as expired,
  (v.approved_on is null or v.expires_on is null)                     as provenance_gap,
  case when v.expires_on is null then null
       else (v.expires_on - current_date) end                         as days_to_expiry,
  case when v.expires_on is null then false
       else (v.expires_on - current_date) between 1 and 90 end        as expires_soon,
  case
    when s.id is not null                                       then 'superseded'
    when v.retired                                              then 'retired'
    when v.expires_on is not null and v.expires_on < current_date then 'expired'
    else 'active'
  end as state,
  (not v.retired
   and v.origin <> 'external'
   and (v.expires_on is null or v.expires_on >= current_date)
   and (s.id is null or s.predecessor_disposition = 'run_off'
        or s.effective_on > current_date))                            as selectable,
  -- Appended, never inserted mid-list: `create or replace view` requires the
  -- existing output columns to keep their names, types and order, and three
  -- other views are built on this one.
  v.origin,
  v.source_ticket_id
from cw.clause_version v
join cw.clause c using (clause_id)
left join cw.supersession s
  on s.clause_id = v.clause_id and s.predecessor_version = v.version;

create or replace view cw.selectable_clause as
select * from cw.clause_version_state where selectable;

-- ── Origin is immutable, or it is not provenance ────────────────────────────
-- Declared by the Gate 3 remediation §7 as a WP-17 write into the 0002 trigger.
-- It is done here instead, by replacing the whole function: the column does not
-- exist until this migration, and a trigger in 0002 that names a column added
-- four files later is a trap for the next person who reorders anything. The
-- function body is otherwise identical to 0002's, and `create or replace`
-- leaves the trigger in 0002 pointing at it.
create or replace function cw.clause_version_immutable() returns trigger
language plpgsql as $$
begin
  if old.retired
     and (new.retired_reason is distinct from old.retired_reason
          or new.retired_on is distinct from old.retired_on) then
    raise exception
      'clause_version %@v% retirement evidence is immutable; publish a new '
      'version for a new legal decision',
      old.clause_id, old.version
      using errcode = 'restrict_violation';
  end if;
  if old.retired and not new.retired then
    raise exception
      'clause_version %@v% is retired; un-retiring it is not an edit but a new '
      'approval — create a new version instead',
      old.clause_id, old.version
      using errcode = 'restrict_violation';
  end if;
  if not old.retired and new.retired and cw.app_role() is not null then
    new.retired_on := current_date;
  end if;
  if new.clause_id is distinct from old.clause_id
     or new.version is distinct from old.version
     or new.body is distinct from old.body
     or new.title is distinct from old.title
     or new.rationale is distinct from old.rationale
     or new.citations is distinct from old.citations
     or new.reviewer is distinct from old.reviewer
     or new.approved_on is distinct from old.approved_on
     or new.expires_on is distinct from old.expires_on
     or new.provenance is distinct from old.provenance
     or new.created_at is distinct from old.created_at
     -- WP-17. A rewritable origin would let AI-drafted wording be relabelled
     -- legal_authored after approval, which is the one edit that makes the
     -- whole provenance chain a story rather than a record.
     or new.origin is distinct from old.origin
     or new.source_ticket_id is distinct from old.source_ticket_id then
    raise exception
      'clause_version %@v% is immutable; create a new version and supersede it',
      old.clause_id, old.version
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

-- ── Minting learns the origin ───────────────────────────────────────────────
-- Same signature as 0008's, so this is a genuine replacement and no caller
-- moves. 0008 accepted p_origin and ignored it because the column did not exist
-- yet; it is honoured from here.
create or replace function cw.mint_clause_version(
  p_clause_id    text,
  p_category_key text,
  p_severity     text,
  p_title        text,
  p_body         text,
  p_rationale    text,
  p_citations    text[],
  p_reviewer     text,
  p_expires_on   date,
  p_provenance   text,
  p_origin       text default 'legal_authored',
  p_source_ticket_id bigint default null
) returns int
language plpgsql security invoker as $$
declare v int;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'a clause version cannot be minted with no body'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reviewer), '') = '' then
    raise exception 'a clause version must name the human who approved it'
      using errcode = 'check_violation';
  end if;

  insert into cw.clause (clause_id, category_key, severity)
  values (p_clause_id, p_category_key, p_severity)
  on conflict (clause_id) do nothing;

  select coalesce(max(version), 0) + 1 into v
  from cw.clause_version where clause_id = p_clause_id;

  insert into cw.clause_version
    (clause_id, version, title, body, rationale, citations, reviewer,
     approved_on, expires_on, provenance, origin, source_ticket_id)
  values (p_clause_id, v, p_title, p_body, p_rationale, p_citations, p_reviewer,
          current_date, p_expires_on, p_provenance, p_origin, p_source_ticket_id);

  return v;
end $$;

-- A ticket that carried an AI draft mints AI-originated wording. The reviewer
-- does not get to choose otherwise: they approved a model's words, and how
-- fluent those words were is not a fact about who wrote them.
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
  if t.state <> 'pending' then
    raise exception 'review ticket % is already %', p_ticket_id, t.state
      using errcode = 'restrict_violation';
  end if;

  -- Derived, not accepted. A draft-backed ticket is ai_drafted whatever the
  -- caller passes, so the answer to "how much of the library began as an AI
  -- draft?" cannot be reduced by a parameter.
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

-- ── The two provenance figures, for the SYSTEM RECORD only ──────────────────
-- Owner decision, 2026-07-25: NEITHER count is printed on the contract
-- document. Both are computed and kept where Legal and auditors read them —
-- the run record and the dossier. There is no footer, and 0009 adds none.
alter table cw.run
  add column authored_chars   int not null default 0,
  add column ai_origin_chars  int not null default 0;

comment on column cw.run.authored_chars is
  'Characters in the emitted document that came from neither the library nor
   the declared structural strings. The headline claim, counted. Asserted zero
   by engine/test_docx.py on every build.';
comment on column cw.run.ai_origin_chars is
  'Characters in the emitted document that came from clause bodies whose origin
   is ai_drafted. Approved by a named lawyer, AI in origin (ADR-0010).';

-- Library-wide, the same two questions asked of the library rather than of one
-- contract. Computable before the first AI draft is ever approved — which is
-- the point: the figure exists and reads zero, rather than not existing.
create or replace view cw.library_origin_mix as
select v.origin,
       count(*)                                  as versions,
       sum(length(v.body))                       as characters,
       count(*) filter (where s.selectable)      as selectable_versions
from cw.clause_version v
join cw.clause_version_state s
  on s.clause_id = v.clause_id and s.version = v.version
group by v.origin;

comment on view cw.library_origin_mix is
  '"How much of our library began as an AI draft?" (ADR-0010), answerable at any
   moment. Rows appear only for origins in use; a reader wanting a zero for an
   unused origin should left-join the enum.';

-- "Which executed contracts contain AI-originated wording?" — the other
-- question ADR-0010 says must be answerable at any moment.
create or replace view cw.run_origin_mix as
select d.run_id, v.origin,
       count(*)            as clauses,
       sum(length(v.body)) as characters
from cw.run_decision d
join cw.clause_version v on v.clause_id = d.clause_id and v.version = d.version
group by d.run_id, v.origin;

grant select on cw.library_origin_mix, cw.run_origin_mix
  to cw_legal_reviewer, cw_legal_admin, cw_auditor;
