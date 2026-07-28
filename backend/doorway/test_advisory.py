"""The model seam, proved without a model.

WHAT IS BEING PROVED

  · with no key in the environment, the system does not guess. It records that
    no judgment was obtainable, with a reason, and answers the caller normally.
    This is ADR-0005's discipline in the one place the ADR's usual remedy — a
    deterministic substitute — would be a lie, and it is the path this suite
    exercises for real rather than by mocking it;
  · a caller cannot put a judgment into the record. The score, the basis and
    the model's name are dropped from the request body before anything reads
    it, and the database will not store a number with no model behind it;
  · asking again appends. It does not overwrite;
  · a judgment can only be asked for about a ticket the caller can see, and
    only once there is something to compare.

THE WHOLE SUITE RUNS WITH NO KEY, DELIBERATELY. That is the honest state of a
developer machine and of every automated run, and it is the state in which the
behaviour that matters most — refusing to invent a number — is visible. A suite
that needed a key would be a suite that got skipped.

NOTHING HERE ASSERTS ON A JUDGMENT'S WORDING OR ITS VALUE. A model's opinion is
content, content is placeholder pending review (CLAUDE.md), and a test that pins
it fails on correct work.
"""

from __future__ import annotations

import json
from io import BytesIO

import psycopg
import pytest

from doorway import advisory
from doorway.app import App
from doorway.db import Database
from doorway.identity import Caller

ADMIN = "admin@clausewerk"
LEGAL = "leah@clausewerk"
RITA = "rita@clausewerk"
SAM = "sam@clausewerk"

LEGAL_CALLER = Caller(person=LEGAL, role="legal_admin")
RITA_CALLER = Caller(person=RITA, role="requester")
SAM_CALLER = Caller(person=SAM, role="requester")

# Synthetic, and the point is the machinery rather than the words.
AI_TEXT = "Supplier shall notify Customer within thirty six hours of a breach."
APPROVED = "Supplier shall notify Customer within twenty four hours of a breach."


@pytest.fixture(autouse=True)
def no_key(monkeypatch):
    """No key, on every test in this file, whatever the machine happens to hold.

    Autouse rather than opt-in: a developer with a key exported would otherwise
    make this suite call a paid API — quietly, on every run — and the one test
    that noticed would be the invoice.
    """
    monkeypatch.delenv(advisory.KEY_VARIABLE, raising=False)


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def people(db: Database, owner_url: str):
    """An Administrator, a Legal admin, and two requesters with work of their
    own — two, because "a requester sees their own" cannot be checked with one.
    """
    with psycopg.connect(owner_url, autocommit=True) as owner:
        owner.execute(
            "select cw.bootstrap(%s,%s,%s,%s,%s,%s)",
            ("owner@clausewerk", ADMIN, "The Administrator",
             LEGAL, "Leah Legal", "Legal"),
        )
    with db.as_person(ADMIN, "administrator") as request:
        for person, name in ((RITA, "Rita Requester"), (SAM, "Sam Requester")):
            request.write_one(
                "insert into cw.account (person, display_name, unit, role, created_by)"
                " values (%s, %s, 'Procurement', 'requester', %s)",
                (person, name, ADMIN))
            request.write_one(
                "insert into cw.role_grant (action, person, role, acted_by, reason)"
                " values ('granted', %s, 'requester', %s, 'so there is work to judge')",
                (person, ADMIN))
    with db.as_person(LEGAL, "legal_admin") as request:
        request.write_one(
            "insert into cw.category (key, label, short) values"
            " ('data', 'Data Privacy', 'DP')")
    return db


def open_ticket(db: Database, who: Caller = RITA_CALLER) -> int:
    with db.as_person(who.person, who.role) as request:
        rows = request.rows(
            """insert into cw.review_ticket
                 (category_key, severity, reason_code, provenance_badge, proposed_text)
               values ('data','Standard','ai-draft','AI CANDIDATE', %s)
               returning ticket_id""", (AI_TEXT,))
    return rows[0]["ticket_id"]


_minted = [0]


def decide(db: Database, ticket_id: int, approved: str = APPROVED) -> None:
    _minted[0] += 1
    with db.as_person(LEGAL, "legal_admin") as request:
        request.rows(
            "select cw.verify_review_ticket(%s, %s, %s, 'A title', 'A rationale',"
            " 'L. Reyes', '2028-01-01')",
            (ticket_id, approved, f"DP-S-{800 + _minted[0]}"))


def decided_ticket(db: Database, who: Caller = RITA_CALLER) -> int:
    ticket_id = open_ticket(db, who)
    decide(db, ticket_id)
    return ticket_id


def assessments(db: Database, ticket_id: int) -> list[dict]:
    with db.as_person(LEGAL, "legal_admin") as request:
        return request.rows(
            "select * from cw.advisory_assessment where ticket_id = %s"
            " order by assessment_id", (ticket_id,))


