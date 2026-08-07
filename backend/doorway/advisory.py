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

import http.client
import json
import math
import os
import re
import threading
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
MAX_INPUT_CHARACTERS = 200_000

# How many judgments may be in flight at once. The second belt, and it is not
# the same belt as the transaction split below.
#
# The split stops this path holding a database connection while it waits, which
# is what could stop the WHOLE product. This bounds how many threads can be
# parked on one slow provider at all — ThreadingHTTPServer accepts unbounded
# concurrent requests, and a provider having a bad afternoon should degrade this
# one endpoint rather than the process. Deliberately below the serving pool's
# default max_size of 10, so that even if a future edit put a connection back
# inside the wait, it could not consume every one of them.
MAX_CONCURRENT_JUDGMENTS = 4
_JUDGMENT_SLOTS = threading.Semaphore(MAX_CONCURRENT_JUDGMENTS)

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


def _representable_text(value: str) -> bool:
    """Whether PostgreSQL/UTF-8 can carry provider text into evidence."""
    return "\x00" not in value and not any(
        0xD800 <= ord(char) <= 0xDFFF for char in value)


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

    if not model.strip() or not _representable_text(model):
        return _absent(
            f"the configured model name in {MODEL_VARIABLE} is not usable",
            model=DEFAULT_MODEL, prompt=prompt, inputs=inputs)

    key = os.environ.get(KEY_VARIABLE)
    if not key or not key.strip():
        return _absent(
            f"no model key is configured: {KEY_VARIABLE} is not set in the "
            "environment, so no judgment was obtained",
            model=model, prompt=prompt, inputs=inputs)

    if len(baseline) + len(compared) > MAX_INPUT_CHARACTERS:
        return _absent("the texts were too large to send to the model provider",
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
        headers={"content-type": "application/json"})
    # urllib's default redirect handler copies ordinary headers to the new
    # request, even when the host changes. An API key belongs only at ENDPOINT.
    request.add_unredirected_header("Authorization", f"Bearer {key.strip()}")

    if not _JUDGMENT_SLOTS.acquire(blocking=False):
        return _absent("the model provider is already at its concurrency limit",
                       model=model, prompt=prompt, inputs=inputs)
    try:
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:
                raw = reply.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    return _absent("the model's reply was too large to accept",
                                   model=model, prompt=prompt, inputs=inputs)
                payload = json.loads(raw.decode("utf-8"))
        finally:
            _JUDGMENT_SLOTS.release()
    except urllib.error.HTTPError as refused:
        # The provider's own status, not its body: a body can carry account
        # detail, and this string is written into an evidence row.
        return _absent(f"the model provider refused the call (HTTP {refused.code})",
                       model=model, prompt=prompt, inputs=inputs)
    except (urllib.error.URLError, http.client.HTTPException,
            TimeoutError, OSError) as unreachable:
        return _absent(f"the model could not be reached ({type(unreachable).__name__})",
                       model=model, prompt=prompt, inputs=inputs)
    except (ValueError, json.JSONDecodeError, RecursionError):
        return _absent("the model's reply was not readable",
                       model=model, prompt=prompt, inputs=inputs)

    if not isinstance(payload, dict):
        return _absent("the model answered, but its response was not a JSON object",
                       model=model, prompt=prompt, inputs=inputs)

    reported_model = payload.get("model")
    if reported_model is None:
        version = model
    elif (not isinstance(reported_model, str) or not reported_model.strip()
          or not _representable_text(reported_model)):
        return _absent("the model answered without usable model provenance",
                       model=model, prompt=prompt, inputs=inputs)
    else:
        version = reported_model
    try:
        content = payload["choices"][0]["message"]["content"]
        answered = json.loads(content)
        raw_score = answered["score"]
        if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
            raise TypeError("score is not a JSON number")
        score = float(raw_score)
        basis = answered.get("basis")
        if (basis is not None
                and (not isinstance(basis, str) or not _representable_text(basis))):
            raise TypeError("basis is not text")
    except (KeyError, IndexError, TypeError, ValueError, RecursionError):
        return _absent("the model answered, but not with a judgment in the "
                       "shape that was asked for",
                       model=model, model_version=version,
                       prompt=prompt, inputs=inputs)

    if not math.isfinite(score) or not 0.0 <= score <= 1.0:
        # Out of range is not a judgment to be clamped into one. Clamping would
        # turn a model that misunderstood the question into a confident number.
        return _absent("the model answered outside the range it was asked for",
                       model=model, model_version=version,
                       prompt=prompt, inputs=inputs)

    return Judgment(
        score=score,
        basis=basis or None,
        absent_reason=None,
        model=model, model_version=version, prompt=prompt, inputs=inputs)


