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
                 proposed_text, provenance_badge, state, opened_by, created_at
          from cw.review_ticket where state = 'pending'
          order by created_at""",
        rule="cw.review_ticket read_scoped policy. proposed_text is here because "
             "the review desk adjudicates it — the desk crashed without it, which "
             "is WP-U11's column lesson recurring one layer up",
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

    # The measurement and the estimate, side by side and labelled as what each
    # one is (NC-25). The two label columns come from the view rather than from
    # an interface that has to remember them: the one way this feature does harm
    # is a screen showing two numbers and letting a reader take them for the
    # same kind of thing.
    "GET /metrics": Read(
        sql="""select * from cw.ticket_metrics order by ticket_id""",
        rule="cw.ticket_metrics — carries cw.review_ticket's own read_scoped "
             "rule in its WHERE clause, because a view runs as its owner",
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
        # `matters` is deliberately NOT selected. Owner decision U13 (0024): the
        # Administrator is told THAT a record is held, never why — the matter
        # reference is Legal's. The refusal from cw.retention_destroy() still
        # names the matters to the person attempting the act, so the reason is
        # there at the moment it decides something.
        sql="""select agreement_id, retention_until, under_hold
          from cw.retention_due order by retention_until""",
        rule="cw.retention_due — due-ness and the hold FLAG, never the matter and "
             "never agreement bodies. Destruction is the administrator's own act "
             "(U9, 0022; revoked from legal_admin, not shared). The view runs with "
             "owner rights, which is what answers the flag to a role that may read "
             "neither table underneath it (U13, 0024)",
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

    # ── The reading room (WP-U14, migration 0017) ───────────────────────────
    #
    # NO PARAMETERS, ON EITHER OF THESE, AND THAT IS THE CONTROL.
    #
    # The scoping is "this share, this person", and it comes from the identity
    # already bound to the connection. An `agreement_id` parameter is exactly how
    # the viewer's render ends up fetched through something broader than the one
    # share they were given, which is WP-U14's critical anti-pattern.
    #
    # AND THERE IS NO EXPORT ENDPOINT. ADR-0008 gave the viewer none, deliberately:
    # the reading room shows a contract to somebody outside the deal, and letting
    # them take a copy away is a different act that nobody has decided. 0017 leaves
    # nothing for a future export button to call. If a screen seems to need one,
    # that is a decision for the owner and not an endpoint.
    "GET /reading-room": Read(
        sql="""select share_id, agreement_id, shared_with, shared_by, shared_at, purpose,
                 counterparty, executed_on, effective_on, term_end
          from cw.reading_room order by shared_at desc""",
        rule="cw.reading_room scopes itself in its own WHERE clause — a view does "
             "not inherit the policy underneath it (0017)",
    ),

    # The paper render, and the one place a viewer sees an approval.
    "GET /reading-room/clauses": Read(
        sql="""select agreement_id, clause_id, version, title, body, reviewer,
                 approved_on, origin, provenance
          from cw.reading_room_clause order by agreement_id, clause_id""",
        rule="cw.reading_room_clause scopes itself in its own WHERE clause, in the "
             "same words as the share it hangs off (0017)",
    ),

    # ── The library and the ladders (WP-U13, migration 0018) ────────────────
    "GET /library": Read(
        sql="""select * from cw.library_entry
          order by category_key, severity, clause_id, version""",
        rule="cw.clause / cw.clause_version read_all policies — reading clause text "
             "is not the risk. cw.library_entry is classified read-all in "
             "views-are-not-policies.test.mjs",
    ),

    # ORDER BY IS THE VIEW'S OWN, AND IS NOT REPEATED HERE.
    #
    # cw.ladder_board ends `order by l.category_key, l.severity, r.rung nulls
    # last`, and the nulls-last matters: a ladder with NO RUNGS appears as one row
    # with a null rung and ladder_status 'empty'. That row is the whole point of
    # the view — an inner join would drop exactly the broken ladders, and the
    # screen would report a configuration fault as a healthy short list.
    #
    # So nothing here filters nulls for tidiness, and nothing re-sorts.
    "GET /ladders": Read(
        sql="""select * from cw.ladder_board""",
        rule="cw.ladder / cw.ladder_rung read_all policies; cw.ladder_board's "
             "empty-ladder row is load-bearing and must not be filtered out",
    ),

    # ── Assembly runs (migration 0025) ──────────────────────────────────────
    #
    # NO PARAMETERS, ON ANY OF THE THREE, FOR THE REASON THE READING ROOM GAVE.
    #
    # The scoping is "these runs, this person", and it comes from the identity
    # already bound to the connection. A run_id parameter is the same shape as
    # the agreement_id parameter WP-U14 refused above: a caller who wants one
    # run filters what the policy already returned, and a screen that filters
    # can never be the thing that decides what it may see.
    #
    # THE CONSEQUENCE, STATED RATHER THAN DISCOVERED. These answers are
    # unbounded. For an auditor, GET /runs/decisions is every decision of every
    # run ever recorded, in one reply. When that becomes a problem the answer is
    # a bound WRITTEN INTO THE SQL HERE — a default limit, most recent first —
    # and never a filter the caller supplies, because the caller-supplied filter
    # is the thing being avoided.
    #
    # THE DEPENDENCY, VISIBLE FROM THE FILE THAT DEPENDS ON IT. The first two
    # are only safe because 0025 scoped cw.run_summary and cw.run_contract in
    # their own WHERE clauses. If that migration is ever reverted, these must be
    # re-pointed at cw.run and cw.run_decision — which carry their own policies
    # — BEFORE the revert lands, or every run in the system is handed to every
    # reader who holds the grant.
    #
    # A CONTRADICTION THAT WAS HERE UNTIL 2026-07-27, and how it was settled,
    # because the reasoning is worth more than the outcome.
    #
    # The administrator could read every FINDING on every assembly in the
    # company (0013:296 grants the three base tables, 0013:321 gives the read
    # policy) and neither SUMMARY — the two views predate the role by two
    # migrations. An alarm nobody can investigate, which is how the owner
    # settled it: migration 0026 admits the role to both.
    #
    # THE PART TO REMEMBER IF THIS IS EVER REVISITED: 0026 is a grant AND a
    # scoping-clause change, and it has to be both. The grant on its own leaves
    # every query succeeding and answering nothing, which reads on screen as
    # "no contract has ever been assembled". docs/open-questions.md §9 records
    # the same shape on legal holds, where it shipped.
    "GET /runs": Read(
        sql="""select run_id, vendor, agreement_id, manifest_source,
                 snapshot_id, ruleset_id, result_hash, engine_version,
                 gate_open, overridden, created_by, created_at,
                 decisions, unresolved, findings, blocking
          from cw.run_summary order by created_at desc""",
        rule="cw.run_summary scopes itself in its own WHERE clause, in the same "
             "words as cw.run's read_scoped policy (0025) — a view does not "
             "inherit the policy on the table underneath it",
    ),

    "GET /runs/decisions": Read(
        sql="""select run_id, seq, category, severity, reason, baseline,
                 clause_id, version, title, body, warning, suppressed
          from cw.run_contract order by run_id, seq""",
        rule="cw.run_contract scopes itself in its own WHERE clause via its join "
             "to cw.run (0025)",
    ),

    # This one reads the RLS-bearing base table rather than a view, because
    # there is no view — and cw.run_finding's own policy already answers the
    # question, transitively through the run it belongs to.
    "GET /runs/findings": Read(
        sql="""select run_id, seq, rule_id, rule_version, severity, title,
                 detail, refs
          from cw.run_finding order by run_id, seq""",
        rule="cw.run_finding read_scoped policy — a finding is visible exactly "
             "when its run is",
    ),

    # ── Notifications (OB-08/09) ────────────────────────────────────────────
    # The workspace panel: what is waiting on THE CALLER, derived fresh on
    # every read. The view passes the caller's own name and role to
    # cw.waiting_for, so there is nothing here to scope — it is self-scoping
    # by construction, and the daily digest reads the same derivation.
    "GET /waiting": Read(
        sql="""select kind, subject_ref, due_on, since
          from cw.waiting_on_you
          order by due_on nulls last, since nulls last, kind, subject_ref""",
        rule="cw.waiting_on_you (0041) — self-scoping by construction; one "
             "derivation feeds this panel and the digest, so they cannot "
             "disagree",
    ),

    # What was actually sent, to whom, carrying which references. A person
    # sees their own deliveries; the machine's operator and its examiners see
    # all of them.
    "GET /notifications/outbox": Read(
        sql="""select outbox_id, person, channel, sent_on, kind, refs, sent_at,
                 outcome, failure
          from cw.notification_outbox order by outbox_id desc""",
        rule="cw.notification_outbox read_scoped policy — own rows, plus "
             "administrator, auditor and legal_admin in full",
    ),

    # People being waited on whom no channel can reach. Empty is good news
    # only if somebody is looking, which is why this is an endpoint and not a
    # query somebody has to remember.
    "GET /notifications/gap": Read(
        sql="""select person, role from cw.notification_gap order by person""",
        rule="cw.notification_gap grant — administrator, auditor and "
             "legal_admin; everyone else is refused, not shown an empty list",
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
