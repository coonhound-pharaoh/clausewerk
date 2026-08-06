# UI Design Proposal — Clausewerk

*Written 2026-08-04. This is a **proposal about appearance**: what the product should look
like and why. It does not change the workspace model (owner decision `U8`), the roles, or
anything the database enforces. Companion mockup:
[`prototype/v5-concept/Clausewerk V5 Concept.html`](prototype/v5-concept/Clausewerk%20V5%20Concept.html)
— open it in a browser, no build step. Its rows are invented, and it says so on the page.*

---

## 1. The idea the whole design hangs on

The product already has a principle for *permissions*:

> The screen mirrors the database. What a role cannot do, its workspace does not show.

This proposal adds the matching principle for *evidence*:

> **The screen shows where every word came from.** Anything Clausewerk displays either states
> a fact the system can prove, or it is plain chrome. Nothing in between.

That is not a slogan. It is the only thing Clausewerk sells that nobody else sells. Two rules
were settled on 2026-08-04 and both are provable:

- A **contract** contains zero words written by a machine.
- A **sourcing document** (RFP or RFQ) may contain machine-written passages, and every one of
  them is labelled.

Today those facts live in reports and record fields. A buyer, a lawyer, or an auditor has to be
*told* about them. **The design's job is to make them visible without being told.** If someone
looks at a Clausewerk screen for five seconds and comes away knowing which words a human
approved and which a machine proposed, the interface has done the entire job of the product.

Everything below serves that.

---

## 2. What I would keep, unchanged

I am not proposing a restyling for its own sake. The existing look is unusually good at the
thing that matters, and four of its rules are better than anything I would invent:

1. **Red means error — never merely "high severity" and never merely "no."** A refusal is the
   system working correctly, so it is styled like a calm statement, not an alarm.
2. **Pending is amber, never green.** A grant that looks effective before someone countersigns
   it is the control undone in pixels.
3. **Never-ran has its own look** — dashed, unfilled — because an absent check shown as a pass
   is the worst lie an evidence system can tell.
4. **Honest empty states.** A screen with nothing behind it says so. It never fills the space
   with invented rows.

Those four survive intact. So does the parchment register Mike chose on 2026-07-28: aged paper,
iron-gall ink, banker's-lamp green, the legal typewriter face for identifiers. It is right for
this product for a reason worth stating — **it looks like a system of record, not like
software.** A procurement lawyer's trust is earned by looking sober, and every competitor in
this category looks like a marketing dashboard.

---

## 3. What I would change

### 3.1 One palette, two paper weights — not two themes stacked on each other

Today the look is assembled from a frozen dark stylesheet plus a parchment layer painted over
it. That works, and it was the right way to get there quickly. It is not the right way to live.

I would replace it with **one set of colour and type definitions with two settings**: the
*document* register (warm cream, high contrast, serif — anything that *is* a document or a
record) and the *desk* register (a cooler, quieter paper — the working chrome: queues, lists,
forms, controls). Dark mode becomes a genuine third setting rather than the layer underneath.

Why it matters in plain terms: **the eye should be able to tell a contract from a control at a
glance, across the room.** Right now the desk and the sheet are close cousins. I would push
them a step apart — the desk quieter, the sheet brighter and warmer — so that a document always
reads as the object under discussion and never as another panel.

*Cost, stated plainly:* this supersedes the "the base stylesheet stays untouched" rule from
decision `U8`. That rule exists so a reorganisation could not become a redesign by accident.
Retiring it is Mike's call, and it is decision **`UX-1`** in §7.

### 3.2 The origin gutter — the centrepiece

Every rendered document — contract, dossier, RFP, RFQ — gets a **left margin gutter** carrying
one mark per paragraph, showing where those words came from:

| Mark | Meaning |
|---|---|
| Solid rule | Approved library language. A named lawyer approved this wording. |
| Solid rule with a tick | Approved language, but a **negotiated fallback** rather than the preferred position. |
| Hatched rule | **Machine-proposed, human-approved** — drafted by the model, adjudicated by a named person, then admitted to the library. |
| Open hatch, amber | **Machine-authored, labelled** — permitted in sourcing documents only. Never possible on a contract. |

