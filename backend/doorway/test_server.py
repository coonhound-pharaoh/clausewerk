"""The whole thing, through a socket, as six real people.

This is the first test in the workstream that proves anything end to end. Every
call below goes over HTTP exactly as the browser makes it: a bearer token in a
header, JSON in and JSON out, nothing else carrying identity.

WHAT IS BEING PROVED

  · Six people sign in and get the role the DATABASE says they hold — not the
    one their account record claims, which is the distinction the countersign
    rule rests on.
  · Every workspace's reads answer, for the person whose workspace it is.
  · A refusal arrives as a refusal with the database's own words, and never as
    a 500. "You may not do that" and "we broke" are different facts.
  · Revocation bites at the next request, not the next sign-in.
  · The screens are served, and nothing outside their directory is.
"""

from __future__ import annotations

import json
import socket
import threading
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path

import psycopg
import pytest

from doorway import server as server_module
from doorway.app import DOCX_TYPE, Download, Response, Upload
from doorway.seed_demo import PEOPLE, seed
from doorway.server import serve

SCREENS = Path(__file__).resolve().parents[2] / "prototype" / "v4"

# What each workspace actually asks for when it opens. Taken from the shell's own
# API client (`prototype/v4/app/api.jsx`), not invented here.
WORKSPACE_READS = {
    "administrator": ["/me", "/people", "/people/activity", "/people/summary",
                      "/access-history", "/settings", "/health", "/watchers",
                      "/watchers/coverage", "/retention/due"],
    "legal_admin": ["/me", "/tickets", "/quality", "/origin-mix", "/clauses",
                    "/clause-versions", "/entrance", "/concessions", "/holds",
                    "/settings", "/waiting/countersign"],
    # THE RUN READS BELOW MOVED IN THE SAME CHANGE THAT ADDED THEM TO api.jsx,
    # and that is not tidiness. This table is an INDEPENDENT COPY of that file's
    # read list, and the sweep iterates only what is listed here — so a copy
    # that falls behind cannot go red on its own. It reads as coverage while
    # covering less and less.
    #
    # It is the third duplicated specification in this system, and the other two
    # are already guarded by moving them in the same package: shell.test.mjs's
    # copy of the tab table, and mutation-check.mjs's shell block.
    "legal_reviewer": ["/me", "/tickets", "/waiting/tickets", "/quality",
                       "/overrides", "/overrides/findings",
                       "/runs", "/runs/decisions", "/runs/findings"],
    "requester": ["/me", "/deals", "/overrides", "/overrides/findings",
                  "/library", "/runs", "/runs/decisions", "/runs/findings"],
    "auditor": ["/me", "/record", "/people", "/people/activity", "/health",
                "/access-history", "/quality", "/origin-mix"],
    "viewer": ["/me"],
}


class Client:
    """The browser, minus the browser."""

    def __init__(self, base: str):
        self.base = base
        self.token: str | None = None

    def call(self, method: str, path: str, body: dict | None = None):
        request = urllib.request.Request(
            self.base + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={
                "content-type": "application/json",
                **({"authorization": f"Bearer {self.token}"} if self.token else {}),
            })
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read() or b"null")
        except urllib.error.HTTPError as refused:
            raw = refused.read()
            try:
                return refused.code, json.loads(raw or b"null")
            except json.JSONDecodeError:
                return refused.code, {"error": raw.decode("utf-8", "replace")}

    def sign_in(self, person: str):
        status, body = self.call("POST", "/api/sign-in", {"person": person})
        if status == 200:
            self.token = body["token"]
        return status, body


@pytest.fixture
def running(schema: str, owner_url: str):
    """A seeded database and a listening server, torn down afterwards."""
    seed(owner_url=owner_url, app_url=schema)

    server = serve(schema, port=0, static=str(SCREENS))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        yield base
    finally:
        server.shutdown()
        server.server_close()
        server.database.close()
        thread.join(timeout=5)


# ── Signing in ──────────────────────────────────────────────────────────────


