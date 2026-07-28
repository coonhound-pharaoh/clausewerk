# Bug and security audit — started 2026-07-28

This is the durable ledger for the repeated whole-codebase audit. Each entry
records a confirmed system defect, the bounded fix, and the evidence used to
validate it. Placeholder contract content is outside this audit.

## Cycle 40 — concession actions accepted false actors

**Observed defect.** A permitted caller could settle or withdraw a concession
while placing an arbitrary identity in immutable `settled_by` or
`withdrawn_by`. The false actor was also copied into the audit chain.

**Fix.** Before-insert triggers bind settlement and withdrawal attribution to
`cw.app_actor()` for application-role sessions. Named approval subjects remain
unchanged, and owner writes remain available for historical imports.

**Regression proof.** The governance suite supplies `impostor@clausewerk` for
both successful actions and verifies the permanent rows and audit payloads name
the authenticated Legal reviewer and requester.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 39 — governance configuration accepted false actors

**Observed defect.** A Legal Admin could assign an attorney or add a required
approver while placing an arbitrary identity in `assigned_by` or `added_by`.
Those provenance fields permanently claimed somebody else configured the
approval obligations.

**Fix.** Before-insert triggers bind the configuration provenance fields to
`cw.app_actor()` for application-role sessions while leaving the configured
attorney and approver identities unchanged. Owner writes remain available for
migrations and historical imports.

**Regression proof.** The governance suite supplies `impostor@clausewerk` for
both operations and verifies the rows name the authenticated Legal Admin as the
configuring actor.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 38 — override-watcher evidence accepted false actors

**Observed defect.** An Administrator could add or remove an override watcher
while supplying arbitrary `added_by` or `removed_by` identities. The false
identity was stored and copied into the audit payload that explains who changed
the notification audience.

**Fix.** The existing before-write watcher trigger binds addition and removal
attribution to `cw.app_actor()` for application-role sessions before auditing.
Owner writes remain available for migrations and historical imports.

**Regression proof.** The settings/watcher suite supplies
`impostor@clausewerk` for both operations and verifies watcher state and audit
payloads use the authenticated Administrator.

**Validation.**

- `node backend/db/test/settings-split.test.mjs`
- Result: 24 passed, 0 failed.

## Cycle 37 — account history accepted false actors

**Observed defect.** An Administrator could create or revoke an account while
placing arbitrary identities in the immutable `created_by` and `revoked_by`
fields. Audit events still named the authenticated actor, leaving contradictory
permanent access-history evidence.

**Fix.** A before-write trigger binds account creation and revocation
attribution to `cw.app_actor()` for application-role sessions. Owner writes
remain available for the bootstrap ceremony, migrations, and historical
imports.

**Regression proof.** The administrator suite supplies
`impostor@clausewerk` for both operations and verifies the stored account row
and revocation audit payload contain the authenticated Administrator.

**Validation.**

- `node backend/db/test/administrator.test.mjs`
- Result: 46 passed, 0 failed.

## Cycle 36 — records delegation accepted false actors

**Observed defect.** An Administrator could override `granted_by` when
delegating redaction authority and supply any `revoked_by` when withdrawing it.
The false revoker was copied into the audit chain, falsifying accountability
around authority that permits irreversible content removal.

**Fix.** The existing before-write delegation trigger binds grant and
revocation attribution to `cw.app_actor()` for application-role sessions before
it creates audit events. Owner writes remain available for migrations and
historical imports.

**Regression proof.** The redaction suite supplies `impostor@clausewerk` for
both operations and verifies the stored fields and revocation audit payload
contain the authenticated Administrator.

**Validation.**

- `node backend/db/test/redaction.test.mjs`
- Result: 22 passed, 0 failed.

## Cycle 35 — agreement-share evidence accepted false actors

**Observed defect.** Legal callers could explicitly override `shared_by` and
supply any `revoked_by` when sharing or unsharing an executed agreement. The
false revoker was also copied into the audit chain, while the false sharer was
shown in the reading room as permanent attribution.

**Fix.** The existing before-write share trigger binds both fields to
`cw.app_actor()` for application-role sessions before it creates audit events.
Owner writes remain available for migrations and historical imports.

**Regression proof.** The reading-room suite supplies
`impostor@clausewerk` for both operations and verifies the stored fields and
audit payload contain the authenticated Legal actors.

**Validation.**

- `node backend/db/test/reading-room.test.mjs`
- Result: 23 passed, 0 failed.

## Cycle 34 — legal-hold evidence accepted false actors

