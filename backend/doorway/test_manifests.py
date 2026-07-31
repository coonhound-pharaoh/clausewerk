"""The contract engine, connected — and refusing, through the doorway, on the record.

WHAT IS BEING PROVED

A manifest naming a risk category the library does not have is refused **by the
engine**, **through the doorway**, **with the refusal recorded**. All three, or
the connection is decoration.

  · by the engine       — the sentence that comes back is the engine's own, and
                          the refusal disappears if the engine stops refusing
  · through the doorway — over a socket, as a real person, with the caller's own
                          role deciding what library they can even see
  · recorded            — an unrecorded refusal is invisible to the audit record,
                          and the point of the check is that the record shows it

THE FAILURE THIS CHECK EXISTS TO PREVENT

An invented category reaching resolution produces "no clause available in
Ledger", which reads as a LIBRARY COVERAGE GAP — Legal told to write a clause for
a category nobody defined. "The model invented a category" and "we have no clause
for that category" are different faults and go to different people.
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from doorway.seed_demo import seed
from doorway.server import serve

SCREENS = Path(__file__).resolve().parents[2] / "prototype" / "v4"

ADMIN = "a.okafor@clausewerk"
LEGAL = "r.vance@clausewerk"
DANA = "d.buyer@clausewerk"
SAM = "s.reed@clausewerk"

KNOWN = ("Data Privacy", "Liability")


class Client:
    def __init__(self, base: str):
        self.base = base
        self.token: str | None = None

    def call(self, method: str, path: str, body=None):
        request = urllib.request.Request(
            self.base + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"content-type": "application/json",
                     **({"authorization": f"Bearer {self.token}"} if self.token else {})})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read() or b"null")
        except urllib.error.HTTPError as refused:
            return refused.code, json.loads(refused.read() or b"null")

    def sign_in(self, person: str):
        status, body = self.call("POST", "/api/sign-in", {"person": person})
        if status == 200:
            self.token = body["token"]
        assert status == 200, f"{person} could not sign in: {body}"
        return self


@pytest.fixture
def running(schema: str, owner_url: str):
    seed(owner_url=owner_url, app_url=schema)
    server = serve(schema, port=0, static=str(SCREENS))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    # A library with two categories in it. Created by the Legal admin, through
    # the endpoint, as themselves — deciding which risks the library covers is a
    # judgement about the library, and the seed deliberately makes none.
    legal = Client(base).sign_in(LEGAL)
    for key, label, short in (("data", "Data Privacy", "DP"),
                              ("liab", "Liability", "LB")):
        status, body = legal.call("POST", "/api/categories",
                                  {"key": key, "label": label, "short": short})
        assert status == 200, body
    try:
        yield base
    finally:
        server.shutdown()
        server.server_close()
        server.database.close()
        thread.join(timeout=5)


def manifest(*categories: str) -> dict:
    return {
        "vendor": "Northwind",
        "value": "250000",
        "source": "llm",
        "risks": [{"category": category, "severity": "Standard",
                   "justification": "assembled from the vendor's paper"}
                  for category in categories],
    }


def test_manifest_risk_fan_out_is_bounded_before_normalization():
    from doorway.manifests import MAX_RISKS, Malformed, manifest_from

    oversized = manifest(*(["Data Privacy"] * (MAX_RISKS + 1)))

    with pytest.raises(Malformed, match=str(MAX_RISKS)):
        manifest_from(oversized)


def chain(client: Client) -> list[dict]:
    status, body = client.call("GET", "/api/record")
    assert status == 200, body
    return body["rows"]


# ── The refusal ─────────────────────────────────────────────────────────────


def test_an_invented_category_is_refused(running):
    """The whole package in one test."""
    dana = Client(running).sign_in(DANA)
    status, body = dana.call("POST", "/api/manifests/check",
                             manifest("Data Privacy", "Quantum Indemnity"))

    assert status == 409, f"an invented category was not refused: {status} {body}"
    assert body["error"] == "refused"
    assert body["dropped"] == ["Quantum Indemnity"]


def test_the_refusal_is_the_engine_s_own_words(running):
    """Not a sentence written here. If the doorway ever starts wording these
    itself, that sentence has to be kept in step with the engine forever — and
    the first thing to go is the part that says WHY."""
    from engine.manifest import CategoryMap, UnknownCategory

    # What the engine says, asked directly.
    engine_says = None
    try:
        CategoryMap.from_rows([{"key": "data", "label": "Data Privacy"}]) \
            .key_for("Quantum Indemnity")
    except UnknownCategory as unknown:
        engine_says = str(unknown)
    assert engine_says, "the engine no longer refuses an unknown category at all"

    dana = Client(running).sign_in(DANA)
    _, body = dana.call("POST", "/api/manifests/check",
                        manifest("Data Privacy", "Quantum Indemnity"))

    assert body["reason"] == engine_says, (
        f"the doorway answered {body['reason']!r}; the engine's own sentence is "
        f"{engine_says!r}. The refusal has been reworded on the way out."
    )


def test_the_refusal_is_recorded(running):
    """An unrecorded refusal is invisible to the audit record, and the point of
    the check is that the record shows it happened."""
    dana = Client(running).sign_in(DANA)
    dana.call("POST", "/api/manifests/check",
              manifest("Data Privacy", "Quantum Indemnity"))

    recorded = [row for row in chain(Client(running).sign_in(ADMIN))
                if row["event_type"] == "manifest_refused"]

    assert recorded, "the engine refused and the chain says nothing about it"
    assert recorded[0]["actor"] == DANA, (
        f"the refusal was recorded against {recorded[0]['actor']}; it was "
        f"{DANA} who submitted the manifest")
    assert recorded[0]["subject"] == "Northwind"


def test_the_recorded_refusal_names_what_was_dropped_and_who_checked_it(running):
    """The record has to be readable a year later by somebody who was not
    here."""
    Client(running).sign_in(DANA).call(
        "POST", "/api/manifests/check", manifest("Data Privacy", "Quantum Indemnity"))

    admin = Client(running).sign_in(ADMIN)
    _, body = admin.call("GET", "/api/record")
    refusal = next(row for row in body["rows"]
                   if row["event_type"] == "manifest_refused")
    payload = refusal["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)

    assert payload["dropped"] == ["Quantum Indemnity"]
    assert payload["checked_by"] == "engine.manifest.check_manifest"
    assert payload["risks_submitted"] == 2
    assert "Quantum Indemnity" in payload["reason"]


def test_several_invented_categories_are_all_named(running):
    """Reporting only the first would make the second one a surprise on the next
    attempt."""
    dana = Client(running).sign_in(DANA)
    _, body = dana.call("POST", "/api/manifests/check",
                        manifest("Data Privacy", "Quantum Indemnity", "Astral Risk"))

    assert sorted(body["dropped"]) == ["Astral Risk", "Quantum Indemnity"]
    assert len(body["reasons"]) == 2


# ── The control ─────────────────────────────────────────────────────────────


def test_a_manifest_of_known_categories_passes_through(running):
    """The guard on every test above. If everything were refused, they would all
    pass while the product refused all its work."""
    dana = Client(running).sign_in(DANA)
    status, body = dana.call("POST", "/api/manifests/check", manifest(*KNOWN))

    assert status == 200, f"a manifest of known categories was refused: {body}"
    assert body["dropped"] == []
    assert [risk["category"] for risk in body["risks"]] == list(KNOWN)


def test_a_manifest_that_passes_is_recorded_as_checked_and_not_as_refused(running):
    """Both outcomes reach the chain, and they are told apart by name. What
    crossed the trust boundary, and what the engine made of it, is exactly what
    an auditor would want and could not reconstruct from refusals alone."""
    Client(running).sign_in(DANA).call(
        "POST", "/api/manifests/check", manifest(*KNOWN))

    recorded = chain(Client(running).sign_in(ADMIN))
    assert not [row for row in recorded if row["event_type"] == "manifest_refused"], (
        "a manifest that passed was recorded as refused")
    checked = [row for row in recorded if row["event_type"] == "manifest_checked"]
    assert checked, "a manifest crossed the boundary and left no trace"
    assert checked[0]["actor"] == DANA


def test_severity_is_coerced_rather_than_trusted(running):
    """The engine's other job at this boundary: anything that is not exactly
    'High' is Standard. Coercing an unrecognised severity UP would let a model
    block a contract by typo."""
    dana = Client(running).sign_in(DANA)
    body = {"vendor": "Northwind", "risks": [
        {"category": "Data Privacy", "severity": "CRITICAL!!"},
        {"category": "Liability", "severity": "High"}]}
    status, answered = dana.call("POST", "/api/manifests/check", body)

    assert status == 200, answered
    got = {risk["category"]: risk["severity"] for risk in answered["risks"]}
    assert got["Data Privacy"] == "Standard", (
        f"an unrecognised severity became {got['Data Privacy']!r}")
    assert got["Liability"] == "High"


# ── The doorway's own rules still apply ─────────────────────────────────────


def test_a_role_that_may_not_record_cannot_check_a_manifest_at_all(running):
    """A viewer CAN read the category list — a category is the library's
    structure, not its content, and reading it is granted to everybody. What a
    viewer cannot do is write to the audit chain.

    Every check is recorded, so that grant is what decides who may use this
    endpoint, uniformly. The alternative — recording only refusals — let a viewer
    through whenever the model happened not to hallucinate, and gave them a
    refusal about the audit chain when it did. Two different answers to "may I
    use this", chosen by the model.
    """
    sam = Client(running).sign_in(SAM)
    status, body = sam.call("POST", "/api/manifests/check", manifest(*KNOWN))

    assert status in (403, 409), f"a viewer got {status}: {body}"
    assert body["error"] == "refused"
    assert body["reason"].strip()


def test_a_body_that_is_not_a_manifest_is_the_caller_s_mistake(running):
    """400, not 409. "You sent nonsense" and "the engine refused this" are
    different sentences for different people."""
    dana = Client(running).sign_in(DANA)
    for wrong in ({}, {"vendor": "Northwind"}, {"vendor": "", "risks": []},
                  {"vendor": "Northwind", "risks": [{"severity": "High"}]}):
        status, body = dana.call("POST", "/api/manifests/check", wrong)
        assert status == 400, f"{wrong} answered {status} {body}"
        assert body["kind"] == "rejected"


def test_no_session_reaches_the_engine_at_all(running):
    status, body = Client(running).call(
        "POST", "/api/manifests/check", manifest(*KNOWN))
    assert status == 401
    assert body["error"] == "no session"


# ── The engine was not edited to make this fit ──────────────────────────────
#
# RETIRED 2026-07-27, with its reason, the way any guarantee leaves this suite.
#
# `test_the_engine_is_untouched_by_this_connection` diffed backend/engine
# against the commit where the port began (648d2cf) and failed if anything had
# changed. It certified a claim about WP-P6 — the doorway CONNECTS the engine,
# it does not edit it — and at the moment that package closed, the claim was
# true and the test had proved it.
#
# But a diff against a fixed commit does not distinguish "edited to make the
# port fit" from "improved for its own sake, afterwards". Once the port was
# complete and the engine's own defect-sweep began fixing real engine bugs
# (unopenable documents, a validation gap the migrations had recorded), this
# test failed on work it was never meant to police, and would have gone on
# failing for every legitimate engine change forever.
#
# The property it protected is a property OF THE PORT, already certified, in
# history, at that commit. It is not a property of the engine's future.
