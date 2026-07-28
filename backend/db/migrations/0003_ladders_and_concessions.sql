-- 0003 · Fallback ladders and the concession record.
--
-- Implements CLAUSE-LIBRARY-ARCHITECTURE.md §3–§6 and ADR-0009.
--
-- The rule this migration exists to enforce: accepting a vendor's wording is a
-- CONCESSION scoped to one deal. It does not change the library. There is
-- exactly one path from conceded text into approved language — cw.promote_
-- concession() — and it is a deliberate Legal admin act.

-- ── Agreement (minimal) ─────────────────────────────────────────────────────
-- A concession has to belong to a deal. This is the small certain subset of the
-- executed-agreement record; LIFECYCLE-ARCHITECTURE.md §5 extends it with the
-- library snapshot pin, decision set, term and status machine.
create table cw.agreement (
  agreement_id text primary key,
  counterparty text not null,
  sector       text,
  value_usd    numeric(14,2),
  requester    text not null,          -- who owns the deal; drives RLS below
  status       text not null default 'negotiating'
                 check (status in ('negotiating','executed','terminated')),
  created_at   timestamptz not null default now()
);

-- ── Ladders (CLA §3) ────────────────────────────────────────────────────────
-- A pre-approved retreat path per category. Every rung is ordinary approved
-- clause text — a ladder is metadata over clauses, not a new kind of content.
-- A requester opening a deal owns that deal. Legal admin may legitimately
-- create and assign a deal for somebody else, and owner-mode imports retain
-- historical ownership, but a requester cannot inject rows into another
-- person's RLS scope.
create or replace function cw.bind_agreement_requester() returns trigger
language plpgsql as $$
begin
  if cw.app_role() = 'requester' then
    new.requester := cw.app_actor();
  end if;
  return new;
end $$;

create trigger agreement_bind_requester
  before insert on cw.agreement
  for each row execute function cw.bind_agreement_requester();

create table cw.ladder (
  ladder_id    bigserial primary key,
  category_key text not null references cw.category(key),
  severity     text not null check (severity in ('Standard','High')),
  owner        text not null,
  reviewed_on  date,
  unique (category_key, severity)
);

create table cw.ladder_rung (
  ladder_id  bigint not null references cw.ladder(ladder_id) on delete cascade,
  rung       int    not null check (rung >= 0),   -- 0 = preferred position
  clause_id  text   not null,
  version    int    not null,
  is_floor   boolean not null default false,
  primary key (ladder_id, rung),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version),
  unique (ladder_id, clause_id, version)
);

comment on column cw.ladder_rung.is_floor is
  'The last position we will accept. Below it, escalation is mandatory — no
   similarity score, auto-approve, or threshold may bypass it (CLA §3).';

-- Exactly one floor per ladder.
create unique index ladder_one_floor on cw.ladder_rung (ladder_id) where is_floor;

-- Rungs must be contiguous from 0, or "descend one rung" is meaningless.
create or replace function cw.ladder_rungs_contiguous() returns trigger
language plpgsql as $$
declare lid bigint; n int; mx int;
begin
  lid := coalesce(new.ladder_id, old.ladder_id);
  select count(*), max(rung) into n, mx from cw.ladder_rung where ladder_id = lid;
  if n > 0 and mx <> n - 1 then
    raise exception 'ladder % rungs must be contiguous from 0 (have % rungs, highest %)',
      lid, n, mx using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger ladder_contiguous
  after insert or update or delete on cw.ladder_rung
  deferrable initially deferred
  for each row execute function cw.ladder_rungs_contiguous();

