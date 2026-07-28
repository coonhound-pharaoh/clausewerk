-- 0029 · The draft record gains its four fields (NC-11)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-27: the
-- highest present was 0028 (nobody verifies their own request), so 0029 is the
-- next free number. The directory was listed again before the checks were run
-- and nothing had landed in between. 0008 is not edited; migrations are
-- append-only history and this file only adds to what 0008 built.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THE OWNER DECIDED (D-4, closed 2026-07-27)
-- ════════════════════════════════════════════════════════════════════════════
-- Four fields, and only four. The owner's answers are recorded in
-- docs/D4-DRAFT-RECORD-SESSION-PREP-2026-07-27.md §7 and in memory.md U14–U14d.
--
--   F1 · The edit-quality figure  → on the TICKET, beside the before-and-after.
--        Computed BY THE DATABASE at the moment of approval. Anything the
--        calling software sends is ignored and overwritten — the same rule that
--        already governs edited_before_approval. Never empty on a newly decided
--        ticket.
--
--   F2 · Intended purpose         → on the DRAFT, never empty, fixed at creation.
--   F3 · Known limitations at the time of use → on the DRAFT, never empty, fixed.
--   F4 · Model performance metrics → on the DRAFT, never empty, frozen at use.
--
-- Not in this migration, deliberately: the two AI advisory measurements the
-- owner also asked for (semantic content-difference, and the risk-exposure
-- estimate — memory.md U14a, U14c, U14d). An AI judgment arrives after the fact
-- and lives in its own advisory record; it is not a field on this frozen record,
-- and later packages build it.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THE EDIT-QUALITY FIGURE MEASURES — AND WHAT IT DOES NOT CLAIM
-- ════════════════════════════════════════════════════════════════════════════
-- Owner ruling U14b, written here so nobody has to go looking for it.
--
-- The figure measures TEXTUAL DISTANCE ONLY: how far apart the words the model
-- wrote and the words the reviewer approved actually are. Words added count
-- exactly as much as words removed. 1.0000 means the two texts are the same
-- words; the further apart they are, the lower the figure.
--
-- It claims one thing: "a person worked on this." It claims NOTHING about
-- meaning. A one-word change can reverse an obligation and barely move the
-- figure; a large rewording can leave the meaning untouched and move it a long
-- way. Meaning-level comparison is the AI's job and belongs to a separately
-- labelled advisory record, alongside this measurement and never in place of it.
--
-- How it is computed, in plain words: both texts are split into words on
-- whitespace, the words each text shares with the other are counted (a word
-- appearing twice in one text and once in the other counts once), and the figure
-- is twice the shared count divided by the total number of words in the two
-- texts. Same two texts in, same figure out, every time, on any machine. No
-- extension, no external library, no network — the database does the arithmetic
-- with what PostgreSQL already ships.
--
-- One deliberate adjustment: when the two texts are NOT identical, the figure is
-- held just below 1.0000. Without it, a single changed word inside a very long
-- clause rounds to 1.0000 and reads as "untouched" when a person did in fact
-- work on it — the one thing this figure exists to say.

-- ── The arithmetic, in the database ─────────────────────────────────────────

create or replace function cw.text_words(p_text text) returns text[]
language sql immutable strict as $$
  select case
    when btrim(p_text) = '' then '{}'::text[]
    else regexp_split_to_array(btrim(p_text), '\s+')
  end;
$$;

comment on function cw.text_words(text) is
  'A text as its list of words, split on whitespace. Nothing else is normalised:
   a change of capitalisation or punctuation is a change, because the reviewer
   made it on purpose.';

create or replace function cw.text_overlap(p_a text, p_b text) returns numeric
language sql immutable as $$
  with
  a as (select w, count(*) as n
          from unnest(cw.text_words(coalesce(p_a, ''))) as w group by w),
  b as (select w, count(*) as n
          from unnest(cw.text_words(coalesce(p_b, ''))) as w group by w),
  shared as (select coalesce(sum(least(a.n, b.n)), 0) as s from a join b using (w)),
  total  as (select coalesce((select sum(n) from a), 0)
                  + coalesce((select sum(n) from b), 0) as t)
  select case
    when (select t from total) = 0 then 1.0000::numeric
    else round(2 * (select s from shared)::numeric / (select t from total), 4)
  end;
