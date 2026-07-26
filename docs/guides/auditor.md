# The Auditor's guide

You read everything and change nothing. That is the whole role, and the system
enforces it rather than trusting it: you hold no write privilege anywhere, so
there is nothing to be careful about.

## The record

Every governed act, newest first, hash-chained. Each row says who acted, what
authority they held, whether it was a person or the machine, and what they did.

`actor_kind` is worth knowing: **human** is a person, **controller** is reserved
for genuine machine action and can never be recorded as a human act, and
**system** covers acts taken with no application role at all — the bootstrap
ceremony is the main one.

## Access history

Who granted whom what, when, and who countersigned. It is append-only, so this
is the whole story rather than a current state — a role that was granted and
revoked is two rows, not an absence.

**Filter** by person or by kind of act. The filtering narrows rows the database
already decided you may see; it is not hiding anything from a wider fetch.

**Export** gives you the filtered rows as CSV — what is on your screen, not
something assembled separately.

Three things to look for:

- **Grants that were never countersigned.** Exactly one should exist: the first
  Legal admin, created by the owner during the bootstrap ceremony because there
  was nobody yet to countersign them. It is marked `bootstrap`. A second one is
  worth asking about.
- **Somebody who proposed and accepted.** Should be impossible — the database
  refuses it — but the history is where you would see it if it ever were not.
- **Revocations with no reason.** The reason is required, so an empty one means
  something was written another way.

## What you cannot do

Everything. No grant, no setting, no decision, no checkpoint. If a screen ever
offers you a button that changes something, that is a bug worth reporting — the
read-only roles get read-only screens, not greyed-out editors.