-- ════════════════════════════════════════════════════════════════════════════
-- A RUNG MUST BELONG TO ITS OWN LADDER (WP-23 · finding D8)
-- ════════════════════════════════════════════════════════════════════════════
-- A ladder is declared for one category at one severity — `cw.ladder` carries
-- both columns, and cw.concession_requires_authority() looks the ladder up by
-- exactly that pair, because WP-07 established that a Standard position must be
-- judged against the Standard floor and never the High one.
--
-- Nothing checked that the rungs on a ladder were clauses of that category and
-- that severity. So a High Data Privacy clause could sit on a Standard
-- Liability ladder, and the floor lookup would then judge a Liability
-- concession against a retreat path made of Data Privacy wording. The seeded
-- fixtures in ladder.test.mjs did exactly this — which is how the gap was
-- found, and why it had to be corrected here rather than reported.
--
-- Both halves matter and they fail differently:
--
--   · CATEGORY. Descending a rung would hand the vendor wording about a
--     completely different subject. There is no reading of "pre-approved
--     retreat path" in which that is a retreat.
--
--   · SEVERITY. This is the quieter one. A High position retreating onto
--     Standard wording is a demotion nobody recorded — the same defect WP-06
--     found in promotion, arriving from the ladder side instead. The floor
--     would still look intact.
create or replace function cw.ladder_rung_matches_ladder() returns trigger
language plpgsql as $$
declare l cw.ladder%rowtype; c cw.clause%rowtype;
begin
  select * into l from cw.ladder where ladder_id = new.ladder_id;
  select * into c from cw.clause where clause_id = new.clause_id;
  if l.category_key is distinct from c.category_key then
    raise exception
      'ladder % is a % ladder; rung % names %, which is a % clause — a rung '
      'must be a retreat within the same category',
      new.ladder_id, l.category_key, new.rung, new.clause_id, c.category_key
      using errcode = 'check_violation';
  end if;
  if l.severity is distinct from c.severity then
    raise exception
      'ladder % is a % ladder; rung % names %, which is a % clause — retreating '
      'onto weaker wording is a demotion, not a rung',
      new.ladder_id, l.severity, new.rung, new.clause_id, c.severity
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger ladder_rung_matches_ladder
  before insert or update on cw.ladder_rung
  for each row execute function cw.ladder_rung_matches_ladder();

-- A published rung is immutable (WP-07). Concessions are recorded as "we went
-- to rung 2", and every one of them stays readable forever. If the wording
-- sitting on rung 2 can be swapped afterwards, every past concession silently
-- starts meaning something else — the retreat path is rewritten under the
-- decisions that were taken on it.
--
-- WHAT IS PROTECTED: which clause version occupies the rung, and the rung
-- number. NOT `is_floor` — moving the floor is a live governance decision Legal
-- takes as positions harden or soften, it is visible in cw.ladder_health, and
-- the floor in force at the time is now copied onto each concession anyway.
-- Changing the path is a new ladder; changing how far down it we will go is a
-- policy call.
create or replace function cw.ladder_rung_immutable() returns trigger
language plpgsql as $$
begin
  if new.clause_id is distinct from old.clause_id
     or new.version is distinct from old.version
     or new.rung is distinct from old.rung then
    raise exception
      'ladder % rung % is published; the wording on a rung cannot be swapped — '
      'publish a new ladder instead', old.ladder_id, old.rung
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger ladder_rung_no_edit
  before update on cw.ladder_rung
  for each row execute function cw.ladder_rung_immutable();

-- ── Ladder health (CLA §11 open question 4) ─────────────────────────────────
-- A rung can expire underneath a ladder. Whether the ladder should then
-- collapse upward is UNDECIDED, and silent collapse would be dangerous — so
-- this reports the condition rather than quietly resolving it. The resolution
-- engine reads `status` and refuses to descend a degraded ladder.
create or replace view cw.ladder_rung_state as
select r.ladder_id, r.rung, r.clause_id, r.version, r.is_floor,
       s.state, s.selectable, s.expires_on, s.days_to_expiry
from cw.ladder_rung r
join cw.clause_version_state s using (clause_id, version);

create or replace view cw.ladder_health as
select l.ladder_id, l.category_key, l.severity, l.owner, l.reviewed_on,
       count(r.*)                                       as rungs,
       count(*) filter (where not r.selectable)         as unusable_rungs,
       bool_or(r.is_floor)                              as has_floor,
       case
         when count(r.*) = 0                            then 'empty'
         when not bool_or(r.is_floor)                   then 'floorless'
         when count(*) filter (where r.is_floor and not r.selectable) > 0
                                                        then 'floor_unusable'
         when count(*) filter (where not r.selectable) > 0 then 'degraded'
         else 'intact'
       end                                              as status