**Observed defect.** The roles allowed to open and release legal holds could
write arbitrary `opened_by` and `released_by` values. Those values are
immutable and copied into the audit trail, so a permitted caller could
permanently attribute a litigation hold or consequential release to somebody
else.

**Fix.** A before-write trigger binds opening and release attribution to
`cw.app_actor()` for every application-role session. Owner writes remain
available for migrations and historical imports.

**Regression proof.** The governance suite now attempts both operations with
`impostor@clausewerk` while authenticated as `legal@clausewerk`, and verifies
the permanent audit payload records the authenticated actor.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 33 — direct negotiation writes accepted false actors

**Observed defect.** Negotiation row policies correctly scoped who could write,
but the append-only identity fields remained supplied by that writer.
`opened_by`, `baseline_chosen_by`, round `actor`, and movement `actor` could all
name somebody other than the session person, permanently falsifying the
commercial history.

**Fix.** Before-insert triggers bind all four fields to `cw.app_actor()` for
application-role writes. Owner-run migrations retain the ability to preserve
actors while importing historical records.

**Regression proof.** A requester writes their owned negotiation, round, and
movement while naming a different requester in every actor field. The stored
record names the authenticated requester in all four places, and every
append-only, ordering, access, renewal, and Legal control remains green.

**Validation.**

- `node backend/db/test/negotiation.test.mjs`
- Result: 55 passed, 0 failed.

## Cycle 32 — renewal decisions could be attributed to another person

**Observed defect.** `cw.open_renewal` authorizes the session actor against the
deal, but separately accepted an actor argument for `opened_by` and
`baseline_chosen_by`. An authorized requester or Legal caller could therefore
put somebody else’s name on the renewal and baseline decision.

**Fix.** Bind the renewal actor argument to `cw.app_actor()` before the
ownership check or any write.

**Regression proof.** A requester attempts to open their own renewal under
another requester’s name and is refused with no negotiation row created.
Requester and both Legal role controls still open correctly attributed
renewals, and both baseline paths remain reachable.

**Validation.**

- `node backend/db/test/negotiation.test.mjs`
- Result: 55 passed, 0 failed.

## Cycle 31 — retention destruction actors could be impersonated

**Observed defect.** `cw.retention_destroy` permanently records its actor
argument but did not bind that name to the session actor. An
administrator-role connection could therefore make the destruction decision
under another person’s identity, corrupting both the retention row and audit
chain attribution.

**Fix.** Require the actor argument to equal `cw.app_actor()` before checking
holds, dates, or changing lifecycle state.

**Regression proof.** An administrator-role session attempts to destroy under
the records custodian’s name and is refused without changing `destroyed_on`.
The real named custodian still exercises every hold, due-date, success, and
repeat-destruction path.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 44 passed, 0 failed.

## Cycle 30 — records actors could be impersonated

**Observed defect.** The irreversible redaction and purge definers accepted an
actor argument and checked that named person’s authority, but never required
the name to match the session actor. An undelegated Legal caller could borrow a
delegate’s identity to erase content, and an administrator-role session could
attribute a purge to a different administrator.

**Fix.** Bind each actor argument to `cw.app_actor()` before checking
delegation, retention state, or touching records. The argument remains only the
permanent attribution of the person actually signed in.

**Regression proof.** An undelegated legal admin attempts redaction under a
delegate’s name and an administrator-role session attempts purge under another
administrator’s name. Both are refused before changing lifecycle state; the
real delegate and real administrator controls still succeed.

**Validation.**

- `node backend/db/test/redaction.test.mjs`
- Result: 22 passed, 0 failed.

## Cycle 29 — notification relationships were probeable by viewers

**Observed defect.** `cw.was_notified` bypasses row security to break the
recursive dependency between override requests and their notification rows.
Any viewer could nevertheless call it with another person’s identity and learn
whether that person was notified about a named override request.

**Fix.** Preserve the recursion-safe definer but restore the parent policies’
scope inside it: viewers may ask only about themselves, and requesters only
about a request they opened. Legal, Audit, and the administrator retain the
complete access story.

**Regression proof.** A notified viewer and the request owner still receive
`true`; an uninvolved viewer asking about that notified person receives
`false`. All downstream override visibility checks remain green.

**Validation.**

- `node backend/db/test/override.test.mjs`
- Result: 31 passed, 0 failed.

## Cycle 28 — sharing relationships were probeable by other viewers

**Observed defect.** `cw.is_shared_with` bypasses row security to avoid a policy
recursion, and every viewer could execute it with any agreement and person.
An unshared viewer could therefore discover whether a named person had live
access to a specific signed agreement.

