-- 0008 · The Review queue: the single gate through which language enters.
--
-- Implements ADR-0003 ("the Review queue is the only mutation surface"),
-- ADR-0004 (suppressed candidates are retained), and ADR-0010 (a drafted
-- candidate is a proposal, never a clause).
--
-- Until this migration the gate existed only in prose. `cw.promote_concession()`
-- was one door through a wall that had not been built; this is the wall, and the
-- promotion door is now cut through it via a shared minting function so that
-- "how did this wording get into the library?" has exactly two answers and both
-- of them are recorded.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THE RED TEAM REFUTED, AND WHAT IS BUILT INSTEAD
-- ════════════════════════════════════════════════════════════════════════════
-- The originally proposed design was refuted four ways plus one dropped issue.
-- Every correction is load-bearing and each has its own test and its own
-- mutation entry.
--
--   1 INSERT WAS UNGOVERNED. A `before update` trigger alone lets a requester
--     INSERT a row that is already `rejected`, with an empty note and a
--     hand-written decider. The transition trigger never fires, and the
--     mandatory-rejection-note guarantee is defeated on day one. The guard here
--     is a `before insert` trigger written as an INITIAL-STATE ALLOW-LIST, which
--     is why it does not break legitimate ticket creation: a ticket may be
--     opened `pending` and carrying no decision, and that is all.
--
--   2 THE REJECTION NOTE CHECK CAUGHT NULL, NOT ''. "Mandatory" was decorative.
--     It now rejects the empty string and whitespace-only strings, which is what
--     an application actually sends when a reviewer clicks through a form.
--
--   3 `edited_before_approval` WAS STRUCTURALLY ALWAYS FALSE. `proposed_text` is
--     immutable and the verification function took no body parameter, so a
--     reviewer's edit had nowhere to land. ADR-0010 names the unedited-approval
--     rate as the binding control on review quality; as designed it would have
--     reported a perfect score forever — and a perfect score is also the alarm
--     value. Verification now takes `p_body`, the approved bytes are STORED in
--     `approved_text`, and the flag is DERIVED by the trigger from the two
--     stored strings. A caller cannot self-report it: the insert guard refuses
--     a value at open time and the update trigger overwrites whatever is passed.
--
--   4 THE BASELINE COULD BE EDITED INSTEAD OF THE APPROVAL. Even with (3), a
--     mutable `clause_draft.text` lets the AI's own words be rewritten to match
--     what the lawyer approved, and the control silently reports perfection
--     again. A draft is frozen the moment a ticket is opened against it.
--
--   5 NO `do instead nothing` ON DELETE (settled decision S0-3). A caller who
--     believes they deleted something and did not is worse off than one who was
--     told no. Deletes RAISE.

-- ── The drafted candidate (ADR-0010) ────────────────────────────────────────
-- A proposal, not a clause. It has no ID in the clause namespace and no route
-- into a contract except through a ticket a named human verifies.
--
-- The provenance columns are the point: "the provenance chain reaches back past
-- the lawyer to what the lawyer was shown" (NEGOTIATION-ARCHITECTURE.md §5).
create table cw.clause_draft (
  draft_id      bigserial primary key,
  kind          text not null default 'clause'
                  check (kind in ('clause','rung','rule')),
  -- The model's words, verbatim. This is the BASELINE the unedited-approval
  -- rate is measured against, which is why it is frozen once used (see below).
  text          text not null,
  prompt        text not null,
  model         text not null,
  model_version text not null,
  --: the rules and source records the model was given.
  inputs        jsonb not null default '[]'::jsonb,
  created_by    text not null default cw.app_actor(),
  created_at    timestamptz not null default now(),
  -- Drafts expire. An un-actioned proposal goes stale rather than lingering as
  -- a decision nobody made (NEGOTIATION-ARCHITECTURE.md §5).
  expires_on    date not null default (current_date + 30),
  constraint draft_text_not_blank check (btrim(text) <> '')
);

comment on table cw.clause_draft is
  'An AI-drafted candidate. Never selectable, never resolvable, and not a clause
   until a named human verifies a ticket that carries it.';

