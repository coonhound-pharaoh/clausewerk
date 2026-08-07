"""A REVIEW TRIPWIRE over the five run-store tables.

THE PREMISE THIS FILE SHIPPED WITH WAS ALREADY FALSE, AND WAS CORRECTED ON
2026-08-07. It said these five tables have NO row-level security, and that the
only thing standing between a caller and every deal's run evidence was the
doorway's own discipline. Both halves were untrue by the time it landed:

    16:44  6fb4c97  "Scope run pins to visible runs" — adds `enable row level
                    security` AND read/write policies to all five tables
    18:57  62f0257  adds this file, asserting the five have no RLS

Two hours apart, the same day, almost certainly parallel work integrated in
sequence: the author verified against a tree that predated the fix. Nobody was
careless. The guard simply arrived after its danger was gone, and nothing
reconciled the two — the usual defect of this codebase seen from the other end.

WHY THAT MATTERED ENOUGH TO FIX RATHER THAN LEAVE. The failure message told a
developer a false thing ABOUT THE SYSTEM'S SECURITY: that nothing but their own
care prevented a cross-deal read. Somebody may take a risk elsewhere believing
this rule is uniquely load-bearing; somebody who discovers the claim is false has
been handed a reason to distrust the test and delete it.

WHAT IS ACTUALLY TRUE NOW. All five carry RLS and two policies each (0005, as
amended by 6fb4c97). Its own note states the rule:

    Snapshot and ruleset rows are content-addressed and may be shared by many
    runs. A requester may read a pin only when at least one run visible through
    cw.run references it.

So the catastrophic case this file used to warn about — a "show me this
snapshot" screen taking a snapshot_id from a caller and reading across every
deal — is now refused by the database, not merely by convention.

WHAT THIS IS, THEREFORE. Defence in depth and house style, and worth keeping as
both. `documents.py:47-56` states the invariant:

    the caller-supplied run id is the one identifier in this system that must
    never reach an unprotected table before it has been resolved through a
    protected one

— and every current consumer honours it: `documents.py` resolves through
`cw.run` first, `runs.py` only writes, `executions.py` never touches them.
Resolving through `cw.run` remains the pattern this system reasons in, and a new
file that skips it should still be read by somebody even though the database
would now catch the consequence.

WHAT THIS IS NOT. It is not row-level security and must never be mistaken for
it — that is what the policies are. It proves only that a new file naming one of
these tables gets SEEN.
"""

from pathlib import Path

import pytest

# The five run-store tables a caller-supplied id must not reach directly.
#
# RENAMED FROM `UNPROTECTED` ON 2026-08-07, because they are not: all five carry
# row-level security and two policies each. The old name was the false premise
# in one word, and a name is what a reader trusts when they do not read the
# comment.
#
# cw.audit_checkpoint and cw.schema_migration ARE genuinely RLS-free and are
# deliberately absent — neither holds per-deal evidence. Re-checked 2026-08-07
# against the installed catalog; that exclusion is still right.
RUN_STORE = (
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


@pytest.mark.parametrize("table", RUN_STORE)
def test_only_entitled_modules_name_a_run_store_table(table):
    named_by = {
        path.name for path in _doorway_modules()
        if table in path.read_text(encoding="utf-8")
    }
    # Longer names contain shorter ones: "cw.snapshot" is a substring of
    # "cw.snapshot_member". That does not matter here — the allowlist is the
    # same set for every one of the five — but it is why the check is
    # membership rather than an exact match.
    assert named_by <= ALLOWED, (
        f"{sorted(named_by - ALLOWED)} names {table} directly. The run store is "
        f"reached by resolving the caller's id through cw.run first — the "
        f"invariant documents.py:47-56 states. Row-level security will refuse "
        f"the consequence if you skip it (0005, as amended by 6fb4c97), so this "
        f"is house style rather than the only thing standing in the way; it is "
        f"still how this system reasons. Add the file to ALLOWED with a reason.")


def test_the_allowlist_describes_the_tree_it_claims_to_describe():
    """A stale allowlist is a tripwire with the wire cut.

    An entry that no longer names any of the five would sit there granting
    permission nobody uses, and the next reader would take it as evidence that
    naming these tables is ordinary.
    """
    modules = _doorway_modules()
    for name in ALLOWED:
        source = next(p for p in modules if p.name == name).read_text(encoding="utf-8")
        assert any(table in source for table in RUN_STORE), (
            f"{name} is on the allowlist but no longer names any run-store "
            f"table; remove it")
