// Sample 04 — Before/after: status quo vs. new process (Graphite)
function S04_BeforeAfter() {
  const beforeSteps = [
    "Procurement receives vendor request",
    "Forward to legal intake inbox",
    "Legal triages, assigns paralegal",
    "Paralegal interviews requester",
    "Manually categorizes risks (spreadsheet)",
    "Searches precedent folders",
    "Copies clauses into draft",
    "Reviews for conflicts manually",
    "Rewrites to match context",
    "Partner review + redline",
    "Second pass — compliance check",
    "Version control in email chain",
    "Finalize, export, upload",
    "Log to matter management",
  ];
  const afterSteps = [
    "Requester speaks to Intake",
    "Manifest emitted + validated",
    "Forge selects & assembles",
    "Dossier uploaded + audit posted",
  ];

  return (
    <SampleCard palette="graphite" className="p-10">
      <SampleHeader
        idx={4}
        kicker="Process delta"
        title="Fourteen steps become four"
        subtitle="The same contract, the same legal rigor — with the hand-offs collapsed into a single conversation and a single build."
        palette="graphite"
      />

      <div data-screen-label="04 Before After" className="grid grid-cols-12 gap-8">
        {/* Before */}
        <div className="col-span-7 border hairline-g rounded-sm bg-white p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Before</div>
              <h3 className="text-xl font-semibold tracking-tight mt-1">Manual bespoke drafting</h3>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--graphite-mute)]">14 steps · many handoffs</div>
          </div>

          <ol className="space-y-0">
            {beforeSteps.map((s, i) => (
              <li key={i} className="flex items-center gap-4 py-2 border-b last:border-0 hairline-g">
                <span className="font-mono text-[10px] text-[color:var(--graphite-mute)] w-6">{String(i+1).padStart(2,'0')}</span>
                <span className="flex-1 text-sm">{s}</span>
                <span className="font-mono text-[10px] text-[color:var(--graphite-mute)] uppercase tracking-widest">{
                  ['req','ops','legal','legal','legal','legal','legal','legal','legal','partner','comp','email','ops','ops'][i]
                }</span>
              </li>
            ))}
          </ol>

          <div className="mt-4 pt-4 border-t hairline-g flex items-center justify-between">
            <div className="text-sm text-[color:var(--graphite-mute)]">Typical turnaround</div>
            <div className="font-mono text-sm">days–weeks</div>
          </div>
        </div>

        {/* Arrow */}
        <div className="col-span-1 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="19" fill="none" stroke="var(--graphite-line)" strokeWidth="1"/>
            <path d="M12 20 L26 20 M22 14 L28 20 L22 26" stroke="var(--graphite-ink)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* After */}
        <div className="col-span-4 border rounded-sm p-6" style={{background:'var(--graphite-ink)', color:'var(--graphite-bg)', borderColor:'var(--graphite-ink)'}}>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase opacity-60">After</div>
              <h3 className="text-xl font-semibold tracking-tight mt-1">Assembled from approved parts</h3>
            </div>
          </div>

          <ol className="space-y-3">
            {afterSteps.map((s, i) => (
              <li key={i} className="border border-white/10 rounded-sm p-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-[10px] opacity-60">{String(i+1).padStart(2,'0')}</span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{background:'var(--graphite-accent)'}}></span>
                  <span className="text-sm font-medium">{s}</span>
                </div>
                <div className="pl-8 font-mono text-[10px] opacity-50 uppercase tracking-widest">{
                  ['intake','intake → forge','forge → ledger','forge → sharepoint'][i]
                }</div>
              </li>
            ))}
          </ol>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
            <div className="text-sm opacity-60">Typical turnaround</div>
            <div className="font-mono text-sm">minutes</div>
          </div>

          <div className="mt-5 p-3 border border-dashed border-white/15 rounded-sm">
            <div className="font-mono text-[10px] tracking-widest uppercase opacity-60 mb-1">Net effect</div>
            <div className="text-sm leading-relaxed">Legal time shifts from drafting to <span style={{color:'var(--graphite-accent)'}}>governing the clause bank</span>.</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">
        <span>Fig. 04 — Status quo vs. proposed</span>
        <span>Palette · Graphite</span>
      </div>
    </SampleCard>
  );
}
window.S04_BeforeAfter = S04_BeforeAfter;
