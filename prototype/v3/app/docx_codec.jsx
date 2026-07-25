// V3.2 — DOCX codec.
//
// buildDocx(manifest, decisions) → Promise<Blob>
//   Generates a real Word .docx (an OOXML zip) for download from Dossier.
//
// parseRedlineDocx(file) → Promise<{ paragraphs, redline }>
//   Reads a .docx the user uploaded into Negotiate, extracts <w:ins>/<w:del>
//   tracked changes from word/document.xml, and synthesizes a Negotiate-shaped
//   redline scenario so the existing AI-to-ID pipeline can run unmodified.

// ── XML helpers ────────────────────────────────────────────────────────────
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Word treats line breaks as <w:br/> inside a run; otherwise the whole text
// concatenates onto one line.
function runXml(text, { bold=false, italic=false, color=null, strike=false }={}) {
  const rPr = [];
  if (bold)   rPr.push('<w:b/>');
  if (italic) rPr.push('<w:i/>');
  if (strike) rPr.push('<w:strike/>');
  if (color)  rPr.push(`<w:color w:val="${color}"/>`);
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
  // preserve leading/trailing whitespace
  return `<w:r>${rPrXml}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paraXml(runsXml, { style=null, align=null, spacingAfter=null }={}) {
  const pPr = [];
  if (style) pPr.push(`<w:pStyle w:val="${style}"/>`);
  if (align) pPr.push(`<w:jc w:val="${align}"/>`);
  if (spacingAfter != null) pPr.push(`<w:spacing w:after="${spacingAfter}"/>`);
  const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
  return `<w:p>${pPrXml}${runsXml}</w:p>`;
}

// ── Build .docx ────────────────────────────────────────────────────────────
async function buildDocx(manifest, decisions) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');

  const today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  const body = [];

  // Title block
  body.push(paraXml(runXml('MASTER SERVICES AGREEMENT', { bold:true }), { style:'Title', align:'center' }));
  body.push(paraXml(runXml(manifest.vendor + (manifest.value ? ` — ${manifest.value}` : '')),
                    { style:'Subtitle', align:'center' }));
  body.push(paraXml(runXml(`Dated: ${today}`, { italic:true, color:'666666' }), { align:'center', spacingAfter:480 }));

  // Each selected decision → heading + body
  const selected = decisions.filter(d => d.selected);
  selected.forEach((d, i) => {
    const sectionTitle = `§ ${i+1}. ${d.risk.category.toUpperCase()}`;
    body.push(paraXml(
      runXml(sectionTitle, { bold:true }) + runXml(`   [${d.selected.id}]`, { color:'888888' }),
      { style:'Heading2', spacingAfter:120 }
    ));
    // Clause body — split on \n into paragraphs so longer clauses look right
    const paras = d.selected.text.split(/\n+/);
    paras.forEach((para, pi) => {
      body.push(paraXml(runXml(para),
                        { spacingAfter: pi === paras.length - 1 ? 360 : 120 }));
    });
  });

  // Footer / metadata block
  body.push(paraXml(runXml('— Assembled by Clausewerk · ' + selected.length + ' clauses · 0 LLM-authored characters', { italic:true, color:'888888' }),
                    { align:'center', spacingAfter:0 }));
  body.push(paraXml(runXml(`Run ID: run_${Math.random().toString(36).slice(2,10)}`, { italic:true, color:'888888' }),
                    { align:'center' }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="160"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="555555"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="320" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rootRels);
  zip.folder('word').file('document.xml', documentXml);
  zip.folder('word').file('styles.xml', stylesXml);
  zip.folder('word/_rels').file('document.xml.rels', docRels);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

// ── Parse uploaded redline .docx ──────────────────────────────────────────
//
// docx tracked changes look roughly like:
//   <w:p>
//     <w:r><w:t>kept text </w:t></w:r>
//     <w:ins w:id="1" w:author="Counsel" w:date="2026-04-22T09:00:00Z">
//       <w:r><w:t>inserted text</w:t></w:r>
//     </w:ins>
//     <w:del w:id="2" w:author="Counsel" w:date="2026-04-22T09:00:00Z">
//       <w:r><w:delText>deleted text</w:delText></w:r>
//     </w:del>
//   </w:p>
//
// We walk the XML DOM, classify each child of <w:p> as keep/ins/del, extract
// concatenated text, and return ONE redline PER changed paragraph so each
// negotiation point can flow through Negotiate → Review independently.
//
// The function still resolves to a single object for backward compatibility
// with `setUploadedRedlines(prev => [parsed, ...prev])`-style callers, but the
// returned object now exposes `.redlines` (one per changed paragraph) AND a
// `.redline` alias = the first one. Negotiate consumes `.redlines` if present.
async function parseRedlineDocx(file) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');

  const zip = await JSZip.loadAsync(file);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Not a valid .docx (missing word/document.xml).');
  const xml = await docFile.async('string');

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // Iterate paragraphs into a typed structure: per-paragraph segments + counts.
  const ps = Array.from(doc.getElementsByTagNameNS(W, 'p'));
  const paragraphs = [];
  let totalIns = 0, totalDel = 0;

  for (const p of ps) {
    const segments = [];
    let pIns = 0, pDel = 0;
    const insTexts = [];
    const delTexts = [];

    function pushText(op, node) {
      let text = '';
      const ts = node.getElementsByTagNameNS(W, 't');
      for (const t of ts) text += t.textContent;
      const dts = node.getElementsByTagNameNS(W, 'delText');
      for (const t of dts) text += t.textContent;
      const tabs = node.getElementsByTagNameNS(W, 'tab');
      for (let i=0; i<tabs.length; i++) text += '\t';
      const brs = node.getElementsByTagNameNS(W, 'br');
      for (let i=0; i<brs.length; i++) text += '\n';
      if (text.length) {
        segments.push({ op, text });
        if (op === 'ins') { totalIns++; pIns++; insTexts.push(text); }
        if (op === 'del') { totalDel++; pDel++; delTexts.push(text); }
      }
    }

    for (const child of Array.from(p.childNodes)) {
      if (child.nodeType !== 1) continue;
      const localName = child.localName;
      if (localName === 'r')        pushText('keep', child);
      else if (localName === 'ins') pushText('ins',  child);
      else if (localName === 'del') pushText('del',  child);
    }

    if (segments.length > 0) {
      paragraphs.push({ segments, ins: pIns, del: pDel, insTexts, delTexts, hasChange: pIns + pDel > 0 });
    }
  }

  // Indices of paragraphs that actually carry a tracked change.
  const changedIdxs = paragraphs
    .map((p, i) => p.hasChange ? i : -1)
    .filter(i => i >= 0);

  // Author + date — taken from the first tracked change in the doc; reused
  // for all derived redlines.
  let author = 'Vendor counsel';
  let dateStr = new Date().toISOString().slice(0,16).replace('T',' ');
  const firstChange = doc.getElementsByTagNameNS(W, 'ins')[0]
                   || doc.getElementsByTagNameNS(W, 'del')[0];
  if (firstChange) {
    author = firstChange.getAttributeNS(W, 'author') || firstChange.getAttribute('w:author') || author;
    const d = firstChange.getAttributeNS(W, 'date') || firstChange.getAttribute('w:date');
    if (d) dateStr = d.slice(0,16).replace('T',' ');
  }

  const fileName = file.name || 'uploaded.docx';
  // Stable batch id so all redlines from the same upload can be grouped in
  // the inbox.
  const batchId = `BATCH-${Math.random().toString(36).slice(2,7).toUpperCase()}`;

  // Build one redline per changed paragraph
  const redlines = changedIdxs.map((idx, ordinal) => {
    const para = paragraphs[idx];

    // Stitch in some surrounding context (prev + next paragraph) so the
    // reviewer sees the change in situ rather than a single orphaned phrase.
    const stitched = [];
    if (idx > 0) {
      const prev = paragraphs[idx - 1];
      const prevText = prev.segments.map(s => s.text).join('').slice(-160);
      if (prevText.length > 4) stitched.push({ op:'keep', text: prevText.trim() + ' ' });
    }
    stitched.push(...para.segments);
    if (idx < paragraphs.length - 1) {
      const next = paragraphs[idx + 1];
      const nextText = next.segments.map(s => s.text).join('').slice(0, 160);
      if (nextText.length > 4) stitched.push({ op:'keep', text: ' ' + nextText.trim() });
    }

    // Categorize THIS paragraph (not the whole doc) so multi-topic redlines
    // get correctly routed in the controller.
    const probeText = (para.insTexts.join(' ') + ' ' + para.delTexts.join(' ') +
                       ' ' + para.segments.map(s => s.text).join(' ')).toLowerCase();

    let category = 'Confidentiality';
    let bestScore = 0;
    if (window.KEYWORD_RULES) {
      for (const rule of window.KEYWORD_RULES) {
        if (rule.test.test(probeText)) {
          const w = rule.severity === 'High' ? 2 : 1;
          if (w > bestScore) { bestScore = w; category = rule.category; }
        }
      }
    }

    const intent = para.del && para.ins
      ? `Replace ${(para.delTexts[0]||'').slice(0,30)} → ${(para.insTexts[0]||'').slice(0,30)}`
      : para.ins ? 'Insert new language' : 'Strike language';

    const matchKeywords = Array.from(new Set([
      ...para.insTexts.flatMap(t => t.split(/\W+/)).filter(w => w.length > 3),
      ...para.delTexts.flatMap(t => t.split(/\W+/)).filter(w => w.length > 3),
    ])).slice(0, 12);

    // Short title from the first ins or del fragment, capped.
    const titleFrag = (para.insTexts[0] || para.delTexts[0] || '').replace(/\s+/g,' ').trim().slice(0, 60);
    const title = titleFrag
      ? `${category} · "${titleFrag}${titleFrag.length>=60?'…':''}"`
      : `${category} · paragraph ${idx+1}`;

    const id = `RL-UPL-${batchId.slice(6)}-${String(ordinal+1).padStart(2,'0')}`;

    return {
      id,
      vendor: author,
      docx: fileName,
      category,
      sectionNumber: `¶${idx + 1}`,
      title,
      received: dateStr,
      urgent: false,
      intent,
      desiredSeverity: bestScore >= 2 ? 'High' : 'Standard',
      preferredId: null,
      matchKeywords,
      segments: stitched,
      vendorComment: `Uploaded redline · this paragraph: +${para.ins} / −${para.del}. Source file totals +${totalIns} / −${totalDel} across ${paragraphs.length} paragraphs.`,
      summary: para.del && para.ins
        ? `Replace "${(para.delTexts[0]||'').slice(0,40)}" → "${(para.insTexts[0]||'').slice(0,40)}".`
        : para.ins
          ? `Insert "${(para.insTexts[0]||'').slice(0,80)}".`
          : `Strike "${(para.delTexts[0]||'').slice(0,80)}".`,
      uploaded: true,
      stats: { totalIns: para.ins, totalDel: para.del, paragraphCount: 1 },
      // Batch metadata so the inbox can group siblings
      batchId,
      batchOrdinal: ordinal + 1,
      batchSize: changedIdxs.length,
      batchTotals: { totalIns, totalDel, paragraphCount: paragraphs.length },
    };
  });

  // Fallback: if the doc had no tracked changes at all, still return a single
  // redline so the caller's error path can fire.
  if (redlines.length === 0) {
    redlines.push({
      id: `RL-UPL-${batchId.slice(6)}-01`,
      vendor: author,
      docx: fileName,
      category: 'Confidentiality',
      sectionNumber: '—',
      title: `Redline · ${fileName}`,
      received: dateStr,
      urgent: false,
      intent: 'No changes detected',
      desiredSeverity: 'Standard',
      preferredId: null,
      matchKeywords: [],
      segments: [{ op:'keep', text:'(no tracked changes detected)' }],
      vendorComment: 'No tracked changes were found in this document.',
      summary: 'No tracked changes.',
      uploaded: true,
      stats: { totalIns: 0, totalDel: 0, paragraphCount: paragraphs.length },
      batchId, batchOrdinal: 1, batchSize: 1,
      batchTotals: { totalIns, totalDel, paragraphCount: paragraphs.length },
    });
  }

  // Return both shapes: `.redlines` (the array — what Negotiate now uses) and
  // `.redline` (the first, for any older caller).
  return {
    redline: redlines[0],
    redlines,
    paragraphs,
    batch: { id: batchId, fileName, totalIns, totalDel, paragraphCount: paragraphs.length, count: redlines.length, author, dateStr },
  };
}

window.buildDocx = buildDocx;
window.parseRedlineDocx = parseRedlineDocx;
