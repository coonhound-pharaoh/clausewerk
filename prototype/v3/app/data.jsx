// Seed data: the Clause Bank (Ledger)
const CATEGORIES = [
  { key: 'data',   label: 'Data Privacy',      short: 'DP' },
  { key: 'sec',    label: 'Security',          short: 'SC' },
  { key: 'indem',  label: 'Indemnity',         short: 'ID' },
  { key: 'ip',     label: 'IP & Licensing',    short: 'IP' },
  { key: 'conf',   label: 'Confidentiality',   short: 'CF' },
  { key: 'liab',   label: 'Liability Cap',     short: 'LC' },
  { key: 'ins',    label: 'Insurance',         short: 'IN' },
  { key: 'term',   label: 'Termination',       short: 'TM' },
  { key: 'sla',    label: 'SLA & Uptime',      short: 'SL' },
  { key: 'pay',    label: 'Payment Terms',     short: 'PT' },
  { key: 'subs',   label: 'Subcontracting',    short: 'SB' },
  { key: 'accept', label: 'Acceptance',        short: 'AC' },
  { key: 'warr',   label: 'Warranty',          short: 'WR' },
  { key: 'compl',  label: 'Compliance',        short: 'CP' },
  { key: 'ship',   label: 'Delivery & Title',  short: 'DT' },
  { key: 'labor',  label: 'Staffing & Labor',  short: 'ST' },
  { key: 'audit',  label: 'Audit Rights',      short: 'AU' },
  { key: 'disp',   label: 'Dispute Resolution',short: 'DR' },
  { key: 'govlaw', label: 'Governing Law',     short: 'GL' },
  { key: 'fmaj',   label: 'Force Majeure',     short: 'FM' },
  { key: 'change', label: 'Change Control',    short: 'CC' },
  { key: 'ben',    label: 'Benchmarking & MFN',short: 'BM' },
  { key: 'bcdr',   label: 'Business Continuity',short:'BC' },
  { key: 'susta',  label: 'Sustainability',    short: 'SU' },
  { key: 'mkt',    label: 'Marketing & Publicity', short:'MK' },
  { key: 'trade',  label: 'Export & Sanctions',short: 'EX' },
  { key: 'acc',    label: 'Accessibility',     short: 'AX' },
  { key: 'tax',    label: 'Tax & Withholding', short: 'TX' },
  { key: 'records',label: 'Records Retention', short: 'RR' },
  { key: 'fac',    label: 'Facilities & Site Access', short:'FA' },

  // ── V3.1 baseline-framework categories (customer-side cross-cutting) ──
  { key: 'defs',   label: 'Definitions',        short: 'DF' },
  { key: 'prec',   label: 'Order of Precedence',short: 'OP' },
  { key: 'entire', label: 'Entire Agreement',   short: 'EA' },
  { key: 'amend',  label: 'Amendment',          short: 'AM' },
  { key: 'waiver', label: 'Waiver',             short: 'WV' },
  { key: 'scope',  label: 'Scope of Services',  short: 'SS' },
  { key: 'pers',   label: 'Personnel Quality',  short: 'PQ' },
  { key: 'corr',   label: 'Anti-Corruption',    short: 'AB' },
  { key: 'nonsol', label: 'Non-Solicitation',   short: 'NS' },
  { key: 'assign', label: 'Assignment',         short: 'AS' },
  { key: 'coc',    label: 'Change of Control',  short: 'CO' },
  { key: 'indep',  label: 'Independent Contractors', short: 'IC' },
  { key: 'notice', label: 'Notices',            short: 'NT' },
  { key: 'sever',  label: 'Severability',       short: 'SV' },
  { key: 'surv',   label: 'Survival',           short: 'SR' },
  { key: 'esc',    label: 'Escalation',         short: 'ES' },
  { key: 'ddest',  label: 'Data Return & Destruction', short: 'DD' },
  { key: 'dbn',    label: 'Breach Notification',short: 'BN' },
];

const CATEGORY_BY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.label, c]));