from cw.ladder l
left join cw.ladder_rung_state r using (ladder_id)
group by l.ladder_id, l.category_key, l.severity, l.owner, l.reviewed_on;

comment on view cw.ladder_health is
  'A ladder with no floor is a configuration error, reported as floorless.
   A ladder with an expired rung is degraded — NOT silently collapsed.';

-- ── Concessions (CLA §4) ────────────────────────────────────────────────────
create table cw.concession (
  concession_id     bigserial primary key,
  agreement_id      text   not null references cw.agreement(agreement_id),
  category_key      text   not null references cw.category(key),
  -- What we opened with.
  standard_clause_id text  not null,
  standard_version   int   not null,
  -- Exactly one of: we descended to a pre-approved rung, or we took vendor text.
  conceded_rung      int,
  vendor_text        text,
  override_ref       text,          -- required when below floor or vendor text
  reason             text   not null,
  approved_by        text   not null,
  conceded_on        date   not null default current_date,
  promoted_to_clause text,          -- set only by cw.promote_concession()
  -- Which ladder this concession was judged against, and where that ladder's
  -- floor sat at the time. Written by the authority trigger, never by a caller
  -- (WP-07). Without these, "was this concession within authority?" can only be
  -- re-derived from a ladder that may since have been re-ordered — which is not
  -- a record of the decision, it is a guess about it.
  ladder_id          bigint references cw.ladder(ladder_id),
  ladder_floor_rung  int,
  created_at         timestamptz not null default now(),
  foreign key (standard_clause_id, standard_version)
    references cw.clause_version(clause_id, version),
  constraint one_outcome check (
    (conceded_rung is not null) <> (vendor_text is not null))
);

comment on column cw.concession.vendor_text is
  'QUARANTINED. Accepted vendor wording, stored as a concession artifact. It is
   referenced by no selectable view and can never be resolved into a contract.
   The only route into the library is cw.promote_concession().';

