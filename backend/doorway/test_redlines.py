"""Recording a received redline does what NC-09 promises, and nothing else.

THE THREE GUARANTEES THESE TESTS PIN

  1. The round and the document are ONE recorded fact. The bytes land in
     cw.received_document, the round points at that row and carries the
     schema's own fingerprint of those bytes — and a refusal of either
     unwinds both, so there is never a stored document with no round or a
     round pointing at nothing.

  2. The caller supplies bytes and a deal name, and NOTHING else. The
     SHA-256 is a GENERATED column (0047), the direction is 'received'
     structurally, the run id is null structurally, the round number is
     derived from the record, and the actor is the connection's.

  3. The database decides who records. Legal on any deal, a requester on
     their own (0027's two-branch shape on the round; 0047's working-roles
     rule on the document). The auditor and the viewer are refused in the
     database's words, and a deal that is not yours to see answers as if it
     held no negotiation — which is what the screen shows too.
"""

from __future__ import annotations

import hashlib

import psycopg
import pytest

from doorway import redlines
from doorway.app import DOCX_TYPE, App, Upload
from doorway.db import Database
from doorway.identity import Caller

ADMIN = "admin@clausewerk"
LEAH = "leah@clausewerk"
RITA = "rita@clausewerk"
BEN = "ben@clausewerk"

LEGAL = Caller(person=LEAH, role="legal_admin")
OWNING_REQUESTER = Caller(person=RITA, role="requester")
OTHER_REQUESTER = Caller(person=BEN, role="requester")
AUDITOR = Caller(person="aud@clausewerk", role="auditor")
VIEWER = Caller(person="sam@clausewerk", role="viewer")

# A redline is stored, never parsed — deliberately not a valid .docx, so any
# accidental "let me just read it" added later fails loudly here.
MARKUP = b"PK\x03\x04 their markup, byte for byte as it arrived \xff\xfe"


def redline_upload(body: bytes = MARKUP) -> Upload:
    return Upload(body=body, content_type=DOCX_TYPE, filename="redline-r1.docx")


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def seeded(db: Database, owner_url: str):
    """Two deals with two different owners, a negotiation open on each, and
    the four kinds of people who will try to record against them."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            ("owner@clausewerk", ADMIN, "The Administrator",
             LEAH, "Leah Legal", "Legal"))
        owner.execute(
            "insert into cw.account (person,display_name,unit,role,created_by) values "
            "(%s,'Rita Requester','Procurement','requester',%s),"
            "(%s,'Ben Buyer','Procurement','requester',%s),"
            "('aud@clausewerk','Ava Auditor','Audit','auditor',%s),"
            "('sam@clausewerk','Sam Supplier','Supplier','viewer',%s)",
            (RITA, ADMIN, BEN, ADMIN, ADMIN, ADMIN))
        owner.execute(
            "insert into cw.role_grant (action,person,role,acted_by,reason) values "
            "('granted',%s,'requester',%s,'x'),"
            "('granted',%s,'requester',%s,'x'),"
            "('granted','aud@clausewerk','auditor',%s,'x'),"
            "('granted','sam@clausewerk','viewer',%s,'x')",
            (RITA, ADMIN, BEN, ADMIN, ADMIN, ADMIN))
        owner.execute(
            "insert into cw.agreement (agreement_id,counterparty,requester) values "
            "('AG-100','Northwind',%s), ('AG-200','Contoso',%s)", (RITA, BEN))
        owner.execute(
            "insert into cw.negotiation "
            "  (agreement_id,paper,opened_by,baseline_chosen_by) values "
            "('AG-100','ours',%s,%s), ('AG-200','ours',%s,%s)",
            (RITA, RITA, BEN, BEN))
    return db


def rounds_on(db: Database, agreement_id: str) -> list[dict]:
    with db.as_person(LEAH, "legal_admin") as request:
        return request.rows(
            "select r.round_no, r.direction, r.document_sha256, r.storage_uri, "
            "       r.run_id "
            "from cw.negotiation_round r join cw.negotiation n using (negotiation_id) "
            "where n.agreement_id = %s order by r.round_no", (agreement_id,))


def documents_stored(db: Database) -> list[dict]:
    with db.as_person(LEAH, "legal_admin") as request:
        return request.rows(
            "select document_id, agreement_id, sha256, byte_count, filename "
            "from cw.received_document order by document_id")


def test_a_recorded_redline_is_a_received_round_pointing_at_the_stored_bytes(
    seeded, db
):
    answered = redlines.record(db, OWNING_REQUESTER, redline_upload(),
                               {"agreement": "AG-100"})
    assert answered.status == 200, answered.body
    assert answered.body["round_no"] == 1
    assert answered.body["direction"] == "received"

    [stored] = documents_stored(db)
    assert stored["agreement_id"] == "AG-100"
    assert stored["byte_count"] == len(MARKUP)

    [recorded] = rounds_on(db, "AG-100")
    assert recorded["direction"] == "received"
    assert recorded["run_id"] is None, (
        "a received redline did not come out of an assembly run; a run id "
        "here breaks the provenance chain (0011:69-75)")
    assert recorded["document_sha256"] == stored["sha256"]
    assert recorded["storage_uri"] == (
        f"cw://received-document/{stored['document_id']}"), (
        "the round must point at the row the bytes actually landed in")


def test_the_fingerprint_is_the_schemas_own_arithmetic_over_the_bytes(seeded, db):
    """The response's sha256 is the GENERATED column's value, and it equals
    what an independent hash of the same bytes says. There is no field, query
    key or header through which a caller could supply a different one."""
    answered = redlines.record(db, LEGAL, redline_upload(),
                               {"agreement": "AG-100"})
    assert answered.body["document_sha256"] == (
        hashlib.sha256(MARKUP).hexdigest())


def test_the_next_recording_takes_the_next_round(seeded, db):
    first = redlines.record(db, OWNING_REQUESTER, redline_upload(),
                            {"agreement": "AG-100"})
    second = redlines.record(db, OWNING_REQUESTER,
                             redline_upload(MARKUP + b" round two"),
                             {"agreement": "AG-100"})
    assert (first.body["round_no"], second.body["round_no"]) == (1, 2)
    assert len(documents_stored(db)) == 2, (
        "each round keeps its own document; re-recording must not overwrite "
        "evidence")


def test_legal_records_on_a_deal_they_do_not_own(seeded, db):
    """The two-branch shape (0027): Legal never appears in
    cw.agreement.requester and is precisely who records on others' deals."""
    answered = redlines.record(db, LEGAL, redline_upload(),
                               {"agreement": "AG-200"})
    assert answered.status == 200, answered.body


