# ADR-0011 — The Administrator is a steward, not a superuser

**Status:** Accepted 2026-07-26 · owner decisions `U5`–`U7` ·
implemented in [`0013_administrator.sql`](../../backend/db/migrations/0013_administrator.sql) ·
amends [ADR-0008](ADR-0008-governance-roles-and-recorded-overrides.md), whose five roles become six

## Context

[ADR-0008](ADR-0008-governance-roles-and-recorded-overrides.md) established five roles and the rule
that makes them mean anything: **the owner is nobody.** Database ownership carries no application
role, so any governed act taken during installation or support has to be taken as a named role and
the record says who did it. Settled decision `U3` holds that rule in the schema —
`cw.app_role()` returns null for the owner, and every policy fails closed on null.

That rule is right, and it left a real job with no chair.

Somebody has to create accounts for new joiners, grant and revoke access when people move, keep the
operational settings, take audit checkpoints, watch the health of the record, and connect the
integrations. None of that is contract judgement. But under five roles it could only be done in one
of two wrong ways:

- **As Legal admin**, which mixes machine housekeeping into the role that decides what the company's
  contract language *is*. The person approving a clause and the person approving a new starter's
  laptop access are doing unrelated jobs, and giving them one role makes the access grant look like
  a legal act and the legal act look routine.
- **As the owner**, which is worse: an act with no name on it, in a system whose entire proposition
  is that every act has a name on it. ADR-0008's own residual list names shared service accounts and
  self-asserted identities as the thing to fix, not to lean on further.

A third pressure came from ADR-0008 itself, which warned that five roles was already a lot and that
role sprawl invites everybody being handed Legal reviewer "temporarily, for this one deal". Nobody
owned the job of noticing that happening.

## Decision

**Add a sixth role, `cw_administrator`, that runs the machine and can never change what the machine
holds.**

> The Administrator creates accounts, grants and revokes roles, keeps the operational settings,
> maintains the watcher lists, takes checkpoints, and reads the health evidence.
>
> The Administrator writes no contract content, decides nothing in any workflow, changes no owner
> decision, and — like everyone else, including the owner — edits no history.

### What the role may read (`U5`, and this is an amendment)

The design as proposed made the role **content-blind**: no `select` on deals, manifests,
negotiations or the review queue at all. The owner relaxed that half. The Administrator **may read**
contract content, so that whoever is supporting the system can see the thing being complained about
rather than working from a ticket number and a guess.

**The boundary that is kept is write and judgement, not sight.** The role holds `select` on the
content tables and holds no `insert`, `update` or `delete` on any of them, and no `execute` on any
function that decides a ticket, an override, a concession or an owner decision.

Say this accurately. The role is **content-visible and content-powerless**. Anything — code comment,
document, screen, sales deck — that calls it content-blind is wrong, and wrong in the specific way
the 2026-07-25 review catalogued eighteen instances of: a document promising a control the code does
not enforce.

### What it takes to grant Legal judgement (`U6`)

A grant of either Legal role — `legal_reviewer` or `legal_admin` — takes effect only when a **Legal
admin countersigns** it. The Administrator proposes; Legal accepts. Access to Legal judgement is
itself a Legal judgement, and this is ADR-0008's role-sprawl warning given teeth.

The other three roles — viewer, requester, auditor — the Administrator grants alone, recorded. None
of them can change a contract or decide anything, so a second signature would buy control nobody
needs at the price of slowing down every ordinary joiner.

The rule is enforced in the **database**, not in the console. A countersign rule that lives only in
an API is one bug away from gone.

### Who takes checkpoints (`U7`)

Checkpoint duty **moves** from Legal admin to the Administrator, and Legal admin's right is
**revoked** in the same migration. Taking a checkpoint proves the record has not been tampered with
and says nothing about any contract, so it is stewardship.

It is a move rather than a shared right on purpose: two roles holding one duty means neither owns
it, and there is nobody to hold to account for a checkpoint that was never taken.

### Bootstrap

Only an Administrator may create an account, and on a new installation there is none. The owner
performs a scripted ceremony once, creating the first Administrator and the first Legal admin — two
different people, refused by the database if they are the same, because one person holding both
satisfies the countersign rule alone from the first minute.

`cw.bootstrap()` refuses if any account exists, refuses any caller holding an application role, and
is executable by none of the six roles. Both acts land on the chain marked as bootstrap, recorded as
`system` acts rather than human ones — at that moment there is no application role on the
connection, and recording them as human acts under a role nobody held would be a lie in the
permanent record.

## Consequences

### What this costs, stated rather than buried

**The Administrator can read every deal in the system, and reads are not recorded.** This is the
`U5` amendment's price and it is real. The audit log records *acts*, not glances, and adding
per-read logging for one role would mean a second audit mechanism with different guarantees and a
different tamper story. What contains the risk instead: the role can change none of it, holds no
vote in any workflow, and cannot grant itself one — the countersign rule exists precisely to stop an
Administrator assembling a voice in content by granting an ally Legal reviewer. Anyone for whom
"this person can read our contracts" is unacceptable should not put that person in this role.

**The countersign rule adds a wait**, every time Legal cover is needed in a hurry. That wait is the
control working. It is kept short by putting the countersign queue in Legal's *own* workspace rather
than only in the admin console — a queue that lives where the people who must clear it never look is
a queue that does not get cleared.

**A sixth role is more access administration**, in a system whose own ADR warned that five was
already a lot. The mitigation is circular but genuine: this role exists precisely to make
administering the other five somebody's recorded job.

**The Administrator can starve the system.** Revoke everyone, break a setting, stop taking
checkpoints. They cannot *corrupt* it — content and history stay unwritable — and every act of
starvation is on the record under their name. Recovery is the bootstrap path, recorded again.

**Bootstrap is a special moment that cannot be made ordinary.** For the length of one command the
owner acts directly. It is scripted, it runs once, it is refused thereafter by the state of the
accounts table rather than by a flag, and both acts are marked on the chain as what they were.

### What this does not change

The trust boundary is untouched. The model still never authors contract language
([ADR-0001](ADR-0001-model-never-authors-contract-language.md)); the manifest is still the only
crossing ([ADR-0002](ADR-0002-manifest-is-the-trust-boundary.md)); the Review queue is still the
only mutation surface for the library
([ADR-0003](ADR-0003-review-queue-is-the-only-mutation-surface.md)); signed agreements stay frozen;
the audit record stays append-only for everyone, this role included.

Settled decision `U3` is untouched: the owner still maps to no application role. The Administrator
is the named, recorded replacement for ever acting as the owner — not an exception to the rule that
made the owner nobody.

### One implementation consequence worth knowing about

Roughly a dozen read policies in this schema are written `using (cw.app_role() is not null)` —
"anyone who is anybody may read this". Teaching the role accessor a sixth answer therefore opens
every one of those policies to the new role by itself, with no policy change anywhere and nothing in
a diff to notice.

That is exactly what `U5` asked for, so it is correct here. Under the original content-blind design
it would have been a silent content grant. It is safe on the write side, and that was verified
rather than assumed before the role was added: **no** insert, update or delete policy anywhere in
migrations `0001`–`0012` is phrased that way. Every write policy names its roles explicitly, and none
of them names the administrator.

The next person to add a role should check the same thing before they add it, and the test suite
sweeps every table in the schema — against an allowlist of the two the Administrator is supposed to
write — so a content table added by a future migration is covered the moment it exists.
