"""Document service tests.

The central one is `test_the_document_contains_zero_authored_characters`. The
system's headline claim is a character count; this makes it a machine-checked
property of the emitted file rather than a statement in a footer.
"""

import time
import tracemalloc
import zipfile
from datetime import date
from io import BytesIO

import pytest

from engine.docx import (
    CONTENT_TYPES,
    DOC_RELS,
    MAX_ELEMENTS,
    RELS,
    STYLES,
    W,
    NotADocx,
    UnprintableText,
    ai_originated_characters,
    authored_characters,
    build_docx,
    document_text,
    paragraphs,
    parse_redlines,
    provenance_counts,
    sha256_of,
)
from engine.model import AI_DRAFTED, HIGH, STANDARD, Clause, Manifest, Risk
from engine.resolution import resolve
from engine.snapshot import Snapshot


def clause(cid, cat, sev=HIGH, body=None, **kw):
    return Clause(clause_id=cid, version=1, category=cat, severity=sev,
                  title=f"{cid} title", body=body or f"Body of {cid}.", **kw)


LIBRARY = [
    clause("DP-H-014", "Data Privacy", HIGH,
           "Controller agrees to process Personal Data strictly in accordance with "
           "Articles 28-32 GDPR, and shall notify Controller within 24 hours of any "
           "Personal Data Breach."),
    clause("LC-S-009", "Liability Cap", STANDARD,
           "Liability is capped at the fees paid in the preceding twelve months."),
    clause("DF-B-001", "Definitions", STANDARD,
           "Capitalised terms have the meanings given in this Agreement.",
           always_include=True, framework_section="1.1"),
]

MANIFEST = Manifest(vendor="Northwind Analytics", value="$240K", source="llm",
                    risks=(Risk("Data Privacy", HIGH, "EU PII"),
                           Risk("Liability Cap", STANDARD, "moderate value"),
                           Risk("Insurance", HIGH, "nothing in the library")))


@pytest.fixture
def built():
    snap = Snapshot.build(LIBRARY)
    res = resolve(MANIFEST, snap)
    return build_docx(MANIFEST, res, today=date(2026, 8, 1)), res


# ── It is a real .docx ─────────────────────────────────────────────────────


def test_the_package_has_the_parts_word_requires(built):
    data, _ = built
    with zipfile.ZipFile(BytesIO(data)) as z:
        names = set(z.namelist())
    assert names == {"[Content_Types].xml", "_rels/.rels", "word/document.xml",
                     "word/styles.xml", "word/_rels/document.xml.rels"}


def test_the_document_xml_parses(built):
    data, _ = built
    assert paragraphs(data), "a document with no paragraphs is not a contract"


# ── The invariant ──────────────────────────────────────────────────────────


def test_clause_text_appears_verbatim(built):
    """Verbatim means verbatim — not merely 'contains'.

    This asserted `d.selected.body in text` and nothing else, which is a
    containment test wearing a fidelity test's name (WP-00, finding E8). The
    approved wording being PRESENT says nothing about what was printed around
    it: appending "…subject to Vendor's standard terms." to a clause leaves the
    original substring intact and this assertion green. That was not
    hypothetical — a truncate-and-append mutation escaped this test entirely and
    was caught downstream by the character counter, which is the wrong
    instrument noticing the right problem.

    So the paragraph carrying the clause is now located and compared WHOLE. A
    clause body must occupy its own paragraph exactly: no prefix, no suffix, no
    quiet editorial around the edges.
    """
    data, res = built
    text = document_text(data)
    paras = paragraphs(data)
    for d in res.decisions:
        if not d.selected:
            continue
        body = d.selected.body
        assert body in text, f"{d.selected.ref} is missing from the document"
        # The paragraph that carries it must BE it, not merely contain it.
        carriers = [p for p in paras if body in p]
        assert carriers, f"{d.selected.ref} is not carried by any single paragraph"
        assert any(p == body for p in carriers), (
            f"{d.selected.ref} was altered in the document: the paragraph "
            f"carrying it is {carriers[0]!r}, not the approved wording alone"
        )