def test_all_six_people_sign_in_and_get_the_role_the_database_says(running):
    """The role comes from cw.effective_role, never from the account record. Pat
    holds a Legal role that only works because Rae countersigned it during the
    seed — if that step were skipped, this test would show it as a refusal."""
    for person, display_name, unit, role in PEOPLE:
        client = Client(running)
        status, body = client.sign_in(person)

        assert status == 200, f"{person} could not sign in: {body}"
        assert body["role"] == role, (
            f"{person} signed in as {body['role']}; the seed granted {role}")
        assert body["display_name"] == display_name
        assert body["unit"] == unit
        assert body["token"]


def test_the_sign_in_reply_says_how_long_not_when(running):
    """The service's session clock is a stopwatch, not a calendar: its zero
    point is arbitrary. The reply used to export the raw stopwatch reading
    under the name "expiresAt" — a "timestamp" of roughly January 1970. No
    screen consumed it yet, which is exactly why nothing caught it. The reply
    now says how long the session lasts, which is true in anybody's clock."""
    status, body = Client(running).sign_in("d.buyer@clausewerk")
    assert status == 200
    assert "expiresAt" not in body, "the raw session clock is being exported again"
    # The seeded default. A stopwatch reading leaking through here would be
    # the machine's uptime plus eight hours, never eight hours exactly.
    assert body["expiresInSeconds"] == 8 * 3600


def test_a_body_that_is_not_a_json_object_is_the_callers_mistake(running):
    """Valid JSON is not a valid request: a list or a bare number parses
    happily, and every handler reads named fields off the body. Before the
    shape check, [1,2,3] crashed the handler into the last-resort 500 — the
    person was told "we broke" when the truth is they sent the wrong shape."""
    client = Client(running)
    client.sign_in("a.okafor@clausewerk")
    for wrong in ([1, 2, 3], "hello", 5):
        status, body = client.call("POST", "/api/accounts", wrong)
        assert status == 400, f"{wrong!r} got {status}: {body}"
        assert body.get("error") != "refused", (
            "a malformed request must not read as a permission problem")


def test_a_stranger_is_refused_and_told_why(running):
    status, body = Client(running).sign_in("nobody@clausewerk")
    assert status == 403
    assert body["error"] == "refused"
    assert "effective role" in body["reason"]


def test_naming_nobody_is_not_a_sign_in(running):
    status, body = Client(running).sign_in("   ")
    assert status == 400
    assert "token" not in body


def test_a_request_with_no_session_is_not_a_refusal(running):
    """401 and 403 are different sentences: "you are not signed in" sends
    somebody to the front door, "you may not" sends them to their
    administrator."""
    status, body = Client(running).call("GET", "/api/me")
    assert status == 401
    assert body["error"] == "no session"


def test_the_browser_cannot_name_its_own_role(running):
    """There is nowhere to put one. Sent anyway, it changes nothing."""
    client = Client(running)
    client.sign_in("s.reed@clausewerk")          # a viewer
    status, body = client.call("POST", "/api/sign-in", {
        "person": "s.reed@clausewerk", "role": "administrator"})
    assert status == 200
    assert body["role"] == "viewer"


# ── The six workspaces ──────────────────────────────────────────────────────


@pytest.mark.parametrize("person,display_name,unit,role", PEOPLE)
def test_each_workspace_loads_for_the_person_whose_workspace_it_is(
    running, person, display_name, unit, role
):
    """Every read the workspace opens with, over HTTP, as that person.

    An empty result is a pass — the seeded system deliberately holds no deals or
    tickets, and an honest empty state is the correct first impression. What must
    not happen is a 500, or a refusal on a read this role's own workspace needs.
    """
    client = Client(running)
    status, _ = client.sign_in(person)
    assert status == 200

    for path in WORKSPACE_READS[role]:
        status, body = client.call("GET", "/api" + path)
        assert status != 500, (
            f"{role} opening {path} broke the service: {body}")
        assert status == 200, (
            f"{role} was refused {path}, which their own workspace opens with: "
            f"{body}")
        assert "rows" in body


def test_the_masthead_names_the_person_and_their_role(running):
    client = Client(running)
    client.sign_in("a.okafor@clausewerk")
    status, body = client.call("GET", "/api/me")

    assert status == 200
    assert body["rows"][0]["person"] == "a.okafor@clausewerk"
    assert body["rows"][0]["role"] == "administrator"