# ── The risk-exposure judgment (NC-26, owner rulings U14a–U14d) ─────────────
#
# The second question the product asks a model, on the first one's seam. The
# range is -1..1 because the owner asked for BOTH directions: what a proposed
# move would cost before the buyer chooses, and what an accepted concession
# actually cost. Same never-raises contract, same _absent path — so the
# harness row guarding "a judgment nobody obtained is recorded as a number
# anyway" covers this judge for free. The call flow mirrors the semantic
# judge deliberately rather than sharing a helper: the harness keys on that
# function's lines, and a shared body would let one mutation cancel itself
# out across the two (the S110 shape).

RISK_EXPOSURE_PROMPT = (
    "A baseline contract clause and a proposed replacement follow. Estimate "
    "what fraction of risk moves between the parties if the replacement is "
    "accepted, as a number from -1 to 1: positive means risk moves TO the "
    "customer, negative means risk moves to the vendor, 0 means no material "
    "transfer. Reply with JSON only: "
    '{"score": <number>, "basis": "<one sentence>"}.'
)


def judge_risk_exposure(baseline: str, compared: str) -> Judgment:
    """Ask the model how much risk a change transfers, and in which direction.

    Never raises; every failure is an absence with its reason, because a
    buyer is never blocked by a judgment being unavailable — advice that
    gates action has become a decision (NC-26's model-down rule).
    """
    model = os.environ.get(MODEL_VARIABLE) or DEFAULT_MODEL
    prompt = RISK_EXPOSURE_PROMPT
    inputs = [
        {"name": "baseline", "characters": len(baseline)},
        {"name": "compared", "characters": len(compared)},
    ]

    if not model.strip() or not _representable_text(model):
        return _absent(
            f"the configured model name in {MODEL_VARIABLE} is not usable",
            model=DEFAULT_MODEL, prompt=prompt, inputs=inputs)

    key = os.environ.get(KEY_VARIABLE)
    if not key or not key.strip():
        return _absent(
            f"no model key is configured: {KEY_VARIABLE} is not set in the "
            "environment, so no judgment was obtained",
            model=model, prompt=prompt, inputs=inputs)

    if len(baseline) + len(compared) > MAX_INPUT_CHARACTERS:
        return _absent("the texts were too large to send to the model provider",
                       model=model, prompt=prompt, inputs=inputs)

    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": json.dumps(
                {"baseline": baseline, "compared": compared})},
        ],
        "temperature": 0,
    }).encode("utf-8")

    request = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"content-type": "application/json"})
    request.add_unredirected_header("Authorization", f"Bearer {key.strip()}")

    if not _JUDGMENT_SLOTS.acquire(blocking=False):
        return _absent("the model provider is already at its concurrency limit",
                       model=model, prompt=prompt, inputs=inputs)
    try:
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:
                raw = reply.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    return _absent("the model's reply was too large to accept",
                                   model=model, prompt=prompt, inputs=inputs)
                payload = json.loads(raw.decode("utf-8"))
        finally:
            _JUDGMENT_SLOTS.release()
    except urllib.error.HTTPError as refused:
        return _absent(f"the model provider refused the call (HTTP {refused.code})",
                       model=model, prompt=prompt, inputs=inputs)
    except (urllib.error.URLError, http.client.HTTPException,
            TimeoutError, OSError) as unreachable:
        return _absent(f"the model could not be reached ({type(unreachable).__name__})",
                       model=model, prompt=prompt, inputs=inputs)
    except (ValueError, json.JSONDecodeError, RecursionError):
        return _absent("the model's reply was not readable",
                       model=model, prompt=prompt, inputs=inputs)

    if not isinstance(payload, dict):
        return _absent("the model answered, but its response was not a JSON object",
                       model=model, prompt=prompt, inputs=inputs)

    reported_model = payload.get("model")
    if reported_model is None:
        version = model
    elif (not isinstance(reported_model, str) or not reported_model.strip()
          or not _representable_text(reported_model)):
        return _absent("the model answered without usable model provenance",
                       model=model, prompt=prompt, inputs=inputs)
    else:
        version = reported_model
    try:
        content = payload["choices"][0]["message"]["content"]
        answered = json.loads(content)
        raw_score = answered["score"]
        if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
            raise TypeError("score is not a JSON number")
        score = float(raw_score)
        basis = answered.get("basis")
        if (basis is not None
                and (not isinstance(basis, str) or not _representable_text(basis))):
            raise TypeError("basis is not text")
    except (KeyError, IndexError, TypeError, ValueError, RecursionError):
        return _absent("the model answered, but not with a judgment in the "
                       "shape that was asked for",
                       model=model, model_version=version,
                       prompt=prompt, inputs=inputs)

    if not math.isfinite(score) or not -1.0 <= score <= 1.0:
        # Out of range is not a judgment to be clamped into one.
        return _absent("the model answered outside the range it was asked for",
                       model=model, model_version=version,
                       prompt=prompt, inputs=inputs)

    return Judgment(
        score=score,
        basis=basis or None,
        absent_reason=None,
        model=model, model_version=version, prompt=prompt, inputs=inputs)


