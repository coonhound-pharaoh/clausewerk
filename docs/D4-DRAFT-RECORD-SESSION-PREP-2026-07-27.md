# D-4 — The draft-record design session: preparation sheet

> **ANSWERED IN FULL by the owner, 2026-07-27 — D-4 is CLOSED. See §7 for the decisions.**
> All twelve questions settled. One new item (a risk-exposure score) recorded as a separate
> question per the scope rule, not folded in.

**Date:** 2026-07-27 · **For:** the owner (Mike) · **Length of session:** one sitting
**What it unblocks:** the database changes behind WP-5 (clause library builder), WP-6 (edit
quality metrics) and WP-7 (EU compliance scaffolding).

---

## 1. Read this first

Most of what a regulator, an auditor or Legal would ask about an AI-drafted piece of contract
language is **already stored today**. This session is not a redesign of the record. Its job is
**four fields** — and, for each one, three small questions.

The reason the session exists at all is the second thing to read:

> **A field agreed wrong is a field that stays wrong for every record already written.**

The draft record and the review ticket are append-only. Nothing in them can be corrected later,
by anyone, including us. That is deliberate — it is what makes the record evidence rather than a
report. It also means the four decisions below are one-way doors.

---

## 2. What the record already stores

### 2a. The draft — the AI's proposal (`cw.clause_draft`)

*Source: `backend/db/migrations/0008_review_queue.sql:56–75`.*

| Field | In plain terms |
|---|---|
| `draft_id` | The draft's own number. |
| `kind` | What sort of thing was drafted — clause, ladder rung, or rule. |
| `text` | The model's words, exactly as produced. This is the baseline every "how much did Legal change it?" measurement is taken against. |
| `prompt` | The instruction the model was given. |
| `model` | Which model produced it. |
| `model_version` | Which version of that model. |
| `inputs` | The rules and source records the model was shown. |
| `created_by` | Who asked for the draft. |
| `created_at` | When. |
| `expires_on` | The date an un-actioned draft goes stale (30 days), so a proposal nobody acted on does not linger as a decision nobody made. |
| *(rule)* `draft_text_not_blank` | A draft cannot be empty. |

### 2b. The ticket — the human decision (`cw.review_ticket`)

The before-and-after that the metrics measure lives **here**, not on the draft.
*Source: `0008_review_queue.sql:82–143`.*

| Field | In plain terms |
|---|---|
| `ticket_id` | The ticket's own number. |
| `agreement_id` | Which agreement it relates to, when it relates to one. |
| `category_key` | Which clause category. |
| `severity` | Standard or High. |
| `reason_code` | Why this ticket exists (no AI match, human escalated, human edit, AI draft, supplier paper). |
| `provenance_badge` | Whose words the reviewer is reading — vendor language, AI candidate, or edited by Legal. |
| `proposed_text` | **The "before".** What was put forward. Cannot be rewritten, ever. |
| `draft_id` | The draft this ticket carries, when it carries one. |
| `state` | Pending, verified, rejected or expired. |
| `approved_text` | **The "after".** The exact words the reviewer approved. |
| `edited_before_approval` | Whether Legal changed anything. **Worked out by the database itself** — see §4. |
| `decided_by` | Who decided. |
| `decided_on` | When. |
| `decision_note` | Why — mandatory on a rejection, and a blank note does not count. |
| `minted_clause_id` | Which library clause was created, when one was. |
| `minted_version` | Which version of it. |
| `opened_by` | Who opened the ticket. |
| `expires_on` | When the ticket goes stale. |
| `created_at` | When it was opened. |

**In one line:** the prompt, the model, its version, what it was shown, the AI's exact words, the
approved words, whether they differ, who decided and when — all already recorded.

---

## 3. The append-only constraint, in plain terms

Four locks, all already in force:

1. **A ticket's proposal half cannot be rewritten, only decided.** Change the proposed text, the
   category, the draft it points to, or who opened it, and the database refuses (`0008:261–277`).
2. **A decided ticket cannot be reopened or re-decided.** If the decision was wrong, a new ticket
   is opened; the old one stands (`0008:279–284`).
3. **A draft freezes the moment a ticket is opened against it.** Before that it is ordinary work in
   progress. After it, it is the baseline of a measurement, and editing it is refused (`0008:361–375`).
4. **Nothing can be deleted, and nothing can be wiped in bulk.** Deletes raise an error on both
   tables, and so do bulk clear-outs (`0008:311–333`, `0008:377–395`).

There is also no back door through the customer-data deletion path: today's redaction and purge
work reaches the **signed-contract records only** — the executed agreement, its documents,
signatories and certificates (`0023_redaction_and_purge.sql:318–395`). The AI-use record is not
touched by it and has no deletion path at all. *(Whether it should is a separate question, D-6 —
not for this session.)*