-- Authority: below the floor, or taking vendor language outright, requires a
-- recorded override (ADR-0008). Enforced here because it depends on the
-- ladder's floor, which a check constraint cannot reach.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE FLOOR, MADE ABSOLUTE (WP-07 · finding D5)
-- ════════════════════════════════════════════════════════════════════════════
-- This lookup used to match on category alone, with no severity filter and no
-- ORDER BY. Two things followed, and both were reproduced:
--
--   · WRONG LADDER. A category can hold a Standard ladder and a High ladder,
--     with different floors. Matching on category and taking `limit 1` picked
--     whichever row the planner happened to return. In the reproduction it
--     picked the High ladder's floor (rung 0) and refused a Standard rung-2
--     concession that sat exactly ON its own ladder's floor — a legitimate,
--     pre-approved retreat, blocked.
--
--   · NO LADDER MEANT NO LIMIT. When the lookup found nothing, floor_rung was
--     null and the whole check was skipped. Conceding to rung 99 in a category
--     with no ladder at all, with no override, was accepted silently. The
--     guarantee the product states is that the floor is absolute; what the code
--     did was treat a missing floor as no floor.
--
-- Three changes. The lookup filters on the concession's severity, which is the
-- severity of the standard position being conceded — not a new column, because
-- the answer is already in cw.clause and a second copy could disagree with it.
-- It orders deterministically, so it can never depend on planner luck. And a
-- rung concession with no ladder behind it now RAISES.
--
-- WHICH PATHS FAIL CLOSED, DECIDED AND STATED. The no-ladder raise fires on the
-- RUNG path only. "Descend to rung 5" of a ladder that does not exist is not a
-- decision anyone can defend, so it is refused. Taking vendor text is a
-- different act: it is not a position on a ladder, and it already carries an
-- unconditional requirement for a recorded override. Making it depend on a
-- ladder as well would block a legitimate, fully authorised concession in any
-- category Legal has not yet laddered. The ladder lookup still RUNS on the
-- vendor-text path, and what it finds is still recorded.
create or replace function cw.concession_requires_authority() returns trigger
language plpgsql as $$
declare floor_rung int; lid bigint; sev text;
begin
  -- The immutable approver/proposer identity is observed from the governed
  -- session, not accepted beside the commercial facts. Owner-mode historical
  -- imports retain explicit attribution.
  if cw.app_role() is not null then
    new.approved_by := cw.app_actor();
    new.conceded_on := current_date;
    new.created_at := now();
  end if;

  if cw.app_role() = 'requester'
     and not cw.owns_agreement(new.agreement_id) then
    raise exception
      'requester % does not own agreement % and cannot record its concessions',
      cw.app_actor(), new.agreement_id
      using errcode = 'insufficient_privilege';
  end if;

  -- The severity of the position we opened with. Single source of truth.
  select c.severity into sev
  from cw.clause c where c.clause_id = new.standard_clause_id;

  select l.ladder_id, r.rung into lid, floor_rung
  from cw.ladder l join cw.ladder_rung r using (ladder_id)
  where l.category_key = new.category_key
    and l.severity = sev
    and r.is_floor
  order by l.ladder_id
  limit 1;

  new.ladder_id := lid;
  new.ladder_floor_rung := floor_rung;

  if new.vendor_text is not null and new.override_ref is null then
    raise exception 'accepting vendor language requires a recorded override'
      using errcode = 'check_violation';
  end if;

  -- Fail closed. A rung with no ladder behind it is not a concession, it is a
  -- number, and there is no floor for it to be above or below.
  if new.conceded_rung is not null and floor_rung is null then
    raise exception
      'no % floor is published for category %, so there is nothing to concede '
      'against and rung % cannot be authorised; publish a ladder with a floor first',
      sev, new.category_key, new.conceded_rung
      using errcode = 'check_violation';
  end if;

  if new.conceded_rung is not null and floor_rung is not null
     and new.conceded_rung > floor_rung and new.override_ref is null then
    raise exception 'conceding below the floor (rung % > floor %) requires a recorded override',
      new.conceded_rung, floor_rung using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger concession_authority
  before insert on cw.concession
  for each row execute function cw.concession_requires_authority();

create or replace function cw.audit_concession() returns trigger
language plpgsql as $$
begin
  perform cw.audit('concession_recorded',
    new.agreement_id || '/' || new.category_key,
    jsonb_build_object(
      'standard', new.standard_clause_id || '@v' || new.standard_version,
      'conceded_rung', new.conceded_rung,
      'vendor_language', (new.vendor_text is not null),
      'override_ref', new.override_ref,
      'approved_by', new.approved_by));
  return new;
end $$;

create trigger audit_concession
  after insert on cw.concession
  for each row execute function cw.audit_concession();

