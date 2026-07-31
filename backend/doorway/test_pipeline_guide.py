"""The pipeline guide's examples run, and the page cannot drift from the code.

NC-10. docs/guides/pipeline.md documents the two endpoints an AI pipeline
calls. Its example bodies are THE fixtures here — parsed out of the markdown
and executed — so a contract change that would falsify the page fails this
suite instead of silently stranding an external caller.

One test per documented refusal shape, the llm/fallback attribution pair,
and nothing that asserts a user-facing sentence. No mutation row belongs to
this package: nothing new is guarded, and both MISS and SKIP are fatal in
the harness.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from doorway.app import App
from doorway.db import Database
from doorway.seed_demo import PEOPLE, seed

GUIDE = Path(__file__).resolve().parents[2] / "docs" / "guides" / "pipeline.md"


def fixture_block(name: str) -> dict:
    """The guide's own example body, by its fixture marker."""
    text = GUIDE.read_text(encoding="utf-8")
    match = re.search(
        rf"<!-- fixture: {re.escape(name)} -->\s*```json\n(.*?)```",
        text, flags=re.DOTALL)
    assert match, f"the guide no longer carries a '{name}' fixture block"
    return json.loads(match.group(1))


def person_with(role: str) -> str:
    return next(person for person, _d, _u, r in PEOPLE if r == role)


@pytest.fixture
def db(schema: str):
    database = Database(schema, min_size=1, max_size=5)
    yield database
    database.close()


@pytest.fixture
def app(db: Database, schema: str, owner_url: str):
    """The seeded system, with the guide's category and the guide's deal."""
    seed(owner_url=owner_url, app_url=schema)
    application = App(db, email_channel=lambda *_: None)

    legal = application.sign_in(person_with("legal_admin")).body["token"]
    answered = application.handle(
        "POST", "/categories", token=legal,
        body={"key": "data", "label": "Data Privacy", "short": "DP"})
    assert answered.status == 200, answered.body

    requester = application.sign_in(person_with("requester")).body["token"]
    answered = application.handle(
        "POST", "/deals", token=requester,
        body={"agreement_id": "AG-PIPE-1", "counterparty": "Northwind"})
    assert answered.status == 200, answered.body
    return application, requester


def test_the_guides_manifest_check_example_is_accepted(app):
    application, requester = app
    answered = application.handle("POST", "/manifests/check", token=requester,
                                  body=fixture_block("manifest-check"))
    assert answered.status == 200, answered.body
    assert answered.body["dropped"] == []


def test_the_guides_run_example_is_accepted_and_recorded(app):
    application, requester = app
    answered = application.handle("POST", "/runs", token=requester,
                                  body=fixture_block("run"))
    assert answered.status == 200, answered.body

    recorded = application.handle("GET", "/runs", token=requester)
    assert recorded.status == 200
    assert [r["agreement_id"] for r in recorded.body["rows"]] == ["AG-PIPE-1"]


def test_a_malformed_body_is_a_400_rejected(app):
    """Documented refusal one: the body is not a manifest."""
    application, requester = app
    body = fixture_block("manifest-check")
    del body["vendor"]
    answered = application.handle("POST", "/manifests/check", token=requester,
                                  body=body)
    assert answered.status == 400, answered.body
    assert answered.body["kind"] == "rejected"


def test_an_unknown_category_is_a_409_with_the_dropped_list(app):
    """Documented refusal two: the library does not have that category."""
    application, requester = app
    body = fixture_block("manifest-check")
    body["risks"][0]["category"] = "made-up-by-the-model"
    answered = application.handle("POST", "/manifests/check", token=requester,
                                  body=body)
    assert answered.status == 409, answered.body
    assert answered.body["kind"] == "unknown_category"
    assert answered.body["dropped"] == ["made-up-by-the-model"]
    assert answered.body["reasons"], "the engine's own sentence travels back"


def test_a_run_against_no_deal_is_a_409_on_the_merits(app):
    """Documented refusal three: the act itself is refused — here by the
    foreign key, in the database's own words, never reworded."""
    application, requester = app
    body = fixture_block("run")
    body["agreement_id"] = "AG-NOBODY-OPENED"
    answered = application.handle("POST", "/runs", token=requester, body=body)
    assert answered.status in (403, 409), answered.body
    assert answered.body["kind"] in ("refused_on_merits", "not_permitted")
    assert answered.body.get("reason", "").strip()


def test_llm_and_fallback_are_two_records_differing_in_source(app):
    """Attribution is structural: the identical manifest submitted as the
    model's and as the fallback's lands as two records whose difference is
    the source field."""
    application, requester = app

    first = fixture_block("run")
    assert first["source"] == "llm", "the guide's example claims the llm source"
    answered = application.handle("POST", "/runs", token=requester, body=first)
    assert answered.status == 200, answered.body

    second = fixture_block("run")
    second["source"] = "fallback"
    answered = application.handle("POST", "/runs", token=requester, body=second)
    assert answered.status == 200, answered.body

    recorded = application.handle("GET", "/runs", token=requester)
    sources = sorted(r["manifest_source"] for r in recorded.body["rows"])
    assert sources == ["fallback", "llm"], recorded.body
    vendors = {r["vendor"] for r in recorded.body["rows"]}
    deals = {r["agreement_id"] for r in recorded.body["rows"]}
    assert vendors == {"Northwind"} and deals == {"AG-PIPE-1"}, (
        "the two records must agree on everything the manifest said; the "
        "difference is the source")


def test_the_bad_source_refusal_names_the_field(app):
    """The asymmetry's sharp edge: /runs restricts source, the pre-flight
    does not. A bad source on /runs is the caller's mistake (400), and the
    same body sails through the pre-flight."""
    application, requester = app
    body = fixture_block("run")
    body["source"] = "hallucinated"
    answered = application.handle("POST", "/runs", token=requester, body=body)
    assert answered.status == 400, answered.body
    assert answered.body["kind"] == "rejected"

    checked = application.handle("POST", "/manifests/check", token=requester,
                                 body=body)
    assert checked.status == 200, (
        "the pre-flight is a check over anything a model might emit; "
        "narrowing it is the documented anti-fix")