-- ── The ticket ──────────────────────────────────────────────────────────────
create table cw.review_ticket (
  ticket_id        bigserial primary key,
  agreement_id     text references cw.agreement(agreement_id),
  category_key     text not null references cw.category(key),
  severity         text not null check (severity in ('Standard','High')),
  -- Why this ticket exists (ADR-0003's reason codes).
  reason_code      text not null
                     check (reason_code in ('no-ai-match','human-escalated','human-edit',
                                            'ai-draft','supplier-paper')),
  -- Badged throughout, per ADR-0003. The badge travels with the text so a
  -- reviewer always knows whose words they are reading.
  provenance_badge text not null
                     check (provenance_badge in ('VENDOR LANGUAGE','AI CANDIDATE',
                                                 'EDITED BY LEGAL')),
  -- QUARANTINED. What is being proposed, whoever proposed it. Referenced by no
  -- selectable view; it cannot reach a contract from here.
  proposed_text    text not null,
  -- The draft this ticket carries, when it carries one. A REFERENCE.
  draft_id         bigint references cw.clause_draft(draft_id),

  state            text not null default 'pending'
                     check (state in ('pending','verified','rejected','expired')),

  -- ── The decision half. Null until a decision is taken. ──
  --
  -- approved_text is the bytes the reviewer actually approved. It is the column
  -- rt-3 §4c showed was missing: without somewhere for an edit to land, an edit
  -- cannot be detected.
  approved_text    text,
  -- DERIVED, never supplied. See cw.review_ticket_transition().
  edited_before_approval boolean,
  decided_by       text,
  decided_on       timestamptz,
  decision_note    text,
  -- What was minted, when something was.
  minted_clause_id text,
  minted_version   int,

  opened_by        text not null default cw.app_actor(),
  expires_on       date,
  created_at       timestamptz not null default now(),

  -- ── Shape, enforced by CHECK ──
  --
  -- The empty string is the whole point of this one. `decision_note is not null`
  -- is satisfied by '' — which is exactly what a form posts when the reviewer
  -- types nothing — so the original constraint made "mandatory" decorative.
  constraint rejection_needs_note check (
    state <> 'rejected' or coalesce(btrim(decision_note), '') <> ''),
  constraint terminal_needs_decider check (
    state not in ('verified','rejected') or coalesce(btrim(decided_by), '') <> ''),
  constraint pending_has_no_decision check (
    state <> 'pending' or (
      approved_text is null and edited_before_approval is null
      and decided_by is null and decided_on is null and decision_note is null
      and minted_clause_id is null and minted_version is null)),
  constraint verified_names_its_clause check (
    state <> 'verified' or (
      minted_clause_id is not null and minted_version is not null
      and approved_text is not null and edited_before_approval is not null)),
  constraint proposed_text_not_blank check (btrim(proposed_text) <> '')
);

create index on cw.review_ticket (state);
create index on cw.review_ticket (agreement_id);
create index on cw.review_ticket (draft_id);

comment on column cw.review_ticket.proposed_text is
  'QUARANTINED. The text under review. Immutable from the moment the ticket is
   opened, so the baseline an edit is measured against cannot be moved.';

comment on column cw.review_ticket.edited_before_approval is
  'DERIVED from stored bytes: approved_text is distinct from proposed_text.
   ADR-0010 makes the unedited-approval rate the binding control on review
   quality, so this figure may never be self-reported by the caller.';

-- ── The redline, one segment at a time (ADR-0007) ───────────────────────────
-- Provenance is observed at the database boundary, never accepted from the
-- caller. In particular, nobody may forge review_ticket.opened_by to evade the
-- separation-of-duties check in cw.verify_review_ticket(). Database-owner
-- imports retain their supplied historical attribution because they have no
-- governed app role.
create or replace function cw.bind_review_queue_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    if tg_table_name = 'clause_draft' then
      new.created_by := cw.app_actor();
      new.created_at := now();
      new.expires_on := current_date + 30;
    elsif tg_table_name = 'review_ticket' then
      new.opened_by := cw.app_actor();
      new.created_at := now();
      if cw.app_role() = 'requester'
         and new.agreement_id is not null
         and not cw.owns_agreement(new.agreement_id) then
        raise exception
          'requester % does not own agreement % and cannot open its review tickets',
          cw.app_actor(), new.agreement_id
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger clause_draft_bind_actor
  before insert on cw.clause_draft
  for each row execute function cw.bind_review_queue_actor();

create trigger review_ticket_bind_actor
  before insert on cw.review_ticket
  for each row execute function cw.bind_review_queue_actor();

create table cw.review_segment (
  ticket_id bigint not null references cw.review_ticket(ticket_id),
  seq       int    not null,
  kind      text   not null check (kind in ('keep','ins','del')),
  text      text   not null,
  primary key (ticket_id, seq)
);

comment on table cw.review_segment is
  'The vendor''s change, kept as it arrived: keep / ins / del. What Legal is
   shown is the evidence, not a summary of it.';

-- ── Candidates: REFERENCES, never copies (ADR-0004) ─────────────────────────
-- The suppressed and alternate candidates a reviewer was offered. Stored as
-- (clause_id, version) references rather than as text copies.
--
-- This was checked before it was adopted rather than assumed: clause versions
-- are genuinely immutable — 0002 guards body, title, citations, reviewer,
-- approval and expiry dates, and refuses deletion — and retirement and
-- supersession both PRESERVE the row rather than removing it. So a reference
-- resolves to the same bytes forever, and ADR-0004's audit question ("why not
-- the stricter one?") reconstructs years later. A copy would only add a second
-- version of the truth that can disagree with the first.
create table cw.review_candidate (
  ticket_id   bigint not null references cw.review_ticket(ticket_id),
  seq         int    not null,
  clause_id   text   not null,
  version     int    not null,
  disposition text   not null
                check (disposition in ('proposed','alternate','suppressed')),
  score       numeric(5,4),
  reason      text,
  primary key (ticket_id, seq),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version)
);

