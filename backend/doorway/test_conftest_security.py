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
