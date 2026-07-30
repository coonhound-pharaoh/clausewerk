"""Third-party paper ingestion: the vendor's document, decomposed and quarantined.

WHAT THIS IS (RP-05, built to NC-18's shape). Clausewerk assumes we issue the
paper. When a vendor insists on theirs, nothing deterministic can assemble it —
but the review machinery can still MEASURE it. This module takes an uploaded
.docx, splits it into paragraphs with the same hardened reader the redline
parser uses, classifies each paragraph against the library's categories, and
files every classified paragraph as a review ticket in the queue that already
exists for exactly this: reason `supplier-paper`, badge `VENDOR LANGUAGE`,
text quarantined in `proposed_text` where no selectable view can reach it.

What comes back is the deviation report: which categories the vendor's paper
appears to address, and which always-include categories it appears to MISS.
"Appears" is doing honest work in that sentence — see the classifier note.

THE CLASSIFIER IS DETERMINISTIC, AND SAYS SO. ADR-0005: every inference has a
deterministic substitute, and here the substitute ships first. A paragraph is
matched to a category by that category's own words (its label and key), which
is crude, cheap, and explainable in one sentence to a reviewer wondering why a
ticket exists. A model can be seated in front of this later, exactly as the
manifest classifier is fronted; whichever classifier runs, its output lands in
the same quarantine and changes nothing downstream — the trust boundary does
not move for a smarter guesser.

THE DOCUMENT IS KEPT, since U15 (2026-07-29, migration 0047). This module
originally parsed and released the bytes, because where document bytes live
was an open owner decision (NC-07) and answering it on the side would have
settled it quietly. The owner has now answered — in the database, one
gigabyte — so the received bytes land in cw.received_document inside the
same unit of work as the tickets, and the report carries the document_id
alongside the SHA-256. A refused ingest stores nothing: a receipt for a
rejected delivery would be a record of something that did not happen.

WHAT THIS DELIBERATELY DOES NOT DO:

  · Judge severity. Whether a vendor clause falls below the company's floor is
    the reviewer's call, made at the desk with the ladder in front of them —
    a keyword count claiming to measure risk would be false confidence.
  · Touch the library. A supplier ticket is unreachable from any selectable
    view (NC-18's guarantee, enforced in the schema, tested there).
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify
from engine import docx

# One ingest files at most this many tickets. A thousand-paragraph upload is
# not a review queue, it is a denial of service on the reviewers; refused with
# the number, so the caller knows it is a limit and not a bug.
MAX_UNITS = 200

# A word must be this long to count as a signal. Shorter words ("of", "and",
# "data" would survive at 4) are how every paragraph matches every category.
MIN_TERM = 4


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def _terms_of(key: str, label: str) -> frozenset[str]:
    """The category's own words, lowercased: its key and its label's words."""
    words = re.findall(r"[a-z]{%d,}" % MIN_TERM, label.lower())
    return frozenset(words) | {key.lower()}


def _classify(paragraph: str, vocabulary: dict[str, frozenset[str]]) -> str | None:
    """The category whose words appear most in the paragraph, or None.

    Ties break by category key, alphabetically — arbitrary, but STABLE, so the
    same document always files the same tickets and a re-ingest is comparable
    with the first.
    """
    text = paragraph.lower()
    best_key, best_hits = None, 0
    for key in sorted(vocabulary):
        hits = sum(1 for term in vocabulary[key] if term in text)
        if hits > best_hits:
            best_key, best_hits = key, hits
    return best_key


def ingest(db: Database, caller: Caller, upload, query: dict) -> Answer:
    """Decompose one uploaded vendor document into quarantined review tickets."""
    agreement_id = (query or {}).get("agreement", "").strip()
    if not agreement_id:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "name the deal this paper belongs to "
                                      "(?agreement=...)"})
    if upload is None:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "this endpoint takes a document, not a record"})

    try:
        paragraphs = [p for p in docx.paragraphs(upload.body) if p.strip()]
    except docx.NotADocx as not_docx:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": f"that is not a readable .docx: {not_docx}"})

    sha = hashlib.sha256(upload.body).hexdigest()

    try:
        with db.as_person(caller.person, caller.role) as request:
            categories = request.rows("select key, label from cw.category")
            if not categories:
                return Answer(409, {
                    "error": "refused", "kind": "changed_nothing",
                    "reason": "the library has no categories; there is nothing "
                              "to classify against"})

            vocabulary = {c["key"]: _terms_of(c["key"], c["label"])
                          for c in categories}

            classified: list[tuple[str, str]] = []   # (category_key, paragraph)
            unclassified = 0
            for paragraph in paragraphs:
                key = _classify(paragraph, vocabulary)
                if key is None:
                    unclassified += 1
                else:
                    classified.append((key, paragraph))

            if len(classified) > MAX_UNITS:
                return Answer(413, {
                    "error": "refused", "kind": "rejected",
                    "reason": f"{len(classified)} classified paragraphs is more "
                              f"than one ingest may file ({MAX_UNITS}); split "
                              "the document"})

            # The paper itself is kept, not released — U15 (0047). It lands
            # beside the tickets in one unit of work, so a refusal anywhere
            # in this block unwinds the receipt too.
            stored = request.rows(
                "insert into cw.received_document "
                "  (agreement_id, bytes, content_type, filename) "
                "values (%s, %s, %s, %s) returning document_id",
                (agreement_id, upload.body, upload.content_type,
                 upload.filename))[0]

            tickets = []
            for key, paragraph in classified:
                row = request.rows(
                    """insert into cw.review_ticket
                         (agreement_id, category_key, severity, reason_code,
                          provenance_badge, proposed_text)
                       values (%s, %s, 'Standard', 'supplier-paper',
                               'VENDOR LANGUAGE', %s)
                       returning ticket_id, category_key""",
                    (agreement_id, key, paragraph))
                tickets.append(row[0])

            # The gap half of the report: always-include categories the paper
            # did not appear to address. A gap is reported as a gap — what to
            # do about it belongs to the people, not the product.
            addressed = {key for key, _ in classified}
            missing = request.rows(
                """select distinct c.category_key, cat.label
                   from cw.clause c join cw.category cat on cat.key = c.category_key
                   where c.always_include order by c.category_key""")
            missing_baseline = [m for m in missing
                                if m["category_key"] not in addressed]
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    return Answer(200, {
        "agreement_id": agreement_id,
        "document_id": stored["document_id"],
        "document_sha256": sha,
        "filename": upload.filename,
        "paragraphs": len(paragraphs),
        "tickets_opened": len(tickets),
        "unclassified_paragraphs": unclassified,
        "tickets": tickets,
        "missing_baseline_categories": missing_baseline,
        "classifier": "deterministic-category-words",
    })
