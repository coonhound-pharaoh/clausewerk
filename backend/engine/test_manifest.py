"""The trust boundary, and the category vocabulary behind it.

The one thing this has to prove: a category the model invented must never reach
the coverage report as a gap in our library. Those are different faults with
different owners, and the report the system is prized for is the one place the
confusion would do real damage.
"""

import pytest

from engine.manifest import CategoryMap, UnknownCategory, check_manifest
from engine.model import BASELINE, HIGH, STANDARD, Manifest, Risk
from engine.resolution import resolve
from engine.snapshot import Snapshot
from engine.test_run import CATEGORIES, LADDERS, library


def manifest(*risks):
    return Manifest(vendor="Northwind Analytics", source="llm", risks=tuple(risks))


# ── Translation ────────────────────────────────────────────────────────────


def test_the_map_translates_both_ways():
    assert CATEGORIES.key_for("Data Privacy") == "data"
    assert CATEGORIES.label_for("data") == "Data Privacy"


def test_an_undefined_label_is_refused_not_invented():
    with pytest.raises(UnknownCategory):
        CATEGORIES.key_for("Quantum Indemnity")


def test_an_undefined_key_is_refused_on_the_way_back():
    """A stored run whose category has since been deleted must fail visibly
    rather than rebuild into something that never existed."""
    with pytest.raises(UnknownCategory):
        CATEGORIES.label_for("quantum")


# ── The boundary ───────────────────────────────────────────────────────────


def test_a_hallucinated_category_is_dropped():
    checked = check_manifest(
        manifest(Risk("Data Privacy", HIGH, "EU PII"),
                 Risk("Quantum Indemnity", HIGH, "invented")),
        CATEGORIES)
    assert [r.category for r in checked.risks] == ["Data Privacy"]


def test_a_dropped_risk_is_recorded_as_dropped_not_discarded():
    """`dropped` is its own state. Silently removing it would leave the run
    record and the model's output disagreeing on how many risks there were,
    with nothing to say why."""
    checked = check_manifest(
        manifest(Risk("Quantum Indemnity", HIGH, "invented")), CATEGORIES)
    assert checked.risks == ()
    assert [r.category for r in checked.dropped] == ["Quantum Indemnity"]


def test_a_hallucinated_category_never_becomes_a_coverage_gap():
    """The whole point, stated as the failure it prevents.

    Unchecked, an invented category resolves to "No clause available in
    Ledger" — indistinguishable, in the coverage report, from a real hole in
    the library. Legal would be told to go and write a clause for a category
    nobody defined.
    """
    snap = Snapshot.build(library(), LADDERS)
    raw = manifest(Risk("Data Privacy", HIGH, "EU PII"),
                   Risk("Quantum Indemnity", HIGH, "invented"))

    unchecked = resolve(raw, snap)
    assert any(d.risk.category == "Quantum Indemnity" and d.unresolved
               for d in unchecked.decisions), "the defect this boundary exists to stop"

    checked = resolve(check_manifest(raw, CATEGORIES), snap)
    assert not any(d.risk.category == "Quantum Indemnity" for d in checked.decisions)


def test_a_real_gap_still_reports_as_a_gap():
    """Control. The boundary must not silence coverage reporting — Insurance is
    a defined category with no clause, and that is a genuine library gap."""
    snap = Snapshot.build(library(), LADDERS)
    checked = check_manifest(manifest(Risk("Insurance", HIGH, "no clause exists")),
                             CATEGORIES)
    res = resolve(checked, snap)
    gaps = [d for d in res.decisions if d.unresolved and d.risk.category == "Insurance"]
    assert len(gaps) == 1
    assert gaps[0].reason == "No clause available in Ledger"


def test_severity_is_coerced_to_the_two_value_enum():
    checked = check_manifest(
        manifest(Risk("Data Privacy", "CATASTROPHIC", "shouting"),
                 Risk("Dispute Resolution", HIGH, "cross-border")),
        CATEGORIES)
    assert [r.severity for r in checked.risks] == [STANDARD, HIGH]


def test_baseline_in_a_manifest_is_coerced_too():
    """'Baseline' is synthetic — the always-include pass emits it. A manifest
    claiming it is as much a hallucination as an invented category."""
    checked = check_manifest(manifest(Risk("Data Privacy", BASELINE)), CATEGORIES)
    assert checked.risks[0].severity == STANDARD


def test_a_clean_manifest_passes_through_unchanged():
    clean = manifest(Risk("Data Privacy", HIGH, "EU PII"),
                     Risk("Dispute Resolution", STANDARD, "cross-border"))
    checked = check_manifest(clean, CATEGORIES)
    assert checked.risks == clean.risks
    assert checked.dropped == ()
    assert checked.vendor == clean.vendor and checked.source == clean.source


def test_an_empty_enum_fails_closed():
    """With no vocabulary there is nothing to validate against, so everything
    would pass — the one outcome this function exists to prevent."""
    with pytest.raises(UnknownCategory, match="empty"):
        check_manifest(manifest(Risk("Anything", HIGH)), CategoryMap.from_rows([]))