-- ── clause_version learns where it came from ────────────────────────────────
-- "Every non-seeded clause came through a verified ticket" becomes a query
-- rather than a belief. Null for seeded language and for the promotion path,
-- which is the other recorded entrance (see cw.clause_entrance below).
alter table cw.clause_version
  add column source_ticket_id bigint references cw.review_ticket(ticket_id);

-- ════════════════════════════════════════════════════════════════════════════
-- THE STATE MACHINE
-- ════════════════════════════════════════════════════════════════════════════
--        ┌─────────┐   verify   ┌──────────┐
--        │ pending ├───────────►│ verified │  terminal
--        └────┬────┘            └──────────┘
--             │      reject     ┌──────────┐
--             ├────────────────►│ rejected │  terminal
--             │                 └──────────┘
--             │      lapse      ┌──────────┐
--             └────────────────►│ expired  │  terminal
--                               └──────────┘
--
-- Enforced on BOTH verbs. The insert guard is an allow-list of opening states;
-- the update guard is an allow-list of transitions. Neither is a block-list,
-- because a block-list is a list of the attacks somebody thought of.

-- INSERT: a ticket may only be OPENED, never born decided.
create or replace function cw.review_ticket_opens_pending() returns trigger
language plpgsql as $$
declare d_text text;
begin
  if new.state is distinct from 'pending' then
    raise exception
      'a review ticket opens in pending, not %; a decision is an act taken on a '
      'ticket, not a property it can be created with', new.state
      using errcode = 'check_violation';
  end if;
  if new.approved_text is not null
     or new.edited_before_approval is not null
     or new.decided_by is not null
     or new.decided_on is not null
     or new.decision_note is not null
     or new.minted_clause_id is not null
     or new.minted_version is not null then
    raise exception
      'a review ticket cannot be opened carrying a decision'
      using errcode = 'check_violation';
  end if;
  -- A ticket that carries a draft must carry the DRAFT'S text. Otherwise the
  -- baseline can be pre-edited at open time and the unedited-approval rate is
  -- defeated before the reviewer ever sees the ticket.
  if new.draft_id is not null then
    select text into d_text from cw.clause_draft where draft_id = new.draft_id;
    if new.proposed_text is distinct from d_text then
      raise exception
        'ticket text does not match draft %; the proposal under review must be '
        'the draft as written, or the unedited-approval rate measures nothing',
        new.draft_id using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger review_ticket_opens_pending
  before insert on cw.review_ticket
  for each row execute function cw.review_ticket_opens_pending();