def test_the_verbatim_check_notices_text_welded_onto_a_clause(built):
    """The control for the test above, and the reason it was rewritten.

    A document is built in which one clause has extra words appended — exactly
    the corruption the old containment assertion could not see. The old check is
    run against it and PASSES (proving the weakness was real); the new one is
    run against it and FAILS (proving the repair works). Without this, "we fixed
    the weak test" would itself be an unchecked claim.
    """
    _, res = built
    approved = next(d.selected for d in res.decisions if d.selected)

    doctored_library = [
        Clause(clause_id=c.clause_id, version=c.version, category=c.category,
               severity=c.severity, title=c.title,
               body=(c.body + " Subject to Vendor's standard terms."
                     if c.clause_id == approved.clause_id else c.body),
               always_include=c.always_include,
               framework_section=c.framework_section)
        for c in LIBRARY
    ]
    doctored = build_docx(MANIFEST, resolve(MANIFEST, Snapshot.build(doctored_library)),
                          today=date(2026, 8, 1))
    text = document_text(doctored)
    paras = paragraphs(doctored)

    # THE OLD ASSERTION. The approved body is still a substring, so the test as
    # it stood would have reported this corrupted document as verbatim.
    assert approved.body in text, "the weakness under test is that containment still holds"

    # THE NEW ASSERTION. No paragraph IS the approved body — one merely contains it.
    carriers = [p for p in paras if approved.body in p]
    assert carriers, "the doctored clause is still somewhere in the document"
    assert not any(p == approved.body for p in carriers), (
        "the whole-paragraph comparison must reject a clause with text welded on"
    )


def test_the_document_contains_zero_authored_characters(built):
    """The headline claim, counted.

    Anything in the document that is neither approved clause text nor one of the
    declared structural strings is authored contract language, and there must be
    none of it. If this list ever needs a new entry, that is the moment to ask
    what just got written."""
    data, res = built
    bodies = [d.selected.body for d in res.decisions if d.selected]
    section = 0
    structural = ["MASTER SERVICES AGREEMENT", "Northwind Analytics — $240K",
                  "Dated: 2026-08-01"]
    for d in res.decisions:
        if d.selected:
            section += 1
            structural.append(f"{section}. {d.risk.category.upper()}")
            structural.append(f"[{d.selected.ref}]")
    structural.append(
        f"Clauses: {section} · Library snapshot: {res.snapshot_id[:12]}")

    assert authored_characters(data, bodies, structural) == 0


def test_the_counter_actually_counts(built):
    """Control: if the allowlist is incomplete, stray characters are reported.
    Without this the test above could pass because the counter always returns 0."""
    data, res = built
    bodies = [d.selected.body for d in res.decisions if d.selected]
    assert authored_characters(data, bodies, []) > 0


def test_an_unresolved_risk_is_omitted_not_invented(built):
    """No clause exists for Insurance. The document must simply not contain a
    section for it — never a plausible-looking substitute.

    The assertion alone is negative, and a negative assertion passes on an empty
    document: delete the whole builder and "INSURANCE not in text" is still true
    (WP-24, finding E8). So the positive half is asserted in the same breath —
    the risks that COULD be resolved are present, and the document is a real
    document. Only then does the absence of Insurance mean anything.
    """
    data, res = built
    text = document_text(data)
    up = text.upper()

    # POSITIVE CONTROL: the document exists and did its job for the other risks.
    resolved = [d for d in res.decisions if d.selected]
    assert resolved, "the fixture must resolve something, or the absence below is vacuous"
    for d in resolved:
        assert d.risk.category.upper() in up, (
            f"{d.risk.category} resolved, so it must have a section")
        assert d.selected.body in text
    assert len(paragraphs(data)) > len(resolved), "a real document, not a stub"

    # THE PROPERTY: and Insurance, which resolved to nothing, is simply absent.
    assert any(d.risk.category == "Insurance" and d.selected is None
               for d in res.decisions), "the fixture must contain an unresolvable risk"
    assert "INSURANCE" not in up


def test_baseline_clauses_reach_the_document(built):
    data, _ = built
    assert "Capitalised terms have the meanings given" in document_text(data)


# ── Determinism ────────────────────────────────────────────────────────────


def test_the_same_inputs_produce_byte_identical_documents():
    snap = Snapshot.build(LIBRARY)
    res = resolve(MANIFEST, snap)
    a = build_docx(MANIFEST, res, today=date(2026, 8, 1))
    b = build_docx(MANIFEST, res, today=date(2026, 8, 1))
    assert sha256_of(a) == sha256_of(b), (
        "a stored SHA-256 is meaningless if assembly is not reproducible")


def test_the_archive_embeds_no_wall_clock(built):
    """The test above builds twice in the same second, so it would still pass
    with a live timestamp — by luck. This asserts the actual property: a zip
    entry records a modification time, and if that came from the clock, the
    same contract would hash differently every minute and the stored SHA-256
    would be worthless."""
    data, _ = built
    with zipfile.ZipFile(BytesIO(data)) as z:
        stamps = {i.date_time for i in z.infolist()}
    assert stamps == {(1980, 1, 1, 0, 0, 0)}, f"got {stamps}"


