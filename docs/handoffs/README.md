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

**Repository state at handoff:** `main` @ `dd0b396`, pushed to
`github.com/coonhound-pharaoh/clausewerk`. 224 tests passing (120 SQL, 104
Python) and 39 mutation checks.

## The one thing to know before touching anything

The system's whole value is that **every word in a contract traces to a named
human's approval**. Most of the design exists to protect that. Before you change
anything, find out whether it is load-bearing for that property — the ADRs in
[`../decisions/`](../decisions/) say which are and why.
