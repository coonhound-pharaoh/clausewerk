# Clausewerk — Improvement Proposal (2026-07-25)

The plan that follows from [`docs/REVIEW-2026-07-25.md`](docs/REVIEW-2026-07-25.md). Finding
numbers (D1…, E1…) refer to that review.

Ordering principle: **decisions before code, enforcement holes before new features, seams before
surfaces.** Everything in Phases 1–2 is cheap now and expensive later — there is no production
data yet, so schema and hash-format changes are still free.

---

## Phase 0 — Decisions (owner + Legal; no code)

**All five decided by the owner on 2026-07-25** — recorded individually in `memory.md`. Summary:

1. **Footer claim — decided.** No provenance count is printed on the contract document; the old
   footer line is removed (done — backend and prototype, tests green). Both counts are computed
   and kept in the system record. The zero-authored property is still asserted by test on every
   build.
2. **Unedited-approval rate — decided.** Legal owns it. The threshold will be set in
   consultation with counsel later; until then the rate is measured and visible.
3. **Counterparty disclosure — rejected.** No disclosure that wording began as an AI draft,
   absent a legal requirement — none is known in US or EU law for lawyer-approved B2B contract
   language. Confirm when counsel is next engaged; revisit if a jurisdiction adopts such a rule.
4. **Concession approval — decided.** Settling at a fallback position requires the Requester
   **and** the assigned attorney, plus any **Required Approvers** configured for the contract
   (executive leadership, other management, and stakeholder departments such as ISO, Privacy,
   Compliance, Risk). Build work that follows: a configurable Required-Approvers model, and
   updating CLA §3/§7 to match (moved to Phase 3).
5. **Supplier-paper obligations — reframed by the owner.** Clausewerk is responsible for the
   *system*, not for contract content. The product's job is to badge what is and isn't covered
   and give the responsible person a place to act — content coverage is the operator's
   responsibility. This principle is recorded in `memory.md` and `CLAUDE.md` and governs how
   future gaps of this kind are framed.

**Remaining Phase 0 hygiene:** commit ADR-0010 and `NEGOTIATION-ARCHITECTURE.md`; add "amended
by ADR-0010" notes to ADR-0001 *and* ADR-0002; update `docs/decisions/README.md` (index 0010;
correct the "all implemented in the prototype" claim).

---

## Phase 1 — Close the enforcement holes (backend; ~days, not weeks)

Fix the HIGH findings while breaking them is still free.

**Database**

1. **D1 — Fix concession promotion under real permissions.** Add the missing UPDATE policy (or
   make the function `security definer` with an explicit role check), and add the test that
   would have caught it: run the whole promotion path *as* `legal_admin`, not as the owner.
2. **D2 — Make the audit chain safe under concurrency.** Serialise chain append (advisory lock
   or a single-row chain-head table), and anchor the tail (periodic signed checkpoint of the
   latest hash) so truncation is detectable. Document the scheme — it is currently the
   unspecified foundation of every tamper-evidence claim.
3. **D3 — Stop trusting self-asserted identity.** Short term: document loudly that the GUC
   scheme requires a fully trusted connection layer and is incompatible with transaction-mode
   pooling. Real fix: derive role/actor from the authenticated connection (JWT claims via a
   security-definer accessor), never from client-settable variables.
4. **D4 — Close the immutability holes.** Extend the clause-version trigger to protect
   `reviewer` and forbid un-retiring; audit both directions of the retired flag; protect
   `effective_on` and un-retirement on conflict rules. Add mutation checks for each.
5. **D5 — Make the floor actually absolute.** Floor lookup must match the concession's severity
   (and fail loudly if no ladder exists); record `ladder_id` + rung on the concession; make
   published rungs immutable like everything else.
6. **D6/D7 — Finish the state stories.** Immutability trigger + audit on concessions; a proper,
   audited status transition for agreements, tied to execution.

**Engine ↔ database seam**

7. **E1 — Store ladder status in the snapshot** (add the column, write it, rebuild from it) —
   or remove it from the hash deliberately and document why. Either way, add a degraded-ladder
   fixture to the reproducibility tests.
