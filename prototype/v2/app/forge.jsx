// R10 — Forge: theatrical run with query/resolve/land beats + python console
function ForgePanel({ manifest, ledger, decisions, setDecisions, setDossier, setTab, setPhase, setDossierReady, autoRun }) {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [beat, setBeat] = useState(null); // { index, phase: 'query'|'resolve'|'land' }
  const [consoleLines, setConsoleLines] = useState([]);
  const [showConsole, setShowConsole] = useState(true);

  // Auto-run from demo mode
  useEffect(() => {
    if (autoRun?.nonce) run();
  }, [autoRun?.nonce]);

  if (!manifest) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="section-label mb-4">Forge · idle</div>
          <h1 className="display-sm mb-3">Nothing to assemble.</h1>
          <p className="text-[13px] mb-6" style={{color:'var(--mute)'}}>Forge needs a validated manifest and a populated Ledger.</p>
          <button onClick={() => setTab('intake')} className="btn btn-primary">← start at intake</button>
        </div>
      </div>
    );
  }

  async function run() {
    setRunning(true);
    setPhase('forging');
    setStep(0);
    setConsoleLines([]);
    const all = resolveClauses(manifest, ledger);
    const built = [];
    for (let i = 0; i < all.length; i++) {
      const risk = all[i].risk;
      // Beat 1: query
      setBeat({ index: i, phase: 'query' });
      pushLine(`>>> resolve('${risk.category}', '${risk.severity}')`);
      await wait(350);
      // Beat 2: resolve
      setBeat({ index: i, phase: 'resolve' });
      if (all[i].suppressed.length) {
        for (const s of all[i].suppressed.slice(0,2)) pushLine(`    ~ suppress ${s.id}`);
      }
      await wait(500);
      // Beat 3: land
      setBeat({ index: i, phase: 'land' });
      if (all[i].selected) pushLine(`    ← ${all[i].selected.id}  (${all[i].reason})`);
      else pushLine(`    ! no match — flagged`);
      built.push(all[i]);
      setDecisions([...built]);
      setStep(i + 1);
      await wait(220);
    }
    setBeat(null);
    await wait(250);
    pushLine(`─ pipeline complete · ${built.filter(d=>d.selected).length} clauses selected ─`);
    const dossier = assembleDossier(manifest, all);
    setDossier(dossier);
    setDossierReady(true);
    setRunning(false);
    setPhase('idle');
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function pushLine(s) { setConsoleLines(prev => [...prev, s]); }

  const total = manifest.risks.length;
  const pct = total === 0 ? 0 : Math.min(100, (step / total) * 100);
  const selectedCount = decisions.filter(d => d.selected).length;

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Tier 3 · Forge</div>
          <h2 className="display-sm mt-2">Forge</h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>Deterministic conflict resolution &amp; assembly · python · o365 · python-docx</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowConsole(!showConsole)} className="btn btn-sm">
            {showConsole ? '› hide console' : '‹ show console'}
          </button>
          <button onClick={run} disabled={running} className="btn btn-primary" style={{opacity: running?.6:1}}>
            {running ? '◌ running…' : decisions.length>0 ? '↻ re-run' : '▶ run pipeline'}
          </button>
          {decisions.length>0 && !running && (
            <button onClick={() => setTab('dossier')} className="btn">view dossier →</button>
          )}
        </div>
      </div>

      <div className="px-8 pt-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <span className="section-label">pipeline</span>
            <span className="display-sm tabnum" style={{fontSize:20, color:'var(--ink)'}}>
              {selectedCount}<span style={{color:'var(--mute-2)'}}>/{total}</span>
            </span>
            <span className="text-[12px]" style={{color:'var(--mute)'}}>clauses selected</span>
          </div>
          <span className="font-mono text-[11px]" style={{color:'var(--mute)'}}>{step < 0 ? 'ready' : `${step}/${total} resolved`}</span>
        </div>
        <div className="h-[2px] overflow-hidden" style={{background:'var(--line-2)'}}>
          <div className="h-full transition-all duration-300" style={{width:`${pct}%`, background:'var(--accent)'}}></div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-12 gap-3 pb-3 border-b hair section-label">
            <div className="col-span-3">Manifest request</div>
            <div className="col-span-1"></div>
            <div className="col-span-3">Ledger lookup</div>
            <div className="col-span-1"></div>
            <div className="col-span-4">Resolution</div>
          </div>

          {manifest.risks.map((risk, i) => {
            const decided = decisions[i];
            const done = i < step;
            const isBeat = beat && beat.index === i;
            const beatPhase = isBeat ? beat.phase : null;

            return (
              <div key={i} className={`grid grid-cols-12 gap-3 items-center py-4 border-b hair transition-opacity ${i >= step && !done ? 'opacity-30' : ''}`}>
                <div className="col-span-3">
                  <div className={`text-[14px] font-medium ${beatPhase==='query'?'animate-pulse':''}`} style={beatPhase==='query'?{color:'var(--accent)'}:{}}>
                    {risk.category}
                  </div>
                  <div className="mt-1">
                    <span className={`chip ${risk.severity==='High'?'chip-high':'chip-std'}`}>{risk.severity}</span>
                  </div>
                </div>

                {/* Arrow 1: with beam drop during query */}
                <div className="col-span-1 text-center relative">
                  {beatPhase==='query' && (
                    <svg className="absolute left-1/2 -translate-x-1/2 beam-drop" width="2" height="40" style={{top:-8}}>
                      <line x1="1" y1="0" x2="1" y2="40" stroke="var(--accent)" strokeWidth="2"/>
                    </svg>
                  )}
                  {done && <svg width="20" height="10" className="inline"><path d="M0 5 L14 5 M10 1 L18 5 L10 9" stroke="var(--accent)" fill="none" strokeWidth="1.2"/></svg>}
                </div>

                {/* Ledger lookup */}
                <div className="col-span-3">
                  {decided ? (
                    <div>
                      <div className={`font-mono text-[12px] ${(done || beatPhase==='land')?'stamp-in':''}`}
                           style={{color: decided.selected ? 'var(--ink)' : 'var(--danger)'}}>
                        {decided.selected?.id || '—'}
                      </div>
                      {decided.suppressed.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {decided.suppressed.slice(0,3).map(s => (
                            <span key={s.id}
                                  className={`font-mono text-[10px] ${(beatPhase==='resolve' || beatPhase==='land' || done)?'strike-out':''}`}
                                  style={{color:'var(--mute-2)'}}>
                              {s.id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : <span className="text-[11px]" style={{color:'var(--mute-2)'}}>pending</span>}
                </div>

                <div className="col-span-1 text-center">
                  {done && decided?.selected && <svg width="20" height="10" className="inline"><path d="M0 5 L14 5 M10 1 L18 5 L10 9" stroke="var(--accent)" fill="none" strokeWidth="1.2"/></svg>}
                </div>

                {/* Resolution */}
                <div className="col-span-4">
                  {decided ? (
                    <div>
                      <div className={`text-[13px] ${beatPhase==='land'?'stamp-in':''}`}
                           style={{color: decided.selected ? 'var(--ink)' : 'var(--danger)'}}>
                        {decided.selected ? decided.selected.title : 'No clause available — flagged for Legal'}
                      </div>
                      <div className="section-label mt-1" style={{fontSize:10}}>{decided.reason}</div>
                    </div>
                  ) : <span className="text-[11px]" style={{color:'var(--mute-2)'}}>—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: console + stats */}
        {showConsole && (
          <div className="w-[340px] border-l hair flex flex-col" style={{background:'var(--surface)'}}>
            <div className="px-5 py-3 border-b hair flex items-center justify-between">
              <div className="section-label">python console</div>
              <span className="text-[10px] font-mono" style={{color:'var(--mute-2)'}}>live</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed" style={{background:'#0A0C10'}}>
              {consoleLines.length === 0 && <div style={{color:'var(--mute-2)'}}>$ awaiting run…</div>}
              {consoleLines.map((l, i) => (
                <div key={i} style={{color: l.startsWith('    ~') ? 'var(--mute-2)'
                                          : l.startsWith('    ←') ? 'var(--accent)'
                                          : l.startsWith('    !') ? 'var(--danger)'
                                          : l.startsWith('─') ? 'var(--ok)'
                                          : 'var(--ink)'}}>
                  {l}
                </div>
              ))}
              {running && <div className="pulse" style={{color:'var(--accent-2)'}}>█</div>}
            </div>
            <div className="border-t hair p-4 space-y-2">
              <Stat k="Risks in manifest" v={manifest.risks.length}/>
              <Stat k="Clauses selected" v={selectedCount}/>
              <Stat k="Conflicts resolved" v={decisions.reduce((a,d) => a + d.suppressed.length, 0)}/>
              <Stat k="Unmatched" v={decisions.filter(d => !d.selected).length} danger={decisions.some(d=>!d.selected)}/>
              <Stat k="LLM-authored text" v="0 chars" ok/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ k, v, ok, danger }) {
  const color = ok ? 'var(--ok)' : danger ? 'var(--danger)' : 'var(--ink)';
  return (
    <div className="flex items-baseline justify-between">
      <div className="text-[11px]" style={{color:'var(--mute)'}}>{k}</div>
      <div className="text-[14px] font-mono tabnum" style={{color}}>{v}</div>
    </div>
  );
}

window.ForgePanel = ForgePanel;
