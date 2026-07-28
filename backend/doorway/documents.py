"""The contract, as a file — but only from a run that has just proved itself.

WHAT THIS ENDPOINT DOES, IN ORDER, AND THE ORDER IS THE POINT

  1. Find the run the caller named, THROUGH cw.run, which carries the row rules.
  2. Rebuild the library that run was taken against, from what was stored.
  3. Refuse if it does not rebuild to the same fingerprint.
  4. Re-resolve the stored manifest against that rebuilt library.
  5. Refuse if it does not produce the same result.
  6. Only then build the document, record that it was produced, and hand it over.

No bytes are produced on any refusing path. A document that cannot be shown to
follow from an immutable record is not a weaker document; it is a different one
wearing the same name.

WHY NOTHING IS STORED

A pre-execution contract is deterministic output of an immutable run, and this
file makes that literally true: `build_docx` is given the run's own date rather
than today's, so the same run yields the same bytes and the same fingerprint
forever. Storing them would create a second copy that could disagree with the
first. After execution this endpoint still rebuilds from the run, and both the
answer and the record call it a PRE-EXECUTION rebuild — the signed instrument's
own bytes remain the authoritative thing.

TWO HASHES, AND THEY ANSWER DIFFERENT QUESTIONS

  · the RESULT hash   — Resolution.result_hash, over the decisions. It is what
                        cw.run stores and what POST /health-checks/rebuild
                        compares against. This endpoint recomputes it and
                        refuses on a mismatch.
  · the DOCUMENT hash — engine.docx.sha256_of over the bytes returned. It
                        identifies THIS RENDERING and goes only into the
                        document_produced record.

With the date fixed from the run they coincide in practice, and they are still
different facts. Feeding the document hash to the rebuild check would produce a
health check that always disagrees.

READING COLUMNS: rows(), NEVER one()

`db.Request.one()` returns a plain tuple with no row factory (db.py:108-113), so
every column read from it by name is a TypeError. `rows()` labels from the
cursor description (db.py:99-107). One is an existence test; the other is how
columns come back. Everything below uses rows().

THE RUN IS RESOLVED THROUGH cw.run AND NOTHING ELSE

cw.snapshot, cw.snapshot_member, cw.snapshot_ladder_rung, cw.ruleset and
cw.ruleset_member carry NO row-level security at all (0005:265-268 enables it on
the three run tables and nowhere else) while holding select grants to three
roles. Every bit of scoping in a rebuild therefore rests on finding the run in
cw.run FIRST — which is why zero rows there is a REFUSAL and never a filter, and
why the caller-supplied run id is the one identifier in this system that must
never reach an unprotected table before it has been resolved through a protected
one.
"""

from __future__ import annotations

import json

import psycopg

from doorway import manifests
from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify
from engine import docx, loader
from engine import run as engine_run
from engine.resolution import resolve

# What the rebuild needs out of the stored snapshot. The clause side is the
# ENGINE'S OWN query, imported rather than retyped — a second definition of
# "the library" in this file would drift from the one that wrote the snapshot,
# and the symptom would be a run that stops reproducing for no reason anybody
# could find.
MEMBER_SQL = """select clause_id, version, selectable from cw.snapshot_member
                where snapshot_id = %s"""
RUNG_SQL = """select category_key, severity, rung, clause_id, version, is_floor
              from cw.snapshot_ladder_rung where snapshot_id = %s order by rung"""