Click any mark and the chain opens beside the text: clause → policy citation → approver → date.
This is the audit trail as a reading experience rather than a report someone runs afterwards.

Two things make this design honest rather than decorative:

- **On a contract, the amber mark is structurally impossible.** The gutter is therefore not a
  claim; it is the count made visible. Anyone who sees amber on a contract has found a defect,
  which is exactly the property you want a control to have.
- **The gutter is on the screen and not in the exported file.** The owner decided on
  2026-07-25 that provenance figures do not print on the contract. The gutter respects that
  absolutely: it lives in the reading surface, and the export is untouched.

This single idea does more for the pitch than any other change proposed here. It is the
difference between telling a design partner "we can prove where every word came from" and
handing them a screen where they can see it.

### 3.3 A finite status vocabulary, and no way around it

Five states. Five shapes. No screen may invent a sixth, and no screen may signal a state with
colour alone.

| State | How it looks | Never |
|---|---|---|
| **Effective** | Solid fill, green | Used for anything awaiting a signature |
| **Pending** | Amber, hatched fill | Green |
| **Refused** | Red, calm and unbold | Used for "no" in the ordinary sense |
| **Never ran** | Dashed outline, no fill | Shown as a pass, or hidden |
| **Superseded** | Struck through, grey | Deleted from view |

The point of writing this down is not tidiness. It is that four near-identical status widgets
already drifted apart once in this product, and the one nobody looks at is the one that goes
wrong. One component, one vocabulary, enforced by the design and not by memory.

### 3.4 A left rail for the two crowded workspaces

The horizontal tab row is right for a requester (six tabs) and perfect for a viewer (one). It
falls over for the Legal admin, who has eight, and it will get worse as intake, sourcing, and
obligations land.

I would keep the tab row for workspaces of five or fewer, and give the Legal admin and the
Legal reviewer a **left rail** instead: same labels, same order, stacked, with the waiting
count beside each. A rail also has room for the thing a horizontal row cannot show —
**how many items are waiting, per area, without opening anything.**

### 3.5 The waiting list gets a temperature, not an alarm

Every workspace opens on what is waiting. That is settled and it is the best decision in the
current design. What it needs is a way to show *age* that does not reach for red.

I would render age as a deepening warmth along the row's left edge — barely visible at a day
old, unmistakable at a week. The oldest item stays explicitly marked, because sort order that
nobody can see reads as a preference somebody may change. Nothing about it blinks, pulses, or
turns red. **Red stays reserved for error, in perpetuity.**

### 3.6 The document reading surface, properly typeset

Contracts are read, not scanned. The reading surface should behave like a well-set legal
document and not like a web page:

- A fixed measure of roughly 66 characters, whatever the window size.
- Clause numbers in the margin, out of the text flow.
- **Defined terms in true small capitals**, with a quiet dotted underline; hover, and the
  definition appears without leaving the page. This is the single most useful thing a screen
  can do for someone reading a contract, and no procurement tool does it.
- The existing oversized serif quotation marks around every human justification, kept exactly.
  They are the design's best existing idea: they say *a person said this in their own words*.

### 3.7 The machine, labelled and unglamorous

The intake interview being built now is the first place a requester meets the model. Two design
rules, both non-negotiable and both cheap:

- **The disclosure label is permanent, plain, and in the reading order** — not a tooltip, not
  an icon, not a footer. European transparency duty applies from 2 August 2026, and beyond the
  law, a labelled machine is a trustworthy machine.
- **Anything the model proposes is drawn in the pending state — amber, hatched — until a named
  person confirms it.** A proposed manifest field looks visibly unlike a confirmed one. The
  moment a human confirms it, it stamps solid. That one animation is worth keeping (§3.8),
  because it makes confirmation feel like what it legally is: an act.

No sparkles. No gradient "AI" badge. No wand icon. In this product the model is a labelled
participant with a recorded name, exactly like the humans.

### 3.8 Almost no motion

Two animations survive, and no more:

- **The stamp** — when something becomes recorded.
- **The strike** — when something is suppressed or superseded.

