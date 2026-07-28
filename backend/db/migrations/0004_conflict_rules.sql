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
-- Tags are policy inputs, and their audit event names tagged_by. Governed
-- publication therefore takes the author from the session rather than from a
-- second identity in the statement. Owner imports retain historical authors.
create or replace function cw.bind_clause_tag_author() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.tagged_by := cw.app_actor();
  end if;
  return new;
end $$;

create trigger clause_tag_bind_author
  before insert on cw.clause_tag
  for each row execute function cw.bind_clause_tag_author();

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
    -- ══════════════════════════════════════════════════════════════════════
    -- A RULE MUST ACTUALLY ASK SOMETHING (WP-23b · handed over by WP-20)
    -- ══════════════════════════════════════════════════════════════════════
    -- The `?|` conjunct above requires a predicate to USE one of the three
    -- primitives. It never required the primitive to SAY anything, and the
    -- three empty forms each defeat it by a different route:
    --
    --   · {"all_present": []}          the engine's loop over the tag list
    --                                  runs zero times and finds no violation
    --   · {"none_present": []}         the same, from the other side
    --   · {"conflicting_values": ""}   an empty namespace is falsy, so the
    --                                  primitive is skipped entirely
    --
    -- In every case cw's engine returns an empty tuple rather than None
    -- (validation.py `_evaluate`), and an empty tuple COUNTS AS THE RULE
    -- FIRING. A rule that asks nothing therefore raises a finding on every
    -- contract in the system — which is exactly the outcome the "at least one
    -- primitive" clause exists to prevent, arriving through a different door.
    --
    -- MATCHED IN THE ENGINE since 2026-07-27. CLA §4A.4 says the grammar is
    -- enforced in both layers on purpose, and `validation.py.__post_init__`
    -- now mirrors every conjunct below — the value shapes and the emptiness
    -- checks both — so a predicate built in Python from a fixture is refused
    -- the same way a row in this table is. Its own mutation checks watch it.
    and (not predicate ? 'all_present'
         or jsonb_array_length(predicate->'all_present') > 0)
    and (not predicate ? 'none_present'
         or jsonb_array_length(predicate->'none_present') > 0)
    and (not predicate ? 'conflicting_values'
         or btrim(predicate->>'conflicting_values') <> '')
  )
);

comment on column cw.conflict_rule.predicate is
  'Deliberately not a programming language. Three primitives, ANDed. Anything
   a lawyer cannot express here needs a new primitive, added deliberately —
   which is the point.';

-- Rules are immutable once written; retiring is the one permitted mutation.
--
-- WP-05 closed two holes here, both of which rewrote HISTORY rather than data.
--
--   · `effective_on` was unprotected. It decides which rules were in force on
--     any given day, and cw.active_conflict_rule reads it. Moving it backwards
--     changes the answer to "was this contract checked against the right rules
--     when we signed it?" — after the fact, invisibly. Every conflict finding
--     cites a rule version precisely so that question has a fixed answer, and
--     a movable date makes the citation worthless.
--
--   · Un-retiring was unguarded, exactly as on clause versions. Bringing a
--     withdrawn rule back into force is a publication decision, not an edit,
--     and it goes through the same gate as any other: a new version.
-- Publication attribution is observed from the governed session. The database
-- owner retains explicit values for migrations and historical imports, but a
-- Legal admin cannot place somebody else's name on a newly published rule.
create or replace function cw.bind_conflict_rule_approver() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.approved_by := cw.app_actor();
  end if;
  return new;
end $$;

create trigger conflict_rule_bind_approver
  before insert on cw.conflict_rule
  for each row execute function cw.bind_conflict_rule_approver();

create or replace function cw.conflict_rule_immutable() returns trigger
language plpgsql as $$
begin
  if old.retired and not new.retired then
    raise exception
      'conflict_rule %@v% is retired; bringing it back into force is a new '
      'publication — publish a new version instead',
      old.rule_id, old.version using errcode = 'restrict_violation';
  end if;
  if new.rule_id is distinct from old.rule_id
     or new.version is distinct from old.version
     or new.predicate is distinct from old.predicate
     or new.severity is distinct from old.severity
     or new.title is distinct from old.title
     or new.detail is distinct from old.detail
     or new.effective_on is distinct from old.effective_on
     or new.approved_by is distinct from old.approved_by then
    raise exception 'conflict_rule %@v% is immutable; publish a new version instead',
      old.rule_id, old.version using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger conflict_rule_no_edit
  before update on cw.conflict_rule
  for each row execute function cw.conflict_rule_immutable();

-- DELETE RAISES (WP-25c · settled decision S0-3). Was `do instead nothing`,
-- which returned success to a caller who had just failed to delete a published
-- rule. Every conflict finding cites the rule version that raised it, so a rule
-- version has to stay resolvable forever; refusing loudly says so, and a silent
-- no-op leaves an application bug looking exactly like a working system.
create or replace function cw.conflict_rule_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'conflict_rule %@v% cannot be deleted: past findings cite it and must stay '
    'resolvable. Retire it instead.',
    old.rule_id, old.version
    using errcode = 'restrict_violation';
end $$;

create trigger conflict_rule_no_delete
  before delete on cw.conflict_rule
  for each row execute function cw.conflict_rule_no_delete();

create trigger conflict_rule_no_truncate
  before truncate on cw.conflict_rule
  for each statement execute function cw.no_truncate();

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
  -- Both directions, for the reason given on cw.audit_clause_version(): a rule
  -- coming back into force used to leave no trace whatsoever. The un-retire
  -- branch is unreachable while the immutability guard above stands, and is
  -- kept as the second line for the same reason.
  elsif new.retired is distinct from old.retired then
    perform cw.audit(
      case when new.retired then 'conflict_rule_retired'
           else 'conflict_rule_unretired' end,
      new.rule_id || '@v' || new.version,
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