def contract(db: Database, caller: Caller, query: dict) -> "Response | Download":
    # IMPORTED HERE, NOT AT THE TOP, AND FOR ONE REASON ONLY: app.py routes to
    # this module, so a module-level import of it would be a cycle. The reply
    # types stay where they are — app.py owns them, and DOCX_TYPE has exactly
    # one spelling in the repository, which is the thing worth protecting.
    from doorway.app import DOCX_TYPE, Download, Response

    run_id = (query or {}).get("run")
    if not isinstance(run_id, str) or not run_id.strip():
        return Response(400, {"error": "refused", "reason": "name the run to build",
                              "kind": "rejected"})
    run_id = run_id.strip()

    # Refused at the boundary rather than sanitised, because the filename is
    # quoted into a content-disposition header and server.py deliberately does
    # not rewrite it. A transport that edits its payload's name is a transport
    # that can be argued with about what the name was.
    if '"' in run_id or "\n" in run_id or "\r" in run_id:
        return Response(400, {
            "error": "refused",
            "reason": "a run name cannot contain a quote or a line break",
            "kind": "rejected"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            found = request.rows(
                """select run_id, agreement_id, vendor, value, manifest,
                          snapshot_id, ruleset_id, result_hash, engine_version,
                          created_at
                   from cw.run where run_id = %s""", (run_id,))
            if not found:
                # NOT an empty document and not a partial one. Nothing came
                # back because the row rules say this run is not this caller's
                # to see — or because there is no such run, which from here is
                # the same sentence and deliberately so.
                return Response(403, {
                    "error": "refused",
                    "reason": "no run by that name is yours to build",
                    "kind": "not_permitted"})
            run = found[0]

            categories = manifests.categories_for(request)
            taken_on = request.rows(
                "select taken_on from cw.snapshot where snapshot_id = %s",
                (run["snapshot_id"],))

            try:
                rebuilt = engine_run.snapshot_from_rows(
                    request.rows(MEMBER_SQL, (run["snapshot_id"],)),
                    request.rows(loader.CLAUSE_SQL),
                    request.rows(RUNG_SQL, (run["snapshot_id"],)),
                    taken_on[0]["taken_on"] if taken_on else None,
                    categories=categories)
            except (engine_run.SnapshotIncomplete, ValueError,
                    manifests.UnknownCategory) as incomplete:
                # The engine's own sentence, unchanged. It says exactly what is
                # missing and why rebuilding without it would be worse than
                # refusing.
                return Response(409, {"error": "refused", "reason": str(incomplete),
                                      "kind": "refused_on_merits"})

            if rebuilt.snapshot_id != run["snapshot_id"]:
                return Response(409, {
                    "error": "refused",
                    "reason": (f"this run does not rebuild: stored "
                               f"{run['snapshot_id']}, rebuilt {rebuilt.snapshot_id}"),
                    "kind": "refused_on_merits"})

            # ── The manifest, reconstructed — and check_manifest NOT re-run ──
            #
            # cw.run.manifest holds the ALREADY-CHECKED manifest: risks
            # filtered, severities coerced, with what was dropped recorded
            # alongside as history. manifest_from reads only vendor, value,
            # source and risks, which is exactly the checked set.
            #
            # THE REASON RE-CHECKING IS WRONG IS NOT THE OBVIOUS ONE, and the
            # obvious one is false — so it is written down before somebody
            # checks it and "fixes" this.
            #
            # It is NOT that re-checking would empty the coerced set: resolve()
            # reads only manifest.risks and manifest.vendor, and result_hash is
            # taken over each decision's category, severity, selection, reason
            # and suppressed candidates. manifest.coerced never enters the hash
            # at all, so an emptied coerced set would change nothing.
            #
            # THE REAL HAZARD IS THE REGISTRY MOVING UNDERNEATH A STORED RUN.
            # check_manifest REMOVES a risk whose category the registry no
            # longer defines (engine/manifest.py:88-116). Re-running it against
            # TODAY's cw.category would drop a risk that was perfectly
            # legitimate when the run was recorded, change the decision set, and
            # change the result hash — so this endpoint would refuse because
            # Legal retired a category, and report it as a run that does not
            # reproduce. That is the one thing this refusal must never mean.
            try:
                manifest = manifests.manifest_from(run["manifest"])
            except manifests.Malformed as malformed:
                return Response(409, {
                    "error": "refused",
                    "reason": f"this run's stored manifest is malformed: {malformed}",
                    "kind": "refused_on_merits"})
            resolution = resolve(manifest, rebuilt)

            if resolution.result_hash != run["result_hash"]:
                return Response(409, {
                    "error": "refused",
                    "reason": (f"this run does not reproduce: stored "
                               f"{run['result_hash']}, recomputed "
                               f"{resolution.result_hash}"),
                    "kind": "refused_on_merits"})

            # THE DATE IS LOAD-BEARING AND IS NOT TODAY'S. build_docx stamps
            # `Dated: <today>` from `today or date.today()`, so without this the
            # same immutable run would produce different bytes and a different
            # fingerprint on two different days — and two document_produced
            # records for one run would legitimately disagree, forever, in a
            # chain that cannot be corrected.
            try:
                data = docx.build_docx(
                    manifest, resolution, today=run["created_at"].date())
            except docx.UnprintableText as unprintable:
                return Response(409, {
                    "error": "refused",
                    "reason": str(unprintable),
                    "kind": "refused_on_merits"})
            digest = docx.sha256_of(data)

            # Recorded BEFORE the bytes leave, inside the same transaction. If
            # the chain refuses the entry, the whole thing rolls back and no
            # document is handed over — which is why an auditor, who may read
            # every run and may not write to the chain, cannot download one.
            # That is the house pattern winning: auditing outside the caller's
            # transaction would reintroduce the privileged path db.py exists to
            # make impossible.
            request.write(
                "select cw.audit('document_produced', %(run_id)s, %(payload)s::jsonb)",
                {"run_id": run_id,
                 "payload": json.dumps({
                     "sha256": digest,
                     "byte_size": len(data),
                     "snapshot_id": run["snapshot_id"],
                     "result_hash": resolution.result_hash,
                     "dated": run["created_at"].date().isoformat(),
                     "pre_execution": True,
                 })})

    except psycopg.Error as error:
        database_said: Refused = classify(error)
        return Response(database_said.status, database_said.as_body())

    return Download(200, data, DOCX_TYPE, f"{run_id}.docx")
