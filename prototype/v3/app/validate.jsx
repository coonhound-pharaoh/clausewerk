// V3 — Conflict Validation report (shared surface used by Forge, Dossier, and standalone)
function ConflictReport({ findings, compact }) {
  if (!findings || findings.length === 0) {
    return (
      <div className="p-4 flex items-center gap-3" style={{background:'color-mix(in oklch, var(--ok), transparent 90%)', border:'1px solid color-mix(in oklch, var(--ok), transparent 60%)'}}>
        <span className="w-2 h-2 rounded-full" style={{background:'var(--ok)'}}></span>
        <div className="text-[13px]"><span style={{color:'var(--ok)'}}>No internal contradictions detected.</span> <span style={{color:'var(--mute)'}}>{CONFLICT_RULES.length} validation rules passed.</span></div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {findings.map((f, i) => (
        <div key={i} className="p-3" style={{background:'var(--surface-2)', border:`1px solid ${f.severity==='High'?'color-mix(in oklch, var(--danger), transparent 55%)':'var(--line-2)'}`}}>
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`chip ${f.severity==='High'?'chip-err':'chip-high'}`}>{f.severity}</span>
              <span className="text-[13px] font-medium">{f.title}</span>
            </div>
            <div className="flex gap-1.5">
              {f.refs.map(id => <span key={id} className="font-mono text-[10px] px-1.5 py-0.5" style={{border:'1px solid var(--line-2)', color:'var(--mute)'}}>{id}</span>)}
            </div>
          </div>
          {!compact && <div className="text-[12px] leading-relaxed" style={{color:'var(--mute)'}}>{f.detail}</div>}
        </div>
      ))}
    </div>
  );
}

function ValidatePanel({ manifest, decisions, findings, setTab, onAcknowledge, acknowledged }) {
  if (!manifest || !decisions || decisions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="section-label mb-4">Validate · idle</div>
          <h1 className="display-sm mb-3">Nothing to validate.</h1>
          <p className="text-[13px] mb-6" style={{color:'var(--mute)'}}>Run Forge first — the validator runs on an assembled document.</p>
          <button onClick={() => setTab('forge')} className="btn btn-primary">→ go to forge</button>
        </div>
      </div>
    );
  }
  const high = findings.filter(f => f.severity === 'High').length;
  return (
    <div className="h-full flex flex-col">
      <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
        <div>
          <div className="section-label">Guardrail · conflict validation</div>
          <h2 className="display-sm mt-2">Validate <span style={{color:'var(--mute)', fontStyle:'italic', fontSize:22}}>/ internal contradictions</span></h2>
          <div className="text-[13px] mt-1" style={{color:'var(--mute)'}}>Runs {CONFLICT_RULES.length} pairwise rules over the assembled contract before it can ship.</div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setTab('forge')} className="btn btn-sm">← forge</button>
          {high === 0 || acknowledged ? (
            <button onClick={() => setTab('dossier')} className="btn btn-primary">→ continue to dossier</button>
          ) : (
            <button onClick={onAcknowledge} className="btn btn-primary" style={{background:'var(--accent-2)', borderColor:'var(--accent-2)'}}>acknowledge · override</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 border-b hair" style={{background:'var(--surface)'}}>
        <ValTile label="Rules run" value={CONFLICT_RULES.length}/>
        <ValTile label="Findings" value={findings.length} warn={findings.length > 0}/>
        <ValTile label="High severity" value={high} warn={high > 0}/>
        <ValTile label="Gate" value={high === 0 || acknowledged ? 'OPEN' : 'BLOCKED'} gateOpen={high === 0 || acknowledged}/>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <div className="section-label mb-3">Validation report</div>
            <ConflictReport findings={findings}/>
          </div>

          <div>
            <div className="section-label mb-3">Rule catalog</div>
            <div className="grid grid-cols-2 gap-3">
              {CONFLICT_RULES.map((r, i) => {
                const hit = findings.find(f => f.rule === r.name);
                return (
                  <div key={i} className="p-3" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="text-[12px] font-medium">{r.name}</div>
                      {hit ? <span className={`chip ${hit.severity==='High'?'chip-err':'chip-high'}`}>flag</span>
                           : <span className="chip chip-ok">pass</span>}
                    </div>
                    <div className="font-mono text-[10px]" style={{color:'var(--mute-2)'}}>rule_{String(i+1).padStart(2,'0')}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValTile({ label, value, warn, gateOpen }) {
  const color = warn ? 'var(--accent-2)' : gateOpen === true ? 'var(--ok)' : gateOpen === false ? 'var(--danger)' : 'var(--ink)';
  return (
    <div className="p-5 border-r hair last:border-r-0">
      <div className="section-label">{label}</div>
      <div className="display-sm mt-1 tabnum" style={{color}}>{value}</div>
    </div>
  );
}

// Expiry / obsolescence notice. Rendered at every point where the contract is
// about to move — each negotiation round and at signature — because clause
// validity is computed against the clock and can lapse between rounds with no
// event to announce it. `where` names the checkpoint in the copy.
function ExpiryNotice({ decisions, ledger, where }) {
  const w = expiryWarnings(decisions, ledger);
  if (!w.total) return null;
  const blocking = w.blocking > 0;
  const tone = blocking ? 'var(--danger)' : 'var(--accent-2)';
  return (
    <div className="p-3" style={{
      background: `color-mix(in oklch, ${tone}, transparent 92%)`,
      border: `1px solid color-mix(in oklch, ${tone}, transparent 60%)`,
    }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`chip ${blocking ? 'chip-err' : 'chip-high'}`}>
          {blocking ? 'obsolete language' : 'expiring'}
        </span>
        <span className="text-[13px] font-medium">
          {blocking
            ? `${w.blocking} clause${w.blocking === 1 ? '' : 's'} in this contract ${w.blocking === 1 ? 'is' : 'are'} no longer approved`
            : `${w.expiringSoon.length} clause${w.expiringSoon.length === 1 ? '' : 's'} expiring within 90 days`}
        </span>
        {where && <span className="text-[11px]" style={{color:'var(--mute-2)'}}>· checked at {where}</span>}
      </div>
      <div className="space-y-0.5">
        {w.lapsed.map(c => (
          <div key={c.id} className="font-mono text-[10px]" style={{color:'var(--mute)'}}>
            {c.id} · expired {c.expires} · {Math.abs(c.daysToExpiry)}d ago
          </div>
        ))}
        {w.retired.map(c => (
          <div key={c.id} className="font-mono text-[10px]" style={{color:'var(--mute)'}}>
            {c.id} · retired · {c.retiredReason || 'no reason recorded'}
          </div>
        ))}
        {w.expiringSoon.map(c => (
          <div key={c.id} className="font-mono text-[10px]" style={{color:'var(--mute-2)'}}>
            {c.id} · expires {c.expires} · in {c.daysToExpiry}d
          </div>
        ))}
      </div>
      {blocking && (
        <div className="text-[12px] mt-2" style={{color:'var(--mute)'}}>
          Re-run Forge to resolve against currently-approved language, or route to Legal.
        </div>
      )}
    </div>
  );
}

window.ConflictReport = ConflictReport;
window.ValidatePanel = ValidatePanel;
window.ExpiryNotice = ExpiryNotice;
