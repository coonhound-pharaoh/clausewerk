# Final audit — Clausewerk Improvement Proposal, Phases 0–3

- **contract:** OC-CW-2026-07-25-01
- **date:** 2026-07-26
- **verdict:** **Approved, with disclosed residuals.**

---

## 1. Traceability — objective → plan → package → implementation → validation

Every finding in `docs/REVIEW-2026-07-25.md` maps to a package, an implementation report and a
named test with a mutation proving that test can fail.

| Finding | Package | Landed in | Proved by |
|---|---|---|---|
| D1 promotion no-ops under real permissions | WP-06 | `0003` | promotion run as real `cw_legal_admin`; mutation invisible to an owner-run test |
| D2 audit chain false-positives, truncation undetectable | WP-03a/b/c | `0001`, `0007` | timezone + DateStyle matrix; `actor_role` rewrite; fork; truncation |
| D3 identity self-asserted | WP-04 | `0001`, `0007` | reviewer cannot become admin by claim, on a write path |
| D4 immutability holes | WP-05 | `0002`, `0004` | one mutation per protected field |
| D5 floor consults wrong ladder, fails open | WP-07 | `0003` | severity-correct floor; no-ladder raises |
| D6 concessions mutable | WP-06 | `0003` | mutation neuters the *trigger*, not the grant |
| D7 agreement status frozen | WP-08 | `0006` | audited transition; illegal transition raises |
| D8 unenforced coherences | WP-23 | `0002`, `0003`, `0005` | three fixture sites corrected, no assertion lost |
| D9 indexes, TRUNCATE, silent DELETE | WP-25a/b/c | all migrations | deletes raise; `do instead nothing` gone |
| *(new)* `audit_event` had no RLS | WP-03c | `0007` | requester cannot read a rival's payload |
| E1 ladder status unstored | WP-09 | `0005`, engine | degraded ladder reproduces byte-identically |
| E2 write seam wrong | WP-10 | engine, `0005` | real engine output round-trips through the real schema |
| E3a oldest version wins | WP-12 | `resolution.py` | two-selectable-versions fixture |
| E4 lapsed baseline vanishes | WP-13 | `resolution.py` | gating decision record |
| E5 Word containers | WP-15 | `docx.py` | hyperlink / content control / smart tag; moves |
| E6 hostile uploads | WP-14 | `docx.py` | zip bomb and nesting, asserted with real bounds |
| E7 manifest boundary | WP-11 | `manifest.py` | hallucination dropped, recorded as dropped |
| E8 dead code, weak tests | WP-24 | engine, README | both weak tests strengthened |
| Review queue absent | WP-16a/b/c | `0008` | insert-guard, note CHECK, derived edit flag, frozen draft |
| Origin + second count | WP-17 | `0009`, engine | both counts computable; no stored hash changed |
| Required approvers, hold, signature, MSA/SOW | WP-18a–d | `0010`, `0006` | fails closed on an unconfigured deal |
| Negotiation record | WP-19 | `0011` | append-only; both renewal baselines built |
| Spec repairs | WP-20/21/22 | four architecture docs | no document cites the grammar to the wrong section |
| Docs refresh | WP-26/28/30/31 | `docs/`, READMEs | counts and status match the tree |
| Owner decisions U1–U4 | — | `0012`, `0010` | settled as schema rows with reasoning attached |

**E3b (resolution consulting ladders for a preferred rung) is the one scope item deliberately not
built.** It would give the engine a second, quieter selection authority. Recorded in code and in
`data-model.md` §14 rather than dropped silently.

## 2. Gates

| Gate | Outcome |
|---|---|
| 1 Objective contract | Pass |
| 2 Integrated plan | Pass — 16 contested points adjudicated on evidence, 10 planner claims rejected |
| 3 Work packages | **FAIL → remediated → pass.** Four BLOCKs, three oversized packages split, 13 packages had no acceptance criteria, four inert checks identified |
| 4 Implementation | Pass — every package reported, deviations disclosed |
| 5 Validation | Pass — `npm run verify` exit 0 |
| 6 Traceability | Pass — table above |

Gate 3 failing was the most valuable event in the process. It caught two factual errors in the plan
(C-1, C-2), both of which later proved real during implementation.

## 3. What the adversarial structure actually bought

Recorded because the process cost real time and should be judged honestly.

- **Ten planner claims were refuted by evidence**, several of which would have produced working
  code that protected nothing. The largest: building an entity-expansion guard against a threat the
  parser already blocked — a check that **could not fail**, which is worse than no check because it
  reads as protection. It was caught by a reviewer who ran the attack instead of trusting the
  finding.
- **A "nine mismatches" claim was one mismatch** plus its mirror image; the other seven were not
  defects. Building them would have been churn presented as rigour.
- **Two claims removed work** rather than adding it (the rule grammar existed, in the wrong
  artefact; e-signature bytes were already modelled). Both survived hard scrutiny.
- **The strengthened mutation harness immediately found two mispointed checks** on its first run,
  one of them nominally guarding the product's headline claim.

## 4. Residuals — approved *with* these, not despite them

None are hidden; each appears in the migration or module it affects.

1. The audit checkpoint is **anchored but unsigned** — no `pgcrypto` in the test database. It
   constrains application roles, not the database owner.
2. The advisory lock serialising audit appends has **zero test coverage** — the test database is
   single-connection. Shipped as untested and labelled so.
3. The **actor's name** is still self-asserted; the five roles are shared service accounts.
4. Identity is **incompatible with transaction-mode connection pooling**.
5. `check_manifest` has **no production caller** — there is no service layer.
6. Redline fixtures are **hand-built ECMA-376**, not Word output. No Word fidelity is claimed.
7. Retention **gates and records** the destruction decision; it does not destroy bytes.
8. Master/SOW is **structure only** — obligations do not exist anywhere in the backend.

## 5. Verdict

**Approved with disclosed risks.** The guarantees the documents state are now enforced by mechanisms
that have been attacked, and every enforcement has a test that has been proved capable of failing.
The residuals above are limits of the environment and of unbuilt subsystems, not unfinished work
inside the approved scope.

**Not claimed:** that the system is deployable. There is no service layer, no interface, no identity
integration and no deployment. This audit covers the deterministic core and its documents only.
