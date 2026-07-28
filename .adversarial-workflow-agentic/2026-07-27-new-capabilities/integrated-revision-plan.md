# Integrated Revision Plan — New Capabilities Plan — 2026-07-27 (Gate 2)

Three independent Opus 5 planners (database, sequencing, AI/compliance lenses) + three red-team reviewers (evidence, scope, usability). Every adoption below survived at least one adversarial check; disagreements adjudicated at source.

## Adopted (Observed, red-team CONFIRMED)
1. **§2 split built vs in-flight.** POST /runs, GET /runs/contract, POST /agreements/execute are uncommitted, untracked assembly-connection work (git status; runs.py NEW under that set). WP-1 moves Phase 1 → Phase 2, gated on "the connection work already approved and underway" (never print its WP-00x IDs — usability ruling).
2. **Negotiation write hole (biggest addition).** 0011:356-385 — all four negotiation tables' INSERT policies check role only; reads check ownership. Any requester can write against any deal. WP-2's migration must close writes AND reads; WP-2 grows. Same defect class 0025 closed for runs. Plain-language phrasing per usability lens; citations in footer.
3. **§2 RLS bullet corrected** — tables fenced per person, five views over them are not (= §6 gap). Contradiction removed.
4. **Delete "two unaudited writes" gap** — closed by 0020 triggers. Deletion announced, not silent.
5. **Six governance endpoints: split two-and-four.** U9 (retention destruction) and U10 (supersession) decided, endpoint-only; four still need an owner. (Red team REFUTED "three of six" — U13 is the hold FLAG question, not hold release.) New blocking decision D-5: are the six in scope for this effort? WP-5 not much use without supersession + concession promotion.
6. **D-3 demoted, numbers deleted.** U4 (0012:295-305) settled "deliberately unset; the system must never choose this number." Recommending 20%/80% defaults breached the product boundary and reopened a settled decision. WP-6 unblocked.
7. **D-1 mostly answered.** Attribution is structural (connection actor; ADR-0011 refuses shared machine accounts); manifest_source records llm/fallback/manual. "Buyer" is not an actor — counterparty vs requester vocabulary corrected once, plainly. Genuinely open residue: how the pipeline holds a person's credential once an identity provider is connected (identity.py: sign-in proves nothing today by design). D-1 becomes a disclosure + narrow open question; no longer blocks WP-1.
8. **WP-6 unhooked from WP-5.** Review queue (0008) already stores the frozen AI baseline, prompt/model/version, derives edited_before_approval server-side; cw.review_quality exists. WP-6 needs D-4 only. Rule stated: the similarity figure is computed by the database at approval, never supplied by the caller. Cheapest package moves earlier.
9. **WP-7 re-scoped.** Depends on D-2 + D-4 (WP-5/6 adjacency a preference). Only three genuinely new fields. NEW owner question surfaced: the compliance export ("every AI use") meets the deletion promises (0023 redaction/purge; hash-chained audit survives) — which promise wins is Mike's decision.
10. **D-4 reframed** — extending the existing draft record (0008), not greenfield; smaller session, still before any migration touching the draft record.
11. **Renewal baseline** — U1 is UNSETTLED (0010:57-62 decided=false; red team refuted "settled"). Plan says: default is pre-selected and visible, decision still Mike's; WP-2 must not settle it by accident.
12. **Migration numbering** — state the rule (claim next free number verified on disk at package start; 0024/0025 untracked today), never a number. One line inside WP-2.
13. **Bytes-in dependency** — VERIFIED by orchestrator (server.py:147-168: JSON-only bodies, 1MB cap; assembly set builds bytes-out only and excludes do_POST/MAX_BODY). WP-2's redline upload and WP-4's supplier paper need a receive-a-document capability nobody owns. Named inside WP-2/WP-4 as an unowned dependency, plain words, no "transport seam" jargon.
14. **WP-4 note, not split** — decomposition half can begin alongside WP-3 (Inferred); expressed as a sentence inside WP-4, no 4a/4b IDs (contract forbids restructuring).
15. **Admin run screens** — add: fix is one line, withheld on purpose, decision is Mike's.
16. **Five views, two homes** (three in 0011, two in 0010) — engineering routing detail inside WP-2 body; §6 stays plain.
17. **Collision rule** — two plain sentences in §4: nothing in this plan touches the handful of files the connection work is editing until it finishes; file list in footer.
18. **Footer** — verified evidence list added.

## Rejected / downgraded
- Five-phase restructure with assembly WP-00x IDs printed (REFUTED — restructuring + two numbering schemes).
- New packages (bytes-in package, governance-endpoints package, WP-4a/4b) — rendered as dependencies/notes inside existing WPs.
- Migration numbers in §2 bullets inline (usability) → footer.
- "0026" printed as the next number (repeats the mistake the rule prevents).
- "/api prefix is an error" (WEAK — both spellings true at different layers; plan avoids freezing spelling).
- "Similarity metric on clause_version fights a trigger" (downgraded to provenance-fit caution, one line).

Blocking decisions after revision: D-2 (EU classification → WP-7), D-4 (draft-record fields → WP-5/6/7 migrations), D-5 new (governance endpoints in scope? → WP-5), plus the new WP-7 export-vs-deletion owner question folded into D-2/WP-7 framing. D-1 and D-3 demoted with their history shown.
