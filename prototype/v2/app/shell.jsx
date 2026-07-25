// R1 masthead + R2 status + R7 functional pipeline rail + R14 scale strip
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const TABS = [
  { key:'intake',   label:'Intake',   tier:'T1' },
  { key:'manifest', label:'Manifest', tier:'·'  },
  { key:'ledger',   label:'Ledger',   tier:'T2' },
  { key:'forge',    label:'Forge',    tier:'T3' },
  { key:'dossier',  label:'Dossier',  tier:'·'  },
];

function statusSentence({ tab, phase, manifest, decisions, dossierReady }) {
  if (phase === 'thinking')     return 'Intake is composing a question…';
  if (phase === 'classifying')  return 'Building the manifest…';
  if (phase === 'forging')      return 'Matching against the ledger…';
  if (phase === 'demo')         return 'Demo in progress';
  if (dossierReady)             return 'Dossier assembled · posted to SharePoint';
  if (tab === 'intake')  return manifest ? 'Intake complete' : 'Intake is listening';
  if (tab === 'manifest')return manifest ? 'Manifest validated' : 'Awaiting intake';
  if (tab === 'ledger')  return 'Clause bank · synced';
  if (tab === 'forge')   return manifest ? 'Pipeline ready' : 'Awaiting manifest';
  if (tab === 'dossier') return decisions?.length ? 'Dossier ready' : 'Awaiting assembly';
  return 'Ready';
}

function statusTone(phase, dossierReady) {
  if (phase === 'thinking' || phase === 'classifying' || phase === 'forging' || phase === 'demo') return 'var(--accent-2)';
  if (dossierReady) return 'var(--accent)';
  return 'var(--mute-2)';
}