**Fix.** Mirror the sharing table’s subject scope inside the helper. A viewer
may ask only about their own identity; a requester may ask about an agreement
they own; Legal, Audit, and the administrator retain their complete view.

**Regression proof.** The shared viewer and deal owner still receive `true`.
An unshared viewer asking the identical question about the shared person
receives `false`, while all reading-room policies continue to work.

**Validation.**

- `node backend/db/test/reading-room.test.mjs`
- Result: 23 passed, 0 failed.

## Cycle 27 — legal-hold status was probeable across deals

**Observed defect.** `cw.agreement_under_hold` uses definer rights so retention
decisions cannot miss a hidden hold. The function was also callable by
requesters without restoring the legal-hold table’s ownership scope, allowing
an unrelated requester to test whether an arbitrary agreement ID was involved
in active litigation.

**Fix.** Retain the complete result for Legal, Audit, and the records
custodian, but require requester calls to pass `cw.owns_agreement`.

**Regression proof.** With a live hold in place, the deal owner still receives
`true`; another requester querying the same agreement receives `false`. The
retention path remains blocked by the hold.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- Result: 43 passed, 0 failed.

## Cycle 26 — approval helpers disclosed unrelated deal governance

**Observed defect.** The concession and SOW “missing approvers” helpers run as
security definers so settlement checks always see the complete approval
configuration. Both were also explicitly callable by requesters, but neither
restored the deal scope it bypassed. A requester could enumerate the attorney,
deal owner, and required approvers for an unrelated concession or SOW by ID.

**Fix.** Preserve complete results for Legal and Audit while filtering a
requester’s helper input through `cw.owns_agreement`. An unrelated identifier
now returns no governance identities.

**Regression proof.** Both governance workflows compare the deal owner with an
unrelated requester: the owner still receives the complete missing-approver
list, while the unrelated requester receives no rows.

**Validation.**

- `node backend/db/test/governance.test.mjs`
- `node backend/db/test/executed.test.mjs`
- Results: 42 governance tests and 52 executed-agreement tests passed.

## Cycle 25 — requesters could socialise other people’s overrides

**Observed defect.** `cw.socialise_override_request` is a security-definer
function so it can resolve the complete notification audience. That also
bypasses the override-request row policy, and the function did not restore an
ownership check. Any requester who learned another request’s numeric ID could
advance it to `socialised`, notify its audience, and start its decision window.

**Fix.** Resolve the invoker role before acting. Legal retains its intended
ability to advance any pending request, while a requester must be the person
recorded as having opened that request.

**Regression proof.** The override suite has an unrelated requester attempt the
transition, requires an authorization failure, and proves neither state nor
socialisation rows changed. Positive controls prove both the owner-requester
and Legal paths still work.

**Validation.**

- `node backend/db/test/override.test.mjs`
- Result: 30 passed, 0 failed.

## Cycle 24 — terminated agreements could acquire executed records

**Observed defect.** The execution trigger changed an agreement from
`negotiating` to `executed`, but did not check whether its conditional update
matched a row. Filing against a previously terminated agreement therefore
succeeded, creating an immutable executed-agreement record while leaving the
agreement itself terminated.

**Fix.** Require the trigger's status transition to affect exactly one
negotiating agreement. Any other state raises a check violation, rolling the
executed-record insert back atomically.

**Regression proof.** The executed-agreement schema suite terminates a deal,
attempts to file it, requires the state-specific refusal, and confirms no
executed row survived.

**Validation.**

- `node backend/db/test/executed.test.mjs`

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

## Cycle 21 — reconstruction inconsistencies became generic failures

**Observed defect.** The document endpoint translated only
`SnapshotIncomplete` into a fail-closed 409. Other detected stored-run
inconsistencies, including missing ladder members and removed category mappings,
escaped as generic 500 failures.

**Fix.** Treat every engine-detected reconstruction inconsistency as the same
refused-on-merits outcome before document generation.

**Regression proof.** Forced missing-rung and unknown-category reconstruction
errors must each return 409 and no ZIP bytes.

**Validation.**

- `python -m pytest doorway/test_documents.py -q -k "other_rebuild_inconsistencies"`
- `python -m py_compile doorway/documents.py doorway/test_documents.py`

## Cycle 23 — known unprintable wording became a generic failure

**Observed defect.** The document engine deliberately raises
`UnprintableText` when approved wording contains a character XML 1.0 cannot
represent. The endpoint let that known refusal escape as a generic 500.

**Fix.** Preserve the engine's actionable explanation in a refused-on-merits
409 before hashing, auditing, or returning any document bytes.

