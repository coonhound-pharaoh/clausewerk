# Eliminating checks that police content · 2026-07-27

**Mike's instruction:** *"Try to eliminate checks policing it."* — following the
`CLAUDE.md` rule that all content is placeholder pending review, and its
corollary that a test checks what the system **does**, never the words on a
screen or in a message.

## What was counted

A full inventory of every assertion in the test suites, classified three ways:

| | Class | Count |
|---|---|---|
| **(a)** | **Pure content** — asserts only that a human-readable sentence exists. Eliminate. | **55** |
| **(b)** | **Content proxy** — uses a display string to stand in for a behaviour that could be checked directly. Rewrite. | **222** |
| **(c)** | Legitimate — the string *is* a system fact: an error code, a field name, an endpoint path, a role name, an event type, a test handle. Keep. | **830** |
| | **Total assertions** | **1,107** |

Plus, in the break-it harnesses: 4 rows that mutate prose and are caught by a
prose assertion (both sides content), and 21 rows anchored on a sentence.

Clean already, nothing to do: `audit-chain.test.mjs`,
`views-are-not-policies.test.mjs`, `test_loader.py`, `test_sessions.py`,
`test_no_identity_survives.py`, `test_identity.py`, `test_retirement.py`.

## Done in this pass

**Roughly twenty of the 55, chosen for danger and for clarity rather than for
count.** Every one verified against a green suite.

| Where | Was | Now |
|---|---|---|
| `shell.test.mjs` · empty/failed states | required the sentences *"no endpoint behind this pane"*, *"could not ask"* | the components exist and every pane handles a failure — already asserted alongside |
| `shell.test.mjs` · revoke timing | **whole test**: required *"at their next request"*, banned *immediately / at once / instantly* | **retired.** When revocation bites is a property of the service, proved by `test_revocation_bites_at_the_next_request` and its own mutation row |
| `shell.test.mjs` · dormancy | banned *last seen / last sign-in / last login*, required *"recorded act"* | reads the recorded-act **fields**, and asserts no sign-in field exists anywhere to measure from |
| `shell.test.mjs` · the empty approval box | **whole test**: required *"Deliberately empty"* | **retired.** That the box starts empty is asserted directly, one test above |
| `shell.test.mjs` · minting confirmation | required *"This is what will be minted"* and *"cannot be edited once it exists"* | the confirmation exists, renders the actual wording, and **minting is reachable only from inside it** — a claim the copy check could never make |
| `shell.test.mjs` · watcher authority | **whole test**: required *"no vote"* | **retired.** A watcher holds no grant on any decision surface; the whole-schema sweep already proves it |
| `shell.test.mjs` · no approve-all | required the sentence *"There is no approve-all"*, banned the words *"approve all"* — one keystroke from colliding | enumerates the decide calls: each names exactly one finding, none takes a collection |
| `shell.test.mjs` · retired override button | banned button **labels** including `'force'` | enumerates forbidden **calls** and the ask control's test handle |
| `shell.test.mjs` · asking ≠ allowed | **whole test**: two verbatim sentences | **retired.** Enforced by privilege; the row that makes the screen call `openOverrideGate` is the real check |
| `shell.test.mjs` · rejected finding | required the label *"still blocks"* — which the undecided branch also said, so the words could not tell them apart | asserts the **class**: a rejected finding never renders in the approved colour |
| `health.test.mjs` · retention tile | required *"actioned by the Administrator"*, banned *"Legal admin"* — **and a comment defending the practice**: *"the tile's own copy IS part of the test, and that is the point rather than decoration"* | copy assertions removed, the comment replaced with why that instinct was wrong. The authority is proved by the privilege, below it in the same test |
| harness · 7 rows | mutated a sentence, caught by a sentence | 4 removed, 3 re-anchored on a class, a field read, or a handle |

### `'force'` deserves its own line

The retired-button check banned the substring `force` in every button label and
test handle on a **contracts** screen. The first control to mention *Force
majeure* — an ordinary clause category — would have failed the build. And the
inverse: renaming the button while keeping the handler would have **passed**. It
was strictly worse than no check.

## What remains, and the one lever that does most of it

**The 222 (b) rewrites are not spread evenly — about 140 of them are one
pattern.** Every database suite has a helper of the form
`throws(fn, match, msg)`, which asserts `err.message.includes(match)`:

- **159** call sites match on **English prose**
- **54** match on a **constraint or trigger name** — `predicate_grammar`,
  `rejection_needs_a_note`, `successor_is_newer` — which is the correct form and
  is already immune to rewording

**Two changes retire nearly all of the 159:**

1. **Give every guard a stable error code** and match on that. The schema
   already raises deliberate codes in places (`insufficient_privilege` is read
   by the doorway's classifier and needs no maintenance as more rules are
   written) — this extends the same discipline to the rest.
2. **House rule: after every refused write, assert the target state is
   unchanged.** Several tests today prove only that *something* raised.

The engine has the same shape at the Python layer: `NotADocx` covers seven
distinct refusals and `RuleGrammarError` six, each told apart only by its
sentence. Adding a `code` attribute to those two, plus a code on
`Decision.warning`, retires **41 of the engine's 55**.

## Exposures worth naming, because they will fail on the first rewording

These read seeded clause bodies, category labels, and contract sentences
retyped into the assertion:

- `writer-sql.test.mjs` — four category labels, one engine reason sentence
- `review-queue.test.mjs` — clause, draft and note wording (5 places)
- `run-store.test.mjs`, `executed.test.mjs`, `administrator.test.mjs` — clause bodies
- `library-ladder-views.test.mjs`, `loader-sql.test.mjs` — category labels, a rung title
- `test_docx.py` — retyped contract sentences (9 places), and the structural
  allowlist retypes the builder's own chrome, so **retitling the document fails
  the character count**

The many `d.selected.body in text` assertions in `test_docx.py` are **fine** —
they derive the expectation from the fixture rather than retyping it, which is
the pattern the rest should follow.

## The structural hazard to fix alongside

`db/test/mutation-check.mjs` treats an absent `find` pattern as a **fatal stale
check that aborts all 219 rows**. Every row still anchored on a sentence
therefore converts a correct copy edit into a red build — the rule's failure
mode, with the blast radius of the entire gate. That is the argument for
finishing the (b) list rather than leaving it.
