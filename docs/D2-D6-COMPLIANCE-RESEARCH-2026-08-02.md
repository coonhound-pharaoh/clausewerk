# D-2 / D-6 Compliance Research — EU AI Act classification and the erasure-vs-audit question

**Date:** 2026-08-02
**Prepared for:** Mike and outside counsel
**Status:** RESEARCH MEMO — this is background research to inform a conversation with
counsel. It is **not legal advice** and decides nothing. Every conclusion below is a
"likely" that counsel should confirm or correct. Where the memo says "we," it means
Clausewerk as the company building and offering the system.

**What this gates:** NC-12 (the EU documentation audit payload), NC-14 (telling users
when AI is involved), NC-15 (the compliance export).

---

## 1. Executive summary — the bottom line in plain words

**D-2: How does the EU AI Act classify this system?**

> **Likely answer: not high-risk.** The high-risk list is a closed list of specific
> uses — hiring, credit, policing, courts, and so on. A business tool that helps a
> company assemble its own purchasing contracts from lawyer-approved building blocks
> is not on that list. The one category that sounds close ("administration of
> justice") covers AI used **by courts and judges**, not by companies negotiating
> with suppliers. Our system would sit in the **limited-risk** tier, where the main
> duty is honesty: tell people when they are talking to an AI and keep our staff
> reasonably informed about what the AI does.
>
> **Timing note — important and current.** The heavy high-risk obligations were due
> to start **today, 2 August 2026**. They did not. The EU's "Digital Omnibus"
> package, finalised in June–July 2026, pushed the high-risk deadlines out to
> **2 December 2027** (and August 2028 for AI built into regulated products). What
> **did** start today is the transparency rule (Article 50) — the "tell people it's
> AI" duty — and that one applies to us regardless of risk tier. So NC-14 (AI
> disclosure) is not optional and is timely **now**; NC-12 (documentation payload)
> is cheap insurance rather than a current legal requirement, and worth keeping.

**D-6: May the AI-use audit record survive a GDPR erasure request?**

> **Likely answer: yes — retention is defensible, on two grounds.** GDPR's right to
> erasure has built-in exceptions: records may be kept when the law requires keeping
> them (Art. 17(3)(b)) and when they may be needed to defend legal claims
> (Art. 17(3)(e)). An audit trail showing *which model suggested what and which named
> person approved it* is close to a textbook case of the second exception — it is the
> evidence we would need if a contract or an approval were ever challenged, and
> contract claims can be brought for years. The AI Act itself points the same
> direction: it **requires** deployers of high-risk AI to keep logs (six months
> minimum, longer where other law says so), so the two regimes support each other
> rather than collide. The honest caveats: (1) if we are *not* high-risk, the AI
> Act's logging duty does not formally bind us, so the "legal obligation" ground
> leans more on general commercial record-keeping law and the "legal claims" ground
> does the real work; (2) the exception covers keeping what is **necessary** — so
> the audit record should carry as little personal data as it can (a reviewer's
> role and ID rather than more), and we need a written retention period with a
> reason, not "forever by default." NC-15's compliance export should state, for each
> surviving record, *why* it survives.

---

## 2. D-2 — Classification under the EU AI Act

### 2.1 What the Act actually is, in one paragraph

The AI Act sorts AI uses into four tiers: **prohibited** (e.g. social scoring),
**high-risk** (a closed list in Annex III — hiring, credit, essential services,
policing, courts, plus AI inside regulated products), **limited risk** (systems that
interact with people or generate content — duty is transparency), and **minimal risk**
(everything else — no duties). The tier is decided by the system's **intended
purpose**, not by how clever the technology is. Obligations differ for the
**provider** (who builds and offers the system — that is us) and the **deployer**
(the customer company using it — also us, for our own internal use of AI features).

### 2.2 Where the deadlines actually stand (verified 2026-08-02)

- Act entered into force August 2024; prohibitions and the **AI literacy** duty
  (Art. 4) have applied since **2 February 2025**.
