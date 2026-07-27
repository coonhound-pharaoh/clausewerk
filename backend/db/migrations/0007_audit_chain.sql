-- 0007 · Audit chain hardening: fork guard, anchored tail, row-level security.
--
-- WHY THIS IS A SEPARATE MIGRATION AND NOT AN EDIT TO 0001
-- Everything here is a NEW object — an index, a table, two functions, two
-- policies. Nothing in this file redefines anything 0001 created. The pre-image
-- work went into 0001 instead, because that REPLACED broken logic: defining
-- cw.audit_chain() and cw.audit_verify() a second time here would have left the
-- broken versions sitting in 0001 as a trap for the next reader, and the scheme
-- would end up documented in two places. The rule applied throughout: a fix that
-- replaces existing logic is edited in place (there is no production data, so
-- nothing is lost); a fix that adds something new is additive and lands here.
--
-- The scheme itself is specified in 0001, above cw.lp(). Read that first.

-- ── Fork guard ──────────────────────────────────────────────────────────────
-- Every row names its parent. If two rows could name the SAME parent, the log
-- would have two futures and a verifier would have to pick one — which is not
-- verification, it is a choice. This index removes the choice: a second child
-- of any parent is refused at write time.
--
-- `nulls not distinct` matters. The very first row has no parent, so its
-- prev_hash is NULL. Without this clause NULLs never collide and anyone could
-- start a second chain from scratch alongside the real one. With it, exactly
-- one genesis row can ever exist.
--
-- Checked for false positives before adopting: ordinary appends, a
-- truncate-and-reseed, and two events with identical content written in the
-- same instant all pass — their prev_hash values differ by construction.
--
-- THAT SENTENCE WAS TRUE, THEN FALSE, AND IS NOW TRUE AGAIN FOR A DIFFERENT
-- REASON. Read it carefully before relying on it.
--
-- As written it meant "identical CONTENT does not collide", and the check that
-- established it ran on PGlite — one connection, where appends cannot actually
-- overlap. So it never tested two writers at the same instant; it tested two
-- writers in sequence with the same payload. When the doorway moved to standard
-- PostgreSQL and real concurrency arrived, this index began refusing honest
-- appends roughly half the time — not because it was over-strict, but because
-- `seq` was allocated by a column default OUTSIDE the append lock, so the
-- tail-read found the wrong parent and handed the index a genuine fork.
--
-- 0021 assigns `seq` inside the trigger, under the lock. Verified since, with
-- eight simultaneous writers through the doorway: 0 refusals, 0 rows chained to
-- a higher seq, chain verifies clean. So the claim holds again — and now it has
-- actually been tested against concurrency rather than inferred from a database
-- that could not produce any.
--
-- THE STANDING LESSON: this index is not the thing to loosen. It was correct on
-- every one of those refusals; something upstream was handing it a fork. See
-- 0021 and handoff 07 §5.10c.
create unique index audit_no_fork
  on cw.audit_event (prev_hash) nulls not distinct;

-- ── Anchored tail ───────────────────────────────────────────────────────────
-- The hash chain catches edits and removals in the MIDDLE of the log. It cannot
-- catch removal of the NEWEST rows, because what is left is a shorter chain that
-- still adds up perfectly. A checkpoint fixes that by remembering, outside the
-- chain, how tall the log was and what its last row hashed to.
--
-- WHAT A CHECKPOINT CONTAINS: when it was taken, how many rows existed, the seq
-- of the last row, and that row's hash.
--
-- HOW OFTEN IT IS WRITTEN: on demand, by calling cw.audit_checkpoint_take().
-- A deployment calls it on whatever schedule it wants — nightly is ample, since
-- the exposure window is "events written since the last checkpoint". No
-- checkpoint is taken by this migration: the log is empty when migrations run,
-- so an anchor over nothing would only be decoration. Until the first one is
-- taken, cw.audit_anchor_check() says 'no checkpoint' rather than 'ok', because
-- "we have not looked" and "we looked and it is fine" are not the same answer.
--
-- HONEST LIMITATION — THE CHECKPOINT IS ANCHORED BUT UNSIGNED.
-- Signing it would need pgcrypto, which is not available in PGlite, so in this
-- phase there is no cryptographic seal on the checkpoint row. What that means
-- in plain terms: this catches accidental deletion, a partial restore, a broken
-- backup, and any future non-owner DELETE grant. It does NOT stop the database
-- owner, who holds DELETE on cw.audit_event and can equally rewrite this table.
-- Against that actor the checkpoint raises the bar, it does not close the door.
-- Notarising checkpoints outside the database is the next phase's job.
create table cw.audit_checkpoint (
  checkpoint_id bigserial primary key,
  taken_at      timestamptz not null default now(),
  height        bigint      not null,
  last_seq      bigint      not null,
  last_hash     text        not null
);

comment on table cw.audit_checkpoint is
  'Anchored but unsigned. Records how tall the audit log was and what its last '
  'row hashed to, so removing the newest entries becomes visible.';