-- UPDATE: legal transitions only, immutable evidence, and the derived flag.
create or replace function cw.review_ticket_transition() returns trigger
language plpgsql as $$
begin
  if new.ticket_id      is distinct from old.ticket_id
     or new.agreement_id  is distinct from old.agreement_id
     or new.category_key  is distinct from old.category_key
     or new.severity      is distinct from old.severity
     or new.reason_code   is distinct from old.reason_code
     or new.provenance_badge is distinct from old.provenance_badge
     or new.proposed_text is distinct from old.proposed_text
     or new.draft_id      is distinct from old.draft_id
     or new.opened_by     is distinct from old.opened_by
     or new.expires_on    is distinct from old.expires_on
     or new.created_at    is distinct from old.created_at then
    raise exception
      'review ticket % records what was proposed and by whom; that cannot be '
      'rewritten, only decided', old.ticket_id
      using errcode = 'restrict_violation';
  end if;

  if old.state <> 'pending' then
    raise exception
      'review ticket % is already %; a decided ticket cannot be reopened or '
      'redecided — open a new ticket', old.ticket_id, old.state
      using errcode = 'restrict_violation';
  end if;

  if new.state not in ('verified','rejected','expired') then
    raise exception
      'pending may only move to verified, rejected or expired, not %', new.state
      using errcode = 'check_violation';
  end if;

  -- ── The derived flag ──
  -- Computed here from the two stored strings and assigned over whatever the
  -- caller supplied. This is the difference between a measurement and a claim:
  -- ADR-0010 makes this number the binding control, and a control a caller can
  -- fill in themselves is not a control.
  if new.state = 'verified' then
    new.edited_before_approval := (new.approved_text is distinct from new.proposed_text);
  else
    new.edited_before_approval := null;
  end if;

  if new.decided_on is null then new.decided_on := now(); end if;
  return new;
end $$;

create trigger review_ticket_transition
  before update on cw.review_ticket
  for each row execute function cw.review_ticket_transition();

-- DELETE RAISES. Not `do instead nothing` — settled decision S0-3, and the
-- exact pattern finding D9 condemns: a silent no-op makes an application bug
-- indistinguishable from success.
create or replace function cw.review_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'a review ticket cannot be deleted: what was proposed, who decided it and '
    'why is the evidence the gate exists to produce'
    using errcode = 'restrict_violation';
end $$;

create trigger review_ticket_no_delete
  before delete on cw.review_ticket
  for each row execute function cw.review_no_delete();

create trigger review_segment_no_delete
  before delete on cw.review_segment
  for each row execute function cw.review_no_delete();

create trigger review_candidate_no_delete
  before delete on cw.review_candidate
  for each row execute function cw.review_no_delete();

-- The evidence attached to a ticket is as immutable as the ticket.
create or replace function cw.review_attachment_immutable() returns trigger
language plpgsql as $$
begin
  raise exception
    'ticket % attachments are evidence and cannot be edited', old.ticket_id
    using errcode = 'restrict_violation';
end $$;

create trigger review_segment_no_edit
  before update on cw.review_segment
  for each row execute function cw.review_attachment_immutable();

create trigger review_candidate_no_edit
  before update on cw.review_candidate
  for each row execute function cw.review_attachment_immutable();

-- ── A draft in use is frozen (the correction that was dropped once already) ──
-- Raised in red-team review 3, dropped during integration, reinstated by the
-- Gate 3 remediation §8. Without it `edited_before_approval` is still
-- defeatable: rewrite the AI's own words to match what the lawyer approved and
-- the control reports a perfect score again, from the other end.
--
-- Before the draft is attached to anything it is ordinary work in progress and
-- may be revised. The moment a ticket is opened against it, it is the baseline
-- of a measurement and stops being editable at all.
create or replace function cw.clause_draft_frozen_when_used() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from cw.review_ticket t where t.draft_id = old.draft_id) then
    raise exception
      'draft % is under review; the draft a ticket was opened against is the '
      'baseline the unedited-approval rate is measured from and cannot be edited',
      old.draft_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger clause_draft_frozen
  before update on cw.clause_draft
  for each row execute function cw.clause_draft_frozen_when_used();

