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
"""

from __future__ import annotations

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
