# Plan C — Phase 0 hygiene and Phase 3: building the gate the architecture already assumes

- **assignment_id:** PLAN-C
- **lens:** Phase 0 document hygiene · Phase 3 (Review queue, origin, spec repairs, negotiation record)
- **date:** 2026-07-25
- **evidence tags:** `Observed` (verified with `file:line`) · `Inferred` · `Assumed` · `Unresolved`

---

## Summary

Three things are true after verification, and two of them change the shape of the work.

1. **Two of the four Phase 0 hygiene items are already done.** ADR-0010 and
   `NEGOTIATION-ARCHITECTURE.md` are committed (commit `dd0b396`), and the ADR index already lists
   0010. The review's claim that they are uncommitted and the index stops at 0009 is stale. What
   remains is genuinely small: two "amended by" notes and one false sentence in the index.
   `Observed`.
2. **The rule grammar is not "specified nowhere" — it is specified in the wrong place.** It exists
   in full at `backend/db/migrations/0004_conflict_rules.sql:46-80` and `backend/README.md:178-195`.
   The defect is that no architecture document holds it and `NEGOTIATION-ARCHITECTURE.md:182` cites
   a section that is about something else. That makes the repair cheap. `Observed`.
3. **Phase 3 is the largest phase by a wide margin.** It creates four new migrations, five new test
   suites, a new engine property that changes every snapshot hash, and a full rebuild of
   `docs/data-model.md`. Phases 0–2 mostly *edit existing files with existing tests*. Phase 3
   creates subsystems that have no tests to extend. Honest estimate: **Phase 3 ≈ 1.5–2× Phases 0–2
   combined.** A minimum coherent subset is proposed in §9.

The single most consequential design point in this plan: **owner decision 4 (concessions need the
Requester, the attorney, and configured Required Approvers) materially weakens the Clause Library
Architecture's central scaling claim**, and the document repair must say so rather than quietly
rewording around it. CLA §3 currently claims ladders convert Legal's involvement from
per-negotiation to per-category. With an attorney required on every concession, that is no longer
true. What survives — and it is still worth a great deal — is that the attorney is approving a
pre-approved position rather than drafting and researching one. That is a smaller, honest claim.

---

## 1. Verification of document defects

Every row below was checked against the working tree on 2026-07-25.

| # | Claim (from `docs/REVIEW-2026-07-25.md`) | Confirmed? | Evidence | `file:line` |
|---|---|---|---|---|
| V1 | ADR-0010 and `NEGOTIATION-ARCHITECTURE.md` are uncommitted | **No — already fixed** | Both are in `HEAD`; added by commit `dd0b396`. Only the Phase 0 owner-decision *additions* are uncommitted working-tree edits. | `git cat-file -e HEAD:docs/decisions/ADR-0010-…` succeeds |
| V2 | "the ADR index stops at 0009" | **No — already fixed** | Row 0010 present and committed. | `docs/decisions/README.md:24` |
| V3 | ADR-0001 carries no "amended by" note | **Yes** | Status line reads only "Accepted · implemented throughout the v3 prototype". No reference to ADR-0010 anywhere in the file. | `docs/decisions/ADR-0001-model-never-authors-contract-language.md:3` |
| V4 | ADR-0002 is now wrong and unamended | **Yes** | "Auditing 'can model output reach a document?' means reading one filter, not the whole system." ADR-0010 permits Builder drafts and supplier-paper atomisation, so the manifest is no longer the sole crossing. No amendment note. | `docs/decisions/ADR-0002-manifest-is-the-trust-boundary.md:38-39`; `ADR-0002:3` |
| V5 | The ADR index falsely claims all ADRs are implemented in the prototype | **Yes** | "Status is `Accepted` throughout because the prototype implements them." False for 0008 (ADR-0008:3 says "partially implemented"), 0009 (schema only, no prototype), 0010 (no implementation at all). | `docs/decisions/README.md:8` |
| V6 | Rule grammar cited to "CLA §4", which is the Concessions section | **Yes** | Citation: "A conflict-rule predicate in the three-primitive grammar (§4 of the CLA)". CLA §4 is headed "Concessions". | `NEGOTIATION-ARCHITECTURE.md:182`; `CLAUSE-LIBRARY-ARCHITECTURE.md:102` |
| V7 | The rule grammar "is specified nowhere" | **Partly false** | Fully specified in the migration comment and CHECK constraint, and in the backend README. Not in any architecture document. | `backend/db/migrations/0004_conflict_rules.sql:46-80`; `backend/README.md:178-195` |
| V8 | `docs/data-model.md` predates three of the four architecture documents | **Yes** | Covers Category, Clause, Manifest, Decision, Conflict finding, Keyword rule, Redline, Review ticket, Audit event only. No ladder, concession, supersession, snapshot, run, executed agreement, obligation, negotiation, position, or origin. Review ticket is still tagged `[spec]` though the state machine is now specified in two places. | `docs/data-model.md:19-238`, esp. `:209` |
| V9 | `ARCHITECTURE.md` §5 lists four roles; ADR-0008 defines five | **Yes** | "Identity (SSO + RBAC): Requester / Legal reviewer / Legal admin / Auditor." Viewer is missing. ADR-0008's table has five, and `0001_foundation.sql:17-23` creates five Postgres roles. | `ARCHITECTURE.md:309`; `docs/decisions/ADR-0008-…:38-45`; `backend/db/migrations/0001_foundation.sql:17-23` |
| V10 | The Review queue exists only as prose | **Yes** | Specified as a data store — "tickets with full provenance payload and state machine (`pending → verified \| rejected`)" — and as a record shape, but no table exists in any of the six migrations. | `ARCHITECTURE.md:304`; `docs/data-model.md:209-225`; absence across `backend/db/migrations/000{1..6}*.sql` |
| V11 | CLA §3 says the matcher may settle against a fallback rung without a human; §7 says descending is a Requester act *and* that concessions are automatic | **Yes** | §3: "The matcher can then resolve a vendor's ask against rung 1 or rung 2 without a human". §7: "Record a concession \| Automatic, on negotiation resolution" and "Descend a rung \| Requester, recorded". §4 requires a named `approved_by` on every concession. Three statements, mutually inconsistent. | `CLAUSE-LIBRARY-ARCHITECTURE.md:85`, `:249`, `:250`, `:116` |
| V12 | E-signature capture is one field | **Yes (spec)** — **partly false (schema)** | Spec: `signature_evidence \| E-signature envelope reference`, one row. But the schema already models counterparts and exhibits as first-class rows with bytes and hashes. The spec is behind the schema, not ahead of it. | `LIFECYCLE-ARCHITECTURE.md:294`, `:137`; `backend/db/migrations/0006_executed_agreements.sql:43-66` |
| V13 | Legal hold does not exist | **Yes** | Zero occurrences of "legal hold", "legal_hold" or "litigation hold" anywhere in the repository outside the proposal and this workflow's own files. Retention service is specified as "Close eligibility, retention expiry, defensible deletion" with no suspension mechanism. | `LIFECYCLE-ARCHITECTURE.md:356`, `:297` |
| V14 | MSA/SOW is not modelled | **Yes** | Named as open question 4 ("Multi-agreement obligations … The composition rule is not specified here") and nowhere else. `cw.agreement` has no parent link and no kind. | `LIFECYCLE-ARCHITECTURE.md:402-403`; `backend/db/migrations/0003_ladders_and_concessions.sql:14-23` |
| V15 | Renewal restarts from our book, discarding concessions | **Yes, and deliberately so** | "The renewal then re-enters assembly and resolves against the **current** library." LCMA agrees: "the pin is released: the work re-enters assembly and resolves against the *current* library". This is stated design intent in two documents, not an oversight. | `CLAUSE-LIBRARY-ARCHITECTURE.md:186-189`; `LIFECYCLE-ARCHITECTURE.md:75-76`, `:195-201` |
| V16 | Owner decision 4 is recorded and its build work is unspecified | **Yes** | `memory.md` records the decision and states plainly: "Who counts as Required for which contracts still needs to be designed (by category? by deal size?) — that is build work, not a new decision." | `memory.md` (working-tree addition, 2026-07-25 entry "Concessions need the requester, the attorney, and every required approver") |
| V17 | ADR-0010 says clause versions carry `origin: external`; NA §7 gives external clauses a *separate* entity | **Yes — a new, unreported inconsistency** | ADR-0010: "`external` \| From supplier paper; agreement-scoped, never selectable for our drafts" listed as a clause-version origin. NA §7: "**External clause** — `agreement_id`, `source_round`, … `origin: 'external'`. Never selectable" as its own record. NA §5 also says a draft "has no ID in the clause namespace until approved". | `docs/decisions/ADR-0010-…:72`; `NEGOTIATION-ARCHITECTURE.md:244-245`, `:190` |