create trigger clause_draft_no_delete
  before delete on cw.clause_draft
  for each row execute function cw.review_no_delete();

-- TRUNCATE fires none of the four row triggers above (WP-25b, finding D9). The
-- gate's whole value is the evidence it leaves behind, and one statement could
-- remove all of it.
create trigger review_ticket_no_truncate
  before truncate on cw.review_ticket
  for each statement execute function cw.no_truncate();
create trigger review_segment_no_truncate
  before truncate on cw.review_segment
  for each statement execute function cw.no_truncate();
create trigger review_candidate_no_truncate
  before truncate on cw.review_candidate
  for each statement execute function cw.no_truncate();
create trigger clause_draft_no_truncate
  before truncate on cw.clause_draft
  for each statement execute function cw.no_truncate();

-- ════════════════════════════════════════════════════════════════════════════
-- ONE MINTING FUNCTION, TWO ENTRANCES
-- ════════════════════════════════════════════════════════════════════════════
-- `cw.promote_concession()` was, in the reviewer's words, "one path through a
-- gate that otherwise doesn't exist yet". Both entrances now call this, so the
-- rules that make a clause version well-formed are written once.
--
-- SECURITY INVOKER, deliberately and for the same reason WP-06 kept promotion
-- that way: a caller-rights function cannot do anything the caller could not
-- already do, so table privileges and row-level security both stay in force
-- underneath it. Definer rights would switch both off and leave one hand-written
-- check carrying the whole gate.
--
-- p_origin is accepted from the start although the `origin` column does not
-- arrive until 0009. The parameter is in the signature now so that 0009 can
-- `create or replace` this function without changing its signature, and no
-- caller has to move.
create or replace function cw.mint_clause_version(
  p_clause_id    text,
  p_category_key text,
  p_severity     text,
  p_title        text,
  p_body         text,
  p_rationale    text,
  p_citations    text[],
  p_reviewer     text,
  p_expires_on   date,
  p_provenance   text,
  p_origin       text default 'legal_authored',
  p_source_ticket_id bigint default null
) returns int
language plpgsql security invoker as $$
declare v int;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'a clause version cannot be minted with no body'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reviewer), '') = '' then
    raise exception 'a clause version must name the human who approved it'
      using errcode = 'check_violation';
  end if;

  insert into cw.clause (clause_id, category_key, severity)
  values (p_clause_id, p_category_key, p_severity)
  on conflict (clause_id) do nothing;

  select coalesce(max(version), 0) + 1 into v
  from cw.clause_version where clause_id = p_clause_id;

  insert into cw.clause_version
    (clause_id, version, title, body, rationale, citations, reviewer,
     approved_on, expires_on, provenance, source_ticket_id)
  values (p_clause_id, v, p_title, p_body, p_rationale, p_citations, p_reviewer,
          current_date, p_expires_on, p_provenance, p_source_ticket_id);

  return v;
end $$;

-- A clause version that names a ticket must actually have come through it.
-- This is what makes the reviewer's narrow INSERT privilege safe: the only
-- clause version a cw_legal_reviewer can write is one a verified ticket says
-- they should, carrying the exact bytes that ticket approved.
create or replace function cw.clause_version_from_ticket() returns trigger
language plpgsql as $$
declare t cw.review_ticket%rowtype;
begin
  if new.source_ticket_id is null then return new; end if;
  select * into t from cw.review_ticket where ticket_id = new.source_ticket_id;
  if not found then
    raise exception 'no such review ticket: %', new.source_ticket_id
      using errcode = 'foreign_key_violation';
  end if;
  if t.state <> 'verified' then
    raise exception
      'review ticket % is %, not verified; language enters the library only '
      'through a verified ticket', t.ticket_id, t.state
      using errcode = 'restrict_violation';
  end if;
  if t.approved_text is distinct from new.body then
    raise exception
      'the body being minted is not the text review ticket % approved',
      t.ticket_id using errcode = 'restrict_violation';
  end if;
  if t.minted_clause_id is distinct from new.clause_id
     or t.minted_version is distinct from new.version then
    raise exception
      'review ticket % verified %@v%, not %@v%',
      t.ticket_id, t.minted_clause_id, t.minted_version, new.clause_id, new.version
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger clause_version_from_ticket
  before insert on cw.clause_version
  for each row execute function cw.clause_version_from_ticket();

