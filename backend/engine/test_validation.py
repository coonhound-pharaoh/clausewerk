"""Validation engine tests.

The four rules exercised here are the ones named in ARCHITECTURE.md §2.5,
expressed entirely in the three-primitive grammar — evidence that the grammar
is sufficient for the documented cases without being a programming language.
"""

import pytest

from engine.model import HIGH, STANDARD, Clause, Decision, Risk
from engine.snapshot import Snapshot
from engine.validation import (
    ConflictRule,
    RuleGrammarError,
    RuleSet,
    validate,
)


def clause(cid, cat, *tags, sev=HIGH):
    return Clause(clause_id=cid, version=1, category=cat, severity=sev,
                  title=cid, body=f"Body of {cid}.", tags=tuple(tags))


def decide(*clauses):
    return [Decision(risk=Risk(c.category, c.severity), selected=c) for c in clauses]


# ── The four specified rules, as data ──────────────────────────────────────

GOVERNING_LAW = ConflictRule(
    "GL-001", 1, "Mixed governing law / dispute seat", HIGH,
    "Governing law and dispute forum name different jurisdictions",
    "The agreement is governed by one jurisdiction but disputes are seated in another.",
    {"conflicting_values": "jurisdiction"}, "R. Vance")

LIABILITY = ConflictRule(
    "LC-001", 1, "Incompatible liability carve-outs", HIGH,
    "Indemnity uncaps claims the liability cap does not mirror",
    "The indemnity is uncapped while the liability clause caps damages.",
    {"all_present": ["indemnity:uncapped", "liability:capped"]}, "R. Vance")

SLA_EXIT = ConflictRule(
    "SL-001", 1, "SLA vs termination mismatch", STANDARD,
    "High uptime commitment paired with a soft convenience exit",
    "A 99.9% uptime commitment sits alongside a 30-day termination for convenience.",
    {"all_present": ["uptime:99_9", "termination:convenience-30d"]}, "R. Vance")

REGULATED_DATA = ConflictRule(
    "IN-001", 1, "Regulated data without cyber cover", HIGH,
    "Regulated data processing with no cyber-liability insurance",
    "The agreement processes regulated data but carries only baseline insurance.",
    {"all_present": ["data:regulated"], "none_present": ["insurance:cyber"]}, "R. Vance")

ALL_RULES = RuleSet.build([GOVERNING_LAW, LIABILITY, SLA_EXIT, REGULATED_DATA])


# ── Grammar ────────────────────────────────────────────────────────────────


def test_unknown_predicate_key_is_refused():
    with pytest.raises(RuleGrammarError, match="unsupported key"):
        ConflictRule("XX-001", 1, "n", HIGH, "t", "d",
                     {"any_of": ["a"], "all_present": ["b"]}, "R")


def test_empty_predicate_is_refused():
    """An empty predicate would fire on every contract and block everything."""
    with pytest.raises(RuleGrammarError, match="empty"):
        ConflictRule("XX-002", 1, "n", HIGH, "t", "d", {}, "R")


def test_the_grammar_expresses_every_documented_rule():
    for r in (GOVERNING_LAW, LIABILITY, SLA_EXIT, REGULATED_DATA):
        assert set(r.predicate) <= {"all_present", "none_present", "conflicting_values"}


# ── Rule 1 · conflicting values in a namespace ─────────────────────────────


def test_mixed_jurisdictions_are_caught():
    d = decide(clause("GL-S-048", "Governing Law", "jurisdiction:ny"),
               clause("DR-S-044", "Dispute Resolution", "jurisdiction:london"))
    r = validate(d, ALL_RULES)
    assert [f.rule_version for f in r.findings] == ["GL-001@v1"]
    assert set(r.findings[0].refs) == {"GL-S-048@v1", "DR-S-044@v1"}


def test_matching_jurisdictions_are_fine():
    d = decide(clause("GL-S-048", "Governing Law", "jurisdiction:ny"),
               clause("DR-S-044", "Dispute Resolution", "jurisdiction:ny"))
    assert validate(d, ALL_RULES).findings == ()


def test_a_single_jurisdiction_does_not_conflict_with_itself():
    d = decide(clause("GL-S-048", "Governing Law", "jurisdiction:ny"))
    assert validate(d, ALL_RULES).findings == ()


# ── Rule 2 · all_present ───────────────────────────────────────────────────


def test_incompatible_liability_carve_outs():
    d = decide(clause("ID-H-031", "Indemnity", "indemnity:uncapped"),
               clause("LC-S-009", "Liability Cap", "liability:capped"))
    r = validate(d, ALL_RULES)
    assert [f.rule_version for f in r.findings] == ["LC-001@v1"]


def test_one_half_of_a_pair_does_not_fire():
    d = decide(clause("LC-S-009", "Liability Cap", "liability:capped"))
    assert validate(d, ALL_RULES).findings == ()


# ── Rule 4 · all_present plus none_present ─────────────────────────────────