- General-purpose AI model obligations (these fall on model makers like the AI labs,
  not on us as a tool builder) applied from August 2025.
- **The Digital Omnibus on AI** — proposed by the Commission 19 November 2025,
  approved by Parliament 16 June 2026, final Council green light 29 June 2026 —
  **deferred the high-risk obligations**: stand-alone Annex III systems to
  **2 December 2027**, AI embedded in regulated products (Annex I) to
  **2 August 2028**. It also softened Art. 4 to "support the development of AI
  literacy among staff," and left Article 50 essentially untouched.
- **Article 50 transparency duties became enforceable today, 2 August 2026** (with a
  grace period to 2 December 2026 only for machine-readable content-marking on
  systems already on the market).

Counsel should confirm the Official Journal citation for the final Omnibus text —
our sources report signature on 8 July 2026 and publication "shortly after" the
Council vote; the consolidated article numbers in force should be checked against
the published text, not against summaries.

### 2.3 Is any part of Clausewerk high-risk? Walking the list

Annex III is exhaustive — a system is high-risk only if its intended purpose matches
a listed use. Taking each AI involvement in the product:

| AI involvement | What it does | Nearest Annex III category | Likely fit? |
|---|---|---|---|
| Intake interview | Classifies a user's request into a structured manifest | None — internal workflow triage | No |
| Redline matcher | Matches a counterparty's edits to known clauses; keyword fallback exists | None | No |
| Advisory risk judgments | Suggests `{category, severity, justification}`; human decides | None | No |
| Clause Library Builder (ADR-0010) | Drafts *candidate* clauses; only a named lawyer can approve one into the library | "Administration of justice" (point 8(a)) is the only one that even sounds close | No — see below |

**Why "administration of justice" does not fit.** Annex III point 8(a) covers AI
intended to be used **by or on behalf of a judicial authority** to assist judges in
researching and interpreting facts and law. Commission draft guidance and
commentary consistently read this as court-facing. A private company assembling its
own procurement contracts is not a judicial authority, and nothing in the system is
intended for one. Legal-industry analyses of the Act reach the same view for
contract-management tools generally: document assembly, contract analysis and
review-support tools are not on the list.

**The backstop even if a category were argued.** Article 6(3) carves out systems
that, despite touching a listed area, perform a **narrow procedural or preparatory
task** or **do not materially influence the outcome of decision-making** because a
human decides. Clausewerk's architecture is unusually strong here, and verifiably
so: the model never authors contract language that reaches a document (ADR-0001,
asserted by test on every build); AI-drafted candidates enter the library only
through a named lawyer's approval (ADR-0010); every AI involvement is recorded;
deterministic fallbacks exist for every AI path. If counsel ever needs to argue the
carve-out, the evidence is already in the audit trail. Note: a provider relying on
Art. 6(3) must **document that assessment** — which is precisely the kind of thing
NC-12's audit payload should contain.

**Likely conclusion: limited risk** (because the system interacts with people and
some content is AI-generated), with most components arguably minimal risk.

### 2.4 What duties follow at limited risk — the ones that apply NOW

1. **Article 50(1) — tell people they are dealing with AI.** Anyone interacting
   with an AI system must be informed, unless it is obvious. The **intake
   interview** is the clearest case: the screen should say plainly that an AI is
   conducting the interview. The redline matcher and risk advisor surface AI output
   to Legal reviewers; a visible "this suggestion came from a model" label satisfies
   the same principle. **This is NC-14, and it is due now.** For a B2B tool used by
   professionals who know the feature is AI, the burden is light — but the label
   should exist and be checkable.

2. **Article 50(2) — mark AI-generated content.** Providers of systems generating
   synthetic text must mark outputs machine-readably, with an exception where the
   content **undergoes human review and a person holds editorial responsibility**.
   AI-drafted clause candidates go through exactly that gate — and the system
   already records `origin: ai_drafted` permanently on every clause, which is a
   stronger mark than the law asks for. Counsel to confirm the human-review
   exception covers the candidate-drafting path; our read is that it does, and that
   the existing origin field is the compliant mechanism either way.