**Consequence to hold in mind while answering §5: whatever is agreed here is what every record
written from that day forward carries, permanently, and every record written before it will
permanently lack.**

---

## 4. Two things already settled — please do not reopen them

- **The similarity figure is worked out by the database, never sent in by the software.** There is
  already a precedent doing exactly this: `edited_before_approval` is computed at the moment of
  approval and written over whatever the caller supplied (`0008:292–301`). The reasoning, in the
  code's own words: a control a caller can fill in themselves is not a control. The new figure
  follows the same rule.
- **Thresholds are not fields on the record.** How much editing is "too much" is a governance
  setting, held alongside the other owner decisions, not stamped onto each draft (this is NC-13's
  job). The existing edit-rate threshold ships deliberately empty and stays that way until Legal
  sets it with counsel (`0012_sow_override.sql:295–305`). **No number is proposed anywhere in this
  document, and the system must never pick one.**

Also not for this session: *how* the similarity is calculated. Engineering picks that. For the
session it is simply "a number between 0 and 1, worked out the same way every time".

---

## 5. The four candidate new fields — and nothing else

These four cover **both** consumers: the edit-quality metrics work (WP-6) and the EU documentation
work (WP-7). One database change (NC-11) will carry all four, and two packages are waiting on the
answer. **Any fifth field proposed in the session is scope growth and should be written down as a
separate question, not folded in.**

| # | Field | Plain meaning | Wanted by |
|---|---|---|---|
| F1 | Edit-quality figure | How much of the AI's original wording survived into what Legal approved. | WP-6 |
| F2 | Intended purpose | What this AI draft was for. | WP-7 |
| F3 | Known limitations at time of use | What the model was known not to be good at, on the day it was used. | WP-7 |
| F4 | Model performance metrics | How the model was performing at the time of use. | WP-7 |

For **each** of the four, the session must answer the same three questions:

- **Where does it live** — on the draft (the AI's side) or on the ticket (the decision)?
- **Can it be empty** for records written before the field existed? (There is no way to backfill a
  frozen record — see §3.)
- **Who may write it** — nobody (fixed at creation), the database itself, or Legal?

---

## 6. Decision sheet — one page, yes / no / defer

Circle one per line. "Defer" is a legitimate answer; it holds the database change, not the whole
package.

### F1 — Edit-quality figure

| # | Question | Options | Recommendation | Y / N / Defer |
|---|---|---|---|---|
| 1.1 | Store it on the **ticket**, beside the before-and-after it is measured from, rather than on the draft or the finished clause? | ticket / draft / clause | **Ticket** — both texts are already there, and the finished clause's provenance is locked. | ☐ ☐ ☐ |
| 1.2 | Allow it to be **empty** for tickets decided before the field existed? | empty allowed / never empty | **Empty allowed** — old records cannot be corrected, so refusing empty would block the change entirely. | ☐ ☐ ☐ |
| 1.3 | Written **by the database at the moment of approval**, never by the software calling in? | database / caller | **Database** — matches the existing control it sits beside. | ☐ ☐ ☐ |

### F2 — Intended purpose

| # | Question | Options | Recommendation | Y / N / Defer |
|---|---|---|---|---|
| 2.1 | Store it on the **draft**, since it describes the AI use rather than the decision? | draft / ticket | **Draft.** | ☐ ☐ ☐ |
| 2.2 | Allow it to be **empty** for drafts written before the field existed? | empty allowed / never empty | **Empty allowed for old records, required for new ones.** | ☐ ☐ ☐ |
| 2.3 | Fixed **at the moment the draft is created** and never editable afterwards? | fixed at creation / Legal may add later | **Fixed at creation** — a draft freezes as soon as a ticket touches it, so "add later" would rarely work in practice. | ☐ ☐ ☐ |

### F3 — Known limitations at time of use

| # | Question | Options | Recommendation | Y / N / Defer |
|---|---|---|---|---|
| 3.1 | Store it on the **draft**? | draft / ticket | **Draft** — it belongs with the model and version already recorded there. | ☐ ☐ ☐ |
| 3.2 | Allow it to be **empty** for older drafts? | empty allowed / never empty | **Empty allowed for old records, required for new ones.** | ☐ ☐ ☐ |
| 3.3 | Fixed at creation, never editable? | fixed / editable | **Fixed** — the point of the field is what was known *on the day*. | ☐ ☐ ☐ |

### F4 — Model performance metrics

| # | Question | Options | Recommendation | Y / N / Defer |
|---|---|---|---|---|
| 4.1 | Store it on the **draft**? | draft / ticket | **Draft.** | ☐ ☐ ☐ |
| 4.2 | Allow it to be **empty** for older drafts? | empty allowed / never empty | **Empty allowed for old records, required for new ones.** | ☐ ☐ ☐ |
| 4.3 | Recorded **as supplied at the time of use** and frozen, rather than looked up later? | frozen at use / looked up later | **Frozen at use** — a figure looked up later describes a different day. | ☐ ☐ ☐ |

### Scope

| # | Question | Recommendation | Y / N / Defer |
|---|---|---|---|
| 5.1 | Is this session limited to these four fields, with anything else written down as a separate question? | **Yes** — one database change, two packages waiting. | ☐ ☐ ☐ |

---

## 7. Answers — recorded 2026-07-27 (owner: Mike)

### F1 — Edit-quality figure
- **1.1 — TICKET.** Lives on the ticket, beside the before-and-after. (As recommended.)
- **1.1.a — NEW ITEM, recorded separately per 5.1:** the owner also wants an AI-calculated
  **"risk exposure" score** — baselined on the original clause, estimating the percentage of risk
  transferred from supplier to customer by accepting a concession. This is not a draft-record
  field; it belongs with the round-analysis / concession work (plan WP-3, package NC-17) as an
  AI-assisted **advisory** figure — labelled as an estimate, never a decision, with the same
  no-caller-supplied-numbers discipline. Written down here so it is not lost; scoped there.
- **1.2 — NEVER EMPTY.** Owner's ruling, against the recommendation, with reason: we are in
  development, old records are synthetic and malleable (a development database is rebuilt from
  migrations, so "records written before the field existed" do not survive into production).
  The field is required on every decided ticket from day one.
- **1.3 — DATABASE.** Settled by the owner on 2026-07-27 after the plain explanation: the
  database computes the figure itself at the moment of approval; anything a caller sends is
  ignored and overwritten. Same rule as the existing edited-flag control.
- **1.4 — CHALLENGED AND KEPT, 2026-07-27.** The owner questioned the figure's worth (it is
  blind to meaning; what about added words?) and then ruled to keep it, on the record that:
  additions count as much as deletions (the figure measures how far apart the two texts are),
  and it claims only "a person worked on this" — never "the meaning changed this much."
  Meaning-level comparison stays the AI's job (WP-4 / WP-8); a richer AI-assessed review-depth
  judgment may be added later as a separately-labelled advisory, alongside, not instead.

