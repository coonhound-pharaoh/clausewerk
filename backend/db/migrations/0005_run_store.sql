-- 0005 · Snapshots, rule sets, and the run store.
--
-- ARCHITECTURE.md §5: "given a manifest and a library snapshot ID, resolution
-- must be reproducible forever. Pin the library version into every run record."
--
-- Honouring that literally requires more than storing the id. A snapshot id is
-- a hash of the library's contents, and `selectable` depends on the clock — so
-- the hash CANNOT be recomputed later from the live registry. Tomorrow's
-- registry is a different library. To reproduce a run you must be able to
-- rebuild the exact pool it drew from.
--
-- So snapshots are stored, not just named. They are content-addressed, so the
-- library being slow to change means many runs share one row rather than each
-- carrying a copy.
--
-- The clause BODIES are not stored here. They live in cw.clause_version, which
-- is immutable and never deleted (ADR-0006) — a reference is enough, forever.
-- That is the payoff of immutable versions finally being cashed in.

-- ── Snapshots ───────────────────────────────────────────────────────────────
create table cw.snapshot (
  snapshot_id text primary key check (snapshot_id ~ '^[0-9a-f]{64}$'),
  taken_on    date,
  created_at  timestamptz not null default now()
);

create table cw.snapshot_member (
  snapshot_id text not null references cw.snapshot(snapshot_id),
  clause_id   text not null,
  version     int  not null,
  -- Frozen as it was AT RUN TIME. This is the field that cannot be recovered
  -- later, because it is a function of the date the snapshot was taken.
  selectable  boolean not null,
  primary key (snapshot_id, clause_id, version),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version),
  -- The same CHECK discipline the rest of the schema carries (WP-23, D8). The
  -- run store was written without it, so it was the one place a nonsense row
  -- could land — and it is the place where nonsense is hardest to notice,
  -- because nobody reads a stored run until a dispute.
  constraint member_version_positive check (version >= 1)
);

create table cw.snapshot_ladder_rung (
  snapshot_id  text not null references cw.snapshot(snapshot_id),
  category_key text not null references cw.category(key),
  -- Severity is a closed set everywhere else in the schema (cw.clause,
  -- cw.ladder). It was free text here, so a pinned ladder could be stored at a
  -- severity no ladder can have — and a stored run is the artefact that has to
  -- survive longest and is checked least.
  severity     text not null check (severity in ('Standard','High','Baseline')),
  rung         int  not null check (rung >= 0),
  clause_id    text not null,
  version      int  not null check (version >= 1),
  is_floor     boolean not null default false,
  primary key (snapshot_id, category_key, severity, rung),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version)
);

comment on table cw.snapshot_ladder_rung is
  'Ladders are pinned as well as clauses. A ladder decides which clauses are
   ELIGIBLE, so pinning the library alone would let the same manifest resolve
   differently next quarter (CLA §9).';

