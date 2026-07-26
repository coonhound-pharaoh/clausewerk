# Handoff · Negotiation

**State: specified, not built.** The newest and largest workstream. Written in
the last session from the owner's brief; nothing is implemented.

---

## 0. Ground rules (repeated in every handoff — read them)

**The owner is Mike.** `CLAUDE.md` at the repo root auto-loads and is binding:
simple solutions; **plain business language, never developer jargon**; important
decisions recorded in [`../../memory.md`](../../memory.md) in plain language;
naming and branding are the owner's alone.

**The invariant**, as amended by
[ADR-0010](../decisions/ADR-0010-ai-drafted-clause-candidates.md):

> No contract language reaches an agreement without a named human's approval,
> and the origin of every clause is recorded on it permanently.

**Every guarantee has a mutation check** that deliberately breaks it and confirms
the tests notice. Eleven real faults have been found that way. Add yours.

---

## 1. What this workstream is

The existing system handles *a* redline: one upload, matched against the library.
That is a feature, not a negotiation. A real negotiation is six rounds over
eleven weeks, on either party's paper, with positions that move and get revisited.

The owner's brief, verbatim in effect: capture every round; support supplier paper
by atomising it with AI **for that agreement only**; run each round through
identification, categorisation and risk analysis; and present alternatives from
the clause library.

Specification: [`../../NEGOTIATION-ARCHITECTURE.md`](../../NEGOTIATION-ARCHITECTURE.md).

## 2. The four things to build

### Rounds and positions

A **round** is immutable once closed: the document as exchanged, its SHA-256,
direction, date, sender.

A **position** is the thread connecting rounds — one contested point from first
raised to finally settled. This is the piece that is easy to skip and expensive
to add later: without it, a point held in round 2 and revived in round 5 looks
like a brand-new redline, and the buyer negotiates it twice without noticing.

### Supplier paper

**This reverses an earlier exclusion.** The lifecycle spec originally excluded
third-party paper; the owner asked for it, scoped to one agreement.

AI decomposes their template into clause-like units so the rest of the system can
categorise, assess and compare. The hard boundary:

> Atomised supplier clauses are scoped to one agreement. Never selectable, never
> in the library, never in a document we assemble.

They carry `origin: external` and live beside concessions in the quarantine.
Every unit keeps a **character range back into the source document** — an
atomisation that cannot point at its source is a bug, not a clause.

### Round analysis

Seven steps, in order, each separately visible: parse → identify → categorise →
assess risk → compare to our position → offer alternatives → recommend.

Steps 1, 5 and 6 are deterministic. **Step 6 is the point of the whole
workstream** — the buyer sees our opening position, the available ladder rungs,
where the floor is, and what we conceded on comparable deals, all computed from
stored records. Step 7 is advice and must be labelled as such.

### The Clause Library Builder

Covered in [`02-clause-library.md`](02-clause-library.md), including **the
unresolved owner decision about the published claim**. Read that before starting
it.

## 3. What constrains you

- **The trust boundary is unchanged.** Categories are enum-constrained; unknown
  ones are dropped, exactly as at the manifest boundary. That filter fails
  *closed* — if the category list is unavailable, refuse the model output and
  fall back, do not pass it through.
- **Every inference call needs a deterministic fallback**
  ([ADR-0005](../decisions/ADR-0005-deterministic-fallbacks.md)). For supplier
  paper that is: split on headings and numbering, categorise by keyword rules,
  mark everything low-confidence. The negotiation still runs; the buyer just gets
  less help.
- **One redline per changed paragraph** ([ADR-0007](../decisions/ADR-0007-one-redline-per-changed-paragraph.md)),
  already implemented in `engine/docx.py` and tested. Reuse it; do not write a
  second parser.
- **Below the floor always escalates.** No score, threshold or recommendation
  gets past it.

## 4. What already exists that you should build on

- `engine/docx.py` — redline parsing, one per changed paragraph, with segments in
  document order, `accepted_text` (keep + insert, deletions dropped), author and
  date. Working and tested.
- `cw.concession` and the quarantine pattern — supplier paper should reuse its
  shape, not invent a parallel one.
- `cw.run` / `cw.snapshot` — a round we issued points at a run, which pins the
  library it drew from.
- `cw.ladder_health` and ladder descent — the alternatives step is mostly reading
  these.

## 5. Traps

- **Atomisation is inference over prose we did not write.** The quarantine keeps
  it out of the library; it does not make the categorisation correct. That is why
  every unit must point back at its source text.
- **Do not let atomised supplier clauses become selectable.** The concession
  quarantine has a mutation check guarding the equivalent property; write the
  same one here.
- **Positions must not be inferred silently.** If the model cannot say which
  position a change touches, open a new one and let a human merge — never guess
  a merge, because merging two positions loses the history of both.
- Cross-round trades are invisible. Vendors concede one point to win another and
  the position model tracks them individually. Known gap; do not paper over it
  with a heuristic.

## 6. Where to start

1. Read the NA end to end, then ADR-0007 and ADR-0010.
2. **Rounds and positions first.** They are pure schema, need no AI, and
   everything else hangs off them. Building analysis before positions means
   rebuilding it.
3. Then supplier-paper atomisation, with the deterministic fallback written
   *first* — it is the specification of what atomisation must produce.
4. Alternatives before recommendations. Alternatives are computed and valuable
   on their own; recommendations are advice on top.