3. **Article 4 — AI literacy (since Feb 2025, softened by the Omnibus).** Companies
   providing or using AI must support staff AI literacy — as amended, "support the
   development of" it. In practice: short written guidance for reviewers on what
   the model does and does not do (e.g. "the matcher points, it does not decide;
   scores are advisory"), kept where training records live. Applies to us and to
   deploying customers; a one-page insert in the product documentation discharges
   most of it and helps customers discharge theirs.

4. **What we do NOT currently owe:** the high-risk apparatus — conformity
   assessment, CE marking, registration in the EU database, Annex IV technical
   documentation, Art. 9 risk-management system, Art. 12 automatic logging as a
   *legal mandate*, post-market monitoring. If classification changed (a new
   feature, an Annex III amendment, or a customer using the system in a listed
   context), these arrive on the December 2027 clock.

### 2.5 What this means for the gated features

- **NC-14 (AI disclosure): build it, now.** Article 50 is in force today and it is
  the one duty that clearly applies. It is also cheap — labels on the intake
  interview and on AI suggestions.
- **NC-12 (EU documentation audit payload): build it as insurance, not obligation.**
  Nothing currently *requires* an Annex IV-style dossier from a limited-risk
  provider. But the payload is nearly free given what the system already records,
  it is the natural home for the Art. 6(3) "why we are not high-risk" assessment,
  and it becomes mandatory overnight if classification ever changes. Frame it
  internally as "the file counsel opens when a customer's procurement team asks
  about the AI Act" — that question will be asked regardless of our tier.

### 2.6 Questions for counsel to confirm (D-2)

1. Confirm no Annex III category applies, as finally amended by the Digital Omnibus
   (the Omnibus also touched Annex III scoping — check the published text).
2. Confirm our provider/deployer split: we are the provider; customers are
   deployers; and confirm nothing in how we host or operate the system makes us a
   deployer of it for customers' purposes.
3. Confirm the Art. 50(2) human-review exception covers the clause-candidate path,
   and what the intake-interview disclosure must literally look like to satisfy
   Art. 50(1).
4. Should we record a formal Art. 6(3)-style self-assessment now, even though not
   required at limited risk, so the position is dated and evidenced?
5. Any national-law overlays in target markets (member states may add rules), and
   whether the UK/US positions need a parallel note.

---

## 3. D-6 — The erasure-vs-audit-retention tension

### 3.1 The tension, stated plainly

The system keeps a permanent, tamper-evident (hash-chained) record of every AI
involvement: which model ran, what it suggested, whether a named human accepted it.
When someone exercises the GDPR right to erasure, the system deletes signed-contract
records — but the AI-use audit record **survives**, and it can name a person (most
often the reviewing lawyer; conceivably a counterparty signatory or requester).
The open-questions file already flags this honestly (U12 residual: "a purge is not
erasure of every trace... a right-to-erasure request naming a person would have to
be discussed on its own terms"). This section is that discussion.

The right to erasure (GDPR Art. 17) is **not absolute**. Paragraph 17(3) lists
exceptions; two matter here:

- **17(3)(b)** — processing is necessary to comply with a **legal obligation** under
  EU or member-state law that requires keeping the record.
- **17(3)(e)** — processing is necessary for the **establishment, exercise or
  defence of legal claims**.

### 3.2 Ground one: legal obligation (17(3)(b)) — real, but read the fine print

The AI Act itself imposes record-keeping: Art. 12 (high-risk systems must log
automatically), Art. 19 (providers keep those logs, minimum six months), and
Art. 26(6) (**deployers** keep the logs under their control for **at least six
months**, "unless provided otherwise in applicable Union or national law"). Two
observations:

- **Direction of force: the AI Act supports retention, it does not oppose it.** Its
  six-month figure is a **floor**, not a ceiling — the text explicitly defers to
  longer periods required elsewhere. Commentary on the interplay (IAPP and others)
  treats the reconciliation as: keep what the log duty and other law require, apply
  GDPR minimization *within* the log, and answer erasure requests by citing the
  retention ground rather than deleting evidence.
- **The honest caveat:** if Clausewerk is limited-risk (Section 2), Arts. 12/19/26
  do not formally bind anyone here — a legal-obligation argument built *only* on
  the AI Act would be built on duties we successfully argued out of. The sturdier
  legal-obligation sources are ordinary ones: national commercial and tax codes
  requiring business records (commonly 6–10 years for contract-related records in
  EU member states), and any sector rules a customer is under. Counsel should name
  the specific statutes per target market.

### 3.3 Ground two: legal claims (17(3)(e)) — likely the load-bearing one

This is the natural home for the AI-use record. Its whole purpose is to answer,
years later, "who approved this and on what basis?" — the question asked when a
contract is disputed, an approval is challenged, or a regulator investigates. That
is the defence of legal claims, and the relevant horizon is the **limitation
period** for contract claims in the governing jurisdictions (typically 3–10 years,
sometimes longer from discovery). The exception does not require an active dispute;
it covers records reasonably necessary in case of one. European regulators'
guidance on erasure consistently accepts retention of accountability and audit
records on this ground, provided the retention is scoped and reasoned.

A supporting note on **whose** data this is: the person most often named in the
surviving record is the **reviewer — an employee doing their job**. Recording which
professional approved which decision is a proportionate, expected processing of
employee data (legitimate interest, Art. 6(1)(f), plus the accountability principle
itself). An erasure request from a departed reviewer asking to be scrubbed from
approval records they authored is close to the textbook case the 17(3)(e) exception
exists for — deleting it would destroy the company's evidence of its own controls.

### 3.4 Recommended retention posture (for counsel to confirm)

1. **Keep the AI-use audit record through erasure; say why on the record.** When an
   erasure request is executed, the response (and the audit chain itself) should
   note that specified records were retained under Art. 17(3)(b)/(e) with a
   one-line reason. A cited exception is a defensible position; a silent survival
   looks like non-compliance.
2. **Minimize personal data inside the record.** The exceptions cover what is
   *necessary*. The audit record needs the approver's identity — but an internal
   user ID plus role, resolvable through access-controlled account records, carries
   less exposure than free-text names, and free-text fields (justifications,
   comments) should be kept clean of third-party personal data by design. Where a
   record references a data subject who *is* erased elsewhere, consider storing a
   hash or ID rather than the name — the hash-chain pattern the system already uses
   is exactly the technique privacy commentary recommends for this.
3. **Set a written retention period, not "permanent."** "Hash-chained and
   append-only" describes tamper evidence, not a lawful retention duration. GDPR's
   storage-limitation principle wants an endpoint with a reason. A defensible
   schedule: life of the agreement + the longest applicable limitation period +
   margin (counsel to set the number, per jurisdiction). "Permanent" is only
   defensible if counsel says the claims horizon effectively is.
4. **Sort out roles with customers.** For customer deployments, the customer is
   likely the **controller** of the personal data in their contracts and we the
   **processor** — meaning erasure requests land on *them* and our contracts (DPA)
   must state what the system deletes, what survives, and on what ground, so the
   customer can answer data subjects accurately. This belongs in the standard DPA
   language, not in per-request improvisation.
5. **NC-15 (compliance export) is the delivery vehicle.** The export should carry,
   per record class: what is retained, the legal ground, the retention clock, and
   the erasure events executed against related records. That turns this memo's
   position into something an auditor or a customer's DPO can verify.

### 3.5 Questions for counsel to confirm (D-6)

1. Confirm 17(3)(e) as the primary ground for the surviving AI-use record, with
   17(3)(b) (national commercial-record law — name the statutes) and 6(1)(f) as
   support; confirm the retention formula and per-jurisdiction periods.
2. Reviewer names: may they persist for the full retention period, or should they
   be pseudonymized (ID-only) after some interval or after the reviewer departs?
3. Controller/processor allocation for hosted deployments, and the DPA language
   describing what survives erasure and why.
4. Whether the hash-chain design needs a formal position paper: erasure of a
   record's *content* while its *hash* persists is generally viewed as compatible
   with erasure (a hash of deleted content identifies no one), but we want that
   stated by counsel, not assumed by engineering.
5. Whether anything in the finally-published Digital Omnibus (which also amended
   some GDPR-adjacent provisions) touches this analysis.

---

## 4. Sources

Primary law and official:

- Regulation (EU) 2024/1689 (the AI Act), EUR-Lex — Articles 4, 6(3), 12, 19,
  26(6), 50; Annex III. (Consolidated text as amended by the Digital Omnibus to be
  checked in the Official Journal.)
- GDPR (Regulation (EU) 2016/679) — Articles 5(1)(e), 6(1)(f), 17, 17(3)(b),
  17(3)(e). Text via [gdpr-info.eu](https://gdpr-info.eu/art-17-gdpr/).
- [EU AI Act Service Desk (European Commission) — Article 26](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-26). Accessed 2026-08-02.
- [Annex III, artificialintelligenceact.eu (Future of Life Institute explorer)](https://artificialintelligenceact.eu/annex/3/). Accessed 2026-08-02.

Digital Omnibus status (all accessed 2026-08-02):

- [Gibson Dunn — "EU AI Act Omnibus Agreement: Postponed High-Risk Deadlines and Other Key Changes"](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/) (27 May 2026): Annex III → 2 Dec 2027, Annex I → 2 Aug 2028; Art. 50 unchanged with watermarking grace to 2 Dec 2026; Art. 4 softened.
- [DLA Piper — "The Digital AI Omnibus: Proposed deferral of high-risk AI obligations (update)"](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/The-Digital-AI-Omnibus-Proposed-deferral-of-high-risk-AI-obligations-under-the-AI-Act): Parliament endorsement 16 June 2026; Council final green light 29 June 2026; OJ publication to follow.
- [Technology.org — "EU AI Act: What Actually Applies on 2 August 2026"](https://www.technology.org/2026/07/17/eu-ai-act-what-actually-applies-on-2-august-2026/) (17 July 2026).
- [Holland & Knight — "U.S. Companies Face EU AI Act's Possible August 2026 Compliance Deadline"](https://www.hklaw.com/en/insights/publications/2026/04/us-companies-face-eu-ai-acts-possible-august-2026-compliance-deadline) (April 2026).

Classification commentary (accessed 2026-08-02):

- [Bird & Bird — "The Commission's Draft High-Risk AI Guidelines under the EU AI Act: A First Read"](https://www.twobirds.com/en/insights/2026/the-commission's-draft-high-risk-ai-guidelines-under-the-eu-ai-act-a-first-read).
- [Modulos — "EU AI Act Annex III Draft Guidelines: What Changed"](https://www.modulos.ai/blog/eu-ai-act-annex-iii-draft-guidelines-what-changed/).
- [CobbleStone — "EU AI Act: Why Contract Management Software Is Safely Low Risk"](https://www.cobblestonesoftware.com/blog/eu-ai-act-contract-management-software-low-risk) (vendor perspective — weight accordingly).

GDPR/AI Act interplay (accessed 2026-08-02):

- [IAPP — "EU AI Act: Mapping the Interplays with the GDPR"](https://iapp.org/resources/article/mapping-interplays-gdpr-eu-ai-act).
- [TechGDPR — "AI Data Retention Strategy for GDPR & EU AI Act Compliance"](https://techgdpr.com/blog/reconciling-the-regulatory-clock/) (pseudonymization/hashing techniques for logs).
- [Legalithm — "EU AI Act Log Retention: The 6-Month Rule (In Practice)"](https://www.legalithm.com/en/blog/eu-ai-act-log-retention-record-keeping-6-months).

Repository grounding: `docs/decisions/ADR-0001-model-never-authors-contract-language.md`,
`docs/decisions/ADR-0010-ai-drafted-clause-candidates.md`, `docs/open-questions.md`
(U12 residual on purge vs. erasure).

*Again: research to inform counsel, not legal advice.*