8. **E2 — Build the write-side counterpart of `loader-sql.test.mjs`:** insert
   `snapshot_rows()` / `run_rows()` output into the real migrated schema and round-trip it back
   through `snapshot_from_rows`. This single test converts the seam from "two parallel worlds"
   to "one system" and will catch the already-present category-label/key mismatch.
9. **E3 — Decide and enforce version preference in resolution.** Recommendation: newest
   selectable version wins; add the two-selectable-versions fixture.
10. **E4 — A lapsed always-include clause must produce a loud, gating decision record**, not a
    silently shorter contract.

**Definition of done for Phase 1:** every fix lands with (a) a test that runs as the real role
where relevant, and (b) a mutation-check entry proving the test can fail. Extend the mutation
harness to the run store (currently zero mutations target it).

---

## Phase 2 — Harden the edges (~1–2 weeks)

1. **E6 — Treat vendor uploads as hostile:** defused XML parsing (or explicit entity guards) and
   a decompressed-size cap, with tests that feed the parser an entity bomb and a zip bomb.
2. **E5 — Parse real-world Word:** recurse through hyperlink / content-control / smart-tag
   containers; handle tracked moves explicitly (recommendation: treat as delete+insert and say
   so); add fixtures generated from actual Word output, not only hand-built XML.
3. **E7 — Enforce the manifest boundary in the backend:** one function that validates a manifest
   against the category enum — dropping unknowns (recorded as *dropped*, distinct from "no
   clause available") and coercing severity — so a hallucination can never masquerade as a
   library coverage gap.
4. **Sweep the smalls (E8, D8, D9):** dead code, README counts and status, the substring-match
   test, missing CHECK constraints and indexes, TRUNCATE note, silent-DELETE decision.

---

## Phase 3 — Build what the architecture promises next (~weeks)

In dependency order:

1. **The Review queue tables** — ticket, provenance payload, `pending → verified | rejected`
   state machine, mandatory rejection note, and the draft entity from ADR-0010 (prompt, model,
   version, inputs, `edited_before_approval`). This is the architecture's single mutation gate
   and currently exists only as prose; both the concession path and the Builder need it.
2. **Origin on clause versions** (`legal_authored | ai_drafted | vendor_derived | external`) —
   schema + engine model + the second character count, so both provenance counts are computable
   for the system record before the first AI draft is ever approved (they are not printed on
   the contract — Phase 0, decision 1).
3. **Spec repairs before their subjects are built:** write the rule-grammar section the NA cites
   but that doesn't exist; refresh `docs/data-model.md` to cover all four architectures; five
   roles everywhere; specify e-signature byte-capture; add legal hold to retention; decide
   MSA/SOW modelling and renewal-baseline semantics (recommendation: renewal opens from the
   executed agreement's positions with the drift report alongside — matching how counterparties
   actually behave — with library-standard restart as an explicit choice).
4. **Negotiation record (rounds + positions)** per NA §2 — append-only, like runs.

---

## Phase 4 — Deliberately defer or shrink

- **Negotiation-intelligence layer:** ship a counting query ("conceded X on N of M comparable
  deals") instead of the seven-signal engine; revisit when the concession corpus is real.
- **Entitlement valuation:** defer until its commercial-data integrations exist.
- **Decision-record storage:** store suppressed-candidate *references*, not copies, as the CLA
  itself suggests.
- **Package-trade modelling:** don't build it yet — but label concession analytics as
  trade-blind wherever they surface, so the known bias is visible to whoever reads the numbers.

---

## What this buys, in one sentence each

- **Phase 0** (now done, minus commit hygiene) makes the system's most consequential decision
  visible, owned, and honest.
- **Phase 1** makes the guarantees the documents already state actually true under real
  permissions, real concurrency, and real reproduction.
- **Phase 2** makes the one door where untrusted material enters safe against real-world files
  and hostile ones.
- **Phase 3** builds the gate everything else already assumes exists.
- **Phase 4** keeps the system simple where data doesn't yet justify complexity.