-- ── A recorded concession cannot be rewritten (WP-06 · finding D6) ──────────
-- Until now, concessions were immutable only BY ACCIDENT. cw.concession had no
-- UPDATE policy at all, so row-level security refused every update by default —
-- which is also exactly why promotion silently did nothing (finding D1). The
-- moment D1 is fixed by giving legal_admin a way to write promoted_to_clause,
-- that accidental protection is gone. The two findings are one repair: this
-- trigger is what makes the immutability deliberate instead of incidental.
--
-- ALLOW-LIST, not a block-list. Exactly one field may ever change, and only in
-- one direction: promoted_to_clause, from empty to a clause reference. A
-- concession is the record of what we gave away under pressure and who
-- authorised it; the vendor's wording and the approver's name are evidence.
--
-- Note this fires for EVERYONE, including the database owner, and it is the
-- only protection that does. The column grant and the restrictive policy below
-- stop application roles; they do not stop the owner, and they deny with
-- "permission denied" rather than saying what the rule is.
create or replace function cw.concession_immutable() returns trigger
language plpgsql as $$
begin
  if old.promoted_to_clause is not null
     and new.promoted_to_clause is distinct from old.promoted_to_clause then
    raise exception
      'concession % was already promoted to %; a promotion cannot be undone or redirected',
      old.concession_id, old.promoted_to_clause using errcode = 'restrict_violation';
  end if;
  if new.concession_id  is distinct from old.concession_id
     or new.agreement_id      is distinct from old.agreement_id
     or new.category_key      is distinct from old.category_key
     or new.standard_clause_id is distinct from old.standard_clause_id
     or new.standard_version  is distinct from old.standard_version
     or new.conceded_rung     is distinct from old.conceded_rung
     or new.vendor_text       is distinct from old.vendor_text
     or new.override_ref      is distinct from old.override_ref
     or new.reason            is distinct from old.reason
     or new.approved_by       is distinct from old.approved_by
     or new.conceded_on       is distinct from old.conceded_on
     or new.ladder_id         is distinct from old.ladder_id
     or new.ladder_floor_rung is distinct from old.ladder_floor_rung then
    raise exception
      'a recorded concession cannot be rewritten; only promotion may change it '
      '(concession %)', old.concession_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger concession_no_edit
  before update on cw.concession
  for each row execute function cw.concession_immutable();

-- Deleting a concession RAISES rather than quietly doing nothing (settled
-- decision S0-3). A caller who thinks they deleted something and did not is
-- worse off than one who was told no.
create or replace function cw.concession_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'a concession cannot be deleted: what we conceded, and who authorised it, is evidence'
    using errcode = 'restrict_violation';
end $$;

create trigger concession_no_delete
  before delete on cw.concession
  for each row execute function cw.concession_no_delete();

-- TRUNCATE fires neither the row trigger above nor any ON DELETE rule, so
-- without this the whole concession record — the most sensitive aggregate in
-- the system — could be erased by one statement (WP-25b, finding D9).
create trigger concession_no_truncate
  before truncate on cw.concession
  for each statement execute function cw.no_truncate();

create trigger ladder_rung_no_truncate
  before truncate on cw.ladder_rung
  for each statement execute function cw.no_truncate();

-- ── Indexes on the lookups this schema performs (WP-25a · finding D9) ───────
-- Every one of these is a foreign-key or policy column. PostgreSQL indexes the
-- referenced side of a foreign key automatically and the referencing side
-- never, so these are the joins that were doing sequential scans.
create index on cw.concession (agreement_id, category_key);
create index on cw.concession (standard_clause_id, standard_version);
create index on cw.ladder (category_key, severity);
create index on cw.ladder_rung (clause_id, version);

-- The one permitted change leaves its own record, independent of the function
-- that made it. cw.promote_concession() audits the new clause version; this
-- audits the concession row moving.
create or replace function cw.audit_concession_update() returns trigger
language plpgsql as $$
begin
  perform cw.audit('concession_updated',
    new.agreement_id || '/' || new.category_key,
    jsonb_build_object('concession_id', new.concession_id,
                       'promoted_to_clause', new.promoted_to_clause));
  return new;
end $$;

create trigger audit_concession_update
  after update on cw.concession
  for each row execute function cw.audit_concession_update();

