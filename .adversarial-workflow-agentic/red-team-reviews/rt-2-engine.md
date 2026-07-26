# RT-2 — Red-team review of Plan B (engine, seam, hostile input)

- **assignment_id:** RT-2 · **role:** Red-team reviewer (adversarial) · **mode:** code
- **target:** `.adversarial-workflow-agentic/revision-plans/plan-B-engine.md`
- **contract:** OC-CW-2026-07-25-01
- **date:** 2026-07-25
- **environment:** Python 3.10.11, pyexpat/expat **2.5.0**, Windows 10. Baseline `python -m pytest engine -q` → **104 passed** (Observed).

Default posture: refuted where unverifiable. Every claim tagged.

---

## Claim 1 — "E1: store ladder status; keep it in the hash. A new `cw.snapshot_ladder` header table is needed."

**Verdict: PARTIAL.** The hash decision is right. The "new table is needed" assertion is **refuted**.

### 1a. Keep `status` in the hash — the planner is right

The opposing case, put as strongly as it goes: `status` is not a property of the library, it is a
property of the library *observed at a moment*. `cw.ladder_health` computes it live
(`0003_ladders_and_concessions.sql:86-100`, Observed). A "snapshot of the library" that also freezes
a clock reading is arguably a category error, and the cheap branch — drop it from the hash, document
why — has the virtue that the hash then covers only intrinsic content.

That case fails on one fact. `descend()` refuses any ladder whose status is not `intact`
(`resolution.py:166-168`, Observed). Two libraries differing only in ladder status negotiate
differently. `snapshot.py:63-73` states the codebase's own rule for what belongs in the hash:
"exactly what determines the OUTCOME". `status` determines an outcome. Dropping it would make the id
assert sameness about two libraries that behave differently.

The `selectable` analogy the planner draws also **holds** (Observed): `ladder_health.status` is
derived from `cw.clause_version_state.selectable` via `cw.ladder_rung_state`
(`0003:81-85`), the same clock-dependent field `0005_run_store.sql:6-10` argues cannot be
recomputed later. Same kind of field, same treatment. **Planner right. Say so plainly.**

### 1b. The new header table is not needed for `status` — refuted

The planner asserts a `cw.snapshot_ladder` header table is required, and lists three reasons. All
three are weaker than stated, and the planner never considered the option that removes the
dependency on the database plan entirely.

**`status` is a pure function of rows the snapshot already stores.** Read the view
(`0003:88-98`): status depends only on (i) rung count, (ii) `is_floor` per rung, (iii) `selectable`
per rung clause. `cw.snapshot_ladder_rung` already stores rung count and `is_floor`;
`cw.snapshot_member` already stores the frozen `selectable` for every clause version. I implemented
the derivation against real emitted rows — **Observed**:

```
DERIVED status from stored rows: floor_unusable
```

(fixture: two-rung ladder, floor rung unselectable — the view's own precedence order reproduced
exactly from stored rows, no clock, no new table.)

So there is a **third branch the plan never names**: keep the hash, store nothing new, and *derive*
`status` in `snapshot_from_rows` from the rung rows joined to the member rows. It costs one function,
removes the cross-plan dependency R1, and cannot store a status inconsistent with its own rungs.
Its real cost — a Python re-implementation of a SQL view, free to drift, the same failure class as
M1/M2 — is a legitimate reason to prefer the header table, but the plan must *argue* it, not assert
the table is needed.

**The plan's stated justifications, tested:**

| Planner's reason | Verdict | Evidence |
|---|---|---|
| "a rung-level `status` would be repeated per rung" | Not addressed to the derivation option; true of the column-on-rung option only | — |
| "gives `floor_rung` an explicit home instead of inferring it from `is_floor`, which loses the floorless case … by accident" | **Refuted.** Floorless round-trips correctly today. `loader.py:128` maps missing floor → `-1`; `run.py:183` maps no `is_floor` row → `-1`. Same value, deliberate on both sides, commented at `loader.py:124-127`. | Observed |
| "lets a zero-rung ladder be stored at all — today it vanishes" | **Materially weakened.** A zero-rung ladder cannot enter a snapshot through the production path either: `LADDER_SQL` inner-joins `cw.ladder_rung` (`loader.py:62-63`), so an empty ladder is dropped on the *read* side before it ever reaches the hash. M4 is reachable only from hand-constructed `Ladder` objects. | Observed |

