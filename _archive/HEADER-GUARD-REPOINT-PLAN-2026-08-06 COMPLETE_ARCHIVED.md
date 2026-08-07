# The header guard has been red since the Host check landed — plan (2026-08-06) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-06.
**Area:** `test_retirement.py::test_the_service_reads_exactly_one_header`.

---

## In one paragraph, for a business reader

There is a deliberate rule in this system: the service reads only a tiny,
named set of things off an incoming web request, because every extra one is
another way a stranger could try to influence what happens. A test stands guard
over that rule by reading the service's own source and refusing to let the list
grow. **That guard has been failing for some time and nobody noticed** — a sixth
item, the `Host` header, was added on purpose to close a different security hole,
and the guard's list was never updated. A guard that is always red is not a
guard: it reports the same failure whether the rule is intact or genuinely
broken, so the next person reads it as noise and the protection is gone.

## The evidence

Red on clean `HEAD` (1198af1), reproduced in a separate worktree:

```
AssertionError: server.py reads ['authorization', 'content-disposition',
  'content-length', 'content-type', 'host', 'transfer-encoding'].
  Only these five headers may be read: ...
```

Introduced by commit `fb44d17` "Require an unambiguous HTTP Host". The guard has
not been touched since.

## Does `host` belong on the list? Yes — and this is the question that matters

The rule the guard actually protects is not "read few headers". It is: **no
header may say anything about who is calling or what they may do.** Checked at
every use:

- `server.py:201, 225, 291` — `_host_is_ambiguous()` is called first thing in
  `do_GET`, `do_POST` and `do_OPTIONS`, and its only effect is a `400`.
- `server.py:820` — the allowed names are fixed in code (`localhost`,
  `127.0.0.1`), not taken from the request.
- Nothing downstream reads the value.

So `host` can only ever **refuse** a request, never widen one. It was added to
close DNS rebinding: once an attacker-controlled name resolves to loopback,
their page and this service look same-origin to the browser, and CORS cannot
help. Identity still comes from the session, the role still comes from the
database, and the rows still come from a policy.

## The fix

Add `host` to the permitted set, **and say why in the message and the note
beneath it** — the point of this test is the reasoning, not the number. A
sixth name added silently would leave the next reader unable to tell a
deliberate addition from a leak.

Also correct the message's own text, which still says "these five" and "four
describing the BODY".

## How it is proved

`pytest doorway/test_retirement.py` green, and the guard still fails when a
seventh header is read — asserted by temporarily adding one, not by assuming.

## Not in scope

`test_documents.py::test_a_snapshot_that_does_not_rebuild_produces_no_document`
is also red on clean HEAD and is a separate defect (F3), taken next.
