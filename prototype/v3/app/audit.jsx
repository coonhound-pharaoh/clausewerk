// V3 — Audit Log (table + timeline) & Review Queue (pending human edits)

function AuditLogPanel({ auditLog, tweaks }) {
  const [view, setView] = useState('table');
  const [filter, setFilter] = useState('all');
  const rows = useMemo(() => {
    if (filter === 'all') return auditLog;
    return auditLog.filter(r => r.actor === filter);
  }, [auditLog, filter]);

  function exportCsv() {
    const header = 'ts,actor,type,vendor,redline,clause_id,pending_id,score\n';
    const body = auditLog.map(r => [r.ts, r.actor, r.type, r.vendor||'', r.redline||'', r.clause_id||'', r.pending_id||'', r.score||''].join(',')).join('\n');
    const blob = new Blob([header+body], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='audit_log.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Audit · audit_log.db</div>
          <h2 className="display-sm mt-2">Audit log <span style={{color:'var(--mute)', fontStyle:'italic', fontSize:22}}>/ chain of custody</span></h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>Every AI suggestion and human decision, logged locally. {auditLog.length} entries.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex" style={{border:'1px solid var(--line-2)'}}>
            <button onClick={() => setView('table')} className="px-3 py-1.5 text-[11px] font-mono"
                    style={view==='table'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>table</button>
            <button onClick={() => setView('timeline')} className="px-3 py-1.5 text-[11px] font-mono"
                    style={view==='timeline'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>timeline</button>
          </div>
          <button onClick={exportCsv} className="btn">↓ export csv</button>
        </div>
      </div>

      <div className="px-8 py-3 border-b hair flex items-center gap-3" style={{background:'var(--surface)'}}>
        <span className="section-label">Filter</span>
        {['all','controller','human'].map(k => (
          <button key={k} onClick={() => setFilter(k)}
                  className="px-3 py-1 text-[11px] font-mono"
                  style={filter===k?{background:'var(--surface-2)', color:'var(--ink)', border:'1px solid var(--line-2)'}
                                    :{color:'var(--mute)', border:'1px solid transparent'}}>{k}</button>
        ))}
        <div className="ml-auto font-mono text-[11px]" style={{color:'var(--mute-2)'}}>{rows.length} rows</div>
      </div>

      {view === 'table' ? (
        <div className="flex-1 overflow-y-auto">
          <div className={`grid ${tweaks.density==='compact'?'text-[11px]':'text-[12px]'} gap-3 px-8 py-3 border-b hair section-label sticky top-0`}
               style={{background:'var(--bg)', gridTemplateColumns:'180px 110px 160px 160px 120px 80px 1fr'}}>
            <div>Timestamp</div><div>Actor</div><div>Type</div><div>Vendor</div><div>Redline</div><div>Score</div><div>Artifact</div>
          </div>
          <div className="zebra">
            {rows.length === 0 && <div className="text-center py-16 text-[13px]" style={{color:'var(--mute)'}}>Audit log empty — run a negotiation or demo.</div>}
            {rows.map((r, i) => (
              <div key={i} className={`grid ${tweaks.density==='compact'?'py-1.5 text-[11px]':'py-2.5 text-[12px]'} gap-3 px-8 border-b hair items-center`}
                   style={{gridTemplateColumns:'180px 110px 160px 160px 120px 80px 1fr'}}>
                <div className="font-mono tabnum" style={{color:'var(--mute)'}}>{new Date(r.ts).toLocaleString()}</div>
                <div><span className="chip" style={r.actor==='controller'?{color:'var(--accent)',borderColor:'var(--accent)'}:{}}>{r.actor}</span></div>
                <div className="font-mono">{r.type}</div>
                <div>{r.vendor||'—'}</div>
                <div className="font-mono" style={{color:'var(--mute)'}}>{r.redline||'—'}</div>
                <div className="font-mono tabnum">{r.score?r.score.toFixed(3):'—'}</div>
                <div className="font-mono" style={{color:'var(--mute)'}}>{r.clause_id || r.pending_id || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            {rows.length === 0 && <div className="text-center text-[13px]" style={{color:'var(--mute)'}}>Nothing yet.</div>}
            {rows.map((r, i) => (
              <div key={i} className="flex gap-4 pb-5 relative">
                <div className="w-24 flex-shrink-0 pt-0.5">
                  <div className="font-mono text-[10px] tabnum" style={{color:'var(--mute)'}}>{new Date(r.ts).toLocaleTimeString()}</div>
                  <div className="font-mono text-[10px]" style={{color:'var(--mute-2)'}}>{new Date(r.ts).toLocaleDateString()}</div>
                </div>
                <div className="relative flex flex-col items-center">
                  <div className="w-2.5 h-2.5 rounded-full" style={{background: r.actor==='controller'?'var(--accent)':'var(--accent-2)', marginTop:4}}></div>
                  {i < rows.length - 1 && <div className="flex-1 w-px mt-1" style={{background:'var(--line-2)'}}></div>}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-medium">{r.type}</span>
                    <span className="chip" style={r.actor==='controller'?{color:'var(--accent)',borderColor:'var(--accent)'}:{}}>{r.actor}</span>
                  </div>
                  <div className="text-[12px]" style={{color:'var(--mute)'}}>
                    {r.vendor ? `${r.vendor} · ` : ''}{r.redline || ''}{r.clause_id ? ` · ${r.clause_id}` : ''}{r.pending_id ? ` · ${r.pending_id}` : ''}
                    {r.score ? ` · similarity ${r.score.toFixed(3)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewQueuePanel({ pendingReview, setPendingReview, setLedger }) {
  const [selected, setSelected] = useState(0);
  const pending = pendingReview.filter(p => p.status === 'pending');
  const cur = pending[selected];

  // Editable proposed text — pre-populate from VENDOR's redlined language
  // (ins segments + surrounding kept context) so Legal works from what the
  // supplier actually wrote, not the AI's would-be substitute.
  const [editedText, setEditedText] = useState('');
  const [textSource, setTextSource] = useState('vendor'); // 'vendor' | 'ai' | 'edited'

  // Reconstruct vendor-accepted prose from segments: keep + ins, drop del.
  function vendorAcceptedFrom(ticket) {
    if (!ticket?.segments?.length) return '';
    return ticket.segments
      .filter(s => s.op === 'keep' || s.op === 'ins')
      .map(s => s.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  useEffect(() => {
    if (!cur) return;
    const vendorText = vendorAcceptedFrom(cur);
    if (vendorText) {
      setEditedText(vendorText);
      setTextSource('vendor');
    } else if (cur.aiCandidate?.text) {
      setEditedText(cur.aiCandidate.text);
      setTextSource('ai');
    } else {
      setEditedText(cur.text || '');
      setTextSource('vendor');
    }
  }, [cur?.id]);

  // Confirmation modal state for verify
  const [confirmVerify, setConfirmVerify] = useState(false);

  // Optional rejection note — captured before reject so the buyer sees rationale
  const [rejectNote, setRejectNote] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  useEffect(() => { setRejectMode(false); setRejectNote(''); }, [cur?.id]);

  function verify() {
    if (!cur) return;
    // Promote into ledger with full V3 metadata
    const today = new Date().toISOString().slice(0,10);
    const newEntry = {
      id: cur.id.replace(/PEND|ESC/, String(Math.floor(Math.random()*900)+100)),
      cat: cur.cat,
      sev: cur.sev,
      title: cur.title.replace(/^(Human-edited|Escalated) · /,''),
      text: editedText || cur.text,
      rationale: `Derived from vendor-accepted language (${cur.sourceVendor}). Verified by Legal on ${today}.`,
      citations: [`Policy-DERIVED-${cur.id}`],
      created: today,
      expires: new Date(Date.now()+730*24*3600*1000).toISOString().slice(0,10),
      reviewer: 'M. Ostrowski · Legal',
      active: true,
      daysToExpiry: 730, expiresSoon: false, expired: false,
      vectorBuckets: [{ scope:`Derived · ${cur.sourceVendor}`, score:0.88 }],
    };
    setLedger(prev => [...prev, newEntry]);
    setPendingReview(prev => prev.map(p => p.id === cur.id ? {
      ...p,
      status: 'verified',
      verifiedId: newEntry.id,
      verifiedText: newEntry.text,
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'M. Ostrowski · Legal',
      buyerNotified: false, // shows in Negotiate inbox until dismissed
    } : p));
    setSelected(0);
  }
  function reject() {
    if (!rejectMode) { setRejectMode(true); return; }
    setPendingReview(prev => prev.map(p => p.id === cur.id ? {
      ...p,
      status: 'rejected',
      rejectionNote: rejectNote.trim() || 'Rejected without note.',
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'M. Ostrowski · Legal',
      buyerNotified: false,
    } : p));
    setRejectMode(false); setRejectNote('');
    setSelected(0);
  }

  function reasonBadge(p) {
    if (p.reason === 'no-ai-match') return { label:'NO AI MATCH', detail:'Controller found no clause above similarity threshold. Legal must draft from the vendor source.' };
    if (p.reason === 'human-escalated') return { label:'HUMAN OVERRIDE', detail: p.proposedFromId ? `Reviewer rejected ${p.proposedFromId} (similarity ${p.similarityScore?.toFixed(3)}) and escalated.` : 'Reviewer escalated for manual handling.' };
    if (p.reason === 'human-edit') return { label:'HUMAN EDIT', detail:'Reviewer accepted the AI suggestion as a starting point but edited the text. Requires Legal sign-off.' };
    return { label:'PENDING', detail:'Awaiting Legal review.' };
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Feedback loop · Legal review</div>
          <h2 className="display-sm mt-2">Review queue</h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>{pending.length} pending. Each ticket carries the original redline, the AI candidate, and the proposed text.</div>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="section-label mb-3">Empty queue</div>
            <h3 className="display-sm mb-3">Nothing to verify.</h3>
            <p className="text-[13px]" style={{color:'var(--mute)'}}>When a Negotiate session is escalated or a reviewer edits the AI suggestion, the ticket files here for Legal sign-off.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Queue list */}
          <div className="w-[300px] border-r hair overflow-y-auto" style={{background:'var(--surface)'}}>
            {pending.map((p, i) => {
              const r = reasonBadge(p);
              return (
                <button key={p.id} onClick={() => setSelected(i)}
                        className="w-full text-left p-4 border-b hair"
                        style={selected===i?{background:'var(--surface-2)', borderLeft:'2px solid var(--accent-2)'}:{borderLeft:'2px solid transparent'}}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px]" style={{color:'var(--accent-2)'}}>{p.id}</span>
                    <span className="chip chip-std">{p.sev}</span>
                  </div>
                  <div className="text-[13px] mb-1.5 leading-snug">{p.title}</div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-mono text-[8px] px-1 py-0.5 tracking-wider" style={{background:'var(--bg)', color:'var(--mute)', border:'1px solid var(--line-2)'}}>{r.label}</span>
                    {p.uploaded && <span className="font-mono text-[8px] px-1 py-0.5 tracking-wider" style={{background:'color-mix(in oklch, var(--accent-2), transparent 80%)', color:'var(--accent-2)'}}>UPLOADED</span>}
                  </div>
                  <div className="text-[10px] font-mono" style={{color:'var(--mute-2)'}}>{p.sourceVendor} · {new Date(p.submittedAt).toLocaleDateString()}</div>
                </button>
              );
            })}
          </div>

          {/* Detail — split: redline (left) + AI candidate + proposed text (right) */}
          {cur && (
            <div className="flex-1 flex overflow-hidden">
              {/* LEFT: original redlined paragraph */}
              <div className="flex-1 overflow-y-auto p-8" style={{background:'var(--bg)'}}>
                <div className="max-w-[640px] mx-auto">
                  <div className="flex items-baseline justify-between pb-4 border-b hair mb-5">
                    <div>
                      <div className="section-label">Original redline</div>
                      <div className="font-mono text-[11px] mt-1" style={{color:'var(--mute-2)'}}>{cur.docxName || '—'}</div>
                    </div>
                    <span className="chip chip-high">{cur.cat}</span>
                  </div>

                  {cur.segments && cur.segments.length > 0 ? (
                    <div className="paper p-10" style={{color:'#1A1714'}}>
                      <div className="small-caps text-[10px] mb-4" style={{color:'#78706A'}}>§ {cur.sectionNumber || '—'} · {cur.cat}</div>
                      <div className="font-serif text-[15px] leading-[1.8]">
                        {cur.segments.map((seg, i) => {
                          if (seg.op === 'del') return <del key={i} style={{background:'#F8D7DA', color:'#842029', textDecoration:'line-through', padding:'1px 3px'}}>{seg.text}</del>;
                          if (seg.op === 'ins') return <ins key={i} style={{background:'#D1E7DD', color:'#0F5132', textDecoration:'none', padding:'1px 3px'}}>{seg.text}</ins>;
                          return <span key={i}>{seg.text}</span>;
                        })}
                      </div>
                      {cur.vendorComment && (
                        <div className="mt-6 pt-4 border-t" style={{borderColor:'rgba(26,23,20,.15)'}}>
                          <div className="font-mono text-[10px] mb-2" style={{color:'#78706A'}}>Vendor comment · counsel</div>
                          <div className="font-serif italic text-[13px]" style={{color:'#4A4540'}}>“{cur.vendorComment}”</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="paper p-8 text-center" style={{color:'#4A4540'}}>
                      <div className="font-serif italic text-[14px]">No redline diff captured for this ticket.</div>
                      <div className="font-mono text-[10px] mt-2">{cur.vendorIntent || '—'}</div>
                    </div>
                  )}

                  {cur.stats && (
                    <div className="mt-4 flex items-center gap-4 text-[11px] font-mono" style={{color:'var(--mute-2)'}}>
                      <span>tracked: +{cur.stats.totalIns} / −{cur.stats.totalDel}</span>
                      <span>across {cur.stats.paragraphCount} paragraphs</span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: ticket meta + AI candidate + proposed text editor */}
              <div className="w-[480px] border-l hair flex flex-col" style={{background:'var(--surface)'}}>
                <div className="px-5 py-3 border-b hair flex items-center justify-between">
                  <div className="section-label">Pending ticket</div>
                  <span className="text-[10px] font-mono" style={{color:'var(--mute-2)'}}>{cur.id}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Reason banner */}
                  <div className="p-3 flex items-start gap-3" style={{background:'color-mix(in oklch, var(--accent-2), transparent 88%)', border:'1px solid color-mix(in oklch, var(--accent-2), transparent 60%)'}}>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 tracking-wider mt-0.5" style={{background:'var(--accent-2)', color:'var(--bg)'}}>
                      {reasonBadge(cur).label}
                    </span>
                    <div className="text-[12px] leading-relaxed">{reasonBadge(cur).detail}</div>
                  </div>

                  {/* Source meta */}
                  <div>
                    <div className="section-label mb-2">Source</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="caption">Submitted by</span><div>{cur.submittedBy}</div></div>
                      <div><span className="caption">When</span><div className="font-mono tabnum">{new Date(cur.submittedAt).toLocaleString()}</div></div>
                      <div><span className="caption">Vendor</span><div>{cur.sourceVendor}</div></div>
                      <div><span className="caption">Redline ID</span><div className="font-mono">{cur.sourceRedline}</div></div>
                    </div>
                  </div>

                  {/* AI candidate */}
                  {cur.aiCandidate ? (
                    <div style={{border:'1px solid var(--line-2)'}}>
                      <div className="px-3 py-2 border-b hair flex items-center justify-between" style={{background:'var(--surface-2)'}}>
                        <div className="section-label">AI candidate</div>
                        <span className="font-mono text-[10px] tabnum" style={{color:'var(--mute)'}}>sim {cur.aiCandidate.score?.toFixed(3)}</span>
                      </div>
                      <div className="px-3 py-3">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="font-mono text-[16px]" style={{color:'var(--accent)'}}>{cur.aiCandidate.id}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`chip ${cur.aiCandidate.sev==='High'?'chip-high':'chip-std'}`}>{cur.aiCandidate.sev}</span>
                            {cur.aiCandidate.active && <span className="chip chip-ok">Active</span>}
                          </div>
                        </div>
                        <div className="text-[12px] mb-3" style={{color:'var(--mute)'}}>{cur.aiCandidate.title}</div>
                        {cur.aiCandidate.rationale && (
                          <div className="font-serif italic text-[13px] leading-relaxed mb-2" style={{color:'var(--ink)'}}>
                            <span style={{color:'var(--accent)'}}>“</span>{cur.aiCandidate.rationale}<span style={{color:'var(--accent)'}}>”</span>
                          </div>
                        )}
                        {cur.aiCandidate.citations && cur.aiCandidate.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cur.aiCandidate.citations.map(c => (
                              <span key={c} className="font-mono text-[9px] px-1.5 py-0.5" style={{border:'1px solid var(--line-2)', color:'var(--mute)'}}>{c}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3" style={{border:'1px solid color-mix(in oklch, var(--danger), transparent 60%)', background:'color-mix(in oklch, var(--danger), transparent 92%)'}}>
                      <div className="section-label mb-1" style={{color:'var(--danger)'}}>No AI candidate</div>
                      <div className="text-[12px] leading-relaxed">The controller returned no clause above threshold. Draft new language below.</div>
                    </div>
                  )}

                  {/* Alternates */}
                  {cur.alternates && cur.alternates.length > 0 && (
                    <div>
                      <div className="caption mb-1.5">Alternate candidates</div>
                      <div className="space-y-1">
                        {cur.alternates.map(a => (
                          <div key={a.id} className="flex items-center justify-between text-[11px]">
                            <span className="font-mono">{a.id}</span>
                            <span style={{color:'var(--mute)'}}>{a.title}</span>
                            <span className="font-mono tabnum" style={{color:'var(--mute)'}}>{a.score?.toFixed(3)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Proposed text — editable, pre-loaded from vendor */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="section-label">Proposed text · for the library</div>
                      <div className="flex items-center gap-1">
                        {textSource === 'vendor' && <span className="font-mono text-[9px] px-1.5 py-0.5" style={{background:'#D1E7DD', color:'#0F5132'}}>VENDOR LANGUAGE</span>}
                        {textSource === 'ai' && <span className="font-mono text-[9px] px-1.5 py-0.5" style={{background:'color-mix(in oklch, var(--accent), transparent 80%)', color:'var(--accent)'}}>AI CANDIDATE</span>}
                        {textSource === 'edited' && <span className="font-mono text-[9px] px-1.5 py-0.5" style={{background:'color-mix(in oklch, var(--accent-2), transparent 80%)', color:'var(--accent-2)'}}>EDITED BY LEGAL</span>}
                      </div>
                    </div>

                    {/* Source toggle — pull vendor's language vs AI candidate */}
                    <div className="flex items-center gap-1 mb-2 text-[10px]">
                      <span className="font-mono" style={{color:'var(--mute-2)'}}>load from:</span>
                      <button
                        onClick={() => { setEditedText(vendorAcceptedFrom(cur)); setTextSource('vendor'); }}
                        disabled={!cur.segments || cur.segments.length === 0}
                        className="px-2 py-0.5 font-mono text-[10px]"
                        style={{
                          background: textSource==='vendor' ? 'var(--ink)' : 'transparent',
                          color: textSource==='vendor' ? 'var(--bg)' : 'var(--mute)',
                          border:'1px solid var(--line-2)',
                          opacity: (!cur.segments || cur.segments.length === 0) ? .35 : 1,
                          cursor: (!cur.segments || cur.segments.length === 0) ? 'not-allowed' : 'pointer',
                        }}
                      >vendor redline</button>
                      <button
                        onClick={() => { setEditedText(cur.aiCandidate?.text || cur.text || ''); setTextSource('ai'); }}
                        disabled={!cur.aiCandidate}
                        className="px-2 py-0.5 font-mono text-[10px]"
                        style={{
                          background: textSource==='ai' ? 'var(--ink)' : 'transparent',
                          color: textSource==='ai' ? 'var(--bg)' : 'var(--mute)',
                          border:'1px solid var(--line-2)',
                          opacity: !cur.aiCandidate ? .35 : 1,
                          cursor: !cur.aiCandidate ? 'not-allowed' : 'pointer',
                        }}
                      >ai candidate</button>
                    </div>

                    <textarea
                      value={editedText}
                      onChange={e => { setEditedText(e.target.value); setTextSource('edited'); }}
                      rows={10}
                      placeholder="Draft the verified clause text…"
                      className="w-full px-3 py-2 text-[13px] font-serif leading-relaxed"
                      style={{background:'var(--bg)', border:'1px solid var(--line-2)', color:'var(--ink)', resize:'vertical'}}
                    />
                    <div className="text-[10px] mt-1 font-mono" style={{color:'var(--mute-2)'}}>
                      {editedText.length} chars · {textSource === 'vendor' ? 'as vendor proposed' : textSource === 'ai' ? 'AI suggested template' : 'edited by legal'} · verifying promotes this exact text into the vector library
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t hair" style={{background:'var(--surface-2)'}}>
                  {rejectMode ? (
                    <div>
                      <div className="section-label mb-2">Rejection note · sent back to buyer</div>
                      <textarea
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Why is this being rejected? (e.g. 'Too narrow — buyer should accept the existing INDEM-002 with no changes.')"
                        className="w-full px-3 py-2 text-[12px] mb-2"
                        style={{background:'var(--bg)', border:'1px solid var(--line-2)', color:'var(--ink)', resize:'vertical'}}
                      />
                      <div className="flex gap-2">
                        <button onClick={reject} className="btn flex-1" style={{borderColor:'var(--danger)', color:'var(--danger)'}}>✕ confirm reject &amp; notify buyer</button>
                        <button onClick={() => { setRejectMode(false); setRejectNote(''); }} className="btn">cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmVerify(true)} disabled={!editedText.trim()} className="btn btn-primary flex-1"
                              style={{opacity: !editedText.trim() ? .4 : 1}}>
                        ✓ verify · add to library &amp; notify buyer
                      </button>
                      <button onClick={() => setRejectMode(true)} className="btn">✕ reject…</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Verify confirmation modal */}
      {confirmVerify && cur && (
        <div className="absolute inset-0 z-50 flex items-center justify-center"
             style={{background:'color-mix(in oklch, var(--bg), transparent 25%)', backdropFilter:'blur(2px)'}}>
          <div className="max-w-xl w-full mx-6" style={{background:'var(--surface)', border:'1px solid var(--line-2)', boxShadow:'0 20px 60px rgba(0,0,0,.45)'}}>
            <div className="px-6 py-5 border-b hair">
              <div className="section-label" style={{color:'var(--accent-2)'}}>Confirm · promote to library</div>
              <h3 className="display-sm mt-2">Add this clause to the vector library?</h3>
              <p className="text-[13px] mt-2" style={{color:'var(--mute)'}}>
                Once verified, <span className="font-mono" style={{color:'var(--ink)'}}>{cur.id}</span> becomes the canonical record. Future contracts in <span style={{color:'var(--ink)'}}>{cur.cat}</span> may receive this text. The buyer (<span style={{color:'var(--ink)'}}>{cur.submittedBy?.split('·')[0]?.trim() || 'buyer'}</span>) will be notified.
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <div className="section-label mb-2">What goes in</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                  <div style={{color:'var(--mute-2)'}}>Source</div>
                  <div className="font-mono">
                    {textSource === 'vendor' && <span style={{color:'#4FB28A'}}>vendor redline</span>}
                    {textSource === 'ai' && <span style={{color:'var(--accent)'}}>AI candidate ({cur.aiCandidate?.id})</span>}
                    {textSource === 'edited' && <span style={{color:'var(--accent-2)'}}>legal-edited</span>}
                  </div>
                  <div style={{color:'var(--mute-2)'}}>Category</div>
                  <div>{cur.cat}</div>
                  <div style={{color:'var(--mute-2)'}}>Severity</div>
                  <div>{cur.sev}</div>
                  <div style={{color:'var(--mute-2)'}}>Length</div>
                  <div className="font-mono tabnum">{editedText.length} chars · {editedText.split(/\s+/).filter(Boolean).length} words</div>
                  <div style={{color:'var(--mute-2)'}}>Effective</div>
                  <div className="font-mono tabnum">today · expires {new Date(Date.now()+730*24*3600*1000).toISOString().slice(0,10)}</div>
                  <div style={{color:'var(--mute-2)'}}>Reviewer</div>
                  <div>M. Ostrowski · Legal</div>
                </div>
              </div>

              <div>
                <div className="section-label mb-2">Preview</div>
                <div className="paper p-4 max-h-[160px] overflow-y-auto" style={{color:'#1A1714'}}>
                  <div className="font-serif text-[12.5px] leading-[1.65]">{editedText}</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t hair flex gap-2" style={{background:'var(--surface-2)'}}>
              <button onClick={() => { setConfirmVerify(false); verify(); }} className="btn btn-primary flex-1">
                ✓ confirm · add to library
              </button>
              <button onClick={() => setConfirmVerify(false)} className="btn">cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.AuditLogPanel = AuditLogPanel;
window.ReviewQueuePanel = ReviewQueuePanel;
