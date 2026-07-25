// Sample 03 — Isometric blueprint: three-tier stack with data packets in flight
function S03_Blueprint() {
  return (
    <SampleCard palette="ivory" className="p-10">
      <SampleHeader
        idx={3}
        kicker="Blueprint"
        title="The stack, viewed from the side"
        subtitle="An isometric cross-section. Data enters as speech, settles as structure, emerges as a signed document."
        palette="ivory"
      />

      <div className="relative border hairline-i rounded-sm bp-grid p-8" style={{background:'#FBF8EF'}} data-screen-label="03 Blueprint">
        <svg viewBox="0 0 900 440" className="w-full h-auto">
          {/* Soft drop shadow */}
          <defs>
            <linearGradient id="slab1" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF"/>
              <stop offset="100%" stopColor="#EDE5D1"/>
            </linearGradient>
            <linearGradient id="slab2" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#F2EAD5"/>
              <stop offset="100%" stopColor="#DCCFA8"/>
            </linearGradient>
            <linearGradient id="slab3" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#E6D9AE"/>
              <stop offset="100%" stopColor="#C4B07A"/>
            </linearGradient>
          </defs>

          {/* Base ground grid */}
          <g opacity=".25" stroke="#A59876" strokeWidth=".5">
            {Array.from({length: 12}).map((_,i)=>(
              <line key={'h'+i} x1={80+i*60} y1="340" x2={80+i*60-120} y2="420"/>
            ))}
            {Array.from({length: 7}).map((_,i)=>(
              <line key={'v'+i} x1={80-i*20} y1={340+i*13} x2={800-i*20} y2={340+i*13}/>
            ))}
          </g>

          {/* Tier 3 (bottom): Forge */}
          <IsoSlab x={120} y={280} w={640} h={40} fill="url(#slab3)" label="FORGE" sub="python" />
          {/* Tier 2: Ledger */}
          <IsoSlab x={150} y={200} w={580} h={40} fill="url(#slab2)" label="LEDGER" sub="sharepoint" />
          {/* Tier 1 (top): Intake */}
          <IsoSlab x={180} y={120} w={520} h={40} fill="url(#slab1)" label="INTAKE" sub="llm" />

          {/* Columns / connectors between tiers */}
          {[260, 380, 500, 620].map((x,i)=>(
            <g key={x}>
              <line x1={x} y1={160} x2={x-30} y2={200} stroke="#8C7E5A" strokeWidth="1" strokeDasharray="3 3"/>
              <line x1={x-30} y1={240} x2={x-60} y2={280} stroke="#8C7E5A" strokeWidth="1" strokeDasharray="3 3"/>
            </g>
          ))}

          {/* Data packets in flight */}
          <g>
            {/* Speech bubble going into Intake */}
            <g transform="translate(80,80)">
              <rect x="0" y="0" width="110" height="28" rx="14" fill="#1A1714" opacity=".92"/>
              <text x="14" y="18" fontFamily="JetBrains Mono" fontSize="11" fill="#F5F1E8">"EU PII, high-value…"</text>
            </g>
            <path d="M 190 94 C 220 100, 230 108, 250 122" stroke="#1A1714" strokeWidth="1.2" fill="none" className="flow-line"/>

            {/* JSON packet between tier 1 and 2 */}
            <g transform="translate(380,168)">
              <rect x="-40" y="-12" width="80" height="24" rx="3" fill="#F5F1E8" stroke="#1A1714" strokeWidth="1"/>
              <text x="0" y="4" fontFamily="JetBrains Mono" fontSize="10" textAnchor="middle" fill="#1A1714">manifest.json</text>
            </g>

            {/* Clause IDs coming out of Ledger */}
            <g transform="translate(580,250)">
              {['DP-H-014','ID-H-007','IP-S-002'].map((id,i)=>(
                <g key={id} transform={`translate(${i*-14},${i*-10})`}>
                  <rect x="-44" y="-8" width="88" height="16" rx="2" fill="#FBF8EF" stroke="#1A1714" strokeWidth=".8"/>
                  <text x="0" y="4" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle" fill="#1A1714">{id}</text>
                </g>
              ))}
            </g>

            {/* Document emerging from Forge */}
            <g transform="translate(760,300)">
              <rect x="-18" y="-24" width="36" height="48" fill="#FFFFFF" stroke="#1A1714" strokeWidth="1"/>
              {[-14,-8,-2,4,10,16].map(y=>(
                <line key={y} x1="-14" y1={y} x2={y%4===0?10:8} y2={y} stroke="#1A1714" strokeWidth=".6" opacity=".6"/>
              ))}
              <circle cx="0" cy="34" r="5" fill="var(--ivory-accent)"/>
              <text x="0" y="36" textAnchor="middle" fontSize="6" fontFamily="JetBrains Mono" fill="#1A1714" fontWeight="700">.docx</text>
            </g>
          </g>

          {/* Side annotations */}
          <g fontFamily="JetBrains Mono" fontSize="10" fill="#78706A">
            <text x="20" y="144">T1</text>
            <text x="20" y="224">T2</text>
            <text x="20" y="304">T3</text>
          </g>
        </svg>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-6 mt-4">
          {TIERS.map((t,i) => (
            <div key={t.key} className="flex items-start gap-3">
              <div className="font-mono text-[10px] text-[color:var(--ivory-mute)] tracking-widest">T{i+1}</div>
              <div>
                <div className="text-sm font-semibold">{t.product} <span className="font-mono text-[11px] text-[color:var(--ivory-mute)] font-normal">/ {t.gemini}</span></div>
                <div className="text-xs text-[color:var(--ivory-mute)]">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--ivory-mute)]">
        <span>Fig. 03 — Isometric blueprint</span>
        <span>Palette · Ivory</span>
      </div>
    </SampleCard>
  );
}

function IsoSlab({ x, y, w, h, fill, label, sub }) {
  const d = 30; // iso depth
  const topPath = `M ${x} ${y} L ${x+w} ${y} L ${x+w-d} ${y+d} L ${x-d} ${y+d} Z`;
  const frontPath = `M ${x-d} ${y+d} L ${x+w-d} ${y+d} L ${x+w-d} ${y+d+h} L ${x-d} ${y+d+h} Z`;
  const sidePath  = `M ${x+w} ${y} L ${x+w-d} ${y+d} L ${x+w-d} ${y+d+h} L ${x+w} ${y+h} Z`;
  return (
    <g>
      <path d={sidePath} fill={fill} stroke="#1A1714" strokeWidth="1" opacity=".9"/>
      <path d={frontPath} fill={fill} stroke="#1A1714" strokeWidth="1"/>
      <path d={topPath} fill="#FFFFFF" stroke="#1A1714" strokeWidth="1"/>
      <text x={x+14-d} y={y+d+h/2+5} fontFamily="Inter" fontSize="13" fontWeight="700" fill="#1A1714" letterSpacing="1">{label}</text>
      <text x={x+w-d-14} y={y+d+h/2+5} fontFamily="JetBrains Mono" fontSize="10" textAnchor="end" fill="#78706A">{sub}</text>
    </g>
  );
}

window.S03_Blueprint = S03_Blueprint;