### 1c. The proposed fixture encodes a library state the database cannot produce

The plan's degraded fixture is `Ladder(..., rungs=(...), floor_rung=1, status="degraded")` with, by
its own description, a mirror of the existing intact ladder — i.e. all rungs selectable. Per
`0003:88-98`, all-selectable rungs yield `intact`, never `degraded`. The fixture asserts round-trip
fidelity for a state `cw.ladder_health` can never emit. It will pass, and it will prove less than it
claims. **Consequence:** the fixture must make a rung unselectable in the snapshot, or the test is
theatre.

---

## Claim 2 — "Nine seam mismatches; M2 is the keystone"

**Verdict: PARTIAL.** M1 and M2 are **CONFIRMED and reproduced**. The headline "nine" is inflated
roughly 2.25×: four are defects, five are not. M7 and M9 are as speculative as suspected, and one of
the plan's "verified clean" claims is wrong.

### M1 / M2 / M3 / M4 — reproduced

Probe output (**Observed**, Python, real `snapshot_rows`/`snapshot_from_rows`):

```
EMITTED RUNG ROW KEYS: ['category','clause_id','is_floor','rung','severity','snapshot_id','version']
EMITTED category value: Data Privacy
M3 status lost: intact | id match: False
M2 id match after key substitution: False | Ladder.category = data
M4 empty ladder rung rows: 0
```

- **M1 CONFIRMED** — engine emits `category` (label); column is `category_key` with FK to
  `cw.category(key)` (`0005:41`).
- **M2 CONFIRMED and it is correctly identified as the worse half.** Feeding the key back through
  `snapshot_from_rows` puts `"data"` into the hashed `Ladder.category` and the snapshot id changes.
  The plan is right that this survives the obvious fix.
- **M3 CONFIRMED** — status is silently reset to `intact`, id mismatches.
- **M4 CONFIRMED as emitted-row behaviour, but not reachable in production** (see 1b). Downgrade.

I ran a full mechanical audit of every emitted key against every column of every table in
`0005_run_store.sql` (**Observed**). Result: **`snapshot_ladder_rung.category` is the only
column-name mismatch in the entire write side.** `snapshot`, `snapshot_member`, `ruleset`,
`ruleset_member`, `run`, `run_decision`, `run_finding` all match exactly.

### M7 — "`severity='Baseline'` passes only because the column is unconstrained"

**REFUTED as framed.** The premise is that the "obvious" constraint the database owner would add is
`check (severity in ('Standard','High'))`, mirroring `run_finding`. But the registry's own clause
severity constraint already includes Baseline:

`db/migrations/0002_clause_registry.sql:26` — `check (severity in ('Standard','High','Baseline'))` (Observed)

So the *obvious* constraint for a decision severity is the three-value one, which admits Baseline.
The planner picked the wrong precedent — `run_finding` is a rule-severity column, a different
concept. **Consequence:** R8 is not a live cross-plan hazard, it is a speculative one, and flagging
it at HIGH urgency to the database planner costs orchestrator attention for nothing. Keep the flag,
drop the alarm.

### M9 — "the `taken_on` trap"

**CONFIRMED but correctly self-classified as not a defect.** `snapshot_rows` does emit
`taken_on` in the snapshot row (Observed), and `snapshot_from_rows` does take it as a separate
argument (`run.py:146`). `taken_on` is not hashed (`snapshot.py:74-102`, Observed), so the id
survives. It is an API ergonomics note. **Counting it in a nine-item "mismatch inventory" inflates
the number.** The plan's own text for M5, M6, M7, M8 and M9 says, respectively, "Not a failure",
"Depends entirely on the driver", "Passes today", "never exercised", "No failure … A latent trap,
not a defect". **Five of nine are, by the planner's own words, not mismatches.**

### Errors in the plan's "verified clean" section

> "The `override_needs_ref` constraint (`0005:90`) is satisfied by `ValidationResult` only if …
> — **untested**"

**REFUTED.** `backend/db/test/run-store.test.mjs:101` — `test('an override must name its
authorisation', …)` asserts the constraint rejects the violating insert (Observed). The constraint
is tested from the schema side. What is untested is whether `run_rows` can *emit* a violating row —
a narrower and accurate claim.

