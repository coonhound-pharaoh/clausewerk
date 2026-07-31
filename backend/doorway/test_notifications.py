"""The notification tick (OB-10): derive, send, record — proven end to end.

What these tests hold the tick to:

  · Authority is the SCHEMA's. A legal admin running the tick is refused by
    cw.assert_may_run_notifications with a 403, before any send.
  · One derivation. The digest carries exactly what cw.waiting_for answers —
    kinds, references, dates — and NEVER content: the proposed clause text
    that put the ticket on the list must not appear in the email.
  · One sent digest per person per day. A second tick the same day records
    nothing and sends nothing.
  · A person nobody can reach is not an error and not a send — they are a row
    in cw.notification_gap, the visible-silence surface.
  · A channel failure is an OUTCOME on the outbox row, never an exception and
    never silence.

Requires the compose PostgreSQL, like every doorway suite:

    docker compose up -d
    python -m pytest doorway/test_notifications.py
"""

from __future__ import annotations

from datetime import date
from concurrent.futures import ThreadPoolExecutor
import threading
import time

import psycopg
import pytest

from doorway import notifications
from doorway.db import Database
from doorway.identity import Caller

ADMIN = "admin@clausewerk"
LEAH = "leah@clausewerk"

TICKET_TEXT = "Supplier shall notify Customer within seventy-two (72) hours."


