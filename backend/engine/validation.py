"""The validation engine.

Pairwise contradiction checks over an assembled decision set (ARCHITECTURE.md
§2.5). Pure, like resolution: same decisions and same rule set, same findings,
forever.

Rules are **data, not code**, because attorneys author them (open question 5).
The predicate grammar has exactly three primitives and no logic of its own:

    all_present         every tag must appear somewhere in the contract
    none_present        none of these tags may appear
    conflicting_values  more than one distinct value inside one tag namespace

They are ANDed. Between them they express all four rules in the specification —
mixed governing law and dispute seat, incompatible liability carve-outs, an SLA
paired with a soft exit, and regulated data with no cyber cover.

Anything counsel cannot say with these needs a new primitive, added
deliberately. That friction is the design: an unbounded grammar would be a
programming language with no gate in front of it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping, Optional

from .model import HIGH, Decision
from .snapshot import content_hash

PRIMITIVES = ("all_present", "none_present", "conflicting_values")


class RuleGrammarError(ValueError):
    """A predicate used something outside the permitted grammar."""


@dataclass(frozen=True)
class ConflictRule:
    rule_id: str
    version: int
    name: str
    severity: str
    title: str
    detail: str
    predicate: Mapping[str, object]
    approved_by: str = ""

    @property
    def ref(self) -> str:
        return f"{self.rule_id}@v{self.version}"

    def __post_init__(self) -> None:
        unknown = set(self.predicate) - set(PRIMITIVES)
        if unknown:
            raise RuleGrammarError(
                f"{self.ref}: predicate uses unsupported key(s) {sorted(unknown)}; "
                f"permitted: {list(PRIMITIVES)}"
            )
        if not self.predicate:
            # Would match every contract and block everything.
            raise RuleGrammarError(f"{self.ref}: predicate is empty")

        # The SHAPE of each value, mirroring 0004's predicate_grammar constraint
        # — the grammar is enforced in both layers on purpose (CLA §4A.4), and
        # until this check existed the two layers disagreed: 0004 checked
        # shapes, this checked keys, and the migration carries a note saying
        # so. Shape is not pedantry here. A string where a list belongs is
        # iterated character by character and never matches — a HIGH rule that
        # silently fails OPEN — and an empty list holds vacuously, a rule that
        # fires on every contract in the system. Both are wrong quietly, in
        # opposite directions, which is the worst combination.
        for key in ("all_present", "none_present"):
            if key not in self.predicate:
                continue
            tags = self.predicate[key]
            if isinstance(tags, str) or not isinstance(tags, (list, tuple)):
                raise RuleGrammarError(
                    f"{self.ref}: {key} must be a list of tags, not "
                    f"{type(tags).__name__}"
                )
            if not tags:
                raise RuleGrammarError(
                    f"{self.ref}: {key} is empty — a rule that asks nothing "
                    f"fires on everything"
                )
            if not all(isinstance(t, str) and t.strip() for t in tags):
                raise RuleGrammarError(
                    f"{self.ref}: {key} must contain only non-empty tag strings"
                )
        if "conflicting_values" in self.predicate:
            ns = self.predicate["conflicting_values"]
            if not isinstance(ns, str) or not ns.strip():
                raise RuleGrammarError(
                    f"{self.ref}: conflicting_values must name one tag "
                    f"namespace, as a non-empty string"
                )


@dataclass(frozen=True)
class Finding:
    rule: str
    #: The exact rule version that raised this. A rule change alters which
    #: contracts are blocked, so a finding that cannot name its version is
    #: unauditable.
    rule_version: str
    severity: str
    title: str
    detail: str
    refs: tuple[str, ...] = ()


@dataclass(frozen=True)
class RuleSet:
    """The rules in force, pinned by a hash of their contents."""

    rules: tuple[ConflictRule, ...]
    ruleset_id: str = ""

    @staticmethod
    def build(rules: Iterable[ConflictRule]) -> "RuleSet":
        rs = tuple(sorted(rules, key=lambda r: (r.rule_id, r.version)))
        payload = [
            {
                "ref": r.ref,
                "severity": r.severity,
                "predicate": {k: r.predicate[k] for k in sorted(r.predicate)},
            }
            for r in rs
        ]
        return RuleSet(rs, content_hash(payload))


@dataclass(frozen=True)
class ValidationResult:
    findings: tuple[Finding, ...]
    ruleset_id: str
    #: True when the contract may proceed. Only HIGH findings gate — matching
    #: the specification, and unlike the prototype, which blocked on any finding.
    gate_open: bool = True
    overridden: bool = False

    @property
    def blocking(self) -> tuple[Finding, ...]:
        return tuple(f for f in self.findings if f.severity == HIGH)


# ── Tag extraction ─────────────────────────────────────────────────────────


def _tags_in(decisions: Iterable[Decision]) -> dict[str, list[str]]:
    """Map every tag present in the contract to the clause refs carrying it."""
    found: dict[str, list[str]] = {}
    for d in decisions:
        if d.selected is None:
            continue
        for tag in getattr(d.selected, "tags", ()) or ():
            found.setdefault(tag, []).append(d.selected.ref)
    return found


def _namespace(tag: str) -> Optional[str]:
    return tag.split(":", 1)[0] if ":" in tag else None


# ── Evaluation ─────────────────────────────────────────────────────────────


def _evaluate(rule: ConflictRule, tags: Mapping[str, list[str]]) -> Optional[tuple[str, ...]]:
    """Return the clause refs implicating this rule, or None if it does not fire.

    Every primitive present must hold; they are ANDed.
    """
    refs: list[str] = []

    required = rule.predicate.get("all_present") or []
    for tag in required:
        if tag not in tags:
            return None
        refs.extend(tags[tag])

    forbidden = rule.predicate.get("none_present") or []
    for tag in forbidden:
        if tag in tags:
            return None

    ns = rule.predicate.get("conflicting_values")
    if ns:
        values = {t for t in tags if _namespace(t) == ns}
        if len(values) < 2:
            return None
        for t in sorted(values):
            refs.extend(tags[t])

    # A rule with only `none_present` fires when the contract omits something.
    # That is legitimate — "regulated data and no cyber cover" is exactly that
    # shape — but on its own it says nothing about which clauses are at fault.
    return tuple(dict.fromkeys(refs))


def validate(
    decisions: Iterable[Decision], ruleset: RuleSet, *, overridden: bool = False
) -> ValidationResult:
    decisions = tuple(decisions)
    tags = _tags_in(decisions)

    findings: list[Finding] = []
    for rule in ruleset.rules:
        refs = _evaluate(rule, tags)
        if refs is None:
            continue
        findings.append(
            Finding(
                rule=rule.name,
                rule_version=rule.ref,
                severity=rule.severity,
                title=rule.title,
                detail=rule.detail,
                refs=refs,
            )
        )

    blocking = [f for f in findings if f.severity == HIGH]
    return ValidationResult(
        findings=tuple(findings),
        ruleset_id=ruleset.ruleset_id,
        gate_open=(not blocking) or overridden,
        overridden=overridden,
    )
