# Proposal Review Report — the UI Design Proposal

*Adversarial review of [`UI-DESIGN-PROPOSAL-2026-08-04.md`](UI-DESIGN-PROPOSAL-2026-08-04.md)
and its companion mockup
[`prototype/v5-concept/Clausewerk V5 Concept.html`](prototype/v5-concept/Clausewerk%20V5%20Concept.html).
Written 2026-08-04. Nothing was changed — this is a review only.*

---

## The verdict in one paragraph

**The proposal is sound in its central idea and wrong in several of its supporting facts.**
The big idea — make the origin of every word visible on screen — is the right idea, it is
genuinely the thing no competitor offers, and it should be built. But the proposal argues for
it using three claims that do not survive checking against our own records, and the mockup it
points to contains a defect in exactly the place the idea matters most: the mark that says
*"a lawyer approved this"* and the mark that says *"a machine wrote this"* are the same shape
in two different colours. That is the one distinction the whole product is sold on, and as
drawn it fails the proposal's own colour-blindness rule. **Recommendation: accept the
direction, fix four things before anyone builds it, and treat one item as a legal question
for counsel rather than a design decision.**

---

## What to keep — this is the majority of it

**Keep the central idea (§1, §3.2 in concept).** Showing where every word came from, in the
document itself rather than in a report someone runs afterwards, is the strongest thing in
the proposal. The supporting logic is sound and I verified it: the two rules it rests on were
genuinely settled on 2026-08-04 — contracts carry zero machine-written characters, sourcing
documents may carry machine-written passages that are labelled (*Observed*, `memory.md` S225).
The point that a machine-authored mark appearing on a contract would be *structurally
impossible*, and therefore a visible defect if it ever appeared, is a real and valuable
property.

**Keep the four honesty rules (§2).** Red for error only, pending never green, a check that
never ran looking different from a pass, and empty screens that admit they are empty. These
are the best things in the current design and the proposal is right to protect them.

**Keep the refusals list (§6).** No notification bell, no avatars, no decorative charts, no
confetti, no quick-approve. Every one of these will be asked for eventually, and writing down
now why the answer is no is worth more than the design work itself.

**Keep the typography work (§3.6)** — a fixed line width, clause numbers in the margin, and
defined terms you can hover to see the definition. The last one is genuinely useful to someone
reading a contract all day and nobody else in this market does it.

**Keep the "almost no motion" rule (§3.8).** The reasoning given — that our promises are mostly
about what the system *refuses* to do, so a still interface is a more truthful one — is the
best argument in the document.

**Keep the sign-in screen as-is (§4).** I verified the claim: the screen really does say
*"There is no password yet. This is a development doorway"* (*Observed*,
`prototype/v4/app/shell.jsx:159`). Keeping that wording is right.

---

## What to change — five items, in order of importance

### 1. The centrepiece has a colour-blindness defect. Fix before building.

In the mockup the four origin marks are a 4-pixel-wide vertical bar
(*Observed*, mockup lines 189–197):

| Mark | How it is actually drawn |
|---|---|
| Approved library language | solid green bar |
| Negotiated fallback | green bar with a small gap in it |
| Machine-drafted, lawyer-approved | diagonal hatch, **green** |
| Machine-authored, labelled | diagonal hatch, **amber** |

The last two are *the same pattern in two different colours*. That is the single most important
distinction in the product, and green-versus-amber is precisely the pair that the roughly one
man in twelve with colour-blindness cannot separate — a fact the proposal itself cites in §5
while breaking the rule in §3.2.

**I confirmed this by looking, not by reasoning.** I opened the mockup and drained the colour
from the page, which approximates what a colour-blind reader gets from this pair. The two marks
become **visually identical** — both render as a thin dashed vertical rule with no remaining
difference of any kind. The distinction between *"a named lawyer approved this"* and *"a machine
wrote this"* disappears entirely (*Observed*, mockup viewed 2026-08-04 with colour removed).
Separately, a diagonal hatch inside a 4-pixel column is marginal even in full colour, and the
proposal promises the interface works at 200% zoom, where it degrades further.

**Change:** give the two machine states genuinely different shapes, not different colours, and
make the gutter wide enough to read. Colour may reinforce the difference; it may not carry it.

### 2. The gutter may be solving a problem the caption already solves.