def test_different_clauses_produce_a_different_hash():
    snap = Snapshot.build(LIBRARY)
    res = resolve(MANIFEST, snap)
    a = build_docx(MANIFEST, res, today=date(2026, 8, 1))
    trimmed = Snapshot.build([c for c in LIBRARY if c.clause_id != "LC-S-009"])
    b = build_docx(MANIFEST, resolve(MANIFEST, trimmed), today=date(2026, 8, 1))
    assert sha256_of(a) != sha256_of(b)


# ── Redline parsing (ADR-0007) ─────────────────────────────────────────────


def redlined_docx(paragraphs_spec) -> bytes:
    """Build a .docx with tracked changes, the way vendor counsel's Word does."""
    body = []
    for spec in paragraphs_spec:
        runs = []
        for kind, text in spec:
            if kind == "keep":
                runs.append(f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r>')
            elif kind == "ins":
                runs.append(f'<w:ins w:id="1" w:author="J. Halvorsen" '
                            f'w:date="2026-04-18T10:00:00Z">'
                            f'<w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:ins>')
            elif kind == "del":
                runs.append(f'<w:del w:id="2" w:author="J. Halvorsen" '
                            f'w:date="2026-04-18T10:00:00Z">'
                            f'<w:r><w:delText xml:space="preserve">{text}</w:delText>'
                            f'</w:r></w:del>')
        body.append(f"<w:p>{''.join(runs)}</w:p>")

    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>{"".join(body)}'
                '</w:body></w:document>')
    buf = BytesIO()
    # A complete package, because counsel's Word produces one. An earlier
    # version of this fixture wrote only word/document.xml — enough for our own
    # parser, which is lenient, but not a realistic vendor file.
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
    return buf.getvalue()


FOUR_CHANGES = [
    [("keep", "This Agreement is governed by the laws of New York.")],
    [("keep", "Vendor shall notify Customer within "), ("del", "24"), ("ins", "72"),
     ("keep", " hours of any Personal Data Breach.")],
    [("keep", "Liability is capped at "), ("del", "the fees paid"),
     ("ins", "USD 50,000"), ("keep", ".")],
    [("keep", "Notices shall be sent to the addresses below.")],
    [("keep", "Either party may terminate on "), ("del", "90"), ("ins", "30"),
     ("keep", " days notice.")],
    [("ins", "Vendor may subcontract without restriction.")],
]


def test_one_redline_per_changed_paragraph():
    """Four changed paragraphs become four independently adjudicated points —
    unchanged paragraphs are context, not redlines (ADR-0007)."""
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    assert len(rls) == 4
    assert [r.index for r in rls] == [1, 2, 4, 5]


def test_segments_preserve_document_order():
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    kinds = [s.kind for s in rls[0].segments]
    assert kinds == ["keep", "del", "ins", "keep"], (
        "interleaving must survive, or the reviewer cannot see what changed where")


def test_accepted_text_is_keep_plus_ins_with_deletions_dropped():
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    assert rls[0].accepted_text == (
        "Vendor shall notify Customer within 72 hours of any Personal Data Breach.")


def test_original_text_is_keep_plus_del():
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    assert rls[0].original_text == (
        "Vendor shall notify Customer within 24 hours of any Personal Data Breach.")


def test_change_counts_are_reported():
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    assert (rls[0].ins_count, rls[0].del_count) == (1, 1)
    assert (rls[3].ins_count, rls[3].del_count) == (1, 0), "a pure insertion"


def test_author_and_date_come_from_the_tracked_change():
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    assert rls[0].author == "J. Halvorsen"
    assert rls[0].changed_on.startswith("2026-04-18")


def test_surrounding_context_is_captured():
    rls = parse_redlines(redlined_docx(FOUR_CHANGES))
    assert "New York" in rls[0].context_before
    assert "Liability is capped" in rls[0].context_after


def test_a_document_with_no_tracked_changes_yields_no_redlines():
    clean = [[("keep", "This Agreement is governed by the laws of New York.")]]
    assert parse_redlines(redlined_docx(clean)) == ()


def test_deleted_text_is_not_part_of_the_document():
    """A deletion is a proposal to remove, not content. It must not appear in
    the readable text of the paragraph."""
    data = redlined_docx(FOUR_CHANGES)
    assert "24" not in paragraphs(data)[1]
    assert "72" in paragraphs(data)[1]


# ── Real-world Word containers (E5) ────────────────────────────────────────
# HONEST LIMITATION. These fixtures are hand-built OOXML, not files saved by
# Word. Microsoft Word is not available in this environment, so "generated from
# actual Word output" is not a claim made here. The markup is written to the
# ECMA-376 shapes for w:hyperlink, w:sdt/w:sdtContent, w:smartTag, w:moveFrom
# and w:moveTo, and it exercises the exact structural difference that broke the
# parser — a run that is not a direct child of w:p. What it cannot prove is that
# Word emits precisely this and nothing else. Treat it as a faithful substitute,
# not as verified Word fidelity.


