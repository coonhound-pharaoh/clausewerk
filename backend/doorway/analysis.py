"""Round analysis: the counterparty's changes, matched, classified and ranked.

WHAT THIS IS (NC-17, and NC-19's supplier tail). A received redline sits on
the record as a round (NC-09) with its exact bytes in the store (0047). This
module reads those bytes back, splits them into one redline per changed
paragraph (`engine.docx.parse_redlines` — called, never modified), and for
each change answers three questions on the record (0052):

  · WHICH open negotiating position does this touch? Scored by the keyword
    matcher — the retained deterministic fallback (open-questions §4) — and
    where nothing clears the bar the system does not guess: it opens a
    review ticket with reason 'no-ai-match' (ADR-0005's escalation), and the
    analysis row points at the ticket instead of a position.
  · WHAT category is it? The same deterministic classifier the vendor-paper
    path uses (paper.py), imported rather than re-implemented, so the two
    boundaries cannot diverge.
  · WHAT are the alternatives? NC-06's ladder module, verbatim: the retreat
    path from the matched position down to the floor, as references. The
    ranking IS the ladder; any opinion beyond rung order is content.

ADVICE, NEVER A DECISION. Nothing here moves a position — that stays
NC-02's endpoint under a named actor — and the schema enforces it: the
analysis record holds no path to cw.position_movement.

THE MODEL SEAM, STATED. Matching and classification run deterministic-first
(ADR-0005: the fallback ships, a model is seated in front later, exactly as
the manifest classifier is fronted). The rows record which instrument
produced each answer; the model/model_version columns are null until a model
is seated, and that null is the recorded absence, never a smoothed-over one.
Risk estimates are NC-26's package, on this record's back.

ONE PIPELINE, TWO WAYS IN (NC-19): a redline against our paper arrives
through the round's stored document; a supplier unit (NC-18) arrives as a
quarantined ticket anchored to its paragraph. Both run through the same
`_analyse_one`, so the two produce rows of the same shape through the same
code — the single-pipeline claim, asserted by test.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass

import psycopg

from doorway import advisory
from doorway.db import Database
from doorway.identity import Caller
from doorway.paper import MIN_TERM, _classify, _terms_of  # one classifier, one copy
from doorway.refusals import Refused, classify
from engine import docx
from engine import ladder_placement as ladders

MATCHER = "keyword-category-words"
CLASSIFIER = "deterministic-category-words"

# Position states that still take negotiation. A settled or withdrawn point
# is history; matching a change to it would reopen an argument the record
# says is over — reopening is cw.position_revival's job to surface, not this
# module's to do silently.
OPEN_STATES = ("open", "held", "escalated", "conceded")
# One unit can create an immutable analysis row, a quarantine ticket, and an
# external judgment. Bound invocation fan-out independently of DOCX byte size
# and of the per-ingest supplier-paper ceiling.
MAX_ANALYSIS_UNITS = 200
# A unit cap bounds deterministic database work; it does not bound provider
# latency or spend because judgments are made sequentially after that work.
# Four calls mean one request can consume at most four provider timeouts and
# matches the process-wide in-flight ceiling in advisory.py.
MAX_ADVISORY_JUDGMENTS_PER_REQUEST = 4
MAX_CONCESSIONS_PER_REQUEST = 50
ADVISORY_LIMIT_REASON = (
    "the per-request advisory judgment limit was reached; no model call was made")


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def _score(text: str, terms: frozenset[str]) -> float:
    """The keyword matcher's score: what fraction of the category's own words
    appear in the text. 0..1 so it sits beside any later matcher's score
    without conversion — though the scales are NOT calibrated to each other,
    which is why every row names its matcher (§4's residue, recorded)."""
    if not terms:
        return 0.0
    words = frozenset(re.findall(r"[a-z]+", text.lower()))
    return round(sum(1 for term in terms if term in words) / len(terms), 4)


def _rank(request, category_key: str, severity: str,
          clause_id: str | None, version: int | None):
    """NC-06's retreat path for the matched position, as plain data."""
    rows = request.rows(
        """select r.rung, r.clause_id, r.version, r.is_floor
           from cw.ladder l join cw.ladder_rung r using (ladder_id)
           where l.category_key = %s and l.severity = %s
             and l.retired_on is null
           order by r.rung""", (category_key, severity))
    ladder = ladders.read_ladder(category_key, severity, rows)
    if ladder.refused:
        return {"refused": ladder.code}
    if clause_id is None or version is None:
        path = ladders.retreat_path(ladder)
        if isinstance(path, ladders.Refusal):
            return {"refused": path.code}
        return {"path": [r.ref for r in path]}
    ranking = ladders.rank(ladder, f"{clause_id}@v{version}")
    if ranking.refused:
        return {"refused": ranking.code}
    return {"path": [r.ref for r in ranking.alternatives]}


def _analyse_one(request, *, negotiation_id: int, round_no: int,
                 paragraph_index: int, original_text: str, proposed_text: str,
                 author: str | None, agreement_id: str,
                 vocabulary: dict, positions: list[dict]) -> dict:
    """One changed paragraph through the whole pipeline. Both entrances
    (redline and supplier unit) come through here — the single-pipeline
    claim NC-19 asserts."""
    category_key = _classify(proposed_text or original_text, vocabulary)

    matched = None
    score = None
    ticket_id = None
    alternatives = None

    if category_key is not None:
        score = _score(proposed_text or original_text, vocabulary[category_key])
        candidates = [p for p in positions
                      if p["category_key"] == category_key
                      and p["state"] in OPEN_STATES]
        # Category words cannot distinguish two live arguments in the same
        # category. Selecting the first row would let an unordered database
        # result decide which position received the advice. Ambiguity follows
        # the existing no-match escalation path instead.
        matched = candidates[0] if len(candidates) == 1 else None

    if matched is not None:
        severity = matched.get("severity") or "Standard"
        alternatives = _rank(request, category_key, severity,
                             matched.get("our_clause_id"),
                             matched.get("our_version"))
    elif category_key is not None:
        # A category, but no open position to pin the change to. The system
        # does not guess; it escalates (ADR-0005), and the vendor's words go
        # where vendor words go: quarantine. A ticket names a CATEGORY —
        # 0008's whole design — which is why this branch needs one.
        ticket_id = request.rows(
            """insert into cw.review_ticket
                 (agreement_id, category_key, severity, reason_code,
                  provenance_badge, proposed_text)
               values (%s, %s, 'Standard', 'no-ai-match', 'VENDOR LANGUAGE', %s)
               returning ticket_id""",
            (agreement_id, category_key, proposed_text or original_text),
        )[0]["ticket_id"]
    # else: unclassifiable — no category, no position, no ticket a ticket
    # could name. The row lands with all three absent: visibly unanswered,
    # never guessed at, and the screen's job is to show exactly that.

    row = request.rows(
        """insert into cw.round_analysis
             (negotiation_id, round_no, paragraph_index, original_text,
              proposed_text, author, matched_position, no_match_ticket,
              match_score, matcher, category_key, classifier, model,
              model_version, alternatives, analysed_by)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, null, null,
                   %s::jsonb, current_setting('cw.actor'))
           returning analysis_id, matched_position, no_match_ticket,
                     match_score, category_key""",
        (negotiation_id, round_no, paragraph_index, original_text,
         proposed_text, author,
         matched["position_id"] if matched else None, ticket_id,
         score, MATCHER, category_key, CLASSIFIER,
         json.dumps(alternatives) if alternatives else None),
    )[0]
    row["alternatives"] = alternatives
    row["paragraph_index"] = paragraph_index
    # For the risk judge, once the analysis has committed (B2): the original
    # paragraph is the baseline of record; our clause wording stands in when
    # there is no original (a supplier unit has no "our" original).
    row["_baseline"] = original_text or (matched.get("our_body") if matched else "")
    row["_compared"] = proposed_text
    return row


def _positions_of(request, negotiation_id: int) -> list[dict]:
    """The negotiation's positions with their current state and, where our
    clause is on the table, its severity and wording — the severity for the
    ladder lookup, the wording as the risk judge's fallback baseline."""
    return request.rows(
        """select p.position_id, p.category_key, p.our_clause_id,
                  p.our_version, p.state, c.severity, v.body as our_body
           from cw.position_current p
           left join cw.clause c on c.clause_id = p.our_clause_id
           left join cw.clause_version v
             on v.clause_id = p.our_clause_id and v.version = p.our_version
           where p.negotiation_id = %s""", (negotiation_id,))


# ── The risk estimates (NC-26) — after the analysis, never inside it ────────
#
# B2, verbatim: no transaction is held across a provider call. The analysis
# commits first; each judgment is then obtained holding nothing and recorded
# in its own short transaction. A buyer is never blocked by a judgment being
# unavailable — the absence lands as an outcome with its reason, and the
# analysis stands either way.

def _record_prospective(db: Database, caller: Caller, analysed: list[dict]) -> list[dict]:
    recorded = []
    judgments_requested = 0
    for row in analysed:
        if not row.get("matched_position"):
            continue
        baseline = (row.get("_baseline") or "").strip()
        compared = (row.get("_compared") or "").strip()
        if (baseline and compared
                and judgments_requested < MAX_ADVISORY_JUDGMENTS_PER_REQUEST):
            judgments_requested += 1
            judgment = advisory.judge_risk_exposure(baseline, compared)
            outcome = "absent" if judgment.score is None else "recorded"
            values = dict(score=judgment.score, basis=judgment.basis,
                          reason=judgment.absent_reason,
                          model=judgment.model,
                          model_version=judgment.model_version)
        elif baseline and compared:
            outcome = "absent"
            values = dict(score=None, basis=None, reason=ADVISORY_LIMIT_REASON,
                          model="none", model_version="none")
        else:
            outcome = "absent"
            values = dict(score=None, basis=None,
                          reason="no baseline text on the record to compare "
                                 "against",
                          model="none", model_version="none")
        with db.as_person(caller.person, caller.role) as request:
            stored = request.rows(
                """insert into cw.risk_assessment
                     (analysis_id, direction, baseline_text, compared_text,
                      outcome, transfer_estimate, basis, absent_reason,
                      model, model_version, assessed_by)
                   values (%(analysis_id)s, 'prospective', %(baseline)s,
                           %(compared)s, %(outcome)s, %(score)s, %(basis)s,
                           %(reason)s, %(model)s, %(model_version)s,
                           current_setting('cw.actor'))
                   returning assessment_id, analysis_id, outcome,
                             transfer_estimate, basis, absent_reason""",
                {"analysis_id": row["analysis_id"], "baseline": baseline,
                 "compared": compared, "outcome": outcome, **values})[0]
        recorded.append(stored)
    return recorded


def analyse(db: Database, caller: Caller, query: dict) -> Answer:
    """Analyse the latest received round of one deal's negotiation."""
    agreement_id = (query or {}).get("agreement", "").strip()
    if not agreement_id:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "name the deal to analyse (?agreement=...)"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            negotiations = request.rows(
                "select negotiation_id from cw.negotiation "
                "where agreement_id = %s", (agreement_id,))
            if not negotiations:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "no negotiation for that deal is visible to you"})
            negotiation_id = negotiations[0]["negotiation_id"]

            rounds = request.rows(
                """select round_no, document_sha256 from cw.negotiation_round
                   where negotiation_id = %s and direction = 'received'
                   order by round_no desc limit 1""", (negotiation_id,))
            if not rounds:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "no received round to analyse; record the "
                              "counterparty's redline first "
                              "(POST /negotiations/redline)"})
            round_no = rounds[0]["round_no"]

            documents = request.rows(
                """select document_id, bytes from cw.received_document
                   where agreement_id = %s and sha256 = %s
                   order by document_id desc limit 1""",
                (agreement_id, rounds[0]["document_sha256"]))
            if not documents:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "the round's document is not in the store; a "
                              "round recorded before the store existed is "
                              "re-recorded, not guessed at"})

            try:
                redlines = docx.parse_redlines(bytes(documents[0]["bytes"]))
            except docx.NotADocx as not_docx:
                return Answer(400, {"error": "refused", "kind": "rejected",
                                    "reason": f"that round's document is not "
                                              f"a readable .docx: {not_docx}"})
            if len(redlines) > MAX_ANALYSIS_UNITS:
                return Answer(413, {
                    "error": "refused", "kind": "rejected",
                    "reason": f"{len(redlines)} changed paragraphs is more "
                              f"than one analysis may process "
                              f"({MAX_ANALYSIS_UNITS}); split the round"})

            categories = request.rows("select key, label from cw.category")
            vocabulary = {c["key"]: _terms_of(c["key"], c["label"])
                          for c in categories}
            positions = _positions_of(request, negotiation_id)

            analysed = [
                _analyse_one(
                    request, negotiation_id=negotiation_id, round_no=round_no,
                    paragraph_index=redline.index,
                    original_text=redline.original_text,
                    proposed_text=redline.accepted_text,
                    author=redline.author, agreement_id=agreement_id,
                    vocabulary=vocabulary, positions=positions)
                for redline in redlines
            ]
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    # The analysis is committed; the estimates arrive after the fact (NC-26)
    # and their absence blocks nothing.
    try:
        assessments = _record_prospective(db, caller, analysed)
    except psycopg.Error as error:
        refused = classify(error)
        return Answer(refused.status, refused.as_body())
    for row in analysed:
        row.pop("_baseline", None), row.pop("_compared", None)

    return Answer(200, {
        "agreement_id": agreement_id,
        "negotiation_id": negotiation_id,
        "round_no": round_no,
        "paragraphs_analysed": len(analysed),
        "matched": sum(1 for a in analysed if a["matched_position"]),
        "escalated": sum(1 for a in analysed if a["no_match_ticket"]),
        "matcher": MATCHER,
        "classifier": CLASSIFIER,
        "analysis": analysed,
        # Estimates, labelled as such and never in place of anything.
        "risk_assessments": assessments,
    })