**Working-tree state, verified.** `ARCHITECTURE.md`, `NEGOTIATION-ARCHITECTURE.md`, ADR-0010,
`backend/engine/docx.py`, `backend/engine/test_docx.py`, `memory.md`, `CLAUDE.md`,
`IMPROVEMENT-PROPOSAL-2026-07-25.md` and two prototype files carry uncommitted edits. Their content
is **complete and coherent** — each records the same five owner decisions of 2026-07-25, and the
footer removal is applied consistently in the generator (`docx.py`), its test, and the prototype.
`Observed` (`git diff`). Committing remains the user's call (objective contract §8).

---

## 2. Review-queue schema design

Target: **migration `0007_review_queue.sql`**. Conventions copied from the existing six migrations:
`cw.` schema; `bigserial` surrogate keys; CHECK constraints for shape; `plpgsql` triggers for what a
CHECK cannot reach; `create rule … do instead nothing` for delete; `after` triggers calling
`cw.audit()`; RLS enabled on every table with explicit `read_*` / `*_writes` policies; grants
enumerated per role; a comment on every non-obvious column stating *why*.

### 2.1 Tables

**`cw.review_ticket`** — the unit of work at the mutation gate.

| Column | Type / constraint | Notes |
|---|---|---|
| `ticket_id` | `bigserial primary key` | |
| `agreement_id` | `text references cw.agreement(agreement_id)` | Nullable: a Builder draft belongs to no deal |
| `category_key` | `text not null references cw.category(key)` | Enum-constrained everywhere, as elsewhere |
| `severity` | `text not null check (severity in ('Standard','High'))` | |
| `reason_code` | `text not null check (reason_code in ('no-ai-match','human-escalated','human-edit','builder-draft','concession-promotion'))` | ADR-0003's three, plus the two new gate entrants |
| `proposed_text` | `text not null` | **Quarantined.** Referenced by no selectable view. Comment says so, as `cw.concession.vendor_text` does |
| `source_provenance` | `text not null check (… in ('vendor_language','ai_candidate','ai_draft','edited_by_legal'))` | ADR-0003's badge, made structural |
| `vendor_comment` | `text` | |
| `state` | `text not null default 'pending' check (state in ('pending','verified','rejected'))` | `ARCHITECTURE.md:304` |
| `opened_by`, `opened_at` | `text not null`, `timestamptz not null default now()` | |
| `decided_by`, `decided_at`, `decision_note` | nullable | |
| `minted_clause_id`, `minted_version` | nullable, FK to `cw.clause_version` | Set **only** by the mint function |

Constraints, each carrying the enforcement the prose currently only promises:

```sql
constraint rejection_needs_note check (
  state <> 'rejected' or decision_note is not null),
constraint terminal_needs_decider check (
  state = 'pending' or (decided_by is not null and decided_at is not null)),
constraint pending_has_no_decision check (
  state <> 'pending' or (decided_by is null and decided_at is null
                         and minted_clause_id is null)),
constraint verified_names_its_clause check (
  state <> 'verified' or minted_clause_id is not null),
constraint minted_is_whole check ((minted_clause_id is null) = (minted_version is null)),
foreign key (minted_clause_id, minted_version)
  references cw.clause_version(clause_id, version)
```

`rejection_needs_note` is the answer to "how is the mandatory rejection note enforced at the
database rather than in practice" — it is a CHECK, not a convention. `Inferred` from the
`retired_needs_reason` pattern at `0002_clause_registry.sql:57-58` and `override_needs_ref` at
`0005_run_store.sql:90`.

**`cw.review_segment`** — the original redline diff. `(ticket_id, ordinal)` PK,
`kind check in ('keep','ins','del')`, `text`. Matches `backend/engine/docx.py` `Segment`.

**`cw.review_candidate`** — the AI candidate and its alternates, **by reference, not by copy**.
`(ticket_id, ordinal)` PK, `clause_id`, `version` FK to `cw.clause_version`, `score numeric`,
`is_primary boolean`. Storing references rather than copies is the mitigation the CLA itself
suggests and Phase 4 recommends adopting; it costs nothing to adopt here because clause versions are
immutable and never deleted (ADR-0006). `Observed` (`IMPROVEMENT-PROPOSAL-2026-07-25.md:131-132`).

**`cw.clause_draft`** — ADR-0010's draft entity, per `NEGOTIATION-ARCHITECTURE.md:247-249`.

