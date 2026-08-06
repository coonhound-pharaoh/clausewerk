# Two designs, compared

*The current [UI Design Proposal](UI-DESIGN-PROPOSAL-2026-08-04.md) (with its
[v5 mockup](prototype/v5-concept/Clausewerk%20V5%20Concept.html)) against the
"Legal-Parchment Design Exploration" attachment — `Wireframes.dc.html` (four directions) and
`Registry Desk.dc.html` (a working build of the boldest one). Written 2026-08-04.
Nothing was changed; the attachment was opened, signed into, and clicked through.*

---

## The short answer

**Neither one wins, and the split is unusually clean.** The attachment is the better *design
process* and the better *demonstration of the product's rules*. The proposal has the better
*single idea*. And on the one measure I tested both against — whether the design still works for
a colour-blind reader — **the attachment beats the proposal decisively, at exactly the point the
proposal calls its centrepiece.**

The most useful thing in the attachment is not the built prototype at all. It is direction
`1b`, a sketch nobody built, which contains a better version of the proposal's core idea.

---

## What the attachment actually is

Two files. The first offers **four directions for the same screen at rising boldness**:

| | Direction | Boldness | What it is |
|---|---|---|---|
| `1a` | **COUNSEL** | 3 | Quiet typeset software, parchment as tone. Its own note calls it "safest, least memorable." |
| `1b` | **THE BRIEF** | 5 | Every screen is a ruled legal-pad page with line numbers and a **live margin column** |
| `1c` | **THE FOLIO** | 7 | A bound ledger: stitched spine, edge tabs, wax seals, drop caps |
| `1d` | **THE REGISTRY DESK** | 9 | A physical desk: tied dockets, rubber stamps, carbon-paper redlines |

The second file is a working build of `1d`, the boldest. It runs: I signed in as a requester,
opened a matter, and read a redline.

**Our proposal is a single direction at roughly boldness 3–4** — close to `1a`, plus one
invented mechanism. So the two documents are not really the same kind of thing. One offers a
choice; the other argues a position.

---

## Where the attachment is better

### 1. It offers a choice instead of an answer

Four directions with an explicit boldness dial is a better way to put a look in front of an
owner than one direction with a recommendation. You can point at a rung. Our proposal asks you
to accept or reject a single package, which is a harder decision and a worse conversation.

### 2. It survives the colour-blindness test that our own centrepiece fails

I ran the same check on both: strip the colour out and see what remains.

**The Registry Desk survives completely.** "STILL BLOCKS" and "PAST THE GATE" stay perfectly
distinct in greyscale, because each stamp carries a *word*. The redline stays readable because
the deleted line has a strikethrough and the added line has a plus sign — shape, not hue.

**Our origin gutter collapses entirely.** The mark meaning "a named lawyer approved this" and
the mark meaning "a machine wrote this" become pixel-identical, because they are the same hatch
in two colours.

The attachment's most theatrical direction is more accessible than our most serious one. That is
an uncomfortable result and it is the correct one.

### 3. It shows the governance rules operating, rather than describing them

This is the attachment's real achievement, and it is better than anything in our proposal. It
puts the product's actual rules on screen as interface:

- On the findings list: *"A finding that blocks stays blocking until Legal decides it — asking
  is not being allowed. There is no acknowledge stamp on this desk."* That is `U8`'s retirement
  of the blanket override, drawn rather than stated.
- On the reporting pane: *"A measure is read from the chain, never kept by hand — the figure and
  the record cannot disagree."*
- On access history: *"Reading is an act too: every sit-down at the reading room is on this
  list."*
- On the library: *"A clause version cannot be edited once it exists. The origin is derived from
  where the text came from — you do not choose it."*

Our proposal *asserts* that the screen should mirror the database. The attachment *demonstrates*
it, screen by screen. For a design-partner demo — which you decided on 2026-08-04 should show
the full pipeline — that difference is worth a great deal.

### 4. The sign-in is more honest than ours while being far more attractive

It keeps the development-doorway admission — *"Placeholder people, placeholder deals — the
theatre is real, the data is not"* — inside a genuinely handsome card. Our proposal keeps the
honesty and changes only the setting; the attachment proves you can have both without
compromise.

---

## Where the proposal is better

### 1. The origin gutter is a real idea, and the attachment has nothing like it

This is the proposal's one decisive advantage. In the attachment, provenance lives in three
places, all of them conventional:

- an **ORIGIN MIX** pane for the auditor — percentages in a report,
- a caption under each library clause — *"approved by … · origin: library"*,
- redlines showing what *changed* between rounds.

