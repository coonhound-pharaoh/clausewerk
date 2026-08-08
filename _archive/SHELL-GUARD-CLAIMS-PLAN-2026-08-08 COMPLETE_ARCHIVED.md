# Two shell guards claim more than they check — 2026-08-08 — COMPLETE_ARCHIVED

**Done 2026-08-08.** Both widened to match their own comments. Proved by breaking
them seven ways: three transports in a pane, and a remote stylesheet, an `http://`
script, a protocol-relative script and an `<iframe>` in `index.html`.

**289/289 mutations · 39/39 db suites.** The CSP question is raised for the owner
and deliberately not acted on — see the section below.

## What this pass actually found

**No live defect.** Seven areas were driven to a verifiable answer and came back
clean; they are listed at the bottom so the next pass does not re-tread them.

What did turn up is smaller and worth fixing while it is in view: **two guards in
`db/test/shell.test.mjs` state a promise in prose and check a hand-typed subset
of it.** Neither is exploited today — that was verified, not assumed — and both
are the shape this codebase keeps paying for: a list that grows by whatever the
last case happened to be called (S258).

### 1 · "Every call goes through the API module's fixed endpoint list"

The test refuses three transports:

    assert(!/\bfetch\s*\(/.test(src),      …)
    assert(!/XMLHttpRequest|axios/.test(src), …)

A browser has more ways to make a request than three. **`EventSource` and
`WebSocket` are the realistic ones here**, because a live-updating notifications
panel is exactly the feature somebody would add next — this system already has
digests and a "waiting on you" list, and the obvious improvement is to make them
push. `navigator.sendBeacon` is the third.

Verified: no pane uses any of them today. The gap is that the guard would not
say so if one did, while its own header says every call goes through API.

### 2 · The remote-resource guard checks `<script src="https://…">` and nothing else

`index.html` loads React, ReactDOM and Babel from unpkg with SHA-384 integrity
and `crossorigin=anonymous`, and a test enforces that for every
`<script src="https://…">`. It does not look at:

* **`<link rel="stylesheet" href="https://…">`** — remote CSS is not inert. It
  can restyle the authenticated shell and, through attribute selectors and
  background URLs, report what is on the page. It takes an integrity lock in
  exactly the same way and nothing would require one.
* **`<iframe src="https://…">`** — remote framed content inside the shell.
* **`src="//…"` and `src="http://…"`** — the regex requires a literal `https://`,
  so a protocol-relative or plain-http script is not a "remote script" to it at
  all. It is not merely unlocked; it is invisible.

Verified: `index.html` today loads six stylesheets, all local (`./app/…`), no
iframes, and no protocol-relative or http URLs. The three remote scripts are
correctly locked.

## Why fix a guard when nothing is wrong

Because the guard is the whole control. There is no build step and no bundler
here — `index.html` is edited by hand and the panes are plain `.jsx` served as
text. The only thing standing between a hand-edited `<link>` to a CDN and the
authenticated shell is this file, and it currently does not look.

## The fix

Both guards widen to match the promise their own comments make.

* Transports: add `EventSource`, `WebSocket` and `navigator.sendBeacon` to the
  refused set, and say in the comment why those three and not an open-ended list —
  they are the ways a browser opens a connection without `fetch`.
* Remote resources: match **any** element with a `src` or `href` whose value is
  not relative (`https://`, `http://` or `//`), require the SHA-384 integrity
  lock and anonymous CORS on each, and refuse `http://` and protocol-relative
  outright since neither can be locked meaningfully.

## Raised, not fixed: there is no Content-Security-Policy

`server.py` sends `x-content-type-options`, `x-frame-options` and `cache-control`
on every response, and no CSP. A CSP is the standard second line under an XSS,
and this page renders text that arrives from vendor paper.

**It is not being added in this change, and the reason is a real one rather than
a deferral.** The shell compiles `text/babel` in the browser, so any CSP that
would help must include `'unsafe-eval'` for Babel and `https://unpkg.com` for the
three scripts — which removes most of what a CSP buys. Doing it properly means
precompiling the JSX, which is a build step this project has deliberately not
taken. That is a product decision for the owner, not something to slip in behind
a test fix.

**No XSS vector exists today, checked rather than assumed:** no
`dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `new Function`, and no
`href`/`src` built from data anywhere in the panes. React escapes the rest.

## Validation

* Each widened guard must FAIL when the thing it now covers is introduced —
  proved by adding an `EventSource` to a pane, a remote `<link>`, and an
  `http://` script to scratch copies.
* The suite must still pass unchanged against the real files.
* `node backend/db/test/run-all.mjs`.

No migration and no Python is touched, so neither mutation harness rule applies —
but the shell suite is already redirectable via `CW_SHELL`, so the mutation
harness can point at a mutated copy, and a row is added.

## Checked and clean this pass — recorded so nobody re-treads them

1. **The snapshot fingerprint** cannot be made ambiguous: it hashes canonical
   JSON with sorted keys, and `Snapshot.build` sorts clauses and ladders, so
   database row order cannot move it.
2. **The audit chain's preimage** is length-prefixed (`cw.lp` writes
   `octet_length || ':' || value`), so no field's content can be made to look
   like another field's — the classic concatenation collision is closed.
3. **The engine is order-deterministic.** Every dict or set iteration that feeds
   output is sorted afterwards; nothing depends on hash order.
4. **The screens call no endpoint the router does not serve.** 114 distinct calls
   in `api.jsx` compared against the router's 141 routes; the only apparent miss
   was a template segment (`/health-checks/${which}`) whose two live values both
   exist.
5. **No DELETE or TRUNCATE grant reaches evidence.** Nine DELETE grants exist,
   all on configuration, claim or session tables, and each has a policy scoping
   it — `cw.session`'s admits only the doorway's own `__signin__` actor. Thirty-
   four UPDATE grants, none on a table without an update policy.
6. **The `__signin__` sentinel cannot be impersonated.** `cw.account` carries
   `person_is_not_a_reserved_identity`, refusing any person beginning `__`, and
   0033 documents that exact attack.
7. **No XSS vector in the panes**, as above.


---

## One thing the plan did not anticipate

`CW_SHELL` redirects only the PANE directory. `index.html` is read from its real
location, so the remote-resource bites could not be run against a scratch copy —
they were run against the real file with an immediate `git checkout --` after
each, and the suite re-run afterwards to confirm the file came back.

Worth knowing for the next person: the shell suite is only half-redirectable, and
a mutation row for anything in `index.html` would silently mutate nothing. The
row added here targets a pane, which is the redirectable half.
