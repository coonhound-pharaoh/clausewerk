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
from pathlib import Path

import psycopg

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
        with conn.transaction():
            # No parameters, so psycopg sends this as one script and PostgreSQL
            # runs every statement in it — which is what a migration file is.
            conn.execute(sql)
            conn.execute(
                "insert into cw.schema_migration (filename) values (%s)", (path.name,)
            )
        applied.append(path.name)
    return applied
