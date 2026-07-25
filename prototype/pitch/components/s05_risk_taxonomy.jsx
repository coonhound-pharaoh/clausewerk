// Sample 05 — Risk taxonomy matrix: categories × severity (Ivory)
function S05_RiskTaxonomy() {
  // Coverage grid: for each category, clauses at Standard / High
  const coverage = [
    { cat: 'Data Privacy',   std: 3, high: 5, example: 'DP-H-014' },
    { cat: 'Indemnity',      std: 2, high: 4, example: 'ID-H-007' },
    { cat: 'IP & Licensing', std: 4, high: 3, example: 'IP-S-002' },
    { cat: 'Liability Cap',  std: 2, high: 3, example: 'LC-S-001' },
    { cat: 'Termination',    std: 3, high: 2, example: 'TM-S-011' },
    { cat: 'SLA & Uptime',   std: 2, high: 2, example: 'SL-H-005' },
    { cat: 'Payment Terms',  std: 3, high: 1, example: 'PT-S-022' },
    { cat: 'Subcontracting', std: 1, high: 2, example: 'SB-H-003' },
  ];

  return (
    <SampleCard palette="ivory" className="p-10">
      <SampleHeader
        idx={5}
        kicker="Risk taxonomy"
        title="Every risk has a category. Every category has pre-approved language."
        subtitle="Intake's job is classification, not composition. The grid below is the surface Forge draws from."
        palette="ivory"
      />

      <div data-screen-label="05 Risk Taxonomy" className="border hairline-i rounded-sm bg-white p-8">
        {/* Header row */}
        <div className="grid grid-cols-12 gap-3 pb-4 mb-4 border-b hairline-i font-mono text-[10px] tracking-widest uppercase text-[color:var(--ivory-mute)]">
          <div className="col-span-4">Risk category</div>
          <div className="col-span-2 text-right">Std clauses</div>
          <div className="col-span-2 text-right">High-risk</div>
          <div className="col-span-2">Example ID</div>
          <div className="col-span-2">Coverage</div>
        </div>

        {coverage.map((row, i) => {
          const total = row.std + row.high;
          const max = 10;
          return (
            <div key={row.cat} className="grid grid-cols-12 gap-3 items-center py-3 border-b last:border-0 hairline-i">
              <div className="col-span-4">
                <div className="text-[15px] font-medium tracking-tight">{row.cat}</div>
                <div className="font-mono text-[10px] text-[color:var(--ivory-mute)]">{RISK_CATEGORIES[i]?.short}</div>
              </div>
              <div className="col-span-2 text-right font-mono text-sm">{row.std}</div>
              <div className="col-span-2 text-right font-mono text-sm" style={{color:'var(--ivory-accent)'}}>{row.high}</div>
              <div className="col-span-2 font-mono text-[11px] text-[color:var(--ivory-mute)]">{row.example}</div>
              <div className="col-span-2 flex items-center gap-1">
                {Array.from({length: max}).map((_, j) => {
                  const on = j < total;
                  const isHigh = j >= row.std && j < total;
                  return (
                    <div key={j} className="h-5 flex-1 rounded-[1px]" style={{
                      background: on ? (isHigh ? 'var(--ivory-accent)' : 'var(--ivory-ink)') : 'var(--ivory-line)',
                      opacity: on ? 1 : .6,
                    }}></div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Footer legend */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-5 text-xs">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[1px]" style={{background:'var(--ivory-ink)'}}></span> Standard</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[1px]" style={{background:'var(--ivory-accent)'}}></span> High-risk variant</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-[1px]" style={{background:'var(--ivory-line)'}}></span> Headroom</span>
          </div>
          <div className="font-mono text-[11px] text-[color:var(--ivory-mute)]">24 std + 22 high = 46 clauses, maintained by Legal</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          {k:'Severity', v:'Standard | High', d:'Set by LLM during intake from conversation cues.'},
          {k:'Source of truth', v:'SharePoint list', d:'Legal owns the column; engineering reads it.'},
          {k:'Hallucination risk', v:'Zero-surface', d:'LLM never authors legal text — only selects IDs.'},
        ].map(x=>(
          <div key={x.k} className="border hairline-i rounded-sm bg-white p-5">
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--ivory-mute)]">{x.k}</div>
            <div className="text-base font-semibold tracking-tight mt-1">{x.v}</div>
            <div className="text-xs text-[color:var(--ivory-mute)] mt-2 leading-relaxed">{x.d}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--ivory-mute)]">
        <span>Fig. 05 — Risk taxonomy × severity</span>
        <span>Palette · Ivory</span>
      </div>
    </SampleCard>
  );
}
window.S05_RiskTaxonomy = S05_RiskTaxonomy;
