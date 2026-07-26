"""Loader tests — the mapping between the registry and the engine."""

from datetime import date

from engine.loader import build_snapshot, clause_from_row, ladder_from_row
from engine.model import HIGH, STANDARD
from engine.resolution import descend

CLAUSE_ROWS = [
    {"clause_id": "DP-H-014", "version": 1, "category": "Data Privacy", "severity": "High",
     "title": "GDPR", "body": "Notify within 24 hours.", "state": "active",
     "selectable": True, "always_include": False, "framework_section": None,
     "expires_on": "2027-01-01", "provenance_gap": False},
    {"clause_id": "DP-H-052", "version": 1, "category": "Data Privacy", "severity": "High",
     "title": "48h", "body": "Notify within 48 hours.", "state": "active",
     "selectable": True, "always_include": False, "framework_section": None,
     "expires_on": None, "provenance_gap": True},
    {"clause_id": "SC-S-004", "version": 2, "category": "Security", "severity": "Standard",
     "title": "Lapsed", "body": "Old security terms.", "state": "expired",
     "selectable": False, "always_include": False, "framework_section": None,
     "expires_on": date(2024, 6, 1), "provenance_gap": False},
]

LADDER_ROWS = [
    {"category": "Data Privacy", "severity": "High", "status": "intact",
     "rungs": ["DP-H-014@v1", "DP-H-052@v1"], "floor_rung": 1},
]


def test_clause_row_maps_every_field():
    c = clause_from_row(CLAUSE_ROWS[0])
    assert c.ref == "DP-H-014@v1"
    assert c.category == "Data Privacy"
    assert c.selectable and c.state == "active"
    assert c.expires_on == date(2027, 1, 1)


def test_dates_accept_both_strings_and_dates():
    assert clause_from_row(CLAUSE_ROWS[0]).expires_on == date(2027, 1, 1)
    assert clause_from_row(CLAUSE_ROWS[2]).expires_on == date(2024, 6, 1)


def test_provenance_gap_survives_the_mapping():
    """A clause with no dates must stay flagged all the way to the engine, or
    the warning quietly disappears between layers."""
    assert clause_from_row(CLAUSE_ROWS[1]).provenance_gap is True


def test_unselectable_rows_are_carried_not_dropped():
    """The snapshot keeps lapsed versions so a decision can say 'there were
    candidates and all had expired' rather than 'there were none'."""
    snap = build_snapshot(CLAUSE_ROWS, LADDER_ROWS)
    assert len(snap.clauses) == 3
    assert len(snap.selectable()) == 2
    assert len(snap.in_category("Security", include_unselectable=True)) == 1
    assert len(snap.in_category("Security")) == 0


def test_ladder_row_maps_and_descends():
    snap = build_snapshot(CLAUSE_ROWS, LADDER_ROWS)
    d = descend(snap, "Data Privacy", HIGH, "DP-H-014@v1")
    assert not d.escalate and d.accepted.ref == "DP-H-052@v1"


def test_a_floorless_ladder_fails_closed():
    """cw.ladder_health reports floorless as a configuration error. The loader
    must not quietly treat the last rung as a floor — every descent escalates."""
    row = dict(LADDER_ROWS[0], floor_rung=None, status="floorless")
    assert ladder_from_row(row).floor_rung == -1
    snap = build_snapshot(CLAUSE_ROWS, [row])
    d = descend(snap, "Data Privacy", HIGH, "DP-H-014@v1")
    assert d.escalate


def test_snapshot_id_is_stable_across_equivalent_reads():
    a = build_snapshot(CLAUSE_ROWS, LADDER_ROWS)
    b = build_snapshot(list(reversed(CLAUSE_ROWS)), LADDER_ROWS)
    assert a.snapshot_id == b.snapshot_id


def test_the_queries_select_the_label_not_the_key():
    """Clauses store category_key; manifests carry the label. If the loader
    returned the key, every risk would resolve to nothing."""
    assert "c.label as category" in __import__("engine.loader", fromlist=["CLAUSE_SQL"]).CLAUSE_SQL
    assert "c.label as category" in __import__("engine.loader", fromlist=["LADDER_SQL"]).LADDER_SQL
