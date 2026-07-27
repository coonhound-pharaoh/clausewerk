"""The read endpoints. Identity in, rows out, and no opinions in between.

WHAT THIS MODULE IS FOR, and it is a shorter list than it looks:

  1. Hold the statement each read runs.
  2. Run it on a connection already bound to the caller's role and name.
  3. Report what the database said, including its refusals, unchanged.

WHAT IT DELIBERATELY DOES NOT DO: decide anything. There is not one
`if role == "legal_admin"` in this file, and there must never be. The database
already holds the whole permission model — six roles' worth of row-by-row
policies, the countersign rule, the append-only guarantees — and a second copy of
those rules here would drift from the first. The drift is the vulnerability,
because it is invisible: both systems keep working, they just stop agreeing, and
the one that is wrong is the one nobody tested as a real role.

So an endpoint is a statement and a route. Adding one adds no permission logic,
because there is no permission logic to add to. If a workspace needs a narrower
slice of something, that is a read model in the database, not a filter here and
certainly not a filter in the browser.

THREE THINGS THE BROWSER CANNOT INFLUENCE, ever:

  · the role  — it comes from cw.effective_role, keyed on the session
  · the actor — it comes from the session, never from a header or a body
  · the rows  — they come from a policy, never from a WHERE clause added here on
                the caller's behalf

A REFUSAL IS NOT AN EMPTY LIST

`run()` raises. It does not return `[]` when the database refuses, and no caller
may make it. "Nothing is waiting on you" and "You may not see this" mean opposite
things to the person reading them, and collapsing the second into the first is
the most comfortable mistake in this layer: it makes errors disappear from the
screen while making the product lie. `answer()` keeps the two apart, in the shape
an interface can render.

THE NOTE ON EVERY ENDPOINT

Each read names the database rule that decides what comes back. That rule — not
this file — is the answer to "why can this person see this?", and the note is the
map from the endpoint to the rule. It is documentation that lives beside the
thing it documents, which is the only kind that stays true.

Ported from the JavaScript service (`backend/service/app.mjs`) on 2026-07-26.
The statements are carried across unchanged: that file is the specification
until it is deleted, and an improvement made during a port is an untested change
wearing a port's clothes.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify


@dataclass(frozen=True)
class Read:
    """One read: a statement, and the rule that decides who sees its rows."""

    sql: str
    rule: str


# ── The read endpoints ──────────────────────────────────────────────────────

READS: dict[str, Read] = {
    # Whoever I am, and what I may do. The shell's masthead.
    "GET /me": Read(
        sql="""select person, display_name, unit, role, granted_by, granted_at,
                 countersigned_by
          from cw.effective_role where person = current_setting('cw.actor')""",
        rule="cw.effective_role — a revoked or uncountersigned grant answers nothing",
    ),

    # The requester's deals. Scoped by cw.agreement's read_own policy: a
    # requester sees their own; Legal and Audit see all; a viewer sees none.
    "GET /deals": Read(
        sql="""select agreement_id, counterparty, requester, status
          from cw.agreement order by agreement_id""",
        rule="cw.agreement read_own policy",
    ),

    # What is waiting on Legal. Ordered oldest first because the desk exists to
    # make the oldest wait visible — sort order is a control, not a preference.
    # Columns corrected in WP-U11: this shipped naming `clause_id`, `version` and
    # `opened_at`, none of which cw.review_ticket has — a ticket names a CATEGORY,
    # not a clause, because the whole point is that the proposed text has not
    # become a clause yet. The endpoint failed outright for anybody with a ticket
    # to see, and nobody noticed because the seeded system had none. Found by a
    # check that runs every read endpoint's statement against the migrated schema
    # — the same check this port carries over as `test_reads.py`.
    "GET /waiting/tickets": Read(
        sql="""select ticket_id, agreement_id, category_key, severity, reason_code,
                 provenance_badge, state, opened_by, created_at
          from cw.review_ticket where state = 'pending'
          order by created_at""",
        rule="cw.review_ticket read_scoped policy",
    ),

    # The countersign queue. Read by everyone; only a Legal admin can act on it.
    "GET /waiting/countersign": Read(
        sql="""select grant_id, person, display_name, unit, role, proposed_by,
                 proposed_at, reason
          from cw.countersign_pending""",
        rule="cw.countersign_pending — grants that confer nothing while they sit here",
    ),

    # People and access. Everyone may read it: access is not a secret, and it
    # carries role names rather than contract content.
    "GET /people": Read(
        sql="""select a.person, a.display_name, a.unit, a.role as declared_role,
                 a.state, a.created_by, a.created_at,
                 e.role as effective_role, e.countersigned_by
          from cw.account a
          left join cw.effective_role e on e.person = a.person
          order by a.person""",
        rule="cw.account read_all policy; effectiveness from cw.effective_role",
    ),

    # The people pane. Distinct from /people, which is the plain list everyone may
    # read: this carries activity, and activity comes from the audit chain, whose
    # policy scopes a requester to their own rows. Granted to the three roles that
    # already read the whole chain, so a requester asking gets an honest refusal
    # rather than everybody's names with a null last act beside them.
    "GET /people/activity": Read(
        sql="""select person, display_name, unit, declared_role, state, created_by,
                 created_at, effective_role, granted_by, granted_at,
                 countersigned_by, last_act_at, last_act, acts_recorded,
                 activity_state
          from cw.person_activity order by person""",
        rule="granted to administrator, auditor and legal_admin — it reads the chain",
    ),

    "GET /people/summary": Read(
        sql="""select * from cw.access_summary""",
        rule="cw.access_summary; shared_accounts is structurally zero",
    ),

    "GET /access-history": Read(
        sql="""select grant_id, action, person, role, grant_ref, acted_by, acted_at,
                 reason, is_bootstrap
          from cw.role_grant order by grant_id desc""",
        rule="cw.role_grant read_all policy — append-only, so this is the whole story",
    ),

    "GET /settings": Read(
        sql="""select key, value, kind, is_owner_decision, decided, decided_by,
                 rationale, purpose, updated_at
          from cw.governance_setting order by kind, key""",
        rule="cw.governance_setting read_all policy; writing is split by kind",
    ),

    "GET /health": Read(
        sql="""select tile, state, as_of, detail from cw.health_summary""",
        rule="granted to administrator and auditor only",
    ),

    "GET /watchers": Read(
        sql="""select watcher_id, category_key, person, added_by, added_at,
                 removed_by, removed_at
          from cw.override_watcher where removed_at is null
          order by category_key nulls first, person""",
        rule="cw.override_watcher read_all policy",
    ),

    "GET /watchers/coverage": Read(
        sql="""select category_key, label, watcher_count from cw.watcher_coverage""",
        rule="cw.watcher_coverage — a zero is a visible gap, not a silence",
    ),

    "GET /overrides": Read(
        sql="""select request_id, run_id, agreement_id, requested_by, requested_at,
                 state, justification, commercial_pressure, socialised_at,
                 window_closes, notified_count, window_closed, findings, decided,
                 approved
          from cw.override_status order by requested_at desc""",
        rule="cw.override_request read_scoped — a requester sees their own, Legal "
             "and Audit see all, a viewer sees only what they were told about",
    ),

    "GET /overrides/findings": Read(
        sql="""select request_id, finding_ref, severity, summary, decision,
                 decided_by, decided_at, note
          from cw.override_finding order by request_id, finding_ref""",
        rule="cw.override_finding read_scoped — the decision lives per finding",
    ),

    "GET /overrides/notified": Read(
        sql="""select request_id, person, reason from cw.override_notified
          order by request_id, person""",
        rule="cw.override_notified read_scoped — who was told, and why",
    ),

    # ── The review desk (WP-U11) ────────────────────────────────────────────
    "GET /tickets": Read(
        sql="""select ticket_id, agreement_id, category_key, severity, reason_code,
                 provenance_badge, proposed_text, state, approved_text,
                 edited_before_approval, decided_by, decided_on, decision_note,
                 minted_clause_id, minted_version, opened_by, created_at
          from cw.review_ticket order by created_at""",
        rule="cw.review_ticket read_scoped policy; oldest first is the desk's job",
    ),

    "GET /quality": Read(
        sql="""select * from cw.review_quality""",
        rule="cw.review_quality — the unedited-approval rate, measured and shown",
    ),

    "GET /origin-mix": Read(
        sql="""select * from cw.library_origin_mix""",
        rule="cw.library_origin_mix — where the library actually came from",
    ),

    # ── The library (WP-U13) ────────────────────────────────────────────────
    "GET /clauses": Read(
        sql="""select clause_id, category_key, severity from cw.clause order by clause_id""",
        rule="cw.clause read_all policy — reading clause text is not the risk",
    ),

    "GET /clause-versions": Read(
        sql="""select clause_id, version, title, body, rationale, reviewer,
                 approved_on, expires_on, retired, provenance, origin,
                 source_ticket_id
          from cw.clause_version order by clause_id, version""",
        rule="cw.clause_version read_all policy",
    ),

    "GET /entrance": Read(
        sql="""select clause_id, version, provenance, source_ticket_id, reviewer,
                 entrance from cw.clause_entrance order by clause_id, version""",
        rule="cw.clause_entrance — where every version came from, including UNACCOUNTED",
    ),

    "GET /concessions": Read(
        sql="""select s.concession_id, s.agreement_id, s.category_key, s.proposer_kind,
                 s.state, s.settled_by, s.settled_on,
                 c.standard_clause_id, c.standard_version, c.conceded_rung, c.reason
          from cw.concession_state s
          join cw.concession c using (concession_id)
          order by s.concession_id""",
        rule="cw.concession read_scoped policy; the state is derived, never stored",
    ),

    "GET /holds": Read(
        sql="""select hold_id, agreement_id, matter_ref, opened_by, opened_on,
                 released_on, released_by from cw.legal_hold order by hold_id""",
        rule="cw.legal_hold policies",
    ),

    "GET /retention/due": Read(
        sql="""select agreement_id, retention_until, under_hold, matters
          from cw.retention_due order by retention_until""",
        rule="cw.retention_due, granted to administrator — due-ness and identity, "
             "never agreement bodies. Destruction stays legal_admin's act",
    ),

    # The auditor's chain explorer. Scoped by cw.audit_event's own policy: an
    # auditor, reviewer or legal admin sees the whole record; a requester sees
    # only their own acts; a viewer holds no grant on the table at all. The
    # filtering the console offers happens over what the policy already returned.
    "GET /record": Read(
        sql="""select seq, ts, actor, actor_role, actor_kind, event_type, subject,
                 payload
          from cw.audit_event order by seq desc limit 500""",
        rule="cw.audit_event audit_read_scoped policy",
    ),
}


class NoSuchRead(KeyError):
    """No read endpoint by that name. Distinct from a refusal: this is the
    doorway saying the route does not exist, not the database saying no."""


def run(db: Database, caller: Caller, key: str) -> list[dict]:
    """Run one read as the caller, and return its rows.

    Raises rather than returning an empty list when the database refuses. See the
    module docstring: the two outcomes are different sentences and must stay
    different all the way to the screen.
    """
    read = READS.get(key)
    if read is None:
        raise NoSuchRead(key)

    with db.as_person(caller.person, caller.role) as request:
        return request.rows(read.sql)


@dataclass(frozen=True)
class Answer:
    """What a read produced, in the shape an interface can render."""

    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def answer(db: Database, caller: Caller, key: str) -> Answer:
    """Run one read and shape the outcome — rows, or the database's refusal in
    the database's own words."""
    try:
        return Answer(status=200, body={"rows": run(db, caller, key)})
    except NoSuchRead:
        return Answer(status=404, body={"error": "no such endpoint", "path": key})
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(status=refused.status, body=refused.as_body())
