"""The deterministic intake (AI-1): plain answers in, a proposed manifest out.

WHAT IS BEING PROVED

  · the classifier is mechanical — term lists and the caller's own category
    vocabulary decide everything, and it can never propose a category the
    caller's library does not define
  · nothing is silently dropped — an answer no term matched comes back named
    in `unmatched`, because an invisible gap is the one thing the product
    boundary forbids
  · the walk's words are NEVER pinned — every test below supplies its own
    synthetic walk file through the same environment door the module reads
    (CLAUSEWERK_INTAKE_WALK); the shipped file is checked for SHAPE only
  · the doorway's own rules still apply — recorded on the chain as the
    signed-in person, refused for a role that may not record, 401 with no
    session, structured values refused at the boundary
  · the proposal really is a manifest — POST /manifests/check accepts it
    unchanged, which is the whole point of the pipe
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from doorway.seed_demo import seed
from doorway.server import serve

SCREENS = Path(__file__).resolve().parents[2] / "prototype" / "v4"

ADMIN = "a.okafor@clausewerk"
LEGAL = "r.vance@clausewerk"
DANA = "d.buyer@clausewerk"
SAM = "s.reed@clausewerk"

# Synthetic content, invented here so no test depends on the shipped walk's
# words. The category KEYS are the fixture's own too — the library below is
# created by the test's Legal admin to match.
WALK = {
    "version": 99,
    "probes": [
        {"id": "general-1", "category": None, "asks": "synthetic general question"},
        {"id": "covered-1", "category": "data", "asks": "synthetic data question"},
        {"id": "orphan-1", "category": "ghost", "asks": "synthetic orphan question"},
    ],
    "terms": {
        "data": {"match": ["confidential records"], "high": ["very sensitive"]},
        "ghost": {"match": ["haunting"]},
    },
}


class Client:
    def __init__(self, base: str):
        self.base = base
        self.token: str | None = None

    def call(self, method: str, path: str, body=None):
        import urllib.error
        import urllib.request
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
def running(schema: str, owner_url: str, tmp_path, monkeypatch):
    walk_file = tmp_path / "walk.json"
    walk_file.write_text(json.dumps(WALK), encoding="utf-8")
    monkeypatch.setenv("CLAUSEWERK_INTAKE_WALK", str(walk_file))

    seed(owner_url=owner_url, app_url=schema)
    server = serve(schema, port=0, static=str(SCREENS))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"

    # A library with a 'data' category in it — but no 'ghost': the walk above
    # deliberately knows a category this library does not, which is the case
    # the classifier must propose nothing for.
    legal = Client(base).sign_in(LEGAL)
    status, body = legal.call("POST", "/api/categories",
                              {"key": "data", "label": "Data Privacy",
                               "short": "DP"})
    assert status == 200, body
    try:
        yield base
    finally:
        server.shutdown()
        server.server_close()
        server.database.close()
        thread.join(timeout=5)


def intake(*answers: tuple[str, str]) -> dict:
    return {"vendor": "Northwind",
            "answers": [{"probe": probe, "text": text}
                        for probe, text in answers]}


def chain(client: Client) -> list[dict]:
    status, body = client.call("GET", "/api/record")
    assert status == 200, body
    return body["rows"]


# ── The classifier, pure ────────────────────────────────────────────────────


def test_a_matched_term_proposes_the_category_by_its_label():
    from doorway.intake import classify_answers

    risks, unmatched = classify_answers(
        [{"probe": "p", "text": "we hold Confidential Records for clients"}],
        WALK["terms"], {"data": "Data Privacy"})

    assert unmatched == []
    assert risks == [{"category": "Data Privacy", "severity": "Standard",
                      "justification": "we hold Confidential Records for clients"}]


def test_a_high_term_raises_severity_and_merging_keeps_the_raise():
    from doorway.intake import classify_answers

    risks, _ = classify_answers(
        [{"probe": "a", "text": "confidential records, nothing else"},
         {"probe": "b", "text": "confidential records, very sensitive ones"}],
        WALK["terms"], {"data": "Data Privacy"})

    assert len(risks) == 1, "two answers on one category did not merge"
    assert risks[0]["severity"] == "High"
    # The first quote is kept — the record shows what first raised the flag.
    assert risks[0]["justification"] == "confidential records, nothing else"


def test_a_term_list_for_an_undefined_category_proposes_nothing():
    """The rule that matters most: a deterministic intake can never invent a
    category. 'ghost' has a term list; the library below does not have the
    category; the answer that matches it is unmatched, not proposed."""
    from doorway.intake import classify_answers

    risks, unmatched = classify_answers(
        [{"probe": "p", "text": "there is a haunting in the warehouse"}],
        WALK["terms"], {"data": "Data Privacy"})

    assert risks == []
    assert unmatched == ["p"]


def test_an_answer_no_term_matched_is_returned_by_name():
    from doorway.intake import classify_answers

    _, unmatched = classify_answers(
        [{"probe": "quiet", "text": "nothing remarkable at all"}],
        WALK["terms"], {"data": "Data Privacy"})

    assert unmatched == ["quiet"]


# ── A denial is not a mention (2026-08-05) ──────────────────────────────────
#
# WHAT IS BEING PROVED, and what deliberately is not.
#
# The classifier used to read "no confidential records are involved" as a
# mention of confidential records, because the phrase is in the sentence. It
# now reads the few words before a term and ignores the term when they deny it.
#
# THE TESTS BELOW ARE ASYMMETRIC ON PURPOSE. One proves a plain denial is
# dropped. Three prove that everything short of a plain denial is STILL
# PROPOSED — a denial too far away, a denial in a different sentence, a denial
# that a genuine mention sits beside. That asymmetry is the design: a proposal
# a requester removes costs seconds, a risk nobody proposed costs a missing
# clause in a signed contract. If a future change makes this cleverer and one
# of the "propose anyway" tests goes red, the change is wrong even if it looks
# smarter.
#
# Every word below is the fixture's own synthetic term list. Nothing here pins
# a shipped question, term or category name.


def test_a_plain_assertion_is_still_a_match():
    from doorway.intake import classify_answers

    risks, unmatched = classify_answers(
        [{"probe": "p", "text": "the supplier will hold confidential records"}],
        WALK["terms"], {"data": "Data Privacy"})

    assert [risk["category"] for risk in risks] == ["Data Privacy"]
    assert unmatched == []


def test_a_denied_mention_proposes_nothing():
    """The defect, in the requester's own words: saying a thing is NOT there
    used to propose it, because the phrase was in the sentence."""
    from doorway.intake import classify_answers

    for denial in ("No confidential records are involved in this purchase.",
                   "we will not hold confidential records",
                   "this does not involve confidential records",
                   "the supplier never sees confidential records",
                   "we don't process confidential records",
                   "the work is done without confidential records"):
        risks, unmatched = classify_answers(
            [{"probe": "p", "text": denial}],
            WALK["terms"], {"data": "Data Privacy"})

        assert risks == [], f"a denial proposed a risk: {denial!r}"
        assert unmatched == ["p"], (
            "a denied answer must still come back as unmatched, not vanish")


def test_a_denial_beside_a_genuine_mention_still_proposes_the_genuine_one():
    """The case that decides whether this is safe. One denied mention must not
    take a real one down with it."""
    from doorway.intake import classify_answers

    risks, unmatched = classify_answers(
        [{"probe": "p",
          "text": "No confidential records are involved in the pilot. "
                  "The support desk does hold confidential records."}],
        WALK["terms"], {"data": "Data Privacy"})

    assert [risk["category"] for risk in risks] == ["Data Privacy"]
    assert unmatched == []


def test_a_denied_high_term_does_not_raise_the_severity():
    """Severity had the same fault as the match: the high-term list is read
    the same way, so a denied high term leaves Standard standing."""
    from doorway.intake import classify_answers

    risks, _ = classify_answers(
        [{"probe": "p", "text": "we hold confidential records, and no very "
                                "sensitive ones"}],
        WALK["terms"], {"data": "Data Privacy"})

    assert len(risks) == 1
    assert risks[0]["severity"] == "Standard"

    raised, _ = classify_answers(
        [{"probe": "p", "text": "we hold confidential records, very sensitive "
                                "ones"}],
        WALK["terms"], {"data": "Data Privacy"})
    assert raised[0]["severity"] == "High", (
        "a real high term stopped raising severity")


def test_an_unclear_denial_proposes_the_risk_anyway_by_design():
    """THE INTENDED CONSERVATIVE BEHAVIOUR, not a shortcoming.

    None of these three sentences denies the term itself — the denial is about
    something else, or too far away, or in another sentence. A cleverer reading
    might drop them. This one proposes, because a risk proposed and removed
    costs a requester seconds and a risk never proposed costs a clause.
    """
    from doorway.intake import classify_answers

    for unclear in (
        # The denial is about certainty, not about the records.
        "we are not certain what the supplier does with confidential records",
        # The denial belongs to the sentence before it.
        "this purchase does not involve payroll. "
        "The vendor stores confidential records.",
        # The denial is turned around before the term is reached.
        "we hold no confidential records in Europe, "
        "but the US team does hold confidential records",
    ):
        risks, _ = classify_answers(
            [{"probe": "p", "text": unclear}],
            WALK["terms"], {"data": "Data Privacy"})

        assert [risk["category"] for risk in risks] == ["Data Privacy"], (
            f"a doubtful case was dropped instead of proposed: {unclear!r}")


def test_not_knowing_is_not_a_denial_so_the_risk_is_proposed():
    """"I DON'T KNOW" MUST REACH A PERSON, and this test exists because the
    first version of the denial reading silenced it.

    Every sentence below carries a denial word, and not one of them denies
    anything: the requester is telling us they do not know yet. That is the
    strongest reason there is to put the risk on the screen — a question nobody
    has answered is exactly what a human is for. Reading "not sure" as "no"
    turns an open question into silence, which is the failure that costs a
    clause in a signed contract.
    """
    from doorway.intake import classify_answers

    for doubt in ("It is not clear whether confidential records are involved.",
                  "We are not sure if confidential records are involved.",
                  "We have not confirmed whether confidential records are held.",
                  "It is not yet known whether confidential records are in scope.",
                  "We do not know if confidential records are involved.",
                  "we cannot say whether confidential records are held"):
        risks, unmatched = classify_answers(
            [{"probe": "p", "text": doubt}],
            WALK["terms"], {"data": "Data Privacy"})

        assert [risk["category"] for risk in risks] == ["Data Privacy"], (
            f"an answer saying nobody knows was silenced: {doubt!r}")
        assert unmatched == []


def test_a_plain_denial_is_still_a_denial_beside_all_that_doubt():
    """The other half of the pair above, so widening the doubt reading cannot
    quietly widen its way through a plain "no"."""
    from doorway.intake import classify_answers

    for denial in ("No confidential records are involved.",
                   "We will not process any confidential records.",
                   "We don't hold confidential records."):
        risks, _ = classify_answers(
            [{"probe": "p", "text": denial}],
            WALK["terms"], {"data": "Data Privacy"})

        assert risks == [], f"a plain denial proposed a risk: {denial!r}"


def test_the_classifier_never_raises_whatever_the_answer_says():
    """ADR-0005's fallback runs when the model cannot. If it throws, the
    requester's work stops — so nothing about an answer's shape may break it."""
    from doorway.intake import classify_answers

    for odd in ("", "   ", ".;:!?", "no", "not not not confidential records",
                "confidential records" * 200, "\n\n\r\t", "don't", "ÜBER — no"):
        classify_answers([{"probe": "p", "text": odd}],
                         WALK["terms"], {"data": "Data Privacy"})


# ── The shipped walk file: shape only, never words ──────────────────────────


def test_the_shipped_walk_file_is_the_shape_the_module_reads():
    from doorway.intake import DEFAULT_WALK, load_walk

    walk = load_walk(DEFAULT_WALK)
    assert walk["probes"], "the shipped walk has no probes at all"
    # Shape, deliberately nothing else: the words are placeholder content
    # (CLAUDE.md 2026-07-27) and no test may pin them.


def test_a_malformed_walk_answers_service_not_caller_mistake(tmp_path, monkeypatch):
    from doorway.intake import BadWalk, load_walk

    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    with pytest.raises(BadWalk):
        load_walk(broken)


# ── The probe walk, over the wire ───────────────────────────────────────────


def test_probes_are_filtered_to_the_caller_s_library(running):
    """A probe tied to a category the library does not define is withheld —
    asking a question whose answer can never become a risk would be the silent
    drop this module exists to prevent."""
    dana = Client(running).sign_in(DANA)
    status, body = dana.call("GET", "/api/intake/probes")

    assert status == 200, body
    shown = {probe["id"] for probe in body["probes"]}
    assert "general-1" in shown, "a general probe was withheld"
    assert "covered-1" in shown, "a probe for a defined category was withheld"
    assert "orphan-1" not in shown, (
        "a probe for a category the library does not define was shown")


def test_the_probe_walk_needs_a_session(running):
    status, body = Client(running).call("GET", "/api/intake/probes")
    assert status == 401


# ── The classify endpoint, end to end ───────────────────────────────────────


# The three values cw.run.manifest_source accepts (0005). Written out here
# rather than imported, on the second-opinion principle: this test exists to
# catch the intake inventing a fourth, and importing the list from the code
# under test would agree with it no matter what either of them said.
RUN_STORE_ACCEPTS = ("llm", "fallback", "manual")


def test_answers_become_a_proposed_manifest_the_engine_accepts(running):
    """The whole pipe: plain words in, a proposal out, and the proposal is
    exactly what POST /manifests/check takes — accepted unchanged.

    THE SOURCE IS THE PART THAT BIT. This asserted `source == "intake"` until
    2026-08-05, matching what the endpoint returned — and cw.run.manifest_source
    accepts only llm, fallback and manual, so the proposal this test called
    "accepted unchanged" would have been REFUSED at POST /runs, at the very
    last step, after the requester had answered every question. Both this test
    and the endpoint were wrong in the same direction, which is what a test
    written from the code rather than from the record buys you.

    With no model key in the test environment the deterministic classifier
    answers, so the source is 'fallback' — ADR-0005's own name for it."""
    dana = Client(running).sign_in(DANA)
    status, proposal = dana.call("POST", "/api/intake/classify", intake(
        ("covered-1", "the supplier will hold confidential records")))

    assert status == 200, proposal
    assert proposal["source"] in RUN_STORE_ACCEPTS, (
        f"the intake proposed source {proposal['source']!r}, which the run "
        "store's check constraint does not accept — POST /runs would refuse "
        "this manifest after the requester had done all the work")
    assert proposal["source"] == "fallback"
    assert proposal["model_absence"], (
        "the fallback ran and did not say why the model had not")
    assert [risk["category"] for risk in proposal["risks"]] == ["Data Privacy"]
    assert proposal["unmatched"] == []

    checked_status, checked = dana.call("POST", "/api/manifests/check", {
        "vendor": proposal["vendor"], "value": proposal["value"],
        "source": proposal["source"], "risks": proposal["risks"]})
    assert checked_status == 200, (
        f"the engine refused the intake's own proposal: {checked}")
    assert checked["dropped"] == []


