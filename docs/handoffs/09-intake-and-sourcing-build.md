# Handoff · The intake and sourcing build, 2026-08-04

**Read this first if you are arriving cold.** It supersedes
[`08-disposal-screens-and-the-python-move.md`](08-disposal-screens-and-the-python-move.md) as the
current state of play; 08 remains the right place for the Python-move history and its traps, and
[`07-role-based-ui.md`](07-role-based-ui.md) for the UI-package history. Unlike 08's opening
warning, **the tree is clean and everything is pushed** as of this writing (`main @ b1ecddf`) —
but another agent session has worked this machine before and may again, so run `git status` and
`git log --oneline -5` before you touch anything, and never commit files you didn't change.

---

## 0. Ground rules — binding, repeated on purpose

**The owner is Mike.** [`CLAUDE.md`](../../CLAUDE.md) auto-loads; obey it. The ones most easily
broken:

- **Always plain business language to Mike, never developer jargon.** He is an executive and a
  career procurement negotiator, not an engineer.
- Prefer simple, concise solutions. Completed written plans move to `_archive` marked
  COMPLETE_ARCHIVED.
- Record important decisions in [`memory.md`](../../memory.md) in plain language, as numbered
  `S###` session records. Engineering detail goes in `docs/decisions/` or the migration.
- **Content is placeholder** (2026-07-27): clause wording, probe questions, section text — all
  synthetic until Legal review, never a defect, and **never tested**. A test checks what the
  system *does*, never the words.
- **The verification culture is the product.** Every guarantee gets a mutation that deliberately
  breaks it and asserts the *named* test notices. Touched `backend/db/migrations/`? Run
  `node backend/db/test/mutation-check.mjs` before committing.
- When Mike must decide something, put numbered options to him — he answers by number (this
  session used the interactive question tool successfully; prose lists of decisions confused him).
- Do not trust any test/migration count written in a document, including this one. Run
  `cd backend && npm run verify` and read what it says.

**Business context that shapes technical choices:** Clausewerk is Mike's long-term business.
The next milestone that matters commercially is a **design-partner demo** — the full pipeline,
in one sitting, in front of a procurement director from his network. Everything below serves that.

---

## 1. Where the product actually stands

- **Backend deterministic core: built and verified.** Clause registry, ladders + concessions,
  resolution and validation engines, run store, frozen executed agreements, document service
  (.docx emit + tracked-change parse). Migrations through at least `0023`. `cd backend && npm run
  verify` is the bar.
- **The doorway (Python, in-process) is the service layer.** `backend/doorway/` — identity,
  sessions (hashed keys), manifests, executions, redlines, paper, notifications, obligations.
  The six governed Legal-admin acts and the obligations screens landed 2026-08-02 (S222), proven
  end-to-end over HTTP by `doorway/acceptance_walkthrough.py`, which is kept and re-runnable.
- **The model seam exists and is settled:** `doorway/advisory.py` — the ONE place the product asks
  a model a question. Provider-thin, plain HTTPS, no SDK, key from the environment. Do not add a
  second seam and do not introduce an SDK.
- **The front half is designed, not built:**
  [`AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md`](../../AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md) —
  intake interview, classifier, redline matcher, U14e drafting. Its work packages AI-1…AI-7 are
  the spec for the first half of your queue.
- **Sourcing documents are newly in scope:**
  [`SOURCING-DOCS-PROPOSAL-2026-08-04.md`](../../SOURCING-DOCS-PROPOSAL-2026-08-04.md) — RFP or
  RFQ, selectable, from the same intake manifest; packages SRC-1…SRC-4.

## 2. The decisions that constrain you — all MADE 2026-08-04 (S224, S225)

1. **Provider: OpenAI stays**, on the existing `advisory.py` seam. Revisit at launch, not now.
2. **Budget: 200 calls/day, 4,000 tokens/call** — an administrator-changeable operational setting,
   never a constant buried in code.
3. **Sequencing: intake first.** AI-1 → AI-2 → AI-3. The matcher's deterministic half (AI-4) may
   proceed in parallel if convenient, but intake is the priority.
4. **Contracts vs sourcing documents carry DIFFERENT language rules, deliberately.**
   - Contracts: unchanged — the strict, provable **zero AI-authored characters** guarantee.
   - RFP/RFQ: **looser by owner design.** Mike, verbatim: "The AI will be responsible for
     authoring of customized questions and/or deliverables. MOST of the document can be
     deterministically generated but not all of it." The skeleton assembles deterministically from
     an approved section library; the AI may author engagement-specific supplier questions and
     deliverable descriptions directly into the document; **every AI-authored span is recorded as
     such** — the provenance count is computed and kept, it is simply not required to be zero for
     this document class. Do not let this carve-out leak into the contract path in either
     direction.
