-- 0052 · The round-analysis record (NC-17)
--
-- Number claimed by listing backend/db/migrations/ on disk, 2026-07-30: the
-- highest present was 0051, so 0052 is the next free number.
--
-- WHAT A ROW IS: one analysed paragraph of one received round — what the
-- counterparty's change said, which open position it touches (or the review
-- ticket the no-match path opened instead), which matcher and classifier
-- produced those answers with what score, and the deterministic retreat path
-- (NC-06) beside it as ADVICE.
--
-- THE MATCHER-FALLBACK READING, assumed as the package states it and flagged
-- to the owner rather than waited on: ADR-0005 and open-questions §4
-- reconcile as two layers — the keyword scorer SCORES, and where nothing
-- clears the bar the system does not guess, it ESCALATES (a review ticket,
-- reason 'no-ai-match', a value 0008 has always permitted). Which matcher
-- produced each score is ON THE ROW, so when a vector matcher arrives the
-- record stays honest without recalibration (§4's known residue).
--
-- ADVICE, NEVER A DECISION, by schema: nothing here references
-- cw.position_movement, no trigger writes one, and moving a position remains
-- NC-02's endpoint under a named actor. The alternatives column carries
-- ladder REFERENCES (clause@version), never wording.
--
-- RE-DERIVABLE, NOT SACRED — the ruling NC-17 carries: this record is
-- advisory output over inputs the system already keeps immutably (the stored
-- document, the positions, the pinned ladders), so a wrong field is a later
-- migration and a re-run, never a rewrite of history. Append-only all the
-- same: a re-run APPENDS a fresh analysis, and which advice a person saw at
-- the time stays answerable.

create table cw.round_analysis (
  analysis_id     bigserial primary key,
  negotiation_id  bigint not null,
  round_no        int    not null,
  -- Redline.index: which changed paragraph of the round's document.
  paragraph_index int    not null check (paragraph_index >= 0),
  -- What was actually read — copied, not referenced, the 0030 rule: a
  -- judgment or a match is only re-checkable with the exact words beside it.
  original_text   text   not null,
  proposed_text   text   not null,
  -- The counterparty's claim about authorship, recorded as claimed.
  author          text,

  -- The match half. Either a position was matched, or the no-match path
  -- opened a ticket, or the paragraph was unclassifiable (both null, score
  -- null) — visibly unanswered, never guessed.
  matched_position bigint references cw.negotiation_position(position_id),
  no_match_ticket  bigint references cw.review_ticket(ticket_id),
  match_score      numeric(6,4) check (match_score is null
                                       or (match_score >= 0 and match_score <= 1)),
  -- WHICH matcher produced the score (§4: scales are not comparable across
  -- matchers, so the record names its instrument).
  matcher          text not null check (btrim(matcher) <> ''),

  -- The classification half, with its instrument.
  category_key     text references cw.category(key),
  classifier       text not null check (btrim(classifier) <> ''),

  -- The AI-assisted steps' provenance. Null means no model was reachable or
  -- seated — the absence recorded, never smoothed over (the NC-25 rule).
  model            text,
  model_version    text,

  -- NC-06's deterministic ranking, as references: the retreat path from the
  -- matched position down to the floor, or the module's refusal code for a
  -- damaged ladder. Advice; the floor inside it is absolute.
  alternatives     jsonb,

  analysed_at      timestamptz not null default now(),
  analysed_by      text not null check (btrim(analysed_by) <> ''),

  foreign key (negotiation_id, round_no)
    references cw.negotiation_round(negotiation_id, round_no),
  -- A match and a no-match ticket are opposite answers to the same question.
  constraint matched_xor_ticketed
    check (matched_position is null or no_match_ticket is null)
);

create index on cw.round_analysis (negotiation_id, round_no);

comment on table cw.round_analysis is
  'One analysed paragraph of one received round. Advisory throughout: it can
   move no position (nothing here touches cw.position_movement), the ranking
   is NC-06''s ladder order and nothing else, and each row names the matcher
   and classifier that produced it. Append-only; a re-run appends.';

-- Append-only, the house shape.
create or replace function cw.round_analysis_frozen() returns trigger
language plpgsql as $$
begin
  raise exception
    'the analysis record is append-only; a better analysis is a new run, '
    'never an edit' using errcode = 'restrict_violation';
end $$;

create trigger round_analysis_frozen before update on cw.round_analysis
  for each row execute function cw.round_analysis_frozen();
create trigger round_analysis_no_delete before delete on cw.round_analysis
  for each row execute function cw.round_analysis_frozen();
create trigger round_analysis_no_truncate before truncate on cw.round_analysis
  execute function cw.round_analysis_frozen();

-- The analyst is the connection, never a claim.
create or replace function cw.bind_round_analysis_actor() returns trigger
language plpgsql as $$
begin
  if cw.app_role() is not null then
    new.analysed_by := cw.app_actor();
    new.analysed_at := now();
  end if;
  return new;
end $$;

create trigger round_analysis_binds_actor
  before insert on cw.round_analysis
  for each row execute function cw.bind_round_analysis_actor();

-- ── Who may do what ─────────────────────────────────────────────────────────
-- The negotiation record's own shape (0027): Legal unconditional, a
-- requester on a negotiation they own; Legal, Audit and the requester's own
-- deals readable. No viewer, and no administrator — the analysis quotes
-- vendor wording, and the administrator's boundary on the negotiation family
-- is the owner's open question (0027's stated non-decision), not this
-- package's to widen.
alter table cw.round_analysis enable row level security;

create policy read_scoped on cw.round_analysis for select using (
  cw.app_role() in ('legal_reviewer','legal_admin','auditor')
  or (cw.app_role() = 'requester' and exists (
        select 1 from cw.negotiation n
        where n.negotiation_id = round_analysis.negotiation_id
          and cw.owns_agreement(n.agreement_id))));

create policy write_scoped on cw.round_analysis for insert
  with check (
    cw.app_role() in ('legal_reviewer','legal_admin')
    or (cw.app_role() = 'requester' and exists (
          select 1 from cw.negotiation n
          where n.negotiation_id = round_analysis.negotiation_id
            and cw.owns_agreement(n.agreement_id))));

revoke all on cw.round_analysis from public;
grant select on cw.round_analysis to
  cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor;
grant insert on cw.round_analysis to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
grant usage, select on sequence cw.round_analysis_analysis_id_seq to
  cw_requester, cw_legal_reviewer, cw_legal_admin;
