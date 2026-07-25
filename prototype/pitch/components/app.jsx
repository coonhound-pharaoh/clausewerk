// Main app: scrollable one-pager assembling all 10 samples
function App() {
  const samples = [
    { id: 1, C: S01_SystemDiagram, palette:'Graphite', kind:'System diagram'  },
    { id: 2, C: S02_DataFlow,       palette:'Midnight', kind:'Pipeline' },
    { id: 3, C: S03_Blueprint,      palette:'Ivory',    kind:'Blueprint' },
    { id: 4, C: S04_BeforeAfter,    palette:'Graphite', kind:'Before / after' },
    { id: 5, C: S05_RiskTaxonomy,   palette:'Ivory',    kind:'Taxonomy' },
    { id: 6, C: S06_ConflictMatrix, palette:'Midnight', kind:'Conflict matrix' },
    { id: 7, C: S07_AuditTrail,     palette:'Graphite', kind:'Audit dashboard' },
    { id: 8, C: S08_Firewall,       palette:'Midnight', kind:'Firewall' },
    { id: 9, C: S09_Sequence,       palette:'Ivory',    kind:'Sequence' },
    { id:10, C: S10_Interactive,    palette:'Graphite', kind:'Interactive' },
  ];

  return (
    <div className="min-h-screen">
      {/* Top banner */}
      <header className="px-10 pt-12 pb-10 max-w-[1280px] mx-auto">
        <div className="flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)] mb-10">
          <div>Exec pitch · v1 · Apr 2026</div>
          <div>Ten visualization candidates</div>
        </div>

        <div className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-8">
            <div className="font-mono text-[11px] tracking-widest uppercase text-[color:var(--graphite-mute)] mb-3">Procurement contract assembly</div>
            <h1 className="text-6xl font-semibold tracking-tight leading-[1.02] font-serif">
              An LLM to listen.<br/>
              A ledger to decide.<br/>
              Python to assemble.
            </h1>
            <p className="text-[15px] text-[color:var(--graphite-mute)] mt-6 max-w-xl leading-relaxed">
              Ten ways to tell the same story to the CIO and CEO. Each sample frames one facet — the architecture, the data flow, the compliance surface, the operating delta — in a different visual vocabulary. Scroll to see them all; pick two or three for the deck.
            </p>
          </div>

          <div className="col-span-4">
            <div className="border hairline-g rounded-sm p-5 bg-white">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)] mb-3">The three tiers</div>
              <div className="space-y-2">
                {TIERS.map(t=>(
                  <div key={t.key} className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0 hairline-g">
                    <div>
                      <div className="text-sm font-semibold">{t.product} <span className="font-mono text-[11px] text-[color:var(--graphite-mute)] font-normal">/ {t.gemini}</span></div>
                      <div className="text-[11px] text-[color:var(--graphite-mute)]">{t.role}</div>
                    </div>
                    <div className="font-mono text-[10px] text-[color:var(--graphite-mute)] whitespace-nowrap pt-1">{t.engine}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Index strip */}
        <div className="mt-10 grid grid-cols-10 gap-2">
          {samples.map(s=>(
            <a key={s.id} href={`#s${s.id}`} className="block border hairline-g rounded-sm bg-white p-3 hover:bg-[color:var(--graphite-bg)]">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">{String(s.id).padStart(2,'0')}</div>
              <div className="text-xs font-semibold mt-1 tracking-tight truncate">{s.kind}</div>
              <div className="font-mono text-[9px] text-[color:var(--graphite-mute)] mt-1">{s.palette}</div>
            </a>
          ))}
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-10 pb-24 space-y-14">
        {samples.map(s => (
          <div key={s.id} id={`s${s.id}`}>
            <s.C />
          </div>
        ))}
      </main>

      <footer className="max-w-[1280px] mx-auto px-10 py-10 border-t hairline-g flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">
        <div>Contract Assembly — exec pitch candidates</div>
        <div>Intake · Ledger · Forge</div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
