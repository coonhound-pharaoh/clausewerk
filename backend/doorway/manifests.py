"""The contract engine's first caller.

WHAT THIS FILE IS

The two halves of the product have never been connected. `backend/engine/` is
4,604 lines of tested Python that decides things — which clause covers which
risk, whether a manifest is honest, what a run may conclude — and until now
nothing called any of it. This is the join, and it starts with one check.

`check_manifest` is the trust boundary. A manifest is the only thing that crosses
from a language model into the deterministic core (ADR-0001), and a model asked
for categories will occasionally return one nobody defined. If that reaches
resolution it produces "no clause available in Ledger" — which reads, in the one
report the system is prized for, as a LIBRARY COVERAGE GAP. Legal would be told
to go and write a clause for a category that does not exist.

So the check exists to keep two facts apart:

    the model invented a category      — a fault in the model's output
    we have no clause for a category   — a fault in our library

They go to different people, and one of them must never be able to wear the
other's clothes.

THE BOUNDARY THIS FILE DOES NOT CROSS

The system checks that a category EXISTS in the library. Whether the library's
content is any good — whether the right categories are defined, whether the
clauses under them say the right things — belongs to the people who own the
library, not to the system. This file makes the gap visible and records it. It
does not have an opinion about it.

WHAT IS ADAPTED, AND WHICH WAY ROUND

The engine is not modified. It is tested as it stands, and a port that edits the
thing it is connecting to has changed two variables at once. Everything below
adapts the doorway's side: request body in, engine types out, engine's own
sentences back.

The category vocabulary is read THROUGH THE CALLER'S OWN CONNECTION, so the enum
the engine checks against is the one that person's role can actually see. Reading
it any other way would put a second, privileged path to the library beside the
one the whole doorway exists to be.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg

from doorway.db import Database
from doorway.identity import Caller
from doorway.refusals import Refused, classify
from engine.manifest import CategoryMap, UnknownCategory, check_manifest
from engine.model import Manifest, Risk


class Malformed(Exception):
    """A request body that is not a manifest at all. Distinct from a manifest
    the engine refuses: one is a caller mistake, the other is the check working.
    """


# What a refusal says when the engine dropped a risk for a reason this layer
# cannot restate. Today it is unreachable: the engine drops a risk under exactly
# the one condition that makes CategoryMap.key_for raise, so re-asking always
# yields a sentence. It exists so that adding a SECOND drop reason to the engine
# degrades the explanation rather than crashing the endpoint that gives it.
#
# One copy, imported by runs.py, because the pre-flight and the enforcement must
# refuse identically — a second literal here is a rule with two copies.
DROPPED_WITHOUT_REASON = "the engine dropped this category"
# A transport byte ceiling does not bound list fan-out. Each accepted risk is
# compared with the library and can become a permanent run_decision row.
MAX_RISKS = 200


def manifest_from(body: dict) -> Manifest:
    """A request body, as the engine's own type.

    Deliberately strict about shape and silent about content: whether a
    justification is any good is not ours to judge, but a risk with no category
    is not a risk.
    """
    if not isinstance(body, dict):
        raise Malformed("a manifest is expected")

    vendor = str(body.get("vendor") or "").strip()
    if not vendor:
        raise Malformed("a manifest names the vendor it was assembled for")

    raw = body.get("risks")
    if not isinstance(raw, list) or not raw:
        raise Malformed("a manifest carries at least one risk")
    if len(raw) > MAX_RISKS:
        raise Malformed(
            f"a manifest carries at most {MAX_RISKS} risks; split the work")

    risks = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise Malformed(f"risk {index} is not a risk")
        category = str(entry.get("category") or "").strip()
        if not category:
            raise Malformed(f"risk {index} names no category")
        risks.append(Risk(
            category=category,
            severity=str(entry.get("severity") or "Standard"),
            justification=str(entry.get("justification") or ""),
        ))

    return Manifest(
        vendor=vendor,
        value=body.get("value"),
        source=str(body.get("source") or "llm"),
        risks=tuple(risks),
    )


def categories_for(request) -> CategoryMap:
    """The category enum, read as the caller.

    `CategoryMap.from_rows` takes exactly what `select key, label from
    cw.category` returns — the engine's own constructor, given the doorway's own
    rows.
    """
    return CategoryMap.from_rows(
        request.rows("select key, label from cw.category order by key"))


@dataclass(frozen=True)
class Answer:
    status: int
    body: dict

    @property
    def refused(self) -> bool:
        return self.status >= 400


def check(db: Database, caller: Caller, body: dict | None) -> Answer:
    """Run a manifest past the engine, and record it if the engine refuses.

    The engine's own sentence is what comes back. `CategoryMap.key_for` raises
    `UnknownCategory` carrying the words the engine wrote for exactly this
    situation, and those words are passed through unchanged — the same rule the
    database's refusals already follow, one layer further in. Rewording them here
    would replace an accurate sentence with a vaguer one and then commit us to
    keeping the vaguer one in step with the engine forever.
    """
    try:
        manifest = manifest_from(body or {})
    except Malformed as wrong:
        return Answer(400, {"error": "refused", "reason": str(wrong),
                            "kind": "rejected"})

    try:
        with db.as_person(caller.person, caller.role) as request:
            categories = categories_for(request)

            try:
                checked = check_manifest(manifest, categories)
            except UnknownCategory as refused_outright:
                # The empty-enum case. The engine fails closed rather than
                # passing the model straight through, which is the whole reason
                # it exists — and it says so in its own words.
                _record(request, manifest, [], str(refused_outright),
                        accepted=False)
                return Answer(409, {
                    "error": "refused", "reason": str(refused_outright),
                    "kind": "unknown_category", "dropped": []})

            if not checked.dropped:
                _record(request, manifest, [], "every category is in the library",
                        accepted=True, coerced=checked.coerced)

            if checked.dropped:
                # Ask the engine to say why, one category at a time, rather than
                # writing a sentence of our own.
                reasons = []
                for risk in checked.dropped:
                    try:
                        categories.key_for(risk.category)
                    except UnknownCategory as unknown:
                        reasons.append(str(unknown))

                # `reasons` is non-empty only because the engine drops a risk
                # under exactly the condition that makes key_for raise. That
                # coupling is real today and undocumented, and the day a second
                # drop reason is added to the engine, an unguarded reasons[0]
                # would raise IndexError and answer "the service failed" — on
                # the path whose whole job is to explain a refusal.
                first = reasons[0] if reasons else DROPPED_WITHOUT_REASON

                _record(request, manifest, list(checked.dropped), first,
                        accepted=False)
                return Answer(409, {
                    "error": "refused",
                    "reason": first,
                    "kind": "unknown_category",
                    "dropped": [risk.category for risk in checked.dropped],
                    "reasons": reasons,
                })

    except psycopg.Error as error:
        # The caller may not read the library, or may not record. Either is the
        # database refusing, and it says so itself.
        database_said: Refused = classify(error)
        return Answer(database_said.status, database_said.as_body())

    return Answer(200, {
        "vendor": checked.vendor,
        "source": checked.source,
        "risks": [{"category": risk.category, "severity": risk.severity,
                   "justification": risk.justification}
                  for risk in checked.risks],
        "dropped": [],
        # Severities the engine rewrote on the way in, with the original
        # claim. An accepted manifest is not necessarily an untouched one,
        # and the screen must be able to say so.
        "coerced": [{"category": risk.category, "claimed": risk.severity}
                    for risk in checked.coerced],
    })


# EVERY CHECK IS RECORDED, NOT ONLY THE REFUSALS, AND THAT IS DELIBERATE.
#
# Recording only refusals looked smaller and was wrong in two ways.
#
# The permission model came out incoherent. Reading `cw.category` is granted to
# every role — a category is the library's STRUCTURE, not its content — so a
# viewer could submit a manifest and be told it was fine, while the same viewer
# submitting an invented category would hit the audit chain, which viewers cannot
# write, and get a refusal about the audit chain instead of the engine's. Two
# different answers to "may I use this endpoint", decided by whether the model
# happened to hallucinate.
#
# Recording both puts the decision back where it belongs: `cw.audit_event`'s
# insert grant decides who may submit a manifest, uniformly, and the database
# says so in its own words. A viewer is refused either way, before the engine's
# answer is ever reported.
#
# And the record is better for it. What crossed the trust boundary, and what the
# engine made of it, is exactly the thing an auditor would want and could not
# reconstruct from refusals alone.


def _record(request, manifest: Manifest, dropped: list[Risk], reason: str,
            *, accepted: bool, coerced: tuple[Risk, ...] = ()) -> None:
    """Write what the engine decided into the audit chain.

    An unrecorded refusal is invisible to the audit record, and the point of the
    check is that the record shows it happened. Attribution is structural, as
    everywhere else: `cw.audit` reads the actor off the connection, and there is
    nowhere here to put a different name.

    This runs inside the request's own transaction, so a role that may not write
    to the chain cannot check a manifest either — which is the point. See the
    note above `_record`.
    """
    event = "manifest_checked" if accepted else "manifest_refused"
    request.write(
        # Bound, not interpolated — see the note at the identical writer in
        # runs.py.
        "select cw.audit(%(event)s, %(vendor)s, %(payload)s::jsonb)",
        {
            "event": event,
            "vendor": manifest.vendor,
            "payload": json.dumps({
                "reason": reason,
                "dropped": [risk.category for risk in dropped],
                # Severities the engine rewrote, with the model's own claim —
                # the chain must show an accepted manifest was not untouched.
                "coerced": [{"category": risk.category, "claimed": risk.severity}
                            for risk in coerced],
                "risks_submitted": len(manifest.risks),
                "source": manifest.source,
                "checked_by": "engine.manifest.check_manifest",
            }),
        },
    )
