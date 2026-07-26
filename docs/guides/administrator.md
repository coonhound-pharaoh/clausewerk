# The Administrator's guide

You run the machine. You do not have a voice in what it holds.

That is the whole shape of the role, and everything below follows from it. You
create accounts, grant and revoke access, keep the operational settings, keep the
watcher lists, take the audit checkpoints, and watch the health of the record.
You cannot change a contract, decide a ticket, approve an override, or alter an
owner decision — and the database refuses those, so this is not a matter of
being careful.

You **can read** contract content. That was the owner's decision (`U5`), taken so
that whoever is supporting the system can see the thing being complained about.
Say the role accurately if you are asked: **content-visible, content-powerless.**

---

## Granting access

**One person, one role.** There is no second role. Moving somebody from requester
to reviewer is a revoke and a grant, and both are on the record — which is the
point, because "when did she get that?" is a question somebody eventually asks.

Fill in the person, their name, their unit and the role, and say **why**. The
reason is not paperwork: it is the only part of the record that explains a grant
to somebody reading it two years later.

### The two Legal roles are different

Granting **legal reviewer** or **legal admin** takes two names. You propose; a
**Legal admin countersigns**. Until they do, the grant confers **nothing at all**
— not a reduced role, nothing. The person cannot sign in.

The screen tells you this before you press the button, and it is worth repeating
here because the failure is social rather than technical: if you tell a new
joiner they are set up and the countersign has not happened, they will spend
their first morning unable to work and nobody will know why.

The grant sits in the **countersign queue**, marked amber. That queue appears in
your console *and* in every Legal admin's own workspace — deliberately, because a
queue that lives only where Legal never looks is a queue that never gets cleared.

**You cannot countersign, including grants you did not propose.** That is not an
oversight. Access to Legal judgement is itself a Legal judgement, and if you
could both propose and accept, the rule would be one person's decision wearing
two hats.

The other three roles — **viewer, requester, auditor** — you grant alone,
recorded. None of them can change a contract or decide anything.

### You cannot grant yourself anything

Any role, any path, refused by the database. If you need a different role,
somebody else grants it to you.

---

## Revoking access

Press **revoke** on somebody's row, say why, confirm.

**What actually happens, exactly:** their role stops applying **at their next
request**. A request already in flight finishes. If they have a page open it goes
on showing what it has already loaded until they touch anything — then they are
signed out.

That is a real gap and it is small. It is stated plainly rather than dressed up,
because the alternative — a screen implying somebody is thrown out mid-keystroke
— would be a promise the system does not keep. If you need somebody out *now*
and seconds matter, revoke and then tell somebody; do not rely on the button
alone.

**A revocation cannot be undone.** Bringing somebody back is a new grant,
recorded as one. An account is never deleted either — the record of who had
access is part of the access history, and deleting it would take the history
with it.

---

## What "dormant" means, and why it is not what you expect

Dormancy is measured from **recorded acts** — things somebody actually did, on
the audit chain. It is **not** measured from sign-ins, and there is no sign-in
data in the system to measure from.

This matters more than it sounds. Somebody who signs in every morning, looks at a
dashboard and does nothing is **dormant where it counts**: their access is unused
and it is still a way in. A sign-in-based measure would show them as active
forever, which is precisely backwards.

Two flags, and they mean different things:

- **never used** — this account has never done anything at all. Usually a joiner
  who was given the wrong role, or never told they had access.
- **dormant** — no recorded act in ninety days. Usually somebody who has moved
  on.

Both are worth acting on. They are shown separately because the right action
differs: the first is a conversation, the second is usually a revoke.

---

## The five figures at the top

| Figure | What it counts |
|---|---|
| **people with access** | Effective roles right now — countersigned where that is required |
| **awaiting countersign** | Legal grants that confer nothing yet |
| **dormant or never used** | Access nobody is using |
| **revoked** | Accounts closed |
| **shared accounts** | Always nought — see below |

