"""Third-party paper ingestion (RP-05): decomposed, classified, quarantined.

What these tests hold the ingest to:

  · A classified paragraph becomes a review ticket with reason
    `supplier-paper`, badge `VENDOR LANGUAGE`, state pending — and the text
    sits in `proposed_text`, the quarantine column no selectable view reads.
  · The deviation report is honest about both halves: what the paper appears
    to address, and which always-include categories it appears to MISS. A gap
    is reported as a gap, never as a failure.
  · The classifier is deterministic: the same document files the same tickets.
  · A caller the ticket policies refuse is refused here too — the database
    decides, this module reports.
  · Malformed input is the caller's mistake (400), never a service failure.

Deliberately NOT tested: which paragraph lands in which category for any real
wording. The category vocabulary comes from labels, and labels are content —
placeholder by standing rule. The fixture uses categories whose labels it
controls, so these tests pin behaviour, not words.

Requires the compose PostgreSQL, like every doorway suite:

    docker compose up -d
    python -m pytest doorway/test_paper.py
"""

from __future__ import annotations

import zipfile
from io import BytesIO

import psycopg
import pytest

from doorway import paper
from doorway.app import DOCX_TYPE, App, Upload
from doorway.db import Database
from doorway.identity import Caller

ADMIN = "admin@clausewerk"
LEAH = "leah@clausewerk"

LEGAL = Caller(person=LEAH, role="legal_admin")

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" '
    'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.'
    'openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')

RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/'
    'relationships"><Relationship Id="rId1" Type="http://schemas.openxml'
    'formats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/></Relationships>')


def vendor_docx(paragraphs: list[str]) -> bytes:
    """A minimal but complete vendor .docx: one run per paragraph."""
    body = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{p}</w:t></w:r></w:p>'
        for p in paragraphs)
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>{body}</w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        # ZipInfo, not a bare name: writestr(name, …) stamps the wall clock
        # into the member header, so two identical documents built in
        # different clock seconds hash differently — and the determinism
        # test below compares exactly those hashes. ZipInfo pins the stamp.
        z.writestr(zipfile.ZipInfo("[Content_Types].xml"), CONTENT_TYPES)
        z.writestr(zipfile.ZipInfo("_rels/.rels"), RELS)
        z.writestr(zipfile.ZipInfo("word/document.xml"), document)
    return buf.getvalue()


def upload_of(paragraphs: list[str]) -> Upload:
    return Upload(body=vendor_docx(paragraphs), content_type=DOCX_TYPE,
                  filename="vendor-msa.docx")


