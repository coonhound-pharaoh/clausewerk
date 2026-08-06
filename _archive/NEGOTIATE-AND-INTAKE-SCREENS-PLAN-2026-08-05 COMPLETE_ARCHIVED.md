# Implementation Plan — the Intake and Negotiate screens, for every role that has one

> **BUILT 2026-08-05, the same day.** Every package below landed: `NG-0` … `NG-4`, `IN-1`,
> `IN-2` and `NT-1` … `NT-4`. What the build found that this plan had wrong is §10, at the end —
> three things, each caught by a test rather than by reading.

*Written 2026-08-05. Five decisions were put to Mike and all five are answered — they are recorded
in §9 and the plan below already reflects them. It also carries an addition Mike made the same
day: **the administrator gets acts, not just screens** — the ability to raise what they observe to
the role that can fix it (§5b).

This plan builds screens over machinery that already exists. It adds three read endpoints, one
document download, and two migrations — one for the intake coverage figure, one for the notice
record. It makes exactly one change to the workspace table in `shell.jsx`: the Legal admin gains a
ninth area, by decision `NI-1`. No role's read permissions change.*

---

## 1. What is being built, in one paragraph

The requester can already assemble a contract by choosing risks from a list by hand. Behind that
screen, two things are now finished and have no screen at all: the **intake walk** (a fixed set
of plain-language questions whose answers compose the manifest mechanically) and the
**negotiation record** (rounds, positions, the retreat ladder, revivals, renewal drift). This
plan puts a face on both, for each role the database already lets in — and leaves the roles the
database keeps out with nothing, which is the correct screen for them.

---

## 2. Who gets what

| Role | Intake | Negotiate | Why |
|---|---|---|---|
| **Requester** | Full — asks the questions, sees the proposal, confirms it, assembles | Full, own deals — opens a negotiation, records rounds and supplier paper, moves positions, escalates | Their tabs `intake` and `negotiate` exist and stand empty today |
| **Legal reviewer** | None | Full, every deal — escalated positions first, concessions to approve, round analysis, revivals | Their `negotiations` tab exists and stands empty today |
| **Legal admin** | None | **Full, every deal — a new ninth area** (`NI-1`) | Holds every negotiation read already; Mike decided they get their own desk rather than only the numbers |
| **Auditor** | None separately | Read-only, inside the existing **the record** pane (`NI-2`) | Holds every read in full; adding a tab is a workspace change, adding a section is not |
| **Administrator** | **Question-set coverage** (§`IN-2`, `NI-5`), **and the act of raising it to Legal** (§5b) | None | Reads the audit chain already. Refused on three of the four negotiation reads and filtered to zero rows on the fourth — migration `0027` left that boundary to the owner deliberately |
| **Viewer** | None | None | No grant on the negotiation family and no intake path. The tab set already gives them one tab |

The viewer row is the important one. **We are not building a screen that shows nothing** — we are
recording that the absence is correct and deliberate, so nobody adds one later by mistake.

---

## 3. What already exists (so the plan can be believed)

**Intake — finished, no screen.** `backend/doorway/intake.py`, `GET /intake/probes` and
`POST /intake/classify`, with `intake_walk.json` holding the questions and term lists as content
a reviewer can edit. Its output is exactly the body `POST /manifests/check` already takes.

**Negotiation — finished, no screen.** Reads: `GET /negotiations/rounds`, `/positions`,
`/revivals`, `/drift`, plus `/concessions`, `/negotiations/analysis`, `/risk/assessments`.
Writes: `POST /negotiations`, `/negotiations/renew`, `/negotiations/rounds`,
`/negotiations/positions`, `/negotiations/positions/move`, `/negotiations/positions/escalate`,
`/negotiations/redline` (the supplier's document), `/concessions`, `/concessions/approve`.

**What is missing, and it is small.** Two things. There is no read that lists the negotiations
themselves — we can read a negotiation's rounds and positions but not its header row (which deal,
our paper or theirs, which baseline, what state, opened when). Every screen in this plan needs it.
And the supplier's received document can be recorded but never read back out: the round row keeps
its fingerprint and where the bytes live, and nothing serves them. Both are work package `NG-0`.