def test_the_seeded_system_is_honestly_empty(running):
    """No deals, no tickets, no clauses. A seeded system that looks busy is a
    demo, and the 2026-07-25 review was precisely about surfaces claiming what
    the system does not do."""
    client = Client(running)
    client.sign_in("d.buyer@clausewerk")
    for path in ("/api/deals", "/api/overrides"):
        status, body = client.call("GET", path)
        assert status == 200 and body["rows"] == []


# ── Refusals over the wire ──────────────────────────────────────────────────


def test_a_refusal_arrives_as_a_refusal_and_not_as_a_failure(running):
    """/health is granted to the administrator and the auditor only."""
    client = Client(running)
    client.sign_in("d.buyer@clausewerk")            # a requester
    status, body = client.call("GET", "/api/health")

    assert status == 403, f"a requester got {status} from /health: {body}"
    assert body["error"] == "refused"
    assert body["reason"].strip()


def test_a_write_a_role_may_not_perform_is_refused_over_the_wire(running):
    client = Client(running)
    client.sign_in("s.reed@clausewerk")             # a viewer changes nothing
    status, body = client.call("POST", "/api/accounts", {
        "person": "x@clausewerk", "display_name": "X", "role": "viewer"})

    assert status in (403, 409), f"a viewer got {status}: {body}"
    assert body["error"] == "refused"


def test_a_write_the_role_may_perform_lands_and_is_attributed(running):
    """The one write in this file, and it is checked in the record rather than
    in the response."""
    client = Client(running)
    client.sign_in("a.okafor@clausewerk")
    status, body = client.call("POST", "/api/accounts", {
        "person": "fresh@clausewerk", "display_name": "Fresh Face",
        "unit": "Procurement", "role": "requester"})
    assert status == 200, body

    auditor = Client(running)
    auditor.sign_in("t.imani@clausewerk")
    _, record = auditor.call("GET", "/api/record")
    made = [row for row in record["rows"] if row["subject"] == "fresh@clausewerk"]
    assert made, "the account was created but the chain does not show it"
    assert made[0]["actor"] == "a.okafor@clausewerk"


def test_an_unknown_endpoint_is_not_a_refusal(running):
    client = Client(running)
    client.sign_in("a.okafor@clausewerk")
    status, body = client.call("GET", "/api/nothing-here")
    assert status == 404
    assert body.get("error") != "refused"


def test_malformed_json_is_the_caller_s_mistake_not_a_refusal(running):
    client = Client(running)
    client.sign_in("a.okafor@clausewerk")
    request = urllib.request.Request(
        running + "/api/accounts", method="POST", data=b"{not json",
        headers={"content-type": "application/json",
                 "authorization": f"Bearer {client.token}"})
    try:
        with urllib.request.urlopen(request) as response:
            status, body = response.status, json.loads(response.read())
    except urllib.error.HTTPError as failed:
        status, body = failed.code, json.loads(failed.read())

    assert status == 400
    assert body.get("error") != "refused"


# ── Revocation ──────────────────────────────────────────────────────────────


def test_revocation_bites_at_the_next_request(running, owner_url):
    """Not at the next sign-in. A session lasts hours; if the role were captured
    when it was issued, revoking somebody would take effect tomorrow, and the
    screen would say revoked while the person went on working."""
    client = Client(running)
    assert client.sign_in("d.buyer@clausewerk")[0] == 200
    assert client.call("GET", "/api/me")[0] == 200

    admin = Client(running)
    admin.sign_in("a.okafor@clausewerk")
    status, body = admin.call("POST", "/api/accounts/revoke",
                              {"person": "d.buyer@clausewerk"})
    assert status == 200, body

    status, body = client.call("GET", "/api/me")
    assert status == 403, f"a revoked person got {status} on their next request"
    assert "revoked" in body["reason"]


# ── The screens ─────────────────────────────────────────────────────────────


def test_the_screens_are_served_from_the_same_origin(running):
    with urllib.request.urlopen(running + "/") as response:
        page = response.read().decode()
    assert response.status == 200
    assert "<title>Clausewerk" in page
    assert "./app/api.jsx" in page, "the shell's scripts are not being served"


def test_the_shell_s_own_scripts_are_served_as_something_a_browser_will_run(running):
    with urllib.request.urlopen(running + "/app/api.jsx") as response:
        assert response.status == 200
        assert response.headers["content-type"].startswith("text/babel")


