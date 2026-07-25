// Sample 08 — Hallucination firewall (Midnight)
function S08_Firewall() {
  return (
    <SampleCard palette="midnight" className="p-10">
      <SampleHeader
        idx={8}
        kicker="Containment"
        title="The LLM never touches legal text"
        subtitle="A hard boundary separates probabilistic reasoning from deterministic composition. Only clause IDs cross the wall."
        palette="midnight"
      />

      <div data-screen-label="08 Firewall" className="border hairline-m rounded-sm p-8 bp-grid-dark relative" style={{background:'rgba(255,255,255,0.02)'}}>
        <div className="grid grid-cols-12 gap-6 items-stretch">
          {/* Left: probabilistic zone */}
          <div className="col-span-5 border border-dashed hairline-m rounded-sm p-6" style={{background:'rgba(0,0,0,0.25)'}}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">Probabilistic zone</div>
              <div className="chip border hairline-m text-[color:var(--mid-mute)]">LLM</div>
            </div>
            <div className="text-2xl font-semibold tracking-tight mb-2">Intake</div>
            <div className="text-sm text-[color:var(--mid-mute)] leading-relaxed mb-5">Free-form reasoning. Ambiguous language. May be wrong, but only about <em>classification</em>.</div>

            <div className="space-y-2">
              {['Understands context','Asks follow-ups','Assigns category','Sets severity','Writes justification'].map(x=>(
                <div key={x} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="w-1 h-1 rounded-full bg-[color:var(--mid-mute)]"></span>{x}
                </div>
              ))}
            </div>
          </div>

          {/* Middle: firewall */}
          <div className="col-span-2 flex flex-col items-center justify-center gap-3">
            <div className="font-mono text-[9px] tracking-widest uppercase text-[color:var(--mid-mute)]">Schema boundary</div>
            <div className="relative w-full h-64 flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 100 280" preserveAspectRatio="none">
                {/* Firewall */}
                <rect x="40" y="0" width="20" height="280" fill="none" stroke="var(--mid-accent)" strokeWidth="1" strokeDasharray="2 3"/>
                {/* Notches representing schema slots */}
                {[40,80,120,160,200,240].map(y=>(
                  <g key={y}>
                    <line x1="40" y1={y} x2="60" y2={y} stroke="var(--mid-accent)" strokeWidth=".8"/>
                  </g>
                ))}
                {/* Single allowed packet */}
                <g>
                  <rect x="36" y="134" width="28" height="16" rx="2" fill="var(--mid-accent)"/>
                  <text x="50" y="145" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fontWeight="700" fill="var(--mid-bg)">JSON</text>
                </g>
                {/* Blocked free text */}
                <g opacity=".7">
                  <rect x="2" y="40" width="34" height="10" fill="none" stroke="var(--mid-mute)" strokeWidth=".6" strokeDasharray="2 2"/>
                  <line x1="2" y1="40" x2="36" y2="50" stroke="var(--mid-mute)" strokeWidth=".6"/>
                  <rect x="2" y="220" width="34" height="10" fill="none" stroke="var(--mid-mute)" strokeWidth=".6" strokeDasharray="2 2"/>
                  <line x1="2" y1="220" x2="36" y2="230" stroke="var(--mid-mute)" strokeWidth=".6"/>
                </g>
              </svg>
            </div>
            <div className="font-mono text-[9px] tracking-widest uppercase text-center" style={{color:'var(--mid-accent)'}}>only validated<br/>manifest passes</div>
          </div>

          {/* Right: deterministic zone */}
          <div className="col-span-5 border hairline-m rounded-sm p-6" style={{background:'rgba(232,230,223,0.04)'}}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">Deterministic zone</div>
              <div className="chip" style={{background:'var(--mid-accent)', color:'var(--mid-bg)'}}>Python + SharePoint</div>
            </div>
            <div className="text-2xl font-semibold tracking-tight mb-2">Ledger &amp; Forge</div>
            <div className="text-sm text-[color:var(--mid-mute)] leading-relaxed mb-5">Typed lookups. Bit-for-bit approved text. Same input → same output, always.</div>

            <div className="space-y-2">
              {['Resolves ID → clause','Applies conflict matrix','Assembles via python-docx','Uploads to SharePoint','Emits audit summary'].map(x=>(
                <div key={x} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="w-1 h-1 rounded-full" style={{background:'var(--mid-accent)'}}></span>{x}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom claim band */}
        <div className="mt-8 grid grid-cols-3 gap-px bg-[color:var(--mid-line)] border hairline-m">
          {[
            {k:'LLM-authored legal text in output', v:'0 chars', good:true},
            {k:'Clauses traceable to approved source', v:'100%', good:true},
            {k:'Reviewer surface area', v:'justifications only', good:true},
          ].map(x=>(
            <div key={x.k} className="p-4" style={{background:'var(--mid-bg)'}}>
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">{x.k}</div>
              <div className="text-lg font-semibold tracking-tight mt-1" style={{color:x.good?'var(--mid-accent)':'var(--mid-ink)'}}>{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">
        <span>Fig. 08 — Hallucination firewall</span>
        <span>Palette · Midnight</span>
      </div>
    </SampleCard>
  );
}
window.S08_Firewall = S08_Firewall;