def containered_docx(inner: str) -> bytes:
    """One paragraph whose runs are wrapped in whatever container is passed in."""
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>'
                f'<w:p><w:r><w:t xml:space="preserve">Governing law: </w:t></w:r>'
                f'{inner}'
                f'<w:r><w:t xml:space="preserve">.</w:t></w:r></w:p>'
                '</w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
    return buf.getvalue()


TRACKED_RUNS = (
    '<w:del w:id="9" w:author="J. Halvorsen" w:date="2026-04-18T10:00:00Z">'
    '<w:r><w:delText xml:space="preserve">New York</w:delText></w:r></w:del>'
    '<w:ins w:id="10" w:author="J. Halvorsen" w:date="2026-04-18T10:00:00Z">'
    '<w:r><w:t xml:space="preserve">Delaware</w:t></w:r></w:ins>'
)

CONTAINERS = {
    "hyperlink": f'<w:hyperlink r:id="rId7" xmlns:r="urn:x">{TRACKED_RUNS}</w:hyperlink>',
    "content control": (
        '<w:sdt><w:sdtPr><w:alias w:val="Jurisdiction"/></w:sdtPr>'
        f'<w:sdtContent>{TRACKED_RUNS}</w:sdtContent></w:sdt>'
    ),
    "smart tag": f'<w:smartTag w:element="place">{TRACKED_RUNS}</w:smartTag>',
}


@pytest.mark.parametrize("container", sorted(CONTAINERS))
def test_a_change_inside_a_word_container_is_not_lost(container):
    """A run is not always a direct child of the paragraph. Vendor counsel's
    Word wraps them in links, content controls and smart tags — and a change
    the parser cannot see is a change Legal never gets shown."""
    rls = parse_redlines(containered_docx(CONTAINERS[container]))
    assert len(rls) == 1, f"the change inside a {container} was invisible"
    r = rls[0]
    assert r.accepted_text == "Governing law: Delaware."
    assert r.original_text == "Governing law: New York."
    assert [s.kind for s in r.segments] == ["keep", "del", "ins", "keep"]
    assert r.author == "J. Halvorsen"


@pytest.mark.parametrize("container", sorted(CONTAINERS))
def test_text_inside_a_word_container_is_readable(container):
    """The same containers must not hide text from the plain readable form."""
    text = document_text(containered_docx(CONTAINERS[container]))
    assert "Delaware" in text
    assert "New York" not in text, "a deletion is a proposal to remove, not content"


def test_a_tracked_move_is_read_as_a_delete_plus_an_insert():
    """Word records a move as one operation with two ends. A Review ticket
    adjudicates text, so each end is presented on its own: the text left one
    paragraph (a deletion) and arrived in another (an insertion). Stated here
    because it is a semantic choice, not an implementation detail."""
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>'
                '<w:p><w:r><w:t xml:space="preserve">Notices. </w:t></w:r>'
                '<w:moveFrom w:id="20" w:author="J. Halvorsen" w:date="2026-04-18T10:00:00Z">'
                '<w:r><w:delText xml:space="preserve">Either party may terminate on 30 days '
                'notice.</w:delText></w:r></w:moveFrom></w:p>'
                '<w:p><w:r><w:t xml:space="preserve">Term. </w:t></w:r>'
                '<w:moveTo w:id="21" w:author="J. Halvorsen" w:date="2026-04-18T10:00:00Z">'
                '<w:r><w:t xml:space="preserve">Either party may terminate on 30 days '
                'notice.</w:t></w:r></w:moveTo></w:p>'
                '</w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)

    rls = parse_redlines(buf.getvalue())
    assert len(rls) == 2, "both ends of a move are negotiation points"

    departure, arrival = rls
    assert [s.kind for s in departure.segments] == ["keep", "del"]
    assert departure.accepted_text == "Notices. "
    assert "terminate" in departure.original_text

    assert [s.kind for s in arrival.segments] == ["keep", "ins"]
    assert "terminate" in arrival.accepted_text
    assert arrival.original_text == "Term. "

    assert departure.author == arrival.author == "J. Halvorsen"


