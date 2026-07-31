"""Mutation check for the doorway.

    python doorway/mutation_check.py

WHY THIS EXISTS, AND WHOSE IDEA IT WAS

`db/test/mutation-check.mjs` carried fifteen mutations over the JavaScript
service. Retiring that service would have turned all fifteen into SKIPs — fatal
in that harness, deliberately, so the bar goes red until somebody either
re-proves each guarantee or removes it with a reason.

The role-based-UI session made the case plainly: a passing suite is not the same
as those guarantees having been SEEN TO FAIL. These fifteen are the doorway's
specification, and this file is where they are proved.

WHAT A ROW MEANS

Break one guarantee, run the ONE test that names it, and require that test to
fail. Not "the suite noticed something" — the named test, because a guarantee
caught by the wrong test is a guarantee nobody is actually watching.

  ok    the named test failed — the guarantee is guarded
  MISS  the named test passed with the guarantee broken — nothing guards it
  SKIP  the pattern is not in the source any more — the check is stale

MISS and SKIP are both fatal. A stale check is worse than a missing one: it reads
as protection.

WHY ONE TEST AND NOT THE WHOLE SUITE

The engine's harness runs its whole suite and then checks the named test appears
in the failures. This suite rebuilds the schema for every test and takes four
minutes, so fifteen full runs is an hour nobody will wait for. Running only the
named test proves exactly what the bar asks — break the thing the test names,
confirm THAT test fails — and it takes seconds.

Each mutation runs in its own copy of the tree, in its own process, and gets its
own test database, the name carrying the process id.

THEY CAN STILL COLLIDE, and this paragraph used to say they could not.

A separate database is not full isolation: `setup.py` runs `alter role cw_app
…`, and a ROLE is cluster-wide. Six concurrent rebuilds were run deliberately
to check the claim; five failed with `tuple concurrently updated`. A lane that
dies in its fixture never evaluates its guarantee — so the verdict for "the
suite exited non-zero" must not be `ok`, which is what it was until
2026-07-27. It is now `IMPRECISE`, fatal, and named as such.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent

# name, file, find, replace, the test that must fail
MUTATIONS = [
    # ── Identity is bound, and bound from the right place ────────────────────
    (
        "the actor is not bound at the start of a request",
        "doorway/db.py",
        "                    cur.execute(\"select set_config('cw.actor', %s, true)\", (person,))",
        "                    pass",
        "test_writes.py::test_a_write_lands_with_the_signed_in_person_s_name_on_it",
    ),
    (
        # RE-POINTED 2026-07-27. This named a server test whose FIXTURE seeds
        # the demo people through the doorway — with no role bound the seeding
        # is refused, so the test ERRORED before asserting anything and the
        # guarantee was never evaluated. The row now names a test that reaches
        # its own assertion because it touches no table at all.
        "the role is not bound at the start of a request",
        "doorway/db.py",
        '                    cur.execute(\n                        sql.SQL("set local role {}").format(sql.Identifier(db_role))\n                    )',
        "                    pass",
        "test_no_identity_survives.py::test_a_request_runs_as_the_role_it_was_opened_with",
    ),
    (
        "sign-in looks up identity on a privileged connection",
        # Follows the constant: it moved to sessions.py so that module could name
        # it too without closing an import cycle back through identity.py.
        "doorway/sessions.py",
        'LOOKUP_ROLE = "viewer"',
        'LOOKUP_ROLE = "legal_admin"',
        "test_prohibitions.py::test_sign_in_reads_as_the_least_privileged_role",
    ),

    # ── The identity does not outlive the request ────────────────────────────
    (
        "the role is not surrendered when the request ends",
        "doorway/db.py",
        'sql.SQL("set local role {}")',
        'sql.SQL("set role {}")',
        "test_no_identity_survives.py::test_a_returned_connection_carries_no_role_and_no_actor",
    ),
    (
        "the actor is not surrendered when the request ends",
        "doorway/db.py",
        "\"select set_config('cw.actor', %s, true)\"",
        "\"select set_config('cw.actor', %s, false)\"",
        "test_no_identity_survives.py::test_a_returned_connection_carries_no_role_and_no_actor",
    ),
    (
        "a request is not one unit of work",
        "doorway/db.py",
        "            with conn.transaction():",
        "            if True:",
        "test_no_identity_survives.py::test_a_returned_connection_carries_no_role_and_no_actor",
    ),

    # ── The role is resolved fresh, and the session has a clock ──────────────
    (
        "the effective role is resolved once and cached",
        "doorway/identity.py",
        '    with db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:\n        row = request.one(\n            "select role from cw.effective_role where person = %s", (person,)\n        )\n    return row[0] if row else None',
        '    cache = effective_role.__dict__.setdefault("cache", {})\n    if person in cache:\n        return cache[person]\n    with db.as_person(LOOKUP_ACTOR, LOOKUP_ROLE) as request:\n        row = request.one(\n            "select role from cw.effective_role where person = %s", (person,)\n        )\n    cache[person] = row[0] if row else None\n    return cache[person]',
        "test_server.py::test_revocation_bites_at_the_next_request",
    ),
    # Both session rows below anchor on the comment above the delete, not on the
    # delete itself: the two expiry deletes are byte-identical, and a bare
    # pattern would match twice and mutate whichever came first.
    (
        # REPOINTED 2026-07-28, and the move IS the fix for finding A-3. This row
        # used to mutate away the DELETE in person_for, on the belief that the
        # sweep was what stopped an expired session being honoured. It was — and
        # that was the defect, because the sweep's own comment calls itself
        # housekeeping, so the whole expiry guarantee rested on a statement
        # somebody could reasonably move to a scheduled job.
        #
        # Expiry is now a predicate in LIVE_SESSION_SQL, so that is what this row
        # guards. Mutating the sweep away would now score MISS: the predicate
        # refuses the row regardless, which is exactly the point.
        #
        # The mutation KEEPS THE PLACEHOLDER COUNT and simply makes the predicate
        # never bite. Deleting the clause outright would break the arity and every
        # test would fail on a driver error instead of on the guarantee — proving
        # the tests break, not that they catch anything.
        #
        # The named test is the one that reads a planted row the sweep has never
        # touched. A test that goes through person_for cannot catch this, because
        # the sweep deletes the row first; test_session_expiry.py labels those as
        # controls for that reason.
        "sessions never expire",
        "doorway/sessions.py",
        '    "select person from cw.session where token_sha256 = %s and expires_at > %s")',
        '    "select person from cw.session where token_sha256 = %s '
        'and expires_at > %s - 1e12")',
        "test_session_expiry.py::test_the_lookup_refuses_an_expired_row_with_no_sweep_involved",
    ),
    (
        "expired sessions pile up until each token is presented again",
        "doorway/sessions.py",
        "            # to fill the database one sign-in at a time.\n"
        '            request.write("delete from cw.session where expires_at <= %s", (now,))',
        "            # to fill the database one sign-in at a time.\n"
        "            pass",
        "test_sessions.py::test_expired_sessions_are_swept_when_a_new_one_is_issued",
    ),
    # RETIRED 2026-07-28 — "removing an expired session crashes if another
    # request removed it first". The hazard was a KeyError on an in-memory dict
    # popped by two requests at once. Sessions now live in the database and both
    # expiry paths are `delete ... where expires_at <= %s`, which removes zero
    # rows without complaint when another request got there first. There is no
    # line left whose mutation reproduces the hazard, and the test it named was
    # deleted with the dict. Retired rather than repointed, on owner decision,
    # because inventing a replacement guarantee to keep the count at 36 would be
    # a design change wearing a repair's clothes. Recorded in memory.md.

    (
        "a body of the wrong shape crashes the service instead of a 400",
        "doorway/server.py",
        "        if parsed is not None and not isinstance(parsed, dict):",
        "        if False:",
        "test_server.py::test_a_body_that_is_not_a_json_object_is_the_callers_mistake",
    ),
    (
        # A contract is a zip. Serialised as JSON it does not merely arrive
        # wrong — json.dumps raises on bytes — so the person asking for their
        # own paperwork gets "the service failed" instead of a document.
        "a download is serialised as JSON",
        "doorway/server.py",
        "        if isinstance(response, Download):\n"
        "            self._send_download(response)\n"
        "            return",
        "        pass",
        "test_server.py::test_a_download_leaves_as_bytes_with_its_own_content_type",
    ),
    (
        # Bytes in, and the mirror of the row above. A .docx is a zip: read as
        # JSON it is refused as malformed, so the system simply cannot be given
        # a document — which is the state this package found.
        "an inbound document is read as JSON",
        "doorway/server.py",
        "        if self._is_document():",
        "        if False:",
        "test_server.py::test_a_document_arrives_as_bytes_and_reaches_the_app_unchanged",
    ),
    (
        # The size limit is a product fact, and the check has to happen on the
        # declared length BEFORE the read. Broken, one request reads whatever it
        # likes into memory.
        "a document over the limit is read anyway",
        "doorway/server.py",
        "        if length > MAX_DOCUMENT_BYTES:",
        "        if False:",
        "test_server.py::test_a_document_over_the_limit_is_refused_unread",
    ),
    (
        "the sign-in reply exports the raw session clock again",
        "doorway/app.py",
        '            "expiresInSeconds": length,',
        '            "expiresInSeconds": issued.expires_at,',
        "test_server.py::test_the_sign_in_reply_says_how_long_not_when",
    ),

    # ── Refusals stay legible ────────────────────────────────────────────────
    (
        "refusals are classified by reading the message, not the SQLSTATE",
        "doorway/refusals.py",
        "    if code == INSUFFICIENT_PRIVILEGE:",
        '    if "permission denied" in reason.lower() or "row-level security" in reason.lower():',
        "test_refusals.py::test_the_database_s_own_words_reach_the_caller_unchanged",
    ),
    # RETIRED 2026-07-28 — "an outage is blamed on the caller", which mutated
    # `if isinstance(error, psycopg.OperationalError):` in doorway/refusals.py
    # and named test_the_database_being_unreachable_is_not_the_callers_fault.
    #
    # It scored MISS on the first run of this harness after the preflight was
    # repaired — the row had been listed as a guard for a long time while
    # guarding nothing, which nobody could see because the harness was aborting
    # before it ran.
    #
    # WHY IT CANNOT BE MADE TO WORK. Deleting that branch does not blame the
    # caller. An OperationalError falls through to the generic psycopg.Error
    # catch-all below it, which also answers 500 `broke` and also keeps the
    # driver's message — hosts and ports included — out of the response. Both
    # facts the test names are still true, so the test passes with the branch
    # gone. What the branch actually contributes is a MORE SPECIFIC SENTENCE:
    # "the service could not reach its database" instead of "the database
    # operation failed". That is wording, and this repository does not test
    # wording — a test that pinned it would fail on correct work.
    #
    # So the row was misnamed rather than broken. The promise it claimed to hold
    # is genuinely held, by the catch-all, and the branch is defence in depth on
    # the message. Retired on owner decision rather than repointed, for the same
    # reason the session delete-race row was: inventing something for it to
    # guard, to keep a number up, is a design change wearing a repair's clothes.
    #
    # If an outage is ever given its own `kind` — so a screen can say "try again
    # shortly" rather than "something broke" — that IS observable, and this row
    # should come back guarding it. Recorded in memory.md.
    (
        "an unexpected failure reads its own insides out to the caller",
        "doorway/server.py",
        '                self._respond(Response(500, {"error": "the service failed"}))',
        '                self._respond(Response(500, {"error": "the service failed", "reason": str(sys.exc_info()[1])}))',
        "test_server.py::test_an_unexpected_failure_keeps_its_details_out_of_the_reply",
    ),

    # ── The database decides, not the doorway ────────────────────────────────
    (
        "the deals endpoint scopes rows in the API instead of the database",
        "doorway/reads.py",
        "          from cw.agreement order by agreement_id",
        "          from cw.agreement where requester = current_setting('cw.actor')\n          order by agreement_id",
        "test_writes.py::test_the_deals_endpoint_does_not_scope_rows_itself",
    ),
    (
        # NC-08's copy of the same guarantee, on the negotiation record. The
        # views scope themselves (0027); a WHERE added here is a second copy
        # of the permission model, and the copy is the vulnerability.
        "a negotiation read scopes rows in the API instead of the database",
        "doorway/reads.py",
        "          from cw.position_current order by negotiation_id, position_id",
        "          from cw.position_current where moved_by = current_setting('cw.actor')"
        " order by negotiation_id, position_id",
        "test_reads.py::test_the_negotiation_reads_take_no_parameters_and_add_no_scoping",
    ),

    # ── A received redline is received, and its selector survives the wire ──
    (
        # NC-09. 'issued' with a null run id passes the schema's
        # only_our_rounds_have_a_run check, so nothing below this module
        # refuses the lie — the direction is this act's own claim about
        # provenance, and the named test is what watches it.
        "a received redline is recorded as a round we issued",
        "doorway/redlines.py",
        "0) + 1, 'received',",
        "0) + 1, 'issued',",
        "test_redlines.py::"
        "test_a_recorded_redline_is_a_received_round_pointing_at_the_stored_bytes",
    ),
    (
        # NC-17's load-bearing rule: where nothing clears the bar the system
        # ESCALATES (ADR-0005) — it never quietly drops the paragraph. With
        # this branch gone, unmatched vendor language vanishes from the
        # record instead of landing in quarantine.
        "an unmatched change is dropped instead of escalated",
        "doorway/analysis.py",
        "    elif category_key is not None:",
        "    elif False:",
        "test_analysis.py::test_the_no_match_path_escalates_into_quarantine",
    ),
    (
        # The regression NC-09 found live: the document branch handed
        # App.handle no query at all, so every upload arrived addressed to
        # nobody and the app-level tests never noticed — they pass the query
        # directly. The named test speaks HTTP.
        "a document's deal selector is dropped at the door",
        "doorway/server.py",
        "                                          token=self._token(), query=selector,\n"
        "                                          upload=upload))",
        "                                          token=self._token(),\n"
        "                                          upload=upload))",
        "test_server.py::test_a_documents_deal_selector_travels_with_it",
    ),

    # ── Attribution is structural ────────────────────────────────────────────
    (
        "a deal can be opened in somebody else's name",
        "doorway/writes.py",
        'fields=(Field("agreement_id"), Field("counterparty")),',
        'fields=(Field("agreement_id"), Field("counterparty"),\n                Field("requester", required=False)),',
        "test_writes.py::test_no_write_takes_an_actor_from_the_body[POST /deals]",
    ),
    (
        "the reviewer verifying a ticket is taken from the request",
        "doorway/writes.py",
        '            Field("note", required=False),\n        ),\n    ),\n\n    "POST /tickets/reject"',
        '            Field("note", required=False),\n            Field("reviewer", required=False),\n        ),\n    ),\n\n    "POST /tickets/reject"',
        "test_writes.py::test_no_write_takes_an_actor_from_the_body[POST /tickets/verify]",
    ),

    # ── The review desk's own promises ───────────────────────────────────────
    (
        "verification becomes a raw update that mints nothing",
        "doorway/writes.py",
        'sql="""select cw.verify_review_ticket(%(ticket_id)s, %(approved_text)s,\n              %(new_clause_id)s, %(title)s, %(rationale)s,\n              current_setting(\'cw.actor\'), %(expires_on)s, %(origin)s, %(note)s)\n              as minted"""',
        'sql="""update cw.review_ticket set state = \'verified\'\n              where ticket_id = %(ticket_id)s\n              returning ticket_id, %(approved_text)s, %(new_clause_id)s,\n                        %(title)s, %(rationale)s, %(expires_on)s, %(origin)s,\n                        %(note)s"""',
        "test_writes.py::test_verification_goes_through_the_function_that_mints",
    ),
    (
        "the approved wording defaults to whatever was proposed",
        "doorway/writes.py",
        'Field("ticket_id"), Field("approved_text"), Field("new_clause_id"),',
        'Field("ticket_id"), Field("approved_text", required=False),\n            Field("new_clause_id"),',
        "test_writes.py::test_the_approved_wording_is_required_and_never_defaulted",
    ),
    (
        "a blank rejection note is accepted",
        "doorway/writes.py",
        'fields=(Field("ticket_id"), Field("note")),',
        'fields=(Field("ticket_id"), Field("note", required=False)),',
        "test_writes.py::test_a_rejection_needs_a_note",
    ),

    # ── The same guarantee, in the other places it lives ─────────────────────
    #
    # The role-based-UI session's warning, in mirror image. Theirs was one
    # pattern appearing several times in one file, so a check silently watched
    # the wrong copy. Mine is one GUARANTEE living in several files — reads.py,
    # writes.py and manifests.py each shape a refusal — where mutating only one
    # leaves the others unwatched while the count still reads full marks.
    (
        "a read refusal is softened into an empty list",
        "doorway/reads.py",
        "    except psycopg.Error as error:\n"
        "        refused: Refused = classify(error)\n"
        "        return Answer(status=refused.status, body=refused.as_body())",
        "    except psycopg.Error:\n"
        '        return Answer(status=200, body={"rows": []})',
        "test_reads.py::test_a_refusal_never_arrives_as_an_empty_list",
    ),
    (
        # RE-POINTED THE MOMENT PERSISTENCE LANDED, and the reason is worth
        # keeping. This row first named the ORDERING — the attempt written
        # before the engine is consulted — and pointed at the viewer's refusal
        # test. That was right while POST /runs stored nothing: the audit grant
        # was the only thing standing between a viewer and an engine answer.
        #
        # Once runs are recorded, a viewer is ALSO refused at the cw.run
        # insert, so the viewer test stays green with the attempt write gone
        # and the row read as a MISS — correctly. The ordering is still the
        # right way round and is argued in runs.py, but it is no longer
        # independently observable from outside, and a row that cannot be seen
        # to fail is a row that reads as protection.
        #
        # What IS still observable, and still matters: a call the engine
        # refuses must leave a trace. Without the attempt write, a refused
        # manifest vanishes from the record entirely.
        "a call the engine refuses leaves no trace on the record",
        "doorway/runs.py",
        '            _record(request, agreement_id, manifest, "run_attempted",\n'
        '                    "the manifest reached the engine")',
        "            pass",
        "test_runs.py::test_every_call_is_recorded_whether_it_succeeded_or_not",
    ),
    (
        # Content-addressed ids repeat by design. Break the guard and a second
        # run against an unchanged library takes a unique violation, which
        # refusals.classify labels 'refused on its merits' — somebody is told
        # their contract was rejected because nothing had changed.
        "a repeated content-addressed row is treated as a collision",
        "doorway/runs.py",
        '            + (" on conflict do nothing" if shared else ""), row)',
        '            , row)',
        "test_runs.py::test_two_runs_against_an_unchanged_library_share_one_snapshot",
    ),
    (
        # No paper from a run that has not just proved it reproduces. Break
        # this and the endpoint hands over a contract built from a library that
        # is not the one the run names — which is exactly the document nobody
        # could ever explain in a dispute.
        "a document is built from a run that does not rebuild",
        "doorway/documents.py",
        '            if rebuilt.snapshot_id != run["snapshot_id"]:',
        "            if False:",
        "test_documents.py::test_a_snapshot_that_does_not_rebuild_produces_no_document",
    ),
    (
        # Deferred from the package that added the seam, because nothing
        # consumed it then and a row guarding an unused capability cannot
        # report ok. Something consumes it now: this is how a caller says WHICH
        # contract they want.
        "the query selector is discarded before it reaches the app",
        "doorway/server.py",
        # Repointed 2026-07-28: commit add0554 moved this capture into `_query`
        # and the row had been stale on committed main ever since.
        "        return {\n"
        "            key: values[0]\n"
        "            for key, values in parsed.items()\n"
        "            if key in QUERY_KEYS and values\n"
        "        }, None",
        "        return {}, None",
        "test_documents.py::test_a_run_recorded_through_the_service_rebuilds_through_the_service",
    ),
    # ── The three gates on the one act that cannot be undone ─────────────────
    (
        "the run is not bound to the agreement being filed",
        "doorway/executions.py",
        '            if run["agreement_id"] != agreement_id:',
        "            if False:",
        "test_executions.py::test_a_run_recorded_against_another_deal_cannot_be_filed_here",
    ),
    (
        "the currency re-check at signature is not performed",
        "doorway/executions.py",
        "where d.run_id = %s and d.clause_id is not null and s.selectable = false",
        "where d.run_id = %s and false",
        "test_executions.py::test_a_run_carrying_a_retired_clause_is_refused_naming_the_clause",
    ),
    (
        "the validation gate is not checked at execution",
        "doorway/executions.py",
        '            if not run["gate_open"]:',
        "            if False:",
        "test_executions.py::test_a_closed_gate_with_no_override_is_refused",
    ),
    (
        # WITHOUT THIS ROW the gate above proves only the half that already
        # works: a gate that refuses EVERY blocked run reports ok for it. This
        # one breaks the lookup that lets an approved override through, so the
        # positive direction has a guard of its own.
        "an approved override is never consulted",
        "doorway/executions.py",
        'PASSES_SQL = "select finding_ref from cw.override_passes where run_id = %s"',
        'PASSES_SQL = "select finding_ref from cw.override_passes where run_id = %s and false"',
        "test_executions.py::test_a_closed_gate_with_every_blocking_finding_approved_is_admitted_and_filed",
    ),

    (
        "the engine's refusal is reworded on the way out",
        "doorway/manifests.py",
        # `reasons[0]` became `first` when the index was guarded against an
        # empty list; the guarantee — the engine's own sentence reaches the
        # caller — is unchanged.
        '                    "reason": first,',
        '                    "reason": "That category is not permitted.",',
        "test_manifests.py::test_the_refusal_is_the_engine_s_own_words",
    ),

    # ── The model seam invents a number when it cannot get one ───────────────
    # The one guarantee NC-25 rests on. Every path that fails to obtain a
    # judgment goes through `_absent`, and a substitute figure written there is
    # indistinguishable from a real judgment the moment it reaches a screen —
    # the precise failure ADR-0005 exists to prevent, in the one place the ADR's
    # usual remedy (a deterministic substitute) would itself be the lie.
    (
        "a judgment nobody obtained is recorded as a number anyway",
        "doorway/advisory.py",
        "    return Judgment(score=None, basis=None, absent_reason=reason,",
        "    return Judgment(score=0.5, basis=None, absent_reason=reason,",
        "test_advisory.py::test_the_adapter_records_an_absence_rather_than_a_number",
    ),

    # ── The one nobody may ever add ──────────────────────────────────────────
    (
        'a refused write is retried "to make the demo work"',
        "doorway/writes.py",
        "    except psycopg.Error as error:\n        refused: Refused = classify(error)",
        '    except psycopg.Error as error:\n        try:\n            return Answer(status=200, body={"rows": run(db, caller, key, body)})\n        except psycopg.Error:\n            pass\n        refused: Refused = classify(error)',
        "test_writes.py::test_no_refusal_is_ever_caught_and_tried_again",
    ),

    # ── The vendor's paper is kept, not released (U15, 0047) ─────────────────
    # Break the store and the ingest still answers 200 with a document_id —
    # a receipt for bytes that went nowhere, which is exactly the regression
    # U15 closed. The truthy dict short-circuits the insert away.
    (
        "the vendor's document is released instead of stored (U15 regression)",
        "doorway/paper.py",
        "            stored = request.rows(",
        '            stored = {"document_id": 0} or request.rows(',
        "test_paper.py::test_the_ingested_document_is_stored",
    ),
]


