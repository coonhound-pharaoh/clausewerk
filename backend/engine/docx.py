"""The document service: emit a contract, read a vendor's redline.

**Deviation from ARCHITECTURE.md §5, deliberately.** The specification names
`python-docx`. This uses the standard library instead, for a reason that is not
preference: python-docx does not expose tracked changes. `w:ins` and `w:del`
content is not reachable through its object model, so the redline half has to
walk the XML regardless — and once that is true, a second dependency buys only
inconsistency. Generation and parsing now share one representation.

The invariant this module exists to protect:

    Every character of contract text in the emitted document comes from a
    clause body in the snapshot. Nothing here writes contract language.

`authored_characters()` makes that machine-checkable rather than a claim. It
counts characters in the produced document that are neither clause text nor one
of a small, declared set of structural strings, and the test suite asserts the
count is zero. That number is the product (ARCHITECTURE.md §1).
"""

from __future__ import annotations

import hashlib
import re
import zipfile
from dataclasses import dataclass, field
from datetime import date
from io import BytesIO
from typing import Iterable, Optional
from xml.etree import ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W}">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
<w:pPr><w:spacing w:after="240"/></w:pPr>
<w:rPr><w:sz w:val="48"/><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
<w:rPr><w:sz w:val="26"/><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ClauseId"><w:name w:val="Clause Id"/>
<w:rPr><w:sz w:val="16"/><w:color w:val="808080"/></w:rPr></w:style>
</w:styles>"""


class UnprintableText(ValueError):
    """Text that no Word document can carry, refused before it corrupts one."""


# Characters XML 1.0 cannot represent AT ALL — not even escaped: the control
# characters below 0x20 other than tab, newline and carriage return, plus the
# two permanent non-characters. A file containing one is not a Word document;
# Word refuses to open it, and this module's own reader refuses it too. The
# likeliest visitor is \x0b, which is what Word itself puts on the clipboard
# for a Shift+Enter line break — so it arrives by honest paste, not malice.
_UNPRINTABLE = re.compile("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\ufffe\\uffff]")


def _esc(text: str) -> str:
    bad = _UNPRINTABLE.search(text)
    if bad:
        raise UnprintableText(
            f"character {bad.group()!r} at position {bad.start()} cannot exist "
            "in a Word document. Emitting it would produce a file Word refuses "
            "to open — the wording itself has to change, likely by re-entering "
            "whatever was pasted in with it."
        )
    # A carriage return IS representable, but only as a character reference —
    # a raw one is folded into a newline by every conforming XML reader, and
    # then the read-back text is not the approved text.
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\r", "&#13;"))


def _para(text: str, style: Optional[str] = None) -> str:
    pr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    # xml:space="preserve" so leading/trailing spaces in approved wording are
    # not silently trimmed by a Word reader. Clause text is exact or it is not
    # the approved clause.
    #
    # A newline must become a real line break element. Left as a raw character
    # it survives this module's own parser — so every test here stays green —
    # and then Word renders it as nothing: the printed wording would not be
    # the approved wording, invisibly. _visible_text() reads the element back
    # as "\n", which is what keeps the round trip exact.
    runs = "<w:br/>".join(
        f'<w:t xml:space="preserve">{piece}</w:t>'
        for piece in _esc(text).split("\n"))
    return f"<w:p>{pr}<w:r>{runs}</w:r></w:p>"


# ── Generation ─────────────────────────────────────────────────────────────


def build_docx(manifest, resolution, *, today: Optional[date] = None) -> bytes:
    """Assemble the contract. String composition from clause bodies only."""
    today = today or date.today()
    body: list[str] = []

    title = f"MASTER SERVICES AGREEMENT"
    subtitle = manifest.vendor + (f" — {manifest.value}" if manifest.value else "")
    body.append(_para(title, "Title"))
    body.append(_para(subtitle))
    body.append(_para(f"Dated: {today.isoformat()}"))

    section = 0
    for d in resolution.decisions:
        if d.selected is None:
            continue          # an unresolved risk is not silently papered over
        section += 1
        body.append(_para(f"{section}. {d.risk.category.upper()}", "Heading2"))
        body.append(_para(f"[{d.selected.ref}]", "ClauseId"))
        # The only contract text in the document, inserted verbatim.
        body.append(_para(d.selected.body))

    # The provenance counts are recorded in the run record, never printed on
    # the contract (owner decision, 2026-07-25 — memory.md). The zero-authored
    # property itself is still asserted by test on every build.
    body.append(_para(
        f"Clauses: {section} · Library snapshot: {resolution.snapshot_id[:12]}"))

    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W}"><w:body>{"".join(body)}'
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
        '</w:sectPr></w:body></w:document>'
    )

    buf = BytesIO()
    # Fixed timestamps: a document assembled twice from the same inputs must be
    # byte-identical, or the stored SHA-256 means nothing.
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in (
            ("[Content_Types].xml", CONTENT_TYPES),
            ("_rels/.rels", RELS),
            ("word/document.xml", document),
            ("word/styles.xml", STYLES),
            ("word/_rels/document.xml.rels", DOC_RELS),
        ):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return buf.getvalue()


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# ── Reading back ───────────────────────────────────────────────────────────


class NotADocx(ValueError):
    """The uploaded file is not a readable Word document."""


# ── Limits on an untrusted upload ──────────────────────────────────────────
# A vendor upload is the one place bytes we did not produce enter the system.
# Each of these bounds a specific, reproduced attack; none of them is close to
# what a real contract needs.
MAX_PART_BYTES = 16 * 1024 * 1024        # one part of the archive, decompressed
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024     # the whole archive, decompressed
MAX_ELEMENT_DEPTH = 256                  # nested elements in document.xml


class _BoundedDepthBuilder(ET.TreeBuilder):
    """Abandon a document that nests deeper than a contract ever needs.

    Reproduced: 33.6 MB of deeply nested elements, with **no DOCTYPE at all**,
    took 18.7 s and peaked at 1.3 GB — comfortably under any plausible byte cap.
    Size is the wrong dimension for that attack; depth is the right one. The
    check runs as the parse runs, so the file is abandoned at the first
    over-deep element instead of after the tree has been built.
    """

    def __init__(self, limit: int = MAX_ELEMENT_DEPTH):
        super().__init__()
        self._limit = limit
        self._depth = 0

    def start(self, tag, attrs):
        self._depth += 1
        if self._depth > self._limit:
            raise NotADocx(
                f"word/document.xml nests more than {self._limit} elements deep "
                f"— refused"
            )
        return super().start(tag, attrs)

    def end(self, tag):
        self._depth -= 1
        return super().end(tag)


def _read_member(z: zipfile.ZipFile, name: str) -> bytes:
    """Read one archive member with a hard ceiling on what comes out.

    Never `z.read(name)`. The uncompressed size recorded in a zip header is a
    claim made by whoever built the file, and an unbounded read believes it:
    a 102 KB archive expanding to 344 MB was reproduced against the previous
    version of this function. Asking for one byte more than the cap and
    rejecting on overrun bounds the damage to the cap whatever the header says.
    """
    with z.open(name) as f:
        raw = f.read(MAX_PART_BYTES + 1)
    if len(raw) > MAX_PART_BYTES:
        raise NotADocx(
            f"{name} expands past {MAX_PART_BYTES // (1024 * 1024)} MB — refused as a "
            f"decompression bomb"
        )
    return raw


def _document_xml(data: bytes) -> ET.Element:
    # Failures here get a message a buyer can act on rather than a stack trace.
    try:
        with zipfile.ZipFile(BytesIO(data)) as z:
            declared = sum(i.file_size for i in z.infolist())
            if declared > MAX_ARCHIVE_BYTES:
                # Second line: a bomb split across many members, each of them
                # individually under the per-part cap.
                raise NotADocx(
                    f"the archive declares {declared // (1024 * 1024)} MB of content, past "
                    f"the {MAX_ARCHIVE_BYTES // (1024 * 1024)} MB limit — refused"
                )
            raw = _read_member(z, "word/document.xml")
    except zipfile.BadZipFile as exc:
        raise NotADocx("not a .docx file — a Word document is a zip archive") from exc
    except KeyError as exc:
        raise NotADocx("missing word/document.xml — the file is not a Word document") from exc

    # Defence in depth, not the load-bearing defence. expat 2.5.0 already blocks
    # classic entity expansion — billion-laughs measured at 0.26 s and quadratic
    # blowup at 0.02 s, both refused (Observed). Refusing a DOCTYPE outright
    # costs nothing, so it stays. The premise "legitimate OOXML never carries a
    # DOCTYPE" is `Inferred` from the ECMA-376 part definitions and from the
    # samples to hand — it is NOT `Observed` against a corpus of real Word
    # output, and should not be cited as though it were.
    if b"<!DOCTYPE" in raw:
        raise NotADocx("word/document.xml declares a DOCTYPE — refused")

    try:
        return ET.fromstring(raw, ET.XMLParser(target=_BoundedDepthBuilder()))
    except ET.ParseError as exc:
        raise NotADocx(f"word/document.xml is malformed: {exc}") from exc


# The containers real Word output wraps runs in. None of them is contract
# structure — they are links, content controls and smart tags — so text inside
# them is ordinary paragraph text and must be walked through, not past. Before
# this, everything inside one of them was invisible to redline parsing.
P = f"{{{W}}}p"
R = f"{{{W}}}r"
T = f"{{{W}}}t"
BR = f"{{{W}}}br"
DEL_TEXT = f"{{{W}}}delText"
INS = f"{{{W}}}ins"
DEL = f"{{{W}}}del"
# A tracked MOVE is recorded as delete + insert. That is a semantic choice, not
# a detail: Word models a move as one operation, but a Review ticket adjudicates
# text, and the text left one place and arrived in another. Representing it as a
# move would require the reviewer to reason about both ends at once; representing
# it as a deletion here and an insertion there lets each end be accepted or
# refused on its own, which is how ADR-0007 says a negotiation point works.
MOVE_FROM = f"{{{W}}}moveFrom"
MOVE_TO = f"{{{W}}}moveTo"
TRANSPARENT = (
    f"{{{W}}}hyperlink",     # text of a cross-reference or an external link
    f"{{{W}}}sdt",           # a content control…
    f"{{{W}}}sdtContent",    # …and the part of it that holds the text
    f"{{{W}}}smartTag",      # legacy Word entity recognition
)


def _visible_text(p: ET.Element) -> str:
    """The readable text of ONE paragraph.

    Two things this has to get right that a flat `p.iter()` did not:

    * A nested `w:p` — inside a table cell or a content control — is its own
      paragraph and is reported separately. Including its text here as well
      counted it twice.
    * Deleted and moved-from text is a proposal to remove, not content, so the
      whole subtree is skipped rather than one tag being filtered out of it.
    """
    parts: list[str] = []

    def walk(node: ET.Element) -> None:
        for child in node:
            tag = child.tag
            if tag == P:
                continue          # its own paragraph, counted once, over there
            if tag in (DEL, MOVE_FROM):
                continue          # struck out: not text of the document
            if tag == T:
                if child.text:
                    parts.append(child.text)
            elif tag == BR:
                # The element _para() writes for a newline in approved wording.
                # Read back as one, or the round trip loses the line break and
                # the character counter flags approved text as stray.
                parts.append("\n")
            elif tag == DEL_TEXT:
                continue          # deleted text reached directly, same rule
            else:
                walk(child)

    walk(p)
    return "".join(parts)


def paragraphs(data: bytes) -> list[str]:
    """Visible text, one string per paragraph, deletions excluded."""
    return [_visible_text(p) for p in _document_xml(data).iter(P)]


def document_text(data: bytes) -> str:
    return "\n".join(paragraphs(data))


def authored_characters(data: bytes, bodies: Iterable[str], structural: Iterable[str]) -> int:
    """Characters in the document that came from neither the library nor the
    declared structural set.

    This is the headline claim, counted. `structural` must be an explicit list —
    if a caller has to add a string to it, that is exactly the moment to ask
    whether the system just wrote contract language.
    """
    allowed = {b.strip() for b in bodies} | {s.strip() for s in structural}
    stray = 0
    for para in paragraphs(data):
        text = para.strip()
        if not text or text in allowed:
            continue
        stray += len(text)
    return stray


# ── The second count (ADR-0010, WP-17) ─────────────────────────────────────
# Two numbers, both computed, NEITHER printed on the document (owner decision,
# 2026-07-25). They answer different questions and the first does not weaken:
#
#   authored_characters()      — characters this system wrote. Still zero, still
#                                asserted by test on every build. The assembly
#                                path generates nothing, and ADR-0010 does not
#                                touch that.
#   ai_originated_characters() — characters that came from clause bodies whose
#                                ORIGIN is an AI draft. Every one of them was
#                                read and approved by a named lawyer, so they
#                                are not authored by the system; but "a lawyer
#                                approved it" and "a lawyer composed it" are
#                                different claims, and only the honest one
#                                survives an auditor.
#
# Counted from the emitted bytes rather than from the resolution, for the same
# reason authored_characters() is: what matters is what is IN the document.


def ai_originated_characters(data: bytes, clauses: Iterable) -> int:
    """Characters in the document that came from AI-originated clause bodies.

    `clauses` are the selected clauses, each carrying its `origin`. A body that
    is not in the document — an unresolved risk, a suppressed candidate — is not
    counted, because it is not in the contract.
    """
    ai_bodies = {c.body.strip() for c in clauses if getattr(c, "origin", "") == "ai_drafted"}
    if not ai_bodies:
        return 0
    return sum(len(p.strip()) for p in paragraphs(data) if p.strip() in ai_bodies)


def provenance_counts(data: bytes, resolution, structural: Iterable[str]) -> dict:
    """Both figures for one emitted contract, ready for the run record.

    This is the shape `cw.run.authored_chars` / `cw.run.ai_origin_chars` expect.
    It lives here rather than in `run.py` because both numbers are properties of
    the produced bytes, and only this module reads those.
    """
    selected = [d.selected for d in resolution.decisions if d.selected]
    bodies = [c.body for c in selected]
    return {
        "authored_chars": authored_characters(data, bodies, structural),
        "ai_origin_chars": ai_originated_characters(data, selected),
    }


# ── Redline parsing (ADR-0007) ─────────────────────────────────────────────


@dataclass(frozen=True)
class Segment:
    kind: str        # keep | ins | del
    text: str


@dataclass(frozen=True)
class Redline:
    """One changed paragraph — one independently adjudicated negotiation point."""

    index: int
    segments: tuple[Segment, ...]
    author: Optional[str] = None
    changed_on: Optional[str] = None
    context_before: str = ""
    context_after: str = ""

    @property
    def ins_count(self) -> int:
        return sum(1 for s in self.segments if s.kind == "ins")

    @property
    def del_count(self) -> int:
        return sum(1 for s in self.segments if s.kind == "del")

    @property
    def accepted_text(self) -> str:
        """What the vendor is proposing: kept text plus insertions, deletions
        dropped. This is what a Review ticket pre-loads (ADR-0003)."""
        return "".join(s.text for s in self.segments if s.kind in ("keep", "ins"))

    @property
    def original_text(self) -> str:
        return "".join(s.text for s in self.segments if s.kind in ("keep", "del"))


def _runs_of(parent: ET.Element, kind: str) -> list[Segment]:
    tag = f"{{{W}}}delText" if kind == "del" else f"{{{W}}}t"
    out = []
    for r in parent.iter(f"{{{W}}}r"):
        for t in r.iter(tag):
            if t.text:
                out.append(Segment(kind, t.text))
    return out


def parse_redlines(data: bytes, *, context_chars: int = 160) -> tuple[Redline, ...]:
    """One Redline per CHANGED paragraph.

    A four-change document becomes four negotiation points, each matched and
    adjudicated on its own (ADR-0007). Unchanged paragraphs are context, not
    redlines.
    """
    root = _document_xml(data)
    paras = list(root.iter(P))

    plain = [_visible_text(p) for p in paras]

    found: list[Redline] = []
    for i, p in enumerate(paras):
        segments: list[Segment] = []
        attribution: dict[str, Optional[str]] = {"author": None, "date": None}

        def walk(node: ET.Element) -> None:
            """Walk one paragraph in document order, so kept text and changes
            interleave the way they appear on the page.

            Real Word output does not put every run directly under `w:p`. A
            cross-reference sits in `w:hyperlink`, a fill-in field sits in
            `w:sdt`/`w:sdtContent`, and older documents still carry
            `w:smartTag`. Only direct children were read before, so a change
            inside any of those was silently missing from what a Review ticket
            showed Legal.
            """
            for child in node:
                tag = child.tag
                if tag == P:
                    continue                       # its own paragraph
                if tag == R:
                    for t in child.iter(T):
                        if t.text:
                            segments.append(Segment("keep", t.text))
                elif tag in (INS, MOVE_TO):
                    # A move-to is an arrival: for adjudication it is an insertion.
                    segments.extend(_runs_of(child, "ins"))
                    attribution["author"] = attribution["author"] or child.get(f"{{{W}}}author")
                    attribution["date"] = attribution["date"] or child.get(f"{{{W}}}date")
                elif tag in (DEL, MOVE_FROM):
                    # A move-from is a departure: for adjudication it is a deletion.
                    segments.extend(_runs_of(child, "del"))
                    attribution["author"] = attribution["author"] or child.get(f"{{{W}}}author")
                    attribution["date"] = attribution["date"] or child.get(f"{{{W}}}date")
                elif tag in TRANSPARENT:
                    walk(child)

        walk(p)
        author = attribution["author"]
        changed_on = attribution["date"]

        if not any(s.kind in ("ins", "del") for s in segments):
            continue

        before = " ".join(plain[max(0, i - 2):i])[-context_chars:]
        after = " ".join(plain[i + 1:i + 3])[:context_chars]
        found.append(Redline(
            index=i,
            segments=tuple(segments),
            author=author,
            changed_on=changed_on,
            context_before=before,
            context_after=after,
        ))
    return tuple(found)