All three are useful. None of them is what the proposal is reaching for. **A report tells you
the mix; a margin mark shows you, while you read, which words a human stood behind.** That is
the difference between a claim a buyer must be walked through and a claim they can see. Nothing
in the attachment does it.

### 2. It is current; the attachment is not

The attachment encodes the world as it stood before your 2026-08-04 decisions:

- Its origin pane states *"model's words, directly — 0% · no path exists for this to be anything
  but zero."* That is now only true of **contracts**. You decided the same day that sourcing
  documents may carry machine-written passages, labelled. The attachment has no way to show the
  second rule — sourcing, RFP and RFQ are effectively absent from it.
- Its Legal-admin desk has six tabs; the real one has eight.

None of this is a flaw in the work. It is a date.

### 3. It is a written argument, with costs and decisions

The proposal names four decisions, sizes them, and states what it would deliberately not build.
The attachment carries terse notes and no costing at all. If you want to *decide* something
today rather than *look* at something, the proposal is the document that supports that.

---

## The three places they directly contradict each other

These cannot both be adopted. Each needs a ruling.

**Red.** The existing rule — which the proposal keeps — is that red means *error*, never merely
"high severity" and never merely "no." The attachment uses red for **EXECUTED** (sealing wax)
and for **STILL BLOCKS** (a finding that refuses to clear). Both break the rule. The wax
metaphor is genuinely lovely and internally coherent; it is also the thing that makes "red =
something is wrong" stop being readable. **I would keep the existing rule and let the wax seal
be an object rather than a status colour.**

**How many states.** The proposal demands exactly five, with no screen permitted to invent a
sixth. The attachment uses **44 distinct stamp labels** across four inks. These are opposite
philosophies, and the attachment's is more informative — "STILL BLOCKS" and "AWAITING
COUNTERSIGN" each say more than "pending" ever could. But 44 labels is precisely the drift the
five-state rule exists to prevent. **The resolution is to notice they are governing different
things:** fix the *ink* vocabulary at five meanings and enforce it, and let the *words* stay
open. Colour becomes the rule; wording stays expressive.

**Motion.** The proposal permits two animations — the stamp and the strike — on the argument
that a still interface is a truthful one for a product whose promises are about what it refuses
to do. The attachment animates **22 elements**; every sheet flies in. Its own wireframe note
concedes the risk: *"Maximum theatre — risk: charm over scanability for daily use."* **I would
keep the proposal's discipline.** A procurement lawyer will open these screens forty times a
day.

---

## What I would actually do

**Take direction `1b`, "THE BRIEF", and build the origin gutter into its margin.**

`1b` is the sketch nobody built, and it already contains the answer to the proposal's worst
defect. Its layout is a ruled page with a **provenance margin column** down the right side,
carrying notes like *"clause L-408@v2, adopted 2026-05"* and *"asked 2d ago; 3 people told."*
Its own annotation reads: *"every fact's origin lives HERE, never inline — screens stay calm."*

That is the origin gutter — with room for words. Our version tried to compress the same idea
into a four-pixel bar and lost the distinction that matters. `1b` gives it a whole column, which
means origin can be stated in language rather than encoded in hue, which is exactly the fix the
colour test demands. It also sits at boldness 5: memorable enough to carry a demo, calm enough
to work all day.

Concretely, I would:

1. **Adopt `1b` as the base direction**, and keep the proposal's origin idea — implemented as
   `1b`'s margin, not as our gutter.
2. **Keep from the attachment:** the rule-as-interface writing, which is its best quality; the
   word-bearing stamps; the sign-in card.
3. **Keep from the proposal:** red for error only; the motion discipline; the refusals list; the
   accessibility floor; the typographic work.
4. **Borrow sparingly from `1d`:** the seal for execution as a deliberate ceremony, since
   execution really is irreversible — but not the scattered papers or the tilt.
5. **Bring whatever is adopted up to date** — the second rule about sourcing documents, and the
   Legal admin's eight tabs.

---

## Two small things worth knowing

The attachment loads its typefaces from Google's servers, as our own files did until today, and
adds a fifth family (Special Elite) on top. If anything from it is adopted, it inherits the fix
already made — the fonts are self-hosted now, and a new face means adding it to that set rather
than reopening the CDN.

The attachment is a design-canvas document rather than application code. It renders and it
genuinely responds to clicks, but it is a picture that moves, not a build. Nothing in it plugs
into the real app as it stands.

---

*No contract wording, clause text, or example row in either design was reviewed or judged — all
content is placeholder by standing rule. The judgements above are about structure, encoding, and
argument.*
