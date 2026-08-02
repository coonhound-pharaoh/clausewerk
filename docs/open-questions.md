# Open questions

What the architecture does **not** settle, and what has since been decided.

Distinct from [`spec-vs-implementation.md`](spec-vs-implementation.md), which tracked places the
code disagreed with the spec (all now resolved). These are places the *spec itself* was silent,
underspecified, or in tension with its own premises.

| # | Question | Status |
|---|---|---|
| 1 | Auto-approve vs. the audit story | **Decided** — [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) |
| 2 | Who may override the validation gate | **Decided and BUILT** — [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md), `0015` |
| 3 | Clause expiring mid-flight | **Decided** — [LCMA §2](../LIFECYCLE-ARCHITECTURE.md), warnings implemented |
| 4 | The redline matcher's production form | **Decided** — keyword scorer is retained as the fallback |
| 5 | Who authors validation rules | **Decided** — attorneys, through a Legal gate |
| 6 | Ticket routing and assignment | **Deferred** — documented below, not now |
| 7 | Supersession | **Decided** — [ADR-0009](decisions/ADR-0009-concession-is-not-supersession.md) |
| 8 | Lifecycle management | **Architected** — [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md) |
| 9 | Clause library — concessions, ladders, negotiation intelligence | **Architected** — [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md) |
| 10 | Smaller gaps | Deferred |

*Numbering note: the original §9 "smaller gaps" moved to §10 when the clause library took the
number. Every other number is stable — they are referred to by number in conversation.*

---

## Owner decisions — all eight settled ✅

These were never architecture questions. They were choices only the business owner could make, and
the system deliberately did not make them. **All eight are now settled** — U1–U4 on 2026-07-26,
and U5–U8 the same day when the UI redesign raised four more. They are recorded as rows
in `cw.governance_setting` with the reasoning attached, not only here — a decision in a document
gets read once; a decision in the schema is met by whoever next touches the thing it governs.

| # | Decision | Settled as | Where it is enforced |
|---|---|---|---|
| `U1` | **Which positions a renewal opens from** | **From the agreement as executed**, with the drift report alongside. Counterparties expect last year's deal as the starting point. Restarting from current library standard stays fully built and reachable as an explicit, recorded choice | `cw.governance_setting`, `cw.open_renewal()`, `0011` |
| `U2` | **May a statement of work contradict its master** | **Yes — with the same approval a concession needs**, and one category at a time. Not never, and not freely | `cw.sow_hangs_off_a_master()`, `cw.sow_override*`, `0012` |
| `U3` | **What the database owner account maps to** | **No application role.** Governed acts run as a named role | `cw.app_role()`, `0001` |
| `U4` | **The unedited-approval-rate threshold** | **Deliberately unset.** Measured and shown from day one; nothing is blocked on it. Legal sets the number with counsel, against real data | `cw.review_quality`, `0008` |
| `U5` | **The Administrator's boundary** | **Steward, with sight.** The role runs the machine — accounts, grants, operational settings, watchers, checkpoints, health — and may **read** contract content, but can write none of it and decides nothing in any workflow | `cw_administrator` grants, `0013` |
| `U6` | **Whether granting a Legal role takes two names** | **Yes, for the two Legal roles only.** A grant of legal reviewer or legal admin confers nothing until a Legal admin countersigns. Viewer, requester and auditor the Administrator grants alone | `cw.effective_role`, `0013` |
| `U7` | **Who takes audit checkpoints** | **The Administrator, alone.** Moved from Legal admin, whose right is revoked rather than left unused | checkpoint grants, `0013` |
| `U8` | **The workspace model** | **Six workspaces, one per role**, each opening on what is waiting on you; deals become the requester's unit and the pipeline becomes per-deal; the blanket override button is retired | the shell, `WP-U07` |

### The costs of each, stated rather than buried

- **`U1`** — a concession made once can become permanent unless somebody reads the drift report. The
  report is therefore the control, and it must stay in front of whoever opens the renewal rather
  than sitting in a menu.