### The plan overstates "the write side has no anchor"

> "No write-side integration test exists — `backend/db/test/` contains no counterpart to
> `loader-sql.test.mjs` for `snapshot_rows`/`run_rows`."

**PARTIAL.** `backend/db/test/run-store.test.mjs` exists (235 lines, ~20 tests, Observed) and
covers the run store's constraints, FKs, immutability triggers, RLS scoping, and the reproducibility
view. What it does *not* do is drive those inserts from engine-emitted keys — its INSERTs are
hand-written, and at line 62-65 they correctly use `category_key`, which is precisely how M1 stayed
invisible: **a hand-written JS fixture already drifted from the engine, and the suite went green.**
That is a stronger and more concrete argument for WP-2 than "no test exists", and the plan should
make it. Two green suites, one broken seam — the review's phrase — is right; "no anchor" is not.

### Mismatches the planner missed

| # | Where | Defect | Tag |
|---|---|---|---|
| X1 | `snapshot_from_rows` (`run.py:157-160`) | A `member_row` with no matching `clause_row` is **silently skipped** (`if key not in frozen: continue` covers the reverse case only; a missing clause row simply never appears). The rebuild produces a smaller snapshot and a different id, with no diagnostic. Detectable only because the id mismatches — the same "silent defaulting" failure the plan objects to for `status`. | Observed |
| X2 | `resolution.py:17-26` | `Ladder` is imported and never used — a dead import the plan's E8 list misses. | Observed (AST scan + `grep -n Ladder engine/resolution.py`: only the import at :22 and prose in strings) |

The plan's six dead imports are all **CONFIRMED** by AST scan (`docx.py` `re`, `docx.py` `field`,
`model.py` `field`, `run.py` `asdict`, `validation.py` `field`, `test_loader.py` `STANDARD`).

---

## Claim 3 — "E6 needs no new dependency: billion-laughs *parses* on Python 3.10, and refusing a DOCTYPE is the fix"

**Verdict: REFUTED on the premise, PARTIAL on the remedy. This is the plan's most serious error.**

### 3a. The entity bomb is NOT live. The planner extrapolated from an under-threshold probe.

The planner ran a **3-level** payload, saw it parse to 3,000 characters, and inferred that "a 9-level
payload is the standard billion-laughs and would exhaust memory". I ran the actual payloads
(**Observed**, verbatim output):

```
expat version: (2, 5, 0) expat_2.5.0
BL3 PARSED len 1000
BL7 RAISED ParseError limit on input amplification factor (from DTD and entities) breached ... 
BL9 RAISED ParseError limit on input amplification factor (from DTD and entities) breached: line 1, column 747  0.26s
QUAD RAISED ParseError limit on input amplification factor (from DTD and entities) breached: line 1, column 60467  0.02s
EXT RAISED ParseError undefined entity &x;
```

Expat 2.5.0 ships billion-laughs protection on by default (an amplification-factor limit, added in
expat 2.4.0). The classic nine-level billion laughs is **already rejected in 0.26 s**. Quadratic
blowup — one large entity referenced 40,000 times — is **already rejected in 0.02 s**. The 3-level
case parses only because its amplification factor is below the activation threshold; it is not a
bomb, it is 3 KB of output.

Then I checked the current, **unfixed** `_document_xml` against the real bomb (**Observed**):

```
N9-CHECK: CURRENT (unfixed) code ALREADY raises NotADocx in 0.24s
          -> word/document.xml is malformed: limit on input amplification factor (f...
```

**Consequences, in order of severity:**

1. **Mutation N9 cannot fail.** The plan's N9 is "make the prologue scan always pass" and the test
   that must then fail is `test_an_entity_bomb_is_refused`. That test passes today with no fix at
   all, and it passes with N9 applied. It is a **new mutation that cannot fail** — exactly what this
   review was asked to hunt for. The plan's proposed timing bound ("raised in under a second")
   does not save it: 0.24 s, unfixed.
2. **The plan's summary claim "E6's entity bomb is live, not theoretical. I ran it." is wrong**, and
   it is one of the three items the plan promotes as "worse than the review states". It is not worse;
   on this interpreter it is already mitigated by the standard library.