-- ── Verification: the act that mints ────────────────────────────────────────
-- p_body is THE correction of rt-3 §4c. Without a body parameter a reviewer's
-- edit has nowhere to land and `edited_before_approval` is pinned to false
-- forever.
create or replace function cw.verify_review_ticket(
  p_ticket_id     bigint,
  p_body          text,          -- what the reviewer is actually approving
  p_new_clause_id text,
  p_title         text,
  p_rationale     text,
  p_reviewer      text,
  p_expires_on    date,
  p_origin        text default 'legal_authored',
  p_note          text default null
) returns text
language plpgsql security invoker as $$
declare t cw.review_ticket%rowtype; v int;
begin
  if cw.app_role() not in ('legal_reviewer','legal_admin') then
    raise exception 'only Legal may verify a review ticket'
      using errcode = 'insufficient_privilege';
  end if;

  select * into t from cw.review_ticket where ticket_id = p_ticket_id;
  if not found then
    raise exception 'no such review ticket: %', p_ticket_id;
  end if;
  if t.state <> 'pending' then
    raise exception 'review ticket % is already %', p_ticket_id, t.state
      using errcode = 'restrict_violation';
  end if;

  -- The version number is settled BEFORE the ticket moves, so the ticket can
  -- name exactly what it verified and the minting guard above has something to
  -- check against. One decision, one record, no second write.
  select coalesce(max(version), 0) + 1 into v
  from cw.clause_version where clause_id = p_new_clause_id;

  update cw.review_ticket set
    state            = 'verified',
    approved_text    = p_body,
    decided_by       = p_reviewer,
    decided_on       = now(),
    decision_note    = p_note,
    minted_clause_id = p_new_clause_id,
    minted_version   = v
  where ticket_id = p_ticket_id;

  -- Finding D1's lesson, applied at the new gate. An UPDATE with no matching
  -- policy does not raise — it affects nothing — so a promotion that "worked"
  -- can have recorded nothing at all. Check the rowcount rather than trusting
  -- the absence of an error.
  if not found then
    raise exception
      'review ticket % was not moved; the verifying role holds no UPDATE path '
      'to it', p_ticket_id using errcode = 'insufficient_privilege';
  end if;

  perform cw.mint_clause_version(
    p_clause_id    => p_new_clause_id,
    p_category_key => t.category_key,
    p_severity     => t.severity,
    p_title        => p_title,
    p_body         => p_body,
    p_rationale    => p_rationale,
    p_citations    => array['Policy-REVIEW-' || p_ticket_id],
    p_reviewer     => p_reviewer,
    p_expires_on   => p_expires_on,
    p_provenance   => 'reviewed',
    p_origin       => p_origin,
    p_source_ticket_id => p_ticket_id);

  return p_new_clause_id || '@v' || v;
end $$;

create or replace function cw.reject_review_ticket(
  p_ticket_id bigint, p_reviewer text, p_note text
) returns void
language plpgsql security invoker as $$
begin
  if cw.app_role() not in ('legal_reviewer','legal_admin') then
    raise exception 'only Legal may reject a review ticket'
      using errcode = 'insufficient_privilege';
  end if;
  update cw.review_ticket set
    state = 'rejected', decided_by = p_reviewer, decided_on = now(),
    decision_note = p_note
  where ticket_id = p_ticket_id;
  if not found then
    raise exception
      'review ticket % was not moved; the rejecting role holds no UPDATE path '
      'to it', p_ticket_id using errcode = 'insufficient_privilege';
  end if;
end $$;

