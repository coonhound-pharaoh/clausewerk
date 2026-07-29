"""The category vocabulary, and the trust boundary a manifest has to cross.

Two jobs, one table behind both — `cw.category`, which gives every category a
`key` ('data') and a `label` ('Data Privacy').

**Translation.** Manifests and clause rows carry the *label*; every storage
column carries the *key* (`cw.clause.category_key`, `cw.snapshot_ladder_rung
.category_key`, `cw.run_decision.category_key`). So the engine has to translate
in both directions, and both directions are load-bearing: the label is what a
manifest matches on, and the label is what the snapshot fingerprint hashes. Emit
the label where a key belongs and the insert fails; read the key back where a
label belongs and the fingerprint changes, so a stored run stops reproducing.
Neither is a thing that should be left to a convention.

**The boundary.** A manifest is the only thing that crosses from a language
model into the deterministic core (ADR-0001). A model asked for categories will
occasionally return one nobody defined. If that reaches resolution it produces
"no clause available in Ledger" — which reads, in the one report the system is
prized for, as a *library coverage gap*: Legal is told to go write a clause for
a category that does not exist. A hallucination must never be able to
masquerade as a gap in our own library.

So unknown categories are **dropped**, and *dropped* is recorded as its own
state, distinct from "no clause available". The distinction is the point: one is
a fault in the model's output, the other is a fault in the library, and they go
to different people.

Where this must be called: **at the trust boundary, by whatever assembles a
`Manifest` from model output — before `resolve()` ever sees it.** Today that is
the service layer that will call `engine.resolution.resolve`; the prototype does
the equivalent in `prototype/v3/app/engine.jsx:45-58`. `resolve()` deliberately
does not call it itself, because resolution is a pure function of a manifest and
a snapshot and must not silently rewrite its own input.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Iterable, Mapping

from .model import HIGH, STANDARD, Manifest


class UnknownCategory(KeyError):
    """A category label or key that `cw.category` does not define."""


@dataclass(frozen=True)
class CategoryMap:
    """The category enum, and the label ↔ key translation, from `cw.category`.

    Built from rows rather than hard-coded: the enum lives in the database and a
    second copy in Python would be free to drift from it.
    """

    label_to_key: Mapping[str, str]
    key_to_label: Mapping[str, str]

    @staticmethod
    def from_rows(rows: Iterable[Mapping[str, Any]]) -> "CategoryMap":
        """`select key, label from cw.category`."""
        label_to_key, key_to_label = {}, {}
        for r in rows:
            label_to_key[r["label"]] = r["key"]
            key_to_label[r["key"]] = r["label"]
        return CategoryMap(label_to_key, key_to_label)

    def knows(self, label: str) -> bool:
        return label in self.label_to_key

    def key_for(self, label: str) -> str:
        try:
            return self.label_to_key[label]
        except KeyError:
            raise UnknownCategory(
                f"no category is labelled {label!r} — a row cannot be stored "
                f"against a category the registry does not define") from None

    def label_for(self, key: str) -> str:
        try:
            return self.key_to_label[key]
        except KeyError:
            raise UnknownCategory(
                f"no category has key {key!r} — a stored run cannot be rebuilt "
                f"against a category the registry no longer defines") from None


def check_manifest(manifest: Manifest, categories: CategoryMap) -> Manifest:
    """Validate a manifest against the category enum. Returns a new manifest.

    - A risk in an unknown category is removed from `risks` and recorded in
      `dropped`. It never reaches resolution, so it can never appear as a
      coverage gap; and it is not lost, so nobody has to guess later why the
      model's output and the run record disagree on how many risks there were.
    - Severity is coerced to the two-value enum, matched on meaning rather
      than spelling, and every real rewrite is recorded in `coerced` with the
      original claim. A *real* rewrite is one that changes the MEANING of what
      the model said. Fixing spelling or case — 'HIGH' stored as 'High' — is
      not one, and is deliberately absent from `coerced`: recording it would
      bury the rewrites that did change meaning in noise. This is pinned by
      `test_manifest.py::test_high_is_matched_on_meaning_not_spelling`, so a
      reader who expects case changes here should read that test before
      changing the code. 'Baseline' is synthetic — the always-include pass emits
      it — and a manifest claiming it is as much a hallucination as an
      invented category, so it lands in `coerced` too.

    Fails closed on an empty enum, the same way the prototype does: with no
    vocabulary to check against, nothing can be validated, and passing the model
    straight through is exactly the thing this function exists to prevent.
    """
    if not categories.label_to_key:
        raise UnknownCategory(
            "the category enum is empty — refusing to validate a manifest "
            "against nothing, which would let every category through unchecked")

    kept, dropped, coerced = [], [], []
    for risk in manifest.risks:
        if not categories.knows(risk.category):
            dropped.append(risk)
            continue
        # Severity is matched on its MEANING, not its spelling. The old exact
        # comparison meant a model that started writing 'HIGH' after a prompt
        # update would silently downgrade every high risk to Standard wording
        # — invisibly, since the run record showed Standard as though the
        # model had said so. Anything that is recognisably neither High nor
        # Standard is still coerced DOWN, because coercing an unrecognised
        # severity *up* would let a model block a contract by typo — but the
        # coercion is recorded in `coerced` the way category drops are
        # recorded in `dropped`, with the original claim intact.
        claimed = str(risk.severity).strip().lower()
        if claimed == HIGH.lower():
            severity = HIGH
        elif claimed == STANDARD.lower():
            severity = STANDARD
        else:
            severity = STANDARD
            coerced.append(risk)
        kept.append(risk if severity == risk.severity else replace(risk, severity=severity))

    return replace(manifest, risks=tuple(kept), dropped=tuple(dropped),
                   coerced=tuple(coerced))
