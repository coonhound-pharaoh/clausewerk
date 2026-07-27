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
import threading
import urllib.error
import urllib.request
from pathlib import Path

import psycopg
import pytest

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
    "legal_reviewer": ["/me", "/tickets", "/waiting/tickets", "/quality",
                       "/overrides", "/overrides/findings"],
    "requester": ["/me", "/deals", "/overrides", "/overrides/findings"],
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