def analyse_supplier_units(db: Database, caller: Caller, query: dict) -> Answer:
    """NC-19: the supplier tail. Quarantined units (NC-18) through the SAME
    pipeline a redline runs — one code path, two entrances.

    The unit's text is read from its ticket's quarantined proposed_text; the
    analysis rows land against the deal's latest received round, which is the
    document the units came from."""
    agreement_id = (query or {}).get("agreement", "").strip()
    if not agreement_id:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "name the deal to analyse (?agreement=...)"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            negotiations = request.rows(
                "select negotiation_id, paper from cw.negotiation "
                "where agreement_id = %s", (agreement_id,))
            if not negotiations:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "no negotiation for that deal is visible to you"})
            negotiation_id = negotiations[0]["negotiation_id"]

            rounds = request.rows(
                """select round_no from cw.negotiation_round
                   where negotiation_id = %s and direction = 'received'
                   order by round_no desc limit 1""", (negotiation_id,))
            if not rounds:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "supplier units analyse against a received "
                              "round; record one first"})
            round_no = rounds[0]["round_no"]

            units = request.rows(
                """select u.paragraph_no, t.ticket_id, t.proposed_text
                   from cw.supplier_unit u
                   join cw.review_ticket t using (ticket_id)
                   where t.agreement_id = %s
                   order by u.paragraph_no
                   limit %s""", (agreement_id, MAX_ANALYSIS_UNITS + 1))
            if not units:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "no supplier units on that deal; ingest the "
                              "vendor's paper first (POST /paper/ingest)"})
            if len(units) > MAX_ANALYSIS_UNITS:
                return Answer(413, {
                    "error": "refused", "kind": "rejected",
                    "reason": f"more than {MAX_ANALYSIS_UNITS} supplier units "
                              "are waiting; split them across deals"})

            categories = request.rows("select key, label from cw.category")
            vocabulary = {c["key"]: _terms_of(c["key"], c["label"])
                          for c in categories}
            positions = _positions_of(request, negotiation_id)

            analysed = [
                _analyse_one(
                    request, negotiation_id=negotiation_id, round_no=round_no,
                    paragraph_index=unit["paragraph_no"],
                    original_text="",  # supplier paper has no "our" original
                    proposed_text=unit["proposed_text"],
                    author=None, agreement_id=agreement_id,
                    vocabulary=vocabulary, positions=positions)
                for unit in units
            ]
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    try:
        assessments = _record_prospective(db, caller, analysed)
    except psycopg.Error as error:
        refused = classify(error)
        return Answer(refused.status, refused.as_body())
    for row in analysed:
        row.pop("_baseline", None), row.pop("_compared", None)

    return Answer(200, {
        "agreement_id": agreement_id,
        "negotiation_id": negotiation_id,
        "round_no": round_no,
        "paragraphs_analysed": len(analysed),
        "matched": sum(1 for a in analysed if a["matched_position"]),
        "escalated": sum(1 for a in analysed if a["no_match_ticket"]),
        "matcher": MATCHER,
        "classifier": CLASSIFIER,
        "analysis": analysed,
        "risk_assessments": assessments,
    })