---

## 4. The rules these screens must not break

Four, each of which this codebase has already been bitten by:

1. **No pane fetches broadly and filters on screen.** Every call maps to one role-scoped
   endpoint (`api.jsx`, rule 2). The negotiation reads take no parameters on purpose; a screen
   that wants one negotiation filters what the rule already returned.
2. **Never a number the app does not hold.** A count that could not be fetched shows *nothing*,
   not zero (`shell.jsx`, `COUNT_SOURCE`).
3. **No test pins content.** The probe questions, the term lists, and every refusal sentence are
   placeholder. Tests check what the screen *does* (CLAUDE.md, 2026-07-27).
4. **Five status states and no sixth.** `Status` in `common.jsx`. A position's own states
   (opened, held, conceded, escalated, settled) are **not** those five and must not be dressed
   as them — they render as plain words with the rung beside them. Only things that are in force,
   pending, refused, never-run or superseded get a status mark.

---

## 5. The work packages

### `NG-0` — the negotiation list read, and the supplier document *(1½ days, backend)*

Add to `reads.py`:

- `GET /negotiations` — `negotiation_id, agreement_id, paper, baseline, state, opened_on,
  opened_by, renews_agreement_id, baseline_note` from `cw.negotiation`, on the table's own read
  policy. No parameters, no added `WHERE`, matching the four reads beside it.
- `GET /negotiations/movements` — the position history (`cw.position_movement`), so a position
  can show how it got where it is rather than only where it is. Same policy shape.

**And the supplier's document, downloadable** (decision `NI-4`). A new route
`GET /negotiations/paper?round=…`, built the way `GET /runs/contract` is built and for the same
reason: it names one artefact, resolves it through the round table under the caller's own read
rules *first*, and treats "no such round of yours" as a refusal that produces no bytes. It is not
a `Read`, because it answers a file rather than rows.

