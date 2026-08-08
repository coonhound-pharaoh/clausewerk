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

    # ── Notices raised, and whether anybody answered (NT-2, over 0064) ──────
    # No parameter, as everywhere: the scoping is "yours, or addressed to you
    # or your role, plus Legal and the auditor in full", and it comes from the
    # connection through cw.notice's own read policy.
    "GET /notices": Read(
        sql="""select notice_id, raised_by, raised_at, to_role, to_person,
                 subject_kind, subject_ref, note, state, acknowledged_by,
                 acknowledged_at, acknowledgement_note
          from cw.notice_state order by notice_id desc""",
        # THIS NOTE WAS FALSE FOR AS LONG AS IT EXISTED, and it is worth one
        # line of history because a note is what a reviewer trusts INSTEAD of
        # checking. It said the policy was "reached through cw.notice_state".
        # It was not: a view runs with its owner's rights, so the policy under
        # it was never consulted, and one requester read another requester's
        # private notes in full through this endpoint. 0071 put the policy's own
        # predicate into the view, which is what makes the sentence true.
        rule="cw.notice read_scoped policy (0064), repeated as cw.notice_state's "
             "own WHERE clause by 0071 — your own raised notices, the ones "
             "addressed to you or your role, and Legal and the Auditor in full. "
             "No viewer grant of any kind",
    ),

    # The permitted raiser → recipient pairs, so a screen can offer only the
    # notices that would land. THE SCREEN DOES NOT DECIDE ANYTHING WITH THIS —
    # the database refuses an unrouted notice either way; this is so the person
    # is not offered a button that will fail.
    "GET /notice-routes": Read(
        sql="""select raiser_role, to_role, subject_kind, why
          from cw.notice_route order by raiser_role, subject_kind, to_role""",
        rule="cw.notice_route read_all policy (0064) — every signed role reads "
             "it; who may raise what is not a secret",
    ),

    # DELIBERATELY ABSENT: GET /intake/coverage and its summary (0067). They
    # counted intake questions whose answers matched no term list. Four of the
    # six questions carry no term list to match, so they were counted as gaps
    # they could never not be; and even for the two that do, silence means
    # either "we missed something" or "there was nothing to find" and the
    # figure cannot tell you which. Removed rather than narrowed — a weak
    # number on a screen is worse than no number (Mike, 2026-08-05).

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

    # ── The edit-quality cuts (NC-13, migration 0048) ───────────────────────
    # The retained-language figure (0029's edit_similarity), three ways. The
    # threshold column is Legal's number or null; below_threshold is null —
    # never zero — when no threshold is set, and the screen must keep the two
    # sentences apart. No alarm fires anywhere: the figure is for a person
    # and a regulator, never a gate.
    "GET /quality/edit": Read(
        sql="""select * from cw.edit_quality""",
        rule="cw.edit_quality grant — legal_reviewer, legal_admin, auditor; "
             "the same readers cw.review_quality has had since 0008",
    ),

    "GET /quality/edit/by-category": Read(
        sql="""select * from cw.edit_quality_by_category order by category_key""",
        rule="cw.edit_quality_by_category grant — the review_quality readers",
    ),

    "GET /quality/edit/by-agreement": Read(
        sql="""select * from cw.edit_quality_by_agreement
          order by agreement_id nulls last""",
        rule="cw.edit_quality_by_agreement grant — the review_quality readers. "
             "The null-agreement row is tickets opened outside any deal, kept "
             "visible; nulls last, never filtered",
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

    # The whole rule catalogue, retired versions included — the Legal admin's
    # screen shows history, and cw.active_conflict_rule is the engine's cut,
    # not the governance surface's. Which versions are IN FORCE is derivable
    # (latest effective, not retired), and the screen derives it rather than
    # asking a second endpoint.
    "GET /rules": Read(
        sql="""select rule_id, version, name, severity, title, detail, predicate,
                 approved_by, approved_on, effective_on, retired, retired_reason
          from cw.conflict_rule order by rule_id, version""",
        rule="cw.conflict_rule read_all policy — a rule is a legal judgement "
             "expressed as data, readable by every signed role",
    ),

    # Who may redact under a live delegation (U12). The administrator's
    # console needs the list to grant and revoke against; Legal reads it to
    # know who holds the authority.
    "GET /records-delegates": Read(
        sql="""select delegate_id, person, granted_by, granted_at, reason,
                 revoked_by, revoked_at
          from cw.records_delegate order by delegate_id""",
        rule="cw.records_delegate read_all policy (0023) — the delegation is on "
             "the record by design; only granting and revoking are the "
             "administrator's",
    ),

    # The envelope strip (OB-15): where each signature envelope stands. The
    # scoping is the table's own read policy — a requester sees their deals'
    # envelopes, Legal and the examiners see all.
    "GET /envelopes": Read(
        sql="""select envelope_id, agreement_id, provider, provider_envelope_id,
                 document_sha256, sent_by, sent_at, state
          from cw.signature_envelope order by sent_at desc, envelope_id desc""",
        rule="cw.signature_envelope read_scoped policy (0040) — Legal, auditor "
             "and administrator see all; a requester their own deals' envelopes",
    ),

    # Where each record is in its end of life — the disposal review queue U12
    # asks for, including the honest external_bytes_pending caveat, which a
    # screen must render rather than smooth over.
    "GET /redaction-state": Read(
        sql="""select agreement_id, retention_until, destroyed_on, destroyed_by,
                 redacted_on, redacted_by, purged_on, purged_by, state,
                 external_bytes_pending
          from cw.redaction_state order by agreement_id""",
        rule="cw.redaction_state grant (0023) — legal_reviewer, legal_admin, "
             "auditor, administrator; a viewer or requester has no business in "
             "the disposal queue",
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
    # THE CONSEQUENCE IS NOW BOUNDED. For an auditor, these answers previously
    # returned every decision and finding of every run ever recorded. The bound
    # is written into the SQL here: the 500 most recent visible runs, with all
    # child rows for each included run. It is never a filter the caller supplies,
    # because caller-supplied scope is the thing being avoided.
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
          from cw.run_summary order by created_at desc, run_id desc limit 500""",
        rule="cw.run_summary scopes itself in its own WHERE clause, in the same "
             "words as cw.run's read_scoped policy (0025) — a view does not "
             "inherit the policy on the table underneath it",
    ),

    "GET /runs/decisions": Read(
        sql="""select run_id, seq, category, severity, reason, baseline,
                 clause_id, version, title, body, warning, suppressed
          from cw.run_contract
          where run_id in (
            select run_id from cw.run
            order by created_at desc, run_id desc limit 500)
          order by run_id, seq""",
        rule="cw.run_contract scopes itself in its own WHERE clause via its join "
             "to cw.run (0025)",
    ),

    # This one reads the RLS-bearing base table rather than a view, because
    # there is no view — and cw.run_finding's own policy already answers the
    # question, transitively through the run it belongs to.
    "GET /runs/findings": Read(
        sql="""select run_id, seq, rule_id, rule_version, severity, title,
                 detail, refs
          from cw.run_finding
          where run_id in (
            select run_id from cw.run
            order by created_at desc, run_id desc limit 500)
          order by run_id, seq""",
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

    # ── Reporting (RP-01, migration 0043) ───────────────────────────────────
    # Management surfaces over the whole record, so the grant is the control:
    # legal_admin and auditor, nobody else — including the administrator, who
    # runs the machine and does not read contract operations. Every figure is
    # derived fresh; there is no aggregate store to drift.
    "GET /reports/velocity": Read(
        sql="""select * from cw.report_velocity order by opened_on desc, agreement_id""",
        rule="cw.report_velocity grant — legal_admin and auditor only; the view "
             "reads with owner rights across every deal, so the grant is the "
             "whole control (the cw.retention_due precedent)",
    ),

    "GET /reports/contested": Read(
        sql="""select * from cw.report_clause_contest
          order by contests desc, category_key""",
        rule="cw.report_clause_contest grant — legal_admin and auditor only",
    ),

    "GET /reports/queue": Read(
        sql="""select * from cw.report_queue_state""",
        rule="cw.report_queue_state grant — legal_admin and auditor only",
    ),

    # A workload signal for staffing, never a performance score — the view's
    # own comment says so and the screen must keep saying it.
    "GET /reports/reviewers": Read(
        sql="""select * from cw.report_reviewer_throughput
          order by decided desc, reviewer""",
        rule="cw.report_reviewer_throughput grant — legal_admin and auditor only",
    ),

    "GET /reports/exposure": Read(
        sql="""select * from cw.report_risk_exposure
          order by category_key, severity""",
        rule="cw.report_risk_exposure grant — legal_admin and auditor only",
    ),

    # ── Policy-shift exposure (RP-04, migration 0046) ───────────────────────
    "GET /reports/policy-shift": Read(
        sql="""select * from cw.policy_shift_exposure
          order by clause_id, agreement_id""",
        rule="cw.policy_shift_exposure grant — legal_admin and auditor only. "
             "The worklist an amendment campaign starts from, never the "
             "amendments: a report must not become a second way for language "
             "to reach an agreement",
    ),

    # ── The vendor friction scorecard (RP-03, migration 0045) ───────────────
    # Readable by requesters ON PURPOSE: the whole point is that intake sees a
    # vendor's history before committing to them. Counts per vendor name, a
    # labelled estimate beside them, no contract content and no deal ids.
    "GET /vendors/friction": Read(
        sql="""select * from cw.vendor_friction
          order by friction_per_deal desc, counterparty""",
        rule="cw.vendor_friction grant — requester, legal_reviewer, "
             "legal_admin, auditor. The cost column is labelled an estimate "
             "IN THE ROW; a screen may not drop the label",
    ),

    # ── Review routing (RP-02, migration 0044) ──────────────────────────────
    # Where each pending ticket stands: claimed by whom, owned by whom,
    # escalated or not. The route is derived at read time from cw.ladder, so
    # there is no stored assignment to go stale.
    "GET /tickets/route": Read(
        sql="""select ticket_id, category_key, severity, created_at, claimed_by,
                 category_owner, escalated
          from cw.ticket_route order by created_at""",
        rule="cw.ticket_route grant — legal_reviewer, legal_admin, auditor",
    ),

    # ── Portfolio questions on our own paper (NC-16, migration 0049) ────────
    # THE CERTAIN HALF, and labelled as such: counts from the recorded
    # decision sets, no AI anywhere. Each agreement is represented by its
    # LATEST run (the 0049 representation rule) and an unattached run stands
    # alone in its own figure — so a renegotiated deal never counts twice and
    # nothing is silently dropped. The rung answers are the runs' own pinned
    # snapshots: historic answers reproduce, they are never recomputed
    # against today's library.
    "GET /portfolio/positions": Read(
        sql="""select category_key, category, severity, clause_id, version,
                 title, rung_at_run, was_floor, decisions, agreements,
                 unattached_runs
          from cw.portfolio_position
          order by category_key, severity, clause_id, version""",
        rule="cw.portfolio_position scopes itself through cw.portfolio_run's "
             "own WHERE clause (0049), in the run views' exact phrasing — a "
             "requester's NUMBERS are computed only over runs they created "
             "or deals they own, which is the fence D-7 can later widen",
    ),

    "GET /portfolio/unresolved": Read(
        sql="""select category_key, category, severity, unresolved,
                 agreements, unattached_runs
          from cw.portfolio_unresolved
          order by category_key, severity""",
        rule="cw.portfolio_unresolved via cw.portfolio_run (0049) — nothing "
             "could be selected is its own count, never folded into zero: "
             "'no exposure' and 'unmeasured exposure' are different sentences",
    ),

    # ── Round analysis and risk estimates (NC-17/NC-26, 0052/0053) ──────────
    # Advice on the record: which position each analysed paragraph touches,
    # by which instrument, with the retreat path beside it — and the risk
    # estimates, labelled estimates, absences recorded as outcomes. Nothing
    # here can move a position or gate anything.
    "GET /negotiations/analysis": Read(
        sql="""select analysis_id, negotiation_id, round_no, paragraph_index,
                 original_text, proposed_text, author, matched_position,
                 no_match_ticket, match_score, matcher, category_key,
                 classifier, model, model_version, alternatives, analysed_at,
                 analysed_by
          from cw.round_analysis order by analysis_id""",
        rule="cw.round_analysis read_scoped policy (0052) — Legal and the "
             "Auditor in full, a requester their own deals' analyses; no "
             "viewer, and no administrator (the negotiation family's open "
             "boundary, 0027)",
    ),

    "GET /risk/assessments": Read(
        sql="""select assessment_id, analysis_id, concession_id, direction,
                 outcome, transfer_estimate, basis, absent_reason, model,
                 model_version, assessed_at, assessed_by
          from cw.risk_assessment order by assessment_id""",
        rule="cw.risk_assessment read_scoped policy (0053) — estimates are "
             "advisory, signed -1..1, and an absent outcome carries its "
             "reason; the texts the model read stay on the row for the "
             "record and are deliberately not repeated on this list surface",
    ),

    # ── Obligations (OB-07, migrations 0036-0039) ───────────────────────────
    # The state view is deliberately UNscoped per person: colleagues cover for
    # each other (open-questions §12, settled), so every working role sees the
    # whole obligation book and a workspace filters what the policy already
    # returned — the audit-console pattern. Confidential deals arrive later as
    # an explicit marking, and that capability's view is where narrowing will
    # live. No viewer grant anywhere below.
    "GET /obligations": Read(
        sql="""select obligation_id, agreement_id, clause_id, version, kind,
                 obliged, summary, occurrence, due_on, evidence, lead_days,
                 survives, entitlement, owner_person, closed_as, closed_by,
                 closed_at, breach_asserted_by, state
          from cw.obligation_state
          order by due_on nulls last, obligation_id""",
        rule="cw.obligation_state grant (0038) — every working role plus the "
             "auditor and administrator, no viewer. The source clause "
             "(clause_id, version) is always adjacent: an obligation answers "
             "to the wording that created it. pending/due/overdue are "
             "computed on every read; overdue is arithmetic, never breach "
             "(D-1)",
    ),

    "GET /obligations/gaps": Read(
        sql="""select agreement_id, clause_id, version, registered_at
          from cw.obligation_coverage_gap
          order by agreement_id, clause_id, version""",
        rule="cw.obligation_coverage_gap read_scoped policy (0036) — an "
             "in-force clause declaring no obligations is reported, never "
             "guessed at; during development every gap is expected (content "
             "is placeholder)",
    ),

    "GET /obligations/unowned": Read(
        sql="""select obligation_id, agreement_id, kind, due_on
          from cw.obligation_unowned
          order by due_on nulls last, obligation_id""",
        rule="cw.obligation_unowned grant (0037) — absence of an owner "
             "rendered as a gap, never as calm",
    ),

    "GET /agreements/closeable": Read(
        sql="""select agreement_id, surviving_open, closeable
          from cw.agreement_close_eligibility order by agreement_id""",
        rule="cw.agreement_close_eligibility grant (0038) — nobody marks a "
             "deal closed; the record says whether it is, and an unanchored "
             "survivor blocks (fail-closed)",
    ),

    # ── The negotiation record (NC-08, migrations 0011 + 0027) ──────────────
    #
    # NO PARAMETERS, ON ANY OF THE FOUR, for the reason the reading room and
    # the run reads gave: the scoping is "these deals, this person", and it
    # comes from the identity already bound to the connection. A
    # negotiation_id parameter is a caller choosing what it may see. Nothing
    # here adds a WHERE either — the three views scope themselves in their own
    # WHERE clauses since 0027, the rounds read sits on the table's own read
    # policy, and both absences are asserted by name in test_reads.py.
    #
    # THE ADMINISTRATOR, STATED RATHER THAN DISCOVERED. The role holds no
    # grant on the three views — an honest refusal — and 0027 records leaving
    # that boundary to the owner on purpose. On cw.negotiation_round the role
    # holds 0013's grant but no policy admits it, so the database FILTERS
    # instead of refusing and the answer is always zero rows: the same shape
    # docs/open-questions.md §9 wrote up on legal holds, where it shipped.
    # Reported by a named test in test_reads.py; not closed here, because
    # widening a role's read is an owner decision and never a read package's.
    # THE HEADER ROW, and the reason it arrives late: the four reads below have
    # existed since NC-08 and every one of them describes something INSIDE a
    # negotiation — its rounds, its positions, its revivals, its drift. Nothing
    # named the negotiations themselves, so a screen could show what was
    # happening in a negotiation it could not list. Found while building the
    # negotiate screens, which is where it became impossible to ignore.
    #
    # `renews_agreement_id` is here because a renewal and a fresh negotiation
    # are different commercial acts (0011's own words) and the difference must
    # reach the screen: the drift report is a control that belongs in front of
    # whoever opened a renewal, and this column is how a screen knows to show it.
    "GET /negotiations": Read(
        sql="""select negotiation_id, agreement_id, paper, baseline, state,
                 opened_on, opened_by, renews_agreement_id, baseline_note,
                 baseline_chosen_by
          from cw.negotiation order by negotiation_id""",
        rule="cw.negotiation read_scoped policy (0011) — Legal and the Auditor "
             "in full, a requester the negotiations on deals they own, no "
             "viewer grant. The same sentence cw.position_current copies into "
             "its own WHERE clause (0027). The administrator holds 0013's "
             "table grant and no policy admits the role, so this answers them "
             "zero rows rather than refusing — the reported gap on "
             "cw.negotiation_round, on two more tables; test_reads.py pins it",
    ),

    # How a position got where it is, rather than only where it is.
    # cw.position_current answers the second question and deliberately not the
    # first: it is the LATEST movement per position. A screen showing a rung
    # without the retreat that reached it shows a number nobody can account for.
    "GET /negotiations/movements": Read(
        sql="""select m.movement_id, m.position_id, p.negotiation_id,
                 p.category_key, m.round_no, m.to_state, m.current_rung,
                 m.actor, m.note, m.moved_at
          from cw.position_movement m
          join cw.negotiation_position p using (position_id)
          order by m.position_id, m.movement_id""",
        rule="cw.position_movement read_scoped policy (0011), which walks to "
             "cw.negotiation for a requester exactly as the join here does — a "
             "movement is visible precisely when the position it moved is. The "
             "administrator's zero-row answer is the same reported gap as "
             "GET /negotiations above",
    ),

    "GET /negotiations/rounds": Read(
        sql="""select negotiation_id, round_no, direction, document_sha256,
                 storage_uri, sent_on, actor, run_id, recorded_at
          from cw.negotiation_round order by negotiation_id, round_no""",
        rule="cw.negotiation_round read_scoped policy (0011) — Legal and the "
             "Auditor in full, a requester the rounds of deals they own, no "
             "viewer grant",
    ),

    "GET /negotiations/positions": Read(
        sql="""select position_id, negotiation_id, category_key, our_clause_id,
                 our_version, their_text_ref, round_raised, opened_from, state,
                 current_rung, round_last_moved, moved_by
          from cw.position_current order by negotiation_id, position_id""",
        rule="cw.position_current scopes itself in its own WHERE clause (0027), "
             "in the same words as cw.negotiation's read policy — a view does "
             "not inherit the policy on the table underneath it",
    ),

    # The same argument reopening, made visible — live from the first round,
    # which is the point of the record. An empty answer means no settled point
    # is being renegotiated, which is good news and must render as "none".
    "GET /negotiations/revivals": Read(
        sql="""select position_id, negotiation_id, category_key, times_held,
                 first_held_round, last_round
          from cw.position_revival order by negotiation_id, position_id""",
        rule="cw.position_revival scopes itself before the grouping (0027), so "
             "the counts are counts of rows this caller may see",
    ),

    # Reporting, never a rewrite: what the positions this renewal opened from
    # are carrying, and how far the library has moved since. U1's control —
    # it must stay in front of whoever opens the renewal.
    "GET /negotiations/drift": Read(
        sql="""select negotiation_id, agreement_id, baseline, clause_id,
                 executed_version, successor_version, superseded_reason,
                 current_state
          from cw.renewal_drift order by negotiation_id, clause_id""",
        rule="cw.renewal_drift scopes itself in its own WHERE clause (0027); "
             "the drift report rewrites nothing",
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
