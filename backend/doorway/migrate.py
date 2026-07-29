"""Applying the schema — the one privileged thing the system does.

WHY THIS IS A SEPARATE MODULE FROM db.py

Migrating needs the database owner, who bypasses every row-level rule in the
schema by definition. Serving a request must never have that. Keeping the two in
different files is the cheapest way to make the boundary visible: `db.py` exports
no way to reach an owner connection, and this module is called once at start-up
and is not reachable from a request handler.

APPLIED ONCE, AND RECORDED

A ledger table, not a "does schema cw exist" check. That check answers "has
anything ever been applied", which stops being the right question the moment a
fourteenth migration is written — it would be skipped on every existing
installation, silently, and the schema would be a version behind with nothing
saying so.

EACH FILE IS ITS OWN UNIT OF WORK

A migration that fails halfway leaves nothing behind and is not recorded, so the
next start-up tries it again from the beginning. The alternative — one
transaction around all thirteen — sounds safer and is worse: a failure on the
thirteenth would roll back the twelve that were fine, and the operator would be
told nothing about which one actually broke.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import psycopg

# A ROLE IS CLUSTER-WIDE; A DATABASE IS NOT.
#
# The test harness gives every process its own database precisely so two runs
# cannot collide. Roles live outside that isolation, in pg_authid, and 0016
# re-asserts `alter role cw_app noinherit` on every rebuild — deliberately, so a
# hand-edited role is put back. The schema fixture rebuilds per test, so one
# 566-test run issues that statement hundreds of times against a single shared
# row, and two overlapping runs make PostgreSQL raise `tuple concurrently
# updated` in whichever one lost.
#
# It surfaces as a random error in an unrelated test with a message about role
# inheritance — a harness problem wearing a product problem's clothes.
#
# Retried rather than prevented, because preventing it means editing 0016, and a
# migration that has been applied everywhere is not editable (its filename is
# already in every ledger, so the edit would be silently skipped exactly where
# it was needed). The statement is idempotent, each migration file is its own
# transaction that leaves nothing behind when it fails, and the second attempt
# sees the settled row.
#
# Measured 2026-07-28 on PostgreSQL 18.4: 12 concurrent `alter role cw_app
# noinherit` produced 7 failures; 12 concurrent `grant ... to cw_app` produced
# none. So this covers the alter, and the grant needed nothing.
CONTENDED = "tuple concurrently updated"
CONTENTION_ATTEMPTS = 5
CONTENTION_PAUSE_SECONDS = 0.05

MIGRATIONS_DIR = Path(
    os.environ.get("CW_MIGRATIONS", Path(__file__).resolve().parent.parent / "db" / "migrations")
)

_LEDGER = """
create schema if not exists cw;
create table if not exists cw.schema_migration (
  filename   text primary key,
  applied_at timestamptz not null default now()
);
"""


def migration_files(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    """Every migration, in the order their names sort.

    Sorted rather than listed, for the same reason the test runner discovers its
    suites: a migration is applied because it is here, not because somebody
    remembered to add it to a list.
    """
    return sorted(p for p in directory.iterdir() if p.suffix == ".sql")


def migrate(conn: psycopg.Connection, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply every migration not yet recorded. Returns the ones applied now."""
    with conn.transaction():
        conn.execute(_LEDGER)

    done = {row[0] for row in conn.execute("select filename from cw.schema_migration")}

    applied: list[str] = []
    for path in migration_files(directory):
        if path.name in done:
            continue
        sql = path.read_text(encoding="utf-8")
        for attempt in range(CONTENTION_ATTEMPTS):
            try:
                with conn.transaction():
                    # No parameters, so psycopg sends this as one script and
                    # PostgreSQL runs every statement in it — which is what a
                    # migration file is.
                    conn.execute(sql)
                    conn.execute(
                        "insert into cw.schema_migration (filename) values (%s)",
                        (path.name,),
                    )
                break
            except psycopg.errors.InternalError_ as clash:
                # ONLY this one, and only by its own words: PostgreSQL gives the
                # concurrent-catalogue-update failure no distinguishing SQLSTATE
                # of its own. Anything else is a real migration failure and must
                # keep failing loudly on the first attempt — a retry loop that
                # swallowed those would turn a broken migration into a slow
                # broken migration. See CONTENDED above.
                if CONTENDED not in str(clash) or attempt == CONTENTION_ATTEMPTS - 1:
                    raise
                time.sleep(CONTENTION_PAUSE_SECONDS * (attempt + 1))
        applied.append(path.name)
    return applied
