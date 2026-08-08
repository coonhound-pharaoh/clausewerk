"""Every write that goes through the doorway, and the one thing they all share.

THE RULE THIS MODULE MAKES STRUCTURAL

    There is no write endpoint that does not carry the session's actor.

Not "we remember to attribute writes" — there is nowhere to put a different name.
Nothing below takes an actor from the request body, and a test walks this module
asserting it. The v3 prototype's unattributed override is therefore not a bug
that was fixed; it is a shape that cannot be expressed.

The attribution itself is not done here at all. `db.as_person()` binds `cw.actor`
to the session's person before the first statement, and the audit triggers in the
schema read it. So a handler that simply performs the write is already
attributed, and a handler that tried to attribute differently would have to fight
the connection to do it.

THREE THINGS EVERY ENTRY BELOW OBEYS

  1. ONE ACT PER ENDPOINT. No convenience endpoint bundles several governed acts
     into one call. Each recorded act is one act; bundling blurs what was
     approved, and an auditor reading the chain afterwards cannot tell which of
     the bundled things the person actually looked at.

  2. NO RETRY, EVER. Nothing here catches a refusal and tries again — not as a
     different role, not on a different connection, not at all. A refusal is the
     system working. "Making the demo work" by reissuing a refused write is the
     single most damaging line anybody could add to this module.

  3. NO PERMISSION CHECKS. Same as the reads: the database decides. Each entry
     names the rule it defers to, and that note is documentation of where the
     decision lives — not a decision being made here.

WHY THE PLACEHOLDERS CARRY FIELD NAMES

The JavaScript numbers its parameters `$1, $2, $3`, and PostgreSQL binds those by
NUMBER wherever they appear. The obvious port is `%s`, which psycopg binds by
ORDER OF APPEARANCE — and in three of these statements the numbers do not appear
in order. `POST /settings` reads `set value = $2 where key = $1`. Ported to `%s`
it would silently set the key to the value and look for a setting named after the
new value. It would not fail; it would write the wrong thing and report success.

So every placeholder here is named after the field that fills it. The binding
cannot depend on where the placeholder sits in the sentence, and a name that does
not match the declared field list fails loudly at the first call rather than
quietly for a year.

A SILENT NO-OP IS A FAILURE, AND THIS IS WHERE THE TWO LANGUAGES DIVERGE

An UPDATE refused by a missing policy does not raise. It changes nothing and
reports success — finding D1's exact shape. Every statement below returns
something, so a write that produced no row changed no row, and `run()` treats
that as the refusal it is rather than answering `{"rows": []}` the way the
JavaScript does. This is the one deliberate behaviour change in the port, it is
named in the work package, and it is written up in PORT-NOTES.md.

Ported from `backend/service/mutations.mjs` on 2026-07-26.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field as dataclass_field
from typing import Any

import psycopg

from doorway.db import Database, SilentlyRefused
from doorway.identity import Caller
from doorway.refusals import Refused, classify

# Names a request body may never carry. Every one of them is an actor, and every
# actor comes from the connection. This list is enforced by a test rather than by
# reading — see test_writes.py.
NEVER_FROM_THE_BODY = frozenset({
    "actor", "acted_by", "approved_by", "approver", "opened_by", "added_by",
    "removed_by", "decided_by", "created_by", "revoked_by", "requested_by",
    "settled_by", "proposed_by", "countersigned_by", "reviewer", "person_acting",
    # `requester` was missing from this list until the mutation harness broke the
    # deals endpoint and nothing noticed. It is the most load-bearing name in the
    # schema: `cw.agreement.requester` is what `cw.owns_agreement()` reads, and
    # that function decides a requester's access to their deals, their runs, their
    # overrides, their reading room, and six more views. A deal opened under
    # somebody else's name hands them all of it.
    #
    # `requested_by` was on the list and `requester` was not, which is exactly how
    # a list like this goes wrong: it grows by whatever the last endpoint happened
    # to be called.
    "requester",
    # `baseline_chosen_by` is an actor for the same reason `opened_by` is: it
    # records WHO made the U1 choice between opening a renewal from last term's
    # executed positions and opening it from library standard. A body that could
    # name somebody else would put another person's name on a commercial
    # decision they did not make.
    "baseline_chosen_by",
    # ── The seventeen that were simply never added (2026-08-08) ─────────────
    #
    # THE COMMENT ABOVE DESCRIBED THIS LIST'S FAILURE MODE AND THEN THE LIST WENT
    # ON FAILING THAT WAY. The schema holds 33 columns carrying a person's name;
    # this declaration held 17 of them. Nothing had gone wrong yet — every entry
    # in WRITES was driven against all 33 and none takes one of these from a body
    # — but "no endpoint has made that mistake yet" is not a guard, and this list
    # is the only thing that would notice the first one.
    #
    # `test_the_declaration_covers_every_person_column_the_schema_has` now DERIVES
    # the set from backend/db/migrations and fails naming anything missing here.
    # So a migration that adds `escalated_by` next month breaks that test, and
    # this list stops growing by whatever the last endpoint happened to be called.
    "acknowledged_by", "analysed_by", "assessed_by", "assigned_by",
    "destroyed_by", "granted_by", "raised_by", "ran_by", "received_by",
    "released_by", "retired_by", "sent_by", "set_by", "shared_by",
    "tagged_by", "withdrawn_by",
})


class Missing(Exception):
    """A required field that arrived absent or blank.

    The schema already refuses blanks where it matters — a rejection needs a
    note, a justification cannot be boilerplate. This catches it one step earlier
    so the message names the field rather than the constraint.
    """


class WrongShape(Exception):
    """A field that arrived as an object, list or boolean where a plain value belongs."""


def refuse_structured(name: str, value: Any) -> Any:
    """Refuse an object or a list for a field that takes a plain value.

    THE ONE COPY OF THIS RULE. Import it; do not restate the isinstance test.

    A `dict` or a `list` handed to psycopg as a bind parameter raises
    `cannot adapt type 'dict'`, which carries no SQLSTATE and so lands in the
    catch-all that means "we broke". The caller mistyped a form field and gets
    told the service failed — the exact inversion this codebase argues against
    wherever the question comes up (server.py, documents.py).

    Refused HERE, at the boundary where presence is already checked, so the
    message can name the field. Raises rather than returning a sentinel because
    the other callers are raising boundaries too; the one that must answer
    instead of raise catches this and converts.

    Empty cases are covered deliberately: `str({})` is "{}" and `str([])` is
    "[]", so neither is caught by the blankness check below.
    """
    if isinstance(value, bool):
        raise WrongShape(f"{name} takes a plain value, not a boolean")
    if isinstance(value, (dict, list)):
        raise WrongShape(f"{name} takes a plain value, not an object or a list")
    return value


@dataclass(frozen=True)
class Field:
    """One value a write takes from the request body.

    Never an actor. See NEVER_FROM_THE_BODY above, and the test that enforces it.
    """

    name: str
    required: bool = True
    default: Any = None
    as_json: bool = False
    # The one conditional field in the whole set: a rejected override finding
    # must carry a note, an approved one need not. Expressed as data so it can be
    # read by a test rather than hidden inside a handler.
    required_if: tuple[str, Any] | None = None


@dataclass(frozen=True)
class Write:
    """One write: a statement, the fields it takes, and the rule it defers to."""

    sql: str
    rule: str
    fields: tuple[Field, ...] = ()

    def bind(self, body: dict) -> dict:
        """Turn a request body into the statement's parameters, or refuse."""
        body = body or {}
        params: dict[str, Any] = {}
        for spec in self.fields:
            value = body.get(spec.name)
            # Shape before blankness: an empty dict is not blank by the test
            # below, and would sail through to the driver.
            if not spec.as_json:
                refuse_structured(spec.name, value)
            blank = value is None or str(value).strip() == ""

            demanded = spec.required
            if spec.required_if is not None:
                other, expected = spec.required_if
                # `or`, not `=`. These two read as though they compose, and a
                # field declared required=True alongside a required_if used to
                # become optional whenever the condition was false — required_if
                # ADDS a condition under which a field is demanded, it never
                # takes away one that was already unconditional.
                demanded = spec.required or (body.get(other) == expected)

            if blank and demanded:
                raise Missing(f"{spec.name} is required and cannot be blank")
            if blank:
                value = spec.default
            if spec.as_json and value is not None:
                value = json.dumps(value)
            params[spec.name] = value
        return params