def test_nothing_outside_the_screens_directory_is_served(running):
    """Closed by construction: the resolved path must sit under the root. A
    filter that strips `..` can be defeated by writing it differently."""
    for attempt in ("/../../memory.md", "/..%2f..%2fmemory.md",
                    "/app/../../../backend/doorway/db.py"):
        try:
            with urllib.request.urlopen(running + attempt) as response:
                served = response.read()
            assert b"psycopg" not in served and b"# Memory" not in served, (
                f"{attempt} served a file from outside the screens directory")
        except urllib.error.HTTPError as refused:
            assert refused.code in (403, 404), (
                f"{attempt} answered {refused.code}")


def test_a_missing_screen_falls_through_to_the_endpoints_and_not_to_a_crash(running):
    status, _ = Client(running).call("GET", "/no-such-page")
    assert status in (401, 404)


# ── When the service itself breaks ──────────────────────────────────────────


def test_an_unexpected_failure_keeps_its_details_out_of_the_reply():
    """No database and no fixture: the app here is a stub that simply breaks,
    because the subject is the last-resort handler, not the service.

    What an unexpected failure says about the insides of the service is
    exactly what a stranger probing the port hopes to read. The reply must say
    the service failed and nothing else; the detail belongs in the log.
    """
    from http.server import ThreadingHTTPServer

    from doorway.server import Handler

    class Breaks:
        def handle(self, *args, **kwargs):
            raise RuntimeError("secret internal detail")

    held_app, held_root = Handler.app, Handler.static_root
    Handler.app, Handler.static_root = Breaks(), None
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        status, body = Client(
            f"http://127.0.0.1:{server.server_address[1]}").call("GET", "/api/me")
        assert status == 500
        assert "secret internal detail" not in json.dumps(body), (
            "the crash reply carried the exception's own words out of the "
            "building")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        Handler.app, Handler.static_root = held_app, held_root


# ── Not everything that leaves here is JSON ─────────────────────────────────
#
# The transport seam only. NOTHING in the service produces a Download yet — the
# first thing that will is GET /runs/contract — so these tests stand up a stub
# App and prove the WIRE, which is the only thing this package changed.


class Records:
    """An App that answers what it was told to and remembers what it was handed."""

    def __init__(self, answer):
        self.answer = answer
        self.seen: list[dict] = []

    def handle(self, method, path, token=None, body=None, query=None,
               upload=None):
        self.seen.append({"method": method, "path": path,
                          "token": token, "body": body, "query": query,
                          "upload": upload})
        return self.answer


@contextmanager
def stub_serving(app):
    """A listening server with no database behind it."""
    from doorway.server import Handler

    held_app, held_root = Handler.app, Handler.static_root
    Handler.app, Handler.static_root = app, None
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        Handler.app, Handler.static_root = held_app, held_root


def test_a_download_leaves_as_bytes_with_its_own_content_type():
    """The exact bytes, and the content type the Download itself carried.

    The payload below is deliberately not valid UTF-8 and not valid JSON: a
    real .docx is a zip, and anything on this path that reached for json.dumps
    would not merely mangle it — it would raise.
    """
    payload = b"PK\x03\x04\x14\x00\x06\x00\xff\xfe not json, not text"
    app = Records(Download(200, payload, DOCX_TYPE, "contract.docx"))

    with stub_serving(app) as base:
        with urllib.request.urlopen(base + "/api/runs/contract?run=RUN-1") as reply:
            status = reply.status
            content_type = reply.headers["content-type"]
            served = reply.read()

    assert status == 200
    assert served == payload, "the bytes were changed on the way out"
    assert content_type == DOCX_TYPE, (
        "the content type must come from the Download, not from this file")
    with pytest.raises(UnicodeDecodeError):
        served.decode("utf-8")


def test_a_download_names_its_file_and_its_length():
    payload = b"PK\x03\x04" + b"\x00" * 500
    app = Records(Download(200, payload, DOCX_TYPE, "RUN-7.docx"))

    with stub_serving(app) as base:
        with urllib.request.urlopen(base + "/api/runs/contract") as reply:
            disposition = reply.headers["content-disposition"]
            length = reply.headers["content-length"]
            reply.read()

    assert "attachment" in disposition
    assert 'filename="RUN-7.docx"' in disposition
    assert length == str(len(payload)), (
        "a browser that is told the wrong length truncates or hangs")


