// Sample 01 — System diagram: three pillars with labeled handoffs
function S01_SystemDiagram() {
  return (
    <SampleCard palette="graphite" className="p-10">
      <SampleHeader
        idx={1}
        kicker="System architecture"
        title="Three tiers, two handoffs, one source of truth"
        subtitle="A conversational front door, a locked vault of approved language, and deterministic assembly in between."
        palette="graphite"
      />

      <div className="relative bp-grid rounded-sm border hairline-g p-10" data-screen-label="01 System Diagram">
        {/* Pillars */}
        <div className="grid grid-cols-3 gap-6 relative">
          {TIERS.map((t, i) => (
            <div key={t.key} className="relative">
              <div className="bg-white border hairline-g rounded-sm p-6 h-full" style={{boxShadow:'0 1px 0 rgba(0,0,0,.02)'}}>
                <div className="flex items-center justify-between mb-5">
                  <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Tier {i+1}</div>
                  <div className="font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-full border hairline-g text-[color:var(--graphite-mute)]">{t.engine}</div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-3xl font-semibold tracking-tight">{t.product}</h3>
                  <span className="font-mono text-[11px] text-[color:var(--graphite-mute)]">/ {t.gemini}</span>
                </div>
                <p className="text-sm text-[color:var(--graphite-mute)] leading-relaxed mt-2 mb-6">{t.role}</p>

                <div className="pt-4 border-t hairline-g">
                  <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)] mb-2">Responsibilities</div>
                  <ul className="text-sm space-y-1.5">
                    {i===0 && (<>
                      <li>• Conduct procurement intake</li>
                      <li>• Classify risks by category</li>
                      <li>• Assign severity: Standard / High</li>
                      <li>• Emit strict JSON manifest</li>
                    </>)}
                    {i===1 && (<>
                      <li>• Store pre-approved clause text</li>
                      <li>• Key: Clause ID, Category, Severity</li>
                      <li>• Versioned, legally signed off</li>
                      <li>• LLM never writes — only selects</li>
                    </>)}
                    {i===2 && (<>
                      <li>• Query SharePoint via O365 / pandas</li>
                      <li>• Resolve conflicts (mutual exclusivity)</li>
                      <li>• Assemble via python-docx</li>
                      <li>• Upload + emit audit summary</li>
                    </>)}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t hairline-g flex items-center justify-between">
                  <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Emits</div>
                  <div className="font-mono text-xs px-2 py-1 rounded-sm" style={{background:'var(--graphite-ink)', color:'var(--graphite-bg)'}}>{t.artifact}</div>
                </div>
              </div>

              {/* Arrow between pillars */}
              {i < 2 && (
                <div className="absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                  <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
                    <line x1="0" y1="10" x2="24" y2="10" stroke="var(--graphite-accent)" strokeWidth="1.5" className="flow-line"/>
                    <path d="M22 4 L30 10 L22 16" stroke="var(--graphite-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom rail: output + audit */}
        <div className="grid grid-cols-2 gap-6 mt-8">
          <div className="border hairline-g rounded-sm bg-white p-5 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Output A</div>
              <div className="text-lg font-semibold mt-1">Contract.docx</div>
              <div className="text-xs text-[color:var(--graphite-mute)]">Assembled from approved clauses only</div>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--graphite-mute)]">→ SharePoint /contracts/outbound/</div>
          </div>
          <div className="border hairline-g rounded-sm bg-white p-5 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Output B</div>
              <div className="text-lg font-semibold mt-1">Audit summary</div>
              <div className="text-xs text-[color:var(--graphite-mute)]">Justification ↔ selected clause, per risk</div>
            </div>
            <div className="font-mono text-[11px] text-[color:var(--graphite-mute)]">→ Legal review queue</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">
        <span>Fig. 01 — System diagram</span>
        <span>Palette · Graphite</span>
      </div>
    </SampleCard>
  );
}
window.S01_SystemDiagram = S01_SystemDiagram;
