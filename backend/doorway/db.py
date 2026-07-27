"""The only way the doorway touches the database.

THE RULE THIS MODULE EXISTS TO MAKE STRUCTURAL

    There is no privileged connection in the serving path.

Not "we are careful not to use one" — there is no way to reach one from a
request. Every statement a request makes goes through `as_person()`, which binds
the connection to that person's role and name before the first statement, inside
one unit of work that PostgreSQL unwinds by itself when the request finishes.

Why this matters more than it sounds: the database enforces the entire
permission model — six roles' worth of row-by-row rules, the countersign rule,
the append-only guarantees. All of it is bypassed completely by an owner
connection, because row-level security is ENABLED, not FORCED, and the owner is
exempt by definition. A single "it's just a count" query run as the owner
therefore does not merely leak that count; it proves nothing about whether the
caller was allowed to have it, and it will be copied.

So this module exports no general query function. Applying the schema is the one
privileged act and it lives in `migrate.py`, called at start-up, never reachable
from a request handler.

HOW THE IDENTITY EXPIRES — THE PART WORTH READING TWICE

Each request is one transaction, and both identity settings use the form
PostgreSQL unwinds at the end of it:

    set local role cw_legal_admin        not  set role
    set_config('cw.actor', …, true)      not  set_config(…, false)

`true` there means "for this transaction only". Both are undone at COMMIT and at
ROLLBACK alike, *before* the pool gets the connection back — so there is nothing
left to leak, and no clean-up step that could fail to run. That is the whole
reason this form was chosen over clearing the values ourselves.

It also fails in the right direction. A request that somehow escaped its
transaction would run as the pool's base login, which holds no application role
at all and therefore no privileges on anything: `cw.app_role()` answers null and
every policy in the schema fails closed. The failure is a refusal, not a silent
escalation.

WHAT THIS ASSUMES, SAID PLAINLY

One authenticated identity per unit of work. That is the real requirement, and
it is checked by `test_no_identity_survives.py`. Two of this project's own
documents still say the design is "incompatible with transaction-mode connection
pooling"; that was an overstatement describing a setting the old test harness
used, not a limit of the design. Because both settings above are transaction
-scoped, ordinary connection-sharing infrastructure is fine.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator, Sequence

import psycopg
from psycopg import sql
from psycopg_pool import ConnectionPool

# The six application roles, and the database role each one becomes. This map is
# the only place an application role name turns into a database role name, and
# nothing outside this module may add to it.
ROLE_TO_DB_ROLE = {
    "viewer": "cw_viewer",
    "requester": "cw_requester",
    "legal_reviewer": "cw_legal_reviewer",
    "legal_admin": "cw_legal_admin",
    "auditor": "cw_auditor",
    "administrator": "cw_administrator",
}


class UnknownRole(Exception):
    """A role that is not one of the six. Raised rather than defaulted: a
    doorway that quietly picks a role when it does not recognise one is a
    doorway that grants access on a typo."""


class Request:
    """The database, as seen by one request, already acting as one person.

    Deliberately not a connection. A handler holding this can run statements and
    nothing else — it cannot commit, cannot change role, and cannot reach the
    pool. Everything it runs is subject to the row-by-row rules for the role it
    was opened with.
    """

    def __init__(self, cursor: psycopg.Cursor):
        self._cursor = cursor

    def all(self, statement: str, params: Sequence[Any] = ()) -> list[tuple]:
        """Every row the person's role is allowed to see."""
        return self._cursor.execute(statement, params).fetchall()

    def rows(self, statement: str, params: Sequence[Any] = ()) -> list[dict]:
        """Every row the person's role is allowed to see, by column name.

        The same rows as `all()`, labelled. Read endpoints answer an interface
        rather than a caller who already knows the column order, and a list of
        unlabelled tuples cannot be rendered without the interface holding a
        second copy of the SELECT list — which would then drift from the first.
        """
        cursor = self._cursor.execute(statement, params)
        columns = [column.name for column in cursor.description or ()]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def one(self, statement: str, params: Sequence[Any] = ()) -> tuple | None:
        """The first row, or None. None means the database returned nothing —
        which is not the same as a refusal, and callers must not render the two
        the same way."""
        return self._cursor.execute(statement, params).fetchone()

    def write(self, statement: str, params: Sequence[Any] = ()) -> int:
        """A change, and the number of rows it actually changed.

        THE SILENT NO-OP, WHICH IS WHY THIS RETURNS A COUNT AT ALL.

        A write refused by a missing policy does not raise. It affects zero rows
        and reports success. That is finding D1's exact shape, and it survived a
        full test suite once already because the tests ran as the database
        owner, who bypasses everything.

        This method reports the count so callers can insist on it. `write_one()`
        is the version that insists for you, and it is what handlers should
        normally use.
        """
        self._cursor.execute(statement, params)
        return self._cursor.rowcount

    def write_one(self, statement: str, params: Sequence[Any] = ()) -> None:
        """A change that must change exactly one row, or it is an error.

        A mutation that reports success while changing nothing is not an
        outcome; it is a failure that has not been noticed yet.
        """
        changed = self.write(statement, params)
        if changed != 1:
            raise SilentlyRefused(
                f"the statement completed but changed {changed} rows. A change that "
                "reports success while changing nothing is a refusal that has not "
                "been noticed — never report it as done."
            )


