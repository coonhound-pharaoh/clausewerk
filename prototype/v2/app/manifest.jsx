// R8 — Manifest panel with serif hero, editorial metadata
function ManifestPanel({ manifest, setManifest, setTab, setPhase }) {
  const [mode, setMode] = useState('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');

  useEffect(() => {
    if (manifest) setJsonText(JSON.stringify(manifest, null, 2));
  }, [manifest]);

  if (!manifest) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="section-label mb-4">Manifest · empty</div>
          <h1 className="display-sm mb-3">Nothing to validate yet.</h1>
          <p className="text-[13px] mb-6" style={{color:'var(--mute)'}}>Run through the Intake first — once the interview is complete, the manifest will appear here for review.</p>
          <button onClick={() => setTab('intake')} className="btn btn-primary">← go to intake</button>
        </div>
      </div>
    );
  }

  function updateRisk(i, patch) {
    const risks = manifest.risks.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    setManifest({ ...manifest, risks });
  }
  function removeRisk(i) { setManifest({ ...manifest, risks: manifest.risks.filter((_, idx) => idx !== i) }); }
  function addRisk() { setManifest({ ...manifest, risks: [...manifest.risks, { category: 'Data Privacy', severity: 'Standard', justification: '' }] }); }
  function applyJson() {
    try { setManifest(JSON.parse(jsonText)); setJsonError(''); setMode('form'); }
    catch (e) { setJsonError(e.message); }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Validated payload</div>
          <h2 className="display-sm mt-2">Manifest</h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>A strict JSON handshake between Intake and Forge.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden" style={{border:'1px solid var(--line-2)'}}>
            <button onClick={() => setMode('form')} className={`px-3 py-1.5 text-[11px] font-mono`}
                    style={mode==='form'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>form</button>
            <button onClick={() => setMode('json')} className={`px-3 py-1.5 text-[11px] font-mono`}
                    style={mode==='json'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>json</button>
          </div>
          <button onClick={() => setTab('forge')} className="btn btn-primary">send to forge →</button>
        </div>
      </div>

      {/* Distribution strip */}
      <div className="px-8 py-4 border-b hair" style={{background:'var(--surface)'}}>
        <div className="flex items-center justify-between mb-2">
          <div className="section-label">Distribution</div>
          <div className="text-[11px] font-mono" style={{color:'var(--mute)'}}>
            {manifest.risks.filter(r=>r.severity==='High').length} High · {manifest.risks.filter(r=>r.severity==='Standard').length} Standard
          </div>
        </div>
        <div className="flex items-center gap-1">
          {manifest.risks.map((r, i) => (
            <div key={i} className="flex-1 flex items-center justify-center text-[10px] font-mono" style={{
              height:32,
              background: r.severity === 'High' ? 'color-mix(in oklch, var(--accent), transparent 75%)' : 'var(--surface-2)',
              color: r.severity === 'High' ? 'var(--accent)' : 'var(--mute)',
              border: r.severity === 'High' ? '1px solid color-mix(in oklch, var(--accent), transparent 55%)' : '1px solid var(--line)',
              fontWeight: r.severity === 'High' ? 600 : 400,
            }}>
              {CATEGORY_BY_LABEL[r.category]?.short || '··'}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="w-[260px] border-r hair p-6 overflow-y-auto" style={{background:'var(--surface)'}}>
          <div className="space-y-5">
            <div>
              <div className="section-label mb-1">Vendor</div>
              <input className="w-full px-2 py-1.5 text-[13px]" value={manifest.vendor || ''}
                     onChange={e => setManifest({ ...manifest, vendor: e.target.value })}/>
            </div>
            <div>
              <div className="section-label mb-1">Value</div>
              <input className="w-full px-2 py-1.5 text-[13px]" value={manifest.value || ''}
                     onChange={e => setManifest({ ...manifest, value: e.target.value })}/>
            </div>
            <div>
              <div className="section-label mb-1">Source</div>
              <div className="flex items-center gap-2">
                <span className={`chip ${manifest.source === 'llm' ? 'chip-high' : 'chip-std'}`}>{manifest.source || 'unknown'}</span>
                <span className="font-mono text-[11px]" style={{color:'var(--mute)'}}>{manifest.risks.length} risks</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'form' ? (
            <div className="space-y-2">
              {manifest.risks.map((r, i) => (
                <div key={i} className="p-3 flex gap-3" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
                  <div className="font-mono text-[10px] pt-2 w-6" style={{color:'var(--mute-2)'}}>{String(i+1).padStart(2,'0')}</div>
                  <div className="flex-1 grid grid-cols-12 gap-2 items-start">
                    <select className="col-span-4 px-2 py-1.5 text-[13px]" value={r.category}
                            onChange={e => updateRisk(i, { category: e.target.value })}>
                      {CATEGORIES.map(c => <option key={c.key} value={c.label}>{c.label}</option>)}
                    </select>
                    <select className="col-span-2 px-2 py-1.5 text-[13px]" value={r.severity}
                            onChange={e => updateRisk(i, { severity: e.target.value })}>
                      <option value="Standard">Standard</option>
                      <option value="High">High</option>
                    </select>
                    <input className="col-span-5 px-2 py-1.5 text-[13px]" value={r.justification}
                           placeholder="Justification…"
                           onChange={e => updateRisk(i, { justification: e.target.value })}/>
                    <button onClick={() => removeRisk(i)} className="col-span-1 text-[13px]" style={{color:'var(--mute-2)'}}>✕</button>
                  </div>
                </div>
              ))}
              <button onClick={addRisk} className="btn w-full justify-center mt-2">+ add risk</button>
            </div>
          ) : (
            <div>
              <textarea value={jsonText} onChange={e => setJsonText(e.target.value)}
                        className="w-full h-[420px] font-mono text-xs p-3 leading-relaxed" spellCheck={false}/>
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs" style={{color: jsonError ? 'var(--danger)' : 'var(--mute)'}}>
                  {jsonError || 'Strict JSON — schema enforced before handoff to Forge.'}
                </div>
                <button onClick={applyJson} className="btn">apply</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.ManifestPanel = ManifestPanel;