WRITES: dict[str, Write] = {
    # ── Deals ───────────────────────────────────────────────────────────────
    # Note the requester column: it is the SESSION's person, not a value from the
    # body. A deal opened "on behalf of" somebody else would put the wrong name on
    # every scoping decision that follows from it.
    "POST /deals": Write(
        sql="""insert into cw.agreement (agreement_id, counterparty, requester)
       values (%(agreement_id)s, %(counterparty)s, current_setting('cw.actor'))
       returning agreement_id, counterparty, requester, status""",
        rule="cw.agreement requester_writes policy — a requester opens their own deals",
        fields=(Field("agreement_id"), Field("counterparty")),
    ),

    # ── The library's skeleton ──────────────────────────────────────────────
    # A category is the library's structure rather than its content: it says the
    # company has a position on data privacy, not what that position is. It is
    # still Legal admin's to create, because deciding which risks the library
    # covers is a judgement about the library.
    #
    # This endpoint exists because a system with no categories can do nothing at
    # all — no ticket, no clause, no run — and the seeded walkthrough deliberately
    # creates none. Somebody has to make the first one, and that somebody is a
    # named person performing a recorded act rather than a migration inventing a
    # starting library on their behalf.
    "POST /categories": Write(
        sql="""insert into cw.category (key, label, short)
       values (%(key)s, %(label)s, %(short)s)
       returning key, label, short""",
        rule="cw.category admin_writes policy — legal_admin only",
        fields=(Field("key"), Field("label"), Field("short")),
    ),

    # ── The governed library acts (D-5, NC-21/22/23) ────────────────────────
    # Six acts the frozen 52 never carried, released by owner decision D-5
    # (2026-08-02, memory.md S218). Every one defers to authority the schema
    # already holds; none of these entries decides anything.

    # Retiring wording is withdrawal, not replacement — state stays derived
    # (0002), retired_on is bound by trigger, and un-retiring is refused there.
    "POST /library/retire": Write(
        sql="""update cw.clause_version
          set retired = true, retired_reason = %(reason)s
        where clause_id = %(clause_id)s and version = %(version)s
          and not retired
        returning clause_id, version, retired, retired_reason, retired_on""",
        rule="cw.clause_version admin_writes policy — legal_admin only; "
             "cw.clause_version_immutable() binds retired_on and refuses "
             "everything else",
        fields=(Field("clause_id"), Field("version"), Field("reason")),
    ),

    # One recorded act: mint the successor through the library's one minting
    # door and record the supersession, inside cw.supersede_clause() (0062).
    # The approver is bound from the session by trigger, whatever is proposed.
    "POST /library/supersede": Write(
        sql="""select cw.supersede_clause(
         %(clause_id)s, %(version)s, %(title)s, %(body)s, %(rationale)s,
         coalesce((select array_agg(t.v order by t.o)
                     from jsonb_array_elements_text(%(citations)s::jsonb)
                          with ordinality t(v, o)), '{}'),
         %(expires_on)s, %(reason)s,
         coalesce(%(disposition)s, 'run_off')) as successor_version""",
        rule="cw.supersede_clause() (0062) — execute granted to legal_admin "
             "alone; U10: mints a new version, never rewrites, and in-flight "
             "deals are flagged by cw.run_drift rather than corrected",
        fields=(Field("clause_id"), Field("version"), Field("title"),
                Field("body"), Field("rationale"),
                Field("citations", required=False, as_json=True, default="[]"),
                Field("expires_on", required=False), Field("reason"),
                Field("disposition", required=False)),
    ),

    # Publishing a rule VERSION. cw.active_conflict_rule takes the latest
    # effective one per rule_id, so a new version supersedes in force without
    # touching its predecessor — the same never-edit shape as clause wording.
    # The approver is bound from the session by cw.bind_conflict_rule_approver().
    "POST /rules": Write(
        sql="""insert into cw.conflict_rule
         (rule_id, version, name, severity, title, detail, predicate, approved_by)
       values (%(rule_id)s,
               (select coalesce(max(version), 0) + 1 from cw.conflict_rule
                 where rule_id = %(rule_id)s),
               %(name)s, %(severity)s, %(title)s, %(detail)s,
               %(predicate)s::jsonb, current_setting('cw.actor'))
       returning rule_id, version, name, severity, approved_by, effective_on""",
        rule="cw.conflict_rule admin_writes policy — legal_admin only; the "
             "predicate_grammar constraint refuses anything but the three "
             "primitives, each non-empty",
        fields=(Field("rule_id"), Field("name"), Field("severity"),
                Field("title"), Field("detail"),
                Field("predicate", as_json=True)),
    ),

    "POST /rules/retire": Write(
        sql="""update cw.conflict_rule
          set retired = true, retired_reason = %(reason)s
        where rule_id = %(rule_id)s and version = %(version)s
          and not retired
        returning rule_id, version, retired, retired_reason""",
        rule="cw.conflict_rule admin_writes policy — legal_admin only; "
             "cw.conflict_rule_immutable() permits exactly this one mutation",
        fields=(Field("rule_id"), Field("version"), Field("reason")),
    ),

    # The one act of the six that always had its function (0003). The reviewer
    # argument is the session, never the body — it lands on the minted version
    # as its named reviewer.
    "POST /concessions/promote": Write(
        sql="""select cw.promote_concession(
         %(concession_id)s, %(new_clause_id)s, %(title)s, %(rationale)s,
         current_setting('cw.actor'), %(expires_on)s) as minted""",
        rule="cw.promote_concession() — execute granted to legal_admin alone; "
             "one of the library's two recorded entrances (0008), refuses "
             "double promotion and unsettled concessions itself",
        fields=(Field("concession_id"), Field("new_clause_id"), Field("title"),
                Field("rationale"), Field("expires_on", required=False)),
    ),

    # Moving the floor is the policy call 0003 deliberately left mutable; what
    # 0062 added is the audit trail. One UPDATE: the floor lands where named,
    # and leaves every other rung — a rung that does not exist changes nothing,
    # which surfaces as the 409 a silent no-op deserves.
    "POST /ladders/floor": Write(
        sql="""update cw.ladder_rung
          set is_floor = (rung = %(rung)s)
        where ladder_id = %(ladder_id)s
          and exists (select 1 from cw.ladder_rung f
                       where f.ladder_id = %(ladder_id)s and f.rung = %(rung)s)
        returning ladder_id, rung, is_floor""",
        rule="cw.ladder_rung admin_writes policy — legal_admin only; "
             "cw.ladder_rung_immutable() keeps everything but is_floor frozen, "
             "and cw.audit_ladder_floor() (0062) puts the move on the chain",
        fields=(Field("ladder_id"), Field("rung")),
    ),

    # Reordering rungs IS replacement — past concessions are recorded as "we
    # went to rung 2" and rung order is immutable in place (0003). One recorded
    # act: the live ladder retires, its replacement publishes, both audited.
    "POST /ladders/publish": Write(
        sql="""select cw.publish_ladder(
         %(category_key)s, %(severity)s,
         (select array_agg(c.v order by c.o)
            from jsonb_array_elements_text(%(clause_ids)s::jsonb)
                 with ordinality c(v, o)),
         (select array_agg(n.v::int order by n.o)
            from jsonb_array_elements_text(%(versions)s::jsonb)
                 with ordinality n(v, o)),
         %(floor_rung)s, %(reason)s, %(owner)s) as ladder_id""",
        rule="cw.publish_ladder() (0062) — execute granted to legal_admin "
             "alone; every 0003 rung rule still stands underneath it, and the "
             "retired ladder stays readable forever",
        fields=(Field("category_key"), Field("severity"),
                Field("clause_ids", as_json=True),
                Field("versions", as_json=True),
                Field("floor_rung"), Field("reason"),
                Field("owner", required=False)),
    ),

    # Releasing a hold. The release columns are bound from the session by
    # cw.bind_legal_hold_actor(), whatever this statement proposes; a hold
    # already released (or never opened) changes nothing and 409s.
    "POST /holds/release": Write(
        sql="""update cw.legal_hold
          set released_by = current_setting('cw.actor'),
              released_on = current_date
        where hold_id = %(hold_id)s and released_on is null
        returning hold_id, agreement_id, matter_ref, released_by, released_on""",
        rule="cw.legal_hold admin_releases policy (0010) — legal_admin only; "
             "opening is Legal's act, releasing is the admin's, and a released "
             "hold can never reopen",
        fields=(Field("hold_id"),),
    ),

    # ── Disposal (U9, U12): destroy, then redact, then purge ────────────────
    # Three functions, three grants, one escalation enforced twice in the
    # schema. Every one demands its actor argument EQUAL the session and
    # refuses while any hold is open, naming the matters to the person acting.
    "POST /retention/destroy": Write(
        sql="""select cw.retention_destroy(
         %(agreement_id)s, current_setting('cw.actor'))""",
        rule="cw.retention_destroy() — execute moved to the administrator alone "
             "by U9 (0022), revoked from legal_admin rather than shared; "
             "refused before the retention date and under any hold",
        fields=(Field("agreement_id"),),
    ),

    "POST /agreements/redact": Write(
        sql="""select cw.redact_agreement(
         %(agreement_id)s, current_setting('cw.actor'))""",
        rule="cw.may_redact() inside cw.redact_agreement() (0023) — the "
             "administrator, or a person holding a live recorded delegation; "
             "only after destruction, never under a hold",
        fields=(Field("agreement_id"),),
    ),

    "POST /agreements/purge": Write(
        sql="""select cw.purge_agreement(
         %(agreement_id)s, current_setting('cw.actor'))""",
        rule="cw.purge_agreement() (0023) — the administrator alone, "
             "undelegable, and only on a record already redacted; the audit "
             "chain survives it by privilege",
        fields=(Field("agreement_id"),),
    ),

    # The delegation that makes redaction delegable (U12): one person, one
    # authority, revocably, on the record. The person is WHO IS AUTHORISED —
    # the granting actor is the session, bound by column default and trigger.
    "POST /records-delegates": Write(
        sql="""insert into cw.records_delegate (person, reason)
       values (%(person)s, %(reason)s)
       returning delegate_id, person, granted_by, granted_at, reason""",
        rule="cw.records_delegate administrator_delegates policy (0023) — one "
             "live delegation per person, a reason of substance required",
        fields=(Field("person"), Field("reason")),
    ),

    "POST /records-delegates/revoke": Write(
        sql="""update cw.records_delegate
          set revoked_by = current_setting('cw.actor'), revoked_at = now()
        where person = %(person)s and revoked_at is null
        returning delegate_id, person, revoked_by, revoked_at""",
        rule="cw.records_delegate administrator_revokes policy (0023); revoking "
             "a delegation that is not live changes nothing and 409s",
        fields=(Field("person"),),
    ),

    # ── The review queue ────────────────────────────────────────────────────
    "POST /tickets": Write(
        sql="""insert into cw.review_ticket
         (agreement_id, category_key, severity, reason_code, provenance_badge,
          proposed_text)
       values (%(agreement_id)s, %(category_key)s, %(severity)s, %(reason_code)s,
               %(provenance_badge)s, %(proposed_text)s)
       returning ticket_id, state, opened_by, created_at""",
        rule="cw.review_ticket draft_writes/write_scoped policies; opened_by defaults "
             "to cw.app_actor()",
        fields=(
            Field("agreement_id", required=False),
            Field("category_key"), Field("severity"), Field("reason_code"),
            Field("provenance_badge"), Field("proposed_text"),
        ),
    ),

    # ── Review routing (RP-02) ──────────────────────────────────────────────
    # Claiming is coordination, not adjudication: "I am looking at this". The
    # claimer is the session, never the body; the schema refuses a claim on a
    # decided ticket and a second claim on a claimed one (the partial unique
    # index), so a race between two reviewers resolves in the database with
    # one winner and one honest refusal.
    "POST /tickets/claim": Write(
        sql="""insert into cw.ticket_claim (ticket_id)
       values (%(ticket_id)s)
       returning claim_id, ticket_id, person, claimed_at""",
        rule="cw.ticket_claim reviewers_claim policy — legal_reviewer and "
             "legal_admin; person is bound to cw.app_actor() by trigger",
        fields=(Field("ticket_id"),),
    ),

    # Release is not restricted to the claimer: a colleague releasing an
    # absent colleague's claim is the openness default doing its job, and
    # released_by names who did it. Releasing an unclaimed ticket changes
    # nothing and says so (finding D1: zero rows is a refusal, never silence).
    "POST /tickets/claim/release": Write(
        sql="""update cw.ticket_claim set released_by = current_setting('cw.actor')
       where ticket_id = %(ticket_id)s and released_at is null
       returning claim_id, ticket_id, person, released_by, released_at""",
        rule="cw.ticket_claim reviewers_release policy; the release columns "
             "are set by trigger, whatever this statement proposes",
        fields=(Field("ticket_id"),),
    ),

    # Verifying and rejecting are TWO endpoints, not one with a `state` field,
    # and that is not a style preference.
    #
    # Verification MINTS a clause version. It is the act ADR-0003 calls the only
    # mutation surface for the library, and `cw.verify_review_ticket()` performs
    # it as one decision and one record — settling the version number before the
    # ticket moves so the minting guard has something to check against, and
    # checking its own rowcount because an UPDATE with no matching policy affects
    # nothing and raises nothing (finding D1). Rejection mints nothing and needs a
    # note.
    #
    # The first version of the JavaScript had one `/tickets/decide` endpoint doing
    # a raw UPDATE, which the database refused outright: a verified ticket must
    # name the clause it minted, and an UPDATE that sets `state = 'verified'` and
    # nothing else cannot. That refusal was the schema stopping the API from
    # inventing a second, weaker way to promote language — exactly what it is for.
    #
    # approved_text is what the reviewer is actually approving, and it is REQUIRED
    # rather than defaulted to the proposed text. Quietly substituting the
    # proposal when the field is absent would make every unedited approval a fact
    # the system invented rather than one it recorded — and the
    # unedited-approval-rate measurement (owner decision U4) is built on precisely
    # this column meaning what it says.
    "POST /tickets/verify": Write(
        sql="""select cw.verify_review_ticket(%(ticket_id)s, %(approved_text)s,
              %(new_clause_id)s, %(title)s, %(rationale)s,
              current_setting('cw.actor'), %(expires_on)s, %(origin)s, %(note)s)
              as minted""",
        rule="cw.verify_review_ticket() — Legal only; mints the version; "
             "edited_before_approval is DERIVED from the two texts, never supplied",
        fields=(
            Field("ticket_id"), Field("approved_text"), Field("new_clause_id"),
            Field("title"), Field("rationale"),
            Field("expires_on", required=False),
            Field("origin", required=False, default="legal_authored"),
            Field("note", required=False),
        ),
    ),

    "POST /tickets/reject": Write(
        sql="""select cw.reject_review_ticket(%(ticket_id)s, current_setting('cw.actor'),
              %(note)s) as rejected""",
        rule="cw.reject_review_ticket(); rejection_needs_note refuses a blank note, "
             "and the empty string is what a form posts when nobody typed anything",
        fields=(Field("ticket_id"), Field("note")),
    ),

    # ── Concessions ─────────────────────────────────────────────────────────
    # proposer_kind is hard-coded 'human' because this endpoint is reached through
    # a session held by a person. A machine proposal is a different path with a
    # different actor_kind, and letting the body choose would make "a machine may
    # propose, only people settle" a claim the caller decides.
    "POST /concessions": Write(
        sql="""insert into cw.concession
         (agreement_id, category_key, standard_clause_id, standard_version,
          conceded_rung, reason, approved_by, proposer_kind)
       values (%(agreement_id)s, %(category_key)s, %(standard_clause_id)s,
               %(standard_version)s, %(conceded_rung)s, %(reason)s,
               current_setting('cw.actor'), 'human')
       returning concession_id""",
        rule="cw.concession write_scoped policy and cw.concession_requires_authority() "
             "— the floor is absolute and vendor text needs an override",
        fields=(
            Field("agreement_id"), Field("category_key"),
            Field("standard_clause_id"), Field("standard_version"),
            Field("conceded_rung", required=False), Field("reason"),
        ),
    ),

    "POST /concessions/approve": Write(
        sql="""insert into cw.concession_approval (concession_id, approver_kind, approver)
       values (%(concession_id)s, %(approver_kind)s, current_setting('cw.actor'))
       returning concession_id, approver_kind, approver""",
        rule="cw.approval_names_the_right_person() — an approval must be from the "
             "requester, the assigned attorney, or a configured approver",
        fields=(Field("concession_id"), Field("approver_kind")),
    ),

    # ── Overrides (ADR-0008, WP-U10) ────────────────────────────────────────
    #
    # FOUR ENDPOINTS FOR FOUR ACTS, and the shape is the control. Note what is
    # absent: there is no endpoint that decides a whole request. Deciding takes a
    # single finding reference, and there is no variant taking a list — a batch
    # endpoint that iterated approvals would be the blanket acknowledge button
    # with a for-loop in front of it, and the person pressing it would not have
    # seen each finding.
    "POST /overrides": Write(
        sql="""select cw.open_override_request(%(run_id)s, %(justification)s,
              %(findings)s::jsonb, %(commercial_pressure)s) as request_id""",
        rule="cw.open_override_request() — requester only; the justification cannot "
             "be blank or boilerplate; a request opens no gate",
        fields=(
            Field("run_id"), Field("justification"),
            Field("findings", as_json=True),
            Field("commercial_pressure", required=False),
        ),
    ),

    "POST /overrides/socialise": Write(
        sql="""select cw.socialise_override_request(%(request_id)s) as notified""",
        rule="cw.socialise_override_request() — refuses when nobody would be told, "
             "because recording that as sent would put a lie in the record",
        fields=(Field("request_id"),),
    ),

    "POST /overrides/decide": Write(
        sql="""select cw.decide_override_finding(%(request_id)s, %(finding_ref)s,
              %(decision)s, %(note)s)""",
        rule="cw.decide_override_finding() — Legal only, ONE finding, and never "
             "before the review window closes",
        fields=(
            Field("request_id"), Field("finding_ref"), Field("decision"),
            Field("note", required=False, required_if=("decision", "rejected")),
        ),
    ),

    "POST /overrides/gate": Write(
        sql="""select cw.record_override_gate(%(request_id)s, %(finding_ref)s)""",
        rule="cw.record_override_gate() — refuses unless that finding is actually "
             "in cw.override_passes",
        fields=(Field("request_id"), Field("finding_ref")),
    ),

    # ── The reading-room share (0017) ───────────────────────────────────────
    # Found missing by WP-U15's acceptance sweep: the 2026-07-27 walkthrough
    # created its share below the doorway, because no act existed. Sharing a
    # signed contract with a named viewer is Legal's recorded act; the purpose
    # is not optional, and unsharing is recorded rather than deleted.
    "POST /shares": Write(
        sql="""insert into cw.agreement_share (agreement_id, shared_with, purpose)
       values (%(agreement_id)s, %(shared_with)s, %(purpose)s)
       returning share_id, agreement_id, shared_with, shared_by, purpose""",
        rule="cw.agreement_share legal_shares policy (0017) — the two Legal "
             "roles; one live share per person per agreement",
        fields=(Field("agreement_id"), Field("shared_with"), Field("purpose")),
    ),

    "POST /shares/revoke": Write(
        sql="""update cw.agreement_share
          set revoked_by = current_setting('cw.actor'), revoked_at = now()
        where share_id = %(share_id)s and revoked_at is null
        returning share_id, agreement_id, shared_with, revoked_by, revoked_at""",
        rule="cw.agreement_share legal_unshares policy (0017); revoking a share "
             "that is not live changes nothing and 409s",
        fields=(Field("share_id"),),
    ),

    # ── Holds ───────────────────────────────────────────────────────────────
    "POST /holds": Write(
        sql="""insert into cw.legal_hold (agreement_id, matter_ref, opened_by)
       values (%(agreement_id)s, %(matter_ref)s, current_setting('cw.actor'))
       returning hold_id, agreement_id, matter_ref""",
        rule="cw.legal_hold policies — opening a hold is Legal's act",
        fields=(Field("agreement_id"), Field("matter_ref")),
    ),

    # ── People and access (the administrator's console) ─────────────────────
    "POST /accounts": Write(
        sql="""insert into cw.account (person, display_name, unit, role, created_by)
       values (%(person)s, %(display_name)s, %(unit)s, %(role)s,
               current_setting('cw.actor'))
       returning person, display_name, unit, role, state""",
        rule="cw.account administrator_creates policy",
        fields=(
            Field("person"), Field("display_name"),
            Field("unit", required=False), Field("role"),
        ),
    ),

    "POST /accounts/revoke": Write(
        sql="""update cw.account
          set state = 'revoked',
              revoked_by = current_setting('cw.actor'),
              revoked_at = now()
        where person = %(person)s
      returning person, state, revoked_by""",
        rule="cw.account administrator_maintains policy; cw.account_provenance_immutable() "
             "refuses un-revoking",
        fields=(Field("person"),),
    ),

    "POST /grants": Write(
        sql="""insert into cw.role_grant (action, person, role, reason)
       values ('granted', %(person)s, %(role)s, %(reason)s)
       returning grant_id, person, role, acted_by, acted_at""",
        rule="cw.role_grant administrator_grants policy and cw.role_grant_rules() — "
             "nobody grants themselves a role, and acted_by comes from the connection",
        fields=(Field("person"), Field("role"), Field("reason", required=False)),
    ),

    # person and role are overwritten from the grant being countersigned, so the
    # values here are placeholders the trigger replaces. They are selected from
    # the grant rather than taken from the body precisely so the countersigner
    # cannot change what is being countersigned.
    "POST /grants/countersign": Write(
        sql="""insert into cw.role_grant (action, person, role, grant_ref)
       select 'countersigned', g.person, g.role, g.grant_id
         from cw.role_grant g where g.grant_id = %(grant_id)s
      returning grant_id, person, role, acted_by, acted_at""",
        rule="cw.role_grant legal_admin_countersigns policy — decision U6. Only a "
             "Legal admin, never the subject, never the proposer",
        fields=(Field("grant_id"),),
    ),

    "POST /grants/revoke": Write(
        sql="""insert into cw.role_grant (action, person, role, grant_ref, reason)
       select 'revoked', g.person, g.role, g.grant_id, %(reason)s
         from cw.role_grant g where g.grant_id = %(grant_id)s
      returning grant_id, person, role, acted_by""",
        rule="cw.role_grant administrator_grants policy; append-only, so a revocation "
             "is a new row and never an edit",
        fields=(Field("grant_id"), Field("reason")),
    ),

    # ── Settings and watchers ───────────────────────────────────────────────
    "POST /settings": Write(
        sql="""update cw.governance_setting set value = %(value)s where key = %(key)s
       returning key, value, kind, updated_at""",
        rule="cw.setting_write_rules() — owner decisions are legal_admin's, "
             "operational rows are the administrator's, and the split cuts both ways",
        fields=(Field("key"), Field("value")),
    ),

    "POST /settings/decide": Write(
        sql="""update cw.governance_setting
          set value = %(value)s, rationale = %(rationale)s, decided = true,
              decided_by = current_setting('cw.actor')
        where key = %(key)s
      returning key, value, decided_by, rationale""",
        rule="cw.setting_write_rules(); a change to an owner decision carries its "
             "rationale, which is the whole value of the record",
        fields=(Field("key"), Field("value"), Field("rationale")),
    ),

    "POST /watchers": Write(
        sql="""insert into cw.override_watcher (category_key, person, added_by)
       values (%(category_key)s, %(person)s, current_setting('cw.actor'))
       returning watcher_id, category_key, person""",
        rule="cw.override_watcher administrator_maintains policy",
        fields=(Field("category_key", required=False), Field("person")),
    ),

    "POST /watchers/remove": Write(
        sql="""update cw.override_watcher
          set removed_by = current_setting('cw.actor'), removed_at = now()
        where watcher_id = %(watcher_id)s and removed_at is null
      returning watcher_id, category_key, person, removed_by""",
        rule="cw.override_watcher administrator_removes policy — a watcher is "
             "removed, never deleted, and the removal is audited",
        fields=(Field("watcher_id"),),
    ),

    # The nudge. It NOTIFIES and it destroys nothing — that separation is the
    # whole point of the action existing.
    #
    # Retention makes records due; destroying them is Legal admin's act and the
    # Administrator holds no privilege to do it. Without a nudge the console would
    # show a growing list of overdue records and offer no way to act at all, and
    # the pressure to "just add a delete for the admin" would build with every
    # row. So the nudge is the pressure valve, and it is deliberately nothing more
    # than a recorded message: an audit row saying Legal was told, on which date,
    # by whom.
    #
    # It writes to the audit chain and to nothing else. There is no retention
    # column it could touch, because the administrator holds no update on
    # cw.agreement_retention — so this cannot become a destroy by accident or by a
    # later edit that "tidies it up".
    #
    # The note is cast explicitly. Without it PostgreSQL cannot infer a type for a
    # parameter whose only use is inside jsonb_build_object, and refuses the
    # statement with "could not determine data type" — which reaches the console
    # as a refusal and reads like a permission problem.
    "POST /retention/nudge": Write(
        # The reminder names the ADMINISTRATOR, per owner decision U9 (0022),
        # which moved destruction from legal_admin and revoked legal_admin's
        # right rather than sharing it. This said "legal_admin's act" until
        # 2026-07-27 — writing a sentence that was false since 0022 into an
        # append-only chain, once per nudge, permanently.
        sql="""select cw.audit('retention_nudged', %(agreement_id)s,
         jsonb_build_object('note', %(note)s::text,
                            'reminder', 'destruction is the administrator''s act (U9)'))""",
        rule="insert on cw.audit_event only — the administrator holds no write on "
             "cw.agreement_retention, so a nudge cannot become a destruction",
        fields=(Field("agreement_id"), Field("note", required=False)),
    ),

    # ── The negotiation record ──────────────────────────────────────────────
    #
    # Six endpoints for six acts. Every one of them is a single statement, which
    # is why they are entries here and not a module of their own: a Write holds
    # exactly one statement, and each of these is one.
    #
    # None of them checks a permission. Migration 0027 replaced the four
    # role-only INSERT policies on these tables with the house two-branch shape —
    # Legal unconditional, a requester gated on owning the deal — so "you may
    # only write against your own deal" is the database's sentence to say. An
    # ownership test written here would be the second copy of that rule.
    "POST /negotiations": Write(
        sql="""insert into cw.negotiation (agreement_id, paper, opened_by, baseline,
                                  renews_agreement_id, baseline_chosen_by,
                                  baseline_note)
       values (%(agreement_id)s, %(paper)s, current_setting('cw.actor'),
               %(baseline)s, %(renews_agreement_id)s, current_setting('cw.actor'),
               %(baseline_note)s)
       returning negotiation_id, agreement_id, paper, baseline, state, opened_on""",
        rule="cw.negotiation write_scoped policy (0027) — Legal, or the requester "
             "who owns the agreement",
        fields=(
            Field("agreement_id"), Field("paper"), Field("baseline"),
            Field("renews_agreement_id", required=False),
            Field("baseline_note", required=False),
        ),
    ),

    # A SEPARATE endpoint rather than a flag on the one above, because opening
    # from last term's executed positions is a different commercial act from
    # opening from library standard, and it seeds the positions as well.
    #
    # `baseline` passes through when supplied and null when not: null means the
    # recorded default in cw.governance_setting, and that default is a settled
    # decision (0012) rather than an open question. Restating the default here
    # would be a second copy of it.
    "POST /negotiations/renew": Write(
        sql="""select cw.open_renewal(%(agreement_id)s, %(renews_agreement_id)s,
              current_setting('cw.actor'), %(baseline)s, %(paper)s, %(note)s)
              as negotiation_id""",
        rule="execute on cw.open_renewal() — held by requester, legal_reviewer and "
             "legal_admin (0011). The function is SECURITY DEFINER because it reads "
             "the prior agreement and the library; its own ownership check is NC-03",
        fields=(
            Field("agreement_id"), Field("renews_agreement_id"), Field("paper"),
            Field("baseline", required=False),
            Field("note", required=False),
        ),
    ),

    # The sequence guard (cw.round_is_next) and the run-id rule
    # (only_our_rounds_have_a_run) are the schema's, and both refusals travel
    # back unchanged. Neither is pre-empted here: a check in Python would be a
    # second copy that eventually stops agreeing with the first.
    "POST /negotiations/rounds": Write(
        sql="""insert into cw.negotiation_round
         (negotiation_id, round_no, direction, document_sha256, storage_uri,
          sent_on, actor, run_id)
       values (%(negotiation_id)s, %(round_no)s, %(direction)s,
               %(document_sha256)s, %(storage_uri)s, %(sent_on)s,
               current_setting('cw.actor'), %(run_id)s)
       returning negotiation_id, round_no, direction, sent_on, recorded_at""",
        rule="cw.negotiation_round write_scoped policy (0027); cw.round_is_next() "
             "refuses a gap in the sequence",
        fields=(
            Field("negotiation_id"), Field("round_no"), Field("direction"),
            Field("document_sha256"), Field("storage_uri"), Field("sent_on"),
            Field("run_id", required=False),
        ),
    ),

    # No movement row is written here. cw.position_opens() writes the opening
    # one, so a second insert from this side would record the same fact twice.
    "POST /negotiations/positions": Write(
        sql="""insert into cw.negotiation_position
         (negotiation_id, category_key, our_clause_id, our_version,
          their_text_ref, round_raised, opened_from)
       values (%(negotiation_id)s, %(category_key)s, %(our_clause_id)s,
               %(our_version)s, %(their_text_ref)s, %(round_raised)s,
               %(opened_from)s)
       returning position_id, negotiation_id, category_key, round_raised,
                 opened_from""",
        rule="cw.negotiation_position write_scoped policy (0027); cw.position_opens() "
             "records the opening movement, so this endpoint does not",
        fields=(
            Field("negotiation_id"), Field("category_key"),
            Field("our_clause_id", required=False),
            Field("our_version", required=False),
            Field("their_text_ref", required=False),
            Field("round_raised"), Field("opened_from"),
        ),
    ),

    # `to_state` is not restated in Python. The table names the states it
    # accepts, and a second copy of that list is how two copies quietly stop
    # agreeing.
    "POST /negotiations/positions/move": Write(
        sql="""insert into cw.position_movement
         (position_id, round_no, to_state, current_rung, actor, note)
       values (%(position_id)s, %(round_no)s, %(to_state)s, %(current_rung)s,
               current_setting('cw.actor'), %(note)s)
       returning movement_id, position_id, round_no, to_state, moved_at""",
        rule="cw.position_movement write_scoped policy (0027); the state list is the "
             "table's check constraint",
        fields=(
            Field("position_id"), Field("round_no"), Field("to_state"),
            Field("current_rung", required=False), Field("note", required=False),
        ),
    ),

    # Escalation is its own endpoint because it is the act a person means to
    # perform, and nobody should reach Legal by typing a string into a state
    # field. It escalates and it does nothing else — creating the review ticket
    # alongside it would be two governed acts in one call.
    "POST /negotiations/positions/escalate": Write(
        sql="""insert into cw.position_movement
         (position_id, round_no, to_state, current_rung, actor, note)
       values (%(position_id)s, %(round_no)s, 'escalated', %(current_rung)s,
               current_setting('cw.actor'), %(note)s)
       returning movement_id, position_id, round_no, to_state, moved_at""",
        rule="cw.position_movement write_scoped policy (0027) — the same rule as a "
             "move; what differs is that the state is not the caller's to choose",
        fields=(
            Field("position_id"), Field("round_no"),
            Field("current_rung", required=False), Field("note", required=False),
        ),
    ),

    # ── Obligation acts (OB-07, over 0037/0039) ─────────────────────────────
    #
    # Three acts, three endpoints, one statement each. Every guard is the
    # schema's: satisfaction and waiver need a non-empty note (the '' lesson,
    # 0037/0039 constraints), a closed obligation takes no further act, a
    # waiver without an approved override naming exactly this obligation is
    # refused (proposal-is-not-approval), and the actor is bound from the
    # connection by trigger whatever this statement proposes.
    #
    # REQUESTING and DECIDING a waiver are the existing override endpoints —
    # the request names the obligation as a finding (`obligation:<id>`), so no
    # second approval machine appears here (0039's whole argument).
    #
    # ASSERTING BREACH HAS NO ENDPOINT, deliberately. D-1 made it a
    # consequential legal claim a legal admin records with a reason, about an
    # obligation the arithmetic already calls overdue. Giving that claim a
    # button is a decision to take knowingly when a screen needs it — not a
    # completeness itch to scratch here.
    # document_ref is OB-06's satisfy-with-document: a received document
    # (0047's store) cited as evidence. Optional — attestation alone still
    # closes a duty — and the note stays mandatory either way: bytes without
    # a sentence are not evidence anybody can act on. The same-deal rule is
    # the schema's (0050): evidence answers for the deal it arrived on.
    "POST /obligations/satisfy": Write(
        sql="""insert into cw.obligation_act (obligation_id, act, note, document_ref)
       values (%(obligation_id)s, 'satisfied', %(note)s, %(document_ref)s)
       returning act_id, obligation_id, act, acted_by, acted_at, document_ref""",
        rule="cw.obligation_act record_act policy — Legal, or the requester on "
             "their own deal; satisfaction_needs_note refuses a blank note, "
             "and cw.obligation_act_guard() refuses evidence from another "
             "deal (0050)",
        fields=(Field("obligation_id"), Field("note"),
                Field("document_ref", required=False)),
    ),

    # The counterparty acknowledged something — recorded AGAINST a received
    # document, never as a bare flag (OB-06). Evidence, not closure: the
    # duty stays open, and the state view never reads this act.
    "POST /obligations/ack": Write(
        sql="""insert into cw.obligation_act
         (obligation_id, act, note, document_ref)
       values (%(obligation_id)s, 'counterparty_ack', %(note)s, %(document_ref)s)
       returning act_id, obligation_id, act, acted_by, document_ref""",
        rule="cw.obligation_act record_act policy; ack_needs_document (0050) "
             "refuses a bare flag, and the same-deal rule refuses foreign "
             "evidence",
        fields=(Field("obligation_id"), Field("document_ref"),
                Field("note", required=False)),
    ),

    "POST /obligations/reassign": Write(
        sql="""insert into cw.obligation_act (obligation_id, act, new_owner, note)
       values (%(obligation_id)s, 'reassigned', %(new_owner)s, %(note)s)
       returning act_id, obligation_id, act, new_owner, acted_by""",
        rule="cw.obligation_act record_act policy; reassignment names a "
             "PERSON, never a team inbox (0037's constraint), and the current "
             "owner is the last reassignment, read through "
             "cw.obligation_owner()",
        fields=(Field("obligation_id"), Field("new_owner"),
                Field("note", required=False)),
    ),

    "POST /obligations/waive": Write(
        sql="""insert into cw.obligation_act (obligation_id, act, note, override_ref)
       values (%(obligation_id)s, 'waived', %(note)s, %(override_ref)s)
       returning act_id, obligation_id, act, acted_by""",
        rule="cw.obligation_act_guard() (0039) — only an approved override "
             "naming exactly this obligation authorises the act; a proposal "
             "is not an approval. Recording is Legal's hands only "
             "(record_act policy)",
        fields=(Field("obligation_id"), Field("note"), Field("override_ref")),
    ),

    # ── Stewardship ─────────────────────────────────────────────────────────
    "POST /checkpoints": Write(
        sql="""select cw.audit_checkpoint_take() as checkpoint_id""",
        rule="execute on cw.audit_checkpoint_take() — the administrator's duty "
             "since decision U7, and revoked from legal_admin",
    ),

    "POST /health-checks/anchor": Write(
        sql="""select cw.run_anchor_check() as result""",
        rule="execute on cw.run_anchor_check(); the result is recorded whichever way "
             "it goes, because a check that ran is the evidence",
    ),

    "POST /health-checks/chain": Write(
        sql="""select cw.run_chain_check() as first_broken_seq""",
        rule="execute on cw.run_chain_check()",
    ),

    "POST /health-checks/document": Write(
        sql="""select cw.record_document_hash_check(%(agreement_id)s, %(doc_seq)s,
              %(observed_sha256)s) as result""",
        rule="cw.record_document_hash_check() compares against what was recorded at "
             "execution; the caller supplies what it read, never whether it matched",
        fields=(Field("agreement_id"), Field("doc_seq"), Field("observed_sha256")),
    ),

    "POST /health-checks/rebuild": Write(
        sql="""select cw.record_rebuild_spot_check(%(run_id)s, %(observed_hash)s) as result""",
        rule="cw.record_rebuild_spot_check() compares against cw.run.result_hash",
        fields=(Field("run_id"), Field("observed_hash")),
    ),

    # ── The address book (OB-09) ────────────────────────────────────────────
    # Administrator-maintained, the watcher-list shape: a person who could
    # redirect their own notifications could silence their own countersign
    # nudges. The setter and remover are bound from the connection by the
    # schema's triggers, whatever a body claims.
    # ── Raising what you observed (NT-2, over 0064) ─────────────────────────
    #
    # ONE ACT, ONE STATEMENT, AND NO RULE RESTATED HERE. Every guard belongs to
    # the schema: who may raise a notice to whom is cw.notice_route, whether the
    # subject resolves is cw.notice_subject_visible() run as the caller, and the
    # raiser's name is bound from the connection by trigger whatever the body
    # claims. This file's job is to carry the record and let both refusals
    # travel back in the database's own words.
    #
    # `to_role` and `to_person` are both optional HERE and exactly one of them
    # is demanded by the table's own check constraint. That split is
    # deliberate: expressing "one or the other" in Python would be a second
    # copy of a constraint that already exists, and the database's sentence
    # about it is better than one written here.
    "POST /notices": Write(
        sql="""insert into cw.notice
         (raised_by, to_role, to_person, subject_kind, subject_ref, note)
       values (current_setting('cw.actor'), %(to_role)s, %(to_person)s,
               %(subject_kind)s, %(subject_ref)s, %(note)s)
       returning notice_id, to_role, to_person, subject_kind, subject_ref,
                 raised_at""",
        rule="cw.notice raise_notice policy (0064) — any signed role may "
             "attempt one; cw.notice_route decides whether it lands, and "
             "cw.notice_subject_visible() decides whether the thing cited is "
             "something the raiser can actually see",
        fields=(
            Field("to_role", required=False),
            Field("to_person", required=False),
            Field("subject_kind"), Field("subject_ref"), Field("note"),
        ),
    ),

    # Closing one is its own act by a named person. NO BATCH VARIANT, for the
    # override findings' reason: a helper that acknowledged a list would be the
    # blanket button with a loop in front of it, and the person pressing it
    # would not have read each one.
    "POST /notices/acknowledge": Write(
        sql="""insert into cw.notice_acknowledgement
         (notice_id, acknowledged_by, note)
       values (%(notice_id)s, current_setting('cw.actor'), %(note)s)
       returning notice_id, acknowledged_by, acknowledged_at""",
        rule="cw.notice_acknowledgement acknowledge_addressed policy (0064) — "
             "only somebody the notice was addressed to, by name or by role. A "
             "notice cleared by a bystander is a notice nobody read",
        fields=(Field("notice_id"), Field("note", required=False)),
    ),

    "POST /notifications/addresses": Write(
        sql="""insert into cw.notification_address (person, channel, address, set_by)
       values (%(person)s, 'email', %(address)s, current_setting('cw.actor'))
       returning address_id, person, channel, address""",
        rule="cw.notification_address administrator_maintains policy — "
             "administrator only; setting is audited by trigger",
        fields=(Field("person"), Field("address")),
    ),

    "POST /notifications/addresses/remove": Write(
        sql="""update cw.notification_address
          set removed_by = current_setting('cw.actor'), removed_at = now()
        where person = %(person)s and channel = 'email' and removed_at is null
       returning address_id""",
        rule="cw.notification_address administrator_removes policy; the trigger "
             "binds the remover, audits the removal, and refuses a second one",
        fields=(Field("person"),),
    ),
}


