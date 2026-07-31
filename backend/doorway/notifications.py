"""The notification tick — derive, send, record. (OB-10)

WHAT THIS MODULE DOES, in the order it does it:

  1. Ask the schema whether the caller may run the tick at all
     (cw.assert_may_run_notifications — the Administrator's act, enforced in
     the database, never by an `if role ==` here).
  2. For every person with an effective role: derive what is waiting on them,
     fresh, from cw.waiting_for — the SAME derivation the workspace panel
     reads, so the email and the screen cannot disagree.
  3. Send one digest per person per day, through the channel seam, and record
     what happened in cw.notification_outbox — sent or failed, never silence.

THE B2 RULE, LOAD-BEARING HERE. `Database.as_person` holds one transaction for
its whole block, and a mail server is exactly the kind of slow outside party
that rule exists for. So every send happens BETWEEN blocks: read what is
needed, leave the transaction, talk to the channel, open a fresh transaction
to record the outcome. A hung mail server stalls this loop; it never holds a
database connection hostage.

REFERENCES ONLY, BY CONSTRUCTION. The digest assembler receives kinds,
reference ids and dates from cw.waiting_for — it has no access to clause
text, negotiation positions or document content, so it cannot leak what it
was never handed. The wording of the digest itself is content: placeholder,
and never tested for its words.

IDEMPOTENT BY CLAIM THEN OUTBOX. Before talking to the channel, a tick takes an
atomic, expiring delivery claim (0054). Concurrent ticks therefore cannot both
send. The append-only outbox remains the record of sent and failed attempts;
failures release the claim and may be retried by the next tick.

WHO RUNS IT. An external scheduler (OS cron, deployment timer) POSTs
/notifications/tick on an Administrator's session. There is no thread, no
timer and no daemon in here — a schedule the service kept itself would be one
more silent state-mover, and this repository has caught two of those already.

IMMEDIATE SENDS. The governed immediate list (D-3) is stored as an
operational setting. The occurrence paths that will consult it — an override
being socialised, an envelope completing — arrive with the packages that own
those events (OB-13's adapter above all). The machinery they will call is
what this module provides.
"""

from __future__ import annotations

import json
import os
import smtplib
import uuid
from dataclasses import dataclass
from datetime import date
from email.message import EmailMessage
from typing import Callable
from urllib.parse import urlparse

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import classify

# (address, subject, body) -> None; raises on failure. The whole seam.
Channel = Callable[[str, str, str], None]

# SMTP has a 30-second timeout per person. Without an invocation ceiling, one
# Administrator tick can spend that timeout once for every account in the
# database. Deferred people remain unsent and therefore eligible next tick.
MAX_DELIVERY_ATTEMPTS_PER_TICK = 4


def channel_from_env() -> Channel:
    """The email channel the deployment configured, or an honest refusal.

    CW_SMTP_URL, shaped smtp://host:port. Unset — which is every development
    machine — yields a channel whose every send fails with a reason that says
    so. The failure lands on the outbox row, where somebody will read it;
    swallowing it would make an unconfigured system indistinguishable from a
    working one.
    """
    url = os.environ.get("CW_SMTP_URL", "").strip()
    if not url:
        def unconfigured(address: str, subject: str, body: str) -> None:
            raise RuntimeError("no email channel is configured (CW_SMTP_URL is unset)")
        return unconfigured

    def unavailable(reason: str) -> Channel:
        def fail(address: str, subject: str, body: str) -> None:
            raise RuntimeError(reason)
        return fail

    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or 25
    except ValueError:
        return unavailable("the configured email channel URL is malformed")
    if (parsed.scheme != "smtp" or not host
            or parsed.username is not None or parsed.password is not None
            or parsed.path not in ("", "/") or parsed.params
            or parsed.query or parsed.fragment):
        return unavailable(
            "the configured email channel must be an smtp://host:port URL")
    sender = os.environ.get("CW_SMTP_FROM", "clausewerk@localhost")

    def send(address: str, subject: str, body: str) -> None:
        message = EmailMessage()
        message["From"] = sender
        message["To"] = address
        message["Subject"] = subject
        message.set_content(body)
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.send_message(message)

    return send


@dataclass(frozen=True)
class Answered:
    status: int
    body: dict


