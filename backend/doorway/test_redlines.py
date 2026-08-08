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

AND READING ONE BACK OUT (NI-4, 2026-08-05). The tests at the bottom cover
`fetch`, whose whole design is one sentence: the ROUND's read policy decides,
not the document store's. 0047 gave cw.received_document a `read_all` policy,
so a test that resolved a document by its own id would pass while handing one
requester another requester's supplier paper — which is exactly the assertion
below that would have failed on the obvious implementation.
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


# ── Reading one back out (NI-4) ─────────────────────────────────────────────


def recorded(db: Database, caller: Caller = OWNING_REQUESTER,
             agreement: str = "AG-100") -> dict:
    """One redline on the record, and where to ask for it back."""
    answered = redlines.record(db, caller, redline_upload(), {"agreement": agreement})
    assert answered.status == 200, answered.body
    return answered.body


def test_the_owning_requester_gets_their_counterpartys_bytes_back(seeded, db):
    """Byte for byte, under the name the file arrived with. A document that
    comes back altered is not the document the round attests to."""
    where = recorded(db)
    got = redlines.fetch(db, OWNING_REQUESTER, {
        "negotiation": str(where["negotiation_id"]),
        "round": str(where["round_no"])})
    assert got.status == 200, getattr(got, "body", got)
    assert got.body == MARKUP
    assert got.content_type == DOCX_TYPE
    assert got.filename == "redline-r1.docx"


def test_legal_reads_the_paper_on_a_deal_they_do_not_own(seeded, db):
    where = recorded(db)
    got = redlines.fetch(db, LEGAL, {"negotiation": str(where["negotiation_id"]),
                                     "round": str(where["round_no"])})
    assert got.status == 200, getattr(got, "body", got)
    assert got.body == MARKUP


def test_another_requester_gets_a_sentence_and_no_bytes(seeded, db):
    """THE ASSERTION THIS ENDPOINT EXISTS TO SATISFY. Ben asks for the round
    on Rita's deal by number. cw.received_document would have shown him the
    bytes — its read policy is `app_role() is not null` — so if this ever
    fails, the resolution stopped going through cw.negotiation_round."""
    where = recorded(db)
    got = redlines.fetch(db, OTHER_REQUESTER, {
        "negotiation": str(where["negotiation_id"]),
        "round": str(where["round_no"])})
    assert got.status == 403, getattr(got, "body", got)
    assert isinstance(got.body, dict), "a refusal handed back bytes"
    assert got.body.get("reason", "").strip()


def test_a_viewer_gets_a_sentence_and_no_bytes(seeded, db):
    """ADR-0008 gave the viewer no export path and this endpoint is not one."""
    where = recorded(db)
    got = redlines.fetch(db, VIEWER, {"negotiation": str(where["negotiation_id"]),
                                      "round": str(where["round_no"])})
    assert got.status >= 400, getattr(got, "body", got)
    assert isinstance(got.body, dict)
    assert got.body.get("reason", "").strip()


def test_the_auditor_takes_a_copy_and_the_chain_records_that_they_did(seeded, db):
    """NI-4 FINISHED (0065). This test was the opposite assertion for half a
    day: the auditor was refused, because handing a document out is appended to
    the chain first and cw.audit_event's general append policy (0007) names the
    requester and the two Legal roles and not them.

    That rule is about the integrity of the record an auditor verifies. It was
    refusing them a DOCUMENT, which is not what it is about — so 0065 opened
    one narrow door that writes this event and nothing else. The auditor can
    now record that they took a copy, and still cannot append anything else at
    all: the test below this one proves the second half."""
    where = recorded(db)
    got = redlines.fetch(db, AUDITOR, {"negotiation": str(where["negotiation_id"]),
                                       "round": str(where["round_no"])})
    assert got.status == 200, getattr(got, "body", got)
    assert got.body == MARKUP

    with db.as_person(LEAH, "legal_admin") as request:
        [event] = request.rows(
            "select actor, actor_role, event_type from cw.audit_event "
            "where event_type = 'received_document_read'")
    assert event["actor"] == AUDITOR.person
    assert event["actor_role"] == "auditor", (
        "the chain recorded the auditor's read without their role. Inside a "
        "SECURITY DEFINER the role must come from the connection's SET ROLE, "
        "not from cw.app_role(), which answers null there")


