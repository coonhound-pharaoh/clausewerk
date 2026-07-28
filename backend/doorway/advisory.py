"""The model seam: the one place Clausewerk asks an AI for an opinion.

WHAT THIS FILE IS

Everything before this treated AI as an OUTSIDE SUBMITTER: a manifest arrived,
a draft arrived, and the system checked it. This is the first feature where the
product itself picks up the phone and asks a model a question (NC-25, serving
the owner's ruling U14c).

WHAT IS BEING ASKED, AND WHY IT IS NOT A MEASUREMENT

The system already measures how far the approved words are from the words the
model wrote. That figure counts words. It says "a person worked on this" and it
says nothing about meaning (owner ruling U14b). The question asked here is the
other one: how much did the MEANING change? No arithmetic answers that, so an
opinion is what comes back — and an opinion is labelled as one, everywhere it
appears, and never replaces the measurement.

THE KEY, AND WHERE IT LIVES

    CLAUSEWERK_OPENAI_API_KEY   the key. Supplied by the owner through the
                                environment and NEVER written into this
                                repository (settled decision D-8, memory.md).
    CLAUSEWERK_OPENAI_MODEL     which model to ask. Optional; a default is
                                below so a working configuration is one
                                variable, not two.

If the key is not set, this module does not fail and does not guess. It records
that no judgment was obtainable. That is the whole of the fallback story, and
the next paragraph is why.

ADR-0005, AND THE ONE PLACE IT BENDS

ADR-0005 says every inference call has a deterministic substitute. It can,
because every earlier inference has one: a keyword classifier, a probe
checklist, an escalation to Legal. A JUDGMENT HAS NO DETERMINISTIC SUBSTITUTE.
There is no regex that estimates how much a meaning moved, and writing one that
produced a plausible number would manufacture exactly the false confidence
ADR-0005 exists to prevent. So the substitute here is the honest one: the
absence is recorded, with its reason, as a fact — and the caller's real work is
never blocked by it. A ticket is still adjudicated, approved and minted with no
model in the world reachable.

PROVIDER-THIN, ON PURPOSE

One module owns the integration, so changing provider is one file rather than a
hunt. The call is plain HTTPS through Python's own standard library. No SDK and
no new package: adding a dependency is a decision, and nobody made it.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify

# ── The environment this module reads, and nothing else ─────────────────────
KEY_VARIABLE = "CLAUSEWERK_OPENAI_API_KEY"
MODEL_VARIABLE = "CLAUSEWERK_OPENAI_MODEL"

DEFAULT_MODEL = "gpt-4o-mini"
ENDPOINT = "https://api.openai.com/v1/chat/completions"
TIMEOUT_SECONDS = 20
MAX_RESPONSE_BYTES = 1_000_000

# What the provenance record says when the call never got far enough for the
# provider to name a build. Not blank: a blank in a provenance column reads as
# an answer, and the record has to be able to say "we do not know".
UNKNOWN_VERSION = "unknown — the model was not reached"

# CONTENT. The prompt is language, and all content in this system is placeholder
# pending review (CLAUDE.md). It is recorded verbatim on every row so that when
# Legal does review it, every past judgment says which wording produced it.
SEMANTIC_DIFFERENCE_PROMPT = (
    "Two versions of a contract clause follow. Estimate how much the MEANING "
    "changed between them, as a number from 0 to 1, where 0 is no change of "
    "meaning and 1 is a complete change of meaning. Wording changes that leave "
    "the obligations, rights and limits identical are close to 0; a small "
    "wording change that alters who owes what is close to 1. Reply with JSON "
    'only: {"score": <number>, "basis": "<one sentence>"}.'
)


@dataclass(frozen=True)
class Judgment:
    """What came back, or honestly what did not.

    `score is None` and `absent_reason is not None` are the same fact said two
    ways, and `outcome` is the single word the record stores so that nobody
    downstream has to interpret a null.
    """

    score: float | None
    basis: str | None
    absent_reason: str | None
    model: str
    model_version: str
    prompt: str
    inputs: list = field(default_factory=list)

    @property
    def outcome(self) -> str:
        return "recorded" if self.score is not None else "absent"


def _absent(reason: str, *, model: str, prompt: str, inputs: list,
            model_version: str = UNKNOWN_VERSION) -> Judgment:
    """No judgment, said plainly.

    THE MOST IMPORTANT FOUR LINES IN THIS FILE. Every path that fails to get an
    opinion comes through here, and none of them may invent one on the way. A
    substitute number in the place where a judgment belongs is indistinguishable
    from a real judgment the moment it is on a screen.
    """
    return Judgment(score=None, basis=None, absent_reason=reason,
                    model=model, model_version=model_version,
                    prompt=prompt, inputs=inputs)


def judge_semantic_difference(baseline: str, compared: str) -> Judgment:
    """Ask the model how much the meaning moved between two texts.

    Never raises. Every way this can go wrong — no key, no network, a refusal
    from the provider, a reply that is not what was asked for — ends in an
    absence with its reason, because the caller's real work must not be held up
    by a judgment that is advisory by definition.
    """
    model = os.environ.get(MODEL_VARIABLE) or DEFAULT_MODEL
    prompt = SEMANTIC_DIFFERENCE_PROMPT
    # What the model was given, recorded as a shape rather than as the texts
    # themselves: the two texts are already on the row, in full.
    inputs = [
        {"name": "baseline", "characters": len(baseline)},
        {"name": "compared", "characters": len(compared)},
    ]

    key = os.environ.get(KEY_VARIABLE)
    if not key or not key.strip():
        return _absent(
            f"no model key is configured: {KEY_VARIABLE} is not set in the "
            "environment, so no judgment was obtained",
            model=model, prompt=prompt, inputs=inputs)

    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(
                {"baseline": baseline, "compared": compared})},
        ],
        # An opinion asked twice should not wander for no reason.
        "temperature": 0,
    }).encode("utf-8")

    request = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"content-type": "application/json",
                 "authorization": f"Bearer {key.strip()}"})

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:
            raw = reply.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                return _absent("the model's reply was too large to accept",
                               model=model, prompt=prompt, inputs=inputs)
            payload = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as refused:
        # The provider's own status, not its body: a body can carry account
        # detail, and this string is written into an evidence row.
        return _absent(f"the model provider refused the call (HTTP {refused.code})",
                       model=model, prompt=prompt, inputs=inputs)
    except (urllib.error.URLError, TimeoutError, OSError) as unreachable:
        return _absent(f"the model could not be reached ({type(unreachable).__name__})",
                       model=model, prompt=prompt, inputs=inputs)
    except (ValueError, json.JSONDecodeError, RecursionError):
        return _absent("the model's reply was not readable",
                       model=model, prompt=prompt, inputs=inputs)

    version = str(payload.get("model") or model)
    try:
        content = payload["choices"][0]["message"]["content"]
        answered = json.loads(content)
        score = float(answered["score"])
    except (KeyError, IndexError, TypeError, ValueError, RecursionError):
        return _absent("the model answered, but not with a judgment in the "
                       "shape that was asked for",
                       model=model, model_version=version,
                       prompt=prompt, inputs=inputs)

    if not 0.0 <= score <= 1.0:
        # Out of range is not a judgment to be clamped into one. Clamping would
        # turn a model that misunderstood the question into a confident number.
        return _absent("the model answered outside the range it was asked for",
                       model=model, model_version=version,
                       prompt=prompt, inputs=inputs)

    return Judgment(
        score=score,
        basis=str(answered.get("basis") or "") or None,
        absent_reason=None,
        model=model, model_version=version, prompt=prompt, inputs=inputs)


# ── The pipeline ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


# THE CALLER NEVER SUPPLIES A JUDGMENT. These are the words a request body is
# not allowed to speak: the score, the basis, the outcome and the model's name
# come from the adapter above or the row says 'absent'. This layer reads none of
# them, and the database will not store a score that has no model behind it
# (0030's judgment_is_recorded_or_absent constraint). Two walls, neither of them
# a promise in a comment.
NOT_THE_CALLER_S_TO_SAY = ("score", "basis", "outcome", "model", "model_version")


def semantic_difference(db: Database, caller: Caller, body: dict | None) -> Answer:
    """Judge one ticket, and record the judgment — or record that there is none.

    Answers 200 either way. An absence is an OUTCOME, not an error: the request
    was honoured, the record now says what is true, and a screen that treated it
    as a failure would push people to re-run it until a number appeared.
    """
    # Dropped before a single line below can read one of them.
    asked = {key: value for key, value in (body or {}).items()
             if key not in NOT_THE_CALLER_S_TO_SAY}
    ticket_id = asked.get("ticket_id")
    if ticket_id is None or not str(ticket_id).strip().isdigit():
        return Answer(400, {"error": "refused",
                            "reason": "name the ticket to be judged",
                            "kind": "rejected"})
    ticket_id = int(str(ticket_id).strip())

    try:
        with db.as_person(caller.person, caller.role) as request:
            rows = request.rows(
                """select t.ticket_id, t.draft_id, t.proposed_text, t.approved_text,
                          t.state, d.text as draft_text
                     from cw.review_ticket t
                     left join cw.clause_draft d on d.draft_id = t.draft_id
                    where t.ticket_id = %s""", (ticket_id,))
            if not rows:
                # Not found, or not this caller's to see. The database's own
                # policy decided which, and the doorway does not guess between
                # them: both mean "there is no such ticket for you".
                return Answer(404, {"error": "refused",
                                    "reason": "no such ticket",
                                    "kind": "not_found"})

            ticket = rows[0]
            # The two frozen texts. The baseline is the model's own words —
            # preferring the draft, which 0008 freezes the moment a ticket is
            # opened against it, and falling back to the ticket's proposed text,
            # which is immutable in its own right.
            baseline = ticket["draft_text"] or ticket["proposed_text"]
            compared = ticket["approved_text"]
            if not compared:
                return Answer(409, {
                    "error": "refused",
                    "reason": "there is nothing to compare until the ticket has "
                              "been decided and an approved text exists",
                    "kind": "not_yet"})

            judgment = judge_semantic_difference(baseline, compared)

            recorded = request.rows(
                """insert into cw.advisory_assessment
                     (ticket_id, draft_id, baseline_text, compared_text,
                      judgment_kind, outcome, score, basis, absent_reason,
                      model, model_version, prompt, inputs)
                   values (%s, %s, %s, %s, 'semantic_difference',
                           %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                   returning assessment_id, outcome, created_at""",
                (ticket_id, ticket["draft_id"], baseline, compared,
                 judgment.outcome, judgment.score, judgment.basis,
                 judgment.absent_reason, judgment.model, judgment.model_version,
                 judgment.prompt, json.dumps(judgment.inputs)))
            if not recorded:
                # A write that reports success while storing nothing is finding
                # D1's shape. Never reported as done.
                return Answer(403, {
                    "error": "refused",
                    "reason": "the judgment was not recorded",
                    "kind": "silently_refused"})
            written = recorded[0]

    except psycopg.Error as error:
        database_said: Refused = classify(error)
        return Answer(database_said.status, database_said.as_body())

    return Answer(200, {
        "assessment_id": written["assessment_id"],
        "ticket_id": ticket_id,
        "judgment_kind": "semantic_difference",
        # The word the whole record turns on. 'absent' is a successful outcome.
        "outcome": written["outcome"],
        "score": judgment.score,
        "basis": judgment.basis,
        "absent_reason": judgment.absent_reason,
        "model": judgment.model,
        "model_version": judgment.model_version,
    })