-- SECURITY DEFINER so a legal_admin can take a checkpoint without holding
-- INSERT on the table directly — the only thing it can insert is a faithful
-- reading of the current tail.
create or replace function cw.audit_checkpoint_take() returns bigint
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare h bigint; s bigint; lh text; id bigint;
begin
  select count(*) into h from cw.audit_event;
  if h = 0 then
    raise exception 'there is nothing to checkpoint — the audit log is empty';
  end if;
  select seq, hash into s, lh from cw.audit_event order by seq desc limit 1;
  insert into cw.audit_checkpoint (height, last_seq, last_hash)
  values (h, s, lh) returning checkpoint_id into id;
  return id;
end $$;

-- Compare the log against its newest anchor. Returns 'ok', 'no checkpoint', or
-- a plain-language description of what is wrong.
--
-- SECURITY DEFINER for the same reason as cw.audit_verify(): under the row-level
-- security added below, a scoped role sees a filtered log and would be told an
-- honest database had been truncated.
create or replace function cw.audit_anchor_check() returns text
language plpgsql stable
security definer set search_path = cw, pg_temp as $$
declare c record; h bigint; cur_hash text;
begin
  select * into c from cw.audit_checkpoint order by checkpoint_id desc limit 1;
  if c is null then return 'no checkpoint'; end if;
  select count(*) into h from cw.audit_event;
  select hash into cur_hash from cw.audit_event where seq = c.last_seq;
  if h >= c.height and cur_hash is not distinct from c.last_hash then
    return 'ok';
  end if;
  return format(
    'anchor broken: checkpoint %s recorded %s rows ending at seq %s; the log now has %s rows and %s',
    c.checkpoint_id, c.height, c.last_seq, h,
    case when cur_hash is null then format('no row at seq %s', c.last_seq)
         else format('a different hash at seq %s', c.last_seq) end);
end $$;

revoke all on function cw.audit_checkpoint_take() from public;
revoke all on function cw.audit_anchor_check() from public;
grant execute on function cw.audit_checkpoint_take() to cw_legal_admin;
grant execute on function cw.audit_anchor_check() to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

grant select on cw.audit_checkpoint to
  cw_legal_reviewer, cw_legal_admin, cw_auditor;

-- ── Row-level security on the audit log ─────────────────────────────────────
-- The log had none. Table grants let a requester SELECT it, and with no policy
-- that meant every requester could read every other buyer's concession events —
-- the very thing cw.concession's own policy hides one table over. Reading the
-- log was a way around the wall rather than through it.
--
-- TWO POLICIES, NOT ONE. A SELECT-only policy looks complete and quietly breaks
-- the entire product: cw.audit() inserts as the caller, so with row-level
-- security on and no INSERT policy, every governed write in the system fails
-- with "new row violates row-level security policy" — for requesters AND for
-- legal_admin. The append policy below is not a convenience, it is what keeps
-- the system running.
--
-- ENABLED, NOT FORCED. The table owner still bypasses these policies. That is
-- deliberate: migrations and test seeding run as the owner. It also means these
-- policies are a wall against application roles, not against the owner — the
-- same threat model as the checkpoint above.
alter table cw.audit_event enable row level security;

-- Who may read what. Legal and Audit see the whole record — that is their job.
-- A requester sees only what they themselves did. A viewer never gets this far:
-- they hold no SELECT grant on this table at all.
create policy audit_read_scoped on cw.audit_event for select using (
  cw.app_role() in ('auditor','legal_reviewer','legal_admin')
  or (cw.app_role() = 'requester' and audit_event.actor = cw.app_actor()));

-- Who may append. The three roles that hold the INSERT grant, and no one else.
-- Note what this policy does NOT do: it does not let anyone edit or remove a
-- row, because there is no UPDATE or DELETE grant anywhere (0001).
create policy audit_append on cw.audit_event for insert with check (
  cw.app_role() in ('requester','legal_reviewer','legal_admin'));

-- ── Attribution is bound to the connection (WP-04, finding D3) ──────────────
-- The policy above says WHO may append. This one says WHAT THEY MAY CLAIM.
--
-- Without it, the three roles that hold INSERT on this table can write a row by
-- hand naming any role at all: a cw_legal_reviewer could append
-- actor_role = 'legal_admin' and the permanent record would show an approval
-- authority they do not hold. cw.audit() has always filled actor_role from
-- cw.app_role(), but nothing stopped a direct INSERT from saying otherwise, so
-- the field was only as honest as the caller.
--
-- RESTRICTIVE, so it is ANDed with audit_append and can only ever subtract. The
-- recorded role must be exactly the role this connection actually holds.
-- cw.audit() satisfies it by construction; a hand-written forgery cannot.
--
-- WHAT IT DOES NOT BIND: `actor`, the person's name. That is self-asserted (see
-- cw.app_actor() in 0001) and binding it here would be theatre — the same
-- client that sets the name would satisfy the check. The residual is stated in
-- ARCHITECTURE.md §5 rather than papered over.
--
-- The owner is unaffected: RLS is ENABLED, not FORCED, so migrations and test
-- seeding still write freely. Owner-written rows carry a null actor_role, which
-- is the truthful answer under U3 — the owner holds no application role.
create policy audit_attribution_bound on cw.audit_event
  as restrictive for insert
  with check (audit_event.actor_role is not distinct from cw.app_role());
