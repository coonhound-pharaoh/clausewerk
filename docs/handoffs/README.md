# Handoff reports

One per workstream, written for an agent or engineer arriving with no context.

Each is self-contained: what the thing is, what state it is actually in, the
decisions that constrain you, the traps, and where to start. Read your own and
then **§0 of any of them** — the shared ground rules are repeated in each, on
purpose, because a handoff that assumes you read a different document is not a
handoff.

| Workstream | State | Report |
|---|---|---|
| **Assembly & backend core** | Built and verified | [`01-assembly-backend.md`](01-assembly-backend.md) |
| **Clause library** | Partly built — ladders and concessions done, Builder not started | [`02-clause-library.md`](02-clause-library.md) |
| **Negotiation** | Specified, not built | [`03-negotiation.md`](03-negotiation.md) |
| **Lifecycle (post-signature)** | Specified, one piece built | [`04-lifecycle.md`](04-lifecycle.md) |
| **Frontend** | Specified; a working prototype exists | [`05-frontend.md`](05-frontend.md) |
| **Service layer & identity** | Built in JavaScript, now **frozen as the specification** the Python replacement must match | [`06-service-layer-and-identity.md`](06-service-layer-and-identity.md) |
| **Role-based UI & the Administrator** | Fourteen of sixteen closed. History and the long-form traps live here | [`07-role-based-ui.md`](07-role-based-ui.md) |
| **CURRENT STATE — start here** | The Python move complete, the JavaScript service deleted, four more owner decisions, and **uncommitted work in the tree** | [`08-disposal-screens-and-the-python-move.md`](08-disposal-screens-and-the-python-move.md) |

**Arriving cold? Read
[`08-disposal-screens-and-the-python-move.md`](08-disposal-screens-and-the-python-move.md)
first.** It is the current state of play and it opens with the one thing that
will bite you: there is substantial uncommitted work in the tree, including a
staged deletion.

**Repository state.** Substantially further along than when reports 01–05 were
written, and moving — so **do not trust a number in this file. Run
`cd backend && npm run verify` and read what it says.**

As of 2026-07-26: thirteen migrations, twelve database suites, the Python engine
suite, and both mutation harnesses. A full verification takes about five minutes,
because every deliberate breakage re-applies a broken copy of the schema and
re-runs a whole suite against it.

Two things a new arrival should know:

- **Phases 0–3 of the 2026-07-25 improvement proposal are complete.** All
  eighteen review findings are closed, plus one nobody had found. See
  [`../spec-vs-implementation.md`](../spec-vs-implementation.md) Part 2 — including
  the three places the review itself turned out to be wrong.
- **Work may be in flight.** Migration `0013` and the role-based UI were being
  written as this report was added. If `verify` is red, that is somebody else's
  work mid-edit — find out before building on it.

## The one thing to know before touching anything

The system's whole value is that **every word in a contract traces to a named
human's approval**. Most of the design exists to protect that. Before you change
anything, find out whether it is load-bearing for that property — the ADRs in
[`../decisions/`](../decisions/) say which are and why.