@pytest.mark.parametrize("filename", [
    'contract.docx"; filename="stolen.txt',
    "contract.docx\r\nx-injected: yes",
    "contract\\name.docx",
    "contract\N{SNOWMAN}.docx",
])
def test_a_download_filename_cannot_change_the_response_headers(filename):
    """The transport owns HTTP syntax even when a producer owns the name.

    A bad internal Download must fail before any 200 or Content-Disposition
    header is sent. Otherwise a later producer can inject a header, corrupt
    the attachment name, or make http.server die halfway through its reply.
    """
    app = Records(Download(200, b"contract", DOCX_TYPE, filename))

    with stub_serving(app) as base:
        status, body = Client(base).call("GET", "/api/runs/contract")

    assert status == 500
    assert body == {"error": "the service failed"}


def test_a_query_string_reaches_the_app_and_is_consumed_by_nothing():
    """The seam, and only the seam. Whitelisted keys (`?run=`, and since RP-05
    `?agreement=`) arrive; anything not on the whitelist does not; and the
    reply is the ordinary 404 it always was, because nothing in this package
    reads what arrived."""
    app = Records(Response(404, {"error": "no such endpoint"}))

    with stub_serving(app) as base:
        status, body = Client(base).call(
            "GET", "/api/nothing-here?run=RUN-1&agreement=AG-1&noise=dropped")

    assert app.seen[-1]["query"] == {"run": "RUN-1", "agreement": "AG-1"}, \
        app.seen[-1]
    assert "noise" not in app.seen[-1]["query"], (
        "the browser named a parameter that is not on QUERY_KEYS and it "
        "reached the app anyway")
    assert status == 404 and body.get("error") != "refused"


def test_every_json_endpoint_still_answers_as_json(running):
    """The old path, proved unchanged rather than assumed unchanged.

    A branch added to the one function every reply passes through is exactly
    the kind of edit that works for the new case and quietly spoils the old
    one. Each endpoint below is compared with what App.handle answers directly,
    so a difference introduced by the wire has nowhere to hide.
    """
    from doorway.server import Handler

    status, body = Client(running).call(
        "POST", "/api/sign-in", {"person": "a.okafor@clausewerk"})
    assert status == 200 and body["token"]

    for person, path in (
        ("a.okafor@clausewerk", "/me"),
        ("d.buyer@clausewerk", "/deals"),
        ("r.vance@clausewerk", "/clauses"),
        ("t.imani@clausewerk", "/record"),
    ):
        client = Client(running)
        assert client.sign_in(person)[0] == 200

        request = urllib.request.Request(
            running + "/api" + path, method="GET",
            headers={"authorization": f"Bearer {client.token}"})
        with urllib.request.urlopen(request) as reply:
            over_the_wire = reply.read()
            content_type = reply.headers["content-type"]

        assert content_type == "application/json", (
            f"{path} answered with {content_type!r}")

        direct = Handler.app.handle("GET", path, token=client.token)
        assert not isinstance(direct, Download)
        assert json.loads(over_the_wire) == json.loads(
            json.dumps(direct.body, default=str)), (
            f"{path} arrives as something other than what App.handle answered")


# ── And not everything that arrives here is JSON ────────────────────────────
#
# The inbound transport seam, and only the seam. NOTHING in the service consumes
# an Upload yet — the first thing that will is recording a received redline — so
# these tests stand up a stub App and prove the WIRE, exactly as the outbound
# tests above do. Nothing is stored: this package receives, it does not persist.


def post_bytes(base: str, path: str, payload: bytes, content_type: str,
               filename: str | None = None):
    """A POST that is a document rather than a record."""
    headers = {"content-type": content_type}
    if filename is not None:
        headers["content-disposition"] = f'attachment; filename="{filename}"'
    request = urllib.request.Request(base + path, method="POST", data=payload,
                                     headers=headers)
    try:
        with urllib.request.urlopen(request) as reply:
            return reply.status, json.loads(reply.read() or b"null")
    except urllib.error.HTTPError as refused:
        raw = refused.read()
        try:
            return refused.code, json.loads(raw or b"null")
        except json.JSONDecodeError:
            return refused.code, {"error": raw.decode("utf-8", "replace")}


