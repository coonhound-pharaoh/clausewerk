// V3 — Negotiate panel. Vendor redlines enter as a .docx; AI returns a clause ID;
// Python executor swaps text. Logic-controller separation is visualized.

function NegotiatePanel({ ledger, manifest, decisions, auditLog, setAuditLog, pendingReview, setPendingReview, tweaks }) {
  const [stage, setStage] = useState('inbox'); // inbox | diff | resolved
  const [redline, setRedline] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [expandedRationale, setExpandedRationale] = useState(true);
  const [edited, setEdited] = useState(null);
  const [trace, setTrace] = useState([]);
  const [working, setWorking] = useState(false);
  const [uploadedRedlines, setUploadedRedlines] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const activeLedger = useMemo(() => ledger.filter(c => c.active), [ledger]);

  // Canonical scenarios — canned .docx redlines + any user-uploaded ones
  const inbox = useMemo(() => [...uploadedRedlines, ...NEGOTIATION_SCENARIOS], [uploadedRedlines]);

  // Resolved tickets coming back from Legal — surface to the buyer
  const resolvedTickets = useMemo(
    () => pendingReview.filter(p => p.resolvedAt && !p.buyerArchived),
    [pendingReview]
  );
  function archiveTicket(id) {
    setPendingReview(prev => prev.map(p => p.id === id ? { ...p, buyerArchived: true, buyerNotified: true } : p));
  }
  function markAllSeen() {
    setPendingReview(prev => prev.map(p => p.resolvedAt ? { ...p, buyerNotified: true } : p));
  }

  async function handleUpload(file) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const parsed = await parseRedlineDocx(file);
      // New: parser returns a `.redlines` array — one entry per changed
      // paragraph — plus a `.batch` summary. Older shape only had `.redline`.
      const list = parsed.redlines || (parsed.redline ? [parsed.redline] : []);
      const batchTotal = (parsed.batch?.totalIns || 0) + (parsed.batch?.totalDel || 0);
      if (batchTotal === 0) {
        setUploadError(`No tracked changes found in "${file.name}". Make sure Track Changes was on when the redline was made.`);
        setUploading(false);
        return;
      }
      // Prepend in document order so the first change in the file is the
      // first to appear in the inbox.
      setUploadedRedlines(prev => [...list, ...prev]);
      // Auto-open the FIRST redline from this batch so the controller fires
      // immediately on something the user can see.
      if (list.length > 0) loadRedline(list[0], { autoRun: true });
    } catch (err) {
      console.error(err);
      setUploadError(`Could not parse "${file.name}": ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  function loadRedline(r, opts = {}) {
    setRedline(r);
    setSuggestion(null);
    setEdited(null);
    setTrace([]);
    setStage('diff');
    if (opts.autoRun) {
      // Defer so the stage transition + redline state settle before the
      // controller starts (so trace + UI read the right redline).
      setTimeout(() => runAIControllerFor(r), 60);
    }
  }

  async function runAIController() {
    return runAIControllerFor(redline);
  }

  async function runAIControllerFor(redline) {
    if (!redline) return;
    setWorking(true);
    setTrace([]);
    pushTrace('controller.analyze(redline)');
    await wait(400);
    pushTrace(`  intent = "${redline.intent}"`);
    pushTrace(`  category = "${redline.category}"${redline.uploaded ? ' (inferred from .docx)' : ''}`);
    if (redline.uploaded) {
      pushTrace(`  tracked_changes = +${redline.stats?.totalIns||0} / −${redline.stats?.totalDel||0}`);
      pushTrace(`  keywords = [${(redline.matchKeywords||[]).slice(0,6).join(', ')}${(redline.matchKeywords||[]).length>6?', …':''}]`);
    }
    await wait(350);

    // AI returns ONLY an ID (strictly, no text).
    // Uploaded redlines fall back to searching ALL categories since the
    // parser's category inference is heuristic and may miss.
    const poolByCat = activeLedger.filter(c => c.cat === redline.category);
    let usedPool = poolByCat;
    if (redline.uploaded && poolByCat.length > 0) {
      // Try category first, but also score cross-category as a fallback
      pushTrace(`  vector.search scope = "${redline.category}" (${poolByCat.length} clauses)`);
    } else if (poolByCat.length === 0) {
      usedPool = activeLedger;
      pushTrace(`  ! no clauses in "${redline.category}" — widening to full ledger (${activeLedger.length})`);
    }

    const candidates = usedPool
      .map(c => ({
        c,
        score: scoreMatch(c, redline),
      }))
      .filter(x => x.score >= tweaks.similarityThreshold)
      .sort((a, b) => b.score - a.score);

    // Fallback: if scoped search fails, widen to full ledger before giving up
    if (candidates.length === 0 && redline.uploaded && usedPool !== activeLedger) {
      pushTrace(`  ! no match in category — widening search to full ledger`);
      await wait(300);
      const wide = activeLedger
        .map(c => ({ c, score: scoreMatch(c, redline) }))
        .filter(x => x.score >= tweaks.similarityThreshold)
        .sort((a, b) => b.score - a.score);
      candidates.push(...wide);
    }

    pushTrace(`  vector.search(k=3, threshold=${tweaks.similarityThreshold.toFixed(2)})`);
    await wait(500);
    for (const x of candidates.slice(0, 3)) {
      pushTrace(`    ${x.c.id}  ·  ${x.score.toFixed(3)}`);
    }
    if (candidates.length === 0) {
      pushTrace('  ! no ID above threshold — escalate to Legal');
      setSuggestion({ none: true });
      setWorking(false);
      logAudit({ type:'ai_no_match', redline: redline.id });
      return;
    }
    await wait(300);
    const top = candidates[0];
    pushTrace(`  → select_id("${top.c.id}")`);
    await wait(250);
    pushTrace(`[exec] python_docx.replace(run_id="${redline.id}", clause_id="${top.c.id}")`);
    await wait(350);
    pushTrace(`[exec] fetch_immutable_text("${top.c.id}") → ${top.c.text.length} chars`);
    await wait(250);
    pushTrace(`[exec] ✓ substitution complete`);

    setSuggestion({
      clause: top.c,
      score: top.score,
      alternates: candidates.slice(1, 3).map(x => ({ id: x.c.id, score: x.score, title: x.c.title })),
      autoApprove: tweaks.autoApprove && top.score >= 0.90,
    });
    logAudit({ type:'ai_suggest', redline: redline.id, clause_id: top.c.id, score: top.score });
    setWorking(false);
  }

  function scoreMatch(clause, redline) {
    // Baseline prior — uploaded redlines start lower because we have no
    // curated preferredId, but keyword hits dominate for uploads.
    let s = redline.uploaded ? 0.42 : 0.5;
    if (clause.cat === redline.category) s += redline.uploaded ? 0.18 : 0.25;
    if (clause.sev === redline.desiredSeverity) s += 0.10;

    const textL = clause.text.toLowerCase();
    const titleL = (clause.title || '').toLowerCase();
    let kwHits = 0;
    for (const kw of redline.matchKeywords || []) {
      const k = kw.toLowerCase();
      if (k.length < 4) continue;
      if (textL.includes(k)) { s += redline.uploaded ? 0.06 : 0.04; kwHits++; }
      else if (titleL.includes(k)) { s += 0.03; kwHits++; }
    }
    // Dense keyword overlap → strong signal even without severity match
    if (kwHits >= 3) s += 0.08;

    if (clause.id === redline.preferredId) s = Math.min(0.98, s + 0.15);
    return Math.min(0.98, s);
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function pushTrace(s) { setTrace(prev => [...prev, s]); }

  function logAudit(entry) {
    const rec = {
      ts: new Date().toISOString(),
      actor: entry.type.startsWith('ai_') ? 'controller' : 'human',
      vendor: redline?.vendor || manifest?.vendor || '—',
      ...entry,
    };
    setAuditLog(prev => [...prev, rec]);
  }

  function approve() {
    logAudit({ type:'human_approve', redline: redline.id, clause_id: suggestion.clause.id });
    setStage('resolved');
  }

  function rejectAndEscalate() {
    // Escalating a redline creates a Legal-review ticket so the queue has
    // something to act on. We pass the FULL redline context (segments, vendor
    // comment, AI candidate) so the lawyer sees the same diff the reviewer saw.
    const newId = `${CATEGORY_BY_LABEL[redline.category]?.short || 'XX'}-ESC-${String(Math.floor(Math.random()*900)+100)}`;
    const proposed = suggestion?.clause;
    const ticket = {
      id: newId,
      cat: redline.category,
      sev: redline.desiredSeverity || (proposed?.sev ?? 'Standard'),
      title: `Escalated · ${redline.title}`,
      // Source context — the redlined paragraph itself
      redlineId: redline.id,
      docxName: redline.docx,
      sectionNumber: redline.sectionNumber,
      segments: redline.segments,
      vendorComment: redline.vendorComment,
      vendorIntent: redline.intent,
      uploaded: !!redline.uploaded,
      stats: redline.stats,
      // AI candidate (if any) — verbatim, with rationale
      aiCandidate: proposed ? {
        id: proposed.id,
        title: proposed.title,
        text: proposed.text,
        rationale: proposed.rationale,
        citations: proposed.citations,
        score: suggestion.score,
        sev: proposed.sev,
        active: proposed.active,
      } : null,
      alternates: suggestion?.alternates || [],
      // Proposed text — what Legal will edit. Pre-fills with AI text if any,
      // else a stub so the field is intentionally blank-feeling.
      text: proposed?.text || '',
      sourceRedline: redline.id,
      sourceVendor: redline.vendor,
      proposedFromId: proposed?.id || null,
      similarityScore: suggestion?.score ?? null,
      submittedBy: 'A. Delacroix · Procurement',
      submittedAt: new Date().toISOString(),
      status: 'pending',
      reason: suggestion?.none ? 'no-ai-match' : 'human-escalated',
    };
    setPendingReview(prev => [...prev, ticket]);
    logAudit({
      type: 'human_escalate',
      redline: redline.id,
      clause_id: proposed?.id || null,
      pending_id: newId,
    });
    setEdited(ticket);
    setStage('resolved');
  }

  function submitHumanEdit(text) {
    const newId = `${CATEGORY_BY_LABEL[redline.category]?.short || 'XX'}-PEND-${String(Math.floor(Math.random()*900)+100)}`;
    const proposed = suggestion?.clause;
    const candidate = {
      id: newId,
      cat: redline.category,
      sev: redline.desiredSeverity,
      title: `Human-edited · ${redline.title}`,
      text,
      // Source context — same shape as escalations so Review can render uniformly
      redlineId: redline.id,
      docxName: redline.docx,
      sectionNumber: redline.sectionNumber,
      segments: redline.segments,
      vendorComment: redline.vendorComment,
      vendorIntent: redline.intent,
      uploaded: !!redline.uploaded,
      stats: redline.stats,
      aiCandidate: proposed ? {
        id: proposed.id,
        title: proposed.title,
        text: proposed.text,
        rationale: proposed.rationale,
        citations: proposed.citations,
        score: suggestion.score,
        sev: proposed.sev,
        active: proposed.active,
      } : null,
      alternates: suggestion?.alternates || [],
      sourceRedline: redline.id,
      sourceVendor: redline.vendor,
      proposedFromId: proposed?.id || null,
      similarityScore: suggestion?.score ?? null,
      submittedBy: 'A. Delacroix · Procurement',
      submittedAt: new Date().toISOString(),
      status: 'pending',
      reason: 'human-edit',
    };
    setPendingReview(prev => [...prev, candidate]);
    logAudit({ type:'human_edit_submit', redline: redline.id, pending_id: newId });
    setEdited(candidate);
    setStage('resolved');
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Tier 1.5 · Negotiate</div>
          <h2 className="display-sm mt-2">Negotiate <span style={{color:'var(--mute)', fontStyle:'italic', fontSize:22}}>/ vendor redlines</span></h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>AI points to a vetted clause ID. Python inserts the immutable text. No paraphrasing.</div>
        </div>
        {stage !== 'inbox' && (
          <button onClick={() => { setStage('inbox'); setRedline(null); setSuggestion(null); }} className="btn btn-sm">← inbox</button>
        )}
      </div>

      {stage === 'inbox' && <NegotiateInbox inbox={inbox} onOpen={loadRedline} onUpload={handleUpload} uploading={uploading} uploadError={uploadError} clearError={() => setUploadError(null)} resolvedTickets={resolvedTickets} archiveTicket={archiveTicket} markAllSeen={markAllSeen}/>}
      {stage === 'diff' && redline && (
        <NegotiateDiff
          redline={redline}
          suggestion={suggestion}
          expandedRationale={expandedRationale}
          setExpandedRationale={setExpandedRationale}
          onRun={runAIController}
          onApprove={approve}
          onEscalate={rejectAndEscalate}
          onSubmitEdit={submitHumanEdit}
          working={working}
          trace={trace}
          tweaks={tweaks}
          ledger={activeLedger}
        />
      )}
      {stage === 'resolved' && (
        <NegotiateResolved redline={redline} suggestion={suggestion} edited={edited}
                           onNext={() => { setStage('inbox'); setRedline(null); setSuggestion(null); setEdited(null); }}/>
      )}
    </div>
  );
}

function NegotiateInbox({ inbox, onOpen, onUpload, uploading, uploadError, clearError, resolvedTickets, archiveTicket, markAllSeen }) {
  const fileRef = useRef(null);
  const unseen = (resolvedTickets || []).filter(t => !t.buyerNotified).length;

  // Group uploaded redlines by batchId so 4 changes from one .docx render as
  // one collapsible bundle. Canned scenarios (no batchId) render solo.
  const groups = useMemo(() => {
    const out = [];
    const byBatch = new Map();
    for (const r of inbox) {
      if (r.batchId) {
        if (!byBatch.has(r.batchId)) {
          const g = { kind: 'batch', batchId: r.batchId, docx: r.docx, vendor: r.vendor, received: r.received, totals: r.batchTotals, items: [] };
          byBatch.set(r.batchId, g);
          out.push(g);
        }
        byBatch.get(r.batchId).items.push(r);
      } else {
        out.push({ kind: 'single', item: r });
      }
    }
    return out;
  }, [inbox]);
  const totalChanges = inbox.length;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        {resolvedTickets && resolvedTickets.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="section-label">Returned from Legal · {resolvedTickets.length}</div>
                {unseen > 0 && <span className="font-mono text-[9px] px-1.5 py-0.5 tracking-wider" style={{background:'var(--accent-2)', color:'var(--bg)'}}>{unseen} NEW</span>}
              </div>
              {unseen > 0 && <button onClick={markAllSeen} className="text-[11px] font-mono" style={{color:'var(--mute)'}}>mark all seen</button>}
            </div>
            <div className="space-y-2">
              {resolvedTickets.map(t => {
                const verified = t.status === 'verified';
                return (
                  <div key={t.id} className="p-4 flex items-start gap-4"
                       style={{background:'var(--surface)', border:'1px solid var(--line)', borderLeft: `3px solid ${verified?'var(--ok)':'var(--danger)'}`}}>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 tracking-wider mt-0.5"
                          style={{background: verified?'var(--ok)':'var(--danger)', color:'var(--bg)'}}>
                      {verified ? '✓ VERIFIED' : '✕ REJECTED'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-[11px]" style={{color:'var(--accent-2)'}}>{t.id}</span>
                        <span className="text-[13px]">{t.title.replace(/^(Human-edited|Escalated) · /,'')}</span>
                        {!t.buyerNotified && <span className="font-mono text-[8px] px-1 py-0.5" style={{background:'var(--accent-2)', color:'var(--bg)'}}>NEW</span>}
                      </div>
                      <div className="text-[11px] mb-2 font-mono" style={{color:'var(--mute-2)'}}>
                        {t.sourceVendor} · {t.sourceRedline} · resolved by {t.resolvedBy} · {new Date(t.resolvedAt).toLocaleString()}
                      </div>
                      {verified ? (
                        <div className="text-[12px] leading-relaxed" style={{color:'var(--mute)'}}>
                          Verified text added to the library as <span className="font-mono" style={{color:'var(--accent)'}}>{t.verifiedId}</span>. The next time this category appears in a contract, Forge will source from this clause.
                        </div>
                      ) : (
                        <div>
                          <div className="caption mb-1">Legal note</div>
                          <div className="font-serif italic text-[13px] leading-relaxed" style={{color:'var(--ink)'}}>
                            <span style={{color:'var(--accent)'}}>“</span>{t.rejectionNote}<span style={{color:'var(--accent)'}}>”</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={() => archiveTicket(t.id)} className="text-[14px]" title="Archive" style={{color:'var(--mute-2)'}}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-5">
          <div className="section-label">Inbox · {totalChanges} pending change{totalChanges===1?'':'s'}{groups.filter(g=>g.kind==='batch').length>0?` · ${groups.filter(g=>g.kind==='batch').length} bundle${groups.filter(g=>g.kind==='batch').length===1?'':'s'}`:''}</div>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{display:'none'}}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }}
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="btn btn-primary"
                    style={{opacity: uploading ? .6 : 1}}>
              {uploading ? '◌ parsing tracked changes…' : '↑ upload redlined .docx'}
            </button>
            <div className="text-[11px] font-mono" style={{color:'var(--mute-2)'}}>synced from legal-redlines@sharepoint · 3m ago</div>
          </div>
        </div>

        {uploadError && (
          <div className="p-4 mb-4 flex items-start justify-between" style={{background:'color-mix(in oklch, var(--danger), transparent 88%)', border:'1px solid color-mix(in oklch, var(--danger), transparent 60%)'}}>
            <div>
              <div className="section-label mb-1" style={{color:'var(--danger)'}}>Upload error</div>
              <div className="text-[12px]">{uploadError}</div>
            </div>
            <button onClick={clearError} className="text-[14px]" style={{color:'var(--mute)'}}>×</button>
          </div>
        )}

        <div className="space-y-4">
          {groups.map(g => g.kind === 'single'
            ? <RedlineRow key={g.item.id} r={g.item} onOpen={onOpen}/>
            : <BatchGroup key={g.batchId} group={g} onOpen={onOpen}/>
          )}
        </div>
      </div>
    </div>
  );
}

// One redline row in the inbox
function RedlineRow({ r, onOpen, indent }) {
  return (
    <button onClick={() => onOpen(r)}
            className="w-full text-left p-5 transition-all"
            style={{background:'var(--surface)', border:'1px solid var(--line)', marginLeft: indent ? 24 : 0}}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--line)'; }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-mono text-[11px]" style={{color:'var(--mute-2)'}}>
              {r.batchOrdinal ? `change ${r.batchOrdinal}/${r.batchSize}` : r.docx}
            </span>
            <span className="chip chip-std">{r.category}</span>
            {r.sectionNumber && r.sectionNumber !== '—' && <span className="font-mono text-[10px]" style={{color:'var(--mute-2)'}}>§ {r.sectionNumber}</span>}
            {r.urgent && <span className="chip chip-high">Urgent</span>}
            {r.uploaded && !r.batchOrdinal && <span className="font-mono text-[9px] px-1.5 py-0.5 tracking-wider" style={{background:'color-mix(in oklch, var(--accent-2), transparent 80%)', color:'var(--accent-2)', border:'1px solid color-mix(in oklch, var(--accent-2), transparent 60%)'}}>UPLOADED</span>}
          </div>
          {!indent && <div className="display-sm" style={{fontSize:22}}>{r.vendor}</div>}
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>{r.title}</div>
        </div>
        <div className="text-right">
          {!indent && <><div className="caption">Received</div>
          <div className="font-mono text-[11px] tabnum">{r.received}</div></>}
          {r.stats && (
            <div className="font-mono text-[10px] mt-1" style={{color:'var(--mute-2)'}}>
              +{r.stats.totalIns} / −{r.stats.totalDel}
            </div>
          )}
        </div>
      </div>
      <div className="font-serif italic text-[14px] leading-relaxed" style={{color:'var(--ink)'}}>
        <span style={{color:'var(--accent)'}}>“</span>{r.summary}<span style={{color:'var(--accent)'}}>”</span>
      </div>
    </button>
  );
}

// A bundle of changes from one uploaded .docx
function BatchGroup({ group, onOpen }) {
  const [open, setOpen] = useState(true);
  const totals = group.totals || {};
  return (
    <div style={{border:'1px solid var(--line)', background:'var(--surface)'}}>
      <button onClick={() => setOpen(o => !o)}
              className="w-full text-left p-5 flex items-start justify-between"
              style={{borderBottom: open ? '1px solid var(--line)' : 'none'}}>
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="font-mono text-[9px] px-1.5 py-0.5 tracking-wider" style={{background:'color-mix(in oklch, var(--accent-2), transparent 80%)', color:'var(--accent-2)', border:'1px solid color-mix(in oklch, var(--accent-2), transparent 60%)'}}>UPLOADED · {group.items.length} CHANGE{group.items.length===1?'':'S'}</span>
            <span className="font-mono text-[11px]" style={{color:'var(--mute-2)'}}>{group.docx}</span>
          </div>
          <div className="display-sm" style={{fontSize:22}}>{group.vendor}</div>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>
            {group.items.length} negotiation point{group.items.length===1?'':'s'} · each runs through the controller separately
          </div>
        </div>
        <div className="text-right">
          <div className="caption">Received</div>
          <div className="font-mono text-[11px] tabnum">{group.received}</div>
          <div className="font-mono text-[10px] mt-1" style={{color:'var(--mute-2)'}}>
            total +{totals.totalIns||0} / −{totals.totalDel||0}
          </div>
          <div className="font-mono text-[10px] mt-2" style={{color:'var(--mute)'}}>{open ? '▾ collapse' : '▸ expand'}</div>
        </div>
      </button>
      {open && (
        <div className="p-3 space-y-2">
          {group.items.map(r => <RedlineRow key={r.id} r={r} onOpen={onOpen} indent/>)}
        </div>
      )}
    </div>
  );
}

function NegotiateDiff({ redline, suggestion, expandedRationale, setExpandedRationale, onRun, onApprove, onEscalate, onSubmitEdit, working, trace, tweaks, ledger }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  useEffect(() => {
    if (suggestion?.clause) setEditText(suggestion.clause.text);
  }, [suggestion?.clause?.id]);

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Left: redline doc with diff marks */}
      <div className="flex-1 overflow-y-auto p-8" style={{background:'var(--bg)'}}>
        <div className="max-w-[720px] mx-auto">
          <div className="flex items-baseline justify-between pb-4 border-b hair mb-5">
            <div>
              <div className="section-label">Vendor redline · {redline.docx}</div>
              <div className="display-sm mt-1" style={{fontSize:22}}>{redline.vendor}</div>
            </div>
            <div className="chip chip-high">{redline.category}</div>
          </div>

          <div className="paper p-10" style={{color:'#1A1714'}}>
            <div className="small-caps text-[10px] mb-4" style={{color:'#78706A'}}>§ {redline.sectionNumber} · {redline.category}</div>
            <div className="font-serif text-[15px] leading-[1.8]">
              {redline.segments.map((seg, i) => {
                if (seg.op === 'del') return <del key={i} style={{background:'#F8D7DA', color:'#842029', textDecoration:'line-through', padding:'1px 3px'}}>{seg.text}</del>;
                if (seg.op === 'ins') return <ins key={i} style={{background:'#D1E7DD', color:'#0F5132', textDecoration:'none', padding:'1px 3px'}}>{seg.text}</ins>;
                return <span key={i}>{seg.text}</span>;
              })}
            </div>
            <div className="mt-6 pt-4 border-t" style={{borderColor:'rgba(26,23,20,.15)'}}>
              <div className="font-mono text-[10px] mb-2" style={{color:'#78706A'}}>Vendor comment · counsel</div>
              <div className="font-serif italic text-[13px]" style={{color:'#4A4540'}}>“{redline.vendorComment}”</div>
            </div>
          </div>

          {/* Run controller */}
          <div className="mt-6">
            {!suggestion && (
              <button onClick={onRun} disabled={working} className="btn btn-primary w-full py-3"
                      style={{opacity: working ? .6 : 1, fontSize:13}}>
                {working ? '◌ controller analyzing…' : '▶ run logic controller · return clause ID'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: controller output + rationale + actions */}
      <div className="w-[460px] border-l hair flex flex-col" style={{background:'var(--surface)'}}>
        <div className="px-5 py-3 border-b hair flex items-center justify-between">
          <div className="section-label">Logic controller</div>
          <span className="text-[10px] font-mono" style={{color:'var(--mute-2)'}}>
            {suggestion ? (suggestion.none ? '! no match' : `id returned`) : working ? 'running…' : 'idle'}
          </span>
        </div>

        {/* Trace */}
        {tweaks.showTrace && (
          <div className="border-b hair px-5 py-3" style={{background:'#0A0C10', maxHeight:180, overflowY:'auto'}}>
            <div className="font-mono text-[10px] leading-relaxed">
              {trace.length === 0 && <span style={{color:'var(--mute-2)'}}># controller idle</span>}
              {trace.map((l, i) => (
                <div key={i} style={{
                  color: l.startsWith('[exec]') ? 'var(--accent-2)'
                       : l.startsWith('  →') ? 'var(--accent)'
                       : l.startsWith('  !') ? 'var(--danger)'
                       : l.startsWith('  ') ? 'var(--mute)'
                       : 'var(--ink)'
                }}>{l}</div>
              ))}
              {working && <div className="pulse" style={{color:'var(--accent-2)'}}>█</div>}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!suggestion && !working && (
            <div className="p-6 text-center">
              <div className="text-[13px]" style={{color:'var(--mute)'}}>Run the controller to receive a vetted clause ID.</div>
              <div className="mt-3 text-[11px] font-mono" style={{color:'var(--mute-2)'}}>
                similarity threshold · {tweaks.similarityThreshold.toFixed(2)}<br/>
                strict mode · {tweaks.strictMode ? 'on (Active only)' : 'warn'}
              </div>
            </div>
          )}

          {suggestion?.none && (
            <div className="p-6">
              <div className="chip chip-err mb-3">No ID above threshold</div>
              <div className="text-[13px] leading-relaxed">The controller could not find a vetted clause at or above {tweaks.similarityThreshold.toFixed(2)} similarity. Escalate to Legal for manual drafting — or lower the threshold in Tweaks.</div>
              <div className="mt-4 flex gap-2">
                <button onClick={onEscalate} className="btn btn-primary">→ escalate to legal</button>
              </div>
            </div>
          )}

          {suggestion?.clause && (
            <div className="p-5 space-y-4">
              {/* The ID — big */}
              <div className="p-4" style={{background:'var(--surface-2)'}}>
                <div className="section-label mb-2">Controller returned</div>
                <div className="flex items-baseline justify-between">
                  <div className="font-mono text-[22px]" style={{color:'var(--accent)'}}>{suggestion.clause.id}</div>
                  <div className="text-right">
                    <div className="caption">similarity</div>
                    <div className="font-mono text-[14px] tabnum">{suggestion.score.toFixed(3)}</div>
                  </div>
                </div>
                <div className="text-[13px] mt-2">{suggestion.clause.title}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`chip ${suggestion.clause.sev==='High'?'chip-high':'chip-std'}`}>{suggestion.clause.sev}</span>
                  {suggestion.clause.active ? <span className="chip chip-ok">Active</span> : <span className="chip chip-err">Retired</span>}
                  {suggestion.clause.expiresSoon && <span className="chip chip-high">Expires {suggestion.clause.daysToExpiry}d</span>}
                </div>
              </div>

              {/* Rationale card — expandable */}
              <div style={{border:'1px solid var(--line-2)'}}>
                <button onClick={() => setExpandedRationale(!expandedRationale)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[color:var(--surface-2)]">
                  <div className="section-label">Legal rationale · the "why"</div>
                  <span className="text-[11px] font-mono" style={{color:'var(--mute)'}}>{expandedRationale ? '▾' : '▸'}</span>
                </button>
                {expandedRationale && (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="font-serif italic text-[15px] leading-relaxed" style={{color:'var(--ink)'}}>
                      <span style={{color:'var(--accent)'}}>“</span>{suggestion.clause.rationale}<span style={{color:'var(--accent)'}}>”</span>
                    </div>
                    <div>
                      <div className="caption mb-1">Citations</div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestion.clause.citations.map(c => (
                          <span key={c} className="font-mono text-[10px] px-2 py-0.5" style={{border:'1px solid var(--line-2)', color:'var(--mute)'}}>{c}</span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="caption">Created</span><div className="font-mono tabnum">{suggestion.clause.created}</div></div>
                      <div><span className="caption">Expires</span><div className="font-mono tabnum">{suggestion.clause.expires}</div></div>
                      <div className="col-span-2"><span className="caption">Reviewer</span><div>{suggestion.clause.reviewer}</div></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Immutable text preview */}
              <div>
                <div className="section-label mb-2">Immutable text · fetched by python-docx</div>
                <div className="p-3 font-serif text-[13px] leading-relaxed" style={{background:'var(--surface-2)', maxHeight:160, overflowY:'auto'}}>
                  {suggestion.clause.text}
                </div>
              </div>

              {/* Alternates */}
              {suggestion.alternates.length > 0 && (
                <div>
                  <div className="caption mb-1.5">Alternate candidates</div>
                  <div className="space-y-1">
                    {suggestion.alternates.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-[11px]">
                        <span className="font-mono">{a.id}</span>
                        <span className="text-[11px]" style={{color:'var(--mute)'}}>{a.title}</span>
                        <span className="font-mono tabnum" style={{color:'var(--mute)'}}>{a.score.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Human-edit (optional) */}
              {editing && (
                <div>
                  <div className="caption mb-1">Your edit — will be submitted for Legal review</div>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)}
                            rows={6} className="w-full px-3 py-2 text-[13px] font-serif leading-relaxed"/>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 border-t hair grid grid-cols-3 gap-2">
                {!editing && <button onClick={onApprove} className="btn btn-primary col-span-2">✓ approve · insert</button>}
                {!editing && <button onClick={() => setEditing(true)} className="btn">✎ edit</button>}
                {editing && <button onClick={() => onSubmitEdit(editText)} className="btn btn-primary col-span-2">→ submit for review</button>}
                {editing && <button onClick={() => setEditing(false)} className="btn">cancel</button>}
                <button onClick={onEscalate} className="btn col-span-3" style={{color:'var(--mute)'}}>escalate to legal</button>
              </div>
              {suggestion.autoApprove && !editing && (
                <div className="flex items-center gap-2 text-[11px]" style={{color:'var(--ok)'}}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:'var(--ok)'}}></span>
                  above auto-approve threshold · confirm anyway
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NegotiateResolved({ redline, suggestion, edited, onNext }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <div className="section-label mb-4">Resolved</div>
        <h2 className="display-sm mb-4">{redline.vendor} · redline closed</h2>
        {suggestion?.clause && !edited && (
          <div className="space-y-3">
            <div className="p-5" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
              <div className="caption mb-1">Inserted clause</div>
              <div className="font-mono text-[20px]" style={{color:'var(--accent)'}}>{suggestion.clause.id}</div>
              <div className="text-[13px] mt-2" style={{color:'var(--mute)'}}>{suggestion.clause.title}</div>
            </div>
            <div className="text-[12px]" style={{color:'var(--mute)'}}>Decision logged to audit_log.db · chain of custody intact.</div>
          </div>
        )}
        {edited && (
          <div className="space-y-3">
            <div className="p-5" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
              <div className="caption mb-1">Submitted for Legal review</div>
              <div className="font-mono text-[20px]" style={{color:'var(--accent-2)'}}>{edited.id}</div>
              <div className="text-[13px] mt-2" style={{color:'var(--mute)'}}>Queued in the Review tab. A lawyer must verify before it joins the library.</div>
            </div>
          </div>
        )}
        {!suggestion?.clause && !edited && (
          <div className="space-y-3">
            <div className="p-5" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
              <div className="caption mb-1">Escalated to Legal</div>
              <div className="text-[13px] mt-2" style={{color:'var(--mute)'}}>No vetted ID above threshold. Legal must draft manually.</div>
            </div>
          </div>
        )}
        <button onClick={onNext} className="btn mt-6">← back to inbox</button>
      </div>
    </div>
  );
}

// Canned vendor redline scenarios
const NEGOTIATION_SCENARIOS = [
  {
    id: 'RL-2026-0418',
    vendor: 'Northwind Analytics',
    docx: 'MSA-NW-v3-redline.docx',
    category: 'Data Privacy',
    sectionNumber: '4.2',
    title: 'Soften breach-notification window',
    received: '2026-04-22 14:12',
    urgent: true,
    intent: 'Extend 24h breach notice to 72h',
    desiredSeverity: 'High',
    preferredId: 'DP-H-014',
    matchKeywords: ['breach', 'gdpr', '72 hours', 'controller'],
    segments: [
      { op:'keep', text:'Controller agrees to process Personal Data strictly in accordance with Articles 28–32 GDPR. Licensor shall maintain a Record of Processing Activities, execute a Data Processing Agreement and Standard Contractual Clauses where transfers cross jurisdictional borders, and notify Controller within ' },
      { op:'del', text:'24 hours' },
      { op:'ins', text:'seventy-two (72) hours' },
      { op:'keep', text:' of any Personal Data Breach.' },
    ],
    vendorComment: 'Our cyber-insurance carrier requires a 72h window before counsel is engaged. We cannot commit to 24h. Propose 72h to match GDPR Art. 33 regulatory window.',
    summary: 'Vendor pushes 24h → 72h on breach notification; cites insurer + GDPR Art. 33 parity.',
  },
  {
    id: 'RL-2026-0412',
    vendor: 'Paydrive HCM',
    docx: 'MSA-PD-renewal-redline.docx',
    category: 'Liability Cap',
    sectionNumber: '11.1',
    title: 'Cap indemnity at 1× annual fees',
    received: '2026-04-20 09:41',
    urgent: false,
    intent: 'Tighten liability cap',
    desiredSeverity: 'Standard',
    preferredId: 'LC-S-001',
    matchKeywords: ['twelve', '12 months', 'aggregate', 'fees paid'],
    segments: [
      { op:'keep', text:'Aggregate liability shall not exceed ' },
      { op:'del', text:'two (2) times the annual fees' },
      { op:'ins', text:'the fees paid in the twelve (12) months immediately preceding the claim' },
      { op:'keep', text:'; provided, however, that this cap shall not apply to breaches of confidentiality, data-protection obligations, indemnification obligations, or either party\'s gross negligence or willful misconduct.' },
    ],
    vendorComment: 'Standard market cap is 1× annual fees. Carve-outs unchanged.',
    summary: 'Vendor tightens 2× → 1× annual fees; carve-outs retained.',
  },
  {
    id: 'RL-2026-0409',
    vendor: 'Orchid AI',
    docx: 'MSA-OR-wl-redline.docx',
    category: 'Governing Law',
    sectionNumber: '17.3',
    title: 'Swap to New York law',
    received: '2026-04-18 16:30',
    urgent: false,
    intent: 'Change governing law',
    desiredSeverity: 'Standard',
    preferredId: 'GL-S-048',
    matchKeywords: ['state of delaware', 'new york', 'conflict'],
    segments: [
      { op:'keep', text:'This Agreement shall be governed by and construed in accordance with the laws of the ' },
      { op:'del', text:'State of Delaware' },
      { op:'ins', text:'State of New York' },
      { op:'keep', text:', without regard to its conflict-of-laws principles. The United Nations Convention on Contracts for the International Sale of Goods shall not apply.' },
    ],
    vendorComment: 'Our corporate seat is in New York. We cannot accept Delaware.',
    summary: 'Vendor swaps Delaware → New York governing law (may conflict with dispute seat).',
  },
];

window.NegotiatePanel = NegotiatePanel;
window.NEGOTIATION_SCENARIOS = NEGOTIATION_SCENARIOS;
