"""Preparing a database for the doorway to connect to — installation, not serving.

Applies the migrations, then gives the doorway's login (`cw_app`, created by
migration 0016) the ability to log in with a password.

    python -m doorway.setup

The password comes from CW_APP_PASSWORD, or defaults to a development one. A
real deployment sets it; nothing secret is written down here, and the migration
that creates the role deliberately leaves it unable to log in until this step
runs.

This module needs the database owner and is therefore not part of the serving
path — the same separation as migrate.py, for the same reason.
"""

from __future__ import annotations

import os
import sys

import psycopg
from psycopg import sql

from doorway.migrate import migrate

OWNER_URL = os.environ.get(
    "CW_OWNER_DATABASE_URL",
    "postgresql://clausewerk:clausewerk@localhost:5432/clausewerk",
)
APP_PASSWORD = os.environ.get("CW_APP_PASSWORD", "clausewerk-dev")


def prepare(owner_url: str = OWNER_URL, app_password: str = APP_PASSWORD) -> list[str]:
    """Apply the schema and make `cw_app` able to log in. Returns migrations applied."""
    with psycopg.connect(owner_url, autocommit=True) as conn:
        applied = migrate(conn)
        conn.execute(
            sql.SQL("alter role cw_app login password {}").format(
                sql.Literal(app_password)
            )
        )
        # Stated as a check rather than trusted: NOINHERIT is the single word
        # that stops the doorway's login holding all six roles' privileges at
        # once, and a hand-edited role is exactly the thing nobody would notice.
        inherits = conn.execute(
            "select rolinherit from pg_roles where rolname = 'cw_app'"
        ).fetchone()[0]
        if inherits:
            raise RuntimeError(
                "cw_app is set to inherit its roles, which would give every "
                "connection all six roles' privileges before any request has said "
                "who it is. Migration 0016 sets NOINHERIT; something has changed it."
            )
    return applied


if __name__ == "__main__":
    applied = prepare()
    print(f"schema ready — {len(applied)} migration(s) applied this run")
    for name in applied:
        print(f"  {name}")
    print("\ncw_app can now log in. The doorway connects as that role and holds")
    print("no privileges until a request binds one.")
    sys.exit(0)