3. The remedy (refuse a DOCTYPE) remains **defensible as defence-in-depth** — it does not depend on
   the expat version, and expat's limit is a heuristic threshold, not a guarantee. But it must be
   argued that way, and its test must be the *benign* fixture, not the bomb.

**The one entity test in the plan that does have teeth** is `nested_entity_docx()` — a single benign
`<!ENTITY a "hello">`, no recursion. Verified: it parses today (**Observed**, `BENIGN DOCTYPE:
parsed today, text= hello`) and would be refused after the fix. That is the correct N9 target.
Recommend: N9's failing test becomes `test_a_document_type_declaration_is_refused`, driven by the
benign fixture.

### 3b. "Legitimate OOXML never has a DOCTYPE"

**PARTIAL — probably true, and the plan cannot prove it here.** `build_docx` emits none (Observed).
The OPC specification (ECMA-376 Part 2) forbids DTDs in package parts and directs consumers to
reject them, which supports the claim. But there is **no Word installation and no vendor `.docx` in
this environment** (the plan concedes this for E5 fixtures at R4 and should concede it here too).
Tag: **Inferred**, not Observed. Consequence: the plan states it as fact; it should carry the same
"structurally faithful, not captured from Word" caveat it applies to E5, and the failure mode
(refusing a real vendor file) should be a `NotADocx` message a buyer can act on.

### 3c. Does refusing a DOCTYPE stop *all* the attacks? No — and the size cap does not close the gap.

I built a payload with **no DOCTYPE, no entities, and a decompressed size under the plan's proposed
32 MiB cap** (**Observed**):

```
payload MB 33.6, depth 4793490
PARSED 18.7s peak 1333 MB
```

33.6 MB of `<a>` nesting parses for **18.7 seconds** and peaks at **1.3 GB**. Trim it to 31 MiB and
it passes every one of the plan's three defences. Two further probes (**Observed**): 1,000,000-deep
nesting parses in 0.90 s; 200,000 attributes on one element parse in 0.26 s.

**Consequence: the plan's E6 remedy leaves a working denial-of-service on the one door where
untrusted bytes enter the system, and the plan asserts the opposite** ("This kills entity expansion
at the source"). Entity expansion, yes. The attack class, no. The 32 MiB cap was chosen against a
document-size argument ("a 700-page contract … comfortably under 20 MB") with no consideration of
what 32 MiB of adversarial *structure* costs. **Missing defence: an element-depth limit and/or a
wall-clock or memory budget on the parse**, both achievable in stdlib with `ET.XMLPullParser` or a
depth-counting `XMLParser` target. This must be added or the finding disclosed.

### 3d. The zip bomb is real — planner right

**Observed**: a 102,068-byte archive whose `word/document.xml` decompresses to 100 MB parses to a
**344 MB** peak in 0.8 s. Defence 2 (bounded read via `z.open`, not trusting `ZipInfo.file_size`) is
correct and necessary, and mutations N10 and N11 **can** fail. Say so.

### 3e. Nested archives

Not a concern. `_document_xml` reads exactly `word/document.xml` and never recurses into a member
that is itself an archive (`docx.py:148-149`, Observed). The archive-total and member-count caps
(defence 3) are cheap and harmless; note that `MAX_TOTAL_BYTES` over declared `file_size` is
attacker-controlled — the plan already says so.

---

## Claim 4 — "E5 is narrower: `paragraphs()` recurses, so the emit path and the zero-authored-characters counter are safe"

**Verdict: CONFIRMED.** The planner is right, and this is the claim I tried hardest to break.

- `paragraphs()` iterates `for node in p.iter()` (`docx.py:165`, Observed). `Element.iter()` is a
  full recursive descent, so `w:t` inside `w:hyperlink`, `w:sdtContent`, `w:smartTag`, `w:fldSimple`
  or `w:ins` is reached. Only `parse_redlines` uses `for child in list(p)` (`docx.py:267`, Observed).
- `authored_characters()` calls `paragraphs()` (`docx.py:189`) and is only ever applied to documents
  produced by `build_docx`, which emits nothing but flat `<w:p><w:r><w:t>` (`docx.py:70-75`,
  `:108-114`, Observed). Container handling therefore **cannot** affect the count.
- `test_the_document_contains_zero_authored_characters` and its control
  `test_the_counter_actually_counts` both operate on `build_docx` output (`test_docx.py:90-118`).
  S10 is not at risk from WP-6. **Planner right.**

**One correction to the plan's bonus finding.** The plan calls the `w:delText` branch at
`docx.py:169-170` "unreachable" and says "the `elif` is unreachable". It is **reachable** — a
`delText` node fails the `w:t` test and lands in the `elif`. It is a **no-op**, not dead code: it
`continue`s at the end of a loop body. The plan's conclusion (deleted text is excluded by tag
mismatch, not by that branch) is correct; the word "unreachable" is not, and it is tagged `Observed`.

