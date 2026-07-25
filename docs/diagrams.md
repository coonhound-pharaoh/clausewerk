# Diagrams

The pipeline as pictures, plus the flows and state machines `ARCHITECTURE.md` describes in prose
but does not draw. Rendered by GitHub natively.

---

## 1. Pipeline and the trust boundary

The single most important line in the system is the one between Manifest and Forge.

```mermaid
flowchart LR
  subgraph T1["TIER 1 · inference"]
    direction TB
    INTAKE["Intake<br/><i>interview</i>"] --> MANIFEST["Manifest<br/><i>strict JSON</i>"]
  end

  subgraph T3["TIER 3 · deterministic"]
    direction TB
    FORGE["Forge<br/><i>resolve</i>"] --> VALIDATE["Validate<br/><i>conflict rules</i>"] --> DOSSIER["Dossier<br/><i>render</i>"] --> DOCX["contract.docx"]
  end

  LEDGER[("TIER 2<br/>Ledger<br/><i>clause library</i>")]

  MANIFEST ==>|"the ONLY thing<br/>that crosses"| FORGE
  LEDGER --> FORGE
  DOSSIER --> AUDIT[("Audit log<br/><i>append-only</i>")]

  subgraph T15["TIER 1.5 · negotiate"]
    REDLINE["vendor .docx<br/>redline"] --> MATCH["controller<br/><i>→ clause ID</i>"]
  end

  MATCH --> REVIEW["Review queue<br/><i>Legal verifies</i>"]
  REVIEW ==>|"mints clause"| LEDGER
  MATCH --> AUDIT
  REVIEW --> AUDIT

  style MANIFEST stroke-width:3px
  style FORGE stroke-width:3px
  style LEDGER stroke-width:3px
  style REVIEW stroke-width:3px
```

Nothing downstream of the doubled arrow ever sees free text produced by a model. The manifest
carries only `{category, severity, justification}` triples — and `justification` is evidence shown
to reviewers, never contract text.

---

## 2. Resolution — `resolveClauses(manifest, ledger)`

A pure function. No network, no model. The baseline pass runs to completion before any
manifest risk is considered.

```mermaid
flowchart TB
  START(["resolveClauses"]) --> BASE["<b>Baseline pass</b><br/>filter: alwaysInclude && active"]
  BASE --> BEMIT["emit Decision<br/>severity = 'Baseline'<br/>reason = 'Always-include · §n'"]
  BEMIT --> LOOP{"for each<br/>manifest risk"}

  LOOP --> CAND["candidates =<br/>same category<br/>AND NOT alwaysInclude"]
  CAND --> EMPTY{"any<br/>candidates?"}

  EMPTY -->|no| NULLD["Decision selected = <b>null</b><br/>'No clause available in Ledger'<br/><i>a hard flag, never a guess</i>"]
  EMPTY -->|yes| EXACT{"exact severity<br/>match?"}

  EXACT -->|yes| SEL["select it<br/>'Matched {sev} variant'"]
  EXACT -->|no| FB["fall back to Standard<br/>'No {sev} variant; fell back'"]

  SEL --> SUPP["suppressed = all other candidates<br/><i>retained, not discarded</i>"]
  FB --> SUPP
  SUPP --> LOOP
  NULLD --> LOOP
  LOOP -->|done| OUT(["Decision[]"])

  style NULLD stroke-width:2px
  style SUPP stroke-width:2px
```