def _digest(waiting: list[dict]) -> tuple[str, str, str]:
    """Subject, body, and the refs JSON — references and dates, nothing else."""
    lines = []
    refs = []
    for item in waiting:
        due = f" (due {item['due_on']})" if item.get("due_on") else ""
        lines.append(f"  - {item['kind']}: {item['subject_ref']}{due}")
        refs.append({"kind": item["kind"], "ref": item["subject_ref"],
                     "due": item.get("due_on")})
    subject = f"Clausewerk: {len(waiting)} item(s) waiting on you"
    body = ("The following is waiting on you in Clausewerk.\n"
            "Open your workspace to act on any of them.\n\n"
            + "\n".join(lines) + "\n")
    return subject, body, json.dumps(refs)


def tick(db: Database, caller: Caller, channel: Channel,
         today: date | None = None) -> Answered:
    """One pass: everyone owed a digest today gets exactly one attempt."""
    day = today or date.today()

    try:
        with db.as_person(caller.person, caller.role) as request:
            # The schema says who may run this, in its own words.
            request.rows("select cw.assert_may_run_notifications()")
            people = request.rows(
                "select person, role from cw.effective_role order by person")
    except psycopg.Error as error:
        refused = classify(error)
        return Answered(refused.status, refused.as_body())

    digested = sent = failed = already = in_progress = unreachable = deferred = 0
    delivery_attempts = 0

    for person in people:
        # Read everything this person's attempt needs, then LEAVE the
        # transaction before any channel talk (B2).
        with db.as_person(caller.person, caller.role) as request:
            waiting = request.rows(
                "select kind, subject_ref, due_on::text as due_on, since "
                "from cw.waiting_for(%s, %s) "
                "order by due_on nulls last, kind, subject_ref",
                (person["person"], person["role"]))
            if not waiting:
                continue
            digested += 1
            sent_today = request.rows(
                "select 1 from cw.notification_outbox "
                "where person = %s and channel = 'email' and sent_on = %s "
                "  and kind = 'digest' and outcome = 'sent'",
                (person["person"], day))
            address_rows = request.rows(
                "select address from cw.notification_address "
                "where person = %s and channel = 'email' and removed_at is null",
                (person["person"],))

        if sent_today:
            already += 1
            continue
        if not address_rows:
            # No attempt, no outbox row: cw.notification_gap is the surface
            # for this, and it is derived from the same sources — recording a
            # "failure" for a send that was never possible would double-count
            # the one fact.
            unreachable += 1
            continue
        if delivery_attempts >= MAX_DELIVERY_ATTEMPTS_PER_TICK:
            deferred += 1
            continue

        # Claim before the outside call. The upsert may replace only an expired
        # lease, and RETURNING is empty for a live competing claim. No database
        # connection remains checked out while the channel runs (B2).
        claim_token = uuid.uuid4()
        with db.as_person(caller.person, caller.role) as request:
            claimed = request.rows(
                "insert into cw.notification_delivery_claim "
                "  (person, channel, sent_on, kind, claim_token, expires_at) "
                "values (%s, 'email', %s, 'digest', %s, now() + interval '5 minutes') "
                "on conflict (person, channel, sent_on, kind) do update "
                "set claim_token = excluded.claim_token, claimed_at = now(), "
                "    expires_at = excluded.expires_at "
                "where cw.notification_delivery_claim.expires_at <= now() "
                "returning claim_token",
                (person["person"], day, claim_token))
        if not claimed:
            in_progress += 1
            continue

        delivery_attempts += 1
        subject, body, refs = _digest(waiting)
        outcome, failure = "sent", None
        try:
            channel(address_rows[0]["address"], subject, body)
        except Exception as error:  # the channel is an outside party; any
            # failure is an outcome to record, never an exception to leak
            outcome, failure = "failed", str(error)[:500]

        try:
            with db.as_person(caller.person, caller.role) as request:
                request.write_one(
                    "insert into cw.notification_outbox "
                    "  (person, channel, sent_on, kind, refs, outcome, failure) "
                    "values (%s, 'email', %s, 'digest', %s, %s, %s)",
                    (person["person"], day, refs, outcome, failure))
                request.write_one(
                    "delete from cw.notification_delivery_claim "
                    "where person = %s and channel = 'email' and sent_on = %s "
                    "  and kind = 'digest' and claim_token = %s",
                    (person["person"], day, claim_token))
        except psycopg.Error as error:
            refused = classify(error)
            return Answered(refused.status, refused.as_body())

        if outcome == "sent":
            sent += 1
        else:
            failed += 1

    return Answered(200, {
        "day": day.isoformat(),
        "people_with_work_waiting": digested,
        "sent": sent,
        "failed": failed,
        "already_sent_today": already,
        "delivery_in_progress": in_progress,
        "unreachable": unreachable,
        "deferred_by_delivery_limit": deferred,
    })
