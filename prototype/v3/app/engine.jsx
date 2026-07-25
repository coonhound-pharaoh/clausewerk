// Engine: classification + conflict resolution + assembly
// Pure functions, no React.

// Classify a conversation transcript into a manifest.
// Tries LLM first (window.claude.complete), falls back to keyword rules.
async function classifyToManifest(transcript, vendorGuess) {
  // Try LLM
  try {
    if (window.claude && window.claude.complete) {
      // Pull full category list from window.CATEGORIES so we never get
      // bottlenecked by a hard-coded subset. KEYWORD_RULES reasons supply
      // strong hints to the model about what each category captures.
      const cats = (window.CATEGORIES || []).map(c => c.label);
      const catList = cats.length
        ? cats.map(c => `- ${c}`).join('\n')
        : ['Data Privacy', 'Security', 'Indemnity', 'IP & Licensing', 'Confidentiality',
           'Insurance', 'SLA & Uptime', 'Payment Terms', 'Subcontracting', 'Acceptance',
           'Warranty', 'Compliance', 'Delivery & Title', 'Staffing & Labor', 'Audit Rights',
           'Termination', 'Dispute Resolution', 'Governing Law', 'Force Majeure',
           'Change Control', 'Liability Cap', 'Benchmarking & MFN', 'Business Continuity',
           'Sustainability', 'Marketing & Publicity', 'Export & Sanctions',
           'Accessibility'].map(c => `- ${c}`).join('\n');

      const prompt = `You are an Intake assistant for a legal contract assembly system. Read the conversation between a procurement requester and the Intake agent, and emit a STRICT JSON manifest of identified contract risks.

A rich, well-described engagement should typically yield 8-15 risks across many categories — be thorough. Do not collapse multiple distinct concerns into a single risk; a vendor handling EU PII *and* using offshore subcontractors *and* requiring 99.99% uptime is at least three separate risks (Data Privacy, Subcontracting, SLA & Uptime). Mark "High" whenever the engagement explicitly triggers regulated data, mission-critical workloads, eight-figure value, on-site work, public-sector flow-downs, IP assignment, cross-border data flows, or named third-country processing.

Allowed categories (use ONLY these exact strings; pick the best fit, do not invent):
${catList}

For each risk, output:
{"category": <one of the above>, "severity": "Standard" | "High", "justification": <one short sentence quoting or paraphrasing the conversation>}

Also extract a vendor name if mentioned. If value is mentioned (e.g. "$240K"), include it.

Return ONLY valid JSON, no prose, no code fences:
{"vendor": <string>, "value": <string or null>, "risks": [ ... ]}

Conversation:
${transcript}`;
      const raw = await window.claude.complete(prompt);
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && Array.isArray(parsed.risks)) {
        // Filter risks to known categories — drop any hallucinated ones
        const allowed = new Set(cats.length ? cats : []);
        const risks = parsed.risks
          .filter(r => allowed.size === 0 || allowed.has(r.category))
          .map(r => ({
            category: r.category,
            severity: r.severity === 'High' ? 'High' : 'Standard',
            justification: r.justification || '',
          }));
        return {
          vendor: parsed.vendor || vendorGuess || 'Unnamed vendor',
          value: parsed.value || null,
          risks,
          source: 'llm',
        };
      }
    }
  } catch (e) {
    console.warn('LLM classification failed, falling back:', e);
  }

  // Fallback: keyword-rule classifier
  const found = new Map(); // category → { severity, reasons[] }
  const userText = transcript;
  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(userText)) {
      const prev = found.get(rule.category);
      if (!prev || (rule.severity === 'High' && prev.severity !== 'High')) {
        found.set(rule.category, { severity: rule.severity, reasons: [rule.reason] });
      } else {
        prev.reasons.push(rule.reason);
      }
    }
  }
  // Always include baseline Standard
  for (const cat of BASELINE_CATEGORIES) {
    if (!found.has(cat)) found.set(cat, { severity: 'Standard', reasons: ['Baseline contract protection'] });
  }

  // Vendor guess
  const vendorMatch = userText.match(/\b(?:with|contracting|onboarding|renewing with|evaluat\w+)\s+([A-Z][A-Za-z0-9&.\- ]{2,30})/);
  const vendor = vendorGuess || (vendorMatch ? vendorMatch[1].trim() : 'Unnamed vendor');
  const valueMatch = userText.match(/\$[0-9]+[KM]?(?:\/\w+)?|[0-9]+\s*(?:thousand|million)/i);

  return {
    vendor,
    value: valueMatch ? valueMatch[0] : null,
    risks: Array.from(found.entries()).map(([category, v]) => ({
      category,
      severity: v.severity,
      justification: v.reasons[0],
    })),
    source: 'fallback',
  };
}

// Resolve manifest against ledger: one clause per category, High wins.
function resolveClauses(manifest, ledger) {
  const decisions = [];

  // V3.1 — Always-include baseline clauses injected as synthetic risks.
  // These fire before manifest-driven resolution so boilerplate protections
  // land in every dossier regardless of what Intake flagged.
  const baseline = ledger.filter(c => c.alwaysInclude && c.active);
  for (const clause of baseline) {
    decisions.push({
      risk: {
        category: clause.cat,
        severity: 'Baseline',
        reason: clause.rationale?.split('.')[0] || `Baseline framework §${clause.frameworkSection || '—'}`,
        baseline: true,
      },
      selected: clause,
      suppressed: [],
      reason: `Always-include · Baseline Framework §${clause.frameworkSection || '—'}`,
      baseline: true,
    });
  }

  for (const risk of manifest.risks) {
    // Exclude always-include clauses from manifest-driven selection — they
    // were already placed by the baseline pass above.
    const candidates = ledger.filter(c => c.cat === risk.category && !c.alwaysInclude);
    if (candidates.length === 0) {
      decisions.push({ risk, selected: null, suppressed: [], reason: 'No clause available in Ledger' });
      continue;
    }
    // Prefer matching severity
    const exactMatch = candidates.find(c => c.sev === risk.severity);
    const fallback = candidates.find(c => c.sev === 'Standard') || candidates[0];
    const selected = exactMatch || fallback;
    const suppressed = candidates.filter(c => c.id !== selected.id);
    decisions.push({
      risk,
      selected,
      suppressed,
      reason: exactMatch
        ? `Matched ${risk.severity} variant for ${risk.category}`
        : `No ${risk.severity} variant; fell back to ${fallback.sev}`,
    });
  }
  return decisions;
}

// Generate plain-text dossier content (what would end up in .docx)
function assembleDossier(manifest, decisions) {
  const today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const header = `MASTER SERVICES AGREEMENT
${manifest.vendor}${manifest.value ? ` — ${manifest.value}` : ''}
Dated: ${today}`;
  const sections = decisions
    .filter(d => d.selected)
    .map((d, i) => `${i+1}. ${d.risk.category.toUpperCase()}\n[${d.selected.id}]\n\n${d.selected.text}`)
    .join('\n\n— — —\n\n');
  return `${header}\n\n${sections}`;
}

window.classifyToManifest = classifyToManifest;
window.resolveClauses = resolveClauses;
window.assembleDossier = assembleDossier;