5. **Terms preview ships in version one** (SRC-4): the draft contract clause set rides with the
   RFP/RFQ. This is the differentiator; treat it as core, not garnish.
6. **The demo gate is the FULL pipeline:** intake → RFP/RFQ (terms attached) → contract. The demo
   is not "done" at intake→contract.

Still open, owner-side, not yours to decide: the ADR-0010 provenance-footer publication question,
vector search (D-7/NC-24), and all clause/probe/section *content*.

## 3. The build queue, in order

| # | Package | What it is | Gate |
|---|---|---|---|
| AI-1 | Deterministic intake | Probe walk → manifest; keyword classifier. Pure engineering, no key, no decision. | none — **start here** |
| AI-2 | Intake screens | Requester workspace + the NC-14 AI-disclosure label. | AI-1 |
| AI-3 | Model intake | Conversation → proposed manifest → human confirm, via `advisory.py`, OpenAI, the decided budget. | AI-1 |
| SRC-1 | Sourcing section library | Placeholder content + the RFP/RFQ type taxonomy. | none |
| SRC-2 | Sourcing forge | Manifest + type → `rfp.docx` / `rfq.docx` + dossier, deterministic skeleton + recorded AI spans per decision 4. | SRC-1, AI-1 |
| SRC-3 | Intake event-type question | RFP / RFQ / no-sourcing-event, selectable. | AI-2 |
| SRC-4 | Terms preview | Attach the draft clause set to the sourcing package. | SRC-2 |
| AI-7 | Cost/rate settings + prompt ledger | Budget as an operational setting; every AI involvement recorded (NC-15 shape). | first model pkg |

AI-4/AI-5 (matcher) and AI-6 (U14e drafting) follow after the demo gate unless idle time appears.

## 4. Traps — the ones that cost hours

- **`localhost` costs two minutes per database connection on this machine** (S223): psycopg tries
  IPv6 `::1` first against the Docker proxy and stalls. **Always `127.0.0.1`** in
  `CW_DATABASE_URL` / `CW_OWNER_DATABASE_URL` / `CW_TEST_OWNER_URL`. If anything doorway-side
  hangs ~30 s per operation, check the host in the URL before anything else.
- **Another agent (Codex) works this machine.** It has committed shared files like `memory.md`
  with its own work, and in the Lawn Ledger repo it reverted *uncommitted* tracked-file edits
  mid-session (2026-08-04). Defenses: commit small and often, path-scope every `git add`, check
  `git status` before staging, prefer new files over edits to hot files.
- **`gh` CLI is not installed.** Plain `git` pushes fine (GCM-cached HTTPS). Multi-line commit
  messages via Bash heredoc, not PowerShell here-strings.
- **Never fabricate dates or content in code** — a missing approval date is `provenanceGap`, not
  an invented default. Same instinct applies to anything Legal owns.
- **No new services.** S119 declined microservices; the AI layer is part of the doorway,
  in-process. No vector databases, no embedding index (that is D-7, undecided, Mike's).
- The mutation-harness rule from §0 — both harnesses have gone silently red before when guarded
  code was reworded without repointing the checks.

## 5. Where to start, concretely

1. `git status` · `git log --oneline -5` · `cd backend && npm run verify` — establish the bar is
   green before you write a line.
2. Read `AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md` end to end — it is the spec for AI-1/AI-2/AI-3
   and already contains the probe-walk and classifier design; do not redesign what it settled.
3. Build **AI-1** behind the existing doorway patterns (`manifests.py` is the landing zone for the
   produced manifest; `acceptance_walkthrough.py` shows the house style for proving a path over
   HTTP). Placeholder probe content, synthetic.
4. Record what you finish in `memory.md` as the next `S###`, plain language, and update this
   file's successor when the state of play changes materially.

## 6. Read next

- [`AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md`](../../AI-FRONT-HALF-ARCHITECTURE-2026-08-02.md) —
  your spec.
- [`SOURCING-DOCS-PROPOSAL-2026-08-04.md`](../../SOURCING-DOCS-PROPOSAL-2026-08-04.md) — the
  sourcing scope and the verbatim decision 4.
- [`memory.md`](../../memory.md) S218–S225 — how the last two weeks actually went.
- [`08-disposal-screens-and-the-python-move.md`](08-disposal-screens-and-the-python-move.md) §6 —
  the older traps, still live.