const INITIAL_LEDGER = [
  // ── Data Privacy ──────────────────────────────────────────────────────────
  { id: 'DP-S-003', cat: 'Data Privacy', sev: 'Standard', title: 'Data processing — baseline',
    text: 'Licensor shall process Personal Data solely to provide the Services, in accordance with applicable data-protection laws, and shall implement reasonable technical and organizational measures to protect such data from unauthorized access.' },
  { id: 'DP-H-014', cat: 'Data Privacy', sev: 'High', title: 'Data processing — GDPR / regulated',
    text: 'Controller agrees to process Personal Data strictly in accordance with Articles 28–32 GDPR. Licensor shall maintain a Record of Processing Activities, execute a Data Processing Agreement and Standard Contractual Clauses where transfers cross jurisdictional borders, and notify Controller within 24 hours of any Personal Data Breach.' },
  { id: 'DP-H-021', cat: 'Data Privacy', sev: 'High', title: 'Data processing — US healthcare (HIPAA)',
    text: 'Vendor shall execute a Business Associate Agreement in the form attached as Exhibit B, implement administrative, physical, and technical safeguards as required by 45 CFR §§ 164.308–164.314, and report any Security Incident involving Protected Health Information within forty-eight (48) hours of discovery.' },
  { id: 'DP-H-028', cat: 'Data Privacy', sev: 'High', title: 'Data processing — US financial (GLBA / state privacy)',
    text: 'Vendor shall comply with the Gramm-Leach-Bliley Act Safeguards Rule, applicable state consumer privacy laws (including CCPA/CPRA as amended), and shall not sell or share Personal Information as those terms are defined thereunder. Vendor shall honor verified consumer deletion requests forwarded by Customer within fifteen (15) business days.' },

  // ── Security ──────────────────────────────────────────────────────────────
  { id: 'SC-S-004', cat: 'Security', sev: 'Standard', title: 'Security program — baseline',
    text: 'Vendor shall maintain a written information security program aligned with industry-standard frameworks (e.g., NIST CSF or ISO 27002), including access controls, encryption in transit for Customer Data, vulnerability management, and annual employee security training.' },
  { id: 'SC-H-012', cat: 'Security', sev: 'High', title: 'Security — SOC 2 / ISO 27001 attestation',
    text: 'Vendor shall maintain a current SOC 2 Type II report (or ISO 27001 certification), encrypt Customer Data at rest using AES-256 or equivalent, enforce multi-factor authentication for all privileged access, conduct annual third-party penetration testing, and provide attestation reports to Customer upon request and at least annually.' },
  { id: 'SC-H-019', cat: 'Security', sev: 'High', title: 'Incident response — 24h notice',
    text: 'Vendor shall maintain a documented Incident Response Plan, notify Customer of any confirmed Security Incident affecting Customer Data within twenty-four (24) hours of discovery, provide a written root-cause analysis within ten (10) business days, and cooperate with Customer-led forensic investigation at Vendor\'s expense where the incident arose from Vendor\'s breach.' },

  // ── Indemnity ─────────────────────────────────────────────────────────────
  { id: 'ID-S-004', cat: 'Indemnity', sev: 'Standard', title: 'Mutual indemnity — baseline',
    text: 'Each party shall indemnify the other against third-party claims arising from its breach of this Agreement, subject to the Liability Cap set forth herein.' },
  { id: 'ID-H-007', cat: 'Indemnity', sev: 'High', title: 'Broad indemnity — regulated industry',
    text: 'Each party shall defend, indemnify, and hold harmless the other from all third-party claims, losses, damages, and expenses (including reasonable attorneys\' fees) arising from gross negligence, intentional misconduct, material breach, or violation of applicable law, without regard to the Liability Cap for claims arising under this Section.' },
  { id: 'ID-H-022', cat: 'Indemnity', sev: 'High', title: 'IP infringement indemnity',
    text: 'Vendor shall defend, indemnify, and hold harmless Customer from any third-party claim alleging that the Deliverables infringe a valid U.S. patent, copyright, trademark, or trade secret, and shall at its expense (i) procure the right to continued use, (ii) modify the Deliverables to be non-infringing, or (iii) refund fees paid for the affected Deliverable.' },

  // ── IP & Licensing ────────────────────────────────────────────────────────
  { id: 'IP-S-002', cat: 'IP & Licensing', sev: 'Standard', title: 'Non-exclusive license',
    text: 'Licensor grants Licensee a non-exclusive, non-transferable license to use the Software as configured, excluding any right to create derivative works or to reverse-engineer the Software.' },
  { id: 'IP-H-009', cat: 'IP & Licensing', sev: 'High', title: 'IP with infringement warranty',
    text: 'Licensor represents that the Software does not infringe any third-party intellectual property rights, and shall, at its expense, defend and resolve any such infringement claim, including by procuring the right to continue use, modifying the Software, or refunding prepaid fees.' },
  { id: 'IP-H-023', cat: 'IP & Licensing', sev: 'High', title: 'Work-for-hire — custom deliverables',
    text: 'All Deliverables created by Vendor specifically for Customer under a Statement of Work shall be deemed "work made for hire" under the U.S. Copyright Act. To the extent any Deliverable does not qualify as work made for hire, Vendor hereby irrevocably assigns to Customer all right, title, and interest therein, including all intellectual property rights, and shall execute such further documents as reasonably necessary to perfect such assignment.' },
  { id: 'IP-H-031', cat: 'IP & Licensing', sev: 'High', title: 'Open-source disclosure',
    text: 'Vendor shall disclose in writing all open-source software components incorporated into the Deliverables, including license type and version, and shall not incorporate any component licensed under GPL, AGPL, or other copyleft terms that would subject Customer\'s proprietary code to disclosure obligations without prior written consent.' },
  { id: 'IP-H-034', cat: 'IP & Licensing', sev: 'High', title: 'AI training data & model outputs',
    text: 'Vendor shall not use Customer Data to train, fine-tune, or evaluate any machine-learning model without Customer\'s prior written consent. Vendor warrants that model outputs provided to Customer are not derived from third-party copyrighted works absent a license permitting such use, and indemnifies Customer against claims arising from such use.' },

  // ── Confidentiality ───────────────────────────────────────────────────────
  { id: 'CF-S-006', cat: 'Confidentiality', sev: 'Standard', title: 'Mutual NDA — 3 years',
    text: 'Each party shall hold the other\'s Confidential Information in confidence for a period of three (3) years following disclosure, use it only for purposes of this Agreement, and protect it with the same degree of care it applies to its own confidential information of like importance (and in no event less than a reasonable standard of care).' },
  { id: 'CF-H-015', cat: 'Confidentiality', sev: 'High', title: 'Perpetual confidentiality — trade secrets',
    text: 'Confidentiality obligations with respect to trade secrets shall continue for so long as such information remains a trade secret under applicable law. Disclosure to employees and contractors shall be on a need-to-know basis, under written confidentiality obligations no less protective than those herein, and the receiving party shall remain liable for their compliance.' },

  // ── Liability Cap ─────────────────────────────────────────────────────────
  { id: 'LC-S-001', cat: 'Liability Cap', sev: 'Standard', title: 'Cap — 12 months fees',
    text: 'In no event shall either party\'s aggregate liability under this Agreement exceed the fees paid or payable during the twelve (12) months immediately preceding the event giving rise to the claim.' },
  { id: 'LC-H-006', cat: 'Liability Cap', sev: 'High', title: 'Cap — 2× annual fees, carve-outs',
    text: 'Aggregate liability shall not exceed two (2) times the annual fees; provided, however, that this cap shall not apply to breaches of confidentiality, data-protection obligations, indemnification obligations, or either party\'s gross negligence or willful misconduct.' },
  { id: 'LC-H-026', cat: 'Liability Cap', sev: 'High', title: 'Super-cap — enterprise / strategic',
    text: 'For claims arising from data breach, IP infringement indemnity, or violation of applicable law, liability shall be capped at the greater of (a) five (5) times the annual fees or (b) USD 5,000,000; provided that no cap shall apply to either party\'s willful misconduct or fraud.' },

  // ── Insurance ─────────────────────────────────────────────────────────────
  { id: 'IN-S-005', cat: 'Insurance', sev: 'Standard', title: 'Insurance — baseline coverage',
    text: 'Vendor shall maintain, at its own expense, (a) Commercial General Liability insurance of at least USD 1,000,000 per occurrence / USD 2,000,000 aggregate, (b) Workers\' Compensation insurance as required by law, and (c) Professional Liability (E&O) insurance of at least USD 1,000,000 per claim. Certificates shall be provided upon request.' },
  { id: 'IN-H-013', cat: 'Insurance', sev: 'High', title: 'Insurance — enterprise + cyber',
    text: 'Vendor shall maintain the following minimum coverages: Commercial General Liability USD 5,000,000; Professional Liability/E&O USD 5,000,000; Cyber Liability (including privacy, security, and notification costs) USD 10,000,000; Umbrella/Excess USD 10,000,000; Workers\' Compensation at statutory limits. Customer shall be named as additional insured on applicable policies, and Vendor shall provide 30 days\' notice of cancellation or material change.' },

  // ── Termination ───────────────────────────────────────────────────────────
  { id: 'TM-S-011', cat: 'Termination', sev: 'Standard', title: 'Termination — 30-day convenience',
    text: 'Either party may terminate this Agreement for convenience upon thirty (30) days\' prior written notice, or for uncured material breach fifteen (15) days after written notice specifying such breach.' },
  { id: 'TM-H-013', cat: 'Termination', sev: 'High', title: 'Termination — regulated exit',
    text: 'In addition to standard termination rights, Licensee may terminate immediately upon Licensor\'s material breach of data-protection, security, or regulatory obligations, and Licensor shall cooperate in an orderly transition, returning or destroying Customer Data within thirty (30) days of termination.' },
  { id: 'TM-H-024', cat: 'Termination', sev: 'High', title: 'Termination — transition assistance',
    text: 'Upon termination for any reason, Vendor shall provide transition assistance for up to one hundred eighty (180) days at Vendor\'s then-current time-and-materials rates, including export of Customer Data in a commercially reasonable format, knowledge transfer sessions, and cooperation with any successor vendor, without withholding Deliverables or data as leverage.' },

  // ── SLA & Uptime ──────────────────────────────────────────────────────────
  { id: 'SL-S-008', cat: 'SLA & Uptime', sev: 'Standard', title: 'SLA — 99.5% monthly',
    text: 'Licensor shall use commercially reasonable efforts to maintain Service availability of 99.5% measured monthly, excluding scheduled maintenance windows.' },
  { id: 'SL-H-005', cat: 'SLA & Uptime', sev: 'High', title: 'SLA — 99.9% with credits',
    text: 'Licensor warrants Service availability of 99.9% measured monthly. Failure to meet this SLA shall entitle Licensee to service credits on a sliding scale (10–25% of monthly fees) and, upon three (3) consecutive missed months, termination without penalty.' },
  { id: 'SL-H-025', cat: 'SLA & Uptime', sev: 'High', title: 'SLA — 99.99% mission-critical',
    text: 'Vendor guarantees Service availability of 99.99% measured monthly (a "four-nines" SLA), with Priority 1 incident response within fifteen (15) minutes and resolution within four (4) hours. Missed SLAs trigger graduated service credits (up to 50% of monthly fees) and, upon a single P1 outage exceeding twenty-four (24) hours, Customer\'s right to terminate without penalty and recover migration costs.' },

  // ── Payment Terms ─────────────────────────────────────────────────────────
  { id: 'PT-S-022', cat: 'Payment Terms', sev: 'Standard', title: 'Net-30',
    text: 'Licensee shall pay undisputed invoices within thirty (30) days of receipt. Amounts not paid when due shall accrue interest at 1.0% per month or the maximum rate permitted by law, whichever is lower.' },
  { id: 'PT-H-017', cat: 'Payment Terms', sev: 'High', title: 'Milestone-gated payment',
    text: 'Payment shall be tied to acceptance of defined milestones. Licensee may withhold up to 20% of each invoice pending acceptance testing, and disputed amounts shall not accrue interest during the dispute resolution period.' },
  { id: 'PT-S-029', cat: 'Payment Terms', sev: 'Standard', title: 'Fixed-fee engagement',
    text: 'The fees set forth in the applicable Statement of Work are fixed and inclusive of all Vendor expenses except for pre-approved travel, which shall be reimbursed at actual cost in accordance with Customer\'s travel policy. No change orders shall be executed without the written approval of Customer\'s authorized representative.' },
  { id: 'PT-H-033', cat: 'Payment Terms', sev: 'High', title: 'T&M with not-to-exceed cap',
    text: 'Services shall be invoiced monthly on a time-and-materials basis at the rates set forth in Exhibit A, subject to a not-to-exceed cap equal to the amount stated in the Statement of Work. Vendor shall notify Customer in writing when 75% of the cap is reached and shall not exceed the cap without a written change order.' },

  // ── Subcontracting ────────────────────────────────────────────────────────
  { id: 'SB-S-010', cat: 'Subcontracting', sev: 'Standard', title: 'Subcontracting — notice',
    text: 'Licensor may engage subcontractors to perform the Services provided Licensor remains responsible for their performance and gives Licensee prior notice of any material subcontracting arrangement.' },
  { id: 'SB-H-003', cat: 'Subcontracting', sev: 'High', title: 'Subcontracting — written consent',
    text: 'Licensor shall not engage subcontractors to perform any material portion of the Services without Licensee\'s prior written consent, and all subcontractors shall be bound in writing to terms no less protective than those of this Agreement.' },
  { id: 'SB-H-030', cat: 'Subcontracting', sev: 'High', title: 'Offshore restriction',
    text: 'Vendor shall not perform the Services, or permit subcontractors to perform the Services, from any location outside the United States, United Kingdom, European Union, Canada, or Australia without Customer\'s prior written consent. Vendor shall maintain a current list of subprocessors and their locations and notify Customer at least thirty (30) days prior to any change.' },

  // ── Acceptance ────────────────────────────────────────────────────────────
  { id: 'AC-S-016', cat: 'Acceptance', sev: 'Standard', title: 'Deemed acceptance — 10 days',
    text: 'Deliverables shall be deemed accepted ten (10) business days after delivery unless Customer provides written notice of material non-conformance. Upon such notice, Vendor shall have fifteen (15) business days to cure, after which Customer may, at its option, accept the Deliverable as-is with an equitable fee adjustment or reject it and receive a refund of fees paid for the affected Deliverable.' },
  { id: 'AC-H-027', cat: 'Acceptance', sev: 'High', title: 'Formal acceptance testing',
    text: 'Customer shall have thirty (30) days to conduct acceptance testing against written acceptance criteria set forth in the applicable Statement of Work. Vendor shall have two (2) opportunities to cure any material non-conformance, each not to exceed fifteen (15) business days. If the Deliverable fails to pass acceptance testing after the second cure attempt, Customer may terminate the affected SOW and receive a full refund of fees paid thereunder.' },

  // ── Warranty ──────────────────────────────────────────────────────────────
  { id: 'WR-S-018', cat: 'Warranty', sev: 'Standard', title: 'Services warranty — 90 days',
    text: 'Vendor warrants for a period of ninety (90) days following completion that the Services were performed in a professional and workmanlike manner in accordance with generally accepted industry standards. Customer\'s sole remedy for breach of this warranty shall be re-performance of the non-conforming Services at no additional cost.' },
  { id: 'WR-H-032', cat: 'Warranty', sev: 'High', title: 'Product warranty — 24 months',
    text: 'Vendor warrants that the Hardware will be free from defects in materials and workmanship for a period of twenty-four (24) months from the date of delivery, under normal use. Vendor shall, at its option, repair or replace defective units within ten (10) business days of receipt, and shall cover all shipping costs associated with warranty returns.' },

  // ── Compliance ────────────────────────────────────────────────────────────
  { id: 'CP-S-020', cat: 'Compliance', sev: 'Standard', title: 'Laws & regulations — baseline',
    text: 'Each party shall comply with all applicable federal, state, and local laws, regulations, and ordinances in performing its obligations under this Agreement, including anti-bribery, anti-corruption, and export-control laws.' },
  { id: 'CP-H-035', cat: 'Compliance', sev: 'High', title: 'Regulated — FAR / DFARS / FedRAMP',
    text: 'Where Services are performed in support of U.S. federal government contracts, Vendor shall comply with applicable FAR and DFARS clauses flowed down in Exhibit C, maintain CMMC certification at the level required by the prime contract, and ensure that any cloud services used meet FedRAMP Moderate (or High, if required) authorization.' },
  { id: 'CP-H-038', cat: 'Compliance', sev: 'High', title: 'Modern slavery / supply chain ethics',
    text: 'Vendor represents that it has taken commercially reasonable steps to prevent modern slavery, human trafficking, and forced or child labor in its operations and supply chain, complies with the UK Modern Slavery Act 2015 (where applicable), and shall cooperate with Customer\'s supply-chain due diligence requests.' },

  // ── Delivery & Title (goods/hardware) ─────────────────────────────────────
  { id: 'DT-S-036', cat: 'Delivery & Title', sev: 'Standard', title: 'FOB destination',
    text: 'Delivery shall be FOB destination. Title to and risk of loss for the Goods shall pass to Customer upon delivery to the designated destination and acknowledgment of receipt. Vendor shall bear all shipping costs and insure the Goods in transit to their full replacement value.' },
  { id: 'DT-H-037', cat: 'Delivery & Title', sev: 'High', title: 'Delivery — liquidated damages for delay',
    text: 'Time is of the essence. If Vendor fails to deliver the Goods by the delivery date set forth in the purchase order, Vendor shall pay Customer liquidated damages equal to 0.5% of the purchase price per calendar day of delay, capped at 10% of the purchase price. Customer may also, after fifteen (15) days of delay, terminate the order and procure substitute goods, charging cover costs to Vendor.' },

  // ── Staffing & Labor ──────────────────────────────────────────────────────
  { id: 'ST-S-039', cat: 'Staffing & Labor', sev: 'Standard', title: 'Contractor status — baseline',
    text: 'Vendor\'s personnel shall at all times be employees or independent contractors of Vendor and not of Customer. Vendor shall be solely responsible for all wages, benefits, payroll taxes, and worker\'s compensation coverage for its personnel, and shall indemnify Customer against any claim to the contrary.' },
  { id: 'ST-H-040', cat: 'Staffing & Labor', sev: 'High', title: 'Key personnel & background checks',
    text: 'Vendor shall assign to the engagement the Key Personnel named in the applicable Statement of Work and shall not remove or reassign them without Customer\'s prior written consent, except for termination of employment or similar cause. All personnel with access to Customer systems or data shall have passed criminal background, credit (where permitted by law), and drug-screening checks consistent with Customer\'s vendor standards.' },
  { id: 'ST-H-041', cat: 'Staffing & Labor', sev: 'High', title: 'Non-solicitation — 12 months',
    text: 'During the term of this Agreement and for twelve (12) months thereafter, neither party shall directly solicit for employment any employee or contractor of the other party who was materially involved in the performance of this Agreement; provided that general public advertisements not targeted at such persons shall not be deemed solicitation.' },

  // ── Audit Rights ──────────────────────────────────────────────────────────
  { id: 'AU-S-042', cat: 'Audit Rights', sev: 'Standard', title: 'Financial audit — once annually',
    text: 'Customer may, upon thirty (30) days\' written notice and no more than once per calendar year, audit Vendor\'s books and records related to fees invoiced under this Agreement. If such audit discloses an overcharge of more than 5%, Vendor shall reimburse Customer for reasonable audit costs in addition to the overcharge.' },
  { id: 'AU-H-043', cat: 'Audit Rights', sev: 'High', title: 'Security & compliance audit',
    text: 'Customer, or an independent third-party auditor engaged by Customer under confidentiality obligations, may audit Vendor\'s security, privacy, and regulatory compliance with respect to the Services, upon thirty (30) days\' notice (or immediately in the event of a Security Incident). Vendor shall remediate material findings within a mutually agreed timeframe not to exceed ninety (90) days.' },

  // ── Dispute Resolution ────────────────────────────────────────────────────
  { id: 'DR-S-044', cat: 'Dispute Resolution', sev: 'Standard', title: 'Dispute — escalation & courts',
    text: 'Before initiating litigation, the parties shall attempt in good faith to resolve any dispute through escalation to senior executives for a period of thirty (30) days. Any unresolved dispute shall be subject to the exclusive jurisdiction of the state and federal courts located in the Customer\'s principal place of business, and each party waives any objection to venue.' },
  { id: 'DR-H-045', cat: 'Dispute Resolution', sev: 'High', title: 'Arbitration — AAA, confidential',
    text: 'Any dispute arising out of or relating to this Agreement shall be finally resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, before a single arbitrator, in the city of Customer\'s principal place of business. The proceedings and award shall be confidential. Nothing herein shall prevent a party from seeking injunctive relief in a court of competent jurisdiction to protect its intellectual property or confidential information.' },
  { id: 'DR-H-046', cat: 'Dispute Resolution', sev: 'High', title: 'International — ICC arbitration, London seat',
    text: 'Any dispute arising out of or in connection with this Agreement shall be finally settled under the Rules of Arbitration of the International Chamber of Commerce by one or three arbitrators appointed in accordance with the said Rules. The seat of arbitration shall be London, England, and the language of the proceedings shall be English. The arbitral award shall be final and enforceable in any court of competent jurisdiction.' },
  { id: 'DR-S-047', cat: 'Dispute Resolution', sev: 'Standard', title: 'Mediation — precondition to suit',
    text: 'Prior to commencing litigation or arbitration, the parties shall attempt in good faith to resolve any dispute through confidential mediation administered by JAMS under its Commercial Mediation Rules for a period of sixty (60) days. Statute-of-limitations periods shall be tolled during the mediation period.' },

  // ── Governing Law ─────────────────────────────────────────────────────────
  { id: 'GL-S-048', cat: 'Governing Law', sev: 'Standard', title: 'Governing law — Delaware',
    text: 'This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict-of-laws principles. The United Nations Convention on Contracts for the International Sale of Goods shall not apply.' },
  { id: 'GL-H-049', cat: 'Governing Law', sev: 'High', title: 'Governing law — international / neutral',
    text: 'This Agreement shall be governed by the laws of England and Wales, excluding its conflict-of-laws rules and the U.N. Convention on Contracts for the International Sale of Goods. Each party irrevocably waives any right to trial by jury in connection with any dispute arising hereunder, to the extent permitted by applicable law.' },

  // ── Force Majeure ─────────────────────────────────────────────────────────
  { id: 'FM-S-050', cat: 'Force Majeure', sev: 'Standard', title: 'Force majeure — standard',
    text: 'Neither party shall be liable for any delay or failure in performance (other than payment obligations) caused by events beyond its reasonable control, including acts of God, war, terrorism, civil unrest, labor disputes, pandemics, governmental action, or failure of public utilities, provided the affected party gives prompt notice and uses commercially reasonable efforts to resume performance.' },
  { id: 'FM-H-051', cat: 'Force Majeure', sev: 'High', title: 'Force majeure — termination right after 30 days',
    text: 'If a force-majeure event prevents a party from materially performing its obligations for a continuous period exceeding thirty (30) days, the non-affected party may terminate this Agreement or the affected Statement of Work without penalty upon written notice, and shall receive a pro rata refund of prepaid, unused fees. Epidemic-related supply chain disruptions shall not excuse performance beyond ninety (90) days.' },

  // ── Change Control ────────────────────────────────────────────────────────
  { id: 'CC-S-052', cat: 'Change Control', sev: 'Standard', title: 'Change order — writing required',
    text: 'No change to the scope, schedule, fees, or deliverables of an SOW shall be effective unless documented in a written change order signed by an authorized representative of each party. Vendor shall not proceed with, or invoice for, out-of-scope work in the absence of an executed change order.' },
  { id: 'CC-H-053', cat: 'Change Control', sev: 'High', title: 'Change control board — quarterly caps',
    text: 'All changes affecting scope, schedule, or fees shall be reviewed by a joint Change Control Board meeting at least monthly. Cumulative change-order value in any rolling twelve-month period shall not exceed twenty percent (20%) of the original SOW value without Customer executive-sponsor approval. Vendor shall provide impact analyses for each proposed change within five (5) business days of request.' },

  // ── Benchmarking & MFN ────────────────────────────────────────────────────
  { id: 'BM-S-076', cat: 'Benchmarking & MFN', sev: 'Standard', title: 'Benchmarking — right to request',
    text: 'Upon reasonable written request, Vendor shall provide Customer with current pricing information for comparable Services as then published by Vendor to other customers of similar volume and scope. The parties shall discuss in good faith any material divergence between Vendor\'s pricing to Customer and its prevailing market rates, though no unilateral adjustment shall be required absent an executed amendment.' },
  { id: 'BM-H-054', cat: 'Benchmarking & MFN', sev: 'High', title: 'Benchmarking — biennial',
    text: 'Once every two (2) years, Customer may engage an independent benchmarking firm to compare Vendor\'s fees and service levels against comparable market offerings. If the benchmark identifies fees more than ten percent (10%) above market for equivalent scope and volume, Vendor shall within sixty (60) days either match the benchmarked rates or allow Customer to terminate the affected Services without penalty.' },
  { id: 'BM-H-055', cat: 'Benchmarking & MFN', sev: 'High', title: 'Most-favored-customer pricing',
    text: 'Vendor represents that the pricing, discounts, and commercial terms provided to Customer under this Agreement are no less favorable than those provided to any similarly situated customer of Vendor for comparable volume and scope. If Vendor subsequently offers more favorable terms to a similarly situated customer, Vendor shall within thirty (30) days offer Customer the benefit of such terms retroactive to the date first offered.' },

  // ── Business Continuity / DR ──────────────────────────────────────────────
  { id: 'BC-S-056', cat: 'Business Continuity', sev: 'Standard', title: 'BC/DR — baseline',
    text: 'Vendor shall maintain a written business continuity and disaster recovery plan covering the Services, test the plan at least annually, and provide a summary of test results to Customer upon request. Recovery Time Objective (RTO) shall not exceed twenty-four (24) hours and Recovery Point Objective (RPO) shall not exceed four (4) hours for Customer-impacting Services.' },
  { id: 'BC-H-057', cat: 'Business Continuity', sev: 'High', title: 'BC/DR — mission-critical (RTO 1h / RPO 15m)',
    text: 'Vendor shall maintain geographically redundant active-active infrastructure with a Recovery Time Objective of one (1) hour and Recovery Point Objective of fifteen (15) minutes for all mission-critical Services. Vendor shall conduct full-scale failover testing at least semi-annually, allow Customer to observe or participate in such testing, and provide a post-test report within ten (10) business days.' },
  { id: 'BC-H-058', cat: 'Business Continuity', sev: 'High', title: 'Source-code escrow',
    text: 'Vendor shall deposit into escrow with a reputable third-party escrow agent, and keep current, the source code, build instructions, and technical documentation for the Licensed Software. Customer shall be a named beneficiary entitled to release upon any of: (a) Vendor\'s bankruptcy or insolvency; (b) Vendor\'s cessation of support or material breach uncured for thirty (30) days; or (c) Vendor\'s acquisition by a direct competitor of Customer.' },

  // ── Sustainability & ESG ──────────────────────────────────────────────────
  { id: 'SU-S-059', cat: 'Sustainability', sev: 'Standard', title: 'Environmental compliance — baseline',
    text: 'Vendor shall comply with all applicable environmental laws and regulations in performing the Services, and shall use commercially reasonable efforts to minimize waste, energy consumption, and emissions associated with the performance of this Agreement.' },
  { id: 'SU-H-060', cat: 'Sustainability', sev: 'High', title: 'ESG — reporting & carbon disclosure',
    text: 'Vendor shall annually disclose to Customer its Scope 1, Scope 2, and material Scope 3 greenhouse-gas emissions attributable to the Services, aligned with the GHG Protocol. Vendor shall maintain third-party verified ESG reporting (e.g., CDP, EcoVadis) at a rating no lower than its rating as of the Effective Date, and shall notify Customer of any material decline in such rating within thirty (30) days.' },
  { id: 'SU-H-061', cat: 'Sustainability', sev: 'High', title: 'Conflict minerals & responsible sourcing',
    text: 'Vendor represents that Goods furnished hereunder are sourced in compliance with Section 1502 of the Dodd-Frank Act and its implementing regulations regarding conflict minerals (tin, tantalum, tungsten, gold), and shall provide a Conflict Minerals Report in the CMRT format upon request. Vendor shall conduct reasonable supply-chain due diligence consistent with the OECD Due Diligence Guidance.' },

  // ── Marketing & Publicity ─────────────────────────────────────────────────
  { id: 'MK-S-062', cat: 'Marketing & Publicity', sev: 'Standard', title: 'Publicity — mutual consent',
    text: 'Neither party shall issue any press release, case study, public statement, or other publicity referencing the other party or this Agreement without the other party\'s prior written consent, which shall not be unreasonably withheld. Use of the other party\'s name or logo shall comply with the owner\'s brand guidelines and be revocable upon written notice.' },
  { id: 'MK-H-063', cat: 'Marketing & Publicity', sev: 'High', title: 'Logo use & customer reference',
    text: 'Customer grants Vendor a limited, revocable, non-exclusive license to use Customer\'s name and logo on Vendor\'s customer list and website, subject to Customer\'s brand guidelines and written consent for each specific use. Customer shall not be obligated to serve as a reference, participate in case studies, or speak at Vendor events. All rights not expressly granted are reserved.' },
  { id: 'MK-H-064', cat: 'Marketing & Publicity', sev: 'High', title: 'Media rights — advertising / content',
    text: 'Vendor grants Customer a worldwide, perpetual, royalty-free, fully paid-up license to reproduce, distribute, publicly display, publicly perform, create derivative works of, and otherwise exploit the Deliverables in all media now known or hereafter devised, in connection with Customer\'s business. Vendor warrants it has obtained all third-party talent, music, and image clearances necessary for such use and shall deliver signed releases upon request.' },

  // ── Export & Sanctions ────────────────────────────────────────────────────
  { id: 'EX-S-065', cat: 'Export & Sanctions', sev: 'Standard', title: 'Export controls — baseline',
    text: 'Each party shall comply with all applicable export-control and economic-sanctions laws, including the U.S. Export Administration Regulations, International Traffic in Arms Regulations, and regulations administered by the U.S. Office of Foreign Assets Control (OFAC), and shall not export, re-export, or transfer any technology or data in violation thereof.' },
  { id: 'EX-H-066', cat: 'Export & Sanctions', sev: 'High', title: 'Sanctions — SDN screening & blocked parties',
    text: 'Vendor represents and warrants that neither Vendor, its affiliates, directors, officers, nor any personnel performing the Services is (i) on the U.S. Specially Designated Nationals and Blocked Persons List, (ii) owned or controlled 50% or more by persons on such list, or (iii) located in a comprehensively sanctioned jurisdiction (currently Cuba, Iran, North Korea, Syria, the Crimea, Donetsk, and Luhansk regions). Vendor shall screen personnel against applicable denied-party lists prior to assignment and upon material change.' },

  // ── Accessibility ─────────────────────────────────────────────────────────
  { id: 'AX-S-067', cat: 'Accessibility', sev: 'Standard', title: 'Accessibility — WCAG 2.1 AA',
    text: 'Vendor shall ensure that user-facing interfaces provided to Customer conform to WCAG 2.1 Level AA. Vendor shall provide a current Voluntary Product Accessibility Template (VPAT) in the format published by the Information Technology Industry Council upon request, and shall remediate identified non-conformances within a mutually agreed timeframe.' },
  { id: 'AX-H-068', cat: 'Accessibility', sev: 'High', title: 'Accessibility — Section 508 / EN 301 549',
    text: 'Vendor warrants that the Deliverables conform to U.S. Section 508 technical standards (36 CFR Part 1194) and EN 301 549 where applicable, including for public-sector end-users. Vendor shall indemnify Customer against any claim arising from non-conformance and shall remediate Priority 1 accessibility defects within fifteen (15) business days of notice.' },

  // ── Tax & Withholding ─────────────────────────────────────────────────────
  { id: 'TX-S-069', cat: 'Tax & Withholding', sev: 'Standard', title: 'Taxes — each party bears its own',
    text: 'Fees are exclusive of sales, use, value-added, goods-and-services, and similar transaction taxes, which shall be added to invoices where legally required and paid by Customer. Each party shall be responsible for its own income taxes, franchise taxes, and employment-related taxes. Neither party shall be liable for taxes based on the other\'s net income.' },
  { id: 'TX-H-070', cat: 'Tax & Withholding', sev: 'High', title: 'Withholding & tax-residency (international)',
    text: 'Where applicable tax treaties permit, Vendor shall timely deliver a properly executed IRS Form W-8BEN-E (or equivalent tax-residency certificate) and any other documentation reasonably required to reduce or eliminate withholding tax on payments under this Agreement. If documentation is not timely provided, Customer may withhold at statutory rates without gross-up. Vendor shall bear economic responsibility for any increase in withholding caused by Vendor\'s failure or delay in providing such documentation.' },

  // ── Records Retention ─────────────────────────────────────────────────────
  { id: 'RR-S-071', cat: 'Records Retention', sev: 'Standard', title: 'Records retention — 7 years',
    text: 'Vendor shall retain accurate books, records, and supporting documentation related to the Services and fees invoiced for a period of seven (7) years following expiration or termination of this Agreement, and shall make such records available to Customer or Customer\'s auditors upon reasonable notice during that period.' },
  { id: 'RR-H-072', cat: 'Records Retention', sev: 'High', title: 'Legal hold & litigation cooperation',
    text: 'Upon receipt of a written legal-hold notice from Customer, Vendor shall immediately suspend any ordinary-course destruction of records, documents, and electronically stored information identified in the notice, and shall preserve such materials until Customer lifts the hold in writing. Vendor shall cooperate with Customer\'s e-discovery and subpoena-response requirements at Vendor\'s reasonable cost where the matter arises from Vendor\'s performance.' },

  // ── Facilities & Site Access ──────────────────────────────────────────────
  { id: 'FA-S-073', cat: 'Facilities & Site Access', sev: 'Standard', title: 'Site access — rules & badging',
    text: 'While on Customer premises, Vendor personnel shall observe Customer\'s site rules, safety procedures, and security protocols, shall be badged and escorted where required, and shall not photograph, record, or remove any materials without Customer\'s prior written consent. Vendor is responsible for any damage caused to Customer property by its personnel.' },
  { id: 'FA-H-074', cat: 'Facilities & Site Access', sev: 'High', title: 'OSHA / safety — construction & physical work',
    text: 'Vendor shall comply with all applicable Occupational Safety and Health Administration (OSHA) standards and Customer\'s site-specific safety program. Vendor shall provide, and require its personnel to use, appropriate personal protective equipment, maintain a written safety plan, immediately report any workplace incident to Customer\'s site supervisor, and indemnify Customer against claims arising from Vendor\'s safety violations. Customer may require removal of any personnel who materially violates safety rules.' },
  { id: 'FA-H-075', cat: 'Facilities & Site Access', sev: 'High', title: 'Lien waiver — construction / installation',
    text: 'Vendor shall keep Customer\'s premises free and clear of all mechanic\'s, materialmen\'s, and other liens arising from the Services, shall promptly discharge any such lien (by bond or otherwise) within ten (10) business days of filing, and shall deliver partial and final lien waivers, in form reasonably acceptable to Customer, as a condition of progress and final payment.' },
];