def test_a_nested_paragraph_is_counted_once():
    """A paragraph inside a table cell or a content control is its own
    paragraph. Reading the outer one used to swallow the inner one's text as
    well, so the same sentence was reported twice."""
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>'
                '<w:p><w:r><w:t>Outer. </w:t></w:r>'
                '<w:sdt><w:sdtContent>'
                '<w:p><w:r><w:t>Inner.</w:t></w:r></w:p>'
                '</w:sdtContent></w:sdt></w:p>'
                '</w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", document)
    paras = paragraphs(buf.getvalue())
    assert paras == ["Outer. ", "Inner."], f"got {paras}"


def test_text_reached_directly_as_deleted_is_never_document_content():
    """The old delText branch was unreachable in practice. This exercises the
    rule directly: a w:delText anywhere in a paragraph is struck-out text."""
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}"><w:body>'
                '<w:p><w:r><w:t>Kept. </w:t></w:r>'
                '<w:r><w:delText>Struck.</w:delText></w:r></w:p>'
                '</w:body></w:document>')
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", document)
    assert paragraphs(buf.getvalue()) == ["Kept. "]


# ── Round trip ─────────────────────────────────────────────────────────────


def test_our_own_output_parses_as_having_no_redlines(built):
    """An assembled contract carries no tracked changes — it is a clean draft."""
    data, _ = built
    assert parse_redlines(data) == ()


# ── Independent validation ─────────────────────────────────────────────────
# Our own parser reading our own output proves only that we are self-consistent.
# python-docx is a separate implementation of the OOXML reader, so if it can
# open the file and read the clauses, the package is genuinely well-formed and
# not merely agreeable to us. It is a test-only dependency; nothing in the
# service imports it (and it cannot read tracked changes, which is why the
# service does not use it).

def test_an_independent_reader_can_open_the_document(built):
    docx_mod = pytest.importorskip("docx", reason="validator not installed")
    data, res = built
    doc = docx_mod.Document(BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs)
    for d in res.decisions:
        if d.selected:
            assert d.selected.body in text, (
                f"{d.selected.ref} is not readable by an independent reader")


def test_an_independent_reader_sees_our_styles(built):
    docx_mod = pytest.importorskip("docx", reason="validator not installed")
    data, _ = built
    doc = docx_mod.Document(BytesIO(data))
    styles = {p.style.name for p in doc.paragraphs if p.style is not None}
    assert "Title" in styles
    assert any("eading 2" in s for s in styles), f"got {styles}"


def test_python_docx_cannot_read_tracked_changes_which_is_why_we_do_not_use_it():
    """Demonstrates the reason for the deviation from ARCHITECTURE.md §5.

    python-docx exposes only runs that are direct children of a paragraph, so
    content inside `w:ins` and `w:del` is invisible to it. It drops the
    INSERTION as well as the deletion — meaning a redline read through it would
    silently lose exactly the text under negotiation. Our parser reads both.
    """
    docx_mod = pytest.importorskip("docx", reason="validator not installed")
    data = redlined_docx(FOUR_CHANGES)

    through_python_docx = "\n".join(p.text for p in docx_mod.Document(BytesIO(data)).paragraphs)
    assert "72" not in through_python_docx, "the vendor's proposal is invisible to it"
    assert "24" not in through_python_docx, "so is what they struck out"

    ours = parse_redlines(data)[0]
    assert ours.accepted_text.endswith("72 hours of any Personal Data Breach.")
    assert ours.original_text.endswith("24 hours of any Personal Data Breach.")
    assert [s.kind for s in ours.segments] == ["keep", "del", "ins", "keep"]


# ── Untrusted input ────────────────────────────────────────────────────────
# A vendor upload is the one place bytes we did not produce enter the system.


def test_a_non_zip_upload_fails_with_a_usable_message():
    with pytest.raises(NotADocx, match="zip archive"):
        parse_redlines(b"Dear Customer, please find our comments attached.")


def test_a_zip_that_is_not_a_word_document_fails_clearly():
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("notes.txt", "our redlines are in the email")
    with pytest.raises(NotADocx, match="not a Word document"):
        parse_redlines(buf.getvalue())


def test_malformed_document_xml_fails_clearly():
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", "<w:document><unclosed>")
    with pytest.raises(NotADocx, match="malformed"):
        parse_redlines(buf.getvalue())


# ── Hostile uploads (E6) ───────────────────────────────────────────────────
# Two exposures, both reproduced against the previous version of this module.
# Deliberately NOT tested here: classic entity expansion. expat 2.5.0 already
# refuses billion-laughs and quadratic blowup outright (measured at 0.26 s and
# 0.02 s), so a test for it could not fail, and a check that cannot fail is a
# defect rather than a formality.


def test_duplicate_document_parts_are_refused_as_ambiguous():
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml",
                   f'<w:document xmlns:w="{W}"><w:body/></w:document>')
        z.writestr("word/document.xml",
                   f'<w:document xmlns:w="{W}"><w:body><w:p/></w:body></w:document>')

    with pytest.raises(NotADocx, match="duplicate member names"):
        parse_redlines(buf.getvalue())