class SilentlyRefused(Exception):
    """A change the database allowed to complete while refusing to apply it.

    Kept as its own type so a handler cannot accidentally catch it alongside an
    ordinary refusal and tell the person their work was saved.
    """


class Database:
    """A pool of connections, none of which is privileged.

    The pool logs in as one unprivileged base user. It holds no application role
    of its own, so a connection that has not been bound to a person can do
    nothing: `cw.app_role()` answers null on it and every policy in the schema
    refuses. Being useless in that state is the point.
    """

    def __init__(self, database_url: str, *, min_size: int = 1, max_size: int = 10):
        self._pool = ConnectionPool(
            database_url,
            min_size=min_size,
            max_size=max_size,
            # Each request opens its own transaction explicitly, so connections
            # must not be sitting inside one when they are handed out.
            kwargs={"autocommit": True},
            open=True,
        )

    @contextmanager
    def as_person(self, person: str, role: str) -> Iterator[Request]:
        """Run one request as a named person holding a named role.

        This is the ONLY way a request reaches the database.

        `person` comes from the signed-in session and never from anything the
        browser sent. `role` comes from `cw.effective_role` and never from
        `cw.account.role` — see sign_in() in identity.py for why that distinction
        is the most important line in this workstream.
        """
        db_role = ROLE_TO_DB_ROLE.get(role)
        if db_role is None:
            raise UnknownRole(f"{role!r} is not one of the six application roles")

        with self._pool.connection() as conn:
            # One request, one transaction. Everything below is unwound at the
            # end of this block, by PostgreSQL, whether it ends well or badly.
            with conn.transaction():
                with conn.cursor() as cur:
                    # The role name cannot be a parameter — PostgreSQL takes it
                    # as an identifier, not a value — so it is composed as one,
                    # from the fixed map above and never from user input.
                    cur.execute(
                        sql.SQL("set local role {}").format(sql.Identifier(db_role))
                    )
                    # The person's name IS a value, and is passed as one. It
                    # arrives from cw.account rather than the browser, but a name
                    # containing a quote would otherwise break the request, and
                    # "it cannot contain a quote" is the assumption that ages
                    # worst.
                    cur.execute("select set_config('cw.actor', %s, true)", (person,))
                    yield Request(cur)

    @contextmanager
    def borrow_bare(self) -> Iterator[psycopg.Cursor]:
        """A connection with no identity attached, for one purpose only: proving
        that a returned connection carries nothing.

        This is test equipment, and it is deliberately useless for anything else
        — the base login holds no application role, so every table in the schema
        refuses it. It exists because the leak it checks for is the one failure
        the rest of the design cannot survive, and a check that cannot see the
        raw connection cannot make that assertion.
        """
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                yield cur

    def close(self) -> None:
        self._pool.close()
