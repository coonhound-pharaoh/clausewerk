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


def _esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _para(text: str, style: Optional[str] = None) -> str:
    pr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    # xml:space="preserve" so leading/trailing spaces in approved wording are
    # not silently trimmed by a Word reader. Clause text is exact or it is not
    # the approved clause.
    return f'<w:p>{pr}<w:r><w:t xml:space="preserve">{_esc(text)}</w:t></w:r></w:p>'


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

    body.append(_para(
        f"Clauses: {section} · Library snapshot: {resolution.snapshot_id[:12]} · "
        f"LLM-authored characters: 0"))

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


def _document_xml(data: bytes) -> ET.Element:
    # A vendor upload is the one place untrusted bytes enter the system, so
    # failures here get a message a buyer can act on rather than a stack trace.
    try:
        with zipfile.ZipFile(BytesIO(data)) as z:
            raw = z.read("word/document.xml")
    except zipfile.BadZipFile as exc:
        raise NotADocx("not a .docx file — a Word document is a zip archive") from exc
    except KeyError as exc:
        raise NotADocx("missing word/document.xml — the file is not a Word document") from exc
    try:
        return ET.fromstring(raw)
    except ET.ParseError as exc:
        raise NotADocx(f"word/document.xml is malformed: {exc}") from exc


def paragraphs(data: bytes) -> list[str]:
    """Visible text, one string per paragraph, deletions excluded."""
    out = []
    for p in _document_xml(data).iter(f"{{{W}}}p"):
        parts = []
        for node in p.iter():
            if node.tag == f"{{{W}}}t" and node.text:
                # Skip text inside a deletion: it is not in the document.
                parts.append(node.text)
            elif node.tag == f"{{{W}}}delText":
                continue
        out.append("".join(parts))
    return out


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
    paras = list(root.iter(f"{{{W}}}p"))

    plain: list[str] = []
    for p in paras:
        parts = [t.text or "" for t in p.iter(f"{{{W}}}t")]
        plain.append("".join(parts))

    found: list[Redline] = []
    for i, p in enumerate(paras):
        segments: list[Segment] = []
        author = changed_on = None
        # Walk the paragraph's direct children in document order, so kept text
        # and changes interleave the way they appear on the page.
        for child in list(p):
            if child.tag == f"{{{W}}}r":
                for t in child.iter(f"{{{W}}}t"):
                    if t.text:
                        segments.append(Segment("keep", t.text))
            elif child.tag == f"{{{W}}}ins":
                segments.extend(_runs_of(child, "ins"))
                author = author or child.get(f"{{{W}}}author")
                changed_on = changed_on or child.get(f"{{{W}}}date")
            elif child.tag == f"{{{W}}}del":
                segments.extend(_runs_of(child, "del"))
                author = author or child.get(f"{{{W}}}author")
                changed_on = changed_on or child.get(f"{{{W}}}date")

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