// Keyword → risk mapping used by the local fallback classifier
const KEYWORD_RULES = [
  // Data Privacy
  { test: /\b(hipaa|phi|protected health|healthcare data|medical record)\b/i,
    category: 'Data Privacy', severity: 'High', reason: 'HIPAA-regulated health data' },
  { test: /\b(glba|financial data|bank data|consumer financial|ccpa|cpra)\b/i,
    category: 'Data Privacy', severity: 'High', reason: 'GLBA / US consumer-finance privacy' },
  { test: /\b(eu|europe|gdpr|pii|personal data|customer data|privacy)\b/i,
    category: 'Data Privacy', severity: 'High', reason: 'Regulated personal data processing' },
  { test: /\b(data|analytics|processes|storage|store|retain)\b/i,
    category: 'Data Privacy', severity: 'Standard', reason: 'Handles customer data at a baseline level' },

  // Security
  { test: /\b(soc 2|soc2|iso 27001|iso27001|pen test|penetration|encryption at rest|mfa|pci)\b/i,
    category: 'Security', severity: 'High', reason: 'Formal security attestation required' },
  { test: /\b(security|access control|credentials|vpn|siem)\b/i,
    category: 'Security', severity: 'Standard', reason: 'Baseline security controls apply' },

  // Indemnity
  { test: /\b(\$[0-9]+[MK]|million|high value|strategic|mission critical)\b/i,
    category: 'Indemnity', severity: 'High', reason: 'High contract value warrants broad indemnity' },
  { test: /\b(indemn|liability|lawsuit|claim)\b/i,
    category: 'Indemnity', severity: 'Standard', reason: 'Standard mutual indemnity appropriate' },

  // IP
  { test: /\b(source code|derivative|custom build|white label|work for hire|assignment|ip|patent)\b/i,
    category: 'IP & Licensing', severity: 'High', reason: 'IP ownership and infringement exposure' },
  { test: /\b(open source|oss|gpl|agpl|apache|mit license)\b/i,
    category: 'IP & Licensing', severity: 'High', reason: 'Open-source disclosure obligations' },
  { test: /\b(ai|ml|llm|training|fine-tune|model output|generative)\b/i,
    category: 'IP & Licensing', severity: 'High', reason: 'AI training / model-output risk' },
  { test: /\b(software|license|saas|platform|tool)\b/i,
    category: 'IP & Licensing', severity: 'Standard', reason: 'Standard off-the-shelf licensing terms' },

  // Confidentiality
  { test: /\b(trade secret|proprietary|know-how|formula|algorithm)\b/i,
    category: 'Confidentiality', severity: 'High', reason: 'Trade-secret protection warranted' },
  { test: /\b(confidential|nda)\b/i,
    category: 'Confidentiality', severity: 'Standard', reason: 'Mutual confidentiality appropriate' },

  // Insurance
  { test: /\b(on-?site|premises|installation|construction|physical)\b/i,
    category: 'Insurance', severity: 'High', reason: 'On-site work triggers higher insurance requirements' },
  { test: /\b(contractor|services|consultant|agency)\b/i,
    category: 'Insurance', severity: 'Standard', reason: 'Baseline CGL + E&O coverage required' },

  // SLA
  { test: /\b(99\.99|four nines|four-nines|mission critical|production)\b/i,
    category: 'SLA & Uptime', severity: 'High', reason: 'Mission-critical workload requires high SLA' },
  { test: /\b(uptime|sla|availability|24\/7)\b/i,
    category: 'SLA & Uptime', severity: 'High', reason: 'Production workload requires uptime guarantees' },
  { test: /\b(service|tool|platform)\b/i,
    category: 'SLA & Uptime', severity: 'Standard', reason: 'Standard availability expectation' },

  // Payment
  { test: /\b(time.and.materials|t&m|hourly rates|not to exceed|nte)\b/i,
    category: 'Payment Terms', severity: 'High', reason: 'T&M engagement — NTE cap recommended' },
  { test: /\b(milestone|deliverable|phase|acceptance)\b/i,
    category: 'Payment Terms', severity: 'High', reason: 'Milestone-gated payment recommended' },
  { test: /\b(fixed fee|flat fee|fixed price|one-off)\b/i,
    category: 'Payment Terms', severity: 'Standard', reason: 'Fixed-fee engagement' },

  // Subcontracting
  { test: /\b(offshore|india|philippines|outsource)\b/i,
    category: 'Subcontracting', severity: 'High', reason: 'Offshore delivery — location controls needed' },
  { test: /\b(subcontract|third party|partner|delegate)\b/i,
    category: 'Subcontracting', severity: 'High', reason: 'Subcontracting risk; consent should be required' },

  // Acceptance
  { test: /\b(acceptance|acceptance test|uat|deliverable|custom build)\b/i,
    category: 'Acceptance', severity: 'High', reason: 'Custom deliverables require formal acceptance' },

  // Warranty
  { test: /\b(hardware|device|equipment|appliance|physical product)\b/i,
    category: 'Warranty', severity: 'High', reason: 'Hardware — extended product warranty applies' },
  { test: /\b(services|consulting|professional)\b/i,
    category: 'Warranty', severity: 'Standard', reason: 'Services warranty — re-performance remedy' },

  // Compliance
  { test: /\b(federal|government|gsa|far|dfars|fedramp|public sector|cmmc)\b/i,
    category: 'Compliance', severity: 'High', reason: 'Public-sector regulatory flow-downs required' },
  { test: /\b(regulat|compliance|audit|financial|bank|healthcare)\b/i,
    category: 'Compliance', severity: 'High', reason: 'Regulated industry — compliance clause required' },

  // Delivery & Title
  { test: /\b(shipment|delivery|freight|logistics|goods|hardware|equipment)\b/i,
    category: 'Delivery & Title', severity: 'Standard', reason: 'Physical goods — delivery & title terms required' },
  { test: /\b(time is of the essence|critical delivery|just in time|inventory)\b/i,
    category: 'Delivery & Title', severity: 'High', reason: 'Delivery delays carry material business impact' },

  // Staffing
  { test: /\b(staff aug|contractor|consultant|key personnel|dedicated team)\b/i,
    category: 'Staffing & Labor', severity: 'High', reason: 'Named personnel & background checks required' },
  { test: /\b(non-solicitation|hire|poach)\b/i,
    category: 'Staffing & Labor', severity: 'High', reason: 'Non-solicitation appropriate' },

  // Audit
  { test: /\b(audit|inspection|verification|right to audit)\b/i,
    category: 'Audit Rights', severity: 'High', reason: 'Audit rights required' },

  // Termination
  { test: /\b(transition|exit|migration|data export|successor vendor)\b/i,
    category: 'Termination', severity: 'High', reason: 'Transition assistance / data portability' },
  { test: /\b(regulat|compliance|healthcare|bank|financial)\b/i,
    category: 'Termination', severity: 'High', reason: 'Regulatory exposure demands quick-exit termination' },

  // Dispute
  { test: /\b(arbitration|aaa|jams|binding arbitration)\b/i,
    category: 'Dispute Resolution', severity: 'High', reason: 'Binding arbitration' },
  { test: /\b(international|cross-border|foreign)\b/i,
    category: 'Dispute Resolution', severity: 'High', reason: 'Cross-border — neutral forum recommended' },

  // Governing Law
  { test: /\b(international|cross-border|eu|europe|uk|asia|foreign)\b/i,
    category: 'Governing Law', severity: 'High', reason: 'Cross-border deal — neutral law required' },
  { test: /\b(delaware|new york|california|state law|jurisdiction)\b/i,
    category: 'Governing Law', severity: 'Standard', reason: 'Domestic governing law' },

  // Force Majeure
  { test: /\b(force majeure|pandemic|supply chain|disruption|natural disaster)\b/i,
    category: 'Force Majeure', severity: 'High', reason: 'Supply-chain or pandemic exposure' },

  // Change Control
  { test: /\b(scope change|change order|change request|scope creep|evolving)\b/i,
    category: 'Change Control', severity: 'High', reason: 'Scope evolution expected — change control required' },
  { test: /\b(phased|long.term|multi.year|multiyear)\b/i,
    category: 'Change Control', severity: 'Standard', reason: 'Written change orders for long engagements' },

  // Benchmarking / MFN
  { test: /\b(strategic|long.term|multi.year|multiyear|enterprise|nine figure|eight figure)\b/i,
    category: 'Benchmarking & MFN', severity: 'High', reason: 'Long-term strategic deal — benchmarking protection' },

  // Business Continuity
  { test: /\b(mission critical|disaster recovery|bcdr|bc\/dr|rto|rpo|business continuity)\b/i,
    category: 'Business Continuity', severity: 'High', reason: 'Mission-critical — aggressive RTO/RPO required' },
  { test: /\b(escrow|source code escrow|bankruptcy|insolvency)\b/i,
    category: 'Business Continuity', severity: 'High', reason: 'Source-code escrow protects continuity' },

  // Sustainability
  { test: /\b(esg|carbon|emissions|net zero|sustainab|scope 1|scope 2|scope 3)\b/i,
    category: 'Sustainability', severity: 'High', reason: 'ESG reporting required' },
  { test: /\b(conflict mineral|dodd.frank|responsible sourcing)\b/i,
    category: 'Sustainability', severity: 'High', reason: 'Responsible-sourcing obligations' },

  // Marketing & Publicity
  { test: /\b(press release|publicity|case study|logo|reference customer)\b/i,
    category: 'Marketing & Publicity', severity: 'High', reason: 'Brand / publicity controls required' },
  { test: /\b(advertising|media|content|campaign|creative|broadcast|social)\b/i,
    category: 'Marketing & Publicity', severity: 'High', reason: 'Media rights — clearances required' },

  // Export & Sanctions
  { test: /\b(export|itar|ear|ofac|sanction|embargo|dual.use|encryption export)\b/i,
    category: 'Export & Sanctions', severity: 'High', reason: 'Export-control / sanctions exposure' },
  { test: /\b(cross.border|international|foreign)\b/i,
    category: 'Export & Sanctions', severity: 'Standard', reason: 'Baseline export & OFAC compliance' },

  // Accessibility
  { test: /\b(government|public sector|section 508|wcag|accessibility|ada|disability)\b/i,
    category: 'Accessibility', severity: 'High', reason: 'Public-sector accessibility standards required' },
  { test: /\b(user interface|ui|end.user|consumer)\b/i,
    category: 'Accessibility', severity: 'Standard', reason: 'End-user UI — WCAG baseline' },

  // Tax & Withholding
  { test: /\b(international|offshore|foreign vendor|cross.border|non.resident)\b/i,
    category: 'Tax & Withholding', severity: 'High', reason: 'International payment — withholding docs required' },

  // Records Retention
  { test: /\b(regulat|audit|tax|financial|healthcare|government|sox)\b/i,
    category: 'Records Retention', severity: 'Standard', reason: 'Regulatory record-retention baseline' },
  { test: /\b(litigation|legal hold|discovery|subpoena)\b/i,
    category: 'Records Retention', severity: 'High', reason: 'Legal-hold cooperation required' },

  // Facilities & Site Access
  { test: /\b(on.?site|premises|office|datacenter|data center|warehouse|site visit)\b/i,
    category: 'Facilities & Site Access', severity: 'Standard', reason: 'On-site presence — badging & rules' },
  { test: /\b(construction|installation|osha|safety|physical labor|build.out|contractor work)\b/i,
    category: 'Facilities & Site Access', severity: 'High', reason: 'Physical work — OSHA / lien protections required' },
];