**Shared accounts is nought by construction**, not by discipline. The accounts
table is keyed on the person, so a shared login cannot exist. It is shown anyway
because it was a stated goal, and a stated goal nobody measures is a hope.

---

## When something is refused

You will see the database's own sentence, unchanged. Those sentences name the
rule and the role — *"renewal_default_baseline is an owner decision and only a
legal admin may change it"* — and they are passed through rather than softened
into "you do not have permission", because the specific version is the one you
can act on.

A refusal is the system working. It is not an error, and it is not a bug to
report unless the sentence itself looks wrong.

---

## What you can never do

| | |
|---|---|
| Hold a second role, or grant yourself one | Refused by the database |
| Countersign anything | Legal's act, always |
| Change an owner decision | Legal admin's; read-only to you |
| Write contract text, decide a ticket, approve an override or a concession | No path exists |
| Destroy a retained record | Legal admin's recorded act. You see what is due and nudge |
| Edit history | Nobody can, including the owner |

You **can** starve the system — revoke everybody, break a setting, stop taking
checkpoints. You cannot corrupt it, and every act of starvation is on the record
under your name. Recovery from a total lockout is the bootstrap ceremony, run
once by whoever owns the database, and recorded as such.

---

## See also

- [ADR-0011](../decisions/ADR-0011-the-administrator-is-a-steward.md) — the role,
  and what it costs
- [`backend/README.md`](../../backend/README.md) — the nightly checks, what each
  one proves, and what to do when one fails
- [`docs/open-questions.md`](../open-questions.md) — owner decisions `U5`–`U8`
  and the reasoning behind each

---

## Settings

Two panes, and the difference is who they belong to.

**Operational settings are yours.** How long the socialisation window runs, when
a ticket is flagged overdue, how often digests go out, how long a session lasts.
Each says what it does. Changing any of them cannot change a contract outcome —
that is the test for whether something belongs on this side of the line.

**Owner decisions are Legal admin's, and you are reading them.** You see the
value, who decided it, and the reasoning. There is no field to type in, no
greyed-out box, nothing that looks like an editor — because it was never yours,
and a disabled control would say "you could, but not now".

Undecided decisions are **flagged amber, not hidden**. A question the system has
answered provisionally so that it could ship is exactly the thing somebody needs
to see.

---

## System health

Six tiles. Each is **verified**, **failed**, or **never run**, and the third is
its own state on purpose: "we looked and it is fine" and "we have not looked" are
different answers, and showing the second as the first is how a system reassures
its operator into an incident.

Three buttons run checks on demand — take a checkpoint, check the anchor, verify
the chain. Each records **that it ran**, whichever way it comes out. The tiles
count those records and nothing else, so a tile is green only when a check
actually happened.

What each check proves, and what to do when one fails, is in
[`backend/README.md`](../../backend/README.md).

### Retention

You can see what is past its retention date. **You cannot destroy any of it** —
that is Legal admin's recorded act, and you hold no privilege for it.

The **nudge** button records that Legal was told, on the audit chain, with your
name and the date. It changes no retention state at all. It could not become a
delete even if somebody rewired it, because there is no write on that table for
this role to use.

A record under legal hold shows as **held**, naming the matter. That is
deliberate: "cannot be destroyed" and "cannot be destroyed while this litigation
is open" are different sentences, and only the second tells anybody what to do.

---

## Watchers and notices

Who is told when an override is requested. **Never who decides it** — adding
somebody here gives them sight of a request and no vote in it.

Leave the category blank for an **always-watcher** who sees every category.

**A category with nobody watching it is shown as a gap**, at the top of the pane,
naming the categories. An override request in one of them would be socialised to
nobody at all. Closing the gap is a decision about who should be told, which is
yours; noticing it is the system's job and it does that here.

Removing a watcher is recorded, with your name. That one matters more than it
looks: somebody quietly dropped off a notification list is silence about who was
silenced, and nothing visibly happens afterwards to make anybody look.
