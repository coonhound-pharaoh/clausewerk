// Shared primitives used across all 10 samples
const { useState, useEffect, useRef, useMemo } = React;

const TIERS = [
  {
    key: 'intake',
    product: 'Intake',
    gemini: 'LLM Interviewer',
    role: 'Conversational risk discovery',
    engine: 'LLM',
    artifact: 'JSON manifest',
    color: 'intake',
  },
  {
    key: 'ledger',
    product: 'Ledger',
    gemini: 'Clause Bank',
    role: 'System of record for pre-approved text',
    engine: 'SharePoint',
    artifact: 'Excel / List',
    color: 'ledger',
  },
  {
    key: 'forge',
    product: 'Forge',
    gemini: 'Python Logic Engine',
    role: 'Deterministic assembly & conflict resolution',
    engine: 'Python',
    artifact: 'Word .docx',
    color: 'forge',
  },
];

const RISK_CATEGORIES = [
  { key: 'data',   label: 'Data Privacy',         short: 'DP' },
  { key: 'indem',  label: 'Indemnity',            short: 'ID' },
  { key: 'ip',     label: 'IP & Licensing',       short: 'IP' },
  { key: 'liab',   label: 'Liability Cap',        short: 'LC' },
  { key: 'term',   label: 'Termination',          short: 'TM' },
  { key: 'sla',    label: 'SLA & Uptime',         short: 'SL' },
  { key: 'pay',    label: 'Payment Terms',        short: 'PT' },
  { key: 'subs',   label: 'Subcontracting',       short: 'SB' },
];

const SAMPLE_MANIFEST = {
  vendor: "Northwind Analytics",
  value_usd: 240000,
  risks: [
    { category: "Data Privacy",   severity: "High",     justification: "Vendor processes EU PII at rest and in transit." },
    { category: "Indemnity",      severity: "High",     justification: "Cross-border claims exposure above $250K threshold." },
    { category: "IP & Licensing", severity: "Standard", justification: "No derivative works; off-the-shelf license only." },
    { category: "Liability Cap",  severity: "Standard", justification: "Cap at 12 months fees per policy baseline." },
    { category: "Termination",    severity: "Standard", justification: "Std 30-day convenience + 15-day cure." }
  ]
};

// Section header for each sample
function SampleHeader({ idx, kicker, title, subtitle, palette = 'graphite' }) {
  const ink = palette === 'midnight' ? 'text-[color:var(--mid-ink)]' : palette === 'ivory' ? 'text-[color:var(--ivory-ink)]' : 'text-[color:var(--graphite-ink)]';
  const mute = palette === 'midnight' ? 'text-[color:var(--mid-mute)]' : palette === 'ivory' ? 'text-[color:var(--ivory-mute)]' : 'text-[color:var(--graphite-mute)]';
  const line = palette === 'midnight' ? 'hairline-m' : palette === 'ivory' ? 'hairline-i' : 'hairline-g';
  return (
    <div className={`flex items-end justify-between gap-8 pb-5 mb-8 border-b ${line}`}>
      <div className="flex items-end gap-5">
        <div className={`font-mono text-[11px] tracking-widest uppercase ${mute}`}>
          <div>Sample</div>
          <div className={`text-4xl font-serif mt-1 ${ink}`} style={{lineHeight:1}}>{String(idx).padStart(2,'0')}</div>
        </div>
        <div className="pl-5 border-l h-14 flex flex-col justify-end hairline-g" style={{borderColor:'currentColor', opacity:.9}}>
          <div className={`font-mono text-[10px] tracking-widest uppercase ${mute}`}>{kicker}</div>
          <h2 className={`text-[26px] font-semibold tracking-tight ${ink} mt-1`}>{title}</h2>
        </div>
      </div>
      <p className={`text-sm max-w-sm ${mute} leading-relaxed text-right`}>{subtitle}</p>
    </div>
  );
}

// Card wrapper
function SampleCard({ palette = 'graphite', children, className = '' }) {
  const bg = palette === 'midnight' ? 'pg-midnight' : palette === 'ivory' ? 'pg-ivory' : 'pg-graphite';
  const line = palette === 'midnight' ? 'hairline-m' : palette === 'ivory' ? 'hairline-i' : 'hairline-g';
  return (
    <section className={`sample-card relative ${bg} border ${line} rounded-sm overflow-hidden ${className}`} style={{boxShadow:'0 1px 0 rgba(0,0,0,.03), 0 24px 60px -30px rgba(10,14,26,.12)'}}>
      {children}
    </section>
  );
}

// Tier pill
function TierPill({ tier, palette = 'graphite', size='md' }) {
  const ACCENT = palette === 'midnight' ? 'var(--mid-accent)' : palette === 'ivory' ? 'var(--ivory-accent)' : 'var(--graphite-accent)';
  const isSm = size === 'sm';
  return (
    <div className="inline-flex items-center gap-2">
      <span className="inline-block rounded-full" style={{width: isSm?6:8, height: isSm?6:8, background: ACCENT}}></span>
      <span className={`font-semibold tracking-tight ${isSm?'text-xs':'text-sm'}`}>{tier.product}</span>
      <span className={`font-mono opacity-60 ${isSm?'text-[10px]':'text-[11px]'}`}>/ {tier.gemini}</span>
    </div>
  );
}

Object.assign(window, {
  TIERS, RISK_CATEGORIES, SAMPLE_MANIFEST,
  SampleHeader, SampleCard, TierPill,
});