$$;

comment on function cw.text_overlap(text, text) is
  'How far apart two texts are, as a figure from 0.0000 to 1.0000. TEXTUAL
   DISTANCE ONLY — additions count as much as deletions, and it says nothing
   about meaning (owner ruling U14b, 2026-07-27). Deterministic: the same two
   texts always give the same figure. No extension and no external dependency.';

-- ════════════════════════════════════════════════════════════════════════════
-- F1 · THE TICKET CARRIES THE FIGURE
-- ════════════════════════════════════════════════════════════════════════════
-- Nullable, and null is not a gap: a ticket that has not been decided has
-- nothing to compare, exactly as edited_before_approval is null until then. The
-- CHECKs below say when it must be there and when it must not, so "never empty"
-- is enforced where it means something — on a ticket that was approved.

alter table cw.review_ticket
  add column edit_similarity numeric(5,4);

comment on column cw.review_ticket.edit_similarity is
  'DERIVED, never supplied. How close the approved words are to the words the
   model proposed, from 0.0000 to 1.0000. Assigned by the database at the moment
   of approval and overwritten over anything the caller sent. Textual distance
   only — it claims a person worked on this, never that the meaning changed
   (owner ruling U14b).';

-- A figure outside 0..1 is not a figure. NOT VALID so a database that already
-- holds synthetic rows is not rejected by a rule written after those rows; every
-- row written or changed from now on is checked.
alter table cw.review_ticket
  add constraint edit_similarity_is_a_ratio
    check (edit_similarity is null or edit_similarity between 0 and 1) not valid;

-- Pending: the figure must be absent, like every other decision field.
alter table cw.review_ticket
  add constraint pending_has_no_similarity
    check (state <> 'pending' or edit_similarity is null);

-- Verified: the figure must be there. NOT VALID for the same reason as above —
-- tickets verified before this migration keep what they have; nothing decided
-- after it can be missing the figure.
alter table cw.review_ticket
  add constraint verified_has_similarity
    check (state <> 'verified' or edit_similarity is not null) not valid;

-- ── The open-time guard learns the new column ───────────────────────────────
-- 0008's allow-list, with edit_similarity added to the list of things a ticket
-- cannot be born carrying. Replaced whole rather than patched, because the guard
-- is an allow-list and an allow-list has to be read in one piece.
create or replace function cw.review_ticket_opens_pending() returns trigger
language plpgsql
security definer set search_path = cw, pg_temp as $$
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
     or new.edit_similarity is not null
     or new.decided_by is not null
     or new.decided_on is not null
     or new.decision_note is not null
     or new.minted_clause_id is not null
     or new.minted_version is not null then
    raise exception
      'a review ticket cannot be opened carrying a decision'
      using errcode = 'check_violation';
  end if;
  if new.draft_id is not null then
    -- Validate the known reference with complete visibility without granting
    -- requesters direct read access to every author's draft provenance.
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

-- ── The transition assigns the figure, beside the flag ──────────────────────
create or replace function cw.review_ticket_transition() returns trigger
language plpgsql as $$
declare sim numeric(5,4);
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

  -- ── The derived flag, and now the derived figure ──
  -- Both computed here from the two stored strings and assigned over whatever
  -- the caller supplied. A control the caller can fill in themselves is not a
  -- control, and the owner settled on 2026-07-27 that this figure is the
  -- database's to compute (D-4, 1.3).
  -- Direct Legal UPDATE is an intentional path for the database-derived edit
  -- measurements, so the no-self-review rule must live here as well as in the
  -- helper. Legal-originated tickets retain the existing carve-out.
  if new.state = 'verified'
     and old.opened_by = cw.app_actor()
     and not exists (
       select 1 from cw.effective_role e
        where e.person = old.opened_by
          and e.role in ('legal_reviewer','legal_admin')) then
    raise exception
      'review ticket % was opened by %, who may not also decide it',
      old.ticket_id, old.opened_by
      using errcode = 'insufficient_privilege';
  end if;

  if new.state = 'verified' then
    new.edited_before_approval := (new.approved_text is distinct from new.proposed_text);
    sim := cw.text_overlap(new.proposed_text, new.approved_text);
    -- Held below identity when the texts differ: see the note at the top.
    if new.edited_before_approval and sim >= 1 then sim := 0.9999; end if;
    new.edit_similarity := sim;
  else
    new.edited_before_approval := null;
    new.edit_similarity := null;
  end if;

  -- The decision time is evidence, not caller input. Assign over a supplied
  -- value so direct Legal UPDATE cannot backdate or future-date the record.
  new.decided_on := now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- F2, F3, F4 · THE DRAFT CARRIES ITS OWN DOCUMENTATION
