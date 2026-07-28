# Bug and security audit — started 2026-07-28

This is the durable ledger for the repeated whole-codebase audit. Each entry
records a confirmed system defect, the bounded fix, and the evidence used to
validate it. Placeholder contract content is outside this audit.

## Cycle 1 — ambiguous duplicate Content-Type fields

**Observed defect.** The HTTP doorway accepted more than one `Content-Type`
field and silently used the first value to decide whether a POST body was JSON
or a document. Different HTTP hops can select or combine duplicate fields
differently, making the meaning of one request ambiguous.

**Fix.** Reject any POST carrying multiple `Content-Type` fields before reading
its body. This matches the doorway's existing fail-closed handling for duplicate
`Content-Length` and `Authorization` fields.

**Regression proof.** `doorway/test_server_protocol.py` sends conflicting JSON
and DOCX media types, asserts a 400 response, and proves no body byte was read.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`
- `python -m pytest engine -q`
- Results: 12 protocol tests passed, both changed Python files compiled, and
  197 engine tests passed.

The database-backed doorway suite could not reach terminal output while
pre-existing session-store work and other test processes were using the shared
development database. It is not claimed as passing evidence for this cycle.
