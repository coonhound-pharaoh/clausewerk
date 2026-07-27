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

Each mutation runs in its own copy of the tree, in its own process, so it gets
its own test database (the name carries the process id) and they cannot collide.
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
        "the role is not bound at the start of a request",
        "doorway/db.py",
        '                    cur.execute(\n                        sql.SQL("set local role {}").format(sql.Identifier(db_role))\n                    )',
        "                    pass",
        "test_server.py::test_the_masthead_names_the_person_and_their_role",
    ),
    (
        "sign-in looks up identity on a privileged connection",
        "doorway/identity.py",
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
    (
        "sessions never expire",
        "doorway/sessions.py",
        "        if self._now() >= expires_at:",
        "        if False:",
        "test_retirement.py::test_a_session_expires_and_re_sign_in_is_required",
    ),

    # ── Refusals stay legible ────────────────────────────────────────────────
    (
        "refusals are classified by reading the message, not the SQLSTATE",
        "doorway/refusals.py",
        "    if code == INSUFFICIENT_PRIVILEGE:",
        '    if "permission denied" in reason.lower() or "row-level security" in reason.lower():',
        "test_refusals.py::test_the_database_s_own_words_reach_the_caller_unchanged",
    ),

    # ── The database decides, not the doorway ────────────────────────────────
    (
        "the deals endpoint scopes rows in the API instead of the database",
        "doorway/reads.py",
        "          from cw.agreement order by agreement_id",
        "          from cw.agreement where requester = current_setting('cw.actor')\n          order by agreement_id",
        "test_writes.py::test_the_deals_endpoint_does_not_scope_rows_itself",
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
        "the engine's refusal is reworded on the way out",
        "doorway/manifests.py",
        '                    "reason": reasons[0],',
        '                    "reason": "That category is not permitted.",',
        "test_manifests.py::test_the_refusal_is_the_engine_s_own_words",
    ),

    # ── The one nobody may ever add ──────────────────────────────────────────
    (
        'a refused write is retried "to make the demo work"',
        "doorway/writes.py",
        "    except psycopg.Error as error:\n        refused: Refused = classify(error)",
        '    except psycopg.Error as error:\n        try:\n            return Answer(status=200, body={"rows": run(db, caller, key, body)})\n        except psycopg.Error:\n            pass\n        refused: Refused = classify(error)',
        "test_writes.py::test_no_refusal_is_ever_caught_and_tried_again",
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
    return name, expect, "ok"


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

    caught, missed = 0, []
    for name, expect, verdict in results:
        if verdict == "ok":
            caught += 1
            print(f"  ok    {name}")
        elif verdict == "skip":
            missed.append(f"{name} — pattern not found, or the test does not exist")
            print(f"  SKIP  {name}  ← stale check")
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