@pytest.mark.parametrize("configured", [
    "smtp://[broken",
    "smtp://mail.example:not-a-port",
    "https://mail.example:443",
    "smtp://user:secret@mail.example:25",
    "smtp://mail.example:25/unexpected/path",
])
def test_invalid_smtp_configuration_becomes_a_channel_failure(
    monkeypatch, configured
):
    monkeypatch.setenv("CW_SMTP_URL", configured)

    channel = notifications.channel_from_env()

    with pytest.raises(RuntimeError, match="configured email channel"):
        channel("person@example.com", "subject", "body")


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def seeded(db: Database, owner_url: str):
    """The ceremony's two people, and one pending ticket waiting on Legal."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute("select set_config('cw.actor','owner@clausewerk',false)")
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            ("owner@clausewerk", ADMIN, "The Administrator",
             LEAH, "Leah Legal", "Legal"))
        owner.execute(
            "insert into cw.category (key,label,short) values ('data','Data Privacy','DP')")
        owner.execute(
            "insert into cw.review_ticket "
            "  (agreement_id,category_key,severity,reason_code,provenance_badge,"
            "   proposed_text,opened_by) "
            "values (null,'data','High','human-escalated','VENDOR LANGUAGE',%s,"
            "        'someone@clausewerk')", (TICKET_TEXT,))
    return db


def recording_channel():
    """A channel that keeps what it was asked to send."""
    sends: list[tuple[str, str, str]] = []

    def send(address: str, subject: str, body: str) -> None:
        sends.append((address, subject, body))

    return sends, send


def outbox(db: Database) -> list[dict]:
    with db.as_person(ADMIN, "administrator") as request:
        return request.rows(
            "select person, kind, outcome, failure, refs::text as refs "
            "from cw.notification_outbox order by outbox_id")


def set_address(db: Database, person: str, address: str) -> None:
    with db.as_person(ADMIN, "administrator") as request:
        request.write_one(
            "insert into cw.notification_address (person, channel, address, set_by) "
            "values (%s, 'email', %s, 'x')", (person, address))


def test_the_tick_is_the_administrators_act(seeded: Database):
    sends, channel = recording_channel()
    answered = notifications.tick(seeded, Caller(LEAH, "legal_admin"), channel)
    assert answered.status == 403
    assert "Administrator" in answered.body["reason"]
    assert sends == [], "a refused tick must not have talked to the channel first"


def test_nobody_reachable_is_a_gap_not_a_send(seeded: Database):
    sends, channel = recording_channel()
    answered = notifications.tick(seeded, Caller(ADMIN, "administrator"), channel)
    assert answered.status == 200
    assert answered.body["people_with_work_waiting"] >= 1
    assert answered.body["unreachable"] >= 1
    assert answered.body["sent"] == 0 and sends == []
    assert outbox(seeded) == [], "no attempt was possible, so no outcome is invented"
    with seeded.as_person(ADMIN, "administrator") as request:
        gap = request.rows("select person from cw.notification_gap")
    assert any(row["person"] == LEAH for row in gap), (
        "the silence must be visible where somebody is looking")


def test_the_digest_carries_references_and_never_content(seeded: Database):
    set_address(seeded, LEAH, "leah@example.com")
    sends, channel = recording_channel()
    answered = notifications.tick(seeded, Caller(ADMIN, "administrator"), channel)
    assert answered.status == 200 and answered.body["sent"] == 1

    (address, subject, body), = [s for s in sends if s[0] == "leah@example.com"]
    assert "review_ticket" in body, "the kind and reference are the message"
    assert TICKET_TEXT not in body, (
        "clause text in an email leaves every protection in the schema behind — "
        "the assembler must not even have it to leak")
    assert TICKET_TEXT not in subject

    rows = outbox(seeded)
    assert [(r["person"], r["kind"], r["outcome"]) for r in rows] == [
        (LEAH, "digest", "sent")]
    assert "review_ticket" in rows[0]["refs"]
    assert TICKET_TEXT not in rows[0]["refs"]


def test_one_digest_a_day(seeded: Database):
    set_address(seeded, LEAH, "leah@example.com")
    sends, channel = recording_channel()
    notifications.tick(seeded, Caller(ADMIN, "administrator"), channel)
    again = notifications.tick(seeded, Caller(ADMIN, "administrator"), channel)
    assert again.status == 200
    assert again.body["already_sent_today"] >= 1
    assert again.body["sent"] == 0
    assert len(sends) == 1, "the second tick must not have sent a second copy"


def test_concurrent_ticks_share_one_delivery_claim(seeded: Database):
    set_address(seeded, LEAH, "leah@example.com")
    starts = threading.Barrier(2)
    sends: list[str] = []
    sends_lock = threading.Lock()

    def slow_channel(address: str, subject: str, body: str) -> None:
        with sends_lock:
            sends.append(address)
        time.sleep(0.15)

    def run_tick():
        starts.wait()
        return notifications.tick(
            seeded, Caller(ADMIN, "administrator"), slow_channel)

    with ThreadPoolExecutor(max_workers=2) as workers:
        answers = list(workers.map(lambda _: run_tick(), range(2)))

    assert all(answer.status == 200 for answer in answers)
    assert len(sends) == 1, "overlapping ticks must not both reach the channel"
    assert sum(answer.body["sent"] for answer in answers) == 1
    assert sum(answer.body["delivery_in_progress"] for answer in answers) == 1
    assert [row["outcome"] for row in outbox(seeded)] == ["sent"]


def test_a_channel_failure_is_an_outcome_not_an_exception(seeded: Database):
    set_address(seeded, LEAH, "leah@example.com")

    def broken(address: str, subject: str, body: str) -> None:
        raise RuntimeError("mailbox full")

    answered = notifications.tick(seeded, Caller(ADMIN, "administrator"), broken)
    assert answered.status == 200
    assert answered.body["failed"] == 1
    rows = outbox(seeded)
    assert [(r["outcome"], r["failure"]) for r in rows] == [("failed", "mailbox full")]


def test_a_failed_delivery_may_be_retried_the_same_day(seeded: Database):
    set_address(seeded, LEAH, "leah@example.com")

    def broken(address: str, subject: str, body: str) -> None:
        raise RuntimeError("mailbox full")

    notifications.tick(seeded, Caller(ADMIN, "administrator"), broken)
    sends, channel = recording_channel()
    retried = notifications.tick(seeded, Caller(ADMIN, "administrator"), channel)
    assert retried.body["sent"] == 1, "a failure is not a delivery; the retry is owed"
    outcomes = [r["outcome"] for r in outbox(seeded)]
    assert outcomes == ["failed", "sent"]
