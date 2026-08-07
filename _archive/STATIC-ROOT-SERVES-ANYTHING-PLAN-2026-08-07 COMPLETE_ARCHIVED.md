# The web root serves whatever is in it, to anyone — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `doorway/server.py::_serve_static`.

---

## In one paragraph, for a business reader

The screens have to load before anyone signs in, so files in the screens folder
are served to **anyone who can reach the service, with no session**. That is
correct and necessary. What is not necessary is that it serves *every* file in
that folder, whatever it is. A Python script sitting in there today is handed out
in full to an unauthenticated caller. Nothing is sensitive today — it is a
font-downloading utility, a licence and a README — but the folder is an ordinary
directory in the repository that people add files to, and the day somebody drops
a database dump, a `.env`, or notes with a password into it, that file is
published to the internet and nothing says so.

## The evidence

Against a running server, no session, no token:

```
GET /app/fonts/fetch-fonts.py   -> 200  text/x-python
GET /app/fonts/OFL.txt          -> 200  text/plain
GET /app/fonts/README.md        -> 200  application/octet-stream
GET /index.html                 -> 200  text/html; charset=utf-8
```

The last line is the point of the feature. The first three are the leak path,
demonstrated.

## Why it happens

`_serve_static` resolves the path, checks it is under the root — path traversal
is genuinely closed, and that check is sound — and then serves it. The content
type is decided *after* the decision to serve:

```python
kind = MIME.get(target.suffix) or (
    mimetypes.guess_type(target.name)[0] or "application/octet-stream")
```

`MIME` names six web types, but it is a **lookup table, not a gate**. Anything
not in it still gets served under a guessed type, and anything unguessable gets
served as a byte stream.

## The fix — make the table the gate

Serve only suffixes the table names. Everything else answers as though it is not
there, because as far as the product is concerned it is not: the screens ask for
HTML, JSX, JavaScript, CSS and fonts, and nothing else.

`.woff2` must be **added** to `MIME` as part of this — 18 font files are served
today through the guess path, so gating on the current table without adding it
would break every screen. That is the one real risk in this change and it is
handled by adding the type rather than by leaving the gate open.

Suffix set after the change: `.html .jsx .js .css .json .svg .woff2`.

A refusal here is a 404, not a 403. "There is no such screen" is the truth from
the product's point of view, and a 403 would confirm to a prober that a file
exists at that path — which is exactly the information the change exists to
withhold.

## What this does not do, stated plainly

It does not stop somebody putting a secret in the screens folder. It stops the
service handing it out. Both matter; only one of them can be enforced in code,
and a test asserting "no secrets in this directory" would be a guess about what
a secret looks like.

## How it is proved

- The three non-web files above answer 404 after the change, and `index.html`,
  a `.jsx` screen, a `.css` and a `.woff2` still answer 200. Fonts especially —
  breaking those breaks every screen and would be caught by nobody else.
- **Proved to bite**: a file with a new extension dropped into the root is
  refused, so the gate is a gate and not a longer list.
- The full suite, plus the `test_server.py` static tests which already cover
  path traversal and the shell being served.

## Not in scope

`OFL.txt` stays in the repository — the font licences must ship with the fonts,
and this change is about what is served over HTTP, not what is distributed. See
the standing note that bundled font licences need counsel before a paying
customer; this does not touch that question either way.