def test_unmatched_answers_come_back_named(running):
    dana = Client(running).sign_in(DANA)
    status, proposal = dana.call("POST", "/api/intake/classify", intake(
        ("covered-1", "the supplier will hold confidential records"),
        ("general-1", "nothing remarkable about this one")))

    assert status == 200, proposal
    assert proposal["unmatched"] == ["general-1"]


def test_an_intake_that_matches_nothing_still_answers_with_the_gap_visible(running):
    dana = Client(running).sign_in(DANA)
    status, proposal = dana.call("POST", "/api/intake/classify", intake(
        ("general-1", "entirely unremarkable words")))

    assert status == 200, proposal
    assert proposal["risks"] == []
    assert proposal["unmatched"] == ["general-1"]


def test_the_classification_lands_on_the_chain_as_the_signed_in_person(running):
    Client(running).sign_in(DANA).call("POST", "/api/intake/classify", intake(
        ("covered-1", "confidential records again")))

    recorded = [row for row in chain(Client(running).sign_in(ADMIN))
                if row["event_type"] == "intake_classified"]
    assert recorded, "an intake crossed the front door and left no trace"
    assert recorded[0]["actor"] == DANA
    assert recorded[0]["subject"] == "Northwind"

    payload = recorded[0]["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    assert payload["source"] == "fallback", (
        "the chain recorded a source the run store does not accept; see "
        "test_answers_become_a_proposed_manifest_the_engine_accepts")
    assert payload["risks_proposed"] == ["Data Privacy"]
    assert payload["classified_by"] == "doorway.intake.classify_answers"