def _run_one(mutation):
    """Apply one mutation in its own tree and report the verdict."""
    name, filename, find, repl, expect = mutation
    test_file, _, test_name = expect.partition("::")

    with tempfile.TemporaryDirectory(prefix="cw-door-mut-") as tmp:
        root = Path(tmp)
        ignore = shutil.ignore_patterns("__pycache__", ".pytest_cache")
        shutil.copytree(HERE, root / "doorway", ignore=ignore)
        shutil.copytree(BACKEND / "engine", root / "engine", ignore=ignore)
        shutil.copytree(BACKEND / "db" / "migrations", root / "db" / "migrations")
        # The screens, which the server tests serve. Copied rather than pointed
        # at, so a mutation run cannot touch the real ones.
        shutil.copytree(BACKEND.parent / "prototype" / "v4",
                        root / ".." / "prototype" / "v4", dirs_exist_ok=True)

        target = root / filename
        source = target.read_text(encoding="utf-8")
        if find not in source:
            return name, expect, "skip"
        target.write_text(source.replace(find, repl, 1), encoding="utf-8")

        proc = subprocess.run(
            [sys.executable, "-m", "pytest", f"doorway/{expect}", "-q",
             "--no-header", "-p", "no:cacheprovider"],
            cwd=tmp, capture_output=True, text=True,
        )
        out = proc.stdout + proc.stderr

    if proc.returncode == 0:
        return name, expect, "miss"
    if "error" in out.lower() and "no tests ran" in out.lower():
        return name, expect, "skip"
    # THE NAMED TEST MUST HAVE FAILED ON ITS OWN ASSERTION — not merely
    # "pytest exited non-zero", which is what this used to accept.
    #
    # The difference is not theoretical, and the sibling harness
    # (db/test/mutation-check.mjs) has always got it right: it requires
    # `FAIL <expect>` in the output and scores anything else IMPRECISE.
    #
    # Why it bites here specifically. Lanes are NOT independent, though the
    # docstring above says they are: each gets its own database, but
    # `setup.py`'s `alter role cw_app …` is CLUSTER-wide, and six concurrent
    # rebuilds collide with `tuple concurrently updated` — reproduced, five
    # of six failing. A lane that dies in its FIXTURE exits non-zero, so the
    # guarantee was never evaluated at all, and this function called it `ok`.
    # The bottom line could read `24/24 caught` with several never exercised.
    #
    # That is precisely the failure this file's own preflight exists to
    # prevent, arriving one step later: a count that reads as protection.
    failed_by_name = f"failed" in out.lower() and _names_a_failure(out, expect)
    return name, expect, "ok" if failed_by_name else "imprecise"