def test_unsupported_zip_compression_is_a_document_refusal():
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        z.writestr("word/document.xml",
                   f'<w:document xmlns:w="{W}"><w:body/></w:document>')
    hostile = bytearray(buf.getvalue())
    local = hostile.index(b"PK\x03\x04")
    central = hostile.index(b"PK\x01\x02")
    hostile[local + 8:local + 10] = (99).to_bytes(2, "little")
    hostile[central + 10:central + 12] = (99).to_bytes(2, "little")

    with pytest.raises(NotADocx, match="unsupported or encrypted"):
        parse_redlines(bytes(hostile))


def _padded_zip(members) -> bytes:
    """A small archive whose members expand to a great deal more.

    Written in 1 MB chunks through the streaming writer, so building the fixture
    does not itself allocate the expanded payload. The test has to prove the
    parser is safe, not that the machine running it had spare memory.
    """
    buf = BytesIO()
    chunk = b"\0" * (1024 * 1024)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, megabytes in members:
            with z.open(name, "w") as f:
                for _ in range(megabytes):
                    f.write(chunk)
    return buf.getvalue()


@pytest.fixture(scope="module")
def zip_bomb():
    """102 KB in, 40 MB out — the shape of the reproduced attack."""
    return _padded_zip([("word/document.xml", 40)])


@pytest.fixture(scope="module")
def spread_bomb():
    """The same trick split across members, each one under the per-part cap."""
    return _padded_zip([("word/document.xml", 14)] +
                       [(f"word/media/image{i}.bin", 14) for i in range(4)])


@pytest.fixture(scope="module")
def nesting_bomb():
    """No DOCTYPE, no entities, and 14 MB of XML — under the 16 MB per-part cap,
    so no size limit sees it. Parsed rather than refused, this fixture takes
    about 5 s and 350 MB; the reproduced original was 33.6 MB, 18.7 s and
    1.3 GB. Depth is the only dimension that bounds it."""
    depth = 1_300_000
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document xmlns:w="{W}">'
                + f"<w:p>" * depth + "</w:p>" * depth
                + "</w:document>")
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", document)
    return buf.getvalue()


def test_a_zip_bomb_is_refused_without_exhausting_memory(zip_bomb):
    """The uncompressed size in a zip header is a claim by whoever built the
    file. Believing it is what turns 102 KB into 40 MB of resident memory — and
    the same archive can just as easily claim 40 GB."""
    assert len(zip_bomb) < 200_000, "the fixture must be a small file, as the attack is"

    tracemalloc.start()
    try:
        with pytest.raises(NotADocx, match="decompression bomb"):
            parse_redlines(zip_bomb)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    # The bound is the point, not the exception. An unbounded read of this
    # fixture peaks at about 85 MB; refusing at the 16 MB cap peaks at about 32.
    assert peak < 48 * 1024 * 1024, (
        f"refused, but only after allocating {peak / 1048576:.0f} MB — "
        f"the read was not actually bounded")


def test_a_bomb_spread_across_members_is_refused(spread_bomb):
    """Each part is under the per-part cap; together they are not. The archive
    total is a second line, so the per-part cap cannot simply be walked around."""
    assert len(spread_bomb) < 300_000
    with pytest.raises(NotADocx, match="past the 64 MB limit"):
        parse_redlines(spread_bomb)


def test_deeply_nested_xml_is_refused_promptly(nesting_bomb):
    """The attack that survives every size cap: no DOCTYPE, no entity, a small
    file — just elements nested past any depth a contract has."""
    started = time.monotonic()
    with pytest.raises(NotADocx, match="nests more than"):
        parse_redlines(nesting_bomb)
    elapsed = time.monotonic() - started
    # A time bound, not merely 'it raises'. Before the guard this took 18.7 s on
    # a larger fixture; parsing the whole of this one takes seconds. Abandoning
    # it at the first over-deep element takes milliseconds.
    #
    # THE BOUND IS FIVE SECONDS AND NOT ONE, and the reason is worth recording
    # rather than quietly widening. The original 1.0 s was calibrated on the
    # machine that wrote it. On a loaded Windows workstation this same code
    # takes 1.1-1.3 s — so the test failed intermittently while the guard it
    # tests was working perfectly, and an intermittently red suite is one people
    # learn to re-run rather than read.
    #
    # Five seconds still separates the two behaviours by a wide margin, which is
    # all this assertion was ever for: abandoning at the first over-deep element
    # is milliseconds of work, and parsing the bomb through to the end took
    # 18.7 s. It does NOT measure performance, and it should not be tightened
    # into something that does — the property is "gives up early", not "is fast".
    assert elapsed < 5.0, (
        f"refused, but only after {elapsed:.1f}s — that is long enough to mean "
        f"the whole document was parsed rather than abandoned at the first "
        f"over-deep element")