-- ════════════════════════════════════════════════════════════════════════════
-- Three columns on the draft, all NOT NULL, all refusing a blank value.
--
-- WHY THERE IS A DEFAULT, AND WHAT IT IS NOT. 0005_run_store.sql:96-108 sets
-- down the house rule: a default can record a guess as a fact, so a column that
-- should be filled in deliberately gets no default. The owner's "never empty"
-- ruling and that rule pull in opposite directions on a table that already has
-- rows and callers that predate the columns. The resolution taken here:
--   · the column can never hold nothing — that is the owner's ruling, kept;
--   · what it holds when nobody said anything is a visible PLACEHOLDER that
--     reads as unfilled to any human and to any report, not a plausible-looking
--     invention that could be mistaken for a real answer.
-- All content in this system is placeholder pending review (CLAUDE.md), so the
-- text of these defaults is expected to change. When the callers that create
-- drafts supply all three fields, the defaults should be dropped and the fields
-- made properly caller-mandatory; that is a one-line migration then.

alter table cw.clause_draft
  add column intended_purpose  text not null
    default 'NOT RECORDED — no intended purpose was supplied for this draft',
  add column known_limitations text not null
    default 'NOT RECORDED — no limitations were supplied for this draft',
  add column model_performance jsonb not null
    default '{"recorded": false}'::jsonb;

alter table cw.clause_draft
  add constraint intended_purpose_not_blank  check (btrim(intended_purpose) <> ''),
  add constraint known_limitations_not_blank check (btrim(known_limitations) <> ''),
  add constraint model_performance_is_an_object
    check (jsonb_typeof(model_performance) = 'object' and model_performance <> '{}'::jsonb);

comment on column cw.clause_draft.intended_purpose is
  'What this draft was made for, in the words of whoever asked for it. Fixed at
   creation and never rewritten afterwards (owner ruling F2, 2026-07-27).';

comment on column cw.clause_draft.known_limitations is
  'What was known to be unreliable about this draft AT THE TIME IT WAS USED —
   not what we learned later. Fixed at creation (owner ruling F3).';

comment on column cw.clause_draft.model_performance is
  'How the model was performing when this draft was made. Frozen at use, so the
   record shows what was known then rather than today''s figures (owner ruling
   F4).';

-- ── Fixed at creation means fixed ───────────────────────────────────────────
-- 0008 froze a draft's text the moment a ticket was opened against it; before
-- that, a draft is ordinary work in progress. These three fields are stricter:
-- they are the record of what was known when the draft was made, so they are
-- fixed from the moment the draft exists, used or not. A record of what was
-- known at the time is worth nothing if it can be brought up to date.
create or replace function cw.clause_draft_frozen_when_used() returns trigger
language plpgsql as $$
begin
  if new.draft_id is distinct from old.draft_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.expires_on is distinct from old.expires_on
     or new.intended_purpose  is distinct from old.intended_purpose
     or new.known_limitations is distinct from old.known_limitations
     or new.model_performance is distinct from old.model_performance then
    raise exception
      'draft % creation provenance, expiry, purpose and known context are fixed '
      'when the draft is created and cannot be brought up to date', old.draft_id
      using errcode = 'restrict_violation';
  end if;
  if exists (select 1 from cw.review_ticket t where t.draft_id = old.draft_id) then
    raise exception
      'draft % is under review; the draft a ticket was opened against is the '
      'baseline the unedited-approval rate is measured from and cannot be edited',
      old.draft_id using errcode = 'restrict_violation';
  end if;
  return new;
end $$;