# ── The intake proposal (AI-3) ──────────────────────────────────────────────
#
# THE THIRD THING THIS PRODUCT ASKS A MODEL, and the first where the answer is
# not an opinion about a number but a PROPOSAL a person will act on. A requester
# describes what they are buying in their own words; the model proposes which
# risk categories that raises and how severe each is.
#
# WHAT IT MAY NOT DO, and none of these is stylistic:
#
#   · IT MAY NOT INVENT A CATEGORY. It is told the exact list it may choose
#     from — the caller's own library, read through the caller's own connection
#     — and anything outside that list is dropped by intake.py and RECORDED as
#     dropped. Two faults have to stay apart: "the model invented a category"
#     and "the library lacks one". Conflating them is how a real coverage gap
#     gets written off as a hallucination.
#
#   · IT MAY NOT AUTHOR CONTRACT LANGUAGE (ADR-0001). It never sees clause text
#     and is never asked for any. What it writes is one sentence of reasoning
#     attached to a proposed risk, which the requester reads, edits and adopts
#     as their own before anything is recorded. The clause wording is chosen
#     afterwards, by the deterministic engine, from the approved library.
#
#   · IT MAY NOT DECIDE ANYTHING. What comes back is a proposal, drawn on the
#     screen as not-yet-agreed until a named person confirms it.
#
# UNLIKE THE TWO JUDGMENTS ABOVE, THIS ONE HAS A DETERMINISTIC TWIN — ADR-0005's
# ordinary case. When this returns an absence, intake.py runs the keyword
# classifier and the requester's work continues. Nobody is blocked because a
# provider was down or a budget was spent.

INTAKE_PROMPT = (
    "You are helping a procurement buyer describe a purchase so that a "
    "contract can be assembled. Their answers to a checklist follow, with the "
    "list of risk categories this organisation actually defines. Decide which "
    "of those categories the purchase raises, and how severe each is. "
    "Use ONLY categories from the list given; never invent one. Severity is "
    'exactly "High" or "Standard". For each, give one sentence of reasoning '
    "grounded in what they wrote. If the answers raise none of the categories, "
    "return an empty list — that is a real answer. Reply with JSON only: "
    '{"risks": [{"category": "<from the list>", '
    '"severity": "High" or "Standard", "reason": "<one sentence>"}]}.'
)

# A proposal is bounded for the reason the manifest is bounded: this is a
# record, not an archive, and an unbounded list from a provider is an unbounded
# write.
MAX_PROPOSED_RISKS = 40
MAX_REASON_CHARACTERS = 500


@dataclass(frozen=True)
class Proposal:
    """What the model proposed, or honestly what it did not.

    `risks is None` and `absent_reason is not None` are the same fact twice,
    exactly as Judgment does it — so nothing downstream has to interpret a null.

    AN EMPTY LIST IS A REAL ANSWER: "nothing here raises a risk". `None` means
    nobody answered. Collapsing those two is the worst bug this file could
    ship, because one of them means the requester's purchase is genuinely
    low-risk and the other means the model was never reached.
    """

    risks: list | None
    absent_reason: str | None
    model: str
    model_version: str
    prompt: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    # WAS A PROVIDER ACTUALLY CONTACTED? False only where this module declined
    # to dispatch anything at all — no key, an unusable model name, no
    # categories to choose from, answers too large to send, or every provider
    # slot already taken. THIS IS WHAT THE DAILY BUDGET IS BILLED ON (0068): a
    # call nobody made cost nothing, and counting it ran a keyless deployment's
    # allowance to zero and then told requesters the budget was spent — which
    # was not true. Defaults True so that every path from the dispatch onward,
    # including a provider refusal or an unreadable reply, is billed.
    asked: bool = True

    @property
    def outcome(self) -> str:
        """The three values cw.model_call.outcome accepts, and they are three
        for a reason 0066 wrote down and 0068 finished: "the model was not
        asked" and "the model was asked and could not answer" are different
        facts, and collapsing them hides a system that never asks at all."""
        if self.risks is not None:
            return "answered"
        return "absent" if self.asked else "not_asked"