- **`U2`** — the master agreement stops being a complete statement of what the company is committed
  to, because a work order may lawfully depart from it. Two things contain that: the departure is
  granted per category, never as a blanket permission that later changes silently inherit; and an
  authorised departure is **still reported** in `cw.sow_conflict`. Approved is not the same as
  hidden.
- **`U3`** — administrative work is less convenient, by design. That inconvenience is what makes the
  test suite able to see permission faults at all.
- **`U4`** — the system measures the rate and shows it. What the number should be, and who watches
  it, belongs to the organisation using the system. If a customer wants to set rules around it, the
  measurement is already there to build on.
- **`U5`** — the person who administers accounts can read every deal, manifest, negotiation position
  and supplier redline in the system, and reads are not individually recorded because the system
  records acts, not glances. What contains it: the role can change none of it, holds no vote in any
  workflow, and cannot grant itself one. Describe this role as **content-visible and
  content-powerless** — never as content-blind, which it is not.
- **`U6`** — a wait every time Legal cover is needed in a hurry. That wait is the control working.
  It is kept short by putting the countersign queue in Legal's own workspace rather than only in the
  admin console, and by a daily nudge.
- **`U7`** — during the changeover there is a window in which Administrator accounts must exist
  before checkpoints can be taken at all, because Legal admin's right is revoked in the same
  migration that grants the Administrator's. The bootstrap ceremony creates the first Administrator,
  which is why it runs before anything else.
- **`U8`** — the nine-tab prototype demos well to everybody at once, and six role-scoped workspaces
  do not: showing the whole product now takes six sign-ins. Accepted deliberately, because a screen
  that shows what the viewer's connection could never fetch is a leak dressed as a feature.

---

## 1. Auto-approve vs. the audit story — decided ✅

**Decision: auto-approval must be auditable.** Every approval now records whether the auto-approve
hint was showing, the score, and the threshold, making the rate of nudged approvals measurable. The
event type `auto_approve` with `actor: 'controller'` is reserved for genuine machine approval, so it
can never be logged as a human act.

Worth noting, because it changes the shape of the original concern: in the v3 prototype
`autoApprove` **never actually approves**. It renders an advisory "confirm anyway" hint and a human
still clicks. The gap was that the hint's influence was invisible, not that an action was
unattributed.

See [ADR-0008 §4](decisions/ADR-0008-governance-roles-and-recorded-overrides.md).

## 2. Who may override the validation gate — decided ✅

**Decision: a Requester may override, but not unilaterally.** Override becomes a *request* that is
socialised to stakeholders and approved by a Legal reviewer, recorded per-finding rather than as a
blanket acknowledgement. A **Viewer** role is added so a contract can be shown to someone for
socialisation without granting them the ability to change it.

See [ADR-0008](decisions/ADR-0008-governance-roles-and-recorded-overrides.md) for the five-role
model and the request state machine.

## 3. Clause expiring mid-flight — decided ✅

**Decision: expiry and obsolescence produce warnings throughout, and block at signature.**

- The clause clock and the agreement clock are formally separated — [LCMA §2](../LIFECYCLE-ARCHITECTURE.md).
- Before execution, the live clause clock governs: warnings at **every negotiation round**,
  blocking at **signature**.
- At execution the library snapshot is pinned, and the clause clock becomes advisory — an executed
  contract is never invalidated by later library changes.
- Renewal releases the pin and re-resolves against the current library, which is how executed
  agreements converge on current language.

Implemented in the prototype: `expiryWarnings()` in `engine.jsx`, `<ExpiryNotice>` rendered in the
Negotiate inbox and the Dossier. See [LCMA §7](../LIFECYCLE-ARCHITECTURE.md).

---

## 4. The redline matcher's production form — decided ✅

**Decision: yes — the keyword scorer is retained as the deterministic fallback** when the matcher
is rebuilt on vector search.

Consequences to hold to:

- Negotiate keeps a working offline path, so the full-degradation claim in §5 stays true for the
  whole system rather than "everything except negotiation".
- The two implementations need **comparable score semantics**, or the 0.78 threshold means
  different things depending on which one ran. Either the vector matcher is calibrated onto the
  existing scale, or each carries its own threshold and the UI states which is in effect.