Every clause in the mockup already carries a plain caption beneath it saying where the words
came from (*Observed*, mockup lines 424, 437, 449). Those captions are clear and do the job.
So the honest question is what the 4-pixel bar adds. My answer: it adds *scanning* — the
ability to see the mix of a forty-page document at a glance without reading forty captions.
That is real value and worth keeping. But it means the gutter must be judged as a
**scanning aid**, and a scanning aid that cannot be read at a glance is decoration.

**Change:** state plainly that the caption is what proves origin and the gutter is what makes
the pattern visible. That reframing also makes the "fix the encoding" work above obviously
necessary rather than optional polish.

### 3. Three factual claims do not hold. Correct them before this goes in front of anyone.

- **The stylesheet freeze is attributed to the wrong decision.** The proposal says §3.1 and
  `UX-1` retire "the base stylesheet stays untouched rule from decision `U8`." What `U8`
  actually says is narrower: *"This is a reorganisation, not a restyling — no budget is spent
  on tokens, type, chips or buttons"* (*Observed*, `memory.md:1004-1005`). That was a spending
  limit on one project, not a standing architectural rule. The "base.css untouched, additions
  only" convention comes from a different record, `S95` of 2026-07-28 (*Observed*,
  `memory.md:2970-2982`). **You are being asked to retire a rule that the named decision does
  not contain.**

- **The proposal misses what `S95` was actually protecting.** `S95` deliberately put the whole
  parchment look in one removable file, so that *removing a single line restores dark mode
  exactly*. The proposal's §3.1 rebuild would destroy that one-line reversibility without
  mentioning that it exists or that it was a deliberate goal. That may still be the right
  trade — but it should be a decision you make knowingly, not a property you lose silently.

- **The "four status widgets already drifted" story is about different components, and it was
  already fixed.** The real event was four near-duplicate *stat-tile* components — the "what is
  waiting on you" counters — and they were consolidated by work package `WP-U07`
  (*Observed*, `prototype/v4/app/common.jsx:1-7`). The proposal borrows that history to argue
  for a *status-state* vocabulary, which is a different component class. The argument for
  `UX-4` may still be good on its own merits; the precedent as cited is not accurate.

### 4. The proposal understates the current state, which makes its cost estimate optimistic.

§3.1 describes today's look as "a frozen dark stylesheet plus a parchment layer." The reality
is four stylesheets loaded in sequence — Tailwind, then base, then v4, then parchment — plus a
web-font request pulling five type families, of which two render only if the parchment layer is
removed (*Observed*, `prototype/v4/index.html:18-35`; `parchment.css:52-58`). Those two are not
leftovers — they are the dark-mode faces, kept deliberately so `S95`'s one-line reversal still
works. That is a reasonable trade, but it is a cost `UX-1` would have to either keep paying or
consciously give up. The diagnosis is directionally right and
the case for cleaning it up is actually *stronger* than the proposal argues. But the §8 estimate
of "a week" for `UX-1` is measured against a two-layer problem, not the four-layer one that
exists.

**Change:** re-state the current condition accurately and re-size `UX-1` against it.

### 5. Amber is being asked to mean three different things.

The proposal uses amber for *pending*, for *machine-authored*, and — in §3.5 — for *how long
something has been waiting*. The mockup does exactly this: the waiting-row age bar uses the same
amber token as the pending chip and the machine-authored mark (*Observed*, mockup lines 40, 139,
155, 197). A person seeing amber on a screen cannot tell which of the three meanings applies
without reading further.

**Change:** age is not a status. Render waiting time in a neutral tone that is not part of the
status vocabulary at all, or express it by weight rather than by the status colour.

---

## One thing that is not a design decision at all

§3.7 justifies a permanent machine-disclosure label by stating that "European transparency duty
applies from 2 August 2026." **This contradicts our own recorded position.** On 2026-07-25 you
decided against disclosing AI-drafted origin to counterparties, and the record states that we
checked and found no US or EU rule requiring it for business-to-business contract language a
lawyer approved, that the EU AI Act's transparency rules aim at chatbots and synthetic media
rather than contract text, and that the question is **to be confirmed with counsel**
(*Observed*, `memory.md:344-356`).