-- ── Where every clause version came from ────────────────────────────────────
-- The query the gate exists to make answerable.
create or replace view cw.clause_entrance as
select v.clause_id, v.version, v.provenance, v.source_ticket_id, v.reviewer,
       case
         when v.source_ticket_id is not null then 'review_ticket'
         when v.provenance = 'promoted'      then 'concession_promotion'
         when v.provenance = 'seeded'        then 'seeded'
         else 'UNACCOUNTED'
       end as entrance
from cw.clause_version v;

comment on view cw.clause_entrance is
  'Every clause version and the door it came through. An UNACCOUNTED row is a
   clause nobody can explain, and there should never be one.';

-- The binding control of ADR-0010, computed rather than asserted.
create or replace view cw.review_quality as
select
  count(*) filter (where state = 'verified')                                as verified,
  count(*) filter (where state = 'rejected')                                as rejected,
  count(*) filter (where state = 'verified' and not edited_before_approval) as verified_unedited,
  case when count(*) filter (where state = 'verified') = 0 then null
       else round(
         count(*) filter (where state = 'verified' and not edited_before_approval)::numeric
         / count(*) filter (where state = 'verified'), 4) end               as unedited_rate
from cw.review_ticket;

comment on view cw.review_quality is
  'The unedited-approval rate. Legal owns the threshold (owner decision,
   2026-07-25); the system measures and displays, and sets no threshold.';

-- ── Audit ───────────────────────────────────────────────────────────────────
create or replace function cw.audit_review_ticket() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('review_ticket_opened', new.ticket_id::text,
      jsonb_build_object('category', new.category_key, 'severity', new.severity,
                         'badge', new.provenance_badge, 'reason', new.reason_code,
                         'draft_id', new.draft_id));
  elsif new.state is distinct from old.state then
    perform cw.audit('review_ticket_' || new.state, new.ticket_id::text,
      jsonb_build_object('decided_by', new.decided_by, 'note', new.decision_note,
                         'minted', case when new.minted_clause_id is null then null
                                        else new.minted_clause_id || '@v' || new.minted_version end,
                         'edited_before_approval', new.edited_before_approval));
  end if;
  return new;
end $$;

create trigger audit_review_ticket
  after insert or update on cw.review_ticket
  for each row execute function cw.audit_review_ticket();

create or replace function cw.audit_clause_draft() returns trigger
language plpgsql as $$
begin
  perform cw.audit('clause_drafted', new.draft_id::text,
    jsonb_build_object('model', new.model, 'model_version', new.model_version,
                       'kind', new.kind, 'chars', length(new.text)),
    'controller');   -- a machine act, and it may never be recorded as a human one
  return new;
end $$;

create trigger audit_clause_draft
  after insert on cw.clause_draft
  for each row execute function cw.audit_clause_draft();

-- ── Row-level security ──────────────────────────────────────────────────────
alter table cw.clause_draft     enable row level security;
alter table cw.review_ticket    enable row level security;
alter table cw.review_segment   enable row level security;
alter table cw.review_candidate enable row level security;

create policy read_all on cw.clause_draft for select
  using (cw.app_role() in ('requester','legal_reviewer','legal_admin','auditor'));
create policy draft_writes on cw.clause_draft for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));
-- Explicit and narrow: only Legal edits a draft, and only while it is unused —
-- the trigger above decides "unused", the policy decides "who".
create policy draft_update on cw.clause_draft for update
  using      (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

-- A ticket names a counterparty and what we were pushed to accept; scoped like
-- concessions and runs. A viewer sees none of it.
create policy read_scoped on cw.review_ticket for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester'
      and (opened_by = cw.app_actor()
           or (agreement_id is not null and cw.owns_agreement(agreement_id)))));
create policy open_ticket on cw.review_ticket for insert
  with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));

