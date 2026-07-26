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
  foreign key (clause_id, version) references cw.clause_version(clause_id, version)
);

create table cw.snapshot_ladder_rung (
  snapshot_id  text not null references cw.snapshot(snapshot_id),
  category_key text not null references cw.category(key),
  severity     text not null,
  rung         int  not null,
  clause_id    text not null,
  version      int  not null,
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
  version    int  not null,
  primary key (ruleset_id, rule_id, version),
  foreign key (rule_id, version) references cw.conflict_rule(rule_id, version)
);

-- ── Runs ────────────────────────────────────────────────────────────────────
create table cw.run (
  run_id       text primary key,
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
  result_hash  text not null,
  gate_open    boolean not null,
  overridden   boolean not null default false,
  override_ref text,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  constraint override_needs_ref check (not overridden or override_ref is not null)
);

create index on cw.run (agreement_id);
create index on cw.run (snapshot_id);

create table cw.run_decision (
  run_id        text not null references cw.run(run_id),
  seq           int  not null,
  category      text not null,
  severity      text not null,
  justification text,
  -- Null when nothing could be selected: a hard flag, never a substitution.
  clause_id     text,
  version       int,
  reason        text not null,
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
  seq          int  not null,
  rule_id      text not null,
  rule_version int  not null,
  severity     text not null check (severity in ('Standard','High')),
  title        text not null,
  detail       text,
  refs         text[] not null default '{}',
  primary key (run_id, seq),
  -- Points at the exact rule version. A rule change alters which contracts
  -- block, so a finding that cannot name its version is unauditable.
  foreign key (rule_id, rule_version) references cw.conflict_rule(rule_id, version)
);

-- ── Immutability ────────────────────────────────────────────────────────────
-- A run is a historical record of what happened. Nothing about it may change.
create or replace function cw.run_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'runs are immutable: % is a record of what happened', tg_table_name
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
      'create rule %I_no_delete as on delete to cw.%I do instead nothing', t, t);
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
select d.run_id, d.seq, d.category, d.severity, d.reason, d.baseline,
       d.clause_id, d.version,
       v.title, v.body, d.warning, d.suppressed
from cw.run_decision d
left join cw.clause_version v on v.clause_id = d.clause_id and v.version = d.version
order by d.run_id, d.seq;

create or replace view cw.run_summary as
select r.run_id, r.vendor, r.agreement_id, r.manifest_source,
       r.snapshot_id, r.ruleset_id, r.result_hash,
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
    'overridden', new.overridden, 'manifest_source', new.manifest_source));
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
