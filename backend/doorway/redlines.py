"""Recording a received redline: the counterparty's document onto the record.

WHAT THIS IS (NC-09). A negotiation round with direction 'received' has been
recordable since NC-02 — POST /negotiations/rounds — but that entry takes the
document's SHA-256 and storage URI from the caller, because a Write carries a
record, never bytes. This module is the act for the document itself: the
counterparty's markup arrives as an upload, the bytes land in
cw.received_document (U15, 0047), and the round is appended in the same unit
of work, pointing at what was actually stored.

WHAT THE CALLER CANNOT INFLUENCE, which is the reason this module exists:

  · the SHA-256 — a GENERATED column in 0047: the schema's own arithmetic
    over the stored bytes. Not computed here, not accepted from anywhere.
  · the storage URI — it names the received-document row the bytes went
    into, so the round cannot claim a document other than the one recorded.
  · direction and run id — 'received' and null, structurally. A received
    redline did not come out of an assembly run, and pretending otherwise
    would break the provenance chain (0011:69-75, the schema's own words).
  · the round number — the next one. The record is append-only and gapless
    (cw.round_is_next); which number is next is a fact about the record, not
    a choice. A race between two recordings resolves in the database: one
    wins, the other gets the sequence guard's honest refusal.
  · the actor — bound from the connection by 0011's triggers, as everywhere.

sent_on IS RECORDED AS TODAY, deliberately. The transport carries bytes and a
deal name, nothing else, and inventing a field for a backdated exchange date
would be deciding how backdating works — recorded receipt is the honest
default until somebody asks for more.

NO PERMISSION CHECKS, as everywhere: the negotiation lookup runs under the
caller's own row-level rules, so a deal that is not theirs to see answers
nothing, and the two inserts are refused or admitted by 0047's and 0027's own
policies. The auditor reads everything and records nothing; a viewer holds no
negotiation grant at all. Both refusals arrive in the database's words.

READING ONE BACK OUT (NI-4, owner decision 2026-08-05). `fetch` below is the
other half: the counterparty's document, handed back to the people negotiating
the deal. Two things about it are load-bearing and neither is obvious.

  · IT RESOLVES THROUGH cw.negotiation_round, NOT cw.received_document.
    0047 gave the document store a `read_all` policy — any role with a role at
    all — because a stored document was, at the time, only ever reachable by
    somebody who already had the id. That is not a fence: it would hand one
    requester another requester's supplier paper. The round table's policy IS
    the fence Mike decided on ("everyone who can read the deal"), so the
    caller names a ROUND, the round is read under their own rules, and the
    document id comes from the row rather than from the caller.

  · THE AUDITOR IS INCLUDED, THROUGH A DOOR BUILT FOR IT. Handing a document
    out is recorded on the chain before the bytes leave — the same order
    documents.py uses, for the same reason. The chain's general append policy
    (0007) names the requester and the two Legal roles and pointedly not the
    auditor, who verifies the record and does not write to it. That rule was
    therefore refusing them a DOCUMENT, which is not what it is about.

    0065 opened cw.record_document_read(): one function, one event type, the
    actor's role taken from the connection inside it. The auditor can record
    that they took a copy and can append nothing else. Granting them INSERT on
    cw.audit_event outright was considered and rejected — that trades the
    integrity of the record they audit for one download.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def record(db: Database, caller: Caller, upload, query: dict) -> Answer:
    """Store one received redline and append it to its negotiation as a round."""
    agreement_id = (query or {}).get("agreement", "").strip()
    if not agreement_id:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "name the deal this redline belongs to "
                                      "(?agreement=...)"})
    if upload is None:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "this endpoint takes a document, not a record"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            # Under the caller's own read rules: a negotiation on somebody
            # else's deal answers nothing here, exactly as it does on screen.
            negotiations = request.rows(
                "select negotiation_id from cw.negotiation "
                "where agreement_id = %s", (agreement_id,))
            if not negotiations:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "no negotiation for that deal is visible to you; "
                              "a redline is recorded against an open "
                              "negotiation (POST /negotiations)"})
            negotiation_id = negotiations[0]["negotiation_id"]

            # The bytes land first; the schema computes the fingerprint. Both
            # inserts share one unit of work — a refusal on either unwinds the
            # other, so there is no stored document with no round and no round
            # pointing at nothing.
            stored = request.rows(
                "insert into cw.received_document "
                "  (agreement_id, bytes, content_type, filename) "
                "values (%s, %s, %s, %s) returning document_id, sha256",
                (agreement_id, upload.body, upload.content_type,
                 upload.filename))[0]

            round_row = request.rows(
                """insert into cw.negotiation_round
                     (negotiation_id, round_no, direction, document_sha256,
                      storage_uri, sent_on, actor, run_id)
                   select %s, coalesce(max(r.round_no), 0) + 1, 'received',
                          %s, %s, current_date, current_setting('cw.actor'),
                          null
                   from cw.negotiation_round r
                   where r.negotiation_id = %s
                   returning negotiation_id, round_no, direction, sent_on,
                             recorded_at""",
                (negotiation_id, stored["sha256"],
                 f"cw://received-document/{stored['document_id']}",
                 negotiation_id))[0]
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    return Answer(200, {
        "agreement_id": agreement_id,
        "negotiation_id": round_row["negotiation_id"],
        "round_no": round_row["round_no"],
        "direction": round_row["direction"],
        "document_id": stored["document_id"],
        "document_sha256": stored["sha256"],
        "storage_uri": f"cw://received-document/{stored['document_id']}",
        "filename": upload.filename,
        "sent_on": str(round_row["sent_on"]),
    })


# What `record` above wrote into the round's storage_uri. Read here rather than
# re-spelled: one format string, two users, and a mismatch between them would
# look exactly like a missing document.
STORED_AT = re.compile(r"^cw://received-document/(\d+)$")

# Bytes with no recorded type are handed back as bytes. Guessing from the
# filename would be the transport deciding what a document is, which is the
# thing this module's header refuses to do on the way in.
UNTYPED = "application/octet-stream"


def fetch(db: Database, caller: Caller, query: dict):
    """GET /negotiations/paper — the counterparty's document, back out.

    The caller names a ROUND, never a document. See the module header: the
    round's read policy is the fence, and the document id is taken off the row
    the database was willing to show, so there is nothing here for a caller to
    enumerate.
    """
    # IMPORTED HERE FOR documents.py's REASON, and it is the same cycle: app.py
    # routes to this module, so a module-level import of app.py would close it.
    from doorway.app import Download, Response

    selector = query or {}
    negotiation = str(selector.get("negotiation") or "").strip()
    wanted_round = str(selector.get("round") or "").strip()
    if not negotiation or not wanted_round:
        return Response(400, {
            "error": "refused", "kind": "rejected",
            "reason": "name the round to fetch (?negotiation=…&round=…)"})
    if not negotiation.isdigit() or not wanted_round.isdigit():
        return Response(400, {
            "error": "refused", "kind": "rejected",
            "reason": "a negotiation and a round are both whole numbers"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            # Under the caller's own row rules. A round on somebody else's deal
            # answers nothing, and "no such round" and "not yours" are one
            # sentence here on purpose — telling them apart would confirm the
            # existence of a deal the caller may not see.
            rounds = request.rows(
                """select negotiation_id, round_no, direction, storage_uri,
                          document_sha256
                   from cw.negotiation_round
                   where negotiation_id = %s and round_no = %s""",
                (int(negotiation), int(wanted_round)))
            if not rounds:
                return Response(403, {
                    "error": "refused", "kind": "not_permitted",
                    "reason": "no round by that number is yours to read"})
            round_row = rounds[0]

            stored = STORED_AT.match(str(round_row["storage_uri"] or ""))
            if not stored:
                # A round recorded through POST /negotiations/rounds names a
                # document held somewhere this service does not keep bytes.
                # That is a true state of the record, not a fault, and it says
                # so rather than answering an empty file.
                return Response(409, {
                    "error": "refused", "kind": "refused_on_merits",
                    "reason": "that round's document is not stored here; the "
                              "record carries its fingerprint and where it "
                              "lives"})

            document = request.rows(
                """select document_id, bytes, content_type, filename, sha256
                   from cw.received_document where document_id = %s""",
                (int(stored.group(1)),))
            if not document:
                return Response(409, {
                    "error": "refused", "kind": "refused_on_merits",
                    "reason": "that round names a document the store does not "
                              "hold"})
            found = document[0]

            # The round is the record of what was exchanged; the document store
            # computes its own fingerprint from the bytes (0047, a GENERATED
            # column). If those two disagree, the bytes are not the ones the
            # round attests to, and handing them over under that round's name
            # would be this service vouching for something it just found false.
            if found["sha256"] != round_row["document_sha256"]:
                return Response(409, {
                    "error": "refused", "kind": "refused_on_merits",
                    "reason": (f"this document does not match its round: the "
                               f"round records {round_row['document_sha256']}, "
                               f"the stored bytes hash to {found['sha256']}")})

            # RECORDED BEFORE THE BYTES LEAVE, inside the caller's own
            # transaction — documents.py's order, and the reason a download is
            # evidence rather than a convenience.
            #
            # THROUGH cw.record_document_read AND NOT cw.audit (0065). The
            # general append door is closed to the auditor on purpose: they
            # verify the chain and do not write to it. But that rule was
            # refusing them a DOCUMENT, which is not what it is about — so
            # 0065 opened one narrow door that writes this event and nothing
            # else, and the four roles that may read a round hold it. The
            # actor's role is taken from the connection inside the function,
            # not passed from here; there is no argument for it.
            request.write(
                "select cw.record_document_read(%(negotiation)s, %(round)s,"
                " %(document)s, %(sha256)s, %(byte_size)s, %(direction)s)",
                {"negotiation": round_row["negotiation_id"],
                 "round": round_row["round_no"],
                 "document": found["document_id"],
                 "sha256": found["sha256"],
                 "byte_size": len(found["bytes"]),
                 "direction": round_row["direction"]})
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Response(refused.status, refused.as_body())

    # The name the counterparty's file arrived under, unedited — `record` did
    # not rewrite it on the way in and this does not rewrite it on the way out.
    # A round with no recorded name gets one built from the record, which is a
    # fact rather than a guess.
    name = str(found["filename"] or "").strip()
    if not name or '"' in name or "\n" in name or "\r" in name:
        name = (f"negotiation-{round_row['negotiation_id']}"
                f"-round-{round_row['round_no']}")
    return Download(200, bytes(found["bytes"]),
                    str(found["content_type"] or UNTYPED), name)