| Column | Notes |
|---|---|
| `draft_id` | `bigserial primary key` |
| `kind` | `check in ('clause','rung','rule')` |
| `text` | The draft. **No ID in the clause namespace until approved** (NA:190) — enforced by there being no `clause_id` column here at all |
| `prompt`, `model`, `model_version` | `not null` — a draft that cannot name what produced it is unauditable, same argument as `run_finding`'s rule version (`0005_run_store.sql:127-129`) |
| `inputs` | `jsonb not null default '{}'` — rules and source records shown to the model |
| `state` | `check in ('proposed','approved','rejected','expired') default 'proposed'` |
| `requested_by`, `requested_at`, `expires_on` | Drafts go stale rather than lingering (NA:194) |
| `ticket_id` | `references cw.review_ticket(ticket_id)`, nullable until submitted — **the gate it must pass** |
| `approved_by`, `approved_at` | |
| `edited_before_approval` | `boolean` — null while proposed; **not null** once approved |

```sql
constraint approved_records_edit_state check (
  state <> 'approved'
  or (approved_by is not null and edited_before_approval is not null)),
constraint approved_goes_through_a_ticket check (
  state <> 'approved' or ticket_id is not null),
constraint not_self_approved check (
  approved_by is null or approved_by is distinct from requested_by)
```

`edited_before_approval` being `not null` at approval is what makes the unedited-approval rate
computable at all — the metric ADR-0010 names as the binding control. `not_self_approved` implements
NA:193 in its strict form; NA's text qualifies it ("when the requester is not Legal"), which a CHECK
cannot express. **Recommendation: enforce the strict form.** A Legal reviewer approving their own
AI draft is precisely the case the control exists to catch, and the qualified form reintroduces the
hole. This is a small, deliberate strengthening of NA:193 and must be stated in the NA text rather
than left as a silent divergence. `Inferred`.

### 2.2 The state machine, and how it is enforced

**Both CHECK and trigger, deliberately** — the CHECKs above enforce *shape* (a rejected ticket has a
note; a verified ticket names its clause), and a `before update` trigger enforces *transition* (which
state may follow which) and *immutability* of everything that is not a decision field:

```sql
create or replace function cw.review_ticket_transition() returns trigger
language plpgsql as $$
begin
  if old.state <> 'pending' then
    raise exception 'review ticket % is already %; a decision is final',
      old.ticket_id, old.state using errcode = 'restrict_violation';
  end if;
  if new.state not in ('verified','rejected') then
    raise exception 'a pending ticket may only be verified or rejected'
      using errcode = 'restrict_violation';
  end if;
  if new.proposed_text is distinct from old.proposed_text
     or new.opened_by  is distinct from old.opened_by
     or new.agreement_id is distinct from old.agreement_id
     or new.category_key is distinct from old.category_key
     or new.reason_code  is distinct from old.reason_code then
    raise exception 'review ticket % is immutable except for its decision',
      old.ticket_id using errcode = 'restrict_violation';
  end if;
  if new.state = 'rejected' and coalesce(btrim(new.decision_note),'') = '' then
    raise exception 'rejecting a ticket requires a note; the buyer sees it'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
```

The trigger's rejection-note check is redundant with the CHECK constraint **on purpose**: the CHECK
catches `''` never, the trigger catches whitespace-only, and the trigger produces the message a
reviewer can act on. Same belt-and-braces reasoning as
`0002_clause_registry.sql:66-89` (trigger) plus `:57-58` (CHECK).

Plus `create rule review_ticket_no_delete as on delete to cw.review_ticket do instead nothing;` —
matching `0002:91-92` and `0005:150`.

Audit hook, matching `cw.audit_clause_version()` (`0002:184-201`):
`review_ticket_opened` on insert; `review_ticket_verified` / `review_ticket_rejected` on the
transition, carrying `decision_note` and the minted ref.

### 2.3 The mint function, and RLS that does not repeat D1

```sql
create or replace function cw.verify_review_ticket(
  p_ticket_id bigint, p_new_clause_id text, p_title text, p_rationale text,
  p_reviewer text, p_expires_on date, p_origin text
) returns text
```

Structure copied from `cw.promote_concession()` (`0003:183-227`): explicit role check first
(`legal_reviewer` or `legal_admin` — ADR-0008 gives reviewers "verify clause promotions"), then the
guards, then the insert, then the ticket update, then `cw.audit(...)`.

**The D1 lesson applies directly and must not be repeated.** `promote_concession()` ends in an
UPDATE against a table with no UPDATE policy, so under a real role it silently does nothing
(`docs/REVIEW-2026-07-25.md:168`). Migration 0007 therefore ships, from the first line, an explicit
`for update` policy with **both** `using` and `with check`:

```sql
create policy legal_decides on cw.review_ticket for update
  using      (cw.app_role() in ('legal_reviewer','legal_admin'))
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));
grant update on cw.review_ticket to cw_legal_reviewer, cw_legal_admin;
```

and the accompanying test suite runs the whole verify path **as `cw_legal_reviewer`**, not as the
owner — success criterion S3. `Dependency:` whatever Plan D/E decide about identity derivation
(finding D3) changes how `cw.app_role()` is computed, not what these policies say. I do not design
that; I inherit it.

Read policies, following `cw.concession`'s scoping (`0003:301-305`) because a ticket carries vendor
language and is commercially sensitive for the same reason:

- read: `legal_reviewer`, `legal_admin`, `auditor` see all; `requester` sees tickets on agreements
  they own (`cw.owns_agreement`) or that they opened; **`viewer` sees none**.
- insert: `requester`, `legal_reviewer`, `legal_admin`.

### 2.4 How the draft entity attaches

A Builder draft is created in `cw.clause_draft` (`state='proposed'`). Submitting it for approval
inserts a `cw.review_ticket` with `reason_code='builder-draft'`,
`source_provenance='ai_draft'`, `proposed_text` = the draft text, and back-fills
`clause_draft.ticket_id`. Verification runs `cw.verify_review_ticket(..., p_origin => 'ai_drafted')`,
which mints the clause version and, in the same transaction, sets the draft to `approved` with
`edited_before_approval` computed as `(ticket.proposed_text is distinct from draft.text)` — so the
metric is derived from stored bytes, not from a reviewer's self-report. `Inferred`; this is the only
way the number is trustworthy.

The unedited-approval rate then falls out as a view:

```sql
create or replace view cw.unedited_approval_rate as
select model, model_version,
       count(*) filter (where state='approved')                                as approved,
       count(*) filter (where state='approved' and edited_before_approval)     as edited,
       count(*) filter (where state='approved' and not edited_before_approval) as unedited
from cw.clause_draft group by model, model_version;
```

No threshold is encoded. Legal owns the number and the threshold is unset (owner decision, recorded
in `memory.md`; objective contract §8 names it approval-sensitive). The system measures and
displays. `Observed`.

---

## 3. Reconciling `promote_concession()` with the new gate

The review's phrasing is exact: `promote_concession()` is "one path through a gate that otherwise
doesn't exist yet" (`docs/REVIEW-2026-07-25.md:180-181`). Once the gate exists, having two
independent minting paths would mean the "single mutation surface" of ADR-0003 is a claim with two
implementations — the same class of fault as a protection that works by accident.

