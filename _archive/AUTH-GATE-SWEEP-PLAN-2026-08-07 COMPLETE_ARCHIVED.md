# 139 routes require a session, and nothing checks that — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `doorway/app.py` — the session gate.

---

## In one paragraph, for a business reader

Every request to this service has to prove who is making it before anything
happens. Two requests are deliberately exempt — signing in, and signing out —
and they are handled *above* the check. Everything else, all 139 of them, is
correctly refused without a valid session. **Nothing in the test suite proves
that.** If somebody adds a 140th route above the gate — a health check, a status
page, anything convenient — it would be reachable by anyone on the network, and
every test would still pass.

## The evidence

Driving every registered route with no session:

```
ROUTES: 139   401 with no session: 139
NOT 401: 0
```

So this is prevention, not a live hole.

What protects it today is structure rather than a test: `App.handle` calls
`caller_for` before dispatching, so a route registered in `READS` or `WRITES`
inherits the gate whether its author thought about it or not. That is good
design and it is why the count is 139/139. It is also not enough on its own —
the two exemptions show the shape of the mistake, because they are early returns
placed above the gate, and a third would look exactly like them.

## Why a test, when the structure already prevents it

The structure prevents the *common* case. It does not prevent the case that
actually happens: someone adds an early return above `caller_for` because their
endpoint "doesn't need a user", and nobody notices that "doesn't need a user"
and "may be called by anyone on the network" are the same sentence.

This is the pattern this session has found repeatedly — a property held by
discipline, correct today, with nothing that would report it stopping. It is the
`SECURITY DEFINER` search_path gap again, one layer up, and it deserves the same
answer.

## The fix

A test in `test_server.py` that enumerates every route the service knows —
`READS`, `WRITES`, and the specially-dispatched keys parsed out of `app.py` —
drives each with no token, and requires 401 from all of them.

Parsing the special keys from the source rather than listing them is what keeps
the sweep honest: a new specially-dispatched endpoint is picked up automatically
rather than needing to be added to a list somebody must remember.

**The two exemptions are named explicitly**, with the reason each is safe:
`/sign-in` is how a session is obtained, and `/sign-out` does nothing at all
without a token to end. A third name appearing in that set should be a
deliberate act with a written reason, which is the whole point.

## How it is proved — and the first version failed this

Green, then **proved to bite**: a route is temporarily added above the gate and
the sweep must name it.

**The first version did not.** It enumerated `READS`, `WRITES` and the
specially-dispatched keys and drove each with no token — which proves the 139
known routes are gated and is blind to the one case that matters. A deliberately
added public `/health-probe` sailed through it green, because a brand-new early
return is in none of those collections. That is the exact mistake the guard
exists to catch, and the guard did not catch it.

So the check moved to where the mistake happens: it reads `app.py`, finds the
line inside `handle` that resolves the caller, and asserts the only request
paths mentioned above it are the two exemptions. That version names
`/health-probe` when it is added.

A second, quieter fault was caught the same way: anchoring on the first mention
of `caller_for` in the file landed in `preflight_session` rather than in
`handle`, so the scanned region was empty and the test passed over nothing. The
anchor is now inside `handle`, and the reason is written beside it.

## Not in scope

Whether each route refuses the *right* roles is a separate question, already
covered per-endpoint in `test_reads.py` and `test_writes.py`. This sweep asks
only whether a stranger with no session gets in.