def test_a_document_arrives_as_bytes_and_reaches_the_app_unchanged():
    """The exact bytes, the caller's own content type, the caller's own name.

    The payload is deliberately neither valid UTF-8 nor valid JSON: a real
    .docx is a zip, and the JSON path would not merely mangle it — it would
    refuse it as malformed, which is what happened before this package.
    """
    payload = b"PK\x03\x04\x14\x00\x06\x00\xff\xfe not json, not text"
    app = Records(Response(404, {"error": "no such endpoint"}))

    with stub_serving(app) as base:
        status, body = post_bytes(base, "/api/negotiation/redline", payload,
                                  DOCX_TYPE, filename="round-3.docx")

    arrived = app.seen[-1]["upload"]
    assert isinstance(arrived, Upload), app.seen[-1]
    assert arrived.body == payload, "the bytes were changed on the way in"
    assert arrived.content_type == DOCX_TYPE
    assert arrived.filename == "round-3.docx"
    assert app.seen[-1]["body"] is None, (
        "a document arrived as a record as well as a document")
    # The stub consumes nothing, so its ordinary 404 is the honest answer.
    assert status == 404 and body.get("error") != "refused"


def test_a_documents_deal_selector_travels_with_it():
    """A document POST names its deal in the query string, because its body
    IS the document — there is no JSON record to carry the name. This branch
    DROPPED the query until NC-09: every upload arrived addressed to nobody,
    the recording act refused it, and only the app-level tests passed,
    because they hand the query to App.handle directly. The wire is the
    thing this test watches."""
    app = Records(Response(404, {"error": "no such endpoint"}))

    with stub_serving(app) as base:
        post_bytes(base, "/api/negotiations/redline?agreement=AG-9&noise=x",
                   b"PK\x03\x04 markup", DOCX_TYPE, filename="r1.docx")

    assert app.seen[-1]["query"] == {"agreement": "AG-9"}, (
        f"the document's selector did not survive the wire: "
        f"{app.seen[-1]['query']!r}. QUERY_KEYS filtering must still apply "
        "('noise' dropped), but the named keys must arrive.")


def test_a_document_over_the_limit_is_refused_unread():
    """The size limit is the product fact this package owns. Over it, the
    request is refused on its declared length — before the bytes are read,
    which is the whole point: a service that reads a gigabyte before deciding
    it did not want it can be exhausted by one request."""
    app = Records(Response(404, {"error": "no such endpoint"}))
    held = server_module.MAX_DOCUMENT_BYTES
    server_module.MAX_DOCUMENT_BYTES = 1_000
    try:
        with stub_serving(app) as base:
            status, body = post_bytes(base, "/api/negotiation/redline",
                                      b"x" * 4_000, DOCX_TYPE)
    finally:
        server_module.MAX_DOCUMENT_BYTES = held

    assert status == 413, f"an oversized document got {status}: {body}"
    assert body.get("error") != "refused", (
        "a document that is too large is not a permission problem")
    assert not app.seen, "the oversized document reached the app anyway"


def test_a_document_that_is_not_there_is_a_400_and_not_a_crash():
    """An upload with nothing in it is the caller's mistake, named as such.
    Never a 500: "we broke" would send somebody to argue about a bug."""
    app = Records(Response(404, {"error": "no such endpoint"}))

    with stub_serving(app) as base:
        status, body = post_bytes(base, "/api/negotiation/redline", b"",
                                  DOCX_TYPE)

    assert status == 400, f"an empty upload got {status}: {body}"
    assert body.get("error") != "refused"
    assert not app.seen


def test_truncated_json_is_refused_before_it_reaches_the_app():
    """A valid prefix is not the complete request the caller declared."""
    app = Records(Response(200, {"ok": True}))

    with stub_serving(app) as base:
        host, port = urllib.parse.urlparse(base).hostname, urllib.parse.urlparse(base).port
        with socket.create_connection((host, port), timeout=5) as client:
            client.sendall(
                b"POST /api/sign-in HTTP/1.0\r\n"
                b"Content-Type: application/json\r\n"
                b"Content-Length: 20\r\n\r\n"
                b"{}"
            )
            client.shutdown(socket.SHUT_WR)
            reply = client.makefile("rb").read()

    assert b" 400 " in reply.split(b"\r\n", 1)[0]
    assert b"arrived incomplete" in reply
    assert not app.seen


