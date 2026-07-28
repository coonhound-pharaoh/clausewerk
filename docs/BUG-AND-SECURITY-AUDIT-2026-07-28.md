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

## Cycle 3 — embedded NUL in static paths

**Observed defect.** A `%00` escape decoded into an embedded NUL and was passed
to `Path.resolve()`, which raises an unexpected exception. Malformed caller
input therefore became a 500 instead of a bounded 400 response.

**Fix.** Reject decoded NUL characters before constructing or resolving a
filesystem path.

**Regression proof.** The protocol suite submits `/assets/app%00.js` and
requires a 400 refusal from the URL-decoding boundary.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`
- `python -m pytest engine -q`
- Results: 12 protocol tests passed, both changed Python files compiled, and
  197 engine tests passed.

The database-backed doorway suite could not reach terminal output while
pre-existing session-store work and other test processes were using the shared
development database. It is not claimed as passing evidence for this cycle.

## Cycle 2 — blank duplicate query selectors

**Observed defect.** Query parsing discarded blank values before counting a
selector's occurrences. `run=&run=RUN-2` therefore passed as one selector even
though the caller supplied two, allowing different HTTP components to disagree
about which value named the requested document.

**Fix.** Preserve blank query values during parsing so the existing
exactly-once check sees and rejects every duplicate spelling.

**Regression proof.** The protocol test now covers both two nonblank selectors
and a blank plus nonblank selector; each must produce a 400.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`