> The baseline pass filters on `active`; the manifest pass does not. See
> [finding #1](spec-vs-implementation.md#1-retired-and-expired-clauses-stay-in-the-manifest-driven-candidate-pool).

---

## 3. Redline adjudication

The controller's only permitted output is an **ID and a score**. Every path that cannot produce one
ends at a human.

```mermaid
flowchart TB
  UP["vendor .docx"] --> PARSE["parseRedlineDocx<br/><i>walk w:ins / w:del / w:r</i>"]
  PARSE --> SPLIT["one redline<br/>per changed paragraph"]
  SPLIT --> INFER["infer category<br/><i>best KEYWORD_RULES hit</i>"]
  INFER --> SCORE["score every active clause<br/>in that category"]
  SCORE --> THRESH{"top score ≥<br/>similarityThreshold?"}

  THRESH -->|yes| CAND["return clause ID + score<br/>show top 3 candidates"]
  THRESH -->|no| WIDEN["widen to<br/>full active ledger"]
  WIDEN --> THRESH2{"anything<br/>above threshold?"}
  THRESH2 -->|yes| CAND
  THRESH2 -->|no| ESC["<b>escalate</b><br/><i>never invent</i>"]

  CAND --> HUMAN{"human<br/>decides"}
  HUMAN -->|approve| INSERT["fetch_immutable_text(id)<br/>verbatim insertion"]
  HUMAN -->|edit| TICKET
  HUMAN -->|escalate| TICKET
  ESC --> TICKET["Review ticket"]

  INSERT --> LOG[("audit log")]
  TICKET --> LOG

  style ESC stroke-width:2px
  style INSERT stroke-width:2px
```

Approve inserts already-approved text, so it creates **no** ticket — but it still writes an audit
event. Edit and escalate both create tickets.

---

## 4. Review ticket lifecycle

The only path by which new language enters the Ledger.

```mermaid
stateDiagram-v2
  [*] --> pending: no-ai-match<br/>human-escalated<br/>human-edit

  pending --> confirming: Legal clicks verify
  confirming --> pending: cancel
  confirming --> verified: confirm modal<br/><i>states exactly what is promoted</i>

  pending --> rejected: reject + note

  verified --> [*]: clause minted into Ledger<br/>buyer notified
  rejected --> [*]: returned to buyer<br/>with rationale

  note right of verified
    Mints: derived rationale,
    Policy-DERIVED-* citation,
    today + 2-year expiry,
    named reviewer
  end note
```

Deliberately slow and human-gated. There is no automated transition into `verified`.

---

## 5. Clause lifecycle

`active` is a computed property, not a stored one — which is why a clause can leave the pool with
nobody touching it.

```mermaid
stateDiagram-v2
  [*] --> active: seeded by Legal<br/>or promoted via Review

  active --> expiring: daysToExpiry ≤ 90<br/><i>expiresSoon warning</i>
  expiring --> active: expiry extended
  expiring --> expired: expiry date passes<br/><i>no human action needed</i>

  active --> retired: manually retired<br/><i>retiredReason set</i>
  expiring --> retired: manually retired

  expired --> [*]: leaves selectable pool
  retired --> [*]: leaves selectable pool

  note left of expired
    active = (not retired) AND (not expired)
    Evaluated against a hard-coded
    date in the prototype.
  end note
```

Clause records are **never overwritten** — a contract executed under v1 must still resolve v1. See
[ADR-0006](decisions/ADR-0006-clause-expiry-is-computed-not-stored.md).

---

## 6. Degradation

Every inference call has a deterministic substitute, so the whole pipeline runs with the model
offline.

```mermaid
flowchart LR
  subgraph N["normal"]
    I1["LLM interviewer"] --> C1["LLM classifier"] --> M1["redline matcher"]
  end
  subgraph D["LLM unreachable"]
    I2["31-probe<br/>gap checklist<br/><i>· local</i>"] --> C2["~100 regex rules<br/>+ 8 baseline cats<br/><i>source: fallback</i>"] --> M2["escalate<br/>to Legal"]
  end
  I1 -.->|fails| I2
  C1 -.->|fails| C2
  M1 -.->|below threshold| M2

  D --> SAME["<b>same deterministic pipeline</b><br/>Forge → Validate → Dossier → .docx"]
  N --> SAME
```

The output is a valid contract either way — assembled from the same approved clause text, because
the model was never the thing producing it. See
[ADR-0005](decisions/ADR-0005-deterministic-fallbacks.md).