def test_chunked_request_is_refused_instead_of_desynchronising_the_connection():
    """The doorway has no chunk decoder, so it must not pretend it has one."""
    app = Records(Response(200, {"ok": True}))

    with stub_serving(app) as base:
        parsed = urllib.parse.urlparse(base)
        with socket.create_connection((parsed.hostname, parsed.port), timeout=5) as client:
            client.sendall(
                b"POST /api/sign-in HTTP/1.1\r\n"
                b"Host: localhost\r\n"
                b"Content-Type: application/json\r\n"
                b"Transfer-Encoding: chunked\r\n"
                b"Connection: close\r\n\r\n"
                b"2\r\n{}\r\n0\r\n\r\n"
            )
            reply = client.makefile("rb").read()

    assert b" 400 " in reply.split(b"\r\n", 1)[0]
    assert b"transfer encoding is not supported" in reply
    assert not app.seen


@pytest.mark.parametrize("token", ("NaN", "Infinity", "-Infinity"))
def test_non_finite_json_numbers_are_refused(token):
    app = Records(Response(200, {"ok": True}))
    payload = f'{{"value": {token}}}'.encode()

    with stub_serving(app) as base:
        request = urllib.request.Request(
            base + "/api/anything", method="POST", data=payload,
            headers={"content-type": "application/json"})
        with pytest.raises(urllib.error.HTTPError) as refused:
            urllib.request.urlopen(request)
        body = json.loads(refused.value.read())

    assert refused.value.code == 400
    assert body["error"] == "that request was not valid JSON"
    assert not app.seen


def test_excessively_nested_json_is_a_bad_request_not_a_service_failure():
    app = Records(Response(200, {"ok": True}))
    payload = ("[" * 2_000 + "0" + "]" * 2_000).encode()

    with stub_serving(app) as base:
        request = urllib.request.Request(
            base + "/api/anything", method="POST", data=payload,
            headers={"content-type": "application/json"})
        with pytest.raises(urllib.error.HTTPError) as refused:
            urllib.request.urlopen(request)
        body = json.loads(refused.value.read())

    assert refused.value.code == 400
    assert body["error"] == "that request was not valid JSON"
    assert not app.seen


def test_negative_content_length_is_refused_before_dispatch():
    app = Records(Response(200, {"ok": True}))

    with stub_serving(app) as base:
        parsed = urllib.parse.urlparse(base)
        with socket.create_connection((parsed.hostname, parsed.port), timeout=5) as client:
            client.sendall(
                b"POST /api/sign-in HTTP/1.0\r\n"
                b"Content-Type: application/json\r\n"
                b"Content-Length: -1\r\n\r\n"
            )
            reply = client.makefile("rb").read()

    assert b" 400 " in reply.split(b"\r\n", 1)[0]
    assert b"content length cannot be negative" in reply
    assert not app.seen


def test_bearer_authentication_scheme_is_case_insensitive():
    app = Records(Response(200, {"ok": True}))

    with stub_serving(app) as base:
        request = urllib.request.Request(
            base + "/api/me", method="GET",
            headers={"authorization": "bearer session-token"})
        with urllib.request.urlopen(request) as reply:
            assert reply.status == 200

    assert app.seen[-1]["method"] == "GET"
    assert app.seen[-1]["path"] == "/me"
    assert app.seen[-1]["token"] == "session-token"


def test_sensitive_api_responses_are_not_stored_by_browsers_or_proxies():
    app = Records(Response(200, {"token": "secret"}))

    with stub_serving(app) as base:
        with urllib.request.urlopen(base + "/api/sign-in") as reply:
            assert reply.headers["cache-control"] == "no-store"

    download = Records(Download(200, b"contract", DOCX_TYPE, "contract.docx"))
    with stub_serving(download) as base:
        with urllib.request.urlopen(base + "/api/runs/contract") as reply:
            assert reply.headers["cache-control"] == "no-store"


