-- 0004 · Clause tags and attorney-authored conflict rules.
--
-- Answers open question 5: the rules that detect contradictions are written and
-- approved by attorneys, through the same gate as clause wording — not by
-- engineers editing code.
--
-- That forces a design choice. A rule cannot be a function, because a function
-- needs a developer. So a rule is DATA: a small declarative predicate over tags
-- that lawyers attach to clauses. The grammar is deliberately tiny — three
-- primitives, no logic, no loops, no expressions. Too restrictive and counsel
-- cannot say what they mean; too open and it becomes a programming language
-- with no gate. Three primitives cover all four rules in ARCHITECTURE.md §2.5.

-- ── Clause tags ─────────────────────────────────────────────────────────────
-- Attributes counsel attaches to approved wording: 'jurisdiction:ny',
-- 'indemnity:uncapped', 'data:regulated', 'insurance:cyber'. Rules match on
-- these rather than on clause text, so no rule ever parses prose.
create table cw.clause_tag (
  clause_id text not null,
  version   int  not null,
  tag       text not null check (tag ~ '^[a-z][a-z0-9_-]*(:[a-z0-9][a-z0-9._-]*)?$'),
  tagged_by text not null,
  tagged_on date not null default current_date,
  primary key (clause_id, version, tag),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version)
);

comment on table cw.clause_tag is
  'Tags are namespaced as "namespace:value". The namespace is what lets a rule
   say "these two clauses disagree about jurisdiction" without knowing which
   jurisdictions exist.';

create index on cw.clause_tag (tag);

-- ── Conflict rules ──────────────────────────────────────────────────────────
-- Versioned and immutable, exactly like clause wording. A rule change silently
-- alters which contracts are blocked, so it is change-controlled and every
-- finding cites the rule version that raised it.
create table cw.conflict_rule (
  rule_id     text not null check (rule_id ~ '^[A-Z]{2,4}-[0-9]{3}$'),
  version     int  not null check (version >= 1),
  name        text not null,
  severity    text not null check (severity in ('Standard','High')),
  title       text not null,
  detail      text not null,
  -- The predicate. Keys are fixed; anything else is rejected below.
  --   all_present        : every tag must appear in the decision set
  --   none_present       : none of these tags may appear
  --   conflicting_values : >1 distinct value within one tag namespace
  predicate   jsonb not null,
  approved_by text not null,
  approved_on date not null default current_date,
  effective_on date not null default current_date,
  retired     boolean not null default false,
  retired_reason text,
  created_at  timestamptz not null default now(),
  primary key (rule_id, version),
  constraint retired_needs_reason check (not retired or retired_reason is not null),
  -- Grammar enforcement. A predicate may only use the three known keys, and
  -- must use at least one — an empty predicate would match every contract.
  constraint predicate_grammar check (
    jsonb_typeof(predicate) = 'object'
    -- At least one primitive: an empty predicate would fire on every contract.
    and predicate ?| array['all_present','none_present','conflicting_values']
    -- And nothing else. Subtracting the permitted keys must leave nothing —
    -- expressed with the jsonb minus operator because CHECK constraints cannot
    -- contain a subquery.
    and (predicate - array['all_present','none_present','conflicting_values'])
        = '{}'::jsonb
    and (not predicate ? 'all_present' or jsonb_typeof(predicate->'all_present') = 'array')
    and (not predicate ? 'none_present' or jsonb_typeof(predicate->'none_present') = 'array')
    and (not predicate ? 'conflicting_values'
         or jsonb_typeof(predicate->'conflicting_values') = 'string')
  )
);

comment on column cw.conflict_rule.predicate is
  'Deliberately not a programming language. Three primitives, ANDed. Anything
   a lawyer cannot express here needs a new primitive, added deliberately —
   which is the point.';

-- Rules are immutable once written; retiring is the one permitted mutation.
create or replace function cw.conflict_rule_immutable() returns trigger
language plpgsql as $$
begin
  if new.rule_id is distinct from old.rule_id
     or new.version is distinct from old.version
     or new.predicate is distinct from old.predicate
     or new.severity is distinct from old.severity
     or new.title is distinct from old.title
     or new.detail is distinct from old.detail
     or new.approved_by is distinct from old.approved_by then
    raise exception 'conflict_rule %@v% is immutable; publish a new version instead',
      old.rule_id, old.version using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger conflict_rule_no_edit
  before update on cw.conflict_rule
  for each row execute function cw.conflict_rule_immutable();

create rule conflict_rule_no_delete as
  on delete to cw.conflict_rule do instead nothing;

-- The rules in force today: latest effective version of each rule, not retired.
create or replace view cw.active_conflict_rule as
select distinct on (rule_id)
       rule_id, version, name, severity, title, detail, predicate,
       approved_by, approved_on, effective_on
from cw.conflict_rule
where not retired and effective_on <= current_date
order by rule_id, version desc;

-- ── Audit ───────────────────────────────────────────────────────────────────
create or replace function cw.audit_conflict_rule() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('conflict_rule_published', new.rule_id || '@v' || new.version,
      jsonb_build_object('severity', new.severity, 'approved_by', new.approved_by,
                         'predicate', new.predicate));
  elsif new.retired and not old.retired then
    perform cw.audit('conflict_rule_retired', new.rule_id || '@v' || new.version,
      jsonb_build_object('reason', new.retired_reason));
  end if;
  return new;
end $$;

create trigger audit_conflict_rule
  after insert or update on cw.conflict_rule
  for each row execute function cw.audit_conflict_rule();

create or replace function cw.audit_clause_tag() returns trigger
language plpgsql as $$
begin
  perform cw.audit('clause_tagged', new.clause_id || '@v' || new.version,
    jsonb_build_object('tag', new.tag, 'tagged_by', new.tagged_by));
  return new;
end $$;

create trigger audit_clause_tag
  after insert on cw.clause_tag
  for each row execute function cw.audit_clause_tag();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.clause_tag    enable row level security;
alter table cw.conflict_rule enable row level security;

create policy read_all on cw.clause_tag for select using (cw.app_role() is not null);
create policy read_all on cw.conflict_rule for select using (cw.app_role() is not null);

-- Authoring a rule is a legal judgement expressed as data, so it sits behind
-- the same gate as activating clause wording.
create policy admin_writes on cw.clause_tag for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');
create policy admin_writes on cw.conflict_rule for all
  using (cw.app_role() = 'legal_admin') with check (cw.app_role() = 'legal_admin');

grant select on cw.clause_tag, cw.conflict_rule, cw.active_conflict_rule
  to cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert, update on cw.clause_tag, cw.conflict_rule to cw_legal_admin;
