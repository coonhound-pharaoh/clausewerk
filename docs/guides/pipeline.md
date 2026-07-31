# The AI pipeline's way in

*NC-10. For the team wiring an AI pipeline (or any external caller) to
Clausewerk. Two endpoints, one authentication step, and the refusals you must
handle. Nothing here is a new capability — this documents the contract the
service already enforces, and a test executes every example body on this page
against the running service, so the page cannot drift from the code silently.*

## Authentication

Sign in, hold the token, send it on every call:

```
POST /api/sign-in            {"person": "pipeline@example.com"}
→ 200 {"token": "...", "role": "...", "expiresInSeconds": ...}
```

Every subsequent request carries `Authorization: Bearer <token>`. The token
names a **session**, never a role: the database decides what the signed-in
person may do, on every request, and a revoked account is refused at the next
call, not at the next sign-in.

**The identity residue, stated rather than hidden:** sign-in proves nothing
today, by design — it is the seam an identity provider plugs into. How a
pipeline holds a person's credential once that provider is connected is
settled during the identity-provider work, not here.

## The pre-flight: `POST /api/manifests/check`

Run a manifest past the engine before recording anything. The body:

<!-- fixture: manifest-check -->
```json
{
  "vendor": "Northwind",
  "source": "llm",
  "value": "250000",
  "risks": [
    {
      "category": "Data Privacy",
      "severity": "High",
      "justification": "placeholder justification from the model"
    }
  ]
}
```

Rules, exactly as the code enforces them (`manifests.py`):

- `vendor` — required, non-empty.
- `risks` — required, a non-empty list. Each risk must name a non-empty
  `category`; `severity` defaults to `Standard`; `justification` defaults to
  empty.
- A risk's `category` is matched against the library's category **labels**
  (what a model reads in a document), not the internal keys. An unmatched
  label is the `unknown_category` refusal below, with the engine's own
  sentence per category.
- `source` — defaults to `llm` and is **not** narrowed here. The pre-flight
  is a check over anything a model might emit.
- `value` — optional, a plain value.

An accepted manifest answers 200 with the checked risks, `dropped: []`, and
`coerced`: severities the engine rewrote on the way in, with the original
claim — an accepted manifest is not necessarily an untouched one.

**Every check is recorded**, acceptance and refusal alike, to the hash-chained
audit record. Consequence: a role without insert on the audit chain (a
viewer, an auditor) cannot use this endpoint at all — the refusal is about
the chain, uniformly, never about what the model happened to emit.

## The recording act: `POST /api/runs`

Assemble a contract from a manifest and record the run. The body is the
manifest plus the deal it belongs to:

<!-- fixture: run -->
```json
{
  "agreement_id": "AG-PIPE-1",
  "vendor": "Northwind",
  "source": "llm",
  "value": "250000",
  "risks": [
    {
      "category": "Data Privacy",
      "severity": "High",
      "justification": "placeholder justification from the model"
    }
  ]
}
```

Everything the pre-flight requires, plus:

- `agreement_id` — required, non-empty. Whose deal it is remains the
  database's question; the endpoint checks presence only.
- `source` — restricted to exactly `llm`, `fallback` or `manual`, because
  `cw.run.manifest_source` carries a check constraint naming those three.

**The asymmetry is deliberate.** The pre-flight does not narrow `source`
(it is a check over anything a model might emit); the run endpoint does
(it writes a row the constraint governs). Do not "fix" either side to match
the other.

**Attribution is structural.** The record distinguishes a model's manifest
(`llm`), the deterministic fallback (`fallback`), and a person's (`manual`)
by the `source` field on the stored run. Two identical manifests submitted
with different sources produce two records that differ in exactly that field
— a test on this page's examples proves it.

## The refusals a pipeline must handle — three kinds, distinctly

1. **`400`, kind `rejected`** — the body is malformed: a missing vendor, an
   empty risks list, a risk with no category, a bad `source` on `/runs`, an
   object where a plain value belongs. Fix the request; nothing was recorded
   about the contract.

2. **`409`, kind `unknown_category`** — the manifest names a category the
   library does not have. The answer carries `dropped` (the categories) and
   `reasons` (the engine's own sentence per category). The refusal is
   recorded. Do not retry with the category removed unless the model was
   wrong — a dropped risk is a finding, not noise.

3. **`403`, kind `not_permitted` / `409`, kind `refused_on_merits`** — the
   database refused: the role may not act, or the act itself is not allowed
   right now. The `reason` is the schema's own sentence and is the
   authoritative explanation. Never retry a refusal — a refusal is the
   system working.

(`500` with `"error": "the service failed"` is an outage, not a refusal —
the one shape that is not your caller's mistake.)

## What this page deliberately does not cover

- No new endpoint, no SQL — this connection is a document, not a capability.
- Thresholds, disclosure text, category lists — content, placeholder,
  the customer's.
