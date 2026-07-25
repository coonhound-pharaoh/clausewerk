// V3.1 — Baseline Framework (customer-side).
// 15-section clause bank flagged as `alwaysInclude`. These get auto-injected
// into every contract as synthetic Boilerplate risks by the Forge pipeline.

const BASELINE_FRAMEWORK = [
  // ══════════════════════════════════════════════════════════════════════
  // § 1  CORE LEGAL FORMATION & INTERPRETATION
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'DF-B-001', cat: 'Definitions', sev: 'Standard',
    title: 'Definitions — standard preamble',
    frameworkSection: '1.1',
    text: 'The capitalized terms used in this Agreement shall have the meanings set forth in this Section or in the Exhibits attached hereto. "Affiliate" means any entity that controls, is controlled by, or is under common control with a party, where "control" means beneficial ownership of more than fifty percent (50%) of the voting equity. "Applicable Law" means all statutes, regulations, rules, and binding guidance issued by a competent authority that apply to the performance of this Agreement. "Confidential Information" means any non-public information disclosed by one party to the other, whether orally, in writing, or by inspection of tangible objects, that is marked as confidential or that a reasonable recipient would understand to be confidential. "Deliverables" means the items Vendor is required to deliver to Customer under a Statement of Work. "Services" means the services performed by Vendor under this Agreement.',
    rationale: 'A centralized definitions block eliminates interpretive drift across a document. Failing to define "Affiliate", "Confidential Information", or "Applicable Law" is the single most common source of downstream disputes in customer-vendor litigation.',
    citations: ['ABA Model MSA §1', 'Customer Playbook §A1'],
  },
  {
    id: 'OP-B-002', cat: 'Order of Precedence', sev: 'Standard',
    title: 'Order of precedence — MSA > SOW > Exhibits',
    frameworkSection: '1.2',
    text: 'In the event of a conflict between the terms of this Master Agreement, a Statement of Work, an Exhibit, a Vendor quote, or a Vendor click-through or order form, the documents shall govern in the following order of precedence: (i) this Master Agreement; (ii) any Exhibit expressly incorporated into this Master Agreement; (iii) the applicable Statement of Work; (iv) any Customer purchase order; and (v) any Vendor form. Vendor click-through, shrink-wrap, and online terms shall have no force or effect with respect to this Agreement.',
    rationale: 'Prevents vendor-favorable boilerplate embedded in purchase orders and click-through terms from silently overriding negotiated MSA protections. The "click-through shall have no force or effect" sentence is doing most of the work here.',
    citations: ['Customer Playbook §A2', 'In re Vendor Form Conflicts (advisory memo 2022-04)'],
  },
  {
    id: 'EA-B-003', cat: 'Entire Agreement', sev: 'Standard',
    title: 'Entire agreement / integration',
    frameworkSection: '1.3',
    text: 'This Agreement, together with all Exhibits and Statements of Work executed hereunder, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior or contemporaneous oral or written communications, proposals, conditions, representations, and warranties. No party has relied on any representation not expressly set forth in this Agreement.',
    rationale: 'Forecloses extrinsic-evidence arguments ("but your sales rep promised us…"). Combined with the Amendment clause below, this is the parol-evidence perimeter.',
    citations: ['UCC §2-202', 'Customer Playbook §A3'],
  },
  {
    id: 'AM-B-004', cat: 'Amendment', sev: 'Standard',
    title: 'Amendment — written, signed',
    frameworkSection: '1.4',
    text: 'No amendment, modification, or supplement to this Agreement shall be effective unless set forth in a writing signed by an authorized representative of each party. Course of dealing, course of performance, and usage of trade shall not modify the express terms of this Agreement.',
    rationale: 'Blocks informal email "agreements" from modifying the contract. The course-of-dealing disclaimer closes the UCC §2-208 loophole.',
    citations: ['UCC §2-208', 'Customer Playbook §A4'],
  },
  {
    id: 'WV-B-005', cat: 'Waiver', sev: 'Standard',
    title: 'No waiver — express, written',
    frameworkSection: '1.5',
    text: 'No failure or delay by either party in exercising any right under this Agreement shall constitute a waiver of that right. No waiver shall be effective unless expressly made in writing and signed by the waiving party, and any waiver shall apply only to the specific circumstance for which it was given.',
    rationale: 'Stops "you didn\'t enforce it last quarter so you\'ve waived it" arguments. The single-instance limitation prevents a one-time grace period from becoming a permanent carve-out.',
    citations: ['Restatement (Second) of Contracts §84', 'Customer Playbook §A5'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 2  PERFORMANCE & DELIVERY RISK
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'SS-B-006', cat: 'Scope of Services', sev: 'Standard',
    title: 'Scope of services — measurable obligations',
    frameworkSection: '2.1',
    text: 'Vendor shall perform the Services and deliver the Deliverables described in each Statement of Work in accordance with the specifications, acceptance criteria, and timelines set forth therein. Vendor shall perform the Services using qualified personnel and in a professional and workmanlike manner consistent with generally accepted industry standards. Any reference to "best efforts" or "commercially reasonable efforts" shall be interpreted against an objective industry benchmark, not a Vendor-subjective standard.',
    rationale: 'Eliminates the "best efforts" escape hatch by anchoring it to an objective industry benchmark. The workmanlike-manner language is the common-law hook for performance claims.',
    citations: ['Restatement (Second) of Contracts §205', 'Customer Playbook §B1'],
  },
  {
    id: 'PQ-B-007', cat: 'Personnel Quality', sev: 'Standard',
    title: 'Personnel qualifications & subcontractor approval',
    frameworkSection: '2.5',
    text: 'Vendor shall staff the engagement with personnel who have the skill, experience, and qualifications necessary to perform the Services. Vendor shall not subcontract any material portion of the Services without Customer\'s prior written consent, which shall not be unreasonably withheld. Subcontractors shall be bound in writing to confidentiality, data-protection, and security obligations no less protective than those set forth in this Agreement. Vendor shall remain fully responsible for the acts and omissions of its subcontractors as if they were its own employees.',
    rationale: 'Prevents silent hand-off of the engagement to offshore or discount subcontractors whose security posture has not been vetted. The flow-down obligation is what keeps the data-protection perimeter intact.',
    citations: ['Customer Playbook §B5', 'Vendor Security Requirements §6'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 3  FINANCIAL
  // ══════════════════════════════════════════════════════════════════════
  // Pricing, Invoicing, Taxes — already covered by Payment Terms clauses.
  // Audit rights for pricing covered by Audit Rights baseline below.

  // ══════════════════════════════════════════════════════════════════════
  // § 4  TERM, TERMINATION & EXIT
  // ══════════════════════════════════════════════════════════════════════
  // Core termination + transition assistance + survival handled below.
  {
    id: 'SR-B-008', cat: 'Survival', sev: 'Standard',
    title: 'Survival of key obligations',
    frameworkSection: '4.5',
    text: 'The rights and obligations of the parties set forth in the Sections titled Confidentiality, Intellectual Property, Indemnification, Limitation of Liability, Data Protection, Data Return and Destruction, Records Retention, Governing Law, Dispute Resolution, and this Section (Survival) shall survive the termination or expiration of this Agreement for the period stated therein or, if no period is stated, indefinitely.',
    rationale: 'Without an explicit survival clause, contractual protections evaporate on termination — which is exactly when a vendor is most likely to misuse your data. The enumerated list is belt-and-suspenders.',
    citations: ['Customer Playbook §D5'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 5  LIABILITY & RISK ALLOCATION
  // ══════════════════════════════════════════════════════════════════════
  // Covered by existing Liability Cap clauses (LC-*) + Indemnity (ID-*).

  // ══════════════════════════════════════════════════════════════════════
  // § 7  INTELLECTUAL PROPERTY
  // ══════════════════════════════════════════════════════════════════════
  // Covered by existing IP clauses. No new baseline clause required.

  // ══════════════════════════════════════════════════════════════════════
  // § 8  CONFIDENTIALITY & DATA PROTECTION
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'BN-B-009', cat: 'Breach Notification', sev: 'Standard',
    title: 'Data breach notification — 72h outer limit',
    frameworkSection: '8.4',
    text: 'Vendor shall notify Customer without undue delay and in no event later than seventy-two (72) hours after becoming aware of any actual or reasonably suspected Security Incident that compromises, or is reasonably likely to compromise, the confidentiality, integrity, or availability of Customer Data. Such notice shall include a description of the nature of the Incident, the categories and approximate number of data subjects affected, the likely consequences, and the measures taken or proposed to address the Incident. Vendor shall cooperate fully with Customer\'s investigation and remediation.',
    rationale: 'The 72-hour window matches GDPR Art. 33 and is the longest period any customer-side InfoSec team will accept as a default. For regulated workloads, pair with a tighter 24-hour clause.',
    citations: ['GDPR Art. 33', 'NIST SP 800-61r2', 'Customer Playbook §H4'],
  },
  {
    id: 'DD-B-010', cat: 'Data Return & Destruction', sev: 'Standard',
    title: 'Data return / destruction on termination',
    frameworkSection: '8.5',
    text: 'Within thirty (30) days following termination or expiration of this Agreement, Vendor shall, at Customer\'s election, (a) return all Customer Data in a commercially reasonable, machine-readable format, or (b) securely destroy all Customer Data (including all copies, backups, and archival media) using industry-standard secure-deletion methods, and shall certify such destruction in writing. Vendor may retain Customer Data only to the extent and for the period required by Applicable Law, and such retained data shall remain subject to the confidentiality and data-protection obligations of this Agreement.',
    rationale: 'Without this clause, Vendor\'s backup tapes can hold Customer data indefinitely. Election right between return and destruction is important — sometimes you need the export; sometimes you don\'t.',
    citations: ['GDPR Art. 28(3)(g)', 'NIST SP 800-88r1', 'Customer Playbook §H5'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 9  COMPLIANCE & ETHICS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'AC-B-011', cat: 'Anti-Corruption', sev: 'Standard',
    title: 'Anti-corruption — FCPA / UK Bribery Act',
    frameworkSection: '9.2',
    text: 'Vendor represents, warrants, and covenants that it shall comply with the U.S. Foreign Corrupt Practices Act, the UK Bribery Act 2010, and all other applicable anti-corruption and anti-bribery laws. Vendor shall not, directly or indirectly, offer, promise, authorize, or give any payment or thing of value to any government official, political party, or private person for the purpose of obtaining or retaining business or securing an improper advantage. Vendor shall maintain policies, training, and books-and-records sufficient to evidence compliance, and shall permit Customer to audit such records upon reasonable notice.',
    rationale: 'FCPA liability flows up the contracting chain. Without this representation, Customer has no contractual basis to recover from Vendor if Vendor\'s misconduct triggers a Customer enforcement action.',
    citations: ['15 USC §§78dd-1 et seq.', 'UK Bribery Act 2010 s.7', 'Customer Playbook §I2'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 11  OPERATIONAL CONTROLS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'NS-B-012', cat: 'Non-Solicitation', sev: 'Standard',
    title: 'Mutual non-solicitation of personnel',
    frameworkSection: '11.3',
    text: 'During the term of this Agreement and for twelve (12) months thereafter, neither party shall directly solicit for employment any employee of the other party with whom such party has had material contact in connection with the Services; provided that (a) general public advertisements and searches by third-party recruiters not directed at specific employees, and (b) hiring an employee who responds to such general solicitations or who approaches the hiring party on the employee\'s own initiative, shall not violate this Section.',
    rationale: 'Protects against the scenario where a consultant embeds on-site and then poaches the team they were hired to advise. The "material contact" limiter and the public-advertising carve-out keep it enforceable under most state non-solicit jurisprudence.',
    citations: ['Customer Playbook §K3'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 12  DISPUTE RESOLUTION (escalation)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ES-B-013', cat: 'Escalation', sev: 'Standard',
    title: 'Executive escalation before litigation',
    frameworkSection: '12.3',
    text: 'Before commencing any litigation or arbitration (other than for injunctive relief to protect confidential information or intellectual property), the parties shall first attempt in good faith to resolve any dispute by escalating it to senior executives of each party (VP-level or above) for a minimum of fifteen (15) business days. If the dispute is not resolved within that period, either party may proceed with its chosen dispute-resolution forum. The running of any statute of limitations shall be tolled during this escalation period.',
    rationale: 'Forces a cooling-off period with economic decision-makers who have authority to settle, often resolving disputes before outside counsel is engaged. The injunctive-relief carve-out prevents abuse (you can still move fast to protect IP / confidential information).',
    citations: ['Customer Playbook §L3'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 13  AUDIT, MONITORING, GOVERNANCE
  // ══════════════════════════════════════════════════════════════════════
  // Operational audit rights already covered by existing AU-* clauses.

  // ══════════════════════════════════════════════════════════════════════
  // § 14  ASSIGNMENT & CONTROL
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'AS-B-014', cat: 'Assignment', sev: 'Standard',
    title: 'Assignment — consent required',
    frameworkSection: '14.1',
    text: 'Neither party may assign or transfer this Agreement, in whole or in part, whether by operation of law or otherwise, without the other party\'s prior written consent; provided that Customer may assign this Agreement to an Affiliate or to a successor in a merger, acquisition, or sale of substantially all of its assets without consent. Any attempted assignment in violation of this Section shall be null and void. This Agreement shall bind and inure to the benefit of the parties and their permitted successors and assigns.',
    rationale: 'The asymmetric consent carve-out (Customer can assign to Affiliate/successor, Vendor cannot) is the negotiated norm and reflects the underlying risk profile — Vendor capability is what was purchased.',
    citations: ['Customer Playbook §M1'],
  },
  {
    id: 'CO-B-015', cat: 'Change of Control', sev: 'Standard',
    title: 'Change of control — termination right',
    frameworkSection: '14.2',
    text: 'If Vendor undergoes a Change of Control (defined as a merger, acquisition, sale of substantially all of its assets, or any transaction resulting in a new beneficial owner holding more than fifty percent (50%) of Vendor\'s voting equity), Vendor shall notify Customer in writing within ten (10) business days of the closing, and Customer shall have the right to terminate this Agreement upon thirty (30) days\' written notice delivered within ninety (90) days of Customer\'s receipt of such notice, without penalty and with a pro-rata refund of any prepaid fees. This right is in addition to any other termination rights under this Agreement.',
    rationale: 'Change of control is a material change to the counterparty risk profile — Vendor could be acquired by a competitor, a sanctioned entity, or a company with incompatible security posture. A 90-day termination window gives time to evaluate without rushing.',
    citations: ['Customer Playbook §M2'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // § 15  MISCELLANEOUS PROTECTIONS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'IC-B-016', cat: 'Independent Contractors', sev: 'Standard',
    title: 'Independent contractor relationship',
    frameworkSection: '15.1',
    text: 'Vendor is engaged as an independent contractor. Nothing in this Agreement shall be construed to create a partnership, joint venture, employment, or agency relationship between the parties. Neither party has authority to bind the other or to incur any obligation on behalf of the other. Vendor shall be solely responsible for all wages, benefits, taxes, insurance, and workers\' compensation coverage for its personnel, and shall indemnify Customer against any claim by Vendor personnel to the contrary.',
    rationale: 'Closes the worker-misclassification and joint-employer-doctrine exposures. The indemnity flip at the end is the real teeth — it\'s not enough to say "not an employee", you have to make Vendor pay for the argument.',
    citations: ['IRS Rev. Rul. 87-41', 'Customer Playbook §N1'],
  },
  {
    id: 'MK-B-017', cat: 'Marketing & Publicity', sev: 'Standard',
    title: 'Publicity — prior written consent',
    frameworkSection: '15.2',
    text: 'Neither party shall use the name, trademark, logo, or any other identifying mark of the other party, or reference the existence of this Agreement, in any press release, marketing material, customer list, case study, website, investor deck, or other public communication without the other party\'s prior written consent. A consent granted for one use shall not imply consent for any other use.',
    rationale: 'Prevents Vendor from listing Customer as a reference without permission. The single-use language is important — some vendors will read a one-time consent as a license.',
    citations: ['Customer Playbook §N2'],
  },
  {
    id: 'NT-B-018', cat: 'Notices', sev: 'Standard',
    title: 'Notices — formal delivery',
    frameworkSection: '15.3',
    text: 'All notices required or permitted under this Agreement shall be in writing and shall be deemed given: (a) upon hand delivery; (b) one (1) business day after deposit with a nationally recognized overnight courier with tracking; (c) three (3) business days after deposit in the mail, postage prepaid, certified or registered, return receipt requested; or (d) upon confirmed delivery by email to the addresses designated in writing by each party. Routine operational communications may be made by email without the foregoing formalities.',
    rationale: 'Separates "legal notice" (termination, breach, indemnification trigger) from "operational email" so neither side is caught out by a termination notice buried in a Slack channel. The email + confirmation provision keeps it modern.',
    citations: ['Customer Playbook §N3'],
  },
  {
    id: 'SV-B-019', cat: 'Severability', sev: 'Standard',
    title: 'Severability & reformation',
    frameworkSection: '15.4',
    text: 'If any provision of this Agreement is held by a court of competent jurisdiction to be invalid, illegal, or unenforceable, such provision shall be modified to the minimum extent necessary to make it enforceable, or if it cannot be so modified, shall be severed, and the remaining provisions of this Agreement shall continue in full force and effect. The parties shall negotiate in good faith to replace any severed provision with a valid and enforceable provision that most closely reflects their original intent.',
    rationale: 'Preserves the bulk of the deal if a single provision is invalidated. The reformation language (rather than pure severance) is softer and often preserves more of the bargain.',
    citations: ['Restatement (Second) of Contracts §184', 'Customer Playbook §N4'],
  },

  // ══════════════════════════════════════════════════════════════════════
  // Bonus — these were already covered by existing clauses but need
  // a guaranteed "always add" lock so they can never be omitted.
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'CF-B-020', cat: 'Confidentiality', sev: 'Standard',
    title: 'Confidentiality — baseline (always-add)',
    frameworkSection: '8.1',
    text: 'Each party shall hold the other\'s Confidential Information in strict confidence, use it solely to perform its obligations or exercise its rights under this Agreement, and protect it with at least the same degree of care it uses to protect its own confidential information of similar sensitivity (and in no event less than reasonable care). Confidential Information shall not include information that (a) is or becomes publicly known through no fault of the receiving party, (b) was known to the receiving party prior to disclosure without confidentiality obligation, (c) is independently developed without use of the disclosing party\'s Confidential Information, or (d) is rightfully obtained from a third party without restriction.',
    rationale: 'Baseline NDA language. The four standard exceptions at the end are non-negotiable — they\'re what makes the clause enforceable and what prevents it from swallowing public-domain information.',
    citations: ['UTSA §1', 'Customer Playbook §H1'],
  },
];

// Apply defaults: alwaysInclude, dates, reviewer, severity, active
function finalizeBaseline(base) {
  return base.map(c => ({
    ...c,
    alwaysInclude: true,
    baseline: true,
    created: c.created || '2024-01-15',
    expires: c.expires || '2027-01-14',
    reviewer: c.reviewer || 'Customer Legal · Playbook Committee',
    active: true,
    vectorBuckets: [{ scope: `Baseline · ${c.cat}`, score: 1.00 }],
  }));
}

const BASELINE_LEDGER = finalizeBaseline(BASELINE_FRAMEWORK);

window.BASELINE_LEDGER = BASELINE_LEDGER;
window.BASELINE_FRAMEWORK = BASELINE_FRAMEWORK;