def test_a_requester_cannot_record_on_a_deal_they_do_not_own(seeded, db):
    """Ben asks against Rita's deal. The negotiation is not his to see, so
    the answer is the same as for a deal with no negotiation at all — the
    lookup runs under his own read rules and answers nothing."""
    answered = redlines.record(db, OTHER_REQUESTER, redline_upload(),
                               {"agreement": "AG-100"})
    assert answered.refused, answered.body
    assert answered.status == 409
    assert documents_stored(db) == [], "a refused recording stored the bytes"
    assert rounds_on(db, "AG-100") == [], "a refused recording left a round"


def test_an_auditor_is_refused_and_nothing_lands(seeded, db):
    """The auditor reads everything and records nothing. The refusal comes
    from 0047's working-roles rule, in the database's words — and because the
    document and the round share one unit of work, neither survives it."""
    answered = redlines.record(db, AUDITOR, redline_upload(),
                               {"agreement": "AG-100"})
    assert answered.refused, answered.body
    assert answered.body.get("error") == "refused"
    assert answered.body.get("reason", "").strip(), (
        "a refusal with no words is indistinguishable from a broken screen")
    assert documents_stored(db) == []
    assert rounds_on(db, "AG-100") == []


def test_a_viewer_is_refused_with_words(seeded, db):
    answered = redlines.record(db, VIEWER, redline_upload(),
                               {"agreement": "AG-100"})
    assert answered.refused, answered.body
    assert answered.body.get("reason", "").strip()


def test_no_deal_named_is_a_400_not_a_crash(seeded, db):
    answered = redlines.record(db, OWNING_REQUESTER, redline_upload(), {})
    assert answered.status == 400
    assert "agreement" in answered.body["reason"]


def test_no_document_is_a_400_not_a_crash(seeded, db):
    answered = redlines.record(db, OWNING_REQUESTER, None,
                               {"agreement": "AG-100"})
    assert answered.status == 400
    assert "document" in answered.body["reason"]


def test_the_route_reaches_the_module_with_the_upload_and_the_selector(seeded, db):
    """End to end through App.handle: the second endpoint to consume an
    upload, and the first whose selector travels with a document POST —
    the wire half of that guarantee is test_server.py's."""
    app = App(db, email_channel=lambda *_: None)
    token = app.sign_in(RITA).body["token"]
    response = app.handle("POST", "/negotiations/redline", token=token,
                          query={"agreement": "AG-100"},
                          upload=redline_upload())
    assert response.status == 200, response.body
    assert response.body["round_no"] == 1
