# Bug and security sweep — 2026-07-28

Ten audit/fix cycles, each recorded after a reproduction and before its focused
commit. Content wording is outside this sweep; every finding concerns system
behaviour.

## 1. Truncated JSON was accepted

**Risk.** The JSON doorway trusted `Content-Length` without checking that the
declared number of bytes arrived. A short but independently valid JSON prefix
could therefore be acted on as though it were the complete request.

**Fix.** The doorway now compares the received byte count with the declared
count and returns 400 before parsing or dispatching an incomplete request.

**Proof.** `test_truncated_json_is_refused_before_it_reaches_the_app` sends a
declared 20-byte body containing only `{}` and closes the write side. It proves
the response is 400 and the application receives nothing.

## 2. Unsupported chunked requests could desynchronise parsing

**Risk.** The doorway does not decode HTTP chunked request bodies, but previously
accepted the `Transfer-Encoding` header. It dispatched an empty body while the
encoded bytes remained unread, creating an ambiguous request boundary.

**Fix.** JSON and document receivers now reject every transfer-encoded request.
Only the explicitly supported fixed-length request framing reaches the app.

**Proof.**
`test_chunked_request_is_refused_instead_of_desynchronising_the_connection`
sends a real chunked request and proves it receives 400 without dispatch.

## 3. Non-finite numbers crossed the JSON boundary

**Risk.** Python accepts `NaN`, `Infinity`, and `-Infinity` as JSON even though
the JSON standard and PostgreSQL do not. These special values also make normal
range comparisons unreliable, so a malformed caller value could survive one
check and fail much later as a service error.

**Fix.** The doorway's single JSON parser now rejects all non-finite constants
as malformed JSON.

**Proof.** `test_non_finite_json_numbers_are_refused` covers all three spellings
and proves each gets 400 before application dispatch.

## 4. Deep JSON escaped request-error handling

**Risk.** A deeply nested JSON body below the byte limit exhausted Python's
parser depth. The exception skipped the malformed-input branch and reached the
last-resort 500 handler, giving an unauthenticated caller a repeatable internal
failure path.

**Fix.** Parser-depth exhaustion is now treated like every other unreadable JSON
body and refused with 400.

**Proof.**
`test_excessively_nested_json_is_a_bad_request_not_a_service_failure` sends
2,000 nested levels and proves the app is never called.

## 5. Negative body lengths reached the application

**Risk.** A negative `Content-Length` parsed successfully and the JSON path
treated it as an absent body. Invalid HTTP framing could therefore be dispatched
as a valid empty request instead of being stopped at the socket boundary.

**Fix.** Both JSON and document receivers now reject negative declared lengths
with 400.

**Proof.** `test_negative_content_length_is_refused_before_dispatch` sends the
invalid header over a raw socket and proves there is no application call.

## 6. Valid bearer authentication could be discarded

**Risk.** HTTP authentication scheme names are case-insensitive, but the doorway
recognized only the exact text `Bearer`. A conforming client or intermediary
using `bearer` caused a valid session to be treated as absent.

**Fix.** The scheme is compared case-insensitively while empty credentials and
all non-bearer schemes remain rejected.

**Proof.** `test_bearer_authentication_scheme_is_case_insensitive` exercises the
wire and mixed-case parser result.

## 7. Tokens and contracts could be retained in caches

**Risk.** API replies had no cache prohibition. A browser or shared intermediary
could retain a sign-in response containing a bearer token or a generated
contract after the user left the screen.

**Fix.** Every JSON response and every document download now carries
`Cache-Control: no-store`.

**Proof.**
`test_sensitive_api_responses_are_not_stored_by_browsers_or_proxies` verifies
the header on both response paths.

## 8. Browsers were allowed to reinterpret response types

**Risk.** Without an explicit no-sniff policy, a browser may reinterpret a
declared response type as executable content. That is unsafe on the same origin
that serves authenticated workspaces.

**Fix.** Static files, JSON replies, and downloads now send
`X-Content-Type-Options: nosniff`.

**Proof.** `test_api_responses_disable_browser_content_sniffing` verifies both
API response branches; the static branch uses the same fixed header.

## 9. The authenticated workspace could be framed

**Risk.** Another site could embed Clausewerk and place deceptive controls over
its real buttons, causing a signed-in person to perform an unintended act.

**Fix.** Static screens, JSON responses, and downloads now send
`X-Frame-Options: DENY`.

**Proof.** `test_authenticated_origin_cannot_be_embedded_for_clickjacking`
verifies the policy on both API response branches.
