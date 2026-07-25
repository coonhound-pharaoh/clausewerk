-- 0001 · Foundation: schema, roles, and the append-only audit log.
--
-- The audit log is created FIRST and deliberately. Every governed act in
-- Clausewerk writes here, and the guarantee that it cannot be edited is
-- enforced by table privileges rather than by application discipline —
-- see ADR-0008 and ARCHITECTURE.md §5 ("append-only, tamper-evident").

create schema if not exists cw;

-- ── Roles (ADR-0008) ────────────────────────────────────────────────────────
-- Five application roles. Created as real Postgres roles so that table-level
-- GRANT/REVOKE is a second line of defence underneath row-level security: a
-- role with no UPDATE privilege cannot update rows even if a policy is wrong.
do $$
declare r text;
begin
  foreach r in array array[
    'cw_viewer',         -- read contracts and clause text; change nothing
    'cw_requester',      -- run intake, request overrides
    'cw_legal_reviewer', -- adjudicate tickets, approve overrides
    'cw_legal_admin',    -- activate/retire/supersede clauses
    'cw_auditor'         -- read the full audit log; mutate nothing
  ] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

grant usage on schema cw to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- The acting role for row-level security.
--
-- Read from a session setting so this works identically under plain Postgres
-- (tests set it directly) and under Supabase (set it from the JWT claim on
-- each request). Returns null rather than raising when unset, so policies
-- fail closed instead of erroring.
create or replace function cw.app_role() returns text
language sql stable as $$
  select nullif(current_setting('cw.role', true), '')
$$;

create or replace function cw.app_actor() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('cw.actor', true), ''), 'unattributed')
$$;

-- ── Audit log ───────────────────────────────────────────────────────────────
-- Hash-chained: each row commits to the one before it, so removing or editing
-- any row breaks every hash after it. Detection, not prevention — prevention is
-- the revoked UPDATE/DELETE privilege below.
create table cw.audit_event (
  seq          bigserial primary key,
  ts           timestamptz  not null default now(),
  actor        text         not null,
  actor_role   text,
  -- 'controller' is reserved for acts taken WITHOUT a human. Machine acts can
  -- never be recorded as human ones (ADR-0008 §3).
  actor_kind   text         not null check (actor_kind in ('human','controller','system')),
  event_type   text         not null,
  subject      text,
  payload      jsonb        not null default '{}'::jsonb,
  prev_hash    text,
  hash         text         not null
);

comment on table cw.audit_event is
  'Append-only, hash-chained. UPDATE and DELETE are revoked from every role.';

-- Compute the chain on insert. Callers supply content; they never supply hashes.
create or replace function cw.audit_chain() returns trigger
language plpgsql as $$
declare prev text;
begin
  select hash into prev from cw.audit_event order by seq desc limit 1;
  new.prev_hash := prev;
  new.hash := encode(sha256(convert_to(
      coalesce(prev,'') || '|' || new.ts::text || '|' || new.actor || '|' ||
      new.actor_kind || '|' || new.event_type || '|' ||
      coalesce(new.subject,'') || '|' || new.payload::text, 'utf8')), 'hex');
  return new;
end $$;

create trigger audit_chain_before_insert
  before insert on cw.audit_event
  for each row execute function cw.audit_chain();

-- Verify the whole chain. Returns the first broken sequence number, or null.
create or replace function cw.audit_verify() returns bigint
language plpgsql stable as $$
declare r record; prev text := null; expect text;
begin
  for r in select * from cw.audit_event order by seq loop
    if r.prev_hash is distinct from prev then return r.seq; end if;
    expect := encode(sha256(convert_to(
        coalesce(prev,'') || '|' || r.ts::text || '|' || r.actor || '|' ||
        r.actor_kind || '|' || r.event_type || '|' ||
        coalesce(r.subject,'') || '|' || r.payload::text, 'utf8')), 'hex');
    if expect is distinct from r.hash then return r.seq; end if;
    prev := r.hash;
  end loop;
  return null;
end $$;

-- Convenience writer used by the rest of the schema.
create or replace function cw.audit(
  p_event_type text, p_subject text, p_payload jsonb default '{}'::jsonb,
  p_actor_kind text default 'human'
) returns void
language sql as $$
  insert into cw.audit_event (actor, actor_role, actor_kind, event_type, subject, payload)
  values (cw.app_actor(), cw.app_role(), p_actor_kind, p_event_type, p_subject, p_payload);
$$;

-- Immutability, enforced by privilege. Note there is no UPDATE or DELETE grant
-- anywhere below — not even for legal_admin. Nobody edits history.
revoke all on cw.audit_event from public;
grant insert, select on cw.audit_event to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant select on cw.audit_event to cw_auditor;
grant usage, select on sequence cw.audit_event_seq_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;

-- Viewers cannot read the log at all: it names who conceded what.
