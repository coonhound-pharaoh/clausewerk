// Sample 06 — Conflict matrix: mutual exclusivity logic (Midnight)
function S06_ConflictMatrix() {
  const cats = ['Data Privacy','Indemnity','IP & Licensing','Liability Cap','Termination'];
  // Priority rule: for each category, High > Standard when both appear.
  const variants = ['Standard', 'High'];

  return (
    <SampleCard palette="midnight" className="p-10">
      <SampleHeader
        idx={6}
        kicker="Conflict resolution"
        title="One category, one clause — the matrix decides"
        subtitle="When the manifest requests multiple variants for the same category, Forge picks the highest-priority match. No overlap reaches the final document."
        palette="midnight"
      />

      <div data-screen-label="06 Conflict Matrix" className="grid grid-cols-12 gap-6">
        <div className="col-span-7 border hairline-m rounded-sm p-6 bp-grid-dark" style={{background:'rgba(255,255,255,0.02)'}}>
          <div className="grid" style={{gridTemplateColumns:`160px repeat(${variants.length}, 1fr)`, gap:'6px'}}>
            <div></div>
            {variants.map(v=>(
              <div key={v} className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] text-center pb-2">{v}</div>
            ))}
            {cats.map(cat => (
              <React.Fragment key={cat}>
                <div className="text-sm py-3 border-t hairline-m">{cat}</div>
                {variants.map(v => {
                  const isHigh = v === 'High';
                  // sample manifest says Data Privacy & Indemnity were High; others Standard
                  const manifest = (cat==='Data Privacy'||cat==='Indemnity') ? 'High' : 'Standard';
                  const selected = v === manifest;
                  return (
                    <div key={v} className="border-t hairline-m py-2">
                      <div className={`rounded-sm p-2.5 text-center font-mono text-[11px] ${selected?'':'opacity-30'}`}
                           style={selected ? {
                             background: isHigh ? 'var(--mid-accent)' : 'rgba(232,230,223,0.1)',
                             color: isHigh ? 'var(--mid-bg)' : 'var(--mid-ink)',
                             fontWeight: 600
                           } : {border:'1px dashed var(--mid-line)'}}>
                        {selected ? (isHigh ? '◉ selected · HIGH' : '◉ selected · STD') : '○ suppressed'}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t hairline-m flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">Rule</div>
            <div className="font-mono text-[11px]">High &gt; Standard &nbsp;·&nbsp; one row, one winner</div>
          </div>
        </div>

        {/* Priority ladder */}
        <div className="col-span-5 flex flex-col gap-4">
          <div className="border hairline-m rounded-sm p-6" style={{background:'rgba(255,255,255,0.02)'}}>
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] mb-4">Priority ladder</div>
            <div className="space-y-2">
              <LadderRow level="P0" label="High + jurisdiction match" note="picked first" active/>
              <LadderRow level="P1" label="High, generic" note="fallback for High"/>
              <LadderRow level="P2" label="Standard + jurisdiction match" note=""/>
              <LadderRow level="P3" label="Standard, generic" note=""/>
            </div>
          </div>

          <div className="border hairline-m rounded-sm p-6" style={{background:'rgba(255,255,255,0.02)'}}>
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)] mb-3">Why it matters</div>
            <ul className="text-sm space-y-2 leading-relaxed">
              <li>· Guarantees <span style={{color:'var(--mid-accent)'}}>mutual exclusivity</span> per category.</li>
              <li>· Deterministic &mdash; same manifest, same output, every run.</li>
              <li>· Moves the judgment call into a <span style={{color:'var(--mid-accent)'}}>rule Legal owns</span>, not prompt engineering.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--mid-mute)]">
        <span>Fig. 06 — Conflict matrix</span>
        <span>Palette · Midnight</span>
      </div>
    </SampleCard>
  );
}

function LadderRow({ level, label, note, active }) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-sm border hairline-m ${active?'':'opacity-60'}`}
         style={active?{background:'rgba(134,239,217,0.08)'}:{}}>
      <div className="font-mono text-[10px] w-8" style={{color: active?'var(--mid-accent)':'var(--mid-mute)'}}>{level}</div>
      <div className="text-sm flex-1">{label}</div>
      <div className="font-mono text-[10px] text-[color:var(--mid-mute)]">{note}</div>
    </div>
  );
}

window.S06_ConflictMatrix = S06_ConflictMatrix;