def test_the_auditor_still_cannot_append_anything_else(seeded, db):
    """THE HALF THAT MATTERS. The door 0065 opened is one event type wide. If
    the auditor ever holds a general INSERT on the chain, this fails — and the
    record they exist to verify has become a record they can write."""
    with pytest.raises(psycopg.Error):
        with db.as_person(AUDITOR.person, AUDITOR.role) as request:
            request.write(
                "insert into cw.audit_event "
                "  (actor, actor_role, actor_kind, event_type, subject) "
                "values (%s, 'auditor', 'human', 'invented_by_the_auditor', 'x')",
                (AUDITOR.person,))

    with pytest.raises(psycopg.Error):
        with db.as_person(AUDITOR.person, AUDITOR.role) as request:
            request.write(
                "select cw.audit('invented_by_the_auditor', 'x', '{}'::jsonb)")


def test_a_round_whose_document_lives_elsewhere_says_so(seeded, db):
    """POST /negotiations/rounds records a round for a document held
    somewhere this service does not keep bytes. That is a true state of the
    record — the fingerprint and the location are on the row — and it answers
    a sentence rather than an empty file."""
    with db.as_person(RITA, "requester") as request:
        row = request.rows(
            """insert into cw.negotiation_round
                 (negotiation_id, round_no, direction, document_sha256,
                  storage_uri, sent_on, actor)
               select negotiation_id, 1, 'received', %s,
                      'https://vault.example/theirs.docx', current_date, %s
               from cw.negotiation where agreement_id = 'AG-100'
               returning negotiation_id, round_no""", ("d" * 64, RITA))[0]

    got = redlines.fetch(db, OWNING_REQUESTER, {
        "negotiation": str(row["negotiation_id"]), "round": str(row["round_no"])})
    assert got.status == 409, getattr(got, "body", got)
    assert got.body.get("reason", "").strip()


def test_naming_no_round_is_a_400_not_a_crash(seeded, db):
    got = redlines.fetch(db, OWNING_REQUESTER, {})
    assert got.status == 400
    assert isinstance(got.body, dict)


def test_a_round_that_is_not_a_number_is_refused_unread(seeded, db):
    got = redlines.fetch(db, OWNING_REQUESTER,
                         {"negotiation": "1; drop table cw.agreement", "round": "1"})
    assert got.status == 400
    assert isinstance(got.body, dict)


def test_the_fetch_is_on_the_chain_before_the_bytes_leave(seeded, db):
    """A document leaving the system is an act, and an act nobody can see
    afterwards is the thing this product exists not to do."""
    where = recorded(db)
    got = redlines.fetch(db, OWNING_REQUESTER, {
        "negotiation": str(where["negotiation_id"]),
        "round": str(where["round_no"])})
    assert got.status == 200, getattr(got, "body", got)

    with db.as_person(LEAH, "legal_admin") as request:
        events = request.rows(
            "select event_type, actor, payload from cw.audit_event "
            "where event_type = 'received_document_read' order by seq")
    assert len(events) == 1, f"the read was not recorded once: {events}"
    assert events[0]["actor"] == RITA
    assert events[0]["payload"]["sha256"] == where["document_sha256"]


def test_a_refused_fetch_records_nothing(seeded, db):
    recorded(db)
    where = redlines.record(db, OWNING_REQUESTER, redline_upload(),
                            {"agreement": "AG-100"}).body
    redlines.fetch(db, OTHER_REQUESTER, {"negotiation": str(where["negotiation_id"]),
                                         "round": str(where["round_no"])})
    with db.as_person(LEAH, "legal_admin") as request:
        events = request.rows(
            "select seq from cw.audit_event "
            "where event_type = 'received_document_read'")
    assert events == [], "a refused fetch left a record of a read that never happened"


