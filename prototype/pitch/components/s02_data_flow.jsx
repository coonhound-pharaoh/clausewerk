// Sample 02 — Data flow / pipeline (Midnight palette)
function S02_DataFlow() {
  const jsonExample = `{
  "vendor": "Northwind Analytics",
  "risks": [
    {
      "category": "Data Privacy",
      "severity": "High",
      "justification": "EU PII at rest + transit"
    },
    {
      "category": "Indemnity",
      "severity": "High",
      "justification": "Cross-border exposure > $250K"
    }
  ]
}`;

  return (
    <SampleCard palette="midnight" className="p-10">
      <SampleHeader
        idx={2}
        kicker="Data flow"
        title="Words in, clauses out"
        subtitle="A single linear pipeline — each stage has one job and one output format."
        palette="midnight"
      />

      <div className="bp-grid-dark border hairline-m rounded-sm p-8" data-screen-label="02 Data Flow">
        <div className="grid grid-cols-12 gap-4 items-stretch">
          {/* Stage 1 — Conversation */}
          <div className="col-span-3 border hairline-m rounded-sm p-5" style={{background:'rgba(255,255,255,0.02)'}}>
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] mb-3">01 · Conversation</div>
            <div className="text-xl font-semibold tracking-tight mb-4">Intake</div>
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-[color:var(--mid-mute)] flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[color:var(--mid-accent)]"></span>
                User · free-form
              </div>
              <div className="bg-black/30 rounded-sm p-2.5 text-[11px] leading-relaxed">"We're onboarding a vendor that processes European customer data…"</div>
              <div className="text-[11px] font-mono text-[color:var(--mid-mute)] flex items-center gap-2 pt-1">
                <span className="w-1 h-1 rounded-full bg-[color:var(--mid-accent)]"></span>
                LLM · probes
              </div>
              <div className="bg-black/30 rounded-sm p-2.5 text-[11px] leading-relaxed">"Is the data retained or pass-through? Above $250K in annual spend?"</div>
            </div>
          </div>

          <FlowArrow palette="midnight" />

          {/* Stage 2 — JSON */}
          <div className="col-span-3 border hairline-m rounded-sm p-5 relative" style={{background:'rgba(255,255,255,0.02)'}}>
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] mb-3">02 · Structured output</div>
            <div className="text-xl font-semibold tracking-tight mb-4">Manifest</div>
            <pre className="font-mono text-[10px] leading-[1.55] bg-black/30 rounded-sm p-3 overflow-hidden" style={{color:'var(--mid-accent)'}}>{jsonExample}</pre>
            <div className="absolute top-4 right-4 font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded-sm border hairline-m text-[color:var(--mid-mute)]">schema v1</div>
          </div>

          <FlowArrow palette="midnight" />

          {/* Stage 3 — Lookup */}
          <div className="col-span-3 border hairline-m rounded-sm p-5" style={{background:'rgba(255,255,255,0.02)'}}>
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] mb-3">03 · Deterministic select</div>
            <div className="text-xl font-semibold tracking-tight mb-4">Ledger lookup</div>
            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                { id: 'DP-H-014', cat: 'Data Privacy', sev: 'High', sel: true },
                { id: 'DP-S-003', cat: 'Data Privacy', sev: 'Std',  sel: false },
                { id: 'ID-H-007', cat: 'Indemnity',    sev: 'High', sel: true },
                { id: 'IP-S-002', cat: 'IP',           sev: 'Std',  sel: true },
                { id: 'LC-S-001', cat: 'Liability',    sev: 'Std',  sel: true },
              ].map(r => (
                <div key={r.id} className={`flex items-center justify-between px-2 py-1.5 rounded-sm border hairline-m ${r.sel?'':'opacity-40'}`} style={r.sel?{background:'rgba(0,0,0,0.25)'}:{}}>
                  <span>{r.id}</span>
                  <span className="text-[color:var(--mid-mute)]">{r.cat}</span>
                  <span className={r.sev==='High'?'text-[color:var(--mid-accent)]':''}>{r.sev}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 flex flex-col items-center justify-center">
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] mb-2">04 · Assemble</div>
            <svg width="100%" height="120" viewBox="0 0 120 120">
              <rect x="22" y="8" width="76" height="104" rx="2" fill="rgba(232,230,223,0.06)" stroke="var(--mid-line)"/>
              {[20,36,52,64,76,88].map((y,i)=>(
                <line key={i} x1="30" y1={y} x2={i%2? 76 : 86} y2={y} stroke="var(--mid-mute)" strokeWidth="1" opacity=".5"/>
              ))}
              <circle cx="94" cy="100" r="6" fill="var(--mid-accent)"/>
              <text x="94" y="103" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill="var(--mid-bg)" fontWeight="700">W</text>
            </svg>
            <div className="text-[11px] font-mono text-[color:var(--mid-mute)] text-center">contract.docx</div>
          </div>
        </div>

        {/* Bottom spec strip */}
        <div className="mt-8 grid grid-cols-4 gap-px bg-[color:var(--mid-line)] border hairline-m">
          {[
            { k:'Format contract', v:'JSON schema'},
            { k:'Query layer',     v:'O365 / pandas'},
            { k:'Assembly',        v:'python-docx'},
            { k:'Output target',   v:'SharePoint'},
          ].map(x=>(
            <div key={x.k} className="bg-[color:var(--mid-bg)] p-3">
              <div className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--mid-mute)]">{x.k}</div>
              <div className="font-mono text-xs mt-1">{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">
        <span>Fig. 02 — Pipeline</span>
        <span>Palette · Midnight</span>
      </div>
    </SampleCard>
  );
}

function FlowArrow({ palette }) {
  const c = palette === 'midnight' ? 'var(--mid-accent)' : palette === 'ivory' ? 'var(--ivory-accent)' : 'var(--graphite-accent)';
  return (
    <div className="col-span-[0.5] flex items-center justify-center" style={{gridColumn:'span 0.5 / span 0.5', minWidth:24}}>
      <svg width="30" height="140" viewBox="0 0 30 140" fill="none" style={{width:'100%'}}>
        <line x1="0" y1="70" x2="22" y2="70" stroke={c} strokeWidth="1.2" className="flow-line"/>
        <path d="M20 64 L28 70 L20 76" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

window.S02_DataFlow = S02_DataFlow;