class NoSuchWrite(KeyError):
    """No write endpoint by that name. Distinct from a refusal: this is the
    doorway saying the route does not exist, not the database saying no."""


def run(db: Database, caller: Caller, key: str, body: dict | None = None) -> list[dict]:
    """Perform one write as the caller, and return what it produced.

    Raises. It does not retry, it does not fall back, and it does not report
    success for a statement that changed nothing. Read the module docstring
    before adding anything to this function — rule 2 lives here.
    """
    write = WRITES.get(key)
    if write is None:
        raise NoSuchWrite(key)

    params = write.bind(body or {})

    with db.as_person(caller.person, caller.role) as request:
        produced = request.rows(write.sql, params)

    if not produced:
        # Finding D1's shape. An UPDATE refused by a missing policy changes
        # nothing and raises nothing; every statement here returns something, so
        # nothing returned means nothing happened.
        raise SilentlyRefused(
            f"{key} completed without changing anything. A write that reports "
            "success while altering nothing is a refusal that has not been "
            "noticed — never report it as done."
        )
    return produced


@dataclass(frozen=True)
class Answer:
    """What a write produced, in the shape an interface can render."""

    status: int
    body: dict = dataclass_field(default_factory=dict)

    @property
    def refused(self) -> bool:
        return self.status >= 400


def answer(db: Database, caller: Caller, key: str, body: dict | None = None) -> Answer:
    """Perform one write and shape the outcome — what it produced, or the
    refusal, in the database's own words."""
    try:
        return Answer(status=200, body={"rows": run(db, caller, key, body)})
    except NoSuchWrite:
        return Answer(status=404, body={"error": "no such endpoint", "path": key})
    except Missing as missing:
        return Answer(status=400, body={
            "error": "refused", "reason": str(missing), "kind": "rejected"})
    except WrongShape as wrong:
        # Same answer as Missing, and it must be here rather than nowhere: an
        # uncaught WrongShape would reach the last-resort handler and become the
        # 500 this guard exists to remove — the defect fixed, then reintroduced
        # one layer up.
        return Answer(status=400, body={
            "error": "refused", "reason": str(wrong), "kind": "rejected"})
    except SilentlyRefused as silent:
        # Deliberately NOT a 200. The JavaScript answers `{"rows": []}` here and
        # the screen says the change was saved.
        return Answer(status=409, body={
            "error": "refused", "reason": str(silent), "kind": "changed_nothing"})
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(status=refused.status, body=refused.as_body())
