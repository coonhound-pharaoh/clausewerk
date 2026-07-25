// R9 + V3 — Ledger/Vault with temporal tagging, Active flag, kill-switch
function LedgerPanel({ ledger, setLedger, tweaks }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const activeCount = ledger.filter(c => c.active).length;
  const expiringCount = ledger.filter(c => c.expiresSoon).length;
  const retiredCount = ledger.filter(c => !c.active).length;

  const filtered = ledger.filter(c => {
    if (!showInactive && !c.active) return false;
    if (filter !== 'all' && c.cat !== filter) return false;
    if (query && !(c.id.toLowerCase().includes(query.toLowerCase()) ||
                   c.title.toLowerCase().includes(query.toLowerCase()) ||
                   c.text.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  function toggleActive(id) {
    setLedger(ledger.map(c => c.id === id ? { ...c, active: !c.active, retiredReason: c.active ? 'Admin kill-switch' : null } : c));
  }

  const counts = useMemo(() => {
    const m = {};
    for (const c of ledger) m[c.cat] = (m[c.cat] || 0) + 1;
    return m;
  }, [ledger]);

  // Coverage gaps: every category × severity cell
  const gaps = useMemo(() => {
    const out = [];
    for (const cat of CATEGORIES) {
      for (const sev of ['Standard','High']) {
        const hit = ledger.find(c => c.cat === cat.label && c.sev === sev);
        if (!hit) out.push({ category: cat.label, severity: sev });
      }
    }
    return out;
  }, [ledger]);

  function saveClause(clause) {
    if (editing && !adding) setLedger(ledger.map(c => c.id === editing.id ? clause : c));
    else setLedger([...ledger, clause]);
    setEditing(null); setAdding(false);
  }
  function deleteClause(id) {
    if (!confirm(`Delete ${id}?`)) return;
    setLedger(ledger.filter(c => c.id !== id));
  }
  function fillGap(g) {
    const short = CATEGORY_BY_LABEL[g.category]?.short || 'XX';
    const num = String(Math.floor(Math.random()*900)+100).padStart(3,'0');
    const id = `${short}-${g.severity === 'High' ? 'H' : 'S'}-${num}`;
    setAdding(true); setEditing({ id, cat: g.category, sev: g.severity, title:'', text:'' });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Tier 2 · Ledger</div>
          <h2 className="display-sm mt-2">Ledger <span style={{color:'var(--mute)', fontStyle:'italic', fontSize:22}}>/ the Vault</span></h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>{ledger.length} pre-approved clauses · maintained by Legal · synced from SharePoint</div>
        </div>
        <button onClick={() => { setAdding(true); setEditing({ id:'', cat:'Data Privacy', sev:'Standard', title:'', text:'' }); }}
                className="btn btn-primary">+ new clause</button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-5 border-b hair" style={{background:'var(--surface)'}}>
        <StatTile label="Active" value={activeCount} ok/>
        <StatTile label="Expiring ≤90d" value={expiringCount} warn={expiringCount>0}/>
        <StatTile label="Retired" value={retiredCount}/>
        <StatTile label="Categories" value={CATEGORIES.length}/>
        <StatTile label="Coverage gaps" value={gaps.length} warn={gaps.length > 0}/>
      </div>

      {/* Gaps banner */}
      {gaps.length > 0 && (
        <div className="px-8 py-3 border-b hair flex items-center justify-between" style={{background:'color-mix(in oklch, var(--accent-2), transparent 90%)'}}>
          <div className="flex items-center gap-3">
            <span className="section-label" style={{color:'var(--accent-2)'}}>Coverage gaps</span>
            <div className="flex items-center gap-2 flex-wrap">
              {gaps.slice(0, 4).map(g => (
                <button key={g.category+g.severity} onClick={() => fillGap(g)}
                        className="text-[11px] px-2 py-1 font-mono hover:underline" style={{color:'var(--ink)', border:'1px dashed var(--line-2)'}}>
                  {CATEGORY_BY_LABEL[g.category]?.short} · {g.severity} →
                </button>
              ))}
              {gaps.length > 4 && <span className="text-[11px] font-mono" style={{color:'var(--mute)'}}>+{gaps.length-4} more</span>}
            </div>
          </div>
          <div className="text-[11px]" style={{color:'var(--mute)'}}>Legal should add clauses to close these.</div>
        </div>
      )}

      <div className="px-8 py-3 border-b hair flex items-center gap-4" style={{background:'var(--bg)'}}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="search clauses…"
               className="px-3 py-1.5 text-[13px] w-64"/>
        <span className="text-[11px] font-mono" style={{color:'var(--mute)'}}>{filtered.length} of {ledger.length}</span>
        <label className="ml-auto flex items-center gap-2 text-[12px] cursor-pointer" style={{color:'var(--mute)'}}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3 h-3"/>
          show retired / inactive
        </label>
        <div className="flex items-center gap-2 text-[11px] font-mono" style={{color:'var(--mute-2)'}}>
          <span className="w-1.5 h-1.5 rounded-full pulse" style={{background:'var(--ok)'}}></span>
          policy sync · live
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="w-[220px] border-r hair p-5 overflow-y-auto" style={{background:'var(--surface)'}}>
          <div className="section-label mb-3">Shelves</div>
          <button onClick={() => setFilter('all')}
                  className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between`}
                  style={filter==='all'?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>
            <span>All</span><span className="font-mono text-[11px]">{ledger.length}</span>
          </button>
          {CATEGORIES.map(c => {
            const hasGap = gaps.some(g => g.category === c.label);
            return (
              <button key={c.key} onClick={() => setFilter(c.label)}
                      className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between`}
                      style={filter===c.label?{background:'var(--surface-2)', color:'var(--ink)'}:{color:'var(--mute)'}}>
                <span className="flex items-center gap-2">
                  {hasGap && <span style={{color:'var(--accent-2)', fontSize:10}}>⚠</span>}
                  {c.label}
                </span>
                <span className="font-mono text-[11px]">{counts[c.label] || 0}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-12 gap-3 px-8 py-3 border-b hair section-label sticky top-0" style={{background:'var(--bg)'}}>
            <div className="col-span-1"></div>
            <div className="col-span-2">Clause ID</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-1">Sev</div>
            <div className="col-span-3">Title / preview</div>
            <div className="col-span-2">Dates</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          <div className="zebra">
            {filtered.map(c => {
              const short = CATEGORY_BY_LABEL[c.cat]?.short || '··';
              const expanded = expandedId === c.id;
              return (
                <React.Fragment key={c.id}>
                <div className="grid grid-cols-12 gap-3 px-8 py-4 border-b hair items-start hover:bg-[color:var(--surface)] cursor-pointer"
                     onClick={() => setExpandedId(expanded ? null : c.id)}
                     style={!c.active ? {opacity:0.5} : {}}>
                  <div className="col-span-1 font-serif italic text-[18px]" style={{color:'var(--mute-2)'}}>{short}</div>
                  <div className="col-span-2 font-mono text-[12px] pt-1 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full`} style={{background: c.active ? 'var(--ok)' : 'var(--mute-2)'}}></span>
                    {c.id}
                  </div>
                  <div className="col-span-2 text-[13px] pt-1">{c.cat}</div>
                  <div className="col-span-1 pt-1">
                    <span className={`chip ${c.sev === 'High' ? 'chip-high' : c.sev === 'Baseline' ? 'chip-std' : 'chip-std'}`}>{c.sev}</span>
                  </div>
                  <div className="col-span-3">
                    <div className="text-[13px] font-medium mb-0.5 flex items-center gap-2">
                      {c.alwaysInclude && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 tracking-wider" style={{background:'color-mix(in oklch, var(--accent), transparent 85%)', color:'var(--accent)', border:'1px solid color-mix(in oklch, var(--accent), transparent 70%)'}}>ALWAYS-ADD</span>
                      )}
                      {c.title}
                    </div>
                    <div className="text-[11px] leading-relaxed line-clamp-2" style={{color:'var(--mute)'}}>{c.text}</div>
                  </div>
                  <div className="col-span-2 pt-1 text-[11px] font-mono" style={{color:'var(--mute)'}}>
                    <div>created {c.created || '2024-03-12'}</div>
                    <div style={{color: c.expiresSoon ? 'var(--accent-2)' : 'var(--mute-2)'}}>expires {c.expires || '2026-03-12'}</div>
                  </div>
                  <div className="col-span-1 text-right space-x-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleActive(c.id)} className="btn btn-sm" title={c.active ? 'Retire clause' : 'Reactivate'} style={{color: c.active ? 'var(--danger)' : 'var(--ok)'}}>
                      {c.active ? '✕ retire' : '✓ restore'}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="px-8 py-5 border-b hair" style={{background:'var(--surface)'}}>
                    <div className="grid grid-cols-3 gap-8 max-w-5xl">
                      <div>
                        <div className="section-label mb-2">Rationale</div>
                        <div className="text-[12px] leading-relaxed" style={{color:'var(--ink-2)'}}>{c.rationale || 'Standard template clause. No specific incident rationale recorded; used as default for this category.'}</div>
                      </div>
                      <div>
                        <div className="section-label mb-2">Source · reviewer</div>
                        <div className="text-[12px] leading-relaxed" style={{color:'var(--ink-2)'}}>
                          <div><span style={{color:'var(--mute-2)'}}>Drafted by:</span> {c.reviewer || 'R. Okonjo, Legal'}</div>
                          <div><span style={{color:'var(--mute-2)'}}>Last review:</span> {c.reviewed || '2024-11-03'}</div>
                          <div><span style={{color:'var(--mute-2)'}}>Citations:</span> {(c.citations || ['Internal Policy 4.2']).join(', ')}</div>
                        </div>
                      </div>
                      <div>
                        <div className="section-label mb-2">Usage</div>
                        <div className="text-[12px] leading-relaxed" style={{color:'var(--ink-2)'}}>
                          <div><span style={{color:'var(--mute-2)'}}>Used in:</span> {c.usageCount || Math.floor(Math.random()*40)+3} contracts</div>
                          <div><span style={{color:'var(--mute-2)'}}>Redlined by counterparty:</span> {c.redlineRate || Math.floor(Math.random()*30)}% of deals</div>
                          <div className="mt-1"><button onClick={(e) => { e.stopPropagation(); setEditing(c); setAdding(false); }} className="btn btn-sm">edit clause text →</button></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                </React.Fragment>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-16 text-[13px]" style={{color:'var(--mute)'}}>No clauses match.</div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <ClauseEditor clause={editing} onSave={saveClause} onCancel={() => { setEditing(null); setAdding(false); }} isNew={adding}/>
      )}
    </div>
  );
}

function StatTile({ label, value, warn, ok }) {
  const color = warn ? 'var(--accent-2)' : ok ? 'var(--ok)' : 'var(--ink)';
  return (
    <div className="p-5 border-r hair last:border-r-0">
      <div className="section-label">{label}</div>
      <div className="display-sm mt-1 tabnum" style={{color}}>{value}</div>
    </div>
  );
}

function ClauseEditor({ clause, onSave, onCancel, isNew }) {
  const [c, setC] = useState(clause);
  function handleSave() {
    if (!c.id || !c.title || !c.text) return alert('Fill in all fields.');
    onSave(c);
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{background:'rgba(0,0,0,.5)'}}>
      <div className="w-[640px] max-w-[90%]" style={{background:'var(--surface)', border:'1px solid var(--line-2)'}}>
        <div className="px-5 py-3 border-b hair flex items-center justify-between">
          <div className="section-label">{isNew ? 'New clause' : 'Edit clause'}</div>
          <button onClick={onCancel} style={{color:'var(--mute)'}}>✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="section-label mb-1">Clause ID</div>
              <input className="w-full px-2 py-1.5 text-[13px] font-mono" value={c.id}
                     onChange={e => setC({ ...c, id: e.target.value.toUpperCase() })}/>
            </div>
            <div>
              <div className="section-label mb-1">Category</div>
              <select className="w-full px-2 py-1.5 text-[13px]" value={c.cat}
                      onChange={e => setC({ ...c, cat: e.target.value })}>
                {CATEGORIES.map(x => <option key={x.key} value={x.label}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <div className="section-label mb-1">Severity</div>
              <select className="w-full px-2 py-1.5 text-[13px]" value={c.sev}
                      onChange={e => setC({ ...c, sev: e.target.value })}>
                <option>Standard</option><option>High</option>
              </select>
            </div>
          </div>
          <div>
            <div className="section-label mb-1">Title</div>
            <input className="w-full px-2 py-1.5 text-[13px]" value={c.title}
                   onChange={e => setC({ ...c, title: e.target.value })}/>
          </div>
          <div>
            <div className="section-label mb-1">Pre-approved text</div>
            <textarea className="w-full px-2 py-1.5 text-[13px] font-serif leading-relaxed" rows={8} value={c.text}
                      onChange={e => setC({ ...c, text: e.target.value })}/>
          </div>
        </div>
        <div className="px-5 py-3 border-t hair flex justify-end gap-2">
          <button onClick={onCancel} className="btn">cancel</button>
          <button onClick={handleSave} className="btn btn-primary">save</button>
        </div>
      </div>
    </div>
  );
}

window.LedgerPanel = LedgerPanel;
window.StatTile = StatTile;