**Who gets bytes** (Mike's answer): everyone who can read the deal — Legal, the auditor, and the
requester who owns it — which is exactly what the round's own read policy already returns, so the
rule is the database's and not a list written in Python. The viewer still has no export path and
gains none here; `ADR-0008` is untouched. Every download appends to the chain, as the contract
download does.

Add all three to `api.jsx` (`negotiations()`, `positionMovements()`, and `supplierPaper(round)`
through the existing `download` helper). Extend `test_reads.py`, which already runs every read's
statement against the migrated schema — the check that caught the review desk shipping columns
`cw.review_ticket` does not have. Add a refusal test proving no bytes are produced on any refusing
path, and a test proving a viewer gets nothing.

*No migration. Every statement sits on policies migration `0027` already wrote.*

### `IN-1` — the requester's intake screen *(2–3 days)*

Replaces `NotBuiltYet` at `workspaces.jsx:53`. New file `prototype/v4/app/intake.jsx`.

**Four steps, on one screen, in reading order.**

1. **The deal.** Counterparty and value. The vendor name is required — the endpoint refuses
   without it, and the screen should say so before the round trip, not instead of it.
2. **The questions.** `GET /intake/probes`, rendered as a plain list of text areas. A probe tied
   to a category this library does not define is already withheld by the endpoint; the screen
   does no filtering of its own.
3. **The proposal.** `POST /intake/classify` returns proposed risks and `unmatched`. Two things
   must be visible without being explained:
   - Every proposed risk is drawn in the **pending** state — amber, hatched — because nobody has
     confirmed it yet. It stamps solid when the requester confirms. Each carries the requester's
     own quoted words as its justification, in the existing oversized serif quotation marks.
   - **`unmatched` is shown, never swallowed.** "Three of your answers matched nothing we have a
     category for" is the honest sentence, and it is the whole reason the field exists. It is not
     an error and must not be red: it is a gap in Legal's question set, and making gaps visible is
     the product boundary's job.
   - The requester may add, remove, or re-severe any proposed risk before confirming. The
     proposal is a draft, not a verdict.
4. **Confirm and assemble.** The confirmed manifest goes to `POST /manifests/check` and then
   `POST /runs` — the existing `AssembleContract` path in `requester.jsx`, called with a manifest
   the walk composed instead of one typed by hand. **Do not fork that code**; lift it so both
   entrances land on the same three acts.

**The disclosure label.** This path uses **no model**. The label must therefore say what is true:
answers are classified by a keyword list, in the open, and here is the list that matched. Putting
an AI disclosure on a path with no AI in it is the same defect as omitting one where there is —
it makes the label mean nothing. When `AI-3` lands beside this path, the model-authored proposal
gets the permanent, plain, in-reading-order disclosure that `NC-14` specifies, and this one keeps
its own true sentence.

### `NG-1` — the requester's negotiate screen *(3–4 days)*

Replaces `NotBuiltYet` at `workspaces.jsx:54`. New file `prototype/v4/app/negotiate.jsx`.

Opens on **the list of their negotiations** (`NG-0`), each showing the deal, whose paper it is,
the baseline, the round it has reached, and how many positions are open. Oldest movement first —
the same rule the review desk uses, and for the same reason.

Opening one shows, in this order:

- **Rounds** — a numbered strip, direction (out to them / in from them), date sent, and the
  document's hash. The sequence guard is the database's (`cw.round_is_next`); the screen offers
  "record the next round" and lets the refusal travel back in the database's own words if the
  sequence is wrong.
- **Received paper** — `POST /negotiations/redline` uploads the counterparty's document and
  appends it as a round in one act. The screen shows the recorded fingerprint afterwards, and
  **offers the file back** (`NG-0`, decision `NI-4`): the saving step lives in this one screen,
  as it does for the contract download, and not in the transport every screen uses.
- **Positions** — one row per contested category: our clause and version, where their text sits,
  the current rung on the ladder, and the state. Three acts, each with its own reason field and
  no quick version of any of them:
  - **move** (`/positions/move`) — down a rung, with a note.
  - **escalate** (`/positions/escalate`) — hands it to Legal. The endpoint escalates and does
    nothing else, deliberately; the screen therefore offers "open a review ticket" as a
    **separate, visible second act** rather than firing both from one button (decision `NI-3`).
  - **concede** (`POST /concessions`) — refused by the database if it breaks the floor or needs
    an override. That refusal renders as its own sentence, which names the rule.
- **Revivals** — the same argument reopening, counted. An empty answer means no settled point is
  being renegotiated, and must render as **"none"**, not as an empty box.
- **Renewal drift**, when the negotiation is a renewal — what last term's positions carry and how
  far the library has moved since. This is a control, and it must stay in front of whoever opened
  the renewal rather than living behind a link.
- **Concession approval.** Settling at a fallback needs both the requester and the assigned
  attorney (`memory.md`, S-record on dual approval). The requester's half of that is an approve
  button here; the database refuses if the person is not one of the two named.

Opening a negotiation at all: `POST /negotiations` for new paper, `POST /negotiations/renew` for
a renewal. Both are reachable from an open deal in `MyDealsPane`, because that is where a person
already is when they decide to start negotiating.

### `NG-2` — the Legal reviewer's negotiations screen *(2 days)*

Replaces `NotBuiltYet` at `workspaces.jsx:66`. Same file, different composition — **not a second
implementation of the position row.** The reviewer sees every negotiation the policy returns
(all of them), and the desk is ordered by what is waiting on Legal:

- **Escalated positions first**, oldest first, with the deal, the category, the rung, and the
  requester's note.
- **Concessions awaiting the attorney's approval** (`/concessions`, state derived) with the
  approve act.
- **Round analysis** (`/negotiations/analysis`) beside the position it touched — which paragraph,
  which instrument matched it, the retreat path, and the alternatives. Everything on this surface
  is **advice on the record and gates nothing**, and it says so.
- **Risk estimates** (`/risk/assessments`) — labelled estimates, signed, with an absent outcome
  showing its recorded reason rather than a blank.
- The rail count for `negotiations` currently points at `A.concessions()`. Repoint it at the
  escalated-position count once `NG-0` lands, because that is the honest answer to "how many are
  waiting on me here."

### `NG-3` — the Legal admin's negotiations area *(1 day)*

Decision `NI-1`: the Legal admin gets a **ninth area**, `negotiations`, with the reviewer's desk
behind it. Three things this touches, and they are the reason it is a day rather than an hour:

- The workspace table in `shell.jsx` gains one row. **That table is the specification** — the
  acceptance test asserts the rendered tab set matches it exactly for every role, so this is a
  deliberate, visible change to a checked contract, and the test is updated in the same commit.
- `COUNT_SOURCE` gains nothing new; the `negotiations` entry already exists and is repointed once
  by `NG-2` (below), and both roles read the same honest number.
- The pane itself is `NG-2`'s, composed a second time. **Not a second implementation.**

The rail is now nine deep. That is past what a rail reads well at, and it is worth revisiting when
sourcing documents and obligations grow the Legal admin further — but it is a layout question for
then, not a reason to withhold a screen Mike asked for.

### `NG-4` — the auditor's view *(half a day)*

Decision `NI-2`: a **section inside the existing `the-record` pane**, not a new tab. Rounds,
positions and revivals for the agreement being examined, read through the auditor's full grant.
No acts. It puts the negotiation beside the rest of that agreement's chain, which is how an
auditor reads, and the workspace table is untouched.

### `IN-2` — question-set coverage, in the administrator's workspace *(1–2 days, includes a migration)*

Decision `NI-5`: Mike judged this an administrative question rather than a Legal one, so it lands
in the **administrator's `health` area** and not in a Legal workspace. The administrator already
reads the audit chain, so the grant is not new.

Every classification writes an audit row (`intake_classified`) carrying the count of answers, the
categories proposed, and the probe ids that matched nothing. A view over those rows gives one
number: how often a requester's words classified as nothing, and which questions produce it. It
sits with the other health tiles, where "something is not working" already lives.

This needs a new view and therefore a migration — the only migration in this plan, which is why it
stays a separate package. **The mutation harness must be run before committing it**
(CLAUDE.md, 2026-07-28).

The person who **edits** the question set is Legal, and under this decision Legal does not see the
figure that judges it. Mike's answer to that is the next four packages: **the administrator raises
it.** The gap does not sit on a screen waiting to be noticed — it gets sent, by a named person,
to the people who can fix it.

---

## 5b. Raising things — the administrator's escalation acts (`NT-1` … `NT-4`)

*Added at Mike's instruction, 2026-08-05: "the admin should have a lot of abilities to notify
different user types based on data they observe. Things have to be escalated somewhere."*

### The idea in one paragraph

The administrator watches the machine: health checks, unreachable people, the outbox, and now the
intake question set. Today, everything they notice is a screen they can look at and nothing they
can **do**. These packages give them one act — **raise a notice** — which puts what they observed
in front of the role that can act on it, on the record, with their name on it.

### The four rules that keep this from becoming a chat app

This is the part that matters, because "let people send each other messages" is how a system of
record turns into an inbox nobody reads.

1. **A notice always cites something the raiser can already see.** There are no free-standing
   messages. A notice names a subject — these probe ids, this health tile, this unreachable
   person, this category — and the raiser may only cite subjects their own reads return. The note
   beside it is their own words about that subject, quoted, exactly like every other
   justification in this product.
2. **A notice never gates anything.** It is a warning written down, not a question somebody has
   to answer before work continues (Mike's standing rule: warn stakeholders, don't gate on
   approval). Nothing blocks because a notice is open.
3. **It arrives where people already look.** A raised notice becomes a row in the existing
   *waiting on you* derivation — so it appears in the recipient's workspace panel and in their
   daily digest, from one derivation that screen and email cannot disagree about. **No bell, no
   red dot.** The waiting list is the notification system, and a bell competes with it and wins,
   badly.
4. **Who may raise a notice to whom is a table in the database, not an `if role ==` in the
   doorway.** Otherwise the rule has two copies within a month.

### `NT-1` — the notice record *(2 days, includes a migration)*

- `cw.notice` — append-only: who raised it, when, the recipient (a **role** or a named person),
  the subject kind and reference, and the raiser's note. The raiser is bound from the connection
  by trigger, whatever the body claims — the shape every other act in this system uses.
- `cw.notice_acknowledgement` — closing one is its own act, by a named person, with the option of
  a note back. A notice is **never auto-closed** and never expires quietly; an unacknowledged
  notice stays visible, because that is the entire point of having raised it.
- `cw.notice_route` — the permitted raiser-role → recipient-role pairs, seeded with the ones
  below and editable as governance. A pair not in the table is refused by the database.
- One branch added to `cw.waiting_for` so an open notice shows up in the panel and the digest.

**Trap, named in advance:** `cw.waiting_for` has been re-created four times (`0041`, `0044`,
`0059`, and now this). Re-creating it strands any mutation-harness pattern anchored on the old
text — that is `S220`, which happened three times in one day. Grep `mutation-check.mjs` and
`mutation_check.py` for patterns anchored on `waiting_for` **before** committing, and run the
harness, which a migration requires anyway.

### `NT-2` — the acts *(1 day, doorway)*

- `POST /notices` — one act, one statement. The subject reference is validated by the database
  against what the raiser may see, not by a check in Python.
- `POST /notices/acknowledge` — one act, the acknowledger bound from the connection.
- `GET /notices` — scoped by policy: your own raised notices, the ones addressed to you or your
  role, plus Legal and the auditor in full. No parameters.

Every refusal travels back in the database's own words.

### `NT-3` — what the administrator can raise, and to whom *(2 days, screens)*

The general capability, placed on the surfaces where the administrator already observes something.
Each is a "raise this" control **beside the row it is about**, pre-filled with that row's
reference, so the citation cannot be mistyped:

| Where they see it | What they raise | To whom |
|---|---|---|
| Question-set coverage (`IN-2`) | These intake questions are classifying nothing | Legal admin |
| Notification gaps (`/notifications/gap`) | This person is being waited on and no channel can reach them | Legal admin, and the person's own manager role |
| System health tiles | This check is failing, or has never run | Legal admin, auditor |
| The outbox | Deliveries to this person are failing | Legal admin |
| People and access | This account has held an uncountersigned grant for N days | Legal admin |

Each carries the administrator's own words and the reference, and nothing else — the
administrator does not read contract operations and their notices cannot narrate any.

### `NT-4` — receiving one *(1 day, screens)*

- **In every workspace**, an open notice addressed to you or your role appears in the existing
  waiting panel, alongside the tickets and obligations already there. It is one more kind, not a
  new surface.
- **Acknowledging** is a button with a reason field, like every other act that needs one. No
  quick-acknowledge, and no acknowledge-all — the same argument as the override findings, which
  deliberately have no batch endpoint.
- **Legal's intake case, specifically** (the one Mike asked for): the notice arrives naming the
  probe ids that classified nothing, so the person editing `intake_walk.json` opens it and sees
  exactly which questions to fix.

### Who else should get this, later

Mike's instruction was about the administrator, and that is what `NT-3` builds. The record and the
route table are general, though, and two more pairs are obvious once it exists: **Legal → the
requester** (your deal is sitting on something), and **the auditor → Legal admin** (this part of
the chain does not reconcile). Neither is built here. Adding a pair is a row in `cw.notice_route`
and a control on one screen — deliberately cheap, so it can wait until somebody actually wants it
rather than being guessed at now.

---

## 6. Sequence

```
NG-0 (reads + document)  →  NG-1 (requester)  →  NG-2 (reviewer)  →  NG-3 (Legal admin)
                                                                 →  NG-4 (auditor)
IN-1 (requester intake)        — independent, can run in parallel with NG-0
IN-2 (coverage, administrator) — after IN-1
NT-1 (notice record) → NT-2 (acts) → NT-3 (administrator raises) → NT-4 (receiving)
                                     NT-3 needs IN-2 for the intake-gap case only
```

`IN-1` depends on nothing that is not already merged. `NG-1` depends only on `NG-0`. `NG-3` and
`NG-4` both depend on `NG-2` and on nothing else, so they can run together. Nothing here waits on
the sourcing-document work (`SRC-1..4`) or on the model intake (`AI-3`) — both consume the
confirmed manifest this plan produces, and both attach to `IN-1`'s step 4 without changing steps 1
to 3.

**Total: about four working weeks** — two and a half for the screens, six days for the notice
family. `NT-1` … `NT-4` depend on nothing in the negotiate work and can run beside it if there is
a second pair of hands.

---

## 7. How it will be checked

- **Shell test** — the rendered tab set still matches the workspace table exactly, and no role
  reaches a pane outside its own set. It is updated **once**, in `NG-3`'s commit, for the Legal
  admin's ninth area. Any other time it goes red, a tab was added without a decision.
- **The acceptance walkthrough** (`backend/doorway/acceptance_walkthrough.py`) gains the whole
  path over HTTP as the seeded people: requester walks the intake → confirms → assembles → opens
  a negotiation → records a round → opens and escalates a position; the reviewer sees the
  escalation on their desk. This is the check that found the missing share endpoint last time,
  and it is worth more here than any unit test.
- **`test_reads.py`** covers the two new reads, including the named assertion that neither takes a
  parameter and neither adds a `WHERE` of its own.
- **A refusal test per act**, asserting the database's own sentence reaches the screen unaltered.
- **The notice family** (§5b) adds three of its own: a raiser citing a subject their reads do not
  return is refused by the database; a raiser–recipient pair absent from `cw.notice_route` is
  refused; and an open notice appears in the recipient's *waiting on you* derivation, which is the
  same derivation the daily digest reads.
- **The mutation harness** runs before either migration is committed, with the `waiting_for`
  patterns re-checked by hand first (`S220`).
- **No test asserts a probe question, a term list, a category name, the wording of a notice, or
  the wording of any refusal.**

---

## 8. What could go wrong, named in advance

- **The screen re-implements a rule the database already holds.** The position state list, the
  round sequence, the concession floor, and who may approve are all the schema's sentences. The
  screen offers the act and renders the refusal. A pre-flight check in JavaScript is a second copy
  that will eventually stop agreeing with the first.
- **Two position rows.** `NG-1` and `NG-2` show the same object to different people. One
  component, composed twice. This product has already paid for four near-identical status tiles.
- **`unmatched` quietly dropped from the intake screen** because it looks like clutter. It is the
  single most valuable field on that response and the only evidence Legal's questions are working.
- **An empty revivals list rendered as a blank area.** "No settled point is being renegotiated" is
  good news and a real answer; blank space is a screen that failed to load.
- **The supplier download becoming a general export path.** `NI-4` opened one door for one
  document class, scoped by the round's own read policy. The next screen that wants "a download
  like the negotiation one" is a separate decision, and the viewer's absence of any export
  (`ADR-0008`) is not weakened by this one.
- **The notice record becoming a messaging system.** The guard is rule 1 in §5b: a notice cites a
  subject the raiser can already see, and there is no free-standing message. The first request for
  "just let me send a quick note to someone" is the moment to re-read that rule, not to bend it.
- **A notice quietly gating something.** It warns. If a screen ever refuses to proceed because a
  notice is open, the rule in §5b has been broken and the refusal is the defect.
- **The rail printing a count it did not measure.** `COUNT_SOURCE` entries must be added only
  where a read's row count is genuinely the answer to "how many wait on me here."

---

## 9. Decisions — asked and answered, 2026-08-05

| # | Question | Mike's answer | Where it lands |
|---|---|---|---|
| `NI-1` | The Legal admin holds every negotiation read but has no negotiation area — and already has eight. Add a ninth? | **Yes — add the ninth area**, against my recommendation to leave it. | `NG-3` |
| `NI-2` | The auditor: a section inside **the record**, or their own tab? | **A section.** No workspace change. | `NG-4` |
| `NI-3` | Escalating a position and opening a review ticket are two acts on purpose. One button for both? | **No — two buttons, one after the other.** | `NG-1` |
| `NI-4` | Received supplier paper: fingerprint only, or a download? | **Build the download**, readable by **everyone who can read the deal** — Legal, the auditor, the owning requester. The viewer still gets none. | `NG-0`, `NG-1` |
| `NI-5` | Where does question-set coverage live? | **The administrator's, not Legal's** — Mike: an admin issue, not something Legal needs to see. | `IN-2` |

`NI-1` is the only one that changes the workspace model. `NI-4` is the only one that adds a new way
for a document to leave the system, and it is scoped by the round's own read policy rather than by
a list written in the doorway. No role's read permissions change.

### Added the same day, at Mike's instruction

> "Give the admin a feature to notify legal about intake question gaps when they arise. Indeed,
> the admin should have a lot of abilities to notify different user types based on data they
> observe. Things have to be escalated somewhere."

Built as §5b. Four design choices were made rather than put back to Mike, each recorded here so
they can be overturned knowingly:

| Choice | Made | Why |
|---|---|---|
| A notice must cite a subject the raiser can already see | **No free-standing messages** | Otherwise this becomes an inbox, and the administrator — who deliberately cannot read contract operations — could narrate them in prose |
| Where a notice appears | **In the existing *waiting on you* panel and the daily digest** | One derivation feeds both, so screen and email cannot disagree. No bell, no red dot |
| Whether a notice gates anything | **Never** | Mike's standing rule: warn stakeholders, don't gate on approval |
| Who may notify whom | **A table in the database** (`cw.notice_route`), seeded with the administrator's pairs | A role list written in the doorway becomes a second copy of a rule and stops agreeing with the first |

---

*No contract wording, clause text, probe questions, term lists, or example rows are proposed in
this document.*

---

## 10. What the build changed — 2026-08-05

Three things this plan asserted turned out to be wrong. Each was caught by a test rather than by
reading the code, which is the argument for having written the tests first.

### The auditor cannot download the supplier's document after all

Decision `NI-4` said everyone who can read the deal may take a copy, and the auditor reads every
deal. But handing a document out is **recorded on the chain before the bytes leave** — the order
the contract download already uses, and the only way a download is evidence rather than a
convenience. The chain's append rule (migration `0007`) names the requester and the two Legal
roles: **an auditor reads the whole record and adds nothing to it.**

So the auditor is refused, in the database's own words, and the refusal is pinned by a named test
rather than left to be discovered. This is an older rule than `NI-4` and the build left it
standing. **If Mike wants the auditor included, it is a grant on the chain and one test moves with
it** — but that is a decision about what an auditor is, not a fix.

### The intake screen records the source as `fallback`, never `intake`

`POST /intake/classify` answers `source: "intake"` — its own name for the classification event.
The run store accepts exactly three values: `llm`, `fallback`, `manual`. A screen forwarding the
classifier's own label would be refused at the **final** act, after the requester had answered
every question, in a sentence about a field they never saw. `ADR-0005` calls this classifier the
deterministic fallback, so that is what the run records. The walkthrough now walks the whole path
so this cannot hide behind a green unit test again.

### The administrator is answered *zero rows*, not a refusal, on two more tables

The plan said the administrator is refused the negotiation reads. That is true of the three
**views** and false of the two **tables** the new reads sit on: migration `0013` grants the role
select on `cw.negotiation` and `cw.position_movement`, no policy admits it, and the database
filters instead of refusing. The role sees an empty negotiation record rather than an honest
"not yours". That is the same reported gap `NC-08` left open on the rounds table, now on three
tables instead of one — **widened by this work, and pinned by a test that says so.** Closing it is
an owner decision (revoke the inert grant, or admit the role), and it was not this package's to
make.

### And one thing the plan under-specified

The notice record needed a fifth guard nobody had thought of: **naming an individual must not be a
way around the route table.** Without it the whole permitted-pairs table is one field away from
irrelevant — address the notice to a person instead of a role and it lands anyway. A person notice
is now routed by the effective role that person actually holds. There is a test named after the
hole it closes.