Everything else changes state without transition. The reasoning is not taste: motion suggests
the system is busy *doing* things, and Clausewerk's promises are mostly about what it
**refuses** to do. A still interface is a truthful one here.

---

## 4. What the front door looks like

The sign-in card is the first impression and currently the most honest screen in the product —
it admits there is no password yet rather than drawing a password box that accepts anything. I
would keep that text word for word and change only its setting: a full-bleed parchment field,
the wordmark and monogram, one line of what the product is, the name field, and the disclosure.
Nothing else. **No feature list, no illustration, no tagline.** A system of record should open
like a ledger, not like a landing page.

---

## 5. The unglamorous half

These are not decoration and they are the difference between a design that survives contact
with real users and one that does not.

- **Contrast floors:** 4.5:1 for anything you read, 3:1 for anything you identify. Parchment is
  a light background and light backgrounds make greens and ambers go weak; every status colour
  gets measured, not eyeballed.
- **Never colour alone.** Every state carries a shape and a word as well as a colour. Roughly
  one in twelve men cannot separate the amber from the green, and this product's entire
  vocabulary is amber versus green.
- **Numbers align.** Every figure that might be compared to another uses tabular figures. Money
  and counts in ragged proportional numerals is the oldest unforced error in business software.
- **A real print stylesheet.** Dossiers get printed and mailed to auditors. That page should be
  designed, not left to the browser.
- **Keyboard order follows the waiting list**, so the oldest item is one tab and one return away.
- **200% zoom works**, because the people who read contracts all day are not all thirty.

---

## 6. What I would deliberately not build

Stating this matters as much as the rest, because each one will be asked for:

- **No charts for their own sake.** Reporting exists; it should show counts, ages, and mixes as
  numbers and simple bars. A donut chart of clause categories tells nobody anything.
- **No avatars or profile photographs.** The system records names and roles because those are
  accountable; a face is decoration attached to an accountability record.
- **No notification bell with a red dot.** The waiting list *is* the notification system, and
  it is per-workspace and honest. A bell competes with it and always wins, badly.
- **No onboarding tour, no empty-state illustrations, no confetti on approval.** Approving a
  contract deviation is a serious act performed by a professional.
- **No "quick approve" anywhere.** Every act that needs a reason gets a field for the reason,
  every time.

---

## 7. Decisions this proposal asks of Mike

| # | Decision | My recommendation |
|---|---|---|
| `UX-1` | Retire the "base stylesheet stays frozen" rule from `U8`, and rebuild the look as one set of definitions with three settings (document, desk, dark)? | **Yes.** The freeze did its job — it stopped a reorganisation becoming a redesign. Keeping it now means every future change is a layer painted over a layer. |
| `UX-2` | Build the origin gutter (§3.2) as the standard reading surface for every document? | **Yes, and early.** It is the cheapest way to make the product's core claim self-evident, and the sourcing-document work landing next is where it pays off first. |
| `UX-3` | Give the two Legal workspaces a left rail with waiting counts, keeping tabs elsewhere (§3.4)? | **Yes.** Eight horizontal tabs is already past comfortable. |
| `UX-4` | Adopt the five-state vocabulary (§3.3) as a rule that screens may not work around? | **Yes.** This is the one that prevents the drift that already happened once. |

None of these touch the workspace model, the roles, the trust boundary, or anything the
database enforces. They are about appearance, which is what was asked for.

---

## 8. What this would cost

Honest sizing, in plain terms:

- **`UX-1`** is a week of careful work and a re-measure of every status colour. It touches every
  screen but changes no behaviour, so it is verifiable by looking.
- **`UX-2`** is the real build: a reading component plus the marks, fed by provenance the system
  already computes and keeps. It needs no new data — that is why it is affordable.
- **`UX-3`** is a day.
- **`UX-4`** is a day to build the component and a slow tail to replace the ad-hoc ones.

The risk worth naming: a visual rebuild is the classic way a product spends a month and ships
nothing. The mitigation is that `UX-2` alone is worth doing even if the other three are
declined — the gutter works on top of today's stylesheet.

---

*No contract wording, clause text, probe questions, or example rows are proposed in this
document. All content in the companion mockup is invented and is labelled as such on the page.*
