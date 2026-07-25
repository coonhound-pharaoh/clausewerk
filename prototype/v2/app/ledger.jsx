// R9 — Ledger/Vault with stat strip, coverage gaps, library aesthetic
function LedgerPanel({ ledger, setLedger }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  const filtered = ledger.filter(c => {
    if (filter !== 'all' && c.cat !== filter) return false;
    if (query && !(c.id.toLowerCase().includes(query.toLowerCase()) ||
                   c.title.toLowerCase().includes(query.toLowerCase()) ||
                   c.text.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

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
      <div className="grid grid-cols-4 border-b hair" style={{background:'var(--surface)'}}>
        <StatTile label="Clauses" value={ledger.length}/>
        <StatTile label="Categories" value={CATEGORIES.length}/>
        <StatTile label="Last update" value="3m ago"/>
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
            <div className="col-span-1">Severity</div>
            <div className="col-span-5">Title / preview</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          <div className="zebra">
            {filtered.map(c => {
              const short = CATEGORY_BY_LABEL[c.cat]?.short || '··';
              return (
                <div key={c.id} className="grid grid-cols-12 gap-3 px-8 py-4 border-b hair items-start hover:bg-[color:var(--surface)]">
                  <div className="col-span-1 font-serif italic text-[18px]" style={{color:'var(--mute-2)'}}>{short}</div>
                  <div className="col-span-2 font-mono text-[12px] pt-1">{c.id}</div>
                  <div className="col-span-2 text-[13px] pt-1">{c.cat}</div>
                  <div className="col-span-1 pt-1">
                    <span className={`chip ${c.sev === 'High' ? 'chip-high' : 'chip-std'}`}>{c.sev}</span>
                  </div>
                  <div className="col-span-5">
                    <div className="text-[13px] font-medium mb-0.5">{c.title}</div>
                    <div className="text-[11px] leading-relaxed line-clamp-2" style={{color:'var(--mute)'}}>{c.text}</div>
                  </div>
                  <div className="col-span-1 text-right space-x-1">
                    <button onClick={() => { setEditing(c); setAdding(false); }} className="btn btn-sm">edit</button>
                    <button onClick={() => deleteClause(c.id)} className="btn btn-sm" style={{color:'var(--mute)'}}>✕</button>
                  </div>
                </div>
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

function StatTile({ label, value, warn }) {
  return (
    <div className="p-5 border-r hair last:border-r-0">
      <div className="section-label">{label}</div>
      <div className="display-sm mt-1 tabnum" style={{color: warn ? 'var(--accent-2)' : 'var(--ink)'}}>{value}</div>
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
