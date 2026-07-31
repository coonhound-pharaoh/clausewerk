"""Filing an executed agreement — the one act this system cannot take back.

Until now only the database owner could file one, by hand. This is the governed
version: the caller's own connection, the database deciding who may, and three
gates deciding whether the act is currently valid at all.

WHO MAY FILE IS NOT DECIDED HERE. The 0006 policies and grants decide it, and a
requester, a viewer and an auditor are refused by the database in its own words.
Nothing below names a role.

WHAT THE THREE GATES ARE FOR, AND WHY THEY ARE GATES RATHER THAN POLICIES

Permission asks WHO may act. These ask whether the act is still valid — which is
business validity, not permission, and the distinction is why they live here and
not in a trigger. If a later owner wants them in the database, the code moves
wholesale and the checks move with it. A trigger PLUS a check here would be two
copies of one rule, which is the drift this system names as its vulnerability.

  1. THE DEAL BINDING. cw.executed_agreement.run_id is a plain nullable foreign
     key to cw.run with nothing tying it to the agreement being filed, and since
     the run-scoping migration Legal may record a run against any deal or none.
     So without this check Legal could file AG-2 citing a run recorded against
     AG-1 — permanently, with the audit trigger recording it as legitimate. The
     settled decision of 2026-07-27 is that every assembly run belongs to a
     deal; this is that decision applied at the one act which consumes one.

  2. CURRENCY. Every clause the run pinned must still be one the library would
     select today. See the long note above the query: the predicate is
     `selectable`, and it is NOT `state <> 'active'`.

  3. VALIDATION. A run the engine blocked may only be filed if every blocking
     finding is covered by an approved override. See the note above that query:
     the answer is NOT cw.run.overridden.

ALL THREE RUN BEFORE THE INSERT, AND THE ORDER IS LOAD-BEARING. Inserting into
cw.executed_agreement fires cw.agreement_execute(), which moves the agreement to
'executed'. A gate evaluated after that insert passes vacuously, forever, and
nothing would ever show it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify
from doorway.writes import WrongShape, refuse_structured

# ── The currency gate's query ───────────────────────────────────────────────
#
# READ THIS BEFORE CHANGING THE PREDICATE. It is `s.selectable = false`, and it
# is deliberately NOT `s.state <> 'active'`.
#
# cw.clause_version_state carries both columns and they disagree ON PURPOSE.
# `state` answers 'superseded' the moment any supersession row exists, while
# `selectable` — the column cw.selectable_clause is built from, and therefore
# the one the resolution engine's own candidate pool comes from — stays TRUE for
# a run-off predecessor until it expires on its own. The schema says so itself,
# two lines above the expression: "A run-off predecessor is superseded but still
# usable until it expires on its own."
#
# A gate written on `state` would refuse to execute a run whose pinned clause
# the engine still considers perfectly good — a FALSE refusal, landing on the
# one act the freeze triggers make irreversible. `selectable` covers retirement,
# expiry and hard supersession and gets run-off right, which is why this single
# query is the whole currency check.
#
# cw.run_drift is deliberately NOT the gate. It declares itself reporting only,
# inner-joins cw.agreement, filters out anything already executed, and emits
# only rows already flagged. It is corroboration for the successor detail and
# nothing more.
CURRENCY_SQL = """
select d.clause_id, d.version, s.state, s.selectable
from cw.run_decision d
join cw.clause_version_state s
  on s.clause_id = d.clause_id and s.version = d.version