def assess_concessions(db: Database, caller: Caller, query: dict) -> Answer:
    """NC-26's retrospective half: what each settled concession actually
    cost, as an estimate on the record. Idempotent — a concession already
    assessed is not re-asked; a fresher opinion is a deliberate re-run
    against a record that will then hold both."""
    agreement_id = (query or {}).get("agreement", "").strip()
    if not agreement_id:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "name the deal to assess (?agreement=...)"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            settled = request.rows(
                """select c.concession_id, sv.body as standard_body,
                          rv.body as conceded_body
                   from cw.concession c
                   join cw.concession_settlement s using (concession_id)
                   left join cw.clause_version sv
                     on sv.clause_id = c.standard_clause_id
                    and sv.version = c.standard_version
                   -- The concession's OWN ladder (bound by the authority
                   -- trigger at the moment of concession), not a lookup by
                   -- category — ladders retire and are replaced (0062), and a
                   -- historical rung number means what it meant on the ladder
                   -- it was conceded against.
                   left join cw.ladder_rung r
                     on r.ladder_id = c.ladder_id and r.rung = c.conceded_rung
                   left join cw.clause_version rv
                     on rv.clause_id = r.clause_id and rv.version = r.version
                   where c.agreement_id = %s
                     and not exists (select 1 from cw.risk_assessment ra
                                      where ra.concession_id = c.concession_id)
                   order by c.concession_id limit %s""",
                (agreement_id, MAX_CONCESSIONS_PER_REQUEST + 1))
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    concessions_deferred = max(0, len(settled) - MAX_CONCESSIONS_PER_REQUEST)
    settled = settled[:MAX_CONCESSIONS_PER_REQUEST]
    assessed = []
    in_progress = 0
    judgments_requested = 0
    for concession in settled:
        claim_token = uuid.uuid4()
        try:
            with db.as_person(caller.person, caller.role) as request:
                claimed = request.rows(
                    """insert into cw.risk_assessment_claim
                         (concession_id, claim_token, expires_at)
                       values (%s, %s, now() + interval '5 minutes')
                       on conflict (concession_id) do update
                         set claim_token = excluded.claim_token,
                             claimed_at = now(),
                             expires_at = excluded.expires_at
                       where cw.risk_assessment_claim.expires_at <= now()
                       returning claim_token""",
                    (concession["concession_id"], claim_token))
        except psycopg.Error as error:
            refused = classify(error)
            return Answer(refused.status, refused.as_body())
        if not claimed:
            in_progress += 1
            continue

        baseline = (concession["standard_body"] or "").strip()
        compared = (concession["conceded_body"] or "").strip()
        if (baseline and compared
                and judgments_requested < MAX_ADVISORY_JUDGMENTS_PER_REQUEST):
            judgments_requested += 1
            judgment = advisory.judge_risk_exposure(baseline, compared)
            outcome = "absent" if judgment.score is None else "recorded"
            values = dict(score=judgment.score, basis=judgment.basis,
                          reason=judgment.absent_reason,
                          model=judgment.model,
                          model_version=judgment.model_version)
        elif baseline and compared:
            outcome = "absent"
            values = dict(score=None, basis=None, reason=ADVISORY_LIMIT_REASON,
                          model="none", model_version="none")
        else:
            # A concession with no conceded rung, or a rung whose wording is
            # not on the ladder: nothing comparable exists, and the record
            # says so instead of holding an opinion about nothing.
            outcome = "absent"
            values = dict(score=None, basis=None,
                          reason="the concession names no conceded wording "
                                 "to compare against the standard",
                          model="none", model_version="none")
        try:
            with db.as_person(caller.person, caller.role) as request:
                stored = request.rows(
                    """insert into cw.risk_assessment
                         (concession_id, direction, baseline_text,
                          compared_text, outcome, transfer_estimate, basis,
                          absent_reason, model, model_version, assessed_by)
                       values (%(concession_id)s, 'retrospective',
                               %(baseline)s, %(compared)s, %(outcome)s,
                               %(score)s, %(basis)s, %(reason)s, %(model)s,
                               %(model_version)s, current_setting('cw.actor'))
                       returning assessment_id, concession_id, outcome,
                                 transfer_estimate, basis, absent_reason""",
                    {"concession_id": concession["concession_id"],
                     "baseline": baseline, "compared": compared,
                     "outcome": outcome, **values})[0]
                request.write(
                    "delete from cw.risk_assessment_claim "
                    "where concession_id = %s and claim_token = %s",
                    (concession["concession_id"], claim_token))
        except psycopg.Error as error:
            refused = classify(error)
            return Answer(refused.status, refused.as_body())
        assessed.append(stored)

    return Answer(200, {
        "agreement_id": agreement_id,
        "concessions_assessed": len(assessed),
        "assessment_in_progress": in_progress,
        "concessions_deferred": concessions_deferred,
        "risk_assessments": assessed,
    })