-- ── The one path from concession into the library ───────────────────────────
-- Deliberate, gated, audited. Never a side-effect of closing a negotiation.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS STILL `security invoker` (WP-06 · findings D1 + D6)
-- ════════════════════════════════════════════════════════════════════════════
-- It used to end in an UPDATE against a table with no UPDATE policy. Run by the
-- database owner — which is how every test ran it — that worked. Run by a real
-- cw_legal_admin it silently affected NOTHING: no error, no row changed, and
-- the function still returned a clause reference as though it had succeeded.
-- The "cannot promote twice" guard reads promoted_to_clause to do its job, so
-- with that column never written the guard was defeated too, and the same
-- vendor paragraph could be minted into the library over and over.
--
-- The obvious repair is to make this function `security definer` so it runs
-- with the owner's privileges. That was tried and REJECTED, on evidence: at the
-- time, the role check below read cw.app_role(), which read a session variable
-- any client could set. As a definer function the only thing standing between a
-- cw_legal_reviewer and the clause library was that string — and a reviewer
-- setting cw.role='legal_admin' was demonstrated minting an approved clause
-- from quarantined vendor text. A definer function whose gate is a
-- client-settable variable is not a fix; it is the same hole with more power
-- behind it.
--
-- WP-04 has since narrowed cw.app_role() to the connection's real database
-- role, so that particular spoof no longer works. The decision still stands,
-- for a different and better reason: a caller-rights function cannot do
-- anything the caller could not already do, so the privilege system and RLS
-- stay in force underneath it. Definer rights would switch both off and leave
-- one hand-written check carrying the whole gate.
--
-- What ships instead keeps the function running as its caller, so the caller's
-- own privileges and the row-level policies both still apply, and grants
-- exactly the one write the promotion needs:
--
--     grant update (promoted_to_clause) on cw.concession to cw_legal_admin
--     + a permissive UPDATE policy for legal_admin
--     + a RESTRICTIVE policy: only an unpromoted row, only into a promoted one
--     + cw.concession_immutable() for the loud message
--
-- Result: promotion succeeds as a real cw_legal_admin; a second promotion
-- raises; and rewriting vendor_text or approved_by is denied outright.
--
-- The EXECUTE grant is load-bearing, not decoration. PostgreSQL grants EXECUTE
-- on a new function to PUBLIC by default, so the `revoke all ... from public`
-- below is what keeps every other role out of this function entirely. It has
-- its own test.
create or replace function cw.promote_concession(
  p_concession_id bigint, p_new_clause_id text, p_title text,
  p_rationale text, p_reviewer text, p_expires_on date
) returns text
language plpgsql security invoker as $$
declare c cw.concession%rowtype; v int; sev text;
begin
  if cw.app_role() is distinct from 'legal_admin' then
    raise exception 'only legal_admin may promote a concession into the library'
      using errcode = 'insufficient_privilege';
  end if;

  select * into c from cw.concession where concession_id = p_concession_id;
  if not found then raise exception 'no such concession: %', p_concession_id; end if;
  if c.vendor_text is null then
    raise exception 'concession % settled on an approved rung; there is nothing to promote',
      p_concession_id using errcode = 'check_violation';
  end if;
  if c.promoted_to_clause is not null then
    raise exception 'concession % was already promoted to %', p_concession_id, c.promoted_to_clause
      using errcode = 'unique_violation';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONLY SETTLED WORDING MAY ENTER THE LIBRARY (WP-SWEEP · WP-18a residual)
  -- ══════════════════════════════════════════════════════════════════════════
  -- WP-18a built the approval gate: a concession is merely PROPOSED until the
  -- Requester, the assigned attorney and every configured Required Approver
  -- have each signed off, at which point it is settled and in force
  -- (cw.concession_state, CLA §4). That gate was left guarding only whether a
  -- concession binds this deal — and promotion into the library, which is the
  -- far more consequential act, did not consult it.
  --
  -- The consequence was concrete: vendor wording that nobody had yet approved,
  -- and which could still be withdrawn, could be minted into the clause library
  -- as approved language for every future deal. Promotion is the one door into
  -- the library (ADR-0009) and it stood open behind the gate rather than in
  -- front of it.
  --
  -- Withdrawal is caught by the same test. cw.concession_state reports
  -- 'withdrawn' for a withdrawn row and never 'settled', so a withdrawn
  -- concession is refused here for the same reason a proposed one is: it is not
  -- in force, and language nobody stands behind is not library language.
  if not exists (select 1 from cw.concession_settlement s
                 where s.concession_id = p_concession_id) then
    raise exception
      'concession % is % — only a settled concession may be promoted into the '
      'library; approvals are still outstanding',
      p_concession_id,
      coalesce((select st.state from cw.concession_state st
                where st.concession_id = p_concession_id), 'unknown')
      using errcode = 'insufficient_privilege';
  end if;

  -- The promoted clause inherits the severity of the position it was conceded
  -- against. This was hard-coded to 'Standard' (WP-06, found in passing), so
  -- wording surrendered against a HIGH position — the language that matters
  -- most — was minted back into the library as ordinary Standard text, where a
  -- later deal could pick it up without anyone noticing the demotion.
  select cl.severity into sev
  from cw.clause cl where cl.clause_id = c.standard_clause_id;

  -- ONE MINTING FUNCTION, TWO ENTRANCES (WP-16).
  --
  -- This used to write cw.clause and cw.clause_version by hand. The Review
  -- queue in 0008 needs to write exactly the same rows under exactly the same
  -- rules, and two hand-written copies of "what a well-formed clause version
  -- looks like" would be free to drift the first time either was touched.
  -- cw.mint_clause_version() is the single shape, and cw.clause_entrance names
  -- which door each version came through.
  --
  -- Defined in 0008 rather than here, which is later in the migration order.
  -- That is safe because a plpgsql body resolves its calls when it RUNS, not
  -- when it is created, and nothing calls this function during migration.
  v := cw.mint_clause_version(
    p_clause_id    => p_new_clause_id,
    p_category_key => c.category_key,
    p_severity     => sev,
    p_title        => p_title,
    p_body         => c.vendor_text,
    p_rationale    => p_rationale,
    p_citations    => array['Policy-DERIVED-' || p_concession_id],
    p_reviewer     => p_reviewer,
    p_expires_on   => p_expires_on,
    p_provenance   => 'promoted',
    -- ADR-0010: wording surrendered to a vendor and then adopted is
    -- vendor_derived forever, whatever it is later superseded by.
    p_origin       => 'vendor_derived');

  update cw.concession set promoted_to_clause = p_new_clause_id || '@v' || v
  where concession_id = p_concession_id;

  perform cw.audit('concession_promoted', p_new_clause_id || '@v' || v,
    jsonb_build_object('concession_id', p_concession_id, 'reviewer', p_reviewer));

  return p_new_clause_id || '@v' || v;
