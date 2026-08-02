# The intelligent front half — architecture and plan (WS-2)

*Commissioned by Mike 2026-08-02 (memory.md S218). This is the design WS-2 said
must exist before a revision plan. It proposes; the three decisions at the end
are Mike's and are deliberately not made here.*

## What this covers, in one paragraph

Four capabilities, all at the front of the pipeline: the **intake interview**
(a requester describes a deal in plain words and the system asks the right
follow-up questions), the **classifier** (that conversation becomes a
structured manifest the engine can check), the **redline matcher** (a
counterparty's edit is matched to the library clause it is really about, with
the pre-approved retreat path beside it), and **mid-negotiation drafting
support** (the owner addition U14e — a model proposes candidate wording *into
the review queue*, never into a contract). Everything else the product does is
already built and governed; this is the part that makes it pleasant to walk
in the front door.

## The rules every part of this obeys — all already settled, none new

1. **The model never authors contract language that reaches a document**
   (ADR-0001). Model-drafted wording exists only as a *candidate* that enters
   the library through the review queue under a named human approver, marked
   `ai_drafted` in origin (ADR-0010, built in 0008/0009).
2. **The deterministic fallback is written before the AI path, for every
   capability** (ADR-0005, restated by WS-2). The product works fully, if less
   pleasantly, with no AI key configured and no provider reachable.
3. **Every AI involvement is recorded** — which model, which prompt version,
   what it proposed, whether a human accepted it. This is the record the
   compliance export (NC-15) will carry and the D-6 research memo's retention
   posture applies to (IDs over names inside the record).
4. **The AI layer is part of the doorway, not a new service.** S119 declined
   microservices; the seam below already proves the shape works in-process.

## What already exists to build on — this is smaller than WS-2 feared

- **The model seam is built and settled.** `doorway/advisory.py` (NC-25) is
  the one place the product asks a model a question: provider-thin, plain
  HTTPS, no SDK, the key from the environment (settled D-8), a bounded number
  of concurrent calls, and an *absent judgment recorded with its reason* when
  the provider is unreachable — the caller is never blocked. Every new AI
  capability extends this pattern; none invents its own integration.
- **The manifest has somewhere to go.** `POST /manifests/check` is the
  pre-flight the intake classifier feeds; runs, gating and provenance are
  built end to end (WS-1 closed).
- **The retreat-path machinery the matcher needs is live.**
  `analysis.py` already ranks a matched position against its ladder
  (`_rank`, NC-06), and the drift and round records (NC-08/17/19) give the
  matcher real rounds to attach to.
- **The entrance for AI-drafted wording is built and guarded** — the review
  queue's minting door derives the `ai_drafted` marker itself (0009), and a
  test pins that no caller can claim otherwise.

