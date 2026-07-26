"""Library snapshots.

ARCHITECTURE.md §5 requires that "given a manifest and a library snapshot ID,
resolution must be reproducible forever", and CLA §9 adds that the ladder
configuration must be pinned too — ladders change which clauses are *eligible*,
so pinning the clause library alone is not enough.

A snapshot here is the frozen library plus the frozen ladders, identified by a
hash of its own content. That makes reproducibility checkable rather than
merely asserted: if someone hands you a snapshot ID and a manifest, you can
prove the decisions you get are the decisions they got.

The snapshot holds **every** clause version with its state, not only the
selectable ones. Resolution does the filtering. Keeping the excluded versions
lets a decision say "there were three candidates and all had lapsed", which is
a different library problem from "there were none".
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from typing import Iterable, Optional

from .model import Clause, Ladder


def _canonical(obj) -> str:
    """Stable JSON: sorted keys, no incidental whitespace, dates as ISO."""
    def default(o):
        if isinstance(o, date):
            return o.isoformat()
        raise TypeError(f"cannot hash {type(o).__name__}")

    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=default)


def content_hash(obj) -> str:
    return hashlib.sha256(_canonical(obj).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Snapshot:
    """An immutable library state. Identified by the hash of its contents."""

    clauses: tuple[Clause, ...]
    ladders: tuple[Ladder, ...] = ()
    taken_on: Optional[date] = None
    snapshot_id: str = ""

    @staticmethod
    def build(
        clauses: Iterable[Clause],
        ladders: Iterable[Ladder] = (),
        taken_on: Optional[date] = None,
    ) -> "Snapshot":
        # Sorted so that two snapshots of the same library hash identically
        # regardless of the order rows came back from the database.
        cl = tuple(sorted(clauses, key=lambda c: (c.clause_id, c.version)))
        ld = tuple(sorted(ladders, key=lambda l: (l.category, l.severity)))
        payload = {
            "clauses": [
                {
                    "ref": c.ref,
                    "category": c.category,
                    "severity": c.severity,
                    "body": c.body,
                    "state": c.state,
                    "selectable": c.selectable,
                    "always_include": c.always_include,
                    "framework_section": c.framework_section,
                    # Pinned because conflict rules match on tags: retagging a
                    # clause changes which contracts are blocked, so a snapshot
                    # that ignored tags would not reproduce a validation result.
                    "tags": sorted(c.tags),
                }
                for c in cl
            ],
            "ladders": [
                {
                    "category": l.category,
                    "severity": l.severity,
                    "rungs": list(l.rungs),
                    "floor_rung": l.floor_rung,
                    "status": l.status,
                }
                for l in ld
            ],
        }
        return Snapshot(cl, ld, taken_on, content_hash(payload))

    # ── Lookups ────────────────────────────────────────────────────────────
    def selectable(self) -> tuple[Clause, ...]:
        return tuple(c for c in self.clauses if c.selectable)

    def in_category(self, category: str, *, include_unselectable: bool = False):
        return tuple(
            c
            for c in self.clauses
            if c.category == category and (include_unselectable or c.selectable)
        )

    def by_ref(self, ref: str) -> Optional[Clause]:
        for c in self.clauses:
            if c.ref == ref:
                return c
        return None

    def ladder_for(self, category: str, severity: str) -> Optional[Ladder]:
        for l in self.ladders:
            if l.category == category and l.severity == severity:
                return l
        return None
