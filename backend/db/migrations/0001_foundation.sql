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

-- ── Identity (WP-04, finding D3) ────────────────────────────────────────────
-- The acting role for row-level security, derived from the authenticated
-- connection.
--
-- WHAT THIS USED TO BE, AND WHY IT WAS WRONG
-- This function read `current_setting('cw.role')` — a session variable that any
-- connected client can set for itself with one statement. Every policy in this
-- schema trusts what it returns, so the answer to "who are you" was supplied by
-- the person being asked. Two concrete consequences, both reproduced: a
-- cw_legal_reviewer could claim to be legal_admin, and every read policy that
-- scopes a requester to their own deals could be stepped over by anyone able to
-- run SQL on the connection.
--
-- WHAT IT IS NOW
-- The session's actual database role. `set role` genuinely changes it, and a
-- client can only `set role` to a role it has really been granted — so the
-- answer now comes from the grant, not from the claim. The owner deliberately
-- maps to NO application role (settled decision U3): the owner is not a person
-- acting in the business, and governed writes that need a role are run as one.
-- Policies still fail closed on null.
--
-- current_user, NOT session_user, because `set role` is what binds here.
-- Deliberately not pg_has_role(): a superuser is implicitly a member of every
-- role, so pg_has_role would hand the owner legal_admin — the opposite of U3.
--
-- THE PRODUCTION SHAPE. Under a hosted Postgres with JWT-authenticated requests
-- the same accessor reads the verified claim instead, e.g.
--
--     select case current_setting('request.jwt.claims', true)::jsonb ->> 'cw_role'
--              when 'legal_admin' then 'legal_admin' ... end
--
-- which is safe for the same reason: the claim is signed and the gateway sets
-- it, not the client. That variant is described rather than built, because
-- nothing in this repository can verify a signature (see 0007 on pgcrypto).
--
-- WHAT THIS STILL ASSUMES — see ARCHITECTURE.md §5. It assumes one connection
-- carries one authenticated identity. It is incompatible with transaction-mode
-- connection pooling, which hands the same physical connection to different
-- clients and leaks `set role` and session settings between them.
create or replace function cw.app_role() returns text
language sql stable as $$
  select case current_user
    when 'cw_viewer'         then 'viewer'
    when 'cw_requester'      then 'requester'
    when 'cw_legal_reviewer' then 'legal_reviewer'
    when 'cw_legal_admin'    then 'legal_admin'
    when 'cw_auditor'        then 'auditor'
  end
$$;

-- The acting PERSON, as distinct from the acting role.
--
-- HONEST RESIDUAL: this is still self-asserted. There is no database-level
-- identity for a named human here — the five roles are shared service roles —
-- so the person's name arrives as a session setting the application sets, and a
-- client with SQL access can set it to someone else's name. What WP-04 closes
-- is the ROLE half: an actor can lie about their name, but not about the
-- authority they acted with, because 0007 binds the recorded actor_role to this
-- connection's real role. Closing the name half needs per-user database roles
-- or a signed claim, and is written up in ARCHITECTURE.md §5.
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

-- ════════════════════════════════════════════════════════════════════════════
-- TRUNCATE, BROUGHT INSIDE THE IMMUTABILITY STORY (WP-25b · finding D9)
-- ════════════════════════════════════════════════════════════════════════════
-- Every append-only table in this schema is defended by a row-level trigger or
-- a revoked privilege. TRUNCATE respects neither. It is not a DELETE: row
-- triggers never fire, ON DELETE rules never apply, and the table is emptied in
-- one statement that leaves no per-row trace. A schema that raises loudly on
-- `delete from cw.clause_version` and empties the same table without complaint
-- on `truncate cw.clause_version` does not have an immutability guarantee; it
-- has an immutability habit.
--
-- The defence has to be a STATEMENT-level trigger, because that is the only
-- kind TRUNCATE fires. One function, reused by every table that claims to be
-- append-only, so a table added later inherits the story by naming it rather
-- than by re-deriving it.
create or replace function cw.no_truncate() returns trigger
language plpgsql as $$
begin
  raise exception
    'cw.% is append-only and cannot be truncated: emptying it would destroy '
    'the record the table exists to keep', tg_table_name
    using errcode = 'restrict_violation';