**Regression proof.** Forced unprintable approved text must return 409 with the
engine explanation and no ZIP bytes.

**Validation.**

- `python -m pytest doorway/test_documents.py -q -k "unprintable_approved_text"`
- `python -m py_compile doorway/documents.py doorway/test_documents.py`

## Cycle 22 — malformed stored manifests became 500s

**Observed defect.** Stored run manifests are JSONB without a database shape
constraint. If reconstruction encounters an invalid object or risk list,
`manifest_from` raises `Malformed` outside the endpoint's refusal handling.

**Fix.** Classify malformed stored manifests as non-reproducible runs and
return a refused-on-merits 409 before resolution or document generation.

**Regression proof.** Forced malformed stored-manifest reconstruction must
return 409 and no ZIP bytes.

**Validation.**

- `python -m pytest doorway/test_documents.py -q -k "malformed_stored_manifest"`
- `python -m py_compile doorway/documents.py doorway/test_documents.py`

## Cycle 20 — malformed ticket IDs escaped integer conversion

**Observed defect.** `str.isdigit()` accepts some Unicode numeral characters
that `int()` rejects, while a thousands-digit ASCII value exceeds Python's
integer-conversion safety limit. Both malformed identifiers became internal
failures.

**Fix.** Require ticket identifiers to contain 1–19 ASCII decimal digits, the
input shape of PostgreSQL `bigint`, before conversion.

**Regression proof.** Unicode superscript, 5,000-digit, negative, and decimal
identifiers must all receive 400 responses without touching the database.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "malformed_ticket_ids"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 19 — provider redirects could receive the API key

**Observed defect.** Python's default HTTP redirect handler copies ordinary
headers, including `Authorization`, into the redirected request even when its
host changes. The OpenAI key was stored in that redirectable header set.

**Fix.** Add authorization as an unredirected request header. It is sent to the
configured endpoint but excluded from every redirect request Python constructs.

**Regression proof.** Python's real redirect handler builds a request to an
attacker host from the captured provider request; the original has the key and
the redirected request does not.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "not_copied_to_a_redirected_host"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 18 — truncated model HTTP replies escaped

**Observed defect.** A truncated provider response can raise
`http.client.IncompleteRead`. That protocol exception is not an `OSError`, so it
escaped the advisory adapter instead of recording an absence.

**Fix.** Treat standard-library HTTP protocol exceptions as unreachable-provider
outcomes alongside URL, timeout, and operating-system failures.

**Regression proof.** A fake response raises `IncompleteRead` from its bounded
read; the adapter must return an absence naming that failure type.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "truncated_provider"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 17 — structured model provenance was stringified

**Observed defect.** A provider's object, array, number, boolean, or blank
`model` field was converted to text and stored as the model version, fabricating
provenance for an otherwise valid judgment.

**Fix.** Accept provider-reported model identity only as nonblank text. Use the
requested model only when the response omits the field; malformed supplied
provenance makes the judgment absent.

**Regression proof.** Five malformed model values must return absent judgments
with unknown model-version provenance.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "structured_model_provenance"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 16 — non-object provider envelope raised

**Observed defect.** A syntactically valid top-level JSON array, string, number,
or null reached `payload.get()` and raised `AttributeError`, violating the
adapter's guarantee that advisory failures never interrupt governed work.

**Fix.** Require a JSON object provider envelope before reading model
provenance or choices; otherwise record an absent judgment.

**Regression proof.** Four valid non-object JSON types must each return an
absence naming the wrong envelope shape.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "non_object_provider"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

## Cycle 15 — structured model basis was stringified

**Observed defect.** A list, object, number, or boolean in the model's `basis`
field was converted with `str()` and stored as if it were the requested
explanatory sentence.

**Fix.** Accept a basis only when it is text or absent. Structured and scalar
non-text values make the whole reply an absent malformed judgment.

**Regression proof.** Object, list, number, and boolean basis values must not
produce recorded judgments or stored basis text.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "structured_basis"`
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

## Cycle 14 — non-numeric model scores were coerced

**Observed defect.** Python converted JSON booleans and numeric strings through
`float()`. A malformed provider response such as `{"score": true}` therefore
became a recorded score of `1.0`.

**Fix.** Require the score to be an actual finite JSON integer or float,
explicitly excluding booleans, before applying the zero-to-one range check.

**Regression proof.** Boolean, string, and null scores must all produce absent
judgments rather than numbers.

**Validation.**

- `python -m pytest doorway/test_advisory.py -q -k "non_numeric_scores"`
- `python -m py_compile doorway/advisory.py doorway/test_advisory.py`

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
