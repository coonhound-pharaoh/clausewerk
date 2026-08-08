"""The contract as a file, and the round trip that earns it.

THE SERVICE-LEVEL ROUND TRIP, NAMED AS DISTINCT FROM THE ENGINE-LEVEL ONE

db/test/writer-sql.test.mjs already proves 'the round-tripped snapshot id is
unchanged' — engine output inserted into a schema and rebuilt by the engine,
with no service in between. The test below is the other half: a run recorded
THROUGH POST /runs and rebuilt THROUGH GET /runs/contract, over a socket, as the
same person, on the doorway's own connections and under the caller's own row
rules. Neither subsumes the other, and both are named so nobody deletes one
believing it duplicates the other.

WHAT ELSE IS PROVED HERE

  · no document is produced from a run that did not just prove it reproduces
  · a run that is not yours produces a refusal, never a partial file
  · two downloads of one run are byte-identical, which is what the fixed date
    buys and is the whole reason the record can name a fingerprint
  · the record names the fingerprint of the exact bytes that left
  · nothing is stored
"""

from __future__ import annotations

import hashlib
import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from doorway.app import DOCX_TYPE
from doorway.seed_demo import seed
from doorway.server import serve
from doorway.test_runs import (
    ADMIN, DANA, DEAL, LEGAL_ADMIN, REVIEWER, SAM, TUNDE, Client, as_person,
    manifest,
)
from engine.manifest import UnknownCategory

SCREENS = Path(__file__).resolve().parents[2] / "prototype" / "v4"