The proposal turns an open legal question into a settled design mandate without flagging that
it does so. There is also a boundary it never draws: the gutter is correctly kept off the
exported contract, but a sourcing document *is sent to suppliers*, and the proposal never says
whether the machine-authored labels travel with it. **That is a question for counsel and for
you, not for a designer.** I recommend the internal-screen labelling proceed regardless — it
is plainly right — and that anything counterparty-facing wait for a legal answer.

*Unverified:* I did not independently confirm the 2 August 2026 date. Our own record is the
better authority here, and it says confirm with counsel.

---

## A risk nobody in the proposal mentions — now fixed

The entire visual argument in §2 — that the product should *look like a system of record* —
rests on three typefaces that are fetched from Google's servers every time a page loads, in
both the real app and the mockup (*Observed*, `prototype/v4/index.html:19-21`,
mockup lines 14–16). Two consequences worth a moment of your time:

- A contract-governance system used behind a corporate firewall or in a privacy-sensitive
  environment is making an outbound call to a third party on every page view.
- If that call fails or is blocked, the typography silently falls back and the whole "sober
  system of record" impression the proposal is built on disappears.

Self-hosting the fonts is cheap and removes both problems.

**Done on 2026-08-04, at Mike's instruction.** The five families now live in the repository at
[`prototype/v4/app/fonts/`](prototype/v4/app/fonts/) — 18 files, 645 KB, latin and latin-ext
subsets, under the SIL Open Font License with the licence text bundled alongside as the licence
requires. Both the application and the mockup load them locally; neither makes any request to
Google. Verified in a browser: all 36 font definitions register and the ones the page renders
report loaded, with the typography visually unchanged.

**One related thing was found and deliberately not fixed.** The application also loads React,
ReactDOM and Babel from `unpkg.com` (*Observed*, `prototype/v4/index.html:23-25`). Those carry
integrity hashes, so they cannot be altered without the browser noticing — but they are the same
kind of outbound call to a third party on every page load, and unlike the fonts, **the
application does not run at all if that call fails.** It is a larger job than the fonts and was
outside what was asked for. It is recorded in
[`prototype/v4/app/fonts/README.md`](prototype/v4/app/fonts/README.md) so it is not lost.

---

## What I would do about the four decisions

| # | The proposal asks | My recommendation |
|---|---|---|
| `UX-1` | Rebuild the look as one set of definitions | **Not yet.** The goal is right but the decision is mis-drafted: it names the wrong record, and it silently gives up the one-line reversibility `S95` was built to protect. Re-draft it honestly and re-cost it against four stylesheets, then decide. |
| `UX-2` | Build the origin gutter | **Yes — with the encoding fixed first.** This is the one that earns its keep. Do not build it as drawn. |
| `UX-3` | Left rail for the two Legal workspaces | **Yes.** I verified the counts: Legal admin really has eight tabs, requester six, viewer one (*Observed*, `prototype/v4/app/shell.jsx:22-78`). Note one inconsistency to tidy: the proposal's stated rule is "tabs for five or fewer," but it then exempts the requester, who has six. Pick one. |
| `UX-4` | Adopt the five-state vocabulary | **Yes, but on its own merits.** The supporting story is inaccurate (see change 3). The idea is still good — just argue it as prevention rather than as a repeat of something that already happened. |

---

## How this review was produced, and its one weakness

This was intended to run as seven independent reviewers — three examining the proposal through
different lenses without seeing each other's work, three trying to knock down their findings,
and one adjudicating what survived. **That did not happen.** Two attempts failed on usage
limits: the first exhausted Fable 5 credits, the second hit a session limit that resets at
9pm. Roughly 620,000 tokens were spent across the two failed attempts and produced no output.

I therefore ran the same review myself, sequentially, which is the documented fallback — and it
carries a real weakness you should weigh: **the findings above have not been independently
challenged.** Every factual claim is checked against a named file and line, so the evidence is
verifiable. But where I have exercised judgement — that the gutter is worth keeping, that
amber is overloaded, that `UX-1` should wait — a genuinely independent reviewer might disagree,
and none was available to try.

If you want the adversarial version, it can be re-run after 9pm.

*One further limit worth naming: no contract wording, clause text, or example row was reviewed,
since all content is placeholder by your standing rule. The mockup itself was opened and
inspected visually, so the legibility findings are observations rather than predictions.*