**One thing neither the review nor the plan names.** `paragraphs()` takes `p` from
`root.iter(w:p)` and then calls `p.iter()`. Word nests `w:p` inside `w:txbxContent` (text boxes) and
`mc:AlternateContent`. On such a document the inner paragraph's text is emitted **twice** — once in
the inner `w:p`'s own entry and once inside the outer's. Harmless for `build_docx` output (no text
boxes), but WP-6 is explicitly about real-world Word containers, and a text box is a real-world Word
container. Recommend a fixture. Tag: **Observed** (code shape) / **Inferred** (Word emits it).

The container inventory and the `w:moveFrom`→`del` / `w:moveTo`→`ins` mapping are sound, and the
refusal to recurse into `w:rPr`/`w:pPr` is the correct call — a tracked *formatting* change is not
text. The honesty note about fixture provenance (R4) is the right disclosure.

---

## Claim 5 — "E3: newest selectable version wins"

**Verdict: PARTIAL.** (a) is right and safe. (b) is scope creep the plan does not justify. The
plan's own risk R5 is refuted, and a larger reproducibility question is missed.

### 5a. Does it break byte-identical reproduction of stored runs? No.

I applied the ordering change (`(clause_id, c.version)` → `(clause_id, -c.version)`) to
`resolution.py` and ran the full suite (**Observed**):

```
104 passed in 0.45s
```

**Zero** tests change. **R5 is refuted** — the plan predicts "at most one or two"; the true answer is
none, because **no fixture anywhere in `backend/engine/` contains two versions of the same
`clause_id`** (Observed, grep across `test_resolution.py`, `test_run.py`, `test_docx.py`,
`test_loader.py`). The E3(a) defect is invisible to all 104 tests, which strengthens the case for the
fix and means the plan can promise the change is free.

On the deeper question — is newest-wins right when a contract must be reproducible against a pinned
snapshot? **Yes, and the tension is illusory.** Reproducibility is defined against the *snapshot*, not
against the live registry (`snapshot.py:3-12`). A rebuilt snapshot carries both versions with their
frozen `selectable` flags, so newest-wins re-resolves to the same version it picked at run time.
`test_a_run_reproduces_years_later` (`test_run.py:171-211`) checks `result_hash` equality after
rebuilding — that holds under either ordering, as the 104-pass run shows.

### 5b. The missed reproducibility caveat

Neither the review nor the plan states it: **`result_hash` reproducibility holds only at a fixed
engine version.** Every change in this plan that alters `_resolve_risk` (E3a, E3b, E4) changes the
decisions a *previously stored* run replays to, so `run.result_hash` from before the change will not
match a replay after it — while `snapshot_id` still will. The system stores no engine version
(`0005:70-91` has no such column, Observed). Since no production data exists (A5), this is cheap to
fix now and expensive later. **Recommend: disclose it, and consider an engine-version pin on
`cw.run`.** This belongs in the plan and is absent.

### 5c. E3(b) — ladders set the opening position: scope creep

The review's finding is descriptive: "Ladders declare a preferred rung; resolution never consults
ladders at all." The plan converts that into a **behavioural change** in which an intact ladder's
rung 0 overrides severity matching. Objections:

1. It is not required by any success criterion (S1–S10) and is not in the review's HIGH claim, which
   is about version ordering.
2. It creates a **second, silent selection authority**. Today the reason string tells Legal "Matched
   High variant for Data Privacy". After the change some decisions say the ladder chose — and the
   ladder is a Legal-owned configuration object whose rung 0 may disagree with the severity match.
   Which one is right is a **content** question, not a system question (CLAUDE.md product boundary,
   contract §5.1). The system currently makes no such choice; the plan has it start making one.
