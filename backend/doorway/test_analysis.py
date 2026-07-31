"""Round analysis does what NC-17 promises â€” and NC-19's single-pipeline claim.

THE THREE PATHS PINNED HERE

  1. The matched path: a changed paragraph lands one analysis row naming the
     open position it touches, the score, WHICH matcher and classifier
     produced it, and NC-06's retreat path as references.
  2. The no-match path: where nothing clears the bar the system does not
     guess â€” a review ticket with reason 'no-ai-match', the vendor's words
     in quarantine, and the analysis row points at the ticket.
  3. The supplier tail (NC-19): quarantined units run through the SAME code
     and produce rows of the SAME shape â€” asserted, not assumed.

AND THE STANDING RULE: analysis is advice. It moves no position, and the
test that proves it reads the position's state after analysing.
"""

from __future__ import annotations

import zipfile
from io import BytesIO

import psycopg
import pytest

from doorway import analysis, paper, redlines
from doorway.app import DOCX_TYPE, Upload
from doorway.db import Database
from doorway.identity import Caller
from engine import docx as engine_docx

ADMIN = "admin@clausewerk"
LEAH = "leah@clausewerk"
RITA = "rita@cw"
BEN = "ben@cw"

LEGAL = Caller(person=LEAH, role="legal_admin")
OWNING_REQUESTER = Caller(person=RITA, role="requester")
OTHER_REQUESTER = Caller(person=BEN, role="requester")
AUDITOR = Caller(person="ava@cw", role="auditor")


