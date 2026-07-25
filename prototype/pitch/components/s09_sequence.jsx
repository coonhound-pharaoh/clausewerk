// Sample 09 — Sequence diagram: swim-lanes Intake / Ledger / Forge (Ivory)
function S09_Sequence() {
  const messages = [
    { from:'user',   to:'intake', label:'procurement question',   kind:'talk' },
    { from:'intake', to:'user',   label:'follow-up probes',        kind:'talk' },
    { from:'intake', to:'forge',  label:'manifest.json',           kind:'data' },
    { from:'forge',  to:'ledger', label:'query(category, severity)', kind:'call' },
    { from:'ledger', to:'forge',  label:'rows[] → candidate clauses', kind:'data' },
    { from:'forge',  to:'forge',  label:'resolve conflicts',       kind:'self' },
    { from:'forge',  to:'sharepoint', label:'upload(contract.docx)', kind:'data' },
    { from:'forge',  to:'legal', label:'audit summary',             kind:'data' },
  ];
  const lanes = ['user','intake','ledger','forge','sharepoint','legal'];
  const laneLabels = { user:'Requester', intake:'Intake', ledger:'Ledger', forge:'Forge', sharepoint:'SharePoint', legal:'Legal' };

  return (
    <SampleCard palette="ivory" className="p-10">
      <SampleHeader
        idx={9}
        kicker="Sequence"
        title="Who talks to whom, in what order"
        subtitle="Six actors, eight messages. The conversation moves left-to-right, with only the manifest and clause IDs crossing the trust boundary."
        palette="ivory"
      />

      <div data-screen-label="09 Sequence" className="border hairline-i rounded-sm bg-white p-8">
        {/* Swim lane header */}
        <div className="grid" style={{gridTemplateColumns:`repeat(${lanes.length}, 1fr)`}}>
          {lanes.map((l, i) => (
            <div key={l} className="text-center pb-3 border-b hairline-i">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--ivory-mute)]">Actor</div>
              <div className="text-sm font-semibold mt-1">{laneLabels[l]}</div>
            </div>
          ))}
        </div>

        {/* Swim lanes + messages */}
        <div className="relative" style={{height: messages.length * 54 + 30}}>
          {/* Vertical lifelines */}
          <div className="absolute inset-0 grid" style={{gridTemplateColumns:`repeat(${lanes.length}, 1fr)`}}>
            {lanes.map(l=>(
              <div key={l} className="flex justify-center">
                <div className="w-px h-full" style={{background:'var(--ivory-line)'}}></div>
              </div>
            ))}
          </div>

          {/* Messages */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${lanes.length*100} ${messages.length*54+30}`}>
            {messages.map((m, i) => {
              const y = 28 + i * 54;
              const fromX = lanes.indexOf(m.from) * 100 + 50;
              const toX   = lanes.indexOf(m.to)   * 100 + 50;
              const color = m.kind==='data' ? 'var(--ivory-accent)' : m.kind==='call' ? 'var(--ivory-ink)' : '#78706A';
              if (m.kind === 'self') {
                return (
                  <g key={i}>
                    <path d={`M ${fromX} ${y} h 20 v 12 h -20`} stroke={color} fill="none" strokeWidth="1"/>
                    <path d={`M ${fromX+6} ${y+8} L ${fromX} ${y+12} L ${fromX+6} ${y+16}`} stroke={color} fill="none" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    <text x={fromX+28} y={y+8} fontFamily="JetBrains Mono" fontSize="10" fill={color}>{m.label}</text>
                  </g>
                );
              }
              const dir = toX > fromX ? 1 : -1;
              const arrowStart = toX - 6 * dir;
              return (
                <g key={i}>
                  <line x1={fromX} y1={y} x2={toX} y2={y} stroke={color} strokeWidth="1.2" className={m.kind==='data'?'flow-line':''}/>
                  <path d={`M ${arrowStart} ${y-4} L ${toX} ${y} L ${arrowStart} ${y+4}`} fill={color}/>
                  <rect x={(fromX+toX)/2 - (m.label.length*3.2)} y={y-15} width={m.label.length*6.4} height="12" fill="#FFFFFF"/>
                  <text x={(fromX+toX)/2} y={y-6} fontFamily="JetBrains Mono" fontSize="10" fill={color} textAnchor="middle">{m.label}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t hairline-i flex items-center justify-between">
          <div className="flex items-center gap-5 text-xs">
            <span className="flex items-center gap-2"><span className="w-6 h-px" style={{background:'#78706A'}}></span> conversation</span>
            <span className="flex items-center gap-2"><span className="w-6 h-px" style={{background:'var(--ivory-ink)'}}></span> call</span>
            <span className="flex items-center gap-2"><span className="w-6 h-px" style={{background:'var(--ivory-accent)'}}></span> data payload</span>
          </div>
          <div className="font-mono text-[11px] text-[color:var(--ivory-mute)]">8 messages · 6 actors · 1 trust boundary</div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--ivory-mute)]">
        <span>Fig. 09 — Sequence diagram</span>
        <span>Palette · Ivory</span>
      </div>
    </SampleCard>
  );
}
window.S09_Sequence = S09_Sequence;