# ── 1. The adapter, on its own ──────────────────────────────────────────────


def test_the_adapter_records_an_absence_rather_than_a_number():
    """The guarantee this whole package rests on.

    With no key there is no judgment, and the honest answer is to say so. A
    substitute figure would be indistinguishable from a real one the moment it
    reached a screen, and that is the failure ADR-0005 exists to prevent.
    """
    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)
    assert judgment.outcome == "absent"
    assert judgment.score is None
    assert judgment.absent_reason, "an absence was recorded without saying why"


def test_an_absence_still_records_what_was_attempted():
    """Provenance is not only for successes. An outage that leaves no trace of
    what was tried is an outage nobody can count afterwards."""
    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)
    assert judgment.model.strip()
    assert judgment.model_version.strip()
    assert judgment.prompt.strip()


def test_the_adapter_names_the_variable_it_reads(monkeypatch):
    """The key comes from the environment and from nowhere else (D-8). Asserted
    on the NAME, not on any value: a key never appears in this repository."""
    assert advisory.KEY_VARIABLE.startswith("CLAUSEWERK_")
    assert advisory.KEY_VARIABLE in advisory.__doc__


def test_the_adapter_never_raises_at_its_caller(monkeypatch):
    """A judgment is advisory. Nothing about it may interrupt the work of the
    person who asked. Given a key that cannot possibly work, the adapter still
    returns rather than raising."""
    monkeypatch.setenv(advisory.KEY_VARIABLE, "not-a-key")
    monkeypatch.setattr(advisory, "ENDPOINT", "https://localhost:1/never")
    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)
    assert judgment.outcome == "absent"


# ── 2. The pipeline, end to end, with no model in the world ─────────────────


def test_the_adapter_bounds_the_providers_response(monkeypatch):
    class Reply(BytesIO):
        def close(self):
            pass

    monkeypatch.setenv(advisory.KEY_VARIABLE, "test-key")
    oversized = Reply(b"x" * (advisory.MAX_RESPONSE_BYTES + 1))
    monkeypatch.setattr(advisory.urllib.request, "urlopen",
                        lambda request, timeout: oversized)

    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)

    assert judgment.outcome == "absent"
    assert "too large" in judgment.absent_reason
    assert oversized.tell() == advisory.MAX_RESPONSE_BYTES + 1


def test_the_adapter_refuses_excessively_nested_provider_json(monkeypatch):
    monkeypatch.setenv(advisory.KEY_VARIABLE, "test-key")
    nested = BytesIO(b"[" * 2_000 + b"]" * 2_000)
    monkeypatch.setattr(advisory.urllib.request, "urlopen",
                        lambda request, timeout: nested)

    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)

    assert judgment.outcome == "absent"
    assert "not readable" in judgment.absent_reason


@pytest.mark.parametrize("score", [True, False, "0.5", None])
def test_the_adapter_does_not_coerce_non_numeric_scores(monkeypatch, score):
    class Reply(BytesIO):
        def close(self):
            pass

    monkeypatch.setenv(advisory.KEY_VARIABLE, "test-key")
    response = json.dumps({
        "model": "test-model",
        "choices": [{"message": {"content": json.dumps(
            {"score": score, "basis": "test"})}}],
    }).encode()
    monkeypatch.setattr(advisory.urllib.request, "urlopen",
                        lambda request, timeout: Reply(response))

    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)

    assert judgment.outcome == "absent"
    assert judgment.score is None


@pytest.mark.parametrize("basis", [{"sentence": "not text"}, ["not", "text"], 7, True])
def test_the_adapter_does_not_stringify_a_structured_basis(monkeypatch, basis):
    class Reply(BytesIO):
        def close(self):
            pass

    monkeypatch.setenv(advisory.KEY_VARIABLE, "test-key")
    response = json.dumps({
        "model": "test-model",
        "choices": [{"message": {"content": json.dumps(
            {"score": 0.5, "basis": basis})}}],
    }).encode()
    monkeypatch.setattr(advisory.urllib.request, "urlopen",
                        lambda request, timeout: Reply(response))

    judgment = advisory.judge_semantic_difference(AI_TEXT, APPROVED)

    assert judgment.outcome == "absent"
    assert judgment.basis is None


def test_a_judgment_asked_for_without_a_model_is_answered_not_refused(people, db):
    answered = advisory.semantic_difference(db, LEGAL_CALLER,
                                            {"ticket_id": decided_ticket(db)})
    assert answered.status == 200, answered.body
    assert answered.body["outcome"] == "absent"


def test_the_absence_lands_in_the_record(people, db):
    ticket_id = decided_ticket(db)
    advisory.semantic_difference(db, LEGAL_CALLER, {"ticket_id": ticket_id})

    held = assessments(db, ticket_id)
    assert len(held) == 1
    assert held[0]["outcome"] == "absent"
    assert held[0]["score"] is None
    assert held[0]["absent_reason"]


