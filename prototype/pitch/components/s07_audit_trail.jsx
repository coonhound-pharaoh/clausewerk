// Sample 07 — Audit trail dashboard: justification ↔ selected clause (Graphite)
function S07_AuditTrail() {
  const rows = [
    { cat:'Data Privacy',   sev:'High',     id:'DP-H-014', just:'Vendor processes EU PII at rest and in transit.', clause:'Controller agrees to process Personal Data strictly in accordance with Articles 28–32 GDPR, maintaining a Record of Processing Activities…' },
    { cat:'Indemnity',      sev:'High',     id:'ID-H-007', just:'Cross-border claims exposure above $250K threshold.', clause:'Each party shall defend, indemnify, and hold harmless the other from all third-party claims arising from gross negligence, intentional misconduct, or material breach…' },
    { cat:'IP & Licensing', sev:'Standard', id:'IP-S-002', just:'Off-the-shelf license only; no derivative works.', clause:'Licensor grants a non-exclusive, non-transferable license to use the Software as configured, excluding any right to create derivative works…' },
    { cat:'Liability Cap',  sev:'Standard', id:'LC-S-001', just:'Cap at 12 months fees per policy baseline.', clause:'In no event shall either party\'s aggregate liability exceed the fees paid during the twelve (12) months preceding the claim…' },
    { cat:'Termination',    sev:'Standard', id:'TM-S-011', just:'Std 30-day convenience + 15-day cure.', clause:'Either party may terminate this Agreement for convenience upon thirty (30) days written notice, or for uncured material breach after fifteen (15) days…' },
  ];

  return (
    <SampleCard palette="graphite" className="p-10">
      <SampleHeader
        idx={7}
        kicker="Audit trail"
        title="The summary Legal actually wants"
        subtitle="Every clause in the dossier traces back to the conversation that justified it. Reviewers scan, not redraft."
        palette="graphite"
      />

      <div data-screen-label="07 Audit Trail" className="border hairline-g rounded-sm bg-white">
        {/* Header strip */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b hairline-g items-center">
          <div className="col-span-5">
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Matter</div>
            <div className="text-lg font-semibold tracking-tight">Northwind Analytics — MSA</div>
          </div>
          <div className="col-span-3">
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Dossier</div>
            <div className="font-mono text-xs">NW-MSA-2026-0417.docx</div>
          </div>
          <div className="col-span-2">
            <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">Run ID</div>
            <div className="font-mono text-xs">run_8c21a9</div>
          </div>
          <div className="col-span-2 text-right">
            <span className="chip border hairline-g text-[color:var(--graphite-ink)]" style={{background:'var(--graphite-bg)'}}>
              <span className="w-1.5 h-1.5 rounded-full" style={{background:'var(--graphite-accent)'}}></span>
              Ready for review
            </span>
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b hairline-g font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">
          <div className="col-span-2">Category</div>
          <div className="col-span-1">Severity</div>
          <div className="col-span-2">Clause ID</div>
          <div className="col-span-3">LLM justification</div>
          <div className="col-span-4">Selected clause (first 220 chars)</div>
        </div>

        {/* Rows */}
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4 border-b last:border-0 hairline-g items-start">
            <div className="col-span-2">
              <div className="text-sm font-medium">{r.cat}</div>
              <div className="font-mono text-[10px] text-[color:var(--graphite-mute)]">{RISK_CATEGORIES.find(x=>x.label===r.cat)?.short}</div>
            </div>
            <div className="col-span-1">
              <span className="chip border hairline-g" style={r.sev==='High'?{
                background:'var(--graphite-ink)', color:'var(--graphite-bg)', borderColor:'var(--graphite-ink)'
              }:{}}>
                {r.sev}
              </span>
            </div>
            <div className="col-span-2 font-mono text-xs pt-1">{r.id}</div>
            <div className="col-span-3 text-sm text-[color:var(--graphite-mute)] italic leading-relaxed">"{r.just}"</div>
            <div className="col-span-4 text-sm leading-relaxed">{r.clause}</div>
          </div>
        ))}

        {/* Footer */}
        <div className="grid grid-cols-4 gap-px bg-[color:var(--graphite-line)]">
          {[
            {k:'Risks identified', v:'5'},
            {k:'Clauses selected', v:'5'},
            {k:'Conflicts resolved', v:'2'},
            {k:'Hallucinations possible', v:'0'},
          ].map(x=>(
            <div key={x.k} className="bg-white p-4">
              <div className="font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">{x.k}</div>
              <div className="text-2xl font-semibold tracking-tight mt-1 font-serif">{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[10px] tracking-widest uppercase text-[color:var(--graphite-mute)]">
        <span>Fig. 07 — Audit summary</span>
        <span>Palette · Graphite</span>
      </div>
    </SampleCard>
  );
}
window.S07_AuditTrail = S07_AuditTrail;