**Design: one mint, many entrances.**

1. Extract the minting body of `promote_concession()` into
   `cw.mint_clause_version(p_ticket_id, p_clause_id, p_title, p_body, p_rationale, p_citations,
   p_reviewer, p_expires_on, p_origin, p_provenance)`. It is the only function in the schema that
   inserts into `cw.clause_version` for a non-seeded clause.
2. `promote_concession()` becomes: role check → guards (unchanged) → open a ticket with
   `reason_code='concession-promotion'`, `source_provenance='vendor_language'` → call
   `cw.mint_clause_version(..., p_origin => 'vendor_derived')` → mark the ticket verified → set
   `concession.promoted_to_clause` → audit. Its signature and its error behaviour do not change, so
   `ladder.test.mjs` keeps passing.
3. `cw.verify_review_ticket()` calls the same `mint_clause_version`.
4. Make the invariant checkable rather than asserted: add
   `cw.clause_version.source_ticket_id bigint references cw.review_ticket(ticket_id)` and a
   `before insert` trigger requiring it to be non-null whenever `provenance <> 'seeded'`. Then
   *"every clause that was not seeded came through a verified ticket"* is a query, not a promise.

**Ordering constraint:** Phase 1's D1 fix rewrites `promote_concession()` (adding the UPDATE policy
or converting to `security definer`). This refactor touches the same function. **These must not be
done in parallel.** Recommendation: D1 lands first in Phase 1 and is treated as settled; WP-C10
refactors on top of it, re-running `ladder.test.mjs` and the mutation harness. If the orchestrator
prefers, WP-C10 can be folded into the D1 package instead — but it cannot be concurrent.

---

## 4. Origin and the second character count

### 4.1 Schema (migration `0008_clause_origin.sql`)

```sql
alter table cw.clause_version
  add column origin text not null default 'legal_authored'
    check (origin in ('legal_authored','ai_drafted','vendor_derived','external'));
```

- Add `origin` to the protected-field list in `cw.clause_version_immutable()`
  (`0002_clause_registry.sql:67-85`). ADR-0010: "Origin is immutable, survives supersession, and is
  reportable" (`ADR-0010:74`). **Collision:** Phase 1's D4 fix edits this same function to protect
  `reviewer` and forbid un-retiring. One package must own the function.
- Add `origin` to `cw.clause_version_state` (`0002:124-165`) and add
  `and v.origin <> 'external'` to the `selectable` expression, so "never selectable for our drafts"
  is enforced by the view rather than by discipline.
- Add a mutation-harness entry per protection (removing `origin` from the immutability list;
  removing the `external` conjunct from `selectable`) — objective contract constraint 6.

**Resolving V17 (a new inconsistency).** ADR-0010 lists `external` as a clause-version origin; NA §7
gives external clauses their own entity. Recommendation: **both, and say why.** The enum keeps all
four values so `origin` answers "where did this wording come from?" uniformly and a deliberately
promoted supplier clause carries a truthful origin. Supplier-paper *atomisation units* — which have
no ID in our clause namespace — live in `cw.external_clause` (WP-C9) and are not clause versions.
The ADR-0010 wording needs one clarifying sentence; the NA does not change. Documents-only edit,
folded into WP-C3.

### 4.2 Engine

- `backend/engine/model.py`: add `origin: str = "legal_authored"` to the frozen `Clause`
  (`model.py:28-54`), beside `provenance_gap` and `tags`.
- `backend/engine/loader.py`: select `v.origin` in the clause query (the file already joins
  `cw.category` for the label at `loader.py:30`, so this is one column).
- `backend/engine/run.py`: `snapshot_from_rows` passes
  `origin=row.get("origin", "legal_authored")` (`run.py:161-174`).
- **Snapshot hash:** include `origin`. Cost: every fixture's expected snapshot id changes. Benefit:
  E1's lesson is "fingerprinted but never stored"; the inverse — stored but never fingerprinted —
  would make the second provenance count un-reproducible for a past run, which is precisely the
  guarantee the run store exists to give. Schema changes are free now (objective contract §5.10).
  `Inferred`. **Mark for disclosure**: this changes stored hashes, so it must land before any run is
  recorded that matters.

### 4.3 The second count

The two numbers measure different things and must not share a function.

- `authored_characters(data, bodies, structural)` (`backend/engine/docx.py:179-194`) counts
  characters **in the produced document** traceable to neither library text nor the declared
  structural allowlist. Stays exactly as it is; still asserted zero on every build
  (`test_docx.py:90-110`). Unchanged.
- The second count is a property of the **decision set**, not of the file:

```python
def ai_origin_characters(resolution) -> int:
    """Characters of approved wording whose origin was an AI draft.

    Not a defect count. Every one of these characters was read, possibly edited,
    and approved by a named lawyer (ADR-0010). It is reported because the number
    should be visible, not because it is a problem.
    """
    return sum(len(d.selected.body) for d in resolution.decisions
               if d.selected is not None and d.selected.origin == "ai_drafted")
```

Both are written into the run record and neither is printed on the contract — objective contract
constraint 3, already implemented in the generator (`git diff backend/engine/docx.py`). Add to
`cw.run`: `authored_characters int not null default 0` and `ai_origin_characters int not null
default 0`, both `check (… >= 0)`, and emit them from `run_rows()` (`run.py:80-103`).

Deliberately **not** added: a DB `check (authored_characters = 0)`. A constraint that can never fail
is noise; the property belongs to the test that can actually see it fail
(`test_docx.py:118` proves the counter looks).

---

## 5. The Required-Approvers model

Owner decision 4, verbatim from `memory.md`: a concession at a fallback position needs the
Requester **and** the assigned attorney, plus any configured Required Approvers — executive
leadership, other management, and stakeholder departments (ISO, Privacy, Compliance, Risk). The same
entry states the *configuration* rule is build work, not a settled decision. `Observed`.

### 5.1 Schema (migration `0009_required_approvers.sql`)

**`cw.required_approver`** — per agreement, configurable.

| Column | Notes |
|---|---|
| `agreement_id` | FK `cw.agreement` |
| `ordinal` | part of PK |
| `body` | `check in ('executive','management','iso','privacy','compliance','risk','other')` |
| `label` | Free text; `check (body <> 'other' or label is not null)` |
| `approver` | The named person. Never a team inbox — same rule LCMA §6 states for obligation owners (`LIFECYCLE-ARCHITECTURE.md:319-321`) |
| `added_by`, `added_on` | |

**`cw.concession_approval`** — append-only.
`(concession_id, approver_kind, approver)` where
`approver_kind check in ('requester','attorney','required')`, plus `required_ordinal` (non-null
exactly when `approver_kind='required'`), `approved_on`, and an audit hook emitting
`concession_approved`.