# The fixture's paragraphs are synthetic and name their category's label words
# on purpose — the classifier is category-words-in-paragraph, and these tests
# pin the MECHANISM, not any real clause wording.
ABOUT_DATA = "Zorblefax handling: all zorblefax records stay with Vendor."
ABOUT_NOTHING = "The parties met for lunch and enjoyed it."


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def seeded(db: Database, owner_url: str):
    """Two categories — one with an always-include clause the paper misses."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            ("owner@clausewerk", ADMIN, "The Administrator",
             LEAH, "Leah Legal", "Legal"))
        owner.execute(
            "insert into cw.category (key,label,short) values "
            "('data','Zorblefax Handling','ZH'), "
            "('ip','Quuxwork Ownership','QO')")
        owner.execute(
            "insert into cw.clause (clause_id,category_key,severity,always_include) "
            "values ('QO-S-001','ip','Standard',true)")
        owner.execute(
            "insert into cw.clause_version "
            "  (clause_id,version,title,body,approved_on,expires_on) "
            "values ('QO-S-001',1,'Quuxwork','All quuxwork belongs to Customer.',"
            "        '2025-01-01','2030-01-01')")
        owner.execute(
            "insert into cw.agreement (agreement_id,counterparty,requester) "
            "values ('AG-100','Northwind','rita@clausewerk')")
    return db


def tickets(db: Database) -> list[dict]:
    with db.as_person(LEAH, "legal_admin") as request:
        return request.rows(
            "select agreement_id, category_key, reason_code, provenance_badge, "
            "       proposed_text, state from cw.review_ticket order by ticket_id")


def test_a_classified_paragraph_becomes_a_quarantined_ticket(seeded, db):
    answered = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA, ABOUT_NOTHING]),
                            {"agreement": "AG-100"})
    assert answered.status == 200, answered.body
    assert answered.body["tickets_opened"] == 1
    assert answered.body["unclassified_paragraphs"] == 1

    filed = tickets(db)
    assert len(filed) == 1
    t = filed[0]
    assert t["agreement_id"] == "AG-100"
    assert t["category_key"] == "data"
    assert t["reason_code"] == "supplier-paper"
    assert t["provenance_badge"] == "VENDOR LANGUAGE"
    assert t["state"] == "pending"
    assert t["proposed_text"] == ABOUT_DATA


def test_the_report_names_the_missing_baseline_category(seeded, db):
    answered = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA]),
                            {"agreement": "AG-100"})
    missing = answered.body["missing_baseline_categories"]
    assert [m["category_key"] for m in missing] == ["ip"], (
        "the paper never addressed Quuxwork Ownership, whose clause is "
        "always-include — that gap is the deviation report's other half")


def test_addressing_the_baseline_clears_it_from_the_gap(seeded, db):
    answered = paper.ingest(
        db, LEGAL,
        upload_of([ABOUT_DATA, "All quuxwork ownership questions are deferred."]),
        {"agreement": "AG-100"})
    assert answered.body["missing_baseline_categories"] == []
    assert answered.body["tickets_opened"] == 2


def test_the_same_document_files_the_same_tickets(seeded, db):
    first = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA]), {"agreement": "AG-100"})
    second = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA]), {"agreement": "AG-100"})
    assert first.body["document_sha256"] == second.body["document_sha256"]
    assert [t["category_key"] for t in tickets(db)] == ["data", "data"], (
        "determinism: re-ingesting files the same classification, comparably")


def test_every_unit_is_anchored_to_its_paragraph_in_the_stored_bytes(seeded, db):
    """NC-18: a quarantined unit answers WHERE it came from — paragraph N of
    the stored document — in the same unit of work as the ticket."""
    answered = paper.ingest(db, LEGAL, upload_of([ABOUT_NOTHING, ABOUT_DATA]),
                            {"agreement": "AG-100"})
    assert answered.status == 200, answered.body
    [ticket] = answered.body["tickets"]
    assert ticket["paragraph_no"] == 1, (
        "the classified paragraph sits second in the parsed document; the "
        "report must say so")
    with db.as_person(LEAH, "legal_admin") as request:
        [unit] = request.rows(
            "select u.paragraph_no, u.document_id from cw.supplier_unit u "
            "where u.ticket_id = %s", (ticket["ticket_id"],))
    assert unit["paragraph_no"] == 1
    assert unit["document_id"] == answered.body["document_id"], (
        "the anchor names the document this very ingest stored")


def test_the_report_carries_references_and_the_hash_not_a_judgment(seeded, db):
    answered = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA]),
                            {"agreement": "AG-100"})
    assert len(answered.body["document_sha256"]) == 64
    assert answered.body["classifier"] == "deterministic-category-words"
    assert "severity" not in answered.body, (
        "whether vendor wording falls below the floor is the reviewer's call; "
        "a keyword count claiming to measure risk would be false confidence")


def test_the_ingested_document_is_stored(seeded, db):
    """The paper is kept, not released — U15 (0047)."""
    answered = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA]),
                            {"agreement": "AG-100"})
    assert answered.status == 200, answered.body
    with db.as_person(LEAH, "legal_admin") as request:
        rows = request.rows(
            "select agreement_id, sha256, filename "
            "from cw.received_document where document_id = %s",
            (answered.body["document_id"],))
    assert rows, "the vendor's paper is kept, not released (U15)"
    assert rows[0]["agreement_id"] == "AG-100"
    assert rows[0]["sha256"] == answered.body["document_sha256"], (
        "the database's fingerprint of what it stored is the report's "
        "fingerprint of what arrived — the same bytes, provably")
    assert rows[0]["filename"] == "vendor-msa.docx"


def test_a_refused_ingest_stores_no_document(seeded, db):
    """A receipt for a rejected delivery is a record of something that did
    not happen. The auditor is refused; nothing lands."""
    auditor = Caller(person="aud@clausewerk", role="auditor")
    answered = paper.ingest(db, auditor, upload_of([ABOUT_DATA]),
                            {"agreement": "AG-100"})
    assert answered.refused
    with db.as_person(LEAH, "legal_admin") as request:
        assert request.rows("select 1 from cw.received_document") == []


def test_the_ceiling_here_matches_the_recorded_decision(seeded, db):
    """U15's number lives twice — the front door constant and the governance
    row — and this assertion is what keeps them the same number."""
    from doorway import server
    with db.as_person(LEAH, "legal_admin") as request:
        rows = request.rows("select value from cw.governance_setting "
                            "where key = 'max_document_bytes'")
    assert rows, "0047 put the ceiling on the record"
    assert int(rows[0]["value"]) == server.MAX_DOCUMENT_BYTES


def test_no_agreement_named_is_a_400_not_a_crash(seeded, db):
    answered = paper.ingest(db, LEGAL, upload_of([ABOUT_DATA]), {})
    assert answered.status == 400
    assert "agreement" in answered.body["reason"]


def test_not_a_docx_is_the_callers_mistake(seeded, db):
    junk = Upload(body=b"this is not a zip archive", content_type=DOCX_TYPE,
                  filename="junk.docx")
    answered = paper.ingest(db, LEGAL, junk, {"agreement": "AG-100"})
    assert answered.status == 400
    assert "docx" in answered.body["reason"]


def test_a_caller_the_ticket_policies_refuse_is_refused_here(seeded, db):
    """The database decides who may file supplier paper; this module reports.
    An auditor reads everything and writes nothing — including this."""
    auditor = Caller(person="aud@clausewerk", role="auditor")
    answered = paper.ingest(db, auditor, upload_of([ABOUT_DATA]),
                            {"agreement": "AG-100"})
    assert answered.refused
    assert not tickets(db), "a refused ingest files nothing"


def test_the_route_reaches_the_module_with_the_upload(seeded, db):
    """End to end through App.handle: the first endpoint to consume an upload."""
    app = App(db, email_channel=lambda *_: None)
    token = app.sign_in(LEAH).body["token"]
    response = app.handle("POST", "/paper/ingest", token=token,
                          query={"agreement": "AG-100"},
                          upload=upload_of([ABOUT_DATA]))
    assert response.status == 200, response.body
    assert response.body["tickets_opened"] == 1