function Shell({ active, setActive, phase, manifest, decisions, dossierReady, children, onReset, onDemo, demoRunning, onArchitecture, ledger }) {
  const hasManifest = manifest && manifest.risks && manifest.risks.length > 0;
  const hasDecisions = decisions && decisions.length > 0;
  const subjectLine = manifest
    ? `${manifest.vendor}${manifest.value ? ` · ${manifest.value}` : ''}`
    : 'Contract assembly for procurement';

  const status = statusSentence({ tab: active, phase, manifest, decisions, dossierReady });
  const dotColor = statusTone(phase, dossierReady);

  return (
    <div className="h-full flex flex-col" style={{background:'var(--bg)'}}>
      {/* Row 1 — masthead */}
      <div className="flex items-center justify-between px-6 border-b hair" style={{height:54}}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="monogram">CW</span>
            <div className="flex flex-col justify-center">
              <span className="wordmark leading-none">Clausewerk</span>
              <span className="caption leading-none mt-0.5" style={{fontSize:10, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--mute-2)'}}>Procurement contract assembly</span>
            </div>
          </div>
          <div className="h-6 w-px" style={{background:'var(--line-2)'}}></div>
          <div className="text-[13px]" style={{color: manifest ? 'var(--ink)' : 'var(--mute)'}}>{subjectLine}</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5" style={{background:'var(--surface)', border:'1px solid var(--line)'}}>
            <span className="w-1.5 h-1.5 rounded-full pulse" style={{background: dotColor}}></span>
            <span className="text-[12px]" style={{color:'var(--ink)'}}>{status}</span>
          </div>
          <button onClick={onDemo} className="btn" style={demoRunning ? {background:'var(--accent)', color:'#0B0D10', borderColor:'var(--accent)', fontWeight:600}:{}}>
            {demoRunning ? '■ stop demo' : '▶ demo'}
          </button>
          <button onClick={onArchitecture} className="btn btn-sm" title="Architecture overview">◇ architecture</button>
          <button onClick={onReset} className="btn btn-sm" title="Reset session">↺</button>
        </div>
      </div>

      {/* Row 2 — tabs */}
      <div className="flex items-center px-6 border-b hair" style={{height:42}}>
        <div className="flex items-center gap-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActive(t.key)}
                    className={`tab-btn ${active===t.key?'active':''}`}>
              {t.label}
              {t.key === 'manifest' && hasManifest && (
                <span className="ml-2 tabnum" style={{color:'var(--mute)', fontSize:11, fontFamily:'JetBrains Mono'}}>{manifest.risks.length}</span>
              )}
              {t.key === 'dossier' && dossierReady && (
                <span className="ml-2 w-1.5 h-1.5 inline-block rounded-full pulse align-middle" style={{background:'var(--ok)'}}></span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <PipelineRail active={active} setActive={setActive}
                      manifest={manifest} hasManifest={hasManifest}
                      decisions={decisions} hasDecisions={hasDecisions}
                      dossierReady={dossierReady}/>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>

      {/* Footer — R14 persistent scale strip */}
      <ScaleStrip ledger={ledger} manifest={manifest} decisions={decisions} dossierReady={dossierReady}/>
    </div>
  );
}

function PipelineRail({ active, setActive, manifest, hasManifest, decisions, hasDecisions, dossierReady }) {
  const stages = [
    { key:'intake',   label:'Intake',   state: hasManifest ? 'done' : (active==='intake'?'running':'ready'),
      summary: manifest ? `${manifest.risks.length} risks captured` : 'Ready to converse' },
    { key:'manifest', label:'Manifest', state: hasManifest ? 'done' : 'waiting',
      summary: manifest ? `${manifest.risks.filter(r=>r.severity==='High').length} High · ${manifest.risks.filter(r=>r.severity==='Standard').length} Standard` : 'Needs intake' },
    { key:'ledger',   label:'Ledger',   state: 'done',
      summary: 'Synced from SharePoint' },
    { key:'forge',    label:'Forge',    state: hasDecisions ? 'done' : (hasManifest?'ready':'waiting'),
      summary: hasDecisions ? `${decisions.filter(d=>d.selected).length} clauses selected` : (hasManifest?'Pipeline ready':'Needs manifest') },
    { key:'dossier',  label:'Dossier',  state: dossierReady ? 'done' : 'waiting',
      summary: dossierReady ? 'Contract + audit posted' : 'Needs forge run' },
  ];

  return (
    <div className="border-r hair flex flex-col items-stretch py-5" style={{background:'var(--surface)', width:72}}>
      {stages.map((s, i) => {
        const isActive = active === s.key;
        const done = s.state === 'done';
        const running = s.state === 'running';
        const ready = s.state === 'ready';
        return (
          <div key={s.key} className="relative">
            <button onClick={() => setActive(s.key)}
                    className="group w-full flex flex-col items-center px-2 py-3"
                    title={s.summary}>
              <div className="w-8 h-8 flex items-center justify-center relative"
                   style={{
                     border: `1px solid ${done?'var(--accent)':running?'var(--accent-2)':ready?'var(--line-2)':'var(--line)'}`,
                     background: done ? 'color-mix(in oklch, var(--accent), transparent 78%)'
                       : isActive ? 'var(--surface-2)' : 'transparent',
                   }}>
                {done && <span style={{color:'var(--accent)', fontSize:11}}>✓</span>}
                {running && <span className="pulse w-2 h-2 rounded-full" style={{background:'var(--accent-2)'}}></span>}
                {ready && <span style={{color:'var(--mute)', fontSize:11, fontFamily:'JetBrains Mono'}}>{i+1}</span>}
                {s.state === 'waiting' && <span style={{color:'var(--mute-2)', fontSize:11, fontFamily:'JetBrains Mono'}}>{i+1}</span>}
              </div>
              <div className="section-label mt-2 text-[9px]" style={{color: isActive||done ? 'var(--ink)' : 'var(--mute-2)'}}>
                {s.label}
              </div>
            </button>
            {i < stages.length - 1 && (
              <div className="absolute left-1/2 -translate-x-1/2" style={{
                top: 56, width: 1, height: 20,
                background: done ? 'var(--accent)' : 'var(--line-2)',
              }}></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScaleStrip({ ledger, manifest, decisions, dossierReady }) {
  const cats = new Set(ledger.map(c => c.cat));
  const combos = ledger.length; // approximate rule combos
  const runState = dossierReady ? 'Run complete'
    : decisions?.length ? 'Forge resolving…'
    : manifest ? 'Manifest validated · Awaiting Forge'
    : 'Ready';
  return (
    <div className="flex items-center justify-between px-6 border-t hair" style={{height:28, background:'var(--surface)', fontFamily:'JetBrains Mono', fontSize:10, color:'var(--mute-2)'}}>
      <div>Clausewerk · v0.4</div>
      <div style={{color:'var(--mute)'}}>{runState}</div>
      <div>{ledger.length} clauses · {cats.size} categories · {combos} rule combos · synced 3m ago</div>
    </div>
  );
}

window.Shell = Shell;
