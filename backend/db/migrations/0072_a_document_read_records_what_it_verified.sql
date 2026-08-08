-- 0072 · A document read records what it verified, not what it was told
--
-- ── THE NUMBER THIS FILE CLAIMS, AND HOW ────────────────────────────────────
-- 0072, verified by listing backend/db/migrations/ at the moment this package
-- began. The directory held 0001-0068 and 0070-0071; there is no 0069 and never
-- has been in any branch. A gap is harmless — the bootstrap applies migrations
-- in filename order. A DUPLICATE is the dangerous one, because it surfaces later
-- as a migration that silently did not run.
--
--
-- ── WHAT WAS WRONG, DEMONSTRATED ────────────────────────────────────────────
--
-- cw.record_document_read is SECURITY DEFINER and callable by a requester, both
-- Legal roles and the auditor. It took a negotiation, a round, a document, a
-- SHA-256, a byte size and a direction — ALL SIX FROM THE CALLER — and wrote an
-- event onto cw.audit_event. It checked none of them.
--
-- Rita is a requester. The negotiation belongs to Ben:
--
--   select count(*) from cw.negotiation where negotiation_id = 4   ->  0
--     (she cannot see it at all; the policy works)
--
--   select cw.record_document_read(4, 99, 12345, 'ffff…ff', 999999, 'received')
--     ->  ACCEPTED
--
--   cw.audit_event, permanently:
--     rita@x | requester | received_document_read | negotiation:4
--            | round_no 99, document_id 12345, sha256 ffff…ff, byte_size 999999
--
-- Round 99 does not exist. Document 12345 does not exist. The hash is invented.
-- AND cw.audit_verify() RETURNS CLEAN, because the chain guarantees that nothing
-- was altered or deleted — never that anything recorded is true.
--
--
-- ── WHERE THE REASONING WENT, IN 0065'S OWN WORDS ───────────────────────────
--
-- 0065 opened this door on purpose and explained the trade: granting cw_auditor
-- INSERT on cw.audit_event outright "would let them append ANY event of any type
-- to the record they exist to verify, which is a genuinely bad trade for one
-- download." That judgement was right. The implementation then described itself
-- as
--
--     "one function that writes exactly one event type, with every field it
--      carries either derived here or BOUNDED BY ITS OWN ARGUMENTS"
--
-- and that second half is the whole defect in five words. An argument is not a
-- bound. It is whatever the caller says. The door was made narrow in EVENT TYPE
-- and left wide open in CONTENT.
--
-- IT ALSO LOOKED CHECKED, WHICH IS WHY IT SURVIVED A SWEEP. The body opens with
-- `case current_setting('role', true)`, so anything grepping for role-awareness
-- finds it — but that expression fills the actor_role COLUMN and decides
-- nothing. A lookup mistaken for a gate, which is the same shape as the static
-- root in S255.
--
--
-- ── WHAT IT COST, STATED HONESTLY ───────────────────────────────────────────
--
-- THERE IS NO BROWSER PATH TO IT. The doorway has no arbitrary-SQL endpoint and
-- the only caller is redlines.fetch, which resolves the round under the caller's
-- own row rules first. This is defence in depth, not a live exploit from the
-- web. It is fixed anyway because the design's promise is that THE DATABASE
-- refuses independently of the doorway (db.py's header), and because a false
-- event on the chain is worse than a missing one: an auditor reconciling reads
-- against documents finds events naming negotiations the actor cannot see, with
-- hashes matching nothing, and cannot tell a bug from a forgery.
--
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────
--
-- The function now records what it VERIFIED. Every field on the event is read
-- from the record; the arguments become what the caller CLAIMS, checked and then
-- discarded. THE SIGNATURE IS UNCHANGED, deliberately — redlines.py keeps
-- working untouched, and a migration that also rewrites a call site is two
-- changes wearing one number.

begin;

create or replace function cw.record_document_read(
  p_negotiation bigint,
  p_round       int,
  p_document    bigint,
  p_sha256      text,
  p_byte_size   bigint,
  p_direction   text
) returns void
language plpgsql security definer set search_path = cw, pg_temp as $$
declare
  -- 0065's words, kept: inside a definer current_user becomes the owner and
  -- cw.app_role() answers null, so the role comes from the unforgeable SET ROLE
  -- the base login selected. A caller cannot lie about it — it is not a session
  -- variable they set, it is the database role they are connected as.
  --
  -- WHAT IS NEW IS THAT IT IS NOW READ TWICE, FOR TWO DIFFERENT JOBS: once to
  -- label the event, and once — below — to DECIDE. Until 0072 it only ever
  -- labelled, while looking from the outside like a permission check.
  raw_role    text := coalesce(nullif(current_setting('role', true), 'none'),
                               session_user);
  caller_role text := case raw_role
    when 'cw_viewer' then 'viewer'
    when 'cw_requester' then 'requester'
    when 'cw_legal_reviewer' then 'legal_reviewer'
    when 'cw_legal_admin' then 'legal_admin'
    when 'cw_auditor' then 'auditor'
    when 'cw_administrator' then 'administrator'
  end;
  r     cw.negotiation_round%rowtype;
  d     cw.received_document%rowtype;
  bytes bigint;
begin
  -- ── 1 · MAY THIS CALLER READ THE ROUND THEY ARE NAMING? ──────────────────
  -- SECURITY DEFINER bypasses cw.negotiation_round's row policy, so the policy
  -- is restated here — the house rule, in cw.socialise_override_request's own
  -- words: "the function must restate the grant's two intended branches
  -- itself." This is 0027's read_scoped on cw.negotiation_round, unchanged:
  -- Legal and the auditor in full, a requester only on their own deal.
  --
  -- cw.owns_agreement is itself SECURITY DEFINER and reads cw.app_actor(),
  -- which survives into this function because it is a session setting rather
  -- than a role — so it answers about the signed caller, not the owner.
  select * into r from cw.negotiation_round
   where negotiation_id = p_negotiation and round_no = p_round;

  if not found then
    raise exception 'no round % on negotiation %', p_round, p_negotiation
      using errcode = 'no_data_found';
  end if;

  if not (raw_role in ('cw_legal_reviewer','cw_legal_admin','cw_auditor')
          or (raw_role = 'cw_requester'
              and exists (select 1 from cw.negotiation n
                           where n.negotiation_id = p_negotiation
                             and cw.owns_agreement(n.agreement_id)))
          -- A connection with no mapped application role is the owner, running
          -- a migration or a fixture, and is allowed — the same latitude 0064
          -- gives cw.waiting_for and for the same reason. It is not a hole: the
          -- owner can write to cw.audit_event directly regardless.
          or caller_role is null) then
    raise exception
      'round % on negotiation % is not yours to read, so it is not yours to '
      'record a read of', p_round, p_negotiation
      using errcode = 'insufficient_privilege';
  end if;

  -- ── 2 · THE EVENT IS BUILT FROM THE RECORD, NOT FROM THE ARGUMENTS ───────
  -- p_document still SELECTS — it names which stored document is meant, and is
  -- checked against the round's storage_uri below.
  --
  -- p_sha256, p_byte_size AND p_direction ARE NOW IGNORED ENTIRELY, and that is
  -- the change stated plainly rather than left for somebody to infer from the
  -- absence of a mention. They are the caller's claim about facts the database
  -- already holds, so the database's answer is used and the claim is dropped on
  -- the floor. Verified: a legal admin calling with a wrong hash, a wrong size
  -- and the wrong direction records the TRUE three.
  --
  -- REFUSING ON A MISMATCHED CLAIM WAS CONSIDERED AND REJECTED. It would let a
  -- caller cause a refusal of their own legitimate download by getting an
  -- argument wrong, which is a way to break a working feature with a typo. An
  -- argument that cannot be believed should not be able to stop anything
  -- either. The parameters stay in the signature so redlines.py is untouched.
  --
  -- What IS reconciled is the record against itself: the round's recorded hash
  -- against the stored bytes' own hash. If those two disagree the bytes are not
  -- the ones the round attests to, and recording a read under that round's name
  -- would be this database vouching for something it just found false. That is
  -- the same check redlines.fetch makes before calling, moved to where a future
  -- caller cannot skip it.
  select * into d from cw.received_document where document_id = p_document;

  if not found then
    raise exception 'no document % is stored', p_document
      using errcode = 'no_data_found';
  end if;

  if r.document_sha256 is distinct from d.sha256 then
    raise exception
      'document % does not match round % of negotiation %: the round records '
      '%, the stored bytes hash to %',
      p_document, p_round, p_negotiation, r.document_sha256, d.sha256
      using errcode = 'check_violation';
  end if;

  if r.storage_uri is distinct from ('cw://received-document/' || p_document::text) then
    raise exception
      'round % of negotiation % does not name document %',
      p_round, p_negotiation, p_document
      using errcode = 'check_violation';
  end if;

  bytes := octet_length(d.bytes);

  insert into cw.audit_event
    (actor, actor_role, actor_kind, event_type, subject, payload)
  values (
    cw.app_actor(), caller_role, 'human', 'received_document_read',
    'negotiation:' || p_negotiation::text,
    jsonb_build_object(
      'round_no', r.round_no,
      'direction', r.direction,
      'document_id', d.document_id,
      'sha256', d.sha256,
      'byte_size', bytes));
end $$;

comment on function cw.record_document_read(bigint, int, bigint, text, bigint, text) is
  'Records that somebody took a copy of a received document. EVERY FIELD ON THE
   EVENT IS READ FROM THE RECORD; the arguments are the caller''s claim, checked
   against the round and the stored bytes and then discarded. The caller must be
   able to read the round — cw.negotiation_round''s read_scoped policy, restated
   here because SECURITY DEFINER bypasses it. Before 0072 it wrote whatever it
   was handed, and a requester could put a read of another requester''s deal on
   the chain.';

revoke all on function cw.record_document_read(bigint, int, bigint, text, bigint, text)
  from public;
grant execute on function cw.record_document_read(bigint, int, bigint, text, bigint, text)
  to cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;

commit;