end $$;

comment on function cw.no_truncate() is
  'Statement-level TRUNCATE guard for append-only tables. TRUNCATE bypasses row
   triggers and ON DELETE rules entirely, so a delete guard alone leaves the
   table erasable in one statement (finding D9).';

create trigger audit_event_no_truncate
  before truncate on cw.audit_event
  for each statement execute function cw.no_truncate();

-- ════════════════════════════════════════════════════════════════════════════
-- THE HASH CHAIN, SPECIFIED
-- ════════════════════════════════════════════════════════════════════════════
-- Everything in Clausewerk that claims "you can prove this was not altered"
-- rests on this scheme, so it is written down here rather than left to be
-- reverse-engineered from the code.
--
-- WHAT IS HASHED, IN THIS ORDER
--   1 prev_hash   the hash of the row before this one ('' for the first row)
--   2 seq         this row's sequence number
--   3 ts_micros   the timestamp as microseconds since 1970, NOT as text
--   4 actor       who did it
--   5 actor_role  the role they did it as
--   6 actor_kind  human / controller / system
--   7 event_type  what happened
--   8 subject     what it happened to ('' when absent)
--   9 payload     the jsonb body, rendered by ::text
--
-- Each field is length-prefixed — cw.lp('a|b') is '3:a|b' — and the pieces are
-- concatenated with no separator at all. Reasons for each choice:
--
--   · ts as MICROSECONDS, not text.  ts::text renders through the reading
--     session's TimeZone and DateStyle. An honest database therefore reported
--     tampering whenever the verifier's session settings differed from the
--     writer's — reproduced three independent ways. An epoch count is an
--     absolute instant and does not render.
--   · LENGTH PREFIXES, not '|'.  With a plain separator the field boundaries
--     can be moved by field content: sha256('|a|b'||'|') = sha256('|a'||'|b|').
--     Length-prefixing is prefix-free, so the reader knows how many bytes
--     belong to a field before it reads them, and no content can forge a
--     boundary.
--   · actor_role IS HASHED.  It is stored above but used to be left out of the
--     pre-image, so rewriting who did something was undetectable.
--   · seq IS HASHED.  It is a bigserial default and is already populated when a
--     BEFORE INSERT row trigger runs, so it is safe to commit to.
--   · payload::text IS SAFE.  jsonb renders key-ordered and whitespace-
--     normalised ('{"b":1,"a":2}'::jsonb::text is '{"a": 2, "b": 1}'), so the
--     same payload always produces the same bytes.
--
-- ONE FUNCTION, TWO CALLERS.  The writer (cw.audit_chain) and the verifier
-- (cw.audit_verify) both call cw.audit_preimage. They cannot drift apart,
-- which is how a false tamper alarm gets introduced.
--
-- HOW APPEND IS SERIALISED.  cw.audit_chain takes a transaction-scoped advisory
-- lock before it reads the tail, so two concurrent writers cannot read the same
-- parent and fork the chain. See the honest limitation on that line.
--
-- FORKING vs TRUNCATION — how a verifier tells them apart.
--   · Editing or removing a row in the MIDDLE breaks the hash chain, and
--     cw.audit_verify() returns the seq of the first row that no longer adds up.
--   · Two rows claiming the SAME parent (a fork) are refused outright by the
--     unique index on prev_hash — see 0007. Verification never has to choose
--     between two branches because a second branch cannot be stored.
--   · Removing the NEWEST rows leaves a shorter but internally consistent
--     chain, so hashes alone cannot see it. That is what the anchored
--     checkpoint in 0007 is for: cw.audit_anchor_check() notices that the row
--     the last checkpoint pointed at is gone.
--
-- NOTHING TO RE-ANCHOR.  Changing the pre-image invalidates every previously
-- stored hash. That costs nothing here: there is no production data, and every
-- database — test, development, deployment — is built by replaying these
-- migrations from empty. No row written under the old pre-image survives
-- anywhere, so there is no rebuild path to write and none is needed.
-- ════════════════════════════════════════════════════════════════════════════