def test_the_record_keeps_the_two_texts_it_was_given(people, db):
    """A judgment is only re-checkable if the exact words it was shown are
    beside it."""
    ticket_id = decided_ticket(db)
    advisory.semantic_difference(db, LEGAL_CALLER, {"ticket_id": ticket_id})

    held = assessments(db, ticket_id)[0]
    assert held["baseline_text"] == AI_TEXT
    assert held["compared_text"] == APPROVED


def test_asking_again_appends(people, db):
    ticket_id = decided_ticket(db)
    advisory.semantic_difference(db, LEGAL_CALLER, {"ticket_id": ticket_id})
    advisory.semantic_difference(db, LEGAL_CALLER, {"ticket_id": ticket_id})

    held = assessments(db, ticket_id)
    assert len(held) == 2, "the second judgment replaced the first"


# ── 3. The caller never supplies a judgment ─────────────────────────────────


def test_a_caller_supplied_score_is_not_recorded(people, db):
    """A number in the request body has nowhere to land.

    Two walls, and this test walks into both: the doorway drops the field before
    reading the body, and the database will not store a score on a row that has
    no model behind it.
    """
    ticket_id = decided_ticket(db)
    answered = advisory.semantic_difference(db, LEGAL_CALLER, {
        "ticket_id": ticket_id,
        "score": 0.99,
        "outcome": "recorded",
        "basis": "a basis the caller wrote for themselves",
        "model": "a model the caller named",
    })

    assert answered.status == 200, answered.body
    held = assessments(db, ticket_id)[0]
    assert held["outcome"] == "absent", "the caller decided the outcome"
    assert held["score"] is None, "the caller's number reached the record"
    assert held["model"] != "a model the caller named", (
        "the caller named the model that gave an opinion nobody obtained")


def test_the_fields_a_caller_may_not_speak_are_named_in_one_place():
    """A guard on the test above: if the list is emptied, that test would pass
    while proving nothing."""
    assert "score" in advisory.NOT_THE_CALLER_S_TO_SAY
    assert "outcome" in advisory.NOT_THE_CALLER_S_TO_SAY


# ── 4. What may be judged, and by whom ──────────────────────────────────────


def test_a_ticket_with_no_decision_has_nothing_to_compare(people, db):
    ticket_id = open_ticket(db)
    answered = advisory.semantic_difference(db, LEGAL_CALLER, {"ticket_id": ticket_id})
    assert answered.refused
    assert answered.body["kind"] == "not_yet"
    assert assessments(db, ticket_id) == []


def test_a_request_that_names_no_ticket_is_refused(people, db):
    answered = advisory.semantic_difference(db, LEGAL_CALLER, {})
    assert answered.status == 400


def test_a_requester_cannot_judge_a_stranger_s_ticket(people, db):
    ticket_id = decided_ticket(db, RITA_CALLER)
    answered = advisory.semantic_difference(db, SAM_CALLER, {"ticket_id": ticket_id})
    assert answered.refused
    assert assessments(db, ticket_id) == []


def test_a_requester_can_ask_about_their_own_ticket(people, db):
    ticket_id = decided_ticket(db, RITA_CALLER)
    answered = advisory.semantic_difference(db, RITA_CALLER, {"ticket_id": ticket_id})
    assert answered.status == 200, answered.body


# ── 5. The board shows both figures, kept apart ─────────────────────────────


def test_the_board_carries_the_measurement_and_the_estimate_apart(people, db):
    ticket_id = decided_ticket(db)
    advisory.semantic_difference(db, LEGAL_CALLER, {"ticket_id": ticket_id})

    from doorway.reads import run
    shown = [row for row in run(db, LEGAL_CALLER, "GET /metrics")
             if row["ticket_id"] == ticket_id][0]

    assert shown["measured_edit_similarity"] is not None
    assert shown["judgment_outcome"] == "absent"
    assert shown["estimated_semantic_difference"] is None
    # The two labels exist and are different. Not what they SAY — that is
    # wording, and wording is content. What matters is that a measurement and an
    # estimate cannot arrive wearing the same label.
    assert shown["measurement_label"] and shown["judgment_label"]
    assert shown["measurement_label"] != shown["judgment_label"]


# ── 6. The endpoint is reachable through the front door ─────────────────────


def test_the_endpoint_answers_through_the_service(people, db):
    """One test through App.handle, so the dispatch line is proved rather than
    assumed. Everything above calls the module directly, which is faster and
    says nothing about whether anybody can reach it."""
    ticket_id = decided_ticket(db)
    app = App(db)
    token = app.sign_in(LEGAL).body["token"]
    answered = app.handle("POST", "/advisory/semantic-difference", token=token,
                          body={"ticket_id": ticket_id})
    assert answered.status == 200, answered.body
    assert answered.body["outcome"] == "absent"