**`cw.concession` gains a state.** `state text not null default 'proposed' check (state in
('proposed','approved','withdrawn'))`. A `before update` trigger forbids setting `state='approved'`
directly; only `cw.recompute_concession_state(concession_id)` — called by an `after insert` trigger
on `concession_approval` — may flip it, and only when the requester approval, the attorney
approval, and one approval per configured `required_approver` row all exist.

Then the rule the owner decided is a database fact:

```sql
create or replace view cw.effective_concession as
  select * from cw.concession where state = 'approved';
```

Negotiation, analytics (`cw.concession_rate`, `0003:231-239`) and promotion read the view, not the
table. A proposed-but-unapproved concession is visible and pending, never silently in force.

**Collision, and it is significant.** Phase 1's D5 adds `ladder_id` + rung to `cw.concession`; D6
adds an immutability trigger and audit to it. This package adds a state column and a state-changing
trigger to the same table. D6's "concessions are immutable" and this package's "state moves
proposed → approved" must be reconciled in one place: recommendation is that D6's trigger protect
every column *except* `state`, and that `state` be movable only via the recompute function.
**Sequence D5/D6 first, then WP-C8**, and have WP-C8's author read D6's trigger before writing.

### 5.2 The CLA text changes, exactly

| `file:line` | Current | Replacement (substance) |
|---|---|---|
| `CLAUSE-LIBRARY-ARCHITECTURE.md:84-86` | "The matcher can then resolve a vendor's ask against rung 1 or rung 2 **without a human** — because a lawyer already decided that position is acceptable." | The matcher **proposes** a rung deterministically. A lawyer pre-approved the *language*; taking that position on a given deal is still a decision, approved by the Requester and the assigned attorney plus any configured Required Approvers. |
| `CLAUSE-LIBRARY-ARCHITECTURE.md:88-89` | "This converts Legal's involvement from **per-negotiation** to **per-category, periodically**, which is the difference between a system that scales and one that doesn't." | **Must be rewritten, not softened.** With owner decision 4 the attorney is in the loop on every concession. What ladders remove is the *drafting and research*, not the approval: the attorney chooses among positions they already approved instead of composing a new one. Smaller claim, and true. |
| `CLAUSE-LIBRARY-ARCHITECTURE.md:93` | "Moving down a rung is a recorded act with a reason, visible to the deal owner. Cheap, not free." | Moving down a rung is an **approved** act with a reason — Requester, attorney, and every Required Approver, each by name. |
| `CLAUSE-LIBRARY-ARCHITECTURE.md:116` | `approved_by` \| Named human | `approvals[]` — Requester, assigned attorney, and one entry per configured Required Approver, each named and dated. |
| `CLAUSE-LIBRARY-ARCHITECTURE.md:249` | "Record a concession \| Automatic, on negotiation resolution" | "**Propose** a concession \| Automatic, on negotiation resolution — recorded in state `proposed`, in force only once approved." |
| `CLAUSE-LIBRARY-ARCHITECTURE.md:250` | "Descend a rung \| Requester, recorded" | "**Approve a concession (any rung)** \| Requester **and** assigned attorney, plus every configured Required Approver." |
| `CLAUSE-LIBRARY-ARCHITECTURE.md:268-281` (§8 Data model) | Concession "as §4" | Add `state`, `approvals[]`, and a `Required approver` record. |