def _names_a_failure(out: str, expect: str) -> bool:
    """Did the test named by this mutation appear in pytest's failure list?

    pytest's short summary writes `FAILED doorway/test_x.py::test_y` — with
    the platform's own separator, which is why the comparison is made on a
    normalised copy rather than on the raw text.
    """
    normalised = out.replace("\\", "/")
    wanted = f"doorway/{expect}".replace("\\", "/")
    return f"FAILED {wanted}" in normalised


def preflight() -> list[str]:
    """Every mutation's pattern must appear EXACTLY ONCE in the real source.

    Checked before anything runs, and reported on its own, because of a trap the
    role-based-UI session hit on 2026-07-27: a script rewrote a migration's line
    endings, every multi-line pattern in their harness silently stopped matching,
    and the report read `197/198` with one SKIP. Against `198/198` that is nearly
    invisible — a protection had stopped being watched and the bottom line barely
    moved.

    THE COUNT AT THE BOTTOM OF A REPORT IS THE LEAST INFORMATIVE LINE IN IT.

    This harness turns out to be immune to their specific cause — `read_text()`
    normalises CRLF to LF, verified rather than assumed — but not to the general
    one. A refactor that reworded a line would put a pattern quietly out of date
    in exactly the same way.

    Exactly once, not merely present: a pattern matching twice would mutate the
    first occurrence, which may not be the one the check is named for.
    """
    stale = []
    for name, filename, find, _repl, expect in MUTATIONS:
        hits = (BACKEND / filename).read_text(encoding="utf-8").count(find)
        if hits == 0:
            stale.append(f"{name} — pattern is not in {filename} any more")
        elif hits > 1:
            stale.append(f"{name} — pattern appears {hits} times in {filename}; "
                         "it would mutate the first, which may be the wrong one")

        test_file, _, test_name = expect.partition("::")
        source = (HERE / test_file).read_text(encoding="utf-8")
        if f"def {test_name.split('[')[0]}(" not in source:
            stale.append(f"{name} — names {expect}, which does not exist")
    return stale


