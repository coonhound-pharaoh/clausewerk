"""Refusals, kept legible.

THE RULE THIS FILE ENFORCES

    A refusal and an empty result are different sentences, and must never be
    rendered identically.

"Nothing is waiting on you" and "You cannot see this" mean opposite things to the
person reading them. Collapsing the second into the first is the most comfortable
mistake in this whole layer: it makes errors disappear from the screen while
making the product lie.

THE THREE OUTCOMES THE DATABASE PRODUCES

  · A privilege refusal          — your role may not do this
  · A refusal on the merits      — the act itself is not allowed right now
  · Zero rows changed, no error  — a rule silently did nothing

The third is the dangerous one. A write refused by a missing policy does not
raise; it affects zero rows and reports success. That is finding D1's exact
shape, and it survived a full test suite once already. It is handled in db.py by
`write_one()`, which treats it as the failure it is.

WHY THE DATABASE'S OWN WORDS ARE PASSED THROUGH UNCHANGED

The schema raises sentences written for humans — "X is an owner decision and only
a legal admin may change it". Rewording those here would replace an accurate
sentence with a vaguer one, and then commit us to keeping the vaguer one in step
with the schema forever.

WHY CLASSIFICATION READS THE CODE AND NOT THE MESSAGE

Matching on the words was the first attempt in the version this replaces, and it
was wrong in a way worth recording: it looked for "permission denied" and
"row-level security", which catches the refusals PostgreSQL words itself and
misses every refusal the SCHEMA words — and the schema's are the good ones. The
schema raises them with `insufficient_privilege` deliberately; reading that code
respects the choice and needs no maintenance as more rules are written.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

import psycopg

# PostgreSQL's code for "you may not". Covers privilege errors, row-level
# security violations, and every refusal the schema raises deliberately naming
# insufficient_privilege.
INSUFFICIENT_PRIVILEGE = "42501"

# psycopg's own words when it cannot turn a Python value into a bind parameter.
# A driver-internal string, and named here rather than buried in the branch so
# that a psycopg upgrade which reworded it breaks one obvious constant and the
# test that pins it, rather than silently reopening B1.
CANNOT_ADAPT = "cannot adapt type"


@dataclass(frozen=True)
class Refused:
    """A database refusal, classified and ready to show a person."""

    status: int
    reason: str
    kind: str

    def as_body(self) -> dict:
        if self.kind == "broke":
            # Not a refusal, and it must not wear one's clothes: "refused" sends
            # somebody to argue with their administrator about an outage.
            return {"error": "the service failed", "reason": self.reason}
        return {"error": "refused", "reason": self.reason, "kind": self.kind}


def classify(error: Exception) -> Refused:
    """Turn a database error into something an interface can say out loud."""
    reason = str(getattr(error, "diag", None) and error.diag.message_primary or error).strip()
    code = getattr(error, "sqlstate", None)

    if isinstance(error, psycopg.OperationalError):
        # The service could not reach its database — the database said nothing,
        # because it was never asked. OperationalError covers connection
        # failures and pool timeouts alike (psycopg_pool's PoolTimeout is a
        # subclass, asserted in test_refusals.py). Two things must not happen
        # here: the caller must not be told they did something wrong, and the
        # driver's message — which names hosts and ports — must not leave the
        # building. The detail goes to the log; the caller gets the fact.
        sys.stderr.write(f"database unreachable: {reason}\n")
        return Refused(status=500,
                       reason="the service could not reach its database",
                       kind="broke")

    if code == INSUFFICIENT_PRIVILEGE:
        return Refused(status=403, reason=reason, kind="not_permitted")

    if isinstance(error, psycopg.errors.IntegrityError):
        # A check, a foreign key, or an exclusion rule. The act is refused on its
        # merits rather than on who asked, and the schema's message says why.
        return Refused(status=409, reason=reason, kind="refused_on_merits")

    if isinstance(error, psycopg.errors.RaiseException):
        # A trigger saying no, in a sentence somebody wrote for a human to read.
        return Refused(status=409, reason=reason, kind="refused_on_merits")

    if isinstance(error, psycopg.ProgrammingError) and CANNOT_ADAPT in str(error):
        # THE FLOOR, and the one place this file reads a message rather than a
        # code. That is not the habit the header argues against: that rule is
        # about refusals the DATABASE issues, which all carry a SQLSTATE. This
        # error never reached the database. psycopg failed to turn a Python
        # value into a parameter, and the exception carries sqlstate None.
        #
        # Narrow deliberately. Three unrelated conditions raise ProgrammingError
        # with no SQLSTATE, verified against psycopg 3.3.4:
        #
        #   cannot adapt type 'dict' ...        the caller sent the wrong shape
        #   query parameter missing: x          OUR bug
        #   the query has 2 placeholders ...    OUR bug
        #
        # Keying on "no SQLSTATE" would sweep all three into 400 and tell the
        # caller they made a mistake about our bug — the same failure this
        # branch exists to fix, running backwards. So the last two fall through
        # to the catch-all below and stay 500 'broke', and a test pins that.
        #
        # The value's shape is refused at the boundary by
        # writes.refuse_structured, which names the field. This is the backstop
        # for a bind site that guard has not reached, and it says less because
        # it knows less. The driver's message names the placeholder and is
        # logged, never returned.
        sys.stderr.write(f"value could not be bound as a parameter: {reason}\n")
        return Refused(status=400,
                       reason="a field carried an object or a list where a "
                              "plain value belongs",
                       kind="rejected")

    if isinstance(error, psycopg.Error) and not isinstance(error, psycopg.DataError):
        # A broken statement, failed transaction, or internal database error is
        # the service's fault. Driver detail commonly names tables, columns and
        # constraints, so it belongs in the log and never in the response.
        sys.stderr.write(f"unexpected database error: {reason}\n")
        return Refused(status=500, reason="the database operation failed", kind="broke")

    return Refused(status=400, reason=reason, kind="rejected")
