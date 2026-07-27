"""Seed a database with enough real people to walk the six workspaces.

    python -m doorway.seed_demo

WHAT THIS IS NOT: canned content. Every row it creates is created through the
real path — the bootstrap ceremony, then the Administrator's own acts, through
the doorway, as themselves. Nothing here can produce a state the system could not
reach on its own. That is the difference between a seed and a mockup, and it is
the whole reason the v4 concept's invented rows are imported nowhere.

It creates six accounts, one per role, so somebody can sign in as each and see
their workspace. It creates no deals, no tickets and no clauses: those are acts
for the people in the system to perform, and an empty workspace showing its
honest empty state is the correct first impression. A seeded system that looks
busy is a demo, not a system.

Ported from `backend/service/seed-demo.mjs` on 2026-07-26.
"""

from __future__ import annotations

import os
import sys

import psycopg

from doorway.db import Database
from doorway.setup import OWNER_URL, prepare

APP_URL = os.environ.get(
    "CW_DATABASE_URL", "postgresql://cw_app:clausewerk-dev@localhost:5432/clausewerk")

OWNER = "owner@clausewerk"

PEOPLE = [
    ("a.okafor@clausewerk", "Ada Okafor", "Operations", "administrator"),
    ("r.vance@clausewerk", "Rae Vance", "Legal", "legal_admin"),
    ("p.nkemi@clausewerk", "Pat Nkemi", "Legal", "legal_reviewer"),
    ("d.buyer@clausewerk", "Dana Buyer", "Procurement", "requester"),
    ("t.imani@clausewerk", "Tunde Imani", "Assurance", "auditor"),
    ("s.reed@clausewerk", "Sam Reed", "Supplier", "viewer"),
]

ADMIN = PEOPLE[0][0]
LEGAL = PEOPLE[1][0]


def seed(owner_url: str = OWNER_URL, app_url: str = APP_URL) -> list[dict]:
    """Run the ceremony and create the other four. Returns who can sign in."""
    prepare(owner_url=owner_url)

    with psycopg.connect(owner_url, autocommit=True) as owner:
        already = owner.execute("select count(*) from cw.account").fetchone()[0]
        if already:
            print(f"this database already has {already} account(s); nothing to do.")
            print("the bootstrap ceremony happens once, and accounts are revoked "
                  "rather than deleted.")
            return []

        # The ceremony needs owner rights, which the doorway deliberately cannot
        # reach. This script is installation, not a request — the same asymmetry
        # migrate.py rests on.
        # The ceremony takes ONE unit and gives it to both accounts it creates —
        # see cw.bootstrap's p_unit. It cannot put the first Administrator in
        # Operations and the first Legal admin in Legal, and that is a real limit
        # rather than an oversight: at the moment of the ceremony there is no
        # Administrator yet to say where anybody sits.
        #
        # So the Administrator's unit goes in here, and Rae's is corrected below
        # by the Administrator, as an ordinary recorded act. The alternative —
        # writing it straight in as the owner — would put a row in the system
        # that the system could not have reached on its own, which is the one
        # thing this file exists not to do.
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            (OWNER, PEOPLE[0][0], PEOPLE[0][1], PEOPLE[1][0], PEOPLE[1][1],
             PEOPLE[0][2]),
        )

    db = Database(app_url)
    try:
        # The remaining four, created and granted by the Administrator, through
        # exactly the acts the console performs.
        with db.as_person(ADMIN, "administrator") as request:
            # The correction the ceremony could not make. An ordinary update by
            # the Administrator, audited like any other.
            request.write_one(
                "update cw.account set unit = %s where person = %s",
                (PEOPLE[1][2], PEOPLE[1][0]))

            for person, name, unit, role in PEOPLE[2:]:
                request.write_one(
                    "insert into cw.account (person, display_name, unit, role, "
                    "created_by) values (%s,%s,%s,%s,current_setting('cw.actor'))",
                    (person, name, unit, role))
                request.write_one(
                    "insert into cw.role_grant (action, person, role, reason) "
                    "values ('granted',%s,%s,'seeded for the walkthrough')",
                    (person, role))

        # Pat holds a LEGAL role, so their grant confers nothing until Rae
        # accepts it. Doing this here rather than silently is the point: a
        # walkthrough that skipped the countersign would leave the reviewer
        # unable to sign in, and somebody would "fix" it by removing the rule.
        with db.as_person(LEGAL, "legal_admin") as request:
            grant = request.one(
                "select grant_id from cw.role_grant "
                "where person = %s and action = 'granted'", ("p.nkemi@clausewerk",))
            request.write_one(
                "insert into cw.role_grant (action, person, role, grant_ref) "
                "values ('countersigned','p.nkemi@clausewerk','legal_reviewer',%s)",
                (grant[0],))

        with db.as_person(ADMIN, "administrator") as request:
            return request.rows(
                "select person, display_name, role from cw.effective_role "
                "order by role")
    finally:
        db.close()


def main() -> int:
    effective = seed()
    if not effective:
        return 0

    print("six people, one per role. Sign in as any of them:\n")
    for row in effective:
        print(f"  {row['role']:<15} {row['person']:<24} {row['display_name']}")

    print("""
No deals, tickets or clauses were created. Those are acts for the people above
to perform, and an empty workspace showing its honest empty state is the correct
first impression — a seeded system that looks busy is a demo, not a system.""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