def main() -> int:
    print("mutation check — each row must FAIL the test that names it")
    print(f"{len(MUTATIONS)} mutations\n")

    stale = preflight()
    if stale:
        print("STALE CHECKS — nothing was run, because these prove nothing:\n")
        for entry in stale:
            print("  · " + entry)
        print("\nFix or remove each one. A check that cannot match is not a check.")
        return 1

    lanes = max(2, min(len(MUTATIONS), (os.cpu_count() or 4) - 2))
    with ThreadPoolExecutor(max_workers=lanes) as pool:
        results = list(pool.map(_run_one, MUTATIONS))

    # THE SERIAL SECOND PASS, and it is not belt-and-braces — it is what makes
    # the parallel first pass safe to keep.
    #
    # Lanes share one PostgreSQL cluster, and `setup.py`'s `alter role cw_app …`
    # is cluster-wide, so concurrent rebuilds collide with `tuple concurrently
    # updated`. Measured on 2026-07-27: NINE of twenty-four lanes died in their
    # fixture on a single run. Every one of them scored `ok` under the old
    # "non-zero exit means caught" rule — nine guarantees reported as guarded
    # that were never evaluated at all.
    #
    # Re-running only the rows that did not fail through their own named test,
    # one at a time, removes the collision without making the whole harness
    # serial. A row that still does not fail by name after a lane of its own is
    # a real finding rather than a traffic jam.
    retried = [m for m, (_n, _e, v) in zip(MUTATIONS, results) if v == "imprecise"]
    if retried:
        print(f"re-running {len(retried)} row(s) serially — the suite failed "
              f"without their named test, usually a rebuild collision\n")
        again = {}
        for mutation in retried:
            name, expect, verdict = _run_one(mutation)
            again[name] = (name, expect, verdict)
        results = [again.get(n, (n, e, v)) for n, e, v in results]

    caught, missed = 0, []
    for name, expect, verdict in results:
        if verdict == "ok":
            caught += 1
            print(f"  ok    {name}")
        elif verdict == "skip":
            missed.append(f"{name} — pattern not found, or the test does not exist")
            print(f"  SKIP  {name}  ← stale check")
        elif verdict == "imprecise":
            # Its own verdict, and fatal, because it is the one that used to
            # read as `ok`: the suite failed, but not through the test that
            # names this guarantee. Most often the lane's fixture died, which
            # means the guarantee was never evaluated at all.
            missed.append(
                f"{name} — the suite failed, but NOT via {expect}. The "
                f"guarantee was not evaluated; re-run this row alone")
            print(f"  IMPRECISE  {name}  ← failed, but not through its own test")
        else:
            missed.append(f"{name} — {expect} passed with the guarantee broken")
            print(f"  MISS  {name}  ← nothing guards this")

    print(f"\n{caught}/{len(MUTATIONS)} caught by the test that names them")
    if missed:
        print("\nunguarded:")
        for entry in missed:
            print("  · " + entry)
    return 1 if missed else 0


if __name__ == "__main__":
    raise SystemExit(main())