3. The plan's guard ("a non-intact ladder is not consulted") means the opening position **depends on
   the clock-derived `status`**, so the same library resolves differently the day a rung expires —
   for a *first* position, not a concession. That is a new coupling of resolution to ladder health
   that `descend()` deliberately confines to descent.
4. It further inflates 5b: E3(b) changes the resolution of every category that has a ladder.

**Recommendation: split E3(b) out of WP-3 and surface it as an approval-sensitive product decision,
not a defect fix.** E3(a) can and should proceed.

### 5d. E4 side-effects

- **R7 is refuted.** The plan worries that new unresolved decisions may flip the gate.
  `validation.py:188-192` (Observed): `blocking = [f for f in findings if f.severity == HIGH]`;
  `gate_open = (not blocking) or overridden`. The gate is a pure function of findings and never reads
  `Resolution.unresolved`. Adding unresolved decisions **cannot** flip it. Drop R7.
- **Missed interaction:** `_resolve_risk` excludes `always_include` clauses from the risk pool
  (`resolution.py:96-97`). Under E4, a manifest naming a category whose baseline clause has lapsed
  produces **two** decisions for that category — one gating baseline decision and one risk decision.
  Both go into `cw.run_decision`. Decide and document which the report shows.

---

## Claim 6 — "E8: the vacuous test is `test_docx.py:126`"

**Verdict: CONFIRMED.** Tagged `Inferred` by the planner; I am upgrading it to Observed on the
substance and correcting the citation.

The review's words are "a substring-match test that asserts nothing" (`docs/REVIEW-2026-07-25.md:199`,
Observed). The only test in `backend/engine/` that is a bare substring match asserting a *negative*
is:

`test_docx.py:121-126` — `test_an_unresolved_risk_is_omitted_not_invented`, whose entire body after
the fixture is `assert "INSURANCE" not in text.upper()` (Observed).

It passes on an empty document, on a build that produced nothing, and on any regression that drops
all sections. **Line 126 is the assertion; the test begins at line 121** — cite the test by name, not
by the assertion line, or WP-8 will edit the wrong anchor.

I searched for a better candidate and found none. `test_deleted_text_is_not_part_of_the_document`
(`:268-273`) does assert both a negative and a positive (`"24" not in`, `"72" in`) — loose, worth
anchoring, but it is not "asserts nothing". `test_the_document_xml_parses` (`:74-76`) is weak but is
not a substring match. **The planner's reading is right, and strengthening both is the right call.**

---

## Missed issues (independent hunt)

| # | Issue | Where | Tag |
|---|---|---|---|
| I1 | **Mutation N9 cannot fail** (see Claim 3a). A new mutation that a reverted fix would not break. | plan §New mutations | Observed |
| I2 | **No element-depth or parse-budget defence.** 31 MiB of nesting, no DOCTYPE, passes every proposed E6 check and costs ~18 s / ~1.3 GB. | plan §E6 | Observed |
| I3 | **Dead import missed:** `Ladder` in `resolution.py:22`. | `engine/resolution.py` | Observed |
| I4 | **`snapshot_from_rows` silently drops a member with no clause row** (X1). Fails as a mysterious id mismatch, not a diagnosis. | `run.py:157-160` | Observed |
| I5 | **`result_hash` reproducibility is not pinned to an engine version** (5b). Three work packages in this plan change it. | `0005:70-91` | Observed |
| I6 | **Nested `w:p` (text boxes) double-counts text in `paragraphs()`** (Claim 4). In scope for WP-6, unlisted. | `docx.py:163-171` | Observed / Inferred |
| I7 | **`override_needs_ref` is already tested** (`run-store.test.mjs:101`); the plan says untested. | `db/test/run-store.test.mjs` | Observed |
| I8 | **The proposed degraded-ladder fixture is an impossible library state** (Claim 1c). | plan §E1 tests | Observed |
| I9 | **WP-9 is a bottleneck.** WP-9 depends on all eight packages and owns the only file that may not be edited by others, so no mutation lands until everything else is done — i.e. no protection is *proven* until the very end. Consider letting each WP add its own mutation entry under a merge convention. | plan §work packages | Inferred |
| I10 | **N4 has no home.** The plan itself notes N4 is proved by a Node test while `mutation_check.py` is Python, and defers the decision. Unowned at plan exit. | plan §New mutations | Observed |

---

## Blocking objections