end $$;

-- ── Negotiation intelligence (CLA §6) ───────────────────────────────────────
-- Deterministic aggregation. Counting and grouping only — no model, no text.
create or replace view cw.concession_rate as
select c.standard_clause_id, c.category_key,
       count(*)                                                    as concessions,
       count(*) filter (where c.vendor_text is not null)           as to_vendor_language,
       count(*) filter (where c.override_ref is not null)          as required_override,
       round(avg(c.conceded_rung), 2)                              as avg_rung,
       mode() within group (order by c.conceded_rung)              as settlement_rung
from cw.concession c
group by c.standard_clause_id, c.category_key;

-- Proposals the data supports. Evidence is always traceable to source records —
-- a recommendation without its concessions is an assertion, and this system
-- does not make assertions (CLA §10).
create or replace view cw.library_proposal as
select category_key, standard_clause_id, concessions, settlement_rung,
       case
         when to_vendor_language >= 3
           then 'Repeated vendor language accepted — candidate for a new approved rung'
         when required_override >= 3
           then 'Floor breached repeatedly and approved each time — the floor may be wrong'
         when settlement_rung is not null and settlement_rung > 0
           then 'Deals consistently settle below the opening position — rung 0 may be fiction'
       end as proposal
from cw.concession_rate
where to_vendor_language >= 3 or required_override >= 3
   or (settlement_rung is not null and settlement_rung > 0);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.agreement   enable row level security;
alter table cw.ladder      enable row level security;
alter table cw.ladder_rung enable row level security;
alter table cw.concession  enable row level security;

create policy read_all on cw.ladder for select using (cw.app_role() is not null);
create policy read_all on cw.ladder_rung for select using (cw.app_role() is not null);
create policy admin_writes on cw.ladder for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.ladder_rung for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');