def _no_proposal(reason: str, *, model: str, prompt: str,
                 model_version: str = UNKNOWN_VERSION,
                 asked: bool = True) -> Proposal:
    """No proposal, said plainly. `_absent`'s argument, in this shape.

    `asked=False` at every site that returns BEFORE the request is dispatched.
    """
    return Proposal(risks=None, absent_reason=reason, model=model,
                    model_version=model_version, prompt=prompt, asked=asked)


def propose_intake_manifest(answers: list, categories: list,
                            token_ceiling: int) -> Proposal:
    """Ask the model which risks a requester's own words raise.

    Never raises. Every way this can fail — no key, no network, a refusal, a
    reply in the wrong shape — comes back as an absence with its reason, and
    intake.py then runs the keyword classifier instead.
    """
    model = os.environ.get(MODEL_VARIABLE) or DEFAULT_MODEL
    prompt = INTAKE_PROMPT

    # ── Nothing below this point has been dispatched yet ────────────────────
    # Every refusal until the urlopen call is `asked=False`: no provider was
    # contacted, nothing was spent, and 0068 does not bill it. The reason still
    # travels to the screen and still lands on the ledger.
    if not model.strip() or not _representable_text(model):
        return _no_proposal(
            f"the configured model name in {MODEL_VARIABLE} is not usable",
            model=DEFAULT_MODEL, prompt=prompt, asked=False)

    key = os.environ.get(KEY_VARIABLE)
    if not key or not key.strip():
        return _no_proposal(
            f"no model key is configured: {KEY_VARIABLE} is not set in the "
            "environment, so the deterministic classifier answered instead",
            model=model, prompt=prompt, asked=False)

    if not categories:
        # Nothing to choose from. Asking anyway would invite exactly the
        # invented category the whole design refuses.
        return _no_proposal(
            "this library defines no risk categories, so there was nothing "
            "for a model to choose from",
            model=model, prompt=prompt, asked=False)

    question = json.dumps({
        "categories": categories,
        "answers": [{"question": entry.get("probe"), "answer": entry.get("text")}
                    for entry in answers],
    })
    if len(question) > MAX_INPUT_CHARACTERS:
        return _no_proposal(
            "the answers were too large to send to the model provider",
            model=model, prompt=prompt, asked=False)

    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": question},
        ],
        # The owner's per-call budget (0066). SENT rather than assumed: a
        # ceiling nobody transmits is a ceiling nobody enforces.
        "max_tokens": token_ceiling,
        "temperature": 0,
    }).encode("utf-8")

    request = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"content-type": "application/json"})
    request.add_unredirected_header("Authorization", f"Bearer {key.strip()}")

    if not _JUDGMENT_SLOTS.acquire(blocking=False):
        return _no_proposal(
            "the model provider is already at its concurrency limit",
            model=model, prompt=prompt, asked=False)
    # ── From here on a request is dispatched, and every outcome is billed ────
    try:
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as reply:
                raw = reply.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    return _no_proposal(
                        "the model's reply was too large to accept",
                        model=model, prompt=prompt)
                payload = json.loads(raw.decode("utf-8"))
        finally:
            _JUDGMENT_SLOTS.release()
    except urllib.error.HTTPError as refused:
        return _no_proposal(
            f"the model provider refused the call (HTTP {refused.code})",
            model=model, prompt=prompt)
    except (urllib.error.URLError, http.client.HTTPException,
            TimeoutError, OSError) as unreachable:
        return _no_proposal(
            f"the model could not be reached ({type(unreachable).__name__})",
            model=model, prompt=prompt)
    except (ValueError, json.JSONDecodeError, RecursionError):
        return _no_proposal("the model's reply was not readable",
                            model=model, prompt=prompt)

    if not isinstance(payload, dict):
        return _no_proposal(
            "the model answered, but its response was not a JSON object",
            model=model, prompt=prompt)

    reported_model = payload.get("model")
    if reported_model is None:
        version = model
    elif (not isinstance(reported_model, str) or not reported_model.strip()
          or not _representable_text(reported_model)):
        return _no_proposal("the model answered without usable model provenance",
                            model=model, prompt=prompt)
    else:
        version = reported_model

    usage = payload.get("usage")
    usage = usage if isinstance(usage, dict) else {}

    def _tokens(name):
        value = usage.get(name)
        # Null rather than zero when the provider said nothing. A zero here
        # understates spend in the exact figure somebody budgets from.
        return value if isinstance(value, int) and not isinstance(value, bool) \
            else None

    try:
        content = payload["choices"][0]["message"]["content"]
        answered = json.loads(content)
        raw_risks = answered["risks"]
        if not isinstance(raw_risks, list):
            raise TypeError("risks is not a list")
    except (KeyError, IndexError, TypeError, ValueError, RecursionError):
        return _no_proposal(
            "the model answered, but not with a proposal in the shape that "
            "was asked for",
            model=model, model_version=version, prompt=prompt)

    if len(raw_risks) > MAX_PROPOSED_RISKS:
        return _no_proposal(
            f"the model proposed more than {MAX_PROPOSED_RISKS} risks, which "
            "is past what a manifest is",
            model=model, model_version=version, prompt=prompt)

    # SHAPED HERE, JUDGED IN intake.py. This function proves the reply is
    # well-formed text. Whether a category is one the library defines is a
    # question about the caller's own library, and it is asked — and its answer
    # recorded — where that library is already open.
    proposed = []
    for entry in raw_risks:
        if not isinstance(entry, dict):
            return _no_proposal(
                "the model proposed something that is not a risk",
                model=model, model_version=version, prompt=prompt)
        category = entry.get("category")
        severity = entry.get("severity")
        reason = entry.get("reason")
        if (not isinstance(category, str) or not category.strip()
                or not _representable_text(category)):
            return _no_proposal(
                "the model proposed a risk with no usable category",
                model=model, model_version=version, prompt=prompt)
        if severity not in ("High", "Standard"):
            # NOT coerced to Standard. A severity the model did not choose,
            # written as though it did, is the manufactured confidence
            # `_absent` exists to prevent, one shape up.
            return _no_proposal(
                "the model proposed a severity outside High and Standard",
                model=model, model_version=version, prompt=prompt)
        if reason is not None and (not isinstance(reason, str)
                                   or not _representable_text(reason)):
            return _no_proposal(
                "the model proposed a reason that is not text",
                model=model, model_version=version, prompt=prompt)
        proposed.append({
            "category": category.strip(),
            "severity": severity,
            "reason": (reason or "").strip()[:MAX_REASON_CHARACTERS],
        })

    return Proposal(
        risks=proposed, absent_reason=None, model=model, model_version=version,
        prompt=prompt, prompt_tokens=_tokens("prompt_tokens"),
        completion_tokens=_tokens("completion_tokens"))


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
    ticket_text = str(asked.get("ticket_id") or "").strip()
    if re.fullmatch(r"[0-9]{1,19}", ticket_text) is None:
        return Answer(400, {"error": "refused",
                            "reason": "name the ticket to be judged",
                            "kind": "rejected"})
    ticket_id = int(ticket_text)

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

        # ── The model call, holding NOTHING ─────────────────────────────────
        #
        # Outside the `with` above, and that placement is the whole fix. The
        # call is allowed TIMEOUT_SECONDS, the serving pool holds max_size=10
        # connections, and the server accepts unbounded concurrent requests —
        # so ten simultaneous assessments used to occupy every connection the
        # service had, for up to twenty seconds each. Sign-in and every other
        # screen queued behind them, and the error they eventually got said the
        # service could not reach its database, which was sitting there
        # perfectly healthy. Someone would have spent an afternoon on that.
        #
        # Nothing requires the read and the write to be atomic. The judgment is
        # advisory by this module's own definition, and the insert is a single
        # row that either lands or does not.
        #
        # WHAT THE WINDOW MEANS, decided here rather than left to be discovered:
        # the ticket may be decided, withdrawn or re-texted while the model is
        # thinking. The row still stands, because it stores `baseline_text` and
        # `compared_text` verbatim — it is a judgment about those two frozen
        # texts, and it says so in its own columns. If the ticket itself is gone
        # by then, the foreign key refuses the insert and the caller gets a
        # classified refusal rather than a row about nothing.
        judgment = judge_semantic_difference(baseline, compared)

        # ── The write, in its own short transaction ─────────────────────────
        #
        # Reopened as the same caller, so authority is checked again against the
        # roles in force now. A person revoked during the window is refused here
        # by the database, in its own words.
        with db.as_person(caller.person, caller.role) as request:
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