def download(base: str, token: str, run: str):
    """A download over the wire, kept raw. Returns (status, headers, bytes)."""
    request = urllib.request.Request(
        f"{base}/api/runs/contract?run={urllib.request.quote(run)}",
        method="GET", headers={"authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request) as reply:
            return reply.status, dict(reply.headers), reply.read()
    except urllib.error.HTTPError as refused:
        return refused.code, dict(refused.headers), refused.read()


def refusal(raw: bytes) -> dict:
    return json.loads(raw or b"null")


# The library fixture from test_runs.py, imported wholesale rather than copied:
# a second synthetic catalogue would drift from the first and the two suites
# would stop describing the same system.
from doorway.test_runs import library, running  # noqa: E402,F401


def record_a_run(base: str, person: str = DANA) -> tuple[Client, dict]:
    client = Client(base).sign_in(person)
    status, body = client.call("POST", "/api/runs",
                               manifest("Data Privacy", "Liability"))
    assert status == 200, body
    return client, body


# ── The round trip ──────────────────────────────────────────────────────────


def test_a_run_recorded_through_the_service_rebuilds_through_the_service(
    library, schema
):
    """The one this package exists for.

    NON-VACUITY FIRST. A snapshot with no members and no rungs rebuilds
    trivially and would make every assertion below true of nothing.
    """
    client, run = record_a_run(library)
    assert run["rules_consulted"] >= 1, "no rules were consulted — vacuous"

    with as_person(schema, TUNDE, "auditor") as request:
        members = request.one(
            "select count(*) from cw.snapshot_member where snapshot_id = %s",
            (run["snapshot_id"],))[0]
        rungs = request.one(
            "select count(*) from cw.snapshot_ladder_rung where snapshot_id = %s",
            (run["snapshot_id"],))[0]
        stored_hash = request.one(
            "select result_hash from cw.run where run_id = %s", (run["run_id"],))[0]
    assert members >= 1, "the snapshot pinned no clauses — vacuous"
    assert rungs >= 1, "the snapshot pinned no ladder rungs — vacuous"

    status, headers, data = download(library, client.token, run["run_id"])
    assert status == 200, refusal(data)
    assert headers["content-type"] == DOCX_TYPE
    assert data.startswith(b"PK"), "that is not a Word document"

    produced = [row for row in chain(library) if row["event_type"] == "document_produced"]
    assert len(produced) == 1, "the download left no trace, or more than one"
    payload = produced[0]["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)

    assert payload["snapshot_id"] == run["snapshot_id"], (
        "the document was built against a library the run does not name")
    assert payload["result_hash"] == stored_hash == run["result_hash"], (
        "the recomputed result does not match what cw.run stored — the run "
        "does not reproduce, and a document was handed over anyway")


def chain(base: str) -> list[dict]:
    _, body = Client(base).sign_in(ADMIN).call("GET", "/api/record")
    return body["rows"]


def test_two_downloads_of_one_run_are_byte_identical(library):
    """What the fixed date buys, and the reason the record may name a
    fingerprint at all. build_docx stamps `Dated: <today>`; left to default,
    the same immutable run would produce different bytes tomorrow and two
    entries in an append-only chain would legitimately disagree."""
    client, run = record_a_run(library)

    _, _, first = download(library, client.token, run["run_id"])
    _, _, second = download(library, client.token, run["run_id"])

    assert first == second, "one run produced two different documents"
    assert hashlib.sha256(first).hexdigest() == hashlib.sha256(second).hexdigest()


def test_document_produced_carries_the_digest_of_the_exact_bytes_returned(library):
    """Hashed here, in the test, from what came down the wire — not read back
    from whatever the endpoint decided to write about itself."""
    client, run = record_a_run(library)
    _, _, data = download(library, client.token, run["run_id"])

    produced = next(row for row in chain(library)
                    if row["event_type"] == "document_produced")
    payload = produced["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)

    assert payload["sha256"] == hashlib.sha256(data).hexdigest()
    assert payload["byte_size"] == len(data)
    assert payload["pre_execution"] is True
    assert produced["actor"] == DANA


# ── No document from a run that does not prove itself ───────────────────────


def test_a_snapshot_that_does_not_rebuild_produces_no_document(
    library, schema, monkeypatch
):
    """A run whose pinned library no longer rebuilds to the id stored against
    it. The refusal must name BOTH ids — 'it does not rebuild' with no numbers
    is unactionable, and that is the whole point of this test.

    NO LONGER INDUCIBLE THROUGH THE FRONT DOOR, AND THAT IS THE SCHEMA WORKING.
    This test used to add a clause to the run's pinned library after the fact,
    as the Legal admin — the tampering shape, where the stored fingerprint stops
    describing what is stored under it. Migration 0058 closed that:

        "The original append-only guards prevented edits and deletes while
         still allowing a working role to add a new member afterwards,
         permanently changing the replay input of every run already pointing
         at the id."

    `cw.freeze_referenced_pin_member` now refuses the insert for every role the
    system grants, so the setup raises before the endpoint is ever reached. The
    rule is right and stays; the test moves.

    NOT RE-INDUCED AS THE OWNER, deliberately — this test's own earlier note
    refused that and it was correct: a fixture that reaches past the row rules
    to break something can break things the system would never allow, and a
    defence proved against a state the product cannot be in proves nothing.

    What is proved here is therefore the WIRING, in the same shape the test
    below uses for its own uninducible case: when the rebuild does come back
    with a different id, the doorway refuses with 409, names both ids, and
    produces no bytes."""
    from doorway import documents as documents_module

    client, run = record_a_run(library)

    REBUILT_AS = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

    class Rebuilt:
        snapshot_id = REBUILT_AS

    monkeypatch.setattr(documents_module.engine_run, "snapshot_from_rows",
                        lambda *_args, **_kwargs: Rebuilt())

    status, headers, data = download(library, client.token, run["run_id"])
    assert status == 409, (status, data[:200])
    body = refusal(data)
    assert body["kind"] == "refused_on_merits"
    assert run["snapshot_id"] in body["reason"], "the refusal does not name the stored id"
    # BOTH ids, not one. A refusal naming only what it expected leaves nobody
    # able to say what it actually got, which is the difference between a report
    # somebody can act on and a dead end.
    assert REBUILT_AS in body["reason"], "the refusal does not name the rebuilt id"
    assert "rebuilt" in body["reason"]
    assert not data.startswith(b"PK"), "bytes were produced anyway"


def test_a_referenced_snapshot_cannot_gain_a_member_at_all(library, schema):
    """The guarantee the test above used to reach through, asserted directly.

    0058's rule is the thing actually protecting a run's replay input, and with
    the test above no longer exercising it, nothing in this file would notice if
    it were removed. Asserted as the Legal admin — the most privileged role that
    holds insert on cw.snapshot_member — because the question is whether any act
    the system permits can move a run's pinned library after the fact."""
    import psycopg
    import pytest as _pytest

    _client, run = record_a_run(library)

    with as_person(schema, LEGAL_ADMIN, "legal_admin") as request:
        request.write(
            "insert into cw.clause (clause_id, category_key, severity) "
            "values ('DP-A-002', 'data', 'Standard')")
        request.write(
            "insert into cw.clause_version (clause_id, version, title, body) "
            "values ('DP-A-002', 1, 'added later', 'body added after the run')")
        with _pytest.raises(psycopg.errors.RaiseException) as refused:
            request.write(
                "insert into cw.snapshot_member "
                "(snapshot_id, clause_id, version, selectable) "
                "values (%s, 'DP-A-002', 1, true)", (run["snapshot_id"],))

    assert "cannot gain or change members" in str(refused.value)


def test_a_stored_member_with_no_clause_row_refuses_with_the_engine_s_sentence(
    library, schema, monkeypatch
):
    """The engine's own words, unchanged — it names exactly which member is
    missing and why an approximate rebuild is worse than a refusal.

    CANNOT BE INDUCED THROUGH THE FRONT DOOR, AND THAT IS WORTH RECORDING.
    cw.snapshot_member has a foreign key to cw.clause_version, clause versions
    are immutable and nobody holds a DELETE on them, and the loader's clause
    query returns every version there is — retired, expired or superseded
    alike. So a stored member with no clause row cannot be created by any act
    the system permits, which is the schema working.

    What is proved here is therefore the WIRING, using the engine's real
    sentence: a SnapshotIncomplete becomes a 409 carrying that sentence
    unchanged, and no bytes are produced. The engine's own suite owns the
    question of when it is raised.
    """
    from engine.manifest import CategoryMap
    from engine.run import SnapshotIncomplete, snapshot_from_rows

    engine_says = None
    try:
        snapshot_from_rows(
            [{"clause_id": "DP-A-001", "version": 1, "selectable": True}],
            [],  # no clause row for that member
            [],
            None,
            categories=CategoryMap.from_rows([{"key": "data", "label": "Data Privacy"}]))
    except SnapshotIncomplete as incomplete:
        engine_says = str(incomplete)
    assert engine_says and "DP-A-001@v1" in engine_says, (
        "the engine no longer refuses a member it cannot rebuild")

    client, run = record_a_run(library)

    from doorway import documents as documents_module

    def refuse(*_args, **_kwargs):
        raise SnapshotIncomplete(engine_says)

    monkeypatch.setattr(documents_module.engine_run, "snapshot_from_rows", refuse)

    status, _headers, data = download(library, client.token, run["run_id"])
    assert status == 409, (status, data[:200])
    body = refusal(data)
    assert body["reason"] == engine_says, "the engine's sentence was reworded"
    assert body["kind"] == "refused_on_merits"
    assert not data.startswith(b"PK")


# ── Whose run it is ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("failure", [
    ValueError("snapshot rung GHOST@v1 is not a member"),
    UnknownCategory("no category has key 'removed'"),
])
def test_other_rebuild_inconsistencies_are_409s_with_no_document(
    library, monkeypatch, failure
):
    client, run = record_a_run(library)
    from doorway import documents as documents_module

    def refuse(*_args, **_kwargs):
        raise failure

    monkeypatch.setattr(documents_module.engine_run, "snapshot_from_rows", refuse)

    status, _headers, data = download(library, client.token, run["run_id"])

    assert status == 409
    assert refusal(data)["kind"] == "refused_on_merits"
    assert not data.startswith(b"PK")


def test_a_malformed_stored_manifest_is_a_409_with_no_document(
    library, monkeypatch
):
    client, run = record_a_run(library)
    from doorway import documents as documents_module

    def refuse(_body):
        raise documents_module.manifests.Malformed("risks are not a list")

    monkeypatch.setattr(documents_module.manifests, "manifest_from", refuse)

    status, _headers, data = download(library, client.token, run["run_id"])

    assert status == 409
    assert refusal(data)["kind"] == "refused_on_merits"
    assert not data.startswith(b"PK")


def test_unprintable_approved_text_is_a_409_with_no_document(
    library, monkeypatch
):
    client, run = record_a_run(library)
    from doorway import documents as documents_module

    def refuse(*_args, **_kwargs):
        raise documents_module.docx.UnprintableText(
            "approved text contains an XML-forbidden control character")

    monkeypatch.setattr(documents_module.docx, "build_docx", refuse)

    status, _headers, data = download(library, client.token, run["run_id"])

    assert status == 409
    assert "control character" in refusal(data)["reason"]
    assert not data.startswith(b"PK")


def test_a_caller_naming_a_run_that_is_not_theirs_is_refused_with_no_bytes(
    library, schema
):
    """The first place a caller-supplied identifier reaches tables that carry
    no row rules of their own. Everything rests on resolving the run through
    cw.run first, and on zero rows there being a refusal rather than a filter.
    """
    reviewer = Client(library).sign_in(REVIEWER)
    status, theirs = reviewer.call("POST", "/api/runs",
                                   manifest("Data Privacy", agreement_id=DEAL))
    assert status == 200, theirs

    # Legal recorded it against Dana's deal, so Dana can see it. Give the
    # reviewer a deal of their own and record there instead.
    status, body = Client(library).sign_in(LEGAL_ADMIN).call(
        "POST", "/api/deals", {"agreement_id": "AG-0009", "counterparty": "Elsewhere"})
    assert status == 200, body
    status, hidden = reviewer.call("POST", "/api/runs",
                                   manifest("Data Privacy", agreement_id="AG-0009"))
    assert status == 200, hidden

    dana = Client(library).sign_in(DANA)
    status, _headers, data = download(library, dana.token, hidden["run_id"])

    assert status == 403, (status, data[:200])
    assert refusal(data)["kind"] == "not_permitted"
    assert not data.startswith(b"PK"), "a document was built for somebody else's run"


def test_a_run_nobody_has_is_the_same_sentence(library):
    client, _run = record_a_run(library)
    status, _headers, data = download(library, client.token, "no-such-run")
    assert status == 403
    assert refusal(data)["reason"].strip()


def test_naming_no_run_at_all_is_the_caller_s_mistake(library):
    client, _run = record_a_run(library)
    request = urllib.request.Request(
        f"{library}/api/runs/contract", method="GET",
        headers={"authorization": f"Bearer {client.token}"})
    try:
        with urllib.request.urlopen(request) as reply:
            status, data = reply.status, reply.read()
    except urllib.error.HTTPError as wrong:
        status, data = wrong.code, wrong.read()

    assert status == 400
    assert refusal(data)["kind"] == "rejected"


def test_when_the_audit_is_refused_no_bytes_are_returned(library):
    """An auditor may read every run and may not write to the chain, so the
    chain refuses the download and the transaction takes the bytes with it.

    RECORDED AS A DECISION RATHER THAN DISCOVERED: an auditor cannot download a
    pre-execution contract. The alternative is auditing outside the caller's
    own transaction, which reintroduces the privileged path the whole doorway
    exists to make impossible. Reversing it later is a schema grant, not code.
    """
    _client, run = record_a_run(library)
    auditor = Client(library).sign_in(TUNDE)

    status, _headers, data = download(library, auditor.token, run["run_id"])
    assert status in (403, 409), (status, data[:200])
    assert not data.startswith(b"PK")
    assert refusal(data)["reason"].strip()


def test_a_viewer_is_refused_before_anything_is_read(library):
    _client, run = record_a_run(library)
    sam = Client(library).sign_in(SAM)
    status, _headers, data = download(library, sam.token, run["run_id"])
    assert status in (403, 409)
    assert not data.startswith(b"PK")


# ── Nothing is stored ───────────────────────────────────────────────────────


def test_nothing_is_stored(library, schema):
    """A pre-execution contract is deterministic output of an immutable run.
    Storing the bytes would create a second copy free to disagree with the
    first."""
    client, run = record_a_run(library)
    with as_person(schema, TUNDE, "auditor") as request:
        before = request.one("select count(*) from cw.executed_document")[0]

    assert download(library, client.token, run["run_id"])[0] == 200

    with as_person(schema, TUNDE, "auditor") as request:
        assert request.one("select count(*) from cw.executed_document")[0] == before
        assert request.one("select count(*) from cw.run")[0] == 1, (
            "producing a document recorded a second run")


# ── The run name becomes the filename (2026-08-08) ──────────────────────────


@pytest.mark.parametrize("run", [
    "RUN-Été",       # an accent
    "RUN-合同",       # not Latin at all
    "RUN\\7",          # a backslash escapes inside a quoted-string
    'RUN"7',            # the injection the rule started out guarding
])
def test_a_run_name_the_filename_cannot_carry_is_the_callers_mistake(run):
    """A 400 that names the problem, never the 500 that says WE broke.

    `{run_id}.docx` is quoted into a content-disposition header, and the
    transport refuses a name it cannot put there — with a 500, correctly, since
    a producer handing it one is our bug. This guard used to list a quote and a
    line break only, so the first two names above reached the transport and the
    caller was told the service had failed.

    No database is needed: the refusal is decided before anything is asked.
    """
    from doorway import documents
    from doorway.identity import Caller

    answered = documents.contract(None, Caller(person=SAM, role="requester"),
                                  {"run": run})
    assert answered.status == 400, getattr(answered, "body", answered)
    assert answered.body["error"] == "refused"
    assert answered.body["kind"] == "rejected"
