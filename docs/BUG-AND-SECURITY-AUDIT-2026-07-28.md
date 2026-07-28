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

## Cycle 6 — unexpected database errors leaked as caller mistakes

**Observed defect.** An unexpected psycopg failure fell through to a 400
response containing the driver's raw message. Broken statements could therefore
blame the caller and disclose internal table or column names.

**Fix.** Preserve the existing classifications for operational, privilege,
integrity, trigger, and caller data errors. Log any other psycopg error and
return a redacted service-failure response.

**Regression proof.** A simulated real psycopg `UndefinedColumn` error must
produce a redacted 500 while retaining its diagnostic detail only in stderr.

**Validation.**

- `python -m pytest doorway/test_refusals.py -q`
- `python -m py_compile doorway/refusals.py doorway/test_refusals.py`

## Cycle 7 — unbounded model-provider response

**Observed defect.** The advisory adapter read the provider's entire HTTP
response into memory before parsing it. A malfunctioning or compromised
provider could exhaust the service with an arbitrarily large response.

**Fix.** Read at most one byte beyond a one-megabyte response budget. If that
sentinel byte exists, discard the reply and record an absent judgment.

**Regression proof.** A fake provider sends one byte over the limit; the adapter
reads only the bounded amount and returns an absence naming the oversized reply.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "adapter"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 9 — ambiguous duplicate DOCX members

**Observed defect.** A ZIP can contain two entries with the same
`word/document.xml` name. Python selects one entry while another DOCX reader may
select the other, allowing one upload to represent different negotiated text.

**Fix.** Reject an archive containing any exact duplicate member name before
reading or parsing its document part.

**Regression proof.** A DOCX fixture carries two different document XML entries
under the same name and must raise `NotADocx`.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "duplicate_document_parts"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q` — 198 passed; the expected duplicate-name
  warning comes from constructing the hostile regression fixture.

## Cycle 10 — shallow XML element flood

**Observed defect.** DOCX parsing bounded decompressed bytes and nesting depth
but not total element count. A shallow document containing hundreds of
thousands of empty elements stays below the byte and depth limits while
expanding into a disproportionately large in-memory tree.

**Fix.** Count elements in the streaming tree builder and abandon
`word/document.xml` after 100,000 elements, before completing the tree.

**Regression proof.** A compressed shallow fixture contains 100,001 run
elements and must raise `NotADocx` at the element budget.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "shallow_element_flood"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q`

## Cycle 13 — Word tabs vanished from parsed text

**Observed defect.** `w:tab` elements were ignored by both ordinary document
reading and redline segment extraction. Words separated by a displayed tab in
Word were silently joined.

**Fix.** Preserve Word tab elements as tab characters in readable, kept,
inserted, and deleted text.

**Regression proof.** A changed paragraph carries tabs in all three segment
kinds; the visible, accepted, and original representations must retain them.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "tabs_survive"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q`

## Cycle 11 — unsupported ZIP features escaped DOCX parsing

**Observed defect.** An uploaded DOCX using an unsupported compression method
caused `zipfile` to raise `NotImplementedError` outside the parser's
`NotADocx` contract. Encrypted members similarly raise `RuntimeError`.

**Fix.** Translate unsupported or encrypted ZIP mechanics into a clear
malformed-document refusal at the archive boundary.

**Regression proof.** A valid minimal DOCX has both ZIP compression-method
fields patched to unsupported method 99 and must raise `NotADocx`.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "unsupported_zip_compression"`
- `python -m py_compile engine/docx.py engine/test_docx.py`

## Cycle 12 — line breaks vanished from redline text

**Observed defect.** The redline parser extracted text nodes but ignored
`w:br` elements inside kept, inserted, and deleted runs. Its accepted and
original text could therefore differ from the vendor's actual proposed text.

**Fix.** Extract each run in document order and preserve Word line-break
elements as newline characters for every segment kind.

**Regression proof.** One changed paragraph carries a line break in its kept,
deleted, and inserted runs; both reconstructed texts and all three segments
must retain those breaks.

**Validation.**

- `python -m pytest engine/test_docx.py -q -k "line_breaks_survive"`
- `python -m py_compile engine/docx.py engine/test_docx.py`
- `python -m pytest engine -q`

## Cycle 8 — recursive model-provider JSON escaped the adapter

**Observed defect.** A deeply nested but size-bounded provider reply caused
`json.loads` to raise `RecursionError`. The adapter did not catch it, violating
its promise that an advisory judgment can never interrupt the caller's work.

**Fix.** Treat excessive JSON nesting at either the provider envelope or the
model-content layer as an unreadable reply and record an absent judgment.

**Regression proof.** A fake provider returns 2,000 nested arrays; the adapter
returns an absence rather than raising.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "adapter"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 5 — malformed query percent escapes

**Observed defect.** Query parsing accepted malformed percent escapes literally.
For example, `run=%ZZ` reached the document selector as `%ZZ`, even though the
same invalid URL encoding was already refused on the static-file path.

**Fix.** Reject any query percent sign that is not followed by exactly two
hexadecimal digits before decoding fields.

**Regression proof.** The protocol suite requires `run=%ZZ` to return no
selector and a 400 response.

**Validation.**

- `python -m pytest doorway/test_server_protocol.py -q`
- `python -m py_compile doorway/server.py doorway/test_server_protocol.py`

## Cycle 4 — invalid UTF-8 query selectors

**Observed defect.** Query parsing used replacement decoding. An invalid
selector such as `run=%FF` was silently changed into a Unicode replacement
character before the authorization-scoped lookup.

**Fix.** Decode query fields with strict UTF-8 and classify decoding or field
count failures as malformed caller input.

**Regression proof.** The protocol suite requires `run=%FF` to return no
selector and a 400 response.

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