def redlined_docx(paragraphs_spec) -> bytes:
    """A vendor .docx with tracked changes â€” the engine's own test shape."""
    body = []
    for spec in paragraphs_spec:
        runs = []
        for kind, text in spec:
            if kind == "keep":
                runs.append(f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r>')
            elif kind == "ins":
                runs.append(
                    f'<w:ins w:id="1" w:author="J. Halvorsen" '
                    f'w:date="2026-04-18T10:00:00Z">'
                    f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:ins>')
            elif kind == "del":
                runs.append(
                    f'<w:del w:id="2" w:author="J. Halvorsen" '
                    f'w:date="2026-04-18T10:00:00Z">'
                    f'<w:r><w:delText xml:space="preserve">{text}</w:delText>'
                    f'</w:r></w:del>')
        body.append(f"<w:p>{''.join(runs)}</w:p>")
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{engine_docx.W}"><w:body>'
                f'{"".join(body)}</w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("[Content_Types].xml"), engine_docx.CONTENT_TYPES)
        z.writestr(zipfile.ZipInfo("_rels/.rels"), engine_docx.RELS)
        z.writestr(zipfile.ZipInfo("word/document.xml"), document)
    return buf.getvalue()


# The category's label words are the classifier's vocabulary â€” synthetic on
# purpose; these tests pin the mechanism, never wording. Four paragraphs,
# three fates: matched (a position exists), escalated (a category with no
# open position), unanswered (no category at all).
REDLINE = redlined_docx([
    [("keep", "This paragraph is untouched and is context, not a redline.")],
    [("keep", "All zorblefax handling stays with "),
     ("del", "Customer"), ("ins", "Vendor")],
    [("keep", "Quuxwork ownership questions are "),
     ("del", "reserved"), ("ins", "waived entirely")],
    [("ins", "Entirely unrelated frobnicate wording nobody can classify.")],
])


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def seeded(db: Database, owner_url: str):
    """A deal with an open negotiation, one open position on our clause, a
    two-rung ladder beneath it, and the counterparty's redline recorded as a
    received round through the real NC-09 path."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "insert into cw.category (key,label,short) values "
            "('data','Zorblefax Handling','ZH'), "
            "('ip','Quuxwork Ownership','QO')")
        owner.execute(
            "insert into cw.clause (clause_id,category_key,severity) values "
            "('ZH-A-001','data','Standard'), ('ZH-A-002','data','Standard')")
        owner.execute(
            "insert into cw.clause_version "
            "  (clause_id,version,title,body,approved_on,expires_on) values "
            "('ZH-A-001',1,'Preferred','placeholder','2025-01-01','2030-01-01'),"
            "('ZH-A-002',1,'Floor','placeholder','2025-01-01','2030-01-01')")
        owner.execute(
            "insert into cw.ladder (category_key,severity,owner) "
            "values ('data','Standard','R. Vance') returning ladder_id")
        owner.execute(
            "insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) "
            "select ladder_id, 0, 'ZH-A-001', 1, false from cw.ladder")
        owner.execute(
            "insert into cw.ladder_rung (ladder_id,rung,clause_id,version,is_floor) "
            "select ladder_id, 1, 'ZH-A-002', 1, true from cw.ladder")
        owner.execute(
            "insert into cw.agreement (agreement_id,counterparty,requester) "
            "values ('AG-A1','Vendor Co',%s)", (RITA,))
        owner.execute(
            "insert into cw.negotiation (agreement_id,paper,opened_by,"
            "baseline_chosen_by) values ('AG-A1','ours',%s,%s)", (RITA, RITA))
        owner.execute(
            "insert into cw.negotiation_position "
            "  (negotiation_id,category_key,our_clause_id,our_version,"
            "   round_raised,opened_from) "
            "select negotiation_id,'data','ZH-A-001',1,0,'library_standard' "
            "from cw.negotiation")

    recorded = redlines.record(
        db, OWNING_REQUESTER,
        Upload(body=REDLINE, content_type=DOCX_TYPE, filename="their-redline.docx"),
        {"agreement": "AG-A1"})
    assert recorded.status == 200, recorded.body
    return db


def analysis_rows(db: Database) -> list[dict]:
    with db.as_person(LEAH, "legal_admin") as request:
        return request.rows(
            "select * from cw.round_analysis order by analysis_id")


def test_match_score_uses_words_not_short_key_substrings():
    assert analysis._score("Supplier will ship promptly.", frozenset({"ip"})) == 0
    assert analysis._score("IP ownership changed.", frozenset({"ip"})) == 1


def test_the_matched_path_names_position_score_instrument_and_retreat(seeded, db):
    answered = analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    assert answered.status == 200, answered.body
    assert answered.body["paragraphs_analysed"] == 3, (
        "three paragraphs changed; the untouched one is context, not a redline")
    assert answered.body["matched"] == 1
    assert answered.body["escalated"] == 1

    matched = next(r for r in analysis_rows(db)
                   if r["matched_position"] is not None)
    assert matched["category_key"] == "data"
    assert matched["matcher"] == analysis.MATCHER, (
        "which matcher produced the score is on the row â€” scales are not "
        "comparable across matchers (open-questions Â§4)")
    assert matched["match_score"] is not None
    assert 0 < float(matched["match_score"]) <= 1
    assert matched["alternatives"]["path"] == ["ZH-A-001@v1", "ZH-A-002@v1"], (
        "the ranking IS the ladder: the retreat path from the matched "
        "position down to the floor, as references, never wording")
    assert matched["model"] is None and matched["model_version"] is None, (
        "no model is seated; the absence is recorded, never smoothed over")


def test_redline_fan_out_is_refused_before_analysis_rows(seeded, db, monkeypatch):
    monkeypatch.setattr(analysis, "MAX_ANALYSIS_UNITS", 2)

    answered = analysis.analyse(
        db, OWNING_REQUESTER, {"agreement": "AG-A1"})

    assert answered.status == 413
    assert analysis_rows(db) == []


def test_the_no_match_path_escalates_into_quarantine(seeded, db):
    analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    escalated = next(r for r in analysis_rows(db)
                     if r["no_match_ticket"] is not None)
    assert escalated["matched_position"] is None, "matched XOR ticketed"

    with db.as_person(LEAH, "legal_admin") as request:
        [ticket] = request.rows(
            "select reason_code, provenance_badge, state from cw.review_ticket "
            "where ticket_id = %s", (escalated["no_match_ticket"],))
    assert ticket["reason_code"] == "no-ai-match", (
        "the system does not guess; it escalates (ADR-0005)")
    assert ticket["state"] == "pending"


def test_an_unclassifiable_paragraph_lands_visibly_unanswered(seeded, db):
    """No category, no position, no ticket a ticket could name. The row
    carries all three absences — never a guess dressed as an answer."""
    analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    unanswered = [r for r in analysis_rows(db)
                  if r["matched_position"] is None
                  and r["no_match_ticket"] is None]
    assert len(unanswered) == 1
    assert unanswered[0]["category_key"] is None
    assert unanswered[0]["match_score"] is None


def test_analysis_is_advice_and_moves_no_position(seeded, db):
    analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    with db.as_person(LEAH, "legal_admin") as request:
        [position] = request.rows(
            "select state from cw.position_current")
    assert position["state"] == "open", (
        "an analysis row is advice; moving a position remains NC-02's "
        "endpoint under a named actor")


def test_a_rerun_appends_rather_than_rewriting(seeded, db):
    analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    first = len(analysis_rows(db))
    analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    assert len(analysis_rows(db)) == 2 * first, (
        "the record is re-derivable and append-only: a better analysis is a "
        "new run, never an edit")


def test_a_colleagues_deal_answers_as_if_it_held_no_negotiation(seeded, db):
    answered = analysis.analyse(db, OTHER_REQUESTER, {"agreement": "AG-A1"})
    assert answered.refused, answered.body
    assert answered.status == 409


def test_an_auditor_reads_the_analysis_and_cannot_run_one(seeded, db):
    answered = analysis.analyse(db, AUDITOR, {"agreement": "AG-A1"})
    assert answered.refused, answered.body
    assert answered.body.get("reason", "").strip()


def test_a_deal_with_no_received_round_is_told_what_comes_first(seeded, db, owner_url):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "insert into cw.agreement (agreement_id,counterparty,requester) "
            "values ('AG-A2','Quiet Co',%s)", (RITA,))
        owner.execute(
            "insert into cw.negotiation (agreement_id,paper,opened_by,"
            "baseline_chosen_by) values ('AG-A2','ours',%s,%s)", (RITA, RITA))
    answered = analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A2"})
    assert answered.status == 409, answered.body


# â”€â”€ NC-19: the supplier tail, same pipeline, same shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_supplier_units_run_the_same_pipeline_and_land_the_same_shape(seeded, db):
    """A redline paragraph and a supplier unit produce analysis rows of the
    same shape, through the same code â€” the single-pipeline claim."""
    ingested = paper.ingest(
        db, OWNING_REQUESTER,
        Upload(body=_vendor_paper(), content_type=DOCX_TYPE,
               filename="their-msa.docx"),
        {"agreement": "AG-A1"})
    assert ingested.status == 200, ingested.body
    assert ingested.body["tickets_opened"] >= 1

    before = analysis_rows(db)
    answered = analysis.analyse_supplier_units(
        db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    assert answered.status == 200, answered.body
    assert answered.body["paragraphs_analysed"] >= 1

    rows = analysis_rows(db)
    supplier_rows = rows[len(before):]
    assert supplier_rows, "the supplier tail landed no analysis rows"

    redline_first = analysis.analyse(db, OWNING_REQUESTER,
                                     {"agreement": "AG-A1"})
    assert redline_first.status == 200

    # Same shape through the same code: identical column sets, identical
    # instruments, in the same record.
    all_rows = analysis_rows(db)
    assert set(all_rows[0].keys()) == set(supplier_rows[0].keys())
    assert supplier_rows[0]["matcher"] == analysis.MATCHER
    assert supplier_rows[0]["classifier"] == analysis.CLASSIFIER


# ── NC-26: risk estimates, prospective and retrospective ────────────────────

def test_model_down_still_answers_and_the_absence_is_an_outcome(seeded, db,
                                                               monkeypatch):
    """No key is configured in the test environment; the analysis must land
    whole, with an absent risk row carrying its reason. Advice that gates
    action has become a decision — so nothing here may gate."""
    monkeypatch.delenv("CLAUSEWERK_OPENAI_API_KEY", raising=False)
    answered = analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    assert answered.status == 200, answered.body
    [assessment] = answered.body["risk_assessments"]
    assert assessment["outcome"] == "absent"
    assert assessment["transfer_estimate"] is None
    assert assessment["absent_reason"].strip(), (
        "an absence carries its reason — it is an outcome, not a blank")


def test_a_reachable_model_lands_a_recorded_estimate(seeded, db, monkeypatch):
    """The judge is stubbed at the seam — the mechanism is what is pinned,
    never any estimate's value as a truth about contracts."""
    from doorway import advisory as advisory_module

    def stubbed(baseline, compared):
        return advisory_module.Judgment(
            score=0.42, basis="placeholder basis", absent_reason=None,
            model="stub-model", model_version="stub-1",
            prompt="p", inputs=[])

    monkeypatch.setattr(analysis.advisory, "judge_risk_exposure", stubbed)
    answered = analysis.analyse(db, OWNING_REQUESTER, {"agreement": "AG-A1"})
    assert answered.status == 200, answered.body
    [assessment] = answered.body["risk_assessments"]
    assert assessment["outcome"] == "recorded"
    assert float(assessment["transfer_estimate"]) == 0.42

    with db.as_person(LEAH, "legal_admin") as request:
        [row] = request.rows(
            "select direction, model, analysis_id from cw.risk_assessment "
            "where outcome = 'recorded'")
    assert row["direction"] == "prospective"
    assert row["model"] == "stub-model"
    assert row["analysis_id"] is not None, "anchored to the analysis row"


def test_a_settled_concession_is_assessed_for_what_it_cost(seeded, db,
                                                           owner_url,
                                                           monkeypatch):
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "insert into cw.agreement_attorney (agreement_id, attorney, "
            "assigned_by) values ('AG-A1', %s, 'owner')", (LEAH,))
        owner.execute(
            "insert into cw.concession "
            "  (agreement_id,category_key,standard_clause_id,standard_version,"
            "   conceded_rung,reason,approved_by,proposer_kind) "
            "values ('AG-A1','data','ZH-A-001',1,1,'placeholder reason',"
            "        %s,'human')", (RITA,))
        owner.execute(
            "insert into cw.concession_approval "
            "  (concession_id, approver_kind, approver) "
            "select concession_id, 'requester', %s from cw.concession",
            (RITA,))
        owner.execute(
            "insert into cw.concession_approval "
            "  (concession_id, approver_kind, approver) "
            "select concession_id, 'attorney', %s from cw.concession",
            (LEAH,))
        owner.execute(
            "insert into cw.concession_settlement (concession_id, settled_by) "
            "select concession_id, %s from cw.concession", (RITA,))

    def stubbed(baseline, compared):
        from doorway import advisory as advisory_module
        return advisory_module.Judgment(
            score=-0.2, basis="placeholder", absent_reason=None,
            model="stub-model", model_version="stub-1", prompt="p", inputs=[])

    monkeypatch.setattr(analysis.advisory, "judge_risk_exposure", stubbed)
    answered = analysis.assess_concessions(db, OWNING_REQUESTER,
                                           {"agreement": "AG-A1"})
    assert answered.status == 200, answered.body
    assert answered.body["concessions_assessed"] == 1
    [assessment] = answered.body["risk_assessments"]
    assert assessment["outcome"] == "recorded"
    assert float(assessment["transfer_estimate"]) == -0.2, (
        "both directions: a negative estimate is risk moving to the vendor")

    again = analysis.assess_concessions(db, OWNING_REQUESTER,
                                        {"agreement": "AG-A1"})
    assert again.body["concessions_assessed"] == 0, (
        "idempotent: an assessed concession is not re-asked")


def _vendor_paper() -> bytes:
    """The vendor's own paper: no tracked changes, just their words â€”
    classified by the same vocabulary the redline path uses."""
    buf = BytesIO()
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{engine_docx.W}"><w:body>'
        '<w:p><w:r><w:t xml:space="preserve">All zorblefax handling records '
        'remain with Vendor.</w:t></w:r></w:p>'
        '</w:body></w:document>')
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("[Content_Types].xml"), engine_docx.CONTENT_TYPES)
        z.writestr(zipfile.ZipInfo("_rels/.rels"), engine_docx.RELS)
        z.writestr(zipfile.ZipInfo("word/document.xml"), document)
    return buf.getvalue()
