"""Test fixtures for the doorway.

WHAT IS DIFFERENT NOW, AND WHY IT MATTERS

Until 2026-07-26 every database test in this project ran against a PostgreSQL
that lives inside the program and allows exactly one connection. That made one
whole class of test impossible to write: anything about an identity outliving
the request it belongs to, because there was never a second connection for it to
leak *to*.

These fixtures run against standard PostgreSQL, so a pool is a real pool and
"handed back" is a real event.

  docker compose up -d      before running these
  python -m pytest doorway

THE SUITE OWNS ITS OWN DATABASE, AND THAT IS NOT TIDINESS

Each test drops the whole `cw` schema and rebuilds it from the migrations. Two
suites doing that at once on one database do not merely interfere — they
DEADLOCK, one holding the schema while the other waits to drop it, and the
failure surfaces as "schema cw does not exist" halfway through migration 0003,
which looks like a broken migration and is not.

That happened on 2026-07-26, with the role-based-UI session's suite running
against the same database at the same time. So this suite builds and uses
`clausewerk_doorway`, a database of its own, created on first run. The default
`clausewerk` database is left to everybody else.

Point `CW_TEST_DATABASE` somewhere else if you need to. The credentials still
come from the compose file's development defaults.
"""

from __future__ import annotations

import os
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg
import pytest
from psycopg import sql

from doorway.setup import OWNER_URL as DEFAULT_OWNER_URL, prepare

# The database THIS RUN owns — one per process, not one per suite.
#
# Per-suite was the first fix and it was not enough. `npm run verify` runs this
# very suite (`python -m pytest doorway`), so two people verifying at once are
# two processes dropping and rebuilding the same schema, and they deadlock. The
# process id is what makes a run's database its own.
#
# It is dropped at the end of the run. A killed run leaves one behind, so stale
# ones with nobody connected are cleaned up at the start of the next.
TEST_DATABASE = os.environ.get(
    "CW_TEST_DATABASE", f"clausewerk_doorway_{os.getpid()}")

# The prefix a stale database can be recognised by. Only ever used to clean up
# databases this file created.
TEST_DATABASE_PREFIX = "clausewerk_doorway_"


def _database_statement(command: str, name: str) -> sql.Composed:
    """Compose an owner-level database command without treating its name as SQL."""
    return sql.SQL(command + " {}").format(sql.Identifier(name))


def _with_database(url: str, name: str) -> str:
    """The same connection details, pointed at a different database."""
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.netloc,
                       "/" + quote(name, safe=""),
                       parsed.query, parsed.fragment))


OWNER_URL = os.environ.get(
    "CW_TEST_OWNER_URL", _with_database(DEFAULT_OWNER_URL, TEST_DATABASE))

# What the DOORWAY connects as: the unprivileged login from migration 0016, which
# holds no application role until a request binds one. Tests use this rather than
# the owner for the same reason the serving path does — a test that connects as
# the owner measures the owner's privileges, not the system's, and that is
# precisely how finding D1 survived a full suite once already.
APP_URL = os.environ.get(
    "CW_DATABASE_URL",
    f"postgresql://cw_app:clausewerk-dev@localhost:5432/{TEST_DATABASE}")


def _ensure_database_exists() -> None:
    """Create this suite's database if it is not there yet.

    Creating a database cannot happen inside a transaction, and `if not exists`
    does not exist for it, so the already-there case is caught rather than
    checked for — checking first and then creating is the race this is avoiding.
    """
    maintenance = _with_database(DEFAULT_OWNER_URL, "postgres")
    try:
        with psycopg.connect(maintenance, autocommit=True) as conn:
            try:
                conn.execute(_database_statement("create database", TEST_DATABASE))
            except psycopg.errors.DuplicateDatabase:
                pass
    except psycopg.OperationalError as exc:
        pytest.fail(
            f"cannot reach PostgreSQL at {maintenance}\n\n"
            f"  {exc}\n\n"
            "Start it with:  docker compose up -d   (from backend/)\n"
            "Or point CW_TEST_OWNER_URL at another PostgreSQL.",
            pytrace=False,
        )


# NO AUTOMATIC CLEANUP OF OTHER RUNS' DATABASES, AND THAT IS THE SECOND ATTEMPT.
#
# The first version dropped any `clausewerk_doorway_*` database with nobody
# connected to it, on the reasoning that a live run always holds a connection.
# It does not: this suite closes its pool after every single test, so a healthy
# run is unconnected for a moment between each one. A second run starting in that
# gap deleted the first run's database out from under it, and the failure looked
# exactly like the deadlock it was meant to prevent.
#
# A run that is killed now leaves its database behind. That is untidy and
# harmless, and it is much the better failure: `drop database` is not a tidying
# operation, it is a destructive one, and a guess about whether somebody else is
# finished is not a good enough reason to run it.
#
#   drop the leftovers by hand:
#     psql -c "select datname from pg_database where datname like 'clausewerk_doorway_%'"


@pytest.fixture(scope="session", autouse=True)
def _this_run_s_database():
    """Build this run's database, and take it away again afterwards."""
    _ensure_database_exists()
    yield
    if os.environ.get("CW_TEST_DATABASE"):
        # Somebody named it deliberately; it is not ours to remove.
        return
    maintenance = _with_database(DEFAULT_OWNER_URL, "postgres")
    try:
        with psycopg.connect(maintenance, autocommit=True) as conn:
            conn.execute(
                "select pg_terminate_backend(pid) from pg_stat_activity "
                "where datname = %s and pid <> pg_backend_pid()", (TEST_DATABASE,))
            conn.execute(_database_statement(
                "drop database if exists", TEST_DATABASE))
    except psycopg.Error:
        # A database left behind is untidy; a run that fails while tidying up
        # reports the wrong thing. The next run clears it.
        pass


@pytest.fixture
def schema() -> str:
    """A schema built fresh from the migrations for EACH test, returning the URL
    the doorway should connect on.

    Per test, not per session, and it costs under a second. Several of these
    tests revoke people, change operational settings, or run the bootstrap
    ceremony — which refuses outright if any account already exists. Sharing one
    database between them would make each test's result depend on the order the
    others ran in, and an order-dependent suite is one that eventually passes
    while proving nothing.

    The roles are cluster-wide and the migrations create them only if absent, so
    dropping the schema and rebuilding leaves them in place. That is correct —
    roles are part of the installation, not part of the data.
    """
    _ensure_database_exists()
    try:
        with psycopg.connect(OWNER_URL, autocommit=True) as conn:
            conn.execute("drop schema if exists cw cascade")
    except psycopg.OperationalError as exc:
        pytest.fail(
            f"cannot reach PostgreSQL at {OWNER_URL}\n\n  {exc}\n\n"
            "Start it with:  docker compose up -d   (from backend/)",
            pytrace=False,
        )
    prepare(owner_url=OWNER_URL)
    return APP_URL


@pytest.fixture
def owner_url() -> str:
    """The owner connection for THIS suite's database.

    A fixture rather than an import, so a test cannot reach for the shared
    development database by accident — which is the mistake that produced the
    deadlock this file's docstring describes.
    """
    return OWNER_URL