create policy read_own on cw.agreement for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and requester = cw.app_actor()));
create policy requester_writes on cw.agreement for insert
  with check (cw.app_role() in ('requester','legal_admin'));

-- Ownership test for the requester branch below.
--
-- SECURITY DEFINER on purpose: without it the policy's subquery requires the
-- CALLER to hold SELECT on cw.agreement, so a role that lacks it is denied with
-- "permission denied for table agreement" — the right outcome for the wrong
-- reason, and one that would silently become the wrong outcome if the grants
-- ever changed. This makes the policy depend on ownership alone.
create or replace function cw.owns_agreement(p_agreement_id text) returns boolean
language sql stable security definer set search_path = cw, pg_temp as $$
  select exists (
    select 1 from cw.agreement a
    where a.agreement_id = p_agreement_id and a.requester = cw.app_actor())
$$;

-- Executable by every role, including viewer: Postgres may evaluate the call
-- even when the role branch ahead of it is false, and the function discloses
-- nothing beyond "does the CALLING actor own this agreement".
revoke all on function cw.owns_agreement(text) from public;
grant execute on function cw.owns_agreement(text) to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- Concession data is an aggregate of exactly what we give away under pressure.
-- Legal and Audit see everything; a Requester sees only their own deals;
-- a Viewer sees none of it (CLA §7).
create policy read_scoped on cw.concession for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and cw.owns_agreement(concession.agreement_id)));
create policy write_scoped on cw.concession for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

-- The promotion write, and nothing else (WP-06). Two policies, because they say
-- two different things and PostgreSQL combines them the way we need:
--
--   · promote_update is PERMISSIVE — it is what allows the update to happen at
--     all, and only for legal_admin. Without a permissive UPDATE policy the
--     table is default-deny and promotion silently affects nothing, which is
--     finding D1 exactly.
--   · promote_once is RESTRICTIVE — it is ANDed with the above and can only
--     ever subtract. `using` refuses to even see a row that is already
--     promoted; `with check` refuses to write a row that is not promoted after
--     the update. Together those two halves mean the column moves once, in one
--     direction, and can never be cleared to make room for a second promotion.
create policy promote_update on cw.concession for update
  using      (cw.app_role() = 'legal_admin')
  with check (cw.app_role() = 'legal_admin');

create policy promote_once on cw.concession as restrictive for update
  using      (promoted_to_clause is null)
  with check (promoted_to_clause is not null);

grant select on cw.ladder, cw.ladder_rung, cw.ladder_rung_state, cw.ladder_health
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert, update, delete on cw.ladder, cw.ladder_rung to cw_legal_admin;
grant usage, select on sequence cw.ladder_ladder_id_seq to cw_legal_admin;

grant select, insert on cw.agreement to cw_requester, cw_legal_admin;
grant select on cw.agreement to cw_legal_reviewer, cw_auditor;

grant select, insert on cw.concession
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.concession to cw_auditor;
-- COLUMN-LEVEL, deliberately (WP-06). A whole-table UPDATE grant would let
-- legal_admin rewrite the vendor's wording and the approver's name — the two
-- fields the concession record exists to preserve. One column, one purpose.
grant update (promoted_to_clause) on cw.concession to cw_legal_admin;
grant usage, select on sequence cw.concession_concession_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.concession_rate, cw.library_proposal
  to cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- Who may call the promotion function at all. This is the real gate, and it is
-- easy to lose: PostgreSQL grants EXECUTE on every new function to PUBLIC
-- automatically, so WITHOUT the revoke below every role in the system can call
-- it. The role check inside the function is a second line only. Since WP-04 it
-- reads the connection's real database role rather than a client-settable
-- claim, so it is no longer trivially bypassable — but a second line is still
-- what it is, and the revoke below is what actually closes the door.
revoke all on function cw.promote_concession(bigint, text, text, text, text, date)
  from public;
grant execute on function cw.promote_concession(bigint, text, text, text, text, date)
  to cw_legal_admin;

-- Deliberately absent: any grant of cw.concession or the analytics views to
-- cw_viewer. Viewers must not see the concession record at all.