def test_a_role_that_may_not_record_cannot_classify_at_all(running):
    """The same uniformity manifests.py argued for: the audit insert grant
    decides who may use the endpoint, not whether the answers happened to
    match anything."""
    sam = Client(running).sign_in(SAM)
    status, body = sam.call("POST", "/api/intake/classify", intake(
        ("covered-1", "confidential records")))

    assert status in (403, 409), f"a viewer got {status}: {body}"
    assert body["error"] == "refused"


def test_no_session_reaches_the_classifier_at_all(running):
    status, body = Client(running).call("POST", "/api/intake/classify",
                                        intake(("covered-1", "anything")))
    assert status == 401


def test_a_body_that_is_not_an_intake_is_the_caller_s_mistake(running):
    dana = Client(running).sign_in(DANA)
    for wrong in ({}, {"vendor": "Northwind"},
                  {"vendor": "", "answers": [{"probe": "p", "text": "t"}]},
                  {"vendor": "Northwind", "answers": []},
                  {"vendor": "Northwind", "answers": [{"probe": "", "text": "t"}]},
                  {"vendor": "Northwind", "answers": [{"probe": "p", "text": ""}]}):
        status, body = dana.call("POST", "/api/intake/classify", wrong)
        assert status == 400, f"{wrong} answered {status} {body}"
        assert body["kind"] == "rejected"