-- Length-prefixed framing: the byte length, a colon, then the value.
create or replace function cw.lp(s text) returns text
language sql immutable as $$
  select octet_length(coalesce(s,''))::text || ':' || coalesce(s,'')
$$;

-- The bytes that get hashed. Marked stable rather than immutable only because
-- extract() is declared stable in general; extract(epoch from timestamptz) is
-- in fact an absolute value and is session-invariant, which is the whole point.
create or replace function cw.audit_preimage(
  p_prev text, p_seq bigint, p_ts timestamptz, p_actor text, p_actor_role text,
  p_actor_kind text, p_event_type text, p_subject text, p_payload jsonb
) returns text
language sql stable as $$
  select cw.lp(coalesce(p_prev,''))
      || cw.lp(p_seq::text)
      || cw.lp((extract(epoch from p_ts) * 1000000)::bigint::text)
      || cw.lp(p_actor)
      || cw.lp(coalesce(p_actor_role,''))
      || cw.lp(p_actor_kind)
      || cw.lp(p_event_type)
      || cw.lp(coalesce(p_subject,''))
      || cw.lp(p_payload::text)
$$;

-- Compute the chain on insert. Callers supply content; they never supply hashes.
--
-- SECURITY DEFINER, and this is load-bearing rather than tidy. 0007 scopes who
-- may READ the log, and a requester may read only their own rows. This function
-- has to read the last row of the WHOLE log to know what to link to. As an
-- invoker-rights function it reads the caller's filtered view instead, finds
-- nothing, concludes it is writing the very first event, and starts a second
-- chain alongside the real one. Found by running this suite as a real
-- cw_requester — the fork guard in 0007 caught it, which is precisely the job
-- that guard exists to do.
create or replace function cw.audit_chain() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare prev text;
begin
  -- Serialise appends so two writers cannot read the same tail and fork.
  --
  -- HONEST LIMITATION — this line has ZERO test coverage and cannot get any in
  -- this repository. PGlite is single-connection, so no test here can observe
  -- its absence, and a mutation that removed it would be guaranteed to miss.
  -- It ships on reasoning alone. The guarantee that IS proved is the unique
  -- index on prev_hash in 0007, which refuses a fork after the fact.
  perform pg_advisory_xact_lock(4771290311);
  select hash into prev from cw.audit_event order by seq desc limit 1;
  new.prev_hash := prev;
  new.hash := encode(sha256(convert_to(cw.audit_preimage(
      new.prev_hash, new.seq, new.ts, new.actor, new.actor_role,
      new.actor_kind, new.event_type, new.subject, new.payload), 'utf8')), 'hex');
  return new;
end $$;

create trigger audit_chain_before_insert
  before insert on cw.audit_event
  for each row execute function cw.audit_chain();

-- Verify the whole chain. Returns the first broken sequence number, or null.
--
-- SECURITY DEFINER on purpose. 0007 puts row-level security on cw.audit_event,
-- and a security invoker function walks the CALLER's filtered view — so a
-- scoped role would be told an honest database was tampered with at the first
-- row it is not allowed to see. The function discloses only a row number, never
-- content, so running it with the owner's visibility is safe.
create or replace function cw.audit_verify() returns bigint
language plpgsql stable
security definer set search_path = cw, pg_temp as $$
declare r record; prev text := null; expect text;
begin
  for r in select * from cw.audit_event order by seq loop
    if r.prev_hash is distinct from prev then return r.seq; end if;
    expect := encode(sha256(convert_to(cw.audit_preimage(
        r.prev_hash, r.seq, r.ts, r.actor, r.actor_role,
        r.actor_kind, r.event_type, r.subject, r.payload), 'utf8')), 'hex');
    if expect is distinct from r.hash then return r.seq; end if;
    prev := r.hash;
  end loop;
  return null;
end $$;

revoke all on function cw.audit_verify() from public;
grant execute on function cw.audit_verify() to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

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
