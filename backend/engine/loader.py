"""Binding the engine to the registry.

The engine is deliberately database-free — it is a pure function over a
snapshot, which is what makes a result reproducible forever. This module is the
only place that knows both sides, and it holds the two queries that turn the
registry into a snapshot.

It takes plain row dictionaries rather than a live connection, so the mapping is
testable without a database and works with whatever driver the service layer
ends up using.

Note the join to ``cw.category``: clauses store ``category_key`` while manifests
carry the category *label*, and the label is the string the trust boundary
validates against. Getting this backwards would silently resolve nothing.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Iterable, Mapping, Optional

from .model import Clause, Ladder
from .snapshot import Snapshot
from .validation import ConflictRule, RuleSet

CLAUSE_SQL = """
select v.clause_id,
       v.version,
       c.label as category,          -- the label, not the key: manifests use labels
       v.severity,
       v.title,
       v.body,
       v.state,
       v.selectable,
       v.always_include,
       v.expires_on,
       v.provenance_gap,
       cl.framework_section,
       coalesce((select array_agg(t.tag order by t.tag)
                 from cw.clause_tag t
                 where t.clause_id = v.clause_id and t.version = v.version),
                '{}'::text[]) as tags
from cw.clause_version_state v
join cw.clause    cl on cl.clause_id = v.clause_id
join cw.category  c  on c.key = cl.category_key
order by v.clause_id, v.version
"""

RULE_SQL = """
select rule_id, version, name, severity, title, detail, predicate, approved_by
from cw.active_conflict_rule
order by rule_id
"""

LADDER_SQL = """
select c.label as category,
       h.severity,
       h.status,
       array_agg(r.clause_id || '@v' || r.version order by r.rung) as rungs,
       min(r.rung) filter (where r.is_floor)                       as floor_rung
from cw.ladder_health h
join cw.ladder_rung r on r.ladder_id = h.ladder_id
join cw.category    c on c.key = h.category_key
group by c.label, h.severity, h.status
order by c.label, h.severity
"""


def _as_date(v: Any) -> Optional[date]:
    if v is None or isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def clause_from_row(row: Mapping[str, Any]) -> Clause:
    return Clause(
        clause_id=row["clause_id"],
        version=int(row["version"]),
        category=row["category"],
        severity=row["severity"],
        title=row["title"],
        body=row["body"],
        state=row["state"],
        selectable=bool(row["selectable"]),
        always_include=bool(row.get("always_include", False)),
        framework_section=row.get("framework_section"),
        expires_on=_as_date(row.get("expires_on")),
        provenance_gap=bool(row.get("provenance_gap", False)),
        tags=tuple(row.get("tags") or ()),
    )


def rule_from_row(row: Mapping[str, Any]) -> ConflictRule:
    """Map a rule row. Raises RuleGrammarError if the predicate is outside the
    permitted grammar — the database constrains it too, so a failure here means
    the two definitions have drifted apart."""
    predicate = row["predicate"]
    if isinstance(predicate, str):
        predicate = json.loads(predicate)
    return ConflictRule(
        rule_id=row["rule_id"],
        version=int(row["version"]),
        name=row["name"],
        severity=row["severity"],
        title=row["title"],
        detail=row["detail"],
        predicate=predicate,
        approved_by=row.get("approved_by", ""),
    )


def build_ruleset(rule_rows: Iterable[Mapping[str, Any]]) -> RuleSet:
    return RuleSet.build(rule_from_row(r) for r in rule_rows)


def ladder_from_row(row: Mapping[str, Any]) -> Ladder:
    floor = row.get("floor_rung")
    rungs = tuple(row["rungs"])
    return Ladder(
        category=row["category"],
        severity=row["severity"],
        rungs=rungs,
        # A floorless ladder is a configuration error, and cw.ladder_health
        # already reports it as one. Represent the missing floor as -1 so that
        # every descent from any rung is "below the floor" and escalates —
        # failing closed rather than treating the last rung as a floor.
        floor_rung=-1 if floor is None else int(floor),
        status=row.get("status", "intact"),
    )


def build_snapshot(
    clause_rows: Iterable[Mapping[str, Any]],
    ladder_rows: Iterable[Mapping[str, Any]] = (),
    taken_on: Optional[date] = None,
) -> Snapshot:
    """Turn registry rows into a pinned, content-addressed snapshot."""
    return Snapshot.build(
        clauses=[clause_from_row(r) for r in clause_rows],
        ladders=[ladder_from_row(r) for r in ladder_rows],
        taken_on=taken_on,
    )
