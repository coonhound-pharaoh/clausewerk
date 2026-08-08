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

import hashlib
import os
import sys
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
# ASCII "CLAUSEWK" as a signed-bigint advisory-lock namespace. Session-level
# because each migration is deliberately its own transaction.
MIGRATION_LOCK_KEY = 0x434C41555345574B

MIGRATIONS_DIR = Path(
    os.environ.get("CW_MIGRATIONS", Path(__file__).resolve().parent.parent / "db" / "migrations")
)

_LEDGER = """
create schema if not exists cw;
create table if not exists cw.schema_migration (
  filename   text primary key,
  applied_at timestamptz not null default now(),
  checksum   text
);
-- For installations whose ledger predates the checksum. The ledger is this
-- module's own bookkeeping, not part of the schema being migrated, so it cannot
-- be altered BY a migration — every migration is recorded in it, including the
-- one that would change it.
alter table cw.schema_migration add column if not exists checksum text;
"""


class MigrationChanged(Exception):
    """An already-applied migration's file is not the file that was applied."""


class MigrationMissing(Exception):
    """A migration this installation ran has no file in the directory.

    Its own type rather than a MigrationChanged, because the two need different
    answers. An edited migration is fixed by superseding it; a missing one is
    either a file somebody deleted — put it back — or a database that ran
    something this repository no longer contains, which is a fact about the
    installation and not about the tree.
    """


class MigrationOutOfOrder(Exception):
    """A new migration sorts below one that has already been applied.

    Its own type for the same reason. This one is not drift that has happened;
    it is drift about to happen, and the answer is to renumber the file before
    it lands anywhere.
    """