- The keyword rules become long-lived infrastructure rather than scaffolding, and need an owner —
  see [ADR-0005](decisions/ADR-0005-deterministic-fallbacks.md) on the cost of maintaining two
  implementations of the same judgement.

## 5. Who authors validation rules — decided ✅

**Decision: attorneys author and approve them, through a Legal gate — not developers through a code
review.**

*The original framing was wrong and worth correcting: it assumed the rules would be maintained as
code by engineers merging changes. The clauses in the prototype are placeholders, and in production
the people writing both clause text and conflict rules are lawyers.*

What this implies for the build:

- Conflict rules need an **authoring surface for non-developers**, not a source file. A rule is a
  structured statement over the decision set — "if a clause from category A is present and a clause
  from category B is present, and condition C holds, raise a finding of severity S."
- Rules go through the same gate as clause text: authored, reviewed, approved by a named human,
  versioned, effective-dated, and retirable — the Review queue pattern applied to a second content
  type ([ADR-0003](decisions/ADR-0003-review-queue-is-the-only-mutation-surface.md)).
- Rule changes are change-controlled, because a rule change silently alters which contracts are
  blocked. Every finding must cite the rule version that produced it.
- This makes the rule catalogue a **library asset**, governed like the clause library in
  [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md).

Still open: the expressiveness of the rule grammar. Too restrictive and lawyers cannot say what
they mean; too open and it becomes a programming language with no gate.

## 6. Ticket routing and assignment — deferred, documented

**Status: acknowledged as important, explicitly not being solved now.** Recorded so it is not
rediscovered later.

**The question: when a Review ticket is created, which specific lawyer gets it?**

Clause records carry a named `reviewer`. When a redline against `DP-H-014` escalates, does it route
to that clause's reviewer, to a shared queue, or round-robin? And what happens when the named
reviewer has left?

Why it will matter: the reviewer's name is part of the provenance chain a regulator walks
backwards, so routing determines whose name ends up on promoted language. §5 names a notification
service responsible for "Legal review assignment" and specifies nothing further.

Minimum viable answer when it is picked up: a shared queue with explicit claim, plus escalation to
the clause's named reviewer if unclaimed. That is enough to build against and can be refined once
there is real volume data.

## 7. Supersession — decided ✅

