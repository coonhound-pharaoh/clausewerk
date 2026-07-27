-- 0021 · The audit chain's sequence number is now assigned where the lock is.
--
-- THE DEFECT, and it needs two people acting at the same instant to appear,
-- which is why nothing saw it until the doorway moved to standard PostgreSQL
-- and a real connection pool made concurrency observable at all.
--
-- `cw.audit_event.seq` was `bigserial`. **PostgreSQL evaluates a column DEFAULT
-- BEFORE it fires BEFORE-ROW triggers**, so `nextval` ran outside
-- `cw.audit_chain()` and outside its advisory lock — in the order transactions
-- reached the INSERT. The lock then serialised the trigger bodies in a
-- DIFFERENT order.
--
-- (That the default is evaluated first is not a guess: the trigger has always
-- hashed `new.seq` into the pre-image, and every chain in this repository
-- verifies. It could not, if `new.seq` were null at that point.)
--
-- So the tail-read
--
--     select hash into prev from cw.audit_event order by seq desc limit 1;
--
-- did not find the row appended last. It found the highest seq COMMITTED so
-- far, which under concurrency is a different row. Two consequences, both
-- measured by the Python session across eight concurrent writers — all at
-- `read committed`, all holding the advisory lock, all in their own explicit
-- transaction, so none of the usual explanations applies:
--
-- 1. **Duplicate keys on `audit_no_fork`, 5 of 8.** A writer with a low seq
--    appending after a higher-seq row committed takes that higher row as its
--    parent; the next writer reads the same highest-committed row and picks the
--    same parent. The index refuses the second. **The index was right every
--    time** — it was handed a genuine fork.
--
-- 2. **The worse one: honest chains that fail verification.** When no duplicate
--    occurs, rows still link backwards in seq order:
--
--        seq | parent seq
--         12 |  5
--         13 | 15     ← parent has a HIGHER seq than its child
--         14 | 12
--         15 | 14
--
--    Every row honest, every parent present, nothing missing — and
--    `cw.audit_verify()` reports the chain broken at seq 13, because it walks
--    `order by seq` and assumes sequence order is append order.
--
--    That is the audit trail accusing an honest system, which this project has
--    a decision record about already. Same failure, new cause.
--
-- THE FIX: ASSIGN `seq` INSIDE THE TRIGGER, UNDER THE LOCK.
--
-- Everything downstream — `cw.audit_verify()`, the checkpoint height, the
-- anchor — already assumes sequence order IS append order. Rather than teach
-- three readers to cope with it being false, this makes it true again, which is
-- the smaller change and the one that leaves each of them saying what it always
-- said. `order by seq desc limit 1` is then correct by construction, so the
-- tail-read needs no change either.
--
-- The alternative considered and rejected: find the tip as "the row nothing
-- points at". It is a correct way to read the tail, and it fixes the duplicate
-- key — but it leaves `seq` out of order, so `cw.audit_verify()` would still
-- have to be rewritten to walk the links instead of the numbers, and the
-- checkpoint height would still mean something subtly different from what its
-- name says. One defect, three readers to re-teach.
--
-- HOW THIS IS PROVED, AND WHERE — because it takes two suites and neither is
-- sufficient alone.
--
-- `db/test/` runs on PGlite, which is single-connection, so no suite here can
-- hold two writers open at once. What it proves is the MECHANISM: a test pushes
-- the sequence 5000 ahead of the table and asserts the appended row still lands
-- at max+1, with a mutation that deletes the assignment and confirms that test
-- catches it. Plus that single-writer behaviour is unchanged — the chain still
-- verifies and the fork guard still refuses a forced fork.
--
-- The RACE is proved in `backend/doorway/`, on standard PostgreSQL with a real
-- pool, which is the only thing in this repository that can see one:
--
--     doorway/test_retirement.py::test_the_chain_survives_people_acting_at_the_same_instant
--
-- Eight simultaneous governed acts through the doorway, asserting both halves —
-- every honest act lands, and the chain still verifies clean afterwards.
--
-- MEASURED, before and after:
--
--                                        before 0021   after 0021
--     8 writers released from a barrier   5 of 8 refused   0 refused
--     6 concurrent writers                ~half refused    0 refused
--     rows chained to a higher seq        present          0
--     cw.audit_verify()                   broken at 13     clean
--
-- Sustained: 8 writers × 12 rounds, 96 governed acts — 0 failures, 0 gaps in
-- seq, 0 rows chained to a higher seq, verify clean, **323 governed acts per
-- second**.
--
-- THAT THROUGHPUT NUMBER IS THE ANSWER TO THE ONLY REAL QUESTION THIS RAISES.
-- Appends to a hash chain cannot be parallel and still be a chain — each row's
-- hash depends on the one before it — so this serialises every governed act in
-- the system. That is a property to accept knowingly rather than a cost to
-- apologise for, and 323/second is several orders of magnitude beyond what a
-- contract governance system needs. Recorded so the next person to notice the
-- serialisation finds a measurement rather than a worry.

-- The header below is byte-identical to 0001's on purpose. Two mutations key on
-- it — the `security definer` one on this function and the pre-image line
-- inside it — and the harness applies a mutation to EVERY migration containing
-- the pattern. Keep them matching and both copies get mutated together, so the
-- checks stay live. Change the formatting and they silently stop guarding
-- anything, which is trap 5.4a in handoff 07 and cost two guarantees earlier
-- today.
create or replace function cw.audit_chain() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
declare prev text; prev_seq bigint;
begin
  -- Serialise appends so two writers cannot read the same tail and fork.
  -- Transaction-scoped: held from here until this transaction ends, so it
  -- covers the tail-read, the seq assignment and the insert as one unit.
  perform pg_advisory_xact_lock(4771290311);

  select seq, hash into prev_seq, prev
    from cw.audit_event order by seq desc limit 1;

  -- ASSIGNED HERE, NOT BY THE COLUMN DEFAULT. This is the whole migration.
  -- Under the lock, so the number a row gets is its true position in the
  -- append order rather than the order transactions happened to arrive.
  --
  -- The `bigserial` default still fires before this trigger and its value is
  -- discarded. That is deliberate and harmless: the sequence advances once per
  -- insert exactly as the assignment does, so the two never diverge in a way
  -- that could collide, and leaving the default in place keeps the one path
  -- that legitimately inserts with this trigger disabled — the forced-fork test
  -- in audit-chain.test.mjs — working unchanged.
  --
  -- Audit rows are never deleted (no DELETE grant anywhere, by design), so
  -- max(seq)+1 cannot reuse a number that once existed.
  new.seq := coalesce(prev_seq, 0) + 1;

  new.prev_hash := prev;
  new.hash := encode(sha256(convert_to(cw.audit_preimage(
      new.prev_hash, new.seq, new.ts, new.actor, new.actor_role,
      new.actor_kind, new.event_type, new.subject, new.payload), 'utf8')), 'hex');
  return new;
end $$;

comment on function cw.audit_chain() is
  'Assigns the audit row its sequence number and its place in the hash chain, '
  'both under one advisory lock. seq is assigned HERE rather than by the column '
  'default because a default is evaluated before the trigger fires — that is, '
  'outside the lock — which made sequence order diverge from append order under '
  'concurrent writers and produced both spurious fork refusals and honest '
  'chains that failed verification. See 0021.';