### F2 — Intended purpose
- **2.1 — DRAFT.** · **2.2 — NEVER EMPTY** (same development-data reasoning as 1.2). ·
  **2.3 — FIXED AT CREATION.** (As recommended.)

### F3 — Known limitations at time of use
- **3.1 — DRAFT.** · **3.2 — NEVER EMPTY.** · **3.3 — FIXED.**

### F4 — Model performance metrics
- **4.1 — DRAFT.** · **4.2 — NEVER EMPTY.** · **4.3 — FROZEN AT USE.**

### Scope
- **5.1 — YES.** The session covers these four fields only; the risk-exposure score (1.1.a) is
  the first entry in the separate-questions list.

**Effect on the gate:** D-4 is CLOSED, 2026-07-27. The database change (NC-11) is fully
unblocked, and with it the packages waiting behind D-4 (edit-quality metrics and the EU
documentation fields; the library builder still waits on D-5).

---

## Footer — where each statement comes from

All line references are to files in this repository; line numbers drift, so the surrounding text is
described in each case.

- Draft record fields and the not-blank rule — `backend/db/migrations/0008_review_queue.sql:56–75`.
- Ticket fields, including the before-and-after and the derived edit flag — `0008_review_queue.sql:82–143`.
- Proposal half cannot be rewritten, only decided — `0008_review_queue.sql:261–277`.
- A decided ticket cannot be reopened or re-decided — `0008_review_queue.sql:279–284`.
- The edit flag is computed by the database and written over whatever the caller supplied — `0008_review_queue.sql:292–301`.
- Deletes raise on the ticket and its attachments — `0008_review_queue.sql:311–333`.
- A draft in use is frozen; drafts cannot be deleted; bulk clear-outs raise on all four tables — `0008_review_queue.sql:361–395`.
- The edit-rate threshold is deliberately unset and the system must never choose it — `0012_sow_override.sql:295–305`.
- Customer-data deletion reaches the signed-contract records only — `0023_redaction_and_purge.sql:318–395`.
- The three EU documentation fields, and that the schema work is three fields rather than a new record — plan WP-7; the figure computed at approval and stored with the draft's record — plan WP-6; "the session only has to agree the few new fields" — plan decision D-4 (`.adversarial-workflow-agentic/2026-07-27-new-capabilities/new-capabilities-plan.html`).