def test_a_shallow_element_flood_is_refused_before_building_the_tree():
    document = (
        f'<w:document xmlns:w="{W}"><w:body>'
        + "<w:r/>" * (MAX_ELEMENTS + 1)
        + "</w:body></w:document>")
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", document)

    with pytest.raises(NotADocx, match="more than 100000 elements"):
        parse_redlines(buf.getvalue())


def test_a_doctype_is_refused():
    """Defence in depth. expat already blocks the expansion attacks a DOCTYPE
    is used for, so this is cheap insurance rather than the real guard — and
    'legitimate OOXML never carries a DOCTYPE' is inferred, not measured."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml",
                   '<?xml version="1.0"?><!DOCTYPE w:document [ <!ENTITY a "x"> ]>'
                   f'<w:document xmlns:w="{W}"><w:body/></w:document>')
    with pytest.raises(NotADocx, match="DOCTYPE"):
        parse_redlines(buf.getvalue())


def test_a_doctype_in_utf_16_is_still_refused():
    """The regression that moved the refusal into the parser. The old check
    scanned the raw bytes for ASCII "<!DOCTYPE"; a document.xml written in
    UTF-16 — an encoding the parser honours — carried its DOCTYPE straight
    past that scan and parsed clean (reproduced before fixing). The fixture
    asserts its own disguise still holds, so this test cannot quietly become
    the ASCII test again."""
    document = ('<?xml version="1.0" encoding="UTF-16"?>'
                '<!DOCTYPE w:document [ <!ENTITY a "x"> ]>'
                f'<w:document xmlns:w="{W}"><w:body/></w:document>'
                ).encode("utf-16")
    assert b"<!DOCTYPE" not in document, (
        "the fixture no longer hides from an ASCII byte scan — it is not "
        "testing the bypass any more")

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", document)
    with pytest.raises(NotADocx, match="DOCTYPE"):
        parse_redlines(buf.getvalue())


def test_an_ordinary_document_is_not_refused_by_any_of_this(built):
    """The control. Guards that reject real work are worse than no guards."""
    data, _ = built
    assert parse_redlines(data) == ()
    assert paragraphs(data)


# ── The second count (WP-17, ADR-0010) ─────────────────────────────────────
#
# Two figures, both computed, NEITHER printed on the document (owner decision,
# 2026-07-25). The first does not weaken: this system still writes nothing.
# The second says how much of what a lawyer approved began as a model's words —
# "a lawyer approved it" and "a lawyer composed it" are different claims, and
# only the honest one survives an auditor.


AI_LIBRARY = [
    clause("DP-H-014", "Data Privacy", HIGH,
           "Supplier shall notify Customer within thirty-six (36) hours of a "
           "Personal Data Breach.", origin=AI_DRAFTED),
    clause("LC-S-009", "Liability Cap", STANDARD,
           "Liability is capped at the fees paid in the preceding twelve months."),
    clause("DF-B-001", "Definitions", STANDARD,
           "Capitalised terms have the meanings given in this Agreement.",
           always_include=True, framework_section="1.1"),
]


def structural_for(res, today="2026-08-01"):
    section = 0
    out = ["MASTER SERVICES AGREEMENT", "Northwind Analytics — $240K", f"Dated: {today}"]
    for d in res.decisions:
        if d.selected:
            section += 1
            out.append(f"{section}. {d.risk.category.upper()}")
            out.append(f"[{d.selected.ref}]")
    out.append(f"Clauses: {section} · Library snapshot: {res.snapshot_id[:12]}")
    return out


@pytest.fixture
def built_with_ai():
    snap = Snapshot.build(AI_LIBRARY)
    res = resolve(MANIFEST, snap)
    return build_docx(MANIFEST, res, today=date(2026, 8, 1)), res


def test_a_library_with_no_ai_wording_counts_zero(built):
    """The figure exists before the first AI draft is ever approved. A real
    zero is a measurement; an absent number is a gap somebody has to explain."""
    data, res = built
    selected = [d.selected for d in res.decisions if d.selected]
    assert ai_originated_characters(data, selected) == 0


def test_ai_originated_characters_are_counted(built_with_ai):
    data, res = built_with_ai
    selected = [d.selected for d in res.decisions if d.selected]
    ai = [c for c in selected if c.origin == AI_DRAFTED]
    assert ai, "the fixture must actually contain AI-originated wording"
    assert ai_originated_characters(data, selected) == sum(len(c.body) for c in ai)


def test_the_first_count_is_still_zero_when_the_second_is_not(built_with_ai):
    """The two numbers are independent, and this is the pair that matters: the
    assembly path still generated nothing, even though some of the approved
    wording began as a model's draft."""
    data, res = built_with_ai
    bodies = [d.selected.body for d in res.decisions if d.selected]
    assert authored_characters(data, bodies, structural_for(res)) == 0
    selected = [d.selected for d in res.decisions if d.selected]
    assert ai_originated_characters(data, selected) > 0


