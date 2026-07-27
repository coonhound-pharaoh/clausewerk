"""The thirty promises the JavaScript service made, re-proved against the Python one.

WHY THIS IS NOT A TRANSLATION

`db/test/service.test.mjs` holds thirty tests. Transcribing them line by line
would carry the old suite's blind spots into the new one unexamined, so each
promise was read, asked whether it still holds, and then proved where it belongs.

Several are already proved elsewhere in this package and are NOT repeated here —
duplicating a test does not strengthen a guarantee, it just makes two places to
update. `PROMISES` below records where every one of the thirty lives, and a test
checks that each named home actually exists. That map is the deliverable as much
as the tests are: it is how somebody deleting the JavaScript suite can see that
nothing went with it.

TWO PROMISES ARE STRONGER HERE THAN THEY WERE

  · "interleaved requests never cross-attribute" was, in JavaScript, a loop of
    requests on a database that allows one connection at a time. It could not
    interleave. Here it is genuinely concurrent — real threads, a real pool — and
    the audit rows are checked afterwards. That is the two-writers test the plan
    listed as merely *possible*; it is done.

  · "a person signs in and is told the role the database says they hold" is
    proved against all six seeded people rather than one.
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from doorway.seed_demo import seed
from doorway.server import serve
from doorway.sessions import EIGHT_HOURS, parse_duration

SCREENS = Path(__file__).resolve().parents[2] / "prototype" / "v4"

# Every promise from db/test/service.test.mjs, and where it is proved now.
# "here" means this file. Anything else names a test in this package.
PROMISES: dict[str, str] = {
    "a bound session sets both the name and the authority":
        "test_no_identity_survives.py::test_a_returned_connection_carries_no_role_and_no_actor",
    "a person signs in and is told the role the database says they hold":
        "here::test_every_seeded_person_is_told_the_role_the_database_holds",
    "somebody with no account cannot sign in":
        "test_server.py::test_a_stranger_is_refused_and_told_why",
    "an anonymous sign-in is refused":
        "test_server.py::test_naming_nobody_is_not_a_sign_in",
    "a request without a session gets nothing":
        "test_server.py::test_a_request_with_no_session_is_not_a_refusal",
    "a made-up token gets nothing":
        "here::test_a_made_up_token_gets_nothing",
    "two requesters see exactly their own deals and nobody else's":
        "here::test_two_requesters_see_exactly_their_own_deals",
    "a legal reviewer sees all of them — the same endpoint, a wider policy":
        "here::test_the_same_endpoint_shows_legal_all_of_them",
    "the difference comes from the database, not from a filter here":
        "here::test_the_difference_comes_from_the_database",
    "there is no role logic anywhere in the service":
        "test_reads.py::test_no_permission_check_lives_in_the_reads",
    "a forged role header changes nothing":
        "here::test_a_forged_role_header_changes_nothing",
    "a forged actor in the body changes nothing":
        "test_writes.py::test_a_body_naming_somebody_else_changes_nothing",
    "the service reads exactly one header, and it names a session":
        "here::test_the_service_reads_exactly_one_header",
    "the service never reads a role or an actor out of a request body":
        "test_writes.py::test_no_write_takes_an_actor_from_the_body",
    "interleaved requests never cross-attribute — asserted on the audit rows":
        "here::test_concurrent_writes_by_two_people_never_cross_attribute",
    "a failing request still returns the connection clean":
        "test_no_identity_survives.py",
    "and a database refusal does too":
        "test_no_identity_survives.py",
    "every request runs as a real application role, never the owner":
        "test_prohibitions.py::test_the_pool_does_not_log_in_as_an_owner_or_superuser",
    "the service exposes no way to query outside a bound session":
        "test_prohibitions.py::test_an_idle_connection_can_do_nothing",
    "sign-in itself is not privileged either":
        "here::test_signing_in_is_not_privileged_either",
    "a revoked person is refused on their very next request":
        "test_server.py::test_revocation_bites_at_the_next_request",
    "an uncountersigned Legal grant gets no session at all":
        "here::test_an_uncountersigned_legal_grant_gets_no_session",
    "the role is resolved every request, not cached at sign-in":
        "test_server.py::test_revocation_bites_at_the_next_request",
    "a session expires and re-sign-in is required":
        "here::test_a_session_expires_and_re_sign_in_is_required",
    "the length comes from the operational setting, not a constant":
        "here::test_the_session_length_comes_from_the_setting",
    "durations parse, and a nonsense value falls back rather than to zero":
        "here::test_durations_parse_and_nonsense_falls_back_to_a_working_value",
    "signing out ends the session":
        "here::test_signing_out_ends_the_session",
    "the database refuses what the service does not check":
        "here::test_the_database_refuses_what_the_doorway_does_not_check",
    "the health endpoint is refused for a requester and served for an administrator":
        "test_server.py::test_a_refusal_arrives_as_a_refusal_and_not_as_a_failure",
    "an unknown endpoint is a 404, not a silent empty list":
        "test_server.py::test_an_unknown_endpoint_is_not_a_refusal",
}

ADMIN = "a.okafor@clausewerk"
LEGAL = "r.vance@clausewerk"
REVIEWER = "p.nkemi@clausewerk"
DANA = "d.buyer@clausewerk"


class Client:
    def __init__(self, base: str):
        self.base = base
        self.token: str | None = None

    def call(self, method: str, path: str, body=None, headers: dict | None = None):
        request = urllib.request.Request(
            self.base + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={
                "content-type": "application/json",
                **({"authorization": f"Bearer {self.token}"} if self.token else {}),
                **(headers or {}),
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
    seed(owner_url=owner_url, app_url=schema)
    server = serve(schema, port=0, static=str(SCREENS))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        server.database.close()
        thread.join(timeout=5)


def signed_in(base: str, person: str) -> Client:
    client = Client(base)
    status, body = client.sign_in(person)
    assert status == 200, f"{person} could not sign in: {body}"
    return client


# ── The map itself ──────────────────────────────────────────────────────────


def test_all_thirty_promises_have_a_home():
    assert len(PROMISES) == 30, (
        f"{len(PROMISES)} promises are mapped; service.test.mjs made 30. If one "
        "was dropped on purpose, that is a decision to write down, not a count "
        "to adjust."
    )


def test_every_promise_names_a_test_that_exists():
    """A map pointing at a test nobody wrote is worse than no map: it reads as
    coverage. Checked by looking for the name in the file it claims."""
    here = Path(__file__)
    missing = []
    for promise, home in PROMISES.items():
        filename, _, test_name = home.partition("::")
        path = here if filename == "here" else here.parent / filename
        if not path.exists():
            missing.append(f"{promise} → {filename} does not exist")
            continue
        if test_name and f"def {test_name}(" not in path.read_text(encoding="utf-8"):
            missing.append(f"{promise} → {home} is not in that file")

    assert not missing, "promises pointing at nothing:\n  " + "\n  ".join(missing)


# ── Signing in ──────────────────────────────────────────────────────────────


def test_every_seeded_person_is_told_the_role_the_database_holds(running):
    """Stronger than the JavaScript's, which checked one person. Pat's role only
    exists because Rae countersigned it, so this covers the countersign rule as
    well as the lookup."""
    from doorway.seed_demo import PEOPLE

    for person, display_name, _unit, role in PEOPLE:
        status, body = Client(running).sign_in(person)
        assert status == 200, f"{person}: {body}"
        assert body["role"] == role
        assert body["display_name"] == display_name


def test_a_made_up_token_gets_nothing(running):
    client = Client(running)
    client.token = "not-a-real-token-at-all"
    status, body = client.call("GET", "/api/me")
    assert status == 401
    assert "rows" not in body


def test_signing_in_is_not_privileged_either(running):
    """Sign-in has to read the staff list before any role is known, which is the
    one genuine chicken-and-egg in the serving path. It is NOT resolved with the
    owner: it reads as cw_viewer, the least-privileged role, which holds select on
    two tables that carry role names and no contract content."""
    from doorway.identity import LOOKUP_ACTOR, LOOKUP_ROLE

    assert LOOKUP_ROLE == "viewer", (
        f"sign-in looks up as {LOOKUP_ROLE!r}. The worst a bug on that path can "
        "do must stay 'read the staff list'."
    )
    assert LOOKUP_ACTOR.startswith("__"), (
        "the sign-in actor must be obviously not a person"
    )
    # And the claim is worth checking rather than trusting: a viewer connection
    # cannot reach contract content.
    status, _ = signed_in(running, "s.reed@clausewerk").call("GET", "/api/record")
    assert status == 403


def test_an_uncountersigned_legal_grant_gets_no_session(running):
    """Not a lesser session. None. A grant of a Legal role confers nothing until
    a Legal admin countersigns it — decision U6 — and the doorway must not soften
    that into a viewer session."""
    admin = signed_in(running, ADMIN)
    status, body = admin.call("POST", "/api/accounts", {
        "person": "hopeful@clausewerk", "display_name": "Hopeful Counsel",
        "unit": "Legal", "role": "legal_reviewer"})
    assert status == 200, body
    status, body = admin.call("POST", "/api/grants", {
        "person": "hopeful@clausewerk", "role": "legal_reviewer",
        "reason": "proposed, not yet countersigned"})
    assert status == 200, body

    status, body = Client(running).sign_in("hopeful@clausewerk")
    assert status == 403, f"an uncountersigned Legal grant got {status}: {body}"
    assert "token" not in body


def test_signing_out_ends_the_session(running):
    client = signed_in(running, ADMIN)
    assert client.call("GET", "/api/me")[0] == 200
    assert client.call("POST", "/api/sign-out")[0] == 200
    assert client.call("GET", "/api/me")[0] == 401


# ── The same endpoint, two different answers ────────────────────────────────


def test_two_requesters_see_exactly_their_own_deals(running):
    admin = signed_in(running, ADMIN)
    for person, name in (("ana@clausewerk", "Ana Buyer"), ("bo@clausewerk", "Bo Buyer")):
        assert admin.call("POST", "/api/accounts", {
            "person": person, "display_name": name, "unit": "Procurement",
            "role": "requester"})[0] == 200
        assert admin.call("POST", "/api/grants", {
            "person": person, "role": "requester", "reason": "for this test"})[0] == 200

    ana, bo = signed_in(running, "ana@clausewerk"), signed_in(running, "bo@clausewerk")
    assert ana.call("POST", "/api/deals",
                    {"agreement_id": "AG-ANA", "counterparty": "Northwind"})[0] == 200
    assert bo.call("POST", "/api/deals",
                   {"agreement_id": "AG-BO", "counterparty": "Contoso"})[0] == 200

    _, ana_sees = ana.call("GET", "/api/deals")
    _, bo_sees = bo.call("GET", "/api/deals")

    assert [row["agreement_id"] for row in ana_sees["rows"]] == ["AG-ANA"]
    assert [row["agreement_id"] for row in bo_sees["rows"]] == ["AG-BO"]


def test_the_same_endpoint_shows_legal_all_of_them(running):
    admin = signed_in(running, ADMIN)
    for person, name in (("ana@clausewerk", "Ana Buyer"), ("bo@clausewerk", "Bo Buyer")):
        admin.call("POST", "/api/accounts", {
            "person": person, "display_name": name, "unit": "Procurement",
            "role": "requester"})
        admin.call("POST", "/api/grants", {
            "person": person, "role": "requester", "reason": "for this test"})
    signed_in(running, "ana@clausewerk").call(
        "POST", "/api/deals", {"agreement_id": "AG-ANA", "counterparty": "Northwind"})
    signed_in(running, "bo@clausewerk").call(
        "POST", "/api/deals", {"agreement_id": "AG-BO", "counterparty": "Contoso"})

    _, legal_sees = signed_in(running, LEGAL).call("GET", "/api/deals")
    seen = {row["agreement_id"] for row in legal_sees["rows"]}
    assert {"AG-ANA", "AG-BO"} <= seen, (
        f"Legal saw {seen}; the same endpoint should show them all")


def test_the_difference_comes_from_the_database(running):
    """The point of the two tests above, stated as its own check: the endpoint is
    one statement with no WHERE clause of ours, so the difference in what came
    back was produced by a policy and by nothing in this codebase."""
    from doorway.reads import READS

    statement = READS["GET /deals"].sql.lower()
    assert "where" not in statement, (
        f"GET /deals carries its own filter: {statement!r}. Two roles seeing "
        "different rows would then prove nothing about the database."
    )
    assert "cw.app_role" not in statement and "current_setting" not in statement


# ── Nothing the browser sends changes who it is ─────────────────────────────


def test_a_forged_role_header_changes_nothing(running):
    """Headers naming a role, an actor and a person, all ignored. There is
    nowhere for them to go: the doorway reads one header and it names a
    session."""
    client = signed_in(running, DANA)                # a requester
    status, body = client.call("GET", "/api/health", headers={
        "x-role": "administrator", "x-actor": ADMIN, "cw-role": "administrator"})

    assert status == 403, f"a forged header got a requester {status} from /health"
    assert body["error"] == "refused"


def test_the_service_reads_exactly_one_header(running):
    """Checked in the source rather than by trying every header anybody might
    invent — the absence is the guarantee, and a test that tries ten headers
    proves nothing about the eleventh."""
    import re

    source = (Path(__file__).parent / "server.py").read_text(encoding="utf-8")
    read = {name.lower() for name in
            re.findall(r"""self\.headers\.get\(\s*["']([^"']+)["']""", source)}

    assert "authorization" in read, "the bearer token is not being read at all"
    assert read == {"authorization", "content-length"}, (
        f"server.py reads {sorted(read)}. Only two headers may be read: the one "
        "naming the session, and the length of the body. Anything else is a new "
        "way for a caller to influence a request."
    )


# ── Concurrency, which is new ───────────────────────────────────────────────


def test_concurrent_writes_by_two_people_never_cross_attribute(running):
    """THE promise the old suite could only gesture at.

    The JavaScript ran against a database allowing one connection, so its
    "interleaved" test was a loop — it could not interleave. Here two people
    write at the same time, on a real pool, through a threaded server, and every
    audit row is checked afterwards.

    If an identity ever outlived its request, this is where it would show: as one
    person's act recorded under the other's name.
    """
    admin = signed_in(running, ADMIN)
    legal = signed_in(running, LEGAL)

    def as_admin(n: int):
        return admin.call("POST", "/api/accounts", {
            "person": f"admin-made-{n}@clausewerk", "display_name": f"A{n}",
            "unit": "Procurement", "role": "requester"})

    def as_legal(n: int):
        return legal.call("POST", "/api/categories", {
            "key": f"cat{n}", "label": f"Category {n}", "short": f"A{chr(65 + n)}"})

    rounds = 12
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = []
        for n in range(rounds):
            futures.append(pool.submit(as_admin, n))
            futures.append(pool.submit(as_legal, n))
        results = [future.result() for future in futures]

    landed = [body for status, body in results if status == 200]
    assert landed, "not one concurrent write got through at all"

    _, record = signed_in(running, "t.imani@clausewerk").call("GET", "/api/record")

    # THE PROMISE: whatever landed is attributed to whoever actually did it.
    # Some of these are refused by the chain's no-fork rule under concurrency —
    # the test below holds that open. A refused write recorded nothing, which is
    # correct. What must never happen is a write landing under the wrong name.
    for prefix, who in (("admin-made-", ADMIN), ("cat", LEGAL)):
        mine = [row for row in record["rows"]
                if str(row["subject"]).startswith(prefix)]
        wrong = [row for row in mine if row["actor"] != who]
        assert not wrong, (
            f"{len(wrong)} act(s) were recorded under the wrong name while two "
            f"people wrote at once: {wrong[:2]}. An identity outlived its request."
        )

    assert any(str(row["subject"]).startswith("admin-made-")
               for row in record["rows"]), "nothing reached the chain to check"


# ── The session's own clock ─────────────────────────────────────────────────


def test_the_session_length_comes_from_the_setting(running, schema):
    """Not a constant. An Administrator who shortens the session length expects
    it to apply to the next person who signs in, not to the next deployment."""
    from doorway.db import Database
    from doorway.identity import session_length

    admin = signed_in(running, ADMIN)
    status, body = admin.call("POST", "/api/settings",
                              {"key": "session_length", "value": "45m"})
    assert status == 200, body

    db = Database(schema)
    try:
        assert session_length(db) == 45 * 60
    finally:
        db.close()


def test_a_session_expires_and_re_sign_in_is_required(schema, owner_url):
    """Time is injected rather than waited for. A test that proves expiry by
    sleeping for eight hours is a test nobody runs."""
    from doorway.app import App
    from doorway.db import Database

    seed(owner_url=owner_url, app_url=schema)
    clock = {"now": 1000.0}
    db = Database(schema)
    try:
        app = App(db, now=lambda: clock["now"])
        signed = app.sign_in(ADMIN)
        assert signed.status == 200
        token = signed.body["token"]

        assert app.handle("GET", "/me", token=token).status == 200

        clock["now"] += EIGHT_HOURS + 1
        expired = app.handle("GET", "/me", token=token)
        assert expired.status == 401, "an expired session was still served"

        assert app.sign_in(ADMIN).status == 200, "re-signing in was refused"
    finally:
        db.close()


def test_durations_parse_and_nonsense_falls_back_to_a_working_value():
    """Falling back to zero would sign everybody out instantly and look like a
    broken product. Falling back to the default looks like the setting was
    ignored, which is both true and recoverable."""
    assert parse_duration("45m") == 45 * 60
    assert parse_duration("8h") == EIGHT_HOURS
    assert parse_duration("30d") == 30 * 86400
    for nonsense in ("", None, "soon", "0", "-5h", "8 hours", "h8"):
        assert parse_duration(nonsense) == EIGHT_HOURS, (
            f"{nonsense!r} did not fall back to a working value")


# ── The database is the one deciding ────────────────────────────────────────


def test_the_database_refuses_what_the_doorway_does_not_check(running):
    """The doorway checks nothing about authority, so every refusal below comes
    from the schema. Four different rules, four different roles, one endpoint
    each — and each refusal arrives in the database's own words."""
    attempts = [
        (DANA, "GET", "/api/health", None),
        ("s.reed@clausewerk", "POST", "/api/accounts",
         {"person": "x@clausewerk", "display_name": "X", "role": "viewer"}),
        (LEGAL, "POST", "/api/checkpoints", {}),
        (REVIEWER, "POST", "/api/categories",
         {"key": "k", "label": "L", "short": "S"}),
    ]
    for person, method, path, body in attempts:
        client = signed_in(running, person)
        status, answered = client.call(method, path, body)
        assert status in (403, 409), (
            f"{person} was allowed {method} {path} — expected the schema to "
            f"refuse, got {status} {answered}")
        assert answered["error"] == "refused"
        assert answered["reason"].strip(), (
            f"{method} {path} refused {person} with no words")