1. **E6's premise is factually wrong and one of its mutations is inert.** Rewrite the E6 section:
   the classic billion-laughs and quadratic blowup are already rejected by expat 2.5.0 on this
   interpreter (0.26 s / 0.02 s, unfixed). Repoint N9 at the benign-DOCTYPE fixture. Remove the
   "live, not theoretical / worse than the review states" framing.
2. **E6 leaves a working denial-of-service.** A no-DOCTYPE, sub-cap, deeply-nested payload costs
   18.7 s and 1.3 GB. Add a depth limit or a parse budget, or disclose the residual risk explicitly.
3. **"A new `cw.snapshot_ladder` table is needed" is unproven,** and it is the sole basis for
   cross-plan dependency R1 on E1. `status` is derivable from rows already stored. Either argue the
   table on drift-risk grounds or take the derivation branch and delete the dependency.
4. **E3(b) (ladders set the opening position) is scope creep with product-boundary implications.**
   Split it out; it is not the review's finding and it makes the system choose between two
   Legal-owned positions.

## Non-blocking concerns

- "Nine seam mismatches" is inflated; five of the nine are non-defects by the plan's own text. Report
  four (M1, M2, M3, M4-downgraded) plus X1.
- M7 cites the wrong precedent (`run_finding`, a rule severity) when `cw.clause` already permits
  `Baseline` (`0002:26`). Lower R8 from a live hazard to a note.
- M4 is unreachable through `LADDER_SQL`'s inner join; say so rather than implying live data loss.
- "The write side has no anchor" understates `run-store.test.mjs`. The stronger, true argument is
  that its hand-written INSERTs already used `category_key` and so hid M1 — use that.
- R5 and R7 are both refuted by measurement; delete or restate them.
- The plan calls the `w:delText` branch "unreachable"; it is reachable and vacuous.
- Cite `test_an_unresolved_risk_is_omitted_not_invented` by name, not `test_docx.py:126`.

## What the plan gets right

Stated plainly, because false objections cost more than missed ones.

- **The E1 hash decision is correct and the reasoning is the right reasoning.** `status` is
  outcome-bearing via `resolution.py:166`, the `selectable` analogy genuinely holds, and dropping it
  from the hash would let two differently-behaving libraries share an id. The plan is right to
  refuse the proposal's cheap branch and right to record it as a decision.
- **M2 is correctly identified as the keystone**, and correctly identified as the failure that
  *survives* the obvious fix to M1. I reproduced it. This is the single best catch in the plan.
- **M1, M3 and M4 are all real and reproduced.** The mechanical audit found no write-side column
  mismatch the plan missed.
- **Claim 4 is right, and it is the claim that mattered most.** The zero-authored-characters property
  is genuinely unaffected by E5; S10 is not at risk. Correcting the review's over-statement here is
  exactly the job.
- **The zip-bomb half of E6 is real and the defence is correctly designed** — bounded read via
  `z.open`, refusing to trust `ZipInfo.file_size`, with a `lying_header_docx` fixture and a
  legitimate-large-document control. N10 and N11 can fail.
- **Rejecting `defusedxml` is the right call**, and for a better reason than the plan gives: it is
  not needed at all for the entity class on this interpreter, and refusing a DOCTYPE is stricter
  than what it offers. No approval spend for a weaker guarantee.
- **E5's container inventory and the `moveFrom`→del / `moveTo`→ins mapping are sound**, including the
  refusal to recurse into `w:rPr`/`w:pPr` and the decision not to add a `Segment.kind`.
- **The fixture-provenance disclosure (R4)** — "structurally faithful to the schema, not captured
  from Word" — is the honest thing to do and should be extended to the DOCTYPE claim.
- **E4's remedy respects the product boundary correctly**: make the gap visible, route it to a named
  person, do not fill it.
- **E7's design is right on the point that matters** — a dropped hallucinated category must never
  surface as a library coverage gap, and N16 is the mutation that proves it.
- **The dead-import list is accurate** (six of seven; `Ladder` missed) and the `at_floor` analysis is
  correct: `accepted is not None and rung is not None` is true of every successful descent, and the
  only caller-shaped reference is a same-named local at `resolution.py:188`.
- **The plan's own disagreements section is well-judged**, particularly its refusal to guess which
  test the review meant and its decision to strengthen both.
