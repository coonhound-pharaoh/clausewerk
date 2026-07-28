"""A REVIEW TRIPWIRE over the five tables that have no row-level security.

WHAT THIS IS NOT

This is not row-level security, and it must never be mistaken for it. It proves
only that a new file naming one of these tables gets SEEN. It proves nothing at
all about whether the identifier that reached the table was resolved through
`cw.run` first. WP-012 carries the real control, if it is ever built.

WHAT IT IS

Five tables hold run evidence with no RLS enabled — verified against the
installed schema, and `0005_run_store.sql:301-309` grants `select, insert` on
all five to `cw_requester` and both Legal roles. So a requester CAN reach them
directly today. That is contained by exactly one paragraph in one file:
`documents.py:47-56` states the invariant that keeps it safe —

    the caller-supplied run id is the one identifier in this system that must
    never reach an unprotected table before it has been resolved through a
    protected one

— and every current consumer honours it. `documents.py` resolves through
`cw.run` first, `runs.py` only writes, `executions.py` never touches them.

The exposure is the NEXT endpoint. A "show me this snapshot" screen that takes a
snapshot_id from a caller would read across every deal in the system with
nothing to stop it, and it would pass code review, because these look like
ordinary tables. This test is what makes that file stop and get read.

A behavioural test was considered and rejected: it cannot pass against correct
code, because a requester genuinely can reach these tables today.
"""

from pathlib import Path

import pytest

# The five tables `pg_class` reports without row-level security that carry run
# evidence. cw.audit_checkpoint and cw.schema_migration are also RLS-free and
# are deliberately absent: neither holds per-deal evidence.
UNPROTECTED = (
    "cw.snapshot_member",
    "cw.snapshot_ladder_rung",
    "cw.snapshot",
    "cw.ruleset_member",
    "cw.ruleset",
)

# Who may name them today, and why. Authored from the tree, not guessed. Adding
# a name here is the deliberate act this test exists to force.
ALLOWED = {
    # Rebuilds a document from a run, and resolves the caller's run id through
    # cw.run — which does have RLS — before naming any of these.
    "documents.py",
    # Writes a run's evidence. It never takes one of these ids from a caller.
    "runs.py",
}


def _doorway_modules():
    here = Path(__file__).parent
    return sorted(
        path for path in here.glob("*.py")
        if not path.name.startswith("test_") and path.name != "conftest.py"
    )


@pytest.mark.parametrize("table", UNPROTECTED)
def test_only_entitled_modules_name_an_unprotected_table(table):
    named_by = {
        path.name for path in _doorway_modules()
        if table in path.read_text(encoding="utf-8")
    }
    # Longer names contain shorter ones: "cw.snapshot" is a substring of
    # "cw.snapshot_member". That does not matter here — the allowlist is the
    # same set for every one of the five — but it is why the check is
    # membership rather than an exact match.
    assert named_by <= ALLOWED, (
        f"{sorted(named_by - ALLOWED)} names {table}, which has no row-level "
        f"security. Resolve the caller's id through cw.run first, then add the "
        f"file to ALLOWED with a reason.")


def test_the_allowlist_describes_the_tree_it_claims_to_describe():
    """A stale allowlist is a tripwire with the wire cut.

    An entry that no longer names any of the five would sit there granting
    permission nobody uses, and the next reader would take it as evidence that
    naming these tables is ordinary.
    """
    modules = _doorway_modules()
    for name in ALLOWED:
        source = next(p for p in modules if p.name == name).read_text(encoding="utf-8")
        assert any(table in source for table in UNPROTECTED), (
            f"{name} is on the allowlist but no longer names any unprotected "
            f"table; remove it")
