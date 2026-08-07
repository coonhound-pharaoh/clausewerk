"""Fixture controls that need no running PostgreSQL server."""

from doorway.conftest import _database_statement, _with_database


def test_a_test_database_name_is_always_one_quoted_identifier():
    hostile = 'scratch"; drop database important; --'

    rendered = _database_statement("create database", hostile).as_string()

    assert rendered == 'create database "scratch""; drop database important; --"'


def test_a_test_database_name_cannot_change_the_connection_url_structure():
    owner = "postgresql://owner:secret@[::1]:5432/postgres?sslmode=require"

    redirected = _with_database(owner, "scratch/other?#%\\g<1>")

    assert redirected == (
        "postgresql://owner:secret@[::1]:5432/"
        "scratch%2Fother%3F%23%25%5Cg%3C1%3E?sslmode=require")


# ── Clearing up after a run that never got to (2026-08-07) ──────────────────
#
# The suite builds a database per run, named for the pid that built it, and
# drops it at teardown. Teardown is exactly what does not happen when a run is
# killed or the server dies under it — so the sweep at session START is the only
# thing that ever collects those. Twenty-two had accumulated before it existed.
#
# THE SECOND TEST IS THE IMPORTANT ONE. Per-pid naming exists so suite runs can
# go in parallel; a sweep that took a live run's database would break it in a
# way that looks like a product failure. Being too eager is the costly
# direction, so uncertainty must always resolve towards keeping the database.


def test_this_very_process_is_alive_and_a_daft_pid_is_not():
    """The liveness check, against the two answers it must never get wrong.

    NOT `os.kill(pid, 0)`: on Windows os.kill with a signal other than
    CTRL_C_EVENT/CTRL_BREAK_EVENT calls TerminateProcess, so that spelling would
    kill the process it was asking about."""
    import os

    from doorway.conftest import _process_is_alive

    assert _process_is_alive(os.getpid()) is True, (
        "the running process was reported dead; the sweep would drop the "
        "database of whichever live run owned that pid")
    # Not a pid any system will hand out, so "no such process" is the only
    # honest answer. 0 and negatives are separately treated as alive.
    assert _process_is_alive(0x7FFFFFFE) is False


def test_an_unreadable_pid_is_treated_as_alive():
    """Every uncertainty resolves towards KEEPING the database. A sweep that
    guesses wrong in this direction costs disk; the other way it breaks a
    concurrent run."""
    from doorway.conftest import _process_is_alive

    assert _process_is_alive(0) is True
    assert _process_is_alive(-1) is True
