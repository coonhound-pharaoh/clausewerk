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

The database is rebuilt from the migrations for each test session. Rebuilt, not
reused: a suite that inherits the last run's rows passes or fails for reasons
nobody chose.
"""

from __future__ import annotations

import os

import psycopg
import pytest

from doorway.setup import OWNER_URL, prepare

# What the DOORWAY connects as: the unprivileged login from migration 0016, which
# holds no application role until a request binds one. Tests use this rather than
# the owner for the same reason the serving path does — a test that connects as
# the owner measures the owner's privileges, not the system's, and that is
# precisely how finding D1 survived a full suite once already.
APP_URL = os.environ.get(
    "CW_DATABASE_URL", "postgresql://cw_app:clausewerk-dev@localhost:5432/clausewerk"
)


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
    try:
        with psycopg.connect(OWNER_URL, autocommit=True) as conn:
            conn.execute("drop schema if exists cw cascade")
    except psycopg.OperationalError as exc:
        pytest.fail(
            f"cannot reach PostgreSQL at {OWNER_URL}\n\n"
            f"  {exc}\n\n"
            "Start it with:  docker compose up -d   (from backend/)\n"
            "Or point CW_OWNER_DATABASE_URL at another PostgreSQL.",
            pytrace=False,
        )
    prepare()
    return APP_URL
