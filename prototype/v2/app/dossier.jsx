// R11 — Dossier: audit default + document-as-document
function DossierPanel({ manifest, decisions, dossier, setTab }) {
  const [view, setView] = useState('audit'); // audit is now default
  const [signed, setSigned] = useState({});

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('clausewerk_signed') || '{}');
      setSigned(s);
    } catch(e){}
  }, []);

  function toggleSign(id) {
    const next = { ...signed, [id]: !signed[id] };
    setSigned(next);
    try { localStorage.setItem('clausewerk_signed', JSON.stringify(next)); } catch(e){}
  }

  if (!dossier) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="section-label mb-4">Dossier · empty</div>
          <h1 className="display-sm mb-3">No contract assembled yet.</h1>
          <p className="text-[13px] mb-6" style={{color:'var(--mute)'}}>Run Forge to produce contract.docx and the audit summary.</p>
          <button onClick={() => setTab('forge')} className="btn btn-primary">→ go to forge</button>
        </div>
      </div>
    );
  }

  function download() {
    const blob = new Blob([dossier], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(manifest.vendor || 'contract').replace(/\s+/g,'_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const signedCount = Object.values(signed).filter(Boolean).length;

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Output · {manifest.vendor}</div>
          <h2 className="display-sm mt-2">Dossier</h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>The compliance surface — justifications, selected clauses, and the assembled document.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden" style={{border:'1px solid var(--line-2)'}}>
            <button onClick={() => setView('audit')} className={`px-3 py-1.5 text-[11px] font-mono`}
                    style={view==='audit'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>audit trail</button>
            <button onClick={() => setView('doc')} className={`px-3 py-1.5 text-[11px] font-mono`}
                    style={view==='doc'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>contract.docx</button>
          </div>
          <button onClick={download} className="btn btn-primary">↓ download</button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto p-10" style={{background:'var(--bg)'}}>
          {view === 'audit' ? (
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-12 gap-3 pb-3 border-b hair section-label">
                <div className="col-span-1">Sign</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-1">Sev.</div>
                <div className="col-span-1">Clause</div>
                <div className="col-span-7">Justification ↔ selected clause</div>
              </div>
              {decisions.map((d, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 py-5 border-b hair items-start">
                  <div className="col-span-1">
                    <button onClick={() => toggleSign(d.selected?.id || `row-${i}`)}
                            className="w-5 h-5 flex items-center justify-center" style={{
                              border: `1px solid ${signed[d.selected?.id||`row-${i}`]?'var(--accent)':'var(--line-2)'}`,
                              background: signed[d.selected?.id||`row-${i}`]?'color-mix(in oklch, var(--accent), transparent 70%)':'transparent',
                            }}>
                      {signed[d.selected?.id||`row-${i}`] && <span style={{color:'var(--accent)', fontSize:11}}>✓</span>}
                    </button>
                  </div>
                  <div className="col-span-2 text-[13px] font-medium">{d.risk.category}</div>
                  <div className="col-span-1">
                    <span className={`chip ${d.risk.severity==='High'?'chip-high':'chip-std'}`}>{d.risk.severity}</span>
                  </div>
                  <div className="col-span-1 font-mono text-[11px]" style={{color:'var(--mute)'}}>{d.selected?.id || '—'}</div>
                  <div className="col-span-7 space-y-2">
                    <div className="font-serif italic text-[15px] leading-relaxed" style={{color:'var(--ink)'}}>
                      <span className="font-serif text-[20px]" style={{color:'var(--accent)'}}>“</span>
                      {d.risk.justification || '—'}
                      <span className="font-serif text-[20px]" style={{color:'var(--accent)'}}>”</span>
                    </div>
                    <div className="text-[12px] leading-relaxed pl-4 border-l" style={{borderColor:'var(--line-2)', color:'var(--mute)'}}>
                      {d.selected ? d.selected.text.slice(0,240) + (d.selected.text.length > 240 ? '…' : '')
                                  : <span style={{color:'var(--danger)'}}>No clause available — flagged for Legal.</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-6 pt-4 border-t hair flex items-center justify-between">
                <div className="section-label">Reviewer · {signedCount}/{decisions.length} signed off</div>
                <div className="text-[11px] font-mono" style={{color:'var(--mute)'}}>{new Date().toLocaleDateString()}</div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto paper p-14" style={{color:'#1A1714', position:'relative'}}>
              {/* Page header */}
              <div className="flex items-baseline justify-between mb-1 pb-2 border-b" style={{borderColor:'rgba(26,23,20,.15)'}}>
                <div className="font-mono text-[10px] small-caps" style={{color:'#78706A'}}>Clausewerk · Dossier</div>
                <div className="font-mono text-[10px]" style={{color:'#78706A'}}>Page 1</div>
              </div>
              <div className="text-center mt-10 mb-10 pb-6 border-b" style={{borderColor:'rgba(26,23,20,.18)'}}>
                <div className="small-caps text-[11px]" style={{color:'#78706A'}}>Master Services Agreement</div>
                <div className="font-serif text-[36px] mt-3 leading-tight">{manifest.vendor}</div>
                {manifest.value && <div className="mt-2 text-[13px]" style={{color:'#4A4540'}}>{manifest.value}</div>}
                <div className="font-mono text-[10px] mt-3" style={{color:'#78706A'}}>
                  {new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
                </div>
              </div>

              <div className="space-y-8">
                {decisions.filter(d => d.selected).map((d, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="w-[72px] flex-shrink-0 pt-1 gutter-rule pl-3">
                      <div className="font-mono text-[10px] italic" style={{color:'#78706A'}}>§{i+1}</div>
                      <div className="font-mono text-[10px] mt-1" style={{color:'#78706A'}}>[{d.selected.id}]</div>
                    </div>
                    <div className="flex-1">
                      <div className="small-caps text-[11px] mb-2" style={{color:'#4A4540', letterSpacing:'.14em'}}>
                        § {i+1} · {d.risk.category}
                      </div>
                      <p className={`text-[14px] leading-[1.7] ${i===0?'drop-cap':''}`} style={{color:'#1A1714', fontFamily:"'Instrument Serif', serif", fontSize:15}}>
                        {d.selected.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-14 pt-6 border-t flex items-center justify-between" style={{borderColor:'rgba(26,23,20,.15)'}}>
                <div className="font-mono text-[10px]" style={{color:'#78706A'}}>
                  Assembled by Clausewerk · {decisions.filter(d => d.selected).length} clauses · 0 LLM-authored characters
                </div>
                <div className="font-mono text-[10px]" style={{color:'#78706A'}}>End of document</div>
              </div>
            </div>
          )}
        </div>

        <div className="w-[280px] border-l hair p-6 overflow-y-auto" style={{background:'var(--surface)'}}>
          <div className="section-label mb-3">Outbox</div>
          <div className="space-y-3">
            <OutboxRow file="contract.docx" path="/sites/legal/contracts/outbound/"/>
            <OutboxRow file="audit.xlsx" path="/sites/legal/audit/"/>
            <OutboxRow file="notify legal" path="→ legal-review@company"/>
          </div>
          <div className="mt-6 pt-4 border-t hair">
            <div className="section-label mb-3">Run summary</div>
            <div className="space-y-2 text-[12px]">
              <Row k="Vendor" v={manifest.vendor}/>
              <Row k="Clauses" v={decisions.filter(d=>d.selected).length} mono/>
              <Row k="Conflicts resolved" v={decisions.reduce((a,d)=>a+d.suppressed.length,0)} mono/>
              <Row k="Run ID" v={`run_${Math.random().toString(36).slice(2,8)}`} mono/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutboxRow({ file, path }) {
  return (
    <div className="p-3" style={{background:'var(--surface-2)'}}>
      <div className="flex items-center justify-between mb-1">
        <div className="font-mono text-[12px]">{file}</div>
        <span className="chip chip-ok">posted</span>
      </div>
      <div className="font-mono text-[10px]" style={{color:'var(--mute-2)'}}>{path}</div>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex justify-between">
      <span style={{color:'var(--mute)'}}>{k}</span>
      <span className={mono ? 'font-mono tabnum' : ''}>{v}</span>
    </div>
  );
}

window.DossierPanel = DossierPanel;
