"""WP-U15's acceptance walkthrough: the reading room behind a REAL run.

The one named gap this closes (handoff 08 §3): `cw.reading_room_clause` joins
through `cw.run_decision`, so the viewer's per-clause render needs a real run
behind the shared agreement — manifest, snapshot, ruleset, resolution,
decisions — and it had never been seen on screen. Faking one is exactly the
seeded-system-that-looks-busy the seeding principle rejects, so every row this
produces is produced by the real acts, through the doorway over HTTP, as the
real people the demo seed creates.

It also retires the second named gap: the old demo fixture inserted its
executed agreement as the database owner because no execution act existed.
POST /agreements/execute exists now, and this walkthrough files the execution
through it, as the requester.

    # against a server pointed at a scratch database:
    python -m doorway.acceptance_walkthrough http://localhost:8000

Content note: every wording below is PLACEHOLDER (Mike, 2026-07-27). The
walkthrough proves what the system DOES; the words are synthetic on purpose.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

LEGAL = "r.vance@clausewerk"
REVIEWER = "p.nkemi@clausewerk"
BUYER = "d.buyer@clausewerk"
VIEWER = "s.reed@clausewerk"

TODAY = datetime.date.today().isoformat()


def call(method: str, path: str, token: str | None = None, body: dict | None = None):
    request = urllib.request.Request(
        BASE + "/api" + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(request) as answer:
            return answer.status, json.loads(answer.read() or b"{}")
    except urllib.error.HTTPError as refused:
        return refused.code, json.loads(refused.read() or b"{}")


def act(who: str, description: str, method: str, path: str, token, body=None,
        tolerate: str | None = None):
    """tolerate: a substring of a refusal that means "already done" — the
    walkthrough is re-runnable against the same scratch database."""
    status, answer = call(method, path, token, body)
    verdict = "refused" if status >= 400 else "ok"
    reason = str(answer.get("reason", answer))
    if status >= 400 and tolerate and tolerate in reason:
        print(f"  already  {who:24} {description}")
        return answer
    print(f"  {verdict:8} {who:24} {description}")
    if status >= 400:
        print(f"           the doorway said: {reason}")
        sys.exit(1)
    return answer


def sign_in(person: str) -> str:
    status, answer = call("POST", "/sign-in", body={"person": person})
    if status >= 400:
        print(f"sign-in as {person} refused: {answer}")
        sys.exit(1)
    token = answer.get("token") or answer.get("session")
    print(f"  signed in {person}")
    return token


ADMIN = "a.okafor@clausewerk"

PEOPLE = [
    (REVIEWER, "Pat Nkemi", "Legal", "legal_reviewer"),
    (BUYER, "Dana Buyer", "Procurement", "requester"),
    (VIEWER, "Sam Reed", "Supplier", "viewer"),
]


def ensure_people(admin: str, legal: str) -> None:
    """The bootstrap ceremony creates two people; the Administrator creates the
    rest as recorded acts, and the Legal grant takes its countersign (U6)."""
    for person, name, unit, role in PEOPLE:
        status, made = call("POST", "/accounts", admin,
                            {"person": person, "display_name": name,
                             "unit": unit, "role": role})
        if status >= 400:
            print(f"  exists   {person:24} ({made.get('reason', '')[:60]})")
            continue
        print(f"  ok       {ADMIN:24} creates {person} as {role}")
        status, granted = call("POST", "/grants", admin,
                               {"person": person, "role": role,
                                "reason": "acceptance walkthrough people"})
        if status >= 400:
            print(f"           grant refused: {granted.get('reason')}")
            sys.exit(1)
        if role in ("legal_reviewer", "legal_admin"):
            grant_id = granted["rows"][0]["grant_id"]
            status, signed = call("POST", "/grants/countersign", legal,
                                  {"grant_id": grant_id})
            if status >= 400:
                print(f"           countersign refused: {signed.get('reason')}")
                sys.exit(1)
            print(f"  ok       {LEGAL:24} countersigns the Legal grant (U6)")


def main() -> int:
    print(f"walkthrough against {BASE}\n")

    admin = sign_in(ADMIN)
    legal0 = sign_in(LEGAL)
    ensure_people(admin, legal0)

    legal = sign_in(LEGAL)
    reviewer = sign_in(REVIEWER)
    buyer = sign_in(BUYER)
    viewer = sign_in(VIEWER)

    # ── Legal builds the smallest possible library ────────────────────────
    act(LEGAL, "creates the category", "POST", "/categories", legal,
        {"key": "data", "label": "Data Privacy", "short": "DP"},
        tolerate="duplicate key")

    ticket = act(REVIEWER, "opens a review ticket", "POST", "/tickets", reviewer,
                 {"category_key": "data", "severity": "Standard",
                  "reason_code": "human-edit", "provenance_badge": "EDITED BY LEGAL",
                  "proposed_text": "Placeholder: notify within a reasonable period."})
    ticket_id = ticket["rows"][0]["ticket_id"]

    act(LEGAL, "claims the ticket", "POST", "/tickets/claim", legal,
        {"ticket_id": ticket_id})
    act(LEGAL, "verifies — the library's one minting door", "POST",
        "/tickets/verify", legal,
        {"ticket_id": ticket_id,
         "approved_text": "Placeholder: notify within a reasonable period.",
         "new_clause_id": "DP-S-100", "title": "Notification (placeholder)",
         "rationale": "Walkthrough wording; placeholder until Legal reviews."})

    # ── The requester runs a real assembly and files the execution ────────
    act(BUYER, "opens the deal", "POST", "/deals", buyer,
        {"agreement_id": "AG-WALK-1", "counterparty": "Northwind"},
        tolerate="duplicate key")

    run = act(BUYER, "records a run — snapshot, ruleset, decisions", "POST",
              "/runs", buyer,
              {"agreement_id": "AG-WALK-1", "vendor": "Northwind",
               "source": "manual",
               "risks": [{"category": "Data Privacy", "severity": "Standard",
                          "justification": "Placeholder justification for the "
                                           "acceptance walkthrough."}]})
    run_id = run.get("run_id") or run.get("rows", [{}])[0].get("run_id")
    print(f"           run {run_id}, recorded: {run.get('recorded')}")

    document = b"Placeholder executed document bytes for AG-WALK-1."
    act(LEGAL, "files the execution — through the act, not the owner", "POST",
        "/agreements/execute", legal,
        {"agreement_id": "AG-WALK-1", "run_id": run_id,
         "executed_on": TODAY, "effective_on": TODAY,
         "filename": "AG-WALK-1-executed.docx",
         "byte_size": len(document),
         "sha256": hashlib.sha256(document).hexdigest(),
         "storage_uri": "store://walkthrough/AG-WALK-1.docx",
         "signed_on": TODAY,
         "signatories": [
             {"name": "Dana Buyer", "party": "ours", "method": "electronic",
              "signed_on": TODAY},
             {"name": "Jo Northwind", "party": "theirs", "method": "electronic",
              "signed_on": TODAY}]})

    # ── Legal shares it with the viewer, and the viewer reads it ──────────
    act(LEGAL, "shares the signed agreement with the viewer", "POST",
        "/shares", legal,
        {"agreement_id": "AG-WALK-1", "shared_with": VIEWER,
         "purpose": "WP-U15 acceptance walkthrough — diligence style share."})

    status, room = call("GET", "/reading-room", viewer)
    print(f"  {'ok' if status < 400 else 'refused':8} {VIEWER:24} "
          f"reads the reading room — {len(room.get('rows', []))} agreement(s)")

    status, clauses = call("GET", "/reading-room/clauses", viewer)
    rows = clauses.get("rows", [])
    print(f"  {'ok' if status < 400 else 'refused':8} {VIEWER:24} "
          f"reads the per-clause render — {len(rows)} clause row(s)")
    if status >= 400 or not rows:
        print("           THE NAMED GAP IS STILL OPEN: no clause rows came back.")
        print(f"           {clauses}")
        return 1

    for row in rows:
        print(f"           {row.get('clause_id')}@v{row.get('version')} — "
              f"approved by {row.get('reviewer') or row.get('approver')} — "
              f"origin {row.get('origin')}")
    print("\nthe reading room's per-clause render is real, behind a real run.")

    walk_the_intake(buyer)
    walk_the_negotiation(buyer, reviewer)
    return 0


# ── The intake walk, end to end (AI-2) ──────────────────────────────────────


def walk_the_intake(buyer: str) -> None:
    """The requester's second entrance to the same recorded act.

    The point of running it here rather than unit-testing the classifier: the
    screen's four steps are four separate calls, and the ONE that has bitten
    before is the last. POST /intake/classify answers `source: "intake"` and
    cw.run.manifest_source accepts llm, fallback or manual (0005) — so a screen
    forwarding the classifier's own label is refused at the final act, after
    the person has answered every question. This walks the whole path so that
    refusal cannot hide behind a green unit test again.
    """
    print("\nthe intake walk")

    probes = act(BUYER, "reads the checklist", "GET", "/intake/probes", buyer)
    asked = probes.get("probes", [])
    print(f"           {len(asked)} probe(s), walk version {probes.get('version')}")
    if not asked:
        print("           no probes came back; the library defines no category "
              "the walk can reach")
        return

    # Placeholder answers (content is placeholder — CLAUDE.md 2026-07-27). One
    # deliberately matches no term list at all, because `unmatched` coming back
    # populated is the thing the screen exists to show.
    answers = [
        {"probe": "need", "text": "A quarterly delivery of widgets for the "
                                  "operations team."},
        {"probe": "data", "text": "The supplier will process customer data on "
                                  "our behalf."},
    ]
    proposed = act(BUYER, "answers, and the system reads them", "POST",
                   "/intake/classify", buyer,
                   {"vendor": "Northwind", "answers": answers})

    # WHICH PATH RAN, printed rather than assumed. Without a model key this is
    # the deterministic classifier, and the run says so — which is the whole
    # point: a fallback that looks identical to the real thing is the
    # degradation ADR-0005 exists to make visible.
    path = proposed.get("source")
    print(f"           proposed by: {path}")
    if path == "fallback":
        print(f"           the model did not answer: {proposed.get('model_absence')}")
    if path not in ("llm", "fallback"):
        print("           THE SOURCE IS NOT ONE THE RUN STORE ACCEPTS — "
              "POST /runs will refuse this manifest at the last step")
        sys.exit(1)
    if proposed.get("not_in_library"):
        print("           the model named categories this library does not "
              f"define: {proposed['not_in_library']}")
    print(f"           proposed {len(proposed.get('risks', []))} risk(s); "
          f"unmatched: {proposed.get('unmatched')}")
    if not proposed.get("unmatched"):
        print("           NOTE: nothing was unmatched, so the screen's gap "
              "panel is untested by this run")

    if not proposed.get("risks"):
        print("           the classifier proposed nothing; the rest of the "
              "walk needs at least one risk")
        return

    # THE SOURCE COMES FROM THE ENDPOINT — 'llm' or 'fallback' — and is what
    # the run keeps permanently. It used to be neither: the endpoint answered
    # 'intake', its own name for the classification event, and POST /runs would
    # have refused that after the requester had answered every question.
    confirmed = {
        "agreement_id": "AG-WALK-1",
        "vendor": "Northwind",
        "source": path,
        "risks": [{"category": r["category"], "severity": r["severity"],
                   "justification": r["justification"]}
                  for r in proposed["risks"]],
    }
    act(BUYER, "pre-flights the confirmed manifest", "POST", "/manifests/check",
        buyer, confirmed)
    intake_run = act(BUYER, "assembles from the walk's manifest", "POST",
                     "/runs", buyer, confirmed)
    print(f"           run {intake_run.get('run_id')} recorded from source "
          f"'{path}' — which is what an auditor reads in a year")


# ── The negotiation, end to end (NG-0 … NG-4) ───────────────────────────────


def upload(who: str, description: str, path: str, token: str, body: bytes,
           filename: str):
    """A POST whose body is a document rather than a record — the one shape
    `call` above cannot make, because the transport decides "this is a
    document" from the content type not being JSON."""
    request = urllib.request.Request(
        BASE + "/api" + path, method="POST", data=body,
        headers={"Content-Type": "application/octet-stream",
                 "Content-Disposition": f'attachment; filename="{filename}"',
                 "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request) as answer:
            print(f"  ok       {who:24} {description}")
            return json.loads(answer.read() or b"{}")
    except urllib.error.HTTPError as refused:
        said = json.loads(refused.read() or b"{}")
        print(f"  refused  {who:24} {description}")
        print(f"           the doorway said: {said.get('reason', said)}")
        sys.exit(1)


def fetch_bytes(who: str, description: str, path: str, token: str):
    request = urllib.request.Request(
        BASE + "/api" + path, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request) as answer:
            data = answer.read()
            print(f"  ok       {who:24} {description} — {len(data)} bytes")
            return data
    except urllib.error.HTTPError as refused:
        said = refused.read()
        print(f"  refused  {who:24} {description}")
        print(f"           {said[:200]!r}")
        return None


def walk_the_negotiation(buyer: str, reviewer: str) -> None:
    """Open it, take their paper, contest a point, hand it to Legal — and
    prove the reviewer's desk sees the escalation.

    What this catches that a unit test does not: the round the upload appends
    is the round the download resolves through, and the requester's escalation
    is the reviewer's queue. Both are two endpoints agreeing about one fact,
    which is exactly the class of thing that passes in isolation.
    """
    print("\nthe negotiation")

    act(BUYER, "opens a second deal to negotiate", "POST", "/deals", buyer,
        {"agreement_id": "AG-WALK-2", "counterparty": "Contoso"},
        tolerate="duplicate key")

    opened = act(BUYER, "opens the negotiation on our paper", "POST",
                 "/negotiations", buyer,
                 {"agreement_id": "AG-WALK-2", "paper": "ours",
                  "baseline": "library_standard",
                  "baseline_note": "Placeholder: fresh paper, library standard."},
                 tolerate="duplicate key")
    negotiations = act(BUYER, "lists their negotiations", "GET", "/negotiations",
                       buyer)
    mine = [n for n in negotiations["rows"] if n["agreement_id"] == "AG-WALK-2"]
    if not mine:
        print("           the negotiation just opened is not in the list")
        sys.exit(1)
    negotiation_id = mine[0]["negotiation_id"]
    print(f"           negotiation {negotiation_id}")

    markup = b"PK\x03\x04 placeholder counterparty markup for AG-WALK-2"
    recorded = upload(BUYER, "records the paper they sent back",
                      "/negotiations/redline?agreement=AG-WALK-2", buyer,
                      markup, "contoso-markup.docx")
    print(f"           round {recorded['round_no']}, "
          f"sha256 {recorded['document_sha256'][:16]}…")

    # NI-4: back out again, through the round, under the caller's own rules.
    got = fetch_bytes(BUYER, "reads their document back out",
                      f"/negotiations/paper?negotiation={negotiation_id}"
                      f"&round={recorded['round_no']}", buyer)
    if got != markup:
        print("           THE BYTES CAME BACK DIFFERENT — the round and the "
              "store disagree about what was exchanged")
        sys.exit(1)

    position = act(BUYER, "contests a point", "POST", "/negotiations/positions",
                   buyer,
                   {"negotiation_id": negotiation_id, "category_key": "data",
                    "round_raised": recorded["round_no"],
                    "opened_from": "library_standard"},
                   tolerate="duplicate key")
    position_id = position["rows"][0]["position_id"]

    act(BUYER, "hands it to Legal", "POST",
        "/negotiations/positions/escalate", buyer,
        {"position_id": position_id, "round_no": recorded["round_no"],
         "note": "Placeholder: their wording moves the risk onto us."})

    # THE TWO-ENDPOINT AGREEMENT. The requester escalated; the reviewer's desk
    # is a different read, run as a different person.
    desk = act(REVIEWER, "opens the desk", "GET", "/negotiations/positions",
               reviewer)
    escalated = [p for p in desk["rows"] if p["state"] == "escalated"]
    print(f"           {len(escalated)} point(s) waiting on Legal")
    if not any(p["position_id"] == position_id for p in escalated):
        print("           THE ESCALATION DID NOT REACH THE DESK")
        sys.exit(1)

    moves = act(REVIEWER, "reads how it got there", "GET",
                "/negotiations/movements", reviewer)
    trail = [m for m in moves["rows"] if m["position_id"] == position_id]
    for m in trail:
        print(f"           round {m['round_no']} → {m['to_state']} by {m['actor']}")

    print("\nintake and negotiation are real, end to end, through the doorway.")


if __name__ == "__main__":
    sys.exit(main())