where d.run_id = %s and d.clause_id is not null and s.selectable = false
order by d.clause_id, d.version
"""

BLOCKING_SQL = """
select seq, rule_id, rule_version, title
from cw.run_finding where run_id = %s and severity = 'High' order by seq
"""

# ── The validation gate's second half ───────────────────────────────────────
#
# READ THIS BEFORE WRITING THE GATE. cw.run.gate_open and cw.run.overridden are
# written ONCE, at insert, and can never change: cw.run carries no-edit,
# no-delete and no-truncate triggers and holds select and insert grants only,
# and nothing in the whole schema updates either column.
#
# So `overridden` is NOT the answer to "was this gate opened". The human
# override apparatus lives entirely in its own tables: an approval is one row
# per individually approved finding, and cw.override_passes is the load-bearing
# statement of what an approval actually lets past. cw.record_override_gate()
# records that a gate was opened by writing an audit entry — it opens nothing.
#
# A gate written against cw.run.overridden would make every engine-blocked run
# permanently unfileable no matter what Legal approved, and the entire override
# workflow would terminate in an audit row.
#
# THE REVIEW WINDOW IS NOT RE-CHECKED HERE. cw.override_passes already requires
# an approved decision and a socialisation row, and cw.decide_override_finding
# refuses any decision taken before the window closes. Re-implementing the
# window here would be a second copy of a rule the schema already enforces.
PASSES_SQL = "select finding_ref from cw.override_passes where run_id = %s"

REQUIRED = ("agreement_id", "run_id", "executed_on", "effective_on", "filename",
            "byte_size", "sha256", "storage_uri", "signed_on")

SIGNATORY_FIELDS = ("name", "party", "method", "signed_on")
OPTIONAL_PLAIN_FIELDS = ("term_end", "agreement_kind", "parent_agreement_id",
                         "signature_evidence")
MAX_SIGNATORIES = 100


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def finding_ref(row) -> str:
    """The canonical name of a run finding, in ONE place.

    cw.override_finding.finding_ref is free text and cw.run_finding has no ref
    column of its own, so the mapping between them has to be fixed somewhere and
    this is that somewhere. The spelling matches the engine's own ConflictRule
    reference and the conflict-rule audit vocabulary, so it is the identity the
    rest of the system already uses.

    Matching is FAIL-CLOSED: a reference that does not match refuses. The
    optional leading `category:` prefix is admitted because the socialisation
    machinery's watcher matching splits on a colon, and rule ids cannot contain
    one — so the match stays unambiguous either way.
    """
    return f"{row['rule_id']}@v{row['rule_version']}"


def execute(db: Database, caller: Caller, body: dict) -> Answer:
    body = body or {}

    # ── The boundary ────────────────────────────────────────────────────────
    for field in REQUIRED:
        value = body.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            return _rejected(f"{field} is required to file an execution")

    # NOT SILENTLY IGNORED. The signature certificate's bytes have no owner yet
    # — the transport cannot carry them and the document store does not exist —
    # so a caller who sends one must be told, not left believing it was filed.
    if "certificate" in body:
        return _rejected(
            "a signature certificate cannot be filed yet: its bytes have no "
            "home until the document store exists. File the document hash and "
            "the signatories now, and attach the certificate afterwards")

    try:
        for field in (*REQUIRED, *OPTIONAL_PLAIN_FIELDS):
            if field in body:
                refuse_structured(field, body[field])
    except WrongShape as wrong:
        return _rejected(str(wrong))

    signatories = body.get("signatories")
    if not isinstance(signatories, list) or not signatories:
        return _rejected(
            "an execution names who signed it; this one names nobody (signatories)")
    if len(signatories) > MAX_SIGNATORIES:
        return _rejected(
            f"an execution may name at most {MAX_SIGNATORIES} signatories")
    for index, who in enumerate(signatories):
        if not isinstance(who, dict):
            return _rejected(f"signatory {index} is not a signatory")
        try:
            for field in (*SIGNATORY_FIELDS, "title"):
                if field in who:
                    refuse_structured(f"signatory {index} {field}", who[field])
        except WrongShape as wrong:
            return _rejected(str(wrong))
        for field in SIGNATORY_FIELDS:
            if not str(who.get(field) or "").strip():
                return _rejected(f"signatory {index} names no {field}")

    # Shape before str(), and this is the whole point of the guard here: str()
    # on a dict yields the plausible-looking "{'nested': [1, 2]}", which matches
    # no row, so a malformed request would come back as a not-found and never be
    # reported as malformed at all. The classification floor in refusals.py
    # cannot help — the value never reaches the driver. One rule, imported.
    agreement_id = str(body["agreement_id"]).strip()
    run_id = str(body["run_id"]).strip()

    try:
        with db.as_person(caller.person, caller.role) as request:
            # The attempt first, so the audit grant decides who may use this
            # endpoint — uniformly, and in the database's own words.
            _record(request, agreement_id, "execution_attempted",
                    {"run_id": run_id, "signatories": len(signatories)})

            found = request.rows(
                "select run_id, agreement_id, gate_open, overridden "
                "from cw.run where run_id = %s", (run_id,))
            if not found:
                return _refuse(request, agreement_id, 403,
                               "no run by that name is yours to file",
                               "not_permitted")
            run = found[0]

            # ── Gate 1 · the deal binding ───────────────────────────────────
            if run["agreement_id"] is None:
                return _refuse(
                    request, agreement_id, 409,
                    "this run is not tied to a deal, so it cannot be filed "
                    "against one", "refused_on_merits")
            if run["agreement_id"] != agreement_id:
                return _refuse(
                    request, agreement_id, 409,
                    f"run {run_id} was recorded against {run['agreement_id']}, "
                    f"not {agreement_id}", "refused_on_merits")

            # ── Gate 2 · currency ───────────────────────────────────────────
            stale = request.rows(CURRENCY_SQL, (run_id,))
            if stale:
                first = stale[0]
                return _refuse(
                    request, agreement_id, 409,
                    f"this run carries {first['clause_id']}@v{first['version']}, "
                    f"which is {first['state']} — it cannot be executed as it "
                    f"stands", "refused_on_merits")

            # ── Gate 3 · validation ─────────────────────────────────────────
            #
            # gate_open is the TRIGGER for consulting the override tables, and
            # never the answer on its own.
            if not run["gate_open"]:
                blocking = request.rows(BLOCKING_SQL, (run_id,))
                passed = {row["finding_ref"]
                          for row in request.rows(PASSES_SQL, (run_id,))}
                for finding in blocking:
                    ref = finding_ref(finding)
                    covered = ref in passed or any(
                        held.endswith(":" + ref) for held in passed)
                    if not covered:
                        return _refuse(
                            request, agreement_id, 409,
                            f"this run is blocked by {ref} "
                            f"({finding['title']}) and no approved override "
                            f"covers it", "refused_on_merits")

            # ── The record ──────────────────────────────────────────────────
            #
            # Everything below is frozen by trigger the moment it lands. There
            # is no correcting a filing, only superseding it — which is why
            # every field was validated at the boundary above.
            request.write(
                """insert into cw.executed_agreement
                     (agreement_id, run_id, executed_on, effective_on, term_end,
                      agreement_kind, parent_agreement_id, signature_evidence)
                   values (%(agreement_id)s, %(run_id)s, %(executed_on)s,
                           %(effective_on)s, %(term_end)s, %(agreement_kind)s,
                           %(parent_agreement_id)s, %(signature_evidence)s)""",
                {"agreement_id": agreement_id, "run_id": run_id,
                 "executed_on": body["executed_on"],
                 "effective_on": body["effective_on"],
                 "term_end": body.get("term_end"),
                 "agreement_kind": body.get("agreement_kind") or "standalone",
                 "parent_agreement_id": body.get("parent_agreement_id"),
                 "signature_evidence": body.get("signature_evidence")})

            # kind and doc_seq are not the caller's to choose. The schema
            # requires exactly one document to BE the agreement and requires it
            # to be seq 0; an amendment or an exhibit is a different act with a
            # different sequence, and this endpoint files the agreement itself.
            #
            # ON storage_uri BEFORE THE DOCUMENT STORE EXISTS. The column is NOT
            # NULL and no byte store has been built, so the caller supplies a
            # reference and it is written down verbatim. Nothing here invents a
            # location on their behalf — an invented one would look real to
            # every later reader, including the evidence-gap report. And the
            # document-hash round trip is explicitly NOT claimed to work until
            # that store exists.
            request.write(
                """insert into cw.executed_document
                     (agreement_id, doc_seq, kind, filename, byte_size, sha256,
                      storage_uri, signed_on)
                   values (%(agreement_id)s, 0, 'agreement', %(filename)s,
                           %(byte_size)s, %(sha256)s, %(storage_uri)s,
                           %(signed_on)s)""",
                {"agreement_id": agreement_id, "filename": body["filename"],
                 "byte_size": body["byte_size"], "sha256": body["sha256"],
                 "storage_uri": body["storage_uri"],
                 "signed_on": body["signed_on"]})

            for ordinal, who in enumerate(signatories):
                request.write(
                    """insert into cw.executed_signatory
                         (agreement_id, ordinal, name, party, method, signed_on,
                          title)
                       values (%(agreement_id)s, %(ordinal)s, %(name)s,
                               %(party)s, %(method)s, %(signed_on)s, %(title)s)""",
                    {"agreement_id": agreement_id, "ordinal": ordinal,
                     "name": who["name"], "party": who["party"],
                     "method": who["method"], "signed_on": who["signed_on"],
                     "title": who.get("title")})

    except psycopg.Error as error:
        database_said: Refused = classify(error)
        return Answer(database_said.status, database_said.as_body())

    return Answer(200, {
        "agreement_id": agreement_id,
        "run_id": run_id,
        "signatories": len(signatories),
        "filed": True,
    })


def _rejected(reason: str) -> Answer:
    return Answer(400, {"error": "refused", "reason": reason, "kind": "rejected"})


def _refuse(request, agreement_id: str, status: int, reason: str,
            kind: str) -> Answer:
    _record(request, agreement_id, "execution_refused", {"reason": reason})
    return Answer(status, {"error": "refused", "reason": reason, "kind": kind})


def _record(request, agreement_id: str, event: str, detail: dict) -> None:
    """The endpoint writes execution_attempted and execution_refused, and
    NOTHING ELSE.

    cw.audit_executed() already emits agreement_executed on insert into
    cw.executed_agreement and document_frozen on insert into
    cw.executed_document. An endpoint copy of either would put two entries per
    act into a chain with no UPDATE and no DELETE grant, free to disagree with
    each other for as long as the record exists.
    """
    request.write(
        # Bound, not interpolated — see the note at the identical writer in
        # runs.py.
        "select cw.audit(%(event)s, %(agreement_id)s, %(payload)s::jsonb)",
        {"event": event, "agreement_id": agreement_id,
         "payload": json.dumps(detail)})