def test_the_route_reaches_the_fetch_with_its_selector(seeded, db):
    """End to end through App.handle, the GET /runs/contract shape: a
    Download comes back, not a Response, and server.py branches on the type."""
    app = App(db, email_channel=lambda *_: None)
    token = app.sign_in(RITA).body["token"]
    where = recorded(db)
    response = app.handle("GET", "/negotiations/paper", token=token,
                          query={"negotiation": str(where["negotiation_id"]),
                                 "round": str(where["round_no"])})
    assert response.status == 200, getattr(response, "body", response)
    assert response.body == MARKUP


# ── The name it comes back under (2026-08-08) ───────────────────────────────
#
# The counterparty chooses the filename and this system stores it unedited. Two
# rules used to decide whether it could leave again — `fetch`'s, which looked
# for a quote and a line break, and the transport's, which accepts only plain
# printable ASCII — and where they disagreed the answer was 500 "the service
# failed" for a document that had been accepted, stored and put on the chain.
#
# These tests are written against `app.transportable_filename`, deliberately,
# rather than against a list of characters spelled out here. A test carrying its
# own copy of the rule passes as soon as it agrees with a stale copy, which is
# the failure it is supposed to catch.


@pytest.mark.parametrize("filename", [
    "Contrat Été.docx",          # an accent — the ordinary case, and it was 500
    "合同.docx",                  # not Latin at all
    "MSA v2\\final.docx",        # a backslash escapes inside a quoted-string
    'quoted".docx',              # the injection the rule started out guarding
])
def test_a_name_the_transport_cannot_carry_comes_back_under_the_records_name(
        seeded, db, filename):
    """The document is handed over. It is the BYTES that were asked for."""
    answered = redlines.record(
        db, OWNING_REQUESTER,
        Upload(body=MARKUP, content_type=DOCX_TYPE, filename=filename),
        {"agreement": "AG-100"})
    assert answered.status == 200, answered.body

    got = redlines.fetch(db, OWNING_REQUESTER, {
        "negotiation": str(answered.body["negotiation_id"]),
        "round": str(answered.body["round_no"])})

    assert got.status == 200, getattr(got, "body", got)
    assert got.body == MARKUP, "the document did not come back"
    assert got.filename == (f"negotiation-{answered.body['negotiation_id']}"
                            f"-round-{answered.body['round_no']}")


def test_every_name_fetch_hands_on_is_one_the_transport_will_accept(seeded, db):
    """THE AGREEMENT BETWEEN THE TWO HALVES, asserted rather than assumed.

    The stored name is unedited caller input, so the set of names reaching
    `_send_download` is unbounded. This drives the awkward ones and holds the
    producer's output against the transport's own predicate — so the two cannot
    drift apart again without this failing.
    """
    from doorway.app import transportable_filename

    names = ["redline.docx", "Contrat Été.docx", "合同.docx", "a\tb.docx",
             "MSA v2\\final.docx", 'quoted".docx', " ", "réponse"]
    for filename in names:
        answered = redlines.record(
            db, OWNING_REQUESTER,
            Upload(body=MARKUP, content_type=DOCX_TYPE, filename=filename),
            {"agreement": "AG-100"})
        assert answered.status == 200, answered.body
        got = redlines.fetch(db, OWNING_REQUESTER, {
            "negotiation": str(answered.body["negotiation_id"]),
            "round": str(answered.body["round_no"])})
        assert got.status == 200, getattr(got, "body", got)
        assert transportable_filename(got.filename), (
            f"fetch handed the transport {got.filename!r}, which it refuses "
            f"with a 500 — the stored name was {filename!r}")
