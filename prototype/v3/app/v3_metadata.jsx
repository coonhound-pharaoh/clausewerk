// V3 — Metadata overlay for existing clauses.
// Adds: rationale, citations, created_date, expires_date, active flag,
// reviewer, vector_score bucket. Applied non-destructively on top of
// INITIAL_LEDGER so V2 data stays intact.

const V3_METADATA = {
  // ── Data Privacy ──
  'DP-S-003': { rationale: 'Baseline GDPR/CCPA-compliant processing language. Matches NIST privacy framework minimum. Appropriate when no regulated data class is in play.',
                citations: ['Policy-DP-001 §2.1', 'NIST Privacy Framework v1.0'],
                created: '2023-11-12', expires: '2026-06-30', reviewer: 'M. Ostrowski · Legal',
                vectorBuckets: [{ scope:'Baseline vendor, unregulated data', score: 0.92 }] },
  'DP-H-014': { rationale: 'Matches the strict 72-hour notification window required by GDPR Art. 33 and Vendor Security Requirements §4.2. Approved for any EU-facing engagement handling Personal Data.',
                citations: ['GDPR Art. 28–33', 'Policy-DP-014 §3', 'VSR-2024 §4.2'],
                created: '2024-01-08', expires: '2026-07-15', reviewer: 'M. Ostrowski · Legal',
                vectorBuckets: [{ scope:'EU / regulated personal data', score: 0.96 }] },
  'DP-H-021': { rationale: 'BAA + 48-hour HIPAA breach reporting. Aligns with 45 CFR §164.410 and insurer requirement E-7. Do not soften the 48-hour window without CISO sign-off.',
                citations: ['45 CFR §§ 164.308–164.314', 'Policy-DP-021', 'Cyber-Insurance-Rider E-7'],
                created: '2023-09-20', expires: '2026-03-31', reviewer: 'R. Vaidya · Privacy',
                vectorBuckets: [{ scope:'US healthcare / PHI', score: 0.94 }] },
  'DP-H-028': { rationale: 'Covers GLBA Safeguards and CCPA/CPRA "do-not-sell" obligations. Reviewed after 2024 CPRA amendments.',
                citations: ['GLBA §501(b)', 'CCPA/CPRA §1798.100', 'Policy-DP-028'],
                created: '2024-03-15', expires: '2026-12-31', reviewer: 'E. Chen · Privacy',
                vectorBuckets: [{ scope:'US financial / state-privacy', score: 0.91 }] },

  // ── Security ──
  'SC-S-004': { rationale: 'NIST CSF-aligned baseline for any vendor with network access. Minimum acceptable posture for non-production workloads.',
                citations: ['Policy-SEC-004', 'NIST CSF 2.0'],
                created: '2023-08-01', expires: '2026-09-30', reviewer: 'K. Park · Security',
                vectorBuckets: [{ scope:'Baseline vendor security', score: 0.90 }] },
  'SC-H-012': { rationale: 'SOC 2 Type II + ISO 27001 parity. Matches enterprise InfoSec standard VSR-2024 §2.',
                citations: ['VSR-2024 §2', 'AICPA TSC-2017', 'ISO 27001:2022'],
                created: '2024-02-18', expires: '2026-08-31', reviewer: 'K. Park · Security',
                vectorBuckets: [{ scope:'Production / customer data', score: 0.95 }] },
  'SC-H-019': { rationale: '24-hour incident-response window tied to SEC cyber-disclosure rules and regulator expectations. Do not extend beyond 24h without CISO approval.',
                citations: ['SEC 17 CFR §229.106', 'Policy-SEC-019', 'Cyber-Insurance-Rider E-7'],
                created: '2024-01-15', expires: '2026-07-31', reviewer: 'K. Park · Security',
                vectorBuckets: [{ scope:'Incident response / 24h notice', score: 0.93 }] },

  // ── Indemnity ──
  'ID-S-004': { rationale: 'Mutual, capped indemnity — the default starting position. Appropriate for low-value, low-risk vendors.',
                citations: ['Policy-IND-004'],
                created: '2023-07-10', expires: '2026-12-31', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Baseline vendor cap', score: 0.89 }] },
  'ID-H-007': { rationale: 'Broad indemnity uncapped for gross negligence & wilful misconduct. Required for regulated engagements and >$250K annual value.',
                citations: ['Policy-IND-007', 'GC-Memo-2024-03'],
                created: '2024-01-22', expires: '2026-07-30', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'High-value / regulated', score: 0.94 }] },
  'ID-H-022': { rationale: 'IP infringement sword. Always paired with custom-build or white-label engagements.',
                citations: ['Policy-IND-022'],
                created: '2023-11-05', expires: '2026-11-04', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Custom deliverables / IP risk', score: 0.92 }] },

  // ── IP & Licensing ──
  'IP-S-002': { rationale: 'Off-the-shelf non-exclusive license. Default for SaaS & shrink-wrap.',
                citations: ['Policy-IP-002'],
                created: '2023-06-01', expires: '2026-12-31', reviewer: 'A. Nabi · Legal',
                vectorBuckets: [{ scope:'Off-the-shelf SaaS', score: 0.91 }] },
  'IP-H-009': { rationale: 'License + infringement warranty bundle. Use for revenue-facing platforms.',
                citations: ['Policy-IP-009'],
                created: '2024-02-14', expires: '2026-09-30', reviewer: 'A. Nabi · Legal',
                vectorBuckets: [{ scope:'Platform / production', score: 0.93 }] },
  'IP-H-023': { rationale: 'Work-for-hire + irrevocable assignment fallback. Always use for bespoke deliverables.',
                citations: ['17 USC §101', 'Policy-IP-023'],
                created: '2023-10-10', expires: '2026-10-09', reviewer: 'A. Nabi · Legal',
                vectorBuckets: [{ scope:'Custom dev / WFH', score: 0.95 }] },
  'IP-H-031': { rationale: 'Copyleft hygiene. Blocks GPL/AGPL contamination of proprietary code.',
                citations: ['Policy-IP-031', 'OSS-Hygiene-Std-v3'],
                created: '2023-12-18', expires: '2026-06-30', reviewer: 'A. Nabi · Legal',
                vectorBuckets: [{ scope:'OSS disclosure', score: 0.90 }] },
  'IP-H-034': { rationale: 'AI-specific: bars training on our data and warrants model-output clean-room. Added after the 2024 generative-AI policy update.',
                citations: ['Policy-AI-001', 'GC-Memo-2024-08'],
                created: '2024-08-01', expires: '2026-08-01', reviewer: 'A. Nabi · Legal',
                vectorBuckets: [{ scope:'AI / ML / LLM vendors', score: 0.96 }] },

  // ── Confidentiality ──
  'CF-S-006': { rationale: '3-year mutual NDA. Standard starting point.',
                citations: ['Policy-CONF-006'],
                created: '2023-05-12', expires: '2026-12-31', reviewer: 'M. Ostrowski · Legal',
                vectorBuckets: [{ scope:'Baseline mutual NDA', score: 0.90 }] },
  'CF-H-015': { rationale: 'Trade-secret tail — perpetual protection. Use whenever algorithms/know-how are shared.',
                citations: ['UTSA §1(4)', 'Policy-CONF-015'],
                created: '2023-08-14', expires: '2026-08-13', reviewer: 'M. Ostrowski · Legal',
                vectorBuckets: [{ scope:'Trade secrets / algorithms', score: 0.93 }] },

  // ── Liability Cap ──
  'LC-S-001': { rationale: '12-month-fees cap — the floor position. Acceptable for <$100K vendors.',
                citations: ['Policy-LIAB-001'],
                created: '2023-04-20', expires: '2026-12-31', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Low-value vendor', score: 0.88 }] },
  'LC-H-006': { rationale: '2× cap with carve-outs. The standard enterprise position.',
                citations: ['Policy-LIAB-006'],
                created: '2024-01-05', expires: '2026-12-31', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Enterprise baseline', score: 0.94 }] },
  'LC-H-026': { rationale: 'Super-cap for breach/IP categories. Reserved for strategic vendors and cyber-insurance requirements.',
                citations: ['Policy-LIAB-026', 'Cyber-Insurance-Rider E-7'],
                created: '2024-03-01', expires: '2026-09-30', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Strategic / cyber-insured', score: 0.92 }] },

  // ── Insurance ──
  'IN-S-005': { rationale: 'Baseline CGL/WC/E&O minimums. Covers the vast majority of services vendors.',
                citations: ['Policy-INS-005', 'Risk-Mgmt-Std-v2'],
                created: '2023-06-15', expires: '2026-06-14', reviewer: 'B. Iqbal · Risk',
                vectorBuckets: [{ scope:'Services baseline', score: 0.89 }] },
  'IN-H-013': { rationale: 'Enterprise insurance with $10M cyber. Required for any data-handling vendor >$250K.',
                citations: ['Policy-INS-013', 'Cyber-Insurance-Rider E-7'],
                created: '2024-02-08', expires: '2026-08-31', reviewer: 'B. Iqbal · Risk',
                vectorBuckets: [{ scope:'Enterprise / cyber coverage', score: 0.94 }] },

  // ── Termination ──
  'TM-S-011': { rationale: '30-day convenience + 15-day cure. Default position.',
                citations: ['Policy-TERM-011'],
                created: '2023-05-01', expires: '2026-12-31', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Baseline', score: 0.89 }] },
  'TM-H-013': { rationale: 'Immediate-for-cause on data/security breach. Pair with regulated engagements.',
                citations: ['Policy-TERM-013'],
                created: '2024-01-10', expires: '2026-07-31', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Regulated exit', score: 0.93 }] },
  'TM-H-024': { rationale: '180-day transition tail — prevents lock-in.',
                citations: ['Policy-TERM-024'],
                created: '2023-11-20', expires: '2026-05-19', reviewer: 'J. Laurent · Legal',
                vectorBuckets: [{ scope:'Mission-critical', score: 0.92 }] },

  // ── SLA ──
  'SL-S-008': { rationale: 'Best-efforts 99.5%. Dev/staging only.',
                citations: ['Policy-SLA-008'],
                created: '2023-07-01', expires: '2026-12-31', reviewer: 'D. Fitzgerald · Ops',
                vectorBuckets: [{ scope:'Non-production', score: 0.87 }] },
  'SL-H-005': { rationale: '99.9% with graduated credits.',
                citations: ['Policy-SLA-005'],
                created: '2024-02-01', expires: '2026-08-31', reviewer: 'D. Fitzgerald · Ops',
                vectorBuckets: [{ scope:'Production SaaS', score: 0.94 }] },
  'SL-H-025': { rationale: '4-nines mission-critical. Reserved for payroll, trading, patient-facing systems.',
                citations: ['Policy-SLA-025'],
                created: '2024-04-11', expires: '2026-10-10', reviewer: 'D. Fitzgerald · Ops',
                vectorBuckets: [{ scope:'Mission-critical', score: 0.96 }] },

  // Expired / retired — kill-switch demo
  'SC-RETIRED-01': { rationale: 'Superseded by SC-H-012 after 2024 SOC 2 uplift. Retained for reference only — DO NOT use.',
                    citations: ['Policy-SEC-004-v1 (retired)'],
                    created: '2021-03-12', expires: '2024-06-30', reviewer: 'K. Park · Security',
                    active: false, retiredReason: 'Replaced by SC-H-012',
                    vectorBuckets: [] },
};

// Apply metadata overlay + defaults to every ledger entry.
function enrichLedger(base) {
  // Real clock by default, so clauses actually expire. window.CLAUSEWERK_TODAY
  // pins it for demos and screenshots, where stable expiry states matter.
  const today = window.CLAUSEWERK_TODAY ? new Date(window.CLAUSEWERK_TODAY) : new Date();
  return base.map(c => {
    const meta = V3_METADATA[c.id] || {};
    // Clause-level fields (e.g. baseline clauses ship their own metadata) win
    // over defaults; V3_METADATA overlay wins over both.
    // Expiry can only be derived from a KNOWN creation date. Defaulting an
    // unrecorded date to a fixed past epoch silently birth-expires every clause
    // that never got metadata — which is what retired the entire Baseline
    // Framework, a set flagged alwaysInclude and therefore expected in every
    // contract. A clause with no recorded provenance is not expired; it is
    // unprovenanced, which is a different problem and is flagged as one.
    const knownCreated = meta.created || c.created || null;
    const expires = meta.expires || c.expires || (knownCreated ? defaultExpiry(knownCreated) : null);
    const expiresDate = expires ? new Date(expires) : null;
    const isExpired = expiresDate ? expiresDate < today : false;
    const daysToExpiry = expiresDate ? Math.round((expiresDate - today) / (1000*60*60*24)) : null;
    return {
      ...c,
      rationale: meta.rationale || c.rationale || `Pre-approved ${c.sev.toLowerCase()} clause for ${c.cat}.`,
      citations: meta.citations || c.citations || [`Policy-${c.id}`],
      created: knownCreated,
      expires,
      reviewer: meta.reviewer || c.reviewer || 'Legal',
      active: (meta.active !== false && c.active !== false) && !isExpired,
      retiredReason: meta.retiredReason || null,
      daysToExpiry,
      expiresSoon: daysToExpiry != null && daysToExpiry > 0 && daysToExpiry <= 90,
      expired: isExpired,
      // Data-quality flag, not a validity flag. An unprovenanced clause is
      // selectable but cannot be temporally governed, so it needs surfacing
      // rather than silent inclusion or silent expiry.
      provenanceGap: !knownCreated || !expires,
      vectorBuckets: meta.vectorBuckets || c.vectorBuckets || [{ scope: c.cat, score: 0.85 }],
    };
  });
}
function defaultExpiry(created) {
  const d = new Date(created || '2024-01-01');
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

// Conflict validation rules: pairwise contradictions we detect post-assembly.
// Each rule is (decisions) => ConflictFinding[] | null
const CONFLICT_RULES = [
  {
    name: 'Mixed governing law / dispute seat',
    check(decisions) {
      const gl = decisions.find(d => d.selected?.cat === 'Governing Law');
      const dr = decisions.find(d => d.selected?.cat === 'Dispute Resolution');
      if (!gl || !dr) return null;
      const glText = gl.selected.text.toLowerCase();
      const drText = dr.selected.text.toLowerCase();
      const inferJur = (t) => {
        if (/england|london|wales/.test(t)) return 'UK';
        if (/delaware|new york|california/.test(t)) return 'US';
        if (/international chamber of commerce|icc/.test(t)) return 'Intl';
        if (/aaa|american arbitration|jams/.test(t)) return 'US';
        return null;
      };
      const a = inferJur(glText), b = inferJur(drText);
      if (a && b && a !== b) {
        return {
          severity: 'High',
          title: `Governing law points to ${a}, dispute forum points to ${b}`,
          detail: `Clause ${gl.selected.id} governs under ${a} law but ${dr.selected.id} fixes the forum in ${b}. Pick one.`,
          refs: [gl.selected.id, dr.selected.id],
        };
      }
      return null;
    },
  },
  {
    name: 'Incompatible liability carve-outs',
    check(decisions) {
      const lc = decisions.find(d => d.selected?.cat === 'Liability Cap');
      const id = decisions.find(d => d.selected?.cat === 'Indemnity');
      if (!lc || !id) return null;
      const capHas = /shall not apply|no cap|without regard to/.test(lc.selected.text.toLowerCase());
      const indBroad = /without regard to the liability cap/.test(id.selected.text.toLowerCase());
      if (indBroad && !capHas) {
        return {
          severity: 'Standard',
          title: 'Indemnity excludes cap; cap clause does not mirror the carve-out',
          detail: `${id.selected.id} uncaps indemnity claims but ${lc.selected.id} does not echo the carve-out. Drafters should align language.`,
          refs: [lc.selected.id, id.selected.id],
        };
      }
      return null;
    },
  },
  {
    name: 'SLA vs termination mismatch',
    check(decisions) {
      const sla = decisions.find(d => d.selected?.cat === 'SLA & Uptime');
      const tm  = decisions.find(d => d.selected?.cat === 'Termination');
      if (!sla || !tm) return null;
      const slaHas = /99\.9|99\.99/.test(sla.selected.text);
      const tmSoft = /thirty \(30\)/.test(tm.selected.text) && !/immediate|material breach of data/.test(tm.selected.text.toLowerCase());
      if (slaHas && tmSoft) {
        return {
          severity: 'Standard',
          title: 'High-SLA service with soft termination',
          detail: `${sla.selected.id} commits to ≥99.9% uptime but ${tm.selected.id} only allows convenience exit at 30 days. Consider SLA-linked exit.`,
          refs: [sla.selected.id, tm.selected.id],
        };
      }
      return null;
    },
  },
  {
    name: 'Data Privacy regulated + no Insurance cyber',
    check(decisions) {
      const dp = decisions.find(d => d.selected?.cat === 'Data Privacy');
      const ins = decisions.find(d => d.selected?.cat === 'Insurance');
      if (!dp || !ins) return null;
      const dpRegulated = /gdpr|hipaa|phi|glba|ccpa/i.test(dp.selected.text);
      const insHasCyber = /cyber liability/i.test(ins.selected.text);
      if (dpRegulated && !insHasCyber) {
        return {
          severity: 'High',
          title: 'Regulated data but baseline insurance',
          detail: `${dp.selected.id} processes regulated data, but ${ins.selected.id} lacks cyber-liability coverage. Swap to enterprise insurance variant.`,
          refs: [dp.selected.id, ins.selected.id],
        };
      }
      return null;
    },
  },
];

function runConflictValidation(decisions) {
  const findings = [];
  for (const rule of CONFLICT_RULES) {
    const f = rule.check(decisions);
    if (f) findings.push({ rule: rule.name, ...f });
  }
  return findings;
}

window.V3_METADATA = V3_METADATA;
window.enrichLedger = enrichLedger;
window.CONFLICT_RULES = CONFLICT_RULES;
window.runConflictValidation = runConflictValidation;