-- ════════════════════════════════════════════════════════════════════════════
-- THE D1 LESSON, APPLIED FROM LINE ONE
-- ════════════════════════════════════════════════════════════════════════════
-- Finding D1 was a governed UPDATE against a table with no UPDATE policy: it
-- raised nothing, affected nothing, and the function reported success. An
-- explicit `for update` policy with BOTH halves is what stops that shape:
--   · `using`      — which rows this role may even see to update
--   · `with check` — what the row is allowed to look like afterwards
-- A policy with only `using` silently reuses it for the check and reads as
-- though a decision had been made about the after-state when none had.
--
-- Deciding a ticket is Legal's act. A requester opens tickets; they do not
-- adjudicate them, and the missing UPDATE grant plus this policy are the two
-- walls that say so.
create policy decide_ticket on cw.review_ticket for update
  using      (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

create policy read_scoped on cw.review_segment for select using (
  exists (select 1 from cw.review_ticket t where t.ticket_id = review_segment.ticket_id));
create policy write_scoped on cw.review_segment for insert
  with check (
    cw.app_role() in ('requester','legal_reviewer','legal_admin')
    and exists (
      select 1 from cw.review_ticket t
       where t.ticket_id = review_segment.ticket_id));
create policy read_scoped on cw.review_candidate for select using (
  exists (select 1 from cw.review_ticket t where t.ticket_id = review_candidate.ticket_id));
create policy write_scoped on cw.review_candidate for insert
  with check (
    cw.app_role() in ('requester','legal_reviewer','legal_admin')
    and exists (
      select 1 from cw.review_ticket t
       where t.ticket_id = review_candidate.ticket_id));

-- Minting from a verified ticket. ADR-0003 puts this act on the reviewer:
-- "Verify … mints a clause with derived rationale, a Policy-DERIVED-* citation,
-- today's date, a 2-year expiry, and the reviewer's name." The privilege is
-- fenced by cw.clause_version_from_ticket(), which refuses any version naming a
-- ticket that is not verified, or carrying bytes that ticket did not approve.
-- Without `source_ticket_id` a reviewer cannot write a clause version at all.
create policy reviewer_mints on cw.clause for insert
  with check (cw.app_role() = 'legal_reviewer');
create policy reviewer_mints on cw.clause_version for insert
  with check (cw.app_role() = 'legal_reviewer' and source_ticket_id is not null);

grant insert on cw.clause, cw.clause_version to cw_legal_reviewer;

grant select, insert on cw.clause_draft
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
grant update on cw.clause_draft to cw_legal_reviewer, cw_legal_admin;
grant select on cw.clause_draft to cw_auditor;
grant usage, select on sequence cw.clause_draft_draft_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;

grant select, insert on cw.review_ticket, cw.review_segment, cw.review_candidate
  to cw_requester, cw_legal_reviewer, cw_legal_admin;
-- UPDATE deliberately NOT granted to cw_requester: opening a ticket and
-- deciding one are two acts by two parties.
grant update on cw.review_ticket to cw_legal_reviewer, cw_legal_admin;
grant select on cw.review_ticket, cw.review_segment, cw.review_candidate,
                cw.review_quality, cw.clause_entrance
  to cw_auditor;
grant select on cw.review_quality, cw.clause_entrance
  to cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.review_ticket_ticket_id_seq
  to cw_requester, cw_legal_reviewer, cw_legal_admin;

-- PostgreSQL grants EXECUTE on every new function to PUBLIC. Both governed
-- functions below are therefore revoked and re-granted explicitly; without this
-- every role in the system could call them, and the role check inside is only
-- the second line.
revoke all on function cw.verify_review_ticket(bigint, text, text, text, text, text, date, text, text)
  from public;
grant execute on function cw.verify_review_ticket(bigint, text, text, text, text, text, date, text, text)
  to cw_legal_reviewer, cw_legal_admin;

revoke all on function cw.reject_review_ticket(bigint, text, text) from public;
grant execute on function cw.reject_review_ticket(bigint, text, text)
  to cw_legal_reviewer, cw_legal_admin;

revoke all on function cw.mint_clause_version(
  text, text, text, text, text, text, text[], text, date, text, text, bigint) from public;
grant execute on function cw.mint_clause_version(
  text, text, text, text, text, text, text[], text, date, text, text, bigint)
  to cw_legal_reviewer, cw_legal_admin;

-- Deliberately absent: any grant of the review queue to cw_viewer. A ticket
-- names what a counterparty pushed for and what we were prepared to give.
