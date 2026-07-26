"""Document service tests.

The central one is `test_the_document_contains_zero_authored_characters`. The
system's headline claim is a character count; this makes it a machine-checked
property of the emitted file rather than a statement in a footer.
"""

import zipfile
from datetime import date
from io import BytesIO

import pytest

from engine.docx import (
    CONTENT_TYPES,
    DOC_RELS,
    RELS,
    STYLES,
    W,
    NotADocx,
    authored_characters,
    build_docx,
    document_text,
    paragraphs,
    parse_redlines,
    sha256_of,
)
from engine.model import HIGH, STANDARD, Clause, Manifest, Risk
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
    data, res = built
    text = document_text(data)
    for d in res.decisions:
        if d.selected:
            assert d.selected.body in text, f"{d.selected.ref} was altered in the document"


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
        f"Clauses: {section} · Library snapshot: {res.snapshot_id[:12]} · "
        f"LLM-authored characters: 0")

    assert authored_characters(data, bodies, structural) == 0


def test_the_counter_actually_counts(built):
    """Control: if the allowlist is incomplete, stray characters are reported.
    Without this the test above could pass because the counter always returns 0."""
    data, res = built
    bodies = [d.selected.body for d in res.decisions if d.selected]
    assert authored_characters(data, bodies, []) > 0


def test_an_unresolved_risk_is_omitted_not_invented(built):
    """No clause exists for Insurance. The document must simply not contain a
    section for it — never a plausible-looking substitute."""
    data, _ = built
    text = document_text(data)
    assert "INSURANCE" not in text.upper()


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
