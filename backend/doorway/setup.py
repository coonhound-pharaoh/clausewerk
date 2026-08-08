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

# Set this to rotate the password on a role that can already log in. Without it,
# prepare() establishes the login once and then leaves the role alone — see the
# reasoning in prepare(). Rotation is a deliberate act, so it says so.
RESET_PASSWORD_VARIABLE = "CW_APP_PASSWORD_RESET"


def prepare(owner_url: str = OWNER_URL, app_password: str = APP_PASSWORD) -> list[str]:
    """Apply the schema and make `cw_app` able to log in. Returns migrations applied."""
    with psycopg.connect(owner_url, autocommit=True) as conn:
        applied = migrate(conn)

        # CHECKED, NOT REWRITTEN — the same instinct as the NOINHERIT check
        # below, which was already right and was simply applied two lines too
        # late.
        #
        # `cw_app` is a CLUSTER-WIDE row. The test harness gives every process
        # its own database and rebuilds the schema per test, so an unconditional
        # `alter role` here fired hundreds of times per run against a row no
        # per-process database isolates — and two overlapping runs raised
        # `tuple concurrently updated` in an unrelated test.
        #
        # A password cannot be read back from pg_authid, so this cannot be a
        # pure assertion the way NOINHERIT can. The next best thing: write only
        # when there is something to establish. Once the role can log in, a
        # repeat prepare() writes nothing at all.
        # Stated as a check rather than trusted: NOINHERIT is the single word
        # that stops the doorway's login holding all six roles' privileges at
        # once, and a hand-edited role is exactly the thing nobody would notice.
        #
        # IT RUNS BEFORE THE PASSWORD IS SET, AND THAT ORDER IS THE POINT.
        # Until 2026-08-08 it ran after — the comment two lines below already
        # said it was "applied two lines too late" and nothing had moved it. On
        # a cluster where somebody had cleared NOINHERIT, `prepare()` would
        # first GIVE THAT ROLE A WORKING LOGIN and then refuse. The refusal was
        # accurate and arrived after the door was open; `alter role` is
        # autocommit here, so the raise unwinds nothing.
        #
        # It must still come after migrate(), because 0016 is what creates the
        # role and re-asserts NOINHERIT on every rebuild.
        inherits = conn.execute(
            "select rolinherit from pg_roles where rolname = 'cw_app'"
        ).fetchone()[0]
        if inherits:
            raise RuntimeError(
                "cw_app is set to inherit its roles, which would give every "
                "connection all six roles' privileges before any request has said "
                "who it is. Migration 0016 sets NOINHERIT; something has changed it."
            )

        can_login = conn.execute(
            "select rolcanlogin from pg_roles where rolname = 'cw_app'"
        ).fetchone()[0]
        if not can_login or os.environ.get(RESET_PASSWORD_VARIABLE):
            conn.execute(
                sql.SQL("alter role cw_app login password {}").format(
                    sql.Literal(app_password)
                )
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