@pytest.mark.parametrize("wrong", [True, ["list"], {"nested": "x"}, 42])
def test_structured_intake_values_are_refused_not_stringified(running, wrong):
    dana = Client(running).sign_in(DANA)
    for body in ({"vendor": wrong, "answers": [{"probe": "p", "text": "t"}]},
                 {"vendor": "Northwind",
                  "answers": [{"probe": wrong, "text": "t"}]},
                 {"vendor": "Northwind",
                  "answers": [{"probe": "p", "text": wrong}]}):
        status, answered = dana.call("POST", "/api/intake/classify", body)
        assert status == 400, f"{body} answered {status} {answered}"


# ── The model path (AI-3) ───────────────────────────────────────────────────
#
# WHAT THESE PROVE WITHOUT A PROVIDER. Every test below drives the seam
# directly — `advisory.propose_intake_manifest` and `intake.keep_known_categories`
# — rather than standing up a fake OpenAI. The parts worth guarding are the
# parts that are ours: what happens when the model cannot be reached, what
# happens when it proposes a category this library does not define, and whether
# the two paths agree about what a manifest looks like.
#
# WHAT THEY DELIBERATELY DO NOT PROVE: that the model is any good. That is not
# a property of this code, it is not testable here, and the measure of it is
# what a requester changes before confirming.