-- ── Rule sets ───────────────────────────────────────────────────────────────
create table cw.ruleset (
  ruleset_id text primary key check (ruleset_id ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table cw.ruleset_member (
  ruleset_id text not null references cw.ruleset(ruleset_id),
  rule_id    text not null,
  version    int  not null check (version >= 1),
  primary key (ruleset_id, rule_id, version),
  foreign key (rule_id, version) references cw.conflict_rule(rule_id, version)
);

-- ── Runs ────────────────────────────────────────────────────────────────────
create table cw.run (
  run_id       text primary key check (btrim(run_id) <> ''),
  agreement_id text references cw.agreement(agreement_id),
  vendor       text not null,
  value        text,
  -- The manifest verbatim, including its `source`. A run assembled from the
  -- fallback classifier is a different artefact from one the model produced,
  -- and the difference must survive into the record.
  manifest     jsonb not null,
  manifest_source text not null check (manifest_source in ('llm','fallback','manual')),
  -- Both pins are mandatory. A run that cannot name the library AND the rules
  -- that produced it is not reproducible, and recording it would be a lie.
  snapshot_id  text not null references cw.snapshot(snapshot_id),
  ruleset_id   text not null references cw.ruleset(ruleset_id),
  -- A result hash is a SHA-256 or it is not a result hash. cw.snapshot and
  -- cw.ruleset have carried this shape check since they were written; the
  -- column that names what the run PRODUCED did not, which is backwards.
  result_hash  text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  -- ── Which engine produced that hash (WP-32) ──
  -- Three packages have now changed how `result_hash` is computed, and until
  -- this column existed nothing recorded which version of the code produced a
  -- given one. Two runs of two different engines were indistinguishable in
  -- storage: a stored hash that no longer reproduces looks exactly like
  -- tampering, and a hash that reproduces by luck looks exactly like proof.
  --
  -- NOT NULL and no default, deliberately. A default would let a writer that
  -- does not know its own version record a run anyway, and the column would
  -- then mean "whatever the schema guessed" — which is worse than absent,
  -- because it reads like a fact. `engine.model.ENGINE_VERSION` supplies it.
  engine_version text not null check (btrim(engine_version) <> ''),
  gate_open    boolean not null,
  overridden   boolean not null default false,
  override_ref text,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  constraint override_needs_ref check (not overridden or override_ref is not null)
);

-- ── Indexes on the lookups this schema actually performs (WP-25a · D9) ──────
-- Not speculative. Each of these backs a query that already exists in a view,
-- a policy or a test in this repository, and every one of them is a foreign-key
-- column — PostgreSQL indexes the referenced side automatically and the
-- referencing side never.
create index on cw.run (agreement_id);
create index on cw.run (snapshot_id);
create index on cw.run (ruleset_id);
-- cw.run's row-level policy filters on created_by for a requester, and the
-- portfolio question "what has this person run?" is the common one.
create index on cw.run (created_by);

create or replace function cw.bind_run_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.created_by := cw.app_actor();
  end if;
  return new;
end $$;

create trigger run_bind_actor
  before insert on cw.run
  for each row execute function cw.bind_run_actor();

create table cw.run_decision (
  run_id        text not null references cw.run(run_id),
  seq           int  not null check (seq >= 0),
  -- The KEY, with an FK, like every other category column in the schema. It
  -- was a free-text label, which is how the engine could emit a label here and
  -- a key next door and both suites stay green. A decision that cannot be tied
  -- to a defined category is not auditable — and a hallucinated category must
  -- not be storable at all (see cw.run.manifest, which records what was
  -- dropped at the trust boundary).
  category_key  text not null references cw.category(key),
  -- Closed set, as on cw.clause. A decision recorded at a severity the library
  -- cannot express is not auditable, and this column is read by every report.
  severity      text not null check (severity in ('Standard','High','Baseline')),
  justification text,
  -- Null when nothing could be selected: a hard flag, never a substitution.
  clause_id     text,
  version       int check (version is null or version >= 1),
  reason        text not null check (btrim(reason) <> ''),
  baseline      boolean not null default false,
  expired_only  boolean not null default false,
  warning       text,
  -- Candidates that lost. Retained because the audit question is usually
  -- "why NOT the stricter one?" (ADR-0004).
  suppressed    text[] not null default '{}',
  primary key (run_id, seq),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version),
  constraint selection_is_whole check ((clause_id is null) = (version is null))
);

create table cw.run_finding (
  run_id       text not null references cw.run(run_id),
  seq          int  not null check (seq >= 0),
  rule_id      text not null,
  rule_version int  not null check (rule_version >= 1),
  severity     text not null check (severity in ('Standard','High')),
  title        text not null check (btrim(title) <> ''),
  detail       text,
  refs         text[] not null default '{}',
  primary key (run_id, seq),
  -- Points at the exact rule version. A rule change alters which contracts
  -- block, so a finding that cannot name its version is unauditable.
  foreign key (rule_id, rule_version) references cw.conflict_rule(rule_id, version)
);

-- ── Immutability ────────────────────────────────────────────────────────────
-- A run is a historical record of what happened. Nothing about it may change.
--
-- DELETE RAISES, and TRUNCATE raises (WP-25b/c · settled decision S0-3).
--
-- The DELETE half was `do instead nothing` on all eight tables. The UPDATE half
-- has always raised, so the two halves of one guarantee behaved differently for
-- no stated reason: rewriting a run was an error, erasing one was a success
-- message. cw.run_immutable() now serves both, and the message it raises names
-- the table and the operation.
--
-- TRUNCATE is added because it was the way around both. It fires neither row
-- triggers nor ON DELETE rules, so `truncate cw.run cascade` would have emptied
-- the entire run store — every stored snapshot, every decision, every finding —
-- against a schema that claims runs are a permanent record.
create or replace function cw.run_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'runs are immutable: % is a record of what happened and cannot be %',
    tg_table_name,
    case tg_op when 'UPDATE' then 'rewritten'
               when 'TRUNCATE' then 'emptied'
               else 'deleted' end
    using errcode = 'restrict_violation';
end $$;

do $$
declare t text;
begin
  foreach t in array array['snapshot','snapshot_member','snapshot_ladder_rung',
                           'ruleset','ruleset_member','run','run_decision','run_finding'] loop
    execute format(
      'create trigger %I_no_edit before update on cw.%I
       for each row execute function cw.run_immutable()', t, t);
    execute format(
      'create trigger %I_no_delete before delete on cw.%I
       for each row execute function cw.run_immutable()', t, t);
    execute format(
      'create trigger %I_no_truncate before truncate on cw.%I
       for each statement execute function cw.run_immutable()', t, t);
  end loop;
end $$;

-- ── Reproducibility ─────────────────────────────────────────────────────────
-- Rebuild the exact pool a run drew from. Because clause versions are immutable
-- and never deleted, this resolves correctly however much the library has moved
-- on — which is the whole point of ADR-0006.
create or replace view cw.run_snapshot as
select r.run_id, m.snapshot_id, m.clause_id, m.version, m.selectable,
       c.label as category, cv.severity, cv.title, cv.body
from cw.run r
join cw.snapshot_member m on m.snapshot_id = r.snapshot_id
join cw.clause_version  v on v.clause_id = m.clause_id and v.version = m.version
join cw.clause          cv_c on cv_c.clause_id = m.clause_id
join cw.category        c on c.key = cv_c.category_key
join lateral (select cv_c.severity, v.title, v.body) cv on true;

-- What a run actually issued, resolvable forever.
create or replace view cw.run_contract as
select d.run_id, d.seq, c.label as category, d.severity, d.reason, d.baseline,
       d.clause_id, d.version,
       v.title, v.body, d.warning, d.suppressed
from cw.run_decision d
join cw.category c on c.key = d.category_key
left join cw.clause_version v on v.clause_id = d.clause_id and v.version = d.version
order by d.run_id, d.seq;

create or replace view cw.run_summary as
select r.run_id, r.vendor, r.agreement_id, r.manifest_source,
       r.snapshot_id, r.ruleset_id, r.result_hash, r.engine_version,
       r.gate_open, r.overridden, r.created_by, r.created_at,
       (select count(*) from cw.run_decision d where d.run_id = r.run_id)                    as decisions,
       (select count(*) from cw.run_decision d where d.run_id = r.run_id and d.clause_id is null) as unresolved,
       (select count(*) from cw.run_finding f where f.run_id = r.run_id)                     as findings,
       (select count(*) from cw.run_finding f where f.run_id = r.run_id and f.severity = 'High') as blocking
from cw.run r;

-- ── Audit ───────────────────────────────────────────────────────────────────
create or replace function cw.audit_run() returns trigger
language plpgsql as $$
begin
  perform cw.audit('run_recorded', new.run_id, jsonb_build_object(
    'vendor', new.vendor, 'snapshot', new.snapshot_id, 'ruleset', new.ruleset_id,
    'result_hash', new.result_hash, 'gate_open', new.gate_open,
    'overridden', new.overridden, 'manifest_source', new.manifest_source,
    'engine_version', new.engine_version));
  return new;
end $$;

create trigger audit_run after insert on cw.run
  for each row execute function cw.audit_run();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.run          enable row level security;
alter table cw.run_decision enable row level security;
alter table cw.run_finding  enable row level security;

-- A run names a vendor and what we agreed with them; scoped like concessions.
create policy read_scoped on cw.run for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester'
      and (created_by = cw.app_actor()
           or (agreement_id is not null and cw.owns_agreement(agreement_id)))));
create policy write_scoped on cw.run for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

create policy read_scoped on cw.run_decision for select using (
  exists (select 1 from cw.run r where r.run_id = run_decision.run_id));
create policy write_scoped on cw.run_decision for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
create policy read_scoped on cw.run_finding for select using (
  exists (select 1 from cw.run r where r.run_id = run_finding.run_id));
create policy write_scoped on cw.run_finding for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

grant select, insert on cw.snapshot, cw.snapshot_member, cw.snapshot_ladder_rung,
                        cw.ruleset, cw.ruleset_member,
                        cw.run, cw.run_decision, cw.run_finding
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.snapshot, cw.snapshot_member, cw.snapshot_ladder_rung,
                cw.ruleset, cw.ruleset_member,
                cw.run, cw.run_decision, cw.run_finding,
                cw.run_snapshot, cw.run_contract, cw.run_summary
  to cw_auditor;
grant select on cw.run_contract, cw.run_summary
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
