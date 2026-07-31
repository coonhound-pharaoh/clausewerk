"""Security invariants for the local development deployment."""

from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1]


def test_the_development_database_is_published_only_to_loopback():
    """Committed credentials must never be reachable from another machine."""
    compose = (BACKEND / "docker-compose.yml").read_text(encoding="utf-8")

    assert '"127.0.0.1:5432:5432"' in compose
    assert '\n      - "5432:5432"' not in compose