from doorway import advisory, intake as intake_module  # noqa: E402


def test_with_no_key_the_seam_declines_and_says_why():
    """The ordinary case, and the one the whole fallback rests on. No key is
    set in the test environment, so this is the real path, not a simulated
    one."""
    proposal = advisory.propose_intake_manifest(
        [{"probe": "p", "text": "the supplier holds personal data"}],
        ["Data Privacy"], 4000)
    assert proposal.risks is None, "a proposal appeared with no provider to make it"
    assert "CLAUSEWERK_OPENAI_API_KEY" in proposal.absent_reason
    # NOT 'absent' — nothing was dispatched, so nothing is billed (0068). This
    # was 'absent' until 2026-08-06, and every keyless intake spent a unit of a
    # budget it had never used.
    assert proposal.outcome == "not_asked"
    assert proposal.asked is False


def test_a_refusal_the_seam_never_dispatched_is_not_billed():
    """The four other pre-dispatch declines say the same thing. Each is a real
    reason a requester reads; none of them reached a provider, so none of them
    may be charged against the day's allowance."""
    answers = [{"probe": "p", "text": "the supplier holds personal data"}]

    # A library with no categories: there is nothing for a model to choose from.
    no_categories = advisory.propose_intake_manifest(answers, [], 4000)
    assert no_categories.outcome == "not_asked", no_categories.absent_reason
    assert no_categories.absent_reason, "a not-asked row still carries its reason"


def test_a_provider_that_was_reached_and_failed_is_still_billed():
    """The other side of the same line, and it must not drift. A call that was
    dispatched and came back useless COST something — it is 'absent', it is
    charged, and treating it as not-asked would hide real spend."""
    reached = advisory._no_proposal("the model provider refused the call "
                                    "(HTTP 500)", model="m", prompt="p")
    assert reached.asked is True, (
        "_no_proposal defaults to billed; every post-dispatch site relies on it")
    assert reached.outcome == "absent"


def test_an_empty_proposal_is_not_the_same_as_no_proposal():
    """THE WORST BUG THIS FILE COULD SHIP, guarded. "Nothing here raises a
    risk" is a real and useful answer; "nobody answered" means the word lists
    are about to do the work instead. If these two ever collapse into each
    other, a failed call silently becomes a clean bill of health."""
    answered = advisory.Proposal(
        risks=[], absent_reason=None, model="m", model_version="m", prompt="p")
    unanswered = advisory._no_proposal("provider down", model="m", prompt="p")
    never_asked = advisory._no_proposal("no key", model="m", prompt="p",
                                        asked=False)

    assert answered.outcome == "answered"
    assert unanswered.outcome == "absent"
    # The third fact 0066 named and 0068 finally recorded. Three outcomes, three
    # different things that happened; none of them may wear another's clothes.
    assert never_asked.outcome == "not_asked"
    assert answered.risks == [] and unanswered.risks is None


