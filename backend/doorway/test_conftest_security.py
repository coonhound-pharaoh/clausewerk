"""Fixture controls that need no running PostgreSQL server."""

from doorway.conftest import _database_statement


def test_a_test_database_name_is_always_one_quoted_identifier():
    hostile = 'scratch"; drop database important; --'

    rendered = _database_statement("create database", hostile).as_string()

    assert rendered == 'create database "scratch""; drop database important; --"'
