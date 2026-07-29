-- 0034 · The session table holds a fingerprint, not a key
--
-- WHAT THIS FIXES
-- Audit finding A-2. `cw.session.token` held the bearer key VERBATIM. In memory
-- that was defensible; in a table it is durable. The key was in every backup,
-- every pg_dump, every replica and every database console session for the rest
-- of its eight-hour life, and anyone holding any one of those held working
-- credentials for whoever was signed in.
--
-- 0033 stopped the wrong ROLE reaching this table. It could do nothing about a
-- copy of the table, and a backup is a copy of the table. The two findings look
-- similar and are not: 0033 is about who may read the row, this is about what
-- the row is worth once read.
--
-- THE COLUMN IS RENAMED, NOT JUST REWRITTEN.
-- A column called `token` holding something that is not a token is the kind of
-- lie this schema is careful not to tell. What is stored now is a fingerprint:
-- it can confirm a key presented by a caller, and it cannot produce one.
--
-- NOBODY IS SIGNED OUT BY THIS MIGRATION.
-- Existing rows are hashed in place, and PostgreSQL's sha256 agrees with
-- Python's hashlib byte for byte (verified 2026-07-28 on 18.4 against the same
-- input). A browser holding a session key from before this migration presents
-- it, the doorway fingerprints what was presented, and it matches the row that
-- was rewritten here. That property is why doing this NOW is cheap: once there
-- are sessions in somebody else's database, the equivalent migration is one
-- that signs their whole company out.
--
-- The keys themselves are not recoverable from what is left behind, which is
-- the entire point, so this migration is not reversible and should not be.
-- Reversing it would leave fingerprints in a column claiming to hold keys, and
-- every live session would stop working.
--
-- TOKEN GENERATION IS UNCHANGED AND WAS ALREADY RIGHT: secrets.token_urlsafe(32)
-- is 256 bits from the OS entropy source. This changes only what is kept.

alter table cw.session rename column token to token_sha256;

update cw.session
   set token_sha256 = encode(sha256(token_sha256::bytea), 'hex');

-- The same CHECK discipline cw.snapshot and cw.ruleset carry for their
-- content-addressed keys. It is also what would catch a future writer storing a
-- raw token here by mistake: a token_urlsafe(32) is 43 characters and would be
-- refused, loudly, at the insert.
alter table cw.session
  add constraint token_sha256_is_a_digest
  check (token_sha256 ~ '^[0-9a-f]{64}$');

comment on column cw.session.token_sha256 is
  'The SHA-256 of the session key, hex. NOT the key. It can confirm a key a '
  'caller presents and cannot produce one, so a copy of this table -- a backup, '
  'a replica, a console session -- carries no working credentials.';