def test_api_responses_disable_browser_content_sniffing():
    app = Records(Response(200, {"ok": True}))

    with stub_serving(app) as base:
        with urllib.request.urlopen(base + "/api/me") as reply:
            assert reply.headers["x-content-type-options"] == "nosniff"

    download = Records(Download(200, b"contract", DOCX_TYPE, "contract.docx"))
    with stub_serving(download) as base:
        with urllib.request.urlopen(base + "/api/runs/contract") as reply:
            assert reply.headers["x-content-type-options"] == "nosniff"


def test_authenticated_origin_cannot_be_embedded_for_clickjacking():
    app = Records(Response(200, {"ok": True}))

    with stub_serving(app) as base:
        with urllib.request.urlopen(base + "/api/me") as reply:
            assert reply.headers["x-frame-options"] == "DENY"

    download = Records(Download(200, b"contract", DOCX_TYPE, "contract.docx"))
    with stub_serving(download) as base:
        with urllib.request.urlopen(base + "/api/runs/contract") as reply:
            assert reply.headers["x-frame-options"] == "DENY"


def test_incomplete_client_cannot_hold_a_server_thread_forever():
    app = Records(Response(200, {"ok": True}))
    held = server_module.REQUEST_TIMEOUT_SECONDS
    server_module.REQUEST_TIMEOUT_SECONDS = 0.1
    try:
        with stub_serving(app) as base:
            parsed = urllib.parse.urlparse(base)
            with socket.create_connection(
                    (parsed.hostname, parsed.port), timeout=2) as client:
                client.sendall(b"POST /api/sign-in HTTP/1.1\r\nHost: localhost\r\n")
                client.settimeout(2)
                assert client.recv(1) == b"", (
                    "the server kept an incomplete request connected")
    finally:
        server_module.REQUEST_TIMEOUT_SECONDS = held

    assert not app.seen


# A DECLARED LENGTH LARGER THAN WHAT ARRIVES is guarded in `_read_document`
# (the short-read check) and is deliberately NOT tested here: proving it needs a
# client that promises bytes and then stops, which leaves the socket waiting for
# a reply that cannot come until the read times out. It carries no mutation row
# for the same reason — a row whose test cannot run reads as protection.


def test_a_json_post_is_still_a_record_and_carries_no_document():
    """The old path, proved unchanged rather than assumed unchanged: the branch
    that chooses between bytes and JSON is the kind of edit that works for the
    new case and quietly spoils the old one."""
    app = Records(Response(404, {"error": "no such endpoint"}))

    with stub_serving(app) as base:
        Client(base).call("POST", "/api/accounts", {"person": "x@clausewerk"})

    assert app.seen[-1]["body"] == {"person": "x@clausewerk"}
    assert app.seen[-1]["upload"] is None, (
        "a JSON record was taken for a document")


def test_a_json_post_answers_byte_identically_to_what_the_app_said(running):
    """The POST half of the parity check above, since do_POST is the method
    this package changed."""
    from doorway.server import Handler

    request = urllib.request.Request(
        running + "/api/sign-in", method="POST",
        data=json.dumps({"person": "a.okafor@clausewerk"}).encode(),
        headers={"content-type": "application/json"})
    with urllib.request.urlopen(request) as reply:
        over_the_wire = json.loads(reply.read())
        assert reply.headers["content-type"] == "application/json"

    direct = Handler.app.handle("POST", "/sign-in",
                                body={"person": "a.okafor@clausewerk"})
    assert set(over_the_wire) == set(direct.body), (
        "the sign-in reply's fields moved between App.handle and the wire")
    for field in ("expiresInSeconds", "person", "role", "display_name", "unit"):
        assert over_the_wire[field] == direct.body[field]


# ── The guard that must survive every package ───────────────────────────────


def test_the_serving_path_still_holds_no_privileged_connection(running, owner_url):
    """The whole design rests on this, so it is re-proved here with a server
    actually running rather than assumed to have survived."""
    with psycopg.connect(owner_url, autocommit=True) as owner:
        login, superuser, bypass = owner.execute(
            "select rolname, rolsuper, rolbypassrls from pg_roles "
            "where rolname = 'cw_app'").fetchone()

    assert not superuser, f"{login} is a superuser; every row-by-row rule is bypassed"
    assert not bypass, f"{login} bypasses row-level security"