**Decision: supersession, concession, and promotion are three different acts.** Specified in
[ADR-0009](decisions/ADR-0009-concession-is-not-supersession.md) and
[`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md).

- **A Review ticket carrying changed clause text is not a supersession — it is negotiation**, and
  is recorded as a **concession** scoped to that one agreement. Vendor text is quarantined and
  never becomes selectable library language.
- **Supersession replaces a clause**, as a deliberate Legal act with a recorded reason and
  approver.
- **Old versions are retained in version history**, permanently, so an agreement executed under
  `@v1` still resolves `@v1`.
- **Executed agreements carrying superseded clauses surface at renewal**, via the LCMA drift
  report, which shows what changed and why.

Clause state becomes `active` | `superseded` | `retired` | `expired`, because "replaced by something
better" and "withdrawn" are different answers to an auditor's question.

## 8. Lifecycle management — architected ✅

Specified in [`LIFECYCLE-ARCHITECTURE.md`](../LIFECYCLE-ARCHITECTURE.md): the two-clock model,
obligation extraction by clause ID rather than by parsing prose, the operate/renew/amend/terminate
pipeline, wind-down and survival obligations, and the data model additions.

Its own open questions are listed in [LCMA §10](../LIFECYCLE-ARCHITECTURE.md) — chiefly the size of
the obligation-template authoring backlog, and whether the system should assert breach.

## 9. Clause library — architected ✅

Specified in [`CLAUSE-LIBRARY-ARCHITECTURE.md`](../CLAUSE-LIBRARY-ARCHITECTURE.md): the three
populations (standard positions, fallback ladders, concessions), version history and supersession,
and the negotiation-intelligence layer that turns concession data into proposed library changes.

The load-bearing idea is the **fallback ladder** — a pre-approved preferred position, acceptable
fallback, and floor per category. It moves Legal's work from **drafting** a fallback under deadline
to **choosing** among positions already approved. The attorney is still in the loop on every
concession (owner decision, 2026-07-25) — what disappears is the research and the drafting, not the
approval. See [CLA §3](../CLAUSE-LIBRARY-ARCHITECTURE.md).

Its own open questions are in [CLA §11](../CLAUSE-LIBRARY-ARCHITECTURE.md) — chiefly ladder depth,
how much weight to give old concessions, and how many similar concessions constitute a pattern
worth proposing on.

## 9a. The Administrator's read of the clause library — **SETTLED 2026-07-27 (U11)** ✅

Owner decision U5 (2026-07-26) settled the Administrator as **content-visible and
content-powerless**, and says in terms never to describe the role as
content-blind. Against the clause library it currently is.

**The gap is the GRANT, not the policy**, and keeping that straight matters
because the two point at different fixes. The read policies on `cw.clause`,
`cw.clause_version`, `cw.ladder` and `cw.ladder_rung` are all `read_all` —
`using (cw.app_role() is not null)` — which admits an Administrator perfectly
well. What is missing is the table privilege: `cw_administrator` holds `select`
on **none** of `cw.clause`, `cw.clause_version`, `cw.clause_version_state`,
`cw.ladder`, `cw.ladder_rung` or `cw.ladder_health`, so the connection is refused
before any policy is consulted.

Migrations `0002` and `0003` granted those to the five roles that existed at the
time; `0013` created the Administrator and never revisited the list. The role
*does* read executed agreements — `0017`'s `read_scoped` policies name
`administrator` explicitly — so the two halves of "contract content" disagree.

So the fix is one `grant select … to cw_administrator` beside the existing
grants. **No policy needs changing**, which is worth stating because it means
the fix cannot widen anybody else's reach by accident.

Found while building `0018`'s consolidation views. **Deliberately not fixed
there:** granting the new views to `cw_administrator` would have closed the gap
in the one place nobody would look for it, and would have made two convenience
joins the Administrator's only window onto the library — a new control wearing a
convenience view's clothes. The fix belongs beside the original grants.

**SETTLED: yes.** The owner granted it on 2026-07-27 as part of U11. Built in
`0022` — a grant beside the others, no policy touched, nobody else's reach
widened, and no write of any kind added. `library-ladder-views.test.mjs` asserts
the read; `administrator.test.mjs`'s whole-schema sweep still asserts the role
can write nothing.

## 9b. WP-U13 cannot close: six governed acts have no endpoint — **IN SCOPE, D-5 settled 2026-08-02**

Found 2026-07-27 while building the Legal admin's workspace. Its **reading**
halves are built ([`library.jsx`](../prototype/v4/app/library.jsx) — the library
and the ladders). Its **acting** halves cannot be, because the endpoints do not
exist:

| act | WP-U13 deliverable |
|---|---|
| activate / retire / supersede a clause | Library |
| edit a conflict rule | Ladders & rules |
| promote a concession | Ladders & rules |
| reorder a rung / move a floor | Ladders & rules |
| release a legal hold | Holds & retention |
| destroy under retention | Holds & retention |

**This is not a porting oversight.** The Python doorway has all 27 writes the
JavaScript service had; none of the six was ever among them. The 52 endpoints
were frozen as the specification before `WP-U13` was looked at, so the gap has
been there the whole time and nothing surfaced it — the package was paused.

**Why it matters more than a missing screen.** Two of the six are the most
dangerous acts in the product. Retention **destruction** is irreversible and
`WP-U13` asks for "the strongest confirmation idiom in the product", refused
while a matter is on hold and named as such. Clause **supersession** must mint a
new version with its history intact — an in-place edit would break the
mutation-surface invariant in the UI rather than in the schema. Both need
designing before they are built, not endpoint-shaped guesses.

**Nothing is broken today**, because a pane that cannot act says so rather than
offering a button that fails. But `WP-U13` **cannot be closed** until somebody
decides these are in scope and they are designed, and `WP-U15` should not report
the package complete on the strength of its read halves.

**TWO OF THE SIX ARE NOW DECIDED (2026-07-27), which was the part that needed
the owner rather than engineering time:**

- **Retention destruction** — U9. Never automatic; the authority is the
  Administrator's alone, revoked from legal_admin. Built in `0022`. **The
  endpoint is still absent**, so the act cannot yet be performed from a screen.
- **Clause supersession** — U10. Mints a new version and never rewrites wording
  already committed to; signed AND in-flight deals are flagged as carrying
  obsolete language rather than corrected. The flagging half is built in `0022`
  (`cw.run_drift`); **the superseding endpoint is still absent.**

**SETTLED 2026-08-02 (D-5): the six acts are IN SCOPE — and BUILT the same
day.** Mike's decision, recorded in `memory.md` S218. Migration `0062`, the
doorway writes, and the screens landed together; WP-U13 is closed. Design
choices made and recorded rather than waited on (flagged here per the rule):

- **"Reorder a rung" is delivered as ladder REPLACEMENT.** Rung order stays
  immutable in place — past concessions are recorded as "we went to rung 2",
  and reordering under them would rewrite what they meant. `cw.publish_ladder`
  retires the live ladder and publishes its successor in one recorded act; the
  retired ladder stays readable forever. This also built the door 0003's own
  refusal message pointed at ("publish a new ladder instead") — which had
  never existed.
- **"Edit a conflict rule" is publishing its next version.** The rule table
  was already immutable per version; `cw.active_conflict_rule` takes the
  latest effective one, so no in-place edit was needed or built.
- **Destruction's confirmation idiom**: the record's own id, typed — costlier
  than any other act in the product, per WP-U13's anti-pattern.

**And one new question the owner has been asked** — see the note below on what
"destroy" should mean.

### What `destroyed` means — **SETTLED 2026-07-27 (U12)** ✅

**SETTLED: both, in that order.** The owner chose a two-act disposal — "the
administrator can remove the whole record, but can delegate the authority to
delete records to remove content, but keep the fact. So records deleted under #1
can be reviewed and deleted under #2."

Built in `0023`:

| act | what it does | who |
|---|---|---|
| **redact** | clears the certificate bytes and the document pointer; keeps filename, size, **hash**, dates and every audit row | Administrator, **or a person it has delegated to** — named, reasoned, revocable, on the chain |
| **purge** | deletes the executed agreement, its documents, certificate and signatories | **Administrator alone. Undelegable.** Only on something already redacted |

**The escalation is the control**, enforced twice: the function refuses a purge
that skipped redaction, and a table constraint refuses a *row* that records one.

**Three residuals, stated rather than smoothed over:**

- **The audit chain outlives a purge.** No role holds DELETE on it, it is
  hash-chained and refuses TRUNCATE. That is why a purge is safe to offer — the
  evidence of correct disposal survives the thing disposed of. **It also means a
  purge is not erasure of every trace.** A right-to-erasure request naming a
  person would have to be discussed on its own terms.
- **The bytes outside are not deleted.** Clearing `storage_uri` severs this
  system's link to the stored file; it does not reach into the object store.
  `cw.redaction_state.external_bytes_pending` says so rather than looking clean.
- **A purge does not touch the negotiation** — `cw.agreement`, its runs,
  decisions, positions and overrides survive. Extending it there would cascade
  through half the schema and is a decision, not a detail.

## 9c. The Administrator's grant on holds and retention — **SETTLED 2026-07-27 (U13)** ✅

**SETTLED: the flag is enough.** The owner's words: *"The Administrator will just
need to be someone who has that level of confidence. It just needs to be
flagged, it doesn't need to explain why."*

Neither option below was taken, and the answer is smaller than both. The
Administrator is told **that** a record is held, never **why**. So nothing is
widened: the inert grant is **revoked** in `0024`, the endpoint stops selecting
the matter references, and the screen stops showing them. `cw.retention_due`
runs with owner rights, which is what lets it answer the flag to a role that may
read neither table underneath it.

**The cost, stated:** an Administrator refused a destruction must ask Legal which
matter blocked it. Deliberate. Note the refusal `cw.retention_destroy()` raises
*does* name the matters to the person attempting the act, so the reason is
available at the moment it decides something — what is withdrawn is browsing the
holds at leisure. The trust the role carries is a question of who is appointed to
it, not something the schema should compensate for.

**Everything below is the original finding, kept because the failure shape is
worth remembering: a grant without a matching policy FILTERS instead of
REFUSING, and an empty list is a worse answer than a refusal.**

---

Found 2026-07-27 by a defect sweep, and left unfixed deliberately, because the
fix widens who may read something.

`0022` grants `select on cw.agreement_retention, cw.legal_hold to
cw_administrator`, with the stated reason that "a destruction refused for a
reason the actor cannot see is a refusal nobody can act on" — the Administrator
holds the destruction authority under `U9`, so it must be able to see what is
blocking one.

**The grant delivers nothing.** Neither table's `read_scoped` policy admits
`administrator` (`0010` §§775–785), and `0013`'s additive `administrator_reads`
list — written for exactly this case — omits both. Because the *grant* exists,
row-level security **filters instead of refusing**: running `GET /holds` as each
role gives the Administrator `200 with zero rows`, where legal_admin, legal
reviewer and auditor each see the open hold and a viewer is cleanly refused.

**Why that is worse than a refusal.** The screen renders "No holds are open."
The Administrator is told there is nothing blocking a destruction when a hold is
in fact open. A 403 would have sent them to ask; an empty list tells them to
proceed.

**Why it is not being fixed as a repair.** Closing it means adding
`administrator` to two read policies — widening who may read hold matters and
retention dates. That is an access decision, and this system's rule is that
those are the owner's. It is also small: two policy lines in a new migration.

**The question for Mike:** `0022` clearly *intended* the Administrator to see
these. Confirm that, and it is a ten-minute change. The alternative — revoking
the inert grant so the Administrator gets an honest refusal instead of a
misleading empty list — is also coherent, and is the safer default if the answer
is not obvious.

*(Answered above: neither. The flag, not the reason — U13, built in `0024`.)*

## 11. The Administrator can read every run's rows and neither run screen

**ANSWERED, 2026-07-27. Built in migration `0026`.**

> *"Seeing an alarm you can't investigate is worse than either alternative."*

`0013` gave the Administrator every assembly's findings — an explicit read rule
on the run table plus grants on all three run tables. Neither summary was ever
granted: `cw.run_summary` (what was assembled, when, whether it is clear to sign)
and `cw.run_contract` (which clause went in for which risk) predate the role by
two migrations, and `0005_run_store.sql:293-297` names the roles that existed at
the time. It was an omission, not a judgement. `0025` deliberately left it open
rather than settling a role's boundary inside a scoping migration, on the
precedent `0018_library_and_ladder_views.sql:170-190` set for this same role.

**`0026` is TWO changes, and it has to be.** The grant alone would have been
worse than the gap: `0025` scoped both views in their own `WHERE` clause and
'administrator' is not in either, so the role would have passed the privilege
check, matched no branch, and been answered **zero rows** — the screen telling
the one person who can see every finding in the company that nothing has ever
been assembled. That is the identical shape as §9 above, where it shipped. So
`0026` grants the views *and* admits the role to their scoping clauses, and the
tests assert a row count rather than the absence of an error.

## 12. Requesters can see each other's concessions and positions

**ANSWERED, 2026-07-27 — and the answer inverts the finding. Not a defect.**

> *"Colleagues need to be able to work on each other's work when one is out sick
> or on vacation without needing a lot of work. Instead, they should be able to
> hide 'confidential' deals from each other if necessary."*

**What was found.** Five screens readable by a requester —
`cw.concession_in_force`, `cw.concession_state`, `cw.position_current`,
`cw.position_revival` and `cw.renewal_drift` — show every requester all the rows
rather than their own. It has the shape this system has paid for four times: a
screen built over a protected table does not inherit the protection.

**Why it is not a defect.** Cover is the point. A buyer on holiday should not
take their deals offline with them, and a colleague picking one up should not
need an access request to do it. Those five screens are doing the right thing by
accident, and narrowing them would have broken working practice to satisfy a
pattern.

**What replaces it — and it is a bigger piece of work than the finding was.**
Openness becomes the default and confidentiality becomes an explicit, per-deal
act: a deal can be marked confidential, and a marked deal is hidden from
colleagues who are not on it. Four things need deciding before it can be built:

- who may mark a deal confidential, and who may unmark it — and whether
  unmarking is a recorded act, the way every other reversal in this system is
- whether Legal, the Auditor and the Administrator still see a confidential
  deal (almost certainly yes — the Auditor's whole job is that nothing is
  invisible, and the Administrator now sees every assembly by §11 above)
- what a colleague sees: nothing at all, or a marked-confidential placeholder.
  A silent disappearance means somebody covering for a colleague cannot tell a
  hidden deal from one that does not exist
- whether the marking travels down to the concessions and positions underneath,
  or is asked of each

**Scope.** This is no longer a scoping fix to five screens; it is a new
capability touching the deal record, every screen that lists deals, and the
concession and negotiation family. It needs its own plan. **Nothing is blocked
on it** — today's behaviour is the wanted behaviour, minus the ability to opt
out.

**SETTLED, 2026-07-27, in two passes. The final shape is below.**

The first answer was that a confidential deal should be invisible outright —
*"if you know something exists it's still not very confidential."* Three places
were then shown to leak its existence anyway, and the answer moved:

> *"Ok fine then we just mark it confidential. That solves it fine."*

**THE SHAPE, AS UNDERSTOOD — flagged plainly because everything else hangs off
it, and it is the opposite of the first answer.** A confidential deal **still
appears** in a colleague's list, as an entry marked confidential. What is hidden
is everything about it: counterparty, value, contents, concessions, positions.
Its *existence* is not hidden, and that is the deliberate trade — because the
alternative could not actually be delivered.

Why the trade is the right one rather than a retreat: a deal that vanishes
leaves a hole where it was, and holes are legible. Reference numbers run in
order, so a gap names the missing deal. Totals stop reconciling. A colleague
covering for somebody cannot tell "not allowed to see it" from "already done",
and closes the wrong thing. Marking it confidential removes all three at once —
nothing is missing, so nothing has to be explained.

**If this reading is wrong and true invisibility is still wanted, say so before
anything is built** — the numbering convention below is the part that becomes
unchangeable.

**Counts belong to management.**

> *"Only certain views (like management) should see the count of open deals."*

So a company-wide total is a management figure, not a general one. Everyone
else's counts cover what they can actually see, and will therefore be lower than
the real number. That discrepancy is now BY DESIGN and must be labelled as such
on the screen — an unexplained number that does not reconcile is exactly what
sends somebody looking for the deal it is hiding. Note that a requester's own
tiles ("my deals open") are their own work and are unaffected.

**The Auditor is not automatically exempt.**

> *"The auditor will need to have approval to see everything."*

The strongest of the three answers, and it dissolves the fork rather than
choosing a side. The permanent record does not carry a hole — but reaching the
confidential part of it is itself a governed, recorded act rather than a
standing privilege. "Nothing is invisible to the Auditor" becomes "nothing is
invisible to the Auditor, and looking leaves a trace."

Three things still to decide when this is built, none blocking:

- **who approves it** — Legal, or the deal's owner, or two people. The
  countersign pattern already in the schema is the obvious model
- **per deal or standing** — approval to see one confidential deal, or to see
  all of them for a period. A standing grant is far easier to build and is
  indistinguishable from exemption after a week
- **whether it expires**, and what happens to an investigation in progress when
  it does

**The buyer manager role is SHELVED.**

> *"Valid point on the buyer manager role. I'll shelf that one for now."*

Sketched as an escalation step between a buyer and Legal who confirms the
confidential flag and sees their reports' deals. Set aside on the cost that
decided it: the system holds no organisational structure at all, so "their
reports" is new data somebody must keep correct, and a stale reporting line is a
silent access error — nothing appears to go wrong. The two-person confirmation
half of the idea survives on its own and does not need the role.

**What is now unchangeable-if-got-wrong, and therefore first.** Deal reference
numbers. `cw.agreement.agreement_id` is free text with no format rule and no
sequence, so nothing forces `AG-0001, AG-0002` — but people number in order and
the prototype's own placeholder is `AG-001`. Under the settled shape above a
sequence gap no longer reveals anything, because the deal is still listed. That
makes this less urgent than it was, not resolved: it becomes urgent again the
moment anybody argues for true invisibility. References end up printed on signed
contracts, so the convention is close to permanent once real ones carry it.

**A related consequence, flagged rather than acted on.** The same principle
argues against narrowing that already exists elsewhere: a requester currently
sees only *their own* assembled contracts, because the run table's read rule has
said so since `0005`. Migration `0025` made the two assembly screens agree with
that rule rather than bypass it — it did not invent the narrowing. If
openness-by-default is the house rule, that rule is a candidate to change too,
and it is a deliberate decision rather than a tidy-up: it would widen who sees
every assembled contract in the company. Not touched.

## 13. Where received documents live — **SETTLED 2026-07-29 (U15)** ✅

The owner decision NC-07 was gated on: where the bytes of a received document
(a counterparty redline, vendor paper, a signed envelope back from DocuSign,
obligation evidence) are stored, and the largest document the system accepts.

**SETTLED: in the database, 1 GB per file, with a planned move of the raw
bytes to cloud object storage (S3 or equivalent) at launch.** The owner's
reasoning, confirmed 2026-07-29: *"Right now we need to build the system
out"* — and 1 GB is, for contracts, any size in practice (a 300-page scanned
contract runs 100–300 MB).

Why in-database first, stated rather than assumed:

- **One system, one backup, one security model.** The row-level rules that
  guard every other record guard the document bytes with no second mechanism.
- **Disposal stays honest.** Under U12's two-act disposal, a redact or purge
  of in-database bytes actually deletes them. External storage is exactly the
  case `cw.redaction_state.external_bytes_pending` exists to admit — that
  residual is deferred to launch, not accepted now.
- **The later move is a migration, not a redesign.** The schema already
  carries `storage_uri` and `document_sha256` (`0011:66-67`); the SHA-256
  proves the file unaltered wherever the bytes sit.

**Carried to launch (the NC-24 / OB-14 pattern — written down so it is not
lost):** when deployment is planned, raise the S3 move alongside the rest of
the hardening list (TLS, encrypted disks, backups). It becomes worth doing
when the database's size or backup time says so, and not before.

**BUILT the same day, migration `0047`:** `cw.received_document` — bytes in
the database, append-only, the sha256 and byte count computed by the schema
itself; both U15 values on the record as `cw.governance_setting` rows
(`document_storage`, `max_document_bytes`); the ceiling enforced unread at
the front door (`server.py`) and again where the bytes land
(`cw.bind_received_document`), with a test holding the two numbers equal.
The transport had already arrived with RP-05, which is why no multipart work
appears here — `server.py`'s binary inbound path was the shape the 1 GB
limit implied, and it existed. `paper.ingest` now keeps what it receives.

## 10. Smaller gaps — deferred

| Gap | Where |
|---|---|
| The 31 fallback interview probes are counted but never enumerated | §2.1 |
| The thirteen risk dimensions are named but not mapped to the 48 categories | §2.1 vs §2.3 |
| `density`, `showTrace` semantics are named, not defined | §6 |
| Prompt versioning is required; no versioning scheme is given | §5 |
| "Tamper-evident (hash-chained)" audit log — no chaining scheme specified | §5 |
| Whether `justification` is retained after execution | §2.2, §2.6 |
| 54 seeded clauses carry no approval date, so they can never be temporally governed | [spec-vs-implementation §8](spec-vs-implementation.md) |

The last two are worth decisions rather than defaults. The justification is the reviewer's evidence
and belongs in the audit trail — but it is also the only model-authored prose anywhere near the
artifact, and the system's headline claim is a character count of exactly that.
