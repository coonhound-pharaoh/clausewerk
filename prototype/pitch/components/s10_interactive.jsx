// Sample 10 — Interactive "play the flow" (Graphite)
function S10_Interactive() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const steps = [
    { key:'idle',       title:'Ready',                 detail:'A procurement requester opens Intake to start a new MSA.' },
    { key:'conv1',      title:'Intake asks',           detail:'Intake probes the nature of the engagement — data, geography, value.' },
    { key:'conv2',      title:'Requester answers',    detail:'Free-form description of the vendor and scope.' },
    { key:'classify',   title:'Intake classifies',    detail:'Risks are mapped to categories; severity set to Standard or High.' },
    { key:'manifest',   title:'Manifest emitted',      detail:'A strict JSON payload leaves Intake. This is the only thing that crosses the boundary.' },
    { key:'query',      title:'Forge queries Ledger',  detail:'SharePoint is queried by (category, severity). Candidate rows return.' },
    { key:'resolve',    title:'Conflicts resolved',    detail:'One winner per category via the priority ladder.' },
    { key:'assemble',   title:'Dossier assembled',     detail:'python-docx concatenates approved text into contract.docx.' },
    { key:'audit',      title:'Audit summary posted',  detail:'Justifications paired with selected clause IDs for Legal review.' },
  ];

  useEffect(() => {
    if (!playing) return;
    if (step >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(s => s + 1), 1400);
    return () => clearTimeout(t);
  }, [playing, step]);

  const reset = () => { setPlaying(false); setStep(0); };

  const manifestVisible = step >= 4;
  const ledgerActive    = step >= 5;
  const forgeActive     = step >= 6;
  const docxReady       = step >= 7;
  const auditReady      = step >= 8;

  return (
    <SampleCard palette="graphite" className="p-10">
      <SampleHeader
        idx={10}
        kicker="Interactive · play the flow"
        title="Watch an intake become a dossier"
        subtitle="Step through or auto-play the full run. State persists across the three tiers so each actor sees only what it needs."
        palette="graphite"
      />

      <div data-screen-label="10 Interactive" className="border hairline-g rounded-sm bg-white">
        {/* Control bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b hairline-g">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (step >= steps.length - 1) setStep(0); setPlaying(p => !p); }}
              className="font-mono text-xs px-3 py-1.5 rounded-sm flex items-center gap-2"
              style={{background:'var(--graphite-ink)', color:'var(--graphite-bg)'}}>
              {playing ? '■ pause' : '▶ play'}
            </button>
            <button onClick={() => setStep(s => Math.max(0, s-1))} className="font-mono text-xs px-3 py-1.5 rounded-sm border hairline-g">← step</button>
            <button onClick={() => setStep(s => Math.min(steps.length-1, s+1))} className="font-mono text-xs px-3 py-1.5 rounded-sm border hairline-g">step →</button>
            <button onClick={reset} className="font-mono text-xs px-3 py-1.5 rounded-sm border hairline-g text-[color:var(--graphite-mute)]">reset</button>
          </div>
          <div className="font-mono text-[11px] text-[color:var(--graphite-mute)]">
            {String(step+1).padStart(2,'0')} / {String(steps.length).padStart(2,'0')} · {steps[step].key}
          </div>
        </div>

        {/* Progress track */}
        <div className="px-6 pt-5">
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s.key} onClick={() => setStep(i)} className="flex-1 h-1.5 rounded-[1px] cursor-pointer" style={{
                background: i <= step ? 'var(--graphite-accent)' : 'var(--graphite-line)'
              }}></div>
            ))}
          </div>
          <div className="flex items-baseline justify-between mt-4">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Now</div>
              <div className="text-xl font-semibold tracking-tight">{steps[step].title}</div>
            </div>
            <div className="text-sm text-[color:var(--graphite-mute)] max-w-md text-right leading-relaxed">{steps[step].detail}</div>
          </div>
        </div>

        {/* Stage */}
        <div className="px-6 py-8 grid grid-cols-12 gap-5">
          {/* Intake panel */}
          <div className={`col-span-4 border hairline-g rounded-sm p-5 transition-all ${step < 4 ? '' : 'opacity-50'}`}
               style={step < 4 ? {background:'var(--graphite-bg)', boxShadow:'0 0 0 2px var(--graphite-accent) inset'} : {}}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Tier 1 · Intake</div>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{background: step < 4 ? 'var(--graphite-accent)' : 'var(--graphite-line)'}}></span>
            </div>
            <div className="space-y-2">
              <ChatBubble who="Intake" active={step>=1} tone="bot">Describe the engagement — who, what, and where does the data live?</ChatBubble>
              <ChatBubble who="You"    active={step>=2} tone="user">Vendor runs analytics on our EU customer data. Annual spend ~$240K.</ChatBubble>
              <ChatBubble who="Intake" active={step>=3} tone="bot">Processing EU PII and above the $250K threshold — I'll mark Data Privacy and Indemnity as <b>High</b>.</ChatBubble>
            </div>
          </div>

          {/* Middle: manifest */}
          <div className="col-span-4 border hairline-g rounded-sm p-5 relative" style={manifestVisible ? {background:'var(--graphite-ink)', color:'var(--graphite-bg)'} : {}}>
            <div className="font-mono text-[10px] tracking-widest uppercase mb-3" style={{color: manifestVisible ? 'rgba(255,255,255,.5)' : 'var(--graphite-mute)'}}>
              Manifest · {manifestVisible ? 'emitted' : 'pending'}
            </div>
            <pre className="font-mono text-[10px] leading-[1.6]" style={{color: manifestVisible ? 'var(--graphite-accent)' : 'var(--graphite-line)'}}>{`{
  "vendor": "Northwind",
  "risks": [
    {"cat":"Data Privacy", "sev":"High"},
    {"cat":"Indemnity",    "sev":"High"},
    {"cat":"IP",           "sev":"Std"},
    {"cat":"Liability",    "sev":"Std"},
    {"cat":"Termination",  "sev":"Std"}
  ]
}`}</pre>
            {manifestVisible && step < 5 && (
              <div className="absolute -right-3 top-1/2 -translate-y-1/2">
                <svg width="24" height="16"><path d="M0 8 L18 8 M14 3 L22 8 L14 13" stroke="var(--graphite-accent)" strokeWidth="1.5" fill="none"/></svg>
              </div>
            )}
          </div>

          {/* Right: Forge + Ledger stacked */}
          <div className="col-span-4 flex flex-col gap-3">
            <div className={`border hairline-g rounded-sm p-4 transition-all ${ledgerActive?'':'opacity-40'}`}
                 style={ledgerActive && !forgeActive ? {boxShadow:'0 0 0 2px var(--graphite-accent) inset', background:'var(--graphite-bg)'}:{}}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Tier 2 · Ledger</div>
                <span className="font-mono text-[10px] text-[color:var(--graphite-mute)]">SharePoint</span>
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                {[
                  {id:'DP-H-014', sev:'High', on: ledgerActive},
                  {id:'DP-S-003', sev:'Std',  on: ledgerActive, dim:true},
                  {id:'ID-H-007', sev:'High', on: ledgerActive},
                  {id:'IP-S-002', sev:'Std',  on: ledgerActive},
                  {id:'LC-S-001', sev:'Std',  on: ledgerActive},
                  {id:'TM-S-011', sev:'Std',  on: ledgerActive},
                ].map(r=>(
                  <div key={r.id} className={`flex items-center justify-between px-2 py-1 rounded-sm border hairline-g ${r.dim && forgeActive?'opacity-30 line-through':''}`}>
                    <span>{r.id}</span>
                    <span className="text-[color:var(--graphite-mute)]">{r.sev}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`border hairline-g rounded-sm p-4 transition-all ${forgeActive?'':'opacity-40'}`}
                 style={forgeActive && !auditReady ? {boxShadow:'0 0 0 2px var(--graphite-accent) inset', background:'var(--graphite-bg)'}:{}}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Tier 3 · Forge</div>
                <span className="font-mono text-[10px] text-[color:var(--graphite-mute)]">python</span>
              </div>

              <div className="flex items-center gap-3">
                <svg width="44" height="52" viewBox="0 0 44 52">
                  <rect x="2" y="2" width="40" height="48" fill="#FFFFFF" stroke="var(--graphite-ink)" strokeWidth="1"/>
                  {[10,16,22,28,34,40].map(y=>(
                    <line key={y} x1="8" y1={y} x2={y%2===0?34:28} y2={y} stroke="var(--graphite-ink)" strokeWidth=".6" opacity={docxReady?.9:.3}/>
                  ))}
                  {docxReady && <circle cx="36" cy="46" r="5" fill="var(--graphite-accent)"/>}
                </svg>
                <div>
                  <div className="text-sm font-semibold">{docxReady ? 'contract.docx' : 'assembling…'}</div>
                  <div className="font-mono text-[10px] text-[color:var(--graphite-mute)]">5 clauses · 0 conflicts</div>
                </div>
              </div>

              {auditReady && (
                <div className="mt-3 pt-3 border-t hairline-g flex items-center justify-between">
                  <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Audit</div>
                  <div className="chip" style={{background:'var(--graphite-accent)', color:'#fff'}}>posted to Legal</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">
        <span>Fig. 10 — Interactive walkthrough</span>
        <span>Palette · Graphite</span>
      </div>
    </SampleCard>
  );
}

function ChatBubble({ who, active, tone, children }) {
  if (!active) return <div className="h-8 rounded-sm bg-[color:var(--graphite-line)] opacity-40"></div>;
  const isBot = tone === 'bot';
  return (
    <div className={`rounded-sm p-2.5 text-[12px] leading-relaxed border hairline-g ${isBot?'':'ml-8'}`}
         style={isBot ? {background:'#FFFFFF'} : {background:'var(--graphite-bg)'}}>
      <div className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--graphite-mute)] mb-1">{who}</div>
      <div>{children}</div>
    </div>
  );
}

window.S10_Interactive = S10_Interactive;
