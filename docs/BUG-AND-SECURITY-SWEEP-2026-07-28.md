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
