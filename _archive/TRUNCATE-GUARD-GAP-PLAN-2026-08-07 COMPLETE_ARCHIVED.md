# 21 append-only tables could still be emptied in one statement — plan (2026-08-07) COMPLETE_ARCHIVED

**Found by:** codebase scan / defensive security audit, 2026-08-07.
**Area:** `TRUNCATE` guards across the schema.

---

## In one paragraph, for a business reader

Many tables in this system are meant to be permanent records — who was granted
which role, what the AI was asked and what it cost, which legal findings were
overridden and by whom. The system refuses to let anyone edit or delete a row in
them. But there is a second way to empty a table, `TRUNCATE`, which wipes it in
one statement and triggers none of those refusals. The project already knows
this and defends against it on **36** tables. **21 comparable tables were
missed** — including the record of who holds which role and the record of every
override of a legal objection.

## The project's own words for this, from migration 0001

> "A schema that raises loudly on `delete from cw.clause_version` and empties
> the same table without complaint on `truncate cw.clause_version` does not have
> an immutability guarantee; it has an immutability habit."

That is the finding exactly. Twenty-one tables have the habit.

0001 also built the fix and said why it was built to be reused:

> "One function, reused by every table that claims to be append-only, so a table
> added later inherits the story by **naming it** rather than by re-deriving it."

`cw.no_truncate()` exists. Twenty-one tables never named it.

## The evidence

Read from the installed catalog — tables whose update/delete trigger raises
*unconditionally* (a genuine append-only guard, not a conditional binding
trigger), cross-referenced against statement-level truncate triggers:

```
UNCONDITIONALLY append-only tables: 57
OF THOSE, NO TRUNCATE GUARD: 21
  cw.account                     cw.override_socialisation
  cw.agreement_attorney          cw.override_watcher
  cw.agreement_share             cw.required_approver
  cw.governance_setting          cw.role_grant
  cw.integrity_check             cw.signature_envelope
  cw.model_call                  cw.sow_override
  cw.notice                      cw.sow_override_approval
  cw.notice_acknowledgement      cw.sow_override_settlement
  cw.notification_address        cw.ticket_claim
  cw.obligation_template
  cw.override_finding
  cw.override_request
```

I narrowed this twice before believing it. A first pass counted any table with
*any* update/delete trigger (66) — wrong, because binding triggers fire on
update without forbidding it. A second counted any trigger function containing a
raise (also 66) — still wrong, because a conditional raise guards one column
rather than the row. Only the third pass, requiring an **unconditional** raise,
gives a number that means what it says.

## How exposed is this, honestly

**Not a live hole.** No application role holds `TRUNCATE` on any of these — it is
owner-only, and the tables are owned by `postgres`. This is defence against
operator and maintenance-script error, which is exactly what it is on the 36
tables that already have it. It is not being proposed as more than that.

Nothing in the repository legitimately truncates any of these tables; the only
`truncate` statements in the tree are tests asserting the guard refuses.

## The fix

Migration `0070`: attach the existing `cw.no_truncate()` to all 21, as a
statement-level `before truncate` trigger — the only kind `TRUNCATE` fires.

**And a sweep, which matters more than the 21 triggers.** The gap opened because
nothing checked; adding 21 triggers without a sweep just resets the clock. A
test asserting that every unconditionally append-only table carries a truncate
guard turns this from a thing somebody remembers into a thing that fails.

## How it is proved

- The sweep is green after the migration and **proved to bite**: a new
  append-only table without a truncate guard must make it fail.
- A mutation row: dropping one of the new triggers goes red on a named test.
- `node db/test/mutation-check.mjs` — required, a migration is touched.
- All three harnesses and the full suite.

## Not in scope

The 36 existing guards are not touched, and the several bespoke functions among
them (`cw.run_immutable`, `cw.received_document_frozen`) are left as they are.
Consolidating them onto `cw.no_truncate()` would be a rename with no change in
behaviour, and each carries a message written for its own table.