def test_neither_count_is_printed_on_the_document(built_with_ai):
    """Owner decision, 2026-07-25. The counts live in the run record and the
    dossier; the contract says nothing about them, in either direction."""
    data, _ = built_with_ai
    text = document_text(data).lower()
    for phrase in ("llm-authored", "ai-originated", "ai originated",
                   "authored characters", "ai-drafted"):
        assert phrase not in text, f"the document must not carry a provenance footer: {phrase}"


def test_provenance_counts_returns_both_figures(built_with_ai):
    data, res = built_with_ai
    counts = provenance_counts(data, res, structural_for(res))
    assert counts["authored_chars"] == 0
    assert counts["ai_origin_chars"] > 0
    assert set(counts) == {"authored_chars", "ai_origin_chars"}, (
        "the shape cw.run.authored_chars / cw.run.ai_origin_chars expect")


# ── Text no Word file can carry, and line breaks every Word file must ───────
# The invariant at the top of docx.py — clause text is exact or it is not the
# approved clause — has two failure modes that this module's OWN parser cannot
# see, because both survive a round trip through it and only fail in Word:
# a control character makes the file unopenable, and a raw newline inside a
# text element renders as nothing, so the printed wording is not the approved
# wording. Both proofs below therefore reach past the parser: one insists the
# build refuses, the other inspects the emitted XML bytes themselves.


def _one_clause_document(body):
    lib = [clause("XX-T-001", "Data Privacy", HIGH, body)]
    manifest = Manifest(vendor="Vendor", value="", source="llm",
                        risks=(Risk("Data Privacy", HIGH, "test"),))
    res = resolve(manifest, Snapshot.build(lib))
    return build_docx(manifest, res, today=date(2026, 8, 1)), res


def test_wording_no_word_file_can_carry_is_refused_not_emitted():
    """\\x0b is what Word itself puts on the clipboard for a Shift+Enter line
    break, so it arrives in a clause body by honest paste. No XML file can
    carry it, even escaped: emitting it produces bytes with a valid hash that
    Word refuses to open. Refusing the build, loudly, is the only honest
    outcome — and the message must say the wording is the problem."""
    with pytest.raises(UnprintableText):
        _one_clause_document("Line one.\x0bLine two.")


def test_a_line_break_in_approved_wording_is_a_real_line_break_in_the_file():
    """The proof reads the emitted XML, deliberately. A raw newline inside a
    text element survives paragraphs() — every round-trip assertion in this
    file stays green — and then Word renders it as nothing."""
    data, _ = _one_clause_document("First line.\nSecond line.")
    with zipfile.ZipFile(BytesIO(data)) as z:
        raw = z.read("word/document.xml")
    assert b"\n" not in raw, (
        "a raw newline was emitted into document.xml — Word will render the "
        "approved wording without its line break")
    assert b"<w:br/>" in raw, "the line break element is missing entirely"


def test_wording_with_line_breaks_round_trips_exactly():
    """Both directions: the emitted break element reads back as the newline it
    stands for, and the character counter still recognises the wording as
    approved rather than flagging it as stray."""
    body = "First line.\nSecond line."
    data, res = _one_clause_document(body)

    assert body in paragraphs(data), (
        "the wording that came back is not the wording that went in")

    structural = ["MASTER SERVICES AGREEMENT", "Vendor", "Dated: 2026-08-01",
                  "1. DATA PRIVACY", f"[{res.decisions[0].selected.ref}]",
                  f"Clauses: 1 · Library snapshot: {res.snapshot_id[:12]}"]
    assert authored_characters(data, [body], structural) == 0


def test_a_carriage_return_survives_the_round_trip():
    """A raw carriage return is legal in XML but every conforming reader folds
    it into a newline — so wording containing one would read back changed.
    It is emitted as a character reference instead, which survives."""
    body = "Alpha.\r\nBeta."
    data, _ = _one_clause_document(body)
    assert body in paragraphs(data), (
        "the carriage return was normalised away — the read-back text is not "
        "the approved text")