// Always-include baseline categories with Standard
const BASELINE_CATEGORIES = ['Liability Cap', 'Termination', 'Payment Terms', 'Confidentiality', 'Compliance', 'Governing Law', 'Force Majeure', 'Change Control'];

const SAMPLE_INTAKES = [
  // 0 — Northwind Analytics: EU GDPR + production SLA + offshore subcontracting
  "We're onboarding Northwind Analytics to run analytics on our European customer data — they'll process PII for ~14M EU customers, including click-stream and purchase history. Annual spend is $240K, three-year term, mission-critical production workload requiring 99.99% uptime. They'll likely use offshore subcontractors in India and the Philippines. SOC 2 Type II is required; they've also asked about training their ML models on aggregated outputs from our data. We need binding arbitration and audit rights given GDPR exposure.",

  // 1 — Lumen & Brand: small marketing engagement
  "Contracting Lumen & Brand, a boutique creative agency, for a one-off marketing campaign and brand-refresh deliverables. $18K flat fee, 6-week engagement, no access to customer data or systems. They'll produce social-media creative, a press release, and a case-study draft. Standard mutual NDA and a press-release approval clause are the main asks. Domestic, California-based.",

  // 2 — Paydrive HCM: payroll renewal, financial PII, offshore
  "Renewing with Paydrive HCM, our core payroll SaaS — they process employee PII (SSNs, bank routing) and W-2 data across the US and Canada for ~3,200 employees. Mission-critical, $480K/yr, five-year renewal. They've added offshore support staff in Manila this year. GLBA and CCPA apply. We need source-code escrow given how deeply integrated they are, an aggressive RTO/RPO (4hr/15min), background checks on key personnel, and a transition-assistance clause if we ever migrate. Cross-border data flows triggered.",

  // 3 — Orchid AI: white-label resale, IP and AI training
  "Evaluating Orchid AI as a white-label resale platform — we'd resell their generative-AI product under our brand to enterprise customers. Expect derivative works, source-level customization, and we need IP assignment on customizations we pay for. They train their foundation model on a mix of licensed and open-source corpora; we need indemnity for IP-infringement claims arising from model output. Multi-year strategic deal, low eight figures. Includes hosted SaaS with 99.99% uptime SLA, audit rights, and benchmarking / MFN protection given the term.",

  // 4 — Pinnacle Industrial: hardware + on-site installation
  "Pinnacle Industrial will manufacture and install 47 specialized testing devices across our three US manufacturing plants. $2.1M total, 18-month phased delivery, time-is-of-the-essence on plant-2 install (Q3 production launch depends on it). Hardware includes embedded firmware. They'll have on-site contractors performing physical installation work. Need extended product warranty (3 yr), CGL insurance with us as additional insured ($5M), formal acceptance testing, delivery & title terms, and force-majeure language given recent supply-chain disruption.",

  // 5 — Aegis FedSec: federal contract, security & compliance
  "Subcontracting Aegis FedSec to deliver cybersecurity services for our GSA federal contract. FedRAMP Moderate baseline, CMMC Level 2, FAR/DFARS flow-downs apply. ~$890K, 24-month base + two option years. Must comply with Section 508 accessibility for any user-facing tooling. They'll handle CUI but not classified data. ITAR-adjacent — some components may be export-controlled. Public-sector regulatory flow-downs are non-negotiable.",

  // 6 — Helix Bio: clinical research + PHI
  "Engaging Helix Bio Research to run a phase-2 clinical study using patient PHI from our partner hospital network. HIPAA Business Associate Agreement required. ~$1.4M, 11-month study. They'll have access to protected health data and medical records. Data residency must remain US-based. We need indemnity for HIPAA breaches, audit rights, source-data verification, and tight termination-for-cause language tied to regulatory findings. No subcontracting without prior written consent.",

  // 7 — Velocity Logistics: cross-border supply chain
  "Velocity Logistics, a Singapore-headquartered freight forwarder, will manage our APAC + EU inbound shipments — about $6M annual logistics spend. International / cross-border. We need neutral governing law (probably Singapore or English law), binding arbitration under SIAC, force-majeure given recent supply-chain disruption, and OFAC / sanctions screening on counterparties. Just-in-time inventory model — delivery delays carry material business impact. ESG / Scope 3 emissions reporting required quarterly.",

  // 8 — Forge & Anvil: T&M custom build with scope creep risk
  "Forge & Anvil consultancy, time-and-materials engagement to build a custom data-pipeline platform. Hourly rates, NTE $750K over 9 months but scope is evolving — we expect change requests as the product team learns. Custom deliverables, formal acceptance testing required. Their engineers will need access to our production systems (read-only). Standard mutual NDA. They've used some open-source components (Apache 2.0, MIT) — we need an OSS disclosure schedule. Source code assigned to us; non-solicitation on their key engineers.",

  // 9 — Verdant Energy: ESG-heavy, long-term strategic
  "Verdant Energy as our renewable-power supplier — 12-year strategic agreement, $42M total contract value (low eight figures). Net-zero alignment is a board-level commitment; we need Scope 1/2/3 emissions reporting, conflict-minerals attestation, and responsible-sourcing audit rights. Multi-year, so written change orders for any scope evolution. Benchmarking / MFN protection given the term length. Includes a publicity clause — they want to use our logo as a reference customer.",
];

window.CATEGORIES = CATEGORIES;
window.CATEGORY_BY_LABEL = CATEGORY_BY_LABEL;
window.INITIAL_LEDGER = INITIAL_LEDGER;
window.KEYWORD_RULES = KEYWORD_RULES;
window.BASELINE_CATEGORIES = BASELINE_CATEGORIES;
window.SAMPLE_INTAKES = SAMPLE_INTAKES;