The honest cost, stated in the document rather than in a commit message: **this is a real reduction
in the throughput claim, accepted deliberately by the owner because the approval is what makes the
concession record trustworthy.** `memory.md` already says this ("This puts the attorney back in the
loop on every concession"); the CLA must say it too.

---

## 6. Spec-repair inventory

One row per repair, with the exact edit.

| # | Repair | Target `file:line` | The exact edit | Kind |
|---|---|---|---|---|
| R1 | ADR-0001 amendment note | `docs/decisions/ADR-0001-…:3` | Status line becomes "Accepted · **amended by [ADR-0010]** · implemented throughout the v3 prototype", plus a short "What ADR-0010 changed" block after Context: the invariant now reads *no contract language reaches an agreement without a named human's approval, and every clause carries its origin permanently* (`ADR-0010:59-61`); assembly is untouched. | Doc |
| R2 | ADR-0002 amendment note | `docs/decisions/ADR-0002-…:3, :38-39` | Status line gains the amendment note. The line "Auditing 'can model output reach a document?' means reading one filter" is corrected: the manifest is no longer the *sole* crossing — Builder drafts and supplier-paper atomisation are two more, and each is gated by the Review queue rather than by the manifest filter. The *claim that survives* is that every crossing terminates at a named human. | Doc |
| R3 | ADR index status claim | `docs/decisions/README.md:8` | "Status is `Accepted` throughout because the prototype implements them" → Accepted means *decided*, not *built*: 0001–0007 are implemented in the prototype; 0008 is partially implemented (`ADR-0008:3`); 0009 is implemented in the database schema only; 0010 is not yet implemented. Add an "Implemented in" column or a two-line note. **No index row needs adding — 0010 is already listed (`README.md:24`).** | Doc |
| R4 | Rule grammar section | new `ARCHITECTURE.md` §2.5a; citation at `NEGOTIATION-ARCHITECTURE.md:182` | Write the grammar where its subject lives — validation is `ARCHITECTURE.md` §2.5, not the CLA. Lift the three primitives (`all_present`, `none_present`, `conflicting_values`), the ANDing rule, the tag namespacing, and the "no logic, no loops, no expressions" boundary from `0004_conflict_rules.sql:46-80` and `backend/README.md:178-195`. Change NA:182 to cite `ARCHITECTURE.md §2.5a`. Cheaper and more correct than writing a new CLA §4. | Doc |
| R5 | Five roles | `ARCHITECTURE.md:309` | "Requester / Legal reviewer / Legal admin / Auditor" → "**Viewer** / Requester / Legal reviewer / Legal admin / Auditor", with a pointer to ADR-0008 §1 for what each may do, and a note that the five are created as real Postgres roles (`0001_foundation.sql:17-23`). Leave the §1 *Actors* table (`ARCHITECTURE.md:44-48`) alone — it is a different taxonomy (Requester / Legal / Controller / Executor), not an RBAC list; add one cross-reference line so a reader is not confused by the two. | Doc |
| R6 | CLA §3/§7 concession approval | `CLAUSE-LIBRARY-ARCHITECTURE.md:84-93, :116, :249-250, :268-281` | As tabulated in §5.2. | Doc |
| R7 | ADR-0010 `external` clarification | `docs/decisions/ADR-0010-…:72` | One sentence: the `external` origin exists so a *deliberately promoted* supplier clause carries a truthful origin; supplier-paper atomisation units are not clause versions and live in their own agreement-scoped record (`NEGOTIATION-ARCHITECTURE.md:244-245`). | Doc |
| R8 | NA self-approval guardrail | `NEGOTIATION-ARCHITECTURE.md:193` | "A draft may not be approved by whoever requested it, when the requester is not Legal" → drop the qualifier. A Legal reviewer approving their own AI draft is the exact case the control exists to catch. Enforced by `not_self_approved` (§2.1). | Doc |
| R9 | E-signature byte capture | `LIFECYCLE-ARCHITECTURE.md:137, :294`; new `cw.signature_evidence`, `cw.signatory` in migration 0009 | Spec: replace the single `signature_evidence` field with a record — provider, envelope id, completion timestamp, **the completion certificate's bytes and SHA-256**, and per-signatory rows (name, party, method `electronic \| wet_ink`, signed_on). Note in the text that the *byte set* — counterparts, wet-ink scans, exhibits — is already modelled: `cw.executed_document.kind` covers `counterpart` and `exhibit` with bytes, size and hash (`0006:43-66`). The spec was behind the schema. Small schema addition, mostly a doc repair. | Doc + small schema |
| R10 | Legal hold | `LIFECYCLE-ARCHITECTURE.md:211-222, :297, :356`; new `cw.legal_hold` in migration 0009 | Spec: §3.5 gains "Retention runs on a clock **unless suspended**. A legal hold suspends destruction for a named matter; it is opened and released by named people and both acts are audited. An agreement under hold cannot be destroyed however far past `retention_until` it is." Table: `agreement_id`, `matter_ref not null`, `opened_by`, `opened_on`, `released_by`, `released_on`, with `check (released_by is null) = (released_on is null)` and a `cw.under_legal_hold(agreement_id)` predicate the retention path must consult. Deletion is not yet implemented, so this is cheap now and expensive after. | Doc + small schema |
| R11 | MSA/SOW | `LIFECYCLE-ARCHITECTURE.md:402-403` and a new §3.6; `cw.agreement` in migration 0009 | See §7. | Doc + schema; **owner decision inside** |
| R12 | Renewal baseline | `LIFECYCLE-ARCHITECTURE.md:75-76, :195-201`; `CLAUSE-LIBRARY-ARCHITECTURE.md:186-189` | See §8. | Doc; **owner decision** |
| R13 | `docs/data-model.md` full refresh | whole file | Add every record shape that now exists: Ladder, Ladder rung, Concession (+ state, approvals), Required approver, Supersession, Clause tag, Conflict rule, Snapshot (+ members, ladder rungs), Ruleset, Run / Run decision / Run finding, Executed agreement, Executed document, Signature evidence, Legal hold, Review ticket (**re-tag `[spec]` → implemented**, `:209`), Review segment, Review candidate, Clause draft, Negotiation, Round, Position, Position event, External clause, Obligation template, Obligation instance, and `origin` on the clause version. Extend the provenance tagging (`:6-15`) with a third tag for "implemented in the backend schema" — today `[code]` means *the prototype*, which is now the smaller half of the system. | Doc (largest) |
| R14 | `docs/README.md` contents table | `docs/README.md` ("the ten choices", "Seven verified places") | Minor counts drift alongside R3/R13. Fold in; do not open a separate package. | Doc |

---

## 7. MSA / SOW — recommendation

**Status: owner-decision item, with an engineering recommendation.** `Unresolved` on the commercial
convention; `Inferred` on the mechanism.

The evidence is thin on purpose — the structure is named once, as open question 4
(`LIFECYCLE-ARCHITECTURE.md:402-403`), and modelled nowhere. `cw.agreement` is flat
(`0003:14-23`). So this cannot be settled from evidence in the repository; it is a decision about
how the business contracts.

**Recommendation — the smallest thing that is actually right:**

- Two columns on `cw.agreement`, not a new hierarchy:
  `agreement_kind text not null default 'standalone' check (… in ('standalone','master','sow'))`
  and `parent_agreement_id text references cw.agreement(agreement_id)`, with a CHECK that a `sow`
  has a parent and a `master`/`standalone` does not, plus a trigger forbidding a parent that is not
  a `master` (a CHECK cannot see another row).
- **Composition reuses machinery that exists.** A SOW carries its own run and its own decision set;
  effective terms are the ordered composition SOW-over-master, governed by the same Order of
  Precedence baseline clause that already governs amendments (`LIFECYCLE-ARCHITECTURE.md:203-206`).
  No new resolution rule, no new engine concept.
- Obligations register per instrument and inherit the master's where the SOW is silent — which is
  exactly the composition above, applied to `obligations[]`.
- Termination: terminating a master while a child SOW is active is **reported, not silently
  permitted**. A view `cw.orphaned_sow` and a blocking condition at termination.

**Cost, openly.** One migration, one trigger, one view, one spec section (~1 day of the schema
work). It does *not* deliver multi-agreement obligation composition end to end, because obligations
are not built yet (`docs/REVIEW-2026-07-25.md:181-182` lists them as absent). So the honest scope is
**model the structure now so obligations can compose later** — not "support MSA/SOW".

**What needs the owner:** whether a SOW may carry clause positions that *contradict* its master
(precedence SOW-over-master) or may only add to it. I recommend SOW-over-master for the categories
the SOW addresses, because that is the ordinary commercial reading, but it is a legal convention and
should be confirmed rather than assumed.

---

## 8. Renewal baseline — recommendation, and a disagreement with the proposal

The proposal recommends: *"renewal opens from the executed agreement's positions with the drift
report alongside — matching how counterparties actually behave — with library-standard restart as an
explicit choice"* (`IMPROVEMENT-PROPOSAL-2026-07-25.md:119-121`). I was asked to evaluate it rather
than adopt it. **I partly disagree**, and the disagreement is about the default, not the substance.

**What the documents currently say, and it is deliberate.** Renewal re-resolves against the
*current* library (`LIFECYCLE-ARCHITECTURE.md:75-76`, `:195-201`), and the CLA calls that "how
executed agreements converge on current approved language … the mechanism that makes version history
worth keeping rather than merely tidy" (`CLAUSE-LIBRARY-ARCHITECTURE.md:186-189`). So the proposal
reverses stated design intent in two documents, not merely a gap. `Observed`.

**The case for the proposal's default is real.** Vendors renew from what they signed. Opening from
the library discards every concession won last time and reopens settled points, which reads to the
counterparty as a regression and costs negotiation rounds. `docs/REVIEW-2026-07-25.md:119-120`.

**The case against it is stronger, on this system's own terms:**

1. The drift report exists to catch stale and superseded language at exactly this moment
   (`LIFECYCLE-ARCHITECTURE.md:198`). Opening from the executed positions makes stale language the
   *default* and current language the exception — inverting the control.
2. It contradicts the system's most load-bearing rule. "Accepting a vendor's language is a
   concession, not a library change. It records what we agreed on one deal. It changes nothing for
   the next deal" (`CLAUSE-LIBRARY-ARCHITECTURE.md:53-56`). A renewal is the next deal. Defaulting
   to carried concessions promotes one deal's compromise into the next deal's opening position
   silently — the precise thing ADR-0009 exists to forbid.

**Recommendation.** Renewal computes **both** and makes the choice explicit and recorded:

- **Default: the current library.** Unchanged from today's spec.
- **Alongside it, always shown:** the executed positions, and a **carried-concessions list** naming
  every concession the counterparty won last time, with its category, rung, and approver.
- **Carrying a concession forward is an act**, not a default — one click per concession, or "carry
  all" as a single recorded approval, going through the same Required-Approvers path as the original
  concession (§5). It is a new concession on a new deal, and it is approved as one.

This gets the proposal's commercial benefit (the buyer is never blind to what was conceded) without
inverting the drift control or making concessions leak across deals by default.

**Cost.** One extra decision surface at renewal, and one more approval round-trip when concessions
are carried. Mitigated by bulk carry.

**Marked as an owner-decision item.** This is negotiating posture, not engineering. Both options are
buildable at similar cost. The owner should choose between:

- **(A)** proposal's default — open from the executed agreement; library restart is a choice.
- **(B)** this plan's recommendation — open from the library; carrying each concession is a recorded
  act.

I recommend **(B)** and would implement (A) without objection if chosen, provided the drift report
is made blocking rather than advisory to compensate.

---

## 9. Candidate work packages

Ordered. **D** = documents only (cheap, safe, no test surface). **S** = schema build (needs a test
suite and mutation entries).

| # | Package | Kind | Depends on | File-collision notes |
|---|---|---|---|---|
| **WP-C1** | ADR hygiene: amendment notes on ADR-0001 and ADR-0002; correct the index status claim (R1–R3) | D | — | `docs/decisions/ADR-0001*.md`, `ADR-0002*.md`, `docs/decisions/README.md`. No collisions. **Do first** — smallest, and it makes the founding records honest |
| **WP-C2** | Rule-grammar section + citation fix; ADR-0010 `external` clarification; NA self-approval guardrail (R4, R7, R8) | D | — | `ARCHITECTURE.md` (new §2.5a), `NEGOTIATION-ARCHITECTURE.md:182,:193`, `ADR-0010`. **`ARCHITECTURE.md` and `NEGOTIATION-ARCHITECTURE.md` have uncommitted working-tree edits** — rebase on them, do not revert |
| **WP-C3** | Five roles; CLA §3/§7 concession-approval rewrite (R5, R6) | D | Owner decision 4 (settled) | `ARCHITECTURE.md:309` — **collides with WP-C2** in the same file; sequence C2 then C3, or merge them |
| **WP-C4** | LCMA repairs, doc half: e-signature capture, legal hold, MSA/SOW §3.6, renewal baseline (R9–R12) | D | §7 and §8 owner decisions | `LIFECYCLE-ARCHITECTURE.md`, `CLAUSE-LIBRARY-ARCHITECTURE.md:186-189` — **collides with WP-C3** in the CLA; sequence |
| **WP-C5** | Migration `0007_review_queue.sql` + `backend/db/test/review.test.mjs` + mutation entries (§2) | S | — | New migration file. Touches `backend/db/test/mutation-check.mjs` — **collides with every Phase 1/2 package** that adds mutations; expect merge friction there and nowhere else |
| **WP-C6** | Migration `0008_clause_origin.sql` + engine origin + `ai_origin_characters` + run columns (§4) | S | C5 (mint sets origin) | Edits `cw.clause_version_immutable()` — **hard collision with Phase 1 D4**, which edits the same function. Edits `model.py`, `loader.py`, `run.py`, `docx.py` — `docx.py` has uncommitted edits. **Changes every snapshot hash**; all engine fixtures move |
| **WP-C7** | Reconcile `promote_concession()` with the gate: extract `mint_clause_version`, add `source_ticket_id` + trigger (§3) | S | C5, **and Phase 1 D1 must land first** | Rewrites part of `0003_ladders_and_concessions.sql:183-227` — **hard collision with D1**. Consider folding into the D1 package |
| **WP-C8** | Migration `0009_governance_and_lifecycle.sql`: Required Approvers, concession approval state, signature evidence, legal hold, MSA/SOW columns (§5, R9–R11) | S | C3, C4; **Phase 1 D5/D6 must land first** | Adds columns and a state trigger to `cw.concession` — **hard collision with D5 (ladder_id/rung) and D6 (immutability trigger)**. D6's trigger must exempt `state` |
| **WP-C9** | Migration `0010_negotiation_record.sql`: negotiation, round, position, position_event, external_clause, `cw.position_state` view + tests (§10) | S | C5, C6 | New file. Rounds reference `cw.run`; positions reference tickets. No collisions beyond `mutation-check.mjs` |
| **WP-C10** | `docs/data-model.md` full refresh + `docs/README.md` count drift (R13, R14) | D | **All of the above** — it documents what exists | Single file, but it must go last or it documents a moving target |

**Ordering constraints, condensed:** C1 → C2 → C3 → C4 (documents, sequential because they share
files) can run entirely in parallel with the schema track. Schema track: **[Phase 1 D1, D4, D5, D6]**
→ C5 → C6 → C7 → C8 → C9. C10 closes.

---

## 10. The negotiation record (WP-C9), in brief

Per `NEGOTIATION-ARCHITECTURE.md:236-249`, append-only like runs.

- `cw.negotiation` — `negotiation_id`, `agreement_id`, `paper check in ('ours','theirs')`,
  `opened_on`, `state`, all immutable except a closing timestamp.
- `cw.negotiation_round` — `(negotiation_id, round_no)` PK, `direction check in
  ('issued','received')`, `document_sha256 check (~'^[0-9a-f]{64}$')` (matching
  `0006:54`), `storage_uri`, `sent_on`, `actor`, `run_id references cw.run`. Immutable once closed
  via the `cw.run_immutable()` pattern (`0005:134-152`).
- `cw.position` — identity only: `position_id`, `negotiation_id`, `category_key`, `our_clause_id` /
  `our_version`, `their_text_ref`, `round_raised`.
- `cw.position_event` — **every movement, append-only**: `(position_id, seq)`, `round_no`,
  `state check in ('open','conceded','held','withdrawn','escalated','settled')`, `current_rung`,
  `actor`, `note`.
- `cw.position_state` view — the latest event per position.

**Design choice worth stating:** positions get an append-only event log plus a view rather than a
mutable status column, because "a point marked `held` in round 2 that reappears in round 5 is the
same position reopening" (`NEGOTIATION-ARCHITECTURE.md:75-77`) — which a current-state column
cannot express and an event log gives for free. It also avoids adding a second mutable state machine
to a schema whose stated principle is that history is not edited. `Inferred`.

---

## 11. Size estimate and the minimum coherent subset

**Is Phase 3 larger than Phases 0–2 combined? Yes, substantially.** `Inferred`, from counting the
surfaces:

| | Phases 0–2 | Phase 3 (this plan) |
|---|---|---|
| New migrations | 0 | **4** (0007–0010) |
| Modified migrations | ~5 (targeted fixes) | 2 (0002 trigger/view, 0003 function) |
| New test suites | 0 (extend 5 existing) | **~4** (review queue, origin, governance, negotiation) |
| Engine files touched | ~6, with tests present | 5, plus **every snapshot fixture rehashed** |
| Document rewrites | 3 short hygiene edits | **6 documents, incl. a full `data-model.md` rebuild** |
| New subsystems | 0 | 4 (Review queue, drafts, Required Approvers, negotiation record) |

Phases 0–2 are hardening: existing code, existing tests to extend, a known fault per fix. Phase 3
creates subsystems with nothing to extend, and each needs its own suite running as a real role plus
its own mutation entries. A realistic ratio is **1.5–2× Phases 0–2 combined.**

### Minimum coherent subset

If Phase 3 must shrink, this is the smallest set that still leaves the system honest and unblocked:

**Keep — WP-C1, WP-C2, WP-C3, WP-C5, WP-C6.**

- C1–C3 make the founding records true and settle the CLA §3/§7 contradiction on paper. Cheap, and
  a contradiction at the centre of the scaling claim should not survive the phase.
- C5 builds the gate. Everything downstream — Builder drafts, concession promotion, the Library
  Builder itself — is blocked on it, and ADR-0003's "only mutation surface" is otherwise a claim
  with no implementation.
- C6 makes `origin` and both provenance counts real **before the first AI-drafted clause is
  approved**, which is the sequencing ADR-0010 and the review both ask for
  (`docs/REVIEW-2026-07-25.md:96-97`).

**Defer, visibly — WP-C4, WP-C7, WP-C8, WP-C9, WP-C10.** Each deferral has a cost that must be named
in the final report, not buried:

- **C7 deferred** → two minting paths exist; the "single mutation surface" claim stays partly
  aspirational. Mitigate by adding a comment in 0003 naming the debt.
- **C8 deferred** → owner decision 4 is documented (C3) but not enforced. **This is the most
  uncomfortable deferral**, because the owner asked for it explicitly. Recommendation: if anything
  from the defer list is pulled back in, pull C8.
- **C9 deferred** → negotiation stays a single-redline feature, as `ARCHITECTURE.md` §2.7 has it.
  No regression, just no progress.
- **C4/C10 deferred** → the lifecycle spec and the data model stay stale. Corrosive but not
  dangerous; both are pure documents and can land any time.

---

## 12. Risks and unknowns

| | Risk | Tag |
|---|---|---|
| 1 | **Snapshot hashes change** when `origin` enters the fingerprint. Free today (no production data, objective contract §5.10) and expensive the moment a run is recorded that matters. Must land early in the phase, not late. | `Inferred` |
| 2 | **Three hard collisions with Phase 1** (`cw.clause_version_immutable()`, `promote_concession()`, `cw.concession`). If Phases 1 and 3 are worked in parallel these will conflict at the file level and, worse, at the semantic level — D6's "concessions are immutable" versus this plan's concession state machine. | `Observed` from the migration sources |
| 3 | **PGlite behaviour under real roles** for the new policies is assumed, not verified (objective contract A2). If PGlite cannot enforce a `for update` policy the way Postgres does, the D1-class test for the review queue is weaker than it looks — and that is a finding to disclose, not to paper over. | `Assumed` |
| 4 | **The `not_self_approved` strictness** diverges from NA:193 as written. Documented in R8, but if the owner wants the qualified form, the CHECK must become a trigger with a role read. | `Unresolved` |
| 5 | **Two genuine owner decisions** (MSA/SOW precedence; renewal baseline) sit inside schema packages. If they are not answered, C8's MSA columns and C4's renewal text stall. Both are surfaced in the final report per objective contract §8. | `Unresolved` |
| 6 | **Obligations do not exist**, so MSA/SOW composition can only be *modelled*, not *delivered*. Anything claiming otherwise would overstate. | `Observed` (`docs/REVIEW-2026-07-25.md:181-182`) |
| 7 | **Permissions and audit are another planner's slice.** If identity derivation (D3) changes from session GUCs to JWT claims, every policy written here keeps its text but changes its meaning. Noted as a dependency, not designed here. | `Assumed` |

---

## 13. Disagreements

1. **With the proposal, on the renewal baseline.** It recommends opening renewal from the executed
   agreement's positions. I recommend the opposite default — open from the current library, show the
   carried concessions alongside, and make carrying each one a recorded act — because the proposal's
   default inverts the drift control (`LIFECYCLE-ARCHITECTURE.md:198`) and silently promotes one
   deal's concession into the next deal's opening position, contradicting the CLA's most load-bearing
   rule (`CLAUSE-LIBRARY-ARCHITECTURE.md:53-56`). §8 states both options and their costs. This
   contradicts objective-contract assumption A4, which treats the proposal's recommendations as the
   owner's preferred answers — I am flagging it as evidence that contradicts the assumption, which is
   what A4 invites.

2. **With the review, on two stale claims.** ADR-0010 and `NEGOTIATION-ARCHITECTURE.md` are
   committed and the ADR index already lists 0010 (V1, V2). Restating those as work would produce a
   package that changes nothing. The remaining index defect (V5) is real and small.

3. **With the review, on "the rule grammar is specified nowhere."** It is specified twice, in code
   and in the backend README (V7). The defect is location and citation, which changes the repair
   from *write a specification* to *move a citation and lift existing text into an architecture
   document* — a much smaller job, and one that should not be padded.

4. **With the review's framing of e-signature capture.** The schema already models counterparts and
   exhibits as first-class hashed byte sets (`0006:43-66`); it is the *spec* that is behind
   (V12). The repair is mostly documentary plus one small table, not a lifecycle rebuild.

5. **On the CLA scaling claim.** The document repair for owner decision 4 must *reduce* the claim at
   `CLAUSE-LIBRARY-ARCHITECTURE.md:88-89`, not reword it. Ladders no longer convert Legal from
   per-negotiation to per-category; they convert Legal's work from authoring to approving. Anything
   softer would be the system telling itself a story — the failure mode this repository has been
   unusually good at avoiding.

6. **On the product boundary.** Two places in this slice invited content-generation designs and were
   declined. Coverage gaps stay a **badged, routed** report to a named person, never something the
   system fills (`CLAUDE.md`, product boundary). And a concession with no clause record produces no
   obligations — the honest answer is that the system *says so, loudly, to the named obligation
   owner*, not that it reads the vendor's prose to guess. `Observed` (`memory.md`, "We are
   responsible for the system, not the contract text").
