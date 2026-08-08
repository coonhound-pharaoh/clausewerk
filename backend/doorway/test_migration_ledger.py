"""An applied migration that changes on disk must stop the next start-up.

WHAT THIS GUARDS

The ledger used to record a FILENAME and nothing else. So a migration edited
after it had been applied was skipped in silence on every database that already
ran it — forever, with no mechanism by which the drift could become visible. A
fresh test database would rebuild from the edited file and report green while
production ran the old one, and nothing anywhere would disagree.

That is why "migrations are forward-only" was a convention nobody could enforce,
and why the question "has 0032 been applied here?" had to be answered by
querying developer databases by hand instead of by asking the ledger.

WHAT IT DELIBERATELY DOES NOT GUARD

Rows written before the checksum column existed carry no digest, so there is
nothing to compare them against. They get one from whatever is on disk now,
which establishes a baseline and proves nothing about the past. That behaviour
is asserted here too — it is a real limitation, and a test that pretended
otherwise would be worse than no test.

Assertions are on exceptions, row counts and digests. Never on wording.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest

from doorway import migrate as migrate_module
from doorway.migrate import (
    MigrationChanged,
    MigrationMissing,
    MigrationOutOfOrder,
    digest_of,
    migrate,
    migration_files,
)


def test_an_unlock_failure_cannot_mask_the_migration_failure(monkeypatch):
    class BrokenConnection:
        def execute(self, statement, _parameters):
            if "unlock" in statement:
                raise RuntimeError("unlock failed")

    def migration_failed(_conn, _directory):
        raise ValueError("migration failed")

    monkeypatch.setattr(migrate_module, "_migrate_locked", migration_failed)

    with pytest.raises(ValueError, match="migration failed"):
        migrate(BrokenConnection())


def test_an_unlock_failure_after_success_is_not_hidden(monkeypatch):
    class BrokenUnlock:
        def execute(self, statement, _parameters):
            if "unlock" in statement:
                raise RuntimeError("unlock failed")

    monkeypatch.setattr(migrate_module, "_migrate_locked",
                        lambda _conn, _directory: ["applied.sql"])

    with pytest.raises(RuntimeError, match="unlock failed"):
        migrate(BrokenUnlock())


def _ledger(owner_url: str) -> dict[str, str | None]:
    with psycopg.connect(owner_url, autocommit=True) as conn:
        return dict(conn.execute(
            "select filename, checksum from cw.schema_migration").fetchall())


def test_every_applied_migration_carries_a_checksum(schema, owner_url):
    recorded = _ledger(owner_url)
    assert recorded, "the ledger is empty"
    missing = [name for name, digest in recorded.items() if not digest]
    assert missing == [], f"{missing} were applied without a checksum"


def test_the_recorded_checksum_is_the_file_on_disk(schema, owner_url):
    recorded = _ledger(owner_url)
    for path in migration_files():
        if path.name in recorded:
            assert recorded[path.name] == digest_of(path), (
                f"{path.name}'s recorded digest is not its file")


def test_an_edited_applied_migration_stops_the_next_start_up(schema, owner_url):
    """The whole point. A silent skip becomes a loud refusal."""
    with psycopg.connect(owner_url, autocommit=True) as conn:
        conn.execute(
            "update cw.schema_migration set checksum = %s where filename = %s",
            ("0" * 64, "0016_doorway_login.sql"))

        with pytest.raises(MigrationChanged):
            migrate(conn)


def test_an_unchanged_tree_migrates_again_without_complaint(schema, owner_url):
    """The check must not cry wolf: re-running against an untouched tree is the
    normal case and has to stay silent."""
    with psycopg.connect(owner_url, autocommit=True) as conn:
        assert migrate(conn) == [], "a settled database re-applied something"


def test_two_migrators_serialize_the_same_new_file(schema, owner_url, tmp_path):
    """THE DIRECTORY IS A COMPLETE COPY, NOT ONE LOOSE FILE, and that changed on
    2026-08-08 when the ledger learned to notice a migration that has left the
    repository. Pointing migrate() at a directory holding one file while the
    ledger holds seventy-two now reads — correctly — as seventy-one migrations
    missing.

    Copying the real directory is also the more faithful test: a second service
    instance racing this one sees the real migrations directory with one new
    file in it, which is exactly what is set up here.
    """
    import shutil

    directory = tmp_path / "migrations"
    shutil.copytree(migrate_module.MIGRATIONS_DIR, directory)
    migration = directory / "9999_concurrent_probe.sql"
    migration.write_text(
        "create table cw.concurrent_migration_probe (id int primary key);",
        encoding="utf-8",
    )

    def apply():
        with psycopg.connect(owner_url, autocommit=True) as conn:
            return migrate(conn, directory)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _index: apply(), range(2)))

    assert sorted(results, key=len) == [[], [migration.name]]


def test_a_ledger_predating_checksums_is_baselined_not_rejected(schema, owner_url):
    """An existing installation must not be bricked by the upgrade.

    Rows with no digest are given one from the current files. This asserts the
    baseline happens AND that it is only a baseline — the value recorded is
    whatever is on disk now, which is exactly what makes it unable to speak
    about the past.
    """
    with psycopg.connect(owner_url, autocommit=True) as conn:
        conn.execute("update cw.schema_migration set checksum = null")
        assert migrate(conn) == [], "baselining re-applied a migration"

    recorded = _ledger(owner_url)
    assert all(recorded.values()), "a row was left without a checksum"
    for path in migration_files():
        if path.name in recorded:
            assert recorded[path.name] == digest_of(path)


def test_the_digest_survives_a_line_ending_change(tmp_path):
    """A byte digest would report every migration as altered on a fresh clone,
    because git converts line endings on this repository. The digest is taken
    over decoded text for that reason, and this pins it."""
    lf = tmp_path / "lf.sql"
    crlf = tmp_path / "crlf.sql"
    lf.write_bytes(b"select 1;\nselect 2;\n")
    crlf.write_bytes(b"select 1;\r\nselect 2;\r\n")

    assert digest_of(lf) == digest_of(crlf)


def test_a_genuine_content_change_does_move_the_digest(tmp_path):
    """The other half — otherwise the test above could pass on a constant."""
    one = tmp_path / "one.sql"
    two = tmp_path / "two.sql"
    one.write_text("select 1;\n", encoding="utf-8")
    two.write_text("select 2;\n", encoding="utf-8")

    assert digest_of(one) != digest_of(two)


# ── The other two ways a ledger and a directory disagree (2026-08-08) ───────
#
# The checksum above catches an EDITED migration. It caught nothing else, and
# two more kinds of drift produce exactly the same outcome it exists to prevent:
# an installation and a repository that silently disagree about the schema.
# Both were demonstrated against a database with all 71 migrations applied
# before either check existed.


def test_a_migration_that_left_the_repository_stops_the_next_start_up(
        schema, owner_url, tmp_path):
    """DELETING AN APPLIED MIGRATION USED TO PRODUCE NO COMPLAINT AT ALL.

    The loop that checks digests iterates the files that EXIST, so a ledger row
    with no file was never looked at. This installation keeps everything that
    migration built; a database created from the repository today would not have
    it, and nothing anywhere reported the difference.

    Done on a COPY of the directory rather than by deleting from the repository,
    for obvious reasons.
    """
    import shutil

    directory = tmp_path / "migrations"
    shutil.copytree(migrate_module.MIGRATIONS_DIR, directory)
    (directory / "0045_vendor_friction.sql").unlink()

    with psycopg.connect(owner_url, autocommit=True) as conn:
        with pytest.raises(MigrationMissing):
            migrate(conn, directory)


def test_a_migration_inserted_below_the_high_water_mark_is_refused(
        schema, owner_url, tmp_path):
    """IT USED TO BE APPLIED LAST, SILENTLY.

    `0007a` added after seventy-one later migrations went in at ledger position
    71 of 72 while its NAME sorts eighth — so the same repository built two
    different schemas depending on the age of the database. That is a
    reproducibility hole in a system whose promise is that a manifest and a
    snapshot id reproduce forever, and it is how a harmless insertion becomes a
    broken one the day somebody inserts a file referencing a table created above
    it.
    """
    import shutil

    directory = tmp_path / "migrations"
    shutil.copytree(migrate_module.MIGRATIONS_DIR, directory)
    (directory / "0007a_inserted_late.sql").write_text(
        "create table cw.inserted_late (id int);", encoding="utf-8")

    with psycopg.connect(owner_url, autocommit=True) as conn:
        with pytest.raises(MigrationOutOfOrder):
            migrate(conn, directory)


def test_a_new_migration_above_the_mark_still_applies_normally(
        schema, owner_url, tmp_path):
    """THE HALF THAT WOULD MAKE THE GUARD USELESS IF IT WERE WRONG. Adding the
    next migration is the ordinary act this system performs constantly, and a
    check that refused it would stop all work while looking like caution."""
    import shutil

    directory = tmp_path / "migrations"
    shutil.copytree(migrate_module.MIGRATIONS_DIR, directory)
    (directory / "9998_the_next_one.sql").write_text(
        "create table cw.the_next_one (id int);", encoding="utf-8")

    with psycopg.connect(owner_url, autocommit=True) as conn:
        assert migrate(conn, directory) == ["9998_the_next_one.sql"]