def test_a_category_this_library_does_not_define_is_dropped_and_named():
    """The rule the model path rests on. The model is told the list; this is
    what happens when it answers outside it.

    BOTH HALVES MATTER. Keeping it would push an invented category at the
    trust boundary. Dropping it silently would make "the model invented one"
    look exactly like "the library lacks one" — and the second is a real
    coverage gap somebody needs to act on."""
    known = {"data": "Data Privacy", "liab": "Liability"}
    kept, invented = intake_module.keep_known_categories([
        {"category": "Data Privacy", "severity": "High", "reason": "holds records"},
        {"category": "Quantum Indemnity", "severity": "High", "reason": "invented"},
    ], known)

    assert [risk["category"] for risk in kept] == ["Data Privacy"]
    assert invented == ["Quantum Indemnity"]


def test_the_two_paths_agree_about_a_duplicate_and_about_severity():
    """One category proposed twice merges, High winning — the keyword path's
    rule, applied identically here. Two paths that disagreed about what a
    duplicate means would produce two different manifests from one intake."""
    known = {"data": "Data Privacy"}
    kept, _ = intake_module.keep_known_categories([
        {"category": "Data Privacy", "severity": "Standard", "reason": "first"},
        {"category": "Data Privacy", "severity": "High", "reason": "second"},
    ], known)

    assert len(kept) == 1
    assert kept[0]["severity"] == "High"
    assert kept[0]["justification"] == "first", (
        "the first reasoning is kept, as on the keyword path")


def test_a_severity_the_model_did_not_choose_is_not_invented_for_it():
    """Anything outside High and Standard makes the whole proposal an absence
    rather than being coerced. A severity nobody chose, written as though they
    did, is the manufactured confidence the seam exists to refuse."""
    known = {"data": "Data Privacy"}
    kept, _ = intake_module.keep_known_categories(
        [{"category": "Data Privacy", "severity": "Catastrophic",
          "reason": "x"}], known)
    # keep_known_categories is the second line and coerces to Standard; the
    # first line is the seam, which refuses the whole reply. Both are asserted
    # so neither can be removed on the assumption the other covers it.
    assert kept[0]["severity"] == "Standard"


def test_the_model_path_records_what_it_proposed_outside_the_library(running):
    """End to end: the chain carries `not_in_library`, so an auditor can tell
    the two faults apart months later. With no key the model path does not run,
    so the field is present and empty — which is itself the assertion: the
    field exists on both paths and never has to be inferred from its absence."""
    dana = Client(running).sign_in(DANA)
    status, proposal = dana.call("POST", "/api/intake/classify", intake(
        ("covered-1", "the supplier will hold confidential records")))
    assert status == 200, proposal
    assert proposal["not_in_library"] == []


def test_a_keyless_intake_records_the_fallback_without_spending_the_budget(
        running, owner_url):
    """END TO END, AND THE DEFECT THIS CLOSES (2026-08-06).

    Every development machine and every not-yet-configured deployment runs with
    no model key. Each intake was writing a row that counted against the daily
    cap, so a system that had never spoken to a provider still ran its allowance
    to zero — and past that point stopped saying "no model key is configured"
    and started saying "today's model budget is spent", which was false.

    BOTH HALVES ARE ASSERTED. The row still exists — how often the system falls
    back, and why, is what AI-7 reports on and an administrator must be able to
    see it. It is simply no longer charged."""
    import psycopg

    dana = Client(running).sign_in(DANA)
    for _ in range(3):
        status, body = dana.call("POST", "/api/intake/classify", intake(
            ("covered-1", "the supplier will hold confidential records")))
        assert status == 200, body
    assert body["source"] == "fallback"

    with psycopg.connect(owner_url, autocommit=True) as conn:
        recorded = conn.execute(
            "select outcome, absent_reason from cw.model_call").fetchall()
        billed = conn.execute(
            "select calls_today from cw.model_calls_today()").fetchone()[0]

    assert len(recorded) == 3, "the fallback stopped being recorded at all"
    assert {row[0] for row in recorded} == {"not_asked"}, recorded
    assert all(row[1] for row in recorded), (
        "a not-asked row with no reason is the silent degradation ADR-0005 forbids")
    assert billed == 0, (
        f"{billed} calls were billed against the day's budget and none were made")
