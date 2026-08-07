"""The front door: a probe walk, a model that proposes, and a classifier behind it.

WHAT THIS FILE IS

AI-1 and AI-3 of the front-half plan (AI-FRONT-HALF-ARCHITECTURE-2026-08-02),
in the order ADR-0005 demands them.

A requester answers a fixed checklist of questions in plain words. THE MODEL
READS THOSE ANSWERS and proposes which risk categories the purchase raises and
how severe each is — that is the product. BEHIND IT, and only when the model
cannot answer, a keyword classifier assembles a manifest mechanically from the
same answers. It is a fallback and is labelled as one everywhere it appears.

WHICH PATH RAN IS ALWAYS IN THE ANSWER, and it is not decoration: a proposal a
model made and a proposal a word list made deserve different amounts of trust
from the person reading them, and the screen says which they are looking at.
The manifest's own `source` carries it onward — 'llm' or 'fallback' — into the
run record, permanently (0005's check constraint names both).

THE MODEL IS NOT ASKED when there is no key, when today's budget is spent
(0066), or when the library defines no categories for it to choose from. Each
of those is a REASON, returned in the answer, never a silent degradation.

WHERE THE QUESTIONS AND TERM LISTS LIVE

`intake_walk.json`, next to this file — probes and term lists are CONTENT
(placeholder until Legal reviews them, CLAUDE.md 2026-07-27), so they live as
data a reviewer can edit without touching code, and no test pins a word of
them. `CLAUSEWERK_INTAKE_WALK` overrides the path, the same environment-shaped
door advisory.py already uses for its configuration; the tests walk through it
with synthetic content so the shipped words stay unpinned.

THE ONE RULE THAT MATTERS MOST HERE

EITHER PATH proposes only categories THE CALLER'S OWN LIBRARY defines, read
through the caller's own connection exactly as manifests.py reads them.

For the keyword path that is structural: a term list for a category nobody
created proposes nothing, so it cannot invent one at all.

For the model path it is enforced, in `keep_known_categories` below. The model
is told the exact list it may choose from; anything it returns outside that list
is DROPPED AND RECORDED as dropped, never quietly kept and never quietly lost.
That recording is the point. Two faults have to stay apart — "the model invented
a category" and "the library lacks a category" — and a dropped proposal that
nobody wrote down makes the first look like the second, which is how a real
coverage gap gets written off as a hallucination.

WHAT THIS FILE DOES NOT DECIDE

Whether the proposed manifest is honest is the engine's question — the caller
feeds the proposal to POST /manifests/check and then POST /runs, unchanged.
Whether the term lists are any GOOD is Legal's question: an answer no term
matched is returned in `unmatched`, visibly, because a silently dropped answer
would make a coverage gap invisible — and making gaps visible is the product
boundary's whole job.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import psycopg

from doorway import advisory
from doorway.db import Database
from doorway.identity import Caller
from doorway.manifests import Answer
from doorway.refusals import Refused, classify
from doorway.writes import WrongShape, refuse_structured

WALK_VARIABLE = "CLAUSEWERK_INTAKE_WALK"
DEFAULT_WALK = Path(__file__).resolve().parent / "intake_walk.json"

# The same fan-out logic as manifests.MAX_RISKS, one layer earlier: each answer
# is compared against every term list and can become an audit payload entry.
MAX_ANSWERS = 200
MAX_ANSWER_CHARACTERS = 10_000
# A justification is the requester's own words, quoted. Quoted, not summarised
# — but bounded, because the whole answer may be pages and the manifest is a
# record, not an archive.
JUSTIFICATION_CHARACTERS = 500

# What the manifest says produced it — the two values cw.run.manifest_source
# accepts for this door (0005 names a third, 'manual', for a person typing one
# by hand on the deals screen).
#
# THESE ARE NOT DECORATION. A run assembled from a model's proposal and one
# assembled from a keyword list are different artefacts, and the difference has
# to survive into the record: six months later somebody asks how a category got
# onto a signed contract, and "a model proposed it and a named person confirmed
# it" is a different answer from "a word list matched it and a named person
# confirmed it". Both are honest. They are not the same.
MODEL_SOURCE = "llm"
FALLBACK_SOURCE = "fallback"


class BadWalk(Exception):
    """The walk file is missing or not the shape this module reads. A
    deployment fault, not a caller mistake — it answers 500, never 400."""


def load_walk(path: str | os.PathLike | None = None) -> dict:
    """The probe checklist and term lists, from disk.

    Read per request rather than cached: the file is content under review, and
    a reviewer's edit taking effect on the next request is worth more than the
    microseconds a cache would save. Shape-checked here so a malformed edit
    fails loudly at the door instead of half-working in the classifier.
    """
    chosen = Path(path or os.environ.get(WALK_VARIABLE) or DEFAULT_WALK)
    try:
        walk = json.loads(chosen.read_text(encoding="utf-8"))
    except (OSError, ValueError) as broken:
        raise BadWalk(f"the intake walk could not be read: {broken}") from broken

    probes = walk.get("probes")
    terms = walk.get("terms")
    if not isinstance(probes, list) or not isinstance(terms, dict):
        raise BadWalk("the intake walk names 'probes' and 'terms'")
    for probe in probes:
        if not isinstance(probe, dict) or not str(probe.get("id") or "").strip() \
                or not str(probe.get("asks") or "").strip():
            raise BadWalk("every probe carries an id and a question")
    for key, lists in terms.items():
        if not isinstance(lists, dict) \
                or not isinstance(lists.get("match"), list):
            raise BadWalk(f"term list '{key}' carries a 'match' list")
        if "high" in lists and not isinstance(lists["high"], list):
            raise BadWalk(f"term list '{key}' has a 'high' that is not a list")
    return walk


def probes(db: Database, caller: Caller, walk_path=None) -> Answer:
    """GET /intake/probes — the checklist, filtered to the caller's library.

    A probe tied to a category the library does not define is withheld, not
    shown: asking a question whose answer can never become a risk would walk
    the requester into the exact silent drop `unmatched` exists to prevent.
    General probes (category null) always appear.
    """
    try:
        walk = load_walk(walk_path)
    except BadWalk as broken:
        return Answer(500, {"error": "service", "reason": str(broken)})

    try:
        with db.as_person(caller.person, caller.role) as request:
            known = {row["key"] for row in request.rows(
                "select key from cw.category order by key")}
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    shown = [
        {"id": probe["id"], "asks": probe["asks"],
         "category": probe.get("category")}
        for probe in walk["probes"]
        if probe.get("category") is None or probe["category"] in known
    ]
    return Answer(200, {"version": walk.get("version"), "probes": shown})


# ── Reading a denial (2026-08-05) ───────────────────────────────────────────
#
# THE DEFECT THIS ANSWERS. Matching used to be case-blind substring over the
# WHOLE answer, so a requester writing "No personal data is involved in this
# purchase" contained the phrase "personal data" and had Data Privacy proposed
# at them — the opposite of what they had just said. Severity had the same
# fault: "no health data" contained "health" and read as High.
#
# WHAT IT DOES NOW, IN THE ONE SENTENCE A REQUESTER GETS: a term still counts
# wherever it appears, EXCEPT where the few words immediately before it, in the
# same sentence, deny it.
#
# WHY IT LEANS TOWARDS PROPOSING, AND WHY THAT MUST NOT BE "IMPROVED" AWAY.
# Two mistakes are possible here and they are nowhere near equally bad.
# Proposing a risk that is not there costs the requester a few seconds and one
# removal on a screen they have to read anyway. MISSING a risk that is there
# means a contract gets assembled without a clause it needed, and nobody finds
# out at the time. So every doubtful case resolves the same way — PROPOSE:
#
#   · a denial further back than NEGATION_WINDOW words does not count
#   · a denial in another sentence does not count
#   · a denial before "but", "however", "except" … does not carry past it
#   · two denials in the window cancel ("not without personal data")
#   · A DENIAL THAT IS REALLY AN EXPRESSION OF DOUBT does not count at all —
#     "it is not clear whether personal data is involved" says nobody knows,
#     which is the single strongest reason to put the risk on the screen and
#     let a person decide. Not knowing is not the same as saying no.
#   · anything at all that goes wrong falls back to plain substring matching
#
# The next person here will be tempted to make this cleverer. The property
# worth keeping is not cleverness: it is that the errors stay on the side that
# a person can see and undo. This is ADR-0005's fallback, not the product — the
# model reads these answers when it can — so buying a little accuracy with a
# silent drop would be a bad trade even if the cleverness worked.

# How far back a denial reaches, in words. Small on purpose: "we are not sure —
# we process personal data" must still propose.
NEGATION_WINDOW = 3

# Ordinary denials. Contractions ("don't", "won't", "isn't") are caught by the
# n't ending rather than listed, so the list stays short enough to read.
NEGATION_CUES = frozenset({
    "no", "not", "never", "none", "nothing", "neither", "nor", "without",
    "cannot", "exclude", "excludes", "excluded", "excluding",
})

# WORDS THAT TURN A DENIAL INTO A SHRUG. "We are not SURE if personal data is
# involved" wears the same "not" as "we will not process personal data" and
# means the opposite thing: the first says nobody knows yet, and nobody knowing
# is the strongest possible reason to show the risk to a person. When one of
# these sits between the denial and the term, the denial is set aside and the
# risk is proposed.
#
# THE KNOWN COST OF THIS LIST, ACCEPTED ON REVIEW 2026-08-05 — READ THIS BEFORE
# "FIXING" IT. A genuine denial that happens to contain one of these words is
# now proposed as well: "no clear personal-data requirement exists" raises Data
# Privacy even though it is a no. That looks like an obvious bug and it is a
# deliberate trade. The alternative — tightening the list so that sentence goes
# quiet — brings back the case this list exists for, where a requester says
# "we are not sure if personal data is involved" and the screen answers with
# silence. An unnecessary proposal is removed with one click by somebody who is
# reading the screen anyway. An unanswered question that nobody was shown ends
# up in a signed contract. Do not trade the second away to remove the first.
UNCERTAINTY_MARKERS = frozenset({
    "clear", "sure", "certain", "known", "know", "knows", "whether", "if",
    "yet", "confirmed", "confirm", "determined", "decided", "established",
    "aware", "verified", "checked", "say",
})

# Where a denial stops carrying: the end of a sentence, or a word that turns
# the sentence around. "We hold no personal data but we do process payroll
# records" denies the first and not the second.
_SCOPE_BREAK = re.compile(
    r"[.!?;:\n\r]+"
    r"|\bbut\b|\bhowever\b|\balthough\b|\bthough\b|\bwhereas\b"
    r"|\bexcept\b|\bunless\b|\baside from\b|\bapart from\b|\bother than\b")
_WORD = re.compile(r"[a-z0-9']+")


def _is_denial(word: str) -> bool:
    return word in NEGATION_CUES or word.endswith("n't")


def _scopes(lowered: str) -> list[tuple[str, list[tuple[int, int, str]]]]:
    """The answer cut into stretches a denial can reach across, each with its
    words and where they sit."""
    scopes = []
    for piece in _SCOPE_BREAK.split(lowered):
        if piece:
            scopes.append((piece, [(m.start(), m.end(), m.group())
                                   for m in _WORD.finditer(piece)]))
    return scopes


def _denied(words: list[tuple[int, int, str]], at: int) -> bool:
    """Do the words just before position `at` deny what follows?

    Only words BEFORE the term are read, deliberately. Reading the whole
    stretch would let "we process personal data, and there is no health data"
    deny its own first half — a silent drop, the failure that costs most.

    A denial followed by a word of doubt is not counted at all — see
    UNCERTAINTY_MARKERS. "Not clear whether", "not sure if", "have not
    confirmed", "do not know if" are people telling us they do not know, and
    the answer to not knowing is to show the risk, never to hide it.
    """
    before = [word for _, end, word in words if end <= at]
    window = before[-NEGATION_WINDOW:]

    denials = 0
    for position, word in enumerate(window):
        if not _is_denial(word):
            continue
        if any(later in UNCERTAINTY_MARKERS for later in window[position + 1:]):
            continue                       # doubt, not denial — propose.
        denials += 1
    # Odd, not "any": a second denial turns it back round again.
    return denials % 2 == 1


def _reader(text: str):
    """Give back a function answering: does this term appear somewhere the
    surrounding words do not deny?

    NEVER RAISES. If the sentence cannot be read for any reason at all, the
    answer falls back to the old plain substring test — which over-proposes,
    which is the safe direction. This classifier is what runs when the model
    cannot, and a requester's work must not stop because of it.
    """
    lowered = text.lower()
    try:
        scopes = _scopes(lowered)
    except Exception:                                    # pragma: no cover
        return lambda term: term in lowered

    def appears(term: str) -> bool:
        term = str(term).lower().strip()
        if not term:
            return False
        try:
            for piece, words in scopes:
                at = piece.find(term)
                while at != -1:
                    if not _denied(words, at):
                        return True
                    at = piece.find(term, at + 1)
            return False
        except Exception:                                # pragma: no cover
            return term in lowered

    return appears


def classify_answers(answers: list[dict], terms: dict,
                     known: dict[str, str]) -> tuple[list[dict], list[str]]:
    """The keyword classifier, pure: answers + term lists + the caller's
    category vocabulary in, proposed risks and unmatched probe ids out.

    Matching is case-blind substring, minus denials — still the simplest thing
    that can be explained in one sentence to the person whose answer it
    classified: a term counts wherever it appears, except where the few words
    just before it, in the same sentence, say it is not there.
    Severity is High when any high-term appears undenied, Standard otherwise;
    two answers hitting one category merge, High winning, first quote kept.
    """
    proposed: dict[str, dict] = {}
    unmatched: list[str] = []

    for answer in answers:
        text = answer["text"]
        appears = _reader(text)
        hit = False
        for key, lists in terms.items():
            if key not in known:
                # A term list for a category nobody created proposes nothing —
                # the rule in the header. The gap belongs to whoever curates
                # the walk file, and /intake/probes already withholds the probe.
                continue
            if not any(appears(term) for term in lists["match"]):
                continue
            hit = True
            # Severity reads denials too. "No health data is involved" must not
            # arrive as High — it was the same one-word fault as the match.
            high = any(appears(term) for term in lists.get("high", []))
            already = proposed.get(key)
            if already is None:
                proposed[key] = {
                    "category": known[key],
                    "severity": "High" if high else "Standard",
                    "justification": text[:JUSTIFICATION_CHARACTERS],
                }
            elif high:
                already["severity"] = "High"
        if not hit:
            unmatched.append(answer["probe"])

    return list(proposed.values()), unmatched


def keep_known_categories(proposed: list[dict],
                          known: dict[str, str]) -> tuple[list[dict], list[str]]:
    """The model's proposal, narrowed to categories this library defines.

    THE RULE THE MODEL PATH RESTS ON. The model is told the exact list it may
    choose from and told never to invent one; this is what happens when it does
    anyway. Anything outside the list is removed from the proposal AND RETURNED
    — never silently kept, which would push an invented category at the trust
    boundary, and never silently dropped, which would hide the fact that it
    happened.

    Matching is on the LABEL, because the label is what a manifest carries and
    what the trust boundary checks (manifests.py). The keys are the database's
    own business.

    Two proposals for one category merge, High winning — the keyword path's
    rule, kept identical so the two paths cannot disagree about what a
    duplicate means.
    """
    labels = {label: label for label in known.values()}
    kept: dict[str, dict] = {}
    invented: list[str] = []

    for risk in proposed:
        category = str(risk.get("category") or "").strip()
        if category not in labels:
            if category and category not in invented:
                invented.append(category)
            continue
        severity = risk.get("severity") if risk.get("severity") in (
            "High", "Standard") else "Standard"
        already = kept.get(category)
        if already is None:
            kept[category] = {
                "category": category,
                "severity": severity,
                # THE MODEL'S OWN SENTENCE, and it is labelled as the model's
                # by the `source` on the manifest. The requester reads it,
                # edits it if they disagree, and adopts it by confirming — at
                # which point it is theirs. It is never contract language: it
                # is why a risk is in scope, and no clause wording comes from
                # here (ADR-0001).
                "justification": str(risk.get("reason") or "")[
                    :JUSTIFICATION_CHARACTERS],
            }
        elif severity == "High":
            already["severity"] = "High"

    return list(kept.values()), invented


def classify_intake(db: Database, caller: Caller, body: dict | None,
                    walk_path=None) -> Answer:
    """POST /intake/classify — plain answers in, a proposed manifest out.

    The proposal is exactly what POST /manifests/check takes, source `intake`,
    and it goes back to the requester's screen, not onward: nothing proceeds on
    a manifest the requester has not seen and submitted themselves. An intake
    with no matched risk still answers 200 — the engine's own "a manifest
    carries at least one risk" is the guard, and this file does not restate it.
    """
    body = body or {}
    try:
        refuse_structured("vendor", body.get("vendor"))
        refuse_structured("value", body.get("value"))
    except WrongShape as wrong:
        return Answer(400, {"error": "refused", "reason": str(wrong),
                            "kind": "rejected"})
    for field in ("vendor", "value"):
        if field in body and body[field] is not None \
                and not isinstance(body[field], str):
            return Answer(400, {"error": "refused", "kind": "rejected",
                                "reason": f"{field} must be text"})

    vendor = str(body.get("vendor") or "").strip()
    if not vendor:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "an intake names the vendor it is about"})

    raw = body.get("answers")
    if not isinstance(raw, list) or not raw:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "an intake carries at least one answer"})
    if len(raw) > MAX_ANSWERS:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": f"an intake carries at most {MAX_ANSWERS}"
                                      " answers; split the work"})

    answers = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            return Answer(400, {"error": "refused", "kind": "rejected",
                                "reason": f"answer {index} is not an answer"})
        try:
            for field in ("probe", "text"):
                refuse_structured(f"answer {index} {field}", entry.get(field))
        except WrongShape as wrong:
            return Answer(400, {"error": "refused", "reason": str(wrong),
                                "kind": "rejected"})
        for field in ("probe", "text"):
            if field in entry and entry[field] is not None \
                    and not isinstance(entry[field], str):
                return Answer(400, {
                    "error": "refused", "kind": "rejected",
                    "reason": f"answer {index} {field} must be text"})
        probe = str(entry.get("probe") or "").strip()
        text = str(entry.get("text") or "").strip()
        if not probe:
            return Answer(400, {"error": "refused", "kind": "rejected",
                                "reason": f"answer {index} names no probe"})
        if len(text) > MAX_ANSWER_CHARACTERS:
            return Answer(400, {
                "error": "refused", "kind": "rejected",
                "reason": f"answer {index} exceeds {MAX_ANSWER_CHARACTERS}"
                          " characters; split the work"})
        if text:
            answers.append({"probe": probe, "text": text})

    if not answers:
        return Answer(400, {"error": "refused", "kind": "rejected",
                            "reason": "every answer is blank"})

    try:
        walk = load_walk(walk_path)
    except BadWalk as broken:
        return Answer(500, {"error": "service", "reason": str(broken)})

    try:
        with db.as_person(caller.person, caller.role) as request:
            known = {row["key"]: row["label"] for row in request.rows(
                "select key, label from cw.category order by key")}

            # ── Is there budget to ask? ──────────────────────────────────
            # A COUNT, NOT A PERMISSION (0066). The function answers today's
            # calls and the two limits; the decision to fall back is taken
            # here, in the open, and its reason travels to the screen.
            allowance = request.rows("select * from cw.model_calls_today()")[0]
            spent = int(allowance["calls_today"] or 0)
            allowed = int(allowance["calls_allowed"] or 0)
            ceiling = int(allowance["tokens_per_call"] or 0)

            proposal = None
            if spent >= allowed:
                model_absence = (
                    f"today's model budget is spent ({spent} of {allowed} "
                    "calls); the deterministic classifier answered instead")
            else:
                # THE MODEL CALL HAPPENS INSIDE THE CALLER'S TRANSACTION, and
                # that is a deliberate exception to the B2 rule that slow
                # outside parties are talked to between blocks. The reason:
                # the budget count and the ledger row must not race — two
                # requesters classifying at once must not both see 199. The seam
                # bounds the wait at TIMEOUT_SECONDS and never raises, so the
                # transaction cannot be held open by a hanging provider.
                proposal = advisory.propose_intake_manifest(
                    answers, sorted(known.values()), ceiling)
                model_absence = proposal.absent_reason

                # THE LEDGER ROW GOES IN EITHER WAY. A call that failed is a
                # fact, and one nobody recorded makes the model look more
                # reliable than it is — the figure AI-7 reports on.
                #
                # RECORDED IS NOT THE SAME AS BILLED (0068). `proposal.outcome`
                # is 'not_asked' where the seam declined to dispatch anything —
                # no key, no categories, every slot taken — and the daily count
                # skips those rows. Billing them ran a keyless deployment's
                # allowance to zero and then told requesters the budget was
                # spent, which was false.
                request.write(
                    """insert into cw.model_call
                         (actor, purpose, model, model_version, outcome,
                          absent_reason, prompt_tokens, completion_tokens)
                       values (current_setting('cw.actor'), 'intake_manifest',
                               %(model)s, %(version)s, %(outcome)s,
                               %(absent_reason)s, %(prompt_tokens)s,
                               %(completion_tokens)s)""",
                    {"model": proposal.model, "version": proposal.model_version,
                     "outcome": proposal.outcome,
                     "absent_reason": proposal.absent_reason,
                     "prompt_tokens": proposal.prompt_tokens,
                     "completion_tokens": proposal.completion_tokens})

            # ── Which proposal is on the table ───────────────────────────
            if proposal is not None and proposal.risks is not None:
                source = MODEL_SOURCE
                risks, invented = keep_known_categories(proposal.risks, known)
                # The keyword path's `unmatched` has no meaning here: the model
                # read every answer together rather than one at a time, so
                # "this answer matched nothing" is not a fact this path holds.
                # Empty rather than absent — the field exists on both paths.
                unmatched = []
            else:
                source = FALLBACK_SOURCE
                risks, unmatched = classify_answers(answers, walk["terms"], known)
                invented = []

            # On the chain, accepted or empty — the same reasoning as
            # manifests.py's note: the audit insert grant decides who may use
            # this endpoint, uniformly, and what crossed the front door is
            # exactly what an auditor cannot reconstruct later.
            request.write(
                "select cw.audit(%(event)s, %(vendor)s, %(payload)s::jsonb)",
                {
                    "event": "intake_classified",
                    "vendor": vendor,
                    "payload": json.dumps({
                        "source": source,
                        "answers": len(answers),
                        "risks_proposed": [risk["category"] for risk in risks],
                        "unmatched": unmatched,
                        # WHAT THE MODEL PROPOSED AND THE LIBRARY DOES NOT
                        # DEFINE. On the chain rather than only on the screen:
                        # this is the evidence that separates "the model
                        # invented one" from "the library lacks one", and
                        # nobody can reconstruct it afterwards.
                        "not_in_library": invented,
                        "model": (proposal.model if proposal else None),
                        "model_version": (proposal.model_version
                                          if proposal else None),
                        "classified_by": (
                            "doorway.advisory.propose_intake_manifest"
                            if source == MODEL_SOURCE
                            else "doorway.intake.classify_answers"),
                    }),
                },
            )
    except psycopg.Error as error:
        refused: Refused = classify(error)
        return Answer(refused.status, refused.as_body())

    return Answer(200, {
        "vendor": vendor,
        "value": body.get("value"),
        # 'llm' or 'fallback' — what the screen shows and what the run records.
        "source": source,
        "risks": risks,
        # Probe ids whose answers matched no term list. Returned, not dropped:
        # a requester's words that classified as nothing are a fact the screen
        # must be able to show, and Legal's term lists are judged by it.
        # Always empty on the model path — see above.
        "unmatched": unmatched,
        # WHY THE MODEL DID NOT ANSWER, when it did not. Null on the model
        # path. The screen prints it; a fallback that looks identical to the
        # real thing is the degradation ADR-0005 exists to make visible.
        "model_absence": (None if source == MODEL_SOURCE else model_absence),
        # Categories the model proposed that this library does not define.
        # Shown, so the requester can tell Legal there may be a gap.
        "not_in_library": invented,
    })