What genuinely does not exist: the interview (either form), the classifier,
the similarity scorer (the v3 prototype's keyword scorer was never ported),
and the prompt/cost/versioning discipline below.

## The design

### One new module family in the doorway

    doorway/intake.py     the interview and the classifier (both paths)
    doorway/matcher.py    the redline matcher (both paths)
    doorway/drafting.py   U14e candidate drafting (model path only — its
                          "fallback" is the review queue as it works today)
    doorway/prompts/      prompt files, versioned (below)

Each follows `advisory.py`'s contract: one module owns its calls, absence is
recorded not raised, nothing here decides permission, every outcome lands in
the AI-use record.

### Prompt versioning (closes open-questions §10's named gap)

A prompt is a file, `doorway/prompts/<name>.v<N>.md`. Changing a prompt means
adding `v(N+1)`, never editing `vN` — the same never-rewrite rule the library
itself follows. Every call records the prompt name and version it used, so an
auditor can reproduce exactly what was asked. A test pins that no prompt file
is ever modified once a call has recorded it (checksums, like the migration
ledger).

### Cost and rate controls

Two operational settings (administrator's, in `cw.governance_setting`):
`ai_daily_call_budget` and `ai_max_tokens_per_call`. When the budget is spent,
calls stop and the deterministic path answers — recorded as an absence with
reason `budget`, never as an error. Concurrency stays bounded per module, the
way advisory.py already bounds it. Costs become visible before they become a
bill: the AI-use record carries token counts, and the reporting workspace can
sum them.

### The intake interview and classifier

- **Deterministic path (built first):** a fixed probe checklist — the
  architecture's "31 probes" (content, therefore placeholder until Legal
  reviews them) — walks the requester through category-relevant questions and
  assembles a manifest mechanically. A keyword classifier maps free-text
  answers onto categories and severities from term lists that live as data.
- **Model path:** a conversation. The model's job is to *propose* a manifest
  (structured output validated against the manifest schema) and to choose
  which probe to ask next. The requester sees the proposed manifest and
  confirms it; the manifest source is recorded as `llm` (the run record
  already distinguishes this). Nothing proceeds on an unconfirmed manifest.
- **Disclosure (NC-14):** the intake surface carries the plain AI label. Per
  the D-2/D-6 research memo, the EU transparency duty (Article 50) applies
  from 2 August 2026 regardless of risk tier — this ships with intake, not
  after it.

### The redline matcher

- **Deterministic path (built first, and the production form until D-7):** the
  keyword similarity scorer, ported from v3 as real code with an owner —
  open-questions §4 already decided it survives as long-lived infrastructure.
  Score → matched clause → `_rank` gives the retreat path.
- **Model path:** the same seam proposes a match with a stated reason.
- **Score semantics (the §4 consequence, honoured):** the two paths do NOT
  share a threshold. Each carries its own, each answer names which path
  produced it, and the UI says so. Calibrating one scale onto the other is a
  data exercise for after there are real rounds to calibrate on.
- **Vector search is deliberately absent.** Adopting an embedding model or an
  index is D-7 / NC-24 — a new outside dependency that is Mike's to approve,
  and the guidance stands: decide it together with D-2 in one sitting. Nothing
  here blocks on it; the keyword scorer is the matcher until then.

### Mid-negotiation drafting (U14e)

The one capability with no deterministic twin, because its fallback is the
status quo: Legal drafts by hand in the review queue. The model path drafts a
candidate *for a review ticket* — position, counterparty ask and ladder
context in; proposed wording out — and the candidate enters through the
existing draft machinery (0009), arriving `ai_drafted`, adjudicated by a named
human, minted only through the one door. No new entrance is built.

## The work packages, in order

| # | Package | Depends on | Gate |
|---|---|---|---|
| AI-1 | Deterministic intake: probe walk → manifest, keyword classifier | nothing | none — start any time |
| AI-2 | Intake screens (requester workspace) + NC-14 disclosure label | AI-1 | none |
| AI-3 | Model intake: conversation → proposed manifest → human confirm | AI-1, seam | **provider + budget (Mike)** |
| AI-4 | Keyword matcher ported, wired to rounds and `_rank` | nothing | none — start any time |
| AI-5 | Model matcher beside it, own threshold, path named in answers | AI-4, seam | provider + budget (Mike) |
| AI-6 | U14e drafting into the review queue | seam, NC-17 (built) | provider + budget (Mike) |
| AI-7 | Cost/rate settings, prompt ledger, AI-use record export hook (NC-15 shape) | AI-3 or AI-5 (first model pkg) | none |

AI-1 and AI-4 are pure engineering with no decision gate and no key — they can
begin immediately and each leaves the product better even if the model half
waited a year.

## The three decisions that are Mike's (put, not made)

1. **Provider and hosting.** The seam today speaks to OpenAI over HTTPS with
   the key in an environment variable (D-8). Options: stay (zero work),
   switch to Anthropic or another provider (one file, by design), or a
   company-hosted model later (same seam, different address). Recommendation:
   stay with the current seam for development; revisit at launch alongside the
   hardening list.
2. **Budget appetite.** Proposed starting defaults: 200 calls/day,
   4,000 tokens/call — generous for development, visible in reporting, and an
   operational setting the Administrator can change without a release.
3. **Sequencing: intake before matcher?** Recommendation: **intake first**
   (AI-1→2→3). The manifest pipeline behind it is complete, so intake pays off
   immediately; the matcher gains from accumulating real negotiation rounds
   first, and its deterministic half (AI-4) can proceed in parallel anyway.

*Not proposed here, on purpose: vector search (D-7/NC-24, take with D-2), any
clause wording or probe content (placeholder until Legal reviews), and any
change to the review queue's authority model.*