def test_regulated_data_without_cyber_cover_fires():
    d = decide(clause("DP-H-014", "Data Privacy", "data:regulated"),
               clause("IN-S-005", "Insurance", "insurance:baseline"))
    r = validate(d, ALL_RULES)
    assert [f.rule_version for f in r.findings] == ["IN-001@v1"]


def test_adding_cyber_cover_clears_it():
    """none_present is what lets a rule fire on an ABSENCE, and stop firing
    once the gap is filled."""
    d = decide(clause("DP-H-014", "Data Privacy", "data:regulated"),
               clause("IN-H-006", "Insurance", "insurance:cyber"))
    assert validate(d, ALL_RULES).findings == ()


# ── Gate behaviour ─────────────────────────────────────────────────────────


def test_only_high_severity_gates():
    """The prototype blocked on any finding; the specification says High only."""
    d = decide(clause("SL-H-001", "SLA & Uptime", "uptime:99_9"),
               clause("TM-S-002", "Termination", "termination:convenience-30d"))
    r = validate(d, ALL_RULES)
    assert len(r.findings) == 1 and r.findings[0].severity == STANDARD
    assert r.gate_open, "a Standard finding must not block"
    assert r.blocking == ()


def test_a_high_finding_closes_the_gate():
    d = decide(clause("ID-H-031", "Indemnity", "indemnity:uncapped"),
               clause("LC-S-009", "Liability Cap", "liability:capped"))
    r = validate(d, ALL_RULES)
    assert not r.gate_open
    assert len(r.blocking) == 1


def test_an_override_opens_the_gate_and_is_recorded_as_such():
    d = decide(clause("ID-H-031", "Indemnity", "indemnity:uncapped"),
               clause("LC-S-009", "Liability Cap", "liability:capped"))
    r = validate(d, ALL_RULES, overridden=True)
    assert r.gate_open and r.overridden
    assert r.blocking, "the findings remain — an override does not erase them"


def test_a_clean_contract_opens_the_gate():
    d = decide(clause("DP-H-014", "Data Privacy", "data:regulated"),
               clause("IN-H-006", "Insurance", "insurance:cyber"))
    r = validate(d, ALL_RULES)
    assert r.findings == () and r.gate_open and not r.overridden


# ── Provenance and determinism ─────────────────────────────────────────────


def test_every_finding_cites_its_rule_version():
    """A rule change alters which contracts are blocked, so a finding that
    cannot name its version is unauditable."""
    d = decide(clause("GL-S-048", "Governing Law", "jurisdiction:ny"),
               clause("DR-S-044", "Dispute Resolution", "jurisdiction:london"))
    for f in validate(d, ALL_RULES).findings:
        assert "@v" in f.rule_version


def test_publishing_a_new_rule_version_changes_the_ruleset_id():
    v2 = ConflictRule("GL-001", 2, GOVERNING_LAW.name, HIGH, "t", "d",
                      {"conflicting_values": "jurisdiction"}, "R. Vance")
    assert RuleSet.build([v2]).ruleset_id != RuleSet.build([GOVERNING_LAW]).ruleset_id


def test_changing_a_predicate_changes_the_ruleset_id():
    tweaked = ConflictRule("LC-001", 1, LIABILITY.name, HIGH, "t", "d",
                           {"all_present": ["indemnity:uncapped"]}, "R. Vance")
    assert RuleSet.build([tweaked]).ruleset_id != RuleSet.build([LIABILITY]).ruleset_id


def test_ruleset_id_is_order_independent():
    a = RuleSet.build([GOVERNING_LAW, LIABILITY])
    b = RuleSet.build([LIABILITY, GOVERNING_LAW])
    assert a.ruleset_id == b.ruleset_id


def test_validation_is_deterministic():
    d = decide(clause("GL-S-048", "Governing Law", "jurisdiction:ny"),
               clause("DR-S-044", "Dispute Resolution", "jurisdiction:london"))
    assert validate(d, ALL_RULES).findings == validate(d, ALL_RULES).findings


def test_result_is_bound_to_the_ruleset_that_produced_it():
    assert validate([], ALL_RULES).ruleset_id == ALL_RULES.ruleset_id


# ── Interaction with resolution ────────────────────────────────────────────


def test_unresolved_decisions_carry_no_tags_and_are_skipped():
    """A null selection has no clause, so it contributes nothing to validation
    rather than raising."""
    d = [Decision(risk=Risk("Insurance", HIGH), selected=None, reason="none")]
    assert validate(d, ALL_RULES).findings == ()


def test_retagging_a_clause_changes_the_snapshot_id():
    a = Snapshot.build([clause("DP-H-014", "Data Privacy", "data:regulated")])
    b = Snapshot.build([clause("DP-H-014", "Data Privacy", "data:public")])
    assert a.snapshot_id != b.snapshot_id, (
        "rules match on tags, so a retag changes which contracts block and must "
        "change the snapshot")
