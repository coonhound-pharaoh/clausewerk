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
    return 0


if __name__ == "__main__":
    sys.exit(main())
