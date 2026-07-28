# Clausewerk — New Capabilities Plan (2026-07-27) — text extraction of artifact 4a818f77

Covers: Input Module · Negotiation Module · Edit Quality Metrics · Customer Thresholds · EU AI Act Compliance

## 1. Scope
Covers five new capability areas from the 2026-07-27 session. Does not rebuild what exists: negotiation database, audit chain, draft provenance infrastructure, trust boundary are built. Product direction: Clausewerk is a responsible-AI tool — every place AI is used is known, documented, reviewed by a named person, measurably scrutinised.

## 2. What Is Already Built (claimed)
- Manifest API: POST /manifests/check and POST /runs — the input pipeline connects here
- Negotiation Database: rounds, positions, position movement, renewal logic — tables, policies, triggers built (migration 0011)
- Audit Chain: tamper-evident log covering every governed act; checkpointing built
- Unedited-Approval Rate: already instrumented; Legal owns it; threshold deliberately unset pending counsel
- Draft Provenance Fields: prompt, model, model version, source material stored on every draft
- Clause Origin Tracking: legal_authored / ai_drafted / vendor_derived / external — permanent, survives supersession
- Concession Record: what was given away, to whom, how far down the ladder — Library Builder's primary input
- Ladder Architecture: rungs standard→floor; below-floor always refused
- RLS and Role Model: requester sees own negotiations; Legal sees all; Auditor reads all; no endpoint grants needed in the negotiation tables — only the API

## 3. Work Packages
### WP-1 Input Module — AI Pipeline Connection (Small — days to few weeks; needs D-1)
AI interview pipeline (buyer interview → risk manifest) needs an authentication contract and a proven end-to-end path into POST /manifests/check and POST /runs (which already accept an `llm` source flag). Delivers: AI-conducted interview → manifest → complete assembly, buyer correctly attributed in the audit record; integration tested and documented.

### WP-2 Negotiation Core — API Layer (Medium — weeks to a couple of months; ready to start)
Endpoints over the negotiation tables: open negotiation, record each round, upload a received redline, move positions between states (open/held/conceded/escalated/settled). Escalation routes to Legal (first-class state in DB). Delivers: full exchange history, escalation, audit chain coverage, position-revival view live from round one. Note: the requester over-grant fix (open question 12) belongs in this migration.

### WP-3 Negotiation Round Analysis (Large — months; after WP-2)
Seven-step pipeline on redline upload. Parsing + ladder comparison deterministic; position identification, categorisation, risk assessment, advisory recommendation AI-assisted — each with a no-model fallback. Every step separately visible. Delivers: buyer sees what changed, which position it touches, ladder location, comparable-deal history, alternatives ranked to floor; advisory recommendation clearly labelled advice.

### WP-4 Supplier Paper (Large — months; after WP-3)
AI decomposes counterparty base documents into clause-like units — categorised, quarantined (never enter library or assembled contracts), each keeping a source-location reference. Unknown categories dropped at boundary. Then flows through the WP-3 pipeline. Repeatedly-seen supplier language becomes Library Builder input.

### WP-5 Clause Library Builder (Large — months; needs D-4 first; can run parallel to WP-3 once data model agreed)
AI drafts candidate clauses and ladder-position proposals from the concession record, coverage gaps, company rules. Drafts land in the Review queue as proposals. A named lawyer approves/edits/rejects. Unedited approval recorded separately from edited approval. Full draft provenance permanent, in audit chain. A draft may not be approved by its requester when the requester is not Legal. Prerequisite for WP-6.

### WP-6 Edit Quality Metrics and Customer Thresholds (Small–Medium — weeks; after WP-5, needs D-3)
At approval, compute similarity between original AI text and approved text; store permanently on the clause version record. Metric: average % of original AI language retained — library-wide, by category, per contract. Paired with unedited-approval rate. Customer-configurable thresholds as governance settings — one owner decision (Legal Admin), one operational (Administrator).

### WP-7 EU AI Act Compliance Scaffolding (Medium then ongoing; after WP-5, WP-6, and D-2)
Extend draft record with EU documentation fields: intended purpose, known limitations at time of use, model performance metrics. Build machine-readable compliance export (every AI use instance, reviewer, changes, oversight evidence). Customer-configurable disclosure in the review interface. Build to high-risk standard regardless of classification.

## 4. Sequence
- Phase 1 (now, parallel): WP-1, WP-2, D-4 design session
- Phase 2: WP-3, WP-5
- Phase 3: WP-4, WP-6
- Phase 4: WP-7 (then ongoing through 2026–2027)

## 5. Decisions Required (blocking)
- D-1 AI pipeline identity — buyer or system account named in the record? Rec: pipeline signs in as the buyer. Blocks WP-1.
- D-2 EU AI Act risk classification — counsel's read; build to high-risk regardless. Blocks WP-7.
- D-3 Metric threshold defaults — rec: conservative defaults (flag >20% unedited, >80% retention), no alarms until customer sets. Blocks WP-6.
- D-4 Draft data model — one design session across WP-5/6/7 before any coding; superset schema; draft records append-only once created. Blocks WP-5, WP-6, WP-7.

## 6. Adjacent Known Gaps
- Five requester over-grant screens: five views let requesters see other requesters' rows; fix belongs in the negotiation migration (open question 12). Resolve inside WP-2.
- Six missing governance endpoints: activate/retire/supersede clause, edit conflict rule, promote concession, reorder rung, release legal hold, retention destruction — in DB, no API. Supersession + concession promotion needed before Library Builder useful. Resolve in or before WP-5.
- Administrator run screen access: DB read exists, no screen grants; owner decision needed (open question 11). Flag for next governance review.
- Two unaudited writes: opening a deal and adding a category don't write to the audit log. Small fix; any time in Phase 1 alongside WP-2.

Footer: Based on NEGOTIATION-ARCHITECTURE.md, ADR-0010, migration 0011, and session discussion. All content is placeholder pending review.
