-- 0002 · Clause registry: categories, clauses, immutable versions, supersession.
--
-- Implements ADR-0006 (versions immutable, validity computed) and ADR-0009
-- (concession ≠ promotion ≠ supersession; four-state model).

-- ── Categories ──────────────────────────────────────────────────────────────
create table cw.category (
  key    text primary key,
  label  text not null unique,          -- the canonical string manifests must match
  short  text not null unique           -- UNIQUE: this is what made AC ambiguous
                                        -- across Acceptance and Anti-Corruption
                                        -- (spec-vs-implementation finding #4).
           check (short ~ '^[A-Z]{2}$')
);

comment on column cw.category.short is
  'Two-letter code embedded in clause IDs. Unique by constraint so a clause ID
   always identifies exactly one category.';

-- ── Clause identity ─────────────────────────────────────────────────────────
-- The stable thing a contract, an obligation, or an auditor refers to.
-- Carries no text: text lives on versions and is never edited in place.
create table cw.clause (
  clause_id         text primary key check (clause_id ~ '^[A-Z]{2}-[A-Z]-[0-9]{3}$'),
  category_key      text not null references cw.category(key),
  severity          text not null check (severity in ('Standard','High','Baseline')),
  always_include    boolean not null default false,   -- Baseline Framework member
  framework_section text,
  created_at        timestamptz not null default now()
);

create index on cw.clause (category_key, severity);

-- ════════════════════════════════════════════════════════════════════════════
-- THE ID MUST AGREE WITH THE CATEGORY (WP-23 · finding D8)
-- ════════════════════════════════════════════════════════════════════════════
-- `cw.category.short` is documented two declarations above as "the two-letter
-- code embedded in clause IDs", and is UNIQUE precisely so that "a clause ID
-- always identifies exactly one category". Both sentences were true of the
-- intent and false of the schema: nothing checked that `DP-H-014` actually sat
-- in the category whose short code is `DP`.
--
-- That is not cosmetic. Every human in this system reads the ID, not the
-- foreign key. A clause filed as `DP-H-014` in the Liability Cap category
-- appears in a Data Privacy search by eye and in a Liability report by query,
-- and the two answers disagree with nobody at fault. Worse, it makes the
-- comment above a false statement of a property people rely on.
--
-- A CHECK constraint cannot do this: it would have to read cw.category, and
-- check constraints may not contain a subquery. So it is a trigger, on INSERT
-- and on UPDATE — the category_key is movable, and moving a clause to a
-- category whose short code disagrees is the same defect arriving later.
create or replace function cw.clause_id_agrees_with_category() returns trigger
language plpgsql as $$
declare want text;
begin
  select c.short into want from cw.category c where c.key = new.category_key;
  if want is not null and left(new.clause_id, 2) <> want then
    raise exception
      'clause id % does not agree with its category: % is filed under short '
      'code %, so the id must begin %-',
      new.clause_id, new.category_key, want, want
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger clause_id_agrees_with_category
  before insert or update on cw.clause
  for each row execute function cw.clause_id_agrees_with_category();

-- ── Clause versions (immutable) ─────────────────────────────────────────────
create table cw.clause_version (
  clause_id      text    not null references cw.clause(clause_id),
  version        int     not null check (version >= 1),
  title          text    not null,
  body           text    not null,          -- THE only string that may reach a contract
  rationale      text,                      -- shown to reviewers, never inserted
  citations      text[]  not null default '{}',
  reviewer       text,
  -- Dates are nullable ON PURPOSE. Fabricating a creation date for a clause
  -- that has none is what birth-expired 54 seeded clauses in the prototype
  -- (finding #8). Unknown provenance is a data-quality problem, not an expiry.
  approved_on    date,
  expires_on     date,
  -- How this wording got here. 'reviewed' is the Review-queue entrance built in
  -- 0008; 'promoted' is the concession entrance (ADR-0009); 'seeded' is the
  -- library as it was first loaded. Distinct from `origin` (0009), which says
  -- who or what composed the words — a lawyer, a model, a vendor. A clause can
  -- be `reviewed` in provenance and `ai_drafted` in origin, and both facts
  -- matter to a different question.
  provenance     text not null default 'seeded'
                   check (provenance in ('seeded','promoted','reviewed')),
  retired        boolean not null default false,
  retired_reason text,
  retired_on     date,
  created_at     timestamptz not null default now(),
  primary key (clause_id, version),
  constraint expiry_after_approval check (
    approved_on is null or expires_on is null or expires_on > approved_on),
  constraint retired_needs_reason check (
    not retired or retired_reason is not null)
);

comment on table cw.clause_version is
  'Append-only. A contract executed under v1 must resolve v1 forever (ADR-0006),
   so body/title/citations are immutable once written. Retirement is the one
   permitted mutation and is itself audited.';

-- Immutability, enforced. Retiring is allowed; rewriting history is not.
--
-- WP-05 closed two holes here.
--
--   · `reviewer` was unprotected. That is the named human who stands behind
--     this wording. If it can be rewritten after approval, the provenance
--     chain an auditor walks — obligation → clause → policy → REVIEWER →
--     approval date — is a claim the system cannot support. It is now as
--     immutable as the body it approves.
--
--   · Retirement was a one-way door in intent only. Nothing stopped an UPDATE
--     setting `retired` back to false, which silently returns withdrawn
--     language to the selectable pool. Withdrawing wording is a deliberate
--     legal act; putting it back is a NEW approval and must go through the
--     same gate as any other — a new version. So un-retiring is refused
--     outright, and the correct move is stated in the error message.
create or replace function cw.clause_version_immutable() returns trigger
language plpgsql as $$
begin
  if old.retired and not new.retired then
    raise exception
      'clause_version %@v% is retired; un-retiring it is not an edit but a new '
      'approval — create a new version instead',
      old.clause_id, old.version
      using errcode = 'restrict_violation';
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
     or new.provenance is distinct from old.provenance then
    raise exception
      'clause_version %@v% is immutable; create a new version and supersede it',
      old.clause_id, old.version
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger clause_version_no_edit
  before update on cw.clause_version
  for each row execute function cw.clause_version_immutable();

-- DELETE RAISES (WP-25c · settled decision S0-3).
--
-- This was `on delete to cw.clause_version do instead nothing` — a rule that
-- swallowed the statement and reported success. Finding D9 names that pattern
-- for what it is: an application bug that deletes clause versions becomes
-- indistinguishable from an application that never tried. The caller gets
-- "DELETE 0" either way, and nobody is ever told.
--
-- The guarantee is unchanged — a version still cannot be removed — but now the
-- attempt is audible. A rule is replaced by a trigger because a rule cannot
-- raise per row and a trigger can name what was refused.
create or replace function cw.clause_version_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'clause_version %@v% cannot be deleted: a contract executed under it must '
    'resolve it forever (ADR-0006). Retire it instead.',
    old.clause_id, old.version
    using errcode = 'restrict_violation';
end $$;

create trigger clause_version_no_delete
  before delete on cw.clause_version
  for each row execute function cw.clause_version_no_delete();

create trigger clause_version_no_truncate
  before truncate on cw.clause_version
  for each statement execute function cw.no_truncate();

create trigger clause_no_truncate
  before truncate on cw.clause
  for each statement execute function cw.no_truncate();

-- ── Supersession (ADR-0009) ─────────────────────────────────────────────────
-- A deliberate Legal act replacing one version with another. NOT what happens
-- when a vendor's redline is accepted — that is a concession (migration 0003).
create table cw.supersession (
  id                       bigserial primary key,
  clause_id                text not null references cw.clause(clause_id),
  predecessor_version      int  not null,
  successor_version        int  not null,
  reason                   text not null,          -- mandatory: "why did this change?"
  approver                 text not null,
  decided_on               date not null default current_date,
  effective_on             date not null default current_date,
  -- retire_now: predecessor stops being selectable immediately.
  -- run_off:    predecessor stays selectable until its own expiry.
  predecessor_disposition  text not null default 'retire_now'
                             check (predecessor_disposition in ('retire_now','run_off')),
  foreign key (clause_id, predecessor_version) references cw.clause_version(clause_id, version),
  foreign key (clause_id, successor_version)   references cw.clause_version(clause_id, version),
  constraint successor_is_newer check (successor_version > predecessor_version),
  unique (clause_id, predecessor_version)   -- a version is superseded at most once
);

-- ── Computed state (ADR-0006: validity is computed, never stored) ───────────
--
-- Four states, because "replaced by something better" and "withdrawn" are
-- different answers to an auditor (ADR-0009):
--   superseded · replaced by a newer version
--   retired    · withdrawn, not replaced
--   expired    · lapsed on its own date
--   active     · current approved position
-- Supersession is an authorising act, not an assignment. Governed publication
-- records the authenticated Legal actor and cannot put a colleague's name on
-- the decision. Owner-mode migrations and historical imports retain explicit
-- attribution.
create or replace function cw.bind_supersession_approver() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.approver := cw.app_actor();
    new.decided_on := current_date;
  end if;
  return new;
end $$;

create trigger supersession_bind_approver
  before insert on cw.supersession
  for each row execute function cw.bind_supersession_approver();

-- A supersession changes which approved wording can be selected. Once
-- published, every field is historical evidence and corrections are new
-- clause versions and a new decision, never edits to the old decision.
create or replace function cw.supersession_immutable() returns trigger
language plpgsql as $$
begin
  raise exception
    'supersession % (%@v% to v%) is immutable; publish a new clause version '
    'and decision instead',
    old.id, old.clause_id, old.predecessor_version, old.successor_version
    using errcode = 'restrict_violation';
end $$;

create trigger supersession_no_edit
  before update on cw.supersession
  for each row execute function cw.supersession_immutable();

create or replace function cw.supersession_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'supersession % cannot be deleted: clause history must stay resolvable',
    old.id using errcode = 'restrict_violation';
end $$;

create trigger supersession_no_delete
  before delete on cw.supersession
  for each row execute function cw.supersession_no_delete();

create trigger supersession_no_truncate
  before truncate on cw.supersession
  for each statement execute function cw.no_truncate();

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
  -- Expiry only exists where a date does. No date means unprovenanced, which
  -- is a different condition and is flagged rather than silently expired.
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
  -- What resolution actually asks. A run-off predecessor is superseded but
  -- still usable until it expires on its own.
  (not v.retired
   and (v.expires_on is null or v.expires_on >= current_date)
   and (s.id is null or s.predecessor_disposition = 'run_off'
        or s.effective_on > current_date))                            as selectable
from cw.clause_version v
join cw.clause c using (clause_id)
left join cw.supersession s
  on s.clause_id = v.clause_id and s.predecessor_version = v.version;

-- The pool resolution draws from. Strict mode is the default and the only
-- default: retired and expired language is not selectable
-- (spec-vs-implementation finding #1).
create or replace view cw.selectable_clause as
select * from cw.clause_version_state where selectable;

-- Coverage gaps: category × severity with no selectable clause behind it.
create or replace view cw.coverage_gap as
select cat.key as category_key, cat.label, sev.severity
from cw.category cat
cross join (values ('Standard'),('High')) as sev(severity)
where not exists (
  select 1 from cw.selectable_clause s
  where s.category_key = cat.key and s.severity = sev.severity
    and not s.always_include);

-- ── Audit hooks ─────────────────────────────────────────────────────────────
create or replace function cw.audit_clause_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('clause_version_created',
      new.clause_id || '@v' || new.version,
      jsonb_build_object('provenance', new.provenance, 'reviewer', new.reviewer));
  -- BOTH directions of the retired flag are recorded (WP-05). The hook used to
  -- fire only on the way out — so a clause coming BACK left no trace at all.
  --
  -- The un-retire branch is unreachable while cw.clause_version_no_edit stands,
  -- because that trigger refuses the change before this one runs. It is here on
  -- purpose, as the second line: if the guard is ever disabled, dropped, or
  -- worked around from below the application, the log still says what happened.
  -- The test proves it by disabling the guard and checking the record appears.
  elsif new.retired is distinct from old.retired then
    perform cw.audit(
      case when new.retired then 'clause_retired' else 'clause_unretired' end,
      new.clause_id || '@v' || new.version,
      jsonb_build_object('reason', new.retired_reason));
  end if;
  return new;
end $$;

create trigger audit_clause_version
  after insert or update on cw.clause_version
  for each row execute function cw.audit_clause_version();

create or replace function cw.audit_supersession() returns trigger
language plpgsql as $$
begin
  perform cw.audit('clause_superseded',
    new.clause_id || '@v' || new.predecessor_version,
    jsonb_build_object(
      'successor', new.clause_id || '@v' || new.successor_version,
      'reason', new.reason, 'approver', new.approver,
      'disposition', new.predecessor_disposition));
  return new;
end $$;

create trigger audit_supersession
  after insert on cw.supersession
  for each row execute function cw.audit_supersession();

-- ── Row-level security (ADR-0008) ───────────────────────────────────────────
alter table cw.category        enable row level security;
alter table cw.clause          enable row level security;
alter table cw.clause_version  enable row level security;
alter table cw.supersession    enable row level security;

-- Everyone who is anybody may read clause text. Reading is not the risk here.
create policy read_all on cw.category for select
  using (cw.app_role() is not null);
create policy read_all on cw.clause for select
  using (cw.app_role() is not null);
create policy read_all on cw.clause_version for select
  using (cw.app_role() is not null);
create policy read_all on cw.supersession for select
  using (cw.app_role() is not null);

-- Only Legal admin changes the library. Legal reviewers adjudicate tickets;
-- they do not activate, retire, or supersede clauses.
create policy admin_writes on cw.clause for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.clause_version for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.supersession for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.category for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');

grant select on cw.category, cw.clause, cw.clause_version, cw.supersession,
                cw.clause_version_state, cw.selectable_clause, cw.coverage_gap
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

grant insert, update on cw.category, cw.clause, cw.clause_version, cw.supersession
  to cw_legal_admin;
grant usage, select on sequence cw.supersession_id_seq to cw_legal_admin;