def digest_of(path: Path) -> str:
    """The migration's content, as a stable fingerprint.

    Hashes the DECODED TEXT, not the raw bytes. `read_text` performs universal
    newline translation, so a checkout with CRLF endings produces the same digest
    as one with LF — which matters here, because git is configured to convert
    line endings on this repository and a byte digest would report every
    migration as altered on a fresh clone. `mutation_check.py` leans on the same
    property and says so.
    """
    return hashlib.sha256(
        path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def migration_files(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    """Every migration, in the order their names sort.

    Sorted rather than listed, for the same reason the test runner discovers its
    suites: a migration is applied because it is here, not because somebody
    remembered to add it to a list.
    """
    return sorted(p for p in directory.iterdir() if p.suffix == ".sql")


def _check_nothing_applied_has_changed(
    conn: psycopg.Connection, directory: Path, recorded: dict[str, str | None]
) -> None:
    """Refuse to go on if an already-applied migration's file has been edited.

    THE GAP THIS CLOSES. Until now the ledger recorded a FILENAME and nothing
    else, so a migration edited after it had been applied was skipped in silence
    on every database that already ran it — forever, with no mechanism by which
    the drift could ever become visible. A fresh test database would rebuild
    from the edited file and report green while production ran the old one.

    That is why "migrations are forward-only" had been a convention nobody could
    enforce, and why the decision to supersede 0032 rather than edit it could
    not be settled from the ledger's design and had to be settled by querying
    every developer database by hand.

    THREE KINDS OF DRIFT, AND THIS USED TO SEE ONE. Until 2026-08-08 it compared
    content and nothing else, so two other ways for a repository and an
    installation to disagree went past in silence. Both were demonstrated
    against a database with all 71 migrations applied:

      · A RECORDED MIGRATION DELETED FROM DISK produced no complaint whatever.
        The loop below iterates the files that EXIST, so a ledger row with no
        file was never looked at. This installation kept everything that
        migration built; a database created from the repository today would not
        have it, and nothing said so.

      · A NEW FILE SORTING BELOW THE HIGH-WATER MARK was applied last.
        `0007a_inserted_late.sql` added after 71 later migrations went in at
        ledger position 71 of 72, while its NAME sorts eighth. The same
        repository therefore builds two different schemas depending on the age
        of the database — which is a reproducibility hole in a system whose
        promise is that a manifest and a snapshot id reproduce forever, and is
        how a harmless insertion becomes a broken one the day somebody inserts
        a file that references a table created above it.

    WHAT THIS STILL CANNOT DO, stated plainly rather than left to be discovered.

    Rows written before the checksum column existed carry no digest, so there is
    nothing to compare them against. They are given one from whatever is on disk
    NOW. That blesses the present state and proves nothing whatsoever about the
    past: if a migration was edited last week, this records the edited version
    as correct. It establishes a baseline going forward, and it says so out loud
    rather than reporting a clean bill of health it has not earned.

    And the two checks added below compare the LEDGER to the DIRECTORY by name,
    so a migration renamed and re-added under a new name with identical content
    reads as one file removed and one added — the removal is caught, which is
    the point, but the message will talk about a deletion rather than a rename.
    """
    changed = []
    baselined = []
    on_disk = {path.name: path for path in migration_files(directory)}

    # ── The ledger has a row and the directory has no file ───────────────────
    missing = sorted(set(recorded) - set(on_disk))
    if missing:
        raise MigrationMissing(
            "this database has applied " + ", ".join(missing) + ", and there is "
            "no such file in " + str(directory) + ". A database built from this "
            "repository today would not have whatever those migrations created, "
            "so the installation and the tree now disagree about what the schema "
            "is — silently, which is the whole failure the checksum beside this "
            "check exists to prevent. Put the file back. If a migration really "
            "must leave the repository, remove its ledger row by hand, "
            "deliberately, on every database that ran it, and write down why."
        )

    # ── A new file that would sort below something already applied ───────────
    # Compared against the highest APPLIED name rather than against every one:
    # what matters is whether this file would run in a different position on a
    # fresh database than it will run here, and only the high-water mark decides
    # that. A new file above the mark runs last in both places, which is the
    # ordinary case and must stay silent.
    if recorded:
        high_water = max(recorded)
        late = sorted(name for name in on_disk
                      if name not in recorded and name < high_water)
        if late:
            raise MigrationOutOfOrder(
                ", ".join(late) + " sort(s) below " + high_water + ", which this "
                "database has already applied. On a fresh database they would run "
                "in their sorted position; here they would run last, so the same "
                "repository would build two different schemas depending on when "
                "the database was created. Renumber the file above " + high_water
                + " — a migration's number is its place in the order, and the "
                "order is the only thing that makes a schema reproducible."
            )

    for path in migration_files(directory):
        if path.name not in recorded:
            continue
        current = digest_of(path)
        was = recorded[path.name]
        if was is None:
            baselined.append((path.name, current))
        elif was != current:
            changed.append(path.name)

    if changed:
        raise MigrationChanged(
            "these migrations have already been applied and their files have "
            "since changed: " + ", ".join(changed) + ". A migration is "
            "forward-only — every database that already ran it will skip the "
            "new version in silence, so the edit takes effect nowhere it was "
            "needed and this installation would disagree with the file. "
            "Supersede it with a new numbered migration instead. If the change "
            "really is safe and cosmetic, clear the recorded checksum for that "
            "row by hand, deliberately, and write down why."
        )

    if baselined:
        with conn.transaction():
            for filename, current in baselined:
                conn.execute(
                    "update cw.schema_migration set checksum = %s "
                    "where filename = %s and checksum is null",
                    (current, filename))
        sys.stderr.write(
            f"schema_migration: recorded a first checksum for {len(baselined)} "
            "migration(s) applied before checksums existed. This is a baseline "
            "taken from the files as they are now — it does not verify that "
            "they are what was originally applied. Drift is detectable from "
            "here onwards, not before.\n")


def migrate(conn: psycopg.Connection, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Serialize ledger inspection and application across service instances."""
    conn.execute("select pg_advisory_lock(%s)", (MIGRATION_LOCK_KEY,))
    try:
        applied = _migrate_locked(conn, directory)
    except BaseException:
        # A broken connection commonly makes both the migration and the cleanup
        # fail. The migration error is the cause an operator needs; do not mask
        # it with a second failure from best-effort unlock. PostgreSQL releases
        # the session lock when that broken connection closes.
        try:
            conn.execute("select pg_advisory_unlock(%s)", (MIGRATION_LOCK_KEY,))
        except Exception:
            pass
        raise
    else:
        conn.execute("select pg_advisory_unlock(%s)", (MIGRATION_LOCK_KEY,))
        return applied


def _migrate_locked(conn: psycopg.Connection,
                    directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply every migration not yet recorded. Returns the ones applied now."""
    with conn.transaction():
        conn.execute(_LEDGER)

    recorded = dict(
        conn.execute("select filename, checksum from cw.schema_migration").fetchall())

    _check_nothing_applied_has_changed(conn, directory, recorded)

    applied: list[str] = []
    for path in migration_files(directory):
        if path.name in recorded:
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
                        "insert into cw.schema_migration (filename, checksum) "
                        "values (%s, %s)",
                        (path.name, digest_of(path)),
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
